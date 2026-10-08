import { test, eq, near, assert } from './harness.js';
import { EXERCISES } from '../js/workouts/exercises.js';
import { expandEquipment, canDo, LOCATION_PRESETS, YMCA_PRESET } from '../js/workouts/equipment.js';
import { fatigueAt, recoveryPct, effortFactor, SETS_TO_EXHAUST } from '../js/workouts/recovery.js';
import { nextTarget, availableLoads, warmups, platesPerSide, e1rm, detectPRs, isStalled, predictedReps } from '../js/workouts/progression.js';
import { generateWorkout, injuryTags, deloadInfo, pickDayType } from '../js/workouts/generator.js';
import { PROGRAMS, DAY_TYPES } from '../js/workouts/programs.js';

const byId = (id) => EXERCISES.find((e) => e.id === id);
const HOME = LOCATION_PRESETS.find((l) => l.key === 'home');
const YMCA = { equipment: YMCA_PRESET, weight_inventory: {} };
const H = 3600000;

// ---------- library ----------
test('library has 150+ exercises with unique ids', () => {
  assert(EXERCISES.length >= 150, `only ${EXERCISES.length}`);
  eq(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
});

test('bodyweight chains exist and are doable everywhere', () => {
  const none = expandEquipment([]);
  for (const chain of ['pushup', 'squat_bw', 'lsit', 'handstand', 'hinge_bw']) {
    const steps = EXERCISES.filter((e) => e.chain === chain);
    assert(steps.length >= 3, chain);
    assert(steps.some((e) => canDo(e, none)), `${chain} has no no-equipment step`);
  }
});

test('equipment aliases: adjustable bench counts as flat bench', () => {
  assert(expandEquipment(['bench_adjustable']).has('bench_flat'));
});

// ---------- recovery ----------
test('effort factor: failure > RIR 2 > easy', () => {
  assert(effortFactor(0) > effortFactor(2) && effortFactor(2) > effortFactor(4));
  eq(effortFactor(null), 1);
});

const squatWorkout = (hoursAgo, n = 5, now = Date.parse('2026-10-07T12:00:00Z')) => ({
  started_at: new Date(now - hoursAgo * H).toISOString(),
  exercises: [{ exercise_id: 'bb_back_squat', sets: Array.from({ length: n }, () => ({ done: true, weight_kg: 100, reps: 5, rir: 2 })) }],
});

test('hard squats tank quad recovery right after', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const pct = recoveryPct(fatigueAt([squatWorkout(0, 10)], byId, now));
  eq(pct.quads, 0);
  assert(pct.hamstrings > pct.quads); // secondary gets half
  eq(pct.biceps, 100);
});

test('large muscles ~90% recovered at 72 h, scaled by volume', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const f = fatigueAt([squatWorkout(72, SETS_TO_EXHAUST)], byId, now);
  near(f.quads, SETS_TO_EXHAUST * 0.1, 0.01);
  const fewer = fatigueAt([squatWorkout(24, 3)], byId, now);
  const more = fatigueAt([squatWorkout(24, 6)], byId, now);
  near(more.quads, fewer.quads * 2, 1e-9);
});

test('warm-up sets do not count toward fatigue', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const w = squatWorkout(0, 3);
  w.exercises[0].sets.forEach((s) => (s.warmup = true));
  eq(recoveryPct(fatigueAt([w], byId, now)).quads, 100);
});

// ---------- progression ----------
const bench = byId('bb_bench_press');
const session = (weight, reps) => ({ date: '2026-10-01', sets: reps.map((r) => ({ weight, reps: r, rir: 2 })) });

test('home inventory converts from kg to the display unit', () => {
  const db = byId('db_one_arm_row');
  const lb = availableLoads(db, HOME.weight_inventory, 'lb');
  eq(JSON.stringify(lb), '[5,30]');
  eq(JSON.stringify(availableLoads(db, HOME.weight_inventory, 'kg')), '[2.3,13.6]');
});

test('double progression: same weight, add a rep', () => {
  const t = nextTarget(bench, [session(135, [8, 7, 6])], { unit: 'lb' });
  eq(t.weight, 135);
  eq(t.reps, 7);
  eq(t.mode, 'reps');
});

