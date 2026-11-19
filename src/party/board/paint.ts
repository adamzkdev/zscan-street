/**
 * The board's HUD, drawn on the 960×540 canvas over the 3D: the four players' panels (portrait,
 * place, Z-Blocks, coins, items), the turn badge, the icons (coins, Z-Blocks, the seven items),
 * the host ZEE's dialog box (and THE TRACKER's, when he cuts in), the roulette strips, the menus' cards
 * and their buttons, the bubbles over heads.
 */
import { T } from "../../i18n/lang";
import { FONT, H, HUD, W, between, fpx, isLocal, padAir, rr, text, zoom, zoomBox, type Player } from "../kit";
import { INK, badge, crown, numeral, tint, toy } from "../hud";
import { short, zGlyph } from "../k3";
import { drawMark } from "../theme";
import type { ItemKey } from "./core";

// ---- words ---------------------------------------------------------------------------------------

export const ITEM_TXT: Record<ItemKey, { n: [string, string]; d: [string, string]; c: string }> = {
  double: { n: ["DOUBLE HASH", "双重哈希"], d: ["Hit two dice blocks", "击打两个骰子方块"], c: "#3ec6ff" },
  triple: { n: ["TRIPLE HASH", "三重哈希"], d: ["Hit three dice blocks", "击打三个骰子方块"], c: "#ff5fa2" },
  nonce: { n: ["CUSTOM NONCE", "自选随机数"], d: ["Pick your roll, 1 to 10", "自己选点数，1 到 10"], c: "#8ee35b" },
  wormhole: { n: ["WORMHOLE", "虫洞"], d: ["Warp right before the Z-Block", "传送到 Z 方块前一格"], c: "#b48cff" },
  reorg: { n: ["REORG", "链重组"], d: ["Swap places with a rival", "与一名对手交换位置"], c: "#ff6b35" },
  sniper: { n: ["FEE SNIPER", "手续费狙击"], d: ["Steal 10 coins from a rival", "从一名对手偷 10 金币"], c: "#ff3d56" },
  lock: { n: ["FINALITY LOCK", "最终性锁"], d: ["Lock this space: the next rival here pays you 8", "锁住此格：下一个经过的对手付你 8"], c: "#7fd8ff" },
};
export const itemName = (k: ItemKey) => T(...ITEM_TXT[k].n);
export const itemDesc = (k: ItemKey) => T(...ITEM_TXT[k].d);

// ---- icons ---------------------------------------------------------------------------------------

/** A board coin: a yellow token with a white rim and a hex stamped in it (never a ⓩ chip). */
export function coinIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.save();
  g.beginPath();
  g.arc(x, y + r * 0.18, r, 0, Math.PI * 2);
  g.fillStyle = "#b36b00";
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  const gr = g.createLinearGradient(0, y - r, 0, y + r);
  gr.addColorStop(0, "#fff19a");
  gr.addColorStop(1, "#ffb81f");
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = Math.max(1.2, r * 0.16);
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    g.lineTo(x + Math.cos(a) * r * 0.48, y + Math.sin(a) * r * 0.48);
  }
  g.closePath();
  g.fillStyle = "#e08a00";
  g.fill();
  g.restore();
}

/** A Z-Block: the golden block with its Z. */
export function qIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  rr(g, -s / 2, -s / 2 + s * 0.1, s, s, s * 0.18);
  g.fillStyle = "#9a6200";
  g.fill();
  rr(g, -s / 2, -s / 2, s, s, s * 0.18);
  const gr = g.createLinearGradient(0, -s / 2, 0, s / 2);
  gr.addColorStop(0, "#ffe789");
  gr.addColorStop(1, "#ffbf1f");
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = Math.max(1.5, s * 0.08);
  g.strokeStyle = INK;
  g.stroke();
  zGlyph(g, s * 0.03, s * 0.07, s * 0.66, "#9a6200");
  zGlyph(g, 0, 0, s * 0.66, "#fff8d8");
  g.restore();
}

