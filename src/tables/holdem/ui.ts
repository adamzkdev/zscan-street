/**
 * ORCHARD HOLD'EM at the table: The Orchard Room drawn in DOM, CSS and SVG (holdem.css, art.ts), driven
 * hand by hand by the pure engine (engine.ts, table.ts) and the zkSNARK AIs (ai.ts).
 *
 * The table is a real one: a padded leather rail, a walnut racetrack, a felt under the lamp with its
 * betting line printed on it. The dealer riffles the deck each hand and deals one card at a time
 * from it; you squeeze your two cards up; the flop lands as a stack, turns over together and is
 * spread; a card is burnt before each street. Bets are clay chips stacked in real piles that slide
 * in, are swept to the pot and pushed to the winner. Everything that moves is a Web Animation on
 * transforms; the loop is async, every pause scaled by the fast-forward (and skipped on the bench).
 */
import "./holdem.css";
import { personImage } from "../../party/people";
import { T, relang } from "../../i18n/lang";
import type { TableOpts, TableResult } from "../types";
import { SUIT_EN, SUIT_INK, SUIT_ZH, RANKS, mix, mulberry } from "./cards";
import { backUrl, faceSvg, markSvg, pileSvg, puckSvg, spriteSvg, suitIcon } from "./art";
import { Room, snd } from "./sfx";
import { HANDS_PER_LEVEL, LEVELS, Table, cashBlinds, personas, prizes, type Format } from "./table";
import type { Action, Ev, Hand, Legal } from "./engine";
import { equity, type Decision } from "./ai";
import { bestFive, catName, describe, evaluate } from "./eval";

const num = (v: number) => Math.round(v).toLocaleString("en-US");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const CLOSED = Symbol("closed");
/** A tablet: a finger for a pointer, and room (holdem.css's tablet rules use the same query). */
const TABLET = "(pointer: coarse) and (min-width: 761px) and (min-height: 521px)";
const SAGE = "#6dbf8a",
  FLARE = "#ff6b35",
  PINK = "#ff5c8a";

interface SeatEl {
  root: HTMLElement;
  av: HTMLElement;
  ring: SVGCircleElement;
  name: HTMLElement;
  act: HTMLElement;
  stack: HTMLElement;
  hole: HTMLElement;
  cards: HTMLElement[];
  bubble: HTMLElement;
  hand: HTMLElement;
  odds: HTMLElement;
  gain: HTMLElement;
  bet: HTMLElement;
}
interface P2 {
  x: number;
  y: number;
}
interface HistHand {
  no: number;
  head: string;
  lines: string[];
}

/** Short lines the zkSNARKs say, by mood. */
const SAY: Record<string, [string, string][]> = {
  allin: [
    ["All in.", "全下。"],
    ["Shield now, call later.", "先屏蔽，后跟注。"],
    ["Zero-knowledge shove.", "零知识全下。"],
    ["Shove o'clock.", "全下时间到。"],
    ["Prove it.", "证明一下。"],
  ],
  win: [
    ["Ship it to my u1… address.", "打到我的 u1… 地址。"],
    ["Shielded pot.", "屏蔽底池。"],
    ["Big proof, bigger stack.", "证明大，筹码更大。"],
    ["Thanks for the block reward.", "谢谢你的出块奖励。"],
  ],
  lose: [
    ["The Tracker got me.", "被追踪者盯上了。"],
    ["Nullified.", "被作废了。"],
    ["Felt too transparent there.", "那手我太透明了。"],
    ["Linked. Ouch.", "被关联了，疼。"],
  ],
  bluff: [
    ["Was a bluff, by the way.", "顺便说一句，是诈唬。"],
    ["Pure noise.", "纯噪声。"],
    ["Zero bits of hand.", "零比特的牌。"],
  ],
  fold: [
    ["Too rich for my wallet.", "对我的钱包来说太贵了。"],
    ["I'll wait for NU7.", "我等 NU7。"],
    ["Fold. Next block.", "弃牌。下一个区块。"],
  ],
  think: [
    ["Hmm… 192 bytes of doubt.", "嗯…… 192 字节的犹豫。"],
    ["Running the numbers.", "算一下。"],
    ["Interesting.", "有意思。"],
  ],
};

const ICON = {
  music: `<svg viewBox="0 0 24 24"><path d="M9 17.5V6l10-2v11.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.6" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.6" fill="currentColor"/></svg>`,
  ff: `<svg viewBox="0 0 24 24"><path d="M4 6.5l7 5.5-7 5.5zM12.5 6.5l7 5.5-7 5.5z" fill="currentColor"/></svg>`,
  helper: `<svg viewBox="0 0 24 24"><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  log: `<svg viewBox="0 0 24 24"><path d="M6 5h12M6 9.5h12M6 14h8M6 18.5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  leave: `<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
};

export class Game {
  private o: TableOpts;
  private root: HTMLElement;
  private stage!: HTMLElement;
  private fx!: HTMLElement;
  private felt!: HTMLElement;
  private board!: HTMLElement;
  private slots: HTMLElement[] = [];
  private potEl!: HTMLElement;
  private potsEl!: HTMLElement;
  private dealerEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private burnEl!: HTMLElement;
  private banner!: HTMLElement;
  private bar!: HTMLElement;
  private info!: HTMLElement;
  private logEl!: HTMLElement;
  private modal!: HTMLElement;
  private helperEl!: HTMLElement;
  private seatEls: SeatEl[] = [];
  private table: Table | null = null;
  private hand: Hand | null = null;
  private format: Format = "cash";
  private seatPos: P2[] = [];
  private betPos: P2[] = [];
  private holePos: P2[] = [];
  private showOff: P2[] = [];
  private namePos: P2[] = [];
  private btnPos: P2[] = [];
  private center: P2 = { x: 0, y: 0 };
  private deckPos: P2 = { x: 0, y: 0 };
  private potX = 0;
  private W = 0;
  private cw = 60;
  /** Your own cards' width (the board's may shrink on a phone). */
  private hcw = 60;
  private av = 60;
  private portrait = false;
  /** A tablet (a finger, and room): the upright table drawn bigger, the sizer always open. */
  private tab = false;
  private ff = false;
  private readonly fast: boolean;
  private readonly auto: boolean;
  private helper = false;
  private closed = false;
  private exited = false;
  private uiRnd: () => number;
  private humanResolve: ((a: Action) => void) | null = null;
  private legal: Legal | null = null;
  private raiseTo = 0;
  private sizerOpen = false;
  private history: HistHand[] = [];
  private cur: HistHand | null = null;
  private boardCards: HTMLElement[] = [];
  private showWish: boolean[] = [];
  private offs: (() => void)[] = [];
  private ro: ResizeObserver | null = null;
  private timers = new Set<number>();
  private waking = new Set<() => void>();
  private leaving = false;
  private watching = false;
  private bigPot = 0;
  private handsPlayed = 0;
  private confirmResolve: ((v: boolean) => void) | null = null;
  private room = new Room();
  private ringAnim: Animation | null = null;

