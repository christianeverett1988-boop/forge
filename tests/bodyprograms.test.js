// Body programs (js/body-programs/core.js): week boundaries, goals, the safe pace, finishing, XP. Synthetic data only.
import { test, eq, near, assert } from './harness.js';
import {
  PROGRAMS, weekBounds, lastDayOf, weekGoals, weekTrend, paceBand, bandText, rangeText, progressDays, programStatus,
  finishedEntry, endedEntry, entryCompleted, summaryFor, programXP, programBadges, canStart, recommendedId, finishedCount,
  FINISH_XP, WEEK_XP, PROGRAM_BADGE_IDS,
} from '../js/body-programs/core.js';
import { indexDays, shiftDay, localDay } from '../js/missions/core.js';
import { computeTargets } from '../js/nutrition/targets.js';
import { awardsFor } from '../js/workouts/awards.js';
import { BADGE_ART } from '../js/ui/badges.js';

const S = '2026-10-01'; // program start (a Thursday: weeks run from here, not from Monday)
const at = (day, h = 12) => { const [y, mo, d] = day.split('-').map(Number); return new Date(y, mo - 1, d, h).toISOString(); };
const days = (from, n) => Array.from({ length: n }, (_, i) => shiftDay(from, i));
const wt = (day) => ({ day, kg: 80 });
const done = (day, extra = {}) => ({ id: `w${day}`, status: 'done', started_at: at(day), exercises: [], prs: [], ...extra });
const lift = (day, exercise_id, weight_kg, reps, extra = {}) => done(day, { exercises: [{ exercise_id, sets: [{ done: true, weight_kg, reps }] }], ...extra });
const series = (from, n, f) => days(from, n).map((day, i) => ({ day, kg: f(i), trend: f(i) }));
const band100 = paceBand(computeTargets({ goal: 'lose', sex: 'male', age: 35, heightCm: 180, weightKg: 100, activity: 'moderate', pacePct: 0.5 }), 100); // 0.25–0.75 %/wk
const data = (o = {}) => ({
  idx: indexDays({ weights: o.weights || [], workouts: o.workouts || [], cardio: o.cardio || [], healthDaily: o.health || [] }),
  series: o.series || [], progress: o.progress || [], trainingDays: o.trainingDays || 3, steps: 8000, band: band100, units: o.units || 'imperial',
});
const goals = (id, from, to, today, o) => weekGoals(PROGRAMS[id], from, to, today, data(o));
const get = (list, id) => list.find((g) => g.id === id);

// ---------- week boundaries ----------
test('programs: weeks run from the start day, not the calendar week', () => {
  eq(weekBounds(S, 0).start, '2026-10-01');
  eq(weekBounds(S, 0).end, '2026-10-07');
  eq(weekBounds(S, 1).start, '2026-10-08');
  eq(weekBounds(S, 3).end, '2026-10-28');
  eq(lastDayOf(S, 'cut4'), '2026-10-28');
  eq(lastDayOf(S, 'recomp8'), '2026-11-25');
  const st = (today) => programStatus({ id: 'maintain4', started: S }, today, data());
  eq(st('2026-10-07').weekNo, 1, 'a Wednesday is still week 1');
  eq(st('2026-10-08').weekNo, 2);
  eq(st('2026-10-08').weeks[0].state, 'past');
  eq(st('2026-10-08').weeks[1].state, 'current');
  eq(st('2026-10-08').weeks[2].state, 'future');
  eq(st('2026-10-28').weekNo, 4);
  eq(st('2026-10-28').finished, false, 'the last day is still the program');
  eq(st('2026-10-29').finished, true);
  eq(st('2026-10-29').weekNo, 4);
  // a workout on the last day of week 1 counts for week 1 only (Sunday 4 Oct does not split the week)
  const d = data({ workouts: [done('2026-10-07'), done('2026-10-08')] });
  eq(get(weekGoals(PROGRAMS.maintain4, '2026-10-01', '2026-10-07', '2026-10-14', d), 'train').value, 1);
  eq(get(weekGoals(PROGRAMS.maintain4, '2026-10-08', '2026-10-14', '2026-10-14', d), 'train').value, 1);
});

