import type * as THREE from "three";

interface Circle {
  x: number;
  z: number;
  r: number;
}
interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const CELL = 4;

/**
 * Static obstacles on the ground (lamp posts, trees, benches, building footprints) in a coarse
 * grid. Pedestrians are pushed out of them each frame, so nobody walks through a pole or a wall.
 */
export class Nav {
  private grid = new Map<string, { circles: Circle[]; rects: Rect[] }>();

  private cell(cx: number, cz: number) {
    const k = `${cx},${cz}`;
    let c = this.grid.get(k);
    if (!c) this.grid.set(k, (c = { circles: [], rects: [] }));
    return c;
  }

  addCircle(x: number, z: number, r: number) {
    if (r <= 0) return;
    const c = { x, z, r };
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) this.cell(cx, cz).circles.push(c);
  }

  addRect(x0: number, z0: number, x1: number, z1: number) {
    const r = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
    for (let cx = Math.floor(r.x0 / CELL); cx <= Math.floor(r.x1 / CELL); cx++)
      for (let cz = Math.floor(r.z0 / CELL); cz <= Math.floor(r.z1 / CELL); cz++) this.cell(cx, cz).rects.push(r);
  }

  /** Move `p` (x, z) out of any obstacle it overlaps, for a body of radius `rad`. */
  resolve(p: THREE.Vector3, rad: number) {
    const c = this.grid.get(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`);
    if (!c) return;
    for (const o of c.circles) {
      const dx = p.x - o.x,
        dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + rad;
      if (d < min) {
        if (d < 1e-4) {
          p.x += min;
          continue;
        }
        p.x = o.x + (dx / d) * min;
        p.z = o.z + (dz / d) * min;
      }
    }
    for (const o of c.rects) {
      if (p.x < o.x0 - rad || p.x > o.x1 + rad || p.z < o.z0 - rad || p.z > o.z1 + rad) continue;
      // push out through the nearest side
      const out = [o.x0 - rad - p.x, o.x1 + rad - p.x, o.z0 - rad - p.z, o.z1 + rad - p.z];
      const k = out.reduce((best, v, i) => (Math.abs(v) < Math.abs(out[best]) ? i : best), 0);
      if (k < 2) p.x += out[k];
      else p.z += out[k];
    }
  }

  /** Is this spot free for a body of radius `rad`? */
  free(x: number, z: number, rad: number) {
    const c = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!c) return true;
    for (const o of c.circles) if (Math.hypot(x - o.x, z - o.z) < o.r + rad) return false;
    for (const o of c.rects) if (x > o.x0 - rad && x < o.x1 + rad && z > o.z0 - rad && z < o.z1 + rad) return false;
    return true;
  }
}
