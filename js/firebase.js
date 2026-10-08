// Firebase setup. Firestore uses a persistent on-device cache (IndexedDB), so reads work offline
// and writes made offline are kept — even if the app is closed — and sent when the signal returns.
//
// Auth uses initializeAuth (not getAuth) with only local persistence and no popup/redirect resolver:
// we only use email/password, and getAuth on iOS loads a hidden apis.google.com iframe before it
// reports who is signed in, which slows startup on a weak signal.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { FIREBASE_CONFIG } from '../config.js';

export const configured = !String(FIREBASE_CONFIG.apiKey).startsWith('PASTE');

export const app = configured ? initializeApp(FIREBASE_CONFIG) : null;
export const auth = app
  ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  : null;
export const db = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;
