// Apple Health bridge, no network: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fake-db.js';
import {
  hashToken, newToken, looksLikeToken, parsePayload, BadPayload, sleepFromSegments, mergeDay,
  handleIngest, importDays, createToken, revokeToken, wipeApple, deleteAppleData, MAX_BODY_BYTES, RATE_PER_HOUR, RATE_PER_DAY,
} from '../src/health.js';
import { disconnect } from '../src/maintenance.js';
import { setSink } from '../src/log.js';
import { P } from '../src/paths.js';

const UID = 'u1';
const NOW = Date.parse('2026-10-10T12:00:00Z');
const now = () => NOW;

// Synthetic values only.
const DAY = { day: '2026-10-10', hrv_sdnn_ms: 51.4, rhr_bpm: 55, resp_rate: 14.2, wrist_temp_delta_c: 0.1, steps: 1234 };

const post = (db, token, body, extra = {}) => handleIngest({
  method: 'POST', headers: { authorization: `Bearer ${token}` }, bodyBytes: JSON.stringify(body || {}).length, body, ...extra,
}, { db, now });

test('tokens: 32 random bytes, a stable SHA-256 hash, and a recognisable shape', () => {
  const t = newToken();
  assert.ok(looksLikeToken(t));
  assert.notEqual(newToken(), t);
  assert.match(hashToken(t), /^[a-f0-9]{64}$/);
  assert.equal(hashToken(t), hashToken(t));
  assert.ok(!looksLikeToken('abc') && !looksLikeToken(''));
});

test('createToken stores only the hash, returns the token once, and rotating replaces the old hash', async () => {
  const db = fakeDb();
  const a = await createToken({ db, uid: UID, now });
  const ha = hashToken(a.token);
  assert.deepEqual(db.dump(P.shortcutTok(ha)), { uid: UID });
  assert.equal(db.dump(P.shortcut(UID)).token_hash, ha);
  assert.ok(!JSON.stringify([...db.docs.values()]).includes(a.token), 'the token itself is never stored');
  assert.equal(db.dump(P.apple(UID)).connected, true);
  assert.ok(!('token_hash' in db.dump(P.apple(UID))), 'the status doc carries no hash');
  const b = await createToken({ db, uid: UID, now });
  assert.equal(db.dump(P.shortcutTok(ha)), undefined, 'old hash gone');
  assert.deepEqual(db.dump(P.shortcutTok(hashToken(b.token))), { uid: UID });
  assert.equal(db.dump(P.shortcut(UID)).token_hash, hashToken(b.token));
});

test('revokeToken: the token stops working; revoking twice is fine', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  assert.equal((await post(db, token, DAY)).status, 200);
  await revokeToken({ db, uid: UID, now });
  await revokeToken({ db, uid: UID, now });
  assert.equal((await post(db, token, DAY)).status, 401);
  assert.equal(db.dump(P.shortcut(UID)), undefined);
  assert.equal(db.dump(P.apple(UID)).connected, false);
});

test('ingest: lookup by hash, upsert health_daily/{day} with source apple_shortcut', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  const r = await post(db, token, DAY);
  assert.equal(r.status, 200);
  const d = db.dump(P.health(UID, '2026-10-10'));
  assert.equal(d.source, 'apple_shortcut');
  assert.equal(d.user_id, UID);
  assert.equal(d.id, '2026-10-10');
  assert.equal(d.deleted, false);
  assert.equal(d.hrv_sdnn_ms, 51.4);
  assert.equal(d.steps, 1234);
  const st = db.dump(P.apple(UID));
  assert.equal(st.last_day, '2026-10-10');
  assert.deepEqual(st.fields_last, ['resp_rate', 'rhr_bpm', 'steps', 'hrv_sdnn_ms', 'wrist_temp_delta_c'].sort());
  assert.ok(st.last_ingest_at);
  assert.ok(!JSON.stringify(st).includes('51.4'), 'no health values in the status doc');
});

