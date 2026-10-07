/**
 * The city plan as plain data, shared by the main thread and the generation workers.
 *
 * One block of a Japanese city at night, around one avenue (the bus route) and two side streets:
 *
 *          Orchard  │   Downtown (MEMPOOL shop)    │  Ironwood (bars, karaoke, offices)
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
export const TUNNEL = { mouth: 270, depth: 12, inside: 278, hideBeyond: 275 };

/** The original board, the hand-made heart of the city, now in the middle of a bigger one. */
export const CORE = { minX: -50, maxX: 50, minZ: -36 - SHIFT, maxZ: 32 };

/**
 * The megalopolis round it: a grid of streets (centres and widths below; the avenue carries on
 * across), a ring road along the edge (the metro runs over it), two boulevards each way, Central
 * Park north of the heart, the river, and the bay south of the ring with its islands.
 */
export const GRID = {
  street: 8,
  xs: [-226, -194, -158, -122, -86, -54, 54, 86, 122, 158, 194, 226],
  xw: [10, 8, 8, 14, 8, 8, 8, 8, 14, 8, 8, 10],
  zs: [-228, -192, -156, -120, CORE.minZ - 4, CORE.maxZ + 4, 68, 104, 136],
  /** Width of each east–west line: the river is the wide one. */
  zw: [10, 8, 14, 8, 8, 8, 18, 8, 10],
  park: { x0: -50, x1: 50, z0: -116, z1: CORE.minZ - 8 },
};

/** Streets by name (centre lines). */
export const ST = {
  ringW: -226,
  ringE: 226,
  ringN: -228,
  ringS: 136,
  blvdW: -122,
  blvdE: 122,
  blvdN: -156,
  shotengai: -86,
  heartW: -54,
  heartE: 54,
  east1: 86,
  parkN: -120,
  /** The street round the heart's north side, and the one south of the square. */
  north: CORE.minZ - 4,
  south: CORE.maxZ + 4,
  river: 68,
  bank: 104,
};

/** The river across the south of the city: its banks (z), water level, and the bridges' x. */
export const RIVER = { z0: 59, z1: 77, water: -1.1, bed: -2.2, bridges: [-226, -194, -122, -54, 54, 122, 194, 226], foot: [0, -24, 24] };

/** The bay south of the ring road: open water, two islands, the headland across it and its bridge. */
export const BAY = {
  z0: 146,
  water: -1.6,
  bed: -3.2,
  /** Liberty island: the zkSNARK statue. */
  liberty: { x: 46, z: 190, r: 15 },
  /** The prison island. */
  rock: { x0: -150, x1: -92, z0: 178, z1: 208 },
  /** The headland on the far shore, east of x0, and the suspension bridge over to it at x. */
  headland: { x0: 96, z0: 222 },
  bridge: { x: 158, towers: [164, 204] },
  /** Bennelong point: the Opera House's pier, joined to the quay by a walkway. */
  opera: { x0: -66, x1: -22, z0: 162, z1: 200 },
  /** The Palm (Jumeirah): a palm-shaped island of villas, west of the rock, its trunk joined to the quay. */
  palm: { x0: -234, x1: -178, z0: 150, z1: 234 },
  /** The sail-shaped hotel on its own little island, off the palm. */
  arab: { x0: -172, x1: -152, z0: 152, z1: 176 },
};

/** The covered shopping street: the street at x = -86 along the heart, under a canopy. */
export const SHOTENGAI = { x: ST.shotengai, z0: -39.4 + 1, z1: 32 - 1, half: 4 + 2.6 };

/**
 * The landmarks' lots: whole blocks (merged across the small streets inside them) kept for a
 * building of their own, placed like a city planner would.
 */
export type LotKind = "stadium" | "museum" | "foodhall" | "reserve" | "mall" | "needle" | "marina" | "gardens" | "port" | "green" | "pyramid" | "eiffel" | "colosseum" | "flyer" | "parliament" | "shibuya" | "zkorchard" | "zksapling" | "zkhalo" | "binhai";
export const LOTS: { kind: LotKind; x0: number; x1: number; z0: number; z1: number }[] = [
  // the Block Stadium, out west on the park's latitude
  { kind: "stadium", x0: -221, x1: -129, z0: -116, z1: CORE.minZ - 8 },
  // the zkSNARK Museum faces Central Park from the west, like the Met
  { kind: "museum", x0: -115, x1: -58, z0: -116, z1: CORE.minZ - 8 },
  // the hawker centre, two blocks west of the shōtengai, on the avenue
  { kind: "foodhall", x0: -154, x1: -129, z0: 2.6, z1: 32 },
  // Wall Street: the ZEC Reserve on the avenue east of the heart, the mall further on
  { kind: "reserve", x0: 90, x1: 115, z0: 2.6, z1: 32 },
  { kind: "mall", x0: 129, x1: 190, z0: -39.4, z1: -5.4 },
  // the needle, alone on its plaza in Midtown
  { kind: "needle", x0: 129, x1: 154, z0: -149, z1: -124 },
  // Marina Bay on the south bank: the hotel and its sky park, the gardens behind
  { kind: "marina", x0: 129, x1: 190, z0: 77, z1: 100 },
  { kind: "gardens", x0: 129, x1: 221, z0: 108, z1: 131 },
  // the port and the power station, west on the south bank
  { kind: "port", x0: -221, x1: -129, z0: 77, z1: 131 },
  // the world's wonders up north: Giza in the north-west, Paris north of the museum, Rome north-east
  { kind: "pyramid", x0: -190, x1: -129, z0: -223, z1: -163 },
  { kind: "eiffel", x0: -115, x1: -58, z0: -223, z1: -196 },
  { kind: "colosseum", x0: 58, x1: 115, z0: -223, z1: -163 },
  // pocket parks
  // Westminster on the river: the Houses of Parliament and Big Ben, facing the water
  { kind: "parliament", x0: 58, x1: 115, z0: 40, z1: 59 },
  // Shibuya: the scramble crossing at the boulevard and the street west of the park, QFRONT on its corner
  { kind: "shibuya", x0: -82, x1: -58, z0: -188, z1: -163 },
  // the ZEC Flyer (scene/sky.ts) in the riverside park
  { kind: "flyer", x0: -82, x1: -58, z0: 77, z1: 100 },
  { kind: "green", x0: 129, x1: 154, z0: -223, z1: -196 },
  // the ZK towers: ORCHARD (art deco) in Midtown by the Needle, SAPLING (sky gardens) on the marina's bank, HALO (twisted glass) on Wall Street
  { kind: "zkorchard", x0: 90, x1: 115, z0: -149, z1: -124 },
  { kind: "zksapling", x0: 198, x1: 221, z0: 77, z1: 100 },
  { kind: "zkhalo", x0: 198, x1: 221, z0: -39.4, z1: -5.4 },
  // the Binhai Library on the south bank, facing the heart across the river and its footbridges
  { kind: "binhai", x0: -50, x1: 50, z0: 77, z1: 131 },
];

