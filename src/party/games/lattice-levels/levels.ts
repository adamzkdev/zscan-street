/**
 * HALO FALL's three levels (the game is ../lattice.ts; the new levels' scenery is ./scenery.ts):
 *
 * - NU7 TOWER: today's arena. Three hex floors in a glowing tower over ZStreet at dusk.
 * - FROZEN LAKE (key "astana"): three long ice rinks stacked over Central Park's frozen lake on a
 *   winter night, the NU7 TOWER's golden crown beside them. The ice slides you (you keep your speed,
 *   you stop late, a shove sends you further); the white ORCHARD tiles are frosted and grip.
 * - SPIN STATION: three propeller decks in orbit over the Earth, each spinning (the next one the other
 *   way), faster as the game goes on. The spin carries you round and pulls you out to the rim and
 *   along the arms: the hub is the safe ground, so everyone fights for it.
 *
 * Same rules everywhere (the cracks, the transparent tiles, ORCHARD, the TRACKER BEAM, the collapses); a level is
 * its floors' shape, its look, and its twist's numbers.
 */
import type { SongKey } from "../../music";
import type { AmbienceKind } from "../../../audio/kinds";

export type LevelKey = "tower" | "astana" | "orbit";

export interface Level {
  key: LevelKey;
  title: string;
  titleZh: string;
  /** The twist, in one line. */
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  /** Is there a tile on floor f centred at (x, z) (axial q, r)? The floors' shape. */
  shape(f: number, q: number, r: number, x: number, z: number): boolean;
  /** Where the four start on the top floor (you front left). */
  spawns: [number, number][];
  /** The sky (zenith, the haze the far fades into: the fog's colour) and the fog. The sky itself is the scenery's dome. */
  sky: [string, string];
  fog: [number, number];
  /**
   * The light: the sun's colour, place and strength (it stands behind the floors, where the sky's sun or moon is,
   * so the shadows fall toward the camera, on the tiles in front of who casts them), the sky-and-ground fill
   * and its strength, a fill from the camera's side in the other temperature (colour, strength, place).
   */
  sun: string;
  sunAt: [number, number, number];
  sunI: number;
  hemi: [string, string];
  hemiI: number;
  rim: [string, number, number, number, number];
  /** The floors' colours (top to bottom), their lattice's glow, the tiles' sides. */
  floorC: [string, string, string];
  glowC: [string, string, string];
  sideC: string;
  /** The tile mix: the share of ORCHARD, t-addr and P2PKH tiles. */
  mix: [number, number, number];
  /** Cracks last this much longer than today's (1: the same). */
  crack: number;
  /** Ice: the grip on plain tiles and old keys (today's ground: 30); 0: no ice. */
  ice: number;
  /** The decks' spin (rad/s, signed, per floor) at GO; how much faster by the time cap; the pull to the rim (m/s per metre off the hub, at GO's spin). */
  spin: [number, number, number];
  spinUp: number;
  pull: number;
  /** The play camera: its distance and pitch (rad down). */
  dist: number;
  pitch: number;
  /** The twist, announced at GO: the banner and the line under it. */
  intro?: { s: string; zh: string; sub: string; subZh: string; c: string };
}

const SQ3 = Math.sqrt(3);
const hexDist = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

export const TOWER: Level = {
  key: "tower",
  title: "NU7 TOWER",
  titleZh: "NU7 塔",
  tag: "Three hex floors over ZStreet at dusk. The TRACKER BEAM sweeps a line.",
  tagZh: "黄昏 ZStreet 上空的三层六角地板，追踪光束横扫一线。",
  song: "lattice",
  ambience: "city-day",
  shape: (f, q, r) => hexDist(q, r) <= [6, 7, 8][f],
  spawns: [
    [-3.3, 2.9],
    [3.3, 2.9],
    [-3.3, -2.9],
    [3.3, -2.9],
  ],
  sky: ["#1b1456", "#94587f"],
  fog: [56, 270],
  sun: "#ffd9ae",
  sunAt: [-17, 45, -36],
  sunI: 2.3,
  hemi: ["#efe6ff", "#7d6a8a"],
  hemiI: 1.55,
  rim: ["#b4a6ff", 1.25, 20, 22, 40],
  floorC: ["#8fd6f2", "#b8a2ff", "#86d6a0"],
  glowC: ["#5fd8ff", "#9c7cff", "#3fe08a"],
  sideC: "#7b7fa8",
  mix: [0.11, 0.065, 0.065],
  crack: 1,
  ice: 0,
  spin: [0, 0, 0],
  spinUp: 1,
  pull: 0,
  dist: 17.5,
  pitch: 0.94,
};

