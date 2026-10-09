// v0.13.1: health summary for your doctor. Synthetic data only.
import { readFileSync } from 'node:fs';
import { test, eq, near, assert } from './harness.js';
import { shiftDay } from '../js/health/metrics.js';
import {
  buildSummary, summaryText, isEmpty, fmtKgBoth, fmtKgChange, fmtHeightBoth, fmtDur, RANGES, DEFAULT_RANGE, notMedical,
} from '../js/health/clinical.js';
import { reportHtml, weightChartSvg } from '../js/health/clinicalview.js';
import { KG_PER_LB } from '../js/units.js';

const TODAY = '2026-10-10';
const day = (i) => shiftDay(TODAY, -i);
const PROFILE = { age: 38, sex: 'male', heightCm: 180, goal: 'lose', trainingDays: 3, name: 'Pat Example', email: 'pat@example.com' };
const bedAt = (i, h, m) => { const [y, mo, d] = day(i).split('-').map(Number); return new Date(y, mo - 1, d, h, m).toISOString(); };

/** `n` days of everything, ending today. kg falls 0.05 a day (0.35 kg a week). */
function account(n = 120) {
  const rows = []; const series = []; const measures = []; const workouts = []; const cardio = [];
  for (let i = n; i >= 0; i--) {
    const d = day(i);
    rows.push({
      id: d, hrv_sdnn_ms: 50 + (i % 4), rhr_bpm: 56 + (i % 3), steps: 8000 + (i % 5) * 100, active_kcal: 500, exercise_min: 30,
      walking_hr_avg: 100, spo2_avg_pct: 97, vo2max: 44,
      sleep: { asleep_min: 420 + (i % 5) * 10, in_bed_start: bedAt(i, 23, i % 2 ? 0 : 30) },
    });
    const kg = 90 - (n - i) * 0.05;
    series.push({ day: d, kg, trend: kg, device: true });
    if (i % 3 === 0) measures.push({ id: d, day: d, measured_at: `${d}T07:00:00Z`, metrics: { weight_kg: kg, fat_ratio_pct: 22, fat_free_mass_kg: 70, visceral_fat: 8 } });
    if (i % 2 === 0) workouts.push({ status: 'done', started_at: `${d}T17:00:00`, exercises: [{ exercise_id: 'bb_back_squat', sets: [{ done: true, weight_kg: 100, reps: 5 }] }] });
    if (i % 7 === 0) cardio.push({ started_at: `${d}T08:00:00`, duration_min: 35 });
  }
  return { rows, series, measures, workouts, cardio, profile: PROFILE };
}
const build = (a, range = 90) => buildSummary({ range, today: TODAY, ...a });
const EMPTY = { rows: [], series: [], measures: [], workouts: [], cardio: [], profile: PROFILE };

// ---------- section inclusion ----------

test('no data at all: every section is left out and the summary is empty', () => {
  const s = build(EMPTY);
  assert(isEmpty(s));
  eq(s.weight, null); eq(s.heart, null); eq(s.sleep, null); eq(s.activity, null); eq(s.score, null);
  eq(s.notes.length, 0);
  const html = reportHtml(s, 'imperial', TODAY);
  for (const k of ['weight', 'heart', 'sleep', 'activity', 'score', 'notes']) assert(!html.includes(`data-rp="${k}"`), `${k} section should be missing`);
  assert(html.includes('data-rp="header"'), 'the header is always there');
  assert(!/not tracked/i.test(html), 'no "not tracked" rows');
});

test('a full account fills every section', () => {
  const s = build(account());
  assert(!isEmpty(s));
  for (const k of ['weight', 'heart', 'sleep', 'activity', 'score']) assert(s[k], `${k} missing`);
  const html = reportHtml(s, 'imperial', TODAY);
  for (const k of ['header', 'weight', 'heart', 'sleep', 'activity', 'score']) assert(html.includes(`data-rp="${k}"`), k);
});

