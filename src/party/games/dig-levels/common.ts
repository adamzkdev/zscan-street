/**
 * PROOF OF DIG's levels: what the game (dig.ts) and each level (meadow.ts, ice.ts, reef.ts) share. The
 * ground is a grid of blocks, COLS wide and ROWS deep; a level lays out the left half of it (the
 * right half is its mirror), dresses the island round it, and says which twists it plays with.
 */
import type * as THREE from "three";
import type { Rnd } from "../../kit";
import type { SongKey } from "../../music";
import type { AmbienceKind } from "../../../audio/kinds";

export const COLS = 11;
export const ROWS = 40;
export const N = COLS * ROWS;
export const HALF = COLS / 2;
/** The left half a level lays out (columns 0…5; 5 is the middle). */
export const HC = 6;
/** A cell is 1 m: its centre x, a miner's feet in it, its centre y. */
export const colX = (c: number) => c - (COLS - 1) / 2;
export const footY = (r: number) => -(r + 1);
export const midY = (r: number) => -(r + 0.5);
/** The island's solid rims each side, the earth behind the cut face. */
export const RIM = 1.6;
export const EDGE = HALF + RIM;
export const BACK = 5;
export const FRONT = 0.5;

// the blocks
export const EMPTY = 0,
  GRASS = 1,
  DIRT = 2,
  SAND = 3,
  CLAY = 4,
  STONE = 5,
  AMETH = 6,
  MAGMA = 7,
  GRANITE = 8,
  OBSID = 9,
  CRUMB = 10,
  HOT = 11,
  QB = 12,
  BOULDER = 13,
  BEDROCK = 14,
  LAVA = 15,
  WALL = 16,
  /** Slick blue ice: two hits, and a step onto it glides on (ICE CAVE). */
  ICE = 17,
  /** Packed snow: one hit; a glide stops on it. */
  SNOW = 18,
  /** A pocket of air in the rock: one hit, and whoever breaks it breathes again (SUNKEN REEF). */
  AIR = 19;

/** One band of the ground, from the last one's `to` down to its own. */
export interface Layer {
  to: number;
  /** The block it is made of (its hits). */
  mat: number;
  en: string;
  zh: string;
  c: string;
  c2: string;
  /** The back wall behind it (a dug cell reads as a hole). */
  wall: string;
  ore: string[];
  shine?: string[];
}

/** A box of the scenery, instanced: centre, size, colour, a tilt. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  c: string;
  rx?: number;
  rz?: number;
}

/** What a level's layout gets: the left half's cells, and the usual pieces. */
export interface GenKit {
  R: Rnd;
  set(c: number, r: number, t: number): void;
  /** (steel past the half's edges and the last row) */
  get(c: number, r: number): number;
  /** Set it only over ordinary rock (no vein through steel, lava, a wall or a nonce). */
  soft(c: number, r: number, t: number): void;
  pick<T>(a: T[]): T;
  /** A whole number from a to b. */
  any(a: number, b: number): number;
  vein(c: number, a: number, b: number): void;
  boulder(c: number, r: number): void;
  nonce(c: number, r: number): void;
  /** Steel across both lanes at `row`, one sand gap in each. */
  slab(row: number): void;
  /** A stalactite (an icicle) hanging in the open cell (c, r): it shakes and drops when its roof goes, or someone is under it down to row `bot`. */
  stal(c: number, r: number, bot: number): void;
  /** A block in a wall column that leaves no brick behind when broken (a well's lid; open wall cells are so already). */
  open(c: number, r: number): void;
}

/** What a level's scenery gets: the instanced boxes, and the scene for anything else. */
export interface SceneKit {
  scene: THREE.Scene;
  /** The cosmetic dice (fixed: the same island every time). */
  cos: Rnd;
  earth: Box[];
  deco: Box[];
  lights: Box[];
  cones: Box[];
  put(arr: Box[], x: number, y: number, z: number, w: number, h: number, d: number, c: string, rx?: number, rz?: number): void;
  /** Each seat's start column, and its colour. */
  lane: number[];
  colors: string[];
  /** Things that turn slowly and bob (Z-blocks). */
  spin: THREE.Object3D[];
}

