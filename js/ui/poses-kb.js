// Demo figures for the home gym (v0.12.2): kettlebell, dumbbell and band moves. The windmill (needs a side hinge),
// fire hydrant and slider fly (three tries) stay unmapped: a wrong demo is worse than none. Same a/m/b/tempo model as poses-lib.js.
//
// A kettlebell is drawn at the near hand from the exercise's load. Param `kb` (degrees: 0 hangs under the hand,
// 90 points forward, 180 up) says where its body lies from the handle, so in the rack it sits in front of the
// forearm and overhead it sits behind the wrist, never through the arm. Without `kb` it follows the forearm.
// Param `lean` tips the trunk sideways (side bends). Floor moves set `floor: true` for an explicit floor line.
import { T, STAND } from './poses-lib.js';

const BALLISTIC = { con: 0.55, top: 0.25, ecc: 0.9, pause: 0.25 };
const BALLISTIC_SLOW = { con: 0.9, top: 0.5, ecc: 1.4, pause: 0.5 };
// The same hinge opens the clean, the snatch and the high pull: hips back, back flat, the bell swung back
// between the legs. The free arm hangs loose, a little out from the side.
const HINGE = { px: -0.14, py: 0.74, trunk: 62, head: -30, sh: -28, el: 0, abd: -6, kb: -28 };
const FREE_ARM = { shF: 0, elF: 0, abdF: 22 };
const KB_FEET = STAND({ feet: { x: 0, z: 0.2, kneesOut: 0.45 } });

