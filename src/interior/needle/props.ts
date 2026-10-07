import { C, E, G, hash, shades, VoxelModel } from "../../scene/voxel/model";

/** The NEEDLE's own voxel furniture (12 voxels a metre, faces +z, centred, standing on y = 0). */

const m = (w: number, h: number, d: number) => new VoxelModel(w, h, d);
const gold = C("#c9a227");
const black = C("#18161e");
const steel = C("#b8bcc6");

/** A coin-operated viewer on a post, eyepieces towards +z (the visitor), lens to -z. */
export function telescope() {
  const v = m(8, 18, 10);
  v.box(2, 0, 3, 6, 1, 7, black);
  v.box(3, 1, 4, 5, 11, 6, steel);
  v.box(2, 10, 4, 6, 11, 6, gold);
  // the head: a fat body with two barrels, a hood over the eyepieces
  v.box(1, 11, 2, 7, 16, 8, C("#1f3a5a"));
  v.box(1, 13, 0, 3, 15, 2, C("#1f3a5a"));
  v.box(5, 13, 0, 7, 15, 2, C("#1f3a5a"));
  v.set(2, 14, 0, G("#9ad8ff"));
  v.set(5, 14, 0, G("#9ad8ff"));
  v.box(1, 13, 8, 7, 16, 10, black);
  v.box(2, 14, 9, 3, 15, 10, E("#3ef0ff", 0.6));
  v.box(5, 14, 9, 6, 15, 10, E("#3ef0ff", 0.6));
  v.box(1, 16, 2, 7, 17, 8, gold);
  v.box(0, 12, 4, 1, 14, 6, steel);
  v.box(7, 12, 4, 8, 14, 6, steel);
  return v;
}

/** A queue post with its retractable belt along +x (`belt` metres). */
export function stanchion(belt: number) {
  const L = Math.round(belt * 12);
  const v = m(L + 3, 12, 3);
  for (const x of [0, L]) {
    v.box(x, 0, 0, x + 3, 1, 3, gold);
    v.box(x + 1, 1, 1, x + 2, 11, 2, gold);
    v.box(x, 11, 0, x + 3, 12, 3, gold);
  }
  v.box(2, 9, 1, L + 1, 10, 2, C("#5a1a2a"));
  return v;
}

/** A walk-through metal detector: two pillars and a header, a green light on top. */
export function detector() {
  const v = m(14, 28, 6);
  v.box(0, 0, 0, 3, 26, 6, C("#d8d8dc"));
  v.box(11, 0, 0, 14, 26, 6, C("#d8d8dc"));
  v.box(0, 24, 0, 14, 28, 6, C("#d8d8dc"));
  v.box(1, 2, 6, 2, 22, 6, (_x, y) => (y % 4 === 0 ? E("#3ee08f", 1.4) : C("#bcbcc4")));
  v.box(12, 2, 6, 13, 22, 6, (_x, y) => (y % 4 === 0 ? E("#3ee08f", 1.4) : C("#bcbcc4")));
  v.box(5, 28, 2, 9, 29, 4, E("#3ee08f", 2));
  return v;
}

/** The X-ray: a belt in, the tunnel with its curtains, a belt out, trays (long along x). */
export function xray() {
  const v = m(40, 18, 12);
  v.box(0, 0, 1, 40, 8, 11, C("#2a2830"));
  v.box(0, 8, 2, 40, 9, 10, C("#1a1a1e"));
  for (let x = 1; x < 40; x += 3) v.box(x, 8, 2, x + 1, 9, 10, C("#3a3a40"));
  v.box(12, 8, 0, 28, 18, 12, C("#d8d8dc"));
  v.box(13, 8, 0, 27, 15, 1, C("#3a3a44"));
  v.box(13, 8, 11, 27, 15, 12, C("#3a3a44"));
  v.box(18, 18, 4, 22, 18, 8, E("#ffb43a", 1));
  for (const x of [2, 31]) {
    v.box(x, 9, 3, x + 7, 10, 9, C("#4a4a54"));
    v.box(x + 1, 10, 4, x + 3, 11, 6, C(["#3a5a8a", "#9a3a3a"][x % 2]));
  }
  // the screen on its arm
  v.box(29, 9, 0, 30, 16, 1, black);
  v.box(28, 16, 0, 36, 21, 1, black);
  return v;
}

