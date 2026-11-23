/**
 * The arcade's cabinet: one flat game over the hall (index.ts ARCADE), full screen, its top bar
 * (back, its name, the score, your best) and its end card (the score, a new best, the ⓩ it pays, play
 * again). The game owns the play area (`host.el`) and calls `host.score()` and `host.over()`.
 */
import "./arcade.css";
import { T } from "../../i18n/lang";
import { bank } from "../bank";
import { progress } from "../../game/progress";
import { profile } from "../../game/profile";
import { myId } from "../people";
import { sfx } from "../kit";
import type { ArcadeDef } from "./index";

export interface ArcadeHost {
  /** The play area: the game fills it (its size changes with the window: watch it). */
  readonly el: HTMLElement;
  /** A seed for the game's layout (a fresh one each play). */
  readonly seed: number;
  /** The visitor's own zkSNARK. */
  readonly me: number;
  /** The visitor's best score at this game. */
  readonly best: number;
  /** The live score in the top bar. */
  score(n: number): void;
  /** A line under the title in the top bar (a turn, a hint); "" clears it. */
  status(html: string): void;
  /** The game is over. */
  over(r: { score: number; won?: boolean; title?: string; line?: string }): void;
}

export interface ArcadeGame {
  dispose(): void;
  /** The cabinet's pause (its menu up, the page hidden). */
  pause?(on: boolean): void;
}

export type ArcadeMake = (host: ArcadeHost) => ArcadeGame;

const BEST_KEY = "zp-arcade-best";
function bests(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function saveBest(key: string, v: number) {
  const b = bests();
  b[key] = v;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* private mode */
  }
}
export const bestOf = (key: string) => bests()[key] ?? 0;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => Math.round(n).toLocaleString("en-US");

export class Cabinet {
  readonly el: HTMLElement;
  private area: HTMLElement;
  private game: ArcadeGame | null = null;
  private runId = 0;
  private hidden = () => this.game?.pause?.(document.hidden);

  constructor(
    parent: HTMLElement,
    private def: ArcadeDef,
    private onClose: () => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "ar-root";
    this.el.style.setProperty("--c", def.color);
    this.el.innerHTML = `
      <header class="ar-bar">
        <button class="ar-back" data-a="back" aria-label="${T("Back to ZK PARTY", "返回 ZK PARTY")}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><span>ZK PARTY</span></button>
        <div class="ar-title"><b>${esc(T(def.title, def.titleZh))}</b><small class="ar-status"></small></div>
        <div class="ar-scores">
          ${def.kind === "score" ? `<span class="ar-score"><small>${T("SCORE", "分数")}</small><b>0</b></span><span class="ar-best"><small>${T("BEST", "最高")}</small><b>${num(bestOf(def.key))}</b></span>` : ""}
        </div>
      </header>
      <div class="ar-area"></div>
      <div class="ar-end" hidden></div>`;
    this.area = this.el.querySelector(".ar-area")!;
    parent.append(this.el);
    this.el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      sfx.blip(2);
      if (a === "back") this.close();
      else if (a === "again") void this.start();
    });
    document.addEventListener("visibilitychange", this.hidden);
  }

  /** A new game (the previous one dropped). */
  async start() {
    const id = ++this.runId;
    this.game?.dispose();
    this.game = null;
    this.area.innerHTML = "";
    this.end(false);
    this.setScore(0);
    this.status("");
    let make: ArcadeMake;
    try {
      make = (await this.def.load()).default;
    } catch {
      this.status(T("This game didn't load. Check your connection.", "游戏没有加载，请检查网络。"));
      return;
    }
    if (id !== this.runId || !this.el.isConnected) return;
    const best = bestOf(this.def.key);
    let ended = false;
    const host: ArcadeHost = {
      el: this.area,
      seed: (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0 || 1,
      me: myId(),
      best,
      score: (n) => id === this.runId && this.setScore(n),
      status: (html) => id === this.runId && this.status(html),
      over: (r) => {
        if (ended || id !== this.runId) return;
        ended = true;
        this.finish(r, best);
      },
    };
    this.game = make(host);
  }

  private setScore(n: number) {
    const b = this.el.querySelector(".ar-score b");
    if (b) b.textContent = num(n);
  }

  private status(html: string) {
    const s = this.el.querySelector<HTMLElement>(".ar-status");
    if (s) s.innerHTML = html;
  }

  /** The end card: the result, the best, the ⓩ paid, again or back. */
  private finish(r: { score: number; won?: boolean; title?: string; line?: string }, oldBest: number) {
    const def = this.def;
    const won = def.kind === "duel" ? !!r.won : true;
    const newBest = def.kind === "score" && r.score > oldBest;
    if (newBest) {
      saveBest(def.key, r.score);
      const b = this.el.querySelector(".ar-best b");
      if (b) b.textContent = num(r.score);
    }
    const chips = def.reward(r.score, won);
    if (chips > 0) bank.pay(chips, `arcade ${def.key}`);
    const xp = def.kind === "duel" ? (won ? 20 : 6) : Math.min(30, 4 + Math.floor(r.score / (def.key === "zkjump" ? 2 : 120)));
    progress.gain(xp);
    profile.update((p) => (p.party.best = Math.max(p.party.best, chips)));
    if (def.kind === "duel") (won ? sfx.fanfare : sfx.sad)();
    else if (newBest) sfx.fanfare();
    const title = r.title ?? (def.kind === "duel" ? (won ? T("You won!", "你赢了！") : T("You lost", "你输了")) : newBest ? T("New best!", "新纪录！") : T("Game over", "游戏结束"));
    this.end(
      true,
      `<div class="ar-card${won ? " won" : ""}">
        <small>${esc(T(def.title, def.titleZh))}</small>
        <h2>${esc(title)}</h2>
        ${def.kind === "score" ? `<div class="ar-big"><b>${num(r.score)}</b><span>${newBest ? T("NEW BEST", "新纪录") : `${T("best", "最高")} ${num(Math.max(oldBest, r.score))}`}</span></div>` : ""}
        ${r.line ? `<p>${r.line}</p>` : ""}
        <div class="ar-gain">${chips > 0 ? `<span class="z">+ⓩ ${num(chips)}</span>` : ""}<span>+${xp} XP</span></div>
        <div class="ar-btns"><button class="ar-again" data-a="again">${T("Play again", "再来一局")}</button><button class="ar-out" data-a="back">${T("Back", "返回")}</button></div>
      </div>`,
    );
  }

  private end(on: boolean, html = "") {
    const e = this.el.querySelector<HTMLElement>(".ar-end")!;
    e.hidden = !on;
    e.innerHTML = html;
    if (on) e.querySelector<HTMLElement>(".ar-again")?.focus({ preventScroll: true });
  }

  /** Esc: the end card's back, else leave. */
  esc() {
    this.close();
  }

  close() {
    this.runId++;
    this.game?.dispose();
    this.game = null;
    document.removeEventListener("visibilitychange", this.hidden);
    this.el.remove();
    this.onClose();
  }
}
