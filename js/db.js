// Data layer. All user data lives under users/{uid}/{collection}/{id} (one level deep; workout sets are
// stored inside their workout document, so a whole session is one record).
// Writes are "fire and forget": they land in the on-device cache instantly and sync when online.
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  getDocs,
  writeBatch,
  terminate,
  clearIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, auth } from './firebase.js';
import { state } from './state.js';

// Every collection the app writes. Export, delete-everything and firestore.rules use this list.
export const COLLECTIONS = ['profile', 'settings', 'locations', 'weights', 'workouts', 'cardio_sessions', 'programs', 'exercises'];

const uid = () => auth.currentUser && auth.currentUser.uid;
const now = () => new Date().toISOString();

export function newId() {
  return crypto.randomUUID();
}

/** Builds a record with the standard fields every document carries. */
export function newRecord(data, { id = newId(), source = 'manual' } = {}) {
  const t = now();
  return { id, user_id: uid(), created_at: t, updated_at: t, source, deleted: false, ...data };
}

// ---- sync status ----
// Driven by Firestore's own hasPendingWrites flag on every watched collection, so writes made offline in an
// earlier session (still queued in the on-device cache) show as "Saving…" until the server confirms them.
const pendingByCol = new Map();

export function updateSync() {
  const pending = [...pendingByCol.values()].some(Boolean);
  const status = !navigator.onLine ? 'offline' : pending ? 'saving' : 'synced';
  if (state.sync !== status) state.set({ sync: status });
}
window.addEventListener('online', updateSync);
window.addEventListener('offline', updateSync);

function reportWriteError(err) {
  console.error(err);
  window.dispatchEvent(new CustomEvent('forge:error', { detail: 'Couldn’t save to the cloud: ' + (err.code || err.message) }));
}

// ---- writes ----
export function put(col, record) {
  setDoc(doc(db, 'users', uid(), col, record.id), record).catch(reportWriteError);
  return record;
}

export function patch(col, id, changes) {
  updateDoc(doc(db, 'users', uid(), col, id), { ...changes, updated_at: now() }).catch(reportWriteError);
}

export function softDelete(col, id) {
  patch(col, id, { deleted: true, deleted_at: now() });
}

// ---- reads ----
/**
 * Live list of a collection (deleted records filtered out). Returns an unsubscribe function.
 * onError(err) is called if the listener fails (e.g. permission-denied when the rules aren't published).
 */
export function watch(col, cb, onError) {
  let first = true;
  return onSnapshot(
    collection(db, 'users', uid(), col),
    { includeMetadataChanges: true },
    (snap) => {
      pendingByCol.set(col, snap.metadata.hasPendingWrites);
      updateSync();
      // Skip metadata-only updates (e.g. "write confirmed") so screens don't redraw for nothing.
      if (!first && snap.docChanges().length === 0) return;
      first = false;
      cb(snap.docs.map((d) => d.data()).filter((r) => !r.deleted));
    },
    (err) => {
      console.error(col, err);
      pendingByCol.delete(col);
      if (onError) onError(err);
    }
  );
}

export async function readAll(col) {
  const snap = await getDocs(collection(db, 'users', uid(), col));
  return snap.docs.map((d) => d.data());
}

// ---- delete everything ----
export async function deleteAllUserData() {
  if (!navigator.onLine) throw new Error('You need a connection to delete your cloud data.');
  for (const col of COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid(), col));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

/** Wipes the on-device copy. Call after the account is deleted. */
export async function clearLocalCache() {
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
