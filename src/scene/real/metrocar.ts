import * as THREE from "three";
import { hex, Kit, type Slot, type V3 } from "./lmkit";
import { realMat } from "./mats";
import type { RGeo } from "./buildings";

/**
 * The elevated metro's cars, realistic (branch gta-real): a stainless body with rounded roof edges,
 * the line's colour in a band, a glazed window band (its panes and the per-transaction lit slots
 * are the train's own, src/scene/metro.ts), two pairs of doors a side, Japanese-style bench seats,
 * ceiling light strips and hand straps inside, bogies with wheels. The lead car has a raked nose,
 * a dark windscreen and headlights. Same frame as the voxel cars it replaces: x along the car
 * (+x forward), y up from the rail, z across, centred; 9 m × 2.67 m × 3.33 m.
 *
 * Shared per line and end (each train's cars use the same geometry): freeObject leaves them be.
 */

const L = 9,
  Wd = 16 / 6,
  Ht = 20 / 6;
const FLOOR = 4 / 6,
  WIN0 = 8 / 6,
  WIN1 = 16 / 6;

const cache = new Map<string, Partial<Record<Slot, RGeo>>>();

function build(lead: boolean, stripe: string) {
  const K = new Kit({ lod: 0 });
  const x0 = -L / 2,
    x1 = L / 2,
    zh = Wd / 2 - 1 / 6;
  const body = hex("#d9dde6"),
    dark = hex("#2a2a34"),
    roofC = hex("#9aa0ac"),
    band = hex(stripe);
  const S: Slot = "lm.Metal032.metal";
  // the underframe and skirt
  K.box("lm.dark", x0 + 0.1, 2 / 6, -zh, x1 - 0.1, FLOOR, zh, dark);
  // the sides: solid below the windows and above them, pillars between, the doors
  for (const sd of [1, -1]) {
    const z = sd * zh;
    const zi = z - sd * 0.06;
    const box = (a: number, b: number, y0: number, y1: number, col: V3, s: Slot = S) => K.box(s, a, y0, Math.min(z, zi), b, y1, Math.max(z, zi), col, { skip: "" });
    box(x0, x1, FLOOR, WIN0, body);
    box(x0, x1, WIN1, Ht - 0.35, body);
    // the line's band and a thin gold pinstripe
    K.box("lm.paint", x0, 5 / 6, Math.min(z, z + sd * 0.01), x1, 6 / 6, Math.max(z, z + sd * 0.01), band);
    K.box("lm.paint", x0, WIN1 + 0.05, Math.min(z, z + sd * 0.01), x1, WIN1 + 0.1, Math.max(z, z + sd * 0.01), band);
    // pillars between the windows (every 1.5 m), the window frames
    for (let x = x0 + 0.5; x < x1 - 0.4; x += 1.5) box(x, x + 0.16, WIN0, WIN1, body);
    box(x0, x0 + 0.5, WIN0, WIN1, body);
    box(x1 - 0.5, x1, WIN0, WIN1, body);
    // the doors (two a side): grey leaves with their own glass and a rubber seam
    for (const dx of [10 / 6, (54 - 14) / 6]) {
      const a = x0 + dx,
        b = a + 4 / 6;
      K.box("lm.Metal032.metal", a, FLOOR, Math.min(z, z + sd * 0.02), b, WIN1, Math.max(z, z + sd * 0.02), hex("#c4c8d2"));
      K.box("lm.dark", (a + b) / 2 - 0.015, FLOOR, Math.min(z, z + sd * 0.03), (a + b) / 2 + 0.015, WIN1, Math.max(z, z + sd * 0.03), hex("#1a1a20"));
      for (const [g0, g1] of [
        [a + 0.06, (a + b) / 2 - 0.05],
        [(a + b) / 2 + 0.05, b - 0.06],
      ])
        K.quad("lm.glass", [g0, WIN0 + 0.1, z + sd * 0.025], [g1, WIN0 + 0.1, z + sd * 0.025], [g1, WIN1 - 0.12, z + sd * 0.025], [g0, WIN1 - 0.12, z + sd * 0.025], [0, 0, sd], (p) => [p[0], p[1]], hex("#3a4452"));
    }
  }
  // the roof: rounded edges (a quarter round each side), the flat top, a vent and the pantograph's base
  {
    const N = 6,
      r = 0.35;
    for (const sd of [1, -1])
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * (Math.PI / 2),
          a1 = ((i + 1) / N) * (Math.PI / 2);
        const P = (a: number, x: number): V3 => [x, Ht - r + Math.sin(a) * r, sd * (zh - r + Math.cos(a) * r)];
        const n: V3 = [0, Math.sin((a0 + a1) / 2), sd * Math.cos((a0 + a1) / 2)];
        if (sd > 0) K.quad(S, P(a0, x1), P(a1, x1), P(a1, x0), P(a0, x0), n, (p) => [p[0], p[1] + p[2]], i < 2 ? body : roofC);
        else K.quad(S, P(a0, x0), P(a1, x0), P(a1, x1), P(a0, x1), n, (p) => [p[0], p[1] + p[2]], i < 2 ? body : roofC);
      }
    K.box(S, x0, Ht - 0.02, -(zh - 0.35), x1, Ht, zh - 0.35, roofC, { skip: "-y" });
    K.box(S, -1.2, Ht, -0.5, 1.2, Ht + 0.22, 0.5, hex("#7a808c"));
    // the ends' walls (with the gangway door)
    for (const [x, sx] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      if (lead && sx > 0) continue;
      K.box(S, Math.min(x, x - sx * 0.06), FLOOR, -zh, Math.max(x, x - sx * 0.06), Ht - 0.02, zh, body);
      K.box("lm.dark", Math.min(x, x + sx * 0.02), FLOOR, -0.45, Math.max(x, x + sx * 0.02), WIN1 + 0.1, 0.45, hex("#3a3a44"));
    }
  }
  // inside: the floor, blue bench seats along both sides, light strips, hand straps
  K.box("lm.dark", x0 + 0.06, FLOOR - 0.05, -zh + 0.06, x1 - 0.06, FLOOR, zh - 0.06, hex("#5a5866"));
  for (const sd of [1, -1]) {
    const zs = sd * (zh - 0.3);
    for (const [a, b] of [
      [x0 + 0.5, x0 + 10 / 6],
      [x0 + 14 / 6, x1 - 14 / 6],
      [x1 - 10 / 6, x1 - 0.5],
    ]) {
      K.box("lm.paint", a, FLOOR, zs - 0.25, b, FLOOR + 0.45, zs + 0.25, hex("#3a6aa0"));
      K.box("lm.paint", a, FLOOR + 0.45, sd > 0 ? zs + 0.15 : zs - 0.25, b, WIN0, sd > 0 ? zs + 0.25 : zs - 0.15, hex("#2c5285"));
    }
    for (let x = x0 + 0.7; x < x1 - 0.6; x += 0.5) {
      K.bar("lm.dark", [x, Ht - 0.5, sd * (zh - 0.7)], [x, Ht - 0.9, sd * (zh - 0.7)], 0.02, hex("#8a8698"));
      K.box("lm.plastic", x - 0.06, Ht - 1.02, sd * (zh - 0.7) - 0.01, x + 0.06, Ht - 0.9, sd * (zh - 0.7) + 0.01, hex("#f4f0e8"));
    }
    K.bar("lm.chrome", [x0 + 0.5, Ht - 0.5, sd * (zh - 0.7)], [x1 - 0.5, Ht - 0.5, sd * (zh - 0.7)], 0.03, hex("#d8dce0"));
  }
  K.box("lm.Plaster001", x0 + 0.06, Ht - 0.42, -zh + 0.06, x1 - 0.06, Ht - 0.36, zh - 0.06, hex("#e8e8ec"));
  for (let x = x0 + 0.8; x < x1 - 0.8; x += 1) K.box("lm.glow", x, Ht - 0.44, -0.15, x + 0.6, Ht - 0.42, 0.15, hex("#fff4e0"));
  // the bogies: a frame and two wheelsets each
  for (const bx of [x0 + 1.6, x1 - 1.6]) {
    K.box("lm.dark", bx - 1, 0.25, -zh + 0.25, bx + 1, 0.55, zh - 0.25, dark);
    for (const wx of [bx - 0.6, bx + 0.6])
      for (const sd of [1, -1]) {
        const N = 10,
          r = 0.32,
          zz = sd * 0.72;
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2,
            a1 = ((i + 1) / N) * Math.PI * 2;
          const P = (a: number, z: number): V3 => [wx + Math.cos(a) * r, 0.33 + Math.sin(a) * r, z];
          K.quad("lm.dark", P(a0, zz - 0.06), P(a1, zz - 0.06), P(a1, zz + 0.06), P(a0, zz + 0.06), [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0], (p) => [p[0], p[1]], hex("#1c1c22"));
          for (const [z, nz] of [
            [zz + 0.06, 1],
            [zz - 0.06, -1],
          ] as const)
            K.tri("lm.dark", [wx, 0.33, z], nz > 0 ? P(a0, z) : P(a1, z), nz > 0 ? P(a1, z) : P(a0, z), [0, 0, nz], (p) => [p[0], p[1]], hex("#3a3a44"));
        }
      }
  }
  // the tail lights (both ends: the trains run both ways round)
  for (const zz of [-zh + 0.3, zh - 0.5]) K.box("lm.glow", x0 - 0.02, 4 / 6, zz, x0, 6 / 6, zz + 0.25, hex("#ff2a1a"));
  if (lead) {
    // the raked nose: the roof slopes down to a dark windscreen; the front's lower panel, headlights
    const xn = x1 + 0.5;
    K.quad(S, [x1, Ht - 0.02, -zh + 0.3], [x1, Ht - 0.02, zh - 0.3], [xn - 0.1, WIN1 + 0.15, zh - 0.15], [xn - 0.1, WIN1 + 0.15, -zh + 0.15], [0.6, 0.8, 0], (p) => [p[0], p[2]], body);
    K.quad("lm.glass", [xn - 0.1, WIN1 + 0.15, -zh + 0.15], [xn - 0.1, WIN1 + 0.15, zh - 0.15], [xn, WIN0 + 0.05, zh - 0.1], [xn, WIN0 + 0.05, -zh + 0.1], [0.99, 0.08, 0], (p) => [p[2], p[1]], hex("#101420"));
    K.quad(S, [xn, WIN0 + 0.05, -zh + 0.1], [xn, WIN0 + 0.05, zh - 0.1], [xn - 0.05, 2 / 6, zh - 0.1], [xn - 0.05, 2 / 6, -zh + 0.1], [1, 0, 0], (p) => [p[2], p[1]], body);
    for (const sd of [1, -1]) {
      const z = sd * zh;
      K.quad(S, sd > 0 ? [x1, 2 / 6, z] : [xn - 0.05, 2 / 6, sd * (zh - 0.1)], sd > 0 ? [xn - 0.05, 2 / 6, sd * (zh - 0.1)] : [x1, 2 / 6, z], sd > 0 ? [xn - 0.1, WIN1 + 0.15, sd * (zh - 0.15)] : [x1, Ht - 0.02, sd * (zh - 0.3)], sd > 0 ? [x1, Ht - 0.02, sd * (zh - 0.3)] : [xn - 0.1, WIN1 + 0.15, sd * (zh - 0.15)], [0.3, 0, sd], (p) => [p[0], p[1]], body);
      K.box("lm.glow", xn - 0.02, 4 / 6, sd > 0 ? zh - 0.6 : -zh + 0.3, xn + 0.01, 6 / 6, sd > 0 ? zh - 0.3 : -zh + 0.6, hex("#fff6e0"));
    }
    K.box("lm.paint", xn - 0.03, 5 / 6, -zh + 0.7, xn + 0.005, 6 / 6, zh - 0.7, band);
  }
  return K.out();
}

/** A car's mesh group (shared geometry per line colour and end). */
export function realCarObject(lead: boolean, stripe: string): THREE.Group {
  const key = `${lead ? "head" : "car"}:${stripe}`;
  let geos = cache.get(key);
  if (!geos) cache.set(key, (geos = build(lead, stripe)));
  const g = new THREE.Group();
  // (for the dev shots: shots/_realmetro.mjs finds the cars by it)
  g.userData.metroCar = lead ? "head" : "car";
  for (const [slot, d] of Object.entries(geos) as [Slot, RGeo][]) {
    let geo = (d as RGeo & { geo?: THREE.BufferGeometry }).geo;
    if (!geo) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(d.nor, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(d.uv, 2));
      geo.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
      geo.setIndex(Array.from(d.idx));
      geo.computeBoundingSphere();
      geo.userData.shared = true;
      (d as RGeo & { geo?: THREE.BufferGeometry }).geo = geo;
    }
    const mesh = new THREE.Mesh(geo, realMat(slot as never));
    const lit = slot === "lm.glow" || slot === "neon";
    mesh.castShadow = !lit && slot !== "lm.glass";
    mesh.receiveShadow = !lit;
    g.add(mesh);
  }
  return g;
}
