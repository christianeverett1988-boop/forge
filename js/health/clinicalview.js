// HTML for the health summary (v0.13.1). Strings only. On screen it uses Forge's card styles; printed, css/report.css
// turns it into black-and-white pages. Every section is skipped when the summary has nothing for it.
// reportModel() is the same content as plain data, which the iPhone-app PDF (health/pdf.js) draws from.
import { esc } from '../ui.js';
import { daysBetween } from '../weight/smoothing.js';
import { weightToDisplay, weightUnit } from '../units.js';
import { fmtClock } from '../missions/core.js';
import {
  RANGES, RANGE_LABEL, notMedical, SCORE_NOTE, EXPLAIN, fmtKgBoth, fmtKgChange, fmtHeightBoth, fmtDur, dateText,
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
  const L = 58; const R = 6; const T = 8; const B = 20;
  const t0 = points[0].day;
  const span = Math.max(1, daysBetween(t0, points[points.length - 1].day));
  const x = (p) => L + (daysBetween(t0, p.day) / span) * (width - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (height - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(weightToDisplay(p.v, units)).toFixed(1)}`).join(' ');
  const u = weightUnit(units);
  return `<svg class="rp-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend weight from ${esc(dateText(t0))} to ${esc(dateText(points[points.length - 1].day))}, ${min.toFixed(1)} to ${max.toFixed(1)} ${u}">
    <line x1="${L}" y1="${T}" x2="${width - R}" y2="${T}" class="rp-grid"/><line x1="${L}" y1="${height - B}" x2="${width - R}" y2="${height - B}" class="rp-grid"/>
    <text x="${L - 4}" y="${T + 4}" text-anchor="end">${max.toFixed(1)} ${u}</text><text x="${L - 4}" y="${height - B + 4}" text-anchor="end">${min.toFixed(1)} ${u}</text>
    <text x="${L}" y="${height - 4}">${esc(dateText(t0))}</text><text x="${width - R}" y="${height - 4}" text-anchor="end">${esc(dateText(points[points.length - 1].day))}</text>
    <path d="${d}" class="rp-line"/></svg>`;
}

/** The chart's geometry as data (same scaling as the SVG): y values in 0..1 with 1 at the top, plus labels. */
export function weightChartData(points, units) {
  if (points.length < 2) return null;
  const vals = points.map((p) => weightToDisplay(p.v, units));
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1) { const mid = (max + min) / 2; min = mid - 0.5; max = mid + 0.5; }
  const t0 = points[0].day;
  const span = Math.max(1, daysBetween(t0, points[points.length - 1].day));
  const u = weightUnit(units);
  return {
    pts: points.map((p, i) => ({ x: daysBetween(t0, p.day) / span, y: (vals[i] - min) / (max - min) })),
    maxLabel: `${max.toFixed(1)} ${u}`, minLabel: `${min.toFixed(1)} ${u}`,
    fromLabel: dateText(t0), toLabel: dateText(points[points.length - 1].day),
  };
}

const row = (label, value, note = '') => ({ label, value, note });

function weightModel(w, units) {
  const rows = [];
  if (w.startKg != null && w.changeKg != null) {
    rows.push(row('Trend weight', `${fmtKgBoth(w.startKg, units)} → ${fmtKgBoth(w.endKg, units)}`));
    rows.push(row('Change', w.perWeekKg != null ? `${fmtKgChange(w.perWeekKg, units)} a week` : `${fmtKgChange(w.changeKg, units)} in ${w.spanDays} day${w.spanDays === 1 ? '' : 's'}`));
  } else if (w.endKg != null) rows.push(row('Trend weight', fmtKgBoth(w.endKg, units)));
  if (w.fatPct != null) rows.push(row('Body fat', `${w.fatPct.toFixed(1)} %`));
  if (w.fatFreeKg != null) rows.push(row('Fat-free mass', fmtKgBoth(w.fatFreeKg, units)));
  if (w.visceral != null) rows.push(row('Visceral fat index', String(round1(w.visceral))));
  if (w.ffmi != null) rows.push(row('FFMI', String(round1(w.ffmi)), w.ffmiBand ? `${w.ffmiBand.label} for height and sex` : ''));
  return { key: 'weight', title: 'Weight and body composition', rows, chart: w.points, explain: w.ffmi != null ? [EXPLAIN.ffmi] : [] };
}

function heartModel(h) {
  const rows = [];
  if (h.rhr) rows.push(row('Resting heart rate', `${Math.round(h.rhr.avg)} bpm average`, h.rhr.direction === 'flat' ? 'Steady' : h.rhr.direction ? (h.rhr.direction === 'up' ? 'Trending up' : 'Trending down') : 'Not enough readings for a trend'));
  if (h.hrv) rows.push(row('HRV', `${Math.round(h.hrv.avg)} ms average`, h.hrv.usual ? `Last 7 days ${Math.round(h.hrv.usual.now)} ms, usual ${Math.round(h.hrv.usual.usual)} ms` : ''));
  if (h.vo2max) rows.push(row('VO₂max', `${round1(h.vo2max.latest)} ml/kg/min`, h.vo2max.band ? `${h.vo2max.band} for age and sex (estimate)` : ''));
  if (h.walkingHr) rows.push(row('Walking heart rate', `${Math.round(h.walkingHr.avg)} bpm average`));
  if (h.spo2) rows.push(row('Blood oxygen (SpO₂)', `${round1(h.spo2.avg)} % average`));
  return { key: 'heart', title: 'Heart and fitness', rows, explain: [h.hrv ? EXPLAIN.hrv : '', h.vo2max ? EXPLAIN.vo2max : ''].filter(Boolean) };
}

function sleepModel(s) {
  const rows = [row('Average asleep', fmtDur(s.avgMin), `${s.nights} night${s.nights === 1 ? '' : 's'} recorded`), row('Nights under 6 h', `${Math.round(s.shortPct)} %`, `${s.shortNights} of ${s.nights}`)];
  if (s.bedtime) rows.push(row('Average bedtime', fmtClock(s.bedtime.avgMin), s.bedtime.spreadMin < 10 ? 'Very regular' : `Varies by about ${s.bedtime.spreadMin} min`));
  return { key: 'sleep', title: 'Sleep', rows, explain: [] };
}

function activityModel(a) {
  const rows = [];
  if (a.steps != null) rows.push(row('Steps', `${fmtInt(a.steps)} a day`));
  if (a.activeKcal != null) rows.push(row('Active energy', `${fmtInt(a.activeKcal)} kcal a day`));
  if (a.exerciseMin != null) rows.push(row('Exercise', `${Math.round(a.exerciseMin)} min a day`));
  if (a.workoutsPerWeek != null) rows.push(row('Strength workouts', `${round1(a.workoutsPerWeek)} a week`, `${a.sessions} session${a.sessions === 1 ? '' : 's'} in total`));
  if (a.cardioMinPerWeek != null) rows.push(row('Cardio', `${Math.round(a.cardioMinPerWeek)} min a week`));
  return { key: 'activity', title: 'Activity and training', rows, explain: [] };
}

function scoreModel(sc) {
  const rows = [row('Average Forge Score', String(Math.round(sc.avg)), `${sc.weeks} week${sc.weeks === 1 ? '' : 's'} of scores`), ...sc.pillars.map((p) => row(p.label, String(Math.round(p.avg))))];
  return { key: 'score', title: 'Forge Score', rows, explain: [SCORE_NOTE] };
}

const NOTES_EXPLAIN = 'These come from Forge’s automatic checks of the person’s own data. They are observations, not a diagnosis.';

/** The summary as plain data: the screen/print HTML and the iPhone-app PDF both draw from this. */
export function reportModel(s, units, generated) {
  const who = [s.header.age ? `Age ${s.header.age}` : null, s.header.sex ? s.header.sex[0].toUpperCase() + s.header.sex.slice(1) : null, fmtHeightBoth(s.header.heightCm, units) ? `Height ${fmtHeightBoth(s.header.heightCm, units)}` : null].filter(Boolean);
  const sections = [
    s.weight ? weightModel(s.weight, units) : null, s.heart ? heartModel(s.heart) : null, s.sleep ? sleepModel(s.sleep) : null,
    s.activity ? activityModel(s.activity) : null, s.score ? scoreModel(s.score) : null,
    s.notes.length ? { key: 'notes', title: 'Notes for the doctor', rows: [], bullets: s.notes, explain: [NOTES_EXPLAIN] } : null,
  ].filter(Boolean);
  return {
    title: 'Forge health summary',
    dates: `${dateText(s.from)} – ${dateText(s.to)}`,
    rangeLabel: RANGE_LABEL[s.range],
    generated: `Generated ${dateText(generated || s.to)}`,
    who: who.join(' · '),
    source: notMedical(s.sources),
    sections,
  };
}

const sectionHtml = (m, units) => {
  const list = m.bullets
    ? `<ul class="rp-notes">${m.bullets.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : `<ul class="rp-list">${m.rows.map((r) => `<li><span>${esc(r.label)}</span><b>${String(r.value).split(' → ').map((p) => `<span class="rp-nb">${esc(p)}</span>`).join(' → ')}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}</li>`).join('')}</ul>`;
  const chart = m.chart ? weightChartSvg(m.chart, units) : '';
  return `<section class="rp-sec card stack" data-rp="${m.key}"><h2>${esc(m.title)}</h2>${list}${chart}${m.explain.map((t) => `<p class="rp-explain">${esc(t)}</p>`).join('')}</section>`;
};

/** The whole page body (not the buttons or range switch, which are screen chrome). */
export function reportHtml(s, units, generated) {
  const m = reportModel(s, units, generated);
  const head = `<header class="rp-head card stack" data-rp="header">
    <h1>${esc(m.title)}</h1>
    <p class="rp-dates"><b>${esc(m.dates)}</b> (${esc(m.rangeLabel)})</p>
    <p class="muted">${esc(m.generated)}</p>
    ${m.who ? `<p>${esc(m.who)}</p>` : ''}
    <p class="muted">${esc(m.source)}</p></header>`;
  return head + m.sections.map((x) => sectionHtml(x, units)).join('');
}

export const rangeSegHtml = (range) => `<div class="seg small" role="radiogroup" aria-label="Date range">${RANGES.map((r) =>
  `<label><input type="radio" name="rprange" value="${r}" ${r === range ? 'checked' : ''}><span>${RANGE_LABEL[r]}</span></label>`).join('')}</div>`;
