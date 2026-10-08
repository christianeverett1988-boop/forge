#!/usr/bin/env node
// One-time script: download the start/end photos for Forge's exercises from free-exercise-db
// (public domain, Unlicense: https://github.com/yuhonas/free-exercise-db), shrink them to ~480 px wide
// JPEGs (~25 KB each) and save them in media/ex/<forge id>/0.jpg and 1.jpg, plus media/ex/index.json.
// Commit the output. The app never hotlinks: it only loads these files from your own site.
//
// Run from the repo folder:   node scripts/fetch-demo-photos.mjs
// Needs Node 18+ and an image resizer: `sips` (built into macOS) or ImageMagick (`magick` / `convert`).
// Options:  --from <folder>   use a local copy of free-exercise-db's exercises/ folder instead of downloading
//           --force           redo photos that already exist
import { readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const args = process.argv.slice(2);
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
const force = args.includes('--force');
const OUT = 'media/ex';
const WIDTH = 480;

const { EXERCISES } = await import(new URL('../js/workouts/exercises.js', import.meta.url));

// Pick a resizer.
const has = (cmd) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
const tool = has('sips') ? 'sips' : has('magick') ? 'magick' : has('convert') ? 'convert' : null;
if (!tool) {
  console.error('No image resizer found. On a Mac `sips` is built in; otherwise install ImageMagick.');
  process.exit(1);
}
function resize(src, dest) {
  if (tool === 'sips') execFileSync('sips', ['--resampleWidth', String(WIDTH), '-s', 'format', 'jpeg', '-s', 'formatOptions', '62', src, '--out', dest], { stdio: 'ignore' });
  else execFileSync(tool, [src, '-resize', `${WIDTH}x>`, '-strip', '-quality', '62', dest], { stdio: 'ignore' });
}

async function source(path) {
  if (from) return readFile(join(from, path));
  const res = await fetch(`${RAW}/exercises/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return Buffer.from(await res.arrayBuffer());
}

// Exercise list from free-exercise-db: which ids have images, and exact-name matches for exercises we
// haven't linked yet.
let fedb = [];
try {
  fedb = from && existsSync(join(from, '..', 'dist', 'exercises.json'))
    ? JSON.parse(await readFile(join(from, '..', 'dist', 'exercises.json'), 'utf8'))
    : await (await fetch(`${RAW}/dist/exercises.json`)).json();
} catch (e) {
  console.warn('Could not load the free-exercise-db list; using the ids already in exercises.js.', e.message);
}
const byId = new Map(fedb.map((e) => [e.id, e]));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const byName = new Map(fedb.map((e) => [norm(e.name), e]));

const jobs = [];
const suggestions = [];
for (const ex of EXERCISES) {
  let id = ex.fedb;
  if (!id) {
    const m = byName.get(norm(ex.name));
    if (m) { id = m.id; suggestions.push(`${ex.id}: fedb '${m.id}'`); }
  }
  if (!id) continue;
  const f = byId.get(id);
  const images = f ? f.images : [`${id}/0.jpg`, `${id}/1.jpg`];
  if (!images.length) continue;
  jobs.push({ forge: ex.id, images: images.slice(0, 2) });
}

await mkdir(OUT, { recursive: true });
const tmp = join(tmpdir(), `forge-photos-${process.pid}`);
await mkdir(tmp, { recursive: true });
const index = { source: 'free-exercise-db by Yuhonas, public domain (Unlicense)', width: WIDTH, ids: {} };
let done = 0;
let failed = 0;
for (const job of jobs) {
  const dir = join(OUT, job.forge);
  await mkdir(dir, { recursive: true });
  let bytes = 0;
  try {
    for (const [n, path] of job.images.entries()) {
      const dest = join(dir, `${n}.jpg`);
      if (force || !existsSync(dest)) {
        const raw = join(tmp, `${job.forge}-${n}.jpg`);
        await writeFile(raw, await source(path));
        resize(raw, dest);
      }
      bytes += (await stat(dest)).size;
    }
    index.ids[job.forge] = bytes;
    done++;
    process.stdout.write(`\r${done}/${jobs.length} ${job.forge}                    `);
  } catch (e) {
    failed++;
    await rm(dir, { recursive: true, force: true });
    console.warn(`\nSkipped ${job.forge}: ${e.message}`);
  }
}
await rm(tmp, { recursive: true, force: true });
await writeFile(join(OUT, 'index.json'), `${JSON.stringify(index, null, 0)}\n`);
const total = Object.values(index.ids).reduce((a, b) => a + b, 0);
console.log(`\n\nSaved photos for ${done} exercises (${(total / 1048576).toFixed(1)} MB) in ${OUT}/. ${failed ? `${failed} skipped.` : ''}`);
if (suggestions.length) console.log(`\nMatched by exact name (add these as fedb ids in exercises.js if they look right):\n  ${suggestions.join('\n  ')}`);
console.log('\nNext: commit the media/ex folder and push.');
