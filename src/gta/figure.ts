import * as THREE from "three";
import { faces, type Look } from "./faces";
import { lowDetail, partGeo, type PartKind } from "./snarkgeo";
import { flushArt, snarkMaterial } from "./snarkmat";

/**
 * A zkSNARK in 3D (src/gta): its bust from its own picture — the hooded head and the shoulders,
 * rounded into a volume (faces.ts) — on two short legs, with two short arms in its clothes and
 * hands in its skin. A skeleton of 15 joints posed by one function for everyone (you, the passers-by,
 * the street's residents and crowd, the other players): the waddle and the run, standing about, a
 * fighting guard, punches, being hit, going down and getting up, sitting, riding, and the gestures
 * (talking with the hands, waving, cheering, a phone at the ear, filming, hands up).
 *
 * The head and the shoulders are each a geometry per zkSNARK (faces.ts, snarkgeo.ts); the limbs are
 * shared shapes — sleeves, mitten hands, jeans, sneakers — in each one's colours: the passers-by
 * draw all of theirs in one batch (people3d.ts), a single figure (`SnarkFigure`) in one of its own.
 * One material for everything (snarkmat.ts).
 */

// ---- the skeleton --------------------------------------------------------------------------------

export const J = { hips: 0, chest: 1, neck: 2, shR: 3, elR: 4, wrR: 5, shL: 6, elL: 7, wrL: 8, hipR: 9, knR: 10, anR: 11, hipL: 12, knL: 13, anL: 14 } as const;
const PARENT = [-1, 0, 1, 1, 3, 4, 1, 6, 7, 0, 9, 10, 0, 12, 13];
export const JOINTS = 15;

const THIGH = 0.2,
  SHIN = 0.19,
  ANKLE = 0.07;
const HIP_Y = THIGH + SHIN + ANKLE;
const UPPER = 0.17,
  FORE = 0.15;
/** (sturdier limbs than the first sticks: a zkSNARK is a chibi with a big head, not a stick figure) */
const ARM_W = 0.135;

/** Limbs: joint, size (w, h, d), centre in the joint's frame, colour slot. */
type Slot = "cloth" | "trousers" | "skin" | "shoes" | "sole";
interface Part {
  j: number;
  /** Its shape (snarkgeo.ts partGeo, made in the joint's frame). */
  kind: PartKind;
  col: Slot;
}
export const PARTS: Part[] = [
  { j: J.hips, kind: "hips", col: "trousers" },
  { j: J.shR, kind: "upper", col: "cloth" },
  { j: J.shL, kind: "upper", col: "cloth" },
  { j: J.elR, kind: "fore", col: "cloth" },
  { j: J.elL, kind: "fore", col: "cloth" },
  { j: J.wrR, kind: "handR", col: "skin" },
  { j: J.wrL, kind: "handL", col: "skin" },
  { j: J.hipR, kind: "thigh", col: "trousers" },
  { j: J.hipL, kind: "thigh", col: "trousers" },
  { j: J.knR, kind: "shin", col: "trousers" },
  { j: J.knL, kind: "shin", col: "trousers" },
  // sneakers: the upper in the shoe's colour, the sole, its laces and its stripe in the sole's
  { j: J.anR, kind: "shoe", col: "shoes" },
  { j: J.anL, kind: "shoe", col: "shoes" },
  { j: J.anR, kind: "sole", col: "sole" },
  { j: J.anL, kind: "sole", col: "sole" },
];
/** The kinds of limb, each one shape for everybody. */
export const PART_KINDS: PartKind[] = ["hips", "upper", "fore", "handR", "handL", "thigh", "shin", "shoe", "sole"];
const partGeos = new Map<PartKind, THREE.BufferGeometry>();
/** A limb's shape (made once). */
export function partShape(kind: PartKind) {
  let g = partGeos.get(kind);
  if (!g) {
    g = partGeo(kind);
    g.userData.shared = true;
    partGeos.set(kind, g);
  }
  return g;
}
const partFar = new Map<PartKind, THREE.BufferGeometry>();
/** The same, far off (snarkgeo.ts lowDetail). */
export function partShapeFar(kind: PartKind) {
  let g = partFar.get(kind);
  if (!g) {
    g = lowDetail(() => partGeo(kind));
    g.userData.shared = true;
    partFar.set(kind, g);
  }
  return g;
}
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
  /** In deep water: 0 on land … 1 swimming (a crawl when it moves, treading water when it stays). */
  swim: number;
  /** Lying down to rest (the beach): 0 no, 1 on its back, 2 on its front. */
  lie: number;
}