test('programs: the three programs, who they are for, and the recommendation', () => {
  eq(PROGRAMS.cut4.weeks, 4);
  eq(PROGRAMS.recomp8.weeks, 8);
  eq(PROGRAMS.maintain4.weeks, 4);
  eq(recommendedId('lose'), 'cut4');
  eq(recommendedId('recomp'), 'recomp8');
  eq(recommendedId('muscle'), 'recomp8');
  eq(recommendedId('health'), 'maintain4');
  eq(recommendedId('endurance'), 'maintain4');
  eq(recommendedId(undefined), 'maintain4');
});

// ---------- goals ----------
test('goals: weigh in counts days inside the week only', () => {
  const g = (n, from = S) => get(goals('cut4', S, '2026-10-07', '2026-10-07', { weights: days(from, n).map(wt) }), 'weigh');
  eq(g(5).done, true);
  eq(g(5).text, 'Weighed in 5 of 5 days');
  eq(g(4).done, false);
  eq(g(4).text, 'Weighed in 4 of 5 days');
  eq(g(5, '2026-09-28').value, 2, 'days before the start do not count');
  eq(get(goals('recomp8', S, '2026-10-07', '2026-10-07', { weights: days(S, 4).map(wt) }), 'weigh').done, true, 'recomp needs 4');
  eq(get(goals('maintain4', S, '2026-10-07', '2026-10-07', { weights: days(S, 3).map(wt) }), 'weigh').done, true, 'maintenance needs 3');
  eq(get(goals('maintain4', S, '2026-10-07', '2026-10-07', { weights: days(S, 2).map(wt) }), 'weigh').done, false);
});

test('goals: training days use your planned days; cardio counts like the weekly streak', () => {
  const t = (o) => get(goals('maintain4', S, '2026-10-07', '2026-10-07', o), 'train');
  eq(t({ workouts: [done('2026-10-01'), done('2026-10-03'), done('2026-10-05')] }).done, true);
  eq(t({ workouts: [done('2026-10-01'), done('2026-10-03')] }).done, false);
  eq(t({ workouts: [done('2026-10-01'), done('2026-10-03')] }).text, 'Trained 2 of 3 days');
  eq(t({ workouts: [done('2026-10-01'), done('2026-10-01')] }).value, 1, 'two workouts on one day are one day');
  eq(t({ trainingDays: 2, workouts: [done('2026-10-01'), done('2026-10-03')] }).done, true, 'planned days come from the profile');
  eq(t({ workouts: [done('2026-10-01'), done('2026-10-03'), { ...done('2026-10-04'), status: 'active' }] }).value, 2, 'unfinished workouts do not count');
  eq(t({ workouts: [done('2026-10-01'), done('2026-10-03')], cardio: [{ started_at: at('2026-10-05'), duration_min: 25 }] }).done, true);
});

test('goals: steps are hidden without Apple Health, then judged on the average', () => {
  eq(get(goals('cut4', S, '2026-10-07', '2026-10-07', {}), 'steps'), undefined, 'no health rows: no steps goal');
  eq(goals('cut4', S, '2026-10-07', '2026-10-07', {}).map((g) => g.id).join(), 'weigh,train,pace');
  eq(goals('recomp8', S, '2026-10-07', '2026-10-07', {}).map((g) => g.id).join(), 'weigh,train,progress,steady');
  eq(goals('maintain4', S, '2026-10-07', '2026-10-07', {}).map((g) => g.id).join(), 'weigh,train,steady', 'maintenance never has steps');
  const health = days(S, 7).map((id, i) => ({ id, steps: i < 6 ? 10000 : 2000 }));
  const past = get(goals('cut4', S, '2026-10-07', '2026-10-14', { health }), 'steps');
  near(past.value, (6 * 10000 + 2000) / 7, 1e-6);
  eq(past.done, true);
  eq(goals('cut4', S, '2026-10-07', '2026-10-14', { health }).map((g) => g.id).join(), 'weigh,train,steps,pace');
  // a week in progress ignores today's still-filling row
  const live = get(goals('cut4', S, '2026-10-07', '2026-10-07', { health }), 'steps');
  eq(live.value, 10000);
  const low = get(goals('cut4', S, '2026-10-07', '2026-10-14', { health: days(S, 7).map((id) => ({ id, steps: 5000 })) }), 'steps');
  eq(low.done, false);
  eq(low.text, 'Averaging 5,000 steps a day');
  // Apple Health connected but nothing in this week yet
  const wait = get(goals('cut4', '2026-10-08', '2026-10-14', '2026-10-08', { health }), 'steps');
  eq(wait.waiting, true);
  eq(wait.done, false);
});

