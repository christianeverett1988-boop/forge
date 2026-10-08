// Skeleton, inverse kinematics, tempo timing and camera for the silhouette demos. Pure math, no DOM,
// so it runs in the unit tests. js/ui/figure.js draws what this returns; js/ui/poses.js holds the templates.
//
// World space is metres: x forward (the way the figure faces), y up, z to the figure's left.
// The near side of the body is its right side (z < 0). The camera sits front-right at `yaw` degrees and
// looks slightly down (`pitch`), orthographic.

// ---------- body ----------
export const BODY = {
  ankleY: 0.08, shin: 0.43, thigh: 0.45, hipZ: 0.095,
  spine: 0.5, // hip centre → base of neck (between the shoulders)
  neck: 0.1, headR: 0.11,
  shoulderZ: 0.19, shoulderDrop: 0.035,
  upper: 0.3, fore: 0.265, hand: 0.09,
  footFwd: 0.17, heel: 0.055,
};

// 16 joints.
export const JOINTS = ['pelvis', 'chest', 'neck', 'head',
  'shoulderN', 'elbowN', 'wristN', 'shoulderF', 'elbowF', 'wristF',
  'hipN', 'kneeN', 'ankleN', 'hipF', 'kneeF', 'ankleF'];

// ---------- vectors ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const dist = (a, b) => len(sub(a, b));
const rad = (d) => (d * Math.PI) / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Direction in the sagittal plane: 0° = straight down, +90° = forward, 180° = up. Optional outward splay. */
export function sag(deg, splayDeg = 0, side = -1) {
  const a = rad(deg);
  const s = rad(splayDeg);
  return norm([Math.sin(a) * Math.cos(s), -Math.cos(a) * Math.cos(s), side * Math.sin(s)]);
}

/**
 * Two-bone IK: root A, target T, bone lengths l1/l2, pole = which way the middle joint bends.
 * Returns { mid, end }; if T is out of reach the chain points straight at it.
 */
export function ik2(A, T, l1, l2, pole) {
  const d0 = dist(A, T);
  const d = clamp(d0, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = norm(sub(T, A));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let perp = sub(pole, mul(dir, dot(pole, dir)));
  if (len(perp) < 1e-6) perp = [0, 0, 1];
  perp = norm(perp);
  const mid = add(add(A, mul(dir, a)), mul(perp, h));
  const end = add(mid, mul(norm(sub(add(A, mul(dir, d)), mid)), l2));
  return { mid, end };
}

// ---------- tempo ----------
/** Sine ease in-out. */
export const sine = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));

/**
 * One rep as phases (seconds). `first` is 'down' when the rep starts with the lowering (squat) or 'up'
 * when it starts with the lift (pull-up, curl). Progress 0 = start pose, 1 = hardest point.
 * tempo: { ecc, pause, con, top } — lowering, pause at the bottom, lifting, pause at the top.
 */
export function repPhases(tempo, first) {
  const { ecc, pause, con, top } = tempo;
  // In a squat the hardest point is the bottom; in a curl or pull-up it is the top (progress 1 either way).
  return first === 'down'
    ? [{ from: 0, to: 1, d: ecc }, { hold: 1, d: pause }, { from: 1, to: 0, d: con }, { hold: 0, d: top }]
    : [{ from: 0, to: 1, d: con }, { hold: 1, d: top }, { from: 1, to: 0, d: ecc }, { hold: 0, d: pause }];
}
export const repLength = (phases) => phases.reduce((s, p) => s + p.d, 0);

/**
 * Progress (0..1) at time t (seconds) for a part that lags (> 0) or leads (< 0) the movement by a
 * fraction of each phase. Every part still starts and finishes each phase together.
 */
export function progressAt(phases, t, lag = 0) {
  const total = repLength(phases);
  let x = ((t % total) + total) % total;
  for (const p of phases) {
    if (x <= p.d) {
      if (p.hold != null) return p.hold;
      const tau = x / p.d;
      const u = lag >= 0 ? (tau - lag) / (1 - lag) : tau / (1 + lag);
      return p.from + (p.to - p.from) * sine(u);
    }
    x -= p.d;
  }
  return phases[phases.length - 1].hold ?? 0;
}

