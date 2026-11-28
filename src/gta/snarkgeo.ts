import * as THREE from "three";
import { MAT, slotUV } from "./snarkmat";

/**
 * The realistic zkSNARK's shapes (src/gta): a sculpted hood shaped to each one's picture, its torso
 * in a hoodie (kangaroo pocket, drawstrings, collar, ribbed hem), and the limbs every figure shares —
 * tapered sleeves with ribbed cuffs, mitten hands with a thumb, jeans with a rolled hem, two-tone
 * sneakers with soles, laces and a side stripe. All in the attribute layout of snarkmat.ts.
 */

export class GeoB {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  fab: number[] = [];
  mix: number[] = [];
  idx: number[] = [];
  get n() {
    return this.pos.length / 3;
  }
  uv2: number[] = [];
  /** Occlusion for the next vertices (1: open to the sky). */
  ao = 1;
  /**
   * The picture's second reading for the next vertices (the far side of a head or a torso, out of
   * the picture's sight: the near side's art, mirrored) and how much of it shows (0…1).
   */
  u2 = 0;
  w2 = 0;
  mirror = 0;
  v(x: number, y: number, z: number, c: THREE.Color, mat: number, art = 0, u = 0, w = 0, fu = 0, fv = 0) {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, w);
    this.uv2.push(this.mirror > 0 ? this.u2 : u, this.mirror > 0 ? this.w2 : w);
    this.fab.push(fu, fv);
    this.mix.push(art, mat, this.ao, this.mirror);
    return this.n - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }
  /**
   * Rings of `seg + 1` vertices (indices from `start`), each joined to the next: a tube's skin. Wound
   * out for rings going down (y falling) with the angle turning as the builders turn it; `flip` the
   * other way.
   */
  rings(start: number, nRings: number, seg: number, flip = false) {
    const cols = seg + 1;
    for (let r = 0; r < nRings - 1; r++)
      for (let s = 0; s < seg; s++) {
        const a = start + r * cols + s,
          b = start + r * cols + s + 1,
          c = start + (r + 1) * cols + s + 1,
          d = start + (r + 1) * cols + s;
        if (flip) this.quad(a, b, c, d);
        else this.quad(a, d, c, b);
      }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aFab", new THREE.Float32BufferAttribute(this.fab, 2));
    g.setAttribute("aUv2", new THREE.Float32BufferAttribute(this.uv2, 2));
    g.setAttribute("aMix", new THREE.Float32BufferAttribute(this.mix, 4));
    g.setIndex(this.idx);
    normals(g);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Smooth normals across everything that shares a place (a tube's seam, a pole), each face's
 * normal weighted by its area — then every triangle wound to face out (the builders do not care).
 */
function normals(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position").array as Float32Array;
  const idx = g.getIndex()!.array as Uint16Array | Uint32Array;
  const n = p.length / 3;
  // the triangles' winding: out of the shape, judged against the shape's own centre per piece is
  // unreliable; the builders wind consistently, so only the normals are made here
  const key = new Map<string, number>();
  const rep = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(p[i * 3] * 2e4)},${Math.round(p[i * 3 + 1] * 2e4)},${Math.round(p[i * 3 + 2] * 2e4)}`;
    const r = key.get(k);
    if (r === undefined) key.set(k, (rep[i] = i));
    else rep[i] = r;
  }
  const acc = new Float32Array(n * 3);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromArray(p, idx[t] * 3);
    b.fromArray(p, idx[t + 1] * 3);
    c.fromArray(p, idx[t + 2] * 3);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    e1.cross(e2);
    for (let k = 0; k < 3; k++) {
      const r = rep[idx[t + k]] * 3;
      acc[r] += e1.x;
      acc[r + 1] += e1.y;
      acc[r + 2] += e1.z;
    }
  }
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rep[i] * 3;
    const l = Math.hypot(acc[r], acc[r + 1], acc[r + 2]) || 1;
    nor[i * 3] = acc[r] / l;
    nor[i * 3 + 1] = acc[r + 1] / l;
    nor[i * 3 + 2] = acc[r + 2] / l;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
}

const sp = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---- a fine mask of the picture (×4), blurred: the silhouette, the face's opening ------------------------

export class Fine {
  readonly W: number;
  readonly d: Float32Array;
  constructor(cells: (x: number, y: number) => boolean, blur: number) {
    const S = 4,
      N = 26;
    this.W = N * S;
    const W = this.W;
    // the cells ×4, then a box blur (twice: near a gaussian) — the stairs rounded off
    const m = new Float32Array(W * W);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!cells(x, y)) continue;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) m[(y * S + sy) * W + x * S + sx] = 1;
      }
    this.d = blur > 0 ? boxBlur(boxBlur(m, W, Math.ceil(blur / 2)), W, Math.ceil(blur / 2)) : m;
  }
  /** The mask at a cell position (continuous, cells), bilinear. */
  at(cx: number, cy: number) {
    const W = this.W;
    const fx = cx * 4 - 0.5,
      fy = cy * 4 - 0.5;
    const x0 = Math.floor(fx),
      y0 = Math.floor(fy);
    const tx = fx - x0,
      ty = fy - y0;
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : this.d[y * W + x]);
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  }
}

function boxBlur(src: Float32Array, W: number, r: number) {
  const tmp = new Float32Array(W * W),
    out = new Float32Array(W * W);
  const k = 2 * r + 1;
  for (let y = 0; y < W; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = s / k;
      s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(W - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < W; y++) {
      out[y * W + x] = s / k;
      s += tmp[Math.min(W - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

// ---- level of detail ---------------------------------------------------------------------------------------

/**
 * The far version (people3d.ts draws a figure past ~20 m with it): the same shapes with a third of the
 * rings and segments, the small things (pleats, the seam, drawstrings, the pocket's panel) left out —
 * about a fifth of the triangles. Set while a builder runs (`lowDetail`).
 */
let LOD = 0;
export function lowDetail<T>(fn: () => T): T {
  LOD = 1;
  try {
    return fn();
  } finally {
    LOD = 0;
  }
}

// ---- the picture on the figure -----------------------------------------------------------------------------

/**
 * How a zkSNARK's picture goes round its figure. The picture is a 3/4 bust: the face drawn nearly
 * flat on, to the right; the hood's side (and its prints) to the left of it, out to the back. So the
 * face's columns go round the front of the head (as wide round it as they are drawn: square cells);
 * the hood's side goes on round the right side to the middle of the back, at the same scale, read
 * back and forth (a pattern keeps its size); the left side, which no picture shows, is the right
 * side mirrored (a print goes all the way round, a face stays one face). The rows go down the figure
 * as drawn. The torso the same, its chest under the face.
 */
export interface ArtWrap {
  slot: number;
  /**
   * The front's column (between the eyes), the face's columns to its left (the near side, drawn wider
   * in a 3/4 view) and to its right, the back's column (cells).
   */
  c: number;
  fl: number;
  fr: number;
  xl: number;
  /** Per row, where the face ends on the left (cells): what is left of it past the front is squeezed round the cheek. */
  edge?: Float32Array;
  /** The face's half width round the front (rad). */
  phi: number;
  /** The row at y = 0, a cell's height (m). */
  ay: number;
  vy: number;
  /** A torso longer than the bust in the picture: past row `last` it is read back up (to `first`). */
  last?: number;
  first?: number;
}

const PI = Math.PI;
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The picture's column at turn `th` round the figure (0 the front, + toward its left), at row `row`. */
export function wrapCol(o: ArtWrap, th: number, row: number) {
  th = wrapA(th);
  if (th >= 0) return o.c + (th / o.phi) * o.fr;
  if (th >= -o.phi) return o.c + (th / o.phi) * o.fl;
  // the rest of the face on this row (a wide near cheek) and the hood's side squeezed round the side
  const f0 = o.c - o.fl;
  const e = o.edge ? Math.min(f0, o.edge[Math.min(25, Math.max(0, Math.floor(row)))]) : f0;
  const band = Math.max(1, Math.min(3.5, e - o.xl));
  const b0 = o.xl + band;
  const d = Math.min(0.55, Math.max(0, f0 - b0) * (o.phi / o.fl) * 0.35);
  if (d > 0 && -th - o.phi < d) return f0 - ((-th - o.phi) / d) * (f0 - b0);
  // then the hood's back — its outer columns — round to the middle of the back at the face's own
  // scale (a check stays square, a camo its size), read back and forth as often as it takes
  const cells = (-th - o.phi - d) * (o.fl / o.phi);
  const m = cells % (2 * band);
  return b0 - (m <= band ? m : 2 * band - m);
}
/** The turn round the figure where column `col` goes (the near side's; the squeeze left out). */
export function wrapTurn(o: ArtWrap, col: number) {
  if (col >= o.c) return ((col - o.c) / o.fr) * o.phi;
  if (col >= o.c - o.fl) return ((col - o.c) / o.fl) * o.phi;
  return -o.phi - (o.c - o.fl - col) * (o.phi / o.fl);
}
export function wrapRow(o: ArtWrap, y: number) {
  let cy = o.ay - y / o.vy;
  if (o.last !== undefined && cy > o.last + 1) cy = Math.max(o.first ?? 0, 2 * (o.last + 1) - cy);
  return Math.min(26, Math.max(0, cy));
}
const cellT: [number, number] = [0, 0];
/**
 * The picture's readings at turn `th`, height `y`: the direct one into `uv`; past the face's far edge
 * the mirrored one (and how much of it shows) into the builder's state for the next vertex.
 */
function readArt(B: GeoB, o: ArtWrap, th: number, y: number, uv: [number, number]) {
  th = wrapA(th);
  const row = wrapRow(o, y);
  slotUV(o.slot, Math.min(26, Math.max(0, wrapCol(o, th, row))), row, uv);
  const w = th <= 0 ? 0 : smooth(o.phi - 0.04, o.phi + 0.14, th);
  if (w > 0) {
    slotUV(o.slot, Math.min(26, Math.max(0, wrapCol(o, -th, row))), row, cellT);
    B.u2 = cellT[0];
    B.w2 = cellT[1];
  }
  B.mirror = w;
}
const smin = (a: number, b: number, k: number) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));

// ---- the head -----------------------------------------------------------------------------------------

export interface HeadIn {
  art: ArtWrap;
  /** The head's cells (the picture's outline: a cap's peak, glasses' ends cut off). */
  shape: Fine;
  /** The face's cells (blurred: the opening's edge) and the same blurred wide (its middle), or null: no opening. */
  face: Fine | null;
  faceWide: Fine | null;
  /** Art rows: top and the neck (its bottom); a cell's size (m). */
  top: number;
  neck: number;
  v: number;
  /** The art row where a hat ends (−1: none); a cap's peak (its colour) or null; a knitted hat. */
  hatEnd: number;
  visor: THREE.Color | null;
  knit: boolean;
  /** A halo over it: its middle (cells), its half width (cells), its colour. */
  halo: { x: number; y: number; w: number; col: THREE.Color } | null;
  /** Glasses: their rows and columns (cells): the picture shows on them. */
  lenses: { y0: number; y1: number; x0: number; x1: number } | null;
}

/** The outline's width at a row (cells, continuous). */
function widthAt(shape: Fine, cy: number) {
  let x0 = -1,
    x1 = -1;
  for (let x = 0; x < 26; x += 0.25)
    if (shape.at(x, cy) > 0.5) {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
  return x0 < 0 ? 0 : x1 - x0 + 0.25;
}

export function headGeo(o: HeadIn) {
  const B = new GeoB();
  const { v, neck, top } = o;
  // its widths down the rows; the head as wide as most of them, a boxy round (a hood), narrowing where
  // the picture narrows (the crown, the neck)
  const ws: number[] = [];
  for (let cy = top + 0.5; cy <= neck + 0.5; cy += 0.5) ws.push(widthAt(o.shape, cy));
  const sorted = [...ws].sort((a, b) => a - b);
  const W = sorted[Math.floor(sorted.length * 0.8)] || 10;
  const R0 = (W / 2) * v * 0.94;
  const yTop = (neck + 1 - top) * v;
  const Yc = yTop / 2 - 0.01,
    Hh = yTop / 2 + 0.01;
  const n = 2.7,
    nx = 2.35;
  const SEG = LOD ? 16 : 40,
    RING = LOD ? 10 : 26;
  const hatY = o.hatEnd >= 0 ? (neck + 1 - (o.hatEnd + 1)) * v : Infinity;
  const recess = Math.min(0.07, R0 * 0.28);
  const phiOf = (y: number) => Math.acos(Math.min(1, Math.max(-1, sp((y - Yc) / Hh, n / 2))));
  /** The ring's radius at a height (m). */
  const radius = (phi: number) => {
    const y = Yc + Hh * sp(Math.cos(phi), 2 / n);
    const rs = R0 * Math.abs(sp(Math.sin(phi), 2 / n));
    const rp = (widthAt(o.shape, neck + 1 - y / v) / 2) * v * 0.94;
    return { y, r: Math.max(0.002, smin(rs, Math.max(rp, rs * 0.55), 0.012)) };
  };
  const ring = (phi: number, th: number, R: number, y: number, out: THREE.Vector3) => {
    let yy = y;
    // the bottom sits on the shoulders (a little below the neck line: no gap when it turns)
    if (yy < -0.03) yy = -0.03 + (yy + 0.03) * 0.2;
    return out.set(R * sp(Math.sin(th), 2 / nx), yy, R * 1.03 * sp(Math.cos(th), 2 / nx));
  };
  const P = new THREE.Vector3();
  const uv: [number, number] = [0, 0];
  const white = new THREE.Color(1, 1, 1);
  const start = B.n;
  for (let r = 0; r <= RING; r++) {
    const phi = (r / RING) * PI;
    const { y: y0, r: R } = radius(phi);
    for (let s = 0; s <= SEG; s++) {
      const th = -PI + (s / SEG) * PI * 2;
      ring(phi, th, R, y0, P);
      let { x, y, z } = P;
      // the picture on it (read before the opening moves it: the art stays where it was drawn)
      readArt(B, o.art, th, y0, uv);
      const row = wrapRow(o.art, y0),
        col = wrapCol(o.art, th, row);
      // the hood gathers at the neck behind (soft pleats), a seam runs over its crown to the back
      const uy = Math.cos(phi),
        uz = Math.sin(phi) * Math.cos(th);
      const back = 1 - smooth(-0.3, 0.2, uz);
      const gather = smooth(-0.1, -0.7, uy) * back;
      const pleat = LOD ? 0 : 0.006 * Math.sin(th * 11) * gather;
      const seam = LOD ? 0 : 0.004 * Math.exp(-((wrapA(th - PI) / 0.07) ** 2)) * smooth(-0.6, 0.4, uy) * back;
      // the face: its own cells, set back in the hood, its middle rounded forward again, the hood's
      // edge proud round it
      // (not down to the neck: the hood closes under the chin)
      const seen = (1 - smooth(o.art.phi + 0.1, o.art.phi + 0.45, Math.abs(th))) * smooth(0.01, 0.09, y0);
      const f = o.face ? o.face.at(col, row) * seen : 0;
      const fw = o.faceWide ? o.faceWide.at(col, row) * seen : 0;
      const inset = recess * smooth(0.2, 0.8, f) * (1 - 0.4 * smooth(0.6, 1, fw));
      const rim = LOD ? 0 : 0.01 * smooth(0.0, 0.15, f) * (1 - smooth(0.18, 0.42, f));
      let out = pleat + seam + rim - inset;
      // a hat's band stands a little proud of the hood
      let mat: number = MAT.jersey;
      if (y > hatY - 0.005) {
        out += 0.012 * smooth(hatY - 0.005, hatY + 0.02, y);
        mat = o.knit ? MAT.knit : MAT.twill;
      }
      const len = Math.hypot(x, y - Yc, z) || 1;
      x += (x / len) * out;
      y += ((y - Yc) / len) * out;
      z += (z / len) * out;
      if (f > 0.5) mat = MAT.skin;
      // the opening's shade: darker toward its edge
      B.ao = Math.max(0.42, 1 - 0.42 * smooth(0.15, 0.85, f) * (1 - 0.7 * fw)) * (1 - 0.18 * gather);
      B.v(x, y, z, white, mat, 1, uv[0], uv[1], (s / SEG) * PI * 2 * R0 * Math.sin(phi), y);
    }
  }
  B.ao = 1;
  B.mirror = 0;
  B.rings(start, RING + 1, SEG);
  // a cap's peak: a curved visor out over the face, in the picture's own colour for it
  if (o.visor) {
    const vy = hatY + 0.004;
    const { r: Rv } = radius(phiOf(vy));
    const w = Rv * 0.84,
      L = R0 * 0.6;
    const z0 = Rv * 1.03 * 0.9;
    const s0 = B.n;
    const SEGV = LOD ? 5 : 12,
      ROWV = LOD ? 1 : 4;
    const under = o.visor.clone().multiplyScalar(0.72);
    for (let t = 0; t <= 1; t++)
      for (let r = 0; r <= ROWV; r++)
        for (let s = 0; s <= SEGV; s++) {
          const u = s / SEGV - 0.5,
            q = r / ROWV;
          const xx = u * 2 * w * (1 - 0.35 * q * q);
          const zz = z0 * Math.sqrt(Math.max(0, 1 - (u * 2) ** 2 * 0.6)) + q * L;
          const yy = vy - q * q * 0.035 - (t ? 0.016 : 0) - Math.abs(u) * 0.02;
          B.ao = t ? 0.8 : 1;
          B.v(xx, yy, zz, t ? under : o.visor, MAT.twill, 0, 0, 0, xx, zz);
        }
    B.ao = 1;
    const cols = SEGV + 1,
      layer = (ROWV + 1) * cols;
    for (let r = 0; r < ROWV; r++)
      for (let s = 0; s < SEGV; s++) {
        const a = s0 + r * cols + s;
        B.quad(a, a + cols, a + cols + 1, a + 1);
        const b = a + layer;
        B.quad(b, b + 1, b + cols + 1, b + cols);
      }
    for (let s = 0; s < SEGV; s++) {
      const a = s0 + ROWV * cols + s;
      B.quad(a, a + layer, a + 1 + layer, a + 1);
    }
  }
  // glasses: a band standing off the face where the picture has them (its frames and lenses on it,
  // glossy), round to the temples
  if (o.lenses) {
    const L0 = o.lenses;
    const yTopL = (neck + 1 - L0.y0) * v + 0.003,
      yBot = (neck + 1 - (L0.y1 + 1)) * v - 0.003;
    const SEGL = LOD ? 8 : 24,
      ROWL = LOD ? 1 : 3;
    // (as far round as they are drawn, a little past: a strap may go on round the side)
    const T0 = Math.max(-1.8, wrapTurn(o.art, L0.x0) - 0.04),
      T1 = Math.min(1.8, Math.max(0.35, wrapTurn(o.art, L0.x1 + 1) + 0.04));
    const off = 0.01 + (o.face ? recess * 0.25 : 0);
    const s0 = B.n;
    for (let r = 0; r <= ROWL; r++) {
      const yy = yTopL + ((yBot - yTopL) * r) / ROWL;
      const phi = phiOf(yy);
      const { r: R } = radius(phi);
      for (let s = 0; s <= SEGL; s++) {
        const th = T0 + ((T1 - T0) * s) / SEGL;
        ring(phi, th, R + off, yy, P);
        const lrow = Math.min(L0.y1 + 0.95, Math.max(L0.y0 + 0.05, wrapRow(o.art, yy)));
        const col = Math.min(L0.x1 + 0.95, Math.max(L0.x0 + 0.05, wrapCol(o.art, th, lrow)));
        slotUV(o.art.slot, col, lrow, uv);
        // (round the sides: the frame's arms, thinner)
        const k = Math.max(smooth(0.8, 1, th / T1), smooth(0.8, 1, th / T0));
        const ym = (yTopL + yBot) / 2;
        B.v(P.x, ym + (P.y - ym) * (1 - 0.6 * k), P.z, white, MAT.gloss, 1, uv[0], uv[1], th * 0.1, yy);
      }
    }
    B.rings(s0, ROWL + 1, SEGL);
  }
  // a halo over it: a ring of light
  if (o.halo) {
    const hy = (neck + 1 - o.halo.y) * v + 0.03;
    const R = Math.max(0.07, o.halo.w * v * 0.8);
    const tube = 0.011;
    const SG = LOD ? 14 : 32,
      RG = LOD ? 4 : 8;
    const s0 = B.n;
    const tilt = 0.18;
    for (let r = 0; r <= RG; r++) {
      const b = (r / RG) * PI * 2;
      for (let s = 0; s <= SG; s++) {
        const a = (s / SG) * PI * 2;
        const rr = R + Math.cos(b) * tube;
        const lx = Math.cos(a) * rr,
          lz = Math.sin(a) * rr,
          ly = Math.sin(b) * tube;
        // tipped back a little
        const y2 = ly * Math.cos(tilt) + lz * Math.sin(tilt),
          z2 = -ly * Math.sin(tilt) + lz * Math.cos(tilt);
        B.v(lx, hy + y2, z2 - 0.01, o.halo.col, MAT.glow, 0, 0, 0, a * R, b);
      }
    }
    B.rings(s0, RG + 1, SG);
  }
  return { geo: B.geometry(), halfW: R0 };
}

// ---- the torso -----------------------------------------------------------------------------------------------

export interface BodyIn {
  art: ArtWrap;
  /** Half the width (m), its height (m). */
  halfW: number;
  H: number;
  cloth: THREE.Color;
}

/** The torso: the picture's shoulders, chest and clothes all round it (rounded, a soft hem). */
export function bodyGeo(o: BodyIn) {
  const B = new GeoB();
  const { H, halfW: A } = o;
  const D = A * 0.64;
  const n = 2.7;
  const SEG = LOD ? 12 : 32;
  // rings from the hem up to the neck: half width, half depth, fabric
  const prof: [number, number, number, number][] = [];
  const push = (y: number, a: number, d: number, mat: number) => prof.push([y, a, d, mat]);
  push(0, 0.9, 0.88, MAT.rib);
  push(0.025, 0.92, 0.9, MAT.rib);
  push(0.05, 0.92, 0.9, MAT.rib);
  push(0.06, 0.97, 0.95, MAT.jersey);
  push(0.1, 1.0, 0.98, MAT.jersey);
  const shoulder = Math.max(0.12, H - 0.16);
  for (let y = 0.15; y < shoulder; y += LOD ? 0.15 : 0.05) push(y, 1.0, 1.0, MAT.jersey);
  const SH = LOD ? 3 : 6;
  for (let k = 0; k <= SH; k++) {
    const t = k / SH;
    const y = shoulder + (H - shoulder) * Math.sin((t * PI) / 2);
    const a = 0.46 + 0.54 * Math.cos((t * PI) / 2) ** 0.8;
    const d = 0.55 + 0.45 * Math.cos((t * PI) / 2);
    push(y, a, d, MAT.jersey);
  }
  push(H - 0.004, 0.3, 0.3, MAT.jersey);
  push(H - 0.006, 0, 0, MAT.jersey);
  const uv: [number, number] = [0, 0];
  const white = new THREE.Color(1, 1, 1);
  const start = B.n;
  for (const pr of prof) {
    const [y, a, d, mat] = pr;
    for (let s = 0; s <= SEG; s++) {
      const th = -PI + (s / SEG) * PI * 2;
      const ux = Math.sin(th),
        uz = Math.cos(th);
      readArt(B, o.art, th, y, uv);
      // soft horizontal folds bunched over the hem, a few down from the arms
      const fold = LOD ? 0 : 0.005 * Math.sin(y * 70 + Math.sin(th * 3) * 1.5) * smooth(0.3, 0.06, y) * (y > 0.06 ? 1 : 0) + 0.003 * Math.sin(th * 7 + y * 20) * smooth(H * 0.5, H * 0.8, y) * (1 - smooth(H * 0.85, H, y));
      const x = sp(ux, 2 / n) * (A * a + fold),
        z = sp(uz, 2 / n) * (D * d + fold);
      // darker under the arms (the sides high up), at the neck, inside the hem's fold
      const side = Math.abs(ux);
      B.ao = Math.max(0.5, 1 - 0.3 * smooth(0.75, 1, side) * smooth(H * 0.45, H * 0.72, y) * (1 - smooth(H * 0.8, H * 0.95, y)) - 0.22 * smooth(H - 0.05, H, y) - 0.15 * (1 - smooth(0.0, 0.03, y)));
      B.v(x, y, z, white, mat, 1, uv[0], uv[1], (s / SEG) * PI * (A + D), y);
    }
  }
  B.ao = 1;
  B.mirror = 0;
  B.rings(start, prof.length, SEG, true);
  return B.geometry();
}

// ---- the limbs every figure shares ---------------------------------------------------------------------------

/**
 * A tube down the joint's −y: rings of [y, half width (x), half depth (z), fabric, colour k] — the
 * ends closed by shrinking to a point. Rounded cross-sections (superellipse `n`).
 */
function tube(B: GeoB, prof: [number, number, number, number, number][], seg: number, o: { x?: number; z?: number; n?: number } = {}) {
  const n = o.n ?? 2.2;
  if (LOD) {
    seg = Math.max(5, Math.round(seg * 0.42));
    // (every other ring of the profile, its ends kept)
    prof = prof.filter((_, i) => i === 0 || i === prof.length - 1 || i % 2 === 0);
  }
  const start = B.n;
  const c = new THREE.Color();
  let len = 0;
  for (let i = 0; i < prof.length; i++) {
    const [y, rx, rz, mat, k] = prof[i];
    if (i) len += Math.abs(y - prof[i - 1][0]);
    c.setScalar(k);
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * Math.PI * 2 + Math.PI;
      B.v((o.x ?? 0) + sp(Math.sin(th), 2 / n) * rx, y, (o.z ?? 0) + sp(Math.cos(th), 2 / n) * rz, c, mat, 0, 0, 0, (s / seg) * Math.PI * (rx + rz), len);
    }
  }
  B.rings(start, prof.length, seg);
}
/** A rounded end: rings shrinking to a point over `r` (from y going `dir`). */
function cap(y: number, rx: number, rz: number, dir: 1 | -1, mat: number, k: number, steps = 2): [number, number, number, number, number][] {
  const out: [number, number, number, number, number][] = [];
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    out.push([y + dir * Math.sin(a) * Math.min(rx, rz) * 0.9, rx * Math.cos(a), rz * Math.cos(a), mat, k]);
  }
  return out;
}

export type PartKind = "hips" | "upper" | "fore" | "handR" | "handL" | "thigh" | "shin" | "shoe" | "sole";

/** Each limb's shape in its joint's frame (the old boxes' extents kept: the poses fit as they did). */
export function partGeo(kind: PartKind): THREE.BufferGeometry {
  const B = new GeoB();
  const J = MAT.jersey,
    R = MAT.rib,
    Dn = MAT.denim;
  switch (kind) {
    case "hips": {
      // the seat of a pair of jeans, a belt round it
      const p: [number, number, number, number, number][] = [];
      p.push(...cap(-0.04, 0.15, 0.11, -1, Dn, 1).reverse());
      for (const [y, a, k] of [
        [-0.04, 1, 1],
        [0.02, 1.02, 1],
        [0.075, 0.98, 1],
        [0.08, 1.0, 0.42],
        [0.1, 1.0, 0.42],
        [0.105, 0.96, 1],
      ] as const)
        p.push([y, 0.15 * a, 0.11 * a, Dn, k]);
      p.push(...cap(0.105, 0.144, 0.105, 1, Dn, 1));
      p.sort((a, b) => b[0] - a[0]);
      tube(B, p, 14, { n: 2.8 });
      break;
    }
    case "upper": {
      // a sleeve from the shoulder's round to the elbow
      const p: [number, number, number, number, number][] = [];
      p.push(...cap(0.0, 0.068, 0.072, 1, J, 1, 4).reverse());
      for (const [y, r] of [
        [0.0, 1],
        [-0.04, 0.98],
        [-0.12, 0.92],
        [-0.18, 0.88],
      ] as const)
        p.push([y, 0.068 * r, 0.072 * r, J, 1]);
      p.push(...cap(-0.18, 0.06, 0.063, -1, J, 1));
      p.sort((a, b) => b[0] - a[0]);
      tube(B, p, 11);
      break;
    }
    case "fore": {
      // the forearm's sleeve and its ribbed cuff
      const p: [number, number, number, number, number][] = [];
      p.push(...cap(0.01, 0.06, 0.063, 1, J, 1).reverse());
      for (const [y, r, m] of [
        [0.01, 1, J],
        [-0.06, 0.96, J],
        [-0.112, 0.94, J],
        [-0.118, 0.98, R],
        [-0.15, 0.92, R],
        [-0.153, 0.7, R],
      ] as const)
        p.push([y, 0.06 * r, 0.062 * r, m, m === R ? 0.92 : 1]);
      p.push([-0.153, 0.03, 0.03, R, 0.5]);
      p.sort((a, b) => b[0] - a[0]);
      tube(B, p, 11);
      break;
    }
    case "handR":
    case "handL": {
      // a mitten: the hand's flat round, and its thumb toward the front and the body
      const inward = kind === "handR" ? 1 : -1;
      const p: [number, number, number, number, number][] = [];
      p.push(...cap(-0.012, 0.042, 0.03, 1, MAT.skin, 1).reverse());
      for (const [y, a, b] of [
        [-0.012, 1, 1],
        [-0.04, 1.08, 1.05],
        [-0.07, 1.02, 0.98],
      ] as const)
        p.push([y, 0.042 * a, 0.03 * b, MAT.skin, 1]);
      p.push(...cap(-0.07, 0.043, 0.029, -1, MAT.skin, 1, 4));
      p.sort((a, b) => b[0] - a[0]);
      tube(B, p, 10, { z: 0.008 });
      const t: [number, number, number, number, number][] = [];
      t.push(...cap(-0.02, 0.015, 0.015, 1, MAT.skin, 1).reverse());
      t.push([-0.02, 0.015, 0.015, MAT.skin, 1], [-0.055, 0.014, 0.014, MAT.skin, 1]);
      t.push(...cap(-0.055, 0.014, 0.014, -1, MAT.skin, 1));
      t.sort((a, b) => b[0] - a[0]);
      const s0 = B.n;
      tube(B, t, 6, { x: inward * 0.032, z: 0.03 });
      // tilt the thumb out from the palm
      for (let i = s0; i < B.n; i++) {
        const y = B.pos[i * 3 + 1] + 0.02;
        B.pos[i * 3] += inward * -y * 0.35;
        B.pos[i * 3 + 2] += -y * 0.25;
      }
      break;
    }
    case "thigh": {
      const p: [number, number, number, number, number][] = [];
      p.push(...cap(0.025, 0.078, 0.082, 1, Dn, 1).reverse());
      for (const [y, r] of [
        [0.025, 1],
        [-0.08, 0.97],
        [-0.205, 0.9],
      ] as const)
        p.push([y, 0.078 * r, 0.082 * r, Dn, 1]);
      p.push(...cap(-0.205, 0.07, 0.074, -1, Dn, 1));
      p.sort((a, b) => b[0] - a[0]);
      tube(B, p, 11);
      break;
    }
    case "shin": {
      // the lower leg and the jeans' rolled hem over the shoe
      const p: [number, number, number, number, number][] = [];
      p.push(...cap(0.015, 0.068, 0.072, 1, Dn, 1).reverse());
      for (const [y, r, k] of [
        [0.015, 1, 1],
        [-0.08, 0.96, 1],
        [-0.14, 0.95, 1],
        [-0.145, 1.08, 1.18],
        [-0.185, 1.08, 1.18],
        [-0.19, 0.9, 0.7],
      ] as const)
        p.push([y, 0.068 * r, 0.072 * r, Dn, k]);
      p.push([-0.19, 0.04, 0.04, Dn, 0.4]);
      p.sort((a, b) => b[0] - a[0]);
      tube(B, p, 11);
      break;
    }
    case "shoe": {
      // the sneaker's upper: lofted from the heel to the round toe
      const SEG = LOD ? 5 : 12;
      const secs: [number, number, number][] = [];
      // [z, half width, top height] (y from the sole's top at −0.0525)
      for (const [z, w, h] of [
        [-0.095, 0.0, 0.07],
        [-0.088, 0.055, 0.074],
        [-0.07, 0.07, 0.076],
        [-0.02, 0.075, 0.07],
        [0.04, 0.08, 0.058],
        [0.1, 0.08, 0.046],
        [0.145, 0.07, 0.036],
        [0.17, 0.045, 0.026],
        [0.18, 0.0, 0.018],
      ] as const)
        secs.push([z, w, h]);
      const y0 = -0.0525;
      const start = B.n;
      const c = new THREE.Color(1, 1, 1);
      for (const [z, w, h] of secs)
        for (let s = 0; s <= SEG; s++) {
          // half an ellipse over the sole, its bottom flat
          const a = (s / SEG) * Math.PI;
          const x = -Math.cos(a) * Math.max(w, 0.002);
          const y = y0 + Math.sin(a) * Math.max(h, 0.002);
          B.v(x, y, z, c, MAT.upper, 0, 0, 0, a * 0.05, z);
        }
      for (let r = 0; r < secs.length - 1; r++)
        for (let s = 0; s < SEG; s++) {
          const a = start + r * (SEG + 1) + s;
          B.quad(a, a + SEG + 1, a + SEG + 2, a + 1);
        }
      break;
    }
    case "sole": {
      // the sole (rubber, all round), the toe's bumper, the laces and a stripe on each side, in the sole's colour
      const SEG = LOD ? 10 : 18;
      const outline: [number, number][] = [];
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const zc = 0.042;
        const L = 0.143,
          Wd = 0.087;
        const ca = Math.cos(a),
          sa = Math.sin(a);
        // a stadium: wider at the toe than the heel
        const w = Wd * (sa > 0 ? 1 : 0.88);
        outline.push([ca * w, zc + sa * L]);
      }
      const yb = -0.0875,
        yt = -0.0525;
      const c = new THREE.Color(1, 1, 1);
      const s0 = B.n;
      for (const [y, k] of [
        [yb, 0.96],
        [yb + 0.004, 1],
        [yt - 0.003, 1],
        [yt, 0.9],
      ] as const)
        for (let s = 0; s <= SEG; s++) {
          const [x, z] = outline[s % SEG];
          const sh = y === yb || y === yt ? 0.96 : 1;
          B.v(x * sh, y, (z - 0.042) * sh + 0.042, c.setScalar(k), MAT.rubber, 0, 0, 0, s * 0.02, y);
        }
      B.rings(s0, 4, SEG);
      // bottom and top faces
      const cb = B.v(0, yb, 0.042, c.setScalar(0.9), MAT.rubber),
        ct = B.v(0, yt, 0.042, c.setScalar(0.9), MAT.rubber);
      for (let s = 0; s < SEG; s++) {
        B.tri(cb, s0 + s, s0 + s + 1);
        B.tri(ct, s0 + 3 * (SEG + 1) + s + 1, s0 + 3 * (SEG + 1) + s);
      }
      // laces: bars across the instep, on the upper's top
      const top = (z: number) => -0.0525 + (z < -0.02 ? 0.07 : z < 0.04 ? 0.07 - ((z + 0.02) / 0.06) * 0.012 : z < 0.1 ? 0.058 - ((z - 0.04) / 0.06) * 0.012 : 0.046);
      const lace = new THREE.Color(1, 1, 1);
      for (let z = 0.0; z <= 0.1; z += 0.024) {
        const y = top(z) + 0.002;
        const a = B.v(-0.035, y - 0.006, z, lace, MAT.upper),
          b = B.v(0.035, y - 0.006, z, lace, MAT.upper),
          c2 = B.v(0.035, y + 0.003, z + 0.008, lace, MAT.upper),
          d = B.v(-0.035, y + 0.003, z + 0.008, lace, MAT.upper);
        B.quad(a, d, c2, b);
      }
      // a stripe on each side (the sneaker's mark, no brand)
      for (const side of [-1, 1]) {
        const s1 = B.n;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const z = -0.06 + t * 0.15;
          const y = -0.042 + Math.sin(t * Math.PI) * 0.012 + t * 0.008;
          const x = side * (0.081 - t * t * 0.01);
          B.v(x, y, z, lace, MAT.upper);
          B.v(x, y + 0.009 - t * 0.003, z, lace, MAT.upper);
        }
        for (let i = 0; i < 6; i++) {
          const a = s1 + i * 2;
          if (side > 0) B.quad(a, a + 1, a + 3, a + 2);
          else B.quad(a, a + 2, a + 3, a + 1);
        }
      }
      break;
    }
  }
  return B.geometry();
}
