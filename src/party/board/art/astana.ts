/**
 * NU7 QUARTER's own look (art only): ZStreet's NU7 Quarter on a snowy winter evening, built on the
 * shared kit (decor.ts, props.ts, life.ts). (The file and its functions keep their old names.)
 *
 * - The landmarks: the NU7 TOWER and its golden crown with the NU7 sign (its glass lift rides the
 *   trunk), the ZK MALL's tent lit in bands over its shops, CITY HALL's blue dome, the GREAT
 *   PYRAMID with its glowing apex, the OPERA HOUSE's white dome and lantern towers, the zkSNARK
 *   MUSEUM's glass sphere, the zkSNARK OF LIBERTY's column with its golden ⓩ mark.
 * - The frozen canal between the banks: its ice, the ICE RUN's lane (poles, lanterns, its cracks and,
 *   once it gives way, its hole), skaters and ice-fishing tents, the two bridges.
 * - The city: blocks of flats with warm windows, the boulevard's lights and ice sculptures, the
 *   New Year tree, the rink, the Christmas market, pavilions on the plains' edge, snowmen.
 * - Around it: the snowy plains to the horizon, low hills, the northern lights, the moon, falling
 *   snow; a BLIZZARD's whiteout when one blows.
 *
 * The rules' events reach it through `on(e, view)` (game.ts): the lift's cabin, the glider, the
 * ice's cracks and hole, the blizzard. Everything is batched (the Vox, a few meshes of its own) and
 * freed with the scene.
 */
import * as THREE from "three";
import type { LandmarkDef } from "../maps";
import type { BEv } from "../core";
import { lamp, pick, tree, type Kit, type MapArt } from "../decor";
import { glowTex, halo, type Vox } from "../props";
import { canvasTex, toonSteps } from "../../k3";

/** What game.ts hands the art with each event: the avatars (where they stand). */
export interface ArtView {
  av: { pos: THREE.Vector3 }[];
}

// ---- the board's numbers (map data: maps/astana.ts) --------------------------------------------------

/** The ice's height, the plains' (under the islands' plinth). */
const ICE_Y = -1.6;
const STEPPE_Y = -2.05;
/** The frozen canal's middle line, far west to far east (x, z). */
const RIVER: [number, number][] = [
  [-420, 4], [-200, -4], [-110, -9], [-75, -13], [-48, -15], [-30, -19], [-15, -24], [0, -23], [13, -19], [26, -20], [36, -24], [50, -27], [75, -28], [120, -31], [200, -38], [420, -50],
];
const BAYTEREK = { x: 0, z: -4, egg: 24 };
const DARK = "#2b2f4a";
const SNOW = "#f4f8ff";
const WARM = ["#ffd98a", "#ffc46a", "#ffe6b0", "#ffb860"];
const KZ = "#00afca";
const GOLD = "#ffcf4a";

const tv = new THREE.Vector3();

/** A thin bar from a to b (struts, cables, ribs). */
function strut(v: Vox, c: string, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, o: { ink?: number; glow?: boolean } = {}) {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  v.frame((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, Math.atan2(dx, dz));
  v.box(c, r, len, r, 0, 0, 0, { rx: Math.atan2(Math.hypot(dx, dz), dy), ...o });
}

/** A block of flats: a darker ground floor, balconies, a cornice, a snowy roof with its boxes, rows of windows (most lit warm at this hour), a lit door. */
function flats(k: Kit, x: number, z: number, w: number, d: number, floors: number, yaw: number, wall: string) {
  const { v, rnd, paint, life, pools } = k;
  const h = floors * 1.15 + 0.6;
  const trim = new THREE.Color(wall).multiplyScalar(0.72).getStyle();
  v.frame(x, 0, z, yaw);
  v.box(wall, w, h, d, 0, h / 2, 0, { ink: 0.06 });
  v.box(trim, w + 0.12, 1.1, d + 0.12, 0, 0.55, 0);
  v.box(trim, w + 0.3, 0.28, d + 0.3, 0, h - 0.1, 0);
  v.box(SNOW, w + 0.34, 0.22, d + 0.34, 0, h + 0.12, 0);
  v.box(pick(["#b8c1d6", "#9fa9c2", trim], rnd()), w * 0.28, 0.9, d * 0.4, w * 0.22, h + 0.65, 0, { ink: 0.02 });
  v.box(SNOW, w * 0.3, 0.12, d * 0.42, w * 0.22, h + 1.14, 0);
  if (rnd() < 0.5) v.box(DARK, 0.12, 1.4, 0.12, -w * 0.3, h + 0.9, d * 0.2);
  // the windows on its two long faces (balconies on some columns) and its ends
  const cols = Math.max(2, Math.floor(w / 1.25));
  const ends = Math.max(1, Math.floor(d / 1.6));
  const balc = rnd() < 0.6;
  for (let f = 0; f < floors; f++) {
    const y = 1.6 + f * 1.15;
    if (y > h - 0.5) break;
    for (let c = 0; c < cols; c++) {
      const lx = -w / 2 + (c + 0.5) * (w / cols);
      for (const sd of [-1, 1]) {
        const lit = rnd() < 0.6;
        v.box(lit ? pick(WARM, rnd()) : "#26305a", 0.6, 0.62, 0.06, lx, y, sd * (d / 2 + 0.02), lit ? { glow: true } : {});
        if (balc && c % 2 === 1 && f > 0) {
          v.box(trim, 0.95, 0.1, 0.5, lx, y - 0.42, sd * (d / 2 + 0.25));
          v.box(SNOW, 0.95, 0.05, 0.5, lx, y - 0.35, sd * (d / 2 + 0.25));
        }
      }
    }
    for (let c = 0; c < ends; c++) {
      const lz = -d / 2 + (c + 0.5) * (d / ends);
      for (const sd of [-1, 1]) if (rnd() < 0.5) v.box(pick(WARM, rnd()), 0.06, 0.62, 0.6, sd * (w / 2 + 0.02), y, lz, { glow: true });
    }
  }
  // the door (on its south face), its canopy and lamp
  v.box("#ffe6b0", 0.9, 0.9, 0.06, 0, 0.5, d / 2 + 0.04, { glow: true });
  v.box(trim, 1.4, 0.12, 0.8, 0, 1.08, d / 2 + 0.4, { ink: 0.02 });
  v.box(SNOW, 1.4, 0.08, 0.8, 0, 1.17, d / 2 + 0.4);
  pools.add(x + Math.sin(yaw) * (d / 2 + 1), z + Math.cos(yaw) * (d / 2 + 1), 2, "#ffd59a", 0.06, 0.7);
  // (a chimney's smoke now and then; an aircraft light on the tall ones)
  if (rnd() < 0.35) life.smokeAt(x + Math.cos(yaw) * w * 0.2, h + 1.2, z - Math.sin(yaw) * w * 0.2);
  if (floors >= 9) life.blinker(x, h + 0.6, z, "#ff4040");
  paint.shadow(x, z, w * 0.6, d * 0.6, 0.32);
}

/** A bare winter birch: a white trunk with dark marks, slim branches reaching up, snow along them. */
function birch(k: Kit, x: number, z: number, s: number) {
  const { v, rnd } = k;
  const h = 3.8 * s;
  v.frame(x, 0, z, 0);
  v.box("#f2f0ea", 0.2 * s, h, 0.2 * s, 0, h / 2, 0, { ink: 0.02 });
  for (let i = 0; i < 4; i++) v.box("#2b2620", 0.22 * s, 0.06, 0.08 * s, 0, (0.6 + i * 0.75) * s, 0.07 * s);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd();
    const y0 = h * (0.42 + (i % 3) * 0.17),
      L = (1.0 + rnd() * 0.7) * s;
    const ex = x + Math.cos(a) * L * 0.7,
      ez = z + Math.sin(a) * L * 0.7,
      ey = y0 + L * 0.8;
    strut(v, "#e8e2d6", x, y0, z, ex, ey, ez, 0.07 * s);
    v.frame(0, 0, 0, 0);
    v.add("orb", SNOW, 0.24 * s, 0.1 * s, 0.24 * s, ex, ey + 0.04, ez);
  }
  v.frame(0, 0, 0, 0);
  v.add("cone6", "#e8e2d6", 0.14 * s, 0.9 * s, 0.14 * s, x, h + 0.4 * s, z);
  k.paint.shadow(x, z, 0.8 * s, 0.8 * s, 0.22);
}

/** A snowman with a carrot nose and a scarf. */
function snowman(k: Kit, x: number, z: number, yaw: number) {
  const v = k.v;
  v.frame(x, 0, z, yaw);
  v.add("orb", SNOW, 1.0, 0.9, 1.0, 0, 0.42, 0, { ink: 0.03 });
  v.add("orb", SNOW, 0.72, 0.68, 0.72, 0, 1.08, 0, { ink: 0.03 });
  v.add("orb", SNOW, 0.5, 0.48, 0.5, 0, 1.58, 0, { ink: 0.03 });
  v.add("cone6", "#ff7a1a", 0.1, 0.36, 0.1, 0, 1.6, 0.3, { rx: Math.PI / 2 });
  v.box(pick(["#ff3d56", KZ, "#ffd23f"], k.rnd()), 0.6, 0.14, 0.6, 0, 1.33, 0);
  v.box(DARK, 0.36, 0.3, 0.36, 0, 1.92, 0);
  v.box(DARK, 0.52, 0.05, 0.52, 0, 1.78, 0);
  for (const s of [-1, 1]) v.add("orb", DARK, 0.07, 0.07, 0.07, s * 0.1, 1.66, 0.22);
  k.paint.shadow(x, z, 0.6, 0.6, 0.25);
}

/** A pavilion: its felt drum, its domed roof with the crown, a carved door, a ribbon round it. */
function yurt(k: Kit, x: number, z: number, s: number, yaw: number) {
  const v = k.v;
  v.frame(x, 0, z, yaw);
  v.cyl("#f1e8d6", 1.6 * s, 1.3 * s, 0, 0.65 * s, 0, { ink: 0.04 });
  v.cyl("#c0392b", 1.63 * s, 0.2 * s, 0, 1.0 * s, 0);
  v.add("cone", "#e9dfcc", 3.6 * s, 1.2 * s, 3.6 * s, 0, 1.9 * s, 0, { ink: 0.04 });
  v.add("cone", SNOW, 3.0 * s, 0.75 * s, 3.0 * s, 0, 2.05 * s, 0);
  v.cyl("#8a5a34", 0.36 * s, 0.16 * s, 0, 2.5 * s, 0);
  v.box("#d9822b", 0.7 * s, 0.95 * s, 0.1, 0, 0.48 * s, 1.6 * s, { ink: 0.02 });
  v.box(GOLD, 0.5 * s, 0.1 * s, 0.11, 0, 0.75 * s, 1.61 * s);
  v.box("#ffd98a", 0.3 * s, 0.3 * s, 0.11, 0, 0.45 * s, 1.62 * s, { glow: true });
  k.pools.add(x + Math.sin(yaw) * 2, z + Math.cos(yaw) * 2, 1.8, "#ffb45a", 0.06, 0.6);
  k.life.smokeAt(x, 2.7 * s, z);
  k.paint.shadow(x, z, 1.8 * s, 1.8 * s, 0.3);
}

