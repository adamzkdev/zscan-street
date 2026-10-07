import * as THREE from "three";
import { C, GOLD, type Finish, type ReserveKit } from "./kit";

/**
 * The Reserve's architecture and fittings, built from plain geometry into the floor's merges:
 * fluted columns with Corinthian capitals, coffered ceilings, chandeliers, bronze grilles,
 * banker's lamps, stanchions with velvet ropes, urns with palms, benches, railings.
 */

/** A fluted column with a green marble pedestal, gilt torus and a Corinthian capital. */
export function column(k: ReserveKit, f: number, x: number, z: number, h: number, r = 0.7, shaft = C.ivory) {
  k.box(f, r * 2.6, 0.9, r * 2.6, x, 0, z, C.greenMarble, "polish");
  k.box(f, r * 2.75, 0.12, r * 2.75, x, 0.9, z, C.brass, "metal");
  k.cyl(f, r * 1.25, r * 1.15, 0.22, x, 1.02, z, C.gold, "metal", 24);
  const sh = h - 1.24 - 1.5;
  k.cyl(f, r, r * 0.92, sh, x, 1.24, z, shaft, "polish", 24);
  // flutes: 16 shallow ridges
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.box(f, 0.07, sh - 0.3, 0.07, x + Math.cos(a) * r * 0.97, 1.39, z + Math.sin(a) * r * 0.97, C.cream, "polish", -a);
  }
  // capital: necking, a bell of acanthus leaves in gold, volutes, the abacus
  const y = h - 1.5;
  k.cyl(f, r * 0.95, r * 0.95, 0.12, x, y, z, C.gold, "metal", 24);
  k.cyl(f, r * 0.95, r * 1.3, 0.9, x, y + 0.12, z, C.cream, "polish", 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const lr = r * (i % 2 ? 1.05 : 1.16);
    k.box(f, 0.24, i % 2 ? 0.5 : 0.75, 0.12, x + Math.cos(a) * lr, y + 0.14, z + Math.sin(a) * lr, GOLD, "metal", -a + Math.PI / 2);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.cyl(f, 0.16, 0.16, 0.2, x + Math.cos(a) * r * 1.35, y + 0.85, z + Math.sin(a) * r * 1.35, GOLD, "metal", 10);
  }
  k.box(f, r * 3, 0.36, r * 3, x, y + 1.02, z, C.cream, "polish");
  k.box(f, r * 3.1, 0.1, r * 3.1, x, y + 1.38, z, C.brass, "metal");
  k.solid(f, x - r * 1.3, z - r * 1.3, x + r * 1.3, z + r * 1.3);
}

/** A square pilaster against a wall (`n`: its outward normal, 'x' or 'z' and a sign). */
export function pilaster(k: ReserveKit, f: number, x: number, z: number, h: number, along: "x" | "z", w = 1.0) {
  const [bw, bd] = along === "x" ? [w, 0.35] : [0.35, w];
  k.box(f, bw + 0.2, 0.9, bd + 0.1, x, 0, z, C.greenMarble, "polish");
  k.box(f, bw, h - 2.2, bd, x, 0.9, z, C.travertine, "polish");
  k.box(f, bw + 0.16, 0.5, bd + 0.08, x, h - 1.3, z, GOLD, "metal");
  k.box(f, bw + 0.3, 0.3, bd + 0.14, x, h - 0.8, z, C.cream, "polish");
}

