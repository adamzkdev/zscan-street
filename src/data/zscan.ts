import type { ArchiveBlock, Block, BlockDetail, BlockSummary, BlockTxRow, MempoolTx, NftItem, Tx, TxDetail, Upgrades } from "./types";

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.zscan.cash";
export const EXPLORER = (import.meta.env.VITE_EXPLORER_URL as string | undefined) ?? "https://zscan.cash";

/**
 * The public API allows 10 requests/s per IP (bursts of 30). Street spends at most 6/s through a
 * token bucket, and a 429 is retried after a pause instead of being treated as missing data.
 */
const bucket = { tokens: 12, last: performance.now() };
const RATE = 6,
  BURST = 12;
async function slot() {
  for (;;) {
    const now = performance.now();
    bucket.tokens = Math.min(BURST, bucket.tokens + ((now - bucket.last) / 1000) * RATE);
    bucket.last = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    await new Promise((r) => setTimeout(r, ((1 - bucket.tokens) / RATE) * 1000 + 5));
  }
}

export async function get<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await slot();
    try {
      const r = await fetch(`${API}${path}`, { cache: "no-store" });
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        continue;
      }
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function fromMempool(r: MempoolTx, fallbackSeen: number): Tx {
  return {
    txid: r.txid,
    kind: r.kind,
    fee: r.fee,
    size: r.size,
    actions: Math.max(1, r.n_actions ?? 1),
    transparentOut: r.transparent_out ?? 0,
    seenAt: r.seen_at ? Date.parse(r.seen_at) : fallbackSeen,
  };
}

function fromBlock(r: BlockTxRow, height: number, time: number): Tx {
  // Mined rows carry the parts, not the ZIP-317 total: rebuild it the same way the API does.
  const actions =
    Math.max(r.n_tin ?? 0, r.n_tout ?? 0) +
    Math.max(r.n_sapling_spends ?? 0, r.n_sapling_outputs ?? 0) +
    (r.n_orchard_actions ?? 0) +
    (r.n_ironwood_actions ?? 0);
  return { txid: r.txid, kind: r.kind, fee: r.fee, size: r.size, actions: Math.max(1, actions), transparentOut: r.transparent_out ?? 0, seenAt: time, height };
}

export const ZScan = {
  mempool: async () => {
    const mp = await get<{ txs: MempoolTx[] }>("/v1/mempool");
    const now = Date.now();
    return mp ? mp.txs.map((t) => fromMempool(t, now)) : null;
  },
  latestBlock: async () => (await get<BlockSummary[]>("/v1/blocks?limit=1"))?.[0] ?? null,
  block: async (height: number): Promise<Block | null> => {
    const b = await get<BlockDetail>(`/v1/blocks/${height}`);
    if (!b) return null;
    const t = Date.parse(b.time);
    return {
      height: b.height,
      time: t,
      size: b.size,
      fees: b.fees ?? 0,
      pool: b.miner_pool,
      txs: b.txs.filter((x) => x.kind !== "coinbase").map((x) => fromBlock(x, b.height, t)),
    };
  },
  zkSnark: (id: number) => get<NftItem>(`/v1/collections/zksnarks/items/${id}`),
  /** The rarest zkSNARKs, rank first: bodyguards are cast from these. */
  rarest: async (n = 40) => {
    const c = await get<{ venue_items: { id: string; rank: number | null }[] }>(`/v1/collections/zksnarks?sort=rank&limit=${n}`);
    return (c?.venue_items ?? []).filter((i) => i.rank).map((i) => ({ id: Number(i.id), rank: i.rank as number }));
  },
  /** Fill a transaction's visible amount and pool from its detail (works for mempool txs). */
  enrich: async (tx: Tx): Promise<Tx> => {
    if (tx.visible !== undefined) return tx;
    const d = await get<TxDetail>(`/v1/tx/${tx.txid}`);
    if (!d) return tx;
    tx.visible = Math.max(d.transparent_in ?? 0, d.transparent_out ?? 0);
    tx.pool = d.ironwood_actions?.length ? "ironwood" : d.orchard_actions?.length ? "orchard" : d.sapling_spends?.length || d.sapling_outputs?.length ? "sapling" : null;
    return tx;
  },
  zkSnarkImage: (id: number) => `${API}/v1/collections/zksnarks/items/${id}/image`,
  /** Any block in full, genesis to tip (kept in a small cache: stepping back and forth is instant). */
  blockDetail: (height: number): Promise<ArchiveBlock | null> => cached(height, () => get<ArchiveBlock>(`/v1/blocks/${height}`)),
  /** Up to `n` block summaries below `before` (indexed range only: empty further back). */
  blocksBelow: (before: number, n: number) => get<BlockSummary[]>(`/v1/blocks?before=${before}&limit=${n}`),
  upgrades: () => get<Upgrades>("/v1/upgrades"),
};

