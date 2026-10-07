import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * The ZEC RESERVE (準備銀行) on Wall Street: the stock exchange and the central bank in one.
 * A granite temple in front — a podium and a flight of steps across the whole front, six fluted
 * Corinthian columns, a great window wall and bronze doors behind them, a carved pediment with a
 * gold shield and ⓩ between reclining figures — and behind it a glass-and-steel tower of 22 floors
 * with setbacks, a dark ticker band near the top and a gold crown with a spire. On the forecourt
 * corner, the Charging Zebra in bronze-plinthed black and white; round the lot, bollards, a guard
 * booth, CCTV, flags and lanterns. Voxel scale 2 (a third of a metre). Front faces +z.
 */

const S = {
  granite: shades(["#c9c4ba", "#c2bdb3", "#cfcac0", "#bdb8ae"], 2, 21),
  graniteDark: shades(["#a9a398", "#a29c91", "#b0aa9f"], 2, 22),
  trim: C("#ddd8ce"),
  groove: C("#9a948a"),
  step: C("#cdc8be"),
  stepEdge: C("#b4afa5"),
  gold: C("#c9a227"),
  goldLit: E("#f4b728", 1.7),
  goldDim: E("#f4b728", 1.1),
  bronze: C("#7a5a2a"),
  bronzeLight: C("#9a7434"),
  bronzeDark: C("#4e3a1c"),
  steel: C("#5d6470"),
  steelLight: C("#8a919c"),
  steelDark: C("#2b2f38"),
  glassA: G("#2e4a66"),
  glassB: G("#36587a"),
  glassC: G("#284058"),
  warm: E("#ffd9a0", 1.0),
  cool: [E("#cfe8ff", 0.95), E("#a8dcff", 1.0), E("#e8f4ff", 0.9)],
  ink: C("#0c0b10"),
  black: C("#17151c"),
  white: C("#f2f0ea"),
  metal: C("#2b2933"),
  red: E("#ff3048", 2.5),
  pave: C("#bdb7ad"),
  paveDark: C("#9e988e"),
};

/** Paint for a curtain wall: mullions every 3, spandrels every floor, some rooms lit. */
function curtain(seed: number, floor: number, y0: number, lit = 0.35): Paint {
  return (x, y, z) => {
    const fy = (y - y0) % floor;
    if (fy === 0) return Math.floor((y - y0) / floor) % 5 === 4 ? S.gold : S.steelLight;
    if (fy === 1) return S.steelDark;
    const col = Math.floor((x + z) / 3);
    if ((x + z) % 3 === 0) return S.steel;
    const room = hash(col, Math.floor((y - y0) / floor), seed);
    if (room < lit) return S.cool[Math.floor(room * 30) % 3];
    return room < 0.65 ? S.glassA : room < 0.85 ? S.glassB : S.glassC;
  };
}

