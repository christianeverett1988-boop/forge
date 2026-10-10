import { state, units as getUnits } from '../state.js';
import { esc, $, isStandalone, isIOS } from '../ui.js';
import { weightToDisplay, weightUnit } from '../units.js';
import { trendChange } from '../weight/smoothing.js';
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
import { ringsHtml, animateRings, foodSummary, foodRingSvg } from '../ui/rings.js';
import { currentReadiness, currentScore, readinessOverridden, overrideReadiness } from '../health/today.js';
import { ringSvg, animateScoreRings, round } from '../health/ui.js';
import { icon } from '../ui/icons.js';
import { isNative } from '../native/bridge.js';
import { lastNativeRead } from '../native/autoread.js';
import { programLine, completionCards, afterCompletionCards } from '../body-programs/ui.js';
import { missionsCard, afterMissionsRender, badgeCelebrationCards, afterBadgeCelebrations } from '../missions/ui.js';
import { coachData } from '../coach/data.js';
import { availableQuestions } from '../coach/answers.js';
import { dayTotals } from '../food/core.js';

/** "Ask Coach: <first question that has an answer>", or just "Ask Coach". */
function coachTeaser() {
  try {
    const q = availableQuestions(coachData(), todayKey())[0];
    return q ? `Ask Coach: ${q.label}` : 'Ask Coach';
  } catch (e) { return 'Ask Coach'; }
}
import { topInsights, dismissInsight, reportFor, currentReportWeek, currentGoalPath } from '../health/intel.js';
import { compactInsightsHtml, bindInsightCards } from '../health/cards.js';
import { goalLine } from '../health/goalpath.js';
import { showReportCard } from '../health/weekly.js';
import { loadExpiryInfo, refreshDue } from '../native/expiry.js';
import { refreshBannerHtml, openRefreshSheet } from '../native/refresh-ui.js';

/** Today's food against targets, for the rings. */
function foodToday(t) {
  const tot = dayTotals(state.food_logs, todayKey());
  return { kcal: tot.kcal, protein_g: tot.protein_g, targetKcal: t.calories, targetProtein: t.proteinG };
}

