# Changelog

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
