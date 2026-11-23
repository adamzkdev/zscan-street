import { atlasBitmap } from "../data/atlas";
import { get } from "../data/zscan";

/**
 * The whole collection to choose from (src/gta, the garage): the 10,000 zkSNARKs as one mosaic
 * (the collection's own atlas), filtered on the left by rarity band and by trait (lineage, head,
 * eyes, skin, accessory), or found by number; the mosaic packs what is left, bigger the fewer
 * there are. Hover says who it is, a click picks it.
 */

type Tuple = [number, number | null, number | null, number | null, number | null, number, number, number[]];
interface MapDoc {
  traits: { trait_type: string; values: string[] }[];
  items: Tuple[];
}
interface Item {
  id: number;
  rank: number | null;
  ask: number | null;
  t: number[];
}

const BANDS = [
  { from: 1, to: 10, name: "Legendary", color: "#ff5ad1" },
  { from: 11, to: 100, name: "Epic", color: "#b07bff" },
  { from: 101, to: 500, name: "Rare", color: "#3fa8ff" },
  { from: 501, to: 1000, name: "Superior", color: "#3fd6c6" },
  { from: 1001, to: 2500, name: "Uncommon", color: "#7fd46b" },
  { from: 2501, to: 5000, name: "Common", color: "#d8d2c8" },
  { from: 5001, to: 10000, name: "Core", color: "#9a958e" },
];
const SHOWN = ["Lineage", "Head", "Eyes", "Skin", "Accessory"];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class Mosaic {
  readonly el: HTMLElement;
  private cv: HTMLCanvasElement;
  private tip: HTMLElement;
  private doc: MapDoc | null = null;
  private items: Item[] = [];
  private shown: Item[] = [];
  private atlas: ImageBitmap | null = null;
  /** Filters: a band, and trait values per trait index. */
  private band: number | null = null;
  private picks = new Map<number, Set<number>>();
  private forSale = false;
  private sort: "rank" | "id" = "rank";
  private grid = { cols: 1, cell: 8, x0: 0, y0: 0 };
  private open = false;
  private loading: Promise<void> | null = null;

  constructor(
    parent: HTMLElement,
    private onPick: (id: number) => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "gg-mosaic";
    this.el.innerHTML = `
      <header><h2>The 10,000</h2><span class="gm-count"></span>
        <form class="gm-find"><input type="number" min="1" max="10000" placeholder="Find # (1–10000)" aria-label="zkSNARK number"/></form>
        <div class="gm-sort"><button data-sort="rank" class="on">By rank</button><button data-sort="id">By number</button></div>
        <button class="gm-x" type="button" aria-label="Close">×</button></header>
      <aside class="gm-side"></aside>
      <div class="gm-main"><canvas></canvas><div class="gm-tip"></div><div class="gm-wait">Loading the collection…</div></div>`;
    parent.append(this.el);
    this.cv = this.el.querySelector("canvas")!;
    this.tip = this.el.querySelector(".gm-tip")!;
    this.el.querySelector(".gm-x")!.addEventListener("click", () => this.show(false));
    this.el.querySelector(".gm-find")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Math.round(Number((this.el.querySelector(".gm-find input") as HTMLInputElement).value));
      if (v >= 1 && v <= 10000) this.choose(v);
    });
    for (const b of this.el.querySelectorAll<HTMLElement>(".gm-sort button"))
      b.addEventListener("click", () => {
        this.sort = b.dataset.sort as "rank" | "id";
        for (const o of this.el.querySelectorAll(".gm-sort button")) o.classList.toggle("on", o === b);
        this.filter();
      });
    this.cv.addEventListener("mousemove", (e) => this.hover(e));
    this.cv.addEventListener("mouseleave", () => (this.tip.style.display = "none"));
    this.cv.addEventListener("click", (e) => {
      const it = this.at(e);
      if (it) this.choose(it.id);
    });
    window.addEventListener("resize", () => this.open && this.draw());
    window.addEventListener(
      "keydown",
      (e) => {
        if (this.open && e.key === "Escape") {
          e.stopImmediatePropagation();
          this.show(false);
        }
      },
      true,
    );
  }

  get isOpen() {
    return this.open;
  }

  show(on: boolean) {
    this.open = on;
    this.el.classList.toggle("on", on);
    if (on) void this.load().then(() => this.filter());
  }

  private choose(id: number) {
    this.show(false);
    this.onPick(id);
  }

  private load() {
    return (this.loading ??= (async () => {
      const [doc, atlas] = await Promise.all([get<MapDoc>("/v1/collections/zksnarks/map"), atlasBitmap().catch(() => null)]);
      if (!doc) {
        this.loading = null;
        (this.el.querySelector(".gm-wait") as HTMLElement).textContent = "The collection could not be loaded. Try again in a moment.";
        return;
      }
      this.doc = doc;
      this.atlas = atlas;
      this.items = doc.items.map((t) => ({ id: t[0], rank: t[1], ask: t[2], t: t[7] }));
      (this.el.querySelector(".gm-wait") as HTMLElement).style.display = "none";
      this.side();
    })());
  }

  /** The filters on the left, with how many each would leave. */
  private side() {
    const doc = this.doc!;
    const count = (pred: (i: Item) => boolean) => this.items.reduce((n, i) => n + (pred(i) ? 1 : 0), 0);
    let html = `<h3>Rarity</h3><div class="gm-chips">${BANDS.map((b, k) => `<button class="gm-chip ${this.band === k ? "on" : ""}" data-band="${k}" style="--c:${b.color}"><i></i>${b.name}<small>${b.to - b.from + 1}</small></button>`).join("")}</div>
      <h3>Market</h3><div class="gm-chips"><button class="gm-chip ${this.forSale ? "on" : ""}" data-sale="1" style="--c:#f4b728"><i></i>For sale<small>${count((i) => i.ask != null)}</small></button></div>`;
    const order = SHOWN.map((n) => doc.traits.findIndex((t) => t.trait_type === n)).filter((i) => i >= 0);
    order.forEach((ti) => {
      const tr = doc.traits[ti];
      const sel = this.picks.get(ti) ?? new Set();
      const vals = tr.values
        .map((v, vi) => ({ v, vi, n: count((i) => i.t[ti] === vi) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => a.n - b.n);
      html += `<h3>${esc(tr.trait_type)}${sel.size ? ` <button class="gm-clear" data-clear="${ti}">clear</button>` : ""}</h3><div class="gm-chips">${vals
        .map((x) => `<button class="gm-chip ${sel.has(x.vi) ? "on" : ""}" data-t="${ti}" data-v="${x.vi}">${esc(x.v)}<small>${x.n}</small></button>`)
        .join("")}</div>`;
    });
    const side = this.el.querySelector(".gm-side")!;
    const top = side.scrollTop;
    side.innerHTML = html;
    side.scrollTop = top;
    side.querySelectorAll<HTMLElement>("[data-band]").forEach((b) =>
      b.addEventListener("click", () => {
        const k = Number(b.dataset.band);
        this.band = this.band === k ? null : k;
        this.refresh();
      }),
    );
    side.querySelector<HTMLElement>("[data-sale]")?.addEventListener("click", () => {
      this.forSale = !this.forSale;
      this.refresh();
    });
    side.querySelectorAll<HTMLElement>("[data-t]").forEach((b) =>
      b.addEventListener("click", () => {
        const ti = Number(b.dataset.t),
          vi = Number(b.dataset.v);
        const s = this.picks.get(ti) ?? new Set<number>();
        if (s.has(vi)) s.delete(vi);
        else s.add(vi);
        this.picks.set(ti, s);
        this.refresh();
      }),
    );
    side.querySelectorAll<HTMLElement>("[data-clear]").forEach((b) =>
      b.addEventListener("click", () => {
        this.picks.delete(Number(b.dataset.clear));
        this.refresh();
      }),
    );
  }

  private refresh() {
    this.side();
    this.filter();
  }

  private filter() {
    if (!this.doc) return;
    const band = this.band !== null ? BANDS[this.band] : null;
    this.shown = this.items.filter((i) => {
      if (band && (i.rank == null || i.rank < band.from || i.rank > band.to)) return false;
      if (this.forSale && i.ask == null) return false;
      for (const [ti, set] of this.picks) if (set.size && !set.has(i.t[ti])) return false;
      return true;
    });
    if (this.sort === "rank") this.shown.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    else this.shown.sort((a, b) => a.id - b.id);
    this.el.querySelector(".gm-count")!.textContent = `${this.shown.length.toLocaleString("en-US")} of 10,000`;
    this.draw();
  }

  /** The matches packed into the space, each cell as big as it can be. */
  private draw() {
    const cv = this.cv;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth,
      H = cv.clientHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#07080b";
    g.fillRect(0, 0, W, H);
    const n = this.shown.length;
    if (!n) {
      g.fillStyle = "rgba(243,244,241,0.5)";
      g.font = "600 15px Archivo, sans-serif";
      g.textAlign = "center";
      g.fillText("No zkSNARK has all of these. Take a filter off.", W / 2, H / 2);
      return;
    }
    // the biggest square cell that fits them all
    let cell = Math.floor(Math.sqrt((W * H) / n));
    while (cell > 2 && Math.floor(W / cell) * Math.floor(H / cell) < n) cell--;
    cell = Math.min(cell, 96);
    const cols = Math.max(1, Math.floor(W / cell));
    const rows = Math.ceil(n / cols);
    const x0 = Math.floor((W - cols * cell) / 2),
      y0 = Math.max(0, Math.floor((H - rows * cell) / 2));
    this.grid = { cols, cell, x0, y0 };
    g.imageSmoothingEnabled = false;
    const A = this.atlas;
    const gap = cell >= 24 ? 2 : 0;
    for (let k = 0; k < n; k++) {
      const it = this.shown[k];
      const x = x0 + (k % cols) * cell,
        y = y0 + Math.floor(k / cols) * cell;
      if (A) {
        const s = it.id - 1;
        g.drawImage(A, (s % 100) * 32, Math.floor(s / 100) * 32, 32, 32, x + gap / 2, y + gap / 2, cell - gap, cell - gap);
      } else {
        g.fillStyle = "#1a1b21";
        g.fillRect(x, y, cell - 1, cell - 1);
      }
    }
  }

  private at(e: MouseEvent): Item | null {
    const r = this.cv.getBoundingClientRect();
    const { cols, cell, x0, y0 } = this.grid;
    const c = Math.floor((e.clientX - r.left - x0) / cell),
      rr = Math.floor((e.clientY - r.top - y0) / cell);
    if (c < 0 || c >= cols || rr < 0) return null;
    return this.shown[rr * cols + c] ?? null;
  }

  private hover(e: MouseEvent) {
    const it = this.at(e);
    if (!it || !this.doc) {
      this.tip.style.display = "none";
      return;
    }
    const band = BANDS.find((b) => it.rank != null && it.rank >= b.from && it.rank <= b.to);
    const traits = it.t
      .map((v, i) => [this.doc!.traits[i]?.trait_type, v >= 0 ? this.doc!.traits[i]?.values[v] : undefined])
      .filter((x) => x[0] && x[1] && SHOWN.includes(x[0]))
      .map(([k, v]) => `<span><em>${esc(k!)}</em>${esc(v!)}</span>`)
      .join("");
    this.tip.innerHTML = `<b>zkSNARK #${it.id}</b>${band ? `<i style="--c:${band.color}">${band.name} · rank ${it.rank}</i>` : ""}${traits}${it.ask != null ? `<span><em>For sale</em>${(it.ask / 1e8).toFixed(2)} ZEC</span>` : ""}<small>Click to play as it</small>`;
    const r = this.cv.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    this.tip.style.display = "block";
    this.tip.style.left = `${Math.min(x + 16, r.width - 230)}px`;
    this.tip.style.top = `${Math.min(y + 16, r.height - 200)}px`;
  }
}