/** Central Park: its lake, the fountain terrace, the bandstand, and the paths (polylines, x/z). */
export const PARK = {
  lake: { x: 12, z: -96, rx: 21, rz: 10.5 },
  island: { x: 19, z: -97, r: 2.6 },
  fountain: { x: 0, z: -80 },
  bandstand: { x: -26, z: -66 },
  meadow: { x: -30, z: -94, rx: 13, rz: 11 },
  paths: [
    // the Mall: straight from the south gate to the fountain terrace
    [
      [0, -49],
      [0, -77],
    ],
    // the loop round the park
    [
      [-42, -54],
      [-44, -84],
      [-38, -110],
      [-6, -112],
      [30, -111],
      [43, -100],
      [44, -70],
      [36, -53],
      [8, -51],
      [-20, -51],
      [-42, -54],
    ],
    // across: the terrace to the west gate and the east gate
    [
      [-49, -72],
      [-30, -74],
      [-8, -79],
      [0, -80],
      [10, -82],
      [30, -80],
      [49, -76],
    ],
    // round the lake's north shore to the north gate
    [
      [-10, -96],
      [-6, -104],
      [6, -109],
      [24, -108],
      [34, -100],
      [36, -90],
    ],
    [
      [-4, -112],
      [-2, -117],
    ],
  ] as [number, number][][],
};

