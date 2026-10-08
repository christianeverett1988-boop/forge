// Motion templates for the silhouette demo (js/ui/figure.js).
// Side view, facing right. Joint angles in degrees: 0 = pointing down, 90 = forward (right), 180 = up.
// root 'ground': the ankle is planted at `at` and the chain goes up (shin → thigh → torso → arms).
// root 'hang':   the hands hold a bar at `at` and the chain goes down (forearm → upper arm → torso → legs).
// `a` is the start pose, `b` the hardest point (muscles fully lit). `phases` is one rep:
//   [to, ms, easing] moves toward pose a or b; ['hold', ms] pauses. Default tempo ≈ lower 2 s, pause, lift 1 s.
//
// v0.3.0 ships three samples so the look can be approved; v0.3.1 adds the full library.

export const TEMPLATES = {
  squat_barbell: {
    prop: 'barbell',
    a: { root: 'ground', at: [92, 198], shin: 180, thigh: 180, torso: 180, upper: -25, fore: 160 },
    b: { root: 'ground', at: [92, 198], shin: 145, thigh: 265, torso: 138, upper: -5, fore: 175 },
    phases: [['b', 2000, 'inOut'], ['hold', 250], ['a', 1000, 'out'], ['hold', 500]],
  },
  pullup: {
    prop: 'bar',
    a: { root: 'hang', at: [104, 30], fore: 2, upper: 0, torso: 2, thigh: 35, shin: -55, foot: 60 },
    b: { root: 'hang', at: [104, 30], fore: 20, upper: 235, torso: -6, thigh: 40, shin: -40, foot: 60 },
    phases: [['b', 1000, 'out'], ['hold', 350], ['a', 2000, 'inOut'], ['hold', 450]],
  },
  curl_dumbbell: {
    prop: 'dumbbell',
    a: { root: 'ground', at: [90, 198], shin: 180, thigh: 180, torso: 180, upper: 6, fore: 8 },
    b: { root: 'ground', at: [90, 198], shin: 180, thigh: 180, torso: 182, upper: 14, fore: 158 },
    phases: [['b', 1000, 'out'], ['hold', 300], ['a', 2000, 'inOut'], ['hold', 450]],
  },
};

/** Exercise id → template. Anything not listed falls back to photos (v0.3.1) or the muscle list. */
export const EXERCISE_TEMPLATES = {
  bb_back_squat: 'squat_barbell',
  pullup: 'pullup',
  db_curl: 'curl_dumbbell',
};

export const templateFor = (exerciseId) => TEMPLATES[EXERCISE_TEMPLATES[exerciseId]] || null;

/** Coverage report: which library exercises have a silhouette. */
export function coverage(exercises) {
  const mapped = exercises.filter((e) => EXERCISE_TEMPLATES[e.id]).map((e) => e.id);
  return { mapped, total: exercises.length, percent: Math.round((mapped.length / exercises.length) * 100) };
}
