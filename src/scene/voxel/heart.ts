import { body, roofClutter, type Built } from "./buildings";
import { C, E, G, hash, rand, shades, type Paint, type VoxelModel } from "./model";
import { lantern, P, roofAC, tiledRoof, verticalSignBox, type SignSpot } from "./parts";

/** The MEMPOOL chain's colours: orange over teal on cream. */
const ORANGE = "#ff9f2e",
  TEAL = "#3ec9b0";
const KRAFT = shades(["#c8955a", "#bd8a50", "#d29e62", "#b98348"], 1, 41);
const GOODS = ["#d0504a", "#4a9ad0", "#d0b04a", "#6ac06a", "#d07ab0", "#e8e8e8", "#9070d0", "#e08a3a"];

/** A cardboard parcel with the chain's tape round it (the tape faces +z and the top). */
function parcel(m: VoxelModel, x: number, y: number, z: number, w: number, h: number, d: number, tape = ORANGE) {
  m.box(x, y, z, x + w, y + h, z + d, KRAFT);
  const tx = x + Math.floor(w / 2);
  m.box(tx, y, z + d - 1, tx + 1, y + h, z + d, C(tape));
  m.box(tx, y + h - 1, z, tx + 1, y + h, z + d, C(tape));
}

/** A wooden pallet (a slatted deck on three runners). */
function pallet(m: VoxelModel, x: number, z: number, w = 8, d = 7) {
  for (const k of [0, Math.floor(d / 2), d - 1]) m.box(x, 0, z + k, x + w, 1, z + k + 1, P.woodLight);
  for (let xx = x; xx < x + w; xx += 2) m.box(xx, 1, z, xx + 1, 2, z + d, P.woodLight);
}

/** Hazard stripes, yellow and black, along a frame. */
const hazard: Paint = (x, y) => (Math.floor((x + y) / 2) % 2 ? C("#f4c020") : C("#1c1a20"));

/**
 * The MEMPOOL HQ (メンプール本社), the chain's head office and depot in the heart: the pickup hall
 * behind a double-height glass front on the left, the loading dock on the right where the trucks
 * from the Proof Factory pull up, a live board over the hall and a giant parcel on the roof.
 * Points: the pickup hall's (inside, counter, keeper, rack, block shelves, camera), the dock
 * (`dock` on the pavement, `bay` where drivers set the parcels down, `pallet` where the hands
 * pick them up, `pass` through to the hall) and the live board (`screen`, `screenSize`).
 */
