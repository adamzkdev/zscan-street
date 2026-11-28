import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../voxel/model";
import { acUnit, window as win } from "../voxel/parts";
import { sedanModel, taxiModel } from "../voxel/vehicles";
import type { KLot, KTrade } from "./plan";

/**
 * Orchard Keys in voxels (src/scene/keys): the beach town's houses, shops, hotels and the things
 * round them. Pure, runs in the district's worker. Every lot is modelled to its own footprint
 * (6 voxels a metre), its front (the street side) at +z, its ground at y = 0 standing on the kerb.
 */

/** Where a sign goes (model voxels: the centre of its face, its size), what it says, which way it faces. */
export interface KSign {
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  vertical: boolean;
  /** "front": facing +z; "side": facing +x (and drawn on both faces). */
  facing: "front" | "side";
}

export interface KBuilt {
  model: VoxelModel;
  signs: KSign[];
  /** The front door (model voxels, x and the front wall's z). */
  door: [number, number];
  /** Lamps worth a real light (model voxels and colour). */
  lights: [number, number, number, string][];
}

// ---- colours ------------------------------------------------------------------------------------

const hex2 = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** A colour a little lighter (k > 0) or darker (k < 0). */
export const tone = (h: string, k: number) => toHex(hex2(h).map((v) => (k > 0 ? v + (255 - v) * k : v * (1 + k))));
/** Stucco in soft patches of three close shades. */
const stucco = (h: string, seed: number) => shades([h, tone(h, -0.04), tone(h, 0.05)], 2, seed);

const K = {
  white: shades(["#f4f0e8", "#efeae0", "#f8f5ee"], 2, 11),
  trim: C("#fbf8f2"),
  grass: shades(["#6fae4f", "#67a648", "#78b757", "#5f9c43"], 1, 12),
  lawnDark: shades(["#5a9a40", "#52913a"], 1, 13),
  hedge: shades(["#2f7a3a", "#36863f", "#2a6e34"], 1, 14),
  path: shades(["#e6dccb", "#ddd3c2", "#ebe2d2"], 1, 15),
  concrete: shades(["#c9c5bd", "#c1bdb5", "#d0ccc4"], 2, 16),
  asphalt: shades(["#3c3a40", "#38363c", "#413f45"], 2, 17),
  line: C("#f2efe6"),
  terracotta: shades(["#c8664a", "#bd5e43", "#d06e50"], 1, 18),
  shingle: shades(["#5a5f6e", "#535867", "#606575"], 1, 19),
  wood: shades(["#b0835a", "#a77b53", "#b88b61"], 1, 20),
  deck: shades(["#c49a6c", "#ba9064", "#cba274"], 1, 21),
  sand: shades(["#efdcae", "#e8d4a4", "#f3e3b8"], 2, 22),
  trunkA: C("#8a6a48"),
  trunkB: C("#76593c"),
  frond: [C("#3f9a3c"), C("#4cab45"), C("#348534"), C("#5bb850")],
  coconut: C("#5a3e22"),
  pool: E("#46d2e8", 0.75),
  poolDeep: E("#2fb4d6", 0.7),
  coping: C("#f2eee6"),
  glass: G("#2a4a5e"),
  glassDark: G("#1a2430"),
  chrome: C("#d8dce4"),
  black: C("#1a1a20"),
  red: C("#d8333f"),
  litWarm: E("#ffd49a", 1.1),
  litCool: E("#cfeeff", 1.0),
  flamingo: C("#ff7fb0"),
};

const NEON = (h: string, k = 2.2) => E(h, k);

// ---- small things -------------------------------------------------------------------------------

/** A palm: a ringed, slightly leaning trunk and a crown of drooping fronds (h voxels tall). */
export function palm(m: VoxelModel, x: number, z: number, y0: number, h: number, seed: number) {
  const r = rand(seed * 7 + 3);
  const a = r() * Math.PI * 2;
  const lean = 0.12 + r() * 0.22;
  let tx = x,
    tz = z;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    tx = x + Math.cos(a) * lean * t * t * h * 0.5;
    tz = z + Math.sin(a) * lean * t * t * h * 0.5;
    const c = Math.floor(y / 3) % 2 ? K.trunkA : K.trunkB;
    m.box(Math.round(tx) - 1, y0 + y, Math.round(tz) - 1, Math.round(tx) + 1, y0 + y + 1, Math.round(tz) + 1, c);
  }
  const top = y0 + h;
  const n = 9 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const fa = (i / n) * Math.PI * 2 + r() * 0.35;
    const L = 15 + Math.floor(r() * 6);
    const c = K.frond[Math.floor(r() * K.frond.length)];
    const ca = Math.cos(fa),
      sa = Math.sin(fa);
    for (let s = 0; s <= L; s++) {
      const u = s / L;
      const dy = 2.5 * Math.sin(u * Math.PI * 0.6) - u * u * 9;
      const px = tx + ca * s,
        pz = tz + sa * s,
        py = top + dy;
      m.set(px, py, pz, c);
      // the leaflets: a feather either side, hanging a little
      if (s > 2 && s < L) {
        const w = s < L * 0.7 ? 2 : 1;
        for (let k = 1; k <= w; k++) {
          m.set(px - sa * k, py - (k > 1 ? 1 : 0), pz + ca * k, c);
          m.set(px + sa * k, py - (k > 1 ? 1 : 0), pz - ca * k, c);
        }
      }
    }
  }
  // the heart of the crown and its coconuts
  m.box(Math.round(tx) - 2, top - 1, Math.round(tz) - 2, Math.round(tx) + 2, top + 2, Math.round(tz) + 2, K.frond[2]);
  for (const [dx, dz] of [
    [2, 0],
    [-1, 2],
    [0, -2],
  ])
    m.set(Math.round(tx) + dx, top - 2, Math.round(tz) + dz, K.coconut);
}

/** A raised pool with its coping, water lit from within, steps and a ladder. */
function pool(m: VoxelModel, x0: number, z0: number, x1: number, z1: number, y = 0) {
  m.box(x0, y, z0, x1, y + 3, z1, K.coping);
  m.box(x0 + 1, y + 1, z0 + 1, x1 - 1, y + 3, z1 - 1, K.poolDeep);
  m.box(x0 + 2, y + 2, z0 + 2, x1 - 2, y + 3, z1 - 2, K.pool);
  m.box(x1 - 4, y + 3, z0, x1 - 3, y + 6, z0 + 1, K.chrome);
  m.box(x1 - 2, y + 3, z0, x1 - 1, y + 6, z0 + 1, K.chrome);
}

/** A sun lounger (pointing +z) with its towel. */
function lounger(m: VoxelModel, x: number, z: number, towel: string) {
  m.box(x, 1, z, x + 4, 2, z + 10, K.white);
  m.box(x, 2, z, x + 4, 4, z + 2, K.white);
  m.box(x + 1, 2, z + 2, x + 3, 2.5, z + 9, C(towel));
  m.set(x, 0, z, K.chrome);
  m.set(x + 3, 0, z + 9, K.chrome);
}

/** A beach / terrace umbrella in stripes. */
export function umbrella(m: VoxelModel, x: number, z: number, y0: number, a: string, b: string, r = 7) {
  m.box(x, y0, z, x + 1, y0 + 14, z + 1, K.white);
  const ca = C(a),
    cb = C(b);
  for (let k = 0; k < 3; k++) {
    const rr = r - k * 2.2;
    for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++)
      for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) {
        if (dx * dx + dz * dz > rr * rr) continue;
        const ang = Math.atan2(dz, dx);
        m.set(x + dx, y0 + 13 + k, z + dz, Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2 ? ca : cb);
      }
  }
}

/** A café table and two chairs. */
function table(m: VoxelModel, x: number, z: number) {
  m.box(x, 0, z, x + 1, 4, z + 1, K.chrome);
  m.box(x - 2, 4, z - 2, x + 3, 5, z + 3, K.white);
  for (const dx of [-5, 4]) {
    m.box(x + dx, 0, z - 1, x + dx + 2, 3, z + 2, K.chrome);
    m.box(x + dx + (dx < 0 ? 0 : 1), 3, z - 1, x + dx + (dx < 0 ? 1 : 2), 6, z + 2, K.chrome);
  }
}

/** A hedge along x or z. */
function hedge(m: VoxelModel, x0: number, z0: number, x1: number, z1: number, h = 5) {
  m.box(x0, 0, z0, x1, h, z1, K.hedge);
}

/** Lawn (one voxel of grass) over a rectangle. */
function lawn(m: VoxelModel, x0: number, z0: number, x1: number, z1: number) {
  m.box(x0, 0, z0, x1, 1, z1, K.grass);
}

/** The pink flamingo on the lawn. */
function flamingo(m: VoxelModel, x: number, z: number) {
  m.box(x, 1, z, x + 1, 5, z + 1, K.flamingo);
  m.box(x - 1, 5, z - 1, x + 2, 7, z + 2, K.flamingo);
  m.box(x + 1, 7, z, x + 2, 10, z + 1, K.flamingo);
  m.set(x + 1, 10, z + 1, C("#202020"));
}

/** A mailbox on its post. */
function mailbox(m: VoxelModel, x: number, z: number, color: string) {
  m.box(x, 1, z, x + 1, 6, z + 1, K.wood);
  m.box(x - 1, 6, z - 1, x + 2, 8, z + 3, C(color));
}

/** Window with white trim and a coloured shutter either side. */
function shutterWindow(m: VoxelModel, x: number, y: number, w: number, h: number, fz: number, shutter: number, lit: boolean, seed: number) {
  win(m, x, y, w, h, fz, { lit: lit ? "warm" : false, frame: K.trim, mullion: "cross", seed, curtain: lit });
  m.box(x - 3, y, fz, x - 1, y + h, fz + 1, shutter);
  m.box(x + w + 1, y, fz, x + w + 3, y + h, fz + 1, shutter);
}

/** A deco "eyebrow": a thin white shade over a window run, sticking out. */
function eyebrow(m: VoxelModel, x0: number, x1: number, y: number, fz: number, out = 3, color: Paint = K.trim) {
  m.box(x0, y, fz, x1, y + 1, fz + out, color);
}

// ---- the houses ---------------------------------------------------------------------------------

