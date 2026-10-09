// The weekly-refresh row (Settings), banner (Today) and the small how-to sheet they both open (iPhone app only).
import { esc, sheet, toast } from '../ui.js';
import { icon } from '../ui/icons.js';
import { scheduleExpiryReminder } from './bridge.js';
import { loadExpiryInfo, reminderAt, refreshRow, bannerDeadline, dueSoonLine } from './expiry.js';

/** The Settings row: same markup as the Withings / Apple Health rows, tinted amber once it's due. */
export function refreshRowHtml(expiryMs, exact = true) {
  const r = refreshRow(expiryMs, Date.now(), exact);
  return `<button type="button" class="g-row ${r.due ? 'due' : ''}" data-app-refresh><span class="g-ic">${icon('refresh')}</span><span class="g-text"><span>App refresh</span><small>${esc(r.sub)}</small></span><span class="g-val">${esc(r.value)}</span><span class="chev">${icon('chev')}</span></button>`;
}

export function refreshBannerHtml(expiryMs, exact = true) {
  return `<button type="button" class="notice info refresh-banner" data-app-refresh-banner><span class="rb-ic" aria-hidden="true">${icon('timer', { size: 22 })}</span><span><strong>Forge needs its weekly refresh</strong><br>${esc(bannerDeadline(expiryMs, Date.now(), exact))}</span></button>`;
}

/** The 3 steps from docs/ios-setup.md "Every week", plus a reminder button that asks for notifications in context. */
export async function openRefreshSheet() {
  const { at: expiry, exact } = (await loadExpiryInfo()) || {};
  const noReminder = expiry != null && reminderAt(expiry) == null;
  sheet('Weekly refresh', (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <p class="muted">A free Apple ID lets Forge open for 7 days at a time. Refreshing takes a couple of minutes and your data stays.</p>
        <ol class="refresh-steps">
          <li><strong>Plug in</strong> your iPhone to the Mac mini.</li>
          <li><strong>Unlock</strong> it and keep the screen on.</li>
          <li><strong>Double-click “Refresh Forge”</strong> on the Mac mini’s Desktop.</li>
        </ol>
        ${noReminder ? `<p class="muted" data-due-soon>${esc(dueSoonLine(expiry, Date.now(), exact))}</p>` : '<button type="button" class="btn grow" data-remind>Remind me</button>'}
        <button type="button" class="btn ghost grow" data-done>Done</button>
      </div>`;
    body.querySelector('[data-done]').addEventListener('click', close);
    body.querySelector('[data-remind]')?.addEventListener('click', async () => {
      const at = reminderAt(expiry);
      if (at == null) return;
      toast((await scheduleExpiryReminder(at, { ask: true })) ? 'Okay, I’ll remind you the day before.' : 'Notifications are off for Forge. You can turn them on in iPhone Settings.');
    });
  });
}
