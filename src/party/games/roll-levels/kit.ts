/**
 * BIG Q ROLL's shared pieces: the road's sizes, its rects and props, the instanced batches, the
 * level contract (layout + scenery + sky + twist), and the props' textures.
 * Coordinates: the road runs along s (forward: world −z), x across it (world x), y up.
 */
import * as THREE from "three";
import type { SongKey } from "../../music";
import type { Rnd } from "../../kit";
import { canvasTex, mixHex, toonSteps } from "../../k3";
import type { PostLook } from "../../post";
import type { Course } from "./course";
import type { AmbienceKind } from "../../../audio/kinds";

/** The road's half width (the kerbs just outside), how far out a runner's centre goes. */
export const HALF = 4.2;
export const LIM = HALF - 0.42;
/** The Z-Block's size. */
export const QS = 8;
/** Where the runners start. */
export const START = 11;
/** The swinging balls: the pivot's height, the chain, the ball. */
export const PY = 7.4;
export const SL = 6.3;
export const BR = 1.0;
/** A rooftop pool's water (a fall in it ends in a splash). */
export const POOL_Y = -1.0;

export const CRATE = 0;
export const WALL = 1;
export const BAR = 2;

export const GOLD = "#ffd23f";
export const INK = 0x15101f;

export interface Rect {
  s0: number;
  s1: number;
  x0: number;
  x1: number;
}
export interface Floor extends Rect {
  wood: boolean;
}
export interface Solid extends Rect {
  h: number;
  kind: number;
  /** Its instance in its kind's mesh. */
  n: number;
  dead: boolean;
}
export interface Mover {
  s: number;
  d: number;
  w: number;
  h: number;
  amp: number;
  om: number;
  ph: number;
  x: number;
  vx: number;
  dead: boolean;
}
export interface Swing {
  s: number;
  amp: number;
  om: number;
  ph: number;
  a: number;
  bx: number;
  by: number;
  bvx: number;
  dead: boolean;
}
/** A raft gliding side to side across a pool (a floor that moves): x = amp·sin(om·t + ph). */
export interface Raft {
  s0: number;
  s1: number;
  w: number;
  amp: number;
  om: number;
  ph: number;
  x: number;
  vx: number;
  dead: boolean;
  /** Sunk this long (the Q landed on it). */
  sink: number;
}

export const NONE: never[] = [];
export const cellOf = (s: number) => Math.max(0, Math.floor((s + 40) / 2));

/** Rects bucketed by 2 m of road (quick lookups). */
export class Grid<R extends Rect> {
  private cells: R[][] = [];
  constructor(items: R[]) {
    for (const it of items) for (let c = cellOf(it.s0 - 0.3); c <= cellOf(it.s1 + 0.3); c++) (this.cells[c] ??= []).push(it);
  }
  cell(c: number): readonly R[] {
    return this.cells[c] ?? NONE;
  }
  has(s: number, x: number, m = 0) {
    for (const r of this.cell(cellOf(s))) if (s >= r.s0 - m && s < r.s1 + m && x >= r.x0 - m && x <= r.x1 + m) return r;
    return null;
  }
}

export function shuffle<X>(a: X[], rnd: Rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const span = (cx: number, w: number): [number, number] => [cx - w / 2, cx + w / 2];

/** One instanced batch of boxes or planes, filled once (and changed later by index). */
export class Batch {
  readonly mesh: THREE.InstancedMesh;
  readonly ink: THREE.InstancedMesh | null;
  private static m = new THREE.Matrix4();
  private static q = new THREE.Quaternion();
  private static e = new THREE.Euler();
  private static p = new THREE.Vector3();
  private static k = new THREE.Vector3();
  private static c = new THREE.Color();
  n = 0;

  constructor(scene: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, ink?: THREE.Material, private inkT = 0.05) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    this.mesh.count = 0;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
    if (ink) {
      this.ink = new THREE.InstancedMesh(geo, ink, Math.max(1, cap));
      this.ink.count = 0;
      this.ink.raycast = () => {};
      scene.add(this.ink);
    } else this.ink = null;
  }
  /** Add (or with `at`, set) one: centre, size, a turn round y, flat (a decal lying on the road). */
  put(x: number, y: number, z: number, w: number, h: number, d: number, color?: THREE.ColorRepresentation, ry = 0, flat = false, at = -1) {
    const i = at >= 0 ? at : this.n++;
    if (i >= this.mesh.instanceMatrix.count) return i;
    const B = Batch;
    B.e.set(flat ? -Math.PI / 2 : 0, ry, 0, "YXZ");
    B.q.setFromEuler(B.e);
    B.m.compose(B.p.set(x, y, z), B.q, B.k.set(w, h, d));
    this.mesh.setMatrixAt(i, B.m);
    if (color !== undefined) this.mesh.setColorAt(i, B.c.set(color));
    if (this.ink) {
      const t = this.inkT;
      B.m.compose(B.p, B.q, B.k.set(w + 2 * t, h + 2 * t, d + 2 * t));
      this.ink.setMatrixAt(i, B.m);
    }
    if (at < 0) {
      this.mesh.count = this.n;
      if (this.ink) this.ink.count = this.n;
    } else {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.ink) this.ink.instanceMatrix.needsUpdate = true;
      if (color !== undefined && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    return i;
  }
  /** Far scenery: it casts and takes no shadow. */
  far() {
    this.mesh.userData.noShadow = true;
    return this;
  }
  done() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    if (this.ink) (this.ink.instanceMatrix.needsUpdate = true), this.ink.computeBoundingSphere();
  }
}

