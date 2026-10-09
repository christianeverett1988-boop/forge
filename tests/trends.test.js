// W2b: trend engine, anomaly rules, insight ranking, weekly report, goal path and Body Profile.
// Synthetic data only (no real health values anywhere in this repo).
import { readFileSync } from 'node:fs';
import { test, eq, near, assert } from './harness.js';
import {
  theilSenFit, mannKendall, normalCdf, trendFor, trendsFor, buildSeries, allTrends, NOISE_FLOOR, MIN_POINTS, goodDirection, tone,
} from '../js/health/trends.js';
import { shiftDay } from '../js/health/metrics.js';
import { THRESHOLDS, waterRule, fatNoiseRule, hrvRule, rhrRule, tempRule, sleepRule, weighInRule, detectAnomalies } from '../js/health/anomalies.js';
import { rankInsights, score, activeDismissals, dismissChange, buildInsights, MEDICAL } from '../js/health/insights.js';
import { weekday, mondayOf, weekDays, shiftWeek, reportWeekFor, showReportCard, weeklyReport } from '../js/health/weekly.js';
import { goalPath, energyBalance, goalLine, goalProjection } from '../js/health/goalpath.js';
import { fmtDelta } from '../js/health/delta.js';
import { reportText } from '../js/health/weektext.js';
import { bodyProfile, bandOf, cutsFor, indices } from '../js/health/bodyprofile.js';

const TODAY = '2026-10-10'; // a Saturday
const dayAt = (i) => shiftDay(TODAY, -i); // i days ago
const series = (n, f) => Array.from({ length: n }, (_, k) => { const i = n - 1 - k; return { day: dayAt(i), v: f(k, i) }; }); // oldest first, ending today

// ---------- statistics ----------

test('Theil–Sen: the median of pairwise slopes ignores one wild reading', () => {
  const fit = theilSenFit([[0, 1], [1, 3], [2, 5], [3, 7], [4, 100]]);
  near(fit.slope, 2, 1e-9);
  near(fit.intercept, 1, 1e-9);
  eq(theilSenFit([[1, 1], [1, 2]]), null); // all x equal: no slope
});

test('normal CDF matches known values', () => {
  near(normalCdf(0), 0.5, 1e-7);
  near(normalCdf(1.96), 0.975, 1e-4);
  near(normalCdf(-1.96), 0.025, 1e-4);
});

test('Mann–Kendall: a perfect rise of 6 points has S=15, p≈0.0085', () => {
  const r = mannKendall([1, 2, 3, 4, 5, 6]);
  eq(r.S, 15);
  near(r.varS, (6 * 5 * 17) / 18, 1e-9);
  near(r.z, 14 / Math.sqrt(r.varS), 1e-9);
  near(r.p, 0.00853, 0.0005);
});

test('Mann–Kendall: ties lower the variance (tie-corrected) and the p-value follows', () => {
  const r = mannKendall([1, 2, 2, 3]);
  eq(r.S, 5);
  near(r.varS, (4 * 3 * 13 - 2 * 1 * 9) / 18, 1e-9); // 7.667
  near(r.p, 0.1486, 0.002);
});

test('Mann–Kendall: no change at all is p = 1', () => {
  const r = mannKendall([5, 5, 5, 5, 5, 5, 5]);
  eq(r.S, 0);
  eq(r.p, 1);
});

test('trendFor: fewer than 6 points is "not enough data"', () => {
  const s = series(5, (k) => 80 - k);
  const t = trendFor(s, { metric: 'weight_kg', window: 28, today: TODAY });
  eq(MIN_POINTS, 6);
  eq(t.enough, false);
  eq(t.direction, 'flat');
  eq(t.slopePerWeek, null);
  eq(trendFor(series(6, (k) => 80 - k), { metric: 'weight_kg', window: 28, today: TODAY }).enough, true);
});

test('trendFor: only readings inside the window count', () => {
  const s = series(40, (k) => 80 - 0.1 * k);
  eq(trendFor(s, { metric: 'weight_kg', window: 7, today: TODAY }).n, 7);
  eq(trendFor(s, { metric: 'weight_kg', window: 28, today: TODAY }).n, 28);
  eq(trendFor(s, { metric: 'weight_kg', window: 90, today: TODAY }).n, 40);
});

test('trendFor: a clear fall is significant and above the noise floor → down, with the slope per week', () => {
  const s = series(28, (k) => 80 - 0.1 * k); // −0.7 kg a week
  const t = trendFor(s, { metric: 'weight_kg', window: 28, today: TODAY });
  eq(t.direction, 'down');
  near(t.slopePerWeek, -0.7, 1e-9);
  assert(t.p < 0.05);
});