/** A pastel bungalow: siding, a porch with columns, a hipped roof, a lawn with a picket fence. */
function bungalow(l: KLot): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const r = rand(l.seed);
  const m = new VoxelModel(W, 48, D);
  const paint = l.paint ?? "#acd6ef";
  lawn(m, 0, 0, W, D);
  const bw = Math.min(W - 24, 70),
    bd = Math.min(D - 44, 56);
  const x0 = Math.floor((W - bw) / 2) + (r() > 0.5 ? 4 : -4),
    x1 = x0 + bw;
  const fz = D - 30,
    z0 = fz - bd;
  const sid = C(paint),
    sid2 = C(tone(paint, -0.08));
  m.box(x0, 0, z0, x1, 21, fz, (_x, y) => (y % 3 === 0 ? sid2 : sid));
  m.box(x0, 0, z0, x1, 2, fz, C("#8a8790"));
  // corner boards
  for (const x of [x0, x1 - 1]) m.box(x, 0, fz - 1, x + 1, 21, fz, K.trim);
  // the door and the windows
  const dx = Math.floor((x0 + x1) / 2) - 3;
  m.box(dx - 1, 2, fz - 1, dx + 7, 16, fz, K.trim);
  m.clear(dx, 2, fz - 2, dx + 6, 15, fz);
  m.box(dx, 2, fz - 3, dx + 6, 15, fz - 2, C(tone(paint, -0.35)));
  m.box(dx + 1, 10, fz - 3, dx + 5, 13, fz - 2, K.litWarm);
  const sh = C(tone(paint, -0.3));
  for (const wx of [x0 + 6, dx - 14, dx + 13, x1 - 14]) if (wx > x0 + 3 && wx + 8 < x1 - 2 && (wx < dx - 4 || wx > dx + 9)) shutterWindow(m, wx, 6, 8, 9, fz, sh, r() > 0.45, l.seed + wx);
  // porch: deck, columns, rail, its own roof
  m.box(x0 + 4, 0, fz, x1 - 4, 3, fz + 11, K.deck);
  m.box(dx - 1, 0, fz + 11, dx + 7, 2, fz + 14, K.deck);
  for (const cx of [x0 + 4, dx - 2, dx + 7, x1 - 5]) m.box(cx, 3, fz + 9, cx + 1, 20, fz + 10, K.trim);
  for (let x = x0 + 4; x < x1 - 4; x++) if (x < dx - 2 || x > dx + 7) m.box(x, 3, fz + 9, x + 1, 7, fz + 10, x % 2 ? K.trim : 0);
  m.box(x0 + 4, 6, fz + 9, dx - 2, 7, fz + 10, K.trim);
  m.box(dx + 7, 6, fz + 9, x1 - 4, 7, fz + 10, K.trim);
  m.box(x0 + 3, 20, fz, x1 - 3, 21, fz + 11, K.trim);
  m.box(x0 + 2, 21, fz, x1 - 2, 22, fz + 12, K.shingle);
  // porch swing chairs and a lamp
  m.box(x0 + 8, 3, fz + 3, x0 + 13, 7, fz + 6, K.white);
  m.box(dx + 8, 14, fz, dx + 9, 16, fz + 1, E("#ffd08a", 2));
  // hipped roof
  const roof = r() > 0.5 ? K.shingle : K.terracotta;
  for (let k = 0; k < 13; k++) m.box(x0 - 2 + k, 21 + k, z0 - 2 + k, x1 + 2 - k, 22 + k, fz + 2 - k, roof);
  m.box(x0 + 8, 24, z0 + 10, x0 + 11, 36, z0 + 13, C("#9a6a5a"));
  // the path, the fence and its gate, the mailbox, the flamingo, a palm
  m.box(dx, 0, fz + 14, dx + 6, 1, D, K.path);
  for (let x = 1; x < W - 1; x++) {
    if (x >= dx - 1 && x < dx + 7) continue;
    if (x % 2 === 0) m.box(x, 1, D - 2, x + 1, 6, D - 1, K.trim);
  }
  m.box(1, 4, D - 2, dx - 1, 5, D - 1, K.trim);
  m.box(dx + 7, 4, D - 2, W - 1, 5, D - 1, K.trim);
  mailbox(m, dx + 9, D - 5, paint);
  flamingo(m, x0 + 6 + Math.floor(r() * 6), fz + 20);
  flamingo(m, x0 + 12 + Math.floor(r() * 6), fz + 23);
  palm(m, r() > 0.5 ? 6 : W - 7, Math.floor(D * 0.35), 1, 40 + Math.floor(r() * 12), l.seed);
  acUnit(m, x1, 3, Math.floor((z0 + fz) / 2));
  // a driveway along one side, to the back
  const side = dx > W / 2 ? 2 : W - 12;
  m.box(side, 0, 6, side + 10, 1, D - 2, K.concrete);
  return { model: m, signs: [], door: [dx + 3, fz], lights: [] };
}

/** A Miami-deco house: rounded corner, eyebrows, racing stripes, glass blocks, a stepped parapet. */
function decoHouse(l: KLot): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const r = rand(l.seed);
  const m = new VoxelModel(W, 64, D);
  const paint = l.paint ?? "#f3b3c8";
  const accent = C(tone(paint, -0.38));
  lawn(m, 0, 0, W, D);
  const bw = Math.min(W - 18, 78),
    bd = Math.min(D - 36, 60);
  const x0 = Math.floor((W - bw) / 2),
    x1 = x0 + bw;
  const fz = D - 24,
    z0 = fz - bd;
  const H = 38;
  const body = stucco(paint, l.seed);
  m.box(x0, 0, z0, x1, H, fz, body);
  // the rounded front corner (left or right)
  const left = r() > 0.5;
  const R = 12;
  const ccx = left ? x0 + R : x1 - R,
    ccz = fz - R;
  for (let x = left ? x0 : x1 - R; x < (left ? x0 + R : x1); x++)
    for (let z = fz - R; z < fz; z++) if ((x + 0.5 - ccx) ** 2 + (z + 0.5 - ccz) ** 2 > R * R) m.clear(x, 0, z, x + 1, H + 6, z + 1);
  // racing stripes round the corner
  for (const y of [22, 24, 26])
    for (let x = x0; x < x1; x++)
      for (let z = z0; z < fz; z++) {
        if (!m.get(x, y, z)) continue;
        const edge = !m.get(x, y, z + 1) || !m.get(x - 1, y, z) || !m.get(x + 1, y, z);
        if (edge) m.set(x, y, z, accent);
      }
  // windows: a corner band upstairs, wide panes down, eyebrows over all
  const wx0 = left ? x0 + R + 2 : x0 + 6,
    wx1 = left ? x1 - 8 : x1 - R - 2;
  for (let x = wx0; x + 10 <= wx1; x += 14) {
    win(m, x, 6, 10, 10, fz, { lit: r() > 0.5 ? "warm" : false, frame: K.trim, mullion: "v", seed: l.seed + x });
    eyebrow(m, x - 2, x + 12, 17, fz, 3);
    win(m, x, 27, 10, 8, fz, { lit: r() > 0.4 ? "warm" : false, frame: K.trim, mullion: "h", seed: l.seed + x + 99 });
    eyebrow(m, x - 2, x + 12, 36, fz, 3);
  }
  // a porthole by the door and a glass-block strip up the stair
  const doorX = left ? x1 - 14 : x0 + 8;
  m.box(doorX - 1, 0, fz - 1, doorX + 7, 15, fz, K.trim);
  m.clear(doorX, 0, fz - 2, doorX + 6, 14, fz);
  m.box(doorX, 0, fz - 3, doorX + 6, 14, fz - 2, C("#2a2a34"));
  m.box(doorX + 1, 4, fz - 3, doorX + 5, 12, fz - 2, K.litWarm);
  m.box(doorX - 2, 15, fz, doorX + 8, 16, fz + 6, K.trim);
  for (let y = 18; y < H - 2; y++) for (let x = doorX + 1; x < doorX + 5; x++) m.set(x, y, fz - 1, (x + y) % 2 ? E("#dff4ff", 0.6) : C("#cfe6f0"));
  // the parapet, stepped up in the middle (the deco crown)
  m.box(x0, H, z0, x1, H + 2, fz, K.trim);
  const mid = Math.floor((x0 + x1) / 2);
  for (let k = 0; k < 3; k++) m.box(mid - 12 + k * 4, H + 2 + k * 2, fz - 4, mid + 12 - k * 4, H + 4 + k * 2, fz, k === 1 ? accent : K.trim);
  m.box(mid - 1, H + 8, fz - 3, mid + 1, H + 12, fz - 1, NEON(tone(paint, -0.2), 1.6));
  // terrace upstairs at the back, an AC unit
  acUnit(m, left ? x0 - 5 : x1, 6, z0 + 10);
  // front garden: low wall in the house's colour, a gate, a palm, a hedge
  for (let x = 1; x < W - 1; x++) if (x < doorX - 1 || x > doorX + 7) m.box(x, 1, D - 2, x + 1, 5, D, body);
  m.box(doorX, 0, fz, doorX + 6, 1, D, K.path);
  palm(m, left ? x1 - 6 : x0 + 6, D - 12, 1, 46 + Math.floor(r() * 10), l.seed + 5);
  hedge(m, x0, fz + 3, left ? x0 + 14 : doorX - 3, fz + 7, 4);
  m.box(W - 14, 0, 2, W - 3, 1, D - 3, K.concrete);
  return { model: m, signs: [], door: [doorX + 3, fz], lights: [] };
}

