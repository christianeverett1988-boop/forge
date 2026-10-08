// XP, levels, streaks and badges (js/workouts/awards.js).
import { test, eq, assert } from './harness.js';
import { workoutXP, totalXP, levelFor, xpForLevel, LEVELS, streak, weekOf, badges, workoutAwards, awardsFor, unseenBadges, daysPerWeek, BADGES } from '../js/workouts/awards.js';
import { BADGE_ART } from '../js/ui/badges.js';

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

test('xp: +10 per set (cap 40), +25 per exercise with 2+ sets, +50 per PR (cap 200), weekly goal and badges; warm-ups and empty workouts earn nothing', () => {
  const x = workoutXP(W(MON, { sets: 3, exercises: 2, prs: 1 }));
  eq(x.sets, 60);
  eq(x.exercises, 50);
  eq(x.prs, 50);
  eq(x.week, 0);
  eq(x.total, 160);
  eq(workoutXP(W(MON, { sets: 1, exercises: 3 })).exercises, 0, 'one-set exercises earn no exercise bonus');
  eq(workoutXP(W(MON, { sets: 10, exercises: 6 })).sets, 400, '60 sets count as 40');
  eq(workoutXP(W(MON, { prs: 15 })).prs, 200, '15 PRs cap at +200');
  eq(workoutXP(W(MON), { week: true, badges: 2 }).total, workoutXP(W(MON)).total + 100 + 200);
  eq(workoutXP({ exercises: [{ sets: [{ done: true, warmup: true }] }] }).total, 0);
});

test('xp: the workout that reaches your planned days gets +100, once a week; cardio days count toward it', () => {
  const ws = [W(MON), W(MON + day), W(MON + 2 * day), W(MON + 3 * day)];
  const a = awardsFor(ws, [], 3);
  eq(ws.map((w) => a.perWorkout.get(w.id).xp.week).join(), '0,0,100,0');
  const withCardio = awardsFor(ws.slice(1), [{ started_at: iso(MON - 3600000 + 2 * 3600000) }], 3);
  eq(withCardio.perWorkout.get(ws[2].id).xp.week, 100, 'cardio Monday + Tue + Wed = 3 days on Wednesday');
  eq(awardsFor([W(MON), W(MON + 3600000)], [], 2).perWorkout.get(`w${n}`).xp.week, 0, 'two workouts on one day are one day');
});

test('xp: total = workouts + badges; badge XP is credited to the workout that unlocked it', () => {
  const ws = [W(MON, { prs: 1 })];
  const a = awardsFor(ws, [], 3);
  const p = a.perWorkout.get(ws[0].id);
  eq(p.badges.sort().join(), 'first,pr1');
  eq(p.xp.badges, 200);
  eq(a.total, p.xp.total);
});

test('empty finished workouts are not training days, XP, streaks or badges', () => {
  const empty = (t) => ({ id: `e${t}`, status: 'done', started_at: iso(t), finished_at: iso(t + 60000), exercises: [{ exercise_id: 'x', sets: [{ done: false }, { done: true, warmup: true }] }] });
  const ws = [empty(MON), empty(MON + day), empty(MON + 2 * day)];
  eq(daysPerWeek(ws).size, 0);
  eq(streak(ws, [], 3, MON + 3 * day).thisWeek.done, 0);
  eq(totalXP(ws), 0);
  eq(badges(ws).filter((b) => b.earned).length, 0);
});

test('badges stay earned once seen, even if history no longer unlocks them (planned days 3 → 4)', () => {
  const ws = [];
  for (let w = 0; w < 4; w++) for (let d = 0; d < 3; d++) ws.push(W(MON + w * 7 * day + d * day));
  const at3 = awardsFor(ws, [], 3);
  const hot = at3.badges.find((b) => b.id === 'st4');
  assert(hot.earned, 'Hot Streak at 3 days a week');
  const seen = unseenBadges(at3.badges, {});
  eq(seen.st4, hot.earned.at);
  eq(awardsFor(ws, [], 4).badges.find((b) => b.id === 'st4').earned, null, 'recomputed at 4 days: gone');
  const kept = awardsFor(ws, [], 4, { seen });
  assert(kept.badges.find((b) => b.id === 'st4').earned, 'kept by awards_seen');
  eq(kept.total - awardsFor(ws, [], 4).total, 100, 'and keeps its +100');
  eq(unseenBadges(kept.badges, seen), null, 'nothing new to save');
});

