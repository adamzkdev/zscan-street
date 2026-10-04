import { body, roofClutter, warehouse, type Built } from "./buildings";
import { C, E, G, hash, rand, shades, VoxelModel } from "./model";
import { lantern, P, roofAC, tiledRoof, verticalSignBox, type SignSpot } from "./parts";

/**
 * The MEMPOOL shop: the convenience-store chain where zkSNARKs pick up transactions. A real
 * interior you can look into: aisles of shelves, fridges at the back, and a pickup counter by the
 * door where the delivered parcels wait (the parcels themselves are live meshes, not voxels).
 */
export function mempoolShop(seed: number, o: { district?: string } = {}): Built {
  const W = 48,
    D = 36,
    H = 24;
  const { m, x0, x1, fz } = body(W, D, H);
  const wall = o.district === "sapling" ? shades(["#6a4a34", "#5e4230", "#704e38"], 2, seed) : shades(["#d8d2c4", "#d2ccbe", "#ddd7ca"], 2, seed);
  // shell: walls two voxels thick, hollow inside
  m.box(x0, 0, 0, x1, H, D, wall);
  m.clear(x0 + 2, 1, 2, x1 - 2, H - 4, D - 1);
  m.box(x0 + 2, 0, 2, x1 - 2, 1, D - 1, shades(["#c8c4bc", "#bebab2"], 3, seed + 1));
  m.box(x0 + 2, H - 4, 2, x1 - 2, H - 3, D - 1, C("#9a968e"));
  // inside walls a shade darker than the street side
  m.paint(x0 + 2, 1, 2, x0 + 3, H - 4, D - 1, C("#a8a296"));
  m.paint(x1 - 3, 1, 2, x1 - 2, H - 4, D - 1, C("#a8a296"));
  // ceiling light panels (soft, not a lightbox)
  for (let x = x0 + 6; x < x1 - 6; x += 9) for (const z of [9, 18, 27]) m.box(x, H - 4, z, x + 5, H - 3, z + 2, E("#f4f0e8", 0.9));
  // glass front: low kick plate, mullions, a wide door in the middle
  const doorX0 = x0 + Math.floor(W / 2) - 4;
  m.box(x0 + 2, 0, D - 1, x1 - 2, H - 7, D, 0);
  for (let x = x0 + 2; x < x1 - 2; x++) m.set(x, 0, D - 1, P.metal);
  for (let x = x0 + 2; x <= x1 - 2; x += 7) if (x < doorX0 - 1 || x > doorX0 + 8) m.box(x, 0, D - 1, x + 1, H - 7, D, P.frame);
  m.box(doorX0 - 1, 0, D - 1, doorX0, H - 7, D, P.frame);
  m.box(doorX0 + 8, 0, D - 1, doorX0 + 9, H - 7, D, P.frame);
  m.box(x0 + 2, H - 8, D - 1, x1 - 2, H - 7, D, P.frame);
  // fascia: the chain's colours, orange over teal, with a lit band
  m.box(x0 - 1, H - 7, D - 1, x1 + 1, H, D + 1, C("#ece8e0"));
  m.box(x0 - 1, H - 7, D + 1, x1 + 1, H - 6, D + 2, E("#ff9f2e", 1.1));
  m.box(x0 - 1, H - 2, D + 1, x1 + 1, H - 1, D + 2, E("#3ec9b0", 1.0));
  // aisles: three shelving runs parallel to the front. The side facing the door is the block
  // shelf (recent blocks are live meshes placed on it); the back side keeps a few groceries.
  const goods = ["#d0504a", "#4a9ad0", "#d0b04a", "#6ac06a", "#d07ab0", "#e8e8e8", "#9070d0", "#e08a3a"];
  for (const z of [10, 17, 24]) {
    m.box(x0 + 8, 1, z, x1 - 16, 10, z + 2, C("#3a3842"));
    // three thin boards stick out on the block side, a lit strip under each
    for (const y of [1, 4, 7]) {
      m.box(x0 + 8, y, z + 2, x1 - 16, y + 1, z + 5, C("#6a6774"));
      m.box(x0 + 8, y, z + 5, x1 - 16, y + 1, z + 6, C("#2a2830"));
    }
    m.box(x0 + 8, 9, z - 1, x1 - 16, 10, z + 3, C("#2a2830"));
    m.box(x0 + 7, 1, z - 1, x0 + 8, 10, z + 6, C("#2a2830"));
    m.box(x1 - 16, 1, z - 1, x1 - 15, 10, z + 6, C("#2a2830"));
    for (let y = 2; y < 10; y += 2)
      for (let x = x0 + 8; x < x1 - 16; x++) {
        if (hash(x, y, z, seed) < 0.3) continue;
        m.set(x, y, z - 1, C(goods[Math.floor(hash(x, y, z, seed + 1) * goods.length)]));
      }
  }
  // fridges along the back wall, glass doors with a cool light
  m.box(x0 + 2, 1, 2, x1 - 2, 14, 5, C("#3a3f4a"));
  for (let x = x0 + 3; x < x1 - 3; x += 5) {
    m.box(x, 2, 5, x + 4, 13, 6, G("#7a9ab8"));
    for (let y = 3; y < 13; y += 3) for (let xx = x; xx < x + 4; xx++) m.set(xx, y, 4, E(goods[(xx + y) % goods.length], 0.75));
  }
  m.box(x0 + 2, 13, 5, x1 - 2, 14, 6, E("#cfe8ff", 1.0));
  // the pickup counter by the door (right side), a till, and the parcel rack behind it
  const cx0 = x1 - 14,
    cx1 = x1 - 3;
  m.box(cx0, 1, D - 12, cx1, 7, D - 9, C("#5a4a3c"));
  m.box(cx0, 7, D - 12, cx1, 8, D - 9, C("#d8d0c0"));
  m.box(cx1 - 4, 8, D - 11, cx1 - 2, 10, D - 10, C("#2a2a30"));
  m.box(cx1 - 4, 10, D - 11, cx1 - 2, 11, D - 10, E("#59e3ff", 1.0));
  m.box(cx0, 1, D - 20, cx1, 14, D - 18, C("#6a5a4a"));
  for (let y = 5; y < 14; y += 4) m.box(cx0, y, D - 18, cx1, y + 1, D - 17, C("#8a7a6a"));
  // magazine rack and an ATM by the window
  m.box(x0 + 3, 1, D - 4, x0 + 13, 6, D - 2, C("#4a4656"));
  for (let x = x0 + 3; x < x0 + 13; x += 2) m.box(x, 6, D - 3, x + 2, 9, D - 2, C(goods[x % goods.length]));
  m.box(x0 + 3, 1, D - 9, x0 + 6, 12, D - 6, C("#3a5a8a"));
  m.box(x0 + 3, 8, D - 6, x0 + 6, 10, D - 5, E("#9fd8ff", 1.0));
  // outside: bins, umbrella stand, a lit menu of the day
  m.box(x0 + 1, 0, D + 1, x0 + 4, 5, D + 3, C("#3a6a9a"));
  m.box(x0 + 5, 0, D + 1, x0 + 8, 5, D + 3, C("#4a8a4a"));
  m.box(x0 + 9, 0, D + 1, x0 + 12, 5, D + 3, C("#9a7a3a"));
  m.box(x1 - 4, 0, D + 1, x1 - 2, 4, D + 2, C("#2a2830"));
  roofClutter(m, x0, x1, D, H, seed, { tank: false, stairs: false });
  for (let x = x0 + 6; x < x1 - 8; x += 13) roofAC(m, x, H, 8, true);
  const signs: SignSpot[] = [{ text: "MEMPOOL", color: "#ff9f2e", x: x0 + W / 2, y: H - 3.5, z: D + 1.05, w: 30, h: 4.6, vertical: false, facing: "front" }];
  return {
    model: m,
    signs,
    door: [doorX0 + 4, fz + 2],
    body: [x0, 0, x1, D],
    lights: [[x0 + W / 2, 16, D - 14, "#eef2ff"]],
    walls: [
      [x0, 0, x1, 2],
      [x0, 0, x0 + 2, D],
      [x1 - 2, 0, x1, D],
      [x0, D - 1, doorX0 - 1, D],
      [doorX0 + 9, D - 1, x1, D],
      [x0 + 7, 9, x1 - 15, 30],
      [cx0, D - 12, cx1, D - 9],
      [cx0, D - 20, cx1, D - 17],
      [x0 + 2, 2, x1 - 2, 6],
    ],
    points: {
      // inside the door, in front of the counter, behind the counter (shopkeeper), the parcel rack
      inside: [doorX0 + 4, 0, D - 4],
      counter: [cx0 + 4, 0, D - 7],
      keeper: [cx0 + 6, 0, D - 15],
      rack: [cx0 + 5, 5, D - 17],
      // the block shelves: each run's left and right ends, on its lowest board
      shelf0a: [x0 + 9, 2, 28],
      shelf0b: [x1 - 17, 2, 28],
      shelf1a: [x0 + 9, 2, 21],
      shelf1b: [x1 - 17, 2, 21],
      shelf2a: [x0 + 9, 2, 14],
      shelf2b: [x1 - 17, 2, 14],
      // a corner camera high above the magazine rack, looking at the counter
      camPos: [x0 + 4, H - 6, D - 3],
      camLook: [cx0 + 4, 5, D - 14],
    },
  };
}