// ---- the level contract --------------------------------------------------------------------------

/** What a level's scenery gets: the scene, the road's floors (to dress round them), the goal. */
export interface SceneKit {
  scene: THREE.Scene;
  fin: number;
  floors: readonly Floor[];
  pools: readonly Rect[];
  /** Static road under (s, x)? */
  ground(s: number, x: number): boolean;
}
/** What moves in a level's scenery, every frame: `at` the camera's target, `wind` −1..1 (a gust). */
export interface Scenery {
  tick?(dt: number, t: number, at: THREE.Vector3, wind: number): void;
}

export interface Level {
  key: string;
  title: string;
  titleZh: string;
  /** Its twist in one line. */
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  sky: [string, string];
  fog: [number, number];
  /** The hemisphere light (sky, ground, intensity), the sun (colour, intensity, position). */
  hemi: [string, string, number];
  sun: [string, number, number, number, number];
  /** The stage's finish for this level (a night: its lights bloom sooner), how dark its cast shadows are (× the stage's). */
  post?: PostLook;
  shadowK?: number;
  road: {
    slab: [string, string];
    /** A slab's top in one of those two colours (its seams, its lines). */
    tex(color: string): THREE.Texture;
    /** A night: the road glows this much of its own colour (its lamps' light), so it stays the brightest thing. */
    lift?: number;
    body: string;
    /** The girder under the middle (none: houses stand under the road). */
    girder: string | null;
    kerb: [string, string];
    plank: [string, string];
    beam: string;
    /** The pylons down from the road: colour and how deep (none: no pylons). */
    pylon: [string, number] | null;
  };
  props: {
    crate(): THREE.Texture;
    wall: [string, string];
    bar(): THREE.Texture;
    mover(): THREE.Texture;
    /** The sliding blocks' track on the road. */
    track: string;
    ball(): THREE.Texture;
    chain: string;
    gantry: [string, string];
    belt: [string, string];
    arch: [string, string];
    flags: string[];
    lamp: string;
    post: string;
    /** What a landing kicks up off the road (dust, snow powder, tile grit). */
    dust: string[];
    /** Splinters when the Q flattens them: crates, walls, bars, the sliding blocks. */
    bits: [string[], string[], string[], string[]];
  };
  /** A fall ends in water this high (a splash), else out of sight below `deep`. */
  waterY?: number;
  deep: number;
  /** Rooftops beside the road this high: a snark flung off the road drops out of sight into them. */
  sideY?: number;
  /** Twists: ice (slippery sheets, from the layout), blizzard gusts (a sideways push, telegraphed). */
  gusts?: boolean;
  layout(c: Course, rnd: Rnd): void;
  scenery(k: SceneKit): Scenery;
}

// ---- the props' textures -------------------------------------------------------------------------

export const crateTex = (base = "#e89a4f", light = "#f6b46a", dark = "#9c5a22", bolt = "#7a4416") =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = light;
    for (let y = 14; y < 118; y += 26) g.fillRect(14, y, 100, 10);
    g.strokeStyle = dark;
    g.lineWidth = 14;
    g.strokeRect(7, 7, 114, 114);
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(12, 116);
    g.lineTo(116, 12);
    g.stroke();
    g.fillStyle = bolt;
    for (const [x, y] of [
      [14, 14],
      [114, 14],
      [14, 114],
      [114, 114],
    ])
      g.fillRect(x - 4, y - 4, 8, 8);
  });
