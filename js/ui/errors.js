// Plain-words text for a failed read of server-written data (Withings, Apple Health). Pure.
// state.serverError holds the Firestore error code, e.g. "permission-denied" or "firestore/unavailable".

/** What to tell you when Forge can't read `what` ("Withings", "Apple Health"). */
export function serverErrorText(code, what) {
  const c = String(code || '');
  if (c.includes('permission-denied')) {
    return `Forge can’t read your ${what} data yet. The database’s security rules are older than this version of the app. Publish the new firestore.rules from your Mac (DEPLOY.md → “If an update changes firestore.rules”), then reopen Forge.`;
  }
  if (c.includes('unavailable') || c.includes('network')) return `Forge can’t reach the database right now, so ${what} data may be out of date. It catches up when you’re back online.`;
  if (c.includes('unauthenticated')) return 'You’ve been signed out. Sign in again to see this.';
  return `Forge can’t read your ${what} data right now. Try again in a minute.${c ? ` (Error code: ${c})` : ''}`;
}
