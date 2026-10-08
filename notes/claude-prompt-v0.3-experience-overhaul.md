# Forge v0.3: experience overhaul

I tested v0.2.1 on my iPhone. It works and the logic is solid, but it feels basic. I couldn't pause the workout, nothing animates when I finish a set, and I never saw a how-to visual or which muscles a workout hits. Next to Fitbod and "Workouts For Men: Gym & Home" (BetterMen), Forge loses on feel. **This round is about experience.** The goal is the most motivating workout app I've used, beating Fitbod, BetterMen, Muscle Booster, Hevy and Peloton Strength+.

**Before anything else**, read the repo (github.com/christianeverett1988-boop/forge): `notes/`, CHANGELOG, `docs/workout-algorithm.md`, and the existing screens in `js/screens/`, plus `js/ui.js`, `js/timer.js` and `css/app.css`. Build on them, and keep the progression logic as it is.

**What my screenshots showed:**
- **BetterMen's workout player:**
  - a full-screen "2… Go!" countdown;
  - an "EXERCISE 1 OF 13" segmented progress bar;
  - a looping demo of a real person;
  - "SET 1" with a huge "10 reps";
  - a "Next: …" line;
  - **Pause** and **Next** buttons;
  - a full-screen rest countdown with **Skip Rest** and a preview card of the next exercise;
  - program cards with the target muscles highlighted.
- **My Fitbod account:**
  - **"Up Next" plan:** "14 Exercises • 8 Muscles", **Switch**, duration and location chips, a Warm-up block, Superset/Circuit groups with rounds, a thumbnail on every row.
  - **Exercise pages:** a looping video, **Instructions | Target** tabs and **How-To**; inside a workout each exercise also has **Rest timer**, **History** and **Replace** chips.
  - **Body tab:** a Recovery avatar with front and back views ("10 fresh muscle groups") and a Strength score (overall plus Push, Pull, Legs).
  - **Targets tab:** a Weekly Set Targets hexagon ring.
  - **Log tab:** a weekly streak.

## Constraints (unchanged)
- **Stack:** static PWA, plain ES modules, no build step, Firebase. A framework, build step or library needs a reason and my OK first.
- **Security and privacy:** no secrets in the front end, no trackers, costs near zero.
- **CSP:** keep it tight. This plan needs no new origins.
- **Offline-first:** a whole workout, demos included, must run in airplane mode.
- **AI is optional.** Nothing here needs AI.
- **Releases:** phases are always shippable. Send **full replacement files, not diffs**, and plain-English steps.
- **Version:** bump `js/version.js` and `sw.js` to 0.3.0 and update CHANGELOG.
- **Tests:** add unit tests for new logic (XP, levels, streaks, badges, the pause clock, muscle mapping). If `firestore.rules` changes, update the rules tests too.
- **config.js:** leave it untouched. The real values are committed now.

## Must (v0.3.0)
Each item names the app that inspired it.

### 1. Guided workout player (BetterMen, Hevy, Fitbod)
Make it the default, and keep today's list logger as a "List view" toggle.
- **Start:** a full-screen 3-2-1 "GO!".
- **Each set:**
  - an "Exercise X of N" segmented bar and the demo (item 3);
  - "Set 2 of 4" with a superset tag (A1/B1) or warm-up tag;
  - a **huge** target ("10 reps · 30 lb");
  - big ± steppers prefilled from the progression target, with last time's numbers;
  - one giant **Done set** button and a "Next: …" line.
- **Rest:** a full-screen countdown ring with Skip, ±15 s and a next-exercise preview card.
- **Supersets:** alternate exercises (A1 → B1 → rest).
- **Timed sets:** a 3-2-1 lead-in, then they complete on their own.
- **Edits:** Back and Next between sets, and undo or edit the last set.
- Done when: I can finish a workout one-handed without seeing the list.

### 2. Pause and resume
- A Pause button in both views.
- Pause freezes the session clock, rest and timed sets, and shows a "Paused" overlay with Resume, End and Discard.
- Paused time doesn't count toward the duration.
- The paused state survives an app kill. Store `paused_at` and `paused_ms` on the workout, and update rules and tests if needed.
- If I come back after more than 10 minutes away while not paused, ask: "You were away 14 min. Count it or remove it?"

