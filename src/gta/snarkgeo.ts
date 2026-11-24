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
  /** Occlusion for the next vertices (1: open to the sky). */
  ao = 1;
  v(x: number, y: number, z: number, c: THREE.Color, mat: number, art = 0, u = 0, w = 0, fu = 0, fv = 0) {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, w);
    this.fab.push(fu, fv);
    this.mix.push(art, mat, this.ao);
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
    g.setAttribute("aMix", new THREE.Float32BufferAttribute(this.mix, 3));
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

/** The silhouette's radius (cells) from (cx, cy) every 360/n degrees, smoothed round. */
function contour(mask: Fine, cx: number, cy: number, n: number) {
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a),
      dy = -Math.sin(a);
    let t = 0.5,
      last = 0.5;
    for (; t < 26; t += 0.25) {
      if (mask.at(cx + dx * t, cy + dy * t) < 0.5) break;
      last = t;
    }
    r[i] = last + 0.15;
  }
  // a circular average over a few neighbours: no stairs left
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0,
      w = 0;
    for (let k = -3; k <= 3; k++) {
      const wt = 4 - Math.abs(k);
      s += r[(i + k + n) % n] * wt;
      w += wt;
    }
    out[i] = s / w;
  }
  return out;
}
const radiusAt = (c: Float32Array, a: number) => {
  const n = c.length;
  let f = ((a / (Math.PI * 2)) % 1) * n;
  if (f < 0) f += n;
  const i = Math.floor(f),
    t = f - i;
  return c[i % n] * (1 - t) + c[(i + 1) % n] * t;
};

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

// ---- the head -----------------------------------------------------------------------------------------

export interface HeadIn {
  slot: number;
  /** The head's cells (the picture's, the trail cut off, a cap's visor out of the outline). */
  shape: Fine;
  /** The hood's opening (cells): an oval round the face — a hood's opening is round, whatever the pixels. */
  opening: { x: number; y: number; rx: number; ry: number };
  /** Art rows: top and the neck (its bottom), the body's middle column, a cell's size (m). */
  top: number;
  neck: number;
  cx: number;
  v: number;
  hood: THREE.Color;
  hat: THREE.Color | null;
  /** The art row where the hat ends (−1: none), and a visor sticking out at the front. */
  hatEnd: number;
  visor: boolean;
}

