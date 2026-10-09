// Progress → Weekly report: one Monday–Sunday week, worked out on this phone from your existing data.
import { units as getUnits } from '../state.js';
import { esc, $, toast, formatDay } from '../ui.js';
import { weightToDisplay, weightUnit } from '../units.js';
import { progressTabs } from './progress.js';
import { reportFor, currentReportWeek } from '../health/intel.js';
import { shiftWeek } from '../health/weekly.js';
import { ringSvg, round } from '../health/ui.js';

const MAX_WEEKS_BACK = 52;
let weekStart = null;

const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');
const arrow = (x, eps = 0) => (x > eps ? '▲' : x < -eps ? '▼' : '•');
const dash = '—';

function line(label, now, change, { good = null } = {}) {
  const cls = change == null || good == null || change === 0 ? '' : (change > 0) === good ? 'good' : 'warn';
  return `<li><span>${esc(label)}</span><b>${now}</b><small class="${cls}">${change == null ? '' : change}</small></li>`;
}

/** The report as plain text, for Share. */
export function reportText(r, u) {
  const wu = weightUnit(u);
  const bits = [`Forge weekly report · ${formatDay(r.days[0])} – ${formatDay(r.days[6])}`];
  if (r.score.now != null) bits.push(`Forge Score ${round(r.score.now)}${r.score.delta != null ? ` (${sign(round(r.score.delta))}${Math.abs(round(r.score.delta))})` : ''}`);
  bits.push(`Workouts ${r.training.workouts}/${r.training.planned}${r.training.prs ? ` · ${r.training.prs} PR${r.training.prs === 1 ? '' : 's'}` : ''}`);
  if (r.weight.change != null) bits.push(`Weight trend ${sign(r.weight.change)}${Math.abs(weightToDisplay(r.weight.change, u)).toFixed(1)} ${wu}`);
  bits.push(`Next week: ${r.suggestion.text}`);
  return bits.join('\n');
}

