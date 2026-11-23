import * as A from "./arena";
/**
 * ZK LEGENDS' front end: a live 3D picture behind (front/stage.ts: an arena at golden hour, the crew
 * round a duel), the wordmark and a plain list of items; everything else is made of the table's own
 * materials (walnut plates with a brass edge, gold slabs for what you do next, the cards' painted coins
 * and gems), Archivo condensed for labels and numbers, Geist for prose.
 * - Menu: Play, Arena, Collection, Packs, How to play, Settings, Leave the table; your deck and
 *   tonight's rival in the corners; your gold, zats and packs top right.
 * - Play: your decks as boxes (the starters and yours), the chosen one's panel (hero power, curve),
 *   the rival, a gold Duel.
 * - Collection: a book (front/book.ts) of the 10,000 zkSNARKs (snarkcards.ts) and the Classics: pool
 *   tabs, ZEC cost coins, search, filters; a card opens big (traits, craft, disenchant); your decks on
 *   the right, and the deck being built as card strips.
 * - Packs: buy with gold, open: five cards face down, each turned with its rarity's light.
 * - How to play, Settings: full screens with tabs across the top.
 * Your collection lives in progress.ts.
 */
import * as MAPS_MOD from "./maps";
import "./menus.css";
import { T } from "../../i18n/lang";
import { DECK_SIZE, POWERS, card, type CardDef, type Faction, type Rarity } from "./engine";
import { COLLECTIBLE, FACTIONS, FACTION_INFO } from "./cards";
import { STARTERS, STARTER_NAMES, saveDecks, maxCopies, type Pool, type SavedDeck } from "./decks";
import { KW_HELP, TRIBE_ZH, cardEl, cardName, factionName, iconCanvas, kwLabel, rarityName, snarkCanvas } from "./art";
import { backUrl, coinUrl, gemUrl, paintPack } from "./paint";
import { SNARKS, ensureCards, isSnarkCard, loadSnarks, snarkCard, snarkCardId, snarkIdOf, snarkInfo, snarksReady, type SnarkInfo } from "./snarkcards";
import * as P from "./progress";
import type { LegendsSound } from "./sound";
import { HubStage } from "./front/stage";
import { CardBook } from "./front/book";

export interface MenusCtx {
  meId: number;
  rival: { id: number; name: string; skill: number };
  stake: number;
  snd: LegendsSound;
  onDuel(deck: string[], pool: Pool, name: string): void;
  onLeave(): void;
}

type Mode = "menu" | "play" | "coll" | "packs" | "arena";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const skillName = (s: number) => (s < 0.35 ? T("Easy", "简单") : s < 0.6 ? T("Normal", "普通") : s < 0.82 ? T("Hard", "困难") : T("Shark", "高手"));
const TIER_COLOR: Record<string, string> = { legendary: "#ffb02e", epic: "#b07bff", rare: "#3fa8ff", common: "#d8d2c8", basic: "#9a958e" };
const TIERS: Rarity[] = ["legendary", "epic", "rare", "common"];
const TRIBES = ["Miner", "Node", "Whale", "Ghost", "Plant", "Bot"];
const TIER_RANK: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3, basic: 4 };
/** Each pool's face: its champion's zkSNARK. */
const CHAMP: Record<Faction, string> = { transparent: "t_boss", sapling: "s_gardener", sprout: "p_crypt", orchard: "o_sentinel", neutral: "n_explorer" };
const champArt = (f: Faction) => card(CHAMP[f]).art;
const MAP_NAMES: Record<string, [string, string]> = { rigs: ["The Rigs", "矿机房"], orchard: ["The Orchard", "果园"], crypt: ["The Crypt", "墓穴"], vault: ["The Vault", "金库"] };
const MAP_TINT: Record<string, string> = { rigs: "#ff6b35", orchard: "#6dbf8a", crypt: "#b48ad8", vault: "#f4b728" };

/** The sound, whatever it offers today: a call that never throws. */
function sfx(snd: LegendsSound | null, name: string, ...a: unknown[]) {
  const f = snd ? (snd as unknown as Record<string, unknown>)[name] : null;
  if (typeof f === "function")
    try {
      (f as (...x: unknown[]) => void).apply(snd, a);
    } catch {
      /* (no sound is fine) */
    }
}

interface DeckEntry {
  key: string;
  name: string;
  pool: Pool;
  cards: string[];
  custom: boolean;
  ok: boolean;
  why: string;
}

export class Menus {
  private root: HTMLDivElement;
  private stage: HubStage | null = null;
  private closed = false;
  private unsub: () => void;
  private mode: Mode = "menu";
  private menuAt = 0;
  private wentAt = 0;
  private modal: HTMLDivElement | null = null;
  private onlyBuilder = false;
  private builderDone: ((saved?: SavedDeck) => void) | null = null;
  private lastSaved: SavedDeck | undefined;
  // play
  private decks: DeckEntry[] = [];
  private deckAt = 0;
  // the collection
  private book: CardBook | null = null;
  private set: "snarks" | "classics" = "snarks";
  private only = false;
  private tier: Rarity | "" = "";
  private pool: Faction | "" = "";
  private cost = -1;
  private tribe = "";
  private words = "";
  private sort: "rank" | "cost" | "number" = "rank";
  private editing: SavedDeck | null = null;
  private dirty = false;
  private costsMade = false;

  constructor(
    host: HTMLElement,
    private ctx: MenusCtx | null,
    private snd: LegendsSound | null,
  ) {
    this.root = document.createElement("div");
    this.root.className = "zkf";
    this.root.dataset.mode = "menu";
    this.root.innerHTML = `
      <div class="zkf-shade"></div>
      <div class="zkf-bars"><i></i><i></i></div>
      <header class="zkf-wallet"></header>
      <section class="zkf-menu" aria-label="Main menu">
        <h1 class="zkf-mark"><span>ZK</span> LEGENDS<small>${T("The zkSNARK card duel", "零知传奇 · 卡牌对决")}</small></h1>
        <nav class="zkf-items" role="menu"></nav>
        <div class="zkf-me"></div>
        <div class="zkf-rival"></div>
      </section>
      <section class="zkf-play" aria-label="Choose your deck"></section>
      <section class="zkf-coll" aria-label="Collection"></section>
      <section class="zkf-packs" aria-label="Packs"></section>
      <section class="zkf-arena" aria-label="Arena"></section>
      <div class="zkf-toast"></div>
      <div class="zkf-fade"></div>`;
    host.appendChild(this.root);
    try {
      this.stage = new HubStage(this.root, { meId: ctx?.meId ?? P.mineId() ?? 1, rivalId: ctx?.rival.id ?? 2 });
      this.root.prepend(this.stage.canvas);
    } catch {
      this.stage = null; // (no WebGL: the shade and the menus alone)
    }
    this.unsub = P.onProgress(() => this.wallet());
    window.addEventListener("keydown", this.onKey, true);
    const HOV = ".zkf-item, .zkf-btn, .zkf-box, .zkf-tab, .zkf-coin-f, .zkf-hero, .zkf-turn";
    this.root.addEventListener("pointerover", (e) => {
      const b = (e.target as HTMLElement).closest(HOV);
      if (b && b !== (e.relatedTarget as HTMLElement | null)?.closest?.(HOV)) sfx(this.snd, "ui", "hover");
    });
    sfx(this.snd, "music", "menu");
    // the 10,000: their data, your own zkSNARK's card
    void loadSnarks()
      .then(() => {
        if (this.closed) return;
        if (this.ctx?.meId) P.grantMine(this.ctx.meId);
        if (this.mode === "coll") this.collection();
        if (this.mode === "menu") this.renderMenu();
      })
      .catch(() => this.toast(T("The 10,000 zkSNARKs couldn't be loaded: the Classics only for now.", "一万张零知卡暂时无法载入：先用经典卡。")));
    this.wallet();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.unsub();
    window.removeEventListener("keydown", this.onKey, true);
    this.book?.dispose();
    this.stage?.dispose();
    this.root.remove();
  }

  /** A tap's click lands a moment after a screen changed: ignore it. */
  private settled() {
    return performance.now() - this.wentAt > 350;
  }

  // ---- navigation -----------------------------------------------------------------------------------------

  go(m: Mode) {
    this.closeModal();
    this.mode = m;
    this.wentAt = performance.now();
    this.root.dataset.mode = m;
    this.stage?.setFraming(m === "menu" ? "menu" : m === "play" ? "low" : "wide");
    if (m === "menu") this.renderMenu();
    else if (m === "play") this.play();
    else if (m === "coll") this.collection();
    else if (m === "arena") this.arena();
    else this.packs();
    this.wallet();
  }

  /** (the old table's deck builder) The collection on its own, making or editing a deck. */
  builder(fresh: boolean, done: (saved?: SavedDeck) => void) {
    this.onlyBuilder = true;
    this.builderDone = done;
    this.go("coll");
    if (fresh) this.newDeck();
  }

