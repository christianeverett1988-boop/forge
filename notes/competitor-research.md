# Forge v0.3: competitor and media-licence research

Compiled 2026-10-08 (ET) for the "experience overhaul" prompt. Legend: **[PDF]** = seen in Christian's own screenshots; **[src N]** = see Sources; **(unverified)** = not confirmed.

## 1. What Christian's two PDFs show
Both PDFs are iOS Photos exports of iPhone screenshots, image-only with no text layer, taken 12:46–12:53 AM on Oct 8.

**PDF `2e5077…` (20 pages)**
- **Pages 1–9: Christian's own Fitbod account.** Dark UI with a pink-red accent and tabs Workout / Body / Targets / Log.
  - **Exercise detail:** looping video of a real person, two camera angles as thumbnails, a 1.0x speed control, and **Instructions | Target** tabs. Instructions are numbered text steps.
  - **"Up Next" workout:** "14 Exercises • 8 Muscles", a **Switch** button, duration (1h) and location (Home) chips, a **Warm-up** section (+6m), **Circuit · 3 Rounds**, **Superset · 4 Rounds**. Each row has a thumbnail and sets·reps·weight, plus **Add Exercise** and a sticky **Start Workout** button.
  - **Inside an exercise:** a **How-To** button, a chip row (**Rest timer: off**, **History**, **Replace**, More) and editable set rows (e.g. duration 1:30 / 90 reps).
  - **My Plan:** goal, Injuries/Limitations (beta), location, equipment, bodyweight-only, workouts/week, duration, experience, training split, exercise variability, focus exercises, warm-up sets toggle.
  - **Body › Results:** **Overall Strength 58** with a segmented bar, Push 62 / Pull 63 / Leg 51 "mSTRENGTH", Benchmark Lifts.
  - **Body › Recovery:** full-body **muscle avatar** with a rotate button, "0 days since your last workout", "10 fresh muscle groups".
  - **Targets:** "Weekly Set Targets" **hexagon progress ring** (0%), Push 0/29, Pull 0/14, Leg 0/27 sets, and a row of past weekly hexagons.
  - **Log:** a number "442" next to badge-like icons (meaning unverified), Weekly goal 0/3 days, **Current streak 0 weeks**, calendar, past-workout cards (exercises, volume 4,500 lb, 198 kcal).
- **Pages 10–20: start of the "Workouts For Men" (BetterMen) onboarding.** A "TRANSFORM YOUR BODY" 3D hero, then quiz steps: goal (photo cards), motivations, focus areas (tick list next to a body figure), body type now and goal body, gym/home, activity level, push-up count.

**PDF `a11a91…` (30 pages): the rest of BetterMen**
- Lifestyle quiz with picker wheels and BMI warnings, a "Summary of your fitness level" BMI gauge, a special-event date, a projected weight curve, a **"Creating your plan" animated % ring with a checklist**, and "Your personalized plan is ready".
- Two "Demo workout" explainer pages, then upsell offers ($29.99–$49.99 add-ons).
- **Home:** a swipeable program card ("Bigger Chest", illustrated torso with the **target muscles highlighted in red**, progress 0/12, Open Program). Tabs Workout / Food / Profile.
- **Workout overview:** "14 MIN · Easy", one row per set, each with a video thumbnail, and Start Workout.
- **Player:**
  - full-screen **countdown "2… Go!"**;
  - **"EXERCISE 1 OF 13"** segmented progress bar;
  - **looping demo video**;
  - name + "SET 1";
  - **huge "10 reps"**;
  - **"Next: …" line**;
  - **PAUSE** and **NEXT** buttons.
- **Rest screen:** full-screen blue **"Rest Time 00:29 / 01:00"** countdown, **Skip Rest**, and a **next-exercise preview card** (thumbnail, name, reps).

**Takeaway.** BetterMen's player is simple, but it has the "follow-along" structure Forge lacks: countdown, one exercise at a time, video, giant rep target, next preview, pause, and a full-screen rest. Fitbod adds the analytics layer: recovery avatar, strength score, weekly set targets, streaks, and superset/circuit/warm-up structure with Replace/History per exercise.

## 2. The "Workouts for Men" app
It is **"Workouts For Men: Gym & Home"** by BetterMe Trading Limited, App Store id1424128078, Google Play `com.gen.bettermen`. It is branded **BetterMen** in the app, which matches the PDFs. [src 1, 2]
- **Store copy:** "Hundreds of gym & home workouts", "Clear instructions and videos for all exercises", meal plans, Health App integration; "Our detailed video and animation guides".
- **Price:** subscription, roughly $9.99/week to $59.99 per 6–12 months, plus meal/"Kegel" plan add-ons. [src 1]

