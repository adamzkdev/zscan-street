import { ACROSS, BAY, CURB } from "../city/plan";

/** (the town lies ACROSS metres further south than its figures below were first drawn: the Golden Gate's strait) */
const A = ACROSS;

/**
 * ORCHARD KEYS: the beach town across the Golden Gate. Off the bridge the road runs through the
 * headland in the Orchard Tunnel and comes out over a grid of palm-lined streets: shops and a diner
 * on Orchard Boulevard, the gas station, pastel villas with their pools, bungalows, a motel, and
 * along Shielded Drive the art-deco hotels facing the beach, its lifeguard huts and its pier.
 *
 * Plain data, shared by the main thread and the district's worker (no DOM, no three.js).
 */

/** The town's box (beaches included; the sea beyond), and the road's centre line off the bridge. */
export const KEYS = { x0: 56, x1: 366, z0: 228 + A, z1: 540 + A, name: "Orchard Keys" };
export const KX = 158;

/** The tunnel under the headland: its centre, its two portals (z), the half width inside, its ceiling. */
export const KTUNNEL = { x: KX, z0: 228.6 + A, z1: 257 + A, half: 5.6, top: 6.6 };
/** The bridge-to-town corridor: the deck's end, the headland's road, the tunnel. */
export const corridor = (x: number, z: number) => Math.abs(x - KX) < KTUNNEL.half + 1 && z > 225.5 + A && z < KTUNNEL.z1 + 0.5;

/** The streets (centre lines and widths), the beach and the pier. */
export const KGRID = {
  xs: [110, 158, 206, 254, 302],
  xw: [10, 14, 10, 10, 10],
  zs: [268 + A, 320 + A, 366 + A, 404 + A],
  zw: [10, 10, 10, 14],
  /** The town's paved edge: west, east (to the beaches), north (the foot of the hill), south (the promenade's sea side). */
  west: 96,
  east: 324,
  north: 258 + A,
  south: 416 + A,
};
/**
 * The beach: where the sand meets the water on each side (z on the south, x on the west and east).
 * The south beach is the big one (the promenade at z 416, the water's edge 76 m out); the west and
 * east ones about 25 m of sand. The sea floor shelves gently (wade out, then swim) down to KBED.
 */
export const KSHORE = { south: 492 + A, west: 70, east: 352, north: 232 + A };
/** The sea floor off the town's beaches (deeper than the bay's: room to swim). */
export const KBED = -4.4;
/** The pier off the beach, at the end of Vesta Street. */
export const KPIER = { x: 206, z0: 414 + A, z1: 536 + A, half: 2.6, y: CURB + 0.9 };

export interface KStreet {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  width: number;
  name: string;
}

const NS_NAMES = ["Pallas Street", "Orchard Boulevard", "Vesta Street", "Poseidon Avenue", "Sinsemilla Street"];
const EW_NAMES = ["Note Street", "Commitment Row", "Anchor Avenue", "Shielded Drive"];

export function kStreets(): KStreet[] {
  const G = KGRID;
  const out: KStreet[] = [];
  G.xs.forEach((x, i) => out.push({ axis: "z", at: x, from: x === KX ? KTUNNEL.z1 : G.zs[0] - G.zw[0] / 2, to: G.zs[3] + G.zw[3] / 2, width: G.xw[i], name: NS_NAMES[i] }));
  G.zs.forEach((z, i) => {
    const wide = i === 3;
    out.push({ axis: "x", at: z, from: wide ? G.west : G.xs[0] - G.xw[0] / 2, to: wide ? G.east : G.xs[4] + G.xw[4] / 2, width: G.zw[i], name: EW_NAMES[i] });
  });
  return out;
}

/** What is on a lot. */
export type KType = "villa" | "deco" | "bungalow" | "hotel" | "motel" | "diner" | "shop" | "gas" | "club";
/** A shop's trade (its front and its sign). */
export type KTrade = "konbini" | "tacos" | "surf" | "lounge" | "laundry" | "pawn" | "icecream";

