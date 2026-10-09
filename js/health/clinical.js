// Health summary for your doctor (v0.13.1): everything the phone knows over 30 days, 90 days or a year, boiled
// down to the numbers a clinician reads. Pure functions, no DOM, no network. A section is present only when it
// has data, and the summary never contains a name or an email (the profile is read for age, sex and height only).
// Rules are written down in docs/report.md.
import { shiftDay, indexDays, mean, sd, GET } from './metrics.js';
import { trendFor, buildSeries } from './trends.js';
import { detectAnomalies, THRESHOLDS } from './anomalies.js';
import { weeklyScores } from './longterm.js';
import { PILLARS } from './score.js';
import { vo2Series, vo2Band, hrvVsUsual, ffmiBand } from './longevity.js';
import { metricSeries, dailySeries, heightM } from '../withings/body.js';
import { dayKey, daysBetween } from '../weight/smoothing.js';
import { weightToDisplay, weightUnit, cmToFeetInches } from '../units.js';
import { fmtClock } from '../missions/core.js';

export const RANGES = [30, 90, 365];
export const DEFAULT_RANGE = 90;
export const RANGE_LABEL = { 30: '30 days', 90: '90 days', 365: '1 year' };
const NOT_A_RECORD = 'Not a medical record.';
/** "Measured at home: Withings scale, Apple Health. Not a medical record." Names only the sources found in range. */
export function notMedical(sources = {}) {
  const parts = [sources.withings ? 'Withings scale' : null, sources.apple ? 'Apple Health' : null, sources.hand ? 'weight entered by hand' : null].filter(Boolean);
  return parts.length ? `Measured at home: ${parts.join(', ')}. ${NOT_A_RECORD}` : NOT_A_RECORD;
}
export const SCORE_NOTE = 'Forge’s own 0–100 score. It is not a clinical measure.';
export const EXPLAIN = {
  hrv: 'HRV (heart rate variability) is the small variation in time between heartbeats. It is only compared with the person’s own usual.',
  vo2max: 'VO₂max is the most oxygen the body can use during hard exercise, a common measure of cardio fitness. Bands are estimates for age and sex.',
  ffmi: 'FFMI (fat-free mass index) is fat-free mass divided by height squared: lean body for a person’s size.',
};

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const round1 = (x) => Math.round(x * 10) / 10;

// ---- unit text ----

/** "204.2 lb (92.6 kg)" in imperial, "92.6 kg" in metric: clinicians often chart in kg. */
export function fmtKgBoth(kg, units, digits = 1) {
  if (num(kg) == null) return '—';
  const metric = `${kg.toFixed(digits)} kg`;
  return units === 'metric' ? metric : `${weightToDisplay(kg, units).toFixed(digits)} ${weightUnit(units)} (${metric})`;
}

/** Signed version for changes: "−0.9 lb (−0.4 kg)". A change that rounds to nothing reads "0". */
export function fmtKgChange(kg, units, digits = 1) {
  if (num(kg) == null) return '—';
  const sgn = (x) => { const r = Number(Math.abs(x).toFixed(digits)); return r === 0 ? '0' : `${x < 0 ? '−' : '+'}${r.toFixed(digits)}`; };
  const metric = `${sgn(kg)} kg`;
  return units === 'metric' ? metric : `${sgn(weightToDisplay(kg, units))} ${weightUnit(units)} (${metric})`;
}

