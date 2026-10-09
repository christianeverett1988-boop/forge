# Health summary for your doctor (`#/report`)

Added in v0.13.1. Replaces Withings+'s clinician sharing ("Export a PDF for your doctor", "share with my dietitian"; addendum 3 §A.2/A.3). Open it from **Settings → Your data → Health summary for your doctor**.

Everything is worked out on the phone from data Forge already stores. **Nothing is uploaded or sent anywhere**, there are no new keys, functions, rules or dependencies, and the chart is inline SVG. General information, not a medical record.

## The page

- **Range:** 30 days, **90 days (default)** or 1 year. The window is the last N days ending today. The choice is remembered until the app is closed.
- **Buttons** (hidden in print): **Print or save as PDF** calls `window.print()`; on iPhone that opens the share sheet with *Save to Files*. **Share as text** uses `navigator.share` with a compact text version and falls back to copying it.
- **Print layout** (`css/report.css`, `@media print`): black on white, no nav bar, tab bar or buttons, every section kept on one page, aimed at one to two pages on A4 or Letter.
- Each section appears **only if it has data**. Nothing says "not tracked". With no data at all the screen shows one empty state and no buttons.

## Sections

| Section | What it shows | Appears when |
|---|---|---|
| Header | Title, date range, date generated, age, sex (male/female only) and height, and "Measured at home with consumer devices (Withings scale, Apple Watch). Not a medical record." | Always on the page. **No name or email**: the builder reads only `age`, `sex`, `heightCm` from the profile. |
| Weight and body composition | Trend weight start → end and the change per week (only with at least 7 days between the first and last weigh-in, otherwise the total change), latest body fat %, fat-free mass, visceral fat index and FFMI (with its band), and a black-and-white trend chart | any weigh-in or any of those readings in the window |
| Heart and fitness | Resting heart rate (average and trend: Theil–Sen/Mann–Kendall from `trends.js`, "not enough readings" under 6), HRV (average and last 7 days against your usual, from the v0.13.0 `hrvVsUsual`), VO₂max (latest, merged Apple/scale as in `vo2Series`, with the age and sex band when both are known), walking heart rate and SpO₂ averages | any one of them |
| Sleep | Average asleep time, nights recorded, share of nights under 6 h, average bedtime and its spread (standard deviation, midnight-aware: 00:30 counts as later than 23:30). Bedtime needs at least 5 start times. | any night with asleep minutes |
| Activity and training | Average steps, active energy, exercise minutes (per day with data); strength workouts per week and total sessions; cardio minutes per week | any of those. Per-week figures count from the first workout or cardio session in the window, so a new user is not averaged against empty weeks (minimum one week). |
| Forge Score | Average of the weekly scores in the window and each pillar's average, plus "Forge's own 0–100 score. It is not a clinical measure." | at least one weekly score (≥ 3 pillars on a day, as for the Score screen) |
| Notes for the doctor | Neutral flags (below) | at least one flag fires |

The first time HRV, VO₂max and FFMI appear on the page they get a one-line explanation.

## Units

Your units, with metric in brackets for weights when you use pounds: `204.2 lb (92.6 kg)`, changes `−0.9 lb (−0.4 kg)`, height `5′11″ (180 cm)`. Metric users see kg and cm only.

## Notes for the doctor

Wording is neutral and describes the person's own numbers; none of it is a diagnosis. All come from the existing anomaly rules (`anomalies.js`, evaluated as of today) except the last:

- Resting heart rate about N bpm above usual for N days in a row (rule: +5 bpm or more for 3+ days).
- 7-day HRV N% below usual (15% or more below the previous 4 weeks).
- Under 6 hours of sleep for N nights in a row (3 or more).
- Wrist temperature N °C above usual for N nights in a row (+0.5 °C for 2+ nights).
- Under 6 hours on N of M recorded nights, when that is a third or more of at least 7 recorded nights (range-wide, so a short stretch long ago still shows).

## Code

`js/health/clinical.js` (pure builder, text version, unit formatting), `js/health/clinicalview.js` (HTML and chart strings), `js/screens/report.js` (screen, range switch, buttons), `css/report.css`. Tests in `tests/report.test.js` use synthetic data only.
