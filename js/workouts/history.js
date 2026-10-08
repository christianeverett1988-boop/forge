// Turns stored workouts into per-exercise history (most recent first), in the display unit.
// Each session carries `deload` so progression and stall checks can skip deload weeks, while PRs,
// charts and History still show them.
import { toUnit } from './progression.js';

/** workouts: stored docs. unit: 'lb' | 'kg'. Only finished workouts count as history. */
export function buildIndex(workouts, unit) {
  const done = workouts
    .filter((w) => w.status === 'done' && !w.deleted)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  const sessions = new Map();
  const lastDone = new Map();
  for (const w of done) {
    const t = Date.parse(w.finished_at || w.started_at);
    for (const ex of w.exercises || []) {
      const sets = (ex.sets || [])
        .filter((s) => s.done && !s.warmup)
        .map((s) => ({
          weight: s.weight_kg == null ? null : Math.round(toUnit(s.weight_kg, unit) * 10) / 10,
          reps: s.reps,
          rir: s.rir,
        }));
      if (!sets.length) continue;
      if (!sessions.has(ex.exercise_id)) sessions.set(ex.exercise_id, []);
      sessions.get(ex.exercise_id).push({ date: w.started_at, workoutId: w.id, deload: !!w.deload, sets });
      if (!lastDone.has(ex.exercise_id)) lastDone.set(ex.exercise_id, t);
    }
  }
  return {
    done,
    /** Every session of an exercise, deloads included (progression filters them itself). */
    historyFor: (id) => sessions.get(id) || [],
    daysSince: (id, now = Date.now()) => (lastDone.has(id) ? (now - lastDone.get(id)) / 86400000 : null),
  };
}
