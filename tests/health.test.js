// Apple Health: Readiness, Forge Score math, the generator's Readiness hook, and the export.zip reader.
// Synthetic data only (no real health values anywhere in this repo).
import { test, eq, near, assert } from './harness.js';
import { readiness, loadFromFatigue, CUTS } from '../js/health/readiness.js';
import { shiftDay, tempDelta, indexDays, zScore } from '../js/health/metrics.js';
import { piecewise, MAP, PILLARS, COMPONENTS, scoreDay, forgeScore, slope, theilSen } from '../js/health/score.js';
import { createAggregator, parseExport } from '../js/health/apple-export.js';
import { listEntries, exportTextStream } from '../js/health/zip.js';
import { fieldStatus } from '../js/health/status.js';
import { generateWorkout } from '../js/workouts/generator.js';
import { EXERCISES } from '../js/workouts/exercises.js';
import { LOCATION_PRESETS } from '../js/workouts/equipment.js';

const TODAY = '2026-10-10';
const wiggle = (i, n, amp) => ((i * 7) % n - (n - 1) / 2) * amp;

/** `n` normal days ending yesterday, plus optional overrides for today. */
function history(n = 30, today = {}) {
  const rows = [];
  for (let i = n; i >= 1; i--) {
    const day = shiftDay(TODAY, -i);
    rows.push({
      id: day, hrv_sdnn_ms: 50 + wiggle(i, 5, 1.5), rhr_bpm: 55 + wiggle(i, 3, 1), resp_rate: 14 + wiggle(i, 3, 0.2),
      wrist_temp_delta_c: wiggle(i, 5, 0.06), steps: 8000, exercise_min: 30,
      sleep: { asleep_min: 420 + wiggle(i, 7, 8), deep_min: 60, rem_min: 90, in_bed_start: `${shiftDay(day, -1)}T23:00:00Z`, in_bed_end: `${day}T07:00:00Z` },
    });
  }
  if (today) rows.push({ id: TODAY, hrv_sdnn_ms: 50, rhr_bpm: 55, resp_rate: 14, wrist_temp_delta_c: 0, sleep: { asleep_min: 420 }, ...today });
  return rows;
}

// ---------- Readiness ----------
test('readiness: needs 14 days of history; before that it says it is still building', () => {
  const r = readiness({ rows: history(10), today: TODAY });
  eq(r.status, 'building');
  eq(r.baselineDays, 10);
  eq(readiness({ rows: [], today: TODAY }).status, 'none');
  eq(readiness({ rows: history(30, null).filter((r) => r.id <= shiftDay(TODAY, -3)), today: TODAY }).status, 'waiting'); // nothing from today or yesterday yet
  eq(readiness({ rows: history(14), today: TODAY }).status, 'ok');
});

test('readiness: a normal morning is green and says so in plain words', () => {
  const r = readiness({ rows: history(30), today: TODAY });
  eq(r.status, 'ok');
  eq(r.level, 'green');
  assert(r.composite > CUTS.amber);
  assert(typeof r.reason === 'string' && r.reason.length > 10);
});

test('readiness: low HRV + high resting HR + short sleep is red, and the top reason is the biggest drag', () => {
  const r = readiness({ rows: history(30, { hrv_sdnn_ms: 36, rhr_bpm: 62, sleep: { asleep_min: 300 } }), today: TODAY });
  eq(r.level, 'red');
  assert(/HRV is \d+% lower/.test(r.reason) || /Resting heart rate is up/.test(r.reason) || /slept/.test(r.reason), r.reason);
  assert(r.parts.find((p) => p.key === 'hrv').z < -1.5);
});

test('readiness: one off signal is amber', () => {
  const r = readiness({ rows: history(30, { hrv_sdnn_ms: 43, rhr_bpm: 57 }), today: TODAY });
  eq(r.level, 'amber');
  assert(r.parts.find((p) => p.key === 'hrv').dir === 'bad');
});

