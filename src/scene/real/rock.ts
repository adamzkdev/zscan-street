import * as THREE from "three";
import { GATE, HOUSE, LIGHT, PIER, TANK, TOWER, WALL } from "../prison-model";
import { frameOf, glow, Parts, tiled, type V3 } from "./baymarks";
import { real } from "./tex";

/**
 * The rock's landmarks, realistic (branch gta-real): the cell house's shell, the water tower, the
 * lighthouse and the guard towers of the ZEC State Penitentiary, no voxels. Written in the voxel
 * parts' own model voxels (src/scene/prison-model.ts: six to the metre, the same constants), so
 * they stand exactly where those stood: prison.ts places them as it placed the voxel models
 * (centred on x and z, y up from the island's floor). The cell wing, the walls and the yard keep
 * their voxels for now (the game's cells and bars are in them).
 */

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => tiled(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }), 2);
  return {
    concrete: tiled(real("Concrete012", { tint: "#ece6da" }), 2.5),
    band: tiled(real("Concrete012", { tint: "#f4efe6" }), 2.5),
    plinth: tiled(real("Concrete034", { tint: "#8f897f" }), 2),
    tar: std("#3a3740", 0.95),
    iron: std("#2e2c33", 0.55, 0.6),
    steel: tiled(real("Metal024", { tint: "#77757e", roughness: 0.7, metalness: 0.5 }), 2),
    rust: tiled(real("Metal024", { tint: "#8a5a3e", roughness: 0.8, metalness: 0.35 }), 2),
    tank: tiled(real("Metal024", { tint: "#e2ded4", roughness: 0.75, metalness: 0.25 }), 3),
    roof: std("#55515b", 0.7, 0.3),
    white: tiled(real("Plaster001", { tint: "#f2f0ea" }), 2.5),
    stone: tiled(real("Concrete034", { tint: "#7d7781" }), 2),
    green: std("#3a5f54", 0.6, 0.3),
    glass: std("#1e2732", 0.12, 0.6),
    glassPale: std("#8aa2b5", 0.1, 0.5),
    wood: tiled(real("Wood049", { tint: "#4a3424" }), 1.5),
    deck: tiled(real("Wood049", { tint: "#9a7a58" }), 1.5),
    clock: (() => {
      const m = new THREE.MeshStandardMaterial({ map: clockFace(), roughness: 0.5 });
      m.userData.shared = true;
      return m;
    })(),
    flag: (() => {
      const m = new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.8, side: THREE.DoubleSide });
      m.userData.shared = true;
      return m;
    })(),
    lit: glow("#d6e8ff", 0.06, 1.25),
    litWarm: glow("#ffd9a0", 0.06, 1.35),
    lamp: glow("#fff1c8", 0.4, 3.2),
    lens: glow("#fff8e0", 0.6, 5),
    red: glow("#ff3030", 0.8, 3),
  };
}

function clockFace() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2eee4";
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#1a181e";
  g.lineWidth = 6;
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 ? 3 : 6;
    g.beginPath();
    g.moveTo(64 + Math.sin(a) * 46, 64 - Math.cos(a) * 46);
    g.lineTo(64 + Math.sin(a) * 56, 64 - Math.cos(a) * 56);
    g.stroke();
  }
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64, 24);
  g.moveTo(64, 64);
  g.lineTo(92, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
}

/** The flag: Zcash yellow, a black Z. */
function flagTexture() {
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4b728";
  g.fillRect(0, 0, 192, 128);
  g.strokeStyle = "#121116";
  g.lineWidth = 16;
  g.lineJoin = "miter";
  g.beginPath();
  g.moveTo(62, 30);
  g.lineTo(130, 30);
  g.lineTo(62, 98);
  g.lineTo(130, 98);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
}

type M = ReturnType<typeof makeMats>;

