import { FACADE, type RGeo, type Slot as BSlot } from "./buildings";

/** A realistic building's slot, or a landmark set's (`lm.<Set>[.flavour]`, src/scene/real/marksmat.ts). */
export type Slot = BSlot | `lm.${string}`;

/**
 * The geometry writer for the realistic landmarks and the heart's special buildings (branch
 * gta-real): like real/buildings.ts's, but in metres (x across the lot, y up, z from the back to the
 * front, the lot centred on 0), with smooth round things (cylinders, cones, spheres, lofted towers
 * that taper and twist) as well as boxes. Every surface goes to a slot (one shared material each on
 * the main thread, src/scene/real/mats.ts); UVs are metres / the slot's tile, or the photographed
 * facades' bays and floors. Pure (no DOM): runs in the city's workers.
 */

export type V3 = [number, number, number];
export type V2 = [number, number];
type UVF = (p: V3) => V2;

/** Linear colour from a hex string (the vertex colours tint the slot's texture). */
export const hex = (h: string, k = 1): V3 => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => Math.pow(c, 2.2) * k) as V3;
};
export const WHITE: V3 = [1, 1, 1];

/** Metres per repeat of the walls' sets (as tex.ts TILE). */
const TILE: Partial<Record<Slot, V2>> = {
  plaster: [2.5, 2.5],
  brick: [1.6, 1.6],
  brickLight: [1.6, 1.6],
  concrete: [3, 3],
  roof: [2, 2],
  tile: [2, 2],
  wood: [1.5, 1.5],
  metal: [2, 2],
  fabric: [2, 2],
  awning: [2, 2],
};
/** The landmark sets (as markkit.ts TILE). */
const LM_TILE: Record<string, V2> = { Marble021: [2.5, 2.5], Metal024: [2.5, 2.5], Metal032: [2, 2], Concrete012: [3, 3], Concrete019: [3, 3], Concrete034: [2, 2], Concrete031: [3, 3], Grass004: [3, 3], Gravel022: [2, 2], PavingStones128: [3.2, 3.2], PavingStones111: [2.4, 2.4], PavingStones130: [2.4, 2.4], PavingStones070: [1.6, 1.6], Tiles074: [1.6, 1.6], Wood049: [1.5, 1.5], Plaster001: [2.5, 2.5], Bricks060: [1.6, 1.6], Bricks008: [2.6, 2.6] };
const tileOf = (s: Slot): V2 => (s.startsWith("lm.") ? (LM_TILE[s.split(".")[1]] ?? [2, 2]) : (TILE[s] ?? [2, 2]));

/** A tiny seeded random. */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

class Buf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
}

export interface KitOpts {
  /** 0 full, 1 far (no small things). */
  lod: 0 | 1;
  /** Clip at this height (metres): the walls-down copy. */
  clipY?: number;
}

export class Kit {
  private bufs = new Map<Slot, Buf>();
  constructor(readonly o: KitOpts) {}

  get far() {
    return this.o.lod > 0;
  }

  private buf(s: Slot) {
    let b = this.bufs.get(s);
    if (!b) this.bufs.set(s, (b = new Buf()));
    return b;
  }

  /** One vertex; its index. */
  private vert(B: Buf, p: V3, n: V3, t: V2, c: V3) {
    const clip = this.o.clipY;
    const y = clip !== undefined && p[1] > clip ? clip : p[1];
    B.pos.push(p[0], y, p[2]);
    B.nor.push(n[0], n[1], n[2]);
    B.uv.push(t[0], t[1]);
    B.col.push(c[0], c[1], c[2]);
    return B.pos.length / 3 - 1;
  }