test('readiness: before this morning’s data arrives it is still yesterday’s verdict, flagged stale (and not used for the workout)', () => {
  const rows = history(30, null); // last row is yesterday
  const r = readiness({ rows, today: TODAY });
  eq(r.status, 'ok');
  eq(r.stale, true);
  eq(r.fromDay, shiftDay(TODAY, -1));
  const fresh = readiness({ rows: history(30), today: TODAY });
  eq(fresh.stale, false);
  eq(fresh.fromDay, TODAY);
});

test('readiness: the wrist-temperature sentence is in °F for imperial users (0.6 °C = 1.1 °F) and °C for metric', () => {
  const rows = history(30, { wrist_temp_delta_c: 0.6 });
  const text = (units) => readiness({ rows, today: TODAY, units }).parts.find((p) => p.key === 'temp').text;
  assert(/1\.1 °F/.test(text('imperial')), text('imperial'));
  assert(/0\.6 °C/.test(text('metric')), text('metric'));
});

test('readiness: wrist temperature 1 °C off your normal forces at least amber, in either direction', () => {
  for (const t of [1.1, -1.1]) eq(readiness({ rows: history(30, { wrist_temp_delta_c: t }), today: TODAY }).level === 'green', false);
});

test('readiness: yesterday’s hard training costs points, and is the headline when your body signals are fine', () => {
  const rows = history(30);
  const rested = readiness({ rows, today: TODAY, load: 0 });
  const sore = readiness({ rows, today: TODAY, load: 1 });
  near(rested.composite - sore.composite, 0.5, 1e-9);
  const tired = readiness({ rows: history(30, { hrv_sdnn_ms: 49, rhr_bpm: 55.5, sleep: { asleep_min: 405 } }), today: TODAY, load: 1 });
  eq(tired.level, 'amber');
  assert(/trained hard/.test(tired.reason), tired.reason);
  near(loadFromFatigue({ a: 6, b: 6, c: 6, d: 0 }), 1, 1e-9);
  near(loadFromFatigue({ a: 3, b: 0, c: 0 }), 1 / 6, 1e-9);
});

test('readiness: uses the most recent day within one day, ignores deleted days, and derives wrist-temp delta from absolute values', () => {
  const rows = history(30, null);
  rows.push({ id: shiftDay(TODAY, -1), hrv_sdnn_ms: 50, rhr_bpm: 55, sleep: { asleep_min: 420 } }); // yesterday's, fine
  eq(readiness({ rows, today: TODAY }).status, 'ok');
  const gone = rows.map((r) => ({ ...r, deleted: true }));
  eq(readiness({ rows: gone, today: TODAY }).status, 'none');
  const abs = [];
  for (let i = 10; i >= 1; i--) abs.push({ id: shiftDay(TODAY, -i), wrist_temp_c: 35.5 });
  abs.push({ id: TODAY, wrist_temp_c: 36.3 });
  near(tempDelta(indexDays(abs), TODAY), 0.8, 1e-9);
  eq(tempDelta(indexDays(abs.slice(7)), TODAY), null); // fewer than 5 earlier nights: no baseline yet
});

test('zScore floors the spread so a very steady baseline cannot explode', () => {
  const z = zScore(60, [50, 50, 50, 50], 1.5);
  near(z.z, 10 / 1.5, 1e-9);
});

// ---------- generator ----------
const HOME = LOCATION_PRESETS.find((l) => l.key === 'home');
const profile = { experience: 'intermediate', sessionMin: 75, trainingDays: 4, injuries: '' };
const gen = (readiness) => generateWorkout({ programKey: 'full_body_3x', dayType: 'full_a', location: HOME, profile, exercises: EXERCISES, unit: 'lb', readiness });
const accessorySets = (w) => w.exercises.filter((i) => i.role === 'accessory').map((i) => i.target.sets);