export const hazTex = (a = "#ffd23f", b = "#1d1b2b") =>
  canvasTex(128, 64, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = b;
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 32, 64);
      g.lineTo(i * 32 + 16, 64);
      g.lineTo(i * 32 + 16 + 64, 0);
      g.lineTo(i * 32 + 64, 0);
      g.closePath();
      g.fill();
    }
  });
/** A chevron per tile, pointing up the texture (forward) when `up`, else down. */
export const chevTex = (bg: string, fg: string, up: boolean) =>
  canvasTex(64, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = fg;
    g.save();
    if (!up) (g.translate(0, 64), g.scale(1, -1));
    g.beginPath();
    g.moveTo(8, 46);
    g.lineTo(32, 18);
    g.lineTo(56, 46);
    g.lineTo(44, 46);
    g.lineTo(32, 32);
    g.lineTo(20, 46);
    g.closePath();
    g.fill();
    g.restore();
  });
/** A sliding block's face: its colours, two eyes and a frown (`stripe`: a hazard band along the bottom). */
export const faceTex = (base = "#6a63e0", light = "#8f89ff", dark = "#3f38a8", stripe = "") =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = light;
    g.fillRect(0, 0, 128, 12);
    g.fillStyle = dark;
    g.fillRect(0, 116, 128, 12);
    if (stripe) {
      g.fillStyle = stripe;
      for (let i = 0; i < 8; i++) if (i % 2) g.fillRect(i * 16, 104, 16, 12);
    }
    for (const x of [40, 88]) {
      g.fillStyle = "#fff";
      g.fillRect(x - 14, 46, 28, 30);
      g.fillStyle = "#15101f";
      g.fillRect(x - 6, 54, 14, 18);
    }
    g.fillStyle = "#15101f";
    g.fillRect(22, 34, 34, 8);
    g.fillRect(72, 34, 34, 8);
    g.fillRect(40, 92, 48, 8);
  });
export const ballTex = (a = "#ff3d5a", b = "#ffffff") =>
  canvasTex(128, 64, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 16, 0, 16, 64);
    }
  });
export const checkTex = (nx: number, ny: number) =>
  canvasTex(nx * 16, ny * 16, (g) => {
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        g.fillStyle = (x + y) % 2 ? "#15101f" : "#ffffff";
        g.fillRect(x * 16, y * 16, 16, 16);
      }
  });
/**
 * A tile of windows, `cols` × `rows` of them (multiplied by a wall's colour): walls tile it by their
 * size in metres (Boxes), so a window is a window on a tower of any size. `glow`: the same tile with
 * only its lit windows on black (a night's emissive map; give both the same seed).
 */
export function panes(rnd: Rnd, o: { cols?: number; rows?: number; lit?: number; on?: string[]; off?: string; frame?: string; glow?: boolean; tall?: boolean } = {}) {
  const cols = o.cols ?? 4,
    rows = o.rows ?? 4,
    C = 32;
  const on = o.on ?? ["#fff6d8"];
  return canvasTex(
    cols * C,
    rows * C,
    (g) => {
      g.fillStyle = o.glow ? "#000000" : (o.frame ?? "#ffffff");
      g.fillRect(0, 0, cols * C, rows * C);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const lit = rnd() < (o.lit ?? 0.22);
          const col = on[Math.floor(rnd() * on.length) % on.length];
          if (o.glow && !lit) continue;
          g.fillStyle = lit ? col : (o.off ?? "#9fb3d0");
          // (a tall shuttered window, or a wide pane over a sill)
          if (o.tall) g.fillRect(c * C + 10, r * C + 5, C - 20, C - 10);
          else g.fillRect(c * C + 6, r * C + 7, C - 12, C - 15);
        }
    },
    true,
  );
}

/**
 * A road slab's top in `base`: a seam where it meets the next, a crisp line down each side, a dash
 * down the middle (`grid`: square tiles with grout instead; `frost`: snow creeping in from the sides).
 * 512 × 256 over 8.4 m × 4 m: the canvas's top is forward.
 */