export function mempoolHQ(seed: number): Built {
  const W = 72,
    D = 36,
    H = 50;
  const { m, x0, x1, fz } = body(W, D, H);
  const cream = shades(["#ece8e0", "#e6e2d8", "#f0ece4"], 2, seed);
  const G0 = 22;
  // hall | dock: the partition wall, the dock's inside
  const hx1 = x0 + 44;
  const dx0 = hx1 + 2,
    dx1 = x1 - 2;
  const dockC = Math.floor((dx0 + dx1) / 2);
  m.box(x0, 0, 0, x1, H, D, cream);
  // a darker plinth and a ribbed band round the base
  m.box(x0, 0, D - 1, x1, 2, D, C("#4a4656"));

  // ---- the pickup hall ----
  m.clear(x0 + 2, 1, 2, hx1, G0 - 2, D - 1);
  m.box(x0 + 2, 0, 2, hx1, 1, D - 1, (x, _y, z) => ((x >> 2) + (z >> 2)) % 2 ? C("#d2cec6") : C("#c4c0b8"));
  m.paint(x0 + 2, 1, 2, x0 + 3, G0 - 2, D - 1, C("#b4aea2"));
  m.box(x0 + 2, G0 - 3, 2, hx1, G0 - 2, D - 1, C("#9a968e"));
  // the chain's stripes round the hall, ceiling light panels
  m.box(x0 + 2, 15, 2, hx1, 16, 3, E(ORANGE, 1.1));
  m.box(x0 + 2, 14, 2, hx1, 15, 3, E(TEAL, 1.0));
  for (let x = x0 + 5; x < hx1 - 4; x += 9) for (const z of [8, 17, 26]) m.box(x, G0 - 4, z, x + 5, G0 - 3, z + 2, E("#f4f0e8", 0.95));
  // the back wall: a wall of pickup lockers, orange doors, a lit screen on each column
  for (let x = x0 + 4; x < x0 + 30; x += 4)
    for (let y = 1; y < 13; y += 3) {
      m.box(x, y, 2, x + 4, y + 3, 3, C("#e08a2a"));
      m.box(x, y, 3, x + 4, y + 1, 3.5, C("#b86a1a"));
      m.set(x + 3, y + 2, 3, C("#3a3842"));
    }
  for (let x = x0 + 5; x < x0 + 30; x += 8) m.box(x, 13, 2, x + 3, 14, 3, E("#9ff0e0", 1.0));
  // three block shelves (recent blocks are live boxes on their boards), groceries on the back side
  const sx0 = x0 + 6,
    sx1 = x0 + 26;
  for (const z of [10, 17, 24]) {
    m.box(sx0, 1, z, sx1, 10, z + 2, C("#3a3842"));
    for (const y of [1, 4, 7]) {
      m.box(sx0, y, z + 2, sx1, y + 1, z + 5, C("#6a6774"));
      m.box(sx0, y, z + 5, sx1, y + 1, z + 6, E(ORANGE, 0.7));
    }
    m.box(sx0, 9, z - 1, sx1, 10, z + 3, C("#2a2830"));
    m.box(sx0 - 1, 1, z - 1, sx0, 10, z + 6, C("#2a2830"));
    m.box(sx1, 1, z - 1, sx1 + 1, 10, z + 6, C("#2a2830"));
    for (let y = 2; y < 10; y += 2)
      for (let x = sx0; x < sx1; x++) if (hash(x, y, z, seed) > 0.3) m.set(x, y, z - 1, C(GOODS[Math.floor(hash(x, y, z, seed + 1) * GOODS.length)]));
    // a hanging aisle sign
    m.box(sx0 + 6, G0 - 7, z + 1, sx1 - 6, G0 - 5, z + 2, C(TEAL));
    m.box(sx0 + 9, G0 - 5, z + 1, sx0 + 10, G0 - 3, z + 2, P.metal);
  }
  // the pickup counter by the dock wall, the parcel rack behind it (the parcels are live meshes)
  const cx0 = hx1 - 14,
    cx1 = hx1 - 2;
  m.box(cx0, 1, D - 12, cx1, 7, D - 9, C("#5a4a3c"));
  m.box(cx0, 1, D - 9, cx1, 2, D - 8.5, E(ORANGE, 1.0));
  m.box(cx0, 7, D - 12, cx1, 8, D - 9, C("#e8e2d4"));
  m.box(cx0 + 1, 8, D - 11, cx0 + 3, 10, D - 10, C("#2a2a30"));
  m.box(cx0 + 1, 10, D - 11, cx0 + 3, 11, D - 10, E("#59e3ff", 1.0));
  m.box(cx1 - 4, 8, D - 11, cx1 - 2, 9, D - 9, C("#3a3a44"));
  m.box(cx0, 1, D - 20, cx1, 14, D - 18, C("#6a5a4a"));
  for (let y = 5; y < 14; y += 4) m.box(cx0, y, D - 18, cx1, y + 1, D - 17, C("#8a7a6a"));
  m.box(cx0, 14, D - 20, cx1, 16, D - 17, C(TEAL));
  // a queue rope in front of the counter, an ATM and a magazine rack by the window
  for (const x of [cx0 - 6, cx0 - 1]) {
    m.box(x, 1, D - 5, x + 1, 6, D - 4, C("#c9a227"));
    m.set(x, 6, D - 5, C("#e8c050"));
  }
  m.box(cx0 - 5, 4, D - 5, cx0 - 1, 5, D - 4.5, C("#c0303a"));
  m.box(x0 + 3, 1, D - 4, x0 + 13, 6, D - 2, C("#4a4656"));
  for (let x = x0 + 3; x < x0 + 13; x += 2) m.box(x, 6, D - 3, x + 2, 9, D - 2, C(GOODS[x % GOODS.length]));
  m.box(x0 + 3, 1, D - 9, x0 + 6, 12, D - 6, C("#3a5a8a"));
  m.box(x0 + 3, 8, D - 6, x0 + 6, 10, D - 5, E("#9fd8ff", 1.0));
  // the glass front, double height, with the main doors in the middle of the hall
  const doorX0 = x0 + 18;
  m.box(x0 + 2, 1, D - 1, hx1, G0 - 2, D, 0);
  for (let x = x0 + 2; x < hx1; x++) m.set(x, 0, D - 1, P.metal);
  for (let x = x0 + 2; x <= hx1; x += 7) if (x < doorX0 - 1 || x > doorX0 + 9) m.box(x, 0, D - 1, x + 1, G0 - 2, D, P.frame);
  m.box(doorX0 - 1, 0, D - 1, doorX0, G0 - 2, D, P.frame);
  m.box(doorX0 + 9, 0, D - 1, doorX0 + 10, G0 - 2, D, P.frame);
  m.box(x0 + 2, 14, D - 1, hx1, 15, D, P.frame);
  m.box(doorX0 - 1, 13, D - 1, doorX0 + 10, 14, D, P.frame);
  // the entrance canopy: orange slab, teal light under it, two slim posts
  m.box(doorX0 - 4, 14, D, doorX0 + 13, 15, D + 6, E(TEAL, 0.9));
  m.box(doorX0 - 4, 15, D, doorX0 + 13, 17, D + 7, C(ORANGE));
  for (const x of [doorX0 - 4, doorX0 + 12]) m.box(x, 0, D + 5, x + 1, 14, D + 6, C("#2a2830"));
  // a door mat and two planters by the doors
  m.box(doorX0, 0, D, doorX0 + 9, 1, D + 3, C("#3a3842"));
  for (const x of [doorX0 - 3, doorX0 + 10]) {
    m.box(x, 0, D + 1, x + 2, 3, D + 3, C("#4a4656"));
    m.blob(x + 1, 5, D + 2, 1.8, P.leaf, 0.3, x);
  }

  // ---- the loading dock (搬入口) ----
  m.box(hx1, 0, 2, dx0, G0, D - 1, cream);
  m.clear(dx0, 1, 3, dx1, 18, D - 1);
  m.box(dx0, 0, 3, dx1, 1, D - 1, C("#8a8890"));
  for (let z = 6; z < D - 2; z += 4) m.box(dx0 + 1, 0.5, z, dx0 + 2, 1, z + 2, C("#f4c020"));
  m.box(dx0, 17, 3, dx1, 18, D - 1, C("#5a5864"));
  for (let x = dx0 + 2; x < dx1 - 2; x += 7) m.box(x, 16, 10, x + 4, 17, 11, E("#ffe2a8", 1.2));
  // the pass-through to the hall, behind the rack, and a conveyor running to it
  const passZ = D - 16;
  m.clear(hx1, 1, passZ - 3, dx0, 13, passZ + 3);
  m.box(hx1, 13, passZ - 3, dx0, 14, passZ + 3, hazard);
  for (let x = dx0 + 3; x < dx1 - 2; x++) m.box(x, 4, passZ - 2, x + 1, 5, passZ + 2, x % 3 ? C("#2a2830") : C("#4a4852"));
  for (const x of [dx0 + 4, dx0 + 12, dx1 - 4]) m.box(x, 1, passZ - 2, x + 1, 4, passZ + 2, P.metal);
  for (let x = dx0 + 5; x < dx1 - 4; x += 5) parcel(m, x, 5, passZ - 1, 3, 2, 3);
  // racking along the back wall, full of parcels
  for (const y of [1, 7, 13]) {
    m.box(dx0, y, 3, dx1, y + 1, 9, C("#2c5aa0"));
    for (let x = dx0 + 1; x < dx1 - 3; x += 4) if (hash(x, y, seed) > 0.2) parcel(m, x, y + 1, 4, 3, y < 13 ? 4 : 3, 4, hash(x, y, 2) > 0.6 ? TEAL : ORANGE);
  }
  for (let x = dx0; x <= dx1 - 1; x += 7) m.box(x, 1, 3, x + 1, 17, 9, C("#e07a1a"));
  // pallets of parcels waiting by the door, a pallet jack
  pallet(m, dx0 + 2, D - 9);
  parcel(m, dx0 + 2, 2, D - 9, 4, 3, 3);
  parcel(m, dx0 + 6, 2, D - 9, 4, 4, 3);
  parcel(m, dx0 + 2, 2, D - 6, 4, 4, 3);
  parcel(m, dx0 + 3, 5, D - 8, 5, 3, 4, TEAL);
  pallet(m, dx1 - 9, D - 22);
  parcel(m, dx1 - 9, 2, D - 22, 4, 5, 3);
  parcel(m, dx1 - 5, 2, D - 22, 4, 3, 3);
  m.box(dx1 - 7, 0, D - 12, dx1 - 3, 2, D - 6, C("#e0b020"));
  m.box(dx1 - 6, 2, D - 7, dx1 - 4, 7, D - 6, C("#2a2830"));
  // the roller door: open, its drum and the last slats showing at the top, hazard frame
  m.box(dx0, 1, D - 1, dx1, 16, D, 0);
  m.box(dx0, 14, D - 1, dx1, 16, D, (x, y) => (y % 2 ? C("#9aa0aa") : C("#7a808a")));
  m.box(dx0 - 1, 16, D - 2, dx1 + 1, 18, D, C("#5a5864"));
  m.box(dx0 - 1, 0, D - 1, dx0, 16, D + 1, hazard);
  m.box(dx1, 0, D - 1, dx1 + 1, 16, D + 1, hazard);
  m.box(dx0 - 1, 16, D, dx1 + 1, 17, D + 1, hazard);
  // dock bumpers, a lip, two bollards, the dock lamps
  for (const x of [dx0 + 1, dx1 - 3]) m.box(x, 1, D, x + 2, 4, D + 1, C("#18161c"));
  m.box(dx0, 0, D, dx1, 1, D + 2, C("#6a6872"));
  for (const x of [dx0 - 3, dx1 + 1]) {
    m.box(x, 0, D + 4, x + 2, 6, D + 6, C("#f4c020"));
    m.box(x, 2, D + 4, x + 2, 3, D + 6, C("#1c1a20"));
  }
  for (const x of [dx0 - 2, dx1]) {
    m.box(x, 18, D, x + 2, 19, D + 3, P.metal);
    m.box(x, 17, D + 2, x + 2, 18, D + 3, E("#ffc070", 2.2));
  }
  // traffic light over the bay: green when a truck may pull up
  m.box(dockC - 3, 19, D, dockC + 3, 22, D + 1, C("#18161c"));
  m.box(dockC - 2, 20, D + 1, dockC, 21, D + 1.5, E("#ff3048", 1.2));
  m.box(dockC + 1, 20, D + 1, dockC + 3, 21, D + 1.5, E("#3ee08f", 2.2));

  // ---- the upper floors ----
  // the chain's bands over the ground floor
  m.box(x0 - 1, G0 - 1, D, x1 + 1, G0, D + 2, C("#e8e4dc"));
  m.box(x0 - 1, G0, D, x1 + 1, G0 + 1, D + 2, E(ORANGE, 1.2));
  m.box(x0 - 1, G0 + 1, D, x1 + 1, G0 + 2, D + 1, E(TEAL, 1.0));
  // the live board over the hall: a deep black frame, the screen itself is a live plane
  const bx0 = x0 + 3,
    bx1 = hx1 - 1,
    by0 = G0 + 4,
    by1 = H - 6;
  m.box(bx0 - 1, by0 - 1, D, bx1 + 1, by1 + 1, D + 2, C("#141218"));
  m.box(bx0, by0, D + 1, bx1, by1, D + 2, C("#050507"));
  m.box(bx0 - 1, by0 - 2, D + 1, bx1 + 1, by0 - 1, D + 2, E(ORANGE, 1.0));
  for (const x of [bx0 + 4, bx1 - 5]) m.box(x, by1 + 1, D + 1, x + 1, by1 + 3, D + 2, P.metal);
  // offices over the dock: two rows of windows, half of them lit, blinds in the rest
  for (const y of [G0 + 4, G0 + 14])
    for (let x = dx0; x < dx1 - 2; x += 7) {
      m.box(x, y, D - 1, x + 5, y + 7, D, hash(x, y, seed) > 0.45 ? E(hash(x, y, 1) > 0.5 ? "#ffd9a0" : "#eaf2ff", 1.0) : G("#1d2a3f"));
      m.box(x - 1, y - 1, D - 1, x + 6, y, D + 1, C("#cfc8bb"));
      if (hash(x, y, 3) > 0.5) m.box(x, y + 4, D - 1, x + 5, y + 7, D, C("#d8d0c0"));
    }
  // the cornice and its stripes, the parapet
  m.box(x0 - 1, H - 4, D - 1, x1 + 1, H - 3, D + 1, E(TEAL, 0.9));
  m.box(x0 - 1, H - 3, 0, x1 + 1, H - 1, D + 1, C("#e8e4dc"));
  roofClutter(m, x0, x1, D, H, seed, { tank: false, stairs: false });
  // side windows down the east end (seen from the crossing)
  for (const y of [G0 + 4, G0 + 14]) for (let z = 6; z < D - 6; z += 8) m.box(x1 - 1, y, z, x1, y + 6, z + 5, hash(z, y, seed) > 0.4 ? E("#ffd9a0", 0.9) : G("#1d2a3f"));
  // the roof: a giant parcel over the dock, the MEMPOOL billboard over the hall
  const px = dx0 + 2;
  parcel(m, px, H, 10, 20, 14, 18);
  m.box(px + 4, H + 4, 28, px + 9, H + 9, 28.5, C("#f0ece4"));
  m.box(px + 5, H + 6, 28.5, px + 8, H + 7, 28.7, C("#2a2830"));
  m.box(px - 1, H, 9, px + 21, H + 1, 29, C("#5a5864"));
  for (let x = x0 + 4; x < hx1 - 2; x += 8) m.box(x, H, D - 4, x + 1, H + 14, D - 3, C("#2e2c36"));
  m.box(x0 + 3, H + 3, D - 4, hx1 - 2, H + 14, D - 3, C("#e8e4dc"));
  m.box(x0 + 3, H + 2, D - 3, hx1 - 2, H + 3, D - 2, E(ORANGE, 1.4));
  m.box(x0 + 3, H + 14, D - 3, hx1 - 2, H + 15, D - 2, E(TEAL, 1.2));
  for (let x = x0 + 6; x < hx1 - 6; x += 12) roofAC(m, x, H, 6, true);
  // a vertical sign at the dock end, towards the crossing
  verticalSignBox(m, x1 - 3, G0 + 4, fz, 20, 6);

  const signs: SignSpot[] = [
    { text: "MEMPOOL", color: ORANGE, x: (x0 + 3 + hx1 - 2) / 2, y: H + 8.5, z: D - 2.95, w: hx1 - x0 - 9, h: 9, vertical: false, facing: "front" },
    { text: "受取 PICKUP", color: TEAL, x: doorX0 + 4.5, y: 16, z: D + 7.05, w: 16, h: 2.2, vertical: false, facing: "front" },
    { text: "搬入口 LOADING DOCK", color: "#ffc070", x: dockC, y: 23.5, z: D + 2.05, w: dx1 - dx0 + 2, h: 2.6, vertical: false, facing: "front" },
    { text: "本社", color: ORANGE, x: x1 - 1, y: G0 + 14, z: fz + 3, w: 6, h: 18, vertical: true, facing: "side" },
  ];
  return {
    model: m,
    signs,
    door: [doorX0 + 4.5, fz + 2],
    body: [x0, 0, x1, D],
    lights: [
      [x0 + 22, 16, D - 14, "#eef2ff"],
      [dockC, 14, D - 8, "#ffd9a0"],
    ],
    walls: [
      [x0, 0, x1, 2],
      [x0, 0, x0 + 2, D],
      [x1 - 2, 0, x1, D],
      [x0, D - 1, doorX0 - 1, D],
      [doorX0 + 10, D - 1, dx0, D],
      // the dock is for trucks and hands only
      [dx0, D - 1, dx1, D + 1],
      [hx1, 2, dx0, passZ - 3],
      [hx1, passZ + 3, dx0, D],
      [sx0 - 1, 9, sx1 + 1, 30],
      [cx0, D - 12, cx1, D - 9],
      [cx0, D - 20, cx1, D - 17],
      [x0 + 2, 2, x0 + 30, 4],
    ],
    points: {
      inside: [doorX0 + 4.5, 0, D - 4],
      counter: [cx0 + 5, 0, D - 7],
      keeper: [cx0 + 7, 0, D - 15],
      rack: [cx0 + 6, 5, D - 17],
      shelf0a: [sx0 + 1, 2, 28],
      shelf0b: [sx1 - 1, 2, 28],
      shelf1a: [sx0 + 1, 2, 21],
      shelf1b: [sx1 - 1, 2, 21],
      shelf2a: [sx0 + 1, 2, 14],
      shelf2b: [sx1 - 1, 2, 14],
      camPos: [x0 + 4, G0 - 5, D - 3],
      camLook: [cx0 + 4, 5, D - 14],
      // the dock: kerb side of the bay, where drivers set parcels down, the pallets, the pass
      dock: [dockC, 0, D + 3],
      bay: [dockC - 2, 0, passZ],
      pallet: [dx0 + 6, 0, D - 4],
      pass: [hx1 - 3, 0, passZ],
      // the live board: centre of its face and its size (voxels)
      screen: [(bx0 + bx1) / 2, (by0 + by1) / 2, D + 2.08],
      screenSize: [bx1 - bx0, by1 - by0, 0],
    },
  };
}

