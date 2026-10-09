// Forge Score: 0–100 per day, shown as a 7-day average. Five pillars (Body, Recovery, Sleep, Training,
// Nutrition), each the weighted mean of its components; each component maps to 0–100 with a piecewise-linear
// function. Every mapping, weight and source is written down in docs/forge-score.md, and this file is the
// only place they live. A component or pillar with no data drops out and its weight is shared among the
// rest ("Nutrition: not tracked yet"). Pure functions; no DOM.
import { shiftDay, indexDays, mean, sd, clamp, GET, windowValues, tempDelta, zScore } from './metrics.js';
import { addDays, daysBetween, dayKey } from '../weight/smoothing.js';
import { e1rm } from '../workouts/progression.js';

export const MIN_PILLARS = 3; // no overall score until this many pillars have data (Body + Training alone isn't a picture of you)

export const PILLARS = {
  body: { label: 'Body', weight: 0.25 },
  recovery: { label: 'Recovery', weight: 0.2 },
  sleep: { label: 'Sleep', weight: 0.15 },
  training: { label: 'Training', weight: 0.25 },
  nutrition: { label: 'Nutrition', weight: 0.15 },
};

/** Piecewise-linear map. points: [[x, y], ...] sorted by x; flat beyond the ends. */
export function piecewise(points, x) {
  if (!Number.isFinite(x)) return null;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

// ---- every mapping (documented in docs/forge-score.md) ----
export const MAP = {
  // Body
  paceLose: [[-1, 0], [0, 40], [0.25, 85], [0.5, 100], [1, 100], [1.5, 50], [2, 0]], // x: % body weight LOST per week
  paceGain: [[-0.5, 0], [0, 40], [0.1, 85], [0.25, 100], [0.5, 100], [0.75, 50], [1, 0]], // x: % gained per week
  paceHold: [[0, 100], [0.25, 85], [0.5, 50], [1, 0]], // x: |% per week|
  paceRecomp: [[0, 100], [0.3, 85], [0.75, 40], [1.5, 0]],
  fatDown: [[-0.4, 100], [-0.2, 90], [0, 50], [0.2, 15], [0.4, 0]], // x: fat-mass change, kg/week (lose, recomp)
  fatHold: [[0, 100], [0.2, 70], [0.5, 20], [0.8, 0]], // x: |kg/week| (endurance, health)
  fatGain: [[-0.5, 100], [0.1, 100], [0.3, 60], [0.6, 0]], // x: kg/week (build muscle)
  lean: [[-0.5, 0], [-0.1, 100]], // x: lean-mass change kg/week; ≥ −0.1 = 100
  fmiMale: [[1.5, 40], [3, 100], [6, 100], [9, 50], [13, 0]], // x: fat mass index kg/m²
  fmiFemale: [[3, 40], [5, 100], [9, 100], [13, 50], [17, 0]],
  // Recovery (x: z-score, positive = better than your baseline)
  recoveryZ: [[-2, 0], [0, 75], [1, 100]], // at your usual = 75; room to improve up to +1 SD
  tempDelta: [[0.5, 100], [1, 0]], // x: |wrist temperature delta| °C
  // Sleep
  sleepDuration: [[240, 0], [360, 55], [420, 100]], // x: minutes asleep (7-day mean)
  sleepRegularity: [[30, 100], [90, 0]], // x: SD of sleep midpoint, minutes
  deepRemShare: [[0.2, 0], [0.35, 100]],
  // Training
  planned: [[0, 0], [1, 100]], // x: sessions done ÷ sessions planned (7 days)
  exerciseMin: [[0, 0], [150, 100]], // x: minutes in 7 days (WHO 2020: 150–300 a week)
  steps: [[2000, 0], [8000, 100]], // x: average steps a day
  acwr: [[0, 0], [0.4, 20], [0.8, 100], [1.3, 100], [1.6, 50], [2, 0]], // x: acute ÷ chronic weekly sets
  strength: [[-1.5, 0], [0, 60], [0.5, 100]], // x: e1RM change, % a week, main lifts
  // Nutrition
  logged: [[0, 0], [7, 100]], // x: days logged out of 7
  kcalOff: [[0.1, 100], [0.3, 0]], // x: |eaten ÷ target − 1| on a logged day; within ±10% = 100
  proteinRatio: [[0.5, 0], [1, 100]], // x: protein ÷ target on a logged day; at or over target = 100
};

// Components: weight inside the pillar. Equal unless noted (brief B.9).
export const COMPONENTS = {
  body: [['pace', 'Weight pace', 1], ['fat', 'Fat-mass trend', 1], ['lean', 'Lean mass kept', 1], ['fmi', 'Fat mass index', 1]],
  recovery: [['hrv', 'HRV', 1], ['rhr', 'Resting heart rate', 1], ['temp', 'Wrist temperature', 1], ['resp', 'Breathing rate', 1]],
  sleep: [['duration', 'Time asleep', 0.4], ['regularity', 'Regular bedtime', 0.4], ['stages', 'Deep + REM share', 0.2]],
  training: [['planned', 'Workouts done', 1], ['activity', 'Activity', 1], ['balance', 'Training balance', 1], ['strength', 'Strength trend', 1]],
  nutrition: [['logging', 'Days logged', 1], ['calories', 'Calories near target', 1], ['protein', 'Protein', 1]],
};

// Nutrition lights up only after this many logged days in the 7 ending on the day scored (docs/forge-score.md).
export const MIN_FOOD_DAYS = 3;
export const LABEL = Object.fromEntries(Object.entries(COMPONENTS).flatMap(([p, cs]) => cs.map(([k, l]) => [`${p}.${k}`, l])));

const out = (value, raw, extra = {}) => (value == null ? null : { value: Math.round(clamp(value, 0, 100) * 10) / 10, raw, ...extra });
const fmtH = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

/** Least-squares slope of y over x. */
export function slope(points) {
  if (points.length < 2) return null;
  const mx = mean(points.map((p) => p[0]));
  const my = mean(points.map((p) => p[1]));
  let num = 0;
  let den = 0;
  for (const [x, y] of points) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den ? num / den : null;
}

/** Theil–Sen slope: the median of all pairwise slopes (robust to a bad reading). */
export function theilSen(points) {
  const s = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) if (points[j][0] !== points[i][0]) s.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]));
  }
  if (!s.length) return null;
  s.sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---- Body ----