/** A barred window on a face of normal `n` (±x or ±z) at the face's plane `p`: u0..u0+w along, y0..y0+h. */
function window_(P: Parts, m: M, axis: "x" | "z", p: number, n: 1 | -1, u0: number, y0: number, w: number, h: number, lit: boolean, lod: 0 | 1) {
  const B = (a0: number, b0: number, c0: number, a1: number, b1: number, c1: number, mat: THREE.Material) => {
    // (a along, b up, c out of the face)
    const [x0, x1] = axis === "z" ? [a0, a1] : [p + n * c0, p + n * c1];
    const [z0, z1] = axis === "z" ? [p + n * c0, p + n * c1] : [a0, a1];
    P.box(mat, Math.min(x0, x1), b0, Math.min(z0, z1), Math.max(x0, x1), b1, Math.max(z0, z1));
  };
  // the glass on the wall's face, the frame round it standing proud, the sill, the muntins, the bars
  B(u0, y0, 0, u0 + w, y0 + h, 0.12, lit ? m.lit : m.glass);
  B(u0 - 0.6, y0 - 1, 0, u0 + w + 0.6, y0, 0.9, m.band);
  B(u0 - 0.6, y0 + h, 0, u0 + w + 0.6, y0 + h + 0.6, 0.6, m.band);
  B(u0 - 0.6, y0, 0, u0, y0 + h, 0.6, m.band);
  B(u0 + w, y0, 0, u0 + w + 0.6, y0 + h, 0.6, m.band);
  if (lod) return;
  for (let a = u0 + w / 3; a < u0 + w - 0.5; a += w / 3) B(a - 0.2, y0, 0.1, a + 0.2, y0 + h, 0.25, m.iron);
  for (let b = y0 + h / 3; b < y0 + h - 0.5; b += h / 3) B(u0, b - 0.2, 0.1, u0 + w, b + 0.2, 0.25, m.iron);
  for (let a = u0 + 1.2; a < u0 + w; a += 2.4) B(a - 0.25, y0, 0.35, a + 0.25, y0 + h, 0.6, m.iron);
}

/** A seeded coin flip. */
const flip = (a: number, b: number, k: number) => {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h) < k;
};