export function headGeo(o: HeadIn) {
  const B = new GeoB();
  const { v, cx, neck, top } = o;
  // the outline's centre (cells) and its radius all round
  let sx = 0,
    sy = 0,
    sw = 0;
  for (let y = top; y <= neck; y += 0.5)
    for (let x = 0; x < 26; x += 0.5) {
      const m = o.shape.at(x + 0.25, y + 0.25);
      if (m > 0.5) ((sx += x + 0.25), (sy += y + 0.25), (sw += 1));
    }
  const ccx = sw ? sx / sw : cx,
    ccy = sw ? sy / sw : (top + neck) / 2;
  const C = contour(o.shape, ccx, ccy, 96);
  // world: x = (cell x − cx)·v, y = (neck + 1 − cell y)·v; the hood as deep as it is wide
  const X0 = (ccx - cx) * v,
    Y0 = (neck + 1 - ccy) * v;
  const halfW = (radiusAt(C, 0) + radiusAt(C, Math.PI)) * 0.5 * v;
  const rz = Math.max(0.16, halfW * 0.98);
  const n = 2.15;
  const SEG = LOD ? 14 : 36,
    RING = LOD ? 10 : 26;
  const hatY = o.hatEnd >= 0 ? (neck + 1 - (o.hatEnd + 1)) * v : Infinity;
  const recess = Math.min(0.12, rz * 0.32);
  const uvp: [number, number] = [0, 0];
  const start = B.n;
  for (let r = 0; r <= RING; r++) {
    const phi = (r / RING) * Math.PI;
    for (let s = 0; s <= SEG; s++) {
      // θ from the back (the seam behind), round through the front
      const th = (s / SEG) * Math.PI * 2 + Math.PI;
      const ux = Math.sin(phi) * Math.sin(th),
        uy = Math.cos(phi),
        uz = Math.sin(phi) * Math.cos(th);
      // a superellipsoid: a hood is fuller than a ball at its shoulders
      const ex = sp(ux, 2 / n),
        ey = sp(uy, 2 / n),
        ez = sp(uz, 2 / n);
      // the outline from the picture: scale the front-on offset to the silhouette's radius at its angle
      const a = Math.atan2(ey, ex);
      const base = Math.pow(Math.pow(Math.abs(Math.cos(a)), n) + Math.pow(Math.abs(Math.sin(a)), n), -1 / n);
      const k = (radiusAt(C, a) * v) / base;
      let x = X0 + ex * k;
      let y = Y0 + ey * k;
      let z = ez * rz;
      // the bottom sits on the shoulders (a little below the neck line: no gap when it turns)
      if (y < -0.03) y = -0.03 + (y + 0.03) * 0.2;
      // the hood gathers at the neck behind (soft pleats), a seam runs over its crown to the back
      const back = 1 - smooth(-0.3, 0.2, uz);
      const gather = smooth(-0.1, -0.7, uy) * back;
      const pleat = LOD ? 0 : 0.007 * Math.sin(th * 11) * gather;
      let dth = th - Math.PI * 2;
      dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      const seam = LOD ? 0 : 0.005 * Math.exp(-((dth / 0.07) ** 2)) * smooth(-0.6, 0.4, uy) * back;
      const ol = Math.hypot(x - X0, y - Y0, z) || 1;
      x += ((x - X0) / ol) * (pleat + seam);
      y += ((y - Y0) / ol) * (pleat + seam);
      z += (z / ol) * (pleat + seam);
      // cell coordinates on the picture (front-on)
      const acx = x / v + cx,
        acy = neck + 1 - y / v;
      const front = smooth(0.05, 0.55, uz);
      // the opening: an oval round the face, set back in the hood and rounded forward again in its
      // middle (a face inside a hood); the hood's rim stands proud round it
      const ex2 = (acx - o.opening.x) / o.opening.rx,
        ey2 = (acy - o.opening.y) / o.opening.ry;
      const e = Math.hypot(ex2, ey2);
      // (soft over a wide band: a sharp edge between the mesh's vertices showed as a staircase)
      const f = (1 - smooth(0.7, 1.08, e)) * front;
      const rim = smooth(0.85, 1.05, e) * (1 - smooth(1.05, 1.4, e)) * front;
      z += f * (-recess + recess * 0.62 * (1 - Math.min(1, e * e))) + 0.014 * rim;
      // inside the opening it is darker toward the rim and under the brim (the hood's shade)
      const brim = smooth(-0.3, 1, -ey2);
      B.ao = Math.max(0.35, 1 - f * (0.5 * smooth(0.4, 1.0, e) + 0.28 * brim)) * (1 - 0.18 * gather);
      // a beanie or a cap: its band stands a little proud of the hood
      let mat: number = MAT.jersey;
      let col = o.hood;
      if (o.hat && y > hatY - 0.005) {
        const k = smooth(hatY - 0.005, hatY + 0.02, y);
        const out = 0.014 * k;
        const l = Math.hypot(x - X0, y - Y0, z) || 1;
        x += ((x - X0) / l) * out;
        y += ((y - Y0) / l) * out;
        z += (z / l) * out;
        // (a beanie is knitted, a cap is cotton twill)
        mat = o.visor ? MAT.jersey : MAT.knit;
        col = o.hat;
      }
      // the picture inside the opening (the face, its eyes, its mask) and on the rim's inner edge;
      // the hood round it is its own cloth (the drawing's flat shading on a round hood read as paint)
      // (the front; the picture's own mask, in the atlas's alpha, says where: the opening, a hat's badge)
      const art = smooth(0.25, 0.75, uz);
      slotUV(o.slot, Math.min(26, Math.max(0, acx)), Math.min(26, Math.max(0, acy)), uvp);
      // (the fabric's metres round the ring at its own girth: a beanie's ribs meet at its crown)
      B.v(x, y, z, col, mat, art, uvp[0], uvp[1], (s / SEG) * Math.PI * (halfW + rz) * Math.sin(phi), y);
    }
  }
  B.ao = 1;
  B.rings(start, RING + 1, SEG);
  // a cap's visor: a curved peak out over the face
  if (o.visor && o.hat) {
    const vy = hatY + 0.005;
    const w = halfW * 0.82,
      L = rz * 0.5;
    const s0 = B.n;
    const SEGV = LOD ? 5 : 12,
      ROWV = LOD ? 1 : 4;
    for (let t = 0; t <= 1; t++)
      for (let r = 0; r <= ROWV; r++)
        for (let s = 0; s <= SEGV; s++) {
          const u = s / SEGV - 0.5,
            q = r / ROWV;
          const xx = X0 + u * 2 * w * (1 - 0.35 * q * q);
          const zz = rz * 0.82 * Math.sqrt(Math.max(0, 1 - (u * 2) ** 2 * 0.6)) + q * L;
          const yy = vy - q * q * 0.035 - (t ? 0.018 : 0) - Math.abs(u) * 0.02;
          B.v(xx, yy, zz, o.hat, MAT.knit, 0, 0, 0, xx, zz);
        }
    const cols = SEGV + 1,
      layer = (ROWV + 1) * cols;
    for (let r = 0; r < ROWV; r++)
      for (let s = 0; s < SEGV; s++) {
        const a = s0 + r * cols + s;
        B.quad(a, a + cols, a + cols + 1, a + 1);
        const b = a + layer;
        B.quad(b, b + 1, b + cols + 1, b + cols);
      }
    // the rim between top and bottom
    for (let s = 0; s < SEGV; s++) {
      const a = s0 + ROWV * cols + s;
      B.quad(a, a + layer, a + 1 + layer, a + 1);
    }
  }
  return { geo: B.geometry(), halfW };
}

