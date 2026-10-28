import { portraitImage } from "../../data/portrait";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ZScan } from "../../data/zscan";
import { loadArt, poseCell, Snark } from "../../scene/snark";
import { FLASH_CELL } from "../../scene/sprites";
import { MATERIALS, meshModel } from "../../scene/voxel/mesher";
import type { Kind, VoxelModel } from "../../scene/voxel/model";
import { hash } from "../../scene/voxel/model";
import { additive, poolTexture, washTexture } from "../gallery/look";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The Louvre's shared kit: one group per floor (only the floor you stand on is drawn), batched
 * architecture (one merged mesh per material and floor), voxel pieces merged the same way,
 * paintings (one instanced draw for every frame, one for every picture through a per-floor
 * portrait atlas, one for every wall label), light pools and washes, visitors and guards.
 */

export const FLOOR_Y = [0, 40, 80, 120, 160, 200];
export const LIGHTS = 6;

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit: THREE.Intersection) => PickInfo | null;
export type HoverFn = (hit: THREE.Intersection) => string | null;

/** Facing yaws: a plane whose front looks toward +x, −x, +z, −z. */
export const FACE = { px: Math.PI / 2, nx: -Math.PI / 2, pz: 0, nz: Math.PI };

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { repeat?: boolean; nearest?: boolean } = {}) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.nearest) t.magFilter = THREE.NearestFilter;
  return t;
}

/** World-scale UVs on a merged geometry: each face takes the two axes it spans, / `scale`. */
export function worldUV(geo: THREE.BufferGeometry, scale: number) {
  const p = geo.getAttribute("position"),
    n = geo.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i));
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    let u: number, v: number;
    if (ay > 0.5) [u, v] = [x, z];
    else if (ax > 0.5) [u, v] = [z, y];
    else [u, v] = [x, y];
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A box geometry with its bottom at y. */
export function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

/** Atlas material: per-instance `aOff` (u0, v0, du, dv) picks the instance's cell of the map. */
export function atlasMaterial(map: THREE.Texture, color = "#ffffff", key = "atlas") {
  const m = new THREE.MeshBasicMaterial({ map, color });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 aOff;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = aOff.xy + uv * aOff.zw;");
  };
  m.customProgramCacheKey = () => `museum-${key}`;
  return m;
}

/** A canvas cut into equal cells; one texture for many small images or labels. */
export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cw: number,
    readonly ch: number,
    nearest = false,
  ) {
    [this.canvas, this.g] = canvas(cols * cw, rows * ch);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    if (nearest) {
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.generateMipmaps = true;
    }
  }
  get size() {
    return this.cols * this.rows;
  }
  /** (u0, v0, du, dv) of cell i, a hair inside so neighbours never bleed. */
  off(i: number): [number, number, number, number] {
    const c = i % this.cols,
      r = Math.floor(i / this.cols);
    const W = this.cols * this.cw,
      H = this.rows * this.ch;
    const e = 1.5;
    return [(c * this.cw + e) / W, 1 - ((r + 1) * this.ch - e) / H, (this.cw - 2 * e) / W, (this.ch - 2 * e) / H];
  }
  cell(i: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = i % this.cols,
      r = Math.floor(i / this.cols);
    this.g.save();
    this.g.translate(c * this.cw, r * this.ch);
    this.g.beginPath();
    this.g.rect(0, 0, this.cw, this.ch);
    this.g.clip();
    draw(this.g, this.cw, this.ch);
    this.g.restore();
    this.tex.needsUpdate = true;
  }
}

/** One painting: centre, the wall's normal as a yaw, picture size; which item hangs there. */
export interface Hang {
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
  /** Item by collection rank (1 = rarest) or by id. */
  rank?: number;
  id?: number;
  /** Frame tone: gilt (default), dark gilt, black and gold. */
  tone?: 0 | 1 | 2;
  /** Wall label placement: right of the frame (default) or below. */
  label?: "right" | "below" | "none";
}

/** Batched architecture of one floor: geometries collected per material, merged at the end. */
class Batch {
  geos = new Map<THREE.Material, { list: THREE.BufferGeometry[]; uv?: number }>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, uvScale?: number) {
    let e = this.geos.get(mat);
    if (!e) this.geos.set(mat, (e = { list: [], uv: uvScale }));
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    e.list.push(g);
  }
  build(parent: THREE.Object3D) {
    for (const [mat, e] of this.geos) {
      if (!e.list.length) continue;
      for (const g of e.list) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      const merged = mergeGeometries(e.list);
      if (!merged) continue;
      if (e.uv) worldUV(merged, e.uv);
      e.list.forEach((g) => g.dispose());
      parent.add(new THREE.Mesh(merged, mat));
    }
    this.geos.clear();
  }
}

