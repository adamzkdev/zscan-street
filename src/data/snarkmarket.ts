import { get } from "./zscan";

/**
 * The zkSNARKs' market on Zilkroad, as ZScan's API serves it: the cheapest asks (listed items),
 * the best bids, the latest sales and the market's figures. Polled while someone watches it (the
 * ZEC Reserve's trading floor); the API refreshes the order book every few minutes and reads
 * the sales from the venue on each call.
 */

export interface Order {
  id: number;
  rank: number | null;
  ask: number | null;
  bid: number | null;
  last: number | null;
}
export interface Sale {
  id: number;
  price: number;
  time: string;
}
export interface SnarkMarket {
  asks: Order[];
  bids: Order[];
  sales: Sale[];
  floor: number | null;
  listings: number | null;
  bidCount: number | null;
  volume24h: number | null;
  sales24h: number | null;
  at: number;
}

interface Item {
  id: string;
  rank?: number | null;
  ask?: number | null;
  bid?: number | null;
  last?: number | null;
}
interface Coll {
  market?: { floor?: number | null; listings?: number | null; bids?: number | null; volume_24h?: number | null; sales_24h?: number | null } | null;
  venue_items?: Item[];
  venue_sales?: { item_id: string; price: number; time: string }[];
}

const order = (i: Item): Order => ({ id: Number(i.id), rank: i.rank ?? null, ask: i.ask ?? null, bid: i.bid ?? null, last: i.last ?? null });

let state: SnarkMarket | null = null;
const listeners: ((m: SnarkMarket, fresh: Sale[]) => void)[] = [];
let busy = false;

export async function refreshSnarkMarket() {
  if (busy) return state;
  busy = true;
  try {
    const [base, listed, bids] = await Promise.all([get<Coll>("/v1/collections/zksnarks"), get<Coll>("/v1/collections/zksnarks?status=listed&sort=price"), get<Coll>("/v1/collections/zksnarks?status=bids&sort=bid")]);
    if (!base && !listed && !bids) return state;
    const sales = (base?.venue_sales ?? []).map((s) => ({ id: Number(s.item_id), price: s.price, time: s.time })).sort((a, b) => b.time.localeCompare(a.time));
    const m = base?.market;
    const next: SnarkMarket = {
      asks: listed?.venue_items?.filter((i) => i.ask).map(order) ?? state?.asks ?? [],
      bids: bids?.venue_items?.filter((i) => i.bid).map(order).sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0)) ?? state?.bids ?? [],
      sales: base ? sales : (state?.sales ?? []),
      floor: m?.floor ?? state?.floor ?? null,
      listings: m?.listings ?? state?.listings ?? null,
      bidCount: m?.bids ?? state?.bidCount ?? null,
      volume24h: m?.volume_24h ?? state?.volume24h ?? null,
      sales24h: m?.sales_24h ?? state?.sales24h ?? null,
      at: Date.now(),
    };
    // the sales nobody had seen yet (none on the first read: those are history)
    const seen = state?.sales[0]?.time;
    const fresh = state && seen ? next.sales.filter((s) => s.time > seen) : [];
    state = next;
    listeners.forEach((fn) => fn(next, fresh));
    return next;
  } finally {
    busy = false;
  }
}

export const snarkMarket = () => state;
export const onSnarkMarket = (fn: (m: SnarkMarket, fresh: Sale[]) => void) => listeners.push(fn);