/** Kyoto-style townhouse: timber lattice front, a tiled eave, an upper floor with slatted windows. */
export function machiya(seed: number, o: { shop?: "tea" | "ramen" | null; sign?: string; width?: number } = {}): Built {
  const r = rand(seed);
  const W = o.width ?? 26,
    D = 30,
    gh = 17,
    H = gh + 14;
  const { m, x0, x1, fz } = body(W, D, H);
  m.box(x0, 0, 0, x1, H, D, P.wood);
  m.box(x0, 0, 0, x1, 2, D, C("#5a5450"));
  // ground floor: lattice screens over a lit room, a sliding entrance
  const doorX = x0 + (r() > 0.5 ? 3 : W - 10);
  m.clear(x0 + 2, 2, D - 3, x1 - 2, gh - 3, D);
  m.box(x0 + 2, 2, D - 4, x1 - 2, gh - 3, D - 3, o.shop ? E("#ffc890", 1.0) : E("#e8b878", 0.75));
  for (let x = x0 + 2; x < x1 - 2; x += 2) if (x < doorX || x >= doorX + 7) m.box(x, 2, D - 2, x + 1, gh - 3, D - 1, C("#3a2618"));
  m.box(doorX, 2, D - 3, doorX + 7, gh - 3, D - 2, o.shop ? 0 : C("#4a3222"));
  if (!o.shop) m.box(doorX + 1, 6, D - 3, doorX + 6, gh - 5, D - 2, E("#f0c890", 0.7));
  // tiled eave over the ground floor
  const tile = shades(["#3a3a46", "#34343e", "#40404c"], 1, seed);
  for (let k = 0; k < 4; k++) m.box(x0 - 1, gh - 1 - Math.floor(k / 2), D + k - 1, x1 + 1, gh - Math.floor(k / 2), D + k, tile);
  // upper floor: mushiko slatted window, plaster panel
  m.box(x0 + 1, gh, D - 1, x1 - 1, H - 2, D, shades(["#d8cfbe", "#d2c9b8"], 2, seed));
  m.box(x0 + 4, gh + 3, D - 2, x1 - 4, gh + 9, D, C("#2e2018"));
  for (let x = x0 + 4; x < x1 - 4; x += 2) m.box(x + 1, gh + 3, D - 1, x + 2, gh + 9, D, r() > 0.4 ? E("#e8a860", 0.8) : C("#1a1410"));
  tiledRoof(m, x0, x1, 0, D, H, tile);
  // shop extras: noren, a lantern, a bench outside
  if (o.shop) {
    for (let x = doorX - 1; x < doorX + 8; x += 3) m.box(x, gh - 9, D, x + 2, gh - 3, D + 1, C(o.shop === "tea" ? "#3a5a3a" : "#2a3a6a"));
    lantern(m, x1 - 5, gh - 9, fz + 1);
    m.box(x0 + 2, 0, fz + 1, x0 + 10, 3, fz + 3, P.woodLight);
  } else {
    m.box(doorX + 8, 0, fz, doorX + 10, 2, fz + 2, P.pot);
    m.blob(doorX + 9, 3, fz + 1, 1.8, P.leaf, 0.3, seed);
  }
  const signs: SignSpot[] = o.sign && o.shop ? [{ text: o.sign, color: "#ffb347", x: x0 + W / 2, y: gh + 11, z: D + 0.1, w: W - 8, h: 4, vertical: false, facing: "front" }] : [];
  return { model: m, signs, door: [doorX + 3.5, fz + 2], body: [x0, 0, x1, D], lights: o.shop ? [[x0 + W / 2, 8, fz + 2, "#ffc890"]] : [] };
}