/** Coffered ceiling over a rectangle: deep beams on a grid, a gilt rosette in every coffer. */
export function coffers(k: ReserveKit, f: number, x0: number, z0: number, x1: number, z1: number, y: number, step = 2.5, skip?: (x: number, z: number) => boolean) {
  const nx = Math.round((x1 - x0) / step),
    nz = Math.round((z1 - z0) / step);
  const sx = (x1 - x0) / nx,
    sz = (z1 - z0) / nz;
  for (let i = 0; i <= nx; i++) k.box(f, 0.32, 0.55, z1 - z0, x0 + i * sx, y - 0.55, (z0 + z1) / 2, C.cream, "polish");
  for (let j = 0; j <= nz; j++) k.box(f, x1 - x0, 0.55, 0.32, (x0 + x1) / 2, y - 0.55, z0 + j * sz, C.cream, "polish");
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const cx = x0 + (i + 0.5) * sx,
        cz = z0 + (j + 0.5) * sz;
      if (skip?.(cx, cz)) continue;
      // a stepped inner frame and the rosette
      k.box(f, sx - 0.5, 0.08, 0.1, cx, y - 0.2, cz - sz / 2 + 0.3, C.stoneShade, "matte");
      k.box(f, sx - 0.5, 0.08, 0.1, cx, y - 0.2, cz + sz / 2 - 0.3, C.stoneShade, "matte");
      k.box(f, 0.1, 0.08, sz - 0.5, cx - sx / 2 + 0.3, y - 0.2, cz, C.stoneShade, "matte");
      k.box(f, 0.1, 0.08, sz - 0.5, cx + sx / 2 - 0.3, y - 0.2, cz, C.stoneShade, "matte");
      k.cyl(f, 0.26, 0.18, 0.14, cx, y - 0.14, cz, GOLD, "metal", 12);
    }
  k.box(f, x1 - x0, 0.05, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, "#d9ccb2", "matte");
}

/** A brass chandelier: a stem from the ceiling, tiers of rings with lit bulbs and crystal drops. */
export function chandelier(k: ReserveKit, f: number, x: number, z: number, top: number, s = 1) {
  const drop = 2.4 * s;
  k.cyl(f, 0.04, 0.04, top - drop - 1.4 * s, x, drop + 1.4 * s, z, C.brass, "metal", 6);
  k.cyl(f, 0.3 * s, 0.3 * s, 0.12, x, top - 0.12, z, C.brass, "metal", 12);
  const base = top - drop - 1.4 * s;
  const tiers = [
    [1.25, 0.0, 18],
    [0.9, 0.55, 14],
    [0.55, 1.05, 10],
  ] as const;
  k.cyl(f, 0.08 * s, 0.22 * s, 1.5 * s, x, base - 0.2 * s, z, C.brass, "metal", 10);
  k.cyl(f, 0.0, 0.18 * s, 0.4 * s, x, base - 0.55 * s, z, GOLD, "metal", 10);
  for (const [r0, dy, n] of tiers) {
    const r = r0 * s,
      y = base + dy * s;
    const ring = new THREE.TorusGeometry(r, 0.035 * s, 6, 40).rotateX(Math.PI / 2).translate(x, y, z);
    k.geo(f, ring, C.brass, "metal");
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const bx = x + Math.cos(a) * r,
        bz = z + Math.sin(a) * r;
      k.cyl(f, 0.05 * s, 0.05 * s, 0.1 * s, bx, y, bz, GOLD, "metal", 6);
      k.geo(f, new THREE.SphereGeometry(0.075 * s, 8, 6).translate(bx, y + 0.17 * s, bz), "#fff1cc", "glow");
      if (i % 2 === 0) k.geo(f, new THREE.OctahedronGeometry(0.06 * s).scale(0.7, 1.6, 0.7).translate(bx * 0.97 + x * 0.03, y - 0.18 * s, bz * 0.97 + z * 0.03), "#eaf4ff", "polish");
    }
    // the arms
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      k.box(f, r, 0.04 * s, 0.04 * s, x + (Math.cos(a) * r) / 2, y, z + (Math.sin(a) * r) / 2, C.brass, "metal", -a);
    }
  }
}

