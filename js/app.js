// App boot: service worker, sign-in, live data, and a tiny hash router.
import { configured } from './firebase.js';
import { state, subscribe, LOADED_KEYS } from './state.js';
import { esc, toast } from './ui.js';
import { APP_NAME } from '../config.js';
import { stopRest, restRemaining } from './timer.js';
import { viewTransition } from './ui/motion.js';
import { loadPhotoIndex } from './ui/photos.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const syncPill = document.getElementById('sync');

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

// ---------- sync status pill ----------
function renderSync() {
  const labels = { synced: 'Synced', saving: 'Saving…', offline: 'Offline · saved on this phone' };
  syncPill.className = `sync ${state.sync}`;
  syncPill.textContent = labels[state.sync] || '';
  syncPill.hidden = !state.user;
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
  settings: () => import('./screens/settings.js').then((m) => m.renderSettings(main)),
  locations: () => import('./screens/locations.js').then((m) => m.renderLocations(main)),
  profile: () => import('./screens/onboarding.js').then((m) => m.renderOnboarding(main, { editing: true })),
};
// Which tab lights up for each screen.
const TAB_FOR = {
  session: 'train', play: 'train', summary: 'train', timer: 'train', library: 'train',
  history: 'weight', weight: 'weight', locations: 'settings', profile: 'settings',
};
// Screens that fill the whole screen (no tab bar).
const FULLSCREEN = new Set(['play', 'summary', 'profile']);
// For screen-change animations: tabs slide sideways, detail screens push in / pop out.
const TAB_ORDER = ['today', 'train', 'body', 'weight', 'settings'];
const DEPTH = { today: 0, train: 0, body: 0, weight: 0, history: 0, settings: 0 };

const routeParts = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'today').split('/');
const currentRoute = () => routeParts()[0];
const allLoaded = () => LOADED_KEYS.every((k) => state.loaded[k]);

let pendingRender = false;
let lastRoute = null;

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
    main.innerHTML = `<section class="card stack"><h1>Almost there</h1>
      <p>Paste your Firebase settings into <code>config.js</code> (see SETUP.md, step 3), then reload.</p></section>`;
    return;
  }
  if (state.user && state.loadError) {
    nav.hidden = true;
    main.innerHTML = `<section class="card stack"><h1>Something’s blocking your data</h1>
      <p>${loadErrorMessage(state.loadError)}</p>
      <button class="btn" data-retry>Try again</button></section>`;
    main.querySelector('[data-retry]').onclick = () => location.reload();
    return;
  }
  if (state.user === undefined || (state.user && !allLoaded())) {
    nav.hidden = true;
    main.innerHTML = '<div class="loading" aria-label="Loading"><span></span></div>';
    return;
  }
  if (!state.user) {
    nav.hidden = true;
    const m = await import('./screens/auth.js');
    m.renderAuth(main);
    return;
  }
  if (!state.profile) {
    nav.hidden = true;
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
  lastRoute = route;
  const tab = TAB_FOR[route] || route;
  nav.hidden = FULLSCREEN.has(route);
  document.body.classList.toggle('fullscreen', FULLSCREEN.has(route));
  nav.querySelectorAll('a').forEach((link) => {
    const target = link.getAttribute('href').slice(2);
    link.classList.toggle('active', target === tab);
    link.setAttribute('aria-current', target === tab ? 'page' : 'false');
  });
  try {
    await routes[route](...routeParts().slice(1));
  } catch (e) {
    console.error(e);
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
subscribe((patch) => {
  const keys = Object.keys(patch);
  if (keys.length === 1 && keys[0] === 'sync') return renderSync();
  const route = currentRoute();
  const onlyWorkouts = keys.every((k) => k === 'workouts' || k === 'loaded' || k === 'sync');
  if ((route === 'play' || route === 'session') && onlyWorkouts && state.workouts.some((w) => w.status === 'active' && !w.deleted)) return;
  render();
});

let prevRoute = currentRoute();
window.addEventListener('hashchange', () => {
  const to = currentRoute();
  const from = prevRoute;
  prevRoute = to;
  let kind = 'fade';
  const dFrom = DEPTH[from] ?? 1;
  const dTo = DEPTH[to] ?? 1;
  if (dTo > dFrom) kind = 'push';
  else if (dTo < dFrom) kind = 'pop';
  else if (dTo === 0) kind = TAB_ORDER.indexOf(TAB_FOR[to] || to) >= TAB_ORDER.indexOf(TAB_FOR[from] || from) ? 'tab-fwd' : 'tab-back';
  viewTransition(async () => {
    await render();
    window.scrollTo(0, 0);
  }, kind);
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
  loadPhotoIndex(); // which exercises have demo photos (none until the photo script has been run)
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
    db.updateSync();
  });
}

boot();
