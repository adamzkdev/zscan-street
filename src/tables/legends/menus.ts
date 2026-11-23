import * as A from "./arena";
/**
 * ZK LEGENDS' front end, in ZStreet's own front-end language (the gta branch's title and line-up):
 * a live 3D picture behind (front/stage.ts: an arena at golden hour, the crew round a duel), Archivo
 * wide and heavy for names, sentence-case menu items with the chosen one in a white pill, dark glass
 * panels, Zcash gold for what matters, key hints along the bottom.
 * - Menu: Play, Collection, Packs, How to play, Settings, Leave the table; "Playing as #id" and
 *   tonight's rival in the corners; your gold, zats and packs top right.
 * - Play: your decks as a line-up (the starters and yours), the chosen one's card (name, pool, hero
 *   power, curve), the rival, a gold Duel.
 * - Collection: all 10,000 zkSNARKs (snarkcards.ts: one card each, rarity and power from the rank)
 *   and the Classics, in a grid that only draws what's in sight; filters (owned, tier, pool, cost,
 *   tribe), search (#number or words), sort; a card's sheet (ZKSNARK #id, its chips, its traits, craft
 *   and disenchant); your decks and the deck editor (30 cards, one pool and the neutrals).
 * - Packs: buy with gold, open: five cards face down, each turned with its rarity's light.
 * - How to play, Settings: panels with tabs on the left.
 * Your collection lives in progress.ts.
 */
