# Trends, insights, weekly report, goal path and Body Profile (v0.7.0, W2b)

Everything here is worked out **on the phone** from data already in Firestore (`weights`, `body_measures`,
`health_daily`, `workouts`, `cardio_sessions`, `profile`). Nothing new is stored except one field on the
existing `settings/main` document (`insight_dismissed`). No Cloud Functions or rules are involved.

Code: `js/health/trends.js`, `anomalies.js`, `insights.js`, `weekly.js`, `goalpath.js`, `bodyprofile.js`
(all pure and unit-tested in `tests/trends.test.js`); `intel.js` reads app state; `cards.js` builds the HTML.

## 1. Trend engine

For each metric and each window of **7, 28 and 90 days** ending today:

1. Take the daily values inside the window. Fewer than **6** points → `enough: false` ("not enough data").
2. **Theil–Sen slope** = the median of all pairwise slopes `(yj − yi) / (xj − xi)`, x in days. Shown per week (× 7).
3. **Mann–Kendall** on the values in time order:
   `S = Σ sign(yj − yi)` over i < j;
   `Var(S) = [ n(n−1)(2n+5) − Σ t(t−1)(2t+5) ] / 18` (t = size of each group of tied values);
   `z = (S − 1)/√Var` if S > 0, `(S + 1)/√Var` if S < 0, else 0; two-sided `p = 2(1 − Φ(|z|))` (normal approximation).
4. The trend **counts** only when `p < 0.05` **and** `|slope per week| >` the metric's noise floor. Otherwise
   `direction` is `flat`. Output: `{ metric, window, slopePerWeek, p, direction: 'up' | 'down' | 'flat', enough }`.

Noise floors (per week) are `noise_floor_per_week` in `data/metrics.json`; `NOISE_FLOOR` in `trends.js` mirrors
them so the code works before that file loads, and a test fails if they ever differ.

| Metric | Key | Floor / week |
|---|---|---|
| Weight | `weight_kg` | 0.1 kg |
| Body fat | `fat_ratio_pct` | 0.25 points |
| Fat mass | `fat_mass_kg` | 0.15 kg |
| Fat-free mass | `fat_free_mass_kg` | 0.15 kg |
| Muscle | `muscle_mass_kg` | 0.15 kg |
| Water | `hydration_kg` | 0.2 kg |
| Visceral fat | `visceral_fat` | 0.1 |
| Standing HR | `heart_pulse_bpm` | 0.5 bpm |
| HRV | `hrv_sdnn_ms` | 1 ms |
| Resting HR | `rhr_bpm` | 0.5 bpm |
| Sleep | `sleep_min` | 5 min |
| Steps | `steps` | 300 |
| Exercise minutes | `exercise_min` | 3 min |

**Colour.** On the Trends screen an arrow is green or red only where "good" is unambiguous for your goal
(`goodDirection` in `trends.js`): weight (lose/recomp: down, muscle: up, otherwise grey), fat %, fat mass and
visceral fat (down, except when building muscle), fat-free mass and muscle (up), resting and standing HR (down),
HRV, sleep, steps and exercise (up). Water is always grey.

## 2. Anomaly rules (`THRESHOLDS` in `anomalies.js`)

| Rule | Fires when |
|---|---|
| Likely water | Latest weight is more than **1.5 %** off the EWMA trend of the day before, and body water moved the **same way** (at least 0.2 kg vs. its 14-day mean). |
| Bioimpedance noise | Body fat % moved by more than **2 points** since the previous reading (≤ 2 days earlier). |
| HRV down | The **7-day mean** HRV is **≥ 15 %** below the 28 days before it (needs ≥ 4 recent and ≥ 10 baseline readings). |
| Resting HR up | Resting HR is **≥ 5 bpm** above the median of the 28 days before the run, for **3 or more days in a row** ending today or yesterday. |
| Wrist temperature up | Temperature delta **≥ 0.5 °C** for **2 or more nights in a row** ending today or yesterday. |
| Short sleep | Asleep **under 6 h** for **3 nights in a row** ending today or yesterday. |
| No weigh-in | **7 days** since the last one, but only if your median gap between weigh-ins over the 8 weeks before was **≤ 7 days** (and there were at least 4). |

Single-day rules only look at readings from the last 2 days.

## 3. Insight cards

* Candidates: each significant 28-day trend (90 days for visceral fat), cross-metric cards, and firing anomalies.
* **Cross-metric** (fat mass with fat-free mass, or muscle): *Nice cut* (fat down, lean steady), *Losing fat and building
  muscle*, *Some muscle may be going too*, *Fat is up and lean mass is down*, and *Gaining muscle and some fat* (muscle goal).
  A cross card replaces the two single-metric cards it covers.
