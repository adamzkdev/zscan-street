import * as THREE from "three";
import type { TxKind } from "../data/types";

/**
 * Pixel-art pieces drawn at the zkSNARKs' own pixel size (their portraits are 26×26 cells), so
 * legs, hands and what they carry read as part of the same drawing.
 */
export const GRID = 26;

export type ItemKind = TxKind | "briefcase" | "goldcase" | LifeItem;

/** What residents (people with no transaction) have in hand. */
export type LifeItem = "coffee" | "can" | "bag" | "phone" | "flowers" | "fish" | "basket" | "rod" | "book";

export type Px = (x: number, y: number, w: number, h: number, c: string) => void;

export function sprite(w: number, h: number, draw: (px: Px) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw((x, y, ww, hh, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, ww, hh);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return { texture: t, w, h };
}

/**
 * Keep a sprite cache bounded: every new zkSNARK brings its own cloth colour, so over a long visit
 * these grew by thousands of little canvases. The least recently used are let go (a character
 * still wearing one keeps its texture; three.js simply uploads it again if it was freed).
 */
function boundCache<V>(cache: Map<string, V>, max: number, free: (v: V) => void) {
  while (cache.size > max) {
    const [k, v] = cache.entries().next().value!;
    cache.delete(k);
    free(v);
  }
}
function touch<V>(cache: Map<string, V>, key: string, v: V) {
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

const legCache = new Map<string, ReturnType<typeof sprite>>();
/** One stubby leg: trouser, cuff, shoe with a toe and a highlight. */
export function legSprite(trouser: string) {
  let s = legCache.get(trouser);
  if (s) return touch(legCache, trouser, s);
  {
    s = sprite(5, 8, (px) => {
      px(0, 0, 5, 5, trouser);
      px(0, 0, 1, 5, shade(trouser, 0.7));
      px(4, 0, 1, 5, shade(trouser, 0.82));
      px(0, 5, 5, 1, shade(trouser, 0.6));
      px(0, 6, 5, 2, "#1d1b24");
      px(1, 6, 2, 1, "#4a4656");
      px(0, 7, 5, 1, "#0e0d12");
    });
    legCache.set(trouser, s);
    boundCache(legCache, 500, (x) => x.texture.dispose());
  }
  return s;
}

const handCache = new Map<string, ReturnType<typeof sprite>>();
/** A mitten-like hand in the sleeve colour, outlined like the portraits. */
export function handSprite(sleeve: string) {
  let s = handCache.get(sleeve);
  if (!s) {
    s = sprite(3, 3, (px) => {
      px(0, 0, 3, 3, shade(sleeve, 0.55));
      px(0, 0, 2, 2, sleeve);
      px(0, 0, 1, 1, shade(sleeve, 1.25));
    });
    handCache.set(sleeve, s);
  }
  return s;
}

const COIN = "#f4b728",
  COIN_DARK = "#a8700e",
  COIN_HI = "#ffe68a";
function coin(px: Px, x: number, y: number) {
  px(x, y, 3, 3, COIN);
  px(x + 2, y + 1, 1, 2, COIN_DARK);
  px(x, y, 1, 1, COIN_HI);
}

const itemCache = new Map<ItemKind, ReturnType<typeof sprite>>();
/**
 * What a zkSNARK carries, by transaction kind:
 * transparent = a glass case, coins in plain sight; shielded = a sealed black box with a lock;
 * shielding = coins dropping into the black box; deshielding = the box opened, coins out;
 * migration = a moving box (Orchard → Ironwood); briefcases for the big visible amounts.
 */
export function itemSprite(kind: ItemKind) {
  let s = itemCache.get(kind);
  if (s) return s;
  s = sprite(12, 10, (px) => drawItem(px, kind));
  itemCache.set(kind, s);
  return s;
}

/** The 12×10 drawing of an item (see itemSprite). */
function drawItem(px: Px, kind: ItemKind) {
  switch (kind) {
    case "transparent":
      px(0, 2, 12, 8, "#9fe8ff");
      px(1, 3, 10, 6, "#1f4656");
      px(1, 3, 10, 1, "#5fb8d0");
      coin(px, 2, 6);
      coin(px, 5, 5);
      coin(px, 8, 6);
      px(1, 2, 2, 1, "#ffffff");
      break;
    case "shielded":
      px(0, 2, 12, 8, "#121017");
      px(0, 2, 12, 1, "#8f7bff");
      px(0, 9, 12, 1, "#3ee08f");
      px(5, 4, 3, 4, "#f4b728");
      px(6, 3, 1, 1, "#f4b728");
      px(6, 6, 1, 1, "#121017");
      px(1, 3, 1, 1, "#3a3448");
      break;
    case "shielding":
      px(0, 4, 12, 6, "#121017");
      px(0, 4, 12, 1, "#8f7bff");
      coin(px, 4, 0);
      coin(px, 7, 2);
      px(3, 5, 6, 1, "#000000");
      break;
    case "deshielding":
      px(0, 5, 12, 5, "#121017");
      px(0, 5, 12, 1, "#ffcf4a");
      px(1, 2, 7, 2, "#2a2632");
      px(1, 2, 7, 1, "#4a4456");
      coin(px, 8, 0);
      coin(px, 5, 3);
      break;
    case "migration":
      px(0, 2, 12, 8, "#b0804c");
      px(0, 2, 12, 1, "#c89660");
      px(5, 2, 2, 8, "#d8c090");
      px(0, 9, 12, 1, "#8a5e34");
      px(1, 5, 3, 3, "#8f7bff");
      px(2, 6, 1, 1, "#e8e0ff");
      break;
    case "briefcase":
    case "goldcase": {
      const body = kind === "goldcase" ? "#d8a428" : "#b8bcc8";
      px(4, 0, 4, 1, "#2a2830");
      px(3, 1, 1, 2, "#2a2830");
      px(8, 1, 1, 2, "#2a2830");
      px(0, 3, 12, 7, body);
      px(0, 3, 12, 1, shade(body, 1.2));
      px(0, 9, 12, 1, shade(body, 0.6));
      px(5, 5, 2, 2, "#2a2830");
      px(0, 6, 12, 1, shade(body, 0.75));
      break;
    }
    case "rod":
      // a fishing rod held low, the tip up and out to the right, a reel by the hands
      for (let k = 0; k < 10; k++) px(1 + k, 9 - k, 1, 1, k < 3 ? "#3a2a1a" : "#8a6a4a");
      px(2, 6, 2, 2, "#c0c0c8");
      break;
    case "book":
      px(1, 2, 10, 8, "#2e5ab8");
      px(1, 2, 10, 1, "#4a7ad0");
      px(5, 2, 2, 8, "#f0ece0");
      px(2, 4, 3, 1, "#f4b728");
      break;
    case "coffee":
      px(4, 2, 4, 1, "#f0ece4");
      px(4, 3, 4, 7, "#e8e2d6");
      px(4, 5, 4, 2, "#9a6a3a");
      px(7, 3, 1, 7, "#c8c0b0");
      px(5, 0, 1, 1, "#dcdce4");
      px(6, 1, 1, 1, "#dcdce4");
      break;
    case "can":
      px(4, 3, 4, 7, "#e05a5a");
      px(4, 3, 4, 1, "#c8c8d0");
      px(4, 6, 4, 2, "#f0f0f0");
      px(7, 4, 1, 6, "#a83a3a");
      break;
    case "bag":
      px(3, 0, 1, 3, "#2a2830");
      px(8, 0, 1, 3, "#2a2830");
      px(4, 0, 4, 1, "#2a2830");
      px(1, 3, 10, 7, "#f4f0e8");
      px(1, 3, 10, 1, "#ffffff");
      px(1, 9, 10, 1, "#c8c0b0");
      px(4, 5, 4, 3, "#f4b728");
      px(5, 6, 2, 1, "#a8700e");
      break;
    case "phone":
      px(4, 1, 4, 8, "#1a1820");
      px(5, 2, 2, 5, "#7fd3ff");
      px(5, 2, 1, 1, "#d8f4ff");
      px(5, 8, 2, 1, "#3a3848");
      break;
    case "flowers":
      px(5, 5, 2, 5, "#3a8a4a");
      px(3, 1, 2, 2, "#ff7aa8");
      px(7, 0, 2, 2, "#ffd84a");
      px(5, 2, 2, 2, "#ff5a6a");
      px(2, 4, 8, 2, "#f0ece4");
      px(3, 6, 6, 1, "#d8d0c4");
      break;
    case "fish":
      px(1, 4, 8, 3, "#ff8a3a");
      px(1, 4, 8, 1, "#ffb07a");
      px(9, 3, 2, 5, "#e0602a");
      px(2, 5, 1, 1, "#1a1820");
      break;
    case "basket":
      px(2, 2, 8, 1, "#8a5e34");
      px(1, 4, 10, 6, "#b0804c");
      px(1, 4, 10, 1, "#c89660");
      px(2, 3, 3, 2, "#ff7a2a");
      px(6, 3, 3, 2, "#ff9a3a");
      px(4, 2, 2, 2, "#ff8a2a");
      break;
    default:
      px(0, 2, 12, 8, "#8a8494");
      px(0, 2, 12, 1, "#a8a2b2");
      px(5, 2, 2, 8, "#5a5464");
      px(0, 5, 12, 1, "#5a5464");
  }
}

const umbrellaCache = new Map<string, ReturnType<typeof sprite>>();
/** A paper umbrella seen from the side: canopy with ribs, a stick down to the hands. */
export function umbrellaSprite(color: string) {
  let s = umbrellaCache.get(color);
  if (!s) {
    s = sprite(24, 18, (px) => {
      px(8, 0, 8, 1, shade(color, 1.15));
      px(4, 1, 16, 1, color);
      px(2, 2, 20, 1, color);
      px(1, 3, 22, 1, color);
      px(0, 4, 24, 2, color);
      px(0, 5, 24, 1, shade(color, 0.7));
      for (const x of [0, 6, 12, 18, 23]) px(x, 6, 1, 1, shade(color, 0.55));
      px(6, 1, 1, 4, shade(color, 1.25));
      px(11, 0, 2, 1, "#2a2830");
      px(12, 6, 1, 12, "#2a2830");
    });
    umbrellaCache.set(color, s);
  }
  return s;
}

/** What a speech bubble shows: a reaction, never words. */
export type Emote = "!" | "?" | "note" | "heart" | "zec" | "dots" | "zzz" | "up" | "down" | "sad" | "star" | "angry";

const GLYPH: Record<Emote, [string, string[]]> = {
  "!": ["#e0302a", ["..#..", "..#..", "..#..", ".....", "..#.."]],
  "?": ["#3a5ac0", [".###.", "...#.", "..#..", ".....", "..#.."]],
  note: ["#2a2830", ["..##.", "..#.#", "..#..", "###..", "##..."]],
  heart: ["#e0305a", [".#.#.", "#####", "#####", ".###.", "..#.."]],
  zec: ["#d8a020", [".###.", "#...#", "#.#.#", "#...#", ".###."]],
  dots: ["#2a2830", [".....", ".....", "#.#.#", ".....", "....."]],
  zzz: ["#5a6ac0", ["####.", "..#..", ".#...", "####.", "....."]],
  up: ["#1aa05a", ["..#..", ".###.", "#.#.#", "..#..", "..#.."]],
  down: ["#e0302a", ["..#..", "..#..", "#.#.#", ".###.", "..#.."]],
  sad: ["#2a2830", ["#...#", ".....", ".###.", "#...#", "....."]],
  star: ["#f4b728", ["..#..", ".###.", "#####", ".###.", ".#.#."]],
  // the anime anger vein
  angry: ["#e0202a", ["##.##", "#...#", ".....", "#...#", "##.##"]],
};

const bubbleCache = new Map<Emote, ReturnType<typeof sprite>>();
/** A pixel speech bubble with one glyph, outlined like the portraits. */
export function bubbleSprite(e: Emote) {
  let s = bubbleCache.get(e);
  if (!s) {
    const [col, rows] = GLYPH[e];
    s = sprite(11, 11, (px) => {
      px(1, 0, 9, 1, "#1a1820");
      px(1, 8, 9, 1, "#1a1820");
      px(0, 1, 1, 7, "#1a1820");
      px(10, 1, 1, 7, "#1a1820");
      px(1, 1, 9, 7, "#fbf8f0");
      px(1, 7, 9, 1, "#dcd6c8");
      // the tail, bottom left
      px(2, 9, 2, 1, "#1a1820");
      px(2, 8, 2, 1, "#fbf8f0");
      px(2, 10, 1, 1, "#1a1820");
      rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && px(3 + x, 2 + y, 1, 1, col)));
    });
    bubbleCache.set(e, s);
  }
  return s;
}

