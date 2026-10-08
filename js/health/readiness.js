// Readiness: Green / Amber / Red every morning, from Apple Health days (docs/forge-score.md → Readiness).
// z-scores of HRV (+, on ln SDNN), resting HR (−), sleep duration (+), |wrist temperature delta| (−) and
// breathing rate (−) against your own 28 days before, then a small penalty for yesterday's training load.
// Needs at least 14 days of overnight data (the Apple Health export import gives you those on day one).
// The weights, spreads and cut-offs are Forge defaults (nothing here is a clinical threshold).
import { shiftDay, indexDays, GET, windowValues, coreDayCount, latestValue, tempDelta, zScore, clamp, mean } from './metrics.js';

export const NEEDED_DAYS = 14;
export const BASELINE_DAYS = 28;
const MIN_VALUES = 8; // a metric needs this many baseline values to count

export const WEIGHTS = { hrv: 0.35, rhr: 0.25, sleep: 0.2, temp: 0.1, resp: 0.1 };
const SD_FLOOR = { hrv: 0.06, rhr: 1.5, sleep: 30, temp: 0.15, resp: 0.6 }; // ln-ms, bpm, minutes, °C, breaths/min
export const CUTS = { amber: -0.5, red: -1.25 };
export const LOAD_PENALTY = 0.5; // composite points lost at the heaviest load
export const LOAD_FULL = 6; // top-3 muscle fatigue (hard-set units) that costs the whole penalty

/** Yesterday's training load → 0..1 from per-muscle fatigue now (js/workouts/recovery.js fatigueAt). */
export function loadFromFatigue(fatigue) {
  const top = Object.values(fatigue || {}).sort((a, b) => b - a).slice(0, 3);
  return clamp(mean(top) / LOAD_FULL, 0, 1);
}

const fmtH = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

// Plain-words explanation for each signal. dir: 'bad' | 'good' | 'ok'
function words(key, x, base, z) {
  const bad = z < -0.5;
  const good = z > 0.5;
  const dir = bad ? 'bad' : good ? 'good' : 'ok';
  switch (key) {
    case 'hrv': {
      const pct = Math.round((Math.exp(x - base) - 1) * 100);
      return { dir, text: bad ? `Your HRV is ${Math.abs(pct)}% lower than your usual` : good ? `Your HRV is ${pct}% above your usual` : 'Your HRV is right around your usual' };
    }
    case 'rhr': {
      const d = Math.round(x - base);
      return { dir, text: bad ? `Resting heart rate is up ${Math.abs(d)} bpm from your usual` : good ? `Resting heart rate is ${Math.abs(d)} bpm below your usual` : 'Resting heart rate is normal for you' };
    }
    case 'sleep': {
      const d = Math.round(x - base);
      return { dir, text: bad ? `You slept ${fmtH(x)}, about ${fmtH(Math.abs(d))} under your usual` : good ? `You slept ${fmtH(x)}, more than usual` : `You slept ${fmtH(x)}, about your usual` };
    }
    case 'temp':
      return { dir, text: bad ? `Wrist temperature is ${Math.abs(x).toFixed(1)}° off your normal` : 'Wrist temperature is normal for you' };
    default:
      return { dir, text: bad ? 'Breathing rate is higher than your usual' : good ? 'Breathing rate is lower than your usual' : 'Breathing rate is normal for you' };
  }
}

/**
 * rows: health_daily docs. today: 'YYYY-MM-DD'. load: 0..1 (loadFromFatigue). Returns
 *   { status: 'none'|'building'|'waiting'|'ok', level?, composite?, reason?, parts?, baselineDays, needed, lastDay? }
 *   'building' = fewer than 14 days of history; 'waiting' = no data from today or yesterday yet.
 */
