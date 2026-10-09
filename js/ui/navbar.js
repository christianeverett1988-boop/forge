// Shared nav bar: a 34pt large title in the content that collapses into a compact 17pt title on a glass bar
// as it scrolls under (IntersectionObserver, so no scroll listeners), plus a ‹ Back button on detail screens.
// Screens keep writing a plain <h1>; the router calls navBar() after each render and the h1 becomes the
// large title. Buttons that sat beside the h1 (e.g. "+ Log weight") move into the large-title row.

let io = null;
let override = null;

/** A screen with its own sub-views sets {title, backLabel, onBack} so the bar follows the sub-view (null clears). */
export function screenNav(opts) {
  override = opts || null;
}
const bar = () => document.getElementById('navbar');

function hide() {
  if (io) io.disconnect();
  io = null;
  const el = bar();
  if (el) {
    el.hidden = true;
    el.classList.remove('collapsed');
  }
}
export const hideNavBar = hide;

/**
 * navBar({ title, back, actions, root })
 *  title    text for the large title and the compact bar (default: the screen's own h1)
 *  back     hash to go to from the ‹ Back button, or null on a tab root
 *  backLabel  parent's title shown beside the chevron (default "Back")
 *  onBack   callback instead of a hash, for sub-views drawn inside a route (a screenNav() override wins)
 *  actions  extra elements for the right of the large title
 *  root     the element holding the screen (default #main)
 */
export function navBar({ title, back = null, backLabel = null, onBack = null, actions = [], root = document.getElementById('main') } = {}) {
  const el = bar();
  if (!el || !root) return;
  if (override) {
    title = override.title || title;
    backLabel = override.backLabel || null;
    onBack = override.onBack || null;
  }
  if (io) io.disconnect();
  io = null;

  const host = root.firstElementChild;
  const existing = root.querySelector('.large-title');
  const h1 = root.querySelector('h1');
  const row = h1 && h1.parentElement !== host && h1.parentElement.parentElement === host && h1.parentElement.classList.contains('row') ? h1.parentElement : null;
  const inHeader = h1 && h1.parentElement.tagName === 'HEADER' && h1.parentElement.parentElement === host;
  const upgradable = h1 && host && (h1.parentElement === host || row || inHeader);

  let large = null;
  if (existing) {
    large = existing; // already upgraded: an in-screen call after the router's
    title = title || existing.querySelector('h1').textContent;
  } else if (upgradable) {
    const text = title || h1.textContent.trim();
    const moved = row ? [...row.children].filter((c) => c !== h1) : [];
    large = document.createElement('div');
    large.className = 'large-title';
    const newH1 = document.createElement('h1');
    newH1.textContent = text;
    large.appendChild(newH1);
    const acts = document.createElement('div');
    acts.className = 'lt-actions';
    [...moved, ...actions].forEach((a) => acts.appendChild(a));
    if (acts.children.length) large.appendChild(acts);
    if (inHeader) {
      h1.replaceWith(large); // keep the small line above it (Today's date)
    } else {
      (row || h1).remove();
      host.prepend(large);
    }
    title = text;
  }

  const back$ = el.querySelector('.nb-back');
  const hasBack = !!(back || onBack);
  back$.hidden = !hasBack;
  back$.onclick = onBack || (back ? () => { location.hash = back; } : null);
  back$.querySelector('span').textContent = backLabel || 'Back';
  back$.setAttribute('aria-label', backLabel ? `Back to ${backLabel}` : 'Back');
  el.querySelector('.nb-title').textContent = title || '';
  el.hidden = !(large || hasBack);
  // iOS-style: the title truncates first; if even that leaves it under ~110px, the back label drops to a bare chevron.
  back$.classList.remove('icon-only');
  const t$ = el.querySelector('.nb-title');
  if (hasBack && !el.hidden && t$.scrollWidth > t$.clientWidth && t$.clientWidth < 110) back$.classList.add('icon-only');
  el.classList.toggle('collapsed', !large && hasBack);

  if (large) {
    // Collapse once the large title has scrolled up under the bar.
    io = new IntersectionObserver(([entry]) => {
      el.classList.toggle('collapsed', !entry.isIntersecting);
    }, { rootMargin: `-${Math.max(0, el.offsetHeight - 6)}px 0px 0px 0px`, threshold: 0 });
    io.observe(large);
  }
}