  /** A quad a b c d with one normal (wound to face it), or per-vertex normals `ns` (smooth). */
  quad(s: Slot, a: V3, b: V3, c: V3, d: V3, n: V3, uv: UVF, col: V3 = WHITE, ns?: [V3, V3, V3, V3]) {
    const clip = this.o.clipY;
    if (clip !== undefined && Math.min(a[1], b[1], c[1], d[1]) >= clip - 1e-6) return;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.abs(cr[0]) + Math.abs(cr[1]) + Math.abs(cr[2]) < 1e-12) {
      const e3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      cr = [e2[1] * e3[2] - e2[2] * e3[1], e2[2] * e3[0] - e2[0] * e3[2], e2[0] * e3[1] - e2[1] * e3[0]];
    }
    let pts: V3[] = [a, b, c, d];
    let nn = ns;
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) {
      pts = [a, d, c, b];
      if (ns) nn = [ns[0], ns[3], ns[2], ns[1]];
    }
    const B = this.buf(s);
    const i = pts.map((p, k) => this.vert(B, p, nn ? nn[k] : n, uv(p), col));
    B.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]);
  }

  /** A triangle (wound to face n). */
  tri(s: Slot, a: V3, b: V3, c: V3, n: V3, uv: UVF, col: V3 = WHITE) {
    this.quad(s, a, b, c, c, n, uv, col);
  }

  /**
   * A box. `uv`: "world" (the slot's tile, by face), or "facade" (a photographed facade's bays and
   * floors of `fh` metres up each side face from y0); `skip`: faces left out ("-y+y…").
   */
  box(s: Slot, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: V3 = WHITE, o: { skip?: string; fh?: number; uOff?: number } = {}) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    const sk = o.skip ?? "";
    const fac = FACADE[s as BSlot] && o.fh;
    const side = (n: V3, a0: number, a1: number): UVF => (fac ? facadeUV(s, a0, a1, y0, o.fh!, n, o.uOff ?? 0) : worldUV(s, n));
    if (!sk.includes("+z")) this.quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], side([0, 0, 1], x0, x1), col);
    if (!sk.includes("-z")) this.quad(s, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], side([0, 0, -1], x0, x1), col);
    if (!sk.includes("+x")) this.quad(s, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], side([1, 0, 0], z0, z1), col);
    if (!sk.includes("-x")) this.quad(s, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], side([-1, 0, 0], z0, z1), col);
    if (!sk.includes("+y")) this.quad(s, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], worldUV(fac ? "concrete" : s, [0, 1, 0]), col);
    if (!sk.includes("-y")) this.quad(s, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], worldUV(fac ? "concrete" : s, [0, -1, 0]), col);
  }

  /**
   * A round thing: a frustum from radius r0 at y0 to r1 at y1 (a cylinder, a cone, a drum), smooth
   * shaded, with its caps (`caps`: "top", "both", "none").
   */
  cyl(s: Slot, x: number, z: number, r0: number, r1: number, y0: number, y1: number, col: V3 = WHITE, o: { sides?: number; caps?: "top" | "both" | "none"; fh?: number } = {}) {
    const n = o.sides ?? (this.far ? 12 : 24);
    const t = tileOf(s);
    const F = FACADE[s as BSlot];
    const circ = Math.PI * (r0 + r1);
    const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      const c0 = Math.cos(a0),
        s0 = Math.sin(a0),
        c1 = Math.cos(a1),
        s1 = Math.sin(a1);
      const nl = Math.hypot(1, slope);
      const n0: V3 = [c0 / nl, slope / nl, s0 / nl],
        n1: V3 = [c1 / nl, slope / nl, s1 / nl];
      const p00: V3 = [x + c0 * r0, y0, z + s0 * r0],
        p10: V3 = [x + c1 * r0, y0, z + s1 * r0],
        p11: V3 = [x + c1 * r1, y1, z + s1 * r1],
        p01: V3 = [x + c0 * r1, y1, z + s0 * r1];
      const u0 = i / n,
        u1 = (i + 1) / n;
      const uv: UVF = F && o.fh ? (p) => [((p === p00 || p === p01 ? u0 : u1) * circ) / (F.bay * F.bays), (p[1] - y0) / (o.fh! * F.floors)] : (p) => [((p === p00 || p === p01 ? u0 : u1) * circ) / t[0], (p[1] - y0) / t[1]];
      this.quad(s, p00, p10, p11, p01, [(c0 + c1) / 2, 0, (s0 + s1) / 2], uv, col, [n0, n1, n1, n0]);
    }
    const caps = o.caps ?? "top";
    const disc = (y: number, r: number, up: boolean) => {
      if (r <= 0) return;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2,
          a1 = ((i + 1) / n) * Math.PI * 2;
        const ny: V3 = [0, up ? 1 : -1, 0];
        this.tri(s, [x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], ny, (p) => [p[0] / t[0], p[2] / t[1]], col);
      }
    };
    if (caps !== "none") disc(y1, r1, true);
    if (caps === "both") disc(y0, r0, false);
  }

  /** A sphere (or its top half: `hemi`). */
  sphere(s: Slot, x: number, y: number, z: number, r: number, col: V3 = WHITE, o: { segs?: number; hemi?: boolean; sy?: number } = {}) {
    const seg = o.segs ?? (this.far ? 10 : 20);
    const rings = o.hemi ? seg / 2 : seg;
    const sy = o.sy ?? 1;
    const t = tileOf(s);
    const P = (i: number, j: number): [V3, V3] => {
      const th = (i / seg) * Math.PI * 2;
      const ph = (o.hemi ? 0.5 : 1) * Math.PI * (j / rings);
      const nx = Math.sin(ph) * Math.cos(th),
        ny = Math.cos(ph),
        nz = Math.sin(ph) * Math.sin(th);
      return [[x + nx * r, y + ny * r * sy, z + nz * r], [nx, ny, nz]];
    };
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const [a, na] = P(i, j),
          [b, nb] = P(i + 1, j),
          [c, nc] = P(i + 1, j + 1),
          [d, nd] = P(i, j + 1);
        const n: V3 = [(na[0] + nc[0]) / 2, (na[1] + nc[1]) / 2, (na[2] + nc[2]) / 2];
        this.quad(s, a, b, c, d, n, (p) => [(Math.atan2(p[2] - z, p[0] - x) * r) / t[0], (p[1] - y) / t[1]], col, [na, nb, nc, nd]);
      }
  }

  /**
   * A tower lofted through rings of the same number of points (each ring: its height and its
   * outline, counter-clockwise seen from above): sides between the rings (a photographed facade by
   * the floors of `fh` metres, or the slot's tile), a lid on the last. `smooth`: rounded (normals
   * shared at the outline's points) or faceted.
   */
  loft(s: Slot, rings: { y: number; pts: V2[] }[], col: V3 = WHITE, o: { fh?: number; smooth?: boolean; lid?: Slot | null; lidCol?: V3 } = {}) {
    const F = FACADE[s as BSlot];
    const t = tileOf(s);
    const n = rings[0].pts.length;
    // the distance along the outline (for the u), on the first ring
    const along: number[] = [0];
    for (let i = 1; i <= n; i++) {
      const a = rings[0].pts[i - 1],
        b = rings[0].pts[i % n];
      along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const y0 = rings[0].y;
    const outN = (pts: V2[], i: number): V3 => {
      // the outline's outward normal at point i (smooth: averaged over its two sides)
      const p = pts[(i - 1 + n) % n],
        q = pts[i],
        r = pts[(i + 1) % n];
      const n1 = [q[1] - p[1], -(q[0] - p[0])],
        n2 = [r[1] - q[1], -(r[0] - q[0])];
      const l1 = Math.hypot(n1[0], n1[1]) || 1,
        l2 = Math.hypot(n2[0], n2[1]) || 1;
      const nx = n1[0] / l1 + n2[0] / l2,
        nz = n1[1] / l1 + n2[1] / l2;
      const l = Math.hypot(nx, nz) || 1;
      return [nx / l, 0, nz / l];
    };
    for (let k = 0; k + 1 < rings.length; k++) {
      const A = rings[k],
        Bq = rings[k + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a: V3 = [A.pts[i][0], A.y, A.pts[i][1]],
          b: V3 = [A.pts[j][0], A.y, A.pts[j][1]],
          c: V3 = [Bq.pts[j][0], Bq.y, Bq.pts[j][1]],
          d: V3 = [Bq.pts[i][0], Bq.y, Bq.pts[i][1]];
        const ex = b[0] - a[0],
          ez = b[2] - a[2];
        const l = Math.hypot(ex, ez) || 1;
        const fn: V3 = [ez / l, 0, -ex / l];
        const u0 = along[i],
          u1 = along[i + 1];
        const uv: UVF = F && o.fh ? (p) => [((p === a || p === d ? u0 : u1) / (F.bay * F.bays)), (p[1] - y0) / (o.fh! * F.floors)] : (p) => [(p === a || p === d ? u0 : u1) / t[0], (p[1] - y0) / t[1]];
        if (o.smooth) {
          const na = outN(A.pts, i),
            nb = outN(A.pts, j),
            nc = outN(Bq.pts, j),
            nd = outN(Bq.pts, i);
          this.quad(s, a, b, c, d, fn, uv, col, [na, nb, nc, nd]);
        } else this.quad(s, a, b, c, d, fn, uv, col);
      }
    }
    const top = rings[rings.length - 1];
    if (o.lid !== null) {
      const ls = o.lid ?? "roof";
      const lt = tileOf(ls);
      let cx = 0,
        cz = 0;
      for (const p of top.pts) ((cx += p[0]), (cz += p[1]));
      cx /= n;
      cz /= n;
      for (let i = 0; i < n; i++) {
        const p = top.pts[i],
          q = top.pts[(i + 1) % n];
        this.tri(ls, [cx, top.y, cz], [p[0], top.y, p[1]], [q[0], top.y, q[1]], [0, 1, 0], (v) => [v[0] / lt[0], v[2] / lt[1]], o.lidCol ?? col);
      }
    }
  }

  /** An upright prism on a polygon outline (counter-clockwise from above), from y0 to y1. */
  prism(s: Slot, pts: V2[], y0: number, y1: number, col: V3 = WHITE, o: { fh?: number; smooth?: boolean; lid?: Slot | null; lidCol?: V3 } = {}) {
    this.loft(s, [{ y: y0, pts }, { y: y1, pts }], col, o);
  }

  /** A flat polygon at height y facing up (counter-clockwise from above), triangulated as a fan from its centre. */
  floor(s: Slot, pts: V2[], y: number, col: V3 = WHITE, down = false) {
    const t = tileOf(s);
    let cx = 0,
      cz = 0;
    for (const p of pts) ((cx += p[0]), (cz += p[1]));
    cx /= pts.length;
    cz /= pts.length;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i],
        q = pts[(i + 1) % pts.length];
      this.tri(s, [cx, y, cz], [p[0], y, p[1]], [q[0], y, q[1]], [0, down ? -1 : 1, 0], (v) => [v[0] / t[0], v[2] / t[1]], col);
    }
  }

  /** A thin bar between two points (a rod, a cable, a strut): a box of section w turned along it. */
  bar(s: Slot, a: V3, b: V3, w: number, col: V3 = WHITE) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return;
    const f: V3 = [dx / L, dy / L, dz / L];
    // two axes across it
    const up: V3 = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u: V3 = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
    const ul = Math.hypot(...u);
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v: V3 = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    const h = w / 2;
    const P = (p: V3, su: number, sv: number): V3 => [p[0] + (u[0] * su + v[0] * sv) * h, p[1] + (u[1] * su + v[1] * sv) * h, p[2] + (u[2] * su + v[2] * sv) * h];
    const t = tileOf(s);
    const uv: UVF = (p) => [((p[0] - a[0]) * f[0] + (p[1] - a[1]) * f[1] + (p[2] - a[2]) * f[2]) / t[0], 0.5];
    const sides: [number, number, number, number, V3][] = [
      [1, 1, 1, -1, u],
      [1, -1, -1, -1, [-v[0], -v[1], -v[2]]],
      [-1, -1, -1, 1, [-u[0], -u[1], -u[2]]],
      [-1, 1, 1, 1, v],
    ];
    for (const [a1, b1, a2, b2, n] of sides) this.quad(s, P(a, a1, b1), P(a, a2, b2), P(b, a2, b2), P(b, a1, b1), n, uv, col);
  }

  /** Geometry by slot, in metres. */
  out(): Partial<Record<Slot, RGeo>> {
    const res: Partial<Record<Slot, RGeo>> = {};
    for (const [s, B] of this.bufs) {
      if (!B.idx.length) continue;
      res[s] = { pos: Float32Array.from(B.pos), nor: Float32Array.from(B.nor), uv: Float32Array.from(B.uv), col: Float32Array.from(B.col), idx: B.idx };
    }
    return res;
  }
}

