import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import { hash } from "../../scene/voxel/model";
import { place } from "../furniture";
import type { VoxelModel } from "../../scene/voxel/model";
import { textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The penitentiary's kit: the plan (aisles, blocks, tiers), batched static geometry (one mesh per
 * material), instanced bars, painted textures (peeling paint, concrete, grating), walkable areas
 * turned into colliders, clickable things, and the people.
 */

// ---- the plan (metres; the street door is on z = 0, Broadway runs north to the dining hall) ----

export const TIER = 2.75;
export const CELL_H = 2.5;
export const BARS_H = 2.15;
export const CELL_D = 2.7;
export const WALK = 1.1;
export const HALL = { x0: -16, x1: 16, z0: -42, z1: 0, h: 13 };
export const DINING = { x0: -16, x1: 16, z0: -62, z1: -42.3, h: 5 };
/** Blocks run from z = -32 (north, Times Square) to z = -8 (south, the cutoff). */
export const BLOCK_Z0 = -32,
  BLOCK_Z1 = -8;
export const GALLERY = { x0: -9.6, x1: 15.6, z0: -1.9, z1: -0.1, y: 3.0 };

export const FLOORS = [
  { label: "G", name: "Broadway · cell house, dining hall, library", y: 0 },
  { label: "2", name: "Second tier · walkways", y: TIER },
  { label: "3", name: "Third tier · walkways", y: TIER * 2 },
  { label: "GG", name: "West gun gallery", y: GALLERY.y },
];

/** One row of cells along x = `front`, opening toward `dir` (+1: +x, -1: -x). */
export interface Face {
  block: "A" | "B" | "C" | "D";
  front: number;
  dir: 1 | -1;
  z0: number;
  n: number;
  cw: number;
  /** First cell number on the ground tier (B-101…). */
  num: number;
  aisle: string;
}

export const FACES: Face[] = [
  { block: "A", front: -13, dir: 1, z0: BLOCK_Z0, n: 15, cw: 1.6, num: 101, aisle: "Michigan Avenue" },
  { block: "B", front: -9.2, dir: -1, z0: BLOCK_Z0, n: 15, cw: 1.6, num: 101, aisle: "Michigan Avenue" },
  { block: "B", front: -3, dir: 1, z0: BLOCK_Z0, n: 15, cw: 1.6, num: 131, aisle: "Broadway" },
  { block: "C", front: 3, dir: -1, z0: BLOCK_Z0, n: 15, cw: 1.6, num: 101, aisle: "Broadway" },
  { block: "C", front: 9.2, dir: 1, z0: BLOCK_Z0, n: 15, cw: 1.6, num: 131, aisle: "Seedy Street" },
  { block: "D", front: 13, dir: -1, z0: -30, n: 10, cw: 2.2, num: 1, aisle: "Seedy Street" },
];

/** A cell's frame: origin at the middle of its front on the tier floor, local +z out of the cell. */
export function cellMatrix(f: Face, i: number, tier: number) {
  const m = new THREE.Matrix4().makeRotationY((f.dir * Math.PI) / 2);
  m.setPosition(f.front, tier * TIER, f.z0 + (i + 0.5) * f.cw);
  return m;
}
export function cellNumber(f: Face, i: number, tier: number) {
  if (f.block === "D") return `D-${tier * f.n + i + 1}`;
  return `${f.block}-${tier + 1}${String((f.num % 100) + i).padStart(2, "0")}`;
}