test('goals: progress counts workouts with a PR or a step up, and skips deloads', () => {
  const ws = [
    lift('2026-10-01', 'bench', 60, 8),
    lift('2026-10-03', 'bench', 62.5, 8), // more weight: a step
    lift('2026-10-05', 'bench', 62.5, 9), // same weight, more reps: a step
    lift('2026-10-06', 'squat', 100, 5), // first time: nothing to beat
    lift('2026-10-07', 'row', 40, 8, { prs: [{ type: 'weight' }] }), // a PR
    lift('2026-10-08', 'bench', 70, 8, { deload: true }), // deloads never count
    lift('2026-10-09', 'bench', 62.5, 9), // same as last time
  ];
  eq(progressDays(ws).join(), '2026-10-03,2026-10-05,2026-10-07');
  const g = (progress) => get(goals('recomp8', S, '2026-10-07', '2026-10-07', { progress }), 'progress');
  eq(g(['2026-10-03']).done, false);
  eq(g(['2026-10-03']).text, '1 of 2 workouts with a PR or a step up');
  eq(g(['2026-10-03', '2026-10-05']).done, true);
  eq(g(['2026-09-30', '2026-10-05']).value, 1, 'only this week counts');
  eq(get(goals('cut4', S, '2026-10-07', '2026-10-07', {}), 'progress'), undefined, 'cut has no progress goal');
});

test('goals: the weight trend is scaled to a full week and needs a few days of readings', () => {
  const s = [{ day: '2026-09-30', trend: 100 }, { day: '2026-10-07', trend: 99.4 }];
  near(weekTrend(s, S, '2026-10-07', '2026-10-07').pct, -0.6, 1e-9);
  eq(weekTrend([{ day: '2026-09-30', trend: 100 }], S, '2026-10-07', '2026-10-07'), null, 'one reading says nothing');
  eq(weekTrend([{ day: '2026-10-05', trend: 100 }, { day: '2026-10-06', trend: 99 }], S, '2026-10-07', '2026-10-07'), null, 'under 3 days apart');
  // 4 days of change are scaled to 7: -0.4 kg in 4 days is -0.7 kg a week
  near(weekTrend([{ day: '2026-09-30', trend: 100 }, { day: '2026-10-04', trend: 99.6 }], S, '2026-10-07', '2026-10-04').kg, -0.7, 1e-9);
  // readings after the week (or after today) are ignored
  near(weekTrend([...s, { day: '2026-10-09', trend: 90 }], S, '2026-10-07', '2026-10-20').pct, -0.6, 1e-9);
  eq(weekTrend([...s, { day: '2026-10-09', trend: 90 }], S, '2026-10-07', '2026-10-07').pct.toFixed(1), '-0.6');
});

