// The workout logger: big one-handed tap targets, last session inline, rest timer, supersets, RIR,
// warm-ups, swaps, plate calculator and PR celebrations.
import { state } from '../state.js';
import { patch, softDelete } from '../db.js';
import { esc, $, $$, sheet, toast, confirmSheet, haptic, celebrate } from '../ui.js';
import { historyIndex, unit, activeLocation } from '../workouts/plan.js';
import { exerciseById, loadInstructions } from '../workouts/library.js';
import { toUnit, fromUnit, detectPRs, nextTarget, warmups } from '../workouts/progression.js';
import { expandEquipment, canDo } from '../workouts/equipment.js';
import { MUSCLE_LABELS } from '../workouts/recovery.js';
import { startRest, stopRest, unlockAudio, beep, buzz, fmtClock, setWantAwake } from '../timer.js';
import { openPlateCalculator, openCardioLog } from './tools.js';
import { openExercisePicker, equipmentText } from './picker.js';

const REST = { main: 150, secondary: 120, accessory: 75 };
let local = null; // working copy of the active workout
let saveTimer = null;
let clockTimer = null;
let holdTimer = null;
const closedIds = new Set(); // finished or discarded here; ignore stale "active" copies until the listener catches up

const round1 = (x) => Math.round(x * 10) / 10;
const disp = (kg) => (kg == null ? '' : String(round1(toUnit(kg, unit()))));

function save(now = false) {
  clearTimeout(saveTimer);
  const go = () => patch('workouts', local.id, { exercises: local.exercises, prs: local.prs, notes: local.notes || [] });
  if (now) go();
  else saveTimer = setTimeout(go, 400);
}

function syncLocal() {
  const w = state.workouts.find((x) => x.status === 'active' && !x.deleted && !closedIds.has(x.id));
  if (!w) {
    local = null;
    return;
  }
  // Keep our working copy while editing; only take the stored version when it's a different workout.
  if (!local || local.id !== w.id) local = structuredClone(w);
}

export function leaveSession() {
  clearInterval(clockTimer);
  clearInterval(holdTimer);
  setWantAwake(false);
  if (local && saveTimer) save(true);
}

function previousSets(exId) {
  const h = historyIndex().historyFor(exId);
  return h.length ? h[0].sets : [];
}