function bodyComponents(D, ctx) {
  const { series, measures, profile } = ctx;
  const res = {};
  const from = addDays(D, -27);
  const pts = series.filter((p) => p.day >= from && p.day <= D && Number.isFinite(p.trend)).map((p) => [daysBetween(from, p.day), p.trend]);
  const span = pts.length ? pts[pts.length - 1][0] - pts[0][0] : 0;
  const goal = profile.goal || 'health';
  if (pts.length >= 4 && span >= 14) {
    const perWeek = slope(pts) * 7;
    const pct = (perWeek / mean(pts.map((p) => p[1]))) * 100;
    const m = goal === 'lose' ? MAP.paceLose : goal === 'muscle' ? MAP.paceGain : goal === 'recomp' ? MAP.paceRecomp : MAP.paceHold;
    const x = goal === 'lose' ? -pct : goal === 'muscle' ? pct : Math.abs(pct);
    res.pace = out(piecewise(m, x), `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}% of body weight a week (28-day trend)`);
  }
  const fatPts = [];
  const leanPts = [];
  for (const b of measures) {
    if (!b.day || b.day < from || b.day > D || !b.metrics) continue;
    const x = daysBetween(from, b.day);
    if (Number.isFinite(b.metrics.fat_mass_kg)) fatPts.push([x, b.metrics.fat_mass_kg]);
    const lean = Number.isFinite(b.metrics.fat_free_mass_kg) ? b.metrics.fat_free_mass_kg : b.metrics.muscle_mass_kg;
    if (Number.isFinite(lean)) leanPts.push([x, lean]);
  }
  const enough = (p) => p.length >= 4 && Math.max(...p.map((q) => q[0])) - Math.min(...p.map((q) => q[0])) >= 14;
  if (enough(fatPts)) {
    const w = theilSen(fatPts) * 7;
    const m = goal === 'lose' || goal === 'recomp' ? MAP.fatDown : goal === 'muscle' ? MAP.fatGain : MAP.fatHold;
    res.fat = out(piecewise(m, m === MAP.fatHold ? Math.abs(w) : w), `Fat mass ${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(2)} kg a week`);
  }
  if (enough(leanPts)) {
    const w = theilSen(leanPts) * 7;
    res.lean = out(piecewise(MAP.lean, w), `Lean mass ${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(2)} kg a week`);
  }
  const latestFat = [...measures].filter((b) => b.day && b.day <= D && b.metrics && Number.isFinite(b.metrics.fat_mass_kg)).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const h = profile.heightCm ? profile.heightCm / 100 : null;
  if (latestFat && h && (profile.sex === 'male' || profile.sex === 'female') && daysBetween(latestFat.day, D) <= 21) {
    const fmi = latestFat.metrics.fat_mass_kg / (h * h);
    res.fmi = out(piecewise(profile.sex === 'male' ? MAP.fmiMale : MAP.fmiFemale, fmi), `Fat mass index ${fmi.toFixed(1)} kg/m²`);
  }
  return res;
}

