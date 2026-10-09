// Goal path (W2b, the BodyPath replacement): where your weight trend is heading, when it reaches your goal,
// how sure we are, and (with body composition) the energy balance implied by the change. Pure; docs/trends.md.
import { addDays, daysBetween } from '../weight/smoothing.js';
import { theilSenFit, NOISE_FLOOR } from './trends.js';
import { MAX_LOSS_PCT, MAX_GAIN_PCT } from '../nutrition/targets.js';
import { metricSeries, dailySeries } from '../withings/body.js';

export const WINDOW_DAYS = 28;
export const MIN_POINTS = 6;
export const MIN_SPAN_DAYS = 14;
export const Z80 = 1.2816; // the band is an 80% range
export const MAX_ETA_DAYS = 5 * 365;
export const REACHED_KG = 0.1;
// Energy densities from Hall 2008: fat 39.5 MJ/kg, lean (fat-free) tissue 7.6 MJ/kg.
export const MJ_PER_KG = { fat: 39.5, lean: 7.6 };
export const KCAL_PER_MJ = 1000 / 4.184;

const sdOf = (xs, dof) => (xs.length > dof ? Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / (xs.length - dof)) : null);

/**
 * series: weight series [{ day, kg, trend }]; goalKg: profile.targetWeightKg.
 * status: 'none' (not enough data) | 'nogoal' | 'reached' | 'flat' | 'away' | 'far' | 'ok'.
 * With 'ok': etaDay, earlyDay, lateDay (null = "or later", the band reaches no end), weeks.
 */
export function goalPath({ series, goalKg, today }) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const pts = series.filter((p) => p.day >= from && p.day <= today && Number.isFinite(p.kg));
  if (pts.length < MIN_POINTS || daysBetween(pts[0].day, pts[pts.length - 1].day) < MIN_SPAN_DAYS) return { status: 'none' };
  const xs = pts.map((p) => daysBetween(from, p.day));
  const fit = theilSenFit(pts.map((p, i) => [xs[i], p.kg]));
  if (!fit) return { status: 'none' };
  const resid = pts.map((p, i) => p.kg - (fit.intercept + fit.slope * xs[i]));
  const sdKg = sdOf(resid, 2);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const se = sdKg != null && sxx > 0 ? sdKg / Math.sqrt(sxx) : 0; // standard error of the slope, kg/day
  const current = pts[pts.length - 1].trend;
  const slopeWeek = fit.slope * 7;
  const losing = slopeWeek < 0;
  const cap = ((losing ? MAX_LOSS_PCT : MAX_GAIN_PCT) / 100) * current; // kg/week
  const base = { current, slopePerWeek: slopeWeek, sdKg, capKgPerWeek: cap, paceVsCap: Math.abs(slopeWeek) / cap, overCap: Math.abs(slopeWeek) > cap };
  if (!Number.isFinite(goalKg)) return { status: 'nogoal', ...base };
  const remaining = goalKg - current;
  if (Math.abs(remaining) < REACHED_KG) return { status: 'reached', ...base, remaining };
  if (Math.abs(slopeWeek) < NOISE_FLOOR.weight_kg) return { status: 'flat', ...base, remaining };
  if (Math.sign(remaining) !== Math.sign(slopeWeek)) return { status: 'away', ...base, remaining };
  const speed = Math.abs(fit.slope); // kg/day toward the goal
  const days = Math.abs(remaining) / speed;
  if (days > MAX_ETA_DAYS) return { status: 'far', ...base, remaining };
  const fast = speed + Z80 * se;
  const slow = speed - Z80 * se;
  const early = Math.abs(remaining) / fast;
  const late = slow > 0 ? Math.abs(remaining) / slow : null;
  return {
    status: 'ok', ...base, remaining, weeks: days / 7,
    etaDay: addDays(today, Math.round(days)),
    earlyDay: addDays(today, Math.round(early)),
    lateDay: late != null && late <= MAX_ETA_DAYS ? addDays(today, Math.round(late)) : null,
  };
}

/** The chart's dotted line: ends on the goal at the same date as the sentence. null unless there is a date. */
export const goalProjection = (path) => (path && path.status === 'ok' ? { reached: false, day: path.etaDay } : null);

/** One sentence for Today, from the same fit as the Goal path card. fmt(dayKey) formats the date. */
export const goalLine = (path, fmt) => (path && path.status === 'ok' ? `On pace for your goal around ${fmt(path.etaDay)}` : '');

/**
 * Energy balance implied by the change in fat mass and fat-free mass over 28 days (kcal/day, negative = deficit).
 * measures: body_measures docs. Returns null without 4+ fat-mass readings over 14+ days.
 */
export function energyBalance({ measures, today }) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const slopeOf = (key) => {
    const pts = dailySeries(metricSeries(measures, key)).filter((p) => p.day >= from && p.day <= today);
    if (pts.length < 4 || daysBetween(pts[0].day, pts[pts.length - 1].day) < MIN_SPAN_DAYS) return null;
    const fit = theilSenFit(pts.map((p) => [daysBetween(from, p.day), p.v]));
    return fit ? fit.slope : null; // kg/day
  };
  const fat = slopeOf('fat_mass_kg');
  if (fat == null) return null;
  const lean = slopeOf('fat_free_mass_kg');
  const kcal = (fat * MJ_PER_KG.fat + (lean ?? 0) * MJ_PER_KG.lean) * KCAL_PER_MJ;
  return { kcalPerDay: kcal, fatPerWeek: fat * 7, leanPerWeek: lean == null ? null : lean * 7, usedLean: lean != null };
}

