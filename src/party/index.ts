/**
 * ZK PARTY, the city's game hall: you against three zkSNARKs, for ⓩ (the city's play chips,
 * never real ZEC).
 *
 * - ZK PARTY: the 3D party board (board.ts; its maps in board/maps.ts, picked on the card or drawn), 10, 15 or 20 turns, a mini-game
 *   after every turn; a buy-in per table, the pot (four buy-ins) shared 50 / 30 / 20 between the
 *   first three.
 * - A mini-game for chips (from the mini-game hall): first takes three stakes, second gets theirs back.
 * - PRACTICE: any mini-game, free, from the mini-game hall (select.ts), which also plays one for
 *   a quick-match stake.
 * - TOURNAMENT (tour.ts): 3 to 10 mini-games in a row, picked or drawn, free or for a buy-in.
 * A quick match or a practice may be played over 1, 3 or 5 rounds (host.ts playMatch): one stake,
 * paid on the final ranking; it counts as one mini-game played.
 * Before each board mini-game you may back yourself at odds read from the rivals' skill.
 * Every match's arena (its layout, the dice) is seeded by the latest real Zcash block (chain.ts),
 * shown on the rules card; offline, by the clock. No ⓩ or ZEC touch the chain.
 * - ONLINE (online.ts): a private room with friends, by code or link, its lobby; a name, no wallet.
 *
 * Loaded on demand (main.ts imports it on the first click on PLAY); `openParty` shows the hub.
 */
