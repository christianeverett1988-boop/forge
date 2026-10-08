// XP, levels, weekly streaks and badges. Everything is derived from your workout history (and cardio log),
// so nothing new is stored and it can always be recomputed. Pure functions; see docs/levels.md.

// ---------- XP ----------
export const XP = { set: 10, exercise: 25, workout: 100, pr: 50 };

/** XP for one finished workout: +10 per working set, +25 per exercise with a working set, +100, +50 per PR. */
export function workoutXP(w) {
  let sets = 0;
  let exercises = 0;
  for (const it of w.exercises || []) {
    const n = (it.sets || []).filter((s) => s.done && !s.warmup).length;
    sets += n;
    if (n) exercises++;
  }
  if (!sets) return { sets: 0, exercises: 0, workout: 0, prs: 0, total: 0 };
  const prs = (w.prs || []).length;
  const parts = { sets: sets * XP.set, exercises: exercises * XP.exercise, workout: XP.workout, prs: prs * XP.pr };
  return { ...parts, total: parts.sets + parts.exercises + parts.workout + parts.prs };
}

const finished = (workouts) => workouts
  .filter((w) => w.status === 'done' && !w.deleted)
  .sort((a, b) => (a.started_at < b.started_at ? -1 : 1));

export const totalXP = (workouts) => finished(workouts).reduce((n, w) => n + workoutXP(w).total, 0);

// ---------- levels ----------
export const LEVELS = [
  'Spark', 'Kindling', 'Ember', 'Coal Bed', 'Bellows', 'Raw Ore', 'Smelter', 'Pig Iron', 'Cast Iron', 'Wrought Iron',
  'Hammer Strike', 'Anvil', 'Red Heat', 'White Heat', 'Quench', 'Tempered', 'Carbon Steel', 'Spring Steel', 'Damascus', 'Blade Smith',
  'Forge Master', 'Ironclad', 'Titanium', 'Tungsten', 'Meteorite', 'Molten Core', 'Star Forge', 'Supernova', 'Adamant', 'Unbreakable',
];

/**
 * XP needed to reach a level (level 1 = 0). Grows a little faster than linearly: a typical workout is
 * ~400 XP, so level 2 comes after the first workout, level 10 after ~2 months at 3 a week, and
 * Unbreakable after roughly two years of steady training.
 */
export const xpForLevel = (level) => (level <= 1 ? 0 : Math.round(300 * Math.pow(level - 1, 1.75)));

export function levelFor(xp) {
  let level = 1;
  while (level < LEVELS.length && xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const next = level < LEVELS.length ? xpForLevel(level + 1) : null;
  return {
    level,
    name: LEVELS[level - 1],
    xp,
    floor,
    next,
    nextName: next != null ? LEVELS[level] : null,
    progress: next != null ? (xp - floor) / (next - floor) : 1,
  };
}

// ---------- weeks ----------
const pad = (n) => String(n).padStart(2, '0');
/** Local date key YYYY-MM-DD. */
export const dateKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Monday (local) of the week containing a date, as YYYY-MM-DD. */
export function weekOf(iso) {
  const d = new Date(iso);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d.toISOString());
}
const addWeeks = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n * 7, 12);
  return dateKey(dt.toISOString());
};

/** Distinct training days per week (finished workouts and logged cardio both count). */
export function daysPerWeek(workouts, cardio = []) {
  const weeks = new Map();
  const add = (iso) => {
    const w = weekOf(iso);
    if (!weeks.has(w)) weeks.set(w, new Set());
    weeks.get(w).add(dateKey(iso));
  };
  finished(workouts).forEach((w) => add(w.started_at));
  cardio.filter((c) => !c.deleted && c.started_at).forEach((c) => add(c.started_at));
  return new Map([...weeks].map(([k, v]) => [k, v.size]));
}

/**
 * Weekly streak: consecutive weeks where you trained on at least `goal` days (your planned days a week).
 * One missed week per calendar month is covered by a freeze, used automatically. The current week never
 * breaks the streak while it's still in progress.
 * Returns { current, best, goal, thisWeek, frozen: [week keys], freezeLeft }.
 */
export function streak(workouts, cardio, goal, now = Date.now()) {
  const counts = daysPerWeek(workouts, cardio);
  const thisWeek = weekOf(new Date(now).toISOString());
  const weeks = [...counts.keys()].sort();
  const result = { current: 0, best: 0, goal, thisWeek: { done: counts.get(thisWeek) || 0, goal }, frozen: [], freezeLeft: true };
  if (!weeks.length) return result;
  const usedFreeze = new Set(); // 'YYYY-MM' of the months whose freeze is spent
  let run = 0;
  let best = 0;
  const frozen = [];
  for (let wk = weeks[0]; wk <= thisWeek; wk = addWeeks(wk, 1)) {
    const hit = (counts.get(wk) || 0) >= goal;
    const month = wk.slice(0, 7);
    if (hit) {
      run++;
    } else if (wk === thisWeek) {
      // still in progress: neither extends nor breaks the run
    } else if (run > 0 && !usedFreeze.has(month)) {
      usedFreeze.add(month);
      frozen.push(wk);
    } else {
      run = 0;
    }
    best = Math.max(best, run);
  }
  result.current = run;
  result.best = best;
  result.frozen = frozen;
  result.freezeLeft = !usedFreeze.has(thisWeek.slice(0, 7));
  return result;
}

