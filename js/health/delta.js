// Change text for the weekly report and metric screens. A change that rounds to nothing at the shown precision
// is "same" (no sign, no colour), so we never print "−0" or "+0.0". Pure.

/** { same, sign (−1 | 0 | 1), text } for a change; null when there is no number. text is '+1.5 lb', '−3 ms', or 'same'. */
export function fmtDelta(v, { digits = 0, unit = '' } = {}) {
  if (v == null || !Number.isFinite(v)) return null;
  const shown = Number(Math.abs(v).toFixed(digits));
  if (shown === 0) return { same: true, sign: 0, text: 'same' };
  const sign = v > 0 ? 1 : -1;
  return { same: false, sign, text: `${sign > 0 ? '+' : '−'}${shown.toFixed(digits)}${unit ? ` ${unit}` : ''}` };
}
