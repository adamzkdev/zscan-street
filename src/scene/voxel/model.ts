import * as THREE from "three";

/** World size of one voxel: six voxels per metre. */
export const VOX = 1 / 6;

export type Kind = "solid" | "glass" | "emit";

/**
 * What a solid voxel is made of, guessed once from its colour (see `classify`): the shader gives
 * each its own grain, gloss and relief (brick courses, stone joints, wood planks, leaves…).
 * 0 plain paint · 1 brick / terracotta · 2 stone / stucco · 3 concrete · 4 wood · 5 foliage ·
 * 6 dark metal / rubber · 7 white marble / enamel.
 */
export type Mat = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const MAT = { paint: 0, brick: 1, stone: 2, concrete: 3, wood: 4, leaf: 5, metal: 6, marble: 7 } as const;

const _hsl = { h: 0, s: 0, l: 0 };
export function classify(color: THREE.Color): Mat {
  color.getHSL(_hsl, THREE.SRGBColorSpace);
  const h = _hsl.h * 360,
    s = _hsl.s,
    l = _hsl.l;
  // natural greens (leaves, needles, lawn); bright or saturated green paint stays paint
  if (h >= 75 && h <= 165 && s > 0.2 && s < 0.7 && l > 0.1 && l < 0.5) return 5;
  if (l < 0.15) return 6;
  if (s < 0.12 && l > 0.8) return 7;
  if (s < 0.2) return 3;
  if ((h <= 18 || h >= 345) && s > 0.35 && l > 0.2 && l < 0.62) return 1;
  if (h > 18 && h <= 48 && s > 0.25 && l >= 0.1 && l < 0.42) return 4;
  if (h > 15 && h <= 60 && l >= 0.5 && l < 0.92) return 2;
  return 0;
}

interface Entry {
  color: THREE.Color;
  kind: Kind;
  mat: Mat;
}

/**
 * The shared palette. Index 0 is empty. A colour is registered once and referenced by index, so
 * models stay small (one byte per cell) and the mesher can merge faces of the same colour.
 */
class Palette {
  readonly entries: Entry[] = [{ color: new THREE.Color(0, 0, 0), kind: "solid", mat: 0 }];
  private index = new Map<string, number>();

  private leaves = new Map<number, number>();
  /** The same colour as foliage (a solid entry of material class 5). */
  leaf(id: number): number {
    const e = this.entries[id];
    if (!id || !e || e.kind !== "solid" || e.mat === 5) return id;
    let l = this.leaves.get(id);
    if (l === undefined) {
      l = this.get("#" + e.color.getHexString(), "solid", 1, 5);
      this.leaves.set(id, l);
    }
    return l;
  }

  get(hex: string, kind: Kind = "solid", strength = 1, mat?: Mat): number {
    const key = `${hex}|${kind}|${strength}|${mat ?? ""}`;
    let i = this.index.get(key);
    if (i === undefined) {
      if (this.entries.length >= 4095) throw new Error("voxel palette full");
      const color = new THREE.Color(hex);
      if (kind === "emit") color.multiplyScalar(strength);
      i = this.entries.length;
      this.entries.push({ color, kind, mat: kind === "solid" ? (mat ?? classify(color)) : 0 });
      this.index.set(key, i);
    }
    return i;
  }
}
export const palette = new Palette();

/** Solid colour (its material guessed from the colour). */
export const C = (hex: string) => palette.get(hex);
/** Solid colour of a given material (cars, signs: paint, whatever the colour says). */
export const CM = (hex: string, mat: Mat) => palette.get(hex, "solid", 1, mat);
/** Window glass (reflective). */
export const G = (hex: string) => palette.get(hex, "glass");
/** Light source: HDR so it blooms. */
export const E = (hex: string, strength = 2) => palette.get(hex, "emit", strength);

