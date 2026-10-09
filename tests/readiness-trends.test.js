// v0.14.1: honest Readiness bars on green days, and smoothed Trends sparklines. Synthetic data only.
import { test, eq, assert } from './harness.js';
import { readiness } from '../js/health/readiness.js';
import { shiftDay } from '../js/health/metrics.js';
import { smoothFull, trendRowSeries, SPARK_MIN_SPAN } from '../js/health/trends.js';
import { sparkSvg } from '../js/health/cards.js';

const TODAY = '2026-10-10';
const wiggle = (i, n, amp) => ((i * 7) % n - (n - 1) / 2) * amp;

/** 30 normal days ending yesterday, plus today's overrides. */
function history(today = {}) {
  const rows = [];
  for (let i = 30; i >= 1; i--) {
    const day = shiftDay(TODAY, -i);
    rows.push({
      id: day, hrv_sdnn_ms: 50 + wiggle(i, 5, 1.5), rhr_bpm: 55 + wiggle(i, 3, 1), resp_rate: 14 + wiggle(i, 3, 0.2),
      wrist_temp_delta_c: wiggle(i, 5, 0.06), sleep: { asleep_min: 420 + wiggle(i, 7, 8) },
    });
  }
  rows.push({ id: TODAY, hrv_sdnn_ms: 50, rhr_bpm: 55, resp_rate: 14, wrist_temp_delta_c: 0, sleep: { asleep_min: 420 }, ...today });
  return rows;
}

test('v0.14.1: a green day with small dips has no red and says which signal is a little off', () => {
  const r = readiness({ rows: history({ rhr_bpm: 56, sleep: { asleep_min: 400 } }), today: TODAY });
  eq(r.level, 'green');
  assert(!r.parts.some((p) => p.dir === 'bad'), 'no red on a green day');
  assert(r.parts.some((p) => p.dir === 'low'), JSON.stringify(r.parts.map((p) => [p.key, p.z, p.dir])));
  assert(r.reason.startsWith('Mostly normal for you: '), r.reason);
});

test('v0.14.1: a normal green day has no "Mostly normal" line and only ok / good signals', () => {
  const r = readiness({ rows: history(), today: TODAY });
  eq(r.level, 'green');
  assert(!r.reason.startsWith('Mostly normal'), r.reason);
  assert(r.parts.every((p) => p.dir === 'ok' || p.dir === 'good'));
});

test('v0.14.1: red and amber days are unchanged', () => {
  const red = readiness({ rows: history({ hrv_sdnn_ms: 36, rhr_bpm: 62, sleep: { asleep_min: 300 } }), today: TODAY });
  eq(red.level, 'red');
  assert(red.parts.some((p) => p.dir === 'bad'));
  const amber = readiness({ rows: history({ hrv_sdnn_ms: 43, rhr_bpm: 57 }), today: TODAY });
  eq(amber.level, 'amber');
  assert(amber.parts.some((p) => p.dir === 'bad'));
  assert(!amber.reason.startsWith('Mostly normal'));
});

test('v0.14.1: smoothFull drops the partial-window points and trendRowSeries smooths daily Apple rows only', () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, v: i % 2 ? 60 : 50 }));
  const out = smoothFull(pts, 7);
  eq(out.length, 14);
  eq(out[0].day, '2026-09-07');
  assert(Math.max(...out.map((p) => p.v)) - Math.min(...out.map((p) => p.v)) < 3, 'zigzag flattened');
  eq(smoothFull(pts.slice(0, 7), 7).length, 7, 'too little left: raw points kept');
  eq(smoothFull([], 7).length, 0);
  for (const key of ['hrv_sdnn_ms', 'rhr_bpm', 'sleep_min', 'steps', 'exercise_min']) eq(trendRowSeries({ key, series: pts }).length, 14, key);
  eq(trendRowSeries({ key: 'fat_ratio_pct', series: pts }), pts, 'scale readings stay raw');
});

/** y range (max - min) of the polyline in a sparkSvg string. */
const yRange = (svg) => {
  const ys = [...svg.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  return Math.max(...ys) - Math.min(...ys);
};

test('v0.14.1: sparkSvg keeps a steady metric nearly flat and centred, and a real change still shows', () => {
  const series = (f) => Array.from({ length: 28 }, (_, i) => ({ day: shiftDay(TODAY, -(27 - i)), v: f(i) }));
  const steady = sparkSvg(series((i) => 420 + (i % 2 ? 1 : -1)), TODAY, 28, { minSpan: SPARK_MIN_SPAN.sleep_min });
  assert(yRange(steady) < 2, `steady sleep nearly flat: ${yRange(steady)}`);
  const ys = [...steady.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  assert(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 14) < 0.01, 'centred');
  const moving = sparkSvg(series((i) => 400 + i * 2), TODAY, 28, { minSpan: SPARK_MIN_SPAN.sleep_min });
  assert(yRange(moving) > 20, `a 54 min change fills the height: ${yRange(moving)}`);
  assert(yRange(sparkSvg(series((i) => 100 + (i % 2)), TODAY)) < 6, 'default span is 5% of the mean (about 20% of the height)');
  assert(yRange(sparkSvg(series(() => 70), TODAY)) === 0, 'constant line');
});
