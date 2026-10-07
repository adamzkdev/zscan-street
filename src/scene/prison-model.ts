import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "./voxel/model";

/**
 * The voxel parts of the ZEC State Penitentiary on its rock in the bay (six voxels per metre).
 * Each part is its own model with a tight bounding box, so the whole island stays a few million
 * cells. Local axes: x east, y up, z south (the yard side). prison.ts places them.
 */

// ---- palette -----------------------------------------------------------------------------------

/** Concrete that has stood in the salt wind for ninety years: a few close shades, rust streaks. */
function weathered(base: string[], stain: string[], seed: number, streak = 0.07): Paint {
  const b = base.map((h) => C(h));
  const s = stain.map((h) => C(h));
  return (x, y, z) => {
    if (hash(x, 0, z, seed) < streak && hash(x, y >> 3, z, seed + 1) > 0.3) return s[Math.floor(hash(x, y, z, seed + 2) * s.length)];
    return b[Math.floor(hash(x >> 1, y >> 1, z >> 1, seed) * b.length)];
  };
}

const K = {
  concrete: weathered(["#c4beb2", "#bcb6aa", "#cac4b8", "#b6b0a4"], ["#9c968a", "#a29a8a", "#8e877b"], 3),
  plinth: shades(["#8e887e", "#86807a", "#948e84"], 1, 4),
  band: shades(["#d6d0c4", "#d0cabe"], 1, 5),
  reveal: C("#9a9488"),
  coping: shades(["#a8a296", "#a29c90"], 1, 6),
  tar: shades(["#3e3a44", "#38343e", "#423e48"], 2, 7),
  bar: C("#2e2c34"),
  barLight: C("#4a4852"),
  muntin: C("#5a5650"),
  glass: G("#1c2430"),
  glassPale: G("#7f97ab"),
  rust: shades(["#7a4a32", "#6a3e2a", "#84553a"], 1, 8),
  steel: shades(["#4a4852", "#44424c", "#504e58"], 1, 9),
  wood: shades(["#6a4a32", "#5e422c", "#735038"], 1, 10),
  woodDark: shades(["#3e2c20", "#46322a", "#382818"], 1, 11),
  white: C("#e8e6e2"),
  dark: C("#1a181e"),
  black: C("#121116"),
  zec: C("#f4b728"),
  gravel: shades(["#7e7a76", "#76726e", "#86827c", "#706c68"], 1, 12),
  grass: shades(["#4f7a42", "#5a8a4a", "#466e3c", "#5f9050"], 1, 13),
  leaf: shades(["#2f6b3c", "#3d8a4a", "#285c33", "#357a42"], 1, 14),
  ivy: shades(["#2c5a30", "#356a38", "#24502a"], 1, 15),
};

const at = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));

const LIT = [E("#cfe6ff", 1.0), E("#e4f0ff", 0.95), E("#ffd9a0", 1.1), E("#bcdcff", 1.0)];
const CELLBAR = C("#8e9a94");
const CELLBAR_DARK = C("#5e6a66");
const LAMP = E("#fff1c8", 2.2);
const FLOOD = E("#f4f7ff", 3);

// ---- a wall face to draw on ---------------------------------------------------------------------

/**
 * A wall face: u runs along the wall, y up, d out of the wall (0 = the surface layer, negative into
 * the wall, positive into the air). `axis` is the face's normal axis.
 */
class Face {
  constructor(
    readonly m: VoxelModel,
    readonly axis: "x" | "z",
    readonly surf: number,
    readonly dir: 1 | -1,
  ) {}
  private n(d: number) {
    return this.surf + this.dir * d;
  }
  set(u: number, y: number, d: number, c: Paint) {
    const n = this.n(d);
    if (this.axis === "z") this.m.set(u, y, n, c);
    else this.m.set(n, y, u, c);
  }
  box(u0: number, y0: number, d0: number, u1: number, y1: number, d1: number, c: Paint) {
    const a = this.n(d0),
      b = this.n(d1 - 1);
    const n0 = Math.min(a, b),
      n1 = Math.max(a, b) + 1;
    if (this.axis === "z") this.m.box(u0, y0, n0, u1, y1, n1, c);
    else this.m.box(n0, y0, u0, n1, y1, u1, c);
  }
}

/** A barred window: concrete reveal, paned glass (some lit) behind a row of steel bars, a sill. */
function barredWindow(f: Face, u: number, y: number, w: number, h: number, seed: number, lit = 0.35) {
  f.box(u - 1, y - 1, 0, u + w + 1, y + h + 1, 1, K.reveal);
  f.box(u, y, -2, u + w, y + h, 1, 0);
  const r = hash(u, y, f.surf, seed);
  f.box(u, y, -3, u + w, y + h, -2, r < lit ? LIT[Math.floor(r * 97) % LIT.length] : K.glass);
  for (let yy = y + 3; yy < y + h; yy += 4) f.box(u, yy, -2, u + w, yy + 1, -1, K.muntin);
  f.box(u + Math.floor(w / 2), y, -2, u + Math.floor(w / 2) + 1, y + h, -1, K.muntin);
  for (let uu = u + 1; uu < u + w; uu += 2) f.box(uu, y, 0, uu + 1, y + h, 1, K.bar);
  f.box(u, y + h - 1, 0, u + w, y + h, 1, K.bar);
  f.box(u - 1, y - 2, 0, u + w + 1, y - 1, 2, K.band);
}

/** A line of voxels between two points (bracing, wires, ropes). */
function line(m: VoxelModel, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Paint) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
  for (let i = 0; i <= n; i++) m.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, z0 + ((z1 - z0) * i) / n, c);
}

// ---- the cell house -----------------------------------------------------------------------------

export const HOUSE = { margin: 3, w: 192, d: 54, portico: 15, top: 64 };

/**
 * The main cell house: three storeys of pale concrete, eight bays of tall barred windows on both
 * long sides, pilasters, a clerestory skylight along the roof, an entrance portico with a clock
 * and the Zcash flag at the east end, floodlights on the yard parapet. `wing` = the x range
 * (voxels) the one-storey cell wing covers on the south side, where the ground floor is blind.
 */
