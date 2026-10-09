// Apple Health export.xml → one summary per day, computed on the phone from a stream of text chunks. Only
// these small daily summaries ever leave the device (the Cloud Function importHealthDays stores them as
// health_daily days with source 'apple_export'); the export itself never does.
//
// Per day: mean overnight HRV (SDNN), resting heart rate, breathing rate, sleeping wrist temperature (and its
// delta from your previous 28 days), mean SpO₂, walking HR, VO₂ max; sleep stages from SleepAnalysis; and
// steps / active energy / exercise minutes. Steps and energy come from ONE source per day (the one with the
// most), because iPhone and Watch both record the same steps and adding them would double the count.
import { shiftDay } from './metrics.js';

const TYPES = {
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: ['hrv_sdnn_ms', 'mean', true],
  HKQuantityTypeIdentifierRestingHeartRate: ['rhr_bpm', 'mean', false],
  HKQuantityTypeIdentifierRespiratoryRate: ['resp_rate', 'mean', true],
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: ['wrist_temp_c', 'mean', true],
  HKQuantityTypeIdentifierOxygenSaturation: ['spo2_avg_pct', 'mean', false],
  HKQuantityTypeIdentifierWalkingHeartRateAverage: ['walking_hr_avg', 'mean', false],
  HKQuantityTypeIdentifierVO2Max: ['vo2max', 'mean', false],
  HKQuantityTypeIdentifierStepCount: ['steps', 'sum', false],
  HKQuantityTypeIdentifierActiveEnergyBurned: ['active_kcal', 'sum', false],
  HKQuantityTypeIdentifierAppleExerciseTime: ['exercise_min', 'sum', false],
};
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';
const OVERNIGHT_BEFORE_HOUR = 11; // overnight signals: samples taken before 11:00 count for that morning
const RECORD = /<Record\b([^>]*)>/g;
const ATTR = /(\w+)="([^"]*)"/g;

const iso = (s) => { // "2026-10-01 07:12:00 -0400" → ms
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s || '');
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : NaN;
};

function stage(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('deep')) return 'deep';
  if (v.includes('rem')) return 'rem';
  if (v.includes('core')) return 'core';
  if (v.includes('awake')) return 'awake';
  if (v.includes('inbed')) return 'inbed';
  if (v.includes('asleep')) return 'asleep';
  return null;
}

function unionMinutes(iv) {
  const xs = iv.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0;
  let a0 = null;
  let b0 = null;
  for (const [a, b] of xs) {
    if (b0 == null || a > b0) { if (b0 != null) total += b0 - a0; a0 = a; b0 = b; } else if (b > b0) b0 = b;
  }
  if (b0 != null) total += b0 - a0;
  return total / 60000;
}

