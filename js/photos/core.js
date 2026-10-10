// Progress photos, the parts with no browser APIs so they can be unit-tested: poses, per-account database
// names, picture sizing, EXIF checking, grouping photos into sessions, the weekly reminder, compare pairs and
// the time-lapse frame list. Photos themselves never leave the phone (see store.js).
import { addDays, daysBetween } from '../weight/smoothing.js';

export const POSES = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];
export const poseLabel = (key) => (POSES.find((p) => p.key === key) || { label: key }).label;

export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.85;

/** One database per signed-in account, so two people on one phone never see each other's photos. */
export function dbNameFor(uid) {
  if (!uid || typeof uid !== 'string') throw new Error('Sign in to use progress photos.');
  return `forge-photos-${uid}`;
}

/** Size after scaling so the longest side is at most `max` (never scales up). */
export function fitSize(w, h, max = MAX_SIDE) {
  const longest = Math.max(w, h);
  if (!longest || longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// ---------- JPEG metadata ----------

/** Walks the JPEG segments before the picture data: calls fn(marker, start, end) for each. */
function eachSegment(bytes, fn) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG.');
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xda) break; // start of picture data: no more metadata after this
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; } // no length
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) break;
    fn(marker, i, i + 2 + len);
    i += 2 + len;
  }
}

/** True if the JPEG carries an APP1 segment (EXIF, GPS or XMP live there). */
export function hasExif(bytes) {
  let found = false;
  eachSegment(bytes, (marker) => { if (marker === 0xe1) found = true; });
  return found;
}

/** Copy of the JPEG without APP1–APP15 and comment segments (all the places location and camera info hide). */
export function stripJpegMetadata(bytes) {
  const drop = [];
  eachSegment(bytes, (marker, start, end) => {
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) drop.push([start, end]);
  });
  if (!drop.length) return bytes;
  const out = new Uint8Array(bytes.length - drop.reduce((n, [s, e]) => n + (e - s), 0));
  let from = 0;
  let to = 0;
  for (const [s, e] of drop) {
    out.set(bytes.subarray(from, s), to);
    to += s - from;
    from = e;
  }
  out.set(bytes.subarray(from), to);
  return out;
}

// ---------- sessions ----------

/**
 * Photo records ({ id, day, pose, note, created_at, ... }) → one session per day, newest first:
 * { day, note, poses: { front: record, … }, ids: [...] }. Taking a pose twice on one day keeps the later one.
 */
export function groupSessions(photos) {
  const byDay = new Map();
  for (const p of photos) {
    if (!byDay.has(p.day)) byDay.set(p.day, { day: p.day, note: '', poses: {}, ids: [] });
    const s = byDay.get(p.day);
    s.ids.push(p.id);
    const cur = s.poses[p.pose];
    if (!cur || (p.created_at || '') >= (cur.created_at || '')) s.poses[p.pose] = p;
    if (p.note && !s.note) s.note = p.note;
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/** Sessions that have this pose, oldest first. */
export function sessionsWithPose(sessions, pose) {
  return sessions.filter((s) => s.poses[pose]).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Poses that have at least `min` sessions, in Front, Side, Back order. */
export function posesWith(sessions, min = 1) {
  return POSES.map((p) => p.key).filter((k) => sessionsWithPose(sessions, k).length >= min);
}

// ---------- weekly reminder ----------

export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayOfWeek = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The reminder week starts on the chosen weekday: the most recent such day on or before `day`. */
export function weekStart(day, startDow = 0) {
  return addDays(day, -((dayOfWeek(day) - startDow + 7) % 7));
}

/**
 * Show the Today reminder from the chosen weekday until a photo set is taken or it is dismissed for the week.
 * Never for someone who hasn't taken a first set yet (the Body card invites them instead).
 * remindDow: 0 (Sunday) – 6, or null for Off.
 */
export function reminderDue({ today, remindDow, sessions, dismissedWeek = null }) {
  if (remindDow == null || !sessions.length) return false;
  const ws = weekStart(today, remindDow);
  if (dismissedWeek === ws) return false;
  return !sessions.some((s) => s.day >= ws && s.day <= today);
}

// ---------- compare ----------

/** Earliest and latest session with this pose, or null with fewer than two. */
export function defaultComparePair(sessions, pose) {
  const list = sessionsWithPose(sessions, pose);
  return list.length < 2 ? null : { before: list[0].day, after: list[list.length - 1].day };
}

/** Keeps "before" the earlier date whichever order two were picked in. */
export function orderPair(a, b) {
  return a <= b ? { before: a, after: b } : { before: b, after: a };
}

/** Last point on or before `day` of a [{ day, ... }] series (sorted), or null. */
export function pointOnOrBefore(series, day) {
  let hit = null;
  for (const p of series) {
    if (p.day <= day) hit = p;
    else break;
  }
  return hit;
}

/** Closest point within `maxDays` of `day` (for readings that aren't taken every day, like fat mass). */
export function nearestPoint(series, day, maxDays = 7) {
  let best = null;
  let bestGap = Infinity;
  for (const p of series) {
    const gap = Math.abs(daysBetween(day, p.day));
    if (gap < bestGap) { best = p; bestGap = gap; }
  }
  return best && bestGap <= maxDays ? best : null;
}

// ---------- time-lapse ----------

/** Frames for a pose between two dates (inclusive), oldest first: [{ day, photo }]. */
export function timelapseFrames(sessions, pose, { from = '0000-01-01', to = '9999-12-31' } = {}) {
  return sessionsWithPose(sessions, pose)
    .filter((s) => s.day >= from && s.day <= to)
    .map((s) => ({ day: s.day, photo: s.poses[pose] }));
}

/** At most `max` frames, spread evenly, always keeping the first and the last. */
export function sampleFrames(frames, max) {
  if (max < 2) return frames.slice(-1);
  if (frames.length <= max) return frames;
  return Array.from({ length: max }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (max - 1))]);
}

/** Columns and rows for the image-strip fallback. */
export function gridLayout(n, maxCols = 3) {
  const cols = Math.max(1, Math.min(maxCols, n));
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

/** First video type this browser can record, preferring MP4 (Safari 18+), then WebM; null means use the strip. */
export function pickRecorderType(isTypeSupported) {
  const options = [
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  if (typeof isTypeSupported !== 'function') return null;
  for (const o of options) {
    try { if (isTypeSupported(o.mime)) return o; } catch { /* keep trying */ }
  }
  return null;
}

/** File name inside the export zip. */
export const exportName = (p) => `photos/${p.day}_${p.pose}.jpg`;

export function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** The "where do my photos live" sentence. In the iPhone app there is no Safari data to clear: say what really deletes them. */
export const photoLossLine = (native) => (native
  ? 'If you delete the Forge app, they’re gone. Export a zip to keep them.'
  : 'If you delete the app or clear Safari data, they’re gone.');
