# Addendum 3: Replace Withings+ inside Forge (so I can cancel the $9.99/mo subscription)

Add this to the brief. It extends §4 (Apple Health), §5.5 (Weight and body), §5.6 (Coach), §6 (data model) and §7 (phases). Where this addendum and the brief disagree, this addendum wins.

**The goal.** I step on my Withings scale and Forge shows every number the Withings app shows, plus everything Withings+ adds on top (the score, weekly breakdown, explanations, trend alerts, readiness, programs, assistant). Ideally it's better, because Forge also has my Apple Watch recovery data (HRV, resting HR, sleep, wrist temperature) and my real training and food logs. Once the checklist in §C passes, I cancel Withings+.

**Research behind this:** my bot's report `withings-plus-replacement.md` (Oct 8, 2026). Source IDs like [S40] point to its source list. The key facts are repeated here so you don't need the report.

---

## 0. Ground rules for this addendum

1. **Withings+ sells interpretation, not measurements.** Every scale measurement stays free to view in the free Withings app [S1][S4]. What Withings+ adds is the Health Improvement Score, the weekly breakdown, the LLM assistant, Measurement Insights, Smart Trends, enhanced Readiness, programs and missions, the BodyFit/BodyScan 2-only Health Tab features, cardiologist ECG reviews and one nutritionist consult [S1][S5]–[S13][S17][S22].
2. **The Withings account policy changes on Oct 12, 2026, and it's time-sensitive.** Withings' API plans page (re-checked Oct 8, 2026) says: "Withings+ becomes required on the Start for Free API plan from October 12, 2026. Withings accounts created after that date will need a membership to share health data with a free-plan app… Accounts created before that date are unaffected." The FAQ adds that Apple Health and Google Health sharing are covered by the requirement too [S40].
   - **I keep my existing Withings account forever.** I don't create a new one, not for the developer dashboard, a new scale, or a "fresh start". Your UI copy and setup docs must say so.
   - The Withings authorize page offers both "create account" and "log in". The connect screen must tell me to **log in**.
3. **Free-tier data limits must be measured, not assumed.** The free plan includes "Core biomarkers: Activity, Sleep, Body, Heart" [S40].
   - Vascular age and EDA/NHS (nerve scores) are listed as Advanced Biomarkers (custom price), so they probably won't come back.
   - Visceral fat, BMR, metabolic age, segmental composition, ICW/ECW, PWV and NRS sit in Withings' "Total" pack, and which plan includes that pack is **unclear** [S41].
   - The Withings data check screen (§B.6) settles this on my real account **before** I cancel.
4. **No Bluetooth reverse engineering.** It needs a cloud-held per-scale secret obtained through an undocumented password login, it's unproven on current scales, and the Withings terms forbid it [S16][S54]. Use the official API only.
5. **Brief rules still apply.**
   - No secrets in the front end.
   - AI stays optional behind the provider switch, and "none" must work.
   - The app never diagnoses.
   - Offline-first, export and delete-everything, and costs near zero.
6. **My scale model is unknown.** Model-specific features (segmental, nerve score, ECG) must show "not measured by your scale" when they don't apply. Detect the model with `getdevice` [S38].

---

## A. Feature-by-feature replacement table

**Data source key**
- `W:<n>`: Withings API `getmeas` meastype n (from the official OpenAPI spec [S37]).
- `pos`: the Withings `position` field (segment).
- `HK:`: a HealthKit type, read through the Phase 2 Shortcut bridge (SC) or the Phase 3 native app (N).
- `derived`: Forge computes it.
- `F:`: Forge's own data (workouts, XP, food).

**Checkpoint key**
- **W1** = Withings backend and body metrics.
- **W2** = Watch bridge and "Forge Intelligence".
- **C** = food (existing plan).
- **P3** = Capacitor and HealthKit.

### A.1 Every body metric the scale can produce (free Withings app features)

The "Free API?" column predicts what the data check will find. ✓ = Basic pack, ? = unclear, ✗ = probably Advanced-only.