export function newAct(): Act {
  return { t: Math.random() * 10, phase: Math.random(), speed: 0, air: 0, guard: 0, punch: -1, punchSide: -1, hit: 9, hitFrom: 1, down: 0, downSide: 0, seat: 0, ride: false, gesture: null, lookYaw: 0, swim: 0, lie: 0 };
}

/** One frame of the stride: the phase moves with the ground covered (short legs: quick steps). */
export function stride(a: Act, dt: number, speed: number) {
  a.t += dt;
  a.speed += (speed - a.speed) * Math.min(1, dt * 8);
  const len = 0.78 + 0.22 * Math.min(8, a.speed);
  a.phase = (a.phase + (a.speed / len) * dt) % 1;
}

// scratch
const e = new THREE.Euler();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const local = new THREE.Matrix4();
const rot: [number, number, number][] = Array.from({ length: JOINTS }, () => [0, 0, 0]);
const off: [number, number, number][] = Array.from({ length: JOINTS }, () => [0, 0, 0]);

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const set3 = (o: [number, number, number], x: number, y: number, z: number) => ((o[0] = x), (o[1] = y), (o[2] = z));

/**
 * The joints' matrices (relative to the feet, facing +z) for this act, into `out` (15). Rotations:
 * +x swings a hanging limb back (a knee bends +, an elbow −), +y turns left, +z rolls toward +x.
 */
