// Cards that sit on other screens: the Body tab's "Progress photos" card and the Today weekly reminder.
// They fill themselves in after the screen draws, because reading photos from this phone is asynchronous.
import { esc, formatDay, todayKey } from '../ui.js';
import { icon } from '../ui/icons.js';
import { state } from '../state.js';
import { mySessions } from './access.js';
import { photoUrl } from './metrics.js';
import { POSES, reminderDue, weekStart, DOW_NAMES } from './core.js';

/** Shown instead of nothing when this phone's photo storage can't be opened (private browsing, storage blocked). */
export const photosUnavailableHtml = () => `<div class="card row center gap" data-photos-unavailable>
  <span aria-hidden="true">${icon('camera')}</span><span><b>Progress photos</b><br><span class="small muted">Photos can’t be saved here</span></span></div>`;

/** Body tab card: an invitation when empty, otherwise your latest set and a link to the full screen. */
export async function mountBodyPhotosCard(host) {
  if (!host) return;
  const { sessions, ok } = await mySessions();
  if (!host.isConnected) return;
  if (!ok) {
    host.innerHTML = photosUnavailableHtml();
    return;
  }
  if (!sessions.length) {
    host.innerHTML = `<a class="card row between center nav-card" href="#/photos/take" data-photos-empty>
      <span class="row center gap"><span aria-hidden="true">${icon('camera')}</span><span><b>Progress photos</b><br><span class="small muted">Take your first set</span></span></span>
      <span class="chev" aria-hidden="true">${icon('chev')}</span></a>`;
    return;
  }
  const latest = sessions[0];
  const shown = POSES.filter((p) => latest.poses[p.key]);
  host.innerHTML = `<a class="card stack nav-card" href="#/photos" data-photos-card>
    <div class="row between center"><p class="label">Progress photos</p><span class="small muted">${esc(formatDay(latest.day))}</span></div>
    <div class="pp-thumbs">${shown.map((p) => `<span class="pp-thumb"><img src="${photoUrl(latest.poses[p.key])}" alt=""><span>${p.label}</span></span>`).join('')}</div>
    <span class="small link">${sessions.length} ${sessions.length === 1 ? 'set' : 'sets'} · see all${icon('chev')}</span>
  </a>`;
}

// ---- weekly reminder (in-app only; no notifications) ----
const key = (name) => `forge.photos.${state.user ? state.user.uid : 'x'}.${name}`;
const read = (name) => { try { return localStorage.getItem(key(name)); } catch { return null; } };
const write = (name, v) => { try { if (v == null) localStorage.removeItem(key(name)); else localStorage.setItem(key(name), v); } catch { /* private mode */ } };

/** 0–6 (Sunday = 0), or null for Off. Default Sunday. */
export function getRemindDow() {
  const v = read('remind');
  if (v === 'off') return null;
  const n = Number(v);
  return v != null && Number.isInteger(n) && n >= 0 && n <= 6 ? n : 0;
}
export const setRemindDow = (dow) => write('remind', dow == null ? 'off' : String(dow));

export async function mountPhotoReminder(host) {
  if (!host) return;
  const dow = getRemindDow();
  if (dow == null) return;
  const { sessions } = await mySessions();
  const today = todayKey();
  if (!host.isConnected || !reminderDue({ today, remindDow: dow, sessions, dismissedWeek: read('dismissed') })) return;
  host.innerHTML = `<div class="card row between center pp-reminder" data-photo-reminder-card>
    <a class="grow pp-reminder-text" href="#/photos/take"><p class="label">${icon('camera', { size: 16 })} Weekly photos</p><p class="small">It’s ${DOW_NAMES[new Date().getDay()]}. Take this week’s progress photos?</p></a>
    <button class="icon-btn" data-dismiss aria-label="Not this week">${icon('close', { size: 18 })}</button>
  </div>`;
  host.querySelector('[data-dismiss]').onclick = () => {
    write('dismissed', weekStart(today, dow));
    host.innerHTML = '';
  };
}