// ---- what they wear on the head -----------------------------------------------------------------
//
// Uniform headwear is painted INTO a copy of the portrait (snark.ts dressedTexture), on its own
// 26×26 grid, so it sits on that head, bobs and tilts with it and casts the same selection glow.
// Every zkSNARK shares one face template: the head's crown starts on row ~6 (row 3–5 under tall
// hats), the forehead is row 11, the eyes rows 13–14, the face spans columns ~9–20 and faces right.
// What the portrait already wears up there (a beanie, a cap and its peak, a halo, the hood's top)
// is cleared first (`clearHead`), then the new hat covers the same rows: nothing pokes out.

export type Hat = "police" | "hard" | "chef" | "laurel";

/** The head as the hat sees it: columns L..R across the forehead (portrait cells). */
export interface HeadFit {
  L: number;
  R: number;
}

/** Where a hat may erase the portrait: rows above `rows` from column `col` on (the trail stays). */
export function hatClear(hat: Hat): { rows: number; col: number } {
  // the laurel sits on the hair: only what stands above the crown goes (a halo, a tall hat)
  return hat === "laurel" ? { rows: 6, col: 9 } : { rows: 11, col: 9 };
}

/** Paint a hat on the portrait grid (see the note above), its band just above the eyes. */
export function drawHat(px: Px, hat: Hat, f: HeadFit, color?: string) {
  const { L, R } = f;
  const C = Math.floor((L + R) / 2);
  switch (hat) {
    case "police": {
      // a peaked cap in profile: a flat crown wider than the head (overhanging the brow), a dark
      // band with a gold cord, the badge on the front, the black peak over the eyes
      const navy = color ?? "#24366f",
        hi = shade(navy, 1.35),
        lo = shade(navy, 0.72),
        band = "#121628",
        gold = "#e8b030";
      px(L + 2, 4, R - L, 1, hi);
      px(L + 1, 5, R - L + 2, 1, navy);
      px(L, 6, R - L + 3, 2, navy);
      px(L + 1, 5, 3, 1, hi);
      px(L, 6, 1, 2, lo);
      px(R + 2, 5, 1, 3, lo);
      px(L, 8, R - L + 2, 1, lo);
      px(L, 9, R - L + 1, 2, band);
      px(R - 7, 10, 8, 1, gold);
      // the badge: a little gold shield on the crown's front
      px(R - 3, 6, 3, 2, gold);
      px(R - 3, 6, 1, 1, "#fff0a8");
      px(R - 2, 8, 1, 1, "#a8700e");
      // the peak, down over the brow and out in front
      px(R - 7, 11, 11, 1, "#0a0a0e");
      px(R - 5, 11, 4, 1, "#30303c");
      px(R + 2, 10, 2, 1, "#0a0a0e");
      break;
    }
    case "hard": {
      // a builder's helmet: domed shell with a raised ridge, a brim all round, longer in front
      const c = color ?? "#f4c020",
        hi = shade(c, 1.22),
        lo = shade(c, 0.8),
        dk = shade(c, 0.6);
      px(L + 3, 4, R - L - 4, 1, c);
      px(L + 1, 5, R - L, 1, c);
      px(L, 6, R - L + 2, 4, c);
      px(L, 6, 1, 4, lo);
      px(R + 1, 6, 1, 4, lo);
      px(L, 10, R - L + 2, 1, lo);
      // the ridge and a sheen
      px(C - 1, 4, 2, 6, hi);
      px(L + 2, 6, 2, 1, hi);
      px(L - 1, 11, R - L + 5, 1, dk);
      px(R + 1, 11, 3, 1, lo);
      break;
    }
    case "chef": {
      // a toque: a pleated puff over a tall band
      const w = "#f8f6f0",
        s1 = "#dedad0",
        s2 = "#c4bfb4";
      px(L + 2, 0, R - L - 3, 1, w);
      px(L, 1, R - L + 2, 1, w);
      px(L - 1, 2, R - L + 4, 4, w);
      px(L, 6, R - L + 2, 1, s1);
      for (const x of [L + 2, C, R - 1]) px(x, 2, 1, 4, s1);
      px(R + 2, 2, 1, 4, s2);
      px(L + 1, 1, 2, 1, "#ffffff");
      px(L, 7, R - L + 1, 4, w);
      px(L, 7, 1, 4, s1);
      px(R, 7, 1, 4, s1);
      px(L, 10, R - L + 1, 1, s2);
      break;
    }
    case "laurel": {
      // a gold-green wreath round the crown, leaves pointing back
      const g = color ?? "#5a8a3a",
        hi = shade(g, 1.35),
        dk = shade(g, 0.7);
      for (let x = L; x <= R + 1; x++) {
        px(x, 7, 1, 1, (x - L) % 2 ? g : hi);
        if ((x - L) % 2 === 0) px(x - 1, 6, 1, 1, dk);
      }
      px(R + 1, 8, 1, 1, g);
      px(L, 8, 1, 1, dk);
      break;
    }
  }
}

