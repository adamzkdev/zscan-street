import * as THREE from "three";
import { T } from "../../i18n/lang";
import { personName } from "../../party/people";
import { loadArt } from "../../scene/snark";
import { glowMat, std } from "../kit";
import type { PickInfo } from "../types";
import { GKit, MONO, PX, ROOM, makeCanvas, mix, onFonts, type HoverFn } from "./kit";
import { card, duelTable, roomChair } from "./props";
import { tableCard } from "../../tables/house";

/**
 * THE ZK LEGENDS ARENA, at the back of the atrium: a stage under a lighting truss with the
 * championship table, the great LED DUEL BOARD on the back wall (a live duel between two zkSNARK
 * heroes, their minions, their health and their ZEC crystals, played out by the house), neon over it,
 * and six duel tables on the floor before the stage where zkSNARKs play, cards on the mats, a card
 * flying now and then. Every table, the stage and the board open ZK LEGENDS (the "legends" table).
 */

export const ARENA = { stage: { x0: -10, x1: 10, z0: -46, z1: -40.6, h: 0.7 }, board: { w: 22, h: 8.6, y: 2.4 } };
/** The duel tables on the floor (centres): two rows of three. */
export const DUELS: [number, number][] = [
  [-7.5, -29],
  [0, -29],
  [7.5, -29],
  [-7.5, -35],
  [0, -35],
  [7.5, -35],
];
const GOLD = "#f4b728";
const LILAC = "#c4b1fc";

// ---- the live duel the house plays (on the board, and on the atrium's jumbotron) ----------------------

interface Minion {
  id: number;
  atk: number;
  hp: number;
  kw: string;
}
interface Side {
  id: number;
  name: string;
  hp: number;
  mana: number;
  hand: number;
  minions: Minion[];
  color: string;
}
const POOL = [4071, 1337, 77, 9001, 2718, 3141, 604, 8128, 4242, 512, 2024, 6969, 7777, 1111, 3333, 9870, 9850, 9713, 9703, 9854, 9846, 5120, 808, 4444];
const KW = ["Guard", "Shielded", "Halo", "Double-spend", "Nullifier", "Mint", "Timelock", ""];
const PAIRS: [string, string][] = [
  [GOLD, LILAC],
  ["#ff6b35", "#6dbf8a"],
  [LILAC, "#ff5c8a"],
  ["#6dbf8a", GOLD],
];

/** The house's duel: a little random play, heroes and minions by zkSNARK id; `t` counts its changes. */
export const duel = {
  a: null as unknown as Side,
  b: null as unknown as Side,
  turn: 1,
  who: 0,
  log: "",
  winner: -1,
  match: 0,
  /** The last hit: which side's minion slot (or -1: the hero) was struck, by whom, how much, when. */
  hit: null as null | { side: number; slot: number; from: number; dmg: number; at: number },
  t: 0,
};
let rs = 7;
const rnd = () => {
  rs = (rs * 16807) % 2147483647;
  return rs / 2147483647;
};
const pick = <V>(l: V[]) => l[Math.floor(rnd() * l.length)];
function newMatch() {
  const [ca, cb] = PAIRS[duel.match % PAIRS.length];
  const ia = pick(POOL);
  let ib = pick(POOL);
  while (ib === ia) ib = pick(POOL);
  const side = (id: number, color: string): Side => ({ id, name: personName(id), hp: 30, mana: 1, hand: 4, minions: [], color });
  duel.a = side(ia, ca);
  duel.b = side(ib, cb);
  duel.turn = 1;
  duel.who = 0;
  duel.winner = -1;
  duel.hit = null;
  duel.log = T("A new duel: shuffled by the latest Zcash block", "新的对决：由最新 Zcash 区块洗牌");
  duel.match++;
  duel.t++;
  for (const s of [duel.a, duel.b]) for (let i = 0; i < 2; i++) s.minions.push(minion());
}
const minion = (): Minion => ({ id: pick(POOL), atk: 1 + Math.floor(rnd() * 6), hp: 1 + Math.floor(rnd() * 7), kw: pick(KW) });
newMatch();
let acted = 0;
let clock = 0;
let next = 2;
/** One move of the house's duel (every couple of seconds). */
function act(now: number) {
  if (duel.winner >= 0) {
    newMatch();
    return;
  }
  const me = duel.who ? duel.b : duel.a;
  const them = duel.who ? duel.a : duel.b;
  const mine = me.name.split(" ")[0].toUpperCase();
  if (me.minions.length < 5 && (rnd() < 0.45 || !me.minions.length)) {
    const m = minion();
    me.minions.push(m);
    me.hand = Math.max(0, me.hand - 1);
    duel.log = m.kw ? T(`${mine} plays a ${m.atk}/${m.hp} · ${m.kw.toUpperCase()}`, `${mine} 打出 ${m.atk}/${m.hp} · ${m.kw}`) : T(`${mine} plays a ${m.atk}/${m.hp}`, `${mine} 打出 ${m.atk}/${m.hp}`);
    duel.hit = null;
  } else {
    const from = Math.floor(rnd() * me.minions.length);
    const a = me.minions[from];
    const face = !them.minions.length || rnd() < 0.35;
    if (face) {
      them.hp = Math.max(0, them.hp - a.atk);
      duel.hit = { side: duel.who ? 0 : 1, slot: -1, from, dmg: a.atk, at: now };
      duel.log = T(`${mine} hits the hero · −${a.atk}`, `${mine} 攻击英雄 · −${a.atk}`);
      if (them.hp <= 0) {
        duel.winner = duel.who;
        duel.log = T(`${mine} WINS THE DUEL`, `${mine} 赢得对决`);
      }
    } else {
      const slot = Math.floor(rnd() * them.minions.length);
      const d = them.minions[slot];
      const shield = d.kw === "Halo";
      if (!shield) d.hp -= a.atk;
      else d.kw = "";
      a.hp -= d.atk;
      duel.hit = { side: duel.who ? 0 : 1, slot, from, dmg: shield ? 0 : a.atk, at: now };
      duel.log = shield ? T(`${mine} attacks · HALO breaks`, `${mine} 攻击 · 光环破碎`) : T(`${mine} attacks · −${a.atk}`, `${mine} 攻击 · −${a.atk}`);
    }
  }
  if (++acted >= 2 + Math.floor(rnd() * 2) && duel.winner < 0) {
    acted = 0;
    // the turn ends: the dead go, the other side draws and gains a crystal
    for (const s of [duel.a, duel.b]) s.minions = s.minions.filter((m) => m.hp > 0);
    duel.who = 1 - duel.who;
    if (duel.who === 0) duel.turn++;
    const nx = duel.who ? duel.b : duel.a;
    nx.mana = Math.min(10, nx.mana + 1);
    nx.hand = Math.min(10, nx.hand + 1);
  }
  duel.t++;
}
/** Run the house's duel (the arena and the atrium both call it; it moves once per frame at most). */
let lastStep = -1;
export function stepDuel(dt: number, frame: number) {
  if (frame === lastStep) return;
  lastStep = frame;
  clock += dt;
  next -= dt;
  if (next <= 0) {
    next = duel.winner >= 0 ? 4.5 : 1.6 + rnd() * 0.8;
    act(clock);
  }
}
export const duelClock = () => clock;