test('noise floor: a steady change smaller than the metric floor is flat', () => {
  const s = series(28, (k) => 80 - 0.01 * k); // −0.07 kg a week: significant, but under the 0.1 floor
  const t = trendFor(s, { metric: 'weight_kg', window: 28, today: TODAY });
  assert(t.p < 0.05, 'significant');
  assert(Math.abs(t.slopePerWeek) < NOISE_FLOOR.weight_kg);
  eq(t.direction, 'flat');
  eq(trendFor(s, { metric: 'weight_kg', window: 28, today: TODAY, floor: 0.01 }).direction, 'down'); // same data, lower floor
});

test('noise floor: a big swing that is not significant is flat too', () => {
  const s = series(28, (k) => 80 + (k % 2 ? 3 : -3)); // bounces ±3 kg, no direction
  const t = trendFor(s, { metric: 'weight_kg', window: 28, today: TODAY });
  assert(t.p >= 0.05);
  eq(t.direction, 'flat');
});

test('noise floors in code match data/metrics.json, and the Apple metrics have them', () => {
  const j = JSON.parse(readFileSync(new URL('../data/metrics.json', import.meta.url), 'utf8')).metrics;
  for (const [k, v] of Object.entries(NOISE_FLOOR)) eq(j[k] && j[k].noise_floor_per_week, v, k);
  for (const k of ['hrv_sdnn_ms', 'rhr_bpm', 'sleep_min', 'steps', 'exercise_min']) assert(NOISE_FLOOR[k] > 0, k);
});

test('trendsFor gives 7, 28 and 90 day results; allTrends skips metrics with no recent data', () => {
  const s = new Map([['weight_kg', series(60, (k) => 80 - 0.1 * k)], ['steps', []]]);
  const t = trendsFor(s.get('weight_kg'), 'weight_kg', TODAY);
  eq(Object.keys(t).join(), '7,28,90');
  const list = allTrends({ series: s, today: TODAY, goal: 'lose' });
  eq(list.length, 1);
  eq(list[0].key, 'weight_kg');
  eq(list[0].tone, 'good');
});

test('goal decides what is good: green/red only where it is unambiguous', () => {
  eq(goodDirection('weight_kg', 'lose'), 'down');
  eq(goodDirection('weight_kg', 'muscle'), 'up');
  eq(goodDirection('weight_kg', 'health'), null);
  eq(goodDirection('hydration_kg', 'lose'), null);
  eq(tone('weight_kg', 'down', 'lose'), 'good');
  eq(tone('weight_kg', 'up', 'lose'), 'bad');
  eq(tone('weight_kg', 'up', 'health'), 'neutral');
  eq(tone('hrv_sdnn_ms', 'down', 'health'), 'bad');
  eq(tone('weight_kg', 'flat', 'lose'), 'neutral');
});

test('buildSeries reads weights, body measures and Apple days', () => {
  const s = buildSeries({
    weights: [{ day: dayAt(1), kg: 80 }, { day: dayAt(0), kg: 79.5 }],
    measures: [{ id: 'a', day: dayAt(0), measured_at: `${dayAt(0)}T07:00:00Z`, metrics: { weight_kg: 79.5, fat_mass_kg: 16 } }],
    rows: [{ id: dayAt(0), hrv_sdnn_ms: 50, sleep: { asleep_min: 400 }, steps: 9000 }],
  });
  eq(s.get('weight_kg').length, 2);
  eq(s.get('fat_mass_kg')[0].v, 16);
  eq(s.get('hrv_sdnn_ms')[0].v, 50);
  eq(s.get('sleep_min')[0].v, 400);
  eq(s.get('rhr_bpm').length, 0);
});

// ---------- anomaly rules ----------

const rowsFor = (f, from = 40) => {
  const rows = [];
  for (let i = from; i >= 0; i--) { const r = f(i); if (r) rows.push({ id: dayAt(i), ...r }); }
  return rows;
};
const mapRows = (rows) => new Map(rows.map((r) => [r.id, r]));

test('thresholds live in one table', () => {
  eq(THRESHOLDS.waterJumpPct, 1.5);
  eq(THRESHOLDS.fatJumpPoints, 2);
  eq(THRESHOLDS.hrvDropPct, 15);
  eq(THRESHOLDS.rhrUpBpm, 5);
  eq(THRESHOLDS.tempUpC, 0.5);
  eq(THRESHOLDS.sleepShortMin, 360);
});

