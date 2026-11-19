/**
 * FORGERY GAP's levels (forge.ts plays them): each one a layout (the stretches' sizes, where they sit
 * across, how much each row climbs), a look (sky, fog, palette) and a twist of its own.
 *
 * - SKYWAY: today's field over ZStreet by day, three flat stretches that widen. EXPOSURE at 26 s:
 *   the TRACKER BEAM sweeps the field and breaks the transparent tiles.
 * - SPROUT RUINS: a foggy night in the ruins of the old Sprout vault (Zcash's first, retired shielded
 *   pool), a field that swells then narrows and jogs aside. A lighthouse's beam sweeps the field: in its light the forgeries show red. At 30 s
 *   the fog rolls in (the light shrinks, eyes see less far).
 * - HALO SPIRE: a winding stair up the side of the HALO TOWER at sunset to its helipad: narrow
 *   flights that climb row by row, zigzag across, a long fall. Gusts blow everyone sideways (stronger
 *   the higher you are), each one called by the windsocks and a whoosh first.
 */
import type { SongKey } from "../../music";
import type { AmbienceKind } from "../../../audio/kinds";

export interface ForgeLevel {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  song: SongKey;
  ambience: AmbienceKind;
  /** The three stretches: columns, rows; valid tiles off the true path, sloppy forgeries, transparent tiles among the valid, sideways steps in the path. */
  cols: number[];
  rows: number[];
  extra: number[];
  sloppy: number[];
  legacy: number[];
  wiggle: number[];
  /** Each stretch's middle across (m). */
  ox: number[];
  /** Each row's step up (m; 0: flat). */
  rise: number;
  /** The pads' depths: the start, a checkpoint, the finish; the finish's width. */
  startD: number;
  cpD: number;
  finD: number;
  finW: number;
  /** The look. */
  sky: [string, string];
  fog: [number, number];
  night?: boolean;
  segTop: string[];
  segSide: string[];
  segInk: string[];
  /** The pads' top and side: the start, a checkpoint, the finish. */
  pads: [string, string][];
  /** The rejection net: its fill, its mesh, its rim. */
  net: [string, string, string];
  /** The pylons along the sides: the post, the lights on top (two colours). */
  pylon: [string, string, string];
  /** The light: the sun (colour, strength, where from), the sky-and-ground fill. */
  light?: { sun: [string, number]; sunAt: [number, number, number]; hemi: [string, string, number] };
  /** EXPOSURE: the TRACKER BEAM (s it starts, its speed m/s, the warning a transparent tile gets s). */
  qday?: { at: number; v: number; warn: number };
  /** The lighthouse: its spot's radius (m), one sweep along the field and back (s), across (s); the fog's time and the radius after. */
  lamp?: { r: number; along: number; across: number; fogAt: number; r2: number };
  /** Gusts: the first (s), the gap between them at the start and at the end (s), the warning, the gust (s), its speed per stretch (m/s), its share on the ground. */
  gust?: { first: number; gap0: number; gap1: number; warn: number; dur: number; v: number[]; ground: number };
}

export const SKYWAY: ForgeLevel = {
  key: "skyway",
  title: "SKYWAY",
  titleZh: "城市天桥",
  tag: "Over ZStreet by day. EXPOSURE at 26 s: the Tracker beam breaks the transparent tiles.",
  tagZh: "白天的 ZStreet 上空。26 秒曝光：追踪光束击碎透明方块。",
  song: "tense",
  ambience: "city-day",
  cols: [4, 6, 8],
  rows: [6, 7, 8],
  extra: [0.22, 0.16, 0.12],
  sloppy: [0.9, 0.8, 0.7],
  legacy: [0.45, 0.5, 0.5],
  wiggle: [0.12, 0.25, 0.35],
  ox: [0, 0, 0],
  rise: 0,
  startD: 5,
  cpD: 3.2,
  finD: 7,
  finW: 22,
  sky: ["#3f7dff", "#ffd3ea"],
  fog: [70, 240],
  segTop: ["#d6c8ff", "#a9e6ff", "#ffc4e4"],
  segSide: ["#7a62d9", "#3a8fd0", "#d0508f"],
  segInk: ["#3b2a8f", "#1d4f86", "#8a1f56"],
  pads: [
    ["#6c5ae6", "#2e2470"],
    ["#3fd0a8", "#1b6e5a"],
    ["#ffcf2e", "#b87d00"],
  ],
  net: ["rgba(80,220,255,0.10)", "rgba(150,245,255,0.95)", "#4fe6ff"],
  pylon: ["#5b3fc4", "#7ff3ff", "#ff9cf0"],
  light: { sun: ["#fff2dc", 2.4], sunAt: [30, 60, 24], hemi: ["#f4f8ff", "#9a8a78", 1.75] },
  qday: { at: 26, v: 4.2, warn: 1.5 },
};

