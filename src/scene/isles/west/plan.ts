import { CURB, ISLE_FEET } from "../../city/plan";
import type { Isle, IsleStreet } from "../types";

/**
 * GAMLA, the island west of the city: an old European town (Amsterdam's canals and gabled houses,
 * Bruges' squares, a touch of Venice), reached the way Copenhagen reaches Malmö — off the west ring
 * road at Boulevard North, the Øresund-style crossing: a cable-stayed bridge, two pylons 160 m tall
 * over a 460 m main span with the deck 37–41 m over the water, coming down onto an artificial islet
 * (Peberholm's double), where the road dives into an undersea tunnel and comes up on the town's shore.
 *
 *  - St. Proof's Cathedral: gothic, twin towers with spires facing Øresund Boulevard, its square
 *    (Domplein) across the boulevard;
 *  - the Grote Markt: stalls and café terraces between Kongensgade and the harbour street;
 *  - the canals (the Gracht across the town, the Domgracht down it, the Zuidgracht) and their bridges;
 *  - the castle on its hill in the north-west, the harbour quay along the north shore.
 *
 * Plain data (the content is ./index.ts, loaded once the city is up).
 */

const FOOT = ISLE_FEET.west;
/** The course runs due west: s metres along it is x = FOOT.x − s. */
export const WB = { z: FOOT.z, x0: FOOT.x, len: 1684 };
const X = (s: number) => WB.x0 - s;

/** The crossing's key stations (s along the course). */
export const WS = {
  /** The pylons. */
  pylons: [380, 840] as [number, number],
  /** The artificial islet: where its land starts and ends along the course. */
  islet: [1150, 1332] as [number, number],
  /** The tube's portals. */
  tube: [1250, 1640] as [number, number],
};

/** The island's raised land (the town) and the streets' centre lines. */
export const GLAND = { x0: -2300, x1: -1905, z0: -400, z1: 90 };
/** North–south streets (x). */
export const GX = { haven: -1925, kong: -2010, dom: -2100, brug: -2200, west: -2280 };
/** East–west streets (z). */
export const GZ = { kade: -385, slot: -300, blvd: WB.z, markt: -40, zuid: 75 };
/** The canals: the Gracht east–west across the town, the Domgracht north–south, the Zuidgracht. */
export const GC = { gracht: -228, dom: -2150, zuid: 12 };
/** The castle's hill (north-west block), the cathedral, its square, the market. */
export const GCASTLE = { x: -2252, z: -342, r: 36, h: 12, top: 19 };
export const GCATH = { x0: -2084, x1: -2026, z0: -132, z1: -50 };
export const GSQUARE = { x0: -2094, x1: -2015, z0: -220, z1: -163 };
export const GMARKT = { x0: -2004, x1: -1931, z0: -149, z1: -46 };

const st = (axis: "x" | "z", at: number, from: number, to: number, width: number, name: string): IsleStreet => ({ axis, at, from, to, width, name });