export function renderSession(el) {
  syncLocal();
  if (!local) {
    el.innerHTML = `<section class="stack"><h1>No workout running</h1><a class="btn" href="#/train">Go to Train</a></section>`;
    return;
  }
  setWantAwake(true);
  const u = unit();
  const loc = state.locations.find((l) => l.id === local.location_id);

  el.innerHTML = `
    <section class="stack session">
      <div class="row between center">
        <div>
          <p class="label">${esc(loc ? loc.name : '')}${local.deload ? ' · deload' : ''}</p>
          <h1>${esc(local.label)}</h1>
          <p class="muted small"><span data-clock>0:00</span> elapsed</p>
        </div>
        <button class="icon-btn" data-menu aria-label="Workout options">⋯</button>
      </div>
      ${(local.notes || []).map((n) => `<p class="notice info small">${esc(n)}</p>`).join('')}
      ${local.exercises.map((it, i) => exerciseCard(it, i, u)).join('')}
      <button class="btn ghost" data-add>+ Add exercise</button>
      <button class="btn" data-finish>Finish workout</button>
    </section>`;

  // Elapsed clock
  clearInterval(clockTimer);
  const clock = $('[data-clock]', el);
  const tickClock = () => (clock.textContent = fmtClock((Date.now() - Date.parse(local.started_at)) / 1000));
  tickClock();
  clockTimer = setInterval(tickClock, 1000);

  // Inputs: store on change without redrawing
  $$('input[data-w]', el).forEach((inp) => inp.addEventListener('change', () => {
    const [i, j] = inp.dataset.w.split(':').map(Number);
    const v = inp.value === '' ? null : Number(inp.value);
    local.exercises[i].sets[j].weight_kg = v == null || !Number.isFinite(v) ? null : fromUnit(v, u);
    save();
  }));
  $$('input[data-r]', el).forEach((inp) => inp.addEventListener('change', () => {
    const [i, j] = inp.dataset.r.split(':').map(Number);
    const v = inp.value === '' ? null : Math.round(Number(inp.value));
    local.exercises[i].sets[j].reps = v == null || !Number.isFinite(v) ? null : v;
    save();
  }));
  $$('[data-rir]', el).forEach((b) => b.addEventListener('click', () => {
    const [i, j] = b.dataset.rir.split(':').map(Number);
    const order = [null, 4, 3, 2, 1, 0];
    const s = local.exercises[i].sets[j];
    s.rir = order[(order.indexOf(s.rir ?? null) + 1) % order.length];
    b.textContent = rirLabel(s.rir);
    b.classList.toggle('set', s.rir != null);
    save();
  }));
  $$('[data-done]', el).forEach((b) => b.addEventListener('click', () => {
    unlockAudio();
    const [i, j] = b.dataset.done.split(':').map(Number);
    toggleDone(i, j, el);
  }));
  $$('[data-hold]', el).forEach((b) => b.addEventListener('click', () => {
    unlockAudio();
    const [i, j] = b.dataset.hold.split(':').map(Number);
    runHold(i, j, el);
  }));
  $$('[data-exmenu]', el).forEach((b) => b.addEventListener('click', () => exerciseMenu(Number(b.dataset.exmenu), el)));
  $$('[data-info]', el).forEach((b) => b.addEventListener('click', () => openHowTo(local.exercises[Number(b.dataset.info)].exercise_id)));
  $$('[data-chain]', el).forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.chain);
    swapExercise(i, exerciseById(local.exercises[i].next_step_id), el);
  }));
  $$('[data-addset]', el).forEach((b) => b.addEventListener('click', () => {
    const it = local.exercises[Number(b.dataset.addset)];
    const last = [...it.sets].reverse().find((s) => !s.warmup) || {};
    it.sets.push({ warmup: false, plan_weight_kg: last.weight_kg ?? last.plan_weight_kg ?? null, plan_reps: last.reps ?? last.plan_reps ?? null, weight_kg: null, reps: null, rir: null, done: false, completed_at: null });
    save();
    renderSession(el);
  }));
  $('[data-add]', el).onclick = () => addExercise(el);
  $('[data-finish]', el).onclick = () => finish(el);
  $('[data-menu]', el).onclick = () => workoutMenu(el);
}

const rirLabel = (r) => (r == null ? 'RIR' : r >= 4 ? '4+' : String(r));

