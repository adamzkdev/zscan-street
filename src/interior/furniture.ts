import * as THREE from "three";
import { toObject } from "../scene/voxel/mesher";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../scene/voxel/model";

/**
 * Voxel furniture for the walk-in places, in the city's own voxel style (greedy-meshed, ambient
 * occlusion in the corners) but twice as fine: 12 voxels a metre. Every model faces +z, stands on
 * y = 0 and is centred on x and z. Models are built once per variant and shared; `place` drops a
 * copy into a group.
 */
export const FINE = 12;
const S = 1 / 2; // a 6-per-metre mesher, so a 12-per-metre model is drawn at half size

const cache = new Map<string, THREE.Object3D>();
function made(key: string, build: () => VoxelModel) {
  let o = cache.get(key);
  if (!o) {
    o = toObject(build(), { shadows: false });
    o.scale.setScalar(S);
    cache.set(key, o);
  }
  return o;
}

/** Put a piece of furniture at (x, y, z), turned `rot` about y. Returns the copy. */
export function place(parent: THREE.Object3D, key: string, build: () => VoxelModel, x: number, y: number, z: number, rot = 0) {
  const o = made(key, build).clone();
  o.position.set(x, y, z);
  o.rotation.y = rot;
  parent.add(o);
  return o;
}

const wood = (seed = 1) => shades(["#7a5236", "#724c32", "#80583a"], 2, seed);
const darkWood = (seed = 2) => shades(["#4a3020", "#442c1e", "#503424"], 2, seed);
const metal = C("#b8bcc6");
const black = C("#18161e");
const white = C("#ece8e0");
const fabric = (hex: string, seed = 3) => shades([hex, shadeOf(hex, -0.02), shadeOf(hex, 0.02)], 3, seed);
function shadeOf(hex: string, k: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return `#${new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k))).getHexString()}`;
}
const m = (w: number, h: number, d: number) => new VoxelModel(w, h, d);

// ---- seating ------------------------------------------------------------------------------------

/** A sofa `seats` cushions wide: plinth, seat cushions with seams, back cushions, arms, pillows. */
export function sofa(color: string, seats = 3, pillow = "#e8d8b0") {
  const W = 8 + seats * 9,
    v = m(W, 11, 11);
  const f = fabric(color);
  v.box(1, 0, 1, W - 1, 1, 10, darkWood());
  v.box(0, 1, 0, W, 4, 11, f);
  for (let k = 0; k < seats; k++) {
    const x0 = 4 + k * 9;
    v.box(x0, 4, 1, x0 + 9, 6, 10, fabric(shadeOf(color, 0.04), k));
    v.box(x0 + 8, 4, 1, x0 + 9, 6, 10, fabric(shadeOf(color, -0.1)));
    v.box(x0, 6, 0, x0 + 9, 11, 3, fabric(shadeOf(color, 0.02), k + 5));
  }
  v.box(0, 4, 0, 4, 8, 11, f);
  v.box(W - 4, 4, 0, W, 8, 11, f);
  v.box(5, 6, 3, 9, 9, 4, C(pillow));
  v.box(W - 9, 6, 3, W - 5, 9, 4, C(shadeOf(pillow, -0.15)));
  for (const x of [1, W - 2]) for (const z of [1, 9]) v.box(x, 0, z, x + 1, 1, z + 1, black);
  return v;
}

export function armchair(color: string) {
  const v = m(11, 11, 11);
  const f = fabric(color);
  v.box(0, 1, 0, 11, 4, 11, f);
  v.box(2, 4, 1, 9, 6, 10, fabric(shadeOf(color, 0.05)));
  v.box(0, 4, 0, 11, 11, 3, f);
  v.box(0, 4, 0, 2, 7, 11, f);
  v.box(9, 4, 0, 11, 7, 11, f);
  for (const x of [1, 9]) for (const z of [1, 9]) v.box(x, 0, z, x + 1, 1, z + 1, darkWood());
  return v;
}

/** A dining or office chair: four legs, a seat, a back. */
export function chair(color: string, office = false) {
  const v = m(6, 12, 6);
  if (office) {
    v.box(2, 0, 2, 4, 1, 4, black);
    for (const [x, z] of [[0, 2], [5, 2], [2, 0], [2, 5]]) v.box(x, 0, z, x + 1, 1, z + 1, black);
    v.box(2, 1, 2, 4, 5, 4, metal);
  } else for (const [x, z] of [[0, 0], [5, 0], [0, 5], [5, 5]]) v.box(x, 0, z, x + 1, 5, z + 1, darkWood());
  v.box(0, 5, 0, 6, 6, 6, C(color));
  v.box(0, 6, 0, 6, 12, 1, C(shadeOf(color, -0.08)));
  return v;
}

export function stool(color: string) {
  const v = m(5, 9, 5);
  v.box(2, 0, 2, 3, 8, 3, metal);
  v.box(1, 0, 1, 4, 1, 4, metal);
  v.box(0, 8, 0, 5, 9, 5, C(color));
  return v;
}

// ---- tables and storage -------------------------------------------------------------------------

export function coffeeTable() {
  const v = m(14, 5, 8);
  v.box(0, 4, 0, 14, 5, 8, wood());
  v.box(1, 1, 1, 13, 2, 7, darkWood());
  for (const [x, z] of [[0, 0], [13, 0], [0, 7], [13, 7]]) v.box(x, 0, z, x + 1, 4, z + 1, darkWood());
  // a couple of books and a mug
  v.box(2, 5, 2, 6, 6, 5, C("#3a6ea5"));
  v.box(2, 6, 2, 5, 7, 5, C("#b0413e"));
  v.box(10, 5, 3, 11, 7, 4, white);
  return v;
}

