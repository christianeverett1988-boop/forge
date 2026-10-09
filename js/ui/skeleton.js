// Skeleton screens: the shape of the page that's about to appear, shown while data loads (never a spinner).
// Pure strings, so they can be dropped straight into main.innerHTML.

const bar = (cls = '') => `<div class="skeleton ${cls}"></div>`;

const SHAPES = {
  today: [bar('sk-title'), bar('sk-card tall'), bar('sk-card short'), bar('sk-card')],
  train: [bar('sk-title'), bar('sk-card'), bar('sk-card short'), bar('sk-row'), bar('sk-row'), bar('sk-row')],
  progress: [bar('sk-title'), bar('sk-row'), bar('sk-card tall'), bar('sk-row'), bar('sk-row')],
  body: [bar('sk-title'), bar('sk-card'), bar('sk-card tall'), bar('sk-card short')],
  list: [bar('sk-title'), bar('sk-row'), bar('sk-row'), bar('sk-row'), bar('sk-row')],
};
const KIND = { today: 'today', train: 'train', weight: 'progress', history: 'progress', awards: 'progress', score: 'progress', body: 'body', metric: 'body', withings: 'list', settings: 'list' };

export const skeletonKind = (route) => KIND[route] || 'today';

/** Skeleton markup for a route name (e.g. 'today', 'weight', 'withings'). */
export function skeletonHTML(route) {
  return `<div class="skel-screen" aria-label="Loading" role="status">${SHAPES[skeletonKind(route)].join('')}</div>`;
}