export function reserve(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const H = 290;
  const m = new VoxelModel(W, H, D);
  const r = rand(seed * 13 + 5);

  const X0 = 8,
    X1 = W - 8,
    MID = Math.floor(W / 2);
  // tower behind, temple in front
  const TX0 = 11,
    TX1 = W - 11,
    TZ0 = 7,
    TZ1 = 44;
  const FLOOR = 10;
  const FL = 22;
  const TOP = 12 + FL * FLOOR; // 232
  const PZ1 = 70; // front of the podium (column line ends)
  const CZ = 66; // column centres
  const WALLZ = 58; // window wall behind the columns
  const POD = 7; // podium height

  // ---- forecourt paving -----------------------------------------------------------------------
  for (let x = 0; x < W; x++)
    for (let z = PZ1; z < D; z++) m.set(x, 0, z, (x - MID) % 10 === 0 || (z - D) % 8 === 0 ? S.paveDark : (x >> 1) % 2 === (z >> 1) % 2 ? S.pave : S.step);

  // ---- the tower ------------------------------------------------------------------------------
  // a stone base (lobby levels) round the back and sides, then the curtain wall
  m.box(TX0, 0, TZ0, TX1, 24, TZ1, S.granite);
  for (let y = 3; y < 22; y += 3) {
    m.box(TX0, y, TZ0, TX0 + 1, y + 1, TZ1, S.groove);
    m.box(TX1 - 1, y, TZ0, TX1, y + 1, TZ1, S.groove);
    m.box(TX0, y, TZ0, TX1, y + 1, TZ0 + 1, S.groove);
  }
  m.box(TX0 - 1, 24, TZ0 - 1, TX1 + 1, 26, TZ1 + 1, S.trim);
  // the shaft with two setbacks; corners notched for vertical steel fins
  const tiers: [number, number, number][] = [
    [26, 172, 0],
    [172, 206, 3],
    [206, TOP, 6],
  ];
  for (const [y0, y1, inset] of tiers) {
    const a = TX0 + inset,
      b = TX1 - inset,
      c = TZ0 + inset,
      d = TZ1 - inset;
    m.box(a, y0, c, b, y1, d, curtain(seed + inset, FLOOR, 2, 0.32));
    // notched corners with gold-capped steel fins
    for (const [x, z] of [
      [a, c],
      [b - 2, c],
      [a, d - 2],
      [b - 2, d - 2],
    ])
      m.box(x, y0, z, x + 2, y1, z + 2, 0);
    for (const [x, z] of [
      [a, c],
      [b - 1, c],
      [a, d - 1],
      [b - 1, d - 1],
    ])
      m.box(x, y0, z, x + 1, y1, z + 1, S.steelDark);
    // setback terrace: parapet and gold edge
    m.box(a - 1, y1, c - 1, b + 1, y1 + 1, d + 1, S.steelLight);
    m.box(a - 1, y1 + 1, c - 1, b + 1, y1 + 2, d + 1, S.goldDim);
    m.box(a, y1 + 1, c, b, y1 + 2, d, S.steelDark);
    // vertical steel fins up the middle of each face
    for (const x of [MID - 6, MID + 6]) {
      m.box(x, y0, d, x + 1, y1, d + 1, S.steelLight);
      m.box(x, y0, c - 1, x + 1, y1, c, S.steelLight);
    }
  }
  // on the setback terraces: planters and a sky garden
  for (const [y, inset] of [
    [172, 0],
    [206, 3],
  ] as const) {
    for (let x = TX0 + inset + 1; x < TX1 - inset - 1; x += 6) {
      m.box(x, y + 2, TZ1 - inset - 2, x + 4, y + 4, TZ1 - inset, C("#5a5464"));
      m.blob(x + 2, y + 5, TZ1 - inset - 1, 2, shades(["#2f6b3c", "#3d8a4a"], 1, 5), 0.3, x + y);
    }
  }
  // ---- the ticker band: a dark panel round the top tier, framed in gold -------------------------
  const TK0 = 214,
    TK1 = 222;
  {
    const a = TX0 + 6,
      b = TX1 - 6,
      c = TZ0 + 6,
      d = TZ1 - 6;
    m.box(a - 1, TK0 - 1, c - 1, b + 1, TK1 + 1, d + 1, S.gold);
    m.box(a - 1, TK0, c - 1, b + 1, TK1, d + 1, S.ink);
    m.box(a - 1, TK0 - 2, c - 2, b + 1, TK0 - 1, d + 2, S.goldLit);
    m.box(a - 1, TK1 + 1, c - 2, b + 1, TK1 + 2, d + 2, S.goldLit);
  }
  // ---- the crown: stepped gold-framed lantern, fins, a spire with a beacon -----------------------
  {
    let a = TX0 + 6,
      b = TX1 - 6,
      c = TZ0 + 6,
      d = TZ1 - 6;
    let y = TOP;
    m.box(a - 1, y, c - 1, b + 1, y + 2, d + 1, S.gold);
    y += 2;
    for (let t = 0; t < 4; t++) {
      const h = 9 - t;
      m.box(a, y, c, b, y + h, d, S.ink);
      // gold fins every 3, lit glass between
      for (let x = a; x < b; x++)
        for (const z of [c, d - 1]) m.box(x, y, z, x + 1, y + h, z + 1, (x - a) % 3 === 0 ? S.gold : (x - a) % 3 === 1 ? S.goldDim : S.ink);
      for (let z = c; z < d; z++)
        for (const x of [a, b - 1]) m.box(x, y, z, x + 1, y + h, z + 1, (z - c) % 3 === 0 ? S.gold : (z - c) % 3 === 1 ? S.goldDim : S.ink);
      m.box(a - 1, y + h, c - 1, b + 1, y + h + 1, d + 1, S.gold);
      y += h + 1;
      a += 3;
      b -= 3;
      c += 3;
      d -= 3;
      if (b - a < 4 || d - c < 4) break;
    }
    const sx = MID,
      sz = Math.floor((TZ0 + TZ1) / 2);
    m.box(sx - 2, y, sz - 2, sx + 3, y + 4, sz + 3, S.gold);
    m.box(sx - 1, y + 4, sz - 1, sx + 2, y + 16, sz + 2, S.gold);
    m.box(sx, y + 16, sz, sx + 1, y + 34, sz + 1, S.steelLight);
    m.box(sx, y + 34, sz, sx + 1, y + 36, sz + 1, S.red);
    for (const yy of [y + 8, y + 12]) m.box(sx - 2, yy, sz - 2, sx + 3, yy + 1, sz + 3, S.goldLit);
  }
  // the tower's back: service door, loading bay, CCTV
  m.box(MID - 8, 0, TZ0 - 1, MID + 8, 12, TZ0, S.steelDark);
  for (let y = 1; y < 11; y += 2) m.box(MID - 7, y, TZ0 - 2, MID + 7, y + 1, TZ0 - 1, S.steel);
  m.box(MID - 9, 12, TZ0 - 3, MID + 9, 13, TZ0, S.steelLight);
  m.box(MID - 8, 13, TZ0 - 2, MID + 8, 14, TZ0 - 1, E("#ffe0a8", 1.4));

  // ---- the temple ------------------------------------------------------------------------------
  // body between the tower and the portico, granite with channelled joints
  m.box(X0, 0, TZ1 - 4, X1, 62, WALLZ, S.granite);
  for (let y = 10; y < 52; y += 4) {
    m.box(X0, y, TZ1 - 4, X0 + 1, y + 1, WALLZ, S.groove);
    m.box(X1 - 1, y, TZ1 - 4, X1, y + 1, WALLZ, S.groove);
  }
  // side pilasters and tall windows on the temple's flanks
  for (const x of [X0 - 1, X1]) {
    for (let z = TZ1 - 2; z < WALLZ; z += 7) m.box(x, POD, z, x + 1, 54, z + 2, S.trim);
    for (let z = TZ1 + 1; z < WALLZ - 2; z += 7) {
      m.box(x, 14, z, x + 1, 44, z + 3, S.bronzeDark);
      m.box(x, 15, z, x + 1, 43, z + 3, (_x, y) => (y % 5 === 0 ? S.bronze : S.warm));
    }
  }
  // podium and steps across the whole front
  m.box(X0, 0, TZ1 - 4, X1, POD, PZ1, S.granite);
  m.box(X0, POD - 1, WALLZ, X1, POD, PZ1, S.step);
  const STEPS = 7;
  for (let s = 0; s < STEPS; s++) {
    const z = PZ1 + s * 2;
    m.box(X0 + 4, 0, z, X1, POD - 1 - s, z + 2, S.step);
    m.box(X0 + 4, POD - 2 - s, z + 1, X1, POD - 1 - s, z + 2, S.stepEdge);
  }
  // cheek blocks with bronze lanterns
  for (const x of [X0]) {
    m.box(x, 0, PZ1, x + 4, POD + 2, PZ1 + 13, S.graniteDark);
    m.box(x - 1, POD + 2, PZ1 - 1, x + 5, POD + 3, PZ1 + 14, S.trim);
    m.box(x + 1, POD + 3, PZ1 + 9, x + 3, POD + 10, PZ1 + 11, S.bronzeDark);
    m.box(x, POD + 10, PZ1 + 8, x + 4, POD + 14, PZ1 + 12, E("#ffd28a", 1.9));
    m.box(x, POD + 14, PZ1 + 8, x + 4, POD + 15, PZ1 + 12, S.bronze);
    m.box(x + 1, POD + 15, PZ1 + 9, x + 3, POD + 16, PZ1 + 11, S.gold);
  }
  // the window wall behind the columns (the trading floor glows through), bronze doors
  m.box(X0 + 2, POD, WALLZ - 1, X1 - 2, 54, WALLZ, S.bronzeDark);
  for (let x = X0 + 3; x < X1 - 3; x++)
    for (let y = POD + 14; y < 52; y++) {
      const fx = (x - X0 - 3) % 4,
        fy = (y - POD - 14) % 5;
      m.set(x, y, WALLZ - 1, fx === 0 || fy === 0 ? S.bronze : S.warm);
    }
  m.box(X0 + 2, POD + 13, WALLZ - 1, X1 - 2, POD + 14, WALLZ + 1, S.trim);
  const cols = [0, 1, 2, 3, 4, 5].map((i) => Math.round(X0 + 5 + (i * (X1 - X0 - 10)) / 5));
  // three bronze doors between the columns at the bottom
  for (let i = 0; i < 5; i++) {
    const dx = Math.round((cols[i] + cols[i + 1]) / 2);
    const big = i === 2;
    const hw = big ? 4 : 3;
    m.box(dx - hw - 1, POD, WALLZ - 1, dx + hw + 1, POD + 13, WALLZ, S.trim);
    m.box(dx - hw, POD, WALLZ - 2, dx + hw, POD + 12, WALLZ - 1, i % 2 ? S.bronzeDark : S.bronze);
    if (i % 2 === 0) {
      m.box(dx - hw + 1, POD + 1, WALLZ - 1, dx + hw - 1, POD + 11, WALLZ, S.bronzeLight);
      m.box(dx, POD + 1, WALLZ - 1, dx + 1, POD + 11, WALLZ, S.bronzeDark);
      for (const y of [POD + 4, POD + 8]) m.box(dx - hw + 1, y, WALLZ - 1, dx + hw - 1, y + 1, WALLZ, S.bronzeDark);
      m.box(dx - 1, POD + 6, WALLZ, dx, POD + 7, WALLZ + 1, S.gold);
      m.box(dx + 1, POD + 6, WALLZ, dx + 2, POD + 7, WALLZ + 1, S.gold);
    } else {
      // closed bays: a bronze grille over warm glass
      for (let x = dx - hw; x < dx + hw; x++) m.box(x, POD + 1, WALLZ - 1, x + 1, POD + 12, WALLZ, x % 2 ? S.bronze : S.warm);
    }
  }
  // the six columns: plinth, base torus, fluted shaft with entasis, Corinthian capital
  for (const cx of cols) {
    m.box(cx - 3, POD, CZ - 3, cx + 4, POD + 3, CZ + 4, S.graniteDark);
    m.cylinder(cx + 0.5, POD + 3, CZ + 0.5, 3.3, 2, S.trim);
    for (let y = POD + 5; y < 49; y++) {
      const rr = y > 36 ? 2.75 - (y - 36) * 0.02 : 2.85;
      m.cylinder(cx + 0.5, y, CZ + 0.5, rr, 1, (x, _y, z) => ((x + z) % 2 ? S.trim : C("#c8c2b6")));
    }
    m.cylinder(cx + 0.5, 49, CZ + 0.5, 3.1, 1, S.trim);
    m.cylinder(cx + 0.5, 50, CZ + 0.5, 3.5, 2, (x, y, z) => (hash(x, y, z, 7) > 0.5 ? C("#d8d2c6") : C("#bfb8aa")));
    m.cylinder(cx + 0.5, 52, CZ + 0.5, 3.9, 2, (x, y, z) => (hash(x, y, z, 8) > 0.6 ? S.gold : C("#d8d2c6")));
    m.box(cx - 4, 54, CZ - 4, cx + 5, 55, CZ + 5, S.trim);
  }
  // a giant ZEC flag hung on the window wall behind the three middle bays, as at the exchange
  {
    const fx0 = cols[1] + 4,
      fx1 = cols[4] - 3;
    m.box(fx0 - 1, 50, WALLZ, fx1 + 1, 51, WALLZ + 1, S.gold);
    m.box(fx0, 22, WALLZ, fx1, 50, WALLZ + 1, C("#f4b728"));
    m.box(fx0, 22, WALLZ, fx1, 23, WALLZ + 1, C("#c9a227"));
    const zx = MID - 5;
    const glyph = ["###########", "        ## ", "       ##  ", "      ##   ", "     ##    ", "    ##     ", "   ##      ", "  ##       ", " ##        ", "###########"];
    glyph.forEach((row, i) => [...row].forEach((ch, j) => ch === "#" && m.set(zx + j, 41 - i, WALLZ + 1, S.ink)));
    m.box(MID - 1, 42, WALLZ + 1, MID + 1, 45, WALLZ + 2, S.ink);
    m.box(MID - 1, 29, WALLZ + 1, MID + 1, 32, WALLZ + 2, S.ink);
  }
  // entablature: architrave in three fasciae, frieze for the name, dentils, cornice
  m.box(X0 - 1, 55, TZ1 - 4, X1 + 1, 57, CZ + 5, S.trim);
  m.box(X0 - 1, 56, CZ + 5, X1 + 1, 57, CZ + 6, S.trim);
  m.box(X0 - 1, 57, TZ1 - 4, X1 + 1, 62, CZ + 5, S.granite);
  for (let x = X0 - 1; x < X1 + 1; x += 2) m.set(x, 62, CZ + 5, S.trim);
  m.box(X0 - 2, 62, TZ1 - 4, X1 + 2, 63, CZ + 6, S.trim);
  m.box(X0 - 3, 63, TZ1 - 4, X1 + 3, 64, CZ + 7, S.trim);
  // soffit lights over the colonnade
  for (let i = 0; i < 5; i++) m.box(cols[i] + 4, 54, CZ - 2, cols[i + 1] - 3, 55, CZ + 2, E("#fff0d8", 1.1));
  // ---- the pediment: raking cornice, recessed tympanum, gold shield and ⓩ, reclining figures -----
  const PH = 18;
  const halfW = (X1 - X0) / 2 + 2;
  for (let s = 0; s < PH; s++) {
    const w = Math.round(halfW * (1 - s / PH));
    if (w < 1) break;
    const y = 64 + s;
    m.box(MID - w, y, TZ1 - 4, MID + w, y + 1, CZ + 3, S.granite);
    // raking cornice
    m.box(MID - w - 1, y, CZ + 3, MID - w + 2, y + 1, CZ + 7, S.trim);
    m.box(MID + w - 2, y, CZ + 3, MID + w + 1, y + 1, CZ + 7, S.trim);
    // the tympanum face
    if (w > 4) m.box(MID - w + 3, y, CZ + 3, MID + w - 3, y + 1, CZ + 4, s === 0 ? S.trim : S.graniteDark);
  }
  m.box(MID - halfW - 1, 64, CZ + 3, MID + halfW + 1, 65, CZ + 7, S.trim);
  // the shield and ⓩ in gold
  {
    const cy = 72;
    for (let x = MID - 6; x <= MID + 6; x++)
      for (let y = cy - 7; y <= cy + 6; y++) {
        const dx = Math.abs(x + 0.5 - (MID + 0.5));
        const inside = y >= cy - 1 ? dx <= 6 : dx <= 6 - ((cy - 1 - y) * 6) / 7;
        if (!inside) continue;
        const edge = y >= cy - 1 ? dx > 5 || y === cy + 6 : dx > 5 - ((cy - 1 - y) * 6) / 7;
        m.set(x, y, CZ + 4, edge ? S.goldLit : S.gold);
      }
    const glyph = ["#####", "   # ", "  #  ", " #   ", "#####"];
    glyph.forEach((row, i) => [...row].forEach((ch, j) => ch === "#" && m.set(MID - 2 + j, cy + 3 - i, CZ + 5, S.ink)));
    m.set(MID, cy + 4, CZ + 5, S.ink);
    m.set(MID, cy - 2, CZ + 5, S.ink);
    // reclining figures and heaps of coins either side
    for (const sgn of [-1, 1]) {
      const fx = MID + sgn * 12;
      m.box(Math.min(fx, fx + sgn * 10), 65, CZ + 4, Math.max(fx, fx + sgn * 10) + 1, 67, CZ + 5, S.trim);
      m.box(fx, 67, CZ + 4, fx + sgn * 2 + (sgn > 0 ? 1 : 0), 72, CZ + 5, S.trim);
      m.box(fx + (sgn > 0 ? 0 : -1), 72, CZ + 4, fx + (sgn > 0 ? 2 : 1), 74, CZ + 5, S.trim);
      m.box(fx + sgn * 3, 67, CZ + 4, fx + sgn * 6, 68, CZ + 5, S.trim);
      for (let k = 0; k < 3; k++) m.set(MID + sgn * (7 + k), 65 + (k === 1 ? 1 : 0), CZ + 5, S.gold);
      const zx = MID + sgn * 23;
      m.box(zx - 1, 65, CZ + 4, zx + 2, 66, CZ + 5, S.gold);
    }
  }
  // acroteria: gold palmettes at the apex and the two corners
  m.box(MID - 1, 64 + PH - 1, CZ + 3, MID + 2, 64 + PH + 3, CZ + 5, S.gold);
  m.box(MID, 64 + PH + 3, CZ + 3, MID + 1, 64 + PH + 5, CZ + 4, S.goldLit);
  for (const x of [X0 - 2, X1 - 1]) m.box(x, 64, CZ + 3, x + 3, 69, CZ + 5, S.gold);
  // roof behind the pediment: a granite deck and a balustrade along the sides
  m.box(X0, 62, TZ1 - 4, X1, 64, CZ, S.graniteDark);
  // ---- flags on the temple roof corners -----------------------------------------------------------
  const flag = (x: number, z: number, gold: boolean, dir: 1 | -1) => {
    m.box(x, 64, z, x + 1, 104, z + 1, S.steelLight);
    m.box(x, 104, z, x + 1, 105, z + 1, S.gold);
    const fx = (dx: number) => x + dir * (1 + dx);
    m.box(Math.min(fx(0), fx(13)), 92, z, Math.max(fx(0), fx(13)) + 1, 103, z + 1, gold ? C("#f4b728") : S.black);
    const ink = gold ? S.ink : C("#f4b728");
    for (const [dx, dy] of [[4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [8, 7], [7, 6], [6, 5], [5, 4], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [6, 9], [6, 2]]) m.set(dir > 0 ? x + 1 + dx : x - 13 + dx, 92 + dy, z, ink);
  };
  flag(X0 + 1, CZ + 3, true, -1);
  flag(X1 - 2, CZ + 3, false, 1);

  // ---- security: bollards, guard booth, CCTV, barrier --------------------------------------------
  const BZ = D - 6;
  for (let x = 2; x < W - 2; x += 5) {
    if ((x > MID - 8 && x < MID + 6) || x > X1 - 3) continue;
    m.box(x, 0, BZ, x + 2, 4, BZ + 2, S.steelDark);
    m.box(x, 4, BZ, x + 2, 5, BZ + 2, S.gold);
    m.box(x, 2, BZ, x + 2, 3, BZ + 2, E("#ffe0a8", 0.9));
  }
  // planter-bollards in the opening
  for (const x of [MID - 6, MID + 2]) {
    m.box(x, 0, BZ - 1, x + 4, 3, BZ + 3, S.graniteDark);
    m.blob(x + 2, 4, BZ + 1, 2.2, shades(["#2f6b3c", "#3d8a4a", "#285c33"], 1, 5), 0.3, x);
  }
  // guard booth on the left front corner
  {
    const gx = 1,
      gz = PZ1 + 2;
    m.box(gx, 0, gz, gx + 7, 1, gz + 8, S.graniteDark);
    m.box(gx, 1, gz, gx + 7, 10, gz + 8, S.steelDark);
    m.box(gx + 1, 4, gz + 8, gx + 6, 9, gz + 8 + 1, G("#9ab8d0"));
    m.box(gx + 7, 4, gz + 1, gx + 8, 9, gz + 7, G("#9ab8d0"));
    m.box(gx + 1, 4, gz + 7, gx + 6, 6, gz + 8, S.warm);
    m.box(gx + 2, 1, gz + 8, gx + 5, 4, gz + 9, S.steel);
    m.box(gx - 1, 10, gz - 1, gx + 8, 11, gz + 10, S.steelLight);
    m.box(gx, 11, gz, gx + 7, 12, gz + 9, S.gold);
    m.box(gx + 3, 12, gz + 4, gx + 4, 14, gz + 5, S.red);
    // the barrier arm across the service lane
    m.box(gx + 8, 0, gz + 10, gx + 10, 4, gz + 12, S.steelDark);
    for (let x = gx + 10; x < gx + 10 + 0; x++) m.set(x, 3, gz + 11, x % 2 ? S.red : S.white);
  }
  // CCTV: cameras on brackets at the temple's front corners and on the tower base
  const cctv = (x: number, y: number, z: number, dir: 1 | -1) => {
    m.box(x, y, z, x + 1, y + 1, z + 2 * dir, S.steelDark);
    m.box(x - 1, y - 2, z + 2 * dir, x + 2, y, z + 4 * dir, S.white);
    m.set(x, y - 1, z + 4 * dir, S.ink);
    m.set(x + 1, y - 2, z + 4 * dir, E("#ff3048", 1.8));
  };
  cctv(X0, 50, WALLZ + 1, 1);
  cctv(X1 - 1, 50, WALLZ + 1, 1);
  cctv(TX0 + 2, 22, TZ0 - 1, -1);
  cctv(TX1 - 3, 22, TZ0 - 1, -1);
  // lamp standards along the kerb
  for (const x of [4, X1 - 1]) {
    m.box(x, 0, D - 3, x + 1, 16, D - 2, S.metal);
    m.box(x - 1, 16, D - 4, x + 2, 19, D - 1, E("#ffe0a8", 1.8));
    m.box(x - 1, 19, D - 4, x + 2, 20, D - 1, S.metal);
    cctv(x, 15, D - 3, -1);
  }

  // ---- the Charging Zebra on the forecourt corner, charging down the side of the steps ------------
  const ZX = W - 4,
    Z0 = WALLZ - 2;
  {
    // local axes: a runs along the plinth toward the street (the zebra's head), w across it
    const zb = (a0: number, a1: number, y0: number, y1: number, w0: number, w1: number, c: Paint) => m.box(ZX + w0, y0, Z0 + a0, ZX + w1, y1, Z0 + a1, c);
    const WH = C("#f2f0ea"),
      BK = C("#141218");
    // bronze plinth: dark body, moulded top, gold plaques on the street end and the step side
    zb(-1, 27, 0, 1, -4, 4, S.graniteDark);
    zb(0, 26, 1, 5, -3, 3, S.bronzeDark);
    zb(-1, 27, 5, 6, -4, 4, S.bronze);
    zb(0, 26, 4, 5, -3, 3, S.bronzeLight);
    zb(26, 27, 2, 4, -2, 2, S.goldLit);
    zb(9, 17, 2, 4, -4, -3, S.goldLit);
    const zy = 6;
    const body = (_x: number, _y: number, z: number) => ((z - Z0) % 2 ? WH : BK);
    const leg = (_x: number, y: number) => (y % 2 ? WH : BK);
    const neck = (_x: number, y: number, z: number) => ((z - Z0 + y) % 2 ? WH : BK);
    // barrel, rump pushed high, chest
    zb(8, 17, zy + 6, zy + 12, -2, 3, body);
    zb(9, 16, zy + 12, zy + 13, -1, 2, body);
    zb(9, 16, zy + 5, zy + 6, -1, 2, body);
    zb(5, 9, zy + 7, zy + 13, -2, 3, body);
    zb(6, 8, zy + 13, zy + 14, -1, 2, body);
    zb(16, 19, zy + 5, zy + 11, -2, 3, body);
    // neck reaching down and forward, then the lowered head with a dark muzzle
    for (let k = 0; k < 4; k++) zb(18 + k, 20 + k, zy + 8 - k, zy + 12 - k, -1, 2, neck);
    for (let k = 0; k < 4; k++) zb(17 + k, 19 + k, zy + 12 - k, zy + 13 - k, 0, 1, BK);
    zb(21, 25, zy + 3, zy + 8, -1, 2, neck);
    zb(24, 26, zy + 2, zy + 5, -1, 2, C("#2a2632"));
    zb(25, 26, zy + 3, zy + 4, -1, 0, BK);
    zb(25, 26, zy + 3, zy + 4, 1, 2, BK);
    for (const w of [-1, 1]) zb(21, 22, zy + 8, zy + 10, w, w + 1, WH), zb(21, 22, zy + 10, zy + 11, w, w + 1, BK);
    zb(22, 23, zy + 6, zy + 7, -2, -1, BK);
    zb(22, 23, zy + 6, zy + 7, 2, 3, BK);
    // front legs: one stretched forward, one planted; hind legs driving back
    zb(19, 20, zy + 2, zy + 6, -2, -1, leg);
    zb(20, 22, zy, zy + 2, -2, -1, leg);
    zb(22, 23, zy, zy + 1, -2, -1, BK);
    zb(16, 17, zy, zy + 6, 2, 3, leg);
    zb(16, 18, zy, zy + 1, 2, 3, BK);
    zb(6, 7, zy + 2, zy + 8, -2, -1, leg);
    zb(4, 6, zy, zy + 3, -2, -1, leg);
    zb(3, 5, zy, zy + 1, -2, -1, BK);
    zb(8, 9, zy, zy + 7, 2, 3, leg);
    zb(7, 9, zy, zy + 1, 2, 3, BK);
    // the tail whipped up
    zb(4, 5, zy + 11, zy + 14, 0, 1, WH);
    zb(3, 4, zy + 13, zy + 17, 0, 1, BK);
    // a gold ⓩ brand on each flank
    for (const w of [-3, 3]) {
      zb(11, 14, zy + 10, zy + 11, w, w + 1, S.gold);
      zb(12, 13, zy + 9, zy + 10, w, w + 1, S.gold);
      zb(11, 14, zy + 8, zy + 9, w, w + 1, S.gold);
    }
    // a spotlight in the paving at each end
    zb(-1, 0, 0, 1, -1, 1, E("#fff0d0", 1.6));
  }

  // stone planters with clipped trees in front of the tower's side entrances
  for (const x of [1, W - 8]) {
    m.box(x, 0, 30, x + 7, 3, 38, S.graniteDark);
    m.box(x + 3, 3, 33, x + 4, 9, 34, C("#4a3426"));
    m.blob(x + 3.5, 11, 33.5, 3.4, shades(["#2f6b3c", "#3d8a4a", "#285c33"], 1, 5), 0.25, x + 9);
  }
  void r;

  const signs: SignSpot[] = [
    { text: "ZEC RESERVE · 準備銀行", color: "#f4b728", x: MID, y: 59.5, z: CZ + 5.05, w: X1 - X0 - 4, h: 3.6, vertical: false, facing: "front" },
  ];
  const tkY = (TK0 + TK1) / 2;
  return {
    model: m,
    signs,
    door: [MID + 0.5, PZ1 + STEPS * 2 + 1],
    body: [0, 0, W, D],
    walls: [
      [TX0, TZ0, TX1, TZ1],
      [X0, TZ1 - 4, X1, WALLZ],
      [ZX - 4, Z0 - 1, W, Z0 + 27],
      [1, PZ1 + 2, 8, PZ1 + 10],
    ],
    lights: [
      [MID, 30, CZ + 4, "#ffd28a"],
      [MID, 10, PZ1 + 12, "#ffe0a8"],
      [MID, TOP + 20, (TZ0 + TZ1) / 2, "#f4b728"],
    ],
    scale: k,
    points: {
      // keeper: just inside the middle bronze door. camPos/camLook: from across the street, low,
      // looking up the steps at the columns. tickerA/tickerB: left and right ends of the ticker
      // band's centre line on the tower's front face (the band is TK1 - TK0 = 8 voxels tall, the
      // plane faces +z). zebra: the Charging Zebra's plinth; booth: the guard booth window.
      keeper: [MID + 0.5, POD, WALLZ - 4],
      camPos: [MID - 18, 26, D + 40],
      camLook: [MID, 30, CZ],
      tickerA: [TX0 + 5, tkY, TZ1 - 5 + 0.05],
      tickerB: [TX1 - 5, tkY, TZ1 - 5 + 0.05],
      zebra: [ZX, 6, Z0 + 13],
      booth: [4.5, 5, PZ1 + 11],
    },
  };
}
