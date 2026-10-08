# Feedback on Forge v0.3.0 (PR #2)

My reviewer went through v0.3.0:
- Tests: 97/97 unit and 13/13 rules, and both CI jobs are green.
- `config.js` and the CSP are unchanged.
- The rules change is additive and safe for old workouts, so I'll publish it now.
- New JS is about 32 KB gzip.

The player is a real upgrade. I'll merge after the fixes below. Push them to the same `release/v0.3.0` branch so PR #2 updates, and keep `config.js` as is.

## Must-fix before merge

1. **Undo leaves a fake PR.** `js/workouts/live.js` `undoSet()` (~line 168) never touches `w.prs`, so an undone PR set still shows and saves the PR. On undo, recompute that exercise's PRs with `detectPRs()` from the remaining done sets. Add a test.
2. **Save on hide.** Sets save with a 400 ms debounce, and the hide handler (`live.js:27`) doesn't flush. Swiping the app away right after Done can lose the set. Call `flush()` on `visibilitychange → hidden` and on `pagehide`.
3. **The final set auto-finishes with no way back** (`js/screens/player.js:365`). Show a "Workout complete: Finish / Undo last set" card, or a 5-second undo, before `finishWorkout()`.
4. **Summary race** (`js/screens/summary.js:23-32`). If the local snapshot hasn't landed yet, it renders the active doc: time 0 or negative, Workout #N off by one, and the one-time celebration shows wrong numbers. Wait for `status === 'done'`, or render the object `finishWorkout()` returns.
5. **The rAF loop never sleeps on the player.**
   - `js/ui/figure.js:188` returns `true` while paused.
   - The rest-ring task (`player.js:499`) stacks a copy on every `drawRest()` call.
   - `figure.js:145` re-parses `props.innerHTML` every frame.

   Build the nodes once and return `false` when paused.

## Silhouette upgrade (before v0.3.1 builds the library on it)

My screenshots show the problems: the squat bar crosses the face, the squat bottom is an orange blob, the pull-up kneels, and the curl arm vanishes into the torso.

- **Shapes:** tapered closed paths per segment (two radii plus a muscle bulge) instead of uniform `<line>` capsules. Add a rib cage, pelvis, neck, hands and feet.
- **Skeleton:** about 16 joints with local angles, plus 2-bone IK (feet planted, hands on the bar, squat bar over mid-foot). Far limbs must pose independently; today they're the near limbs shifted 3 px.
- **Camera and depth:**
  - A 3/4 view (about 30° yaw) per template.
  - Darker, thinner far limbs and a gradient on each limb.
  - A ground shadow and a rim stroke on the back edge only. Drop the offset lime copy.
- **Props match the view:**
  - Squat bar: a plate disc on the traps, gripped by the hands.
  - Pull-up bar: a cross-section circle with the hands wrapping it.
  - Dumbbell: end-on.
- **Glow:** muscle-shaped paths with radial gradients, opacity only (primary 100%, secondary about 45%). No whole-segment overlay; lats shouldn't light the whole torso.
- **Motion and rendering:** per-joint lead/lag, sine easing, and loop timing that follows the prescribed tempo. Rotate a `<g>` per segment with `transform`, at 30 fps.

Send new frames for the same three exercises first.

## Nice-to-haves

- **Audio:**
  - Call `unlockAudio()` on Resume, Count it / Remove it, Skip and ±15. Call `ctx.resume()` when the app returns.
  - Merge one set's PRs into one card, and don't let `coach.pr()` cancel the rest line.
  - Say "Rest 2 minutes 30", not "150 seconds".
- **Blank weight:** it shows "8 reps — lb". Show a "Set weight" chip and prefill (empty bar, last dumbbell).
- **Wake lock:** retry on the next tap if re-acquiring fails, and release it after about 5 minutes paused.
- **Rest timer:** persist the end time so it survives an app kill.
- **PRs:** detect volume PRs, and keep `weight` on rep PRs.
- **Animation:** use `scaleX` instead of width animations, and wrap `supersetTag()` in `esc()`.
