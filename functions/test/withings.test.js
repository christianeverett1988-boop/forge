// Functions logic, no network: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, fakeApi, fakeQueue } from './fake-db.js';
import { decodeValue, METRIC_OF_TYPE } from '../src/meastypes.js';
import { decodeGroup, weightMirror, dayIn, rawHash } from '../src/decode.js';
import { applyGroups, incrementalSync, reconcile90 } from '../src/sync.js';
import { handleWebhook, notifyTaskId } from '../src/webhook.js';
import { runTask, requestBackfill, backfillTaskId } from '../src/tasks.js';
import { getAccessToken, NotConnected } from '../src/tokens.js';
import { startAuth, consumeState, handleCallback } from '../src/oauth.js';
import { runDataCheck, saveReport } from '../src/datacheck.js';
import { maintainUser, disconnect } from '../src/maintenance.js';
import { WithingsError, makeClient } from '../src/withings-api.js';
import { clean, log, setSink } from '../src/log.js';
import { P } from '../src/paths.js';

const UID = 'u1';
const WUSER = '424242';
const T0 = Date.parse('2026-10-10T11:00:00Z'); // 7:00 New York
const KEY = 'k'.repeat(48);
const sec = (ms) => Math.floor(ms / 1000);

// A Body Comp-style group: weight, fat %, fat mass, FFM, muscle, water, bone, standing HR, + one segment.
function group(grpid, atMs, kg = 82.3, extra = {}) {
  return {
    grpid, attrib: 0, date: sec(atMs), created: sec(atMs) + 5, modified: sec(atMs) + 5, category: 1, timezone: 'America/New_York',
    measures: [
      { type: 1, value: Math.round(kg * 1000), unit: -3 },
      { type: 6, value: 2140, unit: -2 },
      { type: 8, value: 17612, unit: -3 },
      { type: 5, value: 64688, unit: -3 },
      { type: 76, value: 61500, unit: -3 },
      { type: 77, value: 45100, unit: -3 },
      { type: 88, value: 3188, unit: -3 },
      { type: 11, value: 64, unit: 0 },
    ],
    ...extra,
  };
}

function connected(db, { expiresIn = 3 * 3600 * 1000, now = T0 } = {}) {
  db.put(P.priv(UID), { access_token: 'AT0', refresh_token: 'RT0', expires_at: now + expiresIn, lease_until: 0, withings_userid: WUSER, cursor: sec(now) - 3600 });
  db.put(P.wuser(WUSER), { uid: UID });
  db.put(P.status(UID), { connected: true, model: 'Body Comp' });
}

// ---------- decoding ----------
test('decode: value × 10^unit without float noise; types map to metric keys; segments by position', () => {
  assert.equal(decodeValue(82300, -3), 82.3);
  assert.equal(decodeValue(2140, -2), 21.4);
  assert.equal(decodeValue(64, 0), 64);
  assert.equal(METRIC_OF_TYPE[170], 'visceral_fat');
  const g = group(1, T0, 82.3, {});
  g.measures.push({ type: 174, value: 2100, unit: -3, position: 12 }, { type: 175, value: 3300, unit: -3, position: 2 });
  const b = decodeGroup(g);
  assert.equal(b.metrics.weight_kg, 82.3);
  assert.equal(b.metrics.fat_ratio_pct, 21.4);
  assert.equal(b.metrics.muscle_mass_kg, 61.5);
  assert.equal(b.metrics.heart_pulse_bpm, 64);
  assert.deepEqual(b.segments, { torso: { fat_kg: 2.1 }, right_arm: { muscle_kg: 3.3 } });
  assert.equal(b.raw.length, g.measures.length, 'raw kept untouched');
  assert.equal(b.day, '2026-10-10');
  assert.equal(b.needs_review, false);
});