// ---- the portraits (crisp pixel art, from the zkSNARKs' own art) ---------------------------------------

const arts = new Map<number, HTMLCanvasElement | null>();
/** A zkSNARK's 26 × 26 portrait (keyed out), or null while it loads; `then` when it arrives. */
export function portrait(id: number, then?: () => void): HTMLCanvasElement | null {
  if (arts.has(id)) return arts.get(id)!;
  arts.set(id, null);
  void loadArt(id)
    .then((a) => {
      arts.set(id, a.texture.image as HTMLCanvasElement);
      then?.();
    })
    .catch(() => {});
  return null;
}

/** A stepped (voxel) frame round a rectangle: the corners cut in steps of `s`. */
export function stepped(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number) {
  g.beginPath();
  g.moveTo(x + 2 * s, y);
  g.lineTo(x + w - 2 * s, y);
  g.lineTo(x + w - 2 * s, y + s);
  g.lineTo(x + w - s, y + s);
  g.lineTo(x + w - s, y + 2 * s);
  g.lineTo(x + w, y + 2 * s);
  g.lineTo(x + w, y + h - 2 * s);
  g.lineTo(x + w - s, y + h - 2 * s);
  g.lineTo(x + w - s, y + h - s);
  g.lineTo(x + w - 2 * s, y + h - s);
  g.lineTo(x + w - 2 * s, y + h);
  g.lineTo(x + 2 * s, y + h);
  g.lineTo(x + 2 * s, y + h - s);
  g.lineTo(x + s, y + h - s);
  g.lineTo(x + s, y + h - 2 * s);
  g.lineTo(x, y + h - 2 * s);
  g.lineTo(x, y + 2 * s);
  g.lineTo(x + s, y + 2 * s);
  g.lineTo(x + s, y + s);
  g.lineTo(x + 2 * s, y + s);
  g.closePath();
}

let ledMask: HTMLCanvasElement | null = null;
/** The LED grid over a board: dark lines every `p` pixels (drawn once, laid over every redraw). */
export function led(g: CanvasRenderingContext2D, W: number, H: number, p = 4) {
  if (!ledMask || ledMask.width !== W || ledMask.height !== H) {
    ledMask = document.createElement("canvas");
    ledMask.width = W;
    ledMask.height = H;
    const m = ledMask.getContext("2d")!;
    m.fillStyle = "rgba(0,0,0,0.34)";
    for (let x = 0; x < W; x += p) m.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += p) m.fillRect(0, y, W, 1);
  }
  g.drawImage(ledMask, 0, 0);
}