/** World mapping for a slot's set by the face's normal (metres / tile). */
export function worldUV(s: Slot, n: V3): UVF {
  const t = tileOf(s);
  if (Math.abs(n[1]) > 0.5) return (p) => [p[0] / t[0], p[2] / t[1]];
  if (Math.abs(n[0]) > Math.abs(n[2])) return (p) => [(-p[2] * Math.sign(n[0])) / t[0], p[1] / t[1]];
  return (p) => [(p[0] * Math.sign(n[2] || 1)) / t[0], p[1] / t[1]];
}

/** A photographed facade on a wall from a0 to a1 (along x for ±z faces, along z for ±x), floors of fh metres from y0. */
export function facadeUV(s: Slot, a0: number, a1: number, y0: number, fh: number, n: V3, uOff: number): UVF {
  const F = FACADE[s as BSlot]!;
  const len = Math.abs(a1 - a0);
  const bays = Math.max(1, Math.round(len / F.bay));
  const along = Math.abs(n[2]) > Math.abs(n[0]) ? 0 : 2;
  const flip = n[2] < 0 || n[0] > 0;
  return (p) => {
    let t = (p[along] - a0) / (a1 - a0 || 1);
    if (flip) t = 1 - t;
    return [uOff + (t * bays) / F.bays, (p[1] - y0) / (fh * F.floors)];
  };
}

