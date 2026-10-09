// Body programs: the Programs card on Body, the line under the missions card on Today, the completion card, and
// the "Programs: N finished" row on Awards. The program screen itself is js/screens/program.js.
import { esc, sheet } from '../ui.js';
import { icon } from '../ui/icons.js';
import { badgeSVG } from '../ui/badges.js';
import { state, units as getUnits } from '../state.js';
import { weightToDisplay, weightUnit } from '../units.js';
import { rememberBadges } from '../workouts/awards-store.js';
import {
  PROGRAMS, PROGRAM_IDS, FINISH_XP, recommendedId, bandText, finishedCount,
} from './core.js';
import {
  activeProgram, programHistory, currentStatus, programData, startProgram, cutBlocked, unseenCompletions,
} from './store.js';

const trim = (n) => String(Number(n.toFixed(1)));

// ---------- Body tab ----------
/** The Programs card. Running: a link to the program screen. Otherwise the three programs to start. */
export function programsCard() {
  if (!state.profile) return '';
  const st = activeProgram() ? currentStatus() : null;
  if (st && !st.finished) {
    return `<a class="card pg-card nav-card row between center" href="#/program" data-programs>
      <div><p class="label">Programs</p><p><b>${esc(st.def.name)}</b></p><p class="small muted">Week ${st.weekNo} of ${st.def.weeks} · ${st.goalsDone} of ${st.goalsTotal} goals so far</p></div>
      <span class="chev" aria-hidden="true">${icon('chev')}</span></a>`;
  }
  const rec = recommendedId(state.profile.goal);
  const done = finishedCount(programHistory());
  const rows = PROGRAM_IDS.map((id) => {
    const d = PROGRAMS[id];
    return `<li><button type="button" class="pg-row" data-program-start="${id}">
      <span class="pg-text"><b>${esc(d.name)}${id === rec ? ' <span class="pill pg-rec">Recommended</span>' : ''}</b><small class="muted">${esc(d.blurb)}</small><small class="muted">${d.weeks} weeks</small></span>
      <span class="chev" aria-hidden="true">${icon('chev')}</span></button></li>`;
  }).join('');
  return `<div class="card pg-card" data-programs>
    <div class="row between center"><p class="label">Programs</p>${done ? `<span class="small muted">${done} finished</span>` : ''}</div>
    <ul class="pg-list">${rows}</ul>
  </div>`;
}

/** The confirm sheet: plain words, then Start. */
export function openStartSheet(id, after = () => {}) {
  const d = PROGRAMS[id];
  const blocked = id === 'cut4' ? cutBlocked() : null;
  sheet(d.name, (body, close) => {
    const pace = id === 'cut4' && !blocked ? bandText(currentBand(), getUnits()) : '';
    body.innerHTML = `<div class="stack">
      <p>${d.weeks} weeks. ${esc(d.plain)}</p>
      ${pace ? `<p class="small muted">A safe pace for you is ${esc(pace)}.</p>` : ''}
      ${blocked ? `<p class="notice warn small">${esc(blocked.message)}</p>` : ''}
      <p class="small muted">Finish it for +${FINISH_XP} XP and a badge. Only one program runs at a time, and you can end it whenever you like.</p>
      <div class="row gap"><button class="btn ghost grow" data-no>Not now</button><button class="btn grow" data-yes ${blocked ? 'disabled' : ''}>Start ${esc(d.name)}</button></div>
    </div>`;
    body.querySelector('[data-no]').onclick = close;
    body.querySelector('[data-yes]').onclick = () => {
      if (startProgram(id)) after();
      close();
    };
  });
}

const currentBand = () => programData().band;

export function bindProgramsCard(el) {
  for (const b of el.querySelectorAll('[data-program-start]')) b.onclick = () => openStartSheet(b.dataset.programStart);
}

// ---------- Today ----------
/** "Cut kickoff · Week 2 of 4 · 2 of 3 goals so far", under the missions card. */
export function programLine() {
  if (!activeProgram()) return '';
  const st = currentStatus();
  if (!st || st.finished) return '';
  return `<a class="card pg-line" href="#/program" data-program-line><span class="pg-line-text"><b>${esc(st.def.name)}</b> · Week ${st.weekNo} of ${st.def.weeks} · ${st.goalsDone} of ${st.goalsTotal} goals so far</span><span class="chev" aria-hidden="true">${icon('chev')}</span></a>`;
}

