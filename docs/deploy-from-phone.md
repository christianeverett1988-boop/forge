# Deploy from your phone

Forge's backend (Cloud Functions and the Firestore rules) now deploys with a button on GitHub. You don't need the Mac, a cable or the iPhone hotspot. GitHub's servers do the deploy, so your home Wi-Fi blocking `googleapis.com` doesn't matter.

The website itself still updates by itself when a PR merges (GitHub Pages). This button is only for the backend.

## Every deploy (about 30 seconds of tapping, 2–5 minutes of waiting)

GitHub's iPhone app can run it (GitHub added "Run workflow" to GitHub Mobile in July 2024). Safari on github.com works the same way if the app ever gives you trouble.

1. Open the **GitHub** app and go to the **forge** repo.
2. Scroll down and tap **Actions**.
3. Tap **Deploy**.
4. Tap **Run workflow**.
5. **Use workflow from:** leave it on **main**. (Always main, even when deploying a PR branch.)
6. **What to deploy:**
   - **functions** for Cloud Functions changes (most of the time),
   - **rules** when `firestore.rules` changed,
   - **everything** for both. (It never touches the website.)
7. **Branch to deploy:** leave **main**, or type a PR's branch name to try that PR's backend before you merge it. The branch name is on the PR page, under the title.
8. Leave **Also delete live functions…** off.
9. Tap **Run workflow**.
10. Tap the new run at the top of the list. Wait for the green check ✅ (2–5 minutes for functions, under a minute for rules). The summary at the bottom says in plain words what was deployed, from which branch and commit, and whether it worked.

A red ✗ means nothing new is live, or only part of it. Tap the run, then the red step, to see why. Running it again is always safe.

**Only deploy branches you've looked at.** Their code runs on Google's side as soon as it's deployed, and it runs during the deploy too.

## One-time setup (about 5 minutes)

This tells Google to accept deploys from this one GitHub workflow, started by you, from main. No password or key is created or stored anywhere: GitHub proves who it is to Google for each run with a token that lasts minutes. Nothing here is secret, so it's fine that the repo is public.

The button can only be used once this PR is merged, because GitHub only shows "Run workflow" for workflow files on main.

### 1. Run the setup in Google Cloud Shell

1. On your phone or any computer, open **console.cloud.google.com** and sign in as yourself.
2. At the top, check that the project is **forge-web-f2351**.
3. Tap the **>_** icon (Activate Cloud Shell) at the top right. Wait for the black terminal at the bottom. If it asks to authorize, tap **Authorize**.
4. Copy the whole grey block below (from `cat` to the last line), paste it into Cloud Shell, and press Return.

