/**
 * ZK PARTY's arenas, minted from the Zcash chain: every match is seeded by the latest real block's
 * hash (mixed with the game's key, so each game gets its own arena from the same block). Anyone can
 * check the block on ZScan. It only seeds the layout and the rivals' dice; no ⓩ or ZEC are
 * involved, and nothing is written to the chain.
 *
 * Read through ZStreet's data layer (data/zscan.ts: `/v1/blocks?limit=1`), so it shares the city's
 * rate limit. Offline, or slower than `wait` ms: null, and the caller falls back to a local seed.
 */
import { ZScan, links } from "../data/zscan";

export interface ChainSeed {
  height: number;
  /** The block's hash (hex, no 0x). */
  hash: string;
  /** Its last eight hex digits, as a number. */
  seed: number;
  /** The block on ZScan. */
  url: string;
  /** When it was read (ms). */
  at: number;
}

const FRESH = 10_000;
let last: ChainSeed | null = null;
let inflight: Promise<ChainSeed | null> | null = null;

function readHead(wait: number): Promise<ChainSeed | null> {
  return new Promise((done) => {
    const timer = setTimeout(() => done(null), wait);
    ZScan.latestBlock()
      .then((b) => {
        clearTimeout(timer);
        if (!b || typeof b.hash !== "string" || !/^(0x)?[0-9a-f]{16,}$/i.test(b.hash)) return done(null);
        const hash = b.hash.replace(/^0x/i, "");
        done({ height: b.height, hash, seed: Number.parseInt(hash.slice(-8), 16) >>> 0, url: links.block(b.height), at: Date.now() });
      })
      .catch(() => (clearTimeout(timer), done(null)));
  });
}

/** The latest block (read at most every 10 s), or null when the chain is out of reach. */
export async function chainSeed(wait = 2500): Promise<ChainSeed | null> {
  if (last && Date.now() - last.at < FRESH) return last;
  inflight ??= readHead(wait).then((s) => {
    inflight = null;
    if (s) last = s;
    return s ?? last;
  });
  return inflight;
}

/** The last block read, without asking the chain (null before the first read). */
export const lastChainSeed = () => last;

/** A game's own seed from a block: the hash's tail mixed with the game's key (FNV-1a). */
export function seedFor(key: string, s: ChainSeed) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (s.seed ^ h) >>> 0 || 1;
}

/** "#3,123,456 · …a1b2", for a card or a badge. */
export const blockLabel = (s: ChainSeed) => `#${s.height.toLocaleString("en-US")} · …${s.hash.slice(-4)}`;

/** Calls `fn` with each new block while the hall is up (a read every 15 s). Returns a stop. */
export function watchChain(fn: (s: ChainSeed) => void, every = 15_000): () => void {
  let on = true;
  let timer = 0;
  const tick = async () => {
    const s = await chainSeed();
    if (!on) return;
    if (s) fn(s);
    timer = window.setTimeout(tick, every);
  };
  void tick();
  return () => {
    on = false;
    clearTimeout(timer);
  };
}