test('decode: the day is in the group time zone; attrib 1 needs review; hash ignores order', () => {
  assert.equal(dayIn('2026-10-10T02:30:00Z', 'America/New_York'), '2026-10-09');
  assert.equal(dayIn('2026-10-10T02:30:00Z', 'Not/AZone'), '2026-10-09', 'falls back to New York');
  const g = group(2, T0, 80, { attrib: 1 });
  assert.equal(decodeGroup(g).needs_review, true);
  assert.equal(weightMirror(decodeGroup(g)).review, true);
  const h1 = rawHash([{ type: 1, value: 1, unit: 0 }, { type: 6, value: 2, unit: 0 }]);
  const h2 = rawHash([{ type: 6, value: 2, unit: 0 }, { type: 1, value: 1, unit: 0 }]);
  assert.equal(h1, h2);
});

// ---------- idempotent writes and tombstones ----------
test('sync writes: same group twice = one doc; unchanged = no write; a change updates', async () => {
  const db = fakeDb();
  const g = group(100, T0);
  const r1 = await applyGroups(db, UID, [g], { now: T0 });
  assert.equal(r1.created, 1);
  assert.ok(db.dump(P.body(UID, 'w_100')));
  const w = db.dump(P.weight(UID, 'w_100'));
  assert.equal(w.kg, 82.3);
  assert.equal(w.source, 'withings');
  assert.equal(w.day, '2026-10-10');
  const writes = db.stats.writes;
  const r2 = await applyGroups(db, UID, [g], { now: T0 + 1000 });
  assert.equal(r2.unchanged, 1);
  assert.equal(db.stats.writes, writes, 'nothing written when nothing changed');
  const edited = group(100, T0, 81.9, { modified: sec(T0) + 99 });
  const r3 = await applyGroups(db, UID, [edited], { now: T0 + 2000 });
  assert.equal(r3.updated, 1);
  assert.equal(db.dump(P.weight(UID, 'w_100')).kg, 81.9);
  assert.equal(db.dump(P.body(UID, 'w_100')).created_at, new Date(T0).toISOString(), 'created_at kept');
});

test('tombstones win: a body measurement or weight you deleted is never written back', async () => {
  const db = fakeDb();
  await applyGroups(db, UID, [group(7, T0)], { now: T0 });
  // You delete the body measurement in Forge (tombstone), and separately a weight.
  db.put(P.body(UID, 'w_7'), { ...db.dump(P.body(UID, 'w_7')), deleted: true, deleted_at: 'x' });
  const edited = group(7, T0, 79, { modified: sec(T0) + 500 });
  const r = await applyGroups(db, UID, [edited], { now: T0 + 1 });
  assert.equal(r.tombstoned, 1);
  assert.equal(db.dump(P.body(UID, 'w_7')).deleted, true);
  assert.equal(db.dump(P.weight(UID, 'w_7')).kg, 82.3, 'weight untouched too');

  await applyGroups(db, UID, [group(8, T0)], { now: T0 });
  db.put(P.weight(UID, 'w_8'), { ...db.dump(P.weight(UID, 'w_8')), deleted: true });
  await applyGroups(db, UID, [group(8, T0, 77, { modified: sec(T0) + 900 })], { now: T0 + 2 });
  assert.equal(db.dump(P.weight(UID, 'w_8')).deleted, true, 'weight soft-delete never undone');
  assert.equal(db.dump(P.weight(UID, 'w_8')).kg, 82.3);
  assert.equal(db.dump(P.body(UID, 'w_8')).metrics.weight_kg, 77, 'the body doc still updates');
});

test('your review decision survives later edits in Withings', async () => {
  const db = fakeDb();
  await applyGroups(db, UID, [group(9, T0, 80, { attrib: 1 })], { now: T0 });
  db.put(P.weight(UID, 'w_9'), { ...db.dump(P.weight(UID, 'w_9')), review: false, reviewed_at: 'y' });
  db.put(P.body(UID, 'w_9'), { ...db.dump(P.body(UID, 'w_9')), needs_review: false, reviewed_at: 'y' });
  await applyGroups(db, UID, [group(9, T0, 80.4, { attrib: 1, modified: sec(T0) + 77 })], { now: T0 + 5 });
  assert.equal(db.dump(P.weight(UID, 'w_9')).review, false);
  assert.equal(db.dump(P.body(UID, 'w_9')).needs_review, false);
});

