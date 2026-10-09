// Daily missions, their XP, and the weigh-in / body-comp badges (js/missions/*.js). Synthetic data only.
import { test, eq, assert } from './harness.js';
import { indexDays, missionsFor, missionXP, dayXP, allDone, weekDots, localDay, parseClock, MISSION_XP, ALL_DONE_XP } from '../js/missions/core.js';
import { streakDays, compFirstDay, missionBadges } from '../js/missions/badges.js';
import { awardsFor, XP_RULES } from '../js/workouts/awards.js';

const at = (day, h = 12, m = 0) => { const [y, mo, d] = day.split('-').map(Number); return new Date(y, mo - 1, d, h, m).toISOString(); };
const D = '2026-10-09';
const ids = (list) => list.map((m) => m.id).join();
const get = (list, id) => list.find((m) => m.id === id);
const doneW = (day, h = 12) => ({ id: `w${day}${h}`, status: 'done', started_at: at(day, h), exercises: [] });
const health = (day, o = {}) => ({ id: day, steps: 0, ...o });
const run = (day, data, opts) => missionsFor(day, indexDays(data), opts);

test('missions: weigh in counts weights and body measures, not deleted or "is this you?" ones', () => {
  eq(get(run(D, {}), 'weigh').done, false);
  eq(get(run(D, { weights: [{ day: D, kg: 80 }] }), 'weigh').done, true);
  eq(get(run(D, { bodyMeasures: [{ day: D, metrics: {} }] }), 'weigh').done, true, 'a Withings reading completes it');
  eq(get(run(D, { weights: [{ day: D, kg: 80, deleted: true }] }), 'weigh').done, false);
  eq(get(run(D, { weights: [{ day: D, kg: 80, review: true }] }), 'weigh').done, false);
  eq(get(run(D, { weights: [{ day: '2026-10-08', kg: 80 }] }), 'weigh').done, false, 'yesterday does not count');
});

test('missions: train or move uses the local day, completed workouts and 20+ min of cardio', () => {
  eq(get(run(D, { workouts: [doneW(D)] }), 'train').done, true);
  eq(get(run(D, { workouts: [{ ...doneW(D), status: 'active' }] }), 'train').done, false, 'an unfinished workout is not done');
  eq(get(run(D, { workouts: [{ ...doneW(D), deleted: true }] }), 'train').done, false);
  eq(get(run(D, { cardio: [{ started_at: at(D, 7), duration_min: 20 }] }), 'train').done, true);
  eq(get(run(D, { cardio: [{ started_at: at(D, 7), duration_min: 19 }] }), 'train').done, false, 'cardio under 20 min');
  eq(get(run(D, { cardio: [{ started_at: at(D, 7), duration_min: 30, deleted: true }] }), 'train').done, false);
  // local-day boundaries: 23:59 and 00:00 are different days
  eq(get(run(D, { workouts: [doneW('2026-10-08', 23)] }), 'train').done, false);
  eq(get(run(D, { workouts: [{ ...doneW(D), started_at: at(D, 0, 0) }] }), 'train').done, true);
  eq(get(run('2026-10-08', { workouts: [{ ...doneW(D), started_at: at(D, 0, 0) }] }), 'train').done, false);
  eq(localDay(at(D, 23, 59)), D);
});

test('missions: rest day asks for a walk, and a workout or cardio still completes it', () => {
  const rest = get(run(D, {}, { restDay: true }), 'train');
  eq(rest.label, 'Rest day: a 20-min walk counts');
  eq(rest.done, false);
  eq(get(run(D, { cardio: [{ started_at: at(D, 8), duration_min: 25 }] }, { restDay: true }), 'train').done, true);
  eq(get(run(D, {}, { restDay: false }), 'train').label, 'Train or move');
});

test('missions: steps need Apple Health data and reach the target', () => {
  eq(ids(run(D, {})), 'weigh,train', 'no Apple Health data: steps and bed are hidden');
  const hd = [health(D, { steps: 6240 })];
  const s = get(run(D, { healthDaily: hd }), 'steps');
  eq(s.done, false);
  eq(s.progress.value, 6240);
  eq(s.progress.target, 8000);
  eq(get(run(D, { healthDaily: [health(D, { steps: 8000 })] }), 'steps').done, true);
  eq(get(run(D, { healthDaily: [health(D, { steps: 9000 })] }, { targets: { steps: 10000 } }), 'steps').done, false, 'custom target');
  eq(get(run(D, { healthDaily: [health('2026-10-08', { steps: 9000 })] }), 'steps').progress.value, 0, 'data exists but not for today yet');
  eq(get(run(D, { healthDaily: [{ ...health(D, { steps: 9000 }), deleted: true }] }), 'steps'), undefined, 'only deleted rows: hidden');
});