  constructor(o: TableOpts) {
    relang();
    this.o = o;
    this.fast = !!o.lab?.fast;
    this.auto = !!o.lab?.auto;
    // (the bench, tablelab.html: its scripted checks reach the table to open each screen)
    if (o.lab) (window as unknown as { holdemGame?: Game }).holdemGame = this;
    this.uiRnd = mulberry(mix(o.seed, 0xc3));
    this.root = document.createElement("div");
    this.root.className = "lh-root";
    this.root.style.setProperty("--back", backUrl());
    this.root.tabIndex = -1;
    o.root.appendChild(this.root);
    this.build();
    const kd = (e: KeyboardEvent) => this.key(e);
    window.addEventListener("keydown", kd, true);
    this.offs.push(() => window.removeEventListener("keydown", kd, true));
    // the browser keeps the sound asleep until a first click or key: the room starts then
    const wake = () => !this.fast && this.room.start();
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("keydown", wake, true);
    this.offs.push(() => {
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("keydown", wake, true);
    });
    snd.mute(this.fast);
    if (!this.fast) {
      this.room.start();
      snd.warm();
    }
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.stage);
    this.layout();
    const q = new URLSearchParams(location.search).get("format");
    if (this.auto || q) this.start(q === "sng" || q === "turbo" ? q : "cash");
    else this.lobby();
  }

  // ---- the frame -----------------------------------------------------------------------------

  private build() {
    this.root.innerHTML = `${spriteSvg()}
      <div class="lh-room"><i class="lh-lamp"></i></div>
      <header class="lh-top">
        <div class="lh-brand"><svg viewBox="0 0 24 24">${markSvg(12, 12, 22)}</svg><div><b>ORCHARD HOLD'EM</b><small>${T("The Orchard Room · Orchard Tower", "果园厅 · Orchard 塔")}</small></div></div>
        <div class="lh-info"></div>
        <nav class="lh-tools">
          <button data-t="music" title="${T("The band (M)", "乐队（M）")}">${ICON.music}</button>
          <button data-t="ff" title="${T("Fast-forward the rivals (Tab)", "加速对手（Tab）")}">${ICON.ff}</button>
          <button data-t="helper" title="${T("Hand helper (H)", "牌力助手（H）")}">${ICON.helper}</button>
          <button data-t="log" title="${T("Hand history (L)", "牌局记录（L）")}">${ICON.log}</button>
          <button data-t="leave" class="lh-leave" title="${T("Leave (Esc)", "离开（Esc）")}">${ICON.leave}</button>
        </nav>
      </header>
      <main class="lh-stage">
        <div class="lh-table"><i class="lh-floor"></i><i class="lh-apron"></i><i class="lh-rail"></i><i class="lh-wood"></i>
          <div class="lh-felt">
            <i class="lh-line"></i>
            <svg class="lh-arc" viewBox="0 0 1000 500"><defs><path id="lh-arcp" d="M120 250 A380 200 0 0 0 880 250"/></defs></svg>
            <div class="lh-felt-mark"><svg viewBox="0 0 24 24">${markSvg(12, 12, 22, "currentColor", "currentColor")}</svg><span>${T("ⓩ play chips · never real ZEC", "ⓩ 游戏筹码 · 绝非真实 ZEC")}</span></div>
          </div>
        </div>
        <div class="lh-board">${'<div class="lh-slot"></div>'.repeat(5)}</div>
        <div class="lh-deck"><div class="lh-burn"></div><div class="lh-stackd"><i></i><i></i><i></i><i></i><b class="lh-half"></b><b class="lh-half"></b></div></div>
        <div class="lh-pot"><span class="lh-ppile"></span><span class="lh-plabel"><small>${T("Pot", "底池")}</small><b>0</b></span></div>
        <div class="lh-pots"></div>
        <div class="lh-dealer">${puckSvg()}</div>
        <div class="lh-seed"></div>
        <div class="lh-helper"></div>
        <div class="lh-fx"></div>
        <div class="lh-banner"></div>
      </main>
      <footer class="lh-bar"></footer>
      <aside class="lh-log"><header><b>${T("Hand history", "牌局记录")}</b><button data-t="log">${ICON.leave}</button></header><div class="lh-log-body"></div></aside>
      <div class="lh-modal"></div>`;
    const $ = <E extends HTMLElement>(s: string) => this.root.querySelector(s) as E;
    this.stage = $(".lh-stage");
    this.fx = $(".lh-fx");
    this.felt = $(".lh-felt");
    this.board = $(".lh-board");
    this.slots = [...this.board.querySelectorAll<HTMLElement>(".lh-slot")];
    this.potEl = $(".lh-pot");
    this.potsEl = $(".lh-pots");
    this.dealerEl = $(".lh-dealer");
    this.deckEl = $(".lh-deck");
    this.burnEl = $(".lh-burn");
    this.banner = $(".lh-banner");
    this.bar = $(".lh-bar");
    this.info = $(".lh-info");
    this.logEl = $(".lh-log");
    this.modal = $(".lh-modal");
    this.helperEl = $(".lh-helper");
    // the felt's lettering, round the bottom of the betting line
    const arc = this.felt.querySelector("svg.lh-arc")!;
    arc.insertAdjacentHTML(
      "beforeend",
      `<text><textPath href="#lh-arcp" startOffset="50%" text-anchor="middle">${T("THE ORCHARD ROOM · NO-LIMIT HOLD'EM · 果园厅", "果园厅 · 无限注德州扑克 · THE ORCHARD ROOM")}</textPath></text>`,
    );
    $(".lh-seed").textContent = this.o.seedNote || "";
    this.root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
      if (!b) return;
      const t = b.dataset.t!;
      if (t === "ff") this.toggleFF();
      else if (t === "helper") this.toggleHelper();
      else if (t === "log") this.toggleLog();
      else if (t === "music") this.toggleMusic();
      else if (t === "leave") void this.askLeave();
    });
    this.updateTools();
  }

  private updateTools() {
    this.root.querySelector('[data-t="ff"]')?.classList.toggle("on", this.ff);
    this.root.querySelector('[data-t="helper"]')?.classList.toggle("on", this.helper);
    this.root.querySelector('[data-t="music"]')?.classList.toggle("on", this.room.musicOn);
    this.root.querySelector('nav [data-t="log"]')?.classList.toggle("on", this.logEl.classList.contains("open"));
  }
  private toggleFF() {
    this.ff = !this.ff;
    snd.ui();
    this.updateTools();
  }
  private toggleHelper() {
    this.helper = !this.helper;
    snd.ui();
    this.updateTools();
    this.updateHelper();
  }
  private toggleMusic() {
    this.room.setMusic(!this.room.musicOn);
    snd.ui();
    this.updateTools();
  }
  private toggleLog() {
    this.logEl.classList.toggle("open");
    snd.ui();
    this.updateTools();
    if (this.logEl.classList.contains("open")) this.renderLog();
  }

  // ---- geometry ------------------------------------------------------------------------------

  private layout() {
    const W = this.stage.clientWidth,
      H = this.stage.clientHeight;
    if (!W || !H) return;
    this.W = W;
    const n = this.o.seats.length;
    this.portrait = H > W * 1.15;
    this.root.classList.toggle("lh-portrait", this.portrait);
    // a tablet (the same query as holdem.css's tablet rules): the upright table's caps are a phone's, so lift them
    this.tab = matchMedia(TABLET).matches;
    const big = this.portrait && this.tab;
    this.av = this.portrait ? Math.max(38, Math.min(big ? 80 : 54, W * (big ? 0.1 : 0.12))) : Math.max(34, Math.min(72, H * 0.112));
    let rx: number, ry: number;
    if (this.portrait) {
      rx = Math.min(W * 0.35, H * 0.29);
      ry = Math.min(H * 0.36, rx * 1.95);
    } else {
      rx = Math.min(W * 0.39, H * 0.78);
      ry = Math.min(H * 0.34, rx * 0.5);
    }
    const rail = this.portrait ? Math.max(11, Math.min(20, rx * 0.085)) : Math.max(14, Math.min(30, ry * 0.11));
    const wood = Math.max(4, rail * 0.36);
    const cx = W / 2,
      cy = H * (this.portrait ? 0.47 : H < 420 ? 0.468 : 0.485);
    this.center = { x: cx, y: cy };
    this.cw = this.portrait ? Math.min((rx * 2 * 0.86) / 5.35, big ? 88 : 56) : Math.min(ry * 0.31, W * 0.058, 80);
    const s = this.root.style;
    // (a tablet's: no bigger than the board's, or they reach the next seat's plate)
    this.hcw = this.portrait ? Math.min(this.cw * (big ? 0.85 : 1.12), W * (big ? 0.09 : 0.135)) : this.cw;
    s.setProperty("--hcw", `${this.hcw}px`);
    s.setProperty("--cw", `${this.cw}px`);
    s.setProperty("--av", `${this.av}px`);
    s.setProperty("--rx", `${rx}px`);
    s.setProperty("--ry", `${ry}px`);
    s.setProperty("--cx", `${cx}px`);
    s.setProperty("--cy", `${cy}px`);
    s.setProperty("--rail", `${rail}px`);
    s.setProperty("--wood", `${wood}px`);
    s.setProperty("--chip", `${this.portrait ? Math.max(13, Math.min(big ? 24 : 17, W * (big ? 0.03 : 0.04))) : Math.max(16, Math.min(26, this.cw * 0.36))}px`);
    // the felt's lettering, round the bottom of the betting line
    const arc = this.felt.querySelector<SVGSVGElement>(".lh-arc")!;
    arc.setAttribute("viewBox", `0 0 ${rx * 2} ${ry * 2}`);
    arc.querySelector("path")!.setAttribute("d", `M${rx * 0.24} ${ry} A${rx * 0.76} ${ry * 0.7} 0 0 0 ${rx * 1.76} ${ry}`);
    const tx = arc.querySelector("text");
    if (tx) tx.setAttribute("font-size", String(Math.max(9, Math.min(14, rx * 0.03))));
    // seats evenly along the rail (by arc length), you at the bottom, clockwise
    const rxs = rx + wood + rail * (this.portrait ? 0.2 : 0.35),
      rys = ry + wood + rail * (this.portrait ? 0.4 : 0.5);
    const N = 720;
    const pts: P2[] = [];
    const acc: number[] = [0];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI / 2 + (i / N) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rxs, y: cy + Math.sin(a) * rys });
      if (i) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = acc[N];
    this.seatPos = [];
    this.betPos = [];
    this.holePos = [];
    this.showOff = [];
    this.namePos = [];
    this.btnPos = [];
    for (let k = 0; k < n; k++) {
      const target = (k / n) * total;
      let i = 0;
      while (i < N && acc[i] < target) i++;
      const p = pts[i];
      this.seatPos.push(p);
      const a = Math.atan2((p.y - cy) / rys, (p.x - cx) / rxs);
      const dx = cx - p.x,
        dy = cy - p.y,
        d = Math.hypot(dx, dy) || 1;
      // the cards tucked behind the avatar's shoulder on the table's side…
      const side = dx >= 0 ? 1 : -1;
      this.holePos.push({ x: p.x + side * this.av * 0.46, y: p.y - this.av * 0.42 });
      if (this.portrait) {
        // a phone held upright: shown over the avatar, so they never land on the board (the seat at
        // the very top: under its plate)
        const cardH = this.av * 0.5 * 1.4 * 1.25;
        const above = dy > 0 && Math.abs(dx / d) < 0.35;
        const want = { x: 0, y: above ? this.av * 0.36 + 38 + cardH / 2 : -this.av * 0.5 - 8 - cardH / 2 };
        this.showOff.push({ x: want.x - side * this.av * 0.46, y: want.y + this.av * 0.42 });
        // (the hand's name stays on the screen, however near the edge the seat is)
        const nx = Math.max(62, Math.min(W - 62, p.x + want.x)) - p.x;
        this.namePos.push({ x: nx, y: above ? want.y + cardH / 2 + 11 : want.y - cardH / 2 - 11 });
      } else {
        // …and come forward, toward the middle and clear of the name plate, when shown
        const shownH = this.av * 0.5 * 1.4 * 1.5;
        // (a seat across the table: its cards beside the avatar, the pot and the board stay clear)
        const across = Math.abs(dx / d) < 0.35 && dy > 0;
        if (across) {
          const shownW = this.av * 0.5 * 1.55 * 1.5;
          const want = { x: side * (this.av * 0.5 + 10 + shownW / 2), y: this.av * 0.08 };
          this.showOff.push({ x: want.x - side * this.av * 0.46, y: want.y + this.av * 0.42 });
          this.namePos.push({ x: want.x, y: want.y + shownH / 2 + 13 });
        } else {
          const reach = dy > 0 ? this.av * 0.4 + 46 + shownH / 2 : this.av * 0.5 + shownH / 2 + 18;
          const so = { x: (dx / d) * this.av * 1.4 - side * this.av * 0.46, y: (dy / d) * reach + this.av * 0.42 };
          this.showOff.push(so);
          // the hand's name: under the shown cards when they sit below the avatar, over them otherwise
          const shownX = side * this.av * 0.46 + so.x,
            shownY = -this.av * 0.42 + so.y;
          this.namePos.push({ x: shownX, y: dy > 0 ? shownY + shownH / 2 + 13 : shownY - shownH / 2 - 13 });
        }
      }
      const bk = this.portrait ? 0.56 : 0.62;
      this.betPos.push({ x: cx + Math.cos(a) * rx * bk, y: cy + Math.sin(a) * ry * (this.portrait ? 0.62 : 0.6) });
      // the puck: in front of the seat, off to the side facing the table, clear of the name plate
      const ux = dx / d,
        uy = dy / d;
      const want = Math.abs(ux) > 0.2 ? Math.sign(ux) : uy > 0 ? 1 : -1;
      let px = -uy,
        py = ux;
      if (px * want - 0.3 * py < -px * want + 0.3 * py) {
        px = -px;
        py = -py;
      }
      this.btnPos.push({ x: p.x + ux * this.av * 1.15 + px * this.av * 0.85, y: p.y + uy * this.av * (uy > 0 ? 1.55 : 1.1) + py * this.av * 0.85 });
    }
    // a phone held upright: the board shrinks to fit between the side seats level with it
    if (this.portrait) {
      const half = (this.cw * 1.4) / 2 + this.av * 0.95;
      let room = Infinity;
      for (let k = 1; k < n; k++) {
        const p = this.seatPos[k];
        if (Math.abs(p.y - cy) < half) room = Math.min(room, Math.abs(p.x - cx) - this.av * 0.92);
      }
      if (room < Infinity) {
        this.cw = Math.max(30, Math.min(this.cw, (room * 2) / 5.5));
        s.setProperty("--cw", `${this.cw}px`);
      }
    }
    // a bet never sits on the board: above it or below it, on its seat's side
    const bh = (this.cw * 1.4) / 2 + 16,
      bw = (this.cw * 5.48) / 2 + 22;
    for (let k = 0; k < n; k++) {
      const b = this.betPos[k];
      if (Math.abs(b.y - cy) < bh && Math.abs(b.x - cx) < bw) b.y = cy + (this.seatPos[k].y >= cy ? 1 : -1) * (bh + 8);
      // nor the puck (it goes to the other side of the board from the seat's bet)
      const d = this.btnPos[k];
      if (Math.abs(d.y - cy) < bh + 6 && Math.abs(d.x - cx) < bw) d.y = cy - (this.seatPos[k].y >= cy ? 1 : -1) * (bh + 10);
    }
    // the deck: the dealer's place, above the board, left of the pot;
    // on a phone held upright, up the felt's middle, between the pot and the top seat's bet
    this.deckPos = this.portrait ? { x: cx, y: cy - ry * 0.43 } : { x: cx - this.cw * 1.25, y: cy - this.cw * 0.7 - this.cw * 0.86 * 0.7 - 22 };
    // the pot: above the board's middle (a little right of it on a wide table, the deck on its left)
    this.potX = this.portrait ? cx : cx + this.cw * 0.55;
    s.setProperty("--potx", `${this.potX}px`);
    this.deckEl.style.left = `${this.deckPos.x}px`;
    this.deckEl.style.top = `${this.deckPos.y}px`;
    // the hero's cards beside the avatar
    const hp = this.seatPos[0];
    this.holePos[0] = { x: hp.x + this.av * 0.95 + this.hcw * 1.0, y: hp.y - this.av * 0.16 };
    // a phone held upright on a short screen: the seat on your right sits low, its avatar and plate where
    // your cards go; they come down under its plate (as far as the stage allows). Touch only: a mouse keeps its layout.
    if (this.portrait && n > 2 && matchMedia("(pointer: coarse)").matches) {
      const hw = this.hcw * 1.08,
        cardW = hw * 1.8,
        cardH = hw * 1.4;
      const c = this.holePos[0];
      const p = this.seatPos[n - 1];
      // (its plate as tall as it is drawn: a tablet's is taller than a phone's 38 px)
      const plateH = this.seatEls[n - 1]?.root.querySelector<HTMLElement>(".lh-plate")?.offsetHeight || 38;
      const plateBot = p.y + this.av * 0.36 + plateH;
      // (and room for the cards' tilt, whose top corners rise above their box)
      if (Math.abs(p.x - c.x) < Math.max(this.av * 0.8, 46) + cardW / 2 && c.y - cardH / 2 < plateBot + 4 && c.y + cardH / 2 > p.y - this.av / 2)
        c.y = Math.min(H - cardH / 2 - 4, plateBot + 10 + cardH / 2);
    }
    if (!this.portrait && n > 2 && matchMedia("(pointer: coarse)").matches) this.unclutter(W);
    this.placeAll();
  }

  /**
   * A touch screen on its side: on a small phone eight seats crowd the felt, so what would touch is
   * moved apart, measured on the plates as drawn: the side seats' plates stay on the stage, and your
   * cards sit between your avatar and the next seat's plate (a little smaller if they must).
   */
  private unclutter(W: number) {
    const n = this.o.seats.length;
    const av = this.av;
    const plate = (k: number) => {
      const e = this.seatEls[k]?.root.querySelector<HTMLElement>(".lh-plate");
      const p = this.seatPos[k];
      const w = Math.max(e?.offsetWidth || av * 1.78, av),
        h = e?.offsetHeight || 38;
      return { l: p.x - w / 2, r: p.x + w / 2, t: p.y + av * 0.36, b: p.y + av * 0.36 + h, w };
    };
    // the side seats' plates on the stage (and their cards and puck with them)
    for (let k = 0; k < n; k++) {
      const p = this.seatPos[k];
      const half = plate(k).w / 2 + 2;
      const dx = Math.max(half, Math.min(W - half, p.x)) - p.x;
      if (!dx) continue;
      p.x += dx;
      this.holePos[k].x += dx;
      this.btnPos[k].x += dx;
    }
    // your cards: right of your avatar, short of the next seat's plate when they reach its height
    const hp = this.seatPos[0];
    const c = this.holePos[0];
    const q = plate(n - 1);
    let hw = this.hcw * 1.08;
    const cardH = hw * 1.4;
    if (c.y + cardH / 2 > q.t - 4 && c.y - cardH / 2 < q.b) {
      const left = hp.x + av / 2 + 4;
      const room = q.l - 6 - left;
      if (hw * 1.8 > room) {
        this.hcw = Math.max(this.hcw * 0.8, room / 1.8 / 1.08);
        this.root.style.setProperty("--hcw", `${this.hcw}px`);
        hw = this.hcw * 1.08;
      }
      c.x = Math.min(c.x, left + (hw * 1.8) / 2);
    }
  }

  private placeAll() {
    const set = (el: HTMLElement, p: P2) => {
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    };
    this.seatEls.forEach((s, i) => {
      set(s.root, this.seatPos[i]);
      set(s.bet, this.betPos[i]);
      const h = this.holePos[i];
      s.hole.style.left = `${h.x - this.seatPos[i].x}px`;
      s.hole.style.top = `${h.y - this.seatPos[i].y}px`;
      if (this.showOff[i]) {
        s.hole.style.setProperty("--sx", `${this.showOff[i].x}px`);
        s.hole.style.setProperty("--sy", `${this.showOff[i].y}px`);
      }
      if (i > 0 && this.namePos[i]) {
        s.hand.style.left = `${this.namePos[i].x}px`;
        s.hand.style.top = `${this.namePos[i].y}px`;
      }
    });
    if (this.hand) set(this.dealerEl, this.btnPos[this.hand.button]);
    else if (this.table && this.table.button >= 0) set(this.dealerEl, this.btnPos[this.table.button]);
  }

  /** Where a sound comes from (-1 left … 1 right). */
  private panOf(x: number) {
    return this.W ? Math.max(-0.8, Math.min(0.8, ((x - this.center.x) / (this.W / 2)) * 0.8)) : 0;
  }

  // ---- the lobby -----------------------------------------------------------------------------

  private lobby() {
    const n = this.o.seats.length;
    const cb = cashBlinds(this.o.stake);
    const stake = this.o.stake;
    const pz = prizes(n, Math.max(stake, 0));
    const pzLine =
      stake > 0 ? pz.map((p, i) => `<span><em>${T(["1st", "2nd", "3rd"][i], ["第一", "第二", "第三"][i])}</em> ⓩ ${num(p)}</span>`).join("") : `<span>${T("Free play: for the glory", "免费：只为荣誉")}</span>`;
    const rivals = this.o.seats
      .slice(1)
      .map(
        (s) =>
          `<li style="--sc:${s.color}"><img src="${personImage(s.id)}" alt=""/><b>${esc(s.name)}</b><i title="${T("Skill", "实力")}">${'<s class="on"></s>'.repeat(1 + Math.round(s.skill * 4))}${"<s></s>".repeat(4 - Math.round(s.skill * 4))}</i></li>`,
      )
      .join("");
    this.modal.innerHTML = `
      <div class="lh-card-modal lh-lobby">
        <p class="lh-kicker">THE ORCHARD ROOM <span>果园厅</span></p>
        <h1>Orchard Hold'em</h1>
        <p class="lh-sub">${T(`No-limit Texas Hold'em · ${n} seats · ⓩ play chips, never real ZEC`, `无限注德州扑克 · ${n} 座 · ⓩ 游戏筹码，绝非真实 ZEC`)}</p>
        <div class="lh-formats">
          <button class="lh-fmt on" data-f="cash"><b>${T("Cash table", "现金桌")}</b><span>${T(`Your buy-in is your stack: ${stake > 0 ? `ⓩ ${num(stake)}` : "200 free chips"}. Blinds ${cb.sb}/${cb.bb}. Leave between hands with what you have.`, `买入即筹码：${stake > 0 ? `ⓩ ${num(stake)}` : "200 免费筹码"}。盲注 ${cb.sb}/${cb.bb}。每手之间随时带走你的筹码离开。`)}</span></button>
          <button class="lh-fmt" data-f="sng"><b>${T("Sit & Go", "坐满即玩")}</b><span>${T(`Everyone buys in, 1,500 chips each. Blinds up every ${HANDS_PER_LEVEL.sng} hands. Last one standing.`, `所有人买入，每人 1,500 筹码。每 ${HANDS_PER_LEVEL.sng} 手升盲。最后站着的人获胜。`)}</span><p class="lh-prize">${pzLine}</p></button>
          <button class="lh-fmt" data-f="turbo"><b>${T("Turbo Sit & Go", "快速坐满即玩")}</b><span>${T(`The same, blinds up every ${HANDS_PER_LEVEL.turbo} hands: a quick one.`, `同上，每 ${HANDS_PER_LEVEL.turbo} 手升盲：速战速决。`)}</span><p class="lh-prize">${pzLine}</p></button>
        </div>
        <ul class="lh-rivals">${rivals}</ul>
        <div class="lh-row">
          <button class="lh-btn ghost" data-l="leave">${T("Back", "返回")}</button>
          <button class="lh-btn go" data-l="go">${T("Take a seat", "入座")} <kbd>Enter</kbd></button>
        </div>
        <p class="lh-fine">${esc(this.o.seedNote || "")}</p>
      </div>`;
    this.modal.classList.add("open");
    let pick: Format = "cash";
    const sel = (f: Format) => {
      pick = f;
      this.modal.querySelectorAll<HTMLElement>(".lh-fmt").forEach((b) => b.classList.toggle("on", b.dataset.f === f));
    };
    this.modal.onclick = (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest<HTMLElement>("[data-f]");
      if (f) {
        snd.ui();
        sel(f.dataset.f as Format);
      }
      const l = t.closest<HTMLElement>("[data-l]");
      if (l?.dataset.l === "go") go();
      if (l?.dataset.l === "leave") this.exit({ order: this.o.seats.map((s) => s.seat), payout: this.o.stake, summary: "Left the Orchard Room before the first hand." });
    };
    const go = () => {
      this.modal.onclick = null;
      this.lobbyKeys = null;
      this.modal.classList.remove("open");
      this.start(pick);
    };
    const order: Format[] = ["cash", "sng", "turbo"];
    this.lobbyKeys = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") sel(order[(order.indexOf(pick) + 1) % 3]);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") sel(order[(order.indexOf(pick) + 2) % 3]);
      else if (e.key === "Enter") go();
      else return false;
      return true;
    };
  }
  private lobbyKeys: ((e: KeyboardEvent) => boolean) | null = null;

  // ---- the session ---------------------------------------------------------------------------

  private start(format: Format) {
    this.format = format;
    this.root.dataset.format = format;
    const ps = personas(this.o.seats, this.o.seed);
    this.table = new Table({ format, n: this.o.seats.length, stake: this.o.stake, seed: this.o.seed, personas: ps });
    this.buildSeats();
    this.layout();
    this.renderInfo();
    void this.run();
  }

  private buildSeats() {
    const t = this.table!;
    for (const s of this.seatEls) {
      s.root.remove();
      s.bet.remove();
    }
    this.seatEls = this.o.seats.map((seat, i) => {
      const root = document.createElement("div");
      root.className = "lh-seat" + (i === 0 ? " lh-hero" : "");
      root.style.setProperty("--sc", seat.color);
      const style = t.seats[i].persona.style;
      root.innerHTML = `
        <div class="lh-hole"></div>
        <div class="lh-av"><img src="${personImage(seat.id)}" alt=""/><svg class="lh-ring" viewBox="0 0 100 100"><circle class="lh-track" cx="50" cy="50" r="47"/><circle class="lh-timer" cx="50" cy="50" r="47" pathLength="100"/></svg></div>
        <div class="lh-plate"><span class="lh-line1"><b class="lh-name">${esc(i === 0 ? T("You", "你") : seat.name)}</b><b class="lh-word"></b></span><span class="lh-stack">0</span></div>
        <div class="lh-handname"></div>
        <div class="lh-odds"></div>
        <div class="lh-gain"></div>
        <div class="lh-bubble"></div>`;
      root.title = i === 0 ? T("You", "你") : `${seat.name}`;
      if (i > 0) root.dataset.style = style;
      this.stage.insertBefore(root, this.fx);
      const bet = document.createElement("div");
      bet.className = "lh-bet";
      this.stage.insertBefore(bet, this.dealerEl);
      const q = <E extends Element>(s: string) => root.querySelector(s) as E;
      // the portrait may only be painted in a moment: ask again
      const img = q<HTMLImageElement>("img");
      const again = window.setTimeout(() => {
        const src = personImage(seat.id);
        if (src && src !== img.src) img.src = src;
      }, 1500);
      this.timers.add(again);
      return {
        root,
        av: q(".lh-av"),
        ring: q(".lh-timer"),
        name: q(".lh-name"),
        act: q(".lh-word"),
        stack: q(".lh-stack"),
        hole: q(".lh-hole"),
        cards: [],
        bubble: q(".lh-bubble"),
        hand: q(".lh-handname"),
        odds: q(".lh-odds"),
        gain: q(".lh-gain"),
        bet,
      };
    });
    this.renderStacks();
  }

  private chipsLabel(v: number) {
    return this.format === "cash" && this.o.stake > 0 ? `ⓩ ${num(v)}` : num(v);
  }

  private renderStacks() {
    const t = this.table!;
    const h = this.hand;
    this.seatEls.forEach((s, i) => {
      const stack = h && h.players[i].inHand ? h.players[i].stack : t.seats[i].stack;
      const out = t.seats[i].out;
      const allIn = !!h && h.players[i].allIn && !h.players[i].folded;
      s.stack.textContent = out ? T("Out", "出局") : stack <= 0 && allIn ? T("All in", "全下") : this.chipsLabel(stack);
      s.root.classList.toggle("lh-out", out);
      // (out of the Sit & Go: the name comes back over "Out")
      if (out && !h?.players[i].inHand) s.root.classList.remove("lh-did");
      s.root.classList.toggle("lh-allin", allIn);
    });
  }

  private renderInfo() {
    const t = this.table!;
    const { sb, bb } = t.blinds();
    const sep = `<i class="lh-dot"></i>`;
    let line = "";
    const small = this.portrait;
    const q = this.o.stake > 0 && this.format === "cash" ? "ⓩ " : "";
    if (this.format === "cash") line = `<b>${T("Cash", "现金桌")}</b>${sep}<span>${small ? "" : T("Blinds ", "盲注 ")}${q}${num(sb)}/${num(bb)}</span>`;
    else {
      const k = t.handsToNextLevel();
      line = small
        ? `<b>${this.format === "turbo" ? T("Turbo", "快速") : "S&G"}</b>${sep}<span>${num(sb)}/${num(bb)}</span>${sep}<span class="lh-up">${T(`up in ${k}`, `${k} 手升盲`)}</span>`
        : `<b>${this.format === "turbo" ? T("Turbo Sit & Go", "快速赛") : "Sit & Go"}</b>${sep}<span>${T("Level", "级别")} ${t.level + 1} · ${num(sb)}/${num(bb)}</span>${sep}<span class="lh-up">${T(`up in ${k}`, `${k} 手后升盲`)}</span>`;
    }
    this.info.innerHTML = `${line}${sep}<i>#${Math.max(1, t.handNo)}</i>`;
    const seed = this.root.querySelector(".lh-seed") as HTMLElement;
    seed.textContent = `${this.o.seedNote ? this.o.seedNote + " · " : ""}${T("deck", "牌组")} #${t.handNo}`;
  }

  /** The session: hand after hand until it ends. */
  private async run(): Promise<void> {
    try {
      const t = this.table!;
      await this.wait(this.fast ? 0 : 300);
      for (;;) {
        if (this.leaving) return;
        await this.playHand();
        this.handsPlayed++;
        const after = t.finishHand();
        this.hand = null;
        await this.afterHand(after);
        if (after.over) return this.gameOver();
        if (this.format === "cash" && this.auto && this.handsPlayed >= Number(new URLSearchParams(location.search).get("hands") ?? 30)) return this.cashOut();
        if (this.format !== "cash" && t.seats[0].out && !this.watching) return this.humanOut();
      }
    } catch (e) {
      if (e !== CLOSED) throw e;
    }
  }

  // ---- one hand ------------------------------------------------------------------------------

  private async playHand() {
    const t = this.table!;
    const h = t.newHand();
    this.hand = h;
    this.cur = { no: t.handNo, head: `#${t.handNo} · ${T("blinds", "盲注")} ${num(h.sb)}/${num(h.bb)} · ${T("button", "庄位")} ${this.nameOf(h.button)}`, lines: [] };
    this.history.unshift(this.cur);
    if (this.history.length > 30) this.history.pop();
    this.showWish = new Array(t.n).fill(false);
    h.showPolicy = (s) => this.showWish[s];
    h.showUncontested = (s) => this.showWish[s];
    this.renderInfo();
    this.clearTable();
    this.renderStacks();
    // the button moves while the dealer riffles the deck
    this.dealerEl.classList.add("on");
    await Promise.all([this.movePuck(h.button), this.shuffle()]);
    await this.play(h.drain());
    while (h.phase !== "done") {
      if (h.phase === "bet") {
        const seat = h.toAct;
        const a = seat === 0 && !this.auto && !this.leaving ? await this.human(h) : await this.aiTurn(seat);
        await this.play(h.act(a));
      } else {
        await this.beforeStep(h);
        await this.play(h.step());
      }
    }
    this.renderLog();
  }

  /** The dealer puck slides round to its new seat. */
  private async movePuck(seat: number) {
    const el = this.dealerEl;
    const p = this.btnPos[seat];
    const k = this.k();
    const x0 = parseFloat(el.style.left || "0"),
      y0 = parseFloat(el.style.top || "0");
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    if (!k || !(x0 || y0) || Math.hypot(x0 - p.x, y0 - p.y) < 2) return;
    snd.puck(this.panOf(p.x));
    // a curve through the felt's side of the straight line
    const mx = (x0 + p.x) / 2,
      my = (y0 + p.y) / 2;
    const bx = (this.center.x - mx) * 0.25,
      by = (this.center.y - my) * 0.25;
    await el
      .animate(
        [
          { transform: `translate(calc(-50% + ${x0 - p.x}px), calc(-50% + ${y0 - p.y}px)) rotate(0deg)` },
          { transform: `translate(calc(-50% + ${mx + bx - p.x}px), calc(-50% + ${my + by - p.y}px)) rotate(-14deg)`, offset: 0.5 },
          { transform: "translate(-50%, -50%) rotate(0deg)" },
        ],
        { duration: 520 * k, easing: "cubic-bezier(.35,.1,.25,1)" },
      )
      .finished.catch(() => {});
  }

  /** The riffle: the deck splits in two halves that fall back together, then is squared. */
  private async shuffle() {
    const k = this.k();
    if (!k) return;
    snd.shuffle();
    const [a, b] = [...this.deckEl.querySelectorAll<HTMLElement>(".lh-half")];
    const cw = this.cw * 0.86;
    const half = (el: HTMLElement, dir: number) =>
      el
        .animate(
          [
            { transform: "none", opacity: 0 },
            { transform: `translate(${dir * cw * 0.62}px, -2px) rotate(${dir * 10}deg)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${dir * cw * 0.58}px, -4px) rotate(${dir * 6}deg) scaleY(0.96)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${dir * cw * 0.12}px, -2px) rotate(${dir * 2}deg)`, opacity: 1, offset: 0.62 },
            { transform: "translate(0, -3px) scaleY(1.03)", opacity: 1, offset: 0.78 },
            { transform: "none", opacity: 0 },
          ],
          { duration: 950 * k, easing: "ease-in-out" },
        )
        .finished.catch(() => {});
    await Promise.all([half(a, -1), half(b, 1)]);
  }

  /** Before the dealer's step: the show-or-muck wishes (yours asked, the snarks' by style). */
  private async beforeStep(h: Hand) {
    const live = h.live();
    const atShowdown = h.street === 3 && live.length > 1 && !h.players.some((p) => p.bet > 0);
    const uncontested = live.length === 1 && !h.players.some((p) => p.bet > 0);
    if (!atShowdown && !uncontested) return;
    for (const p of live) {
      if (p.seat === 0 && !this.auto) continue;
      const st = this.table!.seats[p.seat].persona.style;
      this.showWish[p.seat] = uncontested ? this.uiRnd() < (st === "maniac" ? 0.35 : st === "lag" ? 0.15 : 0.05) : this.uiRnd() < (st === "station" ? 0.25 : 0.08);
    }
    const me = h.players[0];
    if (this.auto || !me.inHand || me.folded || this.leaving) return;
    if (uncontested) this.showWish[0] = false;
    else if (!h.exposed && !h.mustShow(0)) this.showWish[0] = await this.askShow(T("You're beaten. Show or muck?", "你输了。亮牌还是盖牌？"));
  }

  private askShow(q: string): Promise<boolean> {
    return new Promise((res) => {
      this.bar.classList.remove("lh-myturn");
      this.bar.innerHTML = `<div class="lh-ask"><span>${q}</span><div class="lh-btns"><button class="lh-act fold" data-s="0"><b>${T("Muck", "盖牌")}</b><kbd>F</kbd></button><button class="lh-act call" data-s="1"><b>${T("Show", "亮牌")}</b><kbd>C</kbd></button></div><i class="lh-autobar"></i></div>`;
      const t = window.setTimeout(() => done(false), this.k() ? 5000 : 0);
      this.timers.add(t);
      const done = (v: boolean) => {
        window.clearTimeout(t);
        this.bar.onclick = null;
        this.showKeys = null;
        this.bar.innerHTML = "";
        res(v);
      };
      this.bar.onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-s]");
        if (b) done(b.dataset.s === "1");
      };
      this.showKeys = (k) => {
        if (k === "f") done(false);
        else if (k === "c" || k === "enter") done(true);
      };
    });
  }
  private showKeys: ((k: string) => void) | null = null;

  /** A zkSNARK's turn: it decides (from its view only), thinks a readable while, then acts. */
  private async aiTurn(seat: number): Promise<Action> {
    const t = this.table!;
    const d: Decision = t.decide();
    const per = t.seats[seat].persona;
    const L = this.hand!.legal();
    const big = L.toCall > (this.hand!.players[seat].stack + this.hand!.players[seat].bet) * 0.4 || (d.action.kind === "raise" && (d.action.to ?? 0) >= L.maxTo);
    let ms = 430 + 1350 * d.hard + (big ? 650 : 0);
    ms *= 0.8 + 0.4 * this.uiRnd() * (1.2 - per.skill * 0.6);
    if ((d.action.kind === "check" || d.action.kind === "fold") && d.hard < 0.3) ms *= 0.65;
    ms = Math.max(340, Math.min(3000, ms));
    const me = this.hand!.players[0];
    // you're out of this hand: the rivals get on with it
    if (!this.auto && (!me.inHand || me.folded)) ms *= 0.55;
    this.setActing(seat, ms);
    if (seat !== 0 || this.auto) this.idleBar(me.inHand && !me.folded && !me.allIn && !this.auto);
    if (big && d.hard > 0.6 && this.uiRnd() < 0.3) this.say(seat, "think");
    await this.wait(ms);
    this.setActing(-1, 0);
    return d.action;
  }

  /** The timer ring round the one to act: full, draining sage → flare → pink. */
  private setActing(seat: number, ms: number) {
    this.ringAnim?.cancel();
    this.ringAnim = null;
    this.seatEls.forEach((s, i) => s.root.classList.toggle("lh-acting", i === seat));
    if (seat < 0 || ms <= 0) return;
    const k = this.k();
    const c = this.seatEls[seat].ring;
    if (!k) return;
    this.ringAnim = c.animate(
      [
        { strokeDashoffset: "0", stroke: SAGE },
        { stroke: FLARE, offset: 0.6 },
        { strokeDashoffset: "100", stroke: PINK },
      ],
      { duration: ms * k, easing: "linear", fill: "forwards" },
    );
  }

  // ---- the human -----------------------------------------------------------------------------

  private human(h: Hand): Promise<Action> {
    const L = h.legal();
    // the pre-action: check if free, else fold
    if (this.preCheckFold) {
      this.preCheckFold = false;
      return Promise.resolve(L.canCheck ? { kind: "check" } : { kind: "fold" });
    }
    this.legal = L;
    this.setActing(-1, 0);
    this.seatEls[0].root.classList.add("lh-acting", "lh-you-turn");
    snd.turn();
    const pot = h.potTotal();
    // a sensible default size: 2.5 bb to open, 3x a raise, half the pot after the flop
    let def = L.isBet ? (h.street === 0 ? L.currentBet * 2.5 : pot * 0.5) : h.street === 0 ? L.currentBet * 3 : L.currentBet * 2.5 + (pot - L.currentBet) * 0.2;
    def = Math.max(L.minTo, Math.min(L.maxTo, Math.round(def)));
    this.raiseTo = def;
    // (a phone held upright opens it with a first tap on Raise; a tablet has the room to show it)
    this.sizerOpen = !this.portrait || this.tab;
    this.renderBar(h);
    this.updateHelper();
    return new Promise<Action>((res) => {
      this.humanResolve = (a) => {
        this.humanResolve = null;
        this.legal = null;
        this.seatEls[0].root.classList.remove("lh-acting", "lh-you-turn");
        this.bar.onclick = null;
        this.bar.innerHTML = "";
        this.bar.classList.remove("lh-myturn");
        this.fitSizer();
        res(a);
      };
    });
  }

  private preCheckFold = false;
  /** The bar while it is not your turn: only the Check/Fold pre-action, while you are in the hand. */
  private idleBar(pre = false) {
    if (this.legal || this.showKeys || this.closed) return;
    this.bar.classList.remove("lh-myturn");
    this.bar.onclick = null;
    if (!pre) {
      if (!this.showOffer) this.bar.innerHTML = "";
      return;
    }
    if (this.bar.querySelector(".lh-pre")) return;
    this.bar.innerHTML = `<div class="lh-idle"><label class="lh-pre ${this.preCheckFold ? "on" : ""}"><input type="checkbox" ${this.preCheckFold ? "checked" : ""}/><i></i>${T("Check / Fold", "过牌 / 弃牌")}</label></div>`;
    const cb = this.bar.querySelector<HTMLInputElement>(".lh-pre input");
    if (cb)
      cb.onchange = () => {
        this.preCheckFold = cb.checked;
        cb.parentElement!.classList.toggle("on", cb.checked);
        snd.ui();
      };
  }

  /** You took a pot nobody contested: show your cards if you like (for the table's eyes only). */
  private offerShow() {
    const h = this.hand;
    if (!h || this.auto) return;
    this.bar.innerHTML = `<div class="lh-idle"><span>${T("They folded. Show them what you had?", "他们弃牌了。要亮牌给他们看吗？")}</span><button class="lh-btn ghost small" data-sh="1">${T("Show cards", "亮牌")} <kbd>S</kbd></button></div>`;
    const cards = h.players[0].hole.slice();
    const show = () => {
      this.bar.innerHTML = "";
      this.showOffer = null;
      this.seatEls[0].root.classList.add("lh-shown");
      this.log(`${this.nameOf(0)} ${this.vb(0, "shows", "show", "亮出")} ${this.cardsText(cards)}`);
      snd.flip();
    };
    this.bar.onclick = (e) => {
      if ((e.target as HTMLElement).closest("[data-sh]")) show();
    };
    this.showOffer = show;
  }
  private showOffer: (() => void) | null = null;

  private presets(h: Hand, L: Legal): [string, number][] {
    const pot = h.potTotal();
    const clamp = (v: number) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(v)));
    // a fraction of the pot after calling
    const quick = (f: number) => clamp(L.currentBet + f * (pot + L.toCall));
    return h.street === 0 && !L.isBet && L.currentBet <= h.bb
      ? [
          ["2.5×", clamp(h.bb * 2.5)],
          ["3×", clamp(h.bb * 3)],
          [T("Pot", "底池"), quick(1)],
          [T("All in", "全下"), L.maxTo],
        ]
      : [
          ["½", quick(0.5)],
          ["¾", quick(0.75)],
          [T("Pot", "底池"), quick(1)],
          [T("All in", "全下"), L.maxTo],
        ];
  }

  private renderBar(h: Hand) {
    const L = this.legal;
    if (!L) return;
    const p = h.players[0];
    const callAll = L.toCall >= p.stack;
    const allin = this.raiseTo >= L.maxTo;
    const two = (small: string, big: string, key: string) => `<small>${small}</small><b>${big}</b><kbd>${key}</kbd>`;
    const call = L.toCall === 0 ? `<b>${T("Check", "过牌")}</b><kbd>C</kbd>` : two(callAll ? T("Call all in", "全下跟注") : T("Call", "跟注"), num(L.toCall), "C");
    const sizer = L.canRaise
      ? `<div class="lh-sizer ${this.sizerOpen ? "open" : ""}">
          <div class="lh-seg">${this.presets(h, L)
            .map(([lab, v], i) => `<button data-q="${v}" class="${v === this.raiseTo ? "on" : ""} ${i === 3 ? "lh-qall" : ""}">${lab}<kbd>${i + 1}</kbd></button>`)
            .join("")}${this.portrait && !this.tab ? `<button class="lh-shut" data-z="1" aria-label="${T("Back", "返回")}">✕</button>` : ""}</div>
          <div class="lh-slide"><button data-n="-1" aria-label="−">−</button><input type="range" min="${L.minTo}" max="${L.maxTo}" step="1" value="${this.raiseTo}"/><button data-n="1" aria-label="+">+</button></div>
        </div>`
      : "";
    this.bar.classList.add("lh-myturn");
    this.bar.innerHTML = `${sizer}<div class="lh-btns">
        <button class="lh-act fold ${L.toCall > 0 ? "" : "dim"}" data-a="fold"><b>${T("Fold", "弃牌")}</b><kbd>F</kbd></button>
        <button class="lh-act call ${L.toCall === 0 ? "check" : ""}" data-a="call">${call}</button>
        ${L.canRaise ? `<button class="lh-act raise ${allin ? "allin" : ""}" data-a="raise">${two(allin ? T("All in", "全下") : L.isBet ? T("Bet", "下注") : T("Raise to", "加注到"), num(allin ? L.maxTo : this.raiseTo), "R")}</button>` : ""}
      </div>`;
    const range = this.bar.querySelector<HTMLInputElement>("input[type=range]");
    range?.addEventListener("input", () => {
      this.raiseTo = Number(range.value);
      this.refreshRaise();
    });
    this.fillRange();
    this.fitSizer();
    this.bar.onclick = (e) => {
      const t = e.target as HTMLElement;
      const a = t.closest<HTMLElement>("[data-a]");
      if (a) return this.humanAct(a.dataset.a!);
      const qb = t.closest<HTMLElement>("[data-q]");
      if (qb) {
        snd.ui();
        this.raiseTo = Number(qb.dataset.q);
        this.refreshRaise();
        return;
      }
      const nb = t.closest<HTMLElement>("[data-n]");
      if (nb) this.nudge(Number(nb.dataset.n));
      // (an upright phone: the sizer's ✕ puts Fold and Call back)
      if (t.closest("[data-z]") && this.hand) {
        snd.ui();
        this.sizerOpen = false;
        this.renderBar(this.hand);
      }
    };
  }

  /**
   * An upright phone floats the sizer's presets over the foot of the table (holdem.css). On a short
   * screen they would cover your plate and your cards: the table slides up by that much while the
   * sizer is open, and back down when it closes.
   */
  private lift = 0;
  private fitSizer() {
    const seg = this.bar.querySelector<HTMLElement>(".lh-sizer.open .lh-seg");
    let lift = 0;
    if (seg && getComputedStyle(seg).position === "absolute") {
      const hero = this.seatEls[0];
      const parts = [hero.root.querySelector(".lh-plate"), ...hero.hole.children].filter((e): e is Element => !!e);
      // (measured where they stand unlifted)
      const low = Math.max(...parts.map((e) => e.getBoundingClientRect().bottom)) + this.lift;
      lift = Math.max(0, Math.ceil(low + 6 - seg.getBoundingClientRect().top));
    }
    if (lift === this.lift) return;
    this.lift = lift;
    this.stage.style.setProperty("--lift", `${lift}px`);
    this.stage.classList.toggle("lh-lifted", lift > 0);
  }

  /** The slider's filled part, up to the thumb. */
  private fillRange() {
    const L = this.legal;
    const r = this.bar.querySelector<HTMLInputElement>("input[type=range]");
    if (!L || !r) return;
    r.style.setProperty("--p", `${L.maxTo > L.minTo ? ((this.raiseTo - L.minTo) / (L.maxTo - L.minTo)) * 100 : 100}%`);
  }

  private refreshRaise() {
    const L = this.legal;
    if (!L) return;
    const allin = this.raiseTo >= L.maxTo;
    const b = this.bar.querySelector<HTMLElement>('[data-a="raise"]');
    if (b) {
      b.querySelector("small")!.textContent = allin ? T("All in", "全下") : L.isBet ? T("Bet", "下注") : T("Raise to", "加注到");
      b.querySelector("b")!.textContent = num(allin ? L.maxTo : this.raiseTo);
      b.classList.toggle("allin", allin);
    }
    const r = this.bar.querySelector<HTMLInputElement>("input[type=range]");
    if (r && Number(r.value) !== this.raiseTo) r.value = String(this.raiseTo);
    this.fillRange();
    this.bar.querySelectorAll<HTMLElement>("[data-q]").forEach((q) => q.classList.toggle("on", Number(q.dataset.q) === this.raiseTo));
  }

  private nudge(dir: number, big = false) {
    const L = this.legal;
    const h = this.hand;
    if (!L || !h || !L.canRaise) return;
    const step = big ? Math.max(h.bb, Math.round(h.potTotal() / 4 / h.bb) * h.bb) : h.bb;
    this.raiseTo = Math.max(L.minTo, Math.min(L.maxTo, this.raiseTo + dir * step));
    this.refreshRaise();
  }

  private humanAct(kind: string) {
    const L = this.legal;
    if (!L || !this.humanResolve) return;
    if (kind === "fold") {
      if (L.toCall === 0) {
        // folding for free: just check (and say so)
        this.toast(T("Nothing to call: checked instead.", "无需跟注：已改为过牌。"));
        return this.humanResolve({ kind: "check" });
      }
      return this.humanResolve({ kind: "fold" });
    }
    if (kind === "call") return this.humanResolve(L.toCall === 0 ? { kind: "check" } : { kind: "call" });
    if (kind === "raise" && L.canRaise) {
      if (this.portrait && !this.sizerOpen) {
        this.sizerOpen = true;
        this.renderBar(this.hand!);
        return;
      }
      return this.humanResolve({ kind: "raise", to: this.raiseTo });
    }
  }

  private key(e: KeyboardEvent) {
    if (this.closed) return;
    const k = e.key.toLowerCase();
    if ((e.target as HTMLElement).closest?.("input[type=text],textarea")) return;
    if (k === "escape") {
      e.preventDefault();
      e.stopPropagation();
      if (this.confirmResolve) return this.confirmResolve(false);
      if (this.endKeys) return this.endKeys();
      if (this.logEl.classList.contains("open")) return this.toggleLog();
      if (this.lobbyKeys) return this.exit({ order: this.o.seats.map((s) => s.seat), payout: this.o.stake, summary: "Left the Orchard Room before the first hand." });
      void this.askLeave();
      return;
    }
    if (this.confirmResolve) {
      if (k === "enter" || k === "y") {
        e.preventDefault();
        this.confirmResolve(true);
      }
      e.stopPropagation();
      return;
    }
    if (this.lobbyKeys) {
      if (this.lobbyKeys(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (this.endKeys) {
      if (k === "enter" || k === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.endKeys();
      }
      return;
    }
    if (this.showKeys) {
      if (k === "f" || k === "c" || k === "enter") {
        e.preventDefault();
        e.stopPropagation();
        this.showKeys(k);
      }
      return;
    }
    let used = true;
    if (k === "s" && this.showOffer) this.showOffer();
    else if (k === "tab") this.toggleFF();
    else if (k === "h") this.toggleHelper();
    else if (k === "l") this.toggleLog();
    else if (k === "m") this.toggleMusic();
    else if (this.legal) {
      if (k === "f") this.humanAct("fold");
      else if (k === "c" || k === " ") this.humanAct("call");
      else if (k === "r") this.humanAct("raise");
      else if (k === "enter") this.humanAct(this.legal.canRaise && (this.sizerOpen || !this.portrait) ? "raise" : "call");
      else if (k === "arrowright" || k === "arrowup") this.nudge(1, k === "arrowup");
      else if (k === "arrowleft" || k === "arrowdown") this.nudge(-1, k === "arrowdown");
      else if (k >= "1" && k <= "4") {
        const b = this.bar.querySelectorAll<HTMLElement>("[data-q]")[Number(k) - 1];
        if (b) b.click();
      } else used = false;
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  private endKeys: (() => void) | null = null;

  // ---- events → animation ----------------------------------------------------------------------

  private async play(evs: Ev[]) {
    const h = this.hand!;
    for (const e of evs) {
      switch (e.t) {
        case "post": {
          if (e.kind !== "ante") this.tag(e.seat, e.kind === "sb" ? T("Small blind", "小盲") : T("Big blind", "大盲"), "post");
          this.log(
            `${this.nameOf(e.seat)} ${e.kind === "sb" ? this.vb(e.seat, "posts the small blind", "post the small blind", "下小盲") : e.kind === "bb" ? this.vb(e.seat, "posts the big blind", "post the big blind", "下大盲") : this.vb(e.seat, "antes", "ante", "下前注")} ${num(e.amount)}${e.allIn ? T(" (all in)", "（全下）") : ""}`,
          );
          await this.betFly(e.seat, e.amount, h.players[e.seat].bet, 240, 2);
          this.renderStacks();
          break;
        }
        case "deal":
          await this.deal(e.order);
          break;
        case "act":
          await this.showAct(e.seat, e.said, e.to, e.add, e.allIn);
          break;
        case "return":
          this.log(`${T("Uncalled", "未被跟注的")} ${num(e.amount)} ${T("returned to", "退还给")} ${this.nameOf(e.seat)}`);
          await this.betBack(e.seat, e.amount);
          break;
        case "collect":
          await this.collect(e.pot);
          break;
        case "board":
          await this.boardOut(e.street, e.cards, h.exposed);
          break;
        case "expose":
          await this.expose(e.seats);
          break;
        case "show":
          await this.showHand(e.seat, e.cards, e.score);
          break;
        case "muck":
          this.log(`${this.nameOf(e.seat)} ${this.vb(e.seat, "mucks", "muck", "盖牌")}`);
          await this.muck(e.seat);
          break;
        case "award":
          await this.award(e.index, e.amount, e.shares, e.score);
          break;
        case "end":
          break;
      }
    }
    this.renderStacks();
    this.updateHelper();
    if (h.phase !== "bet" && !this.showOffer && !this.legal) {
      this.bar.innerHTML = "";
      this.bar.onclick = null;
    }
    if (h.phase === "bet" && h.toAct !== 0) {
      const me = h.players[0];
      this.idleBar(me.inHand && !me.folded && !me.allIn && !this.table!.seats[0].out && !this.auto);
    }
  }

  /** Two cards each, one at a time, from the deck; you squeeze yours up, the snarks peek at theirs. */
  private async deal(order: number[]) {
    const h = this.hand!;
    const k = this.k();
    const from = this.deckPos;
    for (let r = 0; r < 2; r++)
      for (const s of order) {
        const el = this.makeCard(-1);
        el.classList.add(s === 0 ? "lh-big" : "lh-small");
        const seat = this.seatEls[s];
        seat.hole.appendChild(el);
        seat.cards.push(el);
        el.style.rotate = `${(r ? 1 : -1) * (s === 0 ? 4 : 8)}deg`;
        if (k) {
          void this.flyFrom(el, from, 300, (r ? 1 : -1) * 160 - 20);
          snd.card(this.panOf(this.seatPos[s].x));
          await this.wait(72);
        }
      }
    await this.wait(300);
    // the snarks lift a corner to look
    if (k)
      for (const s of order) {
        if (s === 0) continue;
        const hole = this.seatEls[s].hole;
        const d = this.uiRnd() * 500;
        hole.animate([{ transform: "translate(-50%, -50%)" }, { transform: "translate(-50%, calc(-50% - 5px)) rotateX(28deg)", offset: 0.4 }, { transform: "translate(-50%, -50%)" }], {
          duration: 520 * k,
          delay: d * k,
          easing: "ease-in-out",
        });
      }
    const me = this.seatEls[0];
    if (h.players[0].inHand && me.cards.length === 2) {
      h.players[0].hole.forEach((c, i) => this.setFace(me.cards[i], c));
      if (k) {
        snd.flip(this.panOf(this.seatPos[0].x));
        void this.turnUp(me.cards[0], 560, "squeeze");
        await this.wait(150);
        snd.flip(this.panOf(this.seatPos[0].x));
        await this.turnUp(me.cards[1], 560, "squeeze");
      } else me.cards.forEach((c) => c.classList.add("up"));
    }
    await this.wait(160);
    this.updateHelper();
  }

  /** A card (already in its place) flies in from a point of the stage, spinning a little. */
  private flyFrom(el: HTMLElement, from: P2, ms: number, spin = 0, settle = true) {
    const k = this.k();
    if (!k) return Promise.resolve();
    const r = el.getBoundingClientRect();
    const st = this.stage.getBoundingClientRect();
    const dx = from.x - (r.left - st.left + r.width / 2),
      dy = from.y - (r.top - st.top + r.height / 2);
    const kf: Keyframe[] = [
      { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(0.86)`, boxShadow: "0 1px 2px rgba(0,0,0,0.4)" },
      { transform: `translate(${dx * 0.08}px, ${dy * 0.08}px) rotate(${spin * 0.04}deg) scale(1.02)`, offset: 0.82 },
      { transform: "none" },
    ];
    if (!settle) kf.splice(1, 1);
    return el.animate(kf, { duration: ms * k, easing: "cubic-bezier(.12,.7,.3,1)", fill: "backwards" }).finished.catch(() => {});
  }

  /** Turns a face-down card over: a crisp flip, or your squeeze (a corner lifted, a look, then over). */
  private async turnUp(el: HTMLElement, ms: number, how: "flip" | "squeeze" | "slow" = "flip") {
    el.classList.add("up");
    const k = this.k();
    const f = el.querySelector<HTMLElement>(".lh-flip");
    if (!k || !f) return;
    const kf: Keyframe[] =
      how === "squeeze"
        ? [
            { transform: "rotateY(0deg)" },
            { transform: "rotateX(16deg) rotateY(-10deg) translateZ(4px)", offset: 0.25 },
            { transform: "rotateX(22deg) rotateY(-30deg) translateZ(10px)", offset: 0.5 },
            { transform: "rotateX(8deg) rotateY(-120deg) translateZ(14px)", offset: 0.78 },
            { transform: "rotateY(-180deg)" },
          ]
        : how === "slow"
          ? [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-38deg) translateZ(8px)", offset: 0.5 }, { transform: "rotateY(-180deg)" }]
          : [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-90deg) translateZ(12px)", offset: 0.5 }, { transform: "rotateY(-180deg)" }];
    await f.animate(kf, { duration: ms * k, easing: how === "flip" ? "cubic-bezier(.3,.6,.3,1)" : "ease-in-out" }).finished.catch(() => {});
  }

  private async showAct(seat: number, said: string, to: number, add: number, allIn: boolean) {
    const name = this.nameOf(seat);
    const words: Record<string, [string, string]> = {
      fold: [T("Fold", "弃牌"), "fold"],
      check: [T("Check", "过牌"), "check"],
      call: [`${T("Call", "跟注")} ${num(add)}`, "call"],
      bet: [`${T("Bet", "下注")} ${num(to)}`, "bet"],
      raise: [`${T("Raise", "加注")} ${num(to)}`, "raise"],
    };
    let [label, cls] = words[said];
    if (allIn) {
      label = T("All in", "全下");
      cls = "allin";
    }
    this.tag(seat, label, cls);
    const logLine: Record<string, string> = {
      fold: this.vb(seat, "folds", "fold", "弃牌"),
      check: this.vb(seat, "checks", "check", "过牌"),
      call: `${this.vb(seat, "calls", "call", "跟注")} ${num(add)}`,
      bet: `${this.vb(seat, "bets", "bet", "下注")} ${num(to)}`,
      raise: `${this.vb(seat, "raises to", "raise to", "加注到")} ${num(to)}`,
    };
    this.log(`${name} ${logLine[said]}${allIn ? this.vb(seat, " and is all in", " and are all in", "，全下") : ""}`);
    const pan = this.panOf(this.seatPos[seat].x);
    if (said === "fold") {
      snd.fold(pan);
      await this.muck(seat);
      this.seatEls[seat].root.classList.add("lh-folded");
      if (seat !== 0 && this.uiRnd() < 0.05) this.say(seat, "fold");
    } else if (said === "check") {
      snd.check(pan);
      this.knock(seat);
      await this.wait(300);
    } else {
      if (allIn) {
        snd.allin(pan);
        this.seatEls[seat].root.classList.add("lh-allin");
        if (seat !== 0 && this.uiRnd() < 0.45) this.say(seat, "allin");
      }
      await this.betFly(seat, add, to, allIn ? 380 : 300, allIn ? -1 : add / Math.max(1, this.hand!.bb));
    }
    this.renderStacks();
  }

  /** The two raps of a check, seen: the plate jolts. */
  private knock(seat: number) {
    if (!this.k()) return;
    this.seatEls[seat].av.animate(
      [{ transform: "none" }, { transform: "translateY(2px) scale(0.97)", offset: 0.15 }, { transform: "none", offset: 0.35 }, { transform: "translateY(2px) scale(0.98)", offset: 0.5 }, { transform: "none" }],
      { duration: 300 },
    );
  }

  /**
   * Chips (`add` of them) slide from a seat to its bet spot and land on the pile there; the spot then
   * shows the new total. `bbs`: the bet in big blinds, for the clack (-1: no sound, the all-in has its own).
   */
  private async betFly(seat: number, add: number, total: number, ms: number, bbs: number) {
    const k = this.k();
    if (k && add > 0) {
      const pile = this.flyPile(add, 2);
      const a = this.seatPos[seat],
        b = this.betPos[seat];
      const lift = Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
      if (bbs >= 0) snd.bet(bbs, this.panOf(b.x));
      await pile
        .animate(
          [
            { transform: `translate(${a.x}px, ${a.y}px) scale(0.85)`, opacity: 0 },
            { transform: `translate(${a.x + (b.x - a.x) * 0.15}px, ${a.y + (b.y - a.y) * 0.15}px) scale(0.92)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${(a.x + b.x) / 2}px, ${(a.y + b.y) / 2 - lift}px) scale(1.04)`, offset: 0.55 },
            { transform: `translate(${b.x}px, ${b.y}px) scale(1)`, opacity: 1 },
          ],
          { duration: ms * k, easing: "cubic-bezier(.3,.6,.25,1)" },
        )
        .finished.catch(() => {});
      pile.remove();
    } else if (add > 0 && bbs >= 0 && !this.fast) snd.chips(2, this.panOf(this.betPos[seat].x));
    this.setBet(seat, total);
  }

  /** A pile of chips in the effects layer (for a flight). */
  private flyPile(amount: number, cols: number) {
    const pile = document.createElement("div");
    pile.className = "lh-fly";
    pile.innerHTML = `<div class="lh-flyc">${pileSvg(Math.max(1, amount), cols)}</div>`;
    this.fx.appendChild(pile);
    return pile;
  }

  /** The bets as shown in front of the seats (the hand's state may already be a step ahead). */
  private shownBet: number[] = [];
  private setBet(seat: number, total: number) {
    this.shownBet[seat] = Math.max(0, total);
    const el = this.seatEls[seat].bet;
    if (total <= 0) {
      el.innerHTML = "";
      el.classList.remove("on");
      return;
    }
    el.innerHTML = `${pileSvg(total, 3)}<b>${num(total)}</b>`;
    el.classList.add("on");
  }

  private async betBack(seat: number, amount: number) {
    const k = this.k();
    const left = (this.shownBet[seat] ?? 0) - amount;
    if (k) {
      const pile = this.flyPile(amount, 2);
      const a = this.betPos[seat],
        b = this.seatPos[seat];
      this.setBet(seat, left);
      await pile
        .animate([{ transform: `translate(${a.x}px, ${a.y}px)` }, { transform: `translate(${b.x}px, ${b.y}px) scale(0.8)`, opacity: 0 }], { duration: 340 * k, easing: "cubic-bezier(.4,0,.6,1)" })
        .finished.catch(() => {});
      pile.remove();
    } else this.setBet(seat, left);
    this.renderStacks();
  }

  /** The street is over: every bet is swept into the pot, the action words cleared. */
  private async collect(pot: number) {
    const k = this.k();
    const flights: Promise<unknown>[] = [];
    const target = this.potXY();
    this.seatEls.forEach((s, i) => {
      if (!s.bet.classList.contains("on")) return;
      if (k) {
        const pile = this.flyPile(this.shownBet[i] ?? 0, 2);
        const a = this.betPos[i];
        flights.push(
          pile
            .animate([{ transform: `translate(${a.x}px, ${a.y}px)` }, { transform: `translate(${target.x}px, ${target.y}px) scale(0.9)`, opacity: 0.85 }], {
              duration: 420 * k,
              easing: "cubic-bezier(.45,0,.25,1)",
              delay: i * 18 * k,
            })
            .finished.catch(() => {})
            .then(() => pile.remove()),
        );
      }
      this.setBet(i, 0);
    });
    if (flights.length && k) snd.sweep();
    await Promise.all(flights);
    this.setPot(pot);
    this.renderPots();
    this.clearActs();
    await this.wait(140);
  }

  /** Where the pot's pile sits (above the board's middle). */
  private potXY(): P2 {
    return { x: this.potX, y: this.center.y - this.cw * 0.7 - (this.portrait ? 22 : 30) };
  }

  private setPot(v: number) {
    this.potEl.querySelector(".lh-plabel b")!.textContent = this.chipsLabel(v);
    const pp = this.potEl.querySelector<HTMLElement>(".lh-ppile")!;
    pp.innerHTML = pileSvg(v, 4, 9);
    // the label just right of the pile, however wide it is
    const pw = v > 0 ? (pp.firstElementChild?.getBoundingClientRect().width ?? 0) : 0;
    this.potEl.style.setProperty("--pw", `${pw}px`);
    this.potEl.classList.toggle("on", v > 0);
    this.bigPot = Math.max(this.bigPot, v);
  }

  private renderPots() {
    const h = this.hand;
    if (!h) return (this.potsEl.innerHTML = "");
    const pots = h.pots();
    if (pots.length < 2) return (this.potsEl.innerHTML = "");
    this.potsEl.innerHTML = pots.map((p, i) => `<span>${i === 0 ? T("Main", "主池") : `${T("Side", "边池")} ${i}`} <b>${num(p.amount)}</b></span>`).join("");
  }

  /**
   * A street from the deck: a card burnt first; the flop lands as a stack on the first spot, turns
   * over together and is spread; the turn and the river slide out and turn. On an all-in, with suspense.
   */
  private async boardOut(street: number, cards: number[], suspense: boolean) {
    const k = this.k();
    const names = ["", T("Flop", "翻牌"), T("Turn", "转牌"), T("River", "河牌")];
    this.log(`<em>${names[street]}</em> ${this.cardsText(this.hand!.board)}`);
    if (k) await this.burn();
    if (suspense && street >= 2 && k) {
      snd.drumroll(street === 3 ? 1.5 : 1);
      this.stage.classList.add("lh-tense");
      await this.wait(street === 3 ? 1500 : 1000);
    }
    const startIdx = this.boardCards.length;
    const els: HTMLElement[] = [];
    for (let i = 0; i < cards.length; i++) {
      const el = this.makeCard(cards[i]);
      el.classList.add("lh-boardcard");
      this.slots[startIdx + i].appendChild(el);
      this.boardCards.push(el);
      els.push(el);
    }
    if (!k) {
      for (const el of els) el.classList.add("up");
      this.stage.classList.remove("lh-tense");
      if (this.hand!.exposed) this.updateOdds();
      return;
    }
    const gap = this.slots[1].offsetLeft - this.slots[0].offsetLeft;
    const pan = this.panOf(this.center.x);
    if (street === 1) {
      // three down in a stack on the first spot…
      const spot = this.slots[startIdx];
      for (let i = 0; i < 3; i++) {
        const el = els[i];
        spot.appendChild(el);
        el.style.translate = `0 ${-i * 1.5}px`;
        void this.flyFrom(el, this.deckPos, 300, -12, false);
        snd.card(pan);
        await this.wait(90);
      }
      await this.wait(330);
      // …turned over together…
      snd.flip(pan);
      snd.flip(pan, 0.03);
      await Promise.all(els.map((el) => this.turnUp(el, 420)));
      await this.wait(90);
      // …and spread
      snd.card(pan);
      await Promise.all(
        els.slice(1).map((el, j) => {
          this.slots[startIdx + j + 1].appendChild(el);
          el.style.translate = "";
          return el.animate([{ transform: `translate(${-gap * (j + 1)}px, ${-(j + 1) * 1.5}px)` }, { transform: "none" }], { duration: 300 * k, easing: "cubic-bezier(.2,.7,.2,1)" }).finished.catch(() => {});
        }),
      );
    } else {
      for (const el of els) {
        snd.card(pan);
        await this.flyFrom(el, this.deckPos, 320, -10);
        await this.wait(suspense ? 260 : 120);
        snd.flip(pan);
        await this.turnUp(el, suspense && street === 3 ? 1150 : suspense ? 640 : 380, suspense ? "slow" : "flip");
      }
    }
    this.stage.classList.remove("lh-tense");
    if (this.hand!.exposed) this.updateOdds();
    await this.wait(street === 1 ? 260 : 180);
  }

  /** A card off the top, face down, onto the burn pile under the deck's corner. */
  private async burn() {
    const el = document.createElement("i");
    el.style.rotate = `${-18 + this.uiRnd() * 36}deg`;
    el.style.translate = `${(this.uiRnd() - 0.5) * 6}px ${(this.uiRnd() - 0.5) * 6}px`;
    this.burnEl.appendChild(el);
    snd.card(this.panOf(this.deckPos.x));
    await el
      .animate(
        [
          { transform: "translate(18px, -6px) rotate(-10deg)", opacity: 0.6 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 220 * this.k(), easing: "ease-out" },
      )
      .finished.catch(() => {});
  }

  /** All in with nobody left to bet: every hand face up, and the odds as the board runs out. */
  private async expose(seats: number[]) {
    const h = this.hand!;
    this.flash(T("All in", "全下"), T("Hands face up · the board runs out", "亮牌 · 发完公共牌"), "allin");
    for (const s of seats) {
      const el = this.seatEls[s];
      h.players[s].hole.forEach((c, i) => this.setFace(el.cards[i], c));
      el.root.classList.add("lh-shown");
      snd.flip(this.panOf(this.seatPos[s].x));
      await Promise.all(el.cards.map((c) => (c.classList.contains("up") ? Promise.resolve() : this.turnUp(c, 380))));
      await this.wait(120);
    }
    this.log(T("All in: hands tabled", "全下：亮牌") + " · " + seats.map((s) => `${this.nameOf(s)} ${this.cardsText(h.players[s].hole)}`).join(" · "));
    this.updateOdds();
    await this.wait(900);
  }

  /** Each tabled hand's chance to win from here (exact for one card to come). */
  private updateOdds() {
    const h = this.hand!;
    const live = h.live();
    if (h.board.length >= 5) {
      this.seatEls.forEach((s) => s.odds.classList.remove("on"));
      return;
    }
    const wins = new Array(h.n).fill(0);
    const known = new Set<number>([...h.board, ...live.flatMap((p) => p.hole)]);
    const rest: number[] = [];
    for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
    const need = 5 - h.board.length;
    const rnd = mulberry(mix(this.o.seed, h.board.length * 977 + this.table!.handNo));
    const runs = need === 1 ? rest.length : need === 2 ? (rest.length * (rest.length - 1)) / 2 : 1800;
    const board = h.board.slice();
    const tally = (b: number[]) => {
      let best = -1;
      const sc = live.map((p) => evaluate([...p.hole, ...b]));
      for (const v of sc) best = Math.max(best, v);
      const w = live.filter((_, i) => sc[i] === best);
      for (const p of w) wins[p.seat] += 1 / w.length;
    };
    if (need === 1) for (const c of rest) tally([...board, c]);
    else if (need === 2) for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) tally([...board, rest[i], rest[j]]);
    else
      for (let r = 0; r < runs; r++) {
        const pick = rest.slice();
        const b = board.slice();
        for (let k = 0; k < need; k++) b.push(pick.splice(Math.floor(rnd() * pick.length), 1)[0]);
        tally(b);
      }
    for (const p of live) {
      const el = this.seatEls[p.seat].odds;
      const pct = Math.round((wins[p.seat] / runs) * 100);
      el.innerHTML = `<b>${pct}</b><small>%</small>`;
      el.style.setProperty("--q", String(pct / 100));
      el.classList.add("on");
    }
  }

  private async showHand(seat: number, cards: number[], score: number) {
    const el = this.seatEls[seat];
    cards.forEach((c, i) => this.setFace(el.cards[i], c));
    const already = el.root.classList.contains("lh-shown");
    el.root.classList.add("lh-shown");
    if (!already || seat === 0) snd.flip(this.panOf(this.seatPos[seat].x));
    await Promise.all(el.cards.map((c) => (c.classList.contains("up") ? Promise.resolve() : this.turnUp(c, 380))));
    if (score >= 0) {
      const d = describe(score);
      el.hand.textContent = T(d.en, d.zh);
      el.hand.classList.add("on");
      this.log(`${this.nameOf(seat)} ${this.vb(seat, "shows", "show", "亮出")} ${this.cardsText(cards)} · ${T(d.en, d.zh)}`);
    } else this.log(`${this.nameOf(seat)} ${this.vb(seat, "shows", "show", "亮出")} ${this.cardsText(cards)}`);
    this.seatEls.forEach((s) => s.odds.classList.remove("on"));
    await this.wait(already ? 200 : 600);
  }

  /** A seat's cards slid face down into the muck (toward the deck). */
  private async muck(seat: number) {
    const el = this.seatEls[seat];
    const k = this.k();
    const cards = el.cards.splice(0);
    if (!cards.length) return;
    if (k) {
      await Promise.all(
        cards.map((c, i) => {
          const r = c.getBoundingClientRect();
          const st = this.stage.getBoundingClientRect();
          const tx = this.deckPos.x + 8 + i * 4 - (r.left - st.left + r.width / 2),
            ty = this.deckPos.y + 10 - (r.top - st.top + r.height / 2);
          // (a shown card goes back face down first)
          if (c.classList.contains("up")) c.querySelector<HTMLElement>(".lh-flip")!.animate([{ transform: "rotateY(-180deg)" }, { transform: "rotateY(0deg)" }], { duration: 160 * k, fill: "forwards" });
          return c
            .animate(
              [
                { transform: "none", opacity: 1 },
                { transform: `translate(${tx * 0.85}px, ${ty * 0.85}px) rotate(${i ? 24 : -16}deg) scale(0.7)`, opacity: 0.9, offset: 0.85 },
                { transform: `translate(${tx}px, ${ty}px) rotate(${i ? 30 : -20}deg) scale(0.6)`, opacity: 0 },
              ],
              { duration: 360 * k, easing: "cubic-bezier(.5,0,.6,1)", fill: "forwards" },
            )
            .finished.catch(() => {});
        }),
      );
    }
    for (const c of cards) c.remove();
  }

  /** A pot to its winner(s): the hand named, the best five lit, the pile pushed over (split visibly). */
  private async award(index: number, amount: number, shares: { seat: number; amount: number }[], score: number) {
    const h = this.hand!;
    const k = this.k();
    const pots = h.pots().length;
    const label = index === 0 ? (pots > 1 || index > 0 ? T("Main pot", "主池") : T("Pot", "底池")) : `${T("Side pot", "边池")} ${index}`;
    const who = shares.map((s) => this.nameOf(s.seat)).join(" & ");
    const wins = shares.length === 1 && shares[0].seat === 0 ? T("win", "赢得") : T("wins", "赢得");
    const bbs = amount / Math.max(1, h.bb);
    if (score >= 0) {
      const c = catName(score);
      const d = describe(score);
      const sub = shares.length > 1 ? `${T("Split", "平分")} · ${who} · ${num(amount)}` : `${who} ${wins} ${num(amount)}${pots > 1 ? ` · ${label}` : ""}`;
      this.flash(T(c.en, c.zh), `${T(d.en, d.zh)} · ${sub}`, score >> 20 >= 6 ? "big" : "");
      // the best five, lit
      const w = h.players[shares[0].seat];
      const five = new Set(bestFive([...w.hole, ...h.board]));
      this.boardCards.forEach((el) => el.classList.toggle("lit", five.has(Number(el.dataset.c))));
      this.boardCards.forEach((el) => el.classList.toggle("dim", !five.has(Number(el.dataset.c))));
      for (const s of shares) this.seatEls[s.seat].cards.forEach((el) => el.classList.toggle("lit", five.has(Number(el.dataset.c)) || shares.length > 1));
    } else {
      this.flash(T("Takes it", "收下底池"), `${who} · ${num(amount)}`, "");
      if (shares[0].seat === 0 && !h.players[0].shown) this.offerShow();
    }
    this.log(`<b>${who}</b> ${shares.length > 1 ? T("split", "平分") : wins} ${T(label.toLowerCase(), label)} ${num(amount)}${shares.length > 1 ? ` (${shares.map((s) => num(s.amount)).join(" + ")})` : ""}`);
    for (const s of shares) this.seatEls[s.seat].root.classList.add("lh-winner");
    const mine = shares.some((s) => s.seat === 0);
    if (mine && !this.auto) snd.win(bbs > 40);
    else if (!mine && !this.auto && score >= 0 && h.players[0].inHand && !h.players[0].folded && bbs > 25) snd.lose();
    await this.wait(score >= 0 ? 700 : 300);
    // the pile is pushed over: one per winner
    const from = this.potXY();
    const flights = shares.map((s, i) => {
      if (!k) return Promise.resolve();
      const pile = this.flyPile(s.amount, 3);
      const to = this.seatPos[s.seat];
      snd.pot(s.amount / Math.max(1, h.bb), this.panOf(to.x));
      return pile
        .animate(
          [
            { transform: `translate(${from.x}px, ${from.y}px)` },
            { transform: `translate(${from.x + (to.x - from.x) * 0.55}px, ${from.y + (to.y - from.y) * 0.55 - 18}px) scale(1.06)`, offset: 0.55 },
            { transform: `translate(${to.x}px, ${to.y - this.av * 0.1}px) scale(0.86)`, opacity: 1, offset: 0.9 },
            { transform: `translate(${to.x}px, ${to.y}px) scale(0.8)`, opacity: 0 },
          ],
          { duration: 720 * k, easing: "cubic-bezier(.4,0,.25,1)", delay: i * 120 * k },
        )
        .finished.catch(() => {})
        .then(() => pile.remove());
    });
    const remaining = h
      .pots()
      .slice(index + 1)
      .reduce((a, p) => a + p.amount, 0);
    this.setPot(index === 0 && pots <= 1 ? 0 : remaining);
    await Promise.all(flights);
    // the gains, on the stacks
    for (const s of shares) this.gain(s.seat, s.amount);
    this.renderStacks();
    if (amount > this.hand!.bb * 30) {
      const winSeat = shares[0].seat;
      if (winSeat !== 0 && this.uiRnd() < 0.35) this.say(winSeat, h.players[winSeat].shown && score < 0 && this.uiRnd() < 0.5 ? "bluff" : "win");
      const loser = h.live().find((p) => !shares.some((s) => s.seat === p.seat) && p.seat !== 0);
      if (loser && this.uiRnd() < 0.25) this.say(loser.seat, "lose");
    }
    this.cur?.lines.push("");
    await this.wait(score >= 0 ? 1100 : 650);
  }

  /** "+240" rising off a winner's plate. */
  private gain(seat: number, amount: number) {
    const el = this.seatEls[seat].gain;
    el.textContent = `+${num(amount)}`;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
  }

  private flash(big: string, small: string, cls: string) {
    this.banner.className = `lh-banner on ${cls}`;
    this.banner.innerHTML = `<b>${esc(big)}</b><span>${esc(small)}</span>`;
    const t = window.setTimeout(() => this.banner.classList.remove("on"), Math.max(1200, 2400 * this.k()));
    this.timers.add(t);
  }

  private clearTable() {
    for (const s of this.seatEls) {
      for (const c of s.cards) c.remove();
      s.cards = [];
      s.hole.innerHTML = "";
      s.root.classList.remove("lh-folded", "lh-shown", "lh-winner", "lh-allin", "lh-acting");
      s.hand.classList.remove("on");
      s.odds.classList.remove("on");
      s.gain.classList.remove("on");
      s.root.classList.remove("lh-did");
      s.act.className = "lh-word";
      this.setBet(this.seatEls.indexOf(s), 0);
    }
    for (const c of this.boardCards) c.remove();
    this.boardCards = [];
    this.burnEl.innerHTML = "";
    this.showOffer = null;
    if (!this.legal && !this.showKeys) {
      this.bar.innerHTML = "";
      this.bar.onclick = null;
    }
    this.setPot(0);
    this.potsEl.innerHTML = "";
    this.banner.classList.remove("on");
  }

  // ---- after a hand ----------------------------------------------------------------------------

  private async afterHand(a: { busted: number[]; rebuys: { seat: number; amount: number }[]; levelUp: boolean; over: boolean }) {
    const t = this.table!;
    await this.wait(700);
    // the dealer gathers the cards back to the deck
    const k = this.k();
    const all = [...this.boardCards, ...this.seatEls.flatMap((s) => s.cards), ...this.burnEl.children];
    if (k && all.length) {
      snd.fold(0);
      const st = this.stage.getBoundingClientRect();
      await Promise.all(
        all.map((c, i) => {
          const r = c.getBoundingClientRect();
          const tx = this.deckPos.x - (r.left - st.left + r.width / 2),
            ty = this.deckPos.y - (r.top - st.top + r.height / 2);
          return c
            .animate(
              [
                { transform: "none", opacity: 1 },
                { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 0 },
              ],
              { duration: 380 * k, delay: i * 14 * k, easing: "cubic-bezier(.5,0,.5,1)", fill: "forwards" },
            )
            .finished.catch(() => {});
        }),
      );
    }
    // (what was said about the hand goes with the cards)
    for (const s of this.seatEls) {
      s.hand.classList.remove("on");
      s.odds.classList.remove("on");
    }
    this.potsEl.innerHTML = "";
    for (const s of a.busted) {
      if (this.format === "cash") {
        if (s !== 0) this.log(`${this.nameOf(s)} ${T("busts and rebuys", "输光后重新买入")} ${this.chipsLabel(cashBlinds(this.o.stake).buyin)}`);
      } else {
        const place = t.seats[s].place;
        this.log(`<b>${this.nameOf(s)}</b> ${this.vb(s, "is out in", "are out in", "出局，名次")} ${this.ord(place)}`);
        if (s !== 0) this.toast(`${this.nameOf(s)} ${T("is out", "出局")} · ${this.ord(place)}`);
      }
    }
    if (a.rebuys.length) {
      for (const r of a.rebuys) this.tag(r.seat, `${T("Rebuy", "重买")} ${this.chipsLabel(r.amount)}`, "post");
      if (k) snd.chips(4);
    }
    if (a.busted.includes(0) && !this.auto) snd.bust();
    if (a.levelUp) {
      const [sb, bb] = LEVELS[t.level];
      if (k) snd.level();
      this.toast(T(`Blinds up: ${num(sb)}/${num(bb)}`, `升盲：${num(sb)}/${num(bb)}`), "level");
    }
    this.renderStacks();
    this.renderInfo();
    // what everyone has seen of everyone: VPIP / PFR on the seats' tooltips
    const r = t.reads;
    this.seatEls.forEach((s, i) => {
      if (i === 0 || r.hands[i] < 8) return;
      s.root.title = `${this.nameOf(i)} · VPIP ${Math.round((r.vpip[i] / r.hands[i]) * 100)}% · PFR ${Math.round((r.pfr[i] / r.hands[i]) * 100)}% · ${r.hands[i]} ${T("hands", "手")}`;
    });
    await this.wait(a.busted.length || a.levelUp ? 700 : 300);
  }

  private ord(n: number) {
    return T(["", "1st", "2nd", "3rd"][n] ?? `${n}th`, `第 ${n} 名`);
  }

  // ---- the end -------------------------------------------------------------------------------

  /** The human is out of a Sit & Go: watch the rest, or leave (it plays out instantly). */
  private async humanOut(): Promise<void> {
    const t = this.table!;
    const place = t.seats[0].place;
    const pay = t.payout();
    const choice = await this.endCard(
      T(`You finished ${this.ord(place)}`, `你获得${this.ord(place)}`),
      pay > 0 ? T(`In the money: ⓩ ${num(pay)}`, `进入奖励圈：ⓩ ${num(pay)}`) : T("Out of the money this time.", "这次没进奖励圈。"),
      [
        [T("Watch the rest", "观看剩余牌局"), "watch"],
        [pay > 0 ? T(`Collect ⓩ ${num(pay)}`, `领取 ⓩ ${num(pay)}`) : T("Leave", "离开"), "leave"],
      ],
    );
    if (choice === "watch") {
      this.watching = true;
      return this.run();
    }
    t.finishInstantly();
    this.finishSng();
  }

  private finishSng() {
    const t = this.table!;
    const place = t.seats[0].place;
    const pay = t.payout();
    this.exit({
      order: t.order(),
      payout: pay,
      summary: `Orchard Hold'em ${this.format === "turbo" ? "Turbo " : ""}Sit & Go: finished ${["", "1st", "2nd", "3rd"][place] ?? place + "th"} of ${t.n}${pay > 0 ? `, won ⓩ ${pay}` : ""}.`,
    });
  }

  private async gameOver() {
    const t = this.table!;
    if (this.format === "cash") {
      // you busted
      await this.endCard(T("Busted", "输光了"), T("Your stack is gone. The Orchard Room thanks you.", "你的筹码没了。果园厅感谢你的光临。"), [[T("Leave the table", "离开牌桌"), "leave"]]);
      return this.exit({ order: t.order(), payout: 0, summary: `Busted at the Orchard Hold'em cash table after ${this.handsPlayed} hands.` });
    }
    const place = t.seats[0].place;
    const pay = t.payout();
    const rows = t
      .order()
      .map((s, i) => {
        const p = prizes(t.n, this.o.stake)[i];
        return `<li class="${s === 0 ? "me" : ""}"><em>${this.ord(i + 1)}</em><img src="${personImage(this.o.seats[s].id)}" alt=""/><b>${esc(this.nameOf(s))}</b><span>${this.o.stake > 0 && p ? `ⓩ ${num(p)}` : ""}</span></li>`;
      })
      .join("");
    if (place === 1 && !this.auto) snd.win(true);
    if (!this.watching || place === 1)
      await this.endCard(
        place === 1 ? T("You win the Sit & Go", "你赢下了坐满即玩") : T(`You finished ${this.ord(place)}`, `你获得${this.ord(place)}`),
        `<ol class="lh-standings">${rows}</ol>`,
        [[pay > 0 ? T(`Collect ⓩ ${num(pay)}`, `领取 ⓩ ${num(pay)}`) : T("Leave", "离开"), "leave"]],
        true,
      );
    else await this.endCard(T("The Sit & Go is over", "比赛结束"), `<ol class="lh-standings">${rows}</ol>`, [[pay > 0 ? T(`Collect ⓩ ${num(pay)}`, `领取 ⓩ ${num(pay)}`) : T("Leave", "离开"), "leave"]], true);
    this.finishSng();
  }

  private async cashOut() {
    const t = this.table!;
    const me = t.seats[0];
    const stack = this.hand && this.hand.players[0].inHand ? this.hand.players[0].stack : me.stack;
    const net = stack - me.bought;
    me.stack = stack;
    if (!this.auto) {
      const sub =
        this.o.stake > 0
          ? `${T("You take", "你带走")} <b>ⓩ ${num(stack)}</b> (${net >= 0 ? "+" : "−"}${num(Math.abs(net))}) · ${this.handsPlayed} ${T("hands", "手")}`
          : `${num(stack)} ${T("chips · free table", "筹码 · 免费桌")} · ${this.handsPlayed} ${T("hands", "手")}`;
      await this.endCard(net > 0 ? T("Up on the night", "今晚赢了") : net < 0 ? T("Down on the night", "今晚输了") : T("Even on the night", "今晚不输不赢"), sub, [
        [this.o.stake > 0 ? T(`Cash out ⓩ ${num(stack)}`, `兑现 ⓩ ${num(stack)}`) : T("Leave", "离开"), "leave"],
      ]);
    }
    this.exit({
      order: t.order(),
      payout: this.o.stake > 0 ? Math.max(0, stack) : 0,
      summary: `Left the Orchard Hold'em cash table with ⓩ ${stack} (${net >= 0 ? "+" : "-"}${Math.abs(net)}) after ${this.handsPlayed} hands.`,
    });
  }

  private endCard(title: string, sub: string, buttons: [string, string][], wide = false): Promise<string> {
    return new Promise((res) => {
      this.bar.innerHTML = "";
      this.modal.innerHTML = `<div class="lh-card-modal lh-end ${wide ? "wide" : ""}"><p class="lh-kicker">THE ORCHARD ROOM <span>果园厅</span></p><h2>${title}</h2><div class="lh-sub">${sub}</div><div class="lh-row">${buttons.map(([l, v], i) => `<button class="lh-btn ${i === buttons.length - 1 ? "go" : "ghost"}" data-e="${v}">${l}${i === buttons.length - 1 ? " <kbd>Enter</kbd>" : ""}</button>`).join("")}</div></div>`;
      this.modal.classList.add("open");
      const done = (v: string) => {
        this.modal.onclick = null;
        this.endKeys = null;
        this.modal.classList.remove("open");
        res(v);
      };
      this.modal.onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-e]");
        if (b) done(b.dataset.e!);
      };
      this.endKeys = () => done(buttons[buttons.length - 1][1]);
      if (this.auto) {
        const t = window.setTimeout(() => done(buttons[buttons.length - 1][1]), this.fast ? 0 : 1500);
        this.timers.add(t);
      }
    });
  }

  private confirm(title: string, sub: string, yes: string): Promise<boolean> {
    return new Promise((res) => {
      const prev = this.modal.innerHTML;
      const wasOpen = this.modal.classList.contains("open");
      const prevClick = this.modal.onclick;
      this.modal.innerHTML = `<div class="lh-card-modal lh-confirm"><h2>${title}</h2><p class="lh-sub">${sub}</p><div class="lh-row"><button class="lh-btn ghost" data-c="0">${T("Stay", "留下")} <kbd>Esc</kbd></button><button class="lh-btn go" data-c="1">${yes} <kbd>Enter</kbd></button></div></div>`;
      this.modal.classList.add("open");
      const done = (v: boolean) => {
        this.confirmResolve = null;
        this.modal.innerHTML = prev;
        this.modal.classList.toggle("open", wasOpen);
        this.modal.onclick = prevClick;
        res(v);
      };
      this.modal.onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
        if (b) done(b.dataset.c === "1");
      };
      this.confirmResolve = done;
    });
  }

  private async askLeave() {
    if (this.confirmResolve || this.exited) return;
    const t = this.table;
    if (!t) return this.exit({ order: this.o.seats.map((s) => s.seat), payout: this.o.stake, summary: "Left the Orchard Room before the first hand." });
    if (this.format === "cash") {
      const h = this.hand;
      const inPlay = h && h.players[0].inHand && !h.players[0].folded && h.phase !== "done";
      const stack = h && h.players[0].inHand ? h.players[0].stack : t.seats[0].stack;
      const ok = await this.confirm(
        T("Leave the table?", "离开牌桌？"),
        inPlay
          ? T(`You fold this hand and take ⓩ ${num(stack)}.`, `你将弃掉这手牌并带走 ⓩ ${num(stack)}。`)
          : this.o.stake > 0
            ? T(`You take your stack: ⓩ ${num(stack)}.`, `你带走你的筹码：ⓩ ${num(stack)}。`)
            : T("It's a free table: nothing to take.", "这是免费桌：没有东西可带走。"),
        this.o.stake > 0 ? T(`Cash out ⓩ ${num(stack)}`, `兑现 ⓩ ${num(stack)}`) : T("Leave", "离开"),
      );
      if (!ok || this.exited) return;
      this.leaving = true;
      t.seats[0].stack = stack;
      const net = stack - t.seats[0].bought;
      this.exit({
        order: t.order(),
        payout: this.o.stake > 0 ? Math.max(0, stack) : 0,
        summary: `Left the Orchard Hold'em cash table with ⓩ ${stack} (${net >= 0 ? "+" : "-"}${Math.abs(net)}) after ${this.handsPlayed} hands.`,
      });
      return;
    }
    // a Sit & Go: leaving forfeits; the others play it out
    const out = t.seats[0].out;
    const ok = await this.confirm(
      out ? T("Leave the Sit & Go?", "离开比赛？") : T("Forfeit the Sit & Go?", "放弃比赛？"),
      out ? T("The rest plays out in an instant.", "剩下的牌局将瞬间打完。") : T("You're out now, in the next place down; the others play it out.", "你将立即出局，名次按当前顺位计算；其他人继续打完。"),
      out ? T("Leave", "离开") : T("Forfeit", "放弃"),
    );
    if (!ok || this.exited) return;
    this.leaving = true;
    if (!out) {
      // you go out now: below everyone still in
      this.hand = null;
      t.hand = null;
      const alive = t.alive().length;
      t.seats[0].out = true;
      t.seats[0].stack = 0;
      t.seats[0].place = alive;
      t.outOrder.push(0);
      // (the others' places count down from yours)
      const left = t.alive();
      if (left.length === 1) left[0].place = 1;
    }
    t.finishInstantly();
    this.finishSng();
  }

  private exit(r: TableResult | null) {
    if (this.exited) return;
    this.exited = true;
    this.leaving = true;
    this.closed = true;
    for (const w of this.waking) w();
    this.waking.clear();
    this.room.stop();
    this.o.onExit(r);
  }

  close() {
    this.closed = true;
    this.leaving = true;
    for (const w of this.waking) w();
    this.waking.clear();
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    for (const f of this.offs) f();
    this.offs = [];
    this.ro?.disconnect();
    this.room.stop();
    snd.mute(false);
    this.root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.root.remove();
  }

  // ---- little things -----------------------------------------------------------------------------

  /** The time scale: 0 on the bench's fast mode, a third with the fast-forward on. */
  private k() {
    return this.fast ? 0 : this.ff ? 0.35 : 1;
  }

  private wait(ms: number): Promise<void> {
    if (this.closed) return Promise.reject(CLOSED);
    const d = ms * this.k();
    return new Promise((res, rej) => {
      const wake = () => {
        window.clearTimeout(t);
        this.timers.delete(t);
        rej(CLOSED);
      };
      const t = window.setTimeout(() => {
        this.timers.delete(t);
        this.waking.delete(wake);
        if (this.closed) rej(CLOSED);
        else res();
      }, d);
      this.timers.add(t);
      this.waking.add(wake);
    });
  }

  private makeCard(c: number) {
    const el = document.createElement("div");
    el.className = "lh-card";
    el.innerHTML = `<div class="lh-flip"><div class="lh-face lh-front"></div><div class="lh-face lh-back"></div></div>`;
    if (c >= 0) this.setFace(el, c);
    return el;
  }
  /** A card's printed face: the compact one (big rank, big suit) when it is drawn small. */
  private setFace(el: HTMLElement | undefined, c: number) {
    if (!el) return;
    el.dataset.c = String(c);
    const w = el.classList.contains("lh-big") ? this.hcw * 1.08 : el.classList.contains("lh-small") ? this.av * 0.5 * (this.portrait ? 1.25 : 1.5) : this.cw;
    (el.querySelector(".lh-front") as HTMLElement).innerHTML = faceSvg(c, w < 46);
  }

  /** What a seat just did, in place of its name on the plate (till the street is over). */
  private tag(seat: number, text: string, cls: string) {
    const s = this.seatEls[seat];
    s.act.textContent = text;
    s.act.className = `lh-word ${cls}`;
    s.root.classList.add("lh-did");
    if (!this.k()) return;
    s.act.animate(
      [
        { transform: "translateY(5px)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 220, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
  }
  /** A new street: the names come back, except where the word still holds (folded, all in). */
  private clearActs() {
    for (const s of this.seatEls) {
      if (s.act.classList.contains("fold") || s.act.classList.contains("allin")) continue;
      s.root.classList.remove("lh-did");
      s.act.className = "lh-word";
    }
  }

  private say(seat: number, mood: string) {
    const lines = SAY[mood];
    if (!lines || seat === 0 || !this.k()) return;
    const [en, zh] = lines[Math.floor(this.uiRnd() * lines.length)];
    const el = this.seatEls[seat].bubble;
    el.textContent = T(en, zh);
    el.classList.add("on");
    const t = window.setTimeout(() => el.classList.remove("on"), Math.max(1400, 2600 * this.k()));
    this.timers.add(t);
  }

  private toast(text: string, cls = "") {
    if (!this.k()) return;
    const el = document.createElement("div");
    el.className = `lh-toast ${cls}`;
    el.textContent = text;
    this.stage.appendChild(el);
    const t = window.setTimeout(() => el.remove(), 2600);
    this.timers.add(t);
  }

  /** An English verb for a seat: "You call" but "Nadia calls" (the Chinese has one form). */
  private vb(seat: number, they: string, you: string, zh: string) {
    return T(seat === 0 ? you : they, zh);
  }

  private nameOf(seat: number) {
    return seat === 0 ? T("You", "你") : this.o.seats[seat].name;
  }

  private cardsText(cards: number[]) {
    return cards
      .map((c) => {
        const s = c & 3;
        return `<span class="lh-mc" style="color:${SUIT_INK[s]}" title="${T(SUIT_EN[s], SUIT_ZH[s])}">${RANKS[c >> 2] === "T" ? "10" : RANKS[c >> 2]}<img src="${suitIcon(s)}" alt=""/></span>`;
      })
      .join("");
  }

  private log(line: string) {
    this.cur?.lines.push(line);
    if (this.logEl.classList.contains("open")) this.renderLog();
  }

  private renderLog() {
    const body = this.logEl.querySelector(".lh-log-body")!;
    body.innerHTML = this.history
      .slice(0, 12)
      .map(
        (h) =>
          `<section><h4>${T("Hand", "第")} ${h.head}</h4>${h.lines
            .filter(Boolean)
            .map((l) => `<p>${l}</p>`)
            .join("")}</section>`,
      )
      .join("");
  }

  /** The optional helper: your hand's name and its rough equity against random hands. */
  private updateHelper() {
    const h = this.hand;
    const el = this.helperEl;
    if (!this.helper || !h || !h.players[0].inHand || h.players[0].folded || h.players[0].hole.length < 2) {
      el.classList.remove("on");
      return;
    }
    const me = h.players[0];
    const opps = h.live().length - 1;
    const rnd = mulberry(mix(this.o.seed ^ 0x55, h.board.length + this.table!.handNo * 7));
    const eq = equity(
      me.hole,
      h.board,
      Array.from({ length: Math.max(1, opps) }, () => ({ acted: true, pct: 1, post: [0, 0, 0, 0], air: 0.3 })),
      500,
      rnd,
    );
    const name = h.board.length ? describe(evaluate([...me.hole, ...h.board])) : null;
    el.innerHTML = `<small>${T("Hand helper", "牌力助手")}</small><b>${name ? T(name.en, name.zh) : this.startName(me.hole)}</b><span>${Math.round(eq * 100)}% ${T(`vs ${opps} random`, `对 ${opps} 手随机牌`)}</span><i style="--q:${eq}"></i>`;
    el.classList.add("on");
  }

  private startName(hole: number[]) {
    const [a, b] = hole;
    const ra = a >> 2,
      rb = b >> 2;
    const r = (x: number) => (RANKS[x] === "T" ? "10" : RANKS[x]);
    if (ra === rb) return T(`Pocket ${r(ra)}s`, `口袋对 ${r(ra)}`);
    const hi = Math.max(ra, rb),
      lo = Math.min(ra, rb);
    return `${r(hi)}-${r(lo)} ${(a & 3) === (b & 3) ? T("suited", "同花") : T("offsuit", "杂色")}`;
  }
}