| Withings metric | Forge equivalent | Source | Free API? | Ckpt | Better than Withings because |
|---|---|---|---|---|---|
| Weight | Weight card, raw dots + EWMA trend, goal line, ETA | W:1 (fallback HK `bodyMass`) | ✓ | W1 | Trend feeds adaptive TDEE and the generator; one place with training and food |
| BMI | Shown with a "BMI ignores muscle" note | derived: W:1 ÷ (W:4)² (fallback HK `bodyMassIndex`) | ✓ | W1 | Puts FFMI/FMI next to it, so a muscular person isn't labeled "overweight" without context |
| Height | Profile height, prefilled | W:4, else profile | ✓ | W1 | n/a |
| Fat % | Fat % trend + band | W:6 (fallback HK `bodyFatPercentage`) | ✓ | W1 | 7-day smoothing; BIA noise flagged instead of celebrated or mourned |
| Fat mass (kg) | Fat-mass trend (the number that matters for a cut) | W:8 | ✓ | W1 | Weekly fat-loss rate checked against a safe pace |
| Fat-free mass | FFM trend, FFMI | W:5 (fallback HK `leanBodyMass`) | ✓ | W1 | "Muscle-preservation" check during a cut, tied to protein and training volume |
| Muscle mass | Muscle trend, with lifting volume overlaid | W:76 | ✓ | W1 | Correlated with Forge training volume per week, which Withings has no data for |
| Hydration / water | Water mass trend; explains scale swings | W:77 | ✓ | W1 | Used by anomaly detection: "weight +1.2 kg, water +1.0 kg, likely water" |
| Bone mass | Bone mass (slow-moving; monthly view) | W:88 | ✓ | W1 | n/a (parity) |
| Standing heart rate | Scale HR, shown next to Watch resting HR | W:11 | ✓ | W1 | Compared with the Watch's overnight RHR, so a scale-HR spike gets context |
| Visceral fat index | Visceral fat trend + band | W:170 | ? | W1 | Trend plus explanation; Withings shows a number |
| BMR | BMR (measured if returned), used as the TDEE floor input | W:226, else derived (Mifflin–St Jeor or FFM-based [S62]) | ? | W1 | Feeds calorie targets directly |
| Metabolic age | Metabolic age (labeled "estimate" if derived) | W:227, else derived from BMR vs age-group average [S30] | ? | W1 | Transparent method shown |
| Segmental fat/muscle/FFM (arms, legs, torso) | Body-map heat view (reuses the v0.3.1 muscle map) | W:173/174/175 × pos 2,3,10,11,12 | ? | W1 | Overlaid on the Forge muscle map, alongside per-muscle training volume |
| ECW / ICW water | Water split trend (inflammation/recovery hint, non-diagnostic) | W:168/169 | ? | W1 | Combined with training load ("ECW up after leg day") |
| Pulse wave velocity (EU devices only) | PWV trend | W:91 | ? | W1 | n/a (US scales don't report it [S32]) |
| Vascular age | Shown if returned; otherwise a manual monthly entry | W:155 (llms.md says 140; request both [S37][S38]) | ✗ | W1 | Combined with VO₂max and RHR in a "Heart" pillar |
| Nerve Health Score / EDA / NRS | Shown if returned; otherwise manual entry | W:167, W:229, W:196 (attrib 15 = guided) | ✗ / ✗ / ? | W1 | n/a (parity at best) |
| SpO₂ (BodyScan 2) | Shown if returned; Watch SpO₂ otherwise | W:54 / HK `oxygenSaturation` | ✗ | W1 / P3 | Apple Watch gives nightly SpO₂ anyway |
| Scale ECG / AFib (Body Scan, BodyScan 2) | Not via free API; see ECG row in A.2 | W:130, 135–138 | ✗ | n/a | n/a |
| History (unlimited) | Full backfill of the whole Withings history into Firestore + local cache | `getmeas` paged backfill | ✓ | W1 | My copy survives any future Withings policy change |
| Charts: combined weight/fat/muscle, period comparison, full-screen | Body tab charts: overlays, 7/30/90/365/all, this vs. previous period | derived | n/a | W1 | Overlays training volume, calories and HRV on the same time axis |
| Health goals (lose weight/fat, gain muscle/weight, stabilize, with pace) [S20b] | Goal on Body tab with pace capped at ~1%/week (brief §2.5) and a projected date | profile + derived | n/a | W1 | Projection uses the EWMA trend with a confidence band |
| Scale "Personalized Insights" screens (streaks, "−2% this week") [S18] | Post-weigh-in insight card + push (webhook-triggered) | derived | n/a | W1/W2 | Arrives on iPhone/Watch within minutes, with context |
| Ambiguous-user measurements (attrib=1) | "Is this you?" review queue; excluded from trends until confirmed | W `attrib` [S37] | ✓ | W1 | Same as Withings, but it can't silently pollute the trend |
| PDF/CSV export | Forge export (JSON + CSV per collection) + printable body report | F | n/a | W1 | Includes Watch, training and food data in one file |
| Apple Health sync | Phase 2: Withings app → Apple Health stays on as a backup path; P3: Forge reads it natively | HK | n/a | P3 | n/a |
| "My Focus" pinned metrics [S1][S19] | Pin any metric to Today and Body | F | n/a | W2 | n/a |
| Year in Review [S21] | Year-in-review screen (Dec) | derived | n/a | later | Includes PRs, volume and body change together |

### A.2 Everything Withings+ adds

| Withings+ feature | Forge equivalent | Source | Ckpt | Better than Withings+ because |
|---|---|---|---|---|
| **Health Improvement Score** (1–100; Activity, Body, Heart, Sleep, Nutrition; weights unpublished) [S5] | **Forge Score** (0–100) with five pillars and **published weights and formulas** (§B.9) | W body metrics; HK HRV/RHR/sleep/wrist temp/steps/exercise/VO₂max; F workouts/food | W2 (Nutrition pillar lights up after C) | Transparent: tap any pillar to see the inputs, math and "what moved it". Uses Apple Watch recovery and real training instead of a Withings watch I don't own |
| **Weekly breakdown** by vertical [S1] | **Sunday weekly report** (part of the brief's weekly check-in §5.6): score change per pillar, best/worst metric, body-comp change, training summary, one change for next week; push + in-app + optional PDF | derived | W2 | One report for body + training + recovery + food. Withings discontinued its free weekly email in Aug 2026 [S21b] |
| **Long-term health assessment** [S1] | 90-day / 1-year pillar trends on the Score screen | derived | W2 | n/a |
| **Health Assistant (LLM)** [S10] | **Forge Coach chat** through the provider switch (Grok default). Facts come from tool calls over my data; the model never invents numbers. **"none" → rule-based answers + insight cards** | F + all of the above | W2 (rules) / existing Phase 2 coach (AI) | Works with AI off; I choose the provider; proposed changes are accept/reject cards (brief §5.6) |
| **Measurement Insights** (explanations next to new measurements) [S10] | A **metric explainer sheet** for every metric (what it is, how the scale estimates it, what moves it, typical ranges with sources, accuracy caveats), plus a one-line contextual insight under each new weigh-in | `data/metrics.json` (our own text; Withings' content can't be copied [S16]) + rules | W1 (explainers) / W2 (contextual) | Honest about bioimpedance error; links each metric to what I can do in Forge |
| **Smart Trends / auto-trend detection** [S10] | **Trend and anomaly engine** (§B.10): Theil–Sen slopes over 7/28/90 days + Mann–Kendall significance, baseline-deviation alerts, water-swing detection, ranked top-3 cards | derived | W2 | Cross-metric: "fat −0.3 kg/wk while muscle is flat and protein hit 6/7 days" |
| **Readiness + tips** [S11] (needs a Withings watch or sleep device) | **Forge Readiness** (green/amber/red) from Watch HRV, RHR, sleep, wrist temp and respiratory rate vs. my 28-day baseline, plus yesterday's training load from `js/workouts/recovery.js`. **It changes today's workout** (amber: trim a set; red: suggest deload or mobility) | HK `heartRateVariabilitySDNN`, `restingHeartRate`, `sleepAnalysis`, `appleSleepingWristTemperature`, `respiratoryRate`; F | W2 | Withings Readiness can't use my Apple Watch (undocumented [S11]) and can't change my training. Forge's does both |
| **BodyPath** (goal path, ETA, calorie balance from composition change) [S7] | **Goal path**: EWMA trajectory, ETA with uncertainty band, energy balance from composition change (≈ 39.5 MJ/kg fat, 7.6 MJ/kg lean; Hall 2008 [S59]), merged with logged intake → adaptive TDEE | W:1/5/8; F food | W2 (path/ETA) / C (adaptive TDEE) | Uses my actual food log (MacroFactor-style), not only "habit factors" |
| **Body Profile** (SMI × FMI 16-zone grid) [S8] | **Body Profile** 4×4 grid: FFMI × FMI, Kyle et al. 2003 reference ranges [S60], age/sex noted | W:5/8/76 + height | W2 | Close substitute (the API has no skeletal-muscle meastype); shows how I moved across the grid over time |
| **Heart Age** (BodyScan 2) [S27] | **Not replicable.** Substitute: "Cardio fitness" card (VO₂max trend + RHR + vascular age if available) | HK `vo2Max`, `restingHeartRate` | W2 | n/a |
| **Glucose Resilience** (BodyScan 2/BodyFit) [S9] | **Not replicable** (proprietary thresholds, needs W:170 + W:196). Substitute: visceral-fat and NRS trends if returned; CGM via HK `bloodGlucose` if I ever wear one | W:170/196 | later | n/a |
| **Longevity / Health Tab** [S6] | "Longevity" section on the Score screen: VO₂max, RHR, HRV, visceral fat, FFMI trends | W + HK | W2 | n/a |
| **Programs & Missions** [S17][S18] | **Forge missions + programs on the v0.3.2 XP/levels/badges system.** Daily missions: weigh-in (auto-completed by the webhook), workout done, protein hit (after C), steps target, in bed by target time. Multi-week **body programs** ("4-week cut kickoff", "recomp 8 weeks", "maintenance") layered on `js/workouts/programs.js` and targets. Badges for weigh-in streaks and body-comp milestones | F + W + HK | W2 | My missions are real training and food actions, not articles. They feed XP. **The scale's own Mission screen can't be replaced** (Withings controls the display) |
| **Recipes / workouts / articles library** [S17] | Forge's exercise library (existing) + recipes in C. No Withings content | F | existing / C | n/a |
| **Cardio Check-Up** (cardiologist ECG review) [S12] | **Not replicable** (human clinicians). Substitute: Apple Watch ECG → Health app → **Export a PDF for your doctor** → my own physician or a telehealth cardiology service. P3: Forge reads the ECG classification (HealthKit ECG is read-only [S50]) and prompts me to share abnormal or inconclusive results. Before P3: a manual "log ECG result" entry | HK `HKElectrocardiogram` (P3 only; **not readable by Shortcuts**) | P3 (manual log in W2) | n/a |
| **Nutritionist consult** (1 free, US) [S22] | **Not replicable** (human). Substitutes: Forge nutrition (Checkpoint C: targets, adaptive TDEE, protein) + a "share with my dietitian" PDF/CSV. Withings' Nutri Care (via Fay) still works **without** Withings+ and is "usually free for 95% of users" through insurance [S22] | F | C | n/a |
| **Sleep Clinic Assessment** (region-dependent) [S1] | Not replicable. Forge flags sustained short or irregular sleep and suggests seeing a doctor (no diagnosis) | HK | W2 | n/a |
| **Year in Review (automatic)** [S21] | See A.1 | n/a | later | n/a |
| **Withings+ Protect** (EU warranty) [S13] | Not applicable in the US | n/a | n/a | n/a |
| **StethO Sense** (BeamO) | Not applicable (no BeamO) | n/a | n/a | n/a |

### A.3 What can't be replicated, and the substitute

| Can't replicate | Why | Substitute |
|---|---|---|
| Cardiologist ECG reviews | Human clinical service | Apple Watch ECG PDF → my doctor; Forge reads the classification in P3. Only matters if I own an ECG scale or used Apple Watch ECG import [S12] |
| Nutritionist consult | Human service | Nutri Care via insurance (works without Withings+) + Forge nutrition export |
| Heart Age | Needs raw impedance-cardiography timing that isn't in any API [S27][S37] | VO₂max + RHR + vascular age (Withings app) |
| Glucose Resilience | Proprietary thresholds; inputs may not be on the free API | Visceral fat / NRS trends if available; CGM via HealthKit |
| Exact Withings score values | Weights unpublished [S5] | Forge Score (transparent) |
| Mission screen on the scale display | Withings controls the scale screen | iPhone/Watch push right after the webhook |
| Vascular age, nerve scores (and possibly visceral fat/BMR/segmental) **inside Forge** | Probably Advanced-plan only on the API [S40][S41] | Still **free to view in the Withings app**, so nothing is lost by cancelling. Forge offers a 10-second manual monthly entry and labels it "manual" |

---

## B. Architecture

### B.1 Shape

```
Withings scale ─Wi-Fi→ Withings cloud ──notify POST (appli=1)──► withingsWebhook (Cloud Function, us-east1)
                                   ▲                                  │ fetch getmeas(lastupdate) with the stored token
                                   │ OAuth / getmeas / getdevice        ▼
Forge PWA ──callable──► withingsAuthStart ──► Withings login ──► withingsOAuthCallback ──► users/{uid}/private/withings (tokens)
   ▲   (Firebase Auth)                                                  │
   │                                                                    ▼
   └──── Firestore listeners ◄── users/{uid}/body_measures/*, users/{uid}/weights/w_* , users/{uid}/integrations/withings
iPhone Shortcut (Phase 2) ──POST JSON + bearer token──► healthIngest ──► users/{uid}/health_daily/{day}
Capacitor app (Phase 3) ── HealthKit → same health_daily docs (source: 'healthkit')
withingsMaintenance (scheduled daily) → refresh token, verify/re-subscribe notify, reconcile sync
```

- **Firebase Cloud Functions (2nd gen), Node 22, region `us-east1`** (same as Firestore). `firebase-functions` v2 APIs with `defineSecret`.
- Set `maxInstances: 2` on every function so a bug or abuse can't scale costs.

### B.2 Secrets and config

- `WITHINGS_CLIENT_SECRET`: `defineSecret`. I set it myself with `firebase functions:secrets:set` in my own Terminal. It's never in the repo, never in chat, never in the front end.
- `WITHINGS_WEBHOOK_KEY`: `defineSecret`, a random 32+ character string that goes in the notify callback URL (see B.4). Generate it with a command I run.
- `WITHINGS_CLIENT_ID`: not secret. Use `defineString` / `functions/.env`. I'll give you the value.
- Shortcut tokens: random 32-byte tokens, shown to me once. **Only a SHA-256 hash is stored**, in `users/{uid}/private/shortcut` plus a lookup doc `shortcut_tokens/{hash} → {uid}`. Both are server-only.

### B.3 Functions

| Function | Trigger | Does |
|---|---|---|
| `withingsAuthStart` | `onCall` (requires Firebase Auth) | Creates a one-time `state` (32 random bytes) in `oauth_states/{state}` = `{uid, expires_at: now+10min}`. Returns the authorize URL: `https://account.withings.com/oauth2_user/authorize2?response_type=code&client_id=…&scope=user.info,user.metrics&redirect_uri=<callback>&state=…` [S38] |
| `withingsOAuthCallback` | `onRequest` HEAD/GET | **HEAD → 200** (the Withings dashboard checks the URL when it's saved). GET: validates and deletes `state` (one-time, unexpired). Exchanges `code` **immediately** (it expires in 30 s) at `POST https://wbsapi.withings.net/v2/oauth2` with `action=requesttoken&grant_type=authorization_code`. Stores tokens in `users/{uid}/private/withings` and writes `withings_users/{withingsUserId} → {uid}`. Calls `getdevice` and saves the model to the status doc. Subscribes notify `appli=1`. Starts the backfill. Redirects to a static `withings-connected.html` page that says "Connected, switch back to Forge". **Don't depend on Firebase Auth in this browser context:** on iPhone the Withings login opens outside the home-screen app's storage |
| `withingsWebhook` | `onRequest` HEAD/POST | See B.4 |
| `withingsSyncNow` | `onCall` | Manual "Sync now" (brief §5.5). Incremental sync. Throttled to once per 10 min per user (Withings polling guidance [S38]) |
| `withingsDataCheck` | `onCall` | The verification probe (§B.6). Writes the result to the status doc and to a history list |
| `withingsDisconnect` | `onCall` | `notify revoke`, deletes the private tokens and `withings_users` map, marks the status disconnected. Optionally deletes `body_measures` and `w_*` weights. "Delete everything" calls it first |
| `withingsMaintenance` | `onSchedule` daily 04:00 ET | For each connected user: refresh the token (keeps the 1-year refresh token alive [S38][S43]), `notify list` and re-subscribe if missing (subscriptions auto-cancel after 20 days of failures [S42]), reconcile sync via `lastupdate`, and a 90-day windowed compare to catch measurements deleted in the Withings app. Uses **1 Cloud Scheduler job** (3 free per billing account; check what Ava's app already uses) |
| `healthIngest` | `onRequest` POST (Phase 2) | Shortcut bridge (B.8). `Authorization: Bearer <token>` → hash → `shortcut_tokens` → uid. Validates the payload schema and size (≤ 256 KB), upserts `health_daily/{day}` |
| `createShortcutToken` / `revokeShortcutToken` | `onCall` | Issues or rotates the Shortcut token (shown once) |

**Token handling**
- Access tokens last 3 h. Refresh tokens last 1 year and **rotate**, and the old one dies 8 h later [S38].
- Refresh on demand when `expires_at − 5 min < now`, inside a Firestore **transaction / lease** on `private/withings` so two concurrent invocations can't both rotate and lose the newer refresh token.
- Always persist the new refresh token before using the access token.
- On status 343 (invalid token), retry the refresh once. If that fails, mark the status doc `needs_reconnect` and show a banner.
- Log only status codes, never tokens or health values.

### B.4 Webhook handling (`withingsWebhook`)

Withings notifications carry **no signature** for Health Data API users: a plain `application/x-www-form-urlencoded` POST of `userid, startdate, enddate, appli` [S38][S42]. So the handler treats the payload as an untrusted hint.

1. **HEAD → 200 empty.** Withings sends a HEAD to verify the URL before it registers a subscription.
   - Callback rules: HTTPS, a real domain, port 443, ≤ 255 characters [Withings "Subscribe to notifications" page].
2. **Path key.** The subscribed callback URL is `https://us-east1-forge-web-f2351.cloudfunctions.net/withingsWebhook?k=<WITHINGS_WEBHOOK_KEY>`.
   - A missing or wrong `k` → 404, with no work done.
   - The key is known only to Withings and the function.
3. **Parse.** Unknown `userid` (no `withings_users` doc) → 200 and ignore. Returning 200 stops Withings retrying forever; a stale subscription gets revoked by maintenance.
4. **`appli` handling.**
   - `appli=1` → sync body metrics.
   - Other values (4 sleep, 16 BP, 44 ECG, 46 activity, 54 AFib) → 200, log, ignore. We only subscribe to 1. Add 16 if I ever buy a Withings BP monitor.
5. **Sync.** Ignore the payload's dates except as a hint. Call `getmeas` with `lastupdate = stored cursor` (a few seconds of overlap), `category=1`, all meastypes in §B.6, and loop `more/offset`.
   - Write idempotently (B.5). Save the new `updatetime` cursor.
   - Record `last_notify_at`, `last_sync_at`, and the latency (`received_at − measured_at`) on the status doc.
6. **Respond quickly.**
   - Withings wants a 2xx "within a few seconds" [S42], so finish within ~8 s.
   - On a **transient** failure (Withings 5xx/601, Firestore error), return **503** so Withings retries: 5 cycles over ~5 h [S42].
   - On success → 200.
   - The daily reconcile covers anything still missed (missed notifications are not redelivered [S42]).
7. **Rate limits.** 120 requests/min per app [S42] is plenty, but back off on status 601.
8. **After a new weigh-in is stored:** compute the post-weigh-in insight (W2) and send a web push (if push is on). This is the replacement for the scale's Mission and insight screens.

### B.5 Data model (new collections)

All docs carry the standard fields (`id, user_id, created_at, updated_at, source, deleted`).

**`users/{uid}/body_measures/{id}`** (written only by functions; `id = "w_" + grpid`)

```
source: 'withings' | 'apple_health' | 'manual' | 'csv_import'
grpid, measured_at (ISO, from `date`), day ('YYYY-MM-DD' in the group's timezone), tz,
attrib (0/1/2/4/8/15), needs_review (attrib==1), category, deviceid, model, w_created, w_modified,
metrics: { weight_kg, height_m, fat_ratio_pct, fat_mass_kg, fat_free_mass_kg, muscle_mass_kg,
           hydration_kg, bone_mass_kg, heart_pulse_bpm, visceral_fat, bmr_kcal, metabolic_age,
           pwv_m_s, vascular_age, nerve_health_score, nrs, esc, ecw_kg, icw_kg, spo2_pct },   // only keys present
segments: { torso|left_arm|right_arm|left_leg|right_leg: { ffm_kg, fat_kg, muscle_kg } },      // pos 12/3/2/10/11
raw: [ { type, value, unit, position? } ],   // untouched, so new types can be decoded later
raw_hash                                      // skip the write when nothing changed
```

- Decode values as `value × 10^unit` [S37].
- Store SI units at full precision. Convert lb/kg at display time with `js/units.js`.
- **Mirror weight into `weights`** as `users/{uid}/weights/w_<grpid>` (`kg, day, measured_at, source:'withings'`). The existing weight chart, Today card, smoothing and TDEE then work unchanged.
  - Same-day manual entries stay visible, but the trend prefers the device value. Propose the exact rule.
  - `needs_review` groups are excluded from the trend until I confirm "that's me".

**`users/{uid}/health_daily/{YYYY-MM-DD}`** (written only by functions; Phase 2 Shortcut, Phase 3 native)

```
source: 'apple_shortcut' | 'healthkit' | 'apple_export'
hrv_sdnn_ms (mean of overnight samples), hrv_samples, rhr_bpm, sleep: { asleep_min, core_min, deep_min, rem_min,
awake_min, in_bed_start, in_bed_end }, wrist_temp_delta_c, resp_rate, spo2_avg_pct, steps, active_kcal,
exercise_min, vo2max, walking_hr_avg, workouts: [ { type, start, duration_min, kcal, avg_hr } ],
fallback_body: { weight_kg, fat_pct, lean_kg, source_name }   // Withings-written HK samples, used only if the API path fails
```

**`users/{uid}/integrations/{withings|apple}`** (status, no secrets; written only by functions)
- `connected, connected_at, scopes, model, devices[], subscription_ok, last_notify_at, last_sync_at, last_latency_s, needs_reconnect, last_error_code, backfill: {done, groups, from, to}, data_check: {...}, data_check_history: [...]`.
- The Withings `userid` stays in `private/` and `withings_users/`, not here.

**Server-only (never readable by the app):**
- `users/{uid}/private/withings` (`access_token, refresh_token, expires_at, scope, withings_userid, cursor_updatetime`).
- `users/{uid}/private/shortcut` (`token_hash, created_at`).
- Top-level `oauth_states/{state}`, `withings_users/{withingsUserId}`, `shortcut_tokens/{hash}`.

**Client changes**
- Add `READ_ONLY_COLLECTIONS = ['body_measures', 'health_daily', 'integrations']` in `js/db.js`.
- Listen to them, include them in **export** and in **delete everything** (after `withingsDisconnect`).
- Keep them out of `put()`.
- Add `body_measures` and `health_daily` to the CSV export.

### B.6 The "Withings data check" screen (Settings → Withings → Data check)

This is the go/no-go gate for cancelling. The **Run check** button calls `withingsDataCheck`, which:

1. Calls `getdevice` and shows the model and last sync of each device.
2. Calls `getmeas` over the **full history** with `meastypes=1,4,5,6,8,11,54,76,77,88,91,123,130,135,136,137,138,140,155,167,168,169,170,173,174,175,196,226,227,229` (paged). If Withings rejects the combined list (e.g. because of the unverified type 140), fall back to one call per type and report which types were rejected.
3. For every type, reports: count, first and last date, last value (decoded, my units), positions seen (segments), and attrib breakdown.
4. Calls `notify list` (`appli=1`): subscription present? callback URL correct (key masked)?
5. Shows webhook health: last notification time, last end-to-end latency, and the median latency over the last 7 weigh-ins.
6. Shows the backfill: total groups, oldest date, matched against the Withings CSV export count (I type the row count, or import the CSV and Forge compares).
7. Shows Apple data (W2): last `health_daily` day and which fields arrived (HRV/RHR/sleep/temp/steps…).

**The screen lists every metric in §A.1** with one of these states:
- ✅ **Received**: last value · date
- ⛔ **Not available on the free API**: my model measures it (per `getdevice` + the model table in the research) but the API returned nothing. Note: "still free to view in the Withings app; tap to enter it manually."
- ➖ **Not measured by your scale model**
- ⏳ **Not measured yet**: e.g., the nerve score needs a guided measurement.

**Extra controls:**
- **Save report**: snapshots the result into `data_check_history`.
- **Compare**: diffs two snapshots, e.g. "while subscribed" vs. "after cancelling".
- The screen ends with a plain verdict: "Safe to cancel: all metrics your scale produces that the free API provides are flowing, webhook median latency N min" or the specific blockers.

### B.7 Firestore rules + rule tests

Changes:
- `allowedCollection` (client-writable) stays as is.
- Add `serverOwned(col) = col in ['body_measures', 'health_daily', 'integrations']`:
  `allow read: if isOwner(uid) && serverOwned(col); allow delete: if isOwner(uid) && col in ['body_measures','health_daily'];` with **no create/update** from clients.
- `weights` docs with id `w_*` keep the current rules, so I can soft-delete a Withings weigh-in in Forge. The sync must **never un-delete** it: the server writes the mirror only on first sight or when Withings' `modified` changes, and it always preserves `deleted: true`. Document this.
- Keep `users/{uid}/private/**` closed.
- Add explicit `allow read, write: if false` blocks for `oauth_states/**`, `withings_users/**` and `shortcut_tokens/**`. They're already denied by default, but explicit blocks make it testable and documented.

New tests in `tests/rules/rules.test.js`:
- The owner can read `body_measures`, `health_daily` and `integrations`, and can delete `body_measures`.
- The owner **cannot** create or update any of the three.
- Another user can't read them.
- The top-level server collections are denied to everyone, including signed-in users.
- `private/shortcut` is closed.

Function tests (Node test runner, no network):
- meastype decoding and the position → segment mapping.
- Idempotent writes (same grpid twice = one doc; unchanged hash = no write).
- The webhook: HEAD 200, bad key 404, unknown userid 200 no-op, `appli≠1` ignored, transient error → 503.
- Refresh rotation (the new refresh token is persisted before use).
- `state` expiry and one-time use.
- Shortcut payload validation.
- Score, readiness and trend math (B.9–B.10).

### B.8 Apple Health path

**Phase 2 (PWA): Shortcut bridge for Watch metrics** (the brief's §4a, extended)

- **Setup:** Forge Settings → Apple Health → **Create Shortcut token** (shown once, with a copy button). Forge shows step-by-step Shortcut instructions; an importable iCloud Shortcut link is fine if you can produce one that I review.
- **Shortcut contents:** for the window "yesterday 18:00 → now", one **Find Health Samples** action per type:
  - Heart Rate Variability
  - Resting Heart Rate
  - Sleep (sleep-stage segments)
  - Wrist Temperature
  - Respiratory Rate
  - Blood Oxygen
  - Steps
  - Active Calories
  - Exercise Minutes
  - Cardio Fitness (VO₂max)
  - Walking Heart Rate Average
  - Weight / Body Fat % / Lean Body Mass (fallback)

  Plus **Find Workouts**, then **Dictionary → Get Contents of URL** (POST JSON, `Authorization: Bearer <token>`) to `healthIngest`.
- **Trigger:** Personal Automation **Sleep → "Waking Up"** or **Time of Day** (e.g. 8:30), set to **Run Immediately**. Add a second evening run for steps and active energy.
- **Platform facts to design around:**
  - Shortcuts can read HRV, resting HR, sleep stages, steps, active energy, workouts and VO₂max with **Find Health Samples**.
  - **ECG records are not available to Shortcuts**, so ECG waits for P3. Until then it's a manual log plus the Health app's PDF export.
  - **Wrist Temperature** shows up in 2026 Shortcut docs as a Find Health Samples type but was missing in early iOS 16 reports. **Verify on my iPhone (iOS 27.2) during W2**; if it's missing, it waits for P3 or the export-zip import. It needs Apple Watch Series 8+/Ultra/SE 3 and ~5 nights of sleep tracking, and it's a **delta from baseline**, not an absolute temperature.
  - Health data is protected while the iPhone is locked, and automations can fail then. The "Waking Up" trigger (phone just unlocked) is the most reliable. The function must accept late or duplicate posts (upsert by day, merge fields).
- **Baseline seed:** the brief's **Apple Health export.zip import** (§4b) goes into W2 too, so Readiness and the Score have 28+ days of HRV/RHR/sleep history on day one, not after a month.

**Phase 3 (Capacitor + HealthKit)**
- Read `bodyMass, bodyFatPercentage, leanBodyMass, bodyMassIndex` (fallback, deduped against the API by timestamp ±2 min and source "Withings"), plus `heartRateVariabilitySDNN, restingHeartRate, sleepAnalysis, appleSleepingWristTemperature, respiratoryRate, oxygenSaturation, stepCount, activeEnergyBurned, appleExerciseTime, vo2Max`, workouts, and **`HKElectrocardiogram` (read-only: classification, average HR)** [S49][S50].
- Use `HKObserverQuery` + background delivery [S51].
- Same `health_daily` docs, with `source:'healthkit'`. The Shortcut becomes optional.
- **Withings → Apple Health export** (Withings app → Profile → Settings → Export health data to Apple Health [S24b]) stays on as the redundant path. It only syncs when the Withings app runs [S24c].

### B.9 Forge Score (Withings+ Health Improvement Score replacement)

- The score is 0–100, computed **daily** and shown as a 7-day average. Each pillar is 0–100.
- **Weights are shown in the app.** When a pillar has no data, its weight is redistributed proportionally and the UI says "Nutrition: not tracked yet".
- Every component maps to 0–100 with a **documented piecewise-linear function** in `docs/forge-score.md`, with unit tests. Cite each threshold's source in that doc. Where none exists, call it a Forge default.

| Pillar | Default weight | Components (equal weight inside the pillar unless noted) |
|---|---|---|
| **Body** | 25% | (a) **Trend vs. goal**: EWMA weight 28-day slope vs. goal direction and the safe pace (≤ ~1% bodyweight/week, brief §2.5). On-pace = 100; wrong direction or too fast scores lower. (b) **Fat-mass trend** (W:8, 28-day Theil–Sen slope) in the goal direction. (c) **Lean preservation**: FFM/muscle 28-day change ≥ −0.1 kg/week during a cut = 100, scaled down below that. (d) **FMI band** (Kyle 2003 [S60]) |
| **Recovery** | 20% | (a) **HRV**: 7-day mean of ln(SDNN) vs. 28-day baseline (z-score; ≥ 0 = 100, −2 SD = 0). (b) **RHR**: 7-day vs. 28-day baseline (inverted z). (c) **Wrist temp**: \|delta\| ≤ 0.5 °C = 100, ≥ 1.0 °C = 0 (Forge default). (d) **Respiratory rate** deviation from baseline |
| **Sleep** | 15% | (a) **Duration**: 7-day mean asleep time, ≥ 7 h = 100 (adult recommendation; cite). (b) **Regularity**: SD of sleep midpoint (≤ 30 min = 100). (c) **Deep+REM share** (light weight, 20%) |
| **Training** | 25% | (a) **Workouts done vs. planned** this week (Forge). (b) **Activity**: weekly exercise minutes vs. 150 (WHO 2020) and the steps target. (c) **Load balance**: acute:chronic training-load ratio in the 0.8–1.3 band (Forge default). (d) **Strength trend**: e1RM slope on main lifts |
| **Nutrition** | 15% | Lights up after Checkpoint C. (a) Days logged / 7. (b) Calories within ±10% of target. (c) Protein ≥ target (1.6–2.2 g/kg per brief §5.4) |

**Display:** the score, "what moved it" (top 3 component deltas vs. last week), pillar rings, and a tap-through to the raw inputs. Never compare to Withings' numbers.

**Readiness** is computed separately, every morning from `health_daily`.
- Inputs: z-scores of HRV (+), RHR (−), sleep duration (+), |wrist temp delta| (−) and respiratory rate (−) vs. the 28-day baseline (needs ≥ 14 days, seeded by the export zip), plus yesterday's training load (`js/workouts/recovery.js`).
- **Green / Amber / Red** with the top reason in plain words.
- **Feeds the generator:** Amber → −1 set on accessories. Red → suggest deload/mobility, and I can override.

### B.10 Trends, anomalies and insights (Smart Trends + Measurement Insights replacement)

**Trends**
- Per metric, compute 7/28/90-day Theil–Sen slopes + Mann–Kendall p-values.
- Report a trend only when it's significant **and** larger than the metric's noise floor. Each metric's noise floor lives in `data/metrics.json`; e.g., BIA fat % is noisy day to day.

**Anomaly rules (start set; all thresholds in one table, documented)**
- Weight > 1.5% off the trend in a day **with** water mass moving the same way → "likely water, ignore".
- Fat % jumps > 2 points in a day → "bioimpedance noise (hydration, time of day); trend unchanged".
- `attrib=1` → review queue.
- HRV 7-day −15% vs. 28-day baseline.
- RHR +5 bpm for 3+ days.
- Wrist temp +0.5 °C or more for 2+ nights.
- Sleep < 6 h for 3 nights.
- No weigh-in for 7 days.
- A webhook silent for > 48 h while weigh-ins exist in `getdevice` last-sync.

**Ranking and phrasing**
- Rank by severity × recency and show the top 3 cards on Today and Body.
- Rule templates produce the facts.
- With AI on, the provider may **rephrase** facts it's given. It never computes or invents numbers. With "none", the templates are the final text.

**Metric explainers** go in `data/metrics.json`, one entry per metric: name, what it is, how the scale or Watch estimates it, what moves it, typical ranges with a source, accuracy caveats, and "what to do in Forge". Write it in our own words.

### B.11 Hosting changes and cost

**Spark → Blaze**
- Functions need the Blaze (pay-as-you-go) plan.
- Set a **$1–$5 budget alert**. It only **emails**; it doesn't stop charges. `maxInstances` and the webhook key are the real guards.

**Expected cost: $0/month at my usage**

| Item | My usage | Free allowance |
|---|---|---|
| Function invocations | ~1–2/day webhook + 1 daily maintenance + ~1–2/day Shortcut + manual syncs, i.e. ≈ 150/month | 2,000,000/month |
| Function compute | Negligible | 400k GB-s, 200k CPU-s |
| Secret Manager | 2 secret versions; a few hundred accesses (each cold start) | 6 versions, 10,000 accesses |
| Cloud Scheduler | 1 job | 3 jobs per billing account (shared with any other project on the same billing account) |
| Firestore | One-time backfill ≈ one write per weigh-in in history (likely < 5k writes); then a few writes/day | Already within the existing free quota |
| Artifact Registry | Function container images | 500 MB; set a cleanup policy at deploy so old images are deleted, otherwise expect pennies |
| Cloud Build | Deploy minutes | 120 min/day |

- **Withings API:** Start for Free, 10 users max (I'm 1).

**Other changes**
- **CSP:** add `https://us-east1-forge-web-f2351.cloudfunctions.net` to `connect-src` (callables). Navigating to `account.withings.com` is a top-level navigation and doesn't need `connect-src`.
- **Repo layout:** add a `functions/` folder (Node, its own `package.json`) and a root `firebase.json` (`functions` + `firestore.rules`).
  - GitHub Pages will publish `functions/` source as static files. That's fine because there are no secrets in it, but `.gitignore` `functions/node_modules` and keep the service worker from caching it.
  - `DEPLOY.md` gains a "Deploying functions" section: `firebase deploy --only functions,firestore:rules`.

---

## C. Pre-cancellation checklist (in order; don't skip the verification)

1. **Before Mon Oct 12, 2026: don't create any new Withings account.**
   - Use my existing account everywhere: the developer dashboard, the authorize page, a new scale.
   - Don't reset the scale into a new account.
   - Write down my Withings+ **renewal date** (iPhone Settings → [my name] → Subscriptions → Withings).
2. **Export my Withings data first** (do this now, while subscribed):
   - Withings app → Profile → Settings → **Export All Health Data** (CSV), and the **PDF export**, saved to iCloud Drive/Mac [S25].
   - The CSV lacks visceral fat, vascular age and segmental data [S25], so also **screenshot** those screens in the Withings app (latest values + 1-year charts).
3. **Turn on Withings → Apple Health export** for Weight, BMI, Body Fat %, Lean Body Mass and Heart Rate (a redundant path) [S24b].
4. **W1 shipped** (Blaze, functions deployed, Withings connected with my **existing** login).
5. **Backfill complete:** the data check's group count and oldest date match the CSV export (± manual entries).
6. **Run the data check while still subscribed** → **Save report**. Note which metrics are ⛔ "not on the free API". Decide on each ⛔ metric: accept viewing it in the free Withings app, or use Forge's manual monthly entry.
7. **Webhook proof:** 7 consecutive days of normal weigh-ins, each appearing in Forge **on its own within ~5 minutes** (the data check shows the median latency; Withings' typical delay is < 2 min with no SLA [S42]). Also confirm one "Sync now" and one maintenance-run reconcile.
8. **W2 dogfood:** the Shortcut posting daily (or the export zip imported), Readiness and the Forge Score computing, ≥ 1 Sunday weekly report received, trend cards appearing. Run it alongside Withings+ for **≥ 14 days** and note anything Withings+ told me that Forge didn't.
9. **Confirm the account:** the Withings developer dashboard and the Forge connection both show my long-standing Withings account (same email as the scale's account).
10. **Cancel** in iPhone Settings → [my name] → Subscriptions → Withings+ (it was bought through the App Store) [S14].
    - Access continues to the end of the billing period, with no partial refunds [S15].
    - The scale and the free app keep working [S16].
    - Time it so the period ends after step 8.
11. **After the period ends:** run the data check again and **Compare** with the saved "subscribed" report. Expect no difference. If anything disappears, resubscribing is possible, and per Withings history isn't deleted when sharing pauses [S40].

---

## D. Steps I do myself on my own devices (you guide me; I never share secrets)

Give me these as numbered, click-by-click steps at the right moment in the plan. **I share only non-secret values back:** the Client ID, the deployed function URLs, and whether a step worked.

1. **Now (before Oct 12):** checklist items C1–C3 (no new account; note the renewal date; Withings CSV + PDF export + screenshots; Withings → Apple Health toggles). Also check:
   - my scale model (Withings app → Devices);
   - my Apple Watch model (Watch app → General → About; wrist temperature needs Series 8+/Ultra/SE 3).
2. **Upgrade Firebase to Blaze + budget alert** (at the start of W1):
   - Firebase console → project **forge-web-f2351** → ⚙️ → **Usage and billing** → **Details & settings** → **Modify plan** → **Blaze** → pick or create a Cloud Billing account (my card) → set a **$1–5 budget** when prompted.
   - Then in Google Cloud console → **Billing → Budgets & alerts**, confirm the alert emails me at 50/90/100%.
   - Note: an alert only warns.
3. **Install tools on my Mac** (one time): Node 22 (`brew install node@22`), then `npm install -g firebase-tools`, then `firebase login` (sign in on my Mac's browser) and `firebase use forge-web-f2351` in the repo folder.
4. **Register the Withings developer app:**
   - Go to developer.withings.com → **Log in with my existing Withings account** (not a new one) → Dashboard → create a **Public API** application. Name: "Forge (personal)". Description: "Personal fitness app for my own data". Contact: my email.
   - **Callback URL:** `https://us-east1-forge-web-f2351.cloudfunctions.net/withingsOAuthCallback` (you confirm the exact URL after the first deploy).
     - Withings checks the URL with an HTTP HEAD when you save. If I register **before** the functions exist, I enter `https://christianeverett1988-boop.github.io/forge/` for now and change it after deploy.
   - Copy the **Client ID** (share it with you) and the **Client Secret** (never share).
5. **Store the secrets** (in my Terminal, in the repo folder):
   - `firebase functions:secrets:set WITHINGS_CLIENT_SECRET` and paste the secret at the hidden prompt.
   - `firebase functions:secrets:set WITHINGS_WEBHOOK_KEY` and paste the output of `openssl rand -hex 24`.
6. **Deploy:**
   - Run `firebase deploy --only functions,firestore:rules`. Accept the prompts to enable the required Google APIs and set the container-image cleanup policy.
   - Push the front end via GitHub Desktop as usual (bumped version).
7. **Connect:** Forge → Settings → Withings → **Connect** → Withings page → **Log in** (existing account) → allow → "Connected, switch back to Forge" → Forge shows the backfill progress.
8. **Run the data check** → Save report (C6), then weigh in normally for 7 days (C7).
9. **W2:**
   - Forge → Settings → Apple Health → **Create Shortcut token** → build or import the Shortcut → paste the token into it → set the "Waking Up" automation to **Run Immediately** → tap "Run" once.
   - On the first run, iOS asks to allow Shortcuts to read each Health type. Allow them, then confirm in Forge's data check.
   - Also: Health app → profile → **Export All Health Data** → Forge → Import (baseline seed).
10. **Cancel** Withings+ when C1–C9 pass (C10), and rerun the data check after the period ends (C11).

---

## E. Order and checkpoints

1. **Now:** the open `fix/v0.3.2` PR (my v0.3.1 must-fixes + v0.3.2 XP/badges), then the **Train preview-parity PR**.
2. **W1: Withings backend + body metrics + data check.** Proposed to go **before Checkpoint C (food)**:
   - It's the gate for cancelling a recurring $9.99/month charge.
   - It's smaller than food.
   - It sets up the `functions/` folder, Blaze and Secret Manager that C needs anyway (C's USDA key function).
   - W1 done = brief Phase 2's acceptance line: "a Withings weigh-in shows up in the app within a few minutes on its own".
3. **W2: Watch bridge + Forge Intelligence** (Shortcut + export-zip import, Readiness, Forge Score with Nutrition "not tracked yet", trends/anomalies, explainers in context, Sunday report, missions on XP, goal path/ETA, Body Profile, manual ECG log). Could split into W2a (bridge + Readiness + Score) and W2b (reports, missions, Body Profile).
4. **C: food.** Then the Nutrition pillar and adaptive TDEE in BodyPath light up.
5. **D: progress photos**, then P3 (Capacitor/HealthKit: ECG classification, background delivery, scale fallback).