function exerciseCard(it, i, u) {
  const ex = exerciseById(it.exercise_id) || { name: it.exercise_id, load: 'other', reps: [8, 12], equip: [[]] };
  const prev = previousSets(it.exercise_id);
  const bw = ['bodyweight', 'band', 'other'].includes(ex.load);
  const timed = !!ex.timed;
  let workIdx = 0;
  const rows = it.sets.map((s, j) => {
    const label = s.warmup ? 'W' : String(++workIdx);
    const p = !s.warmup ? prev[workIdx - 1] : null;
    const prevText = p ? (timed ? `${p.reps}s` : p.weight ? `${p.weight}×${p.reps}` : `${p.reps}`) : '—';
    return `
      <div class="setrow ${s.done ? 'done' : ''} ${s.warmup ? 'warm' : ''}">
        <span class="setno">${label}</span>
        <span class="prev">${esc(prevText)}</span>
        ${bw || timed ? (timed && ex.load !== 'bodyweight' && !bw
          ? `<input data-w="${i}:${j}" type="number" inputmode="decimal" step="0.5" placeholder="${disp(s.plan_weight_kg)}" value="${disp(s.weight_kg)}" aria-label="Weight ${u}">`
          : '<span class="bwtag">BW</span>')
          : `<input data-w="${i}:${j}" type="number" inputmode="decimal" step="0.5" placeholder="${disp(s.plan_weight_kg) || u}" value="${disp(s.weight_kg)}" aria-label="Weight ${u}">`}
        <input data-r="${i}:${j}" type="number" inputmode="numeric" placeholder="${s.plan_reps ?? (timed ? 's' : 'reps')}" value="${s.reps ?? ''}" aria-label="${timed ? 'Seconds' : 'Reps'}">
        ${timed ? `<button class="mini" data-hold="${i}:${j}" aria-label="Start timer">▶</button>` : `<button class="mini rir ${s.rir != null ? 'set' : ''}" data-rir="${i}:${j}" aria-label="Reps in reserve">${rirLabel(s.rir)}</button>`}
        <button class="setcheck" data-done="${i}:${j}" aria-label="${s.done ? 'Undo set' : 'Complete set'}">${s.done ? '✓' : ''}</button>
      </div>`;
  }).join('');
  const t = it.target || {};
  const range = timed ? `${t.rep_lo}–${t.rep_hi}s` : `${t.rep_lo}–${t.rep_hi} reps`;
  const next = it.next_step_id ? exerciseById(it.next_step_id) : null;
  return `
    <article class="card excard ${it.superset ? 'superset' : ''}" data-ex="${i}">
      <div class="row between center">
        <button class="exname" data-info="${i}"><b>${esc(ex.name)}</b>${it.superset ? ` <span class="pill">Superset ${esc(it.superset)}</span>` : ''}</button>
        <button class="icon-btn" data-exmenu="${i}" aria-label="Exercise options">⋯</button>
      </div>
      <p class="small muted">${esc(range)}${ex.unilateral ? ' · each side' : ''}${it.note ? ` · ${esc(it.note)}` : ''}</p>
      ${it.warning ? `<p class="notice warn small">${esc(it.warning)}</p>` : ''}
      ${next ? `<button class="notice info small chain" data-chain="${i}">Ready for the next step: <b>${esc(next.name)}</b>. Tap to switch.</button>` : ''}
      <div class="sethead"><span>Set</span><span>Last</span><span>${bw || timed ? '' : u}</span><span>${timed ? 'Sec' : 'Reps'}</span><span></span><span></span></div>
      ${rows}
      <button class="link small" data-addset="${i}">+ Add set</button>
    </article>`;
}

function toggleDone(i, j, el) {
  const it = local.exercises[i];
  const s = it.sets[j];
  const ex = exerciseById(it.exercise_id) || {};
  if (s.done) {
    s.done = false;
    s.completed_at = null;
    save();
    renderSession(el);
    return;
  }
  // Check first, using what's typed or the plan; only fill the set in once it passes.
  const reps = s.reps ?? s.plan_reps;
  const weight = s.weight_kg ?? s.plan_weight_kg ?? null;
  if (!reps || reps < 1) {
    toast(ex.timed ? 'Enter the seconds first.' : 'Enter your reps first.');
    return;
  }
  const loaded = !['bodyweight', 'band', 'other'].includes(ex.load) && !ex.timed;
  if (loaded && weight == null && !s.warmup) {
    toast('Enter the weight first.');
    return;
  }
  s.reps = reps;
  s.weight_kg = weight;
  s.done = true;
  s.completed_at = new Date().toISOString();
  haptic(15);

  // PRs (working sets only)
  if (!s.warmup && ex.id) {
    const u = unit();
    const sessionSets = it.sets.filter((x) => x.done && !x.warmup).map((x) => ({ weight: x.weight_kg == null ? null : round1(toUnit(x.weight_kg, u)), reps: x.reps }));
    const prs = detectPRs(ex, sessionSets, historyIndex().historyFor(ex.id));
    const fresh = prs.filter((p) => !local.prs.some((q) => q.exercise_id === ex.id && q.type === p.type && q.value >= p.value));
    if (fresh.length) {
      local.prs = local.prs.filter((q) => !(q.exercise_id === ex.id && fresh.some((p) => p.type === q.type)));
      fresh.forEach((p) => local.prs.push({ exercise_id: ex.id, type: p.type, value: p.value, label: `${ex.name}: ${p.label}${p.type === 'e1rm' || p.type === 'weight' ? ' ' + u : ''}` }));
      celebrate(fresh.map((p) => `${ex.name}: ${p.label}${p.type === 'e1rm' || p.type === 'weight' ? ' ' + u : ''}`));
    }
  }
  save();

  // Rest: after a superset's last member, or after any normal set.
  const group = it.superset;
  if (group) {
    const members = local.exercises.map((x, k) => [x, k]).filter(([x]) => x.superset === group);
    const lastMember = members[members.length - 1][1];
    if (i !== lastMember) {
      const nxt = local.exercises[members.find(([, k]) => k > i)[1]];
      stopRest();
      toast(`Now: ${exerciseById(nxt.exercise_id)?.name || 'next exercise'}`);
    } else startRest(REST.accessory, 'Rest (superset)');
  } else if (!s.warmup) {
    const base = ex.timed ? 60 : REST[it.role] || 90;
    startRest(Math.round(local.deload ? base * 0.8 : base), 'Rest');
  } else {
    startRest(45, 'Warm-up rest');
  }
  renderSession(el);
}

