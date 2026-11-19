/**
 * ⓩ SHOWER's levels: what a level is (its arena, its sky, its twist), the instanced set every level
 * builds its scenery with (Batch), and the rain or snow that falls over the night levels (Precip).
 */
import * as THREE from "three";
import { rng, type Rnd } from "../../kit";
import type { SongKey } from "../../music";
import { GEO, glow, toon, type Fx3 } from "../../k3";
import type { AmbienceKind } from "../../../audio/kinds";

export type Circle = { x: number; z: number; r: number };
export type Box = { x: number; z: number; hx: number; hz: number };

/** What the game tells a level's set every frame (its weather, its fountain). */
export interface Weather {
  /** The gust blowing now: -1 … 1 (its side and strength; 0 when calm). */
  wind: number;
  /** A gust on its way: 0 … 1 through the warning (0 when none); `dir` its side (-1 left, 1 right). */
  warn: number;
  dir: number;
  /** The fountain about to thaw: 0 … 1 through the warning (0 when none); `burst` the frame it erupts. */
  thaw: number;
  burst: boolean;
  /** Seconds of play (0 before GO). */
  t: number;
  /** Where the four snarks stand (their feet). */
  players: THREE.Vector3[];
  /** A rug bomb went off this frame (where). */
  boom: boolean;
  boomX: number;
  boomZ: number;
}

export interface SetCtx {
  scene: THREE.Scene;
  B: Batch;
  rnd: Rnd;
  fx: Fx3;
  ink: THREE.Material;
  level: Level;
  /** The scene's lights (a lightning flash, a glow). */
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}
/** A level's set, every frame: what moves by itself (a fountain, palms in the wind, the rain). */
export type SetAnim = (dt: number, clk: number, w: Weather) => void;

export interface Level {
  key: string;
  title: string;
  titleZh: string;
  /** Its twist in one line. */
  tag: string;
  tagZh: string;
  song?: SongKey;
  ambience?: AmbienceKind;
  /** The sky (top, horizon), the fog, a night's light, the hemisphere's strength, the sun. */
  sky: [string, string];
  fog: [number, number];
  night?: boolean;
  hemi: number;
  sun: [number, number, number];
  sunI?: number;
  sunC?: string;
  /** The arena: a rectangle (half width xw, half depth zd) or, `round`, a disc of radius xw. */
  round?: boolean;
  xw: number;
  zd: number;
  /** What stands on it (round props, boxes). */
  circles: Circle[];
  boxes: Box[];
  /** The four seats' spots (you first, at the front). */
  starts: [number, number][];
  /** The opening ring of coins (and the waves that ring the middle): its centre and radius. */
  ring: Circle;
  /** The play camera: how high, how far back. */
  cam: { h: number; d: number };
  /** The dust a dive or a landing kicks up. */
  dust: string[];
  /** The ground's height (a sunken pool); 0 everywhere when none. */
  floorAt?: (x: number, z: number) => number;
  /** Puddles and pools: slower in them (speed × k). */
  wet?: { circles: Circle[]; boxes: Box[]; k: number };
  /** Ice: the grip on it (the run's pick-up per second; 14 on dry stones). */
  ice?: { circles: Circle[]; grip: number };
  /** Gusts across the arena: the first, the wait between, the warning, how long, how far they blow the coins (m/s), how hard they push a snark. */
  gust?: { first: number; every: [number, number]; warn: number; len: number; drift: number; push: number };
  /** A fountain that thaws: where, its round body, the first, the wait between, the warning, how many coins. */
  thaw?: { x: number; z: number; r: number; first: number; every: [number, number]; warn: number; n: number };
  build(c: SetCtx): SetAnim | null;
}

// ---- the set: one instanced draw per kind of piece -----------------------------------------------

