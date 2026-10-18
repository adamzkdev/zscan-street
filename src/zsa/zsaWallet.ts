// The ZSA Lab's in-browser burner wallet (Zcash Shielded Assets, ZIP 226/227, ZSA test network).
//
//   const w = await ZsaWallet.loadOrCreate(api)      // or ZsaWallet.load(api) / create(api) / restore(api, seed)
//   w.address()                                      // uregtest1… (Orchard only)
//   await w.sync((f) => …)                           // f 0..1
//   w.balances()                                     // { zec_zat, zec_pending_zat, assets:[…] }
//   await w.issue("My Coin", 1_000_000, false, (s) => …)   // → { txid, asset_id, fee, proveMs }
//   await w.transfer(asset_id | "zec", amount, "uregtest1…", stage)
//   await w.burn(asset_id, amount, stage)
//   await w.finalize(asset_id, stage)
//
// Everything is built, proved and signed in a Web Worker (WebAssembly). The seed is generated
// here, kept in localStorage and never sent anywhere; the service only sees compact-block
// requests and the finished transactions. Test network only: keys are stored unencrypted.

import type { Op, Snapshot } from "./zsaWorker";

const SEED_KEY = "zstreet.zsa.seed";
const BIRTHDAY_KEY = "zstreet.zsa.birthday";
const STATE_KEY = "zstreet.zsa.state";
const PROOF_MS_KEY = "zstreet.zsa.proofms";
/** Restores without a birthday scan from here (the lab opened after this height). */
export const LAB_GENESIS = 206_600;

export interface ZsaAssetBalance {
  asset_id: string;
  /** Known for tokens this wallet minted (and from the service's asset list). */
  name: string | null;
  /** Spendable now. */
  units: number;
  /** On its way to us (minted or change), lands when the block is mined. */
  pending: number;
  /** Held by our own unmined transactions. */
  locked: number;
  /** Minted by this wallet's issuance key. */
  mine: boolean;
  finalized: boolean;
}

export interface ZsaBalances {
  scanned: number;
  zec_zat: number;
  zec_pending_zat: number;
  zec_locked_zat: number;
  assets: ZsaAssetBalance[];
}

export interface ZsaTx {
  txid: string;
  kind: "issue" | "transfer" | "burn" | "finalize" | "incoming";
  asset_id: string;
  amount: number;
  fee: number;
  created: number;
  expiry: number;
  mined: number;
  status: "pending" | "mined" | "expired";
}

export interface ZsaSent {
  txid: string;
  asset_id: string;
  fee: number;
  /** Build + prove + sign time in this browser (ms). */
  proveMs: number;
}

export type Stage = (s: string) => void;

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; stage?: Stage; progress?: (f: number) => void; ticker?: ReturnType<typeof setInterval> };

/** The worker (one per page) and its request/response plumbing. */
class Engine {
  private worker = new Worker(new URL("./zsaWorker.ts", import.meta.url), { type: "module" });
  private next = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent) => {
      const d = e.data as { id: number; ok?: boolean; result?: unknown; error?: string; stage?: string; progress?: number; proving?: boolean };
      const p = this.pending.get(d.id);
      if (!p) return;
      if (d.stage !== undefined) p.stage?.(d.stage);
      if (d.progress !== undefined) p.progress?.(d.progress);
      if (d.proving === true && p.stage) {
        // The prover reports no progress: estimate it from the last proof time in this browser.
        const expect = Number(store.get(PROOF_MS_KEY)) || 15_000;
        const t0 = performance.now();
        p.ticker = setInterval(() => {
          const pct = Math.min(99, Math.round(((performance.now() - t0) / expect) * 100));
          p.stage!(`Proving in your browser… ${pct}%`);
        }, 250);
      }
      if (d.proving === false && p.ticker) clearInterval(p.ticker);
      if (d.ok !== undefined) {
        if (p.ticker) clearInterval(p.ticker);
        this.pending.delete(d.id);
        if (d.ok) p.resolve(d.result);
        else p.reject(new Error(d.error));
      }
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(`ZSA worker: ${e.message}`));
      this.pending.clear();
    };
  }

  call<T>(msg: Op, opts: { stage?: Stage; progress?: (f: number) => void } = {}): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, ...opts });
      this.worker.postMessage({ id, msg });
    });
  }
}

let engine: Engine | null = null;
const getEngine = () => (engine ??= new Engine());

export class ZsaWallet {
  private snap!: Snapshot;
  private names = new Map<string, string>();

  private constructor(
    readonly api: string,
    private seedHex: string,
  ) {}

  private static async open(api: string, seedHex: string, birthday?: number, state?: Uint8Array): Promise<ZsaWallet> {
    const w = new ZsaWallet(api, seedHex);
    w.apply(await getEngine().call<Snapshot>({ op: "open", api, seedHex, birthday, state }));
    store.set(SEED_KEY, seedHex);
    store.set(BIRTHDAY_KEY, String(w.snap.birthday));
    return w;
  }

  /** The wallet saved in this browser, or null. */
  static async load(api: string): Promise<ZsaWallet | null> {
    const seed = store.get(SEED_KEY);
    if (!seed) return null;
    const state = store.get(STATE_KEY);
    const birthday = Number(store.get(BIRTHDAY_KEY)) || LAB_GENESIS;
    return ZsaWallet.open(api, seed, birthday, state ? unb64(state) : undefined);
  }