/** The cell house (and its portico): the voxel model's frame is (3 + 192 + 15 + 3) × 90 × 60. */
export function realCellHouse(wing: [number, number], lod: 0 | 1) {
  const m = (mats ??= makeMats());
  const MG = HOUSE.margin,
    W = HOUSE.w,
    D = HOUSE.d,
    PW = HOUSE.portico,
    T = HOUSE.top;
  const MW = MG + W + PW + MG,
    MD = MG + D + MG;
  const P = new Parts(frameOf(MW, MD, 1));
  const X0 = MG,
    X1 = MG + W,
    Z0 = MG,
    Z1 = MG + D;
  P.box(m.concrete, X0, 0, Z0, X1, T, Z1);
  P.box(m.plinth, X0 - 1, 0, Z0 - 1, X1 + 1, 4, Z1 + 1);
  for (const y of [23, 43]) P.box(m.band, X0 - 0.8, y, Z0 - 0.8, X1 + 0.8, y + 1, Z1 + 0.8);
  P.box(m.band, X0 - 1, T - 2, Z0 - 1, X1 + 1, T, Z1 + 1);
  // the parapet round the roof, its coping, the tar deck
  P.box(m.concrete, X0, T, Z0, X1, T + 3, Z0 + 2);
  P.box(m.concrete, X0, T, Z1 - 2, X1, T + 3, Z1);
  P.box(m.concrete, X0, T, Z0, X0 + 2, T + 3, Z1);
  P.box(m.concrete, X1 - 2, T, Z0, X1, T + 3, Z1);
  for (const [a, b, c, d] of [
    [X0 - 1, Z0 - 1, X1 + 1, Z0 + 2.2],
    [X0 - 1, Z1 - 2.2, X1 + 1, Z1 + 1],
    [X0 - 1, Z0 - 1, X0 + 2.2, Z1 + 1],
    [X1 - 2.2, Z0 - 1, X1 + 1, Z1 + 1],
  ])
    P.box(m.band, a, T + 3, b, c, T + 4, d);
  P.box(m.tar, X0 + 2, T, Z0 + 2, X1 - 2, T + 0.3, Z1 - 2);
  // pilasters and the tall barred windows, eight bays, three storeys; the west end's
  const storeys = [6, 26, 46];
  for (let k = 0; k <= 8; k++) {
    const px = X0 + k * 24 - (k === 8 ? 3 : k === 0 ? 0 : 1);
    P.box(m.concrete, px, 4, Z0 - 2, px + 3, T - 2, Z0);
    P.box(m.concrete, px, 4, Z1, px + 3, T - 2, Z1 + 2);
    if (k === 8) continue;
    const u = X0 + k * 24 + 5;
    for (const [s, y] of storeys.entries()) {
      window_(P, m, "z", Z0, -1, u, y, 14, 14, flip(k, s, 0.4), lod);
      const blind = s === 0 && u + 14 > wing[0] && u < wing[1];
      if (!blind) window_(P, m, "z", Z1, 1, u, y, 14, 14, flip(k + 50, s, 0.3), lod);
    }
  }
  for (const [s, y] of storeys.entries()) for (const u of [Z0 + 8, Z0 + 32]) window_(P, m, "x", X0, -1, u, y, 14, 14, flip(u, s, 0.3), lod);
  // the yard door (south-west), its steps; the service door on the north
  {
    const u = X0 + 5;
    P.box(m.band, u - 2, 4, Z1, u + 12, 22, Z1 + 2);
    P.box(m.wood, u, 4, Z1 - 0.5, u + 10, 20, Z1 + 2.1);
    for (let uu = u + 1; uu < u + 10; uu += 2) P.box(m.iron, uu, 4, Z1 + 2.1, uu + 0.6, 20, Z1 + 2.5);
    P.box(m.lamp, u + 3, 21, Z1 + 2, u + 7, 22, Z1 + 3.4);
    for (let s = 0; s < 3; s++) P.box(m.plinth, u - 1, 0, Z1 + 2 + s, u + 11, 4 - s, Z1 + 3 + s);
  }
  P.box(m.rust, X0 + 101, 4, Z0 - 1, X0 + 109, 18, Z0 + 0.2);
  P.box(m.lamp, X0 + 103, 19, Z0 - 2.5, X0 + 107, 20, Z0 - 1);
  for (const x of [X0 + 23, X0 + 71, X0 + 143]) P.cyl(m.iron, x + 0.5, 2, Z0 - 2.4, 0.45, T - 2, 8);
  // the roof: the clerestory down the middle, vents, the mast
  const zc = Z0 + Math.floor(D / 2);
  P.box(m.concrete, X0 + 8, T, zc - 9, X1 - 8, T + 2, zc + 9);
  for (const z of [zc - 9, zc + 9]) {
    P.box(m.glassPale, X0 + 8, T + 2, z - 0.3, X1 - 8, T + 7, z + 0.3);
    if (!lod) for (let x = X0 + 9; x < X1 - 8; x += 4) P.box(m.iron, x - 0.25, T + 2, z - 0.5, x + 0.25, T + 7, z + 0.5);
  }
  P.box(m.concrete, X0 + 8, T + 7, zc - 9.4, X1 - 8, T + 8, zc + 9.4);
  P.box(m.tar, X0 + 7, T + 8, zc - 10, X1 - 7, T + 9, zc + 10);
  P.box(m.band, X0 + 9, T + 9, zc - 3, X1 - 9, T + 10, zc + 3);
  if (!lod)
    for (const x of [X0 + 14, X0 + 62, X0 + 118, X0 + 170]) {
      P.cyl(m.steel, x, T, Z0 + 7, 2.2, 7, 12);
      P.cyl(m.iron, x, T + 7, Z0 + 7, 3.2, 1, 12, 1.2);
      P.box(m.band, x + 4, T, Z1 - 12, x + 12, T + 5, Z1 - 6);
      P.box(m.steel, x + 5, T + 1, Z1 - 6.2, x + 11, T + 4, Z1 - 5.6);
    }
  P.cyl(m.steel, X0 + 180.5, T, Z0 + 6.5, 0.45, 24, 8);
  P.box(m.red, X0 + 179.5, T + 24, Z0 + 5.5, X0 + 181.5, T + 25, Z0 + 7.5);
  // floodlights on the yard parapet, leaning out
  for (let x = X0 + 16; x < X1 - 8; x += 32) {
    P.box(m.iron, x, T + 3, Z1 - 1, x + 1, T + 9, Z1);
    P.box(m.iron, x - 2, T + 8, Z1, x + 3, T + 10, Z1 + 2);
    P.box(m.lamp, x - 1.8, T + 7.6, Z1 + 1.4, x + 2.8, T + 8.2, Z1 + 2.2);
  }
  // ---- the portico at the east end: two storeys, columns round the door, the clock, the flag -----
  const pz0 = Z0 + 8,
    pz1 = Z1 - 8,
    PX1 = X1 + PW,
    mid = Math.floor((pz0 + pz1) / 2);
  P.box(m.concrete, X1, 0, pz0, PX1, 42, pz1);
  P.box(m.plinth, X1, 0, pz0 - 1, PX1 + 1, 4, pz1 + 1);
  P.box(m.band, X1, 40, pz0 - 1, PX1 + 1, 42, pz1 + 1);
  P.box(m.concrete, X1, 42, pz0, PX1, 45, pz1);
  P.box(m.band, X1, 45, pz0 - 1, PX1 + 1, 46, pz1 + 1);
  for (const u of [mid - 12, mid - 9, mid + 7, mid + 10]) P.cyl(m.band, PX1 + 1.5, 4, u + 1, 1.1, 20, 12);
  P.box(m.band, PX1, 24, mid - 13, PX1 + 3, 27, mid + 13);
  P.box(m.wood, PX1 - 0.6, 4, mid - 5, PX1 + 0.2, 20, mid + 5);
  P.box(m.lamp, PX1 + 0.6, 21, mid - 2, PX1 + 1.6, 22, mid + 2);
  for (let s = 0; s < 3; s++) P.box(m.plinth, PX1, 0, mid - 7, PX1 + 2 + s, 4 - s, mid + 7);
  for (const u of [pz0 + 3, pz1 - 7]) window_(P, m, "x", PX1, 1, u, 28, 4, 10, flip(u, 9, 0.5), lod);
  {
    const disc = new THREE.CircleGeometry(6, 32);
    disc.rotateY(Math.PI / 2);
    disc.translate(PX1 + 0.4, 34, mid + 0.5);
    P.add(m.clock, disc, true);
    const ring = new THREE.TorusGeometry(6.2, 0.45, 8, 32);
    ring.rotateY(Math.PI / 2);
    ring.translate(PX1 + 0.4, 34, mid + 0.5);
    P.add(m.iron, ring);
  }
  // the flag on the portico roof
  const fx = PX1 - 6,
    fz = mid;
  P.cyl(m.steel, fx + 0.5, 42, fz + 0.5, 0.45, 46, 8);
  P.ellipsoid(m.band, [fx + 0.5, 88.6, fz + 0.5], [1, 1, 1], 10);
  {
    const g = new THREE.PlaneGeometry(16, 11, 12, 1);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 8) * 0.45) * 1.2 * ((p.getX(i) + 8) / 16));
    g.computeVertexNormals();
    g.translate(fx - 8, 81.5, fz + 0.5);
    P.add(m.flag, g, true);
  }
  return P.build(lod ? "rock:house:far" : "rock:house", !lod);
}