export function slabTex(base: string, o: { seam?: string; line?: string; dash?: string; grid?: number; grout?: string; frost?: string; rnd?: Rnd } = {}) {
  const tex = canvasTex(512, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 256);
    if (o.grid) {
      // (tiles: a hair lighter and darker by turns, thin grout between)
      const n = o.grid,
        m = Math.round(n / 2);
      const tw = 512 / n,
        th = 256 / m;
      for (let j = 0; j < m; j++)
        for (let i = 0; i < n; i++) {
          g.fillStyle = (i + j) % 2 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.035)";
          g.fillRect(i * tw, j * th, tw, th);
        }
      g.fillStyle = o.grout ?? "rgba(90,60,50,0.3)";
      for (let i = 1; i < n; i++) g.fillRect(Math.round(i * tw) - 1, 0, 2, 256);
      for (let j = 1; j < m; j++) g.fillRect(0, Math.round(j * th) - 1, 512, 2);
    }
    if (o.frost && o.rnd) {
      // (snow blown against the kerbs: soft patches down both sides)
      const rnd = o.rnd;
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : 0;
        const x = side ? 512 - rnd() * 46 : rnd() * 46,
          y = rnd() * 256,
          r = 22 + rnd() * 40;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, o.frost);
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
        // (the same again a slab over, so the seam does not cut a patch)
        for (const dy of [-256, 256]) {
          const g2 = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
          g2.addColorStop(0, o.frost);
          g2.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = g2;
          g.fillRect(x - r, y + dy - r, r * 2, r * 2);
        }
      }
    }
    if (o.dash) {
      g.fillStyle = o.dash;
      g.beginPath();
      g.roundRect(251, 70, 10, 116, 5);
      g.fill();
    }
    if (o.line) {
      g.fillStyle = o.line;
      g.fillRect(18, 0, 7, 256);
      g.fillRect(487, 0, 7, 256);
    }
    g.fillStyle = o.seam ?? "rgba(30,40,70,0.3)";
    g.fillRect(0, 0, 512, 3);
    g.fillRect(0, 253, 512, 3);
  });
  tex.anisotropy = 8;
  return tex;
}
/** A plank's top (multiplied by its colour): the grain, a lighter edge, nail heads. */
export const plankTex = () =>
  canvasTex(128, 32, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = "rgba(90,50,20,0.22)";
    g.fillRect(0, 9, 70, 2);
    g.fillRect(48, 20, 80, 2);
    g.fillRect(96, 6, 32, 2);
    g.fillStyle = "rgba(60,30,10,0.3)";
    g.fillRect(0, 29, 128, 3);
    g.fillStyle = "rgba(50,25,10,0.6)";
    for (const x of [8, 120]) g.fillRect(x - 2, 14, 4, 4);
  });
/** A soft round falloff, white: a lamp's pool of light on the ground, a halo. */
export const softTex = () =>
  canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.5)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });

// ---- a city of boxes -------------------------------------------------------------------------------

/**
 * Static boxes merged into two meshes (their walls, their flat tops): a wall's texture tiles by its
 * size in metres, and its colour runs from the box's own at the top to `low` at its foot (a city
 * sinking into the haze below). Far scenery: it casts and takes no shadow.
 */
export class Boxes {
  private wp: number[] = [];
  private wn: number[] = [];
  private wu: number[] = [];
  private wc: number[] = [];
  private wi: number[] = [];
  private rp: number[] = [];
  private rc: number[] = [];
  private ri: number[] = [];
  private a = new THREE.Color();
  private b = new THREE.Color();

  /** `tu` × `tv`: the metres one tile of the walls' texture covers. */
  constructor(
    private tu = 12,
    private tv = 14,
  ) {}

  /** A box on (x, z), from `y0` up to `y1`, `w` × `d`; `roof`: its top's colour; `u0`: where its windows start (tiles). */
  add(x: number, z: number, y0: number, y1: number, w: number, d: number, color: THREE.ColorRepresentation, low: THREE.ColorRepresentation = color, roof: THREE.ColorRepresentation = color, u0 = 0) {
    const a = this.a.set(color),
      b = this.b.set(low);
    const hx = w / 2,
      hz = d / 2;
    const v = -(y1 - y0) / this.tv;
    // (each wall: its top corners as seen from outside, left then right, its normal, its length)
    const walls = [
      [x - hx, z + hz, x + hx, z + hz, 0, 1, w],
      [x + hx, z - hz, x - hx, z - hz, 0, -1, w],
      [x + hx, z + hz, x + hx, z - hz, 1, 0, d],
      [x - hx, z - hz, x - hx, z + hz, -1, 0, d],
    ];
    for (const [lx, lz, rx, rz, nx, nz, len] of walls) {
      const i = this.wp.length / 3;
      this.wp.push(lx, y1, lz, rx, y1, rz, rx, y0, rz, lx, y0, lz);
      for (let k = 0; k < 4; k++) this.wn.push(nx, 0, nz);
      const u1 = u0 + len / this.tu;
      this.wu.push(u0, 0, u1, 0, u1, v, u0, v);
      this.wc.push(a.r, a.g, a.b, a.r, a.g, a.b, b.r, b.g, b.b, b.r, b.g, b.b);
      this.wi.push(i, i + 3, i + 2, i, i + 2, i + 1);
    }
    const j = this.rp.length / 3;
    const r = this.a.set(roof);
    this.rp.push(x - hx, y1, z - hz, x - hx, y1, z + hz, x + hx, y1, z + hz, x + hx, y1, z - hz);
    for (let k = 0; k < 4; k++) this.rc.push(r.r, r.g, r.b);
    this.ri.push(j, j + 1, j + 2, j, j + 2, j + 3);
  }

