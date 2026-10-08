// Shared math for Apple Health days (users/{uid}/health_daily/{YYYY-MM-DD}): day keys, baselines, z-scores.
// Pure functions, no DOM. Readiness (readiness.js) and the Forge Score (score.js) build on these.

export const shiftDay = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Rows → Map(day → row), skipping deleted days. */
export function indexDays(rows = []) {
  const m = new Map();
  for (const r of rows) if (r && !r.deleted && /^\d{4}-\d{2}-\d{2}$/.test(r.id || r.day || '')) m.set(r.id || r.day, r);
  return m;
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * Wrist temperature delta (°C from your own baseline) for a day. Uses the stored delta; if only the
 * absolute sleeping temperature was sent, it's compared with the mean of the previous 28 days (needs 5).
 */
export function tempDelta(days, day) {
  const r = days.get(day);
  if (!r) return null;
  if (num(r.wrist_temp_delta_c) != null) return r.wrist_temp_delta_c;
  if (num(r.wrist_temp_c) == null) return null;
  const prior = windowValues(days, shiftDay(day, -28), shiftDay(day, -1), (x) => num(x.wrist_temp_c));
  return prior.length >= 5 ? r.wrist_temp_c - mean(prior) : null;
}

/** Metric getters on a day row (null when missing). */
export const GET = {
  hrv: (r) => num(r.hrv_sdnn_ms),
  rhr: (r) => num(r.rhr_bpm),
  sleep: (r) => (r.sleep ? num(r.sleep.asleep_min) : null),
  resp: (r) => num(r.resp_rate),
  steps: (r) => num(r.steps),
  exercise: (r) => num(r.exercise_min),
};

/** Values of get(row) for rows whose day is in [from, to] (inclusive), oldest first. */
export function windowValues(days, from, to, get) {
  const out = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) {
    const r = days.get(d);
    const v = r ? get(r) : null;
    if (v != null) out.push(v);
  }
  return out;
}

/** Days in [from, to] that have at least one of the core overnight signals (HRV, resting HR, sleep). */
export function coreDayCount(days, from, to) {
  let n = 0;
  for (let d = from; d <= to; d = shiftDay(d, 1)) {
    const r = days.get(d);
    if (r && (GET.hrv(r) != null || GET.rhr(r) != null || GET.sleep(r) != null)) n++;
  }
  return n;
}

/** The newest day on or before `day` (within `maxBack` days) that has a value: { day, value } or null. */
export function latestValue(days, day, get, maxBack = 1) {
  for (let i = 0; i <= maxBack; i++) {
    const d = shiftDay(day, -i);
    const r = days.get(d);
    const v = r ? get(r) : null;
    if (v != null) return { day: d, value: v };
  }
  return null;
}

/** z-score of x against values, with a floor on the spread so a very steady baseline can't explode it. */
export function zScore(x, values, sdFloor) {
  const m = mean(values);
  const s = Math.max(sd(values) ?? 0, sdFloor);
  return { z: (x - m) / s, mean: m, sd: s };
}
