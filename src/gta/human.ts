import * as THREE from "three";
import { faces, type Look } from "./faces";

/**
 * A zkSNARK as a person (src/gta): its head in 3D voxels (faces.ts) on a body of human build, about
 * 1.72 m — hips, a chest in its top's colour with the hood down the back, arms that bend at the elbow
 * with hands in its skin, legs that bend at the knee, shoes. A skeleton of 15 joints posed by one
 * function for everyone (you, the passers-by, the other players): the walk and the run (the knees
 * and elbows working, the hips bobbing and turning), standing about, a fighting guard, punches,
 * being hit, going down and getting up, sitting, riding, and the gestures (talking with the hands,
 * waving, cheering, a phone at the ear, filming).
 *
 * Every body part is a box of one colour: the passers-by draw all of theirs in one instanced draw
 * (people3d.ts); a single figure (`Human`) has its own.
 */

// ---- the skeleton --------------------------------------------------------------------------------

export const J = { hips: 0, chest: 1, neck: 2, shR: 3, elR: 4, wrR: 5, shL: 6, elL: 7, wrL: 8, hipR: 9, knR: 10, anR: 11, hipL: 12, knL: 13, anL: 14 } as const;
const PARENT = [-1, 0, 1, 1, 3, 4, 1, 6, 7, 0, 9, 10, 0, 12, 13];
export const JOINTS = 15;

const THIGH = 0.41,
  SHIN = 0.39,
  ANKLE = 0.075;
const HIP_Y = THIGH + SHIN + ANKLE;
const WAIST = 0.1;
const SPINE = 0.44;
const UPPER = 0.29,
  FORE = 0.25;

/** Body parts: joint, size (w, h, d), centre in the joint's frame, colour slot. */
type Slot = "top" | "hood" | "skin" | "legs" | "shoes" | "sole" | "belt";
interface Part {
  j: number;
  s: [number, number, number];
  c: [number, number, number];
  col: Slot;
  /** Its width follows the build. */
  wide?: boolean;
}
export const PARTS: Part[] = [
  { j: J.hips, s: [0.33, 0.2, 0.21], c: [0, 0.03, 0], col: "legs", wide: true },
  { j: J.hips, s: [0.335, 0.045, 0.215], c: [0, 0.12, 0], col: "belt", wide: true },
  { j: J.chest, s: [0.36, 0.25, 0.22], c: [0, 0.12, 0], col: "top", wide: true },
  { j: J.chest, s: [0.41, 0.22, 0.235], c: [0, 0.33, 0], col: "top", wide: true },
  { j: J.chest, s: [0.25, 0.1, 0.09], c: [0, 0.42, -0.1], col: "hood" },
  { j: J.shR, s: [0.115, 0.3, 0.12], c: [0, -0.125, 0], col: "top" },
  { j: J.shL, s: [0.115, 0.3, 0.12], c: [0, -0.125, 0], col: "top" },
  { j: J.elR, s: [0.1, 0.235, 0.105], c: [0, -0.11, 0], col: "top" },
  { j: J.elL, s: [0.1, 0.235, 0.105], c: [0, -0.11, 0], col: "top" },
  { j: J.wrR, s: [0.085, 0.105, 0.075], c: [0, -0.04, 0.005], col: "skin" },
  { j: J.wrL, s: [0.085, 0.105, 0.075], c: [0, -0.04, 0.005], col: "skin" },
  { j: J.hipR, s: [0.15, 0.44, 0.165], c: [0, -0.2, 0], col: "legs" },
  { j: J.hipL, s: [0.15, 0.44, 0.165], c: [0, -0.2, 0], col: "legs" },
  { j: J.knR, s: [0.125, 0.4, 0.135], c: [0, -0.19, 0], col: "legs" },
  { j: J.knL, s: [0.125, 0.4, 0.135], c: [0, -0.19, 0], col: "legs" },
  { j: J.anR, s: [0.135, 0.065, 0.27], c: [0, -0.025, 0.045], col: "shoes" },
  { j: J.anL, s: [0.135, 0.065, 0.27], c: [0, -0.025, 0.045], col: "shoes" },
  { j: J.anR, s: [0.14, 0.025, 0.28], c: [0, -0.065, 0.045], col: "sole" },
  { j: J.anL, s: [0.14, 0.025, 0.28], c: [0, -0.065, 0.045], col: "sole" },
];
export const NPARTS = PARTS.length;