test('water rule: weight jumps >1.5% off trend with water moving the same way → fires', () => {
  const w = series(20, () => ({})).map((p, k) => ({ day: p.day, kg: k === 19 ? 81.5 : 80, trend: 80 }));
  const water = series(20, (k) => (k === 19 ? 41 : 40));
  const a = waterRule({ weights: w, water, today: TODAY });
  eq(a.kind, 'water');
  assert(a.data.pct > 1.5);
});

test('water rule: does not fire without water, with water moving the other way, or for a small jump', () => {
  const mk = (kg) => series(20, () => ({})).map((p, k) => ({ day: p.day, kg: k === 19 ? kg : 80, trend: 80 }));
  const water = (last) => series(20, (k) => (k === 19 ? last : 40));
  eq(waterRule({ weights: mk(81.5), water: [], today: TODAY }), null);
  eq(waterRule({ weights: mk(81.5), water: water(39), today: TODAY }), null);
  eq(waterRule({ weights: mk(81.5), water: water(40.05), today: TODAY }), null); // barely moved
  eq(waterRule({ weights: mk(80.9), water: water(41), today: TODAY }), null); // 1.1%
  assert(waterRule({ weights: mk(78.5), water: water(39), today: TODAY }), 'a drop with water down fires too');
});

test('fat % rule: a jump of more than 2 points in a day fires, 2 or less does not', () => {
  const f = (a, b) => [{ day: dayAt(1), v: a }, { day: dayAt(0), v: b }];
  eq(fatNoiseRule({ fat: f(20, 22.5), today: TODAY }).kind, 'fatnoise');
  eq(fatNoiseRule({ fat: f(20, 22), today: TODAY }), null);
  eq(fatNoiseRule({ fat: [{ day: dayAt(5), v: 20 }, { day: dayAt(0), v: 25 }], today: TODAY }), null); // not "in a day"
});

test('HRV rule: 7-day mean 15% below the 28-day baseline fires', () => {
  const hrv = (last7) => mapRows(rowsFor((i) => ({ hrv_sdnn_ms: i <= 6 ? last7 : 50 })));
  eq(hrvRule({ days: hrv(41), today: TODAY }).kind, 'hrv'); // −18%
  near(hrvRule({ days: hrv(41), today: TODAY }).data.dropPct, 18, 0.01);
  eq(hrvRule({ days: hrv(45), today: TODAY }), null); // −10%
  eq(hrvRule({ days: hrv(42.5), today: TODAY }).kind, 'hrv'); // exactly −15% fires ("≥ 15%")
  eq(hrvRule({ days: mapRows(rowsFor((i) => (i <= 6 ? { hrv_sdnn_ms: 30 } : null))), today: TODAY }), null); // no baseline
});

test('resting HR rule: +5 bpm or more for 3+ days in a row fires', () => {
  const rhr = (f) => mapRows(rowsFor((i) => ({ rhr_bpm: f(i) })));
  eq(rhrRule({ days: rhr((i) => (i <= 2 ? 61 : 55)), today: TODAY }).kind, 'rhr');
  eq(rhrRule({ days: rhr((i) => (i <= 1 ? 61 : 55)), today: TODAY }), null); // only 2 days
  eq(rhrRule({ days: rhr((i) => (i <= 2 ? 59 : 55)), today: TODAY }), null); // +4
  eq(rhrRule({ days: rhr((i) => (i === 1 ? 55 : i <= 3 ? 61 : 55)), today: TODAY }), null); // broken run
  const noToday = mapRows(rowsFor((i) => (i === 0 ? null : { rhr_bpm: i <= 3 ? 61 : 55 })));
  eq(rhrRule({ days: noToday, today: TODAY }).kind, 'rhr'); // today's reading is not in yet: the run ends yesterday
});

test('wrist temperature rule: +0.5 °C for 2+ nights in a row fires', () => {
  const t = (f) => mapRows(rowsFor((i) => ({ wrist_temp_delta_c: f(i) })));
  eq(tempRule({ days: t((i) => (i <= 1 ? 0.6 : 0)), today: TODAY }).kind, 'temp');
  eq(tempRule({ days: t((i) => (i === 0 ? 0.6 : 0)), today: TODAY }), null);
  eq(tempRule({ days: t((i) => (i <= 1 ? 0.4 : 0)), today: TODAY }), null);
});

test('sleep rule: under 6 h for 3 nights in a row fires', () => {
  const s = (f) => mapRows(rowsFor((i) => ({ sleep: { asleep_min: f(i) } })));
  const a = sleepRule({ days: s((i) => (i <= 2 ? 330 : 420)), today: TODAY });
  eq(a.kind, 'sleep');
  near(a.data.avgMin, 330, 1e-9);
  eq(sleepRule({ days: s((i) => (i <= 1 ? 330 : 420)), today: TODAY }), null);
  eq(sleepRule({ days: s((i) => (i <= 2 ? 360 : 420)), today: TODAY }), null); // exactly 6 h is not short
});

