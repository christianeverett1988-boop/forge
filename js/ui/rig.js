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
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
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

/**
 * Blend the keyframes; each parameter uses its own lag. With a mid keyframe `m` the move goes a → m → b
 * (jumps, presses that travel around something).
 */
export function paramsAt(tpl, phases, t) {
  const out = {};
  for (const k of Object.keys(tpl.a)) {
    const p = progressAt(phases, t, (tpl.lag && tpl.lag[k]) || 0);
    const a = tpl.a[k];
    const b = tpl.b[k] ?? a;
    const m = tpl.m && tpl.m[k] != null ? tpl.m[k] : null;
    out[k] = m == null ? a + (b - a) * p : p < 0.5 ? a + (m - a) * p * 2 : m + (b - m) * (p - 0.5) * 2;
  }
  for (const k of Object.keys(tpl.b)) if (!(k in out)) out[k] = tpl.b[k];
  return out;
}

// ---------- solve a pose ----------
const trunkDir = (deg) => sag(180 - deg); // trunk lean: 0 = upright, + = forward
const trunkFwd = (deg) => sag(90 - deg); // chest facing direction

/**
 * Turn template parameters into 16 joint positions plus extras (toes, heels, hand tips, grips, prop points).
 * The template's `rig` says how the body is placed:
 *   root   'pelvis' (params px, py) | 'chest' (px, py are the chest) | 'plank' (a straight body pivoting at
 *          rig.pivot = { at: [x, y], joint: 'ankle' | 'knee' }; param `line` = body angle above the floor,
 *          `pike` bends at the hips)
 *          balance 'bar' keeps a back-squat bar over mid-foot; 'grip' keeps the hands over mid-foot (deadlifts)
 *   trunk  param `trunk`: 0 upright, + leans forward (90 = face down), − leans back (−90 = lying face up)
 *   legs   'ik': feet planted (rig.feet, or rig.feetN / rig.feetF per side: { x, y, z, kneesOut, angle });
 *          params heel / heelN / heelF lift the heels (calf raises, back foot of a lunge), air lifts the
 *          whole body (jumps), fxN / fxF move a foot.
 *          'fk': params hipN / kneeN / hipF / kneeF (degrees; 0 = straight down, 90 = forward), footN / footF
 *   arms   'fk': params shN / elN / shF / elF (+ abd outward, wrist)
 *          'ik': hands at rig.hands { x, y } or params hx, hy (or hxN / hyN / hxF / hyF), grip width rig.grip,
 *          elbows toward rig.pole [x, y, outward]
 *          'ik-bar': hands on a back-squat bar
 */
