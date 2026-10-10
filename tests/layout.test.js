// Headless layout check (v0.15.7). Boots the real app in Chromium with a synthetic account and fails when a chip, pill,
// button or label wraps or clips, a tap target is under 44 px, or content runs off-screen or under the tab bar.
// Skips (loudly) when no Chrome/Chromium is installed. GitHub's ubuntu runners have one, so CI runs it.
//   LAYOUT_ROUTES=today,body node tests/layout.test.js   → only those screens
//   LAYOUT_SHOTS=/tmp/shots                              → also save a PNG of every render
import { test, assert } from './harness.js';
import { skipReason, launch } from './layout/browser.js';
import { detect } from './layout/detect.js';
import { seed } from './layout/seed.js';

const SIZES = [[320, 568], [375, 667], [390, 844], [440, 956]];
const ROUTES = ['play', 'today', 'train', 'body', 'weight', 'trends', 'timer', 'history', 'settings', 'apple', 'food', 'awards', 'locations', 'library'];
const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1] || process.env['LAYOUT_' + k.toUpperCase()];
const only = arg('routes') ? arg('routes').split(',') : null;
const shots = arg('shots');
let browser = null;

// every size in dark mode, plus light mode on the two common phones; the long-value account at 375 and 390
const CASES = [
  ...SIZES.map(([w, h]) => ({ w, h, dark: true, long: false })),
  { w: 375, h: 667, dark: false, long: false },
  { w: 375, h: 667, dark: true, long: true }, { w: 390, h: 844, dark: false, long: true },
  { w: 390, h: 844, dark: true, long: false, ts: 1.3 }, // iOS Text Size at ~130%: lines may wrap, but nothing may clip
];

if (arg('size')) CASES.splice(0, CASES.length, ...CASES.filter((c) => String(c.w) === arg('size')));

const standalone = !!(process.argv[1] && process.argv[1].endsWith("layout.test.js"));

for (const route of standalone ? ROUTES : []) {
  if (only && !only.includes(route)) continue;
  test(`layout: ${route} has no wraps, clips, small tap targets or overflow`, async () => {
    if (skipReason()) { console.log('      (skipped: ' + skipReason() + ')'); return; }
    browser = browser || await launch();
    const found = new Map();
    for (const c of CASES) {
      await browser.viewport(c.w, c.h, c.dark);
      await browser.open(route, seed({ long: c.long, active: route === 'play' }));
      const cls = await browser.eval('window.__cls || 0'); // before any text-size change
      if (c.ts) { await browser.eval(`document.documentElement.style.setProperty('--ts', '${c.ts}')`); await new Promise((r) => setTimeout(r, 300)); }
      const probs = await browser.eval(`(${detect})(${JSON.stringify({ largeText: !!c.ts })})`);
      if (await browser.eval("!!document.querySelector('#main .skeleton')")) probs.push(`screen never finished drawing (still the loading skeleton). Page errors: ${browser.errors.slice(-3).join(' | ') || 'none'}`);
      if (shots) await browser.screenshot(`${shots}/${route}-${c.w}x${c.h}-${c.dark ? 'dark' : 'light'}${c.long ? '-long' : ''}${c.ts ? '-text' : ''}.png`);
      if (shots) {
        await browser.eval("window.scrollTo({ top: 1e6, behavior: 'instant' })");
        await browser.screenshot(`${shots}/${route}-${c.w}x${c.h}-${c.dark ? 'dark' : 'light'}${c.long ? '-long' : ''}${c.ts ? '-text' : ''}-bottom.png`);
      }
      if (cls > 0.02) probs.push(`layout shift ${cls.toFixed(3)} on first render`);
      for (const p of probs) found.set(p, [...(found.get(p) || []), `${c.w}${c.dark ? "d" : "l"}${c.long ? "L" : ""}${c.ts ? "T" : ""}`]);
    }
    assert(found.size === 0, `\n        ${[...found].map(([p, at]) => `${p}  [${at.join(' ')}]`).join('\n        ')}`);
  });
}