// ---- Recovery ----
function recoveryComponents(D, ctx) {
  const days = ctx.days;
  const res = {};
  const recent = (get) => windowValues(days, shiftDay(D, -6), D, get);
  const base = (get) => windowValues(days, shiftDay(D, -34), shiftDay(D, -7), get);
  const zOf = (get, tf, floor, sign) => {
    const r = recent(get).map(tf);
    const b = base(get).map(tf);
    if (r.length < 3 || b.length < 10) return null;
    const s = zScore(mean(r), b, floor);
    return { z: sign * s.z, mean7: mean(r), base: s.mean };
  };
  const hrv = zOf(GET.hrv, Math.log, 0.06, 1);
  if (hrv) res.hrv = out(piecewise(MAP.recoveryZ, hrv.z), `7-day HRV ${Math.round(Math.exp(hrv.mean7))} ms vs ${Math.round(Math.exp(hrv.base))} ms usual`);
  const rhr = zOf(GET.rhr, (x) => x, 1.5, -1);
  if (rhr) res.rhr = out(piecewise(MAP.recoveryZ, rhr.z), `7-day resting heart rate ${Math.round(rhr.mean7)} bpm vs ${Math.round(rhr.base)} bpm usual`);
  const temps = [];
  for (let d = shiftDay(D, -6); d <= D; d = shiftDay(d, 1)) { const t = tempDelta(days, d); if (t != null) temps.push(Math.abs(t)); }
  if (temps.length >= 3) res.temp = out(piecewise(MAP.tempDelta, mean(temps)), `Wrist temperature ${mean(temps).toFixed(1)}° from your normal on average`);
  const resp = zOf(GET.resp, (x) => x, 0.6, -1);
  if (resp) res.resp = out(piecewise(MAP.recoveryZ, resp.z), `7-day breathing rate ${resp.mean7.toFixed(1)} vs ${resp.base.toFixed(1)} usual`);
  return res;
}

