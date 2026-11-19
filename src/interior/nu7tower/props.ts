import * as THREE from "three";
import { C, E, G, shades, VoxelModel } from "../../scene/voxel/model";
import type { SkyKit } from "../zktowers/kit";
import { GOLD, VIOLET } from "./shared";

/**
 * The NU7 TOWER's own furniture and fittings: voxel models at 12 a metre (they face +z, stand on
 * y = 0, centred), and a few pieces built from the kit's merged geometry (columns with violet
 * neon on their edges, the tower's cut corners lit like the facade, gears, coins).
 */

const m = (w: number, h: number, d: number) => new VoxelModel(w, h, d);
const black = C("#16141c");
const steel = C("#a8adb8");
const tyre = C("#121014");

/** A racing kart, nose to +z: tube chassis, side pods and nose in the livery, number plate, seat, wheel, engine. */
export function kartModel(body: string, trim: string) {
  const v = m(18, 11, 26);
  const b = shades([body, body, body], 1, 3);
  const t = C(trim);
  // the chassis tray and its tubes
  v.box(4, 1, 3, 14, 2, 23, steel);
  v.box(3, 2, 4, 4, 3, 22, C("#7c818c"));
  v.box(14, 2, 4, 15, 3, 22, C("#7c818c"));
  // wheels: the rears fatter, rims in the trim
  for (const x of [0, 14]) {
    v.box(x, 0, 18, x + 4, 5, 23, tyre);
    v.box(x + (x ? 0 : 3), 1, 19, x + (x ? 1 : 4), 4, 22, t);
  }
  for (const x of [0, 13]) {
    v.box(x, 0, 2, x + 5, 6, 8, tyre);
    v.box(x + (x ? 0 : 4), 1, 3, x + (x ? 1 : 5), 5, 7, t);
  }
  // side pods, the nose cone and its wing
  v.box(1, 2, 9, 5, 5, 17, b);
  v.box(13, 2, 9, 17, 5, 17, b);
  v.box(1, 5, 10, 5, 6, 16, t);
  v.box(13, 5, 10, 17, 6, 16, t);
  v.box(5, 2, 20, 13, 5, 26, b);
  v.box(3, 2, 24, 15, 3, 26, t);
  // number plate on the nose
  v.box(6, 5, 22, 12, 8, 23, C("#f2f0ea"));
  v.box(8, 6, 23, 10, 7, 23, black);
  // seat, steering column and wheel
  v.box(6, 2, 7, 12, 4, 12, black);
  v.box(6, 4, 6, 12, 9, 8, black);
  v.box(6, 9, 6, 12, 10, 7, t);
  v.box(8, 3, 14, 10, 7, 17, steel);
  v.box(6, 7, 15, 12, 8, 16, black);
  v.box(8, 8, 15, 10, 9, 16, E(VIOLET, 1.2));
  // the engine and its exhaust, right rear; the bumper
  v.box(13, 2, 3, 17, 7, 8, C("#c8ccd4"));
  v.box(14, 7, 4, 16, 8, 7, C("#2a2830"));
  v.box(15, 5, 0, 17, 6, 3, C("#5a5c64"));
  v.box(2, 2, 0, 16, 3, 1, t);
  return v;
}

/** A kart stand: a steel cradle on four castors, the kart rides on top (dy ≈ 0.42). */
export function kartStand() {
  const v = m(18, 5, 22);
  v.box(2, 3, 2, 16, 5, 20, C("#3a3d46"));
  v.box(3, 4, 3, 15, 5, 19, C("#d8303a"));
  for (const x of [2, 15]) for (const z of [2, 19]) v.box(x, 1, z, x + 1, 3, z + 1, steel);
  for (const x of [1, 15]) for (const z of [1, 19]) v.box(x, 0, z, x + 2, 1, z + 2, C("#ff7a1a"));
  return v;
}