/** A date palm in a gold-rimmed planter, about 4.5 m. */
export function palmTree(seed = 1) {
  const v = m(36, 58, 36);
  v.box(12, 0, 12, 24, 8, 24, C("#2a2630"));
  v.box(12, 7, 12, 24, 8, 24, gold);
  v.box(13, 7, 13, 23, 8, 23, C("#3a2a20"));
  const bark = shades(["#7a6448", "#6a5640", "#86704f"], 1, seed);
  for (let y = 8; y < 44; y++) {
    const off = Math.round(Math.sin(y * 0.06 + seed) * 1.5);
    v.box(17 + off, y, 17, 19 + off, y + 1, 19, y % 3 === 0 ? C("#5a4834") : bark);
  }
  const frond = shades(["#3d7a3a", "#2f6a30", "#4a8a40"], 1, seed + 3);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + hash(i, seed, 2) * 0.4;
    for (let s = 0; s < 16; s++) {
      const t = s / 16;
      const yy = 45 + Math.round(Math.sin(t * Math.PI * 0.7) * 5 - t * t * 10);
      const x = 18 + Math.cos(a) * s,
        z = 18 + Math.sin(a) * s;
      v.box(x, yy, z, x + 1, yy + 1, z + 1, frond);
      if (s > 2 && s < 13) v.box(x - Math.sin(a), yy - 1, z + Math.cos(a), x - Math.sin(a) + 1, yy, z + Math.cos(a) + 1, frond);
    }
  }
  v.box(16, 42, 16, 21, 45, 21, C("#4a6a2a"));
  for (let i = 0; i < 6; i++) v.set(16 + hash(i, 1, seed) * 5, 41, 16 + hash(i, 2, seed) * 5, C("#c07a2a"));
  return v;
}

/** A restaurant table for two or four, white cloth to the floor, a candle and a rose. */
export function clothTable(four = false) {
  const W = four ? 14 : 10;
  const v = m(W, 12, 10);
  v.box(0, 0, 0, W, 9, 10, shades(["#f4f0e8", "#ece6da"], 2, 3));
  v.box(0, 9, 0, W, 10, 10, C("#faf6ee"));
  for (const x of four ? [2, 10] : [4]) {
    v.box(x, 10, 1, x + 2, 10, 3, C("#e8e4dc"));
    v.box(x, 10, 7, x + 2, 10, 9, C("#e8e4dc"));
    v.set(x + 2, 10, 2, steel);
    v.set(x + 2, 10, 8, steel);
    v.box(x + 2, 10, 3, x + 3, 12, 4, G("#e8f0f8"));
  }
  v.box(W / 2, 10, 4, W / 2 + 1, 11, 5, gold);
  v.set(W / 2, 11, 4, E("#ffb060", 2.4));
  v.set(W / 2 - 1, 10, 6, C("#c8203a"));
  v.set(W / 2 - 1, 11, 6, C("#c8203a"));
  return v;
}

/** A dining chair in velvet with a gold frame (faces +z). */
export function velvetChair(color: string) {
  const v = m(6, 12, 6);
  v.box(0, 0, 0, 1, 5, 1, gold);
  v.box(5, 0, 0, 6, 5, 1, gold);
  v.box(0, 0, 5, 1, 5, 6, gold);
  v.box(5, 0, 5, 6, 5, 6, gold);
  v.box(0, 5, 0, 6, 6, 6, shades([color], 1, 2));
  v.box(0, 6, 0, 6, 12, 1, shades([color], 1, 3));
  v.box(0, 11, 0, 6, 12, 1, gold);
  return v;
}