// ---- textures --------------------------------------------------------------------------------

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Old institutional paint, flaking off in patches over the grey undercoat, stained low down. */
export function peeling(base: string, under: string, seed = 1, stain = true) {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2200; i++) {
      const v = hash(i, 1, seed) * 0.08;
      g.fillStyle = hash(i, 9, seed) > 0.5 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`;
      g.fillRect(hash(i, 2, seed) * 512, hash(i, 3, seed) * 512, 2 + hash(i, 4, seed) * 6, 2 + hash(i, 5, seed) * 6);
    }
    // flakes: the undercoat showing through in a few weathered zones, a faint rim where it lifts
    for (let zi = 0; zi < 5; zi++) {
      const zx = hash(zi, 6, seed) * 512,
        zy = hash(zi, 7, seed) * 512;
      for (let i = 0; i < 26; i++) {
        const cx = zx + (hash(zi, i, seed + 1) - 0.5) * 140,
          cy = zy + (hash(zi, i, seed + 2) - 0.5) * 100,
          r = 2 + hash(zi, i, seed + 4) ** 2 * 11;
        g.beginPath();
        for (let a = 0; a < 9; a++) {
          const ang = (a / 9) * Math.PI * 2,
            rr = r * (0.55 + hash(i, a, seed + 3 + zi) * 0.6);
          g[a ? "lineTo" : "moveTo"](((cx % 512) + 512) % 512 + Math.cos(ang) * rr, ((cy % 512) + 512) % 512 + Math.sin(ang) * rr * 0.75);
        }
        g.closePath();
        g.globalAlpha = 0.5;
        g.fillStyle = under;
        g.fill();
        g.globalAlpha = 0.25;
        g.strokeStyle = "#3a352c";
        g.lineWidth = 1;
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    if (stain)
      for (let i = 0; i < 9; i++) {
        const x = hash(i, 11, seed) * 512;
        const gr = g.createLinearGradient(0, 0, 0, 512);
        gr.addColorStop(0, "rgba(90,70,40,0.09)");
        gr.addColorStop(1, "rgba(90,70,40,0)");
        g.fillStyle = gr;
        g.fillRect(x, 0, 3 + hash(i, 12, seed) * 8, 120 + hash(i, 13, seed) * 300);
      }
  });
}

export function concrete(base = "#7d7b74", seed = 2) {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      const v = hash(i, 1, seed) * 0.09;
      g.fillStyle = hash(i, 2, seed) > 0.5 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`;
      g.fillRect(hash(i, 3, seed) * 512, hash(i, 4, seed) * 512, 1 + hash(i, 5, seed) * 4, 1 + hash(i, 6, seed) * 4);
    }
    // polished, scuffed, cracked, expansion joints every 2 m (the texture is 4 m)
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(30,28,24,${0.15 + hash(i, 7, seed) * 0.2})`;
      g.lineWidth = 1;
      g.beginPath();
      let x = hash(i, 8, seed) * 512,
        y = hash(i, 9, seed) * 512;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) g.lineTo((x += (hash(i, k, seed + 5) - 0.5) * 40), (y += (hash(i, k, seed + 6) - 0.5) * 40));
      g.stroke();
    }
    g.fillStyle = "rgba(20,18,16,0.35)";
    g.fillRect(0, 0, 512, 2);
    g.fillRect(0, 256, 512, 2);
    g.fillRect(0, 0, 2, 512);
    g.fillRect(256, 0, 2, 512);
  });
}

export function grating() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#54564f";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#2a2b27";
    for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 8) g.fillRect(x + 2, y + 3, 4, 10);
  });
}

// ---- batched geometry ------------------------------------------------------------------------

const tmpM = new THREE.Matrix4();

/** Static boxes collected per material and merged into one mesh each. */
export class Batch {
  private lists = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(g: THREE.BufferGeometry, mat: THREE.Material) {
    let l = this.lists.get(mat);
    if (!l) this.lists.set(mat, (l = []));
    l.push(g);
  }

  /**
   * A box `w × h × d` standing on (x, y, z) (y is its bottom), its texture tiled every `tile`
   * metres; `m` places it in a frame (a cell's) afterwards.
   */
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, m?: THREE.Matrix4, tile = 4) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, (uv.getX(f * 4 + k) * dims[f][0]) / tile, (uv.getY(f * 4 + k) * dims[f][1]) / tile);
    g.translate(x, y + h / 2, z);
    if (m) g.applyMatrix4(m);
    this.add(g, mat);
    return g;
  }

  /** Any geometry, moved by `m`. */
  geo(mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    if (m) g.applyMatrix4(m);
    this.add(g.index ? g : g, mat);
  }

  /** Merge everything into `parent`. */
  flush(parent: THREE.Object3D) {
    for (const [mat, list] of this.lists) {
      const indexed = list.filter((g) => g.index),
        flat = list.filter((g) => !g.index);
      for (const part of [indexed, flat]) {
        if (!part.length) continue;
        for (const g of part) for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        const merged = mergeGeometries(part, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
      }
      for (const g of list) g.dispose();
    }
    this.lists.clear();
  }
}

/** Many copies of one small mesh (bars, posts): matrices collected, one InstancedMesh at the end. */
export class Instances {
  private ms: THREE.Matrix4[] = [];
  constructor(
    readonly geo: THREE.BufferGeometry,
    readonly mat: THREE.Material,
  ) {}
  /** A copy scaled (sx, sy, sz), turned `rot` about y, at (x, y, z), then moved by `m`. */
  put(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, m?: THREE.Matrix4, rx = 0, rot = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, rot, 0));
    const a = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    this.ms.push(m ? tmpM.copy(m).multiply(a).clone() : a);
  }
  /** A bar from a to b (vertical or horizontal), radius scale `r`. */
  bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r = 1, m?: THREE.Matrix4) {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    const a = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(r, len, r));
    this.ms.push(m ? tmpM.copy(m).multiply(a).clone() : a);
  }
  flush(parent: THREE.Object3D) {
    if (!this.ms.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.ms.length);
    this.ms.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.frustumCulled = false;
    parent.add(im);
    return im;
  }
}

// ---- walkable areas → colliders ---------------------------------------------------------------

/**
 * Everything inside `bounds` that no `open` rectangle covers, as blocking rectangles: the walker
 * can only be where the plan says people walk (aisles, walkways, rooms, open cells).
 */
export function complement(bounds: Rect, open: Rect[]): Rect[] {
  const [X0, Z0, X1, Z1] = bounds;
  const xs = [...new Set([X0, X1, ...open.flatMap((r) => [r[0], r[2]]).filter((x) => x > X0 && x < X1)])].sort((a, b) => a - b);
  const out: Rect[] = [];
  let prev: { x0: number; gaps: [number, number][] } | null = null;
  const flushPrev = (x1: number) => {
    if (prev) for (const [a, b] of prev.gaps) out.push([prev.x0, a, x1, b]);
  };
  for (let k = 0; k < xs.length - 1; k++) {
    const xa = xs[k],
      xb = xs[k + 1];
    const iv = open.filter((r) => r[0] <= xa + 1e-6 && r[2] >= xb - 1e-6).map((r) => [Math.max(Z0, r[1]), Math.min(Z1, r[3])] as [number, number]);
    iv.sort((a, b) => a[0] - b[0]);
    const gaps: [number, number][] = [];
    let z = Z0;
    for (const [a, b] of iv) {
      if (a > z + 1e-6) gaps.push([z, a]);
      z = Math.max(z, b);
    }
    if (z < Z1 - 1e-6) gaps.push([z, Z1]);
    const same = prev && prev.gaps.length === gaps.length && prev.gaps.every((g, i) => Math.abs(g[0] - gaps[i][0]) < 1e-6 && Math.abs(g[1] - gaps[i][1]) < 1e-6);
    if (!same) {
      flushPrev(xa);
      prev = { x0: xa, gaps };
    }
  }
  flushPrev(X1);
  return out;
}

/** A local rectangle of a cell, in world x/z. */
export function cellRect(m: THREE.Matrix4, x0: number, z0: number, x1: number, z1: number): Rect {
  const ps = [new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z1)].map((p) => p.applyMatrix4(m));
  return [Math.min(ps[0].x, ps[1].x), Math.min(ps[0].z, ps[1].z), Math.max(ps[0].x, ps[1].x), Math.max(ps[0].z, ps[1].z)];
}

// ---- the kit ---------------------------------------------------------------------------------

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit?: THREE.Intersection) => PickInfo | null;

export class PrisonKit {
  readonly root = new THREE.Group();
  readonly b = new Batch();
  /** Walkable rectangles per floor (turned into colliders at the end) and extra blockers. */
  readonly open: Rect[][] = FLOORS.map(() => []);
  readonly solid: Rect[][] = FLOORS.map(() => []);
  readonly people: Snark[] = [];
  readonly ticks: Tick[] = [];
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  current = 0;
  /** The skylights' glass and the daylight shafts under them (day/night). */
  sky: THREE.MeshBasicMaterial | null = null;
  shafts: THREE.Object3D | null = null;
  private lastHeight = 0;
  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }

  // materials
  readonly paintCell = new THREE.MeshStandardMaterial({ map: peeling("#b8c0ae", "#8e9286", 3), roughness: 0.9 });
  readonly paintBlock = new THREE.MeshStandardMaterial({ map: peeling("#aeb6a6", "#d8d6cc", 5), roughness: 0.85 });
  readonly paintWall = new THREE.MeshStandardMaterial({ map: peeling("#c4c2b2", "#8f8c80", 7), roughness: 0.92 });
  readonly paintLow = new THREE.MeshStandardMaterial({ map: peeling("#5f7a68", "#a8aa9c", 9), roughness: 0.8 });
  readonly floorMat = new THREE.MeshStandardMaterial({ map: concrete(), roughness: 0.5, metalness: 0.05 });
  readonly deck = new THREE.MeshStandardMaterial({ map: grating(), roughness: 0.6, metalness: 0.5 });
  readonly steel = new THREE.MeshStandardMaterial({ color: "#d3d0bf", roughness: 0.45, metalness: 0.55 });
  readonly darkSteel = new THREE.MeshStandardMaterial({ color: "#3a3c3a", roughness: 0.5, metalness: 0.6 });
  readonly rust = new THREE.MeshStandardMaterial({ color: "#6a5040", roughness: 0.8, metalness: 0.3 });
  readonly porcelain = new THREE.MeshStandardMaterial({ color: "#e6e4dc", roughness: 0.25, metalness: 0.05 });
  readonly wood = new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.7 });
  readonly darkWood = new THREE.MeshStandardMaterial({ color: "#4a3222", roughness: 0.6 });
  readonly mattress = new THREE.MeshStandardMaterial({ color: "#b8b2a0", roughness: 0.95 });
  readonly blankets = ["#5a6a5a", "#4a5568", "#6a5a4a", "#55504a"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  readonly bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff2d0").multiplyScalar(2.2), toneMapped: false });
  readonly items = ["#8a3a2a", "#2a4a7a", "#c8b070", "#3a6a3a", "#d8d4cc", "#6a4a8a"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));

  readonly bars = new Instances(new THREE.CylinderGeometry(0.019, 0.019, 1, 6), this.steel);
  readonly flats = new Instances(new THREE.BoxGeometry(1, 1, 1), this.steel);
  readonly posts = new Instances(new THREE.CylinderGeometry(0.024, 0.024, 1, 6), this.steel);

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    scene.add(this.root);
    ctx.onBlock((h) => (this.lastHeight = h));
  }

  pick(o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  /** An invisible box to click on (a door, a desk, a shelf). */
  hit(w: number, h: number, d: number, x: number, y: number, z: number, hover: string, info: PickFn, rot = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rot;
    this.root.add(m);
    this.pick(m, hover, info);
    return m;
  }

  label(text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.3, color: o.color ?? "#20201c", bg: o.bg, glow: o.glow, font: o.font });
    p.position.set(x, y, z);
    p.rotation.y = o.rot ?? 0;
    this.root.add(p);
    return p;
  }

  /** A flat painted picture (poster, board, sign) of `w × h` metres. */
  picture(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, x: number, y: number, z: number, rot = 0, o: { px?: number; glow?: boolean; transparent?: boolean } = {}) {
    const W = o.px ?? 512,
      H = Math.round((W * h) / w);
    const t = canvasTex(W, H, (g) => draw(g, W, H), false);
    const mat = o.glow ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: !!o.transparent }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, transparent: !!o.transparent });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = rot;
    this.root.add(m);
    return { mesh: m, tex: t, redraw: () => (draw((t.image as HTMLCanvasElement).getContext("2d")!, W, H), (t.needsUpdate = true)) };
  }

  /** Voxel furniture at (x, y, z); `solid` adds its footprint to floor f's blockers. */
  put(key: string, build: () => VoxelModel, x: number, y: number, z: number, rot = 0, solid: number | null = 0) {
    const o = place(this.root, key, build, x, y, z, rot);
    if (solid !== null) {
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      this.solid[solid].push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return o;
  }

  /**
   * A zkSNARK. `talk`: lines said in a bubble when the walker comes near (and on a click when
   * `info` is given, which turns it into a plain clickable instead of a chat partner).
   */
  async person(id: number, at: [number, number, number], role: string, o: { face?: THREE.Vector3; cap?: boolean; sit?: boolean; wander?: [number, number][]; talk?: string[]; info?: () => PickInfo; near?: number } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      // kitchen staff in a toque (painted on, fitted to the head)
      if (role === "Chef" || role === "Cook") s.wear({ hat: "chef" });
      s.root.position.set(at[0], at[1], at[2]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.cap) s.setCap();
      if (o.sit) s.sit(true);
      this.root.add(s.root);
      this.people.push(s);
      const lines = o.talk ?? [];
      let said = Math.floor(Math.random() * 10);
      let wait = 1 + Math.random() * 4;
      const say = () => lines.length && s.say(lines[said++ % lines.length], 3.6);
      if (lines.length) {
        const near = o.near ?? 7;
        const cam = new THREE.Vector3();
        this.ticks.push((dt) => {
          wait -= dt;
          if (wait > 0) return;
          wait = 1;
          this.camPos(cam);
          if (Math.abs(cam.y - 1.6 - s.root.position.y) < 1.5 && Math.hypot(cam.x - s.root.position.x, cam.z - s.root.position.z) < near) {
            say();
            wait = 7 + Math.random() * 8;
          }
        });
      }
      if (o.info) {
        // a plain clickable (facts on a panel), not a chat partner
        delete s.root.userData.snarkRef;
        const info = o.info;
        this.pick(s.body, `<b>${role}</b><span>click</span>`, () => {
          say();
          wait = 6;
          return info();
        });
      }
      if (o.wander) {
        const w = o.wander,
          base = at[1];
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 3000 + Math.random() * 6000));
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.9);
            s.faceDir = o.face ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /** Where the walker's eye is (set every frame). */
  readonly eye = new THREE.Vector3();
  camPos(out: THREE.Vector3) {
    return out.copy(this.eye);
  }

  image(id: number) {
    return ZScan.zkSnarkImage(id);
  }
}