/**
 * A MEMPOOL branch out in the city: a small two-storey corner shop in the chain's colours, a row
 * of orange pickup lockers outside, and a sign box on the roof whose face is a live counter.
 */
export function mempoolKiosk(seed: number, o: { width?: number } = {}): Built {
  const W = o.width ?? 30,
    D = 26,
    H = 30;
  const { m, x0, x1, fz } = body(W, D, H);
  const cream = shades(["#ece8e0", "#e6e2d8", "#f0ece4"], 2, seed);
  const gh = 17;
  m.box(x0, 0, 0, x1, H, D, cream);
  m.box(x0, 0, D - 1, x1, 2, D, C("#4a4656"));
  // the shop: lit inside, shelves, a counter with a till and parcels behind
  m.clear(x0 + 2, 1, 4, x1 - 2, gh - 3, D);
  m.box(x0 + 2, 0, 4, x1 - 2, 1, D, C("#d2cec6"));
  m.box(x0 + 2, gh - 4, 4, x1 - 2, gh - 3, D, E("#f4f0e8", 0.95));
  m.box(x0 + 2, 1, 4, x1 - 2, gh - 4, 5, C("#3a3842"));
  for (const y of [3, 6, 9])
    for (let x = x0 + 3; x < x1 - 10; x++) {
      m.set(x, y - 1, 5, C("#6a6774"));
      if (hash(x, y, seed) > 0.25) m.set(x, y, 5, C(GOODS[Math.floor(hash(x, y, seed, 1) * GOODS.length)]));
    }
  m.box(x1 - 9, 1, 5, x1 - 3, 12, 8, C("#6a5a4a"));
  for (let y = 2; y < 11; y += 3) parcel(m, x1 - 9, y, 6, 3, 2, 2), parcel(m, x1 - 6, y, 6, 3, 2, 2, TEAL);
  m.box(x1 - 11, 1, D - 9, x1 - 3, 6, D - 7, C("#5a4a3c"));
  m.box(x1 - 11, 6, D - 9, x1 - 3, 7, D - 7, C("#e8e2d4"));
  m.box(x1 - 5, 7, D - 9, x1 - 3, 9, D - 8, E("#59e3ff", 1.0));
  // glass front with a door, kick plate, the fascia with the bands
  const doorX = x0 + Math.floor(W / 2) - 4;
  for (let x = x0 + 2; x < x1 - 2; x++) if (x < doorX || x >= doorX + 7) m.set(x, 0, D - 1, P.metal);
  for (let x = x0 + 2; x <= x1 - 2; x += 6) if (x < doorX - 1 || x > doorX + 7) m.box(x, 0, D - 1, x + 1, gh - 4, D, P.frame);
  m.box(doorX - 1, 0, D - 1, doorX, gh - 4, D, P.frame);
  m.box(doorX + 7, 0, D - 1, doorX + 8, gh - 4, D, P.frame);
  m.box(x0 - 1, gh - 4, D - 1, x1 + 1, gh, D + 1, C("#ece8e0"));
  m.box(x0 - 1, gh - 4, D + 1, x1 + 1, gh - 3, D + 2, E(ORANGE, 1.1));
  m.box(x0 - 1, gh - 1, D + 1, x1 + 1, gh, D + 2, E(TEAL, 1.0));
  // the pickup lockers outside, by the left of the door
  for (let x = x0 + 1; x < doorX - 2; x += 3)
    for (let y = 0; y < 10; y += 3) {
      m.box(x, y, D, x + 3, y + 3, D + 2, C("#e08a2a"));
      m.set(x + 2, y + 1, D + 2, C("#3a3842"));
    }
  m.box(x0 + 1, 10, D, doorX - 2, 11, D + 2, C(TEAL));
  m.box(x0 + 2, 6, D + 2, x0 + 4, 8, D + 2.4, E("#9ff0e0", 1.2));
  // upstairs: the branch office, a lit window and an AC unit
  m.box(x0 + 4, gh + 2, D - 1, x1 - 4, H - 4, D, E("#ffe2b8", 0.9));
  for (let x = x0 + 4; x < x1 - 4; x += 5) m.box(x, gh + 2, D - 1, x + 1, H - 4, D, P.frame);
  m.box(x0 + 4, gh + 6, D - 1, x1 - 4, gh + 7, D, P.frame);
  m.box(x1 - 9, gh + 1, D, x1 - 3, gh + 5, D + 3, P.acBody);
  m.box(x0 - 1, H - 2, 0, x1 + 1, H, D + 1, C("#e8e4dc"));
  m.box(x0 - 1, H - 3, D, x1 + 1, H - 2, D + 1, E(ORANGE, 1.0));
  // the roof sign box (its face is the live counter) and a small parcel
  const sx0 = x0 + 2,
    sx1 = x1 - 2;
  for (const x of [sx0 + 2, sx1 - 3]) m.box(x, H, D - 5, x + 1, H + 3, D - 4, P.metal);
  m.box(sx0 - 1, H + 3, D - 5, sx1 + 1, H + 13, D - 3, C("#141218"));
  m.box(sx0 - 1, H + 2, D - 4, sx1 + 1, H + 3, D - 3, E(ORANGE, 1.2));
  m.box(sx0 - 1, H + 13, D - 4, sx1 + 1, H + 14, D - 3, E(TEAL, 1.0));
  parcel(m, x0 + 4, H, 4, 8, 6, 8);
  roofAC(m, x1 - 10, H, 5);
  const signs: SignSpot[] = [{ text: "MEMPOOL", color: ORANGE, x: x0 + W / 2, y: gh - 2, z: D + 1.05, w: W - 10, h: 2.4, vertical: false, facing: "front" }];
  return {
    model: m,
    signs,
    door: [doorX + 3.5, fz + 2],
    body: [x0, 0, x1, D + 2],
    lights: [[x0 + W / 2, 9, D - 4, "#eef2ff"]],
    points: {
      screen: [(sx0 + sx1) / 2, H + 8, D - 2.92],
      screenSize: [sx1 - sx0 + 1, 9, 0],
    },
  };
}