test('no weigh-in rule: 7 days without one fires, but only if you normally weigh in weekly', () => {
  const every = (gap, lastAgo) => { const w = []; for (let a = lastAgo + gap * 8; a >= lastAgo; a -= gap) w.push({ day: dayAt(a) }); return w; };
  eq(weighInRule({ weights: every(3, 8), today: TODAY }).kind, 'weighin');
  eq(weighInRule({ weights: every(3, 6), today: TODAY }), null); // 6 days: not yet
  eq(weighInRule({ weights: every(14, 8), today: TODAY }), null); // you never weighed weekly
  eq(weighInRule({ weights: [{ day: dayAt(9) }, { day: dayAt(8) }], today: TODAY }), null); // too little history to know
  eq(weighInRule({ weights: [], today: TODAY }), null);
});

test('detectAnomalies runs every rule and returns only the ones firing', () => {
  const rows = rowsFor((i) => ({ hrv_sdnn_ms: 50, rhr_bpm: i <= 2 ? 62 : 55, sleep: { asleep_min: 420 } }));
  const out = detectAnomalies({ today: TODAY, weights: [], series: new Map(), rows });
  eq(out.map((a) => a.kind).join(), 'rhr');
});

// ---------- insights: ranking, dismissal, wording ----------

test('ranking: severity × recency, newest wins at equal severity, top 3 only', () => {
  const c = [
    { id: 'old-big', severity: 0.8, day: dayAt(10) },
    { id: 'new-small', severity: 0.5, day: dayAt(0) },
    { id: 'mid', severity: 0.6, day: dayAt(3) },
    { id: 'tiny', severity: 0.1, day: dayAt(0) },
    { id: 'same-a', severity: 0.5, day: dayAt(0) },
  ];
  near(score(c[0], TODAY), 0.8 * Math.pow(0.5, 10 / 7), 1e-9);
  const top = rankInsights(c, TODAY);
  eq(top.length, 3);
  eq(top.map((x) => x.id).join(), 'new-small,same-a,mid'); // 0.5, 0.5 (id order), then 0.6 × 0.74 = 0.45
});

test('ranking: ties break by id so the order is stable', () => {
  const top = rankInsights([{ id: 'b', severity: 0.5, day: TODAY }, { id: 'a', severity: 0.5, day: TODAY }], TODAY);
  eq(top.map((x) => x.id).join(), 'a,b');
});

test('dismissing hides a card for 7 days, then it comes back; old dismissals are forgotten', () => {
  const settings = { insight_dismissed: { 'trend:weight_kg:down': shiftDay(TODAY, 3), stale: shiftDay(TODAY, -2) } };
  const act = activeDismissals(settings, TODAY);
  eq(Object.keys(act).join(), 'trend:weight_kg:down');
  const c = [{ id: 'trend:weight_kg:down', severity: 0.9, day: TODAY }, { id: 'x', severity: 0.1, day: TODAY }];
  eq(rankInsights(c, TODAY, { dismissed: act }).map((x) => x.id).join(), 'x');
  eq(rankInsights(c, shiftDay(TODAY, 3), { dismissed: act }).length, 2); // the day it expires
  const ch = dismissChange(settings, 'new', TODAY);
  eq(ch.insight_dismissed.new, shiftDay(TODAY, 7));
  eq(ch.insight_dismissed.stale, undefined);
  eq(dismissChange(null, 'a', TODAY).insight_dismissed.a, shiftDay(TODAY, 7));
});

test('cards: "Nice cut" replaces the separate fat and lean cards; heart-rate and temperature cards carry the not-medical line', () => {
  const s = new Map([
    ['fat_mass_kg', series(28, (k) => 20 - 0.05 * k)],
    ['fat_free_mass_kg', series(28, () => 60)],
  ]);
  const trends = allTrends({ series: s, today: TODAY, goal: 'lose' });
  const cards = buildInsights({ trends, anomalies: [], units: 'metric', goal: 'lose' });
  eq(cards.map((c) => c.id).join(), 'cross:cut');
  assert(/Fat mass is down 0\.35 kg a week/.test(cards[0].body), cards[0].body);
  assert(cards[0].why && cards[0].todo && cards[0].href);
  const a = buildInsights({ trends: [], units: 'imperial', anomalies: [
    { kind: 'rhr', day: TODAY, severity: 0.7, data: { nights: 3, up: 6, base: 55, last: 61 } },
    { kind: 'temp', day: TODAY, severity: 0.8, data: { nights: 2, delta: 0.6 } },
    { kind: 'water', day: TODAY, severity: 0.25, data: { pct: 1.9 } },
  ] });
  eq(a.find((c) => c.metric === 'rhr').note, MEDICAL);
  eq(a.find((c) => c.metric === 'temp').note, MEDICAL);
  eq(a.find((c) => c.metric === 'water').note, undefined);
  assert(/Likely water\. Your trend hasn’t changed\./.test(a.find((c) => c.metric === 'water').body));
  assert(/talk to a doctor/.test(MEDICAL));
});

