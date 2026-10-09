// Segmented controls with a sliding thumb. The CSS (css/app.css .seg[data-thumb]) positions one thumb from
// two custom properties: --n (how many segments) and --i (which one is chosen). Plain radios underneath, so
// keyboard, VoiceOver and form behaviour are untouched.

/** Thumb geometry as percentages of the track: where it starts and how wide it is. Pure, for tests. */
export function segThumb(index, count) {
  const n = Math.max(1, count | 0);
  const i = Math.min(Math.max(0, index | 0), n - 1);
  return { x: (i * 100) / n, w: 100 / n, i, n };
}

/** Give every single-row .seg inside root the sliding thumb and keep it in step with the checked radio. */
export function enhanceSegs(root = document) {
  root.querySelectorAll('.seg:not(.wrap)').forEach((seg) => {
    const radios = [...seg.querySelectorAll('input[type=radio]')];
    if (radios.length < 2 || seg.dataset.thumb) return;
    const sync = () => {
      const { i, n } = segThumb(Math.max(0, radios.findIndex((r) => r.checked)), radios.length);
      seg.style.setProperty('--n', String(n));
      seg.style.setProperty('--i', String(i));
    };
    seg.addEventListener('change', sync);
    sync();
    seg.dataset.thumb = '1';
  });
}
