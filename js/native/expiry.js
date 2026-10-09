// When the iPhone app stops opening. A free Apple ID (Personal Team) signs the app for 7 days; "Refresh Forge.command"
// (docs/ios-setup.md) installs it again. The web layer can't read the embedded provisioning profile itself, so
// the build writes app-install.json into the app: { builtAt, expires? }. `expires` is the profile's ExpirationDate
// (read by Refresh Forge.command after signing); without it the expiry is install date + 7 days.
import { isNative } from './bridge.js';
import { VERSION } from '../version.js';

export const DAY_MS = 24 * 3600 * 1000;
export const SIGNED_FOR_MS = 7 * DAY_MS;
export const REMIND_EVERY_MS = 6 * 3600 * 1000;

const ms = (v) => {
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) && t > 0 ? t : null;
};

/** → ms since epoch when the app stops opening, or null if nothing is known. `info`: { expires, builtAt } (strings or ms). */
export function expiryFrom(info, firstSeen = null) {
  const i = info || {};
  const exp = ms(i.expires);
  if (exp) return exp;
  const from = ms(i.builtAt) || ms(firstSeen);
  return from ? from + SIGNED_FOR_MS : null;
}

/** Whole days left, rounded up (6 h left = 1 day; 0 only once it has expired). */
export function daysLeft(expiryMs, now = Date.now()) {
  if (expiryMs == null) return null;
  return Math.max(0, Math.ceil((expiryMs - now) / DAY_MS));
}

export function expiryLine(expiryMs, now = Date.now()) {
  const n = daysLeft(expiryMs, now);
  if (n == null) return '';
  if (expiryMs <= now) return 'App refresh: due now';
  return `App refresh: expires in ${n} day${n === 1 ? '' : 's'}`;
}

/** Today's gentle banner: from 1 day before the expiry on (and after it). */
export const refreshDue = (expiryMs, now = Date.now()) => expiryMs != null && expiryMs - now <= DAY_MS;

/** When to send the "day before" reminder (ms): 24 h before, moved to a sensible hour (8:00 to 20:00 local). null if past. */
export function reminderAt(expiryMs, now = Date.now()) {
  if (expiryMs == null) return null;
  const d = new Date(expiryMs - DAY_MS);
  if (d.getHours() < 8) d.setHours(8, 0, 0, 0);
  else if (d.getHours() >= 20) d.setHours(20, 0, 0, 0);
  return d.getTime() > now + 60000 ? d.getTime() : null;
}

export const BANNER_TEXT = 'Plug your iPhone into the Mac mini and double-click Refresh Forge.';

// ---------- loading (iPhone app only) ----------
const SEEN_KEY = 'forge.install.firstSeen';
let cached = null; // { expiry: ms|null }

/** Read app-install.json once. Falls back to "first time this build ran" + 7 days. Resolves null on the web. */
export async function loadExpiry() {
  if (!isNative()) return null;
  if (cached) return cached.expiry;
  let info = null;
  try {
    const r = await fetch('./app-install.json', { cache: 'no-store' });
    if (r.ok) info = await r.json();
  } catch { /* use the fallback */ }
  let seen = null;
  if (!info || !(ms(info.expires) || ms(info.builtAt))) {
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
      if (raw && raw.version === VERSION) seen = raw.at;
      else { seen = Date.now(); localStorage.setItem(SEEN_KEY, JSON.stringify({ version: VERSION, at: seen })); }
    } catch { seen = Date.now(); }
  }
  cached = { expiry: expiryFrom(info, seen) };
  return cached.expiry;
}
