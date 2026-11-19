/**
 * LAST SNARK's table: DOM and CSS (glyph.css) over the rules engine (engine.ts). The table itself is
 * painted once per layout on a canvas (table.ts: leather rail, felt, lamp, printed marks); the cards
 * are images (art.ts) that fly in arcs with their shadows, flick onto a messy discard, riffle back
 * into the deck. The moving signs are DOM: the lit pool at the discard's ring, the chevrons running
 * round the track in the direction of play, the turn token sliding to whoever plays. The zkSNARKs sit
 * on the rail: they fiddle with their cards while thinking, shout, wince, glitch under DUST ATTACK.
 * Sound in sound.ts. Nothing runs per frame: CSS and the Web Animations API move everything, and
 * everything is removed on close.
 */
import "./glyph.css";
import type { TableOpts, TableResult } from "../types";
import { T } from "../../i18n/lang";
import { personImage } from "../../party/people";
import { Game, HAND, RULES, mulberry, payoutFor, shares, type Card, type Ev, type Kind, type Rules } from "./engine";
import { catchDelay, decide, lateCallDelay, passPick, thinkMs, windowOutcome } from "./ai";
import { INKS, artReady, backUrl, cardImg, grainUrl, inkName, pipPath, pipSvg, warmFace } from "./art";
import { GlyphSound } from "./sound";
import { paintTable } from "./table";

class Closed extends Error {}
interface Pose {
  x: number;
  y: number;
  w: number;
  rot: number;
  face: boolean;
}
interface FlyOpts {
  /** A sideways wobble at the top of the arc (degrees). */
  spin?: number;
  /** How far the arc bows sideways (a share of the distance). */
  bend?: number;
  /** Slide past the target and back (a card thrown onto the pile). */
  settle?: boolean;
  /** How the card eases in: "throw" (fast start), "deal" (even), "lift" (slow start). */
  ease?: "throw" | "deal" | "lift";
}
type Act = { t: "play"; card: Card } | { t: "draw" } | { t: "keep" };
type KeyFn = (e: KeyboardEvent) => boolean;
type Emote = "sweat" | "bang" | "anger" | "spark" | "dizzy";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function cardDiv(c: Card | null): HTMLDivElement {
  return el("div", "lg-card", cardImg(c));
}
/** A card at the pile size, for the panels (help, round results). */
const sizedCard = (c: Card | null, cls = "") => `<div class="lg-sized ${cls}"><div class="lg-card">${cardImg(c)}</div></div>`;
const ord = (p: number) => T(["1st", "2nd", "3rd"][p] ?? `${p + 1}th`, `第${p + 1}名`);
const KIND_ORDER = { num: 0, skip: 1, reorg: 2, fees: 3, makers: 4, fork: 5, shor: 6 } as const;
const sortKey = (c: Card) => (c.ink < 0 ? 400 : c.ink * 100) + KIND_ORDER[c.kind] * 10 + Math.max(0, c.n);

/** Every kind of card once (to paint the deck ahead of the deal). */
function everyCard(): Card[] {
  const out: Card[] = [];
  for (let ink = 0; ink < 4; ink++) {
    for (let n = 0; n <= 9; n++) out.push({ id: 0, ink, kind: "num", n });
    for (const kind of ["skip", "reorg", "fees", "makers"] as Kind[]) out.push({ id: 0, ink, kind, n: -1 });
  }
  out.push({ id: 0, ink: -1, kind: "fork", n: -1 }, { id: 0, ink: -1, kind: "shor", n: -1 });
  return out;
}

// ---- the snarks' faces: small pixel marks over a portrait -------------------------------------------

