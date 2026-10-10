import type { LiftDecl, Plan, StairDecl } from "./lift";
import type { Interior, Rect } from "./types";

/**
 * How each walk-in place's floors are joined (see lift.ts): its lifts (shafts, styles, spots) and
 * its stairs and escalators (flights in its own space). Spots are found automatically on each floor unless a place gives them
 * (`at`, or the Interior's own `lifts` / `stairs`). Places not listed get one lift on every floor.
 */

/**
 * The mall's escalators (mall/atrium.ts): two lanes each (up, down) between consecutive levels over
 * the void, landing on slab tongues ("piers") reached through gaps in the void's railing; the feet
 * are at the void's ends, walked onto head-on through the end railing.
 */
function mallEscalators(): StairDecl[] {
  const out: StairDecl[] = [];
  const L = 10.4;
  for (let f = 0; f < 4; f++)
    for (const sx of [-1, 1]) {
      const even = (f + (sx > 0 ? 1 : 0)) % 2 === 0;
      const zb = even ? -15.2 : -32.8,
        dir = even ? -1 : 1;
      const top = zb + dir * L;
      const lanes = [sx * 8.4 - 0.62, sx * 8.4 + 0.62];
      const xa = Math.min(sx * 6.8, sx * 10),
        xb = Math.max(sx * 6.8, sx * 10);
      // the piers: at the foot on floor f, at the head on floor f + 1
      const pier = (z: number): Rect => [xa, Math.min(z, z - dir * 1.25 * (z === zb ? 1 : -1)), xb, Math.max(z, z - dir * 1.25 * (z === zb ? 1 : -1))];
      const foot = pier(zb),
        head = pier(top);
      const railX = (n: number) => sx * (n ? 10.7 : 10);
      // the foot is at an end of the void, walked onto head-on through that end's railing
      const endZ = dir < 0 ? (f ? -13.3 : -14) : f ? -34.7 : -34;
      const approach: Rect = [lanes[0] - 0.62, Math.min(foot[1], foot[3], endZ) - 0.15, lanes[1] + 0.62, Math.max(foot[1], foot[3], endZ) + 0.15];
      const gap = (n: number, r: Rect): Rect => [railX(n) - 0.25, r[1], railX(n) + 0.25, r[3]];
      // fences round a pier over the void (upper floors): its inner side, its far end, beside the lanes
      const fences = (n: number, r: Rect, nearZ: number, head = false): ([number, Rect] | [number, Rect, number])[] => {
        if (n === 0) return [];
        const farZ = Math.abs(r[1] - nearZ) < 0.01 ? r[3] : r[1];
        const ix = sx > 0 ? xa : xb;
        const w: ([number, Rect] | [number, Rect, number])[] = [[n, [ix - 0.05, r[1], ix + 0.05, r[3]]]];
        // across both ends, except where lanes run on (this escalator's, or the next one's passing over)
        const edges = [xa, ...lanes.flatMap((x) => [x - 0.5, x + 0.5]).sort((a, b) => a - b), xb];
        for (const ez of [nearZ, farZ]) for (let k = 0; k < edges.length; k += 2) if (edges[k + 1] - edges[k] > 0.02) w.push([n, [edges[k], ez - 0.05, edges[k + 1], ez + 0.05]]);
        // a head pier's far end, under the next escalator's lanes: closed at the pier's level only
        // (its riders pass over it metres up, on the same floor)
        if (head) for (const lx of lanes) w.push([n, [lx - 0.5, farZ - 0.05, lx + 0.5, farZ + 0.05], 1.2]);
        return w;
      };
      // the lanes' side rails (instead of the flights' own): open where they pass over the head pier
      // of the escalator below (same side, one level down), which is left sideways under them
      const below = f > 0 ? (() => {
        const ev = (f - 1 + (sx > 0 ? 1 : 0)) % 2 === 0;
        const t = (ev ? -15.2 : -32.8) + (ev ? -1 : 1) * L;
        return [Math.min(t, t + (ev ? -1 : 1) * 1.25) - 0.35, Math.max(t, t + (ev ? -1 : 1) * 1.25) + 0.35];
      })() : null;
      const rz0 = Math.min(zb, top) + (dir < 0 ? 0.6 : 0.25),
        rz1 = Math.max(zb, top) - (dir < 0 ? 0.25 : 0.6);
      const spans: [number, number][] = below ? [[rz0, below[0]], [below[1], rz1]].filter(([a, b]) => b - a > 0.05) as [number, number][] : [[rz0, rz1]];
      const rails: [number, Rect][] = [f, f + 1].flatMap((n) => lanes.flatMap((lx) => spans.flatMap(([a, b]): [number, Rect][] => [[n, [lx - 0.56, a, lx - 0.5, b]], [n, [lx + 0.5, a, lx + 0.56, b]]])));
      lanes.forEach((lx, k) =>
        out.push({
          from: f,
          to: f + 1,
          kind: "escalator",
          move: k === 0 ? 1 : -1,
          zone: [lx - 0.5, Math.min(zb, top), lx + 0.5, Math.max(zb, top)],
          up: dir < 0 ? "-z" : "+z",
          rails: false,
          // the piers and the railing gaps are walked onto from the floor; the first lane carries them
          clearOn: k ? [] : [
            [f, foot],
            [f, gap(f, foot)],
            [f, approach],
            [f + 1, head],
            [f + 1, gap(f + 1, head)],
          ],
          walls: k ? [] : [...fences(f, foot, zb), ...fences(f + 1, head, top, true), ...rails],
        }),
      );
    }
  return out;
}

