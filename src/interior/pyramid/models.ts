import { C, E, hash, shades, VoxelModel } from "../../scene/voxel/model";

/**
 * Voxel props for the pyramid at the furniture's 12 voxels a metre (`place` from furniture.ts):
 * every model faces +z, stands on y = 0 and is centred on x and z.
 */

const m = (w: number, h: number, d: number) => new VoxelModel(w, h, d);
const linen = (seed = 1) => shades(["#cfc2a0", "#bfb08c", "#d9ceb0", "#a89a78"], 1, seed);

/** A mummy: wrapped in banded linen, arms out in front, a loose strip hanging, eyes aglow. */
export function mummy(eyes = "#9dff5a", seed = 1) {
  const v = m(9, 22, 9);
  const L = linen(seed);
  const band = C("#9a8a68");
  // legs, wrapped together at the ankles
  v.box(2, 0, 3, 4, 9, 6, L);
  v.box(5, 0, 3, 7, 9, 6, L);
  v.box(2, 0, 3, 7, 2, 6, L);
  // torso and shoulders
  v.box(1, 9, 2, 8, 17, 7, L);
  v.box(0, 15, 2, 9, 17, 7, L);
  // the wraps: darker bands that spiral (offset per row)
  for (let y = 0; y < 17; y += 2) for (let x = 0; x < 9; x++) for (let z = 0; z < 9; z++) if (v.get(x, y, z) && (x + z + y) % 5 === 0) v.set(x, y, z, band);
  // arms straight out in front
  v.box(0, 13, 6, 2, 15, 9, L);
  v.box(7, 13, 6, 9, 15, 9, L);
  v.box(0, 13, 4, 2, 15, 6, L);
  v.box(7, 13, 4, 9, 15, 6, L);
  // head
  v.box(2, 17, 2, 7, 22, 7, L);
  v.box(2, 19, 6, 7, 20, 7, C("#1a120a"));
  v.set(3, 19, 6, E(eyes, 2.6));
  v.set(5, 19, 6, E(eyes, 2.6));
  // a loose strip of linen trailing from an arm, and one at the hip
  v.box(8, 9, 7, 9, 13, 8, L);
  v.box(1, 5, 6, 2, 10, 7, L);
  return v;
}

/** Wall torch: an iron bracket and a wooden haft with a pitch-soaked head (the flame is separate). */
export function torch() {
  const v = m(3, 9, 4);
  const iron = C("#2a2622");
  v.box(1, 2, 0, 2, 3, 3, iron);
  v.box(0, 1, 0, 3, 2, 1, iron);
  v.box(1, 0, 2, 2, 7, 3, shades(["#5a3a20", "#4a2e18"], 1, 2));
  v.box(0, 6, 1, 3, 9, 4, C("#1e140c"));
  return v;
}

/** Clay storage jar with a painted band (or a squat one). */
export function jar(seed = 1, tall = true) {
  const H = tall ? 11 : 7,
    v = m(7, H, 7);
  const clay = shades(["#9a5a34", "#8a5030", "#a46640"], 1, seed);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const r = y === H - 1 ? 1.6 : 1.8 + Math.sin(t * Math.PI) * 1.7;
    for (let z = 0; z < 7; z++) for (let x = 0; x < 7; x++) if ((x - 3) ** 2 + (z - 3) ** 2 <= r * r) v.set(x, y, z, y === Math.round(H * 0.6) ? C(seed % 2 ? "#2f5f9e" : "#1e1a14") : clay);
  }
  v.box(2, H - 1, 2, 5, H, 5, C("#3a2214"));
  return v;
}

/** A small pile of sand drifted in. */
export function sand(seed = 1, w = 14, d = 10) {
  const v = m(w, 4, d);
  const S = shades(["#d8b880", "#ccac74", "#e2c48c"], 1, seed);
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) {
      const dd = Math.hypot((x - w / 2) / (w / 2), (z - d / 2) / (d / 2));
      const h = Math.round((1 - dd) * 4 + hash(x, z, seed) * 0.8);
      for (let y = 0; y < h; y++) v.set(x, y, z, S);
    }
  return v;
}

