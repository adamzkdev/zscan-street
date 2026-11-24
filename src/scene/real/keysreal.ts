import type { KLot } from "../keys/plan";
import { SHOP_CELLS, type Slot } from "./buildings";

/**
 * ORCHARD KEYS, realistic (branch gta-real, wave 2): the beach town's houses, shops, hotels, the
 * diner, the gas station, the motel, and the things on its beach and in its park, as plain geometry
 * with UVs in metres for the photographed PBR sets — no voxels. Pure (no DOM): runs in the district's
 * worker (src/scene/keys/worker.ts), which still runs the voxel builders for their layout only (the
 * signs, the doors, the lamps' lights).
 *
 * Every lot in its own frame, in metres: x across (−w/2 … w/2), z from the back (−d/2) to the street
 * (+d/2), y up from the kerb. Each surface belongs to a slot: the city's realistic slots (one shared
 * material each on the main thread, src/scene/real/mats.ts) or the town's own (water, lawn, path,
 * sand, chrome, rubber, rock, thatch, white, cloth), made in src/scene/keys/index.ts.
 */

export type KSlot = Slot | "water" | "lawn" | "path" | "sand" | "chrome" | "rubber" | "rock" | "thatch" | "white" | "cloth" | "asphalt" | "court" | "tiles";
/** The town's own slots (not the city's). */
export const KEY_SLOTS: KSlot[] = ["water", "lawn", "path", "sand", "chrome", "rubber", "rock", "thatch", "white", "cloth", "asphalt", "court", "tiles"];

export interface KRGeo {
  pos: Float32Array;
  nor: Float32Array;
  uv: Float32Array;
  col: Float32Array;
  idx: number[];
}

type V3 = [number, number, number];
type UV = (p: V3) => [number, number];

/** Metres per repeat of each textured slot (as tex.ts TILE has the sets). */
const TILE: Partial<Record<KSlot, number>> = { plaster: 2.5, brick: 1.6, brickLight: 1.6, concrete: 3, roof: 2, tile: 2.2, wood: 1.5, metal: 2, thatch: 1.4, cloth: 0.6, rock: 2.5 };

/** sRGB hex to linear (the vertex colour tints the texture). */
export function lin(h: string): V3 {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => Math.pow(c, 2.2)) as V3;
}
const WHITE: V3 = [1, 1, 1];

function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed * 2654435761)) >>> 0) || 1;
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

/** World mapping in metres over the slot's tile, by the face's normal. */
function mapUV(s: KSlot, n: V3): UV {
  const t = TILE[s] ?? 2;
  const ax = Math.abs(n[0]),
    ay = Math.abs(n[1]),
    az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return (p) => [p[0] / t, p[2] / t];
  if (ax >= az) return (p) => [(-p[2] * Math.sign(n[0])) / t, p[1] / t];
  return (p) => [(p[0] * Math.sign(n[2])) / t, p[1] / t];
}

/** The geometry writer: quads, boxes, prisms, roofs, lathes, by slot. */
export class KW {
  private bufs = new Map<KSlot, Buf>();
  /** Trees to plant (x, y, z, species, seed) in the lot's frame. */
  trees: [number, number, number, string, number][] = [];

  private buf(s: KSlot) {
    let b = this.bufs.get(s);
    if (!b) this.bufs.set(s, (b = new Buf()));
    return b;
  }

  /** A triangle, a quad, a fan: wound to face `n` (or each vertex its own normal). */
  tri(s: KSlot, a: V3, b: V3, c: V3, n: V3 | null, col: V3, uv?: UV, na?: V3[]) {
    // (wound to face the given normal, or the vertices' normals' mean; else as given)
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ref: V3 | null = n ?? (na ? [na[0][0] + na[1][0] + na[2][0], na[0][1] + na[1][1] + na[2][1], na[0][2] + na[1][2] + na[2][2]] : null);
    if (ref && cr[0] * ref[0] + cr[1] * ref[1] + cr[2] * ref[2] < 0) {
      [b, c] = [c, b];
      if (na) na = [na[0], na[2], na[1]];
    }
    if (!n) {
      const v = ref ?? cr;
      const l = Math.hypot(...v) || 1;
      n = [v[0] / l, v[1] / l, v[2] / l];
    }
    const f = uv ?? mapUV(s, n);
    const B = this.buf(s);
    const base = B.pos.length / 3;
    [a, b, c].forEach((p, i) => {
      B.pos.push(p[0], p[1], p[2]);
      const nn = na ? na[i] : n!;
      B.nor.push(nn[0], nn[1], nn[2]);
      const t = f(p);
      B.uv.push(t[0], t[1]);
      B.col.push(col[0], col[1], col[2]);
    });
    B.idx.push(base, base + 1, base + 2);
  }
  quad(s: KSlot, a: V3, b: V3, c: V3, d: V3, n: V3 | null, col: V3 = WHITE, uv?: UV) {
    if (!n) {
      const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
        e2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
      const cr: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...cr) || 1;
      n = [cr[0] / l, cr[1] / l, cr[2] / l];
    }
    this.tri(s, a, b, c, n, col, uv);
    this.tri(s, a, c, d, n, col, uv);
  }
  /** An axis-aligned box; `skip` leaves faces out ("-y" for what stands on the ground). */
  box(s: KSlot, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: V3 = WHITE, skip = "", uv?: (n: V3) => UV) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    const u = (n: V3) => (uv ? uv(n) : undefined);
    if (!skip.includes("+z")) this.quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, u([0, 0, 1]));
    if (!skip.includes("-z")) this.quad(s, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col, u([0, 0, -1]));
    if (!skip.includes("+x")) this.quad(s, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], col, u([1, 0, 0]));
    if (!skip.includes("-x")) this.quad(s, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col, u([-1, 0, 0]));
    if (!skip.includes("+y")) this.quad(s, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], col, u([0, 1, 0]));
    if (!skip.includes("-y")) this.quad(s, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col, u([0, -1, 0]));
  }
  /** A box turned about y by `a` round (cx, cz) (size w × h × d, its base at y0). */
  rbox(s: KSlot, cx: number, y0: number, cz: number, w: number, h: number, d: number, a: number, col: V3 = WHITE) {
    const c = Math.cos(a),
      sn = Math.sin(a);
    const P = (x: number, y: number, z: number): V3 => [cx + x * c + z * sn, y, cz - x * sn + z * c];
    const x0 = -w / 2,
      x1 = w / 2,
      z0 = -d / 2,
      z1 = d / 2,
      y1 = y0 + h;
    const N = (x: number, z: number): V3 => [x * c + z * sn, 0, -x * sn + z * c];
    this.quad(s, P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), N(0, 1), col);
    this.quad(s, P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), N(0, -1), col);
    this.quad(s, P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), N(1, 0), col);
    this.quad(s, P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), N(-1, 0), col);
    this.quad(s, P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [0, 1, 0], col);
  }
  /** An upright cylinder or cone frustum, smooth sides, its lid (and bottom unless `open`). */
  cyl(s: KSlot, x: number, z: number, r0: number, r1: number, y0: number, y1: number, col: V3 = WHITE, seg = 16, open = false) {
    const t = TILE[s] ?? 2;
    const slope = (r0 - r1) / Math.max(0.001, y1 - y0);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const n0: V3 = [Math.cos(a0), slope, Math.sin(a0)],
        n1: V3 = [Math.cos(a1), slope, Math.sin(a1)];
      const l0 = Math.hypot(...n0),
        l1 = Math.hypot(...n1);
      const N0: V3 = [n0[0] / l0, n0[1] / l0, n0[2] / l0],
        N1: V3 = [n1[0] / l1, n1[1] / l1, n1[2] / l1];
      const p00: V3 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0],
        p10: V3 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0],
        p11: V3 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1],
        p01: V3 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
      const u0 = (a0 * Math.max(r0, r1)) / t,
        u1 = (a1 * Math.max(r0, r1)) / t;
      const uv: UV = (p) => [Math.abs(p[0] - p00[0]) + Math.abs(p[2] - p00[2]) < 1e-6 || Math.abs(p[0] - p01[0]) + Math.abs(p[2] - p01[2]) < 1e-6 ? u0 : u1, p[1] / t];
      this.tri(s, p00, p11, p10, null, col, uv, [N0, N1, N1]);
      this.tri(s, p00, p01, p11, null, col, uv, [N0, N0, N1]);
      if (r1 > 0) this.tri(s, [x, y1, z], p11, p01, [0, 1, 0], col);
      if (!open && r0 > 0) this.tri(s, [x, y0, z], p00, p10, [0, -1, 0], col);
    }
  }
  /** A horizontal cylinder along x (pipes, rails) from x0 to x1 at (y, z). */
  xcyl(s: KSlot, x0: number, x1: number, y: number, z: number, r: number, col: V3 = WHITE, seg = 8) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const N0: V3 = [0, Math.cos(a0), Math.sin(a0)],
        N1: V3 = [0, Math.cos(a1), Math.sin(a1)];
      const p = (x: number, a: number): V3 => [x, y + Math.cos(a) * r, z + Math.sin(a) * r];
      this.tri(s, p(x0, a0), p(x1, a0), p(x1, a1), null, col, undefined, [N0, N0, N1]);
      this.tri(s, p(x0, a0), p(x1, a1), p(x0, a1), null, col, undefined, [N0, N1, N1]);
    }
  }
  /** The same along z. */
  zcyl(s: KSlot, z0: number, z1: number, x: number, y: number, r: number, col: V3 = WHITE, seg = 8) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const N0: V3 = [Math.cos(a0), Math.sin(a0), 0],
        N1: V3 = [Math.cos(a1), Math.sin(a1), 0];
      const p = (z: number, a: number): V3 => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
      this.tri(s, p(z0, a0), p(z1, a0), p(z1, a1), null, col, undefined, [N0, N0, N1]);
      this.tri(s, p(z0, a0), p(z1, a1), p(z0, a1), null, col, undefined, [N0, N1, N1]);
    }
  }
  /** A slanted tube between two points (struts, stair stringers). */
  tube(s: KSlot, a: V3, b: V3, r: number, col: V3 = WHITE, seg = 6) {
    const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(...d) || 1;
    const t: V3 = [d[0] / L, d[1] / L, d[2] / L];
    const up: V3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u: V3 = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const ul = Math.hypot(...u);
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v: V3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const n = (a: number): V3 => [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)];
      const N0 = n(a0),
        N1 = n(a1);
      const P = (o: V3, N: V3): V3 => [o[0] + N[0] * r, o[1] + N[1] * r, o[2] + N[2] * r];
      this.tri(s, P(a, N0), P(b, N0), P(b, N1), null, col, undefined, [N0, N0, N1]);
      this.tri(s, P(a, N0), P(b, N1), P(a, N1), null, col, undefined, [N0, N1, N1]);
    }
  }
  /**
   * A prism on a 2D outline (x, z, counter-clockwise seen from above) from y0 to y1: its walls (smooth
   * round the curves: `smooth` max angle between edges, radians), its lid (and floor unless `open`).
   */
  prism(s: KSlot, pts: [number, number][], y0: number, y1: number, col: V3 = WHITE, smooth = 0.5, lid = true, open = true) {
    const n = pts.length;
    const en: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i],
        [bx, bz] = pts[(i + 1) % n];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      en.push([(bz - az) / l, -(bx - ax) / l]);
    }
    const vn = (i: number, e: number): V3 => {
      // the vertex's normal for edge e: averaged with the neighbouring edge if they turn gently
      const o = e === i ? (i - 1 + n) % n : (i + 1) % n;
      const a = en[e],
        b = en[o];
      const dot = a[0] * b[0] + a[1] * b[1];
      if (Math.acos(Math.max(-1, Math.min(1, dot))) < smooth) {
        const x = a[0] + b[0],
          z = a[1] + b[1],
          l = Math.hypot(x, z) || 1;
        return [x / l, 0, z / l];
      }
      return [a[0], 0, a[1]];
    };
    const t = TILE[s] ?? 2;
    let run = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [ax, az] = pts[i],
        [bx, bz] = pts[j];
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = run / t,
        u1 = (run + len) / t;
      run += len;
      const A0: V3 = [ax, y0, az],
        B0: V3 = [bx, y0, bz],
        B1: V3 = [bx, y1, bz],
        A1: V3 = [ax, y1, az];
      const Na = vn(i, i),
        Nb = vn(j, i);
      const uv: UV = (p) => [Math.abs(p[0] - ax) + Math.abs(p[2] - az) < 1e-6 ? u0 : u1, p[1] / t];
      this.tri(s, A0, B0, B1, null, col, uv, [Na, Nb, Nb]);
      this.tri(s, A0, B1, A1, null, col, uv, [Na, Nb, Na]);
    }
    if (lid || !open) {
      // (a fan from the centroid: the outlines here are convex or nearly)
      let cx = 0,
        cz = 0;
      for (const [x, z] of pts) ((cx += x), (cz += z));
      cx /= n;
      cz /= n;
      for (let i = 0; i < n; i++) {
        const [ax, az] = pts[i],
          [bx, bz] = pts[(i + 1) % n];
        if (lid) this.tri(s, [cx, y1, cz], [ax, y1, az], [bx, y1, bz], [0, 1, 0], col);
        if (!open) this.tri(s, [cx, y0, cz], [ax, y0, az], [bx, y0, bz], [0, -1, 0], col);
      }
    }
  }
  /** A hipped roof over x0..x1, z0..z1 from y (eaves) up `rise`, overhanging by `over`. */
  hip(s: KSlot, x0: number, z0: number, x1: number, z1: number, y: number, rise: number, over: number, col: V3) {
    x0 -= over;
    z0 -= over;
    x1 += over;
    z1 += over;
    const w = x1 - x0,
      d = z1 - z0;
    const r = Math.min(w, d) / 2;
    const top = y + rise;
    const [ra, rb]: [V3, V3] = w >= d ? [[x0 + r, top, (z0 + z1) / 2], [x1 - r, top, (z0 + z1) / 2]] : [[(x0 + x1) / 2, top, z0 + r], [(x0 + x1) / 2, top, z1 - r]];
    const A: V3 = [x0, y, z0],
      B: V3 = [x1, y, z0],
      C: V3 = [x1, y, z1],
      D: V3 = [x0, y, z1];
    const uvRoof: UV = (p) => [(p[0] + p[2]) / (TILE[s] ?? 2), p[1] / ((TILE[s] ?? 2) * 0.6) + p[2] / (TILE[s] ?? 2)];
    if (w >= d) {
      this.quad(s, D, C, rb, ra, null, col, uvRoof);
      this.quad(s, B, A, ra, rb, null, col, uvRoof);
      this.tri(s, A, D, ra, null, col, uvRoof);
      this.tri(s, C, B, rb, null, col, uvRoof);
    } else {
      this.quad(s, A, D, rb, ra, null, col, uvRoof);
      this.quad(s, C, B, ra, rb, null, col, uvRoof);
      this.tri(s, B, A, ra, null, col, uvRoof);
      this.tri(s, D, C, rb, null, col, uvRoof);
    }
    // the soffit under the overhang
    this.quad(s === "tile" ? "white" : s, A, B, C, D, [0, -1, 0], lin("#f2efe8"));
  }
  /** A lathe about the y axis (umbrellas, bowls): profile (r, y), `seg` around, coloured by segment. */
  lathe(s: KSlot, x: number, z: number, prof: [number, number][], seg: number, col: (i: number) => V3, slotOf?: (i: number) => KSlot) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2;
      const c = col(i);
      const ss = slotOf ? slotOf(i) : s;
      for (let k = 1; k < prof.length; k++) {
        const [r0, y0] = prof[k - 1],
          [r1, y1] = prof[k];
        const P = (r: number, y: number, a: number): V3 => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
        this.quad(ss, P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), null, c);
      }
    }
  }

  out(): Partial<Record<KSlot, KRGeo>> {
    const res: Partial<Record<KSlot, KRGeo>> = {};
    for (const [s, B] of this.bufs) {
      if (!B.idx.length) continue;
      res[s] = { pos: Float32Array.from(B.pos), nor: Float32Array.from(B.nor), uv: Float32Array.from(B.uv), col: Float32Array.from(B.col), idx: B.idx };
    }
    return res;
  }
}