// ---------- incremental sync ----------
test('incremental sync: pages with lastupdate (cursor − 5 s), saves the cursor and the latency', async () => {
  const db = fakeDb();
  connected(db);
  const pages = [
    { updatetime: sec(T0), more: 1, offset: 1, timezone: 'America/New_York', measuregrps: [group(1, T0 - 60_000)] },
    { updatetime: sec(T0), more: 0, measuregrps: [group(2, T0 - 120_000)] },
  ];
  const api = fakeApi({ getmeas: () => pages.shift() });
  const r = await incrementalSync({ db, api, uid: UID, token: 'AT', now: () => T0 });
  assert.equal(r.created, 2);
  assert.equal(api.calls[0][2].lastupdate, sec(T0) - 3600 - 5);
  assert.equal(api.calls[1][2].offset, 1);
  assert.equal(db.dump(P.priv(UID)).cursor, sec(T0));
  const st = db.dump(P.status(UID));
  assert.equal(st.last_latency_s, 60);
  assert.deepEqual(st.latencies_s, [60]);
});

test('90-day reconcile tombstones only groups Withings no longer has, never on a partial list', async () => {
  const db = fakeDb();
  const day = 86400_000;
  await applyGroups(db, UID, [group(1, T0 - 10 * day), group(2, T0 - 20 * day), group(3, T0 - 30 * day)], { now: T0 });
  const api = fakeApi({ getmeas: { more: 0, measuregrps: [group(1, T0 - 10 * day), group(3, T0 - 30 * day)] } });
  const r = await reconcile90({ db, api, uid: UID, token: 'AT', now: () => T0 });
  assert.equal(r.removed, 1);
  assert.equal(db.dump(P.body(UID, 'w_2')).deleted, true);
  assert.equal(db.dump(P.body(UID, 'w_2')).deleted_by, 'withings');
  assert.equal(db.dump(P.weight(UID, 'w_2')).deleted, true);
  assert.equal(db.dump(P.body(UID, 'w_1')).deleted, false);
  const endless = fakeApi({ getmeas: { more: 1, offset: 5, measuregrps: [] } });
  const r2 = await reconcile90({ db, api: endless, uid: UID, token: 'AT', now: () => T0 });
  assert.equal(r2.aborted, true);
  assert.equal(db.dump(P.body(UID, 'w_1')).deleted, false);
});

// ---------- webhook ----------
test('webhook: HEAD 200, bad key 404, appli ≠ 1 ignored, unknown user 200 no-op, good one enqueues and answers 200', async () => {
  const db = fakeDb();
  connected(db);
  const q = fakeQueue();
  const deps = { db, enqueue: q.enqueue, key: KEY, now: () => T0 };
  assert.equal((await handleWebhook({ method: 'HEAD', query: {} }, deps)).status, 200);
  assert.equal((await handleWebhook({ method: 'POST', query: { k: 'nope' }, body: { userid: WUSER, appli: '1' } }, deps)).status, 404);
  assert.equal((await handleWebhook({ method: 'POST', query: {}, body: { userid: WUSER, appli: '1' } }, deps)).status, 404);
  assert.equal((await handleWebhook({ method: 'POST', query: { k: KEY }, body: { userid: WUSER, appli: '44' } }, deps)).status, 200);
  assert.equal((await handleWebhook({ method: 'POST', query: { k: KEY }, body: { userid: '999', appli: '1' } }, deps)).status, 200);
  assert.equal(q.tasks.length, 0, 'nothing queued so far');
  const body = { userid: WUSER, appli: '1', startdate: String(sec(T0) - 10), enddate: String(sec(T0)) };
  const ok = await handleWebhook({ method: 'POST', query: { k: KEY }, body }, deps);
  assert.equal(ok.status, 200);
  assert.equal(q.tasks.length, 1);
  assert.equal(q.tasks[0].data.uid, UID);
  assert.equal(q.tasks[0].id, notifyTaskId(UID, body));
  // Withings retries the same notification: still one task, still 200.
  assert.equal((await handleWebhook({ method: 'POST', query: { k: KEY }, body }, deps)).status, 200);
  assert.equal(q.tasks.length, 1);
  assert.equal(db.dump(P.status(UID)).last_notify_at, new Date(T0).toISOString());
});