/** What a body is doing: everything the pose is made from. */
export interface Act {
  /** Seconds (for breathing, gestures). */
  t: number;
  /** Stride phase 0…1, ground speed (m/s). */
  phase: number;
  speed: number;
  /** 0 on the ground … 1 in the air. */
  air: number;
  /** Fists up, 0…1. */
  guard: number;
  /** A punch: −1 none, else 0…1 through it; −1 its own right arm, 1 its left. */
  punch: number;
  punchSide: number;
  /** Hit: seconds since (large: long ago); 1 from the front, −1 from behind. */
  hit: number;
  hitFrom: number;
  /** Down: 0 standing … 1 flat on its back (or its side: `downSide`). */
  down: number;
  downSide: number;
  /** Sitting: the seat's height over the feet (0 standing). */
  seat: number;
  /** On a bike's saddle. */
  ride: boolean;
  gesture: "talk" | "wave" | "cheer" | "phone" | "film" | "point" | "hands" | null;
  /** The head turned (rad), toward something it looks at. */
  lookYaw: number;
}

export function newAct(): Act {
  return { t: Math.random() * 10, phase: Math.random(), speed: 0, air: 0, guard: 0, punch: -1, punchSide: -1, hit: 9, hitFrom: 1, down: 0, downSide: 0, seat: 0, ride: false, gesture: null, lookYaw: 0 };
}

/** One frame of the stride: the phase moves with the ground covered (longer strides running). */
export function stride(a: Act, dt: number, speed: number) {
  a.t += dt;
  a.speed += (speed - a.speed) * Math.min(1, dt * 8);
  const len = 1.25 + 0.27 * Math.min(8, a.speed);
  a.phase = (a.phase + (a.speed / len) * dt) % 1;
}

// scratch
const e = new THREE.Euler();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const local = new THREE.Matrix4();
const rot: [number, number, number][] = Array.from({ length: JOINTS }, () => [0, 0, 0]);
const off: [number, number, number][] = Array.from({ length: JOINTS }, () => [0, 0, 0]);

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * The joints' matrices (relative to the feet, facing +z) for this act, into `out` (15). Rotations:
 * +x swings a hanging limb back (a knee bends +, an elbow −), +y turns left, +z rolls toward +x.
 */
