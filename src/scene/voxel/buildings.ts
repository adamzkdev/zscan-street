import { C, E, hash, rand, shades, VoxelModel, type Paint } from "./model";
import {
  acUnit,
  antenna,
  balcony,
  billboardFrame,
  dish,
  door,
  drainpipe,
  fireEscape,
  lantern,
  meters,
  P,
  parapet,
  roofAC,
  shopfront,
  shutter,
  stairHouse,
  tiledRoof,
  verticalSignBox,
  waterTank,
  window,
  type ShopKind,
  type SignSpot,
} from "./parts";

/** Margins around the body for things that stick out: awnings in front, fire escapes, roof clutter. */
export const FRONT = 9;
export const SIDE = 7;
export const TOP = 26;

export interface Built {
  model: VoxelModel;
  /** Walkable buildings list their walls for collisions instead of the whole body. */
  walls?: [number, number, number, number][];
  /** Extra named points (model voxels), e.g. the MEMPOOL shop's pickup counter. */
  points?: Record<string, [number, number, number]>;
  signs: SignSpot[];
  /** Where pedestrians come out, in model voxels (x, z). */
  door: [number, number];
  /** Body footprint in model voxels, for collisions: [x0, z0, x1, z1]. */
  body: [number, number, number, number];
  /** Points that deserve a real light (shop interiors), model voxels. */
  lights: [number, number, number, string][];
  /**
   * Size of one voxel in units of VOX (1: a sixth of a metre). Landmarks too big to model at full
   * resolution use 2 (a third of a metre) or more; every coordinate above stays in model voxels.
   */
  scale?: number;
}

export const WALLS = {
  concrete: ["#6b6474", "#655e6e", "#71697a"],
  warm: ["#7a6a60", "#74645a", "#806f64"],
  tile: ["#8a8274", "#837b6d", "#90887a"],
  dark: ["#4a4554", "#454050", "#4f4a59"],
  brick: ["#6a4a44", "#634440", "#70504a"],
  blue: ["#4f5a6e", "#4a5468", "#556074"],
  cream: ["#9a9284", "#948c7e", "#a0988a"],
  violet: ["#4a3f5c", "#453a56", "#504462"],
};
export type Wall = keyof typeof WALLS;

export function body(W: number, D: number, H: number) {
  const m = new VoxelModel(W + SIDE * 2, H + TOP, D + FRONT);
  return { m, x0: SIDE, x1: SIDE + W, z0: 0, fz: D, H };
}

/** Plain wall with tile-like variation and a darker plinth. */
export function walls(m: VoxelModel, x0: number, x1: number, d: number, h: number, wall: Wall, seed: number, plinth = 3) {
  m.box(x0, 0, 0, x1, h, d, shades(WALLS[wall], 2, seed));
  m.box(x0, 0, d - 1, x1, plinth, d, C("#3e3a46"));
  // weathering streaks under the roof line
  for (let x = x0; x < x1; x += 1) if (hash(x, seed, 7) > 0.86) m.paint(x, h - 6 - Math.floor(hash(x, 1, seed) * 10), d - 1, x + 1, h, d, C("#4e4858"));
}

export function roofClutter(m: VoxelModel, x0: number, x1: number, d: number, y: number, seed: number, opts: { tank?: boolean; stairs?: boolean; billboard?: string; color?: string } = {}) {
  const r = rand(seed);
  m.box(x0, y - 1, 0, x1, y, d, shades(["#3b3745", "#37333f", "#3f3a48"], 3, seed));
  parapet(m, x0, 0, x1, d, y);
  const W = x1 - x0;
  if (opts.stairs !== false && W > 26) stairHouse(m, x0 + 3, y, 3);
  if (opts.tank ?? r() > 0.4) waterTank(m, x1 - 8, y, 8 + Math.floor(r() * Math.max(1, d - 18)));
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++) roofAC(m, x0 + 3 + Math.floor(r() * (W - 12)), y, Math.floor(d * 0.45 + r() * (d * 0.4 - 6)), r() > 0.6);
  if (r() > 0.4) antenna(m, x0 + 2 + Math.floor(r() * (W - 4)), y, 2, 14 + Math.floor(r() * 10));
  if (r() > 0.6) dish(m, x1 - 6, y, d - 6);
  // pipes snaking across the roof
  m.box(x0 + 2, y, d - 4, x1 - 2, y + 1, d - 3, C("#5a5664"));
}

