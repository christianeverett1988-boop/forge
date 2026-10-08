// Per-muscle recovery. Each hard set adds fatigue to the muscles it trains (primary 1.0, secondary 0.5),
// scaled by effort (how close to failure). Fatigue decays exponentially: ~90% gone after 72 h for big
// muscles and 48 h for small ones. Pure functions; see docs/workout-algorithm.md.

export const MUSCLES = [
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'traps', 'biceps', 'triceps',
  'forearms', 'abs', 'obliques', 'lower_back', 'glutes', 'quads', 'hamstrings', 'adductors', 'abductors', 'calves',
];

export const MUSCLE_LABELS = {
  chest: 'Chest', front_delts: 'Front delts', side_delts: 'Side delts', rear_delts: 'Rear delts', lats: 'Lats',
  upper_back: 'Upper back', traps: 'Traps', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs',
  obliques: 'Obliques', lower_back: 'Lower back', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings',
  adductors: 'Adductors', abductors: 'Abductors', calves: 'Calves',
};

const LARGE = new Set(['quads', 'hamstrings', 'glutes', 'chest', 'lats', 'upper_back', 'lower_back']);
export const recoveryHours = (m) => (LARGE.has(m) ? 72 : 48);

/** Hard sets that take a muscle to 0% recovered. */
export const SETS_TO_EXHAUST = 10;

/** Effort multiplier from reps in reserve: RIR 2 = 1.0, failure (0) = 1.3, easy (4+) = 0.7. */
export function effortFactor(rir) {
  if (rir == null || !Number.isFinite(rir)) return 1;
  return Math.min(1.3, Math.max(0.6, 1 + (2 - rir) * 0.15));
}

/** Working sets done with their time. workouts: [{ finished_at|started_at, exercises:[{exercise_id, sets:[...] }] }] */
export function* doneSets(workouts) {
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      for (const s of ex.sets || []) {
        if (!s.done || s.warmup) continue;
        const at = s.completed_at || w.finished_at || w.started_at;
        yield { exerciseId: ex.exercise_id, set: s, at, workout: w };
      }
    }
  }
}

/** Fatigue in "hard set" units per muscle at time `now` (ms). */
export function fatigueAt(workouts, exerciseById, now = Date.now()) {
  const f = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  for (const { exerciseId, set, at } of doneSets(workouts)) {
    const ex = exerciseById(exerciseId);
    if (!ex) continue;
    const hours = (now - Date.parse(at)) / 3600000;
    if (hours < 0 || hours > 24 * 7) continue;
    const kindScale = ex.kind === 'conditioning' ? 0.5 : 1;
    const e = effortFactor(set.rir) * kindScale;
    const add = (m, w) => {
      if (!(m in f)) return;
      const tau = recoveryHours(m) / Math.LN10;
      f[m] += w * e * Math.exp(-hours / tau);
    };
    (ex.primary || []).forEach((m) => add(m, 1));
    (ex.secondary || []).forEach((m) => add(m, 0.5));
  }
  return f;
}

/** 0–100 per muscle. */
export function recoveryPct(fatigue) {
  const out = {};
  for (const m of MUSCLES) out[m] = Math.round(100 * (1 - Math.min(1, (fatigue[m] || 0) / SETS_TO_EXHAUST)));
  return out;
}

export function averageRecovery(pct, muscles) {
  if (!muscles.length) return 100;
  return muscles.reduce((s, m) => s + (pct[m] ?? 100), 0) / muscles.length;
}