export function diningTable(seats = 4) {
  const W = seats > 4 ? 22 : 16,
    v = m(W, 9, 10);
  v.box(0, 8, 0, W, 9, 10, wood(4));
  for (const [x, z] of [[1, 1], [W - 2, 1], [1, 8], [W - 2, 8]]) v.box(x, 0, z, x + 1, 8, z + 1, darkWood());
  // place settings and a bowl of fruit
  for (let k = 0; k < seats / 2; k++) for (const z of [1, 7]) v.box(2 + k * 6, 9, z, 5 + k * 6, 9, z + 2, white);
  v.box(W / 2 - 2, 9, 4, W / 2 + 2, 10, 6, C("#d9a441"));
  v.set(W / 2 - 1, 10, 5, C("#d0503a"));
  v.set(W / 2 + 1, 10, 5, C("#3ea04a"));
  return v;
}

export function bookshelf(seed = 1, w = 14) {
  const v = m(w, 24, 5);
  v.box(0, 0, 0, w, 24, 5, darkWood(seed));
  const books = ["#b0413e", "#3a6ea5", "#d9a441", "#2f7d5b", "#6b4c9a", "#c76b2d", "#e8e0cf", "#2a2a35"];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y0 = 1 + shelf * 6;
    v.clear(1, y0, 1, w - 1, y0 + 5, 5);
    for (let x = 1; x < w - 1; x++) {
      if (hash(x, shelf, seed) < 0.12) continue;
      const hgt = 3 + Math.floor(hash(x, shelf, seed, 2) * 2);
      v.box(x, y0, 1, x + 1, y0 + hgt, 4, C(books[Math.floor(hash(x, shelf, seed, 3) * books.length)]));
    }
    if (shelf === 2) v.box(w - 4, y0, 2, w - 2, y0 + 2, 4, C("#3ea04a"));
  }
  return v;
}

export function wardrobe(color = "#d8d0c4") {
  const v = m(16, 26, 7);
  v.box(0, 0, 0, 16, 26, 7, C(color));
  v.box(7, 1, 6, 8, 25, 7, C(shadeOf(color, -0.2)));
  v.box(5, 11, 7, 6, 15, 7, metal);
  v.box(10, 11, 7, 11, 15, 7, metal);
  return v;
}

export function nightstand() {
  const v = m(6, 14, 5);
  v.box(0, 0, 0, 6, 6, 5, wood(7));
  v.box(1, 3, 5, 5, 3, 5, darkWood());
  v.set(3, 4, 5, metal);
  // a lamp: base, stem, glowing shade
  v.box(2, 6, 2, 4, 7, 4, black);
  v.box(3, 7, 3, 3, 10, 3, metal);
  v.box(1, 10, 1, 5, 13, 5, C("#e8dcc0"));
  v.box(2, 9, 2, 4, 10, 4, E("#ffe2b0", 0.8));
  return v;
}

export function tvUnit(w = 20) {
  const v = m(w, 6, 6);
  v.box(0, 1, 0, w, 6, 6, darkWood(5));
  v.box(1, 2, 6, w - 1, 5, 6, wood(5));
  for (let x = w / 2 - 1; x <= w / 2; x++) v.set(x, 3, 6, black);
  v.box(1, 0, 1, 2, 1, 2, black);
  v.box(w - 2, 0, 1, w - 1, 1, 2, black);
  // a console with a blue light, a small speaker
  v.box(2, 6, 1, 6, 7, 4, white);
  v.set(3, 7, 3, E("#3ef0ff", 2));
  v.box(w - 4, 6, 1, w - 2, 9, 3, black);
  return v;
}

/** A double bed: headboard with padding, frame, mattress, duvet folded back, pillows. */
export function bed(color: string, accent = "#e8e2f0") {
  const v = m(20, 14, 26);
  v.box(0, 0, 0, 20, 4, 26, darkWood(8));
  v.box(0, 0, 0, 20, 14, 2, darkWood(8));
  for (let x = 1; x < 19; x += 3) v.box(x, 6, 2, x + 2, 13, 3, fabric(shadeOf(color, -0.1)));
  v.box(1, 4, 2, 19, 6, 25, C(accent));
  v.box(1, 6, 9, 19, 7, 25, fabric(color));
  v.box(1, 6, 8, 19, 8, 10, C(shadeOf(accent, -0.08)));
  v.box(0, 3, 10, 1, 7, 25, fabric(color));
  v.box(19, 3, 10, 20, 7, 25, fabric(color));
  v.box(2, 6, 3, 9, 8, 7, white);
  v.box(11, 6, 3, 18, 8, 7, white);
  return v;
}

// ---- kitchen and bathroom -----------------------------------------------------------------------