test('ingest: 401 for missing, malformed, wrong and other users’ tokens; nothing is written', async () => {
  const db = fakeDb();
  const mine = await createToken({ db, uid: UID, now });
  const before = db.stats.writes;
  for (const h of [{}, { authorization: 'Bearer nope' }, { authorization: `Basic ${mine.token}` }, { authorization: `Bearer ${newToken()}` }]) {
    const r = await handleIngest({ method: 'POST', headers: h, bodyBytes: 10, body: DAY }, { db, now });
    assert.equal(r.status, 401);
  }
  assert.equal(db.stats.writes, before);
});

test('ingest: 405 for GET, 413 over 256 KB (before any lookup), 400 for a bad day or body', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  assert.equal((await handleIngest({ method: 'GET', headers: {}, bodyBytes: 0, body: null }, { db, now })).status, 405);
  const reads = db.stats.reads;
  assert.equal((await post(db, token, DAY, { bodyBytes: MAX_BODY_BYTES + 1 })).status, 413);
  assert.equal((await post(db, 'nonsense', DAY, { bodyBytes: MAX_BODY_BYTES + 1 })).status, 413, 'even without a valid token');
  assert.equal(db.stats.reads, reads, '413 does no database work');
  assert.equal((await post(db, token, DAY, { bodyBytes: MAX_BODY_BYTES })).status, 200);
  assert.equal((await post(db, token, null)).status, 400);
  assert.equal((await post(db, token, { day: 'yesterday', steps: 5 })).status, 400);
  assert.equal((await post(db, token, { day: '2026-10-10' })).status, 400);
  assert.equal((await post(db, token, { day: '2030-01-01', steps: 5 })).status, 400);
  assert.equal((await post(db, token, { day: '2026-02-31', steps: 5 })).status, 400);
});

test('ingest: a field that can’t be read is dropped on its own; the rest is saved and the names are reported', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  const r = await post(db, token, { day: '2026-10-10', rhr_bpm: { x: 1 }, hrv_sdnn_ms: 9999, steps: 4000, resp_rate: 14 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.rejected, ['hrv_sdnn_ms', 'rhr_bpm']);
  assert.deepEqual(r.body.fields, ['resp_rate', 'steps']);
  const doc = db.dump(P.health(UID, '2026-10-10'));
  assert.equal(doc.steps, 4000);
  assert.ok(!('rhr_bpm' in doc) && !('hrv_sdnn_ms' in doc));
  assert.deepEqual(db.dump(P.apple(UID)).rejected_last, ['hrv_sdnn_ms', 'rhr_bpm'], 'field names only');
  // Nothing readable at all is still a 400 (and never echoes a value).
  const none = await post(db, token, { day: '2026-10-10', rhr_bpm: 'abc' });
  assert.deepEqual(none, { status: 400, body: { error: 'unreadable' } });
});

test('ingest: Fahrenheit, thousands separators, decimal commas', () => {
  const [{ fields: f }] = parsePayload({ day: '2026-10-10', wrist_temp_c: '97.3', steps: '8,532', rhr_bpm: '52,5', active_kcal: '1,234.5' }, { now: NOW });
  assert.equal(f.wrist_temp_c, 36.28, '97.3 °F → 36.28 °C');
  assert.equal(f.steps, 8532);
  assert.equal(f.rhr_bpm, 52.5);
  assert.equal(f.active_kcal, 1235);
  const [{ fields: g }] = parsePayload({ day: '2026-10-10', wrist_temp_c: [96.8, 97.7, 36.5], hrv_sdnn_ms: ['48,5', '52,5'] }, { now: NOW });
  assert.equal(g.wrist_temp_c, 36.33, 'samples in °F and °C are each converted');
  assert.equal(g.hrv_sdnn_ms, 50.5);
  const [{ fields: h }] = parsePayload({ day: '2026-10-10', wrist_temp_c: 36.4, wrist_temp_delta_c: 0.4 }, { now: NOW });
  assert.equal(h.wrist_temp_c, 36.4, '°C is left alone');
});

