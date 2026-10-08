// Animated silhouette demo, drawn in code (SVG). A jointed side-view figure with rounded segments, a subtle
// volt rim light, and the working muscles glowing ember at the hardest point of each rep.
// Pure code and data: offline, no downloads. Templates live in js/ui/poses.js.
import { TEMPLATES, EXERCISE_TEMPLATES } from './poses.js';
import { onFrame, reducedMotion } from './motion.js';

const L = { shin: 42, thigh: 44, torso: 54, neck: 7, head: 11, upper: 30, fore: 27, foot: 15 };
const W = { shin: 15, thigh: 21, torso: 30, upper: 13, fore: 11, foot: 8 };
const BODY = '#3a424d';
const NEAR = '#4b5562';
const FAR = '#272d35';
const RIM = '#c6ff3d';

// Which drawn segment each muscle lights up.
const MUSCLE_SEG = {
  quads: 'thigh', hamstrings: 'thigh', adductors: 'thigh', abductors: 'glute', glutes: 'glute', calves: 'shin',
  biceps: 'upper', triceps: 'upper', forearms: 'fore', front_delts: 'delt', side_delts: 'delt', rear_delts: 'delt',
  chest: 'torso', lats: 'torso', upper_back: 'torso', traps: 'torso', lower_back: 'torso', abs: 'torso', obliques: 'torso',
};

const rad = (d) => (d * Math.PI) / 180;
const step = (p, ang, len) => [p[0] + Math.sin(rad(ang)) * len, p[1] + Math.cos(rad(ang)) * len];
const EASE = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
const lerp = (a, b, t) => a + (b - a) * t;

export const hasFigure = (exerciseId) => !!EXERCISE_TEMPLATES[exerciseId];

function solve(pose) {
  const j = {};
  if (pose.root === 'hang') {
    j.hand = pose.at;
    j.elbow = step(j.hand, pose.fore, L.fore);
    j.shoulder = step(j.elbow, pose.upper, L.upper);
    j.hip = step(j.shoulder, pose.torso, L.torso);
    j.head = step(j.shoulder, pose.torso + 180, L.neck + L.head);
    j.knee = step(j.hip, pose.thigh, L.thigh);
    j.ankle = step(j.knee, pose.shin, L.shin);
    j.toe = step(j.ankle, pose.foot ?? 90, L.foot);
  } else {
    j.ankle = pose.at;
    j.toe = step(j.ankle, 90, L.foot);
    j.knee = step(j.ankle, pose.shin, L.shin);
    j.hip = step(j.knee, pose.thigh, L.thigh);
    j.shoulder = step(j.hip, pose.torso, L.torso);
    j.head = step(j.shoulder, pose.torso, L.neck + L.head);
    j.elbow = step(j.shoulder, pose.upper, L.upper);
    j.hand = step(j.elbow, pose.fore, L.fore);
  }
  return j;
}

function blend(a, b, t) {
  const o = { ...a };
  for (const k of ['shin', 'thigh', 'torso', 'upper', 'fore', 'foot']) if (k in a && k in b) o[k] = lerp(a[k], b[k], t);
  return o;
}

