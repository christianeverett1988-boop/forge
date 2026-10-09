// "Is this you?": weigh-ins from a shared scale that are probably a family member's, and the weight.csv
// import from a Withings export. Pure; no browser APIs.
//
// Why not "15% off the median of the nearest 10 weigh-ins": when a child weighs in often (most of a year),
// their readings ARE the nearest 10, and the rule flags yours instead. So this follows YOUR weight: it
// walks from the newest weigh-in back in time, keeping a reference (the median of the last 10 readings it
// accepted as you). A scale reading more than 15% away from that reference is a suspect and doesn't move the
// reference. Typed-in weights and ones you confirmed ("That's me") are always you.

export const SUSPECT_TOL = 0.15;
export const SCALE_SOURCES = new Set(['withings', 'withings_csv']);

const isScale = (w) => SCALE_SOURCES.has(w.source);
const confirmed = (w) => !!w.reviewed_at && w.review !== true;

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const usable = (weights) => weights
  .filter((w) => w && !w.deleted && Number.isFinite(w.kg) && w.kg > 0 && (w.measured_at || w.day))
  .map((w) => ({ ...w, at: w.measured_at || `${w.day}T12:00:00` }))
  .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // newest first

const ANCHOR_DAYS = 14; // a typed-in or confirmed weight only anchors the walk if it's this close to the newest reading

/**
 * Where "your weight" starts, newest end of the walk. In order of trust:
 *   1. weights you typed in or confirmed ("That's me") within 14 days of the newest reading (older ones may be
 *      far from today's weight: someone who lost 20 kg since onboarding must not be flagged);
 *   2. your profile weight (from onboarding or Edit profile): the newest 10 readings within 15% of it, or the
 *      profile weight itself if none are;
 *   3. the median of the newest 10 readings (fine unless someone else used the scale most recently).
 * Returns a kg value or null. Pure.
 */
export function seedWeight(list, profileKg = null, tol = SUSPECT_TOL) {
  if (!list.length) return null;
  const newest = Date.parse(list[0].at);
  const recent = (w) => !Number.isFinite(newest) || newest - Date.parse(w.at) <= ANCHOR_DAYS * 864e5;
  const anchors = list.filter((w) => (!isScale(w) || confirmed(w)) && recent(w)).slice(0, 10).map((w) => w.kg);
  if (anchors.length) return median(anchors);
  if (Number.isFinite(profileKg) && profileKg > 0) {
    const near = list.filter((w) => w.review !== true && Math.abs(w.kg - profileKg) / profileKg <= tol).slice(0, 10).map((w) => w.kg);
    return near.length ? median(near) : profileKg;
  }
  const seed = list.filter((w) => w.review !== true).slice(0, 10).map((w) => w.kg);
  return seed.length ? median(seed) : null;
}

/**
 * Ids of scale weigh-ins that probably aren't you. weights: the weights collection (deleted ones ignored);
 * profileKg: your profile weight, used to start the walk when nothing recent is typed in or confirmed.
 */
export function suspects(weights, tol = SUSPECT_TOL, profileKg = null) {
  const list = usable(weights);
  const seed = seedWeight(list, profileKg, tol);
  const acc = seed != null ? [seed] : [];
  const out = new Set();
  for (const w of list) {
    if (!isScale(w) || confirmed(w) || !acc.length) { acc.push(w.kg); continue; }
    const ref = median(acc.slice(-10));
    if (Math.abs(w.kg - ref) / ref > tol) out.add(w.id);
    else acc.push(w.kg);
  }
  return out;
}

let memo = { weights: null, profileKg: null, ids: new Set() };
/** suspects(), cached for the same weights array and profile weight (state.weights is replaced on every change). */
export function suspectIds(weights, profileKg = null) {
  if (memo.weights !== weights || memo.profileKg !== profileKg) memo = { weights, profileKg, ids: suspects(weights, SUSPECT_TOL, profileKg) };
  return memo.ids;
}