/** Voxel pieces of one floor, merged into one mesh per voxel material. `k` = metres per voxel / (1/6). */
class Voxels {
  private parts: Record<Kind, THREE.BufferGeometry[]> = { solid: [], glass: [], emit: [] };
  private static cache = new Map<string, Partial<Record<Kind, THREE.BufferGeometry>>>();
  add(key: string, make: () => VoxelModel, x: number, y: number, z: number, yaw = 0, k = 1) {
    let g = Voxels.cache.get(key);
    if (!g) Voxels.cache.set(key, (g = meshModel(make())));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(k, k, k));
    for (const kind of ["solid", "glass", "emit"] as Kind[]) {
      const geo = g[kind];
      if (geo) this.parts[kind].push(geo.clone().applyMatrix4(m));
    }
  }
  build(parent: THREE.Object3D) {
    for (const kind of ["solid", "glass", "emit"] as Kind[]) {
      if (!this.parts[kind].length) continue;
      const geo = mergeGeometries(this.parts[kind]);
      this.parts[kind].forEach((p) => p.dispose());
      this.parts[kind] = [];
      parent.add(new THREE.Mesh(geo, MATERIALS[kind]));
    }
  }
}

/** Ornate gilt frame for a 1 × 1 picture opening, facing +z, back on z = 0. */
function frameGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const ring = (inner: number, width: number, depth: number, z0: number) => {
    const o = inner + 2 * width;
    parts.push(boxGeo(o, width, depth, 0, -o / 2, z0 + depth / 2).translate(0, 0, 0));
    parts.push(boxGeo(o, width, depth, 0, o / 2 - width, z0 + depth / 2));
    parts.push(boxGeo(width, inner, depth, -(inner / 2 + width / 2), -inner / 2, z0 + depth / 2));
    parts.push(boxGeo(width, inner, depth, inner / 2 + width / 2, -inner / 2, z0 + depth / 2));
  };
  // back plate, outer moulding, a raised torus, the inner slope, a sight edge
  ring(1.0, 0.2, 0.05, 0);
  ring(1.06, 0.13, 0.09, 0.02);
  ring(1.12, 0.06, 0.12, 0.04);
  ring(1.0, 0.03, 0.07, 0.03);
  // corner cartouches and the crest in the middle of each side
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      parts.push(boxGeo(0.2, 0.2, 0.14, sx * 0.6, sy * 0.6 - 0.1, 0.07));
      parts.push(boxGeo(0.1, 0.1, 0.17, sx * 0.6, sy * 0.6 - 0.05, 0.085));
    }
  for (const [x, y, w, h] of [
    [0, 0.6, 0.3, 0.12],
    [0, -0.6, 0.26, 0.1],
    [0.6, 0, 0.1, 0.24],
    [-0.6, 0, 0.1, 0.24],
  ])
    parts.push(boxGeo(w, h, 0.15, x, y - h / 2, 0.075));
  parts.push(boxGeo(0.12, 0.08, 0.18, 0, 0.66, 0.09));
  const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  return geo;
}
let frameGeo: THREE.BufferGeometry | null = null;

const GILT = [new THREE.Color("#d4a640"), new THREE.Color("#a87c2c"), new THREE.Color("#2a2220")];

export class MuseumKit {
  readonly groups = FLOOR_Y.map(() => new THREE.Group());
  readonly rects: Rect[][] = FLOOR_Y.map(() => []);
  readonly people: Snark[][] = FLOOR_Y.map(() => []);
  readonly ticks: Tick[][] = FLOOR_Y.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, HoverFn>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  /** Paintings per floor, before and after they are built. */
  readonly hangs: Hang[][] = FLOOR_Y.map(() => []);
  /** Walkable heights (floor-local) where a floor is not flat: stairs, landings. Null = flat. */
  readonly grounds: ((x: number, z: number) => number | null)[][] = FLOOR_Y.map(() => []);
  readonly pictures: (THREE.InstancedMesh | null)[] = FLOOR_Y.map(() => null);
  readonly portraitAtlas: Atlas[] = [];
  readonly labelAtlas: Atlas[] = [];
  private batches = FLOOR_Y.map(() => new Batch());
  private voxels = FLOOR_Y.map(() => new Voxels());
  private pools: [number, number, number, number, string, number][][] = FLOOR_Y.map(() => []);
  private washes: [number, number, number, number, number, number, number, string][][] = FLOOR_Y.map(() => []);
  private lightCount = FLOOR_Y.map(() => 0);
  current = 0;
  /** The visitor's camera, world position (pieces that turn to face it). */
  readonly cam = new THREE.Vector3();
  readonly camQuat = new THREE.Quaternion();

