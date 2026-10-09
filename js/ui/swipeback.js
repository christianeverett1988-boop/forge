// Edge swipe-back for detail screens: drag from the left 20px of the screen and the current screen follows your
// finger; let go past 40% of the width (or flick right) and it pops, otherwise it springs back.
import { shouldPop, velocityOf } from './gesture.js';
import { reducedMotion, EASE, DUR } from './motion.js';

const EDGE = 20;

/**
 * attachSwipeBack({ el, canSwipe, onPop })
 *  el        the element that moves (main)
 *  canSwipe  () => boolean, true on detail screens (never on the guided workout)
 *  onPop     () => void, called after the slide-out finishes; should navigate back without another animation
 */
export function attachSwipeBack({ el, canSwipe, onPop }) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let horizontal = false;
  let samples = [];

  const reset = () => {
    tracking = false;
    horizontal = false;
    samples = [];
  };

  document.addEventListener('touchstart', (e) => {
    reset();
    if (e.touches.length !== 1 || !canSwipe() || document.querySelector('dialog[open]')) return;
    const t = e.touches[0];
    if (t.clientX > EDGE) return;
    tracking = true;
    startX = t.clientX;
    startY = t.clientY;
    dx = 0;
    samples = [{ t: e.timeStamp, v: t.clientX }];
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches[0];
    dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (!horizontal) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return reset(); // it's a scroll
      if (dx > 8) horizontal = true;
      else return;
    }
    e.preventDefault(); // we own the gesture now: stop the page scrolling
    samples.push({ t: e.timeStamp, v: t.clientX });
    el.style.transition = 'none';
    el.style.transform = `translateX(${Math.max(0, dx)}px)`;
    el.style.boxShadow = '-12px 0 32px rgba(0, 0, 0, .5)';
  }, { passive: false });

  const end = () => {
    if (!tracking) return;
    const moved = horizontal;
    const width = window.innerWidth;
    const pop = moved && shouldPop({ dx, velocity: velocityOf(samples), width });
    reset();
    if (!moved) return;
    const dur = reducedMotion() ? 0 : DUR.med;
    el.style.transition = `transform ${dur}ms ${EASE.spring}`;
    el.style.transform = pop ? `translateX(${width}px)` : 'translateX(0)';
    const clear = () => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.boxShadow = '';
    };
    // On a pop the old screen stays off to the right until the previous screen has been drawn.
    const done = () => (pop ? Promise.resolve(onPop()).finally(clear) : clear());
    if (dur) setTimeout(done, dur + 20);
    else done();
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
}
