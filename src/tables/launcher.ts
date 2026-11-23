/**
 * THE GAME HOUSE's table launcher: a click on a table in the house (src/interior/gamehouse) opens
 * this panel over the room. It shows the game's card (title, tag, how to play, about how long), lets
 * the visitor pick the number of seats, the rivals' strength and the stake (ⓩ, ZStreet's play
 * chips: never real ZEC), then deals the game in: it takes the buy-in, seats the visitor (seat 0)
 * and the zkSNARK rivals (ZStreet names, ids, skills, SEAT_COLORS), seeds the shuffle from the latest
 * Zcash block (src/party/chain.ts via ZScan; the clock when the chain is out of reach), and mounts the game full
 * screen over the city (`def.open`). When the game calls `onExit` the launcher pays `result.payout`
 * back, takes the game down, says how it went (a toast in the city, a banner on the panel) and
 * offers another hand.
 *
 * A table whose game is not in `TABLES` yet (src/tables/index.ts) opens a COMING SOON card.
 */
import "./launcher.css";
import { T } from "../i18n/lang";
import { myId, personImage, personName } from "../party/people";
import { profile } from "../game/profile";
import { progress } from "../game/progress";
import { chainSeed, seedFor } from "../party/chain";
import { SEAT_COLORS, type TableDef, type TableResult, type TableSeat } from "./types";
import { TABLES } from "./index";

/** What the city does round the launcher (main.ts). */
export interface LauncherHooks {
  /** The panel (or a game) is up: the walker stops; false when the visitor is back in the house. */
  panel(on: boolean): void;
  /** A game took the whole screen (true) or gave it back (false): the city sleeps under it, as under ZK PARTY. */
  game(on: boolean): void;
  /** A line in the city's toast (HTML, in the page's language already). */
  say(html: string): void;
  /** A zkSNARK who challenged you (the street's duels): it takes the first rival's seat. */
  rival?: number;
}

import { HOUSE_TABLES } from "./catalog";
import { tableArt } from "./house";
export { tableArt };
export { HOUSE_TABLES } from "./catalog";

/** The registered game for a key (null: not in the house yet). */
export const tableDef = (key: string): TableDef | null => TABLES.find((t) => t.key === key) ?? null;

/** A table's name, colour and line for the room (its game's own when registered, the house's card otherwise). */
export function tableCard(key: string) {
  const d = tableDef(key);
  const h = HOUSE_TABLES.find((t) => t.key === key);
  return {
    key,
    ready: !!d,
    title: d ? T(d.title, d.titleZh) : h ? T(h.title, h.titleZh) : key.toUpperCase(),
    tag: d ? T(d.tag, d.tagZh) : h ? T(h.tag, h.tagZh) : "",
    color: d?.color ?? h?.color ?? "#ff6b35",
    seats: d ? `${d.minSeats}–${d.maxSeats}` : (h?.seats ?? ""),
    minutes: d?.minutes ?? 0,
    thumb: d?.thumb,
  };
}

// ---- the rivals --------------------------------------------------------------------------------------

