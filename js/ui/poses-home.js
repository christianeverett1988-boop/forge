// Demo figures for the moves you do at home or on the road (v0.12.1): table, towel, doorframe and wall pulls,
// floor work, band and lunge variants, mobility and warm-up cardio. Same a/b/lag/tempo model as poses-lib.js.
//
// A held move (plank, iso) uses the HOLD tempo with a tiny a→b change so the figure breathes instead of freezing.
// Props follow the exercise's load; towels are gear ('towel' between the hands, 'strap' from the hands to the
// feet) and mini-bands are gear 'loop'. Lying-on-your-side poses are built face-down and rolled with rig.roll.
import { T, STAND, HOLD, HANG_ARMS } from './poses-lib.js';

const TABLE = { type: 'table', x0: -0.3, x1: 0.6, h: 0.78, w: 0.8 };
const FAR_TABLE = { type: 'table', x0: 0.5, x1: 1.3, h: 0.75, w: 0.8 };
const CHAIR = { type: 'box', x0: 0.7, x1: 1.1, h: 0.45, w: 0.45 };
const DOOR = { type: 'doorframe', x: 0, w: 0.86 };
const BENCH_BLOCK = { type: 'box', x0: -1.15, x1: -0.7, h: 0.5, w: 0.3, z: -0.2 }; // the step under the top foot
const FAST = { con: 0.35, top: 0.02, ecc: 0.35, pause: 0.02 };
const BREATH = { con: 1.2, top: 1, ecc: 1.2, pause: 0.6 };

// Lying face-down (superman, Y-T-W, snow angel): legs straight back on the floor, arms by fk.
const PRONE = { root: 'plank', pivot: { at: [-0.9, 0.12], joint: 'ankle' }, legsN: 'fk', legsF: 'fk', arms: 'fk' };
const prone = (h = -90, foot = -90) => ({ hipN: h, kneeN: 0, footN: foot, hipF: h, kneeF: 0, footF: foot });
// Lying on the far side, near arm up (rolled 90° about the body's own line).
const SIDE = (y0, o = {}) => ({ root: 'plank', pivot: { at: [-0.9, y0], joint: 'ankle' }, roll: { deg: 90 }, feet: { z: 0.05, angle: 0 }, ...o });
// Quadruped: knees on the floor under the hips, torso flat (plank root pivoting at the knee).
const QUAD = (o = {}) => ({ root: 'plank', pivot: { at: [-0.4, 0.07], joint: 'knee' }, feet: { z: 0.1, angle: 175 }, arms: 'ik', hands: { x: 0.1, y: 0.03 }, grip: 0.2, pole: [-0.4, 0.2, 0.5], ...o });

