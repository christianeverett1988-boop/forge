// Forge Coach, no-AI mode: rule-based answers from your own data. Every question is a pure function
// (data, today) → answer | null. null means "nothing behind this question yet", and the chip is hidden.
// Every number comes from an existing module (data.js gathers their output); nothing is invented here.
// answer = { id, headline, lines: [2–4 short lines], why, action?: { id, label, ask }, note?: MEDICAL }
import { weightToDisplay, weightUnit } from '../units.js';
import { fmtDelta } from '../health/delta.js';
import { trendChange } from '../weight/smoothing.js';
import { NOISE_FLOOR } from '../health/trends.js';
import { MEDICAL } from '../health/insights.js';
import { SHOW_MUSCLES, MUSCLE_LABELS, FRESH_PCT, freshCount } from '../workouts/recovery.js';

export { MEDICAL };
export const DISCLAIMER = 'General fitness information, not medical advice.';

const fmtDay = (key, today) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
const mass = (kg, u, digits = 1) => `${Math.abs(weightToDisplay(kg, u)).toFixed(digits)} ${weightUnit(u)}`;
const signed = (v, digits, unit) => { const d = fmtDelta(v, { digits, unit }); return d ? d.text : null; };
const massDelta = (kg, u) => signed(weightToDisplay(kg, u), 1, weightUnit(u));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fresh = (pct) => SHOW_MUSCLES.map((m) => [m, pct[m]]).filter(([, v]) => Number.isFinite(v));

// ---- 1. How did last week go? (or how is this week going, while the report is partial) ----
export const weekLabel = (d) => (d.report && d.report.partial ? 'How is this week going?' : 'How did last week go?');
export function weekAnswer(d) {
  const r = d.report;
  if (!r || !r.hasData) return null;
  const t = r.training;
  const when = r.partial ? 'Your week so far' : 'Last week';
  const lines = [`${plural(t.workouts, 'workout')} done, ${t.planned} planned.`];
  if (r.weight.change != null) {
    const dl = fmtDelta(weightToDisplay(r.weight.change, d.units), { digits: 1, unit: weightUnit(d.units) });
    lines.push(dl.same ? 'Weight trend is steady.' : `Weight trend ${dl.text} vs the week before.`);
  }
  if (r.best) lines.push(`Best mover: ${r.best.label}.`);
  lines.push(r.suggestion.text);
  const sd = r.score.delta != null ? fmtDelta(r.score.delta) : null;
  const headline = sd && !sd.same
    ? `${when}: Score ${r.score.delta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(r.score.delta))}`
    : `${when}: ${t.workouts} of ${t.planned} workouts`;
  return { id: 'week', headline, lines: lines.slice(0, 4), why: 'The weekly report: Monday to Sunday compared with the week before, using your smoothed weight.' };
}

// ---- 2. Am I on track for my goal? ----
export function goalAnswer(d, today = '') {
  const p = d.goalPath;
  if (!p || p.status === 'none' || p.status === 'nogoal') return null;
  const u = d.units;
  const pace = `${mass(p.slopePerWeek, u, 2)} a week`;
  const cap = `Safe pace is up to ${mass(p.capKgPerWeek, u)} a week.`;
  const base = { id: 'goal', why: 'A straight line through your last 4 weeks of smoothed weight, with an 80% range around the date.' };
  if (p.status === 'reached') {
    return { ...base, headline: 'You are at your goal weight.', lines: [`Trend ${mass(p.current, u)}, goal ${mass(d.goalKg, u)}.`, 'Change your goal in Profile if you want a new target.'] };
  }
  const away = `${mass(p.remaining, u)} ${p.remaining < 0 ? 'to lose' : 'to gain'}.`;
  if (p.status === 'flat') return { ...base, headline: 'Your weight is holding steady, so there is no date yet.', lines: [`Trend ${mass(p.current, u)}; ${away}`, 'A steady change over a few weeks gives Forge a date.'] };
  if (p.status === 'away') return { ...base, headline: 'Your trend is moving away from your goal.', lines: [`Trend ${mass(p.current, u)}; ${away}`, `Moving ${pace} the other way.`, 'Check your food and training, or change your goal in Profile if it no longer fits.'] };
  if (p.status === 'far') return { ...base, headline: 'At this pace the goal is more than 5 years away.', lines: [`Trend ${mass(p.current, u)}; ${away}`, `Pace ${pace}.`, cap] };
  const lines = [`Trend ${mass(p.current, u)}; ${away}`];
  lines.push(p.lateDay ? `Likely between ${fmtDay(p.earlyDay, today)} and ${fmtDay(p.lateDay, today)}.` : `Could be as early as ${fmtDay(p.earlyDay, today)}, or later.`);
  lines.push(p.overCap ? `Pace ${pace} is faster than the safe ${mass(p.capKgPerWeek, u)}. Slow down to keep muscle.` : `Pace ${pace}. ${cap}`);
  lines.push(p.overCap ? 'A slower pace pushes the date out but protects muscle.' : 'A faster pace within the safe limit moves the date earlier. Steadier weigh-ins narrow the range.');
  return { ...base, headline: `On pace for ${fmtDay(p.etaDay, today)}.`, lines };
}