```bash
cat > ~/forge-deploy-setup.sh <<'SETUP'
#!/usr/bin/env bash
# Forge "Deploy" button: one-time Google Cloud setup. Keyless (no key file is ever created). Safe to re-run.
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT=forge-web-f2351
REGION=us-east1
REPO_ID=1409700573   # github.com/christianeverett1988-boop/forge
OWNER_ID=259723992   # GitHub user christianeverett1988-boop
WORKFLOW_REF="christianeverett1988-boop/forge/.github/workflows/deploy.yml@refs/heads/main"
POOL=github
PROVIDER=forge-deploy
SA_NAME=forge-deployer
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
ROLE_ID=forgeDeployExtras
SECRETS="WITHINGS_CLIENT_SECRET WITHINGS_WEBHOOK_KEY USDA_API_KEY XAI_API_KEY"
retry() { for _ in 1 2 3 4 5 6; do "$@" >/dev/null 2>&1 && return 0; sleep 10; done; "$@" >/dev/null; }

gcloud config set project "$PROJECT" >/dev/null 2>&1
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUNTIME_SA="${NUM}-compute@developer.gserviceaccount.com"
LEGACY_SA="${PROJECT}@appspot.gserviceaccount.com"
POOL_NAME="projects/${NUM}/locations/global/workloadIdentityPools/${POOL}"

echo "1/6 Turning on the APIs the deploy uses (can take a minute)..."
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com firebase.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com cloudtasks.googleapis.com secretmanager.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com storage.googleapis.com \
  firebaserules.googleapis.com firestore.googleapis.com >/dev/null

echo "2/6 The deploy robot account (no key)..."
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="Forge Deploy button (GitHub, keyless)" >/dev/null
retry gcloud iam service-accounts describe "$SA"

echo "3/6 A small custom role for two permissions no narrow built-in role has..."
PERMS=firebase.projects.get,serviceusage.services.generateServiceIdentity
if gcloud iam roles describe "$ROLE_ID" --project="$PROJECT" >/dev/null 2>&1; then
  if [ "$(gcloud iam roles describe "$ROLE_ID" --project="$PROJECT" --format='value(deleted)')" = "True" ]; then
    gcloud iam roles undelete "$ROLE_ID" --project="$PROJECT" >/dev/null
  fi
  gcloud iam roles update "$ROLE_ID" --project="$PROJECT" --permissions="$PERMS" --stage=GA >/dev/null
else
  gcloud iam roles create "$ROLE_ID" --project="$PROJECT" --title="Forge deploy extras" \
    --description="Read the Firebase project config; create the Pub/Sub and Eventarc service identities." \
    --permissions="$PERMS" --stage=GA >/dev/null
fi

echo "4/6 Granting only what firebase deploy needs..."
for ROLE in roles/cloudfunctions.admin roles/run.admin roles/artifactregistry.reader \
    roles/cloudscheduler.admin roles/cloudtasks.queueAdmin roles/secretmanager.viewer \
    roles/firebaserules.admin roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer \
    "projects/${PROJECT}/roles/${ROLE_ID}"; do
  retry gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" --role="$ROLE" --condition=None
done
retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${SA}" --role=roles/iam.serviceAccountUser --condition=None
if gcloud iam service-accounts describe "$LEGACY_SA" >/dev/null 2>&1; then
  retry gcloud iam service-accounts add-iam-policy-binding "$LEGACY_SA" \
    --member="serviceAccount:${SA}" --role=roles/iam.serviceAccountUser --condition=None
fi
# The functions (not the robot) read the secrets. Granting that here means the robot never needs to change secret permissions.
for S in $SECRETS; do
  if gcloud secrets describe "$S" >/dev/null 2>&1; then
    retry gcloud secrets add-iam-policy-binding "$S" \
      --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor --condition=None
  fi
done

echo "5/6 Keyless sign-in from GitHub, for this repo, its owner and the main-branch deploy.yml only..."
if gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1; then
  if [ "$(gcloud iam workload-identity-pools describe "$POOL" --location=global --format='value(state)')" = "DELETED" ]; then
    gcloud iam workload-identity-pools undelete "$POOL" --location=global >/dev/null
  fi
else
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions" >/dev/null
fi
MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.actor_id=assertion.actor_id,attribute.workflow_ref=assertion.workflow_ref,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name"
CONDITION="assertion.repository_id=='${REPO_ID}' && assertion.repository_owner_id=='${OWNER_ID}' && assertion.actor_id=='${OWNER_ID}' && assertion.event_name=='workflow_dispatch' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='${WORKFLOW_REF}'"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" --location=global >/dev/null 2>&1; then
  if [ "$(gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" --location=global --format='value(state)')" = "DELETED" ]; then
    gcloud iam workload-identity-pools providers undelete "$PROVIDER" --workload-identity-pool="$POOL" --location=global >/dev/null
  fi
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --workload-identity-pool="$POOL" --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION" >/dev/null
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool="$POOL" --location=global \
    --display-name="Forge deploy.yml" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION" >/dev/null
fi
retry gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${REPO_ID}" --condition=None

echo "6/6 Old build images: auto-delete after 1 day (only if no cleanup rule is set yet)..."
if REPO_JSON=$(gcloud artifacts repositories describe gcf-artifacts --location="$REGION" --format=json 2>/dev/null); then
  if echo "$REPO_JSON" | jq -e '((.cleanupPolicies // {}) | length) == 0 and ((.labels // {})["firebase-functions-cleanup-opted-out"] != "true")' >/dev/null; then
    echo '[{"name":"firebase-functions-cleanup","action":{"type":"Delete"},"condition":{"tagState":"any","olderThan":"1d"}}]' > /tmp/forge-cleanup.json
    gcloud artifacts repositories set-cleanup-policies gcf-artifacts --location="$REGION" --policy=/tmp/forge-cleanup.json --no-dry-run >/dev/null
  fi
fi

echo
echo "All set. Add these two GitHub Actions VARIABLES (they are not secrets):"
echo
echo "GCP_WIF_PROVIDER"
echo "${POOL_NAME}/providers/${PROVIDER}"
echo
echo "GCP_DEPLOY_SA"
echo "${SA}"
SETUP
bash ~/forge-deploy-setup.sh
```

5. It takes 1–3 minutes. At the end it prints **All set** and two values. Keep the tab open.

If it stops with an error, copy the error and send it to me. Running the block again is always safe.

### 2. Add the two values to GitHub

These are **variables**, not secrets.