export const CITY = {
  minX: -236,
  maxX: 236,
  minZ: -238,
  /** The far shore of the bay. */
  maxZ: 236,
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
  { key: "ironwood", name: "Ironwood", blurb: "Izakayas, karaoke, the NU7 tower", color: "#b07bff", x: 37, z: 0, zoom: 1.1 },
  { key: "transparent", name: "Transparent Square", blurb: "Open market, nothing hidden", color: "#ffd28a", x: 0, z: 18, zoom: 1.2 },
  { key: "park", name: "Central Park", blurb: "The lake, the bandstand, the woods", color: "#5cff9a", x: 0, z: -82, zoom: 0.55 },
  { key: "museum", name: "zkSNARK Museum", blurb: "The 10,000 zkSNARKs", color: "#ff3e8a", x: -86, z: -82, zoom: 0.6 },
  { key: "stadium", name: "Block Stadium", blurb: "Shielded vs Transparent, live", color: "#f4b728", x: -175, z: -82, zoom: 0.5 },
  { key: "shotengai", name: "Shōtengai & Hawker", blurb: "Covered shops, the food hall", color: "#ff6a3a", x: -112, z: 10, zoom: 0.65 },
  { key: "wallst", name: "Wall Street", blurb: "The ZEC Reserve, the towers, the mall", color: "#3a7bff", x: 130, z: 0, zoom: 0.5 },
  { key: "midtown", name: "Midtown", blurb: "Supertalls and the ZEC Needle", color: "#3ef0ff", x: 120, z: -120, zoom: 0.4 },
  { key: "marina", name: "Marina Bay", blurb: "The sky park, the supertrees", color: "#1baf7a", x: 170, z: 100, zoom: 0.5 },
  { key: "port", name: "Proof Factory District", blurb: "The mining hall, the docks, the trucks", color: "#eda100", x: -175, z: 104, zoom: 0.5 },
  { key: "binhai", name: "Binhai Library", blurb: "The Eye, the shelves, the sphere", color: "#ffd28a", x: 0, z: 104, zoom: 0.75 },
  { key: "flyer", name: "ZEC Flyer & Blimp", blurb: "The observation wheel, the blimp's mast", color: "#f4b728", x: -70, z: 88, zoom: 0.9 },
  { key: "giza", name: "Giza", blurb: "The Great Pyramid and its labyrinth", color: "#ffd28a", x: -160, z: -193, zoom: 0.55 },
  { key: "paris", name: "Paris", blurb: "The Eiffel Tower", color: "#b07bff", x: -86, z: -205, zoom: 0.6 },
  { key: "rome", name: "Rome", blurb: "The Colosseum, the Proof Games", color: "#eb6834", x: 86, z: -193, zoom: 0.55 },
  { key: "shibuya", name: "Shibuya", blurb: "The scramble crossing", color: "#ff3e8a", x: -60, z: -162, zoom: 0.8 },
  { key: "palm", name: "The Palm", blurb: "Villas on the palm, the sail hotel", color: "#1baf7a", x: -195, z: 190, zoom: 0.45 },
  { key: "bay", name: "The Bay", blurb: "Liberty island, the rock, the bridge", color: "#3987e5", x: 20, z: 190, zoom: 0.35 },
  { key: "woods", name: "Shielded Woods", blurb: "Redwoods, Sprout Falls, the campfire", color: "#3f9a4a", x: 192, z: 212, zoom: 0.6 },
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
  | "bookshop"
  | "landmark";

export interface BuildingJob {
  id: number;
  type: Archetype;
  seed: number;
  opts: Record<string, unknown>;
  /** Centre of the frontage along the street, the front line, and which way the front faces. */
  along: number;
  front: number;
  /** s/n: `along` is x and `front` z; e/w (fronts facing east or west): `along` is z, `front` x. */
  face: "s" | "n" | "e" | "w";
  district: DistrictKey;
  /** Front-row buildings are where pedestrians come out. */
  frontRow: boolean;
  /** Part of the bigger city round the heart: instanced with its copies, no walls-down. */
  ext?: boolean;
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
      // the ZK TOWER: apartments, an arcade floor, residents (walk-in)
      ["office", 103, { floors: 10, billboard: "完全な匿名", billboardColor: "#3ef0ff", venue: "tower" }, 40],
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
  // ---- Orchard houses, Ironwood's bars and towers (the Proof Factory is out in the port district) ----
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
  // east of the junction: a night-life corner (the Proof Factory moved out to the port district)
  row(
    [
      ["izakaya", 302, {}, 32],
      ["shophouse", 301, { shop: "karaoke", floors: 5, vsign: "カラオケ" }, 46],
      ["shophouse", 304, { shop: "cafe", floors: 3, vsign: "暗号", signColor: "#3ef0ff", wall: "warm" }, 36],
    ],
    28.4,
    fz,
    "s",
  );
  row(
    [
      ["office", 303, { floors: 14, wall: "violet", billboard: "NU7", billboardColor: "#3ee08f" }, 50],
      ["apartment", 306, { floors: 9, wall: "tile" }, 54],
    ],
    29,
    -17.5,
    "s",
    false,
  );
  // south of the avenue, facing it: low-rise bars and a ramen shop, walk-ups behind
  row(
    [
      ["machiya", 311, { shop: "ramen" }, 26],
      ["shophouse", 312, { shop: "shutter", floors: 3, vsign: "夜市" }, 40],
      ["izakaya", 313, {}, 32],
    ],
    28.6,
    7.4,
    "n",
    false,
  );
  row(
    [
      ["apartment", 314, { floors: 4, wall: "warm" }, 44],
      ["house", 315, {}, 34],
      ["shophouse", 316, { shop: "cafe", floors: 3, vsign: "喫茶", signColor: "#ffd28a" }, 36],
    ],
    27.6,
    20.5,
    "n",
    false,
  );
  // ---- Transparent square: shops on the south edge, facing the square ----
  row(
    [
      ["shophouse", 401, { shop: "cafe", sign: "喫茶", signColor: "#ffd28a", floors: 3, wall: "cream", garden: true }, 36],
      // the bookshop-café and newsstand faces the fountain (the library moved to the south bank)
      ["bookshop", 406, {}, 108],
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
  // Ironwood's back alley between the two rows south of the avenue: lanterns, bikes, a tree or two
  for (const [x, z] of [
    [30.5, 17.6],
    [45.5, 17.6],
  ])
    add("tree", ["round", 2 + (x & 1)], x, z);
  add("bicycle", ["#3ac07a"], 37.5, 17.4, Math.PI / 2);
  add("trashBags", [2], 41.6, 17.8);
  add("crates", [12], 27.2, -5.2);
  add("barrel", ["#5a3a8a"], 47.6, -5.4);
  add("barrel", ["#3a5a8a"], 47.1, -4.8);
  // everything from here on is in absolute coordinates (the heart's are shifted by nz())
  const heartRects = rects.length,
    heartCircles = circles.length;
  // ---- the bigger city: blocks round the heart and the park, built up along their streets ----
  const P = GRID.park;
  const S2 = GRID.street;
  const PAVE = 2.6;
  const DEEP = 7.2;
  let seq = 0;
  const rnd = (k: number) => {
    const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  /**
   * What a block is built of, by where it is: a fixed palette per district (a handful of
   * variants each, so the workers mesh each one once and the copies share it).
   */
  type V = [Archetype, Record<string, unknown>, number];
  const PALETTES: Record<Zone, V[]> = {
    // Manhattan by the park: glass and stone towers
    midtown: [
      ["office", { floors: 22, wall: "blue" }, 42],
      ["office", { floors: 18 }, 46],
      ["office", { floors: 20, wall: "violet", billboard: "ZEC", billboardColor: "#f4b728" }, 40],
      ["office", { floors: 16 }, 40],
      ["apartment", { floors: 12 }, 44],
      ["office", { floors: 19, billboard: "証明", billboardColor: "#3ef0ff" }, 46],
      ["office", { floors: 24, wall: "dark", crown: "#3ef0ff" }, 44],
    ],
    parkside: [
      ["apartment", { floors: 12 }, 44],
      ["apartment", { floors: 10, wall: "tile" }, 50],
      ["office", { floors: 16 }, 46],
      ["apartment", { floors: 14 }, 42],
      ["office", { floors: 18, wall: "blue" }, 40],
    ],
    // brownstones and walk-ups up north
    uptown: [
      ["apartment", { floors: 6, wall: "brick" }, 44],
      ["apartment", { floors: 7, wall: "warm" }, 40],
      ["shophouse", { floors: 4, shop: "cafe", vsign: "珈琲" }, 36],
      ["apartment", { floors: 8, wall: "brick", garden: true }, 46],
      ["shophouse", { floors: 5, shop: "shutter", vsign: "書店" }, 40],
      ["izakaya", {}, 32],
    ],
    west: [
      ["shophouse", { floors: 3, shop: "cafe" }, 36],
      ["shophouse", { floors: 5, shop: "shutter", vsign: "夜市" }, 46],
      ["izakaya", {}, 32],
      ["machiya", { shop: "ramen" }, 26],
      ["machiya", { shop: "tea" }, 26],
      ["apartment", { floors: 5 }, 44],
      ["shophouse", { floors: 4, shop: "cafe", vsign: "暗号" }, 36],
    ],
    westres: [
      ["apartment", { floors: 9, wall: "tile" }, 46],
      ["apartment", { floors: 11 }, 44],
      ["apartment", { floors: 7, wall: "cream", garden: true }, 40],
      ["shophouse", { floors: 4, shop: "cafe", vsign: "食堂" }, 36],
      ["izakaya", {}, 32],
    ],
    // Wall Street: banks, trading floors, the exchanges' tickers
    finance: [
      ["office", { floors: 26, wall: "concrete", billboard: "ZEC/USD", billboardColor: "#5cff9a" }, 46],
      ["office", { floors: 22, wall: "dark" }, 44],
      ["office", { floors: 28, wall: "blue", crown: "#f4b728" }, 48],
      ["office", { floors: 20, wall: "cream" }, 42],
      ["office", { floors: 24, wall: "violet", billboard: "SHIELDED", billboardColor: "#f4b728" }, 46],
    ],
    // shops and hotels along the avenue east
    eastcom: [
      ["office", { floors: 11, wall: "cream", billboard: "HOTEL ZEC", billboardColor: "#ff9f2e" }, 46],
      ["shophouse", { floors: 5, shop: "karaoke", vsign: "カラオケ" }, 40],
      ["office", { floors: 12, wall: "blue", billboard: "HOTEL 盾", billboardColor: "#3ef0ff" }, 44],
      ["shophouse", { floors: 4, shop: "cafe", vsign: "喫茶" }, 36],
      ["apartment", { floors: 8, wall: "tile" }, 44],
    ],
    // south of the avenue the camera looks over the roofs: low-rise only
    south: [
      ["shophouse", { floors: 3, shop: "cafe" }, 36],
      ["apartment", { floors: 4 }, 44],
      ["house", {}, 34],
      ["shophouse", { floors: 4, shop: "shutter", vsign: "未来" }, 46],
      ["izakaya", {}, 32],
      ["machiya", { shop: "tea" }, 26],
    ],
    southbank: [
      ["apartment", { floors: 6, wall: "cream", garden: true }, 44],
      ["shophouse", { floors: 4, shop: "cafe", vsign: "川" }, 36],
      ["house", {}, 34],
      ["apartment", { floors: 5, wall: "warm" }, 40],
      ["izakaya", {}, 32],
    ],
    // Singapore by the water: tall white residential towers with sky gardens
    marina: [
      ["apartment", { floors: 18, wall: "cream", garden: true }, 44],
      ["office", { floors: 20, wall: "blue", crown: "#5cff9a" }, 42],
      ["apartment", { floors: 16, wall: "tile", garden: true }, 46],
    ],
    port: [
      ["warehouse", {}, 56],
      ["warehouse", {}, 62],
      ["apartment", { floors: 5 }, 44],
      ["izakaya", {}, 32],
    ],
  };
  /**
   * The shōtengai: the covered shopping street on the west side (x = -86, along the heart). Each
   * shop is a real place to click: its counter shows live chain data (scene: `stores` in main).
   */
  const STORES: V[] = [
    ["shophouse", { store: "konbini", shop: "konbini", sign: "コンビニ 24", signColor: "#7fd3ff", floors: 3 }, 30],
    ["shophouse", { store: "exchange", shop: "shop", sign: "両替 ZEC", signColor: "#f4b728", floors: 4, vsign: "両替" }, 30],
    ["shophouse", { store: "cafe", shop: "cafe", sign: "喫茶 BLOCK", signColor: "#ffd28a", floors: 3 }, 30],
    ["shophouse", { store: "ramen", shop: "ramen", sign: "ラーメン 採掘", signColor: "#ff6a3a", floors: 3, vsign: "採掘" }, 30],
    ["shophouse", { store: "news", shop: "shop", sign: "新聞 NEWS", signColor: "#e8e6ee", floors: 3 }, 30],
    ["shophouse", { store: "arcade", shop: "karaoke", sign: "ARCADE ゲーム", signColor: "#ff3e8a", floors: 4, vsign: "ゲーム" }, 34],
    ["shophouse", { store: "florist", shop: "florist", sign: "花屋 POOLS", signColor: "#5cff9a", floors: 3 }, 30],
    ["shophouse", { store: "tea", shop: "tea", sign: "茶 NU7", signColor: "#b07bff", floors: 3 }, 30],
  ];
  let store = 0;

  /** The supertalls: round the park's east side and along its north edge. */
  const SUPERTALL: V[] = [
    ["office", { floors: 34, wall: "blue", crown: "#3ef0ff", spire: 40 }, 52],
    ["office", { floors: 40, wall: "dark", crown: "#f4b728", spire: 60, billboard: "ZEC", billboardColor: "#f4b728" }, 58],
    ["office", { floors: 30, wall: "violet", crown: "#ff3e8a", spire: 30 }, 46],
    ["office", { floors: 36, wall: "concrete", crown: "#b07bff", spire: 48, billboard: "零知識", billboardColor: "#b07bff" }, 52],
  ];
  const pick = (cx: number, cz: number, k: number): V => {
    const list = PALETTES[zoneAt(cx, cz)];
    return list[Math.floor(rnd(k) * list.length)];
  };
  const lampColor = (x: number) => (x < ST.heartW ? "#ffd9a0" : x > ST.heartE ? "#c9a0ff" : "#ffb46b");
  const lampAbs = (x: number, z: number, rot: number) => props.push({ type: "lamp", args: [lampColor(x)], x, z, rot, district: "downtown" });
  for (const { x0, x1, z0, z1, kind } of gridCells()) {
      if (kind !== "block") continue;
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      // every block is ringed by streets (the ring road runs round the outside)
      const south = true,
        north = true,
        east = true,
        west = true;
      // facing the park from the east and from the north: the supertalls
      const parkEast = x0 > ST.east1 && x0 < ST.east1 + 12 && z1 <= P.z1 + 0.1 && z0 >= P.z0 - 0.1;
      const parkNorth = z1 <= P.z0 - S2 && z1 > P.z0 - 14 && x0 >= P.x0 - 0.1 && x1 <= P.x1 + 0.1;
      let tall = 0,
        slot = 0;
      // the two rows facing the shōtengai street, along the heart
      const along = z0 >= CORE.minZ - 0.1 && z1 <= CORE.maxZ + 0.1;
      // the block west of the street fronts it with its east face, the block east with its west one
      const shotengaiFace = !along ? null : Math.abs(x1 - (ST.shotengai - S2 / 2)) < 0.1 ? "e" : Math.abs(x0 - (ST.shotengai + S2 / 2)) < 0.1 ? "w" : null;
      const fill = (face: BuildingJob["face"], a: number, b: number, front: number, main: boolean) => {
        let at = a;
        for (;;) {
          // every other one round the park is a supertall, the rest the usual towers
          const supertall = ((parkEast && face === "w") || (parkNorth && face === "s")) && slot++ % 2 === 0;
          const shop = shotengaiFace === face && store < STORES.length;
          const [type, opts, width] = shop ? STORES[store] : supertall ? SUPERTALL[tall++ % SUPERTALL.length] : pick(cx, cz, seq * 3.17 + 1);
          if (shop) {
            // a shop: placed on its own (clickable, walls-down), never instanced
            const w = width * VOX;
            if (at + w > b) break;
            store++;
            jobs.push({ id: id++, type, seed: 7000 + store, opts, along: at + w / 2, front, face, district: "downtown", frontRow: true, width });
            at += w + 0.05;
            continue;
          }
          const w = width * VOX;
          if (at + w > b) break;
          // a small pool of seeds: identical variants are built once and shared
          jobs.push({ id: id++, type, seed: 6000 + (seq++ % 2), opts, along: at + w / 2, front, face, district: "downtown", frontRow: main, width, ext: true });
          at += w + (rnd(seq + 0.7) < 0.12 ? 1.4 : 0.05);
        }
      };
      // the avenue's blocks get the neon (front row); the rest are the city around
      const onAvenue = (face: string) => (face === "s" && Math.abs(z1 - CITY.road.z0) < 0.1) || (face === "n" && Math.abs(z0 - CITY.road.z1) < 0.1);
      if (south) fill("s", x0 + PAVE, x1 - PAVE, z1 - PAVE, onAvenue("s"));
      // a shallow block still fronts its one street (the south bank faces the river)
      if (north && (z1 - z0 > DEEP * 2 + 2 || !south)) fill("n", x0 + PAVE, x1 - PAVE, z0 + PAVE, onAvenue("n"));
      // corners are left to the s/n rows; the shōtengai's shops squeeze a little closer
      const corner = shotengaiFace ? 6.2 : DEEP;
      const e0 = z0 + PAVE + (north ? corner : 0),
        e1 = z1 - PAVE - (south ? corner : 0);
      if (e1 - e0 > 5) {
        if (east) fill("e", e0, e1, x1 - PAVE, false);
        if (west && x1 - x0 > DEEP * 2 + 2) fill("w", e0, e1, x0 + PAVE, false);
      }
      // street lamps along the kerbs that face a street
      for (let x = x0 + 5; x < x1 - 3; x += 14) {
        if (south) lampAbs(x, z1 - 0.35, 0);
        if (north) lampAbs(x, z0 + 0.35, Math.PI);
      }
      for (let z = z0 + 9; z < z1 - 5; z += 14) {
        if (east) lampAbs(x1 - 0.35, z, Math.PI / 2);
        if (west) lampAbs(x0 + 0.35, z, -Math.PI / 2);
      }
  }
  // the park's own lamps along the kerb round it
  for (let x = P.x0 + 4; x < P.x1 - 2; x += 12) lampAbs(x, P.z1 - 0.35, 0), lampAbs(x, P.z0 + 0.35, Math.PI);
  for (let z = P.z0 + 6; z < P.z1 - 3; z += 12) lampAbs(P.x0 + 0.35, z, -Math.PI / 2), lampAbs(P.x1 - 0.35, z, Math.PI / 2);

  // ---- street trees along the boulevards and the ring road (both pavements) ----
  {
    const crossX = GRID.xs.map((x, i) => [x, GRID.xw[i] / 2] as const),
      crossZ = GRID.zs.map((z, i) => [z, GRID.zw[i] / 2] as const);
    const nearCross = (v: number, list: readonly (readonly [number, number])[]) => list.some(([c, h]) => Math.abs(v - c) < h + 5);
    const avenue = (z: number) => z > CITY.road.z0 - 4 && z < CITY.road.z1 + 4;
    const kinds: [string, number][] = [
      ["round", 3],
      ["maple", 17],
      ["round", 1],
      ["blossom", 9],
    ];
    let t = 0;
    for (const st of streetSegments()) {
      if (st.width < 10) continue;
      for (let a = st.from + 6; a < st.to - 4; a += 9) {
        if (st.axis === "x" ? nearCross(a, crossX) : nearCross(a, crossZ) || avenue(a) || (a > RIVER.z0 - 2 && a < RIVER.z1 + 2)) continue;
        for (const side of [-1, 1]) {
          const off = st.at + side * (st.width / 2 + 1.1);
          const [x, z] = st.axis === "x" ? [a, off] : [off, a];
          if (LOTS.some((l) => x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1)) continue;
          const [kind, seed] = kinds[t++ % kinds.length];
          props.push({ type: "tree", args: [kind, seed], x, z, rot: t, y: CURB, district: "downtown" });
          circles.push([x, z, 0.45]);
        }
      }
    }
  }

  // ---- the landmarks, each on its lot (or out on the water) ----
  /** Which way each lot's front faces (towards the street that matters). */
  const LOT_FACE: Partial<Record<LotKind, BuildingJob["face"]>> = { stadium: "s", museum: "e", foodhall: "n", reserve: "n", mall: "s", needle: "s", marina: "n", gardens: "n", port: "n", pyramid: "s", eiffel: "s", colosseum: "s", parliament: "s", shibuya: "e", zkorchard: "s", zksapling: "n", zkhalo: "s", binhai: "n" };
  /** The landmarks you can walk into, and the place each one opens. */
  const VENUE: Partial<Record<LotKind, string>> = { museum: "museum", reserve: "reserve", stadium: "stadium", mall: "mall", marina: "hotel", needle: "needle", pyramid: "pyramid", eiffel: "eiffel", colosseum: "colosseum", parliament: "bigben", gardens: "gardens", zkorchard: "tower-orchard", zksapling: "tower-sapling", zkhalo: "tower-halo", binhai: "library" };
  const landmarkJob = (kind: string, x0: number, x1: number, z0: number, z1: number, face: BuildingJob["face"], venue?: string, dy?: number) => {
    const ns = face === "s" || face === "n";
    const w = ns ? x1 - x0 : z1 - z0,
      d = ns ? z1 - z0 : x1 - x0;
    const front = face === "s" ? z1 : face === "n" ? z0 : face === "e" ? x1 : x0;
    const along = ns ? (x0 + x1) / 2 : (z0 + z1) / 2;
    jobs.push({ id: id++, type: "landmark", seed: 9000 + id, opts: { kind, w, d, ...(venue ? { venue } : {}), ...(dy ? { dy } : {}) }, along, front, face, district: "downtown", frontRow: false, width: Math.round(w * 6) });
  };
  for (const l of LOTS) if (LOT_FACE[l.kind]) landmarkJob(l.kind, l.x0, l.x1, l.z0, l.z1, LOT_FACE[l.kind]!, VENUE[l.kind]);
  {
    const L = BAY.liberty;
    landmarkJob("statue", L.x - 9, L.x + 9, L.z - 9, L.z + 9, "s", "statue");
    const B = BAY.bridge;
    landmarkJob("bridge", B.x - 7, B.x + 7, ST.ringS + 5, BAY.headland.z0 + 4, "n");
    // the Opera House on its own pier in the bay, facing the city (the headland is a forest: scene/forest)
    const O = BAY.opera;
    landmarkJob("opera", O.x0, O.x1, O.z0, O.z1, "n", "opera");
    const PL = BAY.palm;
    landmarkJob("palm", PL.x0, PL.x1, PL.z0, PL.z1, "n", "palm", 1.8);
    const A = BAY.arab;
    landmarkJob("burjalarab", A.x0, A.x1, A.z0, A.z1, "n", "arab", 1.8);
  }

  // ---- green: trees along the strips outside the ring road, the pocket parks ----
  const greenKinds: [string, number][] = [
    ["round", 2],
    ["maple", 11],
    ["blossom", 6],
    ["round", 4],
    ["pine", 9],
    ["maple", 23],
  ];
  let gk = 0;
  for (const c of gridCells()) {
    if (c.kind === "edge") {
      // a row of trees down the middle of the strip
      const long = c.x1 - c.x0 > c.z1 - c.z0;
      const len = long ? c.x1 - c.x0 : c.z1 - c.z0;
      for (let t = 3; t < len - 2; t += 7.5) {
        const [x, z] = long ? [c.x0 + t, (c.z0 + c.z1) / 2] : [(c.x0 + c.x1) / 2, c.z0 + t];
        const [kind, seed] = greenKinds[gk++ % greenKinds.length];
        props.push({ type: "tree", args: [kind, seed], x, z, rot: gk, y: CURB, district: "downtown" });
        circles.push([x, z, 0.5]);
      }
    } else if (c.kind === "lot" && c.lot === "green") {
      // a square: a lawn, a ring of trees, benches round a fountain
      const cx = (c.x0 + c.x1) / 2,
        cz = (c.z0 + c.z1) / 2;
      props.push({ type: "tieredFountain", args: [], x: cx, z: cz, rot: 0, y: CURB + 0.06, district: "downtown" });
      circles.push([cx, cz, 3.6]);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        props.push({ type: "bench", args: [], x: cx + Math.cos(ang) * 5.6, z: cz + Math.sin(ang) * 5.6, rot: -ang - Math.PI / 2, y: CURB, district: "downtown" });
      }
      for (let x = c.x0 + 2.5; x < c.x1 - 1; x += 4.2)
        for (let z = c.z0 + 2.5; z < c.z1 - 1; z += 4.2) {
          if (Math.hypot(x - cx, z - cz) < 8.5) continue;
          const [kind, seed] = greenKinds[gk++ % greenKinds.length];
          props.push({ type: "tree", args: [kind, seed], x: x + (rnd(gk) - 0.5) * 1.4, z: z + (rnd(gk + 3) - 0.5) * 1.4, rot: gk, y: CURB, district: "downtown" });
        }
    }
  }

  // ---- Central Park ----
  const addAbs = (type: string, args: unknown[], x: number, z: number, rot = 0, y?: number) => props.push({ type, args, x, z, rot, y, district: "downtown" });
  const nearPath = (x: number, z: number, d: number) =>
    PARK.paths.some((pl) =>
      pl.some((p, k) => {
        if (!k) return false;
        const [ax, az] = pl[k - 1],
          [bx, bz] = p;
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
        return Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))) < d;
      }),
    );
  const inEllipse = (x: number, z: number, e: { x: number; z: number; rx: number; rz: number }, pad: number) => ((x - e.x) / (e.rx + pad)) ** 2 + ((z - e.z) / (e.rz + pad)) ** 2 < 1;
  const L = PARK.lake;
  circles.push([L.x - 11, L.z, 9], [L.x, L.z, 10], [L.x + 11, L.z, 9]);
  addAbs("tieredFountain", [], PARK.fountain.x, PARK.fountain.z, 0, CURB + 0.06);
  jobs.push({ id: id++, type: "pavilion", seed: 777, opts: { sign: "BANDSTAND" }, along: PARK.bandstand.x, front: PARK.bandstand.z, face: "s", district: "downtown", frontRow: false, width: 40 });
  addAbs("tree", ["pine", 9], PARK.island.x, PARK.island.z, 0, CURB);
  // elms along the Mall, benches between them
  for (let z = -52; z > -75; z -= 4.5) {
    addAbs("tree", ["round", 2 + (Math.round(-z) % 3)], -2.6, z, z);
    addAbs("tree", ["round", 2 + (Math.round(-z + 1) % 3)], 2.6, z, -z);
    if (Math.round(-z) % 9 < 5) addAbs("bench", [], -1.9, z - 2.2, Math.PI / 2), addAbs("bench", [], 1.9, z - 2.2, -Math.PI / 2);
  }
  // lamps and benches along the paths
  PARK.paths.forEach((pl, pi) =>
    pl.forEach((p, k) => {
      if (!k) return;
      const [ax, az] = pl[k - 1],
        [bx, bz] = p;
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len,
        nzz = (bx - ax) / len;
      for (let t = 6; t < len - 3; t += 13) {
        const x = ax + ((bx - ax) * t) / len,
          z = az + ((bz - az) * t) / len;
        if (pi === 0) continue;
        addAbs("lamp", ["#ffe2b0"], x + nx * 1.8, z + nzz * 1.8, Math.atan2(nx, nzz) + Math.PI);
        if ((k + Math.round(t)) % 3 === 0) addAbs("bench", [], x - nx * 2, z - nzz * 2, Math.atan2(nx, nzz));
      }
    }),
  );
  // the woods: trees wherever there is no path, water, lawn or terrace
  const kinds: [string, number][] = [
    ["round", 1],
    ["round", 3],
    ["maple", 11],
    ["blossom", 5],
    ["pine", 8],
    ["maple", 23],
    ["blossom", 7],
    ["round", 4],
  ];
  for (let k = 0; k < 900 && jobs.length < 99999; k++) {
    const x = P.x0 + 3 + rnd(k * 2.1) * (P.x1 - P.x0 - 6),
      z = P.z0 + 3 + rnd(k * 3.7 + 9) * (P.z1 - P.z0 - 6);
    if (nearPath(x, z, 3.2) || inEllipse(x, z, L, 3) || inEllipse(x, z, PARK.meadow, 0) || Math.hypot(x - PARK.fountain.x, z - PARK.fountain.z) < 9 || Math.hypot(x - PARK.bandstand.x, z - PARK.bandstand.z) < 8) continue;
    if (circles.some(([cx, cz, r]) => r < 1.5 && Math.hypot(x - cx, z - cz) < 3.4)) continue;
    const [kind, seed] = kinds[k % kinds.length];
    addAbs("tree", [kind, seed], x, z, k);
    circles.push([x, z, 0.5]);
    if (circles.length > 400) break;
  }

  return {
    jobs,
    props,
    rects: rects.map(([x0, z0, x1, z1], i) => (i < heartRects ? [x0, nz(z0), x1, nz(z1)] : [x0, z0, x1, z1]) as [number, number, number, number]),
    circles: circles.map(([x, z, r], i) => (i < heartCircles ? [x, nz(z), r] : [x, z, r]) as [number, number, number]),
  };
}