/** The Food card, just under the workout: a calories ring with protein inside it, today's numbers, Log food and See meals. */
function foodCard(t) {
  const tot = dayTotals(state.food_logs, todayKey());
  const n = (v) => Math.round(v).toLocaleString('en-US');
  const sum = foodSummary(tot, t);
  const aria = `Food today: ${n(tot.kcal)} of ${n(t.calories)} kcal, ${n(tot.protein_g)} of ${n(t.proteinG)} g protein`;
  return `<div class="card food-card" data-food-card data-tour="food">
    <div class="food-card-top">
      ${foodRingSvg(tot, t, aria)}
      <div class="food-card-text">
        <p class="label">Food</p>
        <p class="food-card-kcal"><b>${n(tot.kcal)}</b> <small>of ${n(t.calories)} kcal</small></p>
        <p class="small ${sum.over ? 'over' : 'muted'}">${esc(sum.note)}</p>
        <p class="small muted">${esc(sum.protein)}</p>
      </div>
    </div>
    <div class="row gap"><button class="btn grow" data-food-log>Log food</button><a class="btn ghost grow" href="#/food">See meals</a></div></div>`;
}

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
      <div><p class="label">Readiness</p><p>${isNative() ? 'Connect Apple Health to see how ready you are each morning.' : 'Add your Apple Watch data to see how ready you are each morning.'}</p></div><span class="chev" aria-hidden="true">${icon('chev')}</span></a>`;
  }
  if (r.status === 'building' || r.status === 'none') {
    const have = Math.min(r.needed, r.baselineDays || 0);
    return `<a class="card stack nav-card" href="#/apple" data-readiness><p class="label">Readiness</p>
      <p>Getting to know your normal: <b data-count>${have} of ${r.needed} days</b>.</p>
      <div class="ready-progress"><i style="width:${Math.round((have / r.needed) * 100)}%"></i></div>
      <p class="small muted">${isNative() ? (lastNativeRead(state.user && state.user.uid) ? `Forge has your history. Readiness fills in as your Watch records more nights: ${Math.max(0, r.needed - have)} to go.` : 'Tap here and choose Connect Apple Health: it reads your history right away.') : 'Import your Health export in Settings → Apple Health to get there today.'}</p></a>`;
  }
  if (r.status === 'waiting') {
    return `<a class="card stack nav-card" href="#/apple" data-readiness><p class="label">Readiness</p>
      <p>Waiting for this morning’s Watch data.</p><p class="small muted">${isNative() ? 'Open Forge after you wake up and it reads Apple Health by itself. Or tap here and choose Read Apple Health now.' : 'It arrives when your Shortcut runs after you wake up.'}</p></a>`;
  }
  const over = readinessOverridden();
  const bars = r.parts.filter((p) => p.key !== 'load').map((p) => `<span class="${p.dir === 'bad' ? 'bad' : p.dir === 'low' ? 'low' : p.dir === 'good' || p.dir === 'ok' ? 'ok' : 'meh'}" title="${esc(p.text)}"><i></i></span>`).join('');
  return `<div class="card ready-card ${r.level}" data-readiness>
    <div class="ready-head"><span class="ready-pill">${LEVEL_WORD[r.level]}</span><button class="link small ready-why-btn" data-ready-why aria-expanded="false">Why?</button></div>
    ${r.stale ? '<p class="ready-stale" data-ready-stale>Based on yesterday · waiting for this morning’s data. Today’s workout isn’t changed yet.</p>' : ''}
    <p class="ready-why">${esc(r.reason)}</p>
    <p class="ready-do">${over && r.level !== 'green' ? 'You chose to train as planned today.' : LEVEL_DO[r.level]}</p>
    ${r.level === 'red' && !over && !r.stale ? '<button class="btn ghost bigbtn" data-ready-override>Train as planned anyway</button>' : ''}
    ${over && r.level !== 'green' ? '<button class="btn ghost bigbtn" data-ready-again>Use Readiness again</button>' : ''}
    <div class="ready-bars" aria-hidden="true">${bars}</div>
    <ul class="ready-parts" data-ready-parts hidden>${r.parts.map((p) => `<li class="${p.dir === 'bad' ? 'bad' : p.dir === 'low' ? 'warn' : p.dir === 'good' ? 'good' : ''}">${esc(p.text)}</li>`).join('')}</ul>
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

/** Sunday / Monday: the weekly report, with its one suggestion. */
function weeklyCard() {
  if (!showReportCard(todayKey())) return '';
  const r = reportFor(currentReportWeek());
  if (!r.hasData) return '';
  return `<a class="card stack nav-card" href="#/weekly" data-weekly-card>
    <p class="label">${r.partial ? 'Your week so far' : 'Your week'}</p>
    <p class="big-title">${r.training.workouts} of ${r.training.planned} workouts${r.score.delta ? ` · Score ${r.score.delta > 0 ? 'up' : 'down'} ${Math.abs(round(r.score.delta))}` : ''}</p>
    <p class="small muted">${esc(r.suggestion.text)}</p><span class="small link">See the full report${icon('chev')}</span></a>`;
}