test('webhook: 503 when it can tell before replying that something failed (lookup or enqueue)', async () => {
  const db = fakeDb();
  connected(db);
  const body = { userid: WUSER, appli: '1', startdate: '1', enddate: '2' };
  const failing = { db, enqueue: async () => { throw Object.assign(new Error('UNAVAILABLE'), { code: 14 }); }, key: KEY };
  assert.equal((await handleWebhook({ method: 'POST', query: { k: KEY }, body }, failing)).status, 503);
  const badDb = { doc: () => ({ get: async () => { throw new Error('down'); } }) };
  assert.equal((await handleWebhook({ method: 'POST', query: { k: KEY }, body }, { db: badDb, enqueue: async () => {}, key: KEY })).status, 503);
});

test('webhook replies without calling Withings (the sync runs in the task)', async () => {
  const db = fakeDb();
  connected(db);
  const q = fakeQueue();
  const t = Date.now();
  await handleWebhook({ method: 'POST', query: { k: KEY }, body: { userid: WUSER, appli: '1', startdate: '3', enddate: '4' } }, { db, enqueue: q.enqueue, key: KEY });
  assert.ok(Date.now() - t < 200);
});

// ---------- tasks: notify sync and the backfill chain ----------
test('task: a notify task runs one incremental sync', async () => {
  const db = fakeDb();
  connected(db);
  const api = fakeApi({ getmeas: { updatetime: sec(T0), more: 0, measuregrps: [group(5, T0 - 30_000)] } });
  const q = fakeQueue();
  const r = await runTask({ kind: 'notify', uid: UID }, { db, api, enqueue: q.enqueue, now: () => T0 });
  assert.equal(r.created, 1);
  assert.equal(api.calls.filter((c) => c[0] === 'getmeas').length, 1);
  assert.equal(q.tasks.length, 0, 'a sync never queues more work');
});

test('backfill: one request = one run of each page, even when a page is retried', async () => {
  const db = fakeDb();
  connected(db);
  const pageOf = (off) => ({ updatetime: sec(T0), more: off < 2 ? 1 : 0, offset: off + 1, measuregrps: [group(1000 + off, T0 - (off + 1) * 86400_000)] });
  const api = fakeApi({ getmeas: (_t, o) => pageOf(o.offset || 0) });
  const q = fakeQueue();
  await requestBackfill({ db, enqueue: q.enqueue, uid: UID, runId: 'r1', now: () => T0 });
  await requestBackfill({ db, enqueue: q.enqueue, uid: UID, runId: 'r1', now: () => T0 }); // double tap / retried callback
  assert.equal(q.tasks.length, 1, 'the same request queues once');
  const ran = [];
  let task;
  while ((task = q.take())) {
    ran.push(task.id);
    await runTask(task.data, { db, api, enqueue: q.enqueue, now: () => T0 });
    if (task.data.page === 1) await runTask(task.data, { db, api, enqueue: q.enqueue, now: () => T0 }); // Cloud Tasks retries page 1
  }
  assert.deepEqual(ran, [backfillTaskId(UID, 'r1', 0), backfillTaskId(UID, 'r1', 1), backfillTaskId(UID, 'r1', 2)]);
  const bf = db.dump(P.status(UID)).backfill;
  assert.equal(bf.done, true);
  assert.equal(bf.from, new Date(Math.floor((T0 - 3 * 86400_000) / 1000) * 1000).toISOString());
  assert.equal([...db.docs.keys()].filter((k) => k.startsWith(`users/${UID}/body_measures/`)).length, 3);
  assert.equal(q.tasks.length, 0, 'the chain ends');
});

