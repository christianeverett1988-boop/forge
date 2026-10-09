# Changelog

## 0.8.0 — Weekly progress photos (2026-10-09)

No Cloud Functions, `firestore.rules`, `firebase.json` or `config.js` changes; nothing to redeploy or publish.

- **Your photos never leave your phone.** They are kept in a private store on this iPhone (one per signed-in account, so two people sharing a phone never see each other's). Nothing is uploaded, nothing syncs, no Forge server ever sees them.
- **Location and camera details are removed.** Every photo is redrawn and saved fresh (longest side 1600 px), which drops GPS and EXIF. A test checks this.
- **Body → Progress photos.** Take Front, Side and Back (each one is optional), from the camera or your library. Your last photo of that pose shows faintly so you can line up. Add a note; your weight trend for that date shows beside it (it is not saved with the photo).
- **Compare** any two dates for a pose: side by side, or drag a divider across the picture. Under each: weight trend, fat mass if your scale reads it, and the days between.
- **Time-lapse:** pick a pose and a range. Where your phone can record video (MP4 on newer iPhones, WebM elsewhere) you get a short video; otherwise a photo strip with every date and weight on it. Share it or save it.
- **Weekly reminder:** a small card on Today from your chosen day (Sunday unless you change it) until you take the week's photos. You can hide it for the week, or turn it off in Settings → Progress photos. It only shows once you have taken a first set.
- **Look after your photos:** delete one photo or a whole set; Settings → Progress photos has *Export all photos (zip)* as your backup and *Delete all photos on this phone*. Forge asks the phone not to clear them when space is tight. Deleting your Forge account also removes them from this phone.
- An "AI analysis" row is shown switched off for later. Nothing is sent anywhere.
- Not in this version: pinch-zoom while comparing.

## 0.7.0 — Trends, insights, weekly report, goal path and Body Profile (W2b) (2026-10-09)

No Cloud Functions, `firestore.rules`, `firebase.json` or `config.js` changes; nothing to redeploy or publish. Everything is worked out on your phone from the data you already have.

- **Progress → Trends:** every number in one grouped list (weight, body fat, fat mass, fat-free mass, muscle, water, visceral fat, standing heart rate, HRV, resting heart rate, sleep, steps, exercise minutes) with a tiny chart, today's value and how it moved per week over the last 4 weeks. An arrow only counts when the change is real (not just day-to-day wobble). Green or red shows only where it's clear what's good for your goal; the rest stays grey. Tap one for its chart.
- **Progress now has four tabs:** Weight · Trends · Score · Week. History and Awards moved to two rows at the bottom of Weight (they didn't fit next to the switcher at phone width).
- **Metric screens** switch between 7, 28, 90 days, 1 year and All, compare this period with the one before, and say in a sentence which way it's going. HRV, resting heart rate, sleep, steps and exercise minutes have their own screens too.
- **Insight cards** on Today and Body: at most three, picked by how much they matter and how recent they are. Each says what's happening, why, and one thing to try. Tap for the chart; the close button hides it for 7 days (old hides are tidied away automatically). Examples: "Likely water. Your trend hasn't changed.", "Nice cut" (fat down, muscle steady), HRV low for a week, resting heart rate up for 3 days, short sleep three nights running, wrist temperature up for two nights, or a long gap since your last weigh-in. Heart-rate and temperature cards remind you it isn't medical advice.
- **Progress → Week (weekly report):** Monday to Sunday, in your own time zone (on Sunday it says "so far this week"). Forge Score and each part vs. the week before, weight and body-fat changes, workouts done vs. planned, total weight lifted, PRs, cardio minutes, average HRV, resting heart rate and sleep, your best and worst number, and one suggestion for next week. The arrows browse older weeks. Share sends a short text summary. On Sunday and Monday Today shows a small card for it.
- **Goal path** on Body and Weight (replaces the old "around this date" line): your date to reach your goal weight with a likely range, your pace next to the usual safe limit, and, if your scale reads body composition, an estimate of the daily calorie balance behind your changes. If your trend is going the other way it says so kindly and gives no date.
- **Body Profile** on Body: lean mass and body fat on one 4×4 grid, with a bright dot for now and faint dots for earlier months. Needs your height and fat mass from the scale. The ranges are approximate and not adjusted for age (see `docs/trends.md`).
- Formulas and thresholds are written down in `docs/trends.md`.
- **Review round 1:** the Body Profile grid now fits the card (square cells, labels below, a "You" label on the dot); Today, Weight and Body give one goal date (Today's sentence and the chart's dotted line come from the Goal path); Today shows at most two compact insight cards after Daily targets (tap to open Why / Try; the sleep one is skipped when Readiness already blames sleep); a change too small to show reads "same as last week" with no sign or colour; metric screens show the unit on "vs previous"; the weigh-in list on Weight is called Weigh-ins; Share ends with "Shared from Forge" and falls back to copying; Body Profile cut points follow the commonly used FMI scheme; the training-sets control is a switch.
- **Review round 2:** the compact insight cards on Today stay closed until tapped (a global `[hidden] { display: none !important }` in `css/app.css` stops any class that sets `display` from showing a hidden element).

## 0.6.0 — A new look: near-black, calm and premium (2026-10-09)

No Cloud Functions, `firestore.rules`, `firebase.json` or `config.js` changes; nothing to redeploy. (This is Part B of issue #18, the visual restyle.)

- **One look, one place.** All colours, corner sizes, spacing and shadows now come from a single file (`css/tokens.css`). A test fails if a stray colour code shows up anywhere else.
- **Light mode.** If your phone is set to Light, Forge follows it (Today, Settings and everything else). Dark is still the default look. Text stays readable in both.
- **Softer cards, less clutter.** Cards have no outlines, big rounded corners and a hint of light on top. Section titles are plain sentence case instead of ALL CAPS. Lists look like iPhone Settings: rows with thin dividers and arrows.
- **Less lime.** Normal buttons are white pills. Lime is kept for the one main action on a screen (Start, Done set, Save), the active tab, progress, rings and records. Chips are quiet grey pills that tint when chosen, and the segmented controls (Units, Guided/List…) have a grey thumb that slides.
- **Real switches in Settings.** Sound effects and Haptic tick are iPhone switches, so they tick when you flip them.
- **No more emoji as icons.** Every icon is now drawn in the same clean style (tools, location pin, delete, warnings, flame, trophy, menu, pause, close, arrows). A test keeps emoji out of the screens.
- **Big numbers get the spotlight.** The weight trend, daily calories, the Forge Score and the Readiness card have larger numbers with a green-lime gradient and a soft glow. Everything else stays black, white and grey.
- **Friendly empty screens.** Weight, History, Body, Awards, the exercise search and Locations each show an icon, a line, a short hint and one button when there is nothing yet.
- **Toasts and pull to refresh.** Toasts are frosted capsules with an optional icon. Pull down at the top of Today, Progress or Body to refresh (it also asks Withings for new weigh-ins when connected).
- **Swipe back shows the screen behind.** Swiping from the left edge now reveals the previous screen sliding in behind, like iOS.
- **Review fixes.** The Today weight keeps its number and unit on one line (small unit). Metric → Weight uses the weights you logged by hand when the scale sent nothing, and the empty state leads with Log weight. Pull to refresh waits at most 8 seconds and asks Withings at most once every 2 minutes. The “Add a location” list looks tappable (grouped rows with arrows). Withings and Apple Health intros are short with a “Learn more”. Buttons stay on one line (shorter labels). The favourite star is an SVG icon too.
- **Home-screen icon** now has a proper 192 size for Android (maskable).

## 0.5.2 — Feels like an iPhone app: shell, navigation and motion (2026-10-09)

No Cloud Functions, `firestore.rules`, `firebase.json` or `config.js` changes; nothing to redeploy. (This is Part A of issue #18. The full visual restyle is Part B, later.)

- **No more web-page behaviour.** The page no longer rubber-bands, chrome (tabs, buttons, cards) can't be selected or long-pressed, taps have no delay, and a test makes sure form fields stay at 16px so iOS never zooms in. The background is near-black from the very first frame (no white flash), and the first screen is a grey skeleton of the page instead of a spinner.
- **New top and bottom bars.** Every screen has a big 34pt title that shrinks into a frosted bar as you scroll. Detail screens (Locations, Withings, Data check, Exercises, Timer, Metrics) get a **‹ Back** button, and swiping from the left edge goes back too. The tab bar is properly see-through with a hairline on top, and has new filled/outline icons (Settings is sliders now, not a sun). Tapping the tab you're on scrolls to the top, or returns to that tab's first screen.
- **The always-on "Synced" pill is gone.** You only see "Saving…" or "Offline" in the top bar, plus a short note if you stay offline for a few seconds. The update prompt is now a small "Update available · Reload" capsule.
- **Progress has one header.** Weight, History, Score and Awards share the "Progress" title with the switcher underneath.
- **Screen changes feel native.** Detail screens slide in from the right over the old one (which slides back and dims); going back reverses it; switching tabs crossfades. Each tab remembers its scroll position. Phones without the animation API get a quick fade instead.
- **Sheets you can drag.** Sheets have a grabber and frosted header, follow your finger, close with a flick or a long pull, and slide away smoothly with the backdrop fading along.
- **Motion polish.** One set of timings and spring curves everywhere; everything tappable dips slightly when pressed. Weight trend, calories, Forge Score and other numbers count up once per visit (tabular figures, so they don't jitter). Tabs, segmented controls and records give the haptic tick when Settings → Haptic tick is on. Reduced Motion turns all of this into plain fades.
- Review fixes: the collapsed top bar now truly blurs what scrolls under it; the back button shows the parent's title ("‹ Settings") and the duplicate in-page back links are gone; the Locations editor drives the top bar (its name, "‹ Locations" back to the list); swipe-back keeps the tab bar visible, moves a full-height screen over a dim scrim that lightens as you drag, and with Reduced Motion simply goes back with a crossfade.
- Manifest now has an `id` and the maskable icon for 192 and 512.

## 0.5.1 — Add a location from a preset (2026-10-09)

No Cloud Functions, `firestore.rules` or `config.js` changes; nothing to redeploy.

- **Settings → Locations → + Add a location** now asks what kind first: **YMCA**, **Travel / no equipment**, **Home gym** or **Custom (start empty)**. A preset comes with its equipment and weights, then opens so you can rename it or turn things off. If you already have one, it's marked **Add another**. Custom works as before.

## 0.5.0 — Apple Health, Readiness and the Forge Score (W2a) (2026-10-09)

**Cloud Functions changed** (`npm --prefix functions install`, then `firebase deploy --only functions`; four new functions, no new secrets). **`firestore.rules` and `config.js` are unchanged**, so there's nothing to republish.

**Apple Health bridge**
- **Settings → Apple Health:** *Create Shortcut token* (shown once, with a Copy button), *Make a new token* (the old one stops working at once) and *Turn it off*. Step-by-step Shortcut recipe (window "yesterday 6 pm → now", POST JSON to `healthIngest`), the *Sleep → Waking Up* automation set to Run Immediately, and an optional evening run. Notes on what iPhone can't share (ECG; wrist temperature on some iOS versions). Uses your existing Apple devices and accounts; nothing new to sign up for.
- **`healthIngest`** (POST, `Authorization: Bearer <token>`): the token is hashed (SHA-256) and looked up; only the hash is stored (`users/{uid}/private/shortcut`, `shortcut_tokens/{hash}`), never returned or logged. The payload is validated field by field and capped at 256 KB (401 / 413 / 400, with no health values in replies or logs). Late and duplicate posts merge into the same `health_daily/{day}`: newer non-empty fields win, nothing is erased by an empty value, and an unchanged post writes nothing. Accepts what Shortcuts really sends: numbers as text, lists of samples (Forge averages or adds them), sleep and workouts as lines of text.
- **`createShortcutToken`, `revokeShortcutToken`, `importHealthDays`** (signed-in callables). "Delete everything" also removes the token and the Apple status.
- **Data check:** the Apple Health screen shows the latest day, when the Shortcut and the import last ran, each kind of data (HRV, resting HR, sleep, wrist temperature, breathing, blood oxygen, steps, energy, exercise minutes, cardio fitness, workouts) with how many of the last 28 days have it, and progress toward the 14 days Readiness needs. `users/{uid}/integrations/apple` holds the status (no secrets, no values).
- **Health export import:** pick `export.zip` (or `export.xml`). Forge streams `export.xml` out of the zip **on the phone** (it never loads the whole zip), turns it into daily summaries for the last 120 days, and sends only those. Steps and energy come from one source per day so iPhone and Watch aren't double counted. Merges with Shortcut days.

**Readiness**
- A **Green / Amber / Red** card on Today with the top reason in plain words and a *Why?* list. z-scores of HRV, resting HR, sleep, |wrist temperature delta| and breathing rate against your own 28 days (needs 14 days), minus a penalty for yesterday's training load. Until then Today shows how far along it is.
- **Feeds the workout generator:** Amber takes one set off every accessory; Red makes a short, easy day (kept out of progression like a deload) and suggests mobility or a walk, with **Train as planned anyway** to override.

**Forge Score**
- **Progress → Score:** a 0–100 score shown as a 7-day average, five pillar rings (Body 25%, Recovery 20%, Sleep 15%, Training 25%, Nutrition 15%), a 14-day strip, *What moved it* (top 3 changes vs last week) and tap-through to the raw inputs behind every part. Nutrition reads "not tracked yet" and its weight is shared among the others. A small score card on Today links to it.
- Every mapping, weight and source is written down in **`docs/forge-score.md`** and unit-tested.

**Review fixes (still 0.5.0, before release)**
- **Cloud Functions changed again:** `healthIngest` (tolerant parsing, rate limit, early 413), `maintenance.js`, and one new callable `deleteAppleHealthData`. Redeploy with `firebase deploy --only functions`. `firestore.rules` and `config.js` unchanged.
- **One bad value no longer loses the whole post:** unreadable fields are dropped on their own and named in the reply (`rejected`) and in the Data check; bad sleep and workout lines are skipped. Wrist temperature in °F, `8,532` and `52,5` are understood (also in the export import, via the `degF` unit).
- **Shortcut recipe fixed:** overnight signals only from samples ending before 11 am (same rule as the export); daily totals use *Group By Day* with `*_yesterday` keys stored on the day before; the evening run sends totals only, so it can't replace the morning HRV. Copy chips for every key and URL, a "Copy Bearer + token" button, and an `APPLE_SHORTCUT_URL` slot for a one-tap install link (empty until the Shortcut is shared).
- **Withings "delete synced data" no longer deletes Apple Health.** Apple Health has its own *Delete Apple Health data from Forge* button; Delete everything still removes both.
- **`healthIngest` limits:** 413 before any work, and 30 posts an hour / 200 a day per token (429), counted on the token's own document.
- **Readiness** says "Based on yesterday" and doesn't change today's workout until this morning's data arrives; the *Why?* list actually opens and closes; neutral items are grey; wrist temperature shows in °F for imperial; *Use Readiness again* after an override (stored per account).
- **Forge Score:** no number until 3 of the 5 parts have data (Body + Training alone showed 89); "Based on N of 5 parts"; Recovery at your usual is now 75, not 100, so a Red week can't look great.

## 0.4.4 — weight.csv fixes and a first-run how-to tour (2026-10-08)

Cloud Functions changed (`firebase deploy --only functions`; same steps as 0.4.3, no new secrets). `firestore.rules` and `config.js` are unchanged, so there's nothing to republish.

**Before you use Import weight.csv (M1, M2)**
- **No more false "not safe" after Not me:** the data check now counts every weight.csv reading, including ones you marked "Not me" or deleted, as accounted for (like the API's). Marking the family's imported readings no longer turns a safe verdict into "Your weight.csv has 1084 rows; Forge has 989…".
- **No duplicates if you import first and the Withings history arrives later:** once a history import has finished, any weight.csv reading that Withings now also has (same weight, same minute, whole-hour clock offsets allowed) is removed from weight history, the bulk counts and the data check, and a note says how many. Readings that are only in the export stay. It's the same match the importer uses, and Withings readings you marked "Not me" still cover their csv twin.

**Follow-ups**
- Import toast says how many rows couldn't be read and were skipped.
- Withings task payloads are validated: a backfill task without a numeric year or end time (e.g. one queued by v0.4.0) is dropped instead of chaining empty pages.
- **Sync now** and **Data check** do what the background sync does when Withings refuses the sign-in: one forced refresh, then the "Connect again" banner (they used to just show an error).
- Type 140 is removed from the vascular age request (the row no longer says "asked 155, 140").

**First-run how-to tour**
- A brand-new account sees an 8-step tour once, right after onboarding. Each step puts a spotlight on the real button or card (the rest is dimmed) and explains it in a sentence or two: your week's rings, today's workout, logging your weight by hand, picking a location on Train, starting a workout and the guided screen (Done set, Pause, Swap, How to, what RIR means), Progress, and Settings.
- Big Back / Next buttons at the bottom of the screen (one-handed on iPhone), Skip tour any time, no animation if reduced motion is on.
- Whether it's been seen is saved in the account's profile (`tour`, `tour_seen_at`), so it doesn't come back on a new phone. Existing accounts don't get it automatically.
- **Settings → Show the how-to tour again** plays it for anyone.
- The Withings card on an account that isn't connected says a scale can only link to one Forge account for now and to log weight by hand.

## 0.4.3 — Withings live fixes (2026-10-08)

Includes everything in 0.4.2. Needs `npm --prefix functions install` and `firebase deploy --only functions` (docs/withings.md → Updating to v0.4.3). Rules and `config.js` are unchanged.

**History import**
- **Walks your whole account:** the import used to stop at Jan 7, 2025. It now asks Withings one calendar year at a time, from now back to 2009. It stops only after three empty years at or before 2009, and never goes below 2005. Each run pins its end time, and per-year page counts are set rather than added, so a retried page can't double-count. "Done" and "since …" come from what it actually found.
- **Re-import history** (Settings → Withings) re-runs the import on your existing connection, with no disconnect. It's idempotent: deletions and "Not me" stay. It refuses while an import is already moving.
- **History by year** on the Withings screen shows the import's progress.
- **The data check walks the same yearly windows**, so "Withings has" reflects your whole history. A **By year** table shows Withings vs Forge.
- **Import weight.csv** from a Withings export, for anything the API doesn't return. Readings Forge already has are skipped: same weight at the same minute, allowing whole-hour time-zone offsets. Re-importing adds nothing, and deleted readings aren't revived. Imported readings count as scale weigh-ins in the trend.

**Last weigh-in**
- The history import now sets **Last weigh-in**.
- **Arrived in** says "waiting for your next weigh-in" until a notified weigh-in arrives.

**Family weigh-ins**
- **"Is this you?"** also lists scale readings more than 15% away from your own weight. Your weight is tracked from today backwards, so a child who weighs in more often than you can't take over the reference. These readings stay out of your trend and Body stats until you decide.
- **Bulk actions:**
  - **Not me: everything under ___ lb** suggests a cutoff in the gap and previews the count and date range.
  - **Not me — whole day** clears one day.
- "Not me" readings count as accounted for in the data check.

**Fixes and follow-ups**
- **Data check accounting:**
  - Weigh-ins you deleted or marked "Not me" count as present in "Forge has".
  - "That's me" on a reading without a weight no longer tries to update a weigh-in that doesn't exist.
- **Withings responses:**
  - Status 522 (Withings timeout) is retried.
  - An invalid-token answer gets one forced refresh before asking you to reconnect.
  - A token save that lost a race no longer overwrites the newer token.
  - Type 140 is no longer requested.
- **Readings and maintenance:**
  - Readings are labelled with the model of the scale that took them.
  - Expired sign-in links are cleaned up nightly.
  - Each nightly step runs on its own, so one failure doesn't skip the rest.
- **Verdict:** says "Waiting for N more weigh-ins" when that's all that's left.
- **Weight history:** shows the time of day.
- **VO₂max:** shown as a Body metric.
- **Body CSV:** now includes ESC, NRS and VO₂max.
- **Nav cards:** the chevron sits beside the text again.
- **docs/withings.md:**
  - `npm --prefix functions install` before deploying;
  - the `~/.npm` permission fix;
  - what to do when `googleapis.com` times out (use your phone's hotspot);
  - the re-import steps.

## 0.4.2 — v0.3.2 follow-ups (2026-10-08)

No functions, rules or `config.js` changes; nothing to deploy beyond GitHub Pages.

- **Weekly goal XP with cardio:** when logged cardio completes your week after your last workout (lift Mon/Wed, run Fri), that workout now gets the +100. It's still once a week, and a week with only cardio gives none.
- **Comeback** counts logged cardio as activity, so three weeks of running followed by a lift isn't a "comeback".
- **Share card:**
  - the final number and its unit stay together ("→ 212 lb" no longer leaves "lb" alone on a line);
  - with 4 or more records, a slightly smaller font and one line each fit three before "+N more".
- **Badge art:** the aria-label is escaped.
- **Rules test:** saving `awards_seen` on settings/main is now covered.
- **docs/levels.md:** says honestly that records slow down after the first months.

## 0.4.0 — Withings, body composition, data check (W1) (2026-10-08)

**⚠️ New: Cloud Functions, and rules changed.** This version needs the one-time setup in **[docs/withings.md](docs/withings.md) → Your steps**:
- the Blaze plan with a $2 budget alert;
- Node and the Firebase tools on your Mac;
- the Withings developer app (**log in with your existing Withings account**);
- two secrets you set yourself;
- `firebase deploy --only functions,firestore:rules`.

Until then the app works as before, and Settings → Withings explains what's missing. `config.js` is unchanged.

**Withings sync**
- **Connect:** Settings → Withings → **Connect** → Withings' page (**Log in**, not "Create account") → Allow → back to Forge.
- **History:** your whole Withings history imports in the background.
- **New weigh-ins:** each one arrives on its own a few minutes after you step off. Withings notifies Forge, and Forge fetches through the official API. **Sync now** is there if one doesn't.
- **Everything from Body Comp:** weight, body fat %, fat mass, fat-free mass, muscle, water, bone and standing heart rate, plus visceral fat, BMR, metabolic age, vascular age and nerve scores if the free API returns them. Raw values are kept too, so new types can be decoded later.
- **Trend rule:** when the scale weighs you more than once a day, the trend uses the **earliest** reading. Typed-in weights on a scale day stay in your history but don't move the trend.
- **"Is this you?":** weigh-ins Withings couldn't match to you stay out of the trend until you tap **That's me** (or **Not me**).
- **Deleting sticks:** deleting a Withings weigh-in or measurement in Forge is permanent. The sync never brings it back. Deletions you make in the Withings app (last 90 days) reach Forge within a day. If Withings ever answers with far fewer weigh-ins than Forge has (more than 3, or 20% of the last 90 days), nothing is deleted, and anything removed comes back if Withings lists it again.
- **Disconnect** (optionally deleting the synced data). **Delete everything** now also removes the Withings sign-in and synced data.

**Data check** (Settings → Withings → Data check)
- **One row per metric:**
  - ✅ received: last value, date, count, and the **Withings meastype codes** that came back;
  - ⛔ not on the free API;
  - ➖ not measured by your scale;
  - ⏳ not measured yet.
- **Webhook proof:** median arrival time and weigh-ins seen out of 7.
- **History:** what Withings has vs. what Forge stored, plus a box for your Withings CSV row count.
- **Saved reports:** save a report ("subscribed", "after cancelling") and **Compare** any two.
- **Verdict:** a plain **"Safe to cancel Withings+?"** with the specific blockers.

**Body tab**
- **Body composition** tiles: latest value and 30-day change for every metric the scale sends, plus BMI, FFMI and FMI. A tile older than your latest weigh-in says **as of <date>**, and if your last weigh-ins had no body composition, a note says how to get a reading (barefoot, dry feet on the electrodes).
- **Tap a tile** for its chart: 7/30/90/365 days or all, a 7-day line, the previous period dashed, and "this period vs previous".
- **Muscle** is charted over your **training sets per week**.
- **What is this?** opens an explainer for each metric: what it is, how the scale estimates it, what moves it, typical ranges with sources, accuracy and what to do in Forge. It's our own text, in `data/metrics.json`.
- **Exports:** **Export body measurements (CSV)**, and the JSON export now includes body measurements and the connection status (never tokens).

**Levels:** the top of the curve is slower. XP for level n = 250 × (n − 1)^1.6 + 3 × (n − 1)³. Early levels are about as quick as before (level 5 in about 2 weeks at three workouts a week); Unbreakable now takes about **2 years**, not about 44 weeks. `docs/levels.md` has the table.

**Under the hood**
- **Functions** (`functions/`, Node 22, 2nd gen, us-east1, every function capped at 2 instances): OAuth start and callback, the webhook, a task-queue worker, Sync now, data check, disconnect and daily maintenance. `docs/withings.md` has what each does.
  - **Tokens:** they stay on the server (`users/{uid}/private/withings`). The rotating refresh token is renewed under a short lease and saved before use.
  - **Webhook:** it answers immediately and queues the work, returning 503 only for failures it can see before replying.
  - **History import:** one page per queued task with fixed task ids, so one request is one run. No function is triggered by Firestore writes.
- **Logging:** logs carry only codes, counts and durations, never tokens or health values.
- **Rules:**
  - `body_measures`, `health_daily` and `integrations` are readable by you and written only by functions.
  - You can mark a body measurement or Apple Health day deleted (a tombstone that can't be undone) or confirm a flagged weigh-in. Nothing else.
  - `oauth_states`, `withings_users` and `shortcut_tokens` are closed to everyone.
- **CSP:** one new origin in `connect-src`: `https://us-east1-forge-web-f2351.cloudfunctions.net`. The Connect button works under it, which is tested.
- **Tests:**
  - 155 unit tests (+12: data-check classification and verdict, compare, body formatting and series, CSV, the earliest-weigh-in rule, the level pace);
  - 40 functions tests (decoding, idempotent writes, tombstones, webhook replies, one backfill run per request and a bounded chain, token rotation and lease, OAuth state, data check, maintenance, the reconcile's safety stop, disconnect, log filtering) plus a wiring check of every function in CI;
  - 7 new rules tests, one seeded with exactly what the sync writes (a fixture the functions tests keep in step).

## 0.3.2 — XP, levels, badges, Today rings, share image (2026-10-08)

No database rule changes; just copy the files and push. Everything is worked out on your phone from your saved workouts and cardio. The one new thing saved is the list of badges you've earned (`settings/main.awards_seen`), so a badge never disappears; the existing rules already allow it. Nothing is sent anywhere.

**XP and levels**
- XP per workout:
  - **+10 per working set** (up to 40).
  - **+25 per exercise with 2+ working sets**.
  - **+50 per PR** (up to +200).
  - **+100 for the workout that hits your planned days** for the week.
  - **+100 per badge**.
- Warm-ups earn nothing. A finished workout with no working sets earns nothing and isn't a training day.
- **30 levels**, Spark → Unbreakable, at 250 × (level − 1)^1.6 XP. At three typical sessions a week that's level 10 in about 7 weeks. Full table: `docs/levels.md`. **How XP works** on the Awards tab says the same.
- The summary shows **+XP** with a breakdown (Sets · Exercises · PRs · Weekly goal · Badges), a filling level bar, and a **level-up** moment.

**Streak and badges**
- **Weekly streak:** weeks in a row where you trained on your planned days (Settings → Edit profile & targets → days a week). Logged cardio counts as a day. Miss one week a month and a **freeze** covers it automatically.
- **22 badges, each its own medal:**
  - The metal shows the tier: Ember, Steel, Gold, White heat.
  - The shape shows the family: hexagon for workouts, shield for records, medallion for tonnage, flame for streaks, diamond for the rest.
  - Each has its own engraved icon, and milestones carry their number.
  - Locked badges are grey silhouettes. A new one pops and shines on the summary, and shines again on Awards for 3 days.
- **New badges:**
  - **Full House:** 4+ sets for every major muscle group in one week.
  - **Recovery Respect:** finish a deload-week workout.
  - **Comeback:** train again after 3+ weeks away.
- **Badges stay earned.** Changing your planned days, for example, no longer takes Hot Streak away. On the first run after updating, the badges you already have are saved quietly, with no celebrations.
- **Progress → Awards:** level and XP to the next level, the streak with this week's days and the freeze, and the badge grid (earned first, newest first).

**Today rings** (top of Today)
- **Training:** days this week vs your planned days.
- **Weekly sets:** Push / Pull / Legs vs 10 / 14 / 18 sets each (beginner / intermediate / advanced). Each group counts only up to its own target. In a **deload week** the target is halved and the ring says "deload".
- **Recovery:** how fresh your six big muscles are on average.
- The rings fill on load. Closing Training or Weekly sets gets a **burst** (once a week per ring) and a glow.

**Share image**
- A 1080×1350 card (workout number and date, time, sets, volume, PRs, muscles worked, level, streak, XP) opens the iPhone share sheet, or downloads where sharing files isn't supported. It's drawn on your phone.
- Each PR shows the exercise, then what you beat, wrapped rather than cut off ("+N more records" when there isn't room).
- The image is drawn as soon as the summary opens, and the button says "Preparing image…" until it's ready, so a tap always opens the share sheet.

**Workout preview follow-ups** (from 0.3.1.2)
- **Today's card and Start** use the same plan as Train, including any Replace, Rest timer, Switch or different day you chose there.
- Swapping an exercise mid-workout keeps the rest timer you chose for that slot.

**Player polish** (from the v0.3.0 review)
- **Coach and audio:**
  - Rests are spoken in minutes and seconds ("Rest 2 minutes 30").
  - The "New record" line no longer interrupts.
  - Audio wakes up again after the phone was locked.
- **Records:** one PR card per set, and a new **volume PR** (best weight × reps in a set).
- **Starting weight:**
  - Barbells start at the empty bar.
  - Dumbbells and kettlebells start at what you used earlier today for the same kind of weight, or your lightest.
  - That weight is marked **suggested** (dimmed, with a tag) until you change it.
  - If there's no weight at all, tap **Set weight**.
- **Screen and rest timer:** the screen stays awake during a workout and lets go after 5 minutes paused. A running rest timer survives the app being closed.

**Tests:** 143 (up from 124). They cover:
- the XP plan (caps, the 2-set rule, the weekly-goal bonus with cardio and same-day workouts, badge XP);
- empty workouts;
- badges kept after 3 → 4 planned days;
- Full House, Recovery Respect and Comeback;
- unique art for all 22 badges;
- the rings, including deload;
- rest phrasing and volume PRs.

## 0.3.1.2 — Workout preview (2026-10-08)

No database rule changes; just copy the files and push. (Workouts can now save a `rest_sec` per exercise; the rules already allow it.)

**Train → Today's workout, before you press Start**
- **Chips** for the estimated time and the location, and **"6 exercises · 15 muscles"** next to a mini muscle map.
- A **Warm-up** block: a few minutes of easy cardio and mobility, plus which lifts get lighter ramp-up sets (they're built into the workout).
- **Supersets and circuits** are grouped in a box with their rounds ("Superset A · 3 rounds"), each exercise labelled A1, A2…
- **Thumbnails:** each exercise shows its silhouette at the hardest point, its first demo photo, or its muscle map.
- **⋯ on every exercise:**
  - **Replace** with a similar move you can do here.
  - **History & how-to**: opens How-To scrolled to your history.
  - **Rest timer**: Auto or 1–4 min. It's used for that exercise's working sets in the player and list view; warm-ups keep their short rest, and supersets still go straight from A1 to A2.
- **⇄ Switch** regenerates the workout with the same generator, steering away from what you were just shown. Press again for more options. When nothing else fits it goes back to the recommended picks.
- Edits last until you start, or until you change the location or day.

**Tests:** 124 (up from 119): grouping and muscle counts, Replace and Switch in the generator, and the rest-timer override.

## 0.3.1.1 — Fixes from the v0.3.1 review (2026-10-08)

No database rule changes; just copy the files and push. Includes the demo photos (`media/ex`, 175 exercises) now on main.

**Offline and weak signal**
- The How-To sheet opens straight away instead of waiting for the photo list; the **Figure | Photos** toggle appears when the list arrives (and photo-only exercises switch from the muscle map to their photos).
- Offline with a photo that isn't saved yet: you get the muscle map, not a blank white box. The service worker answers a missing photo with an error instead of hanging, and keeps the photo list (`index.json`) in the photo cache so it works offline.
- The player's demo also falls back to the muscle list if its photos can't load, and redraws once the photo list arrives after a cold start.
- **Download all demo photos** reports real counts ("All 175 saved", "Saved 120 of 175, try again on Wi-Fi", or "Couldn't save the photos"), and an exercise only counts as saved when both of its photos are.

**Silhouette fixes**
- **Bent-over rows** (barbell, Pendlay, dumbbell, kettlebell) pull all the way to the lower ribs, starting with the bar over mid-foot.
- **One-arm dumbbell row** has its own demo: far knee and hand on a bench, near arm rowing.
- **Two dumbbells** where you use two: dumbbell bench, incline, decline and floor press, overhead and seated press, lateral raise, flyes. The fly is drawn from the head end so both arms open visibly. (The curl keeps one, by design.)
- **Cable and band lat pulldowns** are drawn kneeling, as their names say.
- **Dips:** higher bars, so the bent legs clear the floor. **Overhead press** starts with the bar on the collarbones, below the chin.
- Rig: one arm can now work differently from the other (a hand braced on a bench), and benches can sit off to one side.
- 116 templates now (two new); still 221 of 280 exercises animated. `docs/silhouettes.md` updated.

**Housekeeping:** the 0.3.1 entry below now gives the right size (+52.8 KB gzipped, with why it's acceptable) and template count (114).

## 0.3.1 — Silhouettes, muscle maps, How-To (2026-10-08)

No database rule changes; just copy the files and push. Optional one-time step: run the demo-photo script (DEPLOY.md → Demo photos) and commit `media/ex`.

**Animated demos for most of the library**
- **221 of 280 exercises** now have the code-drawn silhouette, from 114 motion templates built on the approved squat, pull-up and curl look: squats, hinges, lunges, presses, push-ups, dips, rows, pulldowns, curls, triceps, raises, flyes, calves, carries, core, machines, jumps. Full list: `docs/silhouettes.md`.
- What the figure holds follows the exercise: barbell (on the back, front rack or in the hands), dumbbell, kettlebell, goblet weight, cable or band (a line to its anchor), medicine ball, ab wheel, pull-up bar, dip bars, rings. Benches, boxes, walls and seats are drawn once behind the figure.
- **Depth sorting:** limbs crossing in front of the body are drawn over it and behind it when they're behind; bars stay behind their plates; hands wrap the bar they hold.
- The demo fills the player's demo box (the view fits the whole rep). Tempo days slow the demo to match.
- Squat bar sits lower on the upper back (plate clears the head), glutes glow; the pull-up frames arms, bar and back; the curl shows only the near dumbbell; more contrast between the body and the background.
- Exercises without a silhouette show their **start/end photos** (once you've run the photo script), otherwise the muscle list.

**Muscle maps** (front/back body map ported from react-native-body-highlighter, MIT)
- **Body tab:** the recovery heatmap (red / amber / green). Tap a muscle for its %, when you last trained it and its sets this week.
- **Train:** today's muscles map plus a mini map on every exercise.
- **Summary:** the session's muscles-worked map.
- **How-To → Target:** the exercise's map.

**How-To sheet (redesigned)**
- Demo across the top with a **Figure | Photos** toggle, then **Favourite**, **Watch on YouTube** (opens a search; nothing embedded) and **Share**.
- **Instructions | Target** tabs, and **your history**: est. 1-rep max, heaviest, most reps (or longest hold) and your last four sessions.

**Demo photos**
- `scripts/fetch-demo-photos.mjs` downloads free-exercise-db's photos once, resizes them to ~480 px / ~25 KB with `sips` (or ImageMagick) into `media/ex/`, and writes `media/ex/index.json`. It also reports exact-name matches for exercises not yet linked (none today; 2 linked ids have no images).
- Offline: today's photos are cached when you start a workout, any photo is cached the first time it shows, and **Settings → Workouts → Download all demo photos (≈ N MB)** saves the rest. They live in their own cache, not the app shell.

**Workout player fixes**
- The **Workout complete** card comes back if the app is closed or reloaded while it's showing (and Today's card says **Finish**), instead of landing on set 1.
- The bottom **Undo last set** ignores taps for 650 ms after the final Done, so a double tap can't undo behind the card.

**Tests:** 119 unit tests (up from 99): rig and IK (bone lengths, planted feet, hands on bars and floors, bar over mid-foot), draw order (near/far limbs, a far arm crossing the front, grips, plates), framing, every mapped exercise solving cleanly with its own load, the muscle-map mapping and per-muscle stats, exercise records.

**Size:** v0.3.1 adds 52.8 KB gzipped of JS (20 KB of it the muscle-map paths, 9 KB the template library); since before v0.3 the total is +86.5 KB. That is over the 60 KB target, accepted because it is route-lazy: the map data and the silhouette code only load with the screens that use them (Body, Train, the player, How-To and the summary), so Today and the app shell open without them. No new libraries, no new origins in the CSP. (Corrected in 0.3.1.1; this entry first said "about 40 KB" and "75 templates".)

## 0.3.0 — Experience overhaul, drop 1 (2026-10-08)

**⚠️ Rules changed.** Publish the new `firestore.rules` (Firebase console → Firestore Database → Rules → paste → Publish) **before** opening this version. Workouts now save `paused_at`, `paused_ms` and `duration_ms`.

**Guided player (new default)**
- **Start → 3-2-1 GO** full-screen countdown, then one exercise at a time: segmented progress bar, "Exercise 2 of 6", a huge reps × weight target, big −/+ steppers (your real weight steps: owned dumbbells, rack or barbell plates), an "in the tank" row, and a giant **Done set**.
- **Full-screen rest**: shrinking ring, **Skip**, **−15 / +15**, and a card showing what's next.
- **Supersets** alternate A1 → A2 → rest. **Timed sets** (planks, carries, boxing rounds) run a countdown and complete themselves. **Boxing days** use the player with the round timer and combo callouts inside it.
- **Back / Next / Undo last set** at the bottom. First-time lifts carry set 1's weight and reps into set 2.
- Prefer the old screen? **Settings → Workouts → List view**. The list view is still one tap away inside the player (☰).

**Pause, resume, away**
- ⏸ freezes the workout clock and the rest timer. The overlay offers **Resume**, **End workout** or **Discard**. The workout time on the summary leaves pauses out.
- Come back after 10+ minutes without pausing and Forge asks: **"You were away 14 min. Count it?"** — keep it or remove it from your time.

**Feel**
- **Power-up** on every Done: button charge, burst, ring flash, "+1 set". It gets bigger on the last set of an exercise and the last set of the workout.
- **PR explosion**: a gold card with old → new (counting up), sparks and a fanfare. Tap to dismiss.
- **Sound + voice coach**: 3-2-1 beeps, "10 seconds", "Rest 2 minutes. Next: bench press, 8 reps", "Last set", "New record". Mixes with your music and stays silent when the ringer is off. Settings → Workouts → Coach audio: Off / Beeps / Voice; Sound effects on/off.
- **Haptic tick** on Done (experimental, iPhone only). Settings → Workouts.
- **Animated demos** (preview): code-drawn silhouettes with the working muscles glowing on the hardest part of the rep, for **barbell back squat, pull-up and dumbbell curl**. Approve the look and v0.3.1 brings the full library. Everything else shows the muscle list.
- **Summary screen**: "Workout #N", count-up time / sets / volume / records, muscles worked, every exercise with ✓, its records (old → new) and "vs last time". XP and levels come in v0.3.2 (draft names in `docs/levels.md`).
- **Motion system**: shared timing tokens, slide transitions between screens, fade-in sheets, rows that ease in as you scroll, skeletons while loading. **Reduce Motion** turns movement into fades.

**Navigation:** five tabs — **Today, Train, Body, Progress, Settings**. Body holds recovery (moved from Train). Progress holds **Weight** and **History**.

**Progression**
- **Tempo is no longer a dead end.** After 3 maxed-out sessions on tempo, Forge re-checks the next weight; if your last session predicts 5+ reps there, you move up (30 → 40 lb yes; 5 → 30 lb no). See `docs/workout-algorithm.md`.
- `predictedReps` now documents that it's Epley, capped at 30 reps.

**iPhone web features used** (each one is optional; the app works without it):
| Feature | Needs | If missing |
|---|---|---|
| Screen Wake Lock (screen stays on during a workout) | iOS 18.4+ home-screen app | The screen can dim and lock as normal; timers still keep correct time. |
| Haptic tick (hidden `switch` input) | iOS 18+ | No tick; everything else is identical. |
| View Transitions (screen slides) | Safari 18+ | Screens swap instantly. |
| `@starting-style` (sheets fade in) | Safari 17.5+ | Sheets appear without the entrance. |
| Scroll-driven animations (list rows ease in) | Safari 26+ | Rows are just there. |
| `text-wrap: balance / pretty` | Safari 17.5+ | Normal line breaks. |
| Audio Session `ambient` (mix with music, obey silent switch) | Safari 16.4+ | Default web-audio behaviour. |
| Speech synthesis (voice coach) | All iOS | No spoken cues; the beeps still play. |

**Review fixes (before merge)**
1. **Undo takes the PR back.** Undoing a set recomputes that exercise's records from the sets still done, so an undone PR set leaves no PR behind (tested).
2. **Sets save as the app hides.** A pending save is written immediately when the app goes to the background or is swiped away, instead of waiting out the 400 ms debounce.
3. **The last set no longer auto-finishes.** A "Workout complete" card offers **Finish** or **Undo last set**.
4. **Summary shows the right numbers straight away.** It renders the finished workout (status done, real duration, correct Workout #N) even before the database snapshot catches up, so the one-time celebration never counts up wrong numbers.
5. **The animation loop sleeps on the player.** Demos stop drawing while paused or resting, the rest ring runs one task per screen (no more copies stacking up), and demo props are built once instead of every frame.

**CI:** GitHub Actions runs the unit tests and the rules tests on every push and pull request.

**Tests:** 99 unit tests (up from 80): pause-aware clock, away gap, set queue with supersets, rest rules, set labels, validation, session stats, vs-last-time, the tempo escape (30 → 40 escapes; 5 → 30 never does), demo muscle mapping, undo removing a PR. Rules tests cover the typed pause fields.

**Size:** about 37 KB (gzipped) of new JS + CSS; no new libraries, no new origins in the CSP.

## 0.2.1 — Progression fixes (2026-10-08)

No database rule changes; just copy the files and push.

**Must-fix**
1. **Deloads and resets no longer drop from 30 lb to 5 lb.**
   - If the nearest lighter weight you own is more than 20% lighter, the weight stays the same.
   - A deload then cuts sets in half, sets reps to the bottom of the range, and RIR 3+.
   - A reset aims for the bottom of the range.
   - Where a close lighter weight exists (gym rack, barbells), it's still ~10% lighter.
2. **Deload sessions don't count as progression history.** Workouts already save `deload: true`. History now passes that flag through, and progression, the two-tough-sessions reset, and stall checks all use your last non-deload session. PRs, charts and History still show deload workouts. Bench at 200 → deload 180 → back to 200 the next session.
3. **The "big jump" ladder can't loop.**
   - It's now one-way at the same weight: reps up to the top + 8 (keeping your set count), then one more set at those reps up to 5, then tempo, which stays.
   - The normal double-progression branch also keeps the sets you've built up.
   - Weight jumps are now decided by estimated strength, not a fixed 25% rule. Small steps (+5 lb upper, +10 lb lower barbell, +5 lb machine or dumbbell) are always allowed. Bigger jumps happen when your last session predicts you can hit the bottom of the range at the new weight.
4. **Pinned exercises respect your injury note and the level cap.**
   - 5×5 day B no longer gives the barbell overhead press when your note mentions your shoulder. The slot falls back to its pattern, and if every option there stresses your shoulder, the session notes say exactly what was left out and why.
   - Exercises you picked yourself in Build my own are kept, with a warning on that exercise.

**Smaller fixes**
5. **Finishing with zero completed sets** offers **Discard** (not Save), so empty workouts don't land in History or advance the program rotation.
6. **A rejected ✓ tap** ("Enter the weight first") no longer leaves reps filled in. Checks run before anything is written.
7. **CSV exports neutralise formula injection.** Cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'`, while plain negative numbers stay numbers. The CSV helpers moved to `js/csv.js` with tests.
8. **SETUP:** puts Homebrew's keg-only `openjdk@21` on your PATH (and checks `java -version`) before `npm test`.
9. **CSP:** `img-src` allows `https://www.google.com`, so Firestore's offline network probe (`cleardot.gif`) isn't blocked and the console stays quiet.

**Tests:** 80 unit tests (up from 65), including:
- 40-session simulations that feed each target back in as the logged result (reaches 5 sets, then tempo, never loops, weight stays 30 lb);
- deload and reset at 30 lb at home;
- bench returning to 200 after a deload;
- stall checks skipping deloads;
- estimated-strength jumps;
- pinned injury and level filtering;
- custom-day warnings;
- CSV injection.

## 0.2.0 — Phase 1, Checkpoint B: workouts (2026-10-08)

**⚠ Publish the new `firestore.rules`** (DEPLOY.md) and **close public sign-up** (SETUP.md step 7).

**Workouts**
- **Exercise library:** 280 curated exercises with movement patterns, muscles, equipment alternatives, rep ranges, original form cues, and injury tags.
  - Calisthenics progression chains, with the no-equipment steps available at every location: push-up (9 steps), pull-up (9), muscle-up, dip, squat, hinge, L-sit, handstand, core, and ab wheel.
  - Step-by-step instructions for 177 exercises from free-exercise-db by Yuhonas (public domain, Unlicense), credited in-app and in README.
- **Deterministic generator** (no AI). Details in `docs/workout-algorithm.md`.
  - Per-muscle recovery: fatigue decays over 48–72 h and scales with sets and effort.
  - Smart mode picks the most recovered day.
  - Fills each slot only from the active location's equipment.
  - Skips injury-tagged moves.
  - Keeps main lifts consistent so they can progress, and rotates accessories.
  - Trims to your session length and supersets short sessions.
- **Progressive overload:** double progression, with load steps from each location's own weights.
  - When the next weight is too big a jump (your 5 → 30 lb dumbbells), it progresses reps, then sets, then tempo.
  - 10% reset after two bad sessions; stall detection.
  - Bodyweight chains suggest the next step.
- **Deloads:** the last week of every 4–6 week cycle (by experience), or on demand when 2+ main lifts stall.
- **Programs:**
  - Smart (adapts to recovery)
  - Full body 3×
  - Upper/lower
  - Push/pull/legs
  - 5×5
  - Hypertrophy
  - Home dumbbells
  - Boxing conditioning (shadowboxing when there's no heavy bag)
  - Build my own
- **Train tab:**
  - pick a location (defaults to the last one used);
  - see today's plan or pick a different day;
  - start or resume a workout;
  - recovery bars and program/cycle status.
- **Logger:**
  - big one-handed rows, with last session's numbers inline;
  - planned weight and reps prefilled (tap ✓ to accept);
  - reps in reserve (RIR), warm-up sets, add/remove sets, swap for a similar move doable here, reorder, add exercise;
  - plate calculator, "how to" with cues and steps, timed holds with a countdown.
  - Rest timer with ±15 s and beeps, rest after supersets, and the screen kept awake.
  - PR detection (estimated 1RM, heaviest weight, reps at a weight, most reps, longest hold) with a celebration.
- **Interval timer:**
  - boxing rounds with combo callouts (optional voice);
  - HIIT, EMOM, Tabata, and custom;
  - "log as cardio" when it finishes.
- **Cardio log:** manual entry, labelled as manual. Peloton rides go here until Phase 2/3 imports.
- **History:**
  - 12-week calendar heatmap;
  - weekly sets per muscle against a 10–20 set guide;
  - estimated 1RM / best-reps trend per exercise;
  - PR board;
  - recent workouts and cardio, with detail and delete.
- **Exercise library screen:** search, filter by movement and location, favorites, "never suggest", and custom exercises.
- **Locations:** a weight-inventory editor (dumbbell pairs and kettlebells) and the plate calculator.
- **Today:** a workout card (start, resume, or done).
- **Data:**
  - new collections `workouts` (sets live inside each workout, one level deep, with `location_id`), `cardio_sessions`, `programs`, and `exercises` (custom);
  - export adds workouts and cardio CSV;
  - delete-everything covers every collection.

**Review fixes (Checkpoint A feedback)**
1. **Rule tests:**
   - `npm test` copies the rules in first (the emulator only reads its own folder);
   - `demo-forge` project ID in both files;
   - firebase-tools ^15;
   - SETUP says Java 21+.
   - New tests: another user listing, collection-group queries, changing `user_id`, removing standard fields, deeper paths, unknown collections, type checks.
2. **Closed public sign-up:** SETUP step 7. `auth/admin-restricted-operation` now shows a plain message.
3. **`initializeAuth`** with IndexedDB and local persistence and no popup/redirect resolver, so there's no hidden apis.google.com iframe on iOS.
4. **No endless spinner:** a failed data listener (for example, rules not published) shows a clear message with a retry button.
5. **Calorie floor citation:** Harvard only, noted as more cautious than NIH/NHLBI's 1,000–1,200 (women) / 1,200–1,600 (men). Updated in targets.js, About, and README.
6. **Service worker:** the first visit no longer reloads itself. It reloads only when a service worker already controlled the page, or after you tap the update banner.
7. **`tests/run.html`** bypasses the service worker's app-page fallback.
8. **Content-Security-Policy** meta tag:
   - scripts: self + www.gstatic.com;
   - connections: self + firestore / identitytoolkit / securetoken googleapis.com (+ gstatic);
   - `object-src 'none'`, `base-uri 'self'`, `frame-src 'none'`.
9. **SETUP step references** fixed.
10. **Sync pill** uses Firestore's `hasPendingWrites` on every watched collection, so writes queued in an earlier session show as Saving… until confirmed.
11. **`weight_inventory` stored in kg** (`dumbbells_kg`, `kettlebells_kg`), shown in your units. Home: 5 and 30 lb dumbbell pairs, one 20 lb kettlebell. Locations saved by v0.1.x (in pounds) are converted automatically on first load. Age escaped in Settings.
12. **Delete everything:** if wiping the on-device copy fails after the account is gone, the app just reloads.
13. **Soft deletes add `deleted_at`.** Rules allow only known collections and add basic type checks (for example, `kg is number`, profile/settings id `main`).

## 0.1.1 — Home gym preset (2026-10-07)

- Home gym location now comes preloaded from your photos: 5 lb and 30 lb dumbbell pairs, kettlebells, resistance band with handles, jump rope, ab wheel, rotating push-up handles, and Peloton bike.
- New equipment types: ab wheel, push-up handles.
- Locations store a weight inventory (dumbbells 5 and 30 lb for now). Checkpoint B uses it for progression steps.

## 0.1.0 — Phase 1, Checkpoint A (2026-10-07)

**Added**
- Installable PWA shell: manifest, icons, offline service worker, "new version, tap to refresh" banner.
- Email and password sign-in, password reset.
- Offline-first data: Firestore's persistent on-device cache. Writes made offline survive app restarts and sync when back online. A status pill shows Synced, Saving…, or Offline.
- Onboarding: goal, body stats, activity, training days and length, experience, injuries, locations, and targets with weekly pace.
- Calorie and macro targets: Mifflin-St Jeor BMR and TDEE, safe floors (1,200 / 1,500 kcal, cited), a 1%/week loss cap (override up to 1.5%), protein at 1.6–2.2 g/kg, a "why these numbers" explanation, and safety notes for under-18s, underweight, BMI 40+, low targets, and out-of-range inputs.
- Weight: manual logging, exponentially smoothed trend (10%/day), chart with weigh-in dots, trend line, goal line, and projected goal date, plus history with delete.
- Today screen: weight trend with a 7-day arrow and sparkline, daily targets, and an install-to-Home-Screen prompt on iPhone.
- Locations (Addendum 1): Home gym, YMCA (standard equipment preloaded), and Travel / no equipment. Rename, set default, toggle equipment, add custom items, add or remove locations.
- Settings: units (lb/ft or kg/cm), edit profile and targets, export everything (JSON), export weights (CSV), delete everything (account plus cloud plus on-device copy), and version.
- Security rules: owner-only access, required standard fields, immutable `created_at` and `user_id`, closed `private` area for server-only tokens, plus rule tests.
- Unit tests: units, targets, and smoothing (29 tests), with a check that the version numbers match.

**Data model**: `users/{uid}/{profile|settings|locations|weights}/{id}`. Every record has `id`, `user_id`, `created_at`, `updated_at`, `source`, and `deleted`.