/** A die face (the hash items): white, rounded, with pips. */
function die(g: CanvasRenderingContext2D, x: number, y: number, s: number, n: number, c: string) {
  rr(g, x - s / 2, y - s / 2, s, s, s * 0.22);
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = Math.max(1.2, s * 0.1);
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = c;
  const pips: [number, number][] =
    n === 1
      ? [[0, 0]]
      : n === 2
        ? [
            [-1, -1],
            [1, 1],
          ]
        : [
            [-1, -1],
            [0, 0],
            [1, 1],
          ];
  for (const [px, py] of pips) {
    g.beginPath();
    g.arc(x + px * s * 0.24, y + py * s * 0.24, s * 0.1, 0, Math.PI * 2);
    g.fill();
  }
}

/** An item's picture, `s` px. */
export function itemIcon(g: CanvasRenderingContext2D, k: ItemKey, x: number, y: number, s: number) {
  const c = ITEM_TXT[k].c;
  g.save();
  // the round tile behind it
  g.beginPath();
  g.arc(x, y + s * 0.06, s * 0.5, 0, Math.PI * 2);
  g.fillStyle = tint(c, -0.55);
  g.fill();
  g.beginPath();
  g.arc(x, y, s * 0.5, 0, Math.PI * 2);
  const gr = g.createLinearGradient(0, y - s / 2, 0, y + s / 2);
  gr.addColorStop(0, tint(c, 0.3));
  gr.addColorStop(1, tint(c, -0.15));
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = Math.max(1.5, s * 0.06);
  g.strokeStyle = INK;
  g.stroke();
  const u = s / 2;
  g.lineJoin = "round";
  g.lineCap = "round";
  if (k === "double") (die(g, x - u * 0.28, y - u * 0.12, u * 0.72, 2, c), die(g, x + u * 0.3, y + u * 0.2, u * 0.72, 1, c));
  else if (k === "triple") (die(g, x - u * 0.4, y + u * 0.22, u * 0.6, 1, c), die(g, x + u * 0.4, y + u * 0.22, u * 0.6, 2, c), die(g, x, y - u * 0.3, u * 0.6, 3, c));
  else if (k === "nonce") {
    rr(g, x - u * 0.45, y - u * 0.45, u * 0.9, u * 0.9, u * 0.2);
    g.fillStyle = "#ffffff";
    g.fill();
    g.lineWidth = Math.max(1.2, u * 0.1);
    g.strokeStyle = INK;
    g.stroke();
    g.font = `900 ${u * 0.75}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = tint(c, -0.35);
    g.fillText("#", x, y + u * 0.04);
  } else if (k === "wormhole") {
    for (let r = 0; r < 4; r++) {
      g.beginPath();
      g.ellipse(x, y, u * (0.7 - r * 0.15), u * (0.42 - r * 0.09), r * 0.4, 0, Math.PI * 2);
      g.lineWidth = Math.max(1.5, u * 0.12);
      g.strokeStyle = r % 2 ? "#ffffff" : "#1a1033";
      g.stroke();
    }
  } else if (k === "reorg") {
    g.lineWidth = Math.max(2, u * 0.16);
    g.strokeStyle = "#ffffff";
    for (const sgn of [1, -1]) {
      g.beginPath();
      g.arc(x, y, u * 0.48, sgn > 0 ? Math.PI * 1.1 : Math.PI * 0.1, sgn > 0 ? Math.PI * 1.85 : Math.PI * 0.85);
      g.stroke();
      const a = sgn > 0 ? Math.PI * 1.85 : Math.PI * 0.85;
      const ex = x + Math.cos(a) * u * 0.48,
        ey = y + Math.sin(a) * u * 0.48;
      g.beginPath();
      g.moveTo(ex - u * 0.22 * sgn, ey - u * 0.02);
      g.lineTo(ex + u * 0.04 * sgn, ey + u * 0.22 * sgn);
      g.lineTo(ex + u * 0.18 * sgn, ey - u * 0.14 * sgn);
      g.closePath();
      g.fillStyle = "#ffffff";
      g.fill();
    }
  } else if (k === "sniper") {
    coinIcon(g, x, y, u * 0.38);
    g.lineWidth = Math.max(1.5, u * 0.1);
    g.strokeStyle = "#ffffff";
    g.beginPath();
    g.arc(x, y, u * 0.62, 0, Math.PI * 2);
    g.stroke();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      g.beginPath();
      g.moveTo(x + dx * u * 0.48, y + dy * u * 0.48);
      g.lineTo(x + dx * u * 0.8, y + dy * u * 0.8);
      g.stroke();
    }
  } else {
    // the lock
    g.lineWidth = Math.max(2, u * 0.16);
    g.strokeStyle = "#ffffff";
    g.beginPath();
    g.arc(x, y - u * 0.12, u * 0.3, Math.PI, 0);
    g.stroke();
    rr(g, x - u * 0.45, y - u * 0.12, u * 0.9, u * 0.66, u * 0.14);
    g.fillStyle = "#ffffff";
    g.fill();
    g.fillStyle = INK;
    g.fillRect(x - u * 0.06, y + u * 0.04, u * 0.12, u * 0.26);
  }
  g.restore();
}

// ---- panels --------------------------------------------------------------------------------------

export const PW = 214;
export const PH = 72;
export function panelSpot(seat: number): [number, number] {
  // (a touch screen: the bottom corners are under the thumbs, so the bottom two stack under the top two)
  if (HUD.thumbs) return [seat % 2 ? W - 14 - PW : 14, 12 + (seat < 2 ? 0 : PH + 8)];
  return [
    [14, 12],
    [W - 14 - PW, 12],
    [14, H - 12 - PH],
    [W - 14 - PW, H - 12 - PH],
  ][seat] as [number, number];
}

const RANK_C = ["#ffd23f", "#d6dde8", "#e39a5f", "#8d88a8"];

/** One player's panel: portrait, place, Z-Blocks, coins, items. */
export function panel(g: CanvasRenderingContext2D, p: Player, seat: number, o: { place: number; blocks: number; coins: number; items: ItemKey[]; active: boolean; t: number; flash?: number }) {
  const [x, y] = panelSpot(seat);
  g.save();
  rr(g, x, y + 4, PW, PH, 18);
  g.fillStyle = "rgba(6,3,18,0.4)";
  g.fill();
  rr(g, x, y, PW, PH, 18);
  const body = g.createLinearGradient(0, y, 0, y + PH);
  body.addColorStop(0, o.active ? tint(p.color, -0.35) : "rgba(38,28,86,0.92)");
  body.addColorStop(1, o.active ? tint(p.color, -0.62) : "rgba(15,10,38,0.94)");
  g.fillStyle = body;
  g.fill();
  const wash = g.createLinearGradient(x, 0, x + 160, 0);
  wash.addColorStop(0, p.color);
  wash.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = 0.28;
  g.fillStyle = wash;
  g.fill();
  g.globalAlpha = 1;
  rr(g, x, y, PW, PH, 18);
  g.lineWidth = o.active ? 3.5 : isLocal(p) ? 2.5 : 2;
  g.strokeStyle = o.active ? "#ffffff" : tint(p.color, 0.05);
  g.stroke();
  if (o.active) {
    g.globalAlpha = 0.35 + Math.sin(o.t * 6) * 0.25;
    rr(g, x - 4, y - 4, PW + 8, PH + 8, 22);
    g.lineWidth = 3;
    g.strokeStyle = p.color;
    g.stroke();
    g.globalAlpha = 1;
  }
  if (o.flash && o.flash > 0) {
    g.globalAlpha = Math.min(1, o.flash) * 0.5;
    rr(g, x, y, PW, PH, 18);
    g.fillStyle = "#ffffff";
    g.fill();
    g.globalAlpha = 1;
  }
  badge(g, p, x + 34, y + 36, 50);
  if (o.place === 0 && o.blocks > 0) crown(g, x + 34, y + 9, 24, Math.sin(o.t * 5 + seat) * 1.5);
  // the place, a chip on the badge (wider when its letters are grown for a small screen)
  g.font = `900 ${fpx(11)}px ${FONT}`;
  const cw = HUD.min ? Math.max(30, g.measureText("4th").width + 10) : 30;
  rr(g, x + 46, y + 46, cw, 20, 10);
  g.fillStyle = RANK_C[o.place];
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.stroke();
  text(g, ["1st", "2nd", "3rd", "4th"][o.place], x + 46 + cw / 2, y + 56.5, 11, INK, "center", 900);
  const nm = short(p);
  text(g, nm.length > 12 ? nm.slice(0, 11) + "…" : nm, x + 68, y + 17, 12.5, tint(p.color, 0.45), "left", 900);
  qIcon(g, x + 80, y + 37, 19);
  numeral(g, String(o.blocks), x + 94, y + 38, 22, "#ffffff", "left");
  coinIcon(g, x + 140, y + 37, 9.5);
  numeral(g, String(o.coins), x + 152, y + 38, 22, "#ffffff", "left");
  // the bag: three slots
  for (let k = 0; k < 3; k++) {
    const ix = x + 138 + k * 24;
    const iy = y + 60;
    const it = o.items[k];
    if (it) itemIcon(g, it, ix, iy, 19);
    else {
      g.beginPath();
      g.arc(ix, iy, 8, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.stroke();
    }
  }
  g.restore();
}

/** TURN 4 / 10, top middle (pink and pulsing in the last five). */
/** The turn badge's growth on a small screen (40 px high on a phone; the buttons beside it keep clear). */
export const badgeK = () => Math.min(HUD.k, 1.25);

export function turnBadge(g: CanvasRenderingContext2D, turn: number, of: number, last5: boolean, t: number) {
  // (a small screen: it grows from the top edge, as the mini-games' clock does)
  if (badgeK() > 1) return zoom(g, W / 2, 12, badgeK(), () => turnBadgeAt(g, turn, of, last5, t));
  turnBadgeAt(g, turn, of, last5, t);
}
function turnBadgeAt(g: CanvasRenderingContext2D, turn: number, of: number, last5: boolean, t: number) {
  const w = 184,
    h = 44,
    x = W / 2 - w / 2,
    y = 12;
  g.save();
  rr(g, x, y + 4, w, h, h / 2);
  g.fillStyle = "rgba(6,3,18,0.4)";
  g.fill();
  rr(g, x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
  g.fillStyle = INK;
  g.fill();
  rr(g, x + 1, y + 1, w - 2, h - 2, h / 2 - 1);
  g.fillStyle = "#ffffff";
  g.fill();
  rr(g, x + 4, y + 4, w - 8, h - 8, h / 2 - 4);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  if (last5) (gr.addColorStop(0, "#ff7ab8"), gr.addColorStop(1, "#c8166e"));
  else (gr.addColorStop(0, "#4a36a8"), gr.addColorStop(1, "#1d1450"));
  g.fillStyle = gr;
  g.fill();
  const k = last5 ? 1 + Math.max(0, Math.sin(t * 5)) * 0.04 : 1;
  g.translate(W / 2, y + h / 2 + 1);
  g.scale(k, k);
  text(g, T("TURN", "回合"), -38, 0, 13, "rgba(255,255,255,0.78)", "center", 900);
  numeral(g, `${Math.min(turn, of)}/${of}`, 30, 0, 24, "#ffffff", "center");
  g.restore();
}

/** A pill button (A, B, M or an arrow) with its words: its box for the pointer. */
export function pill(g: CanvasRenderingContext2D, key: string, words: string, x: number, y: number, o: { c?: string; on?: boolean; big?: boolean } = {}) {
  const fs = o.big ? 17 : 14;
  g.font = `900 ${fpx(fs)}px ${FONT}`;
  const tw = g.measureText(words).width;
  const kr = o.big ? 15 : 12;
  const w = tw + kr * 2 + 26;
  const h = o.big ? 42 : 34;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  g.save();
  rr(g, x0, y0 + 4, w, h, h / 2);
  g.fillStyle = "rgba(6,3,18,0.45)";
  g.fill();
  rr(g, x0, y0, w, h, h / 2);
  g.fillStyle = o.on === false ? "rgba(40,34,70,0.9)" : "#ffffff";
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = INK;
  g.stroke();
  const kc = o.c ?? (key === "A" ? "#ff6b35" : key === "B" ? "#3ec6ff" : "#8e7cff");
  g.beginPath();
  g.arc(x0 + kr + 6, y, kr, 0, Math.PI * 2);
  g.fillStyle = kc;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.stroke();
  text(g, key, x0 + kr + 6, y + 1, key.length > 1 ? (o.big ? 11 : 9) : o.big ? 15 : 12, "#ffffff", "center", 900);
  text(g, words, x0 + kr * 2 + 14, y + 1, fs, o.on === false ? "rgba(255,255,255,0.45)" : INK, "left", 900);
  g.restore();
  return { x: x0, y: y0, w, h };
}

/** A row of pills centred on y: their boxes. */
export function pills(g: CanvasRenderingContext2D, list: { key: string; words: string; c?: string; on?: boolean }[], y: number, big = false) {
  g.font = `900 ${fpx(big ? 17 : 14)}px ${FONT}`;
  const ws = list.map((p) => g.measureText(p.words).width + (big ? 15 : 12) * 2 + 26);
  const gap = 12;
  const total = ws.reduce((a, b) => a + b, 0) + gap * (list.length - 1);
  // (a small screen: the row grows from its middle, up to 40 px high, as long as it stays between the thumbs)
  const k = HUD.min ? Math.max(1, Math.min(HUD.k, (HUD.free[1] - HUD.free[0] - 2 * padAir()) / total)) : 1;
  const cx = between(W / 2, total * k);
  const row = () => {
    // (measured again inside the growth: the letters keep their size there)
    g.font = `900 ${fpx(big ? 17 : 14)}px ${FONT}`;
    const ws2 = list.map((p) => g.measureText(p.words).width + (big ? 15 : 12) * 2 + 26);
    let x = cx - (ws2.reduce((a, b) => a + b, 0) + gap * (list.length - 1)) / 2;
    return list.map((p, i) => {
      const r = pill(g, p.key, p.words, x + ws2[i] / 2, y, { c: p.c, on: p.on, big });
      x += ws2[i] + gap;
      return r;
    });
  };
  if (k === 1) return row();
  return zoom(g, cx, y, k, row).map((b) => zoomBox(b, cx, y, k));
}

/** The countdown over the walker's head: a round bubble with the steps left. */
export function stepsBubble(g: CanvasRenderingContext2D, x: number, y: number, n: number, color: string, pop: number) {
  const r = 21 * (1 + pop * 0.25);
  g.save();
  g.beginPath();
  g.arc(x, y + 3, r, 0, Math.PI * 2);
  g.fillStyle = "rgba(6,3,18,0.4)";
  g.fill();
  g.beginPath();
  g.arc(x, y, r + 3, 0, Math.PI * 2);
  g.fillStyle = INK;
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.beginPath();
  g.arc(x, y, r - 3.5, 0, Math.PI * 2);
  const gr = g.createLinearGradient(0, y - r, 0, y + r);
  gr.addColorStop(0, tint(color, 0.25));
  gr.addColorStop(1, tint(color, -0.2));
  g.fillStyle = gr;
  g.fill();
  g.beginPath();
  g.moveTo(x - 7, y + r);
  g.lineTo(x, y + r + 9);
  g.lineTo(x + 7, y + r);
  g.fillStyle = INK;
  g.fill();
  numeral(g, String(n), x, y + 1, 26 * (1 + pop * 0.2), "#ffffff", "center");
  g.restore();
}

/** A little speech bubble over a head (an emote: "!", "♪", "#@!"). */
export function emote(g: CanvasRenderingContext2D, x: number, y: number, s: string, c: string, k: number) {
  const sc = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
  if (sc <= 0) return;
  g.save();
  g.translate(x, y);
  g.scale(sc, sc);
  g.font = `900 ${Array.from(s).length > 1 ? fpx(16) : 16}px ${FONT}`;
  const w = Math.max(34, g.measureText(s).width + 18);
  rr(g, -w / 2 - 2, -16, w + 4, 32, 14);
  g.fillStyle = INK;
  g.fill();
  rr(g, -w / 2, -14, w, 28, 12);
  g.fillStyle = "#ffffff";
  g.fill();
  g.beginPath();
  g.moveTo(-5, 13);
  g.lineTo(0, 22);
  g.lineTo(6, 13);
  g.fillStyle = "#ffffff";
  g.fill();
  text(g, s, 0, 1, 16, c, "center", 900);
  g.restore();
}

// ---- the host ------------------------------------------------------------------------------------

/** ZEE, ZStreet's party host: a lilac cube with the ⓩ mark on its chest, a top hat and a microphone (`nota` in the code). */
export function nota(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, talking: boolean) {
  g.save();
  g.translate(x, y + Math.sin(t * 3) * s * 0.04);
  const u = s / 100;
  // a shadow
  g.fillStyle = "rgba(6,3,18,0.3)";
  g.beginPath();
  g.ellipse(0, 52 * u, 30 * u, 7 * u, 0, 0, Math.PI * 2);
  g.fill();
  // the body: a rounded cube
  rr(g, -36 * u, -30 * u, 72 * u, 72 * u, 18 * u);
  g.fillStyle = INK;
  g.fill();
  rr(g, -33 * u, -27 * u, 66 * u, 66 * u, 15 * u);
  const gr = g.createLinearGradient(0, -27 * u, 0, 39 * u);
  gr.addColorStop(0, "#e5dbff");
  gr.addColorStop(1, "#a88cf5");
  g.fillStyle = gr;
  g.fill();
  // the ⓩ mark on its chest
  drawMark(g, 0, 22 * u, 26 * u, "#5a3fb8", "#ff6b35");
  // the eyes, the mouth
  const blink = Math.sin(t * 1.7) > 0.97 ? 0.15 : 1;
  for (const sx of [-13, 13]) {
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(sx * u, -6 * u, 9 * u, 10 * u * blink, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(sx * u + 1.5 * u, -5 * u, 4.5 * u, 6 * u * blink, 0, 0, Math.PI * 2);
    g.fill();
  }
  const mo = talking ? Math.abs(Math.sin(t * 14)) * 5 * u : 0;
  g.fillStyle = INK;
  rr(g, -7 * u, 4 * u, 14 * u, 3 * u + mo, 2 * u);
  g.fill();
  // the host's top hat: a brim, a crown, a gold band
  g.save();
  g.rotate(-0.12);
  g.fillStyle = INK;
  g.fillRect(-26 * u, -36 * u, 52 * u, 7 * u);
  g.fillRect(-15 * u, -60 * u, 30 * u, 26 * u);
  g.fillStyle = "#f4b728";
  g.fillRect(-15 * u, -41 * u, 30 * u, 5 * u);
  g.restore();
  // the microphone in one hand
  g.save();
  g.translate(40 * u, 12 * u + (talking ? Math.sin(t * 7) * 3 * u : 0));
  g.rotate(-0.35);
  g.fillStyle = INK;
  g.fillRect(-3 * u, -6 * u, 6 * u, 20 * u);
  g.beginPath();
  g.arc(0, -11 * u, 7.5 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#c9c2d8";
  g.beginPath();
  g.arc(0, -11 * u, 5.5 * u, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.restore();
}

/** THE TRACKER's face for his dialog box: a dark orb, one red camera eye, an antenna, a grin (`shorFace` in the code). */
export function shorFace(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, laughing: boolean) {
  g.save();
  g.translate(x, y + (laughing ? Math.sin(t * 30) * 1.5 : Math.sin(t * 2) * 2));
  const u = s / 100;
  g.fillStyle = "rgba(160,64,255,0.35)";
  g.beginPath();
  g.arc(0, 0, 50 * u, 0, Math.PI * 2);
  g.fill();
  // the antenna, its red light blinking
  g.fillStyle = "#3a1b66";
  g.fillRect(-2 * u, -50 * u, 4 * u, 22 * u);
  g.fillStyle = Math.sin(t * 6) > 0 ? "#ff2d4a" : "#ff8a4c";
  g.beginPath();
  g.arc(0, -52 * u, 5 * u, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(0, 4 * u, 36 * u, 0, Math.PI * 2);
  g.fillStyle = INK;
  g.fill();
  g.beginPath();
  g.arc(0, 4 * u, 33 * u, 0, Math.PI * 2);
  const gr = g.createRadialGradient(-8 * u, -6 * u, 4 * u, 0, 4 * u, 34 * u);
  gr.addColorStop(0, "#7a44c8");
  gr.addColorStop(1, "#3a1b66");
  g.fillStyle = gr;
  g.fill();
  // the eye
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.ellipse(0, -2 * u, 17 * u, laughing ? 6 * u : 13 * u, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ff2d4a";
  g.beginPath();
  g.arc(2 * u, -2 * u, laughing ? 5 * u : 8 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  g.fillRect(0.5 * u, -8 * u, 3 * u, 12 * u);
  g.lineWidth = 4 * u;
  g.strokeStyle = INK;
  g.beginPath();
  g.moveTo(-19 * u, -18 * u);
  g.lineTo(0, -11 * u);
  g.lineTo(19 * u, -18 * u);
  g.stroke();
  // the grin
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(-18 * u, 16 * u);
  for (let k = 0; k <= 8; k++) g.lineTo((-18 + k * 4.5) * u, (16 + (k % 2 ? 6 : 0) + (laughing ? 3 : 0)) * u);
  g.lineTo(18 * u, 14 * u);
  g.closePath();
  g.fill();
  g.restore();
}

/** The dialog box at the bottom: ZEE (or THE TRACKER) and what they say, typed out. */
export function hostBox(g: CanvasRenderingContext2D, who: "nota" | "shor", s: string, k: number, t: number) {
  const w = 500,
    h = 92;
  // (a touch screen: kept clear of A and B along the bottom)
  const x = between(W / 2, w) - w / 2,
    y = H - h - 14;
  const inK = Math.min(1, k * 5);
  g.save();
  g.globalAlpha = inK;
  g.translate(0, (1 - inK) * 20);
  rr(g, x, y + 5, w, h, 22);
  g.fillStyle = "rgba(6,3,18,0.45)";
  g.fill();
  rr(g, x - 2, y - 2, w + 4, h + 4, 24);
  g.fillStyle = INK;
  g.fill();
  rr(g, x + 1, y + 1, w - 2, h - 2, 21);
  g.fillStyle = who === "shor" ? "#2a1046" : "#ffffff";
  g.fill();
  rr(g, x + 92, y + 10, w - 104, h - 20, 14);
  g.fillStyle = who === "shor" ? "#3a1b66" : "#f1ecff";
  g.fill();
  if (who === "shor") shorFace(g, x + 48, y + h / 2, 74, t, true);
  else nota(g, x + 48, y + h / 2 + 2, 70, t, true);
  // the name tab
  const nm = who === "shor" ? "TRACKER" : "ZEE";
  const tw = who === "shor" ? 86 : 62;
  rr(g, x + 18, y - 13, tw, 22, 11);
  g.fillStyle = who === "shor" ? "#ff3d56" : "#7b5cff";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.stroke();
  text(g, nm, x + 18 + tw / 2, y - 1.5, 12, "#ffffff", "center", 900);
  // the words, typed out
  const n = Math.floor(Array.from(s).length * Math.min(1, k * 2.2));
  const shown = Array.from(s).slice(0, n).join("");
  const fs = fpx(16);
  g.font = `800 ${fs}px ${FONT}`;
  // (wrapped at the size it is drawn, the whole line typed so far: it never jumps a line as it types)
  const lines = wrapText(g, shown, w - 130);
  const lh = fs + 6;
  lines.slice(0, 3).forEach((l, i) => text(g, l, x + 106, y + h / 2 - ((Math.min(3, lines.length) - 1) * lh) / 2 + i * lh, 16, who === "shor" ? "#ffffff" : INK, "left", 800));
  g.restore();
}

export function wrapText(g: CanvasRenderingContext2D, s: string, w: number) {
  const words = /\s/.test(s) ? s.split(/\s+/) : Array.from(s);
  const join = /\s/.test(s) ? " " : "";
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryL = line ? line + join + word : word;
    if (g.measureText(tryL).width > w && line) {
      lines.push(line);
      line = word;
    } else line = tryL;
  }
  if (line) lines.push(line);
  return lines;
}

// ---- cards and roulettes ---------------------------------------------------------------------------

/** A card in the middle: an ink frame, a colour band with its title. */
export function card(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, color: string, k = 1) {
  const s = k < 1 ? 0.85 + 0.15 * k : 1;
  g.save();
  g.globalAlpha = Math.min(1, k * 1.5);
  g.translate(x + w / 2, y + h / 2);
  g.scale(s, s);
  g.translate(-(x + w / 2), -(y + h / 2));
  rr(g, x, y + 6, w, h, 24);
  g.fillStyle = "rgba(6,3,18,0.5)";
  g.fill();
  rr(g, x - 3, y - 3, w + 6, h + 6, 26);
  g.fillStyle = INK;
  g.fill();
  rr(g, x, y, w, h, 23);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, "#2e2370");
  gr.addColorStop(1, "#140d36");
  g.fillStyle = gr;
  g.fill();
  rr(g, x, y, w, 52, 23);
  g.fillStyle = color;
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.2)";
  rr(g, x + 20, y + 4, w - 40, 6, 3);
  g.fill();
  toy(g, title, x + w / 2, y + 27, 27, "#ffffff", { ink: tint(color, -0.6), rim: false });
  g.restore();
}

export interface Tile {
  top: string;
  sub?: string;
  c: string;
  item?: ItemKey;
  coin?: boolean;
  q?: boolean;
}

/**
 * A roulette strip across the lower half (the 3D stays in view above it): tiles in a row, a
 * highlight hopping across them and slowing to land; `pos` the highlight's place now
 * (fractional), `landed` once it stopped.
 */
export function roulette(g: CanvasRenderingContext2D, title: string, tiles: Tile[], pos: number, landed: boolean, t: number, color: string, y = 352) {
  const n = tiles.length;
  const tw = Math.min(124, (W - 300) / n - 10);
  const th = 108;
  const total = n * tw + (n - 1) * 10;
  const x0 = W / 2 - total / 2;
  card(g, x0 - 24, y - 70, total + 48, th + 98, title, color);
  const cur = ((Math.round(pos) % n) + n) % n;
  tiles.forEach((tl, i) => {
    const x = x0 + i * (tw + 10);
    const on = i === cur;
    const lift = on ? (landed ? 6 + Math.sin(t * 8) * 3 : 4) : 0;
    g.save();
    rr(g, x, y + 4, tw, th, 16);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fill();
    rr(g, x, y - lift, tw, th, 16);
    const gr = g.createLinearGradient(0, y - lift, 0, y - lift + th);
    gr.addColorStop(0, tint(tl.c, 0.25));
    gr.addColorStop(1, tint(tl.c, -0.3));
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = on ? 5 : 2.5;
    g.strokeStyle = on ? "#ffffff" : INK;
    g.stroke();
    if (!on && landed) {
      rr(g, x, y - lift, tw, th, 16);
      g.fillStyle = "rgba(10,6,30,0.55)";
      g.fill();
    }
    const cx = x + tw / 2;
    const ic = !!(tl.item || tl.q || tl.coin);
    g.font = `900 ${fpx(14)}px ${FONT}`;
    const lines = wrapText(g, tl.top, tw - 10);
    const iy = y - lift + (tl.sub && lines.length > 1 ? 28 : 34);
    if (tl.item) itemIcon(g, tl.item, cx, iy, 40);
    else if (tl.q) qIcon(g, cx, iy, 34, Math.sin(t * 3) * 0.1);
    else if (tl.coin) coinIcon(g, cx, iy, 16);
    const two = lines.length > 1;
    const ty = ic ? (two && tl.sub ? 62 : 70) : two ? 36 : 44;
    lines.slice(0, 2).forEach((l, k) => text(g, l, cx, y - lift + ty + k * Math.max(15, fpx(14) + 1), 14, "#ffffff", "center", 900));
    if (tl.sub) text(g, tl.sub, cx, y - lift + th - 13, 11, "rgba(255,255,255,0.85)", "center", 800);
    g.restore();
  });
  // the pointer over the highlighted tile
  const px = x0 + cur * (tw + 10) + tw / 2;
  g.save();
  g.translate(px, y - 22 + Math.sin(t * 10) * 2);
  g.beginPath();
  g.moveTo(-12, -10);
  g.lineTo(12, -10);
  g.lineTo(0, 6);
  g.closePath();
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.stroke();
  g.restore();
}

/** A "+3" in coins over a head, floating up. */
export function coinPop(g: CanvasRenderingContext2D, x: number, y: number, n: number, k: number) {
  const s = n > 0 ? `+${n}` : `${n}`;
  const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.3);
  g.save();
  g.globalAlpha = Math.max(0, a);
  g.translate(x, y - k * 46);
  g.scale(sc, sc);
  coinIcon(g, -24, 0, 12);
  toy(g, s, 12, 0, 30, n > 0 ? "#ffe34d" : "#ff5a6a", { rim: false });
  g.restore();
}