function runHold(i, j, el) {
  const s = local.exercises[i].sets[j];
  const target = s.reps || s.plan_reps || 30;
  clearInterval(holdTimer);
  stopRest();
  const end = Date.now() + target * 1000 + 3000;
  sheet('Timer', (body, close) => {
    body.innerHTML = `<div class="holdclock" aria-live="polite"><p class="label" data-phase>Get ready</p><b data-left>3</b></div>
      <button class="btn ghost" data-stop>Stop</button>`;
    let warned = false;
    const left = $('[data-left]', body);
    const phase = $('[data-phase]', body);
    beep({ freq: 660 });
    holdTimer = setInterval(() => {
      const ms = end - Date.now();
      if (ms > target * 1000) {
        left.textContent = Math.ceil((ms - target * 1000) / 1000);
        return;
      }
      if (!warned) {
        warned = true;
        phase.textContent = 'Go';
        beep({ freq: 990 });
      }
      left.textContent = fmtClock(ms / 1000);
      if (ms <= 0) {
        clearInterval(holdTimer);
        beep({ freq: 990, ms: 400 });
        buzz();
        s.reps = target;
        close();
        toggleDone(i, j, el);
      }
    }, 200);
    $('[data-stop]', body).onclick = () => {
      clearInterval(holdTimer);
      const done = Math.round(target - Math.max(0, (end - Date.now()) / 1000));
      close();
      if (done > 0) {
        s.reps = done;
        save();
        renderSession(el);
      }
    };
  });
}

function availableHere() {
  const loc = state.locations.find((l) => l.id === local.location_id) || activeLocation();
  return expandEquipment(loc ? loc.equipment : []);
}

function buildEntry(ex, role = 'accessory') {
  const u = unit();
  const loc = state.locations.find((l) => l.id === local.location_id) || activeLocation();
  const t = nextTarget(ex, historyIndex().historyFor(ex.id), { inventory: (loc && loc.weight_inventory) || {}, unit: u, role, experience: state.profile.experience, deload: local.deload });
  const kg = (x) => (x == null ? null : fromUnit(x, u));
  const wu = role !== 'accessory' && t.weight ? warmups(ex, t.weight, { inventory: (loc && loc.weight_inventory) || {}, unit: u }) : [];
  return {
    exercise_id: ex.id, role, superset: null, note: t.note || '', next_step_id: null,
    target: { sets: t.sets, rep_lo: t.repLo, rep_hi: t.repHi, reps: t.reps, weight_kg: kg(t.weight), rir: t.rir, mode: t.mode },
    sets: [
      ...wu.map((w) => ({ warmup: true, plan_weight_kg: kg(w.weight), plan_reps: w.reps, weight_kg: null, reps: null, rir: null, done: false, completed_at: null })),
      ...Array.from({ length: t.sets }, () => ({ warmup: false, plan_weight_kg: kg(t.weight), plan_reps: t.reps, weight_kg: null, reps: null, rir: null, done: false, completed_at: null })),
    ],
  };
}

