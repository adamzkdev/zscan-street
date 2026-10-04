import { API } from "./zscan";

/**
 * Client-side viewing-key scanner, ported from the ZScan explorer (components/ViewingKey.tsx).
 * Web Workers trial-decrypt `/v1/compact` blocks with the zscan_wasm scanner (public/wasm), so
 * the key stays in this tab: it is never put in a URL, a request, a log or storage. The server
 * only sees which block ranges (and, for memos, which transactions) are downloaded.
 */

export type ShieldedPool = "sapling" | "orchard" | "ironwood";

/** What the wasm scanner reports about a key. */
export interface KeyInfo {
  network: string;
  /** "full" (UFVK / Sapling FVK: sees spends) or "incoming" (UIVK: receipts only). */
  kind: "full" | "incoming";
  pools: ShieldedPool[];
  /** The key also has a transparent part, which is not scanned (transparent data is public). */
  has_transparent: boolean;
}

/** One transaction of the key, net of change: `amount` < 0 is money sent out. */
export interface ViewKeyTx {
  txid: string;
  height: number;
  /** Block time (ms). */
  time: number;
  /** Net effect on the key (zat): received + change − spent. */
  amount: number;
  received: number;
  change: number;
  spent: number;
  direction: "in" | "out";
  /** Main pool of the transaction (the first one touched), and all of them. */
  pool: ShieldedPool;
  pools: ShieldedPool[];
  /** Memos of the notes received (only with `memos: true`; null when none or not loaded). */
  memo: string | null;
  memos: string[];
  /** Payments this key sent (full keys, only with `memos: true`). */
  sentTo: { to: string; value: number }[];
}

export interface ViewKeyResult {
  info: KeyInfo;
  /** Scanned range (inclusive) and how long it took. */
  from: number;
  to: number;
  blocks: number;
  /** Shielded outputs trial-decrypted. */
  outputs: number;
  seconds: number;
  /**
   * Shielded balance per pool (zat). For an incoming key spends are invisible, so this is what
   * was received in the range, like the explorer shows it (`spendsVisible` is false).
   */
  balance: Record<ShieldedPool, number> & { total: number };
  spendsVisible: boolean;
  /** Received from others (zat, change excluded), and spent by the key (zat, change included). */
  received: number;
  spent: number;
  /** Notes found, and how many are still unspent. */
  notes: number;
  unspentNotes: number;
  /** Transactions, newest first. */
  txs: ViewKeyTx[];
}

export interface ScanProgress {
  /** Blocks scanned so far, out of `total`. */
  scanned: number;
  total: number;
  /** Notes found so far. */
  found: number;
  outputs: number;
  /** Seconds left, once there is a rate to go by. */
  eta: number | null;
}

export interface ScanOptions {
  /** Birthday height: first block to scan. Default: 30 days back, like the explorer. */
  from?: number;
  /** Last block to scan. Default: the chain tip. */
  to?: number;
  signal?: AbortSignal;
  onProgress?(p: ScanProgress): void;
  /**
   * Download the found transactions to decrypt memos and recipients (opt-in, like the explorer's
   * "Load memos" button: the server then sees which transactions are asked for).
   */
  memos?: boolean;
  /** How many of the newest transactions get their memos loaded. Default 50. */
  memoLimit?: number;
}

/* ------------------------------------------------------------------ worker pool */

type Note = {
  txid: string;
  height: number;
  time: number;
  tx_index: number;
  pool: ShieldedPool;
  output_index: number;
  value: number;
  scope: "external" | "internal";
  nf: string | null;
};
type ScanChunk = { notes: Note[]; blocks: number; outputs: number };
type Spend = { nf: string; txid: string; height: number; time: number };
type Decrypted = { pool: ShieldedPool; index: number; kind: "received" | "change" | "sent"; value: number; memo: string | null; to: string | null };
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

const WORKER_URL = `${import.meta.env.BASE_URL}wasm/scan-worker.js`;

/** Web Workers each holding the key and a WebAssembly scanner; requests are id-matched. */
class Pool {
  workers: Worker[];
  pending = new Map<number, Pending>();
  next = 1;

  constructor(n: number) {
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(WORKER_URL, { type: "module" });
      w.onmessage = ({ data }) => {
        const p = this.pending.get(data.id);
        if (!p) return;
        this.pending.delete(data.id);
        if (data.ok) p.resolve(data.result);
        else p.reject(new Error(data.error));
      };
      // A worker that fails to load (old browser, blocked WebAssembly) would never answer.
      w.onerror = (e) => {
        e.preventDefault();
        this.fail(new Error(`The scanner could not start in this browser${e.message ? `: ${e.message}` : ""}.`));
      };
      return w;
    });
  }

  call<T>(i: number, msg: Record<string, unknown>): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.workers[i].postMessage({ id, ...msg });
    });
  }

  all<T>(msg: Record<string, unknown>): Promise<T[]> {
    return Promise.all(this.workers.map((_, i) => this.call<T>(i, msg)));
  }

  fail(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  /** Stops the workers, which drops the key and the scanner state with them. */
  terminate(err = new Error("stopped")) {
    for (const w of this.workers) w.terminate();
    this.fail(err);
  }
}