/** A neighbourhood shrine: red torii, stone path and lanterns, a hall under a big curved roof. */
export function shrine(seed: number): Built {
  const W = 60,
    D = 60,
    H = 34;
  const m = new VoxelModel(W + 14, H + 10, D + 9);
  const x0 = 7,
    x1 = 7 + W;
  m.box(x0, 0, 0, x1, 1, D, shades(["#5a5848", "#545244", "#5e5c4c"], 2, seed));
  // gravel courtyard and the stone path to the hall
  m.box(x0 + 26, 1, 20, x0 + 34, 2, D, shades(["#9a968c", "#8e8a80"], 2, seed + 1));
  // the hall
  const hx0 = x0 + 14,
    hx1 = x1 - 14;
  m.box(hx0, 1, 4, hx1, 4, 22, C("#7a7266"));
  m.box(hx0 + 2, 4, 6, hx1 - 2, 18, 20, C("#7a2e22"));
  m.box(hx0 + 4, 4, 19, hx1 - 4, 15, 21, C("#3a1e16"));
  for (let x = hx0 + 4; x < hx1 - 4; x += 3) m.box(x, 5, 20, x + 1, 15, 21, C("#c8a060"));
  m.box(hx0 + 12, 4, 20, hx1 - 12, 14, 21, E("#ffc070", 0.9));
  // big roof with upturned eaves
  const tile = shades(["#2a3a34", "#26342e", "#2e403a"], 1, seed + 2);
  for (let k = 0; k < 10; k++) m.box(hx0 - 6 + k, 18 + k, 0 + Math.floor(k * 0.7), hx1 + 6 - k, 19 + k, 26 - Math.floor(k * 0.7), tile);
  m.box(hx0 - 7, 18, 0, hx0 - 5, 20, 26, tile);
  m.box(hx1 + 5, 18, 0, hx1 + 7, 20, 26, tile);
  m.box(hx0 + 2, 28, 6, hx1 - 2, 30, 20, C("#c8a040"));
  // offering box and a rope with paper streamers
  m.box(x0 + 26, 1, 23, x0 + 34, 5, 26, P.woodLight);
  m.box(hx0 + 4, 16, 21, hx1 - 4, 17, 22, C("#e8d8a8"));
  // torii at the front
  const red = C("#c0302a");
  for (const x of [x0 + 22, x0 + 37]) m.box(x, 1, D - 4, x + 2, 26, D - 2, red);
  m.box(x0 + 18, 26, D - 5, x0 + 42, 28, D - 1, C("#1e1a1c"));
  m.box(x0 + 20, 22, D - 4, x0 + 40, 24, D - 2, red);
  // stone lanterns along the path and a sacred tree with its rope
  for (const z of [30, 42]) for (const x of [x0 + 22, x0 + 37]) {
    m.box(x, 1, z, x + 3, 6, z + 3, C("#8a8680"));
    m.box(x - 1, 6, z - 1, x + 4, 7, z + 4, C("#7a7670"));
    m.box(x, 7, z, x + 3, 9, z + 3, E("#ffcf7a", 1.2));
    m.box(x - 1, 9, z - 1, x + 4, 10, z + 4, C("#8a8680"));
  }
  m.box(x0 + 6, 1, 32, x0 + 9, 22, 35, P.trunk);
  m.blob(x0 + 7.5, 26, 33.5, 8, shades(["#1f4a33", "#285a3a", "#1a402c"], 1, seed + 3), 0.3, seed);
  m.box(x0 + 5, 12, 31, x0 + 10, 13, 36, C("#e8d8a8"));
  // low wall around the precinct
  for (const [a, b, c2, d2] of [
    [x0, 0, x1, 1],
    [x0, 0, x0 + 1, D],
    [x1 - 1, 0, x1, D],
    [x0, D - 1, x0 + 18, D],
    [x0 + 42, D - 1, x1, D],
  ])
    m.box(a, 1, b, c2, 4, d2, C("#b8b0a0"));
  return {
    model: m,
    signs: [],
    door: [x0 + 30, D + 2],
    body: [hx0, 4, hx1, 22],
    lights: [[x0 + 30, 10, 24, "#ffc070"]],
    walls: [
      [hx0, 4, hx1, 22],
      [x0 + 6, 32, x0 + 9, 35],
    ],
  };
}