/** A rink: |x| and |z| of the tile centres within these (per floor: top, middle, bottom). */
const RINK_X = [13.3, 14.9, 16.5];
const RINK_Z = [6.2, 7.2, 8.1];

export const ASTANA: Level = {
  key: "astana",
  title: "FROZEN LAKE",
  titleZh: "冰封湖",
  tag: "Long ice rinks over Central Park's frozen lake: you slide! White ORCHARD tiles grip.",
  tagZh: "中央公园冰封湖上空的长条冰场：会打滑！白色 ORCHARD 地砖防滑。",
  song: "frost",
  ambience: "wind",
  shape: (f, _q, _r, x, z) => Math.abs(x) <= RINK_X[f] && Math.abs(z) <= RINK_Z[f],
  spawns: [
    [-4.9, 2.9],
    [4.9, 2.9],
    [-4.9, -2.9],
    [4.9, -2.9],
  ],
  sky: ["#03061e", "#27356e"],
  fog: [46, 205],
  sun: "#d2e2ff",
  sunAt: [21, 46, -32],
  sunI: 2.0,
  hemi: ["#dfe8ff", "#3a4878"],
  hemiI: 1.45,
  rim: ["#ffd8ae", 1.1, -18, 20, 40],
  floorC: ["#9fe9ff", "#a8b6ff", "#9ff3d6"],
  glowC: ["#6fe4ff", "#8fa0ff", "#5ff0c0"],
  sideC: "#7f9cc8",
  mix: [0.15, 0.06, 0.06],
  crack: 1.1,
  ice: 4.6,
  spin: [0, 0, 0],
  spinUp: 1,
  pull: 0,
  dist: 18.5,
  pitch: 0.92,
  intro: { s: "ICE! YOU SLIDE", zh: "冰面！会打滑", sub: "White ORCHARD tiles grip: stop on them", subZh: "白色 ORCHARD 地砖防滑：在上面停下", c: "#9fe9ff" },
};

/** A deck: a hub (hex rings) and three arms, `ARM_W` m wide, out to `ARM` m. */
const HUB = [5, 7, 8];
const ARM = [12.5, 15, 17.5];
const ARM_W = 1.75;
const ARMS = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a) => [Math.cos(a), Math.sin(a)]);

export const ORBIT: Level = {
  key: "orbit",
  title: "SPIN STATION",
  titleZh: "旋转空间站",
  tag: "Spinning decks in orbit: the spin drags you to the rim. Hold the hub!",
  tagZh: "轨道上的旋转甲板：转动把你甩向边缘。守住中心！",
  song: "neon",
  ambience: "space",
  shape: (f, q, r, x, z) => {
    if (hexDist(q, r) <= HUB[f]) return true;
    const d = Math.hypot(x, z);
    if (d > ARM[f]) return false;
    for (const [ax, az] of ARMS) if (x * ax + z * az > 0 && Math.abs(-x * az + z * ax) <= ARM_W) return true;
    return false;
  },
  spawns: [
    [-3.3, 2.9],
    [3.3, 2.9],
    [-3.3, -2.9],
    [3.3, -2.9],
  ],
  sky: ["#02020a", "#0b0a26"],
  fog: [0, 0],
  sun: "#fff4e0",
  sunAt: [24, 44, -34],
  sunI: 2.6,
  hemi: ["#d8d4ff", "#3a5aa0"],
  hemiI: 1.15,
  rim: ["#6ab4ff", 1.0, -14, 4, 40],
  floorC: ["#c2f26c", "#f6a0de", "#86beff"],
  glowC: ["#a6ff3a", "#ff6ad0", "#4aa0ff"],
  sideC: "#8a8fb8",
  mix: [0.12, 0.06, 0.06],
  crack: 1.15,
  ice: 0,
  spin: [0.16, -0.2, 0.22],
  spinUp: 1.5,
  pull: 0.055,
  dist: 18,
  pitch: 0.96,
  intro: { s: "THE DECKS SPIN!", zh: "甲板在转！", sub: "The spin pulls you to the rim: keep to the hub", subZh: "转动把你甩向边缘：守住中心", c: "#c2f26c" },
};

export const LEVELS: Level[] = [TOWER, ASTANA, ORBIT];

/** The axial hex (q, r) of a tile centre (x, z) back: used to lay the floors out. */
export const hexX = (S: number, q: number) => S * 1.5 * q;
export const hexZ = (S: number, q: number, r: number) => S * SQ3 * (r + q / 2);
