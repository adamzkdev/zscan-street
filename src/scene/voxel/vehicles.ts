import { C, E, G, shades, VoxelModel } from "./model";
import { P } from "./parts";

/**
 * Vehicles as voxel models. The front points to +x, the passenger side is +z. Wheels and doors
 * are separate meshes (they move), so the models leave their openings empty.
 */

export const BUS = {
  /** Voxel size of the model. */
  w: 54,
  h: 21,
  d: 15,
  /** Floor level inside (voxels). */
  floor: 4,
  /** Door openings on the +z side: x ranges. */
  doors: [
    [44, 50],
    [22, 28],
  ] as [number, number][],
  /** Window band. */
  win: [10, 17] as [number, number],
};

/** Seats: [x, z] of each seat's centre in voxels, front rows first; then standing spots in the aisle. */
export const BUS_SEATS: [number, number][] = (() => {
  const seats: [number, number][] = [];
  for (let x = 40; x >= 6; x -= 5) {
    seats.push([x, 3.5]);
    const nearDoor = BUS.doors.some(([a, b]) => x + 2 >= a && x - 2 <= b);
    if (!nearDoor) seats.push([x, 11.5]);
  }
  return seats;
})();
export const BUS_STANDING: [number, number][] = [40, 35, 30, 25, 20, 15, 10].map((x) => [x, 7.5]);

