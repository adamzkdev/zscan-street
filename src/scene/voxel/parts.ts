import { C, E, G, hash, rand, shades, type Paint, type VoxelModel } from "./model";

/**
 * Building parts drawn into a model. Conventions: a facade's body occupies z < fz, so `fz` is the
 * first empty layer in front of the wall and the wall surface is layer fz - 1. Heights in voxels
 * (6 per metre): a floor is 16, a ground floor 20.
 */

// ---- palette ----------------------------------------------------------------------------------

export const P = {
  frame: C("#2a2630"),
  frameLight: C("#8d8a95"),
  sill: C("#9a95a2"),
  glass: G("#18202e"),
  glassBlue: G("#1d2a3f"),
  metal: C("#2b2933"),
  metalLight: C("#5d5a66"),
  rail: C("#3a3742"),
  acBody: C("#c4c1ca"),
  acGrille: C("#6e6a78"),
  acFan: C("#3a3742"),
  roof: C("#3b3745"),
  roofLight: C("#46414f"),
  tar: C("#2e2b36"),
  white: C("#d8d4cc"),
  black: C("#17151c"),
  soil: C("#3a2a20"),
  pot: C("#8a4a32"),
  wood: shades(["#5a3e2b", "#4e3526", "#64462f"], 1, 3),
  woodLight: shades(["#8a6440", "#7e5a38", "#956c46"], 1, 4),
  leaf: shades(["#2f6b3c", "#3d8a4a", "#285c33", "#357a42"], 1, 5),
  leafDark: shades(["#244a33", "#1f3d2b", "#2c5a3c"], 1, 6),
  blossom: shades(["#d77aa8", "#e89ac0", "#c4628f", "#f0b0cf"], 1, 7),
  trunk: shades(["#4a3426", "#3e2c20"], 1, 8),
};

export const LIT = {
  warm: [E("#ffc070", 1.3), E("#ffb15a", 1.25), E("#ffd08a", 1.15), E("#ffa860", 1.2)],
  cool: [E("#a8dcff", 1.05), E("#cfe8ff", 1.0), E("#8fd0ff", 1.05)],
  tv: [E("#7fb0ff", 1.2)],
  curtain: [E("#e07a5a", 1.0), E("#c9a46a", 1.0), E("#8a6ab0", 0.9), E("#5a8a9a", 0.9)],
};

export interface Window {
  lit?: "warm" | "cool" | "tv" | false;
  depth?: number;
  frame?: number;
  sill?: boolean;
  mullion?: "v" | "h" | "cross" | null;
  curtain?: boolean;
  blinds?: boolean;
  seed?: number;
}