// ---- the torso: a hoodie ------------------------------------------------------------------------------------

export interface BodyIn {
  slot: number;
  /** The body's cells (the art's shoulders) for its front. */
  shape: Fine;
  neck: number;
  bottom: number;
  ext: number;
  cx: number;
  v: number;
  sx: number;
  /** Half the width (m), its height (m). */
  halfW: number;
  H: number;
  cloth: THREE.Color;
}

export function bodyGeo(o: BodyIn) {
  const B = new GeoB();
  const { H, halfW: A } = o;
  const D = A * 0.62;
  const n = 2.7;
  const SEG = LOD ? 10 : 26;
  // rings from the hem up to the neck: half width, half depth, fabric
  const prof: [number, number, number, number][] = [];
  const push = (y: number, a: number, d: number, mat: number) => prof.push([y, a, d, mat]);
  push(0, 0.88, 0.86, MAT.rib);
  push(0.02, 0.9, 0.88, MAT.rib);
  push(0.055, 0.9, 0.88, MAT.rib);
  push(0.065, 0.97, 0.95, MAT.jersey);
  push(0.1, 1.0, 0.98, MAT.jersey);
  const shoulder = Math.max(0.12, H - 0.16);
  for (let y = 0.14; y < shoulder; y += LOD ? 0.15 : 0.05) push(y, 1.0, 1.0, MAT.jersey);
  const SH = LOD ? 3 : 6;
  for (let k = 0; k <= SH; k++) {
    const t = k / SH;
    const y = shoulder + (H - shoulder) * Math.sin((t * Math.PI) / 2);
    const a = 0.46 + 0.54 * Math.cos((t * Math.PI) / 2) ** 0.8;
    const d = 0.55 + 0.45 * Math.cos((t * Math.PI) / 2);
    push(y, a, d, MAT.jersey);
  }
  push(H - 0.004, 0.3, 0.3, MAT.jersey);
  push(H - 0.006, 0, 0, MAT.jersey);
  const uvp: [number, number] = [0, 0];
  const start = B.n;
  for (const [y, a, d, mat] of prof) {
    for (let s = 0; s <= SEG; s++) {
      const th = (s / SEG) * Math.PI * 2 + Math.PI;
      const ux = Math.sin(th),
        uz = Math.cos(th);
      // a hoodie's folds: soft horizontal ones bunched over the hem, a few down from the arms
      const fold = 0.006 * Math.sin(y * 70 + Math.sin(th * 3) * 1.5) * smooth(0.3, 0.06, y) * (y > 0.06 ? 1 : 0) + 0.004 * Math.sin(th * 7 + y * 20) * smooth(H * 0.5, H * 0.8, y) * (1 - smooth(H * 0.85, H, y));
      const x = sp(ux, 2 / n) * (A * a + fold),
        z = sp(uz, 2 / n) * (D * d + fold);
      // darker under the arms (the sides high up), round the collar, inside the hem's fold
      const side = Math.abs(ux);
      B.ao = Math.max(0.5, 1 - 0.32 * smooth(0.75, 1, side) * smooth(H * 0.45, H * 0.72, y) * (1 - smooth(H * 0.8, H * 0.95, y)) - 0.25 * smooth(H - 0.05, H, y) - 0.15 * (1 - smooth(0.0, 0.03, y)));
      const acx = x / (o.v * o.sx) + o.cx,
        acy = o.neck + 1 + (H - y) / o.v;
      // (the torso is its cloth: the drawing's shoulders were all flat shading)
      const art = 0;
      slotUV(o.slot, Math.min(26, Math.max(0, acx)), Math.min(26, Math.max(0, acy)), uvp);
      B.v(x, y, z, o.cloth, mat, art, uvp[0], uvp[1], (s / SEG) * Math.PI * (A + D), y);
    }
  }
  B.ao = 1;
  B.rings(start, prof.length, SEG, true);
  // (rings going up: wound the other way)
  // the front's surface at (x, y), for the things on it
  const frontZ = (x: number, y: number) => {
    let a = 1,
      d = 1;
    for (let i = 1; i < prof.length; i++)
      if (prof[i][0] >= y) {
        const [y0, a0, d0] = prof[i - 1],
          [y1, a1, d1] = prof[i];
        const t = (y - y0) / Math.max(1e-4, y1 - y0);
        a = a0 + (a1 - a0) * t;
        d = d0 + (d1 - d0) * t;
        break;
      }
    const ux = Math.min(1, Math.abs(x) / (A * a));
    return D * d * Math.pow(Math.max(0, 1 - Math.pow(ux, n)), 1 / n);
  };
  // the kangaroo pocket: a panel on the belly, its slanted openings darker
  if (!LOD) {
    const y0 = 0.07,
      y1 = Math.min(H * 0.48, 0.07 + 0.14);
    const s0 = B.n;
    const NX = 8,
      NY = 3;
    const dark = o.cloth.clone().multiplyScalar(0.78);
    const body = o.cloth.clone().multiplyScalar(0.97);
    for (let j = 0; j <= NY; j++)
      for (let i = 0; i <= NX; i++) {
        const t = j / NY,
          u = i / NX - 0.5;
        const y = y0 + (y1 - y0) * t;
        const w = A * (0.62 - 0.2 * t);
        const x = u * 2 * w;
        const edge = i === 0 || i === NX;
        // (its edges sewn down onto the front, its middle a little proud)
        const z = frontZ(x, y) + (edge || j === 0 ? 0.002 : 0.008);
        B.ao = edge && j > 0 ? 0.82 : 1;
        B.v(x, y, z, edge && j > 0 ? dark : body, MAT.jersey, 0, 0, 0, x, y);
      }
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const a = s0 + j * (NX + 1) + i;
        B.quad(a, a + 1, a + NX + 2, a + NX + 1);
      }
    B.ao = 1;
  }
  // the drawstrings from the collar, their aglets
  if (!LOD) {
    const white = new THREE.Color(0.9, 0.9, 0.88);
    const tip = new THREE.Color(0.12, 0.12, 0.13);
    for (const side of [-1, 1]) {
      const x = side * A * 0.16;
      const yTop = H - 0.05,
        L = Math.min(0.16, H * 0.45);
      const s0 = B.n;
      const SG = 5,
        RG = 3;
      for (let r = 0; r <= RG; r++) {
        const y = yTop - (r / RG) * L;
        const z = frontZ(x, y) + 0.01;
        const rad = r >= RG - 1 ? 0.007 : 0.0055;
        for (let s = 0; s <= SG; s++) {
          const a = (s / SG) * Math.PI * 2;
          B.v(x + Math.cos(a) * rad, y, z - Math.sin(a) * rad, r >= RG - 1 ? tip : white, r >= RG - 1 ? MAT.rubber : MAT.jersey, 0, 0, 0, a * rad, y);
        }
      }
      B.rings(s0, RG + 1, SG);
    }
  }
  // the collar round the neck (the hood's seam): a rolled rib
  {
    const s0 = B.n;
    const SG = LOD ? 8 : 20,
      RG = LOD ? 2 : 4;
    const c = o.cloth.clone().multiplyScalar(0.9);
    for (let r = 0; r <= RG; r++) {
      const b = (r / RG) * Math.PI * 2;
      for (let s = 0; s <= SG; s++) {
        const th = (s / SG) * Math.PI * 2;
        const R = A * 0.5 + Math.cos(b) * 0.03,
          Rz = D * 0.62 + Math.cos(b) * 0.03;
        B.v(Math.sin(th) * R, H - 0.03 + Math.sin(b) * 0.028, Math.cos(th) * Rz, c, MAT.rib, 0, 0, 0, th * R, b * 0.03);
      }
    }
    B.rings(s0, RG + 1, SG, true);
  }
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