export function cellHouse(wing: [number, number], seed = 21) {
  const M = HOUSE.margin,
    W = HOUSE.w,
    D = HOUSE.d,
    PW = HOUSE.portico,
    T = HOUSE.top;
  const m = new VoxelModel(M + W + PW + M, 90, M + D + M);
  const X0 = M,
    X1 = M + W,
    Z0 = M,
    Z1 = M + D;
  m.box(X0, 0, Z0, X1, T, Z1, K.concrete);
  m.box(X0 - 1, 0, Z0 - 1, X1 + 1, 4, Z1 + 1, K.plinth);
  for (const y of [23, 43]) m.box(X0 - 1, y, Z0 - 1, X1 + 1, y + 1, Z1 + 1, K.band);
  m.box(X0 - 1, T - 2, Z0 - 1, X1 + 1, T, Z1 + 1, K.band);
  // parapet and roof deck
  m.box(X0, T, Z0, X1, T + 3, Z1, K.concrete);
  m.box(X0 - 1, T + 3, Z0 - 1, X1 + 1, T + 4, Z1 + 1, K.coping);
  m.clear(X0 + 2, T, Z0 + 2, X1 - 2, T + 4, Z1 - 2);
  m.box(X0 + 2, T - 1, Z0 + 2, X1 - 2, T, Z1 - 2, K.tar);
  const north = new Face(m, "z", Z0, -1);
  const south = new Face(m, "z", Z1 - 1, 1);
  const west = new Face(m, "x", X0, -1);
  const storeys = [6, 26, 46];
  for (let k = 0; k <= 8; k++) {
    // pilasters
    const px = X0 + k * 24 - (k === 8 ? 3 : k === 0 ? 0 : 1);
    for (const f of [north, south]) f.box(px, 4, 0, px + 3, T - 2, 2, K.concrete);
    if (k === 8) continue;
    const u = X0 + k * 24 + 5;
    for (const [s, y] of storeys.entries()) {
      barredWindow(north, u, y, 14, 14, seed + k * 7 + s, 0.4);
      const blind = s === 0 && u + 14 > wing[0] && u < wing[1];
      if (!blind) barredWindow(south, u, y, 14, 14, seed + 50 + k * 7 + s, 0.3);
    }
  }
  for (const [s, y] of storeys.entries())
    for (const u of [Z0 + 8, Z0 + 32]) barredWindow(west, u, y, 14, 14, seed + 90 + s + u, 0.3);
  // the yard door at the west end of the south side, steps down to the yard
  {
    const u = X0 + 5;
    south.box(u - 2, 4, 0, u + 12, 22, 2, K.band);
    south.box(u, 4, -3, u + 10, 20, 2, 0);
    south.box(u, 4, -4, u + 10, 20, -3, K.woodDark);
    for (let uu = u + 1; uu < u + 10; uu += 2) south.box(uu, 4, -1, uu + 1, 20, 0, K.bar);
    south.box(u + 3, 21, 1, u + 7, 22, 3, LAMP);
    for (let s = 0; s < 3; s++) south.box(u - 1, 0, 1 + s, u + 11, 4 - s, 2 + s, K.plinth);
  }
  // a service door and drainpipes on the north (city) side
  north.box(X0 + 101, 4, -2, X0 + 109, 18, 1, 0);
  north.box(X0 + 101, 4, -3, X0 + 109, 18, -2, K.rust);
  north.box(X0 + 103, 19, 1, X0 + 107, 20, 3, LAMP);
  for (const x of [X0 + 23, X0 + 71, X0 + 143]) north.box(x, 2, 2, x + 1, T, 3, K.steel);
  // ---- roof: the clerestory skylight down the middle, vents, a mast ----
  const zc = Z0 + Math.floor(D / 2);
  m.box(X0 + 8, T, zc - 9, X1 - 8, T + 8, zc + 9, K.muntin);
  for (let x = X0 + 9; x < X1 - 9; x++) if ((x - X0) % 4) for (const z of [zc - 9, zc + 8]) m.box(x, T + 2, z, x + 1, T + 7, z + 1, hash(x, 0, z, seed) < 0.25 ? LIT[1] : K.glassPale);
  m.box(X0 + 7, T + 8, zc - 10, X1 - 7, T + 9, zc + 10, K.tar);
  m.box(X0 + 9, T + 9, zc - 3, X1 - 9, T + 10, zc + 3, K.coping);
  for (const x of [X0 + 14, X0 + 62, X0 + 118, X0 + 170]) {
    m.cylinder(x, T, Z0 + 7, 2.2, 7, K.steel);
    m.box(x - 3, T + 7, Z0 + 4, x + 3, T + 8, Z0 + 10, K.dark);
    m.box(x + 4, T, Z1 - 12, x + 12, T + 5, Z1 - 6, C("#b8b4ae"));
    m.box(x + 5, T + 1, Z1 - 6, x + 11, T + 4, Z1 - 5, C("#6e6a72"));
  }
  m.box(X0 + 180, T, Z0 + 6, X0 + 181, T + 24, Z0 + 7, K.steel);
  m.box(X0 + 178, T + 24, Z0 + 6, X0 + 183, T + 25, Z0 + 7, E("#ff3030", 2));
  // floodlights on the yard parapet, leaning out over the yard
  for (let x = X0 + 16; x < X1 - 8; x += 32) {
    m.box(x, T + 3, Z1 - 1, x + 1, T + 9, Z1, K.steel);
    m.box(x - 2, T + 8, Z1, x + 3, T + 10, Z1 + 2, K.dark);
    m.box(x - 2, T + 7, Z1 + 1, x + 3, T + 8, Z1 + 2, FLOOD);
  }
  // ---- the portico at the east end: two storeys, a clock, the door, the flag ----
  const pz0 = Z0 + 8,
    pz1 = Z1 - 8;
  const PX1 = X1 + PW;
  m.box(X1, 0, pz0, PX1, 42, pz1, K.concrete);
  m.box(X1, 0, pz0 - 1, PX1 + 1, 4, pz1 + 1, K.plinth);
  m.box(X1, 40, pz0 - 1, PX1 + 1, 42, pz1 + 1, K.band);
  m.box(X1, 42, pz0, PX1, 45, pz1, K.concrete);
  m.box(X1, 45, pz0 - 1, PX1 + 1, 46, pz1 + 1, K.coping);
  m.clear(X1 + 2, 43, pz0 + 2, PX1 - 2, 46, pz1 - 2);
  const east = new Face(m, "x", PX1 - 1, 1);
  const mid = Math.floor((pz0 + pz1) / 2);
  // columns either side of the door
  for (const u of [mid - 12, mid - 9, mid + 7, mid + 10]) east.box(u, 4, 0, u + 2, 24, 3, K.band);
  east.box(mid - 13, 24, 0, mid + 13, 27, 3, K.band);
  east.box(mid - 5, 4, -3, mid + 5, 20, 1, 0);
  east.box(mid - 5, 4, -4, mid + 5, 20, -3, K.woodDark);
  east.box(mid, 4, -3, mid + 1, 20, -2, K.dark);
  east.box(mid - 2, 21, 1, mid + 2, 22, 2, LAMP);
  for (let s = 0; s < 3; s++) east.box(mid - 7, 0, 1 + s, mid + 7, 4 - s, 2 + s, K.plinth);
  for (const u of [pz0 + 3, pz1 - 7]) barredWindow(east, u, 28, 4, 10, seed + u, 0.5);
  // the clock
  for (let a = -6; a <= 6; a++)
    for (let b = -6; b <= 6; b++) {
      const r = Math.hypot(a, b);
      if (r > 6.2) continue;
      east.set(mid + a, 34 + b, 1, r > 5 ? K.dark : C("#f2eee4"));
    }
  east.box(mid, 34, 2, mid + 1, 39, 3, K.dark);
  east.box(mid, 34, 2, mid + 4, 35, 3, K.dark);
  // flag on the portico roof: yellow, a black Z
  const fx = PX1 - 6,
    fz = mid;
  m.box(fx, 42, fz, fx + 1, 88, fz + 1, K.steel);
  m.box(fx - 1, 88, fz - 1, fx + 2, 89, fz + 2, K.zec);
  for (let x = 1; x <= 16; x++)
    for (let y = 0; y < 11; y++) {
      const wave = Math.round(Math.sin(x * 0.45) * 1.2);
      // a Z in the middle of the flag: top bar, bottom bar, the diagonal between
      const zx = 16 - x - 3,
        zy = 9 - y;
      const inZ = zx >= 0 && zx < 10 && zy >= 1 && zy <= 8;
      const isZ = inZ && (zy === 1 || zy === 8 || zx === 9 - Math.round(((zy - 1) * 9) / 7));
      m.set(fx - x, 76 + y, fz + wave, isZ ? K.black : K.zec);
    }
  return m;
}

// ---- the cell wing: six cells opening on the yard ------------------------------------------------

export const WING = { margin: 3, cell: 27, depth: 34, bars: 32, lintel: 19, top: 24 };

export type CellKind = "sbf" | "cz" | "dok" | "bcc" | "gox" | "you";

