import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, planterBox } from "./needle";

/**
 * The VIZOR TOWER, across the avenue from ZK TOWER HALO, in Vizor's colours (its app icon is a
 * silver knight's helmet on crimson, #b90b4a): a round tower of crimson glass (~100 m) tapering as
 * it rises, silver fins all round, two pink helices of neon winding up it, and on top the helmet:
 * a silver dome whose visor, a wide slot across its front, glows. Over it the real 3D emblem turns
 * (scene: the `crown` point). At its foot a silver canopy edged in pink, a plaza of pale stone
 * with a pink ring, trees and lamps.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `crown`, `camPos`, `camLook`.
 */
export function vizor(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const TOP = 290;
  const R0 = 25;
  const rAt = (y: number) => R0 - 5 * Math.min(1, y / TOP);
  const RT = rAt(TOP);
  const H = TOP + Math.ceil(RT) + 34;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;
  const cz = Math.min(D - 36, 32);

  const pink = E("#ff3d7a", 1.7);
  const pinkSoft = E("#ff8fb0", 1.4);
  const glass = G("#7a0a32");
  const glassHi = G("#9e1446");
  const fin = C("#d0d0d8");
  const band = C("#101018");
  const lit = E("#ffe4ec", 1.0);
  const litWarm = E("#ffe2c0", 0.9);

  // ---- the plaza: pale stone, a pink ring round the tower -------------------------------------
  m.box(0, 0, 0, W, 1, D, shades(["#d6d4dc", "#cfcdd6", "#dcdae2"], 2, seed));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (Math.abs(r - (R0 + 6)) < 0.5) m.set(x, 0, z, pinkSoft);
      else if (Math.abs(r - (R0 + 9)) < 0.5) m.set(x, 0, z, C("#8e8aa0"));
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#9a98a4"));
    }

  // ---- the tower ---------------------------------------------------------------------------------------
  const FH = 12;
  const FINS = 36;
  for (let y = 1; y < TOP; y++) {
    const r = rAt(y);
    const floor = Math.floor(y / FH);
    const fy = y % FH;
    for (let z = Math.floor(cz - r - 1); z < Math.ceil(cz + r + 1); z++)
      for (let x = Math.floor(cx - r - 1); x < Math.ceil(cx + r + 1); x++) {
        const dx = x + 0.5 - cx,
          dz = z + 0.5 - cz;
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        if (d < r - 1.5) {
          if (d > r - 5) m.set(x, y, z, band);
          continue;
        }
        const a = Math.atan2(dz, dx);
        const t = ((a + Math.PI) / (Math.PI * 2)) * FINS;
        // the helices: two pink stripes winding up (a turn every 120 m … every 360 voxels)
        const helix = [0, Math.PI].some((p) => {
          const h = (((a - (y / 360) * Math.PI * 2 - p) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          return Math.abs(h) < 0.07;
        });
        let c: Paint;
        if (helix) c = pink;
        else if (t - Math.floor(t) < 0.16) c = fin;
        else if (fy === 0) c = band;
        else if (y < 24 && dz > 0 && Math.abs(dx) < 16) c = fy % 6 === 0 ? fin : E("#ffeef2", 0.8); // the lobby
        else {
          const h = hash(Math.floor(t), floor, 1, seed);
          c = h < 0.07 ? lit : h < 0.1 ? litWarm : fy > 9 ? glassHi : glass;
        }
        m.set(x, y, z, c);
      }
  }
  // pink rings every twenty floors
  for (const y of [80, 160, 240, TOP - 1]) m.cylinder(cx, y, cz, rAt(y) + 0.6, 1, pink, true);

  // ---- the helmet on top: a dome, its visor glowing across the front ------------------------------------
  for (let y = TOP; y < TOP + RT; y++)
    for (let z = Math.floor(cz - RT); z < Math.ceil(cz + RT); z++)
      for (let x = Math.floor(cx - RT); x < Math.ceil(cx + RT); x++) {
        const dx = x + 0.5 - cx,
          dy = y + 0.5 - TOP,
          dz = z + 0.5 - cz;
        const d = Math.hypot(dx, dy * 1.05, dz);
        if (d > RT || d < RT - 2) continue;
        const a = Math.atan2(dx, dz); // 0 at the front (+z)
        const visor = Math.abs(a) < 1.15 && dy > RT * 0.22 && dy < RT * 0.5;
        m.set(x, y, z, visor ? (Math.abs(dy - RT * 0.36) < 0.8 ? E("#ffe0ea", 2.4) : pink) : (Math.floor(a * 6) & 1 ? C("#d8d8e2") : C("#c4c4d0")));
      }
  // the antenna, a beacon
  m.box(Math.floor(cx), TOP + Math.ceil(RT) - 1, Math.floor(cz), Math.floor(cx) + 1, TOP + Math.ceil(RT) + 6, Math.floor(cz) + 1, C("#c8c8d6"));
  m.set(Math.floor(cx), TOP + Math.ceil(RT) + 6, Math.floor(cz), E("#ff4a3a", 2.6));
  lights.push([cx, TOP + RT * 0.4, cz + RT, "#ff3d7a"]);

  // ---- the entrance: a silver canopy edged in pink, lit doors, the name --------------------------
  const front = Math.ceil(cz + R0);
  const c0 = Math.round(cx - 13),
    c1 = Math.round(cx + 13);
  const cz1 = Math.min(D - 8, front + 13);
  m.box(c0, 17, front - 3, c1, 19, cz1, C("#d8d8e2"));
  m.box(c0, 16, cz1 - 1, c1, 17, cz1, pink);
  for (const x of [c0 + 1, c1 - 2]) m.box(x, 1, cz1 - 3, x + 1, 16, cz1 - 2, C("#c8c8d6"));
  for (let x = Math.round(cx - 7); x < Math.round(cx + 7); x++) {
    const z = Math.floor(cz + Math.sqrt(Math.max(0, R0 * R0 - (x + 0.5 - cx) ** 2)));
    for (let y = 1; y < 14; y++) m.set(x, y, z, x % 3 === 0 || y === 13 ? fin : E("#ffeef2", 0.9));
  }
  signs.push({ text: "VIZOR", color: "#ff8fb0", x: cx, y: 21.5, z: cz1 + 0.2, w: 18, h: 4.5, vertical: false, facing: "front" });
  lights.push([cx, 12, cz1 + 2, "#ff8fb0"]);

  // ---- the plaza: trees, planters, benches, lamps --------------------------------------------------
  for (const x of [5, W - 6]) for (let z = 8; z < front - 6; z += 14) leafTree(m, x, 1, z, k, seed + z, 6);
  planterBox(m, 3, 1, D - 11, 15, D - 5, seed + 3, true);
  planterBox(m, W - 15, 1, D - 11, W - 3, D - 5, seed + 4, true);
  bench(m, 17, 1, D - 7, k);
  bench(m, W - 23, 1, D - 7, k);
  for (const x of [3, W - 4]) for (let z = front - 4; z < D - 3; z += 12) lampPost(m, x, 1, z, k, "#ff8fb0");
  for (let x = 4; x < W - 4; x += 4) if (Math.abs(x - cx) > 8) m.box(x, 1, D - 3, x + 1, 3, D - 2, C("#5a1030"));

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[Math.round(cx - R0), Math.round(cz - R0), Math.round(cx + R0), front + 1]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, front + 6],
      keeper: [cx + 5, 1, front + 8],
      crown: [cx, TOP + RT + 24, cz],
      camPos: [cx + 150, 200, D + 230],
      camLook: [cx, 160, cz],
    },
  };
}
