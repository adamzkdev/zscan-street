/// <reference lib="webworker" />
// The ZSA Lab wallet's worker: holds the wasm wallet, syncs compact blocks from the ZSA service,
// builds + proves + signs (≈ seconds, single thread) and broadcasts, so the city never freezes.
// The seed comes from the page and never leaves this browser: only transactions are sent.

import init, { ZsaWallet, offline_flow_json, verify_tx_hex } from "./pkg/zapp_zsa_engine.js";
import wasmUrl from "./pkg/zapp_zsa_engine_bg.wasm?url";

export type Op =
  | { op: "open"; api: string; seedHex: string; state?: Uint8Array; birthday?: number }
  | { op: "sync"; api: string }
  | { op: "issue"; api: string; name: string; amount: number; finalize: boolean }
  | { op: "transfer"; api: string; asset_id: string; amount: number; to: string }
  | { op: "burn"; api: string; asset_id: string; amount: number }
  | { op: "finalize"; api: string; asset_id: string }
  | { op: "track"; txid: string; amount: number }
  | { op: "offline"; seedHex: string }
  | { op: "verify"; hex: string };

/** What every wallet op answers with (plus op-specific fields). */
export interface Snapshot {
  address: string;
  birthday: number;
  scanned: number;
  tip: number;
  state: Uint8Array;
  balances: string;
  history: string;
}

const ready = init({ module_or_path: wasmUrl });
let w: ZsaWallet | null = null;
let seed = "";
let tip = 0;
const CHUNK = 1000;

function stage(id: number, s: string) {
  postMessage({ id, stage: s });
}

async function get(api: string, path: string): Promise<Response> {
  const r = await fetch(`${api}${path}`, { cache: "no-store" });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `ZSA service: ${path.split("?")[0]} answered ${r.status}`);
  }
  return r;
}

async function info(api: string): Promise<{ tip: number }> {
  return (await get(api, "/v1/zsa/info")).json();
}

async function treeAt(api: string, h: number): Promise<string> {
  if (h <= 0) return "";
  const t = (await (await get(api, `/v1/zsa/treestate/${h}`)).json()) as { orchardTree?: string };
  return t.orchardTree ?? "";
}

async function fresh(api: string, birthday: number): Promise<ZsaWallet> {
  return new ZsaWallet(seed, birthday, await treeAt(api, birthday - 1));
}

function snap(): Snapshot {
  const x = w!;
  return { address: x.address(), birthday: x.birthday(), scanned: x.scanned(), tip, state: x.save(), balances: x.balances(), history: x.history() };
}

async function sync(id: number, api: string) {
  tip = (await info(api)).tip;
  const start = w!.scanned();
  for (let guard = 0; w!.scanned() < tip && guard < 10_000; guard++) {
    const from = w!.scanned() + 1;
    const to = Math.min(tip, from + CHUNK - 1);
    const buf = new Uint8Array(await (await get(api, `/v1/zsa/blocks?from=${from}&to=${to}`)).arrayBuffer());
    const rep = JSON.parse(w!.scan(buf)) as { blocks: number; reorg: boolean };
    if (rep.reorg) {
      // The chain changed under us: start over from the birthday (fresh wallets are recent).
      const b = w!.birthday();
      w!.free();
      w = await fresh(api, b);
      continue;
    }
    if (rep.blocks === 0) break; // the service had nothing yet for this range
    postMessage({ id, progress: tip > start ? (w!.scanned() - start) / (tip - start) : 1 });
  }
}

async function send(id: number, api: string, built: string, asset_desc?: string): Promise<{ txid: string; asset_id: string; fee: number }> {
  const b = JSON.parse(built) as { hex: string; txid: string; asset_id: string; fee: number };
  stage(id, "Broadcasting…");
  const r = await fetch(`${api}/v1/zsa/broadcast`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Names are not on chain (ZIP 227 carries the description hash): the service checks and keeps it.
    body: JSON.stringify(asset_desc ? { hex: b.hex, asset_desc } : { hex: b.hex }),
  });
  const j = (await r.json().catch(() => ({}))) as { txid?: string; error?: string };
  if (!r.ok) throw new Error(`The network refused the transaction: ${j.error ?? r.status}`);
  w!.commit(b.txid);
  return { txid: j.txid ?? b.txid, asset_id: b.asset_id, fee: b.fee };
}

async function handle(id: number, m: Op): Promise<unknown> {
  await ready;
  switch (m.op) {
    case "open": {
      seed = m.seedHex;
      w?.free();
      if (m.state && m.state.length) {
        try {
          w = ZsaWallet.load(seed, m.state);
          return snap();
        } catch {
          // Unknown or damaged state: rebuild it from the birthday.
        }
      }
      const birthday = m.birthday && m.birthday > 0 ? m.birthday : (await info(m.api)).tip;
      w = await fresh(m.api, birthday);
      return snap();
    }
    case "sync":
      await sync(id, m.api);
      return snap();
    case "issue":
    case "transfer":
    case "burn":
    case "finalize": {
      stage(id, "Catching up with the chain…");
      await sync(id, m.api);
      const target = w!.scanned() + 1;
      stage(id, "Proving in your browser…");
      postMessage({ id, proving: true });
      const t0 = performance.now();
      const built =
        m.op === "issue"
          ? w!.issue(target, m.name, m.amount, m.finalize)
          : m.op === "transfer"
            ? w!.transfer(target, m.asset_id, m.amount, m.to)
            : m.op === "burn"
              ? w!.burn(target, m.asset_id, m.amount)
              : w!.finalize(target, m.asset_id);
      const proveMs = performance.now() - t0;
      postMessage({ id, proving: false });
      const desc = m.op === "issue" ? m.name : undefined;
      const r = await send(id, m.api, built, desc);
      return { ...snap(), ...r, proveMs };
    }
    case "track":
      w!.track_incoming(m.txid, "zec", m.amount);
      return snap();
    case "offline":
      return JSON.parse(offline_flow_json(m.seedHex));
    case "verify":
      return JSON.parse(verify_tx_hex(m.hex));
  }
}

// One op at a time: the wallet is a single mutable object.
let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (e: MessageEvent<{ id: number; msg: Op }>) => {
  const { id, msg } = e.data;
  chain = chain.then(async () => {
    try {
      postMessage({ id, ok: true, result: await handle(id, msg) });
    } catch (err) {
      postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
    }
  });
};