  // ---- shared materials --------------------------------------------------------------------------
  readonly gold = new THREE.MeshStandardMaterial({ color: "#c9982e", roughness: 0.32, metalness: 0.85, emissive: "#1a1206", envMapIntensity: 1.4 });
  readonly brass = new THREE.MeshStandardMaterial({ color: "#a8822c", roughness: 0.4, metalness: 0.8, envMapIntensity: 1.2 });
  readonly steel = new THREE.MeshStandardMaterial({ color: "#5a5e66", roughness: 0.35, metalness: 0.8 });
  readonly chrome = new THREE.MeshStandardMaterial({ color: "#d4d8de", roughness: 0.15, metalness: 0.95 });
  readonly black = new THREE.MeshStandardMaterial({ color: "#121116", roughness: 0.5, metalness: 0.2 });
  readonly white = new THREE.MeshStandardMaterial({ color: "#f2eee6", roughness: 0.6 });
  readonly velvet = new THREE.MeshStandardMaterial({ color: "#7a1220", roughness: 0.95 });
  readonly oak = new THREE.MeshStandardMaterial({ color: "#6a4428", roughness: 0.55 });
  /** White base so each frame's instance colour is its gilt exactly. */
  readonly frameMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3, metalness: 0.85, emissive: "#1a1206", envMapIntensity: 1.5 });
  /** A camera flash: a white burst, additive, over the phone. */
  private flashGeo = new THREE.PlaneGeometry(0.55, 0.55);
  private flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), color: new THREE.Color(2.2, 2.2, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  readonly glass = new THREE.MeshStandardMaterial({ color: "#cfe6ee", roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    this.groups.forEach((g, i) => {
      g.position.y = FLOOR_Y[i];
      g.visible = i === 0;
      scene.add(g);
    });
  }

  // ---- day and night ---------------------------------------------------------------------------

  private glows: { m: THREE.MeshBasicMaterial; day: THREE.Color; night: THREE.Color }[] = [];
  private allLights: THREE.PointLight[] = [];

  /** A self-lit material: a lamp (dimmer at night) or a skylight (dark blue at night). */
  lit(color: string, k: number, kind: "lamp" | "sky" = "lamp", map?: THREE.Texture) {
    const day = new THREE.Color(color).multiplyScalar(k);
    const night = kind === "sky" ? new THREE.Color("#1a2238").multiplyScalar(1.3) : day.clone().multiplyScalar(0.55);
    const m = new THREE.MeshBasicMaterial({ color: day.clone(), map: map ?? null, toneMapped: false });
    this.glows.push({ m, day, night });
    return m;
  }

  setNight(night: boolean) {
    for (const g of this.glows) g.m.color.copy(night ? g.night : g.day);
    for (const l of this.allLights) l.intensity = (l.userData.base as number) * (night ? 0.75 : 1);
  }

  // ---- building ----------------------------------------------------------------------------------

  /** Add a geometry (floor-local coordinates) to a floor's batch for `mat`. `uv`: world UV scale. */
  geo(f: number, mat: THREE.Material, geo: THREE.BufferGeometry, uv?: number) {
    this.batches[f].add(mat, geo, uv);
  }

  /** A box with its bottom at y; `solid` also blocks the walker. */
  box(f: number, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, o: { solid?: boolean; uv?: number } = {}) {
    this.geo(f, mat, boxGeo(w, h, d, x, y, z), o.uv);
    if (o.solid) this.rects[f].push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  }

  /** Axis-aligned wall from (x0, z0) to (x1, z1), collidable. */
  wall(f: number, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, h: number, t = 0.4, uv?: number) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const w = alongX ? Math.abs(x1 - x0) + t : t,
      d = alongX ? t : Math.abs(z1 - z0) + t;
    this.box(f, mat, w, h, d, (x0 + x1) / 2, 0, (z0 + z1) / 2, { solid: true, uv });
  }

  /** A flat textured plane (floor: rx = −π/2) — kept apart from the batch (own texture repeat). */
  plane(f: number, mat: THREE.Material, w: number, d: number, x: number, y: number, z: number, rx = -Math.PI / 2, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(rx, ry, 0, "YXZ");
    m.position.set(x, y, z);
    this.groups[f].add(m);
    return m;
  }

  vox(f: number, key: string, make: () => VoxelModel, x: number, y: number, z: number, yaw = 0, k = 1) {
    this.voxels[f].add(key, make, x, y, z, yaw, k);
  }

  solid(f: number, x0: number, z0: number, x1: number, z1: number) {
    this.rects[f].push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }

  /** A soft pool of light on the floor. */
  pool(f: number, x: number, z: number, r: number, color = "#ffe2b0", y = 0.012, k = 1) {
    this.pools[f].push([x, y + this.pools[f].length * 0.0003, z, r, color, k]);
  }

  /** Light fanning down a wall from the top (centre x, z; facing yaw; width, height, top). */
  wash(f: number, x: number, z: number, yaw: number, w: number, h: number, top: number, color = "#ffe6c0") {
    this.washes[f].push([x, z, yaw, w, h, top, 0, color]);
  }

  /** A point light (at most LIGHTS a floor, so every floor compiles the same shaders). */
  light(f: number, x: number, y: number, z: number, color = "#ffe6c8", intensity = 30, dist = 30) {
    if (this.lightCount[f] >= LIGHTS) return null;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.3);
    l.position.set(x, y, z);
    l.userData.base = intensity;
    this.allLights.push(l);
    this.groups[f].add(l);
    return l;
  }

  pick(f: number, o: THREE.Object3D, hover: string | HoverFn, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, typeof hover === "string" ? () => hover : hover);
    this.picks.set(o, info);
  }

  /** A sign or panel drawn on a canvas, as a mesh (width in metres; height follows the canvas). */
  panel(f: number, w: number, h: number, widthM: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { glow?: boolean; transparent?: boolean } = {}) {
    const t = canvasTex(w, h, draw, { repeat: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(widthM, (widthM * h) / w), new THREE.MeshBasicMaterial({ map: t, transparent: o.transparent ?? true, toneMapped: !o.glow }));
    this.groups[f].add(m);
    return m;
  }

  hang(f: number, h: Hang) {
    this.hangs[f].push(h);
  }

  /** Close a floor: merge its batches and voxels, build its paintings, pools, washes, pad lights. */
  finish(f: number) {
    const g = this.groups[f];
    this.batches[f].build(g);
    this.voxels[f].build(g);
    this.buildPaintings(f);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      col = new THREE.Color(),
      up = new THREE.Vector3(0, 1, 0);
    const pools = this.pools[f];
    if (pools.length) {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), additive(poolTexture(), "#ffffff", 0.18), pools.length);
      pools.forEach(([x, y, z, r, c, k], i) => {
        im.setMatrixAt(i, m.compose(p.set(x, y, z), q.identity(), s.set(r * 2, 1, r * 2)));
        im.setColorAt(i, col.set(c).multiplyScalar(k));
      });
      im.renderOrder = 2;
      im.raycast = () => {};
      g.add(im);
    }
    const washes = this.washes[f];
    if (washes.length) {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0), additive(washTexture(), "#ffffff", 0.12), washes.length);
      washes.forEach(([x, z, yaw, w, hh, top, , c], i) => {
        im.setMatrixAt(i, m.compose(p.set(x + Math.sin(yaw) * 0.03, top, z + Math.cos(yaw) * 0.03), q.setFromAxisAngle(up, yaw), s.set(w, hh, 1)));
        im.setColorAt(i, col.set(c));
      });
      im.renderOrder = 3;
      im.raycast = () => {};
      g.add(im);
    }
    while (this.lightCount[f] < LIGHTS) this.light(f, 0, 3, -5, "#000000", 0);
  }

  // ---- paintings ---------------------------------------------------------------------------------

  private buildPaintings(f: number) {
    const hs = this.hangs[f];
    if (!hs.length) return;
    const n = hs.length;
    frameGeo ??= frameGeometry();
    const atlas = new Atlas(16, Math.ceil(n / 16), 130, 130, true);
    atlas.g.fillStyle = "#14110e";
    atlas.g.fillRect(0, 0, atlas.canvas.width, atlas.canvas.height);
    this.portraitAtlas[f] = atlas;
    const labels = new Atlas(4, Math.ceil(n / 4), 480, 150);
    this.labelAtlas[f] = labels;
    const pic = new THREE.PlaneGeometry(1, 1);
    const offP = new Float32Array(n * 4),
      offL = new Float32Array(n * 4);
    const nl = hs.filter((h) => h.label !== "none").length;
    const lab = new THREE.PlaneGeometry(0.42, 0.42 * (150 / 480));
    hs.forEach((_, i) => offP.set(atlas.off(i), i * 4));
    pic.setAttribute("aOff", new THREE.InstancedBufferAttribute(offP, 4));
    const pics = new THREE.InstancedMesh(pic, atlasMaterial(atlas.tex, "#f2ece2", "pic"), n);
    const frames = new THREE.InstancedMesh(frameGeo, this.frameMat, n);
    const labs = new THREE.InstancedMesh(lab, atlasMaterial(labels.tex, "#ffffff", "label"), Math.max(1, nl));
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0);
    let li = 0;
    hs.forEach((h, i) => {
      q.setFromAxisAngle(up, h.yaw);
      const nx = Math.sin(h.yaw),
        nz = Math.cos(h.yaw);
      const rx = Math.cos(h.yaw),
        rz = -Math.sin(h.yaw);
      m.compose(p.set(h.x + nx * 0.042 * h.s, h.y, h.z + nz * 0.042 * h.s), q, s.set(h.s, h.s, 1));
      pics.setMatrixAt(i, m);
      m.compose(p.set(h.x, h.y, h.z), q, s.set(h.s, h.s, h.s * 0.6));
      frames.setMatrixAt(i, m);
      frames.setColorAt(i, GILT[h.tone ?? 0]);
      if (h.label !== "none") {
        const below = h.label === "below";
        const lx = below ? 0 : h.s * 0.72 + 0.3,
          ly = below ? -h.s * 0.72 - 0.18 : -h.s * 0.5 + 0.07;
        m.compose(p.set(h.x + rx * lx + nx * 0.02, h.y + ly, h.z + rz * lx + nz * 0.02), q, s.set(1, 1, 1));
        labs.setMatrixAt(li, m);
        offL.set(labels.off(i), li * 4);
        li++;
      }
    });
    lab.setAttribute("aOff", new THREE.InstancedBufferAttribute(offL, 4));
    labs.count = nl;
    for (const im of [pics, frames, labs]) {
      im.computeBoundingSphere();
      this.groups[f].add(im);
    }
    labs.raycast = () => {};
    this.pictures[f] = pics;
  }

  // ---- loading, gently: a floor's pictures and people load when it is first visited, a few at a
  // time (the API's image limiter answers bursts with 429s that carry no CORS header) -------------

  private gates = FLOOR_Y.map(() => {
    let open!: () => void;
    const p = new Promise<void>((r) => (open = r));
    return { p, open };
  });
  private running = 0;
  private waiting: (() => void)[] = [];

  /** The walker reached floor f: its pictures and people start loading. */
  visit(f: number) {
    this.gates[f].open();
  }
  whenVisited(f: number) {
    return this.gates[f].p;
  }

  /** Run `job` when one of four slots is free; retried with a pause when it fails. */
  async throttle<T>(job: () => Promise<T>, tries = 7): Promise<T> {
    if (this.running >= 3) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      for (let i = 0; ; i++) {
        try {
          return await job();
        } catch (e) {
          if (i >= tries - 1) throw e;
          await new Promise((r) => setTimeout(r, 2000 * (i + 1) + Math.random() * 1500));
        }
      }
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  /** An image from the API, through the throttle. */
  image(url: string) {
    return portraitImage(url);
  }

  /** A texture filled once its image arrives (pixel art: nearest filtering). */
  texture(url: string, f: number) {
    const [blank, bg] = canvas(2, 2);
    bg.fillStyle = "#0a0908";
    bg.fillRect(0, 0, 2, 2);
    const t = new THREE.Texture<TexImageSource>(blank);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.anisotropy = 8;
    void this.whenVisited(f)
      .then(() => this.image(url))
      .then((im) => {
        // the placeholder's storage is immutable: free it so the real size is allocated
        t.dispose();
        t.image = im;
        t.needsUpdate = true;
      })
      .catch(() => {});
    return t;
  }

  /** Draw item `id` into painting i of floor f (portrait from the API, nearest-scaled 4×). */
  async showPortrait(f: number, i: number, id: number) {
    const a = this.portraitAtlas[f];
    if (!a) return;
    await this.whenVisited(f);
    const img = await this.image(ZScan.zkSnarkImage(id)).catch(() => null);
    if (!img) return;
    a.cell(i, (g, w, h) => {
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, w, h);
    });
  }

  /** Museum wall label (cartel): name, rank and band, the lineage. */
  drawLabel(f: number, i: number, title: string, line: string, small: string) {
    this.labelAtlas[f]?.cell(i, (g, w, h) => {
      g.fillStyle = "#efe9dc";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#c9b48a";
      g.fillRect(0, h - 6, w, 6);
      g.fillStyle = "#1d1a17";
      g.font = '700 40px "Times New Roman", Georgia, serif';
      g.textBaseline = "alphabetic";
      g.fillText(title, 22, 50);
      g.font = '500 28px "JetBrains Mono", Menlo, monospace';
      g.fillStyle = "#6a1c1c";
      g.fillText(line, 22, 92);
      g.font = 'italic 26px "Times New Roman", Georgia, serif';
      g.fillStyle = "#5a544c";
      g.fillText(small, 22, 130);
    });
  }

  // ---- people ------------------------------------------------------------------------------------

  /**
   * A zkSNARK on floor f. `face`: the point it looks at; `wander`: spots it strolls between;
   * `phone`: photographs it, phone held up with a flash now and then; `selfie`: turns its back to it
   * for a selfie; `guard`: a museum guard's cap; `perch`: sits on a bench that high.
   */
  async person(f: number, id: number, at: [number, number], o: { face?: [number, number]; wander?: [number, number][]; phone?: boolean; selfie?: boolean; guard?: boolean; perch?: number; item?: "bag" | "book" | "coffee" | "flowers" } = {}) {
    try {
      await this.whenVisited(f);
      const s = new Snark(id, await this.throttle(() => loadArt(id)));
      s.noClip = true;
      s.state = "resident";
      s.role = o.guard ? "Guard" : "Visitor";
      s.root.position.set(at[0], 0, at[1]);
      const look = () => (o.face ? new THREE.Vector3(o.face[0] - s.root.position.x, 0, o.face[1] - s.root.position.z).normalize() : null);
      s.faceDir = look();
      if (o.guard) s.setCap();
      if (o.item) {
        s.carry = o.item;
        s.redrawHold();
      }
      // a phone up over the heads to photograph the painting, or out at arm's length for a selfie
      // with the painting behind (turned away from it); now and then the flash goes
      if (o.phone || o.selfie) {
        const kind = o.selfie ? "selfie" : "snap";
        s.carry = kind;
        s.redrawHold();
        if (o.selfie && o.face) s.faceDir = new THREE.Vector3(s.root.position.x - o.face[0], 0, s.root.position.z - o.face[1]).normalize();
        const [c, r] = FLASH_CELL[kind]!;
        const fl = new THREE.Mesh(this.flashGeo, this.flashMat);
        fl.position.copy(poseCell(c, r)).setZ(0.06);
        fl.visible = false;
        fl.raycast = () => {};
        s.attachToHold(fl);
        let next = 2 + hash(id, 9, 2) * 8,
          off = 0;
        this.ticks[f].push((_dt, t) => {
          if (t > next) {
            // one pop, sometimes two (the pre-flash)
            off = t + 0.07;
            next = t + (hash(id, Math.floor(t), 4) < 0.25 ? 0.18 : 4 + hash(id, Math.floor(t), 6) * 9);
          }
          fl.visible = t < off;
          if (fl.visible) fl.scale.setScalar(0.7 + (off - t) * 6);
        });
      }
      if (o.perch) s.perch(o.perch);
      this.groups[f].add(s.root);
      this.people[f].push(s);
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          await new Promise((r) => setTimeout(r, hash(id, 1, 2) * 9000));
          for (;;) {
            await new Promise((r) => setTimeout(r, 5000 + Math.random() * 9000));
            if (this.current !== f || !s.router) continue;
            s.faceDir = null;
            const pt = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(pt[0], 0, pt[1])], 0.8 + Math.random() * 0.3);
            s.faceDir = o.face ? look() : null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /** A seeded visitor id (any of the 10,000), different for every call site. */
  visitor(n: number) {
    return 1 + Math.floor(hash(n, 7, 31, 5) * 9999);
  }
}

/** A soft white burst for camera flashes (a bright core, a quick fall-off, four short rays). */
function flashTexture() {
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.12, "rgba(255,255,250,0.9)");
  r.addColorStop(0.35, "rgba(255,250,235,0.25)");
  r.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(62, 8, 4, 112);
  g.fillRect(8, 62, 112, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
