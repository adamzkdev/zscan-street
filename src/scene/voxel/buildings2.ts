import { body, warehouse, type Built } from "./buildings";
import { C, E, G, hash, rand, shades, VoxelModel } from "./model";
import { lantern, P, tiledRoof, verticalSignBox, type SignSpot } from "./parts";

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
 * The bookshop-café and newsstand (本屋) on Transparent Square: a low hall in warm timber and
 * stone under a slate roof: three floors of books seen through the tall glass atrium in the
 * middle, the newsstand in the left wing, the café in the right one, its tables out on the square
 * under green-and-cream awnings. (The Library itself is the Binhai on the south bank.)
 */
export function bookshop(seed: number, o: { width?: number } = {}): Built {
  const W = o.width ?? 108,
    D = 34,
    H = 44;
  const { m, x0, x1, fz } = body(W, D, H);
  const stone = shades(["#bdb3a2", "#b5ab9a", "#c4baa9"], 2, seed);
  const timber = shades(["#6a4630", "#634229", "#704b34"], 2, seed + 1);
  const copper = shades(["#4a4e58", "#454953", "#50545e"], 2, seed + 2);
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
  // striped awnings over the ground-floor windows, the café's tables out front
  for (const [w0, w1] of [
    [x0 + 2, a0 - 3],
    [a1 + 3, x1 - 2],
  ])
    for (let x = w0; x < w1; x++) for (let z = D - 2; z < D + 3; z++) m.set(x, 14 - Math.floor((z - D + 2) / 2), z, C(((x - w0) >> 1) % 2 ? "#ece4cc" : "#2e6a4a"));
  for (let x = a1 + 5; x + 4 < x1 - 2; x += 9) {
    m.box(x + 1, 0, D + 5, x + 2, 3, D + 6, C("#2a2622"));
    m.box(x, 3, D + 4, x + 3, 4, D + 7, C("#e8e0cf"));
    for (const cx of [x - 1, x + 3]) m.box(cx, 0, D + 5, cx + 1, 2, D + 6, C("#6a4630"));
  }
  // the newsstand: racks of papers and magazines under the left awning
  for (let x = x0 + 4; x < a0 - 6; x += 3) m.box(x, 0, D, x + 2, 5, D + 1, C(["#e8e4dc", "#c03a3a", "#3a6ea5", "#f4b728"][(x >> 1) % 4]));
  // the newsstand's vertical sign and two paper lanterns by the door
  verticalSignBox(m, x0 + 3, 8, D, 18, 5);
  lantern(m, mid - 9, 8, D + 1, "#ffd28a");
  lantern(m, mid + 6, 8, D + 1, "#ffd28a");

  const signs: SignSpot[] = [
    { text: "本屋 BOOKS & COFFEE", color: "#ffd28a", x: mid, y: 32.5, z: D + 0.05, w: aw - 4, h: 3.4, vertical: false, facing: "front" },
    { text: "NEWS · MAGAZINES", color: "#7fe3ff", x: (x0 + a0) / 2, y: 17, z: D - 0.9, w: 20, h: 2, vertical: false, facing: "front" },
    { text: "CAFÉ", color: "#ffd28a", x: (a1 + x1) / 2, y: 17, z: D - 0.9, w: 12, h: 2, vertical: false, facing: "front" },
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