// ---------- badges ----------
// Each badge: id, name, how you earn it, and a test over the running totals after each workout.
export const BADGES = [
  { id: 'first', name: 'First Spark', how: 'Finish your first workout', test: (t) => t.workouts >= 1 },
  { id: 'w10', name: 'Ten Strikes', how: 'Finish 10 workouts', test: (t) => t.workouts >= 10 },
  { id: 'w50', name: 'Fifty Heats', how: 'Finish 50 workouts', test: (t) => t.workouts >= 50 },
  { id: 'w100', name: 'Centurion', how: 'Finish 100 workouts', test: (t) => t.workouts >= 100 },
  { id: 'w250', name: 'Forged in Fire', how: 'Finish 250 workouts', test: (t) => t.workouts >= 250 },
  { id: 'pr1', name: 'New Metal', how: 'Set your first PR', test: (t) => t.prs >= 1 },
  { id: 'pr10', name: 'Record Breaker', how: 'Set 10 PRs', test: (t) => t.prs >= 10 },
  { id: 'pr50', name: 'Hall of Records', how: 'Set 50 PRs', test: (t) => t.prs >= 50 },
  { id: 'pr3', name: 'Triple Strike', how: 'Set 3 PRs in one workout', test: (t) => t.maxPrsInWorkout >= 3 },
  { id: 'vol1', name: 'Ten Tons', how: 'Lift 10 tonnes (22,000 lb) in total', test: (t) => t.volumeKg >= 10000 },
  { id: 'vol2', name: 'Hundred Tons', how: 'Lift 100 tonnes in total', test: (t) => t.volumeKg >= 100000 },
  { id: 'vol3', name: 'Mountain Mover', how: 'Lift 1,000 tonnes in total', test: (t) => t.volumeKg >= 1000000 },
  { id: 'big', name: 'Heavy Day', how: 'Lift 10 tonnes in one workout', test: (t) => t.maxVolumeKg >= 10000 },
  { id: 'st4', name: 'Hot Streak', how: 'Hit your planned days 4 weeks running', test: (t) => t.bestStreak >= 4 },
  { id: 'st12', name: 'Heat Treated', how: 'Hit your planned days 12 weeks running', test: (t) => t.bestStreak >= 12 },
  { id: 'st26', name: 'Half-Year Forge', how: 'Hit your planned days 26 weeks running', test: (t) => t.bestStreak >= 26 },
  { id: 'dawn', name: 'Dawn Patrol', how: 'Start 5 workouts before 7 am', test: (t) => t.early >= 5 },
  { id: 'night', name: 'Night Shift', how: 'Start 5 workouts after 8 pm', test: (t) => t.late >= 5 },
  { id: 'lv11', name: 'Into the Forge', how: 'Reach level 11 (Hammer Strike)', test: (t) => t.level >= 11 },
];

/**
 * Badges with the date each was earned (null if not yet). Walks the history in order so each badge gets
 * the workout that unlocked it. Volume counts weighted working sets in kg.
 */
export function badges(workouts, cardio = [], goal = 3) {
  const list = finished(workouts);
  const t = { workouts: 0, prs: 0, maxPrsInWorkout: 0, volumeKg: 0, maxVolumeKg: 0, bestStreak: 0, early: 0, late: 0, level: 1, xp: 0 };
  const earned = {};
  const upTo = [];
  for (const w of list) {
    upTo.push(w);
    const x = workoutXP(w);
    if (!x.total) continue;
    t.workouts++;
    const prs = (w.prs || []).length;
    t.prs += prs;
    t.maxPrsInWorkout = Math.max(t.maxPrsInWorkout, prs);
    let vol = 0;
    for (const it of w.exercises || []) for (const s of it.sets || []) if (s.done && !s.warmup && s.weight_kg && s.reps) vol += s.weight_kg * s.reps;
    t.volumeKg += vol;
    t.maxVolumeKg = Math.max(t.maxVolumeKg, vol);
    const h = new Date(w.started_at).getHours();
    if (h < 7) t.early++;
    if (h >= 20) t.late++;
    t.xp += x.total;
    t.level = levelFor(t.xp).level;
    t.bestStreak = streak(upTo, cardio.filter((c) => c.started_at <= (w.finished_at || w.started_at)), goal, Date.parse(w.finished_at || w.started_at)).best;
    for (const b of BADGES) if (!earned[b.id] && b.test(t)) earned[b.id] = { at: w.finished_at || w.started_at, workoutId: w.id };
  }
  return BADGES.map((b) => ({ id: b.id, name: b.name, how: b.how, earned: earned[b.id] || null }));
}

/** Everything the summary screen needs about one workout: XP, level before/after, new badges, streak. */
export function workoutAwards(workouts, cardio, goal, workoutId, now = Date.now()) {
  const list = finished(workouts);
  const idx = list.findIndex((w) => w.id === workoutId);
  if (idx < 0) return null;
  const w = list[idx];
  const xp = workoutXP(w);
  const before = list.slice(0, idx).reduce((n, x) => n + workoutXP(x).total, 0);
  const lvBefore = levelFor(before);
  const lvAfter = levelFor(before + xp.total);
  const all = badges(list.slice(0, idx + 1), cardio, goal);
  const fresh = all.filter((b) => b.earned && b.earned.workoutId === workoutId);
  return { xp, before: lvBefore, after: lvAfter, levelUp: lvAfter.level > lvBefore.level, badges: fresh, streak: streak(list, cardio, goal, now) };
}
