// Today rings: three concentric rings that fill on load, with a legend. A ring you close (Training or
// Weekly sets) gets a burst, once per week. Room is left in the legend grid for food rings (Checkpoint C).
import { reducedMotion } from './motion.js';
import { esc } from '../ui.js';

const COLORS = { training: '#FF6A2B', sets: '#C6FF3D', recovery: '#3AD0FF' };
const SIZE = 132;
const STROKE = 13;
const GAP = 3;
const radius = (i) => SIZE / 2 - STROKE / 2 - i * (STROKE + GAP);

export function ringsHtml(rings) {
  const arcs = rings.map((r, i) => {
    const R = radius(i);
    const C = 2 * Math.PI * R;
    const v = Math.max(0, Math.min(1, r.value || 0));
    return `<circle class="ring-track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" stroke="${COLORS[r.key]}"/>
      <circle class="ring-arc${v >= 1 && r.key !== 'recovery' ? ' ring-closed' : ''}" data-ring="${r.key}" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" stroke="${COLORS[r.key]}"
        stroke-dasharray="${C.toFixed(1)}" style="color:${COLORS[r.key]};--c:${C.toFixed(1)};--off:${(C * (1 - v)).toFixed(1)}"/>`;
  }).join('');
  const legend = rings.map((r) => `
    <li style="--rc:${COLORS[r.key]}"><span class="ring-dot" aria-hidden="true"></span>
      <span><b>${esc(r.label)}${r.value >= 1 ? ' <span class="ring-done">✓</span>' : ''}</b><small class="muted">${esc(r.text)}</small></span></li>`).join('');
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
  const fresh = rings.filter((r) => r.key !== 'recovery' && r.value >= 1 && !seen.has(r.key));
  if (!fresh.length) return;
  setTimeout(() => {
    if (!root.isConnected) return; // re-rendered meanwhile: the new render celebrates instead
    fresh.forEach((r) => seen.add(r.key));
    remember(week, seen);
    const box = root.querySelector('.rings-svg').getBoundingClientRect();
    import('./fx.js').then(({ burst }) => fresh.forEach((r, k) => setTimeout(() => {
      burst(box.left + box.width / 2, box.top + box.height * 0.08, { count: still ? 0 : 46, colors: [COLORS[r.key], '#FFFFFF'] });
    }, k * 350)));
  }, still ? 0 : 1100);
}