export function pose(a: Act, look: Look, out: THREE.Matrix4[]) {
  for (let i = 0; i < JOINTS; i++) rot[i][0] = rot[i][1] = rot[i][2] = 0;
  // where the joints sit: the shoulders' piece on the hips, the head on top of it, the arms out of its sides
  // (the arms come out of the hoodie's sides, a little into them: never hanging off in the air)
  const sx = Math.max(0.15, look.halfW * 0.8) + ARM_W * 0.35;
  const lx = Math.max(0.085, Math.min(look.halfW * 0.42, 0.13));
  set3(off[J.chest], 0, 0.04, 0);
  set3(off[J.neck], 0, look.bodyH - 0.01, 0);
  set3(off[J.shR], -sx, Math.max(0.15, look.bodyH * 0.72), 0);
  set3(off[J.shL], sx, Math.max(0.15, look.bodyH * 0.72), 0);
  set3(off[J.elR], 0, -UPPER, 0);
  set3(off[J.elL], 0, -UPPER, 0);
  set3(off[J.wrR], 0, -FORE, 0);
  set3(off[J.wrL], 0, -FORE, 0);
  set3(off[J.hipR], -lx, 0, 0);
  set3(off[J.hipL], lx, 0, 0);
  set3(off[J.knR], 0, -THIGH, 0);
  set3(off[J.knL], 0, -THIGH, 0);
  set3(off[J.anR], 0, -SHIN, 0);
  set3(off[J.anL], 0, -SHIN, 0);

  const t = a.t;
  const sp = a.speed;
  const w = clamp01(sp / 1.0);
  const r = clamp01((sp - 2.3) / 2.6);
  const ph = a.phase * Math.PI * 2;
  // ---- the legs and the hips: a waddle, a run (left leg at ph, right at ph + π)
  const A = lerp(0.5, 0.85, r) * w;
  const K = lerp(0.7, 1.55, r) * w;
  let hipY = HIP_Y;
  const leg = (hip: number, knee: number, ank: number, p: number) => {
    const th = -A * Math.sin(p);
    const swing = Math.max(0, Math.cos(p));
    const kn = 0.05 + K * Math.pow(swing, 1.3) + 0.2 * r * Math.max(0, -Math.cos(p)) * w;
    rot[hip][0] = th;
    rot[knee][0] = kn;
    rot[ank][0] = -(th + kn) * 0.75 + 0.12 * swing * w;
  };
  leg(J.hipL, J.knL, J.anL, ph);
  leg(J.hipR, J.knR, J.anR, ph + Math.PI);
  hipY -= lerp(0.018, 0.04, r) * w * Math.abs(Math.sin(ph)) + 0.02 * r;
  // the big head sways the body side to side a little as it waddles
  rot[J.hips][2] = 0.05 * w * (1 - r) * Math.sin(ph);
  rot[J.hips][1] = 0.08 * w * Math.sin(ph);
  rot[J.chest][1] = -0.12 * w * Math.sin(ph);
  rot[J.hips][0] = 0.02 * w + 0.12 * r;
  rot[J.chest][0] = 0.03 * r;
  const still = 1 - w;
  rot[J.chest][0] += still * 0.02 * Math.sin(t * 1.7);
  rot[J.hips][2] += still * 0.02 * Math.sin(t * 0.45);
  // ---- the arms swinging (opposite the legs)
  const AA = lerp(0.45, 0.85, r) * w;
  const elb = -(0.12 + lerp(0.15, 1.2, r) * w);
  const arm = (sh: number, el: number, side: number, p: number) => {
    rot[sh][0] = AA * Math.sin(p) + still * 0.04 * Math.sin(t * 1.3 + side);
    rot[sh][2] = side * (0.12 + 0.06 * r);
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
      rot[hp][0] = lerp(rot[hp][0], -0.6, k);
      rot[kn][0] = lerp(rot[kn][0], 1.1, k);
    }
    rot[J.hipR][0] += 0.3 * k;
    rot[J.shL][0] = lerp(rot[J.shL][0], -0.7, k);
    rot[J.shR][0] = lerp(rot[J.shR][0], -0.7, k);
    rot[J.shL][2] += 0.5 * k;
    rot[J.shR][2] -= 0.5 * k;
  }
  // ---- sitting, riding
  if (a.seat > 0 || a.ride) {
    for (const [hp, kn, an, side] of [
      [J.hipL, J.knL, J.anL, 1],
      [J.hipR, J.knR, J.anR, -1],
    ]) {
      rot[hp][0] = a.ride ? -1.2 : -1.5;
      rot[hp][2] = a.ride ? side * 0.25 : side * 0.06;
      rot[kn][0] = a.ride ? 1.3 : 1.5;
      rot[an][0] = 0;
    }
    rot[J.hips][1] = rot[J.chest][1] = rot[J.hips][2] = 0;
    if (a.ride) {
      rot[J.hips][0] = 0.25;
      rot[J.shL][0] = rot[J.shR][0] = -1.3;
      rot[J.elL][0] = rot[J.elR][0] = -0.25;
      hipY = 0.06;
    } else {
      rot[J.hips][0] = 0;
      rot[J.shL][0] = rot[J.shR][0] = -0.35;
      rot[J.elL][0] = rot[J.elR][0] = -0.6;
      hipY = a.seat + 0.06;
      // on the ground (the sand, a towel): legs out in front, leaning back on its hands
      if (a.seat < 0.15) {
        rot[J.knL][0] = 0.18;
        rot[J.knR][0] = 0.5;
        rot[J.hipR][0] = -1.25;
        rot[J.anL][0] = rot[J.anR][0] = 0.25;
        rot[J.chest][0] = -0.18;
        rot[J.shL][0] = rot[J.shR][0] = 0.45;
        rot[J.shL][2] = 0.35;
        rot[J.shR][2] = -0.35;
        rot[J.elL][0] = rot[J.elR][0] = 0;
      }
    }
  }
  // ---- the guard: fists up in front of the face, side on, knees soft, a little bounce
  if (a.guard > 0.01) {
    const g = smooth(clamp01(a.guard));
    const set = (j: number, ax: number, val: number) => (rot[j][ax] = lerp(rot[j][ax], val, g));
    set(J.shL, 0, -1.35);
    set(J.shR, 0, -1.2);
    set(J.elL, 0, -1.5);
    set(J.elR, 0, -1.6);
    set(J.shL, 2, -0.05);
    set(J.shR, 2, 0.05);
    if (w < 0.3) {
      set(J.hipL, 0, -0.3);
      set(J.knL, 0, 0.35);
      set(J.hipR, 0, 0.2);
      set(J.knR, 0, 0.4);
      set(J.anR, 0, -0.55);
      set(J.hips, 1, 0.25);
      set(J.chest, 1, -0.1);
      hipY -= 0.04 * g;
      hipY += 0.012 * Math.sin(t * 9) * g;
    }
    set(J.chest, 0, 0.08);
  }
  // ---- a punch: the arm out straight, the shoulders turned into it
  if (a.punch >= 0) {
    const p = a.punch;
    const ext = p < 0.32 ? smooth(p / 0.32) : 1 - smooth((p - 0.32) / 0.68);
    const s = a.punchSide;
    const [sh, el] = s < 0 ? [J.shR, J.elR] : [J.shL, J.elL];
    rot[sh][0] = lerp(rot[sh][0], -1.62, ext);
    rot[el][0] = lerp(rot[el][0], -0.05, ext);
    rot[sh][2] = lerp(rot[sh][2], -s * 0.1, ext);
    rot[J.chest][1] += -s * 0.45 * ext;
    rot[J.hips][1] += -s * 0.15 * ext;
    rot[J.chest][0] += 0.08 * ext;
  }
  // ---- the gestures
  const gs = a.gesture;
  if (gs && a.down < 0.05) {
    if (gs === "talk") {
      rot[J.shR][0] = -0.6 - 0.15 * Math.sin(t * 2.3);
      rot[J.elR][0] = -0.9 - 0.35 * Math.max(0, Math.sin(t * 5));
      rot[J.shL][0] = -0.45;
      rot[J.elL][0] = -0.8 - 0.3 * Math.max(0, Math.sin(t * 3.7 + 1));
    } else if (gs === "wave") {
      rot[J.shR][0] = -2.8;
      rot[J.shR][2] = -0.4 - 0.4 * Math.sin(t * 11);
      rot[J.elR][0] = -0.3;
    } else if (gs === "cheer") {
      rot[J.shR][0] = -2.9 + 0.15 * Math.sin(t * 12);
      rot[J.shL][0] = -2.9 + 0.15 * Math.sin(t * 12 + 1);
      rot[J.shR][2] = -0.45;
      rot[J.shL][2] = 0.45;
      rot[J.elR][0] = rot[J.elL][0] = -0.25;
      hipY += 0.05 * Math.max(0, Math.sin(t * 12));
    } else if (gs === "phone") {
      rot[J.shR][0] = -1.6;
      rot[J.shR][2] = 0.35;
      rot[J.elR][0] = -1.9;
    } else if (gs === "film") {
      rot[J.shR][0] = rot[J.shL][0] = -1.55;
      rot[J.elR][0] = rot[J.elL][0] = -0.4;
      rot[J.shR][2] = 0.3;
      rot[J.shL][2] = -0.3;
    } else if (gs === "point") {
      rot[J.shR][0] = -1.55;
      rot[J.elR][0] = -0.05;
      rot[J.shR][2] = 0;
    } else if (gs === "hands") {
      rot[J.shR][0] = rot[J.shL][0] = -2.7;
      rot[J.shR][2] = -0.6;
      rot[J.shL][2] = 0.6;
      rot[J.elR][0] = rot[J.elL][0] = -0.8;
    }
  }
  // ---- hit: thrown back, the head snapped, the arms flung
  if (a.hit < 0.7) {
    const h = a.hit;
    const amp = h < 0.08 ? h / 0.08 : Math.pow(1 - (h - 0.08) / 0.62, 2);
    rot[J.chest][0] += -0.35 * amp * a.hitFrom;
    rot[J.neck][0] += -0.35 * amp * a.hitFrom;
    rot[J.chest][2] += 0.12 * amp;
    rot[J.shR][0] += -0.6 * amp;
    rot[J.shL][0] += -0.45 * amp;
    rot[J.shR][2] -= 0.5 * amp;
    rot[J.shL][2] += 0.5 * amp;
  }
  // ---- swimming: flat in a crawl when it goes (the arms windmilling, the legs fluttering), upright
  // treading water when it stays (the arms sculling, the legs cycling) — the head always out
  if (a.swim > 0.01) {
    const s = smooth(clamp01(a.swim));
    const go = smooth(clamp01((sp - 0.25) / 1.1));
    const st = t * lerp(2.1, 3.3, go);
    const L = (j: number, ax: number, val: number) => (rot[j][ax] = lerp(rot[j][ax], val, s));
    L(J.hips, 0, lerp(0.12, 1.32, go));
    L(J.hips, 1, 0);
    L(J.hips, 2, 0.07 * Math.sin(st) * go);
    L(J.chest, 0, lerp(0.05, 0, go));
    L(J.chest, 1, 0.2 * Math.sin(st) * go);
    for (const [sh, el, side, ph] of [
      [J.shR, J.elR, -1, 0],
      [J.shL, J.elL, 1, Math.PI],
    ] as const) {
      L(sh, 0, lerp(-0.45 + 0.4 * Math.sin(st + ph), -1.55 - 1.45 * Math.cos(st + ph), go));
      L(sh, 2, side * lerp(0.8 + 0.25 * Math.sin(st * 2 + ph), 0.18, go));
      L(el, 0, lerp(-0.55, -0.2 - 0.5 * Math.max(0, Math.sin(st + ph)), go));
    }
    const kick = Math.sin(t * lerp(3.6, 9.5, go));
    L(J.hipL, 0, lerp(-0.35 + 0.35 * kick, 0.22 * kick, go));
    L(J.hipR, 0, lerp(-0.35 - 0.35 * kick, -0.22 * kick, go));
    L(J.knL, 0, lerp(0.7 + 0.35 * Math.max(0, -kick), 0.12, go));
    L(J.knR, 0, lerp(0.7 + 0.35 * Math.max(0, kick), 0.12, go));
    L(J.anL, 0, 0.55);
    L(J.anR, 0, 0.55);
    for (const j of [J.hipL, J.hipR]) rot[j][2] = lerp(rot[j][2], 0, s);
    hipY = lerp(hipY, HIP_Y, s);
  }
  // ---- lying down to rest: on its back (hands behind the head, a knee up) or its front (arms folded
  // under the head), whole and still but for breathing
  const lie = a.lie > 0 && a.down < 0.05 ? a.lie : 0;
  if (lie) {
    const set = (j: number, x: number, y = 0, z = 0) => ((rot[j][0] = x), (rot[j][1] = y), (rot[j][2] = z));
    set(J.hips, 0);
    set(J.chest, 0.015 * Math.sin(t * 1.2));
    if (lie === 1) {
      set(J.shR, -2.75, 0, -0.35);
      set(J.shL, -2.75, 0, 0.35);
      set(J.elR, -2.0);
      set(J.elL, -2.0);
      set(J.hipL, -0.55);
      set(J.knL, 1.1);
      set(J.hipR, 0);
      set(J.knR, 0.05);
    } else {
      set(J.shR, -2.6, 0, -0.55);
      set(J.shL, -2.6, 0, 0.55);
      set(J.elR, -1.9);
      set(J.elL, -1.9);
      set(J.hipL, 0.05);
      set(J.knL, 0.35 + 0.25 * Math.max(0, Math.sin(t * 0.9)));
      set(J.hipR, 0);
      set(J.knR, 0.1);
    }
    set(J.anL, 0.4);
    set(J.anR, 0.4);
    hipY = HIP_Y;
  }
  // the head: looking at something, steadied against the lean
  rot[J.neck][0] += -(rot[J.hips][0] + rot[J.chest][0]) * 0.6;
  rot[J.neck][1] = a.lookYaw - rot[J.hips][1] - rot[J.chest][1];
  // ---- down: limbs loose, the whole body over about its feet
  const d = smooth(clamp01(a.down));
  if (d > 0) {
    rot[J.shR][2] = lerp(rot[J.shR][2], -1.3, d);
    rot[J.shL][2] = lerp(rot[J.shL][2], 1.2, d);
    rot[J.elR][0] = lerp(rot[J.elR][0], -0.5, d);
    rot[J.knL][0] = lerp(rot[J.knL][0], 0.7, d);
    rot[J.hipL][0] = lerp(rot[J.hipL][0], -0.4, d);
    rot[J.knR][0] = lerp(rot[J.knR][0], 0.1, d);
    rot[J.hipR][0] = lerp(rot[J.hipR][0], 0, d);
    rot[J.neck][0] = lerp(rot[J.neck][0], 0.1, d);
    rot[J.neck][1] = lerp(rot[J.neck][1], 0.5, d);
    hipY = lerp(hipY, HIP_Y, d);
    rot[J.hips][0] = lerp(rot[J.hips][0], 0, d);
    rot[J.chest][0] = lerp(rot[J.chest][0], 0, d);
  }
  set3(off[J.hips], 0, hipY, 0);

  // ---- the chain
  for (let i = 0; i < JOINTS; i++) {
    const [x, y, z] = off[i];
    e.set(rot[i][0], rot[i][1], rot[i][2], "YXZ");
    q.setFromEuler(e);
    local.compose(v.set(x, y, z), q, one);
    const p = PARENT[i];
    if (p < 0) {
      if (lie) {
        // flat on the towel: on its back (head toward −z) or its front (head toward +z), half its
        // thickness off the ground
        e.set(lie === 1 ? -Math.PI / 2 : Math.PI / 2, 0, 0, "XYZ");
        q.setFromEuler(e);
        out[i].compose(v.set(0, lie === 1 ? 0.2 : 0.17, lie === 1 ? 0.15 : -0.15), q, one).multiply(local);
      } else if (d > 0) {
        // over about the feet: on its back (side 0), or onto a side; lifted by half its thickness
        const side = a.downSide;
        e.set(side === 0 ? -d * (Math.PI / 2) : 0, 0, side === 0 ? 0 : side * d * (Math.PI / 2), "XYZ");
        q.setFromEuler(e);
        out[i].compose(v.set(0, 0.22 * d, side === 0 ? 0.15 * d : 0), q, one).multiply(local);
      } else out[i].copy(local);
    } else out[i].multiplyMatrices(out[p], local);
  }
}