test('goals: cut pace is done only inside the safe pace; too slow and too fast both miss', () => {
  const pace = (end) => get(goals('cut4', S, '2026-10-07', '2026-10-07', { series: [{ day: '2026-09-30', trend: 100 }, { day: '2026-10-07', trend: end }] }), 'pace');
  eq(pace(99.4).done, true, '0.6%');
  eq(pace(99.75).done, true, 'the edge counts: 0.25%');
  eq(pace(99.9).done, false, 'too slow');
  eq(pace(98.5).done, false, 'too fast');
  eq(pace(100.4).done, false, 'gaining');
  eq(pace(99.4).text, 'Losing 1.3 lb a week (safe pace: 0.6–1.7 lb)');
  eq(get(goals('cut4', S, '2026-10-07', '2026-10-07', { units: 'metric', series: [{ day: '2026-09-30', trend: 100 }, { day: '2026-10-07', trend: 99.4 }] }), 'pace').text, 'Losing 0.6 kg a week (safe pace: 0.3–0.8 kg)');
  const none = get(goals('cut4', S, '2026-10-07', '2026-10-07', {}), 'pace');
  eq(none.done, false);
  eq(none.waiting, true);
  eq(none.text, 'Weigh in a few more times to see your pace');
});

test('goals: recomp stays within 0.25% a week and maintenance within 0.3%', () => {
  const st = (id, end) => get(goals(id, S, '2026-10-07', '2026-10-07', { series: [{ day: '2026-09-30', trend: 100 }, { day: '2026-10-07', trend: end }] }), 'steady');
  eq(st('recomp8', 100.2).done, true);
  eq(st('recomp8', 99.8).done, true);
  eq(st('recomp8', 100.3).done, false);
  eq(st('maintain4', 100.3).done, true);
  eq(st('maintain4', 99.65).done, false);
  eq(st('maintain4', 100).text, 'Holding steady');
  eq(st('maintain4', 99.8).text, 'Down 0.4 lb a week');
  eq(get(goals('maintain4', S, '2026-10-07', '2026-10-07', {}), 'steady').done, false);
});

// ---------- the safe pace ----------
test('pace band: the planned pace ± 50%, never past the safety caps', () => {
  near(band100.loPct, 0.25, 1e-9);
  near(band100.hiPct, 0.75, 1e-9);
  near(band100.loKg, 0.25, 1e-9);
  near(band100.hiKg, 0.75, 1e-9);
  const p = { goal: 'lose', sex: 'male', age: 35, heightCm: 180, weightKg: 100, activity: 'moderate' };
  const capped = paceBand(computeTargets({ ...p, pacePct: 2 }), 100); // computeTargets caps 2% at 1%
  near(capped.hiPct, 1, 1e-9, 'never faster than 1%');
  near(capped.loPct, 0.5, 1e-9);
  const fast = paceBand(computeTargets({ ...p, pacePct: 2, allowFastPace: true }), 100, { allowFastPace: true });
  near(fast.hiPct, 1.5, 1e-9, 'the override ceiling');
  near(paceBand(computeTargets({ ...p, pacePct: 1.2, allowFastPace: true }), 100, { allowFastPace: true }).hiPct, 1.5, 1e-9);
  near(paceBand(null, 100).loPct, 0.25, 1e-9, 'no targets: the default 0.5% pace');
  near(paceBand({ pacePct: 0 }, 100).hiPct, 0.75, 1e-9);
});

test('pace band: shown in pounds or kilograms', () => {
  const b200lb = paceBand({ pacePct: 0.5 }, 200 / 2.2046226218); // a 200 lb person
  eq(bandText(b200lb, 'imperial'), 'losing 0.5–1.5 lb a week');
  eq(rangeText(0.25, 0.75, 'metric'), '0.3–0.8 kg');
  eq(bandText(band100, 'metric'), 'losing 0.3–0.8 kg a week');
  eq(bandText(band100, 'imperial'), 'losing 0.6–1.7 lb a week');
});

// ---------- the whole program ----------
/** A maintenance program where every week is fully hit: 3 weigh-ins, 3 workouts, flat weight. */
function perfect(id = 'maintain4', weeks = PROGRAMS[id].weeks, started = S) {
  const weights = [];
  const workouts = [];
  for (let w = 0; w < weeks; w++) {
    const s = shiftDay(started, w * 7);
    weights.push(...days(s, 3).map(wt));
    workouts.push(done(shiftDay(s, 0)), done(shiftDay(s, 2)), done(shiftDay(s, 4), { prs: [{ type: 'weight' }] }));
  }
  return { weights, workouts, series: series(shiftDay(started, -1), weeks * 7 + 2, () => 80) };
}