test('generator: green and unknown readiness change nothing', () => {
  const base = gen(null);
  eq(JSON.stringify(gen({ level: 'green' }).exercises), JSON.stringify(base.exercises));
  eq(gen({ level: 'green' }).readiness, null);
});

test('generator: amber takes one set off every accessory (never below 1), mains untouched', () => {
  const base = gen(null);
  const amber = gen({ level: 'amber' });
  assert(accessorySets(base).length > 0, 'the day has accessories');
  eq(JSON.stringify(accessorySets(amber)), JSON.stringify(accessorySets(base).map((n) => Math.max(1, n - 1))));
  eq(JSON.stringify(amber.exercises.filter((i) => i.role !== 'accessory').map((i) => i.target.sets)), JSON.stringify(base.exercises.filter((i) => i.role !== 'accessory').map((i) => i.target.sets)));
  eq(amber.readiness, 'amber');
  assert(amber.notes.some((n) => /amber/i.test(n)));
});

test('generator: red makes a lighter deload-style day, flagged for the override; overriding restores the normal plan', () => {
  const base = gen(null);
  const red = gen({ level: 'red' });
  eq(red.readinessDeload, true);
  eq(red.readiness, 'red');
  eq(red.deload, false);
  const total = (w) => w.exercises.reduce((n, i) => n + i.target.sets, 0);
  assert(total(red) < total(base), 'fewer sets on a red day');
  assert(red.notes.some((n) => /lighter day/i.test(n)));
  const ov = gen({ level: 'red', override: true });
  eq(ov.readinessDeload, false);
  eq(JSON.stringify(ov.exercises), JSON.stringify(base.exercises));
});

// ---------- Forge Score math ----------
test('piecewise: interpolates, clamps at both ends, ignores non-numbers', () => {
  const m = [[0, 0], [10, 100]];
  near(piecewise(m, 5), 50, 1e-9);
  eq(piecewise(m, -5), 0);
  eq(piecewise(m, 50), 100);
  eq(piecewise(m, NaN), null);
});

test('mappings: every documented anchor (docs/forge-score.md)', () => {
  eq(piecewise(MAP.recoveryZ, 0), 75); eq(piecewise(MAP.recoveryZ, 1), 100); eq(piecewise(MAP.recoveryZ, 1.5), 100); eq(piecewise(MAP.recoveryZ, -2), 0); eq(piecewise(MAP.recoveryZ, -1), 37.5);
  eq(piecewise(MAP.tempDelta, 0.5), 100); eq(piecewise(MAP.tempDelta, 1), 0); near(piecewise(MAP.tempDelta, 0.75), 50, 1e-9);
  eq(piecewise(MAP.sleepDuration, 420), 100); eq(piecewise(MAP.sleepDuration, 600), 100); eq(piecewise(MAP.sleepDuration, 240), 0); eq(piecewise(MAP.sleepDuration, 360), 55);
  eq(piecewise(MAP.sleepRegularity, 30), 100); eq(piecewise(MAP.sleepRegularity, 90), 0);
  eq(piecewise(MAP.exerciseMin, 150), 100); eq(piecewise(MAP.exerciseMin, 75), 50);
  eq(piecewise(MAP.steps, 8000), 100); eq(piecewise(MAP.steps, 5000), 50);
  eq(piecewise(MAP.acwr, 0.8), 100); eq(piecewise(MAP.acwr, 1.3), 100); eq(piecewise(MAP.acwr, 2), 0); eq(piecewise(MAP.acwr, 1.0), 100);
  eq(piecewise(MAP.lean, -0.1), 100); eq(piecewise(MAP.lean, 0.3), 100); eq(piecewise(MAP.lean, -0.5), 0);
  eq(piecewise(MAP.paceLose, 0.5), 100); eq(piecewise(MAP.paceLose, 1), 100); eq(piecewise(MAP.paceLose, 2), 0); eq(piecewise(MAP.paceLose, -1), 0);
  eq(piecewise(MAP.planned, 1), 100);
  for (const [name, pts] of Object.entries(MAP)) {
    assert(pts.every((p, i) => i === 0 || p[0] > pts[i - 1][0]), `${name} x values must increase`);
    assert(pts.every((p) => p[1] >= 0 && p[1] <= 100), `${name} stays in 0..100`);
  }
});