/** A hi-vis vest over the lower bust: painted only where the bust is (`solid`), two bright bands. */
export function drawVest(px: Px, solid: (c: number, r: number) => boolean, color: string) {
  for (let r = 20; r < 26; r++)
    for (let c = 10; c <= 21; c++) {
      if (!solid(c, r)) continue;
      const band = r === 22 || r === 24;
      px(c, r, 1, 1, band ? (r === 22 ? "#eef2f4" : "#c8ccd0") : c === 10 || !solid(c - 1, r) ? shade(color, 0.75) : color);
    }
}

const lapCache = new Map<string, { s: ReturnType<typeof sprite>; up: number }>();
/**
 * Both legs of someone sitting, in profile (facing right like the portraits): thighs forward on
 * the seat, shins down to the floor `shin` cells below, shoes on it. Seated on the floor (shin < 3),
 * the legs stretch out instead, toes up. `up`: rows of the drawing above the thighs' top.
 */
export function lapSprite(trouser: string, shin: number) {
  shin = Math.max(0, Math.min(14, Math.round(shin)));
  const key = `${trouser}|${shin}`;
  const hit = lapCache.get(key);
  if (hit) return touch(lapCache, key, hit);
  const far = shade(trouser, 0.68),
    shoe = "#1d1b24",
    sole = "#0e0d12",
    shine = "#4a4656";
  let out: { s: ReturnType<typeof sprite>; up: number };
  if (shin < 3) {
    // on the floor: legs out in front, the shoes standing up at the end
    out = {
      up: 2,
      s: sprite(16, 5, (px) => {
        px(0, 2, 12, 3, far);
        px(12, 0, 2, 5, sole);
        px(0, 2, 13, 3, trouser);
        px(0, 2, 13, 1, shade(trouser, 1.12));
        px(0, 4, 13, 1, shade(trouser, 0.78));
        px(13, 0, 2, 5, shoe);
        px(13, 0, 1, 1, shine);
        px(15, 1, 1, 4, sole);
      }),
    };
  } else {
    const H = 3 + shin;
    out = {
      up: 0,
      s: sprite(14, H, (px) => {
        // far leg: a column behind, a shade darker
        px(0, 0, 9, 3, far);
        px(6, 3, 3, shin - 2, far);
        px(6, H - 2, 5, 2, sole);
        // near leg: thigh along the seat, knee, shin, shoe with the toe forward
        px(0, 0, 11, 3, trouser);
        px(0, 0, 11, 1, shade(trouser, 1.12));
        px(10, 0, 1, 3 + shin - 2, shade(trouser, 0.8));
        px(8, 3, 3, shin - 2, trouser);
        px(8, 3, 1, shin - 2, shade(trouser, 0.86));
        px(8, H - 3, 3, 1, shade(trouser, 0.6));
        px(8, H - 2, 6, 2, shoe);
        px(9, H - 2, 2, 1, shine);
        px(8, H - 1, 6, 1, sole);
      }),
    };
  }
  lapCache.set(key, out);
  boundCache(lapCache, 300, (x) => x.s.texture.dispose());
  return out;
}

