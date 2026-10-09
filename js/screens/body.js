// Body tab: the recovery heatmap (front and back, red / amber / green from the recovery model), fresh-muscle
// count and days since your last workout. Tap a muscle for its %, when you last trained it and its sets
// this week. (Strength score and weekly set targets come later.)
import { myBodyMeasures } from '../derived.js';
import { state, units as getUnits } from '../state.js';
import { esc, $, $$, sheet, todayKey } from '../ui.js';
import { topInsights, dismissInsight, intel, currentGoalPath, currentEnergy, currentBodyProfile } from '../health/intel.js';
import { insightCardsHtml, bindInsightCards, goalPathHtml, bodyProfileHtml } from '../health/cards.js';
import { currentRecovery, historyIndex } from '../workouts/plan.js';
import { exerciseById } from '../workouts/library.js';
import { MUSCLE_LABELS, muscleStats, SHOW_MUSCLES as SHOW, freshCount } from '../workouts/recovery.js';
import { bodyMap, musclesIn, regionLabel, recoveryColor } from '../ui/bodymap.js';
import { BODY_METRICS, metricSeries, dailySeries, latestAndChange, fmtMetric, heightM, lastWeighInDay, compositionGap } from '../withings/body.js';
import { icon, emptyState } from '../ui/icons.js';
import { programsCard, bindProgramsCard } from '../body-programs/ui.js';

const ago = (iso) => {
  if (!iso) return 'Not trained yet';
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};
const status = (pct) => (pct < 50 ? 'Needs rest' : pct < 85 ? 'Recovering' : 'Ready');

// Body composition tiles: every metric the scale sent (plus BMI, FFMI, FMI), latest value and 30-day change.
function compositionCard() {
  const docs = myBodyMeasures();
  const w = state.integrations && state.integrations.withings;
  if (!docs.length) {
    return `<div class="card">${emptyState({ icon: 'scale', title: w && w.connected ? 'Importing your history' : 'No body data yet', text: w && w.connected ? 'Your Withings history is on its way. This can take a few minutes.' : 'Connect your Withings scale to see fat, muscle, water and more here.', action: { href: '#/withings', label: w && w.connected ? 'See import progress' : 'Connect Withings' } })}</div>`;
  }
  const u = getUnits();
  const h = heightM(docs, state.profile);
  const latestDay = lastWeighInDay(docs);
  const gap = compositionGap(docs);
  const asOf = (day) => new Date(`${day}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', ...(day.slice(0, 4) !== latestDay.slice(0, 4) ? { year: 'numeric' } : {}) });
  const tiles = BODY_METRICS.map((m) => {
    const pts = dailySeries(metricSeries(docs, m.key, { height: h })).map((p) => ({ ...p, at: p.at }));
    const lc = latestAndChange(pts, 30);
    if (!lc) return '';
    const ch = lc.change;
    // Older than your latest weigh-in (e.g. the scale couldn't read body composition since): say so.
    const stale = latestDay && lc.last.day < latestDay;
    const sub = stale ? `as of ${asOf(lc.last.day)}` : ch == null ? '&nbsp;' : `${ch > 0 ? '▲' : ch < 0 ? '▼' : '•'} ${fmtMetric(m.key, Math.abs(ch), u, { unit: false })} · 30d`;
    return `<a class="bc-tile${stale ? ' stale' : ''}" href="#/metric/${m.key}"><span>${m.label}</span><b>${fmtMetric(m.key, lc.last.v, u)}</b><small class="muted">${sub}</small></a>`;
  }).join('');
  const last = [...docs].sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1))[0];
  return `<div class="card">
    <div class="row between"><p class="label">Body composition</p><span class="small muted">${last ? new Date(last.measured_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span></div>
    ${gap ? `<p class="notice info small" data-bc-gap>Your last ${gap === 1 ? 'weigh-in' : `${gap} weigh-ins`} had no body composition. Stand barefoot with dry feet on the electrodes and keep still until the scale finishes.</p>` : ''}
    <div class="bc-grid">${tiles}</div>
    <p class="small muted">From your scale. Tap any number for its chart and what it means.</p>
  </div>`;
}

function insightCards() {
  const cards = topInsights(3);
  return cards.length ? `<div class="insights stack" data-insights>${insightCardsHtml(cards)}</div>` : '';
}

/** Goal path for the Body tab (also used on the weight screen). */
export function goalPathCard() {
  const goalKg = state.profile && state.profile.targetWeightKg;
  return goalPathHtml(currentGoalPath(), currentEnergy(), { series: intel().weights, today: todayKey(), goalKg, units: getUnits() });
}

export function renderBody(el) {
  const rec = currentRecovery();
  const fresh = freshCount(rec);
  const last = historyIndex().done[0];
  const days = last ? Math.floor((Date.now() - Date.parse(last.finished_at || last.started_at)) / 86400000) : null;
  const tired = [...SHOW].sort((a, b) => rec[a] - rec[b]).filter((m) => rec[m] < 85).slice(0, 4);
  el.innerHTML = `
    <section class="stack">
      <h1>Body</h1>
      <div class="body-hero">
        <div><b data-count>${fresh}</b><span>fresh muscle groups</span></div>
        <div><b data-count>${days == null ? '—' : days}</b><span>${days === 1 ? 'day' : 'days'} since last workout</span></div>
      </div>
      ${insightCards()}
      ${compositionCard()}
      ${programsCard()}
      <div data-photos-slot></div>
      ${goalPathCard()}
      ${myBodyMeasures().length ? bodyProfileHtml(currentBodyProfile(), state.profile || {}) : ''}
      <a class="card row between center nav-card" href="#/trends"><div><p class="label">Trends</p><p class="small">See how every number is moving</p></div><span class="chev" aria-hidden="true">${icon('chev')}</span></a>
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

  bindInsightCards(el, dismissInsight);
  bindProgramsCard(el);
  import('../photos/cards.js').then((m) => m.mountBodyPhotosCard($('[data-photos-slot]', el)));
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