/** Rows of windows on a facade, each with its own life: lit or dark, curtains, AC units. */
export function windowRows(m: VoxelModel, x0: number, x1: number, fz: number, floors: number[], seed: number, o: { w?: number; h?: number; lit?: number; ac?: number; tint?: "warm" | "cool" | "mix" } = {}) {
  const r = rand(seed);
  const ww = o.w ?? 7,
    wh = o.h ?? 9;
  const n = Math.max(1, Math.floor((x1 - x0 - 2) / (ww + 5)));
  const gap = (x1 - x0 - n * ww) / (n + 1);
  for (const y of floors)
    for (let k = 0; k < n; k++) {
      const x = Math.round(x0 + gap + k * (ww + gap));
      const lit = r() < (o.lit ?? 0.45);
      const tint = o.tint === "cool" ? "cool" : o.tint === "warm" ? "warm" : r() > 0.3 ? "warm" : r() > 0.3 ? "cool" : "tv";
      window(m, x, y + 3, ww, wh, fz, { lit: lit ? tint : false, curtain: r() > 0.4, blinds: lit && r() > 0.8, mullion: r() > 0.5 ? "v" : null, seed: seed + x * 7 + y });
      if (r() < (o.ac ?? 0.3)) acUnit(m, x + ww + 2, y + 4, fz);
    }
}

// ---- archetypes -------------------------------------------------------------------------------

export interface ShophouseOpts {
  /** A rooftop garden instead of the usual clutter. */
  garden?: boolean;
  shop?: ShopKind | "shutter" | null;
  floors?: number;
  wall?: Wall;
  sign?: string;
  signColor?: string;
  vsign?: string;
  vsignColor?: string;
  fireEscape?: boolean;
  billboard?: string;
  width?: number;
}

/** Narrow Japanese mixed-use building: a shop downstairs, flats above, signs everywhere. */
export function shophouse(seed: number, o: ShophouseOpts = {}): Built {
  const r = rand(seed);
  const W = o.width ?? 36 + Math.floor(r() * 3) * 4;
  const D = 34;
  const floors = o.floors ?? 3 + Math.floor(r() * 2);
  const gh = 20,
    fh = 16;
  const H = gh + fh * (floors - 1) + 2;
  const { m, x0, x1, fz } = body(W, D, H);
  const wall: Wall = o.wall ?? (["concrete", "warm", "tile", "dark", "brick", "cream"] as Wall[])[Math.floor(r() * 6)];
  walls(m, x0, x1, D, H, wall, seed);
  // a band of different cladding on the first floor up
  m.paint(x0, gh, D - 1, x1, gh + fh, D, shades(WALLS[wall === "tile" ? "cream" : "tile"], 2, seed + 1));
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  let doorX = x0 + Math.floor(W / 2);
  if (o.shop && o.shop !== "shutter") {
    const f = shopfront(m, x0 + 2, x1 - 2, gh, fz, o.shop, seed);
    if (o.sign) signs.push({ text: o.sign, color: o.signColor ?? "#ffb347", x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, z: f.z, w: f.x1 - f.x0 - 2, h: f.y1 - f.y0, vertical: false, facing: "front" });
    lights.push([doorX, 8, fz + 3, o.shop === "konbini" ? "#e8f4ff" : "#ffb062"]);
  } else if (o.shop === "shutter") {
    shutter(m, x0 + 3, x1 - 12, 0, gh - 5, fz, r() > 0.5 ? 0.25 : 0);
    door(m, x1 - 9, fz, 6, 13);
    doorX = x1 - 6;
  } else {
    door(m, x0 + 4, fz, 6, 14);
    doorX = x0 + 7;
    window(m, x0 + 14, 5, W - 20, 9, fz, { lit: r() > 0.5 ? "warm" : false, mullion: "v" });
  }
  // floor ledges
  for (let f = 1; f < floors; f++) m.box(x0 - 1, gh + (f - 1) * fh - 1, D - 1, x1 + 1, gh + (f - 1) * fh, D + 1, C("#8a8494"));
  const levels = Array.from({ length: floors - 1 }, (_, i) => gh + i * fh);
  windowRows(m, x0 + 1, x1 - (o.vsign ? 5 : 1), fz, levels, seed + 3, { ac: 0.4 });
  sideWindows(m, x1, D, floors, gh, fh, seed);
  drainpipe(m, x0 + 1, fz, 0, H);
  meters(m, x1 - 5, 6, fz);
  if (o.vsign) {
    const sx = x1 - 4;
    const sh = Math.min(H - gh - 3, 30);
    verticalSignBox(m, sx, gh + 1, fz, sh, 6);
    signs.push({ text: o.vsign, color: o.vsignColor ?? "#3ef0ff", x: sx + 2, y: gh + 1 + sh / 2, z: fz + 3, w: 6, h: sh, vertical: true, facing: "side" });
  }
  if (o.fireEscape) fireEscape(m, x1, 6, D - 6, levels.map((y) => y - 1).concat(H - 1).slice(1), H + 3);
  if (o.garden) roofGarden(m, x0, x1, D, H, seed + 5);
  else roofClutter(m, x0, x1, D, H, seed + 5, { billboard: o.billboard });
  if (o.billboard) {
    const b = billboardFrame(m, x0 + 3, x1 - 3, H + 2, D - 6, 12);
    signs.push({ text: o.billboard, color: o.signColor ?? "#3ef0ff", x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: b.z, w: b.x1 - b.x0, h: b.y1 - b.y0, vertical: false, facing: "front" });
  }
  return { model: m, signs, door: [doorX, fz + 2], body: [x0, 0, x1, D], lights };
}

