// The running workout, shared by the guided player and the list view.
// Holds a working copy (so typing never fights the database listener), saves it debounced, and owns
// pause / resume / away / complete / undo / finish / discard.
import { state } from '../state.js';
import { patch, softDelete } from '../db.js';
import { historyIndex, unit } from './plan.js';
import { exerciseById } from './library.js';
import { toUnit, detectPRs } from './progression.js';
import { elapsedMs, isPaused, pauseFields, resumeFields, awayGapMs, removeAwayFields } from './clock.js';
import { buildQueue, restAfter, validateSet, exerciseComplete, setLabel } from './session-core.js';
import { startRest, stopRest, pauseRest, resumeRest } from '../timer.js';

export const live = { w: null };
const closedIds = new Set(); // finished or discarded here; ignore stale "active" copies until the listener catches up
let saveTimer = null;
const round1 = (x) => Math.round(x * 10) / 10;

const SEEN_KEY = (id) => `forge.lastSeen.${id}`;
function markSeen() {
  if (!live.w) return;
  try { localStorage.setItem(SEEN_KEY(live.w.id), String(Date.now())); } catch { /* private mode */ }
}
function lastSeen(id) {
  try { return Number(localStorage.getItem(SEEN_KEY(id))) || null; } catch { return null; }
}
// Remember when the app was last on screen with a workout open (kill-safe: written as it hides).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') markSeen();
});
setInterval(() => { if (document.visibilityState === 'visible') markSeen(); }, 15000);

/** Load (or keep) the working copy of the active workout. Returns it or null. */
export function syncLive() {
  const w = state.workouts.find((x) => x.status === 'active' && !x.deleted && !closedIds.has(x.id));
  if (!w) {
    live.w = null;
    return null;
  }
  if (!live.w || live.w.id !== w.id) {
    live.w = structuredClone(w);
    live.w.paused_ms = live.w.paused_ms || 0;
    live.w.paused_at = live.w.paused_at || null;
  }
  return live.w;
}

export function save(now = false) {
  if (!live.w) return;
  clearTimeout(saveTimer);
  const w = live.w;
  const go = () => patch('workouts', w.id, { exercises: w.exercises, prs: w.prs || [], notes: w.notes || [], paused_at: w.paused_at || null, paused_ms: w.paused_ms || 0 });
  if (now) go();
  else saveTimer = setTimeout(go, 400);
}

export const elapsed = () => (live.w ? elapsedMs(live.w) : 0);
export const paused = () => isPaused(live.w);

export function pause() {
  if (!live.w || isPaused(live.w)) return;
  Object.assign(live.w, pauseFields(live.w));
  pauseRest();
  save(true);
}

export function resume() {
  if (!live.w || !isPaused(live.w)) return;
  Object.assign(live.w, resumeFields(live.w));
  resumeRest();
  markSeen();
  save(true);
}

/** Minutes away (>10) since the app was last open with this workout, if not paused. 0 otherwise. */
export function checkAway() {
  if (!live.w) return 0;
  return awayGapMs(live.w, lastSeen(live.w.id));
}
export function removeAway(gapMs) {
  Object.assign(live.w, removeAwayFields(live.w, gapMs));
  markSeen();
  save(true);
}
export const acceptAway = () => markSeen();

export const queue = () => (live.w ? buildQueue(live.w.exercises) : []);

/**
 * Complete set j of exercise i with the given values (falls back to the plan).
 * Returns { ok:false, error } or { ok:true, prs:[...], rest:{sec,label}|null, lastOfExercise, lastSetOfWorkout, workingDone }.
 * Starts the rest timer itself (with a "next up" preview) unless `startRestTimer` is false.
 */
