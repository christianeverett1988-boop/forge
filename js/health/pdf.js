// A small PDF writer for the doctor summary in the iPhone app (WKWebView can't print). US Letter, Helvetica,
// plain black on white like the printed web page: title, then each section heading in bold with its lines wrapped.
// Text only, so it is tiny and needs no library. Input is the same text as "Share as text" (summaryText).

const W = 612;
const H = 792;
const MARGIN = 54;
const SIZE = 10.5;
const LEAD = 15;
// Widths (per 1000 em) for Helvetica 32..126; anything else counts as 556. Close enough to wrap lines safely.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// Characters outside plain ASCII that the WinAnsi font shows, by code.
const CP1252 = { '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '…': 0x85 };

/** Turn text into characters the PDF's WinAnsi font can show ("→" becomes "to"). */
export function pdfSafe(s) {
  return String(s).replace(/→/g, 'to').replace(/−/g, '-').replace(/[  ]/g, ' ')
    .replace(/[^ -~¡-ÿ‘’“”•–—…\n]/g, '?');
}
const width = (t, size) => [...t].reduce((n, ch) => { const c = ch.charCodeAt(0); return n + (c >= 32 && c <= 126 ? HELV[c - 32] : 556); }, 0) * size / 1000;
const esc = (t) => [...t].map((ch) => {
  const code = CP1252[ch] ?? ch.charCodeAt(0);
  if (ch === '(' || ch === ')' || ch === '\\') return `\\${ch}`;
  return code < 32 || code > 126 ? `\\${code.toString(8).padStart(3, '0')}` : String.fromCharCode(code);
}).join('');

function wrap(text, size, max) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next, size) > max) { out.push(line); line = word; } else line = next;
  }
  out.push(line);
  return out;
}

/** `text` is summaryText(); returns a Blob (application/pdf). The first line is the title; ALL-CAPS lines are headings. */
export function summaryPdf(text) {
  const pages = [[]];
  let y = H - MARGIN;
  const put = (t, font, size, gap = LEAD) => {
    if (y - gap < MARGIN) { pages.push([]); y = H - MARGIN; }
    y -= gap;
    pages[pages.length - 1].push(`BT /${font} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${esc(t)}) Tj ET`);
  };
  pdfSafe(text).split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line) { y -= 6; return; }
    if (i === 0) { for (const l of wrap(line, 15, W - 2 * MARGIN)) put(l, 'F2', 15, 22); return; }
    if (/^[A-Z0-9 ,&/-]{4,}$/.test(line)) { y -= 6; put(line, 'F2', 11.5, 18); return; }
    for (const l of wrap(line, SIZE, W - 2 * MARGIN)) put(l, 'F1', SIZE);
  });
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const kids = [];
  pages.forEach((cmds) => {
    const stream = cmds.join('\n');
    const content = objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(`${objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`)} 0 R`);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => { at.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}