export function renderWeekly(el) {
  const u = getUnits();
  const wu = weightUnit(u);
  const current = currentReportWeek();
  if (!weekStart || weekStart > current) weekStart = current;
  const r = reportFor(weekStart);
  const isCurrent = weekStart === current;
  const canBack = weekStart > shiftWeek(current, -MAX_WEEKS_BACK);
  const kg = (v) => `${sign(v)}${Math.abs(weightToDisplay(v, u)).toFixed(1)} ${wu}`;
  const pct = (v) => `${sign(v)}${Math.abs(Math.round(v))}%`;
  const wGood = r.goal === 'lose' || r.goal === 'recomp' ? false : r.goal === 'muscle' ? true : null;

  const scoreBlock = r.score.now != null ? `
    <div class="card stack" data-w-score>
      <p class="label">Forge Score</p>
      <div class="row gap center"><div class="score-mini">${ringSvg(r.score.now, { size: 84, stroke: 9 })}<b>${round(r.score.now)}</b></div>
        <div><p class="big-title">${r.score.delta == null ? 'First week of scores' : r.score.delta === 0 ? 'Same as the week before' : `${arrow(r.score.delta)} ${Math.abs(round(r.score.delta))} ${r.score.delta > 0 ? 'up' : 'down'}`}</p><p class="small muted">7-day average</p></div></div>
      <ul class="w-lines">${r.score.pillars.map((p) => line(p.label, p.now == null ? dash : round(p.now), p.delta == null ? null : `${arrow(p.delta, 0.5)} ${sign(round(p.delta))}${Math.abs(round(p.delta))}`, { good: true })).join('')}</ul>
    </div>` : '';

  const t = r.training;
  const body = r.hasData ? `
    ${scoreBlock}
    <div class="card stack" data-w-body>
      <p class="label">Body</p>
      <ul class="w-lines">
        ${line('Weight trend', r.weight.now == null ? dash : `${weightToDisplay(r.weight.now, u).toFixed(1)} ${wu}`, r.weight.change == null ? null : `${arrow(r.weight.change, 0.05)} ${kg(r.weight.change)}`, { good: wGood == null ? null : wGood })}
        ${r.comp.fat.now != null ? line('Fat mass', `${weightToDisplay(r.comp.fat.now, u).toFixed(1)} ${wu}`, r.comp.fat.change == null ? null : `${arrow(r.comp.fat.change, 0.05)} ${kg(r.comp.fat.change)}`, { good: r.goal === 'muscle' ? null : false }) : ''}
        ${r.comp.lean.now != null ? line('Fat-free mass', `${weightToDisplay(r.comp.lean.now, u).toFixed(1)} ${wu}`, r.comp.lean.change == null ? null : `${arrow(r.comp.lean.change, 0.05)} ${kg(r.comp.lean.change)}`, { good: true }) : ''}
      </ul>
      <p class="small muted">${r.weight.weighIns} weigh-in${r.weight.weighIns === 1 ? '' : 's'} this week.</p>
    </div>
    <div class="card stack" data-w-training>
      <p class="label">Training</p>
      <ul class="w-lines">
        ${line('Workouts', `${t.workouts} of ${t.planned}`, t.workouts >= t.planned ? 'Goal met' : null, { good: true })}
        ${line('Volume', `${Math.round(weightToDisplay(t.volumeKg, u)).toLocaleString()} ${wu}`, t.volumeChangePct == null ? null : `${arrow(t.volumeChangePct, 1)} ${pct(t.volumeChangePct)} vs last week`, { good: true })}
        ${line('Personal records', t.prs ? `${t.prs} 🏆` : '0', null)}
        ${line('Cardio', `${Math.round(t.cardioMin)} min`, null)}
      </ul>
    </div>
    ${r.recovery.hrv.now != null || r.recovery.rhr.now != null || r.recovery.sleep.now != null ? `
    <div class="card stack" data-w-recovery>
      <p class="label">Recovery</p>
      <ul class="w-lines">
        ${r.recovery.hrv.now != null ? line('Average HRV', `${Math.round(r.recovery.hrv.now)} ms`, r.recovery.hrv.change == null ? null : `${arrow(r.recovery.hrv.change, 0.5)} ${sign(r.recovery.hrv.change)}${Math.abs(Math.round(r.recovery.hrv.change))} ms`, { good: true }) : ''}
        ${r.recovery.rhr.now != null ? line('Resting heart rate', `${Math.round(r.recovery.rhr.now)} bpm`, r.recovery.rhr.change == null ? null : `${arrow(r.recovery.rhr.change, 0.5)} ${sign(r.recovery.rhr.change)}${Math.abs(Math.round(r.recovery.rhr.change))} bpm`, { good: false }) : ''}
        ${r.recovery.sleep.now != null ? line('Sleep a night', `${Math.floor(r.recovery.sleep.now / 60)} h ${String(Math.round(r.recovery.sleep.now % 60)).padStart(2, '0')}`, r.recovery.sleep.change == null ? null : `${arrow(r.recovery.sleep.change, 3)} ${sign(r.recovery.sleep.change)}${Math.abs(Math.round(r.recovery.sleep.change))} min`, { good: true }) : ''}
      </ul>
    </div>` : ''}
    ${r.best || r.worst ? `<div class="card stack" data-w-bestworst>
      ${r.best ? `<p><span class="label">Best this week</span><br><b>${esc(r.best.label)}</b> <span class="good">moved the right way</span></p>` : ''}
      ${r.worst ? `<p><span class="label">Needs a look</span><br><b>${esc(r.worst.label)}</b> <span class="warn">moved the wrong way</span></p>` : ''}
    </div>` : ''}
    <div class="card stack suggest" data-w-suggest>
      <p class="label">One thing for next week</p>
      <p class="big-title">${esc(r.suggestion.text)}</p>
    </div>
    <button class="btn ghost bigbtn" data-share>Share</button>` : `
    <div class="card empty" data-empty><p class="big-title">Nothing logged this week</p><p>Log a weigh-in or a workout and this report fills in. Use ‹ to see an earlier week.</p></div>`;

  el.innerHTML = `
    <section class="stack">
      ${progressTabs('weekly')}
      <h1>Weekly report</h1>
      <div class="row between center week-nav">
        <button class="btn ghost" data-prev aria-label="Previous week" ${canBack ? '' : 'disabled'}>‹</button>
        <div class="tcenter" style="text-align:center"><b>${formatDay(r.days[0])} – ${formatDay(r.days[6])}</b><small class="muted" style="display:block">${isCurrent ? (r.partial ? 'This week so far' : 'Last full week') : 'Mon–Sun'}</small></div>
        <button class="btn ghost" data-next aria-label="Next week" ${isCurrent ? 'disabled' : ''}>›</button>
      </div>
      ${body}
      <p class="disclaimer">General fitness information, not medical advice.</p>
    </section>`;

  $('[data-prev]', el).onclick = () => { weekStart = shiftWeek(weekStart, -1); renderWeekly(el); };
  $('[data-next]', el).onclick = () => { weekStart = shiftWeek(weekStart, 1); renderWeekly(el); };
  const share = $('[data-share]', el);
  if (share) share.onclick = async () => {
    const text = reportText(r, u);
    try {
      if (navigator.share) await navigator.share({ title: 'My Forge week', text });
      else { await navigator.clipboard.writeText(text); toast('Copied to your clipboard'); }
    } catch { /* cancelled */ }
  };
}
