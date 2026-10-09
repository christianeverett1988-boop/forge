// Values computed from state that several screens need.
import { state } from './state.js';
import { dailyWeights, smooth } from './weight/smoothing.js';
import { computeTargets } from './nutrition/targets.js';
import { suspectIds } from './withings/review.js';

/** Your trend. Weigh-ins waiting in "Is this you?" (Withings unsure, or probably a family member's) are left out. */
export function weightSeries() {
  const sus = suspectIds(state.weights);
  return smooth(dailyWeights(state.weights.map((w) => ({ day: w.day, kg: w.kg, source: w.source, measured_at: w.measured_at, review: w.review || sus.has(w.id) }))));
}

/** Body measurements that are yours: not waiting in "Is this you?" (a family member's body fat shouldn't be in your tiles). */
export function myBodyMeasures() {
  const sus = suspectIds(state.weights);
  return (state.body_measures || []).filter((d) => !sus.has(d.id));
}

/** Latest trend weight, falling back to the weight entered in onboarding. */
export function currentWeightKg(series = weightSeries()) {
  if (series.length) return series[series.length - 1].trend;
  return state.profile ? state.profile.weightKg : null;
}

/** Targets use your latest trend weight, so they follow you as you log. */
export function currentTargets() {
  const p = state.profile;
  if (!p) return null;
  return computeTargets({ ...p, weightKg: currentWeightKg() || p.weightKg });
}

/** The two targets the Forge Score and the weekly report judge food against, or null before a profile exists. */
export function foodTargets() {
  const t = currentTargets();
  return t ? { calories: t.calories, proteinG: t.proteinG } : null;
}
