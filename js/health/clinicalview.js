// HTML for the health summary (v0.13.1). Strings only. On screen it uses Forge's card styles; printed, css/report.css
// turns it into black-on-white pages. Every section is skipped when the summary has nothing for it.
import { esc } from '../ui.js';
import { daysBetween } from '../weight/smoothing.js';
import { weightToDisplay, weightUnit } from '../units.js';
import { fmtClock } from '../missions/core.js';
import {
  RANGES, RANGE_LABEL, NOT_MEDICAL, SCORE_NOTE, EXPLAIN, fmtKgBoth, fmtKgChange, fmtHeightBoth, fmtDur, dateText,
} from './clinical.js';

const round1 = (x) => Math.round(x * 10) / 10;
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');

/** Black-and-white weight chart: the trend line, min and max on the left, first and last date underneath. */
export function weightChartSvg(points, units, { width = 340, height = 120 } = {}) {
  if (points.length < 2) return '';
  const vals = points.map((p) => weightToDisplay(p.v, units));
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1) { const mid = (max + min) / 2; min = mid - 0.5; max = mid + 0.5; }
  const L = 38; const R = 6; const T = 8; const B = 20;
  const t0 = points[0].day;
  const span = Math.max(1, daysBetween(t0, points[points.length - 1].day));
  const x = (p) => L + (daysBetween(t0, p.day) / span) * (width - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (height - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(weightToDisplay(p.v, units)).toFixed(1)}`).join(' ');
  const u = weightUnit(units);
  return `<svg class="rp-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend weight from ${esc(dateText(t0))} to ${esc(dateText(points[points.length - 1].day))}, ${min.toFixed(1)} to ${max.toFixed(1)} ${u}">
    <line x1="${L}" y1="${T}" x2="${width - R}" y2="${T}" class="rp-grid"/><line x1="${L}" y1="${height - B}" x2="${width - R}" y2="${height - B}" class="rp-grid"/>
    <text x="${L - 4}" y="${T + 4}" text-anchor="end">${max.toFixed(1)}</text><text x="${L - 4}" y="${height - B + 4}" text-anchor="end">${min.toFixed(1)}</text>
    <text x="${L}" y="${height - 4}">${esc(dateText(t0))}</text><text x="${width - R}" y="${height - 4}" text-anchor="end">${esc(dateText(points[points.length - 1].day))}</text>
    <path d="${d}" class="rp-line"/></svg>`;
}

const row = (label, value, note = '') => `<li><span>${esc(label)}</span><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ''}</li>`;
const section = (title, body, key) => `<section class="rp-sec card stack" data-rp="${key}"><h2>${esc(title)}</h2>${body}</section>`;

function weightHtml(w, units) {
  const rows = [];
  if (w.startKg != null && w.changeKg != null) {
    rows.push(row('Trend weight', `${fmtKgBoth(w.startKg, units)} → ${fmtKgBoth(w.endKg, units)}`));
    rows.push(row('Change', w.perWeekKg != null ? `${fmtKgChange(w.perWeekKg, units)} a week` : `${fmtKgChange(w.changeKg, units)} in ${w.spanDays} day${w.spanDays === 1 ? '' : 's'}`));
  } else if (w.endKg != null) rows.push(row('Trend weight', fmtKgBoth(w.endKg, units)));
  if (w.fatPct != null) rows.push(row('Body fat', `${w.fatPct.toFixed(1)} %`));
  if (w.fatFreeKg != null) rows.push(row('Fat-free mass', fmtKgBoth(w.fatFreeKg, units)));
  if (w.visceral != null) rows.push(row('Visceral fat index', String(round1(w.visceral))));
  if (w.ffmi != null) rows.push(row('FFMI', String(round1(w.ffmi)), w.ffmiBand ? `${w.ffmiBand.label} for height and sex` : ''));
  const chart = weightChartSvg(w.points, units);
  return section('Weight and body composition', `<ul class="rp-list">${rows.join('')}</ul>${chart}${w.ffmi != null ? `<p class="rp-explain">${esc(EXPLAIN.ffmi)}</p>` : ''}`, 'weight');
}

function heartHtml(h) {
  const rows = [];
  if (h.rhr) rows.push(row('Resting heart rate', `${Math.round(h.rhr.avg)} bpm average`, h.rhr.direction === 'flat' ? 'Steady' : h.rhr.direction ? (h.rhr.direction === 'up' ? 'Trending up' : 'Trending down') : 'Not enough readings for a trend'));
  if (h.hrv) rows.push(row('HRV', `${Math.round(h.hrv.avg)} ms average`, h.hrv.usual ? `Last 7 days ${Math.round(h.hrv.usual.now)} ms, usual ${Math.round(h.hrv.usual.usual)} ms` : ''));
  if (h.vo2max) rows.push(row('VO₂max', `${round1(h.vo2max.latest)} ml/kg/min`, h.vo2max.band ? `${h.vo2max.band} for age and sex (estimate)` : ''));
  if (h.walkingHr) rows.push(row('Walking heart rate', `${Math.round(h.walkingHr.avg)} bpm average`));
  if (h.spo2) rows.push(row('Blood oxygen (SpO₂)', `${round1(h.spo2.avg)} % average`));
  const why = [h.hrv ? EXPLAIN.hrv : '', h.vo2max ? EXPLAIN.vo2max : ''].filter(Boolean).map((t) => `<p class="rp-explain">${esc(t)}</p>`).join('');
  return section('Heart and fitness', `<ul class="rp-list">${rows.join('')}</ul>${why}`, 'heart');
}

function sleepHtml(s) {
  const rows = [row('Average asleep', fmtDur(s.avgMin), `${s.nights} night${s.nights === 1 ? '' : 's'} recorded`), row('Nights under 6 h', `${Math.round(s.shortPct)} %`, `${s.shortNights} of ${s.nights}`)];
  if (s.bedtime) rows.push(row('Average bedtime', fmtClock(s.bedtime.avgMin), `Varies by about ${s.bedtime.spreadMin} min`));
  return section('Sleep', `<ul class="rp-list">${rows.join('')}</ul>`, 'sleep');
}

function activityHtml(a) {
  const rows = [];
  if (a.steps != null) rows.push(row('Steps', `${fmtInt(a.steps)} a day`));
  if (a.activeKcal != null) rows.push(row('Active energy', `${fmtInt(a.activeKcal)} kcal a day`));
  if (a.exerciseMin != null) rows.push(row('Exercise', `${Math.round(a.exerciseMin)} min a day`));
  if (a.workoutsPerWeek != null) rows.push(row('Strength workouts', `${round1(a.workoutsPerWeek)} a week`, `${a.sessions} session${a.sessions === 1 ? '' : 's'} in total`));
  if (a.cardioMinPerWeek != null) rows.push(row('Cardio', `${Math.round(a.cardioMinPerWeek)} min a week`));
  return section('Activity and training', `<ul class="rp-list">${rows.join('')}</ul>`, 'activity');
}

function scoreHtml(sc) {
  const rows = [row('Average Forge Score', String(Math.round(sc.avg)), `${sc.weeks} week${sc.weeks === 1 ? '' : 's'} of scores`), ...sc.pillars.map((p) => row(p.label, String(Math.round(p.avg))))];
  return section('Forge Score', `<ul class="rp-list">${rows.join('')}</ul><p class="rp-explain">${esc(SCORE_NOTE)}</p>`, 'score');
}

/** The whole page body (not the buttons or range switch, which are screen chrome). */
export function reportHtml(s, units, generated) {
  const who = [s.header.age ? `Age ${s.header.age}` : null, s.header.sex ? s.header.sex[0].toUpperCase() + s.header.sex.slice(1) : null, fmtHeightBoth(s.header.heightCm, units) ? `Height ${fmtHeightBoth(s.header.heightCm, units)}` : null].filter(Boolean);
  const head = `<header class="rp-head card stack" data-rp="header">
    <h1>Forge health summary</h1>
    <p class="rp-dates"><b>${esc(dateText(s.from))} – ${esc(dateText(s.to))}</b> (${esc(RANGE_LABEL[s.range])})</p>
    <p class="muted">Generated ${esc(dateText(generated || s.to))}</p>
    ${who.length ? `<p>${esc(who.join(' · '))}</p>` : ''}
    <p class="muted">${esc(NOT_MEDICAL)}</p></header>`;
  const notes = s.notes.length ? section('Notes for the doctor', `<ul class="rp-notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><p class="rp-explain">These come from Forge’s automatic checks of the person’s own data. They are observations, not a diagnosis.</p>`, 'notes') : '';
  return `${head}${s.weight ? weightHtml(s.weight, units) : ''}${s.heart ? heartHtml(s.heart) : ''}${s.sleep ? sleepHtml(s.sleep) : ''}${s.activity ? activityHtml(s.activity) : ''}${s.score ? scoreHtml(s.score) : ''}${notes}`;
}

export const rangeSegHtml = (range) => `<div class="seg small" role="radiogroup" aria-label="Date range">${RANGES.map((r) =>
  `<label><input type="radio" name="rprange" value="${r}" ${r === range ? 'checked' : ''}><span>${RANGE_LABEL[r]}</span></label>`).join('')}</div>`;