/** A run of kitchen units `len` metres long: doors and handles, worktop, sink, hob, wall units, hood. */
export function kitchen(len: number, color: string, top = "#2a2830") {
  const W = Math.round(len * FINE),
    v = m(W, 28, 8);
  const body = C(color),
    seam = C(shadeOf(color, -0.18));
  v.box(0, 0, 0, W, 10, 7, body);
  v.box(0, 0, 6, W, 1, 7, black);
  v.box(0, 10, 0, W, 11, 8, C(top));
  for (let x = 0; x < W; x += 7) {
    v.box(x, 1, 7, x + 1, 10, 7, seam);
    v.box(x + 3, 8, 7, x + 5, 8, 8, metal);
  }
  // the splashback in tiles, the wall units with their handles, the hood
  v.box(0, 11, 0, W, 17, 1, (x, y) => C(((x >> 1) + (y >> 1)) % 2 ? "#e4e8ec" : "#dbe2e8"));
  v.box(0, 17, 0, W, 26, 4, body);
  for (let x = 0; x < W; x += 7) {
    v.box(x, 17, 4, x + 1, 26, 4, seam);
    v.box(x + 3, 18, 4, x + 5, 18, 5, metal);
  }
  const sink = Math.round(W * 0.25),
    hob = Math.round(W * 0.62);
  v.clear(sink - 3, 10, 2, sink + 3, 11, 7);
  v.box(sink - 3, 9, 2, sink + 3, 10, 7, metal);
  v.box(sink, 11, 1, sink + 1, 14, 2, metal);
  v.box(sink, 13, 2, sink + 1, 14, 4, metal);
  v.box(hob - 4, 11, 1, hob + 4, 11, 7, black);
  for (const [dx, dz] of [[-2, 2], [2, 2], [-2, 5], [2, 5]]) v.set(hob + dx, 11, dz, C("#3a2a2a"));
  v.box(hob - 4, 21, 0, hob + 4, 23, 6, metal);
  v.box(hob - 3, 20, 0, hob + 3, 21, 5, metal);
  v.box(hob - 4, 1, 7, hob + 4, 7, 7, black);
  v.box(hob - 3, 2, 7, hob + 3, 6, 7, G("#2a2a30"));
  return v;
}

export function fridge() {
  const v = m(9, 23, 8);
  v.box(0, 0, 0, 9, 23, 8, shades(["#c8ccd4", "#c0c4cc"], 1, 4));
  v.box(0, 14, 8, 9, 14, 8, C("#9aa0aa"));
  v.box(7, 15, 8, 8, 21, 9, metal);
  v.box(7, 4, 8, 8, 12, 9, metal);
  v.set(2, 20, 8, E("#3ef0ff", 1.6));
  return v;
}

export function toilet() {
  const v = m(5, 10, 8);
  v.box(1, 0, 3, 4, 4, 7, white);
  v.box(0, 4, 2, 5, 5, 8, white);
  v.box(1, 5, 3, 4, 5, 7, C("#cfd8e0"));
  v.box(0, 4, 0, 5, 10, 2, white);
  v.box(1, 10, 0, 4, 10, 2, white);
  v.set(2, 10, 1, metal);
  return v;
}

/** The washbasin on its cabinet, a mirror lit from above. */
export function vanity(color: string) {
  const v = m(12, 26, 6);
  v.box(0, 0, 0, 12, 10, 6, C(color));
  v.box(5, 1, 6, 6, 9, 6, C(shadeOf(color, -0.2)));
  v.box(0, 10, 0, 12, 11, 6, white);
  v.clear(3, 10, 2, 9, 11, 5);
  v.box(3, 9, 2, 9, 10, 5, C("#dfe6ec"));
  v.box(6, 11, 0, 7, 13, 2, metal);
  v.box(1, 13, 0, 11, 24, 1, G("#b8c4d0"));
  v.box(1, 24, 0, 11, 25, 2, E("#f4f0e8", 1.2));
  return v;
}

export function bathtub() {
  const v = m(9, 7, 20);
  v.box(0, 0, 0, 9, 7, 20, white);
  v.clear(1, 2, 1, 8, 7, 19);
  v.box(1, 2, 1, 8, 4, 19, G("#7fc8e0"));
  v.box(4, 7, 1, 5, 9, 2, metal);
  return v;
}

// ---- plants and decor -----------------------------------------------------------------------------

/** A potted plant: monstera, ficus or a cactus. */
export function plant(kind: "monstera" | "ficus" | "cactus", seed = 1) {
  const v = m(9, kind === "ficus" ? 22 : 15, 9);
  v.box(2, 0, 2, 7, 4, 7, C(kind === "cactus" ? "#c86a3a" : "#2a2630"));
  v.box(2, 4, 2, 7, 4, 7, C("#4a3020"));
  const leaf = shades(["#2f8a4a", "#3a9a52", "#287a40"], 1, seed);
  if (kind === "cactus") {
    v.box(3, 4, 3, 6, 13, 6, shades(["#3a8a4a", "#2f7a40"], 1, seed));
    v.box(1, 7, 4, 3, 8, 5, leaf);
    v.box(1, 8, 4, 2, 11, 5, leaf);
    v.box(6, 9, 4, 8, 10, 5, leaf);
    v.box(7, 10, 4, 8, 12, 5, leaf);
    v.set(4, 13, 4, C("#ff7ab0"));
    return v;
  }
  if (kind === "ficus") v.box(4, 4, 4, 5, 12, 5, darkWood());
  for (let i = 0; i < (kind === "ficus" ? 60 : 30); i++) {
    const a = hash(i, 1, seed) * Math.PI * 2,
      r = hash(i, 2, seed) * 4,
      y = (kind === "ficus" ? 10 : 4) + hash(i, 3, seed) * (kind === "ficus" ? 11 : 10);
    const x = 4.5 + Math.cos(a) * r,
      z = 4.5 + Math.sin(a) * r;
    v.box(x, y, z, x + (kind === "monstera" ? 2 : 1), y + 1, z + (kind === "monstera" ? 2 : 1), leaf);
  }
  return v;
}

/** A rug: a border and a pattern. */
export function rug(w: number, d: number, color: string, accent: string) {
  const W = Math.round(w * FINE),
    D = Math.round(d * FINE),
    v = m(W, 1, D);
  v.box(0, 0, 0, W, 1, D, C(accent));
  v.box(1, 0, 1, W - 1, 1, D - 1, (x, _y, z) => C(((x >> 2) + (z >> 2)) % 3 === 0 ? shadeOf(color, 0.06) : color));
  return v;
}

