// v0.8.0 progress photos: pure helpers only (synthetic bytes, no real images, no browser).
import { readFileSync } from 'node:fs';
import { test, eq, assert } from './harness.js';
import {
  dbNameFor, fitSize, hasExif, stripJpegMetadata, groupSessions, weekStart, reminderDue, defaultComparePair, orderPair,
  pointOnOrBefore, nearestPoint, timelapseFrames, sampleFrames, gridLayout, pickRecorderType, posesWith, exportName,
} from '../js/photos/core.js';
import { crc32, zipStore } from '../js/photos/zipwriter.js';
import { listEntries } from '../js/health/zip.js';

const bytes = (...a) => Uint8Array.from(a);
// A tiny JPEG skeleton: SOI, optional segments, SOS + a few "image" bytes + EOI. Not a picture, just structure.
const seg = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const exif = seg(0xe1, [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat([1, 2, 3, 4]));
const jfif = seg(0xe0, [...'JFIF\0'].map((c) => c.charCodeAt(0)).concat([1, 1, 0, 0, 1, 0, 1, 0, 0]));
const dqt = seg(0xdb, [0, 8, 8, 8, 8]);
const jpeg = (...segs) => bytes(0xff, 0xd8, ...segs.flat(), 0xff, 0xda, 0, 3, 1, 0x11, 0x22, 0xff, 0xd9);

test('per-account database name: one database per uid, never shared, and signed-out is refused', () => {
  eq(dbNameFor('abc123'), 'forge-photos-abc123');
  assert(dbNameFor('a') !== dbNameFor('b'));
  let threw = false;
  try { dbNameFor(''); } catch { threw = true; }
  assert(threw, 'empty uid must throw');
  threw = false;
  try { dbNameFor(null); } catch { threw = true; }
  assert(threw, 'null uid must throw');
});

test('picture size: longest side capped at 1600, never scaled up, ratio kept', () => {
  eq(JSON.stringify(fitSize(3024, 4032)), JSON.stringify({ w: 1200, h: 1600 }));
  eq(JSON.stringify(fitSize(4032, 3024)), JSON.stringify({ w: 1600, h: 1200 }));
  eq(JSON.stringify(fitSize(800, 600)), JSON.stringify({ w: 800, h: 600 }));
});

test('EXIF check: an APP1 segment is found; a clean JPEG passes; stripping removes APP1 but keeps the picture', () => {
  const dirty = jpeg(jfif, exif, dqt);
  const clean = jpeg(jfif, dqt);
  assert(hasExif(dirty), 'APP1 should be detected');
  assert(!hasExif(clean), 'clean file has no APP1');
  const stripped = stripJpegMetadata(dirty);
  assert(!hasExif(stripped), 'APP1 still present after stripping');
  eq(stripped.length, clean.length);
  eq(Array.from(stripped).join(','), Array.from(clean).join(','), 'everything else is untouched');
  assert(stripJpegMetadata(clean) === clean, 'nothing to strip returns the same bytes');
});

test('EXIF check ignores bytes that merely look like a marker inside the picture data', () => {
  const tricky = bytes(0xff, 0xd8, ...jfif, 0xff, 0xda, 0, 3, 1, 0xff, 0xe1, 0, 4, 9, 9, 0xff, 0xd9);
  assert(!hasExif(tricky));
});

test('sessions: one per day, newest first, a retake the same day keeps the later photo, notes carried', () => {
  const s = groupSessions([
    { id: 'a', day: '2026-09-27', pose: 'front', created_at: '2026-09-27T08:00:00Z', note: '' },
    { id: 'b', day: '2026-10-04', pose: 'front', created_at: '2026-10-04T08:00:00Z', note: 'morning' },
    { id: 'c', day: '2026-10-04', pose: 'front', created_at: '2026-10-04T08:05:00Z', note: '' },
    { id: 'd', day: '2026-10-04', pose: 'side', created_at: '2026-10-04T08:06:00Z', note: '' },
  ]);
  eq(s.length, 2);
  eq(s[0].day, '2026-10-04');
  eq(s[0].poses.front.id, 'c');
  eq(s[0].note, 'morning');
  eq(Object.keys(s[0].poses).join(','), 'front,side');
  eq(posesWith(s, 2).join(','), 'front');
});

test('reminder week starts on the chosen weekday', () => {
  // 2026-10-04 is a Sunday
  eq(weekStart('2026-10-04', 0), '2026-10-04');
  eq(weekStart('2026-10-09', 0), '2026-10-04');
  eq(weekStart('2026-10-03', 0), '2026-09-27');
  eq(weekStart('2026-10-09', 1), '2026-10-05'); // Monday start
  eq(weekStart('2026-10-05', 1), '2026-10-05');
});

test('reminder: due from the chosen day until a photo is taken this week or it is dismissed; off or no photos yet = never', () => {
  const sessions = [{ day: '2026-09-27', poses: {} }];
  const base = { remindDow: 0, sessions };
  eq(reminderDue({ ...base, today: '2026-10-04' }), true, 'Sunday, nothing this week');
  eq(reminderDue({ ...base, today: '2026-10-07' }), true, 'still due midweek');
  eq(reminderDue({ ...base, today: '2026-10-04', sessions: [...sessions, { day: '2026-10-04', poses: {} }] }), false, 'taken today');
  eq(reminderDue({ ...base, today: '2026-10-08', sessions: [...sessions, { day: '2026-10-05', poses: {} }] }), false, 'taken Monday');
  eq(reminderDue({ ...base, today: '2026-10-04', dismissedWeek: '2026-10-04' }), false, 'dismissed this week');
  eq(reminderDue({ ...base, today: '2026-10-11', dismissedWeek: '2026-10-04' }), true, 'a new week asks again');
  eq(reminderDue({ ...base, today: '2026-10-04', remindDow: null }), false, 'off');
  eq(reminderDue({ today: '2026-10-04', remindDow: 0, sessions: [] }), false, 'no first set yet');
});

test('compare: default is first vs latest for the pose; fewer than two = none; picks are put in date order', () => {
  const mk = (day, ...poses) => ({ day, poses: Object.fromEntries(poses.map((p) => [p, { id: day + p }])) });
  const sessions = [mk('2026-10-04', 'front', 'side'), mk('2026-09-20', 'front'), mk('2026-08-30', 'front', 'side')];
  eq(JSON.stringify(defaultComparePair(sessions, 'front')), JSON.stringify({ before: '2026-08-30', after: '2026-10-04' }));
  eq(JSON.stringify(defaultComparePair(sessions, 'side')), JSON.stringify({ before: '2026-08-30', after: '2026-10-04' }));
  eq(defaultComparePair(sessions, 'back'), null);
  eq(defaultComparePair([mk('2026-10-04', 'front')], 'front'), null);
  eq(JSON.stringify(orderPair('2026-10-04', '2026-08-30')), JSON.stringify({ before: '2026-08-30', after: '2026-10-04' }));
});

test('beside each photo: trend on or before the day; fat mass only if a reading is within a week', () => {
  const series = [{ day: '2026-09-01', v: 1 }, { day: '2026-09-10', v: 2 }, { day: '2026-09-20', v: 3 }];
  eq(pointOnOrBefore(series, '2026-09-15').v, 2);
  eq(pointOnOrBefore(series, '2026-08-01'), null);
  eq(nearestPoint(series, '2026-09-12').v, 2);
  eq(nearestPoint(series, '2026-09-30'), null);
});

test('time-lapse frames: one pose, within the range, oldest first, photo attached', () => {
  const mk = (day, pose) => ({ day, poses: { [pose]: { id: `${day}-${pose}` } } });
  const sessions = [mk('2026-10-04', 'front'), mk('2026-09-27', 'side'), mk('2026-09-20', 'front'), mk('2026-09-13', 'front')];
  const all = timelapseFrames(sessions, 'front');
  eq(all.map((f) => f.day).join(','), '2026-09-13,2026-09-20,2026-10-04');
  eq(all[0].photo.id, '2026-09-13-front');
  eq(timelapseFrames(sessions, 'front', { from: '2026-09-20', to: '2026-09-30' }).map((f) => f.day).join(','), '2026-09-20');
  eq(timelapseFrames(sessions, 'back').length, 0);
});

test('photo strip: samples evenly keeping first and last; grid is up to 3 across', () => {
  const frames = Array.from({ length: 100 }, (_, i) => ({ day: `d${i}` }));
  const s = sampleFrames(frames, 30);
  eq(s.length, 30);
  eq(s[0].day, 'd0');
  eq(s[29].day, 'd99');
  eq(sampleFrames(frames.slice(0, 5), 30).length, 5);
  eq(JSON.stringify(gridLayout(7)), JSON.stringify({ cols: 3, rows: 3 }));
  eq(JSON.stringify(gridLayout(2)), JSON.stringify({ cols: 2, rows: 1 }));
});

test('video type: MP4 first (Safari 18+), then WebM, then none (use the photo strip)', () => {
  eq(pickRecorderType((t) => t === 'video/mp4').ext, 'mp4');
  eq(pickRecorderType((t) => t.startsWith('video/webm')).ext, 'webm');
  eq(pickRecorderType((t) => t === 'video/webm;codecs=vp9' || t === 'video/mp4').mime, 'video/mp4', 'mp4 wins when both work');
  eq(pickRecorderType(() => false), null);
  eq(pickRecorderType(undefined), null);
  eq(pickRecorderType(() => { throw new Error('nope'); }), null);
});

test('zip writer: CRC32 matches the standard check value and a known empty value', () => {
  eq(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  eq(crc32(new Uint8Array(0)), 0);
  eq(crc32(new TextEncoder().encode('hello')), 0x3610a686);
});

test('zip writer: headers and sizes are right, and a zip reader lists and finds the same files', async () => {
  const hello = new TextEncoder().encode('hello');
  const blob = zipStore([{ name: 'a.txt', data: hello, date: new Date(2026, 9, 4, 8, 30, 0) }, { name: 'photos/2026-10-04_front.jpg', data: jpeg(jfif, dqt) }]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const v = new DataView(buf.buffer);
  eq(v.getUint32(0, true), 0x04034b50, 'local header signature');
  eq(v.getUint16(8, true), 0, 'stored, not compressed');
  eq(v.getUint32(14, true), 0x3610a686, 'crc in the header');
  eq(v.getUint32(18, true), 5);
  eq(v.getUint32(22, true), 5);
  eq(v.getUint16(26, true), 5, 'name length');
  eq(new TextDecoder().decode(buf.subarray(30, 35)), 'a.txt');
  eq(new TextDecoder().decode(buf.subarray(35, 40)), 'hello');
  eq(v.getUint32(buf.length - 22, true), 0x06054b50, 'end of central directory');
  eq(v.getUint16(buf.length - 22 + 10, true), 2, 'two entries');
  const entries = await listEntries(blob);
  eq(entries.map((e) => e.name).join(','), 'a.txt,photos/2026-10-04_front.jpg');
  eq(entries[0].usize, 5);
  eq(entries[0].offset, 0);
});

test('export file names are date_pose inside photos/', () => {
  eq(exportName({ day: '2026-10-04', pose: 'side' }), 'photos/2026-10-04_side.jpg');
});

test('privacy: the photo modules make no network calls and never import Firebase', () => {
  for (const f of ['core', 'store', 'image', 'capture', 'compare', 'timelapse', 'deliver', 'settings', 'cards', 'access', 'metrics', 'zipwriter']) {
    const src = readFileSync(new URL(`../js/photos/${f}.js`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|firebase|firestore|functions\.js|ui\/analytics/i.test(src), `js/photos/${f}.js must not talk to the network`);
  }
  const screen = readFileSync(new URL('../js/screens/photos.js', import.meta.url), 'utf8');
  assert(!/fetch\(|firebase|\bdb\.js/.test(screen));
});