/** An unlucky explorer from an earlier expedition: bones, a pith helmet, a lantern gone out. */
export function skeleton() {
  const v = m(22, 5, 12);
  const bone = shades(["#e8e0cc", "#d8cfb8"], 1, 3);
  // lying along x: skull, spine, ribs, pelvis, limbs
  v.box(1, 0, 4, 5, 3, 8, bone);
  v.set(2, 1, 8, C("#1a1410"));
  v.set(3, 1, 8, C("#1a1410"));
  v.box(5, 0, 5, 14, 1, 7, bone);
  for (let x = 6; x < 12; x += 2) v.box(x, 0, 3, x + 1, 2, 9, bone);
  v.box(13, 0, 4, 16, 2, 8, bone);
  v.box(16, 0, 3, 22, 1, 4, bone);
  v.box(16, 0, 8, 21, 1, 9, bone);
  v.box(6, 0, 10, 11, 1, 11, bone);
  // pith helmet beside the skull
  v.box(0, 0, 0, 6, 1, 4, C("#c8b890"));
  v.box(1, 1, 0, 5, 3, 3, C("#d8c8a0"));
  // a lantern on its side
  v.box(17, 0, 10, 21, 3, 12, C("#3a3028"));
  v.box(18, 1, 10, 20, 2, 11, C("#6a7a7a"));
  return v;
}

/** Granite sarcophagus, lidless, as found: chipped corners, a corner broken off. */
export function sarcophagus() {
  const v = m(14, 13, 27);
  const G = shades(["#8a5a52", "#7a4e48", "#6a4440", "#946660"], 1, 5);
  v.box(0, 0, 0, 14, 13, 27, G);
  v.clear(2, 3, 2, 12, 13, 25);
  v.clear(12, 10, 0, 14, 13, 3);
  v.set(0, 12, 26, 0);
  v.set(13, 12, 14, 0);
  return v;
}

/** Its heavy lid, propped against the wall. */
export function lid() {
  const v = m(14, 27, 3);
  v.box(0, 0, 0, 14, 27, 3, shades(["#8a5a52", "#7a4e48", "#946660"], 1, 6));
  return v;
}

/**
 * The TREASURE: a gold-plated chest, lid thrown open, spilling coins, the ⓩ on its front and the
 * glow of gold inside.
 */
export function chest() {
  const v = m(16, 16, 11);
  const gold = shades(["#f4b728", "#e0a418", "#ffd060"], 1, 7);
  const dark = C("#5a3a10");
  const wood = shades(["#6a3a1c", "#5a3018"], 1, 2);
  v.box(0, 0, 0, 16, 8, 11, wood);
  // gold bands and corners
  for (const x of [0, 4, 11, 15]) v.box(x, 0, 0, x + 1, 8, 11, gold);
  v.box(0, 0, 0, 16, 1, 11, gold);
  v.box(0, 7, 0, 16, 8, 11, gold);
  // ⓩ on the front
  const z = C("#ffe08a");
  v.box(6, 2, 11, 10, 3, 11, z);
  v.box(6, 5, 11, 10, 6, 11, z);
  v.set(7, 3, 11, z);
  v.set(8, 4, 11, z);
  v.set(8, 1, 11, z);
  v.set(7, 6, 11, z);
  v.box(6, 2, 10, 10, 3, 11, z);
  v.box(6, 5, 10, 10, 6, 11, z);
  v.box(7, 3, 10, 8, 4, 11, z);
  v.box(8, 4, 10, 9, 5, 11, z);
  // hollow, heaped with glowing coins
  v.clear(1, 3, 1, 15, 8, 10);
  for (let x = 1; x < 15; x++)
    for (let zz = 1; zz < 10; zz++) {
      const h = 6 + Math.round(Math.sin(x * 0.4) + Math.cos(zz * 0.6) + hash(x, zz, 3) * 1.6);
      for (let y = 3; y < Math.min(10, h + 1); y++) v.set(x, y, zz, y >= h - 1 ? E(hash(x, zz, y) > 0.5 ? "#ffc23a" : "#f4a820", 1.6) : gold);
    }
  // the lid, open and leaning back
  for (let y = 8; y < 16; y++) v.box(0, y, Math.max(0, 0 - (y - 8)), 16, y + 1, 2, y % 3 === 0 ? gold : wood);
  v.box(0, 8, 0, 16, 16, 1, wood);
  for (const x of [0, 4, 11, 15]) v.box(x, 8, 0, x + 1, 16, 1, gold);
  v.box(0, 15, 0, 16, 16, 2, gold);
  // the lock hasp
  v.box(7, 6, 11, 9, 8, 11, dark);
  return v;
}