// ---- 3. Why did my weight go up (or down)? ----
/** The chip's wording follows the latest reading against your trend. */
export function weightLabel(d) {
  const last = d.weights && d.weights[d.weights.length - 1];
  if (!last || !Number.isFinite(last.trend)) return 'Why did my weight change?';
  const gap = last.kg - last.trend;
  return gap > 0 ? 'Why did my weight go up?' : gap < 0 ? 'Why did my weight go down?' : 'Why did my weight change?';
}
export function weightAnswer(d) {
  const ws = d.weights || [];
  if (ws.length < 3) return null;
  const change = trendChange(ws, 7);
  if (change == null) return null;
  const last = ws[ws.length - 1];
  const u = d.units;
  const gap = last.kg - last.trend;
  const sd = d.goalPath && Number.isFinite(d.goalPath.sdKg) ? d.goalPath.sdKg : null;
  const steady = Math.abs(change) < NOISE_FLOOR.weight_kg;
  const swing = sd == null ? '' : Math.abs(gap) <= sd ? `, inside your usual swing of ${mass(sd, u)}` : `, bigger than your usual swing of ${mass(sd, u)}`;
  // The gap comes from the two numbers as shown, so the reader's subtraction matches.
  const shown = (kg) => Number(weightToDisplay(kg, u).toFixed(1));
  const shownGap = Math.round((shown(last.kg) - shown(last.trend)) * 10) / 10;
  const gapText = shownGap === 0 ? 'right on it' : `${Math.abs(shownGap).toFixed(1)} ${weightUnit(u)} ${shownGap > 0 ? 'above' : 'below'}`;
  const lines = [`Scale ${mass(last.kg, u)}, trend ${mass(last.trend, u)}: ${gapText}${swing}.`];
  const t = d.report && d.report.training;
  if (t && gap > 0) lines.push(t.workouts ? `You trained ${plural(t.workouts, 'time')} in your report week. Hard sessions hold water for a day or two.` : 'No workouts in your report week, so training is not the reason.');
  else if (gap < 0) lines.push('Some of today’s drop is likely water; the trend is what counts.');
  lines.push(`Salt, carbs and water can move the scale by ${u === 'metric' ? 'a kilo' : '2 lb'} or more in a day.`);
  const fat = (d.trends || []).find((x) => x.key === 'fat_mass_kg');
  const lean = (d.trends || []).find((x) => x.key === 'fat_free_mass_kg');
  if (fat && lean && fat.t28.enough && lean.t28.enough) {
    lines.push(`Over 4 weeks, per week: fat ${massDelta(fat.t28.slopePerWeek, u)}, lean ${massDelta(lean.t28.slopePerWeek, u)}.`);
  }
  const headline = steady
    ? 'Your trend is steady, so this looks like noise.'
    : `Your trend is ${change > 0 ? 'up' : 'down'} ${mass(change, u)} this week.`;
  return { id: 'weight', headline, lines: lines.slice(0, 4), why: 'Smoothed weight over 4 weeks; day-to-day swings removed. The trend moves only when your real weight does.' };
}

