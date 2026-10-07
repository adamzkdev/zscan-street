import * as THREE from "three";

/**
 * BLOCK STADIUM's measurements (metres). The pitch runs along x (goals at ±PL), the main camera
 * stand is the south one (+z), where the street door leads in. The bowl is a rounded rectangle:
 * every row of the stands is the pitch-side rectangle pushed out by `d` along its normals.
 */

/** Half length and half width of the lines (7-a-side, a little smaller than a full pitch). */
export const PL = 30,
  PW = 19;
/** Goals: half width, height, net depth. */
export const GW = 3.1,
  GH = 2.35,
  GD = 1.9;
/** The advertising boards round the pitch: the cage the ball and the players stay in. */
export const BX = 33.4,
  BZ = 22.2;
/** Front of the stands: rounded rectangle half extents and corner radius. */
export const HX = 36,
  HZ = 24.6,
  RC = 7;

export const LOWER = { rows: 12, d0: 0.9, dd: 0.8, y0: 1.25, dy: 0.42 };
/** The cross walkway between the two tiers: where the watchers stand. */
export const WALK = { d0: LOWER.d0 + LOWER.rows * LOWER.dd, d1: 13.1, y: 6.2 };
export const UPPER = { rows: 16, d0: 13.1, dd: 0.85, y0: 7.45, dy: 0.62 };
export const BACK = UPPER.d0 + UPPER.rows * UPPER.dd;
export const ROOF = { d0: 3.5, d1: 30, y: 22.4 };

export const GOLD = "#f4b728";
export const SILVER = "#c8ccd8";

export interface LoopPt {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Distance along the front (d = 0) of the stands. */
  s: number;
  /** Which part of the bowl: 0 south, 1 east, 2 north, 3 west, 4 a corner. */
  side: number;
}

/** The front of the stands as a closed loop (last point = first), counter-clockwise from the south-west. */
export const LOOP: LoopPt[] = (() => {
  const pts: LoopPt[] = [];
  const ax = HX - RC,
    az = HZ - RC;
  const straight = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, side: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(len);
    for (let i = 0; i < n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, nx, nz, s: 0, side });
  };
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const nx = Math.cos(a),
        nz = Math.sin(a);
      pts.push({ x: cx + nx * RC, z: cz + nz * RC, nx, nz, s: 0, side: 4 });
    }
  };
  straight(-ax, HZ, ax, HZ, 0, 1, 0);
  arc(ax, az, Math.PI / 2, 0);
  straight(HX, az, HX, -az, 1, 0, 1);
  arc(ax, -az, 0, -Math.PI / 2);
  straight(ax, -HZ, -ax, -HZ, 0, -1, 2);
  arc(-ax, -az, -Math.PI / 2, -Math.PI);
  straight(-HX, -az, -HX, az, -1, 0, 3);
  arc(-ax, az, Math.PI, Math.PI / 2);
  pts.push({ ...pts[0] });
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].s = s;
  }
  return pts;
})();
export const LOOP_LEN = LOOP[LOOP.length - 1].s;

/** A point of the loop pushed out by d. */
export const at = (p: LoopPt, d: number, y: number) => new THREE.Vector3(p.x + p.nx * d, y, p.z + p.nz * d);

/**
 * Walks the loop at offset d, one stop every `step` metres: position, outward normal, distance
 * along the front (for aisles and sections) and side.
 */
export function along(d: number, step: number, fn: (x: number, z: number, nx: number, nz: number, s: number, side: number) => void) {
  let carry = step / 2;
  for (let i = 1; i < LOOP.length; i++) {
    const a = LOOP[i - 1],
      b = LOOP[i];
    const ax = a.x + a.nx * d,
      az = a.z + a.nz * d,
      bx = b.x + b.nx * d,
      bz = b.z + b.nz * d;
    const len = Math.hypot(bx - ax, bz - az);
    let u = carry;
    while (u < len) {
      const f = u / len;
      let nx = a.nx + (b.nx - a.nx) * f,
        nz = a.nz + (b.nz - a.nz) * f;
      const nl = Math.hypot(nx, nz);
      nx /= nl;
      nz /= nl;
      fn(ax + (bx - ax) * f, az + (bz - az) * f, nx, nz, a.s + (b.s - a.s) * f, a.side === b.side ? a.side : 4);
      u += step;
    }
    carry = u - len;
  }
}

/** Seeded random numbers, so the crowd is the same every visit. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { c, g, t };
}

export const MONO = '"JetBrains Mono", Menlo, monospace';