/**
 * The review queue, newest first: weigh-ins Withings couldn't match to you (needs_review) plus suspects.
 * Each item: { id, kg (null if the reading has no weight), measured_at, day, hasBody, hasWeight, reason }.
 */
export function reviewQueue(weights, bodyDocs = [], profileKg = null) {
  const ids = suspectIds(weights, profileKg);
  const byId = new Map();
  for (const d of bodyDocs) {
    if (d.deleted || !d.needs_review) continue;
    byId.set(d.id, { id: d.id, kg: d.metrics && Number.isFinite(d.metrics.weight_kg) ? d.metrics.weight_kg : null, measured_at: d.measured_at, day: d.day, hasBody: true, hasWeight: false, reason: 'withings' });
  }
  const bodyIds = new Set(bodyDocs.filter((d) => !d.deleted).map((d) => d.id));
  for (const w of weights) {
    if (w.deleted) continue;
    const queued = byId.get(w.id);
    if (queued) { queued.hasWeight = true; if (queued.kg == null) queued.kg = w.kg; continue; }
    if (!ids.has(w.id)) continue;
    byId.set(w.id, { id: w.id, kg: w.kg, measured_at: w.measured_at, day: w.day, hasBody: bodyIds.has(w.id), hasWeight: true, reason: 'outlier' });
  }
  return [...byId.values()].sort((a, b) => ((a.measured_at || '') < (b.measured_at || '') ? 1 : -1));
}

/** Queue items grouped by day, newest day first: [{ day, items }]. */
export function byDay(queue) {
  const m = new Map();
  for (const q of queue) {
    const k = q.day || (q.measured_at || '').slice(0, 10);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(q);
  }
  return [...m].map(([day, items]) => ({ day, items }));
}

/**
 * A cutoff (kg) between the suspects lighter than you and your lightest accepted weigh-in, or null when
 * there's no clean gap. Readings under it are offered as one "Not me" action.
 */
export function suggestCutoff(weights, profileKg = null) {
  const ids = suspectIds(weights, profileKg);
  const live = weights.filter((w) => !w.deleted && Number.isFinite(w.kg));
  const mine = live.filter((w) => !ids.has(w.id) && w.review !== true).map((w) => w.kg);
  const light = live.filter((w) => ids.has(w.id)).map((w) => w.kg);
  if (!mine.length || !light.length) return null;
  const lo = Math.min(...mine);
  const below = light.filter((kg) => kg < lo);
  if (!below.length) return null;
  return (Math.max(...below) + lo) / 2;
}

/**
 * Queue items under `cutoffKg` (the "Not me: all under X" preview). Readings you confirmed are never in the
 * queue, so they're never included. Returns { items, count, from, to } (from/to = oldest/newest day).
 */
export function underCutoff(queue, cutoffKg) {
  const items = Number.isFinite(cutoffKg) ? queue.filter((q) => q.kg != null && q.kg < cutoffKg) : [];
  const days = items.map((q) => q.day || (q.measured_at || '').slice(0, 10)).sort();
  return { items, count: items.length, from: days[0] || null, to: days[days.length - 1] || null };
}

// ---------- weight.csv (Withings export) ----------
const LB = 0.45359237;

/** Split one CSV line (quotes, doubled quotes). */
function cells(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

/** 'YYYY-MM-DD HH:MM:SS' (local time on the scale's account) → Date, read in this device's time zone. */
function localDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Parse Withings' weight.csv (Health Mate export). Returns { rows: [{ at: Date, kg }], skipped, unit }
 * or throws when the file isn't a weight.csv.
 */
export function parseWeightCSV(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('The file is empty.');
  const head = cells(lines[0]).map((h) => h.trim().toLowerCase());
  const di = head.indexOf('date');
  const wi = head.findIndex((h) => /^weight \((lb|kg)\)$/.test(h));
  if (di < 0 || wi < 0) throw new Error('This doesn’t look like weight.csv from a Withings export (no Date and Weight columns).');
  const unit = /lb/.test(head[wi]) ? 'lb' : 'kg';
  const rows = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const at = localDate(c[di]);
    const v = Number(c[wi]);
    if (!at || !Number.isFinite(v) || v <= 0) { skipped++; continue; }
    const kg = Number((unit === 'lb' ? v * LB : v).toFixed(3));
    if (kg <= 0 || kg >= 500) { skipped++; continue; }
    rows.push({ at, kg });
  }
  return { rows, skipped, unit };
}