/** The rivals' strength: a base skill each AI gets (± a little), and its name. */
const LEVELS = [
  { en: "Easy", zh: "简单", skill: 0.25, note: "street players, still learning", noteZh: "街头玩家，还在学" },
  { en: "Normal", zh: "普通", skill: 0.5, note: "the house regulars", noteZh: "店里的常客" },
  { en: "Hard", zh: "困难", skill: 0.72, note: "high rollers, they count everything", noteZh: "豪客，什么都算得清" },
  { en: "Shark", zh: "高手", skill: 0.9, note: "the sharks of The Orchard Room", noteZh: "果园厅的老鲨鱼" },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => Math.round(n).toLocaleString("en-US");

/** A small seeded generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rival {
  id: number;
  name: string;
  jitter: number;
}
/** Seven zkSNARK rivals drawn for the table (the first n − 1 sit down), by their ZStreet names. */
function drawRivals(seed: number): Rival[] {
  const r = rng(seed);
  const ids: number[] = [];
  const me = myId();
  while (ids.length < 7) {
    const id = 1 + Math.floor(r() * 9999);
    if (id !== me && !ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => ({ id, name: personName(id), jitter: (r() - 0.5) * 0.12 }));
}

// ---- what the visitor picked last time, and the house's record of each table -------------------------

interface Prefs {
  seats: number;
  level: number;
  stake: number;
}
interface Record_ {
  played: number;
  wins: number;
  best: number;
  net: number;
}
const PREFS = "street.tables.prefs";
const STATS = "street.tables.stats";
function readJson<V>(key: string, fallback: V): V {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as object) } as V) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* a private window: forgotten on reload */
  }
}
/** Every table's record in this browser: games played, won, the best payout, the net in ⓩ. */
export function tableStats(): Record<string, Record_> {
  return readJson<Record<string, Record_>>(STATS, {});
}
function record(key: string, won: boolean, payout: number, stake: number) {
  const all = tableStats();
  const r = all[key] ?? { played: 0, wins: 0, best: 0, net: 0 };
  r.played++;
  if (won) r.wins++;
  r.best = Math.max(r.best, payout);
  r.net += payout - stake;
  all[key] = r;
  writeJson(STATS, all);
}

// ---- the panel ---------------------------------------------------------------------------------------