export function pose(a: Act, look: Look, out: THREE.Matrix4[]) {
  const bw = look.bw;
  for (let i = 0; i < JOINTS; i++) {
    rot[i][0] = rot[i][1] = rot[i][2] = 0;
  }
  // where the joints sit
  off[J.hips] = [0, HIP_Y, 0];
  off[J.chest] = [0, WAIST, 0];
  off[J.neck] = [0, SPINE, 0];
  off[J.shR] = [-0.235 * bw, 0.415, 0];
  off[J.shL] = [0.235 * bw, 0.415, 0];
  off[J.elR] = off[J.elL] = [0, -UPPER, 0];
  off[J.wrR] = off[J.wrL] = [0, -FORE, 0];
  off[J.hipR] = [-0.092 * bw, 0, 0];
  off[J.hipL] = [0.092 * bw, 0, 0];
  off[J.knR] = off[J.knL] = [0, -THIGH, 0];
  off[J.anR] = off[J.anL] = [0, -SHIN, 0];

  const t = a.t;
  const sp = a.speed;
  const w = clamp01(sp / 1.1);
  const r = clamp01((sp - 2.3) / 2.6);
  const ph = a.phase * Math.PI * 2;
  // ---- the legs and the hips: walking, running (left leg at ph, right at ph + π)
  const A = lerp(0.4, 0.78, r) * w;
  const K = lerp(0.6, 1.5, r) * w;
  let hipY = HIP_Y;
  const leg = (hip: number, knee: number, ank: number, p: number) => {
    const th = -A * Math.sin(p);
    const swing = Math.max(0, Math.cos(p));
    const kn = 0.06 + K * Math.pow(swing, 1.3) + 0.22 * r * Math.max(0, -Math.cos(p)) * w;
    rot[hip][0] = th;
    rot[knee][0] = kn;
    // the foot kept about level, the toes pointed a little in the swing
    rot[ank][0] = -(th + kn) * 0.75 + 0.15 * swing * w;
  };
  leg(J.hipL, J.knL, J.anL, ph);
  leg(J.hipR, J.knR, J.anR, ph + Math.PI);
  hipY -= lerp(0.028, 0.06, r) * w * Math.abs(Math.sin(ph)) + 0.03 * r;
  rot[J.hips][1] = 0.1 * w * Math.sin(ph);
  rot[J.chest][1] = -0.17 * w * Math.sin(ph);
  rot[J.hips][0] = 0.03 * w + 0.17 * r;
  rot[J.chest][0] = 0.04 * r;
  // standing still: a breath, the weight shifting
  const still = 1 - w;
  rot[J.chest][0] += still * 0.018 * Math.sin(t * 1.7);
  rot[J.hips][2] = still * 0.02 * Math.sin(t * 0.45);
  // ---- the arms swinging (opposite the legs), the elbows bent more running
  const AA = lerp(0.36, 0.78, r) * w;
  const elb = -(0.14 + lerp(0.12, 1.25, r) * w);
  const arm = (sh: number, el: number, side: number, p: number) => {
    rot[sh][0] = AA * Math.sin(p) + still * 0.03 * Math.sin(t * 1.3 + side);
    rot[sh][2] = side * (0.07 + 0.05 * r);
    rot[el][0] = elb - 0.3 * w * Math.max(0, -Math.sin(p));
  };
  arm(J.shL, J.elL, 1, ph);
  arm(J.shR, J.elR, -1, ph + Math.PI);
  // ---- in the air: knees up, arms out
  if (a.air > 0.01) {
    const k = a.air;
    for (const [hp, kn] of [
      [J.hipL, J.knL],
      [J.hipR, J.knR],
    ]) {
      rot[hp][0] = lerp(rot[hp][0], -0.55, k);
      rot[kn][0] = lerp(rot[kn][0], 1.0, k);
    }
    rot[J.hipR][0] += 0.25 * k;
    rot[J.shL][0] = lerp(rot[J.shL][0], -0.6, k);
    rot[J.shR][0] = lerp(rot[J.shR][0], -0.6, k);
    rot[J.shL][2] += 0.35 * k;
    rot[J.shR][2] -= 0.35 * k;
  }
  // ---- sitting, riding
  if (a.seat > 0 || a.ride) {
    for (const [hp, kn, an, side] of [
      [J.hipL, J.knL, J.anL, 1],
      [J.hipR, J.knR, J.anR, -1],
    ]) {
      rot[hp][0] = a.ride ? -1.15 : -1.5;
      rot[hp][2] = a.ride ? side * 0.22 : side * 0.05;
      rot[kn][0] = a.ride ? 1.35 : 1.5;
      rot[an][0] = 0;
    }
    rot[J.hips][1] = rot[J.chest][1] = 0;
    if (a.ride) {
      rot[J.hips][0] = 0.32;
      rot[J.shL][0] = rot[J.shR][0] = -1.2;
      rot[J.elL][0] = rot[J.elR][0] = -0.35;
      rot[J.shL][2] = -0.05;
      rot[J.shR][2] = 0.05;
      hipY = 0.1;
    } else {
      rot[J.hips][0] = 0;
      rot[J.shL][0] = rot[J.shR][0] = -0.25;
      rot[J.elL][0] = rot[J.elR][0] = -0.7;
      hipY = a.seat + 0.07;
    }
  }
  // ---- the guard: fists up by the chin, side on, knees soft, a little bounce
  if (a.guard > 0.01) {
    const g = smooth(clamp01(a.guard));
    const set = (j: number, ax: number, val: number) => (rot[j][ax] = lerp(rot[j][ax], val, g));
    set(J.shL, 0, -0.95);
    set(J.shR, 0, -0.85);
    set(J.elL, 0, -2.05);
    set(J.elR, 0, -2.15);
    set(J.shL, 2, -0.12);
    set(J.shR, 2, 0.12);
    if (w < 0.3) {
      set(J.hipL, 0, -0.28);
      set(J.knL, 0, 0.32);
      set(J.hipR, 0, 0.18);
      set(J.knR, 0, 0.36);
      set(J.anL, 0, -0.04);
      set(J.anR, 0, -0.5);
      set(J.hips, 1, 0.28);
      set(J.chest, 1, -0.12);
      hipY -= 0.05 * g;
      hipY += 0.012 * Math.sin(t * 9) * g;
    }
    set(J.chest, 0, 0.1);
  }
  // ---- a punch: the arm out straight, the shoulder turned into it
  if (a.punch >= 0) {
    const p = a.punch;
    const ext = p < 0.32 ? smooth(p / 0.32) : 1 - smooth((p - 0.32) / 0.68);
    const s = a.punchSide;
    const [sh, el] = s < 0 ? [J.shR, J.elR] : [J.shL, J.elL];
    rot[sh][0] = lerp(rot[sh][0], -1.58, ext);
    rot[el][0] = lerp(rot[el][0], -0.06, ext);
    rot[sh][2] = lerp(rot[sh][2], -s * 0.12, ext);
    rot[J.chest][1] += -s * 0.5 * ext;
    rot[J.hips][1] += -s * 0.18 * ext;
    rot[J.chest][0] += 0.1 * ext;
  }
  // ---- the gestures
  const gs = a.gesture;
  if (gs && a.down < 0.05) {
    if (gs === "talk") {
      rot[J.shR][0] = -0.35 - 0.12 * Math.sin(t * 2.3);
      rot[J.elR][0] = -1.1 - 0.35 * Math.max(0, Math.sin(t * 5));
      rot[J.shL][0] = -0.25;
      rot[J.elL][0] = -0.9 - 0.3 * Math.max(0, Math.sin(t * 3.7 + 1));
      rot[J.shR][2] = -0.12;
      rot[J.shL][2] = 0.12;
    } else if (gs === "wave") {
      rot[J.shR][0] = -2.75;
      rot[J.shR][2] = -0.35 - 0.38 * Math.sin(t * 11);
      rot[J.elR][0] = -0.35;
    } else if (gs === "cheer") {
      rot[J.shR][0] = -2.9 + 0.15 * Math.sin(t * 12);
      rot[J.shL][0] = -2.9 + 0.15 * Math.sin(t * 12 + 1);
      rot[J.shR][2] = -0.35;
      rot[J.shL][2] = 0.35;
      rot[J.elR][0] = rot[J.elL][0] = -0.3;
      hipY += 0.04 * Math.max(0, Math.sin(t * 12));
    } else if (gs === "phone") {
      rot[J.shR][0] = -0.55;
      rot[J.shR][2] = 0.5;
      rot[J.elR][0] = -2.35;
    } else if (gs === "film") {
      rot[J.shR][0] = rot[J.shL][0] = -1.3;
      rot[J.elR][0] = rot[J.elL][0] = -0.85;
      rot[J.shR][2] = 0.38;
      rot[J.shL][2] = -0.38;
    } else if (gs === "point") {
      rot[J.shR][0] = -1.5;
      rot[J.elR][0] = -0.05;
      rot[J.shR][2] = 0;
    } else if (gs === "hands") {
      rot[J.shR][0] = rot[J.shL][0] = -2.6;
      rot[J.shR][2] = -0.55;
      rot[J.shL][2] = 0.55;
      rot[J.elR][0] = rot[J.elL][0] = -1.15;
    }
  }
  // ---- hit: thrown back from the waist, the head snapped, the arms flung
  if (a.hit < 0.7) {
    const h = a.hit;
    const amp = h < 0.08 ? h / 0.08 : Math.pow(1 - (h - 0.08) / 0.62, 2);
    rot[J.chest][0] += -0.42 * amp * a.hitFrom;
    rot[J.neck][0] += -0.4 * amp * a.hitFrom;
    rot[J.chest][2] += 0.12 * amp;
    rot[J.shR][0] += -0.5 * amp;
    rot[J.shL][0] += -0.35 * amp;
    rot[J.shR][2] -= 0.4 * amp;
    rot[J.shL][2] += 0.4 * amp;
  }
  // the head: looking at something, steadied against the lean
  rot[J.neck][0] += -(rot[J.hips][0] + rot[J.chest][0]) * 0.6;
  rot[J.neck][1] = a.lookYaw - rot[J.hips][1] - rot[J.chest][1];
  // ---- down: limbs loose, the whole body over about its feet
  const d = smooth(clamp01(a.down));
  if (d > 0) {
    rot[J.shR][2] = lerp(rot[J.shR][2], -1.25, d);
    rot[J.shL][2] = lerp(rot[J.shL][2], 1.1, d);
    rot[J.shR][0] = lerp(rot[J.shR][0], -0.3, d);
    rot[J.elR][0] = lerp(rot[J.elR][0], -0.6, d);
    rot[J.elL][0] = lerp(rot[J.elL][0], -0.2, d);
    rot[J.knL][0] = lerp(rot[J.knL][0], 0.7, d);
    rot[J.hipL][0] = lerp(rot[J.hipL][0], -0.4, d);
    rot[J.knR][0] = lerp(rot[J.knR][0], 0.1, d);
    rot[J.hipR][0] = lerp(rot[J.hipR][0], 0, d);
    rot[J.neck][0] = lerp(rot[J.neck][0], 0.15, d);
    rot[J.neck][1] = lerp(rot[J.neck][1], 0.5, d);
    hipY = lerp(hipY, HIP_Y, d);
    rot[J.hips][0] = lerp(rot[J.hips][0], 0, d);
    rot[J.chest][0] = lerp(rot[J.chest][0], 0, d);
  }
  off[J.hips] = [0, hipY, 0];

  // ---- the chain
  for (let i = 0; i < JOINTS; i++) {
    const [x, y, z] = off[i];
    e.set(rot[i][0], rot[i][1], rot[i][2], "YXZ");
    q.setFromEuler(e);
    local.compose(v.set(x, y, z), q, one);
    const p = PARENT[i];
    if (p < 0) {
      if (d > 0) {
        // over about the feet: on its back (side 0), or onto a side; lifted by half its thickness
        const side = a.downSide;
        e.set(side === 0 ? -d * (Math.PI / 2) : 0, 0, side === 0 ? 0 : side * d * (Math.PI / 2), "XYZ");
        q.setFromEuler(e);
        out[i].compose(v.set(0, 0.12 * d, side === 0 ? 0.2 * d : 0), q, one).multiply(local);
      } else out[i].copy(local);
    } else out[i].multiplyMatrices(out[p], local);
  }
}

