/** Mini-game browser with a modal drawer: arena first, optional rules/settings, persistent play action. */
import "./select.css";
import { T } from "../i18n/lang";
import { profile } from "../game/profile";
import { bank } from "./bank";
import { DUELS, GAMES } from "./games";
import { GENRES, genreName, genreOf, seatsName } from "./genres";
import { ord, sfx, stickOf, variantPick, type Btn, type MiniDef } from "./kit";
import { touchWords, touchy } from "./hud";
import { actsOf, actSvg, actWord } from "./acts";
import { thumbHtml, thumbUrl, wireThumbs } from "./thumbs";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The practice rivals (the tables' skills, in index.ts). */
export const LEVELS = [
  { en: "Easy", zh: "简单" },
  { en: "Normal", zh: "普通" },
  { en: "Hard", zh: "困难" },
  { en: "Pro", zh: "高手" },
];

export interface SelectHooks {
  /** Play it for free against rivals of this level (0…3). */
  practice(def: MiniDef, level: number): void;
  /** Play it for the picked quick-match stake. */
  stake(def: MiniDef): void;
  /** The quick-match stakes: each one's value, whether it is the one picked, whether you can pay it. */
  stakes(): { v: number; on: boolean; ok: boolean }[];
  pickStake(i: number): void;
  /** The rounds of a match (1, 3, 5), shared with the hall's quick match. */
  rounds(): number;
  setRounds(n: number): void;
  /** The live chip of the Zcash block the arenas are seeded from (HTML; empty offline). */
  chain(): string;
  /** Back to the hall. */
  back(): void;
}

/** A medal for a best place (0: gold … 3: a fourth's ribbon). */
export function medalHtml(place: number | undefined, cls = "") {
  if (place === undefined) return "";
  return `<span class="pt-medal ${cls}" data-p="${Math.min(3, place)}" title="${T(`Your best: ${ord(place)}`, `最佳：${ord(place)}`)}"><i>${place + 1}</i></span>`;
}

/** The controls as glyphs: key caps on a computer, the pad's buttons on a phone. */
export function controlsHtml(def: MiniDef) {
  const dirs = def.pad.filter((b): b is Exclude<Btn, "a" | "b"> => b !== "a" && b !== "b");
  const touch = touchy();
  const acts = actsOf(def.key);
  const out: string[] = [];
  if (dirs.length) {
    // (a touch screen: the stick the game gives, a rail for a kart; else the pad's arrows)
    if (touch && stickOf(def)) out.push(`<span class="kc"><i class="stk${def.stick === "x" ? " x" : ""}"><b></b></i><em>${def.stick === "x" ? T("Steer", "转向") : T("Move", "移动")}</em></span>`);
    else if (touch) out.push(`<span class="kc"><i class="dp" data-d="${dirs.join(" ")}"><s></s><s></s></i><em>${T("Move", "移动")}</em></span>`);
    else {
      const four = dirs.includes("up") || dirs.includes("down");
      const keys = four
        ? `<span class="arr2"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd></span>`
        : `<span class="arr2"><kbd>←</kbd><kbd>→</kbd></span>`;
      out.push(`<span class="kc">${keys}<em>${four ? T("Move · WASD", "移动 · WASD") : T("Steer · A D", "转向 · A D")}</em></span>`);
    }
  }
  for (const b of ["a", "b"] as const) {
    if (!def.pad.includes(b)) continue;
    const act = acts[b];
    if (touch) out.push(`<span class="kc"><i class="pb ${b}">${act ? actSvg(act) : b.toUpperCase()}</i><em>${act ? actWord(act) : T(`Button ${b.toUpperCase()}`, `${b.toUpperCase()} 键`)}</em></span>`);
    else
      out.push(
        `<span class="kc"><span class="row"><i class="pb ${b}">${act ? actSvg(act) : b.toUpperCase()}</i><kbd class="w">${b === "a" ? T("Space", "空格") : "Shift"}</kbd></span><em>${act ? actWord(act) : b === "a" ? T("A · Enter", "A · 回车") : "B · X · E"}</em></span>`,
      );
  }
  if (def.tap && touch) out.push(`<span class="kc"><i class="tap">☝</i><em>${T("Tap = A", "点击 = A")}</em></span>`);
  return out.join("");
}

/** A mini-game's card (the hall's grid, the tournament's): its picture, number, medal or NEW, name. `tag`: a chip instead of the number. */
export function cardHtml(g: MiniDef, i: number, on = false, tag = "") {
  const best = profile.p.party.places[g.key];
  return `<button class="sel-card${on ? " on" : ""}" data-i="${i}" role="option" aria-selected="${on}" style="--c:${g.color};--i:${i}">
      <span class="sel-frame">${thumbHtml(g)}
        ${tag ? `<span class="sel-no tag">${tag}</span>` : `<span class="sel-no">${String(i + 1).padStart(2, "0")}</span>`}
        ${best === undefined ? `<span class="pt-new">${T("NEW!", "新！")}</span>` : medalHtml(best)}
      </span>
      <span class="sel-band"><b>${esc(T(g.title, g.titleZh))}</b></span>
      <i class="sel-ptr"></i>
    </button>`;
}

/** How many rounds a match is played over. */
export const ROUND_CHOICES = [1, 3, 5];

/** Every game the hall plays on the stage: the four-player ones, then the duels. */
const LIST: MiniDef[] = [...GAMES, ...DUELS];

export class MiniSelect {
  readonly el: HTMLElement;
  open = false;
  /** The card picked (an index in LIST). */
  at = 0;
  /** The shelf shown ("all", or a genre: genres.ts). */
  genre = "all";
  /** The practice rivals' level (0…3). */
  level = 1;
  private sheet = false;
  private freshT: ReturnType<typeof setTimeout> | undefined;
  private fromHall = false;
  private backdropDown = false;

  constructor(
    parent: HTMLElement,
    private hooks: SelectHooks,
  ) {
    this.el = document.createElement("div");
    this.el.className = "pt-sel sel-browser pt-hidden";
    parent.append(this.el);
    this.el.addEventListener("click", (e) => this.click(e));
    this.el.addEventListener("pointerdown", (e) => {
      this.backdropDown = e.target === this.dialog;
    });
  }

  /** Open it (on a game, by its key). */
  show(key?: string) {
    const i = key ? LIST.findIndex((g) => g.key === key) : -1;
    if (i >= 0) this.at = i;
    // (a game asked for on another shelf: all of them)
    if (i >= 0 && this.genre !== "all" && genreOf(LIST[i]) !== this.genre) this.genre = "all";
    this.at = Math.max(0, Math.min(LIST.length - 1, this.at));
    if (!this.open) {
      this.open = true;
      window.addEventListener("keydown", this.key, true);
    }
    const was = !this.el.classList.contains("pt-hidden");
    this.el.classList.remove("pt-hidden");
    this.fromHall = !!key && !was;
    this.render();
    if (!was) {
      // (the cards pop in when it opens, not at each redraw)
      this.el.classList.add("pt-fresh");
      clearTimeout(this.freshT);
      this.freshT = setTimeout(() => this.el.classList.remove("pt-fresh"), 1100);
    }
    this.setSheet(!!key);
    requestAnimationFrame(() => this.card(this.at)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    window.removeEventListener("keydown", this.key, true);
    this.el.classList.add("pt-hidden");
    this.setSheet(false);
  }

  /** Esc: the sheet first, then back to the hall. */
  esc() {
    if (this.sheet) return this.closeDetails();
    sfx.blip(1);
    this.hooks.back();
  }

  /** Redraw (after a game: the medals, the stakes you can pay). */
  refresh() {
    if (this.open) this.render();
  }

  private get def() {
    return LIST[this.at];
  }

  /** Is card i on the shelf shown? */
  private shown(i: number) {
    return this.genre === "all" || genreOf(LIST[i]) === this.genre;
  }

  private card(i: number) {
    return this.el.querySelector<HTMLElement>(`.sel-card[data-i="${i}"]`);
  }

  private get dialog() {
    return this.el.querySelector<HTMLDialogElement>(".sel-drawer");
  }

  private render() {
    const reopen = this.sheet;
    const folds = [...this.el.querySelectorAll<HTMLDetailsElement>("details[open]")].map((d) => d.dataset.fold);
    const scroll = this.el.querySelector(".sel-scroll")?.scrollTop ?? 0;
    this.dialog?.close();
    const places = profile.p.party.places;
    const def = this.def;
    const medals = [0, 0, 0];
    let played = 0;
    for (const g of LIST) {
      const b = places[g.key];
      if (b !== undefined) played++;
      if (b !== undefined && b < 3) medals[b]++;
    }
    this.el.style.setProperty("--c", def.color);
    this.el.innerHTML = `
      <div class="sel-bg"><i></i></div>
      <header class="sel-head">
        <button class="sel-back" data-s="back" title="${T("Back to the hall (Esc)", "返回大厅（Esc）")}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><span>${T("Hall", "大厅")}</span></button>
        <div class="sel-title"><small>ZK PARTY</small><b>${T("Mini-games", "小游戏")}<em>${LIST.length}</em></b></div>
        ${this.hooks.chain()}
        <div class="sel-sum">
          <span title="${T("Gold medals", "金牌")}">${medalHtml(0, "xs")}<b>${medals[0]}</b></span>
          <span title="${T("Silver medals", "银牌")}">${medalHtml(1, "xs")}<b>${medals[1]}</b></span>
          <span title="${T("Bronze medals", "铜牌")}">${medalHtml(2, "xs")}<b>${medals[2]}</b></span>
          <span class="sel-played"><b>${played}/${LIST.length}</b><small>${T("played", "已玩")}</small></span>
        </div>
      </header>
      <nav class="sel-genres" aria-label="${T("Kinds of games", "游戏类型")}">
        <button data-s="genre" data-v="all" class="${this.genre === "all" ? "on" : ""}">${T("All", "全部")}<em>${LIST.length}</em></button>
        ${GENRES.map((g) => {
          const n = LIST.filter((x) => genreOf(x) === g.k).length;
          return n ? `<button data-s="genre" data-v="${g.k}" class="${this.genre === g.k ? "on" : ""}">${T(g.en, g.zh)}<em>${n}</em></button>` : "";
        }).join("")}
      </nav>
      <div class="sel-main">
        <div class="sel-grid" role="listbox" aria-label="${T("Mini-games", "小游戏")}">${LIST.map((g, i) => this.cardHtml(g, i)).join("")}</div>
      </div>
      <footer class="sel-hints">
        <span><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd>${T("Choose", "选择")}</span>
        <span><kbd class="w">Enter</kbd>${T("Details", "详情")}</span>
        <span><kbd class="w">Esc</kbd>${T("Back", "返回")}</span>
      </footer>
      <dialog class="sel-detail sel-drawer" aria-labelledby="sel-game-title">${this.detailHtml(def)}</dialog>`;
    this.dialog?.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.closeDetails();
    });
    wireThumbs(this.el);
    for (const d of this.el.querySelectorAll<HTMLDetailsElement>("details")) d.open = folds.includes(d.dataset.fold);
    if (reopen) {
      this.setSheet(true);
      this.el.querySelector(".sel-scroll")?.scrollTo({ top: scroll });
    }
  }

  private cardHtml(g: MiniDef, i: number) {
    const html = cardHtml(g, i, i === this.at);
    return this.shown(i) ? html : html.replace(/^<(\w+)/, "<$1 hidden");
  }

  private detailHtml(def: MiniDef) {
    const best = profile.p.party.places[def.key];
    return `<div class="sel-dt" style="--c:${def.color}">
      <header class="sel-drawer-head">
        <div><small>ZK PARTY <span> / ${T("MINI-GAME", "小游戏")}</span></small><h2 id="sel-game-title">${esc(T(def.title, def.titleZh))}</h2></div>
        <button type="button" class="sel-x" data-s="close" aria-label="${T("Close game details", "关闭游戏详情")}" autofocus><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="sel-scroll">
        <div class="sel-big">${thumbHtml(this.bigDef(def), "big")}
          ${best === undefined ? "" : `<span class="sel-bestb">${medalHtml(best)}<span>${T("Your best", "你的最佳")} <b>${ord(best)}</b></span>`}
        </div>
        <p class="sel-kind"><span>${genreName(genreOf(def))}</span><span>${seatsName(def)}</span></p>
        <p class="sel-tag">${esc(T(def.tag, def.tagZh))}</p>
        <section class="sel-arena-picker">
          ${this.tracksHtml(def)}
          ${this.arenaHtml(def)}
        </section>
        <details class="sel-fold" data-fold="rules">
          <summary>${T("How to play", "玩法")}<span>${T("Rules & controls", "规则与操作")}</span></summary>
          <div class="sel-fold-body"><p>${esc(touchWords(T(def.help, def.helpZh), def))}</p><div class="sel-ctl">${controlsHtml(def)}</div></div>
        </details>
        <details class="sel-fold" data-fold="settings">
          <summary>${T("Match settings", "对局设置")}<span class="sel-settings-summary">${this.settingsSummary()}</span></summary>
          <div class="sel-fold-body sel-opts">
            <div class="sel-opt"><small>${T("Rounds", "局数")}</small><div class="pt-seg">${ROUND_CHOICES.map((n) => `<button data-s="mrounds" data-v="${n}" class="${n === this.hooks.rounds() ? "on" : ""}" aria-pressed="${n === this.hooks.rounds()}">${n}</button>`).join("")}</div></div>
            <div class="sel-opt"><small>${T("Rivals", "对手")}</small><div class="pt-seg">${LEVELS.map((l, i) => `<button data-s="level" data-v="${i}" class="${i === this.level ? "on" : ""}" aria-pressed="${i === this.level}">${T(l.en, l.zh)}</button>`).join("")}</div></div>
          </div>
        </details>
        <details class="sel-fold" data-fold="stakes">
          <summary>${T("Play for ⓩ", "押 ⓩ")}<span>${T("Optional", "可选")}</span></summary>
          <div class="sel-fold-body">${this.stakeHtml()}</div>
        </details>
      </div>
      <footer class="sel-drawer-foot">
        <button class="pt-play sel-go" data-s="practice"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>${T("Play now", "开始游戏")}<span>${T("Free practice", "免费练习")}</span></button>
      </footer>
    </div>`;
  }

  private settingsSummary() {
    const n = this.hooks.rounds();
    return `${T(LEVELS[this.level].en, LEVELS[this.level].zh)} · ${T(`${n} ${n === 1 ? "round" : "rounds"}`, `${n} 局`)}`;
  }

  private updateSettings() {
    const summary = this.el.querySelector(".sel-settings-summary");
    if (summary) summary.textContent = this.settingsSummary();
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-s="level"], [data-s="mrounds"]')) {
      const on = Number(b.dataset.v) === (b.dataset.s === "level" ? this.level : this.hooks.rounds());
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }

  private stakeHtml() {
    const stakes = this.hooks.stakes();
    const st = stakes.find((s) => s.on) ?? stakes[0];
    return `<div class="sel-stake">
      <small>${this.def.seats === 2 ? T(`Win and take ${bank.money((st?.v ?? 0) * 2)}`, `获胜拿走 ${bank.money((st?.v ?? 0) * 2)}`) : T(`1st wins ${bank.money((st?.v ?? 0) * 3)} · 2nd gets the stake back`, `第一赢 ${bank.money((st?.v ?? 0) * 3)} · 第二退回押注`)}</small>
      <div class="pt-chips sm">${stakes.map((s, i) => `<button data-s="stakev" data-v="${i}" class="${s.on ? "on" : ""}" aria-pressed="${s.on}" ${s.ok ? "" : "disabled"}>${bank.amount(s.v)}</button>`).join("")}</div>
      <button class="pt-gold" data-s="stake" ${st?.ok ? "" : "disabled"}>${T("Play", "开玩")} <span>${bank.money(st?.v ?? 0)}</span></button>
    </div>`;
  }

  /** The big picture: the track picked (a game with versions), else the game's own. */
  private bigDef(def: MiniDef): MiniDef {
    const v = def.variants?.find((x) => x.key === variantPick.get(def.key));
    return v ? { ...def, key: v.thumb ?? `${def.key}-${v.key}`, title: v.title, titleZh: v.titleZh } : def;
  }

  /** Explain the selected arena's scenery and twist before the player commits to a round. */
  private arenaHtml(def: MiniDef) {
    if (!def.variants?.length) return "";
    const v = def.variants.find((x) => x.key === variantPick.get(def.key));
    const title = v ? T(v.title, v.titleZh) : T("Random arena", "随机场地");
    const detail = v ? T(v.tag ?? def.tag, v.tagZh ?? def.tagZh) : T(`Discover one of ${def.variants.length} arenas each round.`, `每局探索 ${def.variants.length} 个场地之一。`);
    return `<div class="sel-arena" aria-live="polite"><span>${esc(title)}</span><p>${esc(detail)}</p></div>`;
  }

  /** A game with versions (kart tracks): a picker, each one's picture, and "Random". */
  private tracksHtml(def: MiniDef) {
    const vs = def.variants;
    if (!vs?.length) return "";
    const pick = variantPick.get(def.key) ?? "";
    const item = (key: string, title: string, img: string) =>
      `<button class="sel-trk${key === pick ? " on" : ""}" data-s="track" data-v="${key}" aria-pressed="${key === pick}" title="${esc(title)}"><span class="sel-tth">${img}</span><b>${esc(title)}</b></button>`;
    return `<div class="sel-tracks"><small>${def.key === "kart" ? T("Track", "赛道") : T("Arena", "场地")}</small><div class="sel-trks">
      ${item("", T("Random", "随机"), `<i class="sel-rnd">?</i>`)}
      ${vs.map((v) => item(v.key, T(v.title, v.titleZh), `<img src="${thumbUrl(v.thumb ?? `${def.key}-${v.key}`)}" alt="" draggable="false" onerror="this.remove()" />`)).join("")}
    </div></div>`;
  }

  /** Pick card i: the highlight moves, the panel shows it. */
  private pick(i: number, o: { focus?: boolean; sound?: boolean } = {}) {
    i = Math.max(0, Math.min(LIST.length - 1, i));
    const was = this.at;
    this.at = i;
    if (was !== i) {
      const a = this.card(was);
      a?.classList.remove("on");
      a?.setAttribute("aria-selected", "false");
    }
    const c = this.card(i);
    c?.classList.add("on");
    c?.setAttribute("aria-selected", "true");
    if (o.focus) c?.focus({ preventScroll: true });
    c?.scrollIntoView({ block: "nearest", inline: "nearest" });
    this.el.style.setProperty("--c", this.def.color);
    if (was !== i || !this.el.querySelector(".sel-dt")) {
      const d = this.el.querySelector<HTMLElement>(".sel-detail");
      if (d) {
        d.innerHTML = this.detailHtml(this.def);
        wireThumbs(d);
      }
    }
    if (o.sound !== false && was !== i) sfx.blip(3);
  }

  private setSheet(on: boolean) {
    this.sheet = on;
    this.el.classList.toggle("sheet", on);
    const dialog = this.dialog;
    if (on && dialog && !dialog.open) dialog.showModal();
    else if (!on && dialog?.open) dialog.close();
  }

  private closeDetails() {
    this.setSheet(false);
    if (this.fromHall) {
      this.fromHall = false;
      this.hooks.back();
      this.el.parentElement?.querySelector<HTMLElement>(`[data-a="pick"][data-v="${this.def.key}"]`)?.focus({ preventScroll: true });
    } else this.card(this.at)?.focus({ preventScroll: true });
  }

  /** How many cards on a row of the grid, as laid out now. */
  private cols() {
    const cards = [...this.el.querySelectorAll<HTMLElement>(".sel-card")].filter((c) => !c.hidden);
    if (!cards.length) return 1;
    const top = cards[0].offsetTop;
    let n = 0;
    for (const c of cards) {
      if (c.offsetTop !== top) break;
      n++;
    }
    return Math.max(1, n);
  }

  private key = (e: KeyboardEvent) => {
    if (!this.open || this.el.classList.contains("pt-hidden")) return;
    if ((e.target as HTMLElement).closest?.("input,textarea")) return;
    // (a dialog over the hall has the keys)
    if (this.el.parentElement?.querySelector(".pt-modal.on")) return;
    // Native dialog controls own their keys, including Space on an accordion summary.
    if (this.sheet) return;
    const c = e.code;
    const move = (d: number) => {
      e.preventDefault();
      // (along the cards on the shelf shown)
      const vis = LIST.map((_, i) => i).filter((i) => this.shown(i));
      const at = Math.max(0, vis.indexOf(this.at));
      const to = vis[Math.max(0, Math.min(vis.length - 1, at + d))];
      if (to !== undefined) this.pick(to, { focus: true });
    };
    if (c === "ArrowLeft" || c === "KeyA" || c === "KeyQ") return move(-1);
    if (c === "ArrowRight" || c === "KeyD") return move(1);
    if (c === "ArrowUp" || c === "KeyW" || c === "KeyZ") return move(-this.cols());
    if (c === "ArrowDown" || c === "KeyS") return move(this.cols());
    if (c === "Enter" || c === "Space" || c === "NumpadEnter") {
      // (a button of the panel in focus answers its own key)
      const f = document.activeElement as HTMLElement | null;
      if (f && f.closest(".sel-detail, .sel-head") && f.tagName === "BUTTON") return;
      e.preventDefault();
      this.setSheet(true);
    }
  };

  private click(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>(".sel-card");
    if (card) {
      const i = Number(card.dataset.i);
      this.pick(i);
      this.setSheet(true);
      sfx.blip(4);
      return;
    }
    if (t === this.dialog && this.sheet && this.backdropDown) return this.closeDetails();
    const b = t.closest<HTMLElement>("[data-s]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const a = b.dataset.s;
    const v = Number(b.dataset.v ?? 0);
    if (a === "back") return this.esc();
    if (a === "genre") {
      this.genre = b.dataset.v ?? "all";
      sfx.blip(2);
      if (!this.shown(this.at)) this.at = LIST.findIndex((_, i) => this.shown(i));
      this.render();
      return;
    }
    if (a === "close") return (sfx.blip(1), this.closeDetails());
    if (a === "practice") return this.hooks.practice(this.def, this.level);
    if (a === "stake") return this.hooks.stake(this.def);
    if (a === "track") {
      const key = b.dataset.v ?? "";
      if (key) variantPick.set(this.def.key, key);
      else variantPick.delete(this.def.key);
      sfx.blip(2);
      this.el.querySelectorAll<HTMLElement>('[data-s="track"]').forEach((x) => {
        const on = (x.dataset.v ?? "") === key;
        x.classList.toggle("on", on);
        x.setAttribute("aria-pressed", String(on));
      });
      const arena = this.el.querySelector(".sel-arena");
      if (arena) arena.outerHTML = this.arenaHtml(this.def);
      const big = this.el.querySelector<HTMLElement>(".sel-big .pt-th");
      if (big) {
        big.outerHTML = thumbHtml(this.bigDef(this.def), "big");
        wireThumbs(this.el.querySelector(".sel-big")!);
      }
      return;
    }
    if (a === "mrounds") {
      this.hooks.setRounds(v);
      sfx.blip(2);
      this.updateSettings();
      return;
    }
    if (a === "level") {
      this.level = v;
      sfx.blip(2);
      this.updateSettings();
      return;
    }
    if (a === "stakev") {
      this.hooks.pickStake(v);
      sfx.blip(2);
      const stake = this.el.querySelector(".sel-stake");
      if (stake) {
        stake.outerHTML = this.stakeHtml();
        this.el.querySelector<HTMLElement>(`[data-s="stakev"][data-v="${v}"]`)?.focus({ preventScroll: true });
      }
    }
  }
}