/** The block bus, inside and out: two-tone body, seats, poles, straps, driver's cab, lights. */
export function busModel() {
  const { w, h, d, floor } = BUS;
  const m = new VoxelModel(w, h, d);
  const body = C("#2c3140");
  const bodyLight = C("#3a4054");
  const gold = C("#f4b728");
  const inner = shades(["#d8cfbe", "#d2c9b8"], 2, 3);
  // chassis and skirt
  m.box(1, 1, 1, w - 1, floor, d - 1, C("#1a1c24"));
  // shell: walls two voxels thick, painted outside, cream inside
  m.box(0, floor, 0, w, h - 2, d, body);
  m.box(2, floor, 2, w - 2, h - 2, d - 2, inner);
  m.clear(2, floor + 1, 2, w - 2, h - 3, d - 2);
  // floor: grey with a ribbed aisle and yellow edge
  m.box(2, floor, 2, w - 2, floor + 1, d - 2, C("#5a5864"));
  for (let x = 2; x < w - 2; x += 2) m.box(x, floor, 6, x + 1, floor + 1, 9, C("#4a4854"));
  // gold stripe and the lighter upper body
  m.paint(0, BUS.win[0] - 2, 0, w, BUS.win[0] - 1, d, gold);
  m.paint(0, BUS.win[1], 0, w, h - 2, d, bodyLight);
  // window band: openings with pillars every six voxels (the glass is a separate pane)
  for (let x = 3; x < w - 3; x++) {
    if ((x - 3) % 6 === 0) continue;
    m.clear(x, BUS.win[0], 0, x + 1, BUS.win[1], 2);
    m.clear(x, BUS.win[0], d - 2, x + 1, BUS.win[1], d);
  }
  // windscreen and rear window
  m.clear(w - 2, floor + 4, 2, w, h - 4, d - 2);
  m.clear(0, BUS.win[0], 3, 2, BUS.win[1], d - 3);
  // door openings
  for (const [a, b] of BUS.doors) m.clear(a, floor + 1, d - 2, b, h - 4, d);
  // roof with units
  m.box(0, h - 2, 0, w, h - 1, d, bodyLight);
  m.box(1, h - 1, 2, w - 1, h, d - 2, C("#3a3f50"));
  m.box(8, h - 1, 3, 20, h, d - 3, C("#4a5064"));
  m.box(30, h - 1, 4, 38, h, d - 4, C("#4a5064"));
  // ceiling light strips and the warm interior
  m.box(3, h - 3, 3, w - 6, h - 2, 4, E("#fff0d0", 1.25));
  m.box(3, h - 3, d - 4, w - 6, h - 2, d - 3, E("#fff0d0", 1.25));
  // seats: cushion + backrest, red moquette
  const seat = C("#9a3428"),
    seatDark = C("#7a2820"),
    frame = C("#6a6672");
  for (const [sx, sz] of BUS_SEATS) {
    const x = Math.round(sx),
      z = Math.floor(sz) - 1;
    m.box(x - 2, floor + 1, z, x + 1, floor + 3, z + 3, frame);
    m.box(x - 2, floor + 3, z, x + 1, floor + 4, z + 3, seat);
    m.box(x - 3, floor + 3, z, x - 2, floor + 8, z + 3, seatDark);
    m.box(x - 3, floor + 8, z, x - 2, floor + 9, z + 3, C("#c8c4cc"));
  }
  // yellow poles by the doors and mid-cabin, a grab rail with straps along the ceiling
  const pole = C("#e8b830");
  for (const [a, b] of BUS.doors) for (const x of [a - 1, b]) m.box(x, floor + 1, 10, x + 1, h - 3, 11, pole);
  for (const x of [16, 34]) m.box(x, floor + 1, 5, x + 1, h - 3, 6, pole);
  m.box(4, h - 4, 5, w - 8, h - 3, 6, C("#c8c4cc"));
  m.box(4, h - 4, 10, w - 8, h - 3, 11, C("#c8c4cc"));
  for (let x = 6; x < w - 8; x += 4) {
    m.box(x, h - 5, 5, x + 1, h - 4, 6, C("#e8e4dc"));
    m.box(x, h - 5, 10, x + 1, h - 4, 11, C("#e8e4dc"));
  }
  // driver's cab: seat, wheel, dashboard with a screen, partition
  m.box(w - 8, floor + 1, 2, w - 5, floor + 4, 6, C("#2a2a34"));
  m.box(w - 9, floor + 4, 2, w - 8, floor + 9, 6, C("#2a2a34"));
  m.box(w - 4, floor + 4, 2, w - 2, floor + 7, d - 2, C("#24242c"));
  m.box(w - 4, floor + 7, 3, w - 3, floor + 9, 6, P.black);
  m.box(w - 4, floor + 7, 7, w - 3, floor + 8, 11, E("#59e3ff", 1.4));
  m.box(w - 10, floor + 1, 6, w - 9, floor + 10, 7, C("#9a98a4"));
  // ticket machine by the front door
  m.box(w - 11, floor + 1, d - 5, w - 9, floor + 8, d - 3, C("#5a6a8a"));
  m.box(w - 11, floor + 6, d - 3, w - 9, floor + 7, d - 2, E("#ffd28a", 1.4));
  // front: bumper, headlights, grille; back: tail lights
  m.box(w - 1, 2, 1, w, 5, d - 1, C("#1a1a20"));
  m.box(w - 1, 5, 2, w, 7, 4, E("#fff6e0", 3.5));
  m.box(w - 1, 5, d - 4, w, 7, d - 2, E("#fff6e0", 3.5));
  m.box(w - 1, 5, 5, w, 7, d - 5, C("#3a3a44"));
  m.box(0, 5, 2, 1, 9, 4, E("#ff2a1a", 2.5));
  m.box(0, 5, d - 4, 1, 9, d - 2, E("#ff2a1a", 2.5));
  m.box(0, 2, 1, 1, 5, d - 1, C("#1a1a20"));
  // wheel arches
  for (const x of [10, 41]) {
    m.clear(x - 4, 0, 0, x + 4, floor + 1, 2);
    m.clear(x - 4, 0, d - 2, x + 4, floor + 1, d);
  }
  // amber running lights along the roof edge
  for (let x = 4; x < w - 4; x += 9) m.box(x, h - 2, d - 1, x + 3, h - 1, d, E("#ffb347", 2.4));
  return m;
}

