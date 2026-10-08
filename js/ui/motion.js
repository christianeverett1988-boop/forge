// Motion system: one shared animation loop (sleeps when nothing is animating), count-ups, and
// View Transitions for screen changes. Tokens live in css/motion.css (--t-fast/med/slow, --ease-*).

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the single rAF loop ----------
const tasks = new Set();
let raf = 0;
/** Run fn(timeMs) every frame until it returns false. Returns a cancel function. */
export function onFrame(fn) {
  tasks.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => tasks.delete(fn);
}
function loop(t) {
  raf = 0;
  for (const fn of [...tasks]) {
    let keep;
    try { keep = fn(t); } catch (e) { console.error(e); keep = false; }
    if (keep === false) tasks.delete(fn);
  }
  if (tasks.size) raf = requestAnimationFrame(loop);
}

export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  spring: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
};

/** Animate a number in an element from 0 (or `from`) to `to`. */
export function countUp(el, to, { from = 0, dur = 900, format = (v) => Math.round(v).toLocaleString(), delay = 0 } = {}) {
  if (!el) return;
  if (reducedMotion() || dur <= 0) {
    el.textContent = format(to);
    return;
  }
  el.textContent = format(from);
  const start = performance.now() + delay;
  onFrame((t) => {
    if (!el.isConnected) return false;
    const p = Math.min(1, Math.max(0, (t - start) / dur));
    el.textContent = format(from + (to - from) * ease.out(p));
    return p < 1;
  });
}

/**
 * Run a DOM update as a View Transition when supported (Safari 18+), tagged with a direction so CSS can
 * slide tabs or push/pop detail screens. Falls back to an instant update. Reduced motion → crossfade (CSS).
 */
export function viewTransition(update, kind = 'fade') {
  if (!document.startViewTransition) {
    update();
    return Promise.resolve();
  }
  document.documentElement.dataset.vt = kind;
  const vt = document.startViewTransition(update);
  return vt.finished.catch(() => {}).finally(() => {
    delete document.documentElement.dataset.vt;
  });
}
