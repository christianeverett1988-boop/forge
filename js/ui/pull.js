// Pull to refresh for Today, Progress and Body. The page itself never bounces (overscroll-behavior: none),
// so a finger pulling down at the very top drags a small indicator instead. Past the threshold it ticks;
// let go and it runs the refresh. Not attached on Settings, forms or the player.
import { reducedMotion } from './motion.js';
import { tick } from './haptic.js';
import { icon } from './icons.js';

export const PULL_THRESHOLD = 64; // px of indicator travel that arms a refresh
export const PULL_MAX = 110;

/** Finger travel (px) → indicator state. Resistance makes it feel elastic. Pure, for tests. */
export function pullState(dy) {
  const d = Math.max(0, dy);
  const offset = Math.min(PULL_MAX, d * 0.5);
  return { offset, progress: Math.min(1, offset / PULL_THRESHOLD), ready: offset >= PULL_THRESHOLD };
}

let teardown = null;

/** Attach to the current screen. `refresh()` returns a promise; routes without pull-to-refresh call detachPull(). */
export function attachPull(refresh) {
  detachPull();
  const el = document.createElement('div');
  el.className = 'ptr';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = icon('refresh');
  document.body.appendChild(el);

  let startY = 0;
  let active = false;
  let armed = false;
  let busy = false;
  const place = (offset, progress) => {
    el.style.setProperty('--ptr-y', `${offset}px`);
    el.style.setProperty('--ptr-p', String(progress));
  };
  const onStart = (e) => {
    if (busy || window.scrollY > 0 || document.querySelector('dialog[open], .ov')) return;
    startY = e.touches[0].clientY;
    active = true;
    armed = false;
  };
  const onMove = (e) => {
    if (!active) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { active = false; place(0, 0); return; }
    const s = pullState(dy);
    el.classList.add('pulling');
    place(s.offset, s.progress);
    if (s.ready && !armed) { armed = true; tick(); }
    if (!s.ready) armed = false;
  };
  const onEnd = async () => {
    if (!active) return;
    active = false;
    el.classList.remove('pulling');
    if (!armed) { place(0, 0); return; }
    busy = true;
    el.classList.add('busy');
    place(PULL_THRESHOLD * 0.8, 1);
    try { await refresh(); } catch (e) { console.error(e); }
    await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 350));
    el.classList.remove('busy');
    place(0, 0);
    busy = false;
  };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
  teardown = () => {
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
    el.remove();
  };
}

export function detachPull() {
  if (teardown) teardown();
  teardown = null;
}