### 3. How-to demo on every exercise (Fitbod, BetterMen, Lyfta, Peloton)
**Primary demo: an animated silhouette figure, drawn in code.** This was my idea. Lyfta's looping 3D model with muscles lighting up is the bar, but we can't license 3D or video, so draw it ourselves.
- **Figure:** a clean, solid silhouette in SVG (not a stick figure): a head plus torso, upper arm, forearm, thigh and shin segments as rounded shapes on a jointed skeleton (about 14 joints). Use a neutral dark-grey body with a subtle rim light in the Forge accent. No faces, no realistic people.
- **Motion templates, not 300 hand animations.** Define keyframe poses (joint angles) per movement pattern: squat, hinge, lunge/split squat, horizontal push, vertical push, horizontal pull, vertical pull, curl, triceps extension, lateral/front raise, fly, calf raise, plank/core holds, crunch/leg raise, carry, jump/plyo, plus the calisthenics family (push-up variants, dip, pull-up/chin-up, pistol, L-sit, hollow hold, burpee). Each exercise maps to a template plus parameters: stance, grip width, torso angle, range of motion, side or front camera, and a **prop** (barbell, dumbbells, kettlebell, cable handle, band, bench, pull-up bar, machine seat). Interpolate the poses with easing.
- **Tempo:** the loop follows the rep phases (lower about 2 s, brief pause, lift about 1 s), synced to the exercise's tempo when it has one.
- **Muscles light up** (Lyfta-style): tint the working segments with the accent at the hardest point of each rep, primary muscles strong and secondary faint, matching the muscle map in section 4.
- **Cost:** pure code and data, offline by default, no downloads, tiny. One small renderer (`js/ui/figure.js`) plus a pose/template table. Keep it inside the JS budget, or justify going over.
- **Coverage report:** list which exercises map to a template. Anything unmapped falls back to photos (below), never a blank.
- Show me 3 silhouette examples in your plan reply (frame-by-frame for a squat, a pull-up and a dumbbell curl) before building them all.

**Secondary: real start/end photos** from free-exercise-db (Unlicense, already credited), shown as a "Photos" toggle inside the How-To sheet and as the fallback for unmapped exercises.
- Forge links 174 fedb ids, and 172 have images. Map more of our exercises by exact name.
- **Assets:** a one-time script I run resizes them (about 480 px wide, ~25 KB each) into `media/ex/<id>/`, and I commit the output. Don't hotlink.
- **Loop:** crossfade the two frames with a slight scale, about 1.6 s per cycle.
- **Offline:** cache today's photos when a workout starts, otherwise cache-first on first view, plus a Settings button "Download all demo photos (≈ N MB)". Don't precache them in the app shell.

