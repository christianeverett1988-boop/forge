// v0.13.0: long-term Score view and Longevity cards. Synthetic data only.
import { test, eq, near, assert } from './harness.js';
import { shiftDay } from '../js/health/metrics.js';
import { sampleDays, weeklyScores, changeSentence, pillarChanges, longTerm, change, WEEKS_MIN } from '../js/health/longterm.js';
import {
  vo2Series, vo2Band, ninetyDay, trendWords, hrvVsUsual, ffmiOf, ffmiBand, longevityCards, goodWay,
} from '../js/health/longevity.js';
import { longTermHtml, longevityHtml, EMPTY_LONGEVITY } from '../js/health/longview.js';
import { MIN_POINTS } from '../js/health/trends.js';

const TODAY = '2026-10-10';
const day = (i) => shiftDay(TODAY, -i);
const line = (n, f) => Array.from({ length: n }, (_, k) => { const i = n - 1 - k; return { day: day(i), v: f(i) }; });

/** A year-plus synthetic account: Apple days, weight trend, scale compositions, workouts. */
function year(n = 400) {
  const rows = []; const series = []; const measures = []; const workouts = [];
  for (let i = n; i >= 0; i--) {
    const d = day(i);
    rows.push({ id: d, hrv_sdnn_ms: 50 + ((i * 7) % 5), rhr_bpm: 55 + ((i * 3) % 3), steps: 8000, exercise_min: 30, sleep: { asleep_min: 420 + ((i * 7) % 7) * 5, deep_min: 60, rem_min: 90 } });
    const kg = 90 - (n - i) * 0.01;
    series.push({ day: d, kg, trend: kg });
    if (i % 3 === 0) measures.push({ id: d, day: d, measured_at: `${d}T07:00:00Z`, metrics: { weight_kg: kg, fat_mass_kg: 20, fat_free_mass_kg: 70 } });
    if (i % 2 === 0) workouts.push({ status: 'done', started_at: `${d}T17:00:00`, finished_at: `${d}T18:00:00`, exercises: [{ exercise_id: 'bb_back_squat', role: 'main', sets: Array.from({ length: 4 }, () => ({ done: true, weight_kg: 100, reps: 5 })) }] });
  }
  return { rows, series, measures, workouts, cardio: [], profile: { goal: 'lose', trainingDays: 3, heightCm: 180, sex: 'male', age: 35 } };
}

// ---------- weekly score sampling ----------

test('sampleDays: two days per week, oldest first, ending today', () => {
  const d = sampleDays(TODAY, 52);
  eq(d.length, 104);
  eq(d[d.length - 1], TODAY);
  eq(d[d.length - 2], day(3));
  eq(d[0], day(7 * 51 + 3));
});

test('weeklyScores: one point per week with a score, 0–100, newest last; 1 year of data under a loose time budget', () => {
  const acc = year();
  const t0 = Date.now();
  const w = weeklyScores(acc, TODAY);
  const ms = Date.now() - t0;
  assert(w.length >= 50 && w.length <= 52, `weeks ${w.length}`);
  eq(w[w.length - 1].day, TODAY);
  assert(w.every((x) => x.score >= 0 && x.score <= 100));
  assert(w.every((x, i) => i === 0 || x.day > w[i - 1].day));
  assert(ms < 1500, `took ${ms} ms`); // the brief aims for ~50 ms on a phone-class core; CI machines are noisy, so a loose bound
});

test('weeklyScores: no data → no weeks', () => {
  eq(weeklyScores({ rows: [], series: [], measures: [], workouts: [], cardio: [], profile: {} }, TODAY).length, 0);
});

// ---------- change sentence ----------

const pts = (scores, start = '2026-07-05') => scores.map((s, i) => ({ day: shiftDay(start, i * 7), score: s, pillars: { body: s, recovery: null, sleep: s - 10, training: 50, nutrition: null } }));

test('changeSentence: up, down, same, and too few weeks', () => {
  eq(changeSentence(pts([60, 61, 63, 66, 67]), 90), 'Up 6 points since July');
  eq(changeSentence(pts([70, 69, 66, 65, 64]), 90), 'Down 5 points since July');
  eq(changeSentence(pts([65, 66, 65, 66, 65]), 90), 'About the same as 3 months ago');
  eq(changeSentence(pts([65, 66, 65, 66, 65]), 365), 'About the same as a year ago');
  eq(changeSentence(pts([60, 70]), 90), null);
  eq(changeSentence(pts([60, 61, 62, 63]), 90), 'Up 2 points since July');
});

test('change: mean of the latest two weeks against the first two; needs 3 values', () => {
  near(change([60, 62, 70, 72]), 10, 1e-9);
  eq(change([60, 70]), null);
  eq(change([60, null, 70]), null);
});