test('wording is calm: no alarming words in any anomaly template', () => {
  const all = buildInsights({ trends: [], units: 'imperial', anomalies: [
    { kind: 'water', day: TODAY, severity: 1, data: { pct: 2 } }, { kind: 'fatnoise', day: TODAY, severity: 1, data: { jump: 3 } },
    { kind: 'hrv', day: TODAY, severity: 1, data: { dropPct: 20 } }, { kind: 'rhr', day: TODAY, severity: 1, data: { nights: 3, up: 6 } },
    { kind: 'temp', day: TODAY, severity: 1, data: { nights: 2, delta: 0.7 } }, { kind: 'sleep', day: TODAY, severity: 1, data: { nights: 3, avgMin: 320 } },
    { kind: 'weighin', day: TODAY, severity: 1, data: { gapDays: 9 } },
  ] });
  eq(all.length, 7);
  for (const c of all) assert(!/danger|warning|alert|illness|disease|diagnos|serious|urgent/i.test(`${c.title} ${c.body} ${c.why} ${c.todo}`), c.id);
});

// ---------- weeks ----------

test('weeks run Monday to Sunday', () => {
  eq(weekday('2026-10-11'), 0);
  eq(mondayOf('2026-10-11'), '2026-10-05'); // Sunday belongs to the week that started the Monday before
  eq(mondayOf('2026-10-05'), '2026-10-05');
  eq(mondayOf('2026-10-10'), '2026-10-05');
  eq(weekDays('2026-10-05').join(), '2026-10-05,2026-10-06,2026-10-07,2026-10-08,2026-10-09,2026-10-10,2026-10-11');
  eq(shiftWeek('2026-10-05', -1), '2026-09-28');
});

test('report week: the week so far on Sunday, otherwise the last full week', () => {
  eq(reportWeekFor('2026-10-11'), '2026-10-05'); // Sunday
  eq(reportWeekFor('2026-10-12'), '2026-10-05'); // Monday: last week
  eq(reportWeekFor('2026-10-10'), '2026-09-28'); // Saturday: still last full week
  eq(showReportCard('2026-10-11'), true);
  eq(showReportCard('2026-10-12'), true);
  eq(showReportCard('2026-10-13'), false);
});

test('DST change week (US, Nov 1 2026) still has seven distinct Monday–Sunday days', () => {
  const days = weekDays('2026-10-26');
  eq(days.length, 7);
  eq(new Set(days).size, 7);
  eq(days[6], '2026-11-01');
  eq(weekday(days[0]), 1);
  eq(weekday(days[6]), 0);
  eq(mondayOf('2026-11-01'), '2026-10-26');
  eq(mondayOf('2026-11-02'), '2026-11-02');
  eq(shiftWeek('2026-10-26', 1), '2026-11-02');
});

// ---------- weekly report maths ----------

const at = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min).toISOString(); // local time, whatever the zone
const lift = (id, iso, { sets = 3, kg = 100, reps = 5, prs = 0 } = {}) => ({
  id, status: 'done', started_at: iso, exercises: [{ exerciseId: 'bench', sets: Array.from({ length: sets }, () => ({ done: true, weight_kg: kg, reps })) }], prs: Array.from({ length: prs }, (_, i) => ({ id: i })),
});

test('weekly report: workouts vs planned, volume vs the previous week, PRs, cardio', () => {
  const workouts = [
    lift('a', at(2026, 10, 5), { prs: 1 }), lift('b', at(2026, 10, 7), { prs: 1 }), lift('c', at(2026, 10, 11, 23, 30)), // this week, the last late on Sunday
    lift('d', at(2026, 10, 12, 0, 30)), // Monday after: next week
    lift('p1', at(2026, 9, 29), { sets: 2 }), lift('p2', at(2026, 10, 1), { sets: 2 }), // previous week: 2 × 1000
    { ...lift('x', at(2026, 10, 6)), status: 'active' }, { ...lift('y', at(2026, 10, 6)), deleted: true },
  ];
  const cardio = [{ started_at: at(2026, 10, 8), duration_min: 25 }, { started_at: at(2026, 10, 9), duration_min: 15 }, { started_at: at(2026, 10, 14), duration_min: 99 }];
  const r = weeklyReport({ weekStart: '2026-10-05', today: '2026-10-11', workouts, cardio, profile: { trainingDays: 4, goal: 'lose' } });
  eq(r.training.workouts, 3);
  eq(r.training.planned, 4);
  eq(r.training.volumeKg, 4500);
  eq(r.training.prevVolumeKg, 2000);
  near(r.training.volumeChangePct, 125, 1e-9);
  eq(r.training.prs, 2);
  eq(r.training.cardioMin, 40);
  eq(r.partial, true);
  eq(r.suggestion.id, 'sessions'); // 3 of 4: aim for 4
});