// ---- arms, hands and what they hold ------------------------------------------------------------
//
// The portraits are busts: no arms. These are drawn on the portrait's own 26×26 grid, in two
// layers: `back` behind the bust (the far arm, mostly hidden by it) and `front` over it (the near
// arm, the fists and the item they grip). Coordinates below are portrait cells: column 0 is the
// left edge of the portrait, row 0 its top, row 26 the hips and row 32 the ground. The bust's own
// shoulders end at column ~21 on the right and ~6 on the left (the dissolve trail is further left).

/** The pose canvas: portrait cells [X0, X0 + W) × [Y0, Y0 + H); its bottom edge is the ground. */
export const POSE = { x0: -8, y0: -8, w: 46, h: 40 } as const;

export interface PoseSpec {
  sleeve: string;
  skin: string;
  /** Held items, first in front; empty for free hands. */
  items: ItemKind[];
  umbrella: string | null;
  /** Walking arm swing of the near arm: -1 back, 0, 1 forward (the far arm swings the other way). */
  swing: -1 | 0 | 1;
  /** Standing in a bus, an arm up to the strap. */
  strap: boolean;
}

/** One layer of cells, painted in order, flushed to a canvas at the end. */
class Cells {
  readonly m = new Map<number, string>();
  set(c: number, r: number, col: string) {
    c = Math.round(c);
    r = Math.round(r);
    if (c < POSE.x0 || r < POSE.y0 || c >= POSE.x0 + POSE.w || r >= POSE.y0 + POSE.h) return;
    this.m.set((r - POSE.y0) * POSE.w + (c - POSE.x0), col);
  }
  has(c: number, r: number) {
    return this.m.has((r - POSE.y0) * POSE.w + (c - POSE.x0));
  }
  rect(c: number, r: number, w: number, h: number, col: string) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.set(c + x, r + y, col);
  }
  /** A Px that draws a sprite-space drawing with its top-left at cell (c, r). */
  at(c: number, r: number): Px {
    return (x, y, w, h, col) => this.rect(c + x, r + y, w, h, col);
  }
  draw(px: Px) {
    for (const [k, col] of this.m) px(k % POSE.w, Math.floor(k / POSE.w), 1, 1, col);
  }
}

