// Values computed from state that several screens need.
import { state } from './state.js';
import { dailyWeights, smooth } from './weight/smoothing.js';
import { computeTargets } from './nutrition/targets.js';

export function weightSeries() {
  return smooth(dailyWeights(state.weights.map((w) => ({ day: w.day, kg: w.kg, source: w.source, measured_at: w.measured_at, review: w.review }))));
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
