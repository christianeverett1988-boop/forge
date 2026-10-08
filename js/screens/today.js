import { state, units as getUnits } from '../state.js';
import { esc, $, isStandalone, isIOS } from '../ui.js';
import { formatWeight, weightToDisplay } from '../units.js';
import { trendChange, projectGoalDate } from '../weight/smoothing.js';
import { sparklineSVG } from '../weight/chart.js';
import { weightSeries, currentTargets } from '../derived.js';
import { FLOOR_SOURCE } from '../nutrition/targets.js';
import { openLogWeight } from './weight.js';
import { activeWorkout, planToday, startWorkout, historyIndex } from '../workouts/plan.js';
import { dayKey } from '../weight/smoothing.js';
import { todayKey } from '../ui.js';
import { playerRoute } from './train.js';
import { unlockAudio } from '../ui/sound.js';

function workoutCard() {
  const active = activeWorkout();
  if (active) {
    // Every set done but not saved yet (the app was closed on the Workout complete card): go straight back to it.
    const allDone = (active.exercises || []).some((x) => x.sets.length) && active.exercises.every((x) => x.sets.every((s) => s.done));
    return `<a class="card resume" href="${allDone ? '#/play' : playerRoute()}"><p class="label">${allDone ? 'All sets done' : 'Workout in progress'}</p>
      <p class="big-title">${esc(active.label)}</p><span class="btn">${allDone ? 'Finish' : 'Resume'}</span></a>`;
  }
  const doneToday = historyIndex().done.filter((w) => dayKey(w.started_at) === todayKey());
  if (doneToday.length) {
    const w = doneToday[0];
    const sets = (w.exercises || []).reduce((n, it) => n + it.sets.filter((x) => x.done && !x.warmup).length, 0);
    return `<div class="card"><p class="label">Today’s workout</p>
      <p class="big-title">✓ ${esc(w.label)}</p>
      <p class="small muted">${sets} sets${(w.prs || []).length ? ` · ${w.prs.length} PR${w.prs.length === 1 ? '' : 's'} 🏆` : ''}. Recovery starts now.</p>
      <a class="btn ghost" href="#/history">See history</a></div>`;
  }
  const plan = planToday();
  if (!plan || !plan.exercises.length) return '';
  return `<div class="card"><p class="label">Today’s workout${plan.deload ? ' · deload' : ''}</p>
    <p class="big-title">${esc(plan.label)}</p>
    <p class="small muted">${plan.exercises.length} exercises · about ${plan.est_minutes} min · ${esc(plan.location.name)}</p>
    <div class="row gap"><button class="btn grow" data-start>Start</button><a class="btn ghost grow" href="#/train">See plan</a></div></div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function renderToday(el) {
  const u = getUnits();
  const t = currentTargets();
  const series = weightSeries();
  const latest = series.length ? series[series.length - 1] : null;
  const change = trendChange(series, 7);
  const goal = state.profile.goal;
  const goalKg = state.profile.targetWeightKg;
  const projection = goalKg ? projectGoalDate(series, goalKg) : null;

  // Arrow color: green when the trend moves the way your goal wants.
  let arrow = '→', tone = 'neutral';
  if (change != null && Math.abs(change) >= 0.05) {
    arrow = change < 0 ? '↓' : '↑';
    const wantDown = goal === 'lose' || goal === 'recomp';
    const wantUp = goal === 'muscle';
    tone = (wantDown && change < 0) || (wantUp && change > 0) ? 'good' : wantDown || wantUp ? 'warn' : 'neutral';
  }

  const installHint = isIOS() && !isStandalone();

  el.innerHTML = `
    <section class="stack">
      <header class="today-head">
        <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1>${greeting()}</h1>
      </header>

      ${installHint ? `
        <div class="notice info">
          <b>Install this app first.</b> Tap the Share button, then <b>Add to Home Screen</b>, and open it from there.
          iPhone can erase data from websites you don’t open for 7 days. Installed apps are protected.
        </div>` : ''}

      ${t.flags.map((f) => `<div class="notice ${f.level}">${esc(f.message)}</div>`).join('')}

      ${workoutCard()}

      <div class="card weight-card">
        <div class="row between center">
          <div>
            <p class="label">Weight trend</p>
            <p class="big">${latest ? formatWeight(latest.trend, u) : '—'}</p>
            <p class="small ${tone}">${change == null ? 'Log a few days to see your trend' : `${arrow} ${Math.abs(weightToDisplay(change, u)).toFixed(1)} this week`}</p>
          </div>
          ${sparklineSVG(series)}
        </div>
        ${projection && !projection.reached ? `<p class="small muted">On pace for your goal around ${new Date(projection.day + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>` : ''}
        <div class="row gap">
          <button class="btn grow" data-log>Log weight</button>
          <a class="btn ghost grow" href="#/weight">See chart</a>
        </div>
      </div>

      <div class="card">
        <p class="label">Daily targets</p>
        <div class="target-hero">
          <div class="big">${t.calories.toLocaleString()}<small>kcal</small></div>
          <div class="macros">
            <div><b>${t.proteinG} g</b><span>Protein</span></div>
            <div><b>${t.carbG} g</b><span>Carbs</span></div>
            <div><b>${t.fatG} g</b><span>Fat</span></div>
          </div>
        </div>
        <details>
          <summary>Why these numbers?</summary>
          <ul class="reasons">${t.reasoning.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          <p class="small muted">Safe floor: ${t.floor} kcal/day. ${esc(FLOOR_SOURCE)}</p>
          <p class="small muted">Targets update automatically as your weight trend changes.</p>
        </details>
      </div>

      <p class="disclaimer">General fitness information, not medical advice.</p>
    </section>`;

  $('[data-log]', el).onclick = openLogWeight;
  const start = $('[data-start]', el);
  if (start) start.onclick = () => {
    const plan = planToday();
    if (!plan) return;
    unlockAudio();
    startWorkout(plan);
    location.hash = playerRoute();
  };
}
