// The signed-in account's photo store and sessions, for every screen that needs them.
import { state } from '../state.js';
import { photoStore } from './store.js';
import { groupSessions } from './core.js';

let cur = null;
export function myStore() {
  const uid = state.user && state.user.uid;
  if (!uid || typeof indexedDB === 'undefined') return null;
  if (!cur || cur.uid !== uid) cur = { uid, store: photoStore(uid) };
  return cur.store;
}

/** { photos, sessions, ok } – never throws (private browsing or blocked storage just reads as "no photos"). */
export async function mySessions() {
  const store = myStore();
  if (!store) return { photos: [], sessions: [], ok: false };
  try {
    const photos = await store.list();
    return { photos, sessions: groupSessions(photos), ok: true };
  } catch {
    return { photos: [], sessions: [], ok: false };
  }
}
