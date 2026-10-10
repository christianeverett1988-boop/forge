// A small PDF writer for the doctor summary in the iPhone app (WKWebView can't print). US Letter, Helvetica, black on
// white like the printed web page: title block, boxed sections with label/value rows, the weight trend as a vector
// line, and a page footer. It is drawn from reportModel() (the same data as the on-screen page), needs no library,
// and a section box is never split across pages.
import { reportModel, weightChartData } from './clinicalview.js';

const W = 612;
const H = 792;
const MARGIN = 54;
const BOTTOM = 60; // keeps clear of the footer
const BOXW = W - 2 * MARGIN;
const PAD = 10;
const INNER = BOXW - 2 * PAD;
const GAP = 8;
// Widths (per 1000 em) for Helvetica 32..126; anything else counts as 556. Close enough to wrap and right-align safely.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// Characters outside plain ASCII that the WinAnsi font shows, by code.
const CP1252 = { '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '…': 0x85 };

/** Turn text into characters the PDF's WinAnsi font can show. Anything it can't show (emoji, CJK) is dropped. */
export function pdfSafe(s) {
  return String(s).replace(/→/g, 'to').replace(/′/g, "'").replace(/″/g, '"').replace(/−/g, '–')
    .replace(/₂/g, '2').replace(/[   ]/g, ' ')
    .replace(/[^ -~¡-ÿ‘’“”•–—…\n]/g, '');
}
const width = (t, size, bold = false) => [...t].reduce((n, ch) => {
  const c = ch.charCodeAt(0);
  const w = c >= 32 && c <= 126 ? HELV[c - 32] : 556;
  return n + (bold && !(c >= 48 && c <= 57) ? w * 1.07 : w);
}, 0) * size / 1000;
const esc = (t) => [...t].map((ch) => {
  const code = CP1252[ch] ?? ch.charCodeAt(0);
  if (ch === '(' || ch === ')' || ch === '\\') return `\\${ch}`;
  return code < 32 || code > 126 ? `\\${code.toString(8).padStart(3, '0')}` : String.fromCharCode(code);
}).join('');

function wrap(text, size, max, bold = false) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next, size, bold) > max) { out.push(line); line = word; } else line = next;
  }
  out.push(line);
  return out;
}

const GREY = 0.38;
const f2 = (n) => n.toFixed(2);