/** Cells on the line a → b (Bresenham). */
function line(a: [number, number], b: [number, number]) {
  const out: [number, number][] = [];
  let [x0, y0] = a;
  const [x1, y1] = b;
  const dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0),
    sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/** A sleeve two cells thick along a polyline (shoulder → elbow → wrist), shaded like the legs. */
function arm(L: Cells, pts: [number, number][], sleeve: string) {
  const cells = new Set<string>();
  for (let i = 0; i + 1 < pts.length; i++)
    for (const [x, y] of line(pts[i], pts[i + 1])) for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells.add(`${x + ox},${y + oy}`);
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  // a one-cell ink line round the sleeve, so it reads over a bust of the same cloth
  const ink = shade(sleeve, 0.45);
  for (const k of cells) {
    const [x, y] = k.split(",").map(Number);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has(x + ox, y + oy) && !L.has(x + ox, y + oy)) L.set(x + ox, y + oy, ink);
  }
  const dark = shade(sleeve, 0.66),
    mid = shade(sleeve, 0.84),
    hi = shade(sleeve, 1.14);
  for (const k of cells) {
    const [x, y] = k.split(",").map(Number);
    let col = sleeve;
    if (!has(x + 1, y)) col = mid;
    if (!has(x, y + 1) && !has(x + 1, y)) col = dark;
    else if (!has(x, y - 1) && !has(x - 1, y)) col = hi;
    L.set(x, y, col);
  }
}

/** A 3×3 fist with its top-left at (c, r): lit top-left, knuckles shaded bottom-right. */
function fist(L: Cells, c: number, r: number, skin: string) {
  const lo = shade(skin, 0.74),
    lower = shade(skin, 0.56);
  L.rect(c, r, 3, 3, skin);
  L.set(c, r, shade(skin, 1.16));
  L.rect(c + 2, r, 1, 3, lo);
  L.rect(c, r + 2, 3, 1, lo);
  L.set(c + 2, r + 2, lower);
  // the curled fingers: one darker crease across the middle
  L.set(c + 1, r + 1, shade(skin, 0.86));
}

/** Items held up at the chest or face (the others hang from the hand). */
const RAISED = new Set<ItemKind>(["coffee", "can", "phone", "flowers", "fish", "book"]);
const ONE_HAND = new Set<ItemKind>(["briefcase", "goldcase", "coffee", "can", "bag", "phone", "flowers", "fish", "basket"]);

// Held-item drawings at the size they read in a hand (portrait cells), top-left at (0, 0).

function drawCase(px: Px, gold: boolean) {
  const body = gold ? "#d8a428" : "#9aa0b0";
  const strap = "#2a2830";
  // handle: an arch the fist closes on
  px(3, 0, 5, 1, strap);
  px(3, 1, 1, 1, strap);
  px(7, 1, 1, 1, strap);
  px(0, 2, 11, 6, body);
  px(0, 2, 11, 1, shade(body, 1.22));
  px(0, 7, 11, 1, shade(body, 0.58));
  px(10, 3, 1, 4, shade(body, 0.74));
  px(0, 4, 11, 1, shade(body, 0.82));
  px(2, 3, 1, 2, strap);
  px(8, 3, 1, 2, strap);
  px(5, 3, 1, 1, gold ? "#fff0a0" : "#e8ecf4");
}

