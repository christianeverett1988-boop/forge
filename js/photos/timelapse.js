// Time-lapse: one pose over a range of dates, drawn frame by frame on a canvas with the date and your weight
// trend. Where the browser can record video from a canvas (MP4 on newer Safari, WebM elsewhere) you get a
// short video; otherwise a photo strip (a JPEG grid), which works everywhere. All on this phone.
import { sheet, esc, formatDay } from '../ui.js';
import { icon } from '../ui/icons.js';
import { units as getUnits } from '../state.js';
import { POSES, posesWith, sessionsWithPose, timelapseFrames, sampleFrames, gridLayout, pickRecorderType, poseLabel } from './core.js';
import { bodyOn, fmtKg } from './metrics.js';
import { canvasBlob } from './image.js';
import { deliverSheet } from './deliver.js';

const W = 720;
const H = 960;
const HOLD_MS = 650;
const LAST_HOLD_MS = 1500;
const STRIP_MAX = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The caption for a frame: "Oct 4, 2026 · 182.4 lb". */
const captionFor = (day, u) => {
  const b = bodyOn(day);
  return `${formatDay(day, { month: 'short', day: 'numeric', year: 'numeric' })}${b.trendKg != null ? ` · ${fmtKg(b.trendKg, u)}` : ''}`;
};

/** Draws a photo to fill the box (centre-cropped) with a caption strip at the bottom. */
function drawCell(ctx, img, x, y, w, h, text) {
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  const bar = Math.round(h * 0.085);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x, y + h - bar, w, bar);
  ctx.fillStyle = 'white';
  ctx.font = `600 ${Math.round(bar * 0.5)}px -apple-system, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h - bar / 2, w - 16);
  ctx.restore();
}

const load = (photo) => createImageBitmap(photo.blob);

async function makeVideo(frames, type, u, onProgress) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 4000000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start();
  for (let i = 0; i < frames.length; i++) {
    const img = await load(frames[i].photo);
    const text = captionFor(frames[i].day, u);
    const until = Date.now() + (i === frames.length - 1 ? LAST_HOLD_MS : HOLD_MS);
    do { // redraw while holding so the recorder keeps getting frames
      drawCell(ctx, img, 0, 0, W, H, text);
      await sleep(80);
    } while (Date.now() < until);
    if (img.close) img.close();
    onProgress(i + 1, frames.length);
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return { blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext };
}

async function makeStrip(frames, u, onProgress) {
  const used = sampleFrames(frames, STRIP_MAX);
  const { cols, rows } = gridLayout(used.length);
  const cw = 360;
  const ch = 480;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < used.length; i++) {
    const img = await load(used[i].photo);
    drawCell(ctx, img, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, captionFor(used[i].day, u));
    if (img.close) img.close();
    onProgress(i + 1, used.length);
  }
  return { blob: await canvasBlob(canvas), ext: 'jpg' };
}

export function openTimelapse({ sessions }) {
  const poses = posesWith(sessions, 2);
  sheet('Time-lapse', (body, close) => {
    if (!poses.length) {
      body.innerHTML = '<p class="muted">Take the same pose on two different days to make a time-lapse.</p>';
      return;
    }
    const u = getUnits();
    const type = typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream ? pickRecorderType((t) => MediaRecorder.isTypeSupported(t)) : null;
    let pose = poses[0];
    let from = '';
    let to = '';
    const draw = () => {
      const list = sessionsWithPose(sessions, pose);
      from = from && list.some((s) => s.day === from) ? from : list[0].day;
      to = to && list.some((s) => s.day === to) ? to : list[list.length - 1].day;
      const opts = (sel) => list.map((s) => `<option value="${s.day}" ${s.day === sel ? 'selected' : ''}>${esc(formatDay(s.day, { month: 'short', day: 'numeric', year: 'numeric' }))}</option>`).join('');
      const n = timelapseFrames(sessions, pose, { from, to }).length;
      body.innerHTML = `<div class="stack">
        <div class="seg" role="radiogroup" aria-label="Pose" data-thumb>${POSES.filter((p) => poses.includes(p.key)).map((p) => `<label><input type="radio" name="pose" value="${p.key}" ${p.key === pose ? 'checked' : ''}><span>${p.label}</span></label>`).join('')}</div>
        <div class="cp-select">
          <label class="field"><span>From</span><select name="from">${opts(from)}</select></label>
          <label class="field"><span>To</span><select name="to">${opts(to)}</select></label>
        </div>
        <p class="small muted">${n} ${poseLabel(pose).toLowerCase()} ${n === 1 ? 'photo' : 'photos'}, each with its date and weight trend. ${type ? `Makes a short ${type.ext === 'mp4' ? 'MP4' : 'WebM'} video.` : 'This browser can’t record video, so you’ll get a photo strip instead.'}</p>
        <div class="tl-progress" hidden><i></i></div>
        <p class="error" aria-live="polite" data-err></p>
        <button class="btn primary" data-make ${n < 2 ? 'disabled' : ''}>${icon('play')}${type ? 'Make time-lapse' : 'Make photo strip'}</button></div>`;
      body.querySelectorAll('[name=pose]').forEach((r) => r.addEventListener('change', () => { pose = r.value; from = ''; to = ''; draw(); }));
      body.querySelector('[name=from]').addEventListener('change', (e) => { from = e.target.value; if (from > to) to = from; draw(); });
      body.querySelector('[name=to]').addEventListener('change', (e) => { to = e.target.value; if (to < from) from = to; draw(); });
      body.querySelector('[data-make]').addEventListener('click', build);
    };
    const build = async (e) => {
      const btn = e.currentTarget;
      const frames = timelapseFrames(sessions, pose, { from, to });
      const bar = body.querySelector('.tl-progress');
      const fill = bar.querySelector('i');
      bar.hidden = false;
      btn.disabled = true;
      btn.textContent = 'Working…';
      const onProgress = (i, n) => { fill.style.width = `${Math.round((i / n) * 100)}%`; btn.textContent = `Working… ${i} of ${n}`; };
      try {
        let out = null;
        if (type) {
          try { out = await makeVideo(frames, type, u, onProgress); } catch { out = null; }
          if (out && out.blob.size < 1000) out = null; // empty recording: use the strip instead
        }
        if (!out) out = await makeStrip(frames, u, onProgress);
        const isVideo = out.ext !== 'jpg';
        const url = URL.createObjectURL(out.blob);
        close();
        deliverSheet({
          title: isVideo ? 'Your time-lapse' : 'Your photo strip',
          blob: out.blob,
          name: `forge-${pose}-${frames[0].day}-to-${frames[frames.length - 1].day}.${out.ext}`,
          preview: isVideo ? `<video src="${url}" controls playsinline loop muted></video>` : `<img src="${url}" alt="Photo strip of ${poseLabel(pose).toLowerCase()} photos">`,
          note: isVideo ? '' : 'Your browser can’t make a video, so this is a strip of all your photos in order.',
        });
      } catch (err) {
        body.querySelector('[data-err]').textContent = 'Couldn’t make that. Try fewer photos.';
        btn.disabled = false;
        btn.textContent = 'Try again';
        void err;
      }
    };
    draw();
  });
}
