import "./zshop.css";
import { atlasBitmap } from "../data/atlas";
import { get, ZScan } from "../data/zscan";
import type { StoreTab, StoreTabContext } from "./economy";

/**
 * zkSNARKs for sale on Zilk Road, in the STORE's ZKSNARKS tab (src/gta/frontend.ts mounts
 * `storeTab` in its wide sheet).
 *
 * What exists and what this does:
 *  - The listings, prices and ranks come from ZScan's API (`/v1/collections/zksnarks?status=listed
 *    &sort=price|rank|price_desc&page=n&q=id`), which mirrors Zilk Road's market (CORS open; Zilk
 *    Road's own `/api/market/listings` sends no CORS header, so a page can't read it directly).
 *    One item's detail (traits, last sale, bid) is `/v1/collections/zksnarks/items/{id}`.
 *  - Buying: Zilk Road's order API (`POST /api/market/orders`) answers "Sign in to buy." without a
 *    Zilk Road session — a sale is opened by the buyer signed in there, with their shielded
 *    address. So the buy action is a deep link to the exact item on Zilk Road
 *    (`https://zilkroad.com/explorer/{id}`), labelled "Buy on Zilk Road": no purchase is pretended
 *    here. Ownership lives in Zilk Road's records (not on chain) and has no public lookup by
 *    wallet, so nothing here claims you own one.
 *  - Playing as any zkSNARK is free in ZStreet: "Play as" picks it (ctx.choose).
 * Portraits come from the collection's one atlas (data/atlas.ts), never one request per item (the
 * image API rate-limits: the 429 lesson); only the detail view loads one full picture.
 */

export interface ZilkListing {
  id: number;
  name: string;
  /** Asking price (zatoshis) or null when not listed. */
  ask: number | null;
  bid: number | null;
  last: number | null;
  rank: number | null;
  traits: { type: string; value: string }[];
}
export interface ZilkMarket {
  floor: number | null;
  listings: number;
  sales24h: number;
  volume24h: number;
}
export type ZilkSort = "price" | "rank" | "price_desc";

interface ApiItem {
  id: string;
  name: string;
  traits?: { trait_type: string; value: string }[];
  rank: number | null;
  ask: number | null;
  bid: number | null;
  last: number | null;
}

const toListing = (i: ApiItem): ZilkListing => ({
  id: Number(i.id),
  name: i.name,
  ask: i.ask,
  bid: i.bid,
  last: i.last,
  rank: i.rank,
  traits: (i.traits ?? []).map((t) => ({ type: t.trait_type, value: t.value })),
});

/** zatoshis → "0.2 ZEC" (no trailing zeros). */
export const zecOf = (zat: number) => `${(zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} ZEC`;

let usdPer: Promise<number | null> | null = null;

export const Zilk = {
  /** The market's numbers: floor, how many listed, the last 24 h. */
  async market(): Promise<ZilkMarket | null> {
    const d = await get<{ market?: { floor: number | null; listings: number; sales_24h: number; volume_24h: number } }>("/v1/collections/zksnarks?status=listed&sort=price");
    const m = d?.market;
    return m ? { floor: m.floor, listings: m.listings, sales24h: m.sales_24h, volume24h: m.volume_24h } : null;
  },
  /** A page of 48 listed zkSNARKs (or one number with `q`). */
  async listings(o: { sort?: ZilkSort; page?: number; q?: string } = {}): Promise<{ items: ZilkListing[]; total: number } | null> {
    const p = new URLSearchParams({ status: "listed", sort: o.sort ?? "price", page: String(o.page ?? 0) });
    if (o.q) p.set("q", o.q);
    const d = await get<{ venue_items: ApiItem[]; venue_total: number | null }>(`/v1/collections/zksnarks?${p}`);
    if (!d) return null;
    return { items: d.venue_items.map(toListing), total: d.venue_total ?? d.venue_items.length };
  },
  /** One zkSNARK, listed or not. */
  async item(id: number): Promise<ZilkListing | null> {
    const d = await get<ApiItem>(`/v1/collections/zksnarks/items/${id}`);
    return d ? toListing(d) : null;
  },
  /** Where it is bought: the item's page on Zilk Road (sign in there with a shielded address). */
  buyUrl: (id: number) => `https://zilkroad.com/explorer/${id}`,
  /** ZEC in dollars (ZScan's spot price), or null. */
  usd(zat: number): Promise<number | null> {
    usdPer ??= get<{ usd: number }>("/v1/price").then((p) => p?.usd ?? null);
    return usdPer.then((u) => (u ? (zat / 1e8) * u : null));
  },
};