/** A tower going up: fenced site, concrete frame in scaffolding, a tower crane, a site cabin. */
export function construction(seed: number): Built {
  const W = 84,
    D = 60,
    H = 80;
  const m = new VoxelModel(W + 14, H + 30, D + 9);
  const x0 = 7,
    x1 = 7 + W;
  const r = rand(seed);
  m.box(x0, 0, 0, x1, 1, D, shades(["#5a5048", "#544a42", "#5e544c"], 3, seed));
  // site fence with hazard stripes
  const fence = (x: number, z: number) => ((x + z) % 6 < 3 ? C("#e8c040") : C("#2a2a30"));
  m.box(x0, 1, 0, x1, 9, 1, fence);
  m.box(x0, 1, 0, x0 + 1, 9, D, fence);
  m.box(x1 - 1, 1, 0, x1, 9, D, fence);
  m.box(x0, 1, D - 1, x0 + 30, 9, D, fence);
  m.box(x0 + 44, 1, D - 1, x1, 9, D, fence);
  // the frame: columns and slabs, four floors up, the top one still open
  const fx0 = x0 + 8,
    fx1 = x0 + 50,
    fz0 = 6,
    fz1 = 40;
  for (let f = 0; f < 5; f++) {
    const y = 1 + f * 14;
    if (f < 4) m.box(fx0, y + 13, fz0, fx1, y + 14, fz1, C("#9a968e"));
    for (let x = fx0; x <= fx1 - 2; x += 10) for (const z of [fz0, fz1 - 2]) if (f < 4 || r() > 0.4) m.box(x, y, z, x + 2, y + 13, z + 2, C("#a8a49c"));
  }
  // scaffolding on the street side with planks and green netting
  for (let y = 1; y < 58; y += 7) {
    m.box(fx0 - 4, y, fz1 + 1, fx1 + 4, y + 1, fz1 + 4, C("#8a6a40"));
    for (let x = fx0 - 4; x <= fx1 + 4; x += 6) m.box(x, y, fz1 + 3, x + 1, y + 7, fz1 + 4, C("#7a7a84"));
  }
  for (let x = fx0 - 4; x < fx1 + 4; x++) for (let y = 30; y < 57; y++) if ((x + y) % 2 === 0) m.set(x, y, fz1 + 4, C("#2f5a3a"));
  // tower crane: mast, jib, counter-jib with its weights, cab, hook
  const mx = x1 - 16,
    mz = 18;
  for (let y = 1; y < H + 12; y++) {
    m.set(mx, y, mz, C("#e8b830"));
    m.set(mx + 3, y, mz, C("#e8b830"));
    m.set(mx, y, mz + 3, C("#e8b830"));
    m.set(mx + 3, y, mz + 3, C("#e8b830"));
    if (y % 4 === 0) m.box(mx, y, mz, mx + 4, y + 1, mz + 4, C("#e8b830"));
  }
  const jy = H + 12;
  m.box(fx0 - 6, jy, mz + 1, mx + 4, jy + 2, mz + 3, C("#e8b830"));
  m.box(mx + 4, jy, mz + 1, mx + 16, jy + 2, mz + 3, C("#e8b830"));
  m.box(mx + 10, jy - 4, mz, mx + 16, jy, mz + 4, C("#5a5a64"));
  m.box(mx - 3, jy - 4, mz - 1, mx, jy, mz + 5, C("#d8d4cc"));
  m.box(mx - 3, jy - 3, mz + 5, mx, jy - 1, mz + 6, E("#ffe0a8", 0.9));
  m.box(fx0 + 6, jy - 30, mz + 1, fx0 + 7, jy, mz + 2, C("#3a3a40"));
  m.box(fx0 + 4, jy - 34, mz, fx0 + 9, jy - 30, mz + 4, C("#c0302a"));
  m.box(mx + 1, jy + 2, mz + 1, mx + 2, jy + 3, mz + 2, E("#ff3048", 2.2));
  m.box(fx0 - 6, jy + 2, mz + 1, fx0 - 5, jy + 3, mz + 2, E("#ff3048", 2.2));
  // site cabin with a lit window, piles of material
  m.box(x0 + 56, 1, D - 16, x0 + 76, 11, D - 6, C("#d8d4cc"));
  m.box(x0 + 60, 5, D - 6, x0 + 68, 9, D - 5, E("#ffe6c0", 0.9));
  m.box(x0 + 60, 1, 4, x0 + 74, 5, 12, C("#8a6a40"));
  for (let k = 0; k < 4; k++) m.box(x0 + 60, 5 + k, 4, x0 + 74, 6 + k, 12, k % 2 ? C("#9a968e") : C("#7a5a3a"));
  m.box(x0 + 70, 1, 20, x0 + 78, 4, 30, C("#6a6a72"));
  // warning beacons on the fence
  for (const x of [x0 + 30, x0 + 44]) m.box(x, 9, D - 1, x + 1, 10, D, E("#ff8a1a", 2));
  return {
    model: m,
    signs: [],
    door: [x0 + 37, D + 2],
    body: [x0, 0, x1, D],
    lights: [[x0 + 66, 8, D - 4, "#ffe6c0"]],
    walls: [
      [x0, 0, x1, 1],
      [x0, 0, x0 + 1, D],
      [x1 - 1, 0, x1, D],
      [x0, D - 1, x0 + 30, D],
      [x0 + 44, D - 1, x1, D],
    ],
  };
}

/** Transparent depot: a warehouse with an open loading dock on the avenue. */
export function depot(seed: number, width = 108): Built {
  const b = warehouse(seed, { sign: "DEPOT", width });
  const m = b.model;
  const [x0, , x1, D] = b.body;
  // open the middle bay so trucks can be seen coming out
  const mid = Math.floor((x0 + x1) / 2);
  const half = Math.min(10, Math.floor((x1 - x0) / 2) - 4);
  m.clear(mid - half, 0, D - 12, mid + half, 20, D);
  m.box(mid - half, 0, D - 13, mid + half, 20, D - 12, E("#ffe0b0", 0.7));
  for (let x = mid - half + 1; x < mid + half - 1; x += 4) m.box(x, 0, D - 11, x + 3, 4, D - 8, C("#8a6a44"));
  m.box(mid - half - 1, 20, D - 1, mid + half + 1, 22, D + 1, C("#e8b830"));
  return { ...b, points: { dock: [mid, 0, D + 4] }, lights: [...b.lights, [mid, 12, D - 6, "#ffe0b0"]] };
}

/**
 * The Proof Factory: where shielded transactions get their zk-SNARK proofs before delivery, and
 * the mining hall behind it, rows of ASICs grinding Equihash for the next block. The hall is a
 * real interior: the walls drop when the camera looks into it.
 */
