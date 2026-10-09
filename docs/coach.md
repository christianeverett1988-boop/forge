# Forge Coach, no-AI mode (v0.10.0)

Tap a suggested question, get an answer worked out **on the phone** from your own data. No network, no AI, no new
Firestore collections, nothing stored (the conversation lives in memory until you close the app). This is the
"provider = none" mode from the Health Assistant plan; typing questions comes with the AI coach later.

Code: `js/coach/answers.js` (pure `(data, today) → answer | null`), `lifts.js` (strength blocks), `actions.js`
(what "Do it" does), `data.js` (reads app state, the only impure file), `js/screens/coach.js` (the screen).
Tests: `tests/coach.test.js`. Route: `#/coach`, from the **Ask Coach** card on Today and a row on Progress → Weight.

Every number in an answer comes from an existing module. Coach only words it. A question with no data behind it
returns `null` and its chip is hidden. Every answer has a headline, 2 to 4 short lines and a **Why**. Not medical
advice: the screen carries the usual disclaimer, and the Recovered answer repeats `MEDICAL` from `insights.js`.

| # | Question | Source | Rule |
|---|----------|--------|------|
| 1 | How did last week go? (How is this week going? when the report is partial) | `weeklyReport` (`weekly.js`) | Shown when the report has data. The report week is the same as the Weekly screen (this week on a Sunday, otherwise last full week; the headline says which). Lines: workouts done vs planned, weight trend change, best mover, and the report's own suggestion word for word. |
| 2 | Am I on track for my goal? | `goalPath` (`goalpath.js`) | Hidden with no goal or too few weigh-ins. `ok`: the ETA, the 80% date range, pace vs the safe pace (`MAX_LOSS_PCT`/`MAX_GAIN_PCT`) and what would move the date. Also handles reached, steady, moving away and more than 5 years away. |
| 3 | Why did my weight go up / down? | `trendChange` (`smoothing.js`), `goalPath` swing, `allTrends` | Needs 3+ weigh-ins. The chip says up or down by the latest reading against the trend. "Steady" when the 7-day trend moved less than the weight noise floor. Compares scale vs trend, the usual swing (the goal path's residual SD), training in the report week, a salt/water note, and fat vs lean change per week when both 4-week trends exist. |
| 4 | What should I train today? | `previewPlan` (`plan.js` via Train), `recoveryPct` (`recovery.js`), `readiness` | Needs a plan. Lines: size of the workout, three most recovered muscles, Readiness, deload week. Action: **Start this workout** (`previewPlan` + `startPlan`, the Today Start path). With a workout already open, no action. |
| 5 | Am I recovered? | `readiness` (`readiness.js`), `recoveryPct` | Needs a Readiness verdict or any training. Lines: Readiness reason and top inputs, fresh muscle groups (85% or more, as on the Body tab), least recovered. Action when Readiness is red **and you chose to train as planned**: **Make today lighter** (`overrideReadiness(false)`, which turns Readiness back on). If red and not overridden, today's workout is already the lighter one, and Coach says so. |
| 6 | What's my Forge Score made of? | `forgeScore` (`score.js`) | Needs an overall score (3+ pillars). Lines: each tracked pillar's value, the biggest mover vs the week before, pillars not tracked yet. |
| 7 | Am I getting stronger? | `liftChanges` (`lifts.js`) from `buildIndex` + `e1rm`, `stalledMainLifts` (`plan.js`) | Main lifts (done as `role: main` in the last 16 weeks). Estimated 1RM (Epley) is the best in each 4-week block: now = last 28 days, compared with the block 4 weeks earlier and the block 12 weeks earlier. Deload sessions are left out. Hidden until a lift has two blocks. Action when a main lift is stalled: **Start a deload week** (`startDeload`, behind a confirm sheet). |

## Accept or reject

Actions never run on their own. Each shows "Coach suggests: ..." with **Do it** and **Not now**. Deload also asks
in a confirm sheet. The three actions only call functions the app already has (`startPlan`, `overrideReadiness`,
`startDeload`); `tests/coach.test.js` spies on them.
