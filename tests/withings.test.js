// Client side of the Withings integration: the data-check classification and verdict, report comparison,
// body-metric formatting and series, exports. (Server logic is tested in functions/test.)
import { test, eq, assert, near } from './harness.js';
import { classify, verdict, compare, CHECK_METRICS, median } from '../js/withings/check.js';
import { fmtMetric, metricSeries, dailySeries, latestAndChange, heightM, periodAverage, KEY_OF_TYPE } from '../js/withings/body.js';
import { bodyRows } from '../js/export-body.js';

const T = (count, last, value, extra = {}) => ({ count, first: '2024-01-05T12:00:00Z', last, last_value: value, positions: [], attrib: { 0: count }, ...extra });
const bodyCompReport = (over = {}) => ({
  model: 'Body Comp',
  types: {
    1: T(900, '2026-10-10T11:00:00Z', 82.3), 4: T(3, '2025-01-01T00:00:00Z', 1.78), 5: T(880, '2026-10-10T11:00:00Z', 64.7), 6: T(880, '2026-10-10T11:00:00Z', 21.4),
    8: T(880, '2026-10-10T11:00:00Z', 17.6), 11: T(700, '2026-10-10T11:00:00Z', 64), 76: T(880, '2026-10-10T11:00:00Z', 61.5),
    77: T(880, '2026-10-10T11:00:00Z', 45.1), 88: T(880, '2026-10-10T11:00:00Z', 3.19),
  },
  rejected: [140],
  groups: 905, stored_groups: 905,
  backfill: { done: true, from: '2024-01-05T12:00:00Z' },
  subscription: { present: true, key_ok: true },
  latencies_s: [40, 70, 55, 120, 61, 90, 48],
  ...over,
});

test('data check: every A.1 metric gets a row; received rows show which meastype codes came back', () => {
  const rows = classify(bodyCompReport());
  eq(rows.length, CHECK_METRICS.length);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  eq(by.weight.state, 'received');
  eq(by.weight.codes.join(), '1');
  eq(by.weight.count, 900);
  eq(by.weight.last_value, 82.3);
  eq(by.muscle_mass.codes.join(), '76');
});

test('data check: Body Comp → visceral fat/BMR/vascular age missing = ⛔ not on the free API; segmental/ECG/SpO₂ = ➖; nerve score = ⏳', () => {
  const by = Object.fromEntries(classify(bodyCompReport()).map((r) => [r.key, r]));
  eq(by.visceral_fat.state, 'not_on_api');
  eq(by.bmr.state, 'not_on_api');
  eq(by.vascular_age.state, 'not_on_api');
  assert(/rejected type 140/.test(by.vascular_age.note), 'mentions the rejected code');
  eq(by.segmental.state, 'not_on_model');
  eq(by.ecg.state, 'not_on_model');
  eq(by.spo2.state, 'not_on_model');
  eq(by.water_split.state, 'not_on_model');
  eq(by.nerve_health.state, 'not_yet');
});

test('data check: segmental codes with positions are reported when they arrive; unknown model → not on API', () => {
  const r = bodyCompReport({ model: 'Body Scan', types: { 1: T(1, '2026-10-10T11:00:00Z', 80), 174: T(5, '2026-10-10T11:00:00Z', 2.1, { positions: [12, 2] }) } });
  const by = Object.fromEntries(classify(r).map((x) => [x.key, x]));
  eq(by.segmental.state, 'received');
  eq(by.segmental.codes.join(), '174');
  eq(by.segmental.positions.join(), '12,2');
  eq(by.visceral_fat.state, 'not_on_api');
  assert(/model unknown/.test(by.visceral_fat.note));
});

test('verdict: safe only with core metrics, finished backfill, subscription and 7 weigh-ins under ~5 min', () => {
  const ok = verdict(bodyCompReport());
  eq(ok.safe, true);
  assert(/Safe to cancel/.test(ok.text));
  assert(ok.decisions.includes('Visceral fat'), '⛔ metrics are decisions, not blockers');
  eq(ok.median_s, 61);
  eq(verdict(bodyCompReport({ latencies_s: [40, 50] })).safe, false);
  assert(verdict(bodyCompReport({ latencies_s: [40, 50] })).blockers.some((b) => /2 of 7/.test(b)));
  assert(verdict(bodyCompReport({ latencies_s: [900, 800, 700, 650, 640, 630, 620] })).blockers.some((b) => /min to arrive/.test(b)));
  assert(verdict(bodyCompReport({ backfill: { done: false } })).blockers.some((b) => /backfill/.test(b)));
  assert(verdict(bodyCompReport({ stored_groups: 800 })).blockers.some((b) => /800 of the 905/.test(b)));
  assert(verdict(bodyCompReport({ subscription: { present: false } })).blockers.some((b) => /notify/.test(b)));
  assert(verdict(bodyCompReport({ subscription: { present: true, key_ok: false } })).blockers.some((b) => /out of date/.test(b)));
  assert(verdict(bodyCompReport(), { csvRows: 1200 }).blockers.some((b) => /1200 rows/.test(b)));
  const noFat = bodyCompReport();
  delete noFat.types[6];
  assert(verdict(noFat).blockers.some((b) => /Body fat %/.test(b)));
  eq(verdict(null).safe, false);
  eq(median([3, 1, 2]), 2);
  eq(median([1, 2, 3, 4]), 2.5);
});

