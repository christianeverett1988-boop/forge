import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]));
let bad = 0;
for (const f of walk('js').filter((x) => x.endsWith('.js'))) {
  try { execFileSync('node', ['--check', f], { stdio: 'pipe' }); } catch (e) { bad++; console.log('SYNTAX', f, String(e.stderr).split('\n').slice(0, 4).join(' | ')); }
}
console.log('checked, bad =', bad);