/** `5′11″ (180 cm)` in imperial, `180 cm` in metric. */
export function fmtHeightBoth(cm, units) {
  if (!num(cm) || cm <= 0) return null;
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′${inches}″ (${Math.round(cm)} cm)`;
}

export const fmtDur = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');

// ---- pieces ----

const inWin = (series, from, to) => series.filter((p) => p.day >= from && p.day <= to);
const dailyApple = (days, get, from, to) => {
  const out = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) { const r = days.get(d); const v = r ? num(get(r)) : null; if (v != null) out.push({ day: d, v }); }
  return out;
};
const meanOf = (s) => (s.length ? mean(s.map((p) => p.v)) : null);
const last = (s) => s[s.length - 1];
const nightMin = (min) => (min < 720 ? min + 1440 : min); // after midnight counts as late, not early

function weightSection({ series, measures, profile, from, to }) {
  const pts = inWin(series.filter((p) => num(p.trend) != null), from, to);
  const hM = heightM(measures, profile);
  const comp = (key, opts) => { const s = inWin(dailySeries(metricSeries(measures, key, opts)), from, to); return s.length ? last(s).v : null; };
  const fat = comp('fat_ratio_pct');
  const ffm = comp('fat_free_mass_kg');
  const visceral = comp('visceral_fat');
  const ffmi = hM ? comp('ffmi', { height: hM }) : null;
  if (!pts.length && fat == null && ffm == null && visceral == null && ffmi == null) return null;
  const out = { weighIns: pts.length, startKg: null, endKg: null, changeKg: null, perWeekKg: null, spanDays: 0, fatPct: fat, fatFreeKg: ffm, visceral, ffmi, ffmiBand: ffmi != null ? ffmiBand(ffmi, profile.sex) : null, points: [] };
  if (pts.length) {
    out.startKg = pts[0].trend;
    out.endKg = last(pts).trend;
    out.points = pts.map((p) => ({ day: p.day, v: p.trend }));
    out.spanDays = daysBetween(pts[0].day, last(pts).day);
    if (pts.length >= 2) {
      out.changeKg = out.endKg - out.startKg;
      // A rate over less than a week of data would be noise dressed up as a number.
      out.perWeekKg = out.spanDays >= 7 ? (out.changeKg / out.spanDays) * 7 : null;
    }
  }
  return out;
}

function heartSection({ days, measures, profile, today, from, range }) {
  const rhr = dailyApple(days, GET.rhr, from, today);
  const hrv = dailyApple(days, GET.hrv, from, today);
  const vo2 = inWin(vo2Series([...days.values()], measures), from, today);
  const walk = dailyApple(days, (r) => r.walking_hr_avg, from, today);
  const spo2 = dailyApple(days, (r) => r.spo2_avg_pct, from, today);
  if (!rhr.length && !hrv.length && !vo2.length && !walk.length && !spo2.length) return null;
  const out = { rhr: null, hrv: null, vo2max: null, walkingHr: null, spo2: null };
  if (rhr.length) {
    const t = trendFor(rhr, { metric: 'rhr_bpm', window: range, today });
    out.rhr = { avg: meanOf(rhr), n: rhr.length, enough: t.enough, direction: t.enough ? t.direction : null };
  }
  if (hrv.length) {
    const usual = hrvVsUsual(dailyApple(days, GET.hrv, shiftDay(today, -34), today), today);
    out.hrv = { avg: meanOf(hrv), n: hrv.length, usual: usual ? { now: usual.now, usual: usual.usual, state: usual.state } : null };
  }
  if (vo2.length) {
    const v = last(vo2);
    const b = vo2Band(v.v, profile);
    out.vo2max = { latest: v.v, day: v.day, band: b ? b.label : null };
  }
  if (walk.length) out.walkingHr = { avg: meanOf(walk), n: walk.length };
  if (spo2.length) out.spo2 = { avg: meanOf(spo2), n: spo2.length };
  return out;
}

function sleepSection({ days, from, today }) {
  const asleep = dailyApple(days, GET.sleep, from, today);
  if (!asleep.length) return null;
  const short = asleep.filter((p) => p.v < THRESHOLDS.sleepShortMin).length;
  const out = { nights: asleep.length, avgMin: meanOf(asleep), shortNights: short, shortPct: (short / asleep.length) * 100, bedtime: null };
  const beds = [];
  for (let d = from; d <= today; d = shiftDay(d, 1)) {
    const s = days.get(d) && days.get(d).sleep;
    const t = s && s.in_bed_start ? new Date(s.in_bed_start) : null;
    if (t && Number.isFinite(t.getTime())) beds.push(nightMin(t.getHours() * 60 + t.getMinutes()));
  }
  if (beds.length >= 5) out.bedtime = { n: beds.length, avgMin: Math.round(mean(beds)) % 1440, spreadMin: Math.round(sd(beds)) };
  return out;
}

const finished = (ws) => ws.filter((w) => !w.deleted && w.status === 'done' && w.started_at && (w.exercises || []).some((it) => (it.sets || []).some((s) => s.done && !s.warmup)));

function activitySection({ days, workouts, cardio, from, today }) {
  const steps = dailyApple(days, GET.steps, from, today);
  const kcal = dailyApple(days, (r) => r.active_kcal, from, today);
  const ex = dailyApple(days, GET.exercise, from, today);
  const ws = finished(workouts).filter((w) => { const d = dayKey(w.started_at); return d >= from && d <= today; });
  const cs = (cardio || []).filter((c) => !c.deleted && c.started_at && dayKey(c.started_at) >= from && dayKey(c.started_at) <= today);
  if (!steps.length && !kcal.length && !ex.length && !ws.length && !cs.length) return null;
  // Per-week numbers count from the first thing logged in the window, so a new user isn't averaged against empty weeks.
  const firsts = [...ws.map((w) => dayKey(w.started_at)), ...cs.map((c) => dayKey(c.started_at))].sort();
  const start = firsts.length && firsts[0] > from ? firsts[0] : from;
  const weeks = Math.max(1, (daysBetween(start, today) + 1) / 7);
  const cardioMin = cs.reduce((a, c) => a + (Number(c.duration_min) || 0), 0);
  return {
    steps: steps.length ? meanOf(steps) : null, activeKcal: kcal.length ? meanOf(kcal) : null, exerciseMin: ex.length ? meanOf(ex) : null,
    sessions: ws.length, workoutsPerWeek: ws.length ? ws.length / weeks : null,
    cardioMinPerWeek: cardioMin > 0 ? cardioMin / weeks : null,
  };
}

function scoreSection({ rows, series, measures, workouts, cardio, profile, today, from, range }) {
  const weekly = weeklyScores({ rows, series, measures, workouts, cardio, profile }, today, Math.ceil(range / 7)).filter((w) => w.day >= from);
  if (!weekly.length) return null;
  const pillars = [];
  for (const k of Object.keys(PILLARS)) {
    const v = weekly.map((w) => w.pillars[k]).filter((x) => x != null);
    if (v.length) pillars.push({ key: k, label: PILLARS[k].label, avg: mean(v) });
  }
  return { avg: mean(weekly.map((w) => w.score)), weeks: weekly.length, pillars };
}

/** Plain, neutral flags. They repeat what Forge's insights already detect; none of them is a diagnosis. */
function notesFor({ sleep, anomalies }) {
  const notes = [];
  const a = (k) => anomalies.find((x) => x.kind === k);
  if (a('rhr')) notes.push(`Resting heart rate has been about ${Math.round(a('rhr').data.up)} bpm above the person’s usual for ${a('rhr').data.nights} days in a row.`);
  if (a('hrv')) notes.push(`7-day HRV is ${Math.round(a('hrv').data.dropPct)}% below the person’s usual of the previous 4 weeks.`);
  if (a('sleep')) notes.push(`Slept under 6 hours for ${a('sleep').data.nights} nights in a row (average ${fmtDur(a('sleep').data.avgMin)}).`);
  if (a('temp')) notes.push(`Wrist temperature has been ${a('temp').data.delta.toFixed(1)} °C above the person’s usual for ${a('temp').data.nights} nights in a row.`);
  if (sleep && sleep.nights >= 7 && sleep.shortPct >= 33) notes.push(`Slept under 6 hours on ${sleep.shortNights} of ${sleep.nights} recorded nights (${Math.round(sleep.shortPct)}%).`);
  return notes;
}

/**
 * ctx: { range (30|90|365), today, rows (health_daily), measures (body_measures), series (weight series
 * [{day,kg,trend}]), workouts, cardio, profile }. Returns
 * { range, from, to, header: { age, sex, heightCm }, weight, heart, sleep, activity, score, notes } where each
 * section is null when it has no data. The header only ever carries age, sex and height.
 */
export function buildSummary(ctx) {
  const { today, rows = [], measures = [], series = [], workouts = [], cardio = [], profile = {} } = ctx;
  const range = RANGES.includes(ctx.range) ? ctx.range : DEFAULT_RANGE;
  const from = shiftDay(today, -(range - 1));
  const days = indexDays(rows);
  const sleep = sleepSection({ days, from, today });
  const anomalies = detectAnomalies({ today, weights: series, series: buildSeries({ weights: series, measures, rows }), rows });
  return {
    range, from, to: today,
    sources: sourcesIn({ series, measures, rows, from, to: today }),
    header: { age: num(profile.age) && profile.age > 0 ? profile.age : null, sex: profile.sex === 'male' || profile.sex === 'female' ? profile.sex : null, heightCm: num(profile.heightCm) },
    weight: weightSection({ series, measures, profile, from, to: today }),
    heart: heartSection({ days, measures, profile, today, from, range }),
    sleep,
    activity: activitySection({ days, workouts, cardio, from, today }),
    score: scoreSection({ rows, series, measures, workouts, cardio, profile, today, from, range }),
    notes: notesFor({ sleep, anomalies }),
  };
}

/** Sources with something in the window: Withings (device weigh-ins or body_measures), Apple Health (health_daily rows), by hand (typed-in weights). */
function sourcesIn({ series, measures, rows, from, to }) {
  const w = inWin(series.filter((p) => num(p.kg) != null || num(p.trend) != null), from, to);
  const isDevice = (p) => p.device === true || p.source === 'withings';
  return {
    withings: w.some(isDevice) || inWin(measures.filter((m) => m && m.day), from, to).length > 0,
    apple: rows.some((r) => r && r.id >= from && r.id <= to),
    hand: w.some((p) => !isDevice(p)),
  };
}

/** True when there is nothing at all to put in the summary. */
export const isEmpty = (s) => !s.weight && !s.heart && !s.sleep && !s.activity && !s.score;

// ---- compact text version (Share as text) ----

export const dateText = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); };

/** The summary as plain text. `generated` is a 'YYYY-MM-DD' key. Never includes a name or an email. */
export function summaryText(s, units, generated) {
  const L = [`Forge health summary · ${dateText(s.from)} – ${dateText(s.to)} (${RANGE_LABEL[s.range]})`, `Generated ${dateText(generated || s.to)}`];
  const who = [s.header.age ? `${s.header.age} years` : null, s.header.sex, fmtHeightBoth(s.header.heightCm, units)].filter(Boolean);
  if (who.length) L.push(who.join(', '));
  L.push(notMedical(s.sources));
  const w = s.weight;
  if (w) {
    L.push('', 'WEIGHT AND BODY COMPOSITION');
    if (w.startKg != null && w.changeKg != null) L.push(`Trend weight ${fmtKgBoth(w.startKg, units)} → ${fmtKgBoth(w.endKg, units)}${w.perWeekKg != null ? `, ${fmtKgChange(w.perWeekKg, units)} a week` : ''}`);
    else if (w.endKg != null) L.push(`Trend weight ${fmtKgBoth(w.endKg, units)}`);
    if (w.fatPct != null) L.push(`Body fat ${w.fatPct.toFixed(1)}%`);
    if (w.fatFreeKg != null) L.push(`Fat-free mass ${fmtKgBoth(w.fatFreeKg, units)}`);
    if (w.visceral != null) L.push(`Visceral fat index ${round1(w.visceral)}`);
    if (w.ffmi != null) L.push(`FFMI ${round1(w.ffmi)}${w.ffmiBand ? ` (${w.ffmiBand.label})` : ''}`);
  }
  const h = s.heart;
  if (h) {
    L.push('', 'HEART AND FITNESS');
    if (h.rhr) L.push(`Resting heart rate ${Math.round(h.rhr.avg)} bpm average${h.rhr.direction === 'flat' ? ', steady' : h.rhr.direction ? `, trending ${h.rhr.direction}` : ''}`);
    if (h.hrv) L.push(`HRV ${Math.round(h.hrv.avg)} ms average${h.hrv.usual ? ` (last 7 days ${Math.round(h.hrv.usual.now)} ms vs usual ${Math.round(h.hrv.usual.usual)} ms)` : ''}`);
    if (h.vo2max) L.push(`VO2max ${round1(h.vo2max.latest)} ml/kg/min${h.vo2max.band ? ` (${h.vo2max.band} for age and sex, estimate)` : ''}`);
    if (h.walkingHr) L.push(`Walking heart rate ${Math.round(h.walkingHr.avg)} bpm average`);
    if (h.spo2) L.push(`SpO2 ${round1(h.spo2.avg)}% average`);
  }
  const sl = s.sleep;
  if (sl) {
    L.push('', 'SLEEP', `Average asleep ${fmtDur(sl.avgMin)} over ${sl.nights} nights; under 6 h on ${Math.round(sl.shortPct)}% of nights`);
    if (sl.bedtime) L.push(`Average bedtime ${fmtClock(sl.bedtime.avgMin)}, varying by about ${sl.bedtime.spreadMin} min`);
  }
  const a = s.activity;
  if (a) {
    L.push('', 'ACTIVITY AND TRAINING');
    if (a.steps != null) L.push(`Steps ${fmtInt(a.steps)} a day`);
    if (a.activeKcal != null) L.push(`Active energy ${fmtInt(a.activeKcal)} kcal a day`);
    if (a.exerciseMin != null) L.push(`Exercise ${Math.round(a.exerciseMin)} min a day`);
    if (a.workoutsPerWeek != null) L.push(`Strength workouts ${round1(a.workoutsPerWeek)} a week (${a.sessions} sessions)`);
    if (a.cardioMinPerWeek != null) L.push(`Cardio ${Math.round(a.cardioMinPerWeek)} min a week`);
  }
  if (s.score) L.push('', 'FORGE SCORE', `${Math.round(s.score.avg)} average. ${s.score.pillars.map((p) => `${p.label} ${Math.round(p.avg)}`).join(', ')}. ${SCORE_NOTE}`);
  if (s.notes.length) L.push('', 'NOTES FOR THE DOCTOR', ...s.notes.map((n) => `- ${n}`));
  L.push('', 'Shared from Forge. Not a medical record.');
  return L.join('\n');
}