/** A modern villa: white cubes, a cantilevered upper floor, wood slats, a pool and its palms. */
function villa(l: KLot): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const r = rand(l.seed);
  const m = new VoxelModel(W, 66, D);
  const paint = l.paint ?? "#f6efe2";
  lawn(m, 0, 0, W, D);
  // the house at the back, the garden and pool in front
  const bw = Math.min(W - 14, 82),
    bd = Math.min(Math.floor(D * 0.48), 52);
  const x0 = Math.floor((W - bw) / 2),
    x1 = x0 + bw;
  const z0 = 6,
    fz = z0 + bd;
  const walls = stucco(paint, l.seed);
  const accent = C(tone(paint === "#f6efe2" || paint === "#f2eee6" || paint === "#efe9dd" ? "#8fd9d6" : paint, -0.15));
  // ground floor: glass front, lit
  m.box(x0, 0, z0, x1, 20, fz, walls);
  m.box(x0 + 4, 1, fz - 1, x1 - 20, 19, fz, K.glass);
  for (let x = x0 + 4; x < x1 - 20; x += 9) m.box(x, 1, fz - 1, x + 1, 19, fz, K.black);
  m.box(x0 + 5, 1, fz - 3, x1 - 21, 18, fz - 2, r() > 0.3 ? K.litWarm : K.litCool);
  // upper floor sliding out over the terrace, wood slats on its side
  const ux0 = x0 - 4 + (r() > 0.5 ? 10 : 0),
    ux1 = ux0 + bw - 14;
  m.box(ux0, 20, z0 + 2, ux1, 38, fz + 10, walls);
  m.box(ux0 + 6, 23, fz + 9, ux1 - 6, 35, fz + 10, K.glassDark);
  m.box(ux0 + 7, 23, fz + 7, ux1 - 7, 34, fz + 8, r() > 0.5 ? K.litWarm : K.glassDark);
  for (let x = ux0 + 6; x < ux1 - 6; x += 2) m.box(x, 23, fz + 10, x + 1, 35, fz + 11, x % 4 ? K.wood : 0);
  m.box(ux0 - 1, 38, z0 + 1, ux1 + 1, 39, fz + 12, K.trim);
  // the stair tower and its roof terrace with a glass rail
  m.box(x1 - 18, 20, z0, x1, 44, z0 + 20, walls);
  m.box(x1 - 16, 26, z0 + 20, x1 - 12, 40, z0 + 21, accent);
  for (let x = ux0; x < ux1; x++) m.set(x, 39, fz + 11, x % 3 ? G("#9ad8e8") : K.chrome);
  // a long accent wall by the entrance, the door
  m.box(x1 - 19, 0, fz, x1 - 17, 24, fz + 14, accent);
  m.clear(x1 - 15, 0, fz - 1, x1 - 9, 14, fz);
  m.box(x1 - 15, 0, fz - 2, x1 - 9, 14, fz - 1, K.wood);
  // the pool in the garden, the loungers, an umbrella, palms
  const pz0 = fz + 16,
    pz1 = Math.min(D - 10, pz0 + 30);
  const px0 = x0 + 2,
    px1 = Math.min(x1 - 22, px0 + 52);
  m.box(px0 - 4, 0, pz0 - 4, px1 + 4, 1, pz1 + 4, K.path);
  if (pz1 - pz0 > 10) {
    pool(m, px0, pz0, px1, pz1);
    for (let k = 0; k < 3; k++) lounger(m, px1 + 2 + (k % 2) * 5, pz0 + k * 3, ["#ff7fb0", "#46c8e0", "#f4b728"][k]);
    umbrella(m, px1 + 8, pz1 - 2, 1, "#ffffff", tone(paint === "#f6efe2" ? "#46c8e0" : paint, -0.25), 6);
  }
  palm(m, 5, D - 8, 1, 50 + Math.floor(r() * 12), l.seed);
  palm(m, W - 6, fz + 10, 1, 44 + Math.floor(r() * 12), l.seed + 1);
  if (r() > 0.4) palm(m, Math.floor(W / 2), D - 6, 1, 38, l.seed + 2);
  // hedges and a white wall with the gate, the drive
  hedge(m, 0, 0, 2, D - 4, 6);
  hedge(m, W - 2, 0, W, D - 4, 6);
  for (let x = 0; x < W; x++) if (x < x1 - 17 || x > x1 - 6) m.box(x, 0, D - 3, x + 1, 7, D - 1, K.white);
  m.box(x1 - 17, 0, fz, x1 - 6, 1, D, K.concrete);
  for (const lx of [x1 - 18, x1 - 6]) m.box(lx, 7, D - 3, lx + 1, 8, D - 2, E("#ffe0a8", 1.8));
  return { model: m, signs: [], door: [x1 - 12, fz], lights: [] };
}

// ---- the shops ----------------------------------------------------------------------------------

interface Front {
  interior: number;
  awning?: [string, string];
  fascia: string;
}
const TRADES: Record<KTrade, Front> = {
  konbini: { interior: E("#eef8ff", 1.0), fascia: "#f2eee6" },
  tacos: { interior: E("#ffd49a", 0.95), awning: ["#2f9a5a", "#f4e8a8"], fascia: "#d8333f" },
  surf: { interior: E("#fff2d8", 0.9), awning: ["#1c9ad6", "#f6efe2"], fascia: "#1c6a8a" },
  lounge: { interior: E("#c06bff", 0.9), fascia: "#1e1a26" },
  laundry: { interior: E("#f4fbff", 1.0), awning: ["#4dbf9a", "#f6efe2"], fascia: "#f6efe2" },
  pawn: { interior: E("#ffe6b0", 0.9), fascia: "#2a2630" },
  icecream: { interior: E("#fff0f6", 1.0), awning: ["#ff7fb0", "#fff6fa"], fascia: "#ff7fb0" },
};

/** A shop on the boulevard: one or two storeys, its front, its sign on the fascia and its trade's things. */
function shop(l: KLot): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const r = rand(l.seed);
  const trade = l.trade ?? "konbini";
  const two = trade === "surf" || trade === "lounge" || trade === "pawn";
  const H = two ? 40 : 24;
  const m = new VoxelModel(W, H + 34, D);
  const t = TRADES[trade];
  const paint = l.paint ?? "#f2eee6";
  const walls = stucco(paint, l.seed);
  const fz = D - 2;
  const x0 = 1,
    x1 = W - 1;
  // the shop takes the front of its lot; behind it, its yard
  const zb = Math.max(4, fz - 66 - Math.floor(r() * 8));
  m.box(x0, 0, zb, x1, H, fz, walls);
  m.box(0, 0, 0, W, 1, zb, K.concrete);
  backYard(m, 0, W, zb, l.seed);
  // the front: glass between mullions, the interior lit, shelves, a counter
  const gx0 = x0 + 4,
    gx1 = x1 - 4,
    top = 15;
  m.clear(gx0, 1, fz - 8, gx1, top, fz);
  m.box(gx0, 1, fz - 9, gx1, top, fz - 8, t.interior);
  m.box(gx0, top - 1, fz - 8, gx1, top, fz, t.interior);
  const goods = trade === "surf" ? ["#1c9ad6", "#ff8a3a", "#f4e8a8", "#ff4fa3"] : trade === "icecream" ? ["#ffb3cf", "#fff3c4", "#9fe0c8", "#c9a07a"] : ["#e05a5a", "#5ab0e0", "#e0c05a", "#7ad07a", "#e08ac0", "#f0f0f0"];
  for (let sy = 3; sy < top - 3; sy += 4)
    for (let x = gx0; x < gx1; x++) if (hash(x, sy, l.seed) > 0.3) m.set(x, sy, fz - 8, C(goods[Math.floor(hash(x, sy, l.seed, 2) * goods.length)]));
  m.box(gx0 + 2, 1, fz - 5, gx0 + 12, 6, fz - 3, C("#d8d4cc"));
  if (trade === "laundry") for (let x = gx0 + 2; x < gx1 - 4; x += 6) {
    m.box(x, 1, fz - 8, x + 5, 7, fz - 6, K.white);
    m.box(x + 1, 2, fz - 6, x + 4, 6, fz - 5, G("#6a8a9a"));
  }
  if (trade === "lounge") for (let x = gx0 + 1; x < gx1; x += 5) m.box(x, 2, fz - 8, x + 1, top - 2, fz - 7, NEON(x % 2 ? "#ff4fa3" : "#34e7ff", 1.8));
  const doorX = Math.floor((gx0 + gx1) / 2) - 3;
  for (let x = gx0; x <= gx1; x += 8) if (x < doorX - 1 || x > doorX + 6) m.box(x, 1, fz - 1, x + 1, top, fz, K.chrome);
  m.box(doorX - 1, 1, fz - 1, doorX, top, fz, K.chrome);
  m.box(doorX + 6, 1, fz - 1, doorX + 7, top, fz, K.chrome);
  for (let x = gx0; x < gx1; x++) if (x < doorX - 1 || x > doorX + 6) m.box(x, 1, fz - 1, x + 1, 3, fz, C("#2b2933"));
  m.box(gx0 - 1, top, fz - 1, gx1 + 1, top + 1, fz, K.chrome);
  // fascia for the sign
  const fascia = C(t.fascia);
  m.box(x0, top + 1, fz - 1, x1, top + 8, fz + 1, fascia);
  m.box(x0, top + 8, fz - 1, x1, top + 9, fz + 1, NEON(l.neon ?? "#ff4fa3", 1.6));
  // awning
  if (t.awning) {
    const [a, b] = t.awning.map((h) => C(h));
    for (let k = 0; k < 6; k++) m.box(gx0 - 1, top - Math.floor(k / 2), fz + 1 + k, gx1 + 1, top + 1 - Math.floor(k / 2), fz + 2 + k, (x) => (Math.floor(x / 3) % 2 ? a : b));
  }
  // upstairs: windows with eyebrows, a balcony
  if (two) {
    for (let x = x0 + 5; x + 10 < x1 - 3; x += 15) {
      win(m, x, 26, 10, 9, fz - 1, { lit: r() > 0.5 ? "warm" : false, frame: K.trim, mullion: "v", seed: l.seed + x });
      eyebrow(m, x - 2, x + 12, 36, fz - 1, 3);
    }
  }
  // the parapet with its coloured cap, the roof's clutter inside it
  m.box(x0, H, zb, x1, H + 3, fz, walls);
  m.clear(x0 + 1, H + 1, zb + 1, x1 - 1, H + 3, fz - 1);
  m.box(x0 + 1, H, zb + 1, x1 - 1, H + 1, fz - 1, C("#b8b4ac"));
  m.box(x0, H + 3, zb, x1, H + 4, zb + 1, C(tone(paint, -0.3)));
  m.box(x0, H + 3, fz - 1, x1, H + 4, fz, C(tone(paint, -0.3)));
  roofKit(m, x0 + 2, x1 - 2, zb + 2, fz - 3, H + 1, l.seed);
  const sx = Math.floor(W / 2);
  const signs: KSign[] = [{ text: l.name ?? "SHOP", color: l.neon ?? "#ff4fa3", x: sx, y: top + 4.5, z: fz + 1.2, w: x1 - x0 - 8, h: 6, vertical: false, facing: "front" }];
  // the trade's own things outside
  if (trade === "surf")
    for (let k = 0; k < 5; k++) {
      const bx = gx1 - 2 - k * 3;
      m.box(bx, 0, fz + 1, bx + 2, 16 + (k % 2) * 3, fz + 2, C(["#ff8a3a", "#1c9ad6", "#f4e8a8", "#ff4fa3", "#4dffb8"][k]));
    }
  if (trade === "tacos") {
    table(m, gx0 + 4, fz + 6);
    umbrella(m, gx0 + 4, fz + 6, 0, "#2f9a5a", "#f4e8a8", 5);
  }
  if (trade === "konbini") {
    m.box(gx1 - 12, 0, fz + 1, gx1 - 9, 6, fz + 3, C("#3a6a9a"));
    m.box(gx1 - 8, 0, fz + 1, gx1 - 5, 6, fz + 3, C("#4a8a4a"));
    m.box(gx1 - 4, 0, fz + 1, gx1 - 1, 9, fz + 3, C("#c8323a"));
    m.box(gx1 - 4, 5, fz + 3, gx1 - 1, 8, fz + 4, E("#e8f6ff", 1.2));
  }
  if (trade === "pawn") {
    for (let x = gx0; x < gx1; x += 2) m.box(x, 3, fz, x + 1, top, fz + 1, C("#3a3742"));
    // the ZEC cash machine in the wall
    m.box(x1 - 1, 3, fz - 12, x1 + 0, 12, fz - 6, C("#2a2630"));
  }
  if (trade === "icecream") {
    // the giant cone on the roof
    const cx = sx,
      cz = Math.floor((zb + fz) / 2);
    for (let y = 0; y < 16; y++) {
      const rr = 1 + y * 0.32;
      for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) if (dx * dx + dz * dz <= rr * rr) m.set(cx + dx, H + 4 + y, cz + dz, (dx + dz + y) % 3 ? C("#d9a05a") : C("#b47a3a"));
    }
    m.blob(cx, H + 23, cz, 6.5, C("#ffb3cf"), 0.12, 3);
    m.blob(cx, H + 29, cz, 5, C("#fff3c4"), 0.12, 4);
    m.set(cx, H + 34, cz, C("#d8333f"));
  }
  if (trade === "lounge") {
    m.box(doorX - 3, 0, fz + 2, doorX - 2, 5, fz + 3, K.chrome);
    m.box(doorX + 8, 0, fz + 2, doorX + 9, 5, fz + 3, K.chrome);
    m.box(doorX - 2, 4, fz + 2, doorX + 8, 5, fz + 3, C("#a01e3a"));
    // a vertical blade sign at the corner
    m.box(x1 - 2, 18, fz, x1, H + 10, fz + 8, C("#1a1820"));
    signs.push({ text: "LOUNGE", color: "#b56bff", x: x1, y: (18 + H + 10) / 2, z: fz + 4, w: 8, h: H - 8, vertical: true, facing: "side" });
  }
  return { model: m, signs, door: [doorX + 3, fz], lights: [[sx, top - 2, fz - 4, "#ffe0b0"]] };
}