export function factory(seed: number, width = 180): Built {
  const b = warehouse(seed, { sign: "PROOF FACTORY", width });
  const m = b.model;
  const [x0, , x1, D] = b.body;
  const H = 36;
  const mid = Math.floor((x0 + x1) / 2);
  const half = Math.min(12, Math.floor((x1 - x0) / 2) - 4);
  // ---- the mining hall: hollow out the shed behind the prover bay ----
  const back = D - 16;
  m.clear(x0 + 2, 1, 2, x1 - 2, H - 1, back);
  m.box(x0 + 2, 0, 2, x1 - 2, 1, back, shades(["#4a4752", "#45424d", "#4e4b56"], 3, seed));
  m.paint(x0 + 2, 1, 2, x0 + 3, H - 1, back, C("#2e2b36"));
  m.paint(x1 - 3, 1, 2, x1 - 2, H - 1, back, C("#2e2b36"));
  m.paint(x0 + 2, 1, 2, x1 - 2, H - 1, 3, C("#2a2732"));
  // the wall between the hall and the prover bay, with a doorway
  m.box(x0 + 2, 1, back, x1 - 2, H - 1, back + 1, C("#34303e"));
  m.clear(mid - 3, 1, back, mid + 3, 14, back + 1);
  // rows of ASIC cabinets, a walkway across the middle, yellow safety lines on the floor
  const rows = [6, 14];
  for (const z of rows) {
    for (const [a, c] of [
      [x0 + 5, mid - 3],
      [mid + 3, x1 - 5],
    ]) {
      m.box(a, 1, z, c, 11, z + 3, C("#1c1b22"));
      m.box(a, 11, z, c, 12, z + 3, C("#2c2a34"));
      // status LEDs on both faces, mostly green, a few amber
      for (let x = a; x < c; x++)
        for (let y = 2; y < 11; y += 2) {
          const h = hash(x, y, z, seed);
          if (h < 0.35) continue;
          const led = h > 0.93 ? E("#ffb547", 1.6) : E("#3ddc97", 1.2);
          m.set(x, y, z - 1, led);
          m.set(x, y, z + 3, led);
        }
      // cable tray overhead
      m.box(a, 17, z + 1, c, 18, z + 2, C("#3a3744"));
    }
    m.box(x0 + 4, 1, z + 4, x1 - 4, 1, z + 5, E("#f4b728", 0.35));
  }
  // big extraction fans on the back wall
  for (let x = x0 + 8; x < x1 - 12; x += 14) {
    m.box(x, 16, 3, x + 9, 25, 4, C("#3a3744"));
    m.box(x + 1, 17, 3, x + 8, 24, 4, C("#121117"));
    m.box(x + 4, 17, 3, x + 5, 24, 4, C("#5a5666"));
    m.box(x + 1, 20, 3, x + 8, 21, 4, C("#5a5666"));
  }
  // control desk by the doorway with its screens
  m.box(x0 + 5, 1, back - 4, x0 + 15, 6, back - 2, C("#2c2a34"));
  for (let x = x0 + 6; x < x0 + 14; x += 4) m.box(x, 6, back - 3, x + 3, 9, back - 2, E("#59e3ff", 1.1));
  // ceiling lights
  for (let x = x0 + 6; x < x1 - 6; x += 10) for (const z of [8, 16]) m.box(x, H - 2, z, x + 6, H - 1, z + 1, E("#e8f0ff", 1.0));
  // the block press at the end of the rows, and the conveyor that carries new blocks to the bay
  const beltZ = back - 3;
  m.box(mid + 4, 0, beltZ - 1, x1 - 9, 2, beltZ + 2, C("#2a2832"));
  m.box(mid + 4, 2, beltZ - 1, x1 - 9, 3, beltZ + 2, C("#141318"));
  for (let x = mid + 4; x < x1 - 9; x += 3) m.box(x, 0, beltZ - 2, x + 1, 3, beltZ - 1, C("#55525e"));
  m.box(x1 - 9, 0, beltZ - 3, x1 - 3, 12, beltZ + 3, C("#3a3446"));
  m.box(x1 - 9, 3, beltZ - 1, x1 - 8, 7, beltZ + 2, E("#f4b728", 1.8));
  m.box(x1 - 8, 12, beltZ - 2, x1 - 4, 13, beltZ + 2, E("#f4b728", 1.2));
  // ---- the prover bay at the front ----
  m.clear(mid - half, 0, D - 14, mid + half, 22, D);
  m.box(mid - half, 0, D - 15, mid + half, 22, D - 14, E("#c8a8ff", 0.8));
  m.clear(mid - 3, 1, D - 15, mid + 3, 14, D - 14);
  // the prover line: glowing presses stamping proofs into sealed boxes
  for (let x = mid - half + 2; x < mid + half - 2; x += 5) {
    if (Math.abs(x + 1.5 - mid) < 4) continue;
    m.box(x, 0, D - 13, x + 3, 8, D - 10, C("#3a3446"));
    m.box(x, 8, D - 13, x + 3, 9, D - 10, E("#b07bff", 1.6));
  }
  m.box(mid - half - 1, 22, D - 1, mid + half + 1, 24, D + 1, C("#7a52b0"));
  // a cooling tower on the roof
  m.cylinder(x1 - 14, 36, 18, 8, 16, shades(["#5a5468", "#544e62"], 2, seed), true);
  m.cylinder(x1 - 14, 50, 18, 8.4, 2, E("#b07bff", 1.2), true);
  // aisles: between the two rows, and between the second row and the conveyor
  const a0 = 11.5,
    a1 = 21;
  const loop: [number, number][] = [
    [x0 + 7, a0],
    [mid, a0],
    [mid, a1],
    [x1 - 12, a1],
    [mid + 6, a1],
    [mid, a1],
    [x0 + 7, a1],
    [mid, a1],
    [mid, a0],
    [x1 - 7, a0],
    [mid, a0],
  ];
  return {
    ...b,
    signs: [{ text: "PROOF FACTORY", color: "#b07bff", x: mid, y: 27.5, z: D + 2, w: Math.min(60, x1 - x0 - 6), h: 5, vertical: false, facing: "front" }],
    points: {
      dock: [mid, 0, D + 4],
      // a loop through the aisles for the miners, the screen on the back wall
      ...Object.fromEntries(loop.map(([x, z], i) => [`patrol${i}`, [x, 0, z] as [number, number, number]])),
      screen: [mid, 9, 4.2],
      hall: [mid, 0, back / 2],
      press: [x1 - 10, 3, beltZ + 0.5],
      beltEnd: [mid + 5, 3, beltZ + 0.5],
      // the inside camera: high in the corner by the bay, looking down the rows
      camPos: [x0 + 4, 14, back - 2],
      camLook: [mid + 6, 3, 11],
    },
    lights: [...b.lights, [mid, 12, D - 6, "#b07bff"], [mid, 20, back / 2, "#c8ffe8"]],
  };
}


/**
 * zkCARDS: the card shop where the zkSNARK collection hangs on the walls. A walk-in ground floor
 * (the cards themselves are live meshes mounted on the walls), neon storey above.
 */
