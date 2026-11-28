import type { Crossing } from "./types";

/**
 * A crossing's course, in numbers: its centre line sampled every half metre (corners rounded), the
 * road's height along it (the profile, eased), and the answers the game needs at any (x, z) — how
 * far along, how far off the centre line, the deck's height there, whether a car or a body is held
 * on it. Pure: the scene, the game and the maps share it.
 */

const STEP = 0.5;
/** The lookup's cell (m). */
const CELL = 8;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** A ramp's share (0…1) `u` metres along `len`: eased in over `e0` metres and out over `e1`, a straight grade between. */
function ramp(u: number, len: number, e0: number, e1: number) {
  if (u <= 0) return 0;
  if (u >= len) return 1;
  const k = Math.min(1, (len * 0.98) / (e0 + e1));
  e0 *= k;
  e1 *= k;
  const m = 1 / (len - (e0 + e1) / 2);
  if (u < e0) return (m * u * u) / (2 * e0);
  if (u > len - e1) return 1 - (m * (len - u) * (len - u)) / (2 * e1);
  return (m * e0) / 2 + m * (u - e0);
}

export interface Sample {
  x: number;
  z: number;
  /** The way along (unit). */
  tx: number;
  tz: number;
  s: number;
}

export class Course {
  readonly pts: Sample[] = [];
  readonly length: number;
  /** Sample indices by cell. */
  private grid = new Map<number, number[]>();
  readonly box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };

  constructor(readonly c: Crossing) {
    // straight runs with quarter-circle corners of the crossing's radius
    const raw: [number, number][] = [];
    const P = c.path;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (i === 0 || i === P.length - 1) {
        raw.push(p);
        continue;
      }
      const a = P[i - 1],
        b = P[i + 1];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]),
        lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ux = (p[0] - a[0]) / la,
        uz = (p[1] - a[1]) / la,
        vx = (b[0] - p[0]) / lb,
        vz = (b[1] - p[1]) / lb;
      const k = Math.min(c.radius, la / 2, lb / 2);
      const s0: [number, number] = [p[0] - ux * k, p[1] - uz * k],
        s1: [number, number] = [p[0] + vx * k, p[1] + vz * k];
      for (let n = 0; n <= 16; n++) {
        const t = n / 16;
        raw.push([(1 - t) * (1 - t) * s0[0] + 2 * (1 - t) * t * p[0] + t * t * s1[0], (1 - t) * (1 - t) * s0[1] + 2 * (1 - t) * t * p[1] + t * t * s1[1]]);
      }
    }
    for (let i = raw.length - 1; i > 0; i--) if (Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]) < 0.01) raw.splice(i, 1);
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const total = cum[cum.length - 1];
    let seg = 1;
    for (let d = 0; d <= total + 1e-6; d += STEP) {
      while (seg < raw.length - 1 && cum[seg] < d) seg++;
      const [ax, az] = raw[seg - 1],
        [bx, bz] = raw[seg];
      const L = Math.max(1e-6, cum[seg] - cum[seg - 1]);
      const t = clamp01((d - cum[seg - 1]) / L);
      this.pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L, s: d });
    }
    this.length = this.pts[this.pts.length - 1].s;
    const reach = c.section.edge + 4;
    this.pts.forEach((p, i) => {
      this.box.x0 = Math.min(this.box.x0, p.x - reach);
      this.box.x1 = Math.max(this.box.x1, p.x + reach);
      this.box.z0 = Math.min(this.box.z0, p.z - reach);
      this.box.z1 = Math.max(this.box.z1, p.z + reach);
      // each sample listed in every cell its reach touches
      for (let gx = Math.floor((p.x - reach) / CELL); gx <= Math.floor((p.x + reach) / CELL); gx++)
        for (let gz = Math.floor((p.z - reach) / CELL); gz <= Math.floor((p.z + reach) / CELL); gz++) {
          const k = key(gx, gz);
          const l = this.grid.get(k);
          if (l) l.push(i);
          else this.grid.set(k, [i]);
        }
    });
  }

  /** The road's height at s (the profile, eased between its key points). */
  y(s: number): number {
    const P = this.c.profile;
    if (s <= P[0][0]) return P[0][1];
    for (let i = 0; i + 1 < P.length; i++) {
      const [s0, y0, e0 = this.c.ease] = P[i],
        [s1, y1, e1 = this.c.ease] = P[i + 1];
      if (s <= s1) return y0 + (y1 - y0) * ramp(s - s0, s1 - s0, e0, e1);
    }
    return P[P.length - 1][1];
  }

  /** The centre line at s (interpolated). */
  at(s: number): Sample {
    const f = Math.max(0, Math.min(this.pts.length - 1, s / STEP));
    const i = Math.min(this.pts.length - 2, Math.floor(f));
    const t = f - i;
    const a = this.pts[i],
      b = this.pts[i + 1];
    const tx = a.tx + (b.tx - a.tx) * t,
      tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(tx, tz) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: tx / l, tz: tz / l, s };
  }

  /** A point `off` metres right of the centre line at s (right of the way along: +x when heading −z… the normal (−tz, tx) turned). */
  point(s: number, off: number, dy = 0): [number, number, number] {
    const p = this.at(s);
    return [p.x - p.tz * off, this.y(s) + dy, p.z + p.tx * off];
  }

  /** How far along and how far off the centre line (x, z) is (signed: + right of the way along), or null if off the course. */
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
    if (best < 0) return null;
    const p = this.pts[best];
    const dx = x - p.x,
      dz = z - p.z;
    // along the tangent from the nearest sample, and across it
    const along = dx * p.tx + dz * p.tz;
    const off = -dx * p.tz + dz * p.tx;
    // (past either end: not on it)
    const s = p.s + along;
    if (s < -0.5 || s > this.length + 0.5) return null;
    return { s: Math.max(0, Math.min(this.length, s)), off };
  }
}

const key = (gx: number, gz: number) => (gx + 4096) * 8192 + (gz + 4096);
