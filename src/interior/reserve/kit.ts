import * as THREE from "three";
import { sharedAtlasTexture } from "../../data/atlas";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../../data/market";
import { ZScan } from "../../data/zscan";
import { loadArt, Snark } from "../../scene/snark";
import { meshModel, MATERIALS } from "../../scene/voxel/mesher";
import { hash, type Kind, type VoxelModel } from "../../scene/voxel/model";
import type { Tone } from "../../scene/speech";
import { textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The ZEC RESERVE's shared kit: its levels (each with its own footprint, spawn and lifts), one
 * group per floor (only the floor you are on is drawn, lit and animated), colliders, people who
 * talk to each other, ticks, and the batching every floor relies on: plain geometry merged into
 * one mesh per finish (matte, polished, metal, glow), voxel furniture merged per voxel material.
 */

export interface Level {
  label: string;
  name: string;
  y: number;
  h: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  spawn: [number, number];
  yaw: number;
  /** Height of the windows' city panorama (metres above the street), if the floor has windows. */
  view?: number;
}

export const LEVELS: Level[] = [
  { label: "G", name: "Banking hall · tellers, key terminals", y: 0, h: 14, x0: -20, x1: 20, z0: -46, z1: 0, spawn: [0, -2.2], yaw: 0 },
  { label: "2", name: "Trading floor · posts, the bell", y: 20, h: 10, x0: -22, x1: 22, z0: -44, z1: 0, spawn: [-19.6, -8], yaw: -Math.PI / 2, view: 16 },
  { label: "3", name: "Museum of money · Sprout to Ironwood", y: 34, h: 6, x0: -18, x1: 18, z0: -36, z1: 0, spawn: [-15.6, -6], yaw: -Math.PI / 2 },
  { label: "21", name: "Executive floor · boardroom, governor", y: 70, h: 4.2, x0: -16, x1: 16, z0: -30, z1: 0, spawn: [-13.8, -9], yaw: -Math.PI / 2, view: 70 },
  { label: "R", name: "Observation terrace · the city", y: 78, h: 0, x0: -16, x1: 16, z0: -30, z1: 0, spawn: [-10.8, -15], yaw: -Math.PI / 2, view: 100 },
  { label: "-1", name: "Gold vault · the pool cages", y: -12, h: 6, x0: -22, x1: 22, z0: -48, z1: 0, spawn: [0, -3], yaw: 0 },
  { label: "-2", name: "Safe deposit · lockbox, coin room", y: -22, h: 4.5, x0: -16, x1: 16, z0: -30, z1: 0, spawn: [-13.8, -15], yaw: -Math.PI / 2 },
];
export const F = { hall: 0, trading: 1, museum: 2, exec: 3, roof: 4, vault: 5, deposit: 6 } as const;
/** The floors bottom to top (the lift panel and its up / down cars follow this). */
export const ORDER = LEVELS.map((_, i) => i).sort((a, b) => LEVELS[a].y - LEVELS[b].y);
export const LIGHTS_PER_FLOOR = 6;

export const GOLD = "#f4b728";
export const C = {
  ivory: "#e9dfca",
  travertine: "#d6c7a8",
  cream: "#f2e9d6",
  stoneShade: "#b9a888",
  greenMarble: "#1f3b31",
  deepGreen: "#13261e",
  bronze: "#8c6a35",
  brass: "#c9a24a",
  gold: "#e0a830",
  walnut: "#4a2e1c",
  mahogany: "#5a2418",
  navy: "#16233d",
  velvet: "#7a1426",
  steel: "#5d6470",
  steelDark: "#2b2f38",
  black: "#141218",
  white: "#f4f1ea",
};
export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SANS = 'Roboto, "Helvetica Neue", Arial, sans-serif';
export const SERIF = 'Georgia, "Times New Roman", serif';
export const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

export const num = (n: number) => n.toLocaleString("en-US");
export const usd = (n: number, d = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const big = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : usd(n, 0));
export const zec = (zat: number, d = 0) => (zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export type Tick = (dt: number, t: number) => void;
export type PickFn = () => PickInfo | null;
export type Finish = "matte" | "polish" | "metal" | "glow" | "glass";
/** A line said in a bubble; a function reads the live chain when it is said. */
export type Line = string | (() => string);
const said = (l: Line) => (typeof l === "string" ? l : l());

const FINISH: Record<Finish, THREE.Material> = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
  polish: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.06, envMapIntensity: 1.2 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.88, envMapIntensity: 1.4 }),
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