// ---- small parts --------------------------------------------------------------------------------------

const C = {
  trim: lin("#f6f3ec"),
  frame: lin("#f2f0ea"),
  dark: lin("#2a2a30"),
  door: lin("#5a3e2c"),
  base: lin("#9a958c"),
  coping: lin("#efebe2"),
  chrome: lin("#dfe3ea"),
  deck: lin("#c8a27c"),
  terracotta: lin("#d07a5a"),
  shingle: lin("#7a8088"),
  black: lin("#1a1a1e"),
};
const tone = (c: V3, k: number): V3 => (k > 0 ? (c.map((v) => v + (1 - v) * k) as V3) : (c.map((v) => v * (1 + k)) as V3));

/**
 * A window on a wall facing +z at z (x, y its lower left, w × h): white frame, dark glass set in it
 * (the glass slot's colour carries the night draw: lit share, warm/cool, shade), a sill.
 */
function windowZ(K: KW, x: number, y: number, z: number, w: number, h: number, r: () => number, frame: V3 = C.frame, sill = true) {
  // (on the wall's face at z: the pane a hair in front of it, the frame standing proud round it)
  K.box("glass", x, y, z, x + w, y + h, z + 0.02, [r(), r() > 0.3 ? 1 : 0, 0.4 + r() * 0.6], "-z-x+x-y+y");
  const f = 0.07;
  K.box("white", x - f, y - f, z, x, y + h + f, z + 0.07, frame, "-z");
  K.box("white", x + w, y - f, z, x + w + f, y + h + f, z + 0.07, frame, "-z");
  K.box("white", x, y + h, z, x + w, y + h + f, z + 0.07, frame, "-z");
  K.box("white", x, y - f, z, x + w, y, z + 0.07, frame, "-z");
  if (w > 1.1) K.box("white", x + w / 2 - 0.025, y, z, x + w / 2 + 0.025, y + h, z + 0.05, frame, "-z");
  // a transom bar a third of the way down
  K.box("white", x, y + h * 0.68, z, x + w, y + h * 0.68 + 0.04, z + 0.05, frame, "-z");
  if (sill) K.box("concrete", x - 0.12, y - 0.12, z, x + w + 0.12, y - 0.04, z + 0.16, C.coping, "-z");
}
/** Louvred shutters either side of a window. */
function shutters(K: KW, x: number, y: number, z: number, w: number, h: number, col: V3) {
  for (const sx of [x - 0.42, x + w + 0.04]) {
    K.box("wood", sx, y, z, sx + 0.38, y + h, z + 0.04, col, "-z");
    for (let yy = y + 0.1; yy < y + h - 0.05; yy += 0.12) K.box("wood", sx + 0.03, yy, z + 0.04, sx + 0.35, yy + 0.03, z + 0.07, tone(col, -0.15), "-z");
  }
}
/** A front door facing +z at z (centred on x): a panelled leaf in a frame, a lit transom, a lamp. */
function doorZ(K: KW, x: number, z: number, col: V3, w = 1.0, h = 2.2) {
  K.box("wood", x - w / 2, 0, z, x + w / 2, h, z + 0.03, col, "-z");
  for (const [dy, hh] of [
    [0.25, 0.75],
    [1.15, 0.8],
  ])
    K.box("wood", x - w / 2 + 0.14, dy, z + 0.03, x + w / 2 - 0.14, dy + hh, z + 0.05, tone(col, -0.12), "-z");
  K.box("glass", x - w / 2, h + 0.05, z, x + w / 2, h + 0.4, z + 0.015, [0.05, 1, 0.9], "-z-x+x-y+y");
  K.box("white", x - w / 2 - 0.1, 0, z, x - w / 2, h + 0.5, z + 0.1, C.trim, "-z");
  K.box("white", x + w / 2, 0, z, x + w / 2 + 0.1, h + 0.5, z + 0.1, C.trim, "-z");
  K.box("white", x - w / 2 - 0.1, h + 0.4, z, x + w / 2 + 0.1, h + 0.5, z + 0.1, C.trim, "-z");
  K.box("chrome", x + w / 2 - 0.2, 1.0, z + 0.03, x + w / 2 - 0.12, 1.1, z + 0.09, C.chrome);
  K.box("neon", x + w / 2 + 0.25, h - 0.1, z, x + w / 2 + 0.37, h + 0.15, z + 0.1, [3.2, 2.6, 1.8]);
}
/** A gas-fired AC unit on a wall or the ground (+z face its fan). */
function acUnit(K: KW, x: number, y: number, z: number) {
  K.box("metal", x, y, z, x + 0.8, y + 0.6, z + 0.5, lin("#d8d8d2"));
  K.cyl("rubber", x + 0.4, z + 0.51, 0.22, 0.22, y + 0.08, y + 0.52, lin("#3a3a40"), 12);
}
/** A low white picket fence along x at z (gap at gx ± gw/2). */
function picket(K: KW, x0: number, x1: number, z: number, gx: number, gw: number) {
  for (let x = x0; x < x1; x += 0.16) {
    if (Math.abs(x - gx) < gw / 2) continue;
    K.box("white", x, 0, z - 0.02, x + 0.08, 0.95, z + 0.02, C.trim, "-y");
  }
  for (const y of [0.3, 0.75]) {
    if (gx - gw / 2 > x0) K.box("white", x0, y, z - 0.045, gx - gw / 2, y + 0.07, z - 0.02, C.trim);
    if (gx + gw / 2 < x1) K.box("white", gx + gw / 2, y, z - 0.045, x1, y + 0.07, z - 0.02, C.trim);
  }
}
/** A mailbox on its post. */
function mailboxAt(K: KW, x: number, z: number, col: V3) {
  K.box("white", x - 0.04, 0, z - 0.04, x + 0.04, 1.0, z + 0.04, C.trim);
  K.box("metal", x - 0.12, 1.0, z - 0.25, x + 0.12, 1.22, z + 0.25, col);
  K.zcyl("metal", z - 0.25, z + 0.25, x, 1.22, 0.12, col, 10);
}
/** A pink flamingo on the lawn. */
function flamingo(K: KW, x: number, z: number, a: number) {
  const pink = lin("#ff7fb0");
  K.tube("white", [x, 0, z], [x, 0.55, z], 0.008, pink, 4);
  const c = Math.cos(a),
    s = Math.sin(a);
  K.cyl("white", x, z, 0.1, 0.14, 0.52, 0.66, pink, 10);
  K.tube("white", [x + c * 0.1, 0.64, z - s * 0.1], [x + c * 0.16, 0.92, z - s * 0.16], 0.02, pink, 5);
  K.cyl("white", x + c * 0.19, z - s * 0.19, 0.04, 0.03, 0.9, 0.97, pink, 8);
}
/** A pool sunk in its deck: coping, tiled sides, water (x0..x1, z0..z1 at ground level), a ladder. */
function pool(K: KW, x0: number, z0: number, x1: number, z1: number) {
  K.box("concrete", x0 - 0.35, 0, z0 - 0.35, x1 + 0.35, 0.08, z0, C.coping, "-y");
  K.box("concrete", x0 - 0.35, 0, z1, x1 + 0.35, 0.08, z1 + 0.35, C.coping, "-y");
  K.box("concrete", x0 - 0.35, 0, z0, x0, 0.08, z1, C.coping, "-y");
  K.box("concrete", x1, 0, z0, x1 + 0.35, 0.08, z1, C.coping, "-y");
  // (the water a hand under the coping; the tiles' blue showing at its edge)
  K.box("concrete", x0, -0.25, z0, x1, -0.02, z1, lin("#6ac8dc"), "-y+y");
  K.quad("water", [x0, -0.04, z1], [x1, -0.04, z1], [x1, -0.04, z0], [x0, -0.04, z0], [0, 1, 0], WHITE);
  for (const dx of [0, 0.45]) K.tube("chrome", [x1 - 0.7 + dx, -0.3, z0 + 0.12], [x1 - 0.7 + dx, 0.75, z0 + 0.12], 0.025, C.chrome, 8);
}
/** A sun lounger, foot toward +z, centred on (x, z): white frame, cushion, a back rest. */
function lounger(K: KW, x: number, z: number, cushion: V3) {
  K.box("white", x - 0.32, 0.26, z - 0.85, x + 0.32, 0.3, z + 0.85, C.trim);
  for (const [dx, dz] of [
    [-0.28, -0.8],
    [0.28, -0.8],
    [-0.28, 0.8],
    [0.28, 0.8],
  ])
    K.box("chrome", x + dx - 0.02, 0, z + dz - 0.02, x + dx + 0.02, 0.26, z + dz + 0.02, C.chrome);
  K.box("cloth", x - 0.29, 0.3, z - 0.5, x + 0.29, 0.36, z + 0.82, cushion);
  // the back rest, raised
  K.quad("cloth", [x - 0.29, 0.32, z - 0.5], [x + 0.29, 0.32, z - 0.5], [x + 0.29, 0.82, z - 0.92], [x - 0.29, 0.82, z - 0.92], null, cushion);
  K.quad("cloth", [x + 0.29, 0.3, z - 0.55], [x - 0.29, 0.3, z - 0.55], [x - 0.29, 0.8, z - 0.97], [x + 0.29, 0.8, z - 0.97], null, cushion);
}
/** A beach umbrella: pole and its striped canopy (radius r) at y. */
function umbrella(K: KW, x: number, z: number, h: number, r: number, a: V3, b: V3) {
  K.cyl("white", x, z, 0.025, 0.025, 0, h + 0.3, C.trim, 8);
  K.lathe("cloth", x, z, [[0.04, h + 0.42], [r * 0.55, h + 0.2], [r, h - 0.08], [r, h - 0.2]], 16, (i) => (i % 2 ? a : b));
  // the underside
  K.lathe("cloth", x, z, [[r, h - 0.1], [0.04, h + 0.34]], 16, (i) => tone(i % 2 ? a : b, -0.25));
}

// ---- the lots ------------------------------------------------------------------------------------------

/** The lot's door in metres in its frame (from the voxel layout's door: model voxels). */
export interface Layout {
  doorX: number;
  /** The front wall's z (metres, in the lot's frame). */
  frontZ: number;
  signs: { text: string; x: number; y: number; z: number; w: number; h: number; vertical: boolean; facing: "front" | "side" }[];
}

/** A lot of Orchard Keys in realistic geometry (its frame), from its plan and its voxel layout. */
export function keysLot(l: KLot, L: Layout): KW {
  const K = new KW();
  const r = rng(l.seed * 13 + 7);
  const w = l.w,
    d = l.d;
  switch (l.type) {
    case "bungalow":
      bungalow(K, l, L, r, w, d);
      break;
    case "deco":
      deco(K, l, L, r, w, d);
      break;
    case "villa":
      villa(K, l, L, r, w, d);
      break;
    case "shop":
      shop(K, l, L, r, w, d);
      break;
    case "diner":
      diner(K, l, L, r, w, d);
      break;
    case "gas":
      gas(K, l, L, r, w, d);
      break;
    case "motel":
      motel(K, l, L, r, w, d);
      break;
    case "hotel":
    case "club":
      hotel(K, l, L, r, w, d, l.type === "club");
      break;
  }
  // (the shops', the diner's, the gas station's, the motel's and the hotels' signs have their own mounts)
  signBacks(K, L, l.type !== "bungalow" && l.type !== "deco" && l.type !== "villa");
  return K;
}

