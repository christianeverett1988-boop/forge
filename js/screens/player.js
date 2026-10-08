// Guided workout player: one set at a time, full-screen. 3-2-1 GO → set screen (demo, huge target,
// steppers, Done set) → full-screen rest with next-up preview → … → summary.
// Supersets alternate (A1 → A2 → rest). Timed sets count in and finish themselves. Boxing rounds call combos.
import { state } from '../state.js';
import { esc, $, $$, toast } from '../ui.js';
import { live, syncLive, completeSet, undoSet, elapsed, paused, checkAway, describeStep, upNext, flush } from '../workouts/live.js';
import { buildQueue, nextOpenStep, setLabel, supersetTag } from '../workouts/session-core.js';
import { exerciseById } from '../workouts/library.js';
import { historyIndex, unit } from '../workouts/plan.js';
import { toUnit, fromUnit, availableLoads, loadStep, barWeight } from '../workouts/progression.js';
import { MUSCLE_LABELS } from '../workouts/recovery.js';
import { restInfo, onRestChange, adjustRest, stopRest, fmtClock, setWantAwake, unlockAudio } from '../timer.js';
import { coach } from '../ui/sound.js';
import { powerUp, prExplosion, enqueue } from '../ui/fx.js';
import { onFrame, reducedMotion, viewTransition } from '../ui/motion.js';
import { mountFigure, hasFigure } from '../ui/figure.js';
import { hapticInput, onHapticTap } from '../ui/haptic.js';
import { openPaused, openAway, saveAndSummarize, closeOverlays } from './overlays.js';
import { openHowTo } from './session.js';
import { COMBOS } from './timer.js';

const BOXING = new Set(['shadowboxing', 'heavy_bag_rounds', 'db_shadowboxing', 'boxing_footwork', 'slip_and_roll']);
const round1 = (x) => Math.round(x * 10) / 10;

let k = 0; // current step in the queue
let workoutId = null;
let draft = null; // { weight (display unit), reps, rir } for the current set
let timed = null; // running timed set: { end, total, leadEnd, pausedLeft, raf }
let unsubRest = null;
let clockTimer = null;
let awayChecked = null;
let counting = false; // the 3-2-1 overlay is up: don't draw underneath it

// Back from the background (app not killed) after >10 min without pausing? Ask too.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || location.hash !== '#/play' || !live.w || document.querySelector('.ov')) return;
  const gap = checkAway();
  if (gap) openAway(gap, () => renderPlayer(document.getElementById('main')));
});

export function leavePlayer() {
  clearInterval(clockTimer);
  if (unsubRest) unsubRest();
  unsubRest = null;
  timed = null;
  document.body.classList.remove('playing');
  closeOverlays();
  flush();
}

export function renderPlayer(el) {
  if (counting) return;
  const w = syncLive();
  if (!w) {
    el.innerHTML = `<section class="stack"><h1>No workout running</h1><a class="btn" href="#/train">Go to Train</a></section>`;
    return;
  }
  document.body.classList.add('playing');
  setWantAwake(true);
  if (workoutId !== w.id) {
    workoutId = w.id;
    k = Math.max(0, nextOpenStep(buildQueue(w.exercises), w.exercises, 0));
    draft = null;
    awayChecked = null;
  }
  if (!unsubRest) unsubRest = onRestChange(() => paintRest(el));

  // Away for more than 10 minutes without pausing? Ask once per return.
  if (awayChecked !== w.id) {
    awayChecked = w.id;
    const gap = checkAway();
    if (gap) openAway(gap, () => renderPlayer(el));
  }

  // First open of this workout: 3-2-1 GO.
  const counted = sessionStorage.getItem(`forge.counted.${w.id}`);
  if (!counted && !w.exercises.some((x) => x.sets.some((s) => s.done))) {
    sessionStorage.setItem(`forge.counted.${w.id}`, '1');
    countdown(() => renderPlayer(el));
    return;
  }

  if (paused()) {
    drawSet(el);
    openPaused(() => renderPlayer(el));
    return;
  }
  const r = restInfo();
  if (r) drawRest(el);
  else drawSet(el);
}