/** A recessed window: frame ring on the wall, glass or lit room behind, sill below. */
export function window(m: VoxelModel, x: number, y: number, w: number, h: number, fz: number, o: Window = {}) {
  const depth = o.depth ?? 2;
  const r = rand(o.seed ?? x * 31 + y * 17 + fz);
  const frame = o.frame ?? P.frame;
  m.box(x - 1, y - 1, fz - 1, x + w + 1, y + h + 1, fz, frame);
  m.clear(x, y, fz - depth, x + w, y + h, fz);
  if (o.lit) {
    const pal = LIT[o.lit];
    const base = pal[Math.floor(r() * pal.length)];
    m.box(x, y, fz - depth - 1, x + w, y + h, fz - depth, base);
    if (o.curtain) {
      const cc = LIT.curtain[Math.floor(r() * LIT.curtain.length)];
      const cw = Math.max(1, Math.floor(w * (0.2 + r() * 0.2)));
      m.box(x, y, fz - depth - 1, x + cw, y + h, fz - depth, cc);
      if (r() > 0.4) m.box(x + w - cw, y, fz - depth - 1, x + w, y + h, fz - depth, cc);
    }
    if (o.blinds) for (let yy = y + 1; yy < y + h; yy += 2) m.box(x, yy, fz - depth - 1, x + w, yy + 1, fz - depth, E("#c08850", 0.9));
    // something on the sill inside: a plant or a lamp
    if (r() > 0.6) m.box(x + 1 + Math.floor(r() * Math.max(1, w - 3)), y, fz - depth, x + 3 + Math.floor(r() * Math.max(1, w - 3)), y + 2, fz - depth + 1, r() > 0.5 ? P.leaf : P.black);
  } else {
    m.box(x, y, fz - depth - 1, x + w, y + h, fz - depth, r() > 0.5 ? P.glass : P.glassBlue);
    if (o.curtain && r() > 0.5) m.box(x, y, fz - depth - 1, x + Math.max(1, Math.floor(w / 3)), y + h, fz - depth, C("#3a3040"));
  }
  if (o.mullion === "v" || o.mullion === "cross") m.box(x + Math.floor(w / 2), y, fz - depth, x + Math.floor(w / 2) + 1, y + h, fz - depth + 1, frame);
  if (o.mullion === "h" || o.mullion === "cross") m.box(x, y + Math.floor(h * 0.62), fz - depth, x + w, y + Math.floor(h * 0.62) + 1, fz - depth + 1, frame);
  if (o.sill !== false) m.box(x - 1, y - 2, fz - 1, x + w + 1, y - 1, fz + 1, P.sill);
}

/** Outdoor air-conditioner unit hung on the wall (5 wide, 4 high, 3 deep), with its pipe. */
export function acUnit(m: VoxelModel, x: number, y: number, fz: number, pipeDown = true) {
  m.box(x, y, fz, x + 5, y + 4, fz + 3, P.acBody);
  // grille rows and the fan
  for (let yy = y; yy < y + 4; yy += 2) m.box(x, yy, fz + 2, x + 3, yy + 1, fz + 3, P.acGrille);
  m.box(x + 1, y + 1, fz + 2, x + 3, y + 3, fz + 3, P.acFan);
  m.box(x + 3, y + 1, fz + 2, x + 5, y + 2, fz + 3, C("#a8a5ae"));
  // bracket
  m.box(x, y - 1, fz, x + 1, y, fz + 3, P.metal);
  m.box(x + 4, y - 1, fz, x + 5, y, fz + 3, P.metal);
  if (pipeDown) m.box(x + 5, y - 6, fz, x + 6, y + 2, fz + 1, C("#d0ccc4"));
}

export interface Balcony {
  laundry?: boolean;
  plants?: boolean;
  ac?: boolean;
  style?: "panel" | "rail";
  seed?: number;
}

/** Japanese apartment balcony: slab, frosted panel wall, laundry pole, plants, AC unit. */
export function balcony(m: VoxelModel, x0: number, x1: number, y: number, fz: number, depth: number, o: Balcony = {}) {
  const r = rand(o.seed ?? x0 * 13 + y);
  m.box(x0, y, fz, x1, y + 1, fz + depth, C("#7a7484"));
  m.box(x0, y - 1, fz + depth - 1, x1, y, fz + depth, C("#5a5464"));
  if (o.style === "rail") {
    for (let x = x0; x < x1; x += 2) m.box(x, y + 1, fz + depth - 1, x + 1, y + 6, fz + depth, P.rail);
    m.box(x0, y + 6, fz + depth - 1, x1, y + 7, fz + depth, P.rail);
  } else {
    m.box(x0, y + 1, fz + depth - 1, x1, y + 6, fz + depth, G("#8a96aa"));
    m.box(x0, y + 6, fz + depth - 1, x1, y + 7, fz + depth, C("#9a95a2"));
    for (let x = x0; x < x1; x += 8) m.box(x, y + 1, fz + depth - 1, x + 1, y + 7, fz + depth, C("#9a95a2"));
  }
  // side partitions
  m.box(x0, y + 1, fz, x0 + 1, y + 10, fz + depth, C("#8a8494"));
  m.box(x1 - 1, y + 1, fz, x1, y + 10, fz + depth, C("#8a8494"));
  if (o.laundry) {
    m.box(x0 + 1, y + 11, fz + 1, x1 - 1, y + 12, fz + 2, P.frameLight);
    const cloth = ["#d8d4cc", "#5a7ab0", "#c05a5a", "#e0c060", "#6aa07a", "#e8e0f0", "#2a2a40"];
    for (let x = x0 + 2; x < x1 - 3; x += 3 + Math.floor(r() * 2)) {
      if (r() < 0.3) continue;
      const len = 3 + Math.floor(r() * 4);
      m.box(x, y + 11 - len, fz + 1, x + 2, y + 11, fz + 2, C(cloth[Math.floor(r() * cloth.length)]));
    }
  }
  if (o.ac) acUnit(m, x1 - 7, y + 1, fz, false);
  if (o.plants)
    for (let i = 0; i < 2; i++) {
      const px = x0 + 2 + Math.floor(r() * (x1 - x0 - 6));
      m.box(px, y + 1, fz + depth - 3, px + 2, y + 3, fz + depth - 1, P.pot);
      m.blob(px + 1, y + 4.5, fz + depth - 2, 2, P.leaf, 0.3, px);
    }
}