/** A green-shaded banker's lamp on a desk at height y. */
export function bankerLamp(k: ReserveKit, f: number, x: number, y: number, z: number, ry = 0) {
  k.box(f, 0.22, 0.03, 0.12, x, y, z, C.brass, "metal", ry);
  k.cyl(f, 0.012, 0.012, 0.32, x, y + 0.03, z, C.brass, "metal", 6);
  const shade = new THREE.CylinderGeometry(0.03, 0.08, 0.36, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(ry + Math.PI / 2).translate(x, y + 0.36, z);
  k.geo(f, shade, "#1d6a3a", "polish");
  k.box(f, 0.3, 0.015, 0.05, x, y + 0.33, z, "#fff0c0", "glow", ry);
}

/** A brass stanchion; `rope` runs a velvet rope to (x2, z2). */
export function stanchion(k: ReserveKit, f: number, x: number, z: number, rope?: [number, number]) {
  k.cyl(f, 0.17, 0.17, 0.04, x, 0, z, C.brass, "metal", 12);
  k.cyl(f, 0.025, 0.025, 0.95, x, 0.04, z, C.brass, "metal", 8);
  k.geo(f, new THREE.SphereGeometry(0.05, 8, 6).translate(x, 1.0, z), GOLD, "metal");
  if (rope) {
    const [x2, z2] = rope;
    const len = Math.hypot(x2 - x, z2 - z);
    const a = Math.atan2(z2 - z, x2 - x);
    // a sagging rope: three segments
    const pts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(x + (x2 - x) * t, 0.92 - Math.sin(t * Math.PI) * 0.12, z + (z2 - z) * t));
    for (let i = 0; i < 3; i++) {
      const p = pts[i],
        q = pts[i + 1];
      const l = p.distanceTo(q);
      const g = new THREE.CylinderGeometry(0.025, 0.025, l, 6).rotateZ(Math.PI / 2);
      const tilt = Math.atan2(q.y - p.y, len / 3);
      g.rotateZ(tilt);
      g.rotateY(-a);
      g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      k.geo(f, g, C.velvet, "matte");
    }
    k.solid(f, Math.min(x, x2) - 0.05, Math.min(z, z2) - 0.05, Math.max(x, x2) + 0.05, Math.max(z, z2) + 0.05);
  }
}

/** A stone urn with a palm. */
export function urn(k: ReserveKit, f: number, x: number, z: number, seed = 1) {
  k.box(f, 0.9, 0.5, 0.9, x, 0, z, C.greenMarble, "polish");
  k.cyl(f, 0.32, 0.5, 0.7, x, 0.5, z, C.cream, "polish", 16);
  k.cyl(f, 0.5, 0.56, 0.12, x, 1.2, z, GOLD, "metal", 16);
  k.cyl(f, 0.48, 0.48, 0.05, x, 1.25, z, "#2a1d14", "matte", 16);
  k.cyl(f, 0.05, 0.08, 1.6, x, 1.25, z, "#5a4128", "matte", 6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + seed;
    const len = 1.1 + k.rnd(seed, i) * 0.5;
    const g = new THREE.BoxGeometry(len, 0.03, 0.26).translate(len / 2, 0, 0).rotateZ(-0.35 - k.rnd(i, seed) * 0.5).rotateY(-a).translate(x, 2.8, z);
    k.geo(f, g, i % 2 ? "#2f6b3c" : "#3d8a4a", "matte");
  }
  k.solid(f, x - 0.45, z - 0.45, x + 0.45, z + 0.45);
}

/** A long mahogany bench with brass feet, along x (or z when `ry` is π/2). */
export function bench(k: ReserveKit, f: number, x: number, z: number, len: number, alongZ = false) {
  const [w, d] = alongZ ? [0.55, len] : [len, 0.55];
  k.box(f, w, 0.1, d, x, 0.42, z, C.mahogany, "polish");
  k.box(f, alongZ ? 0.5 : len, 0.06, alongZ ? len : 0.5, x, 0.52, z, C.velvet, "matte");
  for (const t of [-0.42, 0.42]) k.box(f, alongZ ? 0.5 : 0.08, 0.42, alongZ ? 0.08 : 0.5, x + (alongZ ? 0 : t * len), 0, z + (alongZ ? t * len : 0), C.brass, "metal");
  k.solid(f, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}

/** A run of balusters with a rail, from (x0, z0) to (x1, z1) at height y. */
export function balustrade(k: ReserveKit, f: number, x0: number, z0: number, x1: number, z1: number, y = 0, h = 1.05, color = C.cream, finish: Finish = "polish", solid = true) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const a = Math.atan2(z1 - z0, x1 - x0);
  const n = Math.max(2, Math.round(len / 0.32));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    k.cyl(f, 0.06, 0.08, h - 0.2, x0 + (x1 - x0) * t, y + 0.1, z0 + (z1 - z0) * t, color, finish, 6);
  }
  k.box(f, len, 0.1, 0.24, (x0 + x1) / 2, y, (z0 + z1) / 2, color, finish, -a);
  k.box(f, len + 0.1, 0.12, 0.26, (x0 + x1) / 2, y + h - 0.12, (z0 + z1) / 2, color, finish, -a);
  if (solid) k.solid(f, Math.min(x0, x1) - 0.14, Math.min(z0, z1) - 0.14, Math.max(x0, x1) + 0.14, Math.max(z0, z1) + 0.14);
}

