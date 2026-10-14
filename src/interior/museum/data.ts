import { API, EXPLORER, get, ZScan } from "../../data/zscan";
import type { PickInfo } from "../types";
import { median, Purge } from "./purge";

/** The collection as the museum needs it: every item by id and by rank, market figures, the purge. */

/** One item of the collection map: [id, rank, ask, bid, last, sales, volume, trait indices]. */
type MapTuple = [number, number | null, number | null, number | null, number | null, number, number, number[]];

interface MapDoc {
  supply: number;
  floor: number | null;
  traits: { trait_type: string; values: string[] }[];
  items: MapTuple[];
}
interface CollectionDoc {
  market?: { floor: number | null; listings: number | null; sales_24h: number | null; volume_24h: number | null } | null;
}

export const BANDS = [
  { from: 1, to: 10, name: "Legendary" },
  { from: 11, to: 100, name: "Epic" },
  { from: 101, to: 500, name: "Rare" },
  { from: 501, to: 1000, name: "Superior" },
  { from: 1001, to: 2500, name: "Uncommon" },
  { from: 2501, to: 5000, name: "Common" },
  { from: 5001, to: 10000, name: "Core" },
];
export const bandOf = (rank: number | null) => (rank == null ? "" : (BANDS.find((b) => rank >= b.from && rank <= b.to)?.name ?? ""));

export const num = (n: number) => n.toLocaleString("en-US");
export const zec = (zat: number | null | undefined, digits = 2) => (zat == null ? "—" : `${(zat / 1e8).toFixed(zat < 1e8 ? Math.max(digits, 3) : digits)} ZEC`);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Item {
  id: number;
  rank: number | null;
  ask: number | null;
  last: number | null;
  sales: number;
  traits: [string, string][];
}

export class Collection {
  byId = new Map<number, Item>();
  byRank: Item[] = [];
  supply = 10000;
  floor: number | null = null;
  listings: number | null = null;
  sales24: number | null = null;
  volume24: number | null = null;
  /** The Apparitions purge: which items were burned, which became Apparitions. */
  readonly purge = new Purge();
  ready: Promise<boolean>;

  constructor() {
    this.ready = Promise.all([this.load(), this.purge.ready.catch(() => false)]).then(([ok]) => ok);
  }

  private async load() {
    const [map, coll] = await Promise.all([get<MapDoc>("/v1/collections/zksnarks/map"), get<CollectionDoc>("/v1/collections/zksnarks?sort=rank&page=0")]);
    if (!map) return false;
    for (const t of map.items) {
      const traits = t[7]
        .map((v, i) => [map.traits[i]?.trait_type, v >= 0 ? map.traits[i]?.values[v] : undefined])
        .filter((x): x is [string, string] => !!x[0] && !!x[1] && x[0] !== "Background");
      const it: Item = { id: t[0], rank: t[1], ask: t[2], last: t[4], sales: t[5], traits };
      this.byId.set(it.id, it);
    }
    this.byRank = [...this.byId.values()].filter((i) => i.rank != null).sort((a, b) => a.rank! - b.rank!);
    this.supply = map.supply;
    const m = coll?.market;
    this.floor = m?.floor ?? map.floor;
    this.listings = m?.listings ?? map.items.filter((t) => t[2] != null).length;
    this.sales24 = m?.sales_24h ?? null;
    this.volume24 = m?.volume_24h ?? null;
    return true;
  }

  /** The item at a collection rank (1 = rarest). */
  atRank(rank: number) {
    return this.byRank[rank - 1] ?? null;
  }

  trait(it: Item, name: string) {
    return it.traits.find((t) => t[0] === name)?.[1] ?? "";
  }

  /** Wall label lines. */
  label(it: Item): [string, string, string] {
    return [`zkSNARKs #${it.id}`, it.rank != null ? `Rank #${num(it.rank)} · ${bandOf(it.rank)}` : "Unranked", [this.trait(it, "Lineage"), this.trait(it, "Eyes")].filter(Boolean).join(" · ")];
  }

  hover(id: number) {
    const app = this.purge.appOf.get(id);
    if (app) return `<b>${app.name}</b><span>was zkSNARKs #${id} · 26 purged for it</span>`;
    const gone = this.purge.purgedFor.get(id);
    if (gone) return `<b>zkSNARKs #${id}</b><span>purged · ${gone.name}</span>`;
    const it = this.byId.get(id);
    if (!it) return `<b>zkSNARKs #${id}</b>`;
    return `<b>zkSNARKs #${id}</b><span>rank ${it.rank != null ? num(it.rank) : "—"} · ${bandOf(it.rank)}${it.ask != null ? ` · ${zec(it.ask)}` : ""}</span>`;
  }

  info(id: number, where: string): PickInfo {
    const it = this.byId.get(id);
    const link = { href: `${EXPLORER}/collection/zksnarks/item/${id}`, label: "ZScan" };
    const app = this.purge.appOf.get(id);
    if (app) {
      const ps = this.purge.of(app);
      const ranks = ps.map((p) => p.rank).filter((r): r is number => r != null);
      return {
        eyebrow: `${where} · was zkSNARKs #${id}`,
        title: app.name,
        image: ZScan.zkSnarkImage(id),
        tag: ["Apparition", "info"],
        stats: [
          ["Purged", String(ps.length)],
          ["Median rank", ranks.length ? num(Math.round(median(ranks))) : "—"],
          ["Rarest", ranks.length ? `#${num(Math.min(...ranks))}` : "—"],
        ],
        body: `<p>Before, a treasury snark:</p><p><img src="${API}/v1/collections/zksnarks/items/${id}/image?before=1" alt="zkSNARKs #${id} before" width="96" height="96" style="image-rendering:pixelated;border-radius:6px"></p><p>Purged for it: ${ps.map((p) => `#${p.item}`).join(" ")}</p>`,
        link,
      };
    }
    const gone = this.purge.purgedFor.get(id);
    if (gone)
      return {
        eyebrow: `${where} · Rank #${it?.rank != null ? num(it.rank) : "—"}`,
        title: `zkSNARKs #${id}`,
        image: ZScan.zkSnarkImage(id),
        tag: ["Purged", "warn"],
        body: `<p>Burned to reveal ${esc(gone.name)}. Gone for good.</p>`,
        link,
      };
    if (!it) return { eyebrow: where, title: `zkSNARKs #${id}`, image: ZScan.zkSnarkImage(id), link };
    return {
      eyebrow: `${where} · Rank #${it.rank != null ? num(it.rank) : "—"} · ${bandOf(it.rank)}`,
      title: `zkSNARKs #${id}`,
      image: ZScan.zkSnarkImage(id),
      tag: it.ask != null ? ["Listed", "ok"] : ["Not listed", "muted"],
      stats: [
        ["Rank", it.rank != null ? `#${num(it.rank)}` : "—"],
        ["Ask", it.ask != null ? zec(it.ask).replace(" ZEC", "") : "—"],
        ["Last", it.last != null ? zec(it.last).replace(" ZEC", "") : "—"],
        ["Sales", String(it.sales)],
      ],
      body: `<dl class="kvlist">${it.traits.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl><p><a href="https://zilkroad.com/#/${id}" target="_blank" rel="noopener">Zilkroad ↗</a></p>`,
      link,
    };
  }
}
