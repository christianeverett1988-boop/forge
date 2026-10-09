// App boot: service worker, sign-in, live data, and a tiny hash router.
import { configured } from './firebase.js';
import { state, subscribe, LOADED_KEYS } from './state.js';
import { esc, toast } from './ui.js';
import { APP_NAME } from '../config.js';
import { stopRest, restRemaining } from './timer.js';
import { viewTransition, animateCounters, resetCounters, reducedMotion } from './ui/motion.js';
import { loadPhotoIndex } from './ui/photos.js';
import { navBar, hideNavBar, screenNav } from './ui/navbar.js';
import { hapticTabs, hapticSegments } from './ui/haptic.js';
import { enhanceSegs } from './ui/controls.js';
import { attachPull, detachPull } from './ui/pull.js';
import { call } from './functions.js';
import { attachSwipeBack } from './ui/swipeback.js';
import { skeletonHTML } from './ui/skeleton.js';
import { tabOf, routeDepth, transitionKind, backTarget, backLabel, TITLE_FOR, createScrollMemory } from './nav.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const syncPill = document.getElementById('sync');
const offlineBanner = document.getElementById('offline');
const scrollMemory = createScrollMemory();

// ---------- service worker + "new version" banner ----------
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Reload on controller change only if a service worker already controlled this page (a real update)
  // or you tapped the banner. The very first install also fires controllerchange (clients.claim), and
  // reloading then would just flash the page for no reason.
  const hadController = !!navigator.serviceWorker.controller;
  let userAccepted = false;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (!reg) return;
    const showBanner = (worker) => {
      const bar = document.getElementById('update');
      bar.hidden = false;
      bar.onclick = () => {
        userAccepted = true;
        worker.postMessage('SKIP_WAITING');
      };
    };
    if (reg.waiting && navigator.serviceWorker.controller) showBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showBanner(w);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('Service worker not registered:', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !(hadController || userAccepted)) return;
    reloading = true;
    location.reload();
  });
}

// ---------- sync status (inline in the nav bar, only when it isn't "Synced") ----------
let offlineTimer = 0;
function renderSync() {
  const labels = { saving: 'Saving…', offline: 'Offline' };
  const label = labels[state.sync] || '';
  syncPill.className = `nb-status ${state.sync}`;
  syncPill.textContent = label;
  syncPill.hidden = !state.user || !label;
  // Offline for more than a few seconds: say what that means.
  if (state.sync === 'offline') {
    if (!offlineTimer) offlineTimer = setTimeout(() => { offlineBanner.hidden = false; }, 4000);
  } else {
    clearTimeout(offlineTimer);
    offlineTimer = 0;
    offlineBanner.hidden = true;
  }
}

// ---------- routing ----------
const routes = {
  today: () => import('./screens/today.js').then((m) => m.renderToday(main)),
  train: () => import('./screens/train.js').then((m) => m.renderTrain(main)),
  session: () => import('./screens/session.js').then((m) => m.renderSession(main)),
  play: () => import('./screens/player.js').then((m) => m.renderPlayer(main)),
  summary: (id) => import('./screens/summary.js').then((m) => m.renderSummary(main, decodeURIComponent(id || ''))),
  body: () => import('./screens/body.js').then((m) => m.renderBody(main)),
  progress: () => import('./screens/progress.js').then((m) => { location.replace(`#/${m.lastProgressRoute()}`); }),
  timer: () => import('./screens/timer.js').then((m) => m.renderTimer(main)),
  history: () => import('./screens/history.js').then((m) => m.renderHistory(main)),
  library: () => import('./screens/library.js').then((m) => m.renderLibrary(main)),
  weight: () => import('./screens/weight.js').then((m) => m.renderWeight(main)),
  awards: () => import('./screens/awards.js').then((m) => m.renderAwards(main)),
  settings: () => import('./screens/settings.js').then((m) => m.renderSettings(main)),
  locations: () => import('./screens/locations.js').then((m) => m.renderLocations(main)),
  apple: () => import('./screens/apple.js').then((m) => m.renderApple(main)),
  score: () => import('./screens/score.js').then((m) => m.renderScore(main)),
  withings: (sub) => import('./screens/withings.js').then((m) => m.renderWithings(main, sub)),
  metric: (key) => import('./screens/metric.js').then((m) => m.renderMetric(main, decodeURIComponent(key || 'weight_kg'))),
  profile: () => import('./screens/onboarding.js').then((m) => m.renderOnboarding(main, { editing: true })),
};
// Screens that fill the whole screen (no tab bar, no nav bar).
const FULLSCREEN = new Set(['play', 'summary', 'profile']);