export type StreetShopKind = "ramen" | "florist" | "tea" | "gacha";

/**
 * The little shops of the heart: a ramen counter, a florist, a tea house and a gacha arcade. Each
 * one is a detailed two-storey front (clickable from the street, see `store` in plan.ts).
 */
export function streetShop(seed: number, o: { kind: StreetShopKind; width?: number }): Built {
  switch (o.kind) {
    case "ramen":
      return ramenShop(seed, o.width ?? 26);
    case "florist":
      return floristShop(seed, o.width ?? 26);
    case "tea":
      return teaHouse(seed, o.width ?? 26);
    case "gacha":
      return gachaShop(seed, o.width ?? 26);
  }
}

/** ラーメン: dark timber, a counter with red stools seen through the window, lanterns, noren, a giant bowl. */
function ramenShop(seed: number, W: number): Built {
  const D = 30,
    gh = 18,
    H = gh + 16;
  const { m, x0, x1, fz } = body(W, D, H);
  const wood = shades(["#3a2a22", "#34261e", "#42302a"], 1, seed);
  m.box(x0, 0, 0, x1, H, D, wood);
  // the shop: warm inside, the kitchen at the back (pots steaming), a counter and stools
  m.clear(x0 + 1, 1, D - 12, x1 - 1, gh - 4, D);
  m.box(x0 + 1, 0, D - 12, x1 - 1, 1, D, C("#5a4a3a"));
  m.box(x0 + 1, 1, D - 13, x1 - 1, gh - 4, D - 12, E("#ffcf8a", 0.85));
  m.box(x0 + 1, gh - 5, D - 12, x1 - 1, gh - 4, D, E("#ffbf70", 0.9));
  for (let x = x0 + 3; x < x1 - 3; x += 5) {
    m.cylinder(x + 1.5, 6, D - 11, 1.6, 3, C("#b8bcc4"));
    m.box(x + 1, 9, D - 12, x + 2, 12, D - 11, C("#e8e8f0"));
  }
  m.box(x0 + 1, 1, D - 12, x1 - 1, 6, D - 10, C("#7a7e88"));
  m.box(x0 + 1, 1, D - 8, x1 - 1, 7, D - 6, P.woodLight);
  m.box(x0 + 1, 7, D - 8, x1 - 1, 8, D - 6, C("#c89a60"));
  for (let x = x0 + 3; x < x1 - 2; x += 4) {
    m.box(x, 1, D - 5, x + 1, 4, D - 4, P.metal);
    m.box(x - 1, 4, D - 5.5, x + 2, 5, D - 3.5, C("#c0303a"));
  }
  for (let x = x0 + 3; x < x1 - 2; x += 4) m.box(x, 8, D - 7.5, x + 2, 9, D - 6.5, C("#e8e0d0"));
  // front: wide window on a timber sill, a sliding door, noren, lanterns
  const doorX = x1 - 9;
  m.box(x0 + 1, 0, D - 1, doorX - 1, 3, D, P.wood);
  for (let x = x0 + 1; x < doorX - 1; x += 5) m.box(x, 3, D - 1, x + 1, gh - 4, D, C("#2a1c14"));
  m.box(doorX - 1, 0, D - 1, doorX, gh - 4, D, C("#2a1c14"));
  m.box(x1 - 2, 0, D - 1, x1 - 1, gh - 4, D, C("#2a1c14"));
  m.box(x0, gh - 4, D - 1, x1, gh, D + 1, C("#2a1c14"));
  for (let x = doorX - 1; x < x1 - 1; x += 3) m.box(x, gh - 10, D + 1, x + 2, gh - 4, D + 2, C("#1e2a5a"));
  m.box(doorX - 1, gh - 4, D + 1, x1 - 1, gh - 3, D + 2, P.wood);
  m.set(doorX + 3, gh - 7, D + 2, P.white);
  for (let x = x0 + 1; x < doorX - 3; x += 5) lantern(m, x, gh - 2, D + 1);
  // the eave and the giant bowl over the door: red bowl, golden noodles, chopsticks
  const tile = shades(["#2e2a34", "#28242e", "#34303a"], 1, seed);
  for (let k = 0; k < 3; k++) m.box(x0 - 1, gh + 4 - k, D + k, x1 + 1, gh + 5 - k, D + k + 1, tile);
  const bx = x0 + Math.floor(W / 2),
    by = gh + 7;
  for (let k = 0; k < 4; k++) m.cylinder(bx, by + k, D + 3, 3 + k * 0.8, 1, C(k === 3 ? "#f0ece4" : "#c0303a"), k < 3);
  m.cylinder(bx, by + 3, D + 3, 4.6, 1, C("#e8c050"));
  m.box(bx - 1, by + 4, D + 2, bx, by + 12, D + 3, C("#d8b080"));
  m.box(bx + 1, by + 4, D + 3, bx + 2, by + 11, D + 4, C("#d8b080"));
  m.box(bx - 1, by - 1, D, bx + 2, by, D + 3, P.metal);
  // upstairs: plaster, a slatted window, an AC and the vertical sign
  m.box(x0 + 1, gh + 5, D - 1, x1 - 1, H - 2, D, shades(["#d8cfbe", "#d2c9b8"], 2, seed));
  m.box(x0 + 3, gh + 8, D - 1, x0 + 10, H - 4, D, E("#ffd28a", 0.8));
  for (let x = x0 + 3; x < x0 + 10; x += 2) m.box(x, gh + 8, D - 1, x + 1, H - 4, D + 0.5, C("#2e2018"));
  m.box(x1 - 9, gh + 8, D, x1 - 3, gh + 12, D + 2, P.acBody);
  verticalSignBox(m, x0 + 1, gh + 2, fz, 13, 5);
  tiledRoof(m, x0, x1, 0, D, H, tile);
  // the ticket machine outside and a stack of crates
  m.box(x1 - 4, 0, D + 3, x1 - 1, 9, D + 5, C("#e8e8f0"));
  m.box(x1 - 4, 5, D + 5, x1 - 1, 8, D + 5.4, E("#7fd3ff", 1.0));
  for (let y = 1; y < 5; y++) m.set(x1 - 3, y, D + 5, y % 2 ? E("#ff6a3a", 1.2) : C("#3a3a44"));
  m.box(x0 + 1, 0, D + 3, x0 + 5, 3, D + 6, C("#c0303a"));
  m.box(x0 + 1, 3, D + 3, x0 + 5, 6, D + 6, C("#3a6ac0"));
  const signs: SignSpot[] = [
    { text: "ラーメン", color: "#ff6a3a", x: x0 + W / 2, y: gh - 2, z: D + 1.05, w: W - 6, h: 3.4, vertical: false, facing: "front" },
    { text: "麺", color: "#ffd28a", x: x0 + 2, y: gh + 8.5, z: fz + 2.5, w: 5, h: 12, vertical: true, facing: "side" },
  ];
  return { model: m, signs, door: [doorX + 3.5, fz + 2], body: [x0, 0, x1, D], lights: [[x0 + W / 2, 10, D - 4, "#ffc890"]] };
}