/** The diner: chrome and red, rounded ends, a window band of booths, the sign on the roof. */
function diner(l: KLot): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const m = new VoxelModel(W, 50, D);
  m.box(0, 0, 0, W, 1, D, K.concrete);
  const x0 = 6,
    x1 = W - 6;
  const fz = D - 10,
    z0 = Math.max(8, fz - 50);
  const R = (fz - z0) / 2,
    cz = (z0 + fz) / 2;
  const inside = (x: number, z: number) => {
    if (x >= x0 + R && x < x1 - R) return z >= z0 && z < fz;
    const cx = x < x0 + R ? x0 + R : x1 - R;
    return (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= R * R;
  };
  for (let x = x0; x < x1; x++)
    for (let z = z0; z < fz; z++) {
      if (!inside(x, z)) continue;
      for (let y = 0; y < 22; y++) m.set(x, y, z, y < 3 ? C("#2a2a30") : y < 7 ? (y % 2 ? K.chrome : C("#b8bcc6")) : y < 15 ? K.glass : y < 17 ? K.red : y < 19 ? K.chrome : K.white);
    }
  // the window band: the booths lit behind
  for (let x = x0 + 2; x < x1 - 2; x++)
    for (let z = z0 + 2; z < fz - 2; z++) {
      if (!inside(x, z) || inside(x, z + 3) && inside(x, z - 3) && inside(x + 3, z) && inside(x - 3, z)) continue;
      for (let y = 7; y < 15; y++) if (inside(x, z + 1) || inside(x, z - 1)) m.set(x, y, z, y === 7 || y === 14 ? K.red : K.litWarm);
    }
  // the entrance porch in the middle of the front
  const mid = Math.floor((x0 + x1) / 2);
  m.box(mid - 6, 0, fz - 2, mid + 6, 22, fz + 6, K.white);
  m.clear(mid - 3, 1, fz - 3, mid + 3, 15, fz + 6);
  m.box(mid - 3, 1, fz - 3, mid + 3, 15, fz - 2, K.litWarm);
  m.box(mid - 7, 22, fz - 2, mid + 7, 24, fz + 7, K.red);
  // the roof: a stepped crown and the sign's frame
  m.box(x0 + R, 22, z0 + 2, x1 - R, 24, fz - 2, C("#c4c1ca"));
  m.box(mid - 22, 24, cz - 1, mid + 22, 40, cz + 1, C("#1a1820"));
  for (let x = mid - 22; x < mid + 22; x += 4) m.box(x, 40, cz - 1, x + 2, 42, cz + 1, NEON("#ffd23a", 2));
  // parking bays in front
  for (let x = 4; x < W - 4; x += 16) m.box(x, 1, fz + 10, x + 1, 1.2, D - 2, K.line);
  const signs: KSign[] = [
    { text: l.name ?? "DINER", color: l.neon ?? "#ff4f6a", x: mid, y: 32, z: cz + 1.2, w: 42, h: 14, vertical: false, facing: "front" },
    { text: "OPEN 24/7", color: "#34e7ff", x: mid, y: 19.5, z: fz + 7.2, w: 13, h: 3.5, vertical: false, facing: "front" },
  ];
  return { model: m, signs, door: [mid, fz + 6], lights: [[mid, 12, fz + 2, "#ffd49a"]] };
}

/** ZEC FUEL: the canopy over two islands of pumps, the shop at the back, the price pylon. */
function gas(l: KLot): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const m = new VoxelModel(W, 90, D);
  m.box(0, 0, 0, W, 1, D, K.concrete);
  for (let x = 0; x < W; x += 12) m.box(x, 1, 0, x + 6, 1.1, D, C("#bdb9b1"));
  // the shop at the back
  const sz0 = 4,
    sz1 = 58;
  const sx0 = 14,
    sx1 = W - 14;
  m.box(sx0, 0, sz0, sx1, 24, sz1, stucco("#f2eee6", l.seed));
  m.clear(sx0 + 6, 1, sz1 - 8, sx1 - 30, 16, sz1);
  m.box(sx0 + 6, 1, sz1 - 9, sx1 - 30, 16, sz1 - 8, E("#eef8ff", 1.0));
  for (let x = sx0 + 6; x < sx1 - 30; x += 7) m.box(x, 1, sz1 - 1, x + 1, 16, sz1, K.chrome);
  m.box(sx0, 16, sz1 - 1, sx1, 24, sz1 + 1, C("#1c6a8a"));
  m.box(sx0, 24, sz1 - 1, sx1, 25, sz1 + 1, NEON("#f4b728", 1.8));
  // ice chest and the air pump
  m.box(sx1 - 26, 0, sz1 + 1, sx1 - 18, 6, sz1 + 5, C("#e8f4ff"));
  m.box(sx1 - 14, 0, sz1 + 2, sx1 - 11, 9, sz1 + 4, K.red);
  // the canopy on four columns, lit underneath
  const cz0 = sz1 + 18,
    cz1 = D - 14;
  const cx0 = 10,
    cx1 = W - 10;
  for (const x of [cx0 + 6, cx1 - 8]) for (const z of [cz0 + 6, cz1 - 8]) m.box(x, 0, z, x + 3, 32, z + 3, K.white);
  m.box(cx0, 32, cz0, cx1, 37, cz1, K.white);
  m.box(cx0, 33, cz0 - 1, cx1, 37, cz0, C("#1c6a8a"));
  m.box(cx0, 33, cz1, cx1, 37, cz1 + 1, C("#1c6a8a"));
  m.box(cx0 - 1, 33, cz0, cx0, 37, cz1, C("#1c6a8a"));
  m.box(cx1, 33, cz0, cx1 + 1, 37, cz1, C("#1c6a8a"));
  m.box(cx0, 37, cz0 - 1, cx1, 38, cz1 + 1, NEON("#f4b728", 1.6));
  // the canopy's roof: white, and a big gold Z on it for the helicopters
  m.box(cx0 + 1, 37, cz0, cx1 - 1, 38, cz1, K.white);
  {
    const zx0 = Math.floor((cx0 + cx1) / 2) - 14,
      zx1 = zx0 + 28,
      zz0 = cz0 + 6,
      zz1 = cz1 - 6;
    const gold = C("#f4b728");
    m.box(zx0, 38, zz0, zx1, 39, zz0 + 4, gold);
    m.box(zx0, 38, zz1 - 4, zx1, 39, zz1, gold);
    for (let z = zz0 + 4; z < zz1 - 4; z++) {
      const t = (z - zz0 - 4) / Math.max(1, zz1 - zz0 - 8);
      const x = Math.round(zx1 - 5 - t * (zx1 - zx0 - 5));
      m.box(x, 38, z, x + 5, 39, z + 1, gold);
    }
  }
  for (let x = cx0 + 4; x < cx1 - 4; x += 10) for (let z = cz0 + 4; z < cz1 - 4; z += 10) m.box(x, 31, z, x + 6, 32, z + 6, E("#f4fbff", 1.6));
  // two islands, two pumps each
  const mid = Math.floor((cz0 + cz1) / 2);
  for (const iz of [mid - 16, mid + 10]) {
    m.box(cx0 + 16, 0, iz, cx1 - 16, 2, iz + 6, K.coping);
    for (const px of [cx0 + 26, cx1 - 30]) {
      m.box(px, 2, iz + 1, px + 4, 12, iz + 5, K.white);
      m.box(px, 9, iz + 1, px + 4, 11, iz + 5, C("#1c6a8a"));
      m.box(px + 1, 6, iz + 5, px + 3, 8, iz + 6, E("#4dffb8", 1.4));
      m.box(px + 1, 6, iz, px + 3, 8, iz + 1, E("#4dffb8", 1.4));
      m.box(px + 4, 4, iz + 2, px + 5, 9, iz + 3, K.black);
    }
  }
  // the pylon at the street corner
  const py = { x: W - 8, z: D - 8 };
  m.box(py.x - 1, 0, py.z - 1, py.x + 1, 56, py.z + 1, C("#8a8790"));
  m.box(py.x - 10, 56, py.z - 2, py.x + 10, 80, py.z + 2, C("#1a1820"));
  m.box(py.x - 10, 80, py.z - 2, py.x + 10, 82, py.z + 2, NEON("#f4b728", 2));
  for (let k = 0; k < 2; k++) m.box(py.x - 8, 58 + k * 6, py.z + 2, py.x + 8, 62 + k * 6, py.z + 3, E(k ? "#ff8a3a" : "#4dffb8", 1.6));
  const signs: KSign[] = [
    { text: l.name ?? "ZEC FUEL", color: l.neon ?? "#f4b728", x: Math.floor((cx0 + cx1) / 2), y: 35, z: cz1 + 1.2, w: cx1 - cx0 - 30, h: 4, vertical: false, facing: "front" },
    // (the station's shop: a SHIELD 24, src/scene/real/martdata.ts)
    { text: "SHIELD 24", color: "#ffffff", x: Math.floor((sx0 + sx1) / 2), y: 20, z: sz1 + 1.2, w: sx1 - sx0 - 12, h: 7, vertical: false, facing: "front" },
    { text: "ZEC", color: "#f4b728", x: py.x, y: 75, z: py.z + 2.2, w: 18, h: 6, vertical: false, facing: "front" },
  ];
  return { model: m, signs, door: [Math.floor((sx0 + sx1) / 2) - 12, sz1], lights: [[Math.floor((cx0 + cx1) / 2), 30, mid, "#f4fbff"]] };
}