/** A sign's lightbox or box (so no sign floats): behind every front sign, round every vertical one. */
function signBacks(K: KW, L: Layout, own = false) {
  if (own) return;
  for (const s of L.signs) {
    if (s.vertical) K.box("metal", s.x - 0.12, s.y - s.h / 2 - 0.1, s.z - 0.55, s.x + 0.12, s.y + s.h / 2 + 0.1, s.z + 0.55, C.black);
    else if (s.facing === "front") K.box("metal", s.x - s.w / 2 - 0.08, s.y - s.h / 2 - 0.08, s.z - 0.16, s.x + s.w / 2 + 0.08, s.y + s.h / 2 + 0.08, s.z - 0.02, C.black, "-z");
  }
}

/** The lot's ground: lawn all over, a path from the door to the street, a driveway. */
function grounds(K: KW, w: number, d: number, doorX: number, frontZ: number, drive: number | null) {
  K.box("lawn", -w / 2, 0, -d / 2, w / 2, 0.04, d / 2, WHITE, "-y");
  K.box("path", doorX - 0.6, 0.04, frontZ, doorX + 0.6, 0.06, d / 2, WHITE, "-y");
  if (drive !== null) K.box("path", drive - 1.4, 0.04, -d / 2 + 1, drive + 1.4, 0.065, d / 2, lin("#d8d4cc"), "-y");
}

function bungalow(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number) {
  const paint = lin(l.paint ?? "#acd6ef");
  const bw = Math.min(w - 4, 11.5),
    bd = Math.min(d - 7.5, 9);
  const cx = Math.max(-w / 2 + bw / 2 + 0.5, Math.min(w / 2 - bw / 2 - 0.5, L.doorX));
  const fz = L.frontZ,
    z0 = fz - bd;
  const x0 = cx - bw / 2,
    x1 = cx + bw / 2;
  const drive = cx > 0 ? -w / 2 + 1.8 : w / 2 - 1.8;
  grounds(K, w, d, L.doorX, fz + 1.9, drive);
  // the plinth, the siding (painted boards), corner boards
  K.box("concrete", x0 - 0.05, 0, z0 - 0.05, x1 + 0.05, 0.4, fz + 0.05, C.base, "-y");
  K.box("wood", x0, 0.4, z0, x1, 3.4, fz, paint, "-y");
  for (const x of [x0 - 0.08, x1 - 0.08]) for (const z of [z0 - 0.08, fz - 0.08]) K.box("white", x, 0.4, z, x + 0.16, 3.4, z + 0.16, C.trim);
  // the windows, shuttered, and the door
  const sh = tone(paint, -0.35);
  for (const wx of [x0 + 1.0, L.doorX - 2.4, L.doorX + 1.2, x1 - 2.0])
    if (wx > x0 + 0.5 && wx + 1.2 < x1 - 0.4 && (wx + 1.2 < L.doorX - 0.7 || wx > L.doorX + 0.7)) {
      windowZ(K, wx, 1.1, fz, 1.2, 1.5, r);
      shutters(K, wx, 1.1, fz + 0.02, 1.2, 1.5, sh);
    }
  for (const z of [z0 + 1.5, z0 + bd - 3]) {
    // side windows (on ±x walls): a frame and glass flush
    for (const [x, s] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      K.box("glass", x + s * 0.02 - 0.02, 1.1, z, x + s * 0.02 + 0.02, 2.5, z + 1.1, [r(), 1, 0.6]);
      K.box("white", x + s * 0.03 - 0.05, 1.02, z - 0.08, x + s * 0.03 + 0.05, 1.1, z + 1.18, C.trim);
    }
  }
  doorZ(K, L.doorX, fz, tone(paint, -0.4));
  // the porch: a deck, posts, a rail with balusters, its own roof
  K.box("wood", x0 + 0.6, 0, fz, x1 - 0.6, 0.5, fz + 1.8, C.deck, "-y");
  K.box("wood", L.doorX - 0.7, 0, fz + 1.8, L.doorX + 0.7, 0.25, fz + 2.3, C.deck, "-y");
  for (const px of [x0 + 0.7, L.doorX - 0.85, L.doorX + 0.75, x1 - 0.8]) K.box("white", px, 0.5, fz + 1.55, px + 0.14, 3.3, fz + 1.69, C.trim);
  for (let x = x0 + 0.7; x < x1 - 0.7; x += 0.18) if (Math.abs(x - L.doorX) > 0.8) K.box("white", x, 0.5, fz + 1.58, x + 0.05, 1.3, fz + 1.63, C.trim);
  for (const [a, b] of [
    [x0 + 0.7, L.doorX - 0.85],
    [L.doorX + 0.85, x1 - 0.7],
  ])
    K.box("white", a, 1.3, fz + 1.55, b, 1.38, fz + 1.7, C.trim);
  K.box("white", x0 + 0.5, 3.3, fz, x1 - 0.5, 3.45, fz + 1.9, C.trim);
  const roofCol = r() > 0.5 ? C.shingle : C.terracotta;
  K.quad("tile", [x0 + 0.4, 3.45, fz + 2.0], [x1 - 0.4, 3.45, fz + 2.0], [x1 - 0.4, 3.8, fz], [x0 + 0.4, 3.8, fz], null, roofCol);
  // swing chairs and a ceiling fan on the porch
  K.box("white", x0 + 1.2, 0.5, fz + 0.4, x0 + 2.0, 0.95, fz + 1.0, C.trim);
  // the hipped roof
  K.hip("tile", x0, z0, x1, fz, 3.4, 2.1, 0.45, roofCol);
  K.box("brick", x0 + 1.4, 3.6, z0 + 1.6, x0 + 1.95, 5.9, z0 + 2.15, lin("#9a6a5a"));
  // the fence, its gate, the mailbox, the flamingos, a palm, the AC
  picket(K, -w / 2 + 0.2, w / 2 - 0.2, d / 2 - 0.25, L.doorX, 1.3);
  mailboxAt(K, L.doorX + 1.4, d / 2 - 0.8, paint);
  flamingo(K, x0 + 1.2 + r() * 1.5, fz + 3.2, r() * 6);
  flamingo(K, x0 + 2.2 + r() * 1.5, fz + 3.8, r() * 6);
  K.trees.push([r() > 0.5 ? -w / 2 + 1.2 : w / 2 - 1.2, 0, -d * 0.15, "palm", l.seed % 8]);
  K.trees.push([x1 + 0.6, 0, z0 + 0.8, "bush", l.seed + 3]);
  acUnit(K, x1 + 0.1, 0, (z0 + fz) / 2);
}

function deco(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number) {
  const paint = lin(l.paint ?? "#f3b3c8");
  const accent = tone(paint, -0.38);
  const bw = Math.min(w - 3, 13),
    bd = Math.min(d - 6, 10);
  const cx = Math.max(-w / 2 + bw / 2 + 0.4, Math.min(w / 2 - bw / 2 - 0.4, L.doorX));
  const fz = L.frontZ,
    z0 = fz - bd;
  const x0 = cx - bw / 2,
    x1 = cx + bw / 2;
  const H = 6.3;
  grounds(K, w, d, L.doorX, fz, null);
  // the body: a rounded front corner (art-deco), stucco
  const left = r() > 0.5;
  const R = 2.0;
  const pts: [number, number][] = [];
  const corner = (ccx: number, ccz: number, a0: number, a1: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      pts.push([ccx + Math.cos(a) * R, ccz + Math.sin(a) * R]);
    }
  };
  // (counter-clockwise seen from above: x right, z toward the street)
  pts.push([x0, z0]);
  if (left) {
    pts.push([x0, fz - R]);
    corner(x0 + R, fz - R, Math.PI, Math.PI / 2);
    pts.push([x1, fz]);
  } else {
    pts.push([x0, fz]);
    pts.push([x1 - R, fz]);
    corner(x1 - R, fz - R, Math.PI / 2, 0);
  }
  pts.push([x1, z0]);
  // (wound: walls face out)
  K.prism("plaster", pts.slice().reverse(), 0, H, paint, 0.6, true);
  K.prism("concrete", pts.slice().reverse(), -0.05, 0.35, C.base, 0.6, false);
  // racing stripes round the corner, eyebrows over the windows, the stepped parapet with its fin
  for (const y of [3.6, 3.95, 4.3]) K.prism("plaster", pts.slice().reverse().map(([x, z]) => [x + Math.sign(x - cx) * 0.02, z + 0.02] as [number, number]), y, y + 0.12, accent, 0.6, false);
  const winY = [1.0, 4.6];
  for (const y of winY) {
    for (const wx of [x0 + (left ? 2.6 : 0.9), x1 - (left ? 2.4 : 4.2)]) {
      if (Math.abs(wx + 0.75 - L.doorX) < 1.6 && y < 2) continue;
      windowZ(K, wx, y, fz, 1.5, 1.4, r, C.frame, false);
      K.box("white", wx - 0.25, y + 1.55, fz, wx + 1.75, y + 1.63, fz + 0.45, C.trim);
    }
  }
  // the glass-block bay over the door, a porthole
  K.box("glass", L.doorX - 0.45, 2.6, fz - 0.04, L.doorX + 0.45, 5.6, fz + 0.06, [0.6, 1, 0.9]);
  for (let y = 2.6; y <= 5.6; y += 0.3) K.box("white", L.doorX - 0.47, y, fz + 0.04, L.doorX + 0.47, y + 0.025, fz + 0.08, C.trim);
  doorZ(K, L.doorX, fz, accent);
  K.box("white", L.doorX - 1.1, 2.4, fz, L.doorX + 1.1, 2.5, fz + 0.9, C.trim);
  const parX0 = left ? x0 + R : x0,
    parX1 = left ? x1 : x1 - R;
  K.box("plaster", parX0, H, fz - 0.3, parX1, H + 0.6, fz, paint);
  K.box("plaster", cx - 1.6, H, fz - 0.3, cx + 1.6, H + 1.2, fz, paint);
  K.box("plaster", cx - 0.25, H, fz - 0.4, cx + 0.25, H + 2.4, fz + 0.1, accent);
  K.box("neon", cx - 0.03, H + 0.2, fz + 0.1, cx + 0.03, H + 2.3, fz + 0.14, lin(l.neon ?? "#ff4fa3").map((v) => v * 2.6) as V3);
  // the lawn's palms, a hedge, the flamingo
  K.trees.push([left ? x1 + 1.2 : x0 - 1.2, 0, fz + 1.5, "palm", l.seed % 8]);
  K.trees.push([cx, 0, z0 - 1.2, "bush", l.seed + 1]);
  flamingo(K, cx + (left ? 2.5 : -2.5), fz + 2.2, r() * 6);
  acUnit(K, left ? x1 + 0.05 : x0 - 0.85, 0, z0 + 1.5);
}

function villa(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number) {
  const paint = lin(l.paint ?? "#f6efe2");
  const bw = Math.min(w - 2.4, 13.6),
    bd = Math.min(d * 0.48, 8.6);
  const x0 = -bw / 2,
    x1 = bw / 2;
  const fz = L.frontZ,
    z0 = fz - bd;
  K.box("lawn", -w / 2, 0, -d / 2, w / 2, 0.04, d / 2, WHITE, "-y");
  // ground floor: rendered walls, a glass front to the garden
  K.box("plaster", x0, 0, z0, x1, 3.3, fz - 0.05, paint, "-y");
  K.box("glass", x0 + 0.6, 0.05, fz - 0.06, x1 - 3.4, 3.1, fz + 0.02, [r() * 0.6, 1, 0.8], "-y");
  for (let x = x0 + 0.6; x <= x1 - 3.4 + 0.01; x += 1.5) K.box("metal", x - 0.03, 0.05, fz - 0.05, x + 0.03, 3.1, fz + 0.05, C.dark);
  // upper floor: a white box cantilevered over the terrace, wood slats, a long window
  const ux0 = x0 - 0.7 + (r() > 0.5 ? 1.6 : 0),
    ux1 = ux0 + bw - 2.3;
  K.box("plaster", ux0, 3.3, z0 + 0.3, ux1, 6.3, fz + 1.7, paint);
  K.box("glass", ux0 + 1, 3.8, fz + 1.66, ux1 - 1, 5.8, fz + 1.72, [r(), 1, 0.5], "-z-y+y-x+x");
  for (let x = ux0 + 1; x < ux1 - 1; x += 0.33) K.box("wood", x, 3.8, fz + 1.72, x + 0.14, 5.8, fz + 1.86, C.deck);
  K.box("white", ux0 - 0.15, 6.3, z0 + 0.15, ux1 + 0.15, 6.45, fz + 1.95, C.trim);
  // the stair tower and the roof terrace's glass rail
  K.box("plaster", x1 - 2.6, 3.3, z0, x1, 7.4, z0 + 2.6, tone(paint, -0.05));
  K.box("glass", ux0 + 0.2, 6.45, fz + 1.85, ux1 - 0.2, 7.45, fz + 1.9, [0, 0, 0.3]);
  K.trees.push([x0 + 0.8, 6.45, z0 + 1.2, "bush", l.seed + 9]);
  doorZ(K, L.doorX, fz, lin("#3a2e26"), 1.1, 2.6);
  // the terrace, the pool, loungers, a parasol, the palms, the hedge round it all
  K.box("wood", x0 - 0.5, 0, fz, x1 + 0.5, 0.18, fz + 2.6, C.deck, "-y");
  const pz0 = fz + 3.1,
    pz1 = Math.min(d / 2 - 1.2, pz0 + 4.2);
  const px0 = x0 + 0.6,
    px1 = Math.min(x1 - 0.4, px0 + 8);
  if (pz1 - pz0 > 1.8) {
    K.box("path", x0 - 0.5, 0.04, pz0 - 0.6, x1 + 0.5, 0.07, pz1 + 0.6, lin("#efe9de"), "-y");
    pool(K, px0, pz0, px1, pz1);
    for (const lx of [px1 + 0.9, px1 + 1.75]) if (lx < w / 2 - 0.5) lounger(K, lx, (pz0 + pz1) / 2, lin(["#ff7fb0", "#46c8e0", "#f4b728"][Math.floor(r() * 3)]));
  }
  for (let x = -w / 2 + 0.3; x < w / 2 - 0.3; x += 0.9) if (Math.abs(x - L.doorX) > 0.9) K.trees.push([x, 0, d / 2 - 0.45, "bush", l.seed + Math.round(x * 3)]);
  K.trees.push([-w / 2 + 1.0, 0, fz + 2.2, "palm", (l.seed + 1) % 8]);
  K.trees.push([w / 2 - 1.0, 0, fz + 4.2, "palm", (l.seed + 2) % 8]);
  K.box("path", L.doorX - 0.6, 0.04, fz, L.doorX + 0.6, 0.075, d / 2, WHITE, "-y");
}