/** A gilded anthropoid coffin standing upright (a zkSNARK's painted face, blue-and-gold nemes). */
export function coffin(seed = 1) {
  const v = m(10, 24, 6);
  const gold = shades(["#e0a418", "#f4b728", "#c8901a"], 1, seed);
  const blue = C("#2a4f8e");
  for (let y = 0; y < 24; y++) {
    const r = y < 16 ? 3 + y * 0.12 : 4.8;
    for (let x = 0; x < 10; x++) if (Math.abs(x + 0.5 - 5) <= r) v.box(x, y, 0, x + 1, y + 1, 5, gold);
  }
  // nemes headdress stripes
  for (let y = 16; y < 24; y++) for (let x = 0; x < 10; x++) if (v.get(x, y, 4) && (x < 3 || x > 6 || y > 21) && y % 2 === 0) v.box(x, y, 0, x + 1, y + 1, 5, blue);
  // the face: square, pixel eyes (a zkSNARK)
  v.box(3, 17, 4, 7, 22, 6, C("#d8a868"));
  v.set(4, 20, 5, C("#111111"));
  v.set(5, 20, 5, C("#111111"));
  v.box(4, 18, 5, 6, 19, 6, C("#8a4a2a"));
  // crossed arms with crook and flail
  v.box(2, 12, 5, 8, 14, 6, C("#c8901a"));
  v.box(3, 10, 5, 4, 15, 6, blue);
  v.box(6, 10, 5, 7, 15, 6, C("#a8382a"));
  // a broad collar
  for (let x = 2; x < 8; x++) v.set(x, 15, 5, x % 2 ? blue : C("#3f7f5a"));
  return v;
}

/** A bronze brazier on a tripod, its coals lit. */
export function brazier() {
  const v = m(9, 13, 9);
  const bronze = C("#6a4a24");
  for (const [x, z] of [
    [1, 1],
    [7, 1],
    [4, 7],
  ])
    v.box(x, 0, z, x + 1, 8, z + 1, bronze);
  v.box(0, 8, 0, 9, 10, 9, bronze);
  v.box(1, 9, 1, 8, 10, 8, E("#ff6a1a", 2.2));
  v.box(2, 10, 2, 7, 11, 7, E("#ff8a2a", 2.4));
  v.box(3, 11, 3, 6, 12, 6, E("#ffb03a", 2.6));
  return v;
}

/** Stone statue of a zebra-headed guardian on a plinth (the labyrinth's door wardens). */
export function guardian(seed = 1) {
  const v = m(14, 46, 14);
  const stone = shades(["#c8a878", "#bc9c6c", "#d2b284"], 1, seed);
  const black = C("#1e1a16");
  v.box(0, 0, 0, 14, 8, 14, stone);
  v.box(1, 8, 1, 13, 9, 13, C("#a88a5c"));
  // standing figure: kilt, torso, arms down, striped zebra head with tall ears
  v.box(4, 9, 4, 6, 22, 9, stone);
  v.box(8, 9, 4, 10, 22, 9, stone);
  v.box(3, 18, 3, 11, 24, 10, C("#e8dcc0"));
  v.box(3, 24, 4, 11, 33, 9, stone);
  v.box(1, 24, 5, 3, 33, 8, stone);
  v.box(11, 24, 5, 13, 33, 8, stone);
  v.box(2, 32, 4, 12, 34, 9, C("#2f5f9e"));
  v.box(5, 34, 5, 9, 36, 8, stone);
  // the head, long muzzle pointing forward
  v.box(4, 36, 3, 10, 42, 10, C("#e8e0d0"));
  v.box(5, 36, 10, 9, 39, 13, C("#e8e0d0"));
  v.box(5, 36, 12, 9, 38, 13, black);
  for (let y = 36; y < 42; y += 2) v.paint(4, y, 3, 10, y + 1, 13, black);
  v.box(4, 42, 5, 6, 46, 7, C("#e8e0d0"));
  v.box(8, 42, 5, 10, 46, 7, C("#e8e0d0"));
  v.box(4, 40, 3, 10, 46, 5, black);
  v.set(4, 39, 8, E("#f4b728", 2));
  v.set(9, 39, 8, E("#f4b728", 2));
  // a ⓩ disk held to the chest
  v.box(5, 27, 9, 9, 31, 10, C("#f4b728"));
  return v;
}