export function completeSet(i, j, { reps, weightKg, rir } = {}, { startRestTimer = true } = {}) {
  const w = live.w;
  const it = w.exercises[i];
  const s = it.sets[j];
  const ex = exerciseById(it.exercise_id) || {};
  // Fall back to the plan, then to the previous done set of this exercise (first-time lifts have no plan).
  const before = it.sets.slice(0, j).filter((x) => x.done && !x.warmup).pop();
  const r = reps ?? s.reps ?? s.plan_reps ?? (before && !s.warmup ? before.reps : null);
  const kg = weightKg !== undefined ? weightKg : s.weight_kg ?? s.plan_weight_kg ?? (before && !s.warmup ? before.weight_kg : null) ?? null;
  const err = validateSet(ex, s, { reps: r, weightKg: kg });
  if (err) return { ok: false, error: err };
  s.reps = r;
  s.weight_kg = kg;
  if (rir !== undefined) s.rir = rir;
  s.done = true;
  s.completed_at = new Date().toISOString();

  // PRs (working sets only), with the old best for "185 → 192".
  const fresh = [];
  if (!s.warmup && ex.id) {
    const u = unit();
    const sessionSets = it.sets.filter((x) => x.done && !x.warmup).map((x) => ({ weight: x.weight_kg == null ? null : round1(toUnit(x.weight_kg, u)), reps: x.reps }));
    const prs = detectPRs(ex, sessionSets, historyIndex().historyFor(ex.id));
    w.prs = w.prs || [];
    for (const p of prs) {
      if (w.prs.some((q) => q.exercise_id === ex.id && q.type === p.type && q.value >= p.value)) continue;
      w.prs = w.prs.filter((q) => !(q.exercise_id === ex.id && q.type === p.type));
      const withUnit = p.type === 'e1rm' || p.type === 'weight' ? ` ${u}` : '';
      const rec = { exercise_id: ex.id, type: p.type, value: p.value, prev: p.prev ?? null, unit: withUnit.trim() || null, label: `${ex.name}: ${p.label}${withUnit}` };
      w.prs.push(rec);
      fresh.push(rec);
    }
  }
  save();

  const q = buildQueue(w.exercises);
  const k = q.findIndex((st) => st.i === i && st.j === j);
  const rest = k >= 0 ? restAfter(q, w.exercises, k, ex, { deload: !!w.deload }) : null;
  const workingDone = w.exercises.reduce((n, x) => n + x.sets.filter((y) => y.done && !y.warmup).length, 0);
  const lastSetOfWorkout = w.exercises.every((x) => x.sets.every((y) => y.done));
  if (startRestTimer) {
    if (rest && !lastSetOfWorkout) startRest(rest.sec, rest.label, upNext(k));
    else stopRest();
  }
  return { ok: true, prs: fresh, rest, lastOfExercise: !s.warmup && exerciseComplete(it), lastSetOfWorkout, workingDone };
}

/** Preview of the next open step after queue index k, for the rest screen and the voice coach. */
export function upNext(k) {
  const w = live.w;
  const q = buildQueue(w.exercises);
  for (let n = k + 1; n < q.length; n++) {
    const { i, j } = q[n];
    if (w.exercises[i].sets[j].done) continue;
    return describeStep(i, j);
  }
  return null;
}

export function describeStep(i, j) {
  const it = live.w.exercises[i];
  const s = it.sets[j];
  const ex = exerciseById(it.exercise_id) || { name: it.exercise_id };
  const u = unit();
  const reps = s.reps ?? s.plan_reps;
  const kg = s.weight_kg ?? s.plan_weight_kg;
  const lbl = setLabel(it, j);
  const amount = ex.timed ? `${reps || ''} s` : `${reps || '?'} reps${kg ? ` · ${round1(toUnit(kg, u))} ${u}` : ''}`;
  return {
    i, j, id: ex.id, name: ex.name,
    detail: `${lbl.warmup ? 'Warm-up' : `Set ${lbl.n} of ${lbl.of}`} · ${amount}`,
    speak: `${ex.name}, ${ex.timed ? `${reps} seconds` : `${reps} reps`}`,
  };
}

export function undoSet(i, j) {
  const s = live.w.exercises[i].sets[j];
  s.done = false;
  s.completed_at = null;
  stopRest();
  save();
}

/** Finish: saves status done, finished_at and the pause-free duration. Returns the workout id. */
export function finishWorkout() {
  const w = live.w;
  if (isPaused(w)) Object.assign(w, resumeFields(w));
  stopRest();
  clearTimeout(saveTimer);
  const duration_ms = elapsedMs(w);
  patch('workouts', w.id, {
    exercises: w.exercises, prs: w.prs || [], status: 'done', finished_at: new Date().toISOString(),
    paused_at: null, paused_ms: w.paused_ms || 0, duration_ms,
  });
  closedIds.add(w.id);
  try { localStorage.removeItem(SEEN_KEY(w.id)); } catch { /* ignore */ }
  const id = w.id;
  live.w = null;
  return id;
}

export function discardWorkout() {
  const w = live.w;
  if (!w) return;
  stopRest();
  clearTimeout(saveTimer);
  closedIds.add(w.id);
  softDelete('workouts', w.id);
  patch('workouts', w.id, { status: 'discarded' });
  try { localStorage.removeItem(SEEN_KEY(w.id)); } catch { /* ignore */ }
  live.w = null;
}

export function flush() {
  if (live.w && saveTimer) save(true);
}

export const workingSetsDone = () => (live.w ? live.w.exercises.reduce((n, x) => n + x.sets.filter((y) => y.done && !y.warmup).length, 0) : 0);
