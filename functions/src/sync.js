// Writing Withings measure groups into Firestore, idempotently:
//   - one body_measures doc per grpid (w_<grpid>); the same group twice is one doc, and an unchanged group
//     (same raw hash and modified time) is no write at all;
//   - a weights mirror (w_<grpid>) so the weight chart, trend and targets work unchanged;
//   - TOMBSTONES WIN: a doc YOU deleted in Forge is never written again, for either collection, whatever
//     Withings sends later. Docs the 90-day reconcile marked deleted (deleted_by: 'withings') come back if
//     Withings sends them again, so a bad Withings answer can never lose data for good.
// Plus the three ways measures arrive: incremental (webhook / Sync now / maintenance), one backfill page,
// and the 90-day reconcile that notices groups deleted in the Withings app.
import { P } from './paths.js';
import { ALL_TYPES } from './meastypes.js';
import { WithingsError } from './withings-api.js';
import { decodeGroup, weightMirror, docId } from './decode.js';

const CHUNK = 150; // groups per transaction (≤ 300 reads, ≤ 300 writes)
const iso = (ms) => new Date(ms).toISOString();

function standard(uid, id, nowIso, existing) {
  return existing
    ? { id, user_id: uid, created_at: existing.created_at || nowIso, updated_at: nowIso, source: 'withings', deleted: false }
    : { id, user_id: uid, created_at: nowIso, updated_at: nowIso, source: 'withings', deleted: false };
}

/**
 * Write decoded groups. Returns { created, updated, unchanged, tombstoned, newIds }.
 *   device: { model } for the model field; now: ms.
 */
export async function applyGroups(db, uid, groups, { device = null, tz = null, now = Date.now() } = {}) {
  const out = { created: 0, updated: 0, unchanged: 0, tombstoned: 0, newIds: [] };
  const nowIso = iso(now);
  for (let i = 0; i < groups.length; i += CHUNK) {
    const chunk = groups.slice(i, i + CHUNK).map((g) => decodeGroup(g, { device, tz }));
    await db.runTransaction(async (tx) => {
      const bodyRefs = chunk.map((b) => db.doc(P.body(uid, docId(b.grpid))));
      const weightRefs = chunk.map((b) => db.doc(P.weight(uid, docId(b.grpid))));
      const snaps = await tx.getAll(...bodyRefs, ...weightRefs);
      const bodySnaps = snaps.slice(0, chunk.length);
      const weightSnaps = snaps.slice(chunk.length);
      const res = { created: 0, updated: 0, unchanged: 0, tombstoned: 0, newIds: [] };
      chunk.forEach((b, k) => {
        const id = docId(b.grpid);
        const bs = bodySnaps[k];
        const prev = bs.exists ? bs.data() : null;
        if (prev && prev.deleted === true && prev.deleted_by !== 'withings') { res.tombstoned++; return; } // you deleted it: leave both alone
        const restoring = !!(prev && prev.deleted === true); // only reconcile deletions get here
        const same = !restoring && prev && prev.raw_hash === b.raw_hash && prev.w_modified === b.w_modified;
        if (same) res.unchanged++;
        else {
          // Keep your "that's me / not me" decision across later edits in Withings.
          const reviewed = prev && prev.reviewed_at ? { needs_review: prev.needs_review, reviewed_at: prev.reviewed_at } : {};
          tx.set(bodyRefs[k], { ...standard(uid, id, nowIso, prev), ...b, ...reviewed, deleted_by: null, deleted_at: null });
          if (prev) res.updated++;
          else { res.created++; res.newIds.push(id); }
        }
        // Weights mirror: first sight, or when Withings' modified time / the value changes. Never un-delete.
        const w = weightMirror(b);
        const ws = weightSnaps[k];
        const wprev = ws.exists ? ws.data() : null;
        if (!w || (wprev && wprev.deleted === true && wprev.deleted_by !== 'withings')) return; // never un-delete yours
        if (wprev && !wprev.deleted && wprev.w_modified === b.w_modified && wprev.kg === w.kg && wprev.day === w.day) return;
        const keepReview = wprev && wprev.reviewed_at ? { review: wprev.review, reviewed_at: wprev.reviewed_at } : {};
        tx.set(weightRefs[k], { ...standard(uid, id, nowIso, wprev), ...w, w_modified: b.w_modified, ...keepReview, deleted_by: null, deleted_at: null });
      });
      Object.assign(out, {
        created: out.created + res.created, updated: out.updated + res.updated, unchanged: out.unchanged + res.unchanged,
        tombstoned: out.tombstoned + res.tombstoned, newIds: [...out.newIds, ...res.newIds],
      });
    });
  }
  return out;
}

/**
 * getmeas with our full type list; if Withings rejects the list itself (a permanent, non-token error, e.g.
 * an unknown type), ask again without `meastypes`, which returns every type the app may read.
 */
export async function getmeasSafe(api, token, params) {
  try {
    return await api.getmeas(token, { ...params, meastypes: ALL_TYPES });
  } catch (e) {
    if (!(e instanceof WithingsError) || e.transient || e.invalidToken) throw e;
    return api.getmeas(token, { ...params, meastypes: undefined });
  }
}

/**
 * Incremental sync from the stored cursor (`lastupdate`, a few seconds of overlap), all pages.
 * Records last_sync_at and, for weigh-ins that are new and recent, the end-to-end latency.
 */