/** A wooden market hut with its lit counter and a garland. */
function hut(k: Kit, x: number, z: number, yaw: number, c: string) {
  const { v, rnd, pools } = k;
  v.frame(x, 0, z, yaw);
  v.box("#8a5a34", 2.2, 1.7, 1.6, 0, 0.85, 0, { ink: 0.04 });
  v.box("#ffe6b0", 1.7, 0.7, 0.06, 0, 1.15, 0.81, { glow: true });
  v.box("#6b3f24", 2.0, 0.12, 0.5, 0, 0.82, 0.95);
  v.add("wedge", c, 2.5, 0.7, 1.0, 0, 2.05, 0.4, { ink: 0.03 });
  v.add("wedge", c, 2.5, 0.7, 1.0, 0, 2.05, -0.4, { ry: Math.PI, ink: 0.03 });
  v.box(SNOW, 2.55, 0.16, 1.9, 0, 2.43, 0);
  for (let i = 0; i < 7; i++) v.add("orb", pick(["#ffd23f", "#ff5f6e", "#7ff3ff", "#ffffff"], rnd()), 0.14, 0.14, 0.14, -1.05 + i * 0.35, 1.78 - Math.sin((i / 6) * Math.PI) * 0.12, 0.85, { glow: true });
  for (let i = 0; i < 4; i++) v.add("orb", pick(["#ff7a2f", "#ffd23f", "#c45bff", "#33d67c"], rnd()), 0.22, 0.2, 0.22, -0.7 + i * 0.45, 0.98, 1.0);
  pools.add(x + Math.sin(yaw) * 1.4, z + Math.cos(yaw) * 1.4, 2.0, "#ffc46a", 0.06, 0.7);
  k.paint.shadow(x, z, 1.4, 1.1, 0.3);
}

/** A string of fairy lights from a to b, sagging (glowing orbs on a thin wire). */
function lights(v: Vox, a: [number, number, number], b: [number, number, number], n: number, sag: number, cols: string[]) {
  let px = a[0],
    py = a[1],
    pz = a[2];
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const x = a[0] + (b[0] - a[0]) * f,
      z = a[2] + (b[2] - a[2]) * f,
      y = a[1] + (b[1] - a[1]) * f - Math.sin(f * Math.PI) * sag;
    strut(v, "#3a3550", px, py, pz, x, y, z, 0.03);
    v.frame(0, 0, 0, 0);
    if (i < n) v.add("orb", cols[i % cols.length], 0.17, 0.17, 0.17, x, y - 0.08, z, { glow: true });
    px = x;
    py = y;
    pz = z;
  }
}

/** A flat disc of paving on the snow (a plaza): rings of granite, a gold inlay. */
function plaza(k: Kit, x: number, z: number, r: number, cols: string[]) {
  const v = k.v;
  v.frame(x, 0, z, 0);
  cols.forEach((c, i) => v.cyl(c, r * (1 - i * 0.16), 0.05 + i * 0.012, 0, 0.03 + i * 0.012, 0, {}, "cyl"));
}

// ---- the landmarks ---------------------------------------------------------------------------------

function bayterek(k: Kit, d: LandmarkDef) {
  const { v, pools, words, life, paint } = k;
  const { x, z } = d;
  const E = BAYTEREK.egg;
  // the round plaza, its rings of light, the low drum the tower stands on
  plaza(k, x, z + 2, 10.5, ["#cfd5e2", "#dfe3ec", "#c7cedd", "#e8ebf2"]);
  v.frame(x, 0, z, 0);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    v.add("orb", "#bfe6ff", 0.22, 0.12, 0.22, Math.cos(a) * 9.8, 0.08, Math.sin(a) * 9.8 + 2, { glow: true });
  }
  v.cyl("#e9ecf3", 3.2, 0.6, 0, 0.3, 0, { ink: 0.05 });
  v.cyl("#d3d8e4", 2.6, 0.5, 0, 0.85, 0, { ink: 0.04 });
  v.cyl("#ffd98a", 2.62, 0.18, 0, 0.75, 0, { glow: true });
  // the white trunk: a core and a ring of slim columns drawing in, then flaring into the crown
  v.cyl("#f6f6f2", 0.55, E - 2.2, 0, (E - 2.2) / 2 + 0.9, 0, { ink: 0.035 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const a1 = a + 0.42;
    strut(v, "#fbfbf6", x + Math.cos(a) * 2.1, 1.0, z + Math.sin(a) * 2.1, x + Math.cos(a1) * 1.0, E * 0.62, z + Math.sin(a1) * 1.0, 0.2, { ink: 0.025 });
    strut(v, "#fbfbf6", x + Math.cos(a1) * 1.0, E * 0.62, z + Math.sin(a1) * 1.0, x + Math.cos(a1 + 0.25) * 0.9, E - 2.4, z + Math.sin(a1 + 0.25) * 0.9, 0.18, { ink: 0.02 });
  }
  // (the crown: ribs fanning out to cup the golden ball, a ring at their tips)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const s of [-1, 1]) strut(v, "#fbfbf6", x + Math.cos(a) * 0.8, E - 3.4, z + Math.sin(a) * 0.8, x + Math.cos(a + s * 0.3) * 3.4, E + 1.6, z + Math.sin(a + s * 0.3) * 3.4, 0.16, { ink: 0.02 });
  }
  v.frame(x, 0, z, 0);
  v.add("torus", "#fbfbf6", 6.9, 6.9, 2.2, 0, E + 1.6, 0, { rx: Math.PI / 2, ink: 0.02 });
  // the golden crown: a ball of lit glass under an amber net, the NU7 sign across it
  v.ball("#ffc23a", 2.15, 2.35, 2.15, 0, E, 0, { glow: true });
  for (let i = 1; i < 6; i++) {
    const f = i / 6;
    const rr = 2.2 * Math.sin(f * Math.PI);
    v.add("torus", "#c97a12", rr * 2, rr * 2, 0.7, 0, E - 2.4 * Math.cos(f * Math.PI), 0, { rx: Math.PI / 2 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    v.frame(x, 0, z, a);
    v.add("torus", "#c97a12", 4.5, 4.9, 0.7, 0, E, 0);
  }
  v.frame(x, 0, z, 0);
  // the lift's glass shaft up the south face (its cabin rides it: on())
  v.box("#9fd8ff", 0.9, E - 3, 0.12, 0, (E - 3) / 2 + 1.1, 1.05, { glow: true });
  v.box("#e8eef9", 1.3, 2.2, 0.9, 0, 1.1, 2.6, { ink: 0.04 });
  v.box("#ffe6b0", 0.8, 1.5, 0.06, 0, 0.95, 3.06, { glow: true });
  words.add("NU7 TOWER", 0.46, x, 2.5, z + 3.07, 0, { fg: GOLD, w: 2.6 });
  // (the NU7 sign hangs on the crown's south face, out in front of its ribs, on two gold rods)
  v.frame(x, 0, z, 0);
  v.box("#2a1f55", 2.7, 1.1, 0.14, 0, E - 0.3, 3.55, { ink: 0.04 });
  v.box(GOLD, 2.8, 0.1, 0.16, 0, E + 0.27, 3.55, { glow: true });
  v.box(GOLD, 2.8, 0.1, 0.16, 0, E - 0.87, 3.55, { glow: true });
  for (const s of [-0.9, 0.9]) v.box(GOLD, 0.09, 0.09, 1.5, s, E - 0.3, 2.75);
  words.add("NU7", 0.95, x, E - 0.3, z + 3.64, 0, { fg: "#ffe9a8", neon: true, w: 2.4 });
  // the glow round the crown (two halos), a wash up the trunk, the searchlights
  const h1 = halo("#ffb030", 13, 0.55);
  h1.position.set(x, E, z);
  const h2 = halo("#ffe9b0", 6.5, 0.85);
  h2.position.set(x, E, z);
  k.parent.add(h1, h2);
  S.eggHalo = h1;
  for (let y = 3; y < E - 3; y += 4.5) v.add("orb", "#dfe9ff", 0.3, 0.3, 0.3, 0, y, 0.75, { glow: true });
  pools.add(x, z, 7, "#ffd27a", 0.05, 0.75);
  pools.add(x, z + 2, 11, "#9fd8ff", 0.04, 0.35);
  for (const [sx, sz] of [
    [-6.5, -9.5],
    [6.5, -9.5],
  ])
    life.searchlight(x + sx, 0.4, z + sz, 0.35, 70, sx < 0 ? -0.5 : 0.5);
  // four flagpoles at the plaza's corners
  for (const [fx, fz] of [
    [-9, -8.5],
    [9, -8.5],
  ]) {
    v.frame(x + fx, 0, z + fz, 0);
    v.cyl("#e8e4ff", 0.08, 7, 0, 3.5, 0, { ink: 0.02 }, "cyl8");
    life.flag(x + fx, 6.4, z + fz, 0, KZ, 1.3);
  }
  paint.shadow(x, z, 3.4, 3.4, 0.4);
}

/** The ZK MALL: a great tent of glowing fabric on a ring of glazed halls (the shops inside). */
function khanShatyr(k: Kit, d: LandmarkDef) {
  const { v, pools, words, life, paint, parent } = k;
  const { x, z } = d;
  const rx = 6.2,
    rz = 5.6,
    H = 15,
    base = 2.4;
  const segs = 30,
    rings = 10;
  const ring = (kk: number) => {
    const f = kk / rings;
    // (the point leans west and north; the skin twists as it rises)
    return { y: base + (H - base) * f, r: Math.pow(1 - f, 0.72), ox: -1.8 * f * f, oz: -1.2 * f * f, tw: f * 0.55 };
  };
  const pos: number[] = [],
    col: number[] = [];
  const band = (kk: number) => (kk === 1 ? new THREE.Color("#ffcf6a") : kk === 4 ? new THREE.Color("#d58bff") : kk === 7 ? new THREE.Color("#7ff3ff") : new THREE.Color("#f6ecd6"));
  for (let kk = 0; kk < rings; kk++) {
    const a0 = ring(kk),
      a1 = ring(kk + 1);
    const c = band(kk);
    for (let j = 0; j < segs; j++) {
      const t0 = (j / segs) * Math.PI * 2,
        t1 = ((j + 1) / segs) * Math.PI * 2;
      const p = (q: ReturnType<typeof ring>, t: number) => [x + q.ox + Math.cos(t + q.tw) * rx * q.r, q.y, z + q.oz + Math.sin(t + q.tw) * rz * q.r];
      const A = p(a0, t0),
        B = p(a0, t1),
        C = p(a1, t1),
        D = p(a1, t0);
      pos.push(...A, ...D, ...C, ...A, ...C, ...B);
      for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // (the skin glows from within at night: a lit toon with a strong emissive)
  const skin = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps(), emissive: "#8a6a48", side: THREE.DoubleSide }));
  skin.raycast = () => {};
  parent.add(skin);
  // the cable net (helices both ways), the mast and its spire
  for (const dir of [-1, 1])
    for (let j = 0; j < 12; j++)
      for (let kk = 0; kk < rings - 1; kk++) {
        const q0 = ring(kk),
          q1 = ring(kk + 1);
        const t0 = (j / 12) * Math.PI * 2 + dir * kk * 0.26,
          t1 = t0 + dir * 0.26;
        strut(v, "#8f7c5a", x + q0.ox + Math.cos(t0 + q0.tw) * rx * q0.r * 1.01, q0.y, z + q0.oz + Math.sin(t0 + q0.tw) * rz * q0.r * 1.01, x + q1.ox + Math.cos(t1 + q1.tw) * rx * q1.r * 1.01, q1.y, z + q1.oz + Math.sin(t1 + q1.tw) * rz * q1.r * 1.01, 0.06);
      }
  const top = ring(rings);
  strut(v, "#d8d8e4", x + top.ox, H - 1, z + top.oz, x + top.ox - 1.2, H + 5.5, z + top.oz - 0.6, 0.16, { ink: 0.02 });
  v.frame(0, 0, 0, 0);
  v.add("orb", "#ff4040", 0.3, 0.3, 0.3, x + top.ox - 1.25, H + 5.7, z + top.oz - 0.62, { glow: true });
  life.blinker(x + top.ox - 1.25, H + 5.9, z + top.oz - 0.62, "#ff4040");
  // its foot: a ring of glazed halls, warm inside; the doors toward the market (east)
  for (let j = 0; j < 26; j++) {
    const t = (j / 26) * Math.PI * 2;
    const px = x + Math.cos(t) * rx * 1.02,
      pz = z + Math.sin(t) * rz * 1.02;
    v.frame(px, 0, pz, -t + Math.PI / 2);
    v.box("#e4dccb", 1.6, base + 0.2, 0.7, 0, (base + 0.2) / 2, 0, { ink: 0.03 });
    v.box(pick(WARM, k.rnd()), 1.2, 1.3, 0.06, 0, 1.0, 0.36, { glow: true });
    v.box(SNOW, 1.7, 0.18, 0.8, 0, base + 0.3, 0);
  }
  // the entrance arch toward the boulevard, its name
  v.frame(x + rx + 0.4, 0, z - 0.6, Math.PI / 2);
  v.box("#e4dccb", 4.2, 3.4, 1.2, 0, 1.7, 0, { ink: 0.04 });
  v.box("#ffe6b0", 2.4, 2.2, 0.08, 0, 1.1, 0.62, { glow: true });
  words.add(d.label ?? "ZK MALL", 0.5, x + rx + 1.1, 2.8, z - 0.6, Math.PI / 2, { fg: GOLD, w: 3.6 });
  pools.add(x, z, 11, "#ffcf8a", 0.05, 0.85);
  pools.add(x + rx + 2, z - 0.6, 4, "#ffd98a", 0.06, 0.9);
  life.searchlight(x - 2, 0.3, z - 7, 0.25, 55, -0.3);
  paint.shadow(x, z, rx + 1, rz + 1, 0.35);
}