  /** A new wallet: 32 random bytes, born at the chain tip (so its first sync is one block). */
  static async create(api: string): Promise<ZsaWallet> {
    store.del(STATE_KEY);
    return ZsaWallet.open(api, hex(crypto.getRandomValues(new Uint8Array(32))));
  }

  static async loadOrCreate(api: string): Promise<ZsaWallet> {
    return (await ZsaWallet.load(api)) ?? ZsaWallet.create(api);
  }

  /** From an exported seed: `hex` or `hex:birthday` (as `exportSeed()` gives it). */
  static async restore(api: string, exported: string): Promise<ZsaWallet> {
    const [h, b] = exported.trim().toLowerCase().split(":");
    if (!/^[0-9a-f]{64,}$/.test(h) || h.length % 2) throw new Error("A seed is 64 hex characters (optionally :birthday).");
    store.del(STATE_KEY);
    return ZsaWallet.open(api, h, Number(b) > 0 ? Number(b) : LAB_GENESIS);
  }

  /** Forgets the wallet in this browser (export the seed first). */
  static forget() {
    store.del(SEED_KEY);
    store.del(BIRTHDAY_KEY);
    store.del(STATE_KEY);
  }

  private apply(s: Snapshot) {
    this.snap = s;
    store.set(STATE_KEY, b64(s.state));
  }

  address(): string {
    return this.snap.address;
  }

  /** `seedhex:birthday`: restores this wallet anywhere (test network only). */
  exportSeed(): string {
    return `${this.seedHex}:${this.snap.birthday}`;
  }

  get scanned() {
    return this.snap.scanned;
  }
  get tip() {
    return this.snap.tip;
  }
  get birthday() {
    return this.snap.birthday;
  }

  async sync(onProgress?: (f: number) => void): Promise<void> {
    this.apply(await getEngine().call<Snapshot>({ op: "sync", api: this.api }, { progress: onProgress }));
    onProgress?.(1);
    if (this.balances().assets.some((a) => !a.name)) void this.learnNames();
  }

  /** Names of tokens we hold but did not mint, from the service's asset list (best effort). */
  private async learnNames() {
    try {
      const r = await fetch(`${this.api}/v1/zsa/assets`, { cache: "no-store" });
      if (!r.ok) return;
      for (const a of (await r.json()) as { asset_id: string; name: string }[]) if (a.name) this.names.set(a.asset_id, a.name);
    } catch {}
  }

  balances(): ZsaBalances {
    const b = JSON.parse(this.snap.balances) as ZsaBalances;
    for (const a of b.assets) a.name ??= this.names.get(a.asset_id) ?? null;
    return b;
  }

  history(): ZsaTx[] {
    return JSON.parse(this.snap.history) as ZsaTx[];
  }

  /** Shows an incoming ZEC transaction (the drip) as pending until it is mined. */
  async trackIncoming(txid: string, amount_zat: number) {
    this.apply(await getEngine().call<Snapshot>({ op: "track", txid, amount: amount_zat }));
  }

  private async tx(msg: Op, stage?: Stage): Promise<ZsaSent> {
    const r = await getEngine().call<Snapshot & ZsaSent>(msg, { stage });
    this.apply(r);
    // Learn this browser's proof time for the next progress estimate.
    store.set(PROOF_MS_KEY, String(Math.round(r.proveMs)));
    stage?.("Sent: waiting for the next block…");
    return { txid: r.txid, asset_id: r.asset_id, fee: r.fee, proveMs: r.proveMs };
  }

  /** Mints `amount` units of the token `name` (≤ 32 bytes UTF-8) to this wallet (ZIP 227). */
  issue(name: string, amount: number, finalize: boolean, stage?: Stage) {
    return this.tx({ op: "issue", api: this.api, name, amount, finalize }, stage);
  }

  /** Sends `amount` of a token (or "zec", in zatoshis) to a unified address. */
  transfer(asset_id: string, amount: number, to: string, stage?: Stage) {
    return this.tx({ op: "transfer", api: this.api, asset_id, amount, to }, stage);
  }

  /** Burns `amount` units of a token for good (ZIP 226). */
  burn(asset_id: string, amount: number, stage?: Stage) {
    return this.tx({ op: "burn", api: this.api, asset_id, amount }, stage);
  }

  /** Seals one of our tokens: no more can ever be minted (ZIP 227 finalization). */
  finalize(asset_id: string, stage?: Stage) {
    return this.tx({ op: "finalize", api: this.api, asset_id }, stage);
  }
}

/** Offline self-test in the worker: issue → transfer → burn → finalize, real proofs, verified. */
export function offlineSelfTest(seedHex = hex(crypto.getRandomValues(new Uint8Array(32)))): Promise<{
  times: { step: string; ms: number }[];
  tx_bytes: number[];
  fees: number[];
  asset_id: string;
  state_bytes: number;
  balances: ZsaBalances;
}> {
  return getEngine().call({ op: "offline", seedHex });
}

/** Parses a raw transaction and verifies its OrchardZSA proof (in the worker). */
export function verifyTx(txHex: string): Promise<{ txid: string; bytes: number; actions: number; issued: number; burns: number; fee: number; ok: boolean }> {
  return getEngine().call({ op: "verify", hex: txHex });
}
