// Start/end demo photos (free-exercise-db, public domain), stored in media/ex/<id>/0.jpg and 1.jpg by
// scripts/fetch-demo-photos.mjs. Shown as the "Photos" view in the How-To sheet and as the demo for
// exercises without a silhouette. Offline: today's photos are cached when a workout starts, any photo is
// cached the first time it's shown, and Settings can download them all. Never precached in the app shell.
export const MEDIA_CACHE = 'media-ex-v1'; // keep in sync with sw.js

let index = null;
let loading = null;

/** Load media/ex/index.json once (missing before the photo script has been run: then there are no photos). */
export function loadPhotoIndex() {
  if (index) return Promise.resolve(index);
  if (!loading) {
    loading = fetch('media/ex/index.json')
      .then((r) => (r.ok ? r.json() : { ids: {} }))
      .catch(() => ({ ids: {} }))
      .then((j) => (index = { ids: j.ids || {} }));
  }
  return loading;
}

export const hasPhotos = (id) => !!(index && index.ids[id]);
export const photoUrls = (id) => [`media/ex/${id}/0.jpg`, `media/ex/${id}/1.jpg`];

/** Two frames crossfading (~1.6 s a cycle) with a slight scale. */
export function photoLoop(id, alt = '') {
  const [a, b] = photoUrls(id);
  return `<div class="photo-loop" role="img" aria-label="${alt ? `${alt}: start and end position` : 'Start and end position'}">
    <img src="${a}" alt="" decoding="async"><img src="${b}" alt="" decoding="async" class="pl-b"></div>`;
}

/** Cache some exercises' photos for offline use (best effort). */
export async function cachePhotos(ids) {
  await loadPhotoIndex();
  if (!('caches' in window)) return 0;
  const urls = ids.filter(hasPhotos).flatMap(photoUrls);
  if (!urls.length) return 0;
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const missing = urls.filter((u) => !have.has(new URL(u, location.href).pathname));
    await Promise.all(missing.map((u) => cache.add(u).catch(() => {})));
    return missing.length;
  } catch {
    return 0;
  }
}

/** Sizes for the Settings card: how many exercises have photos, how many are saved, total MB. */
export async function photoStatus() {
  await loadPhotoIndex();
  const ids = Object.keys(index.ids);
  const bytes = Object.values(index.ids).reduce((a, b) => a + b, 0);
  let saved = 0;
  if ('caches' in window && ids.length) {
    try {
      const cache = await caches.open(MEDIA_CACHE);
      const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname.split('/').slice(-2, -1)[0]));
      saved = ids.filter((id) => have.has(id)).length;
    } catch { /* ignore */ }
  }
  return { total: ids.length, saved, mb: bytes / 1048576 };
}

/** Download every photo, reporting progress (done, total). */
export async function downloadAllPhotos(onProgress = () => {}) {
  await loadPhotoIndex();
  const ids = Object.keys(index.ids);
  let done = 0;
  for (let i = 0; i < ids.length; i += 8) {
    await cachePhotos(ids.slice(i, i + 8));
    done = Math.min(ids.length, i + 8);
    onProgress(done, ids.length);
  }
  return done;
}
