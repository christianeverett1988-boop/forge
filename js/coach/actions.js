// What Coach's accept / reject cards do when you tap "Do it". Each action only calls a function the app
// already has; the screen hands them in as `deps` so tests can spy on them. Nothing runs without a tap.
//   start_workout → previewPlan() + startPlan(plan)   (the same path as Today's Start button)
//   lighter       → overrideReadiness(false)           (Readiness back on, so the red-light day is lighter)
//   deload        → confirm sheet, then startDeload()  (the Train screen's "Start a deload week")

export const ACTIONS = {
  async start_workout(deps) {
    const plan = deps.previewPlan();
    if (!plan || !plan.exercises.length) return 'none';
    deps.startPlan(plan);
    return 'started';
  },
  async lighter(deps) {
    deps.overrideReadiness(false);
    return 'lighter';
  },
  async deload(deps) {
    const ok = await deps.confirm({ title: 'Start a deload week?', message: 'Workouts get lighter for 7 days (lighter weights, fewer sets), then progress resumes. You can still train as usual.', confirmLabel: 'Start deload' });
    if (!ok) return 'cancelled';
    deps.startDeload();
    return 'deload';
  },
};

/** Runs one action by id. Returns what happened ('started' | 'lighter' | 'deload' | 'cancelled' | 'none'). */
export async function runAction(id, deps) {
  const run = ACTIONS[id];
  return run ? run(deps) : 'none';
}
