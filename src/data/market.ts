import type { BlockDetail } from "./types";
import { get } from "./zscan";

/** `/v1/price`: spot price, its 24 h change and two weeks of daily closes. */
export interface Price {
  usd: number;
  usd_24h_change: number;
  market_cap_usd: number;
  volume_24h_usd: number;
  history: [number, number][];
}
/** `/v1/supply`, the fields Street shows. */
export interface Supply {
  height: number;
  supply: number;
  max_supply: number;
  lockbox: number;
  block_subsidy: number;
  inflation_rate: number;
  next_halving_height: number;
  next_halving_eta: string;
  avg_block_time: number;
}
/** `/v1/pools`: ZEC held in each value pool (zat). */
export interface Pools {
  pools: { transparent: number; sprout: number; sapling: number; orchard: number; ironwood: number };
  shielded: number;
  shielded_ratio: number;
  change_24h: Record<string, number>;
}
/** `/v1/network`. */
export interface Network {
  difficulty: number;
  solps: number;
  avg_block_time: number;
  txs_24h: number;
  fees_24h: number;
  shielded_tx_ratio_24h: number;
}

export interface MarketState {
  price: Price | null;
  supply: Supply | null;
  pools: Pools | null;
  network: Network | null;
}

/** What a block moved: public ZEC out of transparent outputs, and the net flow into each pool. */
export interface BlockFlow {
  height: number;
  publicOut: number;
  deltas: Record<string, number>;
  miner: string | null;
}

const state: MarketState = { price: null, supply: null, pools: null, network: null };
const listeners = new Set<(s: MarketState) => void>();
const flows = new Map<number, BlockFlow>();

async function refresh() {
  const [price, supply, pools, network] = await Promise.all([get<Price>("/v1/price"), get<Supply>("/v1/supply"), get<Pools>("/v1/pools"), get<Network>("/v1/network")]);
  Object.assign(state, { price: price ?? state.price, supply: supply ?? state.supply, pools: pools ?? state.pools, network: network ?? state.network });
  for (const l of listeners) l(state);
}

let started = false;

/** Market, supply, pools and network figures, refreshed every minute (4 requests). */
export const Market = {
  get state() {
    return state;
  },
  subscribe(fn: (s: MarketState) => void) {
    listeners.add(fn);
    if (!started) {
      started = true;
      void refresh();
      setInterval(() => void refresh(), 60_000);
    } else fn(state);
    return () => listeners.delete(fn);
  },
  /** Value moved by a block, from its detail (cached). */
  async flow(height: number): Promise<BlockFlow | null> {
    const hit = flows.get(height);
    if (hit) return hit;
    const b = await get<BlockDetail>(`/v1/blocks/${height}`);
    if (!b) return null;
    const f: BlockFlow = {
      height,
      publicOut: b.txs.filter((t) => t.kind !== "coinbase").reduce((a, t) => a + (t.transparent_out ?? 0), 0),
      deltas: b.pool_deltas ?? {},
      miner: b.miner_pool,
    };
    flows.set(height, f);
    if (flows.size > 40) flows.delete(flows.keys().next().value!);
    return f;
  },
};