test('partial data: only a weight series gives only the weight section', () => {
  const a = account();
  const s = build({ ...EMPTY, series: a.series });
  assert(s.weight); eq(s.heart, null); eq(s.sleep, null); eq(s.activity, null);
  const html = reportHtml(s, 'metric', TODAY);
  assert(html.includes('data-rp="weight"'));
  for (const k of ['heart', 'sleep', 'activity']) assert(!html.includes(`data-rp="${k}"`), k);
});

test('partial data: Apple Health without a scale leaves out weight, and rows inside a section only show with data', () => {
  const a = account();
  const rows = a.rows.map((r) => ({ id: r.id, rhr_bpm: r.rhr_bpm }));
  const s = build({ ...EMPTY, rows });
  eq(s.weight, null); eq(s.sleep, null); eq(s.activity, null);
  assert(s.heart.rhr); eq(s.heart.hrv, null); eq(s.heart.vo2max, null); eq(s.heart.spo2, null); eq(s.heart.walkingHr, null);
  const html = reportHtml(s, 'imperial', TODAY);
  assert(html.includes('Resting heart rate'));
  assert(!html.includes('HRV') && !html.includes('VO₂max') && !html.includes('SpO₂'));
});

test('the Forge Score section needs a score; sleep needs asleep minutes; activity can be training alone', () => {
  const a = account();
  eq(build({ ...EMPTY, workouts: a.workouts }).score, null);
  const w = build({ ...EMPTY, workouts: a.workouts });
  assert(w.activity && w.activity.workoutsPerWeek > 0); eq(w.activity.steps, null);
  eq(build({ ...EMPTY, rows: a.rows.map((r) => ({ id: r.id, steps: 5000 })) }).sleep, null);
  assert(build(a).score.avg > 0 && build(a).score.avg <= 100);
});

test('explanations for HRV, VO₂max and FFMI appear once, and only with their metric', () => {
  const html = reportHtml(build(account()), 'imperial', TODAY);
  for (const t of ['HRV (heart rate variability)', 'VO₂max is the most oxygen', 'FFMI (fat-free mass index)']) eq(html.split(t).length - 1, 1, t);
  const none = reportHtml(build({ ...EMPTY, series: account().series }), 'imperial', TODAY);
  assert(!none.includes('HRV (heart rate variability)') && !none.includes('FFMI (fat'));
});

// ---------- range maths ----------

test('ranges: 30, 90 and 365 days, default 90; an unknown range falls back to 90', () => {
  eq(RANGES.join(','), '30,90,365'); eq(DEFAULT_RANGE, 90);
  const a = account(400);
  eq(build(a, 30).from, day(29)); eq(build(a, 90).from, day(89)); eq(build(a, 365).from, day(364));
  eq(build(a, 7).range, 90);
});

test('range maths: readings before the window are ignored and a bigger window sees more nights', () => {
  const a = account(400);
  const s30 = build(a, 30); const s90 = build(a, 90); const s365 = build(a, 365);
  eq(s30.sleep.nights, 30); eq(s90.sleep.nights, 90); eq(s365.sleep.nights, 365);
  // weight falls 0.05 kg a day: the start of the window is higher the further back it goes
  near(s30.weight.startKg - s30.weight.endKg, 0.05 * 29, 1e-9);
  near(s90.weight.startKg - s90.weight.endKg, 0.05 * 89, 1e-9);
  near(s365.weight.startKg - s365.weight.endKg, 0.05 * 364, 1e-9);
});

test('weight change per week: 0.35 kg a week down; under a week of data gives no rate', () => {
  const s = build(account(), 90);
  near(s.weight.perWeekKg, -0.35, 1e-9);
  near(s.weight.changeKg, -0.05 * 89, 1e-9);
  const short = build({ ...EMPTY, series: account().series.slice(-4) }, 90);
  eq(short.weight.perWeekKg, null);
  assert(short.weight.changeKg < 0);
  const one = build({ ...EMPTY, series: account().series.slice(-1) }, 90);
  eq(one.weight.changeKg, null); assert(one.weight.endKg != null);
});

