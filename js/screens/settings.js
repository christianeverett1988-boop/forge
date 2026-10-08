import { state, units as getUnits } from '../state.js';
import { patch, deleteAllUserData, clearLocalCache } from '../db.js';
import { signOut, reauth, deleteAccount, authErrorMessage } from '../auth.js';
import { exportJSON, exportWeightsCSV, exportWorkoutsCSV, exportCardioCSV } from '../export.js';
import { esc, $, $$, sheet, toast, confirmSheet } from '../ui.js';
import { formatHeight, formatWeight } from '../units.js';
import { GOALS } from '../nutrition/targets.js';
import { VERSION } from '../version.js';

export function renderSettings(el) {
  const u = getUnits();
  const p = state.profile;
  el.innerHTML = `
    <section class="stack">
      <h1>Settings</h1>

      <div class="card">
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

      <a class="card row between center nav-card" href="#/locations">
        <div><p class="label">Locations</p><p>${state.locations.map((l) => esc(l.name)).join(', ') || 'None yet'}</p></div>
        <span aria-hidden="true">›</span>
      </a>

      <div class="card stack">
        <p class="label">Your data</p>
        <button class="btn ghost" data-export-json>Export everything (JSON)</button>
        <button class="btn ghost" data-export-csv>Export weights (CSV)</button>
        <button class="btn ghost" data-export-workouts>Export workouts (CSV)</button>
        <button class="btn ghost" data-export-cardio>Export cardio (CSV)</button>
        <button class="btn danger-ghost" data-delete>Delete everything</button>
        <p class="small muted">Your data is stored in your own Firebase project. Nothing is sent to any other service.</p>
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
