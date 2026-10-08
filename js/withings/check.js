// The Withings data check, client side: turns the server's per-measure-type report into one row per
// metric (✅ received · ⛔ not on the free API · ➖ not measured by your scale · ⏳ not measured yet), the
// "safe to cancel Withings+?" verdict, and a comparison of two saved reports. Pure; tested.

// Every metric the addendum's table A.1 lists, with the Withings meastype codes that carry it.
export const CHECK_METRICS = [
  { key: 'weight', label: 'Weight', types: [1], core: true },
  { key: 'height', label: 'Height', types: [4] },
  { key: 'fat_ratio', label: 'Body fat %', types: [6], core: true },
  { key: 'fat_mass', label: 'Fat mass', types: [8], core: true },
  { key: 'fat_free_mass', label: 'Fat-free mass', types: [5], core: true },
  { key: 'muscle_mass', label: 'Muscle mass', types: [76], core: true },
  { key: 'hydration', label: 'Water (hydration)', types: [77], core: true },
  { key: 'bone_mass', label: 'Bone mass', types: [88], core: true },
  { key: 'heart_pulse', label: 'Standing heart rate', types: [11], core: true },
  { key: 'visceral_fat', label: 'Visceral fat', types: [170] },
  { key: 'bmr', label: 'BMR', types: [226] },
  { key: 'metabolic_age', label: 'Metabolic age', types: [227] },
  { key: 'vascular_age', label: 'Vascular age', types: [155, 140] },
  { key: 'nerve_health', label: 'Nerve Health Score', types: [167], guided: true },
  { key: 'nerve_scores', label: 'Nerve detail (ESC / NRS)', types: [229, 196], guided: true },
  { key: 'pwv', label: 'Pulse wave velocity', types: [91] },
  { key: 'segmental', label: 'Segmental (arms, legs, torso)', types: [173, 174, 175] },
  { key: 'water_split', label: 'Water split (ECW / ICW)', types: [168, 169] },
  { key: 'spo2', label: 'Blood oxygen (SpO₂)', types: [54] },
  { key: 'ecg', label: 'ECG', types: [130, 135, 136, 137, 138] },
];

