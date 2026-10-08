// Body metrics from the scale (users/{uid}/body_measures): what Forge shows, how each value is formatted
// in your units, series for charts, and the derived numbers (BMI, FFMI, FMI). Pure; tested.
import { weightToDisplay, weightUnit, cmToFeetInches } from '../units.js';

// The Body tab's metrics, in order. kind: how to format. derived ones are computed by Forge.
export const BODY_METRICS = [
  { key: 'weight_kg', label: 'Weight', kind: 'mass' },
  { key: 'fat_ratio_pct', label: 'Body fat', kind: 'pct' },
  { key: 'fat_mass_kg', label: 'Fat mass', kind: 'mass' },
  { key: 'fat_free_mass_kg', label: 'Fat-free mass', kind: 'mass' },
  { key: 'muscle_mass_kg', label: 'Muscle', kind: 'mass', overlay: 'sets' },
  { key: 'hydration_kg', label: 'Water', kind: 'mass' },
  { key: 'bone_mass_kg', label: 'Bone', kind: 'mass' },
  { key: 'heart_pulse_bpm', label: 'Standing HR', kind: 'bpm' },
  { key: 'visceral_fat', label: 'Visceral fat', kind: 'index' },
  { key: 'bmr_kcal', label: 'BMR', kind: 'kcal' },
  { key: 'metabolic_age', label: 'Metabolic age', kind: 'years' },
  { key: 'vascular_age', label: 'Vascular age', kind: 'years' },
  { key: 'nerve_health_score', label: 'Nerve Health Score', kind: 'index' },
  { key: 'vo2max', label: 'VO₂max', kind: 'vo2' },
  { key: 'bmi', label: 'BMI', kind: 'index', derived: true },
  { key: 'ffmi', label: 'FFMI', kind: 'index', derived: true },
  { key: 'fmi', label: 'FMI', kind: 'index', derived: true },
];
export const metricDef = (key) => BODY_METRICS.find((m) => m.key === key) || null;

// meastype code → metric key, for the data check's "which codes came back" (mirrors functions/src/meastypes.js).
export const KEY_OF_TYPE = {
  1: 'weight_kg', 4: 'height_m', 5: 'fat_free_mass_kg', 6: 'fat_ratio_pct', 8: 'fat_mass_kg', 11: 'heart_pulse_bpm', 54: 'spo2_pct',
  76: 'muscle_mass_kg', 77: 'hydration_kg', 88: 'bone_mass_kg', 91: 'pwv_m_s', 123: 'vo2max', 140: 'vascular_age', 155: 'vascular_age',
  167: 'nerve_health_score', 168: 'ecw_kg', 169: 'icw_kg', 170: 'visceral_fat', 196: 'nrs', 226: 'bmr_kcal', 227: 'metabolic_age', 229: 'esc',
};

/** A value in your units, as text: "181.4 lb", "21.4 %", "64 bpm"… */
export function fmtMetric(key, v, units, { unit = true } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const kind = (metricDef(key) || {}).kind || (/_kg$/.test(key) ? 'mass' : /_pct$/.test(key) ? 'pct' : key === 'height_m' ? 'height' : 'index');
  if (kind === 'mass') return `${weightToDisplay(v, units).toFixed(1)}${unit ? ` ${weightUnit(units)}` : ''}`;
  if (kind === 'pct') return `${v.toFixed(1)}${unit ? ' %' : ''}`;
  if (kind === 'bpm') return `${Math.round(v)}${unit ? ' bpm' : ''}`;
  if (kind === 'kcal') return `${Math.round(v).toLocaleString()}${unit ? ' kcal' : ''}`;
  if (kind === 'vo2') return `${Math.round(v * 10) / 10}${unit ? ' ml/kg/min' : ''}`;
  if (kind === 'years') return `${Math.round(v)}${unit ? ' yrs' : ''}`;
  if (kind === 'height') {
    if (units === 'metric') return `${Math.round(v * 100)} cm`;
    const { feet, inches } = cmToFeetInches(v * 100);
    return `${feet}′${inches}″`;
  }
  return `${Math.round(v * 10) / 10}`;
}

/** Height in metres: the latest from the scale, else your profile. */
export function heightM(docs, profile) {
  const h = [...docs].filter((d) => !d.deleted && d.metrics && d.metrics.height_m).sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1))[0];
  if (h) return h.metrics.height_m;
  return profile && profile.heightCm ? profile.heightCm / 100 : null;
}

/** Points [{ at, day, v }] for one metric (derived ones computed per group), oldest first, review excluded. */
export function metricSeries(docs, key, { height = null } = {}) {
  const out = [];
  for (const d of docs) {
    if (d.deleted || d.needs_review || !d.metrics) continue;
    const m = d.metrics;
    let v = m[key];
    if (key === 'bmi' && height && m.weight_kg) v = m.weight_kg / (height * height);
    if (key === 'ffmi' && height && m.fat_free_mass_kg) v = m.fat_free_mass_kg / (height * height);
    if (key === 'fmi' && height && m.fat_mass_kg) v = m.fat_mass_kg / (height * height);
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ at: d.measured_at, day: d.day, v });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

/** Daily values (earliest reading of each day, like weight), for charts and period comparisons. */
export function dailySeries(points) {
  const byDay = new Map();
  for (const p of points) if (!byDay.has(p.day) || p.at < byDay.get(p.day).at) byDay.set(p.day, p);
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** Latest value and the change over `days` (vs. the value on or before that day). */
export function latestAndChange(points, days = 30) {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const cutoff = new Date(Date.parse(last.at) - days * 86400000).toISOString();
  const before = [...points].reverse().find((p) => p.at <= cutoff);
  return { last, change: before ? last.v - before.v : null };
}

/** Average over the window [from, to) of daily values; null if none. For "this period vs previous". */
export function periodAverage(daily, fromDay, toDay) {
  const xs = daily.filter((p) => p.day >= fromDay && p.day < toDay).map((p) => p.v);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const weighIns = (docs) => docs
  .filter((d) => !d.deleted && !d.needs_review && d.metrics && Number.isFinite(d.metrics.weight_kg))
  .sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1));

/** Day of the latest weigh-in (newest scale reading with a weight), or null. */
export function lastWeighInDay(docs) {
  const w = weighIns(docs)[0];
  return w ? w.day : null;
}

/**
 * How many of your most recent weigh-ins came without body composition (the bioimpedance reading failed:
 * shoes or socks, wet or very dry feet, not standing still). 0 when the latest one had it.
 */
export function compositionGap(docs) {
  let n = 0;
  for (const d of weighIns(docs)) {
    if (Number.isFinite(d.metrics.fat_ratio_pct) || Number.isFinite(d.metrics.fat_mass_kg)) break;
    n++;
  }
  return n;
}
