// Security rule tests. They run against the local Firebase emulator only (the "demo-" project ID
// guarantees the emulator can never touch a real Firebase project). No cloud, no cost.
//   cd tests/rules && npm install && npm test
// Needs Node 20+ and Java 21+. See SETUP.md → "Optional: run the security rule tests".
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, collectionGroup, getDocs,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-forge';
let env;
const rec = (uid, id, extra = {}) => ({
  id, user_id: uid, created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z',
  source: 'manual', deleted: false, ...extra,
});
const weight = (uid, id) => rec(uid, id, { kg: 90, day: '2026-10-07' });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid) => env.authenticatedContext(uid).firestore();

test('owner can create, read, update and delete their own record', async () => {
  const db = as('alice');
  const ref = doc(db, 'users/alice/weights/w1');
  await assertSucceeds(setDoc(ref, weight('alice', 'w1')));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { kg: 89, updated_at: '2026-10-08T00:00:00Z' }));
  await assertSucceeds(updateDoc(ref, { deleted: true, deleted_at: '2026-10-08T00:00:00Z' }));
  await assertSucceeds(deleteDoc(ref));
});

test('owner can list their own collection', async () => {
  const db = as('alice');
  await setDoc(doc(db, 'users/alice/weights/w1'), weight('alice', 'w1'));
  await assertSucceeds(getDocs(collection(db, 'users/alice/weights')));
});

test('another user cannot read, list or write my data', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/weights/w1'), weight('alice', 'w1')));
  const bob = as('bob');
  await assertFails(getDoc(doc(bob, 'users/alice/weights/w1')));
  await assertFails(getDocs(collection(bob, 'users/alice/weights')));
  await assertFails(setDoc(doc(bob, 'users/alice/weights/w2'), weight('bob', 'w2')));
  await assertFails(setDoc(doc(bob, 'users/alice/weights/w2'), weight('alice', 'w2')));
  await assertFails(deleteDoc(doc(bob, 'users/alice/weights/w1')));
});

test('collection-group queries are denied, even for the owner', async () => {
  await setDoc(doc(as('alice'), 'users/alice/weights/w1'), weight('alice', 'w1'));
  await assertFails(getDocs(collectionGroup(as('alice'), 'weights')));
  await assertFails(getDocs(collectionGroup(as('bob'), 'weights')));
});

test('signed-out visitors get nothing', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'users/alice/weights/w1')));
  await assertFails(getDocs(collection(anon, 'users/alice/weights')));
  await assertFails(setDoc(doc(anon, 'users/alice/weights/w1'), weight('alice', 'w1')));
});

test('records must carry the standard fields and matching ids', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'users/alice/weights/w1'), { kg: 90, day: '2026-10-07' }));
  await assertFails(setDoc(doc(db, 'users/alice/weights/w1'), weight('alice', 'different-id')));
  await assertFails(setDoc(doc(db, 'users/alice/weights/w1'), weight('bob', 'w1')));
});

test('created_at and user_id cannot change; standard fields cannot be removed', async () => {
  const db = as('alice');
  const ref = doc(db, 'users/alice/weights/w1');
  await setDoc(ref, weight('alice', 'w1'));
  await assertFails(updateDoc(ref, { created_at: '2020-01-01T00:00:00Z' }));
  await assertFails(updateDoc(ref, { user_id: 'bob' }));
  await assertFails(updateDoc(ref, { source: deleteField() }));
  await assertFails(updateDoc(ref, { deleted: deleteField() }));
});

test('only known collections are allowed', async () => {
  await assertFails(setDoc(doc(as('alice'), 'users/alice/secrets/x'), rec('alice', 'x')));
  await assertFails(getDocs(collection(as('alice'), 'users/alice/secrets')));
});

