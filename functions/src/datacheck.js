// The Withings data check: what the free API actually returns for your account, per measure type, plus
// the subscription, webhook latency and backfill. The app turns this into the per-metric ✅ / ⛔ / ➖ / ⏳
// list and the "safe to cancel?" verdict (js/withings/check.js). Values here are the latest of each type,
// for display on your own screen only; nothing is logged.
import { P } from './paths.js';
import { ALL_TYPES, decodeValue } from './meastypes.js';
import { WithingsError } from './withings-api.js';

const MAX_PAGES = 60;

function addGroup(acc, g) {
  for (const m of g.measures || []) {
    const t = m.type;
    const a = acc[t] || (acc[t] = { count: 0, first: null, last: null, last_value: null, positions: [], attrib: {} });
    const at = Number(g.date) * 1000;
    a.count++;
    if (a.first == null || at < a.first) a.first = at;
    if (a.last == null || at >= a.last) { a.last = at; a.last_value = decodeValue(m.value, m.unit); }
    if (m.position != null && !a.positions.includes(m.position)) a.positions.push(m.position);
    a.attrib[g.attrib ?? 'x'] = (a.attrib[g.attrib ?? 'x'] || 0) + 1;
  }
}

async function allPages(api, token, types) {
  const acc = {};
  let offset;
  let pages = 0;
  let groups = 0;
  do {
    const body = await api.getmeas(token, { meastypes: types, startdate: 0, enddate: Math.floor(Date.now() / 1000) + 3600, offset });
    for (const g of body.measuregrps || []) { addGroup(acc, g); groups++; }
    offset = body.more ? body.offset : undefined;
  } while (offset != null && ++pages < MAX_PAGES);
  return { acc, groups, truncated: offset != null };
}

/** Run the check. Returns the report (also saved on the status doc as data_check). */
export async function runDataCheck({ db, api, uid, token, webhookUrl, now = () => Date.now() }) {
  const report = { ran_at: new Date(now()).toISOString(), devices: [], types: {}, rejected: [], groups: 0, truncated: false, subscription: null };

  try {
    const dev = await api.getdevice(token);
    report.devices = (dev.devices || []).map((d) => ({ type: d.type || null, model: d.model || null, model_id: d.model_id ?? null, last_session: d.last_session_date ? new Date(d.last_session_date * 1000).toISOString() : null }));
  } catch (e) {
    report.devices_error = String(e.status || 'x');
  }

  // All types in one go; if Withings rejects the list (an unknown type such as 140), ask one type at a time.
  let acc = {};
  try {
    const r = await allPages(api, token, ALL_TYPES);
    acc = r.acc; report.groups = r.groups; report.truncated = r.truncated;
  } catch (e) {
    if (!(e instanceof WithingsError) || e.transient || e.invalidToken) throw e;
    for (const t of ALL_TYPES) {
      try {
        const r = await allPages(api, token, [t]);
        if (r.acc[t]) acc[t] = r.acc[t];
        report.truncated = report.truncated || r.truncated;
      } catch (e2) {
        if (e2 instanceof WithingsError && (e2.transient || e2.invalidToken)) throw e2;
        report.rejected.push(t);
      }
    }
  }
  for (const [t, a] of Object.entries(acc)) {
    report.types[t] = { ...a, first: a.first ? new Date(a.first).toISOString() : null, last: a.last ? new Date(a.last).toISOString() : null };
  }

  try {
    const n = await api.notifyList(token, 1);
    const profiles = n.profiles || [];
    const base = webhookUrl.split('?')[0];
    const ours = profiles.find((p) => String(p.callbackurl || '').split('?')[0] === base);
    report.subscription = {
      present: !!ours,
      key_ok: !!ours && ours.callbackurl === webhookUrl,
      count: profiles.length,
      callback: ours ? `${base}?k=••••` : null,
      expires: ours && ours.expires ? new Date(ours.expires * 1000).toISOString() : null,
    };
  } catch (e) {
    report.subscription = { present: null, error: String(e.status || 'x') };
  }

  // Forge's side: how many groups are stored (count, oldest) and the webhook latency history.
  const status = (await db.doc(P.status(uid)).get()).data() || {};
  const stored = await db.collection(P.bodyCol(uid)).count().get();
  report.stored_groups = stored.data().count;
  report.backfill = status.backfill || null;
  report.latencies_s = status.latencies_s || [];
  report.last_notify_at = status.last_notify_at || null;
  report.last_sync_at = status.last_sync_at || null;
  report.model = status.model || (report.devices[0] && report.devices[0].model) || null;

  await db.doc(P.status(uid)).set({ data_check: report }, { merge: true });
  return report;
}

/** Save the current report into the history (max 12), with a label ("subscribed", "after cancelling"…). */
export async function saveReport({ db, uid, label, now = () => Date.now() }) {
  const ref = db.doc(P.status(uid));
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.exists ? s.data() : {};
    if (!d.data_check) throw Object.assign(new Error('no report'), { code: 'failed-precondition' });
    const entry = { ...d.data_check, label: String(label || '').slice(0, 40) || 'report', saved_at: new Date(now()).toISOString() };
    const history = [...(d.data_check_history || []), entry].slice(-12);
    tx.set(ref, { data_check_history: history }, { merge: true });
    return { saved: history.length };
  });
}
