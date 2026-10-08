// The full exercise list: the built-in library plus your custom exercises.
import { EXERCISES } from './exercises.js';
import { state } from '../state.js';

let cacheKey = null;
let cache = null;

/** Custom exercises are stored with a flat `equipment` list (Firestore can't nest arrays). */
export function fromCustom(r) {
  return {
    id: r.id,
    name: r.name,
    pattern: r.pattern,
    kind: r.kind || 'compound',
    load: r.load || 'other',
    primary: r.primary || [],
    secondary: r.secondary || [],
    equip: [r.equipment || []],
    reps: [r.rep_lo || 8, r.rep_hi || 12],
    level: 1,
    unilateral: !!r.unilateral,
    timed: !!r.timed,
    cues: r.cues || [],
    avoid: [],
    fedb: null,
    custom: true,
  };
}

export function allExercises() {
  const key = state.exercises;
  if (key !== cacheKey) {
    cacheKey = key;
    cache = [...EXERCISES, ...(state.exercises || []).map(fromCustom)];
  }
  return cache;
}

let mapKey = null;
let map = null;
export function exerciseById(id) {
  const all = allExercises();
  if (all !== mapKey) {
    mapKey = all;
    map = new Map(all.map((e) => [e.id, e]));
  }
  return map.get(id) || null;
}

let instructions = null;
/** Full step-by-step instructions from free-exercise-db (public domain), loaded on demand. */
export async function loadInstructions() {
  if (!instructions) {
    const res = await fetch('data/exercise-instructions.json');
    instructions = await res.json();
  }
  return instructions;
}