test('weekly report: recovery averages, weight trend change and best/worst metric', () => {
  const rows = [];
  for (let i = 0; i < 56; i++) {
    const day = shiftDay('2026-10-11', -i);
    const thisWeek = i < 7;
    rows.push({ id: day, hrv_sdnn_ms: (thisWeek ? 58 : 50) + (i % 2), rhr_bpm: thisWeek ? 52 : 56 + (i % 3) * 0.5, sleep: { asleep_min: thisWeek ? 400 : 440 + (i % 5) * 4 }, steps: 9000 });
  }
  const weights = [{ day: '2026-10-04', kg: 82, trend: 82 }, { day: '2026-10-06', kg: 81.5, trend: 81.6 }, { day: '2026-10-09', kg: 81, trend: 81.2 }, { day: '2026-10-11', kg: 80.8, trend: 81 }];
  const r = weeklyReport({ weekStart: '2026-10-05', today: '2026-10-12', rows, series: weights, workouts: [], cardio: [], profile: { goal: 'lose', trainingDays: 3 } });
  near(r.recovery.hrv.now, 58.5, 0.5);
  near(r.recovery.hrv.before, 50.5, 0.5);
  assert(r.recovery.hrv.change > 7);
  assert(r.recovery.rhr.change < -3);
  assert(r.recovery.sleep.change < -30);
  near(r.weight.change, 81 - 82, 1e-9);
  eq(r.weight.weighIns, 3);
  eq(r.partial, false);
  assert(r.best, 'there is a best metric');
  assert(['hrv_sdnn_ms', 'rhr_bpm', 'weight_kg'].includes(r.best.key), r.best.key);
  eq(r.worst && r.worst.key, 'sleep_min'); // sleep fell, and more sleep is better
});

test('weekly report: an empty week says so and suggests logging something', () => {
  const r = weeklyReport({ weekStart: '2026-10-05', today: '2026-10-12', profile: { goal: 'health' } });
  eq(r.hasData, false);
  eq(r.suggestion.id, 'start');
  eq(r.score.now, null);
});

test('weekly report: suggestions follow the rules in order', () => {
  const base = { weekStart: '2026-10-05', today: '2026-10-12', profile: { goal: 'health', trainingDays: 2 } };
  const trained = [lift('a', at(2026, 10, 5)), lift('b', at(2026, 10, 7))];
  const sleepy = [];
  for (let i = 0; i < 14; i++) sleepy.push({ id: shiftDay('2026-10-11', -i), sleep: { asleep_min: 380 }, steps: 9000 });
  eq(weeklyReport({ ...base, workouts: trained, rows: sleepy }).suggestion.id, 'sleep');
  const walkless = sleepy.map((r) => ({ ...r, sleep: { asleep_min: 460 }, steps: 3000 }));
  eq(weeklyReport({ ...base, workouts: trained, rows: walkless }).suggestion.id, 'walk');
  const fine = sleepy.map((r) => ({ ...r, sleep: { asleep_min: 460 } }));
  const wts = [{ day: '2026-10-05', kg: 80, trend: 80 }, { day: '2026-10-07', kg: 80, trend: 80 }, { day: '2026-10-09', kg: 80, trend: 80 }];
  eq(weeklyReport({ ...base, workouts: trained, rows: fine, series: wts }).suggestion.id, 'steady');
  eq(weeklyReport({ ...base, workouts: trained, rows: fine, series: wts.slice(0, 1) }).suggestion.id, 'weigh');
});

// ---------- goal path ----------

const wline = (f, n = 28) => Array.from({ length: n }, (_, k) => { const i = n - 1 - k; const kg = f(k); return { day: dayAt(i), kg, trend: kg }; });