test('ingest: one bad sleep line is skipped; the rest of sleep and every other field survive', () => {
  const rejected = [];
  const [{ fields }] = parsePayload({
    day: '2026-10-10', hrv_sdnn_ms: 50, steps: 100,
    sleep_text: 'Core,2026-10-10T01:00:00Z,2026-10-10T03:00:00Z\nDeep,not a date,2026-10-10T04:00:00Z\nREM,2026-10-10T03:00:00Z,2026-10-10T04:00:00Z',
  }, { now: NOW, rejected });
  assert.deepEqual(rejected, ['sleep_text']);
  assert.equal(fields.hrv_sdnn_ms, 50);
  assert.equal(fields.sleep.asleep_min, 180);
  assert.ok(!('deep_min' in fields.sleep));
  // A sleep value that isn’t usable at all drops only the sleep field.
  const rej2 = [];
  const [{ fields: g }] = parsePayload({ day: '2026-10-10', steps: 100, sleep: 'lots' }, { now: NOW, rejected: rej2 });
  assert.deepEqual(rej2, ['sleep']);
  assert.equal(g.steps, 100);
  assert.ok(!('sleep' in g));
  // A bad workout line is skipped too.
  const [{ fields: w }] = parsePayload({ day: '2026-10-10', workouts_text: 'Running,2026-10-10T07:00:00Z,45,420,150\nYoga,nope,xx' }, { now: NOW });
  assert.equal(w.workouts.length, 1);
});

test('import: a day with an unreadable value no longer fails the whole chunk', async () => {
  const db = fakeDb();
  const r = await importDays({ db, uid: UID, now, data: { days: [{ day: '2026-10-01', wrist_temp_c: 'warm', steps: 5 }, { day: '2026-10-02', hrv_sdnn_ms: 40 }] } });
  assert.equal(r.days, 2);
  assert.equal(db.dump(P.health(UID, '2026-10-01')).steps, 5);
});

test('ingest: *_yesterday totals land on the day before; a morning post then an evening post keeps the overnight HRV', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  const morning = await post(db, token, { day: '2026-10-10', hrv_sdnn_ms: 52, rhr_bpm: 55, steps: 300, steps_yesterday: 9100, exercise_min_yesterday: 31 });
  assert.equal(morning.status, 200);
  assert.equal(db.dump(P.health(UID, '2026-10-09')).steps, 9100);
  assert.equal(db.dump(P.health(UID, '2026-10-09')).exercise_min, 31);
  assert.equal(db.dump(P.health(UID, '2026-10-10')).steps, 300);
  await post(db, token, { day: '2026-10-10', steps: 7400, active_kcal: 520, steps_yesterday: 9100 });
  const d = db.dump(P.health(UID, '2026-10-10'));
  assert.equal(d.hrv_sdnn_ms, 52, 'the evening run leaves overnight signals alone');
  assert.equal(d.rhr_bpm, 55);
  assert.equal(d.steps, 7400);
  assert.equal(d.active_kcal, 520);
});

test('ingest: over 30 posts an hour → 429 (nothing written); the window resets; 200 a day is the other cap', async () => {
  const lines = [];
  setSink((l) => lines.push(l));
  try {
    const db = fakeDb();
    const { token } = await createToken({ db, uid: UID, now });
    for (let i = 0; i < RATE_PER_HOUR; i++) assert.equal((await post(db, token, { ...DAY, steps: 100 + i })).status, 200);
    const writes = db.stats.writes;
    const r = await post(db, token, { ...DAY, steps: 5 });
    assert.deepEqual(r, { status: 429, body: { error: 'slow_down' } });
    assert.equal(db.stats.writes, writes, 'a refused post writes nothing');
    assert.ok(lines.some((l) => JSON.parse(l).status === 429));
    // an hour later it works again
    const later = (b) => handleIngest({ method: 'POST', headers: { authorization: `Bearer ${token}` }, bodyBytes: 10, body: b }, { db, now: () => NOW + 3600001 });
    assert.equal((await later({ ...DAY, steps: 1 })).status, 200);
    assert.ok(db.dump(P.shortcutTok(hashToken(token))).last_used_at);
    // the daily cap
    const tok = db.dump(P.shortcutTok(hashToken(token)));
    db.put(P.shortcutTok(hashToken(token)), { ...tok, day_n: RATE_PER_DAY, day_start: NOW + 3600001, hour_n: 0, hour_start: NOW + 3600001 });
    assert.equal((await later({ ...DAY, steps: 2 })).status, 429);
  } finally {
    setSink((l) => console.log(l));
  }
});