export interface KLot {
  type: KType;
  trade?: KTrade;
  /** Centre of the lot (world), its frontage (w, along the street) and depth (d), and where its front faces. */
  x: number;
  z: number;
  w: number;
  d: number;
  face: "n" | "s" | "e" | "w";
  seed: number;
  /** The name on its sign (shops, hotels), the colour of its neon, its paint. */
  name?: string;
  neon?: string;
  paint?: string;
  /** Storeys (hotels). */
  floors?: number;
}

/** The pastel paints of the town. */
export const PASTEL = ["#f3b3c8", "#a8e2cf", "#f8cfa0", "#f4e8a8", "#acd6ef", "#cdb8ee", "#f6efe2", "#f4a08c", "#8fd9d6"];
export const NEONS = ["#ff4fa3", "#34e7ff", "#b56bff", "#f4b728", "#4dffb8", "#ff8a3a"];

/** The lots, block by block. */
export function kLots(): KLot[] {
  const out: KLot[] = [];
  let seed = 7;
  const P = PASTEL,
    N = NEONS;
  // blocks between the streets (inner edges, pavement 2.5 m wide inside them)
  const M = 2.5;
  const cols = [
    [115, 151],
    [165, 201],
    [211, 249],
    [259, 297],
  ];
  const rows = [
    [273 + A, 315 + A],
    [325 + A, 361 + A],
    [371 + A, 397 + A],
  ];
  const inner = (c: number, r: number) => ({ x0: cols[c][0] + M, x1: cols[c][1] - M, z0: rows[r][0] + M, z1: rows[r][1] - M });
  /** Lots along an east or west street front: split along z. */
  const alongZ = (b: { x0: number; x1: number; z0: number; z1: number }, face: "e" | "w", depth: number, items: Omit<KLot, "x" | "z" | "w" | "d" | "face" | "seed">[]) => {
    const n = items.length;
    const len = (b.z1 - b.z0) / n;
    items.forEach((it, i) => {
      const x = face === "e" ? b.x1 - depth / 2 : b.x0 + depth / 2;
      out.push({ ...it, x, z: b.z0 + len * (i + 0.5), w: len, d: depth, face, seed: seed++ });
    });
  };
  /** Lots along a north or south street front: split along x. */
  const alongX = (b: { x0: number; x1: number; z0: number; z1: number }, face: "n" | "s", depth: number, items: Omit<KLot, "x" | "z" | "w" | "d" | "face" | "seed">[]) => {
    const n = items.length;
    const len = (b.x1 - b.x0) / n;
    items.forEach((it, i) => {
      const z = face === "s" ? b.z1 - depth / 2 : b.z0 + depth / 2;
      out.push({ ...it, x: b.x0 + len * (i + 0.5), z, w: len, d: depth, face, seed: seed++ });
    });
  };
  // ---- column 1 (Pallas Street ↔ Orchard Boulevard) --------------------------------------------
  {
    const a = inner(0, 0);
    const half = (a.x1 - a.x0) / 2;
    alongZ(a, "e", half, [
      { type: "diner", name: "ORCHARD DINER", neon: "#ff4f6a", paint: "#f6efe2" },
      { type: "shop", trade: "konbini", name: "ZEC MART 24", neon: "#34e7ff", paint: "#f2eee6" },
      { type: "shop", trade: "tacos", name: "TACOS 21M", neon: "#ff8a3a", paint: "#f4e8a8" },
    ]);
    alongZ(a, "w", half, [
      { type: "deco", paint: P[0] },
      { type: "bungalow", paint: P[4] },
    ]);
    const b = inner(0, 1);
    alongZ(b, "e", (b.x1 - b.x0) / 2, [
      { type: "shop", trade: "pawn", name: "ZATOSHI PAWN", neon: "#f4b728", paint: "#cdb8ee" },
      { type: "shop", trade: "icecream", name: "HALO ICE CREAM", neon: "#ff4fa3", paint: "#a8e2cf" },
    ]);
    alongZ(b, "w", (b.x1 - b.x0) / 2, [
      { type: "bungalow", paint: P[2] },
      { type: "deco", paint: P[1] },
    ]);
    alongX(inner(0, 2), "s", 21, [
      { type: "hotel", name: "HOTEL SAPLING", neon: N[4], paint: P[1], floors: 4 },
      { type: "hotel", name: "THE NOTE", neon: N[0], paint: P[0], floors: 3 },
    ]);
  }
  // ---- column 2 (Orchard Boulevard ↔ Vesta Street) ---------------------------------------------
  {
    const a = inner(1, 0);
    const half = (a.x1 - a.x0) / 2;
    alongZ(a, "w", half, [
      { type: "shop", trade: "surf", name: "SURF ZK", neon: "#34e7ff", paint: "#8fd9d6" },
      { type: "shop", trade: "lounge", name: "SHIELDED LOUNGE", neon: "#b56bff", paint: "#2e2a3a" },
      { type: "shop", trade: "laundry", name: "WASH & MEMO", neon: "#4dffb8", paint: "#f6efe2" },
    ]);
    alongZ(a, "e", half, [
      { type: "villa", paint: "#f6efe2" },
      { type: "deco", paint: P[3] },
    ]);
    const b = inner(1, 1);
    out.push({ type: "gas", name: "ZEC FUEL", neon: "#f4b728", paint: "#f2eee6", x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: b.z1 - b.z0, d: b.x1 - b.x0, face: "w", seed: seed++ });
    alongX(inner(1, 2), "s", 21, [
      { type: "hotel", name: "THE ORCHARD", neon: N[3], paint: P[2], floors: 5 },
      { type: "hotel", name: "HALO HOTEL", neon: N[1], paint: P[5], floors: 4 },
    ]);
  }
  // ---- column 3 (Vesta Street ↔ Poseidon Avenue) -----------------------------------------------
  {
    const a = inner(2, 0);
    const half = (a.z1 - a.z0) / 2;
    alongX(a, "n", half, [{ type: "bungalow", paint: P[7] }, { type: "deco", paint: P[8] }]);
    alongX(a, "s", half, [{ type: "villa", paint: "#f2eee6" }, { type: "bungalow", paint: P[3] }]);
    // row 2 is Sapling Park (no lots: the main thread lays it out)
    out.push({ type: "motel", name: "MOTEL 21", neon: "#ff4fa3", paint: "#f8cfa0", ...centre(inner(2, 2)), w: inner(2, 2).x1 - inner(2, 2).x0, d: inner(2, 2).z1 - inner(2, 2).z0, face: "s", seed: seed++ });
  }
  // ---- column 4 (Poseidon Avenue ↔ Sinsemilla Street) ------------------------------------------
  {
    for (const r of [0, 1]) {
      const a = inner(3, r);
      const half = (a.z1 - a.z0) / 2;
      alongX(a, "n", half, [{ type: "villa", paint: r ? P[4] : "#f6efe2" }, { type: r ? "deco" : "villa", paint: r ? P[0] : P[6] }]);
      alongX(a, "s", half, [{ type: r ? "villa" : "deco", paint: r ? "#f2eee6" : P[2] }, { type: "villa", paint: r ? P[1] : "#efe9dd" }]);
    }
    alongX(inner(3, 2), "s", 21, [
      { type: "hotel", name: "VIEWING KEY INN", neon: N[2], paint: P[8], floors: 3 },
      { type: "hotel", name: "THE NULLIFIER", neon: N[0], paint: P[6], floors: 5 },
    ]);
  }
  // ---- the east strip, facing Sinsemilla Street (their gardens to the sea) ---------------------
  {
    const x0 = KGRID.xs[4] + KGRID.xw[4] / 2 + M,
      x1 = KGRID.east;
    for (const [r, items] of [
      [0, [{ type: "villa" as KType, paint: P[3] }, { type: "villa" as KType, paint: "#f6efe2" }]],
      [1, [{ type: "deco" as KType, paint: P[5] }, { type: "villa" as KType, paint: P[1] }]],
      [2, [{ type: "club" as KType, name: "CLUB SPROUT", neon: "#4dffb8", paint: "#f6efe2" }]],
    ] as const)
      alongZ({ x0, x1, z0: rows[r][0] + M, z1: rows[r][1] - M }, "w", x1 - x0, items as unknown as Omit<KLot, "x" | "z" | "w" | "d" | "face" | "seed">[]);
  }
  return out;
}