  /** Into the scene: the walls with `wall` (its map tiled), the tops with `roof` (both tinted by the boxes' colours). */
  build(scene: THREE.Object3D, wall: THREE.Material, roof: THREE.Material) {
    const f = (a: number[], n: number) => new THREE.BufferAttribute(new Float32Array(a), n);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", f(this.wp, 3));
    wg.setAttribute("normal", f(this.wn, 3));
    wg.setAttribute("uv", f(this.wu, 2));
    wg.setAttribute("color", f(this.wc, 3));
    wg.setIndex(this.wi);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", f(this.rp, 3));
    const up = new Float32Array(this.rp.length);
    for (let i = 1; i < up.length; i += 3) up[i] = 1;
    rg.setAttribute("normal", new THREE.BufferAttribute(up, 3));
    rg.setAttribute("color", f(this.rc, 3));
    rg.setIndex(this.ri);
    const walls = new THREE.Mesh(wg, wall);
    const tops = new THREE.Mesh(rg, roof);
    for (const m of [walls, tops]) {
      m.userData.noShadow = true;
      m.raycast = () => {};
      scene.add(m);
    }
    this.wp = this.wn = this.wu = this.wc = this.wi = this.rp = this.rc = this.ri = [];
    return { walls, tops };
  }
}
/** The two materials a Boxes city wears: its walls (windows; `glow`: the lit ones' emissive map) and its tops. */
export function cityMats(map: THREE.Texture, glow?: THREE.Texture, emissive = "#ffd9a0") {
  const wall = new THREE.MeshToonMaterial({ map, vertexColors: true, gradientMap: toonSteps(), ...(glow ? { emissiveMap: glow, emissive } : {}) });
  const roof = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() });
  return { wall, roof };
}
/** A colour sunk toward the haze: `k` of the way. */
export const hazed = (c: string, haze: string, k: number) => mixHex(c, haze, k);

// ---- background life, shared by the levels' scenery ------------------------------------------------

/** A flock of birds wheeling round a point ahead of the camera, flapping (two wing boxes each, one draw). */
export class Flock {
  private mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private k = new THREE.Vector3();
  private birds: { r: number; y: number; ph: number; sp: number; f: number }[] = [];
  constructor(
    scene: THREE.Scene,
    n: number,
    color: string,
    private ahead = 46,
    private side = 16,
    rnd: Rnd = Math.random,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 0.3), new THREE.MeshBasicMaterial({ color }), n * 2);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    scene.add(this.mesh);
    for (let i = 0; i < n; i++) this.birds.push({ r: 5 + rnd() * 6, y: 9 + rnd() * 6, ph: rnd() * 6.3, sp: 0.35 + rnd() * 0.15, f: 7 + rnd() * 3 });
  }
  tick(t: number, at: THREE.Vector3) {
    const cx = at.x + this.side,
      cz = at.z - this.ahead;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const a = b.ph + t * b.sp;
      const x = cx + Math.cos(a) * b.r * 1.6,
        z = cz + Math.sin(a) * b.r,
        y = b.y + Math.sin(t * 0.7 + b.ph) * 0.8;
      const yaw = -a;
      const flap = Math.sin(t * b.f + b.ph) * 0.6;
      for (let s = -1; s <= 1; s += 2) {
        this.e.set(0, yaw, s * flap, "YXZ");
        this.q.setFromEuler(this.e);
        // (each wing hinged at the body)
        this.p.set(x + Math.cos(yaw) * 0.42 * s, y + Math.abs(flap) * 0.2, z - Math.sin(yaw) * 0.42 * s);
        this.m.compose(this.p, this.q, this.k.set(0.85, 1, 1));
        this.mesh.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), this.m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
