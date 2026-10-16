import type { Decor } from "../scene/decor";

/** Pre-NU7 block spacing (seconds), for the time left once the height is known. */
const SPACING = 75;
/** The banner shows up this long before the expected activation (ms). */
const LEAD = 24 * 3600_000;
/** And stays this long after it (ms of the visitor's time). */
const AFTER = 3600_000;
/** The last blocks before activation are each called out on every screen. */
const CALL_OUT = 12;

export interface Nu7State {
  height: number | null;
  date: string | null;
  activated: boolean;
  tip: number | null;
}

/**
 * NU7 night: the live event around the activation block. A day before, a banner over the city
 * counts down (time from the remaining blocks, blocks left, visitors here right now); the last
 * blocks are called out on every LED screen; at activation the banner turns into "NU7 IS LIVE"
 * and follows the first 25-second blocks (how many, how far apart) for an hour. The fireworks and
 * the NSM sign are scene/nu7.ts. Share posts the moment to X.
 */
export class Nu7Night {
  private el: HTMLDivElement;
  private big: HTMLElement;
  private line: HTMLElement;
  private t = 0;
  private liveAt: number | null = null;
  private arrivals: number[] = [];
  private lastCalled = -1;

  constructor(
    ui: HTMLElement,
    private decor: Decor,
    private o: { state: () => Nu7State; here: () => number },
  ) {
    this.el = document.createElement("div");
    this.el.className = "nu7night";
    this.el.innerHTML = `<span class="tag">NU7</span><b class="big"></b><span class="line"></span><button type="button" class="share" title="Share on X">Share</button>`;
    this.big = this.el.querySelector(".big")!;
    this.line = this.el.querySelector(".line")!;
    this.el.querySelector(".share")!.addEventListener("click", () => this.share());
    ui.appendChild(this.el);
  }

  /** A block reached the street. */
  block(height: number) {
    const s = this.o.state();
    if (s.height === null) return;
    const left = s.height - height;
    if (!s.activated && left > 0 && left <= CALL_OUT && height !== this.lastCalled) {
      this.lastCalled = height;
      this.decor.alert({
        kind: "game",
        title: "NU7 · カウントダウン",
        big: left === 1 ? "NEXT BLOCK" : `${left} BLOCKS`,
        line: `ACTIVATION AT #${s.height.toLocaleString("en-US")}`,
        color: "#b07bff",
      });
    }
    if (height >= s.height) {
      this.arrivals.push(Date.now());
      const n = height - s.height + 1;
      this.decor.alert({
        kind: "game",
        title: n === 1 ? "NU7 · 稼働" : "25 SECOND ERA",
        big: n === 1 ? "FIRST NU7 BLOCK" : `NU7 BLOCK ${n}`,
        line: `#${height.toLocaleString("en-US")}`,
        color: "#3ee08f",
      });
    }
  }

  update(dt: number) {
    if ((this.t += dt) < 1) return;
    this.t = 0;
    const s = this.o.state();
    const here = this.o.here() + 1;
    const people = `${here} here now`;
    if (s.activated && s.height !== null) {
      this.liveAt ??= Date.now();
      if (Date.now() - this.liveAt > AFTER) return this.show(false);
      const since = s.tip !== null ? Math.max(0, s.tip - s.height + 1) : 0;
      const gaps = this.arrivals.slice(1).map((a, i) => (a - this.arrivals[i]) / 1000);
      const avg = gaps.length ? `${Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)} s apart` : "25 s target";
      this.big.textContent = "IS LIVE";
      this.line.textContent = `${since} block${since === 1 ? "" : "s"} since · ${avg} · ${people}`;
      this.el.classList.add("live");
      return this.show(true);
    }
    if (s.height === null || s.tip === null) return this.show(false);
    const left = s.height - s.tip;
    const ms = left * SPACING * 1000;
    if (left <= 0 || ms > LEAD) return this.show(false);
    this.el.classList.remove("live");
    this.big.textContent = `in ${clock(ms)}`;
    this.line.textContent = `${left} block${left === 1 ? "" : "s"} to #${s.height.toLocaleString("en-US")} · ${people}`;
    this.show(true);
  }

  private show(on: boolean) {
    this.el.classList.toggle("on", on);
  }

  private share() {
    const s = this.o.state();
    const text = s.activated
      ? "NU7 is live on Zcash: 25-second blocks, watched live in ZStreet 🛡"
      : `Counting down to NU7 on Zcash in ZStreet: ${this.big.textContent} 🛡`;
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://zstreet.cash")}`;
    window.open(url, "_blank", "noopener");
  }
}

/** "~3 h 12 min", "~12 min", "~40 s": block times are only an estimate. */
function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 3600) return `~${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
  if (s >= 60) return `~${Math.round(s / 60)} min`;
  return `~${s} s`;
}
