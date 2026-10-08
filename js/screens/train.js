// Train hub: pick a location, see today's plan, start or resume, recovery, program, tools.
import { state } from '../state.js';
import { cachePhotos, hasPhotos, photoUrls, loadPhotoIndex } from '../ui/photos.js';
import { hasFigure, mountFigure } from '../ui/figure.js';
import { expandEquipment, canDo } from '../workouts/equipment.js';
import { REST } from '../workouts/session-core.js';
import { planBlocks, planMuscles } from '../workouts/preview.js';
import { openHowTo } from './howto.js';
import { bodyMap, exerciseValues } from '../ui/bodymap.js';
import { esc, $, $$, sheet, toast, confirmSheet } from '../ui.js';
import {
  activeLocation, setActiveLocation, activeProgram, startProgram, activeWorkout, planToday, startWorkout,
  currentRecovery, stalledMainLifts, startDeload, unit,
} from '../workouts/plan.js';
import { PROGRAMS, DAY_TYPES, smartDayTypes } from '../workouts/programs.js';
import { deloadInfo } from '../workouts/generator.js';
import { exerciseById } from '../workouts/library.js';
import { openPlateCalculator, openCardioLog } from './tools.js';
import { openExercisePicker } from './picker.js';
import { patch } from '../db.js';
import { unlockAudio } from '../ui/sound.js';

/** Guided player by default; List view if you chose it in Settings. */
export const playerRoute = () => (state.settings && state.settings.player === 'list' ? '#/session' : '#/play');

let dayOverride = null;

// Edits made in the preview before Start: ⋯ → Replace, ⋯ → Rest timer, and Switch. They belong to one
// location + day; changing either starts fresh.
let edits = { key: '', forced: {}, rest: {}, avoid: [] };
const editsFor = (key) => {
  if (edits.key !== key) edits = { key, forced: {}, rest: {}, avoid: [] };
  return edits;
};
/**
 * Today's plan with the preview edits applied (Replace, Rest timer, Switch, a different day), so Today's
 * card and its Start button show and start exactly what Train shows.
 */
export function previewPlan() {
  const loc = activeLocation();
  if (!loc) return null;
  const ed = editsFor(`${loc.id}|${dayOverride || ''}`);
  const plan = planToday({ dayType: dayOverride, forced: ed.forced, avoidIds: ed.avoid });
  if (plan) for (const it of plan.exercises) if (ed.rest[it.exercise_id]) it.rest_sec = ed.rest[it.exercise_id];
  return plan;
}

/** Start a previewed plan (Train or Today): unlock audio on this tap, cache today's photos, go. */
export function startPlan(plan) {
  unlockAudio(); // this tap unlocks sound + voice for the 3-2-1 GO on iPhone
  startWorkout(plan);
  cachePhotos(plan.exercises.map((it) => it.exercise_id)); // today's demo photos, for the gym's dead zones
  dayOverride = null;
  edits = { key: '', forced: {}, rest: {}, avoid: [] };
  location.hash = playerRoute();
}