/** The shops' strip: rendered walls, a full glass front onto the lit interior, a fascia for the sign, an awning, a parapet. */
function shop(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number) {
  const trade = l.trade ?? "konbini";
  const two = trade === "surf" || trade === "lounge" || trade === "pawn";
  const H = two ? 6.6 : 4.2;
  const paint = lin(l.paint ?? "#f2eee6");
  const fz = L.frontZ,
    z0 = Math.max(-d / 2 + 0.6, fz - 11);
  const x0 = -w / 2 + 0.15,
    x1 = w / 2 - 0.15;
  K.box("path", -w / 2, 0, fz, w / 2, 0.05, d / 2, lin("#d8d4cc"), "-y");
  K.box("plaster", x0, 0, z0, x1, H, fz - 0.5, paint, "-y");
  for (const [a, b] of [
    [x0, x0 + 0.3],
    [x1 - 0.3, x1],
  ])
    K.box("plaster", a, 0, fz - 0.5, b, H, fz - 0.17, paint, "-y");
  // the glass front: interior, mullions, the door
  const cell = ({ konbini: "konbini", tacos: "cafe", surf: "boutique", lounge: "bar", laundry: "market", pawn: "boutique", icecream: "cafe" } as Record<string, string>)[trade] ?? "market";
  const ci = Math.max(0, (SHOP_CELLS as readonly string[]).indexOf(cell));
  const gt = 2.5;
  interior(K, ci, x0 + 0.3, x1 - 0.3, 0.3, gt, fz - 0.42);
  const n = Math.max(2, Math.round((x1 - x0) / 1.8));
  for (let k = 0; k <= n; k++) {
    const x = x0 + 0.3 + ((x1 - x0 - 0.6) * k) / n;
    K.box("metal", x - 0.04, 0.3, fz - 0.4, x + 0.04, gt, fz - 0.28, C.dark);
  }
  K.box("metal", x0 + 0.3, gt, fz - 0.42, x1 - 0.3, gt + 0.08, fz - 0.26, C.dark);
  K.box("concrete", x0, 0, fz - 0.5, x1, 0.3, fz - 0.2, C.base);
  // the fascia (the sign's: its lightbox) and the parapet
  K.box("plaster", x0, gt + 0.08, fz - 0.3, x1, H, fz - 0.17, paint);
  K.box("plaster", x0, gt + 0.17, fz - 0.17, x1, 3.83, fz + 0.04, lin(({ konbini: "#1f6a4a", tacos: "#7a2a1a", surf: "#1a4a7a", lounge: "#1a1622", laundry: "#2a5a8a", pawn: "#3a2a1a", icecream: "#f4c4d8" } as Record<string, string>)[trade] ?? "#2a2a30"));
  K.box("neon", x0, 3.83, fz - 0.1, x1, 3.9, fz + 0.04, lin(l.neon ?? "#ff4fa3").map((v) => v * 2.4) as V3);
  if (two) for (const wx of [x0 + 1, (x0 + x1) / 2 - 0.7, x1 - 2.4]) windowZ(K, wx, 4.4, fz, 1.4, 1.4, r, C.frame);
  K.box("plaster", x0 - 0.1, H, z0 - 0.1, x1 + 0.1, H + 0.5, z0 + 0.15, paint);
  K.box("plaster", x0 - 0.1, H, fz - 0.15, x1 + 0.1, H + 0.5, fz + 0.1, paint);
  K.box("plaster", x0 - 0.1, H, z0, x0 + 0.15, H + 0.5, fz, paint);
  K.box("plaster", x1 - 0.15, H, z0, x1 + 0.1, H + 0.5, fz, paint);
  K.box("roof", x0, H - 0.05, z0, x1, H + 0.05, fz - 0.15, lin("#9a968e"), "-y-x+x-z+z");
  acUnit(K, x0 + 1, H, z0 + 1.2);
  acUnit(K, x1 - 2, H, z0 + 2.4);
  // the awning: canvas in the trade's colour
  const aw = lin(({ konbini: "#2a8a5a", tacos: "#d8402a", surf: "#1f7ab8", lounge: "#2a1f3a", laundry: "#3a8ad8", pawn: "#7a5a2a", icecream: "#ff7fb0" } as Record<string, string>)[trade] ?? "#2a4a6a");
  if (trade !== "pawn" && trade !== "lounge") {
    K.quad("cloth", [x0 + 0.5, gt + 0.1, fz + 0.05], [x1 - 0.5, gt + 0.1, fz + 0.05], [x1 - 0.5, gt - 0.4, fz + 1.05], [x0 + 0.5, gt - 0.4, fz + 1.05], null, aw);
    K.box("cloth", x0 + 0.5, gt - 0.62, fz + 1.04, x1 - 0.5, gt - 0.4, fz + 1.06, aw);
  }
  // the trade's things outside
  if (trade === "surf") for (let k = 0; k < 5; k++) K.rbox("cloth", x1 - 1 - k * 0.5, 0, fz + 0.3, 0.45, 2.4 + (k % 2) * 0.4, 0.07, 0.1, lin(["#ff8a3a", "#1c9ad6", "#f4e8a8", "#ff4fa3", "#4dffb8"][k]));
  if (trade === "pawn") for (let x = x0 + 0.7; x < x1 - 0.7; x += 0.17) K.box("metal", x, 0.3, fz - 0.24, x + 0.025, gt, fz - 0.2, lin("#3a3742"));
  if (trade === "lounge") {
    for (const dx of [-0.6, 1.6]) K.cyl("chrome", L.doorX + dx - 0.5, fz + 0.4, 0.04, 0.04, 0, 0.85, C.chrome, 8);
    K.xcyl("cloth", L.doorX - 1.1, L.doorX + 1.1, 0.8, fz + 0.4, 0.03, lin("#a01e3a"));
    const bl = L.signs.find((s) => s.vertical);
    if (bl) K.box("metal", bl.x - 0.15, bl.y - bl.h / 2 - 0.15, bl.z - 0.67, bl.x + 0.15, bl.y + bl.h / 2 + 0.15, bl.z + 0.67, lin("#1a1820"));
  }
  if (trade === "icecream") {
    // the giant cone on the roof
    const cz = (z0 + fz) / 2;
    K.cyl("wood", 0, cz, 0.15, 0.9, H + 0.6, H + 3.2, lin("#d9a05a"), 18);
    K.lathe("white", 0, cz, [[0.9, H + 3.15], [1.1, H + 3.6], [0.9, H + 4.3], [0.4, H + 4.6], [0.01, H + 4.65]], 18, () => lin("#ffb3cf"));
    K.lathe("white", 0, cz, [[0.75, H + 4.35], [0.82, H + 4.8], [0.5, H + 5.3], [0.01, H + 5.4]], 18, () => lin("#fff3c4"));
  }
  if (trade === "konbini") {
    K.box("metal", x1 - 2.3, 0, fz + 0.17, x1 - 1.8, 1, fz + 0.5, lin("#3a6a9a"));
    K.box("metal", x1 - 1.7, 0, fz + 0.17, x1 - 1.2, 1, fz + 0.5, lin("#4a8a4a"));
  }
  // a bench and a planter by the door
  K.box("wood", x1 - 2.4, 0.42, fz + 0.4, x1 - 0.8, 0.48, fz + 0.85, C.deck);
  K.trees.push([x0 + 0.7, 0, fz + 0.7, "bush", l.seed]);
}

/** The diner: a streamline railcar of brushed steel, rounded ends, a red band, windows all along onto the booths, the vestibule, the roof sign. */
function diner(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number) {
  const fz = L.frontZ - 1;
  const x0 = -w / 2 + 1,
    x1 = w / 2 - 1;
  const z0 = Math.max(-d / 2 + 1.33, fz - 8.33);
  const R = (fz - z0) / 2;
  const cz = (z0 + fz) / 2;
  K.box("asphalt", -w / 2, 0, -d / 2, w / 2, 0.04, d / 2, WHITE, "-y");
  for (let x = -w / 2 + 0.67; x < w / 2 - 0.6; x += 2.67) K.box("white", x, 0.04, fz + 1.67, x + 0.12, 0.05, d / 2 - 0.33, lin("#eeeae0"), "-y");
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    pts.push([x1 - R + Math.cos(a) * R, cz + Math.sin(a) * R]);
  }
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI / 2 + (i / 12) * Math.PI;
    pts.push([x0 + R + Math.cos(a) * R, cz + Math.sin(a) * R]);
  }
  const ring = pts.slice().reverse();
  const grow = (k: number) => ring.map(([x, z]) => [x + (x > 0 ? k : -k) * (Math.abs(x) > x1 - R - 0.01 ? 1 : 0) + 0, z + Math.sign(z - cz) * k] as [number, number]);
  K.prism("concrete", ring, 0, 0.5, lin("#2a2a30"), 0.7, false);
  K.prism("chrome", ring, 0.5, 1.17, C.chrome, 0.7, false);
  K.prism("glass", ring, 1.17, 2.5, [0.9, 1, 0.9], 0.7, false);
  K.prism("white", grow(0.03), 2.5, 2.83, lin("#d8333f"), 0.7, false);
  K.prism("chrome", ring, 2.83, 3.17, C.chrome, 0.7, false);
  K.prism("white", ring, 3.17, 3.67, lin("#f4f2ec"), 0.7, true);
  // the booths seen through the windows along the front: atlas cells, a chrome mullion between
  {
    const n = Math.max(1, Math.round((x1 - x0 - 2 * R) / 2.4));
    const cw = (x1 - x0 - 2 * R) / n;
    for (let k = 0; k < n; k++) {
      const a = x0 + R + k * cw;
      if (Math.abs(a + cw / 2 - L.doorX) < 1.1) continue;
      interior(K, 0, a + 0.05, a + cw - 0.05, 1.19, 2.48, fz + 0.012);
      K.box("chrome", a + cw - 0.05, 1.17, fz - 0.02, a + cw + 0.05, 2.5, fz + 0.04, C.chrome);
    }
  }
  // the vestibule (the door), its red crown
  const vx = L.doorX;
  K.box("white", vx - 1, 0, fz - 0.33, vx + 1, 3.67, fz + 1, lin("#f4f2ec"), "-y");
  K.box("white", vx - 1.17, 3.67, fz - 0.33, vx + 1.17, 4.0, fz + 1.17, lin("#d8333f"));
  interior(K, 0, vx - 0.5, vx + 0.5, 0.17, 2.5, fz + 1.012);
  K.box("chrome", vx - 0.6, 0.0, fz + 0.98, vx - 0.5, 2.6, fz + 1.06, C.chrome);
  K.box("chrome", vx + 0.5, 0.0, fz + 0.98, vx + 0.6, 2.6, fz + 1.06, C.chrome);
  K.box("chrome", vx - 0.6, 2.5, fz + 0.98, vx + 0.6, 2.6, fz + 1.06, C.chrome);
  // the roof sign's frame (the sign itself is the layout's), its bulbs
  const big = L.signs.find((s) => s.y > 4);
  if (big) {
    const top = big.y + big.h / 2 + 0.17;
    K.box("metal", big.x - big.w / 2 - 0.1, 3.67, big.z - 0.37, big.x + big.w / 2 + 0.1, top, big.z - 0.1, lin("#1a1820"));
    for (let x = big.x - big.w / 2; x < big.x + big.w / 2; x += 0.67) K.box("neon", x, top, big.z - 0.3, x + 0.33, top + 0.2, big.z - 0.12, [3.2, 2.6, 0.6]);
  }
  K.trees.push([x0 - 0.4, 0, fz + 0.6, "palm", l.seed % 8]);
}

