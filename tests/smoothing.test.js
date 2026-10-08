import { test, eq, near, assert } from './harness.js';
import { dailyWeights, smooth, trendChange, weeklyRate, projectGoalDate, addDays, daysBetween } from '../js/weight/smoothing.js';

function linearSeries(startKg, perDay, days, start = '2026-01-01') {
  const out = [];
  for (let i = 0; i < days; i++) out.push({ day: addDays(start, i), kg: startKg + perDay * i });
  return out;
}

test('date helpers', () => {
  eq(addDays('2026-02-27', 3), '2026-03-02');
  eq(daysBetween('2026-01-01', '2026-01-31'), 30);
});

test('same-day weigh-ins are averaged and sorted', () => {
  const d = dailyWeights([
    { day: '2026-01-02', kg: 80 },
    { day: '2026-01-01', kg: 81 },
    { day: '2026-01-02', kg: 82 },
  ]);
  eq(d.length, 2);
  eq(d[0].day, '2026-01-01');
  eq(d[1].kg, 81);
});

test('first trend point equals first weigh-in', () => {
  const s = smooth([{ day: '2026-01-01', kg: 90 }]);
  eq(s[0].trend, 90);
});

test('one spike only moves the trend 10%', () => {
  const s = smooth([
    { day: '2026-01-01', kg: 80 },
    { day: '2026-01-02', kg: 82 },
  ]);
  near(s[1].trend, 80.2, 1e-9);
});

test('gaps weight the new point more', () => {
  const s = smooth([
    { day: '2026-01-01', kg: 80 },
    { day: '2026-01-11', kg: 82 },
  ]);
  near(s[1].trend, 80 + 2 * (1 - 0.9 ** 10), 1e-9);
});

test('weekly rate recovers a steady loss', () => {
  const s = smooth(linearSeries(100, -0.1, 60));
  near(weeklyRate(s), -0.7, 0.02);
});

test('trendChange over 7 days is negative for a loss', () => {
  const s = smooth(linearSeries(100, -0.1, 30));
  assert(trendChange(s, 7) < 0);
});

test('projection reaches goal at the right time', () => {
  const s = smooth(linearSeries(100, -0.1, 60));
  const p = projectGoalDate(s, 90);
  assert(p && !p.reached);
  const last = s[s.length - 1];
  near(p.weeks, (90 - last.trend) / p.rate, 1e-9);
});

test('no projection when moving away from goal', () => {
  const s = smooth(linearSeries(100, 0.1, 60));
  eq(projectGoalDate(s, 90), null);
});

test('no rate with under a week of data', () => {
  const s = smooth(linearSeries(100, -0.1, 5));
  eq(weeklyRate(s), null);
});
