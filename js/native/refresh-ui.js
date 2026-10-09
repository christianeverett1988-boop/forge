// The weekly-refresh row (Settings), banner (Today) and the small how-to sheet they both open (iPhone app only).
import { esc, sheet, toast } from '../ui.js';
import { icon } from '../ui/icons.js';
import { scheduleExpiryReminder } from './bridge.js';
import { loadExpiry, reminderAt, refreshRow, bannerDeadline } from './expiry.js';

/** The Settings row: same markup as the Withings / Apple Health rows, tinted amber once it's due. */
export function refreshRowHtml(expiryMs) {
  const r = refreshRow(expiryMs);
  return `<button type="button" class="g-row ${r.due ? 'due' : ''}" data-app-refresh><span class="g-ic">${icon('refresh')}</span><span class="g-text"><span>App refresh</span><small>${esc(r.sub)}</small></span><span class="g-val">${esc(r.value)}</span><span class="chev">${icon('chev')}</span></button>`;
}

export function refreshBannerHtml(expiryMs) {
  return `<button type="button" class="notice info refresh-banner" data-app-refresh-banner><span class="rb-ic" aria-hidden="true">${icon('timer', { size: 22 })}</span><span><strong>Forge needs its weekly refresh</strong><br>${esc(bannerDeadline(expiryMs))}</span></button>`;
}

/** The 3 steps from docs/ios-setup.md "Every week", plus a reminder button that asks for notifications in context. */
export function openRefreshSheet() {
  sheet('Weekly refresh', (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <p class="muted">A free Apple ID lets Forge open for 7 days at a time. Refreshing takes a couple of minutes and your data stays.</p>
        <ol class="refresh-steps">
          <li><strong>Plug in</strong> your iPhone to the Mac mini.</li>
          <li><strong>Unlock</strong> it and keep the screen on.</li>
          <li><strong>Double-click “Refresh Forge”</strong> on the Mac mini’s Desktop.</li>
        </ol>
        <button type="button" class="btn grow" data-remind>Remind me</button>
        <button type="button" class="btn ghost grow" data-done>Done</button>
      </div>`;
    body.querySelector('[data-done]').addEventListener('click', close);
    body.querySelector('[data-remind]').addEventListener('click', async () => {
      const at = reminderAt(await loadExpiry());
      if (at == null) { toast('It’s due very soon, so refresh it today.'); return; }
      toast((await scheduleExpiryReminder(at, { ask: true })) ? 'Okay, I’ll remind you the day before.' : 'Notifications are off for Forge. You can turn them on in iPhone Settings.');
    });
  });
}