/** A roll-cab tool chest: drawers in the livery, a worktop, tools on it. */
export function toolChest(color: string, seed = 1) {
  const v = m(16, 14, 8);
  v.box(0, 0, 0, 16, 1, 8, black);
  v.box(0, 1, 0, 16, 12, 7, shades([color, color], 1, seed));
  for (let y = 2; y < 12; y += 2) {
    v.box(1, y, 7, 15, y + 1, 8, C(color));
    v.box(5, y, 7, 11, y + 1, 8, steel);
  }
  v.box(0, 12, 0, 16, 13, 8, C("#2a2830"));
  // a socket set, a wrench, a torque gun
  v.box(2, 13, 2, 6, 14, 5, C("#1c1a22"));
  v.box(8, 13, 3, 13, 14, 4, steel);
  v.box(13, 13, 2, 15, 15, 5, C(GOLD));
  for (const x of [1, 14]) v.box(x, 0, 0, x + 1, 1, 1, C("#ff7a1a"));
  return v;
}

/** A helmet on its stand: shell in the livery, a visor, a stripe. */
export function helmet(color: string, stripe: string) {
  const v = m(6, 7, 6);
  for (let y = 0; y < 6; y++)
    for (let z = 0; z < 6; z++)
      for (let x = 0; x < 6; x++) {
        const dx = x - 2.5,
          dy = y - 2.2,
          dz = z - 2.5;
        if (dx * dx + dy * dy * 0.8 + dz * dz < 9.5) v.set(x, y, z, C(color));
      }
  v.box(1, 2, 5, 5, 4, 6, G("#20263a"));
  v.box(2, 5, 0, 4, 6, 6, C(stripe));
  return v;
}

/** The winner's cup: a gold bowl on a black plinth with handles. */
export function trophy() {
  const v = m(10, 16, 10);
  v.box(2, 0, 2, 8, 3, 8, black);
  v.box(2, 3, 2, 8, 4, 8, C(GOLD));
  v.box(4, 4, 4, 6, 8, 6, C("#d9a63a"));
  for (let y = 8; y < 15; y++) {
    const r = 1.5 + (y - 8) * 0.45;
    for (let z = 0; z < 10; z++)
      for (let x = 0; x < 10; x++) {
        const d = Math.hypot(x + 0.5 - 5, z + 0.5 - 5);
        if (d < r && (d > r - 1.2 || y === 8)) v.set(x, y, z, C(y % 3 ? GOLD : "#e9c55a"));
      }
  }
  for (const x of [0, 9]) v.box(x, 10, 4, x + 1, 14, 6, C(GOLD));
  v.box(4, 6, 6, 6, 7, 7, E(VIOLET, 1.4));
  return v;
}

/** A crate of drinks for the paddock: a cooler with a glass door. */
export function cooler() {
  const v = m(10, 22, 8);
  v.box(0, 0, 0, 10, 22, 8, C("#1c1a22"));
  v.box(1, 2, 7, 9, 20, 8, G("#9fd8ff"));
  for (const y of [5, 10, 15]) v.box(1, y, 1, 9, y + 1, 7, steel);
  for (let x = 1; x < 9; x += 2) for (const y of [2, 6, 11, 16]) v.box(x, y, 3, x + 1, y + 3, 5, C(["#d8303a", "#38ff9c", GOLD, VIOLET][(x + y) % 4]));
  v.box(0, 20, 7, 10, 22, 8, E(VIOLET, 1.2));
  return v;
}

/** A brass stanchion post (the rope is drawn by the caller). */
export function post() {
  const v = m(3, 12, 3);
  v.box(0, 0, 0, 3, 1, 3, C(GOLD));
  v.box(1, 1, 1, 2, 11, 2, C("#d9a63a"));
  v.box(0, 11, 0, 3, 12, 3, C(GOLD));
  return v;
}

// ---- kit geometry ---------------------------------------------------------------------------------------

