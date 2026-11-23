/**
 * The collection's grid: thousands of cards in a scrolling box, only the rows in sight in the DOM.
 * A tile first shows a light stand-in (the zkSNARK's pixels, its name, its cost), and its painted card
 * comes a moment later from a queue (two a frame), so scrolling through the 10,000 never stalls.
 */
import { cardEl, snarkCanvas } from "../art";
import { card } from "../engine";
import { ensureCards, isSnarkCard } from "../snarkcards";

const queue: { tile: HTMLElement; id: string }[] = [];
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    let n = 0;
    while (queue.length && n < 2) {
      const q = queue.shift()!;
      if (!q.tile.isConnected || q.tile.dataset.id !== q.id || q.tile.dataset.painted) continue;
      const el = cardEl(q.id);
      q.tile.querySelector(".zkf-stand")?.remove();
      q.tile.prepend(el);
      q.tile.dataset.painted = "1";
      n++;
    }
    if (queue.length) requestAnimationFrame(step);
    else pumping = false;
  };
  requestAnimationFrame(step);
}

export interface GridOpts {
  /** Decorate a tile (owned count, missing, in-deck…) — called on create and on `refresh`. */
  decorate(tile: HTMLElement, id: string): void;
  pick(id: string, tile: HTMLElement, e: MouseEvent): void;
  context?(id: string, tile: HTMLElement, e: MouseEvent): void;
  hover?(id: string | null): void;
}

export class CardGrid {
  readonly el: HTMLDivElement;
  private sizer: HTMLDivElement;
  private items: string[] = [];
  private tiles = new Map<number, HTMLElement>();
  private cols = 1;
  private tw = 150;
  private th = 210;
  private gap = 14;
  private ro: ResizeObserver;
  sel: string | null = null;

  constructor(private o: GridOpts) {
    this.el = document.createElement("div");
    this.el.className = "zkf-grid";
    this.sizer = document.createElement("div");
    this.sizer.className = "zkf-sizer";
    this.el.appendChild(this.sizer);
    this.el.addEventListener("scroll", () => this.render(), { passive: true });
    this.el.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>(".zkf-tile");
      if (t?.dataset.id) this.o.pick(t.dataset.id, t, e);
    });
    this.el.addEventListener("contextmenu", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>(".zkf-tile");
      if (t?.dataset.id && this.o.context) {
        e.preventDefault();
        this.o.context(t.dataset.id, t, e);
      }
    });
    this.el.addEventListener("pointerover", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>(".zkf-tile");
      this.o.hover?.(t?.dataset.id ?? null);
    });
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
  }

  set(items: string[], keepScroll = false) {
    this.items = items;
    for (const t of this.tiles.values()) t.remove();
    this.tiles.clear();
    if (!keepScroll) this.el.scrollTop = 0;
    this.layout();
  }
  get count() {
    return this.items.length;
  }

  /** Re-run the decoration on the tiles in sight (ownership changed, a deck changed). */
  refresh() {
    for (const [i, t] of this.tiles) {
      const id = this.items[i];
      if (id) this.o.decorate(t, id);
      t.classList.toggle("sel", id === this.sel);
    }
  }

  select(id: string | null) {
    this.sel = id;
    for (const [i, t] of this.tiles) t.classList.toggle("sel", this.items[i] === id);
  }

  private layout() {
    const W = this.el.clientWidth - 24;
    if (W <= 0) return;
    const small = W < 520;
    this.tw = small ? Math.max(96, Math.floor((W - this.gap * 2) / 3)) : Math.max(128, Math.min(168, Math.floor(W / Math.max(1, Math.round(W / 168))) - this.gap));
    this.cols = Math.max(1, Math.floor((W + this.gap) / (this.tw + this.gap)));
    this.tw = Math.floor((W - this.gap * (this.cols - 1)) / this.cols);
    this.th = Math.round(this.tw * 1.4) + 28;
    const rows = Math.ceil(this.items.length / this.cols);
    this.sizer.style.height = `${rows * (this.th + this.gap) + 30}px`;
    this.el.style.setProperty("--w", `${this.tw}px`);
    for (const t of this.tiles.values()) t.remove();
    this.tiles.clear();
    this.render();
  }

  private render() {
    const top = this.el.scrollTop;
    const H = this.el.clientHeight;
    const rowH = this.th + this.gap;
    const r0 = Math.max(0, Math.floor(top / rowH) - 1);
    const r1 = Math.min(Math.ceil(this.items.length / this.cols), Math.ceil((top + H) / rowH) + 1);
    const want = new Set<number>();
    for (let r = r0; r < r1; r++) for (let c = 0; c < this.cols; c++) want.add(r * this.cols + c);
    for (const [i, t] of this.tiles)
      if (!want.has(i)) {
        t.remove();
        this.tiles.delete(i);
      }
    const fresh: string[] = [];
    for (const i of want) {
      if (i >= this.items.length || this.tiles.has(i)) continue;
      fresh.push(this.items[i]);
    }
    ensureCards(fresh.filter(isSnarkCard));
    for (const i of want) {
      if (i >= this.items.length || this.tiles.has(i)) continue;
      const id = this.items[i];
      const t = this.tile(id);
      const r = Math.floor(i / this.cols),
        c = i % this.cols;
      t.style.transform = `translate(${12 + c * (this.tw + this.gap)}px, ${12 + r * rowH}px)`;
      this.sizer.appendChild(t);
      this.tiles.set(i, t);
      queue.push({ tile: t, id });
    }
    pump();
  }

  private tile(id: string): HTMLElement {
    const d = card(id);
    const t = document.createElement("div");
    t.className = `zkf-tile r-${d.rarity}`;
    t.dataset.id = id;
    if (id === this.sel) t.classList.add("sel");
    const stand = document.createElement("div");
    stand.className = "zkf-stand";
    stand.innerHTML = `<b>${d.cost}</b><span></span><em>${d.name}</em>`;
    stand.querySelector("span")!.appendChild(snarkCanvas(d.art));
    t.appendChild(stand);
    const foot = document.createElement("div");
    foot.className = "zkf-foot";
    t.appendChild(foot);
    this.o.decorate(t, id);
    return t;
  }

  dispose() {
    this.ro.disconnect();
    this.el.remove();
  }
}
