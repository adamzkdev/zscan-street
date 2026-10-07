/**
 * The ZK Cemetery's plan, shared by the voxel builder (worker) and the live scene (zombies, lids,
 * epitaphs, mist). Plain data in model voxels (6 per metre, the lot's back-left corner at 0,0; the
 * front, +z, faces south onto the street). No three.js here: the worker imports it too.
 *
 *   back fence ───────────────────────────────────────────────────────────────────────────────
 *    cypresses │ CRYPT (mausoleum) │ graves · obelisk │ CHAPEL │ angel · columbarium │ family tombs
 *   ─────────────────────── lane z=75 ──────────────────────────────────────────────────────────
 *    row M (headstones z=80)          │ main alley │                                 │
 *   ═══════════════════════ cross alley z=103 ═════════════════════════════════════════════════
 *    row A (z=110) · gap lane z=125 · row B (z=129) · gap lane z=145
 *   front fence ─────────────────────────── GATE (arch: ZK CEMETERY) ─────────────────────────
 */

/** Model size (k = 1): the lot is 61 × 27 m. */
export const CW = 366,
  CD = 162;
/** The fence line, inset from the lot's edge (the pavement runs outside it). */
export const FENCE = 9;
export const FX0 = FENCE,
  FX1 = CW - 1 - FENCE,
  FZ0 = FENCE,
  FZ1 = CD - 1 - FENCE;
/** The gate in the front fence: its opening (x) and the two stone pillars either side. */
export const GATE = { x0: 172, x1: 194, cx: 183 };

/** Ground height inside the fence (voxels above the lot): a gentle hill rising to the back. */
export function groundY(z: number) {
  const t = Math.max(0, Math.min(1, (FZ1 - 3 - z) / (FZ1 - 3 - (FZ0 + 2))));
  return 3 + 2.5 * t;
}
export const groundV = (z: number) => Math.round(groundY(z));

/** Footpaths: centre line, half width; zombies wander along them, graves stay off them. */
export interface Lane {
  axis: "x" | "z";
  /** The fixed coordinate (z for an east–west lane, x for a north–south one). */
  at: number;
  from: number;
  to: number;
  half: number;
  gravel: boolean;
}
export const LANES: Lane[] = [
  // the main alley, gate to chapel
  { axis: "z", at: 183, from: 64, to: FZ1 + 4, half: 7, gravel: true },
  // the cross alley
  { axis: "x", at: 103, from: FX0 + 3, to: FX1 - 3, half: 5, gravel: true },
  // west and east alleys, front fence to back fence
  { axis: "z", at: 105, from: FZ0 + 3, to: FZ1 - 2, half: 5, gravel: true },
  { axis: "z", at: 261, from: FZ0 + 3, to: FZ1 - 2, half: 5, gravel: true },
  // the crypt's forecourt, down to the cross alley
  { axis: "z", at: 63, from: 68, to: 103, half: 6, gravel: true },
  // in front of the chapel and the crypt
  { axis: "x", at: 75, from: FX0 + 3, to: FX1 - 3, half: 3, gravel: true },
  // the grass walks between the rows of graves
  { axis: "x", at: 125, from: FX0 + 3, to: FX1 - 3, half: 2, gravel: false },
  { axis: "x", at: 145, from: FX0 + 3, to: FX1 - 3, half: 3, gravel: false },
];

export type StoneKind = "round" | "cross" | "slab" | "obelisk" | "celtic" | "pointed" | "broken" | "chapel";
export interface Grave {
  /** Centre of the headstone (x) and its back face (z); the stone is `t` thick, the grave lies in front. */
  x: number;
  z: number;
  w: number;
  h: number;
  kind: StoneKind;
  /** Leans sideways (top shifted a voxel), or backwards (-1 in z). */
  lean: -1 | 0 | 1;
  back: boolean;
  /** Index into EPITAPHS, or -1. */
  epi: number;
  /** A grave that opens: a pit under a stone lid that slides aside when a zombie climbs out. */
  open: boolean;
  /** Fresh earth, flowers or a candle on the grave. */
  deco: "none" | "fresh" | "flowers" | "candle" | "moss";
  stone: number;
}
/** Grave length in front of the headstone (voxels). */
export const GRAVE_LEN = 10;
export const STONE_T = 2;