import * as MAPS_MOD from "./maps";
import "./menus.css";
import { T } from "../../i18n/lang";
import { DECK_SIZE, POWERS, card, type CardDef, type Faction, type Rarity } from "./engine";
import { COLLECTIBLE, FACTIONS, FACTION_INFO } from "./cards";
import { STARTERS, STARTER_NAMES, saveDecks, maxCopies, type Pool, type SavedDeck } from "./decks";
import { KW_HELP, TRIBE_ZH, cardEl, cardName, factionName, kwLabel, rarityName, snarkCanvas } from "./art";
import { backUrl, paintPack } from "./paint";
import { SNARKS, ensureCards, isSnarkCard, loadSnarks, snarkCard, snarkCardId, snarkIdOf, snarkInfo, snarksReady, type SnarkInfo } from "./snarkcards";
import * as P from "./progress";
import type { LegendsSound } from "./sound";
import { HubStage } from "./front/stage";
import { CardGrid } from "./front/grid";

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
  private grid: CardGrid | null = null;
  private set: "snarks" | "classics" = "snarks";
  private only = false;
  private tier: Rarity | "" = "";
  private pool: Faction | "" = "";
  private cost = -1;
  private tribe = "";
  private words = "";
  private sort: "rank" | "cost" | "number" = "rank";
  private detailId: string | null = null;
  private editing: SavedDeck | null = null;
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
      <footer class="zkf-hints"></footer>
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
    this.root.addEventListener("pointerover", (e) => {
      const b = (e.target as HTMLElement).closest(".zkf-item, .zkf-btn, .zkf-dot, .zkf-chipbtn");
      if (b && b !== (e.relatedTarget as HTMLElement | null)?.closest?.(".zkf-item, .zkf-btn, .zkf-dot, .zkf-chipbtn")) sfx(this.snd, "ui", "hover");
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
    this.grid?.dispose();
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
    this.hints();
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
    if (this.mode === "coll" && this.editing) return this.stopEdit();
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
      return this.back();
    }
    if (inInput) return;
    if (this.modal) return;
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
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        this.stepDeck(e.key === "ArrowRight" ? 1 : -1);
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
    } else if (this.mode === "coll" && e.key === "/") {
      e.preventDefault();
      (this.root.querySelector(".zkf-search") as HTMLInputElement | null)?.focus();
    } else if (this.mode === "packs" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      this.packKey();
    }
  };

  private hints() {
    const h = this.root.querySelector(".zkf-hints") as HTMLElement;
    const k = (key: string, label: string) => `<span><kbd>${key}</kbd>${label}</span>`;
    const list =
      this.mode === "menu"
        ? [k("↑", "") + k("↓", T("Choose", "选择")), k("Enter", T("Select", "确定")), k("Esc", T("Back", "返回"))]
        : this.mode === "play"
          ? [k("←", "") + k("→", T("Decks", "套牌")), k("Enter", T("Duel", "对决")), k("Esc", T("Back", "返回"))]
          : this.mode === "arena"
            ? [k("1", "") + k("2", "") + k("3", T("Pick", "选择")), k("Enter", T("Duel", "对决")), k("Esc", T("Back", "返回"))]
          : this.mode === "coll"
            ? [k("/", T("Search", "搜索")), this.editing ? k(T("Click", "点击"), T("Add", "加入")) : k(T("Click", "点击"), T("Card", "卡牌")), this.editing ? k(T("Right click", "右键"), T("Card", "卡牌")) : "", k("Esc", T("Back", "返回"))]
            : [k("Enter", T("Open · turn", "开包 · 翻牌")), k("Esc", T("Back", "返回"))];
    h.innerHTML = TOUCH ? "" : list.join("");
  }

  private wallet() {
    const s = P.load();
    const w = this.root.querySelector(".zkf-wallet") as HTMLElement | null;
    if (!w) return;
    w.innerHTML = `
      <span class="zkf-coin" title="${T("Gold: earned in duels, buys packs", "金币：对决中赚取，用来买卡包")}"><i class="zkf-ic gold"></i><b>${fmt(s.gold)}</b><small>${T("gold", "金币")}</small></span>
      <span class="zkf-coin" title="${T("Zats: from extra copies, craft the cards you want", "Zat：来自多余卡牌，用来合成想要的卡")}"><i class="zkf-ic zats"></i><b>${fmt(s.zats)}</b><small>zats</small></span>
      <span class="zkf-coin" title="${T("Unopened packs", "未开卡包")}"><i class="zkf-ic pack"></i><b>${s.packs}</b><small>${T("packs", "卡包")}</small></span>`;
  }

  // ---- the menu ------------------------------------------------------------------------------------------------

  private items(): { k: string; label: string; sub?: string }[] {
    const r = this.ctx?.rival;
    const c = P.completion();
    const s = P.load();
    const out: { k: string; label: string; sub?: string }[] = [];
    if (this.ctx) out.push({ k: "play", label: T("Play", "开始对决"), sub: r ? T(`vs ${r.name} · ${skillName(r.skill)}${this.ctx.stake ? ` · ⓩ ${this.ctx.stake}` : ""}`, `对手 ${r.name} · ${skillName(r.skill)}${this.ctx.stake ? ` · ⓩ ${this.ctx.stake}` : ""}`) : undefined });
    if (this.ctx) {
      const a = A.arenaLoad();
      const sub = a && !a.done ? (A.arenaReady(a) ? T(`Your run: ${a.wins} wins · ${a.losses} losses`, `进行中：${a.wins} 胜 · ${a.losses} 负`) : T(`Drafting: ${a.deck.length}/30`, `选牌中：${a.deck.length}/30`)) : A.arenaFree() ? T("Draft a deck, win up to 12 · first run free", "现场选牌，最多 12 胜 · 首次免费") : T(`Draft a deck, win up to 12 · ${A.ARENA_PRICE} gold`, `现场选牌，最多 12 胜 · ${A.ARENA_PRICE} 金币`);
      out.push({ k: "arena", label: T("Arena", "竞技场"), sub });
    }
    out.push(
      { k: "coll", label: T("Collection", "收藏"), sub: snarksReady() ? T(`${fmt(c.snarks)} of 10,000 zkSNARKs · ${c.have}/${c.total} Classics`, `${fmt(c.snarks)} / 10,000 零知卡 · 经典 ${c.have}/${c.total}`) : T(`${c.have}/${c.total} Classics`, `经典 ${c.have}/${c.total}`) },
      { k: "packs", label: T("Packs", "卡包"), sub: s.packs ? T(`${s.packs} to open`, `${s.packs} 个待开`) : T(`Buy with gold · ${P.PACK_PRICE} a pack`, `用金币购买 · 每包 ${P.PACK_PRICE}`) },
      { k: "rules", label: T("How to play", "玩法"), sub: T("The duel, the keywords, the four pools", "对决、关键词与四个池") },
      { k: "settings", label: T("Settings", "设置") },
    );
    if (this.ctx) out.push({ k: "leave", label: T("Leave the table", "离开牌桌") });
    return out;
  }

  private renderMenu() {
    const items = this.items();
    this.menuAt = Math.min(this.menuAt, items.length - 1);
    const nav = this.root.querySelector(".zkf-items")!;
    nav.innerHTML = items.map((it, i) => `<button class="zkf-item ${i === this.menuAt ? "on" : ""}" role="menuitem" data-k="${it.k}" data-i="${i}" type="button"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</button>`).join("");
    for (const b of nav.querySelectorAll<HTMLElement>(".zkf-item")) {
      b.addEventListener("pointerenter", () => {
        if (TOUCH) return;
        this.menuAt = Number(b.dataset.i);
        for (const o of nav.querySelectorAll(".zkf-item")) o.classList.toggle("on", o === b);
      });
      b.addEventListener("click", () => this.settled() && this.pick(b.dataset.k!));
    }
    const me = this.ctx?.meId ?? P.mineId();
    const meEl = this.root.querySelector(".zkf-me") as HTMLElement;
    void me;
    {
      const last = localStorage.getItem("street.legends.last") ?? "";
      const d = this.playable().find((x) => x.key === last) ?? this.playable()[0];
      meEl.innerHTML = d ? `<span class="zkf-deckmark" style="--fc:${FACTION_INFO[d.pool].color}"></span><span><small>${T("Your deck", "你的套牌")}</small><b>${esc(d.name)}</b></span><i class="zkf-tag">${factionName(d.pool)}</i>` : "";
    }
    const r = this.ctx?.rival;
    const rv = this.root.querySelector(".zkf-rival") as HTMLElement;
    if (r) {
      rv.innerHTML = `<span><small>${T("Tonight's rival", "今晚的对手")}</small><b>${esc(r.name)}</b><em>${skillName(r.skill)}${this.ctx?.stake ? ` · ⓩ ${this.ctx.stake}` : ""}</em></span><span class="zkf-pic" data-pic></span>`;
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
    const sec = this.root.querySelector(".zkf-play") as HTMLElement;
    sec.innerHTML = `
      <header class="zkf-head"><button class="zkf-back" type="button" aria-label="${T("Back", "返回")}">‹</button><h2>${T("Choose your deck", "选择你的套牌")}</h2><span class="zkf-count"></span></header>
      <div class="zkf-card zkf-deckcard"></div>
      <div class="zkf-nav"><button class="zkf-arrow" data-step="-1" type="button" aria-label="Previous">‹</button><div class="zkf-dots"></div><button class="zkf-arrow" data-step="1" type="button" aria-label="Next">›</button></div>
      <div class="zkf-tools">
        <button class="zkf-btn ghost" data-do="new" type="button">${T("New deck", "新套牌")}</button>
        <button class="zkf-btn ghost" data-do="edit" type="button">${T("Edit in the collection", "在收藏中编辑")}</button>
      </div>
      <div class="zkf-vs"></div>
      <button class="zkf-btn gold zkf-go" type="button"><span>${T("Duel", "开始对决")}</span>${TOUCH ? "" : "<small>Enter</small>"}</button>`;
    sec.querySelector(".zkf-back")!.addEventListener("click", () => this.settled() && this.go("menu"));
    sec.querySelector(".zkf-go")!.addEventListener("click", () => this.settled() && this.duel());
    for (const b of sec.querySelectorAll<HTMLElement>(".zkf-arrow")) b.addEventListener("click", () => this.stepDeck(Number(b.dataset.step)));
    sec.querySelector("[data-do=new]")!.addEventListener("click", () => {
      this.go("coll");
      this.newDeck();
    });
    sec.querySelector("[data-do=edit]")!.addEventListener("click", () => {
      const d = this.decks[this.deckAt];
      this.go("coll");
      if (d?.custom) {
        const sd = P.allDecks().find((x) => `deck:${x.id}` === d.key);
        if (sd) this.edit(sd);
      } else if (d) {
        // a starter: a copy of it to change
        this.edit({ id: `d${Date.now().toString(36)}`, name: `${d.name} +`, pool: d.pool, cards: d.cards.slice() });
      }
    });
    const r = this.ctx?.rival;
    const vs = sec.querySelector(".zkf-vs") as HTMLElement;
    if (r) {
      vs.innerHTML = `<span class="zkf-pic" data-pic></span><span><small>${T("Against", "对手")}</small><b>${esc(r.name)}</b><em>${skillName(r.skill)}${this.ctx?.stake ? ` · ⓩ ${this.ctx.stake} · ${T(`win ⓩ ${this.ctx.stake * 2}`, `赢 ⓩ ${this.ctx.stake * 2}`)}` : ` · ${T("free duel", "免费对决")}`}</em></span>`;
      vs.querySelector("[data-pic]")!.appendChild(snarkCanvas(r.id));
    }
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
    (sec.querySelector(".zkf-count") as HTMLElement).textContent = `${this.deckAt + 1} / ${this.decks.length}`;
    const dots = sec.querySelector(".zkf-dots") as HTMLElement;
    dots.replaceChildren(
      ...this.decks.map((x, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `zkf-dot ${i === this.deckAt ? "on" : ""} ${x.ok ? "" : "off"}`;
        b.style.setProperty("--fc", FACTION_INFO[x.pool].color);
        b.title = x.name;
        b.innerHTML = `<b>${esc(x.name)}</b><small>${x.custom ? T("Yours", "自建") : T("Starter", "初始")} · ${factionName(x.pool)}</small>`;
        b.addEventListener("click", () => {
          this.deckAt = i;
          this.renderDeck();
          if (b.classList.contains("on") && performance.now() - lastDot < 400) this.duel();
          lastDot = performance.now();
        });
        return b;
      }),
    );
    let lastDot = 0;
    const p = POWERS.get(d.pool)!;
    const snarks = d.cards.filter(isSnarkCard).length;
    const legs = d.cards.filter((id) => card(id).rarity === "legendary").length;
    const avg = d.cards.reduce((a, id) => a + card(id).cost, 0) / Math.max(1, d.cards.length);
    const words = d.name.split(" ");
    const head = words.length > 1 ? `${esc(words.slice(0, -1).join(" "))} <em style="color:${FACTION_INFO[d.pool].color}">${esc(words[words.length - 1])}</em>` : esc(d.name);
    (sec.querySelector(".zkf-deckcard") as HTMLElement).innerHTML = `
      <div class="zkf-cname">${head}</div>
      <div class="zkf-ctags">
        <span class="zkf-tag ${d.custom ? "gold" : ""}">${d.custom ? T("Yours", "自建") : T("Starter", "初始")}</span>
        <span class="zkf-band"><i style="--c:${FACTION_INFO[d.pool].color}"></i>${factionName(d.pool)}</span>
        <span class="zkf-band">${d.cards.length} ${T("cards", "张")}</span>
        ${snarks ? `<span class="zkf-band">${snarks} zkSNARKs</span>` : ""}
        ${d.ok ? "" : `<span class="zkf-tag bad">${esc(d.why)}</span>`}
      </div>
      <dl class="zkf-traits">
        <div class="wide"><dt>${T("Hero power", "英雄技能")} · ${p.cost} ZEC</dt><dd>${esc(T(p.name, p.zh))} — ${esc(T(p.text, p.textZh))}</dd></div>
        <div><dt>${T("Legendaries", "传说卡")}</dt><dd>${legs}</dd></div>
        <div><dt>${T("Average cost", "平均费用")}</dt><dd>${avg.toFixed(1)} ZEC</dd></div>
        <div class="wide"><dt>${T("Mana curve", "法力曲线")}</dt><dd>${curve(d.cards)}</dd></div>
      </dl>`;
    (sec.querySelector(".zkf-go") as HTMLButtonElement).disabled = !d.ok;
    (sec.querySelector("[data-do=edit]") as HTMLElement).textContent = d.custom ? T("Edit in the collection", "在收藏中编辑") : T("Make my version", "复制并修改");
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
    const head = (t: string, right = "") => `<header class="zkf-head"><button class="zkf-back" type="button" aria-label="${T("Back", "返回")}">‹</button><h2>${t}</h2><span class="zkf-count">${right}</span></header>`;
    const wire = () => sec.querySelector(".zkf-back")?.addEventListener("click", () => this.settled() && this.go("menu"));
    // no run (or the last one is over): the door
    if (!r || r.done) {
      const free = A.arenaFree();
      sec.innerHTML = `${head(T("Arena", "竞技场"))}
        <div class="zkf-arena-intro">
          <div class="zkf-cname">${T("The", "")} <em style="color:#f4b728">${T("Arena", "竞技场")}</em></div>
          <p>${T("Pick a pool, then build a deck one card at a time: three on offer each pick, zkSNARKs and Classics. Play duels with it until 12 wins or 3 losses. The further you go, the bigger the prize.", "先选一个池，再一张一张选牌组成套牌：每次三选一，零知卡与经典卡都有。用它对决，直到 12 胜或 3 负。走得越远，奖励越大。")}</p>
          ${r?.prize?.length ? `<div class="zkf-arena-prize"><small>${T("Your last run", "上一轮")}: ${r.wins} ${T("wins", "胜")}</small>${r.prize.map((x) => `<b>${esc(x)}</b>`).join("")}</div>` : ""}
          <dl class="zkf-traits"><div><dt>${T("Entry", "入场")}</dt><dd>${free ? T("Free (first run)", "免费（首次）") : `${A.ARENA_PRICE} ${T("gold", "金币")}`}</dd></div><div><dt>${T("Prize at 12 wins", "12 胜奖励")}</dt><dd>${T("4 packs · 469 gold", "4 包 · 469 金币")}</dd></div></dl>
          <button class="zkf-btn gold zkf-arena-go" type="button"><span>${T("Start a run", "开始")}</span><small>${free ? T("free", "免费") : `${A.ARENA_PRICE} ${T("gold", "金币")}`}</small></button>
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
      sec.innerHTML = `${head(T("Arena · choose your pool", "竞技场 · 选择你的池"))}<div class="zkf-arena-pools">${r.heroes
        .map((p, i) => {
          const pw = POWERS.get(p)!;
          return `<button class="zkf-arena-pool" data-i="${i}" style="--fc:${FACTION_INFO[p].color}" type="button"><kbd>${i + 1}</kbd><span class="face" data-face="${card(STARTERS[p].find((id) => card(id).rarity === "legendary") ?? STARTERS[p][0]).art}"></span><b>${factionName(p)}</b><small>${esc(T(FACTION_INFO[p].tag, FACTION_INFO[p].tagZh))}</small><em>${esc(T(pw.name, pw.zh))} — ${esc(T(pw.text, pw.textZh))}</em></button>`;
        })
        .join("")}</div>`;
      wire();
      for (const f of sec.querySelectorAll<HTMLElement>("[data-face]")) f.appendChild(snarkCanvas(Number(f.dataset.face)));
      for (const b of sec.querySelectorAll<HTMLElement>(".zkf-arena-pool")) b.addEventListener("click", () => this.settled() && this.arenaKey(Number(b.dataset.i)));
      return;
    }
    // drafting
    if (r.offer && r.deck.length < 30) {
      sec.innerHTML = `${head(T(`Arena · pick ${r.deck.length + 1} of 30`, `竞技场 · 第 ${r.deck.length + 1} / 30 张`), factionName(r.pool))}
        <div class="zkf-arena-offer"></div>
        <aside class="zkf-arena-deck">${this.arenaList(r.deck)}</aside>`;
      wire();
      const box = sec.querySelector(".zkf-arena-offer") as HTMLElement;
      r.offer.forEach((id, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "zkf-arena-pick";
        b.appendChild(cardEl(id));
        b.insertAdjacentHTML("beforeend", `<kbd>${i + 1}</kbd>`);
        b.addEventListener("click", () => this.settled() && this.arenaKey(i));
        box.appendChild(b);
      });
      return;
    }
    // the run: the record, the deck, duel
    const pips = Array.from({ length: A.ARENA_WINS }, (_, i) => `<i class="${i < r.wins ? "on" : ""}"></i>`).join("");
    const xs = Array.from({ length: A.ARENA_LOSSES }, (_, i) => `<i class="${i < r.losses ? "on" : ""}">✕</i>`).join("");
    sec.innerHTML = `${head(T("Arena · your run", "竞技场 · 你的这一轮"), factionName(r.pool))}
      <div class="zkf-arena-run">
        <div class="zkf-cname">${r.wins} <em style="color:#f4b728">${T("wins", "胜")}</em></div>
        <div class="zkf-arena-pips">${pips}</div>
        <div class="zkf-arena-xs">${xs}</div>
        <div class="zkf-row"><button class="zkf-btn ghost zkf-arena-retire" type="button">${T("Retire and collect", "退出并领奖")}</button></div>
      </div>
      <aside class="zkf-arena-deck">${this.arenaList(r.deck)}</aside>
      <button class="zkf-btn gold zkf-go zkf-arena-duel" type="button"><span>${T("Duel", "开始对决")}</span>${TOUCH ? "" : "<small>Enter</small>"}</button>`;
    wire();
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

  /** The draft's list: cost, name, ×n, the curve. */
  private arenaList(deck: string[]) {
    const n = new Map<string, number>();
    for (const id of deck) n.set(id, (n.get(id) ?? 0) + 1);
    const rows = [...n.keys()].sort((a, b) => card(a).cost - card(b).cost || card(a).name.localeCompare(card(b).name));
    return `<div class="zkf-arena-n">${deck.length} / 30</div><div class="zkf-arena-curve">${curve(deck)}</div><ol>${rows
      .map((id) => {
        const d = card(id);
        return `<li class="r-${d.rarity}" style="--fc:${FACTION_INFO[d.faction].color}"><i>${d.cost}</i><span>${esc(T(d.name, d.zh))}</span>${(n.get(id) ?? 0) > 1 ? `<b>×${n.get(id)}</b>` : ""}</li>`;
      })
      .join("")}</ol>`;
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

  // ---- the collection -------------------------------------------------------------------------------------------

  private collection() {
    const sec = this.root.querySelector(".zkf-coll") as HTMLElement;
    this.grid?.dispose();
    this.grid = null;
    if (!this.onlyBuilder && !this.editing) this.detailId = null;
    sec.innerHTML = `
      <header class="zkf-head"><button class="zkf-back" type="button" aria-label="${T("Back", "返回")}">‹</button><h2>${T("Collection", "收藏")}</h2><span class="zkf-count"></span></header>
      <aside class="zkf-rail">
        <div class="zkf-seg" data-f="set"><button data-v="snarks">${T("zkSNARKs", "零知卡")} <small>10,000</small></button><button data-v="classics">${T("Classics", "经典")} <small>${COLLECTIBLE.length}</small></button></div>
        <input class="zkf-search" placeholder="${T("#4071, a trait, a word…", "#4071、特征、关键词…")}" value="${esc(this.words)}" />
        <div class="zkf-seg" data-f="only"><button data-v="all">${T("All", "全部")}</button><button data-v="owned">${T("Owned", "已拥有")}</button></div>
        <div class="zkf-fl"><span>${T("Rarity", "稀有度")}</span><div class="zkf-chips" data-f="tier">${TIERS.map((t) => `<button class="zkf-chipbtn" data-v="${t}"><i style="--c:${TIER_COLOR[t]}"></i>${rarityName(t)}</button>`).join("")}</div></div>
        <div class="zkf-fl"><span>${T("Pool", "池")}</span><div class="zkf-chips" data-f="pool">${[...FACTIONS, "neutral" as const].map((f) => `<button class="zkf-chipbtn" data-v="${f}"><i style="--c:${FACTION_INFO[f].color}"></i>${factionName(f)}</button>`).join("")}</div></div>
        <div class="zkf-fl"><span>${T("Cost", "费用")}</span><div class="zkf-costs" data-f="cost">${[0, 1, 2, 3, 4, 5, 6, 7].map((c) => `<button data-v="${c}">${c === 7 ? "7+" : c}</button>`).join("")}</div></div>
        <div class="zkf-fl"><span>${T("Tribe", "种族")}</span><div class="zkf-chips" data-f="tribe">${TRIBES.map((t) => `<button class="zkf-chipbtn" data-v="${t}">${T(t, TRIBE_ZH[t] ?? t)}</button>`).join("")}</div></div>
        <div class="zkf-fl"><span>${T("Sort", "排序")}</span><div class="zkf-seg" data-f="sort"><button data-v="rank">${T("Rarest", "最稀有")}</button><button data-v="cost">${T("Cost", "费用")}</button><button data-v="number">#</button></div></div>
        <div class="zkf-decks"></div>
      </aside>
      <div class="zkf-gridbox"><p class="zkf-empty"></p></div>
      <aside class="zkf-side"></aside>`;
    sec.querySelector(".zkf-back")!.addEventListener("click", () => this.settled() && this.back());
    const search = sec.querySelector(".zkf-search") as HTMLInputElement;
    let tm: ReturnType<typeof setTimeout> | undefined;
    search.addEventListener("input", () => {
      clearTimeout(tm);
      tm = setTimeout(() => {
        this.words = search.value;
        this.fill();
      }, 160);
    });
    sec.querySelector(".zkf-rail")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("button[data-v]");
      const f = b?.parentElement?.dataset.f;
      if (!b || !f) return;
      const v = b.dataset.v!;
      sfx(this.snd, "ui", "click");
      if (f === "set") this.set = v as typeof this.set;
      else if (f === "only") this.only = v === "owned";
      else if (f === "tier") this.tier = this.tier === v ? "" : (v as Rarity);
      else if (f === "pool") this.pool = this.pool === v ? "" : (v as Faction);
      else if (f === "cost") this.cost = this.cost === Number(v) ? -1 : Number(v);
      else if (f === "tribe") this.tribe = this.tribe === v ? "" : v;
      else if (f === "sort") this.sort = v as typeof this.sort;
      this.fill();
    });
    const box = sec.querySelector(".zkf-gridbox") as HTMLElement;
    this.grid = new CardGrid({
      decorate: (t, id) => this.decorate(t, id),
      pick: (id, t, e) => {
        if (this.editing && !(e as MouseEvent).shiftKey) return this.addCard(id, t);
        this.showDetail(id);
      },
      context: (id, t) => {
        if (this.editing) this.removeCard(id) || this.showDetail(id);
        else this.showDetail(id);
        void t;
      },
    });
    box.appendChild(this.grid.el);
    this.fill();
    this.side();
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
    const tierRank: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3, basic: 4 };
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
      .sort((a, b) => (this.sort === "rank" ? tierRank[a.rarity] - tierRank[b.rarity] || a.cost - b.cost : this.sort === "cost" ? a.cost - b.cost || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)))
      .map((d) => d.id);
  }

  private fill() {
    const sec = this.root.querySelector(".zkf-coll") as HTMLElement;
    if (!sec || !this.grid) return;
    // the rail's state
    const on = (f: string, v: string | number | boolean) => sec.querySelectorAll<HTMLElement>(`[data-f="${f}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.v === String(v)));
    on("set", this.set);
    on("only", this.only ? "owned" : "all");
    on("tier", this.tier);
    on("pool", this.editing ? this.editing.pool : this.pool);
    on("cost", this.cost);
    on("tribe", this.tribe);
    on("sort", this.sort);
    const loading = this.set === "snarks" && !snarksReady();
    const ids = loading ? [] : this.shownIds();
    this.grid.set(ids);
    const empty = sec.querySelector(".zkf-empty") as HTMLElement;
    empty.textContent = loading ? T("Loading the 10,000 zkSNARKs…", "正在载入一万张零知卡……") : ids.length ? "" : T("Nothing matches these filters.", "没有符合条件的卡。");
    const c = P.completion();
    (sec.querySelector(".zkf-count") as HTMLElement).textContent =
      this.set === "snarks" ? T(`${fmt(ids.length)} shown · ${fmt(c.snarks)} of 10,000 yours`, `显示 ${fmt(ids.length)} · 已拥有 ${fmt(c.snarks)} / 10,000`) : T(`${fmt(ids.length)} shown · ${c.have}/${c.total} copies yours`, `显示 ${fmt(ids.length)} · 已拥有 ${c.have}/${c.total}`);
    this.renderDecks();
  }

  private decorate(t: HTMLElement, id: string) {
    const n = P.owned(id);
    const foot = t.querySelector(".zkf-foot") as HTMLElement;
    const inDeck = this.editing ? this.editing.cards.filter((x) => x === id).length : 0;
    t.classList.toggle("missing", !n);
    t.classList.toggle("indeck", inDeck > 0);
    const mine = isSnarkCard(id) && snarkIdOf(id) === P.mineId();
    const fresh = P.load().fresh[id];
    foot.innerHTML = `${mine ? `<i class="zkf-tag gold">${T("Yours", "你的")}</i>` : ""}${fresh ? `<i class="zkf-tag new">${T("New", "新")}</i>` : ""}${inDeck ? `<i class="zkf-tag white">${T("In deck", "已入组")}${inDeck > 1 ? ` ×${inDeck}` : ""}</i>` : n ? `<span>${isSnarkCard(id) ? T("Owned", "已拥有") : `×${n}`}</span>` : `<span class="off">${T("Not owned", "未拥有")}</span>`}`;
  }

  // ---- a card's sheet ----

  private showDetail(id: string) {
    this.detailId = id;
    this.grid?.select(id);
    sfx(this.snd, "ui", "click");
    if (P.load().fresh[id]) P.seen(id);
    if (this.editing && matchMedia("(max-width: 1100px)").matches) return this.detailModal(id);
    if (this.editing) return this.detailModal(id);
    this.side();
  }

  private sheetHtml(id: string): string {
    const d = card(id);
    const n = P.owned(id);
    const z = isSnarkCard(id);
    const s = z ? snarkInfo(snarkIdOf(id)) : null;
    const mine = z && snarkIdOf(id) === P.mineId();
    const chips = [
      mine ? `<span class="zkf-tag gold">${T("Yours", "你的")}</span>` : "",
      `<span class="zkf-band"><i style="--c:${TIER_COLOR[d.rarity]}"></i>${rarityName(d.rarity)}</span>`,
      s && s.rank ? `<span class="zkf-band">${T("Rank", "排名")} ${fmt(s.rank)}</span>` : "",
      s?.purged ? `<span class="zkf-tag violet">${T("Purged", "已净化")}</span>` : "",
      s?.apparition ? `<span class="zkf-tag white">${T("Apparition", "显灵者")}</span>` : "",
      `<span class="zkf-band"><i style="--c:${FACTION_INFO[d.faction].color}"></i>${factionName(d.faction)}</span>`,
    ].join("");
    const title = z ? `ZKSNARK <em>#${snarkIdOf(id)}</em>` : esc(cardName(d));
    const traits = s
      ? (["Lineage", "Head", "Eyes", "Skin", "Accessory"] as const).map((k) => `<div><dt>${k}</dt><dd>${esc(s.traits[k])}</dd></div>`).join("") + `<div><dt>${T("Card", "卡名")}</dt><dd>${esc(cardName(d))}</dd></div>`
      : `<div><dt>${T("Type", "类型")}</dt><dd>${d.type}</dd></div><div><dt>${T("Tribe", "种族")}</dt><dd>${d.tribe ?? "—"}</dd></div>`;
    const craft = P.CRAFT[d.rarity],
      dis = P.DISENCHANT[d.rarity];
    const canC = P.canCraft(id),
      canD = P.canDisenchant(id);
    return `
      <div class="zkf-big"></div>
      <div class="zkf-cname small">${title}</div>
      <div class="zkf-ctags">${chips}</div>
      <dl class="zkf-traits">${traits}</dl>
      <p class="zkf-own">${n ? (z ? T("In your collection", "在你的收藏中") : T(`You have ${n} of ${maxCopies(id)}`, `已拥有 ${n} / ${maxCopies(id)}`)) : T("Not in your collection", "尚未拥有")}</p>
      <div class="zkf-acts">
        ${d.rarity !== "basic" && !d.token ? `<button class="zkf-btn ${canC ? "gold" : ""}" data-act="craft" ${canC ? "" : "disabled"}><span>${T("Craft", "合成")}</span><small>${fmt(craft)} zats</small></button>` : ""}
        ${d.rarity !== "basic" && !d.token ? `<button class="zkf-btn ghost" data-act="dis" ${canD ? "" : "disabled"}><span>${T("Disenchant", "分解")}</span><small>+${fmt(dis)} zats</small></button>` : ""}
        ${this.editing ? `<button class="zkf-btn white" data-act="add"><span>${T("Add to deck", "加入套牌")}</span></button>` : ""}
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
    this.grid?.refresh();
    if (this.modal) this.detailModal(id);
    else this.side();
  }

  private detailModal(id: string) {
    const m = this.modalOpen(`<button class="zkf-x" aria-label="${T("Close", "关闭")}">×</button><div class="zkf-sheet">${this.sheetHtml(id)}</div>`, "sheet");
    this.wireSheet(m, id);
  }

  /** The right column: a card's sheet, or the deck being built. */
  private side() {
    const side = this.root.querySelector(".zkf-coll .zkf-side") as HTMLElement | null;
    if (!side) return;
    if (this.editing) return this.deckPanel(side);
    const id = this.detailId;
    if (!id) {
      const c = P.completion();
      side.innerHTML = `<div class="zkf-intro">
        <div class="zkf-cname small">${T("The <em>10,000</em>", "<em>一万</em>张")}</div>
        <p>${T("Every zkSNARK is a card. The rarer it is, the stronger: its rank sets its power, its skin its pool, its eyes what it does.", "每个零知证明者都是一张卡。越稀有越强：排名决定强度，皮肤决定池，眼睛决定能力。")}</p>
        <dl class="zkf-traits">
          <div><dt>${T("Legendary", "传说")}</dt><dd>${T("Ranks 1–100 · the 26 Apparitions", "排名 1–100 · 26 个显灵者")}</dd></div>
          <div><dt>${T("Epic", "史诗")}</dt><dd>${T("Ranks 101–1,000", "排名 101–1,000")}</dd></div>
          <div><dt>${T("Rare", "稀有")}</dt><dd>${T("Ranks 1,001–3,500 · the Purged", "排名 1,001–3,500 · 已净化")}</dd></div>
          <div><dt>${T("Common", "普通")}</dt><dd>${T("Ranks 3,501 and on", "排名 3,501 以后")}</dd></div>
          <div class="wide"><dt>${T("Yours", "你的")}</dt><dd>${fmt(c.snarks)} zkSNARKs · ${c.have}/${c.total} ${T("Classic copies", "经典卡")}</dd></div>
        </dl>
        <p class="zkf-own">${T("Pick a card to see it.", "点击卡牌查看。")}</p></div>`;
      return;
    }
    side.innerHTML = `<div class="zkf-sheet">${this.sheetHtml(id)}</div>`;
    this.wireSheet(side, id);
  }

  // ---- decks ----

  private renderDecks() {
    const box = this.root.querySelector(".zkf-coll .zkf-decks") as HTMLElement | null;
    if (!box) return;
    if (this.editing) {
      box.innerHTML = "";
      return;
    }
    const decks = P.allDecks();
    box.innerHTML = `<span class="zkf-flh">${T("My decks", "我的套牌")} <small>${decks.length}/9</small></span>`;
    for (const d of decks) {
      const b = document.createElement("button");
      b.className = "zkf-deckrow";
      b.style.setProperty("--fc", FACTION_INFO[d.pool].color);
      const why = deckWhy(d);
      b.innerHTML = `<span class="zkf-pic" data-pic></span><span><b>${esc(d.name)}</b><small>${factionName(d.pool)} · ${d.cards.length}/${DECK_SIZE}${why ? ` · ${esc(why)}` : ""}</small></span>`;
      b.querySelector("[data-pic]")!.appendChild(snarkCanvas(champion({ key: `deck:${d.id}`, name: d.name, pool: d.pool, cards: d.cards, custom: true, ok: true, why: "" })));
      b.addEventListener("click", () => this.edit(d));
      box.appendChild(b);
    }
    if (decks.length < 9) {
      const nb = document.createElement("button");
      nb.className = "zkf-btn ghost zkf-newdeck";
      nb.textContent = T("＋ New deck", "＋ 新套牌");
      nb.addEventListener("click", () => this.newDeck());
      box.appendChild(nb);
    }
  }

  private newDeck() {
    const m = this.modalOpen(
      `<button class="zkf-x" aria-label="${T("Close", "关闭")}">×</button>
       <h3 class="zkf-mh">${T("A deck of which pool?", "选择套牌的池")}</h3>
       <p class="zkf-msub">${T("A deck is thirty cards of one pool and the neutrals.", "一副套牌由一个池的卡与中立卡组成，共三十张。")}</p>
       <div class="zkf-pools">${FACTIONS.map((p) => `<button class="zkf-pool" data-pool="${p}" style="--fc:${FACTION_INFO[p].color}"><span class="zkf-pic" data-pic="${p}"></span><b>${factionName(p)}</b><small>${esc(T(FACTION_INFO[p].tag, FACTION_INFO[p].tagZh))}</small></button>`).join("")}</div>`,
      "pools",
    );
    const champ: Record<Pool, string> = { transparent: "t_boss", sapling: "s_gardener", sprout: "p_crypt", orchard: "o_sentinel" };
    m.querySelectorAll<HTMLElement>("[data-pic]").forEach((e) => e.appendChild(snarkCanvas(card(champ[e.dataset.pic as Pool]).art)));
    m.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pool]");
      if (!b) return;
      const pool = b.dataset.pool as Pool;
      this.closeModal();
      const n = P.allDecks().filter((d) => d.pool === pool).length + 1;
      this.edit({ id: `d${Date.now().toString(36)}`, name: `${T(FACTION_INFO[pool].name, FACTION_INFO[pool].zh)} ${n}`, pool, cards: [] });
    });
  }

  private edit(d: SavedDeck) {
    this.editing = { ...d, cards: d.cards.slice() };
    if (this.mode !== "coll") this.go("coll");
    this.pool = "";
    this.detailId = null;
    this.root.classList.add("editing");
    this.fill();
    this.side();
    this.hints();
  }

  private stopEdit() {
    this.editing = null;
    this.root.classList.remove("editing");
    if (this.onlyBuilder) {
      this.close();
      return this.builderDone?.(this.lastSaved);
    }
    this.fill();
    this.side();
    this.hints();
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
    else if (n >= P.owned(id)) why = T("You don't own it (craft it from its sheet).", "你还没有这张卡（可在详情中合成）。");
    if (why) {
      sfx(this.snd, "error");
      this.toast(why);
      return;
    }
    d.cards.push(id);
    sfx(this.snd, "pick");
    tile?.animate([{ transform: tile.style.transform + " scale(1)" }, { transform: tile.style.transform + " scale(0.94)" }, { transform: tile.style.transform + " scale(1)" }], { duration: 180 });
    this.grid?.refresh();
    this.side();
  }

  private removeCard(id: string): boolean {
    const d = this.editing;
    if (!d) return false;
    const i = d.cards.indexOf(id);
    if (i < 0) return false;
    d.cards.splice(i, 1);
    sfx(this.snd, "draw");
    this.grid?.refresh();
    this.side();
    return true;
  }

  private deckPanel(side: HTMLElement) {
    const d = this.editing!;
    const rows = [...new Set(d.cards)].sort((a, b) => card(a).cost - card(b).cost || cardName(card(a)).localeCompare(cardName(card(b))));
    const full = d.cards.length === DECK_SIZE;
    side.innerHTML = `
      <div class="zkf-deckedit" style="--fc:${FACTION_INFO[d.pool].color}">
        <input class="zkf-dname" maxlength="28" value="${esc(d.name)}" />
        <div class="zkf-ctags"><span class="zkf-band"><i style="--c:${FACTION_INFO[d.pool].color}"></i>${factionName(d.pool)}</span><span class="zkf-band ${full ? "ok" : ""}"><b>${d.cards.length}</b>/${DECK_SIZE}</span></div>
        ${curve(d.cards)}
        <div class="zkf-list">${
          rows.length
            ? rows
                .map((id) => {
                  const c = card(id);
                  const k = d.cards.filter((x) => x === id).length;
                  return `<button class="zkf-row r-${c.rarity}" data-rm="${id}" style="--fc:${FACTION_INFO[c.faction].color}"><i>${c.cost}</i><span>${esc(cardName(c))}${c.serial ? ` <small>#${c.serial}</small>` : ""}</span><b>${k > 1 ? `×${k}` : c.rarity === "legendary" ? "★" : ""}</b></button>`;
                })
                .join("")
            : `<p class="zkf-own">${T("Click cards in the grid to add them.", "点击左侧卡牌加入套牌。")}</p>`
        }</div>
        <div class="zkf-acts">
          <button class="zkf-btn ghost" data-do="fill">${T("Fill", "补全")}</button>
          <button class="zkf-btn ghost" data-do="del">${T("Delete", "删除")}</button>
          <button class="zkf-btn ghost" data-do="done">${T("Back", "返回")}</button>
          <button class="zkf-btn gold" data-do="save" ${full ? "" : "disabled"}>${T("Save", "保存")}</button>
        </div>
      </div>`;
    const nameIn = side.querySelector(".zkf-dname") as HTMLInputElement;
    nameIn.addEventListener("input", () => (d.name = nameIn.value.trim() || d.name));
    side.querySelector(".zkf-list")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-rm]");
      if (b) this.removeCard(b.dataset.rm!);
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
        .sort((a, b) => ({ legendary: 0, epic: 1, rare: 2, common: 3, basic: 4 })[a.rarity] - ({ legendary: 0, epic: 1, rare: 2, common: 3, basic: 4 })[b.rarity]);
      for (const c of mine) while (d.cards.length < DECK_SIZE && can(c.id)) d.cards.push(c.id);
      this.grid?.refresh();
      this.side();
    });
    side.querySelector("[data-do=del]")!.addEventListener("click", () => {
      saveDecks(P.allDecks().filter((x) => x.id !== d.id));
      this.stopEdit();
    });
    side.querySelector("[data-do=done]")!.addEventListener("click", () => this.stopEdit());
    side.querySelector("[data-do=save]")!.addEventListener("click", () => {
      if (d.cards.length !== DECK_SIZE) return;
      const list = P.allDecks().filter((x) => x.id !== d.id);
      list.push({ ...d, cards: d.cards.slice() });
      saveDecks(list);
      this.lastSaved = { ...d };
      sfx(this.snd, "coin");
      this.toast(T(`${d.name}: saved`, `${d.name}：已保存`));
      this.stopEdit();
    });
  }

  // ---- packs ------------------------------------------------------------------------------------------------------

  private packs() {
    const s = P.load();
    const sec = this.root.querySelector(".zkf-packs") as HTMLElement;
    sec.innerHTML = `
      <header class="zkf-head"><button class="zkf-back" type="button" aria-label="${T("Back", "返回")}">‹</button><h2>${T("Packs", "卡包")}</h2><span class="zkf-count">${T(`${s.opened} opened`, `已开 ${s.opened} 包`)}</span></header>
      <div class="zkf-card zkf-packcard">
        <div class="zkf-cname">ZK <em>${T("PACK", "卡包")}</em></div>
        <div class="zkf-ctags"><span class="zkf-tag gold" data-left></span><span class="zkf-band">${T("5 cards", "5 张")}</span><span class="zkf-band">${T("mostly zkSNARKs", "以零知卡为主")}</span></div>
        <dl class="zkf-traits">
          <div><dt><i class="zkf-dotc" style="--c:${TIER_COLOR.legendary}"></i>${T("Legendary", "传说")}</dt><dd>${T("about 1 pack in 20", "约每 20 包 1 张")}</dd></div>
          <div><dt><i class="zkf-dotc" style="--c:${TIER_COLOR.epic}"></i>${T("Epic", "史诗")}</dt><dd>${T("about 1 pack in 4", "约每 4 包 1 张")}</dd></div>
          <div><dt><i class="zkf-dotc" style="--c:${TIER_COLOR.rare}"></i>${T("Rare", "稀有")}</dt><dd>${T("at least one a pack", "每包至少 1 张")}</dd></div>
          <div><dt>${T("A legendary", "传说保底")}</dt><dd>${T("within 30 packs", "30 包内必出")}</dd></div>
          <div class="wide"><dt>${T("Doubles", "重复卡")}</dt><dd>${T("become zats, to craft any card", "转为 zat，可合成任意卡")}</dd></div>
        </dl>
      </div>
      <div class="zkf-pstage"><div class="zkf-ped"></div><div class="zkf-pile"></div><p class="zkf-phint"></p></div>
      <div class="zkf-tools"><button class="zkf-btn ghost" data-do="buy"><span>${T("Buy a pack", "购买卡包")}</span><small><i class="zkf-ic gold"></i>${P.PACK_PRICE}</small></button></div>
      <button class="zkf-btn gold zkf-go" data-do="open" type="button"><span>${T("Open a pack", "开启卡包")}</span>${TOUCH ? "" : "<small>Enter</small>"}</button>`;
    sec.querySelector(".zkf-back")!.addEventListener("click", () => this.settled() && this.back());
    sec.querySelector("[data-do=buy]")!.addEventListener("click", () => {
      if (!P.buyPack()) {
        sfx(this.snd, "error");
        return this.toast(T("Not enough gold: win duels to earn more.", "金币不足：赢下对决来赚取。"));
      }
      sfx(this.snd, "coin");
      this.pile();
    });
    sec.querySelector("[data-do=open]")!.addEventListener("click", () => this.settled() && this.packKey());
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
    (sec.querySelector("[data-left]") as HTMLElement).textContent = n ? T(`${n} to open`, `${n} 个待开`) : T("none to open", "没有待开卡包");
    (sec.querySelector(".zkf-phint") as HTMLElement).textContent = n ? "" : T("No pack: buy one with gold, or win duels.", "没有卡包：用金币购买，或赢下对决。");
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
    flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: 800 }).onfinish = () => flash.remove();
    this.burst(stage, cx, cy, "#ffd76a", 50);
    pack.remove();
    const W = sr.width,
      H = sr.height;
    // a phone held upright: three cards over two
    const narrow = W < 600;
    const cw = narrow ? Math.max(84, Math.min(150, (W - 30) / 3.25, H / 3.6)) : Math.max(100, Math.min(200, W / 5.8, H / 2.2));
    let left = cards.length;
    const done = document.createElement("button");
    done.className = "zkf-btn white zkf-done";
    done.innerHTML = `<span>${T("Collect", "收下")}</span>${TOUCH ? "" : "<small>Enter</small>"}`;
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
      const x = cx + col * cw * 1.08 - cw / 2,
        y = narrow ? cy - cw * 1.5 + row * cw * 1.62 : cy - cw * 0.7 + (Math.abs(i - 2) === 2 ? 14 : Math.abs(i - 2) === 1 ? 4 : 0);
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
          this.burst(stage, px, py, "#ffb02e", 46);
        } else if (d.rarity === "epic") this.burst(stage, px, py, "#b07bff", 26);
        else if (d.rarity === "rare") this.burst(stage, px, py, "#3fa8ff", 14);
        const tag = document.createElement("div");
        tag.className = "zkf-pulled";
        const bits = [`<b style="color:${TIER_COLOR[d.rarity]}">${rarityName(d.rarity)}</b>`];
        if (z?.rank) bits.push(`${T("Rank", "排名")} ${fmt(z.rank)}`);
        if (z?.apparition) bits.push(T("Apparition", "显灵者"));
        if (z?.purged) bits.push(T("Purged", "已净化"));
        if (c.zats) bits.push(`+${c.zats} zats`);
        else if (c.isNew) bits.push(`<i class="zkf-tag new">${T("New", "新")}</i>`);
        tag.innerHTML = bits.join(" · ");
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
      const s = 4 + Math.random() * 8;
      d.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${Math.random() < 0.3 ? "#fff" : color}`;
      host.appendChild(d);
      const a = Math.random() * Math.PI * 2,
        r = 60 + Math.random() * 220;
      d.animate(
        [
          { transform: "translate(-50%,-50%)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r + 40}px)) rotate(${Math.random() * 180}deg)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
      ).onfinish = () => d.remove();
    }
  }

  // ---- how to play, settings: panels with tabs ---------------------------------------------------------------

  private tabsPanel(title: string, sub: string, tabs: { k: string; label: string; html: () => string; wire?: (host: HTMLElement) => void }[]) {
    let at = 0;
    const m = this.modalOpen(
      `<aside class="zkf-ptabs"><h3>${esc(title)}</h3><small>${esc(sub)}</small><nav>${tabs.map((t, i) => `<button data-t="${i}" class="${i === 0 ? "on" : ""}">${esc(t.label)}</button>`).join("")}</nav><button class="zkf-btn white zkf-pback">${T("Back", "返回")}</button></aside><div class="zkf-pbody"></div>`,
      "tabs",
    );
    const body = m.querySelector(".zkf-pbody") as HTMLElement;
    const show = () => {
      m.querySelectorAll<HTMLElement>("[data-t]").forEach((b) => b.classList.toggle("on", Number(b.dataset.t) === at));
      body.innerHTML = `<header><h3>${esc(tabs[at].label)}</h3><button class="zkf-x" aria-label="${T("Close", "关闭")}">×</button></header>${tabs[at].html()}`;
      tabs[at].wire?.(body);
    };
    m.querySelector("nav")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
      if (!b) return;
      at = Number(b.dataset.t);
      sfx(this.snd, "ui", "click");
      show();
    });
    m.querySelector(".zkf-pback")!.addEventListener("click", () => this.closeModal());
    show();
  }

  private rules() {
    const p = (a: string, b: string) => `<p>${T(a, b)}</p>`;
    this.tabsPanel(T("How to play", "玩法"), "ZK Legends", [
      {
        k: "duel",
        label: T("The duel", "对决"),
        html: () =>
          p("Two heroes, 30 Health each: bring the rival's to 0. Going first you start with 3 cards; going second with 4 and a Spare Zatoshi.", "两位英雄，各 30 点生命值：把对手的打到 0。先手起手 3 张牌；后手 4 张外加一枚零钱。") +
          p("One more ZEC crystal each turn, up to 10, refilled every turn. Every card costs ZEC: the gold coin in its corner.", "每回合多一个 ZEC 水晶，最多 10 个，每回合补满。卡牌左上角的金币就是它的 ZEC 费用。") +
          p("Drag a minion onto your side of the board. From your next turn it attacks: drag it onto an enemy minion or hero; both deal their Attack to each other. Spells act at once; a Secret waits hidden for your rival to set it off.", "把随从拖到你的战场。从下回合起它可以攻击：拖到敌方随从或英雄身上，双方互相造成攻击力的伤害。法术立即生效；奥秘会隐藏起来等对手触发。") +
          p("Space or the END TURN plate ends your turn. Esc or a right click cancels a move.", "空格键或“结束回合”按钮结束回合。Esc 或右键取消操作。"),
      },
      {
        k: "snarks",
        label: T("The 10,000", "一万张零知卡"),
        html: () =>
          p("Every zkSNARK of the collection is a card, and the rarer it is the stronger it is: its rank gives its rarity and a power budget on top of the usual stats for its cost.", "收藏中的每个零知证明者都是一张卡，越稀有越强：排名决定稀有度，并在同费用的常规属性之上额外加成。") +
          p("Its traits make the rest: its skin sets its pool (warm: Transparent, green and blossom: Sapling, grey and violet: Sprout, blue and cosmic: Orchard, earth and metal: neutral), its head its tribe, its eyes what it does.", "其余由特征决定：皮肤决定池（暖色：透明池；绿色与花色：Sapling；灰与紫：Sprout；蓝与宇宙色：Orchard；大地与金属色：中立），头饰决定种族，眼睛决定能力。") +
          p("Ranks 1–100 and the 26 Apparitions are legendary, 101–1,000 epic, 1,001–3,500 rare. The 676 snarks purged to raise the Apparitions are Ghosts of Sprout. A deck holds one of each zkSNARK.", "排名 1–100 与 26 个显灵者为传说，101–1,000 为史诗，1,001–3,500 为稀有。为唤出显灵者而被净化的 676 个成为 Sprout 的幽灵。每个零知证明者在一副套牌中只能放一张。"),
      },
      {
        k: "deck",
        label: T("Your deck", "你的套牌"),
        html: () =>
          p("Thirty cards of one pool and the neutrals: two of a Classic, one of a legendary, one of each zkSNARK.", "三十张：一个池的卡加中立卡；经典卡最多 2 张，传说 1 张，每个零知证明者 1 张。") +
          p("Win duels for gold, buy and open packs, turn your doubles into zats, craft the cards you miss.", "赢下对决拿金币，购买并开启卡包，把重复卡转为 zat，合成缺的卡。"),
      },
      {
        k: "pools",
        label: T("The four pools", "四个池"),
        html: () => FACTIONS.map((f) => `<p><b style="color:${FACTION_INFO[f].color}">${factionName(f)}</b> — ${esc(T(FACTION_INFO[f].tag, FACTION_INFO[f].tagZh))}</p>`).join(""),
      },
      {
        k: "kw",
        label: T("Keywords", "关键词"),
        html: () => `<dl class="zkf-kw">${Object.entries(KW_HELP)
          .map(([k, v]) => `<div><dt>${kwLabel(k)}</dt><dd>${esc(T(v[0], v[1]))}</dd></div>`)
          .join("")}</dl>`,
      },
    ]);
  }

  private settings() {
    const seg = (k: string, opts: [string, string, string][], cur: string) => `<div class="zkf-optseg" data-k="${k}">${opts.map(([v, a, b]) => `<button data-v="${v}" class="${v === cur ? "on" : ""}"><b>${a}</b><small>${b}</small></button>`).join("")}</div>`;
    this.tabsPanel(T("Settings", "设置"), "ZK Legends", [
      {
        k: "sound",
        label: T("Sound", "声音"),
        html: () => `<label class="zkf-opt">${T("Sound", "声音")}</label>${seg("sound", [["on", T("On", "开"), T("music and effects", "音乐与音效")], ["off", T("Off", "关"), T("silence", "静音")]], this.snd?.muted ? "off" : "on")}`,
        wire: (h) =>
          h.querySelector("[data-k=sound]")?.addEventListener("click", (e) => {
            const b = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
            if (!b || !this.snd) return;
            this.snd.muted = b.dataset.v === "off";
            if (!this.snd.muted) sfx(this.snd, "music", "menu");
            h.querySelectorAll("[data-k=sound] button").forEach((x) => x.classList.toggle("on", x === b));
          }),
      },
      {
        k: "board",
        label: T("Board", "棋盘"),
        html: () => {
          const info = (MAPS_MOD as unknown as { MAP_INFO?: Record<string, { name: string; zh: string }> }).MAP_INFO ?? {};
          let cur = "";
          try {
            cur = localStorage.getItem("street.legends.board") ?? "";
          } catch {
            /* private mode */
          }
          const opts: [string, string, string][] = [["", T("Random", "随机"), T("a new one each duel", "每局随机")], ...MAPS_MOD.MAPS.map((k): [string, string, string] => [k, info[k] ? T(info[k].name, info[k].zh) : k[0].toUpperCase() + k.slice(1), ""])];
          return `<label class="zkf-opt">${T("The arena you duel in", "对决的场地")}</label><div class="zkf-optseg zkf-boards" data-k="board">${opts.map(([v, a, b]) => `<button data-v="${v}" class="${v === cur ? "on" : ""}"><b>${esc(a)}</b>${b ? `<small>${b}</small>` : ""}</button>`).join("")}</div>`;
        },
        wire: (h) =>
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
          }),
      },
      {
        k: "coll",
        label: T("Collection", "收藏"),
        html: () => {
          const s = P.load();
          return `<label class="zkf-opt">${T("This browser keeps", "本浏览器保存")}</label><dl class="zkf-traits"><div><dt>${T("Gold", "金币")}</dt><dd>${fmt(s.gold)}</dd></div><div><dt>Zats</dt><dd>${fmt(s.zats)}</dd></div><div><dt>${T("Packs opened", "已开卡包")}</dt><dd>${s.opened}</dd></div><div><dt>${T("Duels won", "胜场")}</dt><dd>${s.wins} / ${s.played}</dd></div></dl>
            <label class="zkf-opt">${T("Start again", "重新开始")}</label><button class="zkf-btn ghost" data-reset>${T("Reset the collection", "重置收藏")}</button>`;
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

let packData = "";
function packImg(): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "zkf-pack";
  d.style.backgroundImage = `url(${(packData ||= paintPack().toDataURL("image/webp", 0.92))})`;
  return d;
}

/** A deck's face: the pool's champion for a starter, else its rarest card. */
function champion(d: DeckEntry): number {
  const CHAMP: Record<Pool, string> = { transparent: "t_boss", sapling: "s_gardener", sprout: "p_crypt", orchard: "o_sentinel" };
  if (!d.custom) return card(CHAMP[d.pool]).art;
  const order: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3, basic: 4 };
  const best = d.cards
    .map((id) => {
      try {
        return card(id);
      } catch {
        return null;
      }
    })
    .filter((c): c is CardDef => !!c)
    .sort((a, b) => order[a.rarity] - order[b.rarity] || b.cost - a.cost)[0];
  return best?.art ?? card(CHAMP[d.pool]).art;
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
  return `<span class="zkf-curve">${n.map((k, i) => `<span><i style="height:${(k / max) * 100}%"></i><em>${i === 7 ? "7+" : i}</em></span>`).join("")}</span>`;
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