/** Deterministic hash noise in [0,1). */
export function hash(x: number, y: number, z: number, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rand(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Paint = number | ((x: number, y: number, z: number) => number);

/** A dense voxel grid with drawing operations. y is up; the front of a building faces +z. */
export class VoxelModel {
  readonly data: Uint16Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly d: number,
  ) {
    this.data = new Uint16Array(w * h * d);
  }

  private i(x: number, y: number, z: number) {
    return x + this.w * (z + this.d * y);
  }

  inside(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d;
  }

  get(x: number, y: number, z: number) {
    return this.inside(x, y, z) ? this.data[this.i(x, y, z)] : 0;
  }

  set(x: number, y: number, z: number, c: Paint) {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    if (!this.inside(x, y, z)) return;
    this.data[this.i(x, y, z)] = typeof c === "number" ? c : c(x, y, z);
  }

  /** Fill the box [x0,x1) × [y0,y1) × [z0,z1). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Paint) {
    [x0, y0, z0, x1, y1, z1] = [x0, y0, z0, x1, y1, z1].map(Math.round);
    const ax = Math.max(0, Math.min(x0, x1)),
      bx = Math.min(this.w, Math.max(x0, x1));
    const ay = Math.max(0, Math.min(y0, y1)),
      by = Math.min(this.h, Math.max(y0, y1));
    const az = Math.max(0, Math.min(z0, z1)),
      bz = Math.min(this.d, Math.max(z0, z1));
    for (let y = ay; y < by; y++)
      for (let z = az; z < bz; z++)
        for (let x = ax; x < bx; x++) this.data[this.i(x, y, z)] = typeof c === "number" ? c : c(x, y, z);
  }

  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.box(x0, y0, z0, x1, y1, z1, 0);
  }

  /** Only paint cells that are already filled. */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Paint) {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++)
      for (let z = Math.max(0, z0); z < Math.min(this.d, z1); z++)
        for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++) {
          const k = this.i(x, y, z);
          if (this.data[k]) this.data[k] = typeof c === "number" ? c : c(x, y, z);
        }
  }

  /** Vertical cylinder centred on (cx, cz). */
  cylinder(cx: number, y0: number, cz: number, r: number, h: number, c: Paint, hollow = false) {
    for (let y = y0; y < y0 + h; y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dd = (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2;
          if (dd <= r * r && (!hollow || dd >= (r - 1.2) ** 2)) this.set(x, y, z, c);
        }
  }

  /** Blobby sphere, for tree canopies and bushes. */
  blob(cx: number, cy: number, cz: number, r: number, c: Paint, rough = 0.25, seed = 1) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dd = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 * 1.15 + (z + 0.5 - cz) ** 2);
          // what a blob paints is foliage (canopies, bushes, blossom): meshed smooth
          if (dd <= r * (1 - rough * hash(x, y, z, seed))) this.set(x, y, z, palette.leaf(typeof c === "number" ? c : c(x, y, z)));
        }
  }

  /** The bottom `h` layers as a new model: a building cut down to its ground floor. */
  slice(h: number) {
    const s = new VoxelModel(this.w, Math.min(h, this.h), this.d);
    s.data.set(this.data.subarray(0, this.w * this.d * s.h));
    return s;
  }

  /** Copy another model in at (ox, oy, oz), optionally turned by quarter turns around y. */
  stamp(m: VoxelModel, ox: number, oy: number, oz: number, turns = 0) {
    const t = ((turns % 4) + 4) % 4;
    for (let y = 0; y < m.h; y++)
      for (let z = 0; z < m.d; z++)
        for (let x = 0; x < m.w; x++) {
          const c = m.data[x + m.w * (z + m.d * y)];
          if (!c) continue;
          let tx = x,
            tz = z;
          if (t === 1) [tx, tz] = [m.d - 1 - z, x];
          else if (t === 2) [tx, tz] = [m.w - 1 - x, m.d - 1 - z];
          else if (t === 3) [tx, tz] = [z, m.w - 1 - x];
          this.set(ox + tx, oy + y, oz + tz, c);
        }
  }
}

/** Smooth value noise in [0,1) on a lattice of `cell` voxels. */
function soft(x: number, y: number, z: number, cell: number, seed: number) {
  const fx = x / cell,
    fy = y / cell,
    fz = z / cell;
  const ix = Math.floor(fx),
    iy = Math.floor(fy),
    iz = Math.floor(fz);
  const s = (t: number) => t * t * (3 - 2 * t);
  const ux = s(fx - ix),
    uy = s(fy - iy),
    uz = s(fz - iz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz, seed);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), ux), l(h(0, 1, 0), h(1, 1, 0), ux), uy), l(l(h(0, 0, 1), h(1, 0, 1), ux), l(h(0, 1, 1), h(1, 1, 1), ux), uy), uz);
}

/**
 * Two or three close shades, spread in soft patches a metre or two across (weathered stone,
 * sun-faded paint, a lawn), not voxel by voxel: a per-voxel pick read as a checkerboard of
 * pixels. The shader adds the fine grain (see surface.ts).
 */
export function shades(hexes: string[], scale = 1, seed = 0): Paint {
  const ids = hexes.map((h) => C(h));
  const cell = 9 * scale;
  return (x, y, z) => ids[Math.min(ids.length - 1, Math.floor(soft(x, y, z, cell, seed) * ids.length))];
}

/**
 * Half-resolution copy of a model, for buildings seen from afar: each 2×2×2 cell becomes one
 * voxel of its most common colour (lit windows win, so the city still glows at night). Meshed at
 * double scale, it lines up with the full model.
 */
export function half(m: VoxelModel) {
  const w = Math.ceil(m.w / 2),
    h = Math.ceil(m.h / 2),
    d = Math.ceil(m.d / 2);
  const o = new VoxelModel(w, h, d);
  const count = new Map<number, number>();
  for (let y = 0; y < h; y++)
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        count.clear();
        let filled = 0,
          emit = 0;
        for (let k = 0; k < 8; k++) {
          const c = m.get(x * 2 + (k & 1), y * 2 + ((k >> 1) & 1), z * 2 + ((k >> 2) & 1));
          if (!c) continue;
          filled++;
          if (palette.entries[c].kind === "emit") emit = c;
          count.set(c, (count.get(c) ?? 0) + 1);
        }
        if (filled < 2 && !emit) continue;
        let best = 0,
          n = 0;
        for (const [c, k] of count) if (k > n) (best = c), (n = k);
        o.set(x, y, z, emit || best);
      }
  return o;
}
