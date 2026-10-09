import * as THREE from "three";

/**
 * Plan of the Proof Factory's mining hall (metres; the street door is on +z, z = 0).
 *
 *   z  0 ┌──────────── lobby (under the control room) ── charging bay ── workshop ────────────┐
 *  -10 │═══════════════════════ main aisle (vehicles, both ways) ═════════════════════════════│
 *      │ cooling │ pods W1…W8 (south)  │ avenue │ pods E1…E5 (south) │ conveyor │ docks D1…D4 │
 *  -39 │═════════════════════ middle aisle ═════════════════════════════════│          │      │
 *      │  wall   │ pods W1…W8 (north)  │        │ pods E1…E5 (north) │  (down)  │             │
 *  -63 │═══════════════════════ back aisle ═══════════════════════════════════════════════════│
 *      │ pallet racking ……… PRESS ── conveyor under the wall screen ── (raised) ──┘           │
 *  -74 └──────────────────────────────────────────────────────────────────────────────────────┘
 *     x -64                         0                                    40                 64
 */
export const X0 = -64,
  X1 = 64,
  Z0 = -74,
  Z1 = 0;
/** Eaves height; the sawtooth teeth rise to RIDGE. */
export const EAVE = 14,
  RIDGE = 17.5;

/** Control room: a glass box on the mezzanine over the lobby. */
export const CTRL = { y: 6, x0: -22, x1: 22, z0: -9.5, z1: 0, top: 10 };
/** The catwalks over the hall (and the control room's roof). */
export const CAT_Y = 10;
/**
 * The stair tower against the control room's east wall: a landing at CTRL.y (x0…x1, z0…z1) outside
 * a door in that wall, a flight down to the hall beside it (z mid…z1, its foot at x = foot) and one
 * up to the catwalks (z z0…mid, its head on the east catwalk, carried on to meet it at x = head).
 */
export const STAIR = { x0: CTRL.x1 + 0.2, x1: 25, z0: -9.2, mid: -8, z1: -6.8, foot: 35.4, head: 32.35, door: [-9.25, -7.65] as const };

/** Cross aisles (centre z, half width). */
export const MAIN_Z = -12.5,
  MID_Z = -39,
  BACK_Z = -63;

// ---- ASIC pods ----------------------------------------------------------------------------------
/** A pod: two lines of racks back to back round a closed hot aisle. Centres along x. */
export const POD_W = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => -57.2 + i * 6.6);
export const POD_E = [0, 1, 2, 3, 4].map((i) => 10 + i * 6.6);
export const PODS = [...POD_W.map((x, i) => ({ x, name: `W${i + 1}` })), ...POD_E.map((x, i) => ({ x, name: `E${i + 1}` }))];
/** Rack: pitch along the line, depth, height; the hot aisle's half width. */
export const RACK = { pitch: 1.25, w: 1.2, d: 1.1, h: 2.4, hot: 0.6, per: 15 };
/** The two halves of every pod: from z0 (aisle side) toward -z. */
export const SEGS = [
  { z0: -17.6, name: "S" },
  { z0: -41.6, name: "N" },
];
export const SEG_LEN = RACK.per * RACK.pitch;
/** Units per rack: shelves × slots. */
export const SHELVES = 5,
  SLOTS = 4;

// ---- the line -----------------------------------------------------------------------------------
export const PRESS = new THREE.Vector3(-17, 0, -69.2);
export const BELT_Y = 1.15,
  BELT_HI = 5.2;
/** The conveyor: from the press's side, east along the back wall (up a ramp), then south. */
export const BELT: THREE.Vector3[] = [
  new THREE.Vector3(-14.4, BELT_Y, -69.2),
  new THREE.Vector3(10, BELT_Y, -69.2),
  new THREE.Vector3(19, BELT_HI, -69.2),
  new THREE.Vector3(44, BELT_HI, -69.2),
  new THREE.Vector3(44, BELT_HI, -36),
  new THREE.Vector3(44, BELT_Y, -27),
  new THREE.Vector3(44, BELT_Y, -21.5),
];
/** The robot at the end of the belt, and where the AGV waits for it. */
export const ROBOT = new THREE.Vector3(46.4, 0, -21.5);
export const AGV_STOP = new THREE.Vector3(48.9, 0, -21.5);
/** Dock doors in the east wall (centre z); trucks back onto them from outside. */
export const DOCKS = [-24, -33, -42, -51];
export const DOOR_W = 4.2,
  DOOR_H = 4.6;

// ---- vehicle lanes ------------------------------------------------------------------------------
/** North–south lanes: the cold aisles between pods, the avenue, the production zone. */
export const LANES_X = [-61.3, ...POD_W.slice(0, 7).map((x) => x + 3.3), -7.15, 0, 6.65, ...POD_E.slice(0, 4).map((x) => x + 3.3), 39.1, 52.5, 58.5];
/** East–west lanes and how far east each one runs. */
export const LANES_Z: [number, number][] = [
  [MAIN_Z, 58.5],
  [MID_Z, 39.1],
  [BACK_Z, 58.5],
];

export interface Node {
  p: THREE.Vector3;
  links: number[];
  /** A vehicle holding the crossing. */
  held: unknown;
}

/** The lane network: a node at every crossing, links along the lanes. */
export function laneGraph() {
  const nodes: Node[] = [];
  const at = new Map<string, number>();
  const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;
  const node = (x: number, z: number) => {
    const k = key(x, z);
    let i = at.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ p: new THREE.Vector3(x, 0, z), links: [], held: null });
      at.set(k, i);
    }
    return i;
  };
  const link = (a: number, b: number) => {
    if (a === b || nodes[a].links.includes(b)) return;
    nodes[a].links.push(b);
    nodes[b].links.push(a);
  };
  // every x lane crosses every z lane it reaches
  for (const x of LANES_X) {
    const zs = LANES_Z.filter(([, xe]) => x <= xe + 0.01).map(([z]) => z);
    // the production lanes also stop at each dock
    if (x > 50) zs.push(...DOCKS);
    zs.sort((a, b) => b - a);
    for (let i = 1; i < zs.length; i++) link(node(x, zs[i - 1]), node(x, zs[i]));
  }
  for (const [z, xe] of LANES_Z) {
    const xs = LANES_X.filter((x) => x <= xe + 0.01).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) link(node(xs[i - 1], z), node(xs[i], z));
  }
  return nodes;
}

/** Shortest hop path between two nodes (BFS; the lanes form a grid). */
export function route(nodes: Node[], from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (n === to) break;
    for (const m of nodes[n].links)
      if (!prev.has(m)) {
        prev.set(m, n);
        q.push(m);
      }
  }
  if (!prev.has(to)) return [from];
  const out: number[] = [];
  for (let n = to; n !== -1; n = prev.get(n)!) out.unshift(n);
  return out;
}
