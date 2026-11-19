/**
 * CONSENSUS RUN's levels: what a course is made of (the data run.ts builds and races on), and the
 * little kit the levels' scenery builders draw with (baked instanced boxes, instanced pieces).
 *
 * The course runs along +s (world −z: away from the camera); x is across it.
 */
import * as THREE from "three";
import type { Rnd } from "../../kit";
import type { SongKey } from "../../music";
import { GEO, canvasTex, toonSteps, type Fx3, type World } from "../../k3";
import { markGlow } from "../../post";
import type { AmbienceKind } from "../../../audio/kinds";

// ---- the data ----------------------------------------------------------------------------------

/** A stretch of the course: where it starts (s), its names, its colour. */
export interface Sec {
  s: number;
  en: string;
  zh: string;
  sh: string;
  shZh: string;
  c: string;
}
/** A fixed floor: x0, x1, s0, s1, top at s0, top at s1, stretch (its palette). */
export type Slab = [number, number, number, number, number, number, number];
/** A checkpoint: s, height, the band across it where the four drop back in. */
export interface Cp {
  s: number;
  y: number;
  x0: number;
  x1: number;
}
/** A sign over the course: s, x0, x1, ground y, words, its colour, letter height, how high. */
export type Arch = [number, number, number, number, string, string, string, number?, number?];

/**
 * The AI's plan, stretch by stretch: each zone runs up to `s1` (from the one before). Kinds:
 * doors (PROOF CHECK), go (a free run in a lane), sweep, hams (the hammers, the sidechain), saws,
 * blocks (crumbling tiles and sliding platforms), climb (belts, bumpers, the boost), shut (the
 * shutters), discs (the turntables), hops (islands over the void).
 */
export type Zone =
  | { k: "doors"; s1: number }
  | { k: "go"; s1: number; w: number; lim: number; cx?: number; sc1?: [number, number] }
  | { k: "sweep"; s1: number; w: number; narrow?: [number, number, number] }
  | { k: "hams"; s1: number; w: number; lim: number }
  | { k: "saws"; s1: number }
  | { k: "blocks"; s1: number; sc2x?: number }
  | { k: "climb"; s1: number }
  | { k: "shut"; s1: number; lim: number }
  | { k: "discs"; s1: number }
  | { k: "hops"; s1: number };

/** A row of shutters across the street: its face (s), x0…x1 split in `n` gates, their beat. */
export interface ShutRow {
  s: number;
  x0: number;
  x1: number;
  n: number;
  /** Each gate's cycle (s) and the share of it spent open. */
  per: number[];
  open: number;
  /**
   * The row's pattern (the gates share the first beat): sync (all together), wave (the green runs
   * left to right), back (right to left), checker (odd and even gates in turn); none: each its own.
   */
  beat?: "sync" | "wave" | "back" | "checker";
}