/** A square column: dark polished stone, gold collars, violet neon down its four edges. */
export function column(k: SkyKit, f: number, x: number, z: number, h: number, w = 1.0) {
  k.box(f, w, h, w, x, 0, z, "#1b1626", "polish");
  k.box(f, w + 0.08, 0.3, w + 0.08, x, 0, z, GOLD, "metal");
  k.box(f, w + 0.08, 0.16, w + 0.08, x, h - 0.5, z, GOLD, "metal");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(f, 0.05, h - 1.0, 0.05, x + (sx * w) / 2, 0.38, z + (sz * w) / 2, VIOLET, "glow");
  k.solid(f, x - w / 2 - 0.05, z - w / 2 - 0.05, x + w / 2 + 0.05, z + w / 2 + 0.05);
}

/**
 * A cut corner (the tower's plan is a square with its corners cut, the violet neon running up the
 * cuts outside): a wall from A to B with two neon strips and a gold band over them.
 */
export function cutCorner(k: SkyKit, f: number, ax: number, az: number, bx: number, bz: number, h: number, wall: string, cx = 0, cz = -15) {
  k.wall(f, ax, az, bx, bz, h, wall, "polish", 0.3);
  const len = Math.hypot(bx - ax, bz - az);
  const ry = -Math.atan2(bz - az, bx - ax);
  // the inside face: towards the room's middle
  const nx = -(bz - az) / len,
    nz = (bx - ax) / len;
  const mx = (ax + bx) / 2,
    mz = (az + bz) / 2;
  const sgn = nx * (cx - mx) + nz * (cz - mz) > 0 ? 1 : -1;
  for (const t of [0.3, 0.7]) {
    const px = ax + (bx - ax) * t + nx * 0.17 * sgn,
      pz = az + (bz - az) * t + nz * 0.17 * sgn;
    k.box(f, 0.08, h - 0.6, 0.06, px, 0.3, pz, VIOLET, "glow", ry);
  }
  k.box(f, len, 0.06, 0.06, mx + nx * 0.17 * sgn, h - 0.4, mz + nz * 0.17 * sgn, GOLD, "glow", ry);
}

/** A gear's outline (teeth round a rim, a hub hole), for ExtrudeGeometry. */
export function gearShape(r: number, teeth: number, depth = 0.12) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const q = i % 4;
    const rr = q === 1 || q === 2 ? r : r - depth;
    const x = Math.cos(a) * rr,
      y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.18, 0, Math.PI * 2, true);
  s.holes.push(hole);
  // spokes: four windows between hub and rim
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Path();
    const a0 = (k / 4) * Math.PI * 2 + 0.25,
      a1 = ((k + 1) / 4) * Math.PI * 2 - 0.25;
    const r0 = r * 0.32,
      r1 = r * 0.72;
    w.absarc(0, 0, r1, a0, a1, false);
    w.absarc(0, 0, r0, a1, a0, true);
    s.holes.push(w);
  }
  return s;
}

/** A brass gear mesh (its own mesh: it turns), facing +z. */
export function gear(r: number, teeth: number, thick = 0.12, color = "#c9a24a") {
  const geo = new THREE.ExtrudeGeometry(gearShape(r, teeth, Math.min(0.22, r * 0.14)), { depth: thick, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -thick / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.4 }));
  mesh.raycast = () => {};
  return mesh;
}

/** A rope of velvet between stanchion posts along a polyline (closed when `loop`). */
export function rope(k: SkyKit, f: number, pts: [number, number][], loop = false, color = "#5a1a3a") {
  const list = loop ? [...pts, pts[0]] : pts;
  for (const [x, z] of pts) k.vox(f, "nu7-post", post, x, z, 0, { solid: false });
  for (let i = 0; i < list.length - 1; i++) {
    const [ax, az] = list[i],
      [bx, bz] = list[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    // a little sag: two pieces meeting a few centimetres lower
    for (const [t0, t1, y0] of [
      [0, 0.5, 0.86],
      [0.5, 1, 0.86],
    ] as const) {
      const cx = ax + (bx - ax) * ((t0 + t1) / 2),
        cz = az + (bz - az) * ((t0 + t1) / 2);
      k.box(f, len / 2, 0.05, 0.05, cx, y0, cz, color, "matte", ry);
    }
    k.line(f, ax, az, bx, bz, 0.2);
  }
}
