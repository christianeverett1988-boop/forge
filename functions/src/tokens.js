// Withings tokens: access tokens last 3 h; refresh tokens last a year but ROTATE on every refresh (the old
// one keeps working for 8 h). Two invocations refreshing at once could each rotate and one could lose the
// newer refresh token, so refreshing happens under a short lease on users/{uid}/private/withings, and the
// new pair is saved before the access token is used.
import { randomBytes } from 'node:crypto';
import { P } from './paths.js';
import { WithingsError } from './withings-api.js';
import { log } from './log.js';

export const EARLY_MS = 5 * 60 * 1000; // refresh when less than 5 minutes are left
export const LEASE_MS = 30 * 1000;

export class NotConnected extends Error {
  constructor() { super('not connected'); this.code = 'not_connected'; }
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Save a freshly issued token pair (from the OAuth callback or a refresh). */
export function tokenFields(body, now) {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: now + Number(body.expires_in || 10800) * 1000,
    scope: body.scope || null,
    lease_until: 0,
    lease_id: null,
    refreshed_at: now,
  };
}

/**
 * A valid access token for `uid`, refreshing under the lease when needed.
 *   force: refresh even if the current token is still valid (daily maintenance keeps the year-long
 *   refresh token alive this way).
 */
export async function getAccessToken({ db, api, uid, now = () => Date.now(), sleep = defaultSleep, force = false }) {
  const ref = db.doc(P.priv(uid));
  let retriedInvalid = false;
  for (let round = 0; round < 8; round++) {
    const t = now();
    const step = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { notConnected: true };
      const d = snap.data();
      if (!force && d.access_token && d.expires_at - EARLY_MS > t) return { token: d.access_token };
      if (d.lease_until && d.lease_until > t) return { wait: true };
      const leaseId = randomBytes(8).toString('hex');
      tx.update(ref, { lease_until: t + LEASE_MS, lease_id: leaseId });
      return { refresh: d.refresh_token, leaseId };
    });
    if (step.notConnected) throw new NotConnected();
    if (step.token) return step.token;
    if (step.wait) { await sleep(1000); continue; }

    let body;
    try {
      body = await api.refreshToken(step.refresh);
    } catch (e) {
      // Let the next caller try: release our lease.
      await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (s.exists && s.data().lease_id === step.leaseId) tx.update(ref, { lease_until: 0, lease_id: null });
      }).catch(() => {});
      if (e instanceof WithingsError && e.invalidToken && !retriedInvalid) {
        retriedInvalid = true; // maybe someone else rotated it a moment ago: re-read once and retry
        force = false;
        continue;
      }
      if (e instanceof WithingsError && e.invalidToken) {
        await db.doc(P.status(uid)).set({ needs_reconnect: true, last_error_code: String(e.status) }, { merge: true });
        log('token_invalid', { status: Number(e.status) || 0 });
      }
      throw e;
    }

    // Persist the new pair BEFORE using it. If every save fails, the old refresh token still works for
    // 8 hours, so the next run refreshes again; nothing is lost.
    const fields = tokenFields(body, now());
    let saved = false;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        await db.doc(P.priv(uid)).update(fields);
        saved = true;
      } catch {
        await sleep(300 * (attempt + 1));
      }
    }
    if (!saved) {
      log('token_save_failed', { attempt: 3 });
      throw new WithingsError('save_failed', 'refresh');
    }
    await db.doc(P.status(uid)).set({ needs_reconnect: false }, { merge: true });
    return fields.access_token;
  }
  throw new WithingsError('lease_timeout', 'refresh');
}
