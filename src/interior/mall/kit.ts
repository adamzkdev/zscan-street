import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../../data/market";
import type { BlockSummary } from "../../data/types";
import { get, ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import type { VoxelModel } from "../../scene/voxel/model";
import { place } from "../furniture";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The ZK MALL's kit. Five levels of 50 × 56 m around a central atrium (the void, x ±10,
 * z −34…−14) where the rain vortex falls from the glass roof into the pool on the ground floor.
 *
 * Everything static (slabs, shopfronts, shop interiors, foliage) is merged by material into a few
 * meshes that stay visible from every level, as an atrium needs; what costs (people, live screens,
 * voxel furniture, lights) lives in one group per level, only drawn on the level you are on.
 * Builders write in a local frame (`at`), so a shop is built once whatever wall it faces.
 */

export const LEVELS = [
  { label: "G", name: "Canal · Rain Vortex · luxury", y: 0 },
  { label: "1", name: "Fashion & beauty", y: 6 },
  { label: "2", name: "Tech, toys & books", y: 12 },
  { label: "3", name: "Hawker centre · restaurants", y: 18 },
  { label: "4", name: "ZK CINEMA · arcade", y: 24 },
];
export const FH = 6;
export const ROOF = 30;
export const X0 = -25,
  X1 = 25,
  Z0 = -56,
  Z1 = 0;
/** The void: the slabs are open over x ±VX, z VZ0…VZ1; railings stand at ±RAIL. */
export const VX = 10,
  VZ0 = -34,
  VZ1 = -14,
  CZ = -24,
  RAIL = 10.7;
/** Shop fronts of the side columns, and the north anchors' front. */
export const COL = 16,
  NORTH = -40;
export const LIGHTS = 6;

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit?: THREE.Intersection) => PickInfo | null;
export type Layer = number | "core";
export type Col = string | THREE.Color;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SANS = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';
export const SERIF = 'Didot, "Bodoni 72", "Playfair Display", Georgia, serif';
export const JP = '"Hiragino Sans", "PingFang SC", "Noto Sans CJK SC", sans-serif';

export function makeCanvas(w: number, h: number, draw?: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw?.(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g, t };
}

/** A local frame: origin (x, y, z), turned `ry` about the vertical. */
export function frameAt(x: number, y: number, z: number, ry = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
}

/** Texture pages for signs and pictures, shelf-packed; one material pair per page. */
class Atlas {
  readonly W = 2048;
  readonly H = 2048;
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly glowMat: THREE.MeshBasicMaterial;
  readonly picMat: THREE.MeshBasicMaterial;
  private x = 0;
  private y = 0;
  private row = 0;
  constructor() {
    const { g, t } = makeCanvas(this.W, this.H);
    this.g = g;
    this.tex = t;
    t.anisotropy = 8;
    this.glowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide });
    this.picMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide });
  }
  /** Room for w × h pixels, or null when the page is full. */
  alloc(w: number, h: number): [number, number] | null {
    w = Math.min(w, this.W);
    if (this.x + w > this.W) {
      this.x = 0;
      this.y += this.row + 2;
      this.row = 0;
    }
    if (this.y + h > this.H) return null;
    const at: [number, number] = [this.x, this.y];
    this.x += w + 2;
    this.row = Math.max(this.row, h);
    return at;
  }
  uv(x: number, y: number, w: number, h: number): [number, number, number, number] {
    return [x / this.W, 1 - (y + h) / this.H, (x + w) / this.W, 1 - y / this.H];
  }
}

export interface SignOpts {
  color?: string;
  bg?: string;
  font?: string;
  /** Glowing (neon, light box) or printed. */
  glow?: boolean;
  /** Outline the text box in the text colour. */
  frame?: boolean;
  align?: "center" | "left";
  /** Letter spacing in px. */
  spacing?: number;
}