function drawCup(px: Px) {
  // steam, a lid, the paper cup with its brown sleeve
  px(1, 0, 1, 1, "#e8eaf0");
  px(2, 1, 1, 1, "#d0d4dc");
  px(1, 2, 1, 1, "#e8eaf0");
  px(0, 3, 5, 1, "#f8f6f0");
  px(4, 3, 1, 1, "#c8c0b0");
  px(0, 4, 4, 5, "#ece6da");
  px(0, 4, 1, 5, "#ffffff");
  px(3, 4, 1, 5, "#c8c0b0");
  px(0, 6, 4, 2, "#9a6a3a");
  px(3, 6, 1, 2, "#6e4a28");
  px(1, 6, 1, 1, "#f4b728");
}

function drawCan(px: Px) {
  px(0, 0, 3, 1, "#d8d8e0");
  px(0, 1, 3, 5, "#e0443a");
  px(0, 1, 1, 5, "#ff7a6a");
  px(2, 1, 1, 5, "#a02a24");
  px(0, 3, 3, 1, "#f0f0f0");
  px(0, 5, 3, 1, "#c8c8d0");
}

function drawPhone(px: Px) {
  px(0, 0, 3, 6, "#1a1820");
  px(1, 1, 1, 3, "#7fd3ff");
  px(1, 1, 1, 1, "#e0f6ff");
  px(0, 0, 1, 1, "#3a3848");
}

function drawBouquet(px: Px) {
  // blooms over a paper cone that the fist closes on
  px(1, 1, 2, 2, "#ff5a7a");
  px(4, 0, 2, 2, "#ffd84a");
  px(3, 2, 2, 2, "#ff8ab0");
  px(0, 3, 1, 1, "#3a8a4a");
  px(5, 2, 1, 2, "#3a8a4a");
  px(1, 1, 1, 1, "#ffa0b4");
  px(4, 0, 1, 1, "#fff0a0");
  px(0, 4, 7, 1, "#f4f0e6");
  px(1, 5, 5, 1, "#f4f0e6");
  px(2, 6, 3, 2, "#e0d8c8");
  px(5, 5, 1, 1, "#d0c8b8");
  px(3, 8, 1, 1, "#d0c8b8");
}

function drawFishHanging(px: Px) {
  // held up by the tail: tail fin on top, body hanging, head down
  const o = "#ff8a3a",
    lt = "#ffb07a",
    dk = "#d0602a";
  px(0, 0, 1, 1, dk);
  px(3, 0, 1, 1, dk);
  px(1, 1, 2, 1, dk);
  px(1, 2, 2, 1, o);
  px(0, 3, 4, 5, o);
  px(0, 3, 1, 5, lt);
  px(3, 3, 1, 5, dk);
  px(1, 8, 2, 1, o);
  px(1, 6, 1, 1, "#1a1820");
  px(2, 9, 1, 1, dk);
}

function drawBag(px: Px) {
  // a paper shopping bag: rope handles up to the fist, folded top, the gold shield logo
  const h = "#2a2830";
  px(2, 0, 3, 1, h);
  px(1, 1, 1, 2, h);
  px(5, 1, 1, 2, h);
  px(0, 3, 7, 6, "#f4f0e8");
  px(0, 3, 7, 1, "#ffffff");
  px(6, 3, 1, 6, "#d0c8b8");
  px(0, 8, 7, 1, "#c0b8a8");
  px(1, 3, 1, 1, h);
  px(5, 3, 1, 1, h);
  px(2, 5, 3, 2, "#f4b728");
  px(3, 6, 1, 1, "#a8700e");
}

function drawBasket(px: Px) {
  const w = "#b0804c",
    d = "#8a5e34";
  // the handle arch, oranges peeking out, the woven body
  px(2, 0, 5, 1, d);
  px(1, 1, 1, 2, d);
  px(7, 1, 1, 2, d);
  px(2, 2, 2, 1, "#ff8a2a");
  px(4, 2, 2, 1, "#ffa040");
  px(0, 3, 9, 4, w);
  px(0, 3, 9, 1, "#c89660");
  for (let x = 0; x < 9; x += 2) px(x, 4, 1, 1, d);
  for (let x = 1; x < 9; x += 2) px(x, 5, 1, 1, d);
  px(0, 6, 9, 1, d);
}

function drawOpenBook(px: Px) {
  // held open, cover to us: two boards and the spine, the page edges on top
  px(0, 0, 10, 1, "#f0ece0");
  px(0, 1, 10, 5, "#2e5ab8");
  px(0, 1, 10, 1, "#4a7ad0");
  px(4, 0, 2, 6, "#1e3e88");
  px(1, 3, 2, 1, "#f4b728");
  px(9, 1, 1, 5, "#22488e");
  px(0, 5, 10, 1, "#1e3e88");
}

/** The umbrella seen from the side, canopy only: 27 cells wide, ferrule centred at column 13. */
function drawCanopy(px: Px, color: string) {
  const dk = shade(color, 0.72),
    hi = shade(color, 1.2);
  px(13, 0, 1, 2, "#2a2830");
  const rows: [number, number][] = [
    [8, 11],
    [4, 19],
    [2, 23],
    [1, 25],
    [0, 27],
  ];
  rows.forEach(([x, w], i) => px(x, 2 + i, w, 1, color));
  // panels: every other one a shade darker, ribs to the tips
  for (const [x0, x1] of [
    [0, 5],
    [13, 18],
  ])
    for (let y = 3; y < 7; y++) for (let x = x0; x < x1; x++) if (x >= rows[y - 2][0] && x < rows[y - 2][0] + rows[y - 2][1]) px(x, y, 1, 1, dk);
  for (const [x0, x1] of [
    [22, 27],
  ])
    for (let y = 3; y < 7; y++) for (let x = x0; x < x1; x++) if (x >= rows[y - 2][0] && x < rows[y - 2][0] + rows[y - 2][1]) px(x, y, 1, 1, dk);
  px(9, 2, 4, 1, hi);
  px(6, 3, 3, 1, hi);
  // the scalloped hem: rib tips
  for (const x of [0, 5, 9, 13, 17, 21, 26]) px(x, 7, 1, 1, shade(color, 0.5));
}