test('badges: Full House (4+ sets for every major group in a week), Recovery Respect (deload), Comeback (3+ weeks away)', () => {
  const ex = { a: { primary: ['chest', 'triceps'] }, b: { primary: ['lats', 'biceps'] }, c: { primary: ['quads', 'glutes'] }, d: { primary: ['hamstrings'] }, e: { primary: ['side_delts'] }, f: { primary: ['abs'] } };
  const byId = (id) => ex[id];
  const mk = (t, ids, extra = {}) => ({ id: `m${t}`, status: 'done', started_at: iso(t), finished_at: iso(t + 3600000), exercises: ids.map((i) => ({ exercise_id: i, sets: Array.from({ length: 4 }, () => ({ done: true, reps: 8, weight_kg: 40 })) })), ...extra });
  const wk = [mk(MON, ['a', 'b', 'c']), mk(MON + day, ['d', 'e'])];
  eq(badges(wk, [], 3, { exerciseById: byId }).find((b) => b.id === 'full').earned, null, 'core missing');
  const full = [...wk, mk(MON + 2 * day, ['f'])];
  eq(badges(full, [], 3, { exerciseById: byId }).find((b) => b.id === 'full').earned.workoutId, full[2].id);
  const nextWeek = [...wk, mk(MON + 7 * day, ['f'])];
  eq(badges(nextWeek, [], 3, { exerciseById: byId }).find((b) => b.id === 'full').earned, null, 'must be the same week');
  const thin = [mk(MON, ['a', 'b', 'c', 'd', 'e', 'f'])].map((w) => ({ ...w, exercises: w.exercises.map((it) => ({ ...it, sets: it.sets.slice(0, 3) })) }));
  eq(badges(thin, [], 3, { exerciseById: byId }).find((b) => b.id === 'full').earned, null, '3 sets a group is not enough');
  eq(badges([mk(MON, ['a'], { deload: true })]).find((b) => b.id === 'deload').earned.workoutId, `m${MON}`);
  const back = badges([mk(MON, ['a']), mk(MON + 22 * day, ['a'])]);
  eq(back.find((b) => b.id === 'comeback').earned.workoutId, `m${MON + 22 * day}`);
  eq(badges([mk(MON, ['a']), mk(MON + 20 * day, ['a'])]).find((b) => b.id === 'comeback').earned, null);
});

test('levels: 30 unique names, thresholds rise, level 2 after one typical workout', () => {
  eq(LEVELS.length, 30);
  eq(new Set(LEVELS).size, 30);
  for (let l = 2; l <= 30; l++) assert(xpForLevel(l) > xpForLevel(l - 1), `level ${l}`);
  eq(levelFor(0).name, 'Spark');
  eq(xpForLevel(2), 253);
  eq(xpForLevel(11), Math.round(250 * Math.pow(10, 1.6) + 3000));
  eq(levelFor(252).level, 1);
  eq(levelFor(253).level, 2);
  // Pace at a typical ~1,240 XP a week (3 workouts + weekly goal): early levels quick, the top ~2 years.
  const weeks = (l) => xpForLevel(l) / 1240;
  assert(weeks(5) < 3, 'level 5 within 3 weeks');
  assert(weeks(10) < 10, 'level 10 within 10 weeks');
  assert(weeks(30) > 95 && weeks(30) < 110, `Unbreakable at ~2 years (${weeks(30).toFixed(0)} weeks)`);
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
  eq(a.xp.total, workoutXP(ws[1], { badges: 1 }).total, 'its sets, exercises, PR and the New Metal badge');
  eq(a.before.xp, awardsFor(ws.slice(0, 1), [], 3).total, 'before = everything earlier, badges included');
  eq(a.after.xp, a.before.xp + a.xp.total);
  eq(a.levelUp, a.after.level > a.before.level);
  assert(a.badges.some((x) => x.id === 'pr1'), 'first PR badge on this workout');
  eq(a.celebrate.map((b) => b.id).join(), 'pr1');
  eq(workoutAwards(ws, [], 3, ws[1].id, MON + 2 * day, { seen: { pr1: iso(MON + day) } }).celebrate.length, 0, 'already seen: no second celebration');
  eq(workoutAwards(ws, [], 3, 'nope'), null);
});

test('badge art: every badge has its own icon, a tier and a shape; 22 badges', () => {
  eq(BADGES.length, 22);
  for (const b of BADGES) assert(BADGE_ART[b.id], `art for ${b.id}`);
  const keys = BADGES.map((b) => BADGE_ART[b.id].icon);
  eq(new Set(keys).size, keys.length, 'icons are unique');
});
