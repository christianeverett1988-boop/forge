// iOS Text Size (Dynamic Type) support. WebKit resolves `font: -apple-system-body` to the size you picked in
// Settings → Display & Brightness → Text Size (17 px at the default). Every font size and line height in the
// stylesheets is `calc(Npx * var(--ts))`, so setting --ts rescales all text at once. Capped so layouts stay intact.
export const BASE_BODY_PX = 17;
export const MAX_TEXT_SCALE = 1.35;

/** The text scale for a measured body size in px: never below 1, never above the cap, 2 decimals. */
export function textScaleFor(bodyPx) {
  const n = Number(bodyPx);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(Math.min(MAX_TEXT_SCALE, Math.max(1, n / BASE_BODY_PX)) * 100) / 100;
}

function measure() {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;font:-apple-system-body;';
  probe.textContent = 'A';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return px;
}

/** Apply the current Text Size now, and again whenever the app comes back to the front. */
export function setupTextSize() {
  const apply = () => {
    if (!document.body) return;
    // Browsers without -apple-system-body fall back to 16 px, which is below the 17 px base, so the scale stays 1.
    document.documentElement.style.setProperty('--ts', String(textScaleFor(measure())));
  };
  apply();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') apply(); });
  window.addEventListener('resize', apply);
}
