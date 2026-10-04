// Shapes served by zscan-api, kept in step with scan/lib/types.ts and lib/kinds.ts.

export type TxKind = "coinbase" | "transparent" | "shielding" | "deshielding" | "shielded" | "migration" | "mixed";

export const KIND_LABEL: Record<TxKind, string> = {
  coinbase: "Coinbase",
  transparent: "Transparent",
  shielding: "Shielding",
  deshielding: "Deshielding",
  shielded: "Shielded",
  migration: "Migration",
  mixed: "Mixed",
};

export const KIND_HELP: Record<TxKind, string> = {
  coinbase: "Block reward paid to the miner",
  transparent: "Public transfer between transparent addresses",
  shielding: "Moves public ZEC into a shielded pool",
  deshielding: "Moves shielded ZEC out to transparent addresses",
  shielded: "Fully private: sender, receiver and amount are hidden",
  migration: "Moves ZEC from the Orchard pool into Ironwood",
  mixed: "Combination of transparent and shielded flows",
};

/** `/v1/mempool` row, and the payload of a `mempool` event on `/v1/ws`. */
export interface MempoolTx {
  txid: string;
  seen_at?: string;
  size: number;
  kind: TxKind;
  fee: number | null;
  transparent_out?: number;
  n_actions?: number;
}

/** A transaction row inside `/v1/blocks/{height}`: parts instead of the ZIP-317 total. */
export interface BlockTxRow {
  txid: string;
  kind: TxKind;
  fee: number | null;
  size: number;
  n_tin?: number;
  n_tout?: number;
  n_sapling_spends?: number;
  n_sapling_outputs?: number;
  n_orchard_actions?: number;
  n_ironwood_actions?: number;
  transparent_out?: number;
}

export interface BlockSummary {
  height: number;
  hash: string;
  time: string;
  tx_count: number;
  size: number;
  fees: number | null;
  miner_pool: string | null;
}

export interface BlockDetail extends BlockSummary {
  txs: BlockTxRow[];
  /** Net zat into each value pool in this block. */
  pool_deltas?: Record<string, number>;
}

/** `/v1/collections/zksnarks/items/{id}`. */
export interface NftItem {
  id: string;
  name: string;
  traits: { trait_type: string; value: string }[];
  rank: number | null;
  ask: number | null;
  last: number | null;
  url: string;
}

/** A transaction as Street tracks it. */
export interface Tx {
  txid: string;
  kind: TxKind;
  /** zatoshis */
  fee: number | null;
  size: number;
  /** ZIP-317 logical actions */
  actions: number;
  /** Public outputs in zatoshis; shielded amounts are not visible to anyone. */
  transparentOut: number;
  /** When zscan-api first saw it in the mempool (ms). */
  seenAt: number;
  /** Set once a block carries it. */
  height?: number;
  /**
   * Publicly visible ZEC moved (zat): the transparent side, max of transparent inputs and outputs.
   * Filled from the tx detail; fully shielded amounts stay hidden and count as 0 here.
   */
  visible?: number;
  /** Shielded pool(s) the transaction touches, from its actions. */
  pool?: "orchard" | "ironwood" | "sapling" | null;
}

/** `/v1/tx/{txid}`: the fields Street uses. */
export interface TxDetail {
  txid: string;
  transparent_in: number | null;
  transparent_out: number | null;
  value_balances?: { sapling: number; orchard: number; ironwood: number };
  sapling_spends?: unknown[];
  sapling_outputs?: unknown[];
  orchard_actions?: unknown[];
  ironwood_actions?: unknown[];
}

export interface Block {
  height: number;
  time: number;
  size: number;
  fees: number;
  pool: string | null;
  txs: Tx[];
}
