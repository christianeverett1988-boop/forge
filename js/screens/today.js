import { state, units as getUnits } from '../state.js';
import { esc, $, isStandalone, isIOS } from '../ui.js';
import { formatWeight, weightToDisplay } from '../units.js';
import { trendChange, projectGoalDate } from '../weight/smoothing.js';
import { sparklineSVG } from '../weight/chart.js';
import { weightSeries, currentTargets } from '../derived.js';
import { FLOOR_SOURCE } from '../nutrition/targets.js';
import { openLogWeight } from './weight.js';
import { activeWorkout, historyIndex, activeProgram } from '../workouts/plan.js';
import { deloadInfo } from '../workouts/generator.js';
import { dayKey } from '../weight/smoothing.js';
import { todayKey } from '../ui.js';
import { playerRoute, previewPlan, startPlan } from './train.js';
import { todayRings } from '../workouts/rings.js';
import { weekOf } from '../workouts/awards.js';
import { exerciseById } from '../workouts/library.js';
import { ringsHtml, animateRings } from '../ui/rings.js';
import { currentReadiness, currentScore, readinessOverridden, overrideReadiness } from '../health/today.js';
import { ringSvg, animateScoreRings, round } from '../health/ui.js';
import { icon } from '../ui/icons.js';

function workoutCard() {
  const active = activeWorkout();
  if (active) {
    // Every set done but not saved yet (the app was closed on the Workout complete card): go straight back to it.
    const allDone = (active.exercises || []).some((x) => x.sets.length) && active.exercises.every((x) => x.sets.every((s) => s.done));
    return `<a class="card resume" data-tour="workout" href="${allDone ? '#/play' : playerRoute()}"><p class="label">${allDone ? 'All sets done' : 'Workout in progress'}</p>
      <p class="big-title">${esc(active.label)}</p><span class="btn">${allDone ? 'Finish' : 'Resume'}</span></a>`;
  }
  const doneToday = historyIndex().done.filter((w) => dayKey(w.started_at) === todayKey());
  if (doneToday.length) {
    const w = doneToday[0];
    const sets = (w.exercises || []).reduce((n, it) => n + it.sets.filter((x) => x.done && !x.warmup).length, 0);
    return `<div class="card" data-tour="workout"><p class="label">Today’s workout</p>
      <p class="big-title">${icon('check', { filled: true })} ${esc(w.label)}</p>
      <p class="small muted">${sets} sets${(w.prs || []).length ? ` · ${w.prs.length} PR${w.prs.length === 1 ? '' : 's'} ${icon('trophy', { filled: true })}` : ''}. Recovery starts now.</p>
      <a class="btn ghost" href="#/history">See history</a></div>`;
  }
  const plan = previewPlan(); // with any edits you made on Train
  if (!plan || !plan.exercises.length) return '';
  return `<div class="card" data-tour="workout"><p class="label">Today’s workout${plan.deload ? ' · deload' : ''}</p>
    <p class="big-title">${esc(plan.label)}</p>
    <p class="small muted">${plan.exercises.length} exercises · about ${plan.est_minutes} min · ${esc(plan.location.name)}</p>
    ${plan.readiness ? `<p class="small ${plan.readiness === 'red' ? 'warn' : 'muted'}">Readiness ${plan.readiness}: ${plan.readiness === 'red' ? 'a lighter day' : 'one less set on accessories'}</p>` : ''}
    <div class="row gap"><button class="btn grow" data-start>Start</button><a class="btn ghost grow" href="#/train">See plan</a></div></div>`;
}

const LEVEL_WORD = { green: 'Green', amber: 'Amber', red: 'Red' };
const LEVEL_DO = {
  green: 'Good to train as planned.',
  amber: 'Go a little easier today: one set less on each accessory.',
  red: 'Your body is asking for a lighter day. Forge made today’s workout short and easy. Mobility or a walk works too.',
};