/** Mid-rise apartment block ("mansion"): a balcony per flat with laundry, plants and AC units. */
export function apartment(seed: number, o: { floors?: number; wall?: Wall; vsign?: string; width?: number; garden?: boolean } = {}): Built {
  const r = rand(seed);
  const W = o.width ?? 44 + Math.floor(r() * 2) * 6;
  const D = 34;
  const floors = o.floors ?? 5 + Math.floor(r() * 3);
  const gh = 18,
    fh = 16;
  const H = gh + fh * (floors - 1) + 2;
  const { m, x0, x1, fz } = body(W, D, H);
  const wall: Wall = o.wall ?? (["cream", "tile", "concrete", "blue"] as Wall[])[Math.floor(r() * 4)];
  walls(m, x0, x1, D, H, wall, seed);
  // entrance lobby, mailboxes, bike shelter
  const ex = x0 + Math.floor(W / 2) - 5;
  m.clear(ex, 0, fz - 6, ex + 10, 13, fz);
  m.box(ex, 0, fz - 7, ex + 10, 13, fz - 6, E("#fff0d8", 0.8));
  m.box(ex, 12, fz - 6, ex + 10, 13, fz, E("#fff4e0", 1.0));
  for (let x = ex + 1; x < ex + 9; x += 2) m.box(x, 4, fz - 6, x + 1, 9, fz - 5, C("#9a95a2"));
  m.box(ex - 2, 13, fz - 1, ex + 12, 15, fz + 3, C("#5a5464"));
  m.box(x0 + 2, 0, fz, x0 + 14, 10, fz + 1, P.metal);
  m.box(x0 + 2, 10, fz, x0 + 14, 11, fz + 6, C("#4a4656"));
  for (let x = x0 + 3; x < x0 + 14; x += 3) bicycleInto(m, x, fz + 2, r());
  window(m, x1 - 12, 5, 8, 8, fz, { lit: r() > 0.5 ? "warm" : false });
  // flats: balcony + sliding window per unit
  const unit = Math.floor(W / Math.max(2, Math.round(W / 15)));
  for (let f = 1; f < floors; f++) {
    const y = gh + (f - 1) * fh;
    for (let x = x0; x + unit <= x1 + 1; x += unit) {
      const lit = r() < 0.5;
      window(m, x + 2, y + 2, unit - 5, 11, fz, { lit: lit ? (r() > 0.25 ? "warm" : "cool") : false, curtain: r() > 0.3, mullion: "v", sill: false, depth: 1 });
      balcony(m, x, Math.min(x + unit, x1), y, fz, 5, { laundry: r() > 0.55, plants: r() > 0.5, ac: r() > 0.4, seed: seed + x * 3 + y });
    }
  }
  if (o.vsign) {
    const sx = x1 - 3;
    verticalSignBox(m, sx, gh + 2, fz + 5, 26, 4);
  }
  drainpipe(m, x1 - 2, fz, 0, H);
  sideWindows(m, x1, D, floors, gh, fh, seed);
  if (o.garden) roofGarden(m, x0, x1, D, H, seed + 9);
  else roofClutter(m, x0, x1, D, H, seed + 9, { tank: true, stairs: true });
  return { model: m, signs: [], door: [ex + 5, fz + 2], body: [x0, 0, x1, D], lights: [[ex + 5, 8, fz + 2, "#fff0d8"]] };
}

