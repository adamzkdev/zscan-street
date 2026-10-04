/**
 * The city plan as plain data, shared by the main thread and the generation workers.
 *
 * One block of a Japanese city at night, around one avenue (the bus route) and two side streets:
 *
 *          Orchard  │   Downtown (MEMPOOL shop)    │  Ironwood (depot, Proof Factory)
 *   ────────────────┼──────── avenue / bus ─────────┼──────────────────────────────────
 *    Orchard park   │  bus stop · Transparent sq.   │  container yard
 */

export const CURB = 0.2;

/** Everything runs through one MEMPOOL shop and one bus stop, downtown. */
export type DistrictKey = "downtown";

/** The avenue is four lanes wide; everything north of it sits this much further north. */
export const SHIFT = 3.4;
/** Move a z from the original two-lane layout to the four-lane one. */
export const nz = (z: number) => (z < -1.9 ? z - SHIFT : z);

/**
 * The avenue runs off both ends of the board along a short causeway into a tunnel. Vehicles are
 * born and vanish inside it (`inside`, metres from the centre) instead of popping up at the edge.
 */
export const TUNNEL = { mouth: 84, depth: 12, inside: 92, hideBeyond: 89 };

export const CITY = {
  minX: -50,
  maxX: 50,
  minZ: -36 - SHIFT,
  maxZ: 32,
  curb: CURB,
  road: { z0: -2 - SHIFT, z1: 2.6 },
  north: { z0: -6 - SHIFT, z1: -2 - SHIFT },
  south: { z0: 2.6, z1: 7 },
  /**
   * Four lanes: eastbound kerb lane (buses, stopping at the south kerb) and fast lane, westbound
   * fast lane and kerb lane (deliveries and taxis, stopping at the north kerb).
   */
  laneEast: 1.4,
  laneEastFast: -0.4,
  laneWestFast: -2.4,
  laneWest: -4.25,
  cross: [-24, 24],
  crossHalf: 2.2,
  frontNorth: -6.05 - SHIFT,
};

export interface DistrictPlan {
  key: DistrictKey;
  name: string;
  x0: number;
  x1: number;
  /** The MEMPOOL shop: centre of its frontage on the avenue. */
  shopX: number;
  /** Zebra crossing from the shop side to the bus stop. */
  crossX: number;
  /** Where the bus stops (bus centre). */
  stopX: number;
  /** Taxi rank on the north kerb, west of the shop (cars arrive westbound). */
  rankX: number;
}

export const DISTRICTS: DistrictPlan[] = [{ key: "downtown", name: "Downtown", x0: -50, x1: 50, shopX: -7.5, crossX: -0.5, stopX: 7, rankX: -16.2 }];

/** The neighbourhoods, for the camera's Districts menu. */
export const AREAS = [
  { key: "downtown", name: "Downtown", blurb: "The MEMPOOL shop, the bus stop, neon", color: "#ff9f2e", x: 1.5, z: -0.5, zoom: 1 },
  { key: "orchard", name: "Orchard", blurb: "Wooden houses, the greenhouse, the orchard park", color: "#5cff9a", x: -37, z: 2, zoom: 1.1 },
  { key: "ironwood", name: "Ironwood", blurb: "The Proof Factory, the depot, the container yard", color: "#b07bff", x: 37, z: 0, zoom: 1.1 },
  { key: "transparent", name: "Transparent Square", blurb: "Open market, nothing hidden", color: "#ffd28a", x: 0, z: 18, zoom: 1.2 },
];

export type Archetype =
  | "shophouse"
  | "apartment"
  | "office"
  | "izakaya"
  | "warehouse"
  | "house"
  | "machiya"
  | "mempool"
  | "depot"
  | "factory"
  | "shrine"
  | "construction"
  | "pavilion"
  | "cardshop"
  | "bank"
  | "zsa"
  | "library";

export interface BuildingJob {
  id: number;
  type: Archetype;
  seed: number;
  opts: Record<string, unknown>;
  /** Centre of the frontage along the street, the front line, and which way the front faces. */
  along: number;
  front: number;
  face: "s" | "n";
  district: DistrictKey;
  /** Front-row buildings are where pedestrians come out. */
  frontRow: boolean;
  /** Body width in voxels. */
  width: number;
}

export interface PropJob {
  type: string;
  args: unknown[];
  x: number;
  z: number;
  rot: number;
  y?: number;
  district: DistrictKey;
}

const VOX = 1 / 6;

