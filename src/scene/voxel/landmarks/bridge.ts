import type { Built } from "../buildings";
import { C, E, hash, shades, VoxelModel, type Paint } from "../model";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * The suspension bridge over the bay, Golden Gate style: International Orange, two Art-Deco towers
 * with stepped legs and panelled portal struts, main cables draping from saddle to saddle and down
 * to concrete anchorages at both ends, a suspender every two metres, a stiffening truss under a
 * four-lane deck with walkways, railings and sodium lamps, red aviation lights on the tower tops.
 * The deck rises from the quay (front, +z) to about 9 m over the water and comes down on the
 * headland (back, z = 0).
 *
 * Points (model voxels, scale 2): `deckFront`, `deckBack` the road's centre line at each end, on
 * its surface; `towerA` (the back tower) and `towerB` (the front one), the top of each, mid-way
 * between the legs.
 */
export function bridge(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const VPM = 6 / k; // voxels per metre
  const H = Math.round(40 * VPM);
  const m = new VoxelModel(W, H, D);
  const orange = shades(["#c0362c", "#c43d2e", "#b9342a"], 1, seed);
  const orangeDark = C("#8e271f");
  const orangeDeep = C("#6e1e19");
  const concrete = shades(["#8d8a92", "#86838b", "#94919a"], 1, seed + 1);
  const concreteDark = C("#5d5a62");
  const asphalt = shades(["#3a3a42", "#36363e", "#3e3e46"], 1, seed + 2);
  const paint = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));

  // ---- geometry ----
  const span = D;
  // the towers (world z 164 and 204 with the front at 140: 24 m and 64 m from the front)
  const TA = Math.round(D - 64 * VPM),
    TB = Math.round(D - 24 * VPM);
  const MID = (TA + TB) / 2;
  const DECK_T = Math.round(8 * VPM),
    DECK_M = Math.round(9 * VPM);
  /** Road surface height (the top layer of the road) at z. */
  const deckY = (z: number) => {
    if (z >= TA && z <= TB) {
      const u = (z - MID) / ((TB - TA) / 2);
      return Math.round(DECK_T + (DECK_M - DECK_T) * (1 - u * u));
    }
    const t = z < TA ? z / TA : (span - 1 - z) / (span - 1 - TB);
    // gentle at the ends, a straight ramp in between
    const s = t < 0.12 ? (t * t) / 0.24 : t - 0.06;
    return Math.max(0, Math.round((DECK_T * s) / 0.94));
  };
  const XA = 5,
    XB = W - 6; // cable planes (inner edge of the legs)
  const ROAD0 = 7,
    ROAD1 = W - 7;
  const TOP = Math.round(37.4 * VPM); // tower top
  const SADDLE = TOP - 3;

  // ---- deck: slab, road, walkways, railings, truss ----
  for (let z = 0; z < D; z++) {
    const dy = deckY(z);
    const td = Math.max(0, Math.min(9, dy - 3));
    // abutments where the deck is too low for the truss: solid concrete down to the ground
    if (td < 3) m.box(0, 0, z, W, dy, z + 1, (x, y, zz) => (x === 0 || x === W - 1 ? (y % 3 === 2 ? concreteDark : paint(concrete, x, y, zz)) : paint(concrete, x, y, zz)));
    // the slab under the road (dark steel), the road on it
    if (dy > 0) m.box(0, dy - 1, z, W, dy, z + 1, orangeDark);
    m.box(ROAD0, dy, z, ROAD1, dy + 1, z + 1, asphalt);
    // lane markings: white edge lines, dashed lane lines, a double yellow centre line
    m.set(ROAD0, dy, z, C("#d8d4cc"));
    m.set(ROAD1 - 1, dy, z, C("#d8d4cc"));
    if (z % 8 < 4) {
      m.set(ROAD0 + 7, dy, z, C("#e8e4dc"));
      m.set(ROAD1 - 8, dy, z, C("#e8e4dc"));
    }
    m.set(W / 2 - 1, dy, z, C("#e8b830"));
    m.set(W / 2, dy, z, C("#e8b830"));
    // the concrete barriers between road and walkways, the walkways a step up
    for (const x of [ROAD0 - 1, ROAD1]) m.box(x, dy, z, x + 1, dy + 3, z + 1, x === ROAD0 - 1 || x === ROAD1 ? C("#a8a4ae") : concrete);
    m.box(0, dy, z, ROAD0 - 1, dy + 1, z + 1, C("#7e7a84"));
    m.box(ROAD1 + 1, dy, z, W, dy + 1, z + 1, C("#7e7a84"));
    // outer railings: posts every 2 voxels, a top rail and a mid rail
    for (const x of [0, W - 1]) {
      if (z % 2 === 0) m.box(x, dy + 1, z, x + 1, dy + 4, z + 1, orange);
      m.set(x, dy + 4, z, orangeDark);
      m.set(x, dy + 2, z, orange);
    }
    // the stiffening truss: chords, posts and Warren diagonals on both faces
    if (td >= 3) {
      const bot = dy - 1 - td;
      const panel = 12;
      const p = z % panel;
      const up = Math.floor(z / panel) % 2 === 0;
      for (const x of [0, 1, W - 2, W - 1]) {
        const outer = x === 0 || x === W - 1;
        m.set(x, bot, z, orange);
        m.set(x, dy - 2, z, orange);
        if (p === 0) m.box(x, bot, z, x + 1, dy - 1, z + 1, orange);
        const dyy = bot + Math.round(((up ? p : panel - p) / panel) * (td - 1));
        if (outer) m.set(x, dyy, z, orange);
      }
      // stringers under the slab, floor beams and lateral bracing at the bottom chord
      for (const x of [8, 14, 20, 27, 33]) m.set(x, dy - 2, z, orangeDeep);
      if (p === 0) m.box(0, bot, z, W, bot + 1, z + 1, orangeDark);
      const bx = Math.round(((up ? p : panel - p) / panel) * (W - 1));
      m.set(bx, bot, z, orangeDeep);
      m.set(W - 1 - bx, bot, z, orangeDeep);
    }
  }

  // ---- the towers ----
  const legTiers: [number, number, number, number][] = [
    // y0, y1, outer inset (x), half depth (z)
    [0, Math.round(16.5 * VPM), 0, 8],
    [Math.round(16.5 * VPM), Math.round(25 * VPM), 0, 7],
    [Math.round(25 * VPM), Math.round(32 * VPM), 1, 6],
    [Math.round(32 * VPM), TOP, 1, 5],
  ];
  const fluted = (tz: number) => (x: number, y: number, z: number) => {
    // vertical flutes on every face, a darker reveal at each setback
    const onZ = Math.abs(z - tz) >= 4;
    const f = onZ ? x % 3 === 1 : (z - tz + 30) % 3 === 1;
    return f ? orangeDark : paint(orange, x, y, z);
  };
  const towerTops: [number, number, number][] = [];
  for (const tz of [TA, TB]) {
    // the pier in the water: a rounded concrete fender
    for (let z = tz - 12; z <= tz + 12; z++)
      for (let x = -2; x < W + 2; x++) {
        const ez = Math.abs(z - tz) - 8;
        if (ez > 0 && (x - W / 2) ** 2 / (W / 2 + 2) ** 2 + (ez / 4.5) ** 2 > 1) continue;
        m.box(x, 0, z, x + 1, 7, z + 1, (xx, y, zz) => (y < 2 ? concreteDark : y === 6 ? C("#a3a0a8") : paint(concrete, xx, y, zz)));
      }
    for (const [y0, y1, inset, hz] of legTiers) {
      const p = fluted(tz);
      m.box(inset, Math.max(y0, 7), tz - hz, 7, y1, tz + hz + 1, p);
      m.box(W - 7, Math.max(y0, 7), tz - hz, W - inset, y1, tz + hz + 1, p);
      // the setback ledge
      m.box(inset, y1 - 1, tz - hz, 7, y1, tz + hz + 1, orangeDark);
      m.box(W - 7, y1 - 1, tz - hz, W - inset, y1, tz + hz + 1, orangeDark);
    }
    // the walkways go through the legs: a portal in each
    const dy = deckY(tz);
    m.clear(0, dy + 1, tz - 9, ROAD0 - 1, dy + 10, tz + 10);
    m.clear(ROAD1 + 1, dy + 1, tz - 9, W, dy + 10, tz + 10);
    for (const [a, b] of [
      [0, ROAD0 - 1],
      [ROAD1 + 1, W],
    ]) {
      m.box(a, dy + 10, tz - 9, b, dy + 11, tz + 10, orangeDark);
      m.box(a, dy, tz - 9, b, dy + 1, tz + 10, C("#7e7a84"));
      m.box(a, dy + 9, tz - 2, b, dy + 10, tz + 3, E("#ffb24a", 1.2));
    }
    // portal struts between the legs, each with recessed Art-Deco panels
    const struts: [number, number][] = [
      [dy - 14, dy - 10],
      [Math.round(17 * VPM), Math.round(17 * VPM) + 6],
      [Math.round(24.5 * VPM), Math.round(24.5 * VPM) + 6],
      [Math.round(31.5 * VPM), Math.round(31.5 * VPM) + 6],
      [TOP - 8, TOP],
    ];
    for (const [y0, y1] of struts) {
      const hz = 4;
      m.box(7, y0, tz - hz, W - 7, y1, tz + hz + 1, orange);
      m.box(7, y0, tz - hz - 1, W - 7, y0 + 1, tz + hz + 2, orangeDark);
      m.box(7, y1 - 1, tz - hz - 1, W - 7, y1, tz + hz + 2, orangeDark);
      // panels: vertical recesses on both faces, a chevron between them on the top strut
      for (let x = 10; x < W - 10; x += 4)
        for (let y = y0 + 2; y < y1 - 2; y++) {
          m.set(x, y, tz + hz, orangeDeep);
          m.set(x + 1, y, tz + hz, orangeDeep);
          m.set(x, y, tz - hz, orangeDeep);
          m.set(x + 1, y, tz - hz, orangeDeep);
        }
    }
    // the crown: stepped cap on each leg, saddle housings, the aviation lights
    for (const [a, b] of [
      [0, 7],
      [W - 7, W],
    ]) {
      m.box(a + 1, TOP, tz - 4, b - 1, TOP + 2, tz + 5, orange);
      m.box(a + 2, TOP + 2, tz - 3, b - 2, TOP + 4, tz + 4, orangeDark);
      m.box(a + 3, TOP + 4, tz - 1, b - 3, TOP + 5, tz + 2, C("#2a2830"));
      m.box(a + 3, TOP + 5, tz - 1, b - 3, TOP + 7, tz + 2, E("#ff2a2a", 2.6));
      // small red lights on the corners of the cap too
      for (const zz of [tz - 4, tz + 4]) m.set(a + 1, TOP + 2, zz, E("#ff3a2a", 1.8));
    }
    towerTops.push([W / 2, TOP + 7, tz]);
  }

  // ---- anchorages: concrete blocks the cables run into, at both ends ----
  const anchors: [number, number, number, number][] = [];
  for (const [z0, z1] of [
    [0, 14],
    [D - 14, D],
  ]) {
    for (const [a, b] of [
      [0, ROAD0 - 1],
      [ROAD1 + 1, W],
    ]) {
      const top = Math.max(deckY(z0), deckY(z1 - 1)) + 14;
      m.box(a, 0, z0, b, top, z1, (x, y, z) => (y % 4 === 3 ? concreteDark : (z - z0) % 5 === 2 ? C("#7a7780") : paint(concrete, x, y, z)));
      m.box(a, top, z0 + 1, b, top + 2, z1 - 1, C("#a3a0a8"));
      // a lamp on top, like a gate pier
      m.box(a + 1, top + 2, (z0 + z1) / 2 - 1, b - 1, top + 5, (z0 + z1) / 2 + 1, C("#2a2830"));
      m.box(a + 1, top + 5, (z0 + z1) / 2 - 1, b - 1, top + 7, (z0 + z1) / 2 + 1, E("#ffc070", 1.8));
      anchors.push([a, z0, b, z1]);
    }
  }
  const anchorY = (end: "back" | "front") => Math.max(deckY(end === "back" ? 0 : D - 14), deckY(end === "back" ? 13 : D - 1)) + 12;

  // ---- the main cables ----
  const cableLow = DECK_M + 4;
  const cableY = (z: number) => {
    if (z >= TA && z <= TB) {
      const u = (z - MID) / ((TB - TA) / 2);
      return cableLow + (SADDLE - cableLow) * u * u;
    }
    // side spans: from the saddle down to the anchorage, sagging a little
    const back = z < TA;
    const za = back ? 7 : D - 7;
    const t = back ? (z - za) / (TA - za) : (za - z) / (za - TB);
    if (t < 0) return -1;
    const ya = anchorY(back ? "back" : "front");
    return ya + (SADDLE - ya) * t - 7 * 4 * t * (1 - t);
  };
  for (const xc of [XA, XB]) {
    let prev = -1;
    for (let z = 0; z < D; z++) {
      const yc = cableY(z);
      if (yc < 0) continue;
      const y = Math.round(yc);
      // fill the step from the previous slice so the cable stays continuous
      const lo = prev < 0 ? y : Math.min(y, prev),
        hi = prev < 0 ? y : Math.max(y, prev);
      m.box(xc - 1, lo, z, xc + 1, hi + 2, z + 1, orange);
      // cable bands every few metres
      if (z % 6 === 0) m.box(xc - 1, y - 1, z, xc + 1, y + 3, z + 1, orangeDark);
      // a necklace of small lamps along the top of the cable
      if (z % 12 === 6) m.set(xc - (xc < W / 2 ? 1 : 0), Math.max(y, hi) + 2, z, E("#fff0c8", 1.4));
      prev = y;
      // suspenders down to the deck
      if (z % 6 === 3) {
        const dy = deckY(z);
        if (y > dy + 5) m.box(xc, dy + 1, z, xc + 1, y, z + 1, orangeDeep);
      }
    }
  }

  // ---- deck lamps: sodium heads on curved posts over the walkways ----
  const lights: [number, number, number, string][] = [];
  for (let z = 10; z < D - 10; z += 24) {
    if (Math.abs(z - TA) < 12 || Math.abs(z - TB) < 12) continue;
    const dy = deckY(z);
    for (const side of [0, 1]) {
      const x = side ? W - 2 : 1;
      const dir = side ? -1 : 1;
      m.box(x, dy + 1, z, x + 1, dy + 13, z + 1, C("#7a3a2e"));
      m.box(x, dy + 13, z, x + dir * 3 + (side ? 0 : 1), dy + 14, z + 1, C("#7a3a2e"));
      m.set(x + dir * 3, dy + 12, z, E("#ffb24a", 2.4));
      m.set(x + dir * 2, dy + 12, z, E("#ffb24a", 2.0));
    }
    if (z % 48 === 10) lights.push([W / 2, dy + 12, z, "#ffb24a"]);
  }
  // a few loose details: toll-style signs over the road at the front end
  {
    const z = D - 20;
    const dy = deckY(z);
    m.box(ROAD0 - 1, dy + 1, z, ROAD0, dy + 20, z + 1, C("#4a4852"));
    m.box(ROAD1, dy + 1, z, ROAD1 + 1, dy + 20, z + 1, C("#4a4852"));
    m.box(ROAD0 - 1, dy + 20, z, ROAD1 + 1, dy + 21, z + 1, C("#4a4852"));
    for (let i = 0; i < 4; i++) {
      const x = ROAD0 + 1 + i * 7;
      m.box(x, dy + 16, z + 1, x + 5, dy + 20, z + 2, C("#1c5a3a"));
      m.box(x + 2, dy + 17, z + 2, x + 3, dy + 19, z + 3, i < 2 ? E("#3ddc97", 1.4) : E("#ff5040", 1.4));
    }
  }
  for (const [x, y, z] of towerTops) {
    lights.push([x, y, z, "#ff2a2a"]);
    // floodlights on the pier tops wash the legs at night
    lights.push([x, 12, z + 11, "#ffb070"], [x, 12, z - 11, "#ffb070"]);
    for (const zz of [z - 10, z + 10]) for (const xx of [2, W - 4]) m.box(xx, 7, zz, xx + 2, 8, zz + 1, E("#ffd8a0", 1.6));
  }
  void hash;

  const deckPt = (z: number): [number, number, number] => [W / 2, deckY(z) + 1, z];
  return {
    model: m,
    signs: [],
    door: [W / 2, D],
    body: [0, 0, W, D],
    walls: anchors,
    lights,
    points: {
      deckFront: deckPt(D - 1),
      deckBack: deckPt(0),
      towerA: towerTops[0],
      towerB: towerTops[1],
    },
    scale: k,
  };
}