const poseCache = new Map<string, { front: ReturnType<typeof sprite>; back: ReturnType<typeof sprite> }>();

/** Quantise a colour to 5 bits a channel (the cache key; the eye can't tell). */
function q5(hex: string) {
  const c = new THREE.Color(hex);
  const f = (v: number) => Math.min(255, Math.round((v * 255) / 8) * 8);
  return `#${[c.r, c.g, c.b].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Very dark cloth gets a touch of grey, or the arm vanishes against the bust and the night. */
function liftDark(hex: string, k = 0.35) {
  const c = new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return l < 0.035 ? `#${c.lerp(new THREE.Color("#4a4858"), k).getHexString()}` : hex;
}

/** The two layers of a pose (see POSE): cached by colours, items and frame. */
export function poseSprites(spec: PoseSpec) {
  const sleeve = q5(liftDark(spec.sleeve)),
    skin = q5(liftDark(spec.skin, 0.5));
  const key = `${sleeve}|${skin}|${spec.items.join("+")}|${spec.umbrella ?? ""}|${spec.swing}|${spec.strap ? 1 : 0}`;
  let s = poseCache.get(key);
  if (s) return touch(poseCache, key, s);
  const F = new Cells(),
    B = new Cells();
  paintPose(F, B, { ...spec, sleeve, skin });
  s = { front: sprite(POSE.w, POSE.h, (px) => F.draw(px)), back: sprite(POSE.w, POSE.h, (px) => B.draw(px)) };
  poseCache.set(key, s);
  boundCache(poseCache, 800, (x) => (x.front.texture.dispose(), x.back.texture.dispose()));
  return s;
}

/** Near shoulder, far shoulder (portrait cells). */
const SH_F: [number, number] = [21, 20],
  SH_B: [number, number] = [6, 20];

function paintPose(F: Cells, B: Cells, p: PoseSpec) {
  const { sleeve, skin, swing } = p;
  const main = p.items[0] ?? null;
  // a cup, a phone, flowers… stay in the near hand at the chest: the umbrella goes to the far one
  const farUmbrella = !!p.umbrella && !p.strap && !!main && RAISED.has(main);
  const umbrella = farUmbrella ? null : p.umbrella;
  // the near hand goes to the umbrella (or the strap); a one-hand item then moves to the far hand
  const nearBusy = !!umbrella || p.strap;
  let farItem: ItemKind | null = null;
  let nearItem: ItemKind | null = main;
  if (nearBusy && main && ONE_HAND.has(main)) {
    farItem = main;
    nearItem = null;
  }
  if (nearBusy && main === "book") {
    farItem = "book";
    nearItem = null;
  }
  const twoHands = !!nearItem && !ONE_HAND.has(nearItem);

  // ---- the far arm (behind the bust) ----
  if (farUmbrella) {
    // raised, gripping the shaft by the far cheek; canopy over the head
    drawCanopy(B.at(-6, -5), p.umbrella!);
    for (let r = 3; r <= 19; r++) B.set(7, r, r < 6 ? "#2a2830" : "#3a3440");
    B.set(7, 20, "#5a3a24");
    B.set(8, 21, "#5a3a24");
    arm(B, [SH_B, [4, 20], [5, 18]], sleeve);
    fist(B, 6, 16, skin);
  } else if (twoHands) {
    // reaching forward under the item: hidden by the bust, its fist drawn with the item below
    arm(B, [SH_B, [8, 23]], sleeve);
  } else if (farItem) {
    // hanging at the side with the item
    arm(B, [SH_B, [5, 23]], sleeve);
    farHeld(B, farItem, skin);
  } else {
    const sw = -swing;
    const hand: [number, number] = sw > 0 ? [9, 24] : sw < 0 ? [3, 23] : [5, 24];
    arm(B, [SH_B, [hand[0] + 1, hand[1] - 1]], sleeve);
    fist(B, hand[0], hand[1], skin);
  }

  // ---- the near arm and what it grips (over the bust) ----
  if (umbrella) {
    if (twoHands) {
      // carrying a box too: the umbrella's shaft rests against the box, gripped by the same fist
      holdTwo(F, B, p.items, nearItem!, sleeve, skin, () => {
        drawCanopy(F.at(9, -5), umbrella);
        for (let r = 3; r <= 27; r++) F.set(22, r, "#2a2830");
      });
      return;
    }
    // shaft gripped at shoulder height, the canopy over the head
    drawCanopy(F.at(9, -5), umbrella);
    for (let r = 3; r <= 19; r++) F.set(22, r, r < 6 ? "#2a2830" : "#3a3440");
    F.set(22, 20, "#5a3a24");
    F.set(21, 21, "#5a3a24");
    F.set(20, 20, "#5a3a24");
    arm(F, [SH_F, [24, 21], [23, 18]], sleeve);
    fist(F, 21, 16, skin);
    return;
  }
  if (p.strap) {
    // standing in the bus: the near arm up to the strap overhead
    arm(F, [SH_F, [23, 12], [23, 3]], sleeve);
    F.rect(22, -3, 3, 1, "#e8e4dc");
    F.set(22, -2, "#e8e4dc");
    F.set(24, -2, "#e8e4dc");
    fist(F, 22, 0, skin);
    return;
  }
  if (!nearItem) {
    const hand: [number, number] = swing > 0 ? [24, 24] : swing < 0 ? [19, 25] : [21, 25];
    arm(F, [SH_F, [hand[0] + 1, hand[1] - 1]], sleeve);
    fist(F, hand[0], hand[1], skin);
    return;
  }
  if (twoHands) {
    holdTwo(F, B, p.items, nearItem, sleeve, skin);
    return;
  }
  switch (nearItem) {
    case "briefcase":
    case "goldcase":
      // hanging from the fist by its handle, clear of the ground
      arm(F, [SH_F, [22, 21]], sleeve);
      drawCase(F.at(17, 23), nearItem === "goldcase");
      fist(F, 21, 22, skin);
      break;
    case "bag":
      // the elbow bent a little: the bag swings by its handles from the fist
      arm(F, [SH_F, [23, 22], [23, 21]], sleeve);
      drawBag(F.at(20, 21));
      fist(F, 22, 20, skin);
      break;
    case "basket":
      arm(F, [SH_F, [23, 22], [23, 21]], sleeve);
      drawBasket(F.at(19, 20));
      fist(F, 22, 20, skin);
      break;
    case "coffee":
      // elbow down, forearm up: the cup at chest height
      drawCup(F.at(23, 15));
      arm(F, [SH_F, [23, 24], [24, 22]], sleeve);
      fist(F, 23, 20, skin);
      break;
    case "can":
      drawCan(F.at(23, 17));
      arm(F, [SH_F, [23, 24], [24, 22]], sleeve);
      fist(F, 23, 20, skin);
      break;
    case "flowers":
      drawBouquet(F.at(21, 13));
      arm(F, [SH_F, [23, 24], [24, 22]], sleeve);
      fist(F, 22, 20, skin);
      break;
    case "phone":
      // raised to the face, by the cheek
      arm(F, [SH_F, [24, 23], [25, 18]], sleeve);
      drawPhone(F.at(22, 11));
      fist(F, 22, 15, skin);
      break;
    case "fish":
      // held up by the tail
      arm(F, [SH_F, [24, 22], [24, 19]], sleeve);
      drawFishHanging(F.at(23, 19));
      fist(F, 23, 17, skin);
      break;
  }
}

