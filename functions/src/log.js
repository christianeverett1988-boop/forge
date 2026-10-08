// The only logger the functions use. It keeps an allow-list of fields that can never carry a token or a
// health value (codes, counts, durations), and drops everything else. Tested.
const ALLOWED = new Set(['event', 'code', 'status', 'count', 'ms', 'page', 'attempt', 'appli', 'types', 'rejected', 'reason']);

export function clean(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED.has(k)) continue;
    if (typeof v === 'number' && Number.isInteger(v)) out[k] = v; // integers only: counts, codes, ms
    else if (typeof v === 'string' && /^[a-z0-9_:.\- ]{0,64}$/i.test(v) && !/^[a-f0-9]{24,}$/i.test(v)) out[k] = v; // short codes, never hex blobs
    else if (Array.isArray(v) && v.every((x) => Number.isInteger(x))) out[k] = v.slice(0, 40);
  }
  return out;
}

let sink = (line) => console.log(line);
export const setSink = (fn) => { sink = fn; };

export function log(event, fields = {}) {
  sink(JSON.stringify({ ...clean(fields), event: clean({ event }).event || 'log' }));
}