test('pillar weights are the brief’s defaults and add to 100%; component weights add up inside a pillar', () => {
  eq(JSON.stringify(Object.fromEntries(Object.entries(PILLARS).map(([k, v]) => [k, v.weight]))), JSON.stringify({ body: 0.25, recovery: 0.2, sleep: 0.15, training: 0.25, nutrition: 0.15 }));
  near(Object.values(PILLARS).reduce((a, p) => a + p.weight, 0), 1, 1e-9);
  near(COMPONENTS.sleep.reduce((a, c) => a + c[2], 0), 1, 1e-9);
});

test('scoreDay: weighted mean of pillars; a missing pillar’s weight is shared among the rest (Nutrition: not tracked yet)', () => {
  const c = (v) => ({ value: v, raw: '' });
  const comps = {
    body: { pace: c(80) }, recovery: { hrv: c(100), rhr: c(60) }, sleep: { duration: c(90) }, training: { planned: c(50) }, nutrition: {},
  };
  const s = scoreDay(comps);
  eq(s.pillars.recovery, 80);
  eq(s.pillars.nutrition, null);
  near(s.score, (80 * 0.25 + 80 * 0.2 + 90 * 0.15 + 50 * 0.25) / 0.85, 1e-9);
  eq(scoreDay({ body: {}, recovery: {}, sleep: {}, training: {}, nutrition: {} }).score, null);
  // sleep pillar uses its own component weights (0.4 / 0.4 / 0.2)
  near(scoreDay({ sleep: { duration: c(100), regularity: c(0), stages: c(100) } }).pillars.sleep, 60, 1e-9);
});

test('slope and Theil–Sen: exact on a line; Theil–Sen shrugs off one wild reading', () => {
  const line = [[0, 10], [1, 12], [2, 14], [3, 16]];
  near(slope(line), 2, 1e-9);
  near(theilSen(line), 2, 1e-9);
  near(theilSen([...line, [4, 90]]), 2.5, 1.5); // OLS would jump to ~15
  assert(slope([...line, [4, 90]]) > 10);
});

// A 28-day synthetic account: steady losing weight, good recovery, regular training.
function account() {
  const series = [];
  const measures = [];
  for (let i = 28; i >= 0; i--) {
    const day = shiftDay(TODAY, -i);
    const kg = 90 - (28 - i) * 0.07; // ~0.5 kg a week = 0.55% a week
    series.push({ day, kg, trend: kg });
    if (i % 2 === 0) measures.push({ day, metrics: { fat_mass_kg: 20 - (28 - i) * 0.06, fat_free_mass_kg: 70 - (28 - i) * 0.005 } });
  }
  const workouts = [];
  for (let i = 40; i >= 0; i -= 2) {
    const day = shiftDay(TODAY, -i);
    workouts.push({
      status: 'done', started_at: `${day}T17:00:00`, finished_at: `${day}T18:00:00`,
      exercises: [{ exercise_id: 'bb_back_squat', role: 'main', sets: Array.from({ length: 4 }, () => ({ done: true, weight_kg: 100 + (40 - i) * 0.5, reps: 5 })) }],
    });
  }
  return { rows: history(45), series, measures, workouts, cardio: [], profile: { goal: 'lose', trainingDays: 3, heightCm: 180, sex: 'male' }, today: TODAY };
}