/** Each part's matrix (a unit box made its size, at its place) from the joints'. */
export function partMatrix(i: number, joints: THREE.Matrix4[], look: Look, out: THREE.Matrix4) {
  const p = PARTS[i];
  const k = p.wide ? look.bw : 1;
  local.compose(v.set(p.c[0] * k, p.c[1], p.c[2]), q.identity(), v2.set(p.s[0] * k, p.s[1], p.s[2]));
  return out.multiplyMatrices(joints[p.j], local);
}
const v2 = new THREE.Vector3();

/** The head's matrix: on the neck, a little forward. */
export function headMatrix(joints: THREE.Matrix4[], out: THREE.Matrix4) {
  local.makeTranslation(0, -0.015, 0.012);
  return out.multiplyMatrices(joints[J.neck], local);
}

export function partColor(look: Look, i: number) {
  return look[PARTS[i].col];
}

/** The box every part is drawn with (its edges softened a little). */
let box: THREE.BufferGeometry | null = null;
export function partBox() {
  if (box) return box;
  // a box with its vertical edges cut (8 sides round): reads as a limb, not a crate
  const k = 0.32;
  const ring: [number, number][] = [
    [-0.5 + k / 2, -0.5],
    [0.5 - k / 2, -0.5],
    [0.5, -0.5 + k / 2],
    [0.5, 0.5 - k / 2],
    [0.5 - k / 2, 0.5],
    [-0.5 + k / 2, 0.5],
    [-0.5, 0.5 - k / 2],
    [-0.5, -0.5 + k / 2],
  ];
  const pos: number[] = [],
    nor: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    for (const p of [a, b, c, a, c, d]) pos.push(...p), nor.push(...n);
  };
  for (let i = 0; i < 8; i++) {
    const [x0, z0] = ring[i],
      [x1, z1] = ring[(i + 1) % 8];
    const nx = z1 - z0,
      nz = -(x1 - x0);
    const l = Math.hypot(nx, nz);
    quad([x0, -0.5, z0], [x0, 0.5, z0], [x1, 0.5, z1], [x1, -0.5, z1], [nx / l, 0, nz / l]);
  }
  for (const [y, s] of [
    [0.5, 1],
    [-0.5, -1],
  ] as const)
    for (let i = 1; i < 7; i++) {
      const a = ring[0],
        b = ring[i],
        c = ring[i + 1];
      const tri = s > 0 ? [a, c, b] : [a, b, c];
      for (const p of tri) pos.push(p[0], y, p[1]), nor.push(0, s, 0);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  // (each triangle wound to face its normal's way)
  const p = g.getAttribute("position").array as Float32Array;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    n.fromArray(nor, i);
    if (b.sub(a).cross(c.sub(a)).dot(n) < 0)
      for (let k2 = 0; k2 < 3; k2++) {
        const tmp = p[i + 3 + k2];
        p[i + 3 + k2] = p[i + 6 + k2];
        p[i + 6 + k2] = tmp;
      }
  }
  g.computeBoundingSphere();
  g.userData.shared = true;
  box = g;
  return g;
}