/** 花屋: green front, striped awning, buckets of flowers on tiered stands, planters spilling upstairs. */
function floristShop(seed: number, W: number): Built {
  const r = rand(seed);
  const D = 30,
    gh = 17,
    H = gh + 14;
  const { m, x0, x1, fz } = body(W, D, H);
  m.box(x0, 0, 0, x1, H, D, shades(["#e8e0d0", "#e2dac8", "#ece4d6"], 2, seed));
  const green = C("#2f5a3e");
  const flowers = ["#ff5a7a", "#ffd23f", "#ff8a3a", "#c07aff", "#f4f0e8", "#ff3e8a", "#7fd3ff"];
  const bloom = (x: number, y: number, z: number) => {
    m.blob(x, y, z, 1.6, P.leaf, 0.3, x * 7 + y);
    for (let k = 0; k < 4; k++) m.set(x - 1 + Math.floor(r() * 3), y + Math.floor(r() * 2), z - 1 + Math.floor(r() * 3), C(flowers[Math.floor(r() * flowers.length)]));
  };
  // the shop: warm light, plants on stepped shelves inside, a counter with wrapping paper
  m.clear(x0 + 2, 1, D - 10, x1 - 2, gh - 4, D);
  m.box(x0 + 2, 0, D - 10, x1 - 2, 1, D, C("#8a7a64"));
  m.box(x0 + 2, 1, D - 11, x1 - 2, gh - 4, D - 10, E("#fff0d0", 0.8));
  m.box(x0 + 2, gh - 5, D - 10, x1 - 2, gh - 4, D, E("#fff4e0", 0.8));
  for (let k = 0; k < 3; k++) {
    m.box(x0 + 2, 1 + k * 3, D - 10, x1 - 2, 2 + k * 3, D - 7 + k, P.woodLight);
    for (let x = x0 + 4; x < x1 - 3; x += 4) bloom(x, 3 + k * 3, D - 9 + k);
  }
  // green-painted front: frames, the door, a fascia
  const doorX = x0 + 3;
  m.box(x0, 0, D - 1, x0 + 2, gh, D, green);
  m.box(x1 - 2, 0, D - 1, x1, gh, D, green);
  m.box(doorX + 6, 0, D - 1, doorX + 7, gh - 4, D, green);
  m.box(doorX + 7, 0, D - 1, x1 - 2, 2, D, green);
  for (let x = doorX + 13; x < x1 - 2; x += 6) m.box(x, 2, D - 1, x + 1, gh - 4, D, green);
  m.box(x0, gh - 4, D - 1, x1, gh, D + 1, green);
  // striped awning, green and cream
  for (let k = 0; k < 6; k++) m.box(x0 - 1, gh - 4 - Math.floor(k / 2), D + 1 + k, x1 + 1, gh - 3 - Math.floor(k / 2), D + 2 + k, (x) => (Math.floor(x / 3) % 2 ? C("#3a7a4a") : C("#efe8d8")));
  for (let x = x0 - 1; x < x1 + 1; x++) if (x % 3 !== 1) m.set(x, gh - 8, D + 6, Math.floor(x / 3) % 2 ? C("#3a7a4a") : C("#efe8d8"));
  // outside: a tiered stand of buckets, a potted tree each side
  for (let k = 0; k < 3; k++) {
    const zb = D + 6 - k * 2;
    m.box(doorX + 8, 0, zb - 1, x1 - 1, k * 2 + 1, zb + 1, P.woodLight);
    for (let x = doorX + 9; x < x1 - 2; x += 3) {
      m.box(x, k * 2 + 1, zb - 1, x + 2, k * 2 + 3, zb + 1, C(k % 2 ? "#5a6a7a" : "#7a8a9a"));
      bloom(x + 1, k * 2 + 4, zb);
    }
  }
  m.box(x0 - 2, 0, D + 1, x0 + 1, 3, D + 4, P.pot);
  m.box(x0 - 1, 3, D + 2, x0, 7, D + 3, P.trunk);
  m.blob(x0 - 0.5, 9, D + 2.5, 2.8, P.leaf, 0.3, seed);
  // upstairs: a balcony with planters and trailing green, a lit window
  m.box(x0 + 3, gh + 2, D - 1, x1 - 3, H - 3, D, E("#ffe2b8", 0.85));
  for (let x = x0 + 3; x < x1 - 3; x += 6) m.box(x, gh + 2, D - 1, x + 1, H - 3, D, C("#3a3530"));
  m.box(x0 + 1, gh + 1, D, x1 - 1, gh + 2, D + 4, C("#d8d0c0"));
  for (let x = x0 + 1; x < x1 - 1; x += 2) m.box(x, gh + 2, D + 3, x + 1, gh + 6, D + 4, C("#2a2630"));
  m.box(x0 + 1, gh + 6, D + 3, x1 - 1, gh + 7, D + 4, C("#2a2630"));
  for (let x = x0 + 2; x < x1 - 2; x += 4) {
    m.box(x, gh + 2, D + 1, x + 3, gh + 4, D + 3, P.pot);
    bloom(x + 1.5, gh + 5, D + 2);
    for (let y = gh - 2; y < gh + 2; y++) if (hash(x, y, seed) > 0.4) m.set(x + 1, y, D + 4, P.leaf);
  }
  tiledRoof(m, x0, x1, 0, D, H, shades(["#3a4a3a", "#34443a", "#405040"], 1, seed));
  const signs: SignSpot[] = [{ text: "花屋 FLOWERS", color: "#5cff9a", x: x0 + W / 2, y: gh - 2, z: D + 1.05, w: W - 6, h: 2.6, vertical: false, facing: "front" }];
  return { model: m, signs, door: [doorX + 3, fz + 2], body: [x0, 0, x1, D], lights: [[x0 + W / 2, 9, D - 4, "#fff0d0"]] };
}

