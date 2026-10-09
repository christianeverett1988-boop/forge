// Gathers what Coach's answers need from the app's existing modules (the only place that touches state).
// Nothing is calculated here that another module does not already calculate; answers.js only words it.
import { state, units } from '../state.js';
import { todayKey } from '../ui.js';
import { intel, reportFor, currentReportWeek, currentGoalPath } from '../health/intel.js';
import { currentReadiness, currentScore, readinessOverridden } from '../health/today.js';
import { activeWorkout, currentRecovery, stalledMainLifts, unit } from '../workouts/plan.js';
import { previewPlan } from '../screens/train.js'; // today's plan with any edits made on Train, as Today shows it
import { exerciseById } from '../workouts/library.js';
import { liftChanges } from './lifts.js';

/** The muscles today's plan trains as primary movers, in the order they first appear. */
function planMuscles(plan) {
  const out = [];
  for (const it of (plan && plan.exercises) || []) {
    const ex = exerciseById(it.exercise_id);
    for (const m of (ex && ex.primary) || []) if (!out.includes(m)) out.push(m);
  }
  return out;
}

export function coachData() {
  const i = intel();
  const today = todayKey();
  const workouts = state.workouts || [];
  const plan = previewPlan();
  const nameOf = (id) => (exerciseById(id) || { name: id }).name;
  return {
    today,
    units: units(),
    unit: unit(),
    goal: i.goal,
    goalKg: state.profile && state.profile.targetWeightKg,
    weights: i.weights,
    trends: i.trends,
    goalPath: currentGoalPath(),
    report: reportFor(currentReportWeek()),
    readiness: currentReadiness(),
    readinessOverridden: readinessOverridden(),
    score: currentScore(),
    plan,
    planMuscles: planMuscles(plan),
    recovery: currentRecovery(),
    activeWorkout: !!activeWorkout(),
    hasTraining: workouts.some((w) => !w.deleted && (w.status === 'done' || w.status === 'active')),
    lifts: liftChanges({ workouts, unit: unit(), today, nameOf }),
    stalled: stalledMainLifts().map((id) => ({ id, name: nameOf(id) })),
  };
}
