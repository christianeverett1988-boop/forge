// The iPhone app bridge (js/native/*): a no-op on the web; with a (fake) Capacitor shell it calls the plugins.
// HealthKit samples become the same daily summaries the export import makes.
import { test, eq, assert, near } from './harness.js';
import { isNative, plugin, haptic, syncRestNotification, openExternal, REST_NOTIFICATION_ID } from '../js/native/bridge.js';
import { localStamp, sampleToRecord, sleepRecords, totalToRecord, daysFromHealth } from '../js/native/health.js';
import { cdnRefs, localise, COPY } from '../scripts/build-www.mjs';

function fakeShell({ names = ['Haptics', 'LocalNotifications', 'Browser', 'StatusBar'], permission = 'prompt' } = {}) {
  const calls = [];
  const rec = (name) => new Proxy({}, { get: (_, m) => m === 'then' ? undefined : async (arg) => {
    calls.push([name, m, arg]);
    if (m === 'checkPermissions') return { display: permission };
    return {};
  } });
  const Plugins = Object.fromEntries(names.map((n) => [n, rec(n)]));
  globalThis.window = { Capacitor: { isNativePlatform: () => true, isPluginAvailable: (n) => names.includes(n), Plugins } };
  return calls;
}
const web = () => { globalThis.window = {}; };
const tickq = () => new Promise((r) => setTimeout(r, 0));

test('native bridge on the web: everything is a harmless no-op', async () => {
  web();
  eq(isNative(), false);
  eq(plugin('Haptics'), null);
  eq(haptic('success'), false);
  eq(openExternal('https://example.com'), false);
  eq(await syncRestNotification(Date.now() + 60000), false);
});

test('native haptics: taps are impacts, outcomes are notifications', async () => {
  const calls = fakeShell();
  assert(isNative());
  haptic('medium');
  haptic('success');
  haptic('select');
  await tickq();
  eq(JSON.stringify(calls.filter((c) => c[0] === 'Haptics').map((c) => [c[1], c[2]])), JSON.stringify([['impact', { style: 'MEDIUM' }], ['notification', { type: 'SUCCESS' }], ['selectionChanged', undefined]]));
});

test('rest timer on the lock screen: asks once, schedules one notification, moves it, cancels it', async () => {
  const calls = fakeShell();
  const end = Date.now() + 90000;
  await syncRestNotification(end, { body: 'Next: Squat' });
  await syncRestNotification(end); // same end: nothing new
  const N = () => calls.filter((c) => c[0] === 'LocalNotifications').map((c) => c[1]);
  eq(N().join(), 'checkPermissions,requestPermissions,schedule');
  const sched = calls.find((c) => c[1] === 'schedule')[2].notifications[0];
  eq(sched.id, REST_NOTIFICATION_ID);
  eq(sched.body, 'Next: Squat');
  near(sched.schedule.at.getTime(), end, 1000);
  await syncRestNotification(end + 30000); // +30 s
  eq(N().slice(3).join(), 'cancel,schedule');
  await syncRestNotification(null); // stopped or paused
  eq(N().slice(5).join(), 'cancel');
  await syncRestNotification(Date.now() + 1000); // under 2 s left: nothing to schedule
  eq(N().length, 6);
});

test('plugin lookup tries each name (a plugin can register under a different name)', () => {
  fakeShell({ names: ['CapacitorHealth'] });
  assert(plugin('Health', 'CapacitorHealth') != null);
  eq(plugin('Health'), null);
  web();
});

test('Withings sign-in opens over the app in the iPhone app', async () => {
  const calls = fakeShell();
  eq(openExternal('https://account.withings.com/x'), true);
  await tickq();
  eq(calls.find((c) => c[0] === 'Browser')[2].url, 'https://account.withings.com/x');
  web();
});

test('HealthKit → export-style records: local time stamps, sleep stages, daily totals', () => {
  const s = localStamp('2026-10-09T10:41:05Z');
  assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/.test(s), s);
  const hrv = sampleToRecord('heartRateVariability', { value: 48.2, unit: 'ms', startDate: '2026-10-09T09:00:00Z', endDate: '2026-10-09T09:01:00Z', sourceName: 'Watch' });
  eq(hrv.type, 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN');
  eq(hrv.value, '48.2');
  eq(sampleToRecord('heartRate', { value: 60, startDate: '2026-10-09T09:00:00Z' }), null, 'types Forge does not use are skipped');
  const night = sleepRecords({ hasStageData: true, sourceName: 'Watch', stages: [{ startDate: '2026-10-09T03:00:00Z', endDate: '2026-10-09T04:00:00Z', stage: 'deep' }, { startDate: '2026-10-09T04:00:00Z', endDate: '2026-10-09T05:30:00Z', stage: 'light' }] });
  eq(night.map((r) => r.value.replace('HKCategoryValueSleepAnalysis', '')).join(), 'AsleepDeep,AsleepCore');
  const steps = totalToRecord('steps', { startDate: '2026-10-08T04:00:00Z', value: 8421 });
  eq(steps.sourceName, 'HealthKit');
  eq(totalToRecord('steps', { startDate: '2026-10-08T04:00:00Z', value: 0 }), null);
});