/** Every building and prop of the city, as jobs for the workers, plus extra collision shapes. */
export function planCity() {
  const jobs: BuildingJob[] = [];
  const props: PropJob[] = [];
  const rects: [number, number, number, number][] = [];
  const circles: [number, number, number][] = [];
  let id = 0;
  const fz = -6.05;

  /** Lay buildings side by side along x, fronts on one line. */
  const row = (items: [Archetype, number, Record<string, unknown>, number][], x0: number, front: number, face: "s" | "n", frontRow = true) => {
    let x = x0;
    for (const [type, seed, opts, width] of items) {
      const w = width * VOX;
      jobs.push({ id: id++, type, seed, opts, along: x + w / 2, front: nz(front), face, district: "downtown", frontRow, width });
      x += w + 0.05;
    }
  };

  // ---- Downtown: the front row on the avenue, then the skyline behind ----
  row(
    [
      // the Zcash Shielded Assets exchange, still a building site (ZIPs 226, 227, 228)
      ["zsa", 101, { venue: "zsa" }, 40],
      ["mempool", 102, {}, 48],
      ["office", 103, { floors: 10, billboard: "完全な匿名", billboardColor: "#3ef0ff" }, 40],
      // the card shop (the zkSNARK collection) and the viewing-key bank, next to the MEMPOOL shop
      ["cardshop", 104, { venue: "cards" }, 40],
      ["bank", 105, { venue: "bank" }, 48],
    ],
    -18,
    fz,
    "s",
  );
  row(
    [
      ["apartment", 111, { floors: 6 }, 44],
      ["office", 112, { floors: 12, billboard: "証明", billboardColor: "#ff9f2e" }, 40],
      ["apartment", 113, { floors: 7, wall: "tile" }, 50],
      ["shophouse", 114, { shop: "shutter", floors: 5, vsign: "夜市" }, 46],
      ["apartment", 115, { floors: 5, garden: true }, 36],
    ],
    -18,
    -12.6,
    "s",
    false,
  );
  row(
    [
      ["office", 121, { floors: 14 }, 42],
      ["office", 122, { floors: 16, wall: "blue", billboard: "ZEC", billboardColor: "#f4b728" }, 46],
      ["office", 123, { floors: 13, wall: "violet" }, 40],
      ["office", 124, { floors: 17 }, 46],
      ["apartment", 125, { floors: 9 }, 42],
    ],
    -18,
    -20.6,
    "s",
    false,
  );
  // ---- Orchard houses, Ironwood sheds (the depot and the Proof Factory), the big hall behind ----
  row(
    [
      ["house", 201, {}, 34],
      ["house", 202, { shop: "tea", sign: "茶屋" }, 34],
      ["house", 203, { shop: "florist", sign: "花屋" }, 34],
    ],
    -48.5,
    fz,
    "s",
  );
  row(
    [
      // the Proof Factory on the left, the depot on the right
      ["factory", 302, {}, 62],
      ["depot", 301, {}, 56],
    ],
    28.4,
    fz,
    "s",
  );
  row([["warehouse", 303, { sign: "NU7" }, 104]], 29, -17.5, "s", false);
  // ---- Transparent square: shops on the south edge, facing the square ----
  row(
    [
      ["shophouse", 401, { shop: "cafe", sign: "喫茶", signColor: "#ffd28a", floors: 3, wall: "cream", garden: true }, 36],
      // the LIBRARY faces the fountain: ZIPs, the press room, network upgrades
      ["library", 406, { venue: "library" }, 108],
      ["shophouse", 405, { shop: "cafe", sign: "OPEN", signColor: "#ffffff", floors: 3, wall: "warm", garden: true }, 36],
    ],
    -15,
    26.2,
    "n",
    false,
  );

  // ---- street furniture ----
  const add = (type: string, args: unknown[], x: number, z: number, rot = 0, y?: number) => props.push({ type, args, x, z: nz(z), rot, y, district: "downtown" });
  const [cw, ce] = CITY.cross;
  const ch = CITY.crossHalf;
  const d = DISTRICTS[0];
  for (let x = -46; x <= 46; x += 10.5) {
    if (Math.abs(x - cw) < 4 || Math.abs(x - ce) < 4) continue;
    const c = x < -26 ? "#ffd9a0" : x > 26 ? "#c9a0ff" : "#ffb46b";
    if (Math.abs(x - d.rankX) > 2.5) add("lamp", [c], x, (-2) - 0.35, 0);
    if (!(x + 5 > d.crossX - 1 && x + 5 < 17)) add("lamp", [c], x + 5, CITY.south.z0 + 0.35, Math.PI);
  }
  add("lamp", ["#ffb46b"], -1.6, CITY.south.z0 + 0.35, Math.PI);
  add("lamp", ["#ffb46b"], 18, CITY.south.z0 + 0.35, Math.PI);
  for (const x of CITY.cross)
    for (let z = -32; z <= 28; z += 11) {
      if (Math.abs(z) < 7) continue;
      const c = x < 0 ? "#ffd9a0" : "#c9a0ff";
      add("lamp", [c], x - ch - 0.35, z, Math.PI / 2);
      add("lamp", [c], x + ch + 0.35, z + 5.5, -Math.PI / 2);
    }
  for (const run of polePositions()) for (const p of run) props.push({ type: "pole", args: [], x: p.x, z: p.z, rot: 0, district: "downtown" });
  for (let x = -20; x <= 20; x += 2.2) {
    if (Math.abs(x - d.crossX) < 2) continue;
    if (Math.abs(x - d.rankX) > 3 && !(x > -12 && x < -3)) add("bollard", [], x, (-2) - 0.2);
    if (!(x > -2 && x < 17)) add("bollard", [], x + 1.1, CITY.south.z0 + 0.2);
  }
  // downtown clutter: vending machines, bikes, bags, a hydrant
  add("vending", ["red"], -3.05, fz + 0.45);
  add("vending", ["blue"], -1.9, fz + 0.45);
  // (the bank's steps run to the corner: no vending machines there)
  add("bicycle", ["#c03a3a"], -17.6, -5.0, Math.PI / 2.2);
  add("bicycle", ["#3a6ac0"], -16.7, -5.0, Math.PI / 2.2);
  add("bicycle", ["#d8d4cc"], 4.4, -5.1, Math.PI / 2.3);
  add("trashBags", [1], 15.0, -5.4);
  add("crates", [3], -12.6, -5.4);
  add("trashBin", [], 3.2, -5.5);
  add("hydrant", [], -4.4, -2.7);
  add("streetSign", [], d.crossX - 1.7, (-2) - 0.5);
  for (const x of [12.6, 13.3]) add("cone", [], x, -2.7);
  // the stop, the taxi rank
  add("shelter", [], 14.2, CITY.south.z1 - 0.95, Math.PI);
  add("stopPole", [], d.stopX + 3.6, CITY.south.z0 + 0.45);
  add("mailbox", [], 17.3, 4.0, Math.PI);
  add("taxiSign", [], d.rankX - 1.0, (-2) - 0.45);
  add("rail", [5], d.rankX + 2.6, -3.85);
  // the plaza between the stop and the square
  [-13, -4, 5, 12.5].forEach((x, i) => {
    add("planter", [3, false], x, 9.2, 0, CURB + 0.15);
    add("tree", ["round", 1 + (i % 4)], x, 9.2, i, CURB + 0.65);
  });
  for (const x of [-8.5, 0.5, 9]) add("bench", [], x, 8.4, Math.PI, CURB + 0.15);
  // Transparent square
  add("tieredFountain", [], 0, 19, 0, CURB + 0.06);
  // flower beds and maples around the fountain
  for (const [x, z] of [
    [-6.5, 17],
    [6.5, 17],
    [-6.5, 21.5],
    [6.5, 21.5],
  ])
    add("planter", [Math.abs(x * z) | 0, true], x, z, 0, CURB + 0.06);
  for (const [x, z] of [
    [-11.5, 18.5],
    [11.5, 18.5],
  ])
    add("maple", [Math.abs(x) | 0], x, z, 0, CURB + 0.06);
  const cloths = ["#c0503a", "#d0a040", "#3a7ac0", "#c06a8a", "#3a9a6a", "#7a5ac0"];
  [-14, -9.5, 9.5, 14].forEach((x, i) => add("stall", [cloths[i], i], x, 14.2, 0, CURB + 0.06));
  [-14, -9.5, 9.5, 14].forEach((x, i) => add("stall", [cloths[(i + 2) % 6], i + 9], x, 22.8, Math.PI, CURB + 0.06));
  for (const [x, z] of [
    [-5.5, 13.5],
    [5.5, 13.5],
    [-18.2, 19],
    [18.2, 19],
  ])
    add("tree", ["round", 1 + (Math.abs(x + z) & 3)], x, z, 0, CURB + 0.06);
  for (const x of [-4.5, 4.5]) add("bench", [], x, 23.6, 0, CURB + 0.06);
  add("gate", [46], 0, 11.6);
  // Orchard: greenhouse, orchard rows, the park
  add("greenhouse", [], -39, -15.5);
  rects.push([-45, -18.5, -33, -12.5]);
  let k = 0;
  for (let x = -47; x <= -30; x += 3.6) for (let z = -33.5; z <= -22.5; z += 3.6) add("tree", k++ % 3 ? ["persimmon", 10 + (k % 2)] : ["round", 1 + (k % 4)], x, z, k);
  // the Orchard garden: koi pond with a red bridge, maples, bamboo, lanterns and a gravel bed
  circles.push([-37.5, 21, 3.6]);
  add("bridge", [], -37.5, 21, 0, CURB + 0.05);
  add("stones", [3], -43, 12.5);
  for (const [x, z] of [
    [-44, 25],
    [-31.5, 16],
    [-31, 27.5],
    [-45.5, 18.5],
  ])
    add("maple", [Math.abs(x * z) | 0], x, z);
  for (const z of [9, 13.5, 18, 23, 27.5]) add("bamboo", [z | 0], -47.4, z);
  for (const [x, z] of [
    [-34, 11],
    [-40.5, 29],
    [-32, 22],
  ])
    add("tree", ["blossom", 5 + (Math.abs(x + z) % 3)], x, z);
  for (const [x, z] of [
    [-29.8, 10],
    [-29.8, 30],
    [-36, 30],
  ])
    add("tree", ["pine", 8 + (Math.abs(x + z) % 2)], x, z);
  for (const [x, z] of [
    [-41.8, 21],
    [-33.2, 21],
    [-37.5, 16.6],
    [-37.5, 25.6],
  ])
    add("stoneLantern", [], x, z);
  for (const [x, z, r] of [
    [-41, 9.4, 0],
    [-33.5, 29.6, Math.PI],
  ])
    add("bench", [], x, z, r);
  for (let x = -48; x <= -30; x += 4.4) add("tree", ["blossom", 5 + (Math.abs(Math.round(x)) % 3)], x, -2.9, x);
  add("gate", [30], -27.6, 4.2, Math.PI / 2);
  // Ironwood: chimneys, the container yard, the crane, a fence
  for (const [x, h] of [
    [31, 110],
    [36, 140],
    [45, 100],
  ])
    add("chimney", [h], x, -33);
  const colors = ["#6a3a8a", "#3a3a5a", "#8a4a2a", "#2a5a6a", "#5a2a6a", "#4a4a4a"];
  k = 0;
  for (let r = 0; r < 3; r++)
    for (let col = 0; col < 4; col++) {
      const stack = 1 + ((r * 7 + col * 3) % 3);
      for (let s = 0; s < stack; s++) {
        add("container", [colors[k % colors.length], k % colors.length], 31.4 + col * 3.2, 13.5 + r * 6.8, 0, CURB + s * 2.7);
        k++;
      }
      rects.push([30.1 + col * 3.2, 10.5 + r * 6.8, 32.7 + col * 3.2, 16.5 + r * 6.8]);
    }
  add("gantry", [108, 120], 38, 20.5);
  for (const [x, z] of [
    [29.3, 10.8],
    [46.7, 10.8],
    [29.3, 30.2],
    [46.7, 30.2],
  ])
    circles.push([x, z, 0.5]);
  add("fence", [126], 38.3, 8.4);
  rects.push([27.8, 8.3, 48.8, 8.5]);
  add("crates", [12], 27.2, -5.2);
  add("barrel", ["#5a3a8a"], 47.6, -5.4);
  add("barrel", ["#3a5a8a"], 47.1, -4.8);
  return {
    jobs,
    props,
    rects: rects.map(([x0, z0, x1, z1]) => [x0, nz(z0), x1, nz(z1)] as [number, number, number, number]),
    circles: circles.map(([x, z, r]) => [x, nz(z), r] as [number, number, number]),
  };
}

/** Utility poles along the north pavement (the wires between them are drawn on the main thread). */
export function polePositions() {
  const out: { x: number; z: number }[][] = [];
  let run: { x: number; z: number }[] = [];
  for (let x = -46; x <= 47; x += 12) {
    // no pole (and its transformer box) at the crossings, nor in front of the bank's portico
    if (CITY.cross.some((c) => Math.abs(x - c) < 4) || (x > 9 && x < 19)) {
      if (run.length > 1) out.push(run);
      run = [];
      continue;
    }
    run.push({ x, z: CITY.north.z1 - 0.9 });
  }
  if (run.length > 1) out.push(run);
  return out;
}