/** Drawing helpers for one page's content stream. `emit` is null while only measuring. */
function pen(emit) {
  const o = (s) => { if (emit) emit(s); };
  return {
    text(t, x, y, size, { bold = false, grey = 0, right = false } = {}) {
      const s = pdfSafe(t);
      const px = right ? x - width(s, size, bold) : x;
      o(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${f2(grey)} g ${f2(px)} ${f2(y)} Td (${esc(s)}) Tj ET`);
    },
    line(x1, y1, x2, y2, w = 0.5, grey = 0) { o(`${f2(grey)} G ${w} w ${f2(x1)} ${f2(y1)} m ${f2(x2)} ${f2(y2)} l S`); },
    rect(x, y, w, h, lw = 0.75) { o(`0 G ${lw} w ${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)} re S`); },
    poly(pts, w = 1.2) { if (pts.length) o(`0 G ${w} w 1 j 1 J ${pts.map((p, i) => `${f2(p[0])} ${f2(p[1])} ${i ? 'l' : 'm'}`).join(' ')} S`); },
  };
}

const ROW_VALUE_MAX = 330;

/** Lay out one section box from `top` down. Returns its height; draws when `emit` is given. */
function section(m, units, top, emit) {
  const p = pen(emit);
  let c = top - PAD;
  const left = MARGIN + PAD;
  const right = MARGIN + BOXW - PAD;
  p.text(m.title, left, c - 11, 12.5, { bold: true });
  c -= 20;
  m.rows.forEach((r) => {
    const vl = wrap(pdfSafe(r.value), 10.5, ROW_VALUE_MAX, true);
    const nl = r.note ? wrap(pdfSafe(r.note), 8.5, ROW_VALUE_MAX) : [];
    p.line(left, c, right, c, 0.4, 0.8);
    p.text(r.label, left, c - 13, 10.5);
    vl.forEach((l, k) => p.text(l, right, c - 13 - k * 13, 10.5, { bold: true, right: true }));
    nl.forEach((l, k) => p.text(l, right, c - 13 - (vl.length - 1) * 13 - 10.5 - k * 10, 8.5, { grey: GREY, right: true }));
    c -= 3 + 13 * vl.length + (nl.length ? 0.5 + 10 * nl.length : 0) + 3;
  });
  if (m.bullets) {
    p.line(left, c, right, c, 0.4, 0.8);
    c -= 5;
    m.bullets.forEach((b) => {
      const ls = wrap(pdfSafe(b), 10, INNER - 12);
      p.text('•', left, c - 10, 10);
      ls.forEach((l, k) => p.text(l, left + 12, c - 10 - k * 13, 10));
      c -= 13 * ls.length + 3;
    });
    c -= 3;
  }
  const chart = m.chart ? weightChartData(m.chart, units) : null;
  if (chart) {
    const x0 = left + 62;
    const x1 = right - 4;
    const yT = c - 10;
    const yB = yT - 64;
    p.line(x0, yT, x1, yT, 0.4, 0.75);
    p.line(x0, yB, x1, yB, 0.4, 0.75);
    p.text(chart.maxLabel, x0 - 5, yT - 3, 8, { right: true, grey: GREY });
    p.text(chart.minLabel, x0 - 5, yB - 3, 8, { right: true, grey: GREY });
    p.text(chart.fromLabel, x0, yB - 13, 8, { grey: GREY });
    p.text(chart.toLabel, x1, yB - 13, 8, { right: true, grey: GREY });
    p.poly(chart.pts.map((q) => [x0 + q.x * (x1 - x0), yB + q.y * (yT - yB)]));
    c = yB - 20;
  }
  m.explain.forEach((t) => {
    const ls = wrap(pdfSafe(t), 8.5, INNER);
    c -= 4;
    ls.forEach((l, k) => p.text(l, left, c - 9 - k * 11, 8.5, { grey: GREY }));
    c -= 11 * ls.length;
  });
  c -= 4;
  const h = top - c + PAD - 4 + 4;
  p.rect(MARGIN, top - h, BOXW, h);
  return h;
}

/** The title block: heading, dates, generated date, who, and the source line. */
function head(m, top, emit) {
  const p = pen(emit);
  let c = top;
  p.text(m.title, MARGIN, c - 18, 20, { bold: true });
  c -= 30;
  p.text(m.dates, MARGIN, c - 12, 12.5, { bold: true });
  p.text(` (${m.rangeLabel})`, MARGIN + width(pdfSafe(m.dates), 12.5, true), c - 12, 12.5);
  c -= 20;
  p.text(m.generated, MARGIN, c - 10, 10, { grey: GREY });
  c -= 14;
  if (m.who) { p.text(m.who, MARGIN, c - 10, 10.5); c -= 15; }
  wrap(pdfSafe(m.source), 9.5, BOXW).forEach((l) => { p.text(l, MARGIN, c - 9, 9.5, { grey: GREY }); c -= 12.5; });
  return top - c + 4;
}

/** `s` is buildSummary()'s result. Returns a Blob (application/pdf). */
export function summaryPdf(s, units, generated) {
  const m = reportModel(s, units, generated);
  const pages = [[]];
  let y = H - MARGIN;
  const place = (measure, draw) => {
    const h = measure(y);
    if (y - h < BOTTOM && y < H - MARGIN) { pages.push([]); y = H - MARGIN; }
    const cmds = pages[pages.length - 1];
    draw(y, (c) => cmds.push(c));
    y -= h + GAP;
  };
  place((t) => head(m, t, null), (t, emit) => head(m, t, emit));
  m.sections.forEach((sec) => place((t) => section(sec, units, t, null), (t, emit) => section(sec, units, t, emit)));
  const footer = (n) => {
    const t = `Forge health summary · Page ${n} of ${pages.length} · Not a medical record`;
    const out = [];
    pen((c) => out.push(c)).text(t, (W - width(pdfSafe(t), 8)) / 2, 32, 8, { grey: GREY });
    return out;
  };
  pages.forEach((cmds, i) => cmds.push(...footer(i + 1)));

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