export const KB = {
  // ---------------- kettlebell ----------------
  // Upside-down bell held by the horns, circled round the head: front of the face, beside the near ear, behind the neck.
  kb_halo: T({
    cam: { yaw: 66, pitch: 8 },
    rig: { ...STAND({ feet: { x: 0, z: 0.13, kneesOut: 0.2 } }), arms: 'ik', hands: { x: 0.22, y: 1.5 }, grip: 0.04, pole: [-0.2, -0.7, 0.8] },
    a: { px: 0, py: 0.93, trunk: 0, head: 0, hx: 0.24, hy: 1.42, hzN: 0.04, hzF: 0.04, kb: 180 },
    m: { hx: 0.0, hy: 1.55, hzN: 0.24, hzF: -0.16, kb: 180 },
    b: { px: 0, py: 0.93, trunk: 0, head: 0, hx: -0.2, hy: 1.46, hzN: 0.04, hzF: 0.04, kb: 180 },
    tempo: { con: 1.6, top: 0.2, ecc: 1.6, pause: 0.2 }, slow: { con: 2.4, top: 0.3, ecc: 2.4, pause: 0.3 },
  }),
  // Hinge, swing the bell back; pull it in close past the ribs; flip it into the rack at the chest.
  kb_clean: T({
    cam: { yaw: 24 },
    kbOrient: 'arm',
    rig: KB_FEET,
    a: { ...HINGE, ...FREE_ARM },
    // Hips snapped through: the bell skims the thighs, arm still long, close to the body.
    m: { px: -0.02, py: 0.92, trunk: 10, head: -4, sh: 0, el: 25, abd: 4, kb: 10 },
    b: { px: 0.02, py: 0.93, trunk: -2, head: 0, sh: 8, el: 150, abd: 4, kb: 90 },
    tempo: BALLISTIC, slow: BALLISTIC_SLOW,
  }),
  // Same hinge, but the bell keeps travelling: up past the face, then punched up to a locked arm.
  kb_snatch: T({
    cam: { yaw: 24 },
    kbOrient: 'arm',
    rig: KB_FEET,
    a: { ...HINGE, ...FREE_ARM },
    m: { px: -0.01, py: 0.93, trunk: 4, head: -2, sh: 78, el: 98, abd: 12, kb: 100 },
    // 275° = -85°: the bell turns over the top of the hand (through 180°) and settles behind the wrist.
    b: { px: 0.02, py: 0.93, trunk: -1, head: -2, sh: 176, el: 4, abd: 8, kb: 275 },
    tempo: BALLISTIC, slow: BALLISTIC_SLOW,
  }),
  // Hinge, then the hips snap and the bell skims the thighs; the elbow leads it up to the chest, elbow high.
  kb_high_pull: T({
    cam: { yaw: 24 },
    kbOrient: 'arm',
    rig: KB_FEET,
    a: { ...HINGE, ...FREE_ARM, foreAbd: 0.5 },
    m: { px: -0.02, py: 0.9, trunk: 14, head: -4, sh: 2, el: 0, abd: 10, kb: 0 },
    b: { px: 0.02, py: 0.93, trunk: -2, head: 0, sh: 120, el: -140, abd: 45, foreAbd: -0.9, kb: 60 },
    tempo: BALLISTIC, slow: BALLISTIC_SLOW,
  }),
  // Seated and leaning back, feet off the floor, the bell swung from one hip to the other.
  kb_russian_twist: T({
    cam: { yaw: 40, pitch: 10 },
    floor: true,
    rig: { root: 'pelvis', legs: 'fk', arms: 'ik', hands: { x: 0.0, y: 0.46 }, grip: 0.04, pole: [-0.2, -0.7, 0.8] },
    a: { px: -0.05, py: 0.12, trunk: -38, head: 8, hipN: 110, kneeN: 35, footN: 0, hipF: 110, kneeF: 35, footF: 0, hzN: 0.34, hzF: -0.26 },
    b: { px: -0.05, py: 0.12, trunk: -38, head: 8, hipN: 110, kneeN: 35, footN: 0, hipF: 110, kneeF: 35, footF: 0, hzN: -0.26, hzF: 0.34 },
    tempo: { con: 0.9, top: 0.1, ecc: 0.9, pause: 0.1 }, slow: { con: 1.4, top: 0.2, ecc: 1.4, pause: 0.2 },
  }),

  // ---------------- dumbbell ----------------
  // High plank on the dumbbells, feet wide; the near dumbbell rows to the ribs while the hips stay square.
  db_renegade_row: T({
    cam: { yaw: 30, pitch: 10 },
    both: true,
    floor: true,
    rig: { root: 'plank', pivot: { at: [-0.95, 0.09], joint: 'ankle' }, feet: { z: 0.2, angle: 8 }, arms: 'ik', hands: { x: 0.45, y: 0.07 }, grip: 0.2, pole: [-0.8, 0.6, 0.3] },
    a: { line: 24, head: 6, hxN: 0.45, hyN: 0.07 },
    b: { line: 24, head: 6, hxN: 0.1, hyN: 0.5 },
  }),
  // Sitting on the floor, legs straight out, pressing overhead with no help from the legs or the back.
  db_z_press: T({
    cam: { yaw: 24, pitch: 8 },
    both: true,
    floor: true,
    rig: { root: 'pelvis', legs: 'fk', arms: 'fk' },
    a: { px: -0.05, py: 0.1, trunk: -2, head: 0, hipN: 90, kneeN: 0, footN: 0, hipF: 90, kneeF: 0, footF: 0, sh: 15, el: 140, abd: 30, wrist: 50 },
    b: { px: -0.05, py: 0.1, trunk: 0, head: 0, hipN: 90, kneeN: 0, footN: 0, hipF: 90, kneeF: 0, footF: 0, sh: 176, el: 4, abd: 12, wrist: 0 },
    lag: { head: 0.1 },
  }),
  // One dumbbell in the near hand, the free hand on the hip; the trunk bends straight sideways toward the weight.
  db_side_bend: T({
    cam: { yaw: 70, pitch: 6 },
    rig: { ...STAND({ feet: { x: 0, z: 0.14, kneesOut: 0.2 } }), armsF: 'ik', handsF: { x: 0, y: 0.99, z: 0.14 }, pole: [0, -0.3, 1] },
    // The arm angles in toward the leg as the shoulder drops, so the weight slides down the thigh.
    a: { px: 0, py: 0.93, trunk: 0, head: 0, lean: 0, shN: 0, elN: 0, abdN: 2 },
    b: { px: 0, py: 0.93, trunk: 0, head: 0, lean: -26, shN: 0, elN: 0, abdN: -16 },
    first: 'down',
    tempo: { ecc: 1.8, pause: 0.3, con: 1.4, top: 0.4 }, slow: { ecc: 3, pause: 0.5, con: 2, top: 0.6 },
  }),

  // ---------------- band ----------------
  // Wide grip, straight arms: from in front of the thighs, up and over the head, down behind the hips, and back.
  band_shoulder_dislocate: T({
    cam: { yaw: 62, pitch: 6 },
    gear: ['loop'],
    loop: { a: 'gripN', b: 'gripF' },
    rig: STAND({ feet: { x: 0, z: 0.13, kneesOut: 0.2 } }),
    a: { px: 0, py: 0.93, trunk: 0, head: 0, sh: 18, el: 0, abd: 36, foreAbd: 1 },
    m: { sh: 180 },
    b: { px: 0, py: 0.93, trunk: 0, head: 0, sh: 338, el: 0, abd: 36, foreAbd: 1 },
    tempo: { con: 1.8, top: 0.3, ecc: 1.8, pause: 0.3 }, slow: { con: 2.6, top: 0.4, ecc: 2.6, pause: 0.4 },
  }),
};

// Exercise id → template name. Moves left out are listed in the CHANGELOG.
export const KB_MAP = {
  kb_halo: 'kb_halo',
  kb_clean: 'kb_clean',
  kb_snatch: 'kb_snatch',
  kb_high_pull: 'kb_high_pull',
  kb_russian_twist: 'kb_russian_twist',
  db_renegade_row: 'db_renegade_row',
  db_z_press: 'db_z_press',
  db_side_bend: 'db_side_bend',
  band_shoulder_dislocate: 'band_shoulder_dislocate',
};