/**
 * The cell wing: a row of cells against the cell house, barred fronts on the yard, a grille for a
 * roof so the cells (and who is in them) can be seen from above. Each cell has a bunk, a steel
 * toilet and basin, a shelf and a table, and a few things of its own.
 */
export function cellWing(kinds: CellKind[], seed = 31) {
  const M = WING.margin,
    CW = WING.cell,
    D = WING.depth,
    BZ = WING.bars,
    LY = WING.lintel,
    TOP = WING.top;
  const W = kinds.length * CW + 2;
  const m = new VoxelModel(M + W + M, TOP + 2, D + 3);
  const tile = (x: number, _y: number, z: number) => ((Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? C("#a8a49c") : C("#b6b2a8"));
  m.box(M, 0, 0, M + W, 1, D + 2, tile);
  const wall = K.concrete;
  for (let i = 0; i <= kinds.length; i++) {
    const cx = M + i * CW;
    m.box(cx, 1, 0, cx + 2, TOP, BZ, wall);
    m.box(cx - (i ? 1 : 0), 0, BZ - 1, cx + 2 + (i < kinds.length ? 1 : 0), TOP, D, wall);
  }
  m.box(M, LY, BZ - 1, M + W, TOP, D, wall);
  // the cells are whitewashed inside, so they read through the bars
  m.paint(M + 1, 1, 0, M + W - 1, LY, BZ - 1, C("#dcd8ce"));
  m.box(M - 1, TOP - 1, BZ - 1, M + W + 1, TOP, D + 1, K.band);
  m.box(M - 1, 0, D, M + W + 1, 1, D + 2, K.plinth);
  // the grille roof: a frame, steel straps every half metre
  for (let x = M; x < M + W; x++)
    for (let z = 0; z < BZ - 1; z++) if ((x - M) % 4 === 0 || z % 4 === 0 || z < 1) m.set(x, TOP - 1, z, (x - M) % 27 < 2 || z % 16 === 0 ? CELLBAR_DARK : CELLBAR);
  m.box(M, TOP - 1, 0, M + W, TOP, 1, K.concrete);
  kinds.forEach((kind, i) => {
    const cx = M + i * CW + 2; // first free column inside
    const ux = cx + CW - 2; // last + 1
    const r = rand(seed + i * 13);
    // the barred front: bars, three straps, a door with a lock box
    for (let x = cx; x < ux; x++) if ((x - cx) % 3 === 1) m.box(x, 1, BZ, x + 1, LY, BZ + 1, CELLBAR);
    for (const y of [1, 6, LY - 1]) m.box(cx, y, BZ, ux, y + 1, BZ + 1, CELLBAR);
    m.box(cx + 13, 1, BZ - 1, cx + 14, LY, BZ + 2, CELLBAR_DARK);
    m.box(cx + 14, 8, BZ + 1, cx + 17, 12, BZ + 2, CELLBAR_DARK);
    m.set(cx + 15, 11, BZ + 2, kind === "cz" ? E("#3ddc97", 2) : E("#ff3a3a", 2));
    // the bunk against the back wall
    m.box(cx + 1, 1, 1, cx + 2, 4, 2, K.steel);
    m.box(cx + 13, 1, 1, cx + 14, 4, 2, K.steel);
    m.box(cx + 1, 1, 6, cx + 2, 4, 7, K.steel);
    m.box(cx + 13, 1, 6, cx + 14, 4, 7, K.steel);
    m.box(cx + 1, 3, 1, cx + 14, 4, 7, K.steel);
    m.box(cx + 1, 4, 1, cx + 14, 5, 7, C("#d8d2c4"));
    const blanket = kind === "you" ? C("#8a8478") : kind === "cz" ? C("#e0b030") : ["#3a4a6a", "#5a3a3a", "#4a5a3a", "#6a5a3a"].map((h) => C(h))[i % 4];
    if (kind === "cz") m.box(cx + 4, 5, 2, cx + 9, 7, 5, blanket);
    else m.box(cx + 1, 5, 1, cx + 10 + Math.floor(r() * 2), 6, 7, blanket);
    m.box(cx + 11, 5, 2, cx + 14, 6, 6, K.white);
    // steel toilet and basin in the back corner, a mirror plate
    m.box(ux - 5, 1, 1, ux - 2, 3, 4, C("#b8bcc4"));
    m.box(ux - 5, 3, 1, ux - 2, 4, 4, C("#d0d4da"));
    m.set(ux - 4, 3, 2, K.dark);
    m.box(ux - 9, 6, 0, ux - 6, 8, 3, C("#b8bcc4"));
    m.box(ux - 8, 8, 0, ux - 7, 9, 2, K.steel);
    m.box(ux - 9, 10, 0, ux - 6, 14, 1, C("#9aa0aa"));
    // shelf with books on the back wall
    m.box(cx + 2, 13, 0, cx + 12, 14, 2, K.wood);
    for (let x = cx + 2; x < cx + 12; x++) if (r() > 0.25) m.box(x, 14, 0, x + 1, 15 + Math.floor(r() * 2), 2, ["#8a3a2a", "#2a4a7a", "#c8b070", "#3a6a3a", "#d8d4cc"].map((h) => C(h))[Math.floor(r() * 5)]);
    // table and stool by the side wall
    m.box(ux - 7, 1, 12, ux - 6, 5, 13, K.steel);
    m.box(ux - 2, 1, 12, ux - 1, 5, 13, K.steel);
    m.box(ux - 7, 1, 17, ux - 6, 5, 18, K.steel);
    m.box(ux - 2, 1, 17, ux - 1, 5, 18, K.steel);
    m.box(ux - 7, 5, 12, ux - 1, 6, 18, K.wood);
    m.box(ux - 11, 1, 14, ux - 10, 3, 15, K.steel);
    m.box(ux - 12, 3, 13, ux - 9, 4, 16, K.wood);
    // the light hanging from the grille
    m.box(cx + 11, 21, 15, cx + 12, TOP - 1, 16, K.dark);
    m.box(cx + 10, 20, 14, cx + 13, 21, 17, LAMP);
    // and what makes the cell theirs
    if (kind === "sbf") {
      // a laptop (League open), a tangle of energy-drink cans, a poster
      m.box(ux - 6, 6, 13, ux - 2, 7, 16, K.dark);
      m.box(ux - 6, 7, 16, ux - 2, 10, 17, E("#4aa8ff", 1.4));
      for (let k = 0; k < 4; k++) m.box(cx + 3 + k * 2, 1, 10 + (k % 2), cx + 4 + k * 2, 3, 11 + (k % 2), C(k % 2 ? "#3a8a4a" : "#d8d4cc"));
      m.box(cx + 15, 8, 0, cx + 21, 13, 1, C("#2a5aaa"));
      m.box(cx + 16, 9, 0, cx + 20, 12, 1, C("#f2f2f6"));
    } else if (kind === "dok") {
      // a moon poster, eclipsing
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (a * a + b * b <= 10) m.set(cx + 18 + a, 10 + b, 0, a > 1 && b > -2 ? C("#2a2832") : C("#f4d860"));
      m.box(cx + 14, 6, 0, cx + 22, 7, 1, C("#3a2a6a"));
    } else if (kind === "bcc") {
      // a microphone stand, for the seminars
      m.box(cx + 16, 1, 22, cx + 19, 2, 25, K.dark);
      m.box(cx + 17, 2, 23, cx + 18, 10, 24, K.steel);
      m.box(cx + 17, 10, 22, cx + 18, 11, 24, K.dark);
      m.box(cx + 15, 8, 0, cx + 21, 13, 1, C("#e8a020"));
      m.box(cx + 16, 9, 0, cx + 20, 12, 1, C("#1a3a8a"));
    } else if (kind === "gox") {
      // an open chest, empty; little stacks of trading cards on the table
      m.box(cx + 3, 1, 10, cx + 9, 4, 14, K.wood);
      m.box(cx + 4, 2, 11, cx + 8, 4, 13, K.dark);
      m.box(cx + 3, 4, 9, cx + 9, 7, 10, K.wood);
      for (let k = 0; k < 3; k++) m.box(ux - 6 + k * 2, 6, 13 + k, ux - 5 + k * 2, 7 + (k % 2), 14 + k, C(["#c83a2a", "#2a6ac8", "#3a9a4a"][k]));
    } else if (kind === "cz") {
      m.box(cx + 4, 5, 2, cx + 9, 7, 5, blanket);
    }
  });
  return m;
}

// ---- walls --------------------------------------------------------------------------------------

export const WALL = { h: 27, thick: 5, back: 1 };

/**
 * A length of prison wall built along x, its inside facing +z: buttresses outside, a coping, Y
 * posts for the barbed wire, optionally the guards' catwalk on the inside and floodlights.
 * Gaps are [u0, u1) ranges in voxels.
 */
export function wallModel(len: number, o: { catwalk?: boolean; lights?: number; gaps?: [number, number][]; gate?: [number, number]; seed?: number } = {}) {
  const H = WALL.h;
  const z0 = WALL.back,
    z1 = WALL.back + WALL.thick;
  const m = new VoxelModel(len, H + 14, z1 + 8);
  m.box(0, 0, z0, len, H, z1, K.concrete);
  m.box(0, 0, z0 - 1, len, 3, z1 + 1, K.plinth);
  m.box(0, H, z0 - 1, len, H + 1, z1 + 1, K.coping);
  for (let x = 6; x < len - 3; x += 24) {
    m.box(x, 0, 0, x + 3, H - 2, z0, K.concrete);
    m.box(x + 1, 3, z1 - 1, x + 2, H - 1, z1, C("#a8a296"));
  }
  // wire posts
  for (let x = 3; x < len - 1; x += 12) {
    m.box(x, H + 1, z0 + 2, x + 1, H + 4, z0 + 3, K.steel);
    line(m, x, H + 4, z0 + 2, x, H + 6, z0, K.steel);
    line(m, x, H + 4, z0 + 2, x, H + 6, z1 - 1 + 1, K.steel);
  }
  if (o.catwalk) {
    const y = 20;
    for (let x = 4; x < len - 2; x += 12) line(m, x, y - 4, z1, x, y, z1 + 5, K.steel);
    m.box(0, y, z1, len, y + 1, z1 + 6, K.wood);
    for (let x = 0; x < len; x += 6) m.box(x, y + 1, z1 + 5, x + 1, y + 7, z1 + 6, K.steel);
    m.box(0, y + 6, z1 + 5, len, y + 7, z1 + 6, K.steel);
    m.box(0, y + 3, z1 + 5, len, y + 4, z1 + 6, K.steel);
  }
  if (o.lights)
    for (let x = Math.floor(o.lights / 2); x < len - 4; x += o.lights) {
      m.box(x, H + 1, z1 - 2, x + 1, H + 10, z1 - 1, K.steel);
      m.box(x, H + 9, z1 - 1, x + 1, H + 10, z1 + 1, K.steel);
      m.box(x - 1, H + 9, z1 + 1, x + 2, H + 11, z1 + 3, K.dark);
      m.box(x - 1, H + 8, z1 + 1, x + 2, H + 9, z1 + 3, FLOOD);
    }
  for (const [a, b] of o.gaps ?? []) m.clear(a, 0, 0, b, m.h, m.d);
  if (o.gate) {
    // a barred gate through the wall, a lintel over it
    const [a, b] = o.gate;
    m.clear(a, 0, 0, b, H - 6, m.d);
    m.box(a - 1, 0, z0 - 1, a, H - 5, z1 + 1, K.steel);
    m.box(b, 0, z0 - 1, b + 1, H - 5, z1 + 1, K.steel);
    const gz = z0 + 2;
    for (let x = a + 1; x < b; x += 2) m.box(x, 0, gz, x + 1, H - 6, gz + 1, K.bar);
    for (const y of [1, 9, H - 7]) m.box(a, y, gz, b, y + 1, gz + 1, K.bar);
  }
  return m;
}

// ---- watch tower --------------------------------------------------------------------------------

export const TOWER = { w: 26, lens: 74 };

/** A guard tower on steel legs: braced, a ladder, a glazed cabin with a balcony, a searchlight. */
export function watchTower() {
  const m = new VoxelModel(26, 80, 26);
  const legs: [number, number][] = [
    [4, 4],
    [20, 4],
    [4, 20],
    [20, 20],
  ];
  m.box(2, 0, 2, 24, 2, 24, K.plinth);
  for (const [x, z] of legs) m.box(x, 2, z, x + 2, 54, z + 2, K.steel);
  for (const y0 of [4, 20, 36]) {
    const y1 = y0 + 14;
    line(m, 5, y0, 4, 20, y1, 4, K.steel);
    line(m, 20, y0, 4, 5, y1, 4, K.steel);
    line(m, 5, y0, 21, 20, y1, 21, K.steel);
    line(m, 20, y0, 21, 5, y1, 21, K.steel);
    line(m, 4, y0, 5, 4, y1, 20, K.steel);
    line(m, 4, y0, 20, 4, y1, 5, K.steel);
    line(m, 21, y0, 5, 21, y1, 20, K.steel);
    line(m, 21, y0, 20, 21, y1, 5, K.steel);
    m.box(4, y1, 4, 22, y1 + 1, 6, K.steel);
    m.box(4, y1, 20, 22, y1 + 1, 22, K.steel);
  }
  // ladder up the south side
  for (const x of [11, 15]) m.box(x, 2, 23, x + 1, 56, 24, K.steel);
  for (let y = 4; y < 56; y += 3) m.box(11, y, 23, 16, y + 1, 24, K.steel);
  // cabin
  m.box(1, 54, 1, 25, 56, 25, K.plinth);
  m.box(4, 56, 4, 22, 59, 22, K.concrete);
  m.box(4, 59, 4, 22, 65, 22, G("#4a6078"));
  m.clear(5, 56, 5, 21, 65, 21);
  for (const a of [4, 9, 13, 17, 21]) {
    m.box(a, 59, 4, a + 1, 65, 5, K.dark);
    m.box(a, 59, 21, a + 1, 65, 22, K.dark);
    m.box(4, 59, a, 5, 65, a + 1, K.dark);
    m.box(21, 59, a, 22, 65, a + 1, K.dark);
  }
  m.box(4, 65, 4, 22, 66, 22, K.concrete);
  // a lamp inside, the guard's desk
  m.box(12, 63, 12, 14, 64, 14, LAMP);
  m.box(6, 56, 6, 20, 58, 9, K.wood);
  // balcony rail
  for (let a = 1; a < 25; a += 3) for (const [x, z] of [[a, 1], [a, 24], [1, a], [24, a]] as const) m.box(x, 56, z, x + 1, 60, z + 1, K.steel);
  for (const [x0, z0, x1, z1] of [[1, 1, 25, 2], [1, 24, 25, 25], [1, 1, 2, 25], [24, 1, 25, 25]] as const) m.box(x0, 60, z0, x1, 61, z1, K.steel);
  m.clear(11, 56, 24, 16, 61, 25);
  // roof, hipped a little, and the searchlight
  m.box(2, 66, 2, 24, 67, 24, K.dark);
  m.box(4, 67, 4, 22, 68, 22, K.tar);
  m.box(7, 68, 7, 19, 69, 19, K.tar);
  m.box(11, 69, 11, 15, 71, 15, K.steel);
  m.cylinder(13, 71, 13, 3.2, 4, K.dark);
  m.cylinder(13, 75, 13, 2.2, 1, E("#fff4d0", 3));
  return m;
}

// ---- water tower --------------------------------------------------------------------------------

export const TANK = { w: 42, y0: 72, h: 30, r: 16 };

/** The water tower on its lattice legs: a riveted tank, a catwalk round its base, a conical roof. */
export function waterTower(seed = 61) {
  const m = new VoxelModel(42, 120, 42);
  const c = 21;
  const legs: [number, number][] = [
    [6, 6],
    [34, 6],
    [6, 34],
    [34, 34],
  ];
  for (const [x, z] of legs) {
    m.box(x - 1, 0, z - 1, x + 3, 2, z + 3, K.plinth);
    m.box(x, 2, z, x + 2, TANK.y0, z + 2, K.rust);
  }
  for (const y0 of [6, 28, 50]) {
    const y1 = y0 + 20;
    line(m, 7, y0, 6, 34, y1, 6, K.rust);
    line(m, 34, y0, 6, 7, y1, 6, K.rust);
    line(m, 7, y0, 35, 34, y1, 35, K.rust);
    line(m, 34, y0, 35, 7, y1, 35, K.rust);
    line(m, 6, y0, 7, 6, y1, 34, K.rust);
    line(m, 6, y0, 34, 6, y1, 7, K.rust);
    line(m, 35, y0, 7, 35, y1, 34, K.rust);
    line(m, 35, y0, 34, 35, y1, 7, K.rust);
    m.box(6, y1, 6, 36, y1 + 1, 8, K.rust);
    m.box(6, y1, 34, 36, y1 + 1, 36, K.rust);
    m.box(6, y1, 6, 8, y1 + 1, 36, K.rust);
    m.box(34, y1, 6, 36, y1 + 1, 36, K.rust);
  }
  m.cylinder(c, 0, c, 1.6, TANK.y0, K.steel);
  // tank
  const tank = weathered(["#d4d0c6", "#ccc8bd", "#dad6cc"], ["#a06a48", "#8e5a3c", "#b07a52"], seed, 0.16);
  m.cylinder(c, TANK.y0, c, TANK.r, TANK.h, tank);
  for (const y of [TANK.y0, TANK.y0 + 10, TANK.y0 + 20, TANK.y0 + TANK.h - 1]) m.cylinder(c, y, c, TANK.r + 0.5, 1, C("#a8a49a"), true);
  // catwalk round the bottom of the tank, with its rail
  m.cylinder(c, TANK.y0 - 1, c, TANK.r + 3, 1, K.steel, true);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) m.box(c + Math.cos(a) * (TANK.r + 2.6), TANK.y0, c + Math.sin(a) * (TANK.r + 2.6), c + Math.cos(a) * (TANK.r + 2.6) + 1, TANK.y0 + 5, c + Math.sin(a) * (TANK.r + 2.6) + 1, K.steel);
  m.cylinder(c, TANK.y0 + 5, c, TANK.r + 3.1, 1, K.steel, true);
  // roof
  const top = TANK.y0 + TANK.h;
  for (let k = 0; k < 12; k++) m.cylinder(c, top + k, c, TANK.r + 0.8 - k * 1.45, 1, k ? C(k % 3 ? "#5a5660" : "#504c56") : C("#a8a49a"));
  m.box(c - 1, top + 12, c - 1, c + 1, top + 16, c + 1, K.steel);
  m.box(c - 2, top + 16, c - 2, c + 2, top + 17, c + 2, E("#ff3030", 2));
  // ladder up the east leg side
  for (const z of [19, 23]) m.box(38, 0, z, 39, TANK.y0 + 4, z + 1, K.steel);
  for (let y = 3; y < TANK.y0 + 4; y += 3) m.box(38, y, 19, 39, y + 1, 24, K.steel);
  return m;
}

