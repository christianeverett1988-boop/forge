// A small SVG chart for body metrics: dots for readings, a 7-day rolling line, an optional dashed line for
// the previous period (shifted onto this one) and optional bars underneath (training sets per week).
// Same classes as the weight chart (grid, axis, dot, trend), so it themes the same. Pure markup.
import { daysBetween, addDays } from '../weight/smoothing.js';
import { formatDay } from '../ui.js';

/** Rolling mean over the previous `n` days for each point (by calendar day, not by count). */
export function rolling(points, n = 7) {
  return points.map((p) => {
    const from = addDays(p.day, -(n - 1));
    const xs = points.filter((q) => q.day >= from && q.day <= p.day).map((q) => q.v);
    return { day: p.day, v: xs.reduce((a, b) => a + b, 0) / xs.length };
  });
}

/**
 * points: [{ day, v }] in display units, oldest first. prev: same shape, already shifted onto this range.
 * bars: [{ day, value }] (any unit; drawn on their own scale along the bottom third).
 */
export function lineChartSVG(points, { prev = [], bars = [], fmt = (v) => v.toFixed(1), label = 'Chart', width = 340, height = 210, fromDay = null, toDay = null } = {}) {
  if (!points.length) return '';
  const start = fromDay || points[0].day;
  const end = toDay || points[points.length - 1].day;
  const vals = [...points.map((p) => p.v), ...prev.map((p) => p.v)];
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const pad = Math.max(Math.abs(max) * 0.01, (max - min) * 0.15, 0.1);
  min -= pad;
  max += pad;
  const L = 44, R = 10, T = 12, B = 26;
  const span = Math.max(1, daysBetween(start, end));
  const x = (day) => L + (daysBetween(start, day) / span) * (width - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (height - T - B);
  const ticks = [0, 1, 2, 3].map((i) => {
    const v = min + ((max - min) * i) / 3;
    return `<line x1="${L}" x2="${width - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="axis" text-anchor="end">${fmt(v)}</text>`;
  }).join('');
  const maxBar = Math.max(1, ...bars.map((b) => b.value));
  const barW = Math.max(3, ((width - L - R) / span) * 5);
  const barEls = bars.filter((b) => b.day >= start && b.day <= end).map((b) => {
    const h = (b.value / maxBar) * (height - T - B) * 0.33;
    return `<rect x="${(x(b.day) - barW / 2).toFixed(1)}" y="${(height - B - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" class="bar" rx="2"/>`;
  }).join('');
  const path = (ps) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const line = rolling(points);
  const dots = points.map((p) => `<circle cx="${x(p.day).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.4" class="dot"/>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="${label}">
    ${ticks}${barEls}
    ${prev.length > 1 ? `<path d="${path(rolling(prev))}" class="prev"/>` : ''}
    <path d="${path(line)}" class="trend"/>${dots}
    <text x="${L}" y="${height - 6}" class="axis">${formatDay(start)}</text>
    <text x="${width - R}" y="${height - 6}" class="axis" text-anchor="end">${formatDay(end)}</text>
  </svg>`;
}
