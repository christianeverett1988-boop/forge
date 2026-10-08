// Weight trend: an exponentially smoothed average (the "Hacker's Diet" method, 10% per day),
// so one salty dinner or a water swing doesn't move your trend much.
// Pure functions; no browser APIs.

export const ALPHA = 0.1;
const DAY_MS = 86400000;

/** 'YYYY-MM-DD' in local time. */
export function dayKey(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole days between two 'YYYY-MM-DD' keys (b - a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
}

export function addDays(key, n) {
  const t = Date.parse(key + 'T00:00:00Z') + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Sources that come straight from a scale (preferred over typed-in numbers on the same day). */
export const DEVICE_SOURCES = new Set(['withings']);

/**
 * entries: [{ day: 'YYYY-MM-DD', kg, source?, measured_at?, review? }] → one point per day, sorted.
 *   - A day with a scale weigh-in uses the EARLIEST scale weigh-in that day (morning, before food and
 *     training). Typed-in entries that day stay in your history but don't move the trend.
 *   - A day with only typed-in entries averages them.
 *   - Weigh-ins Withings couldn't match to you (review: true) are left out until you confirm them.
 * Each point says which it used: device: true/false.
 */
export function dailyWeights(entries) {
  const byDay = new Map();
  for (const e of entries) {
    if (!e || !e.day || !Number.isFinite(e.kg) || e.review === true) continue;
    const cur = byDay.get(e.day) || { sum: 0, n: 0, device: null };
    if (DEVICE_SOURCES.has(e.source)) {
      const at = e.measured_at || '';
      if (!cur.device || at < cur.device.at) cur.device = { kg: e.kg, at };
    } else {
      cur.sum += e.kg;
      cur.n += 1;
    }
    byDay.set(e.day, cur);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, c]) => (c.device ? { day, kg: c.device.kg, device: true } : { day, kg: c.sum / c.n, device: false }));
}

/** Adds `trend` to each daily point. Gaps of several days get proportionally more weight. */
export function smooth(daily, alpha = ALPHA) {
  const out = [];
  let trend = null;
  let prevDay = null;
  for (const p of daily) {
    if (trend == null) {
      trend = p.kg;
    } else {
      const gap = Math.max(1, daysBetween(prevDay, p.day));
      const a = 1 - Math.pow(1 - alpha, gap);
      trend = trend + a * (p.kg - trend);
    }
    prevDay = p.day;
    out.push({ day: p.day, kg: p.kg, trend, ...(p.device != null ? { device: p.device } : {}) });
  }
  return out;
}

/** Trend now minus trend `days` ago (using the last point on or before that day). Null if not enough data. */
export function trendChange(series, days = 7) {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const cutoff = addDays(last.day, -days);
  let past = null;
  for (const p of series) {
    if (p.day <= cutoff) past = p;
  }
  if (!past) past = series[0];
  if (past === last) return null;
  return last.trend - past.trend;
}

/** Least-squares slope of the trend over the last `windowDays`, in kg per week. Null if < 2 points or < 7 days span. */
export function weeklyRate(series, windowDays = 21) {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const start = addDays(last.day, -windowDays);
  const pts = series.filter((p) => p.day >= start);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => daysBetween(pts[0].day, p.day));
  if (xs[xs.length - 1] < 7) return null;
  const ys = pts.map((p) => p.trend);
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

/** Projected date to reach goalKg at the current rate. Null if not moving toward the goal. */
export function projectGoalDate(series, goalKg, windowDays = 21) {
  if (!Number.isFinite(goalKg) || series.length < 2) return null;
  const rate = weeklyRate(series, windowDays);
  if (rate == null || Math.abs(rate) < 0.02) return null;
  const last = series[series.length - 1];
  const remaining = goalKg - last.trend;
  if (Math.abs(remaining) < 0.1) return { reached: true, day: last.day, weeks: 0, rate };
  if (Math.sign(remaining) !== Math.sign(rate)) return null;
  const weeks = remaining / rate;
  if (weeks > 260) return null; // more than 5 years out isn't a useful projection
  return { reached: false, day: addDays(last.day, Math.round(weeks * 7)), weeks, rate };
}