/** CITY HALL: the white palace under its sky-blue dome with gold ribs, its spire and sun; flags. */
function akOrda(k: Kit, d: LandmarkDef) {
  const { v, pools, life, paint, words } = k;
  const { x, z } = d;
  const yaw = d.rot ?? -Math.PI / 2;
  v.frame(x, 0, z, yaw);
  // (local: x across the front, +z out of the front)
  for (const [lx, w, h] of [
    [0, 7, 5.4],
    [-6.6, 6.2, 4],
    [6.6, 6.2, 4],
  ] as [number, number, number][]) {
    v.box("#f4f1ea", w, h, 6, lx, h / 2, 0, { ink: 0.05 });
    v.box("#e2ddd2", w + 0.3, 0.3, 6.3, lx, h + 0.15, 0);
    v.box(SNOW, w + 0.1, 0.12, 6.1, lx, h + 0.36, 0);
    const n = Math.floor(w / 1.1);
    for (let f = 0; f < Math.floor(h / 1.5); f++)
      for (let c = 0; c < n; c++) v.box(pick(WARM, k.rnd()), 0.5, 0.75, 0.06, lx - w / 2 + (c + 0.5) * (w / n), 1.0 + f * 1.45, 3.02, { glow: true });
  }
  // the portico: columns under the pediment
  for (let c = 0; c < 6; c++) v.cyl("#ffffff", 0.22, 4.6, -2.5 + c, 2.3, 3.6, { ink: 0.02 }, "cyl8");
  v.box("#f7f5ef", 6.6, 0.7, 1.3, 0, 4.9, 3.6, { ink: 0.03 });
  // the drum, the blue dome with gold ribs, the lantern, the spire and its sun
  v.cyl("#f4f1ea", 2.6, 1.8, 0, 6.3, -0.4, { ink: 0.04 });
  v.cyl("#ffe2a0", 2.65, 0.2, 0, 7.0, -0.4, { glow: true });
  v.ball("#3f9fe8", 2.6, 2.45, 2.6, 0, 7.2, -0.4, { ink: 0.04 });
  const L = (lx: number, lz: number): [number, number] => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (let q = 0; q < 4; q++) {
      const p0 = (q / 4) * (Math.PI / 2),
        p1 = ((q + 1) / 4) * (Math.PI / 2);
      const [ax, az] = L(Math.cos(a) * 2.66 * Math.cos(p0), -0.4 + Math.sin(a) * 2.66 * Math.cos(p0)),
        [bx, bz] = L(Math.cos(a) * 2.66 * Math.cos(p1), -0.4 + Math.sin(a) * 2.66 * Math.cos(p1));
      strut(v, GOLD, ax, 7.2 + 2.46 * Math.sin(p0), az, bx, 7.2 + 2.46 * Math.sin(p1), bz, 0.13);
    }
  }
  v.frame(x, 0, z, yaw);
  v.cyl("#ffd27a", 0.45, 1.0, 0, 10.0, -0.4, { glow: true });
  v.cyl(GOLD, 0.08, 3.6, 0, 12.2, -0.4, {}, "cyl8");
  v.add("orb", "#ffd23f", 0.5, 0.5, 0.16, 0, 14.2, -0.4, { glow: true });
  // the forecourt: paving, lamps, the guard's flags
  for (const s of [-1, 1]) {
    v.cyl("#e8e4ff", 0.07, 6, s * 5.2, 3, 7.5, { ink: 0.02 }, "cyl8");
  }
  for (const s of [-1, 1]) {
    const [fx, fz] = L(s * 5.2, 7.5);
    life.flag(fx, 5.4, fz, yaw + Math.PI / 2, KZ, 1.1);
  }
  const [wx, wz] = L(0, 4.6);
  words.add(d.label ?? "CITY HALL", 0.42, wx, 5.6, wz, yaw, { fg: "#2a5d9c", w: 2.8 });
  const [px, pz] = L(0, 6);
  pools.add(px, pz, 7, "#fff2d6", 0.05, 0.7);
  pools.add(x, z, 9, "#bfe0ff", 0.04, 0.4);
  const [sx, sz] = L(0, 9);
  life.searchlight(sx, 0.3, sz, 0.3, 50, yaw);
  paint.shadow(x, z, 10, 4.5, 0.35);
}

/** The GREAT PYRAMID: a pale granite pyramid, its glass apex lit blue to gold. */
function peace(k: Kit, d: LandmarkDef) {
  const { v, pools, words, paint } = k;
  const { x, z } = d;
  const S = 13;
  v.frame(x, 0, z, 0);
  v.box("#c9b89a", S + 4, 1.2, S + 4, 0, 0.6, 0, { ink: 0.06 });
  v.box(SNOW, S + 4.1, 0.14, S + 4.1, 0, 1.22, 0);
  v.roof("#e6d3b0", S, S, S, 0, 1.2 + S / 2, 0, { ink: 0.07 });
  const A = S * 0.38;
  v.roof("#7fb4ff", A * 1.03, A * 1.03, A * 1.03, 0, 1.2 + S - A / 2 + 0.03, 0, { glow: true });
  v.roof("#ffd27a", A * 0.52, A * 0.52, A * 0.52, 0, 1.2 + S - A * 0.26 + 0.06, 0, { glow: true });
  // (lit slits up its faces; a door)
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const h = 1.6 + i * 1.5;
      const off = (S / 2) * (1 - (h - 1.2) / S) + 0.05;
      v.box("#ffe9b0", 0.35, 0.5, 0.05, s * 1.6, h, off, { glow: true });
    }
  v.box("#ffe6b0", 1.6, 1.8, 0.1, 0, 2.1, S / 2 - 0.55, { glow: true });
  const h = halo("#8fc0ff", 10, 0.5);
  h.position.set(x, 1.2 + S - A * 0.5, z);
  k.parent.add(h);
  words.add(d.label ?? "GREAT PYRAMID", 0.42, x, 1.5, z + S / 2 + 2.1, 0, { fg: "#ffffff", bg: "#2a3a6a", w: 4.2 });
  pools.add(x, z, 12, "#a9c8ff", 0.05, 0.55);
  paint.shadow(x, z, S * 0.7, S * 0.7, 0.35);
}

/** The OPERA HOUSE: a white hall under its great dome, a red band round it, four lantern towers with gold finials. */
function hazret(k: Kit, d: LandmarkDef) {
  const { v, pools, words, life, paint } = k;
  const { x, z } = d;
  v.frame(x, 0, z, 0);
  v.box("#f6f6f2", 11, 4.2, 11, 0, 2.1, 0, { ink: 0.06 });
  v.box("#b8323a", 11.3, 0.35, 11.3, 0, 4.35, 0);
  v.box(SNOW, 11.1, 0.12, 11.1, 0, 4.58, 0);
  for (const s of [-1, 1])
    for (let c = 0; c < 6; c++) {
      v.box(pick(WARM, k.rnd()), 0.6, 1.4, 0.06, -3.6 + c * 1.45, 2.1, s * 5.53, { glow: true });
    }
  v.cyl("#f6f6f2", 3.6, 1.8, 0, 5.4, 0, { ink: 0.04 });
  v.cyl("#ffd59a", 3.62, 0.3, 0, 5.6, 0, { glow: true });
  v.ball("#fbfbf8", 3.9, 3.4, 3.9, 0, 6.3, 0, { ink: 0.05 });
  v.cyl(GOLD, 0.12, 2, 0, 10.4, 0, {}, "cyl8");
  v.add("orb", "#ffd23f", 0.8, 0.8, 0.8, 0, 11.5, 0, { glow: true });
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    v.ball("#fbfbf8", 1.3, 1.1, 1.3, sx * 3.8, 4.6, sz * 3.8, { ink: 0.03 });
    const mx = sx * 7.4,
      mz = sz * 7.4;
    v.cyl("#f6f6f2", 0.6, 8, mx, 4, mz, { ink: 0.03 }, "cyl8");
    v.cyl("#ffe2a0", 0.72, 0.35, mx, 5.2, mz, { glow: true }, "cyl8");
    v.cyl("#ffe2a0", 0.68, 0.35, mx, 7.0, mz, { glow: true }, "cyl8");
    v.add("cone6", "#b8323a", 1.4, 1.6, 1.4, mx, 8.8, mz, { ink: 0.02 });
    v.add("orb", "#ffd23f", 0.4, 0.4, 0.4, mx, 9.75, mz, { glow: true });
  }
  words.add(d.label ?? "OPERA HOUSE", 0.42, x, 1.4, z + 7.7, 0, { fg: "#ffffff", bg: "#1f6f6a", w: 4.0 });
  pools.add(x, z, 12, "#fff0c8", 0.05, 0.6);
  life.searchlight(x + 8, 0.3, z + 8, 0.2, 45, 0.4);
  paint.shadow(x, z, 8, 8, 0.35);
}

/** The zkSNARK MUSEUM: a great glass sphere, its grid lit from inside. */
function nurAlem(k: Kit, d: LandmarkDef) {
  const { v, pools, paint } = k;
  const { x, z } = d;
  const R = 4.6;
  v.frame(x, 0, z, 0);
  v.cyl("#cfd5e2", 4, 0.6, 0, 0.3, 0, { ink: 0.04 });
  v.ball("#6fa8ff", R, R, R, 0, R + 0.6, 0, { glow: true });
  for (let i = 1; i < 6; i++) {
    const f = i / 6;
    const rr = R * Math.sin(f * Math.PI) * 1.01;
    v.add("torus", "#dff4ff", rr * 2, rr * 2, 0.5, 0, R + 0.6 - R * Math.cos(f * Math.PI), 0, { rx: Math.PI / 2, glow: true });
  }
  for (let i = 0; i < 6; i++) {
    v.frame(x, 0, z, (i / 6) * Math.PI);
    v.add("torus", "#dff4ff", R * 2.02, R * 2.02, 0.5, 0, R + 0.6, 0, { glow: true });
  }
  const h = halo("#7fc0ff", 14, 0.4);
  h.position.set(x, R + 0.6, z);
  k.parent.add(h);
  pools.add(x, z, 9, "#7fc0ff", 0.05, 0.7);
  paint.shadow(x, z, 4.5, 4.5, 0.3);
}