/** MOTEL 21: two storeys round the parking court, the walkway and its stairs, the pool, the pole sign. */
function motel(l: KLot): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const r = rand(l.seed);
  const m = new VoxelModel(W, 100, D);
  const paint = l.paint ?? "#f8cfa0";
  const walls = stucco(paint, l.seed);
  const doors = ["#1c9ad6", "#ff4fa3", "#4dbf9a", "#f4b728", "#b56bff"];
  m.box(0, 0, 0, W, 1, D, K.asphalt);
  // the long wing at the back, the short one on the east side
  const back = { z0: 2, z1: 46 };
  const wingX0 = W - 44;
  m.box(2, 0, back.z0, W - 2, 36, back.z1, walls);
  m.box(wingX0, 0, back.z1, W - 2, 36, D - 26, walls);
  const room = (x: number, y: number, fz: number, k: number) => {
    m.box(x, y, fz - 1, x + 7, y + 14, fz, C(doors[k % doors.length]));
    m.box(x + 2, y + 10, fz - 1, x + 5, y + 12, fz, K.trim);
    win(m, x + 10, y + 5, 9, 7, fz, { lit: r() > 0.5 ? "warm" : false, frame: K.trim, sill: false, seed: l.seed + x + y });
    acUnit(m, x + 20, y + 1, fz);
  };
  // the floors' walkways and rail, the rooms behind
  for (const y of [1, 19]) {
    let k = 0;
    for (let x = 6; x + 26 < wingX0; x += 28) room(x, y, back.z1, k++);
  }
  m.box(2, 18, back.z1, wingX0, 19, back.z1 + 8, C("#e8e2d6"));
  for (let x = 2; x < wingX0; x++) m.box(x, 19, back.z1 + 7, x + 1, x % 3 ? 23 : 25, back.z1 + 8, x % 3 ? C(tone(paint, -0.4)) : K.trim);
  m.box(2, 22, back.z1 + 7, wingX0, 23, back.z1 + 8, K.trim);
  for (let x = 6; x < wingX0; x += 28) m.box(x, 0, back.z1 + 6, x + 2, 18, back.z1 + 8, K.trim);
  // stairs up at the west end
  for (let s = 0; s < 18; s++) m.box(4 + Math.floor(s * 0.0), s, back.z1 + 8 + Math.floor(s * 1.2), 10, s + 1, back.z1 + 10 + Math.floor(s * 1.2), C("#c4c1ca"));
  // the east wing's rooms face west
  for (let z = back.z1 + 6; z + 20 < D - 26; z += 26)
    for (const y of [1, 19]) {
      m.box(wingX0 - 1, y, z, wingX0, y + 14, z + 7, C(doors[(z + y) % doors.length]));
      win(m, wingX0 - 1, y + 5, 1, 7, z + 19, { frame: K.trim, sill: false });
    }
  // roof: the flat roof, a cornice, the office with its glass and VACANCY
  m.box(2, 36, back.z0, W - 2, 38, back.z1, K.trim);
  m.box(wingX0, 36, back.z1, W - 2, 38, D - 26, K.trim);
  m.box(wingX0 + 4, 0, D - 26, W - 4, 20, D - 6, walls);
  m.clear(wingX0 + 8, 1, D - 7, W - 8, 15, D - 6);
  m.box(wingX0 + 8, 1, D - 8, W - 8, 15, D - 7, K.litWarm);
  m.box(wingX0 + 2, 20, D - 28, W - 2, 22, D - 4, C(tone(paint, -0.35)));
  // the pool in the court, loungers round it
  pool(m, 12, back.z1 + 26, 60, back.z1 + 50);
  for (let k = 0; k < 4; k++) lounger(m, 64 + k * 6, back.z1 + 30, ["#ff7fb0", "#46c8e0", "#f4b728", "#ffffff"][k]);
  umbrella(m, 70, back.z1 + 50, 1, "#ff4fa3", "#ffffff", 6);
  // parking bays in front of the rooms
  for (let x = 66; x < wingX0 - 6; x += 15) m.box(x, 1, back.z1 + 14, x + 1, 1.2, back.z1 + 36, K.line);
  palm(m, 4, D - 6, 1, 52, l.seed);
  palm(m, wingX0 - 8, D - 4, 1, 46, l.seed + 1);
  // the pole sign: MOTEL 21 with its arrow, VACANCY under it
  const px = 30,
    pz = D - 6;
  m.box(px - 1, 0, pz - 1, px + 1, 60, pz + 1, C("#8a8790"));
  m.box(px - 16, 60, pz - 2, px + 16, 84, pz + 2, C("#1e3a5a"));
  for (let k = 0; k < 10; k++) m.box(px + 10 + k, 52 - k, pz - 1, px + 12 + k, 54 - k, pz + 1, NEON("#ffd23a", 2.2));
  for (let x = px - 16; x < px + 16; x += 3) m.box(x, 84, pz - 2, x + 2, 86, pz + 2, NEON("#ffd23a", 2.2));
  m.box(px - 12, 50, pz - 1, px + 8, 58, pz + 1, C("#1a1820"));
  const signs: KSign[] = [
    { text: l.name ?? "MOTEL", color: l.neon ?? "#ff4fa3", x: px, y: 72, z: pz + 2.2, w: 30, h: 20, vertical: false, facing: "front" },
    { text: "VACANCY", color: "#4dffb8", x: px - 2, y: 54, z: pz + 1.2, w: 19, h: 6, vertical: false, facing: "front" },
    { text: "OFFICE", color: "#34e7ff", x: Math.floor((wingX0 + W) / 2), y: 17.5, z: D - 5.8, w: 22, h: 4, vertical: false, facing: "front" },
  ];
  return { model: m, signs, door: [Math.floor((wingX0 + W) / 2), D - 6], lights: [[px, 70, pz + 4, "#ff4fa3"]] };
}

