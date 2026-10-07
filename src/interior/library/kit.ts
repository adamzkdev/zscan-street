import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Snark, loadArt } from "../../scene/snark";
import type { PickInfo, Rect } from "../types";

/**
 * The LIBRARY's shared kit. The atrium is one U of terraced shelves (Tianjin Binhai): a wall path
 * P(s) runs from the front-left corner down the left wall, round a big rounded corner, across the
 * back and up the right wall; every tier of shelves is that path pushed inwards by its own offset,
 * which undulates along s (the white waves). Floors: the atrium floor, two walkable terraces cut
 * into the waves, the reading room behind the back wall, the auditorium inside the sphere.
 */

/** Half width (walls at x = ±HW), front wall z = 0, back wall z = ZB, corner radius, ceiling. */
export const HW = 30,
  ZB = -64,
  RC = 20,
  CEIL = 32;
export const L1 = -ZB - RC,
  ARC = (Math.PI * RC) / 2,
  BACK = 2 * (HW - RC),
  LEN = 2 * L1 + 2 * ARC + BACK;

export const SPHERE = { x: 0, y: 8.6, z: -30, r: 8 };

/** Floor heights. */
export const G_Y = 0,
  T1_Y = 6,
  T2_Y = 12,
  READ_Y = 24,
  /** The auditorium floor inside the sphere (its own scene part, far below the atrium). */
  AUD_Y = -40;

/** The wall path: point and inward normal at s. */
export function pathAt(s: number): { x: number; z: number; nx: number; nz: number } {
  if (s <= L1) return { x: -HW, z: -s, nx: 1, nz: 0 };
  if (s <= L1 + ARC) {
    const th = Math.PI + (s - L1) / RC;
    const c = Math.cos(th),
      sn = Math.sin(th);
    return { x: -HW + RC + RC * c, z: ZB + RC + RC * sn, nx: -c, nz: -sn };
  }
  if (s <= L1 + ARC + BACK) return { x: -(HW - RC) + (s - L1 - ARC), z: ZB, nx: 0, nz: 1 };
  if (s <= L1 + 2 * ARC + BACK) {
    const th = 1.5 * Math.PI + (s - L1 - ARC - BACK) / RC;
    const c = Math.cos(th),
      sn = Math.sin(th);
    return { x: HW - RC + RC * c, z: ZB + RC + RC * sn, nx: -c, nz: -sn };
  }
  return { x: HW, z: ZB + RC + (s - L1 - 2 * ARC - BACK), nx: -1, nz: 0 };
}

/** (x, z) → path position s and distance d in from the wall. */
export function toPath(x: number, z: number): { s: number; d: number } {
  if (z > ZB + RC) return x < 0 ? { s: -z, d: x + HW } : { s: LEN + z, d: HW - x };
  if (Math.abs(x) <= HW - RC) return { s: L1 + ARC + (x + HW - RC), d: z - ZB };
  if (x < 0) {
    const vx = x - (-HW + RC),
      vz = z - (ZB + RC);
    let th = Math.atan2(vz, vx);
    if (th < 0) th += 2 * Math.PI;
    return { s: L1 + (th - Math.PI) * RC, d: RC - Math.hypot(vx, vz) };
  }
  const vx = x - (HW - RC),
    vz = z - (ZB + RC);
  let th = Math.atan2(vz, vx);
  if (th < 0) th += 2 * Math.PI;
  return { s: L1 + ARC + BACK + (th - 1.5 * Math.PI) * RC, d: RC - Math.hypot(vx, vz) };
}

/** The waves: symmetric about the middle of the back wall, in [-1, 1]. */
export function wave(s: number) {
  const u = Math.abs(s - LEN / 2);
  return 0.62 * Math.sin((2 * Math.PI * u) / 24 + 0.5) + 0.38 * Math.sin((2 * Math.PI * u) / 9.7 + 1.9);
}

export interface Tier {
  y0: number;
  h: number;
  /** Mean offset of the front from the wall and the wave's amplitude. */
  o: number;
  a: number;
  band: 0 | 1 | 2;
  k: number;
  /** Vertical wave amplitude of its bottom edge (the upper tiers rise and fall). */
  v: number;
}