type Kind = "box" | "cyl" | "ball" | "cone";
interface Piece {
  k: Kind;
  c: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  rx: number;
  rz: number;
  ink: number;
  lit: boolean;
}
/** Every static piece of a set, drawn as a few InstancedMeshes (toon, unlit, and their ink hulls). */
export class Batch {
  private p: Piece[] = [];
  add(k: Kind, c: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, o: { ry?: number; rx?: number; rz?: number; ink?: number; lit?: boolean } = {}) {
    this.p.push({ k, c, sx, sy, sz, x, y, z, ry: o.ry ?? 0, rx: o.rx ?? 0, rz: o.rz ?? 0, ink: o.ink ?? 0, lit: !!o.lit });
  }
  /** A box standing on y (its bottom at y). */
  box(c: string, w: number, h: number, d: number, x: number, y: number, z: number, ink = 0, ry = 0) {
    this.add("box", c, w, h, d, x, y + h / 2, z, { ink, ry });
  }
  cyl(c: string, r: number, h: number, x: number, y: number, z: number, ink = 0) {
    this.add("cyl", c, r * 2, h, r * 2, x, y + h / 2, z, { ink });
  }
  /** A lit (unlit-shaded: it glows) box standing on y. */
  lit(c: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    this.add("box", c, w, h, d, x, y + h / 2, z, { ry, lit: true });
  }
  build(scene: THREE.Object3D, ink: THREE.Material) {
    const M = new THREE.Matrix4(),
      Q = new THREE.Quaternion(),
      E = new THREE.Euler(),
      P = new THREE.Vector3(),
      S = new THREE.Vector3(),
      C = new THREE.Color();
    const groups = new Map<string, Piece[]>();
    for (const q of this.p) {
      const key = `${q.k}:${q.lit ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(q);
      if (q.ink) {
        const ik = `${q.k}:ink`;
        if (!groups.has(ik)) groups.set(ik, []);
        groups.get(ik)!.push(q);
      }
    }
    for (const [key, list] of groups) {
      const [k, mode] = key.split(":") as [Kind, string];
      const isInk = mode === "ink";
      const mat = isInk ? ink : mode === "1" ? glow("#ffffff") : toon("#ffffff");
      const mesh = new THREE.InstancedMesh(GEO[k], mat, list.length);
      list.forEach((q, i) => {
        E.set(q.rx, q.ry, q.rz, "YXZ");
        Q.setFromEuler(E);
        const t = isInk ? q.ink * 2 : 0;
        M.compose(P.set(q.x, q.y, q.z), Q, S.set(q.sx + t, q.sy + t, q.sz + t));
        mesh.setMatrixAt(i, M);
        if (!isInk) mesh.setColorAt(i, C.set(q.c));
      });
      mesh.raycast = () => {};
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }
}

// ---- rain and snow -------------------------------------------------------------------------------

/**
 * Rain streaks or snowflakes over the arena (one instanced draw): they fall through a box round the
 * arena, slanted by the wind, and come back in at the top.
 */
export class Precip {
  readonly mesh: THREE.InstancedMesh;
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private ph: Float32Array;
  private M = new THREE.Matrix4();
  private Q = new THREE.Quaternion();
  private E = new THREE.Euler();
  private P = new THREE.Vector3();
  private S = new THREE.Vector3();
  /** The sideways drift (m/s) the wind adds now. */
  drift = 0;
  /** (its own random, seeded: never the game's, never Math.random inside the game's update) */
  private R = rng(0x9ec1b);

  constructor(
    scene: THREE.Scene,
    private n: number,
    private kind: "rain" | "snow",
    private hx: number,
    private hz: number,
    private top: number,
    color: string,
  ) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === "rain" ? 0.42 : 0.9, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(GEO.box, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = (this.R() * 2 - 1) * hx;
      this.y[i] = this.R() * top;
      this.z[i] = (this.R() * 2 - 1) * hz;
      this.ph[i] = this.R() * 6.28;
    }
  }

  update(dt: number, clk: number) {
    const rain = this.kind === "rain";
    const vy = rain ? 17 : 1.6;
    const vx = this.drift;
    // (a streak leans with the wind it falls through)
    const lean = rain ? Math.atan2(vx, vy) : 0;
    for (let i = 0; i < this.n; i++) {
      let y = this.y[i] - vy * dt * (rain ? 1 : 0.8 + (i % 5) * 0.1);
      let x = this.x[i] + vx * dt * (rain ? 1 : 1.4);
      if (!rain) x += Math.sin(clk * 1.3 + this.ph[i]) * 0.5 * dt;
      if (y < 0) ((y += this.top), (x = (this.R() * 2 - 1) * this.hx), (this.z[i] = (this.R() * 2 - 1) * this.hz));
      if (x > this.hx) x -= this.hx * 2;
      else if (x < -this.hx) x += this.hx * 2;
      this.x[i] = x;
      this.y[i] = y;
      this.E.set(rain ? 0 : clk * 2 + this.ph[i], rain ? 0 : this.ph[i], -lean);
      this.Q.setFromEuler(this.E);
      if (rain) this.S.set(0.035, 0.75, 0.035);
      else this.S.setScalar(0.07 + (i % 3) * 0.03);
      this.M.compose(this.P.set(x, y, this.z[i]), this.Q, this.S);
      this.mesh.setMatrixAt(i, this.M);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Is (x, z) in one of these circles or boxes? */
export function within(x: number, z: number, cs: Circle[], bs: Box[] = []) {
  for (const c of cs) if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) return true;
  for (const b of bs) if (Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz) return true;
  return false;
}

// ---- the sky ---------------------------------------------------------------------------------------

/** A soft glow in the sky (a sun, a moon, a halo of city light): one additive sprite, out of the fog. */
export function skyGlow(scene: THREE.Scene, color: string, x: number, y: number, z: number, size: number, core = "rgba(255,255,255,0.95)") {
  const tex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, core);
    gr.addColorStop(0.12, core);
    gr.addColorStop(0.2, color);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.position.set(x, y, z);
  sp.scale.setScalar(size);
  sp.renderOrder = -1;
  scene.add(sp);
  return sp;
}

/** Stars on the upper sky (one instanced draw): they twinkle when `twinkle()` is called each frame. */
export class Stars {
  readonly mesh: THREE.InstancedMesh;
  private base: Float32Array;
  private c = new THREE.Color();
  constructor(scene: THREE.Scene, n: number, r: number, minY: number, color = "#ffffff") {
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false });
    this.mesh = new THREE.InstancedMesh(GEO.box, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.base = new Float32Array(n);
    const m = new THREE.Matrix4(),
      v = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3();
    const R = rng(0x57a25);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2,
        el = minY + R() * (Math.PI / 2 - minY);
      const k = 0.6 + R() * 1.4;
      m.compose(v.set(Math.cos(el) * Math.sin(a) * r, Math.sin(el) * r, Math.cos(el) * Math.cos(a) * r), q, s.setScalar(k * r * 0.004));
      this.mesh.setMatrixAt(i, m);
      this.base[i] = 0.4 + R() * 0.6;
      this.mesh.setColorAt(i, this.c.set(color).multiplyScalar(this.base[i]));
    }
    scene.add(this.mesh);
  }
  twinkle(clk: number) {
    for (let i = 0; i < this.base.length; i += 3) {
      const k = this.base[i] * (0.65 + 0.35 * Math.sin(clk * 2.5 + i * 1.3));
      this.mesh.setColorAt(i, this.c.setScalar(k));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