let partMat: THREE.MeshStandardMaterial | null = null;
let headMat: THREE.MeshStandardMaterial | null = null;
export function humanMaterials() {
  partMat ??= new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  headMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  partMat.userData.shared = headMat.userData.shared = true;
  return { part: partMat, head: headMat };
}

// ---- one figure ----------------------------------------------------------------------------------

/**
 * A single person (you, another player, a taxi's fare, the garage's stand): its own draw of its
 * parts and its head. `act` is its pose's state; `update` walks it on.
 */
export class Human {
  readonly root = new THREE.Group();
  /** The body, scaled to its build's height. */
  private inner = new THREE.Group();
  readonly act = newAct();
  look: Look;
  private parts: THREE.InstancedMesh;
  private head: THREE.Mesh;
  private joints = Array.from({ length: JOINTS }, () => new THREE.Matrix4());
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private waveFor = 0;
  private cheerFor = 0;
  private gone = false;
  /** Height of the top of the head (m). */
  get height() {
    return (HIP_Y + WAIST + SPINE + this.look.headH) * this.look.bh;
  }

  constructor(readonly id: number) {
    const mats = humanMaterials();
    this.look = faces.lookNow(id);
    faces.pin(id);
    this.parts = new THREE.InstancedMesh(partBox(), mats.part, NPARTS);
    this.parts.castShadow = true;
    this.parts.frustumCulled = false;
    this.head = new THREE.Mesh(this.look.head, mats.head);
    this.head.castShadow = true;
    this.head.matrixAutoUpdate = false;
    this.inner.add(this.parts, this.head);
    this.root.add(this.inner);
    this.root.name = "gta:human";
    this.dress();
    if (!this.look.real)
      void faces.wait(id).then((l) => {
        if (this.gone || !l.real) return;
        this.look = l;
        this.head.geometry = l.head;
        this.dress();
      });
    this.pose();
  }