/** Muscle → segment intensity (primary 1, secondary 0.45), from the exercise's own muscle data. */
export function litSegments(ex) {
  const lit = {};
  for (const m of ex.primary || []) if (MUSCLE_SEG[m]) lit[MUSCLE_SEG[m]] = Math.max(lit[MUSCLE_SEG[m]] || 0, 1);
  for (const m of ex.secondary || []) if (MUSCLE_SEG[m]) lit[MUSCLE_SEG[m]] = Math.max(lit[MUSCLE_SEG[m]] || 0, 0.45);
  return lit;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
function line(parent, w, stroke, extra = {}) {
  return el('line', { 'stroke-width': w, stroke, 'stroke-linecap': 'round', ...extra }, parent);
}
const setLine = (n, p, q) => {
  n.setAttribute('x1', p[0].toFixed(1));
  n.setAttribute('y1', p[1].toFixed(1));
  n.setAttribute('x2', q[0].toFixed(1));
  n.setAttribute('y2', q[1].toFixed(1));
};

/**
 * Mount an animated figure for an exercise into `container`. Returns { stop, setPaused } or null if the
 * exercise has no template. Stops by itself when the container leaves the page.
 */
export function mountFigure(container, ex, { isPaused = () => false } = {}) {
  const tpl = TEMPLATES[EXERCISE_TEMPLATES[ex.id]];
  if (!tpl) return null;
  const lit = litSegments(ex);
  const svg = el('svg', { viewBox: '0 0 200 210', class: 'figure', role: 'img', 'aria-label': `${ex.name} demo` });
  if (tpl.a.root !== 'hang') el('line', { x1: 10, y1: 204, x2: 190, y2: 204, stroke: '#2a3038', 'stroke-width': 2 }, svg);

  const parts = ['upper', 'fore', 'thigh', 'shin', 'foot'];
  // Layers: rim light, far limbs, torso, lit torso, glute glow, head, near limbs, lit near limbs, delt glow, props.
  const rim = el('g', { stroke: RIM, opacity: '.22', transform: 'translate(-1.5,-1.5)' }, svg);
  const rimL = Object.fromEntries(parts.map((n) => [n, line(rim, W[n] + 2, RIM)]));
  const rimT = line(rim, W.torso + 2, RIM);
  const rimH = el('circle', { r: L.head + 1, fill: RIM, stroke: 'none' }, rim);
  const far = el('g', { transform: 'translate(-3,-1)' }, svg);
  const farL = Object.fromEntries(parts.map((n) => [n, line(far, W[n], FAR)]));
  const torso = line(svg, W.torso, BODY);
  const torsoLit = line(svg, W.torso - 6, 'transparent');
  const glute = el('circle', { r: 13, fill: 'transparent' }, svg);
  const head = el('circle', { r: L.head, fill: '#454e5a' }, svg);
  const nearL = Object.fromEntries(parts.map((n) => [n, line(svg, W[n], NEAR)]));
  const litL = Object.fromEntries(parts.map((n) => [n, line(svg, W[n] - 4, 'transparent')]));
  const delt = el('circle', { r: 8, fill: 'transparent' }, svg);
  const hand = el('circle', { r: 5, fill: NEAR }, svg);
  const props = el('g', {}, svg);
  props.innerHTML = PROP_SVG[tpl.prop] || ''; // built once; only its transform changes per frame
  container.innerHTML = '';
  container.appendChild(svg);

  const glow = (w, k) => (w ? `rgba(255,${Math.round(106 + 60 * (1 - k))},43,${(Math.pow(k, 1.6) * w).toFixed(3)})` : 'transparent');

  function draw(pose, k) {
    const j = solve(pose);
    const segs = { upper: [j.shoulder, j.elbow], fore: [j.elbow, j.hand], thigh: [j.hip, j.knee], shin: [j.knee, j.ankle], foot: [j.ankle, j.toe] };
    for (const n of parts) {
      setLine(rimL[n], ...segs[n]);
      setLine(farL[n], ...segs[n]);
      setLine(nearL[n], ...segs[n]);
      setLine(litL[n], ...segs[n]);
      litL[n].setAttribute('stroke', glow(lit[n], k));
    }
    setLine(rimT, j.hip, j.shoulder);
    setLine(torso, j.hip, j.shoulder);
    setLine(torsoLit, j.hip, j.shoulder);
    torsoLit.setAttribute('stroke', glow(lit.torso, k));
    rimH.setAttribute('cx', j.head[0]);
    rimH.setAttribute('cy', j.head[1]);
    head.setAttribute('cx', j.head[0]);
    head.setAttribute('cy', j.head[1]);
    glute.setAttribute('cx', j.hip[0] - 4);
    glute.setAttribute('cy', j.hip[1]);
    glute.setAttribute('fill', glow(lit.glute, k));
    delt.setAttribute('cx', j.shoulder[0]);
    delt.setAttribute('cy', j.shoulder[1]);
    delt.setAttribute('fill', glow(lit.delt, k));
    hand.setAttribute('cx', j.hand[0]);
    hand.setAttribute('cy', j.hand[1]);
    const at = propAnchor(tpl.prop, j);
    if (at) props.setAttribute('transform', `translate(${at[0].toFixed(1)},${at[1].toFixed(1)})`);
  }

  // One rep loop through the template's phases.
  const total = tpl.phases.reduce((s, ph) => s + ph[1], 0);
  const start = performance.now();
  function poseAt(ms) {
    let t = ((ms % total) + total) % total;
    let p = 0; // 0 = pose a, 1 = pose b
    let cur = 0;
    for (const ph of tpl.phases) {
      const [to, dur, easing] = ph;
      if (t <= dur) {
        if (to === 'hold') return cur;
        const target = to === 'b' ? 1 : 0;
        return lerp(cur, target, EASE[easing || 'inOut'](t / dur));
      }
      t -= dur;
      if (to !== 'hold') cur = to === 'b' ? 1 : 0;
      p = cur;
    }
    return p;
  }

  if (reducedMotion()) {
    draw(blend(tpl.a, tpl.b, 1), 1); // static: the hardest point, muscles lit
    return { stop() {}, setPaused() {} };
  }

  // Paused or resting: hold the current frame and let the loop sleep. Every way out of a pause or a rest
  // re-renders the screen, which mounts a fresh figure.
  let stopped = false;
  draw(tpl.a, 0);
  onFrame((now) => {
    if (stopped || !svg.isConnected || isPaused()) return false;
    const p = poseAt(now - start);
    draw(blend(tpl.a, tpl.b, p), p);
    return true;
  });
  return {
    stop() { stopped = true; },
  };
}

// Props are drawn once around (0,0) and moved with a transform each frame.
const PROP_SVG = {
  barbell: '<line x1="-36" y1="3" x2="36" y2="3" stroke="#9aa4b0" stroke-width="4" stroke-linecap="round"/><rect x="-46" y="-15" width="9" height="36" rx="3" fill="#6b7480"/><rect x="37" y="-15" width="9" height="36" rx="3" fill="#6b7480"/>',
  dumbbell: '<rect x="-13" y="-3" width="26" height="6" rx="3" fill="#9aa4b0"/><rect x="-17" y="-8" width="8" height="16" rx="3" fill="#6b7480"/><rect x="9" y="-8" width="8" height="16" rx="3" fill="#6b7480"/>',
  bar: '<line x1="14" y1="0" x2="186" y2="0" stroke="#9aa4b0" stroke-width="5" stroke-linecap="round"/>',
};
function propAnchor(prop, j) {
  if (prop === 'barbell') return j.shoulder;
  if (prop === 'dumbbell') return j.hand;
  if (prop === 'bar') return [0, j.hand[1] - 3];
  return null;
}