/** 茶屋: a timber tea house, lattice screens, green noren, a red bench under a red parasol. */
function teaHouse(seed: number, W: number): Built {
  const D = 30,
    gh = 17,
    H = gh + 15;
  const { m, x0, x1, fz } = body(W, D, H);
  m.box(x0, 0, 0, x1, H, D, P.wood);
  m.box(x0, 0, 0, x1, 2, D, C("#6a6460"));
  // inside: tatami, a low table, a tea shelf of canisters, warm paper light
  m.clear(x0 + 2, 2, D - 9, x1 - 2, gh - 3, D);
  m.box(x0 + 2, 1, D - 9, x1 - 2, 2, D, (x, _y, z) => ((x + z) % 4 < 2 ? C("#b8b070") : C("#a8a060")));
  m.box(x0 + 2, 2, D - 10, x1 - 2, gh - 3, D - 9, E("#f0d8a0", 0.8));
  for (let x = x0 + 3; x < x1 - 3; x += 3) m.box(x, 9, D - 9, x + 2, 12, D - 8, C(hash(x, 1, seed) > 0.5 ? "#2a4a3a" : "#8a3a2a"));
  m.box(x0 + 3, 8, D - 9, x1 - 3, 9, D - 7, P.woodLight);
  m.box(x0 + 6, 2, D - 6, x1 - 6, 4, D - 3, C("#5a3a24"));
  // front: lattice over the window, open entrance with a green noren
  const doorX = x1 - 10;
  for (let x = x0 + 2; x < doorX - 1; x += 2) m.box(x, 2, D - 1, x + 1, gh - 3, D, C("#3a2618"));
  for (let y = 4; y < gh - 3; y += 4) m.box(x0 + 2, y, D - 1, doorX - 1, y + 1, D, C("#3a2618"));
  m.box(doorX - 1, 2, D - 1, doorX, gh - 3, D, C("#3a2618"));
  m.box(x1 - 2, 2, D - 1, x1 - 1, gh - 3, D, C("#3a2618"));
  for (let x = doorX - 1; x < x1 - 1; x += 3) m.box(x, gh - 9, D, x + 2, gh - 3, D + 1, C("#3a6a3a"));
  m.box(doorX + 3, gh - 7, D + 1, doorX + 5, gh - 5, D + 1.4, C("#f0ece4"));
  // the eave, a paper lantern with 茶, the upper floor's sudare blinds
  const tile = shades(["#3a3a46", "#34343e", "#40404c"], 1, seed);
  for (let k = 0; k < 4; k++) m.box(x0 - 1, gh - 1 - Math.floor(k / 2), D + k - 1, x1 + 1, gh - Math.floor(k / 2), D + k, tile);
  lantern(m, doorX + 2, gh - 14, D + 2, "#f4e8d0");
  m.box(x0 + 1, gh, D - 1, x1 - 1, H - 2, D, shades(["#d8cfbe", "#d2c9b8"], 2, seed));
  m.box(x0 + 3, gh + 3, D - 1, x1 - 3, H - 4, D, E("#ffc070", 0.7));
  for (let y = gh + 3; y < H - 4; y++) if (y % 2) m.box(x0 + 3, y, D, x1 - 3, y + 1, D + 0.5, C("#b89a60"));
  m.box(x0 + 2, gh + 2, D, x1 - 2, gh + 3, D + 2, P.wood);
  tiledRoof(m, x0, x1, 0, D, H, tile);
  // outside: a red bench (緋毛氈) under a red parasol, a stone lantern, a little bamboo
  m.box(x0 + 1, 2, D + 3, x0 + 11, 3, D + 6, C("#c0303a"));
  for (const x of [x0 + 1, x0 + 10]) m.box(x, 0, D + 3, x + 1, 2, D + 6, P.wood);
  const ux = x0 + 6,
    uz = D + 5;
  m.box(ux, 0, uz, ux + 1, 15, uz + 1, P.wood);
  for (let k = 0; k < 3; k++) m.cylinder(ux + 0.5, 15 + k, uz + 0.5, 6 - k * 2, 1, C(k === 0 ? "#c0303a" : "#d84040"));
  for (let a = 0; a < 8; a++) m.set(ux + Math.round(Math.cos(a * 0.785) * 5), 15, uz + Math.round(Math.sin(a * 0.785) * 5), C("#f0d8a0"));
  m.box(x1 - 4, 0, D + 4, x1 - 1, 2, D + 7, C("#8a8680"));
  m.box(x1 - 3.5, 2, D + 4.5, x1 - 1.5, 5, D + 6.5, C("#9a9690"));
  m.box(x1 - 4, 5, D + 4, x1 - 1, 6, D + 7, C("#8a8680"));
  m.box(x1 - 3.5, 4, D + 4.5, x1 - 1.5, 5, D + 6.5, E("#ffd28a", 1.2));
  for (const x of [x1 - 7, x1 - 6]) m.box(x, 0, D + 6, x + 1, 12, D + 7, C("#6a9a4a"));
  m.blob(x1 - 6.5, 12, D + 6.5, 1.8, P.leaf, 0.4, seed);
  const signs: SignSpot[] = [{ text: "茶屋 TEA", color: "#b8e07a", x: x0 + W / 2, y: gh + 1.5, z: D + 2.05, w: W - 8, h: 2.4, vertical: false, facing: "front" }];
  return { model: m, signs, door: [doorX + 4, fz + 2], body: [x0, 0, x1, D], lights: [[x0 + W / 2, 9, D - 4, "#ffc890"]] };
}