test('top of range on every set adds the smallest weight step', () => {
  const [, hi] = bench.reps;
  const t = nextTarget(bench, [session(135, [hi, hi, hi])], { unit: 'lb' });
  eq(t.weight, 140);
  eq(t.reps, bench.reps[0]);
  const squat = byId('bb_back_squat');
  eq(nextTarget(squat, [session(185, [squat.reps[1], squat.reps[1], squat.reps[1]])], { unit: 'lb' }).weight, 195);
});

test('fixed dumbbells: 5 → 30 lb is too big a jump, so reps grow instead', () => {
  const lat = EXERCISES.find((e) => e.load === 'dumbbell' && e.pattern === 'lateral_raise');
  const hi = lat.reps[1];
  const t = nextTarget(lat, [session(5, [hi, hi, hi])], { unit: 'lb', inventory: HOME.weight_inventory });
  eq(t.weight, 5);
  eq(t.reps, hi + 1);
  assert(/too big a jump/.test(t.note));
});

test('heaviest dumbbell maxed: reps, then sets, then tempo', () => {
  const row = byId('db_one_arm_row');
  const hi = row.reps[1];
  const inv = { inventory: HOME.weight_inventory, unit: 'lb', role: 'secondary' };
  eq(nextTarget(row, [session(30, [hi, hi, hi])], inv).reps, hi + 1);
  const sets = nextTarget(row, [session(30, [hi + 8, hi + 8, hi + 8])], inv);
  eq(sets.mode, 'sets');
  eq(sets.sets, 4);
  eq(nextTarget(row, [session(30, [hi + 8, hi + 8, hi + 8, hi + 8, hi + 8])], inv).mode, 'tempo');
});

test('gym dumbbells step by 5 lb', () => {
  const row = byId('db_one_arm_row');
  const hi = row.reps[1];
  eq(nextTarget(row, [session(50, [hi, hi, hi])], { unit: 'lb' }).weight, 55);
});

test('two sessions under the range at the same weight resets ~10%', () => {
  const t = nextTarget(bench, [session(200, [3, 3, 2]), session(200, [4, 3, 3])], { unit: 'lb' });
  eq(t.mode, 'reset');
  eq(t.weight, 180);
});

test('stall detection: same weight 3 sessions, no rep gain', () => {
  const h = [session(135, [6, 6, 5]), session(135, [6, 6, 6]), session(135, [6, 5, 5])];
  assert(isStalled(h, 135));
  assert(!isStalled([session(135, [7, 6, 6]), ...h.slice(1)], 135));
});

test('deload: half the sets, ~10% lighter', () => {
  const t = nextTarget(bench, [session(200, [6, 6, 6])], { unit: 'lb', role: 'main', deload: true });
  eq(t.sets, 2);
  eq(t.weight, 180);
  eq(t.rir, 3);
});

test('bodyweight chain at the top suggests the next step', () => {
  const pu = byId('pushup');
  const next = byId('pushup_diamond');
  const t = nextTarget(pu, [session(null, [pu.reps[1], pu.reps[1], pu.reps[1]])], { chainNext: next });
  eq(t.mode, 'chain');
  eq(t.nextStepId, 'pushup_diamond');
});

test('timed holds add 5 seconds', () => {
  const plank = byId('plank');
  eq(nextTarget(plank, [session(null, [30, 30, 25])], {}).reps, 30);
});

test('first time: no weight, explain how to pick', () => {
  const t = nextTarget(bench, [], { unit: 'lb' });
  eq(t.weight, null);
  eq(t.mode, 'start');
});

test('barbell warm-ups climb to the working weight', () => {
  const w = warmups(bench, 185, { unit: 'lb' });
  eq(w[0].weight, 45);
  assert(w.every((s, i) => i === 0 || s.weight > w[i - 1].weight));
  assert(w.every((s) => s.weight < 185));
});

test('dumbbell warm-up uses an owned lighter pair', () => {
  const w = warmups(byId('db_floor_press') || byId('db_bench_press'), 30, { unit: 'lb', inventory: HOME.weight_inventory });
  eq(JSON.stringify(w), '[{"weight":5,"reps":8}]');
});

test('plate calculator', () => {
  eq(JSON.stringify(platesPerSide(225, 'lb').plates), '[45,45]');
  eq(JSON.stringify(platesPerSide(185, 'lb').plates), '[45,25]');
  eq(JSON.stringify(platesPerSide(100, 'kg').plates), '[25,15]');
  eq(platesPerSide(47, 'lb').remainder, 2);
});

