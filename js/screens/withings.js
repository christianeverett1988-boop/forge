// Settings → Withings (connect, status, Sync now, review queue, disconnect) and Settings → Withings →
// Data check (what the free API returns for every metric, webhook proof, backfill, saved reports, and the
// "safe to cancel Withings+?" verdict). Everything here is read from users/{uid}/integrations/withings and
// body_measures, which only Cloud Functions write.
import { state, units as getUnits } from '../state.js';
import { esc, $, $$, sheet, toast } from '../ui.js';
import { reviewBodyMeasure } from '../db.js';
import { formatWeight } from '../units.js';
import { classify, verdict, compare, STATE_LABEL, median } from '../withings/check.js';
import { fmtMetric, KEY_OF_TYPE } from '../withings/body.js';

const W = () => (state.integrations && state.integrations.withings) || null;
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const mins = (s) => (s == null ? '—' : s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
const call = async (...args) => (await import('../functions.js')).call(...args);

const EXISTING_ACCOUNT = 'Log in with your <b>existing</b> Withings account. Don’t create a new one: Withings accounts made after October 12, 2026 need Withings+ to share data, and yours doesn’t.';

let connectUrl = null; // the Withings sign-in link, ready to tap (popup blockers never see it)
let busy = '';

export function renderWithings(el, sub) {
  if (sub === 'check') return renderCheck(el);
  const w = W();
  const u = getUnits();
  const connected = !!(w && w.connected);
  const review = state.body_measures.filter((d) => d.needs_review).sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1));
  const bf = (w && w.backfill) || {};

  el.innerHTML = `
    <section class="stack">
      <a class="link small" href="#/settings">‹ Settings</a>
      <h1>Withings</h1>
      ${state.serverError ? `<div class="notice warn">Forge can’t read Withings data yet (${esc(state.serverError)}). If you just updated, publish the new <code>firestore.rules</code> (DEPLOY.md → Withings).</div>` : ''}

      ${!connected ? `
      <div class="card stack">
        <p>Your scale’s weigh-ins and body composition land in Forge on their own, a few minutes after you step off. Your full Withings history comes in too.</p>
        <p class="notice info small">${EXISTING_ACCOUNT}</p>
        ${connectUrl ? `
          <a class="btn" href="${esc(connectUrl)}" target="_blank" rel="noopener" data-go>Continue to Withings →</a>
          <p class="small muted">On the Withings page, tap <b>Log in</b> (not “Create account”), then <b>Allow</b>. When it says “Connected”, come back here.</p>`
        : `<button class="btn" data-connect ${busy === 'connect' ? 'disabled' : ''}>${busy === 'connect' ? 'Preparing…' : 'Connect Withings'}</button>`}
      </div>` : `
      ${w.needs_reconnect ? `<div class="notice warn">Withings stopped accepting Forge’s sign-in. <button class="link" data-connect>Connect again</button> (${EXISTING_ACCOUNT})</div>` : ''}
      ${connectUrl && w.needs_reconnect ? `<a class="btn" href="${esc(connectUrl)}" target="_blank" rel="noopener" data-go>Continue to Withings →</a>` : ''}
      <div class="card stack">
        <div class="row between center"><p class="label">Connected</p><span class="small muted">${esc(w.model || 'Scale')}</span></div>
        <div class="stats">
          <div><span>Last weigh-in</span><b>${w.last_weigh_in_at ? when(w.last_weigh_in_at) : '—'}</b></div>
          <div><span>Arrived in</span><b>${mins(w.last_latency_s)}</b></div>
          <div><span>Notifications</span><b>${w.subscription_ok === true ? '✓ On' : w.subscription_ok === false ? '✗ Off' : '…'}</b></div>
        </div>
        <p class="small muted">History: ${bf.done ? `✓ ${(bf.groups || 0).toLocaleString()} measurements since ${dateOnly(bf.from)}` : `importing… ${(bf.groups || 0).toLocaleString()} so far${bf.from ? ` (back to ${dateOnly(bf.from)})` : ''}`}</p>
        <div class="row gap">
          <button class="btn ghost grow" data-sync ${busy === 'sync' ? 'disabled' : ''}>${busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
          <a class="btn ghost grow" href="#/withings/check">Data check</a>
        </div>
        <p class="small muted">Last synced ${when(w.last_sync_at)}. Weigh-ins normally arrive by themselves; Sync now is for when one hasn’t.</p>
        ${w.last_error_code ? `<p class="small muted">Last problem: <code>${esc(w.last_error_code)}</code>${/enqueue/.test(w.last_error_code) ? ' — see docs/withings.md → “If the import or notifications never start”.' : ''}</p>` : ''}
        ${bf.error ? `<p class="small muted">History import stopped (<code>${esc(bf.error)}</code>). Run the data check and send it to me.</p>` : ''}
      </div>`}

      ${review.length ? `
      <div class="card stack">
        <p class="label">Is this you?</p>
        <p class="small muted">Withings wasn’t sure who stepped on the scale. These stay out of your trend until you decide.</p>
        <ul class="list">${review.map((d) => `
          <li><div><b>${formatWeight(d.metrics.weight_kg, u)}</b><small class="muted">${when(d.measured_at)}</small></div>
            <div class="row gap"><button class="btn small" data-me="${esc(d.id)}">That’s me</button><button class="btn ghost small" data-notme="${esc(d.id)}">Not me</button></div></li>`).join('')}
        </ul>
      </div>` : ''}

      ${connected ? '<button class="btn danger-ghost" data-disconnect>Disconnect Withings</button>' : ''}
      <p class="small muted">Forge uses Withings’ official API with read-only access to your measurements. Your Withings sign-in tokens live only on Forge’s server, never in the app.</p>
    </section>`;

  const connectBtns = $$('[data-connect]', el);
  connectBtns.forEach((b) => (b.onclick = async () => {
    busy = 'connect';
    renderWithings(el);
    try {
      const r = await call('withingsAuthStart');
      connectUrl = r.url;
      setTimeout(() => { connectUrl = null; }, 9 * 60 * 1000); // the link expires after 10 minutes
    } catch (e) {
      toast(e.message);
    }
    busy = '';
    renderWithings(el);
  }));
  const go = $('[data-go]', el);
  if (go) go.addEventListener('click', () => setTimeout(() => { connectUrl = null; }, 1000));
  const sync = $('[data-sync]', el);
  if (sync) sync.onclick = async () => {
    busy = 'sync';
    renderWithings(el);
    try {
      const r = await call('withingsSyncNow', {}, { timeout: 130000 });
      toast(r.created ? `${r.created} new measurement${r.created === 1 ? '' : 's'}` : 'Up to date');
    } catch (e) {
      toast(e.message);
    }
    busy = '';
    renderWithings(el);
  };
  $$('[data-me]', el).forEach((b) => (b.onclick = () => reviewBodyMeasure(b.dataset.me, true)));
  $$('[data-notme]', el).forEach((b) => (b.onclick = () => reviewBodyMeasure(b.dataset.notme, false)));
  const dis = $('[data-disconnect]', el);
  if (dis) dis.onclick = () => openDisconnect(el);
}