const centre = (b: { x0: number; x1: number; z0: number; z1: number }) => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });

/** Sapling Park: the block between Vesta Street and Poseidon Avenue, Commitment Row and Anchor Avenue. */
export const KPARK = { x0: 211, x1: 249, z0: 325 + A, z1: 361 + A };

/** The yaw that turns a model (its front facing +z) to face this way. */
export const faceYaw = (f: KLot["face"]) => (f === "s" ? 0 : f === "e" ? Math.PI / 2 : f === "n" ? Math.PI : -Math.PI / 2);
/** The way out of a lot's front (world, flat). */
export const faceOut = (f: KLot["face"]): [number, number] => (f === "s" ? [0, 1] : f === "n" ? [0, -1] : f === "e" ? [1, 0] : [-1, 0]);

/** On the asphalt (the town's streets and the corridor from the bridge)? */
export function kRoad(x: number, z: number) {
  for (const s of kStreets()) {
    const h = s.width / 2;
    if (s.axis === "x" ? x >= s.from && x <= s.to && Math.abs(z - s.at) <= h : z >= s.from && z <= s.to && Math.abs(x - s.at) <= h) return true;
  }
  return false;
}

/** The land's shape: how far inland (x, z) is from the shore (m, negative at sea). */
export function shoreDist(x: number, z: number) {
  const S = KSHORE;
  // (north: the headland's woods go on over the town's back between x 94 and 236)
  const north = x > 92 && x < 238 ? 99 : z - S.north;
  const d = Math.min(z < 300 + A ? north : 99, S.south - z, x - S.west, S.east - x);
  // rounded corners
  const cs = 18;
  const cx = x < S.west + cs ? S.west + cs - x : x > S.east - cs ? x - (S.east - cs) : 0;
  const cz = z > S.south - cs ? z - (S.south - cs) : z < S.north + cs && (x <= 92 || x >= 238) ? S.north + cs - z : 0;
  if (cx > 0 && cz > 0) return Math.min(d, cs - Math.hypot(cx, cz));
  return d;
}

