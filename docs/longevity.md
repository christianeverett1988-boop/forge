# Long term and Longevity (Progress → Score)

Added in v0.13.0. Replaces Withings+'s Long-term assessment and Health Tab. Everything is worked out on the phone from data Forge already stores (`health_daily`, `body_measures`, `weights`, your profile). No new keys, functions or rules. General fitness information, not medical advice, and nothing is ever compared with other people.

## Long term

- **Weekly Forge Score.** Each week gets the mean of two day scores (the week's last day and the day three days before it). Every day score already looks back over a week, so two samples are enough and a year costs about 104 scores instead of 365 (about 30 ms on a laptop for 400 days of synthetic data; `weeklyScores` in `js/health/longterm.js`). Results are cached per session and recomputed only when the data or the day changes. Days use the same pillars and weights as the main score (`scoreSamples` in `js/health/score.js`), and a day only counts when at least 3 pillars have data.
- **Range:** 90 days or 1 year. The sparkline is a 3-week rolling mean of the weekly points.
- **Sentence:** compares the average of the latest two weeks with the first two weeks in the range. A change under 2 points reads "About the same as 3 months ago" (or "a year ago"); otherwise "Up N points since July" / "Down N points since July".
- **Pillar rows:** one per pillar with a value in at least 3 weeks, change in points and an arrow (↑ ↓ → with a 2-point dead zone). Pillars with no data are left out.
- **Gate:** at least 4 weeks with a score; before that, "Your long-term view starts after 4 weeks of data (N so far)."

## Longevity cards

A card appears only when the metric has a reading in the last 90 days. With none, a single line explains what sends them.

| Card | Source | Good direction |
|---|---|---|
| Cardio fitness (VO₂max) | `health_daily.vo2max` and `body_measures` `metrics.vo2max`, merged per day | up |
| Resting heart rate | `health_daily.rhr_bpm` | down |
| HRV | `health_daily.hrv_sdnn_ms` | up, against your own usual |
| Visceral fat | `metrics.visceral_fat` | down |
| FFMI | `metrics.fat_free_mass_kg` ÷ height² | up |

- **VO₂max merge:** one value per day. If both sources have the day, the newest reading wins: the scale's `measured_at` against the Apple row's `updated_at` when it has one. Without an Apple timestamp the scale's reading wins, because it is timestamped.
- **Band for age and sex** (needs `profile.sex` and `profile.age`; otherwise no band): the Cooper Institute / ACSM fitness categories (Low, Below average, Average, Good, Excellent, Superior) from `VO2_CUTS` in `js/health/longevity.js`. These are approximate transcriptions of the published table (Cooper Institute, *Physical Fitness Assessments and Norms for Adults and Law Enforcement*; ACSM's Guidelines for Exercise Testing and Prescription) and should be checked against the source before anyone relies on them. The screen calls the band an estimate.
- **Sublines on Cardio fitness:** resting heart rate and vascular age (`metrics.vascular_age`) when present.
- **90-day trend:** the Theil–Sen slope and Mann–Kendall test from `js/health/trends.js` over 90 days. It needs 6 readings (`MIN_POINTS`) in the window, so two readings never make a trend. Trend words follow the metric's good direction ("Going down, which is the right way"). The 90-day change is the mean of the latest two weeks of readings minus the mean of the first two weeks, and is only shown when there is a trend's worth of readings.
- **HRV:** the last 7 days against the 28 days before, ±5% is "about your usual". Wording: "Higher than your usual, which is generally good."
- **FFMI:** fat-free mass (kg) ÷ height (m)², with the Kyle 2003 bands already used by the Body Profile (`CUTS` in `js/health/bodyprofile.js`; see `docs/trends.md`). Fat-free mass is shown in your unit setting.
- Tapping a card opens `#/metric/<key>`.
