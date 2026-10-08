// The task-queue worker (withingsTask). Every heavy job runs here, never in a Firestore trigger, so nothing
// the job writes can start another run:
//   notify / manual / maintenance → one incremental sync
//   backfill                      → ONE page, then enqueues the next page (deterministic id per run+page)
// Cloud Tasks drops a second task with the same id, so a retried page can't start a second chain:
// one backfill request = one run of each page.
import { P } from './paths.js';
import { getAccessToken, NotConnected } from './tokens.js';
import { incrementalSync, backfillPage } from './sync.js';
import { log } from './log.js';

export const MAX_PAGES = 2000; // Withings pages are hundreds of groups: 2,000 pages is far beyond any real history

export const backfillTaskId = (uid, runId, page) => `bf-${uid}-${runId}-${page}`.replace(/[^A-Za-z0-9_-]/g, '_');

const already = (e) => e && (e.code === 'functions/task-already-exists' || /already exists/i.test(e.message || ''));

/** Enqueue, treating "already queued" as success. */
export async function enqueueOnce(enqueue, data, id, opts = {}) {
  try {
    await enqueue(data, { id, ...opts });
    return true;
  } catch (e) {
    if (already(e)) return false;
    throw e;
  }
}

/** Start a backfill run (from the OAuth callback or maintenance resuming one). */
export async function requestBackfill({ db, enqueue, uid, runId, offset = 0, page = 0, now = () => Date.now() }) {
  // A fresh run replaces the whole backfill record (no leftover offset/dates from an earlier connection).
  await db.doc(P.status(uid)).set({ backfill: { run_id: runId, requested_at: new Date(now()).toISOString(), done: false, groups: 0, pages: 0, offset: 0, from: null, to: null } }, { mergeFields: ['backfill'] });
  return enqueueOnce(enqueue, { kind: 'backfill', uid, runId, page, offset }, backfillTaskId(uid, runId, page));
}

/**
 * Handle one task. Throwing makes Cloud Tasks retry it (transient trouble); returning ends it.
 * deps: { db, api, enqueue, now }
 */
export async function runTask(data, { db, api, enqueue, now = () => Date.now() }) {
  const { kind, uid } = data || {};
  if (!uid || !kind) return { skipped: 'bad_task' };
  let token;
  try {
    token = await getAccessToken({ db, api, uid, now });
  } catch (e) {
    if (e instanceof NotConnected) return { skipped: 'not_connected' }; // disconnected since: drop it
    throw e;
  }
  if (kind === 'backfill') {
    // A newer run replaced this one (reconnect): stop this chain.
    const s = await db.doc(P.status(uid)).get();
    const current = s.exists && s.data().backfill ? s.data().backfill.run_id : null;
    if (current && current !== data.runId) return { skipped: 'stale_run' };
    const r = await backfillPage({ db, api, uid, token, offset: data.offset || 0, now });
    log('backfill_page', { page: data.page || 0, count: r.groups });
    // Bounded: the next page must start further on, and no history needs more than MAX_PAGES pages.
    if (r.more && (!(r.offset > (data.offset || 0)) || (data.page || 0) + 1 >= MAX_PAGES)) {
      await db.doc(P.status(uid)).set({ backfill: { error: r.offset > (data.offset || 0) ? 'too_many_pages' : 'offset_stuck', done: false } }, { merge: true });
      log('backfill_stopped', { page: data.page || 0 });
      return { kind, page: data.page || 0, more: false, stopped: true };
    }
    if (r.more) {
      await enqueueOnce(enqueue, { kind: 'backfill', uid, runId: data.runId, page: (data.page || 0) + 1, offset: r.offset }, backfillTaskId(uid, data.runId, (data.page || 0) + 1));
    }
    return { kind, page: data.page || 0, more: r.more };
  }
  const r = await incrementalSync({ db, api, uid, token, now, reason: kind });
  log('sync', { reason: String(kind), count: r.created + r.updated });
  return { kind, created: r.created, updated: r.updated };
}
