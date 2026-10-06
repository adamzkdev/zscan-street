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

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

const legCache = new Map<string, ReturnType<typeof sprite>>();
/** One stubby leg: trouser, cuff, shoe with a toe and a highlight. */
export function legSprite(trouser: string) {
  let s = legCache.get(trouser);
  if (!s) {
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
  const W = 12,
    H = 10;
  s = sprite(W, H, (px) => {
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
  });
  itemCache.set(kind, s);
  return s;
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

let capCache: ReturnType<typeof sprite> | null = null;
/** A police cap: navy crown, black peak, a gold badge. */
export function policeCapSprite() {
  if (!capCache)
    capCache = sprite(14, 7, (px) => {
      px(2, 0, 10, 1, "#1a2a5a");
      px(1, 1, 12, 3, "#22346e");
      px(1, 1, 12, 1, "#3a4c8e");
      px(6, 1, 2, 2, "#f4b728");
      px(1, 4, 12, 1, "#f0f0f0");
      px(0, 5, 14, 2, "#121218");
    });
  return capCache;
}
