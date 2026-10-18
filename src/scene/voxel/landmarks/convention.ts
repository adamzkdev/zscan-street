import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, planterBox } from "./needle";

/**
 * The ZEC CONVENTION CENTER, on the avenue across from the mall: a long low hall under a white roof
 * that rolls like a wave, a glass front lit from inside, a red LED band across it ("zkCAR
 * REVEAL"), vertical banners, and on the plaza the white zkCar itself on a turntable plinth,
 * searchlights either side. Inside (interior/convention) the zkCar is unveiled on stage, does
 * its loop and flies over a row of cars.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `crown`, `camPos`, `camLook`.
 */
export function convention(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const BASE = 36; // the hall's eaves, voxels (~12 m)
  const WAVE = 14; // the roof's swell
  const m = new VoxelModel(W, BASE + WAVE + 14, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;
  const x0 = 6,
    x1 = W - 6;
  const z0 = 4,
    z1 = Math.min(D - 30, z0 + 50);

  const white = C("#f1f2f3");
  const whiteShade = C("#d9dcdf");
  const steel = C("#8c939b");
  const glass = G("#1d2a36");
  const glassHi = G("#3d5a72");
  const lobby = E("#fff4e2", 0.9);
  const red = E("#ff2a3a", 1.8);
  const redSoft = E("#ff2a3a", 0.7);
  const ice = E("#dff3ff", 1.4);

  // ---- the plaza: dark granite, a red line to the doors ------------------------------------------
  m.box(0, 0, 0, W, 1, D, shades(["#3b3e44", "#36393f", "#41444a"], 2, seed));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#8a8f96"));
      if (z > z1 && Math.abs(x + 0.5 - cx) < 0.6) m.set(x, 0, z, red);
    }

  // ---- the hall: glass all along the front, white flanks, the roof a wave --------------------------
  const roofAt = (x: number) => BASE + Math.round(WAVE * (0.5 + 0.5 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 2.2 - 0.6)) ** 1.4);
  for (let x = x0; x < x1; x++) {
    const top = roofAt(x);
    for (let y = 1; y < top; y++)
      for (let z = z0; z < z1; z++) {
        const ex = x === x0 || x === x1 - 1;
        const ez = z === z0 || z === z1 - 1;
        if (!ex && !ez) continue;
        let c: Paint;
        if (ex || z === z0) c = y % 12 === 0 ? whiteShade : white;
        else if (x % 10 === 0) c = steel;
        else if (y < 12) c = y < 2 ? whiteShade : lobby; // the lobby: lit all along
        else if (y >= 16 && y < 23) c = x % 10 === 5 ? steel : red; // the LED band
        else c = hash(Math.floor(x / 4), y >> 3, 3, seed) < 0.1 ? lobby : y > top - 6 ? glassHi : glass;
        m.set(x, y, z, c);
      }
    // the roof: white skin, an overhang over the glass, a thin red line along its lip
    for (let z = z0; z < z1 + 6; z++) m.set(x, top, z, z >= z1 ? whiteShade : white);
    m.set(x, top - 1, z1 + 5, redSoft);
  }
  signs.push({ text: "zkCAR REVEAL", color: "#ff2a3a", x: cx, y: 19.5, z: z1 + 0.2, w: 70, h: 6, vertical: false, facing: "front" });
  signs.push({ text: "ZEC CONVENTION CENTER", color: "#ffffff", x: cx, y: 30, z: z1 + 6.2, w: 44, h: 4, vertical: false, facing: "front" });

  // vertical banners on the flanks of the doors: red, a white car stripe
  for (const bx of [Math.round(cx - 34), Math.round(cx + 30)]) {
    m.box(bx, 6, z1, bx + 4, 30, z1 + 1, C("#c3121f"));
    m.box(bx + 1, 14, z1 + 1, bx + 3, 15, z1 + 2, white);
    m.box(bx, 30, z1, bx + 4, 31, z1 + 1, steel);
  }
  // the doors: a steel portal
  m.box(Math.round(cx - 10), 1, z1, Math.round(cx + 10), 2, z1 + 3, steel);
  m.box(Math.round(cx - 10), 12, z1, Math.round(cx + 10), 13, z1 + 3, steel);

  // ---- the roadster on its plinth: a white wedge, black glass, a red tail bar ----------------------
  const pz = z1 + 16;
  const px = Math.round(cx - 52); // off to the side: the doors stay clear
  for (let z = -10; z <= 10; z++)
    for (let x = -10; x <= 10; x++) if (x * x + z * z <= 100) m.set(px + x, 1, pz + z, x * x + z * z > 81 ? red : C("#1b1d22"));
  for (let z = -7; z <= 7; z++) {
    const t = (z + 7) / 14; // 0 tail … 1 nose
    const h = Math.round(4 - 2.2 * t * t + (t < 0.15 ? 0.6 : 0));
    for (let x = -3; x <= 3; x++) {
      for (let y = 0; y < h; y++) m.set(px + x, 2 + y, pz + z, y === 0 ? C("#16181c") : white);
      if (Math.abs(z) < 3 && Math.abs(x) < 3) m.set(px + x, 2 + h, pz + z, G("#101418"));
    }
  }
  m.box(px - 3, 4, pz - 8, px + 4, 5, pz - 7, red);
  m.box(px - 3, 3, pz + 7, px + 4, 4, pz + 8, ice);
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) m.box(px + dx, 2, pz + dz - 1, px + dx + 1, 4, pz + dz + 2, C("#0d0e10"));
  lights.push([px, 9, pz, "#ffffff"]);

  // searchlights either side of the plinth
  for (const sx of [px - 15, px + 15]) {
    m.box(Math.round(sx) - 1, 1, pz - 1, Math.round(sx) + 2, 3, pz + 2, C("#2a2c31"));
    m.box(Math.round(sx), 3, pz, Math.round(sx) + 1, 5, pz + 1, ice);
    lights.push([sx, 6, pz, "#dff3ff"]);
  }
  lights.push([cx, 10, z1 + 4, "#ffe9d2"]);
  lights.push([cx - 40, 18, z1 + 3, "#ff2a3a"]);
  lights.push([cx + 40, 18, z1 + 3, "#ff2a3a"]);

  // ---- the plaza: trees, planters, benches, lamps --------------------------------------------------
  for (const x of [4, W - 5]) for (let z = 10; z < z1; z += 14) leafTree(m, x, 1, z, k, seed + z, 6);
  planterBox(m, 4, 1, D - 12, 18, D - 6, seed + 3, false);
  planterBox(m, W - 18, 1, D - 12, W - 4, D - 6, seed + 4, false);
  bench(m, 22, 1, D - 8, k);
  bench(m, W - 28, 1, D - 8, k);
  for (const x of [3, W - 4]) for (let z = z1; z < D - 3; z += 12) lampPost(m, x, 1, z, k, "#ffe9d2");

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [
      [x0, z0, x1, z1 + 1],
      [Math.round(cx - 52) - 10, z1 + 6, Math.round(cx - 52) + 11, z1 + 27],
    ],
    lights,
    scale: k,
    points: {
      door: [cx, 1, z1 + 4],
      keeper: [cx + 14, 1, z1 + 6],
      crown: [cx, BASE + WAVE, (z0 + z1) / 2],
      camPos: [cx + 120, 110, D + 140],
      camLook: [cx, 20, (z0 + z1) / 2],
    },
  };
}
