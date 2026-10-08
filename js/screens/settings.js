import { state, units as getUnits } from '../state.js';
import { photoStatus, downloadAllPhotos } from '../ui/photos.js';
import { patch, deleteAllUserData, clearLocalCache } from '../db.js';
import { signOut, reauth, deleteAccount, authErrorMessage } from '../auth.js';
import { exportJSON, exportWeightsCSV, exportWorkoutsCSV, exportCardioCSV, exportBodyCSV } from '../export.js';
import { esc, $, $$, sheet, toast, confirmSheet } from '../ui.js';
import { formatHeight, formatWeight } from '../units.js';
import { GOALS } from '../nutrition/targets.js';
import { VERSION } from '../version.js';
import { unlockAudio, coach, sfx, beep } from '../ui/sound.js';
import { hapticSupport } from '../ui/haptic.js';

function withingsLine() {
  const w = state.integrations && state.integrations.withings;
  if (!w || !w.connected) return 'Not connected';
  if (w.needs_reconnect) return '⚠️ Needs reconnecting';
  return `Connected${w.model ? ` · ${esc(w.model)}` : ''}`;
}

export function renderSettings(el) {
  const u = getUnits();
  const p = state.profile;
  const st = state.settings || {};
  const pl = st.player === 'list' ? 'list' : 'guided';
  const coachMode = st.audio_coach || 'voice';
  const sfxOn = st.sfx !== false;
  const hapOn = st.haptics !== false;
  const hapSupport = hapticSupport();
  el.innerHTML = `
    <section class="stack">
      <h1>Settings</h1>

      <div class="card" data-tour="settings-profile">
        <p class="label">Profile</p>
        <p>${esc(GOALS[p.goal]?.label || '')} · ${esc(p.age)} yrs · ${formatHeight(p.heightCm, u)}${p.targetWeightKg ? ` · goal ${formatWeight(p.targetWeightKg, u, 0)}` : ''}</p>
        <a class="btn ghost" href="#/profile">Edit profile &amp; targets</a>
      </div>

      <div class="card">
        <p class="label">Units</p>
        <div class="seg" role="radiogroup" aria-label="Units">
          <label><input type="radio" name="units" value="imperial" ${u === 'imperial' ? 'checked' : ''}><span>lb, ft, in</span></label>
          <label><input type="radio" name="units" value="metric" ${u === 'metric' ? 'checked' : ''}><span>kg, cm</span></label>
        </div>
      </div>

      <div class="card stack">
        <p class="label">Workouts</p>
        <fieldset class="field"><legend class="small">Workout screen</legend>
          <div class="seg" role="radiogroup" aria-label="Workout screen">
            <label><input type="radio" name="player" value="guided" ${pl === 'guided' ? 'checked' : ''}><span>Guided</span></label>
            <label><input type="radio" name="player" value="list" ${pl === 'list' ? 'checked' : ''}><span>List</span></label>
          </div>
        </fieldset>
        <fieldset class="field"><legend class="small">Coach audio</legend>
          <div class="seg" role="radiogroup" aria-label="Coach audio">
            <label><input type="radio" name="coach" value="off" ${coachMode === 'off' ? 'checked' : ''}><span>Off</span></label>
            <label><input type="radio" name="coach" value="beeps" ${coachMode === 'beeps' ? 'checked' : ''}><span>Beeps</span></label>
            <label><input type="radio" name="coach" value="voice" ${coachMode === 'voice' ? 'checked' : ''}><span>Voice</span></label>
          </div>
          <small class="muted">Mixes with your music. Silent when your ringer switch is off.</small>
        </fieldset>
        <label class="choice check small"><input type="checkbox" name="sfx" ${sfxOn ? 'checked' : ''}><span>Sound effects<small>Power-up, PR and finish sounds.</small></span></label>
        <label class="choice check small"><input type="checkbox" name="haptics" ${hapOn ? 'checked' : ''}><span>Haptic tick (experimental)<small>${hapSupport === 'switch' ? 'A light tap on Done set (iOS 18+ trick).' : 'Not supported on this device.'}</small></span></label>
        <div class="stack" data-photos hidden>
          <p class="small"><b>Demo photos</b> <span class="muted" data-photo-status></span></p>
          <button class="btn ghost" data-photo-dl>Download all demo photos</button>
          <small class="muted">Start/end photos for exercises without an animated demo. Today’s are saved automatically when you start a workout.</small>
        </div>
      </div>

      <a class="card row between center nav-card" href="#/locations">
        <div><p class="label">Locations</p><p>${state.locations.map((l) => esc(l.name)).join(', ') || 'None yet'}</p></div>
        <span aria-hidden="true">›</span>
      </a>

      <a class="card row between center nav-card" href="#/withings" data-withings-card>
        <div><p class="label">Withings</p><p>${withingsLine()}</p></div>
        <span aria-hidden="true">›</span>
      </a>

      <div class="card stack">
        <p class="label">Your data</p>
        <button class="btn ghost" data-export-json>Export everything (JSON)</button>
        <button class="btn ghost" data-export-csv>Export weights (CSV)</button>
        <button class="btn ghost" data-export-workouts>Export workouts (CSV)</button>
        <button class="btn ghost" data-export-cardio>Export cardio (CSV)</button>
        <button class="btn ghost" data-export-body>Export body measurements (CSV)</button>
        <button class="btn danger-ghost" data-delete>Delete everything</button>
        <p class="small muted">Your data is stored in your own Firebase project. If you connect Withings, Forge reads your scale data from Withings; nothing is sent to any other service.</p>
      </div>

      <div class="card stack">
        <p class="label">Help</p>
        <button class="btn ghost" data-tour-again>Show the how-to tour again</button>
      </div>

      <div class="card">
        <p class="label">Account</p>
        <p>${esc(state.user.email)}</p>
        <button class="btn ghost" data-signout>Sign out</button>
      </div>

      <div class="card small">
        <p class="label">About</p>
        <p>Version ${VERSION}</p>
        <p class="muted">General fitness information, not medical advice. Calorie math: Mifflin-St Jeor (1990). Safe floors: Harvard Health (more cautious than NIH/NHLBI). Exercise library: free-exercise-db (public domain, Unlicense) by Yuhonas. Weight trend: Hacker’s Diet exponential smoothing.</p>
      </div>
    </section>`;

  $$('input[name=units]', el).forEach((r) =>
    r.addEventListener('change', () => patch('settings', 'main', { units: r.value }))
  );
  $$('input[name=player]', el).forEach((r) => r.addEventListener('change', () => patch('settings', 'main', { player: r.value })));
  $$('input[name=coach]', el).forEach((r) => r.addEventListener('change', () => {
    unlockAudio();
    patch('settings', 'main', { audio_coach: r.value });
    if (r.value !== 'off') setTimeout(() => (r.value === 'voice' ? coach.go() : beep(880, 160)), 50);
  }));
  $('input[name=sfx]', el).addEventListener('change', (e) => {
    unlockAudio();
    patch('settings', 'main', { sfx: e.target.checked });
    if (e.target.checked) setTimeout(() => sfx.charge(0.5), 50);
  });
  $('input[name=haptics]', el).addEventListener('change', (e) => patch('settings', 'main', { haptics: e.target.checked }));

  // Demo photos: only shown once the photo script has added some.
  const paintPhotos = async () => {
    const st = await photoStatus();
    const box = $('[data-photos]', el);
    if (!box || !st.total) return;
    box.hidden = false;
    $('[data-photo-status]', el).textContent = `· ${st.saved} of ${st.total} saved for offline`;
    const btn = $('[data-photo-dl]', el);
    btn.textContent = st.saved >= st.total ? 'All demo photos saved' : `Download all demo photos (≈ ${st.mb.toFixed(1)} MB)`;
    btn.disabled = st.saved >= st.total;
  };
  paintPhotos();
  $('[data-photo-dl]', el).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const st = await downloadAllPhotos((done, total) => (btn.textContent = `Saving… ${done} of ${total}`));
    toast(st.saved >= st.total ? 'All demo photos saved for offline use'
      : st.saved ? `Saved ${st.saved} of ${st.total}. Try again on a better connection for the rest.`
        : 'Couldn’t save the photos. Check your connection and try again.');
    paintPhotos();
  };

  const run = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      toast(e.message || 'Export failed');
    }
  };
  $('[data-export-json]', el).onclick = run(exportJSON);
  $('[data-export-csv]', el).onclick = run(exportWeightsCSV);
  $('[data-export-workouts]', el).onclick = run(exportWorkoutsCSV);
  $('[data-export-cardio]', el).onclick = run(exportCardioCSV);
  $('[data-export-body]', el).onclick = run(exportBodyCSV);

  $('[data-signout]', el).onclick = async () => {
    if (state.sync !== 'synced') {
      const ok = await confirmSheet({
        title: 'Sign out with unsynced changes?',
        message: 'Some changes haven’t reached the cloud yet. Signing out now may lose them. Wait until the status says Synced to be safe.',
        confirmLabel: 'Sign out anyway',
        danger: true,
      });
      if (!ok) return;
    }
    await signOut();
  };

  $('[data-delete]', el).onclick = () => openDeleteEverything();
  $('[data-tour-again]', el).onclick = () => import('../tour/tour.js').then((m) => m.startTour({ replay: true }));
}

