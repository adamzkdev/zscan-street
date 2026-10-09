import * as THREE from "three";
import type { Rect } from "../types";
import { CEIL, G_Y, Merger, T1_Y, T2_Y, std } from "./kit";

/**
 * The atrium's stairs: a white switchback standing on the floor in front of the left wall's steps,
 * between the two groups of reading desks. The first flight climbs from the floor (its foot towards
 * the entrance) to a landing at the first terrace's height, carried on over the seating steps to the
 * terrace; the second turns back from that landing, beside the first, up to a bridge at the second
 * terrace's height that spans over the first terrace to the second. Walked for real (liftplan.ts).
 */

/** Both flights' ends (z), their x lanes; the landing (T1) and the bridge (T2): [x0, z0, x1, z1]. */
export const LIB_STAIR = {
  foot: -21,
  head: -31.4,
  /** The first flight (G → T1) and the second (T1 → T2), side by side. */
  a: [-14.6, -13.4] as const,
  b: [-15.8, -14.6] as const,
  landing: [-19.2, -32.8, -13.4, -31.4] as const,
  bridge: [-25.2, -21, -14.6, -19.6] as const,
  /** Where the landing and the bridge meet the terraces' parapets (s along the wall: s = −z here). */
  gapT1: [31.4, 32.8] as const,
  gapT2: [19.6, 21] as const,
  /** Where the slabs stop, at the terraces' fronts (x). */
  t1Edge: -18.1,
  t2Edge: -24,
};

/** Draws them; returns the floor's colliders they add (the landing's column). */
export function buildStairs(parent: THREE.Object3D, ledMat: THREE.Material): Rect[] {
  const S = LIB_STAIR;
  const m = new Merger();
  const white = std("#f6f3ee", 0.55),
    soffit = std("#ebe7e0", 0.7),
    oak = std("#b08a5a", 0.5),
    rod = std("#3a3632", 0.4, 0.6);
  /** A parallelogram panel in the y–z plane at x (thickness along −x): from (za, ya) to (zb, yb), `lo` below and `hi` above that line. */
  const panel = (mat: THREE.Material, x: number, za: number, ya: number, zb: number, yb: number, lo: number, hi: number, t: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(za, ya - lo);
    sh.lineTo(zb, yb - lo);
    sh.lineTo(zb, yb + hi);
    sh.lineTo(za, ya + hi);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
    // shape x → world z, extrusion → world −x
    g.rotateY(-Math.PI / 2);
    g.translate(x, 0, 0);
    m.add(mat, g);
  };
  /** A flight along z between x0 and x1, from (za, ya) to (zb, yb): white steps with oak treads, solid white balustrades lit along the top. */
  const flight = (x0: number, x1: number, za: number, ya: number, zb: number, yb: number) => {
    const n = Math.max(2, Math.round(Math.abs(yb - ya) / 0.18));
    const run = (zb - za) / n,
      rise = (yb - ya) / n;
    const xc = (x0 + x1) / 2,
      w = x1 - x0;
    for (let i = 0; i < n; i++) {
      const z = za + run * (i + 0.5);
      const top = ya + rise * (i + 1);
      m.box(white, w - 0.12, 0.34, Math.abs(run) + 0.01, xc, top - 0.37, z);
      m.box(oak, w - 0.12, 0.04, Math.abs(run) + 0.02, xc, top - 0.04, z);
    }
    // the sloped soffit under the steps, the balustrades either side (a lit lip on top)
    panel(soffit, x1 - 0.06, za, ya, zb, yb, 0.5, -0.3, w - 0.12);
    for (const x of [x0 + 0.06, x1]) {
      panel(white, x, za, ya, zb, yb, 0.5, 1.0, 0.06);
      panel(ledMat, x + 0.005, za, ya, zb, yb, -1.0, 1.015, 0.07);
    }
  };
  /** A slab with its top at y, and a lit parapet along the given edges ([x0, z0, x1, z1] lines). */
  const slab = (r: readonly [number, number, number, number], y: number, edges: [number, number, number, number][]) => {
    const [x0, z0, x1, z1] = r;
    m.box(white, x1 - x0, 0.4, z1 - z0, (x0 + x1) / 2, y - 0.4, (z0 + z1) / 2);
    m.box(oak, x1 - x0 - 0.02, 0.02, z1 - z0 - 0.02, (x0 + x1) / 2, y - 0.01, (z0 + z1) / 2);
    for (const [ax, az, bx, bz] of edges) {
      const alongX = Math.abs(az - bz) < 0.001;
      const len = alongX ? bx - ax : bz - az;
      m.box(white, alongX ? len : 0.08, 1.0, alongX ? 0.08 : len, (ax + bx) / 2, y, (az + bz) / 2);
      m.box(ledMat, alongX ? len : 0.09, 0.015, alongX ? 0.09 : len, (ax + bx) / 2, y + 1.0, (az + bz) / 2);
    }
  };

  // the first flight: up from the floor, away from the entrance; the second: back towards it
  flight(S.a[0], S.a[1], S.foot, G_Y, S.head, T1_Y);
  flight(S.b[0], S.b[1], S.head, T1_Y, S.foot, T2_Y);
  // the landing at T1, over the seating steps to the terrace (open towards it, and onto both flights)
  const [, lz0, lx1, lz1] = S.landing;
  slab([S.t1Edge, lz0, lx1, lz1], T1_Y, [
    [S.t1Edge, lz0 + 0.04, lx1, lz0 + 0.04],
    [lx1 - 0.04, lz0, lx1 - 0.04, lz1],
    [S.t1Edge, lz1 - 0.04, S.b[0], lz1 - 0.04],
  ]);
  // a white column under its outer corner
  m.cyl(white, 0.22, 0.22, T1_Y - 0.4, lx1 - 0.3, G_Y, lz0 + 0.3, 16);
  // the bridge at T2, from the second flight's head over the first terrace to the second
  const [, bz0, bx1, bz1] = S.bridge;
  slab([S.t2Edge, bz0, bx1, bz1], T2_Y, [
    [S.t2Edge, bz1 - 0.04, bx1, bz1 - 0.04],
    [bx1 - 0.04, bz0, bx1 - 0.04, bz1],
    [S.t2Edge, bz0 + 0.04, S.b[0], bz0 + 0.04],
  ]);
  // hung from the ceiling by rods, in pairs along it
  for (let x = S.t2Edge + 1.2; x < bx1; x += 3.2)
    for (const z of [bz0 + 0.15, bz1 - 0.15]) m.cyl(rod, 0.025, 0.025, CEIL - T2_Y, x, T2_Y, z, 6);
  m.flush(parent);
  return [[lx1 - 0.55, lz0 + 0.05, lx1 - 0.05, lz0 + 0.55]];
}