// ---------- 3-2-1 GO ----------
function countdown(done) {
  counting = true;
  const ov = document.createElement('div');
  ov.className = 'ov ov-count';
  ov.innerHTML = '<b data-n>3</b>';
  document.body.appendChild(ov);
  const n = $('[data-n]', ov);
  const seq = ['3', '2', '1', 'GO!'];
  let i = 0;
  const show = () => {
    n.textContent = seq[i];
    n.classList.toggle('go', seq[i] === 'GO!');
    if (seq[i] === 'GO!') coach.go();
    else coach.count(Number(seq[i]));
    if (!reducedMotion()) n.animate([{ transform: 'scale(1.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.35 }, { transform: 'scale(.9)', opacity: 0.9 }], { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)' });
    i++;
    if (i < seq.length) setTimeout(show, 800);
    else setTimeout(() => { ov.remove(); counting = false; done(); }, 650);
  };
  show();
}

// ---------- helpers ----------
function exerciseOrder(w) {
  const order = [];
  for (const { i } of buildQueue(w.exercises)) if (!order.includes(i)) order.push(i);
  return order;
}

function loadsFor(ex) {
  const loc = state.locations.find((l) => l.id === live.w.location_id);
  return availableLoads(ex, (loc && loc.weight_inventory) || {}, unit());
}

function stepWeight(ex, cur, dir) {
  const u = unit();
  const loads = loadsFor(ex);
  // First tap on an empty weight: start from something sensible (the empty bar, or your lightest weight).
  if (cur == null) {
    if (ex.load === 'barbell') return barWeight(u);
    if (loads && loads.length) return loads[0];
    return dir > 0 ? (u === 'kg' ? 2.5 : 5) : 0;
  }
  if (loads) {
    if (dir > 0) return loads.find((l) => l > cur + 1e-9) ?? cur;
    const lower = loads.filter((l) => l < cur - 1e-9);
    return lower.length ? lower[lower.length - 1] : cur;
  }
  const st = ex.load === 'barbell' || ex.load === 'smith' ? (u === 'kg' ? 2.5 : 5) : loadStep(ex, u);
  return Math.max(0, round1(cur + dir * st));
}

function currentStep() {
  const w = live.w;
  const q = buildQueue(w.exercises);
  if (!q.length) return null;
  k = Math.min(Math.max(0, k), q.length - 1);
  return { q, ...q[k] };
}

// ---------- set screen ----------
function drawSet(el) {
  const w = live.w;
  const cur = currentStep();
  if (!cur) {
    el.innerHTML = '<section class="stack"><h1>Nothing to do</h1><a class="btn" href="#/session">List view</a></section>';
    return;
  }
  const { q, i, j } = cur;
  const it = w.exercises[i];
  const s = it.sets[j];
  const ex = exerciseById(it.exercise_id) || { id: it.exercise_id, name: it.exercise_id, load: 'other', primary: [], secondary: [], reps: [8, 12] };
  const u = unit();
  const lbl = setLabel(it, j);
  const tag = supersetTag(w.exercises, i);
  const order = exerciseOrder(w);
  const exNo = order.indexOf(i) + 1;
  const isTimed = !!ex.timed;
  const bw = ['bodyweight', 'band', 'other'].includes(ex.load);
  const showWeight = !bw;
  const boxing = BOXING.has(ex.id);

  if (!draft || draft.key !== `${i}:${j}`) {
    // Prefill: what's logged → the plan → the last set you did of this exercise (so set 2 starts where set 1 ended).
    const before = it.sets.slice(0, j).filter((x) => x.done && !x.warmup === !s.warmup).pop() || it.sets.slice(0, j).filter((x) => x.done).pop();
    const kg = s.weight_kg ?? s.plan_weight_kg ?? (before ? before.weight_kg : null);
    const reps = s.reps ?? s.plan_reps ?? (before ? before.reps : null) ?? ex.reps[1];
    draft = { key: `${i}:${j}`, weight: kg != null ? round1(toUnit(kg, u)) : null, reps, rir: s.rir ?? null };
  }
  const prev = historyIndex().historyFor(ex.id)[0];
  const prevSet = prev && !s.warmup ? prev.sets[lbl.n - 1] : null;
  const isLastSet = !s.warmup && lbl.n === lbl.of;
  const nextUp = upNext(k);

  const segs = order.map((xi) => {
    const sets = w.exercises[xi].sets.filter((y) => !y.warmup);
    const done = sets.filter((y) => y.done).length;
    const pct = sets.length ? Math.round((done / sets.length) * 100) : 0;
    return `<span class="seg-bar ${xi === i ? 'cur' : ''}" data-seg="${xi}"><i style="width:${pct}%"></i></span>`;
  }).join('');

  const muscles = [...ex.primary.map((m) => `<span class="chip-m p">${esc(MUSCLE_LABELS[m] || m)}</span>`), ...ex.secondary.slice(0, 3).map((m) => `<span class="chip-m">${esc(MUSCLE_LABELS[m] || m)}</span>`)].join('');
  const heroAmount = isTimed ? `<b data-hero-n>${draft.reps}</b><span>sec</span>` : `<b data-hero-n>${draft.reps}</b><span>reps</span>`;

  el.innerHTML = `
    <section class="player" data-player>
      <header class="pl-top">
        <a class="pl-ico" href="#/session" aria-label="List view">☰</a>
        <div class="pl-clock"><span data-clock>${fmtClock(elapsed() / 1000)}</span></div>
        <button class="pl-ico" data-pause aria-label="Pause workout">❚❚</button>
      </header>
      <div class="pl-segs" role="progressbar" aria-valuemin="0" aria-valuemax="${order.length}" aria-valuenow="${exNo}" aria-label="Exercise ${exNo} of ${order.length}">${segs}</div>
      <p class="pl-count">Exercise ${exNo} of ${order.length}${tag ? ` <span class="tag ss">${tag}</span>` : ''}${s.warmup ? ' <span class="tag wu">Warm-up</span>' : ''}</p>

      <button class="pl-demo ${hasFigure(ex.id) ? 'has-fig' : ''}" data-demo aria-label="How to do ${esc(ex.name)}">
        ${hasFigure(ex.id) ? '<div class="fig-wrap" data-fig></div>' : `<div class="pl-muscles">${muscles}<span class="muted small">Tap for how-to</span></div>`}
        <span class="pl-howto">How-To</span>
      </button>
      ${boxing ? '<p class="pl-combo" data-combo aria-live="polite"></p>' : ''}

      <h2 class="pl-name">${esc(ex.name)}</h2>
      <p class="pl-setlabel">${boxing ? `Round ${lbl.n} of ${lbl.of}` : s.warmup ? `Warm-up ${lbl.n} of ${lbl.of}` : `Set ${lbl.n} of ${lbl.of}`}${isLastSet && lbl.of > 1 ? ' · <span class="last">Last set</span>' : ''}</p>

      <div class="pl-hero" data-hero style="view-transition-name: pl-hero">
        <div class="pl-hero-n">${heroAmount}</div>
        ${showWeight ? `<div class="pl-hero-w"><b data-hero-w>${draft.weight ?? '—'}</b><span>${u}</span></div>` : ''}
        <div class="pl-ring" data-ring hidden><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" class="ring-bg"/><circle cx="50" cy="50" r="45" class="ring-fg" data-ringfg/></svg></div>
      </div>

      <div class="pl-steppers">
        ${showWeight ? `<div class="stepper"><button data-w="-1" aria-label="Less weight">−</button><div><b data-wv>${draft.weight ?? '—'}</b><small>${u}</small></div><button data-w="1" aria-label="More weight">+</button></div>` : ''}
        <div class="stepper"><button data-r="-1" aria-label="${isTimed ? 'Fewer seconds' : 'Fewer reps'}">−</button><div><b data-rv>${draft.reps}</b><small>${isTimed ? 'sec' : 'reps'}</small></div><button data-r="1" aria-label="${isTimed ? 'More seconds' : 'More reps'}">+</button></div>
      </div>
      <p class="pl-last">${prevSet ? `Last time: ${prevSet.weight ? `${prevSet.weight} ${u} × ` : ''}${prevSet.reps}${isTimed ? 's' : ''}` : it.note ? esc(it.note) : '&nbsp;'}</p>
      ${!isTimed && !s.warmup ? `
      <div class="pl-rir" role="radiogroup" aria-label="Reps left in the tank">
        <span>In the tank</span>
        ${[null, 0, 1, 2, 3, 4].map((r) => `<button data-rir="${r}" class="${draft.rir === r ? 'on' : ''}" aria-pressed="${draft.rir === r}">${r == null ? '–' : r === 4 ? '4+' : r}</button>`).join('')}
      </div>` : ''}

      <label class="haptic-btn pl-done ${s.done ? 'is-done' : ''}" data-done-label>
        ${hapticInput('data-done aria-label="Done set"')}
        <span data-done-text>${s.done ? '✓ Done' : isTimed ? `Start ${draft.reps} s` : 'Done set'}</span>
      </label>
      <p class="pl-next">${nextUp ? `Next: <b>${esc(nextUp.name)}</b> · ${esc(nextUp.detail)}` : 'Last one. Finish strong!'}</p>
      <nav class="pl-nav" aria-label="Sets">
        <button data-prev ${k === 0 ? 'disabled' : ''}>‹ Back</button>
        <button data-undo>Undo last set</button>
        <button data-skip ${k >= q.length - 1 ? 'disabled' : ''}>Next ›</button>
      </nav>
    </section>`;

  // Demo figure
  const fig = $('[data-fig]', el);
  if (fig) mountFigure(fig, ex, { isPaused: () => paused() || !!restInfo() });
  $('[data-demo]', el).onclick = () => openHowTo(ex.id);

  // Clock (pause-aware)
  clearInterval(clockTimer);
  const clock = $('[data-clock]', el);
  clockTimer = setInterval(() => { if (clock.isConnected) clock.textContent = fmtClock(elapsed() / 1000); }, 1000);

  $('[data-pause]', el).onclick = () => {
    if (timed) pauseTimed();
    openPaused(() => { if (timed) resumeTimed(el); renderPlayer(el); });
  };

  const sync = () => {
    const hr = $('[data-hero-n]', el);
    if (hr) hr.textContent = draft.reps;
    const hw = $('[data-hero-w]', el);
    if (hw) hw.textContent = draft.weight ?? '—';
    const rv = $('[data-rv]', el);
    if (rv) rv.textContent = draft.reps;
    const wv = $('[data-wv]', el);
    if (wv) wv.textContent = draft.weight ?? '—';
    const dt = $('[data-done-text]', el);
    if (dt && isTimed && !s.done) dt.textContent = `Start ${draft.reps} s`;
  };
  $$('[data-w]', el).forEach((b) => b.addEventListener('click', () => {
    draft.weight = stepWeight(ex, draft.weight, Number(b.dataset.w));
    sync();
  }));
  $$('[data-r]', el).forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.r) * (isTimed ? 5 : 1);
    draft.reps = Math.max(1, (draft.reps || 0) + d);
    sync();
  }));
  $$('[data-rir]', el).forEach((b) => b.addEventListener('click', () => {
    draft.rir = b.dataset.rir === 'null' ? null : Number(b.dataset.rir);
    $$('[data-rir]', el).forEach((x) => {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', on);
    });
  }));

  onHapticTap($('[data-done]', el), () => {
    unlockAudio();
    if (s.done) {
      toast('Already done. Use “Undo last set” to change it.');
      return;
    }
    if (isTimed) startTimed(el, ex, i, j);
    else doneSet(el, ex, i, j);
  });

  $('[data-prev]', el).onclick = () => go(el, k - 1, 'pop');
  $('[data-skip]', el).onclick = () => go(el, k + 1, 'push');
  $('[data-undo]', el).onclick = () => {
    // Reopen the most recently completed set.
    const recent = q
      .map((st, n) => [n, w.exercises[st.i].sets[st.j]])
      .filter(([, x]) => x.done)
      .sort((a, b) => ((a[1].completed_at || '') < (b[1].completed_at || '') ? 1 : -1))[0];
    if (!recent) {
      toast('Nothing to undo yet.');
      return;
    }
    const n = recent[0];
    undoSet(q[n].i, q[n].j);
    draft = null;
    k = n;
    toast('Set reopened. Adjust it and tap Done again.');
    drawSet(el);
  };

  if (isLastSet && lbl.of > 1 && !s.done) coach.lastSet();
}