function openDisconnect(el) {
  sheet('Disconnect Withings', (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <p>Forge stops receiving weigh-ins and forgets its Withings sign-in. Your Withings account and scale aren’t affected.</p>
        <label class="choice check small"><input type="checkbox" name="wipe"><span>Also delete the synced Withings data from Forge<small>Body measurements and Withings weigh-ins. Your own logged weights stay.</small></span></label>
        <button class="btn danger" data-ok>Disconnect</button>
      </div>`;
    $('[data-ok]', body).onclick = async () => {
      const wipe = $('input[name=wipe]', body).checked;
      $('[data-ok]', body).disabled = true;
      try {
        await call('withingsDisconnect', { deleteData: wipe });
        close();
        toast('Withings disconnected');
      } catch (e) {
        toast(e.message);
        $('[data-ok]', body).disabled = false;
      }
    };
  });
}

// ---------- data check ----------
/** The nightly 90-day comparison with Withings (removals from the Withings app, and its safety stop). */
export function reconcileLine(r) {
  if (!r) return '<p class="small muted" data-reconcile>Nightly check for weigh-ins deleted in the Withings app: hasn’t run yet (04:00 each night).</p>';
  const at = r.at ? when(r.at) : 'last night';
  if (r.aborted) return `<p class="small" data-reconcile>⚠️ Nightly check ${at}: <b>stopped for safety</b>. Withings listed far fewer weigh-ins than Forge has (${r.suspicious || 'many'} would have gone; the limit is 3 or 20% of the last 90 days, whichever is more), so nothing was removed.</p>`;
  const bits = [`${r.removed || 0} removed`];
  if (r.restored) bits.push(`${r.restored} restored`);
  return `<p class="small muted" data-reconcile>Nightly check ${at}: ${bits.join(', ')} (weigh-ins deleted in the Withings app in the last 90 days).</p>`;
}

let picked = []; // report indexes ticked for Compare (the last two count)
const CSV_KEY = 'forge.withings.csvRows';
const csvRows = () => { try { const v = localStorage.getItem(CSV_KEY); return v ? Number(v) : null; } catch { return null; } };

function renderCheck(el) {
  const w = W();
  const u = getUnits();
  const report = w && w.data_check;
  const rows = report ? classify(report) : [];
  const v = verdict(report, { csvRows: csvRows() });
  const history = (w && w.data_check_history) || [];
  const lat = (report && report.latencies_s) || (w && w.latencies_s) || [];
  const med = median(lat);
  const sel = picked.filter((i) => history[i]).sort((a, b) => a - b);
  const cmp = sel.length === 2 ? compare(history[sel[0]], history[sel[1]]) : null;
  const beforeNov = Date.now() < Date.parse('2026-11-01T04:00:00Z');

  el.innerHTML = `
    <section class="stack">
      <a class="link small" href="#/withings">‹ Withings</a>
      <h1>Data check</h1>
      ${!w || !w.connected ? '<div class="notice warn">Connect Withings first.</div>' : ''}
      <div class="card stack">
        <p class="small muted">Asks Withings for every measurement type over your whole history and shows what the free API actually returns. Run it while subscribed, save it, and run it again after Withings+ ends.</p>
        <button class="btn" data-run ${busy === 'check' || !w || !w.connected ? 'disabled' : ''}>${busy === 'check' ? 'Checking… (up to a minute)' : report ? 'Run again' : 'Run check'}</button>
        ${report ? `<p class="small muted">Last run ${when(report.ran_at)} · ${esc(report.model || 'model unknown')}${report.devices && report.devices.length ? ` · scale last synced ${when(report.devices[0].last_session)}` : ''}</p>` : ''}
      </div>

      ${report ? `
      <div class="card">
        <p class="label">Metrics</p>
        <ul class="list dc-list">${rows.map((r) => `
          <li class="dc-${r.state}">
            <div><b>${esc(r.label)}</b>
              <small class="muted">${esc(STATE_LABEL[r.state])}${r.state === 'received'
                ? ` · ${esc(fmtMetric(KEY_OF_TYPE[r.last_code] || '', r.last_value, u))} · ${dateOnly(r.last)} · ${r.count.toLocaleString()} since ${dateOnly(r.first)}`
                : r.note ? ` · ${esc(r.note)}` : ''}</small></div>
            <code class="dc-codes" title="Withings meastype code${r.codes.length === 1 ? '' : 's'}">${r.state === 'received' ? '' : 'asked '}${r.codes.join(', ')}${r.positions && r.positions.length ? ` · pos ${r.positions.join(',')}` : ''}</code>
          </li>`).join('')}
        </ul>
        ${report.rejected && report.rejected.length ? `<p class="small muted">Withings rejected type${report.rejected.length === 1 ? '' : 's'} ${report.rejected.join(', ')} (unknown to its API).</p>` : ''}
        <p class="small muted">Codes are Withings API measure types (1 = weight, 6 = fat %, 76 = muscle…), so you can match each row with the Withings app.</p>
      </div>

      <div class="card stack">
        <p class="label">Webhook and history</p>
        <div class="stats">
          <div><span>Notifications</span><b>${report.subscription && report.subscription.present ? (report.subscription.key_ok ? '✓ On' : '⚠️ Old URL') : '✗ Off'}</b></div>
          <div><span>Median arrival</span><b>${mins(med)}</b></div>
          <div><span>Weigh-ins seen</span><b>${lat.length}/7</b></div>
        </div>
        <p class="small muted">Last notification ${when(report.last_notify_at)} · last arrival ${mins(lat[lat.length - 1])}</p>
        <p class="small"><b>Weigh-ins</b> (what weight.csv lists)</p>
        <div class="stats">
          <div><span>Withings has</span><b data-ww>${(report.withings_weight_groups ?? 0).toLocaleString()}</b></div>
          <div><span>Forge has</span><b data-wf>${(report.stored_weight_groups ?? 0).toLocaleString()}</b></div>
          <div><span>weight.csv</span><b>${csvRows() == null ? '—' : csvRows().toLocaleString()}</b></div>
        </div>
        <p class="small muted">Oldest ${dateOnly(report.backfill && report.backfill.from)} · all measurement groups: Withings ${(report.groups ?? 0).toLocaleString()}, Forge ${(report.stored_groups ?? 0).toLocaleString()} (includes heart-rate-only and nerve-only readings, and ones you deleted)</p>
        <label class="field"><span class="small muted">Rows in weight.csv from your Withings export, <b>not counting the header row</b></span>
          <input type="number" inputmode="numeric" name="csv" value="${csvRows() ?? ''}" placeholder="e.g. 1243"></label>
        ${reconcileLine(report.last_reconcile || (w && w.last_reconcile))}
      </div>

      <div class="card">
        <p class="label">Apple Health</p>
        <p class="small muted">Watch data (HRV, sleep, resting heart rate, wrist temperature) arrives with the next update (W2).</p>
      </div>

      <div class="card stack">
        <p class="label">Saved reports</p>
        <div class="row gap"><input name="label" value="${beforeNov ? 'subscribed' : 'after cancelling'}" maxlength="40" aria-label="Report name" class="grow"><button class="btn small" data-save ${busy === 'save' ? 'disabled' : ''}>Save report</button></div>
        ${history.length ? `<ul class="list">${history.map((h, i) => `
          <li><label class="choice check small"><input type="checkbox" name="cmp" value="${i}" ${sel.includes(i) ? 'checked' : ''}><span>${esc(h.label)}<small>${when(h.saved_at)}</small></span></label></li>`).join('')}</ul>
          <p class="small muted">Tick two to compare.</p>` : '<p class="small muted">None yet.</p>'}
        ${cmp ? `<ul class="list dc-cmp">${cmp.map((c) => `<li class="${c.lost ? 'dc-lost' : c.changed ? 'dc-changed' : ''}"><span>${esc(c.label)}</span><small>${esc(STATE_LABEL[c.before].split(' ')[0])} ${c.before_count} → ${esc(STATE_LABEL[c.after].split(' ')[0])} ${c.after_count}${c.lost ? ' · lost' : ''}</small></li>`).join('')}</ul>
          <p class="small">${cmp.some((c) => c.lost) ? '⚠️ Something stopped arriving. You can resubscribe to Withings+ and nothing is deleted on their side.' : '✓ Nothing lost between these two reports.'}</p>` : ''}
      </div>

      <div class="card verdict ${v.safe ? 'ok' : 'warn'}">
        <p class="label">Safe to cancel Withings+?</p>
        <p><b>${esc(v.text)}</b></p>
        ${v.blockers.length ? `<ul class="reasons">${v.blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        ${v.decisions.length ? `<p class="small muted">Not on the free API (still free to view in the Withings app; decide whether to enter them by hand monthly): ${v.decisions.map(esc).join(', ')}.</p>` : ''}
      </div>` : ''}
    </section>`;

  const run = $('[data-run]', el);
  if (run) run.onclick = async () => {
    busy = 'check';
    renderCheck(el);
    try {
      await call('withingsDataCheck', { action: 'run' }, { timeout: 300000 });
      toast('Check finished');
    } catch (e) {
      toast(e.message);
    }
    busy = '';
    renderCheck(el);
  };
  const save = $('[data-save]', el);
  if (save) save.onclick = async () => {
    busy = 'save';
    renderCheck(el);
    try {
      await call('withingsDataCheck', { action: 'save', label: $('input[name=label]', el).value });
      toast('Report saved');
    } catch (e) {
      toast(e.message);
    }
    busy = '';
    renderCheck(el);
  };
  const csv = $('input[name=csv]', el);
  if (csv) csv.addEventListener('change', () => {
    try { csv.value ? localStorage.setItem(CSV_KEY, String(Math.max(0, Math.round(Number(csv.value))))) : localStorage.removeItem(CSV_KEY); } catch { /* private mode */ }
    renderCheck(el);
  });
  $$('input[name=cmp]', el).forEach((c) => c.addEventListener('change', () => {
    const i = Number(c.value);
    picked = c.checked ? [...picked.filter((x) => x !== i), i].slice(-2) : picked.filter((x) => x !== i);
    renderCheck(el);
  }));
}