const blockCache = new Map<number, Promise<ArchiveBlock | null>>();
function cached(height: number, load: () => Promise<ArchiveBlock | null>) {
  let p = blockCache.get(height);
  if (!p) {
    p = load().then((b) => {
      if (!b) blockCache.delete(height);
      return b;
    });
    blockCache.set(height, p);
    // keep the 40 most recent
    if (blockCache.size > 40) blockCache.delete(blockCache.keys().next().value!);
  }
  return p;
}

export const links = {
  tx: (txid: string) => `${EXPLORER}/tx/${txid}`,
  block: (h: number) => `${EXPLORER}/block/${h}`,
};

export interface FeedHandlers {
  snapshot(txs: Tx[], last: BlockSummary | null): void;
  tx(tx: Tx): void;
  block(b: Block): void;
  /** Txids still waiting, every two minutes: anything else expired or was replaced. */
  mempool(txids: Set<string>): void;
  status(s: "connecting" | "live" | "offline"): void;
}

/**
 * Live feed: a mempool snapshot, then the `/v1/ws` stream. Block events only carry the height,
 * so each block is fetched to learn exactly which transactions it took. Returns a closer.
 */
export function connectFeed(h: FeedHandlers): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let lastHeight = 0;

  const fetchBlock = async (height: number) => {
    // The API notifies right after inserting, but retry in case a replica lags.
    for (let i = 0; i < 3 && !closed; i++) {
      const b = await ZScan.block(height);
      if (b) {
        if (b.height > lastHeight) {
          lastHeight = b.height;
          h.block(b);
        }
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  };

  const sweep = setInterval(async () => {
    const txs = await ZScan.mempool();
    if (txs && !closed) h.mempool(new Set(txs.map((t) => t.txid)));
  }, 2 * 60_000);

  const open = async () => {
    h.status("connecting");
    const [txs, last] = await Promise.all([ZScan.mempool(), ZScan.latestBlock()]);
    if (closed) return;
    // Catch up on blocks mined while the socket was down.
    if (lastHeight && last && last.height > lastHeight) {
      for (let k = lastHeight + 1; k <= last.height; k++) await fetchBlock(k);
    }
    if (last && !lastHeight) lastHeight = last.height;
    h.snapshot((txs ?? []).sort((a, b) => a.seenAt - b.seenAt), last);

    ws = new WebSocket(API.replace(/^http/, "ws") + "/v1/ws");
    ws.onopen = () => h.status("live");
    ws.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data as string) as { type: string; data: MempoolTx & { height?: number } };
        if (ev.type === "mempool") h.tx(fromMempool(ev.data, Date.now()));
        else if (ev.type === "block" && ev.data.height) void fetchBlock(ev.data.height);
      } catch {}
    };
    ws.onclose = () => {
      if (closed) return;
      h.status("offline");
      retry = setTimeout(open, 4000);
    };
  };
  void open();

  return () => {
    closed = true;
    clearTimeout(retry);
    clearInterval(sweep);
    ws?.close();
  };
}