import "./party.css";
import "./hall.css";
import { fullscreenDo, fullscreenHtml } from "../game/fullscreen";
import { orient } from "../game/orient";
import { myId, personImage, rivalIds } from "./people";
import { T, isZh } from "../i18n/lang";
import { party as mixer } from "../audio/engine";
import { profile } from "../game/profile";
import { bank } from "./bank";
import { levelOf, progress } from "../game/progress";
import { Board, TURN_CHOICES } from "./board";
import { MAPS } from "./board/maps";
import { GAMES, gameOf } from "./games";
import { Stage, partyMusic, playMatch, playTour, setArenaBlock, type RoundSeed } from "./host";
import { TOUR_SPLIT, TourSetup, type TourCfg } from "./tour";
import { chainSeed, seedFor, watchChain, type ChainSeed } from "./chain";
import { makePlayer, ord, paidPlace, rng, sfx, variantPick, type MiniDef, type Player } from "./kit";
import { MiniSelect, ROUND_CHOICES, medalHtml } from "./select";
import { thumbHtml, wireThumbs } from "./thumbs";
import { music, type SongKey } from "./music";
import { Online } from "./online";
import { RoomBoardNet } from "./net/roomboard";
import type { RoomClient } from "../net/rooms";
import type { Settings, StartSeat } from "../../server/rooms/protocol";
import { HOUSE_TABLES } from "../tables/catalog";
import { soloUrl } from "../game/solo";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => Math.round(n).toLocaleString("en-US");
/** The board card's picture (shot from the bench: partylab.html?board&shot). */
const BOARD_ART = `${import.meta.env?.BASE_URL ?? "/"}party/thumbs/board.jpg`;
/** A board's picture: GENESIS HARBOR's is the card's own (board.jpg), the others' board-<key>.jpg. */
const boardArt = (key: string) => (key === "genesis" ? BOARD_ART : `${import.meta.env?.BASE_URL ?? "/"}party/thumbs/board-${key}.jpg`);
const MKEY = "pt-board-map";
/** The board last picked ("": Random; GENESIS HARBOR at first). */
function loadMap() {
  try {
    const k = localStorage.getItem(MKEY) ?? "genesis";
    return k === "" || MAPS.some((m) => m.key === k) ? k : "genesis";
  } catch {
    return "genesis";
  }
}
/** A screen just opened: its cards pop in (once, not at each redraw). */
const RKEY = "pt-mini-rounds";
const TKEY = "pt-board-turns";
/** The board's length last chosen (10, 15, 20 turns). */
function loadTurns() {
  try {
    const n = Number(localStorage.getItem(TKEY));
    return TURN_CHOICES.includes(n) ? n : 10;
  } catch {
    return 10;
  }
}
/** The rounds of a match last chosen (1, 3, 5). */
function loadRounds() {
  try {
    const n = Number(localStorage.getItem(RKEY));
    return ROUND_CHOICES.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}
export function fresh(el: HTMLElement) {
  el.classList.add("pt-fresh");
  clearTimeout(Number(el.dataset.fresh));
  el.dataset.fresh = String(setTimeout(() => el.classList.remove("pt-fresh"), 1100));
}

/** The tables: a buy-in, the rivals' skill, the level that opens them (all open from the start). */
const TABLES = [
  { key: "street", en: "Street", zh: "街头", buy: 25, level: 1, skill: [0.22, 0.32, 0.42] },
  { key: "downtown", en: "Downtown", zh: "市中心", buy: 100, level: 1, skill: [0.38, 0.48, 0.58] },
  { key: "high", en: "High Roller", zh: "豪客", buy: 500, level: 1, skill: [0.55, 0.66, 0.76] },
  { key: "whale", en: "Whale Room", zh: "巨鲸厅", buy: 2000, level: 1, skill: [0.74, 0.84, 0.92] },
] as const;
const SPLIT = [0.5, 0.3, 0.2, 0];
/** Quick match stakes, and the table whose rivals they meet. */
const STAKES = [
  { v: 10, table: 0, level: 1 },
  { v: 50, table: 1, level: 1 },
  { v: 200, table: 2, level: 1 },
  { v: 1000, table: 3, level: 1 },
];

/** The rivals' names: the city's regulars at the game hall. */

/** What it pays to back yourself in a mini-game against these rivals (an 8 % house edge). */
function oddsFor(players: Player[]) {
  const w = players.filter((p) => !p.human).reduce((s, p) => s + Math.exp(2.2 * (p.skill - 0.5)), 0);
  const pWin = 1 / (1 + w);
  return Math.max(1.6, Math.round((0.92 / pWin) * 10) / 10);
}

export interface PartyHooks {
  /** The hall opened or closed (the city pauses under it). */
  shown(on: boolean): void;
  /** The Block Casino, over the city (game/casino.ts): bets settled by the next real block's hash. */
  casino?(): void;
  /** Over the city (not on a game page of its own): a GAME HOUSE table opens in place (party/city.ts). */
  table?(key: string): void;
}

class Party {
  private root: HTMLElement;
  private hub: HTMLElement;
  private stage: Stage;
  private quitBtn: HTMLButtonElement;
  private modal: HTMLElement;
  /** The mini-game hall (select.ts), over the hub. */
  private sel: MiniSelect;
  private table = 1;
  private stake = 1;
  /** The board's length in turns (10, 15, 20). */
  private turns = loadTurns();
  /** The board picked on the card ("": drawn at random each game). */
  private bmap = loadMap();
  private playing = false;
  private open = false;
  private lastQuick = "";
  /** The latest Zcash block seen (the hall's live chip), and the watch that keeps it fresh. */
  private block: ChainSeed | null = null;
  private stopWatch: (() => void) | null = null;
  /** A match is on its way (reading its block): no second one. */
  private starting = false;
  /** What is being played (the leave dialog's words). */
  private mode: "board" | "quick" | "practice" | "tour" | "tourFree" = "practice";
  /** The rounds of a quick match or a practice (1, 3, 5): the hall and the mini-game hall share it. */
  private mRounds = loadRounds();
  /** The tournament's setup screen. */
  private tour: TourSetup;
  /** Online: the hub's card, the lobby of a room. */
  private online: Online;
  private escKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.modal.classList.contains("on")) return this.modalEsc?.();
    if (this.playing) return void this.askQuit();
    if (this.boardDialog?.open) return this.closeBoardSetup();
    if (this.online.esc()) return;
    if (this.tour.open) return this.tour.esc();
    if (this.sel.open) return this.sel.esc();
    this.close();
  };
  private modalEsc: (() => void) | null = null;
  /** While the hall is up the keys are its own: none reach the city under it (G, F, the map's). */
  private swallow = (e: KeyboardEvent) => {
    if (this.open && !(e.target as HTMLElement).closest?.("input,textarea")) e.stopPropagation();
  };

  constructor(private hooks: PartyHooks) {
    // the hall's music: a calm lobby loop in the hub, a lighter one between rounds and games
    const loop = (k: SongKey) => music.playing !== k && music.play(k);
    partyMusic.lobby = () => loop("lobby");
    partyMusic.standings = () => loop("standings");
    partyMusic.roulette = () => loop("standings");
    this.root = document.createElement("div");
    this.root.className = "pt-root pt-off";
    this.hub = document.createElement("div");
    this.hub.className = "pt-hub";
    this.root.append(this.hub);
    this.stage = new Stage(this.root);
    this.stage.el.classList.add("pt-hidden");
    this.quitBtn = document.createElement("button");
    this.quitBtn.className = "pt-quit";
    this.quitBtn.title = T("Pause", "暂停");
    this.quitBtn.setAttribute("aria-label", T("Pause", "暂停"));
    this.quitBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8.5 5v14M15.5 5v14"/></svg>`;
    this.quitBtn.addEventListener("click", () => this.askQuit());
    this.stage.el.append(this.quitBtn);
    this.sel = new MiniSelect(this.root, {
      practice: (def, level) => void this.playPractice(def.key, level, true),
      stake: (def) => void this.playQuick(def, true),
      stakes: () => {
        const lv = levelOf(profile.p.xp).level;
        return STAKES.map((s, i) => ({ v: s.v, on: i === this.stake, ok: bank.bal() >= s.v && lv >= s.level }));
      },
      pickStake: (i) => (this.stake = i),
      chain: () => this.chainHtml(),
      rounds: () => this.mRounds,
      setRounds: (n) => this.setRounds(n),
      back: () => {
        this.sel.hide();
        this.renderHub();
      },
    });
    this.sel.level = Math.min(this.table, 1);
    this.tour = new TourSetup(this.root, {
      start: (cfg, games) => void this.playTournament(cfg, games),
      back: () => {
        this.tour.hide();
        this.renderHub();
      },
      buyins: () => {
        const lv = levelOf(profile.p.xp).level;
        return TABLES.map((t, i) => ({ v: t.buy, level: i, name: T(t.en, t.zh), open: lv >= t.level, ok: bank.bal() >= t.buy }));
      },
      chain: () => this.chainHtml(),
    });
    this.modal = document.createElement("div");
    this.modal.className = "pt-modal";
    this.root.append(this.modal);
    this.online = new Online(this.root, {
      toast: (s, k) => this.toast(s, k ?? "info"),
      hub: () => this.open && !this.playing && this.renderHub(),
      play: (room, seed, seats, settings) => this.playRoom(room, seed, seats, settings),
    });
    document.body.append(this.root);
    this.hub.addEventListener("click", (e) => {
      // (over the city: a table opens in place, the hall steps aside; on party.html its own page)
      const t = (e.target as HTMLElement).closest<HTMLElement>("a[data-table]");
      if (t && this.hooks.table) {
        e.preventDefault();
        const key = t.dataset.table!;
        this.close();
        return void setTimeout(() => this.hooks.table?.(key), 0);
      }
      this.click(e);
    });
    // fall back to the first table the level allows
    this.table = Math.min(this.table, this.maxTable());
    profile.subscribe(() => {
      if (!this.open || this.playing) return;
      this.renderTop();
      this.sel.refresh();
      this.tour.refresh();
    });
    progress.on((e) => {
      if (!this.open) return;
      if (e.kind === "level") this.toast(T(`Level ${e.level}! +ⓩ ${num(e.prize)}`, `升到 ${e.level} 级！+ⓩ ${num(e.prize)}`), "level");
      else if (e.kind === "mission") this.toast(T(`Mission done: ${e.m.title} · claim ⓩ ${e.m.prize}`, `任务完成：${e.m.title} · 领取 ⓩ ${e.m.prize}`), "mission");
    });
  }

  private maxTable() {
    const lv = levelOf(profile.p.xp).level;
    let k = 0;
    TABLES.forEach((t, i) => lv >= t.level && (k = i));
    return k;
  }

  show(tab?: "board" | "quick" | "practice") {
    if (!this.open) {
      this.open = true;
      this.root.classList.remove("pt-off");
      window.addEventListener("keydown", this.escKey, true);
      window.addEventListener("keydown", this.swallow, true);
      window.addEventListener("keyup", this.swallow, true);
      this.hooks.shown(true);
      this.watch(true);
      partyMusic.lobby?.();
    }
    // The hall adapts to either orientation; returning from a round needs no extra rotation.
    if (!this.playing) orient("any");
    this.renderHub();
    fresh(this.hub);
    if (tab) this.hub.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ block: "nearest" });
    sfx.blip(4);
  }

  /** The tournament setup, straight away (the Game House's desk). */
  openTour() {
    if (!this.playing) this.tour.show();
  }
  /** The selection, on one game or on the whole grid (the Game House's wall). */
  openSelect(key?: string) {
    if (!this.playing) this.sel.show(key);
  }
  /** An online room, from its link (party.html?room=CODE). */
  joinRoom(code: string) {
    if (!this.playing) this.online.invite(code);
  }

  close() {
    if (!this.open || this.playing) return;
    this.open = false;
    this.boardDialog?.close();
    this.root.classList.add("pt-off");
    this.sel.hide();
    this.tour.hide();
    this.online.shutdown();
    this.watch(false);
    this.reading(false);
    window.removeEventListener("keydown", this.escKey, true);
    window.removeEventListener("keydown", this.swallow, true);
    window.removeEventListener("keyup", this.swallow, true);
    music.stop(0.6);
    // (back to the city: either way again)
    orient("any");
    this.hooks.shown(false);
  }

  // ---- the hub --------------------------------------------------------------------------------

  private you(): Player {
    return makePlayer(0, myId(), true, 0.5, T("You", "你"));
  }

  private rivals(skill: readonly number[], seed: number): Player[] {
    const r = rng(seed);
    const ids = rivalIds(skill.length, r);
    // (rivals are zkSNARKs, by their ZStreet names: game/personas.ts)
    return skill.map((s, i) => makePlayer(i + 1, ids[i], false, Math.min(0.97, s + (r() - 0.5) * 0.06)));
  }

  private renderTop() {
    const top = this.hub.querySelector(".pt-me");
    if (top) top.outerHTML = this.meHtml();
    this.hub.querySelectorAll<HTMLButtonElement>("[data-need]").forEach((b) => (b.disabled = bank.bal() < Number(b.dataset.need)));
  }

  private meHtml() {
    const lv = levelOf(profile.p.xp);
    const id = myId();
    return `<div class="pt-me">
      <span class="pt-av"><img src="${personImage(id)}" alt="" /><em>${lv.level}</em></span>
      <div class="pt-lv"><b>${T("Level", "等级")} ${lv.level}</b><span class="pt-xp"><i style="width:${Math.round(lv.k * 100)}%"></i></span><small>${num(lv.into)} / ${num(lv.need)} XP</small></div>
      <div class="pt-wallets" role="group" aria-label="${T("Play money", "游戏币")}">
        <span class="pt-bal on" title="${T("ⓩ: ZStreet's play money, never ZEC", "ⓩ：ZStreet 的游戏币，绝非 ZEC")}"><small>ⓩ</small><b><i class="pt-q">Z</i>${num(profile.p.z)}</b></span>
      </div>
      ${profile.p.streak > 1 ? `<div class="pt-streak" title="${T("Days in a row", "连续天数")}"><b>${profile.p.streak}</b><small>${T("day streak", "天连续")}</small></div>` : ""}
    </div>`;
  }

  /** The hub's shelf: every mini-game as a card (its picture, your medal or NEW); a click opens the mini-game hall on it. */
  private shelfHtml() {
    const ps = profile.p.party;
    return GAMES.map((g, i) => {
      const best = ps.places[g.key];
      return `<button class="pt-mg" data-a="pick" data-v="${g.key}" style="--c:${g.color};--i:${i}" title="${esc(T(g.tag, g.tagZh))}">
        <span class="pt-mg-th">${thumbHtml(g)}${best === undefined ? `<span class="pt-new">${T("NEW!", "新！")}</span>` : medalHtml(best)}</span>
        <b>${esc(T(g.title, g.titleZh))}</b>
      </button>`;
    }).join("");
  }

  /** Table games use their own page so mobile browsers keep only one game renderer alive. */
  private tableUrl(key: string) {
    const ret = new URL(/\/party(?:\.html)?$/.test(location.pathname) ? location.href : soloUrl("party", {}), location.origin);
    ret.searchParams.delete("game");
    ret.searchParams.delete("room");
    ret.searchParams.set("tab", "board");
    const q = new URLSearchParams({ t: key, ret: ret.pathname + ret.search });
    return `${import.meta.env.BASE_URL}table.html?${q}`;
  }

  private libraryHtml() {
    const board = { key: "board", title: "ZK Party", titleZh: "ZK Party", color: "#ff6b35" };
    return `<button class="pt-mg pt-library-game" data-a="board-setup" style="--c:${board.color}">
      <span class="pt-mg-th">${thumbHtml(board)}</span><b>ZK Party</b><small>${T("Party board · 4 seats", "派对棋盘 · 4 人")}</small>
    </button>` + HOUSE_TABLES.map((g) => `<a class="pt-mg pt-library-game" href="${esc(this.tableUrl(g.key))}" data-table="${g.key}" style="--c:${g.color}" title="${esc(T(g.tag, g.tagZh))}">
      <span class="pt-mg-th">${thumbHtml({ ...g, key: `tables-${g.key}` })}</span><b>${esc(T(g.title, g.titleZh))}</b><small>${g.key === "barons" ? T("Property trading", "地产交易") : g.key === "holdem" ? T("Poker", "扑克") : T("Card game", "纸牌游戏")} <span>· ${g.seats}</span></small>
    </a>`).join("");
  }

  private get boardDialog() { return this.hub.querySelector<HTMLDialogElement>(".pt-board-dialog"); }

  private closeBoardSetup() {
    this.boardDialog?.close();
    this.hub.querySelector<HTMLElement>('[data-a="board-setup"]')?.focus({ preventScroll: true });
  }

  private renderHub() {
    const lv = levelOf(profile.p.xp).level;
    const tb = TABLES[this.table];
    const missions = progress.missions();
    const refill = progress.refill();
    const ps = profile.p.party;
    const keepShelf = this.hub.querySelector<HTMLElement>(".pt-shelf")?.scrollLeft ?? 0;
    const keepY = this.hub.scrollTop;
    const keepBoardOptions = this.hub.querySelector<HTMLDetailsElement>(".pt-board-options")?.open ?? false;
    const keepBoardOpen = this.boardDialog?.open ?? false;
    const keepBoardScroll = this.hub.querySelector(".pt-setup-scroll")?.scrollTop ?? 0;
    const focused = this.hub.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusAction = focused?.dataset.a;
    const focusValue = focused?.dataset.v;
    this.boardDialog?.close();
    this.hub.innerHTML = `
      <header class="pt-head">
        <div class="pt-brand"><span class="pt-logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 7.2h9.6L7.2 16.8h9.6M12 3.6v3.6M12 16.8v3.6"/></svg></span><div><b><span>ZK</span> <span>PARTY</span></b><small>${T("ゲーム館 · you vs. three zkSNARKs", "ゲーム館 · 你对战三个 zkSNARK")}</small></div></div>
        ${this.chainHtml()}
        ${this.meHtml()}
        ${fullscreenHtml("pt-fs", "fullscreen")}
        <button class="pt-close" data-a="close" title="${T("Back to the city (Esc)", "回到城市（Esc）")}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="pt-grid">
        <section class="pt-card pt-practice" data-tab="practice">
          <div class="pt-ch">
            <b>${T("Mini-games", "小游戏")}<em>${GAMES.length}</em></b>
            <small>${T("free practice · or for ⓩ", "免费练习 · 或押 ⓩ")}</small>
            <span class="pt-ch-r">
              <button class="pt-arrow" data-a="shelf" data-v="-1" title="${T("Scroll left", "向左")}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
              <button class="pt-arrow" data-a="shelf" data-v="1" title="${T("Scroll right", "向右")}"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
              <button class="pt-all" data-a="minis">${T("All mini-games", "全部小游戏")}<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
            </span>
          </div>
          <div class="pt-shelf">${this.shelfHtml()}</div>
        </section>
        <section class="pt-card pt-library" data-tab="board" aria-labelledby="pt-library-title">
          <div class="pt-ch"><b id="pt-library-title">${T("Board & card games", "棋盘与纸牌")}<em>4</em></b><small>${T("zkSNARK rivals · 2 to 8 seats", "zkSNARK 对手 · 2 到 8 人")}</small></div>
          <div class="pt-library-grid">${this.libraryHtml()}</div>
        </section>
        <div class="pt-modes">
        <section class="pt-card pt-tourc" data-tab="tour">
          <div class="pt-body">
            <span class="pt-badge alt pink">${T("New · 3 to 10 games", "新 · 3 到 10 场")}</span>
            <h2>${T("Tournament", "锦标赛")}</h2>
            <p>${T("Your lineup · three rivals · free or ⓩ", "自选阵容 · 三个对手 · 免费或 ⓩ")}</p>
            <div class="pt-fan">${GAMES.slice(0, 5)
              .map((g, i) => `<span style="--i:${i};--c:${g.color}">${thumbHtml(g)}</span>`)
              .join("")}</div>
            <button class="pt-play pink" data-a="tour"><svg viewBox="0 0 24 24"><path d="M7 3h10v3h3v3a5 5 0 0 1-5 5h-.3A5 5 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1A5 5 0 0 1 9.3 14H9a5 5 0 0 1-5-5V6h3zm-1 5v1a3 3 0 0 0 1 2.2V8zm12 0v3.2A3 3 0 0 0 19 9V8z"/></svg>${T("Set up", "设置")} <span>${T("free or ⓩ", "免费或 ⓩ")}</span></button>
          </div>
        </section>
        ${this.online.cardHtml()}
        </div>
        <aside class="pt-side">
          <div class="pt-card pt-missions">
            <div class="pt-ch"><b>${T("Today's missions", "今日任务")}</b><small>${T("new ones at midnight UTC", "UTC 零点刷新")}</small></div>
            ${missions
              .map(
                (m) => `<div class="pt-m ${m.claimed ? "claimed" : m.at >= m.n ? "ready" : ""}">
                  <div><b>${esc(m.title)}</b><span class="pt-bar"><i style="width:${Math.round((m.at / m.n) * 100)}%"></i></span><small>${m.at} / ${m.n}</small></div>
                  ${m.claimed ? `<em>✓</em>` : m.at >= m.n ? `<button data-a="claim" data-v="${m.id}">+ⓩ ${m.prize}</button>` : `<span class="pt-prize">ⓩ ${m.prize}</span>`}
                </div>`,
              )
              .join("")}
          </div>
          ${refill.can ? `<button class="pt-card pt-refill" data-a="refill"><b>${T("Out of chips?", "筹码用完了？")}</b><span>${T(`Take ⓩ ${refill.amount} on the house`, `免费领取 ⓩ ${refill.amount}`)}</span></button>` : ""}
          ${this.hooks.casino ? `<button class="pt-card pt-casino" data-a="casino"><span class="pt-cz"><i></i><i></i><i></i></span><div><b>${T("Block Casino", "区块赌场")}</b><span>${T("Next block's hash · high/low · digit · roulette", "下一个区块哈希 · 大小 · 数字 · 轮盘")}</span></div><em>›</em></button>` : ""}
          <div class="pt-card pt-stats">
            <div><i class="pt-si">🏆</i><b>${num(ps.wins)}</b><small>${T("parties won", "派对胜场")}</small></div>
            <div><i class="pt-si">⭐</i><b>${num(ps.miniWins)}</b><small>${T("mini-games won", "小游戏胜场")}</small></div>
            <div><i class="pt-si">ⓩ</i><b>${num(ps.best)}</b><small>${T("best payout", "最高奖金")}</small></div>
          </div>
        </aside>
      </div>
      <footer class="pt-foot">${T("ⓩ · ZStreet's play money · never ZEC", "ⓩ · ZStreet 的游戏币 · 绝非 ZEC")}</footer>
      <dialog class="pt-board-dialog" aria-labelledby="pt-board-title">
        <header class="pt-setup-head"><div><small>${T("BOARD GAME", "棋盘游戏")}</small><h2 id="pt-board-title">ZK Party</h2></div><button class="pt-close" data-a="board-close" aria-label="${T("Close game details", "关闭游戏详情")}" autofocus><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
        <div class="pt-setup-scroll">
        <section class="pt-card pt-hero">
          <div class="pt-art pt-boardart">${this.boardArtHtml()}<span class="pt-badge">${T("Board game", "棋盘游戏")}</span><span class="pt-mapname">${this.boardName()}</span></div>
          <div class="pt-body">

            <p>${T("Explore the board, win mini-games and collect the most Z-Blocks.", "探索棋盘，赢得小游戏，收集最多的 Z 方块。")}</p>
            <details class="pt-board-options" ${keepBoardOptions ? "open" : ""}>
            <summary>${T("Game settings", "游戏设置")}<span>${T(tb.en, tb.zh)} · ${T(`${this.turns} turns`, `${this.turns} 回合`)}</span></summary>
            <div class="pt-board-settings">
            ${this.mapsHtml()}
            <p class="pt-board-blurb">${this.boardBlurb()}</p>
            <div class="pt-label">${T("Table", "牌桌")}</div>
            <div class="pt-tables">${TABLES.map(
              (t, i) => `<button data-a="table" data-v="${i}" class="${i === this.table ? "on" : ""}" ${lv < t.level ? `disabled title="${T(`Opens at level ${t.level}`, `${t.level} 级开放`)}"` : ""}>
                <i class="pt-pips" title="${T("Rivals' skill", "对手水平")}">${"<s></s>".repeat(i + 1)}</i><b>${T(t.en, t.zh)}</b><span>${lv < t.level ? `🔒 ${T("Level", "等级")} ${t.level}` : `${bank.money(t.buy)}`}</span></button>`,
            ).join("")}</div>
            <div class="pt-row">
              <div class="pt-seg" title="${T("10 turns: about 20 to 25 minutes", "10 回合：约 20 到 25 分钟")}">${TURN_CHOICES.map((n) => `<button data-a="turns" data-v="${n}" class="${n === this.turns ? "on" : ""}">${T(`${n} turns`, `${n} 回合`)}</button>`).join("")}</div>
              <div class="pt-pot"><small>${T("Pot", "奖池")}</small><b>${bank.money(tb.buy * 4)}</b><span><i class="g">1st ${num(tb.buy * 4 * SPLIT[0])}</i><i class="s">2nd ${num(tb.buy * 4 * SPLIT[1])}</i><i class="b">3rd ${num(tb.buy * 4 * SPLIT[2])}</i></span></div>
            </div>
            </div></details>

          </div>
        </section>
        </div>
        <footer class="pt-setup-foot">            <button class="pt-play" data-a="board" data-need="${tb.buy}" ${bank.bal() < tb.buy ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>${T("Play", "开始")} <span>${bank.money(tb.buy)}</span></button></footer>
      </dialog>`;
    wireThumbs(this.hub);
    const boardDialog = this.boardDialog!;
    boardDialog.addEventListener("cancel", (e) => { e.preventDefault(); this.closeBoardSetup(); });
    let outside = false;
    boardDialog.addEventListener("pointerdown", (e) => { outside = e.target === boardDialog; });
    boardDialog.addEventListener("click", (e) => { if (outside && e.target === boardDialog) this.closeBoardSetup(); });
    if (keepBoardOpen) {
      boardDialog.showModal();
      this.hub.querySelector(".pt-setup-scroll")?.scrollTo({ top: keepBoardScroll });
    }
    const shelf = this.hub.querySelector<HTMLElement>(".pt-shelf");
    if (shelf) shelf.scrollLeft = keepShelf;
    this.hub.scrollTop = keepY;
    if (focusAction) {
      [...this.hub.querySelectorAll<HTMLElement>("[data-a]")].find((el) => el.dataset.a === focusAction && el.dataset.v === focusValue)?.focus({ preventScroll: true });
    }
  }

  private click(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const a = b.dataset.a!;
    const v = b.dataset.v ?? "";
    sfx.blip(2);
    if (a === "close") return this.close();
    if (a === "fullscreen") return void (fullscreenDo(), setTimeout(() => this.renderHub(), 400));
    if (a === "board-setup") return this.boardDialog?.showModal();
    if (a === "board-close") return this.closeBoardSetup();
    if (a === "table") ((this.table = Number(v)), this.renderHub());
    else if (a === "stake") ((this.stake = Number(v)), this.renderHub());
    else if (a === "turns") (this.setTurns(Number(v)), this.renderHub());
    else if (a === "bmap") (this.setMap(v), this.renderHub());
    else if (a === "claim") {
      const n = progress.claim(v);
      if (n) sfx.chips();
      this.renderHub();
    } else if (a === "refill") {
      if (progress.takeRefill()) sfx.chips();
      this.renderHub();
    } else if (a === "board") void this.playBoard();
    else if (a === "quick") void this.playQuick();
    else if (a === "practice") void this.playPractice(v);
    else if (a === "pick") this.sel.show(v);
    else if (a === "tour") this.tour.show();
    else if (a === "mrounds") (this.setRounds(Number(v)), this.renderHub());
    else if (a === "minis") this.sel.show();
    else if (a.startsWith("on-")) this.online.hubClick(a);
    else if (a === "shelf") {
      const sh = this.hub.querySelector<HTMLElement>(".pt-shelf");
      sh?.scrollBy({ left: Number(v) * sh.clientWidth * 0.8, behavior: "smooth" });
    } else if (a === "casino") {
      // (the casino is the city's panel: the hall steps aside for it)
      this.close();
      this.hooks.casino?.();
    }
  }

  private setTurns(n: number) {
    if (!TURN_CHOICES.includes(n)) return;
    this.turns = n;
    try {
      localStorage.setItem(TKEY, String(n));
    } catch {
      /* private mode */
    }
  }

  private setMap(k: string) {
    if (k !== "" && !MAPS.some((m) => m.key === k)) return;
    this.bmap = k;
    try {
      localStorage.setItem(MKEY, k);
    } catch {
      /* private mode */
    }
  }

  /** The board card's picture: the board picked, or all of them side by side for Random. */
  private boardArtHtml() {
    const img = (k: string, style = "") => `<img src="${boardArt(k)}" alt="" decoding="async" draggable="false" onerror="this.remove()"${style ? ` style="${style}"` : ""} />`;
    if (this.bmap) return img(this.bmap);
    return `<span style="position:absolute;inset:0;display:flex;gap:3px">${MAPS.map((m) => img(m.key, "position:static;flex:1;min-width:0;height:100%;animation:none")).join("")}</span><i class="sel-rnd" style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:64px">?</i>`;
  }
  private boardName() {
    const m = MAPS.find((x) => x.key === this.bmap);
    return m ? esc(T(m.title, m.titleZh)) : T("RANDOM BOARD", "随机棋盘");
  }
  private boardBlurb() {
    const m = MAPS.find((x) => x.key === this.bmap);
    const what = m ? `<b>${esc(T(m.tag, m.tagZh))}</b>. ` : `<b>${T(`One of ${MAPS.length} boards, drawn at random`, `${MAPS.length} 张棋盘中随机抽取一张`)}</b>. `;
    return what + T("Junctions, items, duels and THE TRACKER. Buy the Z-BLOCK; a mini-game after every turn. Most Z-Blocks takes the pot.", "岔路、道具、对决，还有追踪者。买下 Z 方块；每回合后都有小游戏。Z 方块最多者赢走奖池。");
  }
  /** The map picker: Random, then each board's picture and name (the track picker's look, select.ts). */
  private mapsHtml() {
    const item = (key: string, title: string, inner: string) => `<button class="sel-trk${key === this.bmap ? " on" : ""}" data-a="bmap" data-v="${key}" title="${esc(title)}"><span class="sel-tth">${inner}</span><b>${esc(title)}</b></button>`;
    return `<div class="sel-tracks" style="--c:#ff6b35"><small>${T("Board", "棋盘")}</small><div class="sel-trks">
      ${item("", T("Random", "随机"), `<i class="sel-rnd">?</i>`)}
      ${MAPS.map((m) => item(m.key, T(m.title, m.titleZh), `<img src="${boardArt(m.key)}" alt="" draggable="false" onerror="this.remove()" />`)).join("")}
    </div></div>`;
  }

  private setRounds(n: number) {
    if (!ROUND_CHOICES.includes(n)) return;
    this.mRounds = n;
    try {
      localStorage.setItem(RKEY, String(n));
    } catch {
      /* private mode */
    }
  }

  // ---- the arenas' block (chain.ts) -----------------------------------------------------------

  /**
   * Seeds for the rounds of a match or the games of a tournament: the first from the block read at
   * the start; then a fresh block's whenever a new one has arrived, else the last block's mixed with
   * `alt` (the game's key and its round); the clock's when the chain was never reached.
   */
  private seeder(first: ChainSeed | null) {
    let last = first;
    let n = 0;
    return async (key: string, alt: string): Promise<RoundSeed> => {
      const firstCall = n++ === 0;
      let cs: ChainSeed | null = first;
      if (!firstCall) {
        try {
          cs = await chainSeed(2500);
        } catch {
          cs = null;
        }
      }
      if (cs && (firstCall || !last || cs.height !== last.height)) {
        last = cs;
        if (!firstCall) this.onBlock(cs);
        return { rnd: rng(seedFor(key, cs)), block: cs };
      }
      if (last) return { rnd: rng(seedFor(alt, last)), block: last };
      return { rnd: rng((Date.now() ^ Math.imul(n, 0x9e3779b9)) >>> 0 || 1), block: null };
    };
  }

  /**
   * A match's seed: the latest Zcash block's hash mixed with the game's key, or the clock's when
   * the chain is out of reach (never more than 2.5 s; "reading block…" if it takes a moment).
   * Null when the hall was left meanwhile.
   */
  private async arena(key: string): Promise<{ seed: number; block: ChainSeed | null } | null> {
    this.starting = true;
    const slow = setTimeout(() => this.reading(true), 180);
    let cs: ChainSeed | null = null;
    try {
      cs = await chainSeed(2500);
    } catch {
      cs = null;
    }
    clearTimeout(slow);
    this.reading(false);
    this.starting = false;
    if (cs) this.onBlock(cs);
    if (!this.open || this.playing) return null;
    return { seed: cs ? seedFor(key, cs) : Date.now() >>> 0 || 1, block: cs };
  }

  private reading(on: boolean) {
    let el = this.root.querySelector<HTMLElement>(".pt-reading");
    if (!on) return void el?.classList.remove("on");
    if (!el) {
      el = document.createElement("div");
      el.className = "pt-reading";
      this.root.append(el);
    }
    el.innerHTML = `<i></i>${T("Reading the latest Zcash block…", "正在读取最新 Zcash 区块…")}`;
    el.classList.add("on");
  }

  /** The live chip: the block the next arenas come from (hidden while the chain is out of reach). */
  private chainHtml(pulse = false) {
    const b = this.block;
    const live = !!b && Date.now() - b.at < 45_000;
    const tip = T(
      "Every match's arena (its layout, the dice) is seeded by the latest Zcash block's hash: check it on the explorer. It only seeds the game: no ⓩ or ZEC are involved and nothing is written on chain.",
      "每局的竞技场（布局、骰子）都由最新 Zcash 区块的哈希生成：可在浏览器上查看。它只用于生成游戏：不涉及 ⓩ 或 ZEC，也不会向链上写入任何内容。",
    );
    return `<a class="pt-chain${live ? "" : " pt-hidden"}${pulse ? " pulse" : ""}" href="${esc(b?.url ?? "#")}" target="_blank" rel="noopener" title="${esc(tip)}"><i class="pt-cube"></i><span>${T("Arenas seeded by Zcash block", "竞技场来自 Zcash 区块")}</span><b>${b ? `#${num(b.height)}` : ""}</b></a>`;
  }

  private onBlock(s: ChainSeed) {
    const was = this.block?.height;
    this.block = s;
    const pulse = was !== s.height;
    this.root.querySelectorAll<HTMLElement>(".pt-chain").forEach((el) => (el.outerHTML = this.chainHtml(pulse)));
  }

  /** The hall is up and idle: read the chain every 12 s; stopped while a match plays and once the hall is left. */
  private watch(on: boolean) {
    if (on && !this.stopWatch) {
      this.stopWatch = watchChain((s) => this.onBlock(s));
      // (a first read lost to a busy start: one more try soon, not 12 s later)
      setTimeout(() => {
        if (this.stopWatch && !this.block) void chainSeed().then((s) => s && this.stopWatch && this.onBlock(s));
      }, 3500);
    } else if (!on && this.stopWatch) {
      this.stopWatch();
      this.stopWatch = null;
    }
  }

  // ---- playing --------------------------------------------------------------------------------

  private begin() {
    this.playing = true;
    this.boardDialog?.close();
    this.watch(false);
    this.sel.hide();
    this.tour.hide();
    this.root.classList.add("pt-playing");
    this.hub.classList.add("pt-hidden");
    this.stage.el.classList.remove("pt-hidden");
    // (a phone: the game is played on its side; Android locks it, an upright iPhone gets the stage turned, no card)
    orient("landscape", { quiet: true });
  }
  private end() {
    this.playing = false;
    this.watch(this.open);
    this.root.classList.remove("pt-playing");
    orient("any");
    this.stage.stop();
    this.stage.el.classList.add("pt-hidden");
    this.hub.classList.remove("pt-hidden");
    this.closeModal();
    if (this.open) partyMusic.lobby?.();
  }

  private async askQuit() {
    if (!this.playing) return;
    this.stage.paused = true;
    const body =
      this.mode === "practice" || this.mode === "tourFree"
        ? T("It's only practice: nothing is lost.", "这只是练习：不会损失任何东西。")
        : this.mode === "board" || this.mode === "tour"
          ? T("Your buy-in stays in the pot.", "你的买入会留在奖池里。")
          : T("Your stake stays on the table.", "你的押注会留在桌上。");
    const ok = await this.pauseMenu(body);
    this.stage.paused = false;
    if (ok) this.stage.abort();
  }

  /**
   * The pause menu over a game: resume, the music and the sounds on or off (the party's mixer, kept
   * for the next visit), leave. True: the visitor leaves the game. Esc resumes.
   */
  private pauseMenu(note: string): Promise<boolean> {
    return new Promise((resolve) => {
      const prev = this.modal.innerHTML;
      const wasOn = this.modal.classList.contains("on");
      const mix = mixer();
      const on = (k: "music" | "sfx") => !mix || mix.volume(k) > 0.01;
      const tog = (k: "music" | "sfx", label: string, d: string) =>
        `<button class="pt-tog${on(k) ? "" : " off"}" data-mix="${k}" aria-pressed="${on(k)}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg><span>${label}</span><b>${on(k) ? T("On", "开") : T("Off", "关")}</b></button>`;
      const paint = () => {
        this.modal.innerHTML = `<div class="pt-dlg pt-pause">
          <small>${T("Paused", "已暂停")}</small>
          <h3>${T("Take a breath", "歇一会儿")}</h3>
          ${mix ? `<div class="pt-togs">${tog("music", T("Music", "音乐"), "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z")}${tog("sfx", T("Sounds", "音效"), "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11")}</div>` : ""}
          <div class="pt-dlg-a"><button class="pt-play" data-no><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>${T("Resume", "继续")}</button></div>
          <button class="pt-leave" data-yes>${T("Leave the game", "离开游戏")}</button>
          <p class="pt-pause-note">${esc(note)}</p>
        </div>`;
      };
      paint();
      this.modal.classList.add("on");
      const done = (v: boolean) => {
        this.modal.onclick = null;
        this.modalEsc = null;
        if (wasOn) this.modal.innerHTML = prev;
        else this.closeModal();
        resolve(v);
      };
      this.modal.onclick = (e) => {
        const t = e.target as HTMLElement;
        const m = t.closest<HTMLElement>("[data-mix]");
        if (m && mix) {
          const k = m.dataset.mix as "music" | "sfx";
          const v = on(k) ? 0 : 1;
          mix.setVolume(k, v);
          // (the ambience bed goes with the sounds)
          if (k === "sfx") mix.setVolume("amb", v);
          paint();
          if (v) sfx.blip(2);
        } else if (t.closest("[data-yes]")) done(true);
        else if (t.closest("[data-no]")) done(false);
      };
      this.modalEsc = () => done(false);
    });
  }

  /**
   * An online room's board (online.ts calls it when the host starts): the same game on every page,
   * the people's choices and the mini-games over the room's relay (net/roomboard.ts). Played for
   * the fun of it: no ⓩ change hands online; experience and the day's missions count.
   */
  private async playRoom(room: RoomClient, seed: number, seats: StartSeat[], settings: Settings) {
    if (this.playing) return;
    const SKILL = [0.3, 0.48, 0.66, 0.84];
    const players: Player[] = seats.map((s) => {
      // (an AI seat's zkSNARK, the same on every page: drawn from the room's seed)
      if (s.ai) return makePlayer(s.seat, (((seed ^ Math.imul(s.seat + 1, 0x9e3779b1)) >>> 0) % 10_000) + 1, false, SKILL[s.skill] ?? 0.5);
      const mine = s.seat === room.mySeat;
      return { ...makePlayer(s.seat, s.avatar, true, 0.5, mine ? T("You", "你") : s.name), local: mine };
    });
    const net = new RoomBoardNet(
      room,
      seats.filter((s) => !s.ai).map((s) => s.seat),
      room.mySeat,
      seed,
    );
    this.mode = "board";
    this.begin();
    music.play("board");
    let r: Awaited<ReturnType<Board["play"]>> = null;
    try {
      const board = new Board(this.stage, players, rng(seed), settings.turns, {}, { map: settings.map, net, prizes: ["", "", "", ""] });
      r = await board.play();
    } finally {
      net.dispose();
      this.end();
    }
    if (!r) return;
    const me = room.mySeat;
    const place = r.order.indexOf(me);
    const xp = 40 + [120, 60, 25, 0][place];
    progress.track("party");
    if (place <= 1) progress.track("partyTop2");
    if (place === 0) progress.track("partyWin");
    progress.gain(xp);
    await this.result({
      place,
      title: place === 0 ? T("You won the party!", "你赢下了派对！") : T(`You finished ${ord(place)}`, `你获得${ord(place)}`),
      lines: [T(`Room ${room.code} · ${r.blocks[me]} Z-Blocks · ${r.coins[me]} coins · ${r.miniWins[me]} mini-games won`, `房间 ${room.code} · ${r.blocks[me]} 个 Z 方块 · ${r.coins[me]} 金币 · 赢了 ${r.miniWins[me]} 局小游戏`)],
      delta: 0,
      paid: 0,
      xp,
      players,
      order: r.order,
      again: T("Back to the room", "回到房间"),
      canAgain: false,
    });
  }

  private async playBoard() {
    const tb = TABLES[this.table];
    if (this.starting || this.playing || bank.bal() < tb.buy) return;
    this.boardDialog?.close();
    const a = await this.arena("board");
    if (!a || !bank.pay(-tb.buy, "party buy-in")) return;
    sfx.chips();
    const players = [this.you(), ...this.rivals(tb.skill, Date.now())];
    const odds = oddsFor(players);
    this.mode = "board";
    this.begin();
    // (the board's dice come from the block, and so do its mini-games, seeded from the board's dice)
    setArenaBlock(a.block);
    music.play("board");
    const pot = tb.buy * 4;
    const board = new Board(
      this.stage,
      players,
      rng(a.seed),
      this.turns,
      {
        beforeMini: (def, turn) => this.sideBet(def, odds, turn),
        afterMini: (def, order) => (this.afterMini(def, order), music.play("board")),
        bought: (seat) => seat === 0 && progress.track("qblock"),
      },
      // (the board picked on the card, or one drawn now)
      { block: a.block, prizes: SPLIT.map((k) => (k ? `${bank.money(pot * k)}` : "")), map: this.bmap || MAPS[Math.floor(Math.random() * MAPS.length)].key },
    );
    const r = await board.play();
    setArenaBlock(null);
    this.end();
    if (!r) return this.renderHub();
    const place = r.order.indexOf(0);
    const won = Math.round(pot * SPLIT[place]);
    if (won) bank.pay(won, "party pot");
    profile.update((p) => {
      p.party.played++;
      if (place === 0) p.party.wins++;
      p.party.best = Math.max(p.party.best, won);
    });
    const xp = 40 + [120, 60, 25, 0][place] + this.table * 15;
    progress.track("party");
    if (place <= 1) progress.track("partyTop2");
    if (place === 0) progress.track("partyWin");
    progress.gain(xp);
    this.renderHub();
    const again = await this.result({
      place,
      title: place === 0 ? T("You won the party!", "你赢下了派对！") : T(`You finished ${ord(place)}`, `你获得${ord(place)}`),
      lines: [T(`${r.blocks[0]} Z-Blocks · ${r.coins[0]} coins · ${r.miniWins[0]} mini-games won`, `${r.blocks[0]} 个 Z 方块 · ${r.coins[0]} 金币 · 赢了 ${r.miniWins[0]} 局小游戏`)],
      delta: won - tb.buy,
      paid: won,
      xp,
      players,
      order: r.order,
      again: T(`Play again · ${bank.money(tb.buy)}`, `再来一局 · ${bank.money(tb.buy)}`),
      canAgain: bank.bal() >= tb.buy,
    });
    if (again) void this.playBoard();
  }

  /**
   * A quick match: a random mini-game (or `pick`, chosen in the mini-game hall, which it then goes
   * back to), over 1, 3 or 5 rounds. One stake, paid on the final ranking; one mini-game played.
   */
  private async playQuick(pick?: MiniDef, fromSel = false) {
    const st = STAKES[this.stake];
    if (this.starting || this.playing || bank.bal() < st.v) return;
    let def = pick;
    if (!def) {
      const pool = GAMES.filter((g) => g.key !== this.lastQuick);
      def = pool[Math.floor(Math.random() * pool.length)];
    }
    const game = def;
    const n = this.mRounds;
    const a = await this.arena(game.key);
    if (!a || !bank.pay(-st.v, "quick stake")) return;
    if (!pick) this.lastQuick = game.key;
    sfx.chips();
    const players = [this.you(), ...this.rivals(TABLES[st.table].skill, Date.now())];
    this.mode = "quick";
    this.begin();
    const sd = this.seeder(a.block);
    const pair = !!game.teams && n === 1;
    const stakeNote = pair
      ? T(`Stake ${bank.money(st.v)} · the winning pair wins ${bank.money(st.v * 2)} each`, `押注 ${bank.money(st.v)} · 获胜的一队每人赢 ${bank.money(st.v * 2)}`)
      : T(`Stake ${bank.money(st.v)} · 1st wins ${bank.money(st.v * 3)} · 2nd gets the stake back`, `押注 ${bank.money(st.v)} · 第一赢 ${bank.money(st.v * 3)} · 第二退回押注`);
    const res = await playMatch(this.stage, game, players, {
      rounds: n,
      seed: (r) => sd(game.key, game.key + r),
      note: n > 1 ? `${T(`Best of ${n}`, `${n} 局赛`)} · ${stakeNote}` : stakeNote,
      prizes: pair ? [`${bank.money(st.v * 2)}`, `${bank.money(st.v * 2)}`, "", ""] : [`${bank.money(st.v * 3)}`, `${bank.money(st.v)}`, "", ""],
    });
    this.end();
    if (fromSel) this.sel.show(game.key);
    if (!res) return this.renderHub();
    const order = res.order;
    this.afterMini(game, order);
    const place = order.indexOf(0);
    // (one round of a team game: the winning pair both get 2×, the losers nothing)
    const paid = pair ? (place < 2 ? st.v * 2 : 0) : place === 0 ? st.v * 3 : place === 1 ? st.v : 0;
    if (paid) bank.pay(paid, "quick match");
    const run = place === 0 ? profile.p.party.run + 1 : 0;
    profile.update((p) => {
      p.party.quick++;
      if (place === 0) p.party.quickWins++;
      p.party.run = run;
      p.party.best = Math.max(p.party.best, paid);
    });
    progress.track("quick");
    if (place === 0) progress.track("quickWin");
    const xp = Math.round((12 + (place === 0 ? 25 : place === 1 ? 8 : 0) + this.stake * 6) * (1 + Math.min(run, 5) * 0.1));
    progress.gain(xp);
    this.renderHub();
    this.sel.refresh();
    const again = await this.result({
      place,
      title: place === 0 ? (run > 1 ? T(`${run} wins in a row!`, `${run} 连胜！`) : T("You won!", "你赢了！")) : T(`You finished ${ord(place)}`, `你获得${ord(place)}`),
      lines: [n > 1 ? T(`${game.title} · best of ${n} · ${res.totals[0]} ${res.totals[0] === 1 ? "pt" : "pts"}`, `${game.titleZh} · ${n} 局赛 · ${res.totals[0]} 分`) : T(game.title, game.titleZh)],
      delta: paid - st.v,
      paid,
      xp,
      players,
      order,
      again: T(`Rematch · ${bank.money(st.v)}`, `再战 · ${bank.money(st.v)}`),
      canAgain: bank.bal() >= st.v,
    });
    if (again) void this.playQuick(pick, fromSel);
  }

  /** Practice: free, over 1, 3 or 5 rounds, against rivals of a level (the tables' skills); back to the mini-game hall after when it came from there. */
  private async playPractice(key: string, level = Math.min(this.table, 1), fromSel = false) {
    const def = gameOf(key);
    if (!def) return;
    if (this.starting || this.playing) return;
    const tb = TABLES[Math.max(0, Math.min(TABLES.length - 1, level))];
    const n = this.mRounds;
    const a = await this.arena(def.key);
    if (!a) return;
    const players = [this.you(), ...this.rivals(tb.skill, Date.now())];
    this.mode = "practice";
    this.begin();
    const sd = this.seeder(a.block);
    const res = await playMatch(this.stage, def, players, {
      rounds: n,
      seed: (r) => sd(def.key, def.key + r),
      note: n > 1 ? T(`Practice · best of ${n} · no chips at stake`, `练习 · ${n} 局赛 · 不押筹码`) : T("Practice · no chips at stake", "练习 · 不押筹码"),
    });
    this.end();
    if (res) {
      this.afterMini(def, res.order);
      progress.gain(res.order.indexOf(0) === 0 ? 10 : 4);
    }
    this.renderHub();
    if (fromSel) this.sel.show(key);
  }

  /**
   * A tournament: its games (picked, or drawn at random from the block), the same rivals for all.
   * Free, or a table's buy-in (its rivals with it): the pot, four buy-ins, split 50 / 30 / 20 on the
   * final ranking. Each game counts once (the counters, the missions, its medal); XP once at the end.
   */
  private async playTournament(cfg: TourCfg, picked: MiniDef[]) {
    if (this.starting || this.playing) return;
    const tb = cfg.buy >= 0 ? TABLES[cfg.buy] : null;
    if (tb && bank.bal() < tb.buy) return;
    if (!cfg.random && picked.length < 2) return;
    const a = await this.arena("tour");
    if (!a) return;
    const games = cfg.random ? this.tour.draw(rng(a.seed)) : picked;
    if (games.length < 2) return;
    if (tb && !bank.pay(-tb.buy, "tournament buy-in")) return;
    if (tb) sfx.chips();
    const players = [this.you(), ...this.rivals(tb ? tb.skill : TABLES[cfg.level].skill, Date.now())];
    const pot = tb ? tb.buy * 4 : 0;
    this.mode = tb ? "tour" : "tourFree";
    this.begin();
    const sd = this.seeder(a.block);
    const N = games.length;
    const res = await playTour(this.stage, players, {
      games,
      random: cfg.random,
      pool: GAMES,
      rounds: cfg.rounds,
      seed: (def, g, r) => sd(def.key, `${def.key}${g + 1}.${r}`),
      note: (g) => {
        const rounds = cfg.rounds > 1 ? ` · ${T(`best of ${cfg.rounds}`, `${cfg.rounds} 局赛`)}` : "";
        return `${T(`Tournament · game ${g + 1} / ${N}`, `锦标赛 · 第 ${g + 1} / ${N} 场`)}${rounds} · ${tb ? T(`pot ${bank.money(pot)}`, `奖池 ${bank.money(pot)}`) : T("free", "免费")}`;
      },
      onGame: (def, order) => this.afterMini(def, order),
      prizes: tb ? TOUR_SPLIT.map((k) => (k ? `${bank.money(pot * k)}` : "")) : undefined,
    });
    this.end();
    this.tour.show();
    if (!res) return this.renderHub();
    const place = res.order.indexOf(0);
    const won = tb ? Math.round(pot * TOUR_SPLIT[place]) : 0;
    if (won) bank.pay(won, "tournament pot");
    if (won) profile.update((p) => (p.party.best = Math.max(p.party.best, won)));
    const xp = tb ? 30 + N * 10 + [120, 60, 25, 0][place] + cfg.buy * 15 : N * 4 + [30, 15, 6, 0][place];
    progress.gain(xp);
    this.renderHub();
    this.tour.refresh();
    const again = await this.result({
      place,
      title: place === 0 ? T("You won the tournament!", "你赢得了锦标赛！") : T(`You finished ${ord(place)}`, `你获得${ord(place)}`),
      lines: [T(`${N} mini-games · ${res.totals[0]} ${res.totals[0] === 1 ? "pt" : "pts"}`, `${N} 个小游戏 · ${res.totals[0]} 分`)],
      delta: won - (tb?.buy ?? 0),
      paid: won,
      xp,
      players,
      order: res.order,
      again: tb ? T(`Play again · ${bank.money(tb.buy)}`, `再来一次 · ${bank.money(tb.buy)}`) : T("Play again", "再来一次"),
      canAgain: !tb || bank.bal() >= tb.buy,
    });
    if (again) void this.playTournament(cfg, picked);
  }

  /** Every mini-game played anywhere: the counters and the missions. */
  private afterMini(def: MiniDef, order: number[]) {
    // (a team game: the winning pair both won it)
    const place = paidPlace(def, order.indexOf(0));
    profile.update((p) => {
      p.party.minis++;
      if (place === 0) p.party.miniWins++;
      const b = p.party.places[def.key];
      p.party.places[def.key] = b === undefined ? place : Math.min(b, place);
    });
    progress.track("mini");
    if (place === 0) progress.track("miniWin");
    if (this.bet) {
      const b = this.bet;
      this.bet = null;
      if (place === 0) {
        const pay = Math.round(b.stake * b.odds);
        bank.pay(pay, "side bet");
        progress.track("betWin");
        this.toast(T(`Side bet won: +${bank.money(pay)}`, `押注赢了：+${bank.money(pay)}`), "win");
      } else this.toast(T(`Side bet lost: −${bank.money(b.stake)}`, `押注输了：−${bank.money(b.stake)}`), "lose");
    }
  }

  // ---- the side bet, the results, the dialogs -------------------------------------------------

  private bet: { stake: number; odds: number } | null = null;

  /** Before a board mini-game: back yourself to win it? */
  private sideBet(def: MiniDef, odds: number, turn: number): Promise<void> {
    // (a team game is won by two of the four: about twice as likely, so half the odds)
    if (def.teams) odds = Math.max(1.2, Math.round(odds * 5) / 10);
    const chips = [0, 10, 25, 50, 100, 250].filter((v) => v <= bank.bal());
    if (chips.length < 2) return Promise.resolve();
    let pick = 0;
    return new Promise((resolve) => {
      const draw = () => {
        this.modal.innerHTML = `<div class="pt-dlg pt-bet">
          <small>${T(`Turn ${turn} · mini-game`, `第 ${turn} 回合 · 小游戏`)}</small>
          <h3>${esc(T(def.title, def.titleZh))}</h3>
          <p>${T("Back yourself to win it?", "押自己赢这一局？")} <b>×${odds.toFixed(1)}</b></p>
          <div class="pt-chips">${chips.map((v) => `<button data-v="${v}" class="${v === pick ? "on" : ""}">${v ? `${bank.money(v)}` : T("No bet", "不押")}</button>`).join("")}</div>
          <div class="pt-dlg-a"><button class="pt-play" data-go>${pick ? T(`Bet ${bank.money(pick)} · win ${bank.money(pick * odds)}`, `押 ${bank.money(pick)} · 赢 ${bank.money(pick * odds)}`) : T("Just play", "直接开始")}</button></div>
        </div>`;
      };
      // the pad's A (Space, Enter) plays on
      const kd = (e: KeyboardEvent) => {
        if (e.code !== "Space" && e.code !== "Enter") return;
        e.preventDefault();
        done();
      };
      const done = () => {
        window.removeEventListener("keydown", kd, true);
        this.modal.onclick = null;
        this.modalEsc = null;
        this.closeModal();
        if (pick && bank.pay(-pick, "side bet")) {
          this.bet = { stake: pick, odds };
          sfx.chips();
        }
        resolve();
      };
      this.modal.onclick = (e) => {
        const t = e.target as HTMLElement;
        const c = t.closest<HTMLElement>("[data-v]");
        if (c) {
          pick = Number(c.dataset.v);
          sfx.blip(3);
          draw();
        } else if (t.closest("[data-go]")) done();
      };
      this.modalEsc = () => {
        pick = 0;
        done();
      };
      window.addEventListener("keydown", kd, true);
      draw();
      this.modal.classList.add("on");
    });
  }

  private result(r: { place: number; title: string; lines: string[]; delta: number; paid: number; xp: number; players: Player[]; order: number[]; again: string; canAgain: boolean }): Promise<boolean> {
    const lv = levelOf(profile.p.xp);
    return new Promise((resolve) => {
      this.modal.innerHTML = `<div class="pt-dlg pt-res ${r.place === 0 ? "gold" : ""}">
        <div class="pt-podium">${r.order
          .map((seat, i) => {
            const p = r.players[seat];
            return `<div class="p${i}" style="--c:${p.color}"><img src="${p.img.src}" alt="" /><b>${esc(p.human ? T("You", "你") : p.name)}</b><small>${ord(i)}</small></div>`;
          })
          .join("")}</div>
        <h3>${esc(r.title)}</h3>
        ${r.lines.map((l) => `<p>${esc(l)}</p>`).join("")}
        <div class="pt-gain">
          <div><small>ⓩ</small><b class="${r.delta >= 0 ? "up" : "down"}" data-count="${r.delta}">${r.delta >= 0 ? "+" : "−"}${bank.money(0)}</b></div>
          <div><small>XP</small><b class="up">+${num(r.xp)}</b></div>
          <div><small>${T("Level", "等级")} ${lv.level}</small><span class="pt-xp"><i style="width:${Math.round(lv.k * 100)}%"></i></span></div>
        </div>
        <div class="pt-dlg-a">
          <button class="pt-ghost" data-hub>${T("Back to the hall", "返回大厅")}</button>
          <button class="pt-play" data-again ${r.canAgain ? "" : "disabled"}>${esc(r.again)}</button>
        </div>
      </div>`;
      this.modal.classList.add("on");
      // the chips count up
      const el = this.modal.querySelector<HTMLElement>("[data-count]")!;
      const target = Math.abs(r.delta);
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 900);
        el.textContent = `${r.delta >= 0 ? "+" : "−"}${bank.money(target * (1 - Math.pow(1 - k, 3)))}`;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      if (r.paid > 0) sfx.chips();
      const done = (v: boolean) => {
        this.modal.onclick = null;
        this.modalEsc = null;
        this.closeModal();
        resolve(v);
      };
      this.modal.onclick = (e) => {
        const t = e.target as HTMLElement;
        if (t.closest("[data-hub]")) done(false);
        else if (t.closest("[data-again]") && r.canAgain) done(true);
      };
      this.modalEsc = () => done(false);
    });
  }

  private closeModal() {
    this.modal.classList.remove("on");
    this.modal.innerHTML = "";
  }

  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toast(s: string, kind: "level" | "mission" | "win" | "lose" | "info") {
    let el = this.root.querySelector<HTMLElement>(".pt-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "pt-toast";
      this.root.append(el);
    }
    el.dataset.k = kind;
    el.textContent = s;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    if (kind === "level") sfx.star();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el!.classList.remove("on"), 3600);
  }
}

let party: Party | null = null;
/** Open the game hall (built on first use). */
/**
 * Opens the hall: on a hub tab, on the tournament setup (`tab: "tour"`), on the selection
 * (`game`: a mini-game's key, or "*" for the whole grid), or into an online room (`room`: its
 * code, from party.html?room=). The Game House's wall and desk use these.
 */
export function openParty(hooks: PartyHooks, tab?: "board" | "quick" | "practice" | "tour", game?: string, room?: string) {
  party ??= new Party(hooks);
  party.show(tab === "tour" ? undefined : tab);
  // ("kart@astana": a game on one of its versions, the NU7 GRAND PRIX's circuit in the city)
  const [key, version] = (game ?? "").split("@");
  if (version) variantPick.set(key, version);
  if (tab === "tour") party.openTour();
  else if (game) party.openSelect(key === "*" ? undefined : key);
  else if (room) party.joinRoom(room);
}
/** For tests: the language the hub was drawn in. */
export const partyLang = () => (isZh() ? "zh" : "en");
