# Forge Score and Readiness

Where the numbers come from. The code is `js/health/score.js` (Forge Score) and `js/health/readiness.js` (Readiness); the unit tests are in `tests/health.test.js`. Every mapping below is a **piecewise-linear function**: the listed points are joined by straight lines and the value stays flat beyond the first and last point.

Sources: where a number comes from a published guideline it says so. **Forge default** means a number I chose to behave sensibly, not a clinical threshold. Nothing here is medical advice, and the score is only ever compared with *your own* earlier weeks.

## How the score is built

- Each day gets a score from 0 to 100. The app shows the **average of the last 7 days**.
- Five pillars, each the weighted mean of its components. Pillar weights (shown in the app): **Body 25%, Recovery 20%, Sleep 15%, Training 25%, Nutrition 15%**.
- A component without enough data is left out, and so is a pillar with no components. The remaining weights are scaled up to add to 100% (never scored as zero). **Nutrition** is "not tracked yet" until you have logged food on 3 of the last 7 days; until then its 15% is shared among the pillars that have data (Body 29.4%, Recovery 23.5%, Sleep 17.6%, Training 29.4% when all four are present).
- **No overall score from fewer than 3 pillars.** Body + Training alone (no Watch data) isn't a picture of you, so Forge shows "Based on 2 of 5 parts" and an invitation to add Apple Health instead of a number.
- **What moved it** compares each component's average over the last 7 days with the 7 days before, weights the change by how much that component counts in the whole score, and shows the top 3.

Notation: `x → y` points, e.g. `[0, 0] [10, 100]`.

## Body (25%)

Equal weight for each component that has data.

| Component | Input (x) | Points (x → score) | Source |
|---|---|---|---|
| **Weight pace** | 28-day slope of your smoothed weight trend, as % of body weight per week. Needs 4+ points over 14+ days. Goal *lose*: x = % lost; *muscle*: x = % gained; *recomp / endurance / health*: x = \|%\| | lose: `[-1,0] [0,40] [0.25,85] [0.5,100] [1,100] [1.5,50] [2,0]` · muscle: `[-0.5,0] [0,40] [0.1,85] [0.25,100] [0.5,100] [0.75,50] [1,0]` · recomp: `[0,100] [0.3,85] [0.75,40] [1.5,0]` · hold: `[0,100] [0.25,85] [0.5,50] [1,0]` | Forge default, shaped by the brief's safe pace (≤ ~1% of body weight a week, and Forge's own caps: `MAX_LOSS_PCT` 1.0, `MAX_GAIN_PCT` 0.5 in `js/nutrition/targets.js`) |
| **Fat-mass trend** | Theil–Sen slope of `fat_mass_kg` from the scale (kg/week, 28 days, 4+ readings over 14+ days) | lose, recomp: `[-0.4,100] [-0.2,90] [0,50] [0.2,15] [0.4,0]` · muscle: `[-0.5,100] [0.1,100] [0.3,60] [0.6,0]` · other goals (x = \|slope\|): `[0,100] [0.2,70] [0.5,20] [0.8,0]` | Forge default |
| **Lean mass kept** | Theil–Sen slope of fat-free mass (else muscle mass), kg/week | `[-0.5,0] [-0.1,100]`: −0.1 kg/week or better is 100 | Brief B.9 (≥ −0.1 kg/week during a cut = 100); the slide to 0 is a Forge default |
| **Fat mass index** | Latest `fat_mass_kg` (within 21 days) ÷ height². Needs height and sex (male/female) in your profile | male: `[1.5,40] [3,100] [6,100] [9,50] [13,0]` · female: `[3,40] [5,100] [9,100] [13,50] [17,0]` (kg/m²) | The FMI idea is from Kyle et al. 2003 (brief S60); the exact bands are a **Forge default** based on commonly quoted "healthy" FMI ranges (men about 3–6, women about 5–9). Please check them against the paper |

## Recovery (20%)

Uses `health_daily` (Apple Health). "Baseline" = the 28 days that end 7 days before the day being scored (needs 10+ values). Each signal needs 3+ values in the last 7 days. The spread used in the z-score never drops below a floor (HRV 0.06 in ln units, resting HR 1.5 bpm, breathing 0.6/min) so a very steady baseline can't make one ordinary day look extreme.

| Component | Input | Points | Source |
|---|---|---|---|
| **HRV** | z-score of the 7-day mean of ln(SDNN) vs baseline | z: `[-2,0] [0,75] [1,100]` (at your usual = 75, so there is room to improve; +1 SD or better is 100) | Brief B.9; ln(SDNN) is the common practice for HRV trends. The 75 at z = 0 is a Forge default |
| **Resting heart rate** | z-score of the 7-day mean vs baseline, sign flipped (higher is worse) | z: `[-2,0] [0,75] [1,100]` | Brief B.9 |
| **Wrist temperature** | 7-day mean of \|delta\| in °C (the delta is from your own baseline) | `[0.5,100] [1,0]` | Forge default (brief B.9) |
| **Breathing rate** | z-score of the 7-day mean vs baseline, sign flipped | z: `[-2,0] [0,75] [1,100]` | Brief B.9 |

**Same definitions for the Shortcut and the export.** Overnight signals (HRV, resting heart rate, breathing rate, wrist temperature, SpO₂) use only readings that **end before 11:00 am**, so a normal day's HRV is the night's, not a daytime mean. The export import applies that rule, and the Shortcut filters the same way. Daily totals (steps, active energy, exercise minutes) are Health's own de-duplicated per-day totals: the export picks the one source with the most for each day, and the Shortcut uses *Group By Day*. The morning run sends yesterday's finished totals as `steps_yesterday`, `active_kcal_yesterday` and `exercise_min_yesterday`; Forge stores them on the day before. The evening run sends only today's totals, so it can't overwrite the overnight signals.

