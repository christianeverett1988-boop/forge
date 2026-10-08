// Turn a Withings measure group into Forge documents: users/{uid}/body_measures/w_<grpid> and, when it has
// a weight, the mirror users/{uid}/weights/w_<grpid>. Pure; no network, no Firestore.
import { createHash } from 'node:crypto';
import { METRIC_OF_TYPE, SEGMENT_TYPES, POSITION, decodeValue } from './meastypes.js';

export const docId = (grpid) => `w_${grpid}`;

/** 'YYYY-MM-DD' of an instant in an IANA time zone (falls back to America/New_York, then UTC). */
export function dayIn(isoOrMs, tz) {
  const d = new Date(isoOrMs);
  for (const zone of [tz, 'America/New_York', 'UTC']) {
    if (!zone) continue;
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch { /* unknown zone: try the next */ }
  }
  return d.toISOString().slice(0, 10);
}

/** Stable hash of the raw measures (order-independent), to skip writes when nothing changed. */
export function rawHash(raw) {
  const norm = [...raw].map((m) => [m.type, m.value, m.unit, m.position ?? null]).sort((a, b) => (a.join() < b.join() ? -1 : 1));
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex').slice(0, 32);
}

/**
 * One getmeas `measuregrps[]` entry → the body_measures fields (without the standard fields).
 *   device: { model } from getdevice (optional), tz: the response's timezone fallback.
 */
export function decodeGroup(g, { device = null, tz = null } = {}) {
  const raw = (g.measures || []).map((m) => ({ type: m.type, value: m.value, unit: m.unit, ...(m.position != null ? { position: m.position } : {}) }));
  const metrics = {};
  const segments = {};
  for (const m of raw) {
    const v = decodeValue(m.value, m.unit);
    if (!Number.isFinite(v)) continue;
    if (SEGMENT_TYPES[m.type] && POSITION[m.position]) {
      const seg = POSITION[m.position];
      segments[seg] = { ...(segments[seg] || {}), [SEGMENT_TYPES[m.type]]: v };
    } else if (METRIC_OF_TYPE[m.type] && m.position == null) {
      metrics[METRIC_OF_TYPE[m.type]] = v;
    }
  }
  const zone = g.timezone || tz || null;
  const measuredAt = new Date(Number(g.date) * 1000).toISOString();
  return {
    grpid: g.grpid,
    measured_at: measuredAt,
    day: dayIn(measuredAt, zone),
    tz: zone,
    attrib: g.attrib ?? null,
    needs_review: g.attrib === 1, // "ambiguous user": not in the trend until you confirm it's you
    category: g.category ?? 1,
    deviceid: g.hash_deviceid || g.deviceid || null,
    model: g.model || (device && device.model) || null, // the scale that took this reading, if Withings says
    w_created: g.created ? new Date(Number(g.created) * 1000).toISOString() : null,
    w_modified: g.modified ? new Date(Number(g.modified) * 1000).toISOString() : null,
    metrics,
    segments,
    raw,
    raw_hash: rawHash(raw),
  };
}

/** The weights mirror for a decoded group, or null when the group has no weight. */
export function weightMirror(body) {
  const kg = body.metrics.weight_kg;
  if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) return null;
  return { kg, day: body.day, measured_at: body.measured_at, grpid: body.grpid, review: !!body.needs_review };
}