test('missions: in bed on time compares last night\'s start with the target, past midnight is late', () => {
  const night = (start) => run(D, { healthDaily: [health(D, { sleep: { asleep_min: 420, in_bed_start: start } })] });
  eq(get(night(at('2026-10-08', 22, 40)), 'bed').done, true);
  eq(get(night(at('2026-10-08', 23, 0)), 'bed').done, true, 'exactly on time');
  eq(get(night(at('2026-10-08', 23, 1)), 'bed').done, false);
  eq(get(night(at(D, 0, 30)), 'bed').done, false, '00:30 is after 23:00');
  eq(get(night(at('2026-10-08', 21, 0)), 'bed').done, true);
  eq(get(run(D, { healthDaily: [health(D, { sleep: { asleep_min: 420 } })] }), 'bed'), undefined, 'no start time: hidden, not guessed');
  eq(get(run(D, { healthDaily: [health(D)] }), 'bed'), undefined, 'no sleep data: hidden');
  eq(get(run(D, { healthDaily: [health(D, { sleep: { in_bed_start: at(D, 0, 30) } })] }, { targets: { bed: '00:45' } }), 'bed').done, true, 'a bedtime target after midnight');
  eq(get(night(at('2026-10-08', 23, 0)), 'bed').label, 'In bed by 11:00 PM');
  eq(parseClock('23:00'), 1380);
  eq(parseClock('25:00'), null);
});

test('missions: protein is hidden without food logs and turns on with them', () => {
  const t = { proteinG: 150 };
  eq(ids(run(D, {}, { targets: t })), 'weigh,train');
  eq(ids(run(D, { foodLogs: [] }, { targets: t })), 'weigh,train', 'an empty list is the same as none');
  const logs = [{ day: D, protein_g: 100 }, { day: D, protein_g: 40 }, { day: '2026-10-08', protein_g: 200 }];
  const p = get(run(D, { foodLogs: logs }, { targets: t }), 'protein');
  eq(p.done, false);
  eq(p.progress.value, 140);
  eq(get(run(D, { foodLogs: [...logs, { day: D, protein_g: 10 }] }, { targets: t }), 'protein').done, true);
  eq(get(run(D, { foodLogs: [{ day: D, protein_g: 200, deleted: true }] }, { targets: t }), 'protein').done, false);
});

test('missions: at most four a day', () => {
  const day = run(D, {
    healthDaily: [health(D, { sleep: { in_bed_start: at('2026-10-08', 22) } })],
    foodLogs: [{ day: D, protein_g: 10 }],
  }, { targets: { proteinG: 100 } });
  eq(day.length, 4);
  eq(ids(day), 'weigh,train,protein,steps');
});

test('xp: +20 per mission and +30 when all are done', () => {
  const all = run(D, { weights: [{ day: D }], workouts: [doneW(D)] });
  eq(allDone(all), true);
  eq(dayXP(all), 2 * MISSION_XP + ALL_DONE_XP);
  const one = run(D, { weights: [{ day: D }] });
  eq(dayXP(one), MISSION_XP);
  eq(dayXP([]), 0, 'no missions is not "all done"');
  const four = run(D, { weights: [{ day: D }], workouts: [doneW(D)], healthDaily: [health(D, { steps: 9000, sleep: { in_bed_start: at('2026-10-08', 22) } })] });
  eq(dayXP(four), 110, 'four of four: 80 + 30');
});

test('xp: counted only from missions_started, through today', () => {
  const idx = indexDays({ weights: [{ day: '2026-10-07' }, { day: '2026-10-08' }, { day: D }] });
  eq(missionXP(null, D, idx), 0, 'not started: nothing');
  eq(missionXP('2026-10-08', D, idx), 2 * MISSION_XP, 'the 7th is before the start');
  eq(missionXP(D, D, idx), MISSION_XP);
  eq(missionXP('2026-10-10', D, idx), 0, 'a start in the future counts nothing');
});

test('xp: mission XP is part of the total and the level', () => {
  const base = awardsFor([], [], 3);
  const withM = awardsFor([], [], 3, { bonusXP: 300 });
  eq(withM.total, base.total + 300);
  eq(withM.level.level > base.level.level, true, '300 XP is past level 1');
  eq(awardsFor([], [], 3, { extraBadges: [{ id: 'wi7', name: 'x', how: 'y', earned: null }] }).badges.at(-1).id, 'wi7');
  assert(/mission/i.test(XP_RULES), 'the rules text mentions missions');
});

