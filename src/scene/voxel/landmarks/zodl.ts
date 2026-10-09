import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import { ZODL_BIRD } from "../../emblems";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, planterBox } from "./needle";

/**
 * The ZODL TOWER, across the avenue from the ZEC Reserve, in Zodl's colours (its app icon is a
 * black origami bird on white): a white slab (~110 m) that steps in twice as it rises, ribbons of
 * dark glass for windows, black chamfered corners, white light round each setback; up its front,
 * fifty metres up, the black bird on a lit white square, like the icon; on the roof a drum on
 * which the real 3D bird turns (scene: the `crown` point). At its foot a black canopy edged in
 * white light over the doors, a pale granite plaza striped in black, trees and lamps.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `crown`, `camPos`, `camLook`.
 */
export function zodl(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const TOP = 330;
  const H = TOP + 30;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;
  const cz = Math.min(D - 52, 40);

  const white = C("#f2f1ee");
  const whiteShade = C("#e4e2de");
  const light = E("#ffffff", 1.3);
  const black = C("#151314");
  const glass = G("#1a1a20");
  const glassHi = G("#2c2c34");
  const band = C("#0b0b0d");
  const mullion = C("#3d393a");
  const lit = E("#ffe6c4", 1.0);
  const litCool = E("#f4f6ff", 0.9);

  // ---- the plaza: pale granite, black stripes to the door ----------------------------------------
  m.box(0, 0, 0, W, 1, D, shades(["#d8d6d2", "#cfcdc8", "#dedcd8"], 2, seed));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#8e8b86"));
      // black stripes running from the kerb to the doors
      if (z > cz + 26 && Math.abs(x + 0.5 - cx) < 11 && Math.floor(x + 0.5 - cx + 100) % 5 === 0) m.set(x, 0, z, black);
    }

  // ---- the tower: three stacked slabs, chamfered corners ---------------------------------------------
  const half = (y: number) => (y < 220 ? 25 : y < 290 ? 21 : 17);
  const CH = 3; // the chamfer
  const FH = 12; // a floor (4 m)
  const front = Math.ceil(cz + 25);
  for (let y = 1; y < TOP; y++) {
    const hw = half(y);
    const floor = Math.floor(y / FH);
    const fy = y % FH;
    const setback = y === 219 || y === 289 || y === TOP - 1;
    for (let z = Math.floor(cz - hw); z < Math.ceil(cz + hw); z++)
      for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
        const dx = Math.abs(x + 0.5 - cx),
          dz = Math.abs(z + 0.5 - cz);
        if (dx + dz > hw * 2 - CH) continue;
        const edge = dx > hw - 1.5 || dz > hw - 1.5 || dx + dz > hw * 2 - CH - 1.5;
        if (!edge) {
          // the core, a few voxels in, so the glass reads dark from outside
          if (dx > hw - 5 || dz > hw - 5) m.set(x, y, z, band);
          continue;
        }
        const corner = dx + dz > hw * 2 - CH - 1.5;
        let c: Paint;
        if (setback) c = light;
        else if (corner) c = black;
        else if (y < 24 && z > cz && Math.abs(x + 0.5 - cx) < 18) c = fy % 6 === 0 ? mullion : E("#fff1d6", 0.8); // the lobby's lit glass
        else if (fy < 7) c = fy === 0 ? whiteShade : white; // the white spandrels between the ribbons
        else if ((Math.floor(dx > hw - 1.5 ? z : x) & 3) === 0) c = mullion;
        else {
          const h = hash(Math.floor((dx > hw - 1.5 ? z : x) / 4), floor, dz > hw - 1.5 ? 1 : 2, seed);
          c = h < 0.07 ? lit : h < 0.1 ? litCool : fy > 9 ? glassHi : glass;
        }
        m.set(x, y, z, c);
      }
  }
  // the roofs of the setbacks, dark
  for (const [y, from, to] of [
    [220, 21, 25],
    [290, 17, 21],
  ] as const)
    for (let z = Math.floor(cz - to); z < Math.ceil(cz + to); z++)
      for (let x = Math.floor(cx - to); x < Math.ceil(cx + to); x++) {
        const dx = Math.abs(x + 0.5 - cx),
          dz = Math.abs(z + 0.5 - cz);
        if (dx + dz > to * 2 - CH || (dx < from && dz < from)) continue;
        m.set(x, y - 1, z, C("#2a2a30"));
      }

  // ---- the bird on the front, fifty metres up: black on a lit white square, like the app icon -----
  {
    const BY = 170; // its centre
    const S = 118; // voxels per icon unit
    const bcx = (0.287 + 0.6597) / 2,
      bcy = (0.3241 + 0.6528) / 2;
    const tri = (px: number, py: number, t: [number, number][]) => {
      const s = (a: [number, number], b: [number, number]) => (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
      const d1 = s(t[0], t[1]),
        d2 = s(t[1], t[2]),
        d3 = s(t[2], t[0]);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    const z = front - 1;
    const P = 23; // half the square
    for (let y = BY - P; y < BY + P; y++)
      for (let x = Math.floor(cx - P); x < Math.ceil(cx + P); x++) {
        const px = bcx + (x + 0.5 - cx) / S,
          py = bcy + (BY - (y + 0.5)) / S;
        const bird = ZODL_BIRD.some((t) => tri(px, py, t as [number, number][]));
        const rim = Math.abs(x + 0.5 - cx) > P - 1 || Math.abs(y + 0.5 - BY) > P - 1;
        m.set(x, y, z, bird ? band : rim ? black : E("#ffffff", 0.5));
        m.set(x, y, z - 1, bird ? band : C("#f2f1ee"));
      }
    lights.push([cx, BY, front + 3, "#ffffff"]);
  }

  // ---- the crown: a drum on the roof, the 3D bird turns over it (scene) ------------------------------
  m.box(Math.floor(cx - 17), TOP, Math.floor(cz - 17), Math.ceil(cx + 17), TOP + 1, Math.ceil(cz + 17), C("#2a2a30"));
  m.cylinder(cx, TOP + 1, cz, 9, 5, white);
  m.cylinder(cx, TOP + 6, cz, 10, 1, light);
  m.cylinder(cx, TOP + 1, cz, 11, 1, black, true);
  // aircraft lights on the corners
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    m.box(Math.round(cx + sx * 14), TOP + 1, Math.round(cz + sz * 14), Math.round(cx + sx * 14) + 1, TOP + 4, Math.round(cz + sz * 14) + 1, E("#ff4a3a", 2.4));
  lights.push([cx, TOP + 8, cz, "#ffffff"]);

  // ---- the entrance: a black canopy, lit doors, the name --------------------------------------------
  const c0 = Math.round(cx - 14),
    c1 = Math.round(cx + 14);
  const cz1 = Math.min(D - 10, front + 14);
  m.box(c0, 17, front, c1, 19, cz1, black);
  m.box(c0, 16, cz1 - 1, c1, 17, cz1, light);
  m.box(c0, 16, front, c0 + 1, 17, cz1, light);
  m.box(c1 - 1, 16, front, c1, 17, cz1, light);
  for (const x of [c0 + 1, c1 - 2]) m.box(x, 1, cz1 - 3, x + 1, 16, cz1 - 2, black);
  m.box(Math.round(cx - 6), 1, front, Math.round(cx + 6), 13, front + 1, (x, y) => (x % 3 === 0 || y === 12 ? C("#26262c") : E("#fff1d6", 0.9)));
  signs.push({ text: "ZODL", color: "#ffffff", x: cx, y: 21.5, z: cz1 + 0.2, w: 16, h: 4.5, vertical: false, facing: "front" });
  lights.push([cx, 12, cz1 + 2, "#fff4e0"]);

  // ---- the plaza: planters, trees, benches, lamps, bollards -------------------------------------------
  for (const x of [5, W - 6]) for (let z = 10; z < front - 4; z += 14) leafTree(m, x, 1, z, k, seed + z, 6);
  planterBox(m, 3, 1, D - 12, 16, D - 6, seed + 3, false);
  planterBox(m, W - 16, 1, D - 12, W - 3, D - 6, seed + 4, false);
  bench(m, 18, 1, D - 8, k);
  bench(m, W - 24, 1, D - 8, k);
  for (const x of [3, W - 4]) for (let z = front; z < D - 3; z += 12) lampPost(m, x, 1, z, k, "#fff4e0");
  for (let x = 4; x < W - 4; x += 4) if (Math.abs(x - cx) > 8) m.box(x, 1, D - 3, x + 1, 3, D - 2, black);

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[Math.round(cx - 25), Math.round(cz - 25), Math.round(cx + 25), front + 1]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, front + 6],
      keeper: [cx + 5, 1, front + 8],
      crown: [cx, TOP + 26, cz],
      camPos: [cx + 160, 220, D + 240],
      camLook: [cx, 170, cz],
    },
  };
}
