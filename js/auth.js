import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth } from './firebase.js';

export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const signUp = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const signOut = () => fbSignOut(auth);

export async function reauth(password) {
  const user = auth.currentUser;
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

export const deleteAccount = () => deleteUser(auth.currentUser);

/** Turns Firebase error codes into plain English. */
export function authErrorMessage(err) {
  const code = err && err.code ? err.code : '';
  const map = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Enter your password.',
    'auth/weak-password': 'Use at least 8 characters for your password.',
    'auth/email-already-in-use': 'There’s already an account with that email. Try signing in.',
    'auth/invalid-credential': 'Email or password is wrong.',
    'auth/wrong-password': 'Email or password is wrong.',
    'auth/user-not-found': 'Email or password is wrong.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No connection. Signing in needs internet the first time.',
    'auth/requires-recent-login': 'For safety, enter your password again.',
    'auth/admin-restricted-operation': 'New accounts are turned off for this app. Sign in with your existing account.',
  };
  return map[code] || (err && err.message) || 'Something went wrong.';
}