/** The GOLDEN TOWERS: two gold cans banded floor by floor, their crowns lit. */
function golden(k: Kit, d: LandmarkDef) {
  const { v, pools, paint } = k;
  const { x, z } = d;
  for (const sd of [-1, 1]) {
    const px = x + sd * 2.6;
    const H = 15 + sd;
    v.frame(px, 0, z, 0);
    v.cyl("#c9953a", 1.7, H, 0, H / 2, 0, { ink: 0.05 });
    for (let y = 1.6; y < H - 0.5; y += 1.1) v.cyl(y % 3.3 < 1.1 ? "#ffd98a" : "#ffc95a", 1.72, 0.22, 0, y, 0, { glow: true });
    v.cyl("#ffe9b0", 1.8, 0.5, 0, H + 0.25, 0, { glow: true });
    v.cyl(SNOW, 1.75, 0.15, 0, H + 0.55, 0);
    paint.shadow(px, z, 2, 2, 0.3);
  }
  v.frame(x, 0, z, 0);
  v.box("#efe6da", 8, 3.4, 4, 0, 1.7, 2.2, { ink: 0.05 });
  v.box(SNOW, 8.1, 0.15, 4.1, 0, 3.45, 2.2);
  for (let c = 0; c < 6; c++) v.box(pick(WARM, k.rnd()), 0.8, 0.9, 0.06, -3.2 + c * 1.3, 1.6, 4.22, { glow: true });
  const h = halo("#ffd98a", 9, 0.35);
  h.position.set(x, 15, z);
  k.parent.add(h);
  pools.add(x, z, 7, "#ffcf7a", 0.05, 0.7);
}

/** The zkSNARK OF LIBERTY: the white column in its round, a golden ⓩ mark on top (a ring and a Z). */
function eli(k: Kit, d: LandmarkDef) {
  const { v, pools, paint } = k;
  const { x, z } = d;
  v.frame(x, 0, z, 0);
  plaza(k, x, z, 4, ["#cfd5e2", "#e2e6ee"]);
  v.frame(x, 0, z, 0);
  v.cyl("#e4e4ea", 1.6, 0.8, 0, 0.4, 0, { ink: 0.04 });
  v.box("#d8d2c8", 1.6, 1.6, 1.6, 0, 1.6, 0, { ink: 0.03 });
  v.box(GOLD, 1.65, 0.5, 1.65, 0, 1.5, 0);
  v.cyl("#fafaf8", 0.42, 12, 0, 8.4, 0, { ink: 0.03 }, "cyl8");
  v.cyl("#ffcf4a", 0.6, 0.5, 0, 14.5, 0, { glow: true });
  v.add("torus", "#ffc23a", 2.8, 2.8, 2.4, 0, 16.3, 0, { glow: true });
  v.box("#ffc23a", 1.0, 0.24, 0.26, 0, 16.75, 0, { glow: true });
  v.box("#ffc23a", 1.0, 0.24, 0.26, 0, 15.85, 0, { glow: true });
  v.box("#ffc23a", 0.24, 1.3, 0.26, 0, 16.3, 0, { rz: -0.84, glow: true });
  for (const ty of [17.0, 15.6]) v.box("#ffc23a", 0.18, 0.3, 0.26, 0, ty, 0, { glow: true });
  pools.add(x, z, 5, "#ffd98a", 0.05, 0.6);
  paint.shadow(x, z, 1.6, 1.6, 0.3);
}

// ---- the river and its bridges -----------------------------------------------------------------------

/** The river's middle at x (its line), and the half-width of the gap between the banks there. */
function riverZ(x: number) {
  for (let i = 1; i < RIVER.length; i++)
    if (x <= RIVER[i][0]) {
      const [x0, z0] = RIVER[i - 1],
        [x1, z1] = RIVER[i];
      return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    }
  return RIVER[RIVER.length - 1][1];
}

/** The frozen canal: its ice (one textured ribbon from horizon to horizon), skaters, fishing tents. */
function esil(k: Kit) {
  const { v, rnd, parent } = k;
  // the ice ribbon
  const tex = canvasTex(256, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, "#f2f7ff");
    gr.addColorStop(0.12, "#cfe6f6");
    gr.addColorStop(0.3, "#a9d2ee");
    gr.addColorStop(0.5, "#9cc9ea");
    gr.addColorStop(0.7, "#a9d2ee");
    gr.addColorStop(0.88, "#cfe6f6");
    gr.addColorStop(1, "#f2f7ff");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 512);
    // snow drifts at the banks, streaks of wind-polished ice, a few white cracks, skate marks
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
      const side = Math.random() < 0.5 ? Math.random() * 50 : 256 - Math.random() * 50;
      g.beginPath();
      g.ellipse(side, Math.random() * 512, 6 + Math.random() * 18, 14 + Math.random() * 40, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const x0 = 40 + Math.random() * 176,
        y0 = Math.random() * 512;
      g.moveTo(x0, y0);
      g.lineTo(x0 + (Math.random() - 0.5) * 30, y0 + 20 + Math.random() * 60);
      g.stroke();
    }
    g.strokeStyle = "rgba(90,140,190,0.35)";
    g.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      let px = 50 + Math.random() * 156,
        py = Math.random() * 512;
      g.beginPath();
      g.moveTo(px, py);
      for (let s = 0; s < 5; s++) ((px += (Math.random() - 0.5) * 30), (py += (Math.random() - 0.5) * 30), g.lineTo(px, py));
      g.stroke();
    }
  }, true);
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const W = 7.2;
  let len = 0;
  let px = RIVER[0][0],
    pz = riverZ(px);
  const N = 420;
  for (let i = 0; i <= N; i++) {
    const x = RIVER[0][0] + ((RIVER[RIVER.length - 1][0] - RIVER[0][0]) * i) / N;
    const zz = riverZ(x);
    const nx = riverZ(x + 0.5) - riverZ(x - 0.5);
    const l = Math.hypot(1, nx);
    // (the normal across the river: (-dz, dx))
    const ox = -nx / l,
      oz = 1 / l;
    len += Math.hypot(x - px, zz - pz);
    px = x;
    pz = zz;
    const w = W + Math.max(0, Math.abs(x) - 60) * 0.03;
    pos.push(x - ox * w, ICE_Y, zz - oz * w, x + ox * w, ICE_Y, zz + oz * w);
    uv.push(0, len / 14, 1, len / 14);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ice = new THREE.Mesh(g, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: "#1d3550" }));
  ice.raycast = () => {};
  parent.add(ice);
  // the far banks' embankment walls beyond the islands (granite, lamps), both sides, out to the plains
  for (const [a, b] of [
    [-110, -46],
    [54, 130],
  ] as [number, number][])
    for (let x = a; x < b; x += 4) {
      const zz = riverZ(x + 2);
      for (const s of [-1, 1]) {
        v.frame(x + 2, 0, zz + s * 7.6, Math.atan2(4, riverZ(x + 4) - riverZ(x)));
        v.box("#8d94a7", 0.8, 0.9, 4.1, 0, STEPPE_Y + 0.45, 0);
      }
    }
  // the promenades along both banks: lamps every few metres, a bench between
  for (let x = -41; x < 50; x += 6.5)
    for (const sd of [-1, 1]) {
      const lz = riverZ(x) + sd * 6.3;
      if (!k.ground.free(x, lz, 0.35, 0.5) || k.ground.onPath(x, lz, 0.6)) continue;
      k.ground.take(x, lz, 0.8);
      lamp(k, x, lz, "#ffd59a", 2.7);
      const bz = riverZ(x + 3.2) + sd * 6.6;
      if (k.ground.free(x + 3.2, bz, 0.6, 0.4)) {
        k.ground.take(x + 3.2, bz, 0.9);
        v.frame(x + 3.2, 0, bz, sd > 0 ? Math.PI : 0);
        v.box("#8a5a34", 1.5, 0.1, 0.42, 0, 0.46, 0, { ink: 0.02 });
        v.box("#8a5a34", 1.5, 0.36, 0.08, 0, 0.74, -0.2, { ink: 0.02 });
        v.box(SNOW, 1.5, 0.06, 0.42, 0, 0.53, 0);
        for (const q of [-0.6, 0.6]) v.box(DARK, 0.08, 0.46, 0.4, q, 0.23, 0);
      }
    }
  // skaters, fishing tents with their lanterns, a few ice holes
  for (const [fx, fs] of [
    [-40, 1],
    [-18, -1],
    [48, 1],
    [62, -1],
    [-58, -1],
  ] as [number, number][]) {
    const fz = riverZ(fx) + fs * 3.6;
    v.frame(fx, ICE_Y, fz, rnd() * 3);
    v.add("cone6", pick(["#ff5f5f", "#3ec6ff", "#ffd23f", "#33d67c"], rnd()), 1.5, 1.2, 1.5, 0, 0.6, 0, { ink: 0.03 });
    v.box("#ffd98a", 0.2, 0.2, 0.2, 0.9, 0.2, 0.3, { glow: true });
    v.cyl("#2a4a6a", 0.25, 0.03, 1.2, 0.02, -0.4);
    v.box(DARK, 0.4, 0.3, 0.3, -0.9, 0.15, 0.4);
    k.pools.add(fx + 0.9, fz + 0.3, 1.5, "#ffc46a", ICE_Y + 0.05, 0.5);
  }
}

/** The two bridges over the canal: decks bank to bank under the paths, steel arches, lamps, rails. */
function bridges(k: Kit) {
  const { v, g, pools } = k;
  for (const id of ["wbridge", "ebridge"]) {
    const sp = g.spaces.filter((s) => s.path === id);
    if (!sp.length) continue;
    const a = sp[0],
      b = sp[sp.length - 1];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const L = Math.hypot(dx, dz) + 5;
    const yaw = Math.atan2(dx, dz);
    const cx = (a.x + b.x) / 2,
      cz = (a.z + b.z) / 2;
    const W = (lx: number, lz: number): [number, number] => [cx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, cz - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
    v.frame(cx, 0, cz, yaw);
    v.box("#9aa1b3", 4.6, 0.5, L, 0, -0.27, 0, { ink: 0.05 });
    v.box("#d9dde6", 4.2, 0.06, L, 0, 0.0, 0);
    // (arches under the deck, lit blue; piers into the ice)
    for (const s of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const f0 = i / 12,
          f1 = (i + 1) / 12;
        const y0 = -0.4 - (1 - Math.sin(f0 * Math.PI)) * 1.1,
          y1 = -0.4 - (1 - Math.sin(f1 * Math.PI)) * 1.1;
        const [ax, az] = W(s * 2.1, -L / 2 + f0 * L),
          [bx, bz] = W(s * 2.1, -L / 2 + f1 * L);
        strut(v, "#5a6a8a", ax, y0, az, bx, y1, bz, 0.3, { ink: 0.02 });
      }
      v.frame(cx, 0, cz, yaw);
      v.box("#7fd8ff", 0.08, 0.08, L * 0.8, s * 2.32, -0.55, 0, { glow: true });
      // the railings: posts and a rail, lamps every few metres
      for (let t = -L / 2 + 0.6; t < L / 2; t += 1.3) v.box("#e8e4ff", 0.1, 0.8, 0.1, s * 2.15, 0.4, t);
      v.box("#e8e4ff", 0.1, 0.1, L, s * 2.15, 0.8, 0);
      for (const t of [-L / 2 + 1.5, 0, L / 2 - 1.5]) {
        v.cyl(DARK, 0.07, 2.6, s * 2.25, 1.3, t, {}, "cyl8");
        v.box("#ffd59a", 0.32, 0.4, 0.32, s * 2.25, 2.75, t, { glow: true });
        const wx = cx + Math.sin(yaw) * t + Math.cos(yaw) * s * 2.25,
          wz = cz + Math.cos(yaw) * t - Math.sin(yaw) * s * 2.25;
        pools.add(wx, wz, 2.4, "#ffd59a", 0.06, 0.7);
      }
    }
    for (const t of [-L / 2 + 2.2, L / 2 - 2.2]) v.box("#8d94a7", 3.6, 1.6, 0.9, 0, ICE_Y + 0.8, t, { ink: 0.03 });
  }
}

