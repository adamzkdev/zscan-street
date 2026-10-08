import { profile } from "./profile";

const num = (n: number) => n.toLocaleString("en-US");

/**
 * The game's small HUD pieces, in the street's signage style: a ⓩ wallet chip in the top-right
 * corner (click: the visitor's card), and a toast under the block toast for game news.
 * Build after the Hud, which rewrites #ui.
 */
export class GameHud {
  readonly root: HTMLElement;
  private chip: HTMLButtonElement;
  private card: HTMLElement;
  private toast: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: { html: string; act?: () => void }[] = [];
  /** Extra rows for the visitor's card (cases, cat…), each module adds its own. */
  private rows: (() => string)[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.chip = document.createElement("button");
    this.chip.className = "hbtn zchip";
    this.chip.title = "Your ⓩ (play money)";
    root.querySelector(".corner")?.prepend(this.chip);

    this.card = document.createElement("div");
    this.card.className = "zcard hud";
    root.append(this.card);
    this.chip.addEventListener("click", () => {
      this.card.classList.toggle("open");
      this.renderCard();
    });
    this.card.addEventListener("click", (e) => {
      // the close button, or any of the rows' buttons (they open their own panels)
      if ((e.target as HTMLElement).closest("[data-x], button")) this.card.classList.remove("open");
    });

    this.toast = document.createElement("div");
    this.toast.className = "gtoast hud hidden";
    root.append(this.toast);
    this.toast.addEventListener("click", () => this.queue[0]?.act?.());

    profile.subscribe((p, delta) => {
      this.chip.innerHTML = `<b>ⓩ</b><span>${num(p.z)}</span>`;
      if (delta) {
        const f = document.createElement("i");
        f.className = delta > 0 ? "up" : "down";
        f.textContent = `${delta > 0 ? "+" : ""}${num(delta)}`;
        this.chip.append(f);
        setTimeout(() => f.remove(), 1600);
      }
      if (this.card.classList.contains("open")) this.renderCard();
    });
  }

  addRow(fn: () => string) {
    this.rows.push(fn);
  }

  private renderCard() {
    const p = profile.p;
    this.card.innerHTML = `<header><label>市民 · CITIZEN</label><button data-x title="Close">×</button></header>
      <div class="big"><b>ⓩ ${num(p.z)}</b><small>play money, not ZEC</small></div>
      <dl>
        <dt>Streak</dt><dd>${p.streak} day${p.streak === 1 ? "" : "s"}</dd>
        <dt>Faction</dt><dd>${p.faction ? (p.faction === "shielded" ? "Shielded 🛡" : "Transparent 👁") : "—"}</dd>
        <dt>Bets won</dt><dd>${p.stats.won} / ${p.stats.bets}</dd>
        <dt>Whales shielded</dt><dd>${p.stats.whales}</dd>
        <dt>Cases solved</dt><dd>${Object.keys(p.cases).length}</dd>
        <dt>Shifts worked</dt><dd>${p.stats.jobs}</dd>
        <dt>Secrets found</dt><dd>${p.stats.eggs}</dd>
        ${this.rows.map((r) => r()).join("")}
      </dl>`;
  }

  /** Game news under the block toast, one at a time; with `act`, clicking it does something. */
  say(html: string, act?: () => void) {
    // never more than three waiting: old news is dropped
    if (this.queue.length > 3) this.queue.splice(1, 1);
    this.queue.push({ html, act });
    if (this.queue.length === 1) this.next();
  }

  private next() {
    const item = this.queue[0];
    if (item === undefined) return;
    this.toast.innerHTML = item.html + (item.act ? ` <u>GO ▸</u>` : "");
    this.toast.classList.toggle("act", !!item.act);
    this.toast.classList.remove("hidden");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.classList.add("hidden");
      setTimeout(() => {
        this.queue.shift();
        this.next();
      }, 400);
    }, 5200);
  }
}
