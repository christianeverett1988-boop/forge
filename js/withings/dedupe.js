// Keeps weight.csv imports and the Withings API from double-counting. Import weight.csv first and a later
// Re-import (or reconnect) brings the same readings in as w_<grpid>: the c_ copies are then tombstoned, so
// weight history, the bulk counts and the data check each see a reading once.
import { state } from '../state.js';
import { planCsvDedupe } from './review.js';

const sent = new Set(); // ids already tombstoned this session (the listener may lag a moment behind)
let running = false;

let lastSig = '';
let forUid = null;

/**
 * True when there's something new to check: live csv imports, live API weigh-ins and a finished backfill,
 * and the counts or the backfill have changed since the last check (so a plain weights listener tick
 * doesn't re-read the collection).
 */
export function dedupeDue(st = state) {
  const uid = st.user ? st.user.uid : null;
  if (uid !== forUid) { forUid = uid; lastSig = ''; sent.clear(); } // a different account signed in
  const w = st.integrations && st.integrations.withings;
  if (!w || !w.connected || !w.backfill || !w.backfill.done) return false;
  const csv = st.weights.filter((x) => x.source === 'withings_csv' && !sent.has(x.id)).length;
  const api = st.weights.filter((x) => x.source === 'withings').length;
  if (!csv || !api) return false;
  const sig = `${csv}:${api}:${w.backfill.updated_at || ''}`;
  if (sig === lastSig) return false;
  lastSig = sig;
  return true;
}

/**
 * Tombstone csv imports that a Withings reading now covers. Reads every weights doc (deleted ones too, so a
 * Withings reading you marked "Not me" still covers its csv twin). Returns how many were removed.
 */
export async function dedupeCsv() {
  if (running || !dedupeDue()) return 0;
  running = true;
  let dup = [];
  try {
    const db = await import('../db.js');
    dup = planCsvDedupe(await db.readAll('weights')).filter((w) => !sent.has(w.id));
    if (!dup.length) return 0;
    dup.forEach((w) => sent.add(w.id));
    await db.supersedeWeights(dup.map((w) => w.id));
    const { toast } = await import('../ui.js');
    toast(`Removed ${dup.length} duplicate weigh-in${dup.length === 1 ? '' : 's'} (Withings now has them)`);
    return dup.length;
  } catch (e) {
    console.error(e);
    dup.forEach((w) => sent.delete(w.id)); // the write failed: let the next pass try again
    lastSig = '';
    return 0;
  } finally {
    running = false;
  }
}