/** Office tower: ribbon windows, vertical fins, a crown and a rooftop billboard. */
export function office(seed: number, o: { floors?: number; wall?: Wall; billboard?: string; billboardColor?: string; width?: number; venue?: string; crown?: string; spire?: number } = {}): Built {
  const r = rand(seed);
  const W = o.width ?? 40 + Math.floor(r() * 2) * 6;
  const D = 38;
  const floors = o.floors ?? 8 + Math.floor(r() * 5);
  const gh = 22,
    fh = 14;
  const H = gh + fh * (floors - 1) + 4;
  const { m, x0, x1, fz } = body(W, D, H);
  const wall: Wall = o.wall ?? (["dark", "blue", "concrete", "violet"] as Wall[])[Math.floor(r() * 4)];
  walls(m, x0, x1, D, H, wall, seed, 0);
  // lobby: tall glass, lit
  m.clear(x0 + 4, 0, fz - 5, x1 - 4, gh - 4, fz);
  m.box(x0 + 4, 0, fz - 6, x1 - 4, gh - 4, fz - 5, E("#c8d8e8", 0.7));
  for (let x = x0 + 4; x < x1 - 4; x += 6) m.box(x, 0, fz - 1, x + 1, gh - 4, fz, P.frame);
  m.box(x0 + 2, gh - 4, fz - 1, x1 - 2, gh - 2, fz + 3, C("#3a3644"));
  m.box(x0 + 2, gh - 5, fz + 2, x1 - 2, gh - 4, fz + 3, E("#ffe6c0", 1.0));
  // ribbon windows, floor by floor, with a random office life behind each pane
  for (let f = 1; f < floors; f++) {
    const y = gh + (f - 1) * fh + 3;
    m.box(x0, y - 1, fz - 1, x1, y + 9, fz, P.frame);
    m.clear(x0 + 1, y, fz - 2, x1 - 1, y + 8, fz);
    for (let x = x0 + 1; x < x1 - 1; x++) {
      const cell = Math.floor((x - x0) / 6);
      const on = hash(cell, f, seed) < 0.3;
      m.box(x, y, fz - 3, x + 1, y + 8, fz - 2, on ? (hash(cell, f, seed, 2) > 0.35 ? E("#b8d8f0", 0.95) : E("#ffd08a", 1.1)) : (x + f) % 7 ? P.glassBlue : P.glass);
      if ((x - x0) % 6 === 0) m.box(x, y, fz - 2, x + 1, y + 8, fz - 1, P.frameLight);
    }
  }
  // fins at the corners
  for (const x of [x0 - 1, x1]) m.box(x, gh, D - 2, x + 1, H, D + 2, C("#8a8494"));
  // the +x side gets narrow windows too
  for (let f = 1; f < floors; f++)
    for (let z = 4; z < D - 6; z += 8) {
      const y = gh + (f - 1) * fh + 4;
      m.box(x1 - 1, y, z, x1, y + 8, z + 4, hash(z, f, seed, 5) < 0.3 ? E("#b8d8f0", 0.95) : P.glassBlue);
    }
  roofClutter(m, x0, x1, D, H, seed + 3, { tank: false, stairs: true });
  // crown
  m.box(x0 + 4, H, 4, x1 - 4, H + 6, D - 4, shades(WALLS[wall], 2, seed + 4));
  m.box(x0 + 3, H + 6, 3, x1 - 3, H + 7, D - 3, C("#5a5564"));
  const signs: SignSpot[] = [];
  if (o.billboard) {
    const b = billboardFrame(m, x0 + 6, x1 - 6, H + 7, D - 8, 12);
    signs.push({ text: o.billboard, color: o.billboardColor ?? "#3ef0ff", x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: b.z, w: b.x1 - b.x0, h: b.y1 - b.y0, vertical: false, facing: "front" });
  }
  if (o.crown) {
    // a supertall's signature: neon edges up every corner and a lit ring round the top
    const neon = E(o.crown, 2.4);
    for (const x of [x0 - 1, x1]) for (const z of [D + 1, 0]) m.box(x, gh, z, x + 1, H + 6, z + 1, neon);
    m.box(x0 + 3, H + 5, 3, x1 - 3, H + 6, 4, neon);
    m.box(x0 + 3, H + 5, D - 4, x1 - 3, H + 6, D - 3, neon);
    m.box(x0 + 3, H + 5, 3, x0 + 4, H + 6, D - 3, neon);
    m.box(x1 - 4, H + 5, 3, x1 - 3, H + 6, D - 3, neon);
  }
  if (o.spire) {
    // a mast from the middle of the roof, tapering, a red light on the tip
    const cx = Math.round(x0 + W / 2),
      cz = Math.round(D / 2);
    m.box(cx - 3, H + 7, cz - 3, cx + 3, H + 12, cz + 3, C("#4a4656"));
    m.box(cx - 1, H + 12, cz - 1, cx + 1, H + 12 + o.spire, cz + 1, C("#8a8698"));
    m.box(cx - 1, H + 12 + o.spire, cz - 1, cx + 1, H + 14 + o.spire, cz + 1, E("#ff2a2a", 3));
    if (o.crown) m.box(cx - 2, H + 12 + Math.round(o.spire * 0.6), cz - 2, cx + 2, H + 13 + Math.round(o.spire * 0.6), cz + 2, E(o.crown, 2.2));
  } else antenna(m, x1 - 8, H + 7, 8, 20);
  const mid = x0 + W / 2;
  // a walk-in tower (the ZK TOWER apartments): its name over the lobby canopy
  if (o.venue) signs.push({ text: "ZK TOWER · 秘密マンション", color: "#3ef0ff", x: mid, y: gh - 3, z: fz + 3.05, w: W - 8, h: 2.2, vertical: false, facing: "front" });
  return {
    model: m,
    signs,
    door: [mid, fz + 2],
    body: [x0, 0, x1, D],
    lights: [[mid, 8, fz + 2, "#d8ecff"]],
    points: o.venue ? { keeper: [mid, 0, fz - 8], camPos: [mid, 18, fz + 12], camLook: [mid, 8, fz] } : undefined,
  };
}

