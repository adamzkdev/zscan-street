// Viewing-key scan worker. Holds the key and the WebAssembly scanner (zscan_wasm, built from
// wasm/ in the ZScan repo); the key never leaves this browser. Copied from the explorer, except
// that Street passes the API base in "init" (it is not served from the API's origin). Messages:
//   { id, type: "init", key, api? }      → { info }
//   { id, type: "scan", start, end }     → { notes, blocks, outputs, first_height, last_height }
//   { id, type: "spent", nullifiers }    → { spends }
//   { id, type: "decrypt", txid }        → { outputs }  (fetches the full transaction)
import init, { Scanner } from "./zscan_wasm.js";

let scanner = null;
let base = "";
const ready = init();

async function fetchRetry(url, tries = 6) {
  for (let i = 0; ; i++) {
    const res = await fetch(url).catch((e) => ({ ok: false, status: 0, statusText: String(e) }));
    if (res.ok) return res;
    // 429 = rate limited, 5xx = upstream hiccup: back off and retry.
    if (i + 1 >= tries || (res.status !== 0 && res.status !== 429 && res.status < 500)) {
      let message = `${res.status} ${res.statusText}`;
      try {
        message = (await res.json()).message ?? message;
      } catch {}
      throw new Error(message);
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
}

self.onmessage = async ({ data: msg }) => {
  try {
    await ready;
    let result;
    switch (msg.type) {
      case "init":
        scanner?.free();
        scanner = new Scanner(msg.key);
        base = typeof msg.api === "string" ? msg.api.replace(/\/+$/, "") : "";
        result = { info: scanner.info() };
        break;
      case "scan": {
        const res = await fetchRetry(`${base}/v1/compact?start=${msg.start}&end=${msg.end}`);
        result = scanner.scan(new Uint8Array(await res.arrayBuffer()));
        break;
      }
      case "spent":
        result = { spends: scanner.spent_by(msg.nullifiers) };
        break;
      case "decrypt": {
        const res = await fetchRetry(`${base}/v1/tx/${msg.txid}/shielded`);
        result = { outputs: scanner.decrypt_tx(await res.json()) };
        break;
      }
      default:
        throw new Error(`Unknown message ${msg.type}`);
    }
    self.postMessage({ id: msg.id, ok: true, result });
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
