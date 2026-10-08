// Tiny app-wide store. Screens read from `state` and re-render when it changes.
const listeners = new Set();

export const LOADED_KEYS = ['profile', 'settings', 'locations', 'weights', 'workouts', 'cardio', 'programs', 'exercises'];
const notLoaded = () => Object.fromEntries(LOADED_KEYS.map((k) => [k, false]));

export const state = {
  user: null,
  loaded: notLoaded(),
  loadError: null,
  profile: null,
  settings: null,
  locations: [],
  weights: [],
  workouts: [],
  cardio: [],
  programs: [],
  exercises: [], // custom exercises
  sync: navigator.onLine ? 'synced' : 'offline',

  set(patch) {
    Object.assign(this, patch);
    listeners.forEach((fn) => fn(patch));
  },

  reset(user) {
    this.set({
      user, loaded: notLoaded(), loadError: null, profile: null, settings: null,
      locations: [], weights: [], workouts: [], cardio: [], programs: [], exercises: [],
    });
  },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const units = () => (state.settings && state.settings.units) || 'imperial';