test('e1RM (Epley) and PR detection', () => {
  near(e1rm(100, 10), 133.33, 0.01);
  eq(e1rm(100, 20), null);
  const prs = detectPRs(bench, [{ weight: 140, reps: 8 }], [session(135, [8, 8, 8])]);
  assert(prs.some((p) => p.type === 'e1rm'));
  assert(prs.some((p) => p.type === 'weight'));
  const rep = detectPRs(byId('db_one_arm_row'), [{ weight: 30, reps: 14 }], [session(30, [12, 12])]);
  assert(rep.some((p) => p.type === 'reps'));
  const vol = rep.find((p) => p.type === 'volume');
  assert(vol && vol.value === 420 && vol.prev === 360, 'best set volume 30×14 beats 30×12');
  const same = detectPRs(byId('db_one_arm_row'), [{ weight: 30, reps: 12 }], [session(30, [12, 12])]);
  assert(!same.some((p) => p.type === 'volume'), 'matching your best is not a PR');
});

// ---------- generator ----------
const profile = { experience: 'intermediate', sessionMin: 60, trainingDays: 3, injuries: '' };

test('injury note maps to tags', () => {
  eq(JSON.stringify(injuryTags('left shoulder, bad knee')), '["shoulder","knee"]');
  eq(injuryTags('').length, 0);
});

test('home workout only uses home equipment (or none)', () => {
  const avail = expandEquipment(HOME.equipment);
  for (const day of Object.keys(DAY_TYPES)) {
    const w = generateWorkout({ programKey: 'smart', dayType: day, location: HOME, profile, exercises: EXERCISES, unit: 'lb' });
    for (const it of w.exercises) assert(canDo(byId(it.exercise_id), avail), `${day}: ${it.exercise_id}`);
  }
});

test('home full body fills squat, push, pull and hinge slots', () => {
  const w = generateWorkout({ programKey: 'full_body_3x', dayType: 'full_a', location: HOME, profile, exercises: EXERCISES, unit: 'lb' });
  const patterns = w.exercises.map((it) => byId(it.exercise_id).pattern);
  for (const p of ['squat', 'horizontal_push', 'horizontal_pull']) assert(patterns.includes(p), p);
  assert(patterns.includes('hinge') || patterns.includes('hip_thrust'));
});

test('YMCA picks barbell main lifts; 5x5 uses pinned lifts', () => {
  const w = generateWorkout({ programKey: 'five_by_five', dayType: 'sl5x5_a', location: YMCA, profile, exercises: EXERCISES, unit: 'lb' });
  eq(w.exercises.map((e) => e.exercise_id).join(), 'bb_back_squat,bb_bench_press,bb_bent_row');
  assert(w.exercises.every((e) => e.target.sets === 5));
});

test('5x5 at home explains the missing barbell', () => {
  const w = generateWorkout({ programKey: 'five_by_five', dayType: 'sl5x5_a', location: HOME, profile, exercises: EXERCISES, unit: 'lb' });
  assert(w.notes.some((n) => /barbell and rack/.test(n)));
  assert(w.exercises.length >= 2);
});

test('injury tags exclude matching exercises', () => {
  const w = generateWorkout({ programKey: 'ppl', dayType: 'push', location: YMCA, profile: { ...profile, injuries: 'shoulder' }, exercises: EXERCISES, unit: 'lb' });
  for (const it of w.exercises) assert(!(byId(it.exercise_id).avoid || []).includes('shoulder'), it.exercise_id);
});

test('travel location is bodyweight only and still builds a session', () => {
  const travel = { equipment: [], weight_inventory: {} };
  const w = generateWorkout({ programKey: 'full_body_3x', dayType: 'full_a', location: travel, profile, exercises: EXERCISES, unit: 'lb' });
  assert(w.exercises.length >= 4);
  for (const it of w.exercises) assert(canDo(byId(it.exercise_id), expandEquipment([])));
});

test('main lifts stick across sessions (continuity)', () => {
  const daysSince = (id) => (id === 'db_floor_press' ? 3 : null);
  const w = generateWorkout({ programKey: 'smart', dayType: 'full_a', location: HOME, profile, exercises: EXERCISES, unit: 'lb', daysSince });
  if (byId('db_floor_press')) assert(w.exercises.some((e) => e.exercise_id === 'db_floor_press'));
});