/** Epitaphs: a title and a line. No real people, only crypto's everyday tragedies and Zcash history. */
export const EPITAPHS: [string, string][] = [
  ["A TRANSPARENT ADDRESS", "Everyone saw it coming"],
  ["MY SEED PHRASE", "12 words · 0 backups"],
  ["NOT YOUR KEYS", "Not your coins"],
  ["THE SPROUT POOL", "2016–2020 · Migrated to a better place"],
  ["THE TOXIC WASTE", "Burned, as promised · 2016"],
  ["BCTV14", "Proved itself · Retired by Sapling, 2018"],
  ["THE TRUSTED SETUP", "No longer needed · Halo 2, 2022"],
  ["FOUNDERS' REWARD", "2016–2020 · Its work is done"],
  ["A PAPER WALLET", "Went through the wash"],
  ["A REUSED ADDRESS", "Linked forever"],
  ["AN ORPHANED BLOCK", "Mined with love · Kept by no chain"],
  ["A STALE FORK", "Went its own way"],
  ["A BRAIN WALLET", "The brain forgot"],
  ["SOME DUST", "Too small to spend"],
  ["THE LAST MEMO", "512 bytes of last words"],
  ["A SEED IN A SCREENSHOT", "The cloud says hi"],
  ["SHOULD HAVE SHIELDED", "Rests in plain sight"],
  ["PASSWORD123", "Guessed in one"],
  ["SENT TO THE WRONG CHAIN", "Gone, but not received"],
  ["A ONE-ZAT FEE", "Still waiting in the mempool"],
  ["HODLED TOO HARD", "Forgot where"],
  ["A JOINSPLIT", "Split, joined, retired"],
  ["THE CHANGE ADDRESS", "Nobody checked"],
  ["A COLD WALLET", "Too cold to find"],
];

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Big things that graves keep clear of: [x0, z0, x1, z1]. */
export const CRYPT = { x0: 34, z0: 18, x1: 92, z1: 66, door: 63 };
export const CHAPEL = { x0: 160, z0: 14, x1: 206, z1: 62 };
export const TOMBS = [
  { x0: 284, z0: 20, x1: 312, z1: 48 },
  { x0: 322, z0: 24, x1: 348, z1: 50 },
];
export const ANGEL = { x: 228, z: 40 };
export const OBELISK = { x: 136, z: 40 };
/** The columbarium: a wall of urn niches along the back fence, east of the chapel. */
export const COLUMBARIUM = { x0: 212, x1: 252, z0: FZ0 + 2, z1: FZ0 + 7 };
const KEEP_OUT = [
  [CRYPT.x0 - 3, CRYPT.z0 - 3, CRYPT.x1 + 3, CRYPT.z1 + 6],
  [CHAPEL.x0 - 4, CHAPEL.z0 - 3, CHAPEL.x1 + 4, CHAPEL.z1 + 8],
  ...TOMBS.map((t) => [t.x0 - 3, t.z0 - 3, t.x1 + 3, t.z1 + 5]),
  [ANGEL.x - 9, ANGEL.z - 9, ANGEL.x + 9, ANGEL.z + 9],
  [OBELISK.x - 8, OBELISK.z - 8, OBELISK.x + 8, OBELISK.z + 8],
  [COLUMBARIUM.x0 - 2, COLUMBARIUM.z0 - 2, COLUMBARIUM.x1 + 2, COLUMBARIUM.z1 + 4],
];

/** Dead trees and cypresses: x, z, kind, height (voxels). */
export const TREES: [number, number, "dead" | "cypress", number][] = [
  [20, 30, "cypress", 66],
  [20, 58, "cypress", 58],
  [22, 86, "dead", 60],
  [150, 22, "cypress", 62],
  [214, 60, "cypress", 64],
  [156, 88, "dead", 54],
  [240, 90, "dead", 66],
  [346, 88, "dead", 58],
  [40, 134, "dead", 50],
  [320, 136, "dead", 56],
  [120, 66, "dead", 48],
  [274, 62, "cypress", 56],
  [348, 60, "cypress", 52],
];

/** Iron lanterns on posts: x, z. */
export const LANTERNS: [number, number][] = [
  [174, 82],
  [192, 82],
  [174, 118],
  [192, 118],
  [174, 140],
  [192, 140],
  [97, 95],
  [269, 95],
  [55, 69],
  [71, 69],
  [30, 95],
  [336, 95],
];