/** Ribbed roller shutter, optionally half open with light spilling out. */
export function shutter(m: VoxelModel, x0: number, x1: number, y0: number, y1: number, fz: number, open = 0) {
  const ribs: Paint = (_x, y) => (y % 2 ? C("#8a8692") : C("#76727e"));
  m.box(x0, y0, fz - 1, x1, y1, fz, ribs);
  m.box(x0 - 1, y1, fz - 1, x1 + 1, y1 + 2, fz + 1, C("#5a5664"));
  if (open > 0) {
    const h = Math.floor((y1 - y0) * open);
    m.clear(x0, y0, fz - 3, x1, y0 + h, fz);
    m.box(x0, y0, fz - 4, x1, y0 + h, fz - 3, E("#ffcf8a", 1.3));
  }
}

/** A door with a glass panel and a small lit transom. */
export function door(m: VoxelModel, x: number, fz: number, w = 6, h = 13, color: Paint = C("#3a2a24"), lit = true, y0 = 0) {
  m.box(x - 1, y0, fz - 1, x + w + 1, y0 + h + 1, fz, P.frame);
  m.clear(x, y0, fz - 2, x + w, y0 + h, fz);
  m.box(x, y0, fz - 3, x + w, y0 + h, fz - 2, color);
  m.box(x + 1, y0 + h - 6, fz - 3, x + w - 1, y0 + h - 2, fz - 2, lit ? E("#ffcf8a", 1.2) : P.glass);
  m.box(x + w - 2, y0 + 6, fz - 2, x + w - 1, y0 + 7, fz - 1, P.frameLight);
  if (lit) m.box(x + 1, y0 + h + 2, fz, x + w - 1, y0 + h + 3, fz + 1, E("#ffe0a8", 1.1));
}

export type ShopKind = "konbini" | "ramen" | "izakaya" | "cafe" | "shop" | "karaoke" | "florist" | "tea";

const SHOP_TONES: Record<ShopKind, { interior: number[]; fascia: number; awning?: string[]; noren?: string; lanterns?: boolean }> = {
  konbini: { interior: [E("#eaf6ff", 0.95), E("#f4fbff", 1.0)], fascia: C("#e8e4dc") },
  ramen: { interior: [E("#ffcf8a", 0.85), E("#ffbf70", 0.85)], fascia: C("#3a2a24"), noren: "#2a3a6a", lanterns: true },
  izakaya: { interior: [E("#ffb060", 0.8), E("#ff9a50", 0.8)], fascia: C("#2e221c"), noren: "#6a1f24", lanterns: true },
  cafe: { interior: [E("#ffd9a0", 0.85)], fascia: C("#2a2d24"), awning: ["#2f5a3e", "#d8d0c0"] },
  shop: { interior: [E("#ffe6c0", 0.85), E("#fff0d8", 0.85)], fascia: C("#2a2630"), awning: ["#9c2f2f", "#d8d2c8"] },
  karaoke: { interior: [E("#ff7ab8", 0.85), E("#c07aff", 0.8)], fascia: C("#1e1a26") },
  florist: { interior: [E("#fff0d0", 0.8)], fascia: C("#3a4a32"), awning: ["#3a7a4a", "#e8e0d0"] },
  tea: { interior: [E("#ffd28a", 0.8)], fascia: C("#3a2a1e"), noren: "#3a5a3a", lanterns: true },
};