test('short sessions trim accessories and superset the rest', () => {
  const long = generateWorkout({ programKey: 'upper_lower', dayType: 'upper', location: YMCA, profile, exercises: EXERCISES, unit: 'lb' });
  const short = generateWorkout({ programKey: 'upper_lower', dayType: 'upper', location: YMCA, profile: { ...profile, sessionMin: 30 }, exercises: EXERCISES, unit: 'lb' });
  assert(short.exercises.length < long.exercises.length);
  assert(short.exercises.every((e) => e.role !== 'accessory' || e.superset));
});

test('smart mode picks the most recovered day', () => {
  const recovery = { chest: 10, front_delts: 10, side_delts: 10, triceps: 10, lats: 100, upper_back: 100, rear_delts: 100, biceps: 100, traps: 100, quads: 60, hamstrings: 60, glutes: 60, calves: 60 };
  eq(pickDayType('smart', { recovery, daysPerWeek: 6 }), 'pull');
  eq(pickDayType('ppl', { doneCount: 4 }), 'pull');
});

test('deload on the last week of the cycle', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  eq(deloadInfo({ started_at: '2026-01-01T00:00:00Z' }, 'intermediate', start + 10 * 86400000).deload, false);
  eq(deloadInfo({ started_at: '2026-01-01T00:00:00Z' }, 'intermediate', start + 30 * 86400000).deload, true); // week 5 of 5
  eq(deloadInfo({ started_at: '2026-01-01T00:00:00Z', deload_started_at: new Date(start + 9 * 86400000).toISOString() }, 'beginner', start + 10 * 86400000).deload, true);
});

test('boxing day uses shadowboxing when there is no heavy bag', () => {
  const w = generateWorkout({ programKey: 'boxing', dayType: 'boxing', location: HOME, profile, exercises: EXERCISES, unit: 'lb' });
  eq(w.exercises[0].exercise_id, 'shadowboxing');
  eq(w.exercises[0].target.sets, 6);
});

test('every program template generates at the YMCA', () => {
  for (const [key, p] of Object.entries(PROGRAMS)) {
    if (p.custom) continue;
    const days = p.days || ['full_a'];
    for (const d of days) {
      const w = generateWorkout({ programKey: key, dayType: d, location: YMCA, profile, exercises: EXERCISES, unit: 'lb' });
      assert(w.exercises.length >= 3, `${key}/${d}`);
    }
  }
});

// ---------- v0.2.1 regression tests (from review) ----------

/** Feed each target back in as the logged result for `n` sessions. Returns the targets in order. */
function simulate(ex, start, n, opts, { deloadAt = new Set() } = {}) {
  const hist = [start];
  const out = [];
  for (let i = 0; i < n; i++) {
    const deload = deloadAt.has(i);
    const t = nextTarget(ex, hist, { ...opts, deload });
    out.push(t);
    hist.unshift({ date: `s${i}`, deload, sets: Array.from({ length: t.sets }, () => ({ weight: t.weight, reps: t.reps, rir: 2 })) });
  }
  return out;
}

test('fix 3: stuck at 30 lb climbs reps → sets → tempo without looping (40 sessions)', () => {
  const row = byId('db_one_arm_row');
  const hi = row.reps[1];
  const ts = simulate(row, session(30, [hi, hi, hi]), 40, { inventory: HOME.weight_inventory, unit: 'lb', role: 'secondary' });
  assert(ts.every((t) => t.weight === 30), 'weight stays 30');
  for (let i = 1; i < ts.length; i++) {
    assert(ts[i].sets >= ts[i - 1].sets, `sets went down at session ${i}: ${ts[i - 1].sets} → ${ts[i].sets}`);
  }
  const firstFive = ts.findIndex((t) => t.sets === 5);
  const firstTempo = ts.findIndex((t) => t.mode === 'tempo');
  assert(firstFive > 0, 'reaches 5 sets');
  assert(firstTempo > firstFive, 'then tempo');
  assert(ts.slice(firstTempo).every((t) => t.mode === 'tempo' && t.sets === 5), 'tempo is terminal');
});

test('fix 1: deload at 30 lb (next owned is 5 lb) keeps 30 lb, halves sets, bottom of range', () => {
  const row = byId('db_one_arm_row');
  const t = nextTarget(row, [session(30, [10, 10, 10])], { inventory: HOME.weight_inventory, unit: 'lb', role: 'main', deload: true });
  eq(t.weight, 30);
  eq(t.sets, 2);
  eq(t.reps, row.reps[0]);
  assert(t.rir >= 3);
});

