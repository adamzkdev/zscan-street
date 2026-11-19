/**
 * BLOCK BARONS at the table: the 3D board (view3d.ts) under a HUD made of table things: the
 * barons as chip medallions round the edge (their portraits react: they flinch when they pay,
 * hop when they collect, sit behind bars in the Penitentiary), a receipt-tape ledger, keycap
 * buttons, a turn tracker, and card-stock deeds, event cards, bid slips and trade trays.
 * The human's seat is an `Agent` answered through that HUD; the zkSNARK barons (ai.ts) are paced
 * with readable thinking pauses. The rules engine (engine.ts) runs the game; every event it emits
 * is animated, and heard (sound.ts), here before the next one.
 */
import "./barons.css";
import { T, relang } from "../../i18n/lang";
import { personImage } from "../../party/people";
import { drawMark } from "../../party/theme";
import type { TableOpts, TableResult } from "../types";
import { BANK, Game, PARKPOT, type Agent, type Ev, type Offer } from "./engine";
import { Baron, personaOf, type Persona } from "./ai";
import { GROUPS, GROUP_SPACES, JAIL_FINE, LINES, LINE_RENT, MEMPOOL, MODES, OWNABLE, QIPS, SPACES, START_CASH, UTILS, UTIL_MULT, shares, type Mode } from "./board";
import { BoardView } from "./view3d";
import { iconURL } from "./art";
import { lineFor } from "./lines";
import { TableSound } from "./sound";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const cr = (n: number) => `${fmt(n)} cr`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const spaceName = (i: number) => T(SPACES[i].en, SPACES[i].zh);
/** The ⓩ mark (src/party/theme.ts) as a data URL, for the wordmark and the top bar. */
let markSrc = "";
const markURL = () => {
  if (!markSrc) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    drawMark(c.getContext("2d")!, 64, 64, 128, "#ece4d3", "#ff6b35");
    markSrc = c.toDataURL();
  }
  return markSrc;
};
const colorOf = (i: number) => {
  const s = SPACES[i];
  return s.group !== undefined ? GROUPS[s.group].color : s.kind === "line" ? "#ff6b35" : "#8a8784";
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Line icons for the keycaps and tools (24 × 24, drawn in the button's ink). */
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON: Record<string, string> = {
  dice: svg(`<rect x="2.5" y="7.5" width="11" height="11" rx="2.4"/><rect x="11" y="3" width="10.5" height="10.5" rx="2.4" transform="rotate(12 16 8)"/><circle cx="5.6" cy="10.6" r="1" class="f"/><circle cx="10.4" cy="15.4" r="1" class="f"/><circle cx="8" cy="13" r="1" class="f"/><circle cx="16.3" cy="8.2" r="1" class="f"/>`),
  house: svg(`<path d="M3.5 11.5 12 4.5l8.5 7"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>`),
  trade: svg(`<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>`),
  end: svg(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  cards: svg(`<rect x="3" y="6" width="9.5" height="13" rx="1.6" transform="rotate(-10 7.7 12.5)"/><rect x="10" y="4.5" width="9.5" height="13" rx="1.6" transform="rotate(8 14.7 11)"/>`),
  chip: svg(`<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>`),
  key: svg(`<circle cx="8" cy="12" r="3.8"/><path d="M11.8 12H20.5M17.5 12v3M20.5 12v2.5"/>`),
  broke: svg(`<circle cx="12" cy="12" r="8.5"/><path d="M8 8l8 8M16 8l-8 8"/>`),
  gavel: svg(`<path d="M13.5 4.5l6 6M11 7l6 6M12.2 5.8l-3.7 3.7 6 6 3.7-3.7"/><path d="M10.2 12.8 3.5 19.5"/>`),
  stamp: svg(`<path d="M9 3.5h6v5.5l2.5 2.5v3.5h-11v-3.5L9 9z"/><path d="M4.5 19.5h15"/>`),
  music: svg(`<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.8" cy="17.5" r="2.4"/><circle cx="16.8" cy="15.5" r="2.4"/>`),
  ff: svg(`<path d="M4 6l7 6-7 6zM12.5 6l7 6-7 6z"/>`),
  help: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.5 2.6c-.6.3-.9.8-.9 1.5v.6"/><circle cx="12" cy="17" r=".9" class="f"/>`),
  close: svg(`<path d="M6 6l12 12M18 6 6 18"/>`),
  eye: svg(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`),
};

/** A die face as a little ivory square with pips (the HUD's dice readout). */
function dieSVG(n: number) {
  const P: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [
      [7.5, 7.5],
      [16.5, 16.5],
    ],
    3: [
      [7, 7],
      [12, 12],
      [17, 17],
    ],
    4: [
      [7.5, 7.5],
      [16.5, 7.5],
      [7.5, 16.5],
      [16.5, 16.5],
    ],
    5: [
      [7, 7],
      [17, 7],
      [12, 12],
      [7, 17],
      [17, 17],
    ],
    6: [
      [7.5, 6.5],
      [16.5, 6.5],
      [7.5, 12],
      [16.5, 12],
      [7.5, 17.5],
      [16.5, 17.5],
    ],
  };
  return `<svg class="bb-die" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5"/>${P[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 3 : 2.1}"${n === 1 ? ' class="one"' : ""}/>`).join("")}</svg>`;
}

interface Btn {
  label: string;
  /** Information that matters (a price, a count): never filler. */
  sub?: string;
  kind?: "primary" | "ghost" | "danger" | "good";
  disabled?: boolean;
  key?: string;
  /** The keyboard key shown on the cap. */
  kbd?: string;
  icon?: string;
  on: () => void;
}

type React = "pay" | "ouch" | "gain" | "buy" | "deal" | "jail" | "win" | "nod";
type Phase = "roll" | "move" | "act";

class Closed extends Error {}

/** A zkSNARK baron at the table: its decisions, with a thinking pause the player can read. */
class Paced implements Agent {
  constructor(
    readonly ai: Baron,
    private t: Table,
  ) {}
  async manage(g: Game, seat: number, phase: "pre" | "post") {
    if (phase === "pre") await this.t.think(seat, 0.25);
    return this.ai.manage(g, seat, phase);
  }
  async jail(g: Game, seat: number) {
    await this.t.think(seat, 0.6);
    return this.ai.jail(g, seat);
  }
  async buy(g: Game, seat: number, i: number) {
    await this.t.think(seat, 0.55);
    return this.ai.buy(g, seat, i);
  }
  async bid(g: Game, seat: number, i: number) {
    return this.ai.bid(g, seat, i);
  }
  async raise(g: Game, seat: number, owed: number) {
    await this.t.think(seat, 0.5);
    return this.ai.raise(g, seat, owed);
  }
  async answer(g: Game, o: Offer) {
    await this.t.think(o.to, 0.9);
    return this.ai.answer(g, o);
  }
}

/** The human's seat: every decision through the HUD. */
class Human implements Agent {
  jailChoice: "pay" | "pardon" | "roll" = "roll";
  constructor(private t: Table) {}
  manage(_g: Game, _seat: number, phase: "pre" | "post") {
    return this.t.humanManage(phase);
  }
  async jail() {
    return this.jailChoice;
  }
  buy(_g: Game, _s: number, i: number) {
    return this.t.askBuy(i);
  }
  bid(_g: Game, _s: number, i: number) {
    return this.t.askBid(i);
  }
  raise(_g: Game, _s: number, owed: number) {
    return this.t.askRaise(owed);
  }
  answer(_g: Game, o: Offer) {
    return this.t.askAnswer(o);
  }
}

export class Table {
  private root: HTMLElement;
  private view: BoardView;
  private snd = new TableSound();
  private g: Game | null = null;
  private mode: Mode = "speed";
  private exited = false;
  private closed = false;
  private ff = false;
  private fast: boolean;
  private auto: boolean;
  private personas: Persona[];
  private bots: (Baron | null)[] = [];
  private human: Human;
  // the HUD's own copy of the board, moved by the events as they play
  private cash: number[];
  private shownCash: number[];
  private own: number[] = SPACES.map(() => BANK);
  private lvl: number[] = SPACES.map(() => 0);
  private mort: boolean[] = SPACES.map(() => false);
  private park = 0;
  private outSeats = new Set<number>();
  private active = -1;
  private t0 = 0;
  private deadlineAt = 0;
  private raf = 0;
  private offs: (() => void)[] = [];
  private bubbles = new Map<number, { el: HTMLElement; until: number }>();
  private logLines: string[] = [];
  private txN = 0;
  private busy = false;
  private redrawBar: (() => void) | null = null;
  private modalStack: { el: HTMLElement; close?: () => void }[] = [];
  private inPropose = false;
  // the HUD's parts
  private seatsEl!: HTMLElement;
  private barEl!: HTMLElement;
  private turnEl!: HTMLElement;
  private btnsEl!: HTMLElement;
  private logEl!: HTMLElement;
  private topEl!: HTMLElement;
  private roundEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private bubbleEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private diceEl!: HTMLElement;
  private seatEls: HTMLElement[] = [];
  private cashEls: HTMLElement[] = [];
  private reactT = new Map<number, number>();
  private phase: Phase = "roll";
  private sp = { x: 0, y: 0, on: false };
  /** A touch screen (its speech bubbles are kept apart). */
  private coarse = matchMedia("(pointer: coarse)").matches;
  private status = "";

  constructor(private o: TableOpts) {
    relang();
    this.fast = !!o.lab?.fast;
    this.auto = !!o.lab?.auto;
    // (the bench, tablelab.html: its scripted checks reach the table to open each screen)
    if (o.lab) (window as unknown as { baronsTable?: Table }).baronsTable = this;
    this.cash = o.seats.map(() => START_CASH);
    this.shownCash = this.cash.slice();
    this.personas = o.seats.map((s) => personaOf(o.seed, s.seat));
    this.human = new Human(this);
    this.root = el("div", "bb-root");
    o.root.appendChild(this.root);
    const stage = el("div", "bb-stage");
    this.root.appendChild(stage);
    this.view = new BoardView(stage, {
      seats: o.seats,
      names: (i) => [T(SPACES[i].en, SPACES[i].zh), T(SPACES[i].subEn ?? "", SPACES[i].subZh ?? "")],
      deckNames: ["MEMPOOL", "ZIP"],
      title: "BLOCK BARONS",
      tagline: "A PROPERTY GAME OF ZSTREET",
      bank: "THE BANK · CREDITS ONLY",
    });
    this.view.speed = this.fast ? 1000 : 1;
    this.view.onPick = (i) => this.showDeed(i);
    this.root.appendChild(el("div", "bb-vignette"));
    this.buildHud();
    const kd = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener("keydown", kd, true);
    this.offs.push(() => window.removeEventListener("keydown", kd, true));
    const ro = new ResizeObserver(() => this.fitInsets());
    ro.observe(this.root);
    this.offs.push(() => ro.disconnect());
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.hudFrame();
    };
    this.raf = requestAnimationFrame(loop);
    if (!this.fast) this.snd.start();
    if (this.auto) void this.start("speed");
    else this.startScreen();
  }

  // ---- the HUD -----------------------------------------------------------------------------------

  private buildHud() {
    const r = this.root;
    this.topEl = el("div", "bb-top");
    this.topEl.innerHTML = `<div class="bb-brand"><i class="bb-mark" style="background-image:url(${markURL()})"></i><b>BLOCK BARONS</b><span class="bb-mode"></span></div>
      <div class="bb-meta"><div class="bb-round"></div><div class="bb-clock"></div></div>
      <div class="bb-tools">
        <button class="bb-tool bb-mus${this.snd.musicOn ? " on" : ""}" title="${T("Music", "音乐")}">${ICON.music}</button>
        <button class="bb-tool bb-ff" title="${T("Fast-forward (F)", "快进 (F)")}">${ICON.ff}</button>
        <button class="bb-tool bb-help" title="${T("Rules (H)", "规则 (H)")}">${ICON.help}</button>
        <button class="bb-tool bb-exit" title="${T("Leave (Esc)", "离开 (Esc)")}">${ICON.close}</button>
      </div>`;
    r.appendChild(this.topEl);
    this.roundEl = this.topEl.querySelector(".bb-round")!;
    this.clockEl = this.topEl.querySelector(".bb-clock")!;
    this.topEl.querySelector<HTMLButtonElement>(".bb-mus")!.onclick = (e) => {
      this.snd.setMusic(!this.snd.musicOn);
      (e.currentTarget as HTMLElement).classList.toggle("on", this.snd.musicOn);
      this.snd.ui();
    };
    this.topEl.querySelector<HTMLButtonElement>(".bb-ff")!.onclick = () => this.toggleFF();
    this.topEl.querySelector<HTMLButtonElement>(".bb-help")!.onclick = () => this.showHelp();
    this.topEl.querySelector<HTMLButtonElement>(".bb-exit")!.onclick = () => this.askLeave();
    this.seatsEl = el("div", "bb-seats");
    r.appendChild(this.seatsEl);
    this.o.seats.forEach((s) => {
      const c = el("div", "bb-seat");
      c.style.setProperty("--c", s.color);
      const persona = this.personas[s.seat];
      c.innerHTML = `${this.medal(s.seat)}
        <div class="bb-who"><b>${esc(s.human ? T("You", "你") : s.name)}</b><small>${s.human ? T("Human baron", "人类大亨") : esc(T(persona.en, persona.zh))}</small></div>
        <div class="bb-cash"><i class="bb-stack"></i><span>${fmt(START_CASH)}</span><em>cr</em></div>
        <div class="bb-own"></div>
        <div class="bb-tags"></div>
        <div class="bb-stamp">${T("BANKRUPT", "破产")}</div>`;
      c.onclick = () => this.showPortfolio(s.seat);
      this.seatsEl.appendChild(c);
      this.seatEls.push(c);
      this.cashEls.push(c.querySelector<HTMLElement>(".bb-cash span")!);
    });
    this.logEl = el("div", "bb-log", `<header><b>${T("LEDGER", "账本")}</b><small>${T("BOARD MONEY · cr", "棋盘货币 · cr")}</small></header><div class="bb-lines"></div>`);
    r.appendChild(this.logEl);
    this.diceEl = el("div", "bb-dice");
    r.appendChild(this.diceEl);
    this.barEl = el("div", "bb-bar");
    this.turnEl = el("div", "bb-turnb");
    this.btnsEl = el("div", "bb-btns");
    this.barEl.append(this.turnEl, this.btnsEl);
    r.appendChild(this.barEl);
    this.bubbleEl = el("div", "bb-bubbles");
    r.appendChild(this.bubbleEl);
    this.toastEl = el("div", "bb-toasts");
    r.appendChild(this.toastEl);
    this.renderSeats();
    this.renderTurn();
    this.fitInsets();
  }

  /** A baron's medallion: their portrait in a clay chip of their colour. */
  private medal(seat: number, cls = "") {
    const s = this.o.seats[seat];
    return `<div class="bb-med ${cls}" style="--c:${s.color}"><img src="${personImage(s.id)}" alt=""><i class="bb-bars"></i><i class="bb-emote"></i></div>`;
  }

  /** Keep the board in the middle of what the HUD leaves free. */
  private fitInsets() {
    const R = this.root.getBoundingClientRect();
    if (!R.width) return;
    const s = this.seatsEl.getBoundingClientRect();
    const t = this.topEl.getBoundingClientRect();
    const lg = this.logEl.getBoundingClientRect();
    const wide = R.width >= 900;
    const portrait = R.width < 640 && R.height > R.width;
    const landscape = R.height < 520 && R.width > R.height;
    // On a touch screen the bar keeps clear of the home bar and the notch, and the board leaves that room too.
    // An upright tablet has the barons in a strip across the top (barons.css), so the board takes the full width.
    const coarse = matchMedia("(pointer: coarse)").matches;
    const tall = coarse && !portrait && R.width > 640 && R.height > R.width;
    const bs = coarse ? getComputedStyle(this.barEl) : null;
    const lift = (base: number) => (bs ? Math.max(0, parseFloat(bs.bottom) - base) : 0);
    const shift = (base: number) => (bs ? Math.max(0, parseFloat(bs.right) - base) : 0);
    // (the bar's room is fixed: the board must not jump as its buttons come and go)
    if (portrait) this.view.setInsets({ left: 0, right: 0, top: Math.max(t.bottom, s.bottom) - R.top + 2, bottom: 164 + lift(10) });
    else if (landscape) this.view.setInsets({ left: s.right - R.left, right: 214 + shift(8), top: t.bottom - R.top, bottom: 0 });
    else if (tall) this.view.setInsets({ left: 0, right: 0, top: s.bottom - R.top + 6, bottom: 112 + lift(16) });
    else this.view.setInsets({ left: s.right - R.left + 4, right: wide && lg.width ? R.right - lg.left + 4 : 0, top: t.bottom - R.top, bottom: 112 });
  }

  private renderSeats() {
    const g = this.g;
    this.o.seats.forEach((s, k) => {
      const c = this.seatEls[k];
      c.classList.toggle("on", this.active === k);
      c.classList.toggle("out", this.outSeats.has(k));
      // the deeds held: little cards in their district's colour, fanned by district
      const own = c.querySelector<HTMLElement>(".bb-own")!;
      let html = "";
      for (let gi = 0; gi < GROUPS.length; gi++) {
        const sp = GROUP_SPACES[gi];
        const mine = sp.filter((i) => this.own[i] === k);
        if (!mine.length) continue;
        const full = mine.length === sp.length;
        html += `<span class="bb-fan${full ? " full" : ""}" style="--g:${GROUPS[gi].color}">${mine.map((i) => `<i class="${this.mort[i] ? "m" : ""}${this.lvl[i] ? ` l${this.lvl[i]}` : ""}"></i>`).join("")}</span>`;
      }
      const ln = LINES.filter((i) => this.own[i] === k);
      const ut = UTILS.filter((i) => this.own[i] === k);
      if (ln.length) html += `<span class="bb-fan line">${ln.map((i) => `<i class="${this.mort[i] ? "m" : ""}"></i>`).join("")}</span>`;
      if (ut.length) html += `<span class="bb-fan util">${ut.map((i) => `<i class="${this.mort[i] ? "m" : ""}"></i>`).join("")}</span>`;
      if (own.innerHTML !== html) own.innerHTML = html;
      const b = g?.p[k];
      c.classList.toggle("jailed", !!b?.jailed && !b.out);
      const tags = c.querySelector<HTMLElement>(".bb-tags")!;
      const th = b && b.pardons.length ? `<span class="bb-tag pardon" title="${T("VIEWING KEY PARDON", "查看密钥特赦")}">${ICON.key}×${b.pardons.length}</span>` : "";
      if (tags.innerHTML !== th) tags.innerHTML = th;
    });
  }

  /** The turn tracker: whose turn, what they are doing, ROLL · MOVE · ACT. */
  private renderTurn() {
    const a = this.active;
    if (a < 0) {
      this.turnEl.innerHTML = "";
      this.turnEl.classList.remove("on");
      return;
    }
    const s = this.o.seats[a];
    const you = s.human && !this.auto;
    const steps: [Phase, string][] = [
      ["roll", T("ROLL", "掷骰")],
      ["move", T("MOVE", "移动")],
      ["act", T("ACT", "行动")],
    ];
    const at = steps.findIndex((x) => x[0] === this.phase);
    this.turnEl.classList.add("on");
    this.turnEl.style.setProperty("--c", s.color);
    this.turnEl.innerHTML = `${this.medal(a, "sm")}<div class="bb-tw"><b>${you ? T("YOUR TURN", "你的回合") : esc(s.name)}</b><small>${this.status}</small></div><ol class="bb-steps">${steps.map(([k, l], i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}" data-k="${k}">${l}</li>`).join("")}</ol>`;
  }
  private setPhase(p: Phase, status = this.status) {
    if (this.fast) return;
    if (p === this.phase && status === this.status) return;
    this.phase = p;
    this.status = status;
    this.renderTurn();
  }

  /** A portrait's reaction (shake, hop, nod…), and an emote over it. */
  private react(seat: number, kind: React, emote = "") {
    if (this.fast || seat < 0 || seat >= this.seatEls.length) return;
    const c = this.seatEls[seat];
    const kinds: React[] = ["pay", "ouch", "gain", "buy", "deal", "jail", "win", "nod"];
    c.classList.remove(...kinds.map((k) => `r-${k}`));
    void c.offsetWidth;
    c.classList.add(`r-${kind}`);
    const em = c.querySelector<HTMLElement>(".bb-emote")!;
    em.textContent = emote;
    em.classList.toggle("show", !!emote);
    clearTimeout(this.reactT.get(seat));
    this.reactT.set(
      seat,
      window.setTimeout(() => {
        c.classList.remove(`r-${kind}`);
        em.classList.remove("show");
      }, 1300),
    );
  }

  private hudFrame() {
    // cash counters ease to their values
    for (let k = 0; k < this.cash.length; k++) {
      const d = this.cash[k] - this.shownCash[k];
      if (Math.abs(d) < 0.5) {
        if (this.shownCash[k] !== this.cash[k]) {
          this.shownCash[k] = this.cash[k];
          this.cashEls[k].textContent = fmt(this.cash[k]);
        }
        continue;
      }
      this.shownCash[k] += d * Math.min(1, this.fast ? 1 : 0.16);
      this.cashEls[k].textContent = fmt(this.shownCash[k]);
    }
    // speech bubbles follow their tokens (or sit by the medallion when the token is off screen)
    const now = performance.now();
    if (this.bubbles.size) {
      const R = this.root.getBoundingClientRect();
      const S = this.seatsEl.getBoundingClientRect();
      // The barons in a strip across the top (a phone or a tablet held upright): beside a medallion is
      // the next baron, so a bubble hangs under the strip instead, and one over the board stays below it.
      const s0 = this.seatEls[0]?.getBoundingClientRect(),
        s1 = this.seatEls[1]?.getBoundingClientRect();
      const strip = !!s0 && !!s1 && Math.abs(s1.top - s0.top) < s0.height / 2;
      // (on a touch screen, bubbles at once never cover each other: under the strip, each one below the
      // ones it would cover; over the board, where tokens share a space, each one above them)
      const stack = strip || this.coarse;
      // (a touch screen on its side has its keys in a column on the right: a bubble stays left of them)
      const bar = this.barEl.getBoundingClientRect();
      const right = this.coarse && bar.height > bar.width ? bar.left - R.left - 6 : R.width;
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const hits = (x: number, y: number, w: number, h: number) => placed.find((q) => x < q.x + q.w && q.x < x + w && y < q.y + q.h + 6 && q.y < y + h + 6);
      for (const [seat, b] of this.bubbles) {
        if (now > b.until) {
          b.el.remove();
          this.bubbles.delete(seat);
          continue;
        }
        const p = this.view.screenOf(seat, this.sp);
        let x: number, y: number;
        const side = !strip && (!p.on || p.x - R.left < S.right - R.left + 30);
        const under = strip && (!p.on || p.y - R.top < S.bottom - R.top + 20);
        b.el.classList.toggle("side", side);
        b.el.classList.toggle("under", under);
        if (side) {
          const m = this.seatEls[seat].querySelector(".bb-med")!.getBoundingClientRect();
          x = m.right - R.left + 8;
          y = m.top - R.top + m.height / 2;
          b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(0, -50%)`;
        } else if (under) {
          // (under its baron's medallion, its tail pointing up at it)
          const m = this.seatEls[seat].querySelector(".bb-med")!.getBoundingClientRect();
          const mx = m.left + m.width / 2 - R.left;
          const w = b.el.offsetWidth;
          const h = b.el.offsetHeight;
          x = Math.max(6, Math.min(R.width - w - 6, mx - w / 2));
          y = S.bottom - R.top + 10;
          for (let q = hits(x, y, w, h), k = 0; q && k < 8; q = hits(x, y, w, h), k++) y = q.y + q.h + 8;
          placed.push({ x, y, w, h });
          b.el.style.setProperty("--tail", `${Math.round(Math.max(14, Math.min(w - 14, mx - x)))}px`);
          b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        } else {
          const hw = b.el.offsetWidth / 2 + 6;
          x = Math.max(hw, Math.min(right - hw, p.x - R.left));
          y = Math.max(b.el.offsetHeight + (strip ? S.bottom - R.top + 10 : 56), p.y - R.top);
          if (stack) {
            // (y is the bubble's foot: it climbs over the ones already there, or drops under them at the top)
            const w = b.el.offsetWidth,
              h = b.el.offsetHeight;
            const floor = (strip ? S.bottom - R.top + 10 : 56) + h;
            for (let q = hits(x - w / 2, y - h, w, h), k = 0; q && k < 8; q = hits(x - w / 2, y - h, w, h), k++) y = q.y - 8 >= floor ? q.y - 8 : q.y + q.h + 8 + h;
            placed.push({ x: x - w / 2, y: y - h, w, h });
          }
          b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
        }
      }
    }
    // the clock
    if (this.g && !this.g.over && this.deadlineAt) {
      const left = Math.max(0, this.deadlineAt - now) / 1000;
      const m = Math.floor(left / 60),
        s = Math.floor(left % 60);
      const txt = left <= 0 ? T("LAST TURN", "最后一回合") : `${m}:${String(s).padStart(2, "0")}`;
      const b = this.clockEl.querySelector("b");
      if (b && b.textContent !== txt) b.textContent = txt;
      this.clockEl.classList.toggle("low", left < 60);
    }
  }

  private say(seat: number, key: string, ms = 2200) {
    if (this.fast || this.outSeats.has(seat)) return;
    const l = lineFor(key, seat);
    if (!l) return;
    this.bubble(seat, T(l[0], l[1]), ms);
  }
  private bubble(seat: number, text: string, ms: number, cls = "") {
    const old = this.bubbles.get(seat);
    old?.el.remove();
    const b = el("div", `bb-bubble ${cls}`);
    b.style.setProperty("--c", this.o.seats[seat].color);
    if (cls === "think") b.innerHTML = "<i></i><i></i><i></i>";
    else b.textContent = text;
    this.bubbleEl.appendChild(b);
    this.bubbles.set(seat, { el: b, until: performance.now() + ms / (this.ff ? 2 : 1) });
  }
  /** A zkSNARK thinks it over (dots over its head, its medallion leaning in), shorter on fast-forward. */
  async think(seat: number, s: number) {
    if (this.fast) return;
    this.bubble(seat, "", s * 1000 + 200, "think");
    const c = this.seatEls[seat];
    c.classList.add("thinking");
    if (seat === this.active) this.setPhase(this.phase, T("thinking…", "思考中……"));
    await this.view.wait(s * (0.7 + Math.random() * 0.6));
    c.classList.remove("thinking");
    const b = this.bubbles.get(seat);
    if (b && b.el.classList.contains("think")) (b.el.remove(), this.bubbles.delete(seat));
    if (this.closed) throw new Closed();
  }

  /** A line on the ledger tape (newest first). */
  private log(en: string, zh: string, c = "", amt = "") {
    this.txN++;
    const line = `<p style="--c:${c || "#8a8784"}"><i>${String(this.txN).padStart(4, "0")}</i><span>${T(en, zh)}</span>${amt ? `<b>${amt}</b>` : ""}</p>`;
    this.logLines.unshift(line);
    if (this.logLines.length > 9) this.logLines.length = 9;
    const box = this.logEl.querySelector<HTMLElement>(".bb-lines")!;
    box.innerHTML = this.logLines.join("");
    if (!this.fast) box.firstElementChild?.classList.add("new");
  }
  private toast(html: string, cls = "", ms = 1600) {
    if (this.fast) return;
    const t = el("div", `bb-toast ${cls}`, html);
    this.toastEl.appendChild(t);
    setTimeout(() => t.classList.add("bye"), ms / (this.ff ? 2 : 1));
    setTimeout(() => t.remove(), ms / (this.ff ? 2 : 1) + 450);
  }
  private floatDelta(seat: number, v: number) {
    if (this.fast || !v) return;
    const c = this.seatEls[seat];
    const f = el("div", `bb-delta ${v > 0 ? "up" : "down"}`, `${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}`);
    c.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }
  private nm(seat: number) {
    if (seat === BANK) return T("the bank", "银行");
    if (seat === PARKPOT) return T("CENTRAL PARK", "中央公园");
    return this.o.seats[seat].human ? T("You", "你") : this.o.seats[seat].name;
  }
  private col(seat: number) {
    return seat >= 0 ? this.o.seats[seat].color : "#8a8784";
  }
  /** A pan for a seat's sounds: their token's side of the screen. */
  private pan(seat: number) {
    if (seat < 0) return 0;
    const p = this.view.screenOf(seat);
    const w = this.root.clientWidth || 1;
    return Math.max(-0.6, Math.min(0.6, (p.x / w - 0.5) * 1.2));
  }

  private bar(btns: Btn[]) {
    this.btnsEl.innerHTML = "";
    for (const b of btns) {
      const x = el("button", `bb-btn ${b.kind ?? "ghost"}`, `${b.icon ? `<span class="bb-ico">${ICON[b.icon] ?? ""}</span>` : ""}<span class="bb-bl"><b>${b.label}</b>${b.sub ? `<small>${b.sub}</small>` : ""}</span>${b.kbd ? `<kbd>${b.kbd}</kbd>` : ""}`);
      x.disabled = !!b.disabled;
      if (b.key) x.dataset.key = b.key;
      x.onclick = () => {
        if (x.disabled || this.busy) return;
        this.snd.ui();
        b.on();
      };
      this.btnsEl.appendChild(x);
    }
    this.barEl.classList.toggle("mine", btns.some((b) => b.kind === "primary"));
  }
  private waitingBar() {
    const a = this.active;
    this.redrawBar = null;
    if (a < 0 || this.o.seats[a]?.human) return this.bar([]);
    this.bar([{ label: T("YOUR DEEDS", "你的地契"), icon: "cards", on: () => this.showPortfolio(0) }]);
  }

  private onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest?.("input,textarea")) {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    const k = e.key;
    if (k === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      const top = this.modalStack[this.modalStack.length - 1];
      if (top?.close) top.close();
      else this.askLeave();
      return;
    }
    if (k === " " || k === "Enter") {
      const top = this.modalStack[this.modalStack.length - 1];
      const b = (top?.el ?? this.barEl).querySelector<HTMLButtonElement>("button.primary:not(:disabled)");
      if (b) {
        e.preventDefault();
        e.stopPropagation();
        b.click();
      }
      return;
    }
    if (this.modalStack.length) return;
    if (k === "f" || k === "F") this.toggleFF();
    else if (k === "h" || k === "H" || k === "?") this.showHelp();
    else if (k === "m" || k === "M") this.barEl.querySelector<HTMLButtonElement>('button[data-key="m"]')?.click();
    else if (k === "t" || k === "T") this.barEl.querySelector<HTMLButtonElement>('button[data-key="t"]')?.click();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  private toggleFF() {
    this.ff = !this.ff;
    if (!this.fast) this.view.speed = this.ff ? 2.6 : 1;
    this.topEl.querySelector(".bb-ff")!.classList.toggle("on", this.ff);
    this.snd.ui(this.ff ? 2 : 0);
  }

  // ---- windows -----------------------------------------------------------------------------------

  private modal(cls: string, html: string, close?: () => void) {
    const wrap = el("div", `bb-modal ${cls}`);
    const card = el("div", "bb-card", html);
    wrap.appendChild(card);
    if (close)
      wrap.addEventListener("pointerdown", (e) => {
        if (e.target === wrap) close();
      });
    this.root.appendChild(wrap);
    const entry = { el: wrap, close };
    this.modalStack.push(entry);
    requestAnimationFrame(() => wrap.classList.add("in"));
    const done = () => {
      const i = this.modalStack.indexOf(entry);
      if (i >= 0) this.modalStack.splice(i, 1);
      wrap.classList.remove("in");
      wrap.classList.add("out");
      setTimeout(() => wrap.remove(), 240);
    };
    return { wrap, card, done };
  }

  /** A deed as a printed title card (any space with a price). */
  private deedHTML(i: number) {
    const s = SPACES[i];
    const grp = s.group !== undefined ? GROUPS[s.group] : null;
    const c = colorOf(i);
    const owner = this.own[i];
    let rows = "";
    const row = (label: string, v: string, on: boolean) => `<tr class="${on ? "on" : ""}"><td>${label}</td><td class="dots"></td><td>${v}</td></tr>`;
    if (s.kind === "deed") {
      const r = s.rent!;
      const lv = this.lvl[i];
      const full = owner >= 0 && GROUP_SPACES[s.group!].every((j) => this.own[j] === owner);
      rows += row(T("Rent", "租金"), cr(r[0]), owner >= 0 && lv === 0 && !full);
      rows += row(T("Whole district", "整区"), cr(r[0] * 2), owner >= 0 && lv === 0 && full);
      for (let k = 1; k <= 4; k++) rows += row(T(`With ${k} miner${k > 1 ? "s" : ""}`, `${k} 台矿机`), cr(r[k]), lv === k);
      rows += row(T("With a FOUNDRY", "铸造厂"), cr(r[5]), lv === 5);
    } else if (s.kind === "line") {
      const n = owner >= 0 ? LINES.filter((j) => this.own[j] === owner).length : 0;
      LINE_RENT.forEach((v, k) => (rows += row(T(`${k + 1} station${k ? "s" : ""}`, `${k + 1} 个车站`), cr(v), n === k + 1)));
    } else {
      const n = owner >= 0 ? UTILS.filter((j) => this.own[j] === owner).length : 0;
      UTIL_MULT.forEach((v, k) => (rows += row(T(`${k + 1} utilit${k ? "ies" : "y"}`, `${k + 1} 个设施`), `${v} × ${T("dice", "骰子")}`, n === k + 1)));
    }
    const foot =
      s.kind === "deed"
        ? `<span>${T("Miner", "矿机")} ${cr(GROUPS[s.group!].build)}</span><span>${T("Foundry", "铸造厂")} ${cr(GROUPS[s.group!].build)}</span><span>${T("Collateral", "抵押")} ${cr(s.price! / 2)}</span>`
        : `<span>${T("Collateral", "抵押")} ${cr(s.price! / 2)}</span>`;
    const ownTxt = owner >= 0 ? `<span class="bb-owner" style="--c:${this.col(owner)}"><img src="${personImage(this.o.seats[owner].id)}" alt="">${esc(this.nm(owner))}</span>` : `<span class="bb-owner bank">${T("FOR SALE", "待售")} · <b>${cr(s.price!)}</b></span>`;
    const lvTxt = s.kind === "deed" && this.lvl[i] ? `<div class="bb-lv">${this.lvl[i] === 5 ? `<img src="${iconURL("foundry", c)}" alt=""> ${T("FOUNDRY", "铸造厂")}` : `<img src="${iconURL("miner", c)}" alt="">`.repeat(this.lvl[i])}</div>` : "";
    return `<div class="bb-deed${this.mort[i] ? " pledged" : ""}" style="--g:${c}">
      <div class="bb-deed-head"><small>${T("TITLE DEED", "地契")} · ${grp ? esc(T(grp.en, grp.zh)) : esc(T(s.subEn ?? "", s.subZh ?? ""))}</small><b>${esc(spaceName(i))}</b><img class="bb-deed-ico" src="${iconURL(s.icon, c)}" alt=""></div>
      <div class="bb-deed-body">${ownTxt}${lvTxt}
      <table class="bb-rent">${rows}</table>
      <div class="bb-deed-foot">${foot}</div></div>
      ${this.mort[i] ? `<div class="bb-pledge">${T("COLLATERAL", "已抵押")}</div>` : ""}
    </div>`;
  }

  /** Click a space: its card (and, on your turn, its buttons). */
  private showDeed(i: number) {
    if (this.modalStack.length) return;
    const s = SPACES[i];
    this.snd.paper();
    this.view.pulse(i, "#c4b1fc");
    if (!s.price) {
      const { card, done } = this.modal("bb-info", `<div class="bb-plain"><img src="${iconURL(s.icon, "#ff6b35")}" alt=""><b>${esc(spaceName(i))}</b><p>${this.spaceHelp(i)}</p><button class="bb-btn primary"><span class="bb-bl"><b>OK</b></span></button></div>`, () => done());
      card.querySelector("button")!.onclick = () => (this.snd.ui(), done());
      return;
    }
    const { card, done } = this.modal("bb-deedview", `${this.deedHTML(i)}<div class="bb-deed-acts"></div><button class="bb-btn ghost bb-x"><span class="bb-bl"><b>${T("CLOSE", "关闭")}</b></span><kbd>ESC</kbd></button>`, () => done());
    card.querySelector<HTMLButtonElement>(".bb-x")!.onclick = () => (this.snd.ui(), done());
    const acts = card.querySelector<HTMLElement>(".bb-deed-acts")!;
    if (this.canManage() && this.own[i] === 0) this.deedButtons(acts, i, () => (card.querySelector(".bb-deed")!.outerHTML = this.deedHTML(i)));
  }
  private spaceHelp(i: number) {
    const s = SPACES[i];
    switch (s.kind) {
      case "genesis":
        return T(`Pass it: +200 cr block reward. Land right on it: +100 more.`, `经过：+200 区块奖励。正好停在这里：再 +100。`);
      case "jail":
        return T(`Where the linked t-addrs go. Get out with a double, a ${JAIL_FINE} cr fine, or a VIEWING KEY PARDON. After three tries, you pay and walk.`, `被关联的透明地址的监狱。掷出对子、支付 ${JAIL_FINE} 罚款或使用查看密钥特赦出狱。三次未出则付款出狱。`);
      case "park":
        return T(`Every tax and fine lands in the park's pot. Stop here and take it all. Pot now: ${cr(this.park)}.`, `所有税费和罚款都进入公园奖池。停在这里全部拿走。当前奖池：${cr(this.park)}。`);
      case "raid":
        return T(`The Tracker links your transparent coins: straight to ZEC STATE PENITENTIARY, no block reward.`, `追踪者关联了你的透明币：直接进入 ZEC州立监狱，不发区块奖励。`);
      case "mempool":
        return T(`Draw a MEMPOOL card: a random transaction event.`, `抽一张内存池卡：随机交易事件。`);
      case "qip":
        return T(`Draw a ZIP card: a governance event (Zcash Improvement Proposal).`, `抽一张 ZIP 卡：治理事件（Zcash 改进提案）。`);
      case "tax":
        return s.tax ? T(`Pay ${s.tax} cr into CENTRAL PARK.`, `向中央公园支付 ${s.tax}。`) : T(`Pay 60 cr + 10 cr per deed you hold, into CENTRAL PARK.`, `支付 60 + 每张地契 10，进入中央公园。`);
      default:
        return "";
    }
  }
  private canManage() {
    return !!this.redrawBar && !this.busy;
  }
  /** Build / sell / pledge / redeem buttons for one of your deeds. */
  private deedButtons(box: HTMLElement, i: number, refresh: () => void) {
    const g = this.g!;
    const s = SPACES[i];
    const draw = () => {
      box.innerHTML = "";
      const add = (label: string, sub: string, ok: boolean, kind: Btn["kind"], fn: () => boolean) => {
        const b = el("button", `bb-btn sm ${kind}`, `<span class="bb-bl"><b>${label}</b><small>${sub}</small></span>`);
        b.disabled = !ok;
        b.onclick = async () => {
          if (this.busy || !fn()) return;
          this.busy = true;
          try {
            await g.flush();
          } finally {
            this.busy = false;
          }
          refresh();
          draw();
          this.redrawBar?.();
        };
        box.appendChild(b);
      };
      if (s.kind === "deed") {
        const c = g.buildCost(i);
        const lv = g.deeds[i]!.level;
        add(lv === 4 ? T("FOUNDRY", "铸造厂") : T("+ MINER", "+ 矿机"), `−${cr(c)}`, g.canBuild(0, i), "good", () => g.build(0, i));
        add(T("SELL", "出售"), `+${cr(Math.floor(c / 2))}`, g.canSell(0, i), "ghost", () => g.sell(0, i));
      }
      if (g.deeds[i]!.mortgaged) add(T("REDEEM", "赎回"), `−${cr(g.redeemCost(i))}`, g.canRedeem(0, i), "ghost", () => g.redeem(0, i));
      else add(T("PLEDGE", "抵押"), `+${cr(s.price! / 2)}`, g.canMortgage(0, i), "ghost", () => g.mortgage(0, i));
    };
    draw();
  }

  /** A baron's deeds, by district, as a binder of little cards (yours: with the buttons, on your turn). */
  private showPortfolio(seat: number, raise = 0): Promise<void> {
    return new Promise((res) => {
      if (this.modalStack.length && !raise) return res();
      const mine = seat === 0 && this.canManage();
      this.snd.paper();
      const { card, done } = this.modal(
        "bb-port",
        `<header>${this.medal(seat)}<div class="bb-ph"><b>${esc(this.nm(seat))}</b><small>${T("Net worth", "身家")} <span class="nw"></span> · ${T("Cash", "现金")} <span class="cs"></span></small></div><button class="bb-btn ghost bb-x"><span class="bb-bl"><b>${raise ? T("DONE", "完成") : T("CLOSE", "关闭")}</b></span><kbd>ESC</kbd></button></header>
        ${raise ? `<div class="bb-owe"></div>` : ""}
        <div class="bb-plist"></div>`,
        () => close(),
      );
      const close = () => {
        done();
        res();
      };
      card.querySelector<HTMLButtonElement>(".bb-x")!.onclick = () => (this.snd.ui(), close());
      const list = card.querySelector<HTMLElement>(".bb-plist")!;
      const draw = () => {
        const g = this.g;
        card.querySelector(".nw")!.textContent = g ? cr(g.worth(seat)) : cr(START_CASH);
        card.querySelector(".cs")!.textContent = cr(this.cash[seat]);
        const owe = card.querySelector<HTMLElement>(".bb-owe");
        if (owe && g) {
          const ok = g.p[0].cash >= raise;
          owe.innerHTML = ok ? T(`Covered: you can pay ${cr(raise)} now.`, `已凑够：现在可以支付 ${cr(raise)}。`) : T(`You owe ${cr(raise)}: raise ${cr(raise - g.p[0].cash)} more (sell miners, pledge deeds).`, `你欠 ${cr(raise)}：还需筹集 ${cr(raise - g.p[0].cash)}（卖矿机、抵押地契）。`);
          owe.classList.toggle("ok", ok);
        }
        list.innerHTML = "";
        const deeds = OWNABLE.filter((i) => this.own[i] === seat);
        if (!deeds.length) list.innerHTML = `<p class="bb-empty">${T("No deeds yet.", "还没有地契。")}</p>`;
        for (const i of deeds) {
          const s = SPACES[i];
          const row = el("div", `bb-prow${this.mort[i] ? " m" : ""}`);
          row.style.setProperty("--g", colorOf(i));
          const lv = this.lvl[i];
          const rent = g ? g.rent(i, 7) : 0;
          row.innerHTML = `<div class="bb-mini"><i></i><b>${esc(spaceName(i))}</b></div><div class="bb-pn"><small>${this.mort[i] ? T("PLEDGED AS COLLATERAL", "已抵押") : `${T("rent", "租金")} ${s.kind === "util" ? `${UTIL_MULT[UTILS.filter((j) => this.own[j] === seat).length - 1]}× ${T("dice", "骰子")}` : cr(rent)}`}${lv ? ` · ${lv === 5 ? T("FOUNDRY", "铸造厂") : T(`${lv} miner${lv > 1 ? "s" : ""}`, `${lv} 台矿机`)}` : ""}</small></div><div class="bb-pacts"></div>`;
          row.querySelector<HTMLElement>(".bb-mini")!.onclick = () => {
            if (!mine && !raise) {
              close();
              this.showDeed(i);
            }
          };
          if ((mine || raise) && g) this.deedButtons(row.querySelector(".bb-pacts")!, i, draw);
          list.appendChild(row);
        }
      };
      draw();
    });
  }

  private showHelp() {
    if (this.modalStack.some((m) => m.el.classList.contains("bb-helpm"))) return;
    this.snd.paper();
    const { card, done } = this.modal(
      "bb-helpm",
      `<h2>BLOCK BARONS</h2><p class="bb-lede">${T("Roll, move round ZStreet, buy its places. Own a whole district and its rent doubles; then plug in <b>miners</b> (1–4) and crown them with a <b>FOUNDRY</b>.", "掷骰，绕着 ZStreet 走，买下地产。拥有整个区，租金翻倍；再装上<b>矿机</b>（1–4 台），最后建起<b>铸造厂</b>。")}</p>
      <ul>
        <li>${T("<b>GENESIS BLOCK</b>: +200 cr each time you pass it (+100 more if you land on it).", "<b>创世区块</b>：每次经过 +200（正好停下再 +100）。")}</li>
        <li>${T("<b>Decline to buy</b> and the deed goes to a <b>sealed fee auction</b>: everyone bids once, the highest fee wins and pays it.", "<b>放弃购买</b>则进入<b>密封出价拍卖</b>：每人出价一次，出价最高者以其出价获得。")}</li>
        <li>${T("<b>ZEC LINE</b>: 25 / 50 / 100 / 200 cr for 1–4 stations. <b>PROOF FACTORY</b> and <b>PORT DOCKS</b>: 4× the dice, 10× with both.", "<b>ZEC 线</b>：拥有 1–4 站收 25 / 50 / 100 / 200。<b>证明工厂</b>和<b>港口码头</b>：骰子点数 ×4，两者都有 ×10。")}</li>
        <li>${T("<b>MEMPOOL</b> cards are random transactions; <b>ZIP</b> cards are governance events.", "<b>内存池</b>卡是随机交易；<b>ZIP</b> 卡是治理事件。")}</li>
        <li>${T("<b>Taxes and fines</b> fill <b>CENTRAL PARK</b>'s pot: land there and take it.", "<b>税费和罚款</b>进入<b>中央公园</b>奖池：停在那里就能拿走。")}</li>
        <li>${T(`<b>TRACKER'S RAID</b> or three doubles: off to <b>ZEC STATE PENITENTIARY</b>. Out with a double, ${JAIL_FINE} cr, or a VIEWING KEY PARDON.`, `<b>追踪者突袭</b>或连续三次对子：进入 <b>ZEC州立监狱</b>。掷出对子、支付 ${JAIL_FINE} 或使用查看密钥特赦出狱。`)}</li>
        <li>${T("Short of cash? Sell miners (half back) or pledge deeds as <b>collateral</b> (half the price; +10 % to redeem). Can't pay: <b>bankrupt</b>.", "缺钱？卖掉矿机（返还一半）或<b>抵押</b>地契（得到半价；赎回加 10%）。付不起就<b>破产</b>。")}</li>
        <li>${T("<b>Trade</b> deeds, credits and pardons with anyone on your turn. The snarks trade too.", "在你的回合可以和任何人<b>交易</b>地契、钱和特赦卡。zkSNARK 们也会来找你交易。")}</li>
        <li>${T("<b>Speed</b> and <b>Blitz</b> start with a GENESIS AIRDROP of deeds and end on rounds or the clock: the highest <b>net worth</b> (cash + deeds + miners at cost) wins. <b>Classic</b>: last baron standing.", "<b>快速</b>和<b>闪电</b>模式开局空投地契，按轮数或时间结束：<b>身家</b>（现金 + 地契 + 建筑成本）最高者胜。<b>经典</b>：坚持到最后者胜。")}</li>
      </ul>
      <p class="bb-small">${T("Credits (cr) are board money only, not ⓩ chips and never ZEC.", "Credits（cr）只是棋盘货币，不是 ⓩ 筹码，更不是 ZEC。")}</p>
      <p class="bb-keys"><kbd>SPACE</kbd> ${T("roll / end", "掷骰/结束")} <kbd>M</kbd> ${T("manage", "管理")} <kbd>T</kbd> ${T("trade", "交易")} <kbd>F</kbd> ${T("fast-forward", "快进")} <kbd>ESC</kbd> ${T("leave", "离开")}</p>
      <button class="bb-btn primary"><span class="bb-bl"><b>${T("GOT IT", "明白")}</b></span></button>`,
      () => done(),
    );
    card.querySelector<HTMLButtonElement>(".bb-btn")!.onclick = () => (this.snd.ui(), done());
  }

  private askLeave() {
    if (this.exited || this.modalStack.some((m) => m.el.classList.contains("bb-leave"))) return;
    const started = !!this.g;
    this.snd.paper();
    const { card, done } = this.modal(
      "bb-leave",
      `<h3>${T("Leave the table?", "离开牌桌？")}</h3><p>${started ? T("The game is still on: leaving forfeits your buy-in.", "游戏还在进行：离开将失去你的买入。") : T("Nothing played yet: your buy-in comes back.", "还没开始：买入将退还。")}</p>
      <div class="bb-row"><button class="bb-btn ghost st"><span class="bb-bl"><b>${T("STAY", "留下")}</b></span></button><button class="bb-btn danger lv"><span class="bb-bl"><b>${T("LEAVE", "离开")}</b></span></button></div>`,
      () => done(),
    );
    card.querySelector<HTMLButtonElement>(".st")!.onclick = () => (this.snd.ui(), done());
    card.querySelector<HTMLButtonElement>(".lv")!.onclick = () => {
      done();
      if (!started) this.exit({ order: this.o.seats.map((s) => s.seat), payout: this.o.stake, summary: "BLOCK BARONS: left before the first roll, buy-in returned" });
      else this.exit(null);
    };
  }

  // ---- start -------------------------------------------------------------------------------------

  /** The box lid: the wordmark, who is at the table, how long, the stake, START. */
  private startScreen() {
    const pot = this.o.stake * this.o.seats.length;
    const sh = shares(this.o.seats.length);
    const places = [T("1st", "第1名"), T("2nd", "第2名"), T("3rd", "第3名"), T("4th", "第4名")];
    const modeCard = (m: Mode) => {
      const M = MODES[m];
      const big = m === "classic" ? `<b class="big">${T("LAST", "最后")}</b><i>${T("BARON STANDING", "存活者胜")}</i>` : `<b class="big">${M.rounds}</b><i>${T(`ROUNDS · ${M.minutes} MIN`, `轮 · ${M.minutes} 分钟`)}</i>`;
      return `<button class="bb-modec${m === "speed" ? " sel" : ""}" data-m="${m}"><small>${T(M.en, M.zh)}</small>${big}<em>${m === "classic" ? T("bankrupt them all", "让所有人破产") : T("richest net worth wins", "身家最高者胜")}</em></button>`;
    };
    const seats = this.o.seats
      .map((s) => `<div class="bb-sp">${this.medal(s.seat)}<b>${esc(s.human ? T("You", "你") : s.name)}</b><small>${s.human ? "&nbsp;" : esc(T(this.personas[s.seat].en, this.personas[s.seat].zh))}</small></div>`)
      .join("");
    const { card, done } = this.modal(
      "bb-start",
      `<div class="bb-lid"><div class="bb-wordmark"><i class="bb-mark big" style="background-image:url(${markURL()})"></i><h1><span>BLOCK</span><span>BARONS</span></h1></div><p>${T("Buy ZStreet block by block. Build miners, raise a Foundry, out-trade the snarks.", "一块一块买下 ZStreet。装矿机，建铸造厂，在交易中胜过 zkSNARK 们。")}</p></div>
      <div class="bb-lidb">
      <h4>${T("At the table", "牌桌上")}</h4>
      <div class="bb-seatsp">${seats}</div>
      <h4>${T("How long", "时长")}</h4>
      <div class="bb-modes">${(["blitz", "speed", "classic"] as Mode[]).map(modeCard).join("")}</div>
      <div class="bb-stakes">${
        pot
          ? `<span class="bb-potchip"></span><span>${T("Pot", "奖池")} <b>ⓩ ${fmt(pot)}</b> <small>(${T("play chips", "游戏筹码")})</small><br><small>${sh.map((x, k) => `${places[k]} ${Math.round(x * 100)}%`).join(" · ")}</small></span>`
          : `<span>${T("Free table: no chips at stake.", "免费桌：不下注。")}</span>`
      }<small class="bb-fine">${T("Board money is credits (cr), separate from your ⓩ chips.", "棋盘货币是 credits（cr），与 ⓩ 筹码分开。")}${this.o.seedNote ? ` · ${esc(this.o.seedNote)}` : ""}</small></div>
      <div class="bb-row"><button class="bb-btn ghost hp"><span class="bb-ico">${ICON.help}</span><span class="bb-bl"><b>${T("HOW TO PLAY", "玩法")}</b></span><kbd>H</kbd></button><button class="bb-btn primary go"><span class="bb-ico">${ICON.dice}</span><span class="bb-bl"><b>${T("TAKE A SEAT", "入座")}</b><small class="ms">${T(MODES.speed.en, MODES.speed.zh)}</small></span><kbd>SPACE</kbd></button></div>
      </div>`,
    );
    let mode: Mode = "speed";
    card.querySelectorAll<HTMLButtonElement>(".bb-modec").forEach((b) => {
      b.onclick = () => {
        this.snd.cardFlip();
        mode = b.dataset.m as Mode;
        card.querySelectorAll(".bb-modec").forEach((x) => x.classList.toggle("sel", x === b));
        card.querySelector(".ms")!.textContent = T(MODES[mode].en, MODES[mode].zh);
      };
    });
    card.querySelector<HTMLButtonElement>(".hp")!.onclick = () => this.showHelp();
    card.querySelector<HTMLButtonElement>(".go")!.onclick = () => {
      this.snd.start();
      this.snd.chips(5);
      done();
      void this.start(mode);
    };
  }

  private roundHTML(round: number) {
    const g = this.g;
    const cap = this.mode === "classic" || !g ? "" : `<i>/${g.rounds}</i>`;
    return `<small>${T("ROUND", "回合")}</small><b>${String(round).padStart(2, "0")}</b>${cap}`;
  }

  private async start(mode: Mode) {
    this.mode = mode;
    const o = this.o;
    this.bots = o.seats.map((s) => (s.human && !this.auto ? null : new Baron(s.seat, s.human ? 0.75 : s.skill, this.personas[s.seat], o.seed)));
    const agents: Agent[] = o.seats.map((s) => (this.bots[s.seat] ? new Paced(this.bots[s.seat]!, this) : this.human));
    const mins = MODES[mode].minutes;
    this.t0 = performance.now();
    this.deadlineAt = mins ? this.t0 + mins * 60_000 : 0;
    const g = new Game({ seats: o.seats.length, mode, seed: o.seed, deadline: () => !!this.deadlineAt && !this.fast && performance.now() >= this.deadlineAt }, agents, (e) => this.onEv(e));
    this.g = g;
    this.topEl.querySelector(".bb-mode")!.textContent = T(MODES[mode].en, MODES[mode].zh);
    this.clockEl.innerHTML = mins ? `<small>${T("CLOCK", "时间")}</small><b></b>` : "";
    this.roundEl.innerHTML = this.roundHTML(1);
    // the airdrop: the starting deeds fall onto the board, one coin at a time
    if (g.dropped.some((d) => d.length)) {
      if (!this.fast) this.toast(`<small>${T("THE GAME OPENS WITH A", "开局")}</small><b>${T("GENESIS AIRDROP", "创世空投")}</b><small>${T("every baron starts with a few deeds", "每位大亨开局获得几张地契")}</small>`, "big", 2200);
      for (let k = 0; k < Math.max(...g.dropped.map((d) => d.length)); k++)
        for (let s = 0; s < g.dropped.length; s++) {
          const i = g.dropped[s][k];
          if (i === undefined) continue;
          this.own[i] = s;
          this.view.setOwner(i, s, false);
          if (!this.fast) this.snd.chip(this.pan(s));
          await this.view.wait(0.12);
        }
      this.renderSeats();
      await this.view.wait(0.6);
    }
    try {
      await g.run();
    } catch (e) {
      if (e instanceof Closed || this.closed) return;
      throw e;
    }
    if (!this.closed) await this.final();
  }

  // ---- the human's decisions ----------------------------------------------------------------------

  humanManage(phase: "pre" | "post"): Promise<void> {
    const g = this.g!;
    if (this.closed) return Promise.reject(new Closed());
    return new Promise((res) => {
      const b = g.p[0];
      this.view.focus({ k: "over" });
      const go = (fn?: () => void) => {
        this.redrawBar = null;
        fn?.();
        this.waitingBar();
        res();
      };
      const common: Btn[] = [
        { label: T("MANAGE", "管理"), key: "m", kbd: "M", icon: "house", on: () => void this.showPortfolio(0).then(() => this.redrawBar?.()) },
        { label: T("TRADE", "交易"), key: "t", kbd: "T", icon: "trade", on: () => void this.openTrade() },
      ];
      const draw = () => {
        if (phase === "pre" && b.jailed) {
          this.setPhase("roll", T(`In the Penitentiary · try ${b.jailTurns + 1} of 3`, `在监狱里 · 第 ${b.jailTurns + 1}/3 次`));
          this.bar([
            { label: T("ROLL FOR DOUBLES", "掷对子"), kind: "primary", kbd: "SPACE", icon: "dice", on: () => go(() => (this.human.jailChoice = "roll")) },
            { label: T("PAY FINE", "交罚款"), sub: cr(JAIL_FINE), kind: "good", icon: "chip", disabled: b.cash < JAIL_FINE, on: () => go(() => (this.human.jailChoice = "pay")) },
            { label: T("PARDON", "特赦"), sub: `×${b.pardons.length}`, kind: "good", icon: "key", disabled: !b.pardons.length, on: () => go(() => (this.human.jailChoice = "pardon")) },
            ...common,
          ]);
        } else if (phase === "pre") {
          this.setPhase("roll", b.doubles ? T("Doubles! Roll again.", "对子！再掷一次。") : T("Roll when ready", "准备好就掷骰"));
          this.bar([{ label: T("ROLL", "掷骰"), kind: "primary", kbd: "SPACE", icon: "dice", on: () => go() }, ...common]);
        } else {
          this.setPhase("act", T("Build, trade, or end your turn", "建造、交易或结束回合"));
          this.bar([{ label: T("END TURN", "结束回合"), kind: "primary", kbd: "SPACE", icon: "end", on: () => go() }, ...common]);
        }
      };
      this.redrawBar = draw;
      draw();
      if (phase === "pre" && !b.jailed && !b.doubles) {
        this.toast(`<b>${T("YOUR TURN", "你的回合")}</b>`, "you", 1100);
        this.snd.turn();
      }
    });
  }

  askBuy(i: number): Promise<boolean> {
    const s = SPACES[i];
    return new Promise((res) => {
      this.view.focus({ k: "space", i });
      this.setPhase("act", T("Buy it, or send it to auction", "买下，或送去拍卖"));
      this.snd.paper();
      const { card, done } = this.modal(
        "bb-buy",
        `${this.deedHTML(i)}<div class="bb-hold"><span class="bb-stack"></span>${T("You hold", "你有")} <b>${cr(this.g!.p[0].cash)}</b></div><div class="bb-row"><button class="bb-btn ghost no"><span class="bb-ico">${ICON.gavel}</span><span class="bb-bl"><b>${T("AUCTION", "拍卖")}</b></span></button><button class="bb-btn primary yes"><span class="bb-ico">${ICON.stamp}</span><span class="bb-bl"><b>${T("BUY", "购买")}</b><small>${cr(s.price!)}</small></span><kbd>SPACE</kbd></button></div>`,
      );
      card.querySelector<HTMLButtonElement>(".yes")!.onclick = () => (this.snd.ui(), done(), res(true));
      card.querySelector<HTMLButtonElement>(".no")!.onclick = () => (this.snd.ui(), done(), res(false));
    });
  }

  askBid(i: number): Promise<number> {
    const g = this.g!;
    const s = SPACES[i];
    const max = g.p[0].cash;
    if (g.p[0].out || max < 10) return Promise.resolve(0);
    return new Promise((res) => {
      let bid = Math.min(max, Math.floor((s.price! * 0.6) / 10) * 10);
      this.snd.gavel(1);
      const { card, done } = this.modal(
        "bb-auction",
        `<div class="bb-auc-l">${this.deedHTML(i)}</div>
        <div class="bb-slip"><header><small>${T("SEALED FEE AUCTION", "密封出价拍卖")}</small><b>${T("YOUR BID", "你的出价")}</b></header><p>${T("Everyone bids once, in secret. The highest fee takes the deed and pays it.", "每人秘密出价一次。出价最高者获得地契并支付其出价。")}</p>
        <div class="bb-bidv"><span></span><em>cr</em></div>
        <div class="bb-chips"><button class="bb-cchip c0" data-d="10">+10</button><button class="bb-cchip c1" data-d="50">+50</button><button class="bb-cchip c3" data-d="100">+100</button></div>
        <div class="bb-bidb"><button data-d="-50">−50</button><button data-d="-10">−10</button><button data-q="0.5">½ ${T("price", "价")}</button><button data-q="1">${T("price", "原价")}</button><button data-q="max">${T("all in", "全部")}</button></div>
        <div class="bb-timer"><i></i></div>
        <div class="bb-row"><button class="bb-btn ghost pass"><span class="bb-bl"><b>${T("NO BID", "不出价")}</b></span></button><button class="bb-btn primary place"><span class="bb-ico">${ICON.gavel}</span><span class="bb-bl"><b>${T("SEAL BID", "封存出价")}</b><small>${T("max", "最多")} ${cr(max)}</small></span><kbd>SPACE</kbd></button></div></div>`,
      );
      const v = card.querySelector<HTMLElement>(".bb-bidv span")!;
      const show = () => {
        v.textContent = fmt(bid);
        v.classList.remove("bump");
        void v.offsetWidth;
        v.classList.add("bump");
      };
      show();
      card.querySelectorAll<HTMLButtonElement>("[data-d]").forEach((b) => (b.onclick = () => ((bid = Math.max(0, Math.min(max, bid + Number(b.dataset.d)))), Number(b.dataset.d) > 0 ? this.snd.chip() : this.snd.tick(), show())));
      card.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => (b.onclick = () => ((bid = b.dataset.q === "max" ? max : Math.min(max, Math.round((s.price! * Number(b.dataset.q)) / 10) * 10)), this.snd.chips(3), show())));
      let over = false;
      const finish = (x: number) => {
        if (over) return;
        over = true;
        clearTimeout(tm);
        this.snd.paper();
        done();
        res(x);
      };
      card.querySelector<HTMLButtonElement>(".pass")!.onclick = () => finish(0);
      card.querySelector<HTMLButtonElement>(".place")!.onclick = () => finish(bid);
      const secs = 20;
      const bar = card.querySelector<HTMLElement>(".bb-timer i")!;
      bar.style.animationDuration = `${secs}s`;
      const tm = setTimeout(() => finish(bid), secs * 1000);
    });
  }

  askRaise(owed: number): Promise<void> {
    const g = this.g!;
    return new Promise((res) => {
      const draw = () => {
        const ok = g.p[0].cash >= owed;
        this.setPhase("act", T(`You owe ${cr(owed)} and hold ${cr(g.p[0].cash)}`, `你欠 ${cr(owed)}，手上只有 ${cr(g.p[0].cash)}`));
        this.bar([
          { label: T("PAY", "支付"), sub: cr(owed), kind: "primary", kbd: "SPACE", icon: "chip", disabled: !ok, on: () => fin() },
          { label: T("RAISE CASH", "筹钱"), key: "m", kbd: "M", kind: "good", icon: "house", on: () => void this.showPortfolio(0, owed).then(draw) },
          { label: T("GO BANKRUPT", "宣布破产"), kind: "danger", icon: "broke", on: () => fin() },
        ]);
      };
      const fin = () => {
        this.redrawBar = null;
        this.waitingBar();
        res();
      };
      this.redrawBar = draw;
      draw();
      if (g.liquid(0) >= owed) void this.showPortfolio(0, owed).then(draw);
    });
  }

  /** The things in an offer: little deed cards, a chip stack, pardons. */
  private offerSide(deeds: number[], cash: number, pardons: number) {
    let h = deeds.map((i) => `<span class="bb-mini" style="--g:${colorOf(i)}"><i></i><b>${esc(spaceName(i))}</b></span>`).join("");
    if (cash) h += `<span class="bb-cashpile"><i class="bb-stack"></i>${cr(cash)}</span>`;
    if (pardons) h += `<span class="bb-mini pardon"><i></i><b>${T("PARDON", "特赦")} ×${pardons}</b></span>`;
    return h || `<span class="bb-none">${T("nothing", "无")}</span>`;
  }

  askAnswer(o: Offer): Promise<"yes" | "no" | Offer> {
    const from = o.from;
    const canCounter = !this.inPropose;
    return new Promise((res) => {
      const l = lineFor("offer", from);
      this.snd.offer();
      const { card, done } = this.modal(
        "bb-offer",
        `<header>${this.medal(from)}<div class="bb-ph"><small>${this.inPropose ? T("counter-offer from", "还价来自") : T("trade offer from", "交易提议来自")}</small><b style="color:${this.col(from)}">${esc(this.nm(from))}</b>${l ? `<q>${esc(T(l[0], l[1]))}</q>` : ""}</div></header>
        <div class="bb-cols"><section><h4>${T("YOU GIVE", "你给出")}</h4><div class="bb-tray">${this.offerSide(o.get, o.getCash, o.getPardon)}</div></section><div class="bb-swap">${ICON.trade}</div><section><h4>${T("YOU GET", "你得到")}</h4><div class="bb-tray">${this.offerSide(o.give, o.giveCash, o.givePardon)}</div></section></div>
        <div class="bb-row"><button class="bb-btn danger no"><span class="bb-bl"><b>${T("DECLINE", "拒绝")}</b></span></button>${canCounter ? `<button class="bb-btn ghost ct"><span class="bb-bl"><b>${T("COUNTER", "还价")}</b></span></button>` : ""}<button class="bb-btn primary yes"><span class="bb-ico">${ICON.end}</span><span class="bb-bl"><b>${T("ACCEPT", "接受")}</b></span><kbd>SPACE</kbd></button></div>`,
      );
      this.react(from, "nod");
      card.querySelector<HTMLButtonElement>(".yes")!.onclick = () => (this.snd.ui(), done(), res("yes"));
      card.querySelector<HTMLButtonElement>(".no")!.onclick = () => (this.snd.ui(), done(), res("no"));
      const ct = card.querySelector<HTMLButtonElement>(".ct");
      if (ct)
        ct.onclick = () => {
          this.snd.ui();
          done();
          // the counter, from your side: what they asked of you, what they offered
          void this.openTrade(from, { from: 0, to: from, give: o.get.slice(), get: o.give.slice(), giveCash: o.getCash, getCash: o.giveCash, givePardon: o.getPardon, getPardon: o.givePardon }).then((c) => res(c ?? "no"));
        };
    });
  }

  /**
   * The trade table. On your turn it proposes the deal itself; as a counter (`seed` given) it
   * returns the offer for the engine to put to them.
   */
  private openTrade(fixed = -1, seed?: Offer): Promise<Offer | null> {
    const g = this.g!;
    return new Promise((res) => {
      const rivals = g.alive().filter((b) => b.seat !== 0);
      if (!rivals.length) return res(null);
      let to = fixed >= 0 ? fixed : rivals[0].seat;
      let o: Offer = seed ?? { from: 0, to, give: [], get: [], giveCash: 0, getCash: 0, givePardon: 0, getPardon: 0 };
      this.snd.paper();
      const { card, done } = this.modal(
        "bb-trade",
        `<header><h3>${T("TRADE", "交易")}</h3><div class="bb-partners"></div></header>
        <div class="bb-cols"><section class="give"><h4>${T("YOU GIVE", "你给出")}</h4><div class="bb-tdeeds"></div><div class="bb-tcash"></div></section>
        <div class="bb-swap">${ICON.trade}</div>
        <section class="get"><h4>${T("YOU GET", "你得到")}</h4><div class="bb-tdeeds"></div><div class="bb-tcash"></div></section></div>
        <div class="bb-mood"></div>
        <div class="bb-row"><button class="bb-btn ghost cancel"><span class="bb-bl"><b>${T("CANCEL", "取消")}</b></span><kbd>ESC</kbd></button><button class="bb-btn primary send"><span class="bb-ico">${ICON.trade}</span><span class="bb-bl"><b>${seed ? T("SEND COUNTER", "发送还价") : T("PROPOSE", "提议")}</b></span></button></div>`,
        () => finish(null),
      );
      const finish = (x: Offer | null) => {
        done();
        res(x);
      };
      const partners = card.querySelector<HTMLElement>(".bb-partners")!;
      let lastFace = "";
      const draw = () => {
        partners.innerHTML = "";
        for (const b of rivals) {
          if (fixed >= 0 && b.seat !== fixed) continue;
          const p = el("button", `bb-partner${b.seat === to ? " sel" : ""}`, `${this.medal(b.seat, "sm")}<span>${esc(this.nm(b.seat))}</span>`);
          p.style.setProperty("--c", this.col(b.seat));
          p.onclick = () => {
            if (to === b.seat) return;
            to = b.seat;
            o = { from: 0, to, give: [], get: [], giveCash: 0, getCash: 0, givePardon: 0, getPardon: 0 };
            this.snd.ui(1);
            draw();
          };
          partners.appendChild(p);
        }
        const side = (sec: HTMLElement, seat: number, picked: number[], cashKey: "giveCash" | "getCash", pardKey: "givePardon" | "getPardon") => {
          const box = sec.querySelector<HTMLElement>(".bb-tdeeds")!;
          box.innerHTML = "";
          const deeds = g.owned(seat);
          if (!deeds.length) box.innerHTML = `<p class="bb-empty">${T("No deeds", "没有地契")}</p>`;
          for (const i of deeds) {
            const ok = g.tradable(i);
            const ch = el("button", `bb-mini pick${picked.includes(i) ? " sel" : ""}${g.deeds[i]!.mortgaged ? " m" : ""}`, `<i></i><b>${esc(spaceName(i))}</b>`);
            ch.style.setProperty("--g", colorOf(i));
            ch.disabled = !ok;
            ch.title = ok ? "" : T("Sell the district's miners first", "先卖掉该区的矿机");
            ch.onclick = () => {
              const k = picked.indexOf(i);
              if (k >= 0) picked.splice(k, 1);
              else picked.push(i);
              this.snd.cardSlide();
              draw();
            };
            box.appendChild(ch);
          }
          const cbox = sec.querySelector<HTMLElement>(".bb-tcash")!;
          const max = g.p[seat].cash;
          cbox.innerHTML = `<div class="bb-cashrow"><button data-d="-100">−100</button><button data-d="-10">−10</button><span><i class="bb-stack"></i>${fmt(o[cashKey])}<em>cr</em></span><button class="bb-cchip c0" data-d="10">+10</button><button class="bb-cchip c3" data-d="100">+100</button></div><small>${T("of", "共")} ${cr(max)}</small>${g.p[seat].pardons.length ? `<label class="bb-pard"><input type="checkbox" ${o[pardKey] ? "checked" : ""}> ${T("VIEWING KEY PARDON", "查看密钥特赦")}</label>` : ""}`;
          cbox.querySelectorAll<HTMLButtonElement>("[data-d]").forEach(
            (b) =>
              (b.onclick = () => {
                o[cashKey] = Math.max(0, Math.min(max, o[cashKey] + Number(b.dataset.d)));
                if (Number(b.dataset.d) > 0) this.snd.chip();
                else this.snd.tick();
                draw();
              }),
          );
          const cb = cbox.querySelector<HTMLInputElement>("input");
          if (cb) cb.onchange = () => ((o[pardKey] = cb.checked ? 1 : 0), this.snd.cardFlip(), draw());
        };
        o.to = to;
        side(card.querySelector<HTMLElement>("section.give")!, 0, o.give, "giveCash", "givePardon");
        side(card.querySelector<HTMLElement>("section.get")!, to, o.get, "getCash", "getPardon");
        // their likely mood (the snark's own measure, roughly), on their face
        const mood = card.querySelector<HTMLElement>(".bb-mood")!;
        const valid = g.validOffer(o);
        const bot = this.bots[to];
        if (valid && bot) {
          const { mine, theirs } = bot.judge(g, o, to);
          const k = 0.15 + 0.6 * bot.skill;
          const need = 15;
          const face = mine >= need && mine >= k * theirs ? ["keen", T("looks interested", "看起来有兴趣")] : mine >= -40 ? ["meh", T("is on the fence", "还在犹豫")] : ["no", T("is not impressed", "不感兴趣")];
          mood.innerHTML = `${this.medal(to, `sm mood-${face[0]}`)}<span><b style="color:${this.col(to)}">${esc(this.nm(to))}</b> ${face[1]}</span>`;
          if (face[0] !== lastFace && lastFace) (face[0] === "keen" ? this.snd.tick(3) : this.snd.tick(-3));
          lastFace = face[0];
        } else mood.innerHTML = valid ? "" : `<span class="bb-hint">${T("Pick what you give and what you want.", "选择你给出和想要的东西。")}</span>`;
        card.querySelector<HTMLButtonElement>(".send")!.disabled = !valid;
      };
      draw();
      card.querySelector<HTMLButtonElement>(".cancel")!.onclick = () => (this.snd.ui(), finish(null));
      card.querySelector<HTMLButtonElement>(".send")!.onclick = async () => {
        if (!g.validOffer(o)) return;
        this.snd.paper();
        if (seed) return finish({ ...o, give: o.give.slice(), get: o.get.slice() });
        finish(null);
        // put it to them now (your turn)
        this.busy = true;
        this.inPropose = true;
        this.setPhase(this.phase, T(`Waiting for ${esc(this.nm(to))}…`, `等待 ${esc(this.nm(to))}……`));
        this.bar([]);
        let okDeal = false;
        try {
          okDeal = await g.propose({ ...o, give: o.give.slice(), get: o.get.slice() });
        } finally {
          this.busy = false;
          this.inPropose = false;
        }
        if (!okDeal) {
          this.toast(`<b>${T("NO DEAL", "未成交")}</b><small>${esc(this.nm(to))}</small>`, "bad", 1500);
          this.snd.nodeal();
          this.react(to, "nod", "✕");
        }
        this.renderSeats();
        this.redrawBar?.();
      };
    });
  }

  // ---- events: the animation of everything --------------------------------------------------------

  private async onEv(e: Ev) {
    if (this.closed) throw new Closed();
    const v = this.view;
    const g = this.g!;
    switch (e.t) {
      case "round":
        this.roundEl.innerHTML = this.roundHTML(e.round);
        if (e.round > 1 && !this.fast) {
          const last = this.mode !== "classic" && e.round > g.rounds - 3;
          this.toast(`<small>${last ? T("FINAL ROUNDS", "最后几轮") : T("ROUND", "回合")}</small><b>${String(e.round).padStart(2, "0")}</b>${this.mode !== "classic" ? `<small>${T("of", "共")} ${g.rounds}</small>` : ""}`, "round", 1000);
          this.snd.round();
          await v.wait(0.35);
        }
        break;
      case "turn": {
        // (the bench's fast mode: let the page breathe once a turn)
        if (this.fast) await new Promise((r) => setTimeout(r, 0));
        this.active = e.seat;
        this.syncAll();
        v.setActive(e.seat);
        v.resetOrbit();
        v.focus(this.o.seats[e.seat].human && !this.auto ? { k: "over" } : { k: "pawn", seat: e.seat });
        this.diceEl.classList.remove("on");
        this.phase = "roll";
        this.status = this.o.seats[e.seat].human && !this.auto ? "" : T("is up", "上场");
        this.renderTurn();
        if (!this.o.seats[e.seat].human || this.auto) this.waitingBar();
        await v.wait(this.o.seats[e.seat].human ? 0.15 : 0.4);
        break;
      }
      case "dice": {
        v.focus({ k: "roll", seat: e.seat });
        this.setPhase("roll", e.why === "util" ? T("rolls for the utility fee", "为公用设施费掷骰") : T("rolls the dice", "掷骰子"));
        if (!this.fast) this.snd.rattle();
        const pan = this.pan(e.seat) * 0.5;
        await v.rollDice(e.seat, e.a, e.b, (kind, s) => {
          if (this.fast) return;
          if (kind === "dice") this.snd.knock(s);
          else this.snd.clack(s, kind === "wall", pan);
        });
        this.diceEl.innerHTML = `${dieSVG(e.a)}${dieSVG(e.b)}<b>${e.a + e.b}</b>${e.a === e.b ? `<em>${T("DOUBLES", "对子")}</em>` : ""}`;
        this.diceEl.style.setProperty("--c", this.col(e.seat));
        this.diceEl.classList.add("on");
        await v.wait(e.why === "util" ? 0.5 : 0.25);
        break;
      }
      case "move":
        v.focus({ k: "pawn", seat: e.seat });
        this.setPhase("move", e.jump ? T("is hauled away", "被押走") : e.steps < 0 ? T(`moves back ${-e.steps}`, `后退 ${-e.steps} 格`) : T(`moves ${e.steps}`, `前进 ${e.steps} 格`));
        if (e.jump) {
          if (!this.fast) this.snd.swoosh();
          await v.leap(e.seat, e.to, true);
          if (!this.fast) this.snd.clack(0.9);
          v.shake(0.12);
        } else {
          await v.hop(e.seat, e.from, e.steps, (i, k, last) => {
            if (!this.fast) this.snd.tock(k, last);
            if (i === 0 && e.steps > 0) v.pulse(0, "#ff6b35");
          });
        }
        break;
      case "land":
        v.pulse(e.space, this.col(e.seat));
        this.setPhase("act", T(`on ${esc(spaceName(e.space))}`, `停在 ${esc(spaceName(e.space))}`));
        break;
      case "pay":
        await this.animPay(e);
        break;
      case "buy": {
        this.cash[e.seat] -= e.price;
        this.floatDelta(e.seat, -e.price);
        this.own[e.space] = e.seat;
        v.setOwner(e.space, e.seat, false);
        v.burstAt(e.space, [this.col(e.seat), "#ece4d3", "#ff6b35"]);
        v.cheer(e.seat);
        this.react(e.seat, "buy");
        if (!this.fast) this.snd.chips(4, this.pan(e.seat));
        this.renderSeats();
        this.log(`${esc(this.nm(e.seat))} bought ${esc(SPACES[e.space].en)}`, `${esc(this.nm(e.seat))} 买下 ${esc(SPACES[e.space].zh)}`, this.col(e.seat), `−${fmt(e.price)}`);
        await this.stampDeed(e.space, e.seat, T("ACQUIRED", "已购得"));
        break;
      }
      case "auction":
        await this.animAuction(e);
        break;
      case "build": {
        this.cash[e.seat] += e.sold ? e.amount : -e.amount;
        this.floatDelta(e.seat, e.sold ? e.amount : -e.amount);
        this.lvl[e.space] = e.level;
        v.setLevel(e.space, e.level, !e.sold);
        if (!this.fast) {
          if (e.sold) this.snd.unbuild();
          else if (e.level === 5) setTimeout(() => this.snd.foundry(), 300 / v.speed);
          else this.snd.build(e.level);
        }
        if (!e.sold) {
          v.focus({ k: "space", i: e.space });
          this.react(e.seat, "nod");
        }
        this.log(
          e.sold ? `${esc(this.nm(e.seat))} sold a miner on ${esc(SPACES[e.space].en)}` : e.level === 5 ? `${esc(this.nm(e.seat))} raised a FOUNDRY on ${esc(SPACES[e.space].en)}` : `${esc(this.nm(e.seat))} built a miner on ${esc(SPACES[e.space].en)}`,
          e.sold ? `${esc(this.nm(e.seat))} 卖掉 ${esc(SPACES[e.space].zh)} 的矿机` : e.level === 5 ? `${esc(this.nm(e.seat))} 在 ${esc(SPACES[e.space].zh)} 建起铸造厂` : `${esc(this.nm(e.seat))} 在 ${esc(SPACES[e.space].zh)} 装了矿机`,
          this.col(e.seat),
          `${e.sold ? "+" : "−"}${fmt(e.amount)}`,
        );
        this.renderSeats();
        await v.wait(e.sold ? 0.12 : e.level === 5 ? 0.9 : 0.32);
        break;
      }
      case "collateral":
        this.cash[e.seat] += e.on ? e.amount : -e.amount;
        this.floatDelta(e.seat, e.on ? e.amount : -e.amount);
        this.mort[e.space] = e.on;
        v.setOwner(e.space, e.seat, e.on);
        if (!this.fast) (e.on ? this.snd.stamp() : this.snd.paper());
        this.log(e.on ? `${esc(this.nm(e.seat))} pledged ${esc(SPACES[e.space].en)}` : `${esc(this.nm(e.seat))} redeemed ${esc(SPACES[e.space].en)}`, e.on ? `${esc(this.nm(e.seat))} 抵押了 ${esc(SPACES[e.space].zh)}` : `${esc(this.nm(e.seat))} 赎回了 ${esc(SPACES[e.space].zh)}`, this.col(e.seat), `${e.on ? "+" : "−"}${fmt(e.amount)}`);
        this.renderSeats();
        await v.wait(0.18);
        break;
      case "card":
        await this.showCard(e.seat, e.deck, e.card);
        break;
      case "jail":
        this.log(`${esc(this.nm(e.seat))} → ZEC STATE PENITENTIARY`, `${esc(this.nm(e.seat))} → ZEC州立监狱`, this.col(e.seat));
        if (!this.fast) setTimeout(() => this.snd.cell(), 700 / v.speed);
        this.toast(`<b>${e.why === "doubles" ? T("THREE DOUBLES", "三连对子") : T("LINKED BY THE TRACKER", "被追踪者关联")}</b><small>${esc(this.nm(e.seat))} → ZEC STATE PENITENTIARY</small>`, "bad", 1500);
        this.say(e.seat, "jailed");
        this.react(e.seat, "jail");
        v.ouch(e.seat);
        this.renderSeats();
        await v.wait(0.5);
        break;
      case "free":
        v.setPawn(e.seat, g.p[e.seat].pos, false);
        this.log(`${esc(this.nm(e.seat))} is out of the Penitentiary`, `${esc(this.nm(e.seat))} 出狱了`, this.col(e.seat));
        if (e.how === "doubles" || e.how === "pardon") this.say(e.seat, "freed");
        if (!this.fast) this.snd.free();
        this.react(e.seat, "gain");
        this.renderSeats();
        await v.wait(0.25);
        break;
      case "doubles":
        this.toast(`<b>${T("DOUBLES", "对子")}</b><small>${T("roll again", "再掷一次")}</small>`, "good", 900);
        if (!this.fast) this.snd.doubles();
        await v.wait(0.2);
        break;
      case "bankrupt": {
        this.outSeats.add(e.seat);
        for (const i of OWNABLE)
          if (this.own[i] === e.seat) {
            this.own[i] = e.to >= 0 ? e.to : BANK;
            this.lvl[i] = 0;
            v.setLevel(i, 0, false);
            if (e.to < 0) this.mort[i] = false;
            v.setOwner(i, this.own[i], this.mort[i]);
          }
        this.cash[e.seat] = 0;
        v.setOut(e.seat);
        if (!this.fast) this.snd.bankrupt();
        this.toast(`<b>${T("BANKRUPT", "破产")}</b><small>${esc(this.nm(e.seat))}${e.to >= 0 ? T(` → everything to ${esc(this.nm(e.to))}`, ` → 全部归 ${esc(this.nm(e.to))}`) : ""}</small>`, "bad big", 2200);
        this.say(e.seat, "out");
        this.log(`${esc(this.nm(e.seat))} is bankrupt`, `${esc(this.nm(e.seat))} 破产了`, this.col(e.seat));
        this.renderSeats();
        await v.wait(1.1);
        if (e.seat === 0 && !this.auto) await this.humanOut();
        break;
      }
      case "trade": {
        const o = e.offer;
        for (const i of o.give) ((this.own[i] = o.to), v.setOwner(i, o.to, this.mort[i]));
        for (const i of o.get) ((this.own[i] = o.from), v.setOwner(i, o.from, this.mort[i]));
        this.cash[o.from] += o.getCash - o.giveCash;
        this.cash[o.to] += o.giveCash - o.getCash;
        this.floatDelta(o.from, o.getCash - o.giveCash);
        this.floatDelta(o.to, o.giveCash - o.getCash);
        if (!this.fast) this.snd.deal();
        this.react(o.from, "deal");
        this.react(o.to, "deal");
        this.toast(`<b>${T("DEAL", "成交")}</b><div class="bb-dealw">${this.medal(o.from, "sm")}<span>${this.offerSide(o.give, o.giveCash, o.givePardon)}</span><em>${ICON.trade}</em><span>${this.offerSide(o.get, o.getCash, o.getPardon)}</span>${this.medal(o.to, "sm")}</div>`, "deal", 2600);
        this.log(`${esc(this.nm(o.from))} ⇄ ${esc(this.nm(o.to))}: trade`, `${esc(this.nm(o.from))} ⇄ ${esc(this.nm(o.to))}：交易`, this.col(o.from));
        this.renderSeats();
        await v.wait(1.2);
        break;
      }
      case "say":
        if (!this.o.seats[e.seat].human || this.auto) this.say(e.seat, e.key);
        break;
      case "end":
        this.active = -1;
        this.redrawBar = null;
        this.bar([]);
        this.renderTurn();
        break;
    }
  }

  /** The HUD's copy from the engine (at a turn's start, when nothing is pending). */
  private syncAll() {
    const g = this.g!;
    for (const b of g.p) this.cash[b.seat] = b.cash;
    for (const i of OWNABLE) {
      const d = g.deeds[i]!;
      if (this.own[i] !== d.owner || this.mort[i] !== d.mortgaged) this.view.setOwner(i, d.owner, d.mortgaged);
      if (this.lvl[i] !== d.level) this.view.setLevel(i, d.level, false);
      this.own[i] = d.owner;
      this.mort[i] = d.mortgaged;
      this.lvl[i] = d.level;
    }
    for (const b of g.p) if (!b.out) this.view.setPawn(b.seat, b.pos, b.jailed);
    if (this.park !== g.park) ((this.park = g.park), this.view.setPot(g.park));
    this.renderSeats();
  }

  private async animPay(e: Extract<Ev, { t: "pay" }>) {
    const v = this.view;
    const from = e.from >= 0 ? e.from : e.from === PARKPOT ? "park" : "bank";
    const to = e.to >= 0 ? e.to : e.to === PARKPOT ? "park" : "bank";
    if (e.from >= 0) ((this.cash[e.from] -= e.amount), this.floatDelta(e.from, -e.amount));
    if (e.to >= 0) ((this.cash[e.to] += e.amount), this.floatDelta(e.to, e.amount));
    if (e.to === PARKPOT) this.park += e.amount;
    if (e.from === PARKPOT) this.park = 0;
    const n = Math.max(2, Math.min(12, Math.round(Math.sqrt(e.amount) / 2)));
    const big = e.why === "rent" && e.amount >= 300;
    let msg: [string, string] | null = null;
    let amt = "";
    switch (e.why) {
      case "rent":
        msg = [`${esc(this.nm(e.from))} paid rent to ${esc(this.nm(e.to))}`, `${esc(this.nm(e.from))} 向 ${esc(this.nm(e.to))} 支付租金`];
        amt = fmt(e.amount);
        this.react(e.from, big ? "ouch" : "pay", big ? "!!" : "");
        this.react(e.to, "gain");
        if (e.amount >= 60 || Math.random() < 0.4) {
          this.say(e.from, big ? "paidBig" : "paid", 1800);
          setTimeout(() => this.say(e.to as number, "got", 1600), 500);
        }
        if (big) {
          v.shake(0.1);
          if (!this.fast) this.snd.bigPay();
        }
        break;
      case "reward":
        msg = [`${esc(this.nm(e.to))}: block reward`, `${esc(this.nm(e.to))}：区块奖励`];
        amt = `+${fmt(e.amount)}`;
        if (!this.fast) this.snd.reward();
        this.react(e.to, "gain");
        if (Math.random() < 0.3) this.say(e.to, "genesis", 1400);
        break;
      case "perfect":
        msg = [`${esc(this.nm(e.to))}: a perfect block`, `${esc(this.nm(e.to))}：完美区块`];
        amt = `+${fmt(e.amount)}`;
        this.toast(`<b>${T("PERFECT BLOCK", "完美区块")}</b><small>+${cr(e.amount)}</small>`, "good", 1300);
        this.react(e.to, "gain", "+");
        break;
      case "tax":
        msg = [`${esc(this.nm(e.from))} paid at ${esc(SPACES[e.space ?? 4].en)}`, `${esc(this.nm(e.from))} 在 ${esc(SPACES[e.space ?? 4].zh)} 付款`];
        amt = `−${fmt(e.amount)}`;
        this.react(e.from, "pay");
        break;
      case "fine":
        msg = [`${esc(this.nm(e.from))} paid the fine`, `${esc(this.nm(e.from))} 支付罚款`];
        amt = `−${fmt(e.amount)}`;
        this.react(e.from, "pay");
        break;
      case "park":
        msg = [`${esc(this.nm(e.to))} took CENTRAL PARK's pot`, `${esc(this.nm(e.to))} 拿走中央公园奖池`];
        amt = `+${fmt(e.amount)}`;
        this.toast(`<b>${T("PARK POT", "公园奖池")}</b><small>${esc(this.nm(e.to))} +${cr(e.amount)}</small>`, "good", 1500);
        this.react(e.to, "win", "+");
        this.say(e.to, "park");
        break;
      case "card":
        msg = e.from >= 0 ? [`${esc(this.nm(e.from))} paid ${esc(this.nm(e.to))}`, `${esc(this.nm(e.from))} 向 ${esc(this.nm(e.to))} 付款`] : [`${esc(this.nm(e.to))} collected`, `${esc(this.nm(e.to))} 收款`];
        amt = fmt(e.amount);
        if (e.from >= 0) this.react(e.from, "pay");
        if (e.to >= 0) this.react(e.to, "gain");
        break;
      case "bankrupt":
        msg = [`${esc(this.nm(e.from))}'s last credits → ${esc(this.nm(e.to))}`, `${esc(this.nm(e.from))} 最后的钱 → ${esc(this.nm(e.to))}`];
        amt = fmt(e.amount);
        break;
    }
    if (msg) this.log(msg[0], msg[1], e.from >= 0 ? this.col(e.from) : this.col(e.to), amt);
    const pan = this.pan(e.to >= 0 ? e.to : -1) * 0.6;
    await v.payChips(from, to, n, () => {
      if (!this.fast) this.snd.chip(pan);
    });
    if (e.to === PARKPOT || e.from === PARKPOT) v.setPot(this.park);
    if (e.to >= 0 && e.why !== "bankrupt") v.cheer(e.to);
    this.renderSeats();
  }

  private async animAuction(e: Extract<Ev, { t: "auction" }>) {
    const v = this.view;
    v.focus({ k: "space", i: e.space });
    const bids = e.bids
      .map((b, s) => ({ s, b }))
      .filter((x) => !this.outSeats.has(x.s))
      .sort((a, b) => b.b - a.b);
    if (e.winner >= 0) {
      this.cash[e.winner] -= e.price;
      this.floatDelta(e.winner, -e.price);
      this.own[e.space] = e.winner;
      v.setOwner(e.space, e.winner, false);
    }
    this.log(e.winner >= 0 ? `${esc(this.nm(e.winner))} won ${esc(SPACES[e.space].en)} at auction` : `No bids for ${esc(SPACES[e.space].en)}`, e.winner >= 0 ? `${esc(this.nm(e.winner))} 拍得 ${esc(SPACES[e.space].zh)}` : `${esc(SPACES[e.space].zh)} 无人出价`, e.winner >= 0 ? this.col(e.winner) : "", e.winner >= 0 ? `−${fmt(e.price)}` : "");
    if (this.fast) return this.renderSeats();
    // the sealed slips, face down, turned over from the lowest to the highest
    const { card, done } = this.modal(
      "bb-reveal",
      `<header><small>${T("SEALED FEE AUCTION", "密封出价拍卖")}</small><h3>${esc(spaceName(e.space))}</h3><p>${T("list price", "标价")} ${cr(SPACES[e.space].price!)}</p></header><div class="bb-bids"></div>`,
    );
    const box = card.querySelector<HTMLElement>(".bb-bids")!;
    for (const x of bids) {
      const r = el("div", "bb-bidrow", `<div class="bb-slipc"><div class="bk"></div><div class="fr">${this.medal(x.s, "sm")}<b>${esc(this.nm(x.s))}</b><span class="bb-bidamt">${x.b ? cr(x.b) : T("no bid", "未出价")}</span></div></div>`);
      r.style.setProperty("--c", this.col(x.s));
      box.appendChild(r);
    }
    const rows = [...box.children] as HTMLElement[];
    this.snd.paper();
    await v.wait(0.35);
    for (let k = rows.length - 1; k >= 0; k--) {
      await v.wait(0.2);
      rows[k].classList.add("show");
      this.snd.cardFlip();
    }
    await v.wait(0.4);
    if (e.winner >= 0) {
      rows[0].classList.add("win");
      this.snd.gavel(2);
      v.burstAt(e.space, [this.col(e.winner), "#ece4d3"]);
      v.cheer(e.winner);
      this.react(e.winner, "buy");
    } else card.querySelector("header p")!.innerHTML += ` · ${T("no bids: it stays in the bank", "无人出价：留在银行")}`;
    this.renderSeats();
    await v.wait(1.3);
    done();
    await v.wait(0.15);
  }

  /** A deed card slides out and gets the buyer's stamp. */
  private async stampDeed(i: number, seat: number, word: string) {
    if (this.fast) return;
    const w = el("div", "bb-stampdeed", `${this.deedHTML(i)}<div class="bb-stampw" style="--c:${this.col(seat)}">${word}</div>`);
    const at = this.view.spaceScreen(i);
    const R = this.root.getBoundingClientRect();
    w.style.setProperty("--fx", `${Math.round(at.x - R.left - R.width / 2)}px`);
    w.style.setProperty("--fy", `${Math.round(at.y - R.top - R.height / 2)}px`);
    this.root.appendChild(w);
    this.snd.cardSlide();
    requestAnimationFrame(() => w.classList.add("in"));
    await this.view.wait(0.32);
    w.classList.add("stamped");
    this.snd.stamp();
    await this.view.wait(this.o.seats[seat].human && !this.auto ? 1.1 : 0.75);
    w.classList.add("out");
    setTimeout(() => w.remove(), 320);
  }

  /** An event card: it leaves the deck, flies to you and turns over. */
  private async showCard(seat: number, deck: "mempool" | "qip", k: number) {
    const c = (deck === "mempool" ? MEMPOOL : QIPS)[k];
    this.log(`${esc(this.nm(seat))} drew ${deck === "mempool" ? "MEMPOOL" : "ZIP"}: ${esc(c.en)}`, `${esc(this.nm(seat))} 抽到${deck === "mempool" ? "内存池" : "ZIP 提案"}：${esc(c.zh)}`, this.col(seat));
    if (this.fast) return;
    void this.view.liftCard(deck);
    this.snd.cardSlide();
    const human = this.o.seats[seat].human && !this.auto;
    const from = this.view.deckScreen(deck);
    const R = this.root.getBoundingClientRect();
    const col = deck === "mempool" ? "#ff6b35" : "#c4b1fc";
    await new Promise<void>((res) => {
      const w = el(
        "div",
        `bb-tcard ${deck}`,
        `<div class="bb-tc-in"><div class="bb-tc-back"><img src="${iconURL(deck, col, "#ece4d3")}" alt=""><b>${deck === "mempool" ? "MEMPOOL" : "ZIP"}</b></div>
        <div class="bb-tc-front"><header><img src="${iconURL(deck, col)}" alt=""><b>${deck === "mempool" ? T("MEMPOOL", "内存池") : T("ZIP · GOVERNANCE", "ZIP 提案 · 治理")}</b></header><p>${esc(T(c.en, c.zh))}</p><footer>${this.medal(seat, "sm")}<span style="color:${this.col(seat)}">${esc(this.nm(seat))}</span></footer>${human ? `<button class="bb-btn primary"><span class="bb-bl"><b>OK</b></span><kbd>SPACE</kbd></button>` : ""}</div></div>`,
      );
      w.style.setProperty("--fx", `${Math.round(from.x - R.left - R.width / 2)}px`);
      w.style.setProperty("--fy", `${Math.round(from.y - R.top - R.height / 2)}px`);
      this.root.appendChild(w);
      const entry = { el: w, close: human ? () => fin() : undefined };
      if (human) this.modalStack.push(entry);
      requestAnimationFrame(() => w.classList.add("in"));
      setTimeout(
        () => {
          w.classList.add("flip");
          this.snd.cardFlip();
        },
        420 / (this.ff ? 2 : 1),
      );
      let over = false;
      const fin = () => {
        if (over) return;
        over = true;
        const i = this.modalStack.indexOf(entry);
        if (i >= 0) this.modalStack.splice(i, 1);
        w.classList.add("out");
        this.snd.paper();
        setTimeout(() => w.remove(), 320);
        res();
      };
      if (human) {
        w.querySelector<HTMLButtonElement>("button")!.onclick = () => (this.snd.ui(), fin());
        setTimeout(fin, 9000);
      } else void this.view.wait(2.3).then(fin);
    });
  }

  private async humanOut() {
    const place = this.g!.alive().length + 1;
    const res = this.resultNow();
    this.snd.lose();
    await new Promise<void>((done) => {
      const { card, done: close } = this.modal(
        "bb-outm",
        `<div class="bb-bigstamp">${T("BANKRUPT", "破产")}</div><h3>${T("You're out of credits", "你的钱用光了")}</h3><p>${T(`You finish <b>#${place}</b> of ${this.o.seats.length}.`, `你位列第 <b>${place}</b> 名（共 ${this.o.seats.length} 人）。`)}${res.payout ? ` ${T(`Payout: <b>ⓩ ${fmt(res.payout)}</b> (play chips).`, `奖励：<b>ⓩ ${fmt(res.payout)}</b>（游戏筹码）。`)}` : ""}</p>
        <div class="bb-row"><button class="bb-btn ghost wt"><span class="bb-ico">${ICON.eye}</span><span class="bb-bl"><b>${T("WATCH", "观战")}</b><small>${T("fast-forward", "快进")}</small></span></button><button class="bb-btn primary lv"><span class="bb-bl"><b>${T("LEAVE TABLE", "离开牌桌")}</b></span></button></div>`,
      );
      card.querySelector<HTMLButtonElement>(".wt")!.onclick = () => {
        close();
        if (!this.ff) this.toggleFF();
        done();
      };
      card.querySelector<HTMLButtonElement>(".lv")!.onclick = () => {
        close();
        this.exit(res);
        done();
      };
    });
  }

  // ---- the end -----------------------------------------------------------------------------------

  /** The result as things stand (the human's place is settled once they are out). */
  private resultNow(): TableResult {
    const g = this.g!;
    const order = g.standings();
    const place = order.indexOf(0);
    const share = shares(this.o.seats.length)[place] ?? 0;
    const payout = Math.round(this.o.stake * this.o.seats.length * share);
    const ord = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"][place];
    const how = g.p[0].out ? "bankrupt" : `net worth ${cr(g.worth(0))}`;
    return { order, payout, summary: `BLOCK BARONS: ${ord} of ${this.o.seats.length} (${MODES[this.mode].en.toLowerCase()}), ${how}${payout ? `, +ⓩ${fmt(payout)}` : ""}` };
  }

  /** The final count: everyone's net worth counted up as chip stacks, sorted into place. */
  private async final() {
    const g = this.g!;
    this.syncAll();
    this.active = -1;
    this.renderTurn();
    const res = this.resultNow();
    const order = res.order;
    const why = g.endWhy;
    const head = why === "last" ? T("LAST BARON STANDING", "最后的大亨") : why === "time" ? T("TIME. THE FINAL COUNT", "时间到 · 最终清点") : T("THE FINAL COUNT", "最终清点");
    const maxW = Math.max(1, ...order.map((s) => g.worth(s)));
    const places = [T("1st", "第1"), T("2nd", "第2"), T("3rd", "第3"), T("4th", "第4"), T("5th", "第5"), T("6th", "第6"), T("7th", "第7"), T("8th", "第8")];
    const sh = shares(this.o.seats.length);
    this.view.focus({ k: "over" });
    const { card, done } = this.modal(
      "bb-final",
      `<header><small>BLOCK BARONS · ${T(MODES[this.mode].en, MODES[this.mode].zh)}</small><h2>${head}</h2><p class="bb-sub">${T("Net worth = cash + deeds (half when pledged) + miners and Foundries at cost", "身家 = 现金 + 地契（抵押按半价）+ 矿机和铸造厂成本")}</p></header><div class="bb-rows"></div>
      <div class="bb-payout"></div>
      <div class="bb-row"><button class="bb-btn primary lv" disabled><span class="bb-bl"><b>${T("LEAVE TABLE", "离开牌桌")}</b></span><kbd>SPACE</kbd></button></div>`,
    );
    const rows = card.querySelector<HTMLElement>(".bb-rows")!;
    // the rows in seat order first, then they count up and sort themselves
    const items = this.o.seats.map((s) => {
      const r = el("div", `bb-frow${s.human ? " me" : ""}${g.p[s.seat].out ? " out" : ""}`, `<span class="bb-fpl"></span>${this.medal(s.seat, "sm")}<b>${esc(this.nm(s.seat))}</b><div class="bb-fbar"><i></i></div><span class="bb-fw">0</span>`);
      r.style.setProperty("--c", s.color);
      rows.appendChild(r);
      return { s: s.seat, r, w: g.p[s.seat].out ? 0 : g.worth(s.seat), fw: r.querySelector<HTMLElement>(".bb-fw")!, bar: r.querySelector<HTMLElement>(".bb-fbar i")! };
    });
    const dur = this.fast ? 0.01 : 2.2;
    let tick = 0;
    await this.view.tween(dur, (k) => {
      const q = 1 - Math.pow(1 - k, 3);
      for (const it of items) {
        it.fw.textContent = g.p[it.s].out ? T("bankrupt", "破产") : cr(it.w * q);
        it.bar.style.width = `${((it.w * q) / maxW) * 100}%`;
      }
      if (!this.fast && k * 18 > tick) (tick++, this.snd.chip());
    });
    // sort into place
    order.forEach((s, k) => {
      const it = items.find((x) => x.s === s)!;
      it.r.style.order = String(k);
      it.r.querySelector(".bb-fpl")!.textContent = places[k];
      if (k === 0) it.r.classList.add("win");
      if (sh[k] && this.o.stake) it.r.querySelector(".bb-fpl")!.innerHTML += `<small>ⓩ ${fmt(Math.round(this.o.stake * this.o.seats.length * sh[k]))}</small>`;
    });
    const winner = order[0];
    this.view.setActive(winner);
    this.view.focus({ k: "pawn", seat: winner });
    this.view.cheer(winner);
    this.react(winner, "win");
    const place = order.indexOf(0);
    if (!this.fast) (place === 0 ? this.snd.win() : place < sh.length && this.o.stake ? this.snd.win() : this.snd.lose());
    card.querySelector<HTMLElement>(".bb-payout")!.innerHTML = this.o.stake
      ? res.payout
        ? T(`You finish <b>${places[place]}</b>: <b class="win">+ⓩ ${fmt(res.payout)}</b> <small>(play chips)</small>`, `你获得<b>${places[place]}</b>名：<b class="win">+ⓩ ${fmt(res.payout)}</b> <small>（游戏筹码）</small>`)
        : T(`You finish <b>${places[place]}</b>: no payout this time.`, `你获得<b>${places[place]}</b>名：这次没有奖励。`)
      : T(`You finish <b>${places[place]}</b>.`, `你获得<b>${places[place]}</b>名。`);
    if (winner !== 0) this.say(winner, "win", 3000);
    const lv = card.querySelector<HTMLButtonElement>(".lv")!;
    lv.disabled = false;
    lv.onclick = () => {
      this.snd.ui();
      done();
      this.exit(res);
    };
    if (this.auto) setTimeout(() => (done(), this.exit(res)), this.fast ? 5000 : 4000);
  }

  private exit(r: TableResult | null) {
    if (this.exited) return;
    this.exited = true;
    this.o.onExit(r);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    for (const t of this.reactT.values()) clearTimeout(t);
    for (const f of this.offs) f();
    this.snd.stop();
    this.view.dispose();
    this.root.remove();
  }
}
