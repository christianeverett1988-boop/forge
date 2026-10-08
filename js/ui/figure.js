// Animated silhouette demo, drawn in code (SVG): a jointed figure in a 3/4 view with tapered limbs,
// rib cage, pelvis, neck, hands and feet, a ground shadow, a rim light on the back edges, and the working
// muscles glowing (muscle-shaped, opacity only) at the hardest point of each rep.
//
// Every node is built once. Each frame only updates `transform` matrices (one <g> per body segment and
// prop) and, when it changes, the depth order of those groups; at most 30 times a second, and the loop
// sleeps while the workout is paused or resting. The view box is fitted to the whole rep at mount.
// Pure code and data: offline, no downloads. Templates: js/ui/poses.js. Skeleton and camera: js/ui/rig.js.
import { TEMPLATES, EXERCISE_TEMPLATES } from './poses.js';
import { BODY, BODY_PARTS, solve, camera, boneMatrix, repPhases, progressAt, paramsAt, propParts, drawOrder, frameBox } from './rig.js';
import { onFrame, reducedMotion } from './motion.js';

export const hasFigure = (exerciseId) => !!EXERCISE_TEMPLATES[exerciseId];

// ---------- muscles ----------
// Where each muscle glows: the segment it lives on and its shape in that segment's local frame
// (u = fraction along the bone, v = fraction of the half-width with + at the front, length, width).
const M = {
  quads: [['thigh', 0.52, 0.42, 0.66, 0.62]],
  hamstrings: [['thigh', 0.5, -0.45, 0.6, 0.55]],
  adductors: [['thigh', 0.32, 0.05, 0.4, 0.42]],
  glutes: [['pelvis']],
  calves: [['shin', 0.32, -0.42, 0.42, 0.62]],
  biceps: [['upper', 0.56, 0.45, 0.6, 0.62]],
  triceps: [['upper', 0.52, -0.45, 0.66, 0.6]],
  forearms: [['fore', 0.3, 0.2, 0.48, 0.75]],
  front_delts: [['upper', 0.12, 0.45, 0.26, 0.62]],
  side_delts: [['upper', 0.1, 0, 0.26, 0.66]],
  rear_delts: [['upper', 0.12, -0.45, 0.26, 0.62]],
  chest: [['torso', 'chest']],
  lats: [['torso', 'lats']],
  upper_back: [['torso', 'upper_back']],
  traps: [['torso', 'traps']],
  lower_back: [['torso', 'lower_back']],
  abs: [['torso', 'abs']],
  obliques: [['torso', 'obliques']],
};
/** Muscle → glow strength (primary 1, secondary 0.45), from the exercise's own muscle data. */
export function muscleGlow(ex) {
  const out = {};
  for (const m of ex.secondary || []) if (M[m]) out[m] = 0.45;
  for (const m of ex.primary || []) if (M[m]) out[m] = 1;
  return out;
}