/** A minion card on the boards: its frame, the portrait, attack and health; `lift` raises it (an attack). */
function drawMinion(g: CanvasRenderingContext2D, m: Minion, x: number, y: number, w: number, h: number, color: string, redraw: () => void) {
  const s = Math.round(w / 16);
  stepped(g, x, y, w, h, s);
  g.fillStyle = "#14121c";
  g.fill();
  g.lineWidth = s * 0.8;
  g.strokeStyle = color;
  g.stroke();
  const art = portrait(m.id, redraw);
  const pw = w - s * 3;
  g.fillStyle = mix(color, "#0b0a10", 0.72);
  g.fillRect(x + s * 1.5, y + s * 1.5, pw, pw);
  if (art) {
    g.imageSmoothingEnabled = false;
    g.drawImage(art, x + s * 1.5, y + s * 1.5, pw, pw);
  }
  // keyword band
  if (m.kw) {
    g.fillStyle = mix(color, "#000000", 0.25);
    g.fillRect(x + s * 1.5, y + s * 1.5 + pw - s * 2.6, pw, s * 2.6);
    g.fillStyle = "#0b0a10";
    g.font = PX(s * 2.1);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(m.kw.toUpperCase(), x + w / 2, y + s * 1.5 + pw - s * 1.25);
  }
  if (m.kw === "Halo") {
    g.strokeStyle = GOLD;
    g.lineWidth = s * 0.7;
    g.beginPath();
    g.ellipse(x + w / 2, y + s * 2.4, pw * 0.34, s * 0.9, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // the gems
  const gem = (cx: number, c: string, v: number) => {
    const r = s * 2.4;
    g.fillStyle = c;
    g.fillRect(cx - r, y + h - r * 2 - s * 0.6, r * 2, r * 2);
    g.fillStyle = "#0b0a10";
    g.font = PX(r * 1.5);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(Math.max(0, v)), cx, y + h - r - s * 0.6 + r * 0.06);
  };
  gem(x + s * 3, "#ff9a3c", m.atk);
  gem(x + w - s * 3, m.hp > 0 ? "#ff4d5e" : "#5a5662", m.hp);
}

/**
 * A hero panel, `w` wide: the portrait in its stepped frame, the ZEC crystals in a column on its inner
 * side (`inner`: +1 right, −1 left), under it the name, the health (a pixel heart), the hand's backs.
 */
function drawHero(g: CanvasRenderingContext2D, s: Side, x: number, y: number, w: number, inner: number, turn: boolean, hurt: number, redraw: () => void) {
  const u = w / 20;
  g.save();
  if (hurt > 0) g.translate(Math.sin(hurt * 40) * u * 0.6, 0);
  stepped(g, x, y, w, w, u);
  g.fillStyle = mix(s.color, "#0b0a10", 0.78);
  g.fill();
  g.lineWidth = u * 0.7;
  g.strokeStyle = turn ? s.color : mix(s.color, "#0b0a10", 0.5);
  g.stroke();
  const art = portrait(s.id, redraw);
  if (art) {
    g.imageSmoothingEnabled = false;
    g.drawImage(art, x + u, y + u, w - u * 2, w - u * 2);
  }
  if (hurt > 0) {
    g.fillStyle = `rgba(255,60,60,${0.45 * hurt})`;
    g.fillRect(x + u, y + u, w - u * 2, w - u * 2);
  }
  g.restore();
  // the ZEC crystals: ten diamonds up the inner side, those of this turn lit
  const cx = inner > 0 ? x + w + u * 1.7 : x - u * 1.7;
  for (let i = 0; i < 10; i++) {
    const cy = y + w - u * 1.1 - i * ((w - u * 2.2) / 9);
    g.beginPath();
    g.moveTo(cx, cy - u * 0.9);
    g.lineTo(cx + u * 0.75, cy);
    g.lineTo(cx, cy + u * 0.9);
    g.lineTo(cx - u * 0.75, cy);
    g.closePath();
    g.fillStyle = i < s.mana ? GOLD : "rgba(244,183,40,0.16)";
    g.fill();
  }
  // the name
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = turn ? "#ffffff" : "#bdb6cc";
  g.font = PX(u * 2.3);
  g.fillText(s.name.toUpperCase(), x + w / 2, y + w + u * 2.2);
  // health: a pixel heart and the number
  const P = u * 0.62;
  g.font = PX(u * 3.6);
  const num = String(s.hp);
  const nw = g.measureText(num).width;
  const total = P * 7 + u * 0.9 + nw;
  const hx = x + w / 2 - total / 2;
  const hy = y + w + u * 5.6;
  g.fillStyle = "#ff4d5e";
  for (const [px, py] of [
    [1, 0],
    [2, 0],
    [4, 0],
    [5, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [6, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
    [2, 4],
    [3, 4],
    [4, 4],
    [3, 5],
  ])
    g.fillRect(hx + px * P, hy - P * 3 + py * P, P, P);
  g.textAlign = "left";
  g.fillText(num, hx + P * 7 + u * 0.9, hy + u * 0.1);
  // the hand: card backs
  const n = Math.min(10, s.hand);
  for (let i = 0; i < n; i++) {
    const bx = x + w / 2 + (i - (n - 1) / 2) * u * 1.3;
    g.fillStyle = "#2a2440";
    g.fillRect(bx - u * 0.5, y + w + u * 8.0, u * 1.0, u * 1.5);
    g.fillStyle = s.color;
    g.fillRect(bx - u * 0.2, y + w + u * 8.5, u * 0.4, u * 0.5);
  }
}

/** The great LED board: the live duel, both heroes, both boards, the log; LED grid over it all. */
export function drawDuelBoard(g: CanvasRenderingContext2D, W: number, H: number, height: number, redraw: () => void) {
  const now = duelClock();
  const u = W / 100;
  g.fillStyle = "#07060c";
  g.fillRect(0, 0, W, H);
  // a faint grid behind
  g.fillStyle = "rgba(196,177,252,0.05)";
  for (let x = 0; x < W; x += u * 2) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += u * 2) g.fillRect(0, y, W, 1);
  // the top bar
  g.fillStyle = "#0e0c16";
  g.fillRect(0, 0, W, u * 5.4);
  g.fillStyle = GOLD;
  g.fillRect(0, u * 5.4, W, u * 0.25);
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = PX(u * 3.2);
  g.fillStyle = GOLD;
  g.fillText("ZK LEGENDS", u * 1.6, u * 2.8);
  const tw = g.measureText("ZK LEGENDS").width;
  g.fillStyle = LILAC;
  g.font = PX(u * 2.4);
  g.fillText("零知传奇", u * 2.6 + tw, u * 2.9);
  g.textAlign = "center";
  g.fillStyle = Math.floor(now * 1.5) % 2 ? "#ff4d5e" : "#ff8a8a";
  g.fillText("●", W / 2 - u * 12.5, u * 2.9);
  g.fillStyle = "#e8e6e0";
  g.fillText(T(`LIVE · DUEL ${duel.match} · TURN ${duel.turn}`, `直播 · 第 ${duel.match} 场 · 第 ${duel.turn} 回合`), W / 2 + u * 1, u * 2.9);
  g.textAlign = "right";
  g.fillStyle = "#a8d8e8";
  g.font = MONO(u * 1.9);
  g.fillText(height ? `BLOCK #${height.toLocaleString("en-US")}` : "BLOCK #…", W - u * 1.6, u * 2.9);

  // the heroes (their panels fill the height under the top bar)
  const hw = Math.min(u * 20, H - u * 19.5);
  const hy = u * 7;
  const hurtA = duel.hit && duel.hit.side === 0 && duel.hit.slot < 0 ? Math.max(0, 1 - (now - duel.hit.at) / 0.6) : 0;
  const hurtB = duel.hit && duel.hit.side === 1 && duel.hit.slot < 0 ? Math.max(0, 1 - (now - duel.hit.at) / 0.6) : 0;
  drawHero(g, duel.a, u * 2.5, hy, hw, 1, duel.who === 0, hurtA, redraw);
  drawHero(g, duel.b, W - u * 2.5 - hw, hy, hw, -1, duel.who === 1, hurtB, redraw);
  // the boards: B's minions above, A's below; the log between them
  const mid = u * 5.4 + (H - u * 5.4) / 2;
  const ch = Math.min(u * 11.4, (H - u * 5.4) / 2 - u * 2.8),
    cw = ch * 0.72;
  const rowY = [mid + u * 2.1, mid - u * 2.1 - ch];
  g.fillStyle = "rgba(255,255,255,0.05)";
  g.fillRect(u * 30, mid - u * 1.6, W - u * 60, u * 3.2);
  g.fillStyle = (duel.who ? duel.b : duel.a).color;
  g.fillRect(u * 30, mid - u * 1.6, u * 0.4, u * 3.2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = PX(u * 2.1);
  g.fillStyle = "#ffffff";
  g.fillText(duel.log, W / 2, mid + u * 0.1);
  const sides = [duel.a, duel.b];
  sides.forEach((s, si) => {
    const n = s.minions.length;
    s.minions.forEach((m, i) => {
      let x = W / 2 + (i - (n - 1) / 2) * (cw + u * 1.2) - cw / 2;
      let y = rowY[si];
      const h = duel.hit;
      // the attacker lunges toward the other row
      if (h && h.side !== si && h.from === i && duel.who === si) {
        const k = Math.max(0, 1 - (now - h.at) / 0.5);
        y += (si === 0 ? -1 : 1) * k * u * 3.2;
      }
      // the struck one shakes
      if (h && h.side === si && h.slot === i) {
        const k = Math.max(0, 1 - (now - h.at) / 0.6);
        x += Math.sin(k * 40) * k * u * 0.5;
      }
      drawMinion(g, m, x, y, cw, ch, s.color, redraw);
    });
  });
  // the damage number over whoever was struck
  const h = duel.hit;
  if (h && h.dmg > 0 && now - h.at < 1.1) {
    const k = (now - h.at) / 1.1;
    const s = sides[h.side];
    let x: number, y: number;
    if (h.slot < 0) {
      x = h.side === 0 ? u * 2.5 + hw / 2 : W - u * 2.5 - hw / 2;
      y = hy + hw * 0.5;
    } else {
      const n = s.minions.length;
      x = W / 2 + (h.slot - (n - 1) / 2) * (cw + u * 1.2);
      y = rowY[h.side] + ch * 0.45;
    }
    g.font = PX(u * 5.5);
    g.textAlign = "center";
    g.lineWidth = u * 0.8;
    g.strokeStyle = "#0b0a10";
    g.strokeText(`-${h.dmg}`, x, y - k * u * 3);
    g.fillStyle = "#ff4d5e";
    g.fillText(`-${h.dmg}`, x, y - k * u * 3);
  }
  // a winner: the banner across
  if (duel.winner >= 0) {
    const s = duel.winner ? duel.b : duel.a;
    g.fillStyle = "rgba(7,6,12,0.7)";
    g.fillRect(0, H * 0.36, W, H * 0.28);
    g.fillStyle = s.color;
    g.fillRect(0, H * 0.36, W, u * 0.4);
    g.fillRect(0, H * 0.64 - u * 0.4, W, u * 0.4);
    g.font = PX(u * 6.4);
    g.fillStyle = s.color;
    g.fillText(T("VICTORY", "胜利"), W / 2, H * 0.47);
    g.font = PX(u * 2.6);
    g.fillStyle = "#ffffff";
    g.fillText(s.name.toUpperCase(), W / 2, H * 0.57);
  }
  led(g, W, H, Math.max(3, Math.round(u * 0.32)));
}

// ---- the playmat on the duel tables ---------------------------------------------------------------------

/** A playmat (2 × 1.2 m): each player's half in their colour, seven slots, the hero's ring, the crystal track. */
function playmat(a: string, b: string) {
  const W = 1024,
    H = 614;
  return makeCanvas(W, H, (g) => {
    g.fillStyle = "#0d0b14";
    g.fillRect(0, 0, W, H);
    for (const [y0, col] of [
      [0, b],
      [H / 2, a],
    ] as [number, string][]) {
      g.fillStyle = mix(col, "#0d0b14", 0.86);
      g.fillRect(0, y0, W, H / 2);
      // a fine diagonal hatch
      g.strokeStyle = mix(col, "#0d0b14", 0.75);
      g.lineWidth = 2;
      for (let x = -H; x < W; x += 22) {
        g.beginPath();
        g.moveTo(x, y0);
        g.lineTo(x + H / 2, y0 + H / 2);
        g.stroke();
      }
      const near = y0 > 0;
      // seven slots near the middle line
      const sy = near ? y0 + 26 : y0 + H / 2 - 26 - 104;
      for (let i = 0; i < 7; i++) {
        const sx = W / 2 + (i - 3) * 92 - 36;
        g.strokeStyle = mix(col, "#ffffff", 0.2);
        g.lineWidth = 3;
        stepped(g, sx, sy, 72, 104, 6);
        g.stroke();
      }
      // the hero's ring by the player's edge, the crystal track beside it
      const hy = near ? H - 70 : 70;
      g.strokeStyle = col;
      g.lineWidth = 6;
      g.beginPath();
      g.arc(W / 2, hy, 46, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 10; i++) {
        const cx = W / 2 + 90 + i * 30,
          cy = hy;
        g.fillStyle = i < 6 ? GOLD : "rgba(244,183,40,0.25)";
        g.beginPath();
        g.moveTo(cx, cy - 11);
        g.lineTo(cx + 9, cy);
        g.lineTo(cx, cy + 11);
        g.lineTo(cx - 9, cy);
        g.closePath();
        g.fill();
      }
      // the deck's place
      g.strokeStyle = mix(col, "#ffffff", 0.3);
      stepped(g, W - 140, near ? H - 140 : 36, 76, 104, 6);
      g.stroke();
    }
    // the middle line and the house's name on it
    g.fillStyle = GOLD;
    g.fillRect(0, H / 2 - 2, W, 4);
    g.fillStyle = "#0d0b14";
    g.fillRect(W / 2 - 150, H / 2 - 22, 300, 44);
    g.font = PX(30);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = GOLD;
    g.fillText("ZK LEGENDS", W / 2, H / 2 + 2);
    g.strokeStyle = GOLD;
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
  });
}

/** A duel table's hover line. */
function hover(): HoverFn {
  const c = tableCard("legends");
  return `<b>${c.title}</b><span>${T("2 players · click to sit down and duel", "2 人 · 点击入座对决")}</span>`;
}
const open = (where: string) => (): PickInfo => ({ eyebrow: where, title: tableCard("legends").title, table: "legends" });

/**
 * One duel table at (tx, tz), its long side along z (the two players at ±x): the table, the mat, the
 * cards on it (still: baked), two chairs, and a card that flies from a hand to the board now and then.
 */
export function duelTableAt(k: GKit, tx: number, tz: number, n: number, mats: THREE.Material[], o: { dy?: number; eyebrow?: string } = {}) {
  const dy = o.dy ?? 0;
  k.put("gh-duelTable", duelTable, tx, tz, Math.PI / 2, { dy });
  const y = dy + 0.756;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.06), mats[n % mats.length]);
  mat.rotation.x = -Math.PI / 2;
  // (the mat's "near" half is player A's, at +x)
  mat.rotation.z = Math.PI / 2;
  mat.position.set(tx, y, tz);
  mat.raycast = () => {};
  k.root.add(mat);
  k.keep(mat);
  const cols = [GOLD, LILAC, "#ff6b35", "#6dbf8a", "#a8d8e8", "#ff5c8a"];
  // the cards in play: a few a side in the slots (along z, the mat's width), the hands by each player
  for (const side of [1, -1]) {
    const cnt = 2 + ((n + (side > 0 ? 1 : 2)) % 4);
    for (let i = 0; i < cnt; i++) {
      const c = card(`lg:${cols[(n + i + (side > 0 ? 0 : 3)) % cols.length]}:${(n * 7 + i * 3 + (side > 0 ? 1 : 4)) % 16}`);
      c.position.set(tx + side * 0.19, y + 0.002, tz + (i - (cnt - 1) / 2) * 0.165);
      c.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      k.root.add(c);
      k.keep(c);
    }
    // the hand, fanned on the table's edge before the player
    for (let i = 0; i < 4; i++) {
      const c = card("back");
      c.position.set(tx + side * 0.82, y + 0.002 + i * 0.001, tz + (i - 1.5) * 0.05);
      c.rotation.y = (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (i - 1.5) * 0.18;
      k.root.add(c);
      k.keep(c);
    }
    // the deck
    const dk = k.box(0.09, 0.035, 0.13, k.dark, tx + side * 0.6, y, tz + side * 0.42);
    dk.rotation.y = Math.PI / 2;
    const top = card("back");
    top.position.set(tx + side * 0.6, y + 0.037, tz + side * 0.42);
    top.rotation.y = Math.PI / 2;
    k.root.add(top);
    k.keep(top);
  }
  // two chairs, face to face across the table
  for (const side of [1, -1]) k.put("gh-duelChair", () => roomChair("#3a2a12"), tx + side * 1.18, tz, side > 0 ? -Math.PI / 2 : Math.PI / 2, { dy, solid: false });
  // a card played now and then: from a hand onto the board
  const fly = card(`lg:${cols[n % cols.length]}:${n}`);
  fly.visible = false;
  k.root.add(fly);
  let tt = n * 1.7,
    side = 1;
  const from = new THREE.Vector3(),
    to = new THREE.Vector3();
  k.ticks.push((dt) => {
    tt += dt;
    if (tt > 5.2) {
      tt = 0;
      side = -side;
      from.set(tx + side * 0.8, y + 0.02, tz);
      to.set(tx + side * 0.19, y + 0.006, tz + (Math.random() - 0.5) * 0.5);
      fly.material = card(`lg:${cols[Math.floor(Math.random() * cols.length)]}:${Math.floor(Math.random() * 16)}`).material;
      fly.visible = true;
    }
    if (!fly.visible) return;
    const s = Math.min(1, tt / 0.55);
    fly.position.lerpVectors(from, to, s);
    fly.position.y += Math.sin(s * Math.PI) * 0.16;
    fly.rotation.set(0, (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (1 - s) * 2.4, 0);
    // it lies there a moment, then goes (the board is the still cards)
    if (tt > 2.6) fly.visible = false;
  });
  k.hit(1.4, 1.2, 2.2, tx, dy, tz, hover(), open(o.eyebrow ?? T("ZK LEGENDS Arena", "零知传奇竞技场")));
}

/** The arena: the stage, the board, the truss and its spots, neon, the duel tables. */
export function arena(k: GKit) {
  const S = ARENA.stage;
  const B = ARENA.board;
  const sx = (S.x0 + S.x1) / 2;
  // ---- the stage: a void block, a gold lip, an LED skirt with a scrolling line
  k.box(S.x1 - S.x0, S.h, S.z1 - S.z0, std("#100e16", 0.5, 0.3), sx, 0, (S.z0 + S.z1) / 2);
  k.box(S.x1 - S.x0 + 0.06, 0.05, 0.06, glowMat(GOLD, 1.5), sx, S.h - 0.05, S.z1 + 0.02);
  k.rects.push([S.x0, S.z0, S.x1, S.z1 + 0.05]);
  {
    const text = T("  ZK LEGENDS · THE CHAMPIONSHIP TABLE · SIT AT ANY DUEL TABLE TO PLAY · ⓩ PLAY CHIPS, NEVER REAL ZEC  ·", "  零知传奇 · 冠军桌 · 坐上任意对决桌即可开玩 · ⓩ 游戏筹码，绝非真实 ZEC  ·");
    const { t } = makeCanvas(2048, 64, (g) => {
      g.fillStyle = "#07060c";
      g.fillRect(0, 0, 2048, 64);
      g.font = PX(40);
      g.fillStyle = GOLD;
      g.textBaseline = "middle";
      g.fillText(text, 8, 34);
      g.fillStyle = "rgba(0,0,0,0.4)";
      for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 64);
      for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 2048, 1);
    });
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(0.6, 1);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0, S.h - 0.16), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    skirt.position.set(sx, (S.h - 0.16) / 2 + 0.04, S.z1 + 0.012);
    skirt.raycast = () => {};
    k.root.add(skirt);
    k.ticks.push((dt) => (t.offset.x = (t.offset.x + dt * 0.03) % 1));
  }
  // the championship table on the stage, its two finalists' chairs
  const mats = [playmat(GOLD, LILAC), playmat("#ff6b35", "#6dbf8a"), playmat(LILAC, "#ff5c8a")].map((c) => new THREE.MeshStandardMaterial({ map: c.t, roughness: 0.8, emissive: "#ffffff", emissiveMap: c.t, emissiveIntensity: 0.18 }));
  duelTableAt(k, sx, -43.0, 0, mats, { dy: S.h, eyebrow: T("The championship table", "冠军桌") });

  // ---- the board on the back wall: a bezel with gold steps, the LED face
  const bz = S.z0 + 0.12;
  k.box(B.w + 0.8, B.h + 0.8, 0.3, std("#0a0910", 0.6, 0.3), sx, B.y - 0.4, bz + 0.15);
  for (const [w, h, y] of [
    [B.w + 0.9, 0.08, B.y + B.h + 0.36],
    [B.w + 0.9, 0.08, B.y - 0.44],
  ])
    k.box(w, h, 0.1, glowMat(GOLD, 1.4), sx, y, bz + 0.33);
  // its stepped corners
  for (const ex of [-1, 1])
    for (const ey of [0, 1]) {
      const cx = sx + ex * (B.w / 2 + 0.45),
        cy = ey ? B.y + B.h + 0.4 : B.y - 0.4;
      for (let i = 0; i < 4; i++) k.box(0.22, 0.22, 0.12, glowMat(i % 2 ? LILAC : GOLD, 1.4), cx - ex * i * 0.22, cy + (ey ? -1 : 1) * (3 - i) * 0.22 - (ey ? 0.22 : 0), bz + 0.36);
    }
  const W = 1536,
    H = Math.round((W * B.h) / B.w);
  const face = makeCanvas(W, H);
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshBasicMaterial({ map: face.t, toneMapped: false }));
  boardMesh.position.set(sx, B.y + B.h / 2, bz + 0.32);
  k.root.add(boardMesh);
  let dirty = true;
  const redraw = () => (dirty = true);
  onFonts(redraw);
  let acc = 0,
    seen = -1,
    frame = 0;
  k.ticks.push((dt) => {
    stepDuel(dt, ++frame);
    acc += dt;
    const now = duelClock();
    const busy = !!duel.hit && now - duel.hit.at < 1.2;
    // redrawn when the duel moves, a few times a second while something is moving, once a second for LIVE
    if (duel.t !== seen || dirty || (busy && acc > 0.11) || acc > 0.66) {
      seen = duel.t;
      dirty = false;
      acc = 0;
      drawDuelBoard(face.g, W, H, k.height, redraw);
      face.t.needsUpdate = true;
    }
  });
  k.pick(boardMesh, `<b>${T("ZK LEGENDS · live duel", "零知传奇 · 对决直播")}</b><span>${T("click to play · the duel tables before the stage", "点击开玩 · 舞台前的对决桌")}</span>`, open(T("ZK LEGENDS Arena", "零知传奇竞技场")));

  // ---- neon: the name over the board, kanji banners either side
  k.sign("ZK LEGENDS", 0.95, GOLD, sx - 1.9, B.y + B.h + 1.05, bz + 0.2);
  k.sign("零知传奇", 0.8, LILAC, sx + 3.9, B.y + B.h + 1.02, bz + 0.2);
  for (const s of [-1, 1]) {
    const x = sx + s * (B.w / 2 + 1.3);
    k.box(0.9, 7.6, 0.12, std("#0a0910", 0.6, 0.3), x, B.y + 0.4, bz + 0.1);
    k.box(0.06, 7.6, 0.06, glowMat(s < 0 ? GOLD : LILAC, 1.5), x - 0.48, B.y + 0.4, bz + 0.2);
    k.box(0.06, 7.6, 0.06, glowMat(s < 0 ? GOLD : LILAC, 1.5), x + 0.48, B.y + 0.4, bz + 0.2);
    k.sign(s < 0 ? "決闘" : "伝説", 1.05, s < 0 ? GOLD : LILAC, x, B.y + 4.2, bz + 0.2, 0, { vertical: true });
  }

  // ---- the truss over the stage and its spots (light cones, no lamps: the house's lamps are fixed)
  const trussY = 11.4;
  const tm = std("#2a2632", 0.4, 0.8);
  // (in front of the board, never across it from the floor's eye)
  const tz0 = S.z1 - 0.6,
    tz1 = S.z1 + 1.6;
  for (const z of [tz0, tz1]) k.box(S.x1 - S.x0 + 1, 0.3, 0.3, tm, sx, trussY, z);
  for (const x of [S.x0 - 0.3, S.x1 + 0.3]) k.box(0.3, 0.3, tz1 - tz0, tm, x, trussY, (tz0 + tz1) / 2);
  for (const x of [S.x0 - 0.3, S.x1 + 0.3]) k.box(0.04, ROOM.h - trussY - 0.3, 0.04, tm, x, trussY + 0.3, (tz0 + tz1) / 2);
  const coneGeo = new THREE.ConeGeometry(1.15, trussY - S.h - 0.4, 24, 1, true);
  const cones: THREE.Mesh[] = [];
  [-6, -2.4, 2.4, 6].forEach((x, i) => {
    const col = i % 2 ? LILAC : GOLD;
    const can = k.box(0.34, 0.46, 0.34, k.dark, sx + x, trussY - 0.46, tz0);
    can.rotation.x = 0.35;
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.55), transparent: true, opacity: 0.11, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    cone.position.set(sx + x, (trussY + S.h) / 2, tz0 - 1.15);
    cone.rotation.x = 0.22;
    cone.raycast = () => {};
    k.root.add(cone);
    cones.push(cone);
    // the pool of light on the stage
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.5), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(sx + x, S.h + 0.012, tz0 - 2.3);
    pool.raycast = () => {};
    k.root.add(pool);
  });
  let sweep = 0;
  k.ticks.push((dt) => {
    sweep += dt;
    cones.forEach((c, i) => (c.rotation.z = Math.sin(sweep * 0.5 + i * 1.3) * 0.18));
  });

  // ---- the duel tables on the floor, their mats, pendant lamps
  DUELS.forEach(([x, z], i) => duelTableAt(k, x, z, i + 1, mats));
  // the arena's floor: a dark field with gold lines round the tables, the house's name in it
  const floorTex = makeCanvas(1024, 1024, (g) => {
    g.fillStyle = "#0e0c14";
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = "rgba(244,183,40,0.35)";
    g.lineWidth = 6;
    stepped(g, 24, 24, 976, 976, 40);
    g.stroke();
    g.strokeStyle = "rgba(196,177,252,0.18)";
    g.lineWidth = 3;
    stepped(g, 60, 60, 904, 904, 34);
    g.stroke();
    g.fillStyle = "rgba(244,183,40,0.06)";
    for (let y = 0; y < 1024; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x < 1024; x += 32) g.fillRect(x, y, 6, 6);
  }).t;
  k.flat(26, 15.4, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.4, metalness: 0.2 }), 0, -32.4, 0.008);

  // ---- the gate into the arena: two voxel-stepped pillars and a lit beam with its name, high
  // enough that the board is seen whole under it from the doors
  const gz = -24.6;
  const gy = 7.1;
  for (const s of [-1, 1]) {
    const x = s * 6.4;
    k.box(0.7, gy, 0.7, std("#141220", 0.5, 0.3), x, 0, gz);
    // stepped feet and capitals
    k.box(1.1, 0.3, 1.1, std("#141220", 0.5, 0.3), x, 0, gz);
    k.box(0.9, 0.2, 0.9, std("#141220", 0.5, 0.3), x, 0.3, gz);
    for (let i = 0; i < 5; i++) k.box(0.76, 0.08, 0.76, glowMat(i % 2 ? LILAC : GOLD, 1.4), x, 0.9 + i * 1.3, gz);
    k.box(0.05, gy - 0.6, 0.05, glowMat(GOLD, 1.5), x - s * 0.36, 0.5, gz + 0.36);
    k.rects.push([x - 0.56, gz - 0.56, x + 0.56, gz + 0.56]);
  }
  k.box(14.6, 0.8, 0.6, std("#141220", 0.5, 0.3), 0, gy, gz);
  k.box(13.0, 0.25, 0.45, std("#141220", 0.5, 0.3), 0, gy + 0.8, gz);
  for (const yy of [gy + 0.02, gy + 0.72]) for (const dz of [0.31, -0.31]) k.box(14.7, 0.06, 0.06, glowMat(GOLD, 1.5), 0, yy, gz + dz);
  k.sign(T("ZK LEGENDS ARENA", "零知传奇竞技场"), 0.52, GOLD, -1.1, gy + 0.4, gz + 0.32);
  k.sign("闘技場", 0.48, LILAC, 3.9, gy + 0.4, gz + 0.32);
  k.sign(T("ZK LEGENDS ARENA", "零知传奇竞技场"), 0.52, GOLD, 0, gy + 0.4, gz - 0.32, Math.PI);
  return { mats };
}
