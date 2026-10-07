import * as THREE from "three";
import { toObject } from "../../scene/voxel/mesher";
import { C, hash, type VoxelModel } from "../../scene/voxel/model";
import type { Rect } from "../types";

/**
 * The Colosseum's shared measures (metres). The arena is an ellipse, long axis along z (you come in
 * through the Porta Triumphalis at its +z end); everything round it is laid out by `d`, the radial
 * distance out from the arena's edge.
 */
export const AX = 10,
  AZ = 16;
/** Podium top: the terrace of the senators and the emperor's box (floor 2). */
export const POD = 3.6;
/** Hypogeum floor. */
export const HYPO = -6;
/** Bowl voxels: four a metre. */
export const VS = 0.25;
/** The Porta Triumphalis tunnel: half width, height. */
export const GATE_W = 1.6,
  GATE_H = 3.2;

/** Radius of an ellipse in the direction (c, s). */
export const radius = (c: number, s: number, a: number, b: number) => 1 / Math.sqrt((c / a) ** 2 + (s / b) ** 2);
/** Distance out from the arena edge, radially. */
export function dOf(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r < 1e-6) return -AX;
  return r - radius(x / r, z / r, AX, AZ);
}
/** The point `d` metres out from the arena edge at polar angle `ph`. */
export function at(ph: number, d: number) {
  const c = Math.cos(ph),
    s = Math.sin(ph);
  const r = radius(c, s, AX, AZ) + d;
  return { x: c * r, z: s * r };
}

export interface Row {
  d0: number;
  d1: number;
  /** Seat (or walkway) top. */
  y: number;
  mae: number;
  walk: boolean;
}
/** The cavea: three maeniana of seat rows, a walkway with its balteus wall before the upper two. */
export const ROWS: Row[] = (() => {
  const rows: Row[] = [];
  let d = 3.6,
    y = POD;
  for (let mae = 0; mae < 3; mae++) {
    if (mae > 0) {
      rows.push({ d0: d, d1: d + 1.3, y: y + 0.5, mae, walk: true });
      d += 1.3;
      y += 1.5; // the balteus wall: the next tier starts a metre above the walkway
    }
    for (let i = 0; i < 5; i++) {
      y += 0.5;
      rows.push({ d0: d, d1: d + 0.75, y, mae, walk: false });
      d += 0.75;
    }
  }
  return rows;
})();
export const D_TOP = ROWS[ROWS.length - 1].d1;
export const Y_TOP = ROWS[ROWS.length - 1].y;
/** The top portico and the attic wall behind it. */
export const D_WALL = D_TOP + 2.6,
  D_OUT = D_WALL + 0.8,
  Y_ATTIC = 19;

/** Colliders along an ellipse offset `d`, small overlapping squares; `skip` leaves gaps. */
export function ring(d: number, size = 0.7, skip?: (x: number, z: number) => boolean): Rect[] {
  const out: Rect[] = [];
  const n = Math.ceil((2 * Math.PI * Math.hypot(AX + d, AZ + d)) / Math.SQRT2 / (size * 0.7));
  for (let i = 0; i < n; i++) {
    const p = at((i / n) * Math.PI * 2, d);
    if (skip?.(p.x, p.z)) continue;
    out.push([p.x - size / 2, p.z - size / 2, p.x + size / 2, p.z + size / 2]);
  }
  return out;
}

/** A voxel model drawn at `VS` metres a voxel, its cell (0, 0, 0) corner at (x0, y0, z0). */
export function meshAt(m: VoxelModel, x0: number, y0: number, z0: number, vs = VS) {
  const o = toObject(m, { shadows: false });
  const k = vs * 6;
  o.scale.setScalar(k);
  // the mesher centres the model on x and z
  o.position.set(x0 + (m.w * vs) / 2, y0, z0 + (m.d * vs) / 2);
  return o;
}

export type Fn = (x: number, y: number, z: number) => number;
/** Coarse colour patches (the greedy mesher keeps big faces). */
export const patch = (hexes: string[], sx: number, sy: number, seed: number): Fn => {
  const ids = hexes.map((h) => C(h));
  return (x, y, z) => ids[Math.floor(hash(Math.floor(x / sx), Math.floor(y / sy), Math.floor(z / sx), seed) * ids.length)];
};
export const one = (hex: string): Fn => {
  const c = C(hex);
  return () => c;
};

/** A canvas texture. */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, pixel = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
  } else t.anisotropy = 8;
  return { c, g, t };
}

export const SHIELDED_KINDS = new Set(["shielded", "migration", "shielding"]);