export const HOME = {
  // ---------------- under a table, in a doorway, against a wall ----------------
  table_row_straight_legs: T({
    cam: { yaw: 22 },
    env: [TABLE],
    rig: { root: 'plank', pivot: { at: [0.85, 0.09], joint: 'ankle', dir: -1 }, feet: { z: 0.12, angle: 150 }, arms: 'ik', hands: { x: -0.3, y: 0.77 }, grip: 0.3, pole: [0.3, -0.5, 0.8] },
    a: { line: 7, head: 0 },
    b: { line: 26, head: 0 },
  }),
  table_row_bent_knees: T({
    cam: { yaw: 22 },
    env: [TABLE],
    rig: { root: 'pelvis', legs: 'ik', feet: { x: 0.45, z: 0.14, kneesOut: 0.3 }, arms: 'ik', hands: { x: -0.3, y: 0.77 }, grip: 0.3, pole: [0.3, -0.5, 0.8] },
    a: { px: 0.0, py: 0.24, trunk: -88, head: 0 },
    b: { px: 0.02, py: 0.46, trunk: -66, head: 0 },
  }),
  table_row_feet_raised: T({
    cam: { yaw: 22 },
    env: [TABLE, CHAIR],
    rig: { root: 'plank', pivot: { at: [0.9, 0.54], joint: 'ankle', dir: -1 }, feet: { z: 0.12, angle: 110 }, arms: 'ik', hands: { x: -0.3, y: 0.77 }, grip: 0.3, pole: [0.3, -0.5, 0.8] },
    a: { line: -12, head: 0 },
    b: { line: 4, head: 0 },
  }),
  doorframe_row: T({
    cam: { yaw: 24 },
    env: [DOOR],
    rig: { root: 'plank', pivot: { at: [0.39, 0.09], joint: 'ankle', dir: -1 }, feet: { z: 0.12, angle: 90 }, arms: 'ik', hands: { x: 0, y: 1.2 }, grip: 0.4, pole: [0.3, -0.6, 0.6] },
    a: { line: 50, head: 0 },
    b: { line: 68, head: 0 },
  }),
  wall_triceps_extension: T({
    cam: { yaw: 22 },
    env: [{ type: 'wall', x: 0.42 }],
    rig: { root: 'plank', pivot: { at: [-0.64, 0.09], joint: 'ankle' }, feet: { z: 0.12, angle: 90 }, arms: 'ik', hands: { x: 0.36, y: 1.45 }, grip: 0.1, pole: [-0.3, 0.8, 0.3] },
    a: { line: 68, head: 4 },
    b: { line: 56, head: 4 },
    first: 'down',
  }),
  table_triceps_extension: T({
    cam: { yaw: 22 },
    env: [FAR_TABLE],
    rig: { root: 'plank', pivot: { at: [-0.75, 0.09], joint: 'ankle' }, feet: { z: 0.1, angle: 80 }, arms: 'ik', hands: { x: 0.7, y: 0.75 }, grip: 0.1, pole: [-0.3, 0.8, 0.3] },
    a: { line: 44, head: 4 },
    b: { line: 30, head: 4 },
    first: 'down',
  }),

  // ---------------- towels ----------------
  towel_lat_pulldown_iso: T({
    cam: { yaw: 34 },
    gear: ['towel'],
    rig: STAND({ feet: { x: 0, z: 0.13, kneesOut: 0.25 } }),
    a: { px: 0.01, py: 0.93, trunk: 0, head: 0, sh: 172, el: 2, abd: 30 },
    b: { px: 0.01, py: 0.93, trunk: 0, head: 0, sh: 25, el: 150, abd: 24 },
  }),
  sliding_floor_pulldown: T({
    cam: { yaw: 34, pitch: 18 },
    gear: ['towel'],
    // Face down on the floor, arms overhead on a towel. The towel stays put while the body slides toward it,
    // so the hands come back to the shoulders and the elbows rake back toward the ribs. The chest stays low.
    rig: { root: 'plank', pivot: { at: [-0.9, 0.12], joint: 'ankle' }, feet: { z: 0.1, angle: 80 }, arms: 'ik', hands: { x: 1.0, y: 0.04 }, grip: 0.2, pole: [-1, 0.5, 0.45] },
    a: { line: 3, head: 12, hx: 1.0 },
    b: { line: 6, head: 16, hx: 0.6 },
    first: 'up',
  }),
  towel_pull_apart: T({
    cam: { yaw: 40 },
    gear: ['towel'],
    rig: STAND({ feet: { x: 0, z: 0.13, kneesOut: 0.25 } }),
    a: { px: 0.02, py: 0.93, trunk: 0, head: 0, sh: 90, el: 0, abd: 6 },
    b: { px: 0.02, py: 0.93, trunk: 0, head: 0, sh: 90, el: 0, abd: 16 },
    tempo: HOLD, slow: HOLD,
  }),
  towel_iso_curl: T({
    cam: { yaw: 26 },
    gear: ['strap'],
    anchor: [0.06, 0.05],
    anchorZ: 0.25,
    rig: STAND({ feet: { x: 0, z: 0.12, kneesOut: 0.2 } }),
    a: { px: 0, py: 0.93, trunk: 0, head: 0, sh: 6, el: 88, abd: 5 },
    b: { px: 0, py: 0.93, trunk: 0, head: 0, sh: 12, el: 102, abd: 5 },
    tempo: HOLD, slow: HOLD,
  }),
  towel_lateral_raise_iso: T({
    cam: { yaw: 64, pitch: 8 },
    gear: ['strap'],
    anchor: [0.0, 0.05],
    anchorZ: 0.35,
    rig: STAND({ feet: { x: 0, z: 0.12, kneesOut: 0.2 } }),
    // Arms straight out to the sides, pressing up and out against the towel under the feet.
    a: { px: 0, py: 0.93, trunk: 0, head: 0, sh: 0, el: 0, abd: 40, foreAbd: 1 },
    b: { px: 0, py: 0.93, trunk: 0, head: 0, sh: 0, el: 0, abd: 58, foreAbd: 1 },
    tempo: HOLD, slow: HOLD,
  }),
  towel_slider_fly: T({
    cam: { yaw: 62, pitch: 14 },
    // Kneeling plank (knees on the floor), hands on towels: slide them out wide, chest low but off the floor.
    rig: { root: 'plank', pivot: { at: [-0.55, 0.07], joint: 'knee' }, feet: { z: 0.1, angle: 175 }, arms: 'ik', hands: { x: 0.34, y: 0.03 }, grip: 0.22, pole: [-0.3, 0.6, 0.55] },
    a: { line: 30, head: 6, hz: 0.22 },
    b: { line: 16, head: 6, hz: 0.62 },
    first: 'down',
  }),

  // ---------------- floor work ----------------
  bw_superman: T({
    cam: { yaw: 26, pitch: 10 },
    rig: PRONE,
    a: { line: 0, pike: 0, head: -4, ...prone(-90), sh: 92, el: 0, abd: 6, foreAbd: 1 },
    b: { line: 0, pike: 18, head: -18, ...prone(-108), sh: 112, el: 0, abd: 6, foreAbd: 1 },
    tempo: BREATH, slow: BREATH,
  }),
  bw_prone_ytw: T({
    // From above and a little to the side, so the arm shapes read as they sweep out and in.
    cam: { yaw: 15, pitch: 68 },
    rig: PRONE,
    // Y (arms overhead and wide), then T (straight out), then W (elbows bent, upper arms back), and back.
    a: { line: 0, pike: 8, head: -12, ...prone(-90), sh: 100, el: 0, abd: 40, foreAbd: 1 },
    m: { sh: 100, el: 0, abd: 90, foreAbd: 1 },
    b: { line: 0, pike: 8, head: -12, ...prone(-90), sh: 240, el: -140, abd: 45, foreAbd: 1 },
    tempo: { con: 1.8, top: 0.3, ecc: 1.8, pause: 0.3 }, slow: { con: 2.6, top: 0.4, ecc: 2.6, pause: 0.4 },
  }),
  reverse_snow_angel: T({
    cam: { yaw: 15, pitch: 68 },
    rig: PRONE,
    // Arms hover just off the floor and sweep from the hips, out to the sides, to overhead.
    a: { line: 0, pike: 8, head: -10, ...prone(-90), sh: 268, el: 0, abd: 12, foreAbd: 1 },
    m: { sh: 225, abd: 60 },
    b: { line: 0, pike: 8, head: -10, ...prone(-90), sh: 92, el: 0, abd: 12, foreAbd: 1 },
    tempo: { con: 1.8, top: 0.3, ecc: 1.8, pause: 0.3 }, slow: { con: 2.6, top: 0.4, ecc: 2.6, pause: 0.4 },
  }),
  // On the far forearm (elbow under the shoulder, forearm toward the viewer), near arm reaching up.
  side_plank: T({
    cam: { yaw: 30, pitch: 8 },
    rig: SIDE(0.14, { arms: 'fk', armsF: 'ik', handsF: { world: true, x: 0.44, y: 0.04, z: -0.33 }, grip: 0.2, pole: [0, 0, 1] }),
    a: { line: 17, head: 0, shN: 0, elN: 0, abdN: 90, foreAbd: 1 },
    b: { line: 16, head: 0, shN: 0, elN: 0, abdN: 90, foreAbd: 1 },
    tempo: HOLD, slow: HOLD,
  }),
  // Same plank with the top foot on a low step and the bottom leg lifted to meet it.
  bw_copenhagen_plank: T({
    cam: { yaw: 30, pitch: 8 },
    env: [BENCH_BLOCK],
    rig: SIDE(0.54, { arms: 'fk', armsF: 'ik', handsF: { world: true, x: 0.44, y: 0.04, z: -0.33 }, grip: 0.2, pole: [0, 0, 1], legsF: 'fk' }),
    a: { line: 1, head: 0, shN: 0, elN: 0, abdN: 90, foreAbd: 1, hipF: -90, kneeF: 0, footF: -90, splayF: -4 },
    b: { line: 1, head: 0, shN: 0, elN: 0, abdN: 90, foreAbd: 1, hipF: -90, kneeF: 0, footF: -90, splayF: -12 },
    tempo: HOLD, slow: HOLD,
  }),
  // On the far side, head on the bottom arm, near hand on the floor in front, top leg lifting.
  bw_side_lying_leg_raise: T({
    cam: { yaw: 40, pitch: 10 },
    rig: SIDE(0.15, { arms: 'fk', armsN: 'ik', handsN: { world: true, x: 0.5, y: 0.04, z: -0.3 }, grip: 0.2, pole: [-0.3, 0.2, 0.5], legsN: 'fk' }),
    a: { line: 8, head: 0, shF: 100, elF: 0, abdF: 0, hipN: -90, kneeN: 0, footN: -90, splayN: -8 },
    b: { line: 8, head: 0, shF: 100, elF: 0, abdF: 0, hipN: -90, kneeN: 0, footN: -90, splayN: 42 },
  }),
  bw_fire_hydrant: T({
    cam: { yaw: -62, pitch: 26 },
    rig: QUAD({ legsN: 'fk', legsF: 'fk' }),
    // Seen from behind and a little above: the knee stays bent at 90° and the near thigh lifts out to the side
    // with the hips level (shin still pointing back, not a kick).
    a: { line: 90, pike: -90, head: -15, hipN: 0, kneeN: 90, footN: -90, splayN: 2, shinSplayN: 0, hipF: 0, kneeF: 90, footF: -90 },
    b: { line: 90, pike: -90, head: -15, hipN: 0, kneeN: 90, footN: -90, splayN: 84, shinSplayN: 0, hipF: 0, kneeF: 90, footF: -90 },
  }),
  bw_russian_twist: T({
    cam: { yaw: 40, pitch: 10 },
    rig: { root: 'pelvis', legs: 'fk', arms: 'fk' },
    // Sitting back with the feet off the floor, hands swung from one side of the body to the other.
    a: { px: -0.05, py: 0.12, trunk: -38, head: 8, hipN: 110, kneeN: 35, footN: 0, hipF: 110, kneeF: 35, footF: 0, shN: 80, elN: 20, abdN: -34, shF: 80, elF: 20, abdF: 34 },
    b: { px: -0.05, py: 0.12, trunk: -38, head: 8, hipN: 110, kneeN: 35, footN: 0, hipF: 110, kneeF: 35, footF: 0, shN: 80, elN: 20, abdN: 34, shF: 80, elF: 20, abdF: -34 },
    tempo: { con: 0.9, top: 0.1, ecc: 0.9, pause: 0.1 }, slow: { con: 1.4, top: 0.2, ecc: 1.4, pause: 0.2 },
  }),
  bw_slider_leg_curl: T({
    cam: { yaw: 24, pitch: 12 },
    // Hips up (a bridge), heels sliding in on a towel.
    rig: { root: 'chest', legs: 'ik', feet: { x: 0.75, z: 0.12, kneesOut: 0.3, angle: 140 }, arms: 'fk' },
    a: { px: -0.5, py: 0.15, trunk: -120, head: 22, sh: 82, el: 0, abd: 18, fxN: 0.75, fxF: 0.75 },
    b: { px: -0.5, py: 0.15, trunk: -120, head: 22, sh: 82, el: 0, abd: 18, fxN: 0.25, fxF: 0.25 },
    first: 'down',
  }),
  bw_reverse_nordic: T({
    cam: { yaw: 24, pitch: 9 },
    // Kneeling tall, then leaning back with a straight line from the knees to the head.
    rig: { root: 'plank', pivot: { at: [0.2, 0.07], joint: 'knee', dir: -1 }, feet: { z: 0.1, angle: 175 }, arms: 'fk' },
    a: { line: 88, head: 0, sh: 70, el: 20, abd: 14 },
    b: { line: 52, head: 8, sh: 90, el: 0, abd: 14 },
    first: 'down',
    tempo: { ecc: 3, pause: 0.4, con: 1.4, top: 0.6 },
  }),
  bw_sissy_squat: T({
    cam: { yaw: 22 },
    // Knees travel forward, heels come up and the body leans back.
    rig: STAND({ feet: { x: 0, z: 0.14, kneesOut: 0.1 } }),
    a: { px: 0.03, py: 0.93, trunk: 2, head: 0, heel: 0, sh: 20, el: 10, abd: 8 },
    b: { px: 0.15, py: 0.62, trunk: -32, head: 10, heel: 0.12, sh: 88, el: 0, abd: 10 },
    first: 'down',
  }),

  // ---------------- lunges and bands ----------------
  // Frontal-plane moves: the camera swings round so the sideways travel reads.
  lunge_lateral: T({
    cam: { yaw: 56, pitch: 8 },
    hold: 'goblet',
    rig: STAND({ feet: { x: 0, z: 0.13, kneesOut: 0.4 } }),
    a: { px: 0, py: 0.93, pz: 0, trunk: 3, head: 0, fzN: 0.13, fzF: 0.13, sh: 10, el: 140, abd: 22, wrist: 20 },
    b: { px: -0.04, py: 0.55, pz: -0.45, trunk: 28, head: -12, fzN: 0.7, fzF: 0.38, sh: 30, el: 128, abd: 24, wrist: 20 },
    first: 'down',
  }),
  band_lateral_walk: T({
    cam: { yaw: 54, pitch: 8 },
    gear: ['loop'],
    loop: { a: 'thighN', b: 'thighF' },
    rig: STAND({ feet: { x: 0, z: 0.2, kneesOut: 0.4 } }),
    // Half squat, band above the knees; the near foot steps out and the far foot follows.
    a: { px: -0.04, py: 0.76, pz: 0, trunk: 16, head: 0, fzN: 0.2, fzF: 0.2, fyN: 0, sh: 40, el: 60, abd: 10 },
    m: { fyN: 0.07, fzN: 0.36 },
    b: { px: -0.04, py: 0.76, pz: -0.12, trunk: 16, head: 0, fzN: 0.46, fzF: 0.16, fyN: 0, sh: 40, el: 60, abd: 10 },
    tempo: { con: 0.7, top: 0.2, ecc: 0.7, pause: 0.2 }, slow: { con: 1.1, top: 0.3, ecc: 1.1, pause: 0.3 },
  }),
  // Standing on the far leg, the near leg swings out (abduction) or in (adduction) against a band round the ankles.
  band_hip_abduction: T({
    cam: { yaw: 52, pitch: 8 },
    gear: ['loop'],
    loop: { a: 'ankleN', b: 'ankleF' },
    rig: { root: 'pelvis', legs: 'ik', legsN: 'fk', feet: { x: 0, z: 0.12, kneesOut: 0.2 }, arms: 'fk' },
    a: { px: 0, py: 0.95, trunk: 0, head: 0, hipN: 0, kneeN: 0, footN: 0, splayN: 4, shinSplayN: 4, sh: 10, el: 10, abd: 38 },
    b: { px: 0, py: 0.95, trunk: 0, head: 0, hipN: 0, kneeN: 0, footN: 0, splayN: 36, shinSplayN: 36, sh: 10, el: 10, abd: 38 },
    tempo: { con: 1, top: 0.4, ecc: 1.6, pause: 0.3 }, slow: { con: 1.4, top: 0.6, ecc: 2.4, pause: 0.4 },
  }),
  band_hip_adduction: T({
    cam: { yaw: 52, pitch: 8 },
    gear: ['loop'],
    loop: { a: 'ankleN', b: 'ankleF' },
    rig: { root: 'pelvis', legs: 'ik', legsN: 'fk', feet: { x: 0, z: 0.12, kneesOut: 0.2 }, arms: 'fk' },
    a: { px: 0, py: 0.95, trunk: 0, head: 0, hipN: 0, kneeN: 0, footN: 0, splayN: 34, shinSplayN: 34, sh: 10, el: 10, abd: 38 },
    b: { px: 0, py: 0.95, trunk: 0, head: 0, hipN: 0, kneeN: 0, footN: 0, splayN: -4, shinSplayN: -4, sh: 10, el: 10, abd: 38 },
    tempo: { con: 1, top: 0.4, ecc: 1.6, pause: 0.3 }, slow: { con: 1.4, top: 0.6, ecc: 2.4, pause: 0.4 },
  }),

  // ---------------- mobility ----------------
  // Cat and cow: the torso is one stiff bar here, so it tilts about the hips while the head tucks or lifts.
  cat_cow: T({
    cam: { yaw: 40, pitch: 10 },
    rig: QUAD({ legsN: 'fk', legsF: 'fk' }),
    a: { line: 90, pike: -98, head: 42, hipN: 0, kneeN: 90, footN: -90, hipF: 0, kneeF: 90, footF: -90 },
    b: { line: 90, pike: -82, head: -30, hipN: 0, kneeN: 90, footN: -90, hipF: 0, kneeF: 90, footF: -90 },
    tempo: { con: 2.2, top: 0.4, ecc: 2.2, pause: 0.4 }, slow: { con: 3, top: 0.6, ecc: 3, pause: 0.6 },
  }),
  // Stand tall, fold over, walk the hands out to a plank, and back.
  inchworm: T({
    cam: { yaw: 24, pitch: 9 },
    rig: { root: 'plank', pivot: { at: [-0.5, 0.09], joint: 'ankle' }, feet: { z: 0.1, angle: 80 }, arms: 'ik', hands: { x: 0.15, y: 0.03 }, grip: 0.2, pole: [-0.5, 0.3, 0.5] },
    a: { line: 82, pike: -142, head: 20, hx: 0.15 },
    m: { line: 50, pike: -75, head: 14, hx: 0.6 },
    b: { line: 12, pike: 0, head: 6, hx: 1.0 },
    tempo: { con: 1.6, top: 0.5, ecc: 1.6, pause: 0.5 }, slow: { con: 2.4, top: 0.8, ecc: 2.4, pause: 0.8 },
  }),
  // A long lunge with both hands down, then the near arm reaches up and back while the far hand props on the knee.
  worlds_greatest_stretch: T({
    cam: { yaw: 26, pitch: 9 },
    rig: { ...STAND({ feetN: { x: 0.55, z: 0.13, kneesOut: 0.15 }, feetF: { x: -0.78, z: 0.12, kneesOut: 0.05, poleY: -0.4 } }), arms: 'ik', hands: { x: 0.5, y: 0.03 }, grip: 0.2, pole: [-0.4, 0.3, 0.6] },
    a: { px: -0.12, py: 0.45, trunk: 74, head: -10, heelF: 0.1, hxN: 0.5, hyN: 0.03, hxF: 0.5, hyF: 0.03 },
    b: { px: -0.1, py: 0.5, trunk: 55, head: -6, heelF: 0.1, hxN: 0.3, hyN: 1.3, hxF: 0.5, hyF: 0.42 },
    tempo: { con: 1.6, top: 0.8, ecc: 1.6, pause: 0.6 }, slow: { con: 2.4, top: 1, ecc: 2.4, pause: 0.8 },
  }),
  // Half-kneeling, the back knee on the floor: tuck the hips forward and reach up.
  kneeling_hip_flexor_stretch: T({
    cam: { yaw: 24 },
    rig: { root: 'pelvis', legs: 'ik', legsF: 'fk', feetN: { x: 0.5, z: 0.12, kneesOut: 0.1 }, arms: 'fk' },
    a: { px: -0.06, py: 0.5, trunk: 2, head: 0, hipF: -8, kneeF: 82, footF: -90, sh: 20, el: 100, abd: 22 },
    b: { px: 0.12, py: 0.5, trunk: -6, head: 0, hipF: -8, kneeF: 82, footF: -90, sh: 168, el: 4, abd: 14 },
    tempo: HOLD, slow: HOLD,
  }),
  // Seated with both knees bent at 90°: front shin across, back shin out behind; lean over the front one.
  hip_90_90: T({
    cam: { yaw: 36, pitch: 12 },
    rig: { root: 'pelvis', legs: 'fk', arms: 'fk' },
    a: { px: -0.05, py: 0.16, trunk: 0, head: 0, hipN: 80, kneeN: 90, footN: 20, splayN: 35, shinSplayN: -85, hipF: 15, kneeF: 105, footF: -90, splayF: 75, shinSplayF: 0, shN: 40, elN: 10, shF: 40, elF: 10, abd: 10 },
    b: { px: -0.05, py: 0.16, trunk: 28, head: 8, hipN: 80, kneeN: 90, footN: 20, splayN: 35, shinSplayN: -85, hipF: 15, kneeF: 105, footF: -90, splayF: 75, shinSplayF: 0, shN: 72, elN: 10, shF: 72, elF: 10, abd: 10 },
    tempo: HOLD, slow: HOLD,
  }),
  // On your side, knees bent and stacked; the top arm opens like a book from in front of you to behind you.
  thoracic_open_book: T({
    cam: { yaw: 58, pitch: 12 },
    rig: SIDE(0.26, { arms: 'fk', legsN: 'fk', legsF: 'fk' }),
    a: { line: 0, head: 0, shN: 0, elN: 0, abdN: -35, shF: 0, elF: 0, abdF: 0, foreAbd: 1, hipN: 0, kneeN: 90, footN: -90, hipF: 0, kneeF: 90, footF: -90 },
    m: { abdN: 90 },
    b: { line: 0, head: 0, shN: 0, elN: 0, abdN: 180, shF: 0, elF: 0, abdF: 0, foreAbd: 1, hipN: 0, kneeN: 90, footN: -90, hipF: 0, kneeF: 90, footF: -90 },
    tempo: { con: 1.8, top: 0.6, ecc: 1.8, pause: 0.4 }, slow: { con: 2.6, top: 0.8, ecc: 2.6, pause: 0.6 },
  }),

  // ---------------- warm-up cardio ----------------
  high_knees: T({
    cam: { yaw: 26 },
    rig: { root: 'pelvis', legs: 'fk', arms: 'fk' },
    // One knee drives up while the other leg stands tall; the arms pump the opposite way.
    a: { px: 0.02, py: 0.95, trunk: 4, head: 0, hipN: 98, kneeN: 98, footN: 20, hipF: 0, kneeF: 0, footF: 0, shN: -40, elN: 100, shF: 62, elF: 70, abd: 6 },
    m: { py: 1.0 },
    b: { px: 0.02, py: 0.95, trunk: 4, head: 0, hipN: 0, kneeN: 0, footN: 0, hipF: 98, kneeF: 98, footF: 20, shN: 62, elN: 70, shF: -40, elF: 100, abd: 6 },
    tempo: FAST, slow: { con: 0.5, top: 0.05, ecc: 0.5, pause: 0.05 },
  }),
  // Stand, drop to a squat and hands down, jump the feet back to a plank, and back up with a hop.
  burpee: T({
    cam: { yaw: 24, pitch: 8 },
    rig: { root: 'pelvis', legs: 'ik', feet: { x: 0, z: 0.14, kneesOut: 0.3 }, arms: 'ik', hands: { x: 0.45, y: 0.03 }, grip: 0.2, pole: [-0.4, 0.2, 0.5] },
    a: { px: 0.02, py: 0.93, trunk: 2, head: 0, air: 0.14, hx: 0.1, hy: 2.0, fxN: 0, fxF: 0, heel: 0 },
    m: { px: -0.05, py: 0.42, trunk: 70, head: -20, air: 0, hx: 0.45, hy: 0.03, fxN: 0, fxF: 0, heel: 0 },
    b: { px: 0.1, py: 0.3, trunk: 80, head: -10, air: 0, hx: 0.62, hy: 0.03, fxN: -0.8, fxF: -0.8, heel: 0.14 },
    tempo: { con: 0.7, top: 0.25, ecc: 0.7, pause: 0.25 }, slow: { con: 1, top: 0.4, ecc: 1, pause: 0.4 },
  }),
  // Hands and feet only, knees a hand's width off the floor; opposite hand and foot step together.
  bear_crawl: T({
    cam: { yaw: 30, pitch: 9 },
    rig: { root: 'pelvis', legs: 'ik', feet: { x: -0.42, z: 0.13, kneesOut: 0.3 }, arms: 'ik', hands: { x: 0.5, y: 0.03 }, grip: 0.2, pole: [-0.4, 0.2, 0.5] },
    a: { px: 0, py: 0.52, trunk: 86, head: -30, hxN: 0.7, hxF: 0.35, fxN: -0.62, fxF: -0.2 },
    b: { px: 0, py: 0.52, trunk: 86, head: -30, hxN: 0.35, hxF: 0.7, fxN: -0.2, fxF: -0.62 },
    tempo: { con: 0.7, top: 0.1, ecc: 0.7, pause: 0.1 }, slow: { con: 1, top: 0.2, ecc: 1, pause: 0.2 },
  }),
  // A big sideways bound from one foot to the other; the trailing leg sweeps behind.
  skater_hops: T({
    cam: { yaw: 56, pitch: 8 },
    rig: { root: 'pelvis', legs: 'fk', arms: 'fk' },
    a: { px: 0.02, py: 0.9, pz: -0.45, trunk: 18, head: -6, hipN: 25, kneeN: 45, footN: 20, splayN: 4, hipF: -35, kneeF: 75, footF: 0, splayF: -25, shN: -20, elN: 70, shF: 50, elF: 60, abd: 12 },
    m: { py: 1.04, pz: 0 },
    b: { px: 0.02, py: 0.9, pz: 0.45, trunk: 18, head: -6, hipN: -35, kneeN: 75, footN: 0, splayN: -25, hipF: 25, kneeF: 45, footF: 20, splayF: 4, shN: 50, elN: 60, shF: -20, elF: 70, abd: 12 },
    tempo: { con: 0.5, top: 0.15, ecc: 0.5, pause: 0.15 }, slow: { con: 0.8, top: 0.25, ecc: 0.8, pause: 0.25 },
  }),
};