test('backfill: nothing in the job writes to a trigger path (no Firestore-triggered functions exist)', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8'));
  assert.ok(!/onDocument(Created|Written|Updated|Deleted)/.test(src), 'no Firestore triggers');
  assert.ok(/onTaskDispatched/.test(src));
});

test('backfill: a stale run (you reconnected) stops its chain', async () => {
  const db = fakeDb();
  connected(db);
  db.put(P.status(UID), { ...db.dump(P.status(UID)), backfill: { run_id: 'new' } });
  const q = fakeQueue();
  const r = await runTask({ kind: 'backfill', uid: UID, runId: 'old', page: 3, offset: 3 }, { db, api: fakeApi(), enqueue: q.enqueue, now: () => T0 });
  assert.equal(r.skipped, 'stale_run');
  assert.equal(q.tasks.length, 0);
});

test('task: disconnected since it was queued → dropped quietly', async () => {
  const r = await runTask({ kind: 'notify', uid: UID }, { db: fakeDb(), api: fakeApi(), enqueue: async () => {} });
  assert.equal(r.skipped, 'not_connected');
});

// ---------- tokens ----------
test('tokens: a valid token is used as is; a near-expiry one is refreshed and SAVED before use', async () => {
  const db = fakeDb();
  connected(db);
  const api = fakeApi({ refreshToken: { access_token: 'AT1', refresh_token: 'RT1', expires_in: 10800 } });
  assert.equal(await getAccessToken({ db, api, uid: UID, now: () => T0 }), 'AT0');
  assert.equal(api.calls.length, 0);
  let savedBeforeUse = null;
  const api2 = fakeApi({ refreshToken: () => ({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 10800 }) });
  const later = T0 + 3 * 3600 * 1000 - 60_000; // 1 min left
  const tok = await getAccessToken({ db, api: api2, uid: UID, now: () => later });
  savedBeforeUse = db.dump(P.priv(UID));
  assert.equal(tok, 'AT1');
  assert.equal(savedBeforeUse.refresh_token, 'RT1');
  assert.equal(savedBeforeUse.access_token, 'AT1');
  assert.equal(savedBeforeUse.lease_until, 0);
  assert.equal(api2.calls[0][1], 'RT0', 'refreshed with the stored refresh token');
});

test('tokens: two callers at once → one refresh (the lease); the second waits and reuses it', async () => {
  const db = fakeDb();
  connected(db, { expiresIn: 0 });
  let refreshes = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const api = fakeApi({ refreshToken: async () => { refreshes++; await gate; return { access_token: 'ATn', refresh_token: 'RTn', expires_in: 10800 }; } });
  const sleep = async () => { release(); await new Promise((r) => setTimeout(r, 5)); };
  const [a, b] = await Promise.all([
    getAccessToken({ db, api, uid: UID, now: () => T0, sleep }),
    getAccessToken({ db, api, uid: UID, now: () => T0, sleep }),
  ]);
  assert.equal(refreshes, 1);
  assert.equal(a, 'ATn');
  assert.equal(b, 'ATn');
});

test('tokens: if saving the new pair fails, the call fails (and the old refresh token still works for 8 h)', async () => {
  const db = fakeDb();
  connected(db, { expiresIn: 0 });
  const api = fakeApi({ refreshToken: { access_token: 'AT1', refresh_token: 'RT1', expires_in: 10800 } });
  const realDoc = db.doc;
  db.doc = (path) => {
    const r = realDoc(path);
    if (path === P.priv(UID)) return { ...r, update: async () => { throw new Error('UNAVAILABLE'); } };
    return r;
  };
  await assert.rejects(getAccessToken({ db, api, uid: UID, now: () => T0, sleep: async () => {} }), (e) => e.status === 'save_failed' && e.transient);
  db.doc = realDoc;
  assert.equal(db.dump(P.priv(UID)).refresh_token, 'RT0', 'old pair still stored; next run refreshes with it');
});

