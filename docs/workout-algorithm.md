# How Forge builds your workouts

Everything here is deterministic (no AI). The same inputs always give the same workout. Code: `js/workouts/` — `recovery.js`, `progression.js`, `programs.js`, `generator.js`. Tests: `tests/workouts.test.js`.

## 1. Exercise library

- 280 curated exercises in `js/workouts/exercises.js`. Each has a movement pattern, primary and secondary muscles, load type, rep range, 2–3 form cues (written for this app), injury tags, and the equipment it needs.
- **Equipment needs are a list of alternatives.** An exercise is available if any one alternative is fully owned at the active location. `[[]]` means no equipment, so it's available everywhere. Some items stand in for others: an adjustable bench counts as a flat bench, and a power rack counts as a pull-up bar.
- **Calisthenics progression chains** (push-up, pull-up, muscle-up, dip, squat, hinge, L-sit, handstand, core, ab wheel) are ordered steps from easiest to hardest. The no-equipment steps are available at every location.
- **Credit:** 177 entries link to [free-exercise-db](https://github.com/yuhonas/free-exercise-db) by Yuhonas, which is public domain (Unlicense). The links are for full step-by-step instructions. Cues are original.

## 2. Per-muscle recovery (`recovery.js`)

- Every completed working set adds fatigue to its muscles: **1.0 for primary, 0.5 for secondary**.
- That amount is multiplied by effort, from reps in reserve (RIR): RIR 2 = 1.0, failure = 1.3, RIR 4+ = 0.7, not logged = 1.0. Conditioning counts half. Warm-up sets don't count.
- **Fatigue decays exponentially.** It's about 90% gone after **72 h for big muscles** (quads, hamstrings, glutes, chest, lats, upper back, lower back) and **48 h for small ones**. The time constant is hours ÷ ln 10.
- Recovery % = 100 × (1 − fatigue ÷ 10), floored at 0. Ten hard sets right now take a muscle to 0%. More volume means more fatigue.

## 3. Choosing today's day (`generator.js → pickDayType`)

- **Fixed programs** rotate their days in order.
- **Smart mode** picks a split from your training days per week: 3 or fewer gives full body A/B/C, 4 gives upper/lower, and 5 or more gives push/pull/legs.
- Smart mode then picks the day type whose main muscles have the highest average recovery. Repeating yesterday's day costs a 15-point penalty.

## 4. Filling each slot (`pickExercise`)

Each day is a list of slots. A slot lists movement patterns in order of preference and a role: main, secondary, or accessory.

**Candidates must:**
- match the pattern;
- be doable with the **active location's equipment**;
- not be excluded by you;
- not carry an injury tag from your profile note ("shoulder", "knee", and so on);
- be at your level or below (beginners and intermediates get up to level 2);
- for chains, be the chain step you're currently on.

If a pattern has no candidates, the slot tries its next pattern.

**Pinned exercises** (5×5 lifts) go through the same filters: injury tags, "never suggest", and the level cap. If a pin fails, the slot falls back to its movement patterns. If nothing in those patterns is safe for your note (every overhead press carries the shoulder tag, so with your shoulder note 5×5 day B has no press), the slot is left out and the session notes say exactly which one and why, so you can add something back yourself. **Exercises you picked yourself** in Build my own are always kept; if one carries a tag from your injury note, it shows a warning instead.

**Scoring** (highest wins, ties broken by id):

| Factor | Effect |
|---|---|
| Load type for the role | Main lifts prefer barbell, then dumbbell. Accessories prefer cable, dumbbell, or machine. |
| Compound vs isolation | Main and secondary slots get +20 for compounds. |
| **Continuity** | +40 if you did this exercise in the last 28 days in a main or secondary slot, so your main lifts stay the same long enough to progress. |
| **Variety** | −15 for an accessory done in the last 3 days. |
| Recovery | + 0.2 × average recovery % of its primary muscles. |
| Timed holds | −25 in main or secondary slots (a wall sit shouldn’t be your main squat). |
| Favorites | +15. |
| Level | −6 per level above your experience (easier moves aren’t penalized). |
| Home program | Templates marked "home" strongly prefer dumbbell, kettlebell, bodyweight, and band. |

**Chain step:** the generator uses the step you trained most recently. If you've never done the chain, it starts about a third of the way up for beginners, halfway for intermediates, and 70% of the way for advanced.

**Session length:** sets cost about 3.5 min (main), 3 min (secondary), or 2 min (accessory), and timed work costs its duration plus 1 min. Accessories are dropped from the end until the session fits your length. Sessions of 45 minutes or less pair the remaining accessories into supersets.

## 5. Progressive overload (`progression.js → nextTarget`)

The generator works in your display unit so steps are round numbers. It looks at your **last non-deload session** of the exercise (deload weeks are deliberately light, so they never become the baseline):

1. **First time:** no weight is suggested. Pick a weight you could do for the top of the range plus 2, and do the top of the range. If the location has a short list of weights you own, the note lists them.
2. **Not every set at the top of the rep range:** keep the same weight and the number of sets you've built up, and aim for one more rep on your weakest set (**double progression**).
3. **Every set at the top:** move to the next weight if either is true:
   - it's a **normal small step**: +5 lb upper body / +10 lb lower body on a barbell (2.5 / 5 kg), +5 lb (2.5 kg) on machines and cables, or a next owned dumbbell or kettlebell no more than 5 lb heavier; or
   - your last session **predicts you can hit the bottom of the range at the next weight** (estimated 1RM, Epley, reps capped at 30).

   Dumbbells and kettlebells use the **weights you own at this location**; the YMCA uses a standard rack in 5 lb steps. Reps reset to the bottom of the range.
4. **The next weight is too big a jump for now** (for example 5 → 30 lb at home), or there's nothing heavier. Progression climbs a one-way ladder at the same weight:
   - **reps**, up to 8 past the top of the range, keeping your current set count;
   - then **one more set** at those reps, up to 5;
   - then **slower tempo** (3–4 second lowering and a pause).

   **Tempo escape (0.3.0):** tempo used to be a dead end. Now, once you've maxed out the ladder for **3 sessions** at the same weight, the app checks the next weight up again: if your last session predicts at least **5 reps** there (Epley), it moves you up and aims for the bottom of the range (never below 5 reps). 30 → 40 lb dumbbells gets there; 5 → 30 lb never does, so you stay on tempo until you own something in between.

   Each step keeps what you've already earned, so it can't loop back. Tests simulate 40 sessions in a row to prove it.
5. **Two sessions in a row below the bottom of the range at the same weight:**
   - drop about 10% and build back up, **if** you own something within 20% lighter;
   - otherwise (30 lb when the next one down is 5 lb) keep the weight and aim for the bottom of the range.
6. **Bodyweight, band, and timed work:** add reps (or 5 seconds). At the top of the range, the app offers the next chain step, such as "Ready to try diamond push-ups?" You choose whether to switch.

**Stall:** the same top weight for 3 non-deload sessions with no rep gain flags a stall.

## 6. Deloads

- **Planned:** the last week of every cycle. A cycle is 6 weeks for beginners, 5 for intermediates, and 4 for advanced, counted from when you started the program.
- **On demand:** when 2 or more main lifts are stalled, Train offers a deload week you can accept.
- **During a deload:**
  - half the sets (rounded up), reps at the bottom of the range, and stop with 3+ reps in reserve;
  - about 10% lighter if you own something within 20% lighter; otherwise the **same weight** (never 30 → 5 lb).
- **Deload workouts are saved with `deload: true`.** They count for PRs, charts and History, but progression and stall checks skip them, so the week after a deload picks up from your pre-deload numbers.

## 7. Warm-ups, plates, PRs

- **Warm-ups** come before the first loaded compounds.
  - Barbell: empty bar × 10, then 40% × 5, 60% × 3, and 80% × 2, rounded to 5 lb and only if lighter than your working weight.
  - Dumbbells and kettlebells: one set of 8 with the heaviest owned weight at or under 65% of working weight.
  - Machine or cable: 50% × 8.
- **Plate calculator:** greedy per-side plates (45/35/25/10/5/2.5 lb or 25/20/15/10/5/2.5/1.25 kg) on a 45 lb / 20 kg bar. It shows anything left over that can't be loaded.
- **Estimated 1RM:** Epley formula, weight × (1 + reps ÷ 30), only for sets of 12 reps or fewer.
- **PRs:**
  - a higher estimated 1RM;
  - your heaviest weight;
  - **more reps at a weight you've used before**, which matters with fixed dumbbells;
  - the most reps (bodyweight);
  - the longest hold (timed).