const routeParts = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'today').split('/');
const currentRoute = () => routeParts()[0];
const allLoaded = () => LOADED_KEYS.every((k) => state.loaded[k]);

let pendingRender = false;
let lastRoute = null;
let skeletonFor = null;
const seenBefore = () => { try { return localStorage.getItem('forge.seen') === '1'; } catch { return false; } };
const markSeen = (on) => { try { if (on) localStorage.setItem('forge.seen', '1'); else localStorage.removeItem('forge.seen'); } catch { /* private mode */ } };

function loadErrorMessage(err) {
  const code = (err && err.code) || '';
  if (code.includes('permission-denied')) {
    return 'Can’t read your data: the database said “permission denied”. Did you publish the security rules (SETUP step 5)? If you just updated the app, publish the new firestore.rules too (DEPLOY.md).';
  }
  if (code.includes('unavailable')) return 'Can’t reach the database right now. Check your connection and try again.';
  return `Can’t read your data (${esc(code || (err && err.message) || 'unknown error')}).`;
}

async function render() {
  // Don't redraw under your fingers: if you're typing in the page, wait until you leave the field.
  const a = document.activeElement;
  if (a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'radio' && a.type !== 'checkbox') {
    pendingRender = true;
    return;
  }
  pendingRender = false;
  renderSync();

  if (!configured) {
    nav.hidden = true;
    hideNavBar();
    main.innerHTML = `<section class="card stack"><h1>Almost there</h1>
      <p>Paste your Firebase settings into <code>config.js</code> (see SETUP.md, step 3), then reload.</p></section>`;
    return;
  }
  if (state.user && state.loadError) {
    nav.hidden = true;
    hideNavBar();
    main.innerHTML = `<section class="card stack"><h1>Something’s blocking your data</h1>
      <p>${loadErrorMessage(state.loadError)}</p>
      <button class="btn" data-retry>Try again</button></section>`;
    main.querySelector('[data-retry]').onclick = () => location.reload();
    return;
  }
  if (state.user === undefined || (state.user && !allLoaded())) {
    // A skeleton of the screen that's about to appear, never a spinner. Tab bar shows if you've been here before.
    nav.hidden = !seenBefore() || FULLSCREEN.has(currentRoute());
    hideNavBar();
    if (skeletonFor !== currentRoute()) {
      skeletonFor = currentRoute();
      main.innerHTML = skeletonHTML(currentRoute());
    }
    return;
  }
  skeletonFor = null;
  if (!state.user) {
    markSeen(false);
    nav.hidden = true;
    hideNavBar();
    const m = await import('./screens/auth.js');
    m.renderAuth(main);
    return;
  }
  if (!state.profile) {
    nav.hidden = true;
    hideNavBar();
    const m = await import('./screens/onboarding.js');
    m.renderOnboarding(main, { editing: false });
    return;
  }

  const route = routes[currentRoute()] ? currentRoute() : 'today';
  // The rest timer belongs to a running workout; never let it outlive one.
  if (restRemaining() > 0 && !state.workouts.some((w) => w.status === 'active' && !w.deleted)) stopRest();
  if (lastRoute === 'session' && route !== 'session') import('./screens/session.js').then((m) => m.leaveSession());
  if (lastRoute === 'play' && route !== 'play') import('./screens/player.js').then((m) => m.leavePlayer());
  if (lastRoute === 'summary' && route !== 'summary') import('./ui/fx.js').then((m) => m.clearParticles());
  if (lastRoute !== route) screenNav(null); // sub-view nav (e.g. a Locations editor) never outlives its screen
  lastRoute = route;
  const tab = tabOf(route);
  nav.hidden = FULLSCREEN.has(route);
  document.body.classList.toggle('fullscreen', FULLSCREEN.has(route));
  nav.querySelectorAll('a').forEach((link) => {
    const target = link.getAttribute('href').slice(2);
    link.classList.toggle('active', target === tab);
    link.setAttribute('aria-current', target === tab ? 'page' : 'false');
  });
  try {
    await routes[route](...routeParts().slice(1));
    markSeen(true);
    if (FULLSCREEN.has(route)) hideNavBar();
    else navBar({ title: TITLE_FOR[route], back: backTarget(routeParts()), backLabel: backLabel(routeParts()) });
    hapticTabs(nav, onTab);
    enhanceSegs(main);
    syncPull(route);
    hapticSegments(main);
    animateCounters(main);
    // A brand-new account sees the how-to tour once, on Today, right after onboarding.
    if (route === 'today' && state.profile.tour === 'pending') import('./tour/tour.js').then((m) => m.maybeStartTour());
  } catch (e) {
    console.error(e);
    hideNavBar();
    detachPull();
    main.innerHTML = `<section class="card"><h1>Something broke</h1><p class="muted">${esc(e.message)}</p></section>`;
  }
}