/** The water tower (42 × 120 × 42 voxels, centred). */
export function realWaterTower(lod: 0 | 1) {
  const m = (mats ??= makeMats());
  const P = new Parts(frameOf(42, 42, 1));
  const c = 21;
  const legs: [number, number][] = [
    [7, 7],
    [35, 7],
    [7, 35],
    [35, 35],
  ];
  for (const [x, z] of legs) {
    P.box(m.plinth, x - 2, 0, z - 2, x + 2, 2, z + 2);
    P.cyl(m.rust, x, 2, z, 1.1, TANK.y0 - 2, 10, 0.9);
  }
  if (!lod)
    for (const y0 of [6, 28, 50]) {
      const y1 = y0 + 20;
      const brace = (a: V3, b: V3) => P.beam(m.rust, a, b, 0.6);
      for (const [a, b] of [
        [legs[0], legs[1]],
        [legs[2], legs[3]],
        [legs[0], legs[2]],
        [legs[1], legs[3]],
      ]) {
        brace([a[0], y0, a[1]], [b[0], y1, b[1]]);
        brace([b[0], y0, b[1]], [a[0], y1, a[1]]);
        brace([a[0], y1, a[1]], [b[0], y1, b[1]]);
      }
    }
  P.cyl(m.steel, c, 0, c, 1.6, TANK.y0, 10);
  // the riveted tank, its bands, the catwalk and its rail, the conical roof
  P.cyl(m.tank, c, TANK.y0, c, TANK.r, TANK.h, lod ? 16 : 40);
  for (const y of [TANK.y0, TANK.y0 + 10, TANK.y0 + 20, TANK.y0 + TANK.h - 1]) P.cyl(m.steel, c, y, c, TANK.r + 0.35, 0.8, lod ? 16 : 40);
  P.cyl(m.steel, c, TANK.y0 - 1, c, TANK.r + 3, 0.8, lod ? 16 : 40);
  if (!lod) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) P.cyl(m.iron, c + Math.cos(a) * (TANK.r + 2.6), TANK.y0, c + Math.sin(a) * (TANK.r + 2.6), 0.25, 5, 6);
    const ring = new THREE.TorusGeometry(TANK.r + 2.6, 0.3, 6, 48);
    ring.rotateX(Math.PI / 2);
    ring.translate(c, TANK.y0 + 5, c);
    P.add(m.iron, ring);
  }
  const top = TANK.y0 + TANK.h;
  P.cyl(m.roof, c, top, c, TANK.r + 0.9, 12, lod ? 16 : 40, 1.2);
  P.cyl(m.steel, c, top + 12, c, 0.6, 4, 8);
  P.box(m.red, c - 1.2, top + 16, c - 1.2, c + 1.2, top + 17, c + 1.2);
  if (!lod) {
    for (const z of [19, 23]) P.box(m.iron, 38, 0, z, 38.5, TANK.y0 + 4, z + 0.5);
    for (let y = 3; y < TANK.y0 + 4; y += 3) P.box(m.iron, 38, y, 19, 38.5, y + 0.4, 23.5);
  }
  return P.build(lod ? "rock:tower:far" : "rock:tower", !lod);
}