/** Curtains drawn to one side of a window, falling in folds. */
export function curtain(color: string, h = 3) {
  const H = Math.round(h * FINE),
    v = m(10, H, 2);
  for (let x = 0; x < 10; x++) v.box(x, 0, x % 3 === 0 ? 1 : 0, x + 1, H - 1, (x % 3 === 0 ? 1 : 0) + 1, C(x % 3 === 0 ? shadeOf(color, -0.1) : color));
  v.box(0, H - 1, 0, 10, H, 2, metal);
  return v;
}

export function floorLamp() {
  const v = m(5, 20, 5);
  v.box(1, 0, 1, 4, 1, 4, black);
  v.box(2, 1, 2, 3, 16, 3, metal);
  v.box(0, 16, 0, 5, 19, 5, C("#e8dcc0"));
  v.box(1, 15, 1, 4, 16, 4, E("#ffe2b0", 0.8));
  return v;
}

/** A pendant lamp hanging `drop` metres from the ceiling. */
export function pendant(drop = 0.9, color = "#ffe2b0") {
  const D = Math.round(drop * FINE),
    v = m(5, D, 5);
  v.box(2, 3, 2, 3, D, 3, black);
  v.box(0, 0, 0, 5, 3, 5, C("#2a2830"));
  v.box(1, 0, 1, 4, 1, 4, E(color, 0.9));
  return v;
}

/** A wall sconce: a little lit box on a bracket (faces +z, mount on a wall). */
export function sconce(color = "#ffd8a0") {
  const v = m(3, 4, 3);
  v.box(1, 1, 0, 2, 2, 1, black);
  v.box(0, 0, 1, 3, 4, 3, E(color, 1.4));
  return v;
}

// ---- the office ---------------------------------------------------------------------------------------

/** A desk with a keyboard, a mouse and a mug (the monitors are live screens set on top). */
export function desk(seed = 1) {
  const v = m(19, 9, 10);
  v.box(0, 8, 0, 19, 9, 10, C("#e4e0d8"));
  for (const x of [0, 18]) v.box(x, 0, 1, x + 1, 8, 9, metal);
  v.box(1, 3, 1, 18, 4, 2, metal);
  v.box(6, 9, 6, 13, 9, 8, C("#2a2830"));
  v.set(15, 9, 7, C("#2a2830"));
  v.box(2, 9, 6, 3, 11, 7, C(["#d0503a", "#3a6ea5", "#f4b728", "#3ea04a"][seed % 4]));
  // two monitor stands
  for (const x of [5, 13]) {
    v.box(x - 1, 9, 2, x + 2, 9, 4, black);
    v.box(x, 9, 2, x + 1, 13, 3, black);
  }
  return v;
}

export function phoneBooth(color: string) {
  const v = m(14, 28, 14);
  v.box(0, 0, 0, 14, 28, 14, C(color));
  v.clear(1, 1, 1, 13, 27, 14);
  v.box(1, 1, 13, 13, 26, 14, G("#9cc3df"));
  v.box(3, 1, 3, 11, 6, 8, C(shadeOf(color, -0.2)));
  v.box(2, 26, 2, 12, 27, 12, E("#f4f0e8", 1));
  return v;
}

export function coffeeMachine() {
  const v = m(8, 9, 6);
  v.box(0, 0, 0, 8, 9, 6, shades(["#c8ccd4", "#b8bcc6"], 1, 2));
  v.box(1, 1, 5, 7, 4, 6, black);
  v.box(3, 4, 5, 5, 5, 7, black);
  v.set(6, 7, 6, E("#ff3e8a", 2));
  v.set(5, 7, 6, E("#3ee08f", 2));
  return v;
}

// ---- the arcade -----------------------------------------------------------------------------------------

/** An arcade cabinet: side art, a recessed screen (the live game screen sits in it), marquee,
 *  a control panel with a joystick and buttons, a lit coin door. */
export function arcadeCabinet(color: string, side: string) {
  const v = m(10, 23, 10);
  const body = C("#14121c"),
    art = shades([side, shadeOf(side, 0.06)], 1, 3);
  v.box(0, 0, 0, 10, 23, 9, body);
  v.box(0, 0, 0, 1, 23, 9, art);
  v.box(9, 0, 0, 10, 23, 9, art);
  for (let y = 2; y < 21; y += 3) {
    v.set(0, y, 7, E(color, 1.4));
    v.set(9, y, 7, E(color, 1.4));
  }
  v.clear(1, 13, 5, 9, 20, 9);
  v.box(1, 13, 4, 9, 20, 5, black);
  v.box(0, 20, 0, 10, 23, 10, body);
  v.box(1, 21, 10, 9, 22, 10, E(color, 1.6));
  v.box(0, 11, 5, 10, 13, 12, C("#24202e"));
  v.box(2, 13, 8, 3, 15, 9, metal);
  v.set(2, 15, 8, C("#d0303a"));
  for (const [i, c] of ["#3ef0ff", "#f4b728", "#ff3e8a"].entries()) v.set(5 + i, 13, 9, E(c, 1.4));
  v.box(3, 3, 9, 7, 7, 9, C("#2a2834"));
  v.set(4, 5, 9, E("#ff9f2e", 1.8));
  v.set(6, 5, 9, E("#ff9f2e", 1.8));
  return v;
}