/** Taxi: yellow body with a checker band, roof lamp, white seat covers, chrome trim. */
export function taxiModel() {
  const w = 27,
    h = 10,
    d = 11;
  const m = new VoxelModel(w, h + 3, d);
  const body = shades(["#f2c230", "#eabb28", "#f6c838"], 2, 5),
    trim = C("#a8acb8");
  m.box(1, 1, 0, w - 1, 5, d, body);
  m.box(0, 2, 1, w, 4, d - 1, body);
  m.box(7, 5, 1, w - 6, 9, d - 1, body);
  // windows: cabin openings with pillars
  for (let x = 8; x < w - 7; x++) {
    if (x === 14 || x === 15) continue;
    m.clear(x, 5, 0, x + 1, 8, 2);
    m.clear(x, 5, d - 2, x + 1, 8, d);
  }
  m.box(8, 5, 2, w - 7, 8, d - 2, 0);
  m.box(8, 4, 2, w - 7, 5, d - 2, C("#3a3a44"));
  // seats with white lace covers
  for (const x of [11, 17]) {
    m.box(x, 4, 2, x + 3, 6, d - 2, C("#3a3a48"));
    m.box(x - 1, 5, 2, x, 8, d - 2, C("#e8e4dc"));
  }
  m.box(w - 6, 5, 1, w - 5, 8, d - 1, G("#2a3448"));
  m.box(6, 5, 1, 7, 8, d - 1, G("#2a3448"));
  m.box(7, 9, 1, w - 6, 10, d - 1, body);
  // roof lamp and the green "vacant" sign glow
  m.box(14, 10, 4, 18, 12, 7, E("#ffc84a", 2));
  m.box(14, 12, 4, 18, 13, 7, C("#2a2a30"));
  m.box(w - 9, 5, 1, w - 7, 6, 2, E("#3ee08f", 2));
  // checker band along both sides, then trim, lights, plate
  for (let x = 1; x < w - 1; x++)
    for (const z of [0, d - 1]) {
      m.set(x, 4, z, x % 2 ? C("#1a1a20") : C("#f2f0e8"));
      m.set(x, 3, z, x % 2 ? C("#f2f0e8") : C("#1a1a20"));
    }
  m.box(0, 2, 0, w, 3, 1, trim);
  m.box(0, 2, d - 1, w, 3, d, trim);
  m.box(w - 1, 3, 1, w, 4, 3, E("#fff6e0", 3));
  m.box(w - 1, 3, d - 3, w, 4, d - 1, E("#fff6e0", 3));
  m.box(0, 3, 1, 1, 4, 3, E("#ff2a1a", 2.4));
  m.box(0, 3, d - 3, 1, 4, d - 1, E("#ff2a1a", 2.4));
  m.box(w - 1, 2, 4, w, 3, 7, C("#e8e4c0"));
  for (const x of [5, w - 6]) {
    m.clear(x - 2, 0, 0, x + 3, 2, 1);
    m.clear(x - 2, 0, d - 1, x + 3, 2, d);
  }
  return m;
}

/** Stretch limousine: long black body, chrome, tinted windows, little flags on the front. */
export function limoModel() {
  const w = 46,
    h = 10,
    d = 12;
  const m = new VoxelModel(w, h + 3, d);
  const body = shades(["#0e0e14", "#121218"], 3, 2),
    chrome = C("#c8ccd8");
  m.box(1, 1, 0, w - 1, 5, d, body);
  m.box(0, 2, 1, w, 4, d - 1, body);
  m.box(8, 5, 1, w - 7, 9, d - 1, body);
  m.box(7, 9, 1, w - 6, 10, d - 1, body);
  for (let x = 9; x < w - 8; x++) {
    if ((x - 9) % 7 === 6) continue;
    m.box(x, 6, 0, x + 1, 8, 1, G("#0a0c14"));
    m.box(x, 6, d - 1, x + 1, 8, d, G("#0a0c14"));
  }
  m.box(w - 7, 5, 1, w - 6, 8, d - 1, G("#1a2030"));
  // chrome lines, grille, lights, flags
  m.box(0, 4, 0, w, 5, 1, chrome);
  m.box(0, 4, d - 1, w, 5, d, chrome);
  m.box(w - 1, 2, 3, w, 4, d - 3, chrome);
  m.box(w - 1, 3, 1, w, 4, 3, E("#fff6e0", 3));
  m.box(w - 1, 3, d - 3, w, 4, d - 1, E("#fff6e0", 3));
  m.box(0, 3, 1, 1, 4, 3, E("#ff2a1a", 2.4));
  m.box(0, 3, d - 3, 1, 4, d - 1, E("#ff2a1a", 2.4));
  for (const z of [1, d - 2]) {
    m.box(w - 4, 5, z, w - 3, 8, z + 1, chrome);
    m.box(w - 6, 7, z, w - 4, 8, z + 1, gold());
  }
  // ambient strip along the cabin floor, seen through the tint
  m.box(10, 5, 3, w - 9, 6, d - 3, E("#b07bff", 1.1));
  for (const x of [7, w - 7]) {
    m.clear(x - 2, 0, 0, x + 3, 2, 1);
    m.clear(x - 2, 0, d - 1, x + 3, 2, d);
  }
  return m;
}

