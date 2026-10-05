import type { BlockTxRow, TxKind } from "../../data/types";

/** Where value sits: the four pools, plus the mint (new coins from the block reward). */
export type Node = "mint" | "transparent" | "sprout" | "sapling" | "orchard" | "ironwood";
export const POOLS: Node[] = ["transparent", "sprout", "sapling", "orchard", "ironwood"];
export const NODE_LABEL: Record<Node, string> = { mint: "NEW COINS", transparent: "TRANSPARENT", sprout: "SPROUT", sapling: "SAPLING", orchard: "ORCHARD", ironwood: "IRONWOOD" };
export const NODE_JP: Record<Node, string> = { mint: "発行", transparent: "公開", sprout: "新芽", sapling: "若木", orchard: "果樹園", ironwood: "鉄木" };
export const NODE_COLOR: Record<Node, string> = { mint: "#f4b728", transparent: "#ff9a3c", sprout: "#c9a26b", sapling: "#3ec9b0", orchard: "#3ee08f", ironwood: "#b07bff" };

/** `/v1/tx/{txid}` as the archive reads it: amounts, addresses, value moving through each pool. */
export interface TxFull {
  txid: string;
  kind: TxKind;
  fee: number | null;
  size: number;
  transparent_in: number | null;
  transparent_out: number | null;
  /** Value leaving each pool (positive) or entering it (negative), zatoshis. */
  value_balances?: Partial<Record<"sprout" | "sapling" | "orchard" | "ironwood", number>>;
  inputs?: { value: number | null; address: string | null }[];
  outputs?: { value: number; address: string | null }[];
  sapling_spends?: unknown[];
  sapling_outputs?: unknown[];
  orchard_actions?: unknown[];
  ironwood_actions?: unknown[];
}

/** One movement of value in a transaction. `zat` null: hidden (fully shielded). */
export interface Move {
  from: Node;
  to: Node;
  zat: number | null;
}

/** A transaction as the archive shows it: its row, its detail once fetched, its moves. */
export interface ArchiveTx {
  row: BlockTxRow;
  full: TxFull | null;
  moves: Move[];
}

const SHIELDED = ["sprout", "sapling", "orchard", "ironwood"] as const;

/** The pools a transaction has shielded parts in, from its row (no detail needed). */
function poolsOf(r: BlockTxRow): Node[] {
  const p: Node[] = [];
  if ((r.n_sapling_spends ?? 0) + (r.n_sapling_outputs ?? 0)) p.push("sapling");
  if (r.n_orchard_actions) p.push("orchard");
  if (r.n_ironwood_actions) p.push("ironwood");
  return p;
}

/**
 * The moves of value in a transaction. With its detail: each pool's value balance says what left
 * it (positive) or entered it (negative); value leaving one pool for another is a migration,
 * the rest comes from or goes to the transparent pool. Without it (big blocks): a best guess from
 * the row's kind and shielded parts, amounts unknown.
 */
export function movesOf(r: BlockTxRow, f: TxFull | null): Move[] {
  if (r.kind === "coinbase") {
    const out: Move[] = [];
    const tout = f?.transparent_out ?? r.transparent_out ?? 0;
    if (tout) out.push({ from: "mint", to: "transparent", zat: tout });
    for (const p of SHIELDED) {
      const v = f?.value_balances?.[p] ?? 0;
      if (v < 0) out.push({ from: "mint", to: p, zat: -v });
    }
    return out.length ? out : [{ from: "mint", to: "transparent", zat: tout || null }];
  }
  if (!f) {
    const pools = poolsOf(r);
    const pool = pools.at(-1) ?? "sapling";
    switch (r.kind) {
      case "transparent":
        return [{ from: "transparent", to: "transparent", zat: r.transparent_out ?? null }];
      case "shielding":
        return [{ from: "transparent", to: pool, zat: null }];
      case "deshielding":
        return [{ from: pool, to: "transparent", zat: r.transparent_out ?? null }];
      case "migration":
        return [{ from: "orchard", to: "ironwood", zat: null }];
      default:
        return (pools.length ? pools : ["sapling" as Node]).map((p) => ({ from: p, to: p, zat: null }));
    }
  }
  const fee = f.fee ?? 0;
  const leaving: [Node, number][] = [];
  const entering: [Node, number][] = [];
  for (const p of SHIELDED) {
    const v = f.value_balances?.[p] ?? 0;
    if (v > 0) leaving.push([p, v]);
    else if (v < 0) entering.push([p, -v]);
  }
  const moves: Move[] = [];
  // pool to pool first (Orchard → Ironwood migrations), the rest through the transparent pool
  for (const e of entering) {
    let need = e[1];
    for (const l of leaving) {
      if (!need) break;
      const k = Math.min(need, l[1]);
      if (k > 0) {
        moves.push({ from: l[0], to: e[0], zat: k });
        l[1] -= k;
        need -= k;
      }
    }
    if (need > 0) moves.push({ from: "transparent", to: e[0], zat: need });
  }
  const tout = f.transparent_out ?? 0;
  const tin = f.transparent_in ?? 0;
  for (const l of leaving) {
    // what leaves a pool pays the fee first; anything beyond it lands on transparent outputs
    const out = Math.max(0, l[1] - (tin ? 0 : fee));
    if (out > 0) moves.push({ from: l[0], to: "transparent", zat: out });
  }
  // a public transfer: transparent in, transparent out
  if (tin && tout && !entering.length && !leaving.length) moves.push({ from: "transparent", to: "transparent", zat: tout });
  // fully shielded: the amount never shows, it stays in its pool
  if (!moves.length) {
    const pools = poolsOf(r);
    for (const p of pools.length ? pools : (["sapling"] as Node[])) moves.push({ from: p, to: p, zat: null });
  }
  return moves;
}

/** Moves added up by route, for the jets: one jet per (from, to) pair. */
export interface Route {
  from: Node;
  to: Node;
  /** Known total (hidden amounts excluded), and whether some amounts are hidden. */
  zat: number;
  hidden: boolean;
  txs: ArchiveTx[];
}

export function routesOf(txs: ArchiveTx[]): Route[] {
  const map = new Map<string, Route>();
  for (const t of txs)
    for (const m of t.moves) {
      const k = `${m.from}>${m.to}`;
      let r = map.get(k);
      if (!r) map.set(k, (r = { from: m.from, to: m.to, zat: 0, hidden: false, txs: [] }));
      if (m.zat === null) r.hidden = true;
      else r.zat += m.zat;
      if (!r.txs.includes(t)) r.txs.push(t);
    }
  // the mint first, then the biggest flows
  return [...map.values()].sort((a, b) => (a.from === "mint" ? -1 : b.from === "mint" ? 1 : b.zat - a.zat));
}

export const zecText = (zat: number) => {
  const z = zat / 1e8;
  return z >= 1000 ? `${Math.round(z).toLocaleString("en-US")}` : z >= 1 ? z.toFixed(2) : z >= 0.001 ? z.toFixed(4) : z.toFixed(8).replace(/0+$/, "");
};
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
