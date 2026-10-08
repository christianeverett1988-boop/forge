// Forge Cloud Functions (2nd gen, Node 22, us-east1). Thin wiring only: the logic lives in src/ and is
// unit-tested with no network (test/). Every function is capped at 2 instances so a bug or abuse can't
// scale costs.
//
// Secrets (set once in your own Terminal, never in the repo or the app):
//   firebase functions:secrets:set WITHINGS_CLIENT_SECRET
//   firebase functions:secrets:set WITHINGS_WEBHOOK_KEY
// Plain config (asked for at deploy, saved in functions/.env.<project>): WITHINGS_CLIENT_ID.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { defineSecret, defineString } from 'firebase-functions/params';

import { makeClient } from './src/withings-api.js';
import { startAuth, handleCallback } from './src/oauth.js';
import { handleWebhook } from './src/webhook.js';
import { runTask } from './src/tasks.js';
import { getAccessToken } from './src/tokens.js';
import { incrementalSync } from './src/sync.js';
import { runDataCheck, saveReport } from './src/datacheck.js';
import { maintainAll, disconnect } from './src/maintenance.js';
import { resultPage } from './src/pages.js';
import { P } from './src/paths.js';

initializeApp();
const REGION = 'us-east1';
setGlobalOptions({ region: REGION, maxInstances: 2, memory: '256MiB' });

const CLIENT_SECRET = defineSecret('WITHINGS_CLIENT_SECRET');
const WEBHOOK_KEY = defineSecret('WITHINGS_WEBHOOK_KEY');
const CLIENT_ID = defineString('WITHINGS_CLIENT_ID', { description: 'Client ID of your Withings developer app (not secret)' });
const APP_URL = defineString('FORGE_APP_URL', { default: 'https://christianeverett1988-boop.github.io/forge/' });

const project = () => process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId;
const base = () => `https://${REGION}-${project()}.cloudfunctions.net`;
const redirectUri = () => `${base()}/withingsOAuthCallback`;
const webhookUrl = () => `${base()}/withingsWebhook?k=${WEBHOOK_KEY.value()}`;

const db = () => getFirestore();
const api = () => makeClient({ fetch: globalThis.fetch, clientId: CLIENT_ID.value(), clientSecret: CLIENT_SECRET.value() });
const enqueue = (data, opts) => getFunctions().taskQueue(`locations/${REGION}/functions/withingsTask`).enqueue(data, opts);

const needUid = (req) => {
  if (!req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return req.auth.uid;
};

// ---------- connect ----------
export const withingsAuthStart = onCall({ secrets: [] }, async (req) => {
  const uid = needUid(req);
  return startAuth({ db: db(), api: makeClient({ fetch: globalThis.fetch, clientId: CLIENT_ID.value() }), uid, redirectUri: redirectUri() });
});

export const withingsOAuthCallback = onRequest({ secrets: [CLIENT_SECRET, WEBHOOK_KEY], invoker: 'public', timeoutSeconds: 30 }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'HEAD') { res.status(200).end(); return; } // Withings checks the URL when you save it
  if (req.method !== 'GET') { res.status(405).end(); return; }
  const r = await handleCallback(req.query || {}, { db: db(), api: api(), enqueue, redirectUri: redirectUri(), webhookUrl: webhookUrl(), appUrl: APP_URL.value() });
  if (r.redirect) { res.redirect(302, r.redirect); return; }
  res.status(r.status).type('html').send(resultPage(r.page, APP_URL.value()));
});

// ---------- notifications ----------
export const withingsWebhook = onRequest({ secrets: [WEBHOOK_KEY], invoker: 'public', timeoutSeconds: 10 }, async (req, res) => {
  const r = await handleWebhook({ method: req.method, query: req.query, body: req.body }, { db: db(), enqueue, key: WEBHOOK_KEY.value() });
  res.status(r.status).type('text').send(r.text);
});

// ---------- the worker: syncs and backfill pages ----------
export const withingsTask = onTaskDispatched({
  secrets: [CLIENT_SECRET],
  timeoutSeconds: 300,
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 60, maxBackoffSeconds: 3600 },
  rateLimits: { maxConcurrentDispatches: 1, maxDispatchesPerSecond: 1 },
}, async (req) => {
  await runTask(req.data, { db: db(), api: api(), enqueue });
});

// ---------- buttons in the app ----------
export const withingsSyncNow = onCall({ secrets: [CLIENT_SECRET], timeoutSeconds: 120 }, async (req) => {
  const uid = needUid(req);
  const ref = db().doc(P.status(uid));
  const wait = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const last = s.exists && s.data().last_manual_sync_at ? Date.parse(s.data().last_manual_sync_at) : 0;
    const left = last + 10 * 60 * 1000 - Date.now(); // Withings asks apps not to poll: at most every 10 min
    if (left > 0) return Math.ceil(left / 60000);
    tx.set(ref, { last_manual_sync_at: new Date().toISOString() }, { merge: true });
    return 0;
  });
  if (wait) throw new HttpsError('resource-exhausted', `Try again in ${wait} min.`);
  const token = await getAccessToken({ db: db(), api: api(), uid });
  const r = await incrementalSync({ db: db(), api: api(), uid, token, reason: 'manual' });
  return { created: r.created, updated: r.updated };
});

export const withingsDataCheck = onCall({ secrets: [CLIENT_SECRET, WEBHOOK_KEY], timeoutSeconds: 300 }, async (req) => {
  const uid = needUid(req);
  const data = req.data || {};
  if (data.action === 'save') return saveReport({ db: db(), uid, label: data.label });
  const token = await getAccessToken({ db: db(), api: api(), uid });
  return runDataCheck({ db: db(), api: api(), uid, token, webhookUrl: webhookUrl() });
});

export const withingsDisconnect = onCall({ secrets: [CLIENT_SECRET, WEBHOOK_KEY], timeoutSeconds: 300 }, async (req) => {
  const uid = needUid(req);
  return disconnect({ db: db(), api: api(), uid, webhookUrl: webhookUrl(), deleteData: !!(req.data && req.data.deleteData) });
});

// ---------- daily upkeep (1 Cloud Scheduler job) ----------
export const withingsMaintenance = onSchedule({ schedule: '0 4 * * *', timeZone: 'America/New_York', secrets: [CLIENT_SECRET, WEBHOOK_KEY], timeoutSeconds: 540, retryCount: 1 }, async () => {
  await maintainAll({ db: db(), api: api(), enqueue, webhookUrl: webhookUrl() });
});