test('per-week training counts from the first logged session, not from an empty start of the window', () => {
  const ws = [0, 2, 4, 6].map((i) => account().workouts.find((w) => w.started_at.startsWith(day(i))));
  const s = build({ ...EMPTY, workouts: ws }, 90);
  eq(s.activity.sessions, 4);
  near(s.activity.workoutsPerWeek, 4 / 1, 1e-9); // a 7-day span: 4 sessions in 1 week
  const old = build({ ...EMPTY, workouts: [ws[0], { ...ws[0], started_at: `${day(200)}T17:00:00` }] }, 90);
  eq(old.activity.sessions, 1);
});

test('averages, shares and bedtime: sleep, steps and heart numbers', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ id: day(i), steps: 6000 + i * 100, rhr_bpm: 60, sleep: { asleep_min: i < 4 ? 340 : 440, in_bed_start: bedAt(i, 22, 0) } });
  const s = build({ ...EMPTY, rows }, 30);
  eq(s.sleep.nights, 10); eq(s.sleep.shortNights, 4); near(s.sleep.shortPct, 40, 1e-9);
  near(s.sleep.avgMin, (4 * 340 + 6 * 440) / 10, 1e-9);
  eq(s.sleep.bedtime.avgMin, 22 * 60); eq(s.sleep.bedtime.spreadMin, 0);
  near(s.activity.steps, 6450, 1e-9);
  near(s.heart.rhr.avg, 60, 1e-9);
});

test('bedtime after midnight counts as late, not early', () => {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push({ id: day(i), sleep: { asleep_min: 420, in_bed_start: i % 2 ? bedAt(i, 23, 30) : bedAt(i, 0, 30) } });
  const s = build({ ...EMPTY, rows }, 30);
  eq(s.sleep.bedtime.avgMin, 0 * 60 + 0); // midpoint of 23:30 and 00:30 is midnight
  eq(s.sleep.bedtime.spreadMin, 33);
  eq(build({ ...EMPTY, rows: rows.slice(0, 4) }, 30).sleep.bedtime, null); // too few start times to call a pattern
});

test('VO₂max shows the latest value with an age-and-sex band; no band without age or sex', () => {
  const rows = [{ id: day(5), vo2max: 40 }, { id: day(1), vo2max: 47 }];
  const s = build({ ...EMPTY, rows });
  eq(s.heart.vo2max.latest, 47); assert(s.heart.vo2max.band);
  const nb = build({ ...EMPTY, rows, profile: { ...PROFILE, sex: 'unspecified' } });
  eq(nb.heart.vo2max.band, null);
});

// ---------- units ----------

test('weights show the user’s unit with kg in brackets; metric shows kg alone', () => {
  eq(fmtKgBoth(92.6, 'metric'), '92.6 kg');
  eq(fmtKgBoth(92.6, 'imperial'), `${(92.6 / KG_PER_LB).toFixed(1)} lb (92.6 kg)`);
  eq(fmtKgBoth(92.62, 'imperial'), '204.2 lb (92.6 kg)');
  eq(fmtKgBoth(null, 'imperial'), '—');
  eq(fmtKgChange(-0.4, 'metric'), '−0.4 kg');
  eq(fmtKgChange(-0.4, 'imperial'), '−0.9 lb (−0.4 kg)');
  eq(fmtKgChange(0.02, 'imperial'), '0 lb (0 kg)', 'rounds to nothing');
  eq(fmtKgChange(0.5, 'metric'), '+0.5 kg');
  eq(fmtHeightBoth(180, 'imperial'), '5′11″ (180 cm)'); eq(fmtHeightBoth(180, 'metric'), '180 cm'); eq(fmtHeightBoth(0, 'metric'), null);
  eq(fmtDur(455), '7 h 35 min');
});