export function racingSim(seat: string) {
  const v = m(18, 24, 30);
  const body = C("#14121c");
  v.box(0, 0, 0, 18, 2, 30, body);
  // the screen housing at the front (the live screen fills its opening)
  v.box(0, 2, 0, 18, 24, 5, body);
  v.clear(2, 10, 4, 16, 21, 5);
  v.box(2, 10, 3, 16, 21, 4, black);
  v.box(0, 22, 4, 18, 23, 5, E("#f4b728", 1.6));
  // dashboard, wheel, pedals
  v.box(4, 2, 5, 14, 11, 10, body);
  v.box(6, 11, 9, 12, 12, 10, C("#2a2830"));
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    v.set(9 + Math.cos(t) * 3, 14 + Math.sin(t) * 3, 11, C("#1c1a22"));
  }
  v.box(8, 13, 11, 10, 15, 11, C("#3a3842"));
  v.box(6, 2, 10, 8, 3, 12, metal);
  v.box(10, 2, 10, 12, 3, 12, metal);
  // the bucket seat
  const s = shades([seat, shadeOf(seat, -0.08)], 1, 6);
  v.box(5, 2, 18, 13, 6, 26, s);
  v.box(5, 6, 25, 13, 18, 28, s);
  v.box(4, 6, 18, 5, 10, 27, s);
  v.box(13, 6, 18, 14, 10, 27, s);
  v.box(7, 14, 24, 11, 16, 25, C("#ececf4"));
  return v;
}

export function clawMachine(color: string, seed = 1) {
  const v = m(14, 26, 14);
  v.box(0, 0, 0, 14, 11, 14, shades([color, shadeOf(color, -0.06)], 1, seed));
  v.box(0, 11, 0, 1, 23, 1, metal);
  v.box(13, 11, 0, 14, 23, 1, metal);
  v.box(0, 11, 13, 1, 23, 14, metal);
  v.box(13, 11, 13, 14, 23, 14, metal);
  v.box(1, 11, 1, 13, 23, 13, G("#9cc3df"));
  v.clear(2, 11, 2, 12, 22, 12);
  const prizes = ["#3ee08f", "#f4b728", "#b07bff", "#3ef0ff", "#ff7ab0"];
  for (let x = 2; x < 12; x += 2) for (let z = 2; z < 12; z += 2) v.box(x, 11, z, x + 2, 13 + Math.floor(hash(x, z, seed) * 2), z + 2, C(prizes[Math.floor(hash(x, z, seed, 2) * prizes.length)]));
  v.box(0, 23, 0, 14, 26, 14, E(color, 1.2));
  v.box(6, 19, 6, 8, 22, 8, metal);
  v.box(5, 18, 5, 9, 19, 9, metal);
  v.box(5, 8, 14, 9, 10, 14, C("#24202e"));
  v.set(6, 10, 14, C("#d0303a"));
  return v;
}

/** A pool table: rails in wood, green felt, six pockets, the balls racked. */
export function poolTable() {
  const v = m(32, 10, 18);
  v.box(0, 2, 0, 32, 9, 18, darkWood(9));
  v.box(2, 9, 2, 30, 9, 16, C("#1f6a3a"));
  v.box(2, 8, 2, 30, 9, 16, C("#1f6a3a"));
  for (const [x, z] of [[1, 1], [15, 0], [30, 1], [1, 16], [15, 17], [30, 16]]) v.box(x, 8, z, x + 2, 9, z + 1, black);
  for (const [x, z] of [[2, 2], [28, 2], [2, 14], [28, 14]]) v.box(x, 0, z, x + 2, 2, z + 2, darkWood());
  const balls = ["#f4b728", "#2a78d6", "#d0303a", "#6b4c9a", "#ff9f2e", "#2f7d5b", "#7a2a2a", "#111111", "#f4b728", "#2a78d6"];
  let k = 0;
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) v.set(22 + row, 9, 9 - row + i * 2 - row + row, C(balls[k++ % balls.length]));
  v.set(8, 9, 9, white);
  return v;
}

export function airHockey() {
  const v = m(16, 11, 28);
  v.box(1, 0, 1, 15, 9, 27, C("#ececf4"));
  v.box(0, 9, 0, 16, 10, 28, C("#2a78d6"));
  v.box(1, 10, 1, 15, 10, 27, C("#e8f0f8"));
  v.box(6, 10, 0, 10, 11, 1, E("#ff3e8a", 1.6));
  v.box(6, 10, 27, 10, 11, 28, E("#3ee08f", 1.6));
  v.box(1, 10, 13, 15, 10, 14, E("#3ef0ff", 1));
  return v;
}

/** A dance machine: the platform with four lit arrows, the screen tower, speakers. */
export function danceMachine() {
  const v = m(26, 30, 26);
  v.box(0, 0, 8, 26, 2, 26, C("#24202e"));
  for (const [x, z, c] of [[11, 11, "#3ef0ff"], [11, 21, "#ff3e8a"], [5, 16, "#f4b728"], [17, 16, "#3ee08f"]] as [number, number, string][]) v.box(x, 2, z, x + 4, 2, z + 4, E(c, 1.4));
  v.box(0, 2, 24, 26, 3, 26, metal);
  v.box(5, 0, 0, 21, 30, 8, C("#14121c"));
  v.clear(7, 14, 7, 19, 26, 8);
  v.box(7, 14, 6, 19, 26, 7, black);
  v.box(5, 27, 7, 21, 30, 9, E("#ff3e8a", 1.4));
  for (const x of [0, 21]) {
    v.box(x, 0, 0, x + 5, 20, 7, C("#1c1a24"));
    v.box(x + 1, 4, 7, x + 4, 7, 7, C("#2a2834"));
    v.box(x + 1, 11, 7, x + 4, 15, 7, C("#2a2834"));
  }
  return v;
}