function swapExercise(i, ex, el) {
  if (!ex) return;
  const old = local.exercises[i];
  if (old.sets.some((s) => s.done)) {
    toast('Finish or undo the completed sets first, or add the new exercise instead.');
    return;
  }
  const entry = buildEntry(ex, old.role);
  entry.superset = old.superset;
  local.exercises[i] = entry;
  save();
  renderSession(el);
}

function addExercise(el) {
  const avail = availableHere();
  openExercisePicker({
    title: 'Add exercise',
    filter: (e) => canDo(e, avail),
    availableNote: 'Showing what you can do at this location.',
    onPick: (ex) => {
      local.exercises.push(buildEntry(ex, 'accessory'));
      save();
      renderSession(el);
    },
  });
}

function exerciseMenu(i, el) {
  const it = local.exercises[i];
  const ex = exerciseById(it.exercise_id) || {};
  sheet(ex.name || 'Exercise', (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <button class="btn ghost" data-a="swap">Swap for a similar exercise</button>
        ${ex.load === 'barbell' ? '<button class="btn ghost" data-a="plates">Plate calculator</button>' : ''}
        <button class="btn ghost" data-a="how">How to do it</button>
        <div class="row gap">
          <button class="btn ghost grow" data-a="up" ${i === 0 ? 'disabled' : ''}>Move up</button>
          <button class="btn ghost grow" data-a="down" ${i === local.exercises.length - 1 ? 'disabled' : ''}>Move down</button>
        </div>
        <button class="btn ghost" data-a="dropset">Remove last unfinished set</button>
        <button class="btn danger-ghost" data-a="remove">Remove exercise</button>
      </div>`;
    body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      close();
      if (a === 'swap') {
        const avail = availableHere();
        openExercisePicker({
          title: `Swap ${ex.name}`,
          onlyPattern: ex.pattern,
          filter: (c) => c.id !== ex.id && canDo(c, avail),
          availableNote: 'Same movement, doable at this location.',
          onPick: (c) => swapExercise(i, c, el),
        });
      } else if (a === 'plates') {
        const w = [...it.sets].reverse().find((s) => s.weight_kg || s.plan_weight_kg);
        openPlateCalculator(w ? round1(toUnit(w.weight_kg || w.plan_weight_kg, unit())) : null);
      } else if (a === 'how') {
        openHowTo(ex.id);
      } else if (a === 'up' || a === 'down') {
        const k = a === 'up' ? i - 1 : i + 1;
        [local.exercises[i], local.exercises[k]] = [local.exercises[k], local.exercises[i]];
        save();
        renderSession(el);
      } else if (a === 'dropset') {
        const idx = it.sets.map((s) => !s.done).lastIndexOf(true);
        if (idx >= 0) it.sets.splice(idx, 1);
        save();
        renderSession(el);
      } else if (a === 'remove') {
        local.exercises.splice(i, 1);
        save();
        renderSession(el);
      }
    });
  });
}

export async function openHowTo(id) {
  const ex = exerciseById(id);
  if (!ex) return;
  sheet(ex.name, async (body) => {
    body.innerHTML = `
      <div class="stack">
        <p class="small muted">${esc(equipmentText(ex))}</p>
        <p><b>Works:</b> ${esc(ex.primary.map((m) => MUSCLE_LABELS[m] || m).join(', '))}${ex.secondary.length ? `<span class="muted"> · also ${esc(ex.secondary.map((m) => MUSCLE_LABELS[m] || m).join(', '))}</span>` : ''}</p>
        <div><p class="label">Form cues</p><ul class="reasons">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('') || '<li class="muted">No cues yet</li>'}</ul></div>
        <div data-steps><p class="small muted">Loading steps…</p></div>
      </div>`;
    try {
      const all = await loadInstructions();
      const steps = all[id];
      $('[data-steps]', body).innerHTML = steps
        ? `<p class="label">Step by step</p><ol class="reasons">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
           <p class="small muted">Steps from free-exercise-db (public domain).</p>`
        : '';
    } catch {
      $('[data-steps]', body).innerHTML = '';
    }
  });
}

function workoutMenu(el) {
  sheet('Workout', (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <button class="btn ghost" data-a="plates">Plate calculator</button>
        <button class="btn danger-ghost" data-a="discard">Discard this workout</button>
      </div>`;
    body.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      close();
      if (a === 'plates') openPlateCalculator();
      if (a === 'discard') {
        const ok = await confirmSheet({ title: 'Discard workout?', message: 'Nothing from this session will be saved to your history.', confirmLabel: 'Discard', danger: true });
        if (!ok) return;
        stopRest();
        closedIds.add(local.id);
        softDelete('workouts', local.id);
        patch('workouts', local.id, { status: 'discarded' });
        local = null;
        location.hash = '#/train';
      }
    });
  });
}