export const HOME_MAP = {
  table_row_straight_legs: 'table_row_straight_legs',
  table_row_bent_knees: 'table_row_bent_knees',
  table_row_feet_raised: 'table_row_feet_raised',
  doorframe_row: 'doorframe_row',
  wall_triceps_extension: 'wall_triceps_extension',
  table_triceps_extension: 'table_triceps_extension',
  towel_lat_pulldown_iso: 'towel_lat_pulldown_iso',
  sliding_floor_pulldown: 'sliding_floor_pulldown',
  towel_pull_apart: 'towel_pull_apart',
  towel_iso_curl: 'towel_iso_curl',
  towel_lateral_raise_iso: 'towel_lateral_raise_iso',
  towel_slider_fly: 'towel_slider_fly',
  bw_superman: 'bw_superman',
  bw_prone_ytw: 'bw_prone_ytw',
  reverse_snow_angel: 'reverse_snow_angel',
  side_plank: 'side_plank',
  bw_copenhagen_plank: 'bw_copenhagen_plank',
  bw_side_lying_leg_raise: 'bw_side_lying_leg_raise',
  bw_fire_hydrant: 'bw_fire_hydrant',
  bw_russian_twist: 'bw_russian_twist',
  bw_slider_leg_curl: 'bw_slider_leg_curl',
  bw_reverse_nordic: 'bw_reverse_nordic',
  bw_sissy_squat: 'bw_sissy_squat',
  bw_lateral_lunge: 'lunge_lateral',
  db_lateral_lunge: 'lunge_lateral',
  band_lateral_walk: 'band_lateral_walk',
  band_hip_abduction: 'band_hip_abduction',
  band_hip_adduction: 'band_hip_adduction',
  cat_cow: 'cat_cow',
  inchworm: 'inchworm',
  worlds_greatest_stretch: 'worlds_greatest_stretch',
  kneeling_hip_flexor_stretch: 'kneeling_hip_flexor_stretch',
  hip_90_90: 'hip_90_90',
  thoracic_open_book: 'thoracic_open_book',
  high_knees: 'high_knees',
  burpee: 'burpee',
  bear_crawl: 'bear_crawl',
  skater_hops: 'skater_hops',
};
