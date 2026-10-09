// Anomaly rules (W2b). One documented table: THRESHOLDS holds every number, RULES says what each rule needs.
// Each rule looks at the latest days only and returns { id, kind, day, severity (0–1), data } or null.
// Pure functions, no DOM. The wording lives in insights.js; the table is repeated in docs/trends.md.
import { shiftDay, indexDays, mean, GET, tempDelta, windowValues } from './metrics.js';
import { daysBetween } from '../weight/smoothing.js';
import { median } from './trends.js';

export const THRESHOLDS = {
  waterJumpPct: 1.5, // weight this far (%) off the EWMA trend in a day, with water moving the same way → "likely water"
  waterMinKg: 0.2, // …and water must have moved at least this much (kg)
  fatJumpPoints: 2, // body fat % moving more than this in a day → bioimpedance noise
  hrvDropPct: 15, // 7-day mean HRV this far below the 28-day baseline
  hrvRecentDays: 7,
  hrvBaselineDays: 28,
  rhrUpBpm: 5, // resting HR this far above baseline…
  rhrDays: 3, // …for this many days in a row
  tempUpC: 0.5, // wrist temperature this far above your baseline…
  tempNights: 2, // …for this many nights in a row
  sleepShortMin: 360, // asleep under 6 h…
  sleepNights: 3, // …for this many nights in a row
  noWeighInDays: 7, // no weigh-in for this many days…
  weighInUsualGapDays: 7, // …but only if your usual gap between weigh-ins is at most this
  weighInUsualMin: 4, // (needs at least this many weigh-ins in the 8 weeks before)
  baselineMinDays: 10, // a baseline needs at least this many readings
  freshDays: 2, // single-day rules only look at readings this recent
};

export const RULES = [
  { id: 'water', needs: 'weights + hydration_kg', fires: 'weight > 1.5% off trend in a day, water moved the same way' },
  { id: 'fatnoise', needs: 'fat_ratio_pct', fires: 'body fat % jumped > 2 points in a day' },
  { id: 'hrv', needs: 'health_daily.hrv_sdnn_ms', fires: '7-day HRV mean ≥ 15% below the 28-day baseline' },
  { id: 'rhr', needs: 'health_daily.rhr_bpm', fires: 'resting HR ≥ +5 bpm vs baseline for 3+ days in a row' },
  { id: 'temp', needs: 'health_daily.wrist_temp_*', fires: 'wrist temperature ≥ +0.5 °C for 2+ nights in a row' },
  { id: 'sleep', needs: 'health_daily.sleep', fires: 'asleep < 6 h for 3 nights in a row' },
  { id: 'weighin', needs: 'weights', fires: 'no weigh-in for 7 days, if you normally weigh in at least weekly' },
];

/** Length of the run of consecutive days (ending today, or yesterday if today has no value yet) where ok(day) is true. */
function runEnding(today, ok) {
  let end = ok(today) ? today : shiftDay(today, -1);
  let n = 0;
  const days = [];
  while (ok(end)) { days.push(end); n++; end = shiftDay(end, -1); }
  return { n, days: days.reverse() };
}

const fresh = (day, today) => daysBetween(day, today) <= THRESHOLDS.freshDays;

/** weights: [{ day, kg, trend }]. water: [{ day, v }] daily hydration_kg. */
export function waterRule({ weights, water, today }) {
  const T = THRESHOLDS;
  if (weights.length < 2) return null;
  const i = weights.length - 1;
  const p = weights[i];
  if (!fresh(p.day, today)) return null;
  const prevTrend = weights[i - 1].trend;
  const pct = ((p.kg - prevTrend) / prevTrend) * 100;
  if (Math.abs(pct) <= T.waterJumpPct) return null;
  const todayWater = water.find((w) => w.day === p.day);
  const before = water.filter((w) => w.day < p.day && daysBetween(w.day, p.day) <= 14).map((w) => w.v);
  if (!todayWater || !before.length) return null;
  const dW = todayWater.v - mean(before);
  if (Math.sign(dW) !== Math.sign(pct) || Math.abs(dW) < T.waterMinKg) return null;
  return { id: 'water', kind: 'water', day: p.day, severity: 0.25, data: { pct, deltaKg: p.kg - prevTrend, waterKg: dW } };
}