function finish(el) {
  const u = unit();
  const work = local.exercises.flatMap((it) => it.sets.filter((s) => s.done && !s.warmup).map((s) => ({ ...s, it })));
  const undone = local.exercises.reduce((n, it) => n + it.sets.filter((s) => !s.done && !s.warmup).length, 0);
  const volume = work.reduce((v, s) => v + (s.weight_kg ? toUnit(s.weight_kg, u) * s.reps : 0), 0);
  const minutes = Math.round((Date.now() - Date.parse(local.started_at)) / 60000);
  const timedMin = Math.round(work.filter((s) => exerciseById(s.it.exercise_id)?.timed).reduce((m, s) => m + s.reps, 0) / 60);
  sheet('Finish workout', (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <div class="stats">
          <div><span>Time</span><b>${minutes} min</b></div>
          <div><span>Sets</span><b>${work.length}</b></div>
          <div><span>Volume</span><b>${Math.round(volume).toLocaleString()} ${u}</b></div>
        </div>
        ${local.prs.length ? `<div class="card prs"><p class="label">New PRs 🏆</p><ul class="reasons">${local.prs.map((p) => `<li>${esc(p.label)}</li>`).join('')}</ul></div>` : ''}
        ${undone ? `<p class="small muted">${undone} planned set${undone === 1 ? '' : 's'} not done. They won’t count, and that’s fine.</p>` : ''}
        ${work.length ? `
          <button class="btn" data-ok>Save workout</button>
          <button class="btn ghost" data-no>Keep going</button>` : `
          <p class="notice warn">No sets completed, so there’s nothing to save. Discarding keeps it out of your history and your program rotation.</p>
          <button class="btn danger" data-discard>Discard workout</button>
          <button class="btn ghost" data-no>Keep going</button>`}
      </div>`;
    $('[data-no]', body).onclick = close;
    const discard = $('[data-discard]', body);
    if (discard) {
      discard.onclick = () => {
        stopRest();
        clearTimeout(saveTimer);
        closedIds.add(local.id);
        softDelete('workouts', local.id);
        patch('workouts', local.id, { status: 'discarded' });
        local = null;
        close();
        leaveSession();
        toast('Workout discarded');
        location.hash = '#/train';
      };
      return;
    }
    $('[data-ok]', body).onclick = () => {
      stopRest();
      clearTimeout(saveTimer);
      patch('workouts', local.id, { exercises: local.exercises, prs: local.prs, status: 'done', finished_at: new Date().toISOString() });
      const conditioning = timedMin >= 5 && local.day_type === 'boxing';
      closedIds.add(local.id);
      local = null;
      close();
      leaveSession();
      toast(work.length ? 'Workout saved. Nice work!' : 'Workout saved');
      if (conditioning) openCardioLog({ activity: 'boxing', duration_min: minutes, notes: 'Boxing conditioning session' });
      location.hash = '#/today';
    };
  });
}