  private back() {
    if (this.modal) return this.closeModal();
    if (this.mode === "coll" && this.editing) return this.doneEdit();
    if (this.onlyBuilder) {
      this.close();
      return this.builderDone?.(this.lastSaved);
    }
    if (this.mode !== "menu") return this.go("menu");
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.closed) return;
    const inInput = !!(e.target as HTMLElement).closest?.("input");
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (inInput) return (e.target as HTMLElement).blur();
      if (this.closeDrop()) return;
      return this.back();
    }
    if (inInput) return;
    if (this.modal) {
      const turn = (this.modal as HTMLElement & { turn?: (d: number) => void }).turn;
      if (turn && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        turn(e.key === "ArrowRight" ? 1 : -1);
      }
      return;
    }
    if (this.mode === "menu") {
      const n = this.items().length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.menuAt = (this.menuAt + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        this.renderMenu();
        sfx(this.snd, "ui", "hover");
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.pick(this.items()[this.menuAt].k);
      }
    } else if (this.mode === "play") {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.stepDeck(e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.duel();
      }
    } else if (this.mode === "arena") {
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        e.preventDefault();
        this.arenaKey(Number(e.key) - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.arenaDuel();
      }
    } else if (this.mode === "coll") {
      if (e.key === "/") {
        e.preventDefault();
        (this.root.querySelector(".zkf-search") as HTMLInputElement | null)?.focus();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        this.book?.turn(e.key === "ArrowRight" || e.key === "PageDown" ? 1 : -1);
      }
    } else if (this.mode === "packs" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      this.packKey();
    }
  };

  private wallet() {
    const s = P.load();
    const w = this.root.querySelector(".zkf-wallet") as HTMLElement | null;
    if (!w) return;
    w.innerHTML = `<div class="zkf-purse">
      <span title="${T("Gold: earned in duels, buys packs", "金币：对决中赚取，用来买卡包")}"><img src="${coinUrl("", 48)}" alt="" /><b>${fmt(s.gold)}</b></span>
      <span title="${T("Zats: from extra copies, craft the cards you want", "Zat：来自多余卡牌，用来合成想要的卡")}"><img src="${gemUrl("rare", 40)}" alt="" /><b>${fmt(s.zats)}</b></span>
      <span title="${T("Unopened packs", "未开卡包")}"><i class="zkf-packic" style="background-image:url(${packUrl()})"></i><b>${s.packs}</b></span>
    </div>`;
  }

  // ---- the menu ------------------------------------------------------------------------------------------------

  private items(): { k: string; label: string; badge?: string; hot?: boolean }[] {
    const s = P.load();
    const out: { k: string; label: string; badge?: string; hot?: boolean }[] = [];
    if (this.ctx) out.push({ k: "play", label: T("Play", "开始对决") });
    if (this.ctx) {
      const a = A.arenaLoad();
      const badge = a && !a.done ? (A.arenaReady(a) ? `${a.wins}–${a.losses}` : `${a.deck.length}/30`) : A.arenaFree() ? T("Free", "免费") : undefined;
      out.push({ k: "arena", label: T("Arena", "竞技场"), badge, hot: !!a && !a.done });
    }
    const fresh = Object.keys(s.fresh ?? {}).length;
    out.push(
      { k: "coll", label: T("Collection", "收藏"), badge: fresh ? T(`${fresh} new`, `${fresh} 新`) : undefined },
      { k: "packs", label: T("Packs", "卡包"), badge: s.packs ? String(s.packs) : undefined, hot: s.packs > 0 },
      { k: "rules", label: T("How to play", "玩法") },
      { k: "settings", label: T("Settings", "设置") },
    );
    if (this.ctx) out.push({ k: "leave", label: T("Leave the table", "离开牌桌") });
    return out;
  }

  private renderMenu() {
    const items = this.items();
    this.menuAt = Math.min(this.menuAt, items.length - 1);
    const nav = this.root.querySelector(".zkf-items")!;
    nav.innerHTML = items
      .map(
        (it, i) =>
          `<button class="zkf-item ${i === this.menuAt ? "on" : ""} ${it.k === "leave" ? "quiet" : ""}" role="menuitem" data-k="${it.k}" data-i="${i}" type="button"><b>${esc(it.label)}</b>${it.badge ? `<i class="zkf-badge ${it.hot ? "hot" : ""}">${esc(it.badge)}</i>` : ""}</button>`,
      )
      .join("");
    for (const b of nav.querySelectorAll<HTMLElement>(".zkf-item")) {
      b.addEventListener("pointerenter", () => {
        if (TOUCH) return;
        this.menuAt = Number(b.dataset.i);
        for (const o of nav.querySelectorAll(".zkf-item")) o.classList.toggle("on", o === b);
      });
      b.addEventListener("click", () => this.settled() && this.pick(b.dataset.k!));
    }
    const meEl = this.root.querySelector(".zkf-me") as HTMLElement;
    {
      const last = localStorage.getItem("street.legends.last") ?? "";
      const d = this.playable().find((x) => x.key === last) ?? this.playable()[0];
      meEl.innerHTML = d ? `<span class="zkf-face" style="--fc:${FACTION_INFO[d.pool].color}" data-pic></span><span class="zkf-who"><small>${T("Deck", "套牌")} · ${factionName(d.pool)}</small><b>${esc(d.name)}</b></span>` : "";
      meEl.querySelector("[data-pic]")?.appendChild(snarkCanvas(champion(d)));
      meEl.style.setProperty("--fc", d ? FACTION_INFO[d.pool].color : "#a87a14");
      meEl.onclick = () => this.settled() && this.ctx && this.go("play");
    }
    const r = this.ctx?.rival;
    const rv = this.root.querySelector(".zkf-rival") as HTMLElement;
    if (r) {
      rv.innerHTML = `<span class="zkf-who"><small>${T("Tonight's rival", "今晚的对手")}</small><b>${esc(r.name)}</b><em>${skillName(r.skill)}${this.ctx?.stake ? ` · ⓩ ${this.ctx.stake}` : ""}</em></span><span class="zkf-face big" data-pic></span>`;
      rv.querySelector("[data-pic]")!.appendChild(snarkCanvas(r.id));
    } else rv.innerHTML = "";
  }

  private pick(k: string) {
    sfx(this.snd, "ui", "click");
    if (k === "play") this.go("play");
    else if (k === "arena") this.go("arena");
    else if (k === "coll") this.go("coll");
    else if (k === "packs") this.go("packs");
    else if (k === "rules") this.rules();
    else if (k === "settings") this.settings();
    else if (k === "leave") this.ctx?.onLeave();
  }

  // ---- play: your decks -----------------------------------------------------------------------------------------

  private playable(): DeckEntry[] {
    const out: DeckEntry[] = FACTIONS.map((p) => ({ key: `starter:${p}`, name: T(STARTER_NAMES[p][0], STARTER_NAMES[p][1]), pool: p, cards: STARTERS[p], custom: false, ok: true, why: "" }));
    for (const d of P.allDecks()) {
      const why = deckWhy(d);
      out.push({ key: `deck:${d.id}`, name: d.name, pool: d.pool, cards: d.cards, custom: true, ok: !why, why });
    }
    return out;
  }

  private play() {
    if (!snarksReady()) void loadSnarks().then(() => !this.closed && this.mode === "play" && this.play()).catch(() => {});
    this.decks = this.playable();
    const last = localStorage.getItem("street.legends.last") ?? "";
    const at = this.decks.findIndex((d) => d.key === last && d.ok);
    this.deckAt = at >= 0 ? at : 0;
    const mine = this.decks.filter((d) => d.custom).length;
    const sec = this.root.querySelector(".zkf-play") as HTMLElement;
    sec.innerHTML = `
      ${head(T("Choose a deck", "选择套牌"))}
      <div class="zkf-shelf zkf-plate">
        <h3 class="zkf-lab">${T("Starter decks", "初始套牌")}</h3>
        <div class="zkf-boxes" data-g="starter"></div>
        <h3 class="zkf-lab">${T("My decks", "我的套牌")}<small>${mine}/9</small></h3>
        <div class="zkf-boxes" data-g="mine"></div>
      </div>
      <div class="zkf-deckcard zkf-plate"></div>
      <div class="zkf-vs zkf-plate"></div>
      <button class="zkf-btn gold zkf-go" type="button">${T("Duel", "开始对决")}</button>`;
    wireBack(sec, () => this.settled() && this.go("menu"));
    sec.querySelector(".zkf-go")!.addEventListener("click", () => this.settled() && this.duel());
    let lastTap = 0,
      lastKey = "";
    const boxOf = (d: DeckEntry, i: number) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `zkf-box ${d.ok ? "" : "off"}`;
      b.dataset.i = String(i);
      b.style.setProperty("--fc", FACTION_INFO[d.pool].color);
      b.innerHTML = `<span class="zkf-boxart"></span><b>${esc(d.name)}</b><small>${d.ok ? factionName(d.pool) : esc(d.why)}</small>`;
      b.querySelector(".zkf-boxart")!.appendChild(snarkCanvas(champion(d)));
      b.addEventListener("click", () => {
        const twice = lastKey === d.key && performance.now() - lastTap < 420;
        lastTap = performance.now();
        lastKey = d.key;
        this.deckAt = i;
        sfx(this.snd, "ui", "click");
        this.renderDeck();
        if (twice) this.duel();
      });
      return b;
    };
    const st = sec.querySelector('[data-g="starter"]') as HTMLElement,
      my = sec.querySelector('[data-g="mine"]') as HTMLElement;
    this.decks.forEach((d, i) => (d.custom ? my : st).appendChild(boxOf(d, i)));
    if (mine < 9) {
      const nb = document.createElement("button");
      nb.type = "button";
      nb.className = "zkf-box new";
      nb.innerHTML = `<span class="zkf-boxart"><i></i></span><b>${T("New deck", "新套牌")}</b><small>&nbsp;</small>`;
      nb.addEventListener("click", () => {
        this.go("coll");
        this.newDeck();
      });
      my.appendChild(nb);
    }
    const r = this.ctx?.rival;
    const vs = sec.querySelector(".zkf-vs") as HTMLElement;
    if (r) {
      vs.innerHTML = `<span class="zkf-face big" data-pic></span><span class="zkf-who"><small>${T("Against", "对手")}</small><b>${esc(r.name)}</b><em>${skillName(r.skill)}${this.ctx?.stake ? ` · ⓩ ${this.ctx.stake} · ${T(`win ⓩ ${this.ctx.stake * 2}`, `赢 ⓩ ${this.ctx.stake * 2}`)}` : ` · ${T("free duel", "免费对决")}`}</em></span>`;
      vs.querySelector("[data-pic]")!.appendChild(snarkCanvas(r.id));
    } else vs.remove();
    this.renderDeck();
  }

  private stepDeck(d: number) {
    if (!this.decks.length) return;
    this.deckAt = (this.deckAt + d + this.decks.length) % this.decks.length;
    sfx(this.snd, "ui", "hover");
    this.renderDeck();
  }

  private renderDeck() {
    const sec = this.root.querySelector(".zkf-play") as HTMLElement;
    const d = this.decks[this.deckAt];
    if (!d) return;
    for (const b of sec.querySelectorAll<HTMLElement>(".zkf-box[data-i]")) b.classList.toggle("on", Number(b.dataset.i) === this.deckAt);
    const p = POWERS.get(d.pool)!;
    const snarks = d.cards.filter(isSnarkCard).length;
    const legs = d.cards.filter((id) => card(id).rarity === "legendary").length;
    const avg = d.cards.reduce((a, id) => a + card(id).cost, 0) / Math.max(1, d.cards.length);
    const fc = FACTION_INFO[d.pool].color;
    const panel = sec.querySelector(".zkf-deckcard") as HTMLElement;
    panel.style.setProperty("--fc", fc);
    panel.innerHTML = `
      <div class="zkf-dhead"><span class="zkf-face big" data-pic></span><span><small class="zkf-pool">${factionName(d.pool)} · ${d.custom ? T("Yours", "自建") : T("Starter", "初始")}</small><b class="zkf-dname-big">${esc(d.name)}</b></span></div>
      <div class="zkf-power"><img src="${coinUrl(p.cost, 64)}" alt="" /><span><b>${esc(T(p.name, p.zh))}</b><small>${esc(T(p.text, p.textZh))}</small></span></div>
      <div class="zkf-stats">
        <span><b>${d.cards.length}</b><small>${T("Cards", "卡牌")}</small></span>
        <span><b>${legs}</b><small>${T("Legendary", "传说")}</small></span>
        <span><b>${snarks}</b><small>zkSNARKs</small></span>
        <span><b>${avg.toFixed(1)}</b><small>${T("Avg cost", "平均费用")}</small></span>
      </div>
      ${curve(d.cards)}
      ${d.ok ? "" : `<p class="zkf-warn">${esc(d.why)}</p>`}
      <div class="zkf-row"><button class="zkf-btn" data-do="edit" type="button">${d.custom ? T("Edit deck", "编辑套牌") : T("Make my version", "复制并修改")}</button></div>`;
    panel.querySelector("[data-pic]")!.appendChild(snarkCanvas(champion(d)));
    panel.querySelector("[data-do=edit]")!.addEventListener("click", () => {
      this.go("coll");
      if (d.custom) {
        const sd = P.allDecks().find((x) => `deck:${x.id}` === d.key);
        if (sd) this.edit(sd);
      } else this.edit({ id: `d${Date.now().toString(36)}`, name: `${d.name} +`, pool: d.pool, cards: d.cards.slice() }, true);
    });
    (sec.querySelector(".zkf-go") as HTMLButtonElement).disabled = !d.ok;
  }

  private duel() {
    const d = this.decks[this.deckAt];
    if (!d || !d.ok || !this.ctx) return sfx(this.snd, "error");
    try {
      localStorage.setItem("street.legends.last", d.key);
    } catch {
      /* private mode */
    }
    ensureCards(d.cards.filter(isSnarkCard));
    sfx(this.snd, "coin");
    const ctx = this.ctx;
    const fade = this.root.querySelector(".zkf-fade") as HTMLElement;
    this.root.classList.add("out");
    fade.addEventListener(
      "transitionend",
      () => {
        this.close();
        ctx.onDuel(d.cards.slice(), d.pool, d.name);
      },
      { once: true },
    );
    // (no transition: go at once)
    setTimeout(() => {
      if (!this.closed) {
        this.close();
        ctx.onDuel(d.cards.slice(), d.pool, d.name);
      }
    }, 600);
  }

  // ---- the Arena: a draft, then duels to 12 wins or 3 losses -------------------------------------------------------

  private arena() {
    if (!snarksReady()) void loadSnarks().then(() => !this.closed && this.mode === "arena" && this.arena()).catch(() => {});
    const sec = this.root.querySelector(".zkf-arena") as HTMLElement;
    const r = A.arenaLoad();
    const wire = () => wireBack(sec, () => this.settled() && this.go("menu"));
    // no run (or the last one is over): the door
    if (!r || r.done) {
      const free = A.arenaFree();
      sec.innerHTML = `${head(T("Arena", "竞技场"))}
        <div class="zkf-door zkf-plate">
          <h3 class="zkf-title">${T("The Arena", "竞技场")}</h3>
          <p>${T("Draft a deck one card at a time, three on offer each pick. Duel with it until 12 wins or 3 losses: the further you go, the bigger the prize.", "一张一张选牌组成套牌，每次三选一。用它对决，直到 12 胜或 3 负：走得越远，奖励越大。")}</p>
          <div class="zkf-stats two">
            <span><b>${free ? T("Free", "免费") : fmt(A.ARENA_PRICE)}</b><small>${free ? T("First run", "首次") : T("Gold to enter", "入场金币")}</small></span>
            <span><b>12</b><small>${T("Wins for the top prize", "胜场拿头奖")}</small></span>
          </div>
          ${r?.prize?.length ? `<div class="zkf-prize"><small class="zkf-lab">${T("Last run", "上一轮")} · ${r.wins} ${T("wins", "胜")}</small>${r.prize.map((x) => `<b>${esc(x)}</b>`).join("")}</div>` : ""}
          <button class="zkf-btn gold zkf-arena-go" type="button">${T("Start a run", "开始")}${free ? "" : `<small><img src="${coinUrl("", 40)}" alt="" />${A.ARENA_PRICE}</small>`}</button>
        </div>`;
      wire();
      sec.querySelector(".zkf-arena-go")!.addEventListener("click", () => {
        if (!this.settled()) return;
        if (r?.done) A.arenaClear();
        const run = A.arenaStart();
        if (!run) {
          sfx(this.snd, "error");
          return this.toast(T("Not enough gold.", "金币不足。"));
        }
        sfx(this.snd, "coin");
        this.arena();
      });
      return;
    }
    // choosing the pool
    if (!r.pool) {
      sec.innerHTML = `${head(T("Arena · choose a pool", "竞技场 · 选择池"))}<div class="zkf-heroes three">${r.heroes.map((p, i) => heroCol(p, i + 1)).join("")}</div>`;
      wire();
      fillFaces(sec);
      for (const b of sec.querySelectorAll<HTMLElement>(".zkf-hero")) b.addEventListener("click", () => this.settled() && this.arenaKey(Number(b.dataset.i) - 1));
      return;
    }
    // drafting
    if (r.offer && r.deck.length < 30) {
      sec.innerHTML = `${head(T("Arena · draft", "竞技场 · 选牌"), `<span class="zkf-count"><b>${r.deck.length + 1}</b> / 30</span>`)}
        <div class="zkf-offer"></div>
        <aside class="zkf-side zkf-plate">${this.deckSide(r.deck, r.pool)}</aside>`;
      wire();
      fillFaces(sec);
      fillArt(sec);
      const box = sec.querySelector(".zkf-offer") as HTMLElement;
      r.offer.forEach((id, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `zkf-pick r-${card(id).rarity}`;
        b.appendChild(cardEl(id));
        if (!TOUCH) b.insertAdjacentHTML("beforeend", `<kbd>${i + 1}</kbd>`);
        b.addEventListener("click", () => this.settled() && this.arenaKey(i));
        box.appendChild(b);
      });
      return;
    }
    // the run: the record, the deck, duel
    const pips = Array.from({ length: A.ARENA_WINS }, (_, i) => `<i class="${i < r.wins ? "on" : ""}"></i>`).join("");
    const xs = Array.from({ length: A.ARENA_LOSSES }, (_, i) => `<i class="${i < r.losses ? "on" : ""}"></i>`).join("");
    sec.innerHTML = `${head(T("Arena · your run", "竞技场 · 你的这一轮"))}
      <div class="zkf-run zkf-plate">
        <span class="zkf-face big" data-face="${champArt(r.pool)}" style="--fc:${FACTION_INFO[r.pool].color}"></span>
        <div class="zkf-wins"><b>${r.wins}</b><small>${T("Wins", "胜")}</small></div>
        <div class="zkf-pips">${pips}</div>
        <div class="zkf-xs"><small class="zkf-lab">${T("Losses", "负")}</small>${xs}</div>
        <button class="zkf-btn zkf-arena-retire" type="button">${T("Retire and collect", "退出并领奖")}</button>
      </div>
      <aside class="zkf-side zkf-plate">${this.deckSide(r.deck, r.pool)}</aside>
      <button class="zkf-btn gold zkf-go zkf-arena-duel" type="button">${T("Duel", "开始对决")}</button>`;
    wire();
    fillFaces(sec);
    fillArt(sec);
    sec.querySelector(".zkf-arena-duel")!.addEventListener("click", () => this.settled() && this.arenaDuel());
    sec.querySelector(".zkf-arena-retire")!.addEventListener("click", (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      if (!b.dataset.sure) {
        b.dataset.sure = "1";
        b.textContent = T("Sure? Click again", "确定？再点一次");
        return;
      }
      A.arenaRetire();
      sfx(this.snd, "coin");
      this.arena();
    });
  }

  /** A deck as the side panel shows it: its pool, count, curve and strips (read-only). */
  private deckSide(deck: string[], pool: Pool) {
    return `<div class="zkf-sidehead" style="--fc:${FACTION_INFO[pool].color}"><span class="zkf-face" data-face="${champArt(pool)}"></span><span><small class="zkf-pool">${factionName(pool)}</small><b>${T("Your draft", "你的套牌")}</b></span><em class="zkf-n ${deck.length === DECK_SIZE ? "full" : ""}"><b>${deck.length}</b>/${DECK_SIZE}</em></div>${curve(deck)}<div class="zkf-strips">${strips(deck)}</div>`;
  }

  private arenaKey(i: number) {
    const r = A.arenaLoad();
    if (!r || r.done) return;
    if (!r.pool) {
      const p = r.heroes[i];
      if (!p) return;
      A.arenaPickPool(r, p);
      sfx(this.snd, "ui", "click");
      return this.arena();
    }
    if (r.offer && r.offer[i]) {
      const id = r.offer[i];
      A.arenaPick(r, i);
      const rar = card(id).rarity;
      if (this.snd && rar !== "common" && rar !== "basic") this.snd.flip(rar);
      else sfx(this.snd, "ui", "click");
      this.arena();
    }
  }

  private arenaDuel() {
    const r = A.arenaLoad();
    if (!A.arenaReady(r) || !r || !r.pool || !this.ctx) return;
    ensureCards(r.deck);
    sfx(this.snd, "coin");
    const ctx = this.ctx;
    this.close();
    ctx.onDuel(r.deck.slice(), r.pool, "Arena");
  }

  // ---- the collection: a book -------------------------------------------------------------------------------------

  private collection() {
    const sec = this.root.querySelector(".zkf-coll") as HTMLElement;
    this.book?.dispose();
    this.book = null;
    const tabs: (Faction | "")[] = ["", ...FACTIONS, "neutral"];
    sec.innerHTML = `
      ${head(T("Collection", "收藏"))}
      <nav class="zkf-tabs">${tabs
        .map((f) => `<button class="zkf-tab" type="button" data-pool="${f}" style="--fc:${f ? FACTION_INFO[f].color : "#f4b728"}">${f ? `<span class="zkf-tabic" data-face="${champArt(f)}"></span>` : ""}<b>${f ? factionName(f) : T("All", "全部")}</b></button>`)
        .join("")}</nav>
      <div class="zkf-ctools">
        <div class="zkf-seg" data-f="set"><button type="button" data-v="snarks">zkSNARKs</button><button type="button" data-v="classics">${T("Classics", "经典")}</button></div>
        <button class="zkf-check" type="button" data-f="owned"><i></i>${T("Owned", "已拥有")}</button>
        <button class="zkf-btn small" type="button" data-do="filters">${T("Filters", "筛选")}<i class="zkf-caret"></i></button>
        <label class="zkf-searchbox"><i></i><input class="zkf-search" placeholder="${T("Search: #4071, a trait, a word", "搜索：#4071、特征、关键词")}" value="${esc(this.words)}" /></label>
      </div>
      <div class="zkf-bookbox"><p class="zkf-empty"></p></div>
      <footer class="zkf-cfoot">
        <span class="zkf-pageno"></span>
        <div class="zkf-mana">${[0, 1, 2, 3, 4, 5, 6, 7].map((c) => `<button class="zkf-coin-f" type="button" data-v="${c}"><img src="${coinUrl(c === 7 ? "7+" : c, 72)}" alt="${c}" /></button>`).join("")}</div>
        <span class="zkf-count"></span>
      </footer>
      <aside class="zkf-side zkf-plate"></aside>`;
    fillFaces(sec);
    wireBack(sec, () => this.settled() && this.back());
    const search = sec.querySelector(".zkf-search") as HTMLInputElement;
    let tm: ReturnType<typeof setTimeout> | undefined;
    search.addEventListener("input", () => {
      clearTimeout(tm);
      tm = setTimeout(() => {
        this.words = search.value;
        this.fill();
      }, 160);
    });
    sec.querySelector(".zkf-tabs")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pool]");
      if (!b || this.editing) return;
      sfx(this.snd, "ui", "click");
      this.pool = b.dataset.pool as Faction | "";
      this.fill();
    });
    sec.querySelector('[data-f="set"]')!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
      if (!b) return;
      sfx(this.snd, "ui", "click");
      this.set = b.dataset.v as typeof this.set;
      this.fill();
    });
    sec.querySelector('[data-f="owned"]')!.addEventListener("click", () => {
      sfx(this.snd, "ui", "click");
      this.only = !this.only;
      this.fill();
    });
    sec.querySelector(".zkf-mana")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
      if (!b) return;
      sfx(this.snd, "ui", "click");
      const v = Number(b.dataset.v);
      this.cost = this.cost === v ? -1 : v;
      this.fill();
    });
    sec.querySelector("[data-do=filters]")!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!this.closeDrop()) this.openDrop(e.currentTarget as HTMLElement);
    });
    const box = sec.querySelector(".zkf-bookbox") as HTMLElement;
    this.book = new CardBook({
      decorate: (t, id) => this.decorate(t, id),
      pick: (id, t, e) => {
        if (this.editing && !(e as MouseEvent).shiftKey) return this.addCard(id, t);
        this.showDetail(id);
      },
      context: (id) => {
        if (this.editing) this.removeCard(id) || this.showDetail(id);
        else this.showDetail(id);
      },
      paged: (p, n, turned) => {
        const el = sec.querySelector(".zkf-pageno") as HTMLElement | null;
        if (el) el.innerHTML = this.book?.count ? `${T("Page", "第")} <b>${fmt(p + 1)}</b> / ${fmt(n)}` : "";
        if (turned) sfx(this.snd, "draw");
      },
    });
    box.appendChild(this.book.el);
    this.fill();
    this.side();
  }

  /** The filters that don't have a place of their own: rarity, tribe, sort. */
  private openDrop(btn: HTMLElement) {
    const sec = this.root.querySelector(".zkf-coll") as HTMLElement;
    const d = document.createElement("div");
    d.className = "zkf-drop zkf-plate";
    const r = btn.getBoundingClientRect(),
      s = sec.getBoundingClientRect();
    d.style.top = `${r.bottom - s.top + 8}px`;
    d.style.left = `${Math.max(12, Math.min(r.left - s.left, s.width - 380))}px`;
    const draw = () => {
      d.innerHTML = `
        <h4 class="zkf-lab">${T("Rarity", "稀有度")}</h4>
        <div class="zkf-opts" data-f="tier">${TIERS.map((t) => `<button type="button" data-v="${t}" class="${this.tier === t ? "on" : ""}" style="--c:${TIER_COLOR[t]}"><img src="${gemUrl(t, 40)}" alt="" />${rarityName(t)}</button>`).join("")}</div>
        <h4 class="zkf-lab">${T("Tribe", "种族")}</h4>
        <div class="zkf-opts" data-f="tribe">${TRIBES.map((t) => `<button type="button" data-v="${t}" class="${this.tribe === t ? "on" : ""}">${T(t, TRIBE_ZH[t] ?? t)}</button>`).join("")}</div>
        <h4 class="zkf-lab">${T("Order", "排序")}</h4>
        <div class="zkf-opts" data-f="sort">${(
          [
            ["rank", T("Rarest first", "最稀有")],
            ["cost", T("Cost", "费用")],
            ["number", T("Number", "编号")],
          ] as const
        )
          .map(([v, l]) => `<button type="button" data-v="${v}" class="${this.sort === v ? "on" : ""}">${l}</button>`)
          .join("")}</div>
        <div class="zkf-row end"><button class="zkf-btn small" type="button" data-do="clear">${T("Clear all", "清除")}</button></div>`;
    };
    draw();
    d.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest<HTMLElement>("button");
      if (!b) return;
      sfx(this.snd, "ui", "click");
      if (b.dataset.do === "clear") {
        this.tier = "";
        this.tribe = "";
        this.sort = "rank";
        this.cost = -1;
        this.only = false;
        if (!this.editing) this.pool = "";
      } else {
        const f = b.parentElement?.dataset.f;
        const v = b.dataset.v!;
        if (f === "tier") this.tier = this.tier === v ? "" : (v as Rarity);
        else if (f === "tribe") this.tribe = this.tribe === v ? "" : v;
        else if (f === "sort") this.sort = v as typeof this.sort;
      }
      draw();
      this.fill();
    });
    sec.appendChild(d);
    btn.classList.add("on");
    const away = (e: Event) => {
      if (!d.contains(e.target as Node)) this.closeDrop();
    };
    setTimeout(() => window.addEventListener("pointerdown", away, true));
    (d as HTMLElement & { off?: () => void }).off = () => window.removeEventListener("pointerdown", away, true);
  }
  private closeDrop(): boolean {
    const d = this.root.querySelector(".zkf-drop") as (HTMLElement & { off?: () => void }) | null;
    if (!d) return false;
    d.off?.();
    d.remove();
    this.root.querySelector("[data-do=filters]")?.classList.remove("on");
    return true;
  }

  /** The list the filters leave, sorted. */
  private shownIds(): string[] {
    const w = this.words.trim().toLowerCase();
    const num = /^#?\d{1,5}$/.test(w) ? Number(w.replace("#", "")) : 0;
    const editPool = this.editing?.pool;
    const owned = P.load().owned;
    if (this.set === "snarks") {
      if (!snarksReady()) return [];
      if (num) return num >= 1 && num <= SNARKS ? [snarkCardId(num)] : [];
      const needCard = this.cost >= 0 || this.sort === "cost" || !!w;
      if (needCard && !this.costsMade) {
        for (let id = 1; id <= SNARKS; id++) snarkCard(id);
        this.costsMade = true;
      }
      const out: { id: number; s: SnarkInfo; c: number }[] = [];
      for (let id = 1; id <= SNARKS; id++) {
        const cid = snarkCardId(id);
        if (this.only && !owned[cid]) continue;
        const s = snarkInfo(id);
        if (this.tier && s.tier !== this.tier) continue;
        if (this.pool && s.faction !== this.pool) continue;
        if (editPool && s.faction !== editPool && s.faction !== "neutral") continue;
        if (this.tribe && s.tribe !== this.tribe) continue;
        let c = 0;
        if (needCard) {
          const d = snarkCard(id);
          c = d.cost;
          if (this.cost >= 0 && (this.cost === 7 ? c < 7 : c !== this.cost)) continue;
          if (w) {
            const t = s.traits;
            const hay = `${d.name} ${d.text} ${t.Lineage} ${t.Head} ${t.Eyes} ${t.Skin} ${t.Accessory} ${s.tribe ?? ""} ${s.faction} ${s.tier} ${s.purged ? "purged" : ""} ${s.apparition ? "apparition" : ""}`.toLowerCase();
            if (!w.split(/\s+/).every((x) => hay.includes(x))) continue;
          }
        }
        out.push({ id, s, c });
      }
      const rk = (s: SnarkInfo) => (s.apparition ? 0 : s.rank || 99999);
      if (this.sort === "rank") out.sort((a, b) => rk(a.s) - rk(b.s) || a.id - b.id);
      else if (this.sort === "cost") out.sort((a, b) => a.c - b.c || rk(a.s) - rk(b.s));
      else out.sort((a, b) => a.id - b.id);
      // your own zkSNARK first
      const mine = P.mineId();
      const list = out.map((x) => snarkCardId(x.id));
      if (mine && !this.only && !this.tier && !this.pool && !w && this.cost < 0 && !this.tribe) {
        const i = list.indexOf(snarkCardId(mine));
        if (i > 0) list.unshift(...list.splice(i, 1));
      }
      return list;
    }
    return COLLECTIBLE.filter((d) => {
      if (this.only && !owned[d.id]) return false;
      if (this.tier && d.rarity !== this.tier) return false;
      if (this.pool && d.faction !== this.pool) return false;
      if (editPool && d.faction !== editPool && d.faction !== "neutral") return false;
      if (this.tribe && d.tribe !== this.tribe) return false;
      if (this.cost >= 0 && (this.cost === 7 ? d.cost < 7 : d.cost !== this.cost)) return false;
      if (w && !w.split(/\s+/).every((x) => `${d.name} ${d.zh} ${d.text} ${d.tribe ?? ""} ${d.faction} ${d.type}`.toLowerCase().includes(x))) return false;
      return true;
    })
      .sort((a, b) => (this.sort === "rank" ? TIER_RANK[a.rarity] - TIER_RANK[b.rarity] || a.cost - b.cost : this.sort === "cost" ? a.cost - b.cost || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)))
      .map((d) => d.id);
  }

  private fill(keepPage = false) {
    const sec = this.root.querySelector(".zkf-coll") as HTMLElement;
    if (!sec || !this.book) return;
    const cur = this.editing ? this.editing.pool : this.pool;
    sec.querySelectorAll<HTMLElement>(".zkf-tab").forEach((b) => {
      const f = b.dataset.pool as Faction | "";
      b.classList.toggle("on", f === cur);
      b.classList.toggle("off", !!this.editing && f !== this.editing.pool && f !== "neutral");
    });
    sec.querySelectorAll<HTMLElement>('[data-f="set"] button').forEach((b) => b.classList.toggle("on", b.dataset.v === this.set));
    sec.querySelector('[data-f="owned"]')!.classList.toggle("on", this.only);
    sec.querySelectorAll<HTMLElement>(".zkf-coin-f").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === this.cost));
    const nf = (this.tier ? 1 : 0) + (this.tribe ? 1 : 0) + (this.sort !== "rank" ? 1 : 0);
    const fb = sec.querySelector("[data-do=filters]") as HTMLElement;
    fb.innerHTML = `${T("Filters", "筛选")}${nf ? `<em>${nf}</em>` : ""}<i class="zkf-caret"></i>`;
    const loading = this.set === "snarks" && !snarksReady();
    const ids = loading ? [] : this.shownIds();
    this.book.set(ids, keepPage);
    const empty = sec.querySelector(".zkf-empty") as HTMLElement;
    empty.textContent = loading ? T("Loading the 10,000 zkSNARKs…", "正在载入一万张零知卡……") : ids.length ? "" : T("No card matches.", "没有符合条件的卡。");
    const c = P.completion();
    (sec.querySelector(".zkf-count") as HTMLElement).innerHTML =
      this.set === "snarks" ? T(`<b>${fmt(ids.length)}</b> cards · <b>${fmt(c.snarks)}</b> owned`, `<b>${fmt(ids.length)}</b> 张 · 已拥有 <b>${fmt(c.snarks)}</b>`) : T(`<b>${fmt(ids.length)}</b> cards · <b>${c.have}/${c.total}</b> owned`, `<b>${fmt(ids.length)}</b> 张 · 已拥有 <b>${c.have}/${c.total}</b>`);
  }

  private decorate(t: HTMLElement, id: string) {
    const n = P.owned(id);
    const foot = t.querySelector(".zkf-foot") as HTMLElement;
    const inDeck = this.editing ? this.editing.cards.filter((x) => x === id).length : 0;
    t.classList.toggle("missing", !n);
    t.classList.toggle("indeck", inDeck > 0 && inDeck >= Math.min(maxCopies(id), n));
    const mine = isSnarkCard(id) && snarkIdOf(id) === P.mineId();
    const fresh = P.load().fresh[id];
    const tags = `${mine ? `<i class="zkf-tag gold">${T("Yours", "你的")}</i>` : ""}${fresh ? `<i class="zkf-tag new">${T("New", "新")}</i>` : ""}`;
    const count = inDeck ? `<i class="zkf-tag ink">${T("In deck", "已入组")}${inDeck > 1 ? ` ×${inDeck}` : ""}</i>` : n > 1 ? `<i class="zkf-tag ink">×${n}</i>` : "";
    foot.innerHTML = tags + count;
  }

  // ---- a card, big ----

  private showDetail(id: string) {
    this.book?.select(id);
    sfx(this.snd, "ui", "click");
    if (P.load().fresh[id]) {
      P.seen(id);
      this.book?.refresh();
    }
    this.detailModal(id);
  }

  private sheetHtml(id: string): string {
    const d = card(id);
    const n = P.owned(id);
    const z = isSnarkCard(id);
    const s = z ? snarkInfo(snarkIdOf(id)) : null;
    const mine = z && snarkIdOf(id) === P.mineId();
    const kind = [s?.apparition ? T("Apparition", "显灵者") : "", s?.purged ? T("Purged", "已净化") : "", mine ? T("Yours", "你的") : ""].filter(Boolean);
    const rows: [string, string][] = s
      ? [
          [T("Rank", "排名"), s.rank ? `#${fmt(s.rank)}` : "—"],
          ...(["Lineage", "Head", "Eyes", "Skin", "Accessory"] as const).map((k): [string, string] => [k, s.traits[k]]),
          [T("Tribe", "种族"), s.tribe ?? "—"],
        ]
      : [
          [T("Type", "类型"), d.type[0].toUpperCase() + d.type.slice(1)],
          [T("Tribe", "种族"), d.tribe ?? "—"],
          [T("Cost", "费用"), `${d.cost} ZEC`],
        ];
    const craft = P.CRAFT[d.rarity],
      dis = P.DISENCHANT[d.rarity];
    const canC = P.canCraft(id),
      canD = P.canDisenchant(id);
    const tradeable = d.rarity !== "basic" && !d.token;
    return `
      <div class="zkf-big"></div>
      <div class="zkf-info">
        <small class="zkf-lab" style="color:${TIER_COLOR[d.rarity]}">${rarityName(d.rarity)} · <span style="color:${FACTION_INFO[d.faction].color}">${factionName(d.faction)}</span>${kind.length ? ` · ${kind.join(" · ")}` : ""}</small>
        <h3 class="zkf-title">${z ? `${esc(cardName(d))}<em>#${snarkIdOf(id)}</em>` : esc(cardName(d))}</h3>
        <dl class="zkf-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <p class="zkf-owned ${n ? "yes" : ""}">${n ? (z ? T("In your collection", "在你的收藏中") : T(`You own ${n} of ${maxCopies(id)}`, `已拥有 ${n} / ${maxCopies(id)}`)) : T("Not in your collection", "尚未拥有")}</p>
        <div class="zkf-row">
          ${tradeable ? `<button class="zkf-btn ${canC ? "gold" : ""}" type="button" data-act="craft" ${canC ? "" : "disabled"}>${T("Craft", "合成")}<small><img src="${gemUrl("rare", 32)}" alt="" />${fmt(craft)}</small></button>` : ""}
          ${tradeable ? `<button class="zkf-btn" type="button" data-act="dis" ${canD ? "" : "disabled"}>${T("Disenchant", "分解")}<small><img src="${gemUrl("rare", 32)}" alt="" />+${fmt(dis)}</small></button>` : ""}
          ${this.editing ? `<button class="zkf-btn gold" type="button" data-act="add">${T("Add to deck", "加入套牌")}</button>` : ""}
        </div>
      </div>`;
  }

  private wireSheet(host: HTMLElement, id: string) {
    const big = host.querySelector(".zkf-big") as HTMLElement;
    big.appendChild(cardEl(id));
    host.querySelector("[data-act=craft]")?.addEventListener("click", () => {
      if (P.craft(id)) {
        sfx(this.snd, "flip", card(id).rarity);
        this.toast(T(`${cardName(card(id))}: crafted`, `${cardName(card(id))}：合成成功`));
        this.refreshSheet(id);
      } else sfx(this.snd, "error");
    });
    host.querySelector("[data-act=dis]")?.addEventListener("click", () => {
      if (P.disenchant(id)) {
        sfx(this.snd, "coin");
        this.refreshSheet(id);
      } else sfx(this.snd, "error");
    });
    host.querySelector("[data-act=add]")?.addEventListener("click", () => {
      this.addCard(id);
      this.closeModal();
    });
  }
  private refreshSheet(id: string) {
    this.book?.refresh();
    this.fill(true);
    this.detailModal(id);
  }

  private detailModal(id: string) {
    const m = this.modalOpen(`<button class="zkf-x" type="button" aria-label="${T("Close", "关闭")}"></button><div class="zkf-sheet">${this.sheetHtml(id)}</div>`, "sheet");
    this.wireSheet(m, id);
  }

  /** The right page: your decks, or the deck being built. */
  private side() {
    const side = this.root.querySelector(".zkf-coll .zkf-side") as HTMLElement | null;
    if (!side) return;
    if (this.editing) return this.deckPanel(side);
    const decks = P.allDecks();
    side.innerHTML = `<h3 class="zkf-lab">${T("My decks", "我的套牌")}<small>${decks.length}/9</small></h3><div class="zkf-decklist"></div>`;
    const list = side.querySelector(".zkf-decklist") as HTMLElement;
    for (const d of decks) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "zkf-deckrow";
      b.style.setProperty("--fc", FACTION_INFO[d.pool].color);
      const why = deckWhy(d);
      b.innerHTML = `<span class="zkf-face" data-pic></span><span><b>${esc(d.name)}</b><small>${factionName(d.pool)}${why ? ` · <em>${esc(why)}</em>` : ""}</small></span>`;
      b.querySelector("[data-pic]")!.appendChild(snarkCanvas(champion({ key: `deck:${d.id}`, name: d.name, pool: d.pool, cards: d.cards, custom: true, ok: true, why: "" })));
      b.addEventListener("click", () => this.edit(d));
      list.appendChild(b);
    }
    if (decks.length < 9) {
      const nb = document.createElement("button");
      nb.type = "button";
      nb.className = "zkf-deckrow new";
      nb.innerHTML = `<span class="zkf-face"><i></i></span><span><b>${T("New deck", "新套牌")}</b></span>`;
      nb.addEventListener("click", () => this.newDeck());
      list.appendChild(nb);
    }
  }

  // ---- decks ----

  private newDeck() {
    if (P.allDecks().length >= 9) return this.toast(T("Nine decks at most: delete one first.", "最多九副套牌：请先删除一副。"));
    const m = this.modalOpen(
      `<button class="zkf-x" type="button" aria-label="${T("Close", "关闭")}"></button>
       <h3 class="zkf-lab big">${T("Choose a pool", "选择池")}</h3>
       <div class="zkf-heroes">${FACTIONS.map((p) => heroCol(p)).join("")}</div>`,
      "pools",
    );
    fillFaces(m);
    m.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pool]");
      if (!b) return;
      const pool = b.dataset.pool as Pool;
      sfx(this.snd, "ui", "click");
      this.closeModal();
      const n = P.allDecks().filter((d) => d.pool === pool).length + 1;
      this.edit({ id: `d${Date.now().toString(36)}`, name: `${T(FACTION_INFO[pool].name, FACTION_INFO[pool].zh)} ${n}`, pool, cards: [] }, true);
    });
  }

  private edit(d: SavedDeck, fresh = false) {
    this.editing = { ...d, cards: d.cards.slice() };
    this.dirty = fresh && d.cards.length > 0;
    if (this.mode !== "coll") this.go("coll");
    this.pool = "";
    this.root.classList.add("editing");
    this.fill();
    this.side();
  }

  /** Done (or Esc): keep what changed, then back to the book. */
  private doneEdit() {
    const d = this.editing;
    if (d && this.dirty && d.cards.length) {
      const list = P.allDecks();
      const had = list.some((x) => x.id === d.id);
      if (!had && list.length >= 9) this.toast(T("Nine decks at most: not saved.", "最多九副套牌：未保存。"));
      else {
        saveDecks([...list.filter((x) => x.id !== d.id), { ...d, cards: d.cards.slice() }]);
        this.lastSaved = { ...d };
        sfx(this.snd, "coin");
        this.toast(d.cards.length === DECK_SIZE ? T(`${d.name}: saved`, `${d.name}：已保存`) : T(`${d.name}: saved, ${d.cards.length}/${DECK_SIZE}`, `${d.name}：已保存，${d.cards.length}/${DECK_SIZE}`));
      }
    }
    this.stopEdit();
  }

  private stopEdit() {
    this.editing = null;
    this.dirty = false;
    this.root.classList.remove("editing");
    if (this.onlyBuilder) {
      this.close();
      return this.builderDone?.(this.lastSaved);
    }
    this.fill(true);
    this.side();
  }

  private addCard(id: string, tile?: HTMLElement) {
    const d = this.editing;
    if (!d) return;
    const c = card(id);
    const n = d.cards.filter((x) => x === id).length;
    let why = "";
    if (d.cards.length >= DECK_SIZE) why = T("The deck is full (30).", "套牌已满（30 张）。");
    else if (c.faction !== "neutral" && c.faction !== d.pool) why = T(`Not a ${factionName(d.pool)} card.`, `不是${factionName(d.pool)}的卡。`);
    else if (n >= maxCopies(id)) why = isSnarkCard(id) ? T("Every zkSNARK is one of a kind.", "每个零知证明者独一无二。") : T("No more copies of it.", "已达上限。");
    else if (n >= P.owned(id)) why = T("You don't own it: right click to craft it.", "你还没有这张卡：右键合成。");
    if (why) {
      sfx(this.snd, "error");
      this.toast(why);
      return;
    }
    d.cards.push(id);
    this.dirty = true;
    sfx(this.snd, "pick");
    tile?.querySelector(".zkl-card")?.animate([{ transform: "scale(1)" }, { transform: "scale(0.93)" }, { transform: "scale(1)" }], { duration: 180 });
    this.book?.refresh();
    this.side();
    this.root.querySelector(`.zkf-coll .zkf-strip[data-rm="${id}"]`)?.animate([{ background: "#5a4310" }, { background: "" }], { duration: 500 });
  }

  private removeCard(id: string): boolean {
    const d = this.editing;
    if (!d) return false;
    const i = d.cards.indexOf(id);
    if (i < 0) return false;
    d.cards.splice(i, 1);
    this.dirty = true;
    sfx(this.snd, "draw");
    this.book?.refresh();
    this.side();
    return true;
  }

  private deckPanel(side: HTMLElement) {
    const d = this.editing!;
    const full = d.cards.length === DECK_SIZE;
    side.innerHTML = `
      <div class="zkf-sidehead" style="--fc:${FACTION_INFO[d.pool].color}"><span class="zkf-face" data-face="${champArt(d.pool)}"></span><span><small class="zkf-pool">${factionName(d.pool)}</small><input class="zkf-dname" maxlength="28" value="${esc(d.name)}" aria-label="${T("Deck name", "套牌名称")}" /></span><em class="zkf-n ${full ? "full" : ""}"><b>${d.cards.length}</b>/${DECK_SIZE}</em></div>
      ${curve(d.cards)}
      <div class="zkf-strips edit">${d.cards.length ? strips(d.cards) : `<p class="zkf-none">${T("Click cards in the book to add them.", "点击卡册中的卡牌加入套牌。")}</p>`}</div>
      <div class="zkf-row">
        <button class="zkf-btn small" type="button" data-do="fill">${T("Fill", "补全")}</button>
        <button class="zkf-btn small" type="button" data-do="del">${T("Delete", "删除")}</button>
        <button class="zkf-btn gold" type="button" data-do="done">${T("Done", "完成")}</button>
      </div>`;
    fillFaces(side);
    fillArt(side);
    const nameIn = side.querySelector(".zkf-dname") as HTMLInputElement;
    nameIn.addEventListener("input", () => {
      d.name = nameIn.value.trim() || d.name;
      this.dirty = true;
    });
    side.querySelector(".zkf-strips")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-rm]");
      if (b) this.removeCard(b.dataset.rm!);
    });
    side.querySelector(".zkf-strips")!.addEventListener("contextmenu", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-rm]");
      if (!b) return;
      e.preventDefault();
      this.showDetail(b.dataset.rm!);
    });
    side.querySelector("[data-do=fill]")!.addEventListener("click", () => {
      // the pool's starter cards you own first, then your best owned cards of the pool and the neutrals
      const own = P.load().owned;
      const can = (id: string) => d.cards.filter((x) => x === id).length < Math.min(maxCopies(id), own[id] ?? 0);
      for (const id of STARTERS[d.pool]) if (d.cards.length < DECK_SIZE && can(id)) d.cards.push(id);
      const mine = Object.keys(own)
        .filter((id) => own[id] > 0)
        .map((id) => {
          if (isSnarkCard(id)) ensureCards([id]);
          return card(id);
        })
        .filter((c) => c.faction === d.pool || c.faction === "neutral")
        .sort((a, b) => TIER_RANK[a.rarity] - TIER_RANK[b.rarity]);
      for (const c of mine) while (d.cards.length < DECK_SIZE && can(c.id)) d.cards.push(c.id);
      this.dirty = true;
      sfx(this.snd, "pick");
      this.book?.refresh();
      this.side();
    });
    side.querySelector("[data-do=del]")!.addEventListener("click", (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      if (!b.dataset.sure) {
        b.dataset.sure = "1";
        b.textContent = T("Sure?", "确定？");
        b.classList.add("bad");
        return;
      }
      saveDecks(P.allDecks().filter((x) => x.id !== d.id));
      this.stopEdit();
    });
    side.querySelector("[data-do=done]")!.addEventListener("click", () => this.doneEdit());
  }

  // ---- packs ------------------------------------------------------------------------------------------------------

  private packs() {
    const sec = this.root.querySelector(".zkf-packs") as HTMLElement;
    sec.innerHTML = `
      ${head(T("Packs", "卡包"))}
      <div class="zkf-pstage"><div class="zkf-pile"></div><p class="zkf-phint"></p></div>
      <div class="zkf-packbar zkf-plate">
        <span class="zkf-left"><b data-left></b><small>${T("Packs to open", "待开卡包")}</small></span>
        <button class="zkf-btn" type="button" data-do="buy">${T("Buy", "购买")}<small><img src="${coinUrl("", 40)}" alt="" />${P.PACK_PRICE}</small></button>
        <button class="zkf-btn gold" type="button" data-do="open">${T("Open", "开包")}</button>
        <button class="zkf-q" type="button" data-do="odds" aria-label="${T("What's inside", "卡包内容")}">?</button>
      </div>`;
    wireBack(sec, () => this.settled() && this.back());
    sec.querySelector("[data-do=buy]")!.addEventListener("click", () => {
      if (!P.buyPack()) {
        sfx(this.snd, "error");
        return this.toast(T("Not enough gold: win duels to earn more.", "金币不足：赢下对决来赚取。"));
      }
      sfx(this.snd, "coin");
      this.pile();
    });
    sec.querySelector("[data-do=open]")!.addEventListener("click", () => this.settled() && this.packKey());
    sec.querySelector("[data-do=odds]")!.addEventListener("click", (e) => {
      const old = sec.querySelector(".zkf-odds");
      if (old) return old.remove();
      const o = document.createElement("div");
      o.className = "zkf-odds zkf-plate";
      o.innerHTML = `<h4 class="zkf-lab">${T("In a pack", "每包")}</h4><dl class="zkf-facts">
        <div><dt>${T("Cards", "卡牌")}</dt><dd>${T("5, mostly zkSNARKs", "5 张，以零知卡为主")}</dd></div>
        <div><dt style="color:${TIER_COLOR.rare}">${rarityName("rare")}</dt><dd>${T("1 or more", "至少 1 张")}</dd></div>
        <div><dt style="color:${TIER_COLOR.epic}">${rarityName("epic")}</dt><dd>${T("1 pack in 4", "约每 4 包 1 张")}</dd></div>
        <div><dt style="color:${TIER_COLOR.legendary}">${rarityName("legendary")}</dt><dd>${T("1 pack in 20, sure within 30", "约每 20 包 1 张，30 包内必出")}</dd></div>
        <div><dt>${T("Doubles", "重复卡")}</dt><dd>${T("Become zats", "转为 zat")}</dd></div></dl>`;
      (e.currentTarget as HTMLElement).parentElement!.appendChild(o);
    });
    this.pile();
  }

  private pile() {
    const sec = this.root.querySelector(".zkf-packs") as HTMLElement;
    const n = P.load().packs;
    const pile = sec.querySelector(".zkf-pile") as HTMLElement;
    pile.replaceChildren();
    for (let i = 0; i < Math.min(n, 6); i++) {
      const p = packImg();
      p.style.setProperty("--i", String(i));
      pile.appendChild(p);
    }
    (sec.querySelector("[data-left]") as HTMLElement).textContent = String(n);
    (sec.querySelector(".zkf-phint") as HTMLElement).textContent = n ? "" : T("No pack left: buy one, or win duels.", "没有卡包了：购买，或赢下对决。");
    (sec.querySelector("[data-do=open]") as HTMLButtonElement).disabled = !n;
    (pile.lastElementChild as HTMLElement | null)?.addEventListener("click", () => this.packKey());
  }

  private opening: { flips: HTMLElement[]; done: HTMLElement } | null = null;
  private busyPack = false;
  /** Enter on the packs screen: open one, or turn the next card, or collect. */
  private packKey() {
    if (this.busyPack) return;
    if (this.opening) {
      const next = this.opening.flips.find((f) => !f.classList.contains("open"));
      if (next) next.click();
      else this.opening.done.click();
      return;
    }
    void this.openPack();
  }

  private async openPack() {
    const cards = P.openPack();
    if (!cards) return sfx(this.snd, "error");
    this.busyPack = true;
    const sec = this.root.querySelector(".zkf-packs") as HTMLElement;
    sec.querySelector(".zkf-odds")?.remove();
    sec.classList.add("opening");
    const stage = sec.querySelector(".zkf-pstage") as HTMLElement;
    const pile = sec.querySelector(".zkf-pile") as HTMLElement;
    const top = pile.lastElementChild as HTMLElement | null;
    const sr = stage.getBoundingClientRect();
    const from = top?.getBoundingClientRect() ?? sr;
    top?.remove();
    const pack = packImg();
    pack.classList.add("fly");
    stage.appendChild(pack);
    const cx = sr.width / 2,
      cy = sr.height * 0.46;
    const pw = Math.min(220, sr.height * 0.42);
    pack.style.width = `${pw}px`;
    sfx(this.snd, "pick");
    await pack.animate(
      [
        { transform: `translate(${from.left - sr.left}px, ${from.top - sr.top}px) scale(0.6)` },
        { transform: `translate(${cx - pw / 2}px, ${cy - pw * 0.7 - 30}px) scale(1.08) rotate(-3deg)`, offset: 0.7 },
        { transform: `translate(${cx - pw / 2}px, ${cy - pw * 0.7}px) scale(1)` },
      ],
      { duration: 600, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" },
    ).finished;
    sfx(this.snd, "land", true);
    await pack.animate(
      [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ transform: `translate(${cx - pw / 2 + (k % 2 ? 4 : -4) * (k / 4)}px, ${cy - pw * 0.7}px) scale(${1 + k * 0.015}) rotate(${(k % 2 ? 1.5 : -1.5) * (k / 3)}deg)` })),
      { duration: 620, fill: "forwards" },
    ).finished;
    sfx(this.snd, "packOpen");
    const flash = document.createElement("div");
    flash.className = "zkf-flash";
    stage.appendChild(flash);
    flash.animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.12 }, { opacity: 0 }], { duration: 700 }).onfinish = () => flash.remove();
    this.burst(stage, cx, cy, "#ffd76a", 40);
    pack.remove();
    const W = sr.width,
      H = sr.height;
    // a phone held upright: three cards over two
    const narrow = W < 600;
    const cw = narrow ? Math.max(84, Math.min(150, (W - 30) / 3.25, H / 3.6)) : Math.max(100, Math.min(210, W / 5.8, H / 2.3));
    let left = cards.length;
    const done = document.createElement("button");
    done.type = "button";
    done.className = "zkf-btn gold zkf-done";
    done.textContent = T("Collect", "收下");
    done.style.display = "none";
    const flips: HTMLElement[] = [];
    cards.forEach((c, i) => {
      const d = card(c.id);
      const z = isSnarkCard(c.id) ? snarkInfo(snarkIdOf(c.id)) : null;
      const f = document.createElement("div");
      f.className = `zkf-flip r-${d.rarity}`;
      f.style.setProperty("--w", `${cw}px`);
      f.innerHTML = `<div class="inner"><div class="face back"><img src="${backUrl()}" alt="" draggable="false"/></div><div class="face front"></div></div><div class="zkf-ray"></div>`;
      f.querySelector(".front")!.appendChild(cardEl(c.id));
      const row = narrow && i >= 3 ? 1 : 0;
      const col = narrow ? (row ? i - 3 - 0.5 : i - 1) : i - 2;
      const x = cx + col * cw * 1.1 - cw / 2,
        y = narrow ? cy - cw * 1.5 + row * cw * 1.66 : cy - cw * 0.76 + (Math.abs(i - 2) === 2 ? 14 : Math.abs(i - 2) === 1 ? 4 : 0);
      f.style.left = `${x}px`;
      f.style.top = `${y}px`;
      stage.appendChild(f);
      flips.push(f);
      f.animate([{ transform: `translate(${cx - x - cw / 2}px, ${cy - y - cw * 0.7}px) scale(0.2)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 480, delay: i * 70, easing: "cubic-bezier(.2,.9,.3,1.15)", fill: "backwards" });
      f.addEventListener("click", () => {
        if (f.classList.contains("open")) return;
        f.classList.add("open");
        left--;
        sfx(this.snd, "flip", d.rarity);
        const fr = f.getBoundingClientRect(),
          s2 = stage.getBoundingClientRect();
        const px = fr.left - s2.left + fr.width / 2,
          py = fr.top - s2.top + fr.height / 2;
        if (d.rarity === "legendary") {
          this.root.animate([{ transform: "translate(0,0)" }, { transform: "translate(-7px,3px)" }, { transform: "translate(6px,-3px)" }, { transform: "translate(-3px,2px)" }, { transform: "translate(0,0)" }], { duration: 420 });
          this.burst(stage, px, py, "#ffb02e", 40);
        } else if (d.rarity === "epic") this.burst(stage, px, py, "#b07bff", 22);
        else if (d.rarity === "rare") this.burst(stage, px, py, "#3fa8ff", 12);
        const tag = document.createElement("div");
        tag.className = "zkf-pulled";
        tag.style.setProperty("--c", TIER_COLOR[d.rarity]);
        const sub = [z?.rank ? `#${fmt(z.rank)}` : "", z?.apparition ? T("Apparition", "显灵者") : "", z?.purged ? T("Purged", "已净化") : ""].filter(Boolean).join(" · ");
        tag.innerHTML = `<b>${rarityName(d.rarity)}</b>${sub ? `<span>${sub}</span>` : ""}${c.zats ? `<i class="zkf-tag ink">+${c.zats} zats</i>` : c.isNew ? `<i class="zkf-tag new">${T("New", "新")}</i>` : ""}`;
        f.appendChild(tag);
        if (!left) {
          done.style.display = "";
          done.animate([{ opacity: 0, transform: "translate(-50%, 10px)" }, { opacity: 1, transform: "translate(-50%, 0)" }], { duration: 260, fill: "forwards" });
        }
      });
    });
    stage.appendChild(done);
    done.addEventListener("click", () => {
      for (const f of flips) f.remove();
      done.remove();
      this.opening = null;
      sec.classList.remove("opening");
      this.pile();
      this.wallet();
    });
    this.opening = { flips, done };
    this.busyPack = false;
  }

  private burst(host: HTMLElement, x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const d = document.createElement("i");
      d.className = "zkf-px";
      const s = 4 + Math.random() * 7;
      d.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${Math.random() < 0.3 ? "#fff" : color}`;
      host.appendChild(d);
      const a = Math.random() * Math.PI * 2,
        r = 60 + Math.random() * 200;
      d.animate(
        [
          { transform: "translate(-50%,-50%)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r + 40}px)) rotate(${Math.random() * 180}deg)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
      ).onfinish = () => d.remove();
    }
  }

  // ---- how to play, settings: full screens with tabs across the top -------------------------------------------

  private screen(title: string, tabs: { label: string; html: () => string; wire?: (host: HTMLElement) => void }[]) {
    let at = 0;
    const m = this.modalOpen(
      `<header class="zkf-shead"><h2>${esc(title)}</h2><nav class="zkf-stabs">${tabs.map((t, i) => `<button type="button" data-t="${i}">${esc(t.label)}</button>`).join("")}</nav><button class="zkf-x" type="button" aria-label="${T("Close", "关闭")}"></button></header><div class="zkf-sbody"></div>`,
      "screen",
    );
    const body = m.querySelector(".zkf-sbody") as HTMLElement;
    const show = () => {
      m.querySelectorAll<HTMLElement>("[data-t]").forEach((b) => b.classList.toggle("on", Number(b.dataset.t) === at));
      body.innerHTML = tabs[at].html();
      tabs[at].wire?.(body);
      fillFaces(body);
    };
    m.querySelector(".zkf-stabs")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
      if (!b) return;
      at = Number(b.dataset.t);
      sfx(this.snd, "ui", "click");
      show();
    });
    (this.modal as HTMLElement & { turn?: (d: number) => void }).turn = (d) => {
      at = (at + d + tabs.length) % tabs.length;
      sfx(this.snd, "ui", "hover");
      show();
    };
    show();
  }

  private rules() {
    const step = (n: number, h: string, a: string, b: string) => `<div class="zkf-step zkf-plate"><i>${n}</i><h4>${h}</h4><p>${T(a, b)}</p></div>`;
    this.screen(T("How to play", "玩法"), [
      {
        label: T("The duel", "对决"),
        html: () =>
          `<div class="zkf-steps">${[
            step(1, T("Two heroes", "两位英雄"), "30 Health each: bring the rival's to 0. Going first you start with 3 cards; going second with 4 and a Spare Zatoshi.", "各 30 点生命值：把对手的打到 0。先手起手 3 张牌；后手 4 张外加一枚零钱。"),
            step(2, T("ZEC to spend", "花费 ZEC"), "One more ZEC crystal each turn, up to 10, refilled every turn. A card's cost is the gold coin in its corner.", "每回合多一个 ZEC 水晶，最多 10 个，每回合补满。卡牌左上角的金币就是它的费用。"),
            step(3, T("Minions", "随从"), "Drag a minion onto your side. From your next turn it attacks: drag it onto an enemy minion or hero, and both deal their Attack to each other.", "把随从拖到你的战场。从下回合起它可以攻击：拖到敌方随从或英雄身上，双方互相造成攻击力的伤害。"),
            step(4, T("Spells and secrets", "法术与奥秘"), "Spells act at once. A Secret waits hidden for your rival to set it off. Space ends your turn; Esc or a right click cancels a move.", "法术立即生效。奥秘会隐藏起来等对手触发。空格结束回合；Esc 或右键取消操作。"),
          ].join("")}</div>`,
      },
      {
        label: T("The 10,000", "一万张零知卡"),
        html: () =>
          `<p class="zkf-lead">${T("Every zkSNARK of the collection is a card. The rarer it is, the stronger: its rank sets its rarity and its power, its skin its pool, its head its tribe, its eyes what it does.", "收藏中的每个零知证明者都是一张卡。越稀有越强：排名决定稀有度与强度，皮肤决定池，头饰决定种族，眼睛决定能力。")}</p>
           <div class="zkf-tiers">${(
             [
               ["legendary", T("Ranks 1–100 and the 26 Apparitions", "排名 1–100 与 26 个显灵者")],
               ["epic", T("Ranks 101–1,000", "排名 101–1,000")],
               ["rare", T("Ranks 1,001–3,500, and the 676 Purged: Ghosts of Sprout", "排名 1,001–3,500，以及 676 个已净化者：Sprout 的幽灵")],
               ["common", T("Ranks 3,501 and on", "排名 3,501 以后")],
             ] as const
           )
             .map(([t, l]) => `<div class="zkf-tier zkf-plate" style="--c:${TIER_COLOR[t]}"><img src="${gemUrl(t, 64)}" alt="" /><b>${rarityName(t)}</b><p>${l}</p></div>`)
             .join("")}</div>
           <p class="zkf-note">${T("A deck holds one of each zkSNARK.", "每个零知证明者在一副套牌中只能放一张。")}</p>`,
      },
      {
        label: T("The pools", "四个池"),
        html: () => `<div class="zkf-heroes static">${FACTIONS.map((f) => heroCol(f, 0, true)).join("")}</div>`,
      },
      {
        label: T("Keywords", "关键词"),
        html: () =>
          `<dl class="zkf-kw">${Object.entries(KW_HELP)
            .map(([k, v]) => `<div class="zkf-plate"><dt><span class="zkf-kwic" data-kw="${k}"></span>${kwLabel(k)}</dt><dd>${esc(T(v[0], v[1]))}</dd></div>`)
            .join("")}</dl>`,
        wire: (h) => {
          for (const e of h.querySelectorAll<HTMLElement>("[data-kw]")) e.appendChild(iconCanvas(KW_ICON[e.dataset.kw!] ?? "q", "#f4b728"));
        },
      },
      {
        label: T("Your deck", "你的套牌"),
        html: () =>
          `<div class="zkf-steps three">${[
            step(1, T("Thirty cards", "三十张"), "One pool and the neutrals: two of a Classic, one of a legendary, one of each zkSNARK.", "一个池的卡加中立卡；经典卡最多 2 张，传说 1 张，每个零知证明者 1 张。"),
            step(2, T("Gold and packs", "金币与卡包"), "Win duels for gold, buy and open packs of five.", "赢下对决拿金币，购买并开启五张一包的卡包。"),
            step(3, T("Zats", "Zat"), "Doubles turn into zats; spend them to craft the cards you miss.", "重复卡转为 zat，用来合成缺的卡。"),
          ].join("")}</div>`,
      },
    ]);
  }

  private settings() {
    const toggle = (k: string, on: boolean, a: string, b: string) => `<div class="zkf-toggle" data-k="${k}"><button type="button" data-v="on" class="${on ? "on" : ""}">${a}</button><button type="button" data-v="off" class="${on ? "" : "on"}">${b}</button></div>`;
    this.screen(T("Settings", "设置"), [
      {
        label: T("Game", "游戏"),
        html: () => {
          const info = (MAPS_MOD as unknown as { MAP_INFO?: Record<string, { name: string; zh: string }> }).MAP_INFO ?? {};
          let cur = "";
          try {
            cur = localStorage.getItem("street.legends.board") ?? "";
          } catch {
            /* private mode */
          }
          const name = (k: string) => (info[k] ? T(info[k].name, info[k].zh) : MAP_NAMES[k] ? T(MAP_NAMES[k][0], MAP_NAMES[k][1]) : k[0].toUpperCase() + k.slice(1));
          const boards = ["", ...MAPS_MOD.MAPS];
          return `<section class="zkf-set">
              <div class="zkf-setrow zkf-plate"><span><b>${T("Sound", "声音")}</b><small>${T("Music and effects", "音乐与音效")}</small></span>${toggle("sound", !this.snd?.muted, T("On", "开"), T("Off", "关"))}</div>
              <h4 class="zkf-lab">${T("Board", "棋盘")}</h4>
              <div class="zkf-boards" data-k="board">${boards
                .map((k) => `<button type="button" data-v="${k}" class="zkf-board ${k === cur ? "on" : ""}" style="--c:${k ? (MAP_TINT[k] ?? "#a87a14") : "#a87a14"}"><i class="${k ? "" : "rnd"}"></i><b>${k ? esc(name(k)) : T("Random", "随机")}</b></button>`)
                .join("")}</div>
            </section>`;
        },
        wire: (h) => {
          h.querySelector("[data-k=sound]")?.addEventListener("click", (e) => {
            const b = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
            if (!b || !this.snd) return;
            this.snd.muted = b.dataset.v === "off";
            if (!this.snd.muted) sfx(this.snd, "music", "menu");
            h.querySelectorAll("[data-k=sound] button").forEach((x) => x.classList.toggle("on", x === b));
          });
          h.querySelector("[data-k=board]")?.addEventListener("click", (e) => {
            const b = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
            if (!b) return;
            try {
              localStorage.setItem("street.legends.board", b.dataset.v ?? "");
            } catch {
              /* private mode */
            }
            h.querySelectorAll("[data-k=board] button").forEach((x) => x.classList.toggle("on", x === b));
            sfx(this.snd, "ui", "click");
          });
        },
      },
      {
        label: T("Collection", "收藏"),
        html: () => {
          const s = P.load();
          const c = P.completion();
          return `<section class="zkf-set">
            <div class="zkf-stats four zkf-plate">
              <span><b>${fmt(s.gold)}</b><small>${T("Gold", "金币")}</small></span>
              <span><b>${fmt(s.zats)}</b><small>Zats</small></span>
              <span><b>${s.opened}</b><small>${T("Packs opened", "已开卡包")}</small></span>
              <span><b>${s.wins}<i>/${s.played}</i></b><small>${T("Duels won", "胜场")}</small></span>
              <span><b>${fmt(c.snarks)}</b><small>zkSNARKs</small></span>
              <span><b>${c.have}<i>/${c.total}</i></b><small>${T("Classics", "经典")}</small></span>
            </div>
            <div class="zkf-setrow zkf-plate"><span><b>${T("Start again", "重新开始")}</b><small>${T("This browser keeps your collection. Resetting it can't be undone.", "收藏保存在本浏览器中。重置后无法恢复。")}</small></span><button class="zkf-btn" type="button" data-reset>${T("Reset", "重置")}</button></div>
          </section>`;
        },
        wire: (h) =>
          h.querySelector("[data-reset]")?.addEventListener("click", (e) => {
            const b = e.currentTarget as HTMLButtonElement;
            if (b.dataset.sure) {
              P.resetProgress();
              if (this.ctx?.meId && snarksReady()) P.grantMine(this.ctx.meId);
              this.toast(T("Collection reset.", "收藏已重置。"));
              this.closeModal();
              this.go(this.mode);
            } else {
              b.dataset.sure = "1";
              b.classList.add("bad");
              b.textContent = T("Sure? Click again", "确定？再点一次");
            }
          }),
      },
    ]);
  }

  // ---- modal, toast ------------------------------------------------------------------------------------------------

  private modalOpen(html: string, cls: string): HTMLDivElement {
    this.closeModal();
    const m = document.createElement("div");
    m.className = `zkf-modal ${cls}`;
    m.innerHTML = `<div class="zkf-mpanel">${html}</div>`;
    m.addEventListener("click", (e) => {
      if (e.target === m || (e.target as HTMLElement).closest(".zkf-x")) this.closeModal();
    });
    this.root.appendChild(m);
    this.modal = m;
    return m.firstElementChild as HTMLDivElement;
  }
  private closeModal() {
    this.modal?.remove();
    this.modal = null;
    this.book?.select(null);
  }
  private toastT: ReturnType<typeof setTimeout> | undefined;
  private toast(s: string) {
    const t = this.root.querySelector(".zkf-toast") as HTMLElement | null;
    if (!t) return;
    t.textContent = s;
    t.classList.add("on");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove("on"), 2600);
  }
}

// ---- pieces -------------------------------------------------------------------------------------------------------------

/** A screen's head: the back slab and the title (and what's on the right). */
function head(title: string, right = "") {
  return `<header class="zkf-head"><button class="zkf-back" type="button" aria-label="${T("Back", "返回")}"><i></i></button><h2>${title}</h2>${right}</header>`;
}
function wireBack(sec: HTMLElement, f: () => void) {
  sec.querySelector(".zkf-back")?.addEventListener("click", f);
}

/** A pool as a tall hero column: its champion big, its name, its hero power. */
function heroCol(p: Pool, key = 0, still = false) {
  const pw = POWERS.get(p)!;
  const tag = still ? "div" : "button";
  return `<${tag} ${still ? "" : 'type="button"'} class="zkf-hero" data-pool="${p}" ${key ? `data-i="${key}"` : ""} style="--fc:${FACTION_INFO[p].color}">
    ${key && !TOUCH ? `<kbd>${key}</kbd>` : ""}
    <span class="zkf-heroart" data-face="${champArt(p)}"></span>
    <b>${factionName(p)}</b>
    <p>${esc(T(FACTION_INFO[p].tag, FACTION_INFO[p].tagZh))}</p>
    <span class="zkf-power"><img src="${coinUrl(pw.cost, 64)}" alt="" /><span><b>${esc(T(pw.name, pw.zh))}</b><small>${esc(T(pw.text, pw.textZh))}</small></span></span>
  </${tag}>`;
}

/** Put the zkSNARK pictures into [data-face] holders. */
function fillFaces(host: HTMLElement) {
  for (const f of host.querySelectorAll<HTMLElement>("[data-face]")) if (!f.firstElementChild) f.appendChild(snarkCanvas(Number(f.dataset.face)));
}
/** Put the art crops into the strips. */
function fillArt(host: HTMLElement) {
  for (const f of host.querySelectorAll<HTMLElement>("[data-art]")) if (!f.firstElementChild) f.appendChild(snarkCanvas(Number(f.dataset.art)));
}

/** A deck as card strips: cost coin, name, a crop of the art, ×2. */
function strips(deck: string[]) {
  const n = new Map<string, number>();
  for (const id of deck) n.set(id, (n.get(id) ?? 0) + 1);
  const rows = [...n.keys()].sort((a, b) => card(a).cost - card(b).cost || cardName(card(a)).localeCompare(cardName(card(b))));
  return rows
    .map((id) => {
      const c = card(id);
      const k = n.get(id) ?? 0;
      return `<button type="button" class="zkf-strip r-${c.rarity}" data-rm="${id}" style="--fc:${FACTION_INFO[c.faction].color};--c:${TIER_COLOR[c.rarity]}"><span class="art" data-art="${c.art}"></span><img class="cost" src="${coinUrl(c.cost, 64)}" alt="${c.cost}" /><span class="nm">${esc(cardName(c))}</span><b>${k > 1 ? `×${k}` : c.rarity === "legendary" ? "★" : ""}</b></button>`;
    })
    .join("");
}

const KW_ICON: Record<string, string> = { Guard: "shield", Shielded: "eye", Halo: "halo", Charge: "bolt", Rush: "bolt", "Double-spend": "x2", Dust: "skull", Drain: "drop", Reorg: "loop", Private: "lock", Mint: "card", Nullifier: "skull", Timelock: "lock", Redact: "door", Prover: "wave", Secret: "q", Discover: "eye" };

let packData = "";
function packUrl() {
  return (packData ||= paintPack().toDataURL("image/webp", 0.92));
}
function packImg(): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "zkf-pack";
  d.style.backgroundImage = `url(${packUrl()})`;
  return d;
}

/** A deck's face: the pool's champion for a starter, else its rarest card. */
function champion(d: DeckEntry | undefined): number {
  if (!d) return champArt("neutral");
  if (!d.custom) return champArt(d.pool);
  const best = d.cards
    .map((id) => {
      try {
        return card(id);
      } catch {
        return null;
      }
    })
    .filter((c): c is CardDef => !!c)
    .sort((a, b) => TIER_RANK[a.rarity] - TIER_RANK[b.rarity] || b.cost - a.cost)[0];
  return best?.art ?? champArt(d.pool);
}

/** What keeps a deck from being played ("": nothing). */
function deckWhy(d: SavedDeck): string {
  if (d.cards.length !== DECK_SIZE) return T(`${d.cards.length}/${DECK_SIZE} cards`, `${d.cards.length}/${DECK_SIZE} 张`);
  const n = new Map<string, number>();
  for (const id of d.cards) n.set(id, (n.get(id) ?? 0) + 1);
  for (const [id, k] of n) {
    let c: CardDef;
    try {
      c = card(id);
    } catch {
      return T("a card is missing", "缺少一张卡");
    }
    if (c.faction !== "neutral" && c.faction !== d.pool) return T(`${c.name} is not ${d.pool}`, `${c.zh} 不属于该池`);
    if (k > maxCopies(id)) return T(`too many ${c.name}`, `${c.zh} 太多`);
    if (k > P.owned(id)) return T(`missing ${c.name}`, `缺少 ${c.zh}`);
  }
  return "";
}

/** The mana curve: a bar per cost, its count on top. */
function curve(cards: string[]) {
  const n = new Array(8).fill(0);
  for (const id of cards) {
    try {
      n[Math.min(7, card(id).cost)]++;
    } catch {
      /* (unknown) */
    }
  }
  const max = Math.max(4, ...n);
  return `<div class="zkf-curve">${n.map((k, i) => `<span><em>${k || ""}</em><i style="height:${(k / max) * 100}%"></i><small>${i === 7 ? "7+" : i}</small></span>`).join("")}</div>`;
}

// ---- entry points -------------------------------------------------------------------------------------------------------

export function openMenus(host: HTMLElement, ctx: MenusCtx): { close(): void } {
  const m = new Menus(host, ctx, ctx.snd);
  m.go("menu");
  return { close: () => m.close() };
}

/** The collection alone (the old table's deck builder): `done` gets the deck saved last, if any. */
export function openCollection(host: HTMLElement, snd: LegendsSound | null, fresh: boolean, done: (saved?: SavedDeck) => void): { close(): void } {
  const m = new Menus(host, null, snd);
  m.builder(fresh, done);
  return { close: () => m.close() };
}

export { awardDuel } from "./progress";
