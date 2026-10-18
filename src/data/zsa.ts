import { API } from "./zscan";

/** The ZSA Lab's service (zsa-svc behind api.zscan.cash; `VITE_ZSA_URL` points elsewhere in dev). */
export const ZSA_API = (import.meta.env.VITE_ZSA_URL as string | undefined) ?? API;

/** GET /v1/zsa/info */
export interface ZsaInfo {
  network: string;
  tip: number;
  sponsor: { address: string; balance_zat: number; spendable_zat: number };
  drip_zat: number;
  assets?: number;
  events?: number;
}

/** GET /v1/zsa/assets */
export interface ZsaAsset {
  asset_id: string;
  /** Only known for tokens whose description reached the service (names aren't on chain). */
  name: string | null;
  issuer: string;
  issued: number;
  finalized: boolean;
  burned?: number | null;
  first_height: number;
  last_height: number;
  txs: number;
}

/** GET /v1/zsa/events */
export interface ZsaEvent {
  height: number;
  time: string | null;
  txid: string;
  kind: "issue" | "finalize" | "burn" | "transfer";
  asset_id: string | null;
  name: string | null;
  amount: number | null;
}

async function json<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${ZSA_API}${path}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export const Zsa = {
  info: () => json<ZsaInfo>("/v1/zsa/info"),
  assets: () => json<ZsaAsset[]>("/v1/zsa/assets"),
  events: (limit = 40) => json<ZsaEvent[]>(`/v1/zsa/events?limit=${limit}`),
};

/** A token's colour, the same everywhere in the city (from its asset id). */
export function assetColor(id: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(id.length, 16); i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 78% 58%)`;
}

/** A token's name, or a short form of its id when its name never reached us. */
export const assetName = (a: { name: string | null; asset_id: string }) => a.name?.trim() || `Token ${a.asset_id.slice(0, 6)}`;

/** Token amounts are whole units (ZSA has no decimals): 1,250,000. */
export const units = (n: number | null | undefined) => (n == null ? "private" : n.toLocaleString("en-US"));