// ---- lighthouse ---------------------------------------------------------------------------------

export const LIGHT = { w: 40, lamp: 121 };

/** The lighthouse: a tapering white tower, slit windows, a gallery, the lantern, a dark cupola. */
export function lighthouse(seed = 71) {
  const m = new VoxelModel(40, 150, 40);
  const c = 20;
  m.cylinder(c, 0, c, 14, 4, shades(["#7a7480", "#726c78", "#827c88"], 1, seed));
  const white = shades(["#eeece6", "#e6e4de", "#f2f0ea"], 1, seed + 1);
  for (let y = 4; y < 110; y++) m.cylinder(c, y, c, 11 - ((y - 4) / 106) * 3, 1, white);
  for (const y of [30, 60, 88]) m.cylinder(c, y, c, 11.2 - ((y - 4) / 106) * 3, 2, C("#c8c4bc"), true);
  // slit windows facing the yard, and the door
  for (const y of [22, 46, 72, 96]) {
    const r = 11 - ((y - 4) / 106) * 3;
    m.box(c - 1, y, c + Math.floor(r) - 1, c + 1, y + 7, c + Math.ceil(r) + 1, K.glass);
    m.box(c + Math.floor(r) - 1, y + 6, c - 1, c + Math.ceil(r) + 1, y + 13, c + 1, K.glass);
  }
  m.box(c - 3, 4, c + 8, c + 3, 18, c + 12, 0);
  m.box(c - 3, 4, c + 8, c + 3, 18, c + 9, K.woodDark);
  m.box(c - 4, 18, c + 9, c + 4, 19, c + 13, K.band);
  m.box(c - 1, 19, c + 11, c + 1, 20, c + 12, LAMP);
  // gallery: a ring of brackets, the platform, its rail
  for (let k = 0; k < 4; k++) m.cylinder(c, 106 + k, c, 8.5 + k * 1.2, 1, C("#d8d6d0"));
  m.cylinder(c, 110, c, 13, 2, K.dark);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) m.box(c + Math.cos(a) * 12.4, 112, c + Math.sin(a) * 12.4, c + Math.cos(a) * 12.4 + 1, 117, c + Math.sin(a) * 12.4 + 1, K.dark);
  m.cylinder(c, 117, c, 13, 1, K.dark, true);
  // the lantern: glazing between dark posts, the lamp glowing through
  m.cylinder(c, 112, c, 7.5, 3, K.dark);
  for (let y = 115; y < 128; y++)
    for (let z = c - 8; z <= c + 8; z++)
      for (let x = c - 8; x <= c + 8; x++) {
        const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
        if (d > 7.2) continue;
        const ang = Math.atan2(z + 0.5 - c, x + 0.5 - c);
        const post = Math.abs(((ang / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.42;
        m.set(x, y, z, d > 6.1 ? (post || y === 121 ? K.dark : E("#fff0c0", 1.5)) : d < 3.5 ? E("#fff8e0", 3) : 0);
      }
  for (let k = 0; k < 7; k++) m.cylinder(c, 128 + k, c, 8 - k * 1.1, 1, C(k % 2 ? "#2c4a42" : "#33564c"));
  m.cylinder(c, 135, c, 1.8, 3, K.dark);
  m.box(c, 138, c, c + 1, 148, c + 1, K.dark);
  return m;
}

// ---- the warden's house, burnt out --------------------------------------------------------------

/** The warden's house, a roofless ruin: two storeys of scorched stucco, a chimney standing, ivy, a tree inside. */
export function wardenRuin(seed = 81) {
  const W = 54,
    D = 48,
    H = 42;
  const m = new VoxelModel(W + 4, 60, D + 6);
  const x0 = 2,
    z0 = 2,
    x1 = x0 + W,
    z1 = z0 + D;
  const stucco = weathered(["#d2c6ae", "#cabea6", "#d8ccb4"], ["#3a332e", "#4a403a", "#2a2522", "#5a4e44"], seed, 0.2);
  m.box(x0, 0, z0, x1, H, z1, stucco);
  m.clear(x0 + 3, 1, z0 + 3, x1 - 3, H, z1 - 3);
  m.box(x0 - 1, 0, z0 - 1, x1 + 1, 3, z1 + 1, K.plinth);
  m.box(x0 + 3, 0, z0 + 3, x1 - 3, 1, z1 - 3, shades(["#2e2a28", "#3a3430", "#24201e", "#4a4038"], 1, seed));
  // window openings, empty, soot above them
  const faces = [new Face(m, "z", z0, -1), new Face(m, "z", z1 - 1, 1), new Face(m, "x", x0, -1), new Face(m, "x", x1 - 1, 1)];
  faces.forEach((f, i) => {
    const len = i < 2 ? W : D;
    const start = i < 2 ? x0 : z0;
    for (let u = start + 6; u < start + len - 8; u += 12)
      for (const y of [6, 26]) {
        f.box(u, y, -3, u + 6, y + 11, 1, 0);
        f.box(u - 1, y - 1, 0, u + 7, y, 2, K.band);
        f.box(u, y + 11, 0, u + 6, y + 15, 1, C("#2e2824"));
      }
  });
  // what the fire and the years left: the top of the walls falls away, a big breach at the SE corner
  for (let x = 0; x < m.w; x++)
    for (let z = 0; z < m.d; z++) {
      const u = x + z;
      let lim = H - 4 - Math.floor(Math.abs(Math.sin(u * 0.09 + seed)) * 10 + hash(x >> 2, 0, z >> 2, seed) * 6);
      const breach = Math.hypot(x - x1, z - z1);
      if (breach < 26) lim = Math.min(lim, 6 + Math.floor((breach / 26) * 26 + hash(x, 1, z, seed) * 4));
      m.clear(x, lim, z, x + 1, H + 2, z + 1);
    }
  // rubble where it fell
  const rubble = shades(["#c8bca4", "#8e877b", "#5a5048", "#d2c6ae", "#3a332e"], 1, seed + 3);
  m.blob(x1 - 8, 1, z1 - 8, 7, rubble, 0.5, seed);
  m.blob(x1 + 1, 0, z1 - 2, 5, rubble, 0.5, seed + 1);
  m.blob(x0 + 14, 1, z0 + 12, 4, rubble, 0.5, seed + 2);
  // charred joists of the upper floor
  for (let x = x0 + 5; x < x1 - 12; x += 7) if (hash(x, 2, 0, seed) > 0.3) m.box(x, 20, z0 + 3, x + 2, 22, z0 + 3 + Math.floor(12 + hash(x, 3, 0, seed) * 26), C("#2a2420"));
  // the chimney still standing, brick
  m.box(x0 + 2, 0, z0 + 18, x0 + 9, 56, z0 + 25, shades(["#8a4a3a", "#7a3e30", "#944e3c", "#6a3a2e"], 1, seed + 4));
  m.box(x0 + 1, 54, z0 + 17, x0 + 10, 55, z0 + 26, C("#5a3a30"));
  m.box(x0 + 9, 4, z0 + 19, x0 + 12, 12, z0 + 24, C("#1a1614"));
  // a tree grown up through it, ivy on the walls
  m.box(x0 + 20, 1, z0 + 20, x0 + 22, 30, z0 + 22, shades(["#4a3426", "#3e2c20"], 1, 8));
  m.blob(x0 + 21, 34, z0 + 21, 10, K.leaf, 0.3, seed);
  m.blob(x0 + 15, 30, z0 + 25, 6, K.leaf, 0.35, seed + 1);
  m.blob(x0 + 27, 31, z0 + 17, 6, K.leaf, 0.35, seed + 2);
  for (let x = 0; x < m.w; x++)
    for (let z = 0; z < m.d; z++) {
      const reach = Math.floor(hash(x >> 1, 9, z >> 1, seed) * 30);
      if (hash(x >> 3, 7, z >> 3, seed) < 0.45) continue;
      m.paint(x, 2, z, x + 1, reach, z + 1, (xx, yy, zz) => (hash(xx, yy, zz, seed + 5) < 0.55 ? at(K.ivy, xx, yy, zz) : m.get(xx, yy, zz)));
    }
  // weeds inside
  for (let k = 0; k < 18; k++) {
    const r = rand(seed + k);
    m.blob(x0 + 5 + r() * (W - 10), 1, z0 + 5 + r() * (D - 10), 2 + r() * 2.5, K.grass, 0.4, seed + k);
  }
  // the porch on the south side: steps, two broken columns
  m.box(x0 + 18, 0, z1, x0 + 36, 2, z1 + 3, K.plinth);
  m.box(x0 + 19, 2, z1 + 1, x0 + 21, 16, z1 + 3, K.band);
  m.box(x0 + 33, 2, z1 + 1, x0 + 35, 9, z1 + 3, K.band);
  return m;
}

// ---- gatehouse ----------------------------------------------------------------------------------

export const GATE = { w: 60, d: 28, passage: [21, 39] as [number, number], sign: [24, 37] as [number, number] };

/** The sally port: a two-storey gatehouse astride the wall, an arched passage shut by a barred gate. */
export function gatehouse(seed = 91) {
  const m = new VoxelModel(GATE.w + 2, 54, GATE.d + 2);
  const x0 = 1,
    x1 = 1 + GATE.w,
    z0 = 1,
    z1 = 1 + GATE.d;
  m.box(x0, 0, z0, x1, 40, z1, K.concrete);
  m.box(x0 - 1, 0, z0 - 1, x1 + 1, 4, z1 + 1, K.plinth);
  m.box(x0 - 1, 20, z0 - 1, x1 + 1, 21, z1 + 1, K.band);
  m.box(x0, 40, z0, x1, 43, z1, K.concrete);
  m.box(x0 - 1, 43, z0 - 1, x1 + 1, 44, z1 + 1, K.coping);
  m.clear(x0 + 2, 40, z0 + 2, x1 - 2, 44, z1 - 2);
  m.box(x0 + 2, 39, z0 + 2, x1 - 2, 40, z1 - 2, K.tar);
  const [p0, p1] = GATE.passage;
  // the arch
  m.clear(p0, 0, 0, p1, 18, m.d);
  for (let y = 18; y < 24; y++) {
    const half = Math.sqrt(Math.max(0, 1 - ((y - 17) / 7) ** 2)) * ((p1 - p0) / 2);
    m.clear(Math.round((p0 + p1) / 2 - half), y, 0, Math.round((p0 + p1) / 2 + half), y + 1, m.d);
  }
  m.box(p0, 0, z0 + 2, p1, 1, z1 - 2, K.plinth);
  // the gate: bars, straps, shut
  const gz = Math.floor((z0 + z1) / 2);
  for (let x = p0 + 1; x < p1; x += 2) m.box(x, 0, gz, x + 1, 24, gz + 1, K.bar);
  for (const y of [1, 8, 16]) m.box(p0, y, gz, p1, y + 1, gz + 1, K.bar);
  m.box(p0, 0, gz - 1, p0 + 1, 24, gz + 2, K.barLight);
  // lamps either side, both faces; guard windows, barred
  const faces = [new Face(m, "z", z0, -1), new Face(m, "z", z1 - 1, 1)];
  faces.forEach((f, i) => {
    for (const u of [p0 - 4, p1 + 2]) {
      f.box(u, 14, 1, u + 2, 17, 3, K.dark);
      f.box(u, 13, 2, u + 2, 14, 3, LAMP);
    }
    barredWindow(f, x0 + 6, 7, 8, 9, seed + i, 0.6);
    barredWindow(f, x1 - 14, 7, 8, 9, seed + 3 + i, 0.6);
    // the sign panel (the painted sign is a texture over it)
    f.box(x0 + 3, GATE.sign[0] - 1, 0, x1 - 3, GATE.sign[1] + 1, 2, K.band);
  });
  // a lookout on the roof
  m.box(x1 - 16, 40, z0 + 6, x1 - 4, 52, z1 - 6, K.concrete);
  m.box(x1 - 15, 45, z0 + 6, x1 - 5, 50, z1 - 6, K.glass);
  m.box(x1 - 14, 45, z0 + 7, x1 - 6, 50, z1 - 7, 0);
  m.box(x1 - 11, 48, z0 + 10, x1 - 9, 49, z1 - 10, LAMP);
  m.box(x1 - 17, 52, z0 + 5, x1 - 3, 53, z1 - 5, K.tar);
  return m;
}

// ---- the yard: bleachers, hoops ------------------------------------------------------------------

/** The yard's great concrete steps, rising to the west wall: the inmates' grandstand. */
export function bleachers(w: number, d: number, seed = 101) {
  const m = new VoxelModel(w, 20, d);
  const steps = 6;
  const run = Math.floor(w / steps);
  for (let k = 0; k < steps; k++) {
    const x1 = w - k * run;
    const y1 = (k + 1) * 3;
    m.box(0, 0, 0, x1, y1, d, K.concrete);
    m.box(x1 - 1, y1 - 1, 0, x1, y1, d, K.band);
  }
  // a stair up the middle, a handrail
  const sz = Math.floor(d / 2) - 3;
  for (let x = 0; x < w; x++) m.box(x, 0, sz, x + 1, Math.ceil(((w - x) / w) * 18) + 1, sz + 6, K.plinth);
  for (let x = 0; x < w; x += 3) m.box(x, Math.ceil(((w - x) / w) * 18) + 1, sz - 1, x + 1, Math.ceil(((w - x) / w) * 18) + 6, sz, K.steel);
  // a few things left on the steps
  const r = rand(seed);
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(r() * (w - 4));
    const z = Math.floor(r() * (d - 4));
    if (Math.abs(z - sz - 3) < 6) continue;
    const step = Math.min(steps - 1, Math.floor((w - x - 1) / run));
    m.box(x, (step + 1) * 3, z, x + 2, (step + 1) * 3 + 1, z + 3, C(["#c8b070", "#3a5a8a", "#8a3a2a"][k % 3]));
  }
  return m;
}

/** A basketball hoop on a post, board facing +x. */
export function hoop() {
  const m = new VoxelModel(10, 22, 10);
  m.box(0, 0, 3, 4, 1, 7, K.plinth);
  m.box(1, 1, 4, 2, 20, 6, K.steel);
  m.box(2, 17, 4, 4, 18, 6, K.steel);
  m.box(4, 15, 1, 5, 22, 9, K.white);
  m.box(4, 16, 4, 5, 18, 6, C("#c83a2a"));
  for (const [x, z] of [[5, 4], [5, 5], [8, 4], [8, 5], [6, 3], [7, 3], [6, 6], [7, 6]] as const) m.set(x, 16, z, C("#e05a1a"));
  return m;
}

// ---- the ground: paving, the yard floor, paths, gardens -----------------------------------------

/**
 * The island top as a voxel carpet, `w` × `d` voxels: `zone(x, z)` says what lies where. The yard
 * is cast concrete in bays with a painted court; paths are flagstones; gardens are grass with
 * roses and shrubs; the rest is gravel.
 */
export function ground(w: number, d: number, zone: (x: number, z: number) => "yard" | "court" | "line" | "path" | "road" | "garden" | "gravel" | "none", seed = 111) {
  const m = new VoxelModel(w, 8, d);
  const slab = shades(["#b4aea4", "#aca69c", "#b8b2a8"], 2, seed);
  const joint = C("#8e887e");
  const flags = shades(["#9c968e", "#a49e94", "#928c84", "#aaa49a"], 3, seed + 1);
  const road = shades(["#4a4652", "#46424e", "#4e4a56"], 2, seed + 2);
  const court = shades(["#9a5040", "#92483a", "#a05644"], 3, seed + 3);
  const roses = [C("#c83a4a"), C("#e86a8a"), C("#f2d0d8"), C("#e8a030")];
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) {
      const k = zone(x, z);
      if (k === "none") continue;
      if (k === "yard") m.set(x, 0, z, x % 18 === 0 || z % 18 === 0 ? joint : at(slab, x, 0, z));
      else if (k === "court") m.set(x, 0, z, at(court, x, 0, z));
      else if (k === "line") m.set(x, 0, z, C("#ece8e0"));
      else if (k === "path") m.set(x, 0, z, x % 4 === 0 || z % 4 === 0 ? joint : at(flags, x, 0, z));
      else if (k === "road") m.set(x, 0, z, at(road, x, 0, z));
      else if (k === "gravel") m.set(x, 0, z, at(K.gravel, x, 0, z));
      else {
        m.set(x, 0, z, at(K.grass, x, 0, z));
        const h = hash(x, 5, z, seed);
        if (h > 0.985) m.set(x, 1, z, roses[Math.floor(hash(x, 6, z, seed) * roses.length)]);
        else if (h > 0.95) m.set(x, 1, z, at(K.grass, x, 1, z));
      }
    }
  // shrubs and rose bushes in the gardens
  const r = rand(seed + 9);
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(r() * w),
      z = Math.floor(r() * d);
    if (zone(x, z) !== "garden" || r() > 0.06) continue;
    const ok = zone(x + 4, z) === "garden" && zone(x - 4, z) === "garden" && zone(x, z + 4) === "garden" && zone(x, z - 4) === "garden";
    if (!ok) continue;
    m.blob(x, 1, z, 2.5 + r() * 2, K.leaf, 0.35, k);
    for (let f = 0; f < 5; f++) m.set(x - 2 + Math.floor(r() * 5), 2 + Math.floor(r() * 3), z - 2 + Math.floor(r() * 5), roses[Math.floor(r() * 2)]);
  }
  return m;
}

