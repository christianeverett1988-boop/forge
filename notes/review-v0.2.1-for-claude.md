# Feedback on Forge v0.2.1

v0.2.1 checks out:
- 80/80 unit tests pass.
- Rules are unchanged, and the emulator rule tests pass.
- My simulations confirm all 4 progression fixes.
- The e1RM jump rule is sensibly conservative.
- A headless run against the emulators is clean, including no CSP violations.

I'm pushing it as is. These are optional polish items for the next release. When you change anything, send **full replacement files, not diffs**.

1. **Tempo dead end** (`js/workouts/progression.js` around lines 170 and 185).
   - Problem: if the next weight I own is ~33%+ heavier (e.g. a 30 and a 40 lb pair, rep range 8–12), the ladder reaches 30×20×5 tempo and stays forever. Epley from 20 reps predicts 7 at 40, below the bottom of 8.
   - The doc says tempo lasts "until you add a heavier weight", but a 40 lb pair wouldn't unlock it.
   - Suggestion: after a couple of tempo sessions at the maxed ladder, allow the jump with a first target of `max(5, predictedReps)` reps, and a note explaining the bigger jump.
   - Add a test for the 30 → 40 lb case. The 5 → 30 lb case must still never jump.
2. **Make the Epley comments agree.** `e1rm()` (line 63) says Epley is unreliable above 12 reps; `predictedReps()` (line 76) uses it up to 30. Add a comment explaining why the cap of 30 is OK there (weakest set, bottom-of-range target, no jump beyond what reps support).
3. **Public repo:** remove my name from the comment at `js/workouts/equipment.js:93` ("Christian's home gym, from photos …"). Just say "Home gym preset".