export interface Level {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  look: {
    sky: [string, string];
    fog: [number, number];
    night?: boolean;
    /** The fill light (sky, ground, intensity) and the sun (colour, intensity). */
    hemi?: [string, string, number];
    sun?: [string, number];
    /** The arches' and walls' posts, the start gate's stripes. */
    post: string;
    gate: [string, string];
    /** The floors: their slab's thickness, thrusters under them (they float), little lights on the lips. */
    slabTh: number;
    thrusters: boolean;
    lips: boolean;
    /** The hammers' look (arm, head, its caps' tint, the gantry). */
    ham?: [string, string, string, string];
    /** The sliding platforms' colours, by lane; a hull under them down to the water (boats), no rails. */
    movers?: string[];
    hull?: string;
    /** Splash colours (water). */
    splash?: string[];
    /** The thrusters' glow under the floors. */
    jet?: string;
    /** What the feet kick up (a run, a jump, a landing). */
    dust?: string[];
    /** How far apart the floor's two checker tones stand (0: one tone, 1: the palette's own; default 0.55: a calm floor). */
    tileK?: number;
  };
  /** Gravity and the jump's speed (the city: 30 and 10.6). */
  grav: number;
  jumpV: number;
  /** Water under the course (its top): fall in and it's a splash. */
  water?: number;
  secs: Sec[];
  /** Tile tones and the slab's side, per stretch. */
  pal: [string, string, string][];
  slabs: Slab[];
  cps: Cp[];
  /** The finish line (s, the floor's height there, its width). */
  fin: { s: number; y: number; x0: number; x1: number };
  /** The start gate's width. */
  gateW: number;
  zones: Zone[];
  /** Where the AIs make up their minds about the two shortcuts (s). */
  rolls?: [number, number];
  arches: Arch[];
  // ---- the obstacles (each optional)
  walls?: { s: number; real: number }[];
  sweeps?: { cx: number; cs: number; R: number; n: number; w: number }[];
  hams?: { s: number; T: number; ph: number }[];
  pillars?: { x: number; s: number[]; exit: [number, number, number] };
  saws?: { cx: number; s0: number; s1: number; hw: number }[];
  tiles?: { rows: number[]; cols: number[]; size: number; colors: [string, string] };
  lanes?: { s0: number; s1: number; per: number; ph: number; cs: number[]; amp: number; hw: number }[];
  /** The FINALITY CLIMB (belts, bumpers, the boost pad and its ledge) from here. */
  climb?: number;
  shutters?: ShutRow[];
  /** Turntables: centre, radius, turn (rad/s). */
  discs?: { cx: number; cs: number; R: number; w: number }[];
  /** Solid blocks nothing gets through (x0, x1, s0, s1, top): the scenery draws them (a house front). */
  solid?: [number, number, number, number, number][];
  /** Meteor showers: where, how often one falls (s, a range), its warning (s), its blast radius. */
  meteors?: { s0: number; s1: number; x0: number; x1: number; every: [number, number]; warn: number; R: number }[];
  /** The level's own scenery round the course; what it returns runs every frame (its animations). */
  scenery(k: SceneKit): ((now: number, dt: number) => void) | void;
}

/** What a level's scenery builder gets: the scene, the seed, baked sets the engine builds after it. */
export interface SceneKit {
  scene: THREE.Scene;
  world: World;
  rnd: Rnd;
  ink: THREE.Material;
  /** Thick ink-outlined boxes, plain boxes, unlit glowing boxes (all built after the scenery). */
  slabs: Bake;
  deco: Bake;
  lights: Bake;
  /** The particles (for the scenery's life: fireworks, steam, sparkles; cosmetic, Math.random). */
  fx: Fx3;
}

// ---- the kit -----------------------------------------------------------------------------------

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _sc = new THREE.Vector3();
const _c = new THREE.Color();

export function put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, order: THREE.EulerOrder = "XYZ") {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, _sc.set(sx, sy, sz));
  mesh.setMatrixAt(i, _m);
}

/** A set of one shape drawn in one call (and its ink outline in one more): put(), tint(), flush(). */
export class Pieces {
  readonly mesh: THREE.InstancedMesh;
  readonly ink: THREE.InstancedMesh | null;
  constructor(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    readonly n: number,
    readonly t = 0,
    inkMat?: THREE.Material,
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.count = n;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    parent.add(this.mesh);
    if (t > 0 && inkMat) {
      this.ink = new THREE.InstancedMesh(geo, inkMat, Math.max(1, n));
      this.ink.count = n;
      this.ink.frustumCulled = false;
      this.ink.raycast = () => {};
      parent.add(this.ink);
    } else this.ink = null;
  }
  put(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, order: THREE.EulerOrder = "XYZ") {
    put(this.mesh, i, x, y, z, sx, sy, sz, rx, ry, rz, order);
    if (this.ink) {
      const t2 = this.t * 2;
      const k = sx === 0 || sy === 0 || sz === 0 ? 0 : 1;
      put(this.ink, i, x, y, z, (sx + t2) * k, (sy + t2) * k, (sz + t2) * k, rx, ry, rz, order);
    }
  }
  tint(i: number, c: THREE.ColorRepresentation) {
    this.mesh.setColorAt(i, _c.set(c));
  }
  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.ink) this.ink.instanceMatrix.needsUpdate = true;
  }
}

/** Static boxes gathered while building, then baked into one instanced draw (+ its ink). */
export class Bake {
  list: number[] = [];
  cols: string[] = [];
  box(c: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    this.list.push(x, y, z, sx, sy, sz, rx, ry, rz);
    this.cols.push(c);
  }
  build(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, t = 0, inkMat?: THREE.Material) {
    const n = this.cols.length;
    const p = new Pieces(parent, geo, mat, n, t, inkMat);
    const L = this.list;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      p.put(i, L[o], L[o + 1], L[o + 2], L[o + 3], L[o + 4], L[o + 5], L[o + 6], L[o + 7], L[o + 8]);
      p.tint(i, this.cols[i]);
    }
    p.flush();
    return p;
  }
}

