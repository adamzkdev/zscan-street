import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, planterBox } from "./needle";

/**
 * The NOIR TOWER, on the avenue next to ZODL's, in Noir's colours (its mark is a silver eclipse on
 * black with a green light, its wordmark white and emerald): an obsidian slab (~113 m) with silver
 * edges, a slit of green light running up the middle of its front (the line through the eclipse),
 * and on the roof a silver crescent standing on its edge, its green light on the tip; the real 3D
 * mark turns over it (scene: the `crown` point). At its foot a black canopy edged in green, a dark
 * granite plaza with a green line to the doors, trees and lamps.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `crown`, `camPos`, `camLook`.
 */
export function noir(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const TOP = 340;
  const CRES = 44; // the crescent's radius, voxels
  const H = TOP + CRES * 2 + 36;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;
  const cz = Math.min(D - 50, 40);
  const HW = 22;
  const front = Math.ceil(cz + HW);

  const obsidian = G("#121214");
  const obsidianHi = G("#1e2022");
  const band = C("#0a0a0b");
  const silver = C("#c8ccd0");
  const silverDark = C("#8a8e92");
  const green = E("#00d38c", 1.8);
  const greenSoft = E("#5cf0bc", 1.2);
  const lit = E("#d8fff0", 0.9);
  const litWarm = E("#ffe8c8", 0.8);

  // ---- the plaza: dark granite, a green line to the doors --------------------------------------
  m.box(0, 0, 0, W, 1, D, shades(["#222224", "#1c1c1e", "#262628"], 2, seed));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#4a4c4e"));
      if (z > front && Math.abs(x + 0.5 - cx) < 0.6) m.set(x, 0, z, green);
      if (z > front && Math.abs(Math.abs(x + 0.5 - cx) - 9) < 0.5) m.set(x, 0, z, silverDark);
    }

  // ---- the slab: obsidian glass, silver edges, the green slit up its front -------------------------
  const FH = 12;
  for (let y = 1; y < TOP; y++) {
    const floor = Math.floor(y / FH);
    const fy = y % FH;
    for (let z = Math.floor(cz - HW); z < Math.ceil(cz + HW); z++)
      for (let x = Math.floor(cx - HW); x < Math.ceil(cx + HW); x++) {
        const dx = Math.abs(x + 0.5 - cx),
          dz = Math.abs(z + 0.5 - cz);
        const edge = dx > HW - 1.5 || dz > HW - 1.5;
        if (!edge) {
          if (dx > HW - 5 || dz > HW - 5) m.set(x, y, z, band);
          continue;
        }
        const corner = dx > HW - 1.5 && dz > HW - 1.5;
        let c: Paint;
        if (corner) c = silver;
        else if (z > cz && dz > HW - 1.5 && dx < 1.5) c = y < 24 ? silver : green; // the slit up the front
        else if (z > cz && dz > HW - 1.5 && dx < 3) c = silverDark;
        else if (y < 24 && z > cz && dx < 14) c = fy % 6 === 0 ? silverDark : E("#e8fff6", 0.75); // the lobby
        else if (fy === 0) c = floor % 6 === 5 ? greenSoft : band;
        else {
          const h = hash(Math.floor((dx > HW - 1.5 ? z : x) / 3), floor, dz > HW - 1.5 ? 1 : 2, seed);
          c = h < 0.06 ? lit : h < 0.08 ? litWarm : fy > 9 ? obsidianHi : obsidian;
        }
        m.set(x, y, z, c);
      }
  }
  // the roof: dark, a silver parapet
  m.box(Math.floor(cx - HW), TOP, Math.floor(cz - HW), Math.ceil(cx + HW), TOP + 1, Math.ceil(cz + HW), band);
  for (let z = Math.floor(cz - HW); z < Math.ceil(cz + HW); z++)
    for (let x = Math.floor(cx - HW); x < Math.ceil(cx + HW); x++)
      if (Math.abs(x + 0.5 - cx) > HW - 1 || Math.abs(z + 0.5 - cz) > HW - 1) m.box(x, TOP + 1, z, x + 1, TOP + 3, z + 1, silver);

  // ---- the crown: a silver crescent standing on its edge, facing the avenue, its green light ------
  {
    const ccy = TOP + 6 + CRES;
    const inner = CRES * 0.83,
      shift = CRES * 0.21;
    for (let y = TOP + 3; y < ccy + CRES + 1; y++)
      for (let x = Math.floor(cx - CRES - 1); x < Math.ceil(cx + CRES + 1); x++) {
        const px = x + 0.5 - cx,
          py = y + 0.5 - ccy;
        if (Math.hypot(px, py) > CRES || Math.hypot(px - shift, py) < inner) continue;
        for (let z = Math.round(cz - 2); z < Math.round(cz + 2); z++) m.set(x, y, z, z === Math.round(cz + 1) ? silver : silverDark);
      }
    // the line down the middle, and its foot on the roof
    m.box(Math.round(cx) - 1, TOP + 1, Math.round(cz) - 1, Math.round(cx) + 1, ccy + 4, Math.round(cz) + 1, silver);
    // the green light on the upper tip
    const tx = Math.round(cx + Math.cos(-1.05) * CRES * 0.98),
      ty = Math.round(ccy - Math.sin(-1.05) * CRES * 0.98);
    m.box(tx - 3, ty - 3, Math.round(cz) - 3, tx + 3, ty + 3, Math.round(cz) + 3, green);
    lights.push([tx, ty, cz + 6, "#00d38c"]);
  }

  // ---- the entrance: a black canopy edged in green, lit doors, the name ----------------------------
  const c0 = Math.round(cx - 13),
    c1 = Math.round(cx + 13);
  const cz1 = Math.min(D - 10, front + 14);
  m.box(c0, 17, front, c1, 19, cz1, band);
  m.box(c0, 16, cz1 - 1, c1, 17, cz1, green);
  for (const x of [c0 + 1, c1 - 2]) m.box(x, 1, cz1 - 3, x + 1, 16, cz1 - 2, silver);
  signs.push({ text: "NOIR", color: "#00d38c", x: cx, y: 21.5, z: cz1 + 0.2, w: 16, h: 4.5, vertical: false, facing: "front" });
  lights.push([cx, 12, cz1 + 2, "#9ff5d6"]);

  // ---- the plaza: trees, planters, benches, lamps, bollards ---------------------------------------
  for (const x of [5, W - 6]) for (let z = 10; z < front - 4; z += 14) leafTree(m, x, 1, z, k, seed + z, 6);
  planterBox(m, 3, 1, D - 12, 15, D - 6, seed + 3, false);
  planterBox(m, W - 15, 1, D - 12, W - 3, D - 6, seed + 4, false);
  bench(m, 17, 1, D - 8, k);
  bench(m, W - 23, 1, D - 8, k);
  for (const x of [3, W - 4]) for (let z = front; z < D - 3; z += 12) lampPost(m, x, 1, z, k, "#9ff5d6");
  for (let x = 4; x < W - 4; x += 4) if (Math.abs(x - cx) > 8) m.box(x, 1, D - 3, x + 1, 3, D - 2, silverDark);

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[Math.round(cx - HW), Math.round(cz - HW), Math.round(cx + HW), front + 1]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, front + 6],
      keeper: [cx + 5, 1, front + 8],
      crown: [cx, TOP + 6 + CRES * 2 + 26, cz],
      camPos: [cx + 160, 220, D + 240],
      camLook: [cx, 170, cz],
    },
  };
}
