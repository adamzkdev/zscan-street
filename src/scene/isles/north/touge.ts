/**
 * A mountain road's course in numbers (pure: the relief, the game and the scene share it): a line of
 * points (the switchbacks: arcs round the mountain joined by hairpins), sampled every metre, its
 * height eased along it (a long moving average of the ground under it, so the hairpins' climb is
 * spread over the legs either side), and the answers the wheels need — how far along, how far off.
 */

const CELL = 10;
const key = (gx: number, gz: number) => (gx + 4096) * 8192 + (gz + 4096);

export interface TougeSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  s: number;
  y: number;
}

export class TougeCourse {
  readonly pts: TougeSample[] = [];
  readonly length: number;
  private grid = new Map<number, number[]>();
  readonly box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };

  /**
   * `line`: the road's points (densely enough: they are joined straight), `ground` the natural ground
   * under them, `reach` how far off the centre line a point still belongs to the road (its cuttings).
   */
  constructor(line: [number, number][], ground: (x: number, z: number) => number, readonly reach: number, smooth = 70) {
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    const total = cum[cum.length - 1];
    let seg = 1;
    for (let d = 0; d <= total + 1e-6; d += 1) {
      while (seg < line.length - 1 && cum[seg] < d) seg++;
      const [ax, az] = line[seg - 1],
        [bx, bz] = line[seg];
      const L = Math.max(1e-6, cum[seg] - cum[seg - 1]);
      const t = Math.min(1, Math.max(0, (d - cum[seg - 1]) / L));
      this.pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L, s: d, y: 0 });
    }
    this.length = this.pts[this.pts.length - 1].s;
    // the tangents smoothed (a corner of the polyline eased over a few metres)
    const n = this.pts.length;
    const tx = this.pts.map((p) => p.tx),
      tz = this.pts.map((p) => p.tz);
    for (let i = 0; i < n; i++) {
      let sx = 0,
        sz = 0;
      for (let k = -3; k <= 3; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        sx += tx[j];
        sz += tz[j];
      }
      const l = Math.hypot(sx, sz) || 1;
      this.pts[i].tx = sx / l;
      this.pts[i].tz = sz / l;
    }
    // the height: the ground under the line, averaged over `smooth` metres either side (twice), the ends held
    const raw = this.pts.map((p) => ground(p.x, p.z));
    let ys = raw.slice();
    for (let pass = 0; pass < 2; pass++) {
      const pre = [0];
      for (let i = 0; i < n; i++) pre.push(pre[i] + ys[i]);
      const out = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        const w = Math.min(smooth, i, n - 1 - i);
        out[i] = (pre[i + w + 1] - pre[i - w]) / (2 * w + 1);
      }
      ys = out;
    }
    this.pts.forEach((p, i) => (p.y = ys[i]));
    this.pts.forEach((p, i) => {
      this.box.x0 = Math.min(this.box.x0, p.x - reach);
      this.box.x1 = Math.max(this.box.x1, p.x + reach);
      this.box.z0 = Math.min(this.box.z0, p.z - reach);
      this.box.z1 = Math.max(this.box.z1, p.z + reach);
      for (let gx = Math.floor((p.x - reach) / CELL); gx <= Math.floor((p.x + reach) / CELL); gx++)
        for (let gz = Math.floor((p.z - reach) / CELL); gz <= Math.floor((p.z + reach) / CELL); gz++) {
          const k = key(gx, gz);
          const l = this.grid.get(k);
          if (l) l.push(i);
          else this.grid.set(k, [i]);
        }
    });
  }

  /** The road's height at s. */
  y(s: number) {
    const f = Math.max(0, Math.min(this.pts.length - 1, s));
    const i = Math.min(this.pts.length - 2, Math.floor(f));
    const t = f - i;
    return this.pts[i].y + (this.pts[i + 1].y - this.pts[i].y) * t;
  }

  /** The centre line at s. */
  at(s: number): TougeSample {
    const f = Math.max(0, Math.min(this.pts.length - 1, s));
    const i = Math.min(this.pts.length - 2, Math.floor(f));
    const t = f - i;
    const a = this.pts[i],
      b = this.pts[i + 1];
    const tx = a.tx + (b.tx - a.tx) * t,
      tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(tx, tz) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: tx / l, tz: tz / l, s, y: a.y + (b.y - a.y) * t };
  }

  /** A point `off` metres right of the centre line at s, `dy` over the road. */
  point(s: number, off: number, dy = 0): [number, number, number] {
    const p = this.at(s);
    return [p.x - p.tz * off, p.y + dy, p.z + p.tx * off];
  }

  /** How far along and how far off (signed, + right) the nearest stretch of road is, within `reach`; or null. */
  project(x: number, z: number): { s: number; off: number } | null {
    if (x < this.box.x0 || x > this.box.x1 || z < this.box.z0 || z > this.box.z1) return null;
    const list = this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best = -1,
      bd = Infinity;
    for (const i of list) {
      const p = this.pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) (bd = d), (best = i);
    }
    if (best < 0 || bd > this.reach * this.reach * 1.2) return null;
    const p = this.pts[best];
    const dx = x - p.x,
      dz = z - p.z;
    const s = p.s + dx * p.tx + dz * p.tz;
    if (s < -0.5 || s > this.length + 0.5) return null;
    return { s: Math.max(0, Math.min(this.length, s)), off: -dx * p.tz + dz * p.tx };
  }
}

/**
 * Switchbacks up a mountain centred at (cx, cz): from `start`, legs round it at the radii `radii`
 * (each an arc from one bearing to the other), joined by hairpins (half circles turning inward).
 * Bearings in radians from +z (south) toward +x (east).
 */
export function switchbacks(cx: number, cz: number, start: [number, number], radii: number[], from: number, to: number, step = 4): [number, number][] {
  const P = (r: number, b: number): [number, number] => [cx + r * Math.sin(b), cz + r * Math.cos(b)];
  const out: [number, number][] = [start];
  let dir = 1;
  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    const [b0, b1] = dir > 0 ? [from, to] : [to, from];
    // the leg: an arc at r from b0 to b1 (its first point eased from where the last ended)
    const n = Math.max(2, Math.ceil((Math.abs(b1 - b0) * r) / step));
    for (let k = 0; k <= n; k++) out.push(P(r, b0 + ((b1 - b0) * k) / n));
    // the hairpin: a half circle inward to the next leg's radius, round the end's bearing
    if (i + 1 < radii.length) {
      const r2 = radii[i + 1];
      const rh = (r - r2) / 2;
      const [mx, mz] = P(r - rh, b1);
      // (the way along at the end of the leg, and outward)
      const ox = Math.sin(b1),
        oz = Math.cos(b1);
      const ax = Math.cos(b1) * dir,
        az = -Math.sin(b1) * dir;
      const m = Math.max(6, Math.ceil((Math.PI * rh) / step));
      for (let k = 1; k < m; k++) {
        const a = (Math.PI * k) / m;
        // from outward (+o) through ahead (+a) to inward (−o)
        out.push([mx + rh * (Math.cos(a) * ox + Math.sin(a) * ax), mz + rh * (Math.cos(a) * oz + Math.sin(a) * az)]);
      }
    }
    dir = -dir;
  }
  return out;
}
