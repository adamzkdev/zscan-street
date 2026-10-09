import { API, get } from "./zscan";
import { visitorToken } from "./token";

/**
 * ZStreet's wallet layer: pay ZStreet's shielded address from any wallet (scan the QR code, or
 * copy the address and the memo) and the memo plays in the city once the block is mined. The
 * API matches the `ZS1:<ref>` in the memo to the intent asked for here.
 */

export type PayAction = "mark" | "guestbook" | "vote" | "tip";

export interface PayInfo {
  enabled: boolean;
  address: string | null;
  tip_uri: string | null;
  min: Record<PayAction, string>;
  sponsor: string;
}

export interface Intent {
  ref: string;
  action: PayAction;
  address: string;
  amount: string;
  memo: string;
  uri: string;
  expires_at: string;
}

export interface PayStatus {
  ref: string;
  action: PayAction;
  min: string;
  state: "waiting" | "seen" | "confirmed" | "short" | "expired";
  txid: string | null;
  height: number | null;
  amount: string | null;
  mark: number | null;
}

export interface Mark {
  id: number;
  kind: "mark" | "guestbook";
  place: string;
  floor: number;
  x: number;
  y: number;
  z: number;
  text: string;
  txid: string;
  height: number;
  likes: number;
  created_at: string;
}

/** What the presence socket says when a payment plays. */
export interface PayEvent {
  type: "pay";
  action: PayAction;
  ref?: string;
  mark?: number;
  text?: string;
  place?: string;
  floor?: number;
  x?: number;
  y?: number;
  z?: number;
  name?: string | null;
  amount?: string;
  sponsor?: boolean;
  round?: number;
  idx?: number;
  height: number;
}

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (j as { message?: string }).message ?? `Error ${r.status}` };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, error: "The city's server can't be reached" };
  }
}

let info: Promise<PayInfo | null> | null = null;

export const StreetPay = {
  info: () => (info ??= get<PayInfo>("/v1/street/pay")),
  intent: (action: PayAction, o: { text?: string; place?: string; floor?: number; x?: number; y?: number; z?: number; round?: number; idx?: number } = {}) =>
    post<Intent>("/v1/street/pay/intent", { token: visitorToken(), action, ...o }),
  status: (ref: string) => get<PayStatus>(`/v1/street/pay/${ref}`),
  marks: () => get<Mark[]>("/v1/street/marks"),
  guestbook: () => get<Mark[]>("/v1/street/guestbook"),
  tips: () => get<{ recent: { name: string | null; amount: string; height: number; at: string }[]; sponsors: string[] }>("/v1/street/tips"),
  rate: (id: number, kind: "like" | "report") => post<{ ok: boolean }>(`/v1/street/marks/${id}/${kind}`, { token: visitorToken() }),
};

/** Refs this browser asked for (to mail you when yours lands), newest first. */
export const myRefs = {
  list(): string[] {
    try {
      return JSON.parse(localStorage.getItem("street.pay") ?? "[]") as string[];
    } catch {
      return [];
    }
  },
  add(ref: string) {
    try {
      localStorage.setItem("street.pay", JSON.stringify([ref, ...this.list().filter((r) => r !== ref)].slice(0, 30)));
    } catch {}
  },
  has(ref: string) {
    return this.list().includes(ref);
  },
};