/** A karaoke stage: a low platform, a mic stand, two speakers, a booth sofa comes separately. */
export function karaokeStage() {
  const v = m(48, 24, 24);
  v.box(0, 0, 0, 48, 3, 24, shades(["#2a1a3a", "#24163a"], 1, 2));
  v.box(0, 3, 23, 48, 3, 24, E("#ff3e8a", 1.4));
  v.box(23, 3, 12, 24, 18, 13, metal);
  v.box(22, 3, 11, 25, 4, 14, black);
  v.box(23, 18, 12, 24, 20, 14, black);
  for (const x of [2, 40]) {
    v.box(x, 3, 2, x + 6, 22, 8, C("#14121c"));
    v.box(x + 1, 6, 8, x + 5, 10, 8, C("#2a2834"));
    v.box(x + 1, 13, 8, x + 5, 19, 8, C("#2a2834"));
    v.set(x + 3, 21, 8, E("#3ef0ff", 2));
  }
  return v;
}

/** One bowling lane, `len` metres: polished boards, gutters, arrows, the pin deck at the far end (−z). */
export function bowlingLane(len: number) {
  const D = Math.round(len * FINE),
    v = m(14, 6, D);
  v.box(0, 0, 0, 14, 1, D, C("#1c1a24"));
  v.box(2, 1, 0, 12, 2, D, (x, _y, z) => C((x + (z >> 3)) % 2 ? "#d8b07a" : "#cfa670"));
  v.box(0, 1, 0, 2, 1, D, C("#3a3842"));
  v.box(12, 1, 0, 14, 1, D, C("#3a3842"));
  for (let k = 0; k < 5; k++) v.set(4 + k * 1.5, 2, D - 40 + (k % 2) * 3, C("#b0413e"));
  v.box(0, 1, 0, 14, 6, 2, C("#14121c"));
  return v;
}

/** A bowling pin. */
export function pin() {
  const v = m(3, 8, 3);
  v.box(0, 0, 0, 3, 3, 3, white);
  v.box(1, 3, 1, 2, 5, 2, white);
  v.set(1, 4, 1, C("#d0303a"));
  v.box(0, 5, 0, 3, 7, 3, white);
  v.box(1, 7, 1, 2, 8, 2, white);
  return v;
}

// ---- the gym ------------------------------------------------------------------------------------------------

export function treadmill() {
  const v = m(10, 18, 24);
  v.box(0, 0, 4, 10, 2, 24, C("#24222a"));
  v.box(1, 2, 5, 9, 2, 23, C("#3a3842"));
  v.box(0, 2, 2, 1, 15, 4, metal);
  v.box(9, 2, 2, 10, 15, 4, metal);
  v.box(0, 13, 0, 10, 16, 4, C("#24222a"));
  v.box(2, 14, 4, 8, 15, 4, E("#3ee08f", 1.4));
  return v;
}

export function exerciseBike() {
  const v = m(6, 15, 16);
  v.box(1, 0, 0, 5, 1, 16, C("#24222a"));
  v.box(2, 1, 2, 4, 6, 7, C("#d0303a"));
  v.box(2, 1, 9, 4, 11, 10, metal);
  v.box(1, 11, 8, 5, 12, 12, C("#2a2830"));
  v.box(2, 1, 3, 4, 13, 4, metal);
  v.box(0, 13, 2, 6, 14, 4, C("#24222a"));
  v.set(3, 14, 3, E("#3ef0ff", 2));
  return v;
}

export function weightBench() {
  const v = m(8, 18, 22);
  v.box(2, 0, 2, 6, 4, 20, metal);
  v.box(1, 4, 2, 7, 6, 20, C("#2a2830"));
  for (const x of [0, 7]) v.box(x, 0, 2, x + 1, 17, 3, metal);
  v.box(-2, 15, 2, 10, 16, 3, metal);
  for (const x of [-2, 9]) v.box(x, 13, 1, x + 1, 18, 5, C("#1c1a22"));
  return v;
}

export function dumbbellRack() {
  const v = m(30, 10, 6);
  v.box(0, 0, 0, 1, 9, 6, C("#24222a"));
  v.box(29, 0, 0, 30, 9, 6, C("#24222a"));
  v.box(0, 4, 0, 30, 5, 6, C("#24222a"));
  v.box(0, 8, 0, 30, 9, 6, C("#24222a"));
  for (let k = 0; k < 7; k++) for (const y of [5, 9]) {
    const r = 1 + (k % 3);
    v.box(2 + k * 4, y, 1, 3 + k * 4, y + r, 5, C("#3a3842"));
    v.box(3 + k * 4, y, 2, 4 + k * 4, y + 1, 4, metal);
  }
  return v;
}

// ---- pool deck, bar, lobby ---------------------------------------------------------------------------------

export function lounger(color: string) {
  const v = m(8, 9, 24);
  for (const z of [1, 21]) for (const x of [0, 7]) v.box(x, 0, z, x + 1, 3, z + 1, metal);
  v.box(0, 3, 0, 8, 4, 18, white);
  v.box(1, 4, 0, 7, 5, 18, C(color));
  for (let k = 0; k < 6; k++) v.box(0, 4 + k, 18 + k, 8, 5 + k, 19 + k, white);
  for (let k = 0; k < 6; k++) v.box(1, 5 + k, 18 + k, 7, 6 + k, 19 + k, C(color));
  return v;
}

export function umbrella(color: string) {
  const v = m(26, 30, 26);
  v.box(12, 0, 12, 14, 26, 14, metal);
  v.box(10, 0, 10, 16, 1, 16, C("#2a2830"));
  for (let ring = 0; ring < 13; ring++)
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2;
      const r = ring;
      v.set(13 + Math.cos(t) * r, 29 - Math.floor(ring / 3), 13 + Math.sin(t) * r, C(Math.floor(a / 6) % 2 ? color : "#f4f0e8"));
    }
  return v;
}