// ---- pier and ferry -----------------------------------------------------------------------------

export const PIER = { w: 32, d: 108, deck: 24, h: 46 };

/** The ferry pier: timber deck on piles, bollards, a rail on the west side, lamps, a guard booth. */
export function pier(seed = 121) {
  const { w, d, deck } = PIER;
  const m = new VoxelModel(w, PIER.h, d);
  const pile = shades(["#3a2c22", "#33271e", "#40312a"], 1, seed);
  const algae = shades(["#2e4a32", "#3a5a3a", "#28402c"], 1, seed + 1);
  for (let z = 3; z < d; z += 12)
    for (const x of [2, 15, 29]) {
      m.cylinder(x, 0, z, 1.4, deck - 2, pile);
      m.cylinder(x, 3, z, 1.6, 4, algae);
    }
  for (let z = 3; z < d; z += 12) m.box(0, deck - 3, z - 1, w, deck - 2, z + 1, K.woodDark);
  m.box(1, deck - 2, 0, 3, deck - 1, d, K.woodDark);
  m.box(w - 3, deck - 2, 0, w - 1, deck - 1, d, K.woodDark);
  // planks across, a darker gap every fourth
  const plank = shades(["#8a6a4a", "#7e5e40", "#94744e", "#86664a"], 1, seed + 2);
  for (let z = 0; z < d; z++) m.box(0, deck - 1, z, w, deck, z + 1, z % 4 === 3 ? C("#4a3a2a") : (x, y, zz) => at(plank, Math.floor(x / 7) + zz * 13, y, zz));
  m.box(0, deck, 0, 1, deck + 1, d, K.woodDark);
  m.box(w - 1, deck, 0, w, deck + 1, d, K.woodDark);
  // bollards on the ferry side
  for (let z = 10; z < d; z += 22) {
    m.cylinder(w - 3, deck, z, 1.4, 4, K.dark);
    m.cylinder(w - 3, deck + 4, z, 1.9, 1, K.dark);
  }
  // a rail on the west side, lamps
  for (let z = 0; z < d; z += 6) m.box(1, deck, z, 2, deck + 6, z + 1, K.steel);
  m.box(1, deck + 5, 0, 2, deck + 6, d, K.steel);
  m.box(1, deck + 2, 0, 2, deck + 3, d, K.steel);
  for (const z of [8, 50, 92]) {
    m.box(2, deck, z, 3, deck + 18, z + 1, K.dark);
    m.box(2, deck + 18, z, 6, deck + 19, z + 1, K.dark);
    m.box(4, deck + 16, z - 1, 7, deck + 18, z + 2, K.dark);
    m.box(4, deck + 15, z - 1, 7, deck + 16, z + 2, LAMP);
  }
  // guard booth at the seaward end
  const bz = 4;
  m.box(6, deck, bz, 16, deck + 14, bz + 10, C("#d8d4cc"));
  m.box(6, deck + 6, bz, 16, deck + 11, bz + 10, K.glass);
  m.box(7, deck + 6, bz + 1, 15, deck + 11, bz + 9, 0);
  m.box(8, deck + 9, bz + 4, 10, deck + 10, bz + 6, LAMP);
  m.box(5, deck + 14, bz - 1, 17, deck + 15, bz + 11, C("#2a5a8a"));
  m.box(10, deck, bz + 9, 13, deck + 6, bz + 10, K.woodDark);
  // life ring on the booth
  for (let a = 0; a < 12; a++) m.set(16, deck + 8 + Math.round(Math.sin((a / 12) * Math.PI * 2) * 2), bz + 5 + Math.round(Math.cos((a / 12) * Math.PI * 2) * 2), a % 3 ? C("#f0601a") : K.white);
  return m;
}

