import type { LiftDecl, Plan, StairDecl } from "./lift";
import type { Interior, Rect } from "./types";

/**
 * How each walk-in place's floors are joined (see lift.ts): its lifts (shafts, styles, spots) and
 * its stairs and escalators (flights in its own space). Spots are found automatically on each floor unless a place gives them
 * (`at`, or the Interior's own `lifts` / `stairs`). Places not listed get one lift on every floor.
 */

const lift = (o: LiftDecl = {}) => () => [o];
/**
 * The mall's escalators (mall/atrium.ts): two lanes each (up, down) between consecutive levels over
 * the void, landing on slab tongues ("piers") reached through gaps in the void's railing.
 */
function mallEscalators(): StairDecl[] {
  const out: StairDecl[] = [];
  const L = 10.4;
  for (let f = 0; f < 4; f++)
    for (const sx of [-1, 1]) {
      const even = (f + (sx > 0 ? 1 : 0)) % 2 === 0;
      const zb = even ? -16.2 : -31.8,
        dir = even ? -1 : 1;
      const top = zb + dir * L;
      const lanes = [sx * 8.4 - 0.62, sx * 8.4 + 0.62];
      const xa = Math.min(sx * 6.8, sx * 10),
        xb = Math.max(sx * 6.8, sx * 10);
      // the piers: at the foot on floor f, at the head on floor f + 1
      const pier = (z: number): Rect => [xa, Math.min(z, z - dir * 1.6 * (z === zb ? 1 : -1)), xb, Math.max(z, z - dir * 1.6 * (z === zb ? 1 : -1))];
      const foot = pier(zb),
        head = pier(top);
      const railX = (n: number) => sx * (n ? 10.7 : 10);
      const gap = (n: number, r: Rect): Rect => [railX(n) - 0.25, r[1], railX(n) + 0.25, r[3]];
      // fences round a pier over the void (upper floors): its inner side, its far end, beside the lanes
      const fences = (n: number, r: Rect, nearZ: number): [number, Rect][] => {
        if (n === 0) return [];
        const farZ = Math.abs(r[1] - nearZ) < 0.01 ? r[3] : r[1];
        const ix = sx > 0 ? xa : xb;
        const w: [number, Rect][] = [[n, [ix - 0.05, r[1], ix + 0.05, r[3]]]];
        // across both ends, except where lanes run on (this escalator's, or the next one's passing over)
        const edges = [xa, ...lanes.flatMap((x) => [x - 0.5, x + 0.5]).sort((a, b) => a - b), xb];
        for (const ez of [nearZ, farZ]) for (let k = 0; k < edges.length; k += 2) if (edges[k + 1] - edges[k] > 0.02) w.push([n, [edges[k], ez - 0.05, edges[k + 1], ez + 0.05]]);
        return w;
      };
      lanes.forEach((lx, k) =>
        out.push({
          from: f,
          to: f + 1,
          kind: "escalator",
          move: k === 0 ? 1 : -1,
          zone: [lx - 0.5, Math.min(zb, top), lx + 0.5, Math.max(zb, top)],
          up: dir < 0 ? "-z" : "+z",
          // the piers and the railing gaps are walked onto from the floor; the first lane carries them
          clearOn: k ? [] : [
            [f, foot],
            [f, gap(f, foot)],
            [f + 1, head],
            [f + 1, gap(f + 1, head)],
          ],
          walls: k ? [] : [...fences(f, foot, zb), ...fences(f + 1, head, top)],
        }),
      );
    }
  return out;
}

/** The Needle's car in the cabin slot of a core of half-size c (its landing doors close behind it on arrival). */
const needleCar = (c: number): LiftDecl => ({ at: { x: 0, z: c - 1.22, yaw: Math.PI }, clear: [[-1.25, c - 0.3, 1.25, c + 0.1]] });

/** Per floor, the lifts there. */
const per = (m: Record<number, LiftDecl[]>) => (n: number) => m[n] ?? [];

