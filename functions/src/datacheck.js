// The Withings data check: what the free API actually returns for your account, per measure type, plus
// the subscription, webhook latency and backfill. The app turns this into the per-metric ✅ / ⛔ / ➖ / ⏳
// list and the "safe to cancel?" verdict (js/withings/check.js). Values here are the latest of each type,
// for display on your own screen only; nothing is logged.
import { P } from './paths.js';
import { ALL_TYPES, decodeValue } from './meastypes.js';
import { WithingsError } from './withings-api.js';
import { yearWindow, walkDone, yearTotals } from './sync.js';

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

/**
 * Walk the whole account the same way the backfill does: calendar years newest first, real
 * startdate/enddate, offset paging inside each year, stopping after the same empty-years rule. Counts
 * every group, per measure type and per year (weigh-ins = groups with meastype 1).
 */
export async function walkHistory(api, token, { now = () => Date.now(), maxPages = 400 } = {}) {
  const acc = {};
  const years = {};
  let groups = 0;
  let pages = 0;
  let listRejected = false;
  const end = Math.floor(now() / 1000) + 3600;
  for (let y = new Date(now()).getUTCFullYear(); ; y--) {
    const w = yearWindow(y, end);
    let offset;
    let n = 0;
    let wn = 0;
    do {
      let body;
      try {
        body = await api.getmeas(token, { meastypes: listRejected ? undefined : ALL_TYPES, startdate: w.start, enddate: w.end, offset });
      } catch (e) {
        if (!(e instanceof WithingsError) || e.transient || e.invalidToken || listRejected) throw e;
        listRejected = true; // Withings refused our type list: ask for every type instead
        body = await api.getmeas(token, { startdate: w.start, enddate: w.end, offset });
      }
      for (const g of body.measuregrps || []) {
        addGroup(acc, g);
        groups++;
        n++;
        if ((g.measures || []).some((m) => m.type === 1)) wn++;
      }
      offset = body.more && (body.measuregrps || []).length ? body.offset : undefined;
      if (++pages >= maxPages) return { acc, groups, years, truncated: true, listRejected };
    } while (offset != null);
    years[y] = { p0: { g: n, w: wn } };
    if (walkDone(years, y)) break;
  }
  return { acc, groups, years, truncated: false, listRejected };
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

  const walk = await walkHistory(api, token, { now });
  const acc = walk.acc;
  report.groups = walk.groups;
  report.truncated = walk.truncated;
  report.types_list_rejected = walk.listRejected;
  report.years_withings = yearTotals(walk.years); // { 2010: { groups, weighins }, … }
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
  report.stored_groups = stored.data().count; // every doc, tombstones included (for reference)
  // The number to compare with weight.csv: weigh-in groups. Withings' side is how many groups carried a
  // weight (meastype 1); Forge's side is non-deleted body docs with a weight.
  // Weigh-ins you deleted or marked "Not me" are accounted for (Withings still lists them); only ones the
  // nightly reconcile removed (deleted_by: 'withings') count as missing.
  const weightDocs = await db.collection(P.bodyCol(uid)).select('deleted', 'deleted_by', 'measured_at', 'metrics.weight_kg').get();
  const accounted = weightDocs.docs.map((d) => d.data()).filter((x) => x.metrics && x.metrics.weight_kg != null && (!x.deleted || x.deleted_by !== 'withings'));
  report.stored_weight_groups = accounted.length;
  report.stored_not_me = accounted.filter((x) => x.deleted).length;
  const yf = {};
  for (const x of accounted) { const y = String(x.measured_at || '').slice(0, 4); if (y) yf[y] = (yf[y] || 0) + 1; }
  report.years_forge = yf; // weigh-ins per year in Forge (UTC year, like the Withings walk)
  report.withings_weight_groups = report.types[1] ? report.types[1].count : 0;
  report.last_reconcile = status.last_reconcile || null;
  report.backfill = status.backfill || null;
  report.latencies_s = status.latencies_s || [];
  report.last_notify_at = status.last_notify_at || null;
  report.last_sync_at = status.last_sync_at || null;
  report.model = status.model || (report.devices[0] && report.devices[0].model) || null;

  await db.doc(P.status(uid)).set({ data_check: report }, { mergeFields: ['data_check'] }); // replace the old report whole
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