export function createAggregator({ since }) {
  const keepFrom = shiftDay(since, -30); // a month earlier, so the first days' wrist-temperature delta has a baseline
  const means = {}; // field → day → [sum, n]
  const sums = {}; // field → day → { source: total }
  const sleep = {}; // day → { stage: [[a,b]...] }
  let carry = '';
  let records = 0;

  function onRecord(a) {
    const t = a.type;
    const end = a.endDate;
    if (!t || !end) return;
    if (t === SLEEP) {
      const st = stage(a.value);
      const s = iso(a.startDate);
      const e = iso(end);
      if (!st || !(e > s)) return;
      const hour = Number(end.slice(11, 13));
      const day = hour >= 18 ? shiftDay(end.slice(0, 10), 1) : end.slice(0, 10); // an evening segment belongs to tomorrow's wake-up
      if (day < keepFrom) return;
      ((sleep[day] ||= {})[st] ||= []).push([s, e]);
      return;
    }
    const def = TYPES[t];
    if (!def) return;
    const [field, how, overnight] = def;
    const day = end.slice(0, 10);
    if (day < keepFrom) return;
    if (overnight && Number(end.slice(11, 13)) >= OVERNIGHT_BEFORE_HOUR) return;
    let v = parseFloat(a.value);
    if (!Number.isFinite(v)) return;
    if (field === 'spo2_avg_pct' && v <= 1) v *= 100;
    if (field === 'active_kcal' && /kj/i.test(a.unit || '')) v /= 4.184;
    if (field === 'wrist_temp_c' && /degF|°F/i.test(a.unit || '')) v = ((v - 32) * 5) / 9; // an export from a phone set to °F
    records++;
    if (how === 'mean') {
      const m = ((means[field] ||= {})[day] ||= [0, 0]);
      m[0] += v;
      m[1]++;
    } else {
      const s = ((sums[field] ||= {})[day] ||= {});
      const src = a.sourceName || '?';
      s[src] = (s[src] || 0) + v;
    }
  }

  return {
    /** Add one record directly ({ type, value, unit, startDate, endDate, sourceName }, dates as the export writes
     * them). The iPhone app reads HealthKit and feeds records here (js/native/health.js). */
    addRecord(a) { onRecord(a); },
    /** Feed the next chunk of export.xml text. */
    feed(chunk) {
      const text = carry + chunk;
      const cut = text.lastIndexOf('>');
      if (cut < 0) { carry = text; return; }
      carry = text.slice(cut + 1);
      const body = text.slice(0, cut + 1);
      RECORD.lastIndex = 0;
      let m;
      while ((m = RECORD.exec(body))) {
        const a = {};
        ATTR.lastIndex = 0;
        let k;
        while ((k = ATTR.exec(m[1]))) a[k[1]] = k[2];
        onRecord(a);
      }
    },
    /** The days (oldest first) from `since` on, in the shape importHealthDays takes. */
    finish() {
      const days = new Map();
      const at = (d) => days.get(d) || days.set(d, { day: d }).get(d);
      for (const [f, byDay] of Object.entries(means)) for (const [d, [s, n]] of Object.entries(byDay)) {
        const v = s / n;
        at(d)[f] = Math.round(v * 100) / 100;
        if (f === 'hrv_sdnn_ms') at(d).hrv_samples = n;
      }
      for (const [f, byDay] of Object.entries(sums)) for (const [d, srcs] of Object.entries(byDay)) at(d)[f] = Math.round(Math.max(...Object.values(srcs)));
      for (const [d, st] of Object.entries(sleep)) {
        const all = [...(st.deep || []), ...(st.rem || []), ...(st.core || []), ...(st.asleep || [])];
        if (!all.length) continue; // only "in bed" / "awake": no sleep to report
        const o = { asleep_min: Math.round(unionMinutes(all)) };
        for (const k of ['core', 'deep', 'rem']) if (st[k]) o[`${k}_min`] = Math.round(unionMinutes(st[k]));
        if (st.awake) o.awake_min = Math.round(unionMinutes(st.awake));
        const every = Object.values(st).flat();
        o.in_bed_start = new Date(Math.min(...every.map((x) => x[0]))).toISOString();
        o.in_bed_end = new Date(Math.max(...every.map((x) => x[1]))).toISOString();
        at(d).sleep = o;
      }
      // Wrist temperature is an absolute number in the export; the delta is from your own previous 28 days.
      const ds = [...days.keys()].sort();
      for (const d of ds) {
        const r = days.get(d);
        if (r.wrist_temp_c == null) continue;
        const prior = [];
        for (let i = 1; i <= 28; i++) { const p = days.get(shiftDay(d, -i)); if (p && p.wrist_temp_c != null) prior.push(p.wrist_temp_c); }
        if (prior.length >= 5) r.wrist_temp_delta_c = Math.round((r.wrist_temp_c - prior.reduce((a, b) => a + b, 0) / prior.length) * 100) / 100;
      }
      return ds.filter((d) => d >= since && Object.keys(days.get(d)).length > 1).map((d) => days.get(d));
    },
    get records() { return records; },
  };
}

/** Read a whole text stream (export.xml) through an aggregator. onProgress is driven by the stream's source. */
export async function parseExport(textStream, { since }) {
  const agg = createAggregator({ since });
  const reader = textStream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    agg.feed(value);
  }
  return { days: agg.finish(), records: agg.records };
}