/**
 * A ground-floor shop: lit interior with shelves and counter, mullions, kick plate, fascia band
 * for the sign, then an awning or noren curtains and lanterns depending on the trade.
 * Returns the fascia rectangle so a neon sign can be mounted on it.
 */
export function shopfront(m: VoxelModel, x0: number, x1: number, gh: number, fz: number, kind: ShopKind, seed = 1) {
  const r = rand(seed);
  const t = SHOP_TONES[kind];
  const depth = 7;
  const top = gh - 5;
  // carve the interior and light it
  m.clear(x0, 0, fz - depth, x1, top, fz);
  const light = t.interior[0];
  m.box(x0, 0, fz - depth - 1, x1, top, fz - depth, light);
  m.box(x0, top - 1, fz - depth, x1, top, fz, t.interior[t.interior.length - 1]);
  m.box(x0 - 1, 0, fz - depth, x0, top, fz, light);
  m.box(x1, 0, fz - depth, x1 + 1, top, fz, light);
  // shelves of goods on the back wall
  const goods = ["#e05a5a", "#5ab0e0", "#e0c05a", "#7ad07a", "#e08ac0", "#f0f0f0", "#a07ae0", "#f09a4a"];
  for (let sy = 2; sy < top - 3; sy += 4) {
    m.box(x0, sy, fz - depth, x1, sy + 1, fz - depth + 2, C("#6a5a4a"));
    for (let x = x0; x < x1; x++) if (hash(x, sy, seed) > 0.25) m.set(x, sy + 1, fz - depth, C(goods[Math.floor(hash(x, sy, seed, 2) * goods.length)]));
    for (let x = x0; x < x1; x++) if (hash(x, sy, seed, 3) > 0.5) m.set(x, sy + 2, fz - depth, C(goods[Math.floor(hash(x, sy, seed, 4) * goods.length)]));
  }
  // counter
  const cx = kind === "konbini" ? x1 - 12 : x0 + 2;
  m.box(cx, 0, fz - 4, cx + 9, 6, fz - 2, kind === "ramen" || kind === "izakaya" || kind === "tea" ? P.woodLight : C("#d8d4cc"));
  if (kind === "ramen" || kind === "izakaya") for (let x = cx; x < cx + 9; x += 3) m.box(x, 0, fz - 2, x + 1, 4, fz - 1, C("#9a2f2f"));
  // front: kick plate, mullions, door gap
  const doorX = Math.floor((x0 + x1) / 2) - 3;
  for (let x = x0; x < x1; x++) {
    if (x >= doorX && x < doorX + 6) continue;
    m.set(x, 0, fz - 1, P.metal);
    m.set(x, 1, fz - 1, P.metal);
  }
  for (let x = x0; x <= x1; x += 8) if (x < doorX - 1 || x > doorX + 6) m.box(x, 0, fz - 1, x + 1, top, fz, P.frame);
  m.box(doorX - 1, 0, fz - 1, doorX, top, fz, P.frame);
  m.box(doorX + 6, 0, fz - 1, doorX + 7, top, fz, P.frame);
  m.box(x0, top - 1, fz - 1, x1, top, fz, P.frame);
  // fascia band
  m.box(x0 - 1, top, fz - 1, x1 + 1, gh, fz + 1, t.fascia);
  if (kind === "konbini") {
    m.box(x0 - 1, top, fz + 1, x1 + 1, top + 1, fz + 2, E("#ffb347", 1.1));
    m.box(x0 - 1, gh - 1, fz + 1, x1 + 1, gh, fz + 2, E("#3ec9b0", 1.0));
  }
  // awning
  if (t.awning) {
    const [a, b] = t.awning.map((h) => C(h));
    for (let k = 0; k < 6; k++) m.box(x0 - 1, top - 1 - Math.floor(k / 2), fz + 1 + k, x1 + 1, top - Math.floor(k / 2), fz + 2 + k, (x) => (Math.floor(x / 3) % 2 ? a : b));
    for (let x = x0 - 1; x < x1 + 1; x++) if (x % 3 !== 1) m.set(x, top - 5, fz + 6, Math.floor(x / 3) % 2 ? a : b);
  }
  // noren over the door
  if (t.noren) {
    const n = C(t.noren);
    m.box(doorX - 2, top - 1, fz, doorX + 8, top, fz + 1, P.wood);
    for (let x = doorX - 2; x < doorX + 8; x += 3) m.box(x, top - 7, fz, x + 2, top - 1, fz + 1, n);
    m.set(doorX + 2, top - 4, fz, P.white);
  }
  if (t.lanterns) for (const lx of [x0 + 1, x1 - 4]) lantern(m, lx, top - 6, fz + 1);
  // things on the pavement
  if (kind === "ramen" || kind === "cafe" || kind === "izakaya") menuBoard(m, x1 - 5, fz + 2);
  if (kind === "konbini") {
    // ATM sign and a bin row
    m.box(x0 + 1, 0, fz + 1, x0 + 4, 5, fz + 3, C("#3a6a9a"));
    m.box(x0 + 5, 0, fz + 1, x0 + 8, 5, fz + 3, C("#4a8a4a"));
    m.box(x0 + 9, 0, fz + 1, x0 + 12, 5, fz + 3, C("#9a7a3a"));
  }
  if (kind === "florist") for (let x = x0; x < x1 - 2; x += 4) {
    m.box(x, 0, fz + 1, x + 3, 2, fz + 4, P.pot);
    m.blob(x + 1.5, 3.2, fz + 2.5, 2.2, r() > 0.5 ? P.blossom : P.leaf, 0.35, x);
  }
  return { x0: x0 - 1, x1: x1 + 1, y0: top, y1: gh, z: fz + 1 };
}