test('goal path: a steady fall of 0.1 kg a day gives the ETA to the day', () => {
  const s = wline((k) => 90 - 0.1 * k); // today 87.3
  const p = goalPath({ series: s, goalKg: 85, today: TODAY });
  eq(p.status, 'ok');
  near(p.slopePerWeek, -0.7, 1e-9);
  near(p.remaining, -2.3, 1e-9);
  eq(p.etaDay, shiftDay(TODAY, 23));
  eq(p.earlyDay, p.etaDay); // no scatter → no band
  eq(p.lateDay, p.etaDay);
});

test('goal path: scatter widens the band around the ETA', () => {
  const s = wline((k) => 90 - 0.1 * k + (k % 2 ? 0.4 : -0.4));
  const p = goalPath({ series: s, goalKg: 85, today: TODAY });
  eq(p.status, 'ok');
  assert(p.sdKg > 0.3, `sd ${p.sdKg}`);
  assert(p.earlyDay < p.etaDay, 'early before eta');
  assert(p.lateDay == null || p.lateDay > p.etaDay, 'late after eta');
});

test('goal path: a trend going the wrong way gets no ETA and no date', () => {
  const s = wline((k) => 80 + 0.1 * k); // gaining, goal is lower
  const p = goalPath({ series: s, goalKg: 75, today: TODAY });
  eq(p.status, 'away');
  eq(p.etaDay, undefined);
  eq(goalPath({ series: wline((k) => 90 - 0.1 * k), goalKg: 95, today: TODAY }).status, 'away'); // losing, goal is higher
});

test('goal path: flat, reached, no goal and not enough data', () => {
  eq(goalPath({ series: wline(() => 80), goalKg: 75, today: TODAY }).status, 'flat');
  eq(goalPath({ series: wline((k) => 90 - 0.1 * k), goalKg: 87.35, today: TODAY }).status, 'reached');
  eq(goalPath({ series: wline((k) => 90 - 0.1 * k), goalKg: undefined, today: TODAY }).status, 'nogoal');
  eq(goalPath({ series: wline((k) => 90 - 0.1 * k, 5), goalKg: 85, today: TODAY }).status, 'none');
  eq(goalPath({ series: [], goalKg: 85, today: TODAY }).status, 'none');
});

test('goal path: pace is compared with the safe cap (1% of body weight a week when losing)', () => {
  const fast = goalPath({ series: wline((k) => 100 - 0.2 * k), goalKg: 80, today: TODAY }); // 1.4 kg/wk ≈ 1.5%
  eq(fast.overCap, true);
  near(fast.capKgPerWeek, 0.01 * fast.current, 1e-9);
  const slow = goalPath({ series: wline((k) => 100 - 0.05 * k), goalKg: 80, today: TODAY });
  eq(slow.overCap, false);
});

test('goal path: too far away to be useful gives no date', () => {
  const s = wline((k) => 80 - 0.0145 * k); // ~0.1 kg a week
  eq(goalPath({ series: s, goalKg: 50, today: TODAY }).status, 'far');
});

test('energy balance: fat falling 0.5 kg a week with lean steady ≈ −674 kcal a day', () => {
  const measures = Array.from({ length: 15 }, (_, k) => { const i = 28 - 2 * k - 1; const day = dayAt(Math.max(0, i)); return { id: `m${k}`, day, measured_at: `${day}T07:00:00Z`, metrics: { fat_mass_kg: 20 - (0.5 / 7) * (27 - i), fat_free_mass_kg: 60 } }; });
  const e = energyBalance({ measures, today: TODAY });
  near(e.kcalPerDay, -(0.5 / 7) * 39.5 * (1000 / 4.184), 3);
  near(e.fatPerWeek, -0.5, 0.01);
  eq(e.usedLean, true);
  eq(energyBalance({ measures: measures.slice(0, 2), today: TODAY }), null);
  eq(energyBalance({ measures: [], today: TODAY }), null);
});

// ---------- Body Profile ----------

test('Body Profile bands: cut points split each index into four', () => {
  eq(bandOf(16.9, [17, 19, 21]), 0);
  eq(bandOf(17, [17, 19, 21]), 1);
  eq(bandOf(19.5, [17, 19, 21]), 2);
  eq(bandOf(25, [17, 19, 21]), 3);
  eq(cutsFor('male', 'ffmi').length, 3);
  assert(cutsFor('female', 'fmi')[0] > cutsFor('male', 'fmi')[0], 'women carry more fat at the same band');
  eq(cutsFor(null, 'ffmi').length, 3);
});

const doc = (day, metrics) => ({ id: day, day, measured_at: `${day}T07:00:00Z`, metrics });

