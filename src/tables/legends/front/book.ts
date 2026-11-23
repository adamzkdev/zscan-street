/**
 * The collection's book: the cards a page at a time (4 × 2, 2 × 2 on a phone held upright), turned with
 * the arrows at its edges, the wheel or the arrow keys. A page only paints its own eight cards; the
 * zkSNARK cards' data is made on the way (ensureCards).
 */
import { cardEl } from "../art";
import { ensureCards, isSnarkCard } from "../snarkcards";

export interface BookOpts {
  /** Decorate a tile (owned count, missing, in-deck…): on create and on `refresh`. */
  decorate(tile: HTMLElement, id: string): void;
  pick(id: string, tile: HTMLElement, e: MouseEvent): void;
  context?(id: string, tile: HTMLElement, e: MouseEvent): void;
  /** The page changed (or the list): page from 0; turned when a page was turned. */
  paged?(page: number, pages: number, turned: boolean): void;
}

export class CardBook {
  readonly el: HTMLDivElement;
  private leaf: HTMLDivElement;
  private prev: HTMLButtonElement;
  private next: HTMLButtonElement;
  private items: string[] = [];
  private page = 0;
  private cols = 4;
  private rows = 2;
  private cw = 160;
  private ro: ResizeObserver;
  private wheelAt = 0;
  sel: string | null = null;

  constructor(private o: BookOpts) {
    this.el = document.createElement("div");
    this.el.className = "zkf-book";
    this.el.innerHTML = `<button class="zkf-turn prev" type="button" aria-label="Previous page"></button><div class="zkf-leaf"></div><button class="zkf-turn next" type="button" aria-label="Next page"></button>`;
    this.leaf = this.el.querySelector(".zkf-leaf") as HTMLDivElement;
    this.prev = this.el.querySelector(".prev") as HTMLButtonElement;
    this.next = this.el.querySelector(".next") as HTMLButtonElement;
    this.prev.addEventListener("click", () => this.turn(-1));
    this.next.addEventListener("click", () => this.turn(1));
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
    this.el.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaY) + Math.abs(e.deltaX) < 8) return;
        e.preventDefault();
        const now = performance.now();
        if (now - this.wheelAt < 320) return;
        this.wheelAt = now;
        this.turn((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1);
      },
      { passive: false },
    );
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
  }

  get pages() {
    return Math.max(1, Math.ceil(this.items.length / (this.cols * this.rows)));
  }
  get count() {
    return this.items.length;
  }

  set(items: string[], keepPage = false) {
    this.items = items;
    if (!keepPage) this.page = 0;
    this.page = Math.min(this.page, this.pages - 1);
    this.draw(0);
  }

  /** Turn by d pages (no wrap). */
  turn(d: number): boolean {
    const p = Math.max(0, Math.min(this.pages - 1, this.page + d));
    if (p === this.page) return false;
    this.page = p;
    this.draw(d);
    return true;
  }

  /** Go to the page that holds id. */
  show(id: string) {
    const i = this.items.indexOf(id);
    if (i < 0) return;
    const p = Math.floor(i / (this.cols * this.rows));
    if (p !== this.page) {
      const d = p - this.page;
      this.page = p;
      this.draw(d);
    }
  }

  refresh() {
    for (const t of this.leaf.querySelectorAll<HTMLElement>(".zkf-tile")) {
      this.o.decorate(t, t.dataset.id!);
      t.classList.toggle("sel", t.dataset.id === this.sel);
    }
  }

  select(id: string | null) {
    this.sel = id;
    for (const t of this.leaf.querySelectorAll<HTMLElement>(".zkf-tile")) t.classList.toggle("sel", t.dataset.id === id);
  }

  private layout() {
    const W = this.el.clientWidth,
      H = this.el.clientHeight;
    if (W <= 0 || H <= 0) return;
    const narrow = W < 560;
    const cols = narrow ? 2 : 4,
      rows = narrow && H > W * 1.25 ? 3 : 2;
    const arrows = narrow ? 0 : 128;
    const gx = narrow ? 14 : Math.max(18, W * 0.022),
      gy = narrow ? 30 : 36;
    const cw = Math.floor(Math.min((W - arrows - gx * (cols - 1)) / cols, (H - gy * rows) / rows / 1.4));
    const changed = cols !== this.cols || rows !== this.rows;
    const first = this.page * this.cols * this.rows;
    this.cols = cols;
    this.rows = rows;
    this.cw = Math.max(70, cw);
    this.el.style.setProperty("--w", `${this.cw}px`);
    this.el.style.setProperty("--gx", `${gx}px`);
    this.el.style.setProperty("--gy", `${gy}px`);
    this.el.style.setProperty("--cols", String(cols));
    this.el.classList.toggle("narrow", narrow);
    if (changed) {
      this.page = Math.floor(first / (cols * rows));
      this.draw(0);
    }
  }

  private draw(dir: number) {
    const per = this.cols * this.rows;
    const ids = this.items.slice(this.page * per, this.page * per + per);
    ensureCards(ids.filter(isSnarkCard));
    const old = this.leaf.querySelector(".zkf-pg") as HTMLElement | null;
    const pg = document.createElement("div");
    pg.className = "zkf-pg";
    for (const id of ids) pg.appendChild(this.tile(id));
    this.leaf.appendChild(pg);
    if (old) {
      if (dir) {
        const s = dir > 0 ? 1 : -1;
        old.style.pointerEvents = "none";
        old.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${-s * 48}px) rotateY(${s * 8}deg)`, opacity: 0 }], { duration: 200, easing: "cubic-bezier(.4,0,.8,.6)", fill: "forwards" }).onfinish = () => old.remove();
        pg.animate([{ transform: `translateX(${s * 48}px) rotateY(${-s * 8}deg)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, delay: 90, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" });
      } else old.remove();
    }
    this.prev.disabled = this.page <= 0;
    this.next.disabled = this.page >= this.pages - 1;
    this.o.paged?.(this.page, this.pages, dir !== 0);
  }

  private tile(id: string): HTMLElement {
    const t = document.createElement("div");
    t.className = "zkf-tile";
    t.dataset.id = id;
    if (id === this.sel) t.classList.add("sel");
    t.appendChild(cardEl(id));
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