class Launcher {
  private el: HTMLElement;
  private key = "";
  private def: TableDef | null = null;
  private hooks: LauncherHooks | null = null;
  private open = false;
  /** A game on screen (its root, its handle). */
  private live: { root: HTMLElement; handle: { close(): void } | null } | null = null;
  private starting = false;
  private seats = 4;
  private level = 1;
  private stake = 0;
  private rivals: Rival[] = [];
  /** How the last game went (the banner over the card), for this table. */
  private last: { title: string; line: string; tone: "win" | "lose" | "left" } | null = null;
  private keys = (e: KeyboardEvent) => {
    if (!this.open || this.live) return;
    if ((e.target as HTMLElement).closest?.("input,textarea")) return;
    // the panel's keys are its own: none reach the house under it
    e.stopPropagation();
    if (e.type !== "keydown") return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    } else if (e.key === "Enter" && this.def && !this.starting) {
      e.preventDefault();
      void this.play();
    }
  };

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "tl-root";
    this.el.addEventListener("click", (e) => this.click(e));
    document.body.append(this.el);
    profile.subscribe(() => {
      if (this.open && !this.live) this.render();
    });
  }

  get busy() {
    return this.open;
  }

  show(key: string, hooks: LauncherHooks) {
    if (this.open) return;
    this.key = key;
    this.def = tableDef(key);
    this.hooks = hooks;
    this.open = true;
    this.last = null;
    const p = readJson<Record<string, Prefs>>(PREFS, {})[key];
    const d = this.def;
    if (d) {
      this.seats = clamp(p?.seats ?? d.defaultSeats, d.minSeats, d.maxSeats);
      this.level = clamp(p?.level ?? 1, 0, LEVELS.length - 1);
      const ok = d.stakes.filter((s) => s <= profile.p.z);
      this.stake = p && d.stakes.includes(p.stake) && p.stake <= profile.p.z ? p.stake : (ok.find((s) => s > 0) ?? ok[0] ?? d.stakes[0] ?? 0);
    }
    this.rivals = drawRivals((Math.random() * 2 ** 32) >>> 0);
    if (hooks.rival) this.rivals = [{ id: hooks.rival, name: personName(hooks.rival), jitter: 0 }, ...this.rivals.filter((r) => r.id !== hooks.rival)];
    window.addEventListener("keydown", this.keys, true);
    window.addEventListener("keyup", this.keys, true);
    if (document.pointerLockElement) document.exitPointerLock();
    hooks.panel(true);
    this.render();
    this.el.classList.add("on");
    // (the card pops in)
    this.el.classList.remove("tl-in");
    void this.el.offsetWidth;
    this.el.classList.add("tl-in");
  }

  close() {
    if (!this.open || this.live) return;
    this.open = false;
    this.el.classList.remove("on", "tl-in");
    window.removeEventListener("keydown", this.keys, true);
    window.removeEventListener("keyup", this.keys, true);
    const h = this.hooks;
    this.hooks = null;
    setTimeout(() => {
      if (!this.open) this.el.innerHTML = "";
    }, 260);
    h?.panel(false);
  }

  private save() {
    const all = readJson<Record<string, Prefs>>(PREFS, {});
    all[this.key] = { seats: this.seats, level: this.level, stake: this.stake };
    writeJson(PREFS, all);
  }

  private click(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t === this.el) return this.close();
    const b = t.closest<HTMLElement>("[data-a]");
    if (!b || (b as HTMLButtonElement).disabled) return;
    const v = Number(b.dataset.v ?? 0);
    switch (b.dataset.a) {
      case "close":
        return this.close();
      case "seats":
        this.seats = v;
        break;
      case "level":
        this.level = v;
        break;
      case "stake":
        this.stake = v;
        break;
      case "shuffle":
        this.rivals = drawRivals((Math.random() * 2 ** 32) >>> 0);
        break;
      case "play":
        return void this.play();
      default:
        return;
    }
    this.save();
    this.render();
  }

  private render() {
    const k = tableCard(this.key);
    const d = this.def;
    const art = k.thumb ? `<img src="${esc(k.thumb)}" alt="" draggable="false" />` : "";
    const head = `
      <div class="tl-art" style="--c:${k.color}">${art}<canvas width="640" height="360"></canvas>
        <span class="tl-house">${T("THE GAME HOUSE", "游戏屋")}</span>
        ${k.ready && d ? `<span class="tl-time">⏱ ~${d.minutes} ${T("min", "分钟")} · ${d.minSeats === d.maxSeats ? d.minSeats : `${d.minSeats}–${d.maxSeats}`} ${T("players", "人")}</span>` : ""}
      </div>
      <div class="tl-title" style="--c:${k.color}"><h2>${esc(k.title)}</h2><p>${esc(k.tag)}</p></div>`;
    if (!d) {
      this.el.innerHTML = `<div class="tl-card tl-soon" style="--c:${k.color}">
        <button class="tl-x" data-a="close" title="${T("Back to the house (Esc)", "回到游戏屋（Esc）")}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        ${head}
        <div class="tl-ribbon">${T("COMING SOON", "即将开放")}</div>
        <p class="tl-soon-p">${T("Opens soon. ZK PARTY wall, board game and bar are open.", "即将开放。ZK PARTY 游戏墙、棋盘游戏和吧台开放中。")}</p>
        <div class="tl-acts"><button class="tl-play ghost" data-a="close">${T("Back to the house", "回到游戏屋")}</button></div>
      </div>`;
      this.paintArt();
      return;
    }
    const lv = LEVELS[this.level];
    const can = this.stake <= profile.p.z;
    const seatBtns = [];
    for (let n = d.minSeats; n <= d.maxSeats; n++) seatBtns.push(`<button data-a="seats" data-v="${n}" class="${n === this.seats ? "on" : ""}">${n}</button>`);
    const rivals = this.rivals.slice(0, this.seats - 1);
    const you = myId();
    const banner = this.last ? `<div class="tl-last ${this.last.tone}"><b>${esc(this.last.title)}</b><span>${esc(this.last.line)}</span></div>` : "";
    this.el.innerHTML = `<div class="tl-card" style="--c:${d.color}">
      <button class="tl-x" data-a="close" title="${T("Back to the house (Esc)", "回到游戏屋（Esc）")}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <div class="tl-left">
        ${head}
        ${banner}
        <div class="tl-help"><b>${T("How to play", "玩法")}</b>${T(d.help, d.helpZh)
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => `<p>${esc(l)}</p>`)
          .join("")}</div>
      </div>
      <div class="tl-right">
        <div class="tl-row"><label>${T("Players", "玩家人数")}</label><div class="tl-seg">${seatBtns.join("")}</div></div>
        <div class="tl-row"><label>${T("Rivals", "对手水平")}</label><div class="tl-seg tl-lv">${LEVELS.map((l, i) => `<button data-a="level" data-v="${i}" class="${i === this.level ? "on" : ""}"><i class="tl-pips">${"<s></s>".repeat(i + 1)}</i>${T(l.en, l.zh)}</button>`).join("")}</div><small>${T(lv.note, lv.noteZh)}</small></div>
        <div class="tl-seats">
          <span class="tl-who me" style="--s:${SEAT_COLORS[0]}"><img src="${personImage(you)}" alt="" /><b>${T("You", "你")}</b></span>
          ${rivals.map((r, i) => `<span class="tl-who" style="--s:${SEAT_COLORS[i + 1]};--i:${i}"><img src="${personImage(r.id)}" alt="" /><b>${esc(r.name)}</b></span>`).join("")}
          <button class="tl-shuffle" data-a="shuffle" title="${T("Other rivals", "换一批对手")}"><svg viewBox="0 0 24 24"><path d="M4 7h11l-3-3M20 17H9l3 3M20 7l-4 0M4 17h4"/></svg></button>
        </div>
        <div class="tl-row"><label>${T("Stake", "押注")} <em>${T("ⓩ play chips", "ⓩ 游戏筹码")}</em></label><div class="tl-chips">${d.stakes
          .map((s) => `<button data-a="stake" data-v="${s}" class="${s === this.stake ? "on" : ""}" ${s > profile.p.z ? "disabled" : ""}>${s === 0 ? T("Free", "免费") : `ⓩ ${num(s)}`}</button>`)
          .join("")}</div></div>
        <div class="tl-bal"><span>${T("Your chips", "你的筹码")}</span><b>ⓩ ${num(profile.p.z)}</b></div>
        <button class="tl-play" data-a="play" ${can && !this.starting ? "" : "disabled"}><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>${this.starting ? T("Reading the latest Zcash block…", "正在读取最新 Zcash 区块…") : `${this.last ? T("Play again", "再来一局") : T("Play", "开始")} <span>${this.stake ? `ⓩ ${num(this.stake)}` : T("free", "免费")}</span>`}</button>
        <p class="tl-foot">${T("Shuffled by the latest Zcash block · ⓩ play chips, never real ZEC", "由最新 Zcash 区块洗牌 · ⓩ 游戏筹码，绝非真实 ZEC")}</p>
      </div>
    </div>`;
    this.paintArt();
  }

  /** The card's picture: the drawn art under the game's thumbnail (which covers it once it loads). */
  private paintArt() {
    const cv = this.el.querySelector<HTMLCanvasElement>(".tl-art canvas");
    if (!cv) return;
    const k = tableCard(this.key);
    cv.getContext("2d")!.drawImage(tableArt(this.key, k.color, 640, 360), 0, 0);
    const im = this.el.querySelector<HTMLImageElement>(".tl-art img");
    if (im) {
      const ok = () => im.classList.add("ok");
      if (im.complete && im.naturalWidth) ok();
      else {
        im.addEventListener("load", ok, { once: true });
        im.addEventListener("error", () => im.remove(), { once: true });
      }
    }
  }

  /** Deal the game in: the buy-in, the seats, the block's seed, then the game over the city. */
  private async play() {
    const d = this.def;
    if (!d || this.starting || this.live || !this.hooks) return;
    const stake = this.stake;
    if (stake > profile.p.z) return;
    this.starting = true;
    this.render();
    let cs = null;
    try {
      cs = await chainSeed(2500);
    } catch {
      cs = null;
    }
    this.starting = false;
    if (!this.open || !this.hooks) return;
    if (stake > 0 && !profile.pay(-stake, `${d.title} buy-in`)) return this.render();
    const seed = cs ? seedFor(d.key, cs) : Date.now() >>> 0 || 1;
    const seedNote = cs ? T(`Shuffled by Zcash block #${num(cs.height)}`, `由 Zcash 区块 #${num(cs.height)} 洗牌`) : T("Shuffled by the clock (the chain is out of reach)", "由时钟洗牌（暂时连不上链）");
    const lv = LEVELS[this.level];
    const seats: TableSeat[] = [{ seat: 0, id: myId(), name: T("You", "你"), human: true, skill: 0.5, color: SEAT_COLORS[0] }];
    this.rivals.slice(0, this.seats - 1).forEach((r, i) =>
      seats.push({ seat: i + 1, id: r.id, name: r.name, human: false, skill: clamp(lv.skill + r.jitter, 0.05, 0.97), color: SEAT_COLORS[(i + 1) % SEAT_COLORS.length] }),
    );
    const root = document.createElement("div");
    root.className = "tl-stage";
    document.body.append(root);
    this.live = { root, handle: null };
    this.el.classList.remove("on");
    this.hooks.game(true);
    let done = false;
    const onExit = (result: TableResult | null) => {
      if (done) return;
      done = true;
      // (after the game's own call has returned: it may still be unwinding)
      setTimeout(() => this.finish(d, stake, seats.length, result), 0);
    };
    try {
      this.live.handle = d.open({ root, seats, stake, seed, seedNote, onExit });
    } catch (err) {
      console.error(`table ${d.key} failed to open`, err);
      done = true;
      if (stake > 0) profile.pay(stake, `${d.title} refund`);
      this.teardown();
      this.last = { title: T("The table could not open", "牌桌打不开"), line: T("Your buy-in is back in your chips.", "买入已退回你的筹码。"), tone: "left" };
      this.el.classList.add("on");
      this.render();
    }
  }

  /** The game is over (or left): its screen down, the payout in, the word in the city. */
  private finish(d: TableDef, stake: number, n: number, result: TableResult | null) {
    this.teardown();
    const payout = Math.max(0, Math.round(result?.payout ?? 0));
    if (payout > 0) profile.pay(payout, `${d.title} payout`);
    const name = T(d.title, d.titleZh);
    const place = result ? result.order.indexOf(0) : -1;
    const net = payout - stake;
    const netTxt = stake || payout ? `${net >= 0 ? "+" : "−"}ⓩ ${num(Math.abs(net))}` : "";
    let title: string, tone: "win" | "lose" | "left";
    if (!result) {
      title = T("You left the table", "你离开了牌桌");
      tone = "left";
    } else if (place === 0) {
      title = T(`You won ${name}!`, `你赢下了${name}！`);
      tone = "win";
    } else {
      title = place > 0 ? T(`You finished ${ordinal(place)} of ${n}`, `你排名第 ${place + 1}，共 ${n} 人`) : T("Game over", "游戏结束");
      tone = net >= 0 ? "win" : "lose";
    }
    const line = [result?.summary ?? (stake ? T(`Buy-in ⓩ ${num(stake)} left on the table.`, `买入的 ⓩ ${num(stake)} 留在了桌上。`) : ""), netTxt].filter(Boolean).join(" · ");
    this.last = { title, line, tone };
    if (result) {
      record(d.key, place === 0, payout, stake);
      progress.gain(place === 0 ? 45 : 15);
    }
    this.hooks?.say(`<b>${esc(name)}</b> · ${esc(title)}${netTxt ? ` · ${netTxt}` : ""}`);
    // back on the panel, ready for another hand (new rivals)
    this.rivals = drawRivals((Math.random() * 2 ** 32) >>> 0);
    if (this.stake > profile.p.z) this.stake = d.stakes.filter((s) => s <= profile.p.z).pop() ?? 0;
    this.el.classList.add("on");
    this.render();
  }

  private teardown() {
    const l = this.live;
    if (!l) return;
    this.live = null;
    try {
      l.handle?.close();
    } catch (err) {
      console.warn("table close", err);
    }
    l.root.remove();
    if (document.pointerLockElement) document.exitPointerLock();
    this.hooks?.game(false);
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ordinal = (i: number) => ["1st", "2nd", "3rd"][i] ?? `${i + 1}th`;

let launcher: Launcher | null = null;
/** Open the launcher on a table (its game's key). Nothing happens while one is already up. */
export function openTable(key: string, hooks: LauncherHooks) {
  launcher ??= new Launcher();
  launcher.show(key, hooks);
}
/** The launcher (or a game it dealt) is on screen. */
export const tableOpen = () => !!launcher?.busy;