test('program: a live week shows goals so far; past weeks are checked or partly', () => {
  const o = perfect();
  const d = data({ ...o, workouts: o.workouts.filter((w) => w.started_at < at('2026-10-15')), weights: o.weights.slice(0, 7) });
  const st = programStatus({ id: 'maintain4', started: S }, '2026-10-10', d);
  eq(st.weeks[0].state, 'past');
  eq(st.weeks[0].hit, true);
  eq(st.weeks[1].state, 'current');
  eq(st.weeks[1].goals.length, 3);
  eq(st.goalsTotal, 3);
  eq(st.goalsDone, 2, 'weighed in and trained so far; steadiness needs a few more days of readings');
  eq(st.weeksHit, 1);
  eq(st.progress, 9 / 28);
  const part = programStatus({ id: 'maintain4', started: S }, '2026-10-10', data({ weights: days(S, 7).map(wt) }));
  eq(part.weeks[0].hit, false, 'partly: some goals missed');
  eq(part.weeks[0].goals.filter((g) => g.done).length, 1);
  eq(part.weeks[2].goals.length, 0, 'future weeks have no goals yet');
});

test('program: finishing writes a history entry and the program becomes history', () => {
  const o = perfect();
  const p = { id: 'maintain4', started: S };
  eq(programStatus(p, '2026-10-28', data(o)).finished, false);
  const st = programStatus(p, '2026-10-29', data(o));
  eq(st.finished, true);
  eq(st.weeksHit, 4);
  const entry = finishedEntry(p, data(o));
  eq(JSON.stringify(entry), JSON.stringify({ id: 'maintain4', started: S, ended: '2026-10-28', weeksHit: 4 }));
  eq(entryCompleted(entry), true);
  eq(finishedCount([entry, { ...entry, early: true }]), 1, 'ended-early programs are not "finished"');
  // missing a week still finishes, with fewer weeks hit
  const partial = finishedEntry(p, data({ ...o, weights: o.weights.slice(3) }));
  eq(partial.weeksHit, 3);
  eq(entryCompleted(partial), true);
});

test('program: ending early keeps only the weeks already hit and never counts as finished', () => {
  const o = perfect();
  const p = { id: 'maintain4', started: S };
  const e = endedEntry(p, '2026-10-17', data(o));
  eq(e.ended, '2026-10-17');
  eq(e.weeksHit, 2, 'weeks 1 and 2 were over; week 3 was still running');
  eq(e.early, true);
  eq(entryCompleted(e), false);
  eq(entryCompleted(endedEntry(p, '2026-10-28', data(o))), false, 'even on the last day');
  eq(endedEntry(p, '2026-10-02', data(o)).weeksHit, 0);
});

test('program: the completion summary has weeks hit, weight change, workouts and PRs', () => {
  const o = perfect();
  const entry = finishedEntry({ id: 'maintain4', started: S }, data(o));
  const drift = series('2026-09-30', 30, (i) => 100 - i * 0.1);
  const s = summaryFor(entry, { series: drift, workouts: [...o.workouts, done('2026-11-03', { prs: [{}, {}] })] });
  eq(s.weeksHit, 4);
  eq(s.weeks, 4);
  eq(s.workouts, 12, 'a workout after the program is not counted');
  eq(s.prs, 4);
  near(s.changeKg, -2.8, 1e-6, 'trend at the end minus the trend before the start');
  eq(summaryFor(entry, {}).changeKg, null);
});

// ---------- XP ----------
test('xp: +50 per week hit and +250 for finishing', () => {
  eq(FINISH_XP, 250);
  eq(WEEK_XP, 50);
  const full = { id: 'maintain4', started: S, ended: '2026-10-28', weeksHit: 4 };
  eq(programXP({ history: [full], missionsStart: S }), 450);
  eq(programXP({ history: [{ ...full, weeksHit: 1 }], missionsStart: S }), 300);
  eq(programXP({ history: [{ id: 'maintain4', started: S, ended: '2026-10-17', weeksHit: 2, early: true }], missionsStart: S }), 100, 'ended early: no finish bonus');
  eq(programXP({ history: [full, { ...full, id: 'cut4', started: '2026-12-01', ended: '2026-12-28', weeksHit: 0 }], missionsStart: S }), 700, 'programs add up');
});