test('fix 1: two tough sessions at 30 lb keep 30 lb and reset to the bottom of the range', () => {
  const row = byId('db_one_arm_row');
  const lo = row.reps[0];
  const t = nextTarget(row, [session(30, [lo - 2, lo - 3, lo - 3]), session(30, [lo - 1, lo - 2, lo - 2])], { inventory: HOME.weight_inventory, unit: 'lb' });
  eq(t.mode, 'reset');
  eq(t.weight, 30);
  eq(t.reps, lo);
});

test('fix 1: gym deload still goes ~10% lighter when a close weight exists', () => {
  const row = byId('db_one_arm_row');
  eq(nextTarget(row, [session(50, [10, 10, 10])], { unit: 'lb', deload: true }).weight, 45);
});

test('fix 2: deload sessions are skipped by progression', () => {
  const h = [{ date: 'd', deload: true, sets: [{ weight: 180, reps: 5 }, { weight: 180, reps: 5 }] }, session(200, [6, 6, 5])];
  const t = nextTarget(bench, h, { unit: 'lb' });
  eq(t.weight, 200);
  eq(t.reps, 6);
});

test('fix 2: bench at 200 returns to 200 right after a deload week', () => {
  const ts = simulate(bench, session(200, [6, 6, 6]), 6, { unit: 'lb', role: 'main' }, { deloadAt: new Set([2]) });
  eq(ts[2].mode, 'deload');
  eq(ts[2].weight, 180);
  assert(ts[3].weight >= 200, `after deload: ${ts[3].weight}`);
});

test('fix 2: home deload at 30 lb never strands you at 5 lb', () => {
  const row = byId('db_one_arm_row');
  const ts = simulate(row, session(30, [10, 10, 10]), 12, { inventory: HOME.weight_inventory, unit: 'lb', role: 'main' }, { deloadAt: new Set([3, 8]) });
  assert(ts.every((t) => t.weight === 30), ts.map((t) => t.weight).join());
});

test('fix 2: stall detection ignores deload sessions', () => {
  const h = [session(135, [6, 6, 5]), { date: 'd', deload: true, sets: [{ weight: 120, reps: 5 }] }, session(135, [6, 6, 6]), session(135, [6, 5, 5])];
  assert(isStalled(h, 135));
});

test('weight jumps use estimated strength, small steps always allowed', () => {
  near(predictedReps(135, 10, 150), 6, 0);
  const custom = { dumbbells_kg: [20, 25].map((lb) => lb * 0.45359237) };
  const row = byId('db_one_arm_row');
  const hi = row.reps[1];
  eq(nextTarget(row, [session(20, [hi, hi, hi])], { inventory: custom, unit: 'lb' }).weight, 25); // +5 lb is a normal step
  const gap = { dumbbells_kg: [20, 40].map((lb) => lb * 0.45359237) };
  eq(nextTarget(row, [session(20, [hi, hi, hi])], { inventory: gap, unit: 'lb' }).weight, 20); // 20 → 40 too big
  eq(nextTarget(row, [session(20, [25, 25, 25])], { inventory: gap, unit: 'lb' }).weight, 20); // still too big at 20×25
});

test('fix 4: template pins respect injury tags and fall back to the slot pattern', () => {
  const w = generateWorkout({ programKey: 'five_by_five', dayType: 'sl5x5_b', location: YMCA, profile: { ...profile, injuries: 'left shoulder, no overhead pressing' }, exercises: EXERCISES, unit: 'lb' });
  assert(!w.exercises.some((e) => e.exercise_id === 'bb_overhead_press'), 'OHP removed');
  for (const it of w.exercises) assert(!(byId(it.exercise_id).avoid || []).includes('shoulder'), it.exercise_id);
  assert(w.exercises.some((e) => e.exercise_id === 'bb_back_squat'));
  assert(w.notes.some((n) => /Left out vertical push/.test(n)), 'explains the dropped slot');
  assert(!w.notes.some((n) => /doesn’t have much/.test(n)), 'no misleading equipment note');
});

test('fix 4: template pins respect the level cap', () => {
  const hard = EXERCISES.find((e) => (e.level || 1) === 3 && canDo(e, expandEquipment(YMCA_PRESET)));
  const day = { slots: [{ patterns: [hard.pattern], role: 'main', ids: [hard.id] }] };
  DAY_TYPES.__test = day;
  const w = generateWorkout({ programKey: 'smart', dayType: '__test', location: YMCA, profile: { ...profile, experience: 'beginner' }, exercises: EXERCISES, unit: 'lb' });
  delete DAY_TYPES.__test;
  assert(!w.exercises.some((e) => e.exercise_id === hard.id), `${hard.id} should be capped`);
});