test('forgeScore: a steady, healthy account scores well; Nutrition is "not tracked yet" and its weight is shared out', () => {
  const r = forgeScore(account());
  assert(r.score > 70 && r.score <= 100, `score ${r.score}`);
  eq(r.notTracked.join(), 'nutrition');
  const eff = r.pillars.reduce((a, p) => a + p.effective, 0);
  near(eff, 1, 1e-9);
  const nut = r.pillars.find((p) => p.key === 'nutrition');
  eq(nut.tracked, false);
  eq(nut.effective, 0);
  near(r.pillars.find((p) => p.key === 'body').effective, 0.25 / 0.85, 1e-9);
  eq(r.days.length, 14);
  assert(r.pillars.every((p) => p.tracked ? p.components.some((c) => c.raw) : true), 'tracked pillars show their raw inputs');
  const pace = r.pillars.find((p) => p.key === 'body').components.find((c) => c.key === 'pace');
  assert(pace.value > 90, `on-pace weight loss scores high, got ${pace.value}`);
  assert(/% of body weight a week/.test(pace.raw));
});

test('forgeScore: wrong direction and too-fast weight change score low; poor sleep drags the sleep pillar', () => {
  const a = account();
  const up = { ...a, series: a.series.map((p, i) => ({ ...p, trend: 90 + i * 0.1 })) };
  const upPace = forgeScore(up).pillars.find((p) => p.key === 'body').components.find((c) => c.key === 'pace').value;
  assert(upPace < 20, `gaining while cutting: ${upPace}`);
  const fast = { ...a, series: a.series.map((p, i) => ({ ...p, trend: 90 - i * 0.35 })) };
  assert(forgeScore(fast).pillars.find((p) => p.key === 'body').components.find((c) => c.key === 'pace').value < 50);
  const bad = { ...a, rows: a.rows.map((r) => ({ ...r, sleep: { ...r.sleep, asleep_min: 300 } })) };
  assert(forgeScore(bad).pillars.find((p) => p.key === 'sleep').score < forgeScore(a).pillars.find((p) => p.key === 'sleep').score - 15);
});

test('forgeScore: "what moved it" lists the top 3 component changes vs the week before', () => {
  const a = account();
  // This week's HRV tanks (last 7 days), the week before was normal.
  const rows = a.rows.map((r) => (r.id > shiftDay(TODAY, -7) ? { ...r, hrv_sdnn_ms: 32 } : r));
  const r = forgeScore({ ...a, rows });
  assert(r.movers.length >= 1 && r.movers.length <= 3);
  eq(r.movers[0].key, 'hrv');
  assert(r.movers[0].delta < 0);
  for (let i = 1; i < r.movers.length; i++) assert(Math.abs(r.movers[i - 1].impact) >= Math.abs(r.movers[i].impact));
});

test('forgeScore: with no Apple Health data only Body + Training are tracked, so there is no overall score', () => {
  const a = account();
  const r = forgeScore({ ...a, rows: [] });
  eq(r.score, null);
  eq(r.trackedCount, 2);
  assert(r.days.every((d) => d.score == null));
  assert(forgeScore(a).score != null, 'with Apple Health it is back');
});

test('forgeScore: a Red-readiness week cannot score in the 90s, and costs real points against a normal week', () => {
  const a = account();
  const red = forgeScore({ ...a, rows: a.rows.map((r) => (r.id > shiftDay(TODAY, -7) ? { ...r, hrv_sdnn_ms: 34, rhr_bpm: 62, sleep: { ...r.sleep, asleep_min: 300 } } : r)) });
  assert(red.score < 88, `red week ${red.score}`);
  assert(forgeScore(a).score - red.score > 6, `normal ${forgeScore(a).score} vs red ${red.score}`);
  const rec = red.pillars.find((p) => p.key === 'recovery').score;
  assert(rec < 50, `recovery in a red week ${rec}`);
  const normal = forgeScore(a).pillars.find((p) => p.key === 'recovery').score;
  assert(normal > 60 && normal < 90, `recovery at your usual ${normal}`);
});

test('forgeScore: no data at all gives no score (not a zero), and nothing throws', () => {
  const r = forgeScore({ today: TODAY });
  eq(r.score, null);
  eq(r.movers.length, 0);
  assert(r.pillars.every((p) => !p.tracked));
});

