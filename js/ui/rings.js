// Today rings: three concentric rings that fill on load, with a legend. A ring you close (Training or
// Weekly sets) gets a burst, once per week. Room is left in the legend grid for food rings (Checkpoint C).
import { reducedMotion } from './motion.js';
import { esc } from '../ui.js';
import { icon } from './icons.js';

const COLORS = { training: 'var(--ember)', sets: 'var(--accent-text)', recovery: 'var(--info)', calories: 'var(--warn)', protein: 'var(--text)' };
// Recovery and the two food rings never burst (going over on calories isn't a win).
const NO_BURST = new Set(['recovery', 'calories', 'protein']);
// Canvas confetti can't read CSS variables, so the burst keeps plain colours.
const BURST = { training: '#FF6A2B', sets: '#C6FF3D', recovery: '#3AD0FF' };
const SIZE = 132;
// Three rings are chunky; five (with the two food rings) get thinner so they fit the same circle.
const strokeFor = (n) => (n > 3 ? 9 : 13);
const gapFor = (n) => (n > 3 ? 2 : 3);
const radius = (i, n) => SIZE / 2 - strokeFor(n) / 2 - i * (strokeFor(n) + gapFor(n));

export function ringsHtml(rings) {
  const arcs = rings.map((r, i) => {
    const R = radius(i, rings.length);
    const sw = strokeFor(rings.length);
    const C = 2 * Math.PI * R;
    const v = Math.max(0, Math.min(1, r.value || 0));
    return `<circle class="ring-track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" style="stroke-width:${sw}px;stroke:${COLORS[r.key]}"/>
      <circle class="ring-arc${v >= 1 && !NO_BURST.has(r.key) ? ' ring-closed' : ''}" data-ring="${r.key}" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}"
        stroke-dasharray="${C.toFixed(1)}" style="stroke-width:${sw}px;color:${COLORS[r.key]};stroke:${COLORS[r.key]};--c:${C.toFixed(1)};--off:${(C * (1 - v)).toFixed(1)}"/>`;
  }).join('');
  const legend = rings.map((r) => `
    <li style="--rc:${COLORS[r.key]}"><span class="ring-dot" aria-hidden="true"></span>
      <span><b>${esc(r.label)}${r.value >= 1 && r.key !== 'calories' ? ` <span class="ring-done">${icon('check', { size: 14 })}</span>` : ''}</b><small class="muted">${esc(r.text)}</small></span></li>`).join('');
  const aria = rings.map((r) => `${r.label}: ${r.text}`).join('; ');
  return `<div class="rings" role="img" aria-label="${esc(aria)}">
    <svg class="rings-svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" aria-hidden="true"><g transform="rotate(-90 ${SIZE / 2} ${SIZE / 2})">${arcs}</g></svg>
    <ul class="rings-legend">${legend}</ul></div>`;
}

const SEEN = 'forge.rings';
function closedBefore(week) {
  try {
    const j = JSON.parse(localStorage.getItem(SEEN) || '{}');
    return j.week === week ? new Set(j.closed || []) : new Set();
  } catch { return new Set(); }
}
function remember(week, closed) {
  try { localStorage.setItem(SEEN, JSON.stringify({ week, closed: [...closed] })); } catch { /* private mode: celebrate again, no harm */ }
}

/** Animate the arcs from empty, then burst any earned ring closed for the first time this week. */
export function animateRings(root, rings, week) {
  const still = reducedMotion();
  if (!still) {
    root.classList.add('rings-pre');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('rings-pre')));
  }
  const seen = closedBefore(week);
  const fresh = rings.filter((r) => !NO_BURST.has(r.key) && r.value >= 1 && !seen.has(r.key));
  if (!fresh.length) return;
  setTimeout(() => {
    if (!root.isConnected) return; // re-rendered meanwhile: the new render celebrates instead
    fresh.forEach((r) => seen.add(r.key));
    remember(week, seen);
    const box = root.querySelector('.rings-svg').getBoundingClientRect();
    import('./fx.js').then(({ burst }) => fresh.forEach((r, k) => setTimeout(() => {
      burst(box.left + box.width / 2, box.top + box.height * 0.08, { count: still ? 0 : 46, colors: [BURST[r.key], '#FFFFFF'] });
    }, k * 350)));
  }, still ? 0 : 1100);
}