export const FERRY = { w: 27, d: 76, h: 46, water: 6 };

/** The prison ferry: navy hull, white cabin with its windows, wheelhouse forward, a ZEC-banded funnel. */
export function ferry(seed = 131) {
  const { w, d } = FERRY;
  const m = new VoxelModel(w, FERRY.h, d);
  const c = (w - 1) / 2;
  const deckY = 17;
  for (let z = 0; z < d; z++) {
    const bow = z < 22 ? Math.sqrt(z / 22) : 1;
    const stern = z > d - 5 ? 0.85 + 0.15 * ((d - z) / 5) : 1;
    for (let y = 0; y <= deckY; y++) {
      const t = Math.min(1, (y + 2) / 10);
      const hw = 12 * bow * stern * (0.55 + 0.45 * t);
      const color = y < FERRY.water ? C("#8a2a22") : y === FERRY.water ? K.white : y >= deckY - 1 ? K.white : C("#1c2a48");
      for (let x = Math.floor(c - hw); x <= Math.ceil(c + hw); x++) if (Math.abs(x - c) <= hw) m.set(x, y, z, color);
    }
  }
  // deck: wood, bulwark lip
  for (let z = 1; z < d - 1; z++)
    for (let x = 0; x < w; x++) if (m.get(x, deckY, z) && m.get(x - 1, deckY, z) && m.get(x + 1, deckY, z) && m.get(x, deckY, z - 1) && m.get(x, deckY, z + 1)) m.set(x, deckY, z, at(K.wood, x, deckY, z));
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) if (m.get(x, deckY, z) === K.white) m.set(x, deckY + 1, z, K.white);
  // cabin
  const cx0 = 4,
    cx1 = w - 4,
    cz0 = 28,
    cz1 = 62;
  m.box(cx0, deckY + 1, cz0, cx1, deckY + 13, cz1, K.white);
  for (let z = cz0 + 2; z < cz1 - 2; z += 4)
    for (const x of [cx0, cx1 - 1]) m.box(x, deckY + 5, z, x + 1, deckY + 9, z + 3, hash(x, 0, z, seed) < 0.6 ? LIT[2] : K.glass);
  m.box(cx0 + 2, deckY + 5, cz1 - 1, cx1 - 2, deckY + 9, cz1, K.glass);
  m.box(cx0 - 1, deckY + 13, cz0 - 1, cx1 + 1, deckY + 14, cz1 + 1, C("#b8b4ae"));
  m.box(cx0 - 1, deckY + 3, cz0, cx0, deckY + 4, cz1, C("#f4b728"));
  m.box(cx1, deckY + 3, cz0, cx1 + 1, deckY + 4, cz1, C("#f4b728"));
  // roof rail
  for (let z = cz0; z < cz1; z += 4)
    for (const x of [cx0, cx1 - 1]) m.box(x, deckY + 14, z, x + 1, deckY + 17, z + 1, K.steel);
  // wheelhouse forward on the cabin roof
  const wz0 = cz0 + 1,
    wz1 = cz0 + 11;
  m.box(cx0 + 3, deckY + 14, wz0, cx1 - 3, deckY + 22, wz1, K.white);
  m.box(cx0 + 4, deckY + 17, wz0, cx1 - 4, deckY + 21, wz0 + 1, K.glass);
  for (const x of [cx0 + 3, cx1 - 4]) m.box(x, deckY + 17, wz0 + 1, x + 1, deckY + 21, wz1 - 1, K.glass);
  m.box(cx0 + 2, deckY + 22, wz0 - 1, cx1 - 2, deckY + 23, wz1 + 1, C("#2a5a8a"));
  // mast and running lights
  m.box(Math.round(c), deckY + 23, wz0 + 4, Math.round(c) + 1, deckY + 34, wz0 + 5, K.dark);
  m.box(Math.round(c) - 1, deckY + 34, wz0 + 4, Math.round(c) + 2, deckY + 35, wz0 + 5, E("#ffffff", 2.4));
  m.box(cx0 + 2, deckY + 20, wz0 + 3, cx0 + 3, deckY + 21, wz0 + 5, E("#ff3030", 2.2));
  m.box(cx1 - 3, deckY + 20, wz0 + 3, cx1 - 2, deckY + 21, wz0 + 5, E("#30ff70", 2.2));
  // funnel aft, black with the ZEC band
  m.box(Math.round(c) - 3, deckY + 14, cz1 - 14, Math.round(c) + 4, deckY + 26, cz1 - 7, K.black);
  m.box(Math.round(c) - 3, deckY + 20, cz1 - 14, Math.round(c) + 4, deckY + 23, cz1 - 7, K.zec);
  // life rings and a bollard fore and aft
  for (const z of [cz0 + 16, cz1 - 6])
    for (const x of [cx0 - 1, cx1]) for (let a = 0; a < 10; a++) m.set(x, deckY + 7 + Math.round(Math.sin((a / 10) * Math.PI * 2) * 2), z + Math.round(Math.cos((a / 10) * Math.PI * 2) * 2), a % 3 ? C("#f0601a") : K.white);
  for (const z of [8, d - 6]) m.cylinder(c, deckY + 1, z, 1.2, 3, K.dark);
  // ropes to the pier (west side)
  line(m, 0, deckY + 2, 10, 2, deckY + 3, 10, C("#c8a870"));
  line(m, 0, deckY + 2, d - 8, 2, deckY + 3, d - 8, C("#c8a870"));
  return m;
}