test('compare: "subscribed" vs "after cancelling" flags anything lost', () => {
  const before = bodyCompReport();
  const after = bodyCompReport();
  delete after.types[76];
  const c = Object.fromEntries(compare(before, after).map((x) => [x.key, x]));
  eq(c.muscle_mass.lost, true);
  eq(c.weight.lost, false);
  eq(c.weight.changed, false);
});

test('meastype codes ↔ metric keys cover every code the data check asks for', () => {
  for (const m of CHECK_METRICS) {
    if (['segmental', 'ecg'].includes(m.key)) continue;
    for (const t of m.types) assert(KEY_OF_TYPE[t], `code ${t}`);
  }
});

// ---------- body metrics ----------
const doc = (id, at, metrics, extra = {}) => ({ id, measured_at: at, day: at.slice(0, 10), metrics, source: 'withings', deleted: false, ...extra });

test('body: formatting in your units', () => {
  eq(fmtMetric('weight_kg', 82.3, 'imperial'), '181.4 lb');
  eq(fmtMetric('weight_kg', 82.3, 'metric'), '82.3 kg');
  eq(fmtMetric('fat_ratio_pct', 21.42, 'imperial'), '21.4 %');
  eq(fmtMetric('heart_pulse_bpm', 63.6, 'imperial'), '64 bpm');
  eq(fmtMetric('bmr_kcal', 1834.4, 'metric'), '1,834 kcal');
  eq(fmtMetric('height_m', 1.78, 'imperial'), '5′10″');
  eq(fmtMetric('weight_kg', null, 'metric'), '—');
});

test('body: series skip deleted and unconfirmed readings; derived BMI/FFMI/FMI use height; earliest of the day', () => {
  const docs = [
    doc('w_1', '2026-10-01T11:00:00Z', { weight_kg: 82, fat_mass_kg: 18, fat_free_mass_kg: 64 }),
    doc('w_2', '2026-10-01T22:00:00Z', { weight_kg: 83 }),
    doc('w_3', '2026-10-02T11:00:00Z', { weight_kg: 60 }, { needs_review: true }),
    doc('w_4', '2026-10-03T11:00:00Z', { weight_kg: 81 }, { deleted: true }),
    doc('w_5', '2026-10-05T11:00:00Z', { weight_kg: 81.5, height_m: 1.8 }),
  ];
  const h = heightM(docs, { heightCm: 175 });
  eq(h, 1.8, 'scale height beats the profile');
  eq(heightM([], { heightCm: 175 }), 1.75);
  const w = dailySeries(metricSeries(docs, 'weight_kg'));
  eq(w.map((p) => p.v).join(), '82,81.5');
  near(metricSeries(docs, 'bmi', { height: 1.8 })[0].v, 82 / 3.24, 1e-9);
  near(metricSeries(docs, 'ffmi', { height: 1.8 })[0].v, 64 / 3.24, 1e-9);
  near(metricSeries(docs, 'fmi', { height: 1.8 })[0].v, 18 / 3.24, 1e-9);
  const lc = latestAndChange(metricSeries(docs, 'weight_kg'), 3);
  eq(lc.last.v, 81.5);
  eq(lc.change, 81.5 - 83, 'vs the latest reading on or before 3 days earlier');
  eq(periodAverage(w, '2026-10-01', '2026-10-06'), 81.75);
  eq(periodAverage(w, '2027-01-01', '2027-02-01'), null);
});

test('export: one CSV row per measurement group, a column per metric, deleted ones left out', () => {
  const rows = bodyRows([
    doc('w_2', '2026-10-02T11:00:00Z', { weight_kg: 82, fat_ratio_pct: 21 }, { grpid: 2 }),
    doc('w_1', '2026-10-01T11:00:00Z', { weight_kg: 83 }, { grpid: 1, needs_review: true }),
    doc('w_3', '2026-10-03T11:00:00Z', { weight_kg: 81 }, { deleted: true }),
  ]);
  eq(rows.length, 2);
  eq(rows[0].id, 'w_1');
  eq(rows[0].needs_review, 'yes');
  eq(rows[1].fat_ratio_pct, 21);
  eq(rows[1].muscle_mass_kg, '');
});