/** The ICE RUN's lane on the river: groomed snow between orange poles with lanterns, the ramps on and off, its sign. */
function iceRun(k: Kit) {
  const { v, g, pools, words } = k;
  const run = g.spaces.filter((s) => s.ice);
  if (!run.length) return;
  const first = run[0],
    last = run[run.length - 1];
  const prev = g.spaces[first.prev.find((p) => !g.spaces[p].ice) ?? first.prev[0]];
  const next = g.spaces[last.next[0].to];
  const pts: [number, number][] = [[prev.x, prev.z], ...run.map((s) => [s.x, s.z] as [number, number]), [next.x, next.z]];
  for (let i = 1; i < pts.length - 2; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    v.frame((ax + bx) / 2, ICE_Y, (az + bz) / 2, yaw);
    v.box("#f6fbff", 2.6, 0.04, L + 2.6, 0, 0.02, 0);
    for (let t = -L / 2; t < L / 2; t += 3.2)
      for (const s of [-1, 1]) {
        v.box("#ff7a1a", 0.12, 1.2, 0.12, s * 1.7, 0.6, t, { ink: 0.015 });
        v.add("orb", "#ffb040", 0.36, 0.36, 0.36, s * 1.7, 1.3, t, { glow: true });
      }
    pools.add((ax + bx) / 2, (az + bz) / 2, L * 0.55, "#ffb040", ICE_Y + 0.05, 0.4);
  }
  // the ramps: down off the right bank onto the ice, up out of it onto the left bank
  for (const [[ax, az, ay], [bx, bz, by]] of [
    [
      [prev.x, prev.z, 0],
      [first.x, first.z, ICE_Y],
    ],
    [
      [last.x, last.z, ICE_Y],
      [next.x, next.z, 0],
    ],
  ] as [number, number, number][][]) {
    const L = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    v.frame((ax + bx) / 2, 0, (az + bz) / 2, yaw);
    v.box("#e9eef7", 2.4, 0.2, L, 0, (ay + by) / 2 + 0.08, 0, { rx: -Math.atan2(by - ay, L), ink: 0.03 });
    for (const s of [-1, 1]) v.box("#ff7a1a", 0.1, 0.1, L, s * 1.25, (ay + by) / 2 + 0.6, 0, { rx: -Math.atan2(by - ay, L) });
  }
  // the gate at the top: an arch of ice blocks with its sign
  const yaw0 = Math.atan2(first.x - prev.x, first.z - prev.z);
  const gx = prev.x + (first.x - prev.x) * 0.38,
    gz = prev.z + (first.z - prev.z) * 0.38;
  v.frame(gx, 0, gz, yaw0);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) v.box(i % 2 ? "#cfefff" : "#b5e4ff", 0.6, 0.6, 0.6, s * 1.6, -0.2 + i * 0.62, 0, { glow: true });
  v.box("#ff7a1a", 3.8, 0.7, 0.3, 0, 2.5, 0, { ink: 0.04 });
  words.add("ICE RUN", 0.5, gx - Math.sin(yaw0) * 0.17, 2.5, gz - Math.cos(yaw0) * 0.17, yaw0 + Math.PI, { fg: "#ffffff", w: 3.4 });
  // little ice plinths under the run's spaces (the shared kit's stone ones stay on land)
  for (const sp of run) {
    v.frame(sp.x, ICE_Y, sp.z, 0);
    v.cyl("#bfe6ff", 1.62, 0.08, 0, 0.04, 0, {}, "hex");
    v.cyl("#e2f4ff", 1.48, 0.22, 0, 0.11, 0, { ink: 0.03 }, "hex");
  }
  // (their tops: an ice disc with a snowflake and a slide arrow over the kind's icon: nobody stops here)
  {
    const tex = canvasTex(128, 128, (c) => {
      const gr = c.createRadialGradient(64, 64, 10, 64, 64, 64);
      gr.addColorStop(0, "#f4fbff");
      gr.addColorStop(0.75, "#bfe6ff");
      gr.addColorStop(0.92, "#7fc8f0");
      gr.addColorStop(1, "rgba(127,200,240,0)");
      c.fillStyle = gr;
      c.beginPath();
      c.arc(64, 64, 63, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#3e8fd0";
      c.lineCap = "round";
      c.lineWidth = 6;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        c.beginPath();
        c.moveTo(64 - Math.cos(a) * 34, 64 - Math.sin(a) * 34);
        c.lineTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34);
        c.stroke();
      }
      c.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ex = 64 + Math.cos(a) * 24,
          ey = 64 + Math.sin(a) * 24;
        for (const sd of [-1, 1]) {
          c.beginPath();
          c.moveTo(ex, ey);
          c.lineTo(ex + Math.cos(a + sd * 0.8) * 10, ey + Math.sin(a + sd * 0.8) * 10);
          c.stroke();
        }
      }
    });
    const pos: number[] = [],
      uv: number[] = [],
      ix: number[] = [];
    for (let k2 = 0; k2 < run.length; k2++) {
      const sp = run[k2];
      const nx = k2 + 1 < run.length ? run[k2 + 1] : next;
      const rot = Math.atan2(nx.x - sp.x, nx.z - sp.z);
      const o = pos.length / 3;
      const y = ICE_Y + 0.22 + 0.3 + 0.09;
      for (const [u, w] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const r = 1.12;
        pos.push(sp.x + (u * Math.cos(rot) + w * Math.sin(rot)) * r, y, sp.z + (-u * Math.sin(rot) + w * Math.cos(rot)) * r);
        uv.push((u + 1) / 2, (w + 1) / 2);
      }
      ix.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    gg.setIndex(ix);
    const m = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.renderOrder = 3;
    m.raycast = () => {};
    k.parent.add(m);
  }
  // the cracks (three levels, shown as they come) and the hole (shown while broken)
  const crackTex = canvasTex(256, 256, (c) => {
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineCap = "round";
    for (let r = 0; r < 9; r++) {
      let x = 128,
        y = 128;
      const a = (r / 9) * Math.PI * 2 + Math.random() * 0.5;
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += Math.cos(a + (Math.random() - 0.5) * 0.9) * 18;
        y += Math.sin(a + (Math.random() - 0.5) * 0.9) * 18;
        c.lineTo(x, y);
        c.lineWidth = Math.max(1, 5 - s);
      }
      c.stroke();
    }
    c.strokeStyle = "rgba(30,80,140,0.8)";
    c.lineWidth = 1.5;
    for (let r = 0; r < 6; r++) {
      c.beginPath();
      c.arc(128, 128, 30 + r * 16, Math.random() * 6, Math.random() * 6 + 1);
      c.stroke();
    }
  });
  const spots = [0, 1, 2, 3].map((i) => {
    const f = (i + 0.5) / 4;
    const a = run[Math.min(run.length - 1, Math.floor(f * (run.length - 1)))],
      b = run[Math.min(run.length - 1, Math.floor(f * (run.length - 1)) + 1)];
    return [(a.x + b.x) / 2, (a.z + b.z) / 2] as [number, number];
  });
  for (let lvl = 0; lvl < 3; lvl++) {
    const gg = new THREE.BufferGeometry();
    const p: number[] = [],
      q: number[] = [],
      ix: number[] = [];
    const add = (x: number, z: number, r: number, rot: number) => {
      const o = p.length / 3;
      for (const [u, w] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        p.push(x + (u * Math.cos(rot) - w * Math.sin(rot)) * r, ICE_Y + 0.06 + lvl * 0.004, z + (u * Math.sin(rot) + w * Math.cos(rot)) * r);
        q.push((u + 1) / 2, (w + 1) / 2);
      }
      ix.push(o, o + 2, o + 1, o, o + 3, o + 2);
    };
    // (level 1: one star at the entry; 2: more along the lane; 3: everywhere, bigger)
    add(first.x, first.z, 1.6 + lvl * 0.7, lvl * 1.3);
    for (let i = 0; i <= lvl; i++) {
      const [sx, sz] = spots[(i + lvl) % spots.length];
      add(sx + (lvl - 1) * 1.2, sz, 1.4 + lvl * 0.5, i + lvl);
    }
    gg.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    gg.setAttribute("uv", new THREE.Float32BufferAttribute(q, 2));
    gg.setIndex(ix);
    const m = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.visible = false;
    m.renderOrder = 2;
    m.raycast = () => {};
    k.parent.add(m);
    S.cracks.push(m);
  }
  // the hole: black water, jagged rim floes
  const hole = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.9, 12), new THREE.MeshBasicMaterial({ color: "#0d2440" }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.04;
  hole.add(water);
  const floe = new THREE.MeshToonMaterial({ color: "#e8f4ff", gradientMap: toonSteps() });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9 + Math.random() * 0.5, 0.22, 0.7), floe);
    m.position.set(Math.cos(a) * 2.0, 0.08, Math.sin(a) * 2.0);
    m.rotation.set((Math.random() - 0.5) * 0.4, -a, (Math.random() - 0.5) * 0.5);
    hole.add(m);
  }
  hole.position.set(first.x, ICE_Y, first.z);
  hole.visible = false;
  k.parent.add(hole);
  S.hole = hole;
}

// ---- the city round the paths ------------------------------------------------------------------------

/** Try n spots in a box; `make` builds there when the ground is free (and low enough near the paths). */
function scatter(k: Kit, n: number, x0: number, z0: number, x1: number, z1: number, r: number, h: number, make: (x: number, z: number) => void, tries = 40) {
  const { ground, rnd } = k;
  let made = 0;
  for (let i = 0; i < n * tries && made < n; i++) {
    const x = x0 + rnd() * (x1 - x0),
      z = z0 + rnd() * (z1 - z0);
    if (!ground.free(x, z, r)) continue;
    if (h > 0 && ground.maxH(x, z, r) < h) continue;
    ground.take(x, z, r + 0.4);
    make(x, z);
    made++;
  }
  return made;
}

