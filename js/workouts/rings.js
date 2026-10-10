// Today rings (brief §10): Training days this week, Weekly sets (Push / Pull / Legs) and Recovery.
// Pure functions; js/ui/rings.js draws them. Calories and protein (today) join when you pass `food`.
import { streak, weekOf } from './awards.js';
import { doneSets, recoveryPct, fatigueAt } from './recovery.js';

// Movement pattern → weekly-sets group. Core, carries, conditioning, mobility and skills don't count.
export const SET_GROUPS = {
  push: ['horizontal_push', 'vertical_push', 'chest_fly', 'triceps', 'lateral_raise'],
  pull: ['horizontal_pull', 'vertical_pull', 'biceps', 'rear_delt', 'shrug'],
  legs: ['squat', 'hinge', 'lunge', 'hip_thrust', 'calf', 'knee_extension', 'knee_flexion', 'hip_abduction', 'hip_adduction'],
};
const GROUP_OF = Object.fromEntries(Object.entries(SET_GROUPS).flatMap(([g, ps]) => ps.map((p) => [p, g])));
export const groupOf = (pattern) => GROUP_OF[pattern] || null;

// Hard sets a week per group: roughly 10–20 per muscle group, from where you are.
export const WEEKLY_SET_TARGET = { beginner: 10, intermediate: 14, advanced: 18 };

export const DELOAD_SCALE = 0.5;

// The big muscles the Recovery ring averages (same six as Train's recovery card).
export const MAJOR = ['chest', 'lats', 'quads', 'hamstrings', 'glutes', 'front_delts'];

const finished = (ws) => ws.filter((w) => !w.deleted && w.status === 'done');

/** Working sets done this week (Mon–Sun, local) per group. */
export function weeklySets(workouts, exerciseById, now = Date.now()) {
  const wk = weekOf(new Date(now).toISOString());
  const out = { push: 0, pull: 0, legs: 0 };
  for (const { exerciseId, at } of doneSets(finished(workouts))) {
    if (!at || weekOf(at) !== wk) continue;
    const g = groupOf(exerciseById(exerciseId)?.pattern);
    if (g) out[g]++;
  }
  return out;
}

/**
 * The three rings, each { key, label, value (0..1+), done, goal, text }.
 *   profile: { trainingDays, experience }; deload: this is a deload week (smaller sets target)
 */
export function todayRings({ workouts = [], cardio = [], profile = {}, exerciseById, now = Date.now(), deload = false, food = null }) {
  const goalDays = profile.trainingDays || 3;
  const st = streak(workouts, cardio, goalDays, now);
  // Deload week: half the usual sets (the generator halves sets on a deload), so the ring can still close.
  const base = WEEKLY_SET_TARGET[profile.experience] || WEEKLY_SET_TARGET.beginner;
  const per = deload ? Math.round(base * DELOAD_SCALE) : base;
  const sets = weeklySets(workouts, exerciseById, now);
  // Each group counts up to its own target, so 40 leg sets can't close the ring on their own.
  const setsDone = Object.values(sets).reduce((n, v) => n + Math.min(v, per), 0);
  const active = workouts.filter((w) => !w.deleted && (w.status === 'done' || w.status === 'active'));
  const rec = recoveryPct(fatigueAt(active, exerciseById, now));
  const fresh = Math.round(MAJOR.reduce((n, m) => n + (rec[m] ?? 100), 0) / MAJOR.length);
  const out = [
    { key: 'training', label: 'Training', value: st.thisWeek.done / goalDays, done: st.thisWeek.done, goal: goalDays, text: `${st.thisWeek.done}/${goalDays} days` },
    {
      key: 'sets', label: deload ? 'Weekly sets · deload' : 'Weekly sets', value: setsDone / (per * 3), done: setsDone, goal: per * 3,
      text: `${sets.push}/${per} push · ${sets.pull}/${per} pull · ${sets.legs}/${per} legs`, groups: sets, per,
    },
    { key: 'recovery', label: 'Recovery', value: fresh / 100, done: fresh, goal: 100, text: `${fresh}% fresh` },
  ];
  // Today's food: calories in vs target, then protein. food: { kcal, protein_g, targetKcal, targetProtein }.
  if (food && food.targetKcal > 0) {
    const n = (v) => Math.round(v).toLocaleString('en-US');
    const over = Math.round(food.kcal - food.targetKcal);
    // Non-breaking spaces keep every number with its unit.
    out.push({
      key: 'calories', label: 'Calories today', value: food.kcal / food.targetKcal, done: food.kcal, goal: food.targetKcal, over: over > 0,
      text: `${n(food.kcal)} of ${n(food.targetKcal)}\u00a0kcal`,
      extra: over > 0 ? `${n(over)}\u00a0kcal over` : '',
    });
    if (food.targetProtein > 0) out.push({ key: 'protein', label: 'Protein today', value: food.protein_g / food.targetProtein, done: food.protein_g, goal: food.targetProtein, text: `${n(food.protein_g)} of ${n(food.targetProtein)} g` });
  }
  return out;
}