/** The lighthouse (40 × 150 × 40 voxels, centred). */
export function realLighthouse(lod: 0 | 1) {
  const m = (mats ??= makeMats());
  const P = new Parts(frameOf(40, 40, 1));
  const c = 20;
  const seg = lod ? 14 : 36;
  P.cyl(m.stone, c, 0, c, 14, 4, seg);
  P.cyl(m.white, c, 4, c, 11, 106, seg, 8);
  const r = (y: number) => 11 - ((y - 4) / 106) * 3;
  for (const y of [30, 60, 88]) P.cyl(m.band, c, y, c, r(y) + 0.3, 2, seg, r(y + 2) + 0.3);
  if (!lod)
    for (const y of [22, 46, 72, 96]) {
      P.box(m.glass, c - 1, y, c + r(y) - 0.6, c + 1, y + 7, c + r(y) + 0.2);
      P.box(m.glass, c + r(y + 6) - 0.6, y + 6, c - 1, c + r(y + 6) + 0.2, y + 13, c + 1);
    }
  // the door (south), its hood and lamp
  P.box(m.wood, c - 3, 4, c + 10.2, c + 3, 18, c + 11.2);
  P.box(m.band, c - 4, 18, c + 9, c + 4, 19, c + 13);
  P.box(m.lamp, c - 1, 19, c + 11, c + 1, 20, c + 12);
  // the gallery on its corbels, the platform, the rail
  P.cyl(m.band, c, 106, c, 8.5, 4, seg, 12.1);
  P.cyl(m.iron, c, 110, c, 13, 2, seg);
  if (!lod) for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) P.cyl(m.iron, c + Math.cos(a) * 12.4, 112, c + Math.sin(a) * 12.4, 0.22, 5, 6);
  {
    const ring = new THREE.TorusGeometry(12.4, 0.35, 6, lod ? 16 : 48);
    ring.rotateX(Math.PI / 2);
    ring.translate(c, 117, c);
    P.add(m.iron, ring);
  }
  // the lantern: glazing between dark posts, the lamp inside; the green cupola, the vent, the rod
  P.cyl(m.iron, c, 112, c, 7.5, 3, seg);
  P.cyl(m.glassPale, c, 115, c, 7.1, 13, seg);
  if (!lod) for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) P.cyl(m.iron, c + Math.cos(a) * 7.15, 115, c + Math.sin(a) * 7.15, 0.35, 13, 6);
  P.cyl(m.iron, c, 121, c, 7.25, 0.6, seg);
  P.ellipsoid(m.lens, [c, 121, c], [3.2, 4.2, 3.2], 16);
  P.cyl(m.green, c, 128, c, 8.2, 7, seg, 0.6);
  P.ellipsoid(m.iron, [c, 136, c], [1.8, 1.8, 1.8], 10);
  P.cyl(m.iron, c, 137, c, 0.2, 11, 6);
  return P.build(lod ? "rock:light:far" : "rock:light", !lod);
}

/** A guard tower on steel legs (26 × 80 × 26 voxels, centred). */
export function realWatchTower(lod: 0 | 1) {
  const m = (mats ??= makeMats());
  const P = new Parts(frameOf(26, 26, 1));
  const legs: [number, number][] = [
    [5, 5],
    [21, 5],
    [5, 21],
    [21, 21],
  ];
  P.box(m.plinth, 2, 0, 2, 24, 2, 24);
  for (const [x, z] of legs) P.box(m.steel, x - 0.9, 2, z - 0.9, x + 0.9, 54, z + 0.9);
  if (!lod)
    for (const y0 of [4, 20, 36]) {
      const y1 = y0 + 14;
      for (const [a, b] of [
        [legs[0], legs[1]],
        [legs[2], legs[3]],
        [legs[0], legs[2]],
        [legs[1], legs[3]],
      ]) {
        P.beam(m.steel, [a[0], y0, a[1]], [b[0], y1, b[1]], 0.5);
        P.beam(m.steel, [b[0], y0, b[1]], [a[0], y1, a[1]], 0.5);
        P.beam(m.steel, [a[0], y1, a[1]], [b[0], y1, b[1]], 0.6);
      }
    }
  if (!lod) {
    for (const x of [11, 15]) P.box(m.iron, x, 2, 23, x + 0.5, 56, 23.5);
    for (let y = 4; y < 56; y += 3) P.box(m.iron, 11, y, 23, 15.5, y + 0.4, 23.5);
  }
  // the cabin: a deck, a concrete sill, the glazing between posts, the roof, the searchlight
  P.box(m.plinth, 1, 54, 1, 25, 56, 25);
  P.box(m.concrete, 4, 56, 4, 22, 59, 22);
  P.box(m.glass, 4.3, 59, 4.3, 21.7, 65, 21.7);
  if (!lod)
    for (const a of [4, 9, 13, 17, 21.5])
      for (const [x0, z0, x1, z1] of [
        [a, 3.9, a + 0.6, 4.4],
        [a, 21.6, a + 0.6, 22.1],
        [3.9, a, 4.4, a + 0.6],
        [21.6, a, 22.1, a + 0.6],
      ])
        P.box(m.iron, x0, 59, z0, x1, 65, z1);
  P.box(m.lamp, 12, 63, 12, 14, 64, 14);
  if (!lod) {
    for (let a = 1.5; a < 25; a += 3)
      for (const [x, z] of [
        [a, 1.5],
        [a, 24.5],
        [1.5, a],
        [24.5, a],
      ] as const) {
        if (z === 24.5 && x > 10.5 && x < 16.5) continue;
        P.cyl(m.iron, x, 56, z, 0.2, 4, 6);
      }
    P.box(m.iron, 1, 60, 1, 25, 60.5, 1.6);
    P.box(m.iron, 1, 60, 24.4, 11, 60.5, 25);
    P.box(m.iron, 16, 60, 24.4, 25, 60.5, 25);
    P.box(m.iron, 1, 60, 1, 1.6, 60.5, 25);
    P.box(m.iron, 24.4, 60, 1, 25, 60.5, 25);
  }
  P.box(m.concrete, 4, 65, 4, 22, 66, 22);
  P.box(m.roof, 2, 66, 2, 24, 67, 24);
  {
    const hip = new THREE.ConeGeometry(12.5, 3, 4, 1);
    hip.rotateY(Math.PI / 4);
    hip.translate(13, 68.5, 13);
    P.add(m.tar, hip);
  }
  P.box(m.steel, 11, 69, 11, 15, 71, 15);
  P.cyl(m.iron, 13, 71, 13, 3.2, 4, 16);
  P.cyl(m.lens, 13, 75, 13, 2.2, 0.6, 16);
  void TOWER;
  void LIGHT;
  return P.build(lod ? "rock:guard:far" : "rock:guard", !lod);
}