function city(k: Kit) {
  const { v, rnd, pools, life, words, ground } = k;
  const walls = ["#e8d9c0", "#d9a872", "#c98b74", "#a8bcd8", "#e6e0f0", "#cdd6e6", "#f0e2c4", "#b9a6d4"];
  // blocks of flats: the south-east and north-east quarters, the inner city behind the start, the north
  const blocks: [number, number, number, number, number, number][] = [
    // x, z, w, d, floors, yaw
    [44, 12, 7, 4, 9, 0.1],
    [46, 22, 6, 4, 7, -0.1],
    [40, 25, 8, 3.6, 5, 0],
    [45, -40, 8, 4.5, 12, 0.2],
    [36, -48, 6, 4, 9, -0.2],
    [46, -52, 6, 6, 14, 0.1],
    [-36, -48, 7, 4, 8, 0.15],
    [-40, -38, 5, 4, 6, -0.1],
    [-6, 16, 6, 3.6, 4, 0],
    [8, 16.5, 6, 3.6, 4, 0],
    [-15, 17, 4.5, 3.6, 3, 0.1],
    [18, 17, 4.5, 3.6, 3, -0.1],
    [-4, -56, 8, 4, 10, 0],
    [9, -57, 6, 4, 13, 0],
    [32, -40, 4.5, 4.5, 6, 0],
  ];
  for (const [x, z, w, d, f, yaw] of blocks) {
    const r = Math.max(w, d) * 0.6;
    if (!ground.free(x, z, r * 0.8, 0.6)) continue;
    const room = ground.maxH(x, z, r);
    const floors = Math.min(f, Math.floor((room - 0.6) / 1.15));
    if (floors < 2) continue;
    ground.take(x, z, r + 0.6);
    flats(k, x, z, w, d, floors, yaw, pick(walls, rnd()));
  }
  // the New Year tree on the start's square, its garlands and star, the gifts and the crowd round it
  {
    const x = -10,
      z = 9;
    if (ground.free(x, z, 2.5)) {
      ground.take(x, z, 3.4);
      v.frame(x, 0, z, 0);
      v.cyl("#d9dde6", 2.6, 0.3, 0, 0.15, 0, { ink: 0.03 });
      v.box("#6b3f24", 0.5, 1.0, 0.5, 0, 0.8, 0);
      for (let i = 0; i < 5; i++) {
        const r = 2.4 - i * 0.42,
          y = 1.4 + i * 1.15;
        v.add("cone6", i % 2 ? "#2f6a4a" : "#2a5e44", r * 2, 1.8, r * 2, 0, y + 0.6, 0, { ink: 0.04, ry: i * 0.5 });
        v.add("cone6", SNOW, r * 1.3, 0.45, r * 1.3, 0, y + 1.1, 0, { ry: i * 0.5 });
        for (let j = 0; j < 9 - i; j++) {
          const a = (j / (9 - i)) * Math.PI * 2 + i;
          v.add("orb", pick(["#ff3d56", "#ffd23f", "#7ff3ff", "#ff5fa2", "#ffffff", "#33d67c"], rnd()), 0.26, 0.26, 0.26, Math.cos(a) * r * 0.8, y + 0.15, Math.sin(a) * r * 0.8, { glow: true });
        }
      }
      v.add("orb", "#ffd23f", 0.9, 0.9, 0.3, 0, 7.6, 0, { glow: true });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        v.box(pick(["#ff3d56", KZ, "#ffd23f", "#c45bff"], rnd()), 0.6, 0.5, 0.6, Math.cos(a) * 2.2, 0.55, Math.sin(a) * 2.2, { ink: 0.02, ry: a });
      }
      const st = halo("#ffd23f", 3.5, 0.9);
      st.position.set(x, 7.6, z);
      k.parent.add(st);
      pools.add(x, z, 5.5, "#ffd98a", 0.05, 0.8);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        life.npc(x + Math.cos(a) * 3.6, z + Math.sin(a) * 3.6, Math.atan2(-Math.cos(a), -Math.sin(a)));
      }
    }
  }
  // the rink: a white oval behind its boards, floodlit, skaters going round
  {
    const x = 13,
      z = 9;
    if (ground.free(x, z, 3.5)) {
      ground.take(x, z, 5);
      v.frame(x, 0, z, 0);
      v.cyl("#e2f2ff", 4.6, 0.08, 0, 0.05, 0, {}, "cyl");
      v.add("torus", "#3e6fb0", 9.3, 9.3, 3, 0, 0.3, 0, { rx: Math.PI / 2, ink: 0.02 });
      for (const [sx, sz] of [
        [-4.4, -2],
        [4.4, 2],
      ]) {
        v.cyl(DARK, 0.08, 5, sx, 2.5, sz, {}, "cyl8");
        v.box("#fff6dc", 0.6, 0.35, 0.3, sx, 5, sz, { glow: true });
      }
      pools.add(x, z, 6, "#dff1ff", 0.06, 0.8);
      S.rink = { x, z, r: 3.4 };
      words.add("RINK", 0.4, x, 0.7, z + 4.75, 0, { fg: "#ffffff", bg: "#3e6fb0", w: 1.6 });
    }
  }
  // the Christmas market by the tent: huts in a row, garlands between, the crowd
  for (const [hx, hz, yaw] of [
    [-34.5, 8.5, 0.6],
    [-32.5, 11.5, 0.5],
    [-36.5, -8.5, Math.PI - 0.3],
    [-33.5, -10.8, Math.PI - 0.5],
  ] as [number, number, number][]) {
    if (!ground.free(hx, hz, 1.3, 0.6)) continue;
    ground.take(hx, hz, 1.8);
    hut(k, hx, hz, yaw, pick(["#c0392b", "#2a7f62", KZ, "#d9822b"], rnd()));
  }
  // the boulevard: ice sculptures in its park strip, garlands across it, lamps in pairs
  const sculpt = (x: number, z: number, kind: number) => {
    v.frame(x, 0, z, rnd() * 0.4 - 0.2);
    v.box("#bfe9ff", 1.6, 0.4, 1.6, 0, 0.2, 0, { glow: true });
    if (kind === 0) {
      // an ice Q
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        v.box("#d6f3ff", 0.4, 0.4, 0.5, Math.cos(a) * 0.9, 1.5 + Math.sin(a) * 0.9, 0, { glow: true, rz: a });
      }
      v.box("#d6f3ff", 0.35, 0.9, 0.5, 0.75, 0.75, 0, { glow: true, rz: 0.8 });
    } else if (kind === 1) {
      // a snow leopard on a block
      v.box("#e8f7ff", 1.4, 0.8, 0.6, 0, 0.8, 0, { glow: true });
      v.box("#e8f7ff", 0.6, 0.6, 0.6, 0.8, 1.3, 0, { glow: true });
      v.box("#d6f3ff", 0.18, 0.9, 0.18, -0.8, 1.3, 0, { glow: true, rz: 0.6 });
    } else {
      // a little ice castle
      v.box("#d6f3ff", 1.2, 1.2, 1.2, 0, 1.0, 0, { glow: true });
      for (const s of [-1, 1]) v.box("#e8f7ff", 0.4, 1.8, 0.4, s * 0.7, 1.3, 0.5, { glow: true });
      v.add("cone6", "#e8f7ff", 0.6, 0.6, 0.6, 0, 1.9, 0, { glow: true });
    }
    pools.add(x, z, 2.4, "#9fe0ff", 0.05, 0.75);
  };
  let sc = 0;
  for (const [x, z] of [
    [-16, -10.5],
    [16, -10.5],
    [-9, -11],
    [9.5, -11.2],
    [22, -10],
    [-20.5, -10.6],
  ] as [number, number][]) {
    if (!ground.free(x, z, 0.9, 0.5)) continue;
    ground.take(x, z, 1.3);
    sculpt(x, z, sc++ % 3);
  }
  for (const gx of [-18, -11, 11, 18, 25]) {
    const za = -9.2,
      zb = -1.8;
    v.frame(gx, 0, za, 0);
    v.cyl(DARK, 0.07, 4, 0, 2, 0, {}, "cyl8");
    v.frame(gx, 0, zb, 0);
    v.cyl(DARK, 0.07, 4, 0, 2, 0, {}, "cyl8");
    v.frame(0, 0, 0, 0);
    lights(v, [gx, 3.9, za], [gx, 3.9, zb], 9, 0.7, ["#ffd23f", "#7ff3ff", "#ffffff", "#ff5fa2"]);
  }
  // pavilions on the plains' edge (west and north-west)
  for (const [yx, yz, s] of [
    [-38, 21, 1.2],
    [-41.5, 15.5, 1.0],
    [-34, 27.5, 0.9],
    [-38, -30, 1.1],
    [-32, -36, 0.9],
    [-41, -44, 1.0],
  ] as [number, number, number][]) {
    if (!ground.free(yx, yz, 1.8 * s, 0.6)) continue;
    ground.take(yx, yz, 2.2 * s);
    yurt(k, yx, yz, s, Math.atan2(-yx, -yz) + (rnd() - 0.5) * 0.6);
  }
  // snowmen, a few round the squares
  scatter(k, 9, -40, -58, 50, 32, 0.6, 2.1, (x, z) => snowman(k, x, z, Math.atan2(-x, 30 - z) + (rnd() - 0.5)));
  // flags along the start's road, sky blue
  for (const [fx, fz] of [
    [6, 28.5],
    [-6, 28.5],
    [26, 21],
  ] as [number, number][]) {
    if (!ground.free(fx, fz, 0.4, 0.4)) continue;
    v.frame(fx, 0, fz, 0);
    v.cyl("#e8e4ff", 0.07, 4.2, 0, 2.1, 0, { ink: 0.02 }, "cyl8");
    life.flag(fx, 3.7, fz, 0, KZ, 0.9);
  }
  // lamps round the plazas and along the banks
  scatter(k, 18, -40, -56, 50, 30, 0.4, 2.9, (x, z) => lamp(k, x, z, pick(WARM, rnd())));
  // crowds: by the tree, the tent's doors, the plaza, City Hall's gate, the bridges, the start
  const crowds: [number, number, number, number][] = [
    [-24.5, 1.5, -Math.PI / 2, 3],
    [-23.5, -3.5, -Math.PI / 2, 2],
    [7.5, 5.8, 3.4, 3],
    [-7.5, 6.2, 2.8, 2],
    [40.5, 4.5, -1.6, 3],
    [-31.5, -12.5, 1.6, 2],
    [34.8, -14.6, -1.7, 2],
    [3.5, 28.6, Math.PI, 3],
    [-14.5, 29.5, Math.PI, 2],
    [-6.5, -32.5, 0.2, 2],
    [17, -37.6, 0.3, 3],
    [-16, -38.5, -0.2, 2],
    [27.5, 0.5, -1.6, 2],
  ];
  for (const [cx, cz, yaw, n] of crowds)
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2,
        dd = i === 0 ? 0 : 0.75 + rnd() * 0.5;
      const px = cx + Math.cos(a) * dd,
        pz = cz + Math.sin(a) * dd;
      if (!ground.land(px, pz, 0.5) || ground.onPath(px, pz, 0.2)) continue;
      life.npc(px, pz, yaw + (rnd() - 0.5) * 0.6);
      k.paint.shadow(px, pz, 0.5, 0.5, 0.25);
    }
  // the woods: snowy firs and birches wherever there is room (the plains' edges, the banks)
  scatter(k, 70, -44, -60, 52, 34, 1.0, 3.0, (x, z) => (rnd() < 0.7 ? tree(k, x, z, "pine") : birch(k, x, z, 0.8 + rnd() * 0.4)), 30);
  scatter(k, 40, -44, -60, 52, 34, 0.8, 1.2, (x, z) => (rnd() < 0.5 ? tree(k, x, z, "pine", 0.6) : birch(k, x, z, 0.55)), 30);
}

/** The avenue along the south edge: asphalt, lane marks, snow banks, street lights (its cars move: update). */
function street(k: Kit) {
  const { v, pools, ground } = k;
  const z = STREET_Z;
  v.frame(0, 0, 0, 0);
  v.box("#3a4060", 88, 0.06, 3.8, 4, 0.04, z);
  for (let x = -38; x < 46; x += 3) v.box("#e8e2c8", 1.4, 0.07, 0.14, x, 0.06, z);
  for (const sd of [-1, 1]) for (let x = -39; x < 47; x += 1.9) v.add("orb", SNOW, 1.9, 0.28, 0.6, x, 0.06, z + sd * 2.15);
  for (let x = -38; x < 50; x += 11) {
    v.frame(x, 0, z - 2.6, 0);
    v.cyl(DARK, 0.08, 4.2, 0, 2.1, 0, {}, "cyl8");
    v.box(DARK, 0.12, 0.12, 1.6, 0, 4.2, 0.7);
    v.box("#fff2d0", 0.5, 0.18, 0.5, 0, 4.08, 1.4, { glow: true });
    pools.add(x, z - 1.2, 3.4, "#ffd9a0", 0.07, 0.8);
  }
  for (let x = -44; x < 52; x += 2.5) ground.take(x, z, 2.2);
}
const STREET_Z = 31.4;

/** Big lit letters behind the start, a sledding hill with its kids. */
function sights(k: Kit) {
  const { v, words, pools, ground, life } = k;
  {
    const x = -8.5,
      z = 20.8;
    if (ground.free(x, z, 1.5, 0.5)) {
      ground.take(x, z, 3.6);
      v.frame(x, 0, z, 0);
      v.box("#2a3566", 7.6, 0.5, 1.2, 0, 0.25, 0, { ink: 0.04 });
      v.box(SNOW, 7.7, 0.12, 1.3, 0, 0.53, 0);
      words.add("ZSTREET", 1.35, x, 1.3, z + 0.05, 0, { fg: "#ffd98a", neon: true, w: 7.2 });
      pools.add(x, z + 0.6, 5, "#ffcf7a", 0.06, 0.9);
    }
  }
  {
    const x = -16.5,
      z = 14.5;
    if (ground.free(x, z, 2.6, 0.5)) {
      ground.take(x, z, 3.8);
      v.frame(x, 0, z, 0.4);
      v.add("ball", SNOW, 6.6, 2.6, 5.2, 0, -0.1, 0, { ink: 0.03 });
      v.box("#cfe6ff", 1.0, 0.06, 4.4, 1.2, 0.55, 1.5, { rx: 0.42, glow: true });
      for (const [sx, sz, c] of [
        [1.3, 2.8, "#ff3d56"],
        [-1.4, 2.2, KZ],
      ] as [number, number, string][]) v.box(c, 0.6, 0.18, 1.1, sx, 0.3, sz, { ink: 0.02 });
      life.npc(x + 0.6, z - 0.3, Math.PI);
      life.npc(x + 2.2, z + 2.4, 0.3);
    }
  }
}