test('pillarChanges: only tracked pillars appear, with arrows', () => {
  const rows = pillarChanges(pts([60, 61, 63, 66, 67]));
  eq(rows.map((r) => r.key).join(','), 'body,sleep,training');
  eq(rows[0].arrow, '↑');
  eq(rows[2].arrow, '→');
  eq(rows[2].delta, 0);
});

test('longTerm: under 4 weeks is "building"; 4 or more is ok; 90 days drops older weeks', () => {
  const four = pts([60, 61, 62, 63], '2026-09-12');
  eq(longTerm(four.slice(0, 3), TODAY, 90).status, 'building');
  eq(longTerm(four.slice(0, 3), TODAY, 90).weeksSoFar, 3);
  const ok = longTerm(four, TODAY, 90);
  eq(ok.status, 'ok');
  eq(ok.points.length, 4);
  const old = pts([60, 61, 62, 63, 64, 65], '2025-10-01');
  eq(longTerm(old, TODAY, 365).status, 'ok');
  eq(longTerm(old, TODAY, 90).status, 'building'); // all older than 90 days
  eq(WEEKS_MIN, 4);
});

test('long-term card text: building line with the count; sentence and pillar rows; no "not tracked" rows', () => {
  const b = longTermHtml(longTerm(pts([60, 61], '2026-09-26'), TODAY, 90), 90, TODAY);
  assert(b.includes('Your long-term view starts after 4 weeks of data (2 so far).'));
  const html = longTermHtml(longTerm(pts([60, 61, 63, 66, 67], '2026-09-05'), TODAY, 90), 90, TODAY);
  assert(html.includes('Up 6 points since September'));
  assert(html.includes('Body') && html.includes('Sleep') && !html.includes('Nutrition') && !html.includes('Not tracked'));
  assert(html.includes('90 days') && html.includes('1 year'));
});

// ---------- VO₂max merge and bands ----------

test('vo2Series: merges Apple and scale per day; the scale wins without an Apple timestamp, newest wins with one', () => {
  const rows = [{ id: day(3), vo2max: 40 }, { id: day(2), vo2max: 41 }, { id: day(1), vo2max: 42, updated_at: `${day(1)}T20:00:00Z` }];
  const measures = [
    { day: day(2), measured_at: `${day(2)}T07:00:00Z`, metrics: { vo2max: 43 } },
    { day: day(1), measured_at: `${day(1)}T07:00:00Z`, metrics: { vo2max: 44 } },
    { day: day(0), measured_at: `${day(0)}T07:00:00Z`, metrics: { vo2max: 45 } },
  ];
  const s = vo2Series(rows, measures);
  eq(JSON.stringify(s.map((p) => [p.v, p.source])), JSON.stringify([[40, 'apple'], [43, 'withings'], [42, 'apple'], [45, 'withings']]));
  eq(vo2Series([], []).length, 0);
});

test('vo2Band: by age and sex; null without them', () => {
  eq(vo2Band(45, { sex: 'male', age: 25 }).label, 'Good');
  eq(vo2Band(43, { sex: 'male', age: 55 }).label, 'Excellent');
  eq(vo2Band(30, { sex: 'female', age: 25 }).label, 'Average');
  eq(vo2Band(10, { sex: 'female', age: 70 }).label, 'Low');
  eq(vo2Band(60, { sex: 'male', age: 25 }).label, 'Superior');
  eq(vo2Band(48, { sex: 'male' }), null);
  eq(vo2Band(48, { age: 30 }), null);
});

// ---------- FFMI ----------

test('ffmiOf: fat-free mass ÷ height²; band from the Body Profile cut points', () => {
  near(ffmiOf(70, 1.8), 21.6049, 1e-3);
  eq(ffmiOf(70, null), null);
  eq(ffmiOf(null, 1.8), null);
  eq(ffmiBand(21.6, 'male').label, 'High');
  eq(ffmiBand(18, 'male').label, 'Moderate');
  eq(ffmiBand(18, 'female').label, 'High');
  eq(ffmiBand(14, 'female').label, 'Low');
});

// ---------- directions and the min-point rule ----------

test('good directions: RHR and visceral fat down, HRV/VO₂max/FFMI up', () => {
  eq(goodWay('rhr_bpm'), 'down');
  eq(goodWay('visceral_fat'), 'down');
  eq(goodWay('hrv_sdnn_ms'), 'up');
  eq(goodWay('vo2max'), 'up');
  eq(goodWay('ffmi'), 'up');
});