test('basic type checks', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'users/alice/weights/w1'), rec('alice', 'w1', { kg: '90', day: '2026-10-07' })));
  await assertFails(setDoc(doc(db, 'users/alice/weights/w1'), rec('alice', 'w1', { kg: 0, day: '2026-10-07' })));
  await assertFails(setDoc(doc(db, 'users/alice/profile/other'), rec('alice', 'other', { goal: 'lose', weightKg: 90, heightCm: 180 })));
  await assertSucceeds(setDoc(doc(db, 'users/alice/profile/main'), rec('alice', 'main', { goal: 'lose', weightKg: 90, heightCm: 180 })));
  await assertSucceeds(setDoc(doc(db, 'users/alice/workouts/k1'), rec('alice', 'k1', { location_id: 'l1', exercises: [], started_at: '2026-10-07T10:00:00Z', status: 'active' })));
  await assertFails(setDoc(doc(db, 'users/alice/workouts/k2'), rec('alice', 'k2', { exercises: [], started_at: '2026-10-07T10:00:00Z', status: 'active' })));
  await assertSucceeds(setDoc(doc(db, 'users/alice/locations/l1'), rec('alice', 'l1', { name: 'Home', equipment: [], weight_inventory: {} })));
});

test('deeper paths are denied', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'users/alice/weights/w1/notes/n1'), rec('alice', 'n1')));
  await assertFails(getDoc(doc(db, 'users/alice/weights/w1/notes/n1')));
});

test('private collection is closed even to the owner', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'users/alice/private/withings'), rec('alice', 'withings')));
  await assertFails(getDoc(doc(db, 'users/alice/private/withings')));
});

test('the users/{uid} document itself is closed', async () => {
  await assertFails(setDoc(doc(as('alice'), 'users/alice'), { x: 1 }));
  await assertFails(getDoc(doc(as('alice'), 'users/alice')));
});

test('workouts: pause fields are typed (v0.3.0)', async () => {
  const db = as('alice');
  const base = rec('alice', 'k1', { location_id: 'l1', exercises: [], started_at: '2026-10-08T10:00:00Z', status: 'active' });
  const ref = doc(db, 'users/alice/workouts/k1');
  await assertSucceeds(setDoc(ref, { ...base, paused_at: null, paused_ms: 0 }));
  await assertSucceeds(updateDoc(ref, { paused_at: '2026-10-08T10:20:00Z', updated_at: '2026-10-08T10:20:00Z' }));
  await assertSucceeds(updateDoc(ref, { paused_at: null, paused_ms: 300000, updated_at: '2026-10-08T10:25:00Z' }));
  await assertSucceeds(updateDoc(ref, { status: 'done', duration_ms: 3600000, updated_at: '2026-10-08T11:30:00Z' }));
  await assertFails(updateDoc(ref, { paused_ms: -5 }));
  await assertFails(updateDoc(ref, { paused_ms: '300000' }));
  await assertFails(updateDoc(ref, { paused_at: 12345 }));
  await assertFails(updateDoc(ref, { duration_ms: -1 }));
});

// ---------- v0.4.0: Withings (server-written collections) ----------
const serverDoc = (uid, id, extra = {}) => ({ ...rec(uid, id), source: 'withings', ...extra });

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
}

