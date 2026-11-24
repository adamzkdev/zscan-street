import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MATERIALS } from "../voxel/mesher";
import { palette, VOX, type VoxelModel } from "../voxel/model";
import { groundMat } from "./ground";
import { foliageCards } from "./trees";

/**
 * A voxel model made real (the walk-in places' furniture and fittings, the realistic pass): the
 * cells are gathered into the fewest boxes of one paint (shades of a colour count as one), each box
 * drawn with rounded edges (its corners' normals bent: the light rolls round them) in a photographed
 * material for what it is made of — painted plaster, wood, stone, metal, marble — the paint carried
 * by the vertex colours; glass and lights stay glass and lights; the foliage (blob leaves, the
 * scattered leaves of a potted plant) becomes leaf cards. No cube, no stair of voxels: a sofa is a
 * plinth, cushions and arms with soft edges, a plant a mass of leaves.
 *
 * `meshReal` gives the geometries by material (centred on the footprint, standing on y = 0, like
 * the voxel mesher), `realObject` a group of meshes, `RealBatch` merges many placed copies per
 * material (a floor's worth: a few draw calls).
 */

export type RealKey = "paint" | "wood" | "stone" | "metal" | "marble" | "glass" | "emit";

/** The photographs' own average colour (linear): the vertex colour is the paint over it. */
const AVG: Record<string, [number, number, number]> = {
  paint: [0.62, 0.6, 0.56],
  wood: [0.2, 0.1, 0.045],
  stone: [0.42, 0.4, 0.37],
  metal: [0.3, 0.3, 0.3],
  marble: [0.7, 0.68, 0.65],
};

const mats = new Map<RealKey, THREE.Material>();
export function realMaterial(k: RealKey): THREE.Material {
  let m = mats.get(k);
  if (m) return m;
  if (k === "glass") m = MATERIALS.glass;
  else if (k === "emit") m = MATERIALS.emit;
  else if (k === "wood") m = groundMat({ set: "Wood049", vc: true, tile: 1.1, rough: 0.85, normal: 0.7, anti: 0.15, patches: 0 });
  else if (k === "stone") m = groundMat({ set: "Concrete034", vc: true, tile: 1.4, rough: 1, normal: 0.8, anti: 0.4, patches: 0.15 });
  else if (k === "marble") m = groundMat({ set: "Marble012", vc: true, tile: 1.6, rough: 0.5, normal: 0.4, anti: 0.3, patches: 0 });
  else if (k === "metal") {
    const g = groundMat({ set: "Metal032", vc: true, tile: 0.8, rough: 0.55, normal: 0.4, anti: 0.2, patches: 0 });
    g.metalness = 0.75;
    m = g;
  } else m = groundMat({ set: "Plaster001", vc: true, tile: 2, rough: 0.92, normal: 0.45, anti: 0.3, patches: 0 });
  mats.set(k, m);
  return m;
}

/** A palette entry → what it is made of (the voxel material class: see model.ts `classify`). */
function keyOf(kind: string, mat: number): RealKey | "leaf" {
  if (kind === "glass") return "glass";
  if (kind === "emit") return "emit";
  if (mat === 4) return "wood";
  if (mat === 2) return "stone";
  if (mat === 6) return "metal";
  if (mat === 7) return "marble";
  if (mat === 5) return "leaf";
  return "paint";
}

interface Builder {
  pos: number[];
  nor: number[];
  col: number[];
  idx: number[];
}
const newB = (): Builder => ({ pos: [], nor: [], col: [], idx: [] });