export type CellKind = "core" | "park" | "block" | "lot" | "edge";
export interface Cell {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: CellKind;
  lot?: LotKind;
}

type Rect = { x0: number; x1: number; z0: number; z1: number };
const inside = (c: Rect, r: Rect) => c.x0 >= r.x0 - 0.1 && c.x1 <= r.x1 + 0.1 && c.z0 >= r.z0 - 0.1 && c.z1 <= r.z1 + 0.1;
const HEART: Rect = { x0: CORE.minX, x1: CORE.maxX, z0: CORE.minZ, z1: CORE.maxZ };

/**
 * The city's blocks between its streets: the heart (the original board), the park, the landmarks'
 * lots (one cell each), the thin strips outside the ring road, and the ordinary blocks.
 */
export function gridCells(): Cell[] {
  const xb = [CITY.minX, ...GRID.xs.flatMap((x, i) => [x - GRID.xw[i] / 2, x + GRID.xw[i] / 2]), CITY.maxX];
  const zb = [CITY.minZ, ...GRID.zs.flatMap((z, i) => [z - GRID.zw[i] / 2, z + GRID.zw[i] / 2]), BAY.z0];
  const xi: [number, number][] = [];
  const zi: [number, number][] = [];
  for (let k = 0; k < xb.length; k += 2) xi.push([xb[k], xb[k + 1]]);
  for (let k = 0; k < zb.length; k += 2) {
    // the heart's row is split by the avenue, which carries on across the city
    if (zb[k] === CORE.minZ) zi.push([CORE.minZ, CITY.road.z0], [CITY.road.z1, CORE.maxZ]);
    else zi.push([zb[k], zb[k + 1]]);
  }
  const out: Cell[] = [];
  for (const [x0, x1] of xi)
    for (const [z0, z1] of zi) {
      const c = { x0, x1, z0, z1 };
      if (LOTS.some((l) => inside(c, l))) continue;
      const kind: CellKind = inside(c, HEART) ? "core" : inside(c, GRID.park) ? "park" : x1 - x0 < 7 || z1 - z0 < 7 ? "edge" : "block";
      out.push({ ...c, kind });
    }
  for (const l of LOTS) out.push({ x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, kind: "lot", lot: l.kind });
  return out;
}