test('tokens: invalid refresh → one retry, then needs_reconnect; not connected → NotConnected', async () => {
  const db = fakeDb();
  connected(db, { expiresIn: 0 });
  const api = fakeApi({ refreshToken: new WithingsError(401, 'refresh') });
  await assert.rejects(getAccessToken({ db, api, uid: UID, now: () => T0, sleep: async () => {} }));
  assert.equal(api.calls.length, 2);
  assert.equal(db.dump(P.status(UID)).needs_reconnect, true);
  await assert.rejects(getAccessToken({ db: fakeDb(), api, uid: UID }), NotConnected);
});

// ---------- OAuth ----------
test('oauth: state is one-time and expires after 10 minutes', async () => {
  const db = fakeDb();
  const { url } = await startAuth({ db, api: fakeApi(), uid: UID, redirectUri: 'https://x/cb', now: () => T0 });
  const state = new URL(url).searchParams.get('state');
  assert.match(state, /^[a-f0-9]{64}$/);
  assert.equal(await consumeState(db, state, T0 + 1000), UID);
  assert.equal(await consumeState(db, state, T0 + 2000), null, 'used up');
  const { url: url2 } = await startAuth({ db, api: fakeApi(), uid: UID, redirectUri: 'https://x/cb', now: () => T0 });
  assert.equal(await consumeState(db, new URL(url2).searchParams.get('state'), T0 + 11 * 60_000), null, 'expired');
  assert.equal(await consumeState(db, '../../x', T0), null);
  await assert.rejects(startAuth({ db, api: fakeApi(), uid: null, redirectUri: 'x' }));
});

test('oauth callback: exchanges the code first, stores tokens server-side, maps the user, subscribes, starts one backfill', async () => {
  const db = fakeDb();
  const api = fakeApi({
    requestToken: { userid: 424242, access_token: 'AT', refresh_token: 'RT', expires_in: 10800, scope: 'user.info,user.metrics' },
    getdevice: { devices: [{ type: 'Scale', model: 'Body Comp', model_id: 13 }] },
  });
  const q = fakeQueue();
  const { url } = await startAuth({ db, api, uid: UID, redirectUri: 'https://x/cb', now: () => T0 });
  const state = new URL(url).searchParams.get('state');
  const r = await handleCallback({ state, code: 'c0de' }, { db, api, enqueue: q.enqueue, redirectUri: 'https://x/cb', webhookUrl: `https://x/wh?k=${KEY}`, appUrl: 'https://app/', now: () => T0, newRunId: () => 'run1' });
  assert.equal(r.redirect, 'https://app/withings-connected.html');
  assert.equal(api.calls[0][0], 'requestToken', 'the 30-second code is exchanged before anything else');
  assert.equal(db.dump(P.priv(UID)).refresh_token, 'RT');
  assert.equal(db.dump(P.wuser(WUSER)).uid, UID);
  const st = db.dump(P.status(UID));
  assert.equal(st.connected, true);
  assert.equal(st.model, 'Body Comp');
  assert.equal(st.subscription_ok, true);
  assert.ok(!JSON.stringify(st).includes('RT') && !JSON.stringify(st).includes(WUSER), 'no tokens or Withings user id in the app-readable doc');
  assert.equal(q.tasks.length, 1);
  assert.equal(q.tasks[0].data.kind, 'backfill');
  // Replaying the same callback URL (back button) does nothing.
  const again = await handleCallback({ state, code: 'c0de' }, { db, api, enqueue: q.enqueue, redirectUri: 'https://x/cb', webhookUrl: 'w', appUrl: 'a', now: () => T0 });
  assert.equal(again.page, 'expired');
  assert.equal(q.tasks.length, 1);
});

