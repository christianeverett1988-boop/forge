// v0.15.4: files leave the iPhone app through the iOS share sheet (Filesystem cache + Share), the doctor summary
// becomes a PDF there, and the web keeps its downloads. Synthetic data only.
import { readFileSync } from 'node:fs';
import { test, eq, assert } from './harness.js';
import { deliver } from '../js/deliver-file.js';
import { shareOrSave } from '../js/photos/deliver.js';
import { shareImage } from '../js/ui/sharecard.js';
import { shareNative, SHARE_ERROR, WRITE_ERROR } from '../js/native/share.js';

function shell({ shareFails = null, writeFails = false } = {}) {
  const calls = [];
  const files = new Map();
  const Filesystem = {
    async writeFile(o) { if (writeFails) throw new Error('disk full'); files.set(o.path, o.data); calls.push(['write', o.path, o.directory]); },
    async appendFile(o) { files.set(o.path, files.get(o.path) + o.data); calls.push(['append', o.path]); },
    async getUri(o) { return { uri: `file:///cache/${o.path}` }; },
    async deleteFile(o) { files.delete(o.path); calls.push(['delete', o.path]); },
  };
  const Share = { async share(o) { calls.push(['share', o.files[0], o.title]); if (shareFails) throw new Error(shareFails); return {}; } };
  const Plugins = { Filesystem, Share };
  globalThis.window = { Capacitor: { isNativePlatform: () => true, isPluginAvailable: (n) => n in Plugins, Plugins } };
  return { calls, files };
}
const web = () => { globalThis.window = {}; };
const names = (calls) => calls.map((c) => c[0]).join(',');

test('native: JSON/CSV export is written to the cache, shared, then deleted', async () => {
  const { calls, files } = shell();
  await deliver('forge-export-2026-10-10.json', '{"steps":"8,532"}', 'application/json');
  eq(names(calls), 'write,share,delete');
  eq(calls[0][2], 'CACHE');
  eq(calls[1][1], 'file:///cache/forge-share/forge-export-2026-10-10.json');
  eq(files.size, 0, 'cache file removed');
});

test('native: zip, time-lapse and photo files go through shareOrSave to the share sheet', async () => {
  const { calls } = shell();
  const blob = new Blob([new Uint8Array(7 * 1024 * 1024)], { type: 'application/zip' });
  eq(await shareOrSave(blob, 'forge-photos-2026-10-10.zip', 'Your photo backup'), 'shared');
  eq(names(calls), 'write,append,append,share,delete'); // 7 MB goes in 3 MB pieces
});

test('native: the workout share card goes through the share sheet', async () => {
  const { calls } = shell();
  eq(await shareImage(new Blob(['png'], { type: 'image/png' }), 'forge-workout-12.png'), 'shared');
  eq(names(calls), 'write,share,delete');
  eq(calls[1][2], 'My Forge workout');
});

test('native: closing the share sheet is not an error, and still cleans up', async () => {
  const { calls, files } = shell({ shareFails: 'Share canceled' });
  eq(await shareOrSave(new Blob(['x']), 'a.zip', 'A'), 'cancelled');
  eq(names(calls), 'write,share,delete');
  eq(files.size, 0);
});

test('native: a failed share or write says so in plain words', async () => {
  shell({ shareFails: 'boom' });
  let msg = '';
  try { await shareNative(new Blob(['x']), 'a.pdf', 'A'); } catch (e) { msg = e.message; }
  eq(msg, SHARE_ERROR);
  eq(SHARE_ERROR, 'Couldn’t open the share sheet. Try again.');
  const s = shell({ writeFails: true });
  msg = '';
  try { await deliver('a.csv', 'x', 'text/csv'); } catch (e) { msg = e.message; }
  eq(msg, WRITE_ERROR);
  eq(names(s.calls), '', 'nothing to clean up when nothing was written');
});

test('web: exports still use the browser (no native plugins touched)', async () => {
  web();
  const made = [];
  globalThis.File = class { constructor(parts, name, o) { this.name = name; this.type = o.type; } };
  Object.defineProperty(globalThis, 'navigator', { value: { canShare: () => true, share: async (o) => { made.push(o.files[0].name); } }, configurable: true });
  await deliver('forge-weights.csv', 'a,b', 'text/csv');
  eq(made.join(), 'forge-weights.csv');
  eq(await shareOrSave(new Blob(['x'], { type: 'application/zip' }), 'p.zip', 'P'), 'shared');
});


test('doctor summary: Print or share in the app, window.print on the web', () => {
  const src = readFileSync(new URL('../js/screens/report.js', import.meta.url), 'utf8');
  assert(src.includes('Print or share') && src.includes('shareNative(summaryPdf('));
  assert(src.includes('window.print()'));
});

test('plugins reach the device build', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert(pkg.devDependencies['@capacitor/filesystem'] && pkg.devDependencies['@capacitor/share']);
  const spm = readFileSync(new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url), 'utf8');
  assert(spm.includes('CapacitorFilesystem') && spm.includes('CapacitorShare'));
});