test('ingest logs and errors carry no health values or tokens', async () => {
  const lines = [];
  setSink((l) => lines.push(l));
  try {
    const db = fakeDb();
    const { token } = await createToken({ db, uid: UID, now });
    await post(db, token, { ...DAY, hrv_sdnn_ms: 51.4321 });
    await post(db, token, { day: '2026-10-10', rhr_bpm: 777.5 });
    await post(db, newToken(), DAY);
    const all = lines.join('\n');
    for (const secret of ['51.4321', '777.5', token, hashToken(token)]) assert.ok(!all.includes(secret));
    assert.ok(lines.length >= 3);
  } finally {
    setSink((l) => console.log(l));
  }
});

test('late and duplicate posts merge by day: newer non-empty fields win, others are kept, same post writes nothing', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  await post(db, token, { day: '2026-10-09', steps: 3000, rhr_bpm: 54, sleep: { asleep_min: 400, deep_min: 60 } });
  const w = db.stats.writes;
  await post(db, token, { day: '2026-10-09', steps: 3000, rhr_bpm: 54, sleep: { asleep_min: 400, deep_min: 60 } });
  assert.equal(db.stats.writes, w + 2, 'only the status doc and the token’s rate counter are touched by an exact duplicate');
  await post(db, token, { day: '2026-10-09', steps: 9100, hrv_sdnn_ms: 48, sleep: { rem_min: 90 }, rhr_bpm: '' });
  const d = db.dump(P.health(UID, '2026-10-09'));
  assert.equal(d.steps, 9100);
  assert.equal(d.rhr_bpm, 54, 'an empty value never erases');
  assert.equal(d.hrv_sdnn_ms, 48);
  assert.deepEqual(d.sleep, { asleep_min: 400, deep_min: 60, rem_min: 90 });
  assert.equal(d.created_at, db.dump(P.health(UID, '2026-10-09')).created_at);
});

test('a deleted (tombstoned) day is never resurrected', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  db.put(P.health(UID, '2026-10-08'), { id: '2026-10-08', user_id: UID, deleted: true, steps: 1 });
  await post(db, token, { day: '2026-10-08', steps: 9999 });
  assert.equal(db.dump(P.health(UID, '2026-10-08')).steps, 1);
});

test('payload leniency Shortcuts needs: text numbers, sample lists, empty values, several days, spo2 fractions', () => {
  const [d] = parsePayload({
    day: '2026-10-10', hrv_sdnn_ms: ['40', 50, 60, 'oops', 9999], rhr_bpm: '55', steps: [100, 200, '300'],
    wrist_temp_delta_c: '', resp_rate: [], spo2_avg_pct: [0.96, 0.98], vo2max: null,
  }, { now: NOW });
  assert.equal(d.fields.hrv_sdnn_ms, 50);
  assert.equal(d.fields.hrv_samples, 3);
  assert.equal(d.fields.rhr_bpm, 55);
  assert.equal(d.fields.steps, 600);
  assert.equal(d.fields.spo2_avg_pct, 97);
  assert.ok(!('wrist_temp_delta_c' in d.fields) && !('resp_rate' in d.fields) && !('vo2max' in d.fields));
  const two = parsePayload({ days: [{ day: '2026-10-09', steps: 1 }, { day: '2026-10-10', steps: 2 }, { day: '2026-10-10', rhr_bpm: 50 }] }, { now: NOW });
  assert.equal(two.length, 2);
  assert.deepEqual(two[1].fields, { steps: 2, rhr_bpm: 50 });
  assert.throws(() => parsePayload({ days: Array.from({ length: 15 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, steps: 1 })) }, { now: NOW }), BadPayload);
});