/** An Ocean Drive hotel: pastel deco, the central fin with its vertical name, eyebrows, neon edges, the terrace. */
function hotel(l: KLot, club = false): KBuilt {
  const W = Math.round(l.w * 6),
    D = Math.round(l.d * 6);
  const r = rand(l.seed);
  const n = l.floors ?? 3;
  const H = 20 + 16 * (n - 1);
  const m = new VoxelModel(W, H + 46, D);
  const paint = l.paint ?? "#a8e2cf";
  const neon = l.neon ?? "#ff4fa3";
  const walls = stucco(paint, l.seed);
  const accent = C(tone(paint, -0.32));
  const light = C(tone(paint, 0.45));
  const fz = D - 24;
  const x0 = 3,
    x1 = W - 3;
  m.box(0, 0, 0, W, 1, D, K.path);
  m.box(x0, 0, 4, x1, H, fz, walls);
  // the rounded front corners
  const R = 9;
  for (const left of [true, false]) {
    const ccx = left ? x0 + R : x1 - R,
      ccz = fz - R;
    for (let x = left ? x0 : x1 - R; x < (left ? x0 + R : x1); x++)
      for (let z = fz - R; z < fz; z++) if ((x + 0.5 - ccx) ** 2 + (z + 0.5 - ccz) ** 2 > R * R) m.clear(x, 0, z, x + 1, H + 4, z + 1);
  }
  const mid = Math.floor(W / 2);
  const fin = 7;
  // floors: window bays either side of the fin, eyebrows in a lighter tone, accent bands
  for (let f = 0; f < n; f++) {
    const y = f === 0 ? 0 : 20 + 16 * (f - 1);
    if (f > 0) {
      for (const [a, b] of [
        [x0 + 4, mid - fin - 3],
        [mid + fin + 3, x1 - 4],
      ]) {
        const span = b - a;
        const nw = Math.max(1, Math.floor(span / 14));
        const ww = Math.floor(span / nw) - 4;
        for (let k = 0; k < nw; k++) {
          const wx = a + k * (ww + 4) + 2;
          win(m, wx, y + 4, ww, 9, fz, { lit: r() > 0.45 ? (r() > 0.7 ? "cool" : "warm") : false, frame: light, mullion: "v", seed: l.seed + wx + y, curtain: true });
        }
        eyebrow(m, a, b, y + 14, fz, 4, light);
        // round the corner the eyebrow follows the curve
        for (let x = x0; x < x1; x++) for (let z = fz - R; z < fz; z++) if (m.get(x, y + 14, z) && (!m.get(x, y + 14, z + 1) || !m.get(x - 1, y + 14, z) || !m.get(x + 1, y + 14, z))) m.set(x, y + 14, z, light);
      }
      m.box(x0, y + 15, fz - 1, x1, y + 16, fz, accent);
    }
  }
  // the ground floor: the lobby's glass, its marquee, the porthole windows
  m.clear(x0 + 8, 1, fz - 6, x1 - 8, 15, fz);
  m.box(x0 + 8, 1, fz - 7, x1 - 8, 15, fz - 6, club ? E("#ffe6c8", 1.0) : K.litWarm);
  for (let x = x0 + 8; x <= x1 - 8; x += 6) m.box(x, 1, fz - 1, x + 1, 15, fz, K.chrome);
  m.box(x0 + 7, 15, fz - 1, x1 - 7, 16, fz, K.chrome);
  m.box(mid - 12, 16, fz, mid + 12, 19, fz + 9, accent);
  m.box(mid - 12, 15, fz + 8, mid + 12, 16, fz + 9, NEON(neon, 1.8));
  for (const x of [mid - 11, mid + 10]) m.box(x, 0, fz + 7, x + 1, 16, fz + 8, K.chrome);
  // the fin: up the middle and over the roof, stepped, edged in neon, portholes down it
  const finTop = H + 34;
  m.box(mid - fin, 16, fz - 6, mid + fin, finTop, fz + 3, light);
  for (let k = 0; k < 3; k++) m.box(mid - fin + 2 + k * 2, finTop + k * 3, fz - 4, mid + fin - 2 - k * 2, finTop + 3 + k * 3, fz + 1, k % 2 ? accent : light);
  for (const ex of [mid - fin - 1, mid + fin]) m.box(ex, 18, fz + 2, ex + 1, finTop, fz + 3, NEON(neon, 2));
  m.box(mid - fin, finTop - 1, fz + 3, mid + fin, finTop, fz + 4, NEON(neon, 2));
  // the roof's parapet, stepped corners, a neon line along it
  m.box(x0, H, 4, x1, H + 3, fz, walls);
  m.box(x0, H + 3, fz - 1, x1, H + 4, fz, NEON(neon, 1.5));
  for (const ex of [x0, x1 - 8]) for (let k = 0; k < 3; k++) m.box(ex + (ex === x0 ? 0 : k * 2), H + 3 + k * 2, fz - 10 + k * 2, ex + 8 - (ex === x0 ? k * 2 : 0), H + 5 + k * 2, fz - 2, light);
  if (!club) roofKit(m, x0 + 3, x1 - 3, 8, fz - 14, H + 3, l.seed);
  // the terrace on the pavement: a low wall, tables under umbrellas, palms in pots
  for (let x = 2; x < W - 2; x++) if (Math.abs(x - mid) > 7) m.box(x, 1, D - 3, x + 1, 5, D - 1, walls);
  m.box(2, 1, fz, W - 2, 2, D - 3, K.deck);
  const um = [
    ["#ffffff", neon],
    [tone(paint, -0.3), "#ffffff"],
  ];
  for (let k = 0; k < 2; k++) {
    const tx = k ? W - 16 : 14;
    table(m, tx, fz + 12);
    umbrella(m, tx, fz + 12, 2, um[k][0], um[k][1], 7);
  }
  for (const px of [4, W - 5]) {
    m.box(px - 2, 1, D - 7, px + 2, 5, D - 3, C("#d8d0c0"));
    palm(m, px, D - 5, 5, 36 + Math.floor(r() * 10), l.seed + px);
  }
  // the club: a rooftop bar under umbrellas, a pool deck at the side
  if (club) {
    m.box(x0, H, 4, x1, H + 1, fz, K.deck);
    for (let k = 0; k < 3; k++) umbrella(m, x0 + 14 + k * 24, 30, H + 1, "#ffffff", "#4dffb8", 7);
    m.box(x0 + 8, H + 1, 50, x1 - 8, H + 8, 56, C("#2a2630"));
    m.box(x0 + 8, H + 8, 50, x1 - 8, H + 9, 56, NEON("#4dffb8", 1.8));
  }
  const signs: KSign[] = [
    { text: l.name ?? "HOTEL", color: neon, x: mid, y: (24 + finTop) / 2, z: fz + 3.2, w: fin * 2 - 2, h: finTop - 26, vertical: true, facing: "front" },
    { text: l.name ?? "HOTEL", color: neon, x: mid, y: 17.5, z: fz + 9.2, w: 22, h: 3, vertical: false, facing: "front" },
  ];
  return { model: m, signs, door: [mid, fz], lights: [[mid, 12, fz + 6, tone(neon, 0.3)]] };
}

/** Behind a shop: its concrete yard, a dumpster, crates and bins, a palm, the back fence. */
function backYard(m: VoxelModel, x0: number, x1: number, z1: number, seed: number) {
  const r = rand(seed + 77);
  if (z1 < 10) return;
  m.box(x0 + 2, 0, 2, x0 + 14, 8, 8, C(r() > 0.5 ? "#2f6a4a" : "#2a4a7a"));
  m.box(x0 + 1, 8, 1, x0 + 15, 9, 9, C("#1e2a24"));
  for (let k = 0; k < 3; k++) m.box(x0 + 18 + k * 5, 0, 2 + (k % 2) * 3, x0 + 22 + k * 5, 4 + (k % 2) * 2, 6 + (k % 2) * 3, K.wood);
  m.box(x1 - 8, 0, 2, x1 - 4, 6, 6, C("#3a6a9a"));
  for (let x = x0; x < x1; x++) if (x % 2 === 0) m.box(x, 1, 0, x + 1, 10, 1, C("#9a9aa6"));
  m.box(x0, 9, 0, x1, 10, 1, C("#9a9aa6"));
  if (z1 > 18 && r() > 0.35) palm(m, x1 - 10, Math.floor(z1 / 2) + 2, 1, 40 + Math.floor(r() * 10), seed + 3);
}

/** A flat roof's clutter: AC units on their frames, vents, a water heater, a few solar panels. */
function roofKit(m: VoxelModel, x0: number, x1: number, z0: number, z1: number, y: number, seed: number) {
  const r = rand(seed + 91);
  const n = 2 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const x = x0 + Math.floor(r() * Math.max(1, x1 - x0 - 10)),
      z = z0 + Math.floor(r() * Math.max(1, z1 - z0 - 8));
    m.box(x, y, z, x + 9, y + 1, z + 7, C("#6e6a78"));
    m.box(x + 1, y + 1, z + 1, x + 8, y + 6, z + 6, C("#d4d0c8"));
    m.box(x + 2, y + 6, z + 2, x + 7, y + 7, z + 5, C("#3a3742"));
  }
  for (let k = 0; k < 3; k++) {
    const x = x0 + Math.floor(r() * Math.max(1, x1 - x0 - 2)),
      z = z0 + Math.floor(r() * Math.max(1, z1 - z0 - 2));
    m.box(x, y, z, x + 2, y + 4, z + 2, C("#8a8790"));
    m.box(x - 1, y + 4, z - 1, x + 3, y + 5, z + 3, C("#5a5864"));
  }
  if (z1 - z0 > 24 && x1 - x0 > 24 && r() > 0.3) {
    const px = x0 + 4,
      pz = z0 + 4;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      m.box(px + i * 7, y, pz + j * 10, px + i * 7 + 6, y + 2, pz + j * 10 + 9, C("#5a5864"));
      m.box(px + i * 7, y + 2, pz + j * 10, px + i * 7 + 6, y + 3, pz + j * 10 + 9, G("#1e2e52"));
    }
  }
}

/** The model for a lot. */
export function buildLot(l: KLot): KBuilt {
  switch (l.type) {
    case "bungalow":
      return bungalow(l);
    case "deco":
      return decoHouse(l);
    case "villa":
      return villa(l);
    case "shop":
      return shop(l);
    case "diner":
      return diner(l);
    case "gas":
      return gas(l);
    case "motel":
      return motel(l);
    case "hotel":
      return hotel(l);
    case "club":
      return hotel({ ...l, floors: 2 }, true);
  }
}

// ---- the street and the beach -------------------------------------------------------------------

/** A street palm on its own (its ground at y = 0), h voxels tall. */
export function streetPalm(seed: number, h: number) {
  const m = new VoxelModel(48, h + 16, 48);
  m.box(21, 0, 21, 27, 1, 27, C("#8a7a60"));
  palm(m, 24, 24, 1, h, seed);
  return m;
}

/** The town's street lamp: a slim pole, a swan-neck arm, a lantern. Arm toward +z. */
export function keysLamp() {
  const m = new VoxelModel(6, 34, 14);
  const pole = C("#e8e4dc");
  m.box(1, 0, 1, 5, 2, 5, C("#3a3742"));
  m.box(2, 2, 2, 4, 30, 4, pole);
  for (let k = 0; k < 6; k++) m.box(2, 29 + Math.min(k, 2), 3 + k, 4, 31 + Math.min(k, 2), 4 + k, pole);
  m.box(1, 28, 8, 5, 32, 12, C("#2a2832"));
  m.box(2, 27, 9, 4, 28, 11, E("#ffd9a0", 3));
  return m;
}