// ---- the zkSNARK crowd: busts from the collection atlas -----------------------------------------

let atlas: THREE.Texture | null = null;
function atlasTexture() {
  if (atlas) return atlas;
  // one download, one GPU texture for the whole app
  atlas = sharedAtlasTexture();
  return atlas;
}

const CROWD_VERT = /* glsl */ `
attribute float aSlot;
attribute float aPhase;
uniform float uTime;
uniform float uCheer;
varying vec2 vAt;
void main() {
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(instanceMatrix[0].xyz);
  vec3 f = cameraPosition - c;
  f.y = 0.0;
  f = normalize(f + vec3(0.0001, 0.0, 0.0));
  vec3 r = vec3(f.z, 0.0, -f.x);
  float busy = step(0.45, fract(aPhase * 3.17));
  float bob = abs(sin(uTime * (2.2 + fract(aPhase * 7.3) * 2.6) + aPhase * 6.283)) * (0.035 * busy + 0.12 * uCheer);
  vec3 p = c + r * position.x * s + vec3(0.0, position.y * s + bob, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float col = mod(aSlot, 100.0);
  float row = floor(aSlot / 100.0);
  vec2 q = uv * 0.94 + 0.03;
  vAt = vec2((col + q.x) / 100.0, 1.0 - (row + 1.0 - q.y) / 100.0);
}`;
const CROWD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uBright;
varying vec2 vAt;
void main() {
  vec4 t = texture2D(map, vAt);
  if (max(t.r, max(t.g, t.b)) < 0.035) discard;
  gl_FragColor = vec4(t.rgb * uBright, 1.0);
  #include <colorspace_fragment>
}`;

export interface Crowd {
  mesh: THREE.InstancedMesh;
  cheer(k: number): void;
}

// ---- the kit ------------------------------------------------------------------------------------

export class ReserveKit {
  readonly groups = LEVELS.map(() => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  readonly ticks: Tick[][] = LEVELS.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  /** Who is cast on a floor: spawned the first time you step onto it. */
  private casts: (() => void)[][] = LEVELS.map(() => []);
  private cast = LEVELS.map(() => false);
  /** What a floor does when you arrive (the vault door swings open). */
  readonly arrive: (() => void)[][] = LEVELS.map(() => []);
  private batches = LEVELS.map(() => new Batch());
  private voxels = LEVELS.map(() => new Voxels());
  private lightCount = LEVELS.map(() => 0);
  readonly blockFns: ((h: number) => void)[] = [];
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
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0, Market.state.supply?.height ?? 0);
  }

  y(f: number) {
    return LEVELS[f].y;
  }

  // ---- geometry ----

  /** A box on floor f: (x, z) centre, `y` its bottom above the floor. */
  box(f: number, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, finish: Finish = "matte", ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, LEVELS[f].y + y, z);
    this.batches[f].add(finish, g, color);
  }

  /** A cylinder (or cone, or n-gon prism) standing on `y`. */
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

  /** A slab between two points on the floor plan: a wall, and its collider. */
  wall(f: number, x0: number, z0: number, x1: number, z1: number, h: number, color: THREE.ColorRepresentation, finish: Finish = "matte", t = 0.3, y = 0, solid = true) {
    const w = Math.max(Math.abs(x1 - x0), t),
      d = Math.max(Math.abs(z1 - z0), t);
    this.box(f, w, h, d, (x0 + x1) / 2, y, (z0 + z1) / 2, color, finish);
    if (solid) this.solid(f, (x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - d / 2, (x0 + x1) / 2 + w / 2, (z0 + z1) / 2 + d / 2);
  }

  solid(f: number, x0: number, z0: number, x1: number, z1: number) {
    this.rects[f].push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }

  /** Voxel furniture (12 per metre models by default: `k` 0.5), merged; solid unless told not. */
  vox(f: number, key: string, make: () => VoxelModel, x: number, z: number, ry = 0, o: { dy?: number; k?: number; solid?: boolean } = {}) {
    const k = o.k ?? 0.5;
    this.m4.compose(new THREE.Vector3(x, LEVELS[f].y + (o.dy ?? 0), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(k, k, k));
    const b = this.voxels[f].add(key, make, this.m4);
    if (o.solid !== false && b.max.y - LEVELS[f].y > 0.25 && !b.isEmpty()) this.solid(f, b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05);
    return b;
  }

  /** A textured plane (floors, wall panels), not merged. */
  plane(f: number, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, LEVELS[f].y + y, z);
    m.rotation.set(rx, ry, 0, "YXZ");
    this.groups[f].add(m);
    return m;
  }

  /** A floor-wide flat on the ground (rug, inlay), `dy` above it. */
  flat(f: number, w: number, d: number, mat: THREE.Material, x: number, z: number, dy = 0.005) {
    return this.plane(f, w, d, mat, x, dy, z, -Math.PI / 2);
  }

  add(f: number, o: THREE.Object3D, x = o.position.x, y = 0, z = o.position.z, ry = o.rotation.y) {
    o.position.set(x, LEVELS[f].y + y, z);
    o.rotation.y = ry;
    this.groups[f].add(o);
    return o;
  }

  /** Every merge of every floor, once everything is placed. */
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

  /** Every floor gets the same number of lights: changing floor never recompiles a shader. */
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
  screen(f: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3, res = 512) {
    const s = new Surface(res, Math.round((res * h) / w));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), s.mat);
    let acc = 0;
    this.ticks[f].push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      s.draw(draw);
    });
    s.draw(draw);
    this.groups[f].add(mesh);
    return mesh;
  }

  /** A surface redrawn on its floor every `every` seconds (shared by several meshes). */
  surface(f: number, W: number, H: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3) {
    const s = new Surface(W, H);
    let acc = 0;
    this.ticks[f].push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      s.draw(draw);
    });
    s.draw(draw);
    void document.fonts?.ready.then(() => s.draw(draw));
    return s;
  }

  // ---- clicks ----

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  /** An invisible box that answers clicks. */
  hit(f: number, w: number, h: number, d: number, x: number, y: number, z: number, hover: string, info: PickFn, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.hidden);
    m.position.set(x, LEVELS[f].y + y + h / 2, z);
    m.rotation.y = ry;
    this.groups[f].add(m);
    this.pick(f, m, hover, info);
    return m;
  }

  // ---- paintings ----

  /** A zkSNARK portrait in a carved gilt frame, its back on the wall, facing `ry`. */
  painting(f: number, id: number, x: number, y: number, z: number, ry: number, size = 1.1, plate?: string) {
    const g = new THREE.Group();
    const fw = size + 0.3;
    const frameMat = new THREE.MeshStandardMaterial({ color: "#b8892a", metalness: 0.85, roughness: 0.35 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(fw, fw * 1.2, 0.08), frameMat);
    back.position.z = 0.04;
    const inner = new THREE.Mesh(new THREE.BoxGeometry(size + 0.08, size * 1.2 + 0.08, 0.05), new THREE.MeshStandardMaterial({ color: "#3a2410", roughness: 0.6 }));
    inner.position.z = 0.08;
    const t = new THREE.TextureLoader().load(ZScan.zkSnarkImage(id));
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    // a painted backdrop behind the bust (the portrait's own black would read as a hole)
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.2), new THREE.MeshStandardMaterial({ color: ["#2a3b52", "#4a2a2a", "#2a4a3a", "#4a3a20"][id % 4], roughness: 0.9 }));
    bg.position.z = 0.112;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, transparent: true, alphaTest: 0.5 }));
    art.position.set(0, -size * 0.1, 0.115);
    g.add(back, inner, bg, art);
    if (plate) {
      const p = textPlane(plate, { h: 0.08, color: "#2a1a08", bg: "#c9a24a", font: `700 64px ${SERIF}` });
      p.position.set(0, -fw * 0.6 - 0.08, 0.06);
      g.add(p);
    }
    g.position.set(x, LEVELS[f].y + y, z);
    g.rotation.y = ry;
    this.groups[f].add(g);
    // the portrait's own pixels: key out its black backdrop
    void loadArt(id)
      .then((a) => {
        (art.material as THREE.MeshStandardMaterial).map = a.texture;
        (art.material as THREE.MeshStandardMaterial).needsUpdate = true;
      })
      .catch(() => {});
    this.pick(f, art, `<b>${plate ?? `zkSNARK #${id}`}</b><span>zkSNARK #${id}</span>`, () => ({ eyebrow: "Portrait", title: plate ?? `zkSNARK #${id}`, image: ZScan.zkSnarkImage(id), stats: [["zkSNARK", `#${id}`]] }));
    return g;
  }

  // ---- people ----

  /** Run `fn` the first time the walker steps onto floor f (who works there). */
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
   * A zkSNARK on floor f. `lines`: what it says to the walker when near (a bubble);
   * `wander`: spots it strolls between; `sit`, `dy` (standing on a dais), `face`.
   */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: [number, number]; wander?: [number, number][]; dy?: number; sit?: boolean; lines?: Line[]; tone?: Tone; near?: number; every?: [number, number] } = {}) {
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
      this.groups[f].add(s.root);
      this.people[f].push(s);
      if (o.lines?.length) {
        const lines = o.lines;
        let n = Math.floor(Math.random() * lines.length);
        let wait = 1 + Math.random() * 5;
        const near = o.near ?? 9;
        const [a, b] = o.every ?? [7, 14];
        this.ticks[f].push((dt) => {
          wait -= dt;
          if (wait > 0) return;
          wait = 1;
          if (Math.hypot(this.eye.x - s.root.position.x, this.eye.z - s.root.position.z) < near) {
            s.say(said(lines[n++ % lines.length]), 3.4, o.tone ?? "talk");
            wait = a + Math.random() * (b - a);
          }
        });
      }
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 3500 + Math.random() * 8000));
            if (this.current !== f) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.9 + Math.random() * 0.4);
            s.faceDir = face?.clone() ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /**
   * Two or three people talking to each other: the script goes round, one bubble every few
   * seconds, while the walker is within `near` metres; a pause between rounds.
   */
  dialog(f: number, who: Promise<Snark | null>[], script: [number, Line][], o: { near?: number; tone?: Tone; gap?: number } = {}) {
    void Promise.all(who).then((ss) => {
      if (ss.some((s) => !s)) return;
      const people = ss as Snark[];
      let i = 0;
      let wait = 1 + Math.random() * 3;
      const near = o.near ?? 12;
      this.ticks[f].push((dt) => {
        wait -= dt;
        if (wait > 0) return;
        const p = people[0].root.position;
        if (Math.hypot(this.eye.x - p.x, this.eye.z - p.z) > near) {
          wait = 1;
          return;
        }
        const [k, text] = script[i];
        const s = people[k];
        // turn to the one they're talking to
        const other = people[(k + 1) % people.length];
        if (!s.isWalking) s.faceDir = other.root.position.clone().sub(s.root.position).setY(0).normalize();
        s.say(said(text), 3.3, o.tone ?? "talk");
        i = (i + 1) % script.length;
        wait = i === 0 ? (o.gap ?? 9) + Math.random() * 6 : 3.4;
      });
    });
  }

  /**
   * Busts of zkSNARKs from the collection atlas, one draw call for the lot, turned to the walker:
   * clerks inside a post, spectators behind a parapet. `at`: x, y (bottom), z, id, size.
   */
  crowd(f: number, at: [number, number, number, number, number][]): Crowd {
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const slots = new Float32Array(at.length);
    const phases = new Float32Array(at.length);
    at.forEach(([, , , id], i) => {
      slots[i] = Math.max(0, id - 1);
      phases[i] = hash(id, i, 5, 9);
    });
    geo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(slots, 1));
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    const uniforms = { map: { value: atlasTexture() }, uTime: { value: 0 }, uCheer: { value: 0 }, uBright: { value: 1 } };
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
    let cheer = 0;
    this.ticks[f].push((dt, t) => {
      uniforms.uTime.value = t;
      cheer = Math.max(0, cheer - dt * 0.4);
      uniforms.uCheer.value = Math.min(1, cheer);
    });
    return { mesh, cheer: (k: number) => (cheer = Math.max(cheer, k)) };
  }

  // ---- lifts ----

  /**
   * The lift lobby on a wall: two bronze cars (up, down) and between them a brass panel with a
   * button per floor. (x, z) is the middle of the wall face; `ry` turns it (0: the doors face +z).
   */
  lifts(f: number, x: number, z: number, ry: number) {
    const g = new THREE.Group();
    const bronze = new THREE.MeshStandardMaterial({ color: "#9a7438", metalness: 0.85, roughness: 0.3 });
    const doorMat = new THREE.MeshStandardMaterial({ color: "#c9a25a", metalness: 0.9, roughness: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: "#1a1612", roughness: 0.5 });
    const marble = new THREE.MeshStandardMaterial({ color: "#2a3a32", roughness: 0.25 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(6.6, 3.6, 0.12), marble, 0, 1.8, 0.06);
    const pos = ORDER.indexOf(f);
    for (const [cx, dir] of [
      [-1.7, 1],
      [1.7, -1],
    ] as const) {
      const to = ORDER[pos + dir];
      add(new THREE.BoxGeometry(1.9, 2.9, 0.1), bronze, cx, 1.45, 0.14);
      const doors = add(new THREE.BoxGeometry(1.5, 2.6, 0.06), doorMat, cx, 1.3, 0.2);
      add(new THREE.BoxGeometry(0.02, 2.6, 0.07), dark, cx, 1.3, 0.21);
      // the fan-shaped floor dial over the door
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24, 1, false, -Math.PI / 2, Math.PI), bronze, cx, 3.0, 0.16).rotation.x = Math.PI / 2;
      const needle = add(new THREE.BoxGeometry(0.03, 0.34, 0.02), dark, cx, 3.0, 0.2);
      needle.geometry.translate(0, 0.17, 0);
      needle.rotation.z = (0.5 - pos / (ORDER.length - 1)) * Math.PI * 0.9;
      if (to === undefined) continue;
      const arrow = textPlane(`${dir > 0 ? "▲" : "▼"} ${LEVELS[to].label}  ${LEVELS[to].name.split(" · ")[0].toUpperCase()}`, { h: 0.15, color: dir > 0 ? "#7dffb0" : "#ffb35a", glow: true });
      arrow.position.set(cx, 3.48, 0.2);
      g.add(arrow);
      this.pick(f, doors, `<b>Lift ${dir > 0 ? "up" : "down"}</b><span>${LEVELS[to].label} · ${LEVELS[to].name}</span>`, () => ({ eyebrow: "Lift", title: `${LEVELS[to].label} · ${LEVELS[to].name.split(" · ")[0]}`, floor: to }));
    }
    // the destination panel
    add(new THREE.BoxGeometry(0.9, 2.3, 0.05), bronze, 0, 1.45, 0.14);
    [...ORDER].reverse().forEach((i, k) => {
      const l = LEVELS[i];
      const here = i === f;
      const yy = 2.42 - k * 0.3;
      const btn = add(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(here ? "#7fe3ff" : GOLD).multiplyScalar(here ? 1.8 : 1.3), toneMapped: false }), -0.3, yy, 0.18);
      const t = textPlane(`${l.label}  ${l.name.split(" · ")[0]}`, { h: 0.09, color: here ? "#7fe3ff" : "#f6e7c4", glow: here });
      t.position.set(-0.2 + (t.geometry.parameters as { width: number }).width / 2, yy, 0.18);
      g.add(t);
      if (!here) this.pick(f, btn, `<b>${l.label} · ${l.name.split(" · ")[0]}</b><span>${l.name.split(" · ")[1] ?? ""}</span>`, () => ({ eyebrow: "Lift", title: `${l.label} · ${l.name.split(" · ")[0]}`, floor: i }));
    });
    const here = textPlane(`${LEVELS[f].label} · ${LEVELS[f].name.split(" · ")[0].toUpperCase()}`, { h: 0.24, color: GOLD, glow: true });
    here.position.set(0, 3.95, 0.14);
    g.add(here);
    g.position.set(x, LEVELS[f].y, z);
    g.rotation.y = ry;
    this.groups[f].add(g);
    // collider: the wall strip, 0.4 m deep
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