export const PLANS: Partial<Record<Interior["key"], Plan>> = {
  // its own stairs (another part of the code); the spiral stair joins Big Ben's floors
  pyramid: { lifts: () => [] },
  bigben: { lifts: () => [] },
  mempool: { style: "industrial", lifts: lift({ name: "FREIGHT LIFT" }) },
  // the freight lift by the "EV" doors of the control room and the catwalks
  factory: { style: "industrial", lifts: lift({ name: "FREIGHT LIFT", near: { x: 16, z: -1.5 } }) },
  // terraces I and II: at the front end of their left arm, where the old lift doors are; the
  // auditorium in the sphere: a narrow car against its back wall
  library: {
    style: "wood",
    lifts: per({
      0: [{}],
      1: [{ at: { x: -20.4, z: -1.55, yaw: 0 } }],
      2: [{ at: { x: -25.1, z: -1.55, yaw: 0 } }],
      3: [{}],
      4: [{ narrow: true, at: { x: 0, z: 5.55, yaw: 0 } }],
      5: [{}],
    }),
  },
  // the lift by the old elevator doors on the west wall; on the residences' floor the corridor is too
  // narrow beside them: it stands across the corridor's west end, facing the hallway to the flats
  tower: { style: "steel", lifts: (n) => [n === 6 ? { at: { x: -10.91, z: -9, yaw: -Math.PI / 2 } } : {}] },
  "tower-orchard": { style: "gold" },
  "tower-sapling": { style: "garden" },
  "tower-halo": { style: "neon" },
  museum: { style: "brass" },
  // the stands and the pitch: a lift in a south vomitory (x 20: the middle one is the way out) down
  // to the back of the players' tunnel
  stadium: {
    style: "sport",
    lifts: per({
      0: [{ name: "TUNNEL LIFT", compact: true, at: { x: 20, z: 39.15, yaw: 0 }, clear: [[18.4, 37.6, 21.6, 38.3]] }],
      1: [{ name: "TUNNEL LIFT", compact: true, at: { x: 0, z: 28.25, yaw: 0 } }],
    }),
  },
  // the cell house tiers: the steel stairs at the south end of B and C blocks, walked for real
  prison: {
    style: "industrial",
    lifts: () => [],
    stairs: [
      // the landings are only 0.8 m wide: the tier railings' ends next to them give a little room
      { from: 0, to: 1, zone: [3.4, -6.9, 8.6, -6.1], up: "+x", clearOn: [[1, [8.2, -7.0, 8.7, -6.8]]] },
      { from: 0, to: 1, zone: [-8.6, -6.9, -3.4, -6.1], up: "-x", clearOn: [[1, [-8.7, -7.0, -8.2, -6.8]]] },
      { from: 1, to: 2, zone: [3.4, -6.1, 8.6, -5.3], up: "-x", clearOn: [[2, [2.3, -7.0, 2.7, -5.2]], [2, [3.3, -7.0, 3.7, -6.8]]] },
      { from: 1, to: 2, zone: [-8.6, -6.1, -3.4, -5.3], up: "+x", clearOn: [[2, [-2.7, -7.0, -2.3, -5.2]], [2, [-3.7, -7.0, -3.3, -6.8]]] },
      // a catwalk from the second tier's east end onto the gun gallery
      { from: 1, to: 3, zone: [14.4, -6.9, 15.4, -1.78], up: "+z", build: true },
    ],
  },
  // the escalators over the void, both ways; the lifts in the lobby by the entrance
  mall: { style: "white", lifts: lift({ near: { x: -20.5, z: -1.4 } }), stairs: mallEscalators() },
  hotel: { style: "gold" },
  // the lobby's lift wall; upstairs, the walk-in cabin cut into each floor's core (half-size c)
  needle: {
    style: "white",
    lifts: per({
      0: [{ near: { x: 0, z: -26.4 } }],
      1: [needleCar(3.5)],
      2: [needleCar(3.5)],
      3: [needleCar(3.2)],
      4: [needleCar(3.0)],
    }),
  },
  arab: { style: "gold" },
  reserve: { style: "brass" },
  // the foyer's "CONCERT HALL ▲" doors on its east wall
  opera: { style: "wood", lifts: per({ 0: [{ near: { x: 13.6, z: 8 } }], 1: [{}] }) },
  // the podium terrace is a 2.2 m ring: a narrow car across it by the spawn
  colosseum: { style: "stone", lifts: (n) => [n === 2 ? { narrow: true, at: { x: 1.33, z: 17.52, yaw: Math.PI / 2 } } : {}] },
  // the pillar lifts to the 1st and 2nd floors, the summit lift from the 2nd, the stairs to the 2nd
  eiffel: {
    style: "eiffel",
    lifts: per({
      0: [{ shaft: "pillar", near: { x: 13.9, z: 16.6 } }],
      1: [{ shaft: "pillar", near: { x: 12.1, z: 14 } }],
      2: [{ shaft: "pillar", near: { x: 7.7, z: 8.6 } }, { shaft: "summit", name: "SUMMIT LIFT", near: { x: 0, z: -4.2 } }],
      3: [{ shaft: "summit", name: "SUMMIT LIFT" }],
    }),
  },
  // the pedestal lift; the helix joins the balcony and the crown; a service lift up the arm to the torch
  statue: {
    style: "brass",
    together: [[1, 2]],
    // the torch's car hangs off its balcony (south side), a lattice down the arm under it
    lifts: per({
      0: [{ shaft: "pedestal" }],
      1: [{ shaft: "pedestal" }, { shaft: "torch", name: "SERVICE LIFT", style: "industrial" }],
      3: [{ shaft: "torch", name: "SERVICE LIFT", style: "industrial", narrow: true, at: { x: 9.33, z: 4.98, yaw: 0 }, clear: [[8.5, 3.3, 10.2, 3.95]], column: 6 }],
    }),
  },
  // the Supertree lift to the Skyway; a garden tram between the grove and the two domes; the Cloud Forest's lift to its Cloud Walk
  gardens: {
    style: "garden",
    lifts: per({
      // the Supertree lift: a cabin on a lattice beside T0's trunk, from the lawn up to the Skyway's first landing
      0: [{ shaft: "tree", name: "SUPERTREE LIFT", at: { x: -24.82, z: -40, yaw: -Math.PI / 2 }, rise: 22 }, { shaft: "tram", name: "GARDEN TRAM", windows: true, style: "white" }],
      1: [{ shaft: "tree", name: "SUPERTREE LIFT", at: { x: -24.82, z: -40, yaw: Math.PI / 2 }, clear: [[-26.4, -40.8, -25.5, -39.2]], column: 22 }],
      // the Cloud Forest's lift in the mountain's east flank, up to the Cloud Walk's bridge
      2: [{ shaft: "tram", name: "GARDEN TRAM", windows: true, style: "white" }, { shaft: "cloud", name: "CLOUD LIFT", at: { x: 14.55, z: -30, yaw: -Math.PI / 2 } }],
      3: [{ shaft: "cloud", name: "CLOUD LIFT", narrow: true, at: { x: 12.5, z: -30, yaw: -Math.PI / 2 }, clear: [[11.1, -31.3, 13.8, -28.7]] }],
      4: [{ shaft: "tram", name: "GARDEN TRAM", windows: true, style: "white" }],
    }),
  },
  // the beach, the villa, the crescent: monorail stops
  palm: { style: "palm", lifts: lift({ shaft: "monorail", name: "MONORAIL", windows: true }) },
};
