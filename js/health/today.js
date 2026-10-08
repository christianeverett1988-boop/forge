// Readiness for the app, read from state. Memoised on the arrays it depends on, so the workout generator
// and Today can both ask without recomputing.
import { state } from '../state.js';
import { todayKey } from '../ui.js';
import { fatigueAt } from '../workouts/recovery.js';
import { exerciseById } from '../workouts/library.js';
import { readiness, loadFromFatigue } from './readiness.js';
import { forgeScore } from './score.js';
import { weightSeries, myBodyMeasures } from '../derived.js';

const OVERRIDE = 'forge.readiness.override';

let memo = null;
export function currentReadiness() {
  const day = todayKey();
  if (memo && memo.rows === state.health_daily && memo.workouts === state.workouts && memo.day === day) return memo.value;
  const recent = state.workouts.filter((w) => !w.deleted && (w.status === 'done' || w.status === 'active'));
  const load = loadFromFatigue(fatigueAt(recent, exerciseById, Date.now()));
  const value = readiness({ rows: state.health_daily || [], today: day, load });
  memo = { rows: state.health_daily, workouts: state.workouts, day, value };
  return value;
}

let scoreMemo = null;
/** The Forge Score from everything in state (Apple Health days, weight trend, body measures, workouts). */
export function currentScore() {
  const day = todayKey();
  const keys = [state.health_daily, state.body_measures, state.weights, state.workouts, state.cardio, state.profile];
  if (scoreMemo && scoreMemo.day === day && keys.every((k, i) => scoreMemo.keys[i] === k)) return scoreMemo.value;
  const value = forgeScore({
    rows: state.health_daily || [], series: weightSeries(), measures: myBodyMeasures(), workouts: state.workouts,
    cardio: state.cardio || [], profile: state.profile || {}, today: day,
  });
  scoreMemo = { day, keys, value };
  return value;
}

export function readinessOverridden() {
  try { return localStorage.getItem(OVERRIDE) === todayKey(); } catch { return false; }
}

/** "Train as planned": ignore Readiness for the rest of today. */
export function overrideReadiness(on = true) {
  try { if (on) localStorage.setItem(OVERRIDE, todayKey()); else localStorage.removeItem(OVERRIDE); } catch { /* private mode: lasts until reload */ }
}

/** What the workout generator takes: null until Readiness has a verdict. */
export function readinessForGenerator() {
  const r = currentReadiness();
  return r.status === 'ok' ? { level: r.level, override: readinessOverridden() } : null;
}
