import { get } from "./zscan";

/**
 * HashSmash (yukon.org/hashsmash, Eigen Labs with Shielded Labs, Zcash, Project Eleven and the
 * Ethereum Foundation): the open challenge to find collisions in reduced-round SHA-256, SHA3-256,
 * BLAKE3 and Orchard's Poseidon. Yukon's API sends no CORS header: ours reads it every two minutes
 * (`GET /v1/hashsmash`). The university's HashSmash Hall asks it every 30 s while you stand in it;
 * the last answer is kept in localStorage, so what changed while you were away is news on return.
 */

export type HsStatus = "review" | "accepted" | "rejected" | "failed" | "cancelled" | string;

export interface HsPoint {
  id: string;
  family: string;
  rounds: number | null;
  /** log2 of the attack's cost, in compressions of the target. */
  time: number | null;
  memory: number | null;
  status: HsStatus;
  promoted: boolean;
  solver: string;
  avatar: string | null;
  profile: string | null;
  at: string;
  updated: string;
}

export interface HsLane {
  track: string;
  rounds: number | null;
  open: boolean;
  pareto: boolean;
  submissions: number;
  best: number | null;
}

export interface HsFamily {
  id: string;
  label: string;
  full: number;
  note: string;
  zcash: boolean;
  submissions: number;
  review: number;
  accepted: number;
  rejected: number;
  /** The most rounds an attack on the frontier reaches. */
  deepest: number | null;
  /** Attacks no other beats (in review or accepted), and the accepted ones only. */
  frontier: HsPoint[];
  published: HsPoint[];
  lanes: HsLane[];
  points: HsPoint[];
}

export interface HsSolver {
  solver: string;
  avatar: string | null;
  profile: string | null;
  submissions: number;
  review: number;
  accepted: number;
  families: string[];
  best: { family: string; label: string; rounds: number; full: number; time: number; depth: number } | null;
}

export interface HashSmash {
  updated: string | null;
  source: string;
  families: HsFamily[];
  latest: HsPoint[];
  solvers: HsSolver[];
}

export const HS_SITE = "https://www.yukon.org/hashsmash";
const KEY = "street.hashsmash";

let now: HashSmash | null = null;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) now = JSON.parse(raw) as HashSmash;
} catch {}

const listeners: ((d: HashSmash, fresh: HsPoint[]) => void)[] = [];
export const onHashSmash = (fn: (d: HashSmash, fresh: HsPoint[]) => void) => listeners.push(fn);
export const hashSmashNow = () => now;

const keyOf = (p: HsPoint) => `${p.id}:${p.status}`;
const allPoints = (d: HashSmash) => d.families.flatMap((f) => f.points);

let busy = false;
/**
 * Reads the API; listeners get the snapshot and what is new since the last one (submissions not
 * seen before, or whose status moved), oldest first.
 */
export async function hashSmash(): Promise<HashSmash | null> {
  if (busy) return now;
  busy = true;
  try {
    const d = await get<HashSmash>("/v1/hashsmash");
    if (!d?.families?.length) return now;
    const before = now ? new Set(allPoints(now).map(keyOf)) : null;
    const fresh = before ? allPoints(d).filter((p) => !before.has(keyOf(p))).sort((a, b) => a.updated.localeCompare(b.updated)) : [];
    now = d;
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {}
    for (const fn of listeners) fn(d, fresh);
    return d;
  } finally {
    busy = false;
  }
}

/** "2^71.0", the cost as HashSmash writes it. */
export const pow2 = (t: number | null) => (t == null ? "—" : `2^${t.toFixed(t >= 100 ? 1 : 2).replace(/\.?0+$/, "")}`);

export const STATUS: Record<string, { label: string; color: string }> = {
  review: { label: "in review", color: "#f0b429" },
  accepted: { label: "accepted", color: "#5fd38d" },
  rejected: { label: "rejected", color: "#b0584f" },
  failed: { label: "failed", color: "#8a6d66" },
  cancelled: { label: "cancelled", color: "#6f6a63" },
};
export const statusOf = (s: string) => STATUS[s] ?? { label: s, color: "#9a948a" };

/** What the hall's professor says about a submission that just moved (a bubble holds ~110 characters). */
export function announce(p: HsPoint, label: string): string {
  const what = p.rounds != null ? `${label}, ${p.rounds} rounds` : label;
  const cost = p.time != null ? ` at ${pow2(p.time)}` : "";
  switch (p.status) {
    case "accepted":
      return `Accepted! ${p.solver} broke ${what}${cost}. New frontier.`;
    case "review":
      return `${p.solver} just attacked ${what}${cost}. In review.`;
    case "rejected":
      return `${p.solver}'s attack on ${label}: rejected.`;
    case "failed":
      return `${p.solver}'s attack on ${label} failed the checks.`;
    default:
      return `${p.solver}: new move on ${label} (${statusOf(p.status).label}).`;
  }
}

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