/** The convenience store where zkSNARKs pick up their transactions. */
export function konbini(seed: number, sign = "MEMPOOL"): Built {
  const W = 46,
    D = 32,
    H = 24;
  const { m, x0, x1, fz } = body(W, D, H);
  walls(m, x0, x1, D, H, "cream", seed);
  const f = shopfront(m, x0 + 2, x1 - 2, 22, fz, "konbini", seed);
  roofClutter(m, x0, x1, D, H, seed, { tank: false, stairs: false });
  for (let x = x0 + 6; x < x1 - 8; x += 12) roofAC(m, x, H, 10, true);
  return {
    model: m,
    signs: [{ text: sign, color: "#ff9f2e", x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, z: f.z + 1, w: 30, h: f.y1 - f.y0, vertical: false, facing: "front" }],
    door: [x0 + W / 2, fz + 2],
    body: [x0, 0, x1, D],
    lights: [[x0 + W / 2, 10, fz + 4, "#e8f4ff"]],
  };
}

/** Two-storey wooden izakaya with a tiled eave, noren, lanterns and a pitched roof. */
export function izakaya(seed: number, o: { sign?: string; signColor?: string; kind?: ShopKind; width?: number } = {}): Built {
  const r = rand(seed);
  const W = o.width ?? 32,
    D = 30,
    gh = 20,
    H = gh + 16;
  const { m, x0, x1, fz } = body(W, D, H);
  m.box(x0, 0, 0, x1, H, D, P.wood);
  // timber posts and beams
  for (let x = x0; x <= x1 - 1; x += 8) m.box(x, 0, D - 1, x + 1, H, D + 1, C("#2e2018"));
  m.box(x0, gh, D - 1, x1, gh + 1, D + 1, C("#2e2018"));
  const f = shopfront(m, x0 + 2, x1 - 2, gh - 1, fz, o.kind ?? "izakaya", seed);
  // tiled eave over the shop
  const tile = shades(["#2e2e3a", "#34343f", "#2a2a35"], 1, seed);
  for (let k = 0; k < 5; k++) m.box(x0 - 1, gh + 2 - Math.floor(k / 2), fz + k, x1 + 1, gh + 3 - Math.floor(k / 2), fz + k + 1, tile);
  // upstairs: lattice windows, warm
  for (let x = x0 + 3; x < x1 - 8; x += 13) {
    window(m, x, gh + 4, 9, 8, fz, { lit: r() > 0.3 ? "warm" : false, mullion: "cross", frame: C("#2e2018"), sill: false });
    for (let xx = x; xx < x + 9; xx += 3) m.box(xx, gh + 4, fz - 1, xx + 1, gh + 12, fz, C("#3a281c"));
  }
  tiledRoof(m, x0, x1, 0, D, H);
  // a string of lanterns under the eave
  for (let x = x0 + 2; x < x1 - 2; x += 5) lantern(m, x, gh + 5, fz + 4, x % 2 ? "#ff5a3a" : "#ffb347");
  const signs: SignSpot[] = [];
  if (o.sign) signs.push({ text: o.sign, color: o.signColor ?? "#38ff9c", x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, z: f.z, w: f.x1 - f.x0 - 2, h: f.y1 - f.y0, vertical: false, facing: "front" });
  return { model: m, signs, door: [x0 + W / 2, fz + 2], body: [x0, 0, x1, D], lights: [[x0 + W / 2, 8, fz + 3, "#ff9d5c"]] };
}

