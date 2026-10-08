// Client side of the Withings integration: the data-check classification and verdict, report comparison,
// body-metric formatting and series, exports. (Server logic is tested in functions/test.)
import { test, eq, assert, near } from './harness.js';
import { classify, verdict, compare, CHECK_METRICS, median } from '../js/withings/check.js';
import { fmtMetric, metricSeries, dailySeries, latestAndChange, heightM, periodAverage, KEY_OF_TYPE, lastWeighInDay, compositionGap } from '../js/withings/body.js';
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
  groups: 960, stored_groups: 962, withings_weight_groups: 900, stored_weight_groups: 900,
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

test('data check: Body Comp → visceral fat/BMR/vascular age/PWV/nerve scores missing = ⛔ not on the free API; segmental/ECG/SpO₂ = ➖', () => {
  const by = Object.fromEntries(classify(bodyCompReport()).map((r) => [r.key, r]));
  eq(by.visceral_fat.state, 'not_on_api');
  eq(by.bmr.state, 'not_on_api');
  eq(by.vascular_age.state, 'not_on_api');
  assert(/rejected type 140/.test(by.vascular_age.note), 'mentions the rejected code');
  eq(by.segmental.state, 'not_on_model');
  eq(by.ecg.state, 'not_on_model');
  eq(by.spo2.state, 'not_on_model');
  eq(by.water_split.state, 'not_on_model');
  eq(by.pwv.state, 'not_on_api', 'Body Comp records PWV');
  eq(by.nerve_health.state, 'not_on_api', 'your scale measures it: ⛔, not ⏳');
  eq(by.nerve_scores.state, 'not_on_api');
  assert(/guided measurement/.test(by.nerve_health.note));
  const unknown = Object.fromEntries(classify({ ...bodyCompReport(), model: null }).map((r) => [r.key, r]));
  eq(unknown.nerve_health.state, 'not_yet', 'model unknown: maybe never measured');
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
  assert(verdict(bodyCompReport({ stored_weight_groups: 800 })).blockers.some((b) => /800 of the 900 weigh-ins/.test(b)));
  eq(verdict(bodyCompReport({ stored_groups: 3, groups: 999 })).safe, true, 'all-groups counts (HR-only, tombstones) are not compared');
  eq(verdict(bodyCompReport(), { csvRows: 901 }).safe, true, 'weight.csv rows vs Forge weigh-ins, within 2');
  assert(ok.decisions.includes('Pulse wave velocity') && ok.decisions.includes('Nerve Health Score'), 'decide before cancelling');
  assert(verdict(bodyCompReport({ subscription: { present: false } })).blockers.some((b) => /notify/.test(b)));
  assert(verdict(bodyCompReport({ subscription: { present: true, key_ok: false } })).blockers.some((b) => /out of date/.test(b)));
  assert(verdict(bodyCompReport(), { csvRows: 1200 }).blockers.some((b) => /weight.csv has 1200 rows; Forge has 900 weigh-ins/.test(b)));
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

test('body tiles: the latest weigh-in day, and how many recent weigh-ins came without body composition', () => {
  const comp = { weight_kg: 82, fat_ratio_pct: 21, fat_mass_kg: 17.2 };
  const docs = [
    doc('w_1', '2026-09-01T11:00:00Z', comp),
    doc('w_2', '2026-10-05T11:00:00Z', { weight_kg: 81.6 }),
    doc('w_3', '2026-10-07T11:00:00Z', { weight_kg: 81.4 }),
    doc('w_4', '2026-10-08T11:00:00Z', { heart_pulse_bpm: 62 }), // HR-only: not a weigh-in
    doc('w_5', '2026-10-09T11:00:00Z', { weight_kg: 60 }, { needs_review: true }),
  ];
  eq(lastWeighInDay(docs), '2026-10-07');
  eq(compositionGap(docs), 2);
  eq(compositionGap([...docs, doc('w_6', '2026-10-10T11:00:00Z', comp)]), 0);
  const fat = latestAndChange(metricSeries(docs, 'fat_ratio_pct'));
  assert(fat.last.day < lastWeighInDay(docs), 'so the fat tile says "as of Sep 1"');
});

// ---------- v0.4.1: family weigh-ins, weight.csv import, history by year ----------
import { suspects, reviewQueue, byDay, suggestCutoff, underCutoff, parseWeightCSV, planCsvImport, csvId } from '../js/withings/review.js';
import { yearRows, backfillYears } from '../js/withings/check.js';
import { dailyWeights } from '../js/weight/smoothing.js';

// A made-up shared scale shaped like a real one: you (~110 → ~93 kg over years), a child (12–23 kg) who weighs
// in more often than you for a whole year, and another adult (57–68 kg) now and then.
function familyScale() {
  const out = [];
  const add = (iso, kg, who) => out.push({ id: `w_${out.length}`, kg, day: iso.slice(0, 10), measured_at: iso, source: 'withings', who });
  for (let d = 0; d < 2400; d += 3) {
    const t = Date.UTC(2018, 0, 1) + d * 86400000;
    const iso = new Date(t + 7 * 3600000).toISOString();
    add(iso, 110 - (d / 2400) * 17 + ((d * 7) % 5) * 0.3, 'me');
    if (d > 100 && d < 600) { // a year where the child weighs in twice as often as you
      add(new Date(t + 18 * 3600000).toISOString(), 12 + (d / 600) * 5, 'kid');
      add(new Date(t + 19 * 3600000).toISOString(), 12.2 + (d / 600) * 5, 'kid');
    }
    if (d > 2100 && d < 2200) add(new Date(t + 20 * 3600000).toISOString(), 22 + ((d % 9) / 9), 'kid');
    if (d % 90 === 0 && d < 900) add(new Date(t + 21 * 3600000).toISOString(), 57 + (d % 11), 'adult');
  }
  return out;
}

test('family weigh-ins: every child/other-adult reading is a suspect, none of yours (even in the year the child dominates)', () => {
  const ws = familyScale();
  const ids = suspects(ws);
  const others = ws.filter((w) => w.who !== 'me');
  assert(others.length > 300, 'fixture has plenty of family readings');
  eq(others.filter((w) => !ids.has(w.id)).length, 0);
  eq(ws.filter((w) => w.who === 'me' && ids.has(w.id)).length, 0);
});

test('family weigh-ins: typed-in weights and ones you confirmed are always you; suspects stay out of the trend', () => {
  const ws = familyScale();
  const kid = ws.find((w) => w.who === 'kid');
  const confirmed = ws.map((w) => (w.id === kid.id ? { ...w, review: false, reviewed_at: '2026-10-01T00:00:00Z' } : w));
  assert(!suspects(confirmed).has(kid.id), 'a confirmed reading is never a suspect');
  const manual = [...ws, { id: 'm1', kg: 50, day: '2020-05-05', measured_at: '2020-05-05T08:00:00Z', source: 'manual' }];
  assert(!suspects(manual).has('m1'), 'typed-in weights are yours');
  const sus = suspects(ws);
  const daily = dailyWeights(ws.map((w) => ({ ...w, review: sus.has(w.id) })));
  assert(daily.every((p) => p.kg > 80), 'no family reading reaches the trend');
});

test('review queue: Withings-unsure + suspects, merged by id; hasBody/hasWeight say which documents exist (A2)', () => {
  const ws = [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `w_${i}`, kg: 100, day: `2026-09-${String(i + 1).padStart(2, '0')}`, measured_at: `2026-09-${String(i + 1).padStart(2, '0')}T07:00:00Z`, source: 'withings' })),
    { id: 'w_kid', kg: 20, day: '2026-09-05', measured_at: '2026-09-05T18:00:00Z', source: 'withings' },
    { id: 'w_unsure', kg: 99, day: '2026-09-06', measured_at: '2026-09-06T18:00:00Z', source: 'withings', review: true },
    { id: 'c_1', kg: 21, day: '2026-09-07', measured_at: '2026-09-07T18:00:00Z', source: 'withings_csv' },
  ];
  const body = [
    { id: 'w_unsure', needs_review: true, metrics: { weight_kg: 99 }, day: '2026-09-06', measured_at: '2026-09-06T18:00:00Z' },
    { id: 'w_hr', needs_review: true, metrics: { heart_pulse_bpm: 61 }, day: '2026-09-08', measured_at: '2026-09-08T18:00:00Z' },
    { id: 'w_kid', metrics: { weight_kg: 20 }, day: '2026-09-05', measured_at: '2026-09-05T18:00:00Z' },
  ];
  const q = reviewQueue(ws, body);
  const by = Object.fromEntries(q.map((x) => [x.id, x]));
  eq(Object.keys(by).sort().join(), 'c_1,w_hr,w_kid,w_unsure');
  eq([by.w_hr.hasBody, by.w_hr.hasWeight, by.w_hr.kg].join(), 'true,false,'); // heart-rate only: no weights doc to update
  eq([by.c_1.hasBody, by.c_1.hasWeight].join(), 'false,true'); // imported from weight.csv: no body doc
  eq([by.w_kid.hasBody, by.w_kid.reason].join(), 'true,outlier');
  eq([by.w_unsure.hasWeight, by.w_unsure.reason].join(), 'true,withings');
  eq(q[0].id, 'w_hr'); // newest first
});

