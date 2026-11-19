/**
 * What A and B do in each mini-game, as a verb and a pictogram: a touch screen's buttons show the
 * action ("JUMP", "SHOVE") instead of a letter, and the rules card names it beside the key.
 *
 * One list for all the games (by their key), so a button always says what it does without each game
 * having to. A game not listed, or a button without an action, keeps its letter.
 */
import { T } from "../i18n/lang";

export type Act = "jump" | "shove" | "dash" | "dive" | "grab" | "fire" | "item" | "drift" | "drop" | "ram" | "throw" | "bolt" | "reorg" | "hash";

/** Each action: its word, and its pictogram as a path in a 24 × 24 box (drawn as a round 2.4 line; `fill`: filled instead). */
export const ACT: Record<Act, { en: string; zh: string; d: string; fill?: boolean }> = {
  jump: { en: "JUMP", zh: "跳", d: "M12 15V4M7 9l5-5 5 5M6 20h12" },
  shove: { en: "SHOVE", zh: "推", d: "M3 12h10M9 7l5 5-5 5M19 5v14" },
  dash: { en: "DASH", zh: "冲刺", d: "M3 7h6M3 12h4M3 17h6M11 12h9M16 7l5 5-5 5" },
  dive: { en: "DIVE", zh: "飞扑", d: "M6 5l11 11M17 9v7h-7M4 20h16" },
  grab: { en: "GRAB", zh: "抓", d: "M5 13v6h14v-6M12 15V4M8 8l4-4 4 4" },
  fire: { en: "FIRE", zh: "开火", d: "M12 3v4M12 17v4M3 12h4M17 12h4M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0" },
  item: { en: "ITEM", zh: "道具", d: "M12 3l2.6 6 6.4.6-4.8 4.2 1.5 6.2-5.7-3.3L6.3 20l1.5-6.2L3 9.6 9.4 9z", fill: true },
  drift: { en: "DRIFT", zh: "漂移", d: "M5 19C5 10 10 6 19 6M14 2.5L19 6l-5 3.5" },
  drop: { en: "DROP", zh: "放下", d: "M12 3v11M7 10l5 5 5-5M5 20h14" },
  ram: { en: "RAM", zh: "冲撞", d: "M4 6l6 6-6 6M12 6l6 6-6 6" },
  throw: { en: "THROW", zh: "扔", d: "M4 18C6 6 15 4 19 11M17 13a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0" },
  bolt: { en: "BOLT", zh: "蓄力", d: "M13 2L5 13h6l-1 9 9-12h-6z", fill: true },
  reorg: { en: "REORG", zh: "重组", d: "M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" },
  hash: { en: "HASH", zh: "哈希", d: "M9 3L7 21M17 3l-2 18M4 9h17M3 15h17" },
};

/** A and B, game by game. */
const ACTS: Record<string, { a?: Act; b?: Act }> = {
  kart: { a: "drift", b: "item" },
  bumper: { a: "ram" },
  tiles: { a: "jump", b: "shove" },
  coins: { a: "dive" },
  laser: { a: "jump", b: "shove" },
  bomb: { a: "dash" },
  planet: { a: "dash" },
  dig: { a: "throw" },
  turf: { a: "throw", b: "shove" },
  roll: { a: "jump", b: "shove" },
  sign: { b: "shove" },
  mempool: { a: "grab", b: "shove" },
  lattice: { a: "jump", b: "shove" },
  stack: { a: "drop", b: "reorg" },
  gallery: { a: "fire", b: "bolt" },
  beat: { a: "hash" },
  run: { a: "jump", b: "shove" },
  qball: { a: "jump", b: "dive" },
  forge: { a: "jump", b: "shove" },
};

/** What a game's A and B do (none: the letter stays). A level's own card key ("coins-astana") is its game's. */
export const actsOf = (key: string): { a?: Act; b?: Act } => ACTS[key] ?? ACTS[key.split("-")[0]] ?? {};

/** An action's word, in the visitor's language. */
export const actWord = (a: Act) => T(ACT[a].en, ACT[a].zh);

/** An action's pictogram for a button on the page. */
export const actSvg = (a: Act) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ACT[a].d}"${ACT[a].fill ? ' class="f"' : ""}/></svg>`;

const paths = new Map<Act, Path2D>();
/** An action's pictogram on a canvas, `size` across, centred on (x, y). */
export function actIcon(g: CanvasRenderingContext2D, a: Act, x: number, y: number, size: number, color = "#fff") {
  let p = paths.get(a);
  if (!p) paths.set(a, (p = new Path2D(ACT[a].d)));
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.lineCap = "round";
  g.lineJoin = "round";
  if (ACT[a].fill) {
    g.fillStyle = color;
    g.fill(p);
  } else {
    g.lineWidth = 2.6;
    g.strokeStyle = color;
    g.stroke(p);
  }
  g.restore();
}