/** Blend two keyframes; each parameter uses its own lag. */
export function paramsAt(tpl, phases, t) {
  const out = {};
  for (const k of Object.keys(tpl.a)) {
    const p = progressAt(phases, t, (tpl.lag && tpl.lag[k]) || 0);
    out[k] = tpl.a[k] + (tpl.b[k] - tpl.a[k]) * p;
  }
  return out;
}

// ---------- solve a pose ----------
const trunkDir = (deg) => sag(180 - deg); // trunk lean: 0 = upright, + = forward
const trunkFwd = (deg) => sag(90 - deg); // chest facing direction

/**
 * Turn template parameters into 16 joint positions plus extras (toes, heels, hand tips, prop points).
 * The template's `rig` says how the root, legs and arms are placed:
 *   root:  'pelvis' (px, py) | 'chest' (px, py are the chest)    balance: 'bar' keeps the bar over mid-foot
 *   legs:  'ik' (feet planted at rig.feet) | 'fk' (hipN/kneeN/hipF/kneeF degrees)
 *   arms:  'ik-bar' (hands on the back-squat bar) | 'ik-fixed' (hands at rig.hands) | 'fk' (shN/elN/shF/elF)
 */
export function solve(tpl, P) {
  const r = tpl.rig;
  const up = trunkDir(P.trunk);
  const fwd = trunkFwd(P.trunk);
  const j = {};
  const barLocal = (k) => add(mul(up, BODY.spine - (r.barDrop ?? 0.05)), mul(fwd, -(r.barBack ?? 0.075) * k)); // bar on the upper back

  if (r.root === 'chest') {
    j.chest = [P.px, P.py, 0];
    j.pelvis = sub(j.chest, mul(up, BODY.spine));
  } else {
    let px = P.px ?? 0;
    if (r.balance === 'bar') {
      const midfoot = r.feet.x + 0.06;
      px = midfoot - barLocal(1)[0];
    }
    j.pelvis = [px, P.py, 0];
    j.chest = add(j.pelvis, mul(up, BODY.spine));
  }
  const headUp = trunkDir(P.trunk + (P.head || 0));
  j.neck = add(j.chest, mul(headUp, BODY.neck));
  j.head = add(j.neck, mul(headUp, BODY.headR + 0.01));
  j.headUp = headUp;
  j.headFwd = trunkFwd(P.trunk + (P.head || 0));
  j.up = up;
  j.fwd = fwd;

  // Shoulders and hips sit either side of the spine.
  for (const [S, side] of [['N', -1], ['F', 1]]) {
    j['shoulder' + S] = add(add(j.chest, [0, 0, side * BODY.shoulderZ]), mul(up, -BODY.shoulderDrop));
    j['hip' + S] = add(j.pelvis, [0, 0, side * BODY.hipZ]);
  }

  // Legs
  for (const [S, side] of [['N', -1], ['F', 1]]) {
    const hip = j['hip' + S];
    if (r.legs === 'ik') {
      const fz = side * (r.feet.z ?? 0.15);
      const ankle = [r.feet.x, BODY.ankleY, fz];
      const pole = norm([1, 0, side * (r.feet.kneesOut ?? 0.35)]);
      const { mid, end } = ik2(hip, ankle, BODY.thigh, BODY.shin, pole);
      j['knee' + S] = mid;
      j['ankle' + S] = end;
      j['toe' + S] = add(end, [BODY.footFwd, -BODY.ankleY + 0.012, side * 0.035]);
      j['heel' + S] = add(end, [-BODY.heel, -BODY.ankleY + 0.012, 0]);
    } else {
      const hipA = P['hip' + S];
      const kneeA = hipA - P['knee' + S];
      j['knee' + S] = add(hip, mul(sag(hipA, 3, side), BODY.thigh));
      j['ankle' + S] = add(j['knee' + S], mul(sag(kneeA, 2, side), BODY.shin));
      const footA = kneeA + 90 + (P['foot' + S] ?? 0); // + = toes point down
      const fd = sag(footA, 6, side);
      j['toe' + S] = add(j['ankle' + S], add(mul(fd, BODY.footFwd), mul(sag(kneeA), 0.07)));
      j['heel' + S] = add(j['ankle' + S], add(mul(fd, -BODY.heel), mul(sag(kneeA), 0.07)));
    }
  }

  // Arms
  for (const [S, side] of [['N', -1], ['F', 1]]) {
    const sh = j['shoulder' + S];
    if (r.arms === 'fk') {
      const shA = P['sh' + S];
      const elA = shA + P['el' + S];
      j['elbow' + S] = add(sh, mul(sag(shA, P.abd ?? 4, side), BODY.upper));
      j['wrist' + S] = add(j['elbow' + S], mul(sag(elA, 0, side), BODY.fore));
      j['handDir' + S] = sag(elA + (P.wrist || 0), 0, side);
      j['grip' + S] = add(j['wrist' + S], mul(j['handDir' + S], BODY.hand * 0.5));
    } else {
      let target;
      let pole;
      if (r.arms === 'ik-bar') {
        const bar = add(j.pelvis, barLocal(1));
        j.bar = bar;
        target = add(bar, [0, -0.02, side * r.grip]);
        pole = norm(add(mul(fwd, -1), [0, -0.9, side * 0.35]));
      } else {
        target = [r.hands.x, r.hands.y, side * r.grip];
        pole = norm([0.35, -0.6, side * 0.75]);
      }
      // Wrist sits a hand-width short of the grip point, toward the shoulder.
      const toShoulder = norm(sub(sh, target));
      const wristT = add(target, mul(toShoulder, BODY.hand * 0.55));
      const { mid, end } = ik2(sh, wristT, BODY.upper, BODY.fore, pole);
      j['elbow' + S] = mid;
      j['wrist' + S] = end;
      j['grip' + S] = target;
      j['handDir' + S] = norm(sub(target, end));
    }
    j['handTip' + S] = add(j['wrist' + S], mul(j['handDir' + S], BODY.hand));
  }
  return j;
}

