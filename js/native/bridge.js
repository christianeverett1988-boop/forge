// The native iPhone app (Capacitor shell, docs/native-ios.md) and the web app run the same code. Everything
// native goes through this file: in a browser every function here is a harmless no-op, so the web app is
// unchanged. Plugins are reached through the Capacitor runtime the shell injects (window.Capacitor), so the
// app still needs no build step or bundler.
//
// Plugins used (installed in the shell, see package.json): Haptics, LocalNotifications, StatusBar, Browser,
// and @capgo/capacitor-health (HealthKit; see js/native/health.js).

const cap = () => (typeof window !== 'undefined' && window.Capacitor) || null;

/** True inside the iPhone app, false in Safari or on the desktop. */
export const isNative = () => {
  const c = cap();
  try { return !!(c && (c.isNativePlatform ? c.isNativePlatform() : c.platform && c.platform !== 'web')); } catch { return false; }
};

/**
 * A native plugin by name, or null. Tries each name in turn (a plugin's registered name can differ from its
 * package name). Never throws.
 */
export function plugin(...names) {
  const c = cap();
  if (!c || !isNative()) return null;
  for (const n of names) {
    try {
      if (c.isPluginAvailable && !c.isPluginAvailable(n)) continue;
      if (c.Plugins && c.Plugins[n]) return c.Plugins[n];
      if (c.registerPlugin) return c.registerPlugin(n);
    } catch { /* try the next name */ }
  }
  return null;
}

const quiet = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };

// ---------- haptics (the Taptic Engine, not the iOS switch trick) ----------
const IMPACT = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
const NOTIFY = { success: 'SUCCESS', warning: 'WARNING', error: 'ERROR' };

/** kind: 'light' | 'medium' | 'heavy' (a tap), 'success' | 'warning' | 'error' (an outcome), 'select' (a picker tick). */
export function haptic(kind = 'light') {
  const H = plugin('Haptics');
  if (!H) return false;
  if (NOTIFY[kind]) quiet(H.notification({ type: NOTIFY[kind] }));
  else if (kind === 'select') quiet(H.selectionChanged ? H.selectionChanged() : H.impact({ style: 'LIGHT' }));
  else quiet(H.impact({ style: IMPACT[kind] || 'LIGHT' }));
  return true;
}

// ---------- the rest timer on the lock screen ----------
export const REST_NOTIFICATION_ID = 4101;
let scheduledEnd = null;
let asked = false;

async function notifications() {
  const N = plugin('LocalNotifications');
  if (!N) return null;
  if (!asked) {
    asked = true;
    try {
      const p = await N.checkPermissions();
      if (p && p.display !== 'granted') await N.requestPermissions();
    } catch { /* the rest timer still works in the app */ }
  }
  return N;
}

/**
 * Keep one "Rest's over" notification in step with the rest timer: scheduled for `endMs` (ms since epoch), or
 * cancelled when endMs is null (rest stopped, paused or over). Same end time → nothing to do.
 */
export async function syncRestNotification(endMs, { title = 'Rest’s over', body = 'Time for your next set.' } = {}) {
  if (!isNative()) return false;
  const end = Number.isFinite(endMs) && endMs > Date.now() + 2000 ? Math.round(endMs / 1000) * 1000 : null;
  if (end === scheduledEnd) return true;
  const N = await notifications();
  if (!N) return false;
  try {
    if (scheduledEnd != null) await N.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
    scheduledEnd = null;
    if (end != null) {
      await N.schedule({ notifications: [{ id: REST_NOTIFICATION_ID, title, body, schedule: { at: new Date(end), allowWhileIdle: true }, sound: 'default' }] });
      scheduledEnd = end;
    }
    return true;
  } catch {
    return false;
  }
}

// ---------- links that leave the app (Withings sign-in) ----------
/** Open a web page over the app (Safari view): you come straight back when you close it. False on the web. */
export function openExternal(url) {
  const B = plugin('Browser');
  if (!B) return false;
  quiet(B.open({ url, presentationStyle: 'popover' }));
  return true;
}

// ---------- status bar ----------
/** Light text on the dark theme, dark text on the light one. */
export function syncStatusBar(dark) {
  const S = plugin('StatusBar');
  if (!S) return false;
  quiet(S.setStyle({ style: dark ? 'DARK' : 'LIGHT' }));
  return true;
}