## 3. Feature catalogue by app
| App | Workout player / logging | Demos | Muscles / recovery | Motivation | Watch / audio |
|---|---|---|---|---|---|
| **Fitbod** | Up Next plan with warm-up, supersets and circuits; per-set rows; Replace; History; rest timer per exercise [PDF] | Looping HD videos, 1,600+ claimed [src 5]; How-To, Instructions/Target tabs [PDF] | Recovery avatar 0–100% per muscle, front/back, tap a muscle for its history, ~6 days to full recovery, imported cardio counts [src 3]; post-workout heat map of muscles used [src 3] | Overall Strength + mStrength (Push/Pull/Legs), Benchmark Lifts, records (est. strength, volume, reps, weight, time) [src 4]; weekly set-target hexagons, streak in weeks [PDF]; weekly/monthly Workout Report [src 6] | Watch logs sets, rest timer with haptic + audio, live HR; iPhone starts and saves [src 7] |
| **Workouts For Men (BetterMen)** | Countdown, one exercise at a time, "Exercise X of N", big reps, Next preview, Pause/Next, full-screen rest + Skip + next preview [PDF] | Real-person looping video per exercise [PDF][src 1] | Muscle-highlight art on program cards [PDF] | Program progress 0/12, "plan ready" ring animation [PDF] | Health app integration [src 1]; no evidence of a Watch app (unverified) |
| **Hevy** | Session stopwatch (can pause/restart), sets + volume counter, auto rest timer per exercise (5 s–5 min, ±15 s), set types (warm-up, drop, failure), supersets with smart scrolling, RPE, warm-up calculator, plate calculator, previous values inline [src 8, 9] | Illustrations/animations (per user reviews on its site) [src 8] | Muscle-distribution chart / body diagram, sets per muscle [src 10] | **Live PR banner** when a set beats 1RM/weight/reps/volume/duration [src 11]; finish screen: "Nth workout", weekly streak, PR highlights, 7-day consistency, shareable images (transparent/light/dark) [src 8] | Live Activity on the lock screen (next exercise, rest timer, skip) [src 12]; Apple Watch logging [src 10] |
| **Strong** | Auto rest timers (adjustable on watch), warm-up calculator (Pro), plate calculator, PR/1RM stats [src 13, 14] | (none noted) | (none noted) | PR records | Standalone Apple Watch logging [src 13] |
| **Muscle Booster** | Workout Player with guided instructions, **audio tips**, workout + rest timers [src 15]; Workout Creator (muscles, duration, equipment, difficulty) [src 16] | 3,000+ exercise library; animated models highlighting muscles + video (per its publisher's review page) [src 15, 17] | **Muscle recovery map** after every workout [src 16] | Fitness challenges, progress tracking; post-workout feedback adjusts difficulty [src 16] | AI coach; camera "Fitness Check" [src 16] |
| **Peloton Strength+** | Custom workout generator (muscle focus, length, equipment, experience), coach-led multi-week programs, **swap any exercise**, movement breakdown at the start of each block [src 18] | Coach-led demo clip during every exercise [src 18] | Muscle-focus targeting [src 18] | Detailed post-workout stats; counts toward Peloton streaks [src 18] | **Audio cues and technique tips**; Apple Watch: navigate, rest timer, adjust weight/reps, view demos [src 18] |
| **Apple Fitness** | (none noted) | (none noted) | (none noted) | Activity rings, Trends, **Awards** (PRs, streaks, milestones) [src 19]; ring-closing fireworks on Apple Watch [src 20] | Native Watch |

## 4. Forge v0.2.1 today (from the code at /tmp/forge-push)
- **Logger (`js/screens/session.js`):** a scrolling list of exercise cards with set rows (last session inline, RIR, ✓), supersets, warm-ups, swap, add set, an elapsed clock, a rest bar (`js/timer.js`) and Screen Wake Lock.
- **Missing in the workout:** no pause of the workout, no guided one-at-a-time player, no countdown, no next-up preview. Finishing opens a plain sheet (time, sets, volume, PRs).
- **How-to:** a text sheet with cues and free-exercise-db steps. It opens by tapping the exercise name, which is easy to miss. **No images or video.**
- **Muscles:** text only. Recovery shows as % bars on Train (`.rec-bar`). **No body map anywhere.**
- **Celebration:** one PR overlay (`celebrate()` in `js/ui.js`) with an 18-particle CSS burst. Nothing when a set is completed.
- **Not built:** streaks, badges, XP or levels (none in the code), rings on Today (calorie number only), screen transitions, skeleton loaders.
- **Already there:** `prefers-reduced-motion` kills all animation globally. `navigator.vibrate` is called but ignored on iPhone. Speech cues exist only in the interval timer.

## 5. Demo media: options and licences
| Source | Licence (verified) | Cost | Offline / CSP fit | Verdict |
|---|---|---|---|---|
| **free-exercise-db** (yuhonas) | `LICENSE.md` is **The Unlicense** (public domain). Upstream `wrkout/exercises.json` is also Unlicense / "Public Domain". [src 21, 22] | Free | 873 exercises have 2 JPGs (start and end position, 850×567). Forge links 174 unique fedb ids, and **172 have images**. Vendor them into the repo so they stay under `img-src 'self'` and work offline. | **Pick.** Show the two frames as a crossfading loop (a 2-frame "flipbook"). Caveat: where the photos were originally shot is **not documented** (unverified). Fine for a private app; re-check before any public or commercial release. |
| **wger** | Per-image and per-video licence fields. Licence ids: 1 = CC-BY-SA 3, 2 = CC-BY-SA 4, 3 = CC0, 4 = CC-BY 4. Some images are flagged `is_ai_generated`. [src 23, 24] | Free | **379 images, 78 videos** (videos are e.g. 1080p HEVC .MOV, about 34 MB for 10 s). Needs attribution and share-alike; transcode before use. | **Later:** gap filler with an attribution line. |
| **ExerciseDB (AscendAPI)** | Proprietary subscription licence. Rights end when the subscription ends; no redistribution. GitHub repo marked AGPL but has no code. [src 25, 26] | V1 free = 180p GIFs, ~1,500 exercises; V2 free = watermarked; clean media paid via RapidAPI | Needs an API key (no secrets in the front end), so it can't be cached for good. | Reject. |
| **MuscleWiki API** | Proprietary. **No downloading or storing videos for offline use**; must stream from their URLs; credit required. [src 27] | $10–$199.99/month; free tier is Playground-only [src 28] | Breaks offline-first and zero cost. | Reject. |
| **YouTube embed** | Privacy-enhanced `youtube-nocookie.com` keeps views from personalising YouTube or ads [src 29]. YouTube's terms don't allow keeping videos for offline (stated from general knowledge; not re-checked this session). | Free | Needs CSP `frame-src https://www.youtube-nocookie.com`; online only. | Optional "Watch on YouTube" **link-out**, no embed, so the CSP stays `frame-src 'none'`. |

## 6. Muscle map SVG
- **Pick: `react-native-body-highlighter`** v3.2.0 by Hicham ELABBASSI, **MIT** (LICENSE checked in the npm tarball; last release 2026-04-13). [src 30]
  - Front and back paths are plain JS arrays in `dist/assets/bodyFront.js` and `dist/assets/bodyBack.js` (~50 KB together), keyed by slug with left/right paths. viewBox is front `0 0 724 1448`, back `724 0 724 1448`.
  - Slugs: chest, abs, obliques, biceps, triceps, forearm, deltoids, trapezius, upper-back, lower-back, gluteal, hamstring, quadriceps, adductors, calves, tibialis, neck, plus head, hands and feet (female variants also exist).
  - Copy the path data into a plain ES module (no React) and keep the MIT notice.
- **Mapping to Forge's 19 muscles:** `deltoids` is one shape, so front_delts and side_delts go on the front view and rear_delts on the back. `lats` → upper-back. There is no `abductors` slug in this version, so use gluteal.
- **Alternative:** `react-body-highlighter` (giavinh79, MIT; same polygons, last pushed 2023). [src 31]

## 7. iPhone platform limits that affect "feel"
- **Haptics:** Safari has no `navigator.vibrate`. iOS 18+ gives a haptic only when the user really taps a native `<input type="checkbox" switch>`. Scripted clicks are blocked by newer WebKit. [src 32, 33, 34] Real haptics need the Capacitor wrapper (Phase 3).
- **Screen Wake Lock:** works in Home Screen web apps from iOS 18.4. [src 35]
- **Background:** iPhone pauses web timers when the app is backgrounded or the phone is locked, so timers must be timestamp-based (Forge's already are).
- **Sound:** Web Audio needs one user tap to unlock (Forge has `unlockAudio`). `speechSynthesis` already works in the interval timer.

## Sources
1. App Store, Workouts For Men: Gym & Home — https://apps.apple.com/us/app/workouts-for-men-gym-home/id1424128078 (and the GT/GM storefronts)
2. Google Play, com.gen.bettermen — https://play.google.com/store/apps/details?id=com.gen.bettermen
3. Fitbod Help, Muscle Recovery — https://help.fitbod.me/hc/en-us/articles/360006269014-Muscle-Recovery
4. Fitbod Help, Metrics & Records — https://fitbod.zendesk.com/hc/en-us/articles/12732749777047-Fitbod-Metrics-Records
5. Fitbod Help, How Fitbod Creates Your Workout (1,600+ videos, per search summary) — https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout
6. Fitbod Help, Your Workout Report — https://help.fitbod.me/hc/en-us/articles/16436302450711-Your-Workout-Report
7. Fitbod Help, Apple Watch — https://help.fitbod.me/hc/en-us/articles/360006499194-Apple-Watch
8. Hevy, Log & Track Workouts — https://www.hevyapp.com/features/track-workouts/
9. Hevy, Rest Timer — https://www.hevyapp.com/features/workout-rest-timer/
10. Hevy, Gym Performance — https://www.hevyapp.com/features/gym-performance/ (per search summary)
11. Hevy, Live PR — https://www.hevyapp.com/features/live-pr/
12. Hevy, Live Activity — https://www.hevyapp.com/features/live-activity/ (per search summary)
13. Strong Help, Apple Watch — https://help.strongapp.io/article/224-workout-on-apple-watch
14. Strong Help, Warm-up Calculator — https://help.strongapp.io/article/171-warm-up-calculator ; Rest Timer — https://help.strongapp.io/article/231-rest-timer
15. Google Play, Muscle Booster — https://play.google.com/store/apps/details?id=musclebooster.workout.home.gym.abs.loseweight (per search summary)
16. Muscle Booster features — https://musclebooster.welltech.com/features/
17. Welltech, KevTheTrainer review — https://welltech.com/content/kevthetrainers-muscle-booster-app-review (publisher-hosted; per search summary)
18. Peloton Strength+ — https://www.onepeloton.com/strength-plus-app
19. Apple Support, Fitness activity summary/awards — https://support.apple.com/guide/iphone/see-your-activity-summary-iph4c34a8a95/ios
20. Apple Community, ring-completion fireworks — https://discussions.apple.com/thread/252009834
21. free-exercise-db — https://github.com/yuhonas/free-exercise-db (README + LICENSE.md, fetched raw)
22. wrkout/exercises.json — https://github.com/wrkout/exercises.json (LICENSE.md, package.json)
23. wger licences API — https://wger.de/api/v2/license/
24. wger images/videos API — https://wger.de/api/v2/exerciseimage/ , https://wger.de/api/v2/video/
25. AscendAPI ExerciseDB V1/V2 — https://docs.ascendapi.com/products/edb-v1/overview , https://docs.ascendapi.com/products/edb-v2/overview
26. ExerciseDB API Terms — https://edb-docs.up.railway.app/docs/api-terms-of-use
27. MuscleWiki API Terms — https://api.musclewiki.com/api-terms
28. MuscleWiki pricing — https://api.musclewiki.com/pricing
29. YouTube Help, privacy-enhanced mode — https://support.google.com/youtube/answer/171780
30. react-native-body-highlighter — https://github.com/HichamELBSI/react-native-body-highlighter ; npm 3.2.0 tarball LICENSE
31. react-body-highlighter — https://github.com/giavinh79/react-body-highlighter
32. StackOverflow, navigator.vibrate on iOS — https://stackoverflow.com/questions/56926591
33. WebKit, Safari 18.0 features (switch control) — https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
34. WebKit PR, switch haptics need user activation — https://github.com/WebKit/WebKit/pull/38473
35. WebKit bug 254545, Wake Lock in Home Screen web apps — https://bugs.webkit.org/show_bug.cgi?id=254545 ; Safari 18.4 release notes

## YouTube walkthroughs
Downloads were blocked from the box by YouTube's bot check. Candidate URLs are in `videos/CANDIDATES.md`; a separate browser pass is reviewing them.