export const RUINS: ForgeLevel = {
  key: "ruins",
  title: "SPROUT RUINS",
  titleZh: "Sprout 废墟",
  tag: "A foggy night in the Sprout ruins: the lighthouse beam shows counterfeits in red as it sweeps.",
  tagZh: "Sprout 废墟里的雾夜：灯塔光束扫过时，伪钞方块会显出红色。",
  song: "neon",
  ambience: "sea",
  cols: [5, 7, 6],
  rows: [7, 7, 7],
  extra: [0.12, 0.09, 0.07],
  sloppy: [0.6, 0.45, 0.35],
  legacy: [0, 0, 0],
  wiggle: [0.15, 0.3, 0.35],
  ox: [0, 1, -1],
  rise: 0,
  startD: 5,
  cpD: 3.2,
  finD: 7,
  finW: 20,
  sky: ["#0b0a26", "#2a3a6a"],
  fog: [26, 74],
  night: true,
  segTop: ["#b9c4e8", "#c8b8f0", "#a8d8e8"],
  segSide: ["#4a5590", "#5d4a98", "#3a7088"],
  segInk: ["#1e2550", "#2e1f5a", "#123848"],
  pads: [
    ["#8a8fa8", "#3e4258"],
    ["#a8a089", "#58503c"],
    ["#ffcf2e", "#b87d00"],
  ],
  net: ["rgba(60,120,255,0.10)", "rgba(110,170,255,0.8)", "#4a7dff"],
  pylon: ["#565b78", "#ffb347", "#ffd27a"],
  light: { sun: ["#b4c4ff", 1.15], sunAt: [40, 60, 30], hemi: ["#8f96e8", "#241a3c", 1.5] },
  lamp: { r: 3.4, along: 20, across: 3.4, fogAt: 30, r2: 2.7 },
};

export const SPIRE: ForgeLevel = {
  key: "spire",
  title: "HALO SPIRE",
  titleZh: "Halo 塔顶",
  tag: "A winding stair up the Halo tower. Gusts blow you sideways: watch the windsocks.",
  tagZh: "沿 Halo 塔盘旋而上的阶梯。阵风把你吹向一侧：留意风向袋。",
  song: "hero",
  ambience: "wind",
  cols: [4, 5, 6],
  rows: [6, 6, 7],
  extra: [0.24, 0.18, 0.14],
  sloppy: [0.9, 0.8, 0.7],
  legacy: [0, 0, 0],
  wiggle: [0.12, 0.25, 0.3],
  ox: [-3, 3.5, -2],
  rise: 0.4,
  startD: 5,
  cpD: 3.4,
  finD: 7,
  finW: 16,
  sky: ["#8a5ad0", "#ffc890"],
  fog: [80, 260],
  segTop: ["#ffe2b8", "#ffd0dc", "#d8f0ff"],
  segSide: ["#d9773a", "#c94f7a", "#4f7fd0"],
  segInk: ["#7a3a10", "#7a1f46", "#1f3f86"],
  pads: [
    ["#7d6be0", "#352a7a"],
    ["#f2f2f7", "#8a8aa0"],
    ["#4a4f63", "#22252f"],
  ],
  net: ["rgba(255,170,80,0.10)", "rgba(255,214,150,0.95)", "#ffb04f"],
  pylon: ["#3a3f55", "#ffffff", "#ffd23f"],
  light: { sun: ["#ffd6b8", 2.2], sunAt: [-30, 40, 30], hemi: ["#fff2ea", "#6a4a68", 1.65] },
  gust: { first: 7, gap0: 8, gap1: 5, warn: 1.4, dur: 1.8, v: [1.4, 1.8, 2.2], ground: 0.62 },
};

export const LEVELS: ForgeLevel[] = [SKYWAY, RUINS, SPIRE];

// ---- the layout ----------------------------------------------------------------------------------

/** The tiles' pitch (m). */
export const PITCH = 2;

/** A stretch of tiles: its index, size, where it runs (progress p = −z), its first tile, its middle across, its floor and climb. */
export interface Seg {
  k: number;
  cols: number;
  rows: number;
  p0: number;
  p1: number;
  c0: number;
  n: number;
  w: number;
  ox: number;
  y0: number;
  rise: number;
}
/** A pad (the start, a checkpoint, the finish): where it runs, its width and middle across, its floor. */
export interface Pad {
  p0: number;
  p1: number;
  w: number;
  ox: number;
  y: number;
}
export interface Layout {
  segs: Seg[];
  pads: Pad[];
  /** The tiles. */
  nc: number;
  /** The finish line (the course's length). */
  end: number;
  /** The route finder's nodes at most (a stretch's tiles, the pad behind, the pad ahead). */
  maxn: number;
}

/** The course runs along −z: the start pad, three stretches with a pad after each (each pad wide enough for the stretches on both sides). */
export function plan(lv: ForgeLevel): Layout {
  const segs: Seg[] = [];
  const s0w = lv.cols[0] * PITCH;
  const pads: Pad[] = [{ p0: -lv.startD, p1: 0, w: s0w + 4, ox: lv.ox[0], y: 0 }];
  let nc = 0,
    p = 0,
    y = 0;
  for (let k = 0; k < 3; k++) {
    const w = lv.cols[k] * PITCH;
    const s: Seg = { k, cols: lv.cols[k], rows: lv.rows[k], p0: p, p1: p + lv.rows[k] * PITCH, c0: nc, n: lv.cols[k] * lv.rows[k], w, ox: lv.ox[k], y0: y, rise: lv.rise };
    segs.push(s);
    nc += s.n;
    p = s.p1;
    y += (s.rows + 1) * lv.rise;
    if (k < 2) {
      const nw = lv.cols[k + 1] * PITCH;
      const lo = Math.min(s.ox - w / 2, lv.ox[k + 1] - nw / 2),
        hi = Math.max(s.ox + w / 2, lv.ox[k + 1] + nw / 2);
      pads.push({ p0: p, p1: p + lv.cpD, w: hi - lo + 2, ox: (lo + hi) / 2, y });
      p += lv.cpD;
    } else {
      pads.push({ p0: p, p1: p + lv.finD, w: Math.max(lv.finW, w + 6), ox: s.ox, y });
      p += lv.finD;
    }
  }
  return { segs, pads, nc, end: pads[3].p0, maxn: Math.max(...segs.map((s) => s.n)) + 2 };
}