/** A limb's matrix from the joints' (its shape is made in its joint's frame; the hips as wide as the body). */
export function partMatrix(i: number, joints: THREE.Matrix4[], look: Look, out: THREE.Matrix4) {
  const p = PARTS[i];
  if (i !== 0) return out.copy(joints[p.j]);
  const k = Math.min(1.25, Math.max(0.85, (look.halfW * 2) / 0.36));
  local.compose(v.set(0, 0, 0), q.identity(), v2.set(k, 1, Math.min(1.15, Math.max(0.9, k * 0.95))));
  return out.multiplyMatrices(joints[p.j], local);
}

/** The shoulders' piece on the chest; the head on the neck. */
export function bodyMatrix(joints: THREE.Matrix4[], out: THREE.Matrix4) {
  return out.copy(joints[J.chest]);
}
export function headMatrix(joints: THREE.Matrix4[], out: THREE.Matrix4) {
  return out.copy(joints[J.neck]);
}

export function partColor(look: Look, i: number) {
  return look[PARTS[i].col];
}

/** The figures' one material (snarkmat.ts): the art atlas, the fabrics, the sheen. */
export function figureMaterials() {
  const m = snarkMaterial();
  return { part: m, bust: m };
}

// ---- one figure ----------------------------------------------------------------------------------

