// W2b glue: trends, insights, the weekly report, the goal path and the Body Profile, read from state.
// Memoised on the arrays they depend on (same idea as today.js), so Today, Body and Trends share one calculation.
import { state, units } from '../state.js';
import { todayKey } from '../ui.js';
import { patch, put, newRecord } from '../db.js';
import { weightSeries, myBodyMeasures, foodTargets } from '../derived.js';
import { heightM } from '../withings/body.js';
import { buildSeries, allTrends } from './trends.js';
import { detectAnomalies } from './anomalies.js';
import { buildInsights, rankInsights, activeDismissals, dismissChange } from './insights.js';
import { weeklyReport, reportWeekFor } from './weekly.js';
import { goalPath, energyBalance } from './goalpath.js';
import { bodyProfile } from './bodyprofile.js';

let memo = null;
/** { today, series (Map), weights (weight series), trends (list), anomalies, goal } for the current state. */
export function intel() {
  const today = todayKey();
  const keys = [state.health_daily, state.body_measures, state.weights, state.profile];
  if (memo && memo.today === today && keys.every((k, i) => memo.keys[i] === k)) return memo.value;
  const weights = weightSeries();
  const goal = (state.profile && state.profile.goal) || 'health';
  const series = buildSeries({ weights, measures: myBodyMeasures(), rows: state.health_daily || [] });
  const value = {
    today, weights, series, goal,
    trends: allTrends({ series, today, goal }),
    anomalies: detectAnomalies({ today, weights, series, rows: state.health_daily || [] }),
  };
  memo = { today, keys, value };
  return value;
}

/** The top cards for Today / Body: ranked, with dismissed ones hidden. */
export function topInsights(limit = 3) {
  const i = intel();
  const cands = buildInsights({ trends: i.trends, anomalies: i.anomalies, units: units(), goal: i.goal });
  return rankInsights(cands, i.today, { dismissed: activeDismissals(state.settings, i.today), limit });
}

/** Hide an insight for 7 days (settings/main.insight_dismissed). Creates settings/main if it is not there yet. */
export function dismissInsight(id) {
  const change = dismissChange(state.settings, id, todayKey());
  if (state.settings) patch('settings', 'main', change);
  else put('settings', newRecord(change, { id: 'main' }));
}

export function reportFor(weekStart) {
  return weeklyReport({
    weekStart, today: todayKey(), series: weightSeries(), measures: myBodyMeasures(), rows: state.health_daily || [],
    workouts: state.workouts, cardio: state.cardio || [], profile: state.profile || {}, foodLogs: state.food_logs || [], targets: foodTargets(),
  });
}
export const currentReportWeek = () => reportWeekFor(todayKey());

export function currentGoalPath() {
  const p = state.profile || {};
  return goalPath({ series: intel().weights, goalKg: p.targetWeightKg, today: todayKey() });
}
export const currentEnergy = () => energyBalance({ measures: myBodyMeasures(), today: todayKey() });

export function currentBodyProfile() {
  const docs = myBodyMeasures();
  return bodyProfile({ measures: docs, heightM: heightM(docs, state.profile), sex: state.profile && state.profile.sex });
}
