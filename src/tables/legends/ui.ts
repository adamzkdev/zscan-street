/**
 * ZK LEGENDS' table: the duel. The board is a three.js scene (view3d.ts, its arena from maps.ts):
 * minions as framed medallions, heroes, powers, crystals, decks, the END TURN plate, all in 3D.
 * Over it, in the DOM: your hand (painted cards, drag them up), the targeting arrow, damage numbers,
 * the rival's played card shown large, the log of plays, previews, banners and the menus.
 *
 * Every move goes through the engine (`apply`), whose events (g.ev) are played back in order with
 * their show (a card flies, a minion drops in, lunges, numbers burst, the dead shatter into their
 * own pixels), then the view is reconciled with the state (`syncAll`) so nothing drifts. Moves: drag a
 * card onto the board (or click it, then click where); drag a minion or your hero onto what it
 * attacks; a spell or a Mint with a target draws an arrow. The rival is a zkSNARK AI (ai.ts).
 */
import "./legends.css";
import { T } from "../../i18n/lang";
import type { TableOpts, TableResult } from "../types";
import {
  HERO_UID,
  KW,
  POWERS,
  apply,
  attackTargets,
  canAttack,
  canPlay,
  canPower,
  card,
  costOf,
  isHero,
  minion,
  mulberry,
  playTargets,
  prover,
  targets,
  type Action,
  type Ev,
  type Game,
  type HandCard,
  type Minion,
  type Side,
  newGame,
} from "./engine";
import "./cards";
import { FACTIONS, FACTION_INFO } from "./cards";
import { decide, mulligan, boardDamage } from "./ai";
import { STARTERS, STARTER_NAMES, type Pool } from "./decks";
import { KW_HELP, cardEl, cardName, factionName, iconCanvas, keywordsOf, kwLabel, powerCardEl, preload, setCardCost, snarkCanvas } from "./art";
import { LegendsSound } from "./sound";
import { openMenus, awardDuel } from "./menus";
import { installHudArt } from "./hudart";
import { arenaResult } from "./arena";
import { loadSnarks, snarksReady, snarkInfo, rivalDeck, ensureCards, snarkCardId } from "./snarkcards";
import { View3D, type Pick } from "./view3d";
import { MAPS, type MapKind } from "./maps";
import * as MAPS_MOD from "./maps";

type XY = { x: number; y: number };
/** Material Symbols' settings gear (Apache 2.0). */
const GEAR = "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** What the rival zkSNARK says, and what you can say (Hearthstone's emotes, ZStreet's words). */
const LINES: Record<string, [string, string][]> = {
  greet: [["Greetings.", "你好。"], ["Shielded and ready.", "已屏蔽，准备就绪。"], ["Let's settle this on-chain.", "链上见分晓。"], ["May the best proof win.", "愿最好的证明获胜。"]],
  legend: [["Behold.", "看好了。"], ["This one's rare.", "这张可稀有了。"], ["From the Apparitions.", "来自显灵者。"]],
  low: [["Hm. Close.", "嗯，有点悬。"], ["Not like this...", "不该这样……"], ["I'm still in this.", "我还没输。"]],
  big: [["Ouch.", "哎哟。"], ["That one hurt.", "这下疼了。"]],
  win: [["Well played.", "打得好。"], ["Proof verified.", "证明已验证。"]],
  lose: [["Well played.", "打得好。"], ["GG. I'll be back.", "好局，我还会回来的。"]],
  "re:greet": [["Greetings.", "你好。"]],
  "re:wp": [["Thanks.", "谢谢。"], ["You too.", "你也是。"]],
  "re:wow": [["Heh.", "嘿。"]],
  "re:oops": [["Happens.", "常有的事。"]],
};
const EMOTES: [string, string, string][] = [
  ["greet", "Greetings.", "你好。"],
  ["wp", "Well played.", "打得好。"],
  ["wow", "Wow!", "哇！"],
  ["oops", "Oops.", "哎呀。"],
];

interface Layout {
  W: number;
  H: number;
  portrait: boolean;
  cw: number;
  cx: number;
  handY: number;
}

interface Target {
  kind: "card" | "attack" | "power";
  uid: number;
  pos?: number;
  from: XY;
  valid: number[];
  /** Pointer went down on the source and hasn't come up yet (drag): release picks. */
  dragging: boolean;
}

export class LegendsTable {
  private o: TableOpts;
  private root: HTMLDivElement;
  private snd = new LegendsSound();
  private fast: boolean;
  private auto: boolean;
  private closed = false;
  private exited = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private ro: ResizeObserver | null = null;

  private g!: Game;
  private readonly me: Side = 0;
  private readonly foe: Side = 1;
  private rnd: () => number;
  private names: [string, string];
  private pools: [Pool, Pool] = ["transparent", "orchard"];
  private deckName = "";
  private mapKind: MapKind;

  // the view
  private view!: View3D;
  private handLayer!: HTMLDivElement;
  private fxLayer!: HTMLDivElement;
  private arrow!: SVGSVGElement;
  private logEl!: HTMLDivElement;
  private previewEl!: HTMLDivElement;
  private hand = new Map<number, HTMLDivElement>();
  private handOrder: number[] = [];
  private snaps = new Map<number, Minion>();
  private secretsN = [0, 0];
  private backsN = 0;
  private L!: Layout;
  private tension = false;
  private turnHintShown = false;

  // what the player is doing
  private busy = false;
  private hoverUid = 0;
  private hoverPick = "";
  private picked = 0;
  private drag: { uid: number; el: HTMLDivElement; start: XY; moved: boolean } | null = null;
  private tgt: Target | null = null;
  private pending: { uid: number; el: HTMLDivElement; pos: number } | null = null;
  private pointer: XY = { x: 0, y: 0 };
  private overlay: HTMLDivElement | null = null;
  private bubbles: (HTMLDivElement | null)[] = [null, null];
  private said = new Set<string>();
  private emoteMenu: HTMLDivElement | null = null;

