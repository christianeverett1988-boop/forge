// Body tab: the recovery heatmap (front and back, red / amber / green from the recovery model), fresh-muscle
// count and days since your last workout. Tap a muscle for its %, when you last trained it and its sets
// this week. (Strength score and weekly set targets come later.)
import { state } from '../state.js';
import { esc, $$, sheet } from '../ui.js';
import { currentRecovery, historyIndex } from '../workouts/plan.js';
import { exerciseById } from '../workouts/library.js';
import { MUSCLE_LABELS, muscleStats } from '../workouts/recovery.js';
import { bodyMap, musclesIn, regionLabel, recoveryColor } from '../ui/bodymap.js';

const SHOW = ['chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'traps', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'lower_back', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves'];

const ago = (iso) => {
  if (!iso) return 'Not trained yet';
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};
const status = (pct) => (pct < 50 ? 'Needs rest' : pct < 85 ? 'Recovering' : 'Ready');

export function renderBody(el) {
  const rec = currentRecovery();
  const fresh = SHOW.filter((m) => rec[m] >= 85).length;
  const last = historyIndex().done[0];
  const days = last ? Math.floor((Date.now() - Date.parse(last.finished_at || last.started_at)) / 86400000) : null;
  const tired = [...SHOW].sort((a, b) => rec[a] - rec[b]).filter((m) => rec[m] < 85).slice(0, 4);
  el.innerHTML = `
    <section class="stack">
      <h1>Body</h1>
      <div class="body-hero">
        <div><b>${fresh}</b><span>fresh muscle groups</span></div>
        <div><b>${days == null ? '—' : days}</b><span>${days === 1 ? 'day' : 'days'} since last workout</span></div>
      </div>
      <div class="card">
        <div class="row between"><p class="label">Recovery</p><span class="small muted">Tap a muscle</span></div>
        ${bodyMap(rec, { mode: 'recovery', tappable: true })}
        <div class="bm-legend">
          <span><i style="background:${recoveryColor(100)}"></i>Ready</span>
          <span><i style="background:${recoveryColor(70)}"></i>Recovering</span>
          <span><i style="background:${recoveryColor(20)}"></i>Needs rest</span>
        </div>
        ${tired.length ? `<p class="small muted">Least recovered: ${tired.map((m) => `${esc(MUSCLE_LABELS[m])} ${rec[m]}%`).join(' · ')}</p>` : '<p class="small muted">Everything is recovered. Good day to train anything.</p>'}
        <p class="small muted">Based on your sets, effort and time since (big muscles ~72 h, small ~48 h).</p>
      </div>
    </section>`;

  const open = (region) => {
    const [side, slug] = region.split(':');
    const ms = musclesIn(side, slug);
    if (!ms.length) return;
    const stats = muscleStats(state.workouts, exerciseById);
    sheet(regionLabel(slug), (body) => {
      body.innerHTML = `<div class="stack">${ms.map((m) => `
        <div class="bm-detail">
          <div class="row between"><b>${esc(MUSCLE_LABELS[m])}</b><span class="bm-pill" style="--c:${recoveryColor(rec[m])}">${rec[m]}% · ${status(rec[m])}</span></div>
          <div class="rec-bar"><i style="width:${rec[m]}%;background:${recoveryColor(rec[m])}"></i></div>
          <p class="small muted">Last trained: ${ago(stats[m].last)} · Sets this week: ${Math.round(stats[m].weekSets * 10) / 10}</p>
        </div>`).join('')}</div>`;
    });
  };
  $$('[data-region]', el).forEach((g) => {
    g.addEventListener('click', () => open(g.dataset.region));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(g.dataset.region);
      }
    });
  });
}