test('oauth callback: denied, failed exchange and a Withings account linked elsewhere', async () => {
  const db = fakeDb();
  const mk = async () => new URL((await startAuth({ db, api: fakeApi(), uid: UID, redirectUri: 'r', now: () => T0 })).url).searchParams.get('state');
  const base = { db, enqueue: fakeQueue().enqueue, redirectUri: 'r', webhookUrl: 'w', appUrl: 'a', now: () => T0 };
  assert.equal((await handleCallback({ error: 'access_denied', state: await mk() }, { ...base, api: fakeApi() })).page, 'denied');
  assert.equal((await handleCallback({ state: await mk(), code: 'x' }, { ...base, api: fakeApi({ requestToken: new WithingsError(503, 'requesttoken') }) })).page, 'exchange_failed');
  db.put(P.wuser(WUSER), { uid: 'someone-else' });
  const r = await handleCallback({ state: await mk(), code: 'x' }, { ...base, api: fakeApi({ requestToken: { userid: WUSER, access_token: 'a', refresh_token: 'b' } }) });
  assert.equal(r.page, 'other_account');
  assert.equal(db.dump(P.priv(UID)), undefined, 'no tokens stored');
});

// ---------- data check ----------
test('data check: per-type counts, dates, last value, positions; falls back to one type at a time when the list is rejected', async () => {
  const db = fakeDb();
  connected(db);
  await applyGroups(db, UID, [group(1, T0)], { now: T0 });
  const api = fakeApi({
    getdevice: { devices: [{ type: 'Scale', model: 'Body Comp', last_session_date: sec(T0) }] },
    getmeas: (_t, o) => {
      if (o.meastypes.length > 1) throw new WithingsError(2555, 'getmeas');
      if (o.meastypes[0] === 140) throw new WithingsError(503, 'getmeas'); // JSON status: invalid params
      if (o.meastypes[0] === 1) return { more: 0, measuregrps: [group(1, T0 - 86400_000, 83), group(2, T0, 82.3)].map((g) => ({ ...g, measures: g.measures.filter((m) => m.type === 1) })) };
      return { more: 0, measuregrps: [] };
    },
    notifyList: { profiles: [{ appli: 1, callbackurl: `https://x/wh?k=${KEY}`, expires: sec(T0) + 86400 }] },
  });
  const r = await runDataCheck({ db, api, uid: UID, token: 'AT', webhookUrl: `https://x/wh?k=${KEY}`, now: () => T0 });
  assert.deepEqual(r.rejected, [140]);
  assert.equal(r.types[1].count, 2);
  assert.equal(r.types[1].last_value, 82.3);
  assert.equal(r.types[1].last, new Date(sec(T0) * 1000).toISOString());
  assert.equal(r.subscription.present, true);
  assert.equal(r.subscription.key_ok, true);
  assert.ok(!r.subscription.callback.includes(KEY), 'key masked');
  assert.equal(r.stored_groups, 1);
  assert.equal(r.model, 'Body Comp');
  assert.ok(db.dump(P.status(UID)).data_check);
  await saveReport({ db, uid: UID, label: 'subscribed', now: () => T0 });
  await saveReport({ db, uid: UID, label: 'after cancelling', now: () => T0 + 1 });
  assert.deepEqual(db.dump(P.status(UID)).data_check_history.map((h) => h.label), ['subscribed', 'after cancelling']);
});

// ---------- maintenance and disconnect ----------
test('maintenance: forces a refresh, re-subscribes when the subscription is gone, syncs, resumes a stalled backfill', async () => {
  const db = fakeDb();
  connected(db);
  db.put(P.status(UID), { ...db.dump(P.status(UID)), backfill: { done: false, pages: 4, offset: 4, updated_at: new Date(T0 - 7 * 3600_000).toISOString() } });
  const api = fakeApi({
    refreshToken: { access_token: 'AT1', refresh_token: 'RT1', expires_in: 10800 },
    notifyList: { profiles: [] },
    getmeas: { updatetime: sec(T0), more: 0, measuregrps: [] },
  });
  const q = fakeQueue();
  const r = await maintainUser({ db, api, enqueue: q.enqueue, uid: UID, webhookUrl: 'https://x/wh?k=1', now: () => T0 });
  assert.equal(api.calls.filter((c) => c[0] === 'refreshToken').length, 1);
  assert.equal(r.resubscribed, true);
  assert.ok(api.calls.some((c) => c[0] === 'notifySubscribe'));
  assert.equal(r.backfill_resumed, true);
  assert.equal(q.tasks[0].data.offset, 4);
  assert.equal(q.tasks[0].data.page, 4);
});