/** Readiness (Green / Amber / Red) from Apple Health, or a gentle prompt to set it up. */
function readinessCard() {
  const r = currentReadiness();
  const hasHealth = (state.health_daily || []).length > 0;
  if (r.status === 'none' && !hasHealth) {
    return `<a class="card row between center nav-card" href="#/apple" data-readiness>
      <div><p class="label">Readiness</p><p>Add your Apple Watch data to see how ready you are each morning.</p></div><span class="chev" aria-hidden="true">${icon('chev')}</span></a>`;
  }
  if (r.status === 'building' || r.status === 'none') {
    const have = Math.min(r.needed, r.baselineDays || 0);
    return `<a class="card stack nav-card" href="#/apple" data-readiness><p class="label">Readiness</p>
      <p>Getting to know your normal: <b data-count>${have} of ${r.needed} days</b>.</p>
      <div class="ready-progress"><i style="width:${Math.round((have / r.needed) * 100)}%"></i></div>
      <p class="small muted">Import your Health export in Settings → Apple Health to get there today.</p></a>`;
  }
  if (r.status === 'waiting') {
    return `<a class="card stack nav-card" href="#/apple" data-readiness><p class="label">Readiness</p>
      <p>Waiting for this morning’s Watch data.</p><p class="small muted">It arrives when your Shortcut runs after you wake up.</p></a>`;
  }
  const over = readinessOverridden();
  const bars = r.parts.filter((p) => p.key !== 'load').map((p) => `<span class="${p.dir === 'bad' ? 'bad' : p.dir === 'good' ? 'ok' : 'meh'}" title="${esc(p.text)}"><i></i></span>`).join('');
  return `<div class="card ready-card ${r.level}" data-readiness>
    <div class="ready-head"><span class="ready-pill">${LEVEL_WORD[r.level]}</span><button class="link small ready-why-btn" data-ready-why aria-expanded="false">Why?</button></div>
    ${r.stale ? '<p class="ready-stale" data-ready-stale>Based on yesterday · waiting for this morning’s data. Today’s workout isn’t changed yet.</p>' : ''}
    <p class="ready-why">${esc(r.reason)}</p>
    <p class="ready-do">${over && r.level !== 'green' ? 'You chose to train as planned today.' : LEVEL_DO[r.level]}</p>
    ${r.level === 'red' && !over && !r.stale ? '<button class="btn ghost bigbtn" data-ready-override>Train as planned anyway</button>' : ''}
    ${over && r.level !== 'green' ? '<button class="btn ghost bigbtn" data-ready-again>Use Readiness again</button>' : ''}
    <div class="ready-bars" aria-hidden="true">${bars}</div>
    <ul class="ready-parts" data-ready-parts hidden>${r.parts.map((p) => `<li class="${p.dir === 'bad' ? 'bad' : p.dir === 'good' ? 'good' : ''}">${esc(p.text)}</li>`).join('')}</ul>
  </div>`;
}

/** The 7-day Forge Score, with a tap-through to the Score screen. */
function scoreCard() {
  const s = currentScore();
  if (s.score == null) return '';
  return `<a class="card score-card" href="#/score" data-score>
    <div class="score-mini">${ringSvg(s.score, { size: 84, stroke: 9 })}<b data-count>${round(s.score)}</b></div>
    <div><p class="label" style="margin:0">Forge Score</p><p class="small muted">7-day average${s.movers[0] ? ` · ${esc(s.movers[0].label)} ${s.movers[0].delta >= 0 ? 'up' : 'down'}` : ''}</p></div>
    <span class="chev" aria-hidden="true">${icon('chev')}</span></a>`;
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
  const program = activeProgram();
  const deload = !!program && deloadInfo(program, state.profile.experience).deload;
  const rings = todayRings({ workouts: state.workouts, cardio: state.cardio || [], profile: state.profile, exerciseById, deload });

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

      ${readinessCard()}

      <div class="card rings-card">
        <div class="row between center"><p class="label">This week</p><a class="link small" href="#/awards">Awards ${icon('chev', { size: 14 })}</a></div>
        ${ringsHtml(rings)}
      </div>

      ${workoutCard()}

      ${scoreCard()}

      <div class="card weight-card">
        <div class="row between center">
          <div>
            <p class="label">Weight trend</p>
            <p class="big" data-count>${latest ? formatWeight(latest.trend, u) : '—'}</p>
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
          <div class="big"><span data-count>${t.calories.toLocaleString()}</span><small>kcal</small></div>
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
  const why = $('[data-ready-why]', el);
  if (why) why.onclick = () => {
    const list = $('[data-ready-parts]', el);
    list.hidden = !list.hidden;
    why.setAttribute('aria-expanded', String(!list.hidden));
    why.textContent = list.hidden ? 'Why?' : 'Hide';
  };
  const override = $('[data-ready-override]', el);
  if (override) override.onclick = () => {
    overrideReadiness(true);
    renderToday(el); // the plan and the card both redraw as "train as planned"
  };
  const again = $('[data-ready-again]', el);
  if (again) again.onclick = () => {
    overrideReadiness(false);
    renderToday(el);
  };
  const sc = $('[data-score]', el);
  if (sc) animateScoreRings(sc);
  animateRings($('.rings-card', el), rings, weekOf(new Date().toISOString()));
  const start = $('[data-start]', el);
  if (start) start.onclick = () => {
    const plan = previewPlan();
    if (plan && plan.exercises.length) startPlan(plan);
  };
}