/** Must match MAX_BLOCKS in crates/api/src/routes/compact.rs. */
const CHUNK = 500;
/** Explorer default: up to 4 workers, fewer on small machines. */
const MAX_WORKERS = 4;
/** Explorer default birthday: 30 days back. */
const DEFAULT_DAYS = 30;
/** Where Ironwood (NU6.3) starts on mainnet: the explorer's earliest preset. */
export const NU6_3_MAINNET = 3_428_143;

/**
 * Requests from here are spaced by GAP ms (4/s), on top of Street's own 6/s token bucket in
 * zscan.ts: together they stay under the public API limit of 10/s. Worker retries (429/5xx)
 * back off on their own.
 */
const GAP = 250;
let nextSlot = 0;
async function pace(signal?: AbortSignal) {
  const now = performance.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  signal?.throwIfAborted();
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  await pace(signal);
  const r = await fetch(`${API}${path}`, { cache: "no-store", signal });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

/* ------------------------------------------------------------------ validation */

const SECRET_PREFIXES = ["secret-extended-key", "zxsk", "secret-", "xprv", "tprv", "usk"];

/**
 * Cheap, synchronous check of what was pasted (no wasm): refuses seed phrases and spending keys
 * with the same messages as the scanner, and recognises the viewing-key prefixes. A key that
 * passes can still be malformed: `checkViewingKey` parses it for real.
 */
export function validateViewingKey(key: string): { ok: boolean; kind?: "full" | "incoming"; network?: string; error?: string } {
  const k = key.trim();
  if (!k) return { ok: false, error: "Paste a viewing key." };
  if (k.split(/\s+/).length >= 12) {
    return {
      ok: false,
      error: "This looks like a seed phrase. Never paste your seed phrase into a website: it gives full control of your funds. Export a viewing key from your wallet instead.",
    };
  }
  const lower = k.toLowerCase();
  if (SECRET_PREFIXES.some((p) => lower.startsWith(p))) {
    return {
      ok: false,
      error: "This is a spending key: it can move your funds. Do not paste it anywhere. Export a viewing key (starts with uview1 or uivk1) instead.",
    };
  }
  if (/\s/.test(k)) return { ok: false, error: "A viewing key has no spaces." };
  if (lower.startsWith("uviewtest") || lower.startsWith("zxviewtestsapling")) return { ok: true, kind: "full", network: "testnet" };
  if (lower.startsWith("uivktest")) return { ok: true, kind: "incoming", network: "testnet" };
  if (lower.startsWith("uview1") || lower.startsWith("zxviews1")) return { ok: true, kind: "full", network: "mainnet" };
  if (lower.startsWith("uivk1")) return { ok: true, kind: "incoming", network: "mainnet" };
  return {
    ok: false,
    error: "Not a viewing key. Paste a unified full viewing key (uview1…), a unified incoming viewing key (uivk1…) or a Sapling viewing key (zxviews1…).",
  };
}

/** Parses the key in the wasm scanner (one short-lived worker, no network): its pools and kind. */
export async function checkViewingKey(key: string): Promise<{ ok: true; info: KeyInfo } | { ok: false; error: string }> {
  const quick = validateViewingKey(key);
  if (!quick.ok) return { ok: false, error: quick.error! };
  const pool = new Pool(1);
  try {
    const [{ info }] = await pool.all<{ info: KeyInfo }>({ type: "init", key: key.trim() });
    return { ok: true, info };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    pool.terminate();
  }
}

/* ------------------------------------------------------------------ history */

function buildTxs(notes: Note[], spends: Map<string, Spend>): ViewKeyTx[] {
  const rows = new Map<string, ViewKeyTx>();
  const row = (txid: string, height: number, time: number) => {
    let r = rows.get(txid);
    if (!r) {
      r = { txid, height, time: time * 1000, amount: 0, received: 0, change: 0, spent: 0, direction: "in", pool: "orchard", pools: [], memo: null, memos: [], sentTo: [] };
      rows.set(txid, r);
    }
    return r;
  };
  const addPool = (r: ViewKeyTx, p: ShieldedPool) => {
    if (!r.pools.includes(p)) r.pools.push(p);
  };
  for (const n of notes) {
    const r = row(n.txid, n.height, n.time);
    if (n.scope === "external") r.received += n.value;
    else r.change += n.value;
    addPool(r, n.pool);
    const s = n.nf ? spends.get(n.nf) : undefined;
    if (s) {
      const sr = row(s.txid, s.height, s.time);
      sr.spent += n.value;
      addPool(sr, n.pool);
    }
  }
  const out = [...rows.values()].sort((a, b) => b.height - a.height);
  for (const r of out) {
    r.amount = r.received + r.change - r.spent;
    r.direction = r.spent > 0 ? "out" : "in";
    r.pool = r.pools[0];
  }
  return out;
}

/* ------------------------------------------------------------------ scan */

const abortError = () => new DOMException("The scan was stopped.", "AbortError");

/**
 * Scans the chain for a viewing key's shielded notes, from `from` (birthday) to the tip, in 500-
 * block ranges spread over up to 4 workers, then matches spends (full keys) and builds the
 * history. Rejects with an AbortError when `signal` fires; the workers (and the key) are always
 * dropped at the end.
 */
export async function scanViewingKey(key: string, opts: ScanOptions = {}): Promise<ViewKeyResult> {
  const { signal, onProgress } = opts;
  const quick = validateViewingKey(key);
  if (!quick.ok) throw new Error(quick.error);
  signal?.throwIfAborted();

  type Upgrade = { name: string; activation_height: number; activated: boolean };
  const [status, upgrades] = await Promise.all([
    getJson<{ chain_tip: number }>("/v1/status", signal),
    getJson<{ network?: string; upgrades: Upgrade[] }>("/v1/upgrades", signal).catch(() => null),
  ]);
  const tip = Math.min(status.chain_tip, opts.to ?? Infinity);
  const network = upgrades?.network ?? "mainnet";
  // Blocks per day: 1,152 at 75 s, 3,456 once NU7 (25 s blocks) is active.
  const perDay = upgrades?.upgrades.find((u) => u.name === "Nu7")?.activated ? 3456 : 1152;
  const from = opts.from ?? tip - DEFAULT_DAYS * perDay;
  const start = Math.max(1, Math.min(tip, Math.floor(from) || 0));

  const n = Math.max(1, Math.min(MAX_WORKERS, navigator.hardwareConcurrency || 2));
  const pool = new Pool(n);
  let stopped = false;
  const onAbort = () => {
    stopped = true;
    pool.terminate(abortError());
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const [first] = await pool.all<{ info: KeyInfo }>({ type: "init", key: key.trim(), api: API });
    const info = first.info;
    if (info.network !== network) throw new Error(`This is a ${info.network} key, and this API serves ${network}.`);

    const chunks: [number, number][] = [];
    for (let h = start; h <= tip; h += CHUNK) chunks.push([h, Math.min(tip, h + CHUNK - 1)]);
    const total = tip - start + 1;
    const startedAt = performance.now();
    let done = 0;
    let outputs = 0;
    const found: Note[] = [];
    onProgress?.({ scanned: 0, total, found: 0, outputs: 0, eta: null });

    let nextChunk = 0;
    await Promise.all(
      pool.workers.map(async (_, i) => {
        while (!stopped && nextChunk < chunks.length) {
          const [s, e] = chunks[nextChunk++];
          await pace(signal);
          const r = await pool.call<ScanChunk>(i, { type: "scan", start: s, end: e });
          found.push(...r.notes);
          done += e - s + 1;
          outputs += r.outputs;
          const eta = Math.round((((performance.now() - startedAt) / done) * (total - done)) / 1000);
          onProgress?.({ scanned: done, total, found: found.length, outputs, eta });
        }
      }),
    );
    if (stopped) throw abortError();

    // Spends are indexed per worker: ask all of them about the notes found anywhere.
    const nfs = found.map((f) => f.nf).filter((x): x is string => !!x);
    const spends = new Map<string, Spend>();
    if (nfs.length) {
      for (const r of await pool.all<{ spends: Spend[] }>({ type: "spent", nullifiers: nfs })) {
        for (const s of r.spends) spends.set(s.nf, s);
      }
    }
    const seconds = (performance.now() - startedAt) / 1000;
    const txs = buildTxs(found, spends);

    if (opts.memos && txs.length) {
      const queue = txs.slice(0, opts.memoLimit ?? 50);
      await Promise.all(
        pool.workers.map(async (_, i) => {
          while (!stopped && queue.length) {
            const tx = queue.shift()!;
            try {
              await pace(signal);
              const d = (await pool.call<{ outputs: Decrypted[] }>(i, { type: "decrypt", txid: tx.txid })).outputs;
              tx.memos = d.filter((x) => x.kind !== "sent" && x.memo).map((x) => x.memo!);
              tx.memo = tx.memos[0] ?? null;
              tx.sentTo = d.filter((x) => x.kind === "sent" && x.to).map((x) => ({ to: x.to!, value: x.value }));
            } catch {
              if (stopped) return;
              /* keep the rest */
            }
          }
        }),
      );
      if (stopped) throw abortError();
    }

    const incoming = info.kind === "incoming";
    const counted = incoming ? found : found.filter((x) => !(x.nf && spends.has(x.nf)));
    const balance = { sapling: 0, orchard: 0, ironwood: 0, total: 0 };
    for (const x of counted) {
      balance[x.pool] += x.value;
      balance.total += x.value;
    }
    return {
      info,
      from: start,
      to: tip,
      blocks: total,
      outputs,
      seconds,
      balance,
      spendsVisible: !incoming,
      received: found.filter((x) => x.scope === "external").reduce((s, x) => s + x.value, 0),
      spent: txs.reduce((s, t) => s + t.spent, 0),
      notes: found.length,
      unspentNotes: found.filter((x) => !(x.nf && spends.has(x.nf))).length,
      txs,
    };
  } catch (e) {
    if (stopped || signal?.aborted) throw abortError();
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    pool.terminate();
  }
}