// ---------- camera ----------
/** Orthographic camera: returns project(p) → [sx, sy, depth]. Bigger depth = farther from the viewer. */
export function camera({ yaw = 30, pitch = 8, scale = 90, x = 100, ground = 198 }) {
  const cy = Math.cos(rad(yaw));
  const sy = Math.sin(rad(yaw));
  const cp = Math.cos(rad(pitch));
  const sp = Math.sin(rad(pitch));
  return (p) => {
    const xr = p[0] * cy + p[2] * sy;
    const d = -p[0] * sy + p[2] * cy;
    return [x + scale * xr, ground - scale * (p[1] * cp + d * sp), d];
  };
}

/**
 * Screen transform for a bone drawn along +x from 0 to its true length L (metres → px via `scale`):
 * x is stretched to the projected length, y keeps real thickness. `front` (a world direction) decides
 * which side of the bone is its front, so muscle shapes and the rim land on the right side.
 * Returns an SVG matrix string.
 */
export function boneMatrix(project, scale, a, b, L, front) {
  const A = project(a);
  const B = project(b);
  let dx = B[0] - A[0];
  let dy = B[1] - A[1];
  const pl = Math.hypot(dx, dy);
  const Lp = L * scale;
  if (pl < 0.5) { dx = 0.5; dy = 0; }
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  let nx = -uy;
  let ny = ux;
  if (front) {
    const F = project(add(a, mul(front, 0.1)));
    if ((F[0] - A[0]) * nx + (F[1] - A[1]) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  const k = Math.max(pl, 0.5) / Lp;
  return [ux * k, uy * k, nx, ny, A[0], A[1]];
}

// ---------- draw order (depth sorting) ----------
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const BODY_PARTS = ['thighN', 'shinN', 'footN', 'upperN', 'foreN', 'handN', 'thighF', 'shinF', 'footF', 'upperF', 'foreF', 'handF', 'pelvis', 'torso', 'neck', 'head'];

/** The props a template draws, by name. */
export function propParts(tpl) {
  if (tpl.prop === 'barbell') return ['barF', 'plateF', 'plateN'];
  if (tpl.prop === 'pullbar') return ['posts', 'barF', 'barM', 'barN'];
  if (tpl.prop === 'dumbbells') return ['dbNin', 'dbNout'];
  return [];
}

/** World point whose depth decides where each part sits in the draw order, plus a small tie-break. */
function anchors(tpl, j) {
  const a = {};
  for (const S of ['N', 'F']) {
    a[`thigh${S}`] = [mid(j[`hip${S}`], j[`knee${S}`]), 0];
    a[`shin${S}`] = [mid(j[`knee${S}`], j[`ankle${S}`]), 0];
    a[`foot${S}`] = [mid(j[`heel${S}`], j[`toe${S}`]), -0.005];
    a[`upper${S}`] = [mid(j[`shoulder${S}`], j[`elbow${S}`]), 0];
    a[`fore${S}`] = [mid(j[`elbow${S}`], j[`wrist${S}`]), 0];
    a[`hand${S}`] = [mid(j[`wrist${S}`], j[`handTip${S}`]), -0.01];
  }
  a.torso = [mid(j.pelvis, j.chest), 0];
  a.pelvis = [j.pelvis, -0.004]; // over the bottom of the torso, so the glutes show
  a.neck = [mid(j.chest, j.neck), -0.002];
  a.head = [j.head, -0.003];
  if (tpl.prop === 'barbell') {
    const b = j.bar;
    a.barF = [[b[0], b[1], 0.39], 0];
    a.plateF = [[b[0], b[1], 0.55], 0];
    a.plateN = [[b[0], b[1], -0.55], 0];
  } else if (tpl.prop === 'pullbar') {
    const { x, y } = tpl.rig.hands;
    a.posts = [[x, y, 0], 98];
    a.barF = [[x, y, 0.37], 0];
    a.barM = [[x, y, 0], 0];
    a.barN = [[x, y, -0.37], 0];
  } else if (tpl.prop === 'dumbbells') {
    const g = j.gripN;
    a.dbNin = [[g[0], g[1], g[2] + 0.11], 0];
    a.dbNout = [[g[0], g[1], g[2] - 0.11], 0];
  }
  return a;
}

/**
 * Back-to-front draw order for this frame. Each part sorts by the depth of its anchor (bone midpoint,
 * spine, prop centre), so a limb crossing in front of the body is drawn over it and one behind it is
 * drawn under it. Templates can nudge a part (`bias`, metres; + = further back) and make a hand stay in
 * front of the prop it grips (`grips`). The shadow is always first.
 */
export function drawOrder(tpl, j, project) {
  const a = anchors(tpl, j);
  const d = {};
  for (const [name, [p, tie]] of Object.entries(a)) d[name] = project(p)[2] + tie + ((tpl.bias && tpl.bias[name]) || 0);
  for (const [hand, prop] of Object.entries(tpl.grips || {})) if (d[prop] != null) d[hand] = Math.min(d[hand], d[prop] - 0.01);
  const names = Object.keys(d);
  const order = names.map((n, i) => [n, i]).sort((x, y) => d[y[0]] - d[x[0]] || x[1] - y[1]).map(([n]) => n);
  return ['shadow', ...order];
}

// ---------- framing ----------
const POINTS = [...JOINTS, 'toeN', 'toeF', 'heelN', 'heelF', 'handTipN', 'handTipF', 'gripN', 'gripF'];

/**
 * The screen box (px) that holds the whole rep, so the figure fills the demo box. `tpl.focus` limits it
 * to some joints (the pull-up frames arms, bar and back, and lets the legs run off the bottom).
 */
export function frameBox(tpl, project, phases, n = 16) {
  const T = repLength(phases);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (p) => {
    const [x, y] = project(p);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  for (let k = 0; k < n; k++) {
    const j = solve(tpl, paramsAt(tpl, phases, (T * k) / n));
    const names = tpl.focus || POINTS;
    for (const name of names) if (j[name]) take(j[name]);
    take(add(j.head, mul(j.headUp, BODY.headR + 0.03))); // top of the head
    if (!tpl.focus && tpl.prop === 'barbell') {
      const R = tpl.plate ?? 0.2;
      for (const z of [-0.6, 0.6]) for (const [dx, dy] of [[0, R], [0, -R], [R, 0], [-R, 0]]) take([j.bar[0] + dx, j.bar[1] + dy, z]);
    }
    if (tpl.prop === 'pullbar') take([tpl.rig.hands.x, tpl.rig.hands.y + 0.05, 0]);
  }
  const m = 0.07 * tpl.cam.scale;
  return [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m];
}