export function cardShop(seed: number, o: { width?: number } = {}): Built {
  const W = o.width ?? 40,
    D = 34,
    H = 32;
  const { m, x0, x1, fz } = body(W, D, H);
  const G0 = 15;
  const wall = shades(["#2a2236", "#30283e", "#261f30"], 2, seed);
  m.box(x0, 0, 0, x1, H, D, wall);
  // the shop floor: hollow, a violet-and-black checker, dark walls for the cards to glow on
  m.clear(x0 + 2, 1, 2, x1 - 2, G0, D - 1);
  for (let x = x0 + 2; x < x1 - 2; x++) for (let z = 2; z < D - 1; z++) m.set(x, 0, z, ((x >> 2) + (z >> 2)) % 2 ? C("#1d1826") : C("#3a2a52"));
  m.paint(x0 + 2, 1, 2, x1 - 2, G0, 3, C("#141119"));
  m.paint(x0 + 2, 1, 2, x0 + 3, G0, D - 1, C("#141119"));
  m.paint(x1 - 3, 1, 2, x1 - 2, G0, D - 1, C("#1a1622"));
  // light strips over the card walls
  m.box(x0 + 3, G0 - 1, 3, x1 - 3, G0, 4, E("#d9b8ff", 1.4));
  m.box(x0 + 3, G0 - 1, 3, x0 + 4, G0, D - 3, E("#d9b8ff", 1.4));
  // two glass display cases down the middle, cards glowing inside
  const cardTones = ["#b07bff", "#ff3e8a", "#3ef0ff", "#f4b728", "#3ddc97"];
  for (const cz of [12, 20]) {
    m.box(x0 + 9, 1, cz, x1 - 12, 5, cz + 4, C("#1a1622"));
    m.box(x0 + 9, 5, cz, x1 - 12, 6, cz + 4, G("#8a7ab0"));
    for (let x = x0 + 10; x < x1 - 13; x += 3) m.box(x, 4, cz + 1, x + 2, 5, cz + 3, E(cardTones[(x + cz) % cardTones.length], 1.2));
  }
  // the counter by the door, a till, and the shopkeeper's spot behind
  m.box(x1 - 11, 1, D - 12, x1 - 3, 7, D - 9, C("#3a2a52"));
  m.box(x1 - 11, 7, D - 12, x1 - 3, 8, D - 9, C("#d9b8ff"));
  m.box(x1 - 6, 8, D - 11, x1 - 4, 10, D - 10, E("#3ef0ff", 1.0));
  // storefront: glass, a wide door, a neon frame
  const doorX0 = x0 + Math.floor(W / 2) - 4;
  m.box(x0 + 2, 1, D - 1, x1 - 2, G0 - 2, D, 0);
  for (let x = x0 + 2; x <= x1 - 2; x += 8) if (x < doorX0 - 1 || x > doorX0 + 8) m.box(x, 0, D - 1, x + 1, G0 - 2, D, C("#141119"));
  m.box(x0 + 2, G0 - 2, D - 1, x1 - 2, G0, D, C("#141119"));
  m.box(x0, 0, D, x0 + 1, G0 + 1, D + 1, E("#ff3e8a", 2));
  m.box(x1 - 1, 0, D, x1, G0 + 1, D + 1, E("#ff3e8a", 2));
  m.box(x0, G0, D, x1, G0 + 1, D + 1, E("#ff3e8a", 2));
  // upper storey: a lit band of card silhouettes, a parapet
  for (let x = x0 + 3; x < x1 - 8; x += 5) {
    m.box(x, G0 + 5, D - 1, x + 3, G0 + 10, D, E(cardTones[x % cardTones.length], 1.3));
    m.box(x + 1, G0 + 6, D - 1, x + 2, G0 + 9, D, C("#141119"));
  }
  m.box(x0, H - 1, 0, x1, H, D, C("#1d1826"));
  roofClutter(m, x0, x1, D, H, seed, { tank: false, stairs: false });
  verticalSignBox(m, x1 - 5, G0 + 2, fz, 13, 6);
  const signs: SignSpot[] = [
    { text: "zkCARDS", color: "#ff3e8a", x: x0 + W / 2 - 3, y: G0 + 13.5, z: D + 1.05, w: W - 12, h: 5, vertical: false, facing: "front" },
    { text: "カード", color: "#b07bff", x: x1 - 3, y: G0 + 8.5, z: fz + 3, w: 6, h: 13, vertical: true, facing: "side" },
  ];
  return {
    model: m,
    signs,
    door: [doorX0 + 4, fz + 2],
    body: [x0, 0, x1, D],
    lights: [
      [x0 + W / 2, 12, D / 2, "#d9b8ff"],
      [x0 + W / 2, 4, D + 2, "#ff3e8a"],
    ],
    walls: [
      [x0, 0, x1, 2],
      [x0, 0, x0 + 2, D],
      [x1 - 2, 0, x1, D],
      [x0, D - 1, doorX0 - 1, D],
      [doorX0 + 9, D - 1, x1, D],
    ],
    points: {
      // the card wall on the back (left/top corner to right/bottom corner) and on the left side
      backA: [x0 + 5, 12, 3.2],
      backB: [x1 - 5, 3, 3.2],
      sideA: [x0 + 3.2, 12, 6],
      sideB: [x0 + 3.2, 3, D - 6],
      keeper: [x1 - 7, 0, D - 15],
      camPos: [x1 - 4, 13, D - 3],
      camLook: [x0 + 10, 6, 6],
    },
  };
}

/**
 * The VIEW KEY BANK, from the street: a classical bank on a podium, six columns, a pediment with a
 * gold coin, bronze doors and tall windows. The banking hall itself is an interior of its own.
 */
export function bank(seed: number, o: { width?: number } = {}): Built {
  const W = o.width ?? 48,
    D = 34,
    H = 46;
  const { m, x0, x1, fz } = body(W, D, H);
  const marble = shades(["#ece8e0", "#e4e0d6", "#f0ece4", "#dcd6cc"], 2, seed);
  const stone = shades(["#cfc8bb", "#c8c1b4", "#d6cfc2"], 2, seed + 1);
  const gold = C("#c9a227");
  const mid = x0 + Math.floor(W / 2);
  // the block behind the portico, rusticated base, cornice
  m.box(x0, 0, 0, x1, H - 10, D - 4, marble);
  for (let y = 4; y < 14; y += 3) m.box(x0, y, D - 5, x1, y + 1, D - 4, stone);
  m.box(x0 - 1, H - 11, 0, x1 + 1, H - 9, D - 3, stone);
  // podium and steps across the whole front
  m.box(x0, 0, D - 4, x1, 3, D + 2, stone);
  for (let k = 0; k < 3; k++) m.box(x0 + 4 + k, 0, D + 2 + k, x1 - 4 - k, 3 - k, D + 3 + k, C("#d8d2c6"));
  // six columns with bases and capitals
  for (let k = 0; k < 6; k++) {
    const x = x0 + 3 + Math.round((k * (W - 9)) / 5);
    m.box(x - 1, 3, D - 1, x + 4, 4, D + 2, stone);
    m.box(x, 4, D - 1, x + 3, 30, D + 2, marble);
    for (let y = 6; y < 29; y += 4) m.set(x + 1, y, D + 2, C("#d6d0c4"));
    m.box(x - 1, 30, D - 1, x + 4, 31, D + 2, gold);
  }
  // entablature with the name, pediment stepping up to a gold coin
  m.box(x0, 31, D - 4, x1, 36, D + 3, marble);
  m.box(x0, 31, D + 2, x1, 32, D + 3, gold);
  m.box(x0, 35, D + 2, x1, 36, D + 3, gold);
  for (let k = 0; k < 9; k++) m.box(x0 + 1 + k * 2.6, 36 + k, D - 3, x1 - 1 - k * 2.6, 37 + k, D + 3, k === 0 ? stone : marble);
  for (let x = mid - 4; x <= mid + 4; x++)
    for (let y = 37; y <= 45; y++) if (Math.hypot(x - mid, y - 41) < 4.2) m.set(x, y, D + 3, Math.hypot(x - mid, y - 41) > 3 ? E("#f4b728", 1.6) : C("#c9a227"));
  // bronze doors and tall windows behind the columns, warm light inside
  m.box(x0 + 2, 3, D - 5, x1 - 2, 29, D - 4, C("#d8d2c6"));
  m.box(mid - 4, 3, D - 5, mid + 4, 18, D - 4, C("#7a5a2a"));
  m.box(mid - 3, 4, D - 5, mid + 3, 17, D - 4, C("#9a7434"));
  m.box(mid, 4, D - 5, mid + 1, 17, D - 4, C("#5a4220"));
  m.box(mid - 4, 18, D - 5, mid + 4, 20, D - 4, E("#ffd28a", 1.4));
  for (const x of [x0 + 5, x0 + 13, x1 - 17, x1 - 9])
    for (const y of [6, 19]) {
      m.box(x, y, D - 5, x + 4, y + 9, D - 4, G("#ffe2b0"));
      m.box(x, y + 4, D - 5, x + 4, y + 5, D - 4, C("#5a4220"));
    }
  // a roof balustrade and two gold lamps on the steps
  for (let x = x0; x < x1; x += 3) m.box(x, H - 9, D - 4, x + 1, H - 7, D - 3, stone);
  m.box(x0, H - 7, D - 4, x1, H - 6, D - 3, stone);
  for (const x of [x0 + 2, x1 - 3]) {
    m.box(x, 3, D + 3, x + 1, 9, D + 4, C("#2a2620"));
    m.box(x - 1, 9, D + 2, x + 2, 11, D + 5, E("#ffd28a", 2));
  }
  roofClutter(m, x0, x1, D - 4, H - 10, seed, { tank: false, stairs: false });
  const signs: SignSpot[] = [{ text: "VIEW KEY BANK", color: "#f4b728", x: mid, y: 33.5, z: D + 3.05, w: W - 10, h: 3.6, vertical: false, facing: "front" }];
  return {
    model: m,
    signs,
    door: [mid, fz + 6],
    body: [x0, 0, x1, D + 2],
    lights: [
      [mid, 12, D + 4, "#ffd28a"],
      [mid, 24, D + 4, "#fff0d0"],
    ],
    points: {
      keeper: [mid, 0, D - 8],
      camPos: [mid, 20, D + 10],
      camLook: [mid, 10, D],
    },
  };
}

