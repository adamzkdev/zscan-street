import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, planterBox } from "./needle";

/**
 * The ZSA LAB, on the avenue east of the heart: where visitors mint their own Zcash Shielded Asset
 * (ZIP 227) on the ZSA testnet. A two-storey white laboratory with a curtain of teal glass, gold
 * mullions, a lit ground floor you can see the mint counters through, and on the roof a glass dome
 * over the "mint reactor" (the scene turns the live tokens round it: the `crown` point). A white
 * canopy edged in teal over the doors, a pale plaza with a teal line to them.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `crown`, `camPos`, `camLook`.
 */
export function zsalab(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const TOP = 62; // roof, voxels (~21 m)
  const R = 20; // dome radius
  const m = new VoxelModel(W, TOP + R + 8, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;
  const HW = Math.min(27, W / 2 - 6);
  const z0 = 8,
    z1 = Math.min(D - 26, z0 + 52);
  const cz = (z0 + z1) / 2;

  const white = C("#eef1f2");
  const whiteShade = C("#d7dcde");
  const glass = G("#2a8f8a");
  const glassHi = G("#3fb7ae");
  const mullion = C("#c9a24a");
  const teal = E("#3ef0c8", 1.6);
  const tealSoft = E("#3ef0c8", 0.8);
  const lobby = E("#eafff9", 0.85);
  const lit = E("#d8fff3", 0.9);
  const domeGlass = G("#9fe9e0");
  const core = E("#f4b728", 2.4);

  // ---- the plaza: pale stone, a teal line to the doors ------------------------------------------
  m.box(0, 0, 0, W, 1, D, shades(["#d9dcdc", "#d2d6d6", "#e0e3e2"], 2, seed));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#9aa0a2"));
      if (z > z1 && Math.abs(x + 0.5 - cx) < 0.6) m.set(x, 0, z, teal);
    }

  // ---- the lab: white frame, teal glass, gold mullions, the lit ground floor ---------------------
  const FH = 15;
  for (let y = 1; y < TOP; y++) {
    const fy = y % FH;
    const floor = Math.floor(y / FH);
    for (let z = z0; z < z1; z++)
      for (let x = Math.floor(cx - HW); x < Math.ceil(cx + HW); x++) {
        const ex = x === Math.floor(cx - HW) || x === Math.ceil(cx + HW) - 1;
        const ez = z === z0 || z === z1 - 1;
        if (!ex && !ez) continue;
        const along = ez ? x : z;
        let c: Paint;
        if ((ex && ez) || fy === 0 || fy === 1) c = fy === 1 ? whiteShade : white; // frame and floor slabs
        else if (along % 9 === 0) c = mullion;
        else if (floor === 0 && ez && z === z1 - 1) c = fy < 3 ? whiteShade : lobby; // the street floor: you see the counters
        else {
          const h = hash(Math.floor(along / 3), floor, ez ? 1 : 2, seed);
          c = h < 0.12 ? lit : fy > 11 ? glassHi : glass;
        }
        m.set(x, y, z, c);
      }
  }
  // the roof: white, a teal parapet line
  m.box(Math.floor(cx - HW), TOP, z0, Math.ceil(cx + HW), TOP + 1, z1, white);
  for (let z = z0; z < z1; z++)
    for (let x = Math.floor(cx - HW); x < Math.ceil(cx + HW); x++)
      if (x === Math.floor(cx - HW) || x === Math.ceil(cx + HW) - 1 || z === z0 || z === z1 - 1) m.set(x, TOP + 1, z, tealSoft);

  // ---- the dome over the mint reactor: a glass hemisphere, ribs in gold, a glowing core -----------
  for (let y = 0; y <= R; y++)
    for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const d = Math.hypot(x + 0.5 - cx, y, z + 0.5 - cz);
        if (d > R || d < R - 1.2) continue;
        const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
        const rib = Math.abs(((a / (Math.PI * 2)) * 12 + 12) % 1 - 0.5) > 0.44 || y % 7 === 0;
        m.set(x, TOP + 1 + y, z, rib ? mullion : domeGlass);
      }
  m.box(Math.round(cx) - 2, TOP + 1, Math.round(cz) - 2, Math.round(cx) + 2, TOP + 6, Math.round(cz) + 2, core);
  lights.push([cx, TOP + 8, cz, "#3ef0c8"]);

  // ---- the entrance: a white canopy edged in teal, the name --------------------------------------
  const c0 = Math.round(cx - 14),
    c1 = Math.round(cx + 14);
  const cz1 = Math.min(D - 12, z1 + 12);
  m.box(c0, 13, z1, c1, 15, cz1, white);
  m.box(c0, 12, cz1 - 1, c1, 13, cz1, teal);
  for (const x of [c0 + 1, c1 - 2]) m.box(x, 1, cz1 - 3, x + 1, 12, cz1 - 2, mullion);
  signs.push({ text: "ZSA LAB", color: "#3ef0c8", x: cx, y: 18, z: cz1 + 0.2, w: 18, h: 4.2, vertical: false, facing: "front" });
  lights.push([cx, 10, cz1 + 2, "#c8fff0"]);

  // ---- the plaza: trees, planters, benches, lamps ---------------------------------------------------
  for (const x of [5, W - 6]) for (let z = 12; z < z1; z += 14) leafTree(m, x, 1, z, k, seed + z, 6);
  planterBox(m, 3, 1, D - 12, 15, D - 6, seed + 3, false);
  planterBox(m, W - 15, 1, D - 12, W - 3, D - 6, seed + 4, false);
  bench(m, 17, 1, D - 8, k);
  bench(m, W - 23, 1, D - 8, k);
  for (const x of [3, W - 4]) for (let z = z1; z < D - 3; z += 12) lampPost(m, x, 1, z, k, "#c8fff0");

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[Math.round(cx - HW), z0, Math.round(cx + HW), z1 + 1]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, z1 + 6],
      keeper: [cx + 6, 1, z1 + 8],
      crown: [cx, TOP + 8, cz],
      camPos: [cx + 90, 110, D + 120],
      camLook: [cx, 40, cz],
    },
  };
}
