// Body tab. v0.3.0: recovery per muscle (moved here from Train), fresh-muscle count and days since your
// last workout. v0.3.1 replaces the bars with the front/back recovery heatmap; later, strength score
// and weekly set targets live here too.
import { state } from '../state.js';
import { esc } from '../ui.js';
import { currentRecovery, historyIndex } from '../workouts/plan.js';
import { MUSCLE_LABELS } from '../workouts/recovery.js';

const SHOW = ['chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'traps', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'lower_back', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves'];

export function renderBody(el) {
  const rec = currentRecovery();
  const fresh = SHOW.filter((m) => rec[m] >= 85).length;
  const last = historyIndex().done[0];
  const days = last ? Math.floor((Date.now() - Date.parse(last.finished_at || last.started_at)) / 86400000) : null;
  const sorted = [...SHOW].sort((a, b) => rec[a] - rec[b]);
  el.innerHTML = `
    <section class="stack">
      <h1>Body</h1>
      <div class="body-hero">
        <div><b>${fresh}</b><span>fresh muscle groups</span></div>
        <div><b>${days == null ? '—' : days}</b><span>${days === 1 ? 'day' : 'days'} since last workout</span></div>
      </div>
      <div class="card">
        <p class="label">Recovery</p>
        <p class="small muted">Based on your sets, effort and time since (big muscles ~72 h, small ~48 h). Least recovered first.</p>
        <div class="recovery">
          ${sorted.map((m) => `
            <div class="rec-row"><span>${esc(MUSCLE_LABELS[m])}</span>
              <div class="rec-bar" role="img" aria-label="${esc(MUSCLE_LABELS[m])} ${rec[m]}% recovered"><i style="width:${rec[m]}%" class="${rec[m] < 50 ? 'low' : rec[m] < 85 ? 'mid' : ''}"></i></div>
              <b>${rec[m]}%</b></div>`).join('')}
        </div>
      </div>
      <p class="small muted tcenter">The front/back recovery heatmap arrives in v0.3.1.</p>
    </section>`;
  void state;
}
