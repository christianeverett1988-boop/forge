import { state, units as getUnits } from '../state.js';
import { put, newRecord, softDelete } from '../db.js';
import { esc, $, $$, sheet, toast, todayKey, formatDay, confirmSheet, haptic } from '../ui.js';
import { weightToDisplay, weightFromInput, weightUnit, formatWeight } from '../units.js';
import { trendChange, weeklyRate, projectGoalDate } from '../weight/smoothing.js';
import { weightChartSVG } from '../weight/chart.js';
import { weightSeries } from '../derived.js';
import { progressTabs } from './progress.js';

const SOURCE_LABELS = { manual: 'Manual', withings: 'Withings', apple_shortcut: 'Apple Health (Shortcut)', apple_health: 'Apple Health' };
let range = 90;
let showAll = false;
const HISTORY_LIMIT = 20;

export function openLogWeight() {
  const u = getUnits();
  const series = weightSeries();
  const last = series.length ? series[series.length - 1].kg : state.profile && state.profile.weightKg;
  sheet('Log weight', (body, close) => {
    body.innerHTML = `
      <form class="stack" novalidate>
        <label class="field big-input">
          <span>Weight (${weightUnit(u)})</span>
          <input name="w" type="number" inputmode="decimal" step="0.1" placeholder="${last ? weightToDisplay(last, u).toFixed(1) : ''}" autofocus>
        </label>
        <label class="field"><span>Date</span><input name="day" type="date" value="${todayKey()}" max="${todayKey()}"></label>
        <p class="error" aria-live="polite"></p>
        <button class="btn" type="submit">Save</button>
      </form>`;
    const form = $('form', body);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kg = weightFromInput(form.w.value, u);
      if (!Number.isFinite(kg) || kg < 25 || kg > 350) {
        $('.error', body).textContent = 'Enter a weight.';
        return;
      }
      const day = form.day.value || todayKey();
      const measured = day === todayKey() ? new Date() : new Date(day + 'T08:00:00');
      put('weights', newRecord({ kg, day, measured_at: measured.toISOString() }));
      haptic();
      close();
      toast(`Saved ${formatWeight(kg, u)}`);
    });
  });
}

export function renderWeight(el) {
  const u = getUnits();
  const series = weightSeries();
  const goalKg = state.profile && state.profile.targetWeightKg;
  const projection = goalKg ? projectGoalDate(series, goalKg) : null;
  const change7 = trendChange(series, 7);
  const rate = weeklyRate(series);
  const latest = series.length ? series[series.length - 1] : null;
  const entries = [...state.weights].sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1));

  el.innerHTML = `
    <section class="stack">
      ${progressTabs('weight')}
      <div class="row between center">
        <h1>Weight</h1>
        <button class="btn small" data-log>+ Log weight</button>
      </div>
      ${latest ? `
      <div class="card">
        <div class="stats">
          <div><span>Trend</span><b>${formatWeight(latest.trend, u)}</b></div>
          <div><span>7 days</span><b>${change7 == null ? '—' : `${change7 > 0 ? '+' : ''}${weightToDisplay(change7, u).toFixed(1)}`}</b></div>
          <div><span>Per week</span><b>${rate == null ? '—' : `${rate > 0 ? '+' : ''}${weightToDisplay(rate, u).toFixed(2)}`}</b></div>
        </div>
        <div class="seg small" role="radiogroup" aria-label="Range">
          ${[[30, '30d'], [90, '90d'], [365, '1y'], [0, 'All']].map(([d, l]) =>
            `<label><input type="radio" name="range" value="${d}" ${range === d ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
        ${weightChartSVG(series, { units: u, goalKg, projection, rangeDays: range || null })}
        <p class="small muted legend"><span class="key dot"></span>weigh-ins <span class="key line"></span>trend ${goalKg ? '<span class="key dash"></span>goal' : ''}</p>
        ${projection ? `<p class="small">${projection.reached ? 'You’ve reached your goal weight. 🎉' : `At your current pace you’ll reach ${formatWeight(goalKg, u, 0)} around <b>${formatDay(projection.day, { month: 'short', day: 'numeric', year: 'numeric' })}</b>.`}</p>` : ''}
        ${!projection && goalKg && series.length >= 2 ? '<p class="small muted">A goal date appears once your trend has about a week of data and is moving toward your goal.</p>' : ''}
      </div>` : '<div class="card empty">No weigh-ins yet. Log your first one.</div>'}

      ${entries.length ? `
      <h2>History</h2>
      <ul class="list">
        ${(showAll ? entries : entries.slice(0, HISTORY_LIMIT)).map((w) => `
          <li>
            <div><b>${formatWeight(w.kg, u)}</b><small class="muted">${formatDay(w.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${esc(SOURCE_LABELS[w.source] || w.source)}</small></div>
            <button class="icon-btn" data-del="${esc(w.id)}" aria-label="Delete this weigh-in">🗑</button>
          </li>`).join('')}
      </ul>
      ${!showAll && entries.length > HISTORY_LIMIT ? `<button class="btn ghost" data-all>Show all ${entries.length}</button>` : ''}` : ''}
      <p class="small muted">Trend = 10%-per-day smoothed average, so single weigh-ins (water, salt) don’t swing it much.</p>
    </section>`;

  $('[data-log]', el).onclick = openLogWeight;
  const all = $('[data-all]', el);
  if (all) all.onclick = () => { showAll = true; renderWeight(el); };
  $$('input[name=range]', el).forEach((r) =>
    r.addEventListener('change', () => {
      range = Number(r.value);
      renderWeight(el);
    })
  );
  $$('[data-del]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmSheet({ title: 'Delete weigh-in?', message: 'This removes it from your history on all devices.', confirmLabel: 'Delete', danger: true });
      if (ok) softDelete('weights', b.dataset.del);
    })
  );
}