/**
 * A single zkSNARK (you, another player, a taxi's fare, the garage's stand): its own draw of its
 * limbs, its shoulders and its head. `act` is its pose's state; `update` walks it on.
 */
export class SnarkFigure {
  readonly root = new THREE.Group();
  /** The body, scaled to its build. */
  private inner = new THREE.Group();
  readonly act = newAct();
  look: Look;
  /** Its limbs, its shoulders and its head: one batch, one draw. */
  private batch: THREE.BatchedMesh;
  private partIds: number[] = [];
  private headGeo = -1;
  private bodyGeo = -1;
  private headId = -1;
  private bodyId = -1;
  private joints = Array.from({ length: JOINTS }, () => new THREE.Matrix4());
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private waveFor = 0;
  private cheerFor = 0;
  private gone = false;
  /** Height of the top of the head (m). */
  get height() {
    return (HIP_Y + 0.04 + this.look.bodyH + this.look.headH) * this.look.bh;
  }

  constructor(readonly id: number) {
    this.look = faces.lookNow(id);
    faces.pin(id);
    let verts = 0,
      idx = 0;
    for (const k of PART_KINDS) {
      const g = partShape(k);
      verts += g.getAttribute("position").count;
      idx += g.getIndex()!.count;
    }
    const lv = this.look.head.getAttribute("position").count + this.look.body.getAttribute("position").count;
    const li = this.look.head.getIndex()!.count + this.look.body.getIndex()!.count;
    // (room for its own look twice: the stand-in, then its picture)
    this.batch = new THREE.BatchedMesh(NPARTS + 2, verts + lv * 2 + 4000, idx + li * 2 + 12000, snarkMaterial());
    this.batch.castShadow = true;
    this.batch.frustumCulled = false;
    this.batch.perObjectFrustumCulled = false;
    this.batch.sortObjects = false;
    const kindId = new Map<PartKind, number>();
    for (const k of PART_KINDS) kindId.set(k, this.batch.addGeometry(partShape(k)));
    for (let i = 0; i < NPARTS; i++) this.partIds.push(this.batch.addInstance(kindId.get(PARTS[i].kind)!));
    this.wearLook(this.look);
    this.inner.add(this.batch);
    this.root.add(this.inner);
    this.root.name = "gta:snark";
    if (!this.look.real)
      void faces.wait(id).then((l) => {
        if (this.gone || !l.real) return;
        this.wearLook(l);
      });
    this.pose();
  }

