// Where progress photos live: IndexedDB on this phone, one database per signed-in account. Nothing here
// touches the network, Firestore or Storage, and no photo information is synced anywhere.
import { dbNameFor } from './core.js';

const STORE = 'photos';

function open(uid, idb = indexedDB) {
  return new Promise((resolve, reject) => {
    const req = idb.open(dbNameFor(uid), 1);
    req.onupgradeneeded = () => {
      const os = req.result.createObjectStore(STORE, { keyPath: 'id' });
      os.createIndex('day', 'day');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Couldn’t open the photo storage on this phone.'));
  });
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('Couldn’t save to this phone (is the storage full?).'));
});
const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Photo store for one account. Records: { id, day, pose, blob, note, w, h, created_at }. */
export function photoStore(uid, idb) {
  let dbp = null;
  const db = () => (dbp ||= open(uid, idb));
  return {
    async list() {
      const d = await db();
      return result(d.transaction(STORE).objectStore(STORE).getAll());
    },
    /** Saves a photo; taking the same pose again on the same day replaces the earlier one. */
    async save({ day, pose, blob, note = '', w = 0, h = 0 }) {
      const d = await db();
      const tx = d.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      const same = await result(os.index('day').getAll(day));
      for (const r of same) if (r.pose === pose) os.delete(r.id);
      const rec = { id: newId(), day, pose, blob, note, w, h, created_at: new Date().toISOString() };
      os.put(rec);
      await done(tx);
      return rec;
    },
    async setNote(day, note) {
      const d = await db();
      const tx = d.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      for (const r of await result(os.index('day').getAll(day))) os.put({ ...r, note });
      await done(tx);
    },
    async remove(id) {
      const d = await db();
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      await done(tx);
    },
    async removeDay(day) {
      const d = await db();
      const tx = d.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      for (const r of await result(os.index('day').getAll(day))) os.delete(r.id);
      await done(tx);
    },
    async clearAll() {
      const d = await db();
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await done(tx);
    },
  };
}

/** Deletes an account's whole photo database from this phone (used when the account is deleted). */
export function dropPhotoDb(uid, idb = indexedDB) {
  return new Promise((resolve) => {
    const req = idb.deleteDatabase(dbNameFor(uid));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/** Asks the browser not to evict photos when space runs low. Safe to call any time. */
export function keepStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(() => false);
  } catch { /* old browser */ }
  return Promise.resolve(false);
}