/**
 * ZSA EXCHANGE: where Zcash Shielded Assets will be issued, swapped and burned (ZIPs 227, 228,
 * 226). Still a building site: scaffolding over the front, a site hoarding, a crane arm and cones.
 */
export function zsaShop(seed: number, o: { width?: number } = {}): Built {
  const W = o.width ?? 40,
    D = 34,
    H = 40;
  const { m, x0, x1, fz } = body(W, D, H);
  const concrete = shades(["#8c8894", "#827e8a", "#95919c"], 2, seed);
  const mid = x0 + Math.floor(W / 2);
  m.box(x0, 0, 0, x1, H - 6, D, concrete);
  // the new glass front, half fitted: the upper panes are in, the lower ones still boarded
  m.box(x0 + 2, 1, D - 1, x1 - 2, H - 8, D, G("#5a8ab8"));
  for (let x = x0 + 2; x < x1 - 2; x += 6) m.box(x, 0, D - 1, x + 1, H - 8, D, C("#2a2830"));
  for (let y = 8; y < H - 8; y += 8) m.box(x0 + 2, y, D - 1, x1 - 2, y + 1, D, C("#2a2830"));
  m.box(x0 + 2, 1, D - 1, x1 - 2, 14, D, shades(["#c8a070", "#b89060", "#d0a878"], 1, seed + 2));
  // site hoarding along the pavement, gold and black, with a gate
  m.box(x0, 0, D + 2, x1, 10, D + 3, (x, y) => (Math.floor((x + y) / 3) % 2 ? C("#f4b728") : C("#1a1a1e")));
  m.clear(mid - 3, 0, D + 2, mid + 3, 9, D + 3);
  // scaffolding: tubes and boards over the whole front
  const tube = C("#9aa0aa");
  for (let x = x0; x <= x1; x += 6) m.box(x, 0, D + 4, x + 1, H - 2, D + 5, tube);
  for (let y = 9; y < H - 2; y += 7) {
    m.box(x0, y, D + 4, x1 + 1, y + 1, D + 5, tube);
    m.box(x0, y - 1, D, x1 + 1, y, D + 5, C("#6a5a44"));
  }
  for (let x = x0; x < x1; x += 12) for (let y = 9; y < H - 9; y += 7) for (let k = 0; k < 7; k++) m.set(x + k, y + k, D + 5, tube);
  // a tower crane arm reaching over the roof
  m.box(x1 - 6, H - 6, 6, x1 - 4, H + 14, 8, C("#f4b728"));
  m.box(x0 - 6, H + 13, 6, x1 - 2, H + 15, 8, C("#f4b728"));
  m.box(x0 - 4, H + 4, 6, x0 - 3, H + 13, 7, C("#2a2a30"));
  m.box(x0 - 5, H + 2, 5, x0 - 2, H + 4, 8, C("#c8a070"));
  m.box(x1 - 7, H + 15, 5, x1 - 3, H + 16, 9, E("#ff3048", 2));
  // cones and a sand pile by the gate
  for (const x of [mid - 6, mid + 5]) {
    m.box(x, 0, D + 7, x + 2, 1, D + 9, C("#ff7a1a"));
    m.box(x + 0.5, 1, D + 7.5, x + 1.5, 3, D + 8.5, C("#ff7a1a"));
    m.set(x + 1, 2, D + 8, C("#ffffff"));
  }
  const signs: SignSpot[] = [
    { text: "ZSA EXCHANGE", color: "#f4b728", x: mid, y: H - 3, z: D + 0.05, w: W - 6, h: 4, vertical: false, facing: "front" },
    { text: "COMING SOON", color: "#ff7a1a", x: mid, y: 5.5, z: D + 3.05, w: 22, h: 3, vertical: false, facing: "front" },
  ];
  return {
    model: m,
    signs,
    door: [mid, fz + 4],
    body: [x0, 0, x1, D + 3],
    lights: [
      [mid, 10, D + 5, "#ffd28a"],
      [x1 - 5, H + 15, 7, "#ff3048"],
    ],
    points: {
      keeper: [mid, 0, D - 6],
      camPos: [mid, 20, D + 10],
      camLook: [mid, 10, D],
    },
  };
}

