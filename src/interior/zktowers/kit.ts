import * as THREE from "three";
import { sharedAtlasTexture } from "../../data/atlas";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../../data/market";
import type { BlockSummary } from "../../data/types";
import { get, ZScan } from "../../data/zscan";
import { loadArt, Snark } from "../../scene/snark";
import type { Tone } from "../../scene/speech";
import { meshModel, MATERIALS } from "../../scene/voxel/mesher";
import { hash, type Kind, type VoxelModel } from "../../scene/voxel/model";
import { makeScene, textPlane } from "../kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";

/**
 * The ZK towers' shared kit (ORCHARD, SAPLING, HALO): levels, one group per floor (only the floor
 * you are on is drawn, lit and animated), colliders, people who talk (to you and to each other),
 * ticks, the lifts, glass curtain walls onto the real city, live chain data, and the batching
 * every floor relies on: plain geometry merged into one mesh per finish, voxel furniture merged
 * per voxel material.
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

export interface LiftStyle {
  /** The wall the cars sit in, the frames, the doors, the panel's ink and lit button. */
  wall: string;
  frame: string;
  door: string;
  ink: string;
  lit: string;
  accent: string;
  /** Art-deco sunburst over the doors, or a plain lintel. */
  deco?: "sunburst" | "bar" | "arch";
}

export const GOLD = "#f4b728";
export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SANS = 'Roboto, "Helvetica Neue", Arial, sans-serif';
export const SERIF = 'Georgia, "Times New Roman", serif';
export const num = (n: number) => n.toLocaleString("en-US");
export const usd = (n: number, d = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export type Tick = (dt: number, t: number) => void;
export type PickFn = () => PickInfo | null;
export type Finish = "matte" | "polish" | "metal" | "glow" | "glass";
/** A line said in a bubble; a function reads the live chain when it is said. */
export type Line = string | (() => string);
const said = (l: Line) => (typeof l === "string" ? l : l());

const FINISH: Record<Finish, THREE.Material> = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
  polish: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.06, envMapIntensity: 1.3 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.92, envMapIntensity: 1.6 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.14, depthWrite: false }),
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

// ---- zkSNARK busts from the collection atlas (crowds far away: one draw call) -------------------

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

// ---- the kit ------------------------------------------------------------------------------------

export class SkyKit {
  readonly groups: THREE.Group[];
  readonly rects: Rect[][];
  readonly people: Snark[][];
  readonly ticks: Tick[][];
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  readonly arrive: (() => void)[][];
  /** Per-floor ground heights (stairs, a dais), checked in order. */
  readonly grounds: ((x: number, z: number) => number | null)[][];
  readonly blockFns: ((h: number, pool: string | null) => void)[] = [];
  /** The last blocks, newest first (fetched on entry, prepended on each new block). */
  blocks: BlockSummary[] = [];
  /** The floors bottom to top (the lift panel follows this). */
  readonly order: number[];
  current = 0;
  /** The walker's eye, every frame. */
  readonly eye = new THREE.Vector3();
  readonly hidden = new THREE.MeshBasicMaterial({ visible: false });
  readonly scene: THREE.Scene;
  private casts: (() => void)[][];
  private cast: boolean[];
  private batches: Batch[];
  private voxels: Voxels[];
  private lightCount: number[];
  private lastHeight = 0;
  private m4 = new THREE.Matrix4();

  constructor(
    readonly ctx: InteriorContext,
    readonly levels: Level[],
    /** Shown as the eyebrow of people's panels ("ZK TOWER ORCHARD"). */
    readonly title: string,
    o: { bg?: string; lightsPerFloor?: number } = {},
  ) {
    this.scene = makeScene(ctx.renderer, o.bg ?? "#07060c");
    this.lightsPerFloor = o.lightsPerFloor ?? 6;
    const per = <T>(fn: () => T) => levels.map(fn);
    this.groups = per(() => new THREE.Group());
    this.rects = per(() => []);
    this.people = per(() => []);
    this.ticks = per(() => []);
    this.arrive = per(() => []);
    this.grounds = per(() => []);
    this.casts = per(() => []);
    this.cast = per(() => false);
    this.batches = per(() => new Batch());
    this.voxels = per(() => new Voxels());
    this.lightCount = per(() => 0);
    this.order = levels.map((_, i) => i).sort((a, b) => levels[a].y - levels[b].y);
    for (const g of this.groups) this.scene.add(g);
    ctx.onBlock((h, pool) => {
      this.lastHeight = h;
      if (!this.blocks.some((b) => b.height === h)) this.blocks.unshift({ height: h, hash: "", time: new Date().toISOString(), tx_count: 0, size: 0, fees: null, miner_pool: pool });
      this.blocks = this.blocks.slice(0, 12);
      for (const fn of this.blockFns) fn(h, pool);
      // the full row a moment later (tx count, size)
      setTimeout(() => void this.refreshBlocks(), 4000);
    });
    Market.subscribe(() => {});
    void this.refreshBlocks();
  }
  readonly lightsPerFloor: number;

