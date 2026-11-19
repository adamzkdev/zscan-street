/**
 * The board's 3D building kit: `Vox`, a batcher that turns hundreds of toon boxes, cylinders,
 * roofs and balls (each with an ink outline when asked) into a handful of instanced draws; the
 * floating islands' rock; the spaces' and dice's faces; and every landmark of a board, built from
 * the map's data (maps.ts) in that kit.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT } from "../kit";
import { GEO, canvasTex, glow, toon, toonSteps } from "../k3";
import type { IslandDef, LandmarkDef } from "./maps";
import { dress, pond, tree, type Kit } from "./decor";

export const INK_C = "#1a1033";

// ---- shapes the batcher knows (shared: never disposed) ---------------------------------------------

const SHARED = { shared: true };
const CONE = new THREE.ConeGeometry(0.5, 1, 18);
const CYL8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const HEX = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const TORUS = new THREE.TorusGeometry(0.5, 0.08, 6, 24);
/** A low ball (bulbs, leaves, pebbles: hundreds of them). */
const ORB = new THREE.IcosahedronGeometry(0.5, 1);
/** A low cone (pines, spikes, stalactites). */
const CONE6 = new THREE.ConeGeometry(0.5, 1, 6);
/** A wedge (ramps, roofs of sheds): a box's top edge slid to one side. */
const WEDGE = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) > 0) p.setZ(i, -0.5);
  g.computeVertexNormals();
  return g;
})();
for (const g of [CONE, CYL8, HEX, TORUS, ORB, CONE6, WEDGE]) g.userData = SHARED;
export const SHAPES = { box: GEO.box, cyl: GEO.cyl, cyl8: CYL8, hex: HEX, cone: CONE, cone6: CONE6, roof: GEO.cone, ball: GEO.ball, orb: ORB, torus: TORUS, wedge: WEDGE };
export type Shape = keyof typeof SHAPES;

export interface VoxOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  /** An ink outline this thick (m). */
  ink?: number;
  /** Unlit (a light, a screen, a neon). */
  glow?: boolean;
}

interface Inst {
  shape: Shape;
  glow: boolean;
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
  c: THREE.Color;
  ink: number;
}

/**
 * Collects toon pieces in a local frame (`frame(x, y, z, yaw)`), then `build()` makes one
 * InstancedMesh per shape and material, plus the outlines'. A landmark of a hundred boxes costs a
 * few draws.
 */
export class Vox {
  private list: Inst[] = [];
  private fm = new THREE.Matrix4();
  private fq = new THREE.Quaternion();
  private m = new THREE.Matrix4();
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();

  constructor(private ink: THREE.Material) {}

  /** Where the next pieces go: a local frame at (x, y, z) turned by yaw. */
  frame(x = 0, y = 0, z = 0, yaw = 0) {
    this.fq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.fm.compose(new THREE.Vector3(x, y, z), this.fq, new THREE.Vector3(1, 1, 1));
    return this;
  }

  add(shape: Shape, color: THREE.ColorRepresentation, sx: number, sy: number, sz: number, x: number, y: number, z: number, o: VoxOpts = {}) {
    this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1, 1, 1)).premultiply(this.fm);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    this.m.decompose(p, q, new THREE.Vector3());
    this.list.push({ shape, glow: !!o.glow, p, q, s: new THREE.Vector3(sx, sy, sz), c: new THREE.Color(color), ink: o.ink ?? 0 });
    return this;
  }
  box(c: THREE.ColorRepresentation, w: number, h: number, d: number, x: number, y: number, z: number, o?: VoxOpts) {
    return this.add("box", c, w, h, d, x, y, z, o);
  }
  cyl(c: THREE.ColorRepresentation, r: number, h: number, x: number, y: number, z: number, o?: VoxOpts, shape: Shape = "cyl") {
    return this.add(shape, c, r * 2, h, r * 2, x, y, z, o);
  }
  cone(c: THREE.ColorRepresentation, r: number, h: number, x: number, y: number, z: number, o?: VoxOpts) {
    return this.add("cone", c, r * 2, h, r * 2, x, y, z, o);
  }
  /** A pyramid roof over a w × d footprint. */
  roof(c: THREE.ColorRepresentation, w: number, h: number, d: number, x: number, y: number, z: number, o: VoxOpts = {}) {
    return this.add("roof", c, w * 1.42, h, d * 1.42, x, y, z, { ...o, ry: (o.ry ?? 0) + Math.PI / 4 });
  }
  ball(c: THREE.ColorRepresentation, rx: number, ry: number, rz: number, x: number, y: number, z: number, o?: VoxOpts) {
    return this.add("ball", c, rx * 2, ry * 2, rz * 2, x, y, z, o);
  }
  get size() {
    return this.list.length;
  }

  /** Into the scene: one instanced draw per shape and material (and its outlines). */
  build(parent: THREE.Object3D) {
    const groups = new Map<string, Inst[]>();
    for (const it of this.list) {
      const k = `${it.shape}:${it.glow ? "g" : "t"}`;
      let a = groups.get(k);
      if (!a) groups.set(k, (a = []));
      a.push(it);
    }
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    for (const [k, a] of groups) {
      const [shape, kind] = k.split(":") as [Shape, string];
      const mesh = new THREE.InstancedMesh(SHAPES[shape], kind === "g" ? glow("#ffffff") : toon("#ffffff"), a.length);
      a.forEach((it, i) => {
        mesh.setMatrixAt(i, m.compose(it.p, it.q, it.s));
        mesh.setColorAt(i, it.c);
      });
      mesh.computeBoundingSphere();
      mesh.raycast = () => {};
      parent.add(mesh);
      out.push(mesh);
      const inked = a.filter((it) => it.ink > 0);
      if (inked.length) {
        const ol = new THREE.InstancedMesh(SHAPES[shape], this.ink, inked.length);
        inked.forEach((it, i) => ol.setMatrixAt(i, m.compose(it.p, it.q, s.set(it.s.x + it.ink * 2, it.s.y + it.ink * 2, it.s.z + it.ink * 2))));
        ol.computeBoundingSphere();
        ol.raycast = () => {};
        parent.add(ol);
        out.push(ol);
      }
    }
    this.list = [];
    return out;
  }
}