  private dress() {
    this.inner.scale.setScalar(this.look.bh);
    for (let i = 0; i < NPARTS; i++) this.parts.setColorAt(i, this.c.setHex(partColor(this.look, i), THREE.SRGBColorSpace));
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  wave(s = 1.6) {
    this.waveFor = Math.max(this.waveFor, s);
  }
  celebrate(s = 2.2) {
    this.cheerFor = Math.max(this.cheerFor, s);
  }

  /** One frame: ground speed (m/s), on the ground or not. */
  update(dt: number, move: { speed?: number; grounded?: boolean } = {}) {
    const a = this.act;
    stride(a, Math.min(dt, 0.1), move.speed ?? 0);
    a.air += ((move.grounded === false ? 1 : 0) - a.air) * Math.min(1, dt * 12);
    this.waveFor = Math.max(0, this.waveFor - dt);
    this.cheerFor = Math.max(0, this.cheerFor - dt);
    if (this.cheerFor > 0) a.gesture = "cheer";
    else if (this.waveFor > 0) a.gesture = "wave";
    else if (a.gesture === "cheer" || a.gesture === "wave") a.gesture = null;
    this.pose();
  }

  pose() {
    pose(this.act, this.look, this.joints);
    for (let i = 0; i < NPARTS; i++) this.parts.setMatrixAt(i, partMatrix(i, this.joints, this.look, this.m));
    this.parts.instanceMatrix.needsUpdate = true;
    headMatrix(this.joints, this.head.matrix);
    this.head.matrixWorldNeedsUpdate = true;
  }

  dispose() {
    if (!this.gone) faces.unpin(this.id);
    this.gone = true;
    this.root.removeFromParent();
    this.parts.dispose();
  }
}
