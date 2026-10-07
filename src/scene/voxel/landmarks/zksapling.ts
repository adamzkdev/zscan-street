import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, palm, planterBox } from "./needle";

/**
 * ZK TOWER SAPLING, the green tower on the marina's bank (Oasia Hotel Downtown / CapitaSpring):
 * a slender tower wrapped in a red and pink aluminium mesh that creepers climb, thicker near the
 * sky gardens. Every eight storeys the facade opens on all four sides into a double-height sky
 * garden (a lawn, trees, a warm-lit timber soffit, the lit lift core in the middle, creepers
 * hanging from the edge). The top: an open lattice crown round the roof garden, an infinity pool
 * glowing turquoise along the front edge, palms, loungers and a bar pavilion. At its foot a
 * planted podium (green walls, a garden roof), the entrance under a planted canopy, a small plaza.
 *
 * Scale 2. Points: `door`, `keeper`, `pool`, `camPos`, `camLook`.
 */
export function zksapling(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const r = rand(seed * 13 + 7);
  const cx = Math.round(W / 2);
  const TX0 = cx - 20,
    TX1 = cx + 20,
    TZ0 = 12,
    TZ1 = 50;
  const TOP = 330; // the roof deck
  const CROWN = 30; // the lattice crown over it
  const H = TOP + CROWN + 18;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];

  // ---- palette ----------------------------------------------------------------------------------
  const MESH = ["#b8323a", "#c8444a", "#d0566a", "#a82a34", "#e0705a", "#c43c5c", "#d8486a", "#9a2430"];
  const meshAt = (u: number, y: number) => C(MESH[Math.floor(hash(Math.floor(u / 3), Math.floor(y / 30), 3, seed) * MESH.length)]);
  const leaf = shades(["#2f7a34", "#3d9440", "#256a2c", "#4aa84a", "#5cb84e"], 2, seed + 2);
  const leafDark = shades(["#1f5a26", "#2a6a2e", "#18501f"], 1, seed + 3);
  const flower: Paint = (x, y, z) => C(["#f06aa0", "#ffd04a", "#ff8a4a", "#f4f0f0"][Math.floor(hash(x, y, z, seed + 9) * 4)]);
  const glass = G("#3c5a6a");
  const glassDark = G("#24343e");
  const slab = C("#e8e2d8");
  const timber = shades(["#b07a48", "#a06c3e", "#bc8654"], 1, seed + 4);
  const lit = (x: number, y: number, z: number) => E(["#ffe2b0", "#fff0d0", "#ffd49a"][Math.floor(hash(x >> 2, y >> 3, z >> 2, seed + 5) * 3)], 1.0);
  const pave = shades(["#d8d2c4", "#d0cabc", "#e0dacc"], 2, seed + 6);
  const water = E("#45d8e6", 1.1);
  const waterDeep = E("#2ab8d0", 0.9);

  // ---- the plaza --------------------------------------------------------------------------------
  m.box(0, 0, 0, W, 1, D, pave);
  for (let x = 0; x < W; x++) for (let z = 54; z < D; z++) if ((x + z) % 7 === 0) m.set(x, 0, z, C("#bcb4a4"));

  // ---- the podium: green walls, a glass front with timber fins, a garden on the roof ------------
  const PH = 21,
    PX0 = 4,
    PX1 = W - 4,
    PZ0 = 4,
    PZ1 = 54;
  m.box(PX0, 1, PZ0, PX1, PH, PZ1, C("#d8d0c4"));
  // green walls on the sides and the back: leaves with flowers, darker at the bottom
  const pt = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));
  const greenWall: Paint = (x, y, z) => pt(hash(x, y, z, seed + 11) < 0.06 ? flower : y < 4 ? leafDark : leaf, x, y, z);
  for (let y = 2; y < PH - 2; y++) {
    for (let z = PZ0; z < PZ1 - 3; z++) {
      m.set(PX0 - 1, y, z, greenWall);
      m.set(PX1, y, z, greenWall);
    }
    for (let x = PX0; x < PX1; x++) m.set(x, y, PZ0 - 1, greenWall);
  }
  // the front: glass and lit lobby between timber fins, the entrance in the middle
  for (let y = 1; y < PH - 3; y++)
    for (let x = PX0; x < PX1; x++) {
      const fin = (x - PX0) % 4 === 0;
      m.set(x, y, PZ1 - 1, fin ? timber : y > 13 ? glassDark : hash(x >> 2, y >> 2, 7, seed) < 0.6 ? lit(x, y, PZ1) : glass);
      if (fin) m.set(x, y, PZ1, timber);
    }
  m.clear(cx - 5, 1, PZ1 - 1, cx + 5, 12, PZ1 + 1);
  m.box(cx - 5, 1, PZ1 - 3, cx + 5, 12, PZ1 - 2, E("#fff0d0", 1.3));
  m.box(PX0 - 1, PH - 3, PZ1 - 1, PX1 + 1, PH, PZ1 + 1, timber);
  // the planted canopy over the entrance, creepers hanging off it
  m.box(cx - 13, 14, PZ1, cx + 13, 16, PZ1 + 8, C("#f0ece4"));
  m.box(cx - 13, 16, PZ1, cx + 13, 17, PZ1 + 8, leaf);
  for (let x = cx - 13; x < cx + 13; x++) {
    if (hash(x, 3, 9, seed) < 0.55) for (let y = 15 - Math.floor(hash(x, 4, 9, seed) * 5); y < 16; y++) m.set(x, y, PZ1 + 8, leaf);
    if (x % 4 === 0) m.set(x, 13, PZ1 + 6, E("#ffe6b8", 2));
  }
  for (const sx of [-12, 11]) m.box(cx + sx, 1, PZ1 + 6, cx + sx + 1, 14, PZ1 + 7, timber);
  signs.push({ text: "ZK TOWER SAPLING", color: "#5cff9a", x: cx, y: 18.6, z: PZ1 + 8.2, w: 24, h: 3, vertical: false, facing: "front" });
  // the podium roof garden: lawn, hedges and small trees round the tower's foot
  m.box(PX0, PH, PZ0, PX1, PH + 1, PZ1, leaf);
  for (let x = PX0; x < PX1; x++)
    for (let z = PZ0; z < PZ1; z++) {
      const edge = x < PX0 + 2 || x >= PX1 - 2 || z < PZ0 + 2 || z >= PZ1 - 2;
      if (edge && hash(x, z, 4, seed) < 0.8) m.box(x, PH + 1, z, x + 1, PH + 2 + (hash(x, z, 5, seed) < 0.3 ? 1 : 0), z + 1, hash(x, z, 6, seed) < 0.1 ? flower : leafDark);
    }
  for (const [x, z] of [
    [PX0 + 5, PZ0 + 5],
    [PX1 - 6, PZ0 + 5],
    [PX0 + 5, PZ1 - 6],
    [PX1 - 6, PZ1 - 6],
  ]) {
    m.box(x, PH + 1, z, x + 1, PH + 6, z + 1, C("#5a4030"));
    m.blob(x + 0.5, PH + 8, z + 0.5, 4, leaf, 0.3, seed + x);
  }

  // ---- the tower --------------------------------------------------------------------------------
  const GARDENS = [92, 172, 252]; // sky garden floors (each 24 voxels high)
  const GH = 24;
  const inGarden = (y: number) => GARDENS.some((g) => y >= g && y < g + GH);
  const gardenBelow = (y: number) => {
    let best = PH;
    for (const g of GARDENS) if (g + GH <= y) best = g + GH;
    return y - best;
  };
  /** One perimeter cell: u along the face, inward step (dx, dz). */
  const face = (x: number, y: number, z: number, u: number, dx: number, dz: number, corner: number) => {
    const fl = (y - 1) % 10;
    // the mesh: fins every four voxels and a spandrel band per floor, a mosaic of reds by bay
    const mesh = fl < 2 || u % 4 === 0 || corner < 2;
    const tint = C(MESH[Math.floor(hash(Math.floor(u / 4), Math.floor((y - 1) / 30), 3, seed) * MESH.length)]);
    // creepers climb in strands from the sky garden below: tall at the corners, ragged on top
    const above = gardenBelow(y);
    const col = Math.floor(u / 3);
    const reach = corner < 3 ? 70 : 4 + Math.pow(hash(col, Math.floor((y - above) / 10), 5, seed), 2) * 50;
    const ragged = reach + (hash(u >> 1, y >> 2, 6, seed) - 0.5) * 6;
    const green = above < ragged;
    if (green) {
      m.set(x, y, z, hash(x >> 1, y >> 1, z >> 1, seed + 2) < 0.03 ? flower : hash(x >> 1, y >> 1, z >> 1, seed + 8) < 0.25 ? leafDark : leaf);
      // leaves stand off the mesh here and there
      if (hash(x >> 1, y >> 1, z >> 1, seed + 4) < 0.1) m.set(x - dx, y, z - dz, leaf);
    } else if (mesh) m.set(x, y, z, tint);
    // behind: the floor slab line, glass, lit rooms at night
    const ix = x + dx,
      iz = z + dz;
    m.set(ix, y, iz, fl < 2 ? slab : hash(Math.floor(u / 4), Math.floor((y - 1) / 10), dx * 3 + dz, seed + 7) < 0.34 ? lit(ix, y, iz) : fl > 7 ? glassDark : glass);
  };
  const corner = (x: number, z: number) => Math.max(Math.min(x - TX0, TX1 - 1 - x), Math.min(z - TZ0, TZ1 - 1 - z));
  for (let y = PH; y < TOP; y++) {
    if (inGarden(y)) continue;
    for (let x = TX0; x < TX1; x++) {
      face(x, y, TZ1 - 1, x - TX0, 0, -1, corner(x, TZ1 - 1));
      face(x, y, TZ0, TX1 - x + 80, 0, 1, corner(x, TZ0));
    }
    for (let z = TZ0 + 1; z < TZ1 - 1; z++) {
      face(TX0, y, z, z - TZ0 + 40, 1, 0, corner(TX0, z));
      face(TX1 - 1, y, z, TZ1 - z + 120, -1, 0, corner(TX1 - 1, z));
    }
  }
  // a lit vertical slot up the middle of the front: the lift lobbies behind glass
  for (let y = PH; y < TOP; y++) if (!inGarden(y)) for (let x = cx - 1; x < cx + 1; x++) m.set(x, y, TZ1 - 1, (y - 1) % 10 === 0 ? slab : E("#d8fff0", 0.7));

  // the sky gardens: open on all four sides
  const core0x = cx - 7,
    core1x = cx + 7,
    core0z = 24,
    core1z = 38;
  for (const g of GARDENS) {
    const y0 = g,
      y1 = g + GH;
    // floor slab with the lawn, the soffit with its lights
    m.box(TX0, y0 - 2, TZ0, TX1, y0, TZ1, slab);
    m.box(TX0 + 1, y0, TZ0 + 1, TX1 - 1, y0 + 1, TZ1 - 1, leaf);
    m.box(TX0, y1 - 2, TZ0, TX1, y1, TZ1, slab);
    m.box(TX0 + 1, y1 - 3, TZ0 + 1, TX1 - 1, y1 - 2, TZ1 - 1, (x, _y, z) => ((x + z) % 6 === 0 ? E("#ffdca0", 2.2) : pt(timber, x, _y, z)));
    // corner columns, wrapped in mesh and creepers
    for (const [ax, az] of [
      [TX0, TZ0],
      [TX1 - 3, TZ0],
      [TX0, TZ1 - 3],
      [TX1 - 3, TZ1 - 3],
    ])
      for (let y = y0; y < y1 - 2; y++) for (let x = ax; x < ax + 3; x++) for (let z = az; z < az + 3; z++) m.set(x, y, z, hash(x, y, z, seed + 21) < 0.55 ? leaf : meshAt(x + z, y));
    // the core: lit lift lobby behind glass
    m.box(core0x, y0, core0z, core1x, y1 - 2, core1z, C("#e4ddd0"));
    for (let y = y0 + 1; y < y1 - 3; y++)
      for (let x = core0x + 1; x < core1x - 1; x++) {
        m.set(x, y, core1z - 1, (x - core0x) % 4 === 0 ? timber : E("#fff2d8", 0.9));
        m.set(x, y, core0z, (x - core0x) % 4 === 0 ? timber : E("#fff2d8", 0.7));
      }
    // the glass railing round the edge
    for (let x = TX0; x < TX1; x++) for (const z of [TZ0, TZ1 - 1]) m.box(x, y0 + 1, z, x + 1, y0 + 4, z + 1, G("#a8d8e0"));
    for (let z = TZ0; z < TZ1; z++) for (const x of [TX0, TX1 - 1]) m.box(x, y0 + 1, z, x + 1, y0 + 4, z + 1, G("#a8d8e0"));
    // fairy lights along the railing top, uplights in the lawn
    for (let x = TX0 + 1; x < TX1 - 1; x += 3) for (const z of [TZ0, TZ1 - 1]) m.set(x, y0 + 4, z, E(x % 2 ? "#fff0c0" : "#c8ffd8", 2.4));
    for (let z = TZ0 + 1; z < TZ1 - 1; z += 3) for (const x of [TX0, TX1 - 1]) m.set(x, y0 + 4, z, E(z % 2 ? "#fff0c0" : "#c8ffd8", 2.4));
    // trees and shrubs on the lawn, round the core
    const spots: [number, number][] = [
      [TX0 + 6, TZ0 + 6],
      [TX1 - 7, TZ0 + 6],
      [TX0 + 6, TZ1 - 7],
      [TX1 - 7, TZ1 - 7],
      [cx - 13, 31],
      [cx + 12, 31],
    ];
    spots.forEach(([x, z], i) => {
      const th = 6 + Math.floor(hash(i, g, 1, seed) * 4);
      m.box(x, y0 + 1, z, x + 1, y0 + 1 + th, z + 1, C("#5a4030"));
      m.blob(x + 0.5, y0 + th + 3, z + 0.5, 3.6 + hash(i, g, 2, seed) * 1.4, i % 3 === 2 ? leafDark : leaf, 0.32, seed + g + i);
    });
    for (let x = TX0 + 2; x < TX1 - 2; x++)
      for (let z = TZ0 + 2; z < TZ1 - 2; z++) {
        const h = hash(x, z, g, seed + 23);
        if (h < 0.06 && (x < core0x - 1 || x > core1x || z < core0z - 1 || z > core1z)) m.box(x, y0 + 1, z, x + 1, y0 + 2 + (h < 0.02 ? 1 : 0), z + 1, h < 0.015 ? flower : leafDark);
      }
    // benches along the front
    for (const bx of [cx - 12, cx + 6]) m.box(bx, y0 + 1, TZ1 - 6, bx + 6, y0 + 2, TZ1 - 5, timber);
    // creepers hanging from the soffit edge
    for (let x = TX0; x < TX1; x++)
      for (const z of [TZ0, TZ1 - 1]) {
        const n = Math.floor(hash(x, z, g, seed + 25) * 4);
        for (let y = y1 - 3 - n; y < y1 - 2; y++) m.set(x, y, z, leaf);
      }
    for (let z = TZ0; z < TZ1; z++)
      for (const x of [TX0, TX1 - 1]) {
        const n = Math.floor(hash(x, z, g, seed + 26) * 4);
        for (let y = y1 - 3 - n; y < y1 - 2; y++) m.set(x, y, z, leaf);
      }
    lights.push([cx, y0 + 12, TZ1, "#ffd8a0"]);
  }

  // ---- the top: roof deck, infinity pool along the front, palms, the bar, the lattice crown --
  m.box(TX0, TOP - 2, TZ0, TX1, TOP, TZ1, slab);
  m.box(TX0, TOP, TZ0, TX1, TOP + 1, TZ1, timber);
  // the pool cantilevers 3 voxels past the front; its water runs right to the edge
  const PZ = TZ1 - 13;
  m.box(TX0 + 1, TOP - 2, PZ, TX1 - 1, TOP + 3, TZ1 + 3, C("#f2f0ea"));
  m.box(TX0 + 2, TOP, PZ + 1, TX1 - 2, TOP + 3, TZ1 + 3, waterDeep);
  m.box(TX0 + 2, TOP + 2, PZ + 1, TX1 - 2, TOP + 3, TZ1 + 3, water);
  // the overflow: a glowing sheet down the edge and the catch channel
  m.box(TX0 + 1, TOP - 4, TZ1 + 3, TX1 - 1, TOP + 2, TZ1 + 4, E("#7ff0ff", 1.6));
  m.box(TX0 + 1, TOP - 5, TZ1 + 1, TX1 - 1, TOP - 4, TZ1 + 4, C("#d8d4cc"));
  // loungers and umbrellas behind it
  for (let i = 0; i < 6; i++) {
    const x = TX0 + 4 + i * 6;
    m.box(x, TOP + 1, PZ - 4, x + 2, TOP + 2, PZ - 1, C("#f4f2ea"));
    m.box(x, TOP + 2, PZ - 4, x + 2, TOP + 3, PZ - 3, C("#f4f2ea"));
    if (i % 2 === 0) {
      m.box(x + 2, TOP + 1, PZ - 3, x + 3, TOP + 7, PZ - 2, C("#5a4030"));
      m.box(x, TOP + 7, PZ - 5, x + 5, TOP + 8, PZ, i % 4 === 0 ? C("#f4f0e4") : C("#2a8a5a"));
    }
  }
  // palms in planters at the corners of the deck
  for (const [x, z] of [
    [TX0 + 3, TZ0 + 4],
    [TX1 - 5, TZ0 + 4],
    [TX0 + 3, PZ - 8],
    [TX1 - 5, PZ - 8],
  ]) {
    m.box(x - 1, TOP + 1, z - 1, x + 3, TOP + 3, z + 3, C("#c8bca8"));
    palm(m, x, TOP + 3, z, k, seed + x * 7 + z, 6);
  }
  // the bar pavilion at the back: a timber pergola with a lit counter
  {
    const bx0 = cx - 11,
      bx1 = cx + 11,
      bz0 = TZ0 + 3,
      bz1 = TZ0 + 13;
    m.box(bx0, TOP + 1, bz1 - 3, bx1, TOP + 4, bz1 - 1, timber);
    m.box(bx0, TOP + 4, bz1 - 3, bx1, TOP + 5, bz1 - 1, C("#f0ece4"));
    m.box(bx0 + 1, TOP + 3, bz1 - 1, bx1 - 1, TOP + 4, bz1, E("#5cff9a", 1.8));
    m.box(bx0, TOP + 1, bz0, bx1, TOP + 9, bz0 + 2, (x, y) => ((x + y) % 3 === 0 ? E("#ffd8a0", 1.4) : C("#3a2a20")));
    for (const x of [bx0, bx1 - 1]) for (const z of [bz0, bz1 - 1]) m.box(x, TOP + 1, z, x + 1, TOP + 12, z + 1, timber);
    for (let x = bx0; x < bx1; x += 2) m.box(x, TOP + 12, bz0, x + 1, TOP + 13, bz1, timber);
    for (let x = bx0; x < bx1; x++) if (hash(x, 1, 2, seed) < 0.6) m.set(x, TOP + 13, bz0 + Math.floor(hash(x, 2, 2, seed) * 10), leaf);
    for (let x = bx0 + 1; x < bx1; x += 4) m.set(x, TOP + 11, bz0 + 5, E("#ffd08a", 2.6));
    lights.push([cx, TOP + 8, bz0 + 6, "#ffcf8a"]);
  }
  // the crown: the mesh lattice rises round the back and sides of the roof garden, open in front
  for (let y = TOP + 1; y < TOP + CROWN; y++) {
    const frame = y === TOP + CROWN - 1;
    const cell = (x: number, z: number, u: number) => {
      const lattice = (u + y) % 6 === 0 || (u - y + 1200) % 6 === 0 || frame;
      if (!lattice) return;
      m.set(x, y, z, hash(x, y, z, seed + 31) < 0.3 + (TOP + CROWN - y) / 70 ? leaf : meshAt(u, y));
    };
    for (let x = TX0; x < TX1; x++) cell(x, TZ0, TX1 - x);
    for (let z = TZ0; z < PZ - 6; z++) {
      cell(TX0, z, z + 40);
      cell(TX1 - 1, z, z + 90);
    }
  }
  // the crown's lit top edge (green at night) and the aircraft light
  for (let x = TX0; x < TX1; x++) m.set(x, TOP + CROWN, TZ0, x % 2 ? E("#5cff9a", 2) : meshAt(x, TOP));
  for (let z = TZ0; z < PZ - 6; z++) for (const x of [TX0, TX1 - 1]) m.set(x, TOP + CROWN, z, z % 2 ? E("#5cff9a", 2) : meshAt(z, TOP));
  m.box(cx - 3, TOP + 1, TZ0 + 1, cx + 3, TOP + 16, TZ0 + 4, C("#d8d0c4"));
  m.box(cx, TOP + 16, TZ0 + 2, cx + 1, TOP + CROWN + 14, TZ0 + 3, C("#9a9aa4"));
  m.box(cx, TOP + CROWN + 14, TZ0 + 2, cx + 1, TOP + CROWN + 16, TZ0 + 3, E("#ff3a2a", 3));
  // the name, high on the crown's back wall facing the city, and on the side
  signs.push({ text: "SAPLING", color: "#5cff9a", x: cx, y: TOP - 15, z: TZ1 + 1.2, w: 24, h: 5, vertical: false, facing: "front" });
  signs.push({ text: "ZK TOWER SAPLING", color: "#5cff9a", x: TX1 + 1.2, y: TOP - 15, z: (TZ0 + TZ1) / 2, w: 30, h: 4, vertical: false, facing: "side" });

  // ---- the plaza: planters, palms, lamps, benches ------------------------------------------------
  planterBox(m, 2, 1, PZ1 + 2, 10, PZ1 + 8, seed + 41);
  planterBox(m, W - 10, 1, PZ1 + 2, W - 2, PZ1 + 8, seed + 42);
  palm(m, 6, 3, PZ1 + 5, k, seed + 43, 6);
  palm(m, W - 6, 3, PZ1 + 5, k, seed + 44, 6.5);
  for (const x of [cx - 20, cx + 19]) lights.push([...lampPost(m, x, 1, D - 3, k, "#c8ffd8"), "#c8ffd8"]);
  bench(m, cx - 17, 1, D - 6, k);
  bench(m, cx + 12, 1, D - 6, k);
  // a water rill along the front of the podium
  m.box(PX0 + 2, 0, PZ1 + 10, cx - 7, 1, PZ1 + 11, water);
  m.box(cx + 7, 0, PZ1 + 10, PX1 - 2, 1, PZ1 + 11, water);
  void r;

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[PX0 - 1, PZ0 - 1, PX1 + 1, PZ1 + 1]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, PZ1 + 1],
      keeper: [cx + 7, 1, PZ1 + 4],
      pool: [cx, TOP + 3, TZ1 - 6],
      camPos: [cx + 90, 160, D + 140],
      camLook: [cx, 170, (TZ0 + TZ1) / 2],
    },
  };
}
