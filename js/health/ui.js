// Shared bits for the score rings (Today card, Score screen). The ring fills from empty unless reduced motion is on.
import { reducedMotion } from '../ui/motion.js';

/** Colour for a 0–100 value: green when strong, lime when good, amber when middling, orange when low. */
export const scoreColor = (v) => (v == null ? '#4a525c' : v >= 80 ? '#6ee7a8' : v >= 60 ? '#c6ff3d' : v >= 40 ? '#ffc857' : '#ff7a45');

/** A ring as SVG. value 0–100 (or null for an empty ring). */
export function ringSvg(value, { size = 100, stroke = 10 } = {}) {
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><g transform="rotate(-90 ${size / 2} ${size / 2})">
    <circle class="sc-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="sc-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="${scoreColor(value)}"
      stroke-dasharray="${c.toFixed(1)}" style="--c:${c.toFixed(1)};--off:${(c * (1 - v)).toFixed(1)}"/></g></svg>`;
}

/** Fill the rings under `root` from empty (skipped with reduced motion). */
export function animateScoreRings(root) {
  if (reducedMotion()) return;
  root.classList.add('sc-pre');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('sc-pre')));
}

export const round = (x) => Math.round(x);
