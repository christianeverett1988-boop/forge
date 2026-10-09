// Long-term view (v0.13.0): the Forge Score as weekly averages over 90 days or a year, and how each tracked
// pillar moved. Scores two days per week (the week's last day and its midpoint; every daily score already looks
// back over a week) instead of all 365, so a year stays fast on a phone. Pure functions, no DOM.
import { shiftDay, mean } from './metrics.js';
import { scoreSamples, PILLARS } from './score.js';

export const WEEKS_MIN = 4; // fewer weeks with a score than this → no long-term view yet
export const RANGES = { 90: { days: 90, ago: '3 months ago' }, 365: { days: 365, ago: 'a year ago' } };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (day) => MONTHS[Number(day.slice(5, 7)) - 1];

/** The days to score for `weeks` weeks ending on `today`: two per week. */
export function sampleDays(today, weeks = 52) {
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = shiftDay(today, -7 * w);
    out.push(shiftDay(end, -3), end);
  }
  return out;
}

/**
 * Weekly points from the inputs of forgeScore (minus `today`): [{ day (week end), score, pillars: {body: n|null,...} }],
 * oldest first. A week's value is the mean of its scored samples; weeks with none are left out.
 */
export function weeklyScores(inputs, today, weeks = 52) {
  const days = sampleDays(today, weeks);
  const samples = scoreSamples({ ...inputs, days });
  const out = [];
  for (let i = 0; i < samples.length; i += 2) {
    const pair = samples.slice(i, i + 2);
    const sc = pair.map((s) => s.score).filter((x) => x != null);
    if (!sc.length) continue;
    const pillars = {};
    for (const k of Object.keys(PILLARS)) {
      const v = pair.map((s) => s.pillars[k]).filter((x) => x != null);
      pillars[k] = v.length ? mean(v) : null;
    }
    out.push({ day: days[i + 1], score: mean(sc), pillars });
  }
  return out;
}

/** Weeks inside the range ending on `today`. */
export const inRange = (weekly, today, range) => weekly.filter((w) => w.day > shiftDay(today, -RANGES[range].days) && w.day <= today);

/** Change over a series (oldest first): the mean of the last two values against the mean of the first two. null under 3 values. */
export function change(values) {
  const v = values.filter((x) => x != null);
  if (v.length < 3) return null;
  const k = Math.min(2, Math.floor(v.length / 2));
  return mean(v.slice(-k)) - mean(v.slice(0, k));
}

/** "Up 6 points since July" / "About the same as 3 months ago" / "Down 4 points since July". null under 3 weeks. */
export function changeSentence(points, range) {
  if (points.length < 3) return null;
  const d = Math.round(change(points.map((p) => p.score)));
  if (Math.abs(d) < 2) return `About the same as ${RANGES[range].ago}`;
  const first = points[0].day;
  const since = first.slice(0, 4) !== points[points.length - 1].day.slice(0, 4) && range === 365 ? `${monthName(first)} ${first.slice(0, 4)}` : monthName(first);
  return `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'} since ${since}`;
}

/** One row per tracked pillar (a value in at least 3 of the weeks): { key, label, delta, arrow }. Untracked pillars are left out. */
export function pillarChanges(points) {
  const rows = [];
  for (const [key, def] of Object.entries(PILLARS)) {
    const d = change(points.map((p) => p.pillars[key]));
    if (d == null) continue;
    const delta = Math.round(d);
    rows.push({ key, label: def.label, delta, arrow: delta >= 2 ? '↑' : delta <= -2 ? '↓' : '→' });
  }
  return rows;
}

/** Everything the card needs: { status: 'building'|'ok', weeksSoFar, points, sentence, pillars }. */
export function longTerm(weekly, today, range = 90) {
  const points = inRange(weekly, today, range);
  if (weekly.length < WEEKS_MIN || points.length < WEEKS_MIN) return { status: 'building', weeksSoFar: weekly.length };
  return { status: 'ok', weeksSoFar: weekly.length, points, sentence: changeSentence(points, range), pillars: pillarChanges(points) };
}
