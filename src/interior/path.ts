import * as THREE from "three";
import type { Rect } from "./types";

/**
 * Paths for the people inside: A* on a 0.25 m grid built from a room's walls and furniture (the
 * same rectangles the walker collides with), then pulled tight so they walk in straight lines
 * and turn only at corners. Nobody walks through a shelf or a table.
 */
const CELL = 0.25;

export class Router {
  private x0: number;
  private z0: number;
  private w: number;
  private h: number;
  private blocked: Uint8Array;

  constructor(rects: Rect[], radius = 0.32) {
    const xs = rects.flatMap((r) => [r[0], r[2]]),
      zs = rects.flatMap((r) => [r[1], r[3]]);
    this.x0 = Math.min(...xs) - 1;
    this.z0 = Math.min(...zs) - 1;
    this.w = Math.ceil((Math.max(...xs) + 1 - this.x0) / CELL);
    this.h = Math.ceil((Math.max(...zs) + 1 - this.z0) / CELL);
    this.blocked = new Uint8Array(this.w * this.h);
    for (const [ax, az, bx, bz] of rects) {
      const [x0, x1] = [Math.min(ax, bx) - radius, Math.max(ax, bx) + radius],
        [z0, z1] = [Math.min(az, bz) - radius, Math.max(az, bz) + radius];
      for (let i = Math.max(0, Math.floor((x0 - this.x0) / CELL)); i <= Math.min(this.w - 1, Math.floor((x1 - this.x0) / CELL)); i++)
        for (let j = Math.max(0, Math.floor((z0 - this.z0) / CELL)); j <= Math.min(this.h - 1, Math.floor((z1 - this.z0) / CELL)); j++) this.blocked[j * this.w + i] = 1;
    }
  }

  private cell(p: THREE.Vector3) {
    return [THREE.MathUtils.clamp(Math.floor((p.x - this.x0) / CELL), 0, this.w - 1), THREE.MathUtils.clamp(Math.floor((p.z - this.z0) / CELL), 0, this.h - 1)];
  }
  private free(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i];
  }
  /** The nearest free cell (a target inside furniture, or someone standing against it). */
  private nearestFree(i: number, j: number): [number, number] {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < 12; r++) for (let di = -r; di <= r; di++) for (const dj of [-r, r]) for (const [a, b] of [[i + di, j + dj], [i + dj, j + di]]) if (this.free(a, b)) return [a, b];
    return [i, j];
  }
  /** Straight line between two cells without touching a blocked one. */
  private clear(a: [number, number], b: [number, number]) {
    const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2);
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      if (!this.free(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t))) return false;
    }
    return true;
  }
  private centre(c: [number, number], y: number) {
    return new THREE.Vector3(this.x0 + (c[0] + 0.5) * CELL, y, this.z0 + (c[1] + 0.5) * CELL);
  }

  /** Waypoints from `from` to `to` around everything in the way (the last one is `to` itself). */
  route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const s = this.nearestFree(...(this.cell(from) as [number, number]));
    const g = this.nearestFree(...(this.cell(to) as [number, number]));
    if (this.clear(s, g)) return [to.clone()];
    const W = this.w,
      key = (i: number, j: number) => j * W + i;
    const cost = new Float32Array(W * this.h).fill(Infinity);
    const prev = new Int32Array(W * this.h).fill(-1);
    const open: [number, number, number][] = [[0, s[0], s[1]]];
    cost[key(...s)] = 0;
    const hstar = (i: number, j: number) => Math.hypot(i - g[0], j - g[1]);
    let found = false;
    while (open.length) {
      // a small binary heap would be faster; rooms are a few thousand cells, this is plenty
      let best = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[best][0]) best = k;
      const [, i, j] = open.splice(best, 1)[0];
      if (i === g[0] && j === g[1]) {
        found = true;
        break;
      }
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const a = i + di,
            b = j + dj;
          // no cutting corners between two blocked cells
          if (!this.free(a, b) || (di && dj && (!this.free(i + di, j) || !this.free(i, j + dj)))) continue;
          const c = cost[key(i, j)] + (di && dj ? Math.SQRT2 : 1);
          if (c < cost[key(a, b)]) {
            cost[key(a, b)] = c;
            prev[key(a, b)] = key(i, j);
            open.push([c + hstar(a, b), a, b]);
          }
        }
    }
    if (!found) return [to.clone()];
    const cells: [number, number][] = [];
    for (let k = key(...g); k !== -1; k = prev[k]) cells.push([k % W, Math.floor(k / W)]);
    cells.reverse();
    // pull the string: keep only the corners
    const out: THREE.Vector3[] = [];
    let anchor = cells[0];
    for (let k = 2; k < cells.length; k++)
      if (!this.clear(anchor, cells[k])) {
        anchor = cells[k - 1];
        out.push(this.centre(anchor, to.y));
      }
    out.push(to.clone());
    return out;
  }

  /** A whole walk: each leg routed. */
  routeAll(from: THREE.Vector3, points: THREE.Vector3[]) {
    const out: THREE.Vector3[] = [];
    let at = from;
    for (const p of points) {
      out.push(...this.route(at, p));
      at = p;
    }
    return out;
  }
}