/** The Needle's car in the cabin slot of a core of half-size c (its landing doors close behind it on arrival). */
const needleCar = (c: number): LiftDecl => ({ at: { x: 0, z: c - 1.22, yaw: Math.PI }, clear: [[-1.25, c - 0.3, 1.25, c + 0.1]] });

/** Per floor, the lifts there. */
const per = (m: Record<number, LiftDecl[]>) => (n: number) => m[n] ?? [];

/**
 * A bank of two set on a modelled lift lobby (the towers', the Reserve's, the Burj Al Arab's
 * `lifts(f, x, z, ry)`: a 6.6 m wall with two doors at ±1.7 m, `ry` turning it, 0 = doors facing +z):
 * the car on its first door, its twin on the second, both backed onto the lobby wall, the lobby's
 * own call panel and floor signs left showing between and over them.
 */
function lobby(x: number, z: number, ry: number, o: LiftDecl = {}): LiftDecl {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  // local (−1.7, 1.23): the first door, 1.23 m out (the car's back on the doors' faces)
  const lx = -1.7,
    lz = 1.23;
  return { at: { x: x + lx * c + lz * s, z: z - lx * s + lz * c, yaw: ry + Math.PI }, bank: -1, pier: 0.92, ...o };
}

/**
 * The same on a wall of single lift doors facing +x (the ZK Tower's and the Marina hotel's
 * `elevators` / `lifts`: doors at x + 0.2, their wall to x + 0.5): the car on the door at `z`, its
 * twin on the one `gap` metres further along −z.
 */
const westWall = (x: number, z: number, gap: number, o: LiftDecl = {}): LiftDecl => ({ at: { x: x + 0.5 + 0.98, z, yaw: -Math.PI / 2 }, bank: -1, pier: gap - 2.48, ...o });