/** A bar counter `len` metres with a footrail; a lit back bar with bottles stands separately. */
export function barCounter(len: number, accent: string) {
  const W = Math.round(len * FINE),
    v = m(W, 13, 8);
  v.box(0, 0, 0, W, 12, 7, darkWood(10));
  v.box(0, 12, 0, W, 13, 8, C("#1c1a22"));
  v.box(0, 1, 7, W, 2, 8, metal);
  v.box(0, 3, 7, W, 3, 7, E(accent, 1.4));
  for (let x = 2; x < W; x += 8) v.box(x, 13, 5, x + 1, 15, 6, G(["#3ee08f", "#f4b728", "#ff7ab0"][(x >> 3) % 3]));
  return v;
}

export function backBar(len: number) {
  const W = Math.round(len * FINE),
    v = m(W, 26, 5);
  v.box(0, 0, 0, W, 26, 5, darkWood(11));
  const glass = ["#3ee08f", "#f4b728", "#ff7ab0", "#7fe3ff", "#d0503a", "#e8e0cf"];
  for (const y of [8, 15, 22]) {
    v.clear(1, y - 6, 1, W - 1, y, 5);
    v.box(1, y - 7, 1, W - 1, y - 6, 5, E("#ffd8a0", 1));
    for (let x = 2; x < W - 2; x += 2) {
      const h = 3 + Math.floor(hash(x, y, 4) * 3);
      v.box(x, y - 6, 2, x + 1, y - 6 + h, 3, G(glass[Math.floor(hash(x, y, 5) * glass.length)]));
    }
  }
  return v;
}

export function receptionDesk() {
  const v = m(48, 14, 12);
  v.box(0, 0, 0, 48, 13, 11, shades(["#4a3020", "#44302a"], 1, 3));
  v.box(0, 13, 0, 48, 14, 12, C("#ece8e0"));
  v.box(0, 1, 11, 48, 2, 12, E("#ffd28a", 1.4));
  for (let x = 4; x < 48; x += 6) v.box(x, 3, 11, x + 1, 12, 12, C("#5a3a28"));
  v.box(30, 14, 2, 36, 18, 4, black);
  v.box(31, 15, 4, 35, 17, 4, E("#3ef0ff", 1.2));
  v.box(10, 14, 4, 13, 18, 7, C("#2f8a4a"));
  return v;
}

/** A framed picture: the frame in voxels; the caller sets the image on a plane in front. */
export function frame(w: number, h: number, color = "#c9a227") {
  const W = Math.round(w * FINE),
    H = Math.round(h * FINE),
    v = m(W, H, 1);
  v.box(0, 0, 0, W, H, 1, C(color));
  v.clear(1, 1, 0, W - 1, H - 1, 1);
  return v;
}

export { type Paint };

// ---- the lobby ------------------------------------------------------------------------------------------

/** A marble column `h` metres tall with a gold collar top and bottom. */
export function column(h: number) {
  const H = Math.round(h * FINE),
    v = m(10, H, 10);
  v.box(0, 0, 0, 10, 2, 10, C("#2a2630"));
  v.box(1, 2, 1, 9, H - 2, 9, shades(["#ece8e0", "#e4dfd6", "#f2eee6"], 3, 5));
  v.box(0, 2, 0, 10, 3, 10, C("#c9a227"));
  v.box(0, H - 3, 0, 10, H - 2, 10, C("#c9a227"));
  v.box(0, H - 2, 0, 10, H, 10, C("#2a2630"));
  return v;
}

/** A grand piano, lid up, on three legs, with its bench. */
export function grandPiano() {
  const v = m(18, 16, 24);
  const k = C("#0e0d12");
  for (let z = 4; z < 24; z++) {
    // the curved side: narrower towards the tail
    const t = (z - 4) / 20;
    const w = Math.round(17 - Math.max(0, t - 0.3) * 14);
    v.box(0, 7, z, w, 10, z + 1, k);
  }
  v.box(0, 7, 0, 18, 10, 4, k);
  // keys: white with black on top
  v.box(1, 9, 0, 17, 10, 3, C("#f4f2ec"));
  for (let x = 2; x < 16; x += 2) if (x % 7 !== 0) v.box(x, 10, 1, x + 1, 11, 3, k);
  // the lid propped open
  for (let z = 4; z < 22; z++) v.box(1, 10 + Math.round((z - 4) * 0.35), z, 15 - Math.max(0, z - 12), 11 + Math.round((z - 4) * 0.35), z + 1, k);
  v.box(2, 10, 10, 3, 16, 11, C("#c9a227"));
  for (const [x, z] of [[1, 2], [15, 2], [5, 20]]) v.box(x, 0, z, x + 2, 7, z + 2, k);
  v.box(6, 3, 4, 10, 4, 6, C("#c9a227"));
  return v;
}

export function pianoBench() {
  const v = m(10, 6, 5);
  v.box(0, 5, 0, 10, 6, 5, C("#2a2630"));
  for (const [x, z] of [[0, 0], [9, 0], [0, 4], [9, 4]]) v.box(x, 0, z, x + 1, 5, z + 1, C("#0e0d12"));
  return v;
}

/** A security turnstile: a post with a glass flap and a lit reader. */
export function turnstile() {
  const v = m(4, 13, 14);
  v.box(0, 0, 0, 4, 12, 14, shades(["#c8ccd4", "#bcc0c8"], 1, 2));
  v.box(0, 12, 0, 4, 13, 14, C("#2a2830"));
  v.box(1, 12, 2, 3, 13, 4, E("#3ee08f", 1.8));
  v.box(4, 6, 5, 4, 11, 12, G("#9cc3df"));
  return v;
}