/** ガチャ: a pop arcade, rows of capsule machines out front, claw machines inside, a giant capsule. */
function gachaShop(seed: number, W: number): Built {
  const D = 30,
    gh = 18,
    H = gh + 18;
  const { m, x0, x1, fz } = body(W, D, H);
  m.box(x0, 0, 0, x1, H, D, shades(["#f4eef4", "#ece4ee", "#f8f2f6"], 2, seed));
  const pink = "#ff3e8a",
    cyan = "#3ef0ff";
  const caps = ["#ff3e8a", "#3ef0ff", "#f4b728", "#5cff9a", "#b07bff", "#ff8a3a", "#f4f0e8"];
  /** A capsule machine: coloured base, a clear dome full of capsules, a crank. */
  const machine = (x: number, y: number, z: number, base: string) => {
    m.box(x, y, z, x + 3, y + 3, z + 3, C(base));
    m.box(x + 1, y + 1, z + 3, x + 2, y + 2, z + 3.5, C("#d8d4cc"));
    m.box(x, y + 3, z, x + 3, y + 6, z + 3, G("#cfe8ff"));
    for (let k = 0; k < 3; k++) m.set(x + (k % 3), y + 3 + (k % 2), z + 1 + (k % 2), C(caps[(x + y + k) % caps.length]));
    m.box(x, y + 6, z, x + 3, y + 7, z + 3, C(base));
  };
  // inside: pink light, claw machines along the back, rows of capsule machines
  m.clear(x0 + 2, 1, D - 12, x1 - 2, gh - 4, D);
  m.box(x0 + 2, 0, D - 12, x1 - 2, 1, D, (x, _y, z) => ((x >> 1) + (z >> 1)) % 2 ? C("#2a2236") : C("#3a2a52"));
  m.box(x0 + 2, 1, D - 13, x1 - 2, gh - 4, D - 12, E("#ffb8d8", 0.8));
  m.box(x0 + 2, gh - 5, D - 12, x1 - 2, gh - 4, D, E("#ffd0e8", 0.9));
  for (let x = x0 + 3; x < x1 - 6; x += 7) {
    m.box(x, 1, D - 12, x + 6, 4, D - 7, C(hash(x, 2, seed) > 0.5 ? pink : cyan));
    m.box(x, 4, D - 12, x + 6, 12, D - 7, G("#e0f0ff"));
    m.box(x, 12, D - 12, x + 6, 13, D - 7, E(hash(x, 3, seed) > 0.5 ? pink : cyan, 1.4));
    for (let k = 0; k < 4; k++) m.set(x + 1 + k, 5, D - 10 + (k % 2), C(caps[(x + k) % caps.length]));
  }
  for (let x = x0 + 3; x < x1 - 4; x += 4) machine(x, 0, D - 6, caps[(x + 1) % caps.length]);
  // the front: wide open, a neon frame round the opening
  m.box(x0, 0, D - 1, x0 + 2, gh, D, C("#2a2236"));
  m.box(x1 - 2, 0, D - 1, x1, gh, D, C("#2a2236"));
  m.box(x0, gh - 4, D - 1, x1, gh, D + 1, C("#2a2236"));
  m.box(x0 + 1, 0, D, x0 + 2, gh - 4, D + 1, E(pink, 2));
  m.box(x1 - 2, 0, D, x1 - 1, gh - 4, D + 1, E(pink, 2));
  m.box(x0 + 1, gh - 5, D, x1 - 1, gh - 4, D + 1, E(cyan, 2));
  // two rows of capsule machines out on the pavement, stacked two high, either side of the way in
  for (const [xa, xb] of [
    [x0 + 1, x0 + 10],
    [x1 - 10, x1 - 1],
  ])
    for (let x = xa; x < xb - 2; x += 3)
      for (const y of [0, 7]) machine(x, y, D + 1, caps[(x + y) % caps.length]);
  // upstairs: a big round capsule on the facade, half pink half white, and a lit band of windows
  const cx = x0 + Math.floor(W / 2),
    cy = gh + 9;
  for (let y = -6; y <= 6; y++)
    for (let x = -6; x <= 6; x++) {
      if (x * x + y * y > 38) continue;
      m.set(cx + x, cy + y, D, y > 0 ? C(pink) : y === 0 ? C("#2a2236") : C("#f4f0e8"));
      if (x * x + y * y < 25) m.set(cx + x, cy + y, D + 1, y > 0 ? C("#ff6aa8") : y === 0 ? C("#2a2236") : C("#ffffff"));
    }
  m.box(cx - 1, cy - 1, D + 2, cx + 2, cy + 2, D + 2.5, C("#f4b728"));
  for (const x of [x0 + 1, x1 - 5]) m.box(x, gh + 3, D - 1, x + 4, H - 4, D, E(hash(x, 4, seed) > 0.5 ? "#c07aff" : "#ff7ab8", 0.9));
  m.box(x0, H - 3, D - 1, x1, H - 2, D + 1, E(pink, 1.6));
  m.box(x0 - 1, H - 2, 0, x1 + 1, H, D + 1, C("#2a2236"));
  roofClutter(m, x0, x1, D, H, seed, { tank: false, stairs: false });
  const signs: SignSpot[] = [{ text: "ガチャ GACHA", color: pink, x: x0 + W / 2, y: gh - 2, z: D + 1.05, w: W - 6, h: 2.8, vertical: false, facing: "front" }];
  return {
    model: m,
    signs,
    door: [x0 + W / 2, fz + 2],
    body: [x0, 0, x1, D],
    lights: [
      [x0 + W / 2, 9, D - 4, "#ff9ad0"],
      [x0 + W / 2, 4, D + 3, "#3ef0ff"],
    ],
  };
}