/** Red paper lantern (chōchin): glowing body with black caps. */
export function lantern(m: VoxelModel, x: number, y: number, z: number, color = "#ff5a3a") {
  m.box(x + 1, y + 5, z + 1, x + 2, y + 6, z + 2, P.black);
  m.box(x, y + 4, z, x + 3, y + 5, z + 3, P.black);
  m.box(x, y + 1, z, x + 3, y + 4, z + 3, E(color, 1.15));
  m.box(x, y, z, x + 3, y + 1, z + 3, P.black);
}

export function menuBoard(m: VoxelModel, x: number, z: number) {
  m.box(x, 0, z, x + 4, 7, z + 1, P.wood);
  m.box(x + 1, 2, z + 1, x + 3, 6, z + 2, C("#22302a"));
  m.set(x + 1, 5, z + 1, C("#d8d4cc"));
  m.set(x + 2, 3, z + 1, C("#d8d4cc"));
}

/** Fire escape against the +x side wall (x = sx is the first empty layer). */
export function fireEscape(m: VoxelModel, sx: number, z0: number, z1: number, levels: number[], top: number) {
  const metal = C("#25232b");
  levels.forEach((y, i) => {
    m.box(sx, y, z0, sx + 5, y + 1, z1, metal);
    for (let z = z0; z < z1; z += 2) m.box(sx + 4, y + 1, z, sx + 5, y + 6, z + 1, metal);
    m.box(sx + 4, y + 6, z0, sx + 5, y + 7, z1, metal);
    m.box(sx, y + 6, z0, sx + 5, y + 7, z0 + 1, metal);
    // stairs down to the previous landing
    const prev = i ? levels[i - 1] : 0;
    const steps = y - prev;
    for (let k = 0; k < steps; k++) {
      const z = i % 2 ? z0 + 2 + Math.floor((k * (z1 - z0 - 4)) / steps) : z1 - 3 - Math.floor((k * (z1 - z0 - 4)) / steps);
      m.box(sx + 1, prev + k, z, sx + 4, prev + k + 1, z + 1, metal);
    }
  });
  if (top) m.box(sx + 2, levels[levels.length - 1], z1 - 2, sx + 3, top, z1 - 1, metal);
}

