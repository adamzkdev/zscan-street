import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../../data/market";
import { API, ZScan } from "../../data/zscan";
import { loadArt, Snark } from "../../scene/snark";
import type { Tone } from "../../scene/speech";
import { meshModel, MATERIALS } from "../../scene/voxel/mesher";
import { hash, type Kind, type VoxelModel } from "../../scene/voxel/model";
import { textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * BURJ AL ZEC's kit: its levels, one group per floor (only the floor you are on is drawn, lit and
 * animated), colliders, people who talk (to you and to each other), ticks, the lifts, fish, and
 * the batching every floor relies on: plain geometry merged into one mesh per finish, voxel
 * furniture merged per voxel material.
 */

export interface Level {
  label: string;
  name: string;
  y: number;
  spawn: [number, number];
  yaw: number;
  /** Height of the city panorama (metres above the street), for floors with windows. */
  view?: number;
}

export const LEVELS: Level[] = [
  { label: "G", name: "Gold Atrium · lobby, dancing fountain", y: 0, spawn: [0, 4.2], yaw: 0 },
  { label: "B", name: "Al Mahara · underwater restaurant", y: -16, spawn: [0, -2.4], yaw: 0 },
  { label: "25", name: "Royal Suite · salon", y: 40, spawn: [0, -2.4], yaw: 0, view: 38 },
  { label: "26", name: "Royal Suite · bedroom", y: 45, spawn: [7.6, -11], yaw: Math.PI / 2, view: 43 },
  { label: "H", name: "Helipad · tennis court, golf tee", y: 56, spawn: [9.4, -14], yaw: Math.PI / 2, view: 50 },
];
export const F = { atrium: 0, mahara: 1, salon: 2, bedroom: 3, helipad: 4 } as const;
/** The floors bottom to top (the lift panel follows this). */
export const ORDER = LEVELS.map((_, i) => i).sort((a, b) => LEVELS[a].y - LEVELS[b].y);
export const LIGHTS_PER_FLOOR = 6;
/** Metres from the street door (the island's lot edge) to the tower: where the panoramas are taken. */
export const BACK = -14;

export const GOLD = "#f4b728";
export const PAL = {
  gold: "#d9a92e",
  goldDeep: "#a87a1c",
  goldPale: "#f0cf72",
  marble: "#efe9de",
  marbleShade: "#d8cfc0",
  red: "#9a1424",
  royalBlue: "#1a3a8a",
  turquoise: "#18a0b0",
  navy: "#0e1a3a",
  walnut: "#4a2e1c",
  black: "#141218",
  white: "#f6f3ec",
  cream: "#efe2c4",
};
export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SERIF = 'Georgia, "Times New Roman", serif';

export type Tick = (dt: number, t: number) => void;
export type PickFn = () => PickInfo | null;
export type Finish = "matte" | "polish" | "metal" | "glow" | "glass";
/** A line said in a bubble; a function reads the live chain when it is said. */
export type Line = string | (() => string);
const said = (l: Line) => (typeof l === "string" ? l : l());

const FINISH: Record<Finish, THREE.Material> = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
  polish: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.06, envMapIntensity: 1.3 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.92, envMapIntensity: 1.6 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.18, depthWrite: false }),
};

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

/** A canvas texture drawn once (repeat it with `rx`, `ry`). */
export function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, rx = 1, ry = 1) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rx !== 1 || ry !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
  }
  return t;
}

/** A live surface: canvas, its texture, and a self-lit material for screens. */
export class Surface {
  readonly c: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshBasicMaterial;
  constructor(
    readonly W: number,
    readonly H: number,
    k = 1.1,
  ) {
    [this.c, this.g] = canvas(W, H);
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mat.color.setScalar(k);
  }
  draw(fn: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
    fn(this.g, this.W, this.H);
    this.tex.needsUpdate = true;
  }
}