/** At most 2 compact insight cards (ranked by severity × recency); tap to expand, hide for 7 days. Full cards live on Body. */
function insightsBlock() {
  const r = currentReadiness();
  // Readiness already says "short sleep" when it is amber or red for sleep: don't say it twice.
  const sleepShown = r.status === 'ok' && r.level !== 'green' && (r.parts || []).some((p) => p.key === 'sleep' && (p.dir === 'bad' || p.dir === 'low'));
  const cards = topInsights(4).filter((c) => !(sleepShown && c.id === 'anomaly:sleep')).slice(0, 2);
  return cards.length ? `<div class="insights stack" data-insights>${compactInsightsHtml(cards)}</div>` : '';
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
  const fmtGoalDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.slice(0, 4) !== todayKey().slice(0, 4) ? { year: 'numeric' } : {}) });
  const goalSentence = goalKg ? goalLine(currentGoalPath(), fmtGoalDay) : ''; // same fit as the Goal path card

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
  const rings = todayRings({ workouts: state.workouts, cardio: state.cardio || [], profile: state.profile, exerciseById, deload, food: foodToday(t) });

  el.innerHTML = `
    <section class="stack">
      <header class="today-head">
        <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1>${greeting()}</h1>
      </header>

      ${badgeCelebrationCards()}

      ${completionCards()}

      ${installHint ? `
        <div class="notice info">
          <b>Install this app first.</b> Tap the Share button, then <b>Add to Home Screen</b>, and open it from there.
          iPhone can erase data from websites you don’t open for 7 days. Installed apps are protected.
        </div>` : ''}

      ${isNative() ? '<div data-app-refresh-slot></div>' : ''}

      ${t.flags.map((f) => `<div class="notice ${f.level}">${esc(f.message)}</div>`).join('')}

      ${readinessCard()}

      <div class="card rings-card">
        <div class="row between center"><p class="label">Training and food</p><a class="link small" href="#/awards">Awards ${icon('chev', { size: 14 })}</a></div>
        ${ringsHtml(rings)}
      </div>

      ${workoutCard()}

      ${foodCard(t)}

      ${missionsCard()}

      ${programLine()}

      ${scoreCard()}

      ${weeklyCard()}

      <div data-photo-reminder></div>

      <div class="card weight-card">
        <div class="row between center">
          <div>
            <p class="label">Weight trend</p>
            <p class="hero-num">${latest ? `<span data-count>${weightToDisplay(latest.trend, u).toFixed(1)}</span> <small>${weightUnit(u)}</small>` : '—'}</p>
            <p class="small ${tone}">${change == null ? 'Log a few days to see your trend' : `${arrow} ${Math.abs(weightToDisplay(change, u)).toFixed(1)} this week`}</p>
          </div>
          ${sparklineSVG(series)}
        </div>
        ${goalSentence ? `<p class="small muted" data-goal-line>${esc(goalSentence)}</p>` : ''}
        <div class="row gap">
          <button class="btn grow" data-log>Log weight</button>
          <a class="btn ghost grow" href="#/weight">See chart</a>
        </div>
      </div>

      <div class="card">
        <p class="label">Daily targets</p>
        <div class="target-hero">
          <div class="hero-num"><span data-count>${t.calories.toLocaleString()}</span> <small>kcal</small></div>
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

      ${insightsBlock()}

      <a class="card row between center nav-card" href="#/coach" data-coach-card>
        <div><p class="label">Coach</p><p>${esc(coachTeaser())}</p></div><span class="chev" aria-hidden="true">${icon('chev')}</span></a>

      <p class="disclaimer">General fitness information, not medical advice.</p>
    </section>`;

  $('[data-log]', el).onclick = openLogWeight;
  $('[data-food-log]', el).onclick = () => import('./food.js').then((m) => m.openLogFood());
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
  const refreshSlot = $('[data-app-refresh-slot]', el);
  if (refreshSlot) loadExpiryInfo().then((info) => {
    if (!refreshSlot.isConnected || !info || !refreshDue(info.at)) return;
    refreshSlot.innerHTML = refreshBannerHtml(info.at, info.exact);
    $('[data-app-refresh-banner]', refreshSlot).addEventListener('click', openRefreshSheet);
  });
  bindInsightCards(el, dismissInsight);
  afterMissionsRender();
  afterBadgeCelebrations(el);
  afterCompletionCards(el);
  import('../photos/cards.js').then((m) => m.mountPhotoReminder($('[data-photo-reminder]', el)));
  const sc = $('[data-score]', el);
  if (sc) animateScoreRings(sc);
  animateRings($('.rings-card', el), rings, weekOf(new Date().toISOString()));
  const start = $('[data-start]', el);
  if (start) start.onclick = () => {
    const plan = previewPlan();
    if (plan && plan.exercises.length) startPlan(plan);
  };
}