/** A pole sign: a steel post up to a cabinet round the layout's sign (from y0 to its top), lit trim along its top. */
function pylon(K: KW, s: Layout["signs"][number], bottom: number, trim: V3) {
  const x = s.x,
    zf = s.z - 0.03;
  const cw = s.w + 0.4;
  K.cyl("metal", x, zf - 0.33, 0.16, 0.14, 0, bottom, lin("#8a8790"), 12);
  K.box("metal", x - cw / 2, bottom, zf - 0.66, x + cw / 2, s.y + s.h / 2 + 0.25, zf, lin("#1a1820"));
  K.box("neon", x - cw / 2, s.y + s.h / 2 + 0.25, zf - 0.66, x + cw / 2, s.y + s.h / 2 + 0.33, zf, trim);
}

/** The gas station: the shop at the back, the canopy on its columns (lit underneath, the gold Z on top), two pump islands, the pylon. */
function gas(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number) {
  K.box("concrete", -w / 2, 0, -d / 2, w / 2, 0.04, d / 2, lin("#d8d4cc"), "-y");
  // the shop at the back, its door where the layout has it
  const sx0 = -w / 2 + 2.33,
    sx1 = w / 2 - 2.33,
    sz0 = -d / 2 + 0.67,
    sz1 = L.frontZ;
  const mart = L.signs.find((s) => s.text === "FUEL MART");
  K.box("plaster", sx0, 0, sz0, sx1, 4, sz1, lin("#f2eee6"), "-y");
  interior(K, 1, sx0 + 1, sx1 - 5, 0.17, 2.67, sz1 + 0.012);
  for (let x = sx0 + 1; x <= sx1 - 5 + 0.01; x += 1.17) K.box("chrome", x - 0.04, 0.17, sz1 - 0.02, x + 0.04, 2.67, sz1 + 0.05, C.chrome);
  K.box("plaster", sx0, 2.67, sz1, sx1, 4, sz1 + 0.17, lin("#1c6a8a"));
  K.box("neon", sx0, 4, sz1, sx1, 4.08, sz1 + 0.17, [3.2, 2.2, 0.4]);
  K.box("roof", sx0, 3.95, sz0, sx1, 4.05, sz1, lin("#9a968e"), "-y");
  acUnit(K, sx1 - 2, 4.05, sz0 + 1);
  void mart;
  // the ice chest and the air pump
  K.box("metal", sx1 - 4.33, 0, sz1 + 0.17, sx1 - 3, 1, sz1 + 0.83, lin("#e8f4ff"));
  K.box("metal", sx1 - 2.33, 0, sz1 + 0.33, sx1 - 1.83, 1.5, sz1 + 0.67, lin("#d8333f"));
  // the canopy (its sign the layout's, on its front)
  const zs = L.signs.find((s) => s.text !== "FUEL MART" && s.text !== "ZEC" && s.y > 4.5);
  const cz0 = sz1 + 3,
    cz1 = zs ? zs.z - 0.2 : d / 2 - 2.33;
  const cx0 = -w / 2 + 1.67,
    cx1 = w / 2 - 1.67;
  K.box("white", cx0, 5.33, cz0, cx1, 6.17, cz1, lin("#f4f4f0"));
  for (const [a, b, c, e] of [
    [cx0 - 0.02, 5.5, cz1, cx1 + 0.02],
    [cx0 - 0.02, 5.5, cz0 - 0.02, cx1 + 0.02],
  ])
    K.box("metal", a, b, c, e, 6.17, c + 0.02, lin("#1c6a8a"));
  K.box("neon", cx0, 6.17, cz0, cx1, 6.25, cz1, [3.2, 2.4, 0.5]);
  for (let x = cx0 + 0.67; x < cx1 - 1; x += 1.67) for (let z = cz0 + 0.67; z < cz1 - 1; z += 1.67) K.box("neon", x, 5.31, z, x + 1, 5.33, z + 1, [2.6, 2.7, 2.8]);
  for (const x of [cx0 + 1, cx1 - 1.33]) for (const z of [cz0 + 1, cz1 - 1.33]) K.cyl("white", x + 0.25, z + 0.25, 0.25, 0.25, 0, 5.33, lin("#ecebe6"), 14);
  // the gold Z on the roof for the helicopters
  {
    const mx = (cx0 + cx1) / 2,
      zz0 = cz0 + 1,
      zz1 = cz1 - 1;
    const gold = lin("#f4b728");
    K.box("white", mx - 2.33, 6.17, zz0, mx + 2.33, 6.19, zz0 + 0.67, gold, "-y");
    K.box("white", mx - 2.33, 6.17, zz1 - 0.67, mx + 2.33, 6.19, zz1, gold, "-y");
    const a: V3 = [mx + 2.33, 6.19, zz0 + 0.67],
      b: V3 = [mx - 2.33 + 0.9, 6.19, zz1 - 0.67];
    K.quad("white", [a[0] - 0.9, 6.19, a[2]], a, [b[0], 6.19, b[2]], [b[0] - 0.9, 6.19, b[2]], [0, 1, 0], gold);
  }
  // two islands, two pumps each
  const mid = (cz0 + cz1) / 2;
  for (const iz of [mid - 2.67, mid + 1.67]) {
    K.box("concrete", cx0 + 2.67, 0, iz, cx1 - 2.67, 0.25, iz + 1, C.coping);
    for (const px of [cx0 + 4.33, cx1 - 5]) {
      K.box("metal", px, 0.25, iz + 0.17, px + 0.67, 2, iz + 0.83, lin("#f4f2ec"));
      K.box("metal", px - 0.02, 1.5, iz + 0.15, px + 0.69, 1.83, iz + 0.85, lin("#1c6a8a"));
      for (const zz of [iz + 0.13, iz + 0.85]) K.box("neon", px + 0.12, 1.0, zz, px + 0.55, 1.33, zz + 0.02, [0.5, 2.6, 1.6]);
      K.tube("rubber", [px + 0.68, 1.4, iz + 0.5], [px + 0.9, 0.7, iz + 0.62], 0.02, C.black, 5);
    }
  }
  // the pylon
  const zec = L.signs.find((s) => s.text === "ZEC");
  if (zec) {
    pylon(K, zec, 9.33, [3.2, 2.4, 0.4]);
    for (let k = 0; k < 2; k++) K.box("neon", zec.x - 1.33, 9.67 + k * 1, zec.z - 0.06, zec.x + 1.33, 10.33 + k, zec.z - 0.02, k ? [3, 1.3, 0.5] : [0.5, 3, 1.8]);
  }
}

/** The motel: the long wing at the back and the short one on the east, two floors of rooms on a gallery, the stair, the office at the street, the pool in the court, the pole sign. */
function motel(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number) {
  const paint = lin(l.paint ?? "#f8cfa0");
  const doors = ["#1c9ad6", "#ff4fa3", "#4dbf9a", "#f4b728", "#b56bff"].map(lin);
  K.box("asphalt", -w / 2, 0, -d / 2, w / 2, 0.04, d / 2, WHITE, "-y");
  const bz0 = -d / 2 + 0.33,
    bz1 = -d / 2 + 7.67;
  const wx0 = w / 2 - 7.33,
    wx1 = w / 2 - 0.33;
  const H = 6;
  const fl = 3;
  // the wings (stucco), the roof's cornice
  K.box("plaster", -w / 2 + 0.33, 0, bz0, wx1, H, bz1, paint, "-y");
  K.box("plaster", wx0, 0, bz1, wx1, H, d / 2 - 4.33, paint, "-y");
  K.box("white", -w / 2 + 0.33, H, bz0, wx1, H + 0.33, bz1, C.trim);
  K.box("white", wx0, H, bz1, wx1, H + 0.33, d / 2 - 4.33, C.trim);
  // the rooms along the back wing, both floors: a door in its colour, a window, the AC
  let k = 0;
  for (const y of [0.17, fl + 0.17])
    for (let x = -w / 2 + 1; x + 4.33 < wx0; x += 4.67) {
      const dc = doors[k++ % doors.length];
      K.box("wood", x, y, bz1, x + 1.1, y + 2.25, bz1 + 0.05, dc, "-z");
      K.box("chrome", x + 0.85, y + 1.0, bz1 + 0.05, x + 0.95, y + 1.08, bz1 + 0.09, C.chrome);
      windowZ(K, x + 1.67, y + 0.85, bz1 + 0.04, 1.5, 1.15, r, C.frame, false);
      acUnit(K, x + 3.4, y + 0.17, bz1);
    }
  // the gallery: the slab over the ground floor's walk, its rail, its posts
  const gz = bz1 + 1.33;
  K.box("concrete", -w / 2 + 0.33, fl - 0.17, bz1, wx0, fl, gz, lin("#e8e2d6"));
  for (let x = -w / 2 + 0.4; x < wx0; x += 0.14) K.box("white", x, fl, gz - 0.06, x + 0.04, fl + 0.95, gz - 0.02, (Math.round(x / 0.14) % 3 ? tone(paint, -0.4) : C.trim) as V3);
  K.box("white", -w / 2 + 0.33, fl + 0.95, gz - 0.1, wx0, fl + 1.02, gz + 0.02, C.trim);
  for (let x = -w / 2 + 1; x < wx0; x += 4.67) K.box("white", x, 0, gz - 0.33, x + 0.25, fl, gz - 0.08, C.trim);
  // the east wing's rooms face west
  for (let z = bz1 + 1; z + 3.3 < d / 2 - 4.33; z += 4.33)
    for (const y of [0.17, fl + 0.17]) {
      K.box("wood", wx0 - 0.05, y, z, wx0, y + 2.25, z + 1.1, doors[(Math.round(z) + Math.round(y)) % doors.length]);
      K.box("glass", wx0 - 0.04, y + 0.85, z + 1.7, wx0, y + 2.0, z + 3.0, [r(), 1, 0.5]);
    }
  // the stair up at the west end
  for (let i = 0; i < 12; i++) K.box("concrete", -w / 2 + 0.67, i * 0.25, gz + i * 0.27, -w / 2 + 1.67, i * 0.25 + 0.25, gz + 0.3 + i * 0.27, lin("#c4c1ca"));
  K.tube("chrome", [-w / 2 + 1.7, 1.0, gz], [-w / 2 + 1.7, fl + 1.0, gz + 3.24], 0.025, C.chrome);
  // the office at the street end of the east wing: its glass front, its door
  K.box("plaster", wx0 + 0.67, 0, d / 2 - 4.33, wx1 - 0.33, 3.33, L.frontZ, paint, "-y");
  K.box("white", wx0 + 0.33, 3.33, d / 2 - 4.67, wx1, 3.67, L.frontZ + 0.33, tone(paint, -0.35));
  interior(K, 5, wx0 + 1.33, wx1 - 1, 0.17, 2.5, L.frontZ + 0.012);
  // the pool in the court, loungers, a parasol
  pool(K, -w / 2 + 2, bz1 + 4.33, -w / 2 + 10, bz1 + 8.33);
  for (let i = 0; i < 4; i++) lounger(K, -w / 2 + 11 + i * 1, bz1 + 5.8, lin(["#ff7fb0", "#46c8e0", "#f4b728", "#ffffff"][i]));
  umbrella(K, -w / 2 + 11.7, bz1 + 8.4, 2.2, 1.2, lin("#ff4fa3"), lin("#ffffff"));
  // the parking bays
  for (let x = -w / 2 + 11; x < wx0 - 1; x += 2.5) K.box("white", x, 0.04, bz1 + 2.33, x + 0.12, 0.05, bz1 + 6, lin("#eeeae0"), "-y");
  K.trees.push([-w / 2 + 0.67, 0, d / 2 - 1, "palm", l.seed % 8], [wx0 - 1.33, 0, d / 2 - 0.67, "palm", (l.seed + 1) % 8]);
  // the pole sign with its arrow, VACANCY under it
  const big = L.signs.find((s) => s.y > 10);
  const vac = L.signs.find((s) => s.text === "VACANCY");
  if (big) {
    pylon(K, big, 10, [3.2, 2.6, 0.6]);
    if (vac) K.box("metal", vac.x - vac.w / 2 - 0.1, vac.y - vac.h / 2 - 0.1, vac.z - 0.2, vac.x + vac.w / 2 + 0.1, vac.y + vac.h / 2 + 0.1, vac.z - 0.03, lin("#1a1820"));
    // the arrow: a bent neon tube
    const ax = big.x + 1.67,
      az = big.z + 0.02;
    for (let i = 0; i < 9; i++) K.tube("neon", [ax + i * 0.18, 8.9 - i * 0.18, az], [ax + (i + 1) * 0.18, 8.9 - (i + 1) * 0.18, az], 0.04, [3.2, 2.6, 0.6], 6);
  }
}

