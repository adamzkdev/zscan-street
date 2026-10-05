const num = (n: number) => n.toLocaleString("en-US");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface ArchiveBarCallbacks {
  go(height: number): void;
  step(delta: number): void;
  live(on: boolean): void;
}

/**
 * The Block Archive's console, on screen while you stand on its floor: step a block back or
 * forward, type any height, follow the chain live, or jump to a landmark (genesis, each network
 * upgrade, the tip).
 */
export class ArchiveBar {
  private el: HTMLElement;
  private input: HTMLInputElement;
  private liveBtn: HTMLButtonElement;
  private jump: HTMLSelectElement;
  private seen = 0;

  constructor(root: HTMLElement, cb: ArchiveBarCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "archive-bar hud";
    this.el.innerHTML = `
      <span class="ab-jp">記録</span>
      <button type="button" data-a="prev" title="Previous block ( [ )">◀</button>
      <form><label>#</label><input name="h" type="number" inputmode="numeric" min="0" step="1" aria-label="Block height" /></form>
      <button type="button" data-a="next" title="Next block ( ] )">▶</button>
      <button type="button" data-a="live" class="ab-live" title="Follow new blocks">● LIVE</button>
      <select aria-label="Jump to a landmark block"><option value="">Jump to…</option></select>`;
    root.append(this.el);
    this.input = this.el.querySelector("input")!;
    this.liveBtn = this.el.querySelector(".ab-live")!;
    this.jump = this.el.querySelector("select")!;
    this.el.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const h = Math.floor(Number(this.input.value));
      if (Number.isFinite(h) && h >= 0) cb.go(h);
      this.input.blur();
    });
    this.el.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
      if (a === "prev") cb.step(-1);
      else if (a === "next") cb.step(1);
      else if (a === "live") cb.live(!this.liveBtn.classList.contains("on"));
    });
    this.jump.addEventListener("change", () => {
      const v = this.jump.value;
      this.jump.value = "";
      if (v !== "") cb.go(Number(v));
      this.jump.blur();
    });
    // hidden again as soon as the archive stops drawing (you left the floor or the building)
    setInterval(() => {
      if (performance.now() - this.seen > 400) this.el.classList.remove("on");
    }, 250);
  }

  /** Landmarks for the jump menu: [label, height]. */
  setLandmarks(marks: [string, number][]) {
    this.jump.innerHTML = `<option value="">Jump to…</option>${marks.map(([l, h]) => `<option value="${h}">${esc(l)} · ${num(h)}</option>`).join("")}`;
  }

  /** Called every frame the archive is on screen. */
  tick() {
    this.seen = performance.now();
    this.el.classList.add("on");
  }

  set(height: number | null, live: boolean) {
    if (document.activeElement !== this.input) this.input.value = height === null ? "" : String(height);
    this.liveBtn.classList.toggle("on", live);
  }

  focus() {
    this.input.focus();
    this.input.select();
  }
}