/** A glass railing with a brass handrail. */
export function glassRail(k: ReserveKit, f: number, x0: number, z0: number, x1: number, z1: number, y = 0, h = 1.1, solid = true) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const a = Math.atan2(z1 - z0, x1 - x0);
  k.box(f, len, h - 0.06, 0.03, (x0 + x1) / 2, y, (z0 + z1) / 2, "#bfe0f0", "glass", -a);
  k.box(f, len, 0.06, 0.08, (x0 + x1) / 2, y + h - 0.06, (z0 + z1) / 2, C.brass, "metal", -a);
  const n = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i <= n; i++) k.box(f, 0.05, h, 0.05, x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n, C.brass, "metal");
  if (solid) k.solid(f, Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1);
}

/** A desk of mahogany with a leather top, facing +z (the sitter on −z). */
export function desk(k: ReserveKit, f: number, x: number, z: number, w = 1.8, d = 0.9, ry = 0) {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const at = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c] as const;
  const [px, pz] = at(0, 0);
  k.box(f, w, 0.06, d, px, 0.72, pz, C.mahogany, "polish", ry);
  k.box(f, w - 0.3, 0.012, d - 0.25, px, 0.78, pz, "#1d3a2a", "matte", ry);
  for (const lx of [-w / 2 + 0.25, w / 2 - 0.25]) {
    const [qx, qz] = at(lx, 0);
    k.box(f, 0.45, 0.72, d - 0.05, qx, 0, qz, C.mahogany, "polish", ry);
  }
  const [mx, mz] = at(0, -d / 2 + 0.06);
  k.box(f, w - 0.9, 0.5, 0.04, mx, 0.22, mz, C.walnut, "polish", ry);
  const hw = Math.abs(c) > 0.5 ? w / 2 : d / 2,
    hd = Math.abs(c) > 0.5 ? d / 2 : w / 2;
  k.solid(f, px - hw, pz - hd, px + hw, pz + hd);
}

/** A leather chair (club style) facing `ry` (0: faces +z). */
export function clubChair(k: ReserveKit, f: number, x: number, z: number, ry = 0, color = "#5a2a1a") {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const at = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c] as const;
  k.box(f, 0.7, 0.42, 0.7, x, 0, z, color, "polish", ry);
  let [bx, bz] = at(0, -0.3);
  k.box(f, 0.7, 0.55, 0.14, bx, 0.42, bz, color, "polish", ry);
  for (const lx of [-0.32, 0.32]) {
    [bx, bz] = at(lx, 0);
    k.box(f, 0.12, 0.28, 0.66, bx, 0.42, bz, color, "polish", ry);
  }
  k.solid(f, x - 0.35, z - 0.35, x + 0.35, z + 0.35);
}

/** A screen hung or set in a frame: a bronze bezel round a plane, facing `ry`. */
export function bezel(k: ReserveKit, f: number, w: number, h: number, x: number, y: number, z: number, ry: number, color = "#16130e") {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const bx = x - s * 0.04,
    bz = z - c * 0.04;
  k.box(f, w + 0.16, h + 0.16, 0.08, bx, y - h / 2 - 0.08, bz, color, "polish", ry);
}