/**
 * The beach's height `s` metres inland from the waterline (negative: under the sea): a long gentle
 * slope of sand up to the promenade's foot, a little ripple of dunes, and under the water a shelf you
 * wade out on (knee deep, waist deep) before it drops to swimming depth.
 */
export function beachY(s: number) {
  if (s >= 0) return Math.min(CURB - 0.05, BAY.water + 0.12 + s * 0.045 + (s > 20 ? Math.sin(s * 0.35) * 0.04 : 0));
  return Math.max(KBED, BAY.water + 0.12 + s * 0.075 + Math.min(0, s + 14) * 0.06);
}
/** The water's surface (m). */
export const SEA_Y = BAY.water;

/** The sand's height at (x, z). */
export const sandAt = (x: number, z: number) => beachY(shoreDist(x, z));

/** Inside the town's box (land and its beaches)? */
export const inKeys = (x: number, z: number) => x > KEYS.x0 && x < KEYS.x1 && z > KEYS.z0 && z < KEYS.z1;

/** What stands on the beach (the worker builds it, the game puts people on it: the same list). */
export interface BeachSpot {
  kind: "set" | "towel" | "castle" | "court" | "guard" | "bar" | "palm" | "swim";
  x: number;
  z: number;
  yaw: number;
  seed: number;
}

/**
 * The beach's furniture and its places, deterministic: lifeguard towers near the water, rows of
 * umbrellas with their loungers on the dry sand, towels nearer the sea, sandcastles at the water's
 * edge, two volleyball courts, the beach bars, palms along the promenade's foot, and where people
 * swim (the shallow shelf). The south beach is the big one; the west and east ones get a few.
 */