function openDeleteEverything() {
  sheet('Delete everything', (body, close) => {
    body.innerHTML = `
      <form class="stack" novalidate>
        <p>This permanently deletes your account and all your data (profile, weigh-ins, workouts, cardio, programs, locations, custom exercises) from the cloud and from this phone. It can’t be undone.</p>
        <p class="small muted">Tip: export your data first.</p>
        <label class="field"><span>Type DELETE to confirm</span><input name="confirm" autocomplete="off" autocapitalize="characters"></label>
        <label class="field"><span>Your password</span><input name="password" type="password" autocomplete="current-password"></label>
        <p class="error" aria-live="polite"></p>
        <button class="btn danger" type="submit">Delete my account and data</button>
      </form>`;
    const form = $('form', body);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.error', body);
      if (form.confirm.value.trim().toUpperCase() !== 'DELETE') {
        err.textContent = 'Type DELETE to confirm.';
        return;
      }
      if (!navigator.onLine) {
        err.textContent = 'You need a connection to delete your cloud data.';
        return;
      }
      const btn = $('button[type=submit]', body);
      btn.disabled = true;
      btn.textContent = 'Deleting…';
      let accountGone = false;
      try {
        await reauth(form.password.value);
        await deleteAllUserData();
        await deleteAccount();
        accountGone = true;
        await clearLocalCache();
      } catch (ex) {
        if (accountGone) {
          // The account and cloud data are gone; only the on-device wipe failed. Reloading still signs you out.
          console.error(ex);
        } else {
          err.textContent = authErrorMessage(ex);
          btn.disabled = false;
          btn.textContent = 'Delete my account and data';
          return;
        }
      }
      close();
      location.hash = '';
      location.reload();
    });
  });
}
