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
export const TUNNEL = { mouth: 152, depth: 12, inside: 160, hideBeyond: 157 };

/** The original board, the hand-made heart of the city, now in the middle of a bigger one. */
export const CORE = { minX: -50, maxX: 50, minZ: -36 - SHIFT, maxZ: 32 };

/**
 * The bigger city around it: a grid of 8 m streets (centres below; the avenue carries on across),
 * Central Park north of the heart, and blocks built up along every street they face.
 */
export const GRID = {
  street: 8,
  xs: [-86, -54, 54, 86],
  zs: [-120, CORE.minZ - 4, CORE.maxZ + 4, 68],
  /** Width of each east–west line: the last one is the river. */
  zw: [8, 8, 8, 18],
  park: { x0: -50, x1: 50, z0: -116, z1: CORE.minZ - 8 },
};

/** The river across the south of the city: its banks (z), water level, and the bridges' x. */
export const RIVER = { z0: 59, z1: 77, water: -1.1, bed: -2.2, bridges: [-86, -54, 54, 86], foot: [0, -24, 24] };

/** The covered shopping street: the street at x = -86 along the heart, under a canopy. */
export const SHOTENGAI = { x: -86, z0: -39.4 + 1, z1: 32 - 1, half: 4 + 2.6 };

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
  minX: -118,
  maxX: 118,
  minZ: -136,
  maxZ: 92,
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
  const PALETTES: Record<string, V[]> = {
    midtown: [
      ["office", { floors: 22, wall: "blue" }, 42],
      ["office", { floors: 18 }, 46],
      ["office", { floors: 20, wall: "violet", billboard: "ZEC", billboardColor: "#f4b728" }, 40],
      ["office", { floors: 16 }, 40],
      ["apartment", { floors: 12 }, 44],
      ["office", { floors: 19, billboard: "証明", billboardColor: "#3ef0ff" }, 46],
    ],
    parkside: [
      ["apartment", { floors: 12 }, 44],
      ["apartment", { floors: 10, wall: "tile" }, 50],
      ["office", { floors: 16 }, 46],
      ["apartment", { floors: 14 }, 42],
      ["office", { floors: 18, wall: "blue" }, 40],
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
    // south of the avenue the camera looks over the roofs: low-rise only
    south: [
      ["shophouse", { floors: 3, shop: "cafe" }, 36],
      ["apartment", { floors: 4 }, 44],
      ["house", {}, 34],
      ["shophouse", { floors: 4, shop: "shutter", vsign: "未来" }, 46],
      ["izakaya", {}, 32],
      ["machiya", { shop: "tea" }, 26],
    ],
    eastlow: [
      ["apartment", { floors: 5 }, 44],
      ["shophouse", { floors: 4, shop: "cafe", vsign: "証明" }, 46],
      ["izakaya", {}, 32],
      ["shophouse", { floors: 3, shop: "shutter" }, 36],
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
    const southOfAvenue = cz > CITY.road.z1;
    // next to the metro's loop everything stays low, so the line and its trains show; Midtown's
    // towers start a block further east
    const byMetro = cx > GRID.xs[2] && cx < GRID.xs[3];
    const list = cz > 60 ? PALETTES.port : southOfAvenue ? (cx > 54 ? PALETTES.eastlow : cx < -54 ? PALETTES.west : PALETTES.south) : byMetro ? PALETTES.eastlow : cx > 54 ? PALETTES.midtown : cz < P.z0 ? PALETTES.parkside : cx < -54 ? PALETTES.west : PALETTES.parkside;
    return list[Math.floor(rnd(k) * list.length)];
  };
  const lampColor = (x: number) => (x < -54 ? "#ffd9a0" : x > 54 ? "#c9a0ff" : "#ffb46b");
  const lampAbs = (x: number, z: number, rot: number) => props.push({ type: "lamp", args: [lampColor(x)], x, z, rot, district: "downtown" });
  for (const { x0, x1, z0, z1, kind } of gridCells()) {
      if (kind !== "block") continue;
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      const south = z1 < CITY.maxZ,
        north = z0 > CITY.minZ,
        east = x1 < CITY.maxX,
        west = x0 > CITY.minX;
      // facing the park from the east and from the north: the supertalls
      const parkEast = x0 > GRID.xs[3] && x0 < GRID.xs[3] + 12 && z1 <= P.z1 + 0.1 && z0 >= P.z0 - 0.1;
      const parkNorth = z1 <= P.z0 - S2 && z1 > P.z0 - 14 && x0 >= P.x0 - 0.1 && x1 <= P.x1 + 0.1;
      let tall = 0,
        slot = 0;
      // the two rows facing the shōtengai street, along the heart
      const along = z0 >= CORE.minZ - 0.1 && z1 <= CORE.maxZ + 0.1;
      // the block west of the street fronts it with its east face, the block east with its west one
      const shotengaiFace = !along ? null : Math.abs(x1 - (GRID.xs[0] - S2 / 2)) < 0.1 ? "e" : Math.abs(x0 - (GRID.xs[0] + S2 / 2)) < 0.1 ? "w" : null;
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
          jobs.push({ id: id++, type, seed: 6000 + (seq++ % 3), opts, along: at + w / 2, front, face, district: "downtown", frontRow: main, width, ext: true });
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
    rects: rects.map(([x0, z0, x1, z1]) => [x0, nz(z0), x1, nz(z1)] as [number, number, number, number]),
    circles: circles.map(([x, z, r]) => [x, nz(z), r] as [number, number, number]),
  };
}

/** The bigger city's blocks between its streets: the heart (the original board), the park, the rest. */
export function gridCells() {
  const S = GRID.street / 2;
  const xb = [CITY.minX, ...GRID.xs.flatMap((x) => [x - S, x + S]), CITY.maxX];
  const zb = [CITY.minZ, ...GRID.zs.flatMap((z, i) => [z - GRID.zw[i] / 2, z + GRID.zw[i] / 2]), CITY.maxZ];
  const xi: [number, number][] = [];
  const zi: [number, number][] = [];
  for (let k = 0; k < xb.length; k += 2) xi.push([xb[k], xb[k + 1]]);
  for (let k = 0; k < zb.length; k += 2) {
    // the heart's row is split by the avenue, which carries on across the city
    if (zb[k] === CORE.minZ) zi.push([CORE.minZ, CITY.road.z0], [CITY.road.z1, CORE.maxZ]);
    else zi.push([zb[k], zb[k + 1]]);
  }
  const P = GRID.park;
  const out: { x0: number; x1: number; z0: number; z1: number; kind: "core" | "park" | "block" }[] = [];
  for (const [x0, x1] of xi)
    for (const [z0, z1] of zi) {
      const inCore = x0 >= CORE.minX - 0.1 && x1 <= CORE.maxX + 0.1 && z0 >= CORE.minZ - 0.1 && z1 <= CORE.maxZ + 0.1;
      const inPark = x0 >= P.x0 - 0.1 && x1 <= P.x1 + 0.1 && z0 >= P.z0 - 0.1 && z1 <= P.z1 + 0.1;
      out.push({ x0, x1, z0, z1, kind: inCore ? "core" : inPark ? "park" : "block" });
    }
  return out;
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