test('bulk "Not me": suggested cutoff sits in the gap; preview counts only queue items under it, with the date range', () => {
  const ws = familyScale();
  const cut = suggestCutoff(ws);
  const lightest = Math.min(...ws.filter((w) => w.who === 'me').map((w) => w.kg));
  const heaviestOther = Math.max(...ws.filter((w) => w.who !== 'me').map((w) => w.kg));
  assert(cut > heaviestOther && cut < lightest, `cutoff ${cut} between ${heaviestOther} and ${lightest}`);
  const q = reviewQueue(ws, []);
  const u = underCutoff(q, cut);
  eq(u.count, ws.filter((w) => w.who !== 'me').length);
  eq(u.from, ws.filter((w) => w.who !== 'me').map((w) => w.day).sort()[0]);
  eq(underCutoff(q, 30).count, ws.filter((w) => w.who === 'kid').length);
  eq(underCutoff(q, NaN).count, 0);
  eq(suggestCutoff(ws.filter((w) => w.who === 'me')), null);
});

test('"Not me — whole day": queue grouped by day, newest first', () => {
  const q = [
    { id: 'a', measured_at: '2026-09-05T18:00:00Z', day: '2026-09-05' },
    { id: 'b', measured_at: '2026-09-05T19:00:00Z', day: '2026-09-05' },
    { id: 'c', measured_at: '2026-09-07T18:00:00Z', day: '2026-09-07' },
  ].sort((x, y) => (x.measured_at < y.measured_at ? 1 : -1));
  const g = byDay(q);
  eq(g.map((x) => `${x.day}:${x.items.length}`).join(), '2026-09-07:1,2026-09-05:2');
});

