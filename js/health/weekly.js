// Weekly report (W2b): one Monday–Sunday week (your local calendar) worked out on the phone from data
// already in Firestore. Nothing is stored. Pure functions, no DOM; rules are written down in docs/trends.md.
import { shiftDay, indexDays, mean, sd, GET, windowValues } from './metrics.js';
import { forgeScore } from './score.js';
import { goodDirection, buildSeries, TREND_METRICS } from './trends.js';
import { dayKey } from '../weight/smoothing.js';
import { MAX_LOSS_PCT } from '../nutrition/targets.js';

export const SUGGEST = { sleepMin: 420, stepsMin: 6000, hrvDropPct: 10, rhrUpBpm: 3, minWeighIns: 3 };
const NOTABLE_Z = 0.25; // a change smaller than this many "usual day-to-day swings" is not worth naming

// ---- week boundaries (all on date keys, so a daylight-saving change can't move a day) ----

/** 0 = Sunday … 6 = Saturday, for a 'YYYY-MM-DD' key. */
export const weekday = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();
/** The Monday on or before a day. */
export const mondayOf = (key) => shiftDay(key, -((weekday(key) + 6) % 7));
export const weekDays = (monday) => Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
export const shiftWeek = (monday, n) => shiftDay(monday, n * 7);

/** The week the report is about: this week on a Sunday (it is wrapping up), otherwise the last full week. */
export const reportWeekFor = (today) => (weekday(today) === 0 ? mondayOf(today) : shiftWeek(mondayOf(today), -1));
/** Today card shows on Sunday and Monday. */
export const showReportCard = (today) => weekday(today) === 0 || weekday(today) === 1;

const finishedWorkouts = (ws) => ws.filter((w) => !w.deleted && w.status === 'done' && w.started_at && (w.exercises || []).some((it) => (it.sets || []).some((s) => s.done && !s.warmup)));
const workingSets = (w) => (w.exercises || []).flatMap((it) => (it.sets || []).filter((s) => s.done && !s.warmup));

function trainingFor(days, { workouts, cardio, profile }) {
  const set = new Set(days);
  const ws = finishedWorkouts(workouts).filter((w) => set.has(dayKey(w.started_at)));
  const volumeKg = ws.reduce((a, w) => a + workingSets(w).reduce((b, s) => b + (s.weight_kg && s.reps ? s.weight_kg * s.reps : 0), 0), 0);
  const cardioMin = (cardio || []).filter((c) => !c.deleted && c.started_at && set.has(dayKey(c.started_at))).reduce((a, c) => a + (Number(c.duration_min) || 0), 0);
  return { workouts: ws.length, planned: (profile && profile.trainingDays) || 3, volumeKg, prs: ws.reduce((a, w) => a + (w.prs || []).length, 0), cardioMin };
}

const trendAt = (series, day) => { let p = null; for (const q of series) if (q.day <= day) p = q; return p; };
const avgOf = (days, rowsByDay, get) => { const v = windowValues(rowsByDay, days[0], days[6], get); return { value: v.length ? mean(v) : null, n: v.length }; };
const delta = (a, b) => (a != null && b != null ? a - b : null);

/**
 * ctx: { weekStart (a Monday), today, series (weight [{day,kg,trend}]), measures (body_measures), rows (health_daily),
 * workouts, cardio, profile }. Returns the report object (see docs/trends.md).
 */