1. On github.com (Safari works; the GitHub app doesn't have repo settings), open the **forge** repo.
2. Tap **Settings** → **Secrets and variables** → **Actions**.
3. Tap the **Variables** tab, then **New repository variable**.
4. **Name:** `GCP_WIF_PROVIDER`. **Value:** the long line printed under `GCP_WIF_PROVIDER` (it starts with `projects/` and ends with `/providers/forge-deploy`). Tap **Add variable**.
5. Tap **New repository variable** again. **Name:** `GCP_DEPLOY_SA`. **Value:** the line under `GCP_DEPLOY_SA` (`forge-deployer@forge-web-f2351.iam.gserviceaccount.com`). Tap **Add variable**.

Done. Run your first deploy with the steps at the top.

## What the setup grants, and why

The deploy runs as a robot account, `forge-deployer`, that has no key. Google only lets a GitHub run act as it when **all** of these are true. GitHub signs each of these facts, so they can't be faked:

- the repo is `christianeverett1988-boop/forge` (checked by its permanent numeric id, so a renamed or re-created repo doesn't count);
- the run was started by you (your numeric GitHub id);
- it was started with the Run workflow button;
- it runs `.github/workflows/deploy.yml` **as it is on main**.

So the Claude workflow, the tests workflow, a fork, or an edited copy of `deploy.yml` on a branch can't get Google access. The workflow file also checks that you're the one who started it.

The robot can do only what `firebase deploy` needs for Forge's functions, rules and indexes:

| Role | Why |
|---|---|
| Cloud Functions Admin | Create and update the functions. The deploy also checks it can set who may call new HTTPS functions (for example `foodSearch`). |
| Cloud Run Admin | 2nd-gen functions are Cloud Run services. The deploy sets their "who can call me" setting (public for the webhook, Health and callable functions). |
| Service Account User, on the functions' own account only (`…-compute@developer…`) | A function runs as that account, so deploying one means acting as it. Granted on that one account, not project-wide. Also on the old App Engine account if your project has one, because firebase-tools checks it. |
| Cloud Scheduler Admin | The 4 am `withingsMaintenance` job. |
| Cloud Tasks Queue Admin | The `withingsTask` queue (retries and rate limits). |
| Secret Manager Viewer | Check that the secrets the code uses exist and are enabled. It **can't read** their values. The functions read them at run time, using access this setup grants to the functions' account. |
| Firebase Rules Admin | Publish `firestore.rules`. |
| Cloud Datastore Index Admin | Firestore indexes (none yet), and the deploy checks this role before any Firestore deploy. It can't read your data. |
| Artifact Registry Reader | Read the build-image repo's cleanup rule. Google's build service, not the robot, writes the images. |
| Service Usage Consumer | Check that the Google APIs are on, and bill API calls to this project. |
| Custom "Forge deploy extras": `firebase.projects.get`, `serviceusage.services.generateServiceIdentity` | The deploy reads the Firebase project config, and makes sure the Pub/Sub and Eventarc service accounts exist. No narrow built-in role has these. |

Deliberately **not** granted:

- **Firebase Viewer:** it can read every Firestore document and Auth user.
- **Secret access or Secret Manager Admin.**
- **Cloud Build Editor** and **Artifact Registry Writer:** Google's build service does the builds.
- **Eventarc and Pub/Sub:** Forge has no Firestore or Pub/Sub triggers. The schedule calls the function directly.
- **Changing project permissions or turning on APIs:** the setup turns on every API the deploy needs.

The functions' account (`…-compute@developer…`) usually has broad access to your project. Anyone who can deploy code can make that code use it. That's true of every Cloud Functions deploy, which is why only you can start one.

## When the button can't do it

Use the Mac (`firebase deploy --only functions,firestore:rules` with the hotspot, see [DEPLOY.md](../DEPLOY.md)) for:

- **A new kind of trigger** the project has never had, such as the first Firestore or Storage trigger. Those need project-permission changes, which the robot can't make.
- **A new secret.** Set it in your own terminal (`firebase functions:secrets:set NAME`). Then add its name to the `SECRETS=` line in the block above and run the block again, so the functions can read it.
- **Removing or renaming a function.** The deploy stops rather than delete a live function. To delete on purpose, run the button with **Also delete live functions…** turned on. That option also skips a few other "are you sure?" questions: functions that start retrying on failure, or a higher minimum bill.

## How it works (for the next developer)

- Workflow: `.github/workflows/deploy.yml`. Manual trigger only, one deploy at a time (`concurrency`), job environment `production`, and only the repo owner can run it.
- It checks out the `ref` input, installs `functions/` dependencies *before* signing in to Google, then signs in with `google-github-actions/auth` (Workload Identity Federation, impersonating `forge-deployer`). Then it runs a pinned `firebase-tools` with `deploy --only … --project forge-web-f2351 --non-interactive`.
- `--force` is only added when you tick "Also delete live functions". That's why setup step 6 sets the build-image cleanup rule ahead of time. Without it, a non-interactive deploy would stop on the cleanup question.
- The functions read plain settings (`WITHINGS_CLIENT_ID`, `FORGE_APP_URL`) from `functions/.env` and `functions/.env.forge-web-f2351`. The second file is on the Mac, not in git. For any setting the branch's files don't give, the workflow copies the value the live functions already use, so a deploy never changes it. A brand-new setting needs its non-secret value committed in `functions/.env`.
- Action versions are pinned to commit SHAs.