const AX = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * A box with rounded edges: 24 vertices (each face's four corners pulled in by `r`), the faces, the
 * twelve edge strips and the eight corner triangles between them, every vertex with its own face's
 * normal (so an edge shades round from one face to the next).
 */
function bevelBox(b: Builder, lo: [number, number, number], hi: [number, number, number], r: number, c: [number, number, number]) {
  const base = b.pos.length / 3;
  const inner = [
    [lo[0] + r, lo[1] + r, lo[2] + r],
    [hi[0] - r, hi[1] - r, hi[2] - r],
  ];
  const ctr = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  // vertex of face (axis a, side s) at inner corner (bits): index base + (a*2+s)*4 + k
  const fv = new Map<string, number>();
  for (let a = 0; a < 3; a++)
    for (let s = 0; s < 2; s++) {
      let k = 0;
      for (let bits = 0; bits < 8; bits++) {
        if (((bits >> a) & 1) !== s) continue;
        const p = [inner[bits & 1][0], inner[(bits >> 1) & 1][1], inner[(bits >> 2) & 1][2]];
        p[a] += (s ? 1 : -1) * r;
        b.pos.push(p[0], p[1], p[2]);
        const n = AX[a].map((v) => v * (s ? 1 : -1));
        b.nor.push(n[0], n[1], n[2]);
        b.col.push(c[0], c[1], c[2]);
        fv.set(`${a}${s}${bits}`, base + (a * 2 + s) * 4 + k);
        k++;
      }
    }
  const tri = (i0: number, i1: number, i2: number) => {
    // wound outward (from the box's middle)
    const P = b.pos;
    const ax = P[i0 * 3],
      ay = P[i0 * 3 + 1],
      az = P[i0 * 3 + 2];
    const ux = P[i1 * 3] - ax,
      uy = P[i1 * 3 + 1] - ay,
      uz = P[i1 * 3 + 2] - az;
    const vx = P[i2 * 3] - ax,
      vy = P[i2 * 3 + 1] - ay,
      vz = P[i2 * 3 + 2] - az;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const mx = (ax + P[i1 * 3] + P[i2 * 3]) / 3 - ctr[0],
      my = (ay + P[i1 * 3 + 1] + P[i2 * 3 + 1]) / 3 - ctr[1],
      mz = (az + P[i1 * 3 + 2] + P[i2 * 3 + 2]) / 3 - ctr[2];
    if (nx * mx + ny * my + nz * mz < 0) b.idx.push(i0, i2, i1);
    else b.idx.push(i0, i1, i2);
  };
  const quad = (a: number, bb: number, c2: number, d: number) => {
    tri(a, bb, c2);
    tri(a, c2, d);
  };
  // the faces: their corners in a ring
  for (let a = 0; a < 3; a++)
    for (let s = 0; s < 2; s++) {
      const u = (a + 1) % 3,
        v = (a + 2) % 3;
      const id = (bu: number, bv: number) => fv.get(`${a}${s}${(s << a) | (bu << u) | (bv << v)}`)!;
      quad(id(0, 0), id(1, 0), id(1, 1), id(0, 1));
    }
  if (r <= 1e-5) return;
  // the edges: between face (a, sa) and face (c, sc), along the third axis
  for (let a = 0; a < 3; a++)
    for (let cc = a + 1; cc < 3; cc++) {
      const t = 3 - a - cc;
      for (let sa = 0; sa < 2; sa++)
        for (let sc = 0; sc < 2; sc++) {
          const bit = (bt: number) => (sa << a) | (sc << cc) | (bt << t);
          quad(fv.get(`${a}${sa}${bit(0)}`)!, fv.get(`${a}${sa}${bit(1)}`)!, fv.get(`${cc}${sc}${bit(1)}`)!, fv.get(`${cc}${sc}${bit(0)}`)!);
        }
    }
  // the corners
  for (let bits = 0; bits < 8; bits++) tri(fv.get(`0${bits & 1}${bits}`)!, fv.get(`1${(bits >> 1) & 1}${bits}`)!, fv.get(`2${(bits >> 2) & 1}${bits}`)!);
}

export interface RealParts {
  parts: Partial<Record<RealKey, THREE.BufferGeometry>>;
  leaves: THREE.BufferGeometry | null;
}

/** The model's geometry, by material (see the file's head). */
export function meshReal(m: VoxelModel): RealParts {
  const W = m.w,
    H = m.h,
    D = m.d;
  const data = m.data;
  const entries = palette.entries;
  // groups: what it is made of and its paint (shades of one colour together)
  const gid = new Int32Array(W * H * D);
  const groups: { key: RealKey; r: number; g: number; b: number; n: number }[] = [{ key: "paint", r: 0, g: 0, b: 0, n: 0 }];
  const byKey = new Map<string, number>();
  const leafCells: number[] = [];
  const tmp = new THREE.Color();
  const keep = m.realKeep;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (!c) continue;
    if (keep && !keep(i % W, Math.floor(i / (W * D)), Math.floor(i / W) % D)) continue;
    const e = entries[c];
    const k = keyOf(e.kind, e.mat);
    if (k === "leaf" || e.soft) {
      leafCells.push(i);
      continue;
    }
    tmp.copy(e.color).convertLinearToSRGB();
    const q = k === "emit" || k === "glass" ? `${c}` : `${Math.round(tmp.r * 10)},${Math.round(tmp.g * 10)},${Math.round(tmp.b * 10)}`;
    const gk = `${k}|${q}`;
    let g = byKey.get(gk);
    if (g === undefined) {
      g = groups.length;
      groups.push({ key: k, r: 0, g: 0, b: 0, n: 0 });
      byKey.set(gk, g);
    }
    const G = groups[g];
    G.r += e.color.r;
    G.g += e.color.g;
    G.b += e.color.b;
    G.n++;
    gid[i] = g;
  }
  // green that is not foliage (a filled block of it: a green sofa, a painted panel) goes back to paint
  const leaves: number[] = [];
  if (leafCells.length) {
    const isLeaf = new Uint8Array(W * H * D);
    for (const i of leafCells) isLeaf[i] = 1;
    const seen = new Uint8Array(W * H * D);
    const stack: number[] = [];
    for (const i0 of leafCells) {
      if (seen[i0]) continue;
      const comp: number[] = [];
      stack.push(i0);
      seen[i0] = 1;
      let x0 = W,
        x1 = 0,
        y0 = H,
        y1 = 0,
        z0 = D,
        z1 = 0;
      while (stack.length) {
        const i = stack.pop()!;
        comp.push(i);
        const x = i % W,
          z = Math.floor(i / W) % D,
          y = Math.floor(i / (W * D));
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
        for (const [dx, dy, dz] of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            nz = z + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= W || ny >= H || nz >= D) continue;
          const j = nx + W * (nz + D * ny);
          if (isLeaf[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      const vol = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
      const soft = comp.some((i) => entries[data[i]].soft);
      if (soft || comp.length / vol < 0.72 || comp.length < 4) leaves.push(...comp);
      else
        for (const i of comp) {
          const e = entries[data[i]];
          const gk = `paint|leafpaint|${e.color.getHexString()}`;
          let g = byKey.get(gk);
          if (g === undefined) {
            g = groups.length;
            groups.push({ key: "paint", r: 0, g: 0, b: 0, n: 0 });
            byKey.set(gk, g);
          }
          const G = groups[g];
          G.r += e.color.r;
          G.g += e.color.g;
          G.b += e.color.b;
          G.n++;
          gid[i] = g;
        }
    }
  }
  // the boxes: greedy in x, then z, then y
  const builders = new Map<RealKey, Builder>();
  const used = new Uint8Array(W * H * D);
  const at = (x: number, y: number, z: number) => x + W * (z + D * y);
  for (let y = 0; y < H; y++)
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const i = at(x, y, z);
        const g = gid[i];
        if (!g || used[i]) continue;
        let w = 1;
        while (x + w < W && gid[at(x + w, y, z)] === g && !used[at(x + w, y, z)]) w++;
        let d = 1;
        grow: while (z + d < D) {
          for (let k = 0; k < w; k++) {
            const j = at(x + k, y, z + d);
            if (gid[j] !== g || used[j]) break grow;
          }
          d++;
        }
        let h = 1;
        up: while (y + h < H) {
          for (let dz = 0; dz < d; dz++)
            for (let k = 0; k < w; k++) {
              const j = at(x + k, y + h, z + dz);
              if (gid[j] !== g || used[j]) break up;
            }
          h++;
        }
        for (let dy = 0; dy < h; dy++) for (let dz = 0; dz < d; dz++) for (let k = 0; k < w; k++) used[at(x + k, y + dy, z + dz)] = 1;
        const G = groups[g];
        // what it is, by its size too: a small warm-stone box is upholstery or paint, not masonry;
        // a thick dark one is leather or lacquer, not steel (metal is for the thin parts: legs, rails)
        let key = G.key;
        if (key === "stone" && Math.max(w, h, d) * VOX < 1.2) key = "paint";
        if (key === "metal" && Math.min(w, h, d) > 2) key = "paint";
        let b = builders.get(key);
        if (!b) builders.set(key, (b = newB()));
        const lo: [number, number, number] = [(x - W / 2) * VOX, y * VOX, (z - D / 2) * VOX];
        const hi: [number, number, number] = [(x + w - W / 2) * VOX, (y + h) * VOX, (z + d - D / 2) * VOX];
        const minCells = Math.min(w, h, d);
        // (glass and lights stay crisp; a slab one cell thin too — a rug, a tile, a trim: rounded,
        // a pattern of them read as a field of pillows; the rest rounded, more so the bigger)
        const r = key === "glass" || key === "emit" || minCells < 2 ? 0 : Math.min(minCells * VOX * 0.2, 0.06);
        const avg = AVG[key];
        const cr = G.r / G.n,
          cg = G.g / G.n,
          cb = G.b / G.n;
        const col: [number, number, number] = avg ? [Math.min(2.4, cr / avg[0]), Math.min(2.4, cg / avg[1]), Math.min(2.4, cb / avg[2])] : [cr, cg, cb];
        bevelBox(b, lo, hi, r, col);
      }
  const parts: Partial<Record<RealKey, THREE.BufferGeometry>> = {};
  for (const [k, b] of builders) {
    if (!b.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((b.pos.length / 3) * 2), 2));
    geo.setIndex(b.idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    parts[k] = geo;
  }
  // the foliage: blobs of about a cell of 6 voxels, each a few leaf cards
  let leafGeo: THREE.BufferGeometry | null = null;
  if (leaves.length) {
    const cells = new Map<string, { sx: number; sy: number; sz: number; n: number; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }>();
    const C = 6;
    for (const i of leaves) {
      const x = i % W,
        z = Math.floor(i / W) % D,
        y = Math.floor(i / (W * D));
      const key = `${Math.floor(x / C)},${Math.floor(y / C)},${Math.floor(z / C)}`;
      let e = cells.get(key);
      if (!e) cells.set(key, (e = { sx: 0, sy: 0, sz: 0, n: 0, x0: x, x1: x, y0: y, y1: y, z0: z, z1: z }));
      e.sx += x;
      e.sy += y;
      e.sz += z;
      e.n++;
      e.x0 = Math.min(e.x0, x);
      e.x1 = Math.max(e.x1, x);
      e.y0 = Math.min(e.y0, y);
      e.y1 = Math.max(e.y1, y);
      e.z0 = Math.min(e.z0, z);
      e.z1 = Math.max(e.z1, z);
    }
    const blobs: { c: THREE.Vector3; rad: THREE.Vector3; n: number; size: [number, number] }[] = [];
    for (const e of cells.values()) {
      if (e.n < 2) continue;
      const c = new THREE.Vector3((e.sx / e.n + 0.5 - W / 2) * VOX, (e.sy / e.n + 0.5) * VOX, (e.sz / e.n + 0.5 - D / 2) * VOX);
      const rad = new THREE.Vector3(((e.x1 - e.x0 + 1) / 2) * VOX * 0.8, ((e.y1 - e.y0 + 1) / 2) * VOX * 0.8, ((e.z1 - e.z0 + 1) / 2) * VOX * 0.8);
      const s = Math.max(rad.x, rad.y, rad.z);
      blobs.push({ c, rad, n: Math.max(2, Math.min(9, Math.round(e.n / 10))), size: [s * 1.1, s * 1.7] });
    }
    if (blobs.length) leafGeo = foliageCards(blobs, W * 7 + H * 3 + D).geometry;
  }
  return { parts, leaves: leafGeo };
}

/** A group of meshes for a model (the voxel mesher's `toObject`, made real). */
export function realObject(m: VoxelModel, opts: { shadows?: boolean } = {}) {
  const g = realGroup(meshReal(m), opts);
  // (a real stand-in for part of it: a palm for its voxel trunk and fronds)
  if (m.real) g.add(m.real());
  return g;
}

export function realGroup(r: RealParts, opts: { shadows?: boolean } = {}) {
  const g = new THREE.Group();
  for (const k of Object.keys(r.parts) as RealKey[]) {
    const mesh = new THREE.Mesh(r.parts[k]!, realMaterial(k));
    mesh.castShadow = opts.shadows !== false && k !== "emit" && k !== "glass";
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  if (r.leaves) g.add(leafMesh(r.leaves, opts.shadows !== false));
  return g;
}

let leafM: ReturnType<typeof foliageCards> | null = null;
function leafMesh(geo: THREE.BufferGeometry, shadows: boolean) {
  leafM ??= foliageCards([{ c: new THREE.Vector3(), rad: new THREE.Vector3(0.3, 0.3, 0.3), n: 1, size: [0.3, 0.3] }]);
  const l = new THREE.Mesh(geo, leafM.mat);
  l.customDepthMaterial = leafM.depth;
  l.castShadow = shadows;
  l.receiveShadow = true;
  return l;
}

/** Many placed copies of models, merged per material (the kits' `Voxels`, made real). */
export class RealBatch {
  private static cache = new Map<string, RealParts>();
  private parts = new Map<RealKey | "leaf", THREE.BufferGeometry[]>();
  /** A copy of the model at `matrix`; returns its bounds (world). */
  add(key: string, make: () => VoxelModel, matrix: THREE.Matrix4) {
    let r = RealBatch.cache.get(key);
    if (!r) RealBatch.cache.set(key, (r = meshReal(make())));
    const box = new THREE.Box3();
    for (const k of Object.keys(r.parts) as RealKey[]) {
      const g = r.parts[k]!.clone().applyMatrix4(matrix);
      g.computeBoundingBox();
      box.union(g.boundingBox!);
      this.push(k, g);
    }
    if (r.leaves) this.push("leaf", r.leaves.clone().applyMatrix4(matrix));
    return box;
  }
  private push(k: RealKey | "leaf", g: THREE.BufferGeometry) {
    const l = this.parts.get(k);
    if (l) l.push(g);
    else this.parts.set(k, [g]);
  }
  build(parent: THREE.Object3D) {
    for (const [k, list] of this.parts) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geo) continue;
      if (k === "leaf") parent.add(leafMesh(geo, true));
      else {
        const mesh = new THREE.Mesh(geo, realMaterial(k));
        mesh.castShadow = k !== "emit" && k !== "glass";
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    }
    this.parts.clear();
  }
}