/** Items held in both hands: boxes against the belly, the rod upright, the book open. */
function holdTwo(F: Cells, B: Cells, items: ItemKind[], main: ItemKind, sleeve: string, skin: string, extra?: () => void) {
  if (main === "rod") {
    // upright on the near side, the butt at the hip, tip high over the head
    const pts = line([21, 28], [24, 1]);
    pts.forEach(([x, y], i) => F.set(x, y, i < 9 ? "#3a2a1a" : i < 12 ? "#2a2830" : "#8a6a4a"));
    F.rect(18, 22, 2, 2, "#c0c0c8");
    F.set(18, 22, "#ffffff");
    F.set(20, 23, "#5a5a64");
    F.set(24, 0, "#e0e0e8");
    arm(F, [SH_F, [24, 21], [23, 19]], sleeve);
    fist(F, 21, 18, skin);
    fist(F, 20, 24, skin);
    return;
  }
  if (main === "book") {
    drawOpenBook(F.at(12, 19));
    arm(F, [SH_F, [22, 22]], sleeve);
    fist(F, 20, 22, skin);
    fist(F, 10, 22, skin);
    return;
  }
  // a parcel against the belly (a second one stacked behind it, peeking over the far shoulder)
  if (items[1]) drawItem(B.at(3, 13), items[1]);
  drawItem(F.at(10, 19), main);
  extra?.();
  arm(F, [SH_F, [22, 23]], sleeve);
  fist(F, 20, 24, skin);
  fist(F, 9, 24, skin);
}

/** A one-hand item carried low in the far hand (the near one holds the umbrella). */
function farHeld(B: Cells, item: ItemKind, skin: string) {
  switch (item) {
    case "bag":
      drawBag(B.at(1, 22));
      break;
    case "basket":
      drawBasket(B.at(0, 22));
      break;
    case "briefcase":
    case "goldcase":
      drawCase(B.at(-1, 22), item === "goldcase");
      break;
    case "fish":
      drawFishHanging(B.at(3, 25));
      break;
    case "coffee":
      drawCup(B.at(2, 20));
      break;
    case "can":
      drawCan(B.at(3, 23));
      break;
    case "phone":
      drawPhone(B.at(3, 23));
      break;
    case "flowers":
      drawBouquet(B.at(0, 19));
      break;
    case "book":
      B.at(2, 22)(0, 0, 3, 7, "#2e5ab8");
      B.at(2, 22)(0, 0, 1, 7, "#4a7ad0");
      break;
  }
  fist(B, 3, 23, skin);
}
