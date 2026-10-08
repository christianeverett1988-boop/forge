# Forge: replace Withings+ (plan first, no code)

I've already cancelled Withings+ ($9.99/month), and **my access ends November 1, 2026**. When I weigh in, Forge has to track everything the Withings app and Withings+ give me, and do it better with my Apple Watch, training and food data. **W1 must be live and verified on my account well before Nov 1.**

My devices: a **Withings Body Comp** scale (weight, fat/muscle/bone/water, visceral fat, BMR, metabolic age, standing heart rate, vascular age, nerve health score; no segmental data, no ECG) and an **Apple Watch Ultra 2** (watchOS 26.6, which has wrist temperature). My iPhone is on iOS 27.2.

**Read first:** `notes/brief-addendum-3-withings-plus-replacement.md` (the spec; it wins over the original brief). Then `firestore.rules`, `js/db.js`, `js/weight/`, `js/workouts/recovery.js`, `tests/rules/`, `DEPLOY.md`, `SETUP.md`.

**Time-sensitive:** Withings accounts created after **Oct 12, 2026** need Withings+ to share data, including through Apple Health. Mine is older; I'll never create a new one. Every connect screen and setup step must say "log in with your existing account".

## Where this fits
1. PRs #5–#7 are merged. Small v0.3.2 follow-ups may come from my reviewer separately; keep them out of the Withings PRs.
2. Next is **W1: Withings backend + body metrics + data-check screen**, **before Checkpoint C (food)**. It beats the Nov 1 deadline, it's smaller than food, and it sets up the `functions/` folder, Blaze and Secret Manager that C needs anyway.
3. Then **W2: Shortcut bridge + Health export-zip import, Readiness, Forge Score, trends/anomalies, explainers, Sunday report, missions on the v0.3.2 XP system.** Split it if that's safer.
4. Then C, which turns on the Nutrition pillar and adaptive TDEE.

## Constraints
- PWA unchanged: plain ES modules, no build step. `functions/` is Node, 2nd gen, us-east1, `maxInstances: 2`.
- No secrets in the front end or the repo. `WITHINGS_CLIENT_SECRET` and `WITHINGS_WEBHOOK_KEY` use `defineSecret`, and I set them myself.
- Tokens live only in `users/{uid}/private/withings`. Never log tokens or health values.
- AI stays optional: rule-based fallbacks everywhere, and "none" must work.
- No Bluetooth hacking. No diagnoses.
- Work on a branch with a PR, as before. Bump the version, update the CHANGELOG, write tests (including rules tests).
- Leave `config.js` untouched.
- Target $0; warn me before anything could cost money.

## Reply with a plan only
1. **Data model.** `body_measures` (one doc per `grpid`, per-metric fields, segments, raw measures, attrib review), the `w_<grpid>` mirror into `weights` (same-day manual entries, soft-deletes never undone), `health_daily`, `integrations/withings`, the server-only docs, and how `js/db.js` handles read-only collections in listeners, export and delete-everything.
2. **Functions.** Trigger, inputs, outputs and failures for each of these:
   - OAuth start and callback: one-time `state`, the 30-second code, and the problem of the home-screen app and Safari not sharing storage.
   - The token-refresh lease: refresh tokens rotate, and the old one dies after 8 h.
   - The full-history backfill.
   - The webhook: HEAD → 200, the secret `?k=` key, unknown `userid`, `appli`, `lastupdate` sync, idempotent writes, 503 on transient errors.
   - Daily maintenance, sync-now, data check, disconnect, `healthIngest` and Shortcut tokens.
3. **Rules.** The changes in plain words, plus every new test.
4. **Screens.**
   - Settings → Withings.
   - The **data-check screen**: every metric with its last value and date, or one of "not on the free API", "not measured by your model" or "not measured yet". It also shows the subscription check, webhook latency and backfill count, has save/compare reports, and ends with a "safe to cancel?" verdict.
   - The Body charts, the explainer sheet, Readiness on Today, the Score screen and the weekly report.
5. **Score and Readiness.** Formulas, weights, 0–100 mappings and how missing pillars renormalize. Give a source for each threshold or call it a Forge default. Say how Readiness changes the generated workout.
6. **Trends and anomalies.** Each rule with its threshold and noise floor.
7. **Apple Health.** Exact Shortcut steps and payload. What Shortcuts can't read (ECG; check wrist temperature on iOS 27.2) and each fallback. What waits for Phase 3 HealthKit.
8. **My steps**, click-by-click, marked by when I do them (now / start of W1 / after deploy / W2):
   - the Blaze upgrade and budget alert;
   - Node and firebase-tools on my Mac;
   - registering the Withings developer app with my existing login, including the callback URL. Withings checks it with a HEAD request when I save, so tell me what to enter if I register before you deploy;
   - setting the secrets, deploying and connecting;
   - building the Shortcut.
   List the non-secret values I should send you.
9. **Verification gate.** I've already cancelled, so turn addendum §C into a schedule: what has to be verified on my account, and by when, before access ends Nov 1. Also say what I should save from the Withings app before then for anything the free API can't return.
10. **Risks, a cost table, and your questions** (five at most).

Keep the plan tight so we can start W1 today. Then wait for my go.

**Separate small change (in any PR):** slow the top of the level curve. Keep early levels quick, but at 3 workouts a week the top level (Unbreakable) should take about 2 years, not about 44 weeks. Update `docs/levels.md` and the tests.