  private async refreshBlocks() {
    const list = await get<BlockSummary[]>("/v1/blocks?limit=12");
    if (list?.length) this.blocks = list;
  }

  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0, this.blocks[0]?.height ?? 0);
  }
  /** ZEC in dollars, or null while loading. */
  get price() {
    return Market.state.price?.usd ?? null;
  }

  y(f: number) {
    return this.levels[f].y;
  }

  // ---- geometry ----

  box(f: number, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, finish: Finish = "matte", ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, this.levels[f].y + y, z);
    this.batches[f].add(finish, g, color);
  }

  cyl(f: number, r0: number, r1: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, finish: Finish = "matte", seg = 20, ry = 0) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, this.levels[f].y + y, z);
    this.batches[f].add(finish, g, color);
  }

  /** Any geometry, already placed relative to the floor (its y is added). */
  geo(f: number, g: THREE.BufferGeometry, color: THREE.ColorRepresentation, finish: Finish = "matte") {
    g.translate(0, this.levels[f].y, 0);
    this.batches[f].add(finish, g, color);
  }

  /** A slab between two points (any direction): a wall, and colliders along it. */
  wall(f: number, x0: number, z0: number, x1: number, z1: number, h: number, color: THREE.ColorRepresentation, finish: Finish = "matte", t = 0.3, y = 0, solid = true) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.BoxGeometry(len, h, t).translate(0, h / 2, 0);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, this.levels[f].y + y, (z0 + z1) / 2);
    this.batches[f].add(finish, g, color);
    if (solid) this.line(f, x0, z0, x1, z1, t);
  }

  /**
   * A glass curtain wall from (x0, z0) to (x1, z1), `h` high: a clear pane, mullions every `step`
   * metres, a sill and a transom; it blocks the walker. The city panorama shows through it.
   */
  curtain(f: number, x0: number, z0: number, x1: number, z1: number, h: number, mullion: THREE.ColorRepresentation = "#2a2832", step = 1.8, o: { sill?: THREE.ColorRepresentation; transom?: number; finish?: Finish } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    const pane = new THREE.BoxGeometry(len, h, 0.03).translate(0, h / 2, 0).rotateY(ry).translate(cx, this.levels[f].y, cz);
    this.batches[f].add("glass", pane, "#cfe4f4");
    const n = Math.max(1, Math.round(len / step));
    const fin = o.finish ?? "metal";
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.box(f, 0.08, h, 0.12, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, mullion, fin, ry);
    }
    this.wall(f, x0, z0, x1, z1, 0.14, o.sill ?? mullion, fin, 0.16, 0, false);
    this.wall(f, x0, z0, x1, z1, 0.1, mullion, fin, 0.14, h - 0.1, false);
    if (o.transom) this.wall(f, x0, z0, x1, z1, 0.06, mullion, fin, 0.12, o.transom, false);
    this.line(f, x0, z0, x1, z1, 0.3);
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
    this.m4.compose(new THREE.Vector3(x, this.levels[f].y + (o.dy ?? 0), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(k, k, k));
    const b = this.voxels[f].add(key, make, this.m4);
    if (o.solid !== false && b.max.y - this.levels[f].y - (o.dy ?? 0) > 0.25 && !b.isEmpty()) this.solid(f, b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05);
    return b;
  }

  /** A textured plane, not merged. */
  plane(f: number, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, this.levels[f].y + y, z);
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
    o.position.set(x, this.levels[f].y + y, z);
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
    if (this.lightCount[f] >= this.lightsPerFloor) return null;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, this.levels[f].y + y, z);
    this.groups[f].add(l);
    return l;
  }

  /** Every floor ends up with the same number of lights: changing floor never recompiles a shader. */
  padLights() {
    this.levels.forEach((_, f) => {
      while (this.lightCount[f] < this.lightsPerFloor) this.light(f, 0, -50, 0, "#000000", 0, 1);
    });
  }

  // ---- signs and screens ----

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; ry?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, this.levels[f].y + y, z);
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
    m.position.set(x, this.levels[f].y + y + h / 2, z);
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
   * strolls between; `sit`, `dy` (standing on a dais), `face`.
   */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: [number, number]; wander?: [number, number][]; dy?: number; sit?: boolean; lines?: Line[]; tone?: Tone; near?: number; every?: [number, number]; cap?: boolean } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = this.levels[f].y + (o.dy ?? 0);
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
        return { eyebrow: `${this.title} · ${role}`, title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id), stats: [["Role", role]] };
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

  /** zkSNARK busts from the collection atlas, one draw call: [x, y, z, id, size] each. */
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
      m.makeScale(s, s, s).setPosition(x, this.levels[f].y + y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    this.groups[f].add(mesh);
    this.ticks[f].push((_dt, t) => (uniforms.uTime.value = t));
    return mesh;
  }

  // ---- the lifts ----

  /**
   * A lift lobby on a wall: two cars and between them a panel with a button per floor.
   * (x, z) the middle of the wall face; `ry` turns it (0: the doors face +z).
   */
  lifts(f: number, x: number, z: number, ry: number, st: LiftStyle) {
    const L = this.levels;
    const g = new THREE.Group();
    const frameM = new THREE.MeshStandardMaterial({ color: st.frame, metalness: 0.9, roughness: 0.22 });
    const doorMat = new THREE.MeshStandardMaterial({ color: st.door, metalness: 0.9, roughness: 0.18 });
    const dark = new THREE.MeshStandardMaterial({ color: "#121014", roughness: 0.5 });
    const wallM = new THREE.MeshStandardMaterial({ color: st.wall, roughness: 0.3, metalness: 0.1 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(6.6, 3.8, 0.12), wallM, 0, 1.9, 0.06);
    const pos = this.order.indexOf(f);
    for (const [cx, dir] of [
      [-1.7, 1],
      [1.7, -1],
    ] as const) {
      const to = this.order[pos + dir];
      add(new THREE.BoxGeometry(1.9, 3.0, 0.1), frameM, cx, 1.5, 0.14);
      const doors = add(new THREE.BoxGeometry(1.5, 2.6, 0.06), doorMat, cx, 1.3, 0.2);
      add(new THREE.BoxGeometry(0.02, 2.6, 0.07), dark, cx, 1.3, 0.21);
      if (st.deco === "sunburst") {
        add(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 24, 1, false, -Math.PI / 2, Math.PI), frameM, cx, 3.05, 0.16).rotation.x = Math.PI / 2;
        for (let r = 0; r < 7; r++) {
          const a = -Math.PI / 2 + ((r + 0.5) / 7) * Math.PI;
          const ray = add(new THREE.BoxGeometry(0.03, 0.34, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.accent).multiplyScalar(1.4), toneMapped: false }), cx + Math.sin(a) * 0.62, 3.05 + Math.cos(a) * 0.62 - 0.1, 0.19);
          ray.rotation.z = -a;
        }
      } else if (st.deco === "arch") {
        add(new THREE.TorusGeometry(0.95, 0.05, 6, 24, Math.PI), frameM, cx, 2.9, 0.18);
      } else add(new THREE.BoxGeometry(1.9, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.accent).multiplyScalar(1.6), toneMapped: false }), cx, 3.08, 0.2);
      if (to === undefined) continue;
      const arrow = textPlane(`${dir > 0 ? "▲" : "▼"} ${L[to].label}  ${L[to].name.split(" · ")[0].toUpperCase()}`, { h: 0.15, color: dir > 0 ? "#7dffb0" : "#ffb35a", glow: true });
      arrow.position.set(cx, 3.6, 0.2);
      g.add(arrow);
      this.pick(f, doors, `<b>Lift ${dir > 0 ? "up" : "down"}</b><span>${L[to].label} · ${L[to].name}</span>`, () => ({ eyebrow: "Lift", title: `${L[to].label} · ${L[to].name.split(" · ")[0]}`, floor: to }));
    }
    add(new THREE.BoxGeometry(0.95, 2.1, 0.05), frameM, 0, 1.55, 0.14);
    [...this.order].reverse().forEach((i, k) => {
      const l = L[i];
      const here = i === f;
      const yy = 2.4 - k * 0.36;
      const btn = add(new THREE.CircleGeometry(0.075, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(here ? st.lit : st.accent).multiplyScalar(here ? 1.8 : 1.3), toneMapped: false }), -0.3, yy, 0.18);
      const t = textPlane(`${l.label}  ${l.name.split(" · ")[0]}`, { h: 0.085, color: here ? st.lit : st.ink, glow: here });
      t.position.set(-0.2 + (t.geometry.parameters as { width: number }).width / 2, yy, 0.18);
      g.add(t);
      if (!here) this.pick(f, btn, `<b>${l.label} · ${l.name.split(" · ")[0]}</b><span>${l.name.split(" · ")[1] ?? ""}</span>`, () => ({ eyebrow: "Lift", title: `${l.label} · ${l.name.split(" · ")[0]}`, floor: i }));
    });
    const here = textPlane(`${L[f].label} · ${L[f].name.split(" · ")[0].toUpperCase()}`, { h: 0.22, color: st.accent, glow: true });
    here.position.set(0, 4.05, 0.14);
    g.add(here);
    g.position.set(x, L[f].y, z);
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

  /**
   * The Interior for the manager: floor switching (with the city panorama from each floor's
   * height, `back` metres behind the street door), picks, hovers, people and ticks.
   */
  interior(key: Interior["key"], back: number, onFloor?: (n: number) => void): Interior {
    const { ctx, scene, levels } = this;
    let takenAt = 0,
      stale = false;
    const bgColor = scene.background instanceof THREE.Color ? scene.background.clone() : new THREE.Color("#07060c");
    const view = (n: number) => {
      const v = levels[n].view;
      const bg = v != null ? ctx.cityView(key, v, back) : null;
      scene.background = bg ?? bgColor;
      takenAt = performance.now();
      stale = v != null && takenAt < 45_000;
    };
    const setFloor = (n: number) => {
      this.groups.forEach((g, i) => (g.visible = i === n));
      view(n);
      this.enter(n);
      onFloor?.(n);
    };
    this.flush();
    this.padLights();
    setFloor(0);
    const camQuat = new THREE.Quaternion();
    const camRight = new THREE.Vector3();
    const find = (o: THREE.Object3D | null) => {
      for (let x = o; x; x = x.parent) if (this.picks.has(x)) return x;
      return null;
    };
    return {
      key,
      title: this.title,
      scene,
      floors: levels.map((l) => ({ label: l.label, name: l.name, y: l.y, spawn: new THREE.Vector3(l.spawn[0], l.y, l.spawn[1]), yaw: l.yaw })),
      colliders: (f) => this.rects[f],
      setFloor,
      setTheme: () => {
        view(this.current);
        stale = true;
      },
      groundAt: (f, x, z) => {
        for (const fn of this.grounds[f]) {
          const y = fn(x, z);
          if (y != null) return y;
        }
        return null;
      },
      pickables: () => this.pickables.filter((o) => this.floorOf.get(o) === this.current),
      pick: (hit) => {
        const o = find(hit.object);
        return o ? (this.picks.get(o)!() ?? null) : null;
      },
      hover: (hit) => {
        const o = find(hit.object);
        return o ? (this.hovers.get(o) ?? null) : null;
      },
      update: (dt, t, camera) => {
        camera.getWorldPosition(this.eye);
        camera.getWorldQuaternion(camQuat);
        camRight.set(1, 0, 0).applyQuaternion(camQuat);
        for (const s of this.people[this.current]) s.update(dt, t, camQuat, camRight);
        for (const tick of this.ticks[this.current]) tick(dt, t);
        if (stale && performance.now() - takenAt > 61_000) view(this.current);
      },
    };
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

/** Marble: a ground colour with soft veins (floors and walls). */
export function marbleTex(seed: number, base: string, vein: string, px = 512, tiles = 4, rx = 1, ry = 1, joint = "rgba(90,70,40,0.35)") {
  return paint(
    px,
    px,
    (g, W, H) => {
      const t = W / tiles;
      for (let i = 0; i < tiles; i++)
        for (let j = 0; j < tiles; j++) {
          g.fillStyle = base;
          g.fillRect(i * t, j * t, t, t);
          g.fillStyle = `rgba(0,0,0,${0.02 + hash(i, j, 1, seed) * 0.05})`;
          g.fillRect(i * t, j * t, t, t);
        }
      g.globalAlpha = 0.24;
      g.strokeStyle = vein;
      for (let n = 0; n < 60; n++) {
        g.lineWidth = 0.6 + hash(n, 1, 2, seed) * 1.8;
        g.beginPath();
        let x = hash(n, 2, 2, seed) * W,
          y = hash(n, 3, 2, seed) * H;
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          x += (hash(n, s + 4, 2, seed) - 0.5) * 70;
          y += (hash(n, s + 9, 2, seed) - 0.5) * 70;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = joint;
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

// ---- live boards ----------------------------------------------------------------------------------

const UP = "#3ee08f",
  DOWN = "#ff5d6c",
  DIM = "#8f8a80";

/** The last blocks as a departures board: height, pool, txs, age. */
export function drawBlocks(g: CanvasRenderingContext2D, W: number, H: number, blocks: BlockSummary[], o: { title?: string; accent?: string; bg?: string; ink?: string } = {}) {
  const accent = o.accent ?? GOLD;
  g.fillStyle = o.bg ?? "#06080e";
  g.fillRect(0, 0, W, H);
  const s = Math.min(H / 300, W / 520);
  g.fillStyle = accent;
  g.fillRect(0, 0, W, Math.max(3, 4 * s));
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.font = `800 ${Math.round(28 * s)}px ${SANS}`;
  g.fillText(o.title ?? "BLOCKS", 18 * s, 42 * s);
  const rows = blocks.slice(0, 6);
  const rowH = (H - 64 * s) / 6;
  const now = Date.now();
  g.font = `600 ${Math.round(14 * s)}px ${MONO}`;
  g.fillStyle = DIM;
  g.fillText("HEIGHT", 18 * s, 60 * s);
  g.fillText("POOL", W * 0.36, 60 * s);
  g.textAlign = "right";
  g.fillText("TXS", W * 0.8, 60 * s);
  g.fillText("AGO", W - 18 * s, 60 * s);
  rows.forEach((b, i) => {
    const y = 64 * s + (i + 0.72) * rowH;
    if (i % 2 === 0) {
      g.fillStyle = "rgba(255,255,255,0.035)";
      g.fillRect(0, y - rowH * 0.7, W, rowH);
    }
    g.textAlign = "left";
    g.fillStyle = i === 0 ? accent : o.ink ?? "#f2eee6";
    g.font = `800 ${Math.round(rowH * 0.5)}px ${MONO}`;
    g.fillText(`#${num(b.height)}`, 18 * s, y);
    g.fillStyle = "#b8b2a6";
    g.font = `600 ${Math.round(rowH * 0.4)}px ${MONO}`;
    g.fillText((b.miner_pool ?? "unknown").slice(0, 14), W * 0.36, y);
    g.textAlign = "right";
    g.fillText(b.tx_count ? String(b.tx_count) : "·", W * 0.8, y);
    const ago = Math.max(0, Math.round((now - Date.parse(b.time)) / 1000));
    g.fillStyle = i === 0 ? UP : DIM;
    g.fillText(ago < 90 ? `${ago}s` : ago < 5400 ? `${Math.round(ago / 60)}m` : `${Math.round(ago / 3600)}h`, W - 18 * s, y);
  });
  g.textAlign = "left";
}

/** Big price with its 24 h change, on any background (for small desk screens). */
export function drawTicker(g: CanvasRenderingContext2D, W: number, H: number, o: { bg?: string; ink?: string; label?: string } = {}) {
  const p = Market.state.price;
  g.fillStyle = o.bg ?? "#05070c";
  g.fillRect(0, 0, W, H);
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillStyle = DIM;
  g.font = `700 ${Math.round(H * 0.16)}px ${MONO}`;
  g.fillText(o.label ?? "ZEC/USD", W * 0.05, H * 0.2);
  if (!p) return;
  g.fillStyle = o.ink ?? "#f2eee6";
  g.font = `800 ${Math.round(H * 0.34)}px ${MONO}`;
  g.fillText(usd(p.usd), W * 0.05, H * 0.55);
  const ch = p.usd_24h_change;
  g.fillStyle = ch >= 0 ? UP : DOWN;
  g.font = `700 ${Math.round(H * 0.18)}px ${MONO}`;
  g.fillText(`${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%`, W * 0.05, H * 0.85);
}
