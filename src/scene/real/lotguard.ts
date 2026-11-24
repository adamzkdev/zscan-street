import type { BuildingJob } from "../city/plan";
import { VOX } from "../voxel/model";
import type { Built } from "../voxel/buildings";

/**
 * Nothing of a landmark outside its lot (the streets round it are the game's: a pillar, a planter, a roof over
 * the asphalt were in the way). Runs in the city worker on every realistic landmark's geometry, in the
 * builder's frame (metres; the model centred on x and z): a mass wider than its lot on both sides is
 * drawn narrower in proportion, every vertex past the edge is brought back onto it (a face wholly
 * past it lands on it: closed volumes stay closed), trees and props past it are not planted. A landmark that
 * spills more than a little is reported (dev) so its builder can be fixed at the source.
 *
 * The lot in that frame: across, the body's centre ± the lot's width; in depth, from the body's front
 * (where the city puts the job's front line) back by the lot's depth.
 */

interface Geo {
  pos: Float32Array;
  idx: number[] | Uint32Array | Uint16Array;
}

/** Past the lot's front on purpose (metres): the port's crane booms out over the river, never a street. */
const FRONT_OK: Record<string, number> = { port: 9 };

export interface LotRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function lotRect(kind: string, j: BuildingJob, b: Built): LotRect | null {
  const o = j.opts as { w?: number; d?: number };
  if (!o.w || !o.d) return null;
  const m = b.model;
  const u = (b.scale ?? 1) * VOX;
  const [bx0, , bx1, bz1] = b.body;
  const xc = ((bx0 + bx1) / 2 - m.w / 2) * u;
  const zf = (bz1 - m.d / 2) * u;
  return { x0: xc - o.w / 2, x1: xc + o.w / 2, z0: zf - o.d, z1: zf + (FRONT_OK[kind] ?? 0) };
}

/** Keep `geos` (and the trees and props) inside the lot; returns how far it spilled at worst (m). */
export function keepInLot<T extends { trees?: unknown[]; props?: unknown[] }>(kind: string, j: BuildingJob, b: Built, geosIn: object, extras?: T): number {
  const geos = geosIn as Partial<Record<string, Geo>>;
  const L = lotRect(kind, j, b);
  if (!L) return 0;
  const M = 0.05;
  let worst = 0;
  // wider than its lot on both sides (a tower's mass, a twist that swings out): drawn narrower,
  // in proportion, about the lot's middle — a tower clipped at its sides would read as cut
  {
    let gx0 = Infinity,
      gx1 = -Infinity,
      gz0 = Infinity,
      gz1 = -Infinity;
    for (const g of Object.values(geos)) {
      if (!g) continue;
      for (let i = 0; i < g.pos.length; i += 3) {
        gx0 = Math.min(gx0, g.pos[i]);
        gx1 = Math.max(gx1, g.pos[i]);
        gz0 = Math.min(gz0, g.pos[i + 2]);
        gz1 = Math.max(gz1, g.pos[i + 2]);
      }
    }
    const both = (a0: number, a1: number, l0: number, l1: number) => a0 < l0 - 0.3 && a1 > l1 + 0.3;
    const cx = (L.x0 + L.x1) / 2,
      cz = (L.z0 + L.z1) / 2;
    const sx = both(gx0, gx1, L.x0, L.x1) ? Math.min((cx - L.x0) / (cx - gx0), (L.x1 - cx) / (gx1 - cx)) : 1;
    const sz = both(gz0, gz1, L.z0, L.z1) ? Math.min((cz - L.z0) / (cz - gz0), (L.z1 - cz) / (gz1 - cz)) : 1;
    if (sx < 1 || sz < 1) {
      worst = Math.max(worst, L.x0 - gx0, gx1 - L.x1, L.z0 - gz0, gz1 - L.z1);
      for (const g of Object.values(geos)) {
        if (!g) continue;
        for (let i = 0; i < g.pos.length; i += 3) {
          g.pos[i] = cx + (g.pos[i] - cx) * sx;
          g.pos[i + 2] = cz + (g.pos[i + 2] - cz) * sz;
        }
      }
      if (extras?.trees) for (const t of extras.trees as [number, number, number][]) ((t[0] = cx + (t[0] - cx) * sx), (t[2] = cz + (t[2] - cz) * sz));
      if (extras?.props) for (const q of extras.props as [string, number, number, number][]) ((q[1] = cx + (q[1] - cx) * sx), (q[3] = cz + (q[3] - cz) * sz));
    }
  }
  const scaled = worst;
  for (const g of Object.values(geos)) {
    if (!g) continue;
    const p = g.pos;
    const n = p.length / 3;
    // each vertex: which side of the lot it is past (bits: 1 −x, 2 +x, 4 −z, 8 +z)
    const side = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = p[i * 3],
        z = p[i * 3 + 2];
      let s = 0;
      if (x < L.x0 - M) s |= 1;
      if (x > L.x1 + M) s |= 2;
      if (z < L.z0 - M) s |= 4;
      if (z > L.z1 + M) s |= 8;
      side[i] = s;
      if (s) worst = Math.max(worst, L.x0 - x, x - L.x1, L.z0 - z, z - L.z1);
    }
    if (worst <= scaled && !side.some((v) => v)) continue;
    // brought back onto the edge (none dropped: a box's face past the edge lands on it, so the box
    // stays closed — dropping it opened the ZK Orchard's podium to the street)
    for (let i = 0; i < n; i++) {
      if (!side[i]) continue;
      p[i * 3] = Math.min(L.x1, Math.max(L.x0, p[i * 3]));
      p[i * 3 + 2] = Math.min(L.z1, Math.max(L.z0, p[i * 3 + 2]));
    }
  }
  if (extras) {
    const inside = (x: number, z: number) => x >= L.x0 && x <= L.x1 && z >= L.z0 && z <= L.z1;
    if (extras.trees) extras.trees = (extras.trees as [number, number, number][]).filter((t) => inside(t[0], t[2]));
    if (extras.props) extras.props = (extras.props as [string, number, number, number][]).filter((q) => inside(q[1], q[3]));
  }
  return worst;
}