**How-To sheet:** opened from a big **How-To** button (tapping the name isn't discoverable). Layout like Lyfta's exercise detail:
- the looping silhouette demo across the top half (Figure | Photos toggle);
- a row of actions under it: Favourite, **Watch on YouTube** (link-out to a search, no embed, so `frame-src` stays `'none'`), Share;
- **Instructions | Target** tabs (Target shows the front/back muscle map);
- cues;
- my history and PRs for that exercise.

The player shows the silhouette small by default on each exercise screen, and tapping it opens the sheet.

### 4. Muscle map everywhere (Fitbod, BetterMen, Muscle Booster)
- **Source:** `react-native-body-highlighter` v3.2.0 (MIT, by Hicham ELABBASSI). The path data is plain arrays in `dist/assets/bodyFront.js` and `bodyBack.js` (~50 KB; viewBox front `0 0 724 1448`, back `724 0 724 1448`).
- Port it to a plain module (`js/ui/bodymap.js`) with no React, and keep the MIT notice.
- **Muscle mapping:** front and side delts go on the front `deltoids`, rear delts on the back `deltoids`, lats on `upper-back`, abductors on `gluteal`.
- **Rendering:** primary muscles in full accent, secondary at about 45%, animated fill.
- **Where it appears:** the workout preview header, every exercise card (mini), the Target tab, and the summary.

### 5. Recovery body heatmap (Fitbod, Muscle Booster)
- Add a Body view (propose where it lives).
- It shows a front/back map coloured red, amber or green by the existing recovery model, with "N fresh muscle groups" and "N days since last workout".
- Tap a muscle to see its %, when it was last trained, and the sets this week.
- This replaces the plain % bars.

### 6. Set-complete "power-up" (inspired by my friend's app; no characters or IP)
When I tap **Done set**, the app should feel like I just charged up, with a Forge-themed **energy aura burst** in molten ember and electric accent.
- **Visuals:**
  - the button squashes, then pops into a ✓;
  - a radial aura blooms behind the hero area and pulses once;
  - 30–60 sparks burst out on one shared `<canvas>` overlay;
  - a light shake (2–4 px for about 150 ms, on the player only);
  - a floating "+10 XP";
  - the progress segment fills with a shine sweep.
- **Escalation:** each set in a workout is a bit bigger, and the last set of an exercise is the biggest. Finishing an exercise flashes its muscles on the mini map.
- **Sound:** a short synthesized Web Audio "charge + chime" (no files), mutable.
- **Haptics:** call `navigator.vibrate` where it exists. iPhone Safari ignores it, so say so. Optionally try the iOS 18+ `<input type="checkbox" switch>` haptic on the real tap, marked experimental. Real haptics arrive with Capacitor.
- **Rules:** under 900 ms, never blocks input, and rest starts underneath it. With reduced motion, show only a colour flash, the ✓, sound and text.

### 7. PR explosion (Hevy live PR, Strong)
- A set that beats a record (e1RM, weight, reps or volume) escalates past the power-up:
  - a gold aura;
  - a bigger burst;
  - a "NEW PR" slam-in card showing the old value → the new value;
  - its own sound.
- This replaces the current `celebrate()`.

### 8. Workout-complete summary screen (Hevy, Fitbod, Peloton)
- Full screen:
  - confetti;
  - a "Workout #N" headline;
  - count-up stats (time without pauses, sets, volume, PRs);
  - this session's muscle heatmap and its PRs;
  - "vs last time" deltas;
  - XP gained with a filling level bar (and a level-up burst when I level up);
  - streak status.
- **Share:** a "Share image" button that renders a card on-device and uses `navigator.share` with the PNG, falling back to download.

### 9. XP, levels, badges, streaks (Apple Fitness Awards, Hevy, Fitbod)
- **Derive these from workout history.** Store nothing new unless you justify it.
- **XP:** propose the numbers. My idea: +10 per working set, +25 per exercise, +100 per workout, +50 per PR.
- **Levels:** about 30 named levels.
- **Weekly streak:** weeks where I hit my planned days, with one freeze per month.
- **Badges:** about 20 SVG badges (milestones, PRs, streaks, every muscle trained in a week, a deload done, and so on), each with a locked/unlocked state.
- Add an Awards screen. Queue celebrations so they never stack.

### 10. Animated Today rings (Apple Fitness, Fitbod targets)
- Three rings that fill on load:
  - **Training:** workouts vs planned days this week;
  - **Weekly sets:** sets vs target, by Push/Pull/Legs;
  - **Recovery:** average fresh %.
- Closing a ring gets a burst.
- Leave room for the food rings that come with Checkpoint C.

### 11. Workout preview parity (Fitbod)
- Before Start: duration and location chips, "N exercises · N muscles" with the mini map, a Warm-up block, Superset/Circuit groups with rounds, thumbnails, and an ⋯ menu per exercise (Replace, History, Rest timer).
- **Switch:** regenerates using the existing generator.

### 12. Voice and audio coach (Peloton Strength+, Muscle Booster)
- Use `speechSynthesis` and Web Audio beeps, with a setting for Off, Beeps, or Voice.
- What it says or plays:
  - "3, 2, 1, go";
  - "Rest 90 seconds. Next up: incline press, 10 reps";
  - "10 seconds";
  - "Last set!";
  - "New PR!"
- Don't stop my music. Test on iOS and tell me what happens.

### 13. Motion system and performance
- **Shared tokens:** durations (120/240/400 ms) and easing.
- **Screen transitions:** tab slides, and push/pop for detail screens (View Transitions where supported).
- **Polish:** skeleton loaders instead of spinners, press states, number count-ups.
- **Reduced motion:** honour `prefers-reduced-motion` everywhere by swapping motion for fades, without removing the feedback.
- **Budget:**
  - 60 fps on my iPhone, animating only transform, opacity and canvas;
  - one rAF loop that sleeps when idle;
  - no heavy libraries (justify and vendor any small one, with its licence);
  - under 60 KB of new JS (gzip, excluding images);
  - Lighthouse Performance, Accessibility and Best Practices all at least 90.
- **Wake lock:** keep the screen awake during workouts (it works in installed web apps on iOS 18.4+).

## What real app footage shows
I studied clips of these apps in use. Copy the information, then beat them on motion:
- **Fitbod workout summary:** dark UI with white text, a magenta accent and gold trophies. At the top is a **swipeable carousel of muscle-map figures** with pagination dots. Then the workout name, the duration, and a 3-stat row: **Calories · Volume · Records (with a trophy icon)**. Below that is "13 Exercises", grouped (Warm-up first). Each row has a thumbnail, the name and the set log ("10 reps × 25 lb"), with a **green ✓ badge** on the thumbnail. **Trophy rows sit inline** under an exercise when it set a record ("Volume 3,000 lb", "Est. 1RM 35.5 lb"). It's all static, with no confetti or motion. Match this content in section 8, and our animation is the edge.
- **Lyfta exercise detail:** a looping 3D demo across the top half where the **working muscles glow red during each rep**, an action row (Favourites, YouTube, Share, How to), then "Target muscles" front/back figures. Completing an exercise pops a **green ✓ with a little scale bounce** onto its muscle map. Detail screens push in from the right.
- **Lyfta library filter:** a bottom sheet with round equipment icons (Cable, Dumbbell…). Selecting one gives it an accent ring, and the button updates live ("**Show 56 results**"). The sheet slides away to a grid of exercise cards. Add this to Forge's exercise library (filter by equipment, muscle and my current location profile). It's Next unless it's cheap.
- **Hevy onboarding:** Units (lb/kg, mi/km, in/cm) → Apple Health → routine preview → a big ✓ "Get Started". Ours has no paywall or account upsell, so keep it that short.

## Next (v0.3.x)
- A strength score (overall plus Push/Pull/Legs from e1RM, with benchmark lifts).
- Weekly set-target hexagons.
- Per-exercise charts in the player.
- Program cards with muscle art and "Week 2 of 6" (BetterMen).
- A post-workout "How did that feel?" that nudges the next targets (Muscle Booster).
- wger images (CC-BY-SA, with attribution) to fill demo gaps.
- A weekly report (Fitbod).

## Later
- Real haptics, a lock-screen rest timer (Hevy Live Activity) and an Apple Watch player (Fitbod, Peloton, Strong). These come with the native wrapper.
- Real video demos (if a free, licensed source turns up).
- Buddy mode.

## Forge vs the apps
| Feature | Fitbod | Workouts For Men | Forge now | Forge v0.3 |
|---|---|---|---|---|
| Guided one-at-a-time player | List + per-exercise view | ✅ | ❌ list only | ✅ |
| Pause / resume | ? | ✅ | ❌ | ✅ |
| Full-screen rest + skip + next preview | Rest timer | ✅ | Small bar | ✅ |
| How-to demo | ✅ video | ✅ video | Text only | ✅ animated silhouette with muscles lighting up, plus photos |
| Muscles-worked map | ✅ | ✅ program art | ❌ | ✅ everywhere |
| Recovery heatmap | ✅ | ❌ | % bars | ✅ |
| Warm-ups, supersets, circuits | ✅ | Sets only | ✅ (no circuits) | ✅ |
| Set-complete animation | ? | ? | ❌ | ✅ power-up |
| PR celebration | Records list | ? | Basic burst | ✅ explosion |
| Workout summary | Past-workout card | ? | Plain sheet | ✅ + share |
| Streaks / XP / badges | Streak | ❌ | ❌ | ✅ |
| Strength score | ✅ | ❌ | ❌ | Next |
| Voice / audio cues | Watch cues | ? | Interval timer only | ✅ |
| Offline, no trackers, ~free | ❌ | ❌ | ✅ | ✅ |

(? = not confirmed.)

## Also queued
- **Polish items** from `notes/review-v0.2.1-for-claude.md`. Fold them into v0.3.0:
  - the tempo dead end at 30 → 40 lb (with a test);
  - make the Epley comments agree;
- **Checkpoint C (food)** comes right after this. Don't start it yet.

## Reply with your plan first
No code yet. Reply with:
1. **Design direction:** dark, bold, energetic, built around the Forge identity (ember and electric accents). Include the palette, type scale and motion tokens, plus frame-by-frame descriptions of the power-up, the PR explosion and the summary.
2. **Screen and navigation changes**, including where Body and Awards live.
3. **File plan:** new and changed files, the image script, the SW caching strategy, and any data or rules changes.
4. **XP, level and badge tables.**
5. **iPhone risks:** audio unlock, haptics, background timers, wake lock.
6. **Your questions** (five at most).
7. **Build order:** split Must into 2–3 shippable drops if safer.

Then wait for my go.
