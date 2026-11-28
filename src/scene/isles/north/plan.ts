import { CURB, ISLE_FEET } from "../../city/plan";
import type { Isle } from "../types";
import { switchbacks, TougeCourse } from "./touge";

/**
 * ZAKONE, the mountain island north of the city (after Hakone, the hot-spring town under Fuji): off
 * the north ring road where Boulevard West meets it, the Brooklyn Bridge — granite towers with their
 * twin pointed arches, four cables and the web of stays, a 500 m main span 35 m over the water, the
 * timber promenade climbing over the median, 1.1 km from the city to the island — lands on the onsen
 * town on the island's south shore: Bridge Avenue, Onsen Dori, the Sando to the shrine; the hot
 * spring's garden, ryokans, the harbour and its fishing boats. Behind it rises Mount Zuji, a
 * snow-capped cone 270 m high, the shrine's red torii and its pagoda at its foot, forests on its
 * lower slopes, and the Zuji Touge climbing its south-east face in six legs and five hairpins to the
 * Fifth Station's car park, the whole city below.
 *
 * Plain data (the content is ./index.ts, loaded once the city is up). `relief` is the mountain:
 * the ground everywhere off the town's paving (the game's wheels and feet ask it).
 */

/** The bridge leaves the ring road where Boulevard West meets it, and runs due north. */
export const NB = { x: ISLE_FEET.north.x, z0: ISLE_FEET.north.z, z1: -1362 };
const S = (z: number) => NB.z0 - z;

/** The onsen town: the island's paved land, on its south shore. */
export const NLAND = { x0: -330, x1: 90, z0: -1570, z1: -1352 };
/** Its streets' centre lines: north–south (x) and east–west (z). */
export const NX = { yumoto: -312, gora: -210, bridge: NB.x, miya: -30, minato: 72 };
/** Bridge Avenue's half width: the bridge's four lanes carry on up it to the shrine (its road 25 m wide, kerb to kerb). */
export const BAVE = 13;
export const NZ = { shore: -1366, onsen: -1460, sando: -1556 };
/** Mount Zuji: its centre, its height, the cone's foot (radius), the island's coast (radius, before its wobble). */
export const VOLC = { x: -120, z: -2050, h: 270, r: 470, coast: 600 };
/** The shrine's terrace north of the Sando (flattened into the foothills), its floor; its stairs come up from the Sando. */
export const TERRACE = { x0: -196, x1: -48, z0: -1684, z1: -1602, y: 5.2 };
/** The open-air hot spring (rotenburo) in the foothills west of the shrine: an oval pool in a timber deck. */
export const ONSEN = { x: -264, z: -1622, rx: 15, rz: 10, deck: 4.2, surface: 4.02, floor: 2.85 };
/** The road's half width on the mountain, its guardrails' offset. */
export const TOUGE_W = { half: 4.6, rail: 5.4 };

const ss = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The island's natural ground, before the mountain road is cut into it. */
function raw(x: number, z: number) {
  const dx = x - VOLC.x,
    dz = z - VOLC.z;
  const r = Math.hypot(dx, dz);
  const b = Math.atan2(dx, dz);
  const coast = VOLC.coast + 26 * Math.sin(3 * b + 0.7) + 16 * Math.sin(7 * b + 2.1) + 9 * Math.sin(13 * b);
  if (r > coast + 40) return -6.5;
  // the coastal plain: up from the sea floor over the shore, rolling a little
  let y = -6 + 13 * ss((coast - r) / 70) + (r < coast - 60 ? 1.8 * Math.sin(x * 0.031) * Math.cos(z * 0.027) : 0);
  // the cone: concave, gullied, its crater
  if (r < VOLC.r) {
    const u = 1 - r / VOLC.r;
    let c = VOLC.h * Math.pow(u, 1.4);
    c *= 1 + 0.06 * Math.sin(9 * b + r * 0.025) * ss(r / 120) * ss(u * 4);
    if (r < 46) c -= 24 * (1 - (r / 46) ** 2);
    y += c;
  }
  // round the town: the hills ease down to its paving (the sea is left alone)
  const L = NLAND;
  const d = Math.hypot(Math.max(L.x0 - x, 0, x - L.x1), Math.max(L.z0 - z, 0, z - L.z1));
  if (y > CURB && d < 70) y = CURB + (y - CURB) * ss((d - 6) / 64);
  // the shrine's terrace
  const T = TERRACE;
  const dt = Math.hypot(Math.max(T.x0 - x, 0, x - T.x1), Math.max(T.z0 - z, 0, z - T.z1));
  if (dt < 26) {
    const k = ss(1 - dt / 26);
    y = y + (T.y - y) * k;
  }
  // the hot spring: its deck levelled, the pool dug into it
  const O = ONSEN;
  const e = Math.hypot((x - O.x) / O.rx, (z - O.z) / O.rz);
  if (e < 2.2) {
    const k = e < 1.5 ? 1 : 1 - ss((e - 1.5) / 0.7);
    y = y + (O.deck - 0.03 - y) * k;
    if (e < 1.08) y = O.floor + (O.deck - 0.03 - O.floor) * ss((e - 0.86) / 0.22);
  }
  return y;
}