// ---- 4. What should I train today? ----
export function recoveredPhrase(low) {
  if (low < FRESH_PCT) return `the lowest is ${low}% recovered`;
  if (low >= 100) return 'fully recovered';
  return `all ${Math.min(95, Math.floor(low / 5) * 5)}%+ recovered`;
}

export function trainAnswer(d) {
  const plan = d.plan;
  if (!plan || !plan.exercises || !plan.exercises.length) return null;
  if (d.activeWorkout) {
    return { id: 'train', headline: 'You have a workout in progress.', lines: ['Finish it first.', 'Then Coach can plan the next one.'], why: 'Only one workout can be open at a time.' };
  }
  const lines = [`${plural(plan.exercises.length, 'exercise')}, about ${plan.est_minutes} min, at ${plan.location.name}.`];
  const rec = d.recovery || {};
  const works = (d.planMuscles || []).filter((m) => Number.isFinite(rec[m]));
  if (works.length) {
    const low = Math.min(...works.map((m) => rec[m]));
    const names = works.map((m) => MUSCLE_LABELS[m].toLowerCase());
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    lines.push(`Today works ${list} (${recoveredPhrase(low)}).`);
  }
  const r = d.readiness;
  if (r && r.status === 'ok' && !r.stale) {
    lines.push(plan.readiness === 'red' ? 'Readiness is red, so this is a lighter day.'
      : plan.readiness === 'amber' ? 'Readiness is amber, so each accessory has one set less.'
      : `Readiness is ${r.level}.`);
  }
  if (plan.deload) lines.push('It is a deload week: lighter weights, fewer sets.');
  return {
    id: 'train', headline: `Today: ${plan.label}`, lines: lines.slice(0, 4),
    why: 'Forge picks the day whose muscles are most recovered, then adjusts for Readiness and deload weeks.',
    action: { id: 'start_workout', label: 'Start this workout', ask: `Start ${plan.label} now?` },
  };
}

// ---- 5. Am I recovered? ----
export function recoveredAnswer(d) {
  const r = d.readiness;
  const pct = fresh(d.recovery || {});
  const hasR = !!r && r.status === 'ok';
  if (!hasR && !d.hasTraining) return null;
  const freshN = freshCount(d.recovery || {});
  const tired = pct.filter(([, v]) => v < FRESH_PCT).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const lines = [];
  if (hasR) {
    lines.push(`${r.reason}.`);
    const inputs = r.parts.filter((p) => p.key !== 'load').slice(0, 2).map((p) => p.text);
    if (inputs.length) lines.push(`${inputs.join('. ')}.`);
  }
  lines.push(`${freshN} of ${pct.length} muscle groups are fresh.`);
  if (tired.length) lines.push(`Least recovered: ${tired.map(([m, v]) => `${MUSCLE_LABELS[m]} ${v}%`).join(', ')}.`);
  const headline = hasR
    ? { green: 'Yes, you look ready to train.', amber: 'Partly. Go a little easier today.', red: 'Not fully. Your body wants a lighter day.' }[r.level]
    : `${freshN} of ${pct.length} muscle groups are fresh.`;
  const out = {
    id: 'recovered', headline, lines: lines.slice(0, 4),
    why: hasR ? 'Your HRV, resting heart rate and sleep against your own last 28 days, minus a small cost for yesterday’s training.' : 'Each hard set adds fatigue to the muscles it trains, and it fades over 48 to 72 hours.',
    ...(hasR ? { note: MEDICAL } : {}),
  };
  if (hasR && r.level === 'red' && d.readinessOverridden) {
    out.action = { id: 'lighter', label: 'Make today lighter', ask: 'Turn Readiness back on so today’s workout is a lighter one?' };
  } else if (hasR && r.level === 'red' && !r.stale) {
    out.lines = [...out.lines.slice(0, 3), 'Today’s workout is already set to a lighter day.'];
  }
  return out;
}

