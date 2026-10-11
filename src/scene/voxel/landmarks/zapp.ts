import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, planterBox } from "./needle";

/**
 * The ZAPP TOWER, on the avenue west of the heart (across it from Noir's), in ZApp's colours (ZLab's
 * shield: gold outline, white Z, a green dashed scan line, on black): a black glass slab (~113 m)
 * with gold edges, green dashed scan lines running round it every few floors, and on the roof the
 * shield itself standing on its tip, its Z and its scan line; the real 3D mark turns over it (scene:
 * the `crown` point). At its foot a black canopy edged in gold, a dark plaza with a gold line to the
 * doors, trees and lamps.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `crown`, `camPos`, `camLook`.
 */
export function zapp(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const TOP = 340;
  const CRES = 44; // half the shield's height, voxels
  const H = TOP + CRES * 2 + 36;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;
  const cz = Math.min(D - 50, 40);
  const HW = 22;
  const front = Math.ceil(cz + HW);

  const obsidian = G("#121211");
  const obsidianHi = G("#1f1e1b");
  const band = C("#0b0b0a");
  const silver = C("#f4b728"); // gold, ZApp's shield
  const silverDark = C("#a07410");
  const green = E("#1baf7a", 1.9); // the scan line
  const greenSoft = E("#f4b728", 1.1);
  const white = C("#f4f4f2");
  const lit = E("#d8fff0", 0.9);
  const litWarm = E("#ffe8c8", 0.8);

  // ---- the plaza: dark granite, a green line to the doors --------------------------------------
  m.box(0, 0, 0, W, 1, D, shades(["#222220", "#1c1c1a", "#262624"], 2, seed));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#4a4c4e"));
      if (z > front && Math.abs(x + 0.5 - cx) < 0.6) m.set(x, 0, z, silver);
      if (z > front && Math.abs(Math.abs(x + 0.5 - cx) - 9) < 0.5) m.set(x, 0, z, silverDark);
    }

  // ---- the slab: black glass, gold edges and a gold line up its front, dashed green scan lines -------------------------
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
        else if (z > cz && dz > HW - 1.5 && dx < 1.5) c = silver; // a gold line up the front
        else if (z > cz && dz > HW - 1.5 && dx < 3) c = silverDark;
        else if (y < 24 && z > cz && dx < 14) c = fy % 6 === 0 ? silverDark : E("#fff4dc", 0.75); // the lobby
        else if (fy === 0 && floor % 6 === 5) c = Math.floor((dx > HW - 1.5 ? z : x) / 3) % 2 === 0 ? green : band; // the scan line, dashed
        else if (fy === 0) c = floor % 12 === 11 ? greenSoft : band;
        else {
          const h = hash(Math.floor((dx > HW - 1.5 ? z : x) / 3), floor, dz > HW - 1.5 ? 1 : 2, seed);
          c = h < 0.06 ? lit : h < 0.08 ? litWarm : fy > 9 ? obsidianHi : obsidian;
        }
        m.set(x, y, z, c);
      }
  }
  // the roof: dark, a gold parapet
  m.box(Math.floor(cx - HW), TOP, Math.floor(cz - HW), Math.ceil(cx + HW), TOP + 1, Math.ceil(cz + HW), band);
  for (let z = Math.floor(cz - HW); z < Math.ceil(cz + HW); z++)
    for (let x = Math.floor(cx - HW); x < Math.ceil(cx + HW); x++)
      if (Math.abs(x + 0.5 - cx) > HW - 1 || Math.abs(z + 0.5 - cz) > HW - 1) m.box(x, TOP + 1, z, x + 1, TOP + 3, z + 1, silver);

  // ---- the crown: the shield standing on its tip, facing the avenue: gold outline, white Z, green dashes
  {
    const SH = 32; // the mark's viewBox
    const u = (CRES * 2) / 27; // voxels per mark unit
    const base = TOP + 4;
    // the shield path (zlab Mark / ZApp Theme.swift), sampled
    const pts: [number, number][] = [[16, 2.5], [27.5, 7], [27.5, 15.6]];
    const bez = (p0: number[], p1: number[], p2: number[], p3: number[]) => {
      for (let i = 1; i <= 24; i++) {
        const t = i / 24,
          q = 1 - t;
        pts.push([q * q * q * p0[0] + 3 * q * q * t * p1[0] + 3 * q * t * t * p2[0] + t * t * t * p3[0], q * q * q * p0[1] + 3 * q * q * t * p1[1] + 3 * q * t * t * p2[1] + t * t * t * p3[1]]);
      }
    };
    bez([27.5, 15.6], [27.5, 22.6], [22.7, 27.5], [16, 29.5]);
    bez([16, 29.5], [9.3, 27.5], [4.5, 22.6], [4.5, 15.6]);
    pts.push([4.5, 7]);
    const inside = (px: number, py: number, poly: [number, number][]) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i],
          [xj, yj] = poly[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const innerPoly = pts.map(([x, y]) => [16 + (x - 16) * 0.84, 16.3 + (y - 16) * 0.84] as [number, number]);
    const segDist = (px: number, py: number, a: number[], b: number[]) => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
    };
    const Z: number[][] = [[11, 11], [21, 11], [11, 21], [21, 21]];
    // mark units → voxels: x across the avenue face, y up (the mark's y runs down)
    const top = base + 29.5 * u;
    for (let y = base; y < top + 1; y++)
      for (let x = Math.floor(cx - 13 * u); x < Math.ceil(cx + 13 * u); x++) {
        const mx = 16 + (x + 0.5 - cx) / u,
          my = 29.5 - (y + 0.5 - base) / u;
        if (!inside(mx, my, pts)) continue;
        let c: Paint | null = null;
        if (!inside(mx, my, innerPoly)) c = silver;
        else if (Math.min(segDist(mx, my, Z[0], Z[1]), segDist(mx, my, Z[1], Z[2]), segDist(mx, my, Z[2], Z[3])) < 1.25) c = white;
        else if (Math.abs(my - 16) < 0.6 && mx > 7.5 && mx < 24.5 && Math.floor((mx - 7.5) / 2) % 2 === 0) c = green;
        if (!c) continue;
        for (let z = Math.round(cz - 2); z < Math.round(cz + 2); z++) m.set(x, y, z, c === silver && z !== Math.round(cz + 1) ? silverDark : c);
      }
    // its foot on the roof
    m.box(Math.round(cx) - 2, TOP + 1, Math.round(cz) - 2, Math.round(cx) + 2, base + 2, Math.round(cz) + 2, silverDark);
    lights.push([cx, base + 16 * u, cz + 8, "#f4b728"]);
    void SH;
  }

  // ---- the entrance: a black canopy edged in green, lit doors, the name ----------------------------
  const c0 = Math.round(cx - 13),
    c1 = Math.round(cx + 13);
  const cz1 = Math.min(D - 10, front + 14);
  m.box(c0, 17, front, c1, 19, cz1, band);
  m.box(c0, 16, cz1 - 1, c1, 17, cz1, green);
  for (const x of [c0 + 1, c1 - 2]) m.box(x, 1, cz1 - 3, x + 1, 16, cz1 - 2, silver);
  signs.push({ text: "ZAPP", color: "#f4b728", x: cx, y: 21.5, z: cz1 + 0.2, w: 16, h: 4.5, vertical: false, facing: "front" });
  lights.push([cx, 12, cz1 + 2, "#ffe2a0"]);

  // ---- the plaza: trees, planters, benches, lamps, bollards ---------------------------------------
  for (const x of [5, W - 6]) for (let z = 10; z < front - 4; z += 14) leafTree(m, x, 1, z, k, seed + z, 6);
  planterBox(m, 3, 1, D - 12, 15, D - 6, seed + 3, false);
  planterBox(m, W - 15, 1, D - 12, W - 3, D - 6, seed + 4, false);
  bench(m, 17, 1, D - 8, k);
  bench(m, W - 23, 1, D - 8, k);
  for (const x of [3, W - 4]) for (let z = front; z < D - 3; z += 12) lampPost(m, x, 1, z, k, "#ffe2a0");
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
      crown: [cx, TOP + 4 + CRES * 2 + 34, cz],
      camPos: [cx + 160, 220, D + 240],
      camLook: [cx, 170, cz],
    },
  };
}
