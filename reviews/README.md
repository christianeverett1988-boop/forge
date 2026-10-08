# Reviews

Code reviews of each release live here, so feedback and fixes stay with the code.

**How it works**

1. Claude opens a pull request for each release (branch `release/vX.Y.Z`). The **tests** check (unit + security rules) runs on it automatically.
2. A reviewer (Christian, or Grok) reads the pull request. Feedback goes in one of two places:
   - comments on the pull request, or
   - a file here named after the version, e.g. `reviews/v0.2.1.md` (add it on the release branch, or paste it as a PR comment).
3. Claude fixes on the same branch, so the pull request shows exactly what changed in response.
4. Christian merges to `main` when happy. GitHub Pages deploys `main` only.

**Writing a review that's easy to act on**

- Number each item, and say **must fix** or **nice to have**.
- Point at a file and line when you can (`js/workouts/progression.js:96`).
- Describe how to reproduce it, and what you expected instead.