export const PLANS: Partial<Record<Interior["key"], Plan>> = {
  // its own stairs (another part of the code); the spiral stair joins Big Ben's floors
  pyramid: { lifts: () => [] },
  bigben: { lifts: () => [] },
  // the shop: against the back wall in the corner by the dock (clear of the mempool board), facing the
  // counter; the archive: on its front wall, where its door is
  mempool: {
    style: "industrial",
    lifts: per({
      0: [{ at: { x: 1.2, z: -12.88, yaw: Math.PI } }],
      1: [{ at: { x: 0, z: -1.42, yaw: 0 } }],
    }),
  },
  // the freight lift at the "EV" doors on the control room's back wall, one shaft from the hall to the catwalks;
  // the stair tower against the control room's east wall (factory/layout.ts STAIR, upper.ts buildStairs):
  // up from the hall by the workshop to the landing outside the room's east door, on up to the east catwalk
  factory: {
    style: "industrial",
    lifts: (n) => [{ name: "FREIGHT LIFT", at: { x: 16, z: -1.8, yaw: 0 } }],
    stairs: [
      {
        from: 0,
        to: 1,
        zone: [25, -8, 35.4, -6.8],
        up: "-x",
        // the door through the east wall; the landing fenced over the hall; nobody walks into the flight's head from under it
        clearOn: [[1, [21.7, -9.25, 22.3, -7.65]]],
        walls: [
          [0, [24.9, -8.06, 25.6, -6.74]],
          [1, [22, -9.3, 25.4, -9.2]],
          [1, [22, -6.8, 25.7, -6.7]],
        ],
      },
      // its head on the catwalk (no railing there): fenced the last bit past its rails
      { from: 1, to: 2, zone: [25, -9.2, 32.35, -8], up: "+x", walls: [[2, [31.7, -9.3, 32.4, -9.2]], [2, [31.7, -8, 32.4, -7.9]]] },
    ],
  },
  // The Binhai atrium: every lift on the front wall at its east end, stepping out with the terraces:
  // the ground floor's bank of two in the corner by the glass, the terraces' cars at the end of their
  // walkway where their lift doors are; the reading room's bank in its back corner (not under the
  // masthead), the ZIP Archive's on its two lift doors; the auditorium's narrow car against its back wall.
  // The atrium's switchback (library/stairs.ts LIB_STAIR) in front of the left wall's steps: up from the
  // floor to a landing carried over the steps to Terrace I, back up beside it to a bridge over to Terrace II
  library: {
    style: "wood",
    stairs: [
      {
        from: 0,
        to: 1,
        zone: [-14.6, -31.4, -13.4, -21],
        up: "-z",
        // the landing opens the terrace's edge; fenced over the steps; nobody walks into the flight's head from under it
        clearOn: [[1, [-19.2, -32.8, -13.4, -31.4]]],
        walls: [
          [0, [-14.6, -31.6, -13.4, -31.4]],
          [1, [-18.6, -32.9, -13.3, -32.8]],
          [1, [-13.4, -32.8, -13.3, -30.7]],
          [1, [-18.6, -31.4, -15.8, -31.3]],
        ],
      },
      {
        from: 1,
        to: 2,
        zone: [-15.8, -31.4, -14.6, -21],
        up: "+z",
        // the bridge opens the upper terrace's edge; fenced over the void
        clearOn: [[2, [-25.2, -21, -14.6, -19.6]]],
        walls: [
          [2, [-24.6, -19.6, -14.5, -19.5]],
          [2, [-14.6, -21.7, -14.5, -19.5]],
          [2, [-24.6, -21.1, -15.8, -21]],
          [2, [-15.9, -21.7, -15.8, -21]],
        ],
      },
    ],
    lifts: per({
      0: [{ at: { x: 14.6, z: -1.5, yaw: 0 }, bank: -1, wing: [0, 0.16] }],
      1: [{ at: { x: 20.4, z: -1.55, yaw: 0 } }],
      2: [{ at: { x: 25.1, z: -1.55, yaw: 0 } }],
      3: [{ at: { x: 10.6, z: -78.98, yaw: Math.PI }, bank: 1, wing: [0.16, 0] }],
      4: [{ narrow: true, at: { x: 0, z: 5.55, yaw: 0 } }],
      5: [{ at: { x: -3.2, z: -67.04, yaw: 0 }, bank: 1, pier: 3.92 }],
    }),
  },
  // the lifts on the core's west wall, on its two lift doors, on every floor (the lobby's security
  // gates stand clear of their landing); the residences' corridor is too narrow beside them: the car
  // closes the corridor's west end; the rooftop: in front of the lift kiosk's door
  tower: {
    style: "steel",
    lifts: (n) => [n === 6 ? { at: { x: -10.91, z: -9, yaw: -Math.PI / 2 } } : n === 7 ? { at: { x: -8.52, z: -9, yaw: -Math.PI / 2 } } : westWall(-12, -7.4, 3.2)],
  },
  // the three ZK towers: on each floor's lift lobby
  "tower-orchard": {
    style: "gold",
    lifts: per({ 0: [lobby(-11.85, -13, Math.PI / 2)], 1: [lobby(-11.85, -10, Math.PI / 2)], 2: [lobby(-11.85, -10, Math.PI / 2)], 3: [lobby(0, -6.4, 0)] }),
  },
  "tower-sapling": {
    style: "garden",
    lifts: per({ 0: [lobby(-5, -23.84, 0)], 1: [lobby(0, -9.84, 0)], 2: [lobby(-11.84, -12, Math.PI / 2)], 3: [lobby(-11.84, -12, Math.PI / 2)], 4: [lobby(-10.5, -22.84, 0)] }),
  },
  // the wallet towers (interior/wallettower): the lobby's west wall, the floors' west walls, the roof's lift house
  zodl: { style: "white", lifts: per({ 0: [lobby(-13.8, -21, Math.PI / 2)], 1: [lobby(-15.8, -6, Math.PI / 2)], 2: [lobby(-13.8, -6, Math.PI / 2)], 3: [lobby(0, -21.8, 0)] }) },
  noir: { style: "steel", lifts: per({ 0: [lobby(-13.8, -21, Math.PI / 2)], 1: [lobby(-15.8, -6, Math.PI / 2)], 2: [lobby(-13.8, -6, Math.PI / 2)], 3: [lobby(0, -21.8, 0)] }) },
  university: { style: "stone", lifts: per({ 0: [lobby(-7, -0.2, Math.PI)], 1: [lobby(-13.8, -3.8, Math.PI / 2)], 2: [lobby(-13.8, -3.8, Math.PI / 2)], 3: [lobby(-13.8, -3.8, Math.PI / 2)], 4: [lobby(-13.8, -3.8, Math.PI / 2)] }) },
  vizor: { style: "steel", lifts: per({ 0: [lobby(-13.8, -21, Math.PI / 2)], 1: [lobby(-15.8, -6, Math.PI / 2)], 2: [lobby(-13.8, -6, Math.PI / 2)], 3: [lobby(0, -21.8, 0)] }) },
  "tower-halo": {
    style: "neon",
    lifts: per({ 0: [lobby(-14.8, -24, Math.PI / 2)], 1: [lobby(-17.8, -7, Math.PI / 2)], 2: [lobby(-13.7, -7, Math.PI / 2)], 3: [lobby(0, 1.68, Math.PI)] }),
  },
  // the Napoleon hall: on the front wall right of the entrance; upstairs, on each floor's middle lift door.
  // Its escalators (museum/hall.ts: wing()) climb onto the wings' landings and arrive in the wing they
  // serve: Denon (west) the Grande Galerie, Richelieu (east) the apartments, Daru (north) the Salle des
  // États. Each zone runs from the foot plate (0.7 m on) to just past the landing's edge, where the head arrives
  museum: {
    style: "brass",
    stairs: [
      ...[-20.5, -18.6].map((z): StairDecl => ({ from: 0, to: 1, kind: "escalator", move: 1, zone: [-18.3, z - 0.55, -11.0, z + 0.55], up: "-x", link: { rise: 4.8 } })),
      ...[-20.5, -18.6].map((z): StairDecl => ({ from: 0, to: 3, kind: "escalator", move: 1, zone: [11.0, z - 0.55, 18.3, z + 0.55], up: "+x", link: { rise: 4.8 } })),
      ...[-0.95, 0.95].map((x): StairDecl => ({ from: 0, to: 2, kind: "escalator", move: 1, zone: [x - 0.55, -38.5, x + 0.55, -33.1], up: "-z", link: { rise: 4.8 * 0.62 } })),
    ],
    lifts: per({
      0: [{ at: { x: 4.5, z: -1.42, yaw: 0 } }],
      1: [{ at: { x: 0, z: -1.4, yaw: 0 } }],
      2: [{ at: { x: 4.5, z: -1.46, yaw: 0 } }],
      3: [{ at: { x: 0, z: -1.4, yaw: 0 } }],
    }),
  },
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
  // the escalators over the void, both ways; the lifts on the two lift doors of the lift lobby in the
  // south-west corner, on every level
  mall: { style: "white", lifts: () => [{ at: { x: -22.7, z: -1.38, yaw: 0 }, bank: 1, pier: 1.92 }], stairs: mallEscalators() },
  // the lift wall on the west side of every floor (the SkyPark's further out): the car between its two
  // modelled doors (a bank of three), on the axis of the corridor that leads to it (the lobby is 4 m deep)
  // The grand staircase (hotel/stair.ts: STAIR.zone): a stair hall in the core behind the west wall,
  // one straight flight from G (the doorway behind the Atrium Bar) up to the casino (the portal by the Lotus bar)
  hotel: {
    style: "gold",
    lifts: (n) => [{ at: { x: (n === 6 ? -27 : -15) + 1.48, z: n === 6 ? -10.15 : -11, yaw: -Math.PI / 2 } }],
    stairs: [{ from: 0, to: 1, zone: [-19.3, -19.3, -15.3, -3.3], up: "+z" }],
  },
  // the lobby's lift wall: on the first two of its four doors; upstairs, the walk-in cabin cut into each floor's core (half-size c)
  needle: {
    style: "white",
    lifts: per({
      0: [{ at: { x: -2.5, z: -26.58, yaw: Math.PI }, bank: -1, pier: 2.52 }],
      1: [needleCar(3.5)],
      2: [needleCar(3.5)],
      3: [needleCar(3.2)],
      4: [needleCar(3.0)],
    }),
  },
  // the lift lobbies of the atrium, Al Mahara and the salon; in the bedroom against its back wall by
  // the stair's well; on the helipad at the end of the gangway, at the door into the tower. The
  // suite's grand staircase (arab/suite.ts) climbs north from the salon to the bedroom: walled along
  // its sides and head in the salon, its well railed on three sides upstairs (open at the head)
  arab: {
    style: "gold",
    stairs: [
      {
        from: 2,
        to: 3,
        zone: [8.5, -11.5, 9.9, -5.0],
        up: "-z",
        rails: false,
        walls: [
          [2, [8.44, -11.56, 8.5, -5.3]],
          [2, [9.9, -11.56, 9.96, -5.3]],
          [2, [8.44, -11.56, 9.96, -11.5]],
          [3, [8.44, -11.05, 8.5, -4.94]],
          [3, [9.9, -11.05, 9.96, -4.94]],
          [3, [8.44, -5.0, 9.96, -4.94]],
        ],
      },
    ],
    lifts: per({
      0: [lobby(0, -33.8, 0)],
      1: [lobby(0, 0.3, Math.PI)],
      2: [lobby(0, -0.15, Math.PI)],
      3: [{ at: { x: 9.6, z: -1.4, yaw: 0 } }],
      // the rim's rail opens onto the gangway
      4: [{ at: { x: 13.3, z: -14, yaw: Math.PI / 2 }, clear: [[10.4, -15.35, 12.0, -12.65]] }],
    }),
  },
  // the bank's lift lobbies, floor by floor
  reserve: {
    style: "brass",
    lifts: per({
      0: [lobby(-19.95, -14, Math.PI / 2)],
      1: [lobby(-21.75, -8, Math.PI / 2)],
      2: [lobby(-17.85, -6, Math.PI / 2)],
      3: [lobby(-15.8, -9, Math.PI / 2)],
      4: [lobby(-12.38, -15, Math.PI / 2)],
      5: [lobby(0, -0.16, Math.PI)],
      6: [lobby(-15.95, -15, Math.PI / 2)],
    }),
    // the governors' stair (reserve/stair.ts: VAULT_STAIR.zone): a stair hall west of the banking hall,
    // one straight flight from the vault's north-west doorway up to the hall's doorway under the pools board
    stairs: [{ from: 5, to: 0, zone: [-26.2, -43.6, -22.2, -23.6], up: "+z" }],
  },
  // the foyer's "CONCERT HALL ▲" doors on its east wall; in the hall, the back wall's east corner
  opera: {
    style: "wood",
    lifts: per({ 0: [{ at: { x: 13.6, z: 7.9, yaw: Math.PI / 2 } }], 1: [{ at: { x: 10, z: 13.52, yaw: 0 }, wing: [0, 0.36] }] }),
  },
  // one shaft beside the gate: in the arena against the podium wall, below in the hypogeum's
  // substructure by the gate stair; the podium terrace is a 2.2 m ring: a narrow car across it by the spawn
  colosseum: {
    style: "stone",
    lifts: per({
      0: [{ at: { x: 3.95, z: 12.9, yaw: 0 } }],
      1: [{ at: { x: 3.95, z: 12.9, yaw: 0 } }],
      2: [{ narrow: true, at: { x: 1.33, z: 17.52, yaw: Math.PI / 2 } }],
    }),
    // its two stairs (colosseum/geo.ts), both climbing north, each walled on the floor it doesn't
    // land on (the slot's sides and far end above, the flight's sides and head below)
    stairs: [
      // the hypogeum's, from the end of its central corridor up to a slot in the sand by the gate
      {
        from: 1,
        to: 0,
        zone: [-1.5, 11.5, -0.5, 17.5],
        up: "-z",
        rails: false,
        walls: [
          [1, [-1.56, 11.44, -1.5, 17.05]],
          [1, [-0.5, 11.44, -0.44, 17.05]],
          [1, [-1.56, 11.44, -0.44, 11.5]],
          [0, [-1.56, 11.95, -1.5, 17.56]],
          [0, [-0.5, 11.95, -0.44, 17.56]],
          [0, [-1.56, 17.5, -0.44, 17.56]],
        ],
      },
      // the cavea's: through the doorway in the podium wall (east side), up inside the podium to the terrace
      {
        from: 0,
        to: 2,
        zone: [11.9, -2.1, 12.9, 1.9],
        up: "-z",
        rails: false,
        clearOn: [[0, [9.3, 1.9, 10.6, 3.15]]],
        walls: [
          [0, [9.85, 1.84, 11.9, 1.9]],
          [0, [9.85, 3.15, 12.96, 3.21]],
          [0, [11.84, -2.16, 11.9, 1.9]],
          [0, [12.9, -2.16, 12.96, 3.21]],
          [0, [11.84, -2.16, 12.96, -2.1]],
          [2, [11.84, -1.65, 11.9, 1.96]],
          [2, [12.9, -1.65, 12.96, 1.96]],
          [2, [11.84, 1.9, 12.96, 1.96]],
        ],
      },
    ],
  },
  // the pillar lift at the Pilier Est's doors (esplanade, 1st, 2nd), the summit lift at the core's doors
  eiffel: {
    style: "eiffel",
    lifts: per({
      0: [{ shaft: "pillar", at: { x: 12.7, z: 17.8, yaw: Math.PI / 2 } }],
      // the door onto the east terrace (the other one is boxed in by the 58's pavilion)
      1: [{ shaft: "pillar", at: { x: 15, z: 10.92, yaw: 0 } }],
      2: [{ shaft: "pillar", at: { x: 6.52, z: 9.7, yaw: Math.PI / 2 } }, { shaft: "summit", name: "SUMMIT LIFT", at: { x: 0, z: -4.03, yaw: 0 } }],
      3: [{ shaft: "summit", name: "SUMMIT LIFT", at: { x: 0, z: -4.3, yaw: 0 } }],
    }),
  },
  // the pedestal lift: one shaft in the north-west, against the museum's north wall and the
  // balcony's parapet; the helix joins the balcony and the crown; a service lift up the arm to the torch
  statue: {
    style: "brass",
    together: [[1, 2]],
    // the torch's car hangs off its balcony (south side), a lattice down the arm under it
    lifts: per({
      0: [{ shaft: "pedestal", at: { x: -8.3, z: -13.4, yaw: Math.PI } }],
      1: [{ shaft: "pedestal", at: { x: -8.3, z: -8.55, yaw: Math.PI } }, { shaft: "torch", name: "SERVICE LIFT", style: "industrial" }],
      3: [{ shaft: "torch", name: "SERVICE LIFT", style: "industrial", narrow: true, at: { x: 9.33, z: 4.98, yaw: 0 }, clear: [[8.5, 3.3, 10.2, 3.95]], column: 6 }],
    }),
  },
  // the Supertree lift to the Skyway; a garden tram between the grove and the two domes, its stops at
  // the side of the paths; the Cloud Forest's lift to its Cloud Walk
  gardens: {
    style: "garden",
    lifts: per({
      // the Supertree lift: a cabin on a lattice beside T0's trunk, from the lawn up to the Skyway's first landing
      0: [{ shaft: "tree", name: "SUPERTREE LIFT", at: { x: -24.82, z: -40, yaw: -Math.PI / 2 }, rise: 22 }, { shaft: "tram", name: "GARDEN TRAM", windows: true, style: "white", at: { x: -1.95, z: -3.1, yaw: -Math.PI / 2 } }],
      1: [{ shaft: "tree", name: "SUPERTREE LIFT", at: { x: -24.82, z: -40, yaw: Math.PI / 2 }, clear: [[-26.4, -40.8, -25.5, -39.2]], column: 22 }],
      // the Cloud Forest's lift in the mountain's east flank, up to the Cloud Walk's bridge
      2: [{ shaft: "tram", name: "GARDEN TRAM", windows: true, style: "white", at: { x: -2.0, z: 2.0, yaw: -Math.PI / 2 } }, { shaft: "cloud", name: "CLOUD LIFT", at: { x: 14.55, z: -30, yaw: -Math.PI / 2 } }],
      3: [{ shaft: "cloud", name: "CLOUD LIFT", narrow: true, at: { x: 12.5, z: -30, yaw: -Math.PI / 2 }, clear: [[11.1, -31.3, 13.8, -28.7]] }],
      4: [{ shaft: "tram", name: "GARDEN TRAM", windows: true, style: "white", at: { x: -2.6, z: 8.2, yaw: 0 } }],
    }),
  },
  // the monorail stops: on the beach against the villas' wall, in the villa by its door, on the
  // crescent at the boardwalk's edge under the line
  palm: {
    style: "palm",
    lifts: per({
      0: [{ shaft: "monorail", name: "MONORAIL", windows: true, at: { x: -8.6, z: 10.2, yaw: -Math.PI / 2 } }],
      1: [{ shaft: "monorail", name: "MONORAIL", windows: true }],
      2: [{ shaft: "monorail", name: "MONORAIL", windows: true }],
    }),
  },
};