const gold = () => C("#f4b728");

/**
 * Delivery truck: cab up front, a box body with the operator's livery and roller door at the back.
 * `livery` is the body colour: violet for the Proof Factory, amber for the Transparent depot.
 */
export function truckModel(livery: string, label: "proof" | "depot") {
  const w = 40,
    h = 18,
    d = 14;
  const m = new VoxelModel(w, h, d);
  const cab = C("#d8d4cc"),
    dark = C("#1a1a20");
  m.box(1, 1, 1, w - 1, 4, d - 1, dark);
  // box body
  m.box(1, 4, 0, 29, h - 1, d, C(livery));
  m.box(1, h - 1, 0, 29, h, d, C("#e8e4dc"));
  m.box(1, 4, 0, 29, 5, d, C("#2a2830"));
  // livery: a band and the operator's mark
  m.paint(2, 9, 0, 28, 11, d, label === "proof" ? C("#f4b728") : C("#3a3a44"));
  for (const z of [0, d - 1]) {
    m.box(6, 12, z, 10, 16, z + 1, label === "proof" ? C("#f4b728") : C("#ffffff"));
    m.box(7, 13, z, 9, 15, z + 1, C(livery));
  }
  // roller door at the back
  for (let y = 5; y < h - 1; y++) m.box(0, y, 1, 1, y + 1, d - 1, y % 2 ? C("#9a96a2") : C("#8a8692"));
  // cab
  m.box(29, 4, 0, w - 1, 13, d, cab);
  m.box(w - 1, 4, 1, w, 11, d - 1, cab);
  m.box(31, 8, 0, w - 2, 12, 1, G("#2a3448"));
  m.box(31, 8, d - 1, w - 2, 12, d, G("#2a3448"));
  m.box(w - 1, 8, 1, w, 12, d - 1, G("#2a3448"));
  m.box(29, 13, 1, w - 3, 14, d - 1, C("#c8c4bc"));
  m.box(w - 1, 4, 2, w, 6, 4, E("#fff6e0", 3));
  m.box(w - 1, 4, d - 4, w, 6, d - 2, E("#fff6e0", 3));
  m.box(w - 1, 2, 3, w, 4, d - 3, C("#3a3a44"));
  m.box(0, 5, 1, 1, 7, 2, E("#ff2a1a", 2.4));
  m.box(0, 5, d - 2, 1, 7, d - 1, E("#ff2a1a", 2.4));
  m.box(29, 13, 6, 31, 14, 8, E("#ffb347", 2));
  for (const x of [7, 33]) {
    m.clear(x - 3, 0, 0, x + 4, 4, 1);
    m.clear(x - 3, 0, d - 1, x + 4, 4, d);
  }
  return m;
}

/** City car: a hatchback in any paint, with lit headlights and a neon underglow strip. */
export function sedanModel(paint: string, glow: string) {
  const w = 24,
    d = 11;
  const m = new VoxelModel(w, 12, d);
  const body = C(paint);
  m.box(1, 1, 0, w - 1, 5, d, body);
  m.box(0, 2, 1, w, 4, d - 1, body);
  m.box(6, 5, 1, w - 7, 9, d - 1, body);
  m.box(7, 6, 0, w - 8, 8, d, G("#1e2638"));
  m.box(w - 8, 5, 1, w - 7, 8, d - 1, G("#2a3448"));
  m.box(5, 5, 1, 6, 8, d - 1, G("#2a3448"));
  m.box(6, 9, 1, w - 7, 10, d - 1, body);
  m.box(w - 1, 3, 1, w, 4, 3, E("#fff6e0", 3));
  m.box(w - 1, 3, d - 3, w, 4, d - 1, E("#fff6e0", 3));
  m.box(0, 3, 1, 1, 4, 3, E("#ff2a1a", 2.4));
  m.box(0, 3, d - 3, 1, 4, d - 1, E("#ff2a1a", 2.4));
  m.box(3, 0, 1, w - 3, 1, 2, E(glow, 1.8));
  m.box(3, 0, d - 2, w - 3, 1, d - 1, E(glow, 1.8));
  for (const x of [5, w - 6]) {
    m.clear(x - 2, 0, 0, x + 3, 2, 1);
    m.clear(x - 2, 0, d - 1, x + 3, 2, d);
  }
  return m;
}
