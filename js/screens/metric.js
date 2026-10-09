// One body metric in detail (Body → tap a tile): latest value, this period vs. the previous one, a chart
// over 7/30/90/365 days or everything (with the previous period dashed), training sets per week underneath
// for muscle, and the explainer sheet ("What is this?") from data/metrics.json.
import { myBodyMeasures } from '../derived.js';
import { state, units as getUnits } from '../state.js';
import { esc, $, $$, sheet, todayKey } from '../ui.js';
import { addDays, daysBetween } from '../weight/smoothing.js';
import { weightToDisplay } from '../units.js';
import { lineChartSVG } from '../ui/linechart.js';
import { metricDef, metricPoints, metricEmptyChoice, dailySeries, fmtMetric, heightM, periodAverage } from '../withings/body.js';
import { suspectIds } from '../withings/review.js';
import { weekOf } from '../workouts/awards.js';
import { icon, emptyState } from '../ui/icons.js';

let range = 90;
let explainers = null;

export function loadExplainers() {
  if (!explainers) explainers = fetch('data/metrics.json').then((r) => r.json()).then((j) => j.metrics || {}).catch(() => ({}));
  return explainers;
}

/** Working sets per week (Monday), from finished workouts. */
export function weeklySets(workouts) {
  const m = new Map();
  for (const w of workouts) {
    if (w.deleted || w.status !== 'done') continue;
    const n = (w.exercises || []).reduce((a, it) => a + (it.sets || []).filter((s) => s.done && !s.warmup).length, 0);
    if (!n) continue;
    const wk = weekOf(w.started_at);
    m.set(wk, (m.get(wk) || 0) + n);
  }
  return [...m].map(([day, value]) => ({ day: addDays(day, 3), value })); // drawn mid-week
}

export function openExplainer(key) {
  const def = metricDef(key);
  sheet(def ? def.label : 'About this metric', (body) => {
    body.innerHTML = '<div class="skeleton block"></div>';
    loadExplainers().then((all) => {
      const e = all[key];
      if (!e) { body.innerHTML = '<p class="muted">No explainer yet.</p>'; return; }
      const row = (t, v) => (v ? `<p class="label">${t}</p><p>${esc(v)}</p>` : '');
      body.innerHTML = `<div class="stack explainer">${row('What it is', e.what)}${row('How it’s measured', e.how)}${row('What moves it', e.moves)}${row('Typical ranges', e.ranges)}${row('Accuracy', e.caveats)}${row('In Forge', e.in_forge)}
        <p class="small muted">General information, not medical advice.</p></div>`;
    });
  });
}

export function renderMetric(el, key) {
  const def = metricDef(key);
  if (!def) { location.replace('#/body'); return; }
  const u = getUnits();
  const docs = myBodyMeasures();
  const h = heightM(docs, state.profile);
  const sus = suspectIds(state.weights);
  const daily = dailySeries(metricPoints(docs, key, { height: h, weights: state.weights.filter((w) => !sus.has(w.id)) }));
  const disp = (v) => (def.kind === 'mass' ? weightToDisplay(v, u) : v);
  const last = daily[daily.length - 1];
  const end = todayKey();
  const days = range || (daily.length ? Math.max(7, daysBetween(daily[0].day, end)) : 30);
  const from = addDays(end, -days);
  const shown = daily.filter((p) => p.day >= from);
  const prevFrom = addDays(from, -days);
  const prev = range ? daily.filter((p) => p.day >= prevFrom && p.day < from).map((p) => ({ day: addDays(p.day, days), v: disp(p.v) })) : [];
  const avgNow = periodAverage(daily, from, addDays(end, 1));
  const avgPrev = range ? periodAverage(daily, prevFrom, from) : null;
  const delta = avgNow != null && avgPrev != null ? avgNow - avgPrev : null;
  const showSets = def.overlay === 'sets' || $$('input[name=sets]:checked', el).length > 0;
  const bars = showSets ? weeklySets(state.workouts) : [];
  const fmtAxis = (v) => (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));

  const wConnected = !!(state.integrations.withings && state.integrations.withings.connected);
  const choice = metricEmptyChoice(key, wConnected);
  el.innerHTML = `
    <section class="stack">
      <div class="row between center"><h1>${esc(def.label)}</h1><button class="btn ghost small" data-explain>What is this?</button></div>
      ${last ? `
      <div class="card stack">
        <div class="stats">
          <div><span>Latest</span><b data-count>${esc(fmtMetric(key, last.v, u))}</b></div>
          <div><span>${range ? `${range}-day avg` : 'Average'}</span><b data-count>${avgNow == null ? '—' : esc(fmtMetric(key, avgNow, u))}</b></div>
          <div><span>vs previous</span><b>${delta == null ? '—' : `${delta > 0 ? '+' : ''}${esc(fmtMetric(key, delta, u, { unit: false }))}`}</b></div>
        </div>
        <div class="seg small" role="radiogroup" aria-label="Range">
          ${[[7, '7d'], [30, '30d'], [90, '90d'], [365, '1y'], [0, 'All']].map(([d, l]) => `<label><input type="radio" name="range" value="${d}" ${range === d ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
        ${shown.length ? lineChartSVG(shown.map((p) => ({ day: p.day, v: disp(p.v) })), { prev, bars, fmt: fmtAxis, label: `${def.label} chart`, fromDay: from, toDay: end }) : '<p class="muted small">No readings in this range.</p>'}
        <p class="small muted legend"><span class="key dot"></span>readings <span class="key line"></span>7-day average ${prev.length ? '<span class="key dash"></span>previous period' : ''} ${bars.length ? '<span class="key bar"></span>training sets/week' : ''}</p>
        ${def.overlay !== 'sets' ? `<label class="choice check small"><input type="checkbox" name="sets" ${showSets ? 'checked' : ''}><span>Show training sets per week</span></label>` : ''}
        <p class="small muted">Last reading ${new Date(last.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${daily.length.toLocaleString()} days with readings</p>
      </div>` : `<div class="card">${emptyState({ icon: 'scale', title: `No ${esc(def.label.toLowerCase())} readings yet`, text: key === 'weight_kg' ? 'Log your weight and it shows up here.' : wConnected ? 'The data check shows whether Withings sends this one.' : 'Connect Withings to bring your readings in.', action: choice.primary })}${choice.secondary ? `<a class="link" href="${choice.secondary.href}">${choice.secondary.label}</a>` : ''}</div>`}
      ${key === 'bmi' ? '<p class="small muted">BMI ignores muscle. Look at FFMI and FMI too.</p>' : ''}
    </section>`;

  $('[data-explain]', el).onclick = () => openExplainer(key);
  $$('input[name=range]', el).forEach((r) => r.addEventListener('change', () => { range = Number(r.value); renderMetric(el, key); }));
  const sets = $('input[name=sets]', el);
  if (sets) sets.addEventListener('change', () => renderMetric(el, key));
}