function go(el, to, kind) {
  const q = buildQueue(live.w.exercises);
  k = Math.min(Math.max(0, to), q.length - 1);
  draft = null;
  viewTransition(() => drawSet(el), kind);
}

function doneSet(el, ex, i, j, repsOverride) {
  const u = unit();
  const s = live.w.exercises[i].sets[j];
  const bw = ['bodyweight', 'band', 'other'].includes(ex.load);
  const weightKg = bw && !ex.timed ? (s.weight_kg ?? s.plan_weight_kg ?? null) : draft.weight != null ? fromUnit(draft.weight, u) : null;
  const res = completeSet(i, j, { reps: repsOverride ?? draft.reps, weightKg, rir: s.warmup ? null : draft.rir });
  if (!res.ok) {
    toast(res.error);
    return;
  }
  const w = live.w;
  const totalWorking = w.exercises.reduce((n, x) => n + x.sets.filter((y) => !y.warmup).length, 0) || 1;
  const segment = $(`[data-seg="${i}"] i`, el);
  if (segment) {
    const sets = w.exercises[i].sets.filter((y) => !y.warmup);
    segment.style.width = `${Math.round((sets.filter((y) => y.done).length / (sets.length || 1)) * 100)}%`;
  }
  const label = $('[data-done-label]', el);
  const txt = $('[data-done-text]', el);
  if (txt) txt.textContent = '✓';
  label && label.classList.add('is-done');
  powerUp({
    button: label, hero: $('[data-hero]', el), shakeEl: $('[data-player]', el), segment: segment && segment.parentElement,
    level: Math.min(1, res.workingDone / totalWorking), last: res.lastOfExercise, xp: s.warmup ? 0 : 10,
  });
  if (res.lastOfExercise) {
    const demo = $('[data-demo]', el);
    if (demo) demo.classList.add('flash-muscles');
  }
  for (const pr of res.prs) prExplosion(pr, { origin: $('[data-hero]', el) });

  // Move on after the power-up has had its moment (rest is already running underneath).
  setTimeout(() => {
    if (!live.w || location.hash !== '#/play') return;
    if (res.lastSetOfWorkout) {
      enqueue(() => new Promise((r) => setTimeout(r, 200))).then(() => finishFlow());
      return;
    }
    const q = buildQueue(live.w.exercises);
    const nk = nextOpenStep(q, live.w.exercises, k + 1);
    k = nk < 0 ? k : nk;
    draft = null;
    if (restInfo()) viewTransition(() => drawRest(el), 'push');
    else {
      const d = describeStep(q[k].i, q[k].j);
      toast(`Now: ${d.name}`);
      viewTransition(() => drawSet(el), 'push');
    }
  }, reducedMotion() ? 250 : 650);
}

