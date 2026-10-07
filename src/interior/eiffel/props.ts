import * as THREE from "three";
import { std } from "../kit";
import { EiffelKit, LEVELS } from "./kit";

/** Small pieces shared by the floors: dressed tables, Paris lamp posts, queue posts, souvenirs. */

/** A round restaurant table with a white cloth, a candle or a little lamp, plates and glasses. */
export function clothTable(k: EiffelKit, f: number, x: number, z: number, r = 0.45, o: { candle?: boolean; dark?: boolean } = {}) {
  const y = LEVELS[f].y;
  const g = k.groups[f];
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.05, 0.74, 20), std(o.dark ? "#18161c" : "#f2efe8", 0.85));
  cloth.position.set(x, y + 0.37, z);
  g.add(cloth);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.02, r - 0.02, 0.02, 20), std(o.dark ? "#22201e" : "#faf8f2", 0.7));
  top.position.set(x, y + 0.75, z);
  g.add(top);
  for (const a of [0.4, 0.4 + Math.PI]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.015, 14), std("#ffffff", 0.3));
    plate.position.set(x + Math.cos(a) * r * 0.6, y + 0.77, z + Math.sin(a) * r * 0.6);
    g.add(plate);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.14, 8), k.glass);
    glass.position.set(x + Math.cos(a + 0.6) * r * 0.55, y + 0.83, z + Math.sin(a + 0.6) * r * 0.55);
    g.add(glass);
  }
  if (o.candle !== false) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), k.glow("#ffd890", 1.4, 2.4));
    c.position.set(x, y + 0.82, z);
    g.add(c);
  }
  k.rects[f].push([x - r, z - r, x + r, z + r]);
}

/** A cast-iron Paris lamp post (lantern on a fluted post). */
export function parisLamp(k: EiffelKit, f: number, x: number, z: number, h = 3.6) {
  const y = LEVELS[f].y;
  const key = String(f);
  const green = std("#1f3a2c", 0.5, 0.5);
  k.addGeo(key, new THREE.CylinderGeometry(0.06, 0.1, h, 8).translate(x, y + h / 2, z), green);
  k.addGeo(key, new THREE.CylinderGeometry(0.18, 0.22, 0.4, 8).translate(x, y + 0.2, z), green);
  k.addGeo(key, new THREE.ConeGeometry(0.26, 0.24, 6).translate(x, y + h + 0.62, z), green);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.5, 6), k.glow("#ffe2a8", 1.1, 2.6));
  lantern.position.set(x, y + h + 0.25, z);
  k.groups[f].add(lantern);
  k.rects[f].push([x - 0.2, z - 0.2, x + 0.2, z + 0.2]);
}

/** A row of brass queue posts with a red rope between them. */
export function queueLine(k: EiffelKit, f: number, pts: [number, number][], solid = true) {
  const y = LEVELS[f].y;
  const key = String(f);
  const rope = std("#9a2028", 0.6);
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    k.addGeo(key, new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8).translate(x, y + 0.475, z), k.brass);
    k.addGeo(key, new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10).translate(x, y + 0.02, z), k.brass);
    if (i) {
      const [px, pz] = pts[i - 1];
      const a = new THREE.Vector3(px, y + 0.88, pz),
        b = new THREE.Vector3(x, y + 0.88, z);
      const m = a.clone().lerp(b, 0.5).setY(y + 0.78);
      k.beam(key, a, m, 0.03, rope);
      k.beam(key, m, b, 0.03, rope);
      if (solid) k.rects[f].push([Math.min(px, x) - 0.05, Math.min(pz, z) - 0.05, Math.max(px, x) + 0.05, Math.max(pz, z) + 0.05]);
    }
  }
}