/** fat: [{ day, v }] daily body fat %. */
export function fatNoiseRule({ fat, today }) {
  const T = THRESHOLDS;
  if (fat.length < 2) return null;
  const a = fat[fat.length - 1];
  const b = fat[fat.length - 2];
  if (!fresh(a.day, today) || daysBetween(b.day, a.day) > 2) return null;
  const jump = a.v - b.v;
  if (Math.abs(jump) <= T.fatJumpPoints) return null;
  return { id: 'fatnoise', kind: 'fatnoise', day: a.day, severity: 0.2, data: { jump } };
}

export function hrvRule({ days, today }) {
  const T = THRESHOLDS;
  const recent = windowValues(days, shiftDay(today, -(T.hrvRecentDays - 1)), today, GET.hrv);
  const base = windowValues(days, shiftDay(today, -(T.hrvRecentDays - 1 + T.hrvBaselineDays)), shiftDay(today, -T.hrvRecentDays), GET.hrv);
  if (recent.length < 4 || base.length < T.baselineMinDays) return null;
  const m7 = mean(recent);
  const m28 = mean(base);
  const dropPct = ((m28 - m7) / m28) * 100;
  if (dropPct < T.hrvDropPct) return null;
  return { id: 'hrv', kind: 'hrv', day: today, severity: Math.min(1, 0.5 + dropPct / 60), data: { dropPct, recent: m7, baseline: m28 } };
}

export function rhrRule({ days, today }) {
  const T = THRESHOLDS;
  // Baseline: the 28 days before the run starts. Find the run against a baseline taken before the last N days.
  const baseVals = windowValues(days, shiftDay(today, -(T.rhrDays + 27)), shiftDay(today, -T.rhrDays), GET.rhr);
  if (baseVals.length < T.baselineMinDays) return null;
  const base = median(baseVals);
  const run = runEnding(today, (d) => { const r = days.get(d); const v = r ? GET.rhr(r) : null; return v != null && v - base >= T.rhrUpBpm; });
  if (run.n < T.rhrDays) return null;
  const last = GET.rhr(days.get(run.days[run.days.length - 1]));
  return { id: 'rhr', kind: 'rhr', day: run.days[run.days.length - 1], severity: Math.min(1, 0.6 + (last - base - T.rhrUpBpm) / 20), data: { nights: run.n, base, last, up: last - base } };
}

export function tempRule({ days, today }) {
  const T = THRESHOLDS;
  const run = runEnding(today, (d) => { const t = tempDelta(days, d); return t != null && t >= T.tempUpC; });
  if (run.n < T.tempNights) return null;
  const last = run.days[run.days.length - 1];
  return { id: 'temp', kind: 'temp', day: last, severity: 0.8, data: { nights: run.n, delta: tempDelta(days, last) } };
}

export function sleepRule({ days, today }) {
  const T = THRESHOLDS;
  const run = runEnding(today, (d) => { const r = days.get(d); const v = r ? GET.sleep(r) : null; return v != null && v < T.sleepShortMin; });
  if (run.n < T.sleepNights) return null;
  const last = run.days[run.days.length - 1];
  const avg = mean(run.days.map((d) => GET.sleep(days.get(d))));
  return { id: 'sleep', kind: 'sleep', day: last, severity: 0.6, data: { nights: run.n, avgMin: avg } };
}

/** weights: [{ day }] one per weigh-in day, oldest first. */
export function weighInRule({ weights, today }) {
  const T = THRESHOLDS;
  if (!weights.length) return null;
  const last = weights[weights.length - 1].day;
  const gap = daysBetween(last, today);
  if (gap < T.noWeighInDays) return null;
  const prior = weights.filter((w) => w.day <= last && daysBetween(w.day, last) <= 56);
  if (prior.length < T.weighInUsualMin) return null;
  const gaps = prior.slice(1).map((w, i) => daysBetween(prior[i].day, w.day));
  if (median(gaps) > T.weighInUsualGapDays) return null;
  return { id: 'weighin', kind: 'weighin', day: shiftDay(last, T.noWeighInDays), severity: 0.4, data: { gapDays: gap } };
}

/**
 * ctx: { today, weights: [{day,kg,trend}], series: Map(metric → [{day,v}]), rows (health_daily) }.
 * Returns the anomalies that are firing now.
 */
export function detectAnomalies({ today, weights = [], series = new Map(), rows = [] }) {
  const days = indexDays(rows);
  const ctx = { today, weights, days, water: series.get('hydration_kg') || [], fat: series.get('fat_ratio_pct') || [] };
  return [waterRule, fatNoiseRule, hrvRule, rhrRule, tempRule, sleepRule, weighInRule].map((r) => r(ctx)).filter(Boolean);
}
