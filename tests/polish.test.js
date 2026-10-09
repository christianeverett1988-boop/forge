// v0.14.6 polish: chart ticks, units, bar scale and tap-to-read; friendly server errors; the family-weigh-in seed.
import { test, eq, assert } from './harness.js';
import { niceTicks, axisLabel, lineChartSVG, nearestIndex, unitOf } from '../js/ui/linechart.js';
import { serverErrorText, errorFor } from '../js/ui/errors.js';
import { suspects, seedWeight } from '../js/withings/review.js';

test('chart ticks are round numbers with the decimals their step needs', () => {
  const a = niceTicks(147.6, 153.2);
  eq(a.ticks.join(), '146,148,150,152,154');
  eq(a.decimals, 0);
  const b = niceTicks(26.4, 27.6);
  eq(b.step, 0.5);
  eq(b.decimals, 1);
  eq(b.ticks.map((v) => axisLabel(v, b.decimals)).join(' '), '26.0 26.5 27.0 27.5 28.0');
  eq(niceTicks(1840, 2210).ticks.map((v) => axisLabel(v, 0)).join(' '), '1,800 2,000 2,200 2,400');
  eq(niceTicks(0.31, 0.33).decimals, 2);
  assert(niceTicks(5, 5).ticks.length >= 2, 'a flat series still gets an axis');
});

test('chart: unit above the axis, bar scale labelled, and tap-to-read data on the SVG', () => {
  const pts = [{ day: '2026-10-01', v: 150.2, t: '150.2 lb' }, { day: '2026-10-05', v: 151.0, t: '151.0 lb' }, { day: '2026-10-09', v: 151.6, t: '151.6 lb' }];
  const svg = lineChartSVG(pts, { unit: 'lb', bars: [{ day: '2026-10-04', value: 36 }, { day: '2026-10-08', value: 24 }], fromDay: '2026-10-01', toDay: '2026-10-09' });
  assert(/class="axis unit"[^>]*>lb</.test(svg), 'unit label');
  assert(/>36 sets</.test(svg), 'bar scale shows the biggest week');
  const data = JSON.parse(svg.match(/data-scrub="([^"]*)"/)[1].replace(/&quot;/g, '"'));
  eq(data.length, 3);
  eq(data[2][2], '2026-10-09');
  eq(data[2][3], '151.6 lb');
  assert(data[0][0] < data[1][0] && data[1][0] < data[2][0], 'x positions ascend');
  assert(!/>NaN</.test(svg) && !svg.includes('undefined'), 'no NaN/undefined');
  assert(!/bar-label/.test(lineChartSVG(pts, {})), 'no bar scale without bars');
});

test('tap-to-read picks the nearest reading', () => {
  const xs = [44, 100, 180, 330];
  eq(nearestIndex(xs, 0), 0);
  eq(nearestIndex(xs, 139), 1);
  eq(nearestIndex(xs, 141), 2);
  eq(nearestIndex(xs, 999), 3);
  eq(nearestIndex([], 5), -1);
});

test('unitOf reads the unit off a formatter', () => {
  eq(unitOf((v) => `${v.toFixed(1)} lb`), 'lb');
  eq(unitOf((v) => `${v.toFixed(1)} %`), '%');
  eq(unitOf((v) => `${Math.round(v)} ml/kg/min`), 'ml/kg/min');
  eq(unitOf((v) => `${v}`), '');
});

test('server errors in plain words: no raw "(permission-denied)", the fix is named', () => {
  const t = serverErrorText('permission-denied', 'Withings');
  assert(!/\(permission-denied\)/.test(t), t);
  assert(/firestore\.rules/.test(t) && /Withings/.test(t), t);
  assert(/back online/.test(serverErrorText('firestore/unavailable', 'Apple Health')));
  assert(/Error code: weird/.test(serverErrorText('weird', 'Withings')), 'unknown codes keep the code for support');
});

// The newest readings are mostly a child's (an evening run of 12 weigh-ins), and you haven't weighed in for a week.
const iso = (d, h) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const you = Array.from({ length: 20 }, (_, i) => ({ id: `y${i}`, kg: 100 - i * 0.05, measured_at: iso(1 + i % 20, 7), source: 'withings' })).slice(0, 18);
const kid = Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, kg: 22 + (i % 3) * 0.2, measured_at: iso(25, 17 + (i % 6)), source: 'withings' }));

test('classifier seed: with the newest readings mostly someone else\'s, your profile weight keeps you from being flagged', () => {
  const ws = [...you, ...kid];
  const noProfile = suspects(ws);
  assert(you.some((w) => noProfile.has(w.id)), 'without a better seed the walk starts from the child (the old weakness)');
  const withProfile = suspects(ws, 0.15, 99);
  eq(you.filter((w) => withProfile.has(w.id)).length, 0);
  eq(kid.filter((w) => withProfile.has(w.id)).length, kid.length);
});

test('classifier seed: a recent typed-in or confirmed weight beats the profile; old ones are ignored', () => {
  const list = (ws) => ws.map((w) => ({ ...w, at: w.measured_at })).sort((a, b) => (a.at < b.at ? 1 : -1));
  const typed = { id: 'm', kg: 98, measured_at: iso(24, 8), source: 'manual' };
  eq(seedWeight(list([...you, ...kid, typed]), 70), 98);
  const confirmedKid = { ...kid[0], id: 'kc', reviewed_at: iso(25, 20), review: false };
  eq(seedWeight(list([confirmedKid, ...you]), null), 22, 'a confirmed reading is trusted, even a light one');
  const ancient = { id: 'old', kg: 120, measured_at: new Date(Date.UTC(2020, 0, 1)).toISOString(), source: 'manual' };
  eq(seedWeight(list([...you, ancient]), 99) < 101, true, 'a typed-in weight from years ago is not an anchor');
  eq(seedWeight([], 90), null);
});

test('classifier seed: an onboarding weight from months ago never flags you after a big loss (review repro)', () => {
  const t0 = Date.UTC(2026, 0, 1, 12);
  const typed = { id: 'onb', kg: 120, measured_at: new Date(t0).toISOString(), source: 'manual' };
  const scale = Array.from({ length: 35 }, (_, i) => ({ id: `s${i}`, kg: 120 - (20 * (i + 1)) / 35, measured_at: new Date(t0 + (i + 1) * 5 * 864e5).toISOString(), source: 'withings' }));
  eq(scale.filter((w) => suspects([typed, ...scale], 0.15, 120).has(w.id)).length, 0);
  eq(scale.filter((w) => suspects([typed, ...scale]).has(w.id)).length, 0);
});

test('server errors are per collection: a failed body_measures does not warn on the Apple Health screen', () => {
  const errs = { body_measures: 'permission-denied', health_daily: null, integrations: null };
  eq(errorFor(errs, ['health_daily', 'integrations']), null);
  eq(errorFor(errs, ['body_measures', 'integrations']), 'permission-denied');
  eq(errorFor({ health_daily: 'unavailable' }, ['health_daily', 'integrations']), 'unavailable');
  eq(errorFor(undefined, ['health_daily']), null);
});

test('unitOf gives no unit for formats with more than one (sleep, imperial height)', () => {
  eq(unitOf(() => '0 h 01 min'), '');
  eq(unitOf(() => '5 ft 3 in'), '');
});
