// Silhouette rig: skeleton, IK constraints and tempo timing (js/ui/rig.js + js/ui/poses.js).
import { test, eq, assert } from './harness.js';
import { BODY, solve, dist, ik2, repPhases, repLength, progressAt, paramsAt, camera, boneMatrix, drawOrder, frameBox } from '../js/ui/rig.js';
import { TEMPLATES, EXERCISE_TEMPLATES } from '../js/ui/poses.js';
import { EXERCISES } from '../js/workouts/exercises.js';

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(4)} vs ${b.toFixed(4)}`);
const frames = (tpl, n = 40) => {
  const ph = repPhases(tpl.tempo, tpl.first);
  const T = repLength(ph);
  return Array.from({ length: n }, (_, k) => solve(tpl, paramsAt(tpl, ph, (T * k) / n)));
};

test('rig: two-bone IK keeps bone lengths and reaches the target', () => {
  const A = [0, 1, 0];
  const T = [0.3, 0.4, 0.1];
  const { mid, end } = ik2(A, T, 0.45, 0.43, [1, 0, 0]);
  near(dist(A, mid), 0.45, 1e-9, 'upper bone');
  near(dist(mid, end), 0.43, 1e-9, 'lower bone');
  near(dist(end, T), 0, 1e-9, 'reaches');
  assert(mid[0] > 0.15, 'bends toward the pole');
});

test('rig: every template keeps bone lengths in every frame', () => {
  for (const [name, tpl] of Object.entries(TEMPLATES)) {
    for (const j of frames(tpl)) {
      for (const S of ['N', 'F']) {
        near(dist(j[`hip${S}`], j[`knee${S}`]), BODY.thigh, 1e-6, `${name} thigh`);
        near(dist(j[`knee${S}`], j[`ankle${S}`]), BODY.shin, 1e-6, `${name} shin`);
        near(dist(j[`shoulder${S}`], j[`elbow${S}`]), BODY.upper, 1e-6, `${name} upper arm`);
        near(dist(j[`elbow${S}`], j[`wrist${S}`]), BODY.fore, 1e-6, `${name} forearm`);
      }
    }
  }
});

test('rig: squat keeps the feet planted and the bar over mid-foot, hands on the bar', () => {
  const tpl = TEMPLATES.squat_barbell;
  const fs = frames(tpl);
  const a0 = fs[0].ankleN;
  let minHip = 9;
  for (const j of fs) {
    near(dist(j.ankleN, a0), 0, 1e-6, 'near foot planted');
    near(j.bar[0], tpl.rig.feet.x + 0.06, 1e-9, 'bar over mid-foot');
    near(dist(j.wristN, j.gripN), BODY.hand * 0.55, 0.005, 'near hand on bar');
    near(dist(j.wristF, j.gripF), BODY.hand * 0.55, 0.005, 'far hand on bar');
    minHip = Math.min(minHip, j.pelvis[1]);
  }
  assert(minHip < 0.55, 'reaches depth');
});

test('rig: pull-up hands stay on the bar, chin clears it at the top, body hangs clear of the floor', () => {
  const tpl = TEMPLATES.pullup;
  for (const j of frames(tpl)) {
    for (const S of ['N', 'F']) {
      near(j[`grip${S}`][1], tpl.rig.hands.y, 1e-9, 'grip height');
      near(dist(j[`wrist${S}`], j[`grip${S}`]), BODY.hand * 0.55, 0.01, `${S} hand on bar`);
      assert(j[`toe${S}`][1] > 0.05, 'feet clear of the floor');
    }
  }
  const top = solve(tpl, tpl.b);
  assert(top.neck[1] + 0.03 > tpl.rig.hands.y, 'chin over the bar at the top');
});

test('rig: far limbs pose on their own (not a shifted copy of the near ones)', () => {
  const j = solve(TEMPLATES.pullup, TEMPLATES.pullup.b);
  const kneeAngle = (S) => {
    const h = j[`hip${S}`];
    const k = j[`knee${S}`];
    const a = j[`ankle${S}`];
    const u = [h[0] - k[0], h[1] - k[1]];
    const v = [a[0] - k[0], a[1] - k[1]];
    return Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v));
  };
  assert(Math.abs(kneeAngle('N') - kneeAngle('F')) > 0.1, 'different knee bends');
});

test('tempo: phases follow the prescribed tempo; slow days take longer', () => {
  const tpl = TEMPLATES.squat_barbell;
  const ph = repPhases(tpl.tempo, 'down');
  eq(repLength(ph), 2 + 0.4 + 1.2 + 0.9);
  eq(progressAt(ph, 0), 0);
  eq(progressAt(ph, 2.2), 1); // pause at the bottom
  near(progressAt(ph, 1), 0.5, 1e-9, 'halfway down at 1 s (sine)');
  assert(repLength(repPhases(tpl.slow, 'down')) > repLength(ph), 'tempo days are slower');
  const up = repPhases({ con: 1, top: 0.5, ecc: 2, pause: 0.5 }, 'up');
  eq(progressAt(up, 1.2), 1); // a curl is hardest at the top
});

test('tempo: lagging and leading parts still start and finish each phase together', () => {
  const ph = repPhases({ ecc: 2, pause: 0.5, con: 1, top: 0.5 }, 'down');
  for (const lag of [-0.2, 0, 0.25]) {
    eq(progressAt(ph, 0, lag), 0);
    near(progressAt(ph, 2, lag), 1, 1e-9, `lag ${lag} ends together`);
  }
  assert(progressAt(ph, 0.6, 0.25) < progressAt(ph, 0.6, 0), 'lag trails');
  assert(progressAt(ph, 0.6, -0.2) > progressAt(ph, 0.6, 0), 'lead runs ahead');
});

test('camera: 3/4 view puts the far side forward and behind; bone matrix flips to show the front', () => {
  const project = camera({ yaw: 30, pitch: 0, scale: 100, x: 100, ground: 200 });
  const nearP = project([0, 1, -0.2]);
  const farP = project([0, 1, 0.2]);
  assert(farP[0] > nearP[0], 'far side shifts toward the facing direction');
  assert(farP[2] > nearP[2], 'and is deeper');
  // A bone pointing down with its front facing forward: local +y must map toward screen +x.
  const m = boneMatrix(project, 100, [0, 1, 0], [0, 0.5, 0], 0.5, [1, 0, 0]);
  assert(m[2] > 0, 'front side faces forward on screen');
  near(Math.hypot(m[0], m[1]), 1, 1e-9, 'no foreshortening for a vertical bone');
});

// ---------- depth sorting ----------
const before = (order, a, b) => order.indexOf(a) < order.indexOf(b);

test('depth: near limbs draw over the body, far limbs under it', () => {
  const tpl = { ...TEMPLATES.curl_dumbbell, load: 'dumbbell' };
  const order = drawOrder(tpl, solve(tpl, tpl.a), camera(tpl.cam));
  eq(order[0], 'shadow');
  assert(before(order, 'upperF', 'torso') && before(order, 'torso', 'upperN'), 'arms either side of the torso');
  assert(before(order, 'thighF', 'pelvis') && before(order, 'pelvis', 'thighN'), 'legs either side of the pelvis');
  assert(before(order, 'torso', 'pelvis'), 'pelvis over the bottom of the torso (glutes show)');
  assert(before(order, 'dbNin', 'handN') && before(order, 'handN', 'dbNout'), 'hand between the dumbbell heads');
});

test('depth: a far arm reaching across the front of the body is drawn over it (presses, flyes)', () => {
  // A front raise / fly-style pose: far arm straight out in front at shoulder height.
  const tpl = { ...TEMPLATES.curl_dumbbell, bias: {} };
  const P = { ...tpl.a, shF: 90, elF: 0, abd: -25 };
  const j = solve(tpl, P);
  const order = drawOrder(tpl, j, camera({ ...tpl.cam, yaw: 30 }));
  assert(before(order, 'torso', 'foreF'), 'far forearm in front of the torso once it crosses');
  const hang = drawOrder(tpl, solve(tpl, tpl.a), camera({ ...tpl.cam, yaw: 30 }));
  assert(before(hang, 'foreF', 'torso'), 'and behind it while hanging at the side');
});

test('depth: pull-up hands wrap the bar; squat grip reads over the near plate', () => {
  const pu = TEMPLATES.pullup;
  for (const P of [pu.a, pu.b]) {
    const o = drawOrder(pu, solve(pu, P), camera(pu.cam));
    assert(before(o, 'pbN', 'handN') && before(o, 'pbF', 'handF'), 'hands over their bar section');
    assert(before(o, 'posts', 'torso'), 'uprights behind the body');
  }
  const sq = { ...TEMPLATES.squat_barbell, load: 'barbell' };
  const o = drawOrder(sq, solve(sq, sq.b), camera(sq.cam));
  assert(before(o, 'plateN', 'handN') && before(o, 'plateN', 'foreN'), 'near arm over the near plate');
  assert(before(o, 'torso', 'plateN'), 'near plate over the back');
  assert(before(o, 'plateF', 'torso'), 'far plate behind the body');
});

// ---------- framing ----------
test('framing: the box holds the whole squat rep; the pull-up frames arms, bar and back', () => {
  const sq = { ...TEMPLATES.squat_barbell, load: 'barbell' };
  const ph = repPhases(sq.tempo, sq.first);
  const project = camera(sq.cam);
  const [x, y, w, h] = frameBox(sq, project, ph);
  for (const P of [sq.a, sq.b]) {
    const j = solve(sq, P);
    for (const n of ['toeN', 'heelN', 'head', 'kneeN', 'pelvis']) {
      const [px, py] = project(j[n]);
      assert(px > x && px < x + w && py > y && py < y + h, `squat ${n} in frame`);
    }
  }
  const pu = TEMPLATES.pullup;
  const pp = camera(pu.cam);
  const box = frameBox(pu, pp, repPhases(pu.tempo, pu.first));
  const toe = pp(solve(pu, pu.a).toeN);
  assert(toe[1] > box[1] + box[3], 'pull-up feet run off the bottom');
  const grip = pp(solve(pu, pu.a).gripN);
  assert(grip[1] > box[1], 'bar in frame');
});

test('library: every mapped exercise solves to finite joints and a finite frame, with its own load', () => {
  for (const ex of EXERCISES) {
    const name = EXERCISE_TEMPLATES[ex.id];
    if (!name) continue;
    const tpl = { ...TEMPLATES[name], load: ex.load };
    const ph = repPhases(tpl.tempo, tpl.first);
    const T = repLength(ph);
    for (let k = 0; k < 8; k++) {
      const j = solve(tpl, paramsAt(tpl, ph, (T * k) / 8));
      for (const [key, v] of Object.entries(j)) if (Array.isArray(v)) assert(v.every(Number.isFinite), `${ex.id} ${key}`);
      const order = drawOrder(tpl, j, camera(tpl.cam));
      assert(order.length >= 17, `${ex.id} parts`);
    }
    assert(frameBox(tpl, camera(tpl.cam), ph).every(Number.isFinite), `${ex.id} frame`);
  }
});

test('library: closed chains hold — push-up hands stay on the floor, bench bar stays over the chest, feet stay planted', () => {
  const pu = TEMPLATES.pushup;
  const ph = repPhases(pu.tempo, pu.first);
  for (let k = 0; k < 8; k++) {
    const j = solve(pu, paramsAt(pu, ph, (repLength(ph) * k) / 8));
    near(j.gripN[1], pu.rig.hands.y, 1e-9, 'hand on floor');
    near(dist(j.wristN, j.gripN), BODY.hand * 0.55, 0.02, 'wrist reaches the floor');
  }
  const bp = { ...TEMPLATES.bench_press, load: 'barbell' };
  for (const P of [bp.a, bp.b]) {
    const j = solve(bp, P);
    assert(j.bar[0] > j.shoulderN[0] - 0.05 && j.bar[0] < j.chest[0] + 0.35, 'bar over the chest, not the face');
    near(dist(j.wristN, j.gripN), BODY.hand * 0.55, 0.02, 'hands reach the bar');
  }
  const lu = TEMPLATES.lunge_db;
  const a0 = solve(lu, lu.a).ankleN;
  const b0 = solve(lu, lu.b).ankleN;
  near(dist(a0, b0), 0, 1e-6, 'front foot planted');
});

test('depth: a bar\'s near half stays behind its plate', () => {
  const dl = { ...TEMPLATES.deadlift, load: 'barbell' };
  const o = drawOrder(dl, solve(dl, dl.a), camera(dl.cam));
  assert(o.indexOf('barN') < o.indexOf('plateN'));
});