// ---- the plains and the sky ----------------------------------------------------------------------------

/** The snowy plains out to the horizon (under the islands' plinth), its low hills, far pavilion camps. */
function steppe(k: Kit) {
  const { parent, v, rnd } = k;
  const tex = canvasTex(256, 256, (g) => {
    g.fillStyle = "#dfe8f6";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "190,206,232"},${0.25 + Math.random() * 0.35})`;
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 26, 2 + Math.random() * 7, Math.random() * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(150,170,200,0.25)";
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2);
  }, true);
  tex.repeat.set(70, 70);
  const plane = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), color: "#e8eefa" }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = STEPPE_Y;
  plane.raycast = () => {};
  parent.add(plane);
  // low hills round the horizon, far pavilion camps with a light
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 160 + rnd() * 220;
    const s = 20 + rnd() * 40;
    v.frame(0, 0, 0, 0);
    v.add("ball", rnd() < 0.5 ? "#dbe4f3" : "#cfd9ec", s * 2.2, s * 0.5, s * 1.4, Math.cos(a) * d, STEPPE_Y - s * 0.12, Math.sin(a) * d - 10);
  }
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 70 + rnd() * 70;
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d - 10;
    if (Math.abs(z - riverZ(x)) < 12) continue;
    v.frame(x, STEPPE_Y, z, 0);
    v.cyl("#efe6d4", 1.4, 1.1, 0, 0.55, 0);
    v.add("cone", "#e4dccb", 3.2, 1.0, 3.2, 0, 1.6, 0);
    v.add("orb", "#ffd98a", 0.4, 0.4, 0.4, 1.2, 0.5, 0.6, { glow: true });
  }
  // the moon: a crisp disc in its glow (the shared halo is its light, map.sun)
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: "#f4f8ff", fog: false }));
  moon.position.copy(MOON);
  moon.lookAt(0, 0, 0);
  parent.add(moon);
  const mh = halo("#cfe0ff", 60, 0.5);
  mh.position.copy(moon.position);
  (mh.material as THREE.SpriteMaterial).fog = false;
  parent.add(mh);
}

/** Where the moon rides (the sky dome's glow is turned toward it: build()). */
const MOON = new THREE.Vector3(-150, 80, -300);

const AURORA_V = /* glsl */ `
varying vec2 vUv;
varying float vH;
void main() {
  vUv = uv;
  vH = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const AURORA_F = /* glsl */ `
uniform float uTime;
uniform float uK;
varying vec2 vUv;
varying float vH;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float x = vUv.x * 60.0;
  float rays = noise(x * 1.7 + uTime * 0.6) * 0.6 + noise(x * 5.3 - uTime * 1.3) * 0.4;
  float drift = 0.5 + 0.5 * sin(vUv.x * 9.0 + uTime * 0.25);
  float foot = smoothstep(0.0, 0.08, vH);
  float top = 1.0 - smoothstep(0.25, 1.0, vH);
  vec3 green = vec3(0.30, 1.0, 0.62);
  vec3 teal = vec3(0.25, 0.85, 1.0);
  vec3 violet = vec3(0.75, 0.35, 1.0);
  vec3 c = mix(green, teal, smoothstep(0.1, 0.5, vH));
  c = mix(c, violet, smoothstep(0.55, 1.0, vH));
  float a = foot * top * (0.25 + 0.75 * rays * rays) * (0.45 + 0.55 * drift) * uK * 0.8;
  gl_FragColor = vec4(c * a, a);
}`;

/** The northern lights: curtains across the north sky, rippling (one additive shader, two draws). */
function aurora(k: Kit) {
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 1.0 } }, vertexShader: AURORA_V, fragmentShader: AURORA_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const [cz, cy, w, h, seed] of [
    [-300, 30, 560, 110, 0],
    [-220, 50, 380, 80, 2],
  ] as [number, number, number, number, number][]) {
    const N = 90;
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const x = (f - 0.5) * w;
      const z = cz + Math.sin(f * 7 + seed) * 30 + Math.sin(f * 17 + seed) * 8;
      const y0 = cy + Math.sin(f * 5 + seed) * 10;
      pos.push(x, y0, z, x, y0 + h * (0.7 + 0.3 * Math.sin(f * 11 + seed)), z - 10);
      uv.push(f + seed, 0, f + seed, 1);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = -1;
    m.raycast = () => {};
    k.parent.add(m);
  }
  S.aurora = mat;
}

/** Falling snow over the whole board (one draw): flakes drifting down, blown hard in a blizzard. */
function snowfall(k: Kit) {
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -70 + Math.random() * 150;
    pos[i * 3 + 1] = Math.random() * 36;
    pos[i * 3 + 2] = -75 + Math.random() * 120;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 0.34, map: glowTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
  pts.frustumCulled = false;
  pts.raycast = () => {};
  k.parent.add(pts);
  S.snow = { g, pos, seed };
}

// ---- what moves ------------------------------------------------------------------------------------------

interface State {
  t: number;
  aurora: THREE.ShaderMaterial | null;
  eggHalo: THREE.Sprite | null;
  snow: { g: THREE.BufferGeometry; pos: Float32Array; seed: Float32Array } | null;
  cracks: THREE.Mesh[];
  hole: THREE.Object3D | null;
  holeK: number;
  holeWant: number;
  cabin: THREE.Object3D | null;
  cabinY: number;
  cabinGo: { t: number; dur: number; a: number; b: number } | null;
  glider: THREE.Object3D | null;
  glideSeat: number;
  glideT: number;
  view: ArtView | null;
  buran: number;
  buranHold: number;
  fog: THREE.Fog | null;
  fog0: [number, number, THREE.Color];
  fw: { g: THREE.BufferGeometry; pos: Float32Array; col: Float32Array; vel: Float32Array; life: Float32Array; next: number; at: number } | null;
  /** The avenue's cars: bodies, cabins, lights. */
  cars: [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh] | null;
  /** Skaters out on the river past the bridges: bodies, heads. */
  river: [THREE.InstancedMesh, THREE.InstancedMesh] | null;
  rink: { x: number; z: number; r: number } | null;
}
const fresh = (): State => ({ t: 0, aurora: null, eggHalo: null, snow: null, cracks: [], hole: null, holeK: 0, holeWant: 0, cabin: null, cabinY: 1.1, cabinGo: null, glider: null, glideSeat: -1, glideT: 0, view: null, buran: 0, buranHold: 0, fog: null, fog0: [0, 0, new THREE.Color()], fw: null, river: null, cars: null, rink: null });
let S: State = fresh();

/** New Year fireworks over the river: a rocket now and then, its burst falling (one additive draw). */
function fireworks(k: Kit) {
  const n = FW;
  const pos = new Float32Array(n * 3).fill(-999);
  const col = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pts.frustumCulled = false;
  pts.raycast = () => {};
  k.parent.add(pts);
  S.fw = { g, pos, col, vel: new Float32Array(n * 3), life: new Float32Array(n), next: 2, at: 0 };
}
const FW = 320;
const FW_C = ["#ffd23f", "#ff5fa2", "#7ff3ff", "#5affc0", "#c45bff", "#ff6b35", "#ffffff"].map((c) => new THREE.Color(c));

/** The lift's glass cabin (it rides the shaft up the trunk), the glider (a kite-wing in sky blue), the skaters. */
function movers(k: Kit) {
  const cab = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.5, 1.1), new THREE.MeshBasicMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.45, depthWrite: false }));
  glass.position.y = 1.25;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 1.1), new THREE.MeshBasicMaterial({ color: "#ffe9b0" }));
  roof.position.y = 2.55;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 1.1), new THREE.MeshBasicMaterial({ color: "#ffe9b0" }));
  cab.add(glass, roof, floor);
  cab.position.set(BAYTEREK.x, S.cabinY, BAYTEREK.z + 1.6);
  k.parent.add(cab);
  S.cabin = cab;
  // the glider: a curved wing of four panels, lines down to the rider
  const gl = new THREE.Group();
  const wingMat = new THREE.MeshToonMaterial({ color: KZ, gradientMap: toonSteps(), side: THREE.DoubleSide });
  const goldMat = new THREE.MeshToonMaterial({ color: GOLD, gradientMap: toonSteps(), side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const f = (i + 0.5) / 6 - 0.5;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 1.3), i === 2 || i === 3 ? goldMat : wingMat);
    p.position.set(f * 4.2, 2.6 - f * f * 2.6, 0);
    p.rotation.z = -f * 1.3;
    gl.add(p);
  }
  const lineMat = new THREE.MeshBasicMaterial({ color: "#2b2f4a" });
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.2, 0.03), lineMat);
    l.position.set(s * 0.8, 1.5, 0);
    l.rotation.z = s * 0.45;
    gl.add(l);
  }
  gl.visible = false;
  k.parent.add(gl);
  S.glider = gl;
  // skaters on the river past the bridges, and round the rink (bodies, heads: two draws)
  {
    const n = RIVER_SK + RINK_SK;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.0, 0.34), new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), n);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshToonMaterial({ color: "#f2c9a0", gradientMap: toonSteps() }), n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) body.setColorAt(i, c.set(["#ff5f5f", "#3ec6ff", "#ffd23f", "#8ee35b", "#c45bff", "#ff8a2e"][i % 6]));
    for (const m of [body, head]) {
      m.frustumCulled = false;
      m.raycast = () => {};
      k.parent.add(m);
    }
    S.river = [body, head];
  }
  {
    const n = CARS;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.8, 1.6), new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), n);
    const cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.7, 1.45), new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() }), n);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.22, 1.3), new THREE.MeshBasicMaterial({ color: "#ffffff" }), n * 2);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      body.setColorAt(i, c.set(["#e8e8ee", "#2b2f4a", "#c0392b", "#d9b23a", "#3e6fb0", "#f4f4f4", "#5a6a8a", "#ffd23f"][i % 8]));
      cab.setColorAt(i, c.set(i % 8 === 7 ? "#ffd23f" : "#9fd8ff"));
      lamps.setColorAt(i * 2, c.set("#fff2c0"));
      lamps.setColorAt(i * 2 + 1, c.set("#ff3030"));
    }
    for (const m of [body, cab, lamps]) {
      m.frustumCulled = false;
      m.raycast = () => {};
      k.parent.add(m);
    }
    S.cars = [body, cab, lamps];
  }
}
const CARS = 9;
const RIVER_SK = 12;
const RINK_SK = 7;

const mtx = new THREE.Matrix4();
const qq = new THREE.Quaternion();
const sc = new THREE.Vector3(1, 1, 1);
const YAX = new THREE.Vector3(0, 1, 0);