test('missions: the week dots count only days since the start', () => {
  const idx = indexDays({ weights: [{ day: D }, { day: '2026-10-08' }], workouts: [doneW(D)] });
  const w = weekDots(D, idx, {}, '2026-10-08');
  eq(w.length, 7);
  eq(w[6].all, true);
  eq(w[5].done, 1);
  eq(w[5].all, false);
  eq(w[4].counted, false);
});

// ---- badges ----
const days = (from, n, skip = []) => Array.from({ length: n }, (_, i) => localDay(new Date(2026, 8, 1 + from + i, 12))).filter((d) => !skip.includes(d));

test('badges: weigh-in streaks of 7, 30 and 100 days, a missed day starts over', () => {
  const week = streakDays(days(0, 7));
  eq(week[7], '2026-09-07');
  eq(week[30], undefined);
  eq(streakDays(days(0, 6))[7], undefined, '6 days is not 7');
  const missed = streakDays(days(0, 14, ['2026-09-05']));
  eq(missed[7], '2026-09-12', 'day 5 missing: the run restarts at the 6th and reaches 7 on the 12th');
  const long = streakDays(days(0, 100));
  eq(long[30], '2026-09-30');
  eq(long[100], '2026-12-09');
  eq(streakDays([...days(0, 29), ...days(29, 10)])[30], '2026-09-30', 'no gap: 30 in a row');
  eq(streakDays([...days(0, 29), ...days(31, 5)])[30], undefined, 'one missed day breaks it');
  eq(streakDays([...days(0, 7), ...days(0, 7)])[7], '2026-09-07', 'duplicates are ignored');
});

const comp = (key, vals) => vals.map(([i, v]) => ({ day: localDay(new Date(2026, 8, 1 + i, 12)), metrics: { [key]: v } }));

test('badges: body-fat drop is judged against the first 14-day average', () => {
  // first 14 days ~ 25%, then a 7-day average ~ 23.9 => 1 point down, not 2
  const m = comp('fat_ratio_pct', [[0, 25.2], [3, 24.8], [7, 25], [13, 25], [20, 24], [21, 23.8], [22, 23.9]]);
  const bd = missionBadges({ bodyMeasures: m });
  const by = Object.fromEntries(bd.map((b) => [b.id, b]));
  assert(by.bf1.earned, '1 point earned');
  eq(by.bf2.earned, null);
  eq(by.bf5.earned, null);
  eq(by.bf1.earned.at.slice(0, 10), '2026-09-21', 'the first day the 7-day average is 1 point down');
  const big = missionBadges({ bodyMeasures: comp('fat_ratio_pct', [[0, 30], [13, 30], [30, 27.9], [31, 27.8], [32, 27.7]]) });
  assert(big.find((b) => b.id === 'bf2').earned, '2 points earned');
  eq(big.find((b) => b.id === 'bf5').earned, null);
  // a drop inside the baseline window can't earn it
  eq(compFirstDay([{ day: '2026-09-01', v: 30 }, { day: '2026-09-05', v: 20 }], { drop: 1 }), null);
  eq(compFirstDay([], { drop: 1 }), null);
});

test('badges: +1 kg lean mass, and nothing without body_measures', () => {
  const m = comp('fat_free_mass_kg', [[0, 60], [10, 60.2], [20, 61.1], [21, 61.2], [22, 61]]);
  assert(missionBadges({ bodyMeasures: m }).find((b) => b.id === 'lean1').earned, 'lean mass earned');
  const none = missionBadges({ weighDays: days(0, 3) });
  eq(none.filter((b) => ['bf1', 'bf2', 'bf5', 'lean1'].includes(b.id)).every((b) => b.earned === null), true);
  const deleted = comp('fat_free_mass_kg', [[0, 60], [20, 62], [21, 62]]).map((d) => ({ ...d, deleted: true }));
  eq(missionBadges({ bodyMeasures: deleted }).find((b) => b.id === 'lean1').earned, null);
});

test('badges: once seen they stay earned, even if the data no longer unlocks them', () => {
  const b = missionBadges({ seen: { wi7: '2026-09-07T12:00:00', first: 'x' } });
  eq(b.find((x) => x.id === 'wi7').earned.at, '2026-09-07T12:00:00');
  eq(b.find((x) => x.id === 'wi30').earned, null);
});