/** Ironwood warehouse: corrugated walls, roller doors, sawtooth roof, pipes and purple strips. */
export function warehouse(seed: number, o: { sign?: string; width?: number } = {}): Built {
  const r = rand(seed);
  const W = o.width ?? 56,
    D = 46,
    H = 36;
  const { m, x0, x1, fz } = body(W, D, H);
  const rib: Paint = (x, _y, z) => ((x + z) % 3 === 0 ? C("#3a3446") : (x + z) % 3 === 1 ? C("#433c50") : C("#3e3849"));
  m.box(x0, 0, 0, x1, H, D, rib);
  m.box(x0, 0, 0, x1, 6, D, shades(["#5a5464", "#545060"], 2, seed));
  // two roller doors with violet LED strips
  for (const dx of [6, W - 24]) {
    shutter(m, x0 + dx, x0 + dx + 18, 0, 20, fz, r() > 0.5 ? 0.2 : 0);
    m.box(x0 + dx - 1, 22, fz, x0 + dx + 19, 23, fz + 1, E("#b07bff", 2.4));
  }
  door(m, x0 + Math.floor(W / 2) - 3, fz, 6, 13, C("#3a3448"));
  // office band
  for (let x = x0 + 4; x < x1 - 8; x += 10) window(m, x, 26, 7, 5, fz, { lit: r() > 0.4 ? "cool" : false, sill: false });
  // pipes along the facade
  m.box(x0, 30, fz, x1, 32, fz + 2, C("#5a5068"));
  for (let x = x0 + 4; x < x1; x += 12) m.box(x, 0, fz, x + 2, 30, fz + 2, C("#5a5068"));
  // sawtooth roof
  for (let z = 2; z < D - 6; z += 10)
    for (let k = 0; k < 8; k++) {
      m.box(x0, H + k, z + k, x1, H + k + 1, z + k + 1, C("#4a4458"));
      m.box(x0, H, z + k, x1, H + k, z + k + 1, C("#3e3849"));
    }
  for (let z = 2; z < D - 6; z += 10) m.box(x0 + 1, H, z, x1 - 1, H + 7, z + 1, E("#7a5ad8", 0.45));
  parapet(m, x0, 0, x1, D, H, 2, C("#2e2a38"));
  // ladder on the +x side
  for (let y = 2; y < H; y += 2) m.box(x1, y, D - 8, x1 + 1, y + 1, D - 5, P.metal);
  m.box(x1, 0, D - 8, x1 + 1, H + 2, D - 7, P.metal);
  m.box(x1, 0, D - 6, x1 + 1, H + 2, D - 5, P.metal);
  const signs: SignSpot[] = [];
  if (o.sign) signs.push({ text: o.sign, color: "#b07bff", x: x0 + W / 2, y: 27.5, z: fz + 2, w: 26, h: 5, vertical: false, facing: "front" });
  return { model: m, signs, door: [x0 + W / 2, fz + 2], body: [x0, 0, x1, D], lights: [[x0 + 15, 10, fz + 3, "#b07bff"]] };
}