/** Plain geometry of one floor, merged per finish (vertex colours). */
class Batch {
  private lists = new Map<Finish, THREE.BufferGeometry[]>();
  add(finish: Finish, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    let l = this.lists.get(finish);
    if (!l) this.lists.set(finish, (l = []));
    l.push(g);
  }
  build(parent: THREE.Object3D) {
    for (const [finish, list] of this.lists) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geo) continue;
      const m = new THREE.Mesh(geo, FINISH[finish]);
      m.matrixAutoUpdate = false;
      m.raycast = () => {};
      if (finish === "glass") m.renderOrder = 2;
      parent.add(m);
    }
    this.lists.clear();
  }
}

/** Voxel furniture of one floor, merged per voxel material. */
class Voxels {
  private static cache = new Map<string, Partial<Record<Kind, THREE.BufferGeometry>>>();
  private parts: Record<Kind, THREE.BufferGeometry[]> = { solid: [], glass: [], emit: [] };
  add(key: string, make: () => VoxelModel, m: THREE.Matrix4) {
    let g = Voxels.cache.get(key);
    if (!g) Voxels.cache.set(key, (g = meshModel(make())));
    const box = new THREE.Box3();
    for (const kind of ["solid", "glass", "emit"] as Kind[]) {
      const geo = g[kind];
      if (!geo) continue;
      const c = geo.clone().applyMatrix4(m);
      c.computeBoundingBox();
      box.union(c.boundingBox!);
      this.parts[kind].push(c);
    }
    return box;
  }
  build(parent: THREE.Object3D) {
    for (const kind of ["solid", "glass", "emit"] as Kind[]) {
      if (!this.parts[kind].length) continue;
      const geo = mergeGeometries(this.parts[kind]);
      this.parts[kind].forEach((p) => p.dispose());
      this.parts[kind] = [];
      if (!geo) continue;
      const m = new THREE.Mesh(geo, MATERIALS[kind]);
      m.raycast = () => {};
      parent.add(m);
    }
  }
}

// ---- zkSNARK busts from the collection atlas (guests on the balconies) --------------------------

let atlas: THREE.Texture | null = null;
function atlasTexture() {
  if (atlas) return atlas;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  atlas = loader.load(`${API}/v1/collections/zksnarks/map/image`);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}
