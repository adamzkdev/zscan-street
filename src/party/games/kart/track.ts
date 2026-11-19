/**
 * SNARK KART's circuits as data. A track is a closed spline through its control points, sampled every
 * half metre: each sample knows its position, heading, height (hills, bridges, the jump's kicker), the
 * barriers' distance (by the kind of ground), the gap over a canal, a tunnel's roof, a deck over the
 * lower road where the circuit crosses itself, kerbs in the bends and a minimum-curvature racing line.
 *
 * A shortcut is a straight of its own from one control point to another (the City's plank over the
 * lake, the NU7 Grand Prix's lane over the frozen canal, Marina Bay's shophouse alley): a kart on it rides its own
 * coordinates, mapped onto the road's progress; off its sides it falls in the water (or hits a wall).
 * Patches (ice, puddles) and holes in the ice change the ground under a kart.
 */
import * as THREE from "three";
import { clamp } from "../../kit";
import { GEO, turn } from "../../k3";

export const STEP = 0.5;
/** The water's level (m). */
export const WATER = -0.8;

/** The kinds of ground along the road. */
export const Z_OPEN = 0,
  Z_CITY = 1,
  Z_BRIDGE = 2,
  Z_TUNNEL = 3,
  Z_SHORT = 4;

export type PatchKind = "ice" | "puddle" | "hole";

/** A spot on a track: control point `cp`, `m` metres on from it. */
export type At = [cp: number, m: number];

export interface TrackSpec {
  /** The circuit (x, z; metres), in the way it is driven, from the start line. */
  ctrl: [number, number][];
  /** The road's half width (m). */
  half: number;
  laps: number;
  /** Control-point ranges [a, b) of town (walls close to the road). */
  city?: [number, number][];
  /** The barriers' distance from the middle in each kind of ground (open, city, bridge, tunnel, shortcut). */
  edges: number[];
  /** Hills and bridges: up over `up` metres to the flat top (`flat` long, centred on the spot), down over `down`. */
  hills?: { at: At; up: number; flat: number; down: number; h: number }[];
  /** The jump: its lip at `at`, the kicker `len` long and `h` high, a canal `gap` wide after it (0: none). */
  jump?: { at: At; len: number; h: number; gap: number };
  tunnel?: [number, number];
  /**
   * The shortcut: a straight from control point a to b, `half` wide, on the `side` of the road (-1
   * left, 1 right); "water" falls in off its sides (the plank, the ice lane), "wall" bounces (an alley).
   */
  short?: { a: number; b: number; half: number; side: -1 | 1; kind: "water" | "wall"; ice?: boolean };
  /** Patches on the road: from `at`, `len` metres long, between d0 and d1 (right of the middle). */
  patches?: { at: At; len: number; d0: number; d1: number; kind: PatchKind }[];
  /** Patches on the shortcut: u0..u1 along it, d0..d1 across. */
  shortPatches?: { u0: number; u1: number; d0: number; d1: number; kind: PatchKind }[];
  /** The rivals' top speed here (1: as everywhere; long straights favour the pack, a touch less keeps them catchable). */
  aiPace?: number;
  /** The road's grip everywhere (1: dry; a wet road slides a little). */
  grip?: number;
  /** Gusts across the road between two control points: every `every` s, a warning, then `len` s of push. */
  wind?: { a: number; b: number; every: number; warn: number; len: number; force: number; side: -1 | 1 };
  /** Z-Block rows, boost pads, coin lines. */
  boxes: At[];
  pads: At[];
  coins: At[];
  /** A boost pad on the kicker / the shortcut. */
  padJump?: boolean;
  padShort?: boolean;
}

/** The shortcut, worked out: a straight from the fork to where it meets the road again. */
export interface Short {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  len: number;
  iA: number;
  iB: number;
  /** Samples and metres of road it stands for. */
  di: number;
  ds: number;
  sA: number;
  /** Where it crosses the barrier line (it leaves the road, it meets it again), and the shore. */
  u1: number;
  u2: number;
  w1: number;
  w2: number;
  /** Where it leaves the asphalt and meets it again. */
  ua: number;
  ub: number;
  half: number;
  side: -1 | 1;
  kind: "water" | "wall";
  ice: boolean;
}