test('body_measures, health_daily, integrations: the owner can read them; others and signed-out visitors cannot', async () => {
  await seed('users/alice/body_measures/w_1', serverDoc('alice', 'w_1', { metrics: { weight_kg: 82.3 } }));
  await seed('users/alice/health_daily/2026-10-08', serverDoc('alice', '2026-10-08', { steps: 9000 }));
  await seed('users/alice/integrations/withings', { connected: true, model: 'Body Comp' });
  const alice = as('alice');
  await assertSucceeds(getDoc(doc(alice, 'users/alice/body_measures/w_1')));
  await assertSucceeds(getDocs(collection(alice, 'users/alice/body_measures')));
  await assertSucceeds(getDoc(doc(alice, 'users/alice/health_daily/2026-10-08')));
  await assertSucceeds(getDoc(doc(alice, 'users/alice/integrations/withings')));
  const bob = as('bob');
  await assertFails(getDoc(doc(bob, 'users/alice/body_measures/w_1')));
  await assertFails(getDocs(collection(bob, 'users/alice/health_daily')));
  await assertFails(getDoc(doc(bob, 'users/alice/integrations/withings')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice/body_measures/w_1')));
});

test('the owner cannot create or freely update server-written records, or hard-delete them', async () => {
  const alice = as('alice');
  await assertFails(setDoc(doc(alice, 'users/alice/body_measures/w_9'), serverDoc('alice', 'w_9', { metrics: { weight_kg: 70 } })));
  await assertFails(setDoc(doc(alice, 'users/alice/health_daily/2026-10-09'), serverDoc('alice', '2026-10-09')));
  await assertFails(setDoc(doc(alice, 'users/alice/integrations/withings'), { connected: true }));
  await seed('users/alice/body_measures/w_1', serverDoc('alice', 'w_1', { metrics: { weight_kg: 82.3 }, needs_review: false }));
  await seed('users/alice/integrations/withings', { connected: true });
  await assertFails(updateDoc(doc(alice, 'users/alice/body_measures/w_1'), { metrics: { weight_kg: 60 }, updated_at: '2026-10-09T00:00:00Z' }));
  await assertFails(updateDoc(doc(alice, 'users/alice/body_measures/w_1'), { deleted: true, source: 'manual', updated_at: '2026-10-09T00:00:00Z' }));
  await assertFails(updateDoc(doc(alice, 'users/alice/integrations/withings'), { connected: false }));
  await assertFails(deleteDoc(doc(alice, 'users/alice/body_measures/w_1')), 'hard delete would let the sync write it back');
  await assertFails(deleteDoc(doc(alice, 'users/alice/integrations/withings')));
});

test('deleting a body measurement is a tombstone the owner can set but never undo', async () => {
  await seed('users/alice/body_measures/w_1', serverDoc('alice', 'w_1', { metrics: { weight_kg: 82.3 } }));
  await seed('users/alice/health_daily/2026-10-08', serverDoc('alice', '2026-10-08', { steps: 1 }));
  const alice = as('alice');
  const ref = doc(alice, 'users/alice/body_measures/w_1');
  await assertSucceeds(updateDoc(ref, { deleted: true, deleted_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z' }));
  await assertFails(updateDoc(ref, { deleted: false, updated_at: '2026-10-09T00:01:00Z' }));
  await assertFails(updateDoc(ref, { deleted: 'yes', updated_at: '2026-10-09T00:01:00Z' }));
  await assertSucceeds(updateDoc(doc(alice, 'users/alice/health_daily/2026-10-08'), { deleted: true, deleted_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z' }));
  await assertFails(updateDoc(doc(as('bob'), 'users/alice/body_measures/w_1'), { deleted: true, updated_at: '2026-10-09T00:00:00Z' }));
});

test('a flagged weigh-in can be confirmed (needs_review/reviewed_at only)', async () => {
  await seed('users/alice/body_measures/w_2', serverDoc('alice', 'w_2', { needs_review: true }));
  const ref = doc(as('alice'), 'users/alice/body_measures/w_2');
  await assertSucceeds(updateDoc(ref, { needs_review: false, reviewed_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z' }));
  await assertFails(updateDoc(ref, { needs_review: 'no', updated_at: '2026-10-09T00:00:00Z' }));
  await assertFails(updateDoc(ref, { reviewed_at: 5, updated_at: '2026-10-09T00:00:00Z' }));
});

test('Withings weights (w_*) stay ordinary weights: the owner can soft-delete and confirm them', async () => {
  await seed('users/alice/weights/w_3', { ...weight('alice', 'w_3'), source: 'withings', grpid: 3, review: true });
  const ref = doc(as('alice'), 'users/alice/weights/w_3');
  await assertSucceeds(updateDoc(ref, { review: false, reviewed_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z' }));
  await assertSucceeds(updateDoc(ref, { deleted: true, deleted_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z' }));
});

test('top-level server collections are closed to everyone; private/shortcut too', async () => {
  for (const ctx of [as('alice'), env.unauthenticatedContext().firestore()]) {
    for (const path of ['oauth_states/abc', 'withings_users/424242', 'shortcut_tokens/deadbeef']) {
      await assertFails(getDoc(doc(ctx, path)));
      await assertFails(setDoc(doc(ctx, path), { uid: 'alice' }));
    }
    await assertFails(getDocs(collection(ctx, 'withings_users')));
  }
  const alice = as('alice');
  await assertFails(getDoc(doc(alice, 'users/alice/private/shortcut')));
  await assertFails(setDoc(doc(alice, 'users/alice/private/shortcut'), { token_hash: 'x' }));
});