// ---- colours ---------------------------------------------------------------------------------------

export const KIND_C: Record<string, string> = {
  blue: "#2f8bff",
  red: "#ff3d56",
  lucky: "#b48cff",
  shop: "#ff7a2f",
  shor: "#3a1b66",
  vs: "#ff4fa8",
  event: "#33d67c",
};

// ---- faces -----------------------------------------------------------------------------------------

/** A kind's icon, white on clear, drawn about (0, 0) in a 128-wide box (the caller scales). */
function drawIcon(g: CanvasRenderingContext2D, kind: string) {
  g.lineJoin = "round";
  g.lineCap = "round";
  const word = (s: string, size: number, fill = "#ffffff") => {
    g.font = `900 ${size}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = size * 0.22;
    g.strokeStyle = "rgba(20,10,50,0.6)";
    g.strokeText(s, 0, 4);
    g.fillStyle = fill;
    g.fillText(s, 0, 4);
  };
  if (kind === "blue") word("+3", 62);
  else if (kind === "red") word("−3", 62);
  else if (kind === "event") word("!", 84);
  else if (kind === "vs") word("VS", 58);
  else if (kind === "lucky") {
    // a four-point sparkle
    g.fillStyle = "#ffffff";
    g.strokeStyle = "rgba(40,10,80,0.55)";
    g.lineWidth = 8;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 15 : 46;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.stroke();
    g.fill();
  } else if (kind === "shop") {
    // a shopping bag
    g.strokeStyle = "rgba(60,20,0,0.5)";
    g.lineWidth = 15;
    g.beginPath();
    g.arc(0, -16, 15, Math.PI, 0);
    g.stroke();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 9;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.roundRect(-32, -16, 64, 54, 10);
    g.fill();
    g.fillStyle = KIND_C.shop;
    g.font = `900 30px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("$", 0, 12);
  } else if (kind === "shor") {
    // THE TRACKER's eye
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(0, 4, 46, 28, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ff2d4a";
    g.beginPath();
    g.arc(0, 4, 19, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14051f";
    g.beginPath();
    g.ellipse(0, 4, 6, 15, 0, 0, Math.PI * 2);
    g.fill();
    // the angry brow
    g.strokeStyle = "#ffffff";
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(-44, -36);
    g.lineTo(0, -22);
    g.lineTo(44, -36);
    g.stroke();
  }
}

/** The icon on a space's top (white on clear), by kind. */
export function spaceIcon(kind: string): THREE.Texture {
  return canvasTex(128, 128, (g) => {
    g.translate(64, 64);
    drawIcon(g, kind);
  });
}

let topsC: THREE.Texture | null = null;
/**
 * Every kind's top in one atlas (4 × 2 cells of 256, KIND_C's order): a glossy candy disc, a bevel
 * ring, a highlight, the icon. Shared, kept.
 */
export function spaceTops() {
  if (topsC) return topsC;
  const kinds = Object.keys(KIND_C);
  topsC = canvasTex(1024, 512, (g) => {
    kinds.forEach((kind, i) => {
      const cx = (i % 4) * 256 + 128,
        cy = Math.floor(i / 4) * 256 + 128;
      const c = new THREE.Color(KIND_C[kind]);
      const hex = (k: THREE.Color) => `#${k.getHexString()}`;
      const light = hex(c.clone().lerp(new THREE.Color("#ffffff"), 0.38));
      const dark = hex(c.clone().multiplyScalar(0.62));
      g.save();
      g.translate(cx, cy);
      // the disc: lighter in the middle, a darker bevel at the rim
      const gr = g.createRadialGradient(-26, -30, 10, 0, 0, 128);
      gr.addColorStop(0, light);
      gr.addColorStop(0.62, KIND_C[kind]);
      gr.addColorStop(0.9, dark);
      gr.addColorStop(1, dark);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, 127, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.55)";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, 104, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "rgba(20,10,50,0.28)";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, 0, 110, 0, Math.PI * 2);
      g.stroke();
      // the gloss: a soft crescent top-left, a pin of light
      g.fillStyle = "rgba(255,255,255,0.32)";
      g.beginPath();
      g.ellipse(-30, -54, 62, 26, -0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.beginPath();
      g.ellipse(-58, -62, 13, 7, -0.6, 0, Math.PI * 2);
      g.fill();
      g.scale(1.42, 1.42);
      drawIcon(g, kind);
      g.restore();
    });
  });
  topsC.userData = SHARED;
  return topsC;
}

const diceTex: THREE.Texture[] = [];
/** The dice block's face for n (1…10), and 0: the "?" while it spins (shared, kept). */
export function diceFace(n: number) {
  if (!diceTex.length)
    for (let k = 0; k <= 10; k++) {
      const t = canvasTex(128, 128, (g) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#e9e2ff";
        g.fillRect(0, 112, 128, 16);
        g.fillRect(112, 0, 16, 128);
        g.strokeStyle = "#c4b1fc";
        g.lineWidth = 8;
        g.strokeRect(10, 10, 108, 108);
        g.font = `900 ${k === 10 ? 64 : 76}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        g.lineWidth = 10;
        g.strokeStyle = "#1a1033";
        const s = k ? String(k) : "?";
        g.strokeText(s, 64, 70);
        g.fillStyle = k ? "#ff6b35" : "#7b5cff";
        g.fillText(s, 64, 70);
      });
      t.userData = SHARED;
      diceTex.push(t);
    }
  return diceTex[Math.max(0, Math.min(10, n))];
}

let glowTexC: THREE.Texture | null = null;
/** A soft round glow (additive sprites: the sun, halos). */
export function glowTex() {
  if (glowTexC) return glowTexC;
  glowTexC = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  glowTexC.userData = SHARED;
  return glowTexC;
}

/** An additive glow sprite (a halo, the sun), its own material. */
export function halo(color: THREE.ColorRepresentation, size: number, opacity = 0.8) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.scale.set(size, size, 1);
  return m;
}

// ---- the islands -----------------------------------------------------------------------------------

/** Is (x, z) inside the polygon? */
export function inside(pts: [number, number][], x: number, z: number) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function centroid(pts: [number, number][]): [number, number] {
  let x = 0,
    z = 0;
  for (const p of pts) ((x += p[0]), (z += p[1]));
  return [x / pts.length, z / pts.length];
}

/** One layer of an island: the outline scaled about its middle, extruded `h` down from `top`. */
function slab(pts: [number, number][], k: number, top: number, h: number, color: THREE.ColorRepresentation, jitter: number, rnd: () => number) {
  const [cx, cz] = centroid(pts);
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => {
    const j = 1 + (rnd() - 0.5) * jitter;
    const px = cx + (x - cx) * k * j;
    const pz = cz + (z - cz) * k * j;
    // (the shape's y is −z: laid flat by the turn below)
    if (i === 0) shape.moveTo(px, -pz);
    else shape.lineTo(px, -pz);
  });
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, top - h, 0);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  const pos = g.attributes.position;
  for (let i = 0; i < n; i++) {
    // (darker toward the bottom of each layer)
    const y = pos.getY(i);
    const f = 0.78 + 0.22 * ((y - (top - h)) / h);
    col[i * 3] = c.r * f;
    col[i * 3 + 1] = c.g * f;
    col[i * 3 + 2] = c.b * f;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const ng = g.toNonIndexed();
  g.dispose();
  return ng;
}

/** A floating island: a grass top over a band of earth and tiers of rock tapering to a point. */
export function island(d: IslandDef, rnd: () => number, mat: THREE.Material) {
  const y = d.y ?? 0;
  const parts: THREE.BufferGeometry[] = [];
  // (its top a hair low: the painted ground (decor.ts) lies on it)
  parts.push(slab(d.pts, 1.0, y - 0.03, 0.55, d.top, 0, rnd));
  parts.push(slab(d.pts, 0.985, y - 0.5, 2.2, "#b0774a", 0.02, rnd));
  const tiers = 5;
  let top = y - 2.6;
  for (let t = 0; t < tiers; t++) {
    const k = 0.93 - t * 0.17;
    const h = (d.depth / tiers) * (0.8 + rnd() * 0.4);
    parts.push(slab(d.pts, Math.max(0.12, k), top, h, t % 2 ? "#6e5a8c" : "#7d6698", 0.12, rnd));
    top -= h * 0.92;
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(merged!, mat);
  mesh.raycast = () => {};
  return mesh;
}

// ---- scatter ---------------------------------------------------------------------------------------

/** Where decor may go: on land, off the paths, out of the landmarks' ground. */
export class Ground {
  constructor(
    private islands: IslandDef[],
    private segs: [number, number, number, number][],
    private keep: [number, number, number][],
    /** The spaces: the cameras look at them from the south (+z), so nothing tall in front. */
    private spots: [number, number][] = [],
  ) {}
  /** Free, and out of the cameras' way (not just south of a space). */
  freeTall(x: number, z: number, r = 1) {
    if (!this.free(x, z, r)) return false;
    for (const [sx, sz] of this.spots) if (Math.abs(x - sx) < 4.2 + r && z - sz > -0.5 && z - sz < 10.5) return false;
    return true;
  }
  free(x: number, z: number, r = 1, edge = r + 1.2) {
    if (!this.islands.some((i) => inside(i.pts, x, z))) return false;
    // (well in from the edge)
    for (const [dx, dz] of [
      [edge, 0],
      [-edge, 0],
      [0, edge],
      [0, -edge],
    ])
      if (!this.islands.some((i) => inside(i.pts, x + dx, z + dz))) return false;
    for (const [ax, az, bx, bz] of this.segs) {
      const vx = bx - ax,
        vz = bz - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if (Math.hypot(x - ax - vx * t, z - az - vz * t) < r + 1.6) return false;
    }
    for (const [kx, kz, kr] of this.keep) if (Math.hypot(x - kx, z - kz) < kr + r) return false;
    return true;
  }
  /**
   * How tall a thing of radius r may stand at (x, z) without hiding a player from the turn's
   * camera (it looks down at each space from the south): low just south of a space, taller further
   * off, anything behind (north of) it or well to the side.
   */
  maxH(x: number, z: number, r = 1) {
    let h = 99;
    for (const [sx, sz] of this.spots) {
      const dz = z - sz;
      if (dz + r * 0.6 < 0 || dz > 16) continue;
      const dx = Math.abs(x - sx) - r;
      if (dx > 4.4) continue;
      // (low in the turn camera's foreground, taller toward it and past it)
      const e = Math.max(0, dz - r * 0.5);
      const line = (dz < 9 ? 0.46 : Math.min(0.8, 0.46 + (dz - 9) * 0.1)) * e + 0.15;
      const a = dx < 2.6 ? line : line * 1.5 + (dx - 2.6) * 1.6;
      if (a < h) h = a;
    }
    return h;
  }
  /** On land, in from the edge by `m`. */
  land(x: number, z: number, m = 0.8) {
    return this.islands.some((i) => inside(i.pts, x, z)) && [m, -m].every((d) => this.islands.some((i) => inside(i.pts, x + d, z)) && this.islands.some((i) => inside(i.pts, x, z + d)));
  }
  /** Is (x, z) on (or within r of) a path? */
  onPath(x: number, z: number, r: number) {
    for (const [ax, az, bx, bz] of this.segs) {
      const vx = bx - ax,
        vz = bz - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if (Math.hypot(x - ax - vx * t, z - az - vz * t) < r + 1) return true;
    }
    return false;
  }
  /** Mark a spot as taken. */
  take(x: number, z: number, r: number) {
    this.keep.push([x, z, r]);
  }
}

/** How much ground each landmark keeps for itself. */
export const KEEP: Partial<Record<LandmarkDef["kind"], number>> = { mempool: 7.5, foundry: 8, needle: 5.5, prison: 6.5, lighthouse: 2.5, control: 1.8, tollgate: 2.2, monument: 4.5 };

// ---- the landmarks ---------------------------------------------------------------------------------

/** Things a landmark leaves to animate (the view turns them each frame). */
export interface Moving {
  gears: THREE.Object3D[];
  beams: THREE.Object3D[];
  blink: THREE.Object3D[];
  blimps: THREE.Object3D[];
  smoke: THREE.Vector3[];
  falls: THREE.Texture[];
  toll: THREE.Object3D[];
  lights: THREE.Object3D[];
}

export const WOOD = "#a8693e";
export const STONE = "#e9dcc6";
const FLOWERS = ["#ff5fa2", "#ffd23f", "#ffffff", "#c4b1fc", "#ff8a4c", "#ff3d56"];

/** A sign: a board on two posts, its words (one texture for all: decor's Words). */
export function sign(k: Kit, s: string, x: number, y: number, z: number, yaw: number, w = 5, bg = "#1a1033", fg = "#ffffff") {
  const v = k.v;
  v.frame(x, 0, z, yaw);
  v.box(bg, w + 0.3, w * 0.25 + 0.3, 0.25, 0, y, 0, { ink: 0.05 });
  v.box("#5a4a7a", 0.22, y, 0.22, -w * 0.4, y / 2 - 0.2, -0.05);
  v.box("#5a4a7a", 0.22, y, 0.22, w * 0.4, y / 2 - 0.2, -0.05);
  k.words.add(s, w * 0.25, x + Math.sin(yaw) * 0.14, y, z + Math.cos(yaw) * 0.14, yaw, { fg, w });
}

/** A landmark's local (lx, lz) in the world (its yaw r): (x, z); with a height: (x, y, z). */
export const W3 = (x: number, z: number, r: number, lx: number, lz: number): [number, number] => [x + lz * Math.sin(r) + lx * Math.cos(r), z + lz * Math.cos(r) - lx * Math.sin(r)];
export const P3 = (x: number, z: number, r: number, lx: number, lz: number, y: number): [number, number, number] => [x + lz * Math.sin(r) + lx * Math.cos(r), y, z + lz * Math.cos(r) - lx * Math.sin(r)];

export function buildLandmark(d: LandmarkDef, k: Kit) {
  // (the board's own kinds first: its art module, board/art/<key>.ts)
  if (k.art?.landmark?.(d, k)) return;
  const { v, mv, ground, rnd, ink, paint, pools, life, words } = k;
  const parent = k.parent;
  const { x, z } = d;
  const r = d.rot ?? 0;
  switch (d.kind) {
    case "tollgate": {
      v.frame(x, 0, z, r);
      v.box("#3a2f5c", 0.7, 4.4, 0.7, -1.9, 2.2, 0, { ink: 0.05 });
      v.box("#3a2f5c", 0.7, 4.4, 0.7, 1.9, 2.2, 0, { ink: 0.05 });
      v.box("#8c87a6", 4.8, 1.0, 0.9, 0, 4.6, 0, { ink: 0.05 });
      v.box("#ff6b35", 4.85, 0.24, 0.94, 0, 4.25, 0);
      for (const s of [-1.9, 1.9]) v.add("orb", "#ffd23f", 0.32, 0.32, 0.32, s, 5.2, 0, { glow: true });
      // a booth with its guard light
      v.box("#e8e4ff", 1.2, 1.8, 1.2, 2.9, 0.9, 0.9, { ink: 0.04 });
      v.box("#3ec6ff", 1.0, 0.6, 1.24, 2.9, 1.3, 0.9, { glow: true });
      v.roof("#ff6b35", 1.4, 0.7, 1.4, 2.9, 2.15, 0.9, { ink: 0.03 });
      words.add(d.label ?? "TOLL 10", 0.62, x + Math.sin(r) * 0.47, 4.6, z + Math.cos(r) * 0.47, r, { bg: "#1a1033", w: 3.6 });
      words.add(d.label ?? "TOLL 10", 0.62, x - Math.sin(r) * 0.47, 4.6, z - Math.cos(r) * 0.47, r + Math.PI, { bg: "#1a1033", w: 3.6 });
      // the barrier arm (lifts when someone pays)
      const arm = new THREE.Group();
      const av = new Vox(ink);
      for (let i = 0; i < 6; i++) av.box(i % 2 ? "#ffffff" : "#ff3d56", 0.6, 0.22, 0.22, 0.3 + i * 0.6, 0, 0, { ink: 0.025 });
      av.build(arm);
      arm.position.set(-1.6, 1.1, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(new THREE.Vector3(x, 0, z));
      arm.rotation.y = r;
      parent.add(arm);
      mv.toll.push(arm);
      paint.shadow(x, z, 2.6, 1.2, 0.3);
      break;
    }
    case "lighthouse": {
      v.frame(x, 0, z, 0);
      v.cyl(STONE, 1.9, 0.6, 0, 0.3, 0, { ink: 0.04 }, "hex");
      for (let i = 0; i < 5; i++) v.cyl(i % 2 ? "#ffffff" : "#ff3d56", 1.05 - i * 0.08, 1.6, 0, 1.4 + i * 1.6, 0, { ink: 0.04 });
      v.cyl("#2a1f55", 1.15, 0.3, 0, 9.4, 0, { ink: 0.03 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        v.box("#2a1f55", 0.06, 0.6, 0.06, Math.sin(a) * 1.1, 9.8, Math.cos(a) * 1.1);
      }
      v.cyl("#ffe8a0", 0.6, 1.1, 0, 10.1, 0, { glow: true });
      v.cone("#ff3d56", 0.95, 1.1, 0, 11.2, 0, { ink: 0.04 });
      v.box("#5a3a2a", 0.6, 1.0, 0.06, 0, 0.9, 1.02);
      life.searchlight(x, 10.1, z, 0.9, 14, 0, true);
      pools.add(x, z, 3.4, "#ffe7a8", 0.06, 0.5);
      paint.shadow(x, z, 1.6, 1.6, 0.35);
      break;
    }
    case "control": {
      // a lever tower: a booth, a big lever, a beacon in the bridge's colours
      v.frame(x, 0, z, r);
      v.box("#3a2f5c", 1.6, 2.6, 1.6, 0, 1.3, 0, { ink: 0.05 });
      v.box("#3ec6ff", 1.3, 0.6, 1.64, 0, 1.9, 0, { glow: true });
      v.roof("#ff6b35", 1.9, 0.9, 1.9, 0, 3.05, 0, { ink: 0.04 });
      v.box("#8c87a6", 0.5, 0.5, 0.5, 0, 0.6, 1.0);
      v.box("#d9d4f0", 0.16, 1.4, 0.16, 0, 1.2, 1.15, { rx: 0.5, ink: 0.03 });
      v.ball("#ff3d56", 0.24, 0.24, 0.24, 0, 1.85, 1.5, { ink: 0.03 });
      const b = halo("#3ec6ff", 1.6, 0.8);
      b.position.set(x, 3.9, z);
      parent.add(b);
      mv.blink.push(b);
      paint.shadow(x, z, 1.2, 1.2, 0.3);
      break;
    }
    case "houses": {
      const n = d.s ?? 5;
      const roofs = ["#ff6b35", "#c4b1fc", "#3ec6ff", "#ff5fa2", "#6dbf8a"];
      let made = 0;
      for (let tries = 0; tries < 300 && made < n; tries++) {
        const hx = x + (rnd() - 0.5) * 16;
        const hz = z + (rnd() - 0.5) * 12;
        if (!ground.free(hx, hz, 1.8)) continue;
        const room = ground.maxH(hx, hz, 1.6);
        if (room < 2.6) continue;
        ground.take(hx, hz, 2.2);
        made++;
        const w = 2 + rnd() * 1.2;
        const h = Math.min(1.8 + rnd() * 1.6, room - 1.4);
        const yaw = Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.3;
        v.frame(hx, 0, hz, yaw);
        v.box(rnd() < 0.5 ? "#f6efe2" : "#e9e2ff", w, h, w * 0.9, 0, h / 2, 0, { ink: 0.04 });
        v.box("#d9ccb4", w + 0.1, 0.3, w * 0.9 + 0.1, 0, 0.15, 0);
        v.roof(roofs[made % roofs.length], w + 0.3, 1.2, w * 0.9 + 0.3, 0, h + 0.6, 0, { ink: 0.04 });
        for (const s of [-1, 1]) {
          v.box("#ffcf7a", 0.5, 0.6, 0.06, -w * 0.25 * s, h * 0.6, (w * 0.45 + 0.01) * s, { glow: true });
          v.box("#ffffff", 0.62, 0.08, 0.1, -w * 0.25 * s, h * 0.6 - 0.34, (w * 0.45 + 0.03) * s);
          for (let f = 0; f < 3; f++) v.add("orb", FLOWERS[(made + f) % FLOWERS.length], 0.16, 0.16, 0.16, -w * 0.25 * s - 0.2 + f * 0.2, h * 0.6 - 0.24, (w * 0.45 + 0.08) * s);
        }
        v.box("#5a3a2a", 0.5, 0.9, 0.06, w * 0.2, 0.45, w * 0.45 + 0.01);
        v.box("#8c7aa8", 0.36, 1.0, 0.36, w * 0.28, h + 0.9, -w * 0.15, { ink: 0.02 });
        mv.smoke.push(new THREE.Vector3(0, h + 1.5, 0).add(new THREE.Vector3(w * 0.28, 0, -w * 0.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)).add(new THREE.Vector3(hx, 0, hz)));
        paint.shadow(hx, hz, w * 0.75, w * 0.7, 0.38);
        // a picket fence and a lamp by the door
        if (rnd() < 0.6) {
          v.frame(hx, 0, hz, yaw);
          for (let f = 0; f < 6; f++) v.box("#ffffff", 0.1, 0.5, 0.06, -w * 0.5 + f * (w / 5), 0.25, w * 0.45 + 0.9);
          v.box("#ffffff", w, 0.06, 0.05, 0, 0.38, w * 0.45 + 0.9);
        }
        pools.add(hx + Math.sin(yaw) * (w * 0.5 + 0.4), hz + Math.cos(yaw) * (w * 0.5 + 0.4), 1.6, "#ffcf7a", 0.06, 0.45);
      }
      break;
    }
    case "trees": {
      const n = d.s ?? 40;
      let made = 0;
      for (let tries = 0; tries < n * 14 && made < n; tries++) {
        const tx = -40 + rnd() * 80;
        const tz = -54 + rnd() * 86;
        if (!ground.free(tx, tz, 0.9)) continue;
        if (!tree(k, tx, tz)) continue;
        ground.take(tx, tz, 1.1);
        made++;
      }
      break;
    }
    case "garden": {
      // low things only (they may stand in the cameras' way): bushes, flower beds, rocks, ponds, benches
      for (let i = 0, made = 0; i < 1400 && made < 170; i++) {
        const gx = -40 + rnd() * 82;
        const gz = -58 + rnd() * 90;
        if (!ground.free(gx, gz, 0.5)) continue;
        made++;
        const kind = rnd();
        v.frame(gx, 0, gz, rnd() * Math.PI);
        if (kind < 0.35) {
          v.add("orb", ["#4fbf5a", "#62cc5e", "#7ad35a"][made % 3], 1.2, 0.84, 1.1, 0, 0.3, 0, { ink: 0.03 });
          if (rnd() < 0.4) for (let f = 0; f < 3; f++) v.add("orb", FLOWERS[(made + f) % FLOWERS.length], 0.18, 0.18, 0.18, (f - 1) * 0.35, 0.62, 0.2);
          paint.shadow(gx, gz, 0.7, 0.6, 0.22);
        } else if (kind < 0.6) {
          v.box("#7a4a2b", 1.4, 0.18, 0.8, 0, 0.09, 0);
          for (let f = 0; f < 6; f++) v.add("orb", FLOWERS[(made + f) % FLOWERS.length], 0.24, 0.26, 0.24, -0.5 + (f % 3) * 0.5, 0.3, f < 3 ? -0.18 : 0.18);
        } else if (kind < 0.8) {
          v.add("orb", "#8c7aa8", 0.9 + rnd() * 0.6, 0.6, 0.8 + rnd() * 0.4, 0, 0.2, 0, { ink: 0.03, ry: rnd() });
          paint.shadow(gx, gz, 0.6, 0.5, 0.2);
        } else if (kind < 0.88) {
          pond(k, gx, gz, 1.25);
        } else {
          v.box("#a8693e", 1.4, 0.12, 0.45, 0, 0.45, 0, { ink: 0.02 });
          v.box("#3a2f5c", 0.12, 0.45, 0.4, -0.55, 0.22, 0);
          v.box("#3a2f5c", 0.12, 0.45, 0.4, 0.55, 0.22, 0);
        }
      }
      // tufts of grass everywhere else
      for (let i = 0, made = 0; i < 3000 && made < 700; i++) {
        const gx = -40 + rnd() * 82;
        const gz = -58 + rnd() * 90;
        if (!ground.free(gx, gz, 0.15, 0.6)) continue;
        made++;
        v.frame(gx, 0, gz, rnd() * Math.PI);
        const c = ["#6fb352", "#86cb61", "#5fa548", "#9ad86e"][made % 4];
        v.add("cone6", c, 0.22, 0.42, 0.22, -0.1, 0.18, 0, { rz: 0.25 });
        v.add("cone6", c, 0.2, 0.36, 0.2, 0.1, 0.16, 0.05, { rz: -0.3 });
        if (made % 5 === 0) v.add("orb", FLOWERS[made % FLOWERS.length], 0.14, 0.14, 0.14, 0, 0.38, 0);
      }
      break;
    }
    case "falls": {
      // a pond, a stream to the edge, the fall over it into the clouds
      const s = d.s ?? 1;
      const ox = Math.sin(r),
        oz = Math.cos(r);
      const px = x - ox * 3.2 * s,
        pz = z - oz * 3.2 * s;
      pond(k, px, pz, 1.9 * s);
      k.water.strip(px, pz, x + ox * 0.2, z + oz * 0.2, 1.6 * s, 0.1);
      v.frame(px, 0, pz, r);
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2;
        v.add("orb", ROCKS[i % ROCKS.length], 0.5, 0.36, 0.45, Math.cos(a) * 2.0 * s, 0.15, Math.sin(a) * 2.0 * s, { ink: 0.02 });
      }
      k.falls.add(x - ox * 0.2, z - oz * 0.2, r, 2.4 * s, 0.08, 26);
      v.frame(x, 0, z, r);
      v.box("#ffffff", 2.2 * s, 0.16, 0.5, 0, 0.05, 0.1, { glow: true });
      // mist where it meets the clouds
      for (let i = 0; i < 4; i++) v.add("orb", "#ffffff", 3.2 + i, 1.6, 2.6 + i * 0.5, (i - 1.5) * 1.3, -24 - i * 0.8, 2.4 + i * 0.4, { glow: true });
      ground.take(px, pz, 2.4 * s);
      break;
    }
    default:
      dress(k, d);
  }
}

export const ROCKS = ["#8c7aa8", "#9a8ab4", "#7d6c9a", "#a596bd"];

export function crateAt(v: Vox, x: number, z: number, rnd: () => number) {
  v.frame(x, 0, z, rnd() * 3);
  v.box(WOOD, 0.9, 0.9, 0.9, 0, 0.45, 0, { ink: 0.03 });
  v.box("#7a4a2b", 0.92, 0.12, 0.92, 0, 0.45, 0);
  v.cyl("#5a7ac8", 0.32, 0.8, 1.0, 0.4, 0.2, { ink: 0.02 }, "cyl8");
  v.box("#3a2f5a", 0.3, 0.6, 0.3, 0.9, 0.3, -0.7);
}

/** A white fence round each island's edge (where it is really the edge, off the paths). */
export function fences(v: Vox, islands: IslandDef[], ground: Ground) {
  islands.forEach((isl, k) => {
    const pts = isl.pts;
    const [cx, cz] = centroid(pts);
    const posts: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.floor(len / 2.4));
      for (let j = 0; j < n; j++) {
        const f = j / n;
        let x = ax + (bx - ax) * f;
        let z = az + (bz - az) * f;
        // (in from the edge a little)
        const d = Math.hypot(cx - x, cz - z) || 1;
        x += ((cx - x) / d) * 1.0;
        z += ((cz - z) / d) * 1.0;
        // (not where another island joins on: that is no edge)
        if (islands.some((o, m) => m !== k && inside(o.pts, x + ((x - cx) / d) * 2, z + ((z - cz) / d) * 2))) {
          posts.push([NaN, NaN]);
          continue;
        }
        posts.push(ground.onPath(x, z, 1.4) ? [NaN, NaN] : [x, z]);
      }
    }
    for (let i = 0; i < posts.length; i++) {
      const [x, z] = posts[i];
      if (Number.isNaN(x)) continue;
      v.frame(0, 0, 0, 0);
      v.box("#ffffff", 0.18, 0.75, 0.18, x, 0.37, z);
      const [nx, nz] = posts[(i + 1) % posts.length];
      if (Number.isNaN(nx)) continue;
      const len = Math.hypot(nx - x, nz - z);
      if (len > 3.2) continue;
      v.box("#f1ecff", 0.08, 0.1, len, (x + nx) / 2, 0.58, (z + nz) / 2, { ry: Math.atan2(nx - x, nz - z) });
    }
  });
}

/** The cloud sea under the islands and the puffs above it (one instanced draw). */
export function cloudSea(scene: THREE.Scene, color: string, rnd: () => number, tints = ["#ffe4ee", "#fff1e6", "#f3dcff", "#ffd6dc"]) {
  const tex = canvasTex(256, 256, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 160; k++) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, "rgba(255,255,255,0.35)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.save();
      g.translate(Math.random() * 256, Math.random() * 256);
      g.scale(20 + Math.random() * 30, 12 + Math.random() * 16);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, 1, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }, true);
  tex.repeat.set(10, 10);
  const sea = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, color: "#ffffff" }));
  sea.rotation.x = -Math.PI / 2;
  sea.scale.set(1400, 1400, 1);
  sea.position.y = -34;
  scene.add(sea);
  const n = 90;
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 2), glow("#ffffff"), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 40 + rnd() * 190;
    const s = 8 + rnd() * 16;
    m.compose(new THREE.Vector3(Math.cos(a) * d, -31 + rnd() * 6, Math.sin(a) * d - 10), q, new THREE.Vector3(s * 2.2, s * 0.7, s * 1.6));
    puffs.setMatrixAt(i, m);
    puffs.setColorAt(i, c.set(tints[i % tints.length]));
  }
  puffs.computeBoundingSphere();
  scene.add(puffs);
  return { sea, puffs, tex };
}

/** Lattice trusses along the drawbridge's railings (into a Vox). */
export function truss(v: Vox, len: number, side: number, h = 1.1) {
  v.box("#e8e4ff", 0.16, 0.16, len, side, h, -len / 2, { ink: 0.025 });
  v.box("#e8e4ff", 0.16, 0.16, len, side, 0.15, -len / 2);
  const n = Math.max(2, Math.round(len / 0.9));
  for (let k = 0; k < n; k++) {
    const z0 = -(k + 0.5) * (len / n);
    v.box("#c4b1fc", 0.1, 1.3, 0.1, side, h / 2 + 0.08, z0, { rx: k % 2 ? 0.6 : -0.6 });
  }
}

export { toonSteps };