// ---- Sleep ----
const midpoint = (s) => {
  if (!s || !s.in_bed_start || !s.in_bed_end) return null;
  const a = Date.parse(s.in_bed_start);
  const b = Date.parse(s.in_bed_end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (a + b) / 2 / 60000; // minutes since epoch
};

function sleepComponents(D, ctx) {
  const days = ctx.days;
  const res = {};
  const rows = [];
  for (let d = shiftDay(D, -6); d <= D; d = shiftDay(d, 1)) if (days.get(d) && days.get(d).sleep && GET.sleep(days.get(d)) != null) rows.push(days.get(d).sleep);
  if (rows.length >= 3) {
    const m = mean(rows.map((s) => s.asleep_min));
    res.duration = out(piecewise(MAP.sleepDuration, m), `Average ${fmtH(m)} asleep (7 nights)`);
    const mids = rows.map(midpoint).filter((x) => x != null);
    if (mids.length >= 4) {
      // Compare clock times, not dates: fold each midpoint onto the same day, around the first one.
      const clock = mids.map((x) => { let t = ((x % 1440) + 1440) % 1440; const ref = ((mids[0] % 1440) + 1440) % 1440; if (t - ref > 720) t -= 1440; if (ref - t > 720) t += 1440; return t; });
      const spread = sd(clock);
      res.regularity = out(piecewise(MAP.sleepRegularity, spread), `Bedtime middle varies by ±${Math.round(spread)} min`);
    }
    const staged = rows.filter((s) => Number.isFinite(s.deep_min) && Number.isFinite(s.rem_min) && s.asleep_min > 0);
    if (staged.length >= 3) {
      const share = mean(staged.map((s) => (s.deep_min + s.rem_min) / s.asleep_min));
      res.stages = out(piecewise(MAP.deepRemShare, share), `Deep + REM is ${Math.round(share * 100)}% of your sleep`);
    }
  }
  return res;
}

// ---- Training ----
const finishedWorkouts = (ws) => (ws || []).filter((w) => !w.deleted && w.status === 'done');
const liveCardio = (cs) => (cs || []).filter((c) => !c.deleted);
const hardSets = (w) => (w.exercises || []).reduce((n, ex) => n + (ex.sets || []).filter((s) => s.done && !s.warmup).length, 0);

function trainingComponents(D, ctx) {
  const { profile } = ctx;
  const res = {};
  const hasHistory = ctx.workouts.length || ctx.cardio.length;
  if (!hasHistory) return res;
  const from7 = addDays(D, -6);
  const inRange = (day, a, b) => day >= a && day <= b;
  const wDay = (w) => dayKey(w.started_at);
  const sessions = new Set();
  ctx.done.forEach((w) => { if (inRange(wDay(w), from7, D)) sessions.add(wDay(w)); });
  ctx.cardio.forEach((c) => { const d = c.day || dayKey(c.started_at); if (inRange(d, from7, D)) sessions.add(d); });
  const planned = profile.trainingDays || 3;
  res.planned = out(piecewise(MAP.planned, Math.min(1, sessions.size / planned)) , `${sessions.size} of ${planned} planned workout days (last 7 days)`);

  // Activity: exercise minutes (Apple Health, else what you logged) and steps.
  let minutes = windowValues(ctx.days, from7, D, GET.exercise);
  let mins = minutes.length ? minutes.reduce((a, b) => a + b, 0) : null;
  if (mins == null) {
    mins = 0;
    ctx.done.forEach((w) => { if (inRange(wDay(w), from7, D) && w.finished_at) mins += Math.max(0, (Date.parse(w.finished_at) - Date.parse(w.started_at)) / 60000); });
    ctx.cardio.forEach((c) => { const d = c.day || dayKey(c.started_at); if (inRange(d, from7, D)) mins += c.duration_min || 0; });
  }
  const steps = windowValues(ctx.days, from7, D, GET.steps);
  const parts = [piecewise(MAP.exerciseMin, mins)];
  let rawA = `${Math.round(mins)} active minutes in 7 days (goal 150)`;
  if (steps.length >= 3) { parts.push(piecewise(MAP.steps, mean(steps))); rawA += ` · ${Math.round(mean(steps)).toLocaleString()} steps a day`; }
  res.activity = out(mean(parts), rawA);

  // Balance: this week's hard sets against your usual week (the last 28 days).
  const setsIn = (a, b) => ctx.done.filter((w) => inRange(wDay(w), a, b)).reduce((n, w) => n + hardSets(w), 0);
  const first = ctx.done.length ? wDay(ctx.done[ctx.done.length - 1]) : null;
  if (first && daysBetween(first, D) >= 21) {
    const chronic = setsIn(addDays(D, -27), D) / 4;
    const acute = setsIn(from7, D);
    if (chronic >= 3) res.balance = out(piecewise(MAP.acwr, acute / chronic), `${acute} hard sets this week vs ${Math.round(chronic)} in your usual week`);
  }

  // Strength: e1RM trend on main lifts over 8 weeks.
  const byLift = new Map();
  const from56 = addDays(D, -55);
  for (const w of ctx.done) {
    const d = wDay(w);
    if (!inRange(d, from56, D)) continue;
    for (const ex of w.exercises || []) {
      if (ex.role !== 'main') continue;
      const best = Math.max(0, ...(ex.sets || []).filter((s) => s.done && !s.warmup).map((s) => e1rm(s.weight_kg, s.reps) || 0));
      if (best > 0) byLift.set(ex.exercise_id, [...(byLift.get(ex.exercise_id) || []), [daysBetween(from56, d), best]]);
    }
  }
  const trends = [];
  for (const pts of byLift.values()) {
    if (pts.length < 3 || pts[pts.length - 1][0] - pts[0][0] < 14) continue;
    const per = (slope(pts) * 7) / mean(pts.map((p) => p[1])) * 100;
    trends.push(per);
  }
  if (trends.length) {
    const t = mean(trends);
    res.strength = out(piecewise(MAP.strength, t), `Main lifts ${t >= 0 ? '+' : '−'}${Math.abs(t).toFixed(1)}% a week (estimated 1-rep max)`);
  }
  return res;
}

// ---- Nutrition ----
// ctx.food: Map(day → { kcal, protein_g }) of days with something logged; ctx.targets: { calories, proteinG } or null.
function nutritionComponents(D, ctx) {
  const res = {};
  const logged = [];
  for (let i = 0; i < 7; i++) { const f = ctx.food.get(shiftDay(D, -i)); if (f) logged.push(f); }
  if (logged.length < MIN_FOOD_DAYS) return res;
  res.logging = out(piecewise(MAP.logged, logged.length), `${logged.length} of 7 days logged`);
  const t = ctx.targets;
  if (t && t.calories > 0) {
    res.calories = out(mean(logged.map((f) => piecewise(MAP.kcalOff, Math.abs(f.kcal / t.calories - 1)))),
      `${logged.filter((f) => Math.abs(f.kcal / t.calories - 1) <= 0.1).length} of ${logged.length} logged days within 10% of ${t.calories.toLocaleString()} kcal`);
  }
  if (t && t.proteinG > 0) {
    res.protein = out(mean(logged.map((f) => piecewise(MAP.proteinRatio, f.protein_g / t.proteinG))),
      `${logged.filter((f) => f.protein_g >= t.proteinG).length} of ${logged.length} logged days at ${t.proteinG} g or more`);
  }
  return res;
}

/** Food log entries → Map(day → { kcal, protein_g }), only days with calories logged. */
export function foodDays(logs = []) {
  const m = new Map();
  for (const l of logs) {
    if (!l || l.deleted || !/^\d{4}-\d{2}-\d{2}$/.test(l.day || '')) continue;
    const s = Number.isFinite(l.servings) && l.servings > 0 ? l.servings : 1;
    const cur = m.get(l.day) || { kcal: 0, protein_g: 0 };
    cur.kcal += (Number(l.kcal) || 0) * s;
    cur.protein_g += (Number(l.protein_g) || 0) * s;
    m.set(l.day, cur);
  }
  for (const [d, v] of m) if (!(v.kcal > 0)) m.delete(d);
  return m;
}

/** All components for one day: { 'body.pace': { value, raw }, ... } */
export function componentsFor(D, ctx) {
  const c = { body: bodyComponents(D, ctx), recovery: recoveryComponents(D, ctx), sleep: sleepComponents(D, ctx), training: trainingComponents(D, ctx), nutrition: nutritionComponents(D, ctx) };
  return c;
}

/** Pillar scores (0–100 or null) and the day score from one day's components. */
export function scoreDay(comps, weights = {}) {
  const pillars = {};
  for (const [p, defs] of Object.entries(COMPONENTS)) {
    let sum = 0;
    let w = 0;
    for (const [k, , cw] of defs) { const c = comps[p] && comps[p][k]; if (c) { sum += c.value * cw; w += cw; } }
    pillars[p] = w ? sum / w : null;
  }
  let sum = 0;
  let w = 0;
  for (const [p, v] of Object.entries(pillars)) { if (v == null) continue; const pw = weights[p] ?? PILLARS[p].weight; sum += v * pw; w += pw; }
  return { score: w ? sum / w : null, pillars };
}

/**
 * Day scores for chosen days (long-term view): [{ day, score, pillars: { body, recovery, ... } }] in the order given.
 * A day only gets a score when at least MIN_PILLARS pillars have data that day. Same inputs as forgeScore.
 */
export function scoreSamples({ rows = [], series = [], measures = [], workouts = [], cardio = [], profile = {}, days = [] }) {
  const done = finishedWorkouts(workouts).sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  const ctx = { days: indexDays(rows), series, measures, workouts, cardio: liveCardio(cardio), profile, done };
  return days.map((day) => {
    const { score, pillars } = scoreDay(componentsFor(day, ctx));
    const n = Object.values(pillars).filter((v) => v != null).length;
    return { day, score: n >= MIN_PILLARS ? score : null, pillars };
  });
}

/**
 * Forge Score for `today`. ctx: { rows (health_daily), series (weight trend [{day,trend}]), measures (body_measures),
 * workouts, cardio, profile, foodLogs, targets ({ calories, proteinG }) }. Returns
 *   { score (7-day average), days: [{day, score}], pillars: [{key,label,weight,effective,score,tracked,components:[...]}],
 *     movers: top 3 component changes vs the 7 days before, notTracked: ['nutrition'] }
 */
export function forgeScore({ rows = [], series = [], measures = [], workouts = [], cardio = [], profile = {}, foodLogs = [], targets = null, today }) {
  const done = finishedWorkouts(workouts).sort((a, b) => (a.started_at < b.started_at ? 1 : -1)); // newest first
  const ctx = { days: indexDays(rows), series, measures, workouts, cardio: liveCardio(cardio), profile, done, food: foodDays(foodLogs), targets };
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const D = shiftDay(today, -i);
    const comps = componentsFor(D, ctx);
    daily.push({ day: D, comps, ...scoreDay(comps) });
  }
  const mine = daily.slice(7);
  const prev = daily.slice(0, 7);
  const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? mean(v) : null; };

  const meanComp = (set, p, k) => avg(set.map((d) => d.comps[p] && d.comps[p][k] && d.comps[p][k].value));
  const latestComp = (p, k) => { for (let i = mine.length - 1; i >= 0; i--) { const c = mine[i].comps[p] && mine[i].comps[p][k]; if (c) return c; } return null; };
  const tracked = Object.keys(PILLARS).filter((p) => avg(mine.map((d) => d.pillars[p])) != null);
  const wsum = tracked.reduce((a, p) => a + PILLARS[p].weight, 0);
  const score = tracked.length >= MIN_PILLARS ? avg(mine.map((d) => d.score)) : null;
  const pillars = Object.entries(PILLARS).map(([key, def]) => {
    const isTracked = tracked.includes(key);
    return {
      key, label: def.label, weight: def.weight, tracked: isTracked, effective: isTracked ? def.weight / wsum : 0,
      score: avg(mine.map((d) => d.pillars[key])),
      components: COMPONENTS[key].map(([k, label, cw]) => ({ key: k, label, weight: cw, value: meanComp(mine, key, k), raw: latestComp(key, k)?.raw || null })),
    };
  });

  const movers = [];
  for (const p of pillars) {
    if (!p.tracked) continue;
    const wInPillar = p.components.filter((c) => c.value != null).reduce((a, c) => a + c.weight, 0) || 1;
    for (const c of p.components) {
      const before = meanComp(prev, p.key, c.key);
      if (c.value == null || before == null) continue;
      const delta = c.value - before;
      movers.push({ pillar: p.key, key: c.key, label: c.label, delta, impact: (delta * c.weight / wInPillar) * p.effective, now: c.value, before, raw: c.raw });
    }
  }
  movers.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  return { score, trackedCount: tracked.length, minPillars: MIN_PILLARS, days: daily.map((d) => ({ day: d.day, score: tracked.length >= MIN_PILLARS ? d.score : null })), pillars, movers: movers.filter((m) => Math.abs(m.delta) >= 1).slice(0, 3), notTracked: Object.keys(PILLARS).filter((p) => !tracked.includes(p)) };
}