test('ninetyDay: 2 readings never make a trend; a steady rise does, and its tone follows the good direction', () => {
  const two = ninetyDay([{ day: day(80), v: 40 }, { day: day(1), v: 45 }], 'vo2max', TODAY);
  eq(two.enough, false);
  eq(two.direction, 'flat');
  eq(two.change, null);
  assert(two.words.includes('Not enough readings'));
  const five = ninetyDay(line(MIN_POINTS - 1, (i) => 40 + (10 - i)), 'vo2max', TODAY);
  eq(five.enough, false);
  const up = ninetyDay(line(60, (i) => 40 + (60 - i) * 0.1), 'vo2max', TODAY);
  eq(up.direction, 'up');
  eq(up.tone, 'good');
  assert(up.change > 4);
  assert(up.words.startsWith('Going up'));
  const rhrUp = ninetyDay(line(60, (i) => 55 + (60 - i) * 0.1), 'rhr_bpm', TODAY);
  eq(rhrUp.direction, 'up');
  eq(rhrUp.tone, 'bad');
  assert(rhrUp.words.includes('wrong way'));
  const rhrDown = ninetyDay(line(60, (i) => 55 - (60 - i) * 0.1), 'rhr_bpm', TODAY);
  eq(rhrDown.tone, 'good');
  eq(ninetyDay(line(60, () => 50), 'hrv_sdnn_ms', TODAY).direction, 'flat');
  assert(trendWords('hrv_sdnn_ms', { enough: true, direction: 'flat' }).startsWith('Steady'));
});

test('hrvVsUsual: last 7 days against the 28 before; wording never compares with other people', () => {
  const s = line(60, (i) => (i < 7 ? 60 : 50));
  const r = hrvVsUsual(s, TODAY);
  eq(r.state, 'higher');
  assert(r.words.includes('Higher than your usual'));
  eq(hrvVsUsual(line(60, (i) => (i < 7 ? 40 : 50)), TODAY).state, 'lower');
  eq(hrvVsUsual(line(60, () => 50), TODAY).state, 'usual');
  eq(hrvVsUsual(line(5, () => 50), TODAY), null); // no baseline
});

// ---------- cards: empty and partial states ----------

test('longevityCards: nothing → no cards and one short line', () => {
  const none = longevityCards({ rows: [], measures: [], profile: {}, today: TODAY });
  eq(none.length, 0);
  const html = longevityHtml(none, 'metric', TODAY);
  assert(html.includes(EMPTY_LONGEVITY));
  eq((html.match(/lt-card/g) || []).length, 0);
});

test('longevityCards: only metrics with data get a card (HRV and RHR from Apple, nothing else)', () => {
  const rows = line(30, (i) => i).map((p) => ({ id: p.day, hrv_sdnn_ms: 50 + (p.v % 3), rhr_bpm: 55 }));
  const cards = longevityCards({ rows, measures: [], profile: { sex: 'male', age: 35, heightCm: 180 }, today: TODAY });
  eq(cards.map((c) => c.key).join(','), 'rhr_bpm,hrv_sdnn_ms');
  assert(cards[1].usual);
});

test('longevityCards: full set, with Cardio fitness sublines, FFMI value/band and links', () => {
  const rows = line(60, (i) => i).map((p) => ({ id: p.day, hrv_sdnn_ms: 50, rhr_bpm: 55, vo2max: 40 + (60 - p.v) * 0.05 }));
  const measures = [
    { id: 'a', day: day(10), measured_at: `${day(10)}T07:00:00Z`, metrics: { weight_kg: 90, fat_mass_kg: 20, fat_free_mass_kg: 70, visceral_fat: 8, vascular_age: 38 } },
    { id: 'b', day: day(2), measured_at: `${day(2)}T07:00:00Z`, metrics: { weight_kg: 90, fat_mass_kg: 20, fat_free_mass_kg: 72, visceral_fat: 7, vascular_age: 37 } },
  ];
  const cards = longevityCards({ rows, measures, profile: { sex: 'male', age: 35, heightCm: 180 }, today: TODAY });
  eq(cards.map((c) => c.key).join(','), 'vo2max,rhr_bpm,hrv_sdnn_ms,visceral_fat,ffmi');
  const cardio = cards[0];
  eq(cardio.rhr.v, 55);
  eq(cardio.vascularAge, 37);
  eq(cardio.band.label, 'Good');
  const f = cards[4];
  near(f.latest.v, 72 / 1.8 / 1.8, 1e-9);
  eq(f.band.label, 'High');
  eq(f.fatFreeKg, 72);
  assert(cards.every((c) => c.link.startsWith('#/metric/')));
  const html = longevityHtml(cards, 'imperial', TODAY);
  assert(html.includes('Cardio fitness') && html.includes('Resting heart rate') && html.includes('Vascular age') && html.includes('an estimate'));
  assert(html.includes('lb')); // fat-free mass follows the unit setting
  assert(longevityHtml(cards, 'metric', TODAY).includes('72.0 kg'));
});