/** A rounded rectangle outline (counter-clockwise from above), centre cx, cz, half sizes, corner radius. */
export function roundRect(cx: number, cz: number, hx: number, hz: number, r: number, seg = 4): V2[] {
  const pts: V2[] = [];
  // (built simply: four arcs round the corners in turn)
  const arcs: [number, number, number][] = [
    [cx + hx - r, cz + hz - r, 0],
    [cx - hx + r, cz + hz - r, Math.PI / 2],
    [cx - hx + r, cz - hz + r, Math.PI],
    [cx + hx - r, cz - hz + r, (3 * Math.PI) / 2],
  ];
  for (const [x, z, a] of arcs)
    for (let i = 0; i <= seg; i++) {
      const t = a + (i / seg) * (Math.PI / 2);
      pts.push([x + Math.cos(t) * r, z + Math.sin(t) * r]);
    }
  return pts;
}

/** A circle outline (counter-clockwise from above). */
export function circle(cx: number, cz: number, r: number, n = 24, a0 = 0): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/** An outline turned by `a` about (cx, cz) and scaled by k. */
export function turn(pts: V2[], cx: number, cz: number, a: number, k = 1): V2[] {
  const c = Math.cos(a),
    s = Math.sin(a);
  return pts.map(([x, z]) => {
    const dx = (x - cx) * k,
      dz = (z - cz) * k;
    return [cx + dx * c - dz * s, cz + dx * s + dz * c];
  });
}