/** The Zuji Touge: from the end of Minato Street up the cone's south-east face, six legs, five hairpins. */
export const TOUGE = new TougeCourse(
  [[NX.minato, NLAND.z0 + 2] as [number, number], ...switchbacks(VOLC.x, VOLC.z, [NX.minato, NLAND.z0 - 6], [470, 420, 370, 320, 270, 222], 0.38, 1.31).slice(1)],
  raw,
  TOUGE_W.half + 16,
);
/** The Fifth Station's car park at the top of the road. */
export const STATION = (() => {
  // (centred past the road's end: the lot opens off it, level with it)
  const e = TOUGE.at(TOUGE.length);
  return { x: e.x + e.tx * 20, z: e.z + e.tz * 20, y: e.y, r: 24 };
})();

/** The ground: the natural ground with the mountain road cut into it, the car park levelled. */
export function relief(x: number, z: number) {
  let y = raw(x, z);
  // the car park levelled first, then the road cut over it (the road always wins: it is drawn there)
  const ds = Math.hypot(x - STATION.x, z - STATION.z);
  if (ds < STATION.r + 14) {
    const k = ds < STATION.r ? 1 : 1 - ss((ds - STATION.r) / 14);
    y = y + (STATION.y - 0.03 - y) * k;
  }
  const p = TOUGE.project(x, z);
  if (p) {
    const a = Math.abs(p.off);
    const w = a < TOUGE_W.rail + 0.8 ? 1 : 1 - ss((a - TOUGE_W.rail - 0.8) / 12);
    if (w > 0) y = y + (TOUGE.y(p.s) - 0.03 - y) * w;
  }
  return y;
}

