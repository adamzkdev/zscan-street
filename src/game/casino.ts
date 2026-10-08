import type { Block } from "../data/types";
import { links } from "../data/zscan";
import type { ChainClock } from "./clock";
import { profile } from "./profile";
import type { GameHud } from "./ui";

type BetKind = "low" | "high" | "digit" | "red" | "black" | "zero";

interface Bet {
  kind: BetKind;
  digit?: number;
  stake: number;
}

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/**
 * The Block Casino, provably fair: every game is settled by the next block's hash, which nobody in
 * the city can know or choose. High–Low and the exact digit read its last hex digit; the roulette
 * takes the hash's last eight hex digits modulo 37. Each result links to the block on ZScan so
 * anyone can check it.
 */
export class Casino {
  private el: HTMLElement;
  private bets: Bet[] = [];
  private stake = 10;
  private last: { height: number; hash: string; digit: number; wheel: number; lines: string[] } | null = null;

  constructor(
    private hud: GameHud,
    clock: ChainClock,
  ) {
    this.el = document.createElement("div");
    this.el.className = "casino hud";
    hud.root.append(this.el);
    this.el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
      if (!b) return;
      const c = b.dataset.c!;
      if (c === "close") return this.el.classList.remove("open");
      if (c === "stake") this.stake = Number(b.dataset.v);
      else this.place(c as BetKind, b.dataset.d ? Number(b.dataset.d) : undefined);
      this.render();
    });
    document.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-casino]")) this.open();
    });
    clock.onBlock((b) => this.settle(b));
  }

  open() {
    this.el.classList.add("open");
    this.render();
  }

  private place(kind: BetKind, digit?: number) {
    if (this.bets.length >= 6) return this.hud.say("Six bets a block at most");
    if (!profile.pay(-this.stake, "casino")) return this.hud.say("Not enough ⓩ for that stake");
    this.bets.push({ kind, digit, stake: this.stake });
  }

  private settle(b: Block) {
    if (!b.hash) return;
    const digit = parseInt(b.hash.slice(-1), 16);
    const wheel = parseInt(b.hash.slice(-8), 16) % 37;
    const lines: string[] = [];
    let won = 0;
    for (const bet of this.bets) {
      const win =
        bet.kind === "low" ? digit < 8 : bet.kind === "high" ? digit >= 8 : bet.kind === "digit" ? digit === bet.digit : bet.kind === "zero" ? wheel === 0 : bet.kind === "red" ? RED.has(wheel) : wheel !== 0 && !RED.has(wheel);
      // the house keeps about 5%
      const mult = bet.kind === "digit" ? 15 : bet.kind === "zero" ? 35 : 1.9;
      const pay = win ? Math.floor(bet.stake * mult) : 0;
      won += pay;
      const label = bet.kind === "digit" ? `digit ${bet.digit!.toString(16)}` : bet.kind;
      lines.push(`${win ? "✓" : "✗"} ${label} · ${win ? `+${pay}` : `−${bet.stake}`}`);
    }
    if (won) profile.pay(won, "casino");
    if (this.bets.length) this.hud.say(`<b>CASINO · BLOCK ${b.height.toLocaleString("en-US")}</b> · hash ends …${b.hash.slice(-4)} · ${won ? `you won ⓩ ${won}` : "the house wins"}`, () => this.open());
    this.last = { height: b.height, hash: b.hash, digit, wheel, lines };
    this.bets = [];
    this.render();
  }

  private render() {
    if (!this.el.classList.contains("open")) return;
    const digits = [...Array(16).keys()];
    const l = this.last;
    this.el.innerHTML = `<header><label>賭場 · BLOCK CASINO</label><button data-c="close">×</button></header>
      <p>Settled by the <b>next block's hash</b>: nobody here can see it coming or bend it.</p>
      <div class="row">${[10, 50, 200].map((v) => `<button data-c="stake" data-v="${v}" class="${v === this.stake ? "on" : ""}">ⓩ ${v}</button>`).join("")}</div>
      <label class="sub">LAST HEX DIGIT</label>
      <div class="row"><button data-c="low">0–7 ×1.9</button><button data-c="high">8–f ×1.9</button></div>
      <div class="row digits">${digits.map((d) => `<button data-c="digit" data-d="${d}">${d.toString(16)}</button>`).join("")}</div>
      <label class="sub">ROULETTE · LAST 8 HEX MOD 37</label>
      <div class="row"><button data-c="red" class="red">Red ×1.9</button><button data-c="black" class="black">Black ×1.9</button><button data-c="zero" class="zero">0 ×35</button></div>
      <div class="bets">${this.bets.length ? this.bets.map((b) => `<span>${b.kind === "digit" ? `digit ${b.digit!.toString(16)}` : b.kind} · ⓩ ${b.stake}</span>`).join("") : "<span class='muted'>no bets on the next block</span>"}</div>
      ${l ? `<div class="res"><label>BLOCK <a href="${links.block(l.height)}" target="_blank" rel="noopener">${l.height.toLocaleString("en-US")} ↗</a></label><code>${l.hash.slice(0, 10)}…<b>${l.hash.slice(-8)}</b></code><span>digit <b>${l.digit.toString(16)}</b> · wheel <b>${l.wheel}</b> ${l.wheel === 0 ? "" : RED.has(l.wheel) ? "red" : "black"}</span>${l.lines.map((x) => `<div>${x}</div>`).join("")}</div>` : ""}`;
  }
}
