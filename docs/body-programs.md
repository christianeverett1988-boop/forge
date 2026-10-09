# Body programs (v0.14.0)

Multi-week programs on top of missions and XP: **Cut kickoff**, **Recomp** and **Maintenance**. They replace
Withings+ Programs (addendum 3 §A.2). Everything is derived on the device from weights, workouts, cardio and
Apple Health; the only stored state is in `settings/main`. No rules, functions or keys change.
Code: `js/body-programs/` (`core.js` is pure; `store.js` reads state; `ui.js` draws the cards) and
`js/screens/program.js` (`#/program`). Tests: `tests/bodyprograms.test.js`.

## The programs

| id | Name | Weeks | Recommended for goal | Weekly goals |
|---|---|---|---|---|
| `cut4` | Cut kickoff | 4 | `lose` | Weigh in 5+ days · hit planned training days · average steps ≥ target · weight trend inside the safe pace |
| `recomp8` | Recomp | 8 | `recomp`, `muscle` | Weigh in 4+ days · hit training days · 2+ workouts with a PR or a step up · weight within ±0.25% a week |
| `maintain4` | Maintenance | 4 | anything else | Weigh in 3+ days · hit training days · weight within ±0.3% a week |

- **Weeks run from the start day**, not the calendar week. A program started on a Thursday has weeks Thu–Wed.
  The program is over the day after its last week; that day is when it becomes history.
- **Training days:** distinct days with a finished workout or a 20+ minute cardio session, against `profile.trainingDays`.
- **Steps** are an average over the week's finished days (today's row is still filling up, so a week in progress
  ignores it). The goal is hidden when there are no Apple Health days at all, like the steps mission. Target: the
  missions' steps target (Settings → Missions).
- **PR or a step up:** a finished workout counts when it has a PR (`w.prs`), or an exercise's top weight went up
  since the last time it was trained, or the reps at the same top weight did. First-time exercises and deload
  workouts don't count.
- **Weight trend:** the smoothed trend (`weightSeries()`), from the last reading before the week (else the first
  inside it) to the last reading so far, scaled to a full week. It needs at least 3 days between readings, and
  until then the goal shows "Weigh in a few more times" and isn't done.
- **Safe pace (cut):** from `computeTargets(profile).pacePct` (default 0.5%/week if the profile isn't losing),
  the band is the pace × 0.5 to × 1.5, never above the safety caps (1%/week, or 1.5% with the profile's fast-pace
  override). Shown in the user's units, e.g. "losing 0.5–1.5 lb a week". Too slow and too fast both miss.
  The cut can't start when the safety checks say no deficit (under 18, underweight).
- **Protein** isn't a goal. The food log hasn't merged (#33): `weekGoals` in `core.js` has a comment where a
  `protein` goal goes (use `idx.protein` and `targets.proteinG`, as the missions do).

## Flow

- **Body tab → Programs:** the three programs with one line and their length; the one for your goal says
  "Recommended". Tap one for a confirm sheet in plain words, then **Start** saves
  `settings/main.body_program = { id, started: 'YYYY-MM-DD' }`. One at a time: while one runs the card links to it.
- **Today:** under the missions card, "Cut kickoff · Week 2 of 4 · 2 of 3 goals so far" opens `#/program`.
- **`#/program`:** a ring for the whole program (by days), a row per week (✓ hit, half-filled partly, the current
  week live), this week's goals with progress and a bar for the weight pace, and a quiet **End program** link
  with a confirm.
- **Finishing** (app.js → `settleProgram`, once everything has loaded): the program moves to
  `settings/main.body_program_history` as `{ id, started, ended, weeksHit }` and `body_program` becomes `null`.
  Today then shows a completion card once: the badge, the name, "+250 XP" and "3 of 4 weeks fully hit · weight
  down 3.2 lb · 14 workouts · 5 PRs". It is saved to `awards_seen` once it has been on screen for a moment, or
  dismissed, or "See awards" is tapped (same as the mission badge cards).
- **Ending early:** the entry gets `early: true`. Weeks already hit keep their XP; there is no finish bonus and no badge.
- **Awards:** a "Programs · N finished" card, and the three badges in the grid.

## XP and badges

- **+50 XP** for each week with every goal hit, **+250 XP** for finishing. Badges: **Cut Kickoff**, **Recomp**,
  **Steady State**, earned by finishing the program (no extra +100 badge XP on top).
- XP goes through `bonusXP` like missions (`awards-store.js` adds `programBonusXP()`). Only programs started on or
  after `missions_started` pay, and starting one saves `missions_started` first, so nothing is ever retroactive.
- A finished program that hasn't been moved to history yet pays the same as once it is, so the total never jumps.

## Settings fields

| Field | Meaning |
|---|---|
| `body_program` | `{ id, started }` for the running program, else `null` |
| `body_program_history` | `[{ id, started, ended, weeksHit, early? }]` |
| `awards_seen.pg_cut4` / `pg_recomp8` / `pg_maintain4` | program badges once seen |