function update(dt: number, t: number) {
  S.t = t;
  if (S.aurora) S.aurora.uniforms.uTime.value = t;
  if (S.eggHalo) S.eggHalo.material.opacity = 0.45 + 0.15 * Math.sin(t * 1.7);
  // the cabin glides to where it is wanted
  if (S.cabin) {
    const go = S.cabinGo;
    if (go) {
      go.t += dt;
      const f = Math.max(0, Math.min(1, go.t / go.dur));
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      S.cabinY = go.a + (go.b - go.a) * e;
      if (f >= 1) S.cabinGo = null;
    }
    S.cabin.position.y = S.cabinY;
  }
  // the glider over its rider
  if (S.glider) {
    const v = S.view;
    if (S.glideSeat >= 0 && v && S.glideT < GLIDE) {
      S.glideT += dt;
      const p = v.av[S.glideSeat].pos;
      S.glider.visible = true;
      S.glider.position.set(p.x, p.y + 0.4, p.z);
      S.glider.rotation.z = Math.sin(S.glideT * 2.2) * 0.12;
      S.glider.scale.setScalar(Math.min(1, S.glideT * 3));
    } else ((S.glider.visible = false), (S.glideSeat = -1));
  }
  // the hole opens and heals
  if (S.hole) {
    S.holeK += (S.holeWant - S.holeK) * Math.min(1, dt * 5);
    S.hole.visible = S.holeK > 0.02;
    S.hole.scale.setScalar(Math.max(0.01, S.holeK));
  }
  // the snow: down, drifting; sideways in a blizzard
  const sn = S.snow;
  if (sn) {
    const p = sn.pos;
    const b = S.buran;
    const wind = 1.2 + b * 26;
    for (let i = 0; i < sn.seed.length; i++) {
      const s = sn.seed[i];
      let x = p[i * 3] + dt * (wind + Math.sin(t * 1.3 + s * 9) * 0.5);
      let y = p[i * 3 + 1] - dt * (1.6 + s * 1.4) * (1 - b * 0.6);
      let z = p[i * 3 + 2] + dt * (Math.cos(t * 1.1 + s * 7) * 0.5 + b * 6);
      if (y < -1) y += 37;
      if (x > 80) x -= 150;
      if (z > 45) z -= 120;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    sn.g.attributes.position.needsUpdate = true;
  }
  // the blizzard's whiteout: the fog closes in, then lifts
  if (S.fog) {
    const b = S.buran;
    S.fog.near = S.fog0[0] * (1 - b) + 18 * b;
    S.fog.far = S.fog0[1] * (1 - b) + 150 * b;
    S.fog.color.copy(S.fog0[2]).lerp(WHITE, b * 0.62);
    if (S.buranHold > 0) S.buranHold -= dt;
    else S.buran = Math.max(0, S.buran - dt * 0.5);
  }
  // skaters gliding up and down the river beyond the bridges
  if (S.river) {
    const [body, head] = S.river;
    for (let i = 0; i < RIVER_SK; i++) {
      const west = i % 2 === 0;
      const x0 = west ? -90 : 46,
        span = west ? 52 : 50;
      const u = (t * (0.035 + (i % 5) * 0.006) + i * 0.37) % 2;
      const f = u < 1 ? u : 2 - u;
      const x = x0 + f * span;
      const zz = riverZ(x) + ((i % 4) - 1.5) * 1.6 + Math.sin(t * 1.5 + i) * 0.4;
      const dir = u < 1 ? 1 : -1;
      qq.setFromAxisAngle(YAX, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const lean = Math.sin(t * 3 + i) * 0.12;
      mtx.compose(tv.set(x, ICE_Y + 0.62, zz + lean), qq, sc);
      body.setMatrixAt(i, mtx);
      mtx.compose(tv.set(x, ICE_Y + 1.32, zz + lean * 1.4), qq, sc);
      head.setMatrixAt(i, mtx);
    }
    if (S.rink) {
      const { x, z, r } = S.rink;
      for (let i = 0; i < RINK_SK; i++) {
        const a = t * (0.5 + (i % 3) * 0.12) + i * 0.9;
        const rr = r * (0.55 + (i % 4) * 0.12);
        qq.setFromAxisAngle(YAX, a + Math.PI);
        const lean = Math.sin(t * 3 + i) * 0.08;
        mtx.compose(tv.set(x + Math.cos(a) * rr, 0.62, z + Math.sin(a) * rr + lean), qq, sc);
        body.setMatrixAt(RIVER_SK + i, mtx);
        mtx.compose(tv.set(x + Math.cos(a) * rr, 1.32, z + Math.sin(a) * rr + lean * 1.4), qq, sc);
        head.setMatrixAt(RIVER_SK + i, mtx);
      }
    } else
      for (let i = 0; i < RINK_SK; i++) {
        mtx.makeScale(0, 0, 0);
        body.setMatrixAt(RIVER_SK + i, mtx);
        head.setMatrixAt(RIVER_SK + i, mtx);
      }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  }
  // the fireworks: a burst every few seconds over the far bank, sparks falling and fading
  const fw = S.fw;
  if (fw) {
    fw.next -= dt;
    if (fw.next <= 0) {
      fw.next = 2.5 + Math.random() * 4;
      const cx = -40 + Math.random() * 90,
        cy = 26 + Math.random() * 14,
        cz = -70 - Math.random() * 40;
      const c = FW_C[Math.floor(Math.random() * FW_C.length)];
      for (let q = 0; q < 64; q++) {
        const i = fw.at;
        fw.at = (fw.at + 1) % FW;
        const a = Math.random() * Math.PI * 2,
          b = Math.acos(2 * Math.random() - 1);
        const sp = 7 + Math.random() * 3;
        fw.pos[i * 3] = cx;
        fw.pos[i * 3 + 1] = cy;
        fw.pos[i * 3 + 2] = cz;
        fw.vel[i * 3] = Math.sin(b) * Math.cos(a) * sp;
        fw.vel[i * 3 + 1] = Math.cos(b) * sp;
        fw.vel[i * 3 + 2] = Math.sin(b) * Math.sin(a) * sp;
        fw.life[i] = 1.6 + Math.random() * 0.6;
        fw.col[i * 3] = c.r;
        fw.col[i * 3 + 1] = c.g;
        fw.col[i * 3 + 2] = c.b;
      }
    }
    for (let i = 0; i < FW; i++) {
      if (fw.life[i] <= 0) continue;
      fw.life[i] -= dt;
      const dr = Math.max(0, 1 - dt * 1.6);
      fw.vel[i * 3] *= dr;
      fw.vel[i * 3 + 1] = fw.vel[i * 3 + 1] * dr - dt * 5;
      fw.vel[i * 3 + 2] *= dr;
      fw.pos[i * 3] += fw.vel[i * 3] * dt;
      fw.pos[i * 3 + 1] += fw.vel[i * 3 + 1] * dt;
      fw.pos[i * 3 + 2] += fw.vel[i * 3 + 2] * dt;
      if (fw.life[i] <= 0) fw.pos[i * 3 + 1] = -999;
      else if (fw.life[i] < 0.6) {
        // (fading: dimmed toward black, additive)
        const f = 1 - dt / Math.max(0.05, fw.life[i]);
        fw.col[i * 3] *= f;
        fw.col[i * 3 + 1] *= f;
        fw.col[i * 3 + 2] *= f;
      }
    }
    fw.g.attributes.position.needsUpdate = true;
    fw.g.attributes.color.needsUpdate = true;
  }
  // the avenue's traffic: east along the near lane, west along the far one
  if (S.cars) {
    const [body, cab, lamps] = S.cars;
    for (let i = 0; i < CARS; i++) {
      const east = i % 2 === 0;
      const sp = 5.5 + (i % 3) * 1.2;
      const span = 104;
      const u = (((t * sp + i * 23) % span) + span) % span;
      const x = east ? -48 + u : 56 - u;
      // (off the avenue's ends: out of sight under the plinth)
      const off = x < -39 || x > 47;
      const zz = STREET_Z + (east ? 0.9 : -0.9);
      const dir = east ? 1 : -1;
      qq.identity();
      const y0 = off ? -20 : 0;
      mtx.compose(tv.set(x, y0 + 0.55, zz), qq, sc);
      body.setMatrixAt(i, mtx);
      mtx.compose(tv.set(x - dir * 0.2, y0 + 1.25, zz), qq, sc);
      cab.setMatrixAt(i, mtx);
      mtx.compose(tv.set(x + dir * 1.72, y0 + 0.6, zz), qq, sc);
      lamps.setMatrixAt(i * 2, mtx);
      mtx.compose(tv.set(x - dir * 1.72, y0 + 0.6, zz), qq, sc);
      lamps.setMatrixAt(i * 2 + 1, mtx);
    }
    body.instanceMatrix.needsUpdate = true;
    cab.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
  }
}
const WHITE = new THREE.Color("#eef4ff");
/** How long the glide down from the crown lasts (game.ts flies the rider as long). */
export const GLIDE = 3.4;

/** The rules' events (game.ts calls this as it shows each one). */
function on(e: BEv, view: ArtView) {
  S.view = view;
  switch (e.t) {
    case "liftUp":
      // (it waits while the rider steps in)
      S.cabinGo = { t: -0.75, dur: 2.7, a: S.cabinY, b: BAYTEREK.egg - 3.6 };
      return;
    case "lift":
      S.glideSeat = e.seat;
      S.glideT = 0;
      S.cabinGo = { t: -0.6, dur: 2.4, a: S.cabinY, b: 1.1 };
      return;
    case "land":
    case "start":
    case "turn":
    case "diceUp":
      S.glideSeat = -1;
      return;
    case "ice":
      if (e.out === "break") {
        S.holeWant = 1;
        for (const m of S.cracks) m.visible = false;
      } else S.cracks.forEach((m, i) => (m.visible = i < e.cracks));
      return;
    case "freeze":
      S.holeWant = 0;
      for (const m of S.cracks) m.visible = false;
      return;
    case "buran":
      S.buran = 1;
      S.buranHold = 2.6;
      return;
  }
}

// ---- the module --------------------------------------------------------------------------------------------

function landmark(d: LandmarkDef, k: Kit): boolean {
  switch (d.kind) {
    case "bayterek":
      bayterek(k, d);
      return true;
    case "khanshatyr":
      khanShatyr(k, d);
      return true;
    case "akorda":
      akOrda(k, d);
      return true;
    case "peace":
      peace(k, d);
      return true;
    case "hazret":
      hazret(k, d);
      return true;
    case "nuralem":
      nurAlem(k, d);
      return true;
    case "golden":
      golden(k, d);
      return true;
    case "eli":
      eli(k, d);
      return true;
    case "esil":
      esil(k);
      return true;
    case "bridges":
      bridges(k);
      return true;
  }
  return false;
}

function build(k: Kit) {
  iceRun(k);
  street(k);
  sights(k);
  city(k);
  steppe(k);
  aurora(k);
  snowfall(k);
  fireworks(k);
  movers(k);
  const scene = k.parent as THREE.Scene;
  // (a clear night for the aurora: the shared high clouds, 34 puffs of 4, are not drawn here)
  for (const o of scene.children) {
    const m = o as THREE.InstancedMesh;
    if (m.isInstancedMesh && m.count === 136 && m.geometry instanceof THREE.IcosahedronGeometry) m.visible = false;
    // (and the low sunset sun's two glows behind the far skyline: this board's moon rides high instead)
    if ((o as THREE.Sprite).isSprite && o.position.z < -320 && o.position.y < 40) o.visible = false;
    // (the dome's sun glow: a cool moonlit one round the moon)
    const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (u?.uSun && u.uSunDir) {
      (u.uSun.value as THREE.Color).set("#3e5596");
      (u.uSunDir.value as THREE.Vector3).copy(MOON).normalize();
    }
  }
  // (a night's finish: the warm windows, lamps and the crown bloom a little more, post.ts)
  scene.userData.post = { ...(scene.userData.post ?? {}), bloom: 1.3, hot: 0.8 };
  if (scene.fog instanceof THREE.Fog) {
    S.fog = scene.fog;
    S.fog0 = [scene.fog.near, scene.fog.far, scene.fog.color.clone()];
  }
}

function begin() {
  S = fresh();
}

const ASTANA_ART = {
  key: "astana",
  landmark(d: LandmarkDef, k: Kit) {
    // (the NU7 TOWER comes first in the map's landmarks: a new board's state starts there)
    if (d.kind === "bayterek") begin();
    return landmark(d, k);
  },
  build,
  update,
  on,
} satisfies MapArt & { on(e: BEv, view: ArtView): void };
export default ASTANA_ART;
