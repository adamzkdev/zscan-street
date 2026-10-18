/* tslint:disable */
/* eslint-disable */

/**
 * One wallet (one seed) in memory. Persist it with `save()`; the seed is never in the state.
 */
export class ZsaWallet {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * uregtest1… unified address (Orchard receiver only), the form the ZSA service and its
     * sponsor use; consensus does not look at addresses, and any HRP is accepted as a recipient.
     */
    address(): string;
    /**
     * The asset id this wallet's issuance key gives a name.
     */
    asset_id(name: string): string;
    balances(): string;
    birthday(): number;
    burn(target_height: number, asset_id: string, amount_units: number): string;
    /**
     * After a successful broadcast: locks the spent notes, records the tx as pending.
     */
    commit(txid: string): void;
    finalize(target_height: number, asset_id: string): string;
    history(): string;
    issue(target_height: number, name: string, amount_units: number, finalize: boolean): string;
    static load(seed_hex: string, state: Uint8Array): ZsaWallet;
    /**
     * A new wallet born at `birthday`; `orchard_tree_hex` is the tree state at `birthday - 1`.
     */
    constructor(seed_hex: string, birthday: number, orchard_tree_hex: string);
    save(): Uint8Array;
    /**
     * Scans length-prefixed CompactBlocks starting at `scanned() + 1`; JSON report
     * {blocks, received, spent, mined:[txid], reorg}. On reorg nothing is applied.
     */
    scan(stream: Uint8Array): string;
    scanned(): number;
    /**
     * Shows an incoming tx (the drip) as pending until it is mined.
     */
    track_incoming(txid: string, asset_id: string, amount_units: number): void;
    transfer(target_height: number, asset_id: string, amount_units: number, to: string): string;
}

/**
 * The uregtest1 Orchard-only unified address of account 0 of a hex seed.
 */
export function address(seed_hex: string): string;

/**
 * Times one issuance build alone (ms).
 */
export function bench_issue_ms(seed_hex: string): number;

/**
 * Builds, proves and signs a first issuance; returns the raw tx hex for sendrawtransaction.
 */
export function build_issue_hex(seed_hex: string, target_height: number, anchor_hex: string, asset_desc: string, amount: bigint): string;

/**
 * Offline issue → transfer → burn → finalize with real proofs and verification (JSON report).
 */
export function offline_flow_json(seed_hex: string): string;

/**
 * Runs the offline issue + transfer self-test; returns timings in ms and sizes as JSON.
 */
export function selftest_json(seed_hex: string): string;

export function start(): void;

/**
 * Parses a raw tx and verifies its OrchardZSA proof: JSON {txid, bytes, actions, issued, burns, fee, ok}.
 */
export function verify_tx_hex(tx_hex: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_zsawallet_free: (a: number, b: number) => void;
    readonly address: (a: number, b: number) => [number, number, number, number];
    readonly bench_issue_ms: (a: number, b: number) => [number, number, number];
    readonly build_issue_hex: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint) => [number, number, number, number];
    readonly offline_flow_json: (a: number, b: number) => [number, number, number, number];
    readonly selftest_json: (a: number, b: number) => [number, number, number, number];
    readonly start: () => void;
    readonly verify_tx_hex: (a: number, b: number) => [number, number, number, number];
    readonly zsawallet_address: (a: number) => [number, number];
    readonly zsawallet_asset_id: (a: number, b: number, c: number) => [number, number, number, number];
    readonly zsawallet_balances: (a: number) => [number, number];
    readonly zsawallet_birthday: (a: number) => number;
    readonly zsawallet_burn: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly zsawallet_commit: (a: number, b: number, c: number) => [number, number];
    readonly zsawallet_finalize: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly zsawallet_history: (a: number) => [number, number];
    readonly zsawallet_issue: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly zsawallet_load: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly zsawallet_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly zsawallet_save: (a: number) => [number, number];
    readonly zsawallet_scan: (a: number, b: number, c: number) => [number, number, number, number];
    readonly zsawallet_scanned: (a: number) => number;
    readonly zsawallet_track_incoming: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly zsawallet_transfer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