export const WEST: Isle = {
  key: "gamla",
  name: "Gamla",
  side: "west",
  box: { x0: GLAND.x0 - 60, x1: GLAND.x1 + 70, z0: GLAND.z0 - 50, z1: GLAND.z1 + 60 },
  land: GLAND,
  // (a narrow stony strip round the town, the harbour's quay wall over it on the north; the town
  // beach south-west, the sand the tunnel's portal stands on east)
  shore: {
    beach: 8,
    wide: [
      { side: "s", from: -2290, to: -2080, width: 40 },
      { side: "e", from: -200, to: -112, width: 52 },
    ],
    bed: -6,
  },
  paving: "setts",
  streets: [
    st("x", GZ.kade, GLAND.x0, GLAND.x1, 10, "Noordkade"),
    st("x", GZ.slot, GLAND.x0, GLAND.x1, 10, "Slotsgade"),
    // (the crossing comes up out of its tube onto the boulevard; the boulevard ends at Domstraat, the canal beyond)
    st("x", GZ.blvd, GX.dom, GLAND.x1, 14, "Øresund Boulevard"),
    st("x", GZ.markt, GLAND.x0, GLAND.x1, 10, "Markt"),
    st("x", GZ.zuid, GLAND.x0, GLAND.x1, 10, "Zuidkade"),
    st("z", GX.haven, GZ.kade, GZ.zuid, 10, "Havnegade"),
    st("z", GX.kong, GZ.kade, GZ.zuid, 10, "Kongensgade"),
    st("z", GX.dom, GZ.kade, GZ.zuid, 12, "Domstraat"),
    st("z", GX.brug, GZ.kade, GZ.zuid, 10, "Brugstraat"),
    // (the castle's hill takes the north-west: Westwal starts at Slotsgade)
    st("z", GX.west, GZ.slot, GZ.zuid, 10, "Westwal"),
  ],
  canals: [
    st("x", GC.gracht, GLAND.x0, GLAND.x1, 16, "the Gracht"),
    st("z", GC.dom, GLAND.z0, GLAND.z1, 14, "the Domgracht"),
    st("x", GC.zuid, GLAND.x0, GX.kong - 5, 14, "the Zuidgracht"),
  ],
  hills: [GCASTLE],
  parks: [],
  areas: [
    { key: "gamla-markt", name: "Grote Markt", weight: 3, density: 1.3, box: { x0: GMARKT.x0, x1: GMARKT.x1, z0: GMARKT.z0, z1: GMARKT.z1 } },
    { key: "gamla-dom", name: "Domplein", weight: 2.5, density: 1.2, box: { x0: GSQUARE.x0, x1: GSQUARE.x1, z0: GSQUARE.z0, z1: GCATH.z0 } },
    { key: "gamla", name: "Gamla", weight: 6, density: 1.0, box: GLAND },
    { key: "gamla-beach", name: "Gamla Strand", weight: 1.5, density: 0.8, box: { x0: -2290, x1: -2080, z0: GLAND.z1 - 4, z1: GLAND.z1 + 40 } },
  ],
  color: "#ffb347",
  labels: [
    { name: "GAMLA", x: -2120, z: -260 },
    { name: "Øresund Bridge", x: X(610), z: WB.z - 24 },
    { name: "Peberholm", x: X(1240), z: WB.z + 40 },
    { name: "St. Proof's", x: -2055, z: -90 },
    { name: "Grote Markt", x: -1968, z: -98 },
    { name: "the castle", x: GCASTLE.x, z: GCASTLE.z },
  ],
  // (an old town's street music: a waltz, Bach on a violin, the Danube, Vivaldi)
  sound: { tracks: ["piano-waltz", "violin-bach", "op-danube", "op-vivaldi"], level: 0.16, bells: true },
  crossing: {
    key: "oresund",
    name: "Øresund Bridge",
    kind: "bridge-tunnel",
    path: [
      [WB.x0, WB.z],
      [X(WB.len), WB.z],
    ],
    radius: 30,
    // up off the ring road over the shore, one long climb to the crest over the main span, down onto
    // the islet; its trough, the tube under the strait, up onto the town's sand and its boulevard
    profile: [
      [0, 0.01],
      [7, CURB + 0.1],
      [WS.pylons[0], 37],
      [610, 41, 320],
      [WS.pylons[1], 37],
      [1190, CURB + 0.1],
      [1218, CURB + 0.1],
      [WS.tube[0], -1.4],
      [1355, -14],
      [1535, -14],
      [WS.tube[1], -1.4],
      [1672, CURB + 0.1],
      [WB.len, 0.01],
    ],
    ease: 30,
    // (the walkways 1.7 m wide inside the stays' planes; the tube's own walkways the same width)
    section: { median: 0.4, road: 7.4, barrier: 7.9, walk: 9.6, rail: 9.8, edge: 11.2 },
    lanes: [1.9, 5.3],
    towers: WS.pylons,
    top: 160,
    tube: WS.tube,
    style: { paint: "#e9ebe8", night: "white" },
  },
  load: () => import("./index"),
};

/** Is (x, z) on the islet's land (its ground: the course across it, rock armour round it)? */
export const ISLET = { x0: X(WS.islet[1]), x1: X(WS.islet[0]), z0: WB.z - 34, z1: WB.z + 34 };