// ---------- Apple Health export ----------
const rec = (type, value, start, end, extra = '') => `<Record type="${type}" sourceName="Test Watch" unit="x" creationDate="${end}" startDate="${start}" endDate="${end}" value="${value}"${extra}/>`;
const T = 'HKQuantityTypeIdentifier';
const xml = () => `<?xml version="1.0"?><HealthData locale="en_US">
<ExportDate value="2026-10-10 08:00:00 -0400"/>
${rec(`${T}HeartRateVariabilitySDNN`, 40, '2026-10-09 03:00:00 -0400', '2026-10-09 03:01:00 -0400')}
${rec(`${T}HeartRateVariabilitySDNN`, 60, '2026-10-09 05:00:00 -0400', '2026-10-09 05:01:00 -0400')}
${rec(`${T}HeartRateVariabilitySDNN`, 99, '2026-10-09 15:00:00 -0400', '2026-10-09 15:01:00 -0400')}
${rec(`${T}RestingHeartRate`, 54, '2026-10-09 00:00:00 -0400', '2026-10-09 23:59:00 -0400')}
${rec(`${T}OxygenSaturation`, 0.97, '2026-10-09 04:00:00 -0400', '2026-10-09 04:01:00 -0400')}
${rec(`${T}StepCount`, 1000, '2026-10-09 09:00:00 -0400', '2026-10-09 09:10:00 -0400')}
<Record type="${T}StepCount" sourceName="Test Watch" unit="count" startDate="2026-10-09 09:00:00 -0400" endDate="2026-10-09 09:10:00 -0400" value="900"><MetadataEntry key="a" value="b"/></Record>
<Record type="${T}StepCount" sourceName="Test Phone" unit="count" startDate="2026-10-09 09:00:00 -0400" endDate="2026-10-09 09:10:00 -0400" value="1100"/>
${rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepCore', '2026-10-08 23:00:00 -0400', '2026-10-09 01:00:00 -0400')}
${rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepDeep', '2026-10-09 01:00:00 -0400', '2026-10-09 02:00:00 -0400')}
${rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepREM', '2026-10-09 02:00:00 -0400', '2026-10-09 03:30:00 -0400')}
${rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAwake', '2026-10-09 03:30:00 -0400', '2026-10-09 03:40:00 -0400')}
${rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepCore', '2026-10-09 00:30:00 -0400', '2026-10-09 01:30:00 -0400')}
${rec(`${T}StepCount`, 5, '2020-01-01 09:00:00 -0400', '2020-01-01 09:10:00 -0400')}
</HealthData>`;

test('export: daily summaries — overnight HRV mean, one source for steps, stages without double counting, old days dropped', async () => {
  const text = xml();
  const agg = createAggregator({ since: '2026-09-01' });
  // feed in awkward chunks, including splits inside tags, to prove the stream carry works
  for (let i = 0; i < text.length; i += 97) agg.feed(text.slice(i, i + 97));
  const days = agg.finish();
  eq(days.length, 1);
  const d = days[0];
  eq(d.day, '2026-10-09');
  eq(d.hrv_sdnn_ms, 50); // 40 and 60 overnight; the 3 pm 99 is ignored
  eq(d.hrv_samples, 2);
  eq(d.rhr_bpm, 54);
  eq(d.spo2_avg_pct, 97);
  eq(d.steps, 1900); // watch 1000 + 900 beats phone 1100: one source, not the sum of both (2900 would double count)
  eq(JSON.stringify([d.sleep.asleep_min, d.sleep.core_min, d.sleep.deep_min, d.sleep.rem_min, d.sleep.awake_min]), JSON.stringify([270, 150, 60, 90, 10]));
  eq(d.sleep.in_bed_start, '2026-10-09T03:00:00.000Z');
  eq(d.sleep.in_bed_end, '2026-10-09T07:40:00.000Z');
});

