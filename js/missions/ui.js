// "Today's missions" card for the Today screen, and the week dots for Awards.
import { esc } from '../ui.js';
import { icon } from '../ui/icons.js';
import { todayMissions, seenToday, rememberDone, weekProgress, MISSION_XP } from './store.js';

const fmt = (n) => Math.round(n).toLocaleString();

function progressText(p) {
  return p ? `${fmt(p.value)} / ${fmt(p.target)} ${p.unit}` : '';
}

/** The card under the workout card. All done: one line. Nothing to show before missions have started. */
export function missionsCard() {
  const m = todayMissions();
  if (!m.started || !m.list.length) return '';
  if (m.all) {
    return `<a class="card ms-done" href="#/awards" data-missions>${icon('check', { filled: true })}<span>All missions done, +${m.xp} XP</span><span class="chev" aria-hidden="true">${icon('chev')}</span></a>`;
  }
  const seen = seenToday();
  const rows = m.list.map((x) => {
    const sub = progressText(x.progress);
    const pop = x.done && !seen.has(x.id);
    return `<li class="ms-row ${x.done ? 'done' : ''}" data-mission="${x.id}" aria-label="${esc(x.label)}: ${x.done ? 'done' : 'not done yet'}">
      <span class="ms-check ${pop ? 'ms-pop' : ''}" aria-hidden="true">${x.done ? icon('check', { filled: true }) : '<i class="ms-ring"></i>'}</span>
      <span class="ms-text"><span>${esc(x.label)}</span>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</span>
      <small class="ms-xp ${x.done ? '' : 'muted'}">+${MISSION_XP} XP</small>
    </li>`;
  }).join('');
  return `<div class="card ms-card" data-missions>
    <div class="row between center"><p class="label">Today’s missions</p><span class="small muted">${m.done} of ${m.total}</span></div>
    <ul class="ms-list">${rows}</ul>
    <p class="small muted">Finish all ${m.total} for +${m.bonus} XP more.</p>
  </div>`;
}

/** After the card is on screen: remember what was shown as done (later, so the check's spring isn't cut off). */
export function afterMissionsRender() {
  const m = todayMissions();
  const ids = m.list.filter((x) => x.done).map((x) => x.id);
  if (!ids.length) return;
  setTimeout(() => rememberDone(ids), 1200);
}

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Awards: the last seven days, a dot per day (filled = all missions, half = some). */
export function missionWeekHtml() {
  const days = weekProgress();
  const dots = days.map((d) => {
    const dow = new Date(`${d.day}T12:00:00`).getDay();
    const state = !d.counted ? 'off' : d.all ? 'all' : d.done ? 'some' : 'none';
    const label = !d.counted ? 'not counted yet' : `${d.done} of ${d.total} missions`;
    return `<li class="ms-dot ${state}" aria-label="${DAY_LETTER[dow]}: ${label}"><i></i><small>${DAY_LETTER[dow]}</small></li>`;
  }).join('');
  const full = days.filter((d) => d.all).length;
  return `<div class="card ms-week">
    <div class="row between center"><p class="label">Daily missions</p><span class="small muted">${full} full ${full === 1 ? 'day' : 'days'} this week</span></div>
    <ol class="ms-dots">${dots}</ol>
    <p class="small muted">+${MISSION_XP} XP for each mission and a bonus for finishing the day’s set.</p>
  </div>`;
}