/** The art-deco hotels on the beach drive: a symmetrical stucco block with rounded corners, eyebrows at every floor, the fin up the middle with the name, the marquee, a terrace in front. */
function hotel(K: KW, l: KLot, L: Layout, r: () => number, w: number, d: number, club: boolean) {
  const n = club ? 2 : (l.floors ?? 3);
  const H = (20 + 16 * (n - 1)) / 6;
  const paint = lin(l.paint ?? "#a8e2cf");
  const neon = lin(l.neon ?? "#ff4fa3").map((v) => v * 2.6) as V3;
  const accent = tone(paint, -0.32);
  const light = tone(paint, 0.45);
  const fz = L.frontZ;
  const x0 = -w / 2 + 0.5,
    x1 = w / 2 - 0.5,
    z0 = -d / 2 + 0.67;
  K.box("path", -w / 2, 0, fz, w / 2, 0.05, d / 2, lin("#efe9de"), "-y");
  K.box("wood", -w / 2 + 0.33, 0.05, fz, w / 2 - 0.33, 0.2, d / 2 - 0.5, C.deck, "-y");
  const R = 1.5;
  const pts: [number, number][] = [[x0, z0], [x0, fz - R]];
  for (let i = 1; i <= 8; i++) {
    const a = Math.PI - (i / 8) * (Math.PI / 2);
    pts.push([x0 + R + Math.cos(a) * R, fz - R + Math.sin(a) * R]);
  }
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 - (i / 8) * (Math.PI / 2);
    pts.push([x1 - R + Math.cos(a) * R, fz - R + Math.sin(a) * R]);
  }
  pts.push([x1, z0]);
  const ring = pts.slice().reverse();
  const out = (k: number) => ring.map(([x, z]) => [x + Math.sign(x) * k, z > z0 + 0.01 ? z + k : z] as [number, number]);
  K.prism("plaster", ring, 0, H, paint, 0.7, true);
  K.prism("concrete", out(0.03), -0.05, 0.45, tone(paint, -0.2), 0.7, false);
  // floors: window bays either side of the fin, the eyebrows round the corners, an accent line
  const fin = 1.17;
  for (let f = 1; f < n; f++) {
    const y = (20 + 16 * (f - 1)) / 6;
    for (const [a, b] of [
      [x0 + 0.67, -fin - 0.5],
      [fin + 0.5, x1 - 0.67],
    ]) {
      const cnt = Math.max(1, Math.floor((b - a) / 2.33));
      for (let k = 0; k < cnt; k++) {
        const wx = a + ((b - a) * (k + 0.5)) / cnt - 0.75;
        windowZ(K, wx, y + 0.67, fz, 1.5, 1.5, r, light, false);
      }
    }
    K.prism("plaster", out(0.45), y + 2.33, y + 2.45, light, 0.7, true);
    K.prism("plaster", out(0.03), y + 2.5, y + 2.67, accent, 0.7, false);
  }
  // the ground floor: the lobby's glass between chrome mullions, the marquee over the door
  interior(K, club ? 4 : 5, x0 + 1.33, x1 - 1.33, 0.17, 2.5, fz + 0.012);
  for (let x = x0 + 1.33; x <= x1 - 1.33 + 0.01; x += 1) K.box("chrome", x - 0.04, 0.17, fz - 0.02, x + 0.04, 2.5, fz + 0.06, C.chrome);
  K.box("chrome", x0 + 1.17, 2.5, fz - 0.02, x1 - 1.17, 2.67, fz + 0.06, C.chrome);
  const mq = L.signs.find((s) => !s.vertical && s.y < 4);
  const mz = mq ? mq.z - 0.03 : fz + 1.5;
  K.box("plaster", L.doorX - 2, 2.67, fz, L.doorX + 2, 3.17, mz, accent);
  K.box("neon", L.doorX - 2, 2.6, mz - 0.17, L.doorX + 2, 2.67, mz, neon);
  for (const x of [L.doorX - 1.83, L.doorX + 1.67]) K.cyl("chrome", x + 0.08, mz - 0.25, 0.06, 0.06, 0, 2.67, C.chrome, 10);
  // the fin with the name (the sign: the layout's vertical one), stepped at its top, edged in neon
  const vs = L.signs.find((s) => s.vertical);
  const finTop = H + 34 / 6;
  const ff = vs ? vs.z - 0.03 : fz + 0.5;
  K.box("plaster", -fin, 2.67, fz - 1, fin, finTop, ff, light);
  for (let k = 0; k < 3; k++) K.box("plaster", -fin + 0.33 + k * 0.33, finTop + k * 0.5, fz - 0.67, fin - 0.33 - k * 0.33, finTop + 0.5 + k * 0.5, ff - 0.33, k % 2 ? accent : light);
  for (const ex of [-fin - 0.08, fin]) K.box("neon", ex, 3.0, ff - 0.17, ex + 0.08, finTop, ff, neon);
  K.box("neon", -fin, finTop - 0.08, ff, fin, finTop, ff + 0.08, neon);
  // the parapet stepping up at the corners, a neon line along it
  K.box("plaster", x0 + R, H, fz - 0.33, x1 - R, H + 0.5, fz, paint);
  K.box("neon", x0 + R, H + 0.5, fz - 0.17, x1 - R, H + 0.58, fz, neon);
  for (const ex of [x0 + 0.2, x1 - 1.53]) for (let k = 0; k < 3; k++) K.box("plaster", ex + (ex < 0 ? 0 : k * 0.33), H + 0.5 + k * 0.33, fz - 1.67 + k * 0.33, ex + 1.33 - (ex < 0 ? k * 0.33 : 0), H + 0.83 + k * 0.33, fz - 0.33, light);
  K.box("roof", x0 + 0.2, H - 0.05, z0 + 0.2, x1 - 0.2, H + 0.05, fz - 0.4, lin("#9a968e"), "-y");
  // the terrace: a low wall, tables under umbrellas, palms in pots
  for (const [a, b] of [
    [-w / 2 + 0.33, -1.17],
    [1.17, w / 2 - 0.33],
  ])
    K.box("plaster", a, 0, d / 2 - 0.5, b, 0.67, d / 2 - 0.17, paint);
  for (let k = 0; k < 2; k++) {
    const tx = k ? w / 2 - 2.67 : -w / 2 + 2.33;
    const tz = fz + 2;
    K.cyl("chrome", tx, tz, 0.04, 0.04, 0.2, 0.92, C.chrome, 8);
    K.cyl("white", tx, tz, 0.4, 0.4, 0.92, 0.96, C.trim, 16);
    umbrella(K, tx, tz, 2.5, 1.2, k ? light : C.trim, k ? C.trim : lin(l.neon ?? "#ff4fa3"));
  }
  for (const px of [-w / 2 + 0.67, w / 2 - 0.83]) {
    K.cyl("concrete", px, d / 2 - 0.83, 0.35, 0.3, 0.2, 0.85, lin("#d8d0c0"), 14);
    K.trees.push([px, 0.85, d / 2 - 0.83, "palm", (l.seed + Math.round(px)) & 7]);
  }
  // the club: a rooftop bar under umbrellas, its neon
  if (club) {
    K.box("wood", x0 + 0.3, H + 0.05, z0 + 0.3, x1 - 0.3, H + 0.2, fz - 1.8, C.deck);
    for (let k = 0; k < 3; k++) umbrella(K, x0 + 2.33 + k * 4, z0 + 4.5, H + 2.4, 1.2, C.trim, lin("#4dffb8"));
    K.box("wood", x0 + 1.33, H + 0.2, z0 + 7.67, x1 - 1.33, H + 1.33, z0 + 8.67, lin("#2a2630"));
    K.box("neon", x0 + 1.33, H + 1.33, z0 + 7.67, x1 - 1.33, H + 1.42, z0 + 8.67, [0.6, 3, 1.9]);
  } else acUnit(K, x0 + 1.5, H, z0 + 1);
}

/** A lit interior seen through glass: the shop atlas's cell on a plane facing +z at z. */
function interior(K: KW, cell: number, x0: number, x1: number, y0: number, y1: number, z: number, back = false) {
  const cu0 = (cell % 4) / 4,
    row = Math.floor(cell / 4);
  const vb = row === 0 ? 0.5 : 0;
  K.quad("shop", [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, back ? -1 : 1], WHITE, (p) => [cu0 + ((back ? x1 - p[0] : p[0] - x0) / (x1 - x0)) * 0.25, vb + ((p[1] - y0) / (y1 - y0)) * 0.5]);
}

// ---- the beach, the park, the bluff ---------------------------------------------------------------------

const CLOTH = ["#ff7fb0", "#46c8e0", "#f4b728", "#ff8a3a", "#4dffb8", "#ffffff", "#e8403a", "#3a6ad8"].map(lin);