export interface Patch {
  s: number;
  len: number;
  d0: number;
  d1: number;
  /** On the shortcut: u0..u1 along it. */
  on: number;
  kind: PatchKind;
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class Track {
  readonly n: number;
  readonly L: number;
  readonly half: number;
  readonly laps: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  /** The tangent's yaw. */
  readonly ty: Float32Array;
  readonly s: Float32Array;
  /** The barriers' distance from the middle. */
  readonly edge: Float32Array;
  readonly zone: Uint8Array;
  /** Over the canal: no road. */
  readonly gap: Uint8Array;
  readonly tunnel: Uint8Array;
  /** A deck over the lower road (no embankment under it). */
  readonly span: Uint8Array;
  /** Under a deck: its underside's height (0: open sky). */
  readonly roof: Float32Array;
  /** The barrier open onto the shortcut. */
  readonly openS: Uint8Array;
  /** Gusts blow here. */
  readonly windy: Uint8Array;
  /** Kerbs (a bend) or a rumble strip (a straight). */
  readonly kerb: Uint8Array;
  /** The racing line: its offset, its curvature (1/m, + to the left). */
  readonly line: Float32Array;
  readonly lk: Float32Array;
  /** Each control point's sample. */
  readonly ci: number[];
  /** The jump's lip and landing (-1: no jump). */
  readonly lip: number = -1;
  readonly land: number = -1;
  readonly short: Short | null = null;
  readonly patches: Patch[] = [];
  readonly bounds: { x0: number; x1: number; z0: number; z1: number };

  constructor(readonly spec: TrackSpec) {
    const CTRL = spec.ctrl;
    const N = CTRL.length;
    this.half = spec.half;
    this.laps = spec.laps;
    const curve = new THREE.CatmullRomCurve3(
      CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "centripetal",
    );
    const len = curve.getLength();
    const n = (this.n = Math.round(len / STEP));
    this.L = len;
    const pts = curve.getSpacedPoints(n);
    const f32 = () => new Float32Array(n);
    const u8 = () => new Uint8Array(n);
    this.px = f32();
    this.py = f32();
    this.pz = f32();
    this.tx = f32();
    this.tz = f32();
    this.ty = f32();
    this.s = f32();
    this.edge = f32();
    this.zone = u8();
    this.gap = u8();
    this.tunnel = u8();
    this.span = u8();
    this.roof = f32();
    this.openS = u8();
    this.windy = u8();
    this.kerb = u8();
    this.line = f32();
    this.lk = f32();
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
      this.s[i] = (i / n) * len;
      x0 = Math.min(x0, pts[i].x);
      x1 = Math.max(x1, pts[i].x);
      z0 = Math.min(z0, pts[i].z);
      z1 = Math.max(z1, pts[i].z);
    }
    this.bounds = { x0, x1, z0, z1 };
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n],
        b = pts[(i + 1) % n];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
      this.ty[i] = Math.atan2(dx, dz);
    }
    // each control point's sample (a control point k sits at t = k/N on the curve)
    const lens = curve.getLengths(N * 40);
    this.ci = CTRL.map((_, k) => Math.round((lens[k * 40] / len) * n) % n);
    const ci = this.ci;
    const each = (a: number, b: number, f: (i: number) => void) => {
      for (let i = ci[a % N]; i !== ci[b % N]; i = (i + 1) % n) f(i);
    };
    // the kinds of ground
    for (const [a, b] of spec.city ?? []) each(a, b, (i) => (this.zone[i] = Z_CITY));
    if (spec.short) each(spec.short.a, spec.short.b, (i) => (this.zone[i] = Z_SHORT));
    if (spec.tunnel) each(spec.tunnel[0], spec.tunnel[1], (i) => ((this.zone[i] = Z_TUNNEL), (this.tunnel[i] = 1)));
    // hills and bridges
    for (const hl of spec.hills ?? []) {
      const c = this.at0(hl.at);
      const f2 = hl.flat / 2;
      for (let m = -(f2 + hl.up); m <= f2 + hl.down; m += STEP) {
        const y = m < -f2 ? smooth((m + f2 + hl.up) / hl.up) : m <= f2 ? 1 : smooth((f2 + hl.down - m) / hl.down);
        const i = this.wrap(c + m / STEP);
        this.py[i] = Math.max(this.py[i], hl.h * y);
        if (y > 0.25 && hl.h > 3 && !this.tunnel[i]) this.zone[i] = Z_BRIDGE;
      }
    }
    // the jump: the kicker, the canal after its lip
    if (spec.jump) {
      const J = spec.jump;
      const lip = (this.lip = this.at0(J.at));
      const kl = J.len / STEP;
      for (let k = 0; k <= kl; k++) {
        const i = this.wrap(lip - kl + k);
        this.py[i] = Math.max(this.py[i], J.h * Math.pow(k / kl, 2.2));
      }
      for (let k = 1; k <= J.gap / STEP; k++) this.gap[this.wrap(lip + k)] = 1;
      this.land = this.wrap(lip + J.gap / STEP + 1);
    }
    // the barriers: from the kind of ground, eased in and out over a few metres
    const EDGES = spec.edges;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = EDGES[this.zone[i]];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -14; k <= 14; k++) sum += raw[this.wrap(i + k)];
      this.edge[i] = this.tunnel[i] ? EDGES[Z_TUNNEL] : sum / 29;
    }
    // where the circuit crosses itself: the deck over the lower road, the roof over that
    for (let i = 0; i < n; i++) {
      if (this.py[i] < 4) continue;
      for (let j = 0; j < n; j += 2) {
        if (this.py[j] > this.py[i] - 4) continue;
        const along = Math.abs(this.s[i] - this.s[j]);
        if (Math.min(along, len - along) < 60) continue;
        const d = Math.hypot(this.px[i] - this.px[j], this.pz[i] - this.pz[j]);
        if (d < this.edge[j] + 3.5) this.span[i] = 1;
        if (d < this.edge[i] + 3) {
          const r = this.py[i] - 1.3;
          this.roof[j] = Math.max(this.roof[j], r);
          this.roof[(j + 1) % n] = Math.max(this.roof[(j + 1) % n], r);
        }
      }
    }
    // kerbs in the bends, rumble strips on the straights
    for (let i = 0; i < n; i++) this.kerb[i] = Math.abs(this.bend(this.wrap(i - 10 / STEP), 20)) > 20 / 70 ? 1 : 0;
    // gusts
    if (spec.wind) each(spec.wind.a, spec.wind.b, (i) => (this.windy[i] = 1));
    // the shortcut
    if (spec.short) this.short = this.makeShort(spec.short);
    // the patches
    for (const p of spec.patches ?? []) {
      const i = this.at0(p.at);
      this.patches.push({ s: this.s[i], len: p.len, d0: p.d0, d1: p.d1, on: 0, kind: p.kind });
    }
    for (const p of spec.shortPatches ?? []) this.patches.push({ s: p.u0, len: p.u1 - p.u0, d0: p.d0, d1: p.d1, on: 1, kind: p.kind });
    this.racingLine();
  }

  /** The sample at a spot (control point, metres on). */
  at0(a: At) {
    return this.wrap(this.ci[a[0] % this.ci.length] + a[1] / STEP);
  }

  private makeShort(sp: NonNullable<TrackSpec["short"]>): Short {
    const n = this.n,
      len = this.L;
    const iA = this.ci[sp.a],
      iB = this.ci[sp.b];
    const ax = this.px[iA],
      az = this.pz[iA];
    const plen = Math.hypot(this.px[iB] - ax, this.pz[iB] - az);
    const sd = sp.side;
    const P: Short = { ax, az, dx: (this.px[iB] - ax) / plen, dz: (this.pz[iB] - az) / plen, len: plen, iA, iB, di: (iB - iA + n) % n, ds: (this.s[iB] - this.s[iA] + len) % len, sA: this.s[iA], u1: 0, u2: plen, w1: 0, w2: plen, ua: 0, ub: plen, half: sp.half, side: sd, kind: sp.kind, ice: !!sp.ice };
    (this as { short: Short | null }).short = P;
    // (where it leaves the road's barrier line and its bed, and where it meets them again)
    let first = true;
    for (let u = 0; u <= plen; u += 0.5) {
      const x = ax + P.dx * u,
        z = az + P.dz * u;
      const j = this.near(x, z, u < plen / 2 ? iA : iB);
      const d = ((x - this.px[j]) * -this.tz[j] + (z - this.pz[j]) * this.tx[j]) * sd;
      const out = d > this.edge[j];
      const wet = d > this.edge[j] + 1.5;
      if (d > this.half && P.ua === 0) P.ua = u;
      if (d > this.half) P.ub = u;
      if (out && first) ((P.u1 = u), (first = false));
      if (out) P.u2 = u;
      if (wet && P.w1 === 0) P.w1 = u;
      if (wet) P.w2 = u;
    }
    // (the barrier opens where the shortcut goes through it)
    for (const [c0, c1] of [
      [iA - 10 / STEP, iA + 70 / STEP],
      [iB - 70 / STEP, iB + 10 / STEP],
    ]) {
      for (let k = c0; k <= c1; k++) {
        const i = this.wrap(k);
        const bx = this.px[i] - this.tz[i] * this.edge[i] * sd,
          bz = this.pz[i] + this.tx[i] * this.edge[i] * sd;
        const u = (bx - ax) * P.dx + (bz - az) * P.dz;
        const off = (bx - ax) * -P.dz + (bz - az) * P.dx;
        if (u > 0 && u < plen && Math.abs(off) < this.shortHalf(u) + 0.4) this.openS[i] = 1;
      }
    }
    return P;
  }

  /** The minimum-curvature line inside the kerbs (relaxed at a few scales), and its curvature. */
  private racingLine() {
    const n = this.n,
      line = this.line;
    const lim = new Float32Array(n);
    for (let i = 0; i < n; i++) lim[i] = this.half - 1.6;
    // (up the kicker and over the canal: near the middle)
    if (this.lip >= 0) {
      const J = this.spec.jump!;
      for (let k = -(J.len + 10) / STEP; k <= (J.gap + 6) / STEP; k++) lim[this.wrap(this.lip + k)] = 2.4;
    }
    for (const [K, it] of [
      [48, 120],
      [24, 120],
      [12, 120],
      [6, 80],
    ]) {
      for (let r = 0; r < it; r++)
        for (let i = 0; i < n; i++) {
          const a = this.wrap(i - K),
            b = this.wrap(i + K);
          const mx = (this.px[a] - this.tz[a] * line[a] + this.px[b] - this.tz[b] * line[b]) / 2;
          const mz = (this.pz[a] + this.tx[a] * line[a] + this.pz[b] + this.tx[b] * line[b]) / 2;
          const cx = this.px[i] - this.tz[i] * line[i],
            cz = this.pz[i] + this.tx[i] * line[i];
          const dn = (mx - cx) * -this.tz[i] + (mz - cz) * this.tx[i];
          line[i] = clamp(line[i] + dn * 0.6, -lim[i], lim[i]);
        }
    }
    const lx = new Float32Array(n),
      lz = new Float32Array(n),
      ly = new Float32Array(n);
    for (let i = 0; i < n; i++) ((lx[i] = this.px[i] - this.tz[i] * line[i]), (lz[i] = this.pz[i] + this.tx[i] * line[i]));
    for (let i = 0; i < n; i++) {
      const a = this.wrap(i - 1),
        b = this.wrap(i + 1);
      ly[i] = Math.atan2(lx[b] - lx[a], lz[b] - lz[a]);
    }
    for (let i = 0; i < n; i++) this.lk[i] = turn(ly[this.wrap(i - 6)], ly[this.wrap(i + 6)]) / (12 * STEP);
  }

  wrap(i: number) {
    return ((Math.round(i) % this.n) + this.n) % this.n;
  }

  /** The stretch where a flag is set (its first sample, how many): a tunnel, a deck. */
  range(flag: Uint8Array) {
    let first = -1,
      last = -1;
    for (let i = 0; i < this.n; i++) if (flag[i] && !flag[(i + this.n - 1) % this.n]) first = i;
    for (let i = 0; i < this.n; i++) if (flag[i] && !flag[(i + 1) % this.n]) last = i;
    if (first < 0) return null;
    let cnt = 0;
    for (let i = first; i !== last; i = (i + 1) % this.n) cnt++;
    return { first, last, cnt, mid: this.wrap(first + cnt / 2) };
  }

  /** Metres from s0 forward to s1 along the loop. */
  fwd(s0: number, s1: number) {
    return (s1 - s0 + this.L * 2) % this.L;
  }

  /** The nearest sample to (x, z), looking round `hint` (or everywhere, at about the height y). */
  near(x: number, z: number, hint = -1, y = NaN) {
    let best = -1,
      bd = Infinity;
    if (hint >= 0) {
      for (let k = -60; k <= 60; k++) {
        const i = this.wrap(hint + k);
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bd) ((bd = d), (best = i));
      }
      if (bd < 625) return best;
      bd = Infinity;
    }
    for (let i = 0; i < this.n; i++) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2 + (y === y ? (this.py[i] - y) ** 2 * 6 : 0);
      if (d < bd) ((bd = d), (best = i));
    }
    return best;
  }

  /** The road's height at sample i, `a` metres along from it. */
  ground(i: number, a: number) {
    const j = a >= 0 ? this.wrap(i + 1) : this.wrap(i - 1);
    return this.py[i] + (this.py[j] - this.py[i]) * Math.min(1, Math.abs(a) / STEP);
  }

  /** Distance from the middle line (any sample), for the scenery. */
  clearance(x: number, z: number) {
    let bd = Infinity;
    for (let i = 0; i < this.n; i += 3) bd = Math.min(bd, (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2);
    return Math.sqrt(bd);
  }

  /** How much the road turns over the next `m` metres (rad, + to the left). */
  bend(i: number, m: number) {
    return turn(this.ty[this.wrap(i)], this.ty[this.wrap(i + m / STEP)]);
  }

  /** A point on the road: `d` metres right of the middle, `up` over it. */
  at(i: number, d = 0, up = 0, v = new THREE.Vector3()) {
    i = this.wrap(i);
    // (right of a heading (tx, tz) is (−tz, tx))
    return v.set(this.px[i] - this.tz[i] * d, this.py[i] + up, this.pz[i] + this.tx[i] * d);
  }

  /** The shortcut's half width `u` along it: flared at both ends, a funnel in and out. */
  shortHalf(u: number) {
    const P = this.short!;
    return P.half + 2.6 * clamp((P.u1 + 9 - u) / 13, 0, 1) + 2.6 * clamp((u - (P.u2 - 9)) / 13, 0, 1);
  }

  /** A point on the shortcut, `u` along it, `off` right of its middle. */
  onShort(u: number, off: number, v: THREE.Vector3) {
    const P = this.short!;
    return v.set(P.ax + P.dx * u - P.dz * off, 0, P.az + P.dz * u + P.dx * off);
  }

  /** The patch under a kart (on the road: progress s, offset d; on the shortcut: u, off), or null. */
  patchAt(on: number, s: number, d: number): Patch | null {
    for (let n = 0; n < this.patches.length; n++) {
      const p = this.patches[n];
      if (p.on !== on || d < p.d0 || d > p.d1) continue;
      if (on ? s >= p.s && s <= p.s + p.len : this.fwd(p.s, s) <= p.len) return p;
    }
    return null;
  }

  /**
   * A strip along the loop: `f(i, o)` gives its two edges at sample i, o = [d0, y0, d1, y1, u1]
   * (offsets right of the middle, heights over the road, the far edge's u) and whether it is there.
   */
  ribbon(f: (i: number, o: number[]) => boolean, vRep: number) {
    const n = this.n;
    const o = [0, 0, 0, 0, 1];
    const pos = new Float32Array((n + 1) * 6);
    const uv = new Float32Array((n + 1) * 4);
    const keep = new Uint8Array(n + 1);
    const idx: number[] = [];
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      o[4] = 1;
      keep[k] = f(i, o) ? 1 : 0;
      const rx = -this.tz[i],
        rz = this.tx[i];
      const y = this.py[i];
      pos.set([this.px[i] + rx * o[0], y + o[1], this.pz[i] + rz * o[0], this.px[i] + rx * o[2], y + o[3], this.pz[i] + rz * o[2]], k * 6);
      const v = (k * STEP) / vRep;
      uv.set([0, v, o[4], v], k * 4);
    }
    for (let k = 0; k < n; k++) {
      if (!keep[k] || !keep[k + 1]) continue;
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

// ---- static geometry, merged: the whole city in a few draws -------------------------------------

export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
CYL.userData = { shared: true };
const mm = new THREE.Matrix4();
const mq = new THREE.Quaternion();
const me = new THREE.Euler();
const mv = new THREE.Vector3();
const ms = new THREE.Vector3();
const mn = new THREE.Matrix3();
const mc = new THREE.Color();

/** Boxes and shapes in their own colours, merged into one geometry (one draw). */
export class Merge {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  private nv = 0;

  get empty() {
    return this.nv === 0;
  }

  /** A box w×h×d centred at (x, y, z), turned ry (then rx, rz), of this colour; `uvs`: [su, sv, ou, ov]. */
  box(color: THREE.ColorRepresentation, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, uvs?: number[]) {
    me.set(rx, ry, rz, "YXZ");
    mm.compose(mv.set(x, y, z), mq.setFromEuler(me), ms.set(w, h, d));
    this.add(GEO.box, mm, color, uvs);
  }

  /** A shape (a unit geometry) scaled sx×sy×sz at (x, y, z), turned ry then rx, rz. */
  shape(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    me.set(rx, ry, rz, "YXZ");
    mm.compose(mv.set(x, y, z), mq.setFromEuler(me), ms.set(sx, sy, sz));
    this.add(g, mm, color);
  }

  /** Any shape under a matrix. */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation, uvs?: number[]) {
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    const nr = g.getAttribute("normal") as THREE.BufferAttribute;
    const uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
    mn.getNormalMatrix(m);
    mc.set(color);
    const e = m.elements,
      ne = mn.elements;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const a = nr.getX(i),
        b = nr.getY(i),
        c = nr.getZ(i);
      let nx = ne[0] * a + ne[3] * b + ne[6] * c,
        ny = ne[1] * a + ne[4] * b + ne[7] * c,
        nz = ne[2] * a + ne[5] * b + ne[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      this.nor.push(nx, ny, nz);
      this.col.push(mc.r, mc.g, mc.b);
      if (uvs && uv) this.uv.push(uv.getX(i) * uvs[0] + uvs[2], uv.getY(i) * uvs[1] + uvs[3]);
      else this.uv.push(0, 0);
    }
    const ix = g.index;
    if (ix) for (let i = 0; i < ix.count; i++) this.idx.push(ix.getX(i) + this.nv);
    else for (let i = 0; i < p.count; i++) this.idx.push(i + this.nv);
    this.nv += p.count;
  }

  /** A flat quad (a sign's face): corners a b c d (counter-clockwise seen from the front), its uv rect. */
  quad(a: number[], b: number[], c: number[], d: number[], u0: number, v0: number, u1: number, v1: number, color: THREE.ColorRepresentation = "#ffffff") {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = d[0] - a[0],
      vy = d[1] - a[1],
      vz = d[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this.pos.push(...a, ...b, ...c, ...d);
    mc.set(color);
    for (let k = 0; k < 4; k++) (this.nor.push(nx, ny, nz), this.col.push(mc.r, mc.g, mc.b));
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const o = this.nv;
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    this.nv += 4;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