test('xp: never retroactive, and missions must have started', () => {
  const full = { id: 'maintain4', started: S, ended: '2026-10-28', weeksHit: 4 };
  eq(programXP({ history: [full], missionsStart: '2026-10-02' }), 0, 'started before missions did');
  eq(programXP({ history: [full], missionsStart: null }), 0);
  eq(programXP({ history: [full] }), 0);
  eq(programXP({ history: [{ id: 'nope', started: S, ended: S, weeksHit: 9 }], missionsStart: S }), 0, 'unknown programs pay nothing');
  const o = perfect();
  const act = programStatus({ id: 'maintain4', started: S }, '2026-10-15', data(o));
  eq(programXP({ active: act, missionsStart: S }), 100, 'weeks already hit pay while the program runs');
  eq(programXP({ active: act, missionsStart: '2026-10-05' }), 0);
  const over = programStatus({ id: 'maintain4', started: S }, '2026-10-29', data(o));
  eq(programXP({ active: over, missionsStart: S }), 450, 'a finished program not yet in history pays the same as once it is');
  eq(programXP({ history: [finishedEntry({ id: 'maintain4', started: S }, data(o))], missionsStart: S }), 450);
});

test('xp: bonus XP reaches the total and the level through awardsFor', () => {
  eq(awardsFor([], [], 3, { bonusXP: 450 }).total, 450);
  const badges = programBadges([{ id: 'maintain4', started: S, ended: '2026-10-28', weeksHit: 4 }], {});
  const a = awardsFor([], [], 3, { bonusXP: 450, extraBadges: badges });
  eq(a.badges.filter((b) => b.extra && b.earned).length, 1);
  eq(a.total, 450, 'a program badge adds no extra +100');
});

// ---------- badges, history, one at a time ----------
test('badges: Cut Kickoff, Recomp and Steady State come from finished programs only', () => {
  const none = programBadges([], {});
  eq(none.map((b) => b.name).join(), 'Cut Kickoff,Recomp,Steady State');
  eq(none.every((b) => !b.earned), true);
  const fin = { id: 'cut4', started: S, ended: '2026-10-28', weeksHit: 2 };
  const got = programBadges([fin], {});
  eq(got[0].earned.at, '2026-10-28T12:00:00');
  eq(got[1].earned, null);
  eq(programBadges([{ ...fin, early: true }], {})[0].earned, null, 'ended early: no badge');
  eq(programBadges([], { pg_recomp8: '2026-09-01T12:00:00' })[1].earned.at, '2026-09-01T12:00:00', 'once seen it stays');
  for (const id of PROGRAM_BADGE_IDS) assert(BADGE_ART[id], `${id} has badge art`);
  eq(PROGRAM_BADGE_IDS.size, 3);
});

test('one program at a time', () => {
  eq(canStart({}, 'cut4'), true);
  eq(canStart({ body_program: null }, 'recomp8'), true);
  eq(canStart({ body_program: { id: 'cut4', started: S } }, 'maintain4'), false, 'one is running');
  eq(canStart({ body_program: { id: 'cut4', started: S } }, 'cut4'), false);
  eq(canStart({}, 'nope'), false);
  eq(canStart(null, 'cut4'), true);
  // after it ends (history, body_program null) another can start
  eq(canStart({ body_program: null, body_program_history: [{ id: 'cut4', started: S, ended: '2026-10-05', weeksHit: 0, early: true }] }, 'cut4'), true);
});

test('program: the first sentence of each plain-words description matches its goals', () => {
  for (const d of Object.values(PROGRAMS)) {
    assert(d.plain.startsWith('Each week:'), d.id);
    assert(d.plain.includes(`weigh in ${d.weighDays} days`), `${d.id} says how many weigh-ins`);
    assert(localDay(Date.now()) > '2025', 'sanity');
  }
});