/** A plain cel material of our own (instanced pieces tint it per piece). */
export const cel = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonSteps(), ...o });

export function stripeTex(a: string, b: string, n = 8) {
  return canvasTex(16, 128, (g) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(0, (i * 128) / n, 16, 128 / n);
    }
  });
}

export const TAU = Math.PI * 2;

// ---- the scenery's own kit (draw-side only: its own seeded streams, never the game's) ---------------

/** An unlit material for lights (each piece its own colour) that feeds the stage's bloom (`w` of it). */
export const lit = (w = 1) => markGlow(new THREE.MeshBasicMaterial({ color: 0xffffff }), w);

/**
 * The level's sun (or moon): where it stands, in the sky dome's own degrees (k3 skyDome's `disc.az`:
 * 0 from −x, 90 from behind the start, 180 from +x, 270 from up the course), and degrees up.
 */
export function sunAt(w: World, az: number, el: number) {
  const a = (az * Math.PI) / 180,
    e = (el * Math.PI) / 180;
  w.sun.position.set(-Math.cos(a) * Math.cos(e) * 80, Math.sin(e) * 80, Math.sin(a) * Math.cos(e) * 80);
  w.sun.target.position.set(0, 0, 0);
}

/** A mesh that is scenery far off: it neither casts nor takes the sun's shadows (shadows.ts). */
export function far<T extends { mesh: THREE.Object3D; ink?: THREE.Object3D | null } | THREE.Object3D>(o: T): T {
  const p = o as { mesh?: THREE.Object3D; ink?: THREE.Object3D | null };
  if (p.mesh) {
    p.mesh.userData.noShadow = true;
    if (p.ink) p.ink.userData.noShadow = true;
  } else (o as THREE.Object3D).userData.noShadow = true;
  return o;
}

/** A voxel cloud into a bake: stepped boxes on a flat bottom, `w` long, turned `ry`. */
export function puff(b: Bake, rnd: Rnd, x: number, y: number, z: number, w: number, c = "#ffffff", ry = 0) {
  const n = 3 + Math.floor(rnd() * 3);
  const cs = Math.cos(ry),
    sn = Math.sin(ry);
  for (let j = 0; j < n; j++) {
    const u = (j + 0.5) / n;
    const arch = Math.sin(u * Math.PI);
    const h = w * (0.13 + arch * 0.17) * (0.8 + rnd() * 0.4);
    const d = w * (0.3 + arch * 0.26) * (0.8 + rnd() * 0.4);
    const px = (u - 0.5) * w * 0.9;
    b.box(c, (w / n) * 1.3, h, d, x + px * cs, y + h / 2, z - px * sn, 0, ry, 0);
  }
}

/**
 * A crowd of blocky onlookers (a body and a head each, two draws): add() them while building, build(),
 * then tick() every frame: they bob, and hop when they cheer (a wave runs along them now and then).
 */
