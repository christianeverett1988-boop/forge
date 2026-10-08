// Workout-complete summary: confetti, "Workout #N", count-up stats (time without pauses, sets, volume, PRs),
// PRs with old → new, "vs last time" per exercise, and the muscles you worked.
// Then XP with the level bar (and a level-up burst), the weekly streak, new badges, and a Share image.
import { state } from '../state.js';
import { esc, $, toast } from '../ui.js';
import { unit } from '../workouts/plan.js';
import { buildIndex } from '../workouts/history.js';
import { exerciseById } from '../workouts/library.js';
import { toUnit } from '../workouts/progression.js';
import { sessionStats, versusLast } from '../workouts/session-core.js';
import { MUSCLE_LABELS } from '../workouts/recovery.js';
import { bodyMap } from '../ui/bodymap.js';
import { countUp, reducedMotion } from '../ui/motion.js';
import { confetti } from '../ui/fx.js';
import { sfx, coach } from '../ui/sound.js';
import { fmtClock } from '../timer.js';
import { finishedCopy } from '../workouts/live.js';
import { workoutAwards } from '../workouts/awards.js';
import { levelUp } from '../ui/fx.js';
import { renderShareCard, shareImage } from '../ui/sharecard.js';

const fmtDuration = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

export function renderSummary(el, id) {
  // Use the saved copy only once it says done; until the local snapshot lands, use what finishWorkout() saved.
  const stored = state.workouts.find((x) => x.id === id);
  const w = stored && stored.status === 'done' ? stored : finishedCopy(id);
  if (!w) {
    el.innerHTML = '<section class="summary"><div class="skeleton h1"></div><div class="skeleton row3"></div><div class="skeleton block"></div></section>';
    return;
  }
  const u = unit();
  const done = [...state.workouts.filter((x) => x.status === 'done' && !x.deleted && x.id !== w.id), w].sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
  const number = done.findIndex((x) => x.id === w.id) + 1;
  const st = sessionStats(w.exercises || [], (kg) => toUnit(kg, u));
  const durationMs = Math.max(0, w.duration_ms ?? (Date.parse(w.finished_at || w.started_at) - Date.parse(w.started_at) - (w.paused_ms || 0)));
  const prs = w.prs || [];

  // History before this workout, for "vs last time".
  const before = buildIndex(state.workouts.filter((x) => x.id !== w.id && x.started_at < w.started_at), u);
  const rows = (w.exercises || []).map((it) => {
    const ex = exerciseById(it.exercise_id) || { id: it.exercise_id, name: it.exercise_id, load: 'other', primary: [], secondary: [] };
    const sets = it.sets.filter((s) => s.done && !s.warmup).map((s) => ({ weight: s.weight_kg == null ? null : Math.round(toUnit(s.weight_kg, u) * 10) / 10, reps: s.reps }));
    if (!sets.length) return null;
    const prevSess = before.historyFor(ex.id).find((h) => !h.deload);
    const vs = versusLast(ex, sets, prevSess && prevSess.sets, u);
    const exPrs = prs.filter((p) => p.exercise_id === ex.id);
    return { ex, sets, vs, exPrs };
  }).filter(Boolean);

  // Muscles worked: hard sets per muscle (primary 1, secondary 0.5).
  const mus = {};
  for (const r of rows) {
    if (r.ex.kind === 'conditioning') continue;
    r.ex.primary.forEach((m) => (mus[m] = (mus[m] || 0) + r.sets.length));
    r.ex.secondary.forEach((m) => (mus[m] = (mus[m] || 0) + r.sets.length * 0.5));
  }
  const topMus = Object.entries(mus).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxMus = topMus.length ? topMus[0][1] : 1;

  // XP, level, streak and badges, derived from history with this workout counted as done.
  const goal = (state.profile && state.profile.trainingDays) || 3;
  const aw = workoutAwards([...state.workouts.filter((x) => x.id !== w.id), { ...w, status: 'done' }], state.cardio || [], goal, w.id);

  el.innerHTML = `
    <section class="summary">
      <p class="label tcenter">${new Date(w.started_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</p>
      <h1 class="sum-title" data-title>Workout #${number}</h1>
      <p class="tcenter muted">${esc(w.label || '')}${w.deload ? ' · deload' : ''}</p>

      <div class="sum-stats">
        <div><span>Time</span><b data-c="time">${fmtDuration(durationMs)}</b></div>
        <div><span>Sets</span><b data-c="sets">${st.sets}</b></div>
        <div><span>Volume</span><b><span data-c="vol">${st.volume.toLocaleString()}</span> <small>${u}</small></b></div>
        <div class="${prs.length ? 'gold' : ''}"><span>Records</span><b>🏆 <span data-c="prs">${prs.length}</span></b></div>
      </div>

      ${aw ? `
      <div class="card sum-xp">
        <div class="row between center"><p class="label">XP earned</p><b>+<span data-c="xp">${aw.xp.total}</span></b></div>
        <div class="aw-bar" role="progressbar" aria-label="Level progress"><i data-xpbar style="--p:${(aw.levelUp ? aw.after.progress : aw.after.progress).toFixed(3)}"></i></div>
        <p class="small muted"><b class="lvl-name">Level ${aw.after.level} · ${esc(aw.after.name)}</b>${aw.after.next != null ? ` · ${(aw.after.next - aw.after.xp).toLocaleString()} XP to ${esc(aw.after.nextName)}` : ''}</p>
        <p class="small">${aw.streak.current ? `🔥 ${aw.streak.current}-week streak` : '🔥 Streak starts when you hit your planned days this week'} · ${aw.streak.thisWeek.done} of ${aw.streak.thisWeek.goal} days this week</p>
        ${aw.badges.length ? `<div class="sum-badges">${aw.badges.map((b) => `<span>🏅 ${esc(b.name)}</span>`).join('')}</div>` : ''}
        <a class="small" href="#/awards">See all awards ›</a>
      </div>` : ''}

      ${topMus.length ? `
      <div class="card">
        <p class="label">Muscles worked</p>
        ${bodyMap(Object.fromEntries(Object.entries(mus).map(([m, v]) => [m, 0.25 + 0.75 * (v / maxMus)])), { size: 'small' })}
        <div class="mus">
          ${topMus.map(([m, v], n) => `<div class="mus-row"><span>${esc(MUSCLE_LABELS[m] || m)}</span><div class="mus-bar"><i style="--w:${Math.round((v / maxMus) * 100)}%;--d:${n * 60}ms"></i></div><b>${Math.round(v * 10) / 10}</b></div>`).join('')}
        </div>
      </div>` : ''}

      <h2>${rows.length} exercise${rows.length === 1 ? '' : 's'}</h2>
      <ul class="list sum-list">
        ${rows.map((r) => `
          <li>
            <span class="sum-check" aria-hidden="true">✓</span>
            <div class="grow">
              <b>${esc(r.ex.name)}</b>
              <small class="muted">${r.sets.map((s) => `${s.weight ? `${s.weight}×` : ''}${s.reps}${r.ex.timed ? 's' : ''}`).join(' · ')}</small>
              ${r.exPrs.map((p) => `<span class="sum-pr">🏆 ${esc(p.label.split(': ').slice(1).join(': ') || p.label)}${p.prev != null ? ` <s>${Math.round(p.prev * 10) / 10}</s>` : ''}</span>`).join('')}
            </div>
            ${r.vs ? `<span class="vs ${r.vs.tone}">${esc(r.vs.text)}</span>` : '<span class="vs new">First time</span>'}
          </li>`).join('')}
      </ul>

      <button class="btn ghost" data-share>Share image</button>
      <a class="btn big" href="#/today">Done</a>
    </section>`;

  // Celebrate once per workout.
  const key = `forge.summary.${w.id}`;
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    sfx.fanfare();
    coach.workoutDone();
    confetti({ duration: 2000 });
    const t = $('[data-title]', el);
    if (t && !reducedMotion()) t.animate([{ transform: 'scale(1.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)', delay: 200, fill: 'backwards' });
    countUp($('[data-c="sets"]', el), st.sets, { delay: 400 });
    countUp($('[data-c="vol"]', el), st.volume, { delay: 500, dur: 1100 });
    countUp($('[data-c="prs"]', el), prs.length, { delay: 600 });
    const time = $('[data-c="time"]', el);
    if (time && !reducedMotion()) countUp(time, durationMs / 1000, { delay: 400, dur: 1000, format: (v) => (durationMs >= 3600000 ? fmtDuration(v * 1000) : fmtClock(v)) });
    el.querySelectorAll('.mus-bar i').forEach((i) => i.classList.add('grow-in'));
    if (aw) {
      countUp($('[data-c="xp"]', el), aw.xp.total, { delay: 700, dur: 900 });
      const bar = $('[data-xpbar]', el);
      if (bar && !reducedMotion()) {
        // Fill from where you were; on a level-up fill to the end, burst, then start the new level.
        bar.style.transition = 'none';
        bar.style.setProperty('--p', aw.before.progress.toFixed(3));
        requestAnimationFrame(() => requestAnimationFrame(() => {
          bar.style.transition = '';
          bar.style.setProperty('--p', aw.levelUp ? '1' : aw.after.progress.toFixed(3));
        }));
        if (aw.levelUp) {
          setTimeout(() => {
            levelUp(aw.after).then(() => {
              bar.style.transition = 'none';
              bar.style.setProperty('--p', '0');
              requestAnimationFrame(() => requestAnimationFrame(() => {
                bar.style.transition = '';
                bar.style.setProperty('--p', aw.after.progress.toFixed(3));
              }));
            });
          }, 1300);
        }
      } else if (aw.levelUp) levelUp(aw.after);
    }
  } else {
    el.querySelectorAll('.mus-bar i').forEach((i) => i.classList.add('grown'));
  }

  // Share image: drawn ahead of time so the tap can open the share sheet straight away (iPhone needs the
  // share call to come directly from the tap).
  let blob = null;
  const card = {
    number, date: new Date(w.started_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }), label: w.label || '',
    time: fmtDuration(durationMs), sets: st.sets, volume: st.volume.toLocaleString(), unit: u,
    prs: prs.map((p) => p.label || ''), muscles: Object.fromEntries(Object.entries(mus).map(([m, v]) => [m, 0.25 + 0.75 * (v / maxMus)])),
    level: aw ? aw.after : { level: 1, name: 'Spark' }, streak: aw ? aw.streak.current : 0, xp: aw ? aw.xp.total : 0,
  };
  setTimeout(() => renderShareCard(card).then((b) => (blob = b)).catch(() => {}), 1200);
  $('[data-share]', el).onclick = async () => {
    try {
      const b = blob || (await renderShareCard(card));
      const how = await shareImage(b, `forge-workout-${number}.png`);
      if (how === 'downloaded') toast('Image saved');
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('Couldn’t share the image');
    }
  };
}