/** The tiers, bottom to top: the seating steps, the first terrace's shelves, the tall upper waves. */
export const TIERS: Tier[] = [
  ...Array.from({ length: 5 }, (_, k): Tier => ({ y0: 1.2 * k, h: 1.2, o: 14 - 0.6 * k, a: 1.0, band: 0, k, v: 0 })),
  ...Array.from({ length: 5 }, (_, k): Tier => ({ y0: 6 + 1.2 * k, h: 1.2, o: 8.4 - 0.5 * k, a: 0.9, band: 1, k, v: 0 })),
  ...Array.from({ length: 10 }, (_, k): Tier => ({ y0: 12 + 1.2 * k, h: 1.2, o: 3.4 - 0.3 * k, a: Math.max(0.25, 0.9 - 0.07 * k), band: 2, k, v: k < 3 ? 0 : 0.2 * (k - 2) })),
];
export const TOP_Y = 24;
/** Amplitude of the vertical wave along the top of the shelves. */
export const TOP_V = 1.6;

/** The vertical wave: the upper shelves swell towards the middle of each wall. */
export function vwave(s: number) {
  const u = Math.abs(s - LEN / 2);
  return -Math.cos((2 * Math.PI * u) / 34);
}
/** Bottom and top of tier `ti` at s. */
export function tierY(ti: number, s: number): [number, number] {
  const t = TIERS[ti];
  const n = TIERS[ti + 1];
  const w = vwave(s);
  return [t.y0 + t.v * w, n ? n.y0 + n.v * w : TOP_Y + TOP_V * w];
}

export const offset = (t: Tier, s: number) => t.o + t.a * wave(s);
/** World point of a tier's front at s, pulled in by `inset` (towards the wall when positive). */
export function frontAt(t: Tier, s: number, inset = 0) {
  const p = pathAt(s);
  const o = offset(t, s) - inset;
  return { x: p.x + p.nx * o, z: p.z + p.nz * o, nx: p.nx, nz: p.nz };
}

/** The tiers stop just short of the front (eye) wall, from s = S0 to LEN − S0. */
export const S0 = 0.35;

/** Rects covering where `blocked(x, z)` is true, on a 0.5 m grid (runs merged per row). */
export function gridRects(x0: number, z0: number, x1: number, z1: number, blocked: (x: number, z: number) => boolean, cell = 0.5): Rect[] {
  const out: Rect[] = [];
  for (let z = z0; z < z1; z += cell) {
    let run: number | null = null;
    for (let x = x0; x <= x1; x += cell) {
      const b = x < x1 && blocked(x + cell / 2, z + cell / 2);
      if (b && run === null) run = x;
      if (!b && run !== null) {
        out.push([run, z, x, z + cell]);
        run = null;
      }
    }
  }
  return out;
}

export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { c, g, t, redraw: () => (draw(g, w, h), (t.needsUpdate = true)) };
}

export const std = (color: string, roughness = 0.8, metalness = 0.02, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
export const glow = (color: string, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

/** A label in a plaque: dark text on a light ground or light on dark. */
export function plaque(lines: string[], o: { w: number; h: number; bg?: string; fg?: string; accent?: string; px?: number }) {
  const px = o.px ?? 256;
  const W = Math.round(o.w * px),
    H = Math.round(o.h * px);
  const { t } = canvasTex(W, H, (g) => {
    g.fillStyle = o.bg ?? "#f6f3ec";
    g.fillRect(0, 0, W, H);
    if (o.accent) {
      g.fillStyle = o.accent;
      g.fillRect(0, 0, Math.max(6, H * 0.08), H);
    }
    g.fillStyle = o.fg ?? "#1a1816";
    g.textBaseline = "middle";
    const n = lines.length;
    lines.forEach((l, i) => {
      const size = i === 0 ? H / (n + 0.9) : (H / (n + 0.9)) * 0.72;
      g.font = `${i === 0 ? 800 : 500} ${size}px "JetBrains Mono", Menlo, monospace`;
      let s = size;
      while (g.measureText(l).width > W - H * 0.4 && s > 6) {
        s -= 1;
        g.font = `${i === 0 ? 800 : 500} ${s}px "JetBrains Mono", Menlo, monospace`;
      }
      g.fillText(l, H * 0.22 + (o.accent ? H * 0.08 : 0), ((i + 0.5 + (i ? 0.25 : 0.1)) * H) / (n + 0.35));
    });
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: t, toneMapped: true }));
}

/** Static geometry collected per material and merged into one mesh each. */
export class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("color")) {
      const n = g.getAttribute("position").count;
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g = (g.deleteAttribute(k), g);
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
  }
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    this.add(mat, g);
  }
  cyl(mat: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 12) {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    g.translate(x, y + h / 2, z);
    this.add(mat, g);
  }
  flush(parent: THREE.Object3D) {
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mat);
      mesh.raycast = () => {};
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