/** What a level animates on its own each frame. */
export interface TickKit {
  dt: number;
  now: number;
  /** The camera's height (for snow round it). */
  camY: number;
  /** The tide's surface (y), or −1e9 with no tide in. */
  tideY: number;
  burst(x: number, y: number, z: number, n: number, colors: string[], o: { speed?: number; up?: number; gravity?: number; size?: number; life?: number; drag?: number }): void;
}

/** The liquid in a level's pockets: what it looks like, what it does to whoever it touches, what it leaves. */
export interface Pool {
  en: string;
  zh: string;
  /** Its texture: the base, the blobs, the dark specks. */
  tex: [string, string, string, string];
  /** The touch: the word, its colour, the particles. */
  hurt: [string, string];
  hurtC: string;
  bits: string[];
  /** What it turns to where it comes to rest. */
  cool: number;
  /** The sparks off it (and off HOT rock). */
  sparks: string[];
  /** The steam (or frost) where it cools. */
  steam: string[];
}

export interface DigLevel {
  key: string;
  title: string;
  titleZh: string;
  /** Its twist, one line. */
  tag: string;
  tagZh: string;
  song?: SongKey;
  ambience?: AmbienceKind;
  sky: [string, string];
  fog: [number, number];
  night?: boolean;
  /** The light: the sky's and the ground's, its strength; the sun's colour and strength. */
  hemi?: [string, string, number];
  sun?: [string, number];
  /** A soft fill light from the side, in the level's tint. */
  fill?: [string, number];
  /** How dark the cast shadows are here (1 by default; a night's are softer). */
  shade?: number;
  layers: Layer[];
  /** The lane walls' columns (brick nothing breaks), the right half's included. */
  walls: number[];
  /** Steel rows (the gauge marks them). */
  slabs: number[];
  /** Open rows across the whole ground, on ice (ICE CAVE: the gauge marks them). */
  galleries?: number[];
  /** The middle lanes' cave (the meadow's): its crumbly roof, its open rows. */
  cave?: { roof: number; top: number; bot: number };
  /** Steps onto ICE glide on until a block, a rival or a drop stops them. */
  ice?: boolean;
  /** The rising tide: from `delay` s it comes up from the bottom, `rate` rows a second (`rate2` from `fast` s), no higher than `top`. */
  tide?: { delay: number; rate: number; rate2: number; fast: number; top: number };
  /** The QUAKE from 24 s (its banner), or none. */
  quake?: [string, string];
  pool: Pool;
  /** Colours of the special blocks (two each: the checker). */
  pal: { granite: [string, string]; obsid: [string, string]; crumb: [string, string]; hot: [string, string]; ice: [string, string]; snow: [string, string] };
  /** The boulders' colour. */
  rock: string;
  /** The top strip, the floating rocks round the island and their caps, the fences over the walls (post, rail, cap). */
  top: string;
  isle: [string, string];
  /** What grows on the islets round the island. */
  crown: "tree" | "fir" | "palm";
  fence: [string, string, string];
  /** The headframes' wood. */
  wood: [string, string];
  /** The sign at the back: its face, its rim, the title's colour. */
  sign: [string, string, string];
  /** A banner when the visitor reaches a layer (by its index). */
  says: Record<number, [string, string, string]>;
  /** A banner when someone first gets in the cave (or the first gallery). */
  caveSay?: [string, string, string];
  gen(k: GenKit): void;
  /** Dresses the island; may hand back what it animates each frame (snow, the aurora). */
  scenery(k: SceneKit): void | ((t: TickKit) => void);
}

/** The meadow's lava: it burns, and cools to obsidian. */
export const LAVA_POOL: Pool = {
  en: "LAVA!",
  zh: "岩浆！",
  tex: ["#ff6a10", "#ffb02e", "#ffe27a", "#c2300a"],
  hurt: ["BURNT!", "烫！"],
  hurtC: "#ff8a3c",
  bits: ["#ff7a1a", "#ffd23f", "#5a5a5a"],
  cool: OBSID,
  sparks: ["#ff7a1a", "#ffd23f"],
  steam: ["#ffffff", "#cfcfcf", "#ff7a1a"],
};