/** The lift doors of the lobby: bronze leaves in a gold frame, a call button panel at the side. */
export function liftDoor() {
  const v = m(24, 34, 3);
  v.box(0, 0, 0, 24, 34, 1, C("#2a2228"));
  v.box(1, 0, 1, 23, 32, 2, gold);
  v.box(2, 0, 1, 22, 30, 3, (x, y) => (x === 12 ? C("#3a2a18") : y % 6 === 0 ? C("#a0824a") : C("#b89a5a")));
  v.box(4, 31, 2, 20, 33, 3, black);
  return v;
}

/** A tall glass vitrine on a plinth with a lit base (for the tower's scale model). */
export function plinth(r: number) {
  const W = Math.round(r * 24);
  const v = m(W, 10, W);
  v.box(0, 0, 0, W, 9, W, shades(["#1a1820", "#201e26"], 1, 4));
  v.box(0, 9, 0, W, 10, W, gold);
  v.box(1, 1, W - 1, W - 1, 2, W, E("#ffd28a", 1.6));
  v.box(1, 1, 0, W - 1, 2, 1, E("#ffd28a", 1.6));
  return v;
}

/** A champagne trolley: ice bucket, flutes. */
export function champagneCart() {
  const v = m(10, 12, 6);
  v.box(0, 0, 0, 1, 10, 1, gold);
  v.box(9, 0, 0, 10, 10, 1, gold);
  v.box(0, 0, 5, 1, 10, 6, gold);
  v.box(9, 0, 5, 10, 10, 6, gold);
  v.box(0, 4, 0, 10, 5, 6, C("#2a2228"));
  v.box(0, 9, 0, 10, 10, 6, C("#2a2228"));
  v.box(1, 10, 1, 5, 13, 5, steel);
  v.box(2, 12, 2, 3, 16, 3, C("#1a4a2a"));
  v.box(2, 15, 2, 3, 16, 3, gold);
  for (const x of [6, 8]) v.box(x, 10, 2, x + 1, 13, 3, G("#f4e8b0"));
  return v;
}

/** A low lounge sofa in leather, `seats` wide (faces +z). */
export function loungeSofa(color: string, seats = 3) {
  const W = seats * 8 + 2;
  const v = m(W, 9, 10);
  v.box(0, 0, 0, W, 1, 10, black);
  v.box(0, 1, 0, W, 4, 10, shades([color], 1, 2));
  v.box(0, 4, 0, W, 9, 3, shades([color], 1, 3));
  v.box(0, 4, 0, 1, 6, 10, shades([color], 1, 3));
  v.box(W - 1, 4, 0, W, 6, 10, shades([color], 1, 3));
  v.box(0, 0, 9, W, 1, 10, gold);
  return v;
}

/** A round brass side table with a lamp. */
export function sideLamp() {
  const v = m(6, 14, 6);
  v.box(1, 0, 1, 5, 1, 5, gold);
  v.box(2, 1, 2, 4, 7, 4, gold);
  v.box(0, 7, 0, 6, 8, 6, C("#2a2228"));
  v.box(2, 8, 2, 4, 10, 4, gold);
  v.box(1, 10, 1, 5, 14, 5, E("#ffe2b0", 1));
  return v;
}

/** A freestanding bathtub in white stone, oval-ish (long along x). */
export function stoneTub() {
  const v = m(22, 8, 11);
  for (let x = 0; x < 22; x++)
    for (let z = 0; z < 11; z++) {
      const dx = (x - 10.5) / 11,
        dz = (z - 5) / 5.6;
      if (dx * dx + dz * dz > 1) continue;
      v.box(x, 0, z, x + 1, 7, z + 1, C("#f2eee6"));
      if (dx * dx + dz * dz < 0.7) v.box(x, 4, z, x + 1, 7, z + 1, G("#9ad8f0"));
    }
  v.box(19, 7, 4, 20, 9, 6, gold);
  return v;
}