test('fix 4: my own picks are kept, with a warning', () => {
  const program = { custom_days: [{ name: 'Mine', exercise_ids: ['bb_overhead_press', 'bb_back_squat'] }] };
  const w = generateWorkout({ programKey: 'custom', program, dayType: 'custom_0', location: YMCA, profile: { ...profile, injuries: 'shoulder' }, exercises: EXERCISES, unit: 'lb' });
  const ohp = w.exercises.find((e) => e.exercise_id === 'bb_overhead_press');
  assert(ohp, 'kept');
  assert(/shoulder/.test(ohp.warning), 'warned');
  eq(w.exercises.find((e) => e.exercise_id === 'bb_back_squat').warning, null);
});

// ---------- v0.3.0: tempo dead end ----------
test('tempo escape: 30 → 40 lb pair eventually jumps after two maxed tempo sessions', () => {
  const row = byId('db_one_arm_row');
  const hi = row.reps[1];
  const inv = { dumbbells_kg: [30, 40].map((lb) => lb * 0.45359237) };
  const ts = simulate(row, session(30, [hi, hi, hi]), 40, { inventory: inv, unit: 'lb', role: 'secondary' });
  const jump = ts.findIndex((t) => t.weight === 40);
  assert(jump > 0, 'reaches 40 lb');
  const tempoBefore = ts.slice(0, jump).filter((t) => t.mode === 'tempo').length;
  assert(tempoBefore >= 2, `at least 2 tempo sessions first (got ${tempoBefore})`);
  assert(ts[jump].reps >= 5 && ts[jump].reps <= row.reps[0], `first target at 40: ${ts[jump].reps}`);
  assert(ts.slice(jump).every((t) => t.weight === 40), 'stays at 40 (no drop back to 30)');
});

test('tempo escape never fires for 5 → 30 lb', () => {
  const lat = EXERCISES.find((e) => e.load === 'dumbbell' && e.pattern === 'lateral_raise');
  const hi = lat.reps[1];
  const ts = simulate(lat, session(5, [hi, hi, hi]), 60, { inventory: HOME.weight_inventory, unit: 'lb' });
  assert(ts.every((t) => t.weight === 5), ts.map((t) => t.weight).join());
});

test('preview edits: Replace forces a pick, Switch steers away from the current picks', () => {
  const base = generateWorkout({ programKey: 'smart', dayType: 'full_a', location: YMCA, profile, exercises: EXERCISES, unit: 'lb' });
  const ids = base.exercises.map((it) => it.exercise_id);
  const first = byId(ids[0]);
  const alt = EXERCISES.find((e) => e.pattern === first.pattern && e.id !== first.id && !ids.includes(e.id) && canDo(e, expandEquipment(YMCA.equipment)));
  const rep = generateWorkout({ programKey: 'smart', dayType: 'full_a', location: YMCA, profile, exercises: EXERCISES, unit: 'lb', forced: { [first.id]: alt.id } });
  eq(rep.exercises[0].exercise_id, alt.id, 'replaced in place');
  eq(rep.exercises.slice(1).map((it) => it.exercise_id).join(), ids.slice(1).join(), 'the rest unchanged');
  assert(rep.exercises[0].target.sets >= 1, 'replacement gets its own target');
  const sw = generateWorkout({ programKey: 'smart', dayType: 'full_a', location: YMCA, profile, exercises: EXERCISES, unit: 'lb', avoidIds: ids });
  const changed = sw.exercises.filter((it) => !ids.includes(it.exercise_id)).length;
  assert(changed >= Math.ceil(ids.length / 2), `switch changed only ${changed} of ${ids.length}`);
  eq(sw.exercises.length, base.exercises.length, 'same shape of workout');
});

test('preview edits: Switch at a bare location still fills every slot it can', () => {
  const none = { equipment: [], weight_inventory: {} };
  const base = generateWorkout({ programKey: 'smart', dayType: 'full_a', location: none, profile, exercises: EXERCISES, unit: 'lb' });
  const sw = generateWorkout({ programKey: 'smart', dayType: 'full_a', location: none, profile, exercises: EXERCISES, unit: 'lb', avoidIds: base.exercises.map((it) => it.exercise_id) });
  eq(sw.exercises.length, base.exercises.length);
});