// ---------- timed sets (3-2-1 lead-in, then they finish themselves) ----------
function startTimed(el, ex, i, j) {
  const total = draft.reps;
  const lead = 3;
  stopRest();
  timed = { i, j, ex, total, end: Date.now() + (total + lead) * 1000, leadSaid: 4, pausedLeft: null, lastCombo: 0 };
  const ring = $('[data-ring]', el);
  if (ring) ring.hidden = false;
  const txt = $('[data-done-text]', el);
  if (txt) txt.textContent = 'Stop early';
  // Re-wire the button as "stop early".
  const inp = $('[data-done]', el);
  const fresh = inp.cloneNode(true);
  inp.replaceWith(fresh);
  onHapticTap(fresh, () => {
    if (!timed) return;
    const doneSec = Math.max(1, Math.round(total - Math.max(0, (timed.end - Date.now()) / 1000)));
    timed = null;
    doneSet(el, ex, i, j, doneSec);
  });
  tickTimed(el);
}

function pauseTimed() {
  if (timed && timed.pausedLeft == null) timed.pausedLeft = timed.end - Date.now();
}
function resumeTimed(el) {
  if (timed && timed.pausedLeft != null) {
    timed.end = Date.now() + timed.pausedLeft;
    timed.pausedLeft = null;
    tickTimed(el);
  }
}