  constructor(o: TableOpts) {
    this.o = o;
    this.fast = !!o.lab?.fast;
    this.auto = !!o.lab?.auto;
    this.rnd = mulberry(o.seed ^ 0x51f15e);
    this.names = [o.seats[0]?.name ?? "You", o.seats[1]?.name ?? "Rival"];
    this.root = document.createElement("div");
    this.root.className = "zkl-root";
    o.root.appendChild(this.root);
    installHudArt(this.root);
    this.root.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey, true);
    this.pools[1] = FACTIONS[(o.seed >>> 3) % 4];
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("map") : null;
    let pref = "";
    try {
      pref = localStorage.getItem("street.legends.board") ?? "";
    } catch {
      /* private mode */
    }
    const want = q ?? pref;
    this.mapKind = (MAPS as string[]).includes(want) ? (want as MapKind) : MAPS[(o.seed >>> 9) % MAPS.length];
    preload([o.seats[0]?.id ?? 1, o.seats[1]?.id ?? 2]);
    if (typeof location !== "undefined" && location.pathname.includes("tablelab")) (globalThis as unknown as { zkl: LegendsTable }).zkl = this;
    // the 10,000 zkSNARK cards' data (70 KB), then the rival's pool: its own zkSNARK's, when it has one
    this.snarks = loadSnarks()
      .then(() => {
        const f = snarkInfo(o.seats[1]?.id ?? 2).faction;
        if (f !== "neutral") this.pools[1] = f as Pool;
      })
      .catch(() => {});
    if (this.auto) {
      const p = FACTIONS[(o.seed >>> 5) % 4];
      void this.snarks.then(() => this.begin(STARTERS[p], p, STARTER_NAMES[p][0]));
    } else this.hub();
  }
  private snarks: Promise<void>;

  /** The game's own front door: Play, Collection, Packs (menus.ts). */
  private hub() {
    const s = this.o.seats;
    this.menus = openMenus(this.root, {
      meId: s[0]?.id ?? 1,
      rival: { id: s[1]?.id ?? 2, name: this.names[1], skill: s[1]?.skill ?? 0.5 },
      stake: this.o.stake,
      snd: this.snd,
      onDuel: (deck, pool, name) => {
        this.menus = null;
        this.begin(deck, pool, name);
      },
      onLeave: () => this.exit(null),
    });
  }
  private menus: { close(): void } | null = null;

  // ---- lifecycle --------------------------------------------------------------------------------------

  close() {
    this.exit(null);
  }
  private exit(res: TableResult | null) {
    if (this.exited) return;
    this.exited = true;
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    window.removeEventListener("keydown", this.onKey, true);
    this.ro?.disconnect();
    this.menus?.close();
    for (const t of this.ropeT) clearTimeout(t);
    this.snd.ambience(null);
    this.snd.music(null);
    this.view?.dispose();
    for (const a of this.root.getAnimations({ subtree: true })) a.cancel();
    this.root.remove();
    this.o.onExit(res);
  }
  private wait(ms: number): Promise<void> {
    if (this.fast || this.closed) return Promise.resolve();
    return new Promise((r) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        r();
      }, ms);
      this.timers.add(t);
    });
  }
  private later(f: () => void, ms: number) {
    if (this.fast) return f();
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.closed) f();
    }, ms);
    this.timers.add(t);
  }
  private onKey = (e: KeyboardEvent) => {
    if (this.closed) return;
    if (e.key === "Escape") {
      if (this.tgt || this.pending || this.picked) {
        this.cancel();
        e.stopPropagation();
      }
    } else if ((e.key === " " || e.key === "Enter") && this.myTurn() && !this.overlay && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      this.endTurn();
    }
  };

  // ---- before the duel: the deck --------------------------------------------------------------------

  private over(html: string, cls = ""): HTMLDivElement {
    this.preview(null);
    this.overlay?.remove();
    const o = document.createElement("div");
    o.className = "zkl-over";
    o.innerHTML = `<div class="zkl-panel ${cls}">${html}</div>`;
    this.root.appendChild(o);
    this.overlay = o;
    return o;
  }
  private closeOver() {
    this.overlay?.remove();
    this.overlay = null;
  }

  private rulesScreen(back: () => void) {
    const kws = Object.entries(KW_HELP);
    const o = this.over(
      `<div class="zkl-h1">${T("How to play", "玩法")}</div>
       <div class="zkl-rules">
         <p><b>${T("The duel", "对决")}</b>${T("Each hero has 30 Health. Bring the rival's to 0. You start with 3 cards (4 and a Spare Zatoshi if you go second).", "每个英雄有 30 点生命值，把对手的打到 0。先手起手 3 张牌（后手 4 张外加一枚零钱）。")}</p>
         <p><b>ZEC</b>${T("You get one more ZEC crystal each turn, up to 10, refilled every turn. Cards cost ZEC.", "每回合多获得一个 ZEC 水晶，最多 10 个，每回合补满。打出卡牌需要花费 ZEC。")}</p>
         <p><b>${T("Minions", "随从")}</b>${T("Drag a minion onto your side of the board. Next turn it can attack: drag it onto an enemy minion or the enemy hero. Both deal their Attack to each other.", "把随从拖到你的战场。下回合它可以攻击：拖到敌方随从或英雄身上。双方互相造成攻击力的伤害。")}</p>
         <p><b>${T("Spells", "法术")}</b>${T("Drag a spell up, or onto its target. A Secret stays hidden until your rival sets it off.", "把法术拖上去，或拖到目标上。奥秘会保持隐藏，直到对手触发它。")}</p>
         <p><b>${T("Hero power", "英雄技能")}</b>${T("Once a turn, 2 ZEC: Transparent hits the enemy hero, Sapling plants a Seedling, Sprout draws a card for 2 Health, Orchard deals 1 damage.", "每回合一次，2 ZEC：透明池攻击敌方英雄，Sapling 种下幼苗，Sprout 以 2 点生命抽一张牌，Orchard 造成 1 点伤害。")}</p>
         <p><b>${T("Your turn", "你的回合")}</b>${T("Space or the End turn plate ends it. Esc or a right click cancels a move. The board holds 7 minions, the hand 10 cards; an empty deck hurts more each draw.", "空格键或结束回合按钮结束回合。Esc 或右键取消操作。战场最多 7 个随从，手牌最多 10 张；牌库空了以后每次抽牌伤害递增。")}</p>
         ${kws.map(([k, v]) => `<p><b>${kwLabel(k)}</b>${T(v[0], v[1])}</p>`).join("")}
       </div>
       <div class="zkl-row" style="margin-top:20px;justify-content:flex-end"><button class="zkl-btn" data-back>${T("Back", "返回")}</button></div>`,
    );
    o.querySelector("[data-back]")!.addEventListener("click", () => {
      this.closeOver();
      back();
    });
  }

  // ---- the duel ---------------------------------------------------------------------------------------

  private begin(deck: string[], pool: Pool, name: string) {
    this.pools[0] = pool;
    this.deckName = name;
    const rp = this.pools[1];
    const first: Side = ((this.o.seed >>> 7) & 1) as Side;
    // the rival's deck: its starter with zkSNARKs in it (rarer the stronger the rival), its own card among them
    let theirs = STARTERS[rp];
    if (snarksReady()) {
      const rid = this.o.seats[1]?.id ?? 2;
      theirs = rivalDeck(STARTERS[rp], rp, this.o.seats[1]?.skill ?? 0.5, this.o.seed);
      const own = snarkCardId(rid);
      const f = snarkInfo(rid).faction;
      if ((f === rp || f === "neutral") && !theirs.includes(own)) theirs = [...theirs.slice(0, -1), own];
      ensureCards(theirs);
    }
    ensureCards(deck);
    this.g = newGame({
      seed: this.o.seed,
      decks: [deck, theirs],
      factions: [pool, rp],
      arts: [this.o.seats[0]?.id ?? 1, this.o.seats[1]?.id ?? 2],
      first,
    });
    preload([...new Set([...deck, ...theirs].map((id) => card(id).art))]);
    this.buildBoard();
    this.snd.startDrone();
    // the arena's own ambient loop (maps.ts names it)
    const amb = (MAPS_MOD as unknown as { MAP_INFO?: Record<string, { ambience?: string }> }).MAP_INFO?.[this.mapKind]?.ambience;
    if (amb) this.snd.ambience(amb);
    if (this.auto) {
      for (const s of [0, 1] as Side[]) apply(this.g, s, { k: "mull", side: s, swap: mulligan(this.g, s, this.aiOpts(s)) });
      this.g.ev = [];
      this.syncAll();
      void this.loop();
    } else void this.versus().then(() => !this.closed && this.mulliganScreen());
  }

  /** Hearthstone's face-off: both heroes slide in, VS slams down, then the hands are dealt. */
  private async versus() {
    const s = this.o.seats;
    const side = (k: Side) => {
      const pool = this.pools[k];
      const sub = k === this.me ? `${esc(this.deckName)} · ${factionName(pool)}` : `#${s[1]?.id ?? 2} · ${factionName(pool)} · ${skillName(s[1]?.skill ?? 0.5)}`;
      return `<div class="side ${k === this.me ? "me" : "foe"}" style="--fc:${FACTION_INFO[pool].color}"><div class="pic" data-pic="${k}"></div><b>${esc(this.names[k])}</b><small>${sub}</small></div>`;
    };
    const el = div("zkl-vsintro");
    el.style.setProperty("--fc0", FACTION_INFO[this.pools[this.me]].color);
    el.style.setProperty("--fc1", FACTION_INFO[this.pools[this.foe]].color);
    el.innerHTML = `${side(this.me)}<div class="vs">VS</div>${side(this.foe)}`;
    for (const k of [0, 1] as Side[]) el.querySelector(`[data-pic="${k}"]`)!.appendChild(snarkCanvas(s[k]?.id ?? k + 1));
    this.root.appendChild(el);
    // behind it the camera waits high over the hall, then sweeps down onto the table as it fades
    if (!this.fast) {
      this.view.entrance(1400, 1.5);
      // what sits on the screen by the 3D pieces is placed again once the camera has landed
      this.later(() => this.layout(), 3000);
    }
    this.snd.reveal();
    this.later(() => {
      this.snd.land(true);
      this.view.shake(0.4);
    }, 650);
    await this.wait(2300);
    el.classList.add("out");
    await this.wait(450);
    el.remove();
  }

  private aiOpts(side: Side) {
    return { skill: side === this.foe ? (this.o.seats[1]?.skill ?? 0.5) : 0.85, rnd: this.rnd };
  }

  private mulliganScreen() {
    const g = this.g;
    const s = g.s[this.me];
    const swap = new Set<number>();
    const firstMe = g.first === this.me;
    const o = this.over(
      `<div class="zkl-h1" style="text-align:center">${firstMe ? T("You go first", "你先手") : T("You go second", "你后手")}</div>
       <p class="zkl-sub" style="text-align:center">${T("Pick the cards to send back, then keep the hand. ", "选择要换掉的牌，然后保留手牌。")}${firstMe ? "" : T("Going second, you'll also get a Spare Zatoshi.", "后手还会得到一枚零钱。")}</p>
       <div class="zkl-mull"></div>
       <div class="zkl-row" style="justify-content:center"><button class="zkl-btn" data-keep>${T("Keep", "确定")}</button></div>`,
      "zkl-glass",
    );
    const box = o.querySelector(".zkl-mull")!;
    for (const h of s.hand) {
      const el = cardEl(h.id);
      el.addEventListener("click", () => {
        if (swap.has(h.uid)) swap.delete(h.uid);
        else swap.add(h.uid);
        el.classList.toggle("swap", swap.has(h.uid));
        this.snd.pick();
      });
      box.appendChild(el);
    }
    o.querySelector("[data-keep]")!.addEventListener("click", () => {
      this.closeOver();
      g.ev = [];
      apply(g, this.foe, { k: "mull", side: this.foe, swap: mulligan(g, this.foe, this.aiOpts(this.foe)) });
      apply(g, this.me, { k: "mull", side: this.me, swap: [...swap] });
      const evs = g.ev!.slice();
      g.ev = [];
      void (async () => {
        this.busy = true;
        this.syncAll(true);
        await this.wait(250);
        await this.play(evs);
        this.busy = false;
        this.syncAll();
        void this.loop();
      })();
    });
  }

  private buildBoard() {
    const r = this.root;
    r.replaceChildren();
    this.overlay = null;
    this.view = new View3D(r, [this.pools[0], this.pools[1]], this.mapKind);
    this.view.setHeroArt(0, this.o.seats[0]?.id ?? 1);
    this.view.setHeroArt(1, this.o.seats[1]?.id ?? 2);
    this.view.setEnd("wait", "");
    for (const s of [0, 1] as Side[]) {
      this.view.setHero(s, this.g.s[s].hero);
      this.view.setDeck(s, this.g.s[s].deck.length);
    }
    this.handLayer = div("zkl-layer zkl-hand");
    this.fxLayer = div("zkl-layer");
    this.fxLayer.style.pointerEvents = "none";
    r.append(this.handLayer, this.fxLayer);
    this.logEl = div("zkl-log");
    r.appendChild(this.logEl);
    this.previewEl = div("zkl-preview");
    this.previewEl.style.display = "none";
    this.fxLayer.appendChild(this.previewEl);
    this.arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.arrow.classList.add("zkl-arrow");
    this.arrow.innerHTML = `<g class="tail"></g><polygon class="head" points=""/><g class="ret"><circle r="27"/><path d="M0 -38V-24M0 24V38M-38 0H-24M24 0H38"/></g>`;
    this.arrow.style.display = "none";
    this.fxLayer.appendChild(this.arrow);
    // the names, Hearthstone's: tabs at the screen's left edge, the rival's on top, yours at the bottom
    for (const k of [this.foe, this.me]) {
      const n = div(`zkl-tag ${k === this.me ? "me" : "foe"}`);
      n.style.setProperty("--fc", FACTION_INFO[this.pools[k]].color);
      n.innerHTML = `<b>${esc(this.names[k])}</b><small>#${this.o.seats[k]?.id ?? (k ? 2 : 1)}</small>`;
      r.appendChild(n);
    }

    // one gear in the corner for the menu, nothing else over the table
    const gear = document.createElement("button");
    gear.className = "zkl-gear";
    gear.setAttribute("aria-label", T("Menu", "菜单"));
    gear.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${GEAR}"/></svg>`;
    gear.addEventListener("click", () => this.menu());
    r.appendChild(gear);
    // ZEC: yours by the hand, bottom right; the rival's top right
    this.manaWas = [
      [-1, -1],
      [-1, -1],
    ];
    for (const s of [0, 1] as Side[]) {
      const m = div(`zkl-mana ${s === this.me ? "me" : "foe"}`);
      m.innerHTML = `<b></b><span></span>`;
      r.appendChild(m);
      this.manaEl[s] = m;
      this.setMana(s, this.g.s[s].mana, this.g.s[s].maxMana);
    }

    r.addEventListener("pointerdown", this.onDown);
    r.addEventListener("pointermove", this.onMove);
    r.addEventListener("pointerup", this.onUp);
    r.addEventListener("pointerover", this.onOver);
    r.addEventListener("pointerleave", () => this.preview(null));
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.root);
    this.layout();
  }

  // ---- layout -----------------------------------------------------------------------------------------

  private layout() {
    const W = this.root.clientWidth || window.innerWidth;
    const H = this.root.clientHeight || window.innerHeight;
    if (!this.g || !W || !H || !this.view) return;
    const portrait = H > W * 1.1;
    this.view.resize(W, H);
    // Hearthstone's hand: smallish cards on a fan, three quarters showing (cost, art, name, the top of
    // the text); the one you point at rises whole
    const cw = Math.round(Math.max(84, Math.min(portrait ? W * 0.24 : W * 0.098, H * (portrait ? 0.16 : 0.19), 176)));
    this.L = { W, H, portrait, cw, cx: W / 2 - (portrait ? 0 : W * 0.01), handY: H - cw * 1.4 * (portrait ? 0.6 : 0.7) };
    this.root.classList.toggle("portrait", portrait);
    if (portrait && !this.root.querySelector(".zkl-turnhint") && !this.turnHintShown) {
      this.turnHintShown = true;
      const h = div("zkl-turnhint");
      h.textContent = T("↻ Turn your phone sideways for the whole table", "↻ 横屏可看到完整牌桌");
      h.addEventListener("click", () => h.remove());
      this.root.appendChild(h);
      this.later(() => h.remove(), 6000);
    }
    // (above the near-left corner piece: the history ends where the arena's star prop begins)
    this.logEl.style.top = `${H * 0.11}px`;
    this.logEl.style.height = `${H * 0.56}px`;
    this.layoutHand();
  }

  /** A card's place on the fan: along an arc whose centre sits below the screen. */
  private handXY(i: number, n: number): { x: number; y: number; r: number } {
    const L = this.L;
    const cw = L.cw;
    const spread = Math.min(cw * 0.86, (L.W * (L.portrait ? 0.9 : 0.38)) / Math.max(1, n));
    const off = i - (n - 1) / 2;
    const step = Math.min(5.2, 26 / Math.max(1, n)) * (L.portrait ? 0.7 : 1);
    const a = (off * step * Math.PI) / 180;
    const R = cw * 7;
    return { x: L.cx + off * spread - cw / 2, y: L.handY + R * (1 - Math.cos(a)), r: off * step };
  }
  private layoutHand() {
    if (!this.L) return;
    const L = this.L;
    // queued cards wait where they were dropped: the fan closes up without them
    const order = this.queue.length ? this.handOrder.filter((u) => !this.isQueued(u)) : this.handOrder;
    const n = order.length;
    const hi = this.drag || this.tgt ? -1 : order.indexOf(this.hoverUid || this.picked);
    order.forEach((uid, i) => {
      const el = this.hand.get(uid);
      if (!el || el === this.drag?.el || el === this.pending?.el || uid === this.showing) return;
      el.style.setProperty("--w", `${L.cw}px`);
      const p = this.handXY(i, n);
      // the cards beside the one you point at step aside, so it can be read and grabbed
      if (hi >= 0 && i !== hi) p.x += (i < hi ? -1 : 1) * L.cw * (n > 6 ? 0.34 : 0.26) * (Math.abs(i - hi) === 1 ? 1 : 0.7);
      const hover = this.hoverUid === uid && !this.drag && !this.tgt;
      const pick = this.picked === uid;
      if (hover || pick) {
        // straight up, whole, its foot on the screen's edge
        const sc = L.portrait ? 1.3 : 1.62;
        const half = (L.cw * (sc - 1)) / 2;
        const x = Math.max(8 + half, Math.min(L.W - 8 - L.cw - half, p.x));
        el.style.transform = `translate(${x}px, ${L.H - 6 - L.cw * 1.4}px) scale(${sc})`;
        el.style.zIndex = "20";
        el.classList.add("up");
      } else {
        el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`;
        el.style.zIndex = String(i + 1);
        el.classList.remove("up");
      }
    });
  }

  private manaEl: HTMLDivElement[] = [];
  private manaWas: [number, number][] = [
    [-1, -1],
    [-1, -1],
  ];
  /** ZEC as Hearthstone shows mana: the count, then one crystal per ZEC of the turn (lit, spent, borrowed). */
  private setMana(s: Side, mana: number, max: number) {
    const el = this.manaEl[s];
    if (!el) return;
    const [m0, x0] = this.manaWas[s];
    if (m0 === mana && x0 === max) return;
    this.manaWas[s] = [mana, max];
    el.querySelector("b")!.innerHTML = `${mana}<small>/${max}</small>`;
    const row = el.querySelector("span")!;
    const n = Math.min(10, Math.max(max, mana));
    while (row.childElementCount < n) row.appendChild(document.createElement("i"));
    while (row.childElementCount > n) row.lastElementChild!.remove();
    [...row.children].forEach((c, i) => {
      const was = c.className;
      const k = i < mana ? (i >= max ? "extra" : "on") : "off";
      if (was !== k) {
        c.className = k;
        if (k !== "off" && was === "off") c.animate([{ transform: "scale(1.5)", filter: "brightness(2)" }, { transform: "scale(1)", filter: "none" }], { duration: 320, easing: "cubic-bezier(.2,.9,.3,1.2)" });
      }
    });
    el.classList.toggle("spent", mana === 0 && max > 0);
    el.classList.toggle("none", max === 0 && mana === 0);
  }

  // ---- reconcile the view with the state -------------------------------------------------------------

  private syncAll(dealOnly = false) {
    const g = this.g;
    this.view.syncRows([g.s[0].board, g.s[1].board]);
    for (const s of [0, 1] as Side[]) {
      const S = g.s[s];
      for (const m of S.board) this.snaps.set(m.uid, { ...m });
      this.view.setHero(s, S.hero);
      this.setMana(s, S.mana, S.maxMana);
      this.view.setDeck(s, S.deck.length);
      this.secretsN[s] = S.secrets.length;
      this.view.setSecrets(s, S.secrets.length);
    }
    this.backsN = g.s[this.foe].hand.length;
    this.view.setBacks(this.backsN);
    // my hand
    const mine = g.s[this.me].hand;
    const ids = mine.map((h) => h.uid);
    for (const [uid, el] of this.hand) if (!ids.includes(uid) && el !== this.pending?.el && !this.isQueued(uid)) el.remove(), this.hand.delete(uid);
    // (and anything left in the hand layer that isn't one of them: a card must never sit there untracked)
    const kept = new Set(this.hand.values());
    for (const el of [...this.handLayer.querySelectorAll<HTMLElement>("[data-hand]")]) if (!kept.has(el as HTMLDivElement)) el.remove();
    for (const h of mine) {
      let el = this.hand.get(h.uid);
      if (!el) {
        el = cardEl(h.id);
        el.dataset.hand = String(h.uid);
        this.handLayer.appendChild(el);
        this.hand.set(h.uid, el);
      }
      if (!dealOnly) setCardCost(el, costOf(g, this.me, h));
    }
    this.handOrder = ids;
    this.layoutHand();
    this.hints();
    this.music();
  }

  /** The music follows the danger: the tense loop once a hero is at 10 Health or less. */
  private music() {
    const g = this.g;
    if (g.phase !== "play") return;
    const low = Math.min(g.s[0].hero.hp + g.s[0].hero.armor, g.s[1].hero.hp + g.s[1].hero.armor) <= 10;
    if (low !== this.tension) {
      this.tension = low;
      this.snd.music(low ? "tension" : "duel");
    }
  }

  /** Light what can be done now (green), the END TURN plate's state. */
  private hints() {
    const g = this.g;
    const mine = this.myTurn();
    let any = false;
    for (const [uid, el] of this.hand) {
      const h = g.s[this.me].hand.find((x) => x.uid === uid);
      const ok = !!h && mine && this.playable(h);
      el.classList.toggle("can-act", ok);
      el.classList.toggle("picked", this.picked === uid);
      any ||= ok;
    }
    const tg = this.tgt;
    for (const s of [0, 1] as Side[])
      for (const m of g.s[s].board) {
        if (tg && (tg.valid.includes(m.uid) || tg.uid === m.uid)) continue;
        const ok = s === this.me && mine && canAttack(g, this.me, m.uid) && attackTargets(g, this.me, m.uid).length > 0;
        this.view.light(m.uid, ok ? "act" : "");
        this.view.sleep(m.uid, s === this.me && m.sick && g.turn === this.me && !ok);
        any ||= ok;
      }
    const hero = mine && canAttack(g, this.me, HERO_UID[this.me]) && attackTargets(g, this.me, HERO_UID[this.me]).length > 0;
    if (!tg || !tg.valid.includes(HERO_UID[this.me])) this.view.light(HERO_UID[this.me], hero ? "act" : "");
    if (!tg) this.view.light(HERO_UID[this.foe], "");
    const pw = mine && canPower(g, this.me);
    this.view.lightPower(this.me, pw);
    any ||= hero || pw;
    if (g.phase === "over") this.view.setEnd("over", T("GAME OVER", "对局结束"));
    else if (g.turn === this.me && !this.auto) this.view.setEnd(any ? "ready" : "done", T("END TURN", "结束回合"));
    else this.view.setEnd("wait", T("RIVAL'S TURN", "对手回合"));
  }

  private myTurn() {
    return !!this.g && this.g.phase === "play" && this.g.turn === this.me && !this.auto && !this.g.pending;
  }

  private ropeT: ReturnType<typeof setTimeout>[] = [];
  private ropeEl: HTMLDivElement | null = null;
  /** Your turn's clock: after 60 s a rope burns along the ledger line; at 75 s the turn ends. */
  private rope(on: boolean) {
    for (const t of this.ropeT) clearTimeout(t);
    this.ropeT = [];
    this.ropeEl?.remove();
    this.ropeEl = null;
    if (!on || this.fast) return;
    const show = setTimeout(() => {
      if (this.closed || this.g.turn !== this.me) return;
      const y = (this.view.laneY(0) + this.view.laneY(1)) / 2;
      const r = div("zkl-rope");
      r.innerHTML = `<i></i><b></b>`;
      r.style.top = `${y - 6}px`;
      this.fxLayer.appendChild(r);
      this.ropeEl = r;
      void r.offsetWidth;
      r.classList.add("burn");
    }, 60_000);
    const end = setTimeout(() => this.ropeOut(), 75_000);
    this.ropeT.push(show, end);
  }
  private ropeOut() {
    if (this.closed || this.g.phase !== "play" || this.g.turn !== this.me) return;
    if (this.busy || this.overlay) return void this.ropeT.push(setTimeout(() => this.ropeOut(), 400));
    this.cancel();
    this.endTurn();
  }

  private endTurn() {
    if (!this.myTurn()) return;
    this.rope(false);
    this.view.pressEnd();
    // (while a move plays out, the end of the turn waits behind it)
    void this.act({ k: "end" });
  }

  // ---- playing moves ----------------------------------------------------------------------------------

  /** Your moves made while the last one still plays out: they go next, in order. */
  private queue: Action[] = [];
  private isQueued(uid: number) {
    return this.queue.some((a) => a.k === "play" && a.uid === uid);
  }
  /** ZEC and board room already promised to queued moves. */
  private reserved() {
    let zec = 0,
      room = 0;
    for (const a of this.queue)
      if (a.k === "play") {
        const h = this.g.s[this.me].hand.find((x) => x.uid === a.uid);
        if (!h) continue;
        zec += costOf(this.g, this.me, h);
        if (card(h.id).type === "minion") room++;
      }
    return { zec, room };
  }
  /** Can this hand card be played, counting what's queued? */
  private playable(h: HandCard) {
    const g = this.g;
    if (this.isQueued(h.uid) || !canPlay(g, this.me, h)) return false;
    if (!this.queue.length) return true;
    const r = this.reserved();
    if (costOf(g, this.me, h) > g.s[this.me].mana - r.zec) return false;
    if (card(h.id).type === "minion" && g.s[this.me].board.length + r.room >= 7) return false;
    return true;
  }
  private async act(a: Action, side: Side = this.me, fromQueue = false) {
    if (this.closed) return;
    if (this.busy) {
      if (side === this.me && !(a.k === "end" && this.queue.some((q) => q.k === "end"))) {
        this.queue.push(a);
        // the card waits where it was dropped, faded, out of reach
        if (a.k === "play") {
          const el = this.hand.get(a.uid);
          if (el) el.classList.add("queued");
          this.picked = 0;
        }
        this.hints();
      }
      return;
    }
    this.busy = true;
    // a move of yours made now takes the place of what you were aiming; one coming off the queue doesn't
    // touch what you're doing meanwhile
    if (!fromQueue) this.cancel(true, true);
    this.hints();
    const g = this.g;
    g.ev = [];
    const ok = apply(g, side, a);
    const evs = g.ev.slice();
    g.ev = [];
    if (!ok) {
      if (side === this.me) this.snd.error();
      if (a.k === "play") this.hand.get(a.uid)?.classList.remove("queued");
      this.busy = false;
      this.syncAll();
      if (this.queue.length && g.turn === this.me && g.phase === "play") return void this.act(this.queue.shift()!, this.me, true);
      return;
    }
    if (a.k === "end" && side === this.me) this.snd.end();
    await this.play(evs);
    if (this.closed) return;
    if (!this.queue.length && !this.drag) this.view.ghost(null);
    this.syncAll();
    this.busy = false;
    if (this.queue.length && g.turn === this.me && g.phase === "play" && !g.pending) {
      const q = this.queue.shift()!;
      return void this.act(q, this.me, true);
    }
    this.dropQueue();
    this.hints();
    if (g.pending && g.pending.side === this.me && !this.auto) return this.discoverScreen();
    if (g.phase === "over") return void this.finish();
    if (g.turn === this.foe || this.auto) void this.loop();
  }

  private drawShown = false;
  /** The card being shown large after its draw (the fan leaves it alone meanwhile). */
  private showing = 0;
  private thinkEl: HTMLDivElement | null = null;
  /** Hearthstone's tell: "..." over the rival's portrait while it decides (from its third move of a turn
   * on, so short turns stay clean). */
  private thinkN = 0;
  private thinking(on: boolean) {
    if (!on) {
      this.thinkEl?.remove();
      this.thinkEl = null;
      return;
    }
    if (this.fast || this.auto || this.thinkEl || ++this.thinkN % 2) return;
    const p = this.view.screenOf("hero", this.foe);
    const px = this.view.tokenPx();
    const t = div("zkl-think");
    t.innerHTML = "<i></i><i></i><i></i>";
    t.style.left = `${p.x + px * 0.9}px`;
    t.style.top = `${p.y - px * 0.45}px`;
    this.fxLayer.appendChild(t);
    this.thinkEl = t;
  }

  /** What's left queued when the turn has moved on: the cards go back to the hand. */
  private dropQueue() {
    for (const a of this.queue) if (a.k === "play") this.hand.get(a.uid)?.classList.remove("queued");
    this.queue = [];
    this.layoutHand();
  }

  private looping = false;
  private async loop() {
    if (this.looping) return;
    this.looping = true;
    try {
      while (!this.closed && this.g.phase === "play" && (this.g.turn === this.foe || this.auto || (this.g.pending && this.g.pending.side === this.foe))) {
        const side = this.g.turn;
        if (side === this.foe) this.thinking(true);
        await this.wait(this.g.s[side].board.length + this.g.s[side].hand.length > 6 ? 650 : 520);
        if (this.closed) return;
        const a = decide(this.g, side, this.aiOpts(side));
        this.thinking(false);
        if (side === this.foe) await this.foeAim(a);
        this.busy = false;
        await this.act(a, side);
        if (a.k === "end") await this.wait(250);
      }
    } finally {
      this.looping = false;
    }
    if (!this.closed && this.g.phase === "over") void this.finish();
  }

  /** The rival's arrow, drawn from what it uses to what it aims at, before it acts (Hearthstone's tell). */
  private async foeAim(a: Action) {
    if (this.fast || this.closed) return;
    let from: XY | null = null,
      to: XY | null = null;
    if (a.k === "attack") {
      from = this.pt(a.from);
      to = this.pt(a.to);
    } else if (a.k === "power" && a.target != null) {
      from = this.view.screenOf("power", this.foe);
      to = this.pt(a.target);
    } else if (a.k === "play" && a.target != null) {
      from = this.pt(HERO_UID[this.foe]);
      to = this.pt(a.target);
    }
    if (!from || !to) return;
    const tgtUid = a.k === "attack" ? a.to : (a as { target?: number | null }).target ?? 0;
    this.arrow.style.display = "";
    this.arrow.classList.add("foe");
    if (tgtUid) this.view.light(tgtUid, "hot");
    const f = from,
      t = to;
    await new Promise<void>((done) => {
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 380);
        const e = 1 - (1 - k) ** 3;
        this.drawArrow(f, { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e }, true);
        if (k < 1 && !this.closed) requestAnimationFrame(step);
        else done();
      };
      step();
    });
    await this.wait(260);
    this.arrow.style.display = "none";
    this.arrow.classList.remove("foe");
    if (tgtUid) this.view.light(tgtUid, "");
  }

  // ---- the events, played back ------------------------------------------------------------------------

  private pt(uid: number): XY {
    return this.view.screen(uid);
  }

  private async play(evs: Ev[]) {
    for (const e of evs) {
      if (this.closed) return;
      await this.one(e);
    }
  }

  private snap(uid: number) {
    return this.snaps.get(uid) ?? minion(this.g, uid);
  }

  private async one(e: Ev) {
    const g = this.g;
    const v = this.view;
    switch (e.t) {
      case "turn": {
        this.rope(e.side === this.me && !this.auto);
        this.syncAll();
        if (!this.said.has("greet")) {
          this.said.add("greet");
          this.later(() => this.speak(this.foe, "greet"), 600);
        }
        if (e.side === this.me && !this.auto) {
          this.banner(T("YOUR TURN", "你的回合"), T(`Turn ${Math.ceil(e.n / 2)}`, `第 ${Math.ceil(e.n / 2)} 回合`));
          this.snd.turn();
          await this.wait(380);
        } else await this.wait(200);
        return;
      }
      case "mana":
        this.setMana(e.side, e.mana, e.max);
        return;
      case "draw":
      case "give": {
        this.snd.draw();
        if (e.side === this.me) {
          // the state already holds the card, so a sync may have made its element: fly that one in
          let el = this.hand.get(e.uid);
          if (!el) {
            el = cardEl(e.id);
            el.dataset.hand = String(e.uid);
            this.handLayer.appendChild(el);
            this.hand.set(e.uid, el);
          }
          if (!this.handOrder.includes(e.uid)) this.handOrder.push(e.uid);
          if (this.drag?.uid === e.uid) return;
          el.style.setProperty("--w", `${this.L.cw}px`);
          const from = e.t === "draw" ? v.screenOf("deck", e.side) : { x: this.L.cx, y: this.L.H * 0.5 };
          el.style.transition = "none";
          el.style.transform = `translate(${from.x - this.L.cw / 2}px, ${from.y - this.L.cw * 0.7}px) scale(0.3) rotate(-20deg)`;
          // your draw, Hearthstone's: the card comes off the deck, shows itself large beside it, then joins
          // the hand (quick when several come at once, skipped in the mulligan's deal)
          if (e.t === "draw" && !this.fast && this.g.phase === "play" && !this.drawShown) {
            this.drawShown = true;
            void el.offsetWidth;
            const cw = this.L.cw;
            const sc = Math.min(1.75, (this.L.H * 0.4) / (cw * 1.4));
            // (its middle beside the deck, clear of the turn banner; the card scales from its foot)
            const cx = Math.min(this.L.W - (cw * sc) / 2 - 24, from.x - 10);
            const cy = this.L.H * 0.5;
            el.style.transition = "transform 0.32s cubic-bezier(.2,.9,.3,1.1)";
            el.style.transform = `translate(${cx - cw / 2}px, ${cy + (cw * 1.4 * sc) / 2 - cw * 1.4}px) scale(${sc})`;
            el.style.zIndex = "40";
            // (it can be grabbed while it shows: a press ends the show and the card is yours to move)
            this.showing = e.uid;
            await this.wait(this.queue.length ? 380 : 680);
            const held = this.drag?.uid === e.uid || this.picked === e.uid;
            if (this.showing === e.uid) this.showing = 0;
            this.later(() => (this.drawShown = false), 40);
            if (held) {
              await this.wait(120);
              return;
            }
            el.style.zIndex = "";
            el.style.transition = "transform 0.34s cubic-bezier(.4,0,.2,1)";
          }
          void el.offsetWidth;
          el.style.transition = "";
          this.layoutHand();
        } else {
          this.backsN++;
          v.setBacks(this.backsN);
        }
        await this.wait(280);
        return;
      }
      case "burn": {
        const el = cardEl(e.id);
        el.style.setProperty("--w", `${Math.min(220, this.L.H * 0.28)}px`);
        const p = v.screenOf("deck", e.side);
        this.showAt(el, Math.min(this.L.W - 240, p.x - 280), p.y - 150);
        this.floatText(p.x - 160, p.y, T("Hand full", "手牌已满"), "buff");
        await this.wait(900);
        el.animate([{ opacity: 1, filter: "none" }, { opacity: 0, filter: "sepia(1) brightness(2) blur(4px)" }], { duration: 500, fill: "forwards" });
        this.later(() => el.remove(), 520);
        return;
      }
      case "fatigue": {
        const p = this.pt(HERO_UID[e.side]);
        this.floatText(p.x, p.y - 60, T(`Empty deck: ${e.n}`, `牌库已空：${e.n}`), "buff");
        await this.wait(400);
        return;
      }
      case "mull": {
        if (e.side !== this.me) return;
        for (const uid of e.out) {
          const el = this.hand.get(uid);
          if (!el) continue;
          const to = v.screenOf("deck", this.me);
          el.style.transform = `translate(${to.x - this.L.cw / 2}px, ${to.y - this.L.cw * 0.7}px) scale(0.3)`;
          this.later(() => el.remove(), 300);
          this.hand.delete(uid);
          this.handOrder = this.handOrder.filter((x) => x !== uid);
        }
        if (e.out.length) await this.wait(300);
        for (const c of e.in) await this.one({ t: "draw", side: this.me, uid: c.uid, id: c.id });
        return;
      }
      case "play": {
        const d = card(e.id);
        this.log(e.side, e.id);
        if (e.side === this.me) {
          const el = this.hand.get(e.uid) ?? this.pending?.el ?? null;
          this.hand.delete(e.uid);
          this.handOrder = this.handOrder.filter((x) => x !== e.uid);
          if (this.pending?.uid === e.uid) this.pending = null;
          this.snd.play();
          if (el) {
            if (d.type === "minion") {
              el.style.transition = "transform 0.16s ease-in, opacity 0.16s";
              el.style.opacity = "0";
              this.later(() => el.remove(), 200);
            } else {
              // the spell card rises to the middle, lights up, and burns away into its effect
              el.style.transition = "transform 0.28s cubic-bezier(.2,.9,.3,1.1)";
              el.style.zIndex = "40";
              const W = this.L.cw * 1.35;
              el.style.transform = `translate(${this.L.cx - W / 2}px, ${this.L.H * 0.4 - W * 0.7}px) scale(1.35)`;
              await this.wait(420);
              await this.dissolve(el);
            }
          }
          this.layoutHand();
          if (d.type !== "minion") this.snd.spell();
        } else {
          this.backsN = Math.max(0, this.backsN - 1);
          v.setBacks(this.backsN);
          if (d.type === "secret") {
            this.snd.secret();
            await this.wait(300);
            return;
          }
          if (d.rarity === "legendary") this.later(() => this.speak(this.foe, "legend"), 500);
          const el = cardEl(e.id, { prover: d.type === "spell" ? prover(g, e.side) : 0 });
          const W = Math.min(250, this.L.H * 0.34);
          el.style.setProperty("--w", `${W}px`);
          const x = this.L.portrait ? this.L.cx - W / 2 : this.L.W * 0.17 - W / 2;
          const y = this.L.H * 0.44 - W * 0.7;
          el.classList.add("zkl-show", "zkl-flipin");
          this.fxLayer.appendChild(el);
          this.snd.play();
          await el
            .animate(
              [
                { transform: `perspective(1100px) translate(${this.L.cx - W / 2}px, ${-W * 1.2}px) scale(0.35) rotateY(88deg) rotateZ(8deg)`, opacity: 0.4 },
                { transform: `perspective(1100px) translate(${(x + this.L.cx - W / 2) / 2}px, ${y - 40}px) scale(0.85) rotateY(50deg) rotateZ(-4deg)`, opacity: 1, offset: 0.5 },
                { transform: `perspective(1100px) translate(${x}px, ${y}px) scale(1) rotateY(0deg)`, opacity: 1 },
              ],
              { duration: this.fast ? 1 : 520, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" },
            )
            .finished.catch(() => {});
          await this.wait(d.type === "minion" ? 800 : 950);
          if (d.type === "minion") {
            // into the slot it will take
            const idx = Math.max(0, g.s[this.foe].board.findIndex((m) => m.uid === e.uid));
            const sp = v.slotPoint(this.foe, idx, Math.max(1, g.s[this.foe].board.length));
            await el
              .animate([{ transform: `perspective(1100px) translate(${x}px, ${y}px) scale(1)`, opacity: 1 }, { transform: `perspective(1100px) translate(${sp.x - W / 2}px, ${sp.y - W * 0.7}px) scale(0.3)`, opacity: 0 }], { duration: this.fast ? 1 : 260, easing: "ease-in", fill: "forwards" })
              .finished.catch(() => {});
            el.remove();
          } else {
            this.snd.spell();
            await this.dissolve(el);
          }
        }
        return;
      }
      case "summon": {
        this.snaps.set(e.m.uid, { ...e.m });
        const big = card(e.m.id).rarity === "legendary";
        this.later(() => this.snd.land(big), big ? 420 : 260);
        await v.summon(e.m, e.pos);
        return;
      }
      case "attack": {
        this.snd.attack();
        const am = isHero(e.from) ? null : this.snap(e.from);
        const hs = g.s[e.from === 1 ? 0 : 1].hero;
        const power = am ? am.atk + am.aura : hs.tmpAtk + (hs.weapon?.atk ?? 2);
        this.logAttack(e.from, am);
        await v.attack(e.from, e.to, power);
        return;
      }
      case "dmg": {
        const p = this.pt(e.uid);
        this.floatText(p.x, p.y, `-${e.n}`, "dmg");
        v.hurt(e.uid, e.n);
        if (isHero(e.uid)) {
          this.snd.heroHit();
          const s: Side = e.uid === 1 ? 0 : 1;
          v.setHero(s, { ...g.s[s].hero, hp: e.hp, armor: e.armor });
          if (e.uid === HERO_UID[this.foe]) {
            if (e.hp > 0 && e.hp <= 10 && !this.said.has("low")) {
              this.said.add("low");
              this.later(() => this.speak(this.foe, "low"), 700);
            } else if (e.n >= 7 && e.hp > 0) this.later(() => this.speak(this.foe, "big"), 600);
          }
        } else {
          this.snd.hit(e.n);
          const m = this.snap(e.uid);
          if (m) {
            m.hp = e.hp;
            v.setMinion(m);
          }
        }
        await this.wait(170);
        return;
      }
      case "halo": {
        const m = this.snap(e.uid);
        if (m) {
          m.kw &= ~KW.HALO;
          v.setMinion(m);
        }
        v.haloPop(e.uid);
        this.snd.halo();
        await this.wait(260);
        return;
      }
      case "heal": {
        const p = this.pt(e.uid);
        this.floatText(p.x, p.y, `+${e.n}`, "heal");
        this.snd.heal();
        v.heal(e.uid);
        if (isHero(e.uid)) {
          const s: Side = e.uid === 1 ? 0 : 1;
          v.setHero(s, { ...g.s[s].hero, hp: e.hp });
        } else {
          const m = this.snap(e.uid);
          if (m) {
            m.hp = e.hp;
            v.setMinion(m);
          }
        }
        await this.wait(220);
        return;
      }
      case "armor": {
        const p = this.pt(HERO_UID[e.side]);
        this.floatText(p.x, p.y, `+${e.n}`, "buff");
        v.setHero(e.side, { ...g.s[e.side].hero, armor: e.armor });
        v.buff(HERO_UID[e.side]);
        this.snd.buff();
        await this.wait(220);
        return;
      }
      case "die": {
        this.snd.die();
        await v.die(e.uid);
        this.snaps.delete(e.uid);
        await this.wait(80);
        return;
      }
      case "stats": {
        const was = this.snap(e.m.uid);
        const before = was ? { atk: was.atk + was.aura, frozen: was.frozen } : null;
        this.snaps.set(e.m.uid, { ...e.m });
        v.setMinion(e.m);
        if (before && before.atk < e.m.atk + e.m.aura) v.buff(e.m.uid);
        if (before && !before.frozen && e.m.frozen) {
          v.frost(e.m.uid);
          this.snd.freeze();
        }
        return;
      }
      case "hero":
        v.setHero(e.side, e.hero);
        return;
      case "fx":
        await this.fx(e.kind, e.from, e.to);
        return;
      case "secret": {
        this.secretsN[e.side]++;
        v.setSecrets(e.side, this.secretsN[e.side]);
        this.snd.secret();
        await this.wait(300);
        return;
      }
      case "reveal": {
        this.snd.reveal();
        this.secretsN[e.side] = Math.max(0, this.secretsN[e.side] - 1);
        v.setSecrets(e.side, this.secretsN[e.side]);
        const el = cardEl(e.id);
        const W = Math.min(250, this.L.H * 0.34);
        el.style.setProperty("--w", `${W}px`);
        this.showAt(el, this.L.cx - W / 2, this.L.H * 0.42 - W * 0.7);
        this.banner(T("SECRET!", "奥秘！"), cardName(card(e.id)), true);
        await this.wait(1150);
        el.style.opacity = "0";
        this.later(() => el.remove(), 350);
        return;
      }
      case "counter": {
        this.banner(T("COUNTERED", "被反制"), cardName(card(e.id)), true);
        await this.wait(700);
        return;
      }
      case "bounce": {
        await v.bounce(e.uid);
        this.snaps.delete(e.uid);
        await this.one({ t: "give", side: e.side, uid: e.to, id: e.id });
        return;
      }
      case "steal": {
        v.steal(e.uid, e.side, [g.s[0].board, g.s[1].board]);
        await this.wait(450);
        return;
      }
      case "power": {
        v.setPower(e.side, true);
        v.powerUse(e.side);
        this.logPower(e.side);
        this.snd.coin();
        await this.wait(380);
        return;
      }
      case "weapon":
        v.setWeapon(e.side, e.w);
        if (e.w) this.snd.land(false);
        return;
      case "trigger":
        v.glint(e.uid);
        await this.wait(200);
        return;
      case "discover":
      case "over":
        return;
    }
  }

  private async fx(kind: string, from: number, to: number[]) {
    if (kind === "frost" || kind === "frostnova" || kind === "trap") this.snd.freeze();
    else if (kind === "buff") this.snd.buff();
    else if (kind === "halo" || kind === "shield" || kind === "turnstile") this.snd.halo();
    else if (kind === "drain") this.snd.heal();
    else this.snd.bolt();
    await this.view.cast(kind, from, to);
  }

  /** A card burns away: it flares, its edges go, it's gone. */
  private async dissolve(el: HTMLElement) {
    await el
      .animate(
        [
          { filter: "brightness(1)", opacity: 1, scale: "1" },
          { filter: "brightness(2.2) saturate(1.4)", opacity: 1, scale: "1.06", offset: 0.35 },
          { filter: "brightness(3) blur(6px)", opacity: 0, scale: "1.18" },
        ],
        { duration: this.fast ? 1 : 420, easing: "ease-in", fill: "forwards" },
      )
      .finished.catch(() => {});
    el.remove();
  }

  // ---- DOM effects --------------------------------------------------------------------------------------

  private showAt(el: HTMLElement, x: number, y: number) {
    el.classList.add("zkl-show");
    el.style.transform = `translate(${x}px, ${y + 30}px) scale(0.7)`;
    el.style.opacity = "0";
    this.fxLayer.appendChild(el);
    void el.offsetWidth;
    el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
    el.style.opacity = "1";
  }

  private floatText(x: number, y: number, s: string, cls: string) {
    if (this.fast) return;
    const f = div(`zkl-float ${cls}`);
    f.innerHTML = `<span>${esc(s)}</span>`;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    this.fxLayer.appendChild(f);
    this.later(() => f.remove(), 1150);
  }

  private banner(big: string, small: string, quick = false) {
    if (this.fast) return;
    const b = div("zkl-banner");
    b.innerHTML = `${esc(big)}${small ? `<small>${esc(small)}</small>` : ""}`;
    if (quick) {
      b.style.animationDuration = "1s";
      b.classList.add("alt");
    }
    this.fxLayer.appendChild(b);
    this.later(() => b.remove(), 1400);
  }

  // ---- the log of plays -------------------------------------------------------------------------------

  private log(side: Side, id: string) {
    const d = card(id);
    const i = div(`zkl-log-i ${side === this.me ? "me" : "foe"}`);
    i.style.setProperty("--fc", FACTION_INFO[d.faction].color);
    if (side === this.foe && d.type === "secret") i.appendChild(iconCanvas("q", "#f4b728"));
    else {
      i.appendChild(snarkCanvas(d.art));
      i.dataset.card = id;
    }
    this.logEl.appendChild(i);
    while (this.logEl.childElementCount > Math.max(4, Math.min(8, Math.floor((this.L.H * 0.54) / 58)))) this.logEl.firstElementChild?.remove();
  }
  /** An attack in the history, Hearthstone's: the attacker's face with a sword across its corner. */
  private logAttack(from: number, m: Minion | null) {
    const side: Side = m ? m.side : from === HERO_UID[0] ? 0 : 1;
    const i = div(`zkl-log-i atk ${side === this.me ? "me" : "foe"}`);
    if (m) {
      const d = card(m.id);
      i.style.setProperty("--fc", FACTION_INFO[d.faction].color);
      i.appendChild(snarkCanvas(d.art));
      i.dataset.card = m.id;
    } else {
      i.style.setProperty("--fc", FACTION_INFO[this.g.s[side].hero.faction].color);
      i.appendChild(snarkCanvas(this.o.seats[side]?.id ?? side + 1));
    }
    this.logEl.appendChild(i);
    while (this.logEl.childElementCount > Math.max(4, Math.min(8, Math.floor((this.L.H * 0.54) / 58)))) this.logEl.firstElementChild?.remove();
  }
  private logPower(side: Side) {
    const f = this.g.s[side].hero.faction;
    const i = div(`zkl-log-i ${side === this.me ? "me" : "foe"}`);
    i.style.setProperty("--fc", FACTION_INFO[f].color);
    const ic = iconCanvas({ transparent: "wave", sapling: "leaf", sprout: "door", orchard: "halo" }[f as Pool] ?? "q", "#fff");
    ic.style.cssText = "position:absolute;inset:10px;width:24px;height:24px";
    i.appendChild(ic);
    i.dataset.power = f;
    this.logEl.appendChild(i);
  }

  // ---- previews ----------------------------------------------------------------------------------------

  private preview(what: { id?: string; m?: Minion; power?: Pool } | null, at?: XY) {
    const p = this.previewEl;
    if (!p) return;
    if (!what || this.drag || this.tgt) {
      p.style.display = "none";
      return;
    }
    let el: HTMLDivElement;
    let ids: string[] = [];
    if (what.power) el = powerCardEl(what.power);
    else {
      const id = what.m?.id ?? what.id!;
      const d = card(id);
      el = cardEl(id, what.m ? { atk: what.m.atk + what.m.aura, hp: what.m.hp } : { prover: d.type === "spell" ? prover(this.g, this.me) : 0 });
      ids = keywordsOf(d);
      if (what.m) {
        const k = what.m.kw;
        for (const [bit, name] of [[1, "Guard"], [2, "Shielded"], [4, "Halo"], [32, "Double-spend"], [64, "Dust"], [128, "Drain"], [256, "Reorg"], [512, "Private"]] as [number, string][])
          if (k & bit && !ids.includes(name)) ids.push(name);
        if (what.m.frozen) ids.push("Timelock");
        if (what.m.redacted) ids.push("Redact");
      }
    }
    const W = Math.min(250, this.L.H * 0.36);
    el.style.setProperty("--w", `${W}px`);
    const notes = div("zkl-notes");
    for (const k of ids.slice(0, 4)) {
      const n = div("zkl-note");
      n.innerHTML = `<b>${kwLabel(k)}</b>${esc(T(KW_HELP[k][0], KW_HELP[k][1]))}`;
      notes.appendChild(n);
    }
    p.replaceChildren(el, notes);
    p.style.display = "flex";
    const leftSide = at && at.x > this.L.cx;
    const x = this.L.portrait ? 8 : leftSide ? 70 : this.L.W - W - 216;
    const y = Math.max(8, Math.min(this.L.H - W * 1.42 - 8, (at?.y ?? this.L.H / 2) - W * 0.7));
    p.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Over DOM things (hand, log): their preview. The 3D board is handled in onMove. */
  private onOver = (e: PointerEvent) => {
    if (!this.g || this.overlay) return;
    const t = e.target as HTMLElement;
    const hc = t.closest<HTMLElement>("[data-hand]");
    const uid = hc ? Number(hc.dataset.hand) : 0;
    if (uid !== this.hoverUid && e.pointerType === "mouse") {
      this.hoverUid = uid;
      if (uid) this.snd.hover();
      this.layoutHand();
      this.handNotes(uid);
    }
    const lg = t.closest<HTMLElement>(".zkl-log-i");
    if (lg?.dataset.card) return this.preview({ id: lg.dataset.card }, { x: 80, y: e.clientY });
    if (lg?.dataset.power) return this.preview({ power: lg.dataset.power as Pool }, { x: 80, y: e.clientY });
  };

  private notesEl: HTMLDivElement | null = null;
  /** The keywords of the hand card you hover, explained beside it. */
  private handNotes(uid: number) {
    this.notesEl?.remove();
    this.notesEl = null;
    if (!uid || this.drag || this.tgt) return;
    const h = this.g.s[this.me].hand.find((x) => x.uid === uid);
    const el = this.hand.get(uid);
    if (!h || !el) return;
    const ids = keywordsOf(card(h.id));
    if (!ids.length) return;
    const notes = div("zkl-notes zkl-handnotes");
    for (const k of ids.slice(0, 3)) {
      const n = div("zkl-note");
      n.innerHTML = `<b>${kwLabel(k)}</b>${esc(T(KW_HELP[k][0], KW_HELP[k][1]))}`;
      notes.appendChild(n);
    }
    this.fxLayer.appendChild(notes);
    this.notesEl = notes;
    // beside the lifted card, once it has risen
    this.later(() => {
      if (this.notesEl !== notes) return;
      const r = el.getBoundingClientRect();
      const o = this.root.getBoundingClientRect();
      const right = r.right - o.left + 10;
      const x = right + 200 < this.L.W ? right : r.left - o.left - 210;
      notes.style.transform = `translate(${x}px, ${Math.max(8, r.top - o.top + 10)}px)`;
      notes.classList.add("on");
    }, 200);
  }

  /** What the 3D board has under the pointer (a preview, a pointer cursor). */
  private tipEl: HTMLDivElement | null = null;
  /** A block of the live chain under the pointer: its height, transactions, miner, age. */
  private blockTip(p: XY): boolean {
    const b = this.view.pickChain(p.x, p.y);
    if (!b) {
      this.tipEl?.remove();
      this.tipEl = null;
      return false;
    }
    const t = this.tipEl ?? div("zkl-blocktip");
    if (!this.tipEl) this.fxLayer.appendChild(t);
    this.tipEl = t;
    const age = Math.max(0, Math.round((Date.now() - b.time) / 1000));
    const ago = age < 90 ? T(`${age} s ago`, `${age} 秒前`) : T(`${Math.round(age / 60)} min ago`, `${Math.round(age / 60)} 分钟前`);
    t.innerHTML = b.pending
      ? `<b>${T("Next block", "下一个区块")}</b><small>#${b.height.toLocaleString("en-US")} · ${T("being filled", "打包中")}</small><p>${T(`${b.txs} transactions waiting`, `${b.txs} 笔交易等待中`)}<br>${T(`last block ${ago}`, `上个区块 ${ago}`)}</p>`
      : `<b>#${b.height.toLocaleString("en-US")}</b><small>${T("Block mined", "区块已出")} · ${ago}</small><p>${T(`${b.txs} transactions`, `${b.txs} 笔交易`)}${b.pool ? `<br>${esc(b.pool)}` : ""}${b.fees !== null ? `<br>${T("Fees", "手续费")} ${(b.fees / 1e8).toFixed(5)} ZEC` : ""}</p>`;
    t.style.left = `${p.x - 18}px`;
    t.style.top = `${p.y}px`;
    return true;
  }

  private hover3d(p: XY) {
    if (this.drag || this.tgt || this.overlay) return;
    if (this.blockTip(p)) {
      this.hoverPick = "chain";
      this.view.hover(0);
      return this.preview(null);
    }
    const pk = this.view.pick(p.x, p.y);
    const key = pk ? `${pk.kind}|${pk.uid ?? pk.side ?? pk.toy}` : "";
    if (key === this.hoverPick) return;
    this.hoverPick = key;
    this.root.style.cursor = pk && pk.kind !== "deck" ? "pointer" : "";
    this.view.hover(pk?.kind === "minion" ? (pk.uid ?? 0) : 0);
    if (pk?.kind === "minion" && pk.uid) {
      const m = minion(this.g, pk.uid);
      if (m) return this.preview({ m }, this.pt(pk.uid));
    }
    if (pk?.kind === "power" && pk.side !== undefined) return this.preview({ power: this.g.s[pk.side].hero.faction as Pool }, this.view.screenOf("power", pk.side));
    if (pk?.kind === "weapon" && pk.side !== undefined) {
      const w = this.g.s[pk.side].hero.weapon;
      if (w) return this.preview({ id: w.id }, this.view.screenOf("weapon", pk.side));
    }
    if (pk?.kind === "deck" && pk.side !== undefined) {
      const p2 = this.view.screenOf("deck", pk.side);
      this.floatText(p2.x, p2.y - 40, T(`${this.g.s[pk.side].deck.length} cards`, `${this.g.s[pk.side].deck.length} 张`), "buff");
    }
    this.preview(null);
  }

  // ---- input: cards, attacks, targets ------------------------------------------------------------------

  private xy(e: PointerEvent): XY {
    const o = this.root.getBoundingClientRect();
    return { x: e.clientX - o.left, y: e.clientY - o.top };
  }

  private onDown = (e: PointerEvent) => {
    if (!this.g || this.overlay || !this.view) return;
    const p = this.xy(e);
    this.pointer = p;
    if (e.button === 2) return this.cancel();
    const t = e.target as HTMLElement;
    if (this.emoteMenu && !t.closest(".zkl-emotes")) this.closeEmotes();
    if (t.closest(".zkl-emotes") || t.closest(".zkl-gear")) return;
    // (while the last move still plays out, your next one may start: it is queued)
    if (this.busy && !(this.g.turn === this.me && this.g.phase === "play")) return;
    // a target being picked (click mode); a press on another card in your hand drops it for that card
    const onHand = t.closest<HTMLElement>("[data-hand]");
    if (this.tgt && !this.tgt.dragging) {
      const other = onHand && Number(onHand.dataset.hand) !== this.tgt.uid && !onHand.classList.contains("queued");
      if (!other) {
        this.pickTarget(p);
        return;
      }
      this.cancel(true);
    }
    const pk: Pick = t.closest("[data-hand]") ? null : this.view.pick(p.x, p.y);
    if (pk?.kind === "toy" && pk.toy !== undefined) {
      const word = this.view.pokeToy(pk.toy);
      if (word === "hum" || word === "clank") this.snd.land(true);
      else if (word === "chime") this.snd.coin();
      else this.snd.secret();
      return;
    }
    if (!this.myTurn()) {
      if (pk?.kind === "hero" && pk.side === this.me && this.g.phase === "play") return this.emotes();
      if (pk?.kind === "minion" && pk.uid && e.pointerType !== "mouse") {
        const m = minion(this.g, pk.uid);
        if (m) this.preview({ m }, this.pt(pk.uid));
      }
      return;
    }
    const g = this.g;
    const hc = t.closest<HTMLElement>("[data-hand]");
    if (hc) {
      const uid = Number(hc.dataset.hand);
      const h = g.s[this.me].hand.find((x) => x.uid === uid);
      if (!h || this.isQueued(uid) || this.drag) return;
      if (this.showing === uid) {
        this.showing = 0;
        hc.style.zIndex = "";
      }
      if (!this.playable(h)) {
        this.snd.error();
        hc.animate([{ translate: "0 0" }, { translate: "6px 0" }, { translate: "-6px 0" }, { translate: "0 0" }], { duration: 220 });
        return;
      }
      this.preview(null);
      this.handNotes(0);
      this.drag = { uid, el: hc as HTMLDivElement, start: p, moved: false };
      this.root.setPointerCapture(e.pointerId);
      this.snd.pick();
      return;
    }
    // a picked card waiting for a place on the board
    if (this.picked) {
      const h = g.s[this.me].hand.find((x) => x.uid === this.picked);
      // (a minion goes where you click; a weapon or a spell with no target is played by any click above the hand)
      if (h && p.y < this.L.handY - 10 && !this.isQueued(h.uid)) {
        this.dropCard(h.uid, p);
        return;
      }
      this.cancel();
      return;
    }
    if (pk?.kind === "end") return this.endTurn();
    const src = pk?.kind === "minion" ? (pk.uid ?? 0) : pk?.kind === "hero" ? (pk.uid ?? 0) : 0;
    if (src && canAttack(g, this.me, src) && (isHero(src) ? src === HERO_UID[this.me] : minion(g, src)?.side === this.me)) {
      const valid = attackTargets(g, this.me, src);
      if (!valid.length) return;
      this.startTarget({ kind: "attack", uid: src, from: this.pt(src), valid, dragging: true });
      this.root.setPointerCapture(e.pointerId);
      return;
    }
    if (pk?.kind === "hero" && pk.side === this.me) return this.emotes();
    if (pk?.kind === "power" && pk.side === this.me) {
      if (!canPower(g, this.me)) return this.snd.error();
      const P = POWERS.get(g.s[this.me].hero.faction)!;
      if (P.target) this.startTarget({ kind: "power", uid: 0, from: this.view.screenOf("power", this.me), valid: targets(g, this.me, P.target, true), dragging: true });
      else void this.act({ k: "power" });
      this.root.setPointerCapture(e.pointerId);
      return;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.g || !this.view) return;
    const p = this.xy(e);
    this.pointer = p;
    const d = this.drag;
    if (d) {
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) > 9) {
        d.moved = true;
        this.picked = 0;
        this.layoutHand();
      }
      if (d.moved) {
        const h = this.g.s[this.me].hand.find((x) => x.uid === d.uid);
        const def = h ? card(h.id) : null;
        const cw = this.L.cw;
        // a targeted spell turns into an arrow once it's up off the hand
        if (def && def.type === "spell" && def.target && p.y < this.L.handY - cw * 0.2) {
          this.drag = null;
          d.el.style.transition = "transform 0.18s ease-out";
          d.el.style.transform = `translate(${Math.min(this.L.W - cw * 1.2, Math.max(cw * 0.2, d.start.x - cw / 2))}px, ${this.L.handY - cw * 1.4 * 0.75}px) scale(0.85)`;
          d.el.style.zIndex = "18";
          const t = playTargets(this.g, this.me, h!)!;
          this.startTarget({ kind: "card", uid: d.uid, from: this.pt(HERO_UID[this.me]), valid: t.list, dragging: true });
          this.moveArrow(p);
          return;
        }
        d.el.style.transition = "opacity 0.15s";
        d.el.style.zIndex = "30";
        const enemyLane = this.view.laneY(this.foe);
        const overBoard = def?.type === "minion" && p.y < this.L.handY - 10 && p.y > enemyLane - this.view.tokenPx() * 1.5;
        const tilt = Math.max(-10, Math.min(10, (p.x - (this.lastX ?? p.x)) * 0.6));
        this.lastX = p.x;
        d.el.style.transform = `translate(${p.x - cw / 2}px, ${p.y - cw * 0.7}px) scale(${overBoard ? 0.72 : 0.95}) rotate(${tilt}deg)`;
        d.el.style.opacity = overBoard ? "0.85" : "1";
        if (overBoard && def) this.view.ghost(def.id, this.view.insertIndex(p.x));
        else this.view.ghost(null);
      }
      return;
    }
    if (this.tgt) return this.moveArrow(p);
    if (e.pointerType === "mouse") this.hover3d(p);
  };

  private onUp = (e: PointerEvent) => {
    if (!this.g || !this.view) return;
    const p = this.xy(e);
    const d = this.drag;
    if (d) {
      this.drag = null;
      d.el.style.transition = "";
      if (!d.moved) {
        const h = this.g.s[this.me].hand.find((x) => x.uid === d.uid);
        if (!h) return;
        const def = card(h.id);
        if (this.picked === d.uid) {
          // a second click on it plays it (a minion at the right end of your row)
          this.dropCard(d.uid, { x: def.type === "minion" ? this.L.W : this.L.cx, y: this.L.H * 0.45 });
          return;
        }
        this.picked = d.uid;
        if (def.type === "spell" && def.target) {
          const t = playTargets(this.g, this.me, h)!;
          this.startTarget({ kind: "card", uid: d.uid, from: this.pt(HERO_UID[this.me]), valid: t.list, dragging: false });
        }
        this.layoutHand();
        this.hints();
        return;
      }
      d.el.style.opacity = "";
      if (p.y < this.L.handY - 10) this.dropCard(d.uid, p);
      else {
        this.view.ghost(null);
        this.layoutHand();
      }
      return;
    }
    if (this.tgt?.dragging) {
      const moved = Math.hypot(p.x - this.tgt.from.x, p.y - this.tgt.from.y) > 30;
      if (moved && this.targetAt(p)) this.pickTarget(p);
      else if (moved) this.cancel();
      else this.tgt.dragging = false;
    }
  };

  /** A card released over the board (or clicked twice). */
  private dropCard(uid: number, p: XY) {
    const g = this.g;
    const h = g.s[this.me].hand.find((x) => x.uid === uid);
    if (!h) return;
    const d = card(h.id);
    this.picked = 0;
    if (d.type === "minion") {
      const pos = this.view.insertIndex(p.x);
      const t = playTargets(g, this.me, h);
      if (t && t.list.length) {
        // the card waits on its place while its Mint's target is picked
        const el = this.hand.get(uid)!;
        this.view.ghost(d.id, pos);
        const s = this.view.gapPoint(pos);
        el.style.opacity = "0";
        this.pending = { uid, el, pos };
        this.startTarget({ kind: "card", uid, pos, from: s, valid: t.list, dragging: false });
        return;
      }
      void this.act({ k: "play", uid, pos });
      return;
    }
    const t = playTargets(g, this.me, h);
    if (t && t.list.length) {
      const hit = this.targetAt(p, t.list);
      if (hit) return void this.act({ k: "play", uid, target: hit });
      this.startTarget({ kind: "card", uid, from: this.pt(HERO_UID[this.me]), valid: t.list, dragging: false });
      return;
    }
    void this.act({ k: "play", uid });
  }

  private startTarget(t: Target) {
    this.tgt = t;
    this.preview(null);
    for (const uid of t.valid) this.view.light(uid, "target");
    if (t.kind === "attack") this.view.light(t.uid, "source");
    this.arrow.style.display = "";
    this.moveArrow(this.pointer);
  }

  private hot = 0;
  private lastX: number | undefined;
  private moveArrow(p: XY) {
    const t = this.tgt;
    if (!t) return;
    const hot = this.targetAt(p);
    if (hot !== this.hot) {
      if (this.hot && t.valid.includes(this.hot)) this.view.light(this.hot, "target");
      if (hot) this.view.light(hot, "hot");
      this.hot = hot;
    }
    this.drawArrow(t.from, p, !!hot);
  }

  private arrowArgs: [XY, XY, boolean] | null = null;
  private arrowRaf = 0;
  /** The targeting arrow: a chain of chevrons marching from the source along a curve, a head, and a
   * reticle on the target once it locks (red, Hearthstone's). Repainted every frame while it shows. */
  private drawArrow(a: XY, p: XY, hot: boolean) {
    this.arrowArgs = [a, p, hot];
    this.paintArrow(a, p, hot);
    if (this.arrowRaf) return;
    const tick = () => {
      if (!this.arrowArgs || this.closed || this.arrow.style.display === "none") return void (this.arrowRaf = 0);
      this.paintArrow(...this.arrowArgs);
      this.arrowRaf = requestAnimationFrame(tick);
    };
    this.arrowRaf = requestAnimationFrame(tick);
  }
  private paintArrow(a: XY, p: XY, hot: boolean) {
    const dx = p.x - a.x,
      dy = p.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len,
      uy = dy / len;
    const nx = -uy,
      ny = ux;
    const base = { x: p.x - ux * 26, y: p.y - uy * 26 };
    // bow the curve upward on the screen, whichever way it points
    const side = ny < 0 ? 1 : -1;
    const bow = Math.min(len * 0.2, 90) * side;
    const c = { x: (a.x + base.x) / 2 + nx * bow, y: (a.y + base.y) / 2 + ny * bow };
    const B = (t: number) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * base.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * base.y });
    // arc length table
    const N = 40;
    const pts = [B(0)];
    const acc = [0];
    for (let i = 1; i <= N; i++) {
      const q = B(i / N);
      acc.push(acc[i - 1] + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y));
      pts.push(q);
    }
    const total = acc[N];
    const at = (d: number) => {
      let i = 1;
      while (i < N && acc[i] < d) i++;
      const k = (d - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
      const q0 = pts[i - 1],
        q1 = pts[i];
      return { x: q0.x + (q1.x - q0.x) * k, y: q0.y + (q1.y - q0.y) * k, a: Math.atan2(q1.y - q0.y, q1.x - q0.x) };
    };
    const gap = 21;
    const phase = ((performance.now() / 22) % gap) * (this.fast ? 0 : 1);
    let html = "";
    for (let d = 10 + phase; d < total - 8; d += gap) {
      const q = at(d);
      const s = 0.55 + 0.45 * Math.min(1, d / Math.max(1, total));
      const ca = Math.cos(q.a) * s,
        sa = Math.sin(q.a) * s;
      const P = (x: number, y: number) => `${(q.x + x * ca - y * sa).toFixed(1)},${(q.y + x * sa + y * ca).toFixed(1)}`;
      html += `<polygon class="chev" points="${P(-8, -11)} ${P(3, 0)} ${P(-8, 11)} ${P(-1, 11)} ${P(10, 0)} ${P(-1, -11)}"/>`;
    }
    (this.arrow.querySelector(".tail") as SVGGElement).innerHTML = html;
    const end = at(Math.max(0, total - 1));
    const ex = Math.cos(end.a),
      ey = Math.sin(end.a);
    const tip = { x: base.x + ex * 30, y: base.y + ey * 30 };
    const hx = -ey,
      hy = ex;
    this.arrow
      .querySelector(".head")!
      .setAttribute("points", `${tip.x},${tip.y} ${base.x + hx * 22 - ex * 4},${base.y + hy * 22 - ey * 4} ${base.x + ex * 6},${base.y + ey * 6} ${base.x - hx * 22 - ex * 4},${base.y - hy * 22 - ey * 4}`);
    const ret = this.arrow.querySelector(".ret") as SVGGElement;
    ret.setAttribute("transform", `translate(${p.x} ${p.y})`);
    this.arrow.classList.toggle("bad", !hot && len > 40);
    this.arrow.classList.toggle("lock", hot);
  }

  /** The valid target under p (0: none). */
  private targetAt(p: XY, list?: number[]): number {
    const valid = list ?? this.tgt?.valid;
    if (!valid) return 0;
    const pk = this.view.pick(p.x, p.y);
    const uid = pk?.kind === "minion" || pk?.kind === "hero" ? (pk.uid ?? 0) : 0;
    return uid && valid.includes(uid) ? uid : 0;
  }

  private pickTarget(p: XY) {
    const t = this.tgt;
    if (!t) return;
    const hit = this.targetAt(p);
    if (!hit) return this.cancel();
    if (t.kind === "attack") void this.act({ k: "attack", from: t.uid, to: hit });
    else if (t.kind === "power") void this.act({ k: "power", target: hit });
    else void this.act({ k: "play", uid: t.uid, pos: t.pos, target: hit });
  }

  private cancel(silent = false, keepGhost = false) {
    if (this.tgt) {
      for (const uid of this.tgt.valid) this.view.light(uid, "");
      this.view.light(this.tgt.uid, "");
    }
    this.hot = 0;
    const had = !!(this.tgt || this.pending || this.picked);
    this.tgt = null;
    if (this.arrow) this.arrow.style.display = "none";
    if (this.pending) {
      this.pending.el.style.zIndex = "";
      this.pending.el.style.opacity = "";
      this.pending = null;
    }
    this.picked = 0;
    if (!keepGhost) this.view?.ghost(null);
    this.layoutHand();
    if (had && !silent) this.hints();
  }

  // ---- words ------------------------------------------------------------------------------------------------

  private speak(side: Side, kind: string, text?: string) {
    if (this.closed || this.fast || !this.L) return;
    const pool = LINES[kind];
    const line = text ?? (pool ? (([en, zh]) => T(en, zh))(pool[Math.floor(this.rnd() * pool.length)]) : kind);
    this.bubbles[side]?.remove();
    const b = div(`zkl-bubble ${side === this.me ? "me" : "foe"}`);
    b.textContent = line;
    const p = this.pt(HERO_UID[side]);
    const px = this.view.tokenPx();
    b.style.left = `${p.x - px * 0.85}px`;
    b.style.top = `${p.y - px * 0.2}px`;
    this.fxLayer.appendChild(b);
    this.bubbles[side] = b;
    this.snd.hover();
    this.later(() => {
      b.classList.add("out");
      this.later(() => b.remove(), 300);
    }, 2600);
  }

  private emotes() {
    if (this.emoteMenu) return this.closeEmotes();
    const m = div("zkl-emotes");
    const p = this.pt(HERO_UID[this.me]);
    m.style.left = `${p.x}px`;
    m.style.top = `${p.y}px`;
    EMOTES.forEach(([k, en, zh], i) => {
      const b = document.createElement("button");
      b.textContent = T(en, zh);
      b.className = `e${i}`;
      b.addEventListener("click", () => {
        this.closeEmotes();
        this.speak(this.me, k, T(en, zh));
        if (this.rnd() < 0.75) this.later(() => this.speak(this.foe, `re:${k}`), 1100 + this.rnd() * 700);
      });
      m.appendChild(b);
    });
    this.fxLayer.appendChild(m);
    m.style.pointerEvents = "auto";
    this.emoteMenu = m;
  }
  private closeEmotes() {
    this.emoteMenu?.remove();
    this.emoteMenu = null;
  }

  // ---- choices and menus --------------------------------------------------------------------------------

  private discoverScreen() {
    const p = this.g.pending;
    if (!p) return;
    const o = this.over(`<div class="zkl-h1" style="text-align:center">${T("Discover", "发现")}</div><p class="zkl-sub" style="text-align:center">${T("Pick one for your hand.", "选择一张加入手牌。")}</p><div class="zkl-discover"></div>`, "zkl-glass");
    const box = o.querySelector(".zkl-discover")!;
    p.opts.forEach((id, i) => {
      const el = cardEl(id, { prover: prover(this.g, this.me) });
      el.addEventListener("click", () => {
        this.closeOver();
        this.snd.flip(card(id).rarity);
        void this.act({ k: "choose", i });
      });
      box.appendChild(el);
    });
  }

  private menu() {
    if (this.overlay) return;
    const o = this.over(
      `<div class="zkl-h1" style="text-align:center">ZK LEGENDS</div>
       <div class="zkl-menu" style="margin:16px auto 0">
         <button class="zkl-btn" data-resume>${T("Back to the duel", "返回对决")}</button>
         <button class="zkl-btn ghost" data-rules>${T("How to play", "玩法")}</button>
         <button class="zkl-btn ghost" data-sound>${this.snd.muted ? T("Sound: off", "声音：关") : T("Sound: on", "声音：开")}</button>
         <button class="zkl-btn red" data-concede>${T("Concede", "认输")}</button>
       </div>`,
    );
    (o.querySelector(".zkl-panel") as HTMLElement).style.width = "min(420px, 100%)";
    o.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-resume]") || t === o) this.closeOver();
      else if (t.closest("[data-rules]")) this.rulesScreen(() => {});
      else if (t.closest("[data-sound]")) {
        this.snd.muted = !this.snd.muted;
        this.closeOver();
      } else if (t.closest("[data-concede]")) {
        this.closeOver();
        if (this.g.phase === "over") return void this.finish();
        this.busy = false;
        void this.act({ k: "concede", side: this.me });
      }
    });
  }

  private finished = false;
  private async finish() {
    if (this.finished) return;
    this.finished = true;
    this.rope(false);
    const g = this.g;
    const w = g.winner;
    const won = w === this.me;
    const loser = w === -1 ? null : ((1 - (w as number)) as Side);
    if (loser !== null) this.view.heroDeath(loser);
    if (won) this.snd.win();
    else this.snd.lose();
    if (w !== -1) this.speak(this.foe, won ? "lose" : "win");
    this.view.setEnd("over", T("GAME OVER", "对局结束"));
    await this.wait(1600);
    if (this.closed) return;
    const stake = this.o.stake;
    const payout = w === -1 ? stake : won ? stake * 2 : 0;
    const award = this.auto ? null : awardDuel(won, this.o.seats[1]?.skill ?? 0.5);
    // an Arena duel counts for the run (12 wins or 3 losses)
    if (award && this.deckName === "Arena" && w !== -1) award.lines.unshift(...arenaResult(won).lines);
    const res: TableResult = {
      order: w === 1 ? [1, 0] : [0, 1],
      payout,
      summary: w === -1 ? "ZK Legends: a draw" : won ? `ZK Legends: won with ${this.deckName}` : `ZK Legends: lost to ${this.names[1]}`,
    };
    if (this.auto) return this.exit(res);
    const o = this.over(
      `<div class="zkl-end-panel ${won ? "win" : w === -1 ? "draw" : "lose"}">
         <div class="face"><i class="rays"></i><span data-face></span><i class="crack"></i></div>
         <div class="big${won ? "" : " lose"}">${w === -1 ? T("DRAW", "平局") : won ? T("VICTORY", "胜利") : T("DEFEAT", "失败")}</div>
         <p class="zkl-sub">${won ? T(`${esc(this.names[1])} is out of Health.`, `${esc(this.names[1])} 的生命值归零。`) : w === -1 ? T("Both heroes fell.", "双方英雄同时倒下。") : T(`${esc(this.names[1])} wins this one.`, `${esc(this.names[1])} 赢下了这一局。`)} ${stake ? (payout ? T(`You take ⓩ ${payout}.`, `你赢得 ⓩ ${payout}。`) : T(`The stake (ⓩ ${stake}) is lost.`, `赌注（ⓩ ${stake}）输掉了。`)) : ""}</p>
         ${award?.lines.length ? `<div class="zkl-award">${award.lines.map((l) => `<p${/pack|卡包/i.test(l) ? ' class="pack"' : ""}>${esc(l)}</p>`).join("")}</div>` : ""}
         <div class="zkl-row" style="justify-content:center"><button class="zkl-btn" data-done>${T("Continue", "继续")}</button></div>
       </div>`,
      "zkl-glass",
    );
    // your own hero, in its frame: gold when it won, iron and cracked when it fell
    o.querySelector("[data-face]")?.replaceWith(snarkCanvas(this.o.seats[0]?.id ?? 1));
    o.querySelector("[data-done]")!.addEventListener("click", () => this.exit(res));
  }

  /** (for tests) */
  get state() {
    return this.g;
  }
  /** (for tests) Screen points of what's on the board, and what can act. */
  debugPoints() {
    const g = this.g;
    const v = this.view;
    if (!g || !v) return null;
    return {
      heroes: [v.screen(1), v.screen(2)],
      mine: g.s[0].board.map((m) => ({ uid: m.uid, p: v.screen(m.uid), act: canAttack(g, 0, m.uid) && attackTargets(g, 0, m.uid).length > 0 })),
      foes: g.s[1].board.map((m) => ({ uid: m.uid, p: v.screen(m.uid) })),
      end: v.screenOf("end"),
      power: v.screenOf("power", 0),
      lane: v.laneY(0),
      myTurn: this.myTurn() && !this.busy,
      targets: this.tgt ? this.tgt.valid.map((u) => v.screen(u)) : [],
    };
  }
  lethal() {
    return boardDamage(this.g, this.me);
  }
}

// ---- small helpers -----------------------------------------------------------------------------------------

function div(cls: string) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
function skillName(s: number) {
  return s < 0.35 ? T("Easy", "简单") : s < 0.6 ? T("Normal", "普通") : s < 0.82 ? T("Hard", "困难") : T("Shark", "高手");
}