/** A parked car (a sedan with its wheels, pointing +x). */
export function parkedCar(paint: string, glow: string, taxi = false) {
  const src = taxi ? taxiModel() : sedanModel(paint, glow);
  const m = new VoxelModel(src.w, src.h, src.d);
  m.data.set(src.data);
  const tyre = C("#141418"),
    hub = C("#c8ccd4");
  for (const x of taxi ? [5, src.w - 6] : [5, src.w - 6])
    for (const z of [0, src.d - 1]) {
      m.box(x - 2, 0, z, x + 3, 3, z + 1, tyre);
      m.set(x, 1, z, hub);
    }
  return m;
}

/** A lifeguard hut on stilts, in one of the beach's colours, its ramp down to the sand (front +z). */
export function lifeguard(seed: number) {
  const r = rand(seed);
  const c = ["#ff7fb0", "#46c8e0", "#f4b728", "#9fe0c8", "#ff8a3a", "#b56bff"][Math.floor(r() * 6)];
  const c2 = ["#f6efe2", "#ffe066", "#ff4fa3", "#34e7ff"][Math.floor(r() * 4)];
  const m = new VoxelModel(30, 44, 44);
  for (const x of [5, 23]) for (const z of [6, 22]) m.box(x, 0, z, x + 2, 14, z + 2, K.white);
  m.box(2, 14, 2, 28, 16, 28, K.deck);
  m.box(4, 16, 4, 26, 30, 24, (x, y) => (y % 4 < 2 ? C(c) : C(c2)));
  m.clear(8, 19, 24, 22, 27, 25);
  m.box(8, 19, 22, 22, 27, 23, G("#5a8aa0"));
  for (let k = 0; k < 10; k++) m.box(3 + k * 2, 30 + Math.floor(k / 2), 2, 27 - k * 2, 31 + Math.floor(k / 2), 26, C(c2));
  m.box(14, 36, 12, 15, 43, 13, K.white);
  m.box(15, 40, 12, 20, 43, 13, C("#d8333f"));
  for (let x = 2; x < 28; x++) m.box(x, 16, 27, x + 1, 20, 28, x % 2 ? K.white : 0);
  // the ramp to the sand
  for (let k = 0; k < 14; k++) m.box(10, 14 - k, 28 + k, 20, 15 - k, 29 + k, K.deck);
  m.box(24, 16, 26, 26, 24, 28, C("#d8333f"));
  return m;
}

/** A row of sun loungers and an umbrella on the sand. */
export function beachSet(seed: number) {
  const r = rand(seed);
  const m = new VoxelModel(40, 24, 30);
  const cols = ["#ff7fb0", "#46c8e0", "#f4b728", "#ff8a3a", "#4dffb8", "#ffffff"];
  const a = cols[Math.floor(r() * cols.length)],
    b = cols[Math.floor(r() * cols.length)];
  umbrella(m, 20, 12, 0, a, b === a ? "#ffffff" : b, 9);
  lounger(m, 8, 6, b);
  lounger(m, 28, 6, a);
  if (r() > 0.5) m.box(14, 0, 22, 26, 1, 28, C(cols[Math.floor(r() * cols.length)]));
  return m;
}

/** The volleyball court's net and posts (across x). */
export function volleyNet() {
  const m = new VoxelModel(60, 18, 4);
  for (const x of [0, 58]) m.box(x, 0, 1, x + 2, 16, 3, K.white);
  for (let x = 2; x < 58; x++) for (let y = 10; y < 16; y++) if ((x + y) % 2 === 0 || y === 15) m.set(x, y, 2, y === 15 ? K.white : C("#2a2a30"));
  return m;
}

/** The beach bar shack: a palm-thatch roof, its counter and stools, a neon over it. */
export function beachBar() {
  const m = new VoxelModel(60, 40, 40);
  m.box(0, 0, 0, 60, 2, 40, K.deck);
  m.box(6, 2, 4, 54, 20, 18, K.wood);
  m.box(6, 2, 18, 54, 9, 24, K.wood);
  m.box(4, 9, 18, 56, 10, 26, C("#e8d8b8"));
  for (let x = 8; x < 54; x += 6) m.box(x, 2, 28, x + 2, 6, 30, C("#d8333f"));
  for (const [x, z] of [
    [4, 2],
    [54, 2],
    [4, 30],
    [54, 30],
  ])
    m.box(x, 2, z, x + 2, 24, z + 2, K.trunkA);
  const thatch = shades(["#c9a35a", "#b8924c", "#d4b06a"], 1, 31);
  for (let k = 0; k < 8; k++) m.box(k * 2, 24 + k, k * 2 - 2, 60 - k * 2, 25 + k, 36 - k * 2, thatch);
  for (let x = 10; x < 50; x += 5) m.box(x, 10, 6, x + 3, 16, 7, C(["#4dffb8", "#ff7fb0", "#f4b728", "#34e7ff"][(x / 5) % 4]));
  m.box(14, 20, 24, 46, 23, 26, C("#1a1820"));
  return m;
}

/** The pier: planks on piles from the sand out over the sea, rails, lamps, the bait shack at its end. Front toward +z, ground y = 0 at the water's floor. */
export function pier(len: number, half: number, deckY: number, floorY: number) {
  const W = Math.round(half * 2 * 6) + 4,
    L = Math.round(len * 6);
  const dy = Math.round((deckY - floorY) * 6);
  const m = new VoxelModel(W, dy + 40, L);
  const plank = shades(["#a07650", "#946c48", "#ab7f58"], 1, 41);
  for (let z = 0; z < L; z += 18) for (const x of [2, W - 4]) m.box(x, 0, z, x + 2, dy, z + 2, C("#5a4634"));
  for (let z = 0; z < L; z++) m.box(2, dy - 2, z, W - 2, dy, z + 1, z % 4 === 0 ? C("#8a6444") : plank);
  for (let z = 0; z < L; z += 6) for (const x of [2, W - 3]) m.box(x, dy, z, x + 1, dy + 6, z + 1, K.white);
  for (const x of [2, W - 3]) m.box(x, dy + 6, 0, x + 1, dy + 7, L, K.white);
  for (let z = 30; z < L - 40; z += 60) for (const x of [2, W - 3]) {
    m.box(x, dy + 7, z, x + 1, dy + 24, z + 1, C("#e8e4dc"));
    m.box(x - 1, dy + 24, z - 1, x + 2, dy + 26, z + 2, E("#ffd9a0", 2.6));
  }
  // the shack at the end
  const sz = L - 40;
  m.box(4, dy, sz, W - 4, dy + 20, L - 4, shades(["#46c8e0", "#3fbad2"], 1, 42));
  m.clear(8, dy, sz, W - 8, dy + 14, sz + 1);
  m.box(8, dy, sz + 1, W - 8, dy + 14, sz + 2, K.litWarm);
  for (let k = 0; k < 6; k++) m.box(2 + k, dy + 20 + k, sz - 2 + k, W - 2 - k, dy + 21 + k, L - 2 - k, C("#f6efe2"));
  return m;
}

/**
 * The tunnel under the headland, from portal to portal along z (its length, inside half width and
 * ceiling, metres): tiled walls, the raised walkways, a line of lights down the middle, fans, the
 * portals' concrete headwalls. Returns the model and the
 * width of concrete either side of the inside (voxels).
 */
export function tunnel(len: number, half: number, top: number) {
  const L = Math.round(len * 6);
  const hw = Math.round(half * 6);
  const S = 24;
  const W = hw * 2 + S * 2;
  const T = Math.round(top * 6);
  const H = T + S;
  const m = new VoxelModel(W, H, L);
  const cx = W / 2;
  const tile = (_x: number, y: number, z: number) => ((Math.floor(y / 3) + Math.floor(z / 4)) % 2 ? C("#e9e4d8") : C("#ddd7ca"));
  const conc = shades(["#a8a39a", "#9d988f", "#b2ada4"], 2, 51);
  const i0 = S,
    i1 = W - S;
  m.box(0, 0, 0, W, H, L, conc);
  m.clear(i0, 1, 0, i1, T, L);
  // tiled walls, a dark band at their foot, the walkways with their rails
  for (const [a, b] of [
    [i0 - 1, i0],
    [i1, i1 + 1],
  ]) {
    m.box(a, 1, 0, b, T, L, tile);
    m.box(a, 1, 0, b, 4, L, C("#3a3742"));
  }
  for (const s of [1, -1]) {
    const x0 = s > 0 ? i0 : i1 - 5,
      x1 = s > 0 ? i0 + 5 : i1;
    m.box(x0, 1, 0, x1, 3, L, C("#c9c5bd"));
    const rx = s > 0 ? x1 - 1 : x0;
    for (let z = 2; z < L; z += 8) m.box(rx, 3, z, rx + 1, 8, z + 1, K.chrome);
    m.box(rx, 8, 0, rx + 1, 9, L, K.chrome);
  }
  // the ceiling: a line of lights down the middle and two dimmer ones, the fans
  for (let z = 3; z < L; z += 10) m.box(Math.floor(cx) - 3, T - 1, z, Math.floor(cx) + 3, T, z + 6, E("#ffe6b8", 2.4));
  for (const s of [-1, 1]) for (let z = 8; z < L; z += 12) m.box(Math.floor(cx + s * (hw - 6)) - 1, T - 1, z, Math.floor(cx + s * (hw - 6)) + 1, T, z + 3, E("#cfeeff", 1.6));
  for (let z = 40; z < L - 20; z += 70) for (const s of [-1, 1]) m.box(Math.floor(cx + s * 12) - 4, T - 7, z, Math.floor(cx + s * 12) + 4, T - 1, z + 10, C("#5a5864"));
  // the portals: a darker frame, a cornice over each
  for (const z of [0, L - 1]) {
    for (let x = i0 - 3; x < i1 + 3; x++) for (let y = 1; y < T + 3; y++) if ((x < i0 || x >= i1 || y >= T) && m.get(x, y, z)) m.set(x, y, z, C("#8a857c"));
    m.box(2, H - 3, z, W - 2, H, z + (z ? 1 : 3), C("#7a766e"));
  }
  return { model: m, side: S };
}

