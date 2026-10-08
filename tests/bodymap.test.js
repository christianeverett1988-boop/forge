// Muscle map mapping and per-muscle stats (js/ui/bodymap.js, js/workouts/recovery.js).
import { test, eq, assert } from './harness.js';
import { MUSCLE_REGIONS, regionValues, musclesIn, recoveryColor, exerciseValues } from '../js/ui/bodymap.js';
import { FRONT, BACK } from '../js/ui/bodymap-data.js';
import { MUSCLES, muscleStats } from '../js/workouts/recovery.js';
import { EXERCISES } from '../js/workouts/exercises.js';

test('bodymap: every Forge muscle maps to a region that exists in the path data', () => {
  const slugs = { front: new Set(FRONT.map(([s]) => s)), back: new Set(BACK.map(([s]) => s)) };
  for (const m of MUSCLES) {
    assert(MUSCLE_REGIONS[m] && MUSCLE_REGIONS[m].length, `${m} mapped`);
    for (const [side, slug] of MUSCLE_REGIONS[m]) assert(slugs[side].has(slug), `${m} → ${side}:${slug}`);
  }
  for (const e of EXERCISES) for (const m of [...e.primary, ...e.secondary]) assert(MUSCLE_REGIONS[m], `${e.id}: ${m}`);
});

test('bodymap: brief mapping — delts split front/back, lats on upper-back, abductors on gluteal', () => {
  eq(MUSCLE_REGIONS.front_delts[0].join(':'), 'front:deltoids');
  eq(MUSCLE_REGIONS.side_delts[0].join(':'), 'front:deltoids');
  eq(MUSCLE_REGIONS.rear_delts[0].join(':'), 'back:deltoids');
  eq(MUSCLE_REGIONS.lats[0].join(':'), 'back:upper-back');
  eq(MUSCLE_REGIONS.abductors[0].join(':'), 'back:gluteal');
  eq(musclesIn('back', 'upper-back').sort().join(), 'lats,upper_back');
});

test('bodymap: worked shows the strongest muscle in a region; recovery shows the most tired', () => {
  eq(regionValues({ glutes: 0.45, abductors: 1 }, 'back').gluteal, 1);
  eq(regionValues({ glutes: 80, abductors: 100 }, 'back', Math.min).gluteal, 80);
  eq(regionValues({ quads: 1 }, 'back').quadriceps, undefined);
  eq(recoveryColor(20), '#ff4d3a');
  eq(recoveryColor(70), '#ffb020');
  eq(recoveryColor(90), '#36d17a');
  const v = exerciseValues(EXERCISES.find((e) => e.id === 'bb_back_squat'));
  eq(v.quads, 1);
  eq(v.hamstrings, 0.45);
});

test('muscle stats: last trained and sets this week (primary 1, secondary 0.5), deleted and old ignored', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const day = 86400000;
  const iso = (t) => new Date(t).toISOString();
  const ex = { squat: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] } };
  const w = (t, sets, extra = {}) => ({ status: 'done', started_at: iso(t), finished_at: iso(t), exercises: [{ exercise_id: 'squat', sets }], ...extra });
  const set = { done: true, reps: 5 };
  const stats = muscleStats([
    w(now - day, [set, set, { ...set, warmup: true }]),
    w(now - 3 * day, [set]),
    w(now - 10 * day, [set, set, set]),
    w(now - 2 * day, [set], { deleted: true }),
  ], (id) => ex[id], now);
  eq(stats.quads.weekSets, 3);
  eq(stats.hamstrings.weekSets, 1.5);
  eq(stats.quads.last, iso(now - day));
  eq(stats.chest.last, null);
});