export function drainpipe(m: VoxelModel, x: number, fz: number, y0: number, y1: number) {
  m.box(x, y0, fz, x + 1, y1, fz + 1, C("#4a4656"));
  m.box(x - 1, y1 - 1, fz, x + 2, y1, fz + 2, C("#4a4656"));
  for (let y = y0 + 8; y < y1; y += 12) m.box(x - 1, y, fz, x + 2, y + 1, fz + 1, P.metal);
}

/** Electric meter boxes and a gas meter, the clutter of every Tokyo back street. */
export function meters(m: VoxelModel, x: number, y: number, fz: number) {
  m.box(x, y, fz, x + 3, y + 4, fz + 1, C("#b8b4bc"));
  m.box(x + 1, y + 2, fz + 1, x + 2, y + 3, fz + 2, C("#2a2a30"));
  m.box(x + 4, y + 1, fz, x + 7, y + 4, fz + 1, C("#c8c4bc"));
  m.box(x + 1, y - 6, fz, x + 2, y, fz + 1, P.black);
}

// ---- roofs ------------------------------------------------------------------------------------

export function parapet(m: VoxelModel, x0: number, z0: number, x1: number, z1: number, y: number, h = 3, color = C("#4a4555")) {
  m.box(x0, y, z0, x1, y + h, z0 + 1, color);
  m.box(x0, y, z1 - 1, x1, y + h, z1, color);
  m.box(x0, y, z0, x0 + 1, y + h, z1, color);
  m.box(x1 - 1, y, z0, x1, y + h, z1, color);
  m.box(x0, y + h, z0, x1, y + h + 1, z0 + 1, C("#5a5564"));
  m.box(x0, y + h, z1 - 1, x1, y + h + 1, z1, C("#5a5564"));
  m.box(x0, y + h, z0, x0 + 1, y + h + 1, z1, C("#5a5564"));
  m.box(x1 - 1, y + h, z0, x1, y + h + 1, z1, C("#5a5564"));
}

export function waterTank(m: VoxelModel, x: number, y: number, z: number) {
  for (const [dx, dz] of [
    [-3, -3],
    [2, -3],
    [-3, 2],
    [2, 2],
  ])
    m.box(x + dx, y, z + dz, x + dx + 1, y + 5, z + dz + 1, P.metal);
  m.box(x - 3, y + 5, z - 3, x + 3, y + 6, z + 3, P.metal);
  m.cylinder(x, y + 6, z, 4, 7, C("#7a8a9a"));
  m.cylinder(x, y + 13, z, 3, 1, C("#5a6a7a"));
  for (let yy = y + 7; yy < y + 13; yy += 3) m.cylinder(x, yy, z, 4.2, 1, C("#5a6a7a"), true);
}

export function roofAC(m: VoxelModel, x: number, y: number, z: number, big = false) {
  const w = big ? 8 : 6;
  m.box(x, y, z, x + w, y + 5, z + 5, P.acBody);
  m.box(x + 1, y + 5, z + 1, x + w - 1, y + 6, z + 4, P.acGrille);
  m.cylinder(x + w / 2, y + 5, z + 2.5, 1.8, 1, P.acFan);
  m.box(x, y, z + 5, x + 1, y + 2, z + 8, C("#d0ccc4"));
}