/** Quads built by hand (the waves), with vertex colours for a little baked shading. */
export class Quads {
  pos: number[] = [];
  col: number[] = [];
  /** a, b, c, d counter-clockwise seen from the front. */
  quad(a: number[], b: number[], c: number[], d: number[], shade: number | [number, number, number, number] = 1) {
    const s = typeof shade === "number" ? [shade, shade, shade, shade] : shade;
    const tri = (p: number[], q: number[], r: number[], sp: number, sq: number, sr: number) => {
      this.pos.push(...p, ...q, ...r);
      this.col.push(sp, sp, sp, sq, sq, sq, sr, sr, sr);
    };
    tri(a, b, c, s[0], s[1], s[2]);
    tri(a, c, d, s[0], s[2], s[3]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** One floor: its group, colliders, clickables, people and per-frame ticks. */
export class Level {
  readonly group = new THREE.Group();
  rects: Rect[] = [];
  readonly picks = new Map<THREE.Object3D, { hover: string | ((hit: THREE.Intersection) => string | null); info: (hit: THREE.Intersection) => PickInfo | null }>();
  readonly people: Snark[] = [];
  readonly ticks: ((dt: number, t: number) => void)[] = [];
  readonly m = new Merger();
  /** The walker's eye (set every frame) and whether the walker is on this floor. */
  readonly eye = new THREE.Vector3();
  here = false;

  constructor(readonly y: number) {}

  pick(o: THREE.Object3D, hover: string | ((hit: THREE.Intersection) => string | null), info: (hit: THREE.Intersection) => PickInfo | null) {
    this.picks.set(o, { hover, info });
  }

  find(o: THREE.Object3D | null) {
    for (let x = o; x; x = x.parent) {
      const p = this.picks.get(x);
      if (p) return p;
    }
    return null;
  }

  /** A zkSNARK reader: whispers its lines when the walker comes near; may sit or wander. */
  async person(id: number, x: number, y: number, z: number, role: string, o: { lines?: string[]; sit?: boolean; face?: THREE.Vector3; near?: number; wander?: [number, number][]; info?: () => PickInfo } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.set(x, y, z);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      this.group.add(s.root);
      this.people.push(s);
      const lines = o.lines ?? [];
      let said = Math.floor(Math.random() * 7);
      let wait = 2 + Math.random() * 6;
      if (lines.length) {
        const near = o.near ?? 7;
        this.ticks.push((dt) => {
          wait -= dt;
          if (wait > 0 || !this.here) return;
          wait = 1;
          const p = s.root.position;
          if (Math.abs(this.eye.y - 1.6 - p.y) < 2.5 && Math.hypot(this.eye.x - p.x, this.eye.z - p.z) < near && Level.quiet()) {
            s.say(lines[said++ % lines.length], 3.6);
            wait = 9 + Math.random() * 10;
          }
        });
      }
      if (o.info) {
        delete s.root.userData.snarkRef;
        const info = o.info;
        this.pick(s.body, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => {
          if (lines.length) s.say(lines[said++ % lines.length], 3.2);
          return info();
        });
      }
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 6000 + Math.random() * 10000));
            if (!this.group.visible) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], y, p[1])], 0.75);
            s.faceDir = o.face ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /** A library is hushed: one whisper at a time, a few seconds apart. */
  static last = 0;
  static quiet() {
    const now = performance.now();
    if (now - Level.last < 4500) return false;
    Level.last = now;
    return true;
  }
}

export const fmt = (n: number) => n.toLocaleString("en-US");
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
