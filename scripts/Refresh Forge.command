#!/usr/bin/env bash
# Refresh Forge: the one-click weekly re-install of the Forge iPhone app (a free Apple ID signs it for 7 days only).
# scripts/ios-setup.sh puts a copy of this file on your Desktop. Plug in your iPhone (or have it on the same Wi-Fi
# if you paired it for that), unlock it, and double-click. It updates Forge, rebuilds the app, signs it again and
# installs it on the phone without opening Xcode. Your Forge data is not touched. Details: docs/ios-setup.md.
# The full details of every step go to refresh-forge.log in the Forge folder.

REPO="${FORGE_DIR:-$HOME/forge-app}"
BRANCH="main"
TEAM_FILE="$HOME/.forge-refresh-team"

wait_key() { printf '\n  Press any key to close this window. '; read -r -n 1 -s; printf '\n'; }

if [ ! -d "$REPO/.git" ]; then
  printf '\n  ✗ I can’t find the Forge folder at %s.\n    Run "bash scripts/ios-setup.sh" in your Forge folder first, or open this file in a text editor and set REPO at the top.\n' "$REPO"
  wait_key; exit 1
fi
cd "$REPO" || exit 1
LOG="$PWD/refresh-forge.log"
: > "$LOG"

say()  { printf '\n%s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
stop() {
  printf '\n  ✗ %s\n' "$1"
  shift
  for line in "$@"; do printf '    %s\n' "$line"; done
  printf '\n    Fix that, then double-click Refresh Forge again.\n'
  printf '    (If it keeps happening, send Claude the file refresh-forge.log in the Forge folder.)\n'
  wait_key; exit 1
}
# Run a command quietly; on failure say what was being done, in words.
run() {
  local what="$1"; shift
  printf '  … %s\n' "$what"
  { printf '\n$ %s\n' "$*"; } >> "$LOG"
  if ! "$@" >> "$LOG" 2>&1; then
    stop "That didn’t work: $what." "The details are in refresh-forge.log (in the Forge folder)."
  fi
}
# The last lines of the log mention the usual phone problems: say the fix in words.
phone_help() {
  if grep -qiE 'locked|passcode' "$LOG"; then stop "$1" "Your iPhone is locked. Unlock it (and keep the screen on), then try again."
  elif grep -qiE 'developer mode' "$LOG"; then stop "$1" "Turn on Developer Mode: iPhone Settings → Privacy & Security → Developer Mode → On (the phone restarts)."
  elif grep -qiE 'trust|not paired|pairing' "$LOG"; then stop "$1" "Plug the iPhone in, unlock it and tap Trust when it asks."
  elif grep -qiE 'no space|not enough (free )?space|storage' "$LOG"; then stop "$1" "The iPhone is full. Free up some space in iPhone Settings → General → iPhone Storage."
  elif grep -qiE 'unavailable|not connected|could not connect|timed out|network' "$LOG"; then stop "$1" "Plug the iPhone into the Mac with its cable, unlock it, and wait a few seconds."
  else stop "$1" "Make sure the iPhone is plugged in and unlocked."
  fi
}

say "Refreshing Forge on your iPhone"

# ---- 1. Mac, Xcode, Node ----
[ "$(uname -s)" = "Darwin" ] || stop "This has to run on your Mac."
command -v xcodebuild > /dev/null 2>&1 || stop "Xcode isn’t installed." "Run \"bash scripts/ios-setup.sh\" in the Forge folder first."
xcrun --find devicectl > /dev/null 2>&1 || stop "Xcode is too old to install on a phone from here." "Open the App Store and update Xcode."
command -v node > /dev/null 2>&1 || stop "Node.js isn’t installed." "Go to nodejs.org, download the LTS installer and open it. Then close this and double-click Refresh Forge again."
command -v git > /dev/null 2>&1 || stop "Git isn’t installed." "Run \"bash scripts/ios-setup.sh\" in the Forge folder first."
ok "Mac, Xcode and Node are ready"

# ---- 2. Your Apple team (kept before the update, which resets Xcode's local edits to the project) ----
TEAM="${FORGE_TEAM_ID:-}"
[ -n "$TEAM" ] || TEAM="$(cat "$TEAM_FILE" 2> /dev/null)"
[ -n "$TEAM" ] || TEAM="$(grep -o 'DEVELOPMENT_TEAM = [A-Z0-9]\{10\}' ios/App/App.xcodeproj/project.pbxproj 2> /dev/null | head -1 | awk '{print $3}')"
[ -n "$TEAM" ] || TEAM="$(defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier 2> /dev/null | grep -o 'teamID = [A-Z0-9]\{10\}' | head -1 | awk '{print $3}')"
[ -n "$TEAM" ] || stop "I don’t know your Apple team yet." "Open Xcode once, pick your Personal Team under App → Signing & Capabilities (docs/ios-setup.md, step 5), close Xcode, and double-click Refresh Forge again."
printf '%s\n' "$TEAM" > "$TEAM_FILE"
ok "Apple team found"

# ---- 3. Update Forge ----
# Xcode writes your team into the project file; that's the only local edit allowed (it's put back by the build below).
git checkout -- ios/App/App.xcodeproj/project.pbxproj >> "$LOG" 2>&1
if [ "$(git rev-parse --abbrev-ref HEAD 2> /dev/null)" != "$BRANCH" ]; then
  printf '  … Switching Forge to the main version\n'
  git checkout "$BRANCH" >> "$LOG" 2>&1
  [ "$(git rev-parse --abbrev-ref HEAD 2> /dev/null)" = "$BRANCH" ] || stop "I couldn’t switch Forge to the main version." "You have changes in the Forge folder that are in the way. Open GitHub Desktop, choose \"Discard\" for them, then try again."
fi
run "Getting the newest Forge" git pull --ff-only
ok "Forge is up to date ($(cat js/version.js | grep -o "[0-9]*\.[0-9]*\.[0-9]*" | head -1))"

# ---- 4. Build the app's copy of Forge (same steps as scripts/ios-setup.sh) ----
if [ -f node_modules/.package-lock.json ] && node -e '
const a = require("./package-lock.json").packages, b = require("./node_modules/.package-lock.json").packages;
const bad = Object.keys(b).some((k) => !a[k] || a[k].version !== b[k].version);
const miss = Object.keys(a).some((k) => k && !b[k] && !a[k].optional && !a[k].peer);
process.exit(bad || miss ? 1 : 0);' 2> /dev/null; then
  :
else
  run "Installing the app’s tools (needs the internet)" npm ci --no-audit --no-fund
fi
run "Building the app’s copy of Forge (needs the internet)" npm run native:build
run "Copying Forge into the iPhone app" npx cap sync ios
ok "Forge is built"

# ---- 5. Find the iPhone ----
DEVICES="$PWD/.devices.json"
rm -f "$DEVICES"
xcrun devicectl list devices --json-output "$DEVICES" >> "$LOG" 2>&1
UDID_NAME="$(node -e '
const fs = require("fs");
let d = []; try { d = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).result.devices || []; } catch (e) {}
const phones = d.filter((x) => (x.hardwareProperties || {}).deviceType === "iPhone" && (x.hardwareProperties || {}).reality !== "virtual");
const state = (x) => (x.connectionProperties || {}).tunnelState;
const paired = phones.filter((x) => (x.connectionProperties || {}).pairingState === "paired");
const pick = paired.find((x) => state(x) === "connected") || paired.find((x) => state(x) !== "unavailable");
if (pick) console.log(pick.hardwareProperties.udid + "\t" + ((pick.deviceProperties || {}).name || "your iPhone"));
' "$DEVICES" 2> /dev/null)"
rm -f "$DEVICES"
if [ -z "$UDID_NAME" ]; then
  stop "I can’t see your iPhone." "Plug it into the Mac with its cable, unlock it, and tap Trust if it asks." "(Wi-Fi works too, but only if you turned on \"Show this iPhone when on Wi-Fi\" for it in Xcode → Window → Devices and Simulators.)"