const REST_CHOICES = [60, 90, 120, 150, 180, 240];
const fmtRest = (sec) => (sec % 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec / 60} min`);


export function targetText(t, u, ex) {
  const reps = ex && ex.timed ? `${t.reps}s` : t.repLo === t.repHi ? `${t.repHi}` : t.mode === 'start' ? `${t.repLo}–${t.repHi}` : `${t.reps}`;
  const w = t.weight ? ` · ${t.weight} ${u}` : '';
  return `${t.sets} × ${reps}${w}`;
}

function dayChoices(program) {
  const templ = program ? program.template : 'smart';
  const p = PROGRAMS[templ];
  if (p.custom) return (program.custom_days || []).map((d, i) => [`custom_${i}`, d.name]);
  const keys = p.smart ? [...new Set([...smartDayTypes(state.profile.trainingDays || 3), 'full_a', 'upper', 'lower', 'push', 'pull', 'legs', 'boxing'])] : p.days;
  return keys.map((k) => [k, DAY_TYPES[k].label]);
}

export function renderTrain(el) {
  if (!state.programs.some((p) => p.active)) {
    startProgram('smart');
    return; // the new program arrives through the listener and re-renders
  }
  const u = unit();
  const loc = activeLocation();
  const program = activeProgram();
  const active = activeWorkout();
  const plan = !active && loc ? previewPlan() : null;
  const d = deloadInfo(program, state.profile.experience);
  const stalled = !active ? stalledMainLifts() : [];
  const rec = currentRecovery();

  el.innerHTML = `
    <section class="stack">
      <h1>Train</h1>

      <div class="chips" role="radiogroup" aria-label="Location">
        ${state.locations.map((l) => `
          <label class="chip"><input type="radio" name="loc" value="${esc(l.id)}" ${loc && l.id === loc.id ? 'checked' : ''}><span>${esc(l.name)}</span></label>`).join('')}
      </div>

      ${active ? `
        <a class="card resume" href="${playerRoute()}">
          <p class="label">In progress</p>
          <p class="big-title">${esc(active.label)}</p>
          <p class="muted small">Started ${new Date(active.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
          <span class="btn">Resume workout</span>
        </a>` : ''}

      ${stalled.length >= 2 ? `
        <div class="notice warn">
          ${stalled.length} main lifts have stalled (${stalled.map((id) => esc(exerciseById(id)?.name || id)).join(', ')}). A lighter week often breaks a plateau.
          <div class="row gap" style="margin-top:8px"><button class="btn small" data-deload>Start a deload week</button></div>
        </div>` : ''}

      ${plan ? previewCard(plan, { d, loc, program, u }) : ''}
      ${!loc ? '<div class="notice warn">Add a location in Settings → Locations first.</div>' : ''}

      <div class="card">
        <div class="row between center">
          <p class="label">Program</p>
          <button class="link small" data-program>Change</button>
        </div>
        <p><b>${esc(PROGRAMS[program.template]?.name || program.name)}</b></p>
        <p class="small muted">Week ${d.week} of ${d.cycle}${d.deload ? ' — deload week' : ` · deload in week ${d.cycle}`}</p>
      </div>

      <a class="card row between center nav-card" href="#/body">
        <div><p class="label">Recovery</p><p>${['chest', 'lats', 'quads', 'hamstrings', 'glutes', 'front_delts'].filter((m) => rec[m] >= 85).length} of 6 major muscles fresh</p></div>
        <span aria-hidden="true">›</span>
      </a>

      <div class="tools">
        <a class="tool" href="#/timer"><span aria-hidden="true">⏱</span>Interval timer</a>
        <button class="tool" data-cardio><span aria-hidden="true">🚴</span>Log cardio</button>
        <button class="tool" data-plates><span aria-hidden="true">🏋️</span>Plate calculator</button>
        <a class="tool" href="#/library"><span aria-hidden="true">📚</span>Exercise library</a>
        <a class="tool" href="#/history"><span aria-hidden="true">📈</span>History &amp; PRs</a>
      </div>
    </section>`;

  $$('input[name=loc]', el).forEach((r) =>
    r.addEventListener('change', () => {
      dayOverride = null;
      setActiveLocation(r.value);
    })
  );
  const day = $('[data-day]', el);
  if (day)
    day.addEventListener('change', () => {
      dayOverride = day.value || null;
      renderTrain(el);
    });
  if (plan) wirePreview(el, plan);
  const start = $('[data-start]', el);
  if (start)
    start.onclick = () => startPlan(plan);
  const dl = $('[data-deload]', el);
  if (dl) dl.onclick = () => { startDeload(); toast('Deload week started'); };
  $('[data-program]', el).onclick = () => openProgramPicker();
  $('[data-cardio]', el).onclick = () => openCardioLog();
  $('[data-plates]', el).onclick = () => openPlateCalculator();
}

function previewCard(plan, { d, loc, program, u }) {
  const n = plan.exercises.length;
  const muscles = planMuscles(plan.exercises, exerciseById);
  const warm = plan.exercises.filter((it) => it.warmups.length);
  const row = ({ it, i }, label) => {
    const ex = exerciseById(it.exercise_id);
    const rest = it.rest_sec ? ` · rest ${fmtRest(it.rest_sec)}` : '';
    return `<li class="pv-ex">
      <div class="pv-thumb" data-thumb="${esc(ex.id)}" aria-hidden="true"></div>
      <div class="pv-txt">${label ? `<span class="pv-tag">${label}</span>` : ''}<b>${esc(ex.name)}</b>
        <small class="muted">${esc(targetText(it.target, u, ex))}${it.warmups.length ? ` · ${it.warmups.length} warm-up` : ''}${rest}</small></div>
      <button class="icon-btn pv-more" data-more="${i}" aria-label="More for ${esc(ex.name)}">⋯</button>
    </li>`;
  };
  const blocks = planBlocks(plan.exercises).map((b) => (b.group
    ? `<li class="pv-group"><p class="pv-group-h"><span>${b.kind} ${esc(b.group)}</span><small class="muted">${b.rounds} rounds · rest after each round</small></p>
        <ol class="pv-list">${b.items.map((x, k) => row(x, `${esc(b.group)}${k + 1}`)).join('')}</ol></li>`
    : row(b.items[0], '')));
  return `
      <div class="card preview">
        <p class="label">Today${d.deload ? ' · deload' : ''}</p>
        <div class="row between center">
          <p class="big-title">${esc(plan.label)}</p>
          ${n ? '<button class="btn ghost small" data-switch aria-label="Switch exercises">⇄ Switch</button>' : ''}
        </div>
        <div class="pv-chips">
          <span class="pill">⏱ ~${plan.est_minutes} min</span>
          <span class="pill">📍 ${esc(loc.name)}</span>
        </div>
        <label class="field"><span class="small muted">Or train a different day</span>
          <select data-day>
            <option value="">Recommended</option>
            ${dayChoices(program).map(([k, l]) => `<option value="${k}" ${dayOverride === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </label>
        ${plan.notes.map((x) => `<p class="notice info small">${esc(x)}</p>`).join('')}
        ${n ? `
        <div class="pv-sum">
          ${bodyMap(planValues(plan), { size: 'mini', caption: false })}
          <p><b>${n} exercise${n === 1 ? '' : 's'} · ${muscles} muscle${muscles === 1 ? '' : 's'}</b><small class="muted">Tap ⋯ to replace an exercise, see its history or set its rest.</small></p>
        </div>
        <div class="pv-warm">
          <p class="pv-group-h"><span>Warm-up</span><small class="muted">~5 min</small></p>
          <ul class="pv-wlist">
            <li>3–5 min easy cardio or brisk walk</li>
            <li>Arm circles, hip hinges and bodyweight squats, 10 each</li>
            ${warm.map((it) => `<li>${esc(exerciseById(it.exercise_id).name)}: ${it.warmups.length} lighter set${it.warmups.length === 1 ? '' : 's'} first (built in)</li>`).join('')}
          </ul>
        </div>
        <ol class="pv-list">${blocks.join('')}</ol>
        <button class="btn" data-start>Start workout</button>` : '<p class="muted">Nothing fits this location. Add equipment in Settings → Locations.</p>'}
      </div>`;
}

/** Thumbnails, ⋯ menus and Switch for the preview card. */
function wirePreview(el, plan) {
  const thumbs = $$('[data-thumb]', el);
  const paintThumbs = () => thumbs.forEach((t) => {
    if (t.childElementCount) return;
    const ex = exerciseById(t.dataset.thumb);
    if (!ex) return;
    if (hasFigure(ex.id)) mountFigure(t, ex, { at: 'hard' });
    else if (hasPhotos(ex.id)) {
      t.innerHTML = `<img src="${esc(photoUrls(ex.id)[0])}" alt="" decoding="async" loading="lazy">`;
      t.firstChild.addEventListener('error', () => { t.innerHTML = bodyMap(exerciseValues(ex), { size: 'mini', caption: false }); }, { once: true });
    } else t.innerHTML = bodyMap(exerciseValues(ex), { size: 'mini', caption: false });
  });
  paintThumbs();
  // Photos join in when the photo list arrives (weak signal): repaint the ones still on the map.
  loadPhotoIndex().then(() => thumbs.forEach((t) => {
    if (!t.isConnected || hasFigure(t.dataset.thumb) || !hasPhotos(t.dataset.thumb) || t.querySelector('img')) return;
    t.innerHTML = '';
    paintThumbs();
  }));

  const sw = $('[data-switch]', el);
  if (sw) sw.onclick = () => {
    const ed = edits;
    const now = plan.exercises.map((it) => it.exercise_id);
    ed.avoid = [...new Set([...ed.avoid, ...now])];
    ed.forced = {};
    const fresh = planToday({ dayType: dayOverride, forced: {}, avoidIds: ed.avoid });
    const changed = fresh ? fresh.exercises.filter((it) => !now.includes(it.exercise_id)).length : 0;
    if (!changed) {
      ed.avoid = []; // nothing else fits: start the rotation over
      toast('No other options here for this day. Back to the recommended picks.');
    } else toast(`Switched ${changed} exercise${changed === 1 ? '' : 's'}`);
    renderTrain(el);
  };

  $$('[data-more]', el).forEach((b) => (b.onclick = () => exerciseMore(el, plan, Number(b.dataset.more))));
}

function exerciseMore(el, plan, i) {
  const it = plan.exercises[i];
  const ex = exerciseById(it.exercise_id);
  const ed = edits;
  const auto = it.superset ? REST.accessory : REST[it.role] || 90;
  sheet(ex.name, (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <button class="btn ghost" data-a="replace">Replace</button>
        <button class="btn ghost" data-a="history">History &amp; how-to</button>
        <div>
          <p class="label">Rest timer</p>
          <div class="chips" role="radiogroup" aria-label="Rest after each set">
            <label class="chip"><input type="radio" name="rest" value="" ${it.rest_sec ? '' : 'checked'}><span>Auto (${fmtRest(auto)})</span></label>
            ${REST_CHOICES.map((sec) => `<label class="chip"><input type="radio" name="rest" value="${sec}" ${it.rest_sec === sec ? 'checked' : ''}><span>${fmtRest(sec)}</span></label>`).join('')}
          </div>
        </div>
      </div>`;
    $('[data-a="replace"]', body).onclick = () => {
      close();
      const loc = activeLocation();
      const avail = expandEquipment(loc ? loc.equipment : []);
      const inPlan = new Set(plan.exercises.map((x) => x.exercise_id));
      openExercisePicker({
        title: `Replace ${ex.name}`,
        onlyPattern: ex.pattern,
        filter: (c) => !inPlan.has(c.id) && canDo(c, avail),
        availableNote: 'Same movement, doable at this location.',
        onPick: (c) => {
          // Key by what the generator picks for this slot, so the swap survives re-renders.
          const orig = Object.keys(ed.forced).find((k) => ed.forced[k] === ex.id) || ex.id;
          ed.forced[orig] = c.id;
          if (ed.rest[ex.id]) { ed.rest[c.id] = ed.rest[ex.id]; delete ed.rest[ex.id]; }
          toast(`Replaced with ${c.name}`);
          renderTrain(el);
        },
      });
    };
    $('[data-a="history"]', body).onclick = () => { close(); openHowTo(ex.id, { focus: 'history' }); };
    $$('input[name=rest]', body).forEach((r) => r.addEventListener('change', () => {
      if (r.value) ed.rest[ex.id] = Number(r.value);
      else delete ed.rest[ex.id];
      close();
      renderTrain(el);
    }));
  });
}

function openProgramPicker() {
  const current = activeProgram();
  sheet('Choose a program', (body, close) => {
    body.innerHTML = `
      <div class="choices">
        ${Object.entries(PROGRAMS).map(([k, p]) => `
          <label class="choice">
            <input type="radio" name="prog" value="${k}" ${current && current.template === k ? 'checked' : ''}>
            <span>${esc(p.name)}<small>${esc(p.description)}</small></span>
          </label>`).join('')}
      </div>
      <p class="small muted">Switching starts a new cycle (week 1). Your history and progress carry over.</p>
      <div class="row gap"><button class="btn grow" data-ok>Use this program</button></div>`;
    $('[data-ok]', body).onclick = async () => {
      const k = $('input[name=prog]:checked', body)?.value;
      if (!k) return;
      close();
      if (PROGRAMS[k].custom) {
        openCustomBuilder(current && current.template === 'custom' ? current : null);
        return;
      }
      if (current && current.template === k) return;
      startProgram(k);
      dayOverride = null;
      toast(`Program: ${PROGRAMS[k].name}`);
    };
  });
}

/**
 * Build my own. `existing` is the saved custom program (or null); `draftDays` carries unsaved edits
 * while the builder hops to the exercise picker and back.
 */
function openCustomBuilder(existing, draftDays = null) {
  const days = draftDays || (existing ? structuredClone(existing.custom_days || []) : [{ name: 'Day 1', exercise_ids: [] }]);
  sheet('Build my own', (body, close) => {
    const draw = () => {
      body.innerHTML = `
        <div class="stack">
          ${days.map((d, i) => `
            <div class="card">
              <div class="row gap center">
                <input class="grow" value="${esc(d.name)}" data-name="${i}" aria-label="Day name" maxlength="30">
                <button class="icon-btn" data-delday="${i}" aria-label="Remove day">✕</button>
              </div>
              <ul class="list">${d.exercise_ids.map((id, j) => `
                <li><span>${esc(exerciseById(id)?.name || id)}</span><button class="icon-btn" data-delex="${i}:${j}" aria-label="Remove">✕</button></li>`).join('') || '<li class="muted">No exercises yet</li>'}</ul>
              <button class="btn ghost small" data-addex="${i}">+ Add exercise</button>
            </div>`).join('')}
          ${days.length < 7 ? '<button class="btn ghost" data-addday>+ Add a day</button>' : ''}
          <p class="small muted">On the day, exercises your location can’t do are skipped.</p>
          <button class="btn" data-save>Save program</button>
        </div>`;
      $$('[data-name]', body).forEach((inp) =>
        inp.addEventListener('change', () => (days[Number(inp.dataset.name)].name = inp.value.trim() || `Day ${Number(inp.dataset.name) + 1}`)));
      $$('[data-delday]', body).forEach((b) => (b.onclick = () => { days.splice(Number(b.dataset.delday), 1); draw(); }));
      $$('[data-delex]', body).forEach((b) => (b.onclick = () => {
        const [i, j] = b.dataset.delex.split(':').map(Number);
        days[i].exercise_ids.splice(j, 1);
        draw();
      }));
      $$('[data-addex]', body).forEach((b) => (b.onclick = () => {
        const i = Number(b.dataset.addex);
        close();
        openExercisePicker({
          title: `Add to ${days[i].name}`,
          onPick: (ex) => {
            days[i].exercise_ids.push(ex.id);
            openCustomBuilder(existing, days);
          },
        });
      }));
      const add = $('[data-addday]', body);
      if (add) add.onclick = () => { days.push({ name: `Day ${days.length + 1}`, exercise_ids: [] }); draw(); };
      $('[data-save]', body).onclick = () => {
        const kept = days.filter((d) => d.exercise_ids.length);
        if (!kept.length) { toast('Add at least one exercise.'); return; }
        if (existing) patch('programs', existing.id, { custom_days: kept });
        else startProgram('custom', { custom_days: kept });
        dayOverride = null;
        close();
        toast('Program saved');
      };
    };
    draw();
  });
}

/** Today's plan → muscle values for the preview map: working sets per muscle (secondary half), scaled to 0..1. */
function planValues(plan) {
  const v = {};
  for (const it of plan.exercises) {
    const ex = exerciseById(it.exercise_id);
    if (!ex || ex.kind === 'conditioning') continue;
    const n = it.target?.sets || 1;
    for (const m of ex.primary || []) v[m] = (v[m] || 0) + n;
    for (const m of ex.secondary || []) v[m] = (v[m] || 0) + n * 0.5;
  }
  const max = Math.max(1, ...Object.values(v));
  for (const m of Object.keys(v)) v[m] = 0.25 + 0.75 * (v[m] / max);
  return v;
}