function tickTimed(el) {
  onFrame(() => {
    if (!timed || timed.pausedLeft != null || !el.isConnected) return false;
    const leftMs = timed.end - Date.now();
    const inLead = leftMs > timed.total * 1000;
    const hero = $('[data-hero-n]', el);
    if (inLead) {
      const n = Math.ceil((leftMs - timed.total * 1000) / 1000);
      if (n < timed.leadSaid) {
        timed.leadSaid = n;
        coach.count(n);
      }
      if (hero) hero.textContent = n;
      return true;
    }
    if (timed.leadSaid > 0) {
      timed.leadSaid = 0;
      coach.go();
    }
    const left = Math.max(0, leftMs / 1000);
    if (hero) hero.textContent = Math.ceil(left);
    const fg = $('[data-ringfg]', el);
    if (fg) fg.style.strokeDashoffset = String(283 * (1 - left / timed.total));
    // Boxing: call a combo every ~7 s.
    const combo = $('[data-combo]', el);
    if (combo && Date.now() - timed.lastCombo > 7000 && left > 3) {
      timed.lastCombo = Date.now();
      const c = COMBOS[Math.floor(Math.random() * COMBOS.length)];
      combo.textContent = c;
      coach.call(c);
    }
    if (left <= 0) {
      const { ex, i, j, total } = timed;
      timed = null;
      doneSet(el, ex, i, j, total);
      return false;
    }
    return true;
  });
}