for (const route of standalone ? ['today', 'train', 'body', 'weight', 'settings'] : []) {
  test(`layout: ${route}: the nav bar collapses once the large title scrolls under it, and not before`, async () => {
    if (skipReason()) return;
    browser = browser || await launch();
    await browser.viewport(390, 844, true);
    await browser.open(route, seed());
    const state = async (y) => { await browser.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' })`); await new Promise((r) => setTimeout(r, 350)); return browser.eval("document.getElementById('nav-bar') ? document.getElementById('nav-bar').classList.contains('collapsed') : document.querySelector('.navbar').classList.contains('collapsed')"); };
    assert((await state(0)) === false, 'expanded at the top');
    const h1 = await browser.eval("(() => { const r = (document.querySelector('.large-title h1') || document.querySelector('main h1')).getBoundingClientRect(); return r.bottom + window.scrollY; })()");
    assert((await state(Math.max(0, h1 - 120))) === false, 'still expanded while the title is below the bar');
    assert((await state(h1 + 40)) === true, 'collapsed once the title is under the bar');
  });
}

if (standalone) {
  test('layout: the Log weight label is one piece, and the workout place sits on its own line', async () => {
    if (skipReason()) return;
    browser = browser || await launch();
    for (const [w, label] of [[320, '+ Log'], [375, '+ Log weight']]) {
      await browser.viewport(w, 667, true);
      await browser.open('weight', seed());
      const got = await browser.eval("(document.querySelector('[data-log]') || {}).innerText");
      assert(got === label, `weight button reads "${got}" at ${w}, wanted "${label}"`);
    }
    for (const long of [false, true]) {
      await browser.viewport(320, 568, true);
      await browser.open('today', seed({ long }));
      const r = await browser.eval("(() => { const p = document.querySelector('[data-workout-place]'); if (!p) return null; const m = p.previousElementSibling; return { place: p.getBoundingClientRect().height < 30, dot: /·\\s*$/.test(m.innerText), lines: (() => { const rg = document.createRange(); rg.selectNodeContents(m); return new Set([...rg.getClientRects()].map((q) => Math.round(q.top / 6))).size; })() }; })()");
      if (!r) continue; // seed has no planned workout today
      assert(r.place && !r.dot && r.lines === 1, `workout meta/place wrapped badly at 320: ${JSON.stringify(r)}`);
    }
  });
}

if (standalone) {
  test("layout: Change today's workout: the sheet, its steps and the Undo toast fit at every size", async () => {
    if (skipReason()) return;
    browser = browser || await launch();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const found = new Map();
    const note = (msg, at) => found.set(msg, [...(found.get(msg) || []), at]);
    for (const c of [...SIZES.map(([w, h]) => ({ w, h, dark: true, long: false })), { w: 375, h: 667, dark: false, long: true }]) {
      await browser.viewport(c.w, c.h, c.dark);
      await browser.open('train', seed({ long: c.long }));
      const at = `${c.w}${c.dark ? 'd' : 'l'}${c.long ? 'L' : ''}`;
      const btn = await browser.eval("(() => { const b = document.querySelector('[data-change]'); if (!b) return null; return { h: b.getBoundingClientRect().height, t: b.innerText.trim() }; })()");
      if (!btn) { note('no Change button on Train', at); continue; }
      if (btn.h < 44 || btn.t !== 'Change') note(`Change button is ${btn.h}px tall and reads "${btn.t}"`, at);
      const step = async (label, js) => {
        await browser.eval(js);
        await wait(450);
        // Check the sheet on its own: hide the screen behind it so its buttons don't count as overlapping the sheet's.
        const behind = (v) => browser.eval(`['main', 'nav', 'navbar'].forEach((id) => { const e = document.getElementById(id); if (e) e.style.visibility = '${v}'; })`);
        await behind('hidden');
        let probs = await browser.eval(`(${detect})(${JSON.stringify({ largeText: false })})`);
        await behind('');
        if (c.long && label === 'place') probs = probs.filter((x) => !/Downtown|Hotel/.test(x)); // a place name wider than the row is the user's own text
        if (!(await browser.eval("!!document.querySelector('dialog.sheet[open]')"))) probs.push('sheet is not open');
        for (const pr of probs) note(`${label}: ${pr}`, at);
        if (shots) await browser.screenshot(`${shots}/change-${label}-${c.w}x${c.h}-${c.dark ? 'dark' : 'light'}${c.long ? '-long' : ''}.png`);
      };
      const sh = "document.querySelector('dialog.sheet ";
      await step('sheet', "document.querySelector('[data-change]').click()");
      await step('focus', `${sh}[data-o=focus]').click()`);
      await step('length', `${sh}[data-back]').click(); ${sh}[data-o=length]').click()`);
      await step('place', `${sh}[data-back]').click(); ${sh}[data-o=place]').click()`);
      // pick a length: the sheet closes, the Undo toast appears and fits
      await browser.eval(`${sh}[data-back]').click(); ${sh}[data-o=length]').click(); ${sh}[data-v=\\"20\\"]').click()`);
      await wait(700);
      const tb = await browser.eval("(() => { const t = document.querySelector('.toast'); const b = t && t.querySelector('.toast-act'); if (!b) return null; const r = t.getBoundingClientRect(); const a = b.getBoundingClientRect(); return { inside: r.left >= 0 && r.right <= innerWidth, h: a.height, w: a.width }; })()");
      if (!tb) note('no Undo toast after a change', at);
      else {
        if (!tb.inside || tb.h < 44 || tb.w < 44) note(`Undo toast does not fit: ${JSON.stringify(tb)}`, at);
        if (shots) await browser.screenshot(`${shots}/change-toast-${c.w}x${c.h}-${c.dark ? 'dark' : 'light'}${c.long ? '-long' : ''}.png`);
        await browser.eval("document.querySelector('.toast-act').click()");
        await wait(400);
        await browser.eval("document.querySelector('[data-change]').click()");
        await wait(450);
        if (await browser.eval("!!document.querySelector('dialog.sheet [data-o=reset]')")) note('Undo did not bring back the recommended workout', at);
      }
    }
    assert(found.size === 0, `\n        ${[...found].map(([p, at]) => `${p}  [${at.join(' ')}]`).join('\n        ')}`);
  });
}

if (standalone) {
  test('layout: every Change toast message is one line, Undo is plain text, and Undo after a new location keeps earlier swaps', async () => {
    if (skipReason()) return;
    browser = browser || await launch();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const found = new Map();
    const note = (msg, at) => found.set(msg, [...(found.get(msg) || []), at]);
    const sh = "document.querySelector('dialog.sheet ";
    const names = () => browser.eval("[...document.querySelectorAll('.preview .pv-ex b')].map((b) => b.textContent).join('|')");
    const open = async () => { await browser.eval("document.querySelector('[data-change]').click()"); await wait(450); };
    const toastInfo = () => browser.eval(`(() => {
      const t = [...document.querySelectorAll('.toast')].pop(); const m = t && t.querySelector('.toast-msg'); const b = t && t.querySelector('.toast-act');
      if (!m) return null;
      const rg = document.createRange(); rg.selectNodeContents(m);
      const lines = new Set([...rg.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top / 6))).size;
      return { text: m.textContent, lines, cut: m.scrollWidth > m.clientWidth + 1, border: getComputedStyle(b).borderTopWidth, inside: t.getBoundingClientRect().left >= 0 && t.getBoundingClientRect().right <= innerWidth };
    })()`);
    // run one option, check the toast it leaves, then Undo it
    const probe = async (what, js, at, { cutOk = false } = {}) => {
      await open();
      await browser.eval(js);
      await wait(700);
      const t = await toastInfo();
      if (!t) { note(`${what}: no toast`, at); return; }
      if (t.lines !== 1) note(`${what}: toast "${t.text}" takes ${t.lines} lines`, at);
      if (t.cut && !cutOk) note(`${what}: toast "${t.text}" is cut off`, at);
      if (t.border !== '0px') note(`${what}: Undo has a ${t.border} border`, at);
      if (!t.inside) note(`${what}: toast runs off-screen`, at);
      await browser.eval("[...document.querySelectorAll('.toast-act')].pop().click()");
      await wait(500);
    };
    for (const c of [...SIZES.map(([w, h]) => ({ w, h, long: false })), { w: 320, h: 568, long: true }, { w: 440, h: 956, long: true }]) {
      await browser.viewport(c.w, c.h, true);
      await browser.open('train', seed({ long: c.long }));
      const at = `${c.w}${c.long ? 'L' : ''}`;
      await probe('new exercises', `${sh}[data-o=new]').click()`, at);
      const values = await (async () => { await open(); await browser.eval(`${sh}[data-o=focus]').click()`); await wait(450); const v = await browser.eval(`[...document.querySelectorAll('dialog.sheet [data-v]')].map((b) => b.dataset.v)`); await browser.eval(`${sh}[data-back]').click(); document.querySelector('dialog.sheet [data-close]').click()`); await wait(500); return v; })();
      const labels = await browser.eval("document.querySelector('.preview .big-title').textContent");
      if (!labels) note('no focus title', at);
      for (const v of values.filter((x) => x)) await probe(`focus ${v}`, `${sh}[data-o=focus]').click(); ${sh}[data-v=\\"${v}\\"]').click()`, at);
      for (const n of [20, 30, 60]) await probe(`${n} min`, `${sh}[data-o=length]').click(); ${sh}[data-v=\\"${n}\\"]').click()`, at);
      await probe('place', `${sh}[data-o=place]').click(); ${sh}[data-v=\\"l2\\"]').click()`, at, { cutOk: c.long });
      // swap → change location → Undo: the swapped exercises must still be showing
      const rec = await names();
      await open(); await browser.eval(`${sh}[data-o=new]').click()`); await wait(700);
      const swapped = await names();
      await browser.eval("[...document.querySelectorAll('.toast-act')].pop().click()"); await wait(300); // undo of the swap, to start clean...
      await open(); await browser.eval(`${sh}[data-o=new]').click()`); await wait(700); // ...and swap again
      if ((await names()) !== swapped) note('New exercises is not repeatable', at);
      await open(); await browser.eval(`${sh}[data-o=place]').click(); ${sh}[data-v=\\"l2\\"]').click()`); await wait(700);
      await browser.eval("[...document.querySelectorAll('.toast-act')].pop().click()"); await wait(900);
      const after = await names();
      if (after !== swapped) note(`Undo after a new location lost the swap (${after} vs ${swapped})`, at);
      if (swapped === rec) note('New exercises changed nothing in the fixture', at);
    }
    assert(found.size === 0, `\n        ${[...found].map(([p, at]) => `${p}  [${at.join(' ')}]`).join('\n        ')}`);
  });
}

if (!standalone) {
  // Inside tests/run.js the other suites replace globals (fetch, document...), so the browser run happens in its own process.
  test('layout: every screen, 320 to 440 wide, dark and light, large text (headless Chromium)', async () => {
    if (skipReason()) { console.log('      (skipped: ' + skipReason() + ')'); return; }
    if (process.argv.includes('--no-layout')) { console.log('      (skipped: --no-layout)'); return; }
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { encoding: 'utf8', timeout: 540000 });
    assert(r.status === 0, '\n' + r.stdout.split('\n').filter((l) => !l.includes('✓')).join('\n'));
  });
}

test('layout: close the browser', async () => {
  if (browser) await browser.close();
  browser = null;
});

if (standalone) {
  const { runAll } = await import('./harness.js');
  const { fail } = await runAll();
  process.exit(fail ? 1 : 0);
}