export function beachSpots(): BeachSpot[] {
  let h = 977;
  const R = () => ((h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
  const out: BeachSpot[] = [];
  const S = KSHORE.south;
  const x0 = KGRID.west + 6,
    x1 = KGRID.east - 6;
  const clear = (x: number, z: number, r: number) => Math.abs(x - KPIER.x) > KPIER.half + 3 + r && !out.some((o) => o.kind !== "swim" && o.kind !== "palm" && Math.hypot(o.x - x, o.z - z) < r + (o.kind === "court" ? 9 : o.kind === "bar" ? 8 : o.kind === "guard" ? 4 : o.kind === "set" ? 3.6 : 1.8));
  // the bars and the courts first, the towers by the water
  out.push({ kind: "bar", x: 132, z: 424 + A, yaw: Math.PI, seed: 1 }, { kind: "bar", x: 288, z: 424 + A, yaw: Math.PI, seed: 2 });
  out.push({ kind: "court", x: 168, z: 446 + A, yaw: 0, seed: 1 }, { kind: "court", x: 252, z: 446 + A, yaw: 0, seed: 2 });
  for (const x of [112, 186, 236, 306]) out.push({ kind: "guard", x, z: S - 22, yaw: 0, seed: x });
  // palms along the foot of the promenade
  for (let x = x0 + 4; x < x1; x += 17) if (Math.abs(x - KPIER.x) > 6 && Math.abs(x - 132) > 9 && Math.abs(x - 288) > 9) out.push({ kind: "palm", x: x + (R() - 0.5) * 3, z: 419.5 + A + R() * 1.5, yaw: R() * 6.28, seed: Math.floor(R() * 4) });
  // umbrellas on the dry sand: a loose grid
  for (let z = 431 + A; z < S - 30; z += 8.5)
    for (let x = x0 + 2; x < x1 - 2; x += 9) {
      if (R() < 0.18) continue;
      const px = x + (R() - 0.5) * 4,
        pz = z + (R() - 0.5) * 3;
      if (clear(px, pz, 2.5)) out.push({ kind: "set", x: px, z: pz, yaw: (R() - 0.5) * 0.5, seed: Math.floor(R() * 1000) });
    }
  // towels nearer the water, in the sun
  for (let k = 0; k < 70; k++) {
    const px = x0 + R() * (x1 - x0),
      pz = S - 34 + R() * 24;
    if (clear(px, pz, 1.4)) out.push({ kind: "towel", x: px, z: pz, yaw: (R() - 0.5) * 0.7 + (R() < 0.5 ? 0 : Math.PI), seed: Math.floor(R() * 1000) });
  }
  // sandcastles at the water's edge
  for (let k = 0; k < 10; k++) {
    const px = x0 + R() * (x1 - x0),
      pz = S - 7 + R() * 4;
    if (clear(px, pz, 1.8)) out.push({ kind: "castle", x: px, z: pz, yaw: R() * 6.28, seed: k });
  }
  // the west and east beaches: a few each
  for (const [bx, face] of [
    [KGRID.west - 12, -1],
    [KGRID.east + 13, 1],
  ] as const)
    for (let z = 292 + A; z < 404 + A; z += 11) {
      if (Math.abs(z - 330 - A) < 7) continue;
      const pz = z + (R() - 0.5) * 3;
      if (R() < 0.55) out.push({ kind: "set", x: bx + (R() - 0.5) * 3, z: pz, yaw: face * Math.PI * 0.5 + Math.PI, seed: Math.floor(R() * 1000) });
      else out.push({ kind: "towel", x: bx + face * 4 + (R() - 0.5) * 3, z: pz, yaw: face * Math.PI * 0.5, seed: Math.floor(R() * 1000) });
    }
  // where people swim: the shelf off the south beach (and a few off the west and east ones)
  for (let k = 0; k < 22; k++) {
    const px = x0 + R() * (x1 - x0),
      pz = S + 4 + R() * 22;
    if (Math.abs(px - KPIER.x) > KPIER.half + 4) out.push({ kind: "swim", x: px, z: pz, yaw: R() * 6.28, seed: k });
  }
  for (let k = 0; k < 6; k++) out.push({ kind: "swim", x: k < 3 ? KSHORE.west - 6 - R() * 8 : KSHORE.east + 6 + R() * 8, z: 300 + A + R() * 90, yaw: R() * 6.28, seed: 100 + k });
  return out;
}

/**
 * YOUR VILLA (src/gta/home.ts): a waterfront estate of its own on Orchard Keys' north point, past
 * the end of Sinsemilla Street — between the woods' bluff and the east beach, its back to the strait,
 * the Golden Gate and the city's skyline across the water. A walled plot raised to the street's level
 * over the old north beach: the forecourt behind the gate (where your car waits), the house (a white
 * modernist pavilion between two wings, its door to the street), the pool terrace and the sea wall,
 * a motor yacht moored along it. Drawn by ./villa.ts; the interior is src/interior/home.
 */
export const VILLA = {
  /** The plot: from the sea wall's face (z0) to the wall on Note Street's pavement (z1). */
  x0: 250,
  x1: 334,
  z0: 610,
  z1: 638,
  /** The house: two wings and the tall pavilion between them (x 270 … 284). */
  house: { x0: 260, x1: 294, z0: 619, z1: 631 },
  hall: { x0: 270, x1: 284 },
  /** The floor's height inside (one step up from the terrace). */
  floor: CURB + 0.14,
  /** The front door's threshold, under the porch (the way out: +z, the street's side). */
  door: { x: 277, z: 630.4 },
  /** The gate in the street wall, at the end of Sinsemilla Street. */
  gate: { x0: 298.6, x1: 307.4 },
  /** The pool on the terrace (its water a little under the deck; deep enough to swim). */
  pool: { x0: 265, x1: 289, z0: 611.4, z1: 615.6, surface: CURB - 0.1, floor: CURB - 1.75 },
  /**
   * Your ZK-GT and your bike side by side in the motor court right behind the gate, both nose to it
   * (yaw −π/2: +z, the street): the way out is straight ahead through the gate, the way home straight
   * in (the court, 19 × 18 m, turns a car round). Not along the 6.7 m strip in front of the house,
   * where a car had to swing 90° between the house and the wall to reach the gate.
   */
  car: { x: 300.6, z: 627.4, yaw: -Math.PI / 2 },
  bike: { x: 305.7, z: 628.2, yaw: -Math.PI / 2 },
  /** The yacht at the sea wall. */
  yacht: { x: 318, z: 605.7 },
  name: "Shielded Point",
};
/** Inside the villa's walls (the plot)? */
export const inVilla = (x: number, z: number, m = 0) => x > VILLA.x0 - m && x < VILLA.x1 + m && z > VILLA.z0 - m && z < VILLA.z1 + m;
/** In the villa's pool: its water and its floor, or null. */
export function villaPool(x: number, z: number) {
  const P = VILLA.pool;
  if (!(x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1)) return null;
  // the steps down at the west end (0.4 m each), the bench along the east end, else the floor
  const k = Math.max(0, Math.floor((x - P.x0 - 0.12) / 0.4));
  const floor = k < 4 ? P.surface - 0.25 - k * 0.32 : x > P.x1 - 0.62 ? P.surface - 0.5 : P.floor;
  return { floor, surface: P.surface };
}
/** The floor's height on the villa's plot (the terrace and the forecourt at the street's; the house and its porch a step up), or null off it. */
export function villaFloor(x: number, z: number) {
  if (!inVilla(x, z)) return null;
  const H = VILLA.house;
  if (x > H.x0 && x < H.x1 && z > H.z0 && z < H.z1 + 0.5 && (z < H.z1 || (x > VILLA.hall.x0 + 1.6 && x < VILLA.hall.x1 - 1.6))) return VILLA.floor;
  return CURB;
}