export function stairHouse(m: VoxelModel, x: number, y: number, z: number) {
  m.box(x, y, z, x + 10, y + 14, z + 10, C("#5a5464"));
  m.box(x - 1, y + 14, z - 1, x + 11, y + 15, z + 11, C("#3a3644"));
  door(m, x + 2, z + 10, 6, 12, C("#3a3a44"), false, y);
  m.box(x + 3, y + 12, z + 10, x + 7, y + 13, z + 11, E("#ffe0a8", 1.6));
}

export function antenna(m: VoxelModel, x: number, y: number, z: number, h = 18) {
  m.box(x, y, z, x + 1, y + h, z + 1, C("#6a6672"));
  for (let k = 4; k < h; k += 5) m.box(x - 3, y + k, z, x + 4, y + k + 1, z + 1, C("#6a6672"));
  m.box(x, y + h, z, x + 1, y + h + 1, z + 1, E("#ff3048", 2.5));
}

export function dish(m: VoxelModel, x: number, y: number, z: number) {
  m.box(x + 1, y, z + 1, x + 2, y + 3, z + 2, P.metal);
  m.box(x, y + 3, z, x + 4, y + 6, z + 1, C("#d8d4cc"));
  m.box(x - 1, y + 4, z, x + 5, y + 5, z + 1, C("#d8d4cc"));
}

/** Lattice frame for a rooftop billboard; returns the sign face rectangle. */
export function billboardFrame(m: VoxelModel, x0: number, x1: number, y: number, z: number, h = 12) {
  const metal = C("#2e2c36");
  for (let x = x0; x < x1; x += 6) m.box(x, y, z, x + 1, y + h + 2, z + 1, metal);
  m.box(x0, y + 4, z, x1, y + 5, z + 1, metal);
  m.box(x0, y + h + 1, z - 1, x1, y + h + 2, z + 1, metal);
  return { x0, x1, y0: y + 5, y1: y + h + 1, z: z + 1 };
}

/** Pitched tiled roof running along x (ridge along x), stepped like real voxel tiles. */
export function tiledRoof(m: VoxelModel, x0: number, x1: number, z0: number, z1: number, y: number, tile: Paint = shades(["#3a3a48", "#34343f", "#40404e"], 1, 9)) {
  const half = Math.ceil((z1 - z0) / 2);
  for (let k = 0; k < half; k++) {
    const yy = y + Math.floor(k / 1.4);
    m.box(x0 - 1, yy, z0 + k - 1, x1 + 1, yy + 1, z0 + k, tile);
    m.box(x0 - 1, yy, z1 - k, x1 + 1, yy + 1, z1 - k + 1, tile);
    m.box(x0, y, z0 + k, x1, yy, z1 - k, C("#8a7a68"));
  }
  m.box(x0 - 1, y + Math.floor(half / 1.4), z0 + half - 2, x1 + 1, y + Math.floor(half / 1.4) + 1, z0 + half + 1, C("#2a2a34"));
}

// ---- sign anchors -----------------------------------------------------------------------------

export interface SignSpot {
  text: string;
  color: string;
  /** Model-space centre of the sign face and its size in voxels. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  vertical: boolean;
  /** Facing in model space: "front" (+z) or "side" (+x). */
  facing: "front" | "side";
}

/** Vertical tate-kanban box sticking out from the facade; the neon face is mounted on its sides. */
export function verticalSignBox(m: VoxelModel, x: number, y: number, fz: number, h: number, depth = 6) {
  m.box(x, y, fz, x + 2, y + h, fz + depth, C("#1a1820"));
  m.box(x - 1, y - 1, fz, x + 3, y, fz + depth, P.metal);
  m.box(x - 1, y + h, fz, x + 3, y + h + 1, fz + depth, P.metal);
}