/**
 * The LIBRARY (図書館) on Transparent Square: Zcash's public knowledge. A low civic hall in warm
 * timber and stone under a copper-green roof: the ZIP stacks seen through a tall glass atrium in
 * the middle, the press room in the left wing (the newspaper kiosk stands in front of it), the
 * reading room in the right wing.
 */
export function library(seed: number, o: { width?: number } = {}): Built {
  const W = o.width ?? 108,
    D = 34,
    H = 44;
  const { m, x0, x1, fz } = body(W, D, H);
  const stone = shades(["#bdb3a2", "#b5ab9a", "#c4baa9"], 2, seed);
  const timber = shades(["#6a4630", "#634229", "#704b34"], 2, seed + 1);
  const copper = shades(["#3f8a78", "#3a8070", "#46937f"], 2, seed + 2);
  const dark = C("#2a2622");
  const mid = x0 + Math.floor(W / 2);
  const aw = 30; // atrium width
  const a0 = mid - aw / 2,
    a1 = mid + aw / 2;
  const R = rand(seed);
  const spines = ["#b0413e", "#3a6ea5", "#d9a441", "#2f7d5b", "#6b4c9a", "#c76b2d", "#e8e0cf", "#2a2a35"];
  /** A run of book spines behind glass: what a library looks like from the street. */
  const books = (bx0: number, bx1: number, y0: number, y1: number, z: number) => {
    for (let y = y0; y < y1; y += 4) {
      m.box(bx0, y, z, bx1, y + 1, z + 1, timber);
      for (let x = bx0; x < bx1; x++) if (R() > 0.12) m.box(x, y + 1, z, x + 1, y + 1 + (R() > 0.3 ? 3 : 2), z + 1, C(spines[Math.floor(R() * spines.length)]));
    }
  };

  // wings: stone plinth, timber upper storey with deep eaves
  m.box(x0, 0, 0, x1, 3, D, stone);
  m.box(x0, 3, 0, a0, 30, D - 2, stone);
  m.box(a1, 3, 0, x1, 30, D - 2, stone);
  for (const [w0, w1] of [
    [x0, a0],
    [a1, x1],
  ]) {
    // timber frame bands and a row of tall windows with books behind them
    m.box(w0, 14, D - 2, w1, 16, D - 1, timber);
    m.box(w0, 28, D - 2, w1, 30, D - 1, timber);
    for (let x = w0 + 3; x + 6 <= w1 - 2; x += 9) {
      m.box(x, 4, D - 3, x + 6, 13, D - 2, G("#ffe6b8"));
      m.box(x, 17, D - 3, x + 6, 27, D - 2, G("#ffe6b8"));
      books(x, x + 6, 17, 26, D - 4);
      m.box(x - 1, 3, D - 2, x, 14, D - 1, timber);
      m.box(x + 6, 3, D - 2, x + 7, 14, D - 1, timber);
    }
  }
  // the atrium: full-height glass between two timber piers, three floors of shelves inside
  m.box(a0 - 2, 3, D - 3, a0, 36, D, timber);
  m.box(a1, 3, D - 3, a1 + 2, 36, D, timber);
  m.box(a0, 3, 4, a1, 36, D - 6, C("#3a3028"));
  for (const y of [3, 14, 25]) m.box(a0, y, D - 9, a1, y + 1, D - 6, timber);
  books(a0 + 1, a1 - 1, 4, 13, D - 7);
  books(a0 + 1, a1 - 1, 15, 24, D - 7);
  books(a0 + 1, a1 - 1, 26, 35, D - 7);
  m.box(a0, 3, D - 2, a1, 36, D - 1, G("#9fd0e0"));
  for (let x = a0 + 5; x < a1; x += 5) m.box(x, 3, D - 2, x + 1, 36, D - 1, dark);
  for (const y of [14, 25]) m.box(a0, y, D - 2, a1, y + 1, D - 1, dark);
  // the doors at the foot of the atrium, a warm light over them, three steps up
  m.box(mid - 4, 3, D - 2, mid + 4, 12, D - 1, C("#4a3424"));
  m.box(mid - 3, 4, D - 2, mid + 3, 11, D - 1, G("#ffd9a0"));
  m.box(mid, 4, D - 2, mid + 1, 11, D - 1, dark);
  m.box(mid - 5, 12, D - 1, mid + 5, 13, D + 1, E("#ffd28a", 1.5));
  for (let k = 0; k < 3; k++) m.box(mid - 8 - k, 0, D + k, mid + 8 + k, 3 - k, D + 1 + k, stone);
  // copper roofs: low hips on the wings, a taller one over the atrium with a lantern ridge
  for (let k = 0; k < 5; k++) {
    m.box(x0 - 2 + k, 30 + k, -1 + k, a0 + 1 - k, 31 + k, D + 1 - k, copper);
    m.box(a1 - 1 + k, 30 + k, -1 + k, x1 + 2 - k, 31 + k, D + 1 - k, copper);
  }
  for (let k = 0; k < 7; k++) m.box(a0 - 3 + k, 36 + k, -1 + k, a1 + 3 - k, 37 + k, D + 1 - k, copper);
  m.box(a0 + 4, 43, D / 2 - 1, a1 - 4, 44, D / 2 + 1, E("#ffd28a", 1.2));
  // the press wing's vertical sign and two paper lanterns by the door
  verticalSignBox(m, x0 + 3, 8, D, 18, 5);
  lantern(m, mid - 9, 8, D + 1, "#ffd28a");
  lantern(m, mid + 6, 8, D + 1, "#ffd28a");

  const signs: SignSpot[] = [
    { text: "図書館 LIBRARY", color: "#ffd28a", x: mid, y: 32.5, z: D + 0.05, w: aw - 4, h: 3.4, vertical: false, facing: "front" },
    { text: "PRESS · ZIPs", color: "#7fe3ff", x: (x0 + a0) / 2, y: 15, z: D - 0.9, w: 20, h: 2, vertical: false, facing: "front" },
    { text: "新聞", color: "#ff8a5a", x: x0 + 4, y: 17, z: D + 2.5, w: 5, h: 14, vertical: true, facing: "side" },
  ];
  return {
    model: m,
    signs,
    door: [mid, fz + 3],
    body: [x0, 0, x1, D],
    lights: [
      [mid, 10, D + 3, "#ffd28a"],
      [mid, 26, D - 8, "#ffe6b8"],
    ],
    points: {
      keeper: [mid, 0, D - 8],
      camPos: [mid, 22, D + 14],
      camLook: [mid, 12, D],
      kiosk: [x0 + 14, 0, D + 8],
    },
  };
}