/** Every grave, deterministic (the worker and the page must agree). */
export const GRAVES: Grave[] = (() => {
  const r = prng(0xdead);
  const out: Grave[] = [];
  const kinds: StoneKind[] = ["round", "round", "cross", "slab", "pointed", "celtic", "round", "obelisk", "broken", "slab", "cross", "round"];
  const blocked = (x0: number, z0: number, x1: number, z1: number) =>
    LANES.some((l) => (l.axis === "x" ? z1 > l.at - l.half && z0 < l.at + l.half && x1 > l.from && x0 < l.to : x1 > l.at - l.half && x0 < l.at + l.half && z1 > l.from && z0 < l.to)) ||
    KEEP_OUT.some(([a, b, c, d]) => x1 > a && x0 < c && z1 > b && z0 < d) ||
    TREES.some(([tx, tz]) => Math.abs(tx - (x0 + x1) / 2) < 9 && tz > z0 - 5 && tz < z1 + 5) ||
    LANTERNS.some(([lx, lz]) => lx > x0 - 3 && lx < x1 + 3 && lz > z0 - 3 && lz < z1 + 3);
  // rows: headstone z, and whether its graves may open / carry epitaphs (the rows you see)
  const rows: [number, boolean][] = [
    [80, true],
    [110, true],
    [129, true],
    [16, false],
    [34, false],
    [52, false],
  ];
  let epi = 0;
  for (const [z, front] of rows)
    for (let x = FX0 + 9; x < FX1 - 6; x += 13) {
      const w = 7 + Math.floor(r() * 3);
      const jx = x + Math.floor(r() * 3) - 1;
      if (blocked(jx - w / 2 - 1, z - 1, jx + w / 2 + 1, z + STONE_T + GRAVE_LEN + 1)) continue;
      if (r() < 0.08) continue;
      let kind = kinds[Math.floor(r() * kinds.length)];
      // Père-Lachaise's little funerary chapels, along the back rows
      if (!front && r() < 0.28) kind = "chapel";
      // the stones you can read have a flat face (and stand straight)
      const flat = (k: StoneKind) => k === "round" || k === "slab" || k === "pointed";
      if (front && !flat(kind) && r() < 0.6) kind = "round";
      const canRead = front && flat(kind);
      const lean = canRead ? 0 : r() < 0.7 ? (r() < 0.5 ? -1 : 1) : 0;
      out.push({
        x: jx,
        z,
        w,
        h: kind === "chapel" ? 13 + Math.floor(r() * 4) : kind === "obelisk" ? 14 + Math.floor(r() * 4) : kind === "celtic" ? 10 : 7 + Math.floor(r() * 3),
        kind,
        lean: (kind === "chapel" ? 0 : lean) as -1 | 0 | 1,
        back: kind !== "chapel" && !canRead && r() < 0.3,
        epi: canRead ? epi++ % EPITAPHS.length : -1,
        open: false,
        deco: (["none", "none", "fresh", "flowers", "candle", "moss", "none", "moss"] as const)[Math.floor(r() * 8)],
        stone: Math.floor(r() * 5),
      });
    }
  // graves that open: spread along the rows you see from the street and the alleys
  const cands = out.filter((g) => g.z === 80 || g.z === 110 || g.z === 129);
  const picks = [0.06, 0.2, 0.33, 0.47, 0.6, 0.72, 0.86, 0.95];
  for (const p of picks) {
    const g = cands[Math.floor(p * (cands.length - 1))];
    if (g) {
      g.open = true;
      g.deco = "fresh";
      if (g.kind === "obelisk" || g.kind === "celtic") g.kind = "round";
    }
  }
  return out;
})();

/** Where a zombie stands once out of grave `g`: the walk in front of it. */
export function graveExit(g: Grave): [number, number] {
  const front = g.z + STONE_T + GRAVE_LEN;
  // the first east–west lane in front of the grave
  const lane = LANES.filter((l) => l.axis === "x" && l.at > front - 1 && l.from < g.x && l.to > g.x).sort((a, b) => a.at - b.at)[0];
  return [g.x, lane ? lane.at : front + 3];
}

/** The pit of an open grave: [x0, z0, x1, z1] (voxels). */
export function pitOf(g: Grave): [number, number, number, number] {
  const hw = Math.floor(g.w / 2);
  return [g.x - hw, g.z + STONE_T + 1, g.x + hw + 1, g.z + STONE_T + GRAVE_LEN - 1];
}

/** The lanes as a graph: nodes at every crossing and lane end, edges along the lanes. */
export function laneGraph() {
  const nodes: [number, number][] = [];
  const key = new Map<string, number>();
  const node = (x: number, z: number) => {
    const k = `${Math.round(x)},${Math.round(z)}`;
    let i = key.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodes.push([x, z]);
      key.set(k, i);
    }
    return i;
  };
  const edges: number[][] = [];
  const link = (a: number, b: number) => {
    (edges[a] ??= []).push(b);
    (edges[b] ??= []).push(a);
  };
  const inside = (v: number) => Math.max(FX0 + 4, Math.min(FX1 - 4, v));
  const insideZ = (v: number) => Math.max(FZ0 + 4, Math.min(FZ1 - 4, v));
  for (const l of LANES) {
    const stops = new Set<number>([l.axis === "x" ? inside(l.from) : insideZ(l.from), l.axis === "x" ? inside(l.to) : insideZ(l.to)]);
    for (const o of LANES) {
      if (o.axis === l.axis) continue;
      if (o.at >= l.from && o.at <= l.to && l.at >= o.from && l.at <= o.to) stops.add(o.at);
    }
    const s = [...stops].sort((a, b) => a - b);
    const ids = s.map((v) => (l.axis === "x" ? node(v, l.at) : node(l.at, v)));
    for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]);
  }
  for (let i = 0; i < nodes.length; i++) edges[i] ??= [];
  return { nodes, edges };
}
