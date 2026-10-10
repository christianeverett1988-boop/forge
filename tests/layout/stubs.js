// Offline stand-ins for the Firebase SDK files the app loads from gstatic.com, so the real app can boot in a
// headless browser with no network and no account. Data comes from window.__SEED (see seed.js).
const app = 'export const initializeApp = () => ({});';

const auth = `
const user = { uid: 'u1', email: 'test@example.com' };
export const indexedDBLocalPersistence = {}, browserLocalPersistence = {};
export const initializeAuth = () => ({ currentUser: user });
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(user), 0); return () => {}; };
export const createUserWithEmailAndPassword = async () => ({}), signInWithEmailAndPassword = async () => ({});
export const sendPasswordResetEmail = async () => {}, signOut = async () => {}, reauthenticateWithCredential = async () => {}, deleteUser = async () => {};
export const EmailAuthProvider = { credential: () => ({}) };
`;

const firestore = `
export const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({}), initializeFirestore = () => ({});
export const collection = (db, ...p) => ({ col: p[p.length - 1] });
export const doc = (db, ...p) => ({ col: p[p.length - 2], id: p[p.length - 1] });
export const setDoc = async () => {}, updateDoc = async () => {}, terminate = async () => {}, clearIndexedDbPersistence = async () => {};
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
const rows = (col) => ((window.__SEED || {})[col] || []);
const snap = (col) => ({ metadata: { hasPendingWrites: false }, docChanges: () => [1], docs: rows(col).map((r) => ({ id: r.id, data: () => r })) });
export const getDocs = async (ref) => snap(ref.col);
export const onSnapshot = (ref, ...rest) => { const next = rest.find((x) => typeof x === 'function'); setTimeout(() => next(snap(ref.col)), 0); return () => {}; };
`;

const functions = `
export const getFunctions = () => ({});
export const httpsCallable = () => async () => ({ data: {} });
`;

export const STUBS = {
  'firebase-app.js': app,
  'firebase-auth.js': auth,
  'firebase-firestore.js': firestore,
  'firebase-functions.js': functions,
};