/** Deterministic id for an imported reading, so importing the same file twice changes nothing. */
export const csvId = (at) => `c_${Math.round(at.getTime() / 1000)}`;

/**
 * A matcher for "Forge already has this reading from Withings": same weight (±0.1 kg) at the same minute,
 * also allowing whole-hour offsets up to 14 h, in case the export's clock and the API's disagree on the
 * time zone. existing: weights docs, deleted ones included. Only API weigh-ins (source withings) count.
 */
export function nearWithings(existing) {
  const scale = existing.filter((w) => w.source === 'withings' && w.measured_at && Number.isFinite(w.kg))
    .map((w) => ({ t: Date.parse(w.measured_at) / 1000, kg: w.kg }));
  return (t, kg) => scale.some((s) => {
    if (Math.abs(s.kg - kg) > 0.1) return false;
    const d = Math.abs(s.t - t);
    if (d > 14 * 3600 + 120) return false;
    const r = d % 3600;
    return r <= 120 || r >= 3600 - 120;
  });
}

/**
 * Imported (withings_csv) weigh-ins that a Withings reading now covers, e.g. after Re-import or a reconnect
 * brought the same history in as w_<grpid>. These are the duplicates to tombstone. existing: every weights
 * doc, deleted ones included (a Withings reading you marked "Not me" still covers its CSV twin).
 */
export function planCsvDedupe(existing) {
  const near = nearWithings(existing);
  return existing.filter((w) => w.source === 'withings_csv' && !w.deleted && w.measured_at && Number.isFinite(w.kg)
    && near(Date.parse(w.measured_at) / 1000, w.kg));
}

/**
 * How many weigh-ins the weight.csv import accounts for in the data check: every withings_csv doc INCLUDING
 * ones you deleted or marked "Not me" (accounted for, like API weigh-ins), but not the duplicates removed
 * because Withings has the same reading (those are counted as Withings weigh-ins).
 */
export const csvAccounted = (existing) => existing.filter((w) => w.source === 'withings_csv' && !w.superseded).length;

/** The toast after Import weight.csv: what was added, what was already here, and rows that couldn't be read. */
export function importMessage({ added, skipped, unreadable = 0 }) {
  const n = (x) => x.toLocaleString('en-US');
  const msg = added ? `Imported ${n(added)} weigh-ins (${n(skipped)} already in Forge)` : `Nothing new: all ${n(skipped)} rows are already in Forge`;
  return unreadable ? `${msg}. ${n(unreadable)} row${unreadable === 1 ? '' : 's'} couldn’t be read and ${unreadable === 1 ? 'was' : 'were'} skipped.` : msg;
}

/**
 * Which parsed rows to add. existing: every weights doc INCLUDING deleted ones (so a reading you deleted or
 * marked "Not me" isn't brought back). A row is skipped when Forge already has its id, or a Withings
 * weigh-in covers it (see nearWithings).
 * Returns { add: [records without the standard fields], already, matched }.
 */
export function planCsvImport(rows, existing) {
  const ids = new Set(existing.map((w) => w.id));
  const near = nearWithings(existing);
  const add = [];
  const seen = new Set();
  let already = 0;
  let matched = 0;
  for (const r of rows) {
    const id = csvId(r.at);
    if (ids.has(id) || seen.has(id)) { already++; continue; }
    if (near(r.at.getTime() / 1000, r.kg)) { matched++; continue; }
    seen.add(id);
    add.push({ id, kg: r.kg, day: localDay(r.at), measured_at: r.at.toISOString() });
  }
  return { add, already, matched };
}
