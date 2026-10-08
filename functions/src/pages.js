// The small HTML pages the OAuth callback shows when it can't redirect to the app's "connected" page.
const COPY = {
  denied: ['Not connected', 'Withings didn’t give access. Go back to Forge and tap Connect to try again.'],
  expired: ['Link expired', 'That sign-in link was already used or is more than 10 minutes old. Go back to Forge and tap Connect again.'],
  exchange_failed: ['Couldn’t finish connecting', 'Withings didn’t accept the sign-in. Go back to Forge and tap Connect again. If it keeps happening, check the Client ID and callback URL in your Withings developer app.'],
  other_account: ['Already linked', 'This Withings account is linked to a different Forge account. Disconnect it there first.'],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function resultPage(kind, appUrl) {
  const [title, text] = COPY[kind] || COPY.exchange_failed;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Forge · ${esc(title)}</title>
<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;background:#0d0f12;color:#eef1f4;margin:0;padding:48px 24px;max-width:480px}h1{font-size:26px;margin:0 0 12px}a{color:#c6ff3d}</style></head>
<body><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a href="${esc(appUrl)}">Open Forge</a></p></body></html>`;
}