const CROWD_VERT = /* glsl */ `
attribute float aSlot;
attribute float aPhase;
uniform float uTime;
varying vec2 vAt;
void main() {
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(instanceMatrix[0].xyz);
  vec3 f = cameraPosition - c;
  f.y = 0.0;
  f = normalize(f + vec3(0.0001, 0.0, 0.0));
  vec3 r = vec3(f.z, 0.0, -f.x);
  float bob = abs(sin(uTime * (1.4 + fract(aPhase * 7.3) * 1.6) + aPhase * 6.283)) * 0.03;
  vec3 p = c + r * position.x * s + vec3(0.0, position.y * s + bob, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float col = mod(aSlot, 100.0);
  float row = floor(aSlot / 100.0);
  vec2 q = uv * 0.94 + 0.03;
  vAt = vec2((col + q.x) / 100.0, 1.0 - (row + 1.0 - q.y) / 100.0);
}`;
const CROWD_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vAt;
void main() {
  vec4 t = texture2D(map, vAt);
  if (max(t.r, max(t.g, t.b)) < 0.035) discard;
  gl_FragColor = vec4(t.rgb, 1.0);
  #include <colorspace_fragment>
}`;

// ---- fish ---------------------------------------------------------------------------------------

/** One fish, nose on +x: body, tail fin, dorsal fin (unit length 1). */
function fishGeometry() {
  const parts = [new THREE.BoxGeometry(0.62, 0.32, 0.16).translate(0.04, 0, 0), new THREE.BoxGeometry(0.22, 0.22, 0.12).translate(0.38, 0, 0), new THREE.BoxGeometry(0.18, 0.34, 0.04).translate(-0.34, 0, 0), new THREE.BoxGeometry(0.2, 0.1, 0.04).translate(0.02, 0.2, 0)];
  return mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
}
const FISH_COLORS = ["#ff8a1a", "#ffd23a", "#3ab8ff", "#ff4a6a", "#f4f4f0", "#7a5cff", "#2ad8a0", "#ff6a2a", "#f4b728"];

export interface School {
  mesh: THREE.InstancedMesh;
}

// ---- the kit ------------------------------------------------------------------------------------

export class ArabKit {
  readonly groups = LEVELS.map(() => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  readonly ticks: Tick[][] = LEVELS.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  private casts: (() => void)[][] = LEVELS.map(() => []);
  private cast = LEVELS.map(() => false);
  readonly arrive: (() => void)[][] = LEVELS.map(() => []);
  private batches = LEVELS.map(() => new Batch());
  private voxels = LEVELS.map(() => new Voxels());
  private lightCount = LEVELS.map(() => 0);
  readonly blockFns: ((h: number) => void)[] = [];
  /** Per-floor ground heights (stairs, a dais), checked in order. */
  readonly grounds: ((x: number, z: number) => number | null)[][] = LEVELS.map(() => []);
  current = 0;
  /** The walker's eye, every frame. */
  readonly eye = new THREE.Vector3();
  private lastHeight = 0;
  private m4 = new THREE.Matrix4();
  readonly hidden = new THREE.MeshBasicMaterial({ visible: false });

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
    ctx.onBlock((h) => {
      this.lastHeight = h;
      for (const fn of this.blockFns) fn(h);
    });
    Market.subscribe(() => {});
  }

  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }
  /** ZEC in dollars, or null while loading. */
  get price() {
    return Market.state.price?.usd ?? null;
  }

  y(f: number) {
    return LEVELS[f].y;
  }

  // ---- geometry ----

  box(f: number, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, finish: Finish = "matte", ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, LEVELS[f].y + y, z);
    this.batches[f].add(finish, g, color);
  }

  cyl(f: number, r0: number, r1: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, finish: Finish = "matte", seg = 20, ry = 0) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, LEVELS[f].y + y, z);
    this.batches[f].add(finish, g, color);
  }

  /** Any geometry, already placed relative to the floor (its y is added). */
  geo(f: number, g: THREE.BufferGeometry, color: THREE.ColorRepresentation, finish: Finish = "matte") {
    g.translate(0, LEVELS[f].y, 0);
    this.batches[f].add(finish, g, color);
  }

  /** A slab between two points (any direction): a wall, and colliders along it. */
  wall(f: number, x0: number, z0: number, x1: number, z1: number, h: number, color: THREE.ColorRepresentation, finish: Finish = "matte", t = 0.3, y = 0, solid = true) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.BoxGeometry(len, h, t).translate(0, h / 2, 0);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, LEVELS[f].y + y, (z0 + z1) / 2);
    this.batches[f].add(finish, g, color);
    if (solid) this.line(f, x0, z0, x1, z1, t);
  }

  /** Colliders along a line (small squares when it runs at an angle). */
  line(f: number, x0: number, z0: number, x1: number, z1: number, t = 0.3) {
    if (x0 === x1 || z0 === z1) {
      this.solid(f, Math.min(x0, x1) - (x0 === x1 ? t / 2 : 0), Math.min(z0, z1) - (z0 === z1 ? t / 2 : 0), Math.max(x0, x1) + (x0 === x1 ? t / 2 : 0), Math.max(z0, z1) + (z0 === z1 ? t / 2 : 0));
      return;
    }
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n,
        z = z0 + ((z1 - z0) * i) / n;
      this.solid(f, x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
  }

  /** Colliders round a circle (or an arc from a0 to a1, radians from +z). */
  ring(f: number, cx: number, cz: number, r: number, a0 = 0, a1 = Math.PI * 2) {
    const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.3);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = cx + Math.sin(a) * r,
        z = cz + Math.cos(a) * r;
      this.solid(f, x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
  }

  solid(f: number, x0: number, z0: number, x1: number, z1: number) {
    this.rects[f].push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }

  /** Voxel furniture (12 per metre models by default: `k` 0.5), merged; solid unless told not. */
  vox(f: number, key: string, make: () => VoxelModel, x: number, z: number, ry = 0, o: { dy?: number; k?: number; solid?: boolean } = {}) {
    const k = o.k ?? 0.5;
    this.m4.compose(new THREE.Vector3(x, LEVELS[f].y + (o.dy ?? 0), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(k, k, k));
    const b = this.voxels[f].add(key, make, this.m4);
    if (o.solid !== false && b.max.y - LEVELS[f].y - (o.dy ?? 0) > 0.25 && !b.isEmpty()) this.solid(f, b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05);
    return b;
  }

  /** A textured plane, not merged. */
  plane(f: number, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, LEVELS[f].y + y, z);
    m.rotation.set(rx, ry, 0, "YXZ");
    m.raycast = () => {};
    this.groups[f].add(m);
    return m;
  }

  /** A flat on the floor, `dy` above it. */
  flat(f: number, w: number, d: number, mat: THREE.Material, x: number, z: number, dy = 0.005) {
    return this.plane(f, w, d, mat, x, dy, z, -Math.PI / 2);
  }

  add(f: number, o: THREE.Object3D, x = o.position.x, y = 0, z = o.position.z, ry = o.rotation.y) {
    o.position.set(x, LEVELS[f].y + y, z);
    o.rotation.y = ry;
    this.groups[f].add(o);
    return o;
  }

  flush() {
    this.batches.forEach((b, f) => b.build(this.groups[f]));
    this.voxels.forEach((v, f) => v.build(this.groups[f]));
  }

  // ---- light ----

  light(f: number, x: number, y: number, z: number, color = "#ffe2b8", intensity = 20, dist = 26) {
    if (this.lightCount[f] >= LIGHTS_PER_FLOOR) return null;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, LEVELS[f].y + y, z);
    this.groups[f].add(l);
    return l;
  }

  padLights() {
    LEVELS.forEach((_, f) => {
      while (this.lightCount[f] < LIGHTS_PER_FLOOR) this.light(f, 0, -50, 0, "#000000", 0, 1);
    });
  }

  // ---- signs and screens ----

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; ry?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, LEVELS[f].y + y, z);
    p.rotation.y = o.ry ?? 0;
    p.raycast = () => {};
    this.groups[f].add(p);
    return p;
  }

  /** A screen (w × h metres) redrawn every `every` seconds while you are on its floor. */
  screen(f: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number, t: number) => void, every = 3, res = 512) {
    const s = new Surface(res, Math.round((res * h) / w));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), s.mat);
    let acc = 0;
    this.ticks[f].push((dt, t) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      s.draw((g, W, H) => draw(g, W, H, t));
    });
    s.draw((g, W, H) => draw(g, W, H, 0));
    void document.fonts?.ready.then(() => s.draw((g, W, H) => draw(g, W, H, 0)));
    this.groups[f].add(mesh);
    return mesh;
  }

  // ---- clicks ----

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  hit(f: number, w: number, h: number, d: number, x: number, y: number, z: number, hover: string, info: PickFn, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.hidden);
    m.position.set(x, LEVELS[f].y + y + h / 2, z);
    m.rotation.y = ry;
    this.groups[f].add(m);
    this.pick(f, m, hover, info);
    return m;
  }

  // ---- people ----

  onCast(f: number, fn: () => void) {
    this.casts[f].push(fn);
  }

  enter(f: number) {
    this.current = f;
    if (!this.cast[f]) {
      this.cast[f] = true;
      for (const fn of this.casts[f]) fn();
    }
    for (const fn of this.arrive[f]) fn();
  }

  /**
   * A zkSNARK on floor f. `lines`: what it says when the walker comes near; `wander`: spots it
   * strolls between; `sit`, `dy` (standing on a dais), `face`; `info` turns a click into a panel.
   */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: [number, number]; wander?: [number, number][]; dy?: number; sit?: boolean; lines?: Line[]; tone?: Tone; near?: number; every?: [number, number]; cap?: boolean } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = LEVELS[f].y + (o.dy ?? 0);
      s.root.position.set(at[0], base, at[1]);
      const face = o.face ? new THREE.Vector3(o.face[0], 0, o.face[1]).normalize() : null;
      s.faceDir = face?.clone() ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      if (o.cap) s.setCap();
      this.groups[f].add(s.root);
      this.people[f].push(s);
      const lines = o.lines ?? [];
      let n = Math.floor(Math.random() * Math.max(1, lines.length));
      let wait = 1 + Math.random() * 5;
      const sayNext = () => lines.length && s.say(said(lines[n++ % lines.length]), 3.6, o.tone ?? "talk");
      if (lines.length) {
        const near = o.near ?? 7;
        const [a, b] = o.every ?? [8, 15];
        this.ticks[f].push((dt) => {
          wait -= dt;
          if (wait > 0) return;
          wait = 1;
          if (Math.abs(this.eye.y - 1.6 - s.root.position.y) < 2.5 && Math.hypot(this.eye.x - s.root.position.x, this.eye.z - s.root.position.z) < near) {
            sayNext();
            wait = a + Math.random() * (b - a);
          }
        });
      }
      this.pick(f, s.body, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => {
        sayNext();
        wait = 6;
        return { eyebrow: `Burj Al ZEC · ${role}`, title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id), stats: [["Role", role]] };
      });
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 3500 + Math.random() * 8000));
            if (this.current !== f) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.9 + Math.random() * 0.3);
            s.faceDir = face?.clone() ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /** Two or three people talking to each other while the walker is near: the script goes round. */
  dialog(f: number, who: Promise<Snark | null>[], script: [number, Line][], o: { near?: number; tone?: Tone; gap?: number } = {}) {
    void Promise.all(who).then((ss) => {
      if (ss.some((s) => !s)) return;
      const people = ss as Snark[];
      let i = 0;
      let wait = 1 + Math.random() * 3;
      const near = o.near ?? 11;
      this.ticks[f].push((dt) => {
        wait -= dt;
        if (wait > 0) return;
        const p = people[0].root.position;
        if (Math.abs(this.eye.y - 1.6 - p.y) > 3 || Math.hypot(this.eye.x - p.x, this.eye.z - p.z) > near) {
          wait = 1;
          return;
        }
        const [k, text] = script[i];
        const s = people[k];
        const other = people[(k + 1) % people.length];
        if (!s.isWalking) s.faceDir = other.root.position.clone().sub(s.root.position).setY(0).normalize();
        s.say(said(text), 3.4, o.tone ?? "talk");
        i = (i + 1) % script.length;
        wait = i === 0 ? (o.gap ?? 9) + Math.random() * 6 : 3.5;
      });
    });
  }

  /** zkSNARK busts from the collection atlas, one draw call: guests on far balconies. */
  crowd(f: number, at: [number, number, number, number, number][]) {
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const slots = new Float32Array(at.length);
    const phases = new Float32Array(at.length);
    at.forEach(([, , , id], i) => {
      slots[i] = Math.max(0, id - 1);
      phases[i] = hash(id, i, 5, 9);
    });
    geo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(slots, 1));
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    const uniforms = { map: { value: atlasTexture() }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: CROWD_VERT, fragmentShader: CROWD_FRAG });
    const mesh = new THREE.InstancedMesh(geo, mat, at.length);
    const m = new THREE.Matrix4();
    at.forEach(([x, y, z, , s], i) => {
      m.makeScale(s, s, s).setPosition(x, LEVELS[f].y + y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    this.groups[f].add(mesh);
    this.ticks[f].push((_dt, t) => (uniforms.uTime.value = t));
    return mesh;
  }

  /**
   * A school of fish swimming in a tank: `box` [x0, y0, z0, x1, y1, z1] (laps along x, weaving),
   * or round a `ring` [cx, cz, r0, r1, y0, y1] (circling the axis).
   */
  fish(f: number, n: number, o: { box?: [number, number, number, number, number, number]; ring?: [number, number, number, number, number, number]; size?: [number, number]; seed?: number; colors?: string[] }) {
    const mesh = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2, emissive: "#0a2a3a", emissiveIntensity: 0.6 }), n);
    mesh.raycast = () => {};
    mesh.frustumCulled = false;
    const seed = o.seed ?? 1;
    const cols = o.colors ?? FISH_COLORS;
    const P = Array.from({ length: n }, (_, i) => ({
      a: hash(i, 1, seed, 3),
      b: hash(i, 2, seed, 3),
      c: hash(i, 3, seed, 3),
      sp: 0.25 + hash(i, 4, seed, 3) * 0.5,
      s: (o.size?.[0] ?? 0.22) + hash(i, 5, seed, 3) * ((o.size?.[1] ?? 0.4) - (o.size?.[0] ?? 0.22)),
    }));
    P.forEach((_, i) => mesh.setColorAt(i, new THREE.Color(cols[Math.floor(hash(i, 6, seed, 3) * cols.length)])));
    const base = LEVELS[f].y;
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler(),
      p = new THREE.Vector3(),
      sc = new THREE.Vector3();
    const tick = (_dt: number, t: number) => {
      P.forEach((F, i) => {
        let yaw = 0;
        if (o.box) {
          const [x0, y0, z0, x1, y1, z1] = o.box;
          // a lap along x and back, weaving across z and bobbing in y
          const L = x1 - x0 - 0.6;
          const u = (t * F.sp * 0.35 + F.a) % 2;
          const fwd = u < 1;
          const k = fwd ? u : 2 - u;
          const ease = k * k * (3 - 2 * k);
          p.set(x0 + 0.3 + ease * L, base + y0 + 0.3 + (F.b * 0.8 + 0.1) * (y1 - y0 - 0.6) + Math.sin(t * 0.9 + F.c * 9) * 0.12, z0 + 0.3 + (0.5 + 0.42 * Math.sin(t * 0.4 * F.sp + F.c * 12)) * (z1 - z0 - 0.6));
          yaw = fwd ? 0 : Math.PI;
        } else if (o.ring) {
          const [cx, cz, r0, r1, y0, y1] = o.ring;
          const dir = F.c < 0.5 ? 1 : -1;
          const a = F.a * Math.PI * 2 + dir * t * F.sp * 0.22;
          const r = r0 + (r1 - r0) * (0.5 + 0.45 * Math.sin(t * 0.3 + F.b * 9));
          p.set(cx + Math.sin(a) * r, base + y0 + (y1 - y0) * (0.1 + 0.8 * F.b) + Math.sin(t * 0.7 + F.c * 7) * 0.2, cz + Math.cos(a) * r);
          yaw = a + (dir > 0 ? 0 : Math.PI);
        }
        e.set(0, yaw, Math.sin(t * 6 + F.a * 20) * 0.08);
        q.setFromEuler(e);
        sc.set(F.s * (1 + Math.sin(t * 8 + F.b * 20) * 0.04), F.s, F.s);
        m.compose(p, q, sc);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    tick(0, 0);
    this.ticks[f].push(tick);
    this.groups[f].add(mesh);
    return mesh;
  }

  // ---- the lifts ----

  /**
   * A lift lobby on a wall: two gilt cars and between them a panel with a button per floor.
   * (x, z) the middle of the wall face; `ry` turns it (0: the doors face +z).
   */
  lifts(f: number, x: number, z: number, ry: number) {
    const g = new THREE.Group();
    const goldM = new THREE.MeshStandardMaterial({ color: "#d9a92e", metalness: 0.95, roughness: 0.2 });
    const doorMat = new THREE.MeshStandardMaterial({ color: "#e8c25a", metalness: 0.95, roughness: 0.16 });
    const dark = new THREE.MeshStandardMaterial({ color: "#1a1612", roughness: 0.5 });
    const marble = new THREE.MeshStandardMaterial({ color: "#1a2a5a", roughness: 0.2, metalness: 0.1 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(6.6, 3.8, 0.12), marble, 0, 1.9, 0.06);
    const pos = ORDER.indexOf(f);
    for (const [cx, dir] of [
      [-1.7, 1],
      [1.7, -1],
    ] as const) {
      const to = ORDER[pos + dir];
      add(new THREE.BoxGeometry(1.9, 3.0, 0.1), goldM, cx, 1.5, 0.14);
      const doors = add(new THREE.BoxGeometry(1.5, 2.6, 0.06), doorMat, cx, 1.3, 0.2);
      add(new THREE.BoxGeometry(0.02, 2.6, 0.07), dark, cx, 1.3, 0.21);
      // a gilt sunburst over the door
      add(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 24, 1, false, -Math.PI / 2, Math.PI), goldM, cx, 3.05, 0.16).rotation.x = Math.PI / 2;
      if (to === undefined) continue;
      const arrow = textPlane(`${dir > 0 ? "▲" : "▼"} ${LEVELS[to].label}  ${LEVELS[to].name.split(" · ")[0].toUpperCase()}`, { h: 0.15, color: dir > 0 ? "#7dffb0" : "#ffb35a", glow: true });
      arrow.position.set(cx, 3.6, 0.2);
      g.add(arrow);
      this.pick(f, doors, `<b>Lift ${dir > 0 ? "up" : "down"}</b><span>${LEVELS[to].label} · ${LEVELS[to].name}</span>`, () => ({ eyebrow: "Lift", title: `${LEVELS[to].label} · ${LEVELS[to].name.split(" · ")[0]}`, floor: to }));
    }
    add(new THREE.BoxGeometry(0.95, 2.1, 0.05), goldM, 0, 1.55, 0.14);
    [...ORDER].reverse().forEach((i, k) => {
      const l = LEVELS[i];
      const here = i === f;
      const yy = 2.4 - k * 0.36;
      const btn = add(new THREE.CircleGeometry(0.075, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(here ? "#7fe3ff" : GOLD).multiplyScalar(here ? 1.8 : 1.3), toneMapped: false }), -0.3, yy, 0.18);
      const t = textPlane(`${l.label}  ${l.name.split(" · ")[0]}`, { h: 0.085, color: here ? "#7fe3ff" : "#1a1206", glow: here });
      t.position.set(-0.2 + (t.geometry.parameters as { width: number }).width / 2, yy, 0.18);
      g.add(t);
      if (!here) this.pick(f, btn, `<b>${l.label} · ${l.name.split(" · ")[0]}</b><span>${l.name.split(" · ")[1] ?? ""}</span>`, () => ({ eyebrow: "Lift", title: `${l.label} · ${l.name.split(" · ")[0]}`, floor: i }));
    });
    const here = textPlane(`${LEVELS[f].label} · ${LEVELS[f].name.split(" · ")[0].toUpperCase()}`, { h: 0.22, color: GOLD, glow: true });
    here.position.set(0, 4.05, 0.14);
    g.add(here);
    g.position.set(x, LEVELS[f].y, z);
    g.rotation.y = ry;
    g.traverse((o) => o !== g && !this.picks.has(o) && ((o as THREE.Mesh).raycast = () => {}));
    this.groups[f].add(g);
    const c = Math.cos(ry),
      s = Math.sin(ry);
    const pts = [
      [-3.3, 0],
      [3.3, 0.4],
    ].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
    this.solid(f, pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
  }

  rnd(i: number, j = 0, k = 0) {
    return hash(i, j, k, 31);
  }
}

/** Round-cornered rectangle path. */
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Marble: a pale ground with soft veins (for floors and walls). */
export function marbleTex(k: ArabKit, base: string, vein: string, px = 512, tiles = 4, rx = 1, ry = 1) {
  return paint(
    px,
    px,
    (g, W, H) => {
      const t = W / tiles;
      for (let i = 0; i < tiles; i++)
        for (let j = 0; j < tiles; j++) {
          g.fillStyle = base;
          g.fillRect(i * t, j * t, t, t);
          g.fillStyle = `rgba(0,0,0,${0.02 + k.rnd(i, j, 1) * 0.04})`;
          g.fillRect(i * t, j * t, t, t);
        }
      g.globalAlpha = 0.22;
      g.strokeStyle = vein;
      for (let n = 0; n < 60; n++) {
        g.lineWidth = 0.6 + k.rnd(n, 1, 2) * 1.8;
        g.beginPath();
        let x = k.rnd(n, 2, 2) * W,
          y = k.rnd(n, 3, 2) * H;
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          x += (k.rnd(n, s + 4, 2) - 0.5) * 70;
          y += (k.rnd(n, s + 9, 2) - 0.5) * 70;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(90,70,40,0.35)";
      g.lineWidth = 1.5;
      for (let i = 0; i <= tiles; i++) {
        g.beginPath();
        g.moveTo(i * t, 0);
        g.lineTo(i * t, H);
        g.moveTo(0, i * t);
        g.lineTo(W, i * t);
        g.stroke();
      }
    },
    rx,
    ry,
  );
}
