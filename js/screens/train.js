// Train hub: pick a location, see today's plan, start or resume, recovery, program, tools.
import { state } from '../state.js';
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
  const plan = !active && loc ? planToday({ dayType: dayOverride }) : null;
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

      ${plan ? `
      <div class="card">
        <div class="row between center">
          <div>
            <p class="label">Today${d.deload ? ' · deload' : ''}</p>
            <p class="big-title">${esc(plan.label)}</p>
            <p class="muted small">About ${plan.est_minutes} min at ${esc(loc.name)}</p>
          </div>
        </div>
        <label class="field"><span class="small muted">Or train a different day</span>
          <select data-day>
            <option value="">Recommended</option>
            ${dayChoices(program).map(([k, l]) => `<option value="${k}" ${dayOverride === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </label>
        ${plan.notes.map((n) => `<p class="notice info small">${esc(n)}</p>`).join('')}
        <ol class="plan-list">
          ${plan.exercises.map((it) => {
            const ex = exerciseById(it.exercise_id);
            return `<li>
              <div><b>${esc(ex.name)}</b>${it.superset ? ` <span class="pill">Superset ${it.superset}</span>` : ''}
              <small class="muted">${esc(targetText(it.target, u, ex))}${it.warmups.length ? ` · ${it.warmups.length} warm-up` : ''}</small></div>
            </li>`;
          }).join('')}
        </ol>
        ${plan.exercises.length ? '<button class="btn" data-start>Start workout</button>' : '<p class="muted">Nothing fits this location. Add equipment in Settings → Locations.</p>'}
      </div>` : ''}
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
  const start = $('[data-start]', el);
  if (start)
    start.onclick = () => {
      unlockAudio(); // this tap unlocks sound + voice for the 3-2-1 GO on iPhone
      startWorkout(plan);
      dayOverride = null;
      location.hash = playerRoute();
    };
  const dl = $('[data-deload]', el);
  if (dl) dl.onclick = () => { startDeload(); toast('Deload week started'); };
  $('[data-program]', el).onclick = () => openProgramPicker();
  $('[data-cardio]', el).onclick = () => openCardioLog();
  $('[data-plates]', el).onclick = () => openPlateCalculator();
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