// ---- 6. What's my Forge Score made of? ----
export function scoreAnswer(d) {
  const s = d.score;
  if (!s || s.score == null) return null;
  const tracked = s.pillars.filter((p) => p.tracked && p.score != null);
  const lines = [tracked.map((p) => `${p.label} ${Math.round(p.score)}`).join(' · ')];
  const m = s.movers && s.movers[0];
  lines.push(m ? `Biggest mover: ${m.label} ${m.delta >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(m.delta))} points vs the week before.` : 'Nothing moved much since the week before.');
  if (s.notTracked && s.notTracked.length) lines.push(`Not tracked yet: ${s.notTracked.map((k) => (s.pillars.find((p) => p.key === k) || { label: k }).label).join(', ')}.`);
  return { id: 'score', headline: `Your Forge Score is ${Math.round(s.score)}.`, lines, why: 'The average of your last 7 days. Each pillar is a weighted mean of its parts, each scored 0 to 100.' };
}

// ---- 7. Am I getting stronger? ----
export function strongerAnswer(d) {
  const lifts = (d.lifts || []).filter((l) => l.now != null && (l.change4 != null || l.change12 != null));
  if (!lifts.length) return null;
  const have4 = lifts.filter((l) => l.change4 != null);
  const up4 = have4.filter((l) => l.change4 > 0).length;
  const lines = lifts.slice(0, 3).map((l) => {
    const bits = [];
    if (l.change4 != null) bits.push(`${signed(l.change4, 0, d.unit)} in 4 weeks`);
    if (l.change12 != null) bits.push(`${signed(l.change12, 0, d.unit)} in 12 weeks`);
    return `${l.name}: about ${l.now} ${d.unit} (${bits.join(', ')}).`;
  });
  const stalled = d.stalled || [];
  if (stalled.length) lines.push(`Stalled: ${stalled.map((s) => s.name).join(', ')}.`);
  const headline = have4.length
    ? (have4.length === 1 ? `Your main lift is ${up4 ? '' : 'not '}up over 4 weeks.`
      : up4 ? `${up4} of ${have4.length} main lifts are up over 4 weeks.` : 'No main lift is up over 4 weeks.')
    : 'Here is how your main lifts have moved.';
  const out = { id: 'stronger', headline, lines: lines.slice(0, 4), why: 'Estimated 1-rep max (Epley): your best in the last 4 weeks against the best 4 and 12 weeks earlier. Deload weeks are left out.' };
  if (stalled.length) out.action = { id: 'deload', label: 'Start a deload week', ask: 'Start a deload week? Workouts get lighter for 7 days, then progress resumes.' };
  return out;
}

/** True when there are no weigh-ins and no workouts yet: the Coach screen shows its starter card. */
export const needsStarter = (d) => !(d.weights && d.weights.length) && !d.hasTraining;

/** Questions in display order. label is a string or (data) → string. */
export const QUESTIONS = [
  { id: 'week', label: weekLabel, answer: weekAnswer },
  { id: 'goal', label: 'Am I on track for my goal?', answer: goalAnswer },
  { id: 'weight', label: weightLabel, answer: weightAnswer },
  { id: 'train', label: 'What should I train today?', answer: trainAnswer },
  { id: 'recovered', label: 'Am I recovered?', answer: recoveredAnswer },
  { id: 'score', label: 'What’s my Forge Score made of?', answer: scoreAnswer },
  { id: 'stronger', label: 'Am I getting stronger?', answer: strongerAnswer },
];

/** The questions that have data behind them right now: [{ id, label, answer }], answers already worked out. */
export function availableQuestions(data, today) {
  const out = [];
  for (const q of QUESTIONS) {
    const a = q.answer(data, today);
    if (a) out.push({ id: q.id, label: typeof q.label === 'function' ? q.label(data) : q.label, answer: a });
  }
  return out;
}