main.addEventListener('focusout', () => {
  setTimeout(() => {
    if (pendingRender) render();
  }, 0);
});

// Re-render when data changes, but not for sync-status-only updates. While a workout is open (player or
// list view), its own saves come back through the listener: skip those so animations aren't cut off.
// First run after the badges update: save the badges you already have, quietly (no celebrations), before
// any summary can show. Loaded lazily; it's a no-op once settings/main.awards_seen exists.
let awardsSeeded = false;
function seedAwards() {
  if (awardsSeeded || !allLoaded() || !state.settings || state.settings.awards_seen) return;
  awardsSeeded = true;
  import('./workouts/awards-store.js').then((m) => m.syncBadges());
}

subscribe((patch) => {
  seedAwards();
  const keys = Object.keys(patch);
  // Withings finished a history import while weight.csv rows are in Forge: drop the duplicate csv copies.
  if (('weights' in patch || 'integrations' in patch) && allLoaded()) import('./withings/dedupe.js').then((m) => m.dedupeCsv());
  if (keys.length === 1 && keys[0] === 'sync') return renderSync();
  const route = currentRoute();
  const onlyWorkouts = keys.every((k) => k === 'workouts' || k === 'loaded' || k === 'sync');
  if ((route === 'play' || route === 'session') && onlyWorkouts && state.workouts.some((w) => w.status === 'active' && !w.deleted)) return;
  render();
});

// ---------- pull to refresh (Today, Progress, Body) ----------
const PULL_ROUTES = new Set(['today', 'weight', 'history', 'awards', 'score', 'body']);
let pullRoute = null;
async function refreshData() {
  const w = state.integrations && state.integrations.withings;
  // Re-read the cache always; ask Withings for new weigh-ins only where that button already exists (Settings → Withings).
  if (w && w.connected && !w.needs_reconnect && navigator.onLine) {
    try { await call('withingsSyncNow', {}, { timeout: 130000 }); } catch (e) { toast(e.message); }
  }
  resetCounters();
  await render();
}
function syncPull(route) {
  if (!PULL_ROUTES.has(route)) {
    detachPull();
    pullRoute = null;
  } else if (pullRoute !== route) {
    attachPull(refreshData);
    pullRoute = route;
  }
}

// ---------- screen changes ----------
let prevParts = routeParts();
let snapshot = null; // { route, html, scroll } of the parent screen, for the swipe-back parallax
let swipePop = null; // set while an edge swipe is finishing: the screen already slid away, so don't animate again

function afterRoute(parts) {
  const route = parts[0] || 'today';
  window.scrollTo(0, scrollMemory.restore(route)); // tab roots remember where you were; detail screens start at the top
}

window.addEventListener('hashchange', async () => {
  const from = prevParts;
  const to = routeParts();
  prevParts = to;
  scrollMemory.save(from[0] || 'today', window.scrollY);
  if (from[0] !== to[0] || from[1] !== to[1]) resetCounters();
  if (swipePop) {
    const done = swipePop;
    swipePop = null;
    await render();
    afterRoute(to);
    done();
    return;
  }
  const kind = transitionKind(from, to);
  // Keep the screen we are leaving (one level) so a swipe back can show it sliding in behind.
  if (kind === 'push') snapshot = { route: from.join('/'), html: main.innerHTML, scroll: window.scrollY };
  viewTransition(async () => {
    await render();
    afterRoute(to);
  }, reducedMotion() ? 'fade' : kind);
});

// Tapping a tab: switch to it; tapping the tab you're on scrolls to the top, or pops a detail screen back to its root.
function onTab(link) {
  const href = link.getAttribute('href');
  const target = href.slice(2);
  if (target === tabOf(currentRoute())) {
    if (routeDepth(routeParts()) === 0) {
      scrollMemory.forget(currentRoute());
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    scrollMemory.forget(target);
  }
  location.hash = href;
}
nav.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || e.target.classList.contains('haptic-input')) return;
  e.preventDefault();
  onTab(a);
});

