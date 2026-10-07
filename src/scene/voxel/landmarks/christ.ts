import type { Built } from "../buildings";
import { C, E, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { SNARK1, SNARK1_PALETTE } from "./statue-art";

/**
 * The zkSNARK Redeemer on Corcovado, across the bay: a granite needle rising out of the water,
 * jungle on its gentler flanks, the summit terrace with its balustrade, the stairs down to the
 * lower terrace and the red cog train at its station; on top, on a pedestal with a chapel door,
 * zkSNARKs #1 in pale soapstone, arms open over the city, the hood's void and its two Volt eyes
 * looking north across the water. Floodlit from below at night.
 *
 * Scale 2 (a third of a metre per voxel). Points: `head` the face, `terrace` the summit terrace.
 */

const paintAt = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));

/** Soapstone instead of the character's own colours. */
const STONE: Record<string, string[]> = {
  a: ["#aca99b", "#a5a294", "#b3b0a2"],
  b: ["#ebe8dd", "#e5e2d6", "#efece2"],
  c: ["#8e8b80", "#87847a", "#959287"],
  d: ["#d2cfc2", "#cbc8bb", "#d8d5c9"],
  e: ["#141113", "#141113"],
};

export function christ(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 200;
  const m = new VoxelModel(W, H, D);
  const rnd = rand(seed * 7 + 3);

  // ---- the mountain: a heightfield ------------------------------------------------------------
  const px = Math.round(W / 2),
    pz = 30; // the summit, ten metres from the back
  const TOP = 78; // 26 m
  const nz = (x: number, z: number, s: number) =>
    Math.sin(x * 0.11 + s) * Math.cos(z * 0.13 + s * 2) + 0.6 * Math.sin((x + z) * 0.07 + s * 3) + 0.35 * Math.sin(x * 0.31 - z * 0.27 + s * 5);
  const shoreZ = (x: number) => D - 15 + nz(x, 0, 4) * 3;
  const hm = new Float32Array(W * D);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - px) * 0.72,
        dz = (z + 0.5 - pz) * (z < pz ? 0.78 : 1);
      const r = Math.hypot(dx, dz) + nz(x, z, 1) * 2.2;
      // the needle: sheer towards the bay, gentler on the sides and the back
      const steep = 1.25 + 1.3 * Math.max(0, dz / Math.max(1, Math.hypot(dx, dz)));
      let h = r < 13 ? TOP : r < 33 ? TOP - (r - 13) * steep : TOP - 20 * steep - (r - 33) * 0.7;
      // the ridge running back into the headland
      h = Math.max(h, 48 * (1 - z / 32) + nz(x, z, 7) * 3);
      // down to the headland's height at the sides
      h = Math.min(h, 14 + Math.min(x, W - 1 - x) * 2.2 + nz(x, z, 8) * 5 + hash(x, 0, z, seed + 21) * 3);
      // the shore: a rocky cliff falling into the bay
      h = Math.min(h, (shoreZ(x) - z) * 4.2 + nz(x, z, 2) * 2);
      // erosion gullies on the flanks
      h -= Math.max(0, Math.sin(Math.atan2(dz, dx) * 9 + nz(x, z, 3)) - 0.6) * 6 * Math.min(1, r / 25);
      // the back drops to the headland behind
      h = Math.min(h, 16 + z * 2.5 + nz(x, z, 9) * 5 + hash(x, 1, z, seed + 22) * 3);
      hm[x + z * W] = Math.max(0, Math.round(h));
    }
  const hAt = (x: number, z: number) => hm[Math.max(0, Math.min(W - 1, x)) + Math.max(0, Math.min(D - 1, z)) * W];
  const slope = (x: number, z: number) => {
    const h = hAt(x, z);
    return Math.max(Math.abs(hAt(x + 1, z) - h), Math.abs(hAt(x - 1, z) - h), Math.abs(hAt(x, z + 1) - h), Math.abs(hAt(x, z - 1) - h));
  };

  // granite: grey with dark rain streaks and lichen
  const granite: Paint = (x, y, z) => {
    if (z > D - 30 && hash(x, 1, z, seed) < 0.11 && hash(x, y >> 3, z, seed + 1) < 0.75) return C(hash(x, 2, z, seed) < 0.5 ? "#5e5a58" : "#67625f");
    if (z > D - 30 && hash(x >> 1, y >> 2, z >> 1, seed + 9) < 0.06) return C("#7a8460");
    const b = z > D - 30 ? 2 : 3; // fine grain on the face the city sees, broad patches elsewhere
    return [C("#837e7b"), C("#7a7572"), C("#8d8884"), C("#736e6c")][Math.floor(hash(x >> b, y >> b, z >> b, seed + 2) * 4)];
  };
  const shoreRock = shades(["#6a6470", "#625c68", "#726c78"], 2, seed + 3);
  const jungle = shades(["#3f7a3a", "#477f3f", "#36703a", "#4f8a4a", "#5a924f"], 3, seed + 4);
  const canopy = [shades(["#2f6a34", "#36723a", "#2a6030"], 2, seed + 5), shades(["#4f8a46", "#47823f", "#5a9450"], 2, seed + 6), shades(["#5f9a56", "#6aa35c", "#55904d"], 2, seed + 7), shades(["#7a8a52", "#6f8249", "#85935a"], 2, seed + 8)];

  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const h = hm[x + z * W];
      if (!h) continue;
      const s = slope(x, z);
      const low = h < 7;
      m.box(x, 0, z, x + 1, h, z + 1, low ? shoreRock : granite);
      if (!low && s <= 2) m.box(x, Math.max(0, h - 3), z, x + 1, h, z + 1, jungle);
      else if (!low && s <= 3 && hash(x, 5, z, seed) < 0.5) m.set(x, h - 1, z, jungle);
    }
  // boulders along the waterline
  for (let x = 2; x < W - 2; x += 3 + Math.floor(rnd() * 5)) {
    const z = shoreZ(x) + rnd() * 4;
    m.blob(x, 1 + rnd() * 1.5, z, 1.6 + rnd() * 2, shoreRock, 0.3, seed + x);
  }

  // ---- the summit: terrace, pedestal, stairs, lower terrace, the cog train ----------------------
  const stone: Paint = (x, y, z) => {
    // coursed ashlar: a joint every four rows, staggered every six
    if (y % 4 === 0) return C("#b4ac9a");
    if ((x + z + ((y >> 2) & 1) * 3) % 6 === 0) return C("#bdb5a3");
    return [C("#d2cab8"), C("#cbc3b1"), C("#d8d0be")][Math.floor(hash(x >> 1, y >> 2, z >> 1, seed + 11) * 3)];
  };
  const paving = (x: number, _y: number, z: number) => ((x >> 1) + (z >> 1)) % 2 ? C("#c9c1b0") : C("#bfb7a6");
  const white = C("#ece8df");
  /** A retained platform: walls down to the rock, paved, a balustrade round the edge (except `gaps`). */
  const platform = (x0: number, z0: number, x1: number, z1: number, fy: number, gaps: (x: number, z: number) => boolean) => {
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const h = hAt(x, z);
        if (h < fy) m.box(x, Math.max(0, h - 2), z, x + 1, fy, z + 1, stone);
        m.clear(x, fy, z, x + 1, fy + 30, z + 1);
        m.set(x, fy - 1, z, paving(x, fy, z));
        const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
        if (edge && !gaps(x, z)) {
          if ((x + z) % 2 === 0) m.box(x, fy, z, x + 1, fy + 3, z + 1, white);
          m.set(x, fy + 3, z, white);
        }
      }
    // a cornice line round the retaining wall
    for (let x = x0 - 1; x <= x1; x++)
      for (const z of [z0 - 1, z1]) if (hAt(x, z) < fy - 2) m.set(x, fy - 2, z, C("#e0d9c8"));
    for (let z = z0 - 1; z <= z1; z++)
      for (const x of [x0 - 1, x1]) if (hAt(x, z) < fy - 2) m.set(x, fy - 2, z, C("#e0d9c8"));
  };
  // the upper terrace round the statue
  const U = { x0: px - 22, x1: px + 22, z0: 16, z1: 47, fy: TOP };
  // stairs up its west side from the lower terrace
  const S = { z0: 22, z1: 29 };
  const L = { x0: 14, x1: 30, z0: 10, z1: 46, fy: U.fy - (U.x0 - 29) };
  platform(U.x0, U.z0, U.x1, U.z1, U.fy, (x, z) => x === U.x0 && z >= S.z0 && z < S.z1);
  platform(L.x0, L.z0, L.x1, L.z1, L.fy, (x, z) => (x === L.x1 - 1 && z >= S.z0 && z < S.z1) || (z === L.z0 && x >= 17 && x < 24));
  // the stairs: a flight rising one voxel per voxel, walls on both sides
  for (let x = L.x1; x < U.x0; x++) {
    const fy = L.fy + (x - L.x1) + 1;
    for (let z = S.z0 - 1; z <= S.z1; z++) {
      const h = hAt(x, z);
      const side = z === S.z0 - 1 || z === S.z1;
      if (h < fy) m.box(x, Math.max(0, h - 2), z, x + 1, fy, z + 1, side ? stone : C("#b8b09f"));
      m.clear(x, fy, z, x + 1, fy + 20, z + 1);
      m.set(x, fy - 1, z, side ? C("#e0d9c8") : (x & 1 ? C("#cfc7b5") : C("#a8a090")));
      if (side) m.box(x, fy, z, x + 1, fy + 2, z + 1, white);
    }
  }
  // the cog railway: the station on the lower terrace, the track running back into the headland
  {
    const tx0 = 17,
      tx1 = 24;
    // the track down the back on a stone viaduct, as the real one crosses its ravines
    for (let z = 0; z < L.z0 + 1; z++) {
      const fy = Math.round(L.fy - (L.z0 - z) * 2.4);
      const pier = z % 7 < 2;
      const arch = Math.round(2 + 4 * Math.sin((Math.PI * Math.max(0, (z % 7) - 1.5)) / 5.5));
      for (let x = tx0 - 1; x <= tx1; x++) {
        const h = hAt(x, z);
        if (h < fy) m.box(x, pier ? Math.max(0, h - 2) : Math.max(h, fy - arch), z, x + 1, fy, z + 1, (x2, y2, z2) => (y2 >= fy - 2 ? C("#b8ae9c") : paintAt(stone, x2, y2, z2)));
        m.clear(x, fy, z, x + 1, fy + 16, z + 1);
        m.set(x, fy - 1, z, C("#5a5048"));
      }
      for (const x of [tx0 + 1, tx1 - 2]) m.set(x, fy, z, C("#3a3a40"));
      m.set((tx0 + tx1) >> 1, fy, z, z & 1 ? C("#2a2a30") : C("#4a4a50"));
    }
    for (let z = L.z0; z < L.z1 - 2; z++) {
      for (const x of [tx0 + 1, tx1 - 2]) m.set(x, L.fy, z, C("#3a3a40"));
      m.set((tx0 + tx1) >> 1, L.fy, z, z & 1 ? C("#2a2a30") : C("#4a4a50"));
    }
    // the train: two red cars with cream roofs and windows
    const red = shades(["#c0302e", "#b82c2a", "#c83632"], 1, seed + 12);
    for (const [z0, z1] of [
      [L.z0 + 4, L.z0 + 17],
      [L.z0 + 18, L.z0 + 31],
    ]) {
      m.box(tx0, L.fy + 1, z0, tx1, L.fy + 9, z1, red);
      m.box(tx0 + 1, L.fy, z0 + 1, tx1 - 1, L.fy + 1, z1 - 1, C("#1c1c22"));
      for (let z = z0 + 1; z < z1 - 1; z += 3) for (const x of [tx0, tx1 - 1]) m.box(x, L.fy + 5, z, x + 1, L.fy + 8, z + 2, E("#ffd27a", 1.2));
      m.box(tx0, L.fy + 9, z0, tx1, L.fy + 10, z1, C("#ece2cc"));
      m.box(tx0, L.fy + 3, z0, tx1, L.fy + 4, z1, C("#f0e6d0"));
    }
    m.box(tx0 + 2, L.fy + 5, L.z0 + 31, tx1 - 2, L.fy + 7, L.z0 + 32, E("#fff2c8", 2));
    // the station: a roof on posts over the platform
    const roof = C("#a0402c");
    for (const z of [L.z0 + 2, L.z0 + 14, L.z0 + 26])
      for (const x of [tx1 + 1, L.x1 - 2]) m.box(x, L.fy, z, x + 1, L.fy + 12, z + 1, C("#3a3434"));
    for (let i = 0; i < 4; i++) m.box(tx0 - 1 + i, L.fy + 12 + i, L.z0 + 1, L.x1 - 1 - i, L.fy + 13 + i, L.z0 + 28, i === 3 ? C("#c8b8a0") : roof);
    m.box(tx1 + 2, L.fy + 9, L.z0 + 28, L.x1 - 3, L.fy + 11, L.z0 + 29, E("#ffb347", 1.6));
  }

  // ---- the pedestal: plinth steps, the chapel, a cornice ------------------------------------------
  const xc = px,
    zc = 32;
  const sq = (y0: number, y1: number, hw: number, c: Paint) => m.box(xc - hw, y0, zc - hw, xc + hw, y1, zc + hw, c);
  sq(U.fy, U.fy + 1, 13, C("#d8d0be"));
  sq(U.fy + 1, U.fy + 2, 12, C("#cfc7b5"));
  const P0 = U.fy + 2,
    P1 = P0 + 22;
  sq(P0, P1, 10, (x, y, z) => ((y - P0) % 4 === 3 ? C("#bdb5a3") : paintAt(stone, x, y, z)));
  sq(P1, P1 + 2, 11, C("#e4ddcc"));
  sq(P1 + 2, P1 + 3, 10, C("#d8d0be"));
  // the chapel door on the front, an arch, and lit windows on the sides
  for (let x = xc - 3; x < xc + 3; x++) {
    const u = (x + 0.5 - xc) / 3;
    const top = P0 + 8 + Math.round(2 * Math.sqrt(Math.max(0, 1 - u * u)));
    m.box(x, P0, zc + 9, x + 1, top, zc + 10, C("#4a3424"));
    m.set(x, top, zc + 10, C("#efe8d8"));
  }
  m.box(xc - 4, P0 + 12, zc + 10, xc + 4, P0 + 13, zc + 11, C("#efe8d8"));
  for (const s of [-1, 1]) m.box(s < 0 ? xc - 10 : xc + 9, P0 + 6, zc - 2, s < 0 ? xc - 9 : xc + 10, P0 + 12, zc + 2, E("#ffc070", 0.9));

  // ---- the figure -----------------------------------------------------------------------------
  const tone = (ch: string): Paint => (ch === "f" ? E(SNARK1_PALETTE.f, 1.6) : shades(STONE[ch], 3, seed + ch.charCodeAt(0)));
  const colours: Record<string, Paint> = {};
  for (const ch of "abcdef") colours[ch] = tone(ch);
  const art = SNARK1.map((r) => r.split(""));
  for (let j = 9; j <= 18; j++) {
    const last = art[j].lastIndexOf("e");
    if (last >= 0 && art[j][last + 1] === ".") art[j][last + 1] = "c";
  }
  // loose pixels: small 4-connected pieces
  const comp = new Int32Array(26 * 26).fill(-1);
  const compSize: number[] = [];
  for (let j = 0; j < 26; j++)
    for (let i = 0; i < 26; i++) {
      if (art[j][i] === "." || comp[i + j * 26] >= 0) continue;
      const id = compSize.length;
      let n = 0;
      const stack = [[i, j]];
      comp[i + j * 26] = id;
      while (stack.length) {
        const [a, b] = stack.pop()!;
        n++;
        for (const [da, db] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const na = a + da,
            nb = b + db;
          if (na < 0 || nb < 0 || na > 25 || nb > 25 || art[nb][na] === "." || comp[na + nb * 26] >= 0) continue;
          comp[na + nb * 26] = id;
          stack.push([na, nb]);
        }
      }
      compSize.push(n);
    }
  const loose = (i: number, j: number) => compSize[comp[i + j * 26]] <= 3;
  // the bust: the portrait at one voxel per pixel, doubled (two voxels per pixel) so the face reads
  const P = 2;
  const GW = 26 * P;
  const YB = H - 6 - 20 * P; // bottom of the portrait (its row 25)
  const XP = xc - 15 * P; // the face's middle over the body's axis
  const filled = (u: number, v: number) => {
    if (v >= GW) return u >= 5 * P && u < 22 * P;
    if (u < 0 || v < 0 || u >= GW) return false;
    const i = Math.floor(u / P),
      j = Math.floor(v / P);
    return art[j][i] !== "." && !loose(i, j);
  };
  const R = 8;
  const depth = new Float32Array(GW * GW);
  for (let v = 0; v < GW; v++)
    for (let u = 0; u < GW; u++) {
      if (!filled(u, v)) continue;
      let best = R * R;
      for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) if (a * a + b * b < best && !filled(u + a, v + b)) best = a * a + b * b;
      const dd = Math.min(R, Math.sqrt(best) - 0.5);
      depth[u + v * GW] = Math.sqrt(R * R - (R - dd) * (R - dd));
    }
  for (let v = 0; v < GW; v++)
    for (let u = 0; u < GW; u++) {
      const i = Math.floor(u / P),
        j = Math.floor(v / P);
      const ch = art[j][i];
      if (ch === ".") continue;
      const x = XP + u,
        y = YB + (GW - 1 - v);
      if (loose(i, j)) {
        const off = Math.round((hash(i, j, 3, seed) - 0.5) * 12);
        m.box(x, y, zc + off, x + 1, y + 1, zc + off + 2, colours[ch]);
        continue;
      }
      const hd = depth[u + v * GW];
      let front = zc + Math.round(hd);
      const back = zc - Math.round(hd * 0.9);
      if (ch === "e") front -= 4;
      if (ch === "f") front -= 2;
      for (let z = back; z <= front; z++) m.set(x, y, z, z >= front - 1 ? colours[ch] : ch === "e" || ch === "f" ? colours.c : colours[ch]);
    }
  // the robe: a column from the pedestal to the shoulders, vertical folds, a sash at the waist
  const Y0 = P1 + 3;
  const waist = Math.round(Y0 + (YB - Y0) * 0.58);
  for (let y = Y0; y < YB + 4; y++) {
    const t = (y - Y0) / (YB - Y0);
    const rx = 12 + t * 3 + (t < 0.12 ? (0.12 - t) * 22 : 0);
    const rz = 8 + t * 2;
    const sash = Math.abs(y - waist) <= 2;
    for (let z = zc - 14; z < zc + 15; z++)
      for (let x = xc - 22; x < xc + 23; x++) {
        const dx = x + 0.5 - xc,
          dz = z + 0.5 - zc;
        const th = Math.atan2(dz, dx);
        const fold = Math.sin(th * 11 + Math.sin(y * 0.05) * 0.6);
        const rr = Math.sqrt((dx / rx) ** 2 + (dz / rz) ** 2);
        if (rr > 1 + 0.06 * fold + (sash ? 0.1 : 0)) continue;
        if (m.get(x, y, z) && y >= YB) continue;
        let c: Paint;
        if (sash) c = Math.abs(y - waist) === 2 ? colours.c : colours.a;
        else if (fold > 0.75) c = colours.b;
        else if (fold < -0.6) c = colours.a;
        else c = colours.d;
        m.set(x, y, z, c);
      }
  }
  // the sash's knot and hanging ends
  m.box(xc + 4, waist - 9, zc + 9, xc + 7, waist + 2, zc + 11, colours.a);
  // arms outstretched, the sleeves draped from the wrists to the waist
  const capsule = (a: number[], b: number[], r0: number, r1: number, c: Paint) => {
    const lo = [0, 1, 2].map((i) => Math.floor(Math.min(a[i], b[i]) - Math.max(r0, r1) - 1));
    const hi = [0, 1, 2].map((i) => Math.ceil(Math.max(a[i], b[i]) + Math.max(r0, r1) + 1));
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    for (let y = lo[1]; y <= hi[1]; y++)
      for (let z = lo[2]; z <= hi[2]; z++)
        for (let x = lo[0]; x <= hi[0]; x++) {
          const p = [x + 0.5 - a[0], y + 0.5 - a[1], z + 0.5 - a[2]];
          const t = Math.max(0, Math.min(1, (p[0] * ab[0] + p[1] * ab[1] + p[2] * ab[2]) / L2));
          const d2 = (p[0] - ab[0] * t) ** 2 + (p[1] - ab[1] * t) ** 2 + (p[2] - ab[2] * t) ** 2;
          const r = r0 + (r1 - r0) * t;
          if (d2 <= r * r) m.set(x, y, z, c);
        }
  };
  const ys = YB + 3 * P; // shoulder height: the portrait's row 22
  const span = 42;
  for (const s of [-1, 1]) {
    const sx = xc + s * 11,
      wx = xc + s * (span - 3);
    capsule([sx, ys, zc], [xc + s * 26, ys + 1, zc], 5, 4, colours.d);
    capsule([xc + s * 26, ys + 1, zc], [wx, ys + 1, zc + 1], 4, 3, colours.d);
    // the hand: open, palm forward, the thumb up
    m.box(wx + (s > 0 ? 0 : -4), ys - 3, zc - 1, wx + (s > 0 ? 4 : 0), ys + 4, zc + 2, colours.b);
    m.box(wx + (s > 0 ? 1 : -2), ys + 4, zc, wx + (s > 0 ? 2 : -1), ys + 6, zc + 2, colours.b);
    // the sleeve: a drape hanging from the forearm, its hem sloping down to the waist
    for (let ax = 12; ax < span - 6; ax++) {
      const f = (ax - 12) / (span - 18);
      const yb = Math.round(ys - 3 - (1 - f) * (ys - waist - 6) - Math.sin(ax * 0.6) * 0.8);
      const x = xc + s * ax;
      for (let y = yb; y < ys; y++)
        for (let z = zc - 3; z <= zc + 3; z++) {
          if (m.get(x, y, z)) continue;
          const fold = Math.sin(ax * 0.55 + (y - yb) * 0.12);
          m.set(x, y, z, y === yb ? colours.a : fold > 0.7 ? colours.b : fold < -0.6 ? colours.a : colours.d);
        }
    }
  }

  // ---- night: floodlights round the pedestal, lamps on the terraces ------------------------------
  const flood = E("#ffb347", 2.2);
  for (const [fx, fz] of [
    [xc - 15, zc + 15],
    [xc + 14, zc + 15],
    [xc - 15, zc - 16],
    [xc + 14, zc - 16],
    [xc - 1, zc + 16],
  ]) {
    m.box(fx, U.fy, fz, fx + 2, U.fy + 1, fz + 2, C("#2c2a30"));
    m.box(fx, U.fy + 1, fz, fx + 2, U.fy + 2, fz + 2, flood);
  }
  const lamp = (x: number, fy: number, z: number) => {
    m.box(x, fy, z, x + 1, fy + 5, z + 1, C("#2a2830"));
    m.set(x, fy + 5, z, E("#ffb347", 1.8));
  };
  for (const x of [U.x0 + 2, U.x1 - 3]) for (const z of [U.z0 + 2, U.z1 - 3]) lamp(x, U.fy, z);
  lamp(L.x1 - 3, L.fy, L.z1 - 3);
  lamp(L.x1 - 3, L.fy, L.z0 + 31);

  // ---- the jungle: trees on the gentle slopes, palms at the shore, shrubs on the cliffs ----------
  const built = (x: number, z: number) =>
    (x >= U.x0 - 2 && x < U.x1 + 2 && z >= U.z0 - 2 && z < U.z1 + 2) ||
    (x >= L.x0 - 2 && x < U.x0 && z >= L.z0 - 2 && z < L.z1 + 2) ||
    (x >= 14 && x < 28 && z < L.z0);
  for (let i = 0; i < 560; i++) {
    const x = Math.floor(rnd() * W),
      z = Math.floor(rnd() * D);
    const h = hAt(x, z);
    if (h < 8 || built(x, z)) continue;
    const s = slope(x, z);
    if (s > 3 && rnd() > 0.15) continue;
    if (z < D - 34 && rnd() < 0.45) continue;
    const r = s > 3 ? 1.6 + rnd() : z < D - 34 ? 4 + rnd() * 3 : 2.5 + rnd() * 3.5;
    const c = canopy[Math.floor(rnd() * canopy.length)];
    if (r > 3) m.box(x, h, z, x + 1, h + Math.round(r), z + 1, C("#4a3a2c"));
    m.blob(x, h + r * 0.9 + (r > 3 ? 1 : 0), z, r, c, z > D - 30 ? 0.2 : 0.1, seed + i);
  }
  // palms on the low rocks by the water
  for (let i = 0; i < 26; i++) {
    const x = 3 + Math.floor(rnd() * (W - 6));
    const z = Math.round(shoreZ(x) - 3 - rnd() * 6);
    const h = hAt(x, z);
    if (h < 3 || h > 22 || built(x, z)) continue;
    const th = 10 + Math.floor(rnd() * 8);
    const lean = (rnd() - 0.5) * 0.3;
    for (let y = 0; y < th; y++) m.set(x + Math.round(lean * y), h + y, z + Math.round(y * 0.12), C("#7a6448"));
    const tx = x + Math.round(lean * th),
      ty = h + th,
      tz = z + Math.round(th * 0.12);
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 2 + rnd();
      for (let r = 1; r < 6; r++) m.set(tx + Math.cos(ang) * r, ty - Math.floor((r * r) / 9), tz + Math.sin(ang) * r, C(a & 1 ? "#4f8a3a" : "#5f9a46"));
    }
  }
  // the little landing stage at the foot, out over the water
  {
    const x0 = 96,
      x1 = 102;
    const z0 = Math.floor(shoreZ(99)) - 2;
    m.box(x0, 1, z0, x1, 2, D, C("#7a5e44"));
    for (let z = z0 + 1; z < D; z += 4) for (const x of [x0, x1 - 1]) m.box(x, 0, z, x + 1, 3, z + 1, C("#3a2e26"));
    m.set(x0, 5, D - 1, E("#ffb347", 1.8));
    m.box(x0, 2, D - 1, x0 + 1, 5, D, C("#2a2830"));
  }

  const signs: SignSpot[] = [];
  return {
    model: m,
    signs,
    door: [xc, D],
    body: [0, 0, W, D],
    walls: [],
    lights: [
      [xc, U.fy + 4, zc + 20, "#ffd8a0"],
      [xc, ys - 10, zc + 30, "#ffe6c0"],
      [xc - 30, ys + 2, zc + 18, "#ffe6c0"],
      [xc + 30, ys + 2, zc + 18, "#ffe6c0"],
      [22, L.fy + 8, L.z0 + 20, "#ffc070"],
    ],
    points: { head: [xc, YB + 12 * P, zc + 8], terrace: [xc, U.fy, U.z1 - 4] },
    scale: k,
  };
}
