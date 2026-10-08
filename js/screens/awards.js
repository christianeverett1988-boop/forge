// Progress → Awards: your level and XP, the weekly streak (with this week's days and the monthly freeze),
// and badges. All derived from history (js/workouts/awards.js); nothing extra is stored.
import { state } from '../state.js';
import { esc } from '../ui.js';
import { totalXP, levelFor, streak, badges, LEVELS, xpForLevel } from '../workouts/awards.js';
import { progressTabs } from './progress.js';

const fmt = (n) => Math.round(n).toLocaleString();
const when = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

export function renderAwards(el) {
  const goal = (state.profile && state.profile.trainingDays) || 3;
  const xp = totalXP(state.workouts);
  const lv = levelFor(xp);
  const st = streak(state.workouts, state.cardio || [], goal);
  const bs = badges(state.workouts, state.cardio || [], goal);
  const got = bs.filter((b) => b.earned);
  const dots = Array.from({ length: goal }, (_, i) => `<i class="${i < st.thisWeek.done ? 'on' : ''}"></i>`).join('');

  el.innerHTML = `
    <section class="stack">
      <h1>Progress</h1>
      ${progressTabs('awards')}

      <div class="card aw-level">
        <p class="label">Level ${lv.level} of ${LEVELS.length}</p>
        <p class="aw-name">${esc(lv.name)}</p>
        <div class="aw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(lv.progress * 100)}" aria-label="Progress to next level"><i style="--p:${lv.progress.toFixed(3)}"></i></div>
        <p class="small muted">${lv.next != null ? `${fmt(xp)} XP · ${fmt(lv.next - xp)} to <b>${esc(lv.nextName)}</b>` : `${fmt(xp)} XP · top level reached`}</p>
        <details class="small"><summary class="muted">How XP works</summary>
          <p class="muted">+10 per working set, +25 per exercise, +100 per workout, +50 per PR.</p>
          <ol class="aw-levels">${LEVELS.map((n, i) => `<li class="${i + 1 <= lv.level ? 'on' : ''}"><span>${esc(n)}</span><small>${fmt(xpForLevel(i + 1))}</small></li>`).join('')}</ol>
        </details>
      </div>

      <div class="card aw-streak">
        <div class="row between center">
          <div><p class="label">Weekly streak</p><p class="aw-big">🔥 ${st.current} ${st.current === 1 ? 'week' : 'weeks'}</p></div>
          <div class="aw-best"><small class="muted">Best</small><b>${st.best}</b></div>
        </div>
        <div class="aw-week"><span class="small muted">This week</span><span class="aw-dots" aria-label="${st.thisWeek.done} of ${goal} days">${dots}</span><span class="small">${st.thisWeek.done} of ${goal} days</span></div>
        <p class="small muted">A week counts when you train on your planned ${goal} days (workouts or logged cardio). One missed week a month is covered by a freeze${st.freezeLeft ? ' — this month’s is still available.' : ' — this month’s is used.'}</p>
      </div>

      <div class="card">
        <div class="row between center"><p class="label">Badges</p><span class="small muted">${got.length} of ${bs.length}</span></div>
        <ul class="aw-badges">
          ${bs.map((b) => `
            <li class="${b.earned ? 'on' : ''}">
              <span class="aw-medal" aria-hidden="true">${b.earned ? '🏅' : '🔒'}</span>
              <b>${esc(b.name)}</b>
              <small class="muted">${b.earned ? `Earned ${when(b.earned.at)}` : esc(b.how)}</small>
            </li>`).join('')}
        </ul>
      </div>
    </section>`;
}