export const NORTH: Isle = {
  key: "zakone",
  name: "Zakone",
  side: "north",
  box: { x0: VOLC.x - VOLC.coast - 70, x1: VOLC.x + VOLC.coast + 70, z0: VOLC.z - VOLC.coast - 70, z1: NLAND.z1 + 46 },
  land: NLAND,
  shore: { beach: 20, wide: [{ side: "s", from: NLAND.x0, to: NX.gora + 30, width: 46 }], bed: -6 },
  streets: [
    { axis: "z", at: NX.yumoto, from: NLAND.z0, to: NLAND.z1, width: 10, name: "Yumoto Street" },
    { axis: "z", at: NX.gora, from: NLAND.z0, to: NLAND.z1, width: 10, name: "Gora Street" },
    // (the bridge's road comes down onto the island and carries on to the shrine)
    { axis: "z", at: NX.bridge, from: NLAND.z0, to: NLAND.z1, width: BAVE * 2, name: "Bridge Avenue" },
    { axis: "z", at: NX.miya, from: NLAND.z0, to: NLAND.z1, width: 10, name: "Miyanoshita Street" },
    { axis: "z", at: NX.minato, from: NLAND.z0, to: NLAND.z1, width: 10, name: "Minato Street" },
    { axis: "x", at: NZ.shore, from: NLAND.x0, to: NLAND.x1, width: 10, name: "Shore Road" },
    { axis: "x", at: NZ.onsen, from: NLAND.x0, to: NLAND.x1, width: 12, name: "Onsen Dori" },
    { axis: "x", at: NZ.sando, from: NLAND.x0, to: NLAND.x1, width: 10, name: "Sando" },
  ],
  // Yumoto Garden: the hot spring's lawn, between Gora Street and Bridge Avenue, Onsen Dori and the Sando
  parks: [{ x0: NX.gora + 5, x1: NX.bridge - BAVE, z0: NZ.sando + 5, z1: NZ.onsen - 6 }],
  areas: [
    { key: "zakone", name: "Zakone", weight: 5, density: 1.0, box: NLAND },
    { key: "zakone-shrine", name: "Zuji Shrine", weight: 1.2, density: 0.8, box: TERRACE },
    { key: "zakone-onsen", name: "Zuji Rotenburo", weight: 0.6, density: 0.7, box: { x0: ONSEN.x - 26, x1: ONSEN.x + 26, z0: ONSEN.z - 20, z1: ONSEN.z + 16 } },
    { key: "zakone-beach", name: "Zakone Beach", weight: 1.5, density: 0.8, box: { x0: NLAND.x0 - 10, x1: NX.gora + 30, z0: NLAND.z1, z1: NLAND.z1 + 40 } },
  ],
  color: "#ff8a5c",
  labels: [
    { name: "ZAKONE", x: -120, z: -1470 },
    { name: "Mount Zuji", x: VOLC.x, z: VOLC.z },
    { name: "Brooklyn Bridge", x: NB.x + 40, z: -790 },
    { name: "Zuji Touge", x: 150, z: -1790 },
    { name: "Zuji Shrine", x: -122, z: -1640 },
    { name: "Zuji Mall", x: 13, z: -1505 },
  ],
  sound: { tracks: ["piano-waltz", "jazz-combo"], level: 0.12 },
  crossing: {
    key: "brooklyn",
    name: "Brooklyn Bridge",
    kind: "suspension",
    path: [
      [NB.x, NB.z0],
      [NB.x, NB.z1],
    ],
    radius: 30,
    // off the ring road, over its pavement, up the long stone approach to the towers (35 m), a long
    // crest over the main span (39 m), down the approach onto Bridge Avenue
    profile: [
      [0, 0.01],
      [7, CURB + 0.1],
      [318, 35],
      [568, 39, 360],
      [818, 35],
      [S(NLAND.z1) - 2, CURB + 0.1],
      [S(NB.z1), 0.01],
    ],
    ease: 46,
    section: { median: 4.5, road: 12.5, barrier: 13.0, walk: 15.2, rail: 15.4, edge: 16.2 },
    lanes: [6.6, 10.2],
    towers: [318, 818],
    top: 94,
    anchors: [150, S(NB.z1) - 150],
    promenade: { half: 3.0, rise: 5.2, ramp: 70, s0: 22, s1: S(NB.z1) - 22 },
    style: { paint: "#b8a684", night: "white", tower: "gothic" },
  },
  relief,
  routes: [
    {
      name: "Zuji Touge",
      line: (() => {
        const out: [number, number][] = [];
        for (let s = 0; s < TOUGE.length; s += 20) {
          const p = TOUGE.at(s);
          out.push([p.x, p.z]);
        }
        const e = TOUGE.at(TOUGE.length);
        out.push([e.x, e.z], [STATION.x, STATION.z]);
        return out;
      })(),
      holds: (x, z) => {
        if (x > NLAND.x0 && x < NLAND.x1 && z > NLAND.z0 && z < NLAND.z1) return false;
        if (Math.hypot(x - STATION.x, z - STATION.z) < STATION.r + 4) return true;
        const p = TOUGE.project(x, z);
        return !!p && Math.abs(p.off) < TOUGE_W.rail + 4;
      },
    },
  ],
  load: () => import("./index"),
};