export async function incrementalSync({ db, api, uid, token, now = () => Date.now(), maxPages = 25, reason = 'sync' }) {
  const privSnap = await db.doc(P.priv(uid)).get();
  const priv = privSnap.exists ? privSnap.data() : {};
  const statusSnap = await db.doc(P.status(uid)).get();
  const status = statusSnap.exists ? statusSnap.data() : {};
  const device = status.model ? { model: status.model } : null;
  const since = Math.max(0, Number(priv.cursor || 0) - 5);
  let offset;
  let pages = 0;
  let cursor = null;
  const totals = { created: 0, updated: 0, unchanged: 0, tombstoned: 0, newIds: [], groups: [] };
  do {
    const body = await getmeasSafe(api, token, { lastupdate: since, offset });
    if (cursor == null) cursor = body.updatetime || Math.floor(now() / 1000);
    const groups = body.measuregrps || [];
    const r = await applyGroups(db, uid, groups, { device, tz: body.timezone, now: now() });
    for (const k of ['created', 'updated', 'unchanged', 'tombstoned']) totals[k] += r[k];
    totals.newIds.push(...r.newIds);
    totals.groups.push(...groups.filter((g) => r.newIds.includes(docId(g.grpid))));
    offset = body.more ? body.offset : undefined;
    pages++;
  } while (offset != null && pages < maxPages);

  // Only move the cursor once every page is in; otherwise the next sync starts from the old one (overlap is harmless).
  if (offset == null) await db.doc(P.priv(uid)).update({ cursor });
  // Latency: received-to-stored time of weigh-ins that are new and less than 6 hours old.
  const t = now();
  const fresh = totals.groups.map((g) => Math.round((t - Number(g.date) * 1000) / 1000)).filter((s) => s >= 0 && s < 6 * 3600);
  const statusPatch = { last_sync_at: iso(t), last_sync_reason: reason };
  if (fresh.length) {
    const latest = Math.min(...fresh);
    statusPatch.last_latency_s = latest;
    statusPatch.latencies_s = [...(status.latencies_s || []), latest].slice(-7);
    statusPatch.last_weigh_in_at = iso(Math.max(...totals.groups.map((g) => Number(g.date) * 1000)));
  }
  await db.doc(P.status(uid)).set(statusPatch, { merge: true });
  return { ...totals, pages, cursor, groups: undefined };
}

/** One backfill page (whole history, oldest first by Withings' offset). Returns { more, offset, groups }. */
export async function backfillPage({ db, api, uid, token, offset = 0, now = () => Date.now() }) {
  const statusSnap = await db.doc(P.status(uid)).get();
  const status = statusSnap.exists ? statusSnap.data() : {};
  const body = await getmeasSafe(api, token, { startdate: 0, enddate: Math.floor(now() / 1000) + 3600, offset: offset || undefined });
  const groups = body.measuregrps || [];
  const r = await applyGroups(db, uid, groups, { device: status.model ? { model: status.model } : null, tz: body.timezone, now: now() });
  const prev = status.backfill || {};
  const dates = groups.map((g) => Number(g.date) * 1000);
  const from = Math.min(prev.from ? Date.parse(prev.from) : Infinity, ...dates);
  const to = Math.max(prev.to ? Date.parse(prev.to) : 0, ...dates);
  const more = !!body.more;
  await db.doc(P.status(uid)).set({
    backfill: {
      ...prev,
      done: !more,
      groups: (prev.groups || 0) + r.created + r.updated + r.unchanged + r.tombstoned,
      pages: (prev.pages || 0) + 1,
      offset: more ? body.offset : null,
      from: Number.isFinite(from) ? iso(from) : prev.from || null,
      to: to > 0 ? iso(to) : prev.to || null,
      updated_at: iso(now()),
      ...(more ? {} : { finished_at: iso(now()) }),
    },
  }, { merge: true });
  return { more, offset: more ? Number(body.offset) : null, groups: groups.length };
}

/**
 * Groups deleted in the Withings app don't send a notification. Compare the last 90 days (minus a day at
 * each edge) and tombstone Forge's copies that Withings no longer has. Only runs on a complete answer.
 */
export async function reconcile90({ db, api, uid, token, now = () => Date.now() }) {
  const end = Math.floor(now() / 1000);
  const start = end - 90 * 86400;
  const ids = new Set();
  let offset;
  let pages = 0;
  do {
    const body = await api.getmeas(token, { meastypes: [1], startdate: start, enddate: end, offset });
    for (const g of body.measuregrps || []) ids.add(docId(g.grpid));
    offset = body.more ? body.offset : undefined;
    if (++pages > 40) return { removed: 0, aborted: true }; // something's odd: don't delete on a partial list
  } while (offset != null);
  const lo = iso((start + 86400) * 1000);
  const hi = iso((end - 86400) * 1000);
  const snap = await db.collection(P.bodyCol(uid)).where('measured_at', '>=', lo).where('measured_at', '<=', hi).get();
  const candidates = snap.docs.filter((d) => { const x = d.data(); return x.source === 'withings' && !x.deleted && x.metrics && x.metrics.weight_kg != null; });
  const gone = candidates.filter((d) => !ids.has(d.id));
  // Safety: an empty or much shorter answer (a Withings change, a plan change, an outage that still says
  // "ok") must not wipe your history. Deleting in the Withings app is one or two at a time.
  if (gone.length && (ids.size === 0 || gone.length > Math.max(3, Math.ceil(candidates.length * 0.2)))) {
    return { removed: 0, aborted: true, suspicious: gone.length };
  }
  const t = iso(now());
  for (let i = 0; i < gone.length; i += 200) {
    const batch = db.batch();
    for (const d of gone.slice(i, i + 200)) {
      batch.update(db.doc(P.body(uid, d.id)), { deleted: true, deleted_at: t, deleted_by: 'withings', updated_at: t });
      const w = await db.doc(P.weight(uid, d.id)).get();
      if (w.exists && !w.data().deleted) batch.update(db.doc(P.weight(uid, d.id)), { deleted: true, deleted_at: t, deleted_by: 'withings', updated_at: t });
    }
    await batch.commit();
  }
  return { removed: gone.length };
}