export function solve(tpl, P) {
  const r = tpl.rig;
  const j = {};
  const air = P.air || 0;
  let trunk = P.trunk ?? 0;

  // ----- root -----
  if (r.root === 'plank') {
    const line = rad(P.line ?? 0);
    const sgn = r.pivot.dir ?? 1; // 1: head toward +x, face down (push-ups); -1: head toward −x, face up (inverted rows)
    const dir = [sgn * Math.cos(line), Math.sin(line), 0]; // from the pivot toward the head
    const piv = [r.pivot.at[0], r.pivot.at[1] + air, 0];
    const len = r.pivot.joint === 'knee' ? BODY.thigh : BODY.thigh + BODY.shin;
    j.pelvis = add(piv, mul(dir, len));
    trunk = sgn * (90 - (P.line ?? 0)) - (P.pike || 0);
  }
  const up = trunkDir(trunk);
  const fwd = trunkFwd(trunk);
  // Bar on the upper back (back squat) or across the front of the shoulders (front squat, rack).
  const barLocal = () => (r.barSide === 'front'
    ? add(mul(up, BODY.spine - 0.02), mul(fwd, 0.11))
    : add(mul(up, BODY.spine - (r.barDrop ?? 0.05)), mul(fwd, -(r.barBack ?? 0.075))));
  if (r.root === 'chest') {
    j.chest = [P.px, P.py + air, 0];
    j.pelvis = sub(j.chest, mul(up, BODY.spine));
  } else if (r.root !== 'plank') {
    let px = P.px ?? 0;
    if (r.balance === 'bar') px = (r.feet.x + 0.06) - barLocal()[0];
    j.pelvis = [px, P.py + air, 0];
  }
  j.chest = j.chest || add(j.pelvis, mul(up, BODY.spine));
  const headUp = trunkDir(trunk + (P.head || 0));
  j.up = up;
  j.fwd = fwd;
  j.headUp = headUp;
  j.headFwd = trunkFwd(trunk + (P.head || 0));

  const placeUpper = () => {
    j.neck = add(j.chest, mul(headUp, BODY.neck));
    j.head = add(j.neck, mul(headUp, BODY.headR + 0.01));
    for (const [S, side] of [['N', -1], ['F', 1]]) {
      j['shoulder' + S] = add(add(j.chest, [0, 0, side * BODY.shoulderZ]), mul(up, -BODY.shoulderDrop - (P.shrug || 0) * -1));
      j['hip' + S] = add(j.pelvis, [0, 0, side * BODY.hipZ]);
    }
  };
  placeUpper();

  // ----- arms -----
  const placeArms = () => {
    for (const [S, side] of [['N', -1], ['F', 1]]) {
      const sh = j['shoulder' + S];
      if (r.arms === 'fk') {
        const shA = P['sh' + S] ?? P.sh ?? 0;
        const elA = shA + (P['el' + S] ?? P.el ?? 0);
        const abd = P['abd' + S] ?? P.abd ?? 4;
        j['elbow' + S] = add(sh, mul(sag(shA, abd, side), BODY.upper));
        j['wrist' + S] = add(j['elbow' + S], mul(sag(elA, abd * (P.foreAbd ?? 0.5), side), BODY.fore));
        j['handDir' + S] = sag(elA + (P.wrist || 0), abd * (P.foreAbd ?? 0.5), side);
        j['grip' + S] = add(j['wrist' + S], mul(j['handDir' + S], BODY.hand * 0.5));
      } else {
        let target;
        let pole;
        if (r.arms === 'ik-bar') {
          j.bar = add(j.pelvis, barLocal());
          target = add(j.bar, [0, r.barSide === 'front' ? 0.02 : -0.02, side * r.grip]);
          pole = r.barSide === 'front' ? norm(add(mul(fwd, 1), [0, 0.2, side * 0.45])) : norm(add(mul(fwd, -1), [0, -0.9, side * 0.35]));
        } else {
          const hx = P['hx' + S] ?? P.hx ?? r.hands.x;
          const hy = P['hy' + S] ?? P.hy ?? r.hands.y;
          target = [hx, hy, side * (r.grip ?? 0.25)];
          const pl = r.pole || [0.35, -0.6, 0.75];
          pole = norm([pl[0], pl[1], side * pl[2]]);
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
  };
  placeArms();
  if (!j.bar) j.bar = mid(j.gripN, j.gripF); // a bar held in the hands sits between them

  // Deadlift-style balance: shift the whole upper body so the hands sit over mid-foot.
  if (r.balance === 'grip') {
    const dx = (r.feet.x + 0.06) - (j.gripN[0] + j.gripF[0]) / 2;
    for (const k of Object.keys(j)) if (Array.isArray(j[k]) && !['up', 'fwd', 'headUp', 'headFwd', 'handDirN', 'handDirF'].includes(k)) j[k] = [j[k][0] + dx, j[k][1], j[k][2]];
  }

  // ----- legs -----
  for (const [S, side] of [['N', -1], ['F', 1]]) {
    const hip = j['hip' + S];
    const legMode = r['legs' + S] || (r.root === 'plank' ? 'ik' : r.legs);
    if (legMode === 'ik') {
      const f = { ...(r.feet || {}), ...(r['feet' + S] || {}) };
      const heel = P['heel' + S] ?? P.heel ?? f.heel ?? 0;
      let ankle;
      let footA = f.angle ?? 90; // 90 = flat, pointing forward; smaller = toes pointing down
      if (r.root === 'plank' && r.pivot.joint === 'ankle') {
        ankle = [P['fx' + S] ?? r.pivot.at[0], (P['fy' + S] ?? r.pivot.at[1]) + air, side * (f.z ?? 0.1)];
      } else if (r.root === 'plank') {
        // Knees on the floor: shins lie back along the floor from the knee.
        const knee = [r.pivot.at[0], r.pivot.at[1] + air, side * (f.z ?? 0.1)];
        ankle = add(knee, [-BODY.shin * 0.97, 0.06, 0]);
      } else {
        const fx = P['fx' + S] ?? f.x ?? 0;
        const fy = (P['fy' + S] ?? f.y ?? 0) + air;
        // A lifted heel pivots the foot about the toes.
        const lift = Math.min(heel, BODY.footFwd * 0.9);
        footA = Math.min(footA, 90 - (Math.asin(lift / BODY.footFwd) * 180) / Math.PI);
        ankle = [fx, BODY.ankleY + fy + lift, side * (P.fz ?? f.z ?? 0.15)];
      }
      const pole = norm([f.pole ?? 1, f.poleY ?? 0, side * (f.kneesOut ?? 0.35)]);
      const { mid, end } = ik2(hip, ankle, BODY.thigh, BODY.shin, pole);
      j['knee' + S] = mid;
      j['ankle' + S] = end;
      const fd = sag(footA, 0, side);
      const sole = sag(footA - 90);
      j['toe' + S] = add(end, add(mul(fd, BODY.footFwd), add(mul(sole, 0.068), [0, 0, side * 0.03])));
      j['heel' + S] = add(end, add(mul(fd, -BODY.heel), mul(sole, 0.068)));
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
export const BODY_PARTS = ['thighN', 'shinN', 'footN', 'upperN', 'foreN', 'handN', 'thighF', 'shinF', 'footF', 'upperF', 'foreF', 'handF', 'pelvis', 'torso', 'neck', 'head'];

/**
 * What the figure holds or uses, from the template and the exercise's load (tpl.load is set at mount):
 *   barbell / smith / ez → a bar on the back or front (hold 'back' | 'front') or in the hands
 *   dumbbell → near dumbbell (both with tpl.both); goblet hold → one weight at the chest
 *   kettlebell → a bell in the near hand (both with tpl.both)
 *   cable / band → a line from the hand to tpl.anchor
 *   tpl.gear adds fixed kit: 'pullbar', 'dip', 'rings', 'ball', 'wheel'
 */
export function propParts(tpl) {
  const load = tpl.load;
  const hold = tpl.hold || 'hands';
  const both = !!tpl.both;
  const out = [];
  const bar = ['barbell', 'smith'].includes(load);
  if (tpl.bar === 'handle') out.push('barF', 'barN'); // a straight handle or lat bar, no plates
  else if (bar && (hold === 'back' || hold === 'front')) out.push('barF', 'plateF', 'plateN');
  else if (bar && hold === 'hands') out.push('barF', 'barN', 'plateF', 'plateN');
  else if ((load === 'dumbbell' || load === 'kettlebell') && hold === 'goblet') out.push('goblet');
  else if (load === 'dumbbell' && hold === 'hands') out.push('dbNin', 'dbNout', ...(both ? ['dbFin', 'dbFout'] : []));
  else if (load === 'kettlebell' && hold === 'hands') out.push('kbN', ...(both ? ['kbF'] : []));
  if (load === 'cable' && tpl.anchor) out.push('cableN', ...(both || tpl.bar === 'handle' ? ['cableF'] : []));
  if (load === 'band' && tpl.anchor) out.push('bandN', ...(both || tpl.bar === 'handle' ? ['bandF'] : []));
  for (const g of tpl.gear || []) {
    if (g === 'pullbar') out.push('posts', 'pbF', 'pbM', 'pbN');
    if (g === 'dip') out.push('dipF', 'dipN');
    if (g === 'rings') out.push('ringF', 'ringN');
    if (g === 'ball') out.push('ball');
    if (g === 'wheel') out.push('wheel');
  }
  return out;
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
  const at = (p, z) => [p[0], p[1], z];
  const b = j.bar;
  const parts = propParts(tpl);
  for (const name of parts) {
    if (name === 'barF') a.barF = [at(b, 0.39), 0];
    else if (name === 'barN') a.barN = [at(b, -0.39), 0];
    else if (name === 'plateF') a.plateF = [at(b, 0.55), 0];
    else if (name === 'plateN') a.plateN = [at(b, -0.55), 0];
    else if (/^db[NF](in|out)$/.test(name)) {
      const S = name[2];
      const side = S === 'N' ? -1 : 1;
      const g = j['grip' + S];
      a[name] = [[g[0], g[1], g[2] + (name.endsWith('in') ? -side : side) * 0.11], 0];
    } else if (/^kb[NF]$/.test(name)) {
      const g = j['grip' + name[2]];
      a[name] = [[g[0], g[1] - 0.12, g[2]], 0];
    } else if (/^(cable|band)[NF]$/.test(name)) {
      const g = j['grip' + name.slice(-1)];
      a[name] = [mid(g, [tpl.anchor[0], tpl.anchor[1], g[2]]), 0];
    } else if (name === 'goblet' || name === 'ball' || name === 'wheel') a[name] = [mid(j.gripN, j.gripF), name === 'goblet' ? -0.02 : 0];
    else if (name === 'posts') a.posts = [[0, 0, 0], 98];
    else if (/^pb[FMN]$/.test(name)) {
      const { x, y } = tpl.rig.hands;
      a[name] = [[x, y, { F: 0.37, M: 0, N: -0.37 }[name[2]]], 0];
    } else if (/^dip[NF]$/.test(name)) a[name] = [[0, (tpl.dipY ?? 1.15), name === 'dipN' ? -0.26 : 0.26], 0];
    else if (/^ring[NF]$/.test(name)) a[name] = [j['grip' + name.slice(-1)], 0.005];
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
  // The near half of a bar runs into its plate: keep it behind the plate face.
  if (d.barN != null && d.plateN != null) d.barN = Math.max(d.barN, d.plateN + 0.01);
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
    const parts = propParts(tpl);
    if (!tpl.focus && parts.includes('plateN')) {
      const R = tpl.plate ?? 0.2;
      for (const z of [-0.6, 0.6]) for (const [dx, dy] of [[0, R], [0, -R], [R, 0], [-R, 0]]) take([j.bar[0] + dx, j.bar[1] + dy, z]);
    }
    if (parts.includes('pbM')) take([tpl.rig.hands.x, tpl.rig.hands.y + 0.05, 0]);
    if (parts.includes('goblet')) take([j.gripN[0], j.gripN[1] - 0.25, 0]);
    if (parts.some((p) => p.startsWith('kb'))) take([j.gripN[0], j.gripN[1] - 0.22, j.gripN[2]]);
  }
  if (!tpl.focus) {
    for (const e of tpl.env || []) {
      const pts = e.type === 'bench' ? e.pads.flat() : e.type === 'box' ? [[e.x0, e.h], [e.x1, 0]] : [];
      for (const [x, y] of pts) for (const z of [-0.15, 0.15]) take([x, y, z]);
    }
  }
  const m = 0.07 * tpl.cam.scale;
  return [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m];
}
