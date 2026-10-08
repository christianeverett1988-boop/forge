# Deploying updates

Every update is: replace files → bump the version → commit → push. GitHub Pages republishes in about a minute.

When I send a new zip, copy **all** its files over your repo folder. Replacing everything is safer than picking files, and GitHub Desktop will show you exactly what changed. Your `config.js` is the one file to keep: either don't copy the zip's `config.js`, or paste your values back in.

## Steps

1. Copy the new or changed files I send you into your `forge` repo folder, replacing the old ones.
2. Make sure the version number matches in **both** places (I'll have done this in files I send you):
   - `js/version.js` → `export const VERSION = '0.2.1';`
   - `sw.js` → `const VERSION = '0.2.1';` (line 3)
   The service worker only fetches new files when `sw.js` changes, so a forgotten bump means your phone keeps the old version.
3. **GitHub Desktop** → you'll see the changed files listed → Summary: e.g. `v0.2.0 – workouts` → **Commit to main** → **Push origin**.
4. Wait 1–2 minutes. Open the app on your phone. A green bar appears at the top: **New version ready — tap to refresh**. Tap it.
   - If no bar appears, close the app fully and reopen it. The app checks for updates each time it comes to the foreground.
5. **Settings → About** shows the version you're running.

## If an update changes `firestore.rules`

The CHANGELOG says when a version changes the rules (0.2.0 did; **0.2.1 doesn't**). Pushing to GitHub does **not** update the database rules. Publish them **before** you open the new version, or the app will show "Can't read your data":
Firebase console → **Firestore Database → Rules** → select all, paste the new `firestore.rules` → **Publish**.

## Before you push: run the tests (optional, needs Node)

```
node tests/run.js
```

All tests should pass, including the check that both version numbers match.

## Rolling back

GitHub Desktop → **History** tab → right-click the bad commit → **Revert changes in commit** → **Push origin**.