/** Little bronze Eiffel towers, for shelves and the vendors' cloths. */
export function miniTower(k: EiffelKit, key: string, x: number, y: number, z: number, h: number, mat: THREE.Material) {
  const g = new THREE.ConeGeometry(h * 0.22, h, 4, 1, false, Math.PI / 4);
  g.translate(x, y + h / 2, z);
  k.addGeo(key, g, mat);
  k.addGeo(key, new THREE.BoxGeometry(h * 0.3, h * 0.05, h * 0.3).translate(x, y + h * 0.3, z), mat);
}

/** A glazed pavilion: iron posts, glass between, a roof slab, door gaps; returns nothing, adds colliders. */
export function pavilion(k: EiffelKit, f: number, x0: number, z0: number, x1: number, z1: number, h: number, doors: { side: "n" | "s" | "e" | "w"; at: number; w: number }[], roof: THREE.Material) {
  const y = LEVELS[f].y;
  const key = String(f);
  const g = k.groups[f];
  k.slab(key, x1 - x0 + 0.3, 0.25, z1 - z0 + 0.3, (x0 + x1) / 2, y + h, (z0 + z1) / 2, roof);
  k.slab(key, x1 - x0 + 0.4, 0.08, z1 - z0 + 0.4, (x0 + x1) / 2, y + h + 0.25, (z0 + z1) / 2, k.ironDark);
  const sides: { s: "n" | "s" | "e" | "w"; a: [number, number]; b: [number, number] }[] = [
    { s: "n", a: [x0, z0], b: [x1, z0] },
    { s: "s", a: [x0, z1], b: [x1, z1] },
    { s: "w", a: [x0, z0], b: [x0, z1] },
    { s: "e", a: [x1, z0], b: [x1, z1] },
  ];
  for (const sd of sides) {
    const alongX = sd.a[1] === sd.b[1];
    const lo = alongX ? sd.a[0] : sd.a[1],
      hi = alongX ? sd.b[0] : sd.b[1];
    const gaps = doors.filter((d) => d.side === sd.s).map((d) => [d.at - d.w / 2, d.at + d.w / 2] as [number, number]);
    // split the side into solid runs between the doors
    const runs: [number, number][] = [];
    let cur = lo;
    for (const [a, b] of gaps.sort((p, q) => p[0] - q[0])) {
      if (a > cur) runs.push([cur, a]);
      cur = b;
    }
    if (cur < hi) runs.push([cur, hi]);
    for (const [a, b] of runs) {
      const A: [number, number] = alongX ? [a, sd.a[1]] : [sd.a[0], a],
        B: [number, number] = alongX ? [b, sd.a[1]] : [sd.a[0], b];
      k.pane(g, A, B, y, h);
      k.rects[f].push([Math.min(A[0], B[0]) - 0.08, Math.min(A[1], B[1]) - 0.08, Math.max(A[0], B[0]) + 0.08, Math.max(A[1], B[1]) + 0.08]);
      const n = Math.max(1, Math.round((b - a) / 1.3));
      for (let i = 0; i <= n; i++) {
        const t = a + ((b - a) * i) / n;
        const px = alongX ? t : sd.a[0],
          pz = alongX ? sd.a[1] : t;
        k.slab(key, 0.1, h, 0.1, px, y, pz, k.ironDark);
      }
      // sill and transom
      k.slab(key, alongX ? b - a : 0.12, 0.12, alongX ? 0.12 : b - a, alongX ? (a + b) / 2 : sd.a[0], y, alongX ? sd.a[1] : (a + b) / 2, k.ironDark);
      k.slab(key, alongX ? b - a : 0.1, 0.08, alongX ? 0.1 : b - a, alongX ? (a + b) / 2 : sd.a[0], y + h * 0.78, alongX ? sd.a[1] : (a + b) / 2, k.ironDark);
    }
    for (const [a, b] of gaps) {
      // the lintel over each door
      k.slab(key, alongX ? b - a : 0.14, h - 2.3, alongX ? 0.14 : b - a, alongX ? (a + b) / 2 : sd.a[0], y + 2.3, alongX ? sd.a[1] : (a + b) / 2, k.ironDark);
    }
  }
}