test('export: wrist temperature recorded in °F (unit="degF") is converted to °C before averaging; °C is left alone', () => {
  const t = (v, unit) => `<Record type="${T}AppleSleepingWristTemperature" sourceName="Test Watch" unit="${unit}" startDate="2026-10-09 03:00:00 -0400" endDate="2026-10-09 03:01:00 -0400" value="${v}"/>`;
  const run = (xmlText) => { const g = createAggregator({ since: '2026-10-01' }); g.feed(xmlText); return g.finish(); };
  const f = run(`<HealthData>${t(96.8, 'degF')}${t(98.6, 'degF')}</HealthData>`);
  near(f[0].wrist_temp_c, 36.5, 0.01); // mean of 36.0 and 37.0
  const c = run(`<HealthData>${t(36.4, 'degC')}</HealthData>`);
  near(c[0].wrist_temp_c, 36.4, 1e-9);
});

test('export: an evening sleep segment belongs to tomorrow’s wake-up; wrist temperature gets a delta from the previous nights', () => {
  const lines = [];
  for (let i = 8; i >= 1; i--) lines.push(rec(`${T}AppleSleepingWristTemperature`, 35.5, `2026-10-0${i} 03:00:00 -0400`, `2026-10-0${i} 03:01:00 -0400`));
  lines.push(rec(`${T}AppleSleepingWristTemperature`, 36.1, '2026-10-09 03:00:00 -0400', '2026-10-09 03:01:00 -0400'));
  lines.push(rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepUnspecified', '2026-10-09 22:00:00 -0400', '2026-10-09 23:30:00 -0400'));
  lines.push(rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisInBed', '2026-10-09 21:00:00 -0400', '2026-10-09 22:00:00 -0400'));
  const agg = createAggregator({ since: '2026-10-01' });
  agg.feed(`<HealthData>${lines.join('\n')}</HealthData>`);
  const days = agg.finish();
  const nine = days.find((x) => x.day === '2026-10-09');
  near(nine.wrist_temp_delta_c, 0.6, 1e-9);
  eq(nine.sleep, undefined, 'the evening segment is tomorrow’s');
  const ten = days.find((x) => x.day === '2026-10-10');
  eq(ten.sleep.asleep_min, 90);
  eq(days.find((x) => x.day === '2026-10-03').wrist_temp_delta_c, undefined, 'fewer than 5 earlier nights: no delta');
  // The days it reports are exactly what the server accepts: only known fields, no raw records.
  const allowed = new Set(['day', 'hrv_sdnn_ms', 'hrv_samples', 'rhr_bpm', 'resp_rate', 'wrist_temp_c', 'wrist_temp_delta_c', 'spo2_avg_pct', 'walking_hr_avg', 'vo2max', 'steps', 'active_kcal', 'exercise_min', 'sleep']);
  for (const d of days) for (const k of Object.keys(d)) assert(allowed.has(k), k);
});

// ---- zip: built in the test with Node's zlib (skipped in the browser runner) ----
const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

function makeZip(zlib, entries, { zip64 = false } = {}) {
  const parts = [];
  const cd = [];
  let offset = 0;
  const w16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const w32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  for (const [name, data, method] of entries) {
    const raw = Buffer.from(data);
    const comp = method === 0 ? raw : zlib.deflateRawSync(raw);
    const nm = Buffer.from(name);
    const local = Buffer.concat([w32(0x04034b50), w16(20), w16(0), w16(method), w16(0), w16(0), w32(0), w32(comp.length), w32(raw.length), w16(nm.length), w16(0), nm]);
    const big = zip64 ? Buffer.concat([w16(1), w16(8), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(offset)); return b; })()]) : Buffer.alloc(0);
    cd.push(Buffer.concat([w32(0x02014b50), w16(45), w16(20), w16(0), w16(method), w16(0), w16(0), w32(0), w32(comp.length), w32(raw.length), w16(nm.length), w16(big.length), w16(0), w16(0), w16(0), w32(0), w32(zip64 ? 0xffffffff : offset), nm, big]));
    parts.push(local, comp);
    offset += local.length + comp.length;
  }
  const cdBuf = Buffer.concat(cd);
  const tail = [cdBuf];
  const cdStart = offset;
  if (zip64) {
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4); z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14);
    z.writeBigUInt64LE(BigInt(entries.length), 24); z.writeBigUInt64LE(BigInt(entries.length), 32); z.writeBigUInt64LE(BigInt(cdBuf.length), 40); z.writeBigUInt64LE(BigInt(cdStart), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(cdStart + cdBuf.length), 8); loc.writeUInt32LE(1, 16);
    tail.push(z, loc);
  }
  const end = Buffer.concat([w32(0x06054b50), w16(0), w16(0), w16(zip64 ? 0xffff : entries.length), w16(zip64 ? 0xffff : entries.length), w32(zip64 ? 0xffffffff : cdBuf.length), w32(zip64 ? 0xffffffff : cdStart), w16(0)]);
  return new Blob([...parts, ...tail, end]);
}