export class Crowd {
  private a: number[] = [];
  private cols: string[] = [];
  private body: Pieces | null = null;
  private head: Pieces | null = null;
  /** At (x, y, z) facing `yaw`, `k` its size; `rnd` its own stream. */
  add(x: number, y: number, z: number, yaw: number, rnd: Rnd, k = 1) {
    this.a.push(x, y, z, yaw, rnd() * TAU, k * (0.85 + rnd() * 0.3), 0.6 + rnd() * 0.8);
    this.cols.push(SHIRTS[Math.floor(rnd() * SHIRTS.length)], FURS[Math.floor(rnd() * FURS.length)]);
  }
  get n() {
    return this.a.length / 7;
  }
  build(parent: THREE.Object3D, ink?: THREE.Material) {
    const n = this.n;
    this.body = new Pieces(parent, GEO.box, cel(), n, ink ? 0.03 : 0, ink);
    this.head = new Pieces(parent, GEO.box, cel(), n, ink ? 0.03 : 0, ink);
    for (let i = 0; i < n; i++) {
      this.body.tint(i, this.cols[i * 2]);
      this.head.tint(i, this.cols[i * 2 + 1]);
    }
    this.tick(0);
    return this;
  }
  /** `cheer` 0…1: how wild they are. */
  tick(now: number, cheer = 0.35) {
    const { a, body, head } = this;
    if (!body || !head) return;
    for (let i = 0, n = this.n; i < n; i++) {
      const o = i * 7;
      const k = a[o + 5];
      // (a wave down the row: each hops a little after its neighbour)
      const w = Math.sin(now * (2.2 + a[o + 6]) + a[o + 4]);
      const hop = Math.max(0, w) * (0.08 + cheer * 0.5) * k * (Math.sin(now * 0.35 + a[o + 4] * 0.5) > 0.2 ? 1 : 0.25);
      const lean = Math.sin(now * 1.3 + a[o + 4]) * 0.07;
      body.put(i, a[o], a[o + 1] + 0.42 * k + hop, a[o + 2], 0.5 * k, 0.84 * k, 0.34 * k, 0, a[o + 3], lean);
      head.put(i, a[o], a[o + 1] + 1.06 * k + hop, a[o + 2], 0.42 * k, 0.4 * k, 0.4 * k, 0, a[o + 3] + lean * 2, lean);
    }
    body.flush();
    head.flush();
  }
}
const SHIRTS = ["#e8604a", "#4a9be8", "#f0c040", "#7ac85a", "#c48cf0", "#f08ab0", "#5ad0c0", "#f2f2f2", "#ff9a4a"];
const FURS = ["#7a4a2a", "#5a3a26", "#9a6a3a", "#3a2a22", "#b08a5a"];

/** Pennants on poles: each a strip of three boxes that ripples in the wind. add(), build(), tick(). */
export class Flags {
  private a: number[] = [];
  private cols: string[] = [];
  private p: Pieces | null = null;
  /** Its hoist at (x, y, z), flying toward `yaw` (0: +x), `len` long, `h` tall. */
  add(x: number, y: number, z: number, yaw: number, len: number, h: number, c: string) {
    this.a.push(x, y, z, yaw, len, h, this.a.length * 0.37);
    this.cols.push(c);
  }
  build(parent: THREE.Object3D) {
    const n = this.a.length / 7;
    this.p = new Pieces(parent, GEO.box, cel({ side: THREE.DoubleSide }), n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) this.p.tint(i * 3 + k, this.cols[i]);
    far(this.p);
    this.tick(0);
    return this;
  }
  tick(now: number) {
    const { a, p } = this;
    if (!p) return;
    for (let i = 0, n = a.length / 7; i < n; i++) {
      const o = i * 7;
      const seg = a[o + 4] / 3;
      let x = a[o],
        z = a[o + 2],
        yaw = a[o + 3];
      for (let k = 0; k < 3; k++) {
        // (each third swings a little further than the one before: a ripple running out to the fly)
        yaw += Math.sin(now * 5.2 - k * 1.1 + a[o + 6]) * (0.16 + k * 0.1);
        const cx = Math.cos(yaw),
          sz = -Math.sin(yaw);
        p.put(i * 3 + k, x + (cx * seg) / 2, a[o + 1], z + (sz * seg) / 2, seg * 1.04, a[o + 5] * (1 - k * 0.16), 0.04, 0, yaw, 0);
        x += cx * seg;
        z += sz * seg;
      }
    }
    p.flush();
  }
}

/** Lights that blink (beacons, bulbs): add() them, build(), tick(): each on for `duty` of its `per`. */
export class Blinkers {
  private a: number[] = [];
  private cols: string[] = [];
  private p: Pieces | null = null;
  add(x: number, y: number, z: number, s: number, c: string, per = 1.2, ph = 0, duty = 0.5) {
    this.a.push(x, y, z, s, per, ph, duty);
    this.cols.push(c);
  }
  build(parent: THREE.Object3D, geo: THREE.BufferGeometry = GEO.box) {
    const n = this.a.length / 7;
    this.p = new Pieces(parent, geo, lit(1), n);
    for (let i = 0; i < n; i++) this.p.tint(i, this.cols[i]);
    far(this.p);
    this.tick(0);
    return this;
  }
  tick(now: number) {
    const { a, p } = this;
    if (!p) return;
    for (let i = 0, n = a.length / 7; i < n; i++) {
      const o = i * 7;
      const on = (((now / a[o + 4] + a[o + 5]) % 1) + 1) % 1 < a[o + 6];
      const s = on ? a[o + 3] : 0;
      p.put(i, a[o], a[o + 1], a[o + 2], s, s, s);
    }
    p.flush();
  }
}
