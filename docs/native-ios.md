# Forge as an iPhone app (proof of concept)

The same Forge code runs inside a thin native iPhone shell (Capacitor). The web app on GitHub Pages doesn't change. Inside the iPhone app you get:

| | Web app (Home Screen) | iPhone app |
|---|---|---|
| Haptics | Only the "switch trick" ticks, in some places | Real Taptic Engine taps on buttons, tabs and "rest's over" |
| Rest timer when the phone is locked | Frozen until you come back | "Rest's over · Next: Bench press" notification on the lock screen |
| Apple Health | Shortcut, or an export.zip import | Reads HealthKit directly. No Shortcut. Reads again by itself every 6 h when you open Forge |
| Opens offline | Yes (service worker) | Yes (files and Firebase are inside the app) |
| Withings sign-in | Leaves the app for Safari | Opens over Forge; tap Done to come back |
| Status bar | Browser-controlled | Follows light/dark |
| Your data on the phone | iOS may clear it if you don't open Forge for weeks | Kept like any app's data |

Same account, same data, same server. Nothing new to deploy, and nothing changes in Firebase.

## What's in the repo

- `capacitor.config.json`: the app's name, bundle ID and settings.
- `package.json` → `devDependencies`: Capacitor 8 and the plugins (Haptics, Local Notifications, Status Bar, Browser, `@capgo/capacitor-health` for HealthKit).
- `scripts/build-www.mjs`: builds `www/`, the copy of Forge that goes inside the app. It copies the app's files (not `functions/`, `tests/`, `notes/`…) and downloads Firebase's code so the app opens offline.
- `js/native/bridge.js`: the only place the app talks to the native side. In a browser every function there does nothing.
- `js/native/health.js`: HealthKit → the same daily summaries the export import makes.

## One-time setup on your Mac (about 45 minutes, most of it the Xcode download)

You don't need the $99 Apple Developer Program to try it on your own iPhone. A free Apple ID works, with two limits:
- The app stops opening after **7 days**. Plug in and press Run again to reinstall it; your data stays (it's in your Forge account).
- Apple may not let a free account use **HealthKit**. If Xcode says so at step 8, skip that step. Everything else still works, and Apple Health stays on the Shortcut until you join the program under your LLC.

1. **Install Xcode** from the Mac App Store (free, large). Open it once and let it install its components.
2. **Turn on Developer Mode on your iPhone:** Settings → Privacy & Security → Developer Mode → On, then restart the phone. (The option only appears after step 7 has tried once; come back to it then.)
3. **Terminal, in the Forge folder** (GitHub Desktop → Repository → Open in Terminal), on this branch or on main after merging:
   ```
   npm install
   npm run native:build
   npx cap add ios
   npx cap sync ios
   npx cap open ios
   ```
   - `npm install` downloads Capacitor (a few minutes).
   - `npm run native:build` should list four `bundled firebase-….js` lines. If it says "could not download", check the internet connection and run it again.
   - `npx cap add ios` is only for the first time. It creates the `ios/` folder (the Xcode project).
   - If `npm install` complains about versions, send me the last 20 lines.
4. **Xcode opens.** In the left sidebar click **App** (the blue icon at the top), then the **App** target, then the **Signing & Capabilities** tab.
5. **Team:** click *Add an Account…*, sign in with your Apple ID, then pick "*Your Name* (Personal Team)".
6. **Bundle Identifier:** leave it as `com.christianeverett.forge`. If Xcode says it's taken, add `.test` to the end. Before the real App Store setup under your LLC we'll change it to your company's (e.g. `com.yourllc.forge`). Nothing depends on it yet.
7. **Plug your iPhone in** with a cable, unlock it, and tap **Trust** on the phone. Choose your iPhone in the device menu at the top of Xcode, then press **▶ Run**.
   - The first time, the phone says the developer isn't trusted. Open Settings → General → VPN & Device Management → your Apple ID → **Trust**, then press Run again.
8. **HealthKit:** back on **Signing & Capabilities**, click **+ Capability**, then **HealthKit**. Then open the **Info** tab, hover any row, click **+** and add these two:
   - **Privacy - Health Share Usage Description**: `Forge reads your heart rate variability, resting heart rate, sleep and activity to work out Readiness and your Forge Score. Only daily summaries are saved.`
   - **Privacy - Health Update Usage Description**: `Forge doesn't write to Apple Health.`

   Press Run again.

## Try these on the phone

1. **Sign in.** Your own account, same data as the web app.
2. **Tabs and buttons:** tap between tabs. You should feel a light tick. Start a workout and tap **Done set**: a firmer tap.
3. **Lock-screen rest timer:** after a set, lock the phone. When the rest ends, a "Rest's over · Next: …" notification appears. The first rest asks for permission to send notifications: tap **Allow**.
4. **Apple Health:** Settings → Apple Health → **Connect Apple Health**. iOS shows its Health sheet: turn everything on. Forge reads the last 120 days and says how many it saved, and Readiness fills in. After that it reads again by itself when you open Forge (at most every 6 hours).
5. **Withings:** Settings → Withings opens over the app. Close it with **Done** and you're back in Forge.
6. **Offline:** turn on Airplane Mode, force-quit Forge and open it. It should open and show your data.

Tell me how the feel compares with the Home Screen web app. That's the point of this test.

## After a code change

```
npm run native:sync
```
Then press **▶ Run** in Xcode. (The iPhone app carries its own copy of Forge, so GitHub Pages updates don't reach it until you do this. When it goes to TestFlight we'll make that automatic.)

## Commit the `ios/` folder

After step 3, GitHub Desktop shows a new `ios/` folder. Commit it. It's the Xcode project, with your capability and Info settings, and it holds no secrets. `www/` and `node_modules/` are ignored on purpose.

## If something doesn't work

- **Sign-in fails with "API key" or "referer" errors:** your Firebase browser key may be limited to your GitHub Pages address. In console.cloud.google.com → APIs & Services → Credentials → the "Browser key", add `capacitor://localhost` to the allowed websites (or remove the restriction for the test).
- **No haptics:** iPhone Settings → Sounds & Haptics → System Haptics must be on. Settings → Haptic tick in Forge must be on.
- **No rest notification:** iPhone Settings → Notifications → Forge → Allow.
- **"Apple Health isn't available":** the HealthKit capability (step 8) is missing, or the free account can't use it (see the top of this page).
- **The HealthKit plugin isn't found** (the Connect button says Apple Health is only in the app, even though you're in the app): its registered name may differ from what Forge tries (`Health`, `CapacitorHealth`, `HealthPlugin`). Send me the Xcode console line that starts with `⚡️  Loading plugin` and I'll match it.

## Later: TestFlight and the App Store (needs the $99 program, under your LLC)

1. Enroll the LLC at developer.apple.com (needs a D-U-N-S number).
2. Change the bundle ID to the company's, pick the LLC as the Team, and set the version.
3. Xcode → Product → Archive → Distribute → TestFlight. Then you and your wife install from the TestFlight app. No 7-day limit; builds last 90 days.