/**
 * Every stretch of street to pave: the ring, the boulevards and the grid, broken where a lot
 * swallows a street, where the river runs (bridges excepted) and inside the heart.
 */
export function streetSegments() {
  const out: { axis: "x" | "z"; at: number; from: number; to: number; width: number }[] = [];
  const xEnd = GRID.xs[GRID.xs.length - 1] + GRID.xw[GRID.xw.length - 1] / 2;
  const zTop = GRID.zs[0] - GRID.zw[0] / 2;
  const zEnd = GRID.zs[GRID.zs.length - 1] + GRID.zw[GRID.zw.length - 1] / 2;
  /** Cut [from, to] by the intervals in `holes`. */
  const cut = (from: number, to: number, holes: [number, number][]) => {
    const parts: [number, number][] = [];
    let a = from;
    for (const [h0, h1] of holes.filter(([h0, h1]) => h1 > from && h0 < to).sort((p, q) => p[0] - q[0])) {
      if (h0 > a) parts.push([a, h0]);
      a = Math.max(a, h1);
    }
    if (a < to) parts.push([a, to]);
    return parts;
  };
  GRID.zs.forEach((z, i) => {
    if (z === ST.river) return;
    const w = GRID.zw[i];
    const holes = LOTS.filter((l) => z > l.z0 && z < l.z1).map((l) => [l.x0, l.x1] as [number, number]);
    for (const [a, b] of cut(-xEnd, xEnd, holes)) out.push({ axis: "x", at: z, from: a, to: b, width: w });
  });
  GRID.xs.forEach((x, i) => {
    const w = GRID.xw[i];
    const holes = LOTS.filter((l) => x > l.x0 && x < l.x1).map((l) => [l.z0, l.z1] as [number, number]);
    if (!RIVER.bridges.includes(x)) holes.push([RIVER.z0, RIVER.z1]);
    // the heart's own side streets take over between its north and south streets
    if (x > CORE.minX && x < CORE.maxX) holes.push([CORE.minZ, CORE.maxZ]);
    for (const [a, b] of cut(zTop, zEnd, holes)) out.push({ axis: "z", at: x, from: a, to: b, width: w });
  });
  return out;
}

