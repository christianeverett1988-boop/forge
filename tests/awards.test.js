// XP, levels, streaks and badges (js/workouts/awards.js).
import { test, eq, assert } from './harness.js';
import { workoutXP, totalXP, levelFor, xpForLevel, LEVELS, streak, weekOf, badges, workoutAwards } from '../js/workouts/awards.js';

const day = 86400000;
// Monday 2026-09-07 10:00 local
const MON = new Date(2026, 8, 7, 10).getTime();
const iso = (t) => new Date(t).toISOString();
let n = 0;
const W = (t, { sets = 3, exercises = 2, prs = 0, kg = 50, status = 'done' } = {}) => ({
  id: `w${++n}`, status, started_at: iso(t), finished_at: iso(t + 3600000),
  exercises: Array.from({ length: exercises }, () => ({ exercise_id: 'x', sets: [{ done: true, warmup: true, reps: 5, weight_kg: 20 }, ...Array.from({ length: sets }, () => ({ done: true, reps: 8, weight_kg: kg }))] })),
  prs: Array.from({ length: prs }, (_, i) => ({ type: 'reps', value: i })),
});

test('xp: +10 per working set, +25 per exercise, +100 per workout, +50 per PR; warm-ups and empty workouts earn nothing', () => {
  const x = workoutXP(W(MON, { sets: 3, exercises: 2, prs: 1 }));
  eq(x.sets, 60);
  eq(x.exercises, 50);
  eq(x.workout, 100);
  eq(x.prs, 50);
  eq(x.total, 260);
  eq(workoutXP({ exercises: [{ sets: [{ done: true, warmup: true }] }] }).total, 0);
  eq(totalXP([W(MON), W(MON + day, { status: 'active' })]), workoutXP(W(MON)).total);
});

test('levels: 30 unique names, thresholds rise, level 2 after one typical workout', () => {
  eq(LEVELS.length, 30);
  eq(new Set(LEVELS).size, 30);
  for (let l = 2; l <= 30; l++) assert(xpForLevel(l) > xpForLevel(l - 1), `level ${l}`);
  eq(levelFor(0).name, 'Spark');
  eq(levelFor(400).level, 2);
  const top = levelFor(10_000_000);
  eq(top.name, 'Unbreakable');
  eq(top.next, null);
  eq(top.progress, 1);
  const mid = levelFor(xpForLevel(5) + 10);
  eq(mid.level, 5);
  assert(mid.progress > 0 && mid.progress < 1);
});

test('streak: weeks hitting your planned days; the week in progress never breaks it', () => {
  const ws = [];
  for (let w = 0; w < 4; w++) for (let d = 0; d < 3; d++) ws.push(W(MON + w * 7 * day + d * 2 * day));
  const now = MON + 4 * 7 * day + day; // Tuesday of week 5, nothing yet
  const s = streak(ws, [], 3, now);
  eq(s.current, 4);
  eq(s.best, 4);
  eq(s.thisWeek.done, 0);
  eq(weekOf(iso(MON + 3 * day)), weekOf(iso(MON)));
});

test('streak: one missed week a month is frozen; a second miss in the same month breaks it; cardio days count', () => {
  const ws = [];
  const week = (w, days) => { for (let d = 0; d < days; d++) ws.push(W(MON + w * 7 * day + d * day)); };
  week(0, 3); week(1, 1); week(2, 3); // week 1 missed (September) → frozen
  let s = streak(ws, [], 3, MON + 3 * 7 * day);
  eq(s.current, 2);
  eq(s.frozen.length, 1);
  eq(s.freezeLeft, false);
  // Cardio fills a gap: week 3 with 2 workouts + 1 cardio day = 3 days.
  week(3, 2);
  const cardio = [{ started_at: iso(MON + 3 * 7 * day + 4 * day) }];
  s = streak(ws, cardio, 3, MON + 4 * 7 * day);
  eq(s.current, 3);
  // Without the cardio day week 3 is a second September miss: the streak resets.
  s = streak(ws, [], 3, MON + 4 * 7 * day);
  eq(s.current, 0);
  eq(s.best, 2);
});

test('badges: earned once, dated by the workout that unlocked them', () => {
  const ws = [W(MON, { prs: 1 }), W(MON + day, { prs: 3 }), W(MON + 2 * day)];
  const b = Object.fromEntries(badges(ws, [], 3).map((x) => [x.id, x]));
  eq(b.first.earned.workoutId, ws[0].id);
  eq(b.pr1.earned.workoutId, ws[0].id);
  eq(b.pr3.earned.workoutId, ws[1].id);
  eq(b.w10.earned, null);
});

test('summary awards: XP for this workout, level before/after, level-up flag and new badges', () => {
  const ws = [W(MON), W(MON + day, { prs: 1 })];
  const a = workoutAwards(ws, [], 3, ws[1].id, MON + 2 * day);
  eq(a.xp.total, workoutXP(ws[1]).total);
  eq(a.before.xp, workoutXP(ws[0]).total);
  eq(a.levelUp, a.after.level > a.before.level);
  assert(a.badges.some((x) => x.id === 'pr1'), 'first PR badge on this workout');
  eq(workoutAwards(ws, [], 3, 'nope'), null);
});