  /** Its head and shoulders (the stand-in, then its own), its colours. */
  private wearLook(l: Look) {
    const b = this.batch;
    if (this.headId >= 0) {
      b.deleteInstance(this.headId);
      b.deleteInstance(this.bodyId);
      b.deleteGeometry(this.headGeo);
      b.deleteGeometry(this.bodyGeo);
    }
    this.look = l;
    try {
      this.headGeo = b.addGeometry(l.head);
      this.bodyGeo = b.addGeometry(l.body);
    } catch {
      b.optimize();
      this.headGeo = b.addGeometry(l.head);
      this.bodyGeo = b.addGeometry(l.body);
    }
    this.headId = b.addInstance(this.headGeo);
    this.bodyId = b.addInstance(this.bodyGeo);
    this.inner.scale.setScalar(l.bh);
    for (let i = 0; i < NPARTS; i++) b.setColorAt(this.partIds[i], this.c.setHex(partColor(l, i), THREE.SRGBColorSpace));
    b.setColorAt(this.headId, this.c.setRGB(1, 1, 1));
    b.setColorAt(this.bodyId, this.c.setRGB(1, 1, 1));
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
    // (its picture into the art atlas, if it was just read)
    flushArt();
    pose(this.act, this.look, this.joints);
    const b = this.batch;
    for (let i = 0; i < NPARTS; i++) b.setMatrixAt(this.partIds[i], partMatrix(i, this.joints, this.look, this.m));
    b.setMatrixAt(this.bodyId, bodyMatrix(this.joints, this.m));
    b.setMatrixAt(this.headId, headMatrix(this.joints, this.m));
  }

  dispose() {
    if (!this.gone) faces.unpin(this.id);
    this.gone = true;
    this.root.removeFromParent();
    this.batch.dispose();
  }
}