export class MallKit {
  readonly core = new THREE.Group();
  readonly groups = LEVELS.map(() => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  readonly ticks: Tick[][] = LEVELS.map(() => []);
  /** Ticks that run whatever the level (the vortex, the sampan, the light show). */
  readonly always: Tick[] = [];
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  /** Level of a pickable; -1: from anywhere (the vortex). */
  readonly floorOf = new Map<THREE.Object3D, number>();
  private lightCount = LEVELS.map(() => 0);
  private parts = new Map<string, { layer: Layer; mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  atlases: Atlas[] = [new Atlas()];
  current = 0;
  night = false;
  /** Where the builders draw: a local frame, and the layer (core or one level). */
  frame = new THREE.Matrix4();
  layer: Layer = "core";
  private lastHeight = 0;
  private lastPool: string | null = null;
  /** The newest block's summary, fetched once per block while someone is inside. */
  block: BlockSummary | null = null;
  private fetching = 0;

  // shared materials: vertex colours carry the colour, so one material draws a thousand things
  readonly paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.04 });
  readonly gloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.15 });
  readonly metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85 });
  readonly glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  readonly leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
  readonly glass = new THREE.MeshStandardMaterial({ color: "#a8c8d8", transparent: true, opacity: 0.09, roughness: 0.18, metalness: 0.15, depthWrite: false, side: THREE.DoubleSide });
  readonly tint = new THREE.MeshStandardMaterial({ color: "#88b8d0", transparent: true, opacity: 0.32, roughness: 0.18, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  readonly hidden = new THREE.MeshBasicMaterial({ visible: false });

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    scene.add(this.core);
    for (const g of this.groups) scene.add(g);
    ctx.onBlock((h, pool) => {
      this.lastHeight = h;
      this.lastPool = pool;
    });
    this.night = ctx.theme === "night";
    // the market feeds start once (prices, pools, supply, network), refreshed every minute
    Market.subscribe(() => {});
  }

  get market() {
    return Market.state;
  }
  /** The latest block height: the street's last block, or the newest announced since. */
  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }
  get pool() {
    return this.block?.height === this.height ? this.block.miner_pool : this.lastPool;
  }
  /** Keep `block` on the newest height (called every frame while inside; one fetch per block). */
  refreshBlock() {
    const h = this.height;
    if (!h || this.block?.height === h || this.fetching === h) return;
    this.fetching = h;
    void get<BlockSummary>(`/v1/blocks/${h}`).then((b) => {
      if (b && b.height >= (this.block?.height ?? 0)) this.block = b;
    });
  }

  y(f: number) {
    return LEVELS[f].y;
  }

  /** Build in the frame of a level (origin at its floor), or a turned local frame on it. */
  at(f: number | null, x = 0, z = 0, ry = 0, layer: Layer = "core") {
    this.frame = frameAt(x, f === null ? 0 : LEVELS[f].y, z, ry);
    this.layer = layer;
    return this;
  }
  /** A point of the current frame in world space. */
  world(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.frame);
  }

  // ---- static geometry (merged) -----------------------------------------------------------------

  /** Adds a geometry (in local units, already placed by `local`) in `color` to the merge. */
  geo(mat: THREE.Material, color: Col, g: THREE.BufferGeometry, local?: THREE.Matrix4, k = 1) {
    if (!g.index) {
      const n = g.attributes.position.count;
      g.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    g.applyMatrix4(local ? _m.multiplyMatrices(this.frame, local) : this.frame);
    _c.set(color as THREE.ColorRepresentation).multiplyScalar(k);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const key = `${this.layer}|${mat.uuid}`;
    let p = this.parts.get(key);
    if (!p) this.parts.set(key, (p = { layer: this.layer, mat, geos: [] }));
    p.geos.push(g);
  }

  /** A box standing on y (its bottom), centred on x, z, turned ry. */
  box(mat: THREE.Material, color: Col, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, k = 1) {
    _m.compose(_v.set(x, y + h / 2, z), _q.setFromAxisAngle(_s.set(0, 1, 0), ry), _s.set(1, 1, 1));
    this.geo(mat, color, new THREE.BoxGeometry(w, h, d), _m.clone(), k);
  }
  /** A box centred at (x, y, z) with any rotation. */
  boxR(mat: THREE.Material, color: Col, w: number, h: number, d: number, x: number, y: number, z: number, rx: number, ry: number, rz = 0, k = 1) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(1, 1, 1));
    this.geo(mat, color, new THREE.BoxGeometry(w, h, d), _m.clone(), k);
  }
  cyl(mat: THREE.Material, color: Col, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 12, k = 1, open = false) {
    _m.makeTranslation(x, y + h / 2, z);
    this.geo(mat, color, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), _m.clone(), k);
  }
  /** A vertical rectangle facing +z (after ry), centred at (x, y, z); uv: the texture rectangle. */
  quad(mat: THREE.Material, color: Col, w: number, h: number, x: number, y: number, z: number, ry = 0, uv?: [number, number, number, number], k = 1) {
    const g = new THREE.PlaneGeometry(w, h);
    if (uv) setUV(g, uv);
    _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(_s.set(0, 1, 0), ry), _s.set(1, 1, 1));
    this.geo(mat, color, g, _m.clone(), k);
  }
  /** A horizontal rectangle facing up (or down), centred at (x, y, z). */
  flat(mat: THREE.Material, color: Col, w: number, d: number, x: number, y: number, z: number, uv?: [number, number, number, number], down = false, k = 1) {
    const g = new THREE.PlaneGeometry(w, d);
    if (uv) setUV(g, uv);
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(down ? Math.PI / 2 : -Math.PI / 2, 0, 0)), _s.set(1, 1, 1));
    this.geo(mat, color, g, _m.clone(), k);
  }

  /** A sign: text on a glowing (or printed) panel `h` metres tall, facing +z after ry; returns its width. */
  sign(text: string, h: number, x: number, y: number, z: number, ry = 0, o: SignOpts = {}) {
    const px = 112;
    const font = o.font ?? `800 ${Math.round(px * 0.7)}px ${MONO}`;
    let a = this.atlases[this.atlases.length - 1];
    const g0 = a.g;
    g0.font = font;
    const sp = o.spacing ?? 0;
    const tw = Math.ceil(g0.measureText(text).width + sp * text.length);
    const w = Math.min(2040, tw + 48);
    let at = a.alloc(w, px);
    if (!at) {
      this.atlases.push((a = new Atlas()));
      at = a.alloc(w, px)!;
    }
    const g = a.g;
    g.save();
    g.beginPath();
    g.rect(at[0], at[1], w, px);
    g.clip();
    if (o.bg) {
      g.fillStyle = o.bg;
      g.fillRect(at[0], at[1], w, px);
    }
    if (o.frame) {
      g.strokeStyle = o.color ?? "#f4b728";
      g.lineWidth = 5;
      g.strokeRect(at[0] + 6, at[1] + 8, w - 12, px - 16);
    }
    g.font = font;
    g.textBaseline = "middle";
    g.fillStyle = o.color ?? "#f4b728";
    if (o.glow !== false && !o.bg) {
      g.shadowColor = o.color ?? "#f4b728";
      g.shadowBlur = 14;
    }
    const scale = Math.min(1, (w - 48) / tw);
    g.translate(at[0] + w / 2, at[1] + px / 2 + 4);
    g.scale(scale, 1);
    if (sp) {
      let cx = -tw / 2;
      for (const ch of text) {
        g.fillText(ch, cx, 0);
        cx += g.measureText(ch).width + sp;
      }
    } else {
      g.textAlign = "center";
      g.fillText(text, 0, 0);
    }
    g.restore();
    const width = (h * w) / px;
    this.quad(o.glow === false ? a.picMat : a.glowMat, "#ffffff", width, h, x, y, z, ry, a.uv(at[0], at[1], w, px));
    return width;
  }

  /** A picture drawn once into the atlas (a poster, a product shot), w × h metres. */
  picture(w: number, h: number, x: number, y: number, z: number, ry: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, o: { glow?: boolean; res?: number } = {}) {
    const res = o.res ?? 110;
    const W = Math.min(1024, Math.round(w * res)),
      H = Math.min(1024, Math.round(h * res));
    let a = this.atlases[this.atlases.length - 1];
    let at = a.alloc(W, H);
    if (!at) {
      this.atlases.push((a = new Atlas()));
      at = a.alloc(W, H)!;
    }
    const g = a.g;
    g.save();
    g.beginPath();
    g.rect(at[0], at[1], W, H);
    g.clip();
    g.translate(at[0], at[1]);
    draw(g, W, H);
    g.restore();
    this.quad(o.glow ? a.glowMat : a.picMat, "#ffffff", w, h, x, y, z, ry, a.uv(at[0], at[1], W, H));
  }

  /** A blocking rectangle of the current frame on level f (local x0, z0, x1, z1). */
  solid(f: number, x0: number, z0: number, x1: number, z1: number) {
    const a = this.world(x0, 0, z0),
      b = this.world(x1, 0, z1);
    this.rects[f].push([Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)]);
  }

  // ---- per-level things -------------------------------------------------------------------------

  /** An invisible click target (box) in the current frame on level f. */
  hit(f: number, w: number, h: number, d: number, x: number, y: number, z: number, hover: string, info: PickFn, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.hidden);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    m.applyMatrix4(this.frame);
    (f < 0 ? this.core : this.groups[f]).add(m);
    this.pick(f, m, hover, info);
    return m;
  }

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  /** A real light on level f (world x, z; `dy` above the floor). At most LIGHTS per level. */
  light(f: number, x: number, z: number, color = "#ffe6c8", intensity = 30, dy = 4.6, dist = 22) {
    if (this.lightCount[f] >= LIGHTS) return;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, LEVELS[f].y + dy, z);
    this.groups[f].add(l);
  }

  /** Voxel furniture in the current frame on level f; blocks the walker unless solid is false. */
  put(f: number, key: string, build: () => VoxelModel, x: number, z: number, rot = 0, o: { dy?: number; solid?: boolean; scale?: number } = {}) {
    const holder = new THREE.Group();
    holder.applyMatrix4(this.frame);
    this.groups[f].add(holder);
    const obj = place(holder, key, build, x, o.dy ?? 0, z, rot);
    if (o.scale) obj.scale.setScalar(o.scale);
    if (o.solid !== false) {
      holder.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.max.y - LEVELS[f].y > 0.25) this.rects[f].push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return obj;
  }

  /** A live screen on level f, redrawn every `every` seconds while you are on it. */
  screen(f: number, w: number, h: number, x: number, y: number, z: number, ry: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, every = 3, res = 512) {
    const W = res,
      H = Math.round((res * h) / w);
    const s = makeCanvas(W, H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.applyMatrix4(this.frame);
    let acc = 0;
    const redraw = () => {
      draw(s.g, W, H);
      s.t.needsUpdate = true;
    };
    this.ticks[f].push((dt) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      redraw();
    });
    redraw();
    this.groups[f].add(mesh);
    return mesh;
  }

  /**
   * A zkSNARK on level f at local (x, z) of the current frame: sits, faces, wanders between spots
   * (world x, z), carries shopping bags.
   */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; wander?: [number, number][]; dy?: number; sit?: boolean; bags?: string[]; scale?: number; parent?: THREE.Object3D } = {}) {
    const p = this.world(at[0], o.dy ?? 0, at[1]);
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.copy(p);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      // lifted onto the seat (dy = its height): sit on it; on the floor: onto the seat it is next to
      if (o.sit) {
        if (o.dy) s.sit(true, o.dy);
        else s.perchNear();
      }
      if (o.scale) s.setScale(o.scale);
      if (o.bags) o.bags.forEach((c, i) => s.visual.add(bag(c, i)));
      (o.parent ?? this.groups[f]).add(s.root);
      this.people[f].push(s);
      this.pick(f, s.body, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => ({ eyebrow: role, title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id) }));
      // the mall's floors are too big for the room router: people keep to straight corridor legs
      s.router = STRAIGHT;
      if (o.wander) {
        const w = o.wander;
        const base = p.y;
        let i = w.reduce((b, q, j) => (Math.hypot(q[0] - p.x, q[1] - p.z) < Math.hypot(w[b][0] - p.x, w[b][1] - p.z) ? j : b), 0);
        const dir = Math.random() < 0.5 ? 1 : -1;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 1500 + Math.random() * 5000));
            if (this.current !== f) continue;
            s.faceDir = null;
            i = (i + dir + w.length) % w.length;
            await s.walk([new THREE.Vector3(w[i][0], base, w[i][1])], 0.9 + Math.random() * 0.4);
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /** Every level ends up with the same number of lights: changing level never recompiles a shader. */
  finish() {
    LEVELS.forEach((_, f) => {
      while (this.lightCount[f] < LIGHTS) this.light(f, 0, -20, "#000000", 0);
    });
    for (const p of this.parts.values()) {
      const merged = mergeGeometries(p.geos, false);
      for (const g of p.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, p.mat);
      mesh.matrixAutoUpdate = false;
      mesh.raycast = () => {};
      // glass and signs after the opaque things
      if ((p.mat as THREE.Material).transparent) mesh.renderOrder = 2;
      (p.layer === "core" ? this.core : this.groups[p.layer]).add(mesh);
    }
    this.parts.clear();
    for (const a of this.atlases) a.tex.needsUpdate = true;
  }
}

const STRAIGHT = { routeAll: (_: THREE.Vector3, pts: THREE.Vector3[]) => pts };

function setUV(g: THREE.BufferGeometry, [u0, v0, u1, v1]: [number, number, number, number]) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
}

/** A paper shopping bag in a shopper's hand (part of the cut-out, so it turns with them). */
const bagGeo = new THREE.BoxGeometry(0.26, 0.3, 0.04);
const handleGeo = new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI);
const bagMats = new Map<string, THREE.Material>();
function bag(color: string, i: number) {
  let m = bagMats.get(color);
  if (!m) bagMats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })));
  const g = new THREE.Group();
  const b = new THREE.Mesh(bagGeo, m);
  const h = new THREE.Mesh(handleGeo, m);
  h.position.y = 0.15;
  g.add(b, h);
  g.position.set(i ? -0.42 : 0.5, 0.42, 0.06);
  return g;
}