test('weight.csv: parses a Withings export (lb, quoted header, empty columns); rejects other files', () => {
  const csv = 'Date,"Weight (lb)","Fat mass (lb)","Bone mass (lb)","Muscle mass (lb)","Hydration (lb)",Comments\n"2026-09-22 10:26:32",205.8,,,,,\n"2009-12-31 23:00:33",243.0,,,,,\n"bad",1,,,,,\n';
  const { rows, skipped, unit } = parseWeightCSV(csv);
  eq(unit, 'lb');
  eq(rows.length, 2);
  eq(skipped, 1);
  near(rows[0].kg, 93.35, 0.01);
  eq(rows[1].at.getFullYear(), 2009);
  let threw = false;
  try { parseWeightCSV('Date,Steps\n2026-01-01,100\n'); } catch { threw = true; }
  assert(threw, 'not a weight.csv');
  eq(parseWeightCSV('Date,"Weight (kg)"\n2026-01-01 07:00:00,82.3\n').rows[0].kg, 82.3);
});

test('weight.csv import: skips Withings readings Forge has (same weight, same minute or whole hours off), its own earlier rows, and deleted ones', () => {
  const { rows } = parseWeightCSV('Date,"Weight (kg)"\n2026-09-22 10:26:32,93.3\n2026-09-21 10:00:00,93.5\n2026-09-20 10:00:00,93.6\n2016-05-01 07:00:00,110\n2016-05-01 07:00:00,110\n');
  const api = { id: 'w_1', source: 'withings', kg: 93.3, measured_at: new Date(rows[0].at.getTime() + 4 * 3600000 + 30000).toISOString() }; // the API's clock 4 h off
  const notMe = { id: csvId(rows[2].at), source: 'withings_csv', kg: 93.6, deleted: true };
  const plan = planCsvImport(rows, [api, notMe]);
  eq(plan.matched, 1);
  eq(plan.already, 2); // the deleted one and the duplicate row
  eq(plan.add.map((r) => r.kg).join(), '93.5,110');
  eq(plan.add[1].day, '2016-05-01');
  const again = planCsvImport(rows, [api, notMe, ...plan.add.map((r) => ({ ...r, source: 'withings_csv' }))]);
  eq(again.add.length, 0);
  const differentWeight = planCsvImport(rows.slice(0, 1), [{ ...api, kg: 95 }]);
  eq(differentWeight.add.length, 1);
});

test('history by year: backfill page counts summed per year; data check Withings vs Forge per year', () => {
  const bf = { years: { 2026: { p0: { g: 10, w: 8 }, p500: { g: 3, w: 3 } }, 2010: { p0: { g: 7, w: 7 } }, 2012: { p0: { g: 0, w: 0 } } } };
  eq(backfillYears(bf).map((y) => `${y.year}:${y.groups}/${y.weighins}`).join(), '2026:13/11,2012:0/0,2010:7/7');
  const rows = yearRows({ years_withings: { 2026: { groups: 13, weighins: 11 }, 2010: { groups: 7, weighins: 7 }, 2012: { groups: 0, weighins: 0 } }, years_forge: { 2026: 11, 2010: 6 } });
  eq(rows.map((r) => `${r.year}:${r.withings}/${r.forge}`).join(), '2026:11/11,2010:7/6');
});

test('verdict: when webhook proof is the only blocker it says "Waiting for N more weigh-ins"; weight.csv imports count toward the csv comparison', () => {
  const v = verdict(bodyCompReport({ latencies_s: [40, 50, 60, 70] }));
  eq(v.waiting, 3);
  assert(/^Waiting for 3 more weigh-ins/.test(v.text), v.text);
  const v2 = verdict(bodyCompReport({ latencies_s: [40], subscription: { present: false } }));
  assert(/^Not yet/.test(v2.text), 'several blockers → Not yet');
  eq(verdict(bodyCompReport(), { csvRows: 1084 }).safe, false);
  eq(verdict(bodyCompReport(), { csvRows: 1084, csvImported: 184 }).safe, true);
});
