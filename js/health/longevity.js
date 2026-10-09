// Longevity cards (v0.13.0): VO₂max, resting heart rate, HRV, visceral fat and FFMI over 90 days. Each card exists
// only when its metric has data. Trends use the Theil–Sen / Mann–Kendall engine in trends.js, which needs
// MIN_POINTS readings, so a couple of readings never make a "trend". Pure functions, no DOM. See docs/longevity.md.
import { shiftDay, indexDays, mean, GET } from './metrics.js';
import { trendFor, MIN_POINTS, goodDirection } from './trends.js';
import { metricSeries, dailySeries, heightM } from '../withings/body.js';
import { cutsFor, bandOf, FFMI_BANDS } from './bodyprofile.js';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Noise floors per week for the metrics the trend engine doesn't list. */
export const FLOORS = { vo2max: 0.1, ffmi: 0.05, rhr_bpm: 0.5, hrv_sdnn_ms: 1, visceral_fat: 0.1 };
export const GOOD = { vo2max: 'up', ffmi: 'up' };
export const goodWay = (metric) => GOOD[metric] || goodDirection(metric, 'health');

// ---- VO₂max source merge ----

/**
 * One VO₂max value per day from Apple Health (`health_daily.vo2max`) and the scale (`body_measures` metrics.vo2max).
 * When both have the day, the newest reading wins: the scale's `measured_at` against the Apple row's
 * `updated_at` (if it has one); with no Apple timestamp the scale's reading wins, since it is timestamped.
 * Returns [{ day, v, source: 'apple'|'withings' }], oldest first.
 */
