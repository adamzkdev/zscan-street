/**
 * The tournament's setup: how many mini-games (3, 5, 7, 10: no more than there are), the lineup
 * (picked from the cards, in order: tap a card to add or drop it, tap two slots to swap them; or
 * drawn at random, a roulette before each game, unplayed ones first if asked), the rounds of each
 * game, the stake (practice, free; or a table's buy-in, its rivals with it, the pot split as the
 * board's), the rivals of a practice. index.ts plays it (host.ts playTour).
 */
import { T } from "../i18n/lang";
import { profile } from "../game/profile";
import { bank } from "./bank";
import { GAMES } from "./games";
import { sfx, type MiniDef } from "./kit";
import { LEVELS, ROUND_CHOICES, cardHtml } from "./select";
import { thumbHtml, wireThumbs } from "./thumbs";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export interface TourCfg {
  /** How many games. */
  n: number;
  /** Drawn at random (a roulette before each), or picked. */
  random: boolean;
  /** Random: the games never played come first. */
  unplayed: boolean;
  /** Picked: the lineup's keys, in order. */
  pick: string[];
  /** Rounds in each game. */
  rounds: number;
  /** Practice rivals (0…3). */
  level: number;
  /** A table's buy-in (its index), or -1: practice, free. */
  buy: number;
}

export interface TourHooks {
  start(cfg: TourCfg, games: MiniDef[]): void;
  back(): void;
  /** The tables' buy-ins: the value, the rivals' level that comes with it, whether you may and can pay it. */
  buyins(): { v: number; level: number; name: string; ok: boolean; open: boolean }[];
  /** The chain's live chip (HTML). */
  chain(): string;
}

const KEY = "pt-tour";
const SIZES = [3, 5, 7, 10];
/** The pot's split (as the board's): 4 buy-ins, 50 / 30 / 20. */
export const TOUR_SPLIT = [0.5, 0.3, 0.2, 0];

function load(): TourCfg {
  const d: TourCfg = { n: 5, random: false, unplayed: false, pick: [], rounds: 1, level: 1, buy: -1 };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<TourCfg>;
    return { ...d, ...v, pick: Array.isArray(v.pick) ? v.pick.filter((k) => typeof k === "string") : [] };
  } catch {
    return d;
  }
}

/** The sizes on offer: 3, 5, 7, 10, the last capped at how many games there are. */
export function tourSizes() {
  const max = GAMES.length;
  const out = SIZES.filter((s) => s < max);
  out.push(Math.min(10, max));
  return [...new Set(out)].filter((s) => s >= 2);
}

export class TourSetup {
  readonly el: HTMLElement;
  open = false;
  cfg: TourCfg = load();
  /** A slot picked for a swap (-1: none). */
  private swap = -1;

  constructor(
    parent: HTMLElement,
    private hooks: TourHooks,
  ) {
    this.el = document.createElement("div");
    this.el.className = "pt-sel pt-tour pt-hidden";
    parent.append(this.el);
    this.el.addEventListener("click", (e) => this.click(e));
    this.fix();
  }

  show() {
    if (!this.open) {
      this.open = true;
      window.addEventListener("keydown", this.key, true);
      this.el.classList.add("pt-fresh");
      setTimeout(() => this.el.classList.remove("pt-fresh"), 1100);
    }
    this.el.classList.remove("pt-hidden");
    this.fix();
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    window.removeEventListener("keydown", this.key, true);
    this.el.classList.add("pt-hidden");
  }

  esc() {
    if (this.swap >= 0) {
      this.swap = -1;
      return this.render();
    }
    sfx.blip(1);
    this.hooks.back();
  }

  refresh() {
    if (this.open) this.render();
  }

