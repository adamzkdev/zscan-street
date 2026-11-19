/**
 * BUMPER SNARKS' three arenas, as data: the shape of the floor, how slick it is, what happens when,
 * the sky and the setting (built by scenery.ts). bumper.ts plays any of them.
 *
 * - SKY COIN: the giant ⓩ coin high over the city by day. BUMPERS rise, the coin tilts
 *   twice (chevrons point downhill first), NU7 crumbles the rim ring by ring.
 * - FROZEN LAKE RING: a ring of black ice over Central Park's frozen lake on a winter evening, a hole
 *   in its middle where the city shows far below. The ice is slick (you slide much further, rams carry), blizzard GUSTS
 *   blow across it three times (the snow streams and chevrons show which way first).
 * - MARINA LILIES: seven giant lily pads on Marina Bay at night. Three times the six outer pads
 *   DRIFT apart (they glow and arrows point out first), leaving water between the islands; a ram
 *   hops high, so a ram from the rim jumps the gap. On NU7 the outer pads sink one by one.
 */
import type { SongKey } from "../../music";
import type { AmbienceKind } from "../../../audio/kinds";

export type Shape = "disc" | "ring" | "pads";

export interface BumperLevel {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song?: SongKey;
  ambience?: AmbienceKind;
  /** The sky (top, horizon), the fog (near, far), and the lights' colours (hemi sky, hemi ground, sun) and the sun's place. */
  sky: [string, string];
  fog: [number, number];
  hemi: [string, string, number];
  sun: [string, number, [number, number, number]];
  /** How dark the sun's cast shadows are on this floor (× the stage's: shadows.ts). */
  shadowK: number;
  /** The stage's finish for it (post.ts multipliers: at dusk and at night the lights bloom sooner). */
  finish?: { bloom?: number; hot?: number; grade?: number; exposure?: number };
  /** NU7's sky (top, middle, low) and what the fog, the hemi and the sun turn to. */
  qSky: [string, string, string];
  qFog: string;
  qHemi: string;
  qSun: string;
  shape: Shape;
  /** disc / ring: the hole (ring), the part that never falls (to rIn), then nb rings of tiles bw wide. */
  hole: number;
  rIn: number;
  bw: number;
  nb: number;
  /** The tiles' checker (the tops), their sides (null: the coin's milled gold). */
  floor: [string, string];
  side: string | null;
  /** Rolling: the push (m/s²), the floor's drag (/s), the human's extra grip near an edge (×), the ram's speed (×), the AI's look-ahead (×). */
  acc: number;
  drag: number;
  grip: number;
  /** The human's knockback (× a rival's: the party-game assist). */
  soft: number;
  dash: number;
  look: number;
  /** The AI's room: how close to an edge it lets itself get (×), how far it checks where a missed ram would leave it (×). */
  margin: number;
  probe: number;
  /** A ram's hop: its upward speed (+ per charge); airborne balls never fall, and a ram's landing shoves whoever is near (the lily pads). */
  hop: [number, number];
  airSafe: boolean;
  /** BUMPERS (how many; 0: none). */
  posts: number;
  /** The tilts / gusts: when, how hard they push (m/s²), how far the floor leans (0: a gust, it does not lean), how long they hold. */
  tiltAt: number[];
  tiltAcc: number;
  tiltLean: number;
  tiltHold: number;
  tiltColor: string;
  tiltSay: [string, string];
  /** The pads' drifts: when, how far (m). */
  driftAt: number[];
  driftBy: number[];
  /** What the crumble is called. */
  crumbleSay: [string, string];
  /** A fall ends in water (the bay), not in the city far below. */
  water: boolean;
  /** The play camera's pitch (rad down). */
  pitch: number;
  /** The rim lights' colours; what a fast ball throws up from the floor (sparks, frost, spray); glints on the floor (ice). */
  bulbs: [string, string, string, string];
  trail: string[];
  glints: boolean;
  /** The Z-Blocks round it (x, y, z). */
  qbs: [number, number, number][];
}

export const COIN: BumperLevel = {
  key: "coin",
  title: "SKY COIN",
  titleZh: "天空金币",
  tag: "The giant ⓩ coin over the city: bumpers pop up, the coin tilts, NU7 eats the rim.",
  tagZh: "城市上空的巨型 ⓩ 币：弹柱升起，硬币倾斜，NU7 吞掉边缘。",
  ambience: "city-day",
  sky: ["#3f9dff", "#8cc6fa"],
  fog: [30, 168],
  hemi: ["#ffffff", "#8f8670", 1.7],
  // (from the left, a little in front: the shadows fall across the coin to the right, the faces stay lit)
  sun: ["#fff0d6", 2.3, [-34, 46, 22]],
  shadowK: 1,
  qSky: ["#2a1458", "#a43a7a", "#ff8a5c"],
  qFog: "#ff8a5c",
  qHemi: "#ffd6c8",
  qSun: "#ffb38a",
  shape: "disc",
  hole: 0,
  rIn: 4.2,
  bw: 0.96,
  nb: 5,
  floor: ["#fffaf0", "#c8beff"],
  side: null,
  acc: 15,
  drag: 2.1,
  grip: 1.6,
  soft: 0.82,
  dash: 1,
  look: 1,
  margin: 1,
  probe: 1,
  hop: [1.8, 1.6],
  airSafe: false,
  posts: 3,
  tiltAt: [19.5, 27.5],
  tiltAcc: 6.5,
  tiltLean: 0.15,
  tiltHold: 4.2,
  tiltColor: "#ff7a1a",
  tiltSay: ["TILT!", "倾斜！"],
  driftAt: [],
  driftBy: [],
  crumbleSay: ["THE EDGE IS CRUMBLING!", "边缘要塌了！"],
  water: false,
  pitch: 1.0,
  bulbs: ["#ffffff", "#3ec6ff", "#ffd23f", "#3ec6ff"],
  trail: ["#ffffff", "#ffe27a", "#c9c0ff"],
  glints: false,
  qbs: [
    [-13.5, 2.6, -1],
    [13.5, 2.6, -1],
    [-8.5, 4.2, -12.5],
    [8.5, 4.2, -12.5],
  ],
};