// ---- the tab ------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (v: number) => v.toLocaleString("en-US");
const usdText = (v: number | null) => (v === null ? "" : `≈ $${v >= 100 ? n(Math.round(v)) : v.toFixed(2)}`);

/** A portrait cut out of the atlas onto a canvas (32 px per item, 100 per row). */
async function portrait(id: number, size: number): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  try {
    const bmp = await atlasBitmap();
    const cell = bmp.width / 100;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.drawImage(bmp, ((id - 1) % 100) * cell, Math.floor((id - 1) / 100) * cell, cell, cell, 0, 0, size, size);
    bmp.close();
  } catch {}
  return c;
}

export const storeTab: StoreTab = {
  key: "zksnarks",
  mount(el: HTMLElement, ctx: StoreTabContext) {
    let sort: ZilkSort = "price";
    let page = 0;
    let q = "";
    let pick: number | null = null;
    let token = 0;
    let gone = false;
    el.classList.add("zs");
    el.innerHTML = `
      <div class="zs-bar">
        <div class="zs-stats"></div>
        <div class="zs-seg" role="tablist">
          <button type="button" data-sort="price" class="on">Cheapest</button>
          <button type="button" data-sort="rank">Rarest</button>
          <button type="button" data-sort="price_desc">Priciest</button>
        </div>
        <form class="zs-find"><input type="number" min="1" max="10000" placeholder="#1–10000" aria-label="zkSNARK number" /><button class="gf-btn" type="submit">Find</button></form>
      </div>
      <div class="zs-body">
        <div class="zs-grid" aria-label="zkSNARKs for sale"></div>
        <aside class="zs-detail gf-plate"></aside>
      </div>
      <div class="zs-pages"><button class="gf-btn" data-page="-1" type="button">‹ Prev</button><span></span><button class="gf-btn" data-page="1" type="button">Next ›</button></div>`;
    const grid = el.querySelector<HTMLElement>(".zs-grid")!;
    const detail = el.querySelector<HTMLElement>(".zs-detail")!;
    const pages = el.querySelector<HTMLElement>(".zs-pages span")!;

    void Zilk.market().then(async (m) => {
      if (gone || !m) return;
      const floorUsd = m.floor ? await Zilk.usd(m.floor) : null;
      el.querySelector(".zs-stats")!.innerHTML = `<span><small>Floor</small><b>${m.floor ? esc(zecOf(m.floor)) : "—"}</b><i>${usdText(floorUsd)}</i></span><span><small>Listed</small><b>${n(m.listings)}</b></span><span><small>Sales · 24 h</small><b>${n(m.sales24h)}</b></span>`;
    });

    const show = async (id: number) => {
      pick = id;
      for (const t of grid.querySelectorAll<HTMLElement>(".gf-tile")) t.classList.toggle("on", Number(t.dataset.id) === id);
      detail.innerHTML = `<div class="zs-dpic"></div><div class="zs-dbody"><b class="zs-dname">zkSNARK #${id}</b><p class="zs-dline">Loading…</p></div>`;
      const pic = detail.querySelector<HTMLElement>(".zs-dpic")!;
      // the full picture of the one picked (a single request), the atlas cut meanwhile
      void portrait(id, 160).then((c) => pic.childElementCount === 0 && pic.append(c));
      const img = new Image();
      img.alt = `zkSNARK #${id}`;
      img.onload = () => {
        if (pick !== id) return;
        pic.replaceChildren(img);
      };
      img.src = ZScan.zkSnarkImage(id);
      const it = await Zilk.item(id);
      if (pick !== id || gone) return;
      if (!it) {
        detail.querySelector(".zs-dline")!.textContent = "ZScan's API didn't answer. Try again in a moment.";
        return;
      }
      const usd = it.ask ? await Zilk.usd(it.ask) : null;
      if (pick !== id || gone) return;
      const traits = it.traits.map((t) => `<div><dt>${esc(t.type)}</dt><dd>${esc(t.value)}</dd></div>`).join("");
      detail.querySelector(".zs-dbody")!.innerHTML = `
        <b class="zs-dname">zkSNARK #${it.id}</b>
        <div class="zs-dtags">${it.rank ? `<i class="gf-tag">Rank ${n(it.rank)}</i>` : ""}${it.traits.find((t) => t.type === "Lineage")?.value === "Apparition" ? `<i class="gf-tag gold">Apparition</i>` : ""}</div>
        <div class="zs-dprice">${it.ask ? `<em class="gf-price">${esc(zecOf(it.ask))}</em><small>${usdText(usd)}</small>` : `<small>Not listed for sale</small>`}</div>
        <div class="zs-dact">
          <a class="gf-btn gold" href="${Zilk.buyUrl(it.id)}" target="_blank" rel="noopener">${it.ask ? "Buy on Zilk Road ↗" : "See it on Zilk Road ↗"}</a>
          <button class="gf-btn" type="button" data-play="${it.id}">Play as #${it.id}</button>
        </div>
        <p class="zs-dline">${it.last ? `Last sale ${esc(zecOf(it.last))}` : ""}${it.bid ? `${it.last ? " · " : ""}Best bid ${esc(zecOf(it.bid))}` : ""}</p>
        <dl class="zs-traits">${traits}</dl>`;
      detail.querySelector<HTMLElement>("[data-play]")!.addEventListener("click", () => ctx.choose(it.id));
    };

    const load = async () => {
      const my = ++token;
      grid.innerHTML = `<p class="zs-msg">Loading the market…</p>`;
      const r = await Zilk.listings({ sort, page, q: q || undefined });
      if (my !== token || gone) return;
      if (!r) {
        grid.innerHTML = `<p class="zs-msg">The market didn't load (ZScan's API is unreachable). <button class="gf-btn" type="button" data-retry>Retry</button></p>`;
        grid.querySelector("[data-retry]")!.addEventListener("click", () => void load());
        return;
      }
      if (!r.items.length) {
        grid.innerHTML = `<p class="zs-msg">${q ? `#${esc(q)} isn't listed for sale right now.` : "Nothing listed."}</p>`;
        if (q) void show(Number(q));
        return;
      }
      const pagesN = Math.max(1, Math.ceil(r.total / 48));
      pages.textContent = `${page + 1} / ${pagesN}`;
      el.querySelector<HTMLButtonElement>('[data-page="-1"]')!.disabled = page === 0;
      el.querySelector<HTMLButtonElement>('[data-page="1"]')!.disabled = page + 1 >= pagesN;
      grid.innerHTML = r.items
        .map(
          (it) => `<button class="gf-tile zs-tile" type="button" data-id="${it.id}" aria-label="zkSNARK #${it.id}${it.ask ? `, ${zecOf(it.ask)}` : ""}">
            <span class="zs-pic"></span><b>#${it.id}</b>${it.rank ? `<i class="gf-tag">Rank ${n(it.rank)}</i>` : ""}<em class="gf-price">${it.ask ? esc(zecOf(it.ask)) : "—"}</em></button>`,
        )
        .join("");
      for (const t of grid.querySelectorAll<HTMLElement>(".zs-tile")) {
        const id = Number(t.dataset.id);
        void portrait(id, 72).then((c) => t.querySelector(".zs-pic")!.append(c));
        t.addEventListener("click", () => void show(id));
      }
      if (pick === null || !r.items.some((i) => i.id === pick)) void show(r.items[0].id);
    };

    el.querySelector(".zs-seg")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-sort]");
      if (!b) return;
      sort = b.dataset.sort as ZilkSort;
      page = 0;
      q = "";
      for (const o of el.querySelectorAll(".zs-seg button")) o.classList.toggle("on", o === b);
      void load();
    });
    el.querySelector(".zs-pages")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
      if (!b || (b as HTMLButtonElement).disabled) return;
      page = Math.max(0, page + Number(b.dataset.page));
      void load();
    });
    el.querySelector<HTMLFormElement>(".zs-find")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Math.round(Number((e.currentTarget as HTMLFormElement).querySelector("input")!.value));
      if (!(v >= 1 && v <= 10000)) return;
      q = String(v);
      page = 0;
      for (const o of el.querySelectorAll(".zs-seg button")) o.classList.remove("on");
      void load();
    });
    // typing in the search must not drive the menu
    el.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") e.stopPropagation();
    });
    void load();
    return () => {
      gone = true;
      el.classList.remove("zs");
    };
  },
};