/** Sapling Park: lawns and palms, a basketball court, a playground, benches round a fountain (w × d metres, front +z). */
export function saplingPark(w: number, d: number) {
  const W = Math.round(w * 6),
    D = Math.round(d * 6);
  const m = new VoxelModel(W, 70, D);
  m.box(0, 0, 0, W, 1, D, K.grass);
  // paths crossing it, a fountain where they meet
  const cx = Math.floor(W / 2),
    cz = Math.floor(D / 2);
  m.box(cx - 5, 0, 0, cx + 5, 1, D, K.path);
  m.box(0, 0, cz - 5, W, 1, cz + 5, K.path);
  m.cylinder(cx, 0, cz, 14, 1, K.path);
  m.cylinder(cx, 1, cz, 9, 3, K.coping);
  m.cylinder(cx, 2, cz, 8, 2, K.pool);
  m.cylinder(cx, 4, cz, 2, 6, K.coping);
  m.cylinder(cx, 9, cz, 4, 1, K.coping);
  m.cylinder(cx, 10, cz, 1, 4, E("#bff4ff", 1.2));
  // the court (north-west quarter): its paint, lines, two hoops
  const c0x = 8,
    c1x = cx - 10,
    c0z = 8,
    c1z = cz - 10;
  m.box(c0x, 0, c0z, c1x, 1, c1z, C("#c8643a"));
  m.box(c0x + 3, 0, c0z + 3, c1x - 3, 1, c1z - 3, C("#3a7ac8"));
  for (const [a, b] of [
    [c0x + 3, c0z + 3],
    [c1x - 4, c0z + 3],
  ])
    m.box(a, 0.9, c0z + 3, a + 1, 1, c1z - 3, K.line), void b;
  m.box(c0x + 3, 0.9, c0z + 3, c1x - 3, 1, c0z + 4, K.line);
  m.box(c0x + 3, 0.9, c1z - 4, c1x - 3, 1, c1z - 3, K.line);
  m.box(c0x + 3, 0.9, Math.floor((c0z + c1z) / 2), c1x - 3, 1, Math.floor((c0z + c1z) / 2) + 1, K.line);
  const hx = Math.floor((c0x + c1x) / 2);
  for (const [z, s] of [
    [c0z + 1, 1],
    [c1z - 2, -1],
  ]) {
    m.box(hx, 1, z, hx + 1, 20, z + 1, C("#3a3742"));
    m.box(hx - 4, 18, z + s, hx + 5, 24, z + s * 2, K.white);
    m.box(hx - 1, 18, z + s * 3, hx + 2, 19, z + s * 5, C("#ff6a2a"));
  }
  // chain-link round the court
  for (let x = c0x; x < c1x; x++) for (const z of [c0z, c1z - 1]) m.box(x, 1, z, x + 1, 14, z + 1, (x % 2 ? C("#9a9aa6") : 0) as number);
  // the playground (south-east quarter): a slide, swings, a climbing frame on sand
  const p0x = cx + 10,
    p0z = cz + 10;
  m.box(p0x, 0, p0z, W - 8, 1, D - 8, K.sand);
  m.box(p0x + 6, 1, p0z + 6, p0x + 14, 14, p0z + 14, C("#f4b728"));
  m.clear(p0x + 7, 1, p0z + 6, p0x + 13, 12, p0z + 14);
  for (let k = 0; k < 16; k++) m.box(p0x + 7, 13 - Math.floor(k * 0.8), p0z + 14 + k, p0x + 13, 14 - Math.floor(k * 0.8), p0z + 15 + k, C("#ff4fa3"));
  for (const x of [p0x + 26, p0x + 46]) m.box(x, 1, p0z + 8, x + 1, 18, p0z + 9, C("#46c8e0"));
  m.box(p0x + 26, 18, p0z + 8, p0x + 47, 19, p0z + 9, C("#46c8e0"));
  for (const x of [p0x + 31, p0x + 40]) m.box(x, 6, p0z + 7, x + 4, 7, p0z + 10, C("#2a2a30"));
  // benches facing the fountain, palms in the lawns
  for (const [x, z] of [
    [cx - 22, cz - 8],
    [cx + 18, cz - 8],
    [cx - 22, cz + 6],
    [cx + 18, cz + 6],
  ]) {
    m.box(x, 1, z, x + 6, 3, z + 3, K.wood);
    m.box(x, 3, z + (z < cz ? 0 : 2), x + 6, 6, z + (z < cz ? 1 : 3), K.wood);
  }
  let s = 1;
  for (const [x, z] of [
    [cx + 20, 12],
    [W - 14, 30],
    [cx + 34, cz - 18],
    [14, cz + 20],
    [30, D - 14],
    [cx - 24, D - 20],
    [W - 10, cz + 4],
  ])
    palm(m, x, z, 1, 44 + ((s * 7) % 14), 300 + s++);
  return m;
}

/** A 5 × 7 pixel font for the letters on the bluff (rows top to bottom, 1 = filled). */
const FONT: Record<string, string[]> = {
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
};

/**
 * One letter of the sign on the bluff: white panels on a frame of scaffolding and its legs, the way
 * the hillside signs are built (front +z). `px` voxels a pixel; `legs` voxels of stilts under it.
 */
export function hillLetter(ch: string, px: number, legs: number) {
  const rows = FONT[ch] ?? FONT.O;
  const W = 5 * px + 2,
    H = 7 * px + legs,
    D = 8;
  const m = new VoxelModel(W, H, D);
  const white = shades(["#f6f4ee", "#efece4", "#f9f8f3"], 1, 61);
  const steel = C("#8a8790");
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 5; c++) {
      if (rows[r][c] !== "1") continue;
      const y = legs + (6 - r) * px;
      m.box(1 + c * px, y, D - 3, 1 + (c + 1) * px, y + px, D - 1, white);
    }
  // the frame behind and its stilts down to the slope
  for (let c = 0; c < 5; c++) {
    if (!rows.some((row) => row[c] === "1")) continue;
    const x = 1 + c * px + Math.floor(px / 2);
    m.box(x, 0, D - 5, x + 1, legs + 7 * px - 2, D - 4, steel);
    m.box(x, 0, 1, x + 1, legs + 3 * px, 2, steel);
    for (let y = 2; y < legs + 3 * px; y += 6) m.box(x, y, 1, x + 1, y + 1, D - 4, steel);
  }
  // a row of lamps along its foot to light it at night
  for (let x = 2; x < W - 2; x += px) m.box(x, legs - 2, D - 1, x + 1, legs - 1, D, E("#fff2d8", 2.2));
  return m;
}

/** A bush on a slope, and a rock. */
export function bush(seed: number) {
  const r = rand(seed);
  const m = new VoxelModel(22, 14, 22);
  const leaves = shades(["#3d8a44", "#4a9a4e", "#2f7a3a", "#5aa850"], 1, seed);
  m.blob(11, 4, 11, 5 + r() * 2, leaves, 0.3, seed);
  m.blob(11 + (r() - 0.5) * 8, 3, 11 + (r() - 0.5) * 8, 3.5 + r() * 2, leaves, 0.35, seed + 1);
  if (r() > 0.5) for (let k = 0; k < 6; k++) m.set(6 + Math.floor(r() * 10), 4 + Math.floor(r() * 5), 6 + Math.floor(r() * 10), C(r() > 0.5 ? "#ff7fb0" : "#f4e8a8"));
  return m;
}

export function rock(seed: number) {
  const r = rand(seed);
  const m = new VoxelModel(20, 12, 20);
  const stone = shades(["#8a8478", "#7a7468", "#9a9488"], 1, seed);
  for (let k = 0; k < 3; k++) {
    const cx = 10 + (r() - 0.5) * 8,
      cz = 10 + (r() - 0.5) * 8,
      rr = 3 + r() * 3;
    for (let y = 0; y < rr * 1.3; y++) m.cylinder(cx, y, cz, rr * (1 - y / (rr * 1.6)), 1, stone);
  }
  return m;
}

/** A beach towel on the sand (2 m × 1 m), in stripes, a bag or a pair of flip-flops beside it now and then. */
export function towel(seed: number) {
  const r = rand(seed);
  const cols = ["#ff7fb0", "#46c8e0", "#f4b728", "#ff8a3a", "#4dffb8", "#b56bff", "#ffffff", "#e8333f", "#3a6aff"];
  const a = C(cols[Math.floor(r() * cols.length)]),
    b = C(cols[Math.floor(r() * cols.length)]);
  const m = new VoxelModel(10, 3, 16);
  for (let z = 2; z < 14; z++) for (let x = 2; x < 8; x++) m.set(x, 0, z, Math.floor(z / 2) % 2 ? a : b);
  if (r() < 0.5) m.box(8, 0, 3, 10, 2, 6, C(["#2a2a30", "#c8664a", "#f6efe2"][Math.floor(r() * 3)]));
  if (r() < 0.4) for (const x of [0, 1]) m.box(x * 1 + 0, 0, 12, x + 1, 1, 14, C("#ff4fa3"));
  return m;
}

/** A sandcastle at the water's edge: a keep, four towers with their crenels, a moat, a bucket and a spade. */
export function sandcastle(seed: number) {
  const r = rand(seed);
  const m = new VoxelModel(16, 12, 16);
  const sand = shades(["#e2c98f", "#d9bf84", "#e8d29c"], 1, 30 + seed);
  const wet = C("#b89e6e");
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(z - 7.5));
    if (d > 6.5 && d < 7.6) m.set(x, 0, z, wet);
  }
  m.box(4, 0, 4, 12, 4, 12, sand);
  for (const [x, z] of [
    [3, 3],
    [11, 3],
    [3, 11],
    [11, 11],
  ]) {
    m.box(x, 0, z, x + 2, 6 + Math.floor(r() * 2), z + 2, sand);
    m.set(x, 7, z, sand);
    m.set(x + 1, 7, z + 1, sand);
  }
  m.box(6, 4, 6, 10, 8, 10, sand);
  for (let x = 6; x < 10; x += 2) for (const z of [6, 9]) m.set(x, 8, z, sand);
  m.set(7, 9, 7, C("#d8333f"));
  m.set(7, 10, 7, C("#d8333f"));
  const pail = C(["#ff4fa3", "#46c8e0", "#f4b728", "#4dffb8"][Math.floor(r() * 4)]);
  m.box(13, 0, 13, 16, 3, 16, pail);
  m.box(0, 0, 14, 3, 1, 15, C("#3a6aff"));
  return m;
}