export function weeklyReport(ctx) {
  const { weekStart, today, series = [], measures = [], rows = [], workouts = [], cardio = [], profile = {} } = ctx;
  const days = weekDays(weekStart);
  const prevDays = weekDays(shiftWeek(weekStart, -1));
  const end = days[6];
  const prevEnd = prevDays[6];
  const byDay = indexDays(rows);
  const goal = profile.goal || 'health';

  // Forge Score, this week vs last
  const sc = (t) => forgeScore({ rows, series, measures, workouts, cardio, profile, today: t });
  const sNow = sc(end);
  const sPrev = sc(prevEnd);
  const score = {
    now: sNow.score, before: sPrev.score, delta: delta(sNow.score, sPrev.score),
    pillars: sNow.pillars.filter((p) => p.tracked).map((p) => {
      const before = sPrev.pillars.find((q) => q.key === p.key);
      return { key: p.key, label: p.label, now: p.score, before: before ? before.score : null, delta: delta(p.score, before ? before.score : null) };
    }),
  };

  // Weight trend and body composition
  const wNow = trendAt(series, end);
  const wPrev = trendAt(series, prevEnd);
  const weighIns = series.filter((p) => p.day >= days[0] && p.day <= end).length;
  const all = buildSeries({ weights: series, measures, rows });
  const weekMean = (key, ds) => { const v = (all.get(key) || []).filter((p) => p.day >= ds[0] && p.day <= ds[6]).map((p) => p.v); return v.length ? mean(v) : null; };
  const weight = { now: wNow ? wNow.trend : null, before: wPrev ? wPrev.trend : null, change: wNow && wPrev ? wNow.trend - wPrev.trend : null, weighIns };
  const comp = {
    fat: { now: weekMean('fat_mass_kg', days), before: weekMean('fat_mass_kg', prevDays) },
    lean: { now: weekMean('fat_free_mass_kg', days), before: weekMean('fat_free_mass_kg', prevDays) },
  };
  comp.fat.change = delta(comp.fat.now, comp.fat.before);
  comp.lean.change = delta(comp.lean.now, comp.lean.before);

  // Training
  const tNow = trainingFor(days, { workouts, cardio, profile });
  const tPrev = trainingFor(prevDays, { workouts, cardio, profile });
  const training = { ...tNow, prevVolumeKg: tPrev.volumeKg, prevWorkouts: tPrev.workouts, volumeChangePct: tPrev.volumeKg > 0 ? ((tNow.volumeKg - tPrev.volumeKg) / tPrev.volumeKg) * 100 : null };

  // Recovery
  const rec = {};
  for (const [k, get] of Object.entries({ hrv: GET.hrv, rhr: GET.rhr, sleep: GET.sleep })) {
    const a = avgOf(days, byDay, get);
    const b = avgOf(prevDays, byDay, get);
    rec[k] = { now: a.value, before: b.value, change: delta(a.value, b.value), n: a.n };
  }
  const steps = avgOf(days, byDay, GET.steps).value;

  // Best and worst metric: change in weekly mean in "usual daily swings" (sd of the 8 weeks before), signed by what is good for the goal
  const cands = [];
  for (const m of TREND_METRICS) {
    const good = goodDirection(m.key, goal);
    if (!good) continue;
    const a = weekMean(m.key, days);
    const b = weekMean(m.key, prevDays);
    if (a == null || b == null) continue;
    const hist = (all.get(m.key) || []).filter((p) => p.day >= shiftDay(end, -55) && p.day <= end).map((p) => p.v);
    const scale = sd(hist);
    if (!scale) continue;
    const z = (a - b) / scale;
    cands.push({ key: m.key, label: m.label, now: a, before: b, change: a - b, z: good === 'up' ? z : -z });
  }
  cands.sort((x, y) => y.z - x.z);
  const best = cands.length && cands[0].z >= NOTABLE_Z ? cands[0] : null;
  const worst = cands.length && cands[cands.length - 1].z <= -NOTABLE_Z && cands[cands.length - 1] !== best ? cands[cands.length - 1] : null;

  const hasData = tNow.workouts > 0 || tNow.cardioMin > 0 || weighIns > 0 || rec.hrv.n + rec.rhr.n + rec.sleep.n > 0;
  const report = { weekStart, weekEnd: end, days, partial: end >= today, hasData, score, weight, comp, training, recovery: rec, steps, best, worst, goal };
  report.suggestion = suggest(report);
  return report;
}

/** The first rule that matches wins. Plain words, one thing to do next week. */
export function suggest(r) {
  const T = SUGGEST;
  const t = r.training;
  if (!r.hasData) return { id: 'start', text: 'Log a weigh-in and a workout this week so next week’s report has something to say.' };
  if (t.workouts < t.planned && t.workouts + (t.prevWorkouts || 0) > 0) {
    return { id: 'sessions', text: `Aim for ${t.planned} workouts next week. Pick the days now and put them in your calendar.` };
  }
  if (r.recovery.hrv.change != null && r.recovery.rhr.change != null && r.recovery.hrv.before && (r.recovery.hrv.change / r.recovery.hrv.before) * 100 <= -T.hrvDropPct && r.recovery.rhr.change >= T.rhrUpBpm) {
    return { id: 'recover', text: 'Your body looks tired. Keep one full rest day next week and protect your sleep.' };
  }
  if (r.recovery.sleep.now != null && r.recovery.sleep.now < T.sleepMin) {
    return { id: 'sleep', text: 'Try getting into bed 30 minutes earlier on three nights next week.' };
  }
  if (r.weight.change != null && r.weight.before && r.goal === 'lose' && (-r.weight.change / r.weight.before) * 100 > MAX_LOSS_PCT) {
    return { id: 'too-fast', text: 'You are losing faster than is comfortable to keep muscle. Eat a little more next week.' };
  }
  if (r.goal === 'lose' && r.comp.lean.change != null && r.comp.lean.change < -0.3) {
    return { id: 'protect-lean', text: 'Your lean mass dipped. Keep protein high and lift heavy next week.' };
  }
  if (r.steps != null && r.steps < T.stepsMin) {
    return { id: 'walk', text: 'Add a 15-minute walk after dinner on most days next week.' };
  }
  if (r.weight.weighIns < T.minWeighIns) {
    return { id: 'weigh', text: 'Weigh in on at least three mornings next week so your trend stays sharp.' };
  }
  return { id: 'steady', text: 'Nothing to fix. Keep doing what you did this week.' };
}