* **Rank** = `severity × 0.5^(age in days / 7)`. Trend severity is `0.15 + 0.08 × (|slope| / noise floor)` (+0.1 if it works
  against your goal), capped at 0.7. Anomaly severities: water 0.25, fat noise 0.2, no weigh-in 0.4, sleep 0.6, HRV 0.5–1,
  resting HR 0.6–1, temperature 0.8. Ties break by id. The **top 3** show on Today and Body.
* **Wording** is templates only (no AI): *what*, *why* and *try*. Heart-rate and temperature cards add
  "Not medical advice. If you feel unwell, talk to a doctor."
* **Dismiss** hides a card for 7 days: `settings/main.insight_dismissed = { cardId: 'YYYY-MM-DD' (hidden until) }`. Old entries are pruned on every write, so the field never grows past the cards hidden right now.
  A trend card's id includes its direction, so a reversed trend comes back at once.

## 4. Weekly report (Progress → Week)

* Weeks are **Monday to Sunday in the phone's local calendar**, worked on date keys so a daylight-saving change
  can't shift a day. A workout belongs to the local day it started.
* The report is for the **last full week**; on a **Sunday** it is the week so far. Today shows a card on Sunday and Monday. The header then reads "So far this week".
  ‹ › browse back up to 52 weeks.
* Forge Score now vs. the week before (7-day averages from `score.js`, run for the Sunday of each week), with each pillar.
* Weight: trend at the end of the week minus the trend at the end of the week before. Fat mass and fat-free mass: weekly mean vs. the week before.
* Training: workouts done vs. `profile.trainingDays`; volume = Σ weight × reps of finished working sets, vs. the week before; PRs; cardio minutes.
* Recovery: average HRV, resting HR and sleep vs. the week before.
* **Best / worst metric:** for each metric with a clear "good" direction, the change in weekly mean divided by the standard
  deviation of the last 8 weeks of daily values, signed by what is good. Named only if at least 0.25 of a swing.
* **One suggestion**, the first rule that matches: (1) fewer workouts than planned, (2) HRV down ≥ 10 % and resting HR up ≥ 3 bpm,
  (3) sleep under 7 h, (4) losing faster than 1 % of body weight (lose goal), (5) lean mass down more than 0.3 kg (lose goal),
  (6) under 6,000 steps a day, (7) fewer than 3 weigh-ins, (8) otherwise "keep doing what you did".

## 5. Goal path

* Window: the last 28 days of weigh-ins (needs 6+ points over 14+ days).
* Pace: Theil–Sen slope of the daily weights. Residual SD = the SD of the weigh-ins around that line (n − 2); the slope's standard
  error is `SD / √Σ(x − x̄)²`.
* **ETA** = `|goal − current EWMA trend| / |slope|`. **Band (80 %)**: the same with the slope ± 1.2816 standard errors (fast edge = earlier date,
  slow edge = later date; if the slow edge reaches zero the band has no end and it says so).
* Statuses: `reached` (within 0.1 kg), `flat` (under the 0.1 kg/week weight floor), `away` (trend points the wrong way), `far` (more than 5 years),
  `none` (not enough data), `nogoal`. **Only `ok` gets a date.**
* Pace vs. the safe cap: 1 % of body weight a week when losing, 0.5 % when gaining (`nutrition/targets.js`).
* **Energy balance** (needs 4+ fat-mass readings over 14+ days): `(Δfat kg/day × 39.5 MJ + Δfat-free kg/day × 7.6 MJ) × 239 kcal/MJ`
  (energy densities from Hall 2008). Negative = deficit. Shown as an estimate, rounded to 10 kcal.

## 6. Body Profile

* FFMI = fat-free mass ÷ height², FMI = fat mass ÷ height² (kg/m²). One of the two is derived from weight if the scale sent only the other.
* A 4 × 4 grid: FFMI band across (Low, Moderate, Good, High), FMI band up (Low, Healthy, Higher, High). One dot for the latest reading and a
  faint dot for each of the earlier months (the month's average, last 6).
* The idea comes from Kyle UG, Schutz Y, Dupertuis YM, Pichard C. *Body composition interpretation: contributions of the fat-free mass index and
  the body fat mass index.* Nutrition 2003;19:597-604.
* **The cut points are approximate adult bands, not the paper's exact percentile tables, and they are not adjusted for age.**
  They live in one table (`CUTS` in `bodyprofile.js`):

  | | FFMI cuts | FMI cuts |
  |---|---|---|
  | Men | 17.0 / 19.0 / 21.0 | 3.5 / 5.5 / 8.0 |
  | Women | 14.0 / 15.5 / 17.0 | 5.0 / 7.5 / 10.5 |
  | Not stated | midpoint of the two | midpoint of the two |

  If you want the published percentile tables used instead, replace the table; nothing else changes.