test('Body Profile: FFMI × FMI of the latest reading, with a trail of earlier months', () => {
  const measures = [
    doc('2026-07-10', { weight_kg: 84, fat_mass_kg: 20 }),
    doc('2026-08-12', { weight_kg: 82, fat_mass_kg: 18 }),
    doc('2026-08-20', { weight_kg: 82, fat_mass_kg: 18 }),
    doc('2026-10-08', { weight_kg: 80, fat_mass_kg: 16 }), // ffm 64 → FFMI 19.75, FMI 4.94 at 1.80 m
  ];
  const bp = bodyProfile({ measures, heightM: 1.8, sex: 'male' });
  eq(bp.status, 'ok');
  near(bp.ffmi, 64 / 3.24, 1e-9);
  near(bp.fmi, 16 / 3.24, 1e-9);
  eq(bp.col, 2); // FFMI 19.75: between 19 and 21
  eq(bp.row, 1); // FMI 4.94: between 3 and 6
  eq(bp.trail.map((t) => t.month).join(), '2026-07,2026-08'); // not the current month
  eq(bp.day, '2026-10-08');
});

test('Body Profile: derives the missing half, and asks for what it needs', () => {
  near(indices({ weight_kg: 80, fat_free_mass_kg: 64 }, 1.8).fmi, 16 / 3.24, 1e-9);
  eq(indices({ weight_kg: 80 }, 1.8), null);
  eq(bodyProfile({ measures: [doc('2026-10-08', { weight_kg: 80, fat_mass_kg: 16 })], heightM: null, sex: 'male' }).status, 'needs-height');
  eq(bodyProfile({ measures: [doc('2026-10-08', { weight_kg: 80 })], heightM: 1.8, sex: 'male' }).status, 'needs-comp');
  eq(bodyProfile({ measures: [], heightM: 1.8, sex: 'female' }).status, 'needs-comp');
  const f = bodyProfile({ measures: [doc('2026-10-08', { weight_kg: 62, fat_mass_kg: 17 })], heightM: 1.65, sex: 'female' });
  eq(f.col, 2); // FFMI 45/2.7225 = 16.5: above 16.5, below 18
  eq(f.row, 1); // FMI 6.2: between 5 and 9
});

// ---------- delta formatter, goal sentence, share text ----------

test('delta formatter: anything that rounds to nothing is "same"; never −0 or +0.0', () => {
  eq(fmtDelta(-0.04, { digits: 1, unit: 'lb' }).text, 'same');
  eq(fmtDelta(0.04, { digits: 1, unit: 'lb' }).text, 'same');
  eq(fmtDelta(-0).text, 'same');
  eq(fmtDelta(-0.4).text, 'same');
  eq(fmtDelta(1).text, '+1');
  eq(fmtDelta(-4, { digits: 1, unit: 'lb' }).text, '−4.0 lb');
  eq(fmtDelta(3.2, { unit: 'ms' }).text, '+3 ms');
  eq(fmtDelta(-0.4).sign, 0);
  eq(fmtDelta(null), null);
});

test('Today’s goal sentence and the Goal path card use the same date; the chart line ends there too', () => {
  const s = wline((k) => 90 - 0.1 * k);
  const p = goalPath({ series: s, goalKg: 85, today: TODAY });
  eq(goalLine(p, (d) => d), `On pace for your goal around ${p.etaDay}`);
  eq(goalProjection(p).day, p.etaDay);
  const flat = goalPath({ series: wline(() => 90), goalKg: 85, today: TODAY });
  eq(goalLine(flat, (d) => d), ''); // no date anywhere
  eq(goalProjection(flat), null);
});

test('share text: only what is on the card, then a "Shared from Forge" footer', () => {
  const r = {
    days: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
    score: { now: 72.4, delta: 3.2 }, training: { workouts: 3, planned: 4, prs: 1 }, weight: { change: -0.5 },
    suggestion: { text: 'Aim for 4 workouts next week.' },
    recovery: { hrv: { now: 61 }, rhr: { now: 49 }, sleep: { now: 400 } }, comp: { fat: { now: 15 } }, // other cards: must not leak
  };
  const text = reportText(r, 'metric');
  const lines = text.split('\n');
  assert(/^Forge weekly report · /.test(lines[0]), lines[0]);
  assert(lines.includes('Forge Score 72 (+3)'), text);
  assert(lines.includes('Workouts 3/4 · 1 PR'), text);
  assert(lines.includes('Weight trend −0.5 kg'), text);
  eq(lines[lines.length - 1], 'Shared from Forge');
  assert(!/HRV|heart|sleep|61|49|fat/i.test(text), 'no recovery or body-comp values');
  const same = reportText({ ...r, score: { now: 72, delta: 0.2 }, weight: { change: -0.01 } }, 'metric');
  assert(!/−0|\+0/.test(same) && /steady/.test(same), same);
});