test('HealthKit → daily summaries with the export importer: overnight HRV, sleep minutes, steps from one source', () => {
  const local = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
  const samples = {
    heartRateVariability: [{ value: 40, startDate: local(8, 3), endDate: local(8, 3, 1) }, { value: 50, startDate: local(8, 5), endDate: local(8, 5, 1) }, { value: 90, startDate: local(8, 15), endDate: local(8, 15, 1) }],
    restingHeartRate: [{ value: 58, startDate: local(8, 7), endDate: local(8, 7) }],
    sleep: [{ hasStageData: true, stages: [{ startDate: local(7, 23), endDate: local(8, 1), stage: 'light' }, { startDate: local(8, 1), endDate: local(8, 2), stage: 'deep' }, { startDate: local(8, 2), endDate: local(8, 2, 20), stage: 'awake' }, { startDate: local(8, 2, 20), endDate: local(8, 6, 20), stage: 'rem' }] }],
  };
  const totals = { steps: [{ startDate: local(8, 0), value: 9100 }], calories: [{ startDate: local(8, 0), value: 512.6 }] };
  const { days } = daysFromHealth({ samples, totals, since: '2026-10-08' });
  eq(days.length, 1);
  const d = days[0];
  eq(d.day, '2026-10-08');
  eq(d.hrv_sdnn_ms, 45, 'the 3 pm reading is not overnight');
  eq(d.rhr_bpm, 58);
  eq(d.steps, 9100);
  eq(d.active_kcal, 513);
  eq(d.sleep.asleep_min, 7 * 60, '11 pm–6:20 am minus 20 min awake');
  eq(d.sleep.deep_min, 60);
  eq(d.sleep.awake_min, 20);
  eq(daysFromHealth({ since: '2026-10-08' }).days.length, 0);
});

test('www build: finds the Firebase files the app imports and points them at the bundled copies', () => {
  const t = "import { x } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'; await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js');";
  eq(cdnRefs(t).map((r) => `${r.file}@${r.version}`).join(), 'firebase-firestore.js@12.19.0,firebase-functions.js@12.19.0');
  eq(localise(t), "import { x } from '/vendor/firebase/firebase-firestore.js'; await import('/vendor/firebase/firebase-functions.js');");
  for (const keep of ['index.html', 'js', 'css', 'config.js']) assert(COPY.includes(keep), keep);
  for (const skip of ['functions', 'tests', 'notes', 'docs']) assert(!COPY.includes(skip), `${skip} stays out of the app`);
  web();
});

test('rest notification: a quick start-then-skip never leaves a stale notification', async () => {
  const calls = fakeShell();
  const p1 = syncRestNotification(Date.now() + 120000);
  const p2 = syncRestNotification(null); // skipped before the first call finished
  await Promise.all([p1, p2]);
  const N = calls.filter((c) => c[0] === 'LocalNotifications').map((c) => c[1]).filter((m) => m === 'schedule' || m === 'cancel');
  assert(N[N.length - 1] !== 'schedule', `left scheduled: ${N.join()}`);
  // and the other way round: a skip then a new rest ends with exactly that rest scheduled
  const end = Date.now() + 60000;
  await Promise.all([syncRestNotification(null), syncRestNotification(end)]);
  const last = calls.filter((c) => c[0] === 'LocalNotifications' && c[1] === 'schedule').pop();
  assert(last && Math.abs(last[2].notifications[0].schedule.at.getTime() - end) < 1000, 'the newest rest is the one scheduled');
  await syncRestNotification(null);
  web();
});

test('HealthKit daily totals land on the right day even when buckets start at UTC midnight', () => {
  const utcMidnight = '2026-10-08T00:00:00Z'; // 8 pm Oct 7 in New York, but the bucket is Oct 8
  const r = totalToRecord('steps', { startDate: utcMidnight, value: 5000 });
  const local = new Date(Date.parse(utcMidnight) + 12 * 3600e3);
  eq(r.endDate.slice(0, 10), `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`);
});
