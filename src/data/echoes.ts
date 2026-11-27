import { API, get, redrawn } from "./zscan";

/**
 * zkSNARKs' Experiment_002, the ECHOES (Zilk Road, via api.zscan.cash/v1/collections/zksnarks/echoes):
 * 26 Echoes imagined by FedosArt. 20 through the public purge (a holder burns 13 zkSNARKs and
 * receives one Echo at random), 6 through the Signals draw (holders at Mark II with Chroma Gold). An
 * Echo is a treasury zkSNARK re-drawn after one of his paintings, its inspiration.
 *
 * One feed for the whole city: the Louvre's floor 7, the Memorial, the drone show, the Needle's LED
 * screen and the inbox all read it. It polls while Echoes are still hidden.
 */

export interface Trait {
  trait_type: string;
  value: string;
}
export interface EchoPurged {
  item: number;
  rank: number | null;
}
export interface Echo {
  /** 1 … 26. */
  echo: number;
  item: number;
  name: string;
  traits: Trait[];
  unlockedAt: string | null;
  /** The painting it was drawn after. */
  inspiration: string;
  purged: EchoPurged[];
}
export interface EchoesState {
  total: number;
  public: number;
  draw: number;
  perPurge: number;
  open: boolean;
  /** Public Echoes claimed through the purge. */
  claimed: number;
  rule: { mark: string; days: number; chroma: string; traits: number; closeAt: string | null };
  supply: number | null;
  /** zkSNARKs purged in all (Apparitions and Echoes). */
  purgedTotal: number | null;
  /** Revealed, in the order they were revealed. */
  echoes: Echo[];
  hidden: number[];
}

interface Doc {
  total: number;
  public?: number;
  draw?: number;
  per_purge?: number;
  purge?: { open?: boolean; claimed?: number } | null;
  draw_rule?: { mark?: string; days?: number; chroma?: string; traits?: number; close_at?: string | null } | null;
  supply?: number | null;
  purged_total?: number | null;
  echoes: { echo: number; item: string; name: string; traits?: Trait[]; unlocked_at?: string | null; inspiration?: string | null; purged?: { item: string; rank: number | null }[] }[];
  hidden?: number[];
}

export const echoInspiration = (n: number) => `${API}/v1/collections/zksnarks/echoes/${n}/inspiration`;
export const echoLink = (n: number) => `https://zilkroad.com/echoes?echo=${n}`;
export const traitOf = (t: Trait[], type: string) => t.find((x) => x.trait_type === type)?.value ?? "";
/** Echo #n as two digits, the way the venue numbers its slots. */
export const echoNum = (n: number) => String(n).padStart(2, "0");

const SEEN = "zstreet.echoes.seen";
const POLL_OPEN = 60_000,
  POLL_DONE = 15 * 60_000;

function parse(d: Doc): EchoesState {
  const echoes = d.echoes
    .map((e) => ({
      echo: e.echo,
      item: Number(e.item),
      name: e.name,
      traits: e.traits ?? [],
      unlockedAt: e.unlocked_at ?? null,
      inspiration: e.inspiration ?? "",
      purged: (e.purged ?? []).map((p) => ({ item: Number(p.item), rank: p.rank })),
    }))
    .sort((a, b) => (a.unlockedAt ?? "").localeCompare(b.unlockedAt ?? "") || a.echo - b.echo);
  const r = d.draw_rule ?? {};
  return {
    total: d.total || 26,
    public: d.public ?? 20,
    draw: d.draw ?? 6,
    perPurge: d.per_purge ?? 13,
    open: !!d.purge?.open,
    claimed: d.purge?.claimed ?? echoes.length,
    rule: { mark: r.mark ?? "Mark II", days: r.days ?? 26, chroma: r.chroma ?? "Gold", traits: r.traits ?? 50, closeAt: r.close_at ?? null },
    supply: d.supply ?? null,
    purgedTotal: d.purged_total ?? null,
    echoes,
    hidden: d.hidden ?? [],
  };
}

type Listener = (fresh: Echo[], s: EchoesState) => void;

export class EchoesFeed {
  state: EchoesState | null = null;
  private known = new Set<number>();
  private listeners: Listener[] = [];
  private changed: ((s: EchoesState) => void)[] = [];
  private timer = 0;
  private first: Promise<EchoesState | null> | null = null;
  /** For the films: hide these Echoes until `reveal()` lets them through. */
  held = new Set<number>();

  /** The state once loaded (starts the polling). */
  ready() {
    if (!this.first) this.first = this.load(true).then(() => this.state);
    return this.first;
  }

  /** New Echoes revealed while the visitor is here (not the ones already out when they came). */
  onReveal(fn: Listener) {
    this.listeners.push(fn);
  }
  /** Any refresh that changed the numbers. */
  onChange(fn: (s: EchoesState) => void) {
    this.changed.push(fn);
    if (this.state) fn(this.state);
  }

  /** Echoes revealed since the visitor's last visit (their first look this time), once. */
  sinceLastVisit(): Echo[] {
    if (!this.state) return [];
    let seen: number[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(SEEN) ?? "[]");
    } catch {}
    const out = seen.length ? this.state.echoes.filter((e) => !seen.includes(e.echo)) : [];
    this.remember();
    return out;
  }

  byItem(id: number) {
    return this.state?.echoes.find((e) => e.item === id) ?? null;
  }
  /** The Echo a purged zkSNARK was burned for. */
  purgedFor(id: number) {
    return this.state?.echoes.find((e) => e.purged.some((p) => p.item === id)) ?? null;
  }

  /** Films: let a held Echo out now (as if just revealed). */
  reveal(n: number) {
    this.held.delete(n);
    void this.load(false);
  }

  private remember() {
    try {
      if (this.state) localStorage.setItem(SEEN, JSON.stringify(this.state.echoes.map((e) => e.echo)));
    } catch {}
  }

  private raw: Doc | null = null;

  private async load(first: boolean) {
    clearTimeout(this.timer);
    const d = (first || !this.raw || !this.held.size ? await get<Doc>("/v1/collections/zksnarks/echoes") : null) ?? this.raw;
    if (d?.echoes) {
      this.raw = d;
      const held = this.held;
      const s = parse(held.size ? { ...d, echoes: d.echoes.filter((e) => !held.has(e.echo)), hidden: [...(d.hidden ?? []), ...held].sort((a, b) => a - b), purge: d.purge ? { ...d.purge, claimed: Math.max(0, (d.purge.claimed ?? 0) - held.size) } : d.purge } : d);
      const fresh = first ? [] : s.echoes.filter((e) => !this.known.has(e.echo));
      const was = this.state;
      this.state = s;
      for (const e of s.echoes) redrawn.add(e.item);
      for (const e of s.echoes) this.known.add(e.echo);
      if (!was || was.echoes.length !== s.echoes.length || was.purgedTotal !== s.purgedTotal || was.claimed !== s.claimed) for (const fn of this.changed) fn(s);
      if (fresh.length) {
        for (const fn of this.listeners) fn(fresh, s);
        this.remember();
      }
    }
    const done = this.state && !this.state.hidden.length;
    this.timer = window.setTimeout(() => void this.load(false), document.hidden ? POLL_DONE : done ? POLL_DONE : POLL_OPEN);
  }
}

/** The city's one feed. */
export const echoesFeed = new EchoesFeed();