/**
 * A length of prison wall along x, its inside facing +z (prison-model.ts wallModel: `len` ×
 * (h + 14) × 14 voxels): cast concrete on a plinth, buttresses outside, a coping, Y posts for the
 * wire, the guards' catwalk inside, floodlights; gaps cut through, or a barred gate.
 */
export function realWall(len: number, o: { catwalk?: boolean; lights?: number; gaps?: [number, number][]; gate?: [number, number] }, lod: 0 | 1) {
  const m = (mats ??= makeMats());
  const H = WALL.h,
    z0 = WALL.back,
    z1 = WALL.back + WALL.thick;
  const D = z1 + 8;
  const P = new Parts(frameOf(len, D, 1));
  const gaps = o.gaps ?? [];
  const open = (x: number) => gaps.some(([a, b]) => x >= a && x < b);
  // the runs of wall between the gaps
  const runs: [number, number][] = [];
  let a = 0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > a) runs.push([a, g0]);
    a = Math.max(a, g1);
  }
  if (a < len) runs.push([a, len]);
  for (const [x0, x1] of runs) {
    if (o.gate && o.gate[0] >= x0 && o.gate[1] <= x1) {
      const [g0, g1] = o.gate;
      P.box(m.concrete, x0, 0, z0, g0, H, z1);
      P.box(m.concrete, g1, 0, z0, x1, H, z1);
      P.box(m.concrete, g0, H - 6, z0, g1, H, z1);
      P.box(m.plinth, x0, 0, z0 - 1, g0, 3, z1 + 1);
      P.box(m.plinth, g1, 0, z0 - 1, x1, 3, z1 + 1);
    } else {
      P.box(m.concrete, x0, 0, z0, x1, H, z1);
      P.box(m.plinth, x0, 0, z0 - 1, x1, 3, z1 + 1);
    }
    P.box(m.band, x0, H, z0 - 1, x1, H + 1, z1 + 1);
    if (!lod) P.box(m.concrete, x0, H - 4, z0 - 0.4, x1, H - 3.4, z0);
  }
  for (let x = 6; x < len - 3; x += 24) {
    if (open(x) || open(x + 3)) continue;
    P.box(m.concrete, x, 0, 0, x + 3, H - 2, z0);
    // its sloped cap
    if (!lod) P.beam(m.band, [x + 1.5, H - 2, 0.4], [x + 1.5, H - 0.6, z0], 0.9);
  }
  if (!lod)
    for (let x = 3; x < len - 1; x += 12) {
      if (open(x)) continue;
      P.box(m.steel, x, H + 1, z0 + 2, x + 0.5, H + 4, z0 + 2.5);
      P.beam(m.steel, [x + 0.25, H + 4, z0 + 2.25], [x + 0.25, H + 6, z0], 0.35);
      P.beam(m.steel, [x + 0.25, H + 4, z0 + 2.25], [x + 0.25, H + 6, z1], 0.35);
    }
  if (o.catwalk) {
    const y = 20;
    P.box(m.wood, 0, y, z1, len, y + 0.7, z1 + 6);
    if (!lod) {
      for (let x = 4; x < len - 2; x += 12) P.beam(m.steel, [x, y - 4, z1], [x, y, z1 + 5], 0.5);
      for (let x = 0.5; x < len; x += 6) P.box(m.iron, x, y + 0.7, z1 + 5.2, x + 0.4, y + 7, z1 + 5.6);
      P.box(m.iron, 0, y + 6.6, z1 + 5.1, len, y + 7, z1 + 5.7);
      P.box(m.iron, 0, y + 3.6, z1 + 5.2, len, y + 3.9, z1 + 5.6);
    }
  }
  if (o.lights)
    for (let x = Math.floor(o.lights / 2); x < len - 4; x += o.lights) {
      if (open(x)) continue;
      P.box(m.steel, x, H + 1, z1 - 2, x + 0.6, H + 10, z1 - 1.4);
      P.box(m.steel, x, H + 9, z1 - 1.4, x + 0.6, H + 9.6, z1 + 1);
      P.box(m.iron, x - 1, H + 9, z1 + 1, x + 2, H + 11, z1 + 3);
      P.box(m.lamp, x - 0.8, H + 8.6, z1 + 1.2, x + 1.8, H + 9, z1 + 2.8);
    }
  if (o.gate) {
    const [g0, g1] = o.gate;
    P.box(m.steel, g0 - 1, 0, z0 - 1, g0, H - 5, z1 + 1);
    P.box(m.steel, g1, 0, z0 - 1, g1 + 1, H - 5, z1 + 1);
    const gz = z0 + 2;
    for (let x = g0 + 1; x < g1; x += 2) P.box(m.iron, x, 0, gz, x + 0.5, H - 6, gz + 0.5);
    for (const y of [1, 9, H - 7]) P.box(m.iron, g0, y, gz, g1, y + 0.6, gz + 0.5);
  }
  return P.build(lod ? "rock:wall:far" : "rock:wall", !lod);
}