test('the page and the text carry weights in both units for imperial users', () => {
  const s = build(account());
  const html = reportHtml(s, 'imperial', TODAY);
  assert(/\d+\.\d lb \(\d+\.\d kg\)/.test(html), 'lb with kg in brackets');
  assert(/5′11″ \(180 cm\)/.test(html));
  const metric = reportHtml(s, 'metric', TODAY);
  assert(!/\blb\b/.test(metric.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'no lb for a metric user');
  assert(/ kg/.test(metric));
});

// ---------- flags ----------

test('flags: no data means no notes section; steady data raises nothing', () => {
  eq(build(EMPTY).notes.length, 0);
  const s = build(account());
  eq(s.notes.length, 0);
  assert(!reportHtml(s, 'imperial', TODAY).includes('Notes for the doctor'));
});

test('flags: three short nights and a resting heart rate 8 bpm over baseline give neutral notes', () => {
  const a = account();
  const rows = a.rows.map((r) => {
    const i = Math.round((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${r.id}T00:00:00Z`)) / 86400000);
    return i < 3 ? { ...r, rhr_bpm: 66, sleep: { ...r.sleep, asleep_min: 330 } } : { ...r, rhr_bpm: 58 };
  });
  const s = build({ ...a, rows });
  const text = s.notes.join(' | ');
  assert(s.notes.some((n) => /^Resting heart rate has been about 8 bpm above the person’s usual for 3 days in a row\.$/.test(n)), text);
  assert(s.notes.some((n) => /^Slept under 6 hours for 3 nights in a row \(average 5 h 30 min\)\.$/.test(n)), text);
  const html = reportHtml(s, 'imperial', TODAY);
  assert(html.includes('Notes for the doctor') && html.includes('not a diagnosis'));
  for (const bad of [/diagnos(is|ed) of/i, /you have/i, /should see/i, /disease|condition|disorder/i]) assert(!bad.test(s.notes.join(' ')), String(bad));
});

test('flags: short sleep on a third of recorded nights is named with its count', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ id: day(i + 4), sleep: { asleep_min: i % 3 === 0 ? 330 : 450 } });
  const s = build({ ...EMPTY, rows });
  assert(s.notes.some((n) => n === 'Slept under 6 hours on 4 of 12 recorded nights (33%).'), s.notes.join('|'));
  const few = build({ ...EMPTY, rows: rows.slice(0, 5).map((r) => ({ ...r, sleep: { asleep_min: 300 } })) });
  eq(few.notes.length, 0, 'under 7 nights is too few to call a pattern');
});

// ---------- privacy ----------

test('no name or email anywhere in the summary, the page or the text', () => {
  const s = build(account());
  const all = JSON.stringify(s) + reportHtml(s, 'imperial', TODAY) + summaryText(s, 'imperial', TODAY);
  for (const bad of ['Pat Example', 'pat@example.com', '@example', 'Pat']) assert(!all.includes(bad), bad);
  eq(Object.keys(s.header).sort().join(','), 'age,heightCm,sex');
  assert(all.includes(notMedical(s.sources)));
});

test('source line names only the sources that are in range', () => {
  const a = account();
  const full = build(a);
  eq(notMedical(full.sources), 'Measured at home: Withings scale, Apple Health. Not a medical record.');
  const hand = build({ ...EMPTY, series: a.series.map((p) => ({ ...p, device: false })) });
  eq(notMedical(hand.sources), 'Measured at home: weight entered by hand. Not a medical record.');
  const html = reportHtml(hand, 'imperial', TODAY) + summaryText(hand, 'imperial', TODAY);
  assert(html.includes('weight entered by hand') && !/Withings|Apple/.test(html), 'no device is named');
  const apple = build({ ...EMPTY, rows: a.rows });
  eq(notMedical(apple.sources), 'Measured at home: Apple Health. Not a medical record.');
  const old = build({ ...EMPTY, series: a.series.slice(0, 5).map((p) => ({ ...p, device: false })).concat(a.series.slice(-5)) });
  assert(!old.sources.hand, 'hand-entered weights outside the range do not count');
  eq(notMedical({}), 'Not a medical record.');
});

test('chart axis labels carry the unit; a steady bedtime reads "Very regular"', () => {
  const pts = account().series.slice(-30).map((p) => ({ day: p.day, v: p.trend }));
  assert(/>\d+\.\d lb<\/text>/.test(weightChartSvg(pts, 'imperial')));
  assert(/>\d+\.\d kg<\/text>/.test(weightChartSvg(pts, 'metric')));
  const s = build(account());
  const calm = { ...s, sleep: { ...s.sleep, bedtime: { n: 30, avgMin: 1380, spreadMin: 4 } } };
  const html = reportHtml(calm, 'imperial', TODAY);
  assert(html.includes('Very regular') && !html.includes('about 4 min'));
  const loose = { ...s, sleep: { ...s.sleep, bedtime: { n: 30, avgMin: 1380, spreadMin: 35 } } };
  assert(reportHtml(loose, 'imperial', TODAY).includes('Varies by about 35 min'));
});

test('the screen and builder never reach the network or read the account email', () => {
  for (const f of ['../js/screens/report.js', '../js/health/clinical.js', '../js/health/clinicalview.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert(!/fetch\(|XMLHttpRequest|sendBeacon|call\(|state\.user|\.email|display_?name/i.test(src), f);
  }
});

// ---------- text version ----------

test('share text is compact, in the same units, and has every present section', () => {
  const s = build(account());
  const t = summaryText(s, 'imperial', TODAY);
  assert(t.startsWith('Forge health summary · '));
  for (const h of ['WEIGHT AND BODY COMPOSITION', 'HEART AND FITNESS', 'SLEEP', 'ACTIVITY AND TRAINING', 'FORGE SCORE']) assert(t.includes(h), h);
  assert(/Trend weight \d+\.\d lb \(\d+\.\d kg\) → \d+\.\d lb \(\d+\.\d kg\), −0\.8 lb \(−0\.4 kg\) a week/.test(t), t);
  assert(t.includes('38 years, male, 5′11″ (180 cm)'));
  assert(t.includes('Generated '));
  assert(t.endsWith('Shared from Forge. Not a medical record.'));
  assert(t.split('\n').length < 40, 'compact');
  assert(!t.includes('<'), 'plain text');
});

test('share text leaves out missing sections and keeps notes last', () => {
  const t = summaryText(build({ ...EMPTY, series: account().series }), 'metric', TODAY);
  assert(t.includes('WEIGHT AND BODY COMPOSITION'));
  for (const h of ['HEART', 'SLEEP', 'ACTIVITY', 'FORGE SCORE', 'NOTES']) assert(!t.includes(h), h);
  assert(!/ lb/.test(t));
  const rows = account().rows.map((r, k) => (k >= account().rows.length - 3 ? { ...r, sleep: { asleep_min: 300 } } : r));
  const n = summaryText(build({ ...account(), rows }), 'imperial', TODAY);
  assert(n.indexOf('NOTES FOR THE DOCTOR') > n.indexOf('FORGE SCORE'));
});

test('weight chart: a black-and-white inline SVG, none for fewer than two points', () => {
  const pts = account().series.slice(-30).map((p) => ({ day: p.day, v: p.trend }));
  const svg = weightChartSvg(pts, 'imperial');
  assert(svg.startsWith('<svg') && svg.includes('rp-line') && !/#[0-9a-f]{3,6}\b/i.test(svg));
  eq(weightChartSvg(pts.slice(0, 1), 'imperial'), '');
  assert(!svg.includes('NaN'));
  const flat = weightChartSvg(pts.map((p) => ({ ...p, v: 80 })), 'metric');
  assert(!flat.includes('NaN'), 'a flat line still draws');
});

test('print layout: report.css hides chrome in print and is in the shell', () => {
  const css = readFileSync(new URL('../css/report.css', import.meta.url), 'utf8');
  assert(css.includes('@media print') && css.includes('#navbar') && css.includes('#nav') && css.includes('.rp-tools'));
  assert(css.includes('break-inside: avoid'));
});
