// Settings → Apple Health: the Shortcut token, the step-by-step Shortcut recipe, the Health export import
// (parsed on this phone; only daily summaries are sent), and a status check that shows which kinds of data
// have arrived. All data here is written by Cloud Functions; the app only reads it.
import { state } from '../state.js';
import { esc, $, sheet, toast, confirmSheet, todayKey, formatDay } from '../ui.js';
import { FIREBASE_CONFIG } from '../../config.js';
import { fieldStatus } from '../health/status.js';
import { currentReadiness } from '../health/today.js';
import { shiftDay } from '../health/metrics.js';
import { NEEDED_DAYS } from '../health/readiness.js';

const call = async (...args) => (await import('../functions.js')).call(...args);
const INGEST_URL = `https://us-east1-${FIREBASE_CONFIG.projectId}.cloudfunctions.net/healthIngest`;
const IMPORT_DAYS = 120; // how far back the export import reaches
const CHUNK = 100;

let busy = '';
let importState = null; // { phase, pct, text } while an import runs

const A = () => (state.integrations && state.integrations.apple) || {};
const ago = (iso) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 2 ? 'just now' : m < 90 ? `${m} min ago` : m < 36 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const dayText = (d) => (d ? formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' }) : '—');

function statusCard() {
  const today = todayKey();
  const st = fieldStatus(state.health_daily, today);
  const r = currentReadiness();
  const a = A();
  const have = Math.min(NEEDED_DAYS, r.baselineDays || 0);
  const chips = st.fields.map((f) => `<div class="field-chip ${f.lastDay ? 'on' : 'off'}">
      <b>${esc(f.label)}</b><small>${f.lastDay ? `${f.count28} of last 28 days · last ${esc(dayText(f.lastDay))}` : 'Not received yet'}</small></div>`).join('');
  return `<div class="card stack apple-status" data-status>
    <p class="label">Data check</p>
    <p><b>${st.days ? `${st.days} days of Apple Health data` : 'No Apple Health data yet'}</b></p>
    <p class="small muted">Latest day: ${esc(dayText(st.lastDay))}${a.last_ingest_at ? ` · Shortcut ${esc(ago(a.last_ingest_at))}` : ''}${a.last_import_at ? ` · import ${esc(ago(a.last_import_at))}` : ''}</p>
    <div>
      <div class="ready-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${NEEDED_DAYS}" aria-valuenow="${have}"><i style="width:${Math.round((have / NEEDED_DAYS) * 100)}%"></i></div>
      <p class="small muted" style="margin-top:6px">${have >= NEEDED_DAYS ? 'Readiness has enough history.' : `Readiness needs ${NEEDED_DAYS} days of HRV, resting heart rate or sleep. You have ${have}.`}</p>
    </div>
    <div class="field-grid">${chips}</div>
  </div>`;
}

const STEP_TYPES = [
  ['Heart Rate Variability', 'hrv_sdnn_ms', 'Value'],
  ['Resting Heart Rate', 'rhr_bpm', 'Value'],
  ['Respiratory Rate', 'resp_rate', 'Value'],
  ['Wrist Temperature', 'wrist_temp_c', 'Value'],
  ['Blood Oxygen Saturation', 'spo2_avg_pct', 'Value'],
  ['Steps', 'steps', 'Value'],
  ['Active Energy', 'active_kcal', 'Value'],
  ['Exercise Minutes', 'exercise_min', 'Value'],
  ['Cardio Fitness (VO₂ max)', 'vo2max', 'Value'],
  ['Walking Heart Rate Average', 'walking_hr_avg', 'Value'],
];

function recipe() {
  return `
  <details class="card" data-recipe>
    <summary>Build the Shortcut (about 10 minutes, once)</summary>
    <div class="stack" style="margin-top:12px">
      <p class="notice info small">This uses the <b>iPhone and Apple Watch you already have</b> and the Shortcuts app that comes with iOS. There’s nothing new to sign up for.</p>
      <ol class="steps">
        <li><div><b>Create your token above</b> and copy it. You’ll paste it in step 5.</div></li>
        <li><div><b>Shortcuts app → + (new shortcut).</b> Name it <b>Forge Health</b>.
          <ul><li>Add <b>Text</b> → type <code>yesterday 6pm</code>, then add <b>Date</b> from that text. Call the result <b>Since</b>. (That’s the window: yesterday 6 pm until now, so sleep and the whole morning are covered.)</li></ul></div></li>
        <li><div><b>For each kind of data, add “Find Health Samples”</b> and set <b>Start Date → is after → Since</b> (Sort: Start Date, no limit). Then add <b>Get Details of Health Samples → Value</b>.
          <ul>${STEP_TYPES.map(([n, k]) => `<li>${esc(n)} → <code>${k}</code></li>`).join('')}</ul>
          <ul><li>Forge does the averaging and adding up for you, so you can send the whole list. If a type is missing on your iPhone, skip it. Forge accepts whatever arrives.</li></ul></div></li>
        <li><div><b>Sleep:</b> Find Health Samples → <b>Sleep</b>, Start Date is after Since. Add <b>Repeat with Each</b>. Inside, add <b>Text</b>:
          <code>Value,Start Date,End Date</code> (format both dates as <b>ISO 8601</b>) and <b>Add to Variable</b> “SleepLines”. After the loop, <b>Combine Text</b> with New Lines. Send it as <code>sleep_text</code>. Optional: do the same for <b>Find Workouts</b> as <code>workouts_text</code> (type,start,minutes,kcal,heart rate).</div></li>
        <li><div><b>Send it:</b> add <b>Dictionary</b> with <code>day</code> = Current Date formatted <code>yyyy-MM-dd</code>, plus one item per type above (text value = that step’s result). Then <b>Get Contents of URL</b>:
          <ul><li>URL: <code>${esc(INGEST_URL)}</code></li><li>Method: <b>POST</b>, Request Body: <b>JSON</b> (the Dictionary)</li><li>Header: <code>Authorization</code> = <code>Bearer </code> + your token</li></ul></div></li>
        <li><div><b>Run it once</b> and allow each Health type when iOS asks. Then come back here: the Data check above should show what arrived.</div></li>
      </ol>
    </div>
  </details>
  <details class="card">
    <summary>Make it run by itself every morning</summary>
    <div class="stack" style="margin-top:12px">
      <ol class="steps">
        <li><div><b>Shortcuts → Automation → + → Sleep → Waking Up.</b> Choose <b>Run Shortcut → Forge Health</b>, and set <b>Run Immediately</b> (not “Ask Before Running”).</div></li>
        <li><div><b>Optional evening run</b> for steps and active energy: another automation, <b>Time of Day</b> (say 9 pm), same shortcut, Run Immediately. Forge merges it into the same day.</div></li>
      </ol>
      <p class="small muted">Health data is locked while the iPhone is locked, so a run can fail if you haven’t unlocked it yet. “Waking Up” fires right as you pick up the phone, which is why it’s the best trigger. If a morning is missed, the next run fills it in.</p>
    </div>
  </details>
  <details class="card">
    <summary>What iPhone can’t share (and what to do)</summary>
    <ul class="reasons" style="margin-top:12px">
      <li><b>ECG:</b> Shortcuts can’t read ECG recordings. A manual ECG log comes later.</li>
      <li><b>Wrist temperature</b> is missing from Shortcuts on some iOS versions. If yours doesn’t have it, skip that step. Everything else still works, and the export import below fills in temperature history.</li>
      <li><b>Weight and body fat</b> still come from your Withings scale directly. They only come through Health as a backup.</li>
    </ul>
  </details>`;
}

function importCard() {
  const s = importState;
  return `<div class="card stack" data-import>
    <p class="label">Start with your history</p>
    <p>Readiness compares today with your own last 28 days. Import your Health export once and it works from day one.</p>
    ${s ? `<div class="import-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.pct)}"><i style="width:${Math.round(s.pct)}%"></i></div>
       <p class="small" aria-live="polite">${esc(s.text)}</p>` : `
    <ol class="steps"><li><div>Health app → your picture (top right) → <b>Export All Health Data</b> → save to Files. It can take a few minutes.</div></li>
      <li><div>Tap the button and choose <b>export.zip</b>. Forge reads it <b>on this phone</b> and sends only small daily summaries (the last ${IMPORT_DAYS} days). The zip itself never leaves your phone.</div></li></ol>
    <label class="btn bigbtn file ${busy === 'import' ? 'disabled' : ''}">Choose export.zip<input type="file" accept=".zip,.xml,application/zip,text/xml,application/xml" data-file hidden></label>`}
  </div>`;
}

export function renderApple(el) {
  const a = A();
  const has = !!a.connected;
  el.innerHTML = `
    <section class="stack">
      <a class="link small" href="#/settings">‹ Settings</a>
      <h1>Apple Health</h1>
      ${state.serverError ? `<div class="notice warn">Forge can’t read Apple Health data yet (${esc(state.serverError)}). If you just updated, publish the new <code>firestore.rules</code> (DEPLOY.md).</div>` : ''}
      <p class="muted">Bring your Watch’s overnight HRV, resting heart rate, sleep and wrist temperature into Forge for Readiness and your Forge Score. Everything stays in your own Forge account.</p>
      ${statusCard()}
      <div class="card stack">
        <p class="label">Shortcut token</p>
        <p>${has ? 'A token is active. Your Shortcut uses it to send data to Forge.' : 'Make a token, then paste it into the Shortcut below. It works like a password for just this one job.'}</p>
        ${has && a.token_created_at ? `<p class="small muted">Made ${esc(ago(a.token_created_at))}.</p>` : ''}
        <button class="btn bigbtn" data-create ${busy === 'create' ? 'disabled' : ''}>${busy === 'create' ? 'Making it…' : has ? 'Make a new token' : 'Create Shortcut token'}</button>
        ${has ? `<button class="btn ghost bigbtn" data-revoke ${busy === 'revoke' ? 'disabled' : ''}>Turn it off</button>` : ''}
      </div>
      ${recipe()}
      ${importCard()}
      <p class="disclaimer">General fitness information, not medical advice.</p>
    </section>`;

  $('[data-create]', el).onclick = () => createToken(el, has);
  const rv = $('[data-revoke]', el);
  if (rv) rv.onclick = () => revoke(el);
  const file = $('[data-file]', el);
  if (file) file.onchange = () => file.files[0] && runImport(el, file.files[0]);
}

function showToken(token) {
  sheet('Your Shortcut token', (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <p class="notice warn small"><b>This is the only time you’ll see it.</b> Copy it now and paste it into your Shortcut. If you lose it, make a new one.</p>
        <div class="token-box" data-token>${esc(token)}</div>
        <button class="btn bigbtn" data-copy>Copy token</button>
        <p class="small muted">Keep it private, like a password. Anyone with it could add data to your Forge. If it ever leaks, tap <b>Turn it off</b>.</p>
        <button class="btn ghost bigbtn" data-done>Done</button>
      </div>`;
    $('[data-copy]', body).onclick = async (e) => {
      try {
        await navigator.clipboard.writeText(token);
        e.currentTarget.textContent = 'Copied ✓';
      } catch {
        const range = document.createRange();
        range.selectNodeContents($('[data-token]', body));
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        e.currentTarget.textContent = 'Selected: tap Copy in the menu';
      }
    };
    $('[data-done]', body).onclick = close;
  });
}

async function createToken(el, rotating) {
  if (rotating) {
    const ok = await confirmSheet({ title: 'Make a new token?', message: 'Your current Shortcut stops working until you paste the new token into it.', confirmLabel: 'Make new token' });
    if (!ok) return;
  }
  busy = 'create';
  renderApple(el);
  try {
    const r = await call('createShortcutToken');
    busy = '';
    renderApple(el);
    showToken(r.token);
  } catch (e) {
    busy = '';
    renderApple(el);
    toast(e.message, 4000);
  }
}

async function revoke(el) {
  const ok = await confirmSheet({ title: 'Turn off the token?', message: 'Your Shortcut will stop sending data until you make a new token. Data already in Forge stays.', confirmLabel: 'Turn it off', danger: true });
  if (!ok) return;
  busy = 'revoke';
  renderApple(el);
  try {
    await call('revokeShortcutToken');
    toast('Token turned off');
  } catch (e) {
    toast(e.message, 4000);
  }
  busy = '';
  renderApple(el);
}

function setImport(el, s) {
  importState = s;
  const box = $('[data-import]', el);
  if (!box) return;
  const bar = $('.import-progress i', box);
  const text = $('[aria-live]', box);
  if (!bar || !text) return renderApple(el);
  bar.style.width = `${Math.round(s.pct)}%`;
  text.textContent = s.text;
}

async function runImport(el, file) {
  if (importState) return;
  busy = 'import';
  const since = shiftDay(todayKey(), -(IMPORT_DAYS - 1));
  importState = { pct: 0, text: 'Opening your export…' };
  renderApple(el);
  try {
    const [{ exportTextStream }, { parseExport }] = await Promise.all([import('../health/zip.js'), import('../health/apple-export.js')]);
    const stream = await exportTextStream(file, (p) => setImport(el, { pct: p * 80, text: `Reading your Health export on this phone… ${Math.round(p * 100)}%` }));
    const { days, records } = await parseExport(stream, { since });
    if (!days.length) throw new Error(records ? 'I found Health data, but none from the last few months.' : 'I couldn’t find HRV, heart rate or sleep data in that file.');
    let sent = 0;
    for (let i = 0; i < days.length; i += CHUNK) {
      setImport(el, { pct: 80 + (i / days.length) * 20, text: `Saving ${days.length} daily summaries to your Forge… (no raw data leaves your phone)` });
      const r = await call('importHealthDays', { days: days.slice(i, i + CHUNK) });
      sent += r.days;
    }
    importState = null;
    busy = '';
    toast(`Imported ${sent} days of history`, 3500);
  } catch (e) {
    importState = null;
    busy = '';
    toast(e.message || 'Couldn’t read that file.', 5000);
  }
  renderApple(el);
}
