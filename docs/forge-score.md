# Forge Score and Readiness

Where the numbers come from. The code is `js/health/score.js` (Forge Score) and `js/health/readiness.js` (Readiness); the unit tests are in `tests/health.test.js`. Every mapping below is a **piecewise-linear function**: the listed points are joined by straight lines and the value stays flat beyond the first and last point.

Sources: where a number comes from a published guideline it says so. **Forge default** means a number I chose to behave sensibly, not a clinical threshold. Nothing here is medical advice, and the score is only ever compared with *your own* earlier weeks.

## How the score is built

- Each day gets a score from 0 to 100. The app shows the **average of the last 7 days**.
- Five pillars, each the weighted mean of its components. Pillar weights (shown in the app): **Body 25%, Recovery 20%, Sleep 15%, Training 25%, Nutrition 15%**.
- A component without enough data is left out, and so is a pillar with no components. The remaining weights are scaled up to add to 100% (never scored as zero). **Nutrition** is "not tracked yet" until food logging (Checkpoint C), so for now its 15% is shared among the other four (Body 29.4%, Recovery 23.5%, Sleep 17.6%, Training 29.4% when all four are present).
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
| **HRV** | z-score of the 7-day mean of ln(SDNN) vs baseline | z: `[-2,0] [0,100]` (z ≥ 0 is 100) | Brief B.9; ln(SDNN) is the common practice for HRV trends |
| **Resting heart rate** | z-score of the 7-day mean vs baseline, sign flipped (higher is worse) | z: `[-2,0] [0,100]` | Brief B.9 |
| **Wrist temperature** | 7-day mean of \|delta\| in °C (the delta is from your own baseline) | `[0.5,100] [1,0]` | Forge default (brief B.9) |
| **Breathing rate** | z-score of the 7-day mean vs baseline, sign flipped | z: `[-2,0] [0,100]` | Brief B.9 |

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

Not tracked yet. It lights up with food logging: days logged ÷ 7, calories within ±10% of target, protein at or above target (1.6–2.2 g/kg, brief §5.4).

## Readiness (Green / Amber / Red)

Computed each morning from `health_daily`. It needs **14 days** of overnight data (HRV, resting heart rate or sleep) in the 28 days before today; the Apple Health export import provides them on day one. Until then Today shows how many days it has.

1. For each signal take today's value (or yesterday's if today's hasn't arrived) and z-score it against the previous 28 days: **HRV** (ln SDNN, higher is better), **resting heart rate** (lower is better), **sleep duration** (more is better), **|wrist temperature delta|** (closer to your normal is better), **breathing rate** (lower is better). Each z is flipped so positive always means better, then limited to ±3. A signal needs 8+ baseline values.
2. Signal weights (Forge default): HRV 0.35, resting HR 0.25, sleep 0.20, temperature 0.10, breathing 0.10. Missing signals are left out and the rest re-weighted. HRV or resting HR must be present.
3. **Training load:** the mean of your three most-fatigued muscles right now (`fatigueAt` in `js/workouts/recovery.js`, in hard-set units), divided by 6 and limited to 0–1, times **0.5**, is subtracted. Heavy training yesterday costs up to half a standard deviation.
4. **Result:** composite below **−1.25 = Red**, below **−0.5 = Amber**, otherwise **Green**. A wrist-temperature delta of 1 °C or more (either direction) is at least Amber on its own. These cut-offs are Forge defaults.
5. **Reason:** the biggest drag when Amber/Red (or "you trained hard yesterday" when training is the main cost and no body signal is clearly off); the best thing going for you when Green.

**What it changes:** *Amber* takes one set (never below 1) off every accessory. *Red* turns the day into a short, easy session (the same lighter targets as a deload week, and it's kept out of progression like a deload) and suggests mobility or a walk instead; **Train as planned anyway** on Today overrides it for the rest of the day.