export function vo2Series(rows = [], measures = []) {
  const byDay = new Map();
  for (const [day, r] of indexDays(rows)) {
    const v = num(r.vo2max);
    if (v != null) byDay.set(day, { day, v, source: 'apple', at: typeof r.updated_at === 'string' ? r.updated_at : '' });
  }
  for (const p of metricSeries(measures, 'vo2max')) {
    const cur = byDay.get(p.day);
    if (!cur || cur.source !== 'apple' || !cur.at || p.at >= cur.at) byDay.set(p.day, { day: p.day, v: p.v, source: 'withings', at: p.at });
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map(({ day, v, source }) => ({ day, v, source }));
}

// ---- VO₂max for age and sex ----

/**
 * VO₂max (ml/kg/min) lower bounds of: Below average, Average, Good, Excellent, Superior (anything under the
 * first is Low). Transcribed from the Cooper Institute / ACSM fitness categories; an estimate, not a diagnosis.
 */
export const VO2_CUTS = {
  male: [[29, [33, 36.5, 42.5, 46.5, 52.5]], [39, [31.5, 35.5, 41, 45, 49.5]], [49, [30.2, 33.6, 39, 43.8, 48.1]], [59, [26.1, 31, 35.8, 41, 45.4]], [Infinity, [20.5, 26.1, 32.3, 36.5, 44.3]]],
  female: [[29, [23.6, 29, 33, 37, 41.1]], [39, [22.8, 27, 31.5, 35.7, 40.1]], [49, [21, 24.5, 29, 32.9, 37]], [59, [20.2, 22.8, 27, 31.5, 35.8]], [Infinity, [17.5, 20.2, 24.5, 30.3, 31.5]]],
};
export const VO2_BANDS = ['Low', 'Below average', 'Average', 'Good', 'Excellent', 'Superior'];

/** { index 0–5, label } for your age and sex, or null when either is missing (no guessing). */
export function vo2Band(v, { sex, age }) {
  const table = VO2_CUTS[sex];
  if (!table || !Number.isFinite(age) || age < 18 || !Number.isFinite(v)) return null;
  const cuts = table.find(([max]) => age <= max)[1];
  const index = cuts.filter((c) => v >= c).length;
  return { index, label: VO2_BANDS[index] };
}

// ---- trends over 90 days ----

/** Mean of the values from `from` to `to` (inclusive) with at least `min` readings, else null. */
function windowMean(series, from, to, min) {
  const xs = series.filter((p) => p.day >= from && p.day <= to).map((p) => p.v);
  return xs.length >= min ? mean(xs) : null;
}

/**
 * The 90-day view of one daily series [{ day, v }]: { trend (trendFor, 90 days), change (average of the last two
 * weeks minus the first two weeks of the window; null without a trend's worth of readings), direction, words, tone }.
 */
export function ninetyDay(series, metric, today, floor = FLOORS[metric] ?? 0) {
  const trend = trendFor(series, { metric, window: 90, today, floor });
  const inWin = series.filter((p) => p.day >= shiftDay(today, -89) && p.day <= today).sort((x, y) => (x.day < y.day ? -1 : 1));
  const from = inWin.length ? inWin[0].day : today;
  const apart = shiftDay(from, 13) < shiftDay(today, -13); // the two ends must not overlap
  const a = apart ? windowMean(inWin, from, shiftDay(from, 13), 1) : null;
  const b = apart ? windowMean(inWin, shiftDay(today, -13), today, 1) : null;
  const delta = trend.enough && a != null && b != null ? b - a : null;
  const good = goodWay(metric);
  const tone = !good || trend.direction === 'flat' || !trend.enough ? 'neutral' : good === trend.direction ? 'good' : 'bad';
  return { trend, change: delta, direction: trend.direction, enough: trend.enough, tone, words: trendWords(metric, trend) };
}

/** Plain-words trend line that follows the metric's good direction. */
export function trendWords(metric, trend) {
  if (!trend.enough) return `Not enough readings yet for a trend (needs ${MIN_POINTS} in 90 days).`;
  if (trend.direction === 'flat') return 'Steady over the last 90 days.';
  const good = goodWay(metric);
  const dir = trend.direction === 'up' ? 'Going up' : 'Going down';
  return good ? `${dir}, ${good === trend.direction ? 'which is the right way' : 'the wrong way for this one'}.` : `${dir} over the last 90 days.`;
}

/** HRV against your own usual: the last 7 days against the 28 days before them. */
export function hrvVsUsual(series, today) {
  const now = windowMean(series, shiftDay(today, -6), today, 3);
  const usual = windowMean(series, shiftDay(today, -34), shiftDay(today, -7), 7);
  if (now == null || usual == null) return null;
  const pct = ((now - usual) / usual) * 100;
  const state = pct >= 5 ? 'higher' : pct <= -5 ? 'lower' : 'usual';
  return { now, usual, pct, state, words: state === 'higher' ? 'Higher than your usual, which is generally good.' : state === 'lower' ? 'Lower than your usual.' : 'About your usual.' };
}

// ---- FFMI ----

/** FFMI = fat-free mass (kg) ÷ height (m)². Null when either is missing. */
export const ffmiOf = (ffmKg, hM) => (Number.isFinite(ffmKg) && hM ? ffmKg / (hM * hM) : null);

/** { ffmi, band: index 0–3, label } using the Kyle 2003 cut points already used by the Body Profile. */
export function ffmiBand(ffmi, sex) {
  if (!Number.isFinite(ffmi)) return null;
  const index = bandOf(ffmi, cutsFor(sex, 'ffmi'));
  return { ffmi, index, label: FFMI_BANDS[index] };
}

// ---- the cards ----

const dailyApple = (rows, get) => {
  const days = indexDays(rows);
  return [...days.keys()].sort().map((d) => ({ day: d, v: num(get(days.get(d))) })).filter((p) => p.v != null);
};
const bodySeries = (measures, key, opts) => dailySeries(metricSeries(measures, key, opts)).map((p) => ({ day: p.day, v: p.v }));
const recent = (series, today) => series.filter((p) => p.day >= shiftDay(today, -89) && p.day <= today);
const last = (s) => s[s.length - 1];

/**
 * Cards for metrics with data in the last 90 days, in order. inputs: { rows (health_daily), measures (body_measures),
 * profile ({ sex, age, heightCm }), today }. Each card: { key, title, why, link, series, latest: { day, v }, ninety, ...extras }.
 * `cards` is empty when nothing has data; the screen shows its one-line message then.
 */
export function longevityCards({ rows = [], measures = [], profile = {}, today }) {
  const cards = [];
  const mk = (key, title, why, link, series, extra = {}) => ({ key, title, why, link, series, latest: last(series), ninety: ninetyDay(series, extra.metric || key, today), ...extra });

  const vo2 = recent(vo2Series(rows, measures), today);
  const rhr = recent(dailyApple(rows, GET.rhr), today);
  if (vo2.length) {
    const vascular = last(metricSeries(measures, 'vascular_age').filter((p) => p.day <= today && p.day >= shiftDay(today, -89)));
    cards.push(mk('vo2max', 'Cardio fitness', 'VO₂max: how much oxygen your body can use, a strong sign of long-term health.', '#/metric/vo2max', vo2, {
      band: vo2Band(last(vo2).v, profile), rhr: rhr.length ? last(rhr) : null, vascularAge: vascular ? vascular.v : null,
    }));
  }
  if (rhr.length) cards.push(mk('rhr_bpm', 'Resting heart rate', 'How fast your heart beats at rest. Lower is generally better.', '#/metric/rhr_bpm', rhr));
  const hrv = recent(dailyApple(rows, GET.hrv), today);
  if (hrv.length) cards.push(mk('hrv_sdnn_ms', 'HRV', 'Heart rate variability: the small gaps between heartbeats. Higher than your usual is generally good. It is only ever compared with your own past.', '#/metric/hrv_sdnn_ms', hrv, { usual: hrvVsUsual(hrv, today) }));
  const visc = recent(bodySeries(measures, 'visceral_fat'), today);
  if (visc.length) cards.push(mk('visceral_fat', 'Visceral fat', 'Fat stored around your organs. Lower is better.', '#/metric/visceral_fat', visc));
  const h = heightM(measures, profile);
  const ffmi = recent(bodySeries(measures, 'ffmi', { height: h }), today);
  if (ffmi.length) {
    const ffm = last(recent(bodySeries(measures, 'fat_free_mass_kg'), today));
    cards.push(mk('ffmi', 'Lean mass index (FFMI)', 'Fat-free mass divided by height squared: how much lean body you carry for your size.', '#/metric/ffmi', ffmi, {
      band: ffmiBand(last(ffmi).v, profile.sex), fatFreeKg: ffm ? ffm.v : null,
    }));
  }
  return cards;
}