/** What a block is zoned for, by where it is (SimCity style). */
export type Zone = "midtown" | "parkside" | "uptown" | "west" | "westres" | "finance" | "eastcom" | "south" | "southbank" | "marina" | "port";
export function zoneAt(cx: number, cz: number): Zone {
  if (cz > RIVER.z1) return cx < ST.blvdW ? "port" : cx > ST.blvdE ? "marina" : "southbank";
  // round the heart everything stays mid-rise, so the default view sees over it; Wall Street's
  // towers stand past the east boulevard
  // (the block south of the ZK Mall stays low, so the camera sees the mall's front over it)
  if (cz > CITY.road.z1) return cx > ST.blvdE && cx < 194 ? "south" : cx > ST.blvdE ? "finance" : cx > ST.heartE ? "eastcom" : cx < ST.blvdW ? "westres" : cx < ST.heartW ? "west" : "south";
  if (cz > CORE.minZ - 0.1) return cx > ST.blvdE ? "finance" : cx > ST.heartE ? "eastcom" : cx < ST.blvdW ? "westres" : "west";
  if (cz < ST.blvdN) return cx > ST.blvdE ? "midtown" : "uptown";
  if (cx > ST.heartE) return "midtown";
  return cx < ST.blvdW ? "westres" : "parkside";
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
