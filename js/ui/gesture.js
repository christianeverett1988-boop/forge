// Pure maths for drag gestures (sheet drag-to-dismiss, edge swipe-back). No DOM, so it's unit-tested.

/** Speed in px/ms from recent samples [{t, v}] (v = y or x), using only the last `windowMs`. */
export function velocityOf(samples, windowMs = 100) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) {
    if (last.t - s.t <= windowMs) { first = s; break; }
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.v - first.v) / dt : 0;
}

/**
 * After letting go of a sheet: close it when it was dragged past 35% of its height, or flicked down fast.
 * A hard flick up always keeps it open. `offset` and `velocity` point down (positive = towards closing).
 */
export function shouldDismiss({ offset, velocity, size, fraction = 0.35, flick = 0.5 }) {
  if (velocity < -flick) return false;
  if (velocity > flick && offset > 8) return true;
  return offset > size * fraction;
}

/** Dragging past the top (negative) gets stiffer the further you pull, like iOS; down is 1:1. */
export function rubberBand(offset, limit = 80) {
  if (offset >= 0) return offset;
  const pull = -offset;
  return -(limit * (1 - 1 / (pull / limit + 1)));
}

/** 0..1 for how far a sheet has been dragged down, for fading the backdrop. */
export const dragProgress = (offset, size) => (size > 0 ? Math.min(1, Math.max(0, offset / size)) : 0);

/** Edge swipe-back: go back when dragged past 40% of the width or flicked right. */
export function shouldPop({ dx, velocity, width }) {
  if (dx <= 0) return false;
  return velocity > 0.5 || dx > width * 0.4;
}