/** Orchard house: plaster below, wood above, tiled roof, hedge and a little garden in front. */
export function house(seed: number, o: { shop?: ShopKind; sign?: string; width?: number } = {}): Built {
  const r = rand(seed);
  const W = o.width ?? 34,
    D = 28,
    gh = 18,
    H = gh + 15;
  const { m, x0, x1, fz } = body(W, D, H);
  m.box(x0, 0, 0, x1, gh, D, shades(["#b8ae9e", "#b2a898", "#beb4a4"], 2, seed));
  m.box(x0, gh, 0, x1, H, D, P.wood);
  m.box(x0 - 1, gh, D - 1, x1 + 1, gh + 1, D + 1, C("#3a281c"));
  const signs: SignSpot[] = [];
  if (o.shop) {
    const f = shopfront(m, x0 + 2, x1 - 2, gh, fz, o.shop, seed);
    if (o.sign) signs.push({ text: o.sign, color: "#5cff9a", x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, z: f.z, w: f.x1 - f.x0 - 2, h: f.y1 - f.y0, vertical: false, facing: "front" });
  } else {
    door(m, x0 + 4, fz, 7, 13, P.woodLight);
    window(m, x0 + 16, 5, 12, 8, fz, { lit: r() > 0.4 ? "warm" : false, mullion: "cross", frame: C("#3a281c") });
  }
  window(m, x0 + 4, gh + 3, 9, 8, fz, { lit: r() > 0.4 ? "warm" : false, mullion: "cross", frame: C("#2e2018"), sill: false });
  window(m, x1 - 13, gh + 3, 9, 8, fz, { lit: r() > 0.5 ? "warm" : false, mullion: "cross", frame: C("#2e2018"), sill: false });
  m.box(x1 - 15, gh + 1, fz, x1 - 2, gh + 2, fz + 3, P.wood);
  for (let x = x1 - 15; x < x1 - 2; x += 2) m.box(x, gh + 2, fz + 2, x + 1, gh + 5, fz + 3, C("#3a281c"));
  tiledRoof(m, x0, x1, 0, D, H, shades(["#3a4a3e", "#34443a", "#40504a"], 1, seed));
  // hedge, gate and a persimmon tree in the front garden
  if (!o.shop) {
    m.box(x0, 0, fz + 7, x0 + 12, 3, fz + 8, P.leafDark);
    m.box(x0 + 18, 0, fz + 7, x1, 3, fz + 8, P.leafDark);
    m.box(x0 + 12, 0, fz + 7, x0 + 13, 5, fz + 8, P.wood);
    m.box(x0 + 17, 0, fz + 7, x0 + 18, 5, fz + 8, P.wood);
    m.box(x1 - 6, 0, fz + 2, x1 - 5, 9, fz + 3, P.trunk);
    m.blob(x1 - 5.5, 11, fz + 3, 4, P.leaf, 0.3, seed);
    for (let i = 0; i < 6; i++) m.set(x1 - 8 + Math.floor(r() * 6), 9 + Math.floor(r() * 5), fz + 1 + Math.floor(r() * 5), C("#e07a2a"));
  }
  return { model: m, signs, door: [x0 + 8, fz + 2], body: [x0, 0, x1, D], lights: o.shop ? [[x0 + W / 2, 8, fz + 3, "#ffd28a"]] : [] };
}

/** Low glass-and-timber pavilion for the Transparent square. */
export function pavilion(seed: number, o: { sign?: string; width?: number } = {}): Built {
  const W = o.width ?? 40,
    D = 24,
    H = 20;
  const { m, x0, x1, fz } = body(W, D, H);
  m.box(x0, 0, 0, x1, H, D, shades(WALLS.cream, 2, seed));
  m.clear(x0 + 2, 0, D - 8, x1 - 2, H - 4, D);
  m.box(x0 + 2, 0, D - 9, x1 - 2, H - 4, D - 8, E("#fff0d8", 1.3));
  for (let x = x0 + 2; x < x1 - 1; x += 5) m.box(x, 0, D - 1, x + 1, H - 4, D, P.woodLight);
  for (let x = x0 + 4; x < x1 - 4; x += 3) for (let k = 0; k < 3; k++) m.set(x, 6 + k * 3, D - 9, E(["#ffb347", "#ff7a5a", "#7ad07a", "#5ab0e0"][(x + k) % 4], 1.1));
  m.box(x0 - 2, H - 4, 0, x1 + 2, H - 2, D + 4, P.woodLight);
  m.box(x0 - 2, H - 5, D + 3, x1 + 2, H - 4, D + 4, E("#ffd28a", 1.0));
  roofClutter(m, x0, x1, D, H - 2, seed, { tank: false, stairs: false });
  const signs: SignSpot[] = o.sign ? [{ text: o.sign, color: "#ffb347", x: x0 + W / 2, y: H - 3, z: D + 4, w: 24, h: 2, vertical: false, facing: "front" }] : [];
  return { model: m, signs, door: [x0 + W / 2, fz + 2], body: [x0, 0, x1, D], lights: [[x0 + W / 2, 8, fz + 2, "#fff0d8"]] };
}

/**
 * Small windows on both side walls and the back, so a building looks inhabited from every angle
 * once the camera orbits. `x1` is the first empty column right of the body.
 */
export function sideWindows(m: VoxelModel, x1: number, D: number, floors: number, gh: number, fh: number, seed: number) {
  const x0 = SIDE;
  for (let f = 1; f < floors; f++) {
    const y = gh + (f - 1) * fh + 4;
    for (let z = 5; z < D - 9; z += 11) {
      for (const side of [1, -1]) {
        const on = hash(z, f, seed, side > 0 ? 9 : 10) < 0.35;
        const wx = side > 0 ? x1 - 1 : x0;
        const inward = side > 0 ? -1 : 1;
        m.box(wx, y - 1, z - 1, wx + 1, y + 8, z + 6, P.frame);
        m.box(wx, y, z, wx + 1, y + 7, z + 5, 0);
        m.box(wx + inward, y, z, wx + inward + 1, y + 7, z + 5, on ? E("#ffc070", 1.4) : P.glass);
        m.box(wx + (side > 0 ? 1 : -1), y - 2, z - 1, wx + (side > 0 ? 2 : 0), y - 1, z + 6, P.sill);
      }
    }
    // back wall
    for (let x = x0 + 4; x < x1 - 8; x += 10) {
      const on = hash(x, f, seed, 11) < 0.3;
      m.box(x - 1, y - 1, 0, x + 7, y + 8, 1, P.frame);
      m.box(x, y, 0, x + 6, y + 7, 1, 0);
      m.box(x, y, 1, x + 6, y + 7, 2, on ? E("#ffc070", 1.3) : P.glass);
    }
  }
  // a pipe run down the back
  m.box(x0 + 2, 0, 0, x0 + 3, gh + (floors - 1) * fh, 1, C("#4a4656"));
}

