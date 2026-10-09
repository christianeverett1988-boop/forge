import { test, eq, near, assert } from './harness.js';
import { todayRings, weeklySets, groupOf, WEEKLY_SET_TARGET } from '../js/workouts/rings.js';
import { EXERCISES } from '../js/workouts/exercises.js';

const byId = (id) => EXERCISES.find((e) => e.id === id);
const NOW = new Date(2026, 9, 8, 18).getTime(); // Thu 8 Oct 2026, local
const at = (d, h = 9) => new Date(2026, 9, d, h).toISOString();
const sets = (n) => Array.from({ length: n }, () => ({ done: true, warmup: false }));
const w = (day, items, status = 'done') => ({
  status, started_at: at(day), finished_at: at(day, 10),
  exercises: items.map(([id, n]) => ({ exercise_id: id, sets: [{ done: true, warmup: true }, ...sets(n)] })),
});

test('rings: patterns map to push / pull / legs; core and conditioning count for none', () => {
  eq(groupOf('horizontal_push'), 'push');
  eq(groupOf('vertical_pull'), 'pull');
  eq(groupOf('hinge'), 'legs');
  eq(groupOf('core_flexion'), null);
  eq(groupOf('conditioning'), null);
});

test('rings: weekly sets count this week only, working sets only, finished workouts only', () => {
  const ws = [
    w(5, [['bb_back_squat', 3], ['bb_bench_press', 4]]), // Mon this week
    w(7, [['pullup', 3], ['plank', 3]]),
    w(2, [['bb_deadlift', 5]]), // last week
    w(8, [['bb_back_squat', 2]], 'active'), // in progress: not yet
  ];
  const s = weeklySets(ws, byId, NOW);
  eq(JSON.stringify(s), '{"push":4,"pull":3,"legs":3}');
});

test('rings: training days vs goal, sets capped per group, recovery average', () => {
  const ws = [w(5, [['bb_back_squat', 30]]), w(6, [['bb_bench_press', 3]])];
  const [tr, st, rc] = todayRings({ workouts: ws, profile: { trainingDays: 4, experience: 'intermediate' }, exerciseById: byId, now: NOW });
  eq(tr.text, '2/4 days');
  near(tr.value, 0.5, 1e-9);
  const per = WEEKLY_SET_TARGET.intermediate;
  eq(st.done, per + 3, '30 leg sets only count up to the legs target');
  near(st.value, (per + 3) / (per * 3), 1e-9);
  assert(rc.value > 0 && rc.value < 1, 'fresh % drops after a big leg day');
  const none = todayRings({ workouts: [], profile: {}, exerciseById: byId, now: NOW });
  eq(none.map((r) => r.text).join(' | '), '0/3 days | 0/10 push · 0/10 pull · 0/10 legs | 100% fresh');
});

test('rings: calories and protein join when food is passed (US-style numbers), and cap nothing', () => {
  const food = { kcal: 1850, protein_g: 120.4, targetKcal: 2200, targetProtein: 160 };
  const r = todayRings({ workouts: [], profile: {}, exerciseById: byId, now: NOW, food });
  eq(r.map((x) => x.key).join(), 'training,sets,recovery,calories,protein');
  eq(r[3].text, '1,850 of 2,200 kcal');
  eq(r[4].text, '120 of 160 g');
  near(r[3].value, 1850 / 2200, 1e-9);
  assert(todayRings({ workouts: [], profile: {}, exerciseById: byId, now: NOW }).length === 3, 'no food: three rings as before');
  eq(todayRings({ workouts: [], profile: {}, exerciseById: byId, now: NOW, food: { ...food, kcal: 2500 } })[3].value > 1, true, 'over target reads above 1');
});

test('rings: cardio counts as a training day', () => {
  const [tr] = todayRings({ workouts: [], cardio: [{ started_at: at(6) }], profile: { trainingDays: 3 }, exerciseById: byId, now: NOW });
  eq(tr.done, 1);
});

test('rings: a deload week lowers the weekly sets target and says so', () => {
  const r = todayRings({ workouts: [], profile: { experience: 'intermediate' }, exerciseById: byId, now: NOW, deload: true })[1];
  eq(r.per, Math.round(WEEKLY_SET_TARGET.intermediate * 0.5));
  eq(r.label, 'Weekly sets · deload');
});