// ---------- completion ----------
// Saving a badge to awards_seen re-renders Today, so the card is kept for the rest of this visit (until dismissed)
// and the shine plays only the first time, exactly like the mission badges.
const shown = new Map();
const shone = new Set();

function summaryText(c) {
  const s = c.summary;
  const parts = s.weeksHit ? [`${s.weeksHit} of ${s.weeks} weeks fully hit`] : [];
  if (s.changeKg != null) {
    const v = weightToDisplay(Math.abs(s.changeKg), getUnits());
    parts.push(Math.abs(s.changeKg) < 0.05 ? 'weight about the same' : `weight ${s.changeKg < 0 ? 'down' : 'up'} ${trim(v)} ${weightUnit(getUnits())}`);
  }
  if (s.workouts) parts.push(`${s.workouts} ${s.workouts === 1 ? 'workout' : 'workouts'}`);
  if (s.prs) parts.push(`${s.prs} ${s.prs === 1 ? 'PR' : 'PRs'}`);
  return parts.join(' · ');
}

/** A card per finished program not celebrated yet: badge art, name, +250 XP and a short summary. */
export function completionCards() {
  for (const c of unseenCompletions()) shown.set(c.badge.id, c);
  return [...shown.values()].map((c) => {
    const first = !shone.has(c.badge.id);
    shone.add(c.badge.id);
    return `<div class="card ms-badge pg-done" data-program-done="${esc(c.badge.id)}" role="status">
      <span class="ms-badge-art">${badgeSVG(c.badge.id, { shine: first, size: 56, label: c.badge.name })}</span>
      <span class="ms-badge-text"><small class="label">Program finished</small><b>${esc(c.badge.name)}</b><small class="ms-xp">+${FINISH_XP} XP</small>${summaryText(c) ? `<small class="muted">${esc(summaryText(c))}</small>` : ''}</span>
      <span class="ms-badge-links"><a class="link" href="#/awards" data-done-awards>See awards</a><button type="button" class="ms-badge-x" data-done-dismiss aria-label="Dismiss">${icon('close', { size: 18 })}</button></span>
    </div>`;
  }).join('');
}

/** Remember a program badge only after its card was on screen for a moment, or on dismiss / "See awards". */
export function afterCompletionCards(el) {
  const remember = (id) => {
    const fresh = unseenCompletions().filter((c) => c.badge.id === id).map((c) => c.badge);
    if (fresh.length) rememberBadges(fresh);
  };
  for (const card of el.querySelectorAll('[data-program-done]')) {
    const id = card.dataset.programDone;
    card.querySelector('[data-done-dismiss]').onclick = () => { shown.delete(id); card.remove(); remember(id); };
    card.querySelector('[data-done-awards]').onclick = () => { shown.delete(id); remember(id); };
    let timer = 0;
    const onScreen = () => { if (!timer) timer = setTimeout(() => card.isConnected && remember(id), 1500); };
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); onScreen(); }
      }, { threshold: 0.6 });
      io.observe(card);
    } else onScreen();
  }
}

// ---------- Awards ----------
export function programsAwardsHtml() {
  const n = finishedCount(programHistory());
  const st = activeProgram() ? currentStatus() : null;
  return `<div class="card" data-programs-awards>
    <div class="row between center"><p class="label">Programs</p><span class="small muted">${n} finished</span></div>
    <p class="small muted">${st && !st.finished ? `${esc(st.def.name)} is running: week ${st.weekNo} of ${st.def.weeks}. ` : ''}Finish a body program for +${FINISH_XP} XP, plus +50 XP for each week you hit every goal.</p>
    <a class="link" href="${st && !st.finished ? '#/program' : '#/body'}">${st && !st.finished ? 'Open your program' : 'See programs'} ${icon('chev', { size: 14 })}</a>
  </div>`;
}
