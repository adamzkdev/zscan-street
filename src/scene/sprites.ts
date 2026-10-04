import * as THREE from "three";
import type { TxKind } from "../data/types";

/**
 * Pixel-art pieces drawn at the zkSNARKs' own pixel size (their portraits are 26×26 cells), so
 * legs, hands and what they carry read as part of the same drawing.
 */
export const GRID = 26;

export type ItemKind = TxKind | "briefcase" | "goldcase";

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

function sprite(w: number, h: number, draw: (px: Px) => void) {
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
