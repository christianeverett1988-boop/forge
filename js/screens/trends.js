// Progress → Trends: every metric with a sparkline, today's value and the 28-day change per week.
// Green or red only where "good" is clear for your goal; everything else stays grey.
import { state, units as getUnits } from '../state.js';
import { esc } from '../ui.js';
import { progressTabs } from './progress.js';
import { intel } from '../health/intel.js';
import { fmtMetric } from '../withings/body.js';
import { fmtAmount } from '../health/insights.js';
import { sparkSvg } from '../health/cards.js';

const ARROW = { up: '↑', down: '↓', flat: '→' };

function row(t, u, today) {
  const tr = t.t28;
  const change = !tr.enough ? 'Not enough data yet' : tr.direction === 'flat' ? 'Steady' : `${fmtAmount(t.key, tr.slopePerWeek, u)} a week`;
  const word = !tr.enough ? 'not enough data' : tr.direction === 'flat' ? 'steady' : `${tr.direction === 'up' ? 'up' : 'down'} ${fmtAmount(t.key, tr.slopePerWeek, u)} a week`;
  return `<li><a class="trend-row ${esc(t.tone)}" href="#/metric/${esc(t.key)}" aria-label="${esc(t.label)}: ${esc(fmtMetric(t.key, t.last.v, u, { kind: t.kind }))}, ${esc(word)}">
    <span class="tr-name"><b>${esc(t.label)}</b><small class="muted">${esc(change)}</small></span>
    ${sparkSvg(t.series, today)}
    <span class="tr-val"><b>${esc(fmtMetric(t.key, t.last.v, u, { kind: t.kind }))}</b><span class="tr-arrow" aria-hidden="true">${tr.enough ? ARROW[tr.direction] : '·'}</span></span>
  </a></li>`;
}

export function renderTrends(el) {
  const u = getUnits();
  const i = intel();
  const list = i.trends;
  const goal = (state.profile && state.profile.goal) || 'health';
  const body = list.length ? `
    <ul class="trend-list">${list.map((t) => row(t, u, i.today)).join('')}</ul>
    <p class="small muted">Arrows show the last 4 weeks. A trend only counts when it is bigger than normal day-to-day noise${goal === 'health' || goal === 'endurance' ? '' : `, and green or red shows whether it helps your goal`}. Tap one for the chart.</p>`
    : `<div class="card empty" data-empty><p class="big-title">No trends yet</p><p>Weigh in a few times to see trends.</p><a class="btn" href="#/weight">Log a weigh-in</a></div>`;
  el.innerHTML = `
    <section class="stack">
      ${progressTabs('trends')}
      <div class="row between center"><h1>Trends</h1><a class="link small" href="#/weekly">Weekly report ›</a></div>
      ${body}
      <p class="disclaimer">General fitness information, not medical advice.</p>
    </section>`;
}