attachSwipeBack({
  el: main,
  canSwipe: () => routeDepth(routeParts()) > 0 && !FULLSCREEN.has(currentRoute()),
  getSnapshot: () => (snapshot && `#/${snapshot.route}` === backTarget(routeParts()) ? snapshot : null),
  onPop: ({ crossfade = false } = {}) => new Promise((resolve) => {
    // Reduced motion: nothing slid away, so let the normal route change crossfade.
    if (!crossfade) swipePop = resolve;
    else resolve();
    location.hash = backTarget(routeParts());
  }),
});
window.addEventListener('forge:error', (e) => toast(e.detail, 4000));

// ---------- boot ----------
const WATCH = [
  ['profile', (rows) => ({ profile: rows.find((r) => r.id === 'main') || null })],
  ['settings', (rows) => ({ settings: rows.find((r) => r.id === 'main') || null })],
  ['locations', (rows) => {
    migrateInventory(rows);
    return { locations: rows };
  }],
  ['weights', (rows) => ({ weights: rows })],
  ['workouts', (rows) => ({ workouts: rows })],
  ['cardio_sessions', (rows) => ({ cardio: rows }), 'cardio'],
  ['programs', (rows) => ({ programs: rows })],
  ['exercises', (rows) => ({ exercises: rows })],
];
// Server-written (Withings, Apple Health). Not part of "loaded": if they fail (rules not published yet,
// functions not deployed) the app still opens; the Withings screen explains.
const WATCH_SERVER = [
  ['body_measures', (rows) => ({ body_measures: rows })],
  ['health_daily', (rows) => ({ health_daily: rows })],
  ['integrations', (rows) => ({ integrations: Object.fromEntries(rows.map((r) => [r.id || 'withings', r])) })],
];

// v0.1.x stored weight inventory in pounds (dumbbells_lb); v0.2.0 stores kg like everything else.
let dbModule = null;
function migrateInventory(rows) {
  if (!dbModule) return;
  for (const loc of rows) {
    const inv = loc.weight_inventory || {};
    if (!('dumbbells_lb' in inv) && !('kettlebells_lb' in inv)) continue;
    const kg = (list) => (list || []).map((lb) => Math.round(lb * 0.45359237 * 1000) / 1000);
    const next = { ...inv };
    if ('dumbbells_lb' in inv) {
      next.dumbbells_kg = next.dumbbells_kg || kg(inv.dumbbells_lb);
      delete next.dumbbells_lb;
    }
    if ('kettlebells_lb' in inv) {
      next.kettlebells_kg = next.kettlebells_kg || kg(inv.kettlebells_lb);
      delete next.kettlebells_lb;
    }
    loc.weight_inventory = next;
    dbModule.patch('locations', loc.id, { weight_inventory: next });
  }
}

async function boot() {
  // Which exercises have demo photos. If the index arrives after the player has drawn, redraw so the demo
  // box picks the photos up.
  loadPhotoIndex().then((ix) => {
    if (Object.keys(ix.ids).length && location.hash === '#/play') render();
  });
  document.title = APP_NAME;
  setupServiceWorker();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!configured) {
    render();
    return;
  }
  state.user = undefined; // "checking sign-in"
  render();

  const [{ onAuth }, db] = await Promise.all([import('./auth.js'), import('./db.js')]);
  dbModule = db;
  let unsubs = [];
  onAuth((user) => {
    unsubs.forEach((u) => u());
    unsubs = [];
    state.reset(user);
    if (!user) return;
    for (const [col, toPatch, key = col] of WATCH) {
      unsubs.push(db.watch(
        col,
        (rows) => state.set({ ...toPatch(rows), loaded: { ...state.loaded, [key]: true } }),
        (err) => state.set({ loadError: err })
      ));
    }
    const serverErr = {};
    const firstErr = () => Object.values(serverErr).find(Boolean) || null;
    for (const [col, toPatch] of WATCH_SERVER) {
      unsubs.push(db.watch(
        col,
        (rows) => { serverErr[col] = null; state.set({ ...toPatch(rows), serverError: firstErr() }); },
        (err) => { serverErr[col] = err.code || 'error'; state.set({ serverError: firstErr() }); }
      ));
    }
    db.updateSync();
  });
}

boot();