test('disconnect: revokes, deletes tokens and mapping; deleteData also removes synced docs and Withings weights', async () => {
  const db = fakeDb();
  connected(db);
  await applyGroups(db, UID, [group(1, T0), group(2, T0 - 86400_000)], { now: T0 });
  db.put(P.weight(UID, 'manual1'), { id: 'manual1', kg: 80, source: 'manual' });
  db.put(`${P.healthCol(UID)}/2026-10-09`, { steps: 1 });
  const api = fakeApi();
  const r = await disconnect({ db, api, uid: UID, webhookUrl: 'w', deleteData: true, now: () => T0 });
  assert.equal(r.revoked, true);
  assert.equal(db.dump(P.priv(UID)), undefined);
  assert.equal(db.dump(P.wuser(WUSER)), undefined);
  assert.equal(db.dump(P.body(UID, 'w_1')), undefined);
  assert.equal(db.dump(P.weight(UID, 'w_1')), undefined);
  assert.equal(db.dump(`${P.healthCol(UID)}/2026-10-09`), undefined);
  assert.ok(db.dump(P.weight(UID, 'manual1')), 'your own weigh-ins stay (delete-everything removes them itself)');
  assert.equal(db.dump(P.status(UID)), undefined);
});

// ---------- logging and the HTTP client ----------
test('log: only codes, counts and durations get through; tokens and health values never do', () => {
  const lines = [];
  setSink((l) => lines.push(l));
  log('sync', { count: 3, ms: 120, access_token: 'abc', refresh_token: 'def', weight_kg: 82.3, value: 82.3, code: 'f'.repeat(40), status: 401 });
  setSink((l) => console.log(l));
  const out = JSON.parse(lines[0]);
  assert.deepEqual(out, { count: 3, ms: 120, status: 401, event: 'sync' });
  assert.deepEqual(clean({ count: 82.3 }), {}, 'non-integers (health values) dropped');
});

test('client: form POST with the bearer token; HTTP and JSON statuses become WithingsError; transient vs permanent', async () => {
  const seen = [];
  const fetch = async (url, init) => { seen.push([url, init]); return { ok: true, json: async () => ({ status: 0, body: { ok: 1 } }) }; };
  const c = makeClient({ fetch, clientId: 'cid', clientSecret: 'sec' });
  await c.getmeas('TOKEN', { meastypes: [1, 6], lastupdate: 5 });
  assert.equal(seen[0][0], 'https://wbsapi.withings.net/measure');
  assert.equal(seen[0][1].headers.Authorization, 'Bearer TOKEN');
  const body = new URLSearchParams(seen[0][1].body);
  assert.equal(body.get('action'), 'getmeas');
  assert.equal(body.get('meastypes'), '1,6');
  assert.equal(body.get('category'), '1');
  const u = new URL(c.authorizeUrl({ redirectUri: 'https://r/cb', state: 's' }));
  assert.equal(u.origin + u.pathname, 'https://account.withings.com/oauth2_user/authorize2');
  assert.equal(u.searchParams.get('scope'), 'user.info,user.metrics');
  const bad = makeClient({ fetch: async () => ({ ok: false, status: 502 }), clientId: 'c' });
  await assert.rejects(bad.getdevice('t'), (e) => e.transient && e.status === 'http_502');
  const rl = makeClient({ fetch: async () => ({ ok: true, json: async () => ({ status: 601 }) }), clientId: 'c' });
  await assert.rejects(rl.getdevice('t'), (e) => e.transient);
  const perm = makeClient({ fetch: async () => ({ ok: true, json: async () => ({ status: 503 }) }), clientId: 'c' });
  await assert.rejects(perm.getdevice('t'), (e) => !e.transient, 'JSON 503 = invalid params, not an outage');
  const inv = makeClient({ fetch: async () => ({ ok: true, json: async () => ({ status: 401 }) }), clientId: 'c' });
  await assert.rejects(inv.getdevice('t'), (e) => e.invalidToken);
});