/** The sally port astride the north wall (gatehouse(): (w + 2) × 54 × (d + 2) voxels): two storeys, the arched passage, its barred gate. */
export function realGatehouse(lod: 0 | 1) {
  const m = (mats ??= makeMats());
  const MW = GATE.w + 2,
    MD = GATE.d + 2;
  const P = new Parts(frameOf(MW, MD, 1));
  const x0 = 1,
    x1 = 1 + GATE.w,
    z0 = 1,
    z1 = 1 + GATE.d;
  const [p0, p1] = GATE.passage;
  const pm = (p0 + p1) / 2,
    pr = (p1 - p0) / 2;
  // the body either side of the passage and over its arch (an extruded front with the arch cut out)
  {
    const sh = new THREE.Shape();
    sh.moveTo(x0, 0);
    sh.lineTo(p0, 0);
    sh.lineTo(p0, 17);
    sh.absarc(pm, 17, pr, Math.PI, 0, true);
    sh.lineTo(p1, 0);
    sh.lineTo(x1, 0);
    sh.lineTo(x1, 40);
    sh.lineTo(x0, 40);
    sh.lineTo(x0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: lod ? 6 : 16 });
    g.translate(0, 0, z0);
    P.add(m.concrete, g);
  }
  P.box(m.plinth, x0 - 1, 0, z0 - 1, p0, 4, z1 + 1);
  P.box(m.plinth, p1, 0, z0 - 1, x1 + 1, 4, z1 + 1);
  P.box(m.band, x0 - 1, 20, z0 - 1, p0 - 0.2, 21, z1 + 1);
  P.box(m.band, p1 + 0.2, 20, z0 - 1, x1 + 1, 21, z1 + 1);
  for (const [a, b, c, d] of [
    [x0, z0, x1, z0 + 2],
    [x0, z1 - 2, x1, z1],
    [x0, z0, x0 + 2, z1],
    [x1 - 2, z0, x1, z1],
  ])
    P.box(m.concrete, a, 40, b, c, 43, d);
  P.box(m.band, x0 - 1, 43, z0 - 1, x1 + 1, 44, z0 + 2.2);
  P.box(m.band, x0 - 1, 43, z1 - 2.2, x1 + 1, 44, z1 + 1);
  P.box(m.tar, x0 + 2, 40, z0 + 2, x1 - 2, 40.3, z1 - 2);
  P.box(m.plinth, p0, 0, z0 + 2, p1, 0.6, z1 - 2);
  // the gate: bars and straps across the passage, shut
  const gz = Math.floor((z0 + z1) / 2);
  for (let x = p0 + 1; x < p1; x += 2) P.box(m.iron, x, 0, gz, x + 0.5, 24, gz + 0.5);
  for (const y of [1, 8, 16]) P.box(m.iron, p0, y, gz, p1, y + 0.6, gz + 0.5);
  // lamps either side of the arch, barred guard windows, the sign's panel (prison.ts paints the sign on it)
  for (const [z, n] of [
    [z0, -1],
    [z1, 1],
  ] as const) {
    for (const u of [p0 - 4, p1 + 2]) {
      P.box(m.iron, u, 14, z + n * 1, u + 2, 17, z + n * 3);
      P.box(m.lamp, u + 0.2, 13.4, z + n * 1.2, u + 1.8, 14, z + n * 2.8);
    }
    window_(P, m, "z", z, n, x0 + 6, 7, 8, 9, flip(z, 1, 0.6), lod);
    window_(P, m, "z", z, n, x1 - 14, 7, 8, 9, flip(z, 2, 0.6), lod);
    P.box(m.band, x0 + 3, GATE.sign[0] - 1, z, x1 - 3, GATE.sign[1] + 1, z + n * 2);
  }
  // the lookout on the roof
  P.box(m.concrete, x1 - 16, 40, z0 + 6, x1 - 4, 45, z1 - 6);
  P.box(m.glass, x1 - 15.6, 45, z0 + 6.4, x1 - 4.4, 50, z1 - 6.4);
  P.box(m.concrete, x1 - 16, 50, z0 + 6, x1 - 4, 52, z1 - 6);
  P.box(m.tar, x1 - 17, 52, z0 + 5, x1 - 3, 53, z1 - 5);
  P.box(m.lamp, x1 - 11, 48, z0 + 10, x1 - 9, 49, z1 - 10);
  return P.build(lod ? "rock:gate:far" : "rock:gate", !lod);
}