## Sleep (15%)

Component weights: duration 40%, regularity 40%, Deep+REM share 20% ("light weight, 20%" in the brief). Needs 3+ nights in the last 7 (regularity 4+).

| Component | Input | Points | Source |
|---|---|---|---|
| **Time asleep** | 7-day mean minutes asleep | `[240,0] [360,55] [420,100]` (7 h or more = 100) | Adults: 7 or more hours a night, Watson et al. 2015 (AASM/SRS consensus statement); the slope below 7 h is a Forge default |
| **Regular bedtime** | SD of the sleep midpoint over the week, minutes | `[30,100] [90,0]` | Brief B.9 (≤ 30 min = 100); the 90 min end is a Forge default |
| **Deep + REM share** | (deep + REM) ÷ time asleep, 7-day mean | `[0.2,0] [0.35,100]` | Forge default (typical adult sleep has roughly a third or more in deep + REM) |

## Training (25%)

Equal weights. All windows end on the day being scored.

| Component | Input | Points | Source |
|---|---|---|---|
| **Workouts done** | Days with a finished workout or cardio session in the last 7 days ÷ your planned training days (Profile), capped at 1 | `[0,0] [1,100]` | Forge (brief B.9 "workouts done vs. planned") |
| **Activity** | Mean of: exercise minutes in 7 days (Apple Health, else the minutes you logged in Forge) and, when Apple Health has it, average steps a day | minutes: `[0,0] [150,100]` · steps: `[2000,0] [8000,100]` | 150 min a week: WHO 2020 guidelines on physical activity (150–300 min moderate). Steps: Forge default (about 8,000 a day is a widely used target) |
| **Training balance** | Hard (working) sets this week ÷ your average week over the last 28 days. Needs 3 weeks of history and an average of 3+ sets | `[0,0] [0.4,20] [0.8,100] [1.3,100] [1.6,50] [2,0]` | The acute:chronic idea, with the 0.8–1.3 band: Forge default (brief B.9) |
| **Strength trend** | Slope of the best estimated 1-rep max (Epley) per session on each main lift (3+ sessions over 14+ days, last 8 weeks), as % per week, averaged over lifts | `[-1.5,0] [0,60] [0.5,100]` | Forge default |

## Nutrition (15%)

Uses the food log (`docs/food.md`). **It only counts once at least 3 of the 7 days ending on the day scored have food logged** (a day counts if its entries add up to more than 0 kcal); before that it stays "not tracked yet". Targets are the daily calories and protein shown on Today. Without a profile (no targets) only the first component is scored.

| Component | Input | Points | Source |
|---|---|---|---|
| **Days logged** | Logged days out of the last 7 | `[0,0] [7,100]` | Brief B.9 |
| **Calories near target** | Per logged day, \|eaten ÷ target − 1\|; the component is the mean over logged days | `[0.1,100] [0.3,0]`: within ±10% = 100, 30% off = 0 | Brief B.9 (±10%); the slide to 0 is a Forge default |
| **Protein** | Per logged day, protein ÷ target; mean over logged days | `[0.5,0] [1,100]`: at or over target = 100 | Brief B.9 (protein ≥ target; the target is 1.6–2.2 g/kg, brief §5.4); the slide is a Forge default |

Only logged days are judged, so a day you didn't log never counts as "0 kcal"; "Days logged" is what rewards logging. A day with only a snack logged does count as logged, which can pull "Calories near target" down. That is deliberate: partial logging should look partial.

## Readiness (Green / Amber / Red)

Computed each morning from `health_daily`. It needs **14 days** of overnight data (HRV, resting heart rate or sleep) in the 28 days before today; the Apple Health export import provides them on day one. Until then Today shows how many days it has.

0. **Only this morning's data steers the day.** If HRV and resting heart rate aren't from today yet, Today shows yesterday's verdict marked "waiting for this morning's data", and the workout generator ignores it.
1. For each signal take today's value (or yesterday's if today's hasn't arrived) and z-score it against the previous 28 days: **HRV** (ln SDNN, higher is better), **resting heart rate** (lower is better), **sleep duration** (more is better), **|wrist temperature delta|** (closer to your normal is better), **breathing rate** (lower is better). Each z is flipped so positive always means better, then limited to ±3. A signal needs 8+ baseline values.
2. Signal weights (Forge default): HRV 0.35, resting HR 0.25, sleep 0.20, temperature 0.10, breathing 0.10. Missing signals are left out and the rest re-weighted. HRV or resting HR must be present.
3. **Training load:** the mean of your three most-fatigued muscles right now (`fatigueAt` in `js/workouts/recovery.js`, in hard-set units), divided by 6 and limited to 0–1, times **0.5**, is subtracted. Heavy training yesterday costs up to half a standard deviation.
4. **Result:** composite below **−1.25 = Red**, below **−0.5 = Amber**, otherwise **Green**. A wrist-temperature delta of 1 °C or more (either direction) is at least Amber on its own. These cut-offs are Forge defaults.
5. **Reason:** the biggest drag when Amber/Red (or "you trained hard yesterday" when training is the main cost and no body signal is clearly off); the best thing going for you when Green.

**What it changes:** *Amber* takes one set (never below 1) off every accessory. *Red* turns the day into a short, easy session (the same lighter targets as a deload week, and it's kept out of progression like a deload) and suggests mobility or a walk instead; **Train as planned anyway** on Today overrides it for the rest of the day.
