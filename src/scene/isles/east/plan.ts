import { CURB, ISLE_FEET } from "../../city/plan";
import type { Box, Isle } from "../types";

/**
 * ZAIBA, the island east of the city (after Tokyo's Odaiba): off the east ring road at Boulevard
 * North, the Rainbow Bridge — a white suspension bridge a kilometre long, two square-portalled
 * towers 130 m over the water, a 480 m main span with the deck 38 m over the sea at mid-span, its
 * cables strung with lights that run the colours of the rainbow at night — lands on a waterfront
 * district: the beach facing the city's skyline and the bridge, the Decks boardwalk mall over it,
 * ZTV's headquarters with its sphere, the Shield City mall, the big wheel, the convention hall's
 * upturned pyramids, residential towers to the north.
 *
 * The island's content (./index.ts) is laid out in its own numbers below (ZLAND, ZX, ZZ, ZBEACH: the
 * island as first drawn, 690 m out) and moved ZDX metres further east as a whole; the descriptor the
 * rest of the game reads (EAST) is in the world's numbers.
 *
 * Plain data (the content is ./index.ts, loaded once the city is up).
 */

/** How much further east the island stands than its content's own numbers (the bridge grew to a kilometre). */
export const ZDX = 538;
/** Content x → world x. */
const W = (x: number) => x + ZDX;
const wbox = (b: Box): Box => ({ x0: W(b.x0), x1: W(b.x1), z0: b.z0, z1: b.z1 });

/** The bridge leaves the ring road where Boulevard North meets it, and runs due east (x1: its landing, in the content's numbers). */
export const ZB = { z: ISLE_FEET.east.z, x0: ISLE_FEET.east.x, x1: 690 };
/** Along the bridge (s) from the world x. */
const S = (x: number) => x - ZB.x0;

/** The island's raised land (its paved town) and everything round it (beaches, shallows). */
export const ZLAND = { x0: 680, x1: 1000, z0: -360, z1: 40 };
/** Its streets' centre lines: north–south (x) and east–west (z). */
export const ZX = { seaside: 692, wheel: 780, daiba: 870, ariake: 955 };
export const ZZ = { quay: -340, heights: -250, rainbow: ZB.z, palette: -70, seaside: 22 };
/** The big beach on the west shore, south of the bridge, facing the city: its sand runs this far out. */
export const ZBEACH = { z0: -140, z1: 30, width: 62 };

/** The bridge in the world: from the ring road to the island's boulevard; its main span's middle. */
const B0 = ZB.x0,
  B1 = W(ZB.x1),
  BMID = (B0 + B1) / 2;
/** Main span 480 m between the towers; the anchorages 140 m behind them. */
const T1 = BMID - 240,
  T2 = BMID + 240;

export const EAST: Isle = {
  key: "zaiba",
  name: "Zaiba",
  side: "east",
  box: { x0: W(ZLAND.x0 - ZBEACH.width - 26), x1: W(ZLAND.x1 + 40), z0: ZLAND.z0 - 40, z1: ZLAND.z1 + 40 },
  land: wbox(ZLAND),
  shore: { beach: 22, wide: [{ side: "w", from: ZBEACH.z0, to: ZBEACH.z1, width: ZBEACH.width }], bed: -5.5 },
  streets: [
    { axis: "z", at: W(ZX.seaside), from: ZZ.quay, to: ZZ.seaside, width: 10, name: "Seaside Drive" },
    { axis: "z", at: W(ZX.wheel), from: ZZ.quay, to: ZZ.seaside, width: 10, name: "Wheel Street" },
    { axis: "z", at: W(ZX.daiba), from: ZZ.quay, to: ZZ.seaside, width: 12, name: "Daiba Avenue" },
    { axis: "z", at: W(ZX.ariake), from: ZZ.quay, to: ZZ.seaside, width: 10, name: "Ariake Street" },
    { axis: "x", at: ZZ.quay, from: W(ZX.seaside), to: W(ZX.ariake), width: 10, name: "Quay Road" },
    { axis: "x", at: ZZ.heights, from: W(ZX.seaside), to: W(ZX.ariake), width: 10, name: "Heights Road" },
    // (the bridge's road comes down onto the island and carries on across it)
    { axis: "x", at: ZZ.rainbow, from: W(ZLAND.x0), to: W(ZX.ariake), width: 14, name: "Rainbow Boulevard" },
    { axis: "x", at: ZZ.palette, from: W(ZX.seaside), to: W(ZX.ariake), width: 10, name: "Palette Road" },
    { axis: "x", at: ZZ.seaside, from: W(ZX.seaside), to: W(ZX.ariake), width: 10, name: "Seaside Road" },
  ],
  // Seaside Park: the lawn behind the beach, between the Decks and the shore road
  parks: [{ x0: W(ZX.seaside + 5), x1: W(ZX.wheel - 5), z0: ZZ.palette + 5, z1: ZZ.seaside - 5 }],
  areas: [
    { key: "zaiba-beach", name: "Zaiba Beach", weight: 3.5, density: 1.0, box: { x0: W(ZLAND.x0 - ZBEACH.width - 20), x1: W(ZLAND.x0 + 6), z0: ZBEACH.z0 - 10, z1: ZBEACH.z1 + 20 } },
    { key: "zaiba", name: "Zaiba", weight: 6, density: 1.0, box: wbox(ZLAND) },
  ],
  color: "#ff6fb1",
  labels: [
    { name: "ZAIBA", x: W(860), z: -150 },
    { name: "Rainbow Bridge", x: BMID, z: ZB.z - 20 },
    { name: "Zaiba Beach", x: W(ZLAND.x0 - 30), z: -50 },
  ],
  sound: { tracks: ["jazz-combo", "piano-waltz", "sax-park"], level: 0.18 },
  crossing: {
    key: "rainbow",
    name: "Rainbow Bridge",
    kind: "suspension",
    path: [
      [B0, ZB.z],
      [B1, ZB.z],
    ],
    radius: 30,
    // off the ring road's east lanes, over its pavement, one long climb (about 1 in 9) to the crest
    // at mid-span 38 m over the sea (a long vertical curve over the main span), one long descent onto
    // the island's boulevard
    profile: [
      [0, 0.01],
      [7, CURB + 0.1],
      [S(BMID), 38, 260],
      [S(B1) - 7, CURB + 0.1],
      [S(B1), 0.01],
    ],
    ease: 30,
    section: { median: 0.4, road: 7.4, barrier: 7.9, walk: 10.6, rail: 10.8, edge: 11.6 },
    lanes: [1.9, 5.3],
    towers: [S(T1), S(T2)],
    top: 130,
    anchors: [S(T1 - 140), S(T2 + 140)],
    style: { paint: "#eef0ee", night: "rainbow" },
  },
  load: () => import("./index"),
};