/** An umbrella and its two loungers (model x ±1.67 m, their foot toward +z; the game puts people on them). */
export function kBeachSet(seed: number): KW {
  const K = new KW();
  const r = rng(seed + 1);
  const a = CLOTH[Math.floor(r() * CLOTH.length)],
    b = CLOTH[Math.floor(r() * CLOTH.length)];
  umbrella(K, 0, -0.5, 2.2, 1.55, a, b === a ? lin("#ffffff") : b);
  lounger(K, -1.67, -0.67, b);
  lounger(K, 1.67, -0.67, a);
  if (r() > 0.5) K.box("cloth", -1, 0.01, 2, 1, 0.025, 3, CLOTH[Math.floor(r() * CLOTH.length)]);
  return K;
}
/** A towel on the sand (its long side along z, as the people lie on it), in two-colour stripes, a bag beside it now and then. */
export function kTowel(seed: number): KW {
  const K = new KW();
  const r = rng(seed + 4);
  const a = CLOTH[Math.floor(r() * CLOTH.length)],
    b = r() > 0.5 ? lin("#ffffff") : CLOTH[Math.floor(r() * CLOTH.length)];
  for (let i = 0; i < 6; i++) K.box("cloth", -0.5, 0.005, -1 + i * 0.333, 0.5, 0.02, -0.667 + i * 0.333, i % 2 ? a : b, "-y");
  if (r() < 0.5) K.box("cloth", 0.55, 0.0, -0.75, 0.85, 0.2, -0.3, lin(["#2a2a30", "#c8664a", "#f6efe2"][Math.floor(r() * 3)]));
  return K;
}
/** A sandcastle: towers, walls, a moat. */
export function kSandcastle(seed: number): KW {
  const K = new KW();
  const r = rng(seed + 8);
  const sand = lin("#e8d2a0");
  K.cyl("sand", 0, 0, 0.5, 0.42, 0, 0.32, sand, 18);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    K.cyl("sand", Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.14, 0.12, 0, 0.5 + r() * 0.12, sand, 12);
    K.cyl("sand", Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.12, 0.0, 0.5, 0.68, sand, 12);
  }
  K.cyl("sand", 0, 0, 0.22, 0.18, 0.32, 0.72, sand, 14);
  K.cyl("sand", 0, 0, 0.18, 0.0, 0.72, 0.95, sand, 14);
  // a bucket and spade
  K.cyl("white", 0.9, 0.3, 0.09, 0.12, 0, 0.2, CLOTH[Math.floor(r() * 3)], 12, true);
  return K;
}
/** A lifeguard tower in its colours: stilts, the hut with its windows, the ramp, the roof, the flag. */
export function kLifeguard(seed: number): KW {
  const K = new KW();
  const r = rng(seed + 5);
  const hut = [lin("#46c8e0"), lin("#ff7fb0"), lin("#f4b728"), lin("#4dbf9a"), lin("#ff8a3a")][Math.floor(r() * 5)];
  for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) K.box("wood", x - 0.08, 0, z - 0.08, x + 0.08, 2.1, z + 0.08, lin("#e8e4dc"));
  K.box("wood", -1.5, 2.1, -1.4, 1.5, 2.25, 1.6, C.deck);
  K.box("plaster", -1.2, 2.25, -1.2, 1.2, 4.2, 1.0, hut);
  K.box("glass", -1.0, 3.1, 1.0, 1.0, 3.9, 1.04, [0.1, 0, 0.6], "-z-x+x-y+y");
  for (const s of [-1, 1]) K.box("glass", s * 1.2 - 0.02, 3.1, -0.8, s * 1.2 + 0.02, 3.9, 0.6, [0.1, 0, 0.6]);
  K.box("white", -1.35, 4.2, -1.35, 1.35, 4.32, 1.2, C.trim);
  K.quad("white", [-1.4, 4.32, 1.2], [1.4, 4.32, 1.2], [1.4, 4.6, -1.4], [-1.4, 4.6, -1.4], null, lin("#f4f2ec"));
  // the ramp down to the sand at the front, rails
  K.quad("wood", [-0.5, 2.18, 1.6], [0.5, 2.18, 1.6], [0.5, 0.02, 4.4], [-0.5, 0.02, 4.4], null, C.deck);
  for (const s of [-1, 1]) K.tube("white", [s * 0.5, 3.0, 1.6], [s * 0.5, 0.9, 4.4], 0.03, C.trim);
  K.box("white", -0.7, 2.8, 1.02, 0.7, 3.0, 1.05, lin("#d8333f"));
  K.cyl("white", 1.3, -1.3, 0.03, 0.03, 4.2, 6.0, C.trim, 6);
  K.quad("cloth", [1.33, 5.95, -1.3], [2.1, 5.85, -1.3], [2.1, 5.35, -1.3], [1.33, 5.45, -1.3], [0, 0, 1], lin("#d8333f"));
  K.quad("cloth", [2.1, 5.85, -1.3], [1.33, 5.95, -1.3], [1.33, 5.45, -1.3], [2.1, 5.35, -1.3], [0, 0, -1], lin("#d8333f"));
  return K;
}
/** The volleyball net across x (10 m between its posts), the court's ropes. */
export function kVolleyNet(): KW {
  const K = new KW();
  for (const x of [-4.9, 4.9]) K.cyl("white", x, 0, 0.06, 0.06, -0.3, 2.6, C.trim, 10);
  // the net: a mesh of thin cords (10 cm squares), a white band along its top
  for (let y = 1.6; y <= 2.39; y += 0.1) K.box("rubber", -4.85, y, -0.006, 4.85, y + 0.012, 0.006, lin("#202024"));
  for (let x = -4.85; x <= 4.85; x += 0.1) K.box("rubber", x, 1.6, -0.006, x + 0.012, 2.4, 0.006, lin("#202024"), "-y+y");
  K.box("white", -4.85, 2.38, -0.025, 4.85, 2.45, 0.025, C.trim);
  for (const z of [-8, 8]) K.box("white", -4.5, 0.02, z - 0.03, 4.5, 0.04, z + 0.03, lin("#3a6ad8"), "-y");
  for (const x of [-4.5, 4.5]) K.box("white", x - 0.03, 0.02, -8, x + 0.03, 0.04, 8, lin("#3a6ad8"), "-y");
  return K;
}
/** The beach bar: a palapa (a thatched cone on poles) over a square bar with counters all round, stools, shelves of bottles. */
export function kBeachBar(): KW {
  const K = new KW();
  K.box("wood", -5, 0, -3.4, 5, 0.25, 3.4, C.deck, "-y");
  for (const x of [-4.4, 4.4]) for (const z of [-2.8, 2.8]) K.cyl("wood", x, z, 0.14, 0.12, 0.25, 3.8, lin("#8a6a48"), 10);
  // the counter ring and its top
  for (const [x0, z0, x1, z1] of [
    [-3, -2, 3, -1.6],
    [-3, 1.6, 3, 2],
    [-3, -1.6, -2.6, 1.6],
    [2.6, -1.6, 3, 1.6],
  ] as const) {
    K.box("wood", x0, 0.25, z0, x1, 1.15, z1, lin("#9a7454"));
    K.box("wood", x0 - 0.15, 1.15, z0 - 0.15, x1 + 0.15, 1.22, z1 + 0.15, lin("#c8a27c"));
  }
  // shelves of bottles in the middle, a neon line under the eaves
  K.box("wood", -1.5, 0.25, -0.3, 1.5, 2.2, 0.3, lin("#6a4a34"));
  for (let i = 0; i < 18; i++) K.cyl("glass", -1.35 + (i % 9) * 0.33, i < 9 ? -0.34 : 0.34, 0.05, 0.03, 1.25 + Math.floor(i / 9) * 0.5, 1.6 + Math.floor(i / 9) * 0.5, [0.3, 1, 1], 8);
  for (const [x, z] of [
    [-2, -2.8],
    [0, -2.8],
    [2, -2.8],
    [-2, 2.8],
    [0, 2.8],
    [2, 2.8],
  ]) {
    K.cyl("chrome", x, z, 0.03, 0.03, 0.25, 0.95, C.chrome, 6);
    K.cyl("cloth", x, z, 0.2, 0.2, 0.95, 1.02, lin("#d8333f"), 12);
  }
  // the sign's board under the eaves (the layout's sign on it)
  K.box("wood", -2.6, 3.3, 0.85, 2.6, 3.86, 1.0, lin("#1a1820"));
  for (const x of [-2.2, 2.2]) K.box("wood", x - 0.04, 3.86, 0.88, x + 0.04, 4.6, 0.96, lin("#6a4a34"));
  // the thatch: a low cone in two layers, ragged at the edge
  K.lathe("thatch", 0, 0, [[0.2, 5.8], [3.6, 4.2], [6.2, 3.3], [6.3, 3.15]], 20, () => lin("#c9a35a"));
  K.lathe("thatch", 0, 0, [[6.2, 3.18], [0.3, 5.6]], 20, () => lin("#a8864a"));
  return K;
}
/** The pier along z (len m), its deck at deckY over the sea floor at floorY: piles, planks, rails, lamps, the bait shack at its end. */
export function kPier(len: number, half: number, deckY: number, floorY: number): KW {
  const K = new KW();
  const dy = deckY - floorY;
  const z0 = -len / 2,
    z1 = len / 2;
  for (let z = z0 + 0.3; z < z1; z += 3) for (const x of [-half + 0.25, half - 0.25]) K.cyl("wood", x, z, 0.18, 0.16, 0, dy, lin("#5a4634"), 10);
  for (let z = z0 + 0.3; z < z1; z += 3) K.box("wood", -half, dy - 0.45, z - 0.12, half, dy - 0.25, z + 0.12, lin("#6a5440"));
  K.box("wood", -half, dy - 0.25, z0, half, dy, z1, lin("#b8906a"), "", (n) => (n[1] !== 0 ? (p) => [p[0] / 0.2, p[2] / 1.5] : (p) => [p[2] / 1.5, p[1] / 1.5]));
  for (let z = z0; z < z1; z += 1.6) for (const x of [-half + 0.05, half - 0.15]) K.box("white", x, dy, z, x + 0.1, dy + 1.05, z + 0.1, C.trim);
  for (const x of [-half + 0.05, half - 0.15]) K.box("white", x - 0.02, dy + 1.05, z0, x + 0.12, dy + 1.15, z1, C.trim);
  for (let z = z0 + 5; z < z1 - 7; z += 10)
    for (const x of [-half + 0.1, half - 0.1]) {
      K.cyl("white", x, z, 0.06, 0.05, dy, dy + 3.2, lin("#e8e4dc"), 8);
      K.box("neon", x - 0.15, dy + 3.2, z - 0.15, x + 0.15, dy + 3.35, z + 0.15, [3, 2.6, 2]);
    }
  // the bait shack at the end
  const sz = z1 - 6.67;
  K.box("wood", -half + 0.4, dy, sz, half - 0.4, dy + 3.33, z1 - 0.6, lin("#46c8e0"), "-y");
  interior(K, 7, -half + 1, half - 1, dy + 0.2, dy + 2.3, sz - 0.01, true);
  K.hip("tile", -half + 0.4, sz, half - 0.4, z1 - 0.6, dy + 3.33, 1.0, 0.35, lin("#f6efe2"));
  return K;
}
/** A rock on the bluff (weathered stone, its own shape by the seed). */
export function kRock(seed: number): KW {
  const K = new KW();
  const r = rng(seed + 31);
  const sx = 1.1 + r() * 0.9,
    sy = 0.7 + r() * 0.6,
    sz = 1.0 + r() * 0.8;
  // an icosphere-ish blob: two rings and two poles, jittered
  const ring = (y: number, rad: number, n: number, off: number): [number, number, number][] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + off;
    const j = 0.8 + r() * 0.35;
    return [Math.cos(a) * rad * sx * j, y * sy, Math.sin(a) * rad * sz * j];
  });
  const top: V3 = [0, sy * 1.05, 0],
    bot: V3 = [0, -0.2, 0];
  const a = ring(0.55, 0.75, 7, 0),
    b = ring(0.0, 1.0, 7, 0.45);
  const col = lin(["#8a8078", "#9a9088", "#7a7068"][Math.floor(r() * 3)]);
  for (let i = 0; i < 7; i++) {
    const j = (i + 1) % 7;
    K.tri("rock", top, a[j], a[i], null, col);
    K.quad("rock", a[i], a[j], b[j], b[i], null, col);
    K.tri("rock", b[i], b[j], bot, null, col);
  }
  return K;
}

// ---- Sapling Park, the letters on the bluff, the tunnel ---------------------------------------------------

/** Sapling Park (w × d m, centred, front +z): lawns, paths crossing at a fountain, a basketball court, a playground, benches. */
export function kPark(w: number, d: number): KW {
  const K = new KW();
  K.box("lawn", -w / 2, 0, -d / 2, w / 2, 0.06, d / 2, WHITE, "-y");
  K.box("path", -0.85, 0.06, -d / 2, 0.85, 0.08, d / 2, WHITE, "-y");
  K.box("path", -w / 2, 0.06, -0.85, w / 2, 0.08, 0.85, WHITE, "-y");
  K.cyl("path", 0, 0, 2.4, 2.4, 0.06, 0.081, WHITE, 40);
  // the fountain: a stone basin, water, a column, a bowl, its spout
  K.lathe("concrete", 0, 0, [[1.5, 0.08], [1.55, 0.55], [1.42, 0.6], [1.36, 0.2]], 40, () => C.coping);
  K.cyl("water", 0, 0, 1.37, 1.37, 0.08, 0.42, WHITE, 40, true);
  K.cyl("concrete", 0, 0, 0.3, 0.24, 0.4, 1.55, C.coping, 16);
  K.lathe("concrete", 0, 0, [[0.2, 1.5], [0.7, 1.62], [0.68, 1.72], [0.1, 1.66]], 28, () => C.coping);
  K.cyl("water", 0, 0, 0.62, 0.62, 1.6, 1.7, WHITE, 28);
  K.cyl("neon", 0, 0, 0.05, 0.03, 1.7, 2.3, [1.6, 2.4, 2.6], 10);
  // the court (north-west quarter): its surface, lines, the chain-link fence, two hoops
  const c0x = -w / 2 + 1.3,
    c1x = -1.7,
    c0z = -d / 2 + 1.3,
    c1z = -1.7;
  K.box("court", c0x, 0.06, c0z, c1x, 0.09, c1z, lin("#c8643a"), "-y");
  K.box("court", c0x + 0.5, 0.09, c0z + 0.5, c1x - 0.5, 0.095, c1z - 0.5, lin("#3a7ac8"), "-y");
  const line = lin("#f2f0ea");
  for (const [a, b, e, f] of [
    [c0x + 0.5, c0z + 0.5, c0x + 0.56, c1z - 0.5],
    [c1x - 0.56, c0z + 0.5, c1x - 0.5, c1z - 0.5],
    [c0x + 0.5, c0z + 0.5, c1x - 0.5, c0z + 0.56],
    [c0x + 0.5, c1z - 0.56, c1x - 0.5, c1z - 0.5],
    [c0x + 0.5, (c0z + c1z) / 2 - 0.03, c1x - 0.5, (c0z + c1z) / 2 + 0.03],
  ])
    K.box("white", a, 0.095, b, e, 0.1, f, line, "-y");
  const hx = (c0x + c1x) / 2;
  for (const [z, sgn] of [
    [c0z + 0.25, 1],
    [c1z - 0.25, -1],
  ] as const) {
    K.cyl("metal", hx, z, 0.06, 0.06, 0, 3.2, lin("#3a3742"), 10);
    K.box("white", hx - 0.9, 2.9, z + sgn * 0.2 - 0.03, hx + 0.9, 3.95, z + sgn * 0.2 + 0.03, C.trim);
    K.box("metal", hx - 0.04, 2.9, z, hx + 0.04, 3.05, z + sgn * 0.25, lin("#3a3742"));
    // the rim, a ring of tubes
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2,
        a1 = ((i + 1) / 12) * Math.PI * 2;
      const cz = z + sgn * 0.48;
      K.tube("metal", [hx + Math.cos(a0) * 0.23, 3.05, cz + Math.sin(a0) * 0.23], [hx + Math.cos(a1) * 0.23, 3.05, cz + Math.sin(a1) * 0.23], 0.012, lin("#ff6a2a"), 5);
    }
  }
  // chain-link along the court's long sides (posts, a top rail, the mesh as a dark see-through-ish band)
  for (const z of [c0z, c1z]) {
    for (let x = c0x; x <= c1x + 0.01; x += 2.5) K.cyl("chrome", x, z, 0.04, 0.04, 0, 2.4, lin("#9a9aa6"), 8);
    K.xcyl("chrome", c0x, c1x, 2.4, z, 0.03, lin("#9a9aa6"));
  }
  // the playground (south-east quarter) on sand: a slide, swings, a climbing frame
  const p0x = 1.7,
    p0z = 1.7,
    p1x = w / 2 - 1.3,
    p1z = d / 2 - 1.3;
  K.box("sand", p0x, 0.06, p0z, p1x, 0.1, p1z, lin("#efdcb2"), "-y");
  const sx = p0x + 1.6,
    sz = p0z + 1.6;
  for (const [dx, dz] of [
    [0, 0],
    [1.2, 0],
    [0, 1.2],
    [1.2, 1.2],
  ])
    K.cyl("metal", sx + dx, sz + dz, 0.05, 0.05, 0, 2.4, lin("#f4b728"), 10);
  K.box("wood", sx - 0.05, 1.5, sz - 0.05, sx + 1.25, 1.6, sz + 1.25, C.deck);
  K.quad("metal", [sx + 0.05, 1.6, sz + 1.25], [sx + 1.15, 1.6, sz + 1.25], [sx + 1.15, 0.15, sz + 3.6], [sx + 0.05, 0.15, sz + 3.6], null, lin("#ff4fa3"));
  for (const x of [sx + 0.05, sx + 1.15]) K.tube("metal", [x, 1.9, sz + 1.25], [x, 0.45, sz + 3.6], 0.025, lin("#ff4fa3"));
  const wx0 = sx + 4,
    wx1 = Math.min(p1x - 0.5, wx0 + 3.5);
  for (const x of [wx0, wx1]) {
    K.tube("metal", [x - 0.6, 0, p0z + 1.3], [x, 2.6, p0z + 1.45], 0.04, lin("#46c8e0"));
    K.tube("metal", [x + 0.0, 2.6, p0z + 1.45], [x + 0.0, 0, p0z + 1.6], 0.04, lin("#46c8e0"));
  }
  K.xcyl("metal", wx0, wx1, 2.6, p0z + 1.45, 0.05, lin("#46c8e0"));
  for (const x of [wx0 + 1, wx1 - 1]) {
    for (const dx of [-0.2, 0.2]) K.tube("chrome", [x + dx, 2.58, p0z + 1.45], [x + dx, 0.55, p0z + 1.45], 0.008, C.chrome, 4);
    K.box("rubber", x - 0.25, 0.5, p0z + 1.32, x + 0.25, 0.56, p0z + 1.58, C.black);
  }
  // benches round the fountain
  for (const [x, z, a] of [
    [-3.8, -1.6, 0],
    [3.8, -1.6, 0],
    [-3.8, 1.6, Math.PI],
    [3.8, 1.6, Math.PI],
  ] as const) {
    K.rbox("wood", x, 0.42, z, 1.8, 0.05, 0.45, a, C.deck);
    K.rbox("wood", x, 0.5, z - Math.cos(a) * 0.22, 1.8, 0.4, 0.05, a, C.deck);
    for (const dx of [-0.75, 0.75]) K.rbox("metal", x + dx, 0, z, 0.06, 0.42, 0.45, a, lin("#2a2a30"));
  }
  // the palms in the lawns
  let sd = 1;
  for (const [x, z] of [
    [3.3, -d / 2 + 2],
    [w / 2 - 2.3, -d / 2 + 5],
    [5.6, -3],
    [-w / 2 + 2.3, 3.3],
    [-w / 2 + 5, d / 2 - 2.3],
    [-4, d / 2 - 3.3],
    [w / 2 - 1.7, 0.7],
  ])
    K.trees.push([x, 0.06, z, "palm", 300 + sd++]);
  return K;
}