  /** Keep it sound: a size on offer, a lineup of known games no longer than it. */
  private fix() {
    const c = this.cfg;
    const sizes = tourSizes();
    if (!sizes.includes(c.n)) c.n = sizes.reduce((a, b) => (Math.abs(b - c.n) < Math.abs(a - c.n) ? b : a), sizes[0]);
    c.pick = [...new Set(c.pick.filter((k) => GAMES.some((g) => g.key === k)))].slice(0, c.n);
    if (!ROUND_CHOICES.includes(c.rounds)) c.rounds = 1;
    c.level = Math.max(0, Math.min(LEVELS.length - 1, c.level | 0));
    const b = this.hooks.buyins();
    if (c.buy >= b.length || (c.buy >= 0 && !b[c.buy]?.open)) c.buy = -1;
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.cfg));
    } catch {
      /* private mode */
    }
  }

  /** The lineup it would play now (a random one is drawn at the start, see draw()). */
  private picked(): MiniDef[] {
    return this.cfg.pick.map((k) => GAMES.find((g) => g.key === k)!).filter(Boolean);
  }

  /** A random lineup without repeats (unplayed first when asked): `rnd` from the tournament's block. */
  draw(rnd: () => number): MiniDef[] {
    const places = profile.p.party.places;
    const shuffle = (a: MiniDef[]) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const all = shuffle(GAMES.slice());
    const list = this.cfg.unplayed ? [...all.filter((g) => places[g.key] === undefined), ...all.filter((g) => places[g.key] !== undefined)] : all;
    return list.slice(0, this.cfg.n);
  }

  private ready() {
    const c = this.cfg;
    const b = this.hooks.buyins()[c.buy];
    if (c.buy >= 0 && !b?.ok) return false;
    return c.random || c.pick.length === c.n;
  }

  private render() {
    const c = this.cfg;
    const keepGrid = this.el.querySelector<HTMLElement>(".tour-grid")?.scrollTop ?? 0;
    const keepSet = this.el.querySelector<HTMLElement>(".tour-set")?.scrollTop ?? 0;
    this.el.innerHTML = `
      <div class="sel-bg"><i></i></div>
      <header class="sel-head">
        <button class="sel-back" data-t="back" title="${T("Back to the hall (Esc)", "返回大厅（Esc）")}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><span>${T("Hall", "大厅")}</span></button>
        <div class="sel-title"><small>ZK PARTY</small><b>${T("Tournament", "锦标赛")}<em>${c.n}</em></b></div>
        ${this.hooks.chain()}
      </header>
      <div class="sel-main tour-main">
        <div class="tour-left">
          ${this.lineupHtml()}
          <div class="sel-grid tour-grid${c.random ? " random" : ""}">${GAMES.map((g, i) => {
            const at = c.pick.indexOf(g.key);
            return cardHtml(g, i, !c.random && at >= 0, !c.random && at >= 0 ? `#${at + 1}` : "");
          }).join("")}</div>
        </div>
        <aside class="sel-detail tour-side"><div class="sel-dt tour-set">${this.setHtml()}</div></aside>
      </div>`;
    wireThumbs(this.el);
    const gr = this.el.querySelector<HTMLElement>(".tour-grid");
    if (gr) gr.scrollTop = keepGrid;
    const st = this.el.querySelector<HTMLElement>(".tour-set");
    if (st) st.scrollTop = keepSet;
  }

  private lineupHtml() {
    const c = this.cfg;
    const games = this.picked();
    const slots = Array.from({ length: c.n }, (_, i) => {
      if (c.random) return `<div class="tour-slot q" style="--i:${i}"><span class="tour-q">?</span><em>${i + 1}</em></div>`;
      const g = games[i];
      if (!g) return `<div class="tour-slot empty"><span>+</span><em>${i + 1}</em></div>`;
      return `<div class="tour-slot${this.swap === i ? " sw" : ""}" data-t="slot" data-v="${i}" style="--c:${g.color}" title="${T("Tap two slots to swap them", "点两个位置交换")}">${thumbHtml(g)}<em>${i + 1}</em><button class="tour-x" data-t="drop" data-v="${i}" title="${T("Remove", "移除")}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
    }).join("");
    const head = c.random
      ? T(`Lineup · ${c.n} games drawn at random, one by one`, `出场顺序 · 随机抽取 ${c.n} 场，逐一揭晓`)
      : T(`Lineup · ${games.length} / ${c.n} picked: tap the cards, in order`, `出场顺序 · 已选 ${games.length} / ${c.n}：按顺序点卡片`);
    return `<div class="tour-lineup">
      <div class="tour-lh"><b>${head}</b>${c.random ? "" : `<span><button class="pt-ghost sm" data-t="fill">${T("Fill at random", "随机补满")}</button><button class="pt-ghost sm" data-t="clear" ${games.length ? "" : "disabled"}>${T("Clear", "清空")}</button></span>`}</div>
      <div class="tour-slots" style="--n:${Math.min(c.n, 5)}">${slots}</div>
    </div>`;
  }

  private setHtml() {
    const c = this.cfg;
    const b = this.hooks.buyins();
    const buy = c.buy >= 0 ? b[c.buy] : null;
    const level = buy ? buy.level : c.level;
    const seg = (t: string, items: string) => `<div class="tour-opt"><small>${t}</small><div class="pt-seg">${items}</div></div>`;
    const btn = (k: string, v: number | string, on: boolean, label: string, dis = false, title = "") => `<button data-t="${k}" data-v="${v}" class="${on ? "on" : ""}" ${dis ? "disabled" : ""} ${title ? `title="${esc(title)}"` : ""}>${label}</button>`;
    const pot = buy ? buy.v * 4 : 0;
    const need = c.random ? 0 : c.n - c.pick.length;
    return `
      <h2>${T("Set up", "设置")}</h2>
      ${seg(T("Mini-games", "小游戏数"), tourSizes().map((n) => btn("n", n, n === c.n, String(n))).join(""))}
      ${seg(T("Lineup", "出场"), btn("random", 0, !c.random, T("Pick", "自选")) + btn("random", 1, c.random, T("Random", "随机")))}
      ${c.random ? seg(T("Draw from", "抽取范围"), btn("unplayed", 0, !c.unplayed, T("All games", "全部")) + btn("unplayed", 1, c.unplayed, T("Unplayed first", "未玩优先"))) : ""}
      ${seg(T("Rounds per game", "每场局数"), ROUND_CHOICES.map((n) => btn("rounds", n, n === c.rounds, String(n), false, n === 1 ? T("One round", "一局") : T(`Best of ${n}`, `${n} 局赛`))).join(""))}
      <div class="tour-opt col"><small>${T("Stake", "押注")}</small><div class="pt-chips sm">${btn("buy", -1, c.buy < 0, T("Practice · free", "练习 · 免费"))}${b.map((x, i) => btn("buy", i, c.buy === i, `${bank.money(x.v)}`, !x.open || !x.ok, !x.open ? T("Opens later", "稍后开放") : !x.ok ? T("Not enough chips", "筹码不足") : T(`${x.name} rivals`, `${x.name}对手`))).join("")}</div></div>
      ${seg(T("Rivals", "对手"), LEVELS.map((l, i) => btn("level", i, i === level, T(l.en, l.zh), !!buy)).join(""))}
      <p class="tour-note">${
        buy
          ? T(`Buy-in ${bank.money(buy.v)} · pot ${bank.money(pot)} · 1st ${bank.amount(pot * TOUR_SPLIT[0])} · 2nd ${bank.amount(pot * TOUR_SPLIT[1])} · 3rd ${bank.amount(pot * TOUR_SPLIT[2])}. The rivals come with the table.`, `买入 ${bank.money(buy.v)} · 奖池 ${bank.money(pot)} · 第一 ${bank.amount(pot * TOUR_SPLIT[0])} · 第二 ${bank.amount(pot * TOUR_SPLIT[1])} · 第三 ${bank.amount(pot * TOUR_SPLIT[2])}。对手由牌桌决定。`)
          : T("Free: no chips at stake.", "免费：不押筹码。")
      } ${T("Every game pays points by its final place: 4, 2, 1, 0. Most points wins.", "每场按最终名次计分：4、2、1、0。总分最高者获胜。")}</p>
      <div class="sel-acts">
        <button class="pt-play sel-go" data-t="start" ${this.ready() ? "" : "disabled"}><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>${need > 0 ? T(`Pick ${need} more`, `再选 ${need} 个`) : T("Start", "开始")} <span>${buy ? `${bank.money(buy.v)}` : T("free", "免费")}</span></button>
      </div>`;
  }

  private key = (e: KeyboardEvent) => {
    if (!this.open || this.el.classList.contains("pt-hidden")) return;
    if (this.el.parentElement?.querySelector(".pt-modal.on")) return;
    if (e.code !== "Enter" && e.code !== "NumpadEnter") return;
    const f = document.activeElement as HTMLElement | null;
    if (f && f.tagName === "BUTTON" && this.el.contains(f)) return;
    e.preventDefault();
    if (this.ready()) this.go();
  };

  private go() {
    const games = this.cfg.random ? [] : this.picked();
    this.hooks.start({ ...this.cfg, pick: this.cfg.pick.slice() }, games);
  }

  private click(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const c = this.cfg;
    const card = t.closest<HTMLElement>(".sel-card");
    if (card) {
      const g = GAMES[Number(card.dataset.i)];
      if (!g) return;
      // (a card tapped in a random lineup: you pick, then)
      if (c.random) ((c.random = false), (c.pick = []));
      const at = c.pick.indexOf(g.key);
      if (at >= 0) (c.pick.splice(at, 1), sfx.blip(1));
      else if (c.pick.length < c.n) (c.pick.push(g.key), sfx.blip(4));
      else sfx.lose();
      this.swap = -1;
      this.save();
      return this.render();
    }
    const b = t.closest<HTMLElement>("[data-t]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const a = b.dataset.t;
    const v = Number(b.dataset.v ?? 0);
    if (a === "back") return this.esc();
    if (a === "start") return void (this.ready() && this.go());
    sfx.blip(2);
    if (a === "n") c.n = v;
    else if (a === "random") c.random = v === 1;
    else if (a === "unplayed") c.unplayed = v === 1;
    else if (a === "rounds") c.rounds = v;
    else if (a === "level") c.level = v;
    else if (a === "buy") c.buy = v;
    else if (a === "clear") c.pick = [];
    else if (a === "fill") {
      const rest = GAMES.filter((g) => !c.pick.includes(g.key));
      while (c.pick.length < c.n && rest.length) c.pick.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0].key);
    } else if (a === "drop") {
      e.stopPropagation();
      c.pick.splice(v, 1);
      this.swap = -1;
    } else if (a === "slot") {
      if (this.swap < 0) this.swap = v;
      else if (this.swap === v) this.swap = -1;
      else {
        [c.pick[this.swap], c.pick[v]] = [c.pick[v], c.pick[this.swap]];
        this.swap = -1;
        sfx.blip(5);
      }
    }
    this.fix();
    this.save();
    this.render();
  }
}