export function readiness({ rows, today, load = 0 }) {
  const days = indexDays(rows);
  const baselineDays = coreDayCount(days, shiftDay(today, -BASELINE_DAYS), shiftDay(today, -1));
  const base = { baselineDays, needed: NEEDED_DAYS };
  if (!days.size) return { status: 'none', ...base };
  const lastDay = [...days.keys()].sort().pop();
  const newest = (get) => latestValue(days, today, get, 1);

  const cur = {
    hrv: newest(GET.hrv),
    rhr: newest(GET.rhr),
    sleep: newest(GET.sleep),
    resp: newest(GET.resp),
    temp: null,
  };
  for (const d of [today, shiftDay(today, -1)]) {
    const t = tempDelta(days, d);
    if (t != null) { cur.temp = { day: d, value: t }; break; }
  }
  const have = Object.values(cur).some(Boolean);
  if (!have) return { status: 'waiting', lastDay, ...base };
  if (baselineDays < NEEDED_DAYS) return { status: 'building', lastDay, ...base };

  const parts = [];
  for (const key of Object.keys(WEIGHTS)) {
    const c = cur[key];
    if (!c) continue;
    const from = shiftDay(c.day, -BASELINE_DAYS);
    const to = shiftDay(c.day, -1);
    let x = c.value;
    let hist;
    let sign = 1;
    if (key === 'hrv') { x = Math.log(x); hist = windowValues(days, from, to, (r) => (GET.hrv(r) != null ? Math.log(GET.hrv(r)) : null)); }
    else if (key === 'rhr') { hist = windowValues(days, from, to, GET.rhr); sign = -1; }
    else if (key === 'sleep') hist = windowValues(days, from, to, GET.sleep);
    else if (key === 'resp') { hist = windowValues(days, from, to, GET.resp); sign = -1; }
    else { // temp: distance from your normal, either way is worse
      x = Math.abs(x);
      hist = [];
      for (let d = from; d <= to; d = shiftDay(d, 1)) { const t = tempDelta(days, d); if (t != null) hist.push(Math.abs(t)); }
      sign = -1;
    }
    if (hist.length < MIN_VALUES) continue;
    const s = zScore(x, hist, SD_FLOOR[key]);
    const z = clamp(sign * s.z, -3, 3);
    const raw = key === 'temp' ? c.value : x;
    parts.push({ key, z, weight: WEIGHTS[key], value: c.value, baseline: s.mean, ...words(key, raw, s.mean, z) });
  }
  if (!parts.some((p) => p.key === 'hrv' || p.key === 'rhr')) return { status: 'waiting', lastDay, ...base };

  const wsum = parts.reduce((a, p) => a + p.weight, 0);
  const signals = parts.reduce((a, p) => a + p.z * p.weight, 0) / wsum;
  const penalty = clamp(load, 0, 1) * LOAD_PENALTY;
  const composite = signals - penalty;
  const tempHot = parts.find((p) => p.key === 'temp' && Math.abs(p.value) >= 1);
  let level = composite < CUTS.red ? 'red' : composite < CUTS.amber ? 'amber' : 'green';
  if (tempHot && level === 'green') level = 'amber'; // |delta| ≥ 1 °C is a "go easy" flag on its own

  // The top reason: the biggest drag when amber/red; otherwise the best thing going for you.
  const byZ = [...parts].sort((a, b) => a.z - b.z);
  let reason;
  if (level !== 'green') {
    // Training is the headline only when no body signal is clearly off.
    reason = penalty >= 0.3 && byZ[0].z > -0.75 ? 'You trained hard yesterday, so your muscles are still recovering' : byZ[0].text;
  } else {
    const best = byZ[byZ.length - 1];
    reason = best.z > 0.5 ? best.text : 'Everything looks normal for you';
  }
  const items = [...parts];
  if (load > 0) items.push({ key: 'load', z: -penalty, weight: 0, dir: load >= 0.5 ? 'bad' : 'ok', text: load >= 0.5 ? 'Yesterday’s training was heavy' : 'Yesterday’s training was light', value: load });
  return { status: 'ok', level, composite, reason, parts: items, load, lastDay, ...base };
}