export function luggageCart() {
  const v = m(10, 22, 16);
  const gold = C("#c9a227");
  v.box(0, 1, 0, 10, 2, 16, C("#7a1a2a"));
  for (const [x, z] of [[0, 0], [9, 0], [0, 15], [9, 15]]) {
    v.box(x, 0, z, x + 1, 1, z + 1, C("#1c1a22"));
    v.box(x, 2, z, x + 1, 20, z + 1, gold);
  }
  v.box(0, 20, 0, 10, 21, 1, gold);
  v.box(0, 20, 15, 10, 21, 16, gold);
  v.box(4, 20, 0, 5, 21, 16, gold);
  // a couple of suitcases
  v.box(1, 2, 2, 8, 10, 7, C("#2a4a6a"));
  v.box(2, 2, 8, 8, 8, 14, C("#6a3a2a"));
  v.box(4, 10, 3, 5, 11, 6, C("#1c1a22"));
  return v;
}

export function bistroTable() {
  const v = m(8, 9, 8);
  v.box(0, 8, 0, 8, 9, 8, C("#ece8e0"));
  v.box(3, 1, 3, 5, 8, 5, C("#2a2830"));
  v.box(1, 0, 1, 7, 1, 7, C("#2a2830"));
  v.set(2, 9, 4, C("#ece8e0"));
  v.set(5, 9, 3, C("#7a4a2a"));
  return v;
}

/** A pastry counter: glass display of cakes and buns, a till on top. */
export function pastryCase() {
  const v = m(20, 14, 8);
  v.box(0, 0, 0, 20, 8, 8, C("#4a3020"));
  v.box(0, 8, 0, 20, 9, 8, C("#ece8e0"));
  v.box(1, 9, 1, 19, 13, 7, G("#cfe6f0"));
  v.clear(2, 9, 2, 18, 12, 7);
  const cakes = ["#f4d8a0", "#d9a441", "#e8a0b0", "#7a4a2a", "#f4f0e8", "#3ea04a"];
  for (let x = 2; x < 18; x += 3) {
    v.box(x, 9, 3, x + 2, 10, 5, C(cakes[(x / 3) % cakes.length | 0]));
    v.box(x, 10, 3, x + 2, 11, 4, C(cakes[((x / 3) | 0) + 1] ?? "#f4d8a0"));
  }
  v.box(0, 13, 0, 20, 14, 8, C("#ece8e0"));
  v.box(0, 3, 8, 20, 4, 8, E("#ffd28a", 1.2));
  return v;
}

/** Smart parcel lockers: a grid of doors, a few lit green (waiting), a screen in the middle. */
export function parcelLockers(w: number) {
  const W = Math.round(w * FINE),
    v = m(W, 26, 7);
  v.box(0, 0, 0, W, 26, 7, C("#2a2832"));
  for (let x = 1; x + 5 <= W - 1; x += 6)
    for (let y = 1; y + 4 <= 25; y += 5) {
      v.box(x, y, 6, x + 5, y + 4, 7, shades(["#c8ccd4", "#c0c4cc"], 1, x + y));
      v.set(x + 4, y + 2, 7, hash(x, y, 9) > 0.65 ? E("#3ee08f", 1.6) : C("#4a4a54"));
    }
  const mid = Math.floor(W / 2);
  v.box(mid - 4, 11, 6, mid + 4, 17, 7, C("#0e0d12"));
  v.box(mid - 3, 12, 7, mid + 3, 16, 7, E("#3ef0ff", 1));
  return v;
}

export function bench() {
  const v = m(20, 6, 6);
  v.box(0, 4, 0, 20, 6, 6, shades(["#7a5236", "#724c32"], 2, 4));
  for (const x of [1, 17]) v.box(x, 0, 1, x + 2, 4, 5, C("#2a2830"));
  return v;
}

/** An information kiosk: a pedestal with a tilted screen (the live screen sits on it). */
export function kiosk() {
  const v = m(8, 16, 6);
  v.box(2, 0, 1, 6, 12, 5, C("#2a2830"));
  v.box(0, 0, 0, 8, 1, 6, C("#2a2830"));
  v.box(0, 12, 0, 8, 16, 2, C("#14121c"));
  v.box(2, 1, 5, 6, 2, 5, E("#3ef0ff", 1.4));
  return v;
}

/** An indoor tree in a big square planter, 3–4 m tall. */
export function indoorTree(seed = 1) {
  const v = m(20, 46, 20);
  v.box(3, 0, 3, 17, 7, 17, C("#2a2630"));
  v.box(3, 7, 3, 17, 7, 17, C("#4a3020"));
  v.box(4, 6, 4, 16, 7, 16, C("#3a2a20"));
  v.box(9, 7, 9, 11, 30, 11, shades(["#5a3e2a", "#4a3020"], 2, seed));
  v.box(11, 20, 9, 15, 21, 10, C("#4a3020"));
  v.box(5, 24, 10, 9, 25, 11, C("#4a3020"));
  const leaf = shades(["#2f8a4a", "#3a9a52", "#287a40", "#45a85a"], 1, seed);
  for (let i = 0; i < 520; i++) {
    const a = hash(i, 1, seed) * Math.PI * 2,
      r = Math.sqrt(hash(i, 2, seed)) * 9,
      y = 24 + hash(i, 3, seed) * 20 - (r / 9) * 6;
    v.box(10 + Math.cos(a) * r, y, 10 + Math.sin(a) * r, 11 + Math.cos(a) * r, y + 1, 11 + Math.sin(a) * r, leaf);
  }
  return v;
}