// ---------- full-screen rest ----------
function drawRest(el) {
  const r = restInfo();
  if (!r) return drawSet(el);
  const nxt = r.next;
  const nextEx = nxt ? exerciseById(nxt.id) : null;
  el.innerHTML = `
    <section class="player rest" data-player>
      <header class="pl-top">
        <a class="pl-ico" href="#/session" aria-label="List view">☰</a>
        <div class="pl-clock"><span data-clock>${fmtClock(elapsed() / 1000)}</span></div>
        <button class="pl-ico" data-pause aria-label="Pause workout">❚❚</button>
      </header>
      <p class="rest-label">${esc(r.label)}</p>
      <div class="rest-ring" style="view-transition-name: pl-hero">
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" class="ring-bg"/><circle cx="50" cy="50" r="45" class="ring-fg" data-restfg/></svg>
        <b data-restclock>${fmtClock(r.left)}</b>
      </div>
      <div class="row gap rest-ctl">
        <button class="btn ghost grow" data-adj="-15">−15 s</button>
        <button class="btn grow" data-skiprest>Skip rest</button>
        <button class="btn ghost grow" data-adj="15">+15 s</button>
      </div>
      ${nxt ? `
      <button class="next-card" data-nextcard>
        <div class="next-fig" data-nextfig>${nextEx && hasFigure(nextEx.id) ? '' : '<span>Up next</span>'}</div>
        <div><p class="label">Up next</p><b>${esc(nxt.name)}</b><p class="muted small">${esc(nxt.detail)}</p></div>
      </button>` : ''}
    </section>`;
  const nf = $('[data-nextfig]', el);
  if (nf && nextEx && hasFigure(nextEx.id)) mountFigure(nf, nextEx, { isPaused: () => paused() });
  $$('[data-adj]', el).forEach((b) => (b.onclick = () => adjustRest(Number(b.dataset.adj))));
  $('[data-skiprest]', el).onclick = () => {
    stopRest();
  };
  const nc = $('[data-nextcard]', el);
  if (nc && nextEx) nc.onclick = () => openHowTo(nextEx.id);
  $('[data-pause]', el).onclick = () => openPaused(() => renderPlayer(el));
  clearInterval(clockTimer);
  const clock = $('[data-clock]', el);
  clockTimer = setInterval(() => { if (clock.isConnected) clock.textContent = fmtClock(elapsed() / 1000); }, 1000);
  // Smooth ring
  onFrame(() => {
    const info = restInfo();
    const fg = $('[data-restfg]', el);
    if (!info || !fg) return false;
    fg.style.strokeDashoffset = String(283 * (1 - info.left / info.total));
    return true;
  });
}

function paintRest(el) {
  if (location.hash !== '#/play' || !live.w) return;
  const r = restInfo();
  const onRest = !!$('[data-restclock]', el);
  if (r && onRest) {
    $('[data-restclock]', el).textContent = fmtClock(r.left);
  } else if (!r && onRest) {
    viewTransition(() => drawSet(el), 'push');
  } else if (r && !onRest && !paused() && !timed && $('[data-player]', el) && !document.querySelector('.ov')) {
    // A rest started from somewhere else (e.g. list view) while the set screen is showing.
  }
}

// ---------- finish ----------
// The summary screen plays the fanfare, confetti and voice line.
function finishFlow() {
  stopRest();
  saveAndSummarize();
}
