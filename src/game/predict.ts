import type { Block } from "../data/types";
import type { ChainClock } from "./clock";
import { profile } from "./profile";
import type { GameHud } from "./ui";

/**
 * Bet ⓩ on the next block. Odds follow the chain's habits (about 4 tx a block, a third of blocks
 * empty, 75 s on average): a visitor who reads the mempool and the clock wins more often.
 */
interface Market {
  key: string;
  q: string;
  options: { key: string; label: string; pays: number }[];
  /** The winning option for this block, given the one before. */
  settle(b: Block, prev: Block | null): string;
  /** Seconds after the last block when bets close (time markets only). */
  closesAfter?: number;
}

const SHIELDED = new Set(["shielded", "shielding", "deshielding", "migration"]);

const MARKETS: Market[] = [
  {
    key: "txs",
    q: "How many transactions?",
    options: [
      { key: "0", label: "None", pays: 2.6 },
      { key: "1-3", label: "1 – 3", pays: 2 },
      { key: "4+", label: "4 or more", pays: 3.5 },
    ],
    settle: (b) => (b.txs.length === 0 ? "0" : b.txs.length <= 3 ? "1-3" : "4+"),
  },
  {
    key: "shielded",
    q: "Mostly shielded?",
    options: [
      { key: "yes", label: "Yes", pays: 2.3 },
      { key: "no", label: "No", pays: 1.6 },
    ],
    settle: (b) => (b.txs.length && b.txs.filter((t) => SHIELDED.has(t.kind)).length * 2 > b.txs.length ? "yes" : "no"),
  },
  {
    key: "fast",
    q: "Under 60 seconds?",
    options: [
      { key: "yes", label: "Yes", pays: 1.7 },
      { key: "no", label: "No", pays: 2.1 },
    ],
    settle: (b, prev) => (prev && b.time - prev.time < 60_000 ? "yes" : "no"),
    closesAfter: 20,
  },
];

const STAKES = [10, 50, 200];

interface Bet {
  market: string;
  option: string;
  stake: number;
}

export class Predict {
  private panel: HTMLElement;
  private bets: Bet[] = [];
  private stake = STAKES[0];
  private last: { height: number; lines: string[] } | null = null;
  private timer: ReturnType<typeof setInterval>;
  /** Bets won on a block (the visitor's side scores). */
  onWon: (() => void) | null = null;

  constructor(
    private hud: GameHud,
    private clock: ChainClock,
  ) {
    const btn = document.createElement("button");
    btn.className = "hbtn bet-btn";
    btn.title = "Bet on the next block";
    btn.innerHTML = `<b>賭</b>`;
    hud.root.querySelector(".corner")?.prepend(btn);

    this.panel = document.createElement("div");
    this.panel.className = "betpanel hud";
    hud.root.append(this.panel);
    btn.addEventListener("click", () => {
      this.panel.classList.toggle("open");
      this.render();
    });
    this.panel.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
      if (!el) return;
      const a = el.dataset.a!;
      if (a === "close") this.panel.classList.remove("open");
      else if (a === "stake") this.stake = Number(el.dataset.v);
      else if (a === "bet") this.place(el.dataset.m!, el.dataset.o!);
      this.render();
    });
    clock.onBlock((b, prev) => this.settle(b, prev));
    this.timer = setInterval(() => this.panel.classList.contains("open") && this.render(), 1000);
  }

  private open(m: Market) {
    if (!m.closesAfter || !this.clock.at) return true;
    return (Date.now() - this.clock.at) / 1000 < m.closesAfter;
  }

  private place(market: string, option: string) {
    const m = MARKETS.find((x) => x.key === market);
    if (!m || !this.open(m) || this.bets.some((b) => b.market === market)) return;
    if (!profile.pay(-this.stake, "bet")) return this.hud.say("Not enough ⓩ for that stake");
    this.bets.push({ market, option, stake: this.stake });
    profile.update((p) => p.stats.bets++);
  }

  private settle(b: Block, prev: Block | null) {
    if (!this.bets.length) return;
    const lines: string[] = [];
    let won = 0;
    for (const bet of this.bets) {
      const m = MARKETS.find((x) => x.key === bet.market)!;
      const opt = m.options.find((o) => o.key === bet.option)!;
      const win = m.settle(b, prev) === bet.option;
      if (win) {
        const pay = Math.round(bet.stake * opt.pays);
        won += pay;
        profile.update((p) => p.stats.won++);
        lines.push(`✓ ${m.q} ${opt.label} · +${pay}`);
      } else lines.push(`✗ ${m.q} ${opt.label} · −${bet.stake}`);
    }
    if (won) {
      profile.pay(won, "bets");
      this.onWon?.();
    }
    this.bets = [];
    this.last = { height: b.height, lines };
    this.hud.say(`<b>BLOCK ${b.height.toLocaleString("en-US")}</b> · ${won ? `you won ⓩ ${won}` : "no luck this time"}`);
    this.render();
  }

  private render() {
    if (!this.panel.classList.contains("open")) return;
    const since = this.clock.at ? Math.floor((Date.now() - this.clock.at) / 1000) : null;
    const next = this.clock.height ? this.clock.height + 1 : null;
    this.panel.innerHTML = `<header><label>次のブロック · NEXT BLOCK${next ? ` ${next.toLocaleString("en-US")}` : ""}</label><button data-a="close" title="Close">×</button></header>
      <div class="since">${since === null ? "waiting for a block…" : `last block ${since}s ago`}</div>
      <div class="stakes">${STAKES.map((s) => `<button data-a="stake" data-v="${s}" class="${s === this.stake ? "on" : ""}">ⓩ ${s}</button>`).join("")}</div>
      ${MARKETS.map((m) => {
        const mine = this.bets.find((b) => b.market === m.key);
        const open = this.open(m);
        return `<div class="mk"><span>${m.q}${!open && !mine ? " <em>closed</em>" : ""}</span><div>${m.options
          .map((o) => `<button data-a="bet" data-m="${m.key}" data-o="${o.key}" class="${mine?.option === o.key ? "on" : ""}" ${mine || !open ? "disabled" : ""}>${o.label}<i>×${o.pays}</i></button>`)
          .join("")}</div></div>`;
      }).join("")}
      ${this.last ? `<div class="res"><label>BLOCK ${this.last.height.toLocaleString("en-US")}</label>${this.last.lines.map((l) => `<div>${l}</div>`).join("")}</div>` : ""}`;
  }

  dispose() {
    clearInterval(this.timer);
  }
}