export const ASTANA: BumperLevel = {
  key: "astana",
  title: "FROZEN LAKE RING",
  titleZh: "冰湖环",
  tag: "A ring of black ice over Central Park's frozen lake: you slide further, mind the hole, blizzard gusts blow.",
  tagZh: "中央公园冰湖上空的黑冰环：滑得更远，小心中间的洞，暴风雪阵风吹过。",
  song: "frost",
  ambience: "wind",
  sky: ["#2b2f7a", "#c391ae"],
  fog: [34, 176],
  hemi: ["#e4e8ff", "#7d74a8", 1.75],
  // (a low evening sun behind the ring, to the left: long warm light toward the camera, cool shade)
  sun: ["#ffd2b0", 2.1, [-30, 37, -26]],
  shadowK: 0.9,
  finish: { hot: 0.8, bloom: 1.1 },
  qSky: ["#140a3a", "#7a2a6a", "#ff6a4a"],
  qFog: "#ff7a5c",
  qHemi: "#ffd0c8",
  qSun: "#ff9a7a",
  shape: "ring",
  hole: 2.5,
  rIn: 4.7,
  bw: 1.0,
  nb: 5,
  floor: ["#f4fbff", "#a9dcff"],
  side: "#5fb6f0",
  acc: 10.5,
  drag: 1.45,
  grip: 1.6,
  soft: 0.82,
  dash: 0.88,
  look: 1.4,
  margin: 0.8,
  probe: 0.8,
  hop: [1.8, 1.6],
  airSafe: false,
  posts: 0,
  tiltAt: [12.5, 21, 29],
  tiltAcc: 4.6,
  tiltLean: 0,
  tiltHold: 3.4,
  tiltColor: "#2a5bff",
  tiltSay: ["GUST!", "阵风！"],
  driftAt: [],
  driftBy: [],
  crumbleSay: ["THE ICE IS BREAKING!", "冰面要碎了！"],
  water: false,
  pitch: 1.0,
  bulbs: ["#ffffff", "#7fe0ff", "#ffd23f", "#7fe0ff"],
  trail: ["#ffffff", "#dff6ff", "#a9dcff"],
  glints: true,
  qbs: [
    [-14, 2.8, -1],
    [14, 2.8, -1],
    [-9, 4.4, -13.5],
    [9, 4.4, -13.5],
  ],
};

export const MARINA: BumperLevel = {
  key: "marina",
  title: "MARINA LILIES",
  titleZh: "滨海睡莲",
  tag: "Giant lily pads on Marina Bay at night: they drift apart, and a ram hops the gap.",
  tagZh: "夜晚海湾上的巨型睡莲：会漂开，冲撞能跳过水缝。",
  song: "marina",
  ambience: "sea",
  sky: ["#070823", "#3c2468"],
  fog: [40, 210],
  hemi: ["#b8b4ff", "#2a2048", 1.9],
  // (the moon, low over the far shore to the right: soft shadows across the pads toward the camera)
  sun: ["#c8d0ff", 1.6, [26, 46, -30]],
  shadowK: 0.8,
  finish: { hot: 0.62, bloom: 1.2 },
  qSky: ["#12041e", "#6a1250", "#ff3d6a"],
  qFog: "#7a2050",
  qHemi: "#ffc0d0",
  qSun: "#ff9ab0",
  shape: "pads",
  hole: 0,
  rIn: 0,
  bw: 0,
  nb: 0,
  floor: ["#7fd35a", "#4fae3c"],
  side: "#2f7a2a",
  acc: 15,
  drag: 2.1,
  grip: 1.15,
  soft: 0.95,
  dash: 1,
  look: 1.1,
  margin: 0.55,
  probe: 0.5,
  hop: [3.3, 2.4],
  airSafe: true,
  posts: 0,
  tiltAt: [],
  tiltAcc: 0,
  tiltLean: 0,
  tiltHold: 0,
  tiltColor: "#3ee0ff",
  tiltSay: ["DRIFT!", "漂开！"],
  driftAt: [10.5, 19.5, 28.5],
  driftBy: [1.9, 2.25, 2.6],
  crumbleSay: ["THE PADS ARE SINKING!", "睡莲要沉了！"],
  water: true,
  pitch: 0.95,
  bulbs: ["#ffe7a0", "#ff5fa2", "#7fe0ff", "#ff5fa2"],
  trail: ["#ffffff", "#bfe8ff", "#b6ee7a"],
  glints: false,
  qbs: [
    [-14.5, 2.6, -1],
    [14.5, 2.6, -1],
    [-9, 4.2, -14.5],
    [9, 4.2, -14.5],
  ],
};

export const LEVELS: BumperLevel[] = [COIN, ASTANA, MARINA];
