// Small UI helpers: escaping, toasts, bottom sheets, confirm.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Opens a bottom sheet. `render(body, close)` fills it. Returns close(). */
export function sheet(title, render) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `
    <div class="sheet-head">
      <h2>${esc(title)}</h2>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <div class="sheet-body"></div>`;
  document.body.appendChild(dlg);
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  dlg.querySelector('[data-close]').addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // tap on the dimmed backdrop
  });
  render(dlg.querySelector('.sheet-body'), close);
  dlg.showModal();
  return close;
}

export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const close = sheet(title, (body, closeSheet) => {
      body.innerHTML = `
        <p class="muted">${esc(message)}</p>
        <div class="row gap">
          <button class="btn ghost grow" data-no>Cancel</button>
          <button class="btn grow ${danger ? 'danger' : ''}" data-yes>${esc(confirmLabel)}</button>
        </div>`;
      body.querySelector('[data-no]').onclick = () => { answered = true; closeSheet(); resolve(false); };
      body.querySelector('[data-yes]').onclick = () => { answered = true; closeSheet(); resolve(true); };
    });
    // resolve false if dismissed another way
    const obs = new MutationObserver(() => {
      if (!document.body.contains(document.querySelector('dialog.sheet')) && !answered) {
        answered = true;
        resolve(false);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true });
    void close;
  });
}

/** Old API: now forwards to the PR explosion in js/ui/fx.js (queued, never stacks). */
export function celebrate(lines) {
  import('./ui/fx.js').then((fx) => lines.forEach((label) => fx.prExplosion({ label, value: null, prev: null })));
}

export function haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms); // iPhone Safari ignores this; the native app will add real haptics.
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDay(key, opts = { month: 'short', day: 'numeric' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
