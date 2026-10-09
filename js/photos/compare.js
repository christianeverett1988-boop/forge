// Compare two dates for one pose: side by side, or a slider wipe you drag across the picture.
// Under each: your weight trend, fat mass if the scale sent it, and the days between.
import { sheet, esc, formatDay } from '../ui.js';
import { units as getUnits } from '../state.js';
import { daysBetween } from '../weight/smoothing.js';
import { POSES, posesWith, sessionsWithPose, defaultComparePair, orderPair, poseLabel } from './core.js';
import { bodyOn, fmtKg, photoUrl } from './metrics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function openCompare({ sessions }) {
  const poses = posesWith(sessions, 2);
  sheet('Compare', (body) => {
    if (!poses.length) {
      body.innerHTML = '<p class="muted">Take the same pose on two different days to compare them.</p>';
      return;
    }
    const u = getUnits();
    let pose = poses[0];
    let pair = defaultComparePair(sessions, pose);
    let mode = 'side';
    let pos = 50; // slider position, percent

    const caption = (day, label) => {
      const b = bodyOn(day);
      return `<figcaption><b>${esc(label)} · ${esc(formatDay(day, { month: 'short', day: 'numeric', year: 'numeric' }))}</b>${b.trendKg != null ? `Trend ${fmtKg(b.trendKg, u)}` : 'No weigh-in yet'}${b.fatKg != null ? `<br>Fat mass ${fmtKg(b.fatKg, u)}` : ''}</figcaption>`;
    };
    const photoOf = (day) => sessionsWithPose(sessions, pose).find((s) => s.day === day).poses[pose];

    const draw = () => {
      const list = sessionsWithPose(sessions, pose);
      const opts = (sel) => list.map((s) => `<option value="${s.day}" ${s.day === sel ? 'selected' : ''}>${esc(formatDay(s.day, { month: 'short', day: 'numeric', year: 'numeric' }))}</option>`).join('');
      const days = daysBetween(pair.before, pair.after);
      const a = photoOf(pair.before);
      const b = photoOf(pair.after);
      body.innerHTML = `<div class="stack">
        <div class="seg" role="radiogroup" aria-label="Pose" data-thumb>${POSES.filter((p) => poses.includes(p.key)).map((p) => `<label><input type="radio" name="pose" value="${p.key}" ${p.key === pose ? 'checked' : ''}><span>${p.label}</span></label>`).join('')}</div>
        <div class="cp-select">
          <label class="field"><span>Before</span><select name="before">${opts(pair.before)}</select></label>
          <label class="field"><span>After</span><select name="after">${opts(pair.after)}</select></label>
        </div>
        <div class="seg" role="radiogroup" aria-label="View" data-thumb>
          <label><input type="radio" name="mode" value="side" ${mode === 'side' ? 'checked' : ''}><span>Side by side</span></label>
          <label><input type="radio" name="mode" value="slide" ${mode === 'slide' ? 'checked' : ''}><span>Slider</span></label>
        </div>
        ${mode === 'side'
    ? `<div class="cp-pair"><figure><img src="${photoUrl(a)}" alt="${poseLabel(pose)}, before">${caption(pair.before, 'Before')}</figure><figure><img src="${photoUrl(b)}" alt="${poseLabel(pose)}, after">${caption(pair.after, 'After')}</figure></div>`
    : `<div class="cp-stage" data-stage role="slider" tabindex="0" aria-label="Drag to compare before and after" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pos)}" style="--cp:${pos}%">
            <img src="${photoUrl(b)}" alt="${poseLabel(pose)}, after"><div class="cp-top"><img src="${photoUrl(a)}" alt="${poseLabel(pose)}, before"></div>
            <i class="cp-handle"></i><span class="cp-tag l">Before</span><span class="cp-tag r">After</span></div>
          <div class="cp-pair"><figure>${caption(pair.before, 'Before')}</figure><figure>${caption(pair.after, 'After')}</figure></div>`}
        <p class="cp-days">${days === 0 ? 'Same day' : `${days} ${days === 1 ? 'day' : 'days'} between`}</p>
      </div>`;
      bind();
    };

    const bind = () => {
      body.querySelectorAll('[name=pose]').forEach((r) => r.addEventListener('change', () => { pose = r.value; pair = defaultComparePair(sessions, pose); draw(); }));
      body.querySelectorAll('[name=mode]').forEach((r) => r.addEventListener('change', () => { mode = r.value; draw(); }));
      const pick = () => {
        pair = orderPair(body.querySelector('[name=before]').value, body.querySelector('[name=after]').value);
        draw();
      };
      body.querySelectorAll('[name=before],[name=after]').forEach((s) => s.addEventListener('change', pick));
      const stage = body.querySelector('[data-stage]');
      if (!stage) return;
      const set = (p) => {
        pos = clamp(p, 0, 100);
        stage.style.setProperty('--cp', `${pos}%`);
        stage.setAttribute('aria-valuenow', String(Math.round(pos)));
      };
      const fromEvent = (e) => {
        const r = stage.getBoundingClientRect();
        set(((e.clientX - r.left) / r.width) * 100);
      };
      stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); fromEvent(e); });
      stage.addEventListener('pointermove', (e) => { if (stage.hasPointerCapture(e.pointerId)) fromEvent(e); });
      stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); set(pos - 5); }
        if (e.key === 'ArrowRight') { e.preventDefault(); set(pos + 5); }
      });
    };
    draw();
  });
}