fi
UDID="${UDID_NAME%%$'\t'*}"
NAME="${UDID_NAME#*$'\t'}"
ok "Found your iPhone: $NAME"

# ---- 6. Build, sign and install ----
BUILD="$PWD/build/ios"
APP="$BUILD/Build/Products/Debug-iphoneos/App.app"
build_app() {
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
    -destination "id=$UDID" -derivedDataPath "$BUILD" \
    -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic build >> "$LOG" 2>&1
}
printf '  … Building and signing the app (a few minutes)\n'
if ! build_app; then
  if grep -qiE 'no account|sign in|Apple ID|not signed in' "$LOG"; then
    stop "Xcode isn’t signed in to your Apple ID." "Open Xcode → Settings → Accounts, sign in with your Apple ID, close Xcode, then try again."
  elif grep -qiE 'locked|developer mode|not connected|unavailable' "$LOG"; then phone_help "The Mac couldn’t reach your iPhone."
  elif grep -qiE '10 App IDs|App ID limit|maximum number' "$LOG"; then
    stop "Apple’s free-account limit was reached (10 new app IDs per 7 days)." "Wait a few days and try again."
  else
    stop "The app didn’t build." "The details are in refresh-forge.log (in the Forge folder)."
  fi
fi

# The signing profile says exactly when the app stops opening. Put that date into the app (Settings and the
# Today banner show it), then build again: only the app's files changed, so this is quick.
EXPIRES="$(security cms -D -i "$APP/embedded.mobileprovision" 2> /dev/null | plutil -extract ExpirationDate raw -o - - 2> /dev/null)"
if [ -n "$EXPIRES" ] && [ -d ios/App/App/public ]; then
  node -e '
const fs = require("fs"), f = process.argv[1];
const j = JSON.parse(fs.readFileSync(f, "utf8"));
j.expires = new Date(process.argv[2]).toISOString();
fs.writeFileSync(f, JSON.stringify(j) + "\n");' ios/App/App/public/app-install.json "$EXPIRES" >> "$LOG" 2>&1 \
    && { build_app || stop "The app didn’t build." "The details are in refresh-forge.log (in the Forge folder)."; }
fi
[ -d "$APP" ] || stop "The app didn’t build." "The details are in refresh-forge.log (in the Forge folder)."
ok "The app is built and signed"

printf '  … Installing on %s (keep it unlocked)\n' "$NAME"
printf '\n$ devicectl install\n' >> "$LOG"
if ! xcrun devicectl device install app --device "$UDID" "$APP" >> "$LOG" 2>&1; then
  phone_help "The install on $NAME didn’t work."
fi
ok "Installed on $NAME"

cat << 'DONE'

Forge is refreshed: good for 7 more days.
(Your Forge data is untouched. Open Forge on the phone. If it says "Untrusted Developer", trust your Apple ID once in Settings → General → VPN & Device Management.)
DONE
wait_key
exit 0