/** The ferry pier (pier(): w × h × d voxels, the deck `deck` up): piles, stringers, planks, bollards, the rail, lamps, the guard booth. */
export function realPier(lod: 0 | 1) {
  const m = (mats ??= makeMats());
  const { w, d, deck } = PIER;
  const P = new Parts(frameOf(w, d, 1));
  for (let z = 3; z < d; z += 12)
    for (const x of [2, 15, 29]) {
      P.cyl(m.wood, x, 0, z, 1.4, deck - 2, lod ? 6 : 12);
      if (!lod) P.cyl(m.green, x, 3, z, 1.6, 4, 12);
    }
  for (let z = 3; z < d; z += 12) P.box(m.wood, 0, deck - 3, z - 1, w, deck - 2, z + 1);
  P.box(m.wood, 1, deck - 2, 0, 3, deck - 1, d);
  P.box(m.wood, w - 3, deck - 2, 0, w - 1, deck - 1, d);
  P.box(m.deck, 0, deck - 1, 0, w, deck, d);
  P.box(m.wood, 0, deck, 0, 1, deck + 1, d);
  P.box(m.wood, w - 1, deck, 0, w, deck + 1, d);
  for (let z = 10; z < d; z += 22) {
    P.cyl(m.iron, w - 3, deck, z, 1.3, 4, 12);
    P.cyl(m.iron, w - 3, deck + 4, z, 1.9, 1, 12);
  }
  if (!lod) {
    for (let z = 0.5; z < d; z += 6) P.box(m.steel, 1.2, deck, z, 1.8, deck + 6, z + 0.6);
    P.box(m.steel, 1.1, deck + 5.4, 0, 1.9, deck + 6, d);
    P.box(m.steel, 1.2, deck + 2.4, 0, 1.8, deck + 2.8, d);
  }
  for (const z of [8, 50, 92]) {
    P.box(m.iron, 2, deck, z, 2.6, deck + 18, z + 0.6);
    P.box(m.iron, 2, deck + 18, z, 6, deck + 18.6, z + 0.6);
    P.box(m.iron, 4, deck + 16, z - 1, 7, deck + 18, z + 1.6);
    P.box(m.lamp, 4.2, deck + 15.6, z - 0.8, 6.8, deck + 16, z + 1.4);
  }
  const bz = 4;
  P.box(m.band, 6, deck, bz, 16, deck + 6, bz + 10);
  P.box(m.glass, 6.2, deck + 6, bz + 0.2, 15.8, deck + 11, bz + 9.8);
  P.box(m.band, 5.4, deck + 11, bz - 0.6, 16.6, deck + 12, bz + 10.6);
  P.box(m.tar, 5, deck + 12, bz - 1, 17, deck + 12.6, bz + 11);
  return P.build(lod ? "rock:pier:far" : "rock:pier", !lod);
}
