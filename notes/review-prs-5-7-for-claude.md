My reviewer checked all three PRs: every head is green (119 / 124 / 136 unit, 13/13 rules, CI), config/rules/CSP are unchanged, the SW shell is complete, no rules republish is needed, and the stack merges cleanly in order. Push fixes to the **same PR branches** and keep `config.js` unchanged.

**#5 (0.3.1.1): merge.**
All three must-fixes are verified, and the template fixes look right in a fresh render. Nothing to change.

**#6 (0.3.1.2): merge.**
All of §11 is there; Switch can't touch a started workout, and `rest_sec` works. Two small follow-ups (here or in #7):
1. Today's card and Start (`today.js:37`, `today.js:135`) call `planToday()` without the Train edits. Edits made on Train are lost if I start from Today. Share them (e.g. a `previewPlan()` used by both).
2. `swapExercise` (`session.js:285`) drops `rest_sec` when swapping mid-workout. Carry it over like `superset`.

**#7 (0.3.2): blocked until these are fixed.**
1. **XP doesn't match the plan I approved** (`awards.js:5-20`, `:40`). Implement the plan:
   - +10 per set, capped at 40 sets;
   - +25 only for exercises with ≥2 working sets;
   - +50 per PR, capped at 200;
   - +100 for hitting the weekly goal;
   - +100 per badge;
   - levels at 250×(n−1)^1.6.

   PR XP is uncapped now, so a progressive session with about 15 PRs earns +750 XP from PRs alone. Update docs/levels.md and "How XP works".
2. **Empty finished workouts count as training days** (`daysPerWeek`, `awards.js:86`). Three zero-set finishes close the Training ring and keep the streak. Require ≥1 working set, as `badges()` does.
3. **Earned badges can disappear.** Everything is recomputed with the current planned days, so changing 3 → 4 days revokes Hot Streak. Persist earned badges as `settings/main.awards_seen = {id: date}`, seeded silently on first run with no celebration, as planned. No rules change is needed.

No celebration storm on upgrade, and week boundaries, DST and discarded/deleted workouts are handled correctly.

4. **Real badges.** All 19 are the same 🏅/🔒 emoji (`screens/awards.js:50`), so the Awards screen looks flat. I want this app to beat Fitbod. Make about 22 distinct SVG badges in the Forge style: a metal or ember look by tier, a unique icon per badge, an unlock shine animation, and greyed silhouettes when locked. Add the missing "Full House" (every major muscle in a week) and "Recovery Respect" (deload done) badges.
5. **Share card:** PR lines truncate to "Barbell Bench Press: E…" (`sharecard.js:97`). Drop the prefix or wrap.

**#7 nice-to-haves:**
- **Share tap timing:** a tap before the 1.2 s pre-render can lose iOS's user activation. Render immediately or disable the button until ready.
- **Deload weeks:** scale the Weekly sets target, or label the week.
- **Starting-weight prefill:** style it as "suggested" until touched.

Budget: +1.8 / +3.3 / +13.7 KB gzip, fine with route-lazy loading.