// What each scale model measures. Body Comp: no segmental data, no ECG, no SpO₂, no water split. It does
// record pulse wave velocity (vascular age is computed from it) and the nerve scores (Christian's own
// Withings export shows both).
export const MODEL_MEASURES = {
  'body comp': ['weight', 'height', 'fat_ratio', 'fat_mass', 'fat_free_mass', 'muscle_mass', 'hydration', 'bone_mass', 'heart_pulse', 'visceral_fat', 'bmr', 'metabolic_age', 'vascular_age', 'pwv', 'nerve_health', 'nerve_scores'],
};
const modelKey = (model) => {
  const m = String(model || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return Object.keys(MODEL_MEASURES).find((k) => m === k || m.replace(/ /g, '') === k.replace(/ /g, '')) || null;
};

/** The metric rows for a report: { key, label, state, codes, last, last_value, count, note }. */
export function classify(report) {
  const types = (report && report.types) || {};
  const mk = modelKey(report && report.model);
  const caps = mk ? new Set(MODEL_MEASURES[mk]) : null;
  const rejected = new Set((report && report.rejected) || []);
  return CHECK_METRICS.map((m) => {
    const got = m.types.filter((t) => types[t] && types[t].count > 0);
    if (got.length) {
      const latest = got.map((t) => ({ t, ...types[t] })).sort((a, b) => (a.last < b.last ? 1 : -1))[0];
      return {
        key: m.key, label: m.label, state: 'received', codes: got,
        count: got.reduce((n, t) => n + types[t].count, 0), first: got.map((t) => types[t].first).sort()[0],
        last: latest.last, last_value: latest.last_value, last_code: latest.t,
        positions: [...new Set(got.flatMap((t) => types[t].positions || []))],
      };
    }
    const codes = m.types;
    const rej = codes.filter((t) => rejected.has(t));
    const note = rej.length ? `Withings rejected type ${rej.join(', ')}` : '';
    if (caps && !caps.has(m.key)) return { key: m.key, label: m.label, state: 'not_on_model', codes, note };
    // Your scale measures it and the API sent nothing: that's ⛔, guided measurement or not.
    if (caps) return { key: m.key, label: m.label, state: 'not_on_api', codes, note: note || `Your scale measures this, but the free API sent nothing. Still free to view in the Withings app.${m.guided ? ' (If you’ve never done the guided measurement, do one and run the check again.)' : ''}` };
    if (m.guided) return { key: m.key, label: m.label, state: 'not_yet', codes, note: note || 'Needs a guided measurement on the scale. If you’ve done one and it still isn’t here, it isn’t on the free API.' };
    return { key: m.key, label: m.label, state: 'not_on_api', codes, note: note || 'Nothing returned (scale model unknown).' };
  });
}

export const STATE_LABEL = {
  received: '✅ Received',
  not_on_api: '⛔ Not on the free API',
  not_on_model: '➖ Not measured by your scale',
  not_yet: '⏳ Not measured yet',
};

export const median = (xs) => {
  const v = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * The "safe to cancel?" verdict. Blockers are things that would lose data or leave Forge blind after
 * Withings+ ends; ⛔ metrics are listed as decisions, not blockers (they stay free in the Withings app).
 *   csvRows: optional row count you typed from the Withings export, to compare with the backfill.
 */
export function verdict(report, { csvRows = null, minWeighIns = 7, maxMedianS = 300 } = {}) {
  if (!report) return { safe: false, blockers: ['Run the data check first.'], decisions: [] };
  const rows = classify(report);
  const blockers = [];
  const core = rows.filter((r) => CHECK_METRICS.find((m) => m.key === r.key).core);
  const missingCore = core.filter((r) => r.state !== 'received' && r.state !== 'not_on_model');
  if (missingCore.length) blockers.push(`Not received: ${missingCore.map((r) => r.label).join(', ')}.`);
  if (!report.backfill || !report.backfill.done) blockers.push('The history backfill hasn’t finished.');
  // Weigh-ins are what weight.csv lists (one row per weigh-in), so compare weigh-in groups, not every group.
  const wW = report.withings_weight_groups;
  const wF = report.stored_weight_groups;
  if (Number.isFinite(wW) && Number.isFinite(wF) && wF < wW) {
    blockers.push(`Forge has ${wF} of the ${wW} weigh-ins Withings returned.`);
  }
  if (csvRows != null && Number.isFinite(wF) && wF + 2 < csvRows) {
    blockers.push(`Your weight.csv has ${csvRows} rows; Forge has ${wF} weigh-ins. Check for manual entries before cancelling.`);
  }
  if (report.truncated) blockers.push('The check stopped early (very long history). Run it again.');
  const sub = report.subscription || {};
  if (!sub.present) blockers.push('Withings isn’t set to notify Forge of new weigh-ins.');
  else if (!sub.key_ok) blockers.push('The notification address is out of date. Disconnect and connect again.');
  const lat = report.latencies_s || [];
  const med = median(lat);
  if (lat.length < minWeighIns) blockers.push(`Webhook proof: ${lat.length} of ${minWeighIns} weigh-ins arrived on their own so far.`);
  else if (med > maxMedianS) blockers.push(`Weigh-ins take ${Math.round(med / 60)} min to arrive (median); want ≤ ${Math.round(maxMedianS / 60)} min.`);
  const decisions = rows.filter((r) => r.state === 'not_on_api').map((r) => r.label);
  const minutes = med == null ? null : Math.max(1, Math.round(med / 60));
  return {
    safe: blockers.length === 0,
    blockers,
    decisions,
    median_s: med,
    text: blockers.length
      ? `Not yet: ${blockers.length} thing${blockers.length === 1 ? '' : 's'} to fix first.`
      : `Safe to cancel: every metric your scale produces that the free API provides is flowing, and weigh-ins arrive in about ${minutes} min (median of ${lat.length}).`,
  };
}

/** What changed between two saved reports, per metric (state, count, last date). */
export function compare(a, b) {
  const ra = Object.fromEntries(classify(a).map((r) => [r.key, r]));
  const rb = Object.fromEntries(classify(b).map((r) => [r.key, r]));
  return CHECK_METRICS.map((m) => {
    const x = ra[m.key];
    const y = rb[m.key];
    const changed = x.state !== y.state || (x.count || 0) !== (y.count || 0);
    return { key: m.key, label: m.label, before: x.state, after: y.state, before_count: x.count || 0, after_count: y.count || 0, changed, lost: x.state === 'received' && y.state !== 'received' };
  });
}