function bicycleInto(m: VoxelModel, x: number, z: number, r: number) {
  const frame = C(["#c03a3a", "#3a6ac0", "#d8d4cc", "#2a2a30"][Math.floor(r * 4)]);
  for (const zz of [z, z + 4]) {
    m.box(x, 1, zz, x + 1, 3, zz + 1, P.black);
    m.box(x, 0, zz + 1, x + 1, 1, zz + 2, P.black);
    m.box(x, 3, zz + 1, x + 1, 4, zz + 2, P.black);
  }
  m.box(x, 3, z + 1, x + 1, 4, z + 5, frame);
  m.box(x, 4, z + 3, x + 1, 5, z + 4, P.black);
}


/**
 * A rooftop garden: parapet, a timber deck, beds of flowers and small trees, a pergola strung
 * with warm lights. Night-time oases above the neon.
 */
export function roofGarden(m: VoxelModel, x0: number, x1: number, d: number, y: number, seed: number) {
  const r = rand(seed);
  m.box(x0, y - 1, 0, x1, y, d, shades(["#3b3745", "#37333f"], 3, seed));
  parapet(m, x0, 0, x1, d, y);
  m.box(x0 + 2, y, 2, x1 - 2, y + 1, d - 2, shades(["#6a4a32", "#5e4230", "#74523a"], 1, seed));
  // planting beds along the edges, flowers and shrubs
  const bed = (bx0: number, bz0: number, bx1: number, bz1: number) => {
    m.box(bx0, y + 1, bz0, bx1, y + 3, bz1, C("#4a3a30"));
    for (let x = bx0 + 1; x < bx1 - 1; x++)
      for (let z = bz0 + 1; z < bz1 - 1; z++) {
        const k = r();
        m.set(x, y + 3, z, k > 0.75 ? C(["#e07ab0", "#f0c040", "#ffffff", "#c05ad0", "#ff7a5a"][Math.floor(r() * 5)]) : k > 0.3 ? P.leaf : P.soil);
      }
  };
  bed(x0 + 2, 2, x1 - 2, 6);
  bed(x0 + 2, 6, x0 + 6, d - 2);
  // small trees in the corners
  for (const [tx, tz] of [
    [x0 + 4, 4],
    [x1 - 5, 4],
  ]) {
    m.box(tx, y + 3, tz, tx + 1, y + 9, tz + 1, P.trunk);
    m.blob(tx + 0.5, y + 11, tz + 0.5, 3.4, r() > 0.5 ? P.leaf : P.blossom, 0.35, seed + tx);
  }
  // pergola with string lights, a bench under it
  const px0 = Math.floor((x0 + x1) / 2) - 6,
    px1 = px0 + 12,
    pz0 = d - 12,
    pz1 = d - 4;
  for (const [x, z] of [
    [px0, pz0],
    [px1, pz0],
    [px0, pz1],
    [px1, pz1],
  ])
    m.box(x, y + 1, z, x + 1, y + 11, z + 1, P.wood);
  for (let x = px0; x <= px1; x += 2) m.box(x, y + 11, pz0, x + 1, y + 12, pz1 + 1, P.wood);
  for (let x = px0; x <= px1; x += 2) {
    m.set(x, y + 10, pz0, E(x % 4 ? "#ffd28a" : "#ff9ac0", 1.8));
    m.set(x, y + 10, pz1, E(x % 4 ? "#ffd28a" : "#ff9ac0", 1.8));
  }
  m.box(px0 + 3, y + 1, pz0 + 3, px1 - 3, y + 3, pz0 + 5, P.woodLight);
  // a little water basin
  m.box(x1 - 9, y + 1, d - 9, x1 - 4, y + 3, d - 4, C("#7a7670"));
  m.box(x1 - 8, y + 2, d - 8, x1 - 5, y + 3, d - 5, C("#2a5a6a"));
}