/** A letter's strokes on a 5 × 7 grid (x right, y up): polylines. */
function glyph(ch: string): [number, number][][] {
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): [number, number][] => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
  const D = Math.PI / 180;
  switch (ch) {
    case "O":
      return [arc(2.5, 3.5, 2.0, 3.0, 0, 360 * D, 24)];
    case "R":
      return [[[0.6, 0], [0.6, 6.5]], [[0.6, 6.5], [2.7, 6.5], ...arc(2.7, 5.05, 1.6, 1.45, 90 * D, -90 * D, 10), [0.6, 3.6]], [[2.4, 3.6], [4.5, 0]]];
    case "C":
      return [arc(2.7, 3.5, 2.1, 3.0, 50 * D, 310 * D, 20)];
    case "H":
      return [[[0.6, 0], [0.6, 7]], [[4.4, 0], [4.4, 7]], [[0.6, 3.6], [4.4, 3.6]]];
    case "A":
      return [[[0.4, 0], [2.5, 7]], [[2.5, 7], [4.6, 0]], [[1.25, 2.6], [3.75, 2.6]]];
    case "D":
      return [[[0.6, 0], [0.6, 6.55]], [[0.6, 6.55], [2.1, 6.55], ...arc(2.1, 3.5, 2.3, 3.05, 90 * D, -90 * D, 14), [0.6, 0.45]]];
    case "K":
      return [[[0.6, 0], [0.6, 7]], [[4.4, 7], [0.7, 3.0]], [[1.9, 4.2], [4.6, 0]]];
    case "E":
      return [[[4.4, 6.55], [0.6, 6.55], [0.6, 0.45], [4.4, 0.45]], [[0.6, 3.6], [3.6, 3.6]]];
    case "Y":
      return [[[0.3, 7], [2.5, 3.4]], [[4.7, 7], [2.5, 3.4]], [[2.5, 3.4], [2.5, 0]]];
    case "S":
      return [[...arc(2.5, 5.2, 1.9, 1.35, 20 * D, 270 * D, 14), ...arc(2.5, 1.8, 1.9, 1.35, 90 * D, -160 * D, 14)]];
  }
  return [];
}

/**
 * A letter of the sign on the bluff (as the voxel one: a 5 × 7 grid of px voxels, on legs, front
 * +z): white sheet-metal strokes with round joints, a steel frame behind on stilts down to the slope,
 * a row of lamps at its foot.
 */
export function kLetter(ch: string, px: number, legs: number): KW {
  const K = new KW();
  const u = (px * VOX_M) as number,
    y0 = legs * VOX_M,
    W = 5 * u;
  const t = 0.42 * u;
  const zf = 0.5,
    zb = 0.38;
  const white = lin("#f4f2ec");
  const P = (p: [number, number]): [number, number] => [-W / 2 + p[0] * u, y0 + p[1] * u];
  for (const line of glyph(ch)) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = P(line[i - 1]),
        [bx, by] = P(line[i]);
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-4) continue;
      const nx = (-(by - ay) / l) * (t / 2),
        ny = ((bx - ax) / l) * (t / 2);
      const a1: V3 = [ax + nx, ay + ny, zf],
        a2: V3 = [ax - nx, ay - ny, zf],
        b1: V3 = [bx + nx, by + ny, zf],
        b2: V3 = [bx - nx, by - ny, zf];
      const back = (v: V3): V3 => [v[0], v[1], zb];
      K.quad("white", a2, b2, b1, a1, [0, 0, 1], white);
      K.quad("white", back(a1), back(b1), back(b2), back(a2), [0, 0, -1], lin("#c8c4bc"));
      K.quad("white", a1, b1, back(b1), back(a1), null, white);
      K.quad("white", back(a2), back(b2), b2, a2, null, white);
    }
    // round joints and ends
    for (const p of line) {
      const [x, y] = P(p);
      for (let k = 0; k < 10; k++) {
        const a0 = (k / 10) * Math.PI * 2,
          a1 = ((k + 1) / 10) * Math.PI * 2;
        const r = t / 2;
        K.tri("white", [x, y, zf + 0.001], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, zf + 0.001], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, zf + 0.001], [0, 0, 1], white);
        K.quad("white", [x + Math.cos(a0) * r, y + Math.sin(a0) * r, zf], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, zf], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, zb], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, zb], [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0], white);
      }
    }
  }
  // the frame: posts behind (down to the ground), back stilts, braces, a rail of lamps at the foot
  const steel = lin("#7a7880");
  const H = y0 + 7 * u;
  for (let c = 0; c < 3; c++) {
    const x = -W / 2 + (0.8 + c * 1.7) * u;
    K.box("metal", x - 0.05, 0, 0.26, x + 0.05, H - 0.3, 0.36, steel);
    K.box("metal", x - 0.05, 0, -0.62, x + 0.05, y0 + 3 * u, -0.52, steel);
    for (let y = 0.6; y < y0 + 3 * u; y += 1.1) K.tube("metal", [x, y, -0.55], [x, y + 0.9, 0.3], 0.025, steel, 5);
  }
  K.box("metal", -W / 2, y0 - 0.35, 0.3, W / 2, y0 - 0.25, 0.7, steel);
  for (let x = -W / 2 + 0.3; x < W / 2; x += u) {
    K.box("metal", x - 0.07, y0 - 0.25, 0.55, x + 0.07, y0 - 0.12, 0.75, lin("#2a2a30"));
    K.box("neon", x - 0.05, y0 - 0.13, 0.62, x + 0.05, y0 - 0.1, 0.72, [3.2, 3.0, 2.6]);
  }
  return K;
}
const VOX_M = 1 / 6;

/**
 * The Orchard Tunnel (len along z, centred; inside half width and ceiling in m; its floor at y 0, the
 * road's): a concrete shell 4 m thick, tiled walls with a dark plinth, raised walkways with their
 * rails (0.35 m: the walker's), the asphalt and its lines, a strip of lights down the ceiling and two
 * dimmer lines, jet fans, the portals' headwalls and cornices — and round the south one, the rainbow
 * in painted bands.
 */
export function kTunnel(len: number, half: number, top: number): KW {
  const K = new KW();
  const z0 = -len / 2,
    z1 = len / 2;
  const S = 4,
    H = top + 4;
  const conc = lin("#b8b3aa"),
    tile = lin("#ece7dc"),
    dark = lin("#3a3742");
  // the shell: sides, the roof slab (the portals' faces are the headwalls below)
  K.box("concrete", -half - S, -0.2, z0, -half, H, z1, conc, "+x");
  K.box("concrete", half, -0.2, z0, half + S, H, z1, conc, "-x");
  K.box("concrete", -half, top, z0, half, H, z1, conc, "-y");
  // the floor: asphalt between the walkways, its edge lines and the broken centre line
  K.box("asphalt", -half + 0.83, -0.2, z0, half - 0.83, 0.02, z1, WHITE, "-y");
  for (const x of [-half + 1.1, half - 1.22]) K.box("white", x, 0.02, z0, x + 0.12, 0.026, z1, lin("#e8e6e0"), "-y");
  // (two lanes each way, the traffic's at ±1.5 and ±3.9 m: a double yellow down the middle, no
  // overtaking in the bore, and the lanes' broken white lines at ±2.7 m)
  for (const x of [-0.2, 0.08]) K.box("white", x, 0.02, z0, x + 0.12, 0.026, z1, lin("#f2c230"), "-y");
  for (const x of [-2.76, 2.64]) for (let z = z0 + 1; z < z1 - 3; z += 6) K.box("white", x, 0.02, z, x + 0.12, 0.026, z + 3, lin("#e8e6e0"), "-y");
  // tiled walls (their plinth dark), the ceiling's underside
  for (const sgn of [-1, 1]) {
    const x = sgn * half;
    const n: V3 = [-sgn, 0, 0];
    K.quad("tiles", [x, 0.6, z0], [x, 0.6, z1], [x, top, z1], [x, top, z0], n, tile, (p) => [p[2] / 1.6, p[1] / 1.6]);
    K.quad("white", [x, -0.2, z0], [x, -0.2, z1], [x, 0.6, z1], [x, 0.6, z0], n, dark);
    // the walkway and its rail
    const wx0 = sgn > 0 ? half - 0.83 : -half,
      wx1 = sgn > 0 ? half : -half + 0.83;
    K.box("concrete", wx0, -0.2, z0, wx1, 0.353, z1, lin("#c9c5bd"), "-y");
    const rx = sgn > 0 ? wx0 + 0.06 : wx1 - 0.06;
    for (let z = z0 + 0.4; z < z1; z += 1.35) K.cyl("chrome", rx, z, 0.025, 0.025, 0.353, 1.35, C.chrome, 6, true);
    K.zcyl("chrome", z0, z1, rx, 1.35, 0.03, C.chrome);
    K.zcyl("chrome", z0, z1, rx, 0.85, 0.02, C.chrome);
  }
  K.quad("concrete", [-half, top, z0], [half, top, z0], [half, top, z1], [-half, top, z1], [0, -1, 0], lin("#8a867e"));
  // the lights: a strip down the middle, two dimmer lines, the jet fans in pairs
  for (let z = z0 + 0.5; z < z1 - 1; z += 1.67) K.box("neon", -0.5, top - 0.08, z, 0.5, top, z + 1.0, [2.6, 2.2, 1.6]);
  for (const sgn of [-1, 1]) for (let z = z0 + 1.3; z < z1 - 0.5; z += 2) K.box("neon", sgn * (half - 1) - 0.17, top - 0.06, z, sgn * (half - 1) + 0.17, top, z + 0.5, [1.4, 1.9, 2.4]);
  for (let z = z0 + 6.7; z < z1 - 3.3; z += 11.7)
    for (const sgn of [-1, 1]) {
      const x = sgn * 2;
      K.zcyl("metal", z, z + 1.67, x, top - 0.65, 0.5, lin("#5a5864"), 14);
      K.zcyl("rubber", z - 0.01, z + 1.68, x, top - 0.65, 0.42, C.black, 14);
      K.box("metal", x - 0.05, top - 0.2, z + 0.6, x + 0.05, top, z + 1.0, lin("#5a5864"));
    }
  // the portals: headwalls (the frame round the opening), cornices, and the rainbow round the south one
  for (const [z, sgn] of [
    [z0, -1],
    [z1, 1],
  ] as const) {
    const n: V3 = [0, 0, sgn];
    const face = lin("#8a857c");
    K.quad("concrete", [-half - S, -0.2, z], [-half, -0.2, z], [-half, H, z], [-half - S, H, z], n, face);
    K.quad("concrete", [half, -0.2, z], [half + S, -0.2, z], [half + S, H, z], [half, H, z], n, face);
    K.quad("concrete", [-half, top, z], [half, top, z], [half, H, z], [-half, H, z], n, face);
    K.box("concrete", -half - S + 0.3, H - 0.5, sgn > 0 ? z : z - 0.5, half + S - 0.3, H, sgn > 0 ? z + 0.5 : z, lin("#7a766e"));
    K.box("concrete", -half - 0.3, top, sgn > 0 ? z : z - 0.2, half + 0.3, top + 0.3, sgn > 0 ? z + 0.2 : z, lin("#9a958c"));
  }
  {
    // (round the south opening: six bands, rounded at the top corners (r 1.67 m), painted on the headwall)
    const bands = ["#8a4ae8", "#3a8ae8", "#4dbf5a", "#f4d23a", "#f4893a", "#e8403a"].map(lin);
    const rr = 1.67;
    const z = z1 + 0.012;
    for (let k = 0; k < bands.length; k++) {
      const a = 0.5 + k * 0.5,
        b = a + 0.5;
      const path = (off: number): [number, number][] => {
        const pts: [number, number][] = [[-half - off, 0]];
        for (let i = 0; i <= 8; i++) {
          const ang = Math.PI - (i / 8) * (Math.PI / 2);
          pts.push([-half + rr + Math.cos(ang) * (rr + off), top - rr + Math.sin(ang) * (rr + off)]);
        }
        for (let i = 0; i <= 8; i++) {
          const ang = Math.PI / 2 - (i / 8) * (Math.PI / 2);
          pts.push([half - rr + Math.cos(ang) * (rr + off), top - rr + Math.sin(ang) * (rr + off)]);
        }
        pts.push([half + off, 0]);
        return pts;
      };
      const ia = path(a),
        ib = path(b);
      for (let i = 1; i < ia.length; i++) K.quad("white", [ia[i - 1][0], ia[i - 1][1], z], [ia[i][0], ia[i][1], z], [ib[i][0], ib[i][1], z], [ib[i - 1][0], ib[i - 1][1], z], [0, 0, 1], bands[k]);
    }
  }
  return K;
}