test('what a Shortcut really sends: lists as text (one value per line), sleep and workouts as lines of text', () => {
  const [d] = parsePayload({
    day: '2026-10-10',
    hrv_sdnn_ms: '40\n50\n60\n',
    steps: '100\n200;300',
    sleep_text: 'Core,2026-10-09T23:00:00Z,2026-10-10T01:00:00Z\nDeep,2026-10-10T01:00:00Z,2026-10-10T02:00:00Z\n',
    workouts_text: 'Running,2026-10-10T07:00:00Z,45,420,150',
  }, { now: NOW });
  assert.equal(d.fields.hrv_sdnn_ms, 50);
  assert.equal(d.fields.hrv_samples, undefined, 'a text list does not claim a sample count');
  assert.equal(d.fields.steps, 600);
  assert.deepEqual([d.fields.sleep.asleep_min, d.fields.sleep.core_min, d.fields.sleep.deep_min], [180, 120, 60]);
  assert.deepEqual(d.fields.workouts, [{ type: 'Running', start: '2026-10-10T07:00:00Z', duration_min: 45, kcal: 420, avg_hr: 150 }]);
  assert.throws(() => parsePayload({ day: '2026-10-10', sleep_text: 'Core,not a date,2026-10-10T01:00:00Z' }, { now: NOW }), BadPayload);
  assert.throws(() => parsePayload({ day: '2026-10-10', sleep_text: 'x'.repeat(70000) }, { now: NOW }), BadPayload);
});

test('sleep segments: stages are summed with overlaps (iPhone + Watch) counted once', () => {
  const s = sleepFromSegments([
    { stage: 'Core', start: '2026-10-09T23:00:00Z', end: '2026-10-10T01:00:00Z' },
    { stage: 'Deep', start: '2026-10-10T01:00:00Z', end: '2026-10-10T02:00:00Z' },
    { stage: 'REM', start: '2026-10-10T02:00:00Z', end: '2026-10-10T03:00:00Z' },
    { stage: 'Awake', start: '2026-10-10T03:00:00Z', end: '2026-10-10T03:10:00Z' },
    { stage: 'Core', start: '2026-10-10T00:30:00Z', end: '2026-10-10T01:30:00Z' }, // duplicate source overlaps
    { stage: 'In Bed', start: '2026-10-09T22:45:00Z', end: '2026-10-10T03:10:00Z' },
  ]);
  assert.deepEqual(
    [s.asleep_min, s.core_min, s.deep_min, s.rem_min, s.awake_min, s.in_bed_start, s.in_bed_end],
    [240, 150, 60, 60, 10, '2026-10-09T22:45:00.000Z', '2026-10-10T03:10:00.000Z'],
    'asleep is the union 23:00–03:00; the overlapping duplicate core segment is counted once'
  );
});

test('sleep segments: core minutes after the overlap merge', () => {
  const s = sleepFromSegments([
    { stage: 'asleepCore', start: '2026-10-09T23:00:00Z', end: '2026-10-10T01:00:00Z' },
    { stage: 'asleepCore', start: '2026-10-10T00:30:00Z', end: '2026-10-10T01:30:00Z' },
    { stage: 'asleepDeep', start: '2026-10-10T01:30:00Z', end: '2026-10-10T02:00:00Z' },
  ]);
  assert.equal(s.core_min, 150);
  assert.equal(s.deep_min, 30);
  assert.equal(s.asleep_min, 180);
  assert.equal(s.in_bed_start, '2026-10-09T23:00:00.000Z');
  assert.throws(() => sleepFromSegments([{ stage: 'nap?', start: 'x', end: 'y' }]), BadPayload);
});