// ---------- shapes ----------
const f1 = (x) => (Math.round(x * 10) / 10).toString();
/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(pts, closed = true) {
  const n = pts.length;
  const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/**
 * A tapered limb along +x from 0 to L px: radius r0 → r1 with a front and a back muscle bulge
 * ([where, how much px]) and rounded ends. Returns { body, rim } (rim = the back edge only).
 */
function limb(L, r0, r1, front = [0.4, 0], back = [0.4, 0]) {
  const r = (u) => r0 + (r1 - r0) * u;
  const edge = (side, [at, amt]) => [0.04, 0.2, at, 0.62 + at * 0.3, 0.96].map((u) => {
    const bump = amt * Math.exp(-Math.pow((u - at) / 0.26, 2));
    return [u * L, side * (r(u) + bump)];
  });
  const backPts = edge(-1, back);
  const frontPts = edge(1, front).reverse();
  const cap = (cx, rr, from) => [1, 2, 3, 4, 5].map((k) => {
    const a = from + (Math.PI * k) / 6;
    return [cx + Math.cos(a) * rr, Math.sin(a) * rr];
  });
  const pts = [...backPts, ...cap(L, r1 * 0.98, -Math.PI / 2), ...frontPts, ...cap(0, r0 * 0.98, Math.PI / 2)];
  return { body: smooth(pts), rim: smooth(backPts.slice(1, -1), false) };
}

/** Almond-shaped muscle belly centred at (cx, cy), length l, half-width w (px). */
function belly(cx, cy, l, w) {
  const x0 = cx - l / 2;
  const x1 = cx + l / 2;
  return `M${f1(x0)},${f1(cy)}C${f1(x0 + l * 0.28)},${f1(cy - w)} ${f1(x1 - l * 0.3)},${f1(cy - w * 0.9)} ${f1(x1)},${f1(cy)}C${f1(x1 - l * 0.3)},${f1(cy + w * 0.9)} ${f1(x0 + l * 0.28)},${f1(cy + w)} ${f1(x0)},${f1(cy)}Z`;
}

// Limbs in metres: length, start and end radius, front and back bulge [where, how much].
const LIMB = {
  thigh: { L: BODY.thigh, r0: 0.082, r1: 0.054, front: [0.42, 0.016], back: [0.36, 0.014] },
  shin: { L: BODY.shin, r0: 0.054, r1: 0.036, front: [0.3, 0.004], back: [0.28, 0.02] },
  upper: { L: BODY.upper, r0: 0.05, r1: 0.039, front: [0.55, 0.01], back: [0.45, 0.008] },
  fore: { L: BODY.fore, r0: 0.04, r1: 0.027, front: [0.25, 0.008], back: [0.25, 0.004] },
  hand: { L: BODY.hand, r0: 0.027, r1: 0.026, front: [0.5, 0.004], back: [0.5, 0.002] },
  neck: { L: BODY.neck + 0.02, r0: 0.056, r1: 0.05, front: [0.5, 0], back: [0.4, 0.006] },
};

// Torso (rib cage + abdomen) in metres along the spine from the hip centre: [u, v], + = front.
const TORSO = [
  [-0.02, 0.1], [0.12, 0.115], [0.28, 0.14], [0.41, 0.145], [0.5, 0.1], [0.565, 0.05],
  [0.58, -0.035], [0.52, -0.085], [0.44, -0.13], [0.3, -0.125], [0.16, -0.095], [0.02, -0.11],
];
const PELVIS = [[0.11, 0.1], [0.02, 0.112], [-0.07, 0.075], [-0.115, 0.0], [-0.1, -0.1], [-0.02, -0.14], [0.08, -0.115]];
const TORSO_GLOW = { // [u, v, length, half-width] in metres
  chest: [0.43, 0.095, 0.17, 0.05],
  abs: [0.17, 0.085, 0.22, 0.035],
  obliques: [0.16, 0.0, 0.2, 0.045],
  lats: [0.3, -0.075, 0.24, 0.045],
  upper_back: [0.44, -0.085, 0.13, 0.04],
  traps: [0.52, -0.05, 0.12, 0.03],
  lower_back: [0.12, -0.07, 0.16, 0.03],
};
const HEAD = [
  [0.0, 0.03], [0.035, 0.072], [0.07, 0.092], [0.105, 0.112], [0.15, 0.1], [0.205, 0.06], [0.235, -0.005],
  [0.215, -0.07], [0.16, -0.105], [0.09, -0.098], [0.035, -0.055], [0.0, -0.035],
];
const FOOT = [[0.0, 0.015], [0.015, 0.06], [0.06, 0.095], [0.12, 0.06], [0.205, 0.028], [0.225, 0.005], [0.15, -0.006], [0.03, -0.006]];

// ---------- colours ----------
// Lighter greys than the app background (#0e1116 / #15191f) so the body reads clearly; far limbs darker.
const C = {
  nearBack: '#3b444f', nearFront: '#8a96a4',
  farBack: '#232930', farFront: '#4d5662',
  torsoBack: '#3d4652', torsoFront: '#929eac',
  outline: '#0b0e12',
  rim: '#c6ff3d',
  steel: '#b9c1cb', steelDark: '#6b7480', plate: '#2b3139', plateEdge: '#5a636e',
};

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
const mtx = (m) => `matrix(${m.map((x) => (Math.round(x * 1000) / 1000).toString()).join(',')})`;

/**
 * Mount an animated figure for an exercise into `container`. Returns { stop } or null if the exercise
 * has no template. Options: isPaused() → true holds the frame and lets the loop sleep; slow → tempo days;
 * at → draw one still frame that many seconds into the rep.
 * Stops by itself when the container leaves the page.
 */
export function mountFigure(container, ex, { isPaused = () => false, slow = false, at: still = null } = {}) {
  const tpl = TEMPLATES[EXERCISE_TEMPLATES[ex.id]];
  if (!tpl) return null;
  const s = tpl.cam.scale;
  const project = camera(tpl.cam);
  const phases = repPhases(slow && tpl.slow ? tpl.slow : tpl.tempo, tpl.first);
  const glow = muscleGlow(ex);
  const id = `fig${++uid}`;
  const box = frameBox(tpl, project, phases);

  const svg = el('svg', { viewBox: box.map(f1).join(' '), class: 'figure', role: 'img', 'aria-label': `${ex.name} demo` });
  const defs = el('defs', {}, svg);
  const lin = (name, a, b) => {
    const g = el('linearGradient', { id: `${id}${name}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': a }, g);
    el('stop', { offset: 1, 'stop-color': b }, g);
  };
  lin('n', C.nearBack, C.nearFront);
  lin('f', C.farBack, C.farFront);
  lin('t', C.torsoBack, C.torsoFront);
  const rg = el('radialGradient', { id: `${id}g` }, defs);
  el('stop', { offset: 0, 'stop-color': '#ffb15e', 'stop-opacity': 1 }, rg);
  el('stop', { offset: 0.45, 'stop-color': '#ff6a2b', 'stop-opacity': 0.85 }, rg);
  el('stop', { offset: 1, 'stop-color': '#ff4d1a', 'stop-opacity': 0 }, rg);
  const sg = el('radialGradient', { id: `${id}s` }, defs);
  el('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0.6 }, sg);
  el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 }, sg);

  // Floor line across the box (not for hanging moves).
  if (tpl.rig.legs === 'ik') el('line', { x1: f1(box[0]), y1: tpl.cam.ground + 2, x2: f1(box[0] + box[2]), y2: tpl.cam.ground + 2, stroke: '#2a313a', 'stroke-width': 1.5 }, svg);

  const groups = {};
  const glows = []; // { node, weight }
  const fill = (far) => `url(#${id}${far ? 'f' : 'n'})`;
  // A thin dark outline keeps overlapping parts (arm over torso, leg over leg) readable.
  const OUT = { stroke: C.outline, 'stroke-width': 0.9, 'stroke-linejoin': 'round' };
  const rimLine = (g, d, w = 1.1, o = 0.45) => el('path', { d, fill: 'none', stroke: C.rim, 'stroke-width': w, 'stroke-linecap': 'round', opacity: o }, g);

  function addGlow(g, d, weight, far) {
    const n = el('path', { d, fill: `url(#${id}g)`, opacity: 0 }, g);
    glows.push({ node: n, weight: weight * (far ? 0.7 : 1) });
  }

  function buildLimb(name) {
    const kind = name.slice(0, -1);
    const far = name.endsWith('F');
    const g = el('g', {});
    if (kind === 'foot') {
      const pts = FOOT.map(([u, v]) => [u * s, v * s]);
      el('path', { d: smooth(pts), fill: fill(far), ...OUT }, g);
      if (!far) rimLine(g, smooth(pts.slice(0, 3), false), 1, 0.35);
      return g;
    }
    const spec = LIMB[kind];
    const k = far ? 0.92 : 1;
    const { body, rim } = limb(spec.L * s, spec.r0 * s * k, spec.r1 * s * k, [spec.front[0], spec.front[1] * s], [spec.back[0], spec.back[1] * s]);
    el('path', { d: body, fill: fill(far), ...OUT }, g);
    if (kind === 'hand') {
      const x = spec.L * s * 0.55;
      el('path', { d: `M${f1(x)},${f1(-spec.r0 * s * 0.6)}L${f1(x)},${f1(spec.r0 * s * 0.6)}`, stroke: C.outline, 'stroke-width': 0.8, fill: 'none', opacity: 0.6 }, g);
    }
    if (!far) rimLine(g, rim);
    for (const [m, w] of Object.entries(glow)) {
      for (const shape of M[m]) {
        if (shape[0] !== kind) continue;
        const [, u, v, l, wd] = shape;
        const r = (spec.r0 + (spec.r1 - spec.r0) * u) * s * k;
        addGlow(g, belly(u * spec.L * s, v * r, l * spec.L * s, wd * r), w, far);
      }
    }
    return g;
  }

  function buildTorso() {
    const g = el('g', {});
    const k = 1.08;
    const pts = TORSO.map(([u, v]) => [u * s, v * s * k]);
    el('path', { d: smooth(pts), fill: `url(#${id}t)`, ...OUT }, g);
    rimLine(g, smooth(pts.slice(6, 12), false), 1.2);
    el('path', { d: `M${f1(0.31 * s)},${f1(0.135 * s * k)}Q${f1(0.36 * s)},${f1(0.07 * s)} ${f1(0.47 * s)},${f1(0.09 * s)}`, fill: 'none', stroke: C.outline, 'stroke-width': 0.9, opacity: 0.35 }, g);
    for (const [m, w] of Object.entries(glow)) {
      for (const shape of M[m]) {
        if (shape[0] !== 'torso') continue;
        const [u, v, l, wd] = TORSO_GLOW[shape[1]];
        addGlow(g, belly(u * s, v * s * k, l * s, wd * s), w, false);
      }
    }
    return g;
  }

  function buildPelvis() {
    const g = el('g', {});
    const pts = PELVIS.map(([u, v]) => [u * s, v * s]);
    el('path', { d: smooth(pts), fill: `url(#${id}t)`, ...OUT }, g);
    rimLine(g, smooth(pts.slice(3, 7), false), 1.1, 0.4);
    if (glow.glutes) addGlow(g, belly(-0.03 * s, -0.08 * s, 0.21 * s, 0.075 * s), glow.glutes, false);
    return g;
  }

  function buildHead() {
    const g = el('g', {});
    const pts = HEAD.map(([u, v]) => [u * s, v * s]);
    el('path', { d: smooth(pts), fill: `url(#${id}t)`, ...OUT }, g);
    rimLine(g, smooth(pts.slice(6, 11), false), 1.2, 0.5);
    el('ellipse', { cx: 0.12 * s, cy: -0.02 * s, rx: 0.025 * s, ry: 0.018 * s, fill: '#4a535e' }, g); // ear
    return g;
  }

  function buildNeck() {
    const g = el('g', {});
    const { body } = limb(LIMB.neck.L * s, LIMB.neck.r0 * s, LIMB.neck.r1 * s, LIMB.neck.front, [LIMB.neck.back[0], LIMB.neck.back[1] * s]);
    el('path', { d: body, fill: `url(#${id}t)`, ...OUT }, g);
    if (glow.traps) addGlow(g, belly(0.03 * s, -0.04 * s, 0.1 * s, 0.025 * s), glow.traps * 0.8, false);
    return g;
  }

  // Props: built once in their own local frames.
  function disc(g, R, face, edge, hub) {
    el('circle', { r: R, fill: face, stroke: edge, 'stroke-width': 1.2 }, g);
    el('circle', { r: R * 0.62, fill: 'none', stroke: edge, 'stroke-width': 0.7, opacity: 0.7 }, g);
    el('circle', { r: R * 0.18, fill: hub }, g);
  }
  function dbHead(parent, light) {
    // Round head seen end-on: face, bevel ring, handle end.
    const R = 0.058 * s;
    el('circle', { r: R, fill: light ? '#3d454f' : '#272d35', stroke: light ? '#7a8490' : '#4a525d', 'stroke-width': 1 }, parent);
    el('circle', { r: R * 0.7, fill: 'none', stroke: light ? '#56606b' : '#353c45', 'stroke-width': 0.8 }, parent);
    el('circle', { r: R * 0.22, fill: light ? C.steel : C.steelDark }, parent);
  }
  function buildProp(name) {
    const g = el('g', {});
    if (name === 'plateF' || name === 'plateN') {
      // A bumper plate: two faces so it reads as a thick disc.
      const R = (tpl.plate ?? 0.2) * s;
      const back = el('g', {}, g);
      disc(back, R, C.plate, C.plateEdge, C.steelDark);
      const front = el('g', {}, g);
      disc(front, R, name === 'plateN' ? '#333a43' : '#252a31', C.plateEdge, C.steel);
      g._faces = [back, front];
    } else if (/^bar[FMN]$/.test(name)) {
      const pull = tpl.prop === 'pullbar';
      g._line = el('line', { stroke: C.steel, 'stroke-width': (pull ? 0.034 : 0.03) * s, 'stroke-linecap': 'butt' }, g);
      // The pull-up bar's cross-section shows at its near end.
      if (pull && name === 'barN') g._cap = el('circle', { r: 0.017 * s, fill: '#d6dce3', stroke: C.steelDark, 'stroke-width': 0.6 }, g);
    } else if (name === 'posts') {
      g._a = el('line', { stroke: '#3f4752', 'stroke-width': 0.035 * s }, g);
      g._b = el('line', { stroke: '#3f4752', 'stroke-width': 0.035 * s }, g);
    } else if (name === 'dbNin') {
      // Dumbbell seen end-on: handle and inner head behind the hand, outer head in front.
      g._handle = el('line', { stroke: C.steel, 'stroke-width': 0.026 * s, 'stroke-linecap': 'round' }, g);
      g._head = el('g', {}, g);
      dbHead(g._head, false);
    } else if (name === 'dbNout') {
      g._head = el('g', {}, g);
      dbHead(g._head, true);
    } else if (name === 'shadow') {
      el('ellipse', { rx: 0.42 * s, ry: 0.06 * s, fill: `url(#${id}s)` }, g);
    }
    return g;
  }

  const builders = { torso: buildTorso, pelvis: buildPelvis, head: buildHead, neck: buildNeck };
  for (const name of ['shadow', ...BODY_PARTS, ...propParts(tpl)]) {
    const g = /^(thigh|shin|foot|upper|fore|hand)[NF]$/.test(name) ? buildLimb(name) : builders[name] ? builders[name]() : buildProp(name);
    g.dataset.part = name;
    svg.appendChild(g);
    groups[name] = g;
  }
  container.innerHTML = '';
  container.appendChild(svg);

  // Plane transform for a prop face: local px → the world plane spanned by ax/ay (unit vectors) through c.
  const plane = (c, ax, ay) => {
    const O = project(c);
    const X = project([c[0] + ax[0], c[1] + ax[1], c[2] + ax[2]]);
    const Y = project([c[0] + ay[0], c[1] + ay[1], c[2] + ay[2]]);
    return [(X[0] - O[0]) / s, (X[1] - O[1]) / s, (Y[0] - O[0]) / s, (Y[1] - O[1]) / s, O[0], O[1]];
  };
  const set = (g, m) => g && g.setAttribute('transform', mtx(m));
  const at = (p, z) => [p[0], p[1], z];
  const line = (n, a, b) => {
    const A = project(a);
    const B = project(b);
    n.setAttribute('x1', f1(A[0]));
    n.setAttribute('y1', f1(A[1]));
    n.setAttribute('x2', f1(B[0]));
    n.setAttribute('y2', f1(B[1]));
  };
  const ux = [1, 0, 0];
  const uy = [0, -1, 0]; // screen y runs down
  let lastOrder = '';

  function draw(t, staticPose) {
    const P = staticPose || paramsAt(tpl, phases, t);
    const j = solve(tpl, P);
    const bone = (name, a, b, L, front) => set(groups[name], boneMatrix(project, s, a, b, L, front));
    for (const S of ['N', 'F']) {
      bone(`thigh${S}`, j[`hip${S}`], j[`knee${S}`], BODY.thigh, ux);
      bone(`shin${S}`, j[`knee${S}`], j[`ankle${S}`], BODY.shin, ux);
      bone(`foot${S}`, j[`heel${S}`], j[`toe${S}`], 0.225, [0, 1, 0]);
      bone(`upper${S}`, j[`shoulder${S}`], j[`elbow${S}`], BODY.upper, j.fwd);
      // Forearm front = the flexor side, which turns toward the upper arm as the elbow bends.
      const e = j[`elbow${S}`];
      const sh = j[`shoulder${S}`];
      bone(`fore${S}`, e, j[`wrist${S}`], BODY.fore, [sh[0] - e[0] + j.fwd[0] * 0.15, sh[1] - e[1] + j.fwd[1] * 0.15, sh[2] - e[2]]);
      bone(`hand${S}`, j[`wrist${S}`], j[`handTip${S}`], BODY.hand, j.fwd);
    }
    bone('torso', j.pelvis, j.chest, BODY.spine, j.fwd);
    bone('pelvis', j.pelvis, j.chest, BODY.spine, j.fwd);
    bone('neck', [j.chest[0] - j.up[0] * 0.02, j.chest[1] - j.up[1] * 0.02, 0], j.neck, LIMB.neck.L, j.fwd);
    bone('head', j.neck, [j.neck[0] + j.headUp[0] * 0.24, j.neck[1] + j.headUp[1] * 0.24, 0], 0.24, j.headFwd);

    // Shadow under the feet (smaller and fainter when hanging).
    const O = project([(j.ankleN[0] + j.ankleF[0]) / 2, 0, 0]);
    const air = Math.max(0, Math.min(j.ankleN[1], j.ankleF[1]) - BODY.ankleY);
    groups.shadow.setAttribute('transform', `translate(${f1(O[0])},${f1(O[1])}) scale(${(1 - Math.min(0.6, air * 0.8)).toFixed(2)})`);
    groups.shadow.setAttribute('opacity', Math.max(0.3, 1 - air * 1.5).toFixed(2));

    if (tpl.prop === 'barbell') {
      const b = j.bar;
      line(groups.barF._line, at(b, 0), at(b, 0.78)); // the near half sits inside the body and the near plate
      for (const [name, side] of [['plateF', 1], ['plateN', -1]]) {
        const [inner, outer] = groups[name]._faces;
        set(inner, plane(at(b, side * 0.5), ux, uy));
        set(outer, plane(at(b, side * 0.6), ux, uy));
        groups[name].appendChild(side < 0 ? outer : inner); // nearer face on top
      }
    } else if (tpl.prop === 'pullbar') {
      const { x, y } = tpl.rig.hands;
      line(groups.barF._line, [x, y, 0.62], [x, y, 0.12]);
      line(groups.barM._line, [x, y, 0.12], [x, y, -0.12]);
      line(groups.barN._line, [x, y, -0.12], [x, y, -0.62]);
      const cap = project([x, y, -0.62]);
      groups.barN._cap.setAttribute('cx', f1(cap[0]));
      groups.barN._cap.setAttribute('cy', f1(cap[1]));
      line(groups.posts._a, [x, y - 0.02, 0.62], [x, y + 0.7, 0.62]);
      line(groups.posts._b, [x, y - 0.02, -0.62], [x, y + 0.7, -0.62]);
    } else if (tpl.prop === 'dumbbells') {
      const g = j.gripN;
      const inner = [g[0], g[1], g[2] + 0.11];
      const outer = [g[0], g[1], g[2] - 0.11];
      line(groups.dbNin._handle, inner, outer);
      set(groups.dbNin._head, plane(inner, ux, uy));
      set(groups.dbNout._head, plane(outer, ux, uy));
    }

    // Depth sort: re-append groups only when the back-to-front order changes.
    const order = drawOrder(tpl, j, project);
    const key = order.join();
    if (key !== lastOrder) {
      lastOrder = key;
      for (const name of order) svg.appendChild(groups[name]);
    }

    // Glow: opacity only, strongest at the hardest point of the rep.
    const k = staticPose ? 1 : progressAt(phases, t, 0);
    const kk = Math.pow(k, 1.6);
    for (const g of glows) g.node.setAttribute('opacity', (g.weight * kk).toFixed(2));
  }

  if (still != null) {
    draw(still); // a still frame `at` seconds into the rep (frame sheets)
    return { stop() {} };
  }
  if (reducedMotion()) {
    draw(0, tpl.b); // static: the hardest point, muscles lit
    return { stop() {} };
  }

  // Animate at ≤ 30 fps. Paused or resting: hold the current frame and let the loop sleep. Every way out
  // of a pause or a rest re-renders the screen, which mounts a fresh figure.
  let stopped = false;
  let last = -1;
  const start = performance.now();
  draw(0);
  onFrame((now) => {
    if (stopped || !svg.isConnected || isPaused()) return false;
    if (now - last < 33) return true;
    last = now;
    draw((now - start) / 1000);
    return true;
  });
  return { stop() { stopped = true; } };
}