async function readAll(stream) {
  let out = '';
  const r = stream.getReader();
  for (;;) { const { value, done } = await r.read(); if (done) break; out += value; }
  return out;
}

for (const zip64 of [false, true]) {
  test(`export.zip${zip64 ? ' (zip64)' : ''}: finds export.xml among other files, streams it decompressed, and parses it`, async () => {
    if (!isNode) return;
    const zlib = await import('node:zlib');
    const file = makeZip(zlib, [
      ['apple_health_export/electrocardiograms/ecg_2026-10-01.csv', 'secret,ecg', 0],
      ['apple_health_export/export_cda.xml', '<decoy/>', 8],
      ['apple_health_export/export.xml', xml(), 8],
      ['apple_health_export/workout-routes/route_1.gpx', '<gpx/>', 8],
    ], { zip64 });
    file.name = 'export.zip';
    const names = (await listEntries(file)).map((e) => e.name);
    assert(names.includes('apple_health_export/export.xml') && names.length === 4, names.join());
    let progress = 0;
    const text = await readAll(await exportTextStream(file, (p) => { progress = p; }));
    eq(text, xml());
    eq(progress, 1);
    const { days } = await parseExport(await exportTextStream(file), { since: '2026-09-01' });
    eq(days.length, 1);
    eq(days[0].hrv_sdnn_ms, 50);
  });
}

test('export: a stored (uncompressed) entry works; a plain export.xml can be chosen directly; a non-zip is refused kindly', async () => {
  if (!isNode) return;
  const zlib = await import('node:zlib');
  const stored = makeZip(zlib, [['export.xml', xml(), 0]]);
  eq(await readAll(await exportTextStream(stored)), xml());
  const plain = new Blob([xml()]);
  plain.name = 'export.xml';
  eq(await readAll(await exportTextStream(plain)), xml());
  let msg = '';
  try { await listEntries(new Blob(['not a zip at all, just text'])); } catch (e) { msg = e.message; }
  assert(/zip/i.test(msg), msg);
  let missing = '';
  try { await exportTextStream(makeZip(zlib, [['other.txt', 'x', 8]])); } catch (e) { missing = e.message; }
  assert(/export\.xml/.test(missing), missing);
});

test('data check: last day, which kinds of data arrived, and how many of the last 28 days have each', () => {
  const rows = history(20, { sleep: undefined, wrist_temp_delta_c: undefined });
  const st = fieldStatus(rows, TODAY);
  eq(st.lastDay, TODAY);
  eq(st.days, 21);
  const f = (k) => st.fields.find((x) => x.key === k);
  eq(f('hrv').count28, 21);
  eq(f('hrv').lastDay, TODAY);
  eq(f('sleep').lastDay, shiftDay(TODAY, -1));
  eq(f('vo2').lastDay, null);
  eq(f('vo2').count28, 0);
  eq(fieldStatus([], TODAY).lastDay, null);
});