test('mergeDay: no change → null; first write has the standard fields', () => {
  const nowIso = new Date(NOW).toISOString();
  const first = mergeDay(null, { uid: UID, day: '2026-10-10', fields: { steps: 5 }, source: 'apple_export', nowIso });
  assert.deepEqual([first.id, first.user_id, first.source, first.deleted, first.created_at, first.updated_at], ['2026-10-10', UID, 'apple_export', false, nowIso, nowIso]);
  assert.equal(mergeDay(first, { uid: UID, day: '2026-10-10', fields: { steps: 5 }, source: 'apple_export', nowIso }), null);
  const other = mergeDay(first, { uid: UID, day: '2026-10-10', fields: { steps: 5 }, source: 'apple_shortcut', nowIso });
  assert.deepEqual(other.sources, ['apple_export', 'apple_shortcut'], 'a new source is recorded even if the values match');
});

test('importDays: export days merge with Shortcut days (newer non-empty wins), source recorded, status updated', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  await post(db, token, { day: '2026-10-09', rhr_bpm: 54, steps: 8000 });
  const r = await importDays({
    db, uid: UID, now,
    data: { days: [{ day: '2026-10-09', hrv_sdnn_ms: 47, rhr_bpm: 53 }, { day: '2026-10-08', hrv_sdnn_ms: 44, sleep: { asleep_min: 430 } }] },
  });
  assert.deepEqual([r.days, r.written, r.skipped], [2, 2, 0]);
  const a = db.dump(P.health(UID, '2026-10-09'));
  assert.deepEqual([a.steps, a.rhr_bpm, a.hrv_sdnn_ms, a.source], [8000, 53, 47, 'apple_export']);
  assert.deepEqual(a.sources, ['apple_shortcut', 'apple_export']);
  assert.equal(db.dump(P.health(UID, '2026-10-08')).source, 'apple_export');
  const st = db.dump(P.apple(UID));
  assert.equal(st.import_days, 2);
  assert.ok(st.last_import_at && st.fields_seen.includes('hrv_sdnn_ms') && st.fields_seen.includes('sleep'));
  await assert.rejects(importDays({ db, uid: UID, now, data: { days: [] } }), BadPayload);
  await assert.rejects(importDays({ db, uid: UID, now, data: { days: Array.from({ length: 121 }, () => ({ day: '2026-10-01', steps: 1 })) } }), BadPayload);
});

test('Withings disconnect with deleteData leaves Apple Health days, the Shortcut token and its status alone', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  await post(db, token, DAY);
  await disconnect({ db, api: {}, uid: UID, webhookUrl: 'x', deleteData: true, now });
  assert.ok(db.dump(P.health(UID, '2026-10-10')));
  assert.ok(db.dump(P.shortcut(UID)));
  assert.ok(db.dump(P.shortcutTok(hashToken(token))));
  assert.ok(db.dump(P.apple(UID)));
  assert.equal((await post(db, token, DAY)).status, 200);
});

test('delete everything: disconnect(deleteData + deleteApple) also removes days, the Shortcut token, its hash map and the Apple status', async () => {
  const db = fakeDb();
  const { token } = await createToken({ db, uid: UID, now });
  await post(db, token, DAY);
  await disconnect({ db, api: {}, uid: UID, webhookUrl: 'x', deleteData: true, deleteApple: true, now });
  assert.equal(db.dump(P.health(UID, '2026-10-10')), undefined);
  assert.equal(db.dump(P.shortcut(UID)), undefined);
  assert.equal(db.dump(P.shortcutTok(hashToken(token))), undefined);
  assert.equal(db.dump(P.apple(UID)), undefined);
  assert.equal((await post(db, token, DAY)).status, 401);
  await wipeApple({ db, uid: UID }); // idempotent
});