const EMOTES: Record<Emote, [string[], string]> = {
  sweat: [["..#..", ".###.", "#####", "#####", ".###."], "#a8d8e8"],
  bang: [["##", "##", "##", "##", "..", "##"], "#ff6b35"],
  anger: [[".#.#.", "##.##", ".....", "##.##", ".#.#."], "#ff4a5a"],
  spark: [["..#..", "..#..", "##.##", "..#..", "..#.."], "#efeadf"],
  dizzy: [[".###.", "#...#", "#.#.#", "#..#.", ".##.."], "#c4b1fc"],
};
const emoteSvg = (k: Emote) => {
  const [rows, col] = EMOTES[k];
  const w = rows[0].length,
    h = rows.length;
  let r = "";
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && (r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`)));
  return `<svg viewBox="-1 -1 ${w + 2} ${h + 2}" width="${(w + 2) * 3}" height="${(h + 2) * 3}" shape-rendering="crispEdges" fill="${col}">${r}</svg>`;
};

// ---- the snarks' lines -------------------------------------------------------------------------------

const LINES: Record<string, [string, string][]> = {
  shor: [
    ["The Tracker says hi.", "追踪者向你问好。"],
    ["Your coins look… transparent.", "你的币看着……挺透明。"],
    ["Dust for everyone.", "人人有粉尘。"],
    ["Linked you.", "关联到你了。"],
  ],
  fees: [
    ["Network's busy. Pay up.", "网络拥堵，交费吧。"],
    ["Fees are on you.", "手续费你来付。"],
    ["Priority fee, friend.", "优先费，朋友。"],
  ],
  skip: [
    ["Your block got orphaned.", "你的区块成孤块了。"],
    ["Missed it. Next!", "错过了，下一位！"],
    ["No block for you.", "这块没你的份。"],
  ],
  reorg: [
    ["Reorg! Everybody back.", "重组！全体倒车。"],
    ["Longest chain wins.", "最长链说了算。"],
    ["Plot twist.", "剧情反转。"],
  ],
  fork: [
    ["Fork it.", "分叉吧。"],
    ["New chain, new pool.", "新链，新池。"],
    ["Branching out.", "开个分支。"],
  ],
  hit: [
    ["Dusted again…", "又被粉尘了……"],
    ["Ouch. Big proof.", "哎，证明好大。"],
    ["My hand is 7 kB now.", "我手牌都 7 kB 了。"],
    ["Not my fees!", "这手续费不该我付！"],
  ],
  catcher: [
    ["Caught you unproven!", "抓到你没证明！"],
    ["Say it! LAST SNARK!", "喊啊！最后一证！"],
    ["No shout, no mercy.", "不喊就别怪我。"],
  ],
  caught: [
    ["Ugh. Forgot to prove it.", "唉，忘证明了。"],
    ["I was about to say it!", "我正要喊呢！"],
  ],
  win: [
    ["Proved, shielded, finalized.", "证明，屏蔽，最终确认。"],
    ["Block mined.", "出块了。"],
    ["GG. Shielded style.", "GG，屏蔽风格。"],
  ],
  makers: [
    ["Shielded hour! Pass it on.", "屏蔽时刻！传下去。"],
    ["Inscribe and pass.", "铭刻，然后传。"],
  ],
  deep: [
    ["The mempool is deep today.", "今天内存池好深。"],
    ["Still syncing…", "还在同步……"],
  ],
};

// ---- the table ----------------------------------------------------------------------------------------

interface SeatEls {
  root: HTMLDivElement;
  count: HTMLElement;
  fan: HTMLDivElement;
  pts: HTMLElement;
  bubble: HTMLDivElement;
  emote: HTMLDivElement;
  fanN: number;
  react: number;
  emoteT: number;
}

export class GlyphTable {
  private o: TableOpts;
  private n: number;
  private fast: boolean;
  private auto: boolean;
  private host: HTMLElement;
  private root: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private glow: HTMLDivElement;
  private compass: HTMLDivElement;
  private inkLabel: HTMLDivElement;
  private track: HTMLDivElement;
  private token: HTMLDivElement;
  private deck: HTMLDivElement;
  private deckCard: HTMLDivElement;
  private pileCount: HTMLDivElement;
  private discardEl: HTMLDivElement;
  private pendingEl: HTMLDivElement;
  private handEl: HTMLDivElement;
  private flyEl: HTMLDivElement;
  private hudSub: HTMLDivElement;
  private actions: HTMLDivElement;
  private drawBtn: HTMLButtonElement;
  private callBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private meEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private seatEls: SeatEls[] = [];
  private snd = new GlyphSound();

  private g!: Game;
  private rules: Rules = { ...RULES };
  private ai: () => number;
  private fx = Math.random;
  private closed = false;
  private exited = false;
  private timers = new Set<number>();
  private winTimers: number[] = [];
  private speed = 1;
  private paused: Promise<void> | null = null;
  private unpause: (() => void) | null = null;
  private fastTick = 0;

  private L = {
    W: 0,
    H: 0,
    portrait: false,
    compact: false,
    cw: 96,
    ch: 134,
    pw: 96,
    ph: 134,
    pic: 50,
    cx: 0,
    cy: 0,
    rx: 0,
    ry: 0,
    px: 0,
    py: 0,
    dx: 0,
    dy: 0,
    tx: 0,
    ty: 0,
    ringR: 0,
    rail: 16,
    handY: 0,
    handW: 0,
    /** The hand's middle, and the lowest a card may reach (the screen's edge, above a phone's home bar). */
    hx: 0,
    bot: 0,
    /** How far a second row of cards sits above the first (0: one row only). */
    row2: 0,
    seats: [] as { x: number; y: number }[],
  };
  /** A touch screen: its safe areas (a notch, a home bar) are kept clear of the table's controls. */
  private touch = matchMedia("(pointer: coarse)").matches;
  private vHand: Card[] = [];
  private vCount: number[];
  private handEls = new Map<number, HTMLDivElement>();
  private handPose = new Map<number, Pose>();
  private sortHand = true;
  private sel = -1;
  /** The keyboard (or a touch) picked a card: show the pick (a mouse has its hover). */
  private kbd = false;
  private inputFn: ((a: Act) => void) | null = null;
  private passFn: ((c: Card) => void) | null = null;
  private keys: KeyFn[] = [];
  private lastSay = 0;
  private seatSay: number[];
  private bubbleTimers: number[];
  private toastTimer = 0;
  private ro: ResizeObserver | null = null;
  private result: TableResult | null = null;
  private lastPts: number[] = [];
  private turnSeat = -1;
  private tokA = Math.PI / 2;
  private tokAnim: Animation | null = null;
  private chevs: HTMLElement[] = [];
  private dir: 1 | -1 = 1;
  private prewarmed = false;
  /** The deck's size as shown (it follows the flying cards, not the engine). */
  private vPile = 112;

  constructor(o: TableOpts) {
    this.o = o;
    this.n = o.seats.length;
    this.fast = !!o.lab?.fast;
    this.auto = !!o.lab?.auto;
    this.host = o.root;
    this.ai = mulberry((o.seed ^ 0x5bd1e995) >>> 0);
    this.vCount = new Array(this.n).fill(0);
    this.seatSay = new Array(this.n).fill(0);
    this.bubbleTimers = new Array(this.n).fill(0);

    const r = (this.root = el("div", "lg-root lg-idle"));
    r.style.setProperty("--grain", `url(${grainUrl()})`);
    this.cv = el("canvas", "lg-tablecv");
    this.glow = el("div", "lg-glow");
    this.track = el("div", "lg-track");
    this.compass = el("div", "lg-compass");
    for (let i = 0; i < 4; i++) this.compass.insertAdjacentHTML("beforeend", `<i style="--ic:${INKS[i].c}"><svg viewBox="0 0 20 20"><path d="${pipPath(i, 10, 10, 8.4)}"/></svg></i>`);
    this.inkLabel = el("div", "lg-inkname");
    this.token = el("div", "lg-token", `<svg viewBox="0 0 24 24"><path d="M11 18.7A7.7 7.7 0 1 1 18.7 11" fill="none" stroke="#efeadf" stroke-width="2.6" stroke-linecap="round"/><rect x="14.6" y="14.6" width="6.6" height="6.6" rx="1.5" fill="#0e0e0e"/></svg>`);
    this.deck = el("div", "lg-pile lg-deck");
    this.deckCard = cardDiv(null);
    this.deck.append(this.deckCard);
    this.pileCount = el("div", "lg-pilecount");
    this.deck.append(this.pileCount);
    this.discardEl = el("div", "lg-pile lg-discard");
    this.pendingEl = el("div", "lg-pending");
    this.handEl = el("div", "lg-hand");
    this.flyEl = el("div", "lg-flyer");

    const hud = el("div", "lg-hud");
    const brand = el("div", "lg-brand");
    brand.innerHTML = `<div class="lg-title">LAST <em>SNARK</em></div><div class="lg-sub"></div>`;
    this.hudSub = brand.querySelector(".lg-sub")!;
    const tools = el("div", "lg-tools");
    const help = el("button", "lg-icon", `<svg viewBox="0 0 24 24"><path d="M9.2 9.3a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.4 1.1-1.4 2.1v.6"/><circle cx="12" cy="17.6" r=".6"/></svg>`);
    help.title = T("How to play (H)", "玩法 (H)");
    help.onclick = () => void this.showHelp();
    this.speedBtn = el("button", "lg-icon lg-speed", "1×");
    this.speedBtn.title = T("Game speed", "速度");
    this.speedBtn.onclick = () => this.toggleSpeed();
    const leave = el("button", "lg-icon", `<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>`);
    leave.title = T("Leave the table (Esc)", "离桌 (Esc)");
    leave.onclick = () => void this.confirmLeave();
    tools.append(help, this.speedBtn, leave);
    hud.append(brand, tools);

    this.actions = el("div", "lg-actions");
    this.drawBtn = el("button", "lg-btn lg-drawbtn");
    this.drawBtn.onclick = () => this.onDraw();
    this.callBtn = el("button", "lg-call");
    this.callBtn.onclick = () => this.onCall();
    this.actions.append(this.callBtn, this.drawBtn);
    this.meEl = el("div", "lg-me");
    this.toastEl = el("div", "lg-toast");

    r.append(this.cv, this.glow, this.track, this.compass, this.inkLabel, this.deck, this.discardEl, this.pendingEl, this.token);
    // the seats (the human's plate sits by the hand)
    for (let i = 0; i < this.n; i++) {
      const s = o.seats[i];
      const root = el("div", "lg-seat");
      root.style.setProperty("--sc", s.color);
      const img = personImage(s.id);
      root.innerHTML =
        `<div class="lg-spot"></div>` +
        `<div class="lg-hold"><div class="lg-fan"></div><b class="lg-count"></b></div>` +
        `<div class="lg-plate"><div class="lg-pic">${img ? `<img src="${img}" alt="">` : ""}</div><div class="lg-emote"></div></div>` +
        `<div class="lg-tag"><span class="lg-name">${esc(i === 0 ? T("You", "你") : s.name)}</span><span class="lg-pts">0</span></div>` +
        `<div class="lg-bubble"></div>`;
      this.seatEls.push({
        root,
        count: root.querySelector(".lg-count")!,
        fan: root.querySelector(".lg-fan")!,
        pts: root.querySelector(".lg-pts")!,
        bubble: root.querySelector(".lg-bubble")!,
        emote: root.querySelector(".lg-emote")!,
        fanN: -1,
        react: 0,
        emoteT: 0,
      });
      if (i === 0) this.meEl.append(root);
      else r.append(root);
    }
    r.append(this.handEl, this.flyEl, hud, this.actions, this.meEl, this.toastEl);
    this.host.append(r);
    // (the bench's scripts may look inside)
    if (o.lab) (window as unknown as { glyphTable?: GlyphTable }).glyphTable = this;

    this.handEl.addEventListener("pointerup", this.onHandPointer);
    if (this.touch) {
      this.handEl.addEventListener("pointerdown", this.onHandDown);
      this.handEl.addEventListener("pointermove", this.onHandMove);
      this.handEl.addEventListener("pointercancel", () => (this.scrub = null));
    }
    this.deck.addEventListener("click", () => this.onDraw());
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.host);
    this.layout();
    this.setInk(0);
    this.refreshButtons();
    void this.run();
  }

  // ---- lifecycle ------------------------------------------------------------------------------------

  close() {
    if (this.exited) return;
    this.exit(null);
  }
  private exit(res: TableResult | null) {
    if (this.exited) return;
    this.exited = true;
    this.dispose();
    this.o.onExit(res);
  }
  private dispose() {
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.clearWindow();
    for (const t of this.bubbleTimers) clearTimeout(t);
    for (const s of this.seatEls) clearTimeout(s.emoteT), clearTimeout(s.react);
    clearTimeout(this.toastTimer);
    this.snd.stopRoom();
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    this.ro?.disconnect();
    this.ro = null;
    for (const a of this.root.getAnimations({ subtree: true })) a.cancel();
    this.root.remove();
    this.handEls.clear();
  }

  private async run() {
    try {
      await artReady();
      this.deckCard.innerHTML = cardImg(null);
      this.root.style.setProperty("--back", `url(${backUrl()})`);
      if (!this.fast) this.prewarm();
      this.rules = await this.setup();
      this.g = new Game(this.n, this.rules, this.o.seed);
      this.lastPts = new Array(this.n).fill(0);
      if (!this.fast) this.snd.startRoom();
      for (;;) {
        await this.playRound();
        if (this.g.phase === "gameOver") break;
        await this.roundPanel(false);
      }
      await this.roundPanel(true);
      this.result = this.makeResult();
      await this.finalPanel(this.result);
      this.exit(this.result);
    } catch (e) {
      if (!(e instanceof Closed)) {
        console.error("LAST SNARK", e);
        if (!this.exited) this.exit(this.result);
      }
    }
  }

  /** Paint every face ahead of the deal, a few at a time, so no card is painted mid-flight. */
  private prewarm() {
    if (this.prewarmed) return;
    this.prewarmed = true;
    const all = everyCard();
    const step = () => {
      if (this.closed) return;
      warmFace(all.pop()!);
      if (all.length) window.setTimeout(step, 16);
    };
    step();
  }

  private makeResult(): TableResult {
    const order = this.g.order();
    const place = order.indexOf(0);
    const payout = payoutFor(place, this.n, this.o.stake);
    const pts = this.g.scores[0];
    return {
      order,
      payout,
      summary: `LAST SNARK: ${["1st", "2nd", "3rd"][place] ?? `${place + 1}th`} of ${this.n} with ${pts} pts` + (this.o.stake ? (payout ? `, won ⓩ${payout}` : `, lost the ⓩ${this.o.stake} buy-in`) : ""),
    };
  }

  // ---- timing ---------------------------------------------------------------------------------------

  private wait(ms: number): Promise<void> {
    if (this.closed) return Promise.reject(new Closed());
    if (this.fast) {
      // let the page breathe now and then
      if (++this.fastTick % 40) return Promise.resolve();
      ms = 0;
    }
    return new Promise((res, rej) => {
      const id = window.setTimeout(
        () => {
          this.timers.delete(id);
          if (this.closed) rej(new Closed());
          else res();
        },
        ms * (this.fast ? 0 : this.speed),
      );
      this.timers.add(id);
    });
  }
  private async gate() {
    while (this.paused) await this.paused;
    if (this.closed) throw new Closed();
  }
  private pause(on: boolean) {
    if (on && !this.paused) this.paused = new Promise((r) => (this.unpause = r));
    else if (!on && this.paused) {
      this.paused = null;
      this.unpause?.();
      this.unpause = null;
    }
  }
  private toggleSpeed() {
    this.speed = this.speed === 1 ? 0.5 : 1;
    this.speedBtn.textContent = this.speed === 1 ? "1×" : "2×";
    this.speedBtn.classList.toggle("on", this.speed !== 1);
  }
  /** Stereo position of a point on screen (-1 left … 1 right). */
  private pan(x: number) {
    return ((x / Math.max(1, this.L.W)) * 2 - 1) * 0.7;
  }

  // ---- layout ---------------------------------------------------------------------------------------

  /** The safe-area insets in px (all 0 with a mouse, or on a screen without a notch). */
  private safe() {
    const z = { t: 0, r: 0, b: 0, l: 0 };
    if (!this.touch) return z;
    const p = el("div", "lg-safe");
    this.root.append(p);
    const cs = getComputedStyle(p);
    Object.assign(z, { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 });
    p.remove();
    return z;
  }

  private layout() {
    if (this.closed) return;
    const W = this.host.clientWidth || window.innerWidth;
    const H = this.host.clientHeight || window.innerHeight;
    // (the table is laid out inside the safe area; its felt and room still fill the screen)
    const sa = this.safe();
    const Wi = W - sa.l - sa.r,
      bot = H - sa.b;
    const portrait = H > W * 1.08;
    const compact = Math.min(W, H) < 560 || W < 760;
    const r = this.root;
    r.classList.toggle("lg-portrait", portrait);
    r.classList.toggle("lg-compact", compact);
    const hud = compact ? 46 : 58;
    let cw: number, pw: number;
    if (portrait) {
      cw = clamp(W * 0.2, 58, 100);
      pw = clamp(Math.min(W * 0.19, H * 0.095), 56, 96);
    } else {
      // (a phone on its side held in the hands: the cards a little bigger, for a finger)
      cw = clamp(Math.min(H * (this.touch && compact ? 0.17 : 0.145), W * 0.09), 52, 108);
      pw = clamp(Math.min(H * 0.125, W * 0.082), 48, 100);
    }
    const ch = cw * 1.4,
      ph = pw * 1.4;
    const pic = compact ? (portrait ? 42 : 36) : 54;
    // (an upright phone held in the hand keeps room for a second row of cards, so a long hand
    // folds in two and every card stays a finger wide)
    const row2 = this.touch && portrait && compact ? ch * 0.42 : 0;
    const handH = ch + row2 + (portrait ? 14 : 20);
    const bar = portrait ? (compact ? 70 : 78) : 0;
    const top = sa.t + hud + pic * 0.55 + 18;
    const bottom = bot - handH - bar - (portrait ? 34 : compact ? 34 : 50);
    const cx = sa.l + Wi / 2,
      cy = (top + bottom) / 2;
    const ry = Math.max(56, (bottom - top) / 2);
    const rx = portrait ? Wi / 2 - 40 : Math.min(Wi / 2 - pic - 40, Math.max(ry * 1.9, Wi * 0.3));
    const L = this.L;
    Object.assign(L, { W, H, portrait, compact, cw, ch, pw, ph, pic, cx, cy, rx, ry, hx: cx, bot, row2 });
    L.rail = clamp(Math.min(rx, ry) * 0.085, 9, 22);
    L.px = cx - pw * 0.74;
    L.py = cy;
    L.dx = cx + pw * 0.74;
    L.dy = cy;
    L.ringR = ph * 0.6;
    // the track encloses the piles and the ring, inside the seats
    L.tx = clamp(Math.max(rx * 0.56, pw * 0.74 + L.ringR + 34), 40, rx - (portrait ? 16 : pic * 0.9));
    L.ty = clamp(Math.max(ry * 0.6, L.ringR + 30), 40, ry - (portrait ? 30 : pic * 0.7));
    L.handY = bot - ch / 2 - (portrait ? 8 : 12);
    // (room for the outer cards' turn)
    L.handW = portrait ? Wi - 16 - cw * 0.35 : Wi - 2 * (compact ? 182 : 232);
    r.style.setProperty("--cw", `${cw}px`);
    r.style.setProperty("--ch", `${ch}px`);
    r.style.setProperty("--pw", `${pw}px`);
    r.style.setProperty("--ph", `${ph}px`);
    r.style.setProperty("--pic", `${pic}px`);
    paintTable(this.cv, { W, H, cx, cy, rx, ry, px: L.px, py: L.py, dx: L.dx, dy: L.dy, pw, ph, tx: L.tx, ty: L.ty, ringR: L.ringR, rail: L.rail, compact });

    const pos = (e: HTMLElement, x: number, y: number) => {
      e.style.left = `${x}px`;
      e.style.top = `${y}px`;
    };
    pos(this.glow, L.dx, L.dy);
    this.glow.style.width = this.glow.style.height = `${L.ringR * 3.2}px`;
    pos(this.compass, L.dx, L.dy);
    this.compass.style.width = this.compass.style.height = `${L.ringR * 2}px`;
    this.compass.style.setProperty("--pip", `${Math.max(12, pw * 0.18)}px`);
    pos(this.inkLabel, L.dx, L.dy + L.ringR + (compact ? 13 : 17));
    pos(this.deck, L.px, L.py);
    pos(this.discardEl, L.dx, L.dy);
    pos(this.pendingEl, L.dx + pw * 0.5, L.dy - ph * 0.5);
    // the caption: over the piles, inside the track (low on the felt on an upright phone)
    pos(this.toastEl, cx, portrait ? cy + Math.min(ry * 0.72, L.ty + 40) : Math.max(cy - L.ringR - (compact ? 20 : 30), cy - L.ty + 22));
    this.layoutTrack();

    // the rivals round the rim, clockwise from your left (the direction of play)
    // (evenly spaced along the rim, not by angle: on a long flat table they spread along the long side)
    const m = this.n - 1;
    const span = m <= 1 ? 0 : Math.min(240, 100 + 35 * (m - 2));
    const a0 = ((270 - span / 2) * Math.PI) / 180,
      a1 = ((270 + span / 2) * Math.PI) / 180;
    const STEPS = 240;
    const arc: number[] = [0];
    for (let k = 1; k <= STEPS; k++) {
      const pa = a0 + ((a1 - a0) * (k - 1)) / STEPS,
        pb = a0 + ((a1 - a0) * k) / STEPS;
      arc.push(arc[k - 1] + Math.hypot((Math.cos(pb) - Math.cos(pa)) * rx, (Math.sin(pb) - Math.sin(pa)) * ry));
    }
    const angleAt = (f: number) => {
      const want = f * arc[STEPS];
      let k = 1;
      while (k < STEPS && arc[k] < want) k++;
      const u = (want - arc[k - 1]) / Math.max(1e-6, arc[k] - arc[k - 1]);
      return a0 + ((a1 - a0) * (k - 1 + u)) / STEPS;
    };
    L.seats = [{ x: cx, y: cy + ry }];
    for (let i = 1; i < this.n; i++) {
      const a = m <= 1 ? (270 * Math.PI) / 180 : angleAt((i - 1) / (m - 1));
      let x = cx + Math.cos(a) * (rx + L.rail * 0.4);
      const y = cy + Math.sin(a) * (ry + L.rail * 0.4);
      x = clamp(x, sa.l + (compact ? 48 : 74), W - sa.r - (compact ? 48 : 74));
      L.seats.push({ x, y });
      const s = this.seatEls[i];
      pos(s.root, x, y);
      // the cards held on the side facing the middle of the table (above the portrait on the
      // long sides of an upright phone, where the side would cover the piles)
      s.root.classList.toggle("side-l", x > cx + 8);
      s.root.classList.toggle("up", portrait && Math.abs(x - cx) > W * 0.28 && Math.abs(y - cy) < ry * 0.6);
      s.bubble.className = `lg-bubble ${y < cy - ry * 0.25 ? "below" : "above"}${x < W * 0.18 ? " al" : x > W * 0.82 ? " ar" : ""}`;
    }
    // you, by the hand; the actions on the other side (a row over the hand on a phone held upright)
    if (portrait) {
      const by = bot - handH - bar / 2 - 8;
      pos(this.meEl, sa.l + 12, by);
      Object.assign(this.actions.style, { left: "auto", right: `${sa.r + 12}px`, top: `${by}px`, bottom: "auto", transform: "translateY(-50%)", flexDirection: "row-reverse" });
    } else {
      const by = bot - handH / 2 - 6;
      pos(this.meEl, sa.l + (compact ? 12 : 24), by);
      // the bell above the draw plate; side by side when the screen is short
      const row = H < 560;
      const ah = row ? (compact ? 70 : 92) : compact ? 122 : 168;
      Object.assign(this.actions.style, { left: "auto", right: `${sa.r + (compact ? 12 : 24)}px`, top: `${Math.min(by, bot - ah / 2 - 10)}px`, bottom: "auto", transform: "translateY(-50%)", flexDirection: row ? "row-reverse" : "column" });
      // A touch screen on its side: the hand keeps a finger's gap from you and from Draw, as wide as
      // they really are (Draw's longest label, "Take +12", measured), so a long hand never reaches them.
      if (this.touch) {
        const label = this.drawBtn.innerHTML;
        this.drawBtn.innerHTML = `${T("Take +12", "接受 +12")}<span class="lg-key">D</span>`;
        const hb = this.host.getBoundingClientRect(),
          ab = this.actions.getBoundingClientRect(),
          mb = this.meEl.getBoundingClientRect();
        this.drawBtn.innerHTML = label;
        const gap = 16;
        const half = Math.min(L.hx - (mb.right - hb.left) - gap, ab.left - hb.left - L.hx - gap);
        if (half > L.cw) L.handW = Math.min(L.handW, 2 * half);
      }
    }
    this.seatEls[0].bubble.className = "lg-bubble above al";
    this.layoutHand(false);
    for (let i = 1; i < this.n; i++) this.drawFan(i, true);
    this.placeToken(false);
  }

  /** The chevrons round the track, spaced evenly along it, pointing the way play goes. */
  private layoutTrack() {
    const L = this.L;
    const STEPS = 360;
    const pts: number[] = [0];
    for (let k = 1; k <= STEPS; k++) {
      const pa = ((k - 1) / STEPS) * Math.PI * 2,
        pb = (k / STEPS) * Math.PI * 2;
      pts.push(pts[k - 1] + Math.hypot((Math.cos(pb) - Math.cos(pa)) * L.tx, (Math.sin(pb) - Math.sin(pa)) * L.ty));
    }
    const per = pts[STEPS];
    const N = clamp(Math.round(per / (L.compact ? 34 : 42)), 12, 34);
    this.track.replaceChildren();
    this.chevs = [];
    let k = 1;
    for (let i = 0; i < N; i++) {
      const want = (i / N) * per;
      while (k < STEPS && pts[k] < want) k++;
      const a = ((k - 1 + (want - pts[k - 1]) / Math.max(1e-6, pts[k] - pts[k - 1])) / STEPS) * Math.PI * 2;
      const x = L.cx + Math.cos(a) * L.tx,
        y = L.cy + Math.sin(a) * L.ty;
      const tan = (Math.atan2(Math.cos(a) * L.ty, -Math.sin(a) * L.tx) * 180) / Math.PI;
      const c = el("i");
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      c.style.setProperty("--a", `${tan.toFixed(1)}deg`);
      c.style.setProperty("--k", String(i));
      this.track.append(c);
      this.chevs.push(c);
    }
    this.track.style.setProperty("--n", String(N));
    this.setDir(this.dir, false);
  }
  /** Point the chevrons the way play goes (a wave of flips on a REORG). */
  private setDir(dir: 1 | -1, wave: boolean) {
    this.dir = dir;
    const N = this.chevs.length;
    this.track.classList.toggle("ccw", dir === -1);
    this.track.classList.toggle("wave", wave);
    this.chevs.forEach((c, i) => {
      // the light runs round the track the way play goes
      c.style.setProperty("--d", String(dir === 1 ? i - N : -i));
    });
  }

  /** The angle round the middle (on the track) that faces a seat. */
  private seatAngle(seat: number) {
    const L = this.L;
    if (seat === 0) return Math.PI / 2;
    const p = L.seats[seat];
    return Math.atan2((p.y - L.cy) / L.ry, (p.x - L.cx) / L.rx);
  }
  /** The token sits on the track in front of whoever plays; it glides round the way play goes. */
  private placeToken(animate: boolean) {
    const L = this.L;
    const seat = this.turnSeat;
    this.token.classList.toggle("on", seat >= 0);
    if (seat < 0) return;
    const at = (a: number) => {
      const x = L.cx + Math.cos(a) * L.tx,
        y = L.cy + Math.sin(a) * L.ty;
      return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    };
    const a1 = this.seatAngle(seat);
    const a0 = this.tokA;
    const two = Math.PI * 2;
    let d = (((a1 - a0) % two) + two) % two;
    if (this.dir === -1) d = d - two;
    if (Math.abs(d) > Math.PI * 1.6) d = d > 0 ? d - two : d + two;
    this.tokA = a1;
    this.tokAnim?.cancel();
    this.tokAnim = null;
    this.token.style.transform = at(a1);
    if (!animate || this.fast || Math.abs(d) < 0.01) return;
    const frames: Keyframe[] = [];
    for (let k = 0; k <= 10; k++) frames.push({ transform: at(a0 + (d * k) / 10) });
    this.tokAnim = this.token.animate(frames, { duration: clamp(Math.abs(d) * 170, 220, 620) * this.speed, easing: "cubic-bezier(.45,.05,.3,1)" });
  }

  /** Fan the hand along the bottom (`animate`: slide there, else jump). */
  private layoutHand(animate = true) {
    const L = this.L;
    if (this.sortHand) this.vHand.sort((a, b) => sortKey(a) - sortKey(b) || a.id - b.id);
    const n = this.vHand.length;
    // (on an upright phone a hand whose cards would get narrower than a finger folds into two
    // rows: the first half behind and higher, the second in front)
    const two = L.row2 > 0 && n > 1 && (L.handW - L.cw) / (n - 1) < 44;
    const rows: [number, number, number][] = two ? [[0, Math.ceil(n / 2), L.row2], [Math.ceil(n / 2), n, 0]] : [[0, n, 0]];
    for (const [from, to, up] of rows) {
      const k = to - from;
      const ang = k > 1 ? Math.min(3.6, 30 / (k - 1)) : 0;
      // the whole fan stays on screen: the outer cards drop along the arc and turn
      const edge = ((k - 1) / 2) * ang * (Math.PI / 180);
      let step = k > 1 ? Math.min(L.cw * 0.72, (L.handW - L.cw) / (k - 1)) : 0;
      // (a touch screen on its side: the outer cards' turn stays inside the hand's room too, clear of Draw)
      if (this.touch && !L.portrait && k > 1) step = Math.max(4, Math.min(step, (L.handW / 2 - (L.cw / 2) * Math.cos(edge) - (L.ch / 2) * Math.sin(edge)) / ((k - 1) / 2)));
      const R = ang > 0 ? step / ((ang * Math.PI) / 180) : 0;
      const low = (R ? R * (1 - Math.cos(edge)) : 0) + (L.ch / 2) * Math.cos(edge) + (L.cw / 2) * Math.sin(edge);
      const lift = Math.max(0, L.handY + low - (L.bot - 6)) + up;
      for (let i = from; i < to; i++) {
        const c = this.vHand[i];
        const e = this.handEls.get(c.id);
        if (!e) continue;
        const off = i - from - (k - 1) / 2;
        const rot = off * ang;
        const x = L.hx + off * step;
        const y = L.handY - lift + (R ? R * (1 - Math.cos((rot * Math.PI) / 180)) : 0);
        this.handPose.set(c.id, { x, y, w: L.cw, rot, face: true });
        if (!animate) e.style.transition = "none";
        e.style.transform = `translate(${x - L.cw / 2}px, ${y - L.ch / 2}px) rotate(${rot}deg)`;
        e.style.zIndex = String(i + 1);
        e.style.setProperty("--rot", `${rot.toFixed(2)}deg`);
        if (!animate) {
          void e.offsetWidth;
          e.style.transition = "";
        }
      }
    }
    if (this.sel >= n) this.sel = n - 1;
  }

  /** A rival's cards in hand: real backs, fanned, as many as they hold (nine at most). */
  private drawFan(seat: number, force = false) {
    const s = this.seatEls[seat];
    const k = Math.min(9, this.vCount[seat]);
    if (k === s.fanN && !force) return;
    s.fanN = k;
    let h = "";
    const spread = Math.min(11, 64 / Math.max(1, k));
    for (let j = 0; j < k; j++) h += `<i style="--r:${((j - (k - 1) / 2) * spread).toFixed(1)}deg;--j:${j}"></i>`;
    s.fan.innerHTML = h;
  }

  /** The deck's thickness: one edge line per few cards, cream and shadow by turns. */
  private deckEdge(count: number) {
    const k = Math.min(16, Math.ceil(count / 7));
    let sh = "";
    for (let i = 1; i <= k; i++) sh += `${(-i * 0.32).toFixed(2)}px ${(i * 0.62).toFixed(2)}px 0 ${i % 2 ? "#3b3640" : "#151318"},`;
    this.deckCard.style.boxShadow = sh + `${-k * 0.3}px ${k * 0.6 + 6}px 14px rgba(0,0,0,.55)`;
    this.deckCard.style.transform = `translate(${(k * 0.32).toFixed(1)}px, ${(-k * 0.62).toFixed(1)}px)`;
    this.deck.classList.toggle("empty", count === 0);
  }

  // ---- poses ----------------------------------------------------------------------------------------

  private pilePose(): Pose {
    const k = Math.min(16, Math.ceil(this.vPile / 7));
    return { x: this.L.px + k * 0.32, y: this.L.py - k * 0.62, w: this.L.pw, rot: 0, face: false };
  }
  private seatPose(seat: number): Pose {
    const p = this.L.seats[seat];
    if (seat === 0) return { x: this.L.hx, y: this.L.handY, w: this.L.cw, rot: 0, face: true };
    // from the cards it holds, on the side of the portrait that faces the middle (or above it)
    const side = p.x > this.L.cx + 8 ? -1 : 1;
    if (this.seatEls[seat].root.classList.contains("up")) return { x: p.x, y: p.y - this.L.pic * 1.15, w: this.L.pw * 0.44, rot: side * 8 + (this.fx() - 0.5) * 16, face: false };
    return { x: p.x + side * this.L.pic * 1.08, y: p.y - (this.L.compact ? 10 : 14), w: this.L.pw * 0.44, rot: side * 14 + (this.fx() - 0.5) * 16, face: false };
  }
  private discardPose(): Pose {
    return { x: this.L.dx + (this.fx() - 0.5) * 16, y: this.L.dy + (this.fx() - 0.5) * 14, w: this.L.pw, rot: (this.fx() - 0.5) * 40, face: true };
  }
  private handCardPose(c: Card): Pose {
    const e = this.handEls.get(c.id);
    const p = this.handPose.get(c.id) ?? this.seatPose(0);
    if (!e) return p;
    const lift = e.querySelector(".lg-lift")!.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    return { x: lift.left + lift.width / 2 - rr.left, y: lift.top + lift.height / 2 - rr.top, w: this.L.cw, rot: p.rot, face: true };
  }

  /**
   * A card flies from one pose to another along an arc: it rises (grows, its shadow drops away and
   * softens), wobbles, comes down; it flips when one end is face up and the other not.
   */
  private fly(c: Card | null, from: Pose, to: Pose, dur: number, o: FlyOpts = {}): Promise<void> {
    if (this.fast || this.closed) return Promise.resolve();
    const L = this.L;
    const f = el("div", "lg-fly");
    const sh = el("div", "lg-fly-sh");
    const flip = el("div", "lg-flip");
    if (c) {
      const back = cardDiv(null);
      back.classList.add("lg-bk");
      flip.append(cardDiv(c), back);
    } else flip.append(cardDiv(null));
    f.append(flip);
    this.flyEl.append(sh, f);
    const dx = to.x - from.x,
      dy = to.y - from.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const side = this.fx() < 0.5 ? -1 : 1;
    const bend = (o.bend ?? 0.16) * side;
    const qx = (from.x + to.x) / 2 - (dy / dist) * dist * bend,
      qy = (from.y + to.y) / 2 + (dx / dist) * dist * bend - Math.min(70, dist * 0.14);
    const lift = Math.min(0.2, 0.05 + dist / 2600);
    const spin = o.spin ?? 0;
    const ease = o.ease ?? "deal";
    const N = 12;
    const fr: Keyframe[] = [],
      sf: Keyframe[] = [];
    const tf = (x: number, y: number, rot: number, w: number) => `translate(${(x - L.pw / 2).toFixed(1)}px, ${(y - L.ph / 2).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${(w / L.pw).toFixed(3)})`;
    const end = o.settle ? 0.86 : 1;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const e = ease === "throw" ? 1 - Math.pow(1 - u, 2.2) : ease === "lift" ? u * u * (3 - 2 * u) : 1 - Math.pow(1 - u, 1.6);
      const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * qx + e * e * to.x;
      const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * qy + e * e * to.y;
      const h = Math.sin(Math.PI * e);
      const rot = from.rot + (to.rot - from.rot) * e + spin * h;
      const w = (from.w + (to.w - from.w) * e) * (1 + lift * h);
      const off = u * end;
      fr.push({ transform: tf(x, y, rot, w), offset: off });
      sf.push({ transform: tf(x + h * L.pw * 0.16 + 2, y + h * L.pw * 0.3 + 3, rot, w), opacity: 0.5 - h * 0.28, offset: off });
    }
    if (o.settle) {
      // it slides on a little past where it lands, and back
      const ux = dx / dist,
        uy = dy / dist;
      fr.push({ transform: tf(to.x + ux * 6, to.y + uy * 6, to.rot + side * 2.5, to.w), offset: 0.93 });
      fr.push({ transform: tf(to.x, to.y, to.rot, to.w), offset: 1 });
      sf.push({ transform: tf(to.x + ux * 6 + 2, to.y + uy * 6 + 3, to.rot + side * 2.5, to.w), opacity: 0.5, offset: 0.93 });
      sf.push({ transform: tf(to.x + 2, to.y + 3, to.rot, to.w), opacity: 0.5, offset: 1 });
    }
    const d = dur * this.speed;
    const a = f.animate(fr, { duration: d, easing: "linear", fill: "forwards" });
    sh.animate(sf, { duration: d, easing: "linear", fill: "forwards" });
    if (c) {
      const r0 = from.face ? 0 : 180,
        r1 = to.face ? 0 : 180;
      if (r0 !== r1) flip.animate([{ transform: `rotateY(${r0}deg)` }, { transform: `rotateY(${r1}deg)` }], { duration: d * 0.7 * end, delay: d * 0.1, easing: "ease-in-out", fill: "both" });
      else flip.style.transform = `rotateY(${r1}deg)`;
    }
    return a.finished.then(
      () => (f.remove(), sh.remove()),
      () => (f.remove(), sh.remove()),
    );
  }

  /** The riffle: the deck splits in two, the halves let go card by card into one, it squares up. */
  private async riffle(short = false) {
    this.snd.riffle(short ? 0.7 : 0.95);
    if (this.fast) return;
    const L = this.L;
    const halves = [-1, 1].map((s) => {
      const e = el("div", "lg-half");
      e.append(cardDiv(null));
      e.style.left = `${L.px}px`;
      e.style.top = `${L.py}px`;
      this.flyEl.append(e);
      return { e, s };
    });
    this.deck.classList.add("hold");
    const sp = this.speed * (short ? 0.75 : 1);
    const apart = (s: number) => `translate(-50%, -50%) translate(${s * L.pw * 0.56}px, ${-L.pw * 0.05}px) rotate(${s * 9}deg)`;
    const home = "translate(-50%, -50%)";
    await Promise.all(halves.map(({ e, s }) => e.animate([{ transform: home }, { transform: apart(s) }], { duration: 220 * sp, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" }).finished));
    // the cards fall from each half by turns
    const k = short ? 10 : 16;
    const drops: Promise<void>[] = [];
    for (let i = 0; i < k; i++) {
      const s = i % 2 ? 1 : -1;
      const from: Pose = { x: L.px + s * L.pw * 0.56, y: L.py - L.pw * 0.05, w: L.pw, rot: s * 9, face: false };
      drops.push(
        this.wait(i * 34 * (short ? 0.8 : 1)).then(() => this.fly(null, from, { x: L.px, y: L.py - 2, w: L.pw, rot: (this.fx() - 0.5) * 3, face: false }, 150, { bend: 0.05, ease: "lift" })),
      );
    }
    await Promise.all(drops);
    await Promise.all(halves.map(({ e, s }) => e.animate([{ transform: apart(s), opacity: 1 }, { transform: home, opacity: 0 }], { duration: 180 * sp, easing: "ease-in", fill: "forwards" }).finished));
    for (const { e } of halves) e.remove();
    this.deck.classList.remove("hold");
    // squared up: a tap on the felt
    this.deckCard.animate([{ scale: "1.03" }, { scale: "1" }], { duration: 160 * sp, easing: "ease-out" });
  }

  // ---- the view -------------------------------------------------------------------------------------

  private resetRound() {
    this.vHand = [];
    for (const e of this.handEls.values()) e.remove();
    this.handEls.clear();
    this.handPose.clear();
    this.vCount.fill(0);
    this.discardEl.replaceChildren();
    this.root.classList.add("lg-idle");
    this.sel = -1;
    this.setDir(1, false);
    for (let i = 0; i < this.n; i++) {
      this.seatEls[i].root.classList.remove("out", "one", "exposed", "turn", "won");
      this.drawFan(i, true);
    }
    this.refreshSeats();
  }

  private addHandCard(c: Card, hidden: boolean): HTMLDivElement {
    const e = el("div", "lg-hcard" + (hidden ? " hide" : ""));
    e.dataset.id = String(c.id);
    if (c.ink < 0) e.dataset.wild = "1";
    const lift = el("div", "lg-lift");
    lift.append(cardDiv(c));
    e.append(lift);
    this.handEl.append(e);
    this.handEls.set(c.id, e);
    this.vHand.push(c);
    // start where the pile is, so the first layout slides it in
    const p = this.pilePose();
    e.style.transition = "none";
    e.style.transform = `translate(${p.x - this.L.cw / 2}px, ${p.y - this.L.ch / 2}px)`;
    void e.offsetWidth;
    e.style.transition = "";
    return e;
  }
  private removeHandCard(c: Card) {
    const i = this.vHand.findIndex((x) => x.id === c.id);
    if (i >= 0) this.vHand.splice(i, 1);
    this.handEls.get(c.id)?.remove();
    this.handEls.delete(c.id);
    this.handPose.delete(c.id);
  }

  private addDiscard(c: Card, p: Pose, ink: number) {
    const d = cardDiv(c);
    d.style.transform = `translate(${p.x - this.L.dx}px, ${p.y - this.L.dy}px) rotate(${p.rot}deg)`;
    if (c.ink < 0) d.style.setProperty("--named", INKS[ink].c), d.classList.add("named");
    this.discardEl.append(d);
    while (this.discardEl.children.length > 12) this.discardEl.firstElementChild!.remove();
    // the pile settles: the older cards sink into the shadow
    const kids = this.discardEl.children;
    for (let i = 0; i < kids.length; i++) (kids[i] as HTMLElement).classList.toggle("old", i < kids.length - 4);
  }

  private setInk(ink: number) {
    const k = INKS[ink];
    this.root.style.setProperty("--ink", k.c);
    const pips = this.compass.children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle("on", i === ink);
    this.inkLabel.textContent = inkName(ink);
  }

  private setTurn(seat: number) {
    for (let i = 0; i < this.n; i++) this.seatEls[i].root.classList.toggle("turn", i === seat);
    const moved = seat !== this.turnSeat;
    this.turnSeat = seat;
    if (moved) this.placeToken(seat >= 0);
  }

  private refreshSeats() {
    const g = this.g;
    for (let i = 0; i < this.n; i++) {
      const s = this.seatEls[i];
      const k = this.vCount[i];
      s.count.style.visibility = k ? "" : "hidden";
      if (s.count.textContent !== String(k)) {
        s.count.textContent = String(k);
        s.count.classList.remove("bump");
        void s.count.offsetWidth;
        s.count.classList.add("bump");
      }
      s.root.classList.toggle("one", k === 1);
      s.root.classList.toggle("exposed", !!g && g.exposed === i && k === 1);
      s.pts.textContent = g ? `${g.scores[i]}` : "0";
      if (i > 0) this.drawFan(i);
    }
    this.pileCount.textContent = g ? `${this.vPile}` : "";
    this.deckEdge(this.vPile);
    const pend = g?.pending ?? 0;
    this.pendingEl.textContent = `+${pend}`;
    this.pendingEl.classList.toggle("on", pend > 0);
  }

  /** The hand's states and the buttons, from the engine. */
  private refreshButtons() {
    const g = this.g;
    const my = !!g && !!this.inputFn && g.turn === 0 && (g.phase === "turn" || g.phase === "drawn");
    const pass = !!this.passFn;
    this.handEl.classList.toggle("my", my);
    this.handEl.classList.toggle("pass", pass);
    this.vHand.forEach((c, i) => {
      const e = this.handEls.get(c.id);
      if (!e) return;
      const ok = my && g.canPlay(0, c);
      e.classList.toggle("ok", ok);
      e.classList.toggle("no", my && !ok);
      e.classList.toggle("drawn", my && g.phase === "drawn" && g.drawn?.id === c.id);
      e.classList.toggle("sel", (my || pass) && this.kbd && i === this.sel);
    });
    const live = my && g.phase === "turn";
    const key = `<span class="lg-key">D</span>`;
    if (my && g.phase === "drawn") this.drawBtn.innerHTML = `${T("Keep it", "留着")}${key}`;
    else if (my && g.pending > 0) this.drawBtn.innerHTML = `${T(`Take +${g.pending}`, `接受 +${g.pending}`)}${key}`;
    else this.drawBtn.innerHTML = `${T("Draw", "摸牌")}${key}`;
    this.drawBtn.disabled = !my;
    this.drawBtn.classList.toggle("flare", my && (g.phase === "drawn" || g.legal(0).length === 0));
    this.deck.classList.toggle("live", live && g.legal(0).length === 0);
    // the shout: a bell-push on the rail
    const b = this.callBtn;
    b.className = "lg-call";
    const face = (top: string, low: string) => `<span class="lg-dome"><span class="lg-cap">${top}</span></span><small>${low}</small>`;
    if (!g || this.auto) {
      b.innerHTML = face(T("LAST<br>SNARK!", "最后<br>一证！"), "L");
      b.disabled = true;
      return;
    }
    b.disabled = false;
    const active = g.phase === "turn" || g.phase === "drawn" || g.phase === "makers";
    if (g.canCall(0)) {
      b.classList.add("ready");
      if (g.hands[0].length === 1) b.classList.add("urgent");
      b.innerHTML = face(T("LAST<br>SNARK!", "最后<br>一证！"), T("press L", "按 L"));
    } else if (active && g.exposed > 0) {
      b.classList.add("catch");
      b.innerHTML = face(`${T("CATCH", "抓")}<br>${esc(this.o.seats[g.exposed].name.split(" ")[0])}!`, T("no call · L", "没喊 · L"));
    } else if (g.called[0] && g.hands[0].length <= 2 && active) {
      b.classList.add("done");
      b.innerHTML = face(T("CALLED", "已喊"), T("you're safe", "安全"));
      b.disabled = true;
    } else {
      b.innerHTML = face(T("LAST<br>SNARK!", "最后<br>一证！"), T("at 2 cards · L", "剩两张 · L"));
      b.disabled = true;
    }
  }
  private refresh() {
    if (this.closed) return;
    this.refreshSeats();
    this.refreshButtons();
    if (this.g) {
      const r = this.rules;
      this.hudSub.textContent = `${T("Round", "第")} ${this.g.round}${T("", " 局")} · ${r.target ? T(`first to ${r.target}`, `先到 ${r.target} 分`) : T("one round", "单局")}${r.stacking ? T(" · stacking", " · 叠加") : ""}${r.drawUntil ? T(" · draw till playable", " · 摸到能出") : ""}`;
    }
  }

  // ---- effects --------------------------------------------------------------------------------------

  private toast(html: string, color = "", ms = 1700) {
    if (this.fast) return;
    const t = this.toastEl;
    t.innerHTML = html;
    t.style.setProperty("--tc", color || "var(--flare)");
    t.classList.remove("on");
    void t.offsetWidth;
    t.classList.add("on");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove("on"), ms * Math.max(0.7, this.speed));
  }
  private seatName(i: number, cap = false) {
    return i === 0 ? (cap ? T("You", "你") : T("you", "你")) : esc(this.o.seats[i].name);
  }
  private seatPoint(seat: number) {
    return seat === 0 ? { x: this.L.hx, y: this.L.handY - this.L.ch * 0.4 } : this.L.seats[seat];
  }
  private stamp(seat: number, text: string, color: string) {
    if (this.fast) return;
    const s = el("div", "lg-stamp", text);
    s.style.color = color;
    (seat === 0 ? this.meEl : this.seatEls[seat].root).append(s);
    window.setTimeout(() => s.remove(), 1500);
  }
  /** A zkSNARK reacts: a pose of the plate for a moment (`hit`, `glitch`, `jump`, `skipped`, `won`). */
  private react(seat: number, kind: string, ms = 900, emote?: Emote) {
    if (this.fast || this.closed) return;
    const s = this.seatEls[seat];
    const r = s.root;
    r.classList.remove("hit", "glitch", "jump", "skipped");
    void r.offsetWidth;
    r.classList.add(kind);
    clearTimeout(s.react);
    s.react = window.setTimeout(() => r.classList.remove(kind), ms);
    if (emote) {
      s.emote.innerHTML = emoteSvg(emote);
      s.emote.classList.remove("on");
      void s.emote.offsetWidth;
      s.emote.classList.add("on");
      clearTimeout(s.emoteT);
      s.emoteT = window.setTimeout(() => s.emote.classList.remove("on"), 1500);
    }
  }
  private sparks(x: number, y: number, k: number, spread: number) {
    for (let j = 0; j < k; j++) {
      const s = el("i", "lg-spark");
      const a = this.fx() * Math.PI * 2,
        d = spread * (0.45 + this.fx() * 0.7);
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.background = INKS[j % 4].c;
      s.style.setProperty("--dx", `${Math.cos(a) * d}px`);
      s.style.setProperty("--dy", `${Math.sin(a) * d}px`);
      s.style.setProperty("--rz", `${(this.fx() - 0.5) * 720}deg`);
      this.flyEl.append(s);
      window.setTimeout(() => s.remove(), 1000);
    }
  }
  private shout(seat: number, text = T("LAST SNARK!", "最后一证！")) {
    if (this.fast) return;
    const L = this.L;
    const p = seat === 0 ? { x: L.hx, y: L.handY - L.ch * 0.8 } : L.seats[seat];
    const s = el("div", "lg-shout", `<span>${text}</span>`);
    const x = clamp(p.x, 130, L.W - 130);
    s.style.left = `${x}px`;
    s.style.top = `${p.y - (seat === 0 ? 0 : L.pic * 0.25)}px`;
    s.style.fontSize = `${seat === 0 ? (L.compact ? 34 : 52) : L.compact ? 22 : 32}px`;
    this.flyEl.append(s);
    this.sparks(x, p.y, 18, L.compact ? 70 : 110);
    window.setTimeout(() => s.remove(), 1750);
    this.snd.call(this.pan(p.x));
    this.snd.duck(0.3, 1.2);
    if (seat > 0) this.react(seat, "jump", 700, "bang");
  }
  private say(seat: number, key: string, prob = 1) {
    if (this.fast || seat === 0 || this.closed) return;
    const now = performance.now();
    const chat = 0.42 + ((this.o.seats[seat].id * 7) % 5) * 0.12;
    if (now - this.lastSay < 900 || now - this.seatSay[seat] < 2800 || this.fx() > prob * chat) return;
    const pool = LINES[key];
    if (!pool) return;
    const [en, zh] = pool[Math.floor(this.fx() * pool.length)];
    this.lastSay = this.seatSay[seat] = now;
    this.bubble(seat, esc(T(en, zh)), 2300);
  }
  private bubble(seat: number, html: string, ms: number, dots = false) {
    const b = this.seatEls[seat].bubble;
    b.innerHTML = html;
    b.classList.toggle("dots", dots);
    b.classList.add("on");
    clearTimeout(this.bubbleTimers[seat]);
    if (ms > 0) this.bubbleTimers[seat] = window.setTimeout(() => b.classList.remove("on"), ms);
  }
  private thinking(seat: number, on: boolean) {
    if (this.fast || seat === 0) return;
    const s = this.seatEls[seat];
    s.root.classList.toggle("thinking", on);
    const b = s.bubble;
    if (on) {
      if (b.classList.contains("on") && !b.classList.contains("dots")) return;
      this.bubble(seat, "<b></b><b></b><b></b>", 0, true);
    } else if (b.classList.contains("dots")) b.classList.remove("on");
  }

  // ---- the events, animated -------------------------------------------------------------------------

  private async show(evs: Ev[]) {
    for (const e of evs) {
      if (this.closed) throw new Closed();
      await this.showOne(e);
    }
    this.refresh();
  }
  private showAsync(evs: Ev[]) {
    if (!evs.length) return;
    this.refresh();
    this.show(evs).catch(() => {});
  }

  private async showOne(e: Ev): Promise<void> {
    const g = this.g;
    const name = (i: number) => this.seatName(i);
    switch (e.t) {
      case "deal":
        await this.dealOne(e.seat, e.card);
        return;
      case "start": {
        const p = this.discardPose();
        this.vPile--;
        await this.fly(e.card, this.pilePose(), p, 560, { ease: "lift", bend: 0.08, settle: true });
        this.snd.slap(this.pan(this.L.dx), 0.8);
        this.addDiscard(e.card, p, e.card.ink);
        this.setInk(e.card.ink);
        this.root.classList.remove("lg-idle");
        this.refreshSeats();
        return;
      }
      case "turn": {
        this.setTurn(e.seat);
        if (e.seat === 0 && !this.auto && !this.fast) {
          this.snd.turn();
          if (g.phase === "turn") this.toast(g.pending > 0 ? T(`<b>+${g.pending}</b> on you: stack a match or take it`, `<b>+${g.pending}</b> 轮到你：叠加或接受`) : T("Your turn", "轮到你了"), "", 1200);
        }
        return;
      }
      case "play": {
        const c = e.card;
        let from: Pose;
        if (e.seat === 0) {
          from = this.handCardPose(c);
          this.removeHandCard(c);
          this.layoutHand();
          this.snd.flick(this.pan(from.x));
        } else {
          from = this.seatPose(e.seat);
          this.vCount[e.seat]--;
        }
        this.refreshSeats();
        const to = this.discardPose();
        await this.fly(c, from, to, e.seat === 0 ? 360 : 470, { ease: "throw", spin: (this.fx() - 0.5) * 30, settle: true, bend: 0.1 });
        this.addDiscard(c, to, e.ink);
        this.setInk(e.ink);
        this.snd.slap(this.pan(this.L.dx), c.kind === "num" ? 0.85 : 1);
        if (c.ink < 0) {
          if (c.kind === "shor") this.snd.shor();
          else this.snd.fork();
          if (!this.fast) this.sparks(this.L.dx, this.L.dy, 14, this.L.pw * 1.2);
          this.compass.classList.remove("pick");
          void this.compass.offsetWidth;
          this.compass.classList.add("pick");
          this.toast(`${e.seat === 0 ? T("You name", "你指定") : `${name(e.seat)} ${T("names", "指定")}`} <b>${pipSvg(e.ink, 15)} ${inkName(e.ink)}</b>`, INKS[e.ink].c);
          this.say(e.seat, c.kind === "shor" ? "shor" : "fork", 0.9);
        } else if (c.kind === "fees") this.say(e.seat, "fees", 0.55);
        else if (c.kind === "skip") this.say(e.seat, "skip", 0.5);
        return this.wait(90);
      }
      case "draw": {
        const k = e.cards.length;
        if (!k) {
          this.toast(T("The deck is empty", "牌堆空了"));
          return this.wait(400);
        }
        const why = e.why;
        if (why === "fees" || why === "shor" || why === "stack" || why === "catch") {
          if (why === "fees" || why === "stack") this.snd.fees(this.pan(this.seatPoint(e.seat).x));
          if (e.seat > 0) this.react(e.seat, why === "shor" ? "glitch" : "hit", why === "shor" ? 1100 : 700, why === "catch" ? "anger" : "sweat");
          else this.react(0, why === "shor" ? "glitch" : "hit", 800);
          this.snd.hit(this.pan(this.seatPoint(e.seat).x));
        }
        if (why === "fees" || why === "shor" || why === "stack")
          this.toast(why === "stack" ? (e.seat === 0 ? T(`You take <b>+${k}</b>`, `你接受 <b>+${k}</b>`) : T(`${name(e.seat)} takes <b>+${k}</b>`, `${name(e.seat)} 接受 <b>+${k}</b>`)) : `<b>${why === "fees" ? T("+2 FEES", "+2 手续费") : T("DUST ATTACK", "粉尘攻击")}</b> · ${name(e.seat)} ${T(`draw${e.seat === 0 ? "" : "s"} ${k}`, `摸 ${k} 张`)}`);
        const gap = k > 5 ? 75 : 120;
        const jobs: Promise<void>[] = [];
        for (let j = 0; j < k; j++) jobs.push(this.wait(j * gap).then(() => this.drawOne(e.seat, e.cards[j])));
        await Promise.all(jobs);
        if (why === "fees" || why === "shor" || why === "stack" || why === "catch") this.say(e.seat, "hit", why === "catch" ? 0.4 : 0.7);
        else if (k >= 4) this.say(e.seat, "deep", 0.8);
        return;
      }
      case "reshuffle": {
        this.toast(T("The discard is shuffled back in", "弃牌洗回牌堆"), "", 1300);
        // the discard's cards (all but the top) slide over to the deck, then the riffle
        const keep = this.discardEl.lastElementChild;
        const moving = Array.from(this.discardEl.children).filter((d) => d !== keep) as HTMLElement[];
        if (!this.fast)
          await Promise.all(
            moving.map((d, i) => {
              const dx = this.L.px - this.L.dx;
              return d
                .animate([{ translate: "0 0" }, { translate: `${dx}px 0`, opacity: 0.2 }], { duration: 300 * this.speed, delay: i * 20 * this.speed, easing: "cubic-bezier(.5,0,.5,1)", fill: "forwards" })
                .finished.catch(() => {});
            }),
          );
        for (const d of moving) d.remove();
        this.vPile = e.count;
        this.refreshSeats();
        await this.riffle(true);
        return this.wait(120);
      }
      case "skip": {
        this.snd.skip(this.pan(this.seatPoint(e.seat).x));
        this.stamp(e.seat, T("SKIPPED", "跳过"), "#ff6b35");
        this.react(e.seat, "skipped", 1100, "dizzy");
        return this.wait(260);
      }
      case "reorg": {
        this.snd.reorg();
        this.setDir(e.dir, true);
        this.placeToken(false);
        const how = this.n === 2 ? T("with two at the table it's a missed block", "两人对局时等于漏块") : e.dir === 1 ? T("play runs clockwise", "改为顺时针") : T("play runs counter-clockwise", "改为逆时针");
        this.toast(`<b>${T("REORG", "重组")}</b> · ${how}`, "var(--lilac)");
        const who = g.discard.length ? this.lastPlayer : -1;
        if (who > 0) this.say(who, "reorg", 0.6);
        return this.wait(520);
      }
      case "stack": {
        this.refreshSeats();
        this.toast(T(`<b>+${e.pending}</b> stacked on ${name(e.seat)}`, `<b>+${e.pending}</b> 叠加给 ${name(e.seat)}`));
        return this.wait(200);
      }
      case "call": {
        this.shout(e.seat);
        if (e.late) this.toast(T(`${this.seatName(e.seat, true)} called it just in time`, `${name(e.seat)} 及时喊出`), "var(--sage)", 1300);
        this.refresh();
        return this.wait(e.seat === 0 ? 120 : 380);
      }
      case "exposed": {
        this.refresh();
        return;
      }
      case "caught": {
        this.snd.caught(this.pan(this.seatPoint(e.seat).x));
        this.stamp(e.seat, T("CAUGHT +2", "被抓 +2"), "#ff4a5a");
        this.toast(`<b>${T("Caught!", "抓到！")}</b> ${e.by === 0 ? T(`You catch ${name(e.seat)}`, `你抓到 ${name(e.seat)}`) : T(`${name(e.by)} catches ${name(e.seat)}`, `${name(e.by)} 抓到 ${name(e.seat)}`)} ${T("without a LAST SNARK: +2", "没喊最后一证：+2")}`, "#ff4a5a", 2000);
        if (e.by !== 0) {
          this.bubble(e.by, esc(T("LAST SNARK! Caught you!", "最后一证！抓到你了！")), 1800);
          this.react(e.by, "jump", 700, "bang");
        } else this.shout(0, T("CAUGHT!", "抓到了！"));
        this.say(e.seat, "caught", 0.9);
        return this.wait(320);
      }
      case "keep": {
        this.toast(e.seat === 0 ? T("You keep the card", "你留下了这张牌") : T(`${name(e.seat)} keeps the card`, `${name(e.seat)} 留下了这张牌`), "", 1100);
        return this.wait(150);
      }
      case "makers": {
        this.snd.makers();
        this.toast(`<b>${T("SHIELDED HOUR", "屏蔽时刻")}</b> · ${T(`everyone passes a card ${g.dir === 1 ? "clockwise" : "counter-clockwise"}`, `每人${g.dir === 1 ? "顺时针" : "逆时针"}传一张牌`)}`, "var(--lilac)", 2200);
        this.say(e.seat, "makers", 0.8);
        return this.wait(450);
      }
      case "passed": {
        this.snd.riffle(0.4);
        const jobs: Promise<void>[] = [];
        for (const m of e.moves) {
          const from = m.from === 0 ? this.handCardPose(m.card) : this.seatPose(m.from);
          if (m.from === 0) this.removeHandCard(m.card);
          if (m.to === 0) {
            const el2 = this.addHandCard(m.card, true);
            jobs.push(
              Promise.resolve().then(async () => {
                this.layoutHand();
                const to = this.handPose.get(m.card.id)!;
                await this.fly(m.card, { ...from, face: false }, to, 640, { bend: 0.2 });
                el2.classList.remove("hide");
              }),
            );
          } else jobs.push(this.fly(m.from === 0 ? m.card : null, from, this.seatPose(m.to), 640, { bend: 0.2 }));
        }
        this.layoutHand();
        await Promise.all(jobs);
        this.layoutHand();
        this.refresh();
        return;
      }
      case "out": {
        this.seatEls[e.seat].root.classList.add("out", "won");
        const p = this.seatPoint(e.seat);
        if (!this.fast) this.sparks(p.x, p.y, 34, 160);
        if (e.seat === 0) {
          this.snd.win();
          this.snd.duck(0.2, 2.5);
        } else this.snd.shed(this.pan(p.x));
        if (e.seat > 0) this.react(e.seat, "jump", 900, "spark");
        this.toast(e.seat === 0 ? T("<b>You shed your last snark!</b>", "<b>你出完了最后一证！</b>") : T(`<b>${name(e.seat)}</b> sheds the last snark`, `<b>${name(e.seat)}</b> 出完了最后一证`), "var(--sage)", 2400);
        this.say(e.seat, "win", 1);
        return this.wait(1100);
      }
      case "round":
        this.lastPts = e.pts;
        this.refreshSeats();
        return;
      case "over":
        return;
    }
  }
  private lastPlayer = -1;

  private async dealOne(seat: number, c: Card) {
    const to0 = seat === 0 ? null : this.seatPose(seat);
    const from = this.pilePose();
    this.vPile--;
    this.refreshSeats();
    this.snd.deal(this.pan(to0 ? to0.x : this.L.W / 2));
    if (seat === 0) {
      const e = this.addHandCard(c, true);
      this.layoutHand();
      await this.fly(c, from, this.handPose.get(c.id)!, 380, { spin: (this.fx() - 0.5) * 40, bend: 0.12 });
      e.classList.remove("hide");
    } else {
      await this.fly(null, from, to0!, 360, { spin: (this.fx() - 0.5) * 70, bend: 0.14 });
    }
    this.vCount[seat]++;
    this.refreshSeats();
  }
  private async drawOne(seat: number, c: Card) {
    const to0 = seat === 0 ? null : this.seatPose(seat);
    const from = this.pilePose();
    this.vPile = Math.max(0, this.vPile - 1);
    this.refreshSeats();
    this.snd.draw(this.pan(to0 ? to0.x : this.L.W / 2));
    if (seat === 0) {
      const e = this.addHandCard(c, true);
      this.layoutHand();
      await this.fly(c, from, this.handPose.get(c.id)!, 440, { ease: "lift", bend: 0.1 });
      e.classList.remove("hide");
    } else await this.fly(null, from, to0!, 400, { ease: "lift", bend: 0.12, spin: (this.fx() - 0.5) * 30 });
    this.vCount[seat]++;
    this.refreshSeats();
  }

  // ---- the round ------------------------------------------------------------------------------------

  private async playRound() {
    const g = this.g;
    const evs = g.round === 0 ? g.startRound() : g.nextRound();
    this.resetRound();
    this.setTurn(-1);
    this.refresh();
    this.prewarm();
    this.toast(T(`Round ${g.round}`, `第 ${g.round} 局`), "", 1200);
    // the riffle, then the deal: cards fly round the table, unsorted; then your hand fans into order
    this.sortHand = false;
    this.vPile = g.pile.length + this.n * HAND + 1;
    this.refreshSeats();
    await this.riffle();
    await this.wait(160);
    const deals = evs.filter((e) => e.t === "deal");
    const step = Math.min(80, 2600 / deals.length);
    await Promise.all(deals.map((e, k) => this.wait(k * step).then(() => this.showOne(e))));
    this.sortHand = true;
    this.layoutHand();
    await this.wait(380);
    await this.show(evs.filter((e) => e.t !== "deal"));

    while (g.phase !== "roundOver" && g.phase !== "gameOver") {
      await this.gate();
      if (g.phase === "makers") {
        await this.makersPhase();
        await this.armWindow();
        continue;
      }
      const seat = g.turn;
      const evs2 = seat === 0 && !this.auto ? await this.humanTurn() : await this.aiTurn(seat);
      const p = evs2.find((x) => x.t === "play");
      if (p && p.t === "play") this.lastPlayer = p.seat;
      await this.show(evs2);
      await this.armWindow();
    }
    this.clearWindow();
    this.setTurn(-1);
  }

  private async aiTurn(seat: number): Promise<Ev[]> {
    const g = this.g;
    const skill = this.o.seats[seat].skill;
    this.thinking(seat, true);
    await this.wait(thinkMs(this.ai, g.exposed >= 0) * (g.phase === "drawn" ? 0.55 : 1));
    await this.gate();
    this.thinking(seat, false);
    const m = decide(g, seat, skill, this.ai);
    this.clearWindow();
    if (m.t === "draw") return g.draw(seat);
    if (m.t === "keep") return g.keep(seat);
    const pre = m.call ? g.call(seat) : [];
    return [...pre, ...g.play(seat, m.card.id, m.ink)];
  }

  private async humanTurn(): Promise<Ev[]> {
    const g = this.g;
    if (this.sel < 0 || this.sel >= this.vHand.length) {
      const first = this.vHand.findIndex((c) => g.canPlay(0, c));
      this.sel = first;
    }
    if (g.phase === "drawn" && g.drawn) this.sel = this.vHand.findIndex((c) => c.id === g.drawn!.id);
    for (;;) {
      const a = await new Promise<Act>((res) => {
        this.inputFn = res;
        this.refreshButtons();
      });
      // the move is taken: the hand and the buttons go quiet at once (not after the animations)
      this.inputFn = null;
      this.refreshButtons();
      if (a.t === "play") {
        if (!g.canPlay(0, a.card)) continue;
        let ink = -1;
        if (a.card.ink < 0) {
          ink = await this.pickInk();
          if (ink < 0 || !g.canPlay(0, a.card)) continue;
        }
        this.clearWindow();
        const evs = g.play(0, a.card.id, ink);
        if (evs.length) return evs;
      } else if (a.t === "draw") {
        this.clearWindow();
        const evs = g.draw(0);
        if (evs.length) return evs;
      } else {
        const evs = g.keep(0);
        if (evs.length) return evs;
      }
    }
  }

  private async makersPhase() {
    const g = this.g;
    let evs: Ev[] = [];
    for (let i = 0; i < this.n; i++) {
      if (i === 0 && !this.auto) continue;
      if (g.hands[i].length && !g.picks[i]) evs = evs.concat(g.makersPick(i, passPick(g.hands[i], this.o.seats[i].skill, this.ai).id));
    }
    if (!this.auto && g.phase === "makers") {
      const next = g.next(0);
      this.toast(T(`<b>SHIELDED HOUR</b> · pick a card to pass to ${this.seatName(next)}`, `<b>屏蔽时刻</b> · 选一张牌传给 ${this.seatName(next)}`), "var(--lilac)", 60000);
      this.sel = Math.max(0, this.sel);
      const c = await new Promise<Card>((res) => {
        this.passFn = res;
        this.refreshButtons();
      });
      this.passFn = null;
      this.refreshButtons();
      this.toastEl.classList.remove("on");
      evs = evs.concat(g.makersPick(0, c.id));
    }
    await this.show(evs);
  }

  // ---- the catch window -----------------------------------------------------------------------------

  private clearWindow() {
    for (const t of this.winTimers) clearTimeout(t);
    this.winTimers = [];
  }
  private async armWindow() {
    this.clearWindow();
    const g = this.g;
    const v = g.exposed;
    if (v < 0 || this.closed) return;
    const skills = this.o.seats.map((s) => s.skill);
    const bot = (i: number) => i !== 0 || this.auto;
    if (this.fast) {
      if (!bot(v)) return;
      const w = windowOutcome(g, skills, this.ai, thinkMs(this.ai, true));
      if (w?.t === "call") await this.show(g.call(v));
      else if (w?.t === "catch" && bot(w.by)) await this.show(g.catchOut(w.by));
      return;
    }
    for (let i = 0; i < this.n; i++) {
      if (i === v || !bot(i)) continue;
      const d = catchDelay(skills[i], this.ai);
      if (d !== null)
        this.winTimers.push(
          window.setTimeout(() => {
            if (!this.closed && !this.paused && this.g.exposed === v) this.showAsync(this.g.catchOut(i));
          }, d * this.speed),
        );
    }
    if (bot(v)) {
      const d = lateCallDelay(skills[v], this.ai);
      if (d !== null)
        this.winTimers.push(
          window.setTimeout(() => {
            if (!this.closed && this.g.exposed === v) this.showAsync(this.g.call(v));
          }, d * this.speed),
        );
    }
  }

  // ---- input ----------------------------------------------------------------------------------------

  /** A finger on the hand: the card shown as picked when it went down. */
  private scrub: { sel: number } | null = null;
  private onHandDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") this.scrub = { sel: this.kbd ? this.sel : -1 };
  };
  /** A finger sliding along the hand picks the card under it (a phone's cards are narrow). */
  private onHandMove = (e: PointerEvent) => {
    if (!this.scrub || this.closed || !(this.inputFn || this.passFn)) return;
    const i = this.cardAt(e);
    if (i < 0 || (this.kbd && i === this.sel)) return;
    this.sel = i;
    this.kbd = true;
    this.snd.tick();
    this.refreshButtons();
  };
  /** The hand's card under a finger (its touch stays with the card it started on). */
  private cardAt(e: PointerEvent) {
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".lg-hcard");
    if (!t || !this.handEl.contains(t)) return -1;
    return this.vHand.findIndex((c) => c.id === Number(t.dataset.id));
  }
  private onHandPointer = (e: PointerEvent) => {
    if (this.touch && this.scrub) {
      // a touch screen: the card under the finger is picked; a tap on the card already picked plays it
      const was = this.scrub.sel;
      this.scrub = null;
      const i = this.cardAt(e);
      if (i < 0 || this.closed) return;
      const c = this.vHand[i];
      this.kbd = true;
      this.sel = i;
      if (i !== was && (this.inputFn || this.passFn)) return this.refreshButtons();
      if (this.passFn) this.passFn(c);
      else if (this.inputFn && this.g.canPlay(0, c)) this.inputFn({ t: "play", card: c });
      else this.refreshButtons();
      return;
    }
    const t = (e.target as HTMLElement).closest<HTMLElement>(".lg-hcard");
    if (!t || this.closed) return;
    const id = Number(t.dataset.id);
    const i = this.vHand.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = this.vHand[i];
    // a touch picks first, a second touch plays (cards overlap on a phone); a click plays at once
    const touch = e.pointerType === "touch" || e.pointerType === "pen";
    this.kbd = touch;
    if (touch && this.sel !== i && (this.inputFn || this.passFn)) {
      this.sel = i;
      this.refreshButtons();
      return;
    }
    this.sel = i;
    if (this.passFn) this.passFn(c);
    else if (this.inputFn && this.g.canPlay(0, c)) this.inputFn({ t: "play", card: c });
    else this.refreshButtons();
  };
  private onDraw() {
    if (!this.inputFn || !this.g) return;
    this.inputFn(this.g.phase === "drawn" ? { t: "keep" } : { t: "draw" });
  }
  private onCall() {
    const g = this.g;
    if (!g || this.auto || this.closed) return;
    if (g.canCall(0)) this.showAsync(g.call(0));
    else if (g.exposed > 0 && (g.phase === "turn" || g.phase === "drawn" || g.phase === "makers")) this.showAsync(g.catchOut(0));
    this.refreshButtons();
  }
  private onKeyUp = (e: KeyboardEvent) => {
    if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
  };
  private onKey = (e: KeyboardEvent) => {
    if (this.closed || e.metaKey || e.ctrlKey || e.altKey) return;
    e.stopPropagation();
    if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
    const top = this.keys[this.keys.length - 1];
    if (top) {
      if (top(e)) e.preventDefault();
      return;
    }
    if (this.gameKey(e)) e.preventDefault();
  };
  private gameKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const g = this.g;
    if (k === "Escape") {
      void this.confirmLeave();
      return true;
    }
    if (k === "h" || k === "H" || k === "?") {
      void this.showHelp();
      return true;
    }
    if (!g) return false;
    if (k === "l" || k === "L") {
      this.onCall();
      return true;
    }
    if (e.repeat && (k === "Enter" || k === " ")) return true;
    const choosing = !!this.inputFn || !!this.passFn;
    if (k === "d" || k === "D") {
      this.onDraw();
      return true;
    }
    if (!choosing) return k === " " || k.startsWith("Arrow");
    const n = this.vHand.length;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      if (!n) return true;
      if (!this.kbd) {
        // the first press shows the pick where it is
        this.kbd = true;
        if (this.sel >= 0 && (this.passFn || g.canPlay(0, this.vHand[this.sel]))) {
          this.refreshButtons();
          return true;
        }
      }
      const dir = k === "ArrowLeft" ? -1 : 1;
      let i = this.sel < 0 ? (dir > 0 ? -1 : n) : this.sel;
      // jump over the cards that cannot go (when choosing a play)
      for (let s = 0; s < n; s++) {
        i = (i + dir + n) % n;
        if (this.passFn || g.canPlay(0, this.vHand[i])) break;
      }
      this.sel = i;
      this.snd.tick();
      this.refreshButtons();
      return true;
    }
    if (k === "Enter" || k === " " || k === "ArrowUp") {
      const c = this.vHand[this.sel];
      if (!c) return true;
      if (this.passFn) this.passFn(c);
      else if (this.inputFn && g.canPlay(0, c)) this.inputFn({ t: "play", card: c });
      return true;
    }
    return false;
  }

  // ---- the ink picker -------------------------------------------------------------------------------

  /** Four enamel tokens round the discard: pick the ink a wild names. */
  private pickInk(): Promise<number> {
    if (this.fast) return Promise.resolve(0);
    const L = this.L;
    const scrim = el("div", "lg-scrim");
    const p = el("div", "lg-picker");
    const size = L.compact ? 236 : 286;
    p.style.width = p.style.height = `${size}px`;
    p.style.left = `${clamp(L.dx, size / 2 + 8, L.W - size / 2 - 8)}px`;
    p.style.top = `${clamp(L.dy, size / 2 + 50, L.H - size / 2 - 8)}px`;
    // the ink you hold most is the suggestion
    const cnt = [0, 0, 0, 0];
    for (const c of this.g.hands[0]) if (c.ink >= 0) cnt[c.ink]++;
    let hot = cnt.indexOf(Math.max(...cnt));
    // up IRONWOOD, right SAPLING, down ORCHARD, left SPROUT (the arrow keys)
    let h = `<div class="lg-picker-mid">${T("Name the pool", "指定池")}<small>${T("arrows · Enter", "方向键 · 回车")}</small></div>`;
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 2;
      const k = INKS[i];
      h += `<button class="lg-wedge${i === hot ? " hot" : ""}" data-ink="${i}" style="--ic:${k.c};--id:${k.deep};left:${(50 + Math.cos(a) * 33).toFixed(1)}%;top:${(50 + Math.sin(a) * 33).toFixed(1)}%"><svg viewBox="0 0 20 20"><path d="${pipPath(i, 10, 10, 8.4)}"/></svg><span>${inkName(i)}</span><small>${cnt[i]} ${T("held", "张")}</small></button>`;
    }
    p.innerHTML = h;
    this.root.append(scrim, p);
    this.snd.tick();
    return new Promise<number>((res) => {
      const done = (v: number) => {
        scrim.remove();
        p.remove();
        this.keys.pop();
        if (v >= 0) this.snd.tick();
        res(v);
      };
      const setHot = (i: number) => {
        hot = i;
        this.snd.tick();
        p.querySelectorAll(".lg-wedge").forEach((w, j) => w.classList.toggle("hot", j === i));
      };
      p.addEventListener("click", (ev) => {
        const w = (ev.target as Element).closest<HTMLElement>(".lg-wedge");
        if (w) done(Number(w.dataset.ink));
      });
      scrim.addEventListener("click", () => done(-1));
      this.keys.push((e) => {
        const k = e.key;
        const dirs: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
        if (k in dirs) {
          if (hot === dirs[k] || /\d/.test(k)) done(dirs[k]);
          else setHot(dirs[k]);
        } else if (k === "Enter" || k === " ") done(hot);
        else if (k === "Escape") done(-1);
        return true;
      });
    });
  }

  // ---- panels ---------------------------------------------------------------------------------------

  /** A modal panel; `keys` gets the keys while it is up. Resolves when `close` is called. */
  private panel(html: string, wire: (p: HTMLDivElement, close: () => void) => KeyFn, z = 30, cls = ""): Promise<void> {
    const ov = el("div", "lg-ov");
    ov.style.zIndex = String(z);
    const p = el("div", `lg-panel ${cls}`, html);
    ov.append(p);
    this.root.append(ov);
    return new Promise<void>((res) => {
      let open = true;
      const close = () => {
        if (!open) return;
        open = false;
        ov.remove();
        const i = this.keys.indexOf(kf);
        if (i >= 0) this.keys.splice(i, 1);
        res();
      };
      const kf = wire(p, close);
      this.keys.push(kf);
    });
  }

  private seatMini(i: number) {
    const s = this.o.seats[i];
    const img = personImage(s.id);
    return `<span class="lg-mini" style="--sc:${s.color}">${img ? `<img src="${img}" alt="">` : "<i></i>"}<span>${esc(i === 0 ? T("You", "你") : s.name)}${i ? `<small>${s.skill >= 0.8 ? T("shark", "高手") : s.skill >= 0.55 ? T("sharp", "老练") : s.skill >= 0.4 ? T("casual", "休闲") : T("rookie", "新手")}</small>` : `<small>${T("seat 1", "1 号位")}</small>`}</span></span>`;
  }
  private who(i: number) {
    const s = this.o.seats[i];
    const img = personImage(s.id);
    return `<div class="lg-who" style="--sc:${s.color}">${img ? `<img src="${img}" alt="">` : ""}<span>${esc(i === 0 ? T("You", "你") : s.name)}</span></div>`;
  }

  /** About how many minutes a game takes at this table (from the all-AI sims). */
  private minutes(target: number) {
    const n = this.n;
    const acts = 30 + 7.6 * n;
    const r250 = [9.4, 6.8, 5.0, 4.0, 2.9, 2.25, 1.65][n - 2] ?? 2;
    const r150 = [5.7, 3.9, 2.7, 1.9, 1.4, 1.17, 1.04][n - 2] ?? 1.3;
    const rounds = target <= 0 ? 1 : target >= 250 ? r250 : r150;
    const sec = acts * rounds * (((n - 1) / n) * 1.3 + (1 / n) * 2.6);
    return Math.max(1, Math.round(sec / 60));
  }

  private async setup(): Promise<Rules> {
    let saved: Partial<Rules> = {};
    try {
      saved = JSON.parse(localStorage.getItem("glyph.rules") ?? "{}") as Partial<Rules>;
    } catch {
      saved = {};
    }
    const rules: Rules = { ...RULES, ...saved };
    if (this.auto || this.fast) {
      // the bench: ?rules=quick,stack,until,nomakers
      const q = new URLSearchParams(location.search).get("rules") ?? "";
      return { target: q.includes("quick") ? 0 : q.includes("150") ? 150 : 250, stacking: q.includes("stack"), drawUntil: q.includes("until"), makers: !q.includes("nomakers") };
    }
    this.prewarm();
    const hero = [
      { id: 1, ink: 0, kind: "num", n: 7 },
      { id: 2, ink: 1, kind: "reorg", n: -1 },
      { id: 3, ink: -1, kind: "shor", n: -1 },
      { id: 4, ink: 2, kind: "skip", n: -1 },
      { id: 5, ink: 3, kind: "num", n: 2 },
    ] as Card[];
    const heroHtml = hero.map((c, i) => sizedCard(c, `h${i}`)).join("");
    const seg = (key: string, opts: [string, string][]) => `<div class="lg-seg" data-k="${key}">${opts.map(([v, label]) => `<button data-v="${v}">${label}</button>`).join("")}</div>`;
    const pot = this.o.stake * this.n;
    const html =
      `<div class="lg-hero">${heroHtml}</div>` +
      `<h1 class="lg-h1">LAST SNARK</h1>` +
      `<p class="lg-lead">${T("Match the pool or the symbol, shed your hand, and shout <b>LAST SNARK!</b> on your last card, before a rival catches you.", "同池或同符出牌，出光手牌；只剩一张时要喊<b>“最后一证！”</b>，别被对手抓到。")}</p>` +
      `<div class="lg-seats-row">${this.o.seats.map((_, i) => this.seatMini(i)).join("")}</div>` +
      `<div class="lg-rules">` +
      `<div class="lg-row"><span>${T("Game", "局制")}</span>${seg("target", [
        ["0", `${T("1 round", "单局")}<small>~${this.minutes(0)}′</small>`],
        ["150", `${T("To 150", "到 150")}<small>~${this.minutes(150)}′</small>`],
        ["250", `${T("To 250", "到 250")}<small>~${this.minutes(250)}′</small>`],
      ])}</div>` +
      `<div class="lg-row"><span>${T("When you draw", "摸牌")}</span>${seg("drawUntil", [
        ["0", T("One card", "摸一张")],
        ["1", T("Until playable", "摸到能出")],
      ])}</div>` +
      `<div class="lg-row"><span>${T("Stack +2 / +4", "叠加 +2 / +4")}</span>${seg("stacking", [
        ["0", T("Off", "关")],
        ["1", T("On", "开")],
      ])}</div>` +
      `<div class="lg-row"><span>${T("SHIELDED HOUR cards", "屏蔽时刻牌")}</span>${seg("makers", [
        ["1", T("In", "加入")],
        ["0", T("Out", "移除")],
      ])}</div></div>` +
      `<div class="lg-note">${pot ? T(`Buy-in ⓩ${this.o.stake} (play chips) · pot ⓩ${pot} · pays ${shares(this.n).join("/")} %`, `买入 ⓩ${this.o.stake}（游戏筹码）· 奖池 ⓩ${pot} · 分配 ${shares(this.n).join("/")} %`) : T("Free table · no chips at stake", "免费桌 · 不押筹码")}${this.o.seedNote ? ` · ${esc(this.o.seedNote)}` : ""}</div>` +
      `<div class="lg-cta"><button class="lg-btn ghost" data-a="help">${T("How to play", "玩法")}</button><button class="lg-btn ghost" data-a="leave">${T("Leave", "离开")}</button><button class="lg-btn flare" data-a="go">${T("Deal", "发牌")}</button></div>`;
    let leave = false;
    await this.panel(
      html,
      (p, close) => {
        const sync = () => {
          p.querySelectorAll<HTMLElement>(".lg-seg").forEach((s) => {
            const k = s.dataset.k as keyof Rules;
            const v = k === "target" ? String(rules.target) : rules[k] ? "1" : "0";
            s.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
          });
        };
        sync();
        // the hero fan
        p.querySelectorAll<HTMLElement>(".lg-hero .lg-sized").forEach((c, i) => {
          c.style.transform = `translate(-50%, -50%) translate(${(i - 2) * 50}px, ${Math.abs(i - 2) ** 1.6 * 7}px) rotate(${(i - 2) * 9}deg)`;
          c.animate([{ transform: `translate(-50%, -50%) translateY(60px) rotate(${(i - 2) * 30}deg)`, opacity: 0 }, { transform: c.style.transform, opacity: 1 }], { duration: 560, delay: 120 + i * 80, easing: "cubic-bezier(.2,1.25,.4,1)", fill: "backwards" });
        });
        p.addEventListener("click", (ev) => {
          const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!b) return;
          const s = b.closest<HTMLElement>(".lg-seg");
          if (s) {
            const k = s.dataset.k as keyof Rules;
            if (k === "target") rules.target = Number(b.dataset.v);
            else (rules as unknown as Record<string, boolean>)[k] = b.dataset.v === "1";
            this.snd.tick();
            sync();
            return;
          }
          if (b.dataset.a === "help") void this.showHelp();
          else if (b.dataset.a === "leave") {
            leave = true;
            close();
          } else if (b.dataset.a === "go") close();
        });
        return (e) => {
          if (e.key === "Enter" || e.key === " ") close();
          else if (e.key === "Escape") {
            leave = true;
            close();
          } else if (e.key === "h" || e.key === "H" || e.key === "?") void this.showHelp();
          return true;
        };
      },
      30,
      "lg-setup",
    );
    if (leave) {
      this.exit(null);
      throw new Closed();
    }
    try {
      localStorage.setItem("glyph.rules", JSON.stringify(rules));
    } catch {
      // (a private window)
    }
    return rules;
  }

  private async roundPanel(final: boolean) {
    const g = this.g;
    const w = g.winner;
    if (this.fast) return;
    const pts = this.lastPts;
    const gained = pts.reduce((s, x, i) => (i === w ? s : s + x), 0);
    const tgt = this.rules.target;
    const rows = Array.from({ length: this.n }, (_, i) => i)
      .sort((a, b) => (a === w ? -1 : b === w ? 1 : pts[a] - pts[b]))
      .map((i) => {
        const left = g.hands[i].map((c) => sizedCard(c)).join("");
        const bar = tgt ? `<div class="lg-bar" style="--sc:${this.o.seats[i].color}"><i style="width:${Math.min(100, (100 * g.scores[i]) / tgt).toFixed(1)}%"></i></div>` : "";
        return `<tr class="${i === w ? "win" : ""}${i === 0 ? " me" : ""}"><td>${this.who(i)}</td><td><div class="lg-left">${i === w ? `<span class="lg-outmark">${T("OUT", "出完")}</span>` : left}</div></td><td class="num">${i === w ? `+${gained}` : pts[i]}</td><td class="num tot">${g.scores[i]}${bar}</td></tr>`;
      })
      .join("");
    const title = w === 0 ? T("You shed the last snark!", "你出完了最后一证！") : T(`${esc(this.o.seats[w].name)} sheds the last snark`, `${esc(this.o.seats[w].name)} 出完了最后一证`);
    const html =
      `<div class="lg-sheet-head"><span>${T(`Round ${g.round}`, `第 ${g.round} 局`)}</span><span>${tgt ? T(`to ${tgt}`, `到 ${tgt}`) : T("one round", "单局")}</span></div>` +
      `<h2 class="lg-h2">${title}</h2>` +
      `<p class="lg-lead">${T(`Cards left in hand go to the winner: numbers at face value, actions 20, wilds 50.`, `剩余手牌计入赢家：数字按面值，功能牌 20，万能牌 50。`)}${tgt ? " " + T(`First to ${tgt} wins the table.`, `先到 ${tgt} 分者赢。`) : ""}</p>` +
      `<table class="lg-table-res"><thead><tr><th></th><th>${T("left in hand", "剩余手牌")}</th><th class="num">${T("round", "本局")}</th><th class="num">${T("total", "总分")}</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="lg-cta"><button class="lg-btn flare" data-a="go">${final ? T("Final standings", "最终排名") : T("Next round", "下一局")}</button></div>`;
    if (w === 0) this.snd.win();
    else this.snd.tick();
    await this.panel(
      html,
      (p, close) => {
        p.querySelector("[data-a=go]")!.addEventListener("click", close);
        if (this.auto) window.setTimeout(close, 1400);
        return (e) => {
          if (e.key === "Enter" || e.key === " ") close();
          else if (e.key === "Escape") void this.confirmLeave();
          return true;
        };
      },
      30,
      "lg-sheet",
    );
  }

  private async finalPanel(res: TableResult) {
    if (this.fast) return;
    const g = this.g;
    const place = res.order.indexOf(0);
    const stake = this.o.stake;
    const rows = res.order
      .map((i, p) => {
        const pay = payoutFor(p, this.n, stake);
        return `<tr class="${i === 0 ? "me" : ""}${p === 0 ? " win" : ""}"><td class="pl">${ord(p)}</td><td>${this.who(i)}</td><td class="num">${g.scores[i]} ${T("pts", "分")}</td>${stake ? `<td class="num ${pay ? "lg-pay" : ""}">${pay ? `ⓩ${pay}` : "—"}</td>` : ""}</tr>`;
      })
      .join("");
    const head = place === 0 ? T("You win the table!", "你赢下了这桌！") : T(`You finish ${ord(place)}`, `你获得${ord(place)}`);
    const html =
      `<div class="lg-sheet-head"><span>${T("Final standings", "最终排名")}</span><span>${this.n} ${T("seats", "人")}</span></div>` +
      `<div class="lg-big">${head}</div>` +
      `<p class="lg-lead">${stake ? (res.payout ? T(`You take <b class="lg-pay">ⓩ${res.payout}</b> from the ⓩ${stake * this.n} pot (play chips).`, `你从 ⓩ${stake * this.n} 奖池拿走 <b class="lg-pay">ⓩ${res.payout}</b>（游戏筹码）。`) : T(`No payout this time: the ⓩ${stake} buy-in stays in the pot (play chips).`, `这次没有奖金：ⓩ${stake} 买入留在奖池（游戏筹码）。`)) : T("A free table: bragging rights only.", "免费桌：只为荣誉。")}</p>` +
      `<table class="lg-table-res"><tbody>${rows}</tbody></table>` +
      `<div class="lg-cta"><button class="lg-btn flare" data-a="go">${T("Leave the table", "离桌")}</button></div>`;
    if (place === 0) this.snd.win();
    else if (res.payout) this.snd.coin();
    else this.snd.lose();
    this.snd.duck(0.25, 3);
    await this.panel(
      html,
      (p, close) => {
        p.querySelector("[data-a=go]")!.addEventListener("click", close);
        if (this.auto) window.setTimeout(close, 1600);
        return (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Escape") close();
          return true;
        };
      },
      30,
      "lg-sheet",
    );
  }

  private helpOpen = false;
  private async showHelp() {
    if (this.helpOpen || this.closed) return;
    this.helpOpen = true;
    this.pause(true);
    const ex = (c: Partial<Card>, b: string, d: string) => `<div class="lg-help-card">${sizedCard({ id: 0, ink: 0, kind: "num", n: 0, ...c } as Card)}<div><b>${b}</b>${d}</div></div>`;
    const html =
      `<h2 class="lg-h2">${T("How to play LAST SNARK", "最后一证 · 玩法")}</h2>` +
      `<ul class="lg-list">` +
      `<li>${T("Play a card that matches the <b>pool</b> or the <b>symbol</b> on the discard. Can't (or won't)? <b>Draw</b> (D or the deck).", "出一张与弃牌<b>同池</b>或<b>同符</b>的牌。出不了？<b>摸牌</b>（D 或点牌堆）。")}</li>` +
      `<li>${T("On your second-to-last card press <b>LAST SNARK!</b> (L). Forget it and a rival who catches you before the next player acts makes you draw 2. Catch them back with L.", "出倒数第二张牌时按<b>最后一证！</b>（L）。忘了喊，被对手在下一位行动前抓到就摸 2 张。你也可以按 L 抓别人。")}</li>` +
      `<li>${T("Shed every card to win the round and score what the others still hold: numbers at face value, actions 20, wilds 50.", "出完所有牌赢下本局，得分为其他人剩余手牌：数字按面值，功能牌 20，万能牌 50。")}</li>` +
      `<li>${T("The lit mark on the discard's ring is the pool in play; the token on the track shows whose turn it is, the chevrons which way play runs.", "弃牌圈上亮起的记号是当前的池；轨道上的令牌指向轮到的人，箭头表示出牌方向。")}</li>` +
      `<li>${T("Keys: ← → pick · Enter play · D draw/keep · L call/catch · Esc leave. Touch: tap to pick, tap again to play.", "按键：← → 选牌 · 回车出牌 · D 摸牌/留牌 · L 喊/抓 · Esc 离开。触屏：点一下选中，再点出牌。")}</li>` +
      `</ul><div class="lg-help-grid">` +
      ex({ ink: 2, kind: "skip" }, T("MISSED BLOCK", "漏块"), T("The next player loses a turn.", "下一位跳过一轮。")) +
      ex({ ink: 1, kind: "reorg" }, T("REORG", "重组"), T("Play turns the other way (with 2 players: play again).", "出牌方向反转（两人时：再出一次）。")) +
      ex({ ink: 0, kind: "fees" }, T("+2 FEES", "+2 手续费"), T("The next player draws 2 and loses a turn.", "下一位摸 2 张并跳过。")) +
      ex({ ink: -1, kind: "fork" }, T("FORK", "分叉"), T("Wild: goes on anything, you name the pool.", "万能：任何时候可出，由你指定池。")) +
      ex({ ink: -1, kind: "shor" }, T("DUST ATTACK", "粉尘攻击"), T("Wild: the Tracker dusts the next player: they draw 4 and lose a turn; you name the pool.", "万能：追踪者向下一位撒粉尘：摸 4 张并跳过；由你指定池。")) +
      ex({ ink: 3, kind: "makers" }, T("SHIELDED HOUR", "屏蔽时刻"), T("Everyone passes one card to the next player.", "每人把一张牌传给下一位。")) +
      `</div><p class="lg-note">${T("Pools: IRONWOOD (flame) · SAPLING (diamond) · ORCHARD (hexagon) · SPROUT (leaf). Options: stacking +2/+4 passes the penalty on; “until playable” draws until a card goes.", "池：铁木（火焰）· 树苗（菱形）· 果园（六边形）· 萌芽（叶子）。选项：叠加 +2/+4 可把惩罚传下去；“摸到能出”一直摸到能出的牌。")}</p>` +
      `<div class="lg-cta"><button class="lg-btn flare" data-a="go">${T("Got it", "明白了")}</button></div>`;
    await this.panel(
      html,
      (p, close) => {
        p.querySelector("[data-a=go]")!.addEventListener("click", close);
        p.parentElement!.addEventListener("click", (e) => e.target === p.parentElement && close());
        return (e) => {
          if (e.key === "Enter" || e.key === "Escape" || e.key === " " || e.key === "h" || e.key === "H") close();
          return true;
        };
      },
      40,
    );
    this.helpOpen = false;
    this.pause(false);
  }

  private leaveOpen = false;
  private async confirmLeave() {
    if (this.closed || this.leaveOpen) return;
    if (this.g?.phase === "gameOver" && this.result) return this.exit(this.result);
    this.leaveOpen = true;
    this.pause(true);
    let go = false;
    const stake = this.o.stake;
    await this.panel(
      `<h2 class="lg-h2">${T("Leave the table?", "离开牌桌？")}</h2><p class="lg-lead">${stake ? T(`The game is not over: your ⓩ${stake} buy-in stays in the pot (play chips).`, `游戏还没结束：你的 ⓩ${stake} 买入会留在奖池（游戏筹码）。`) : T("The game is not over yet.", "游戏还没结束。")}</p><div class="lg-cta"><button class="lg-btn ghost" data-a="stay">${T("Keep playing", "继续玩")}</button><button class="lg-btn flare" data-a="leave">${T("Leave", "离开")}</button></div>`,
      (p, close) => {
        p.querySelector("[data-a=stay]")!.addEventListener("click", close);
        p.querySelector("[data-a=leave]")!.addEventListener("click", () => {
          go = true;
          close();
        });
        return (e) => {
          if (e.key === "Escape") close();
          else if (e.key === "Enter") {
            go = true;
            close();
          }
          return true;
        };
      },
      45,
    );
    this.leaveOpen = false;
    if (go) this.exit(null);
    else this.pause(false);
  }
}
