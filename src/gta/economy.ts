import { profile } from "../game/profile";

/**
 * The game's economy (src/gta): ONE ⓩ balance and what you own. ⓩ are the street's play money (not
 * ZEC): the same purse as the city's other games (game/profile.ts `p.z`, saved in this browser), so
 * whatever pays or spends ⓩ anywhere shows here at once. Earned in the missions (missions.ts), spent
 * in the STORE (the front end), bought with ZEC at GET ⓩ.
 *
 * What you own is kept here too, by category ("vehicle": paint, neon, rims, the bike, the horn —
 * store.ts; "home": furniture; "snark": zkSNARKs; any other key a module needs), in localStorage
 * `zstreet.economy`.
 *
 *   Economy.balance()                     your ⓩ
 *   Economy.earn(120, "block run")        credit (missions, rewards, a ZEC purchase)
 *   Economy.spend(250, "paint · red")     debit; false (nothing changes) if you can't afford it
 *   Economy.buy({ cat, id, name, price }) spend + own in one step; true if owned already
 *   Economy.grant(cat, id)                own without paying (a gift, a ZEC purchase of an item)
 *   Economy.owns(cat, id) / owned(cat)
 *   Economy.onChange((e) => …)            every earn, spend, buy, grant (returns the unsubscribe)
 *
 * The STORE's tabs: a module that has a tab in it (zilk.ts: ZKSNARKS on Zilk Road, home.ts: HOME,
 * zecshop.ts: GET ⓩ) exports `storeTab: StoreTab`; the front end finds it (frontend.ts, through
 * Vite's import.meta.glob, so the store builds before the module exists) and mounts it in the tab.
 */

export type OwnCat = "vehicle" | "home" | "snark" | (string & {});

export interface Item {
  cat: OwnCat;
  id: string;
  name: string;
  /** ⓩ */
  price: number;
}

export interface EconomyEvent {
  kind: "earn" | "spend" | "buy" | "grant";
  /** ⓩ in (earn) or out (spend, buy); 0 for a grant. */
  amount: number;
  why: string;
  cat?: OwnCat;
  id?: string;
  /** The balance after. */
  balance: number;
}

/** The context the STORE gives a tab it mounts. */
export interface StoreTabContext {
  economy: typeof Economy;
  /** The front end's root (for a sheet over it, like the wallet's). */
  root: HTMLElement;
  /** Play now (as zkSNARK `id`, else the one chosen). */
  play(id?: number): void;
  /** Choose the zkSNARK you play as (e.g. one just bought). */
  choose(id: number): void;
  /** A line under the store's bar ("Bought.", "Not enough ⓩ."). */
  say(text: string): void;
}

/**
 * A tab of the STORE provided by another module. `mount` fills `el` (the store's shelf area: use
 * the hub's classes — .gf-tile, .gf-btn / .gf-btn.gold, .gf-plate, .gf-price, .gf-tag — for its look)
 * and returns a cleanup called when the tab is left or the store closed.
 */
export interface StoreTab {
  key: "zksnarks" | "home" | "getz";
  mount(el: HTMLElement, ctx: StoreTabContext): void | (() => void);
  /** ←/→/Enter while the tab is up (true: handled). */
  onKey?(e: KeyboardEvent): boolean;
}

const KEY = "zstreet.economy";

function load(): Record<string, string[]> {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, string[]> | null;
    if (o && typeof o === "object") return o;
  } catch {}
  return {};
}
let owned = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(owned));
  } catch {}
}

const listeners = new Set<(e: EconomyEvent) => void>();
/** (while the economy itself pays: the profile's own echo of it is not told twice) */
let inside = false;
const pay = (n: number, why: string) => {
  inside = true;
  try {
    return profile.pay(n, why);
  } finally {
    inside = false;
  }
};
const emit = (e: Omit<EconomyEvent, "balance">) => {
  const full = { ...e, balance: Economy.balance() };
  for (const f of listeners) f(full);
};

export const Economy = {
  balance(): number {
    return Math.max(0, Math.floor(profile.p.z ?? 0));
  },
  earn(amount: number, why: string) {
    const n = Math.round(amount);
    if (!(n > 0)) return;
    pay(n, why);
    emit({ kind: "earn", amount: n, why });
  },
  spend(amount: number, why: string): boolean {
    const n = Math.round(amount);
    if (n < 0) return false;
    if (n > 0 && !pay(-n, why)) return false;
    emit({ kind: "spend", amount: n, why });
    return true;
  },
  buy(item: Item): boolean {
    if (this.owns(item.cat, item.id)) return true;
    const n = Math.round(item.price);
    if (n > 0 && !pay(-n, `${item.cat} · ${item.name}`)) return false;
    (owned[item.cat] ??= []).push(item.id);
    save();
    emit({ kind: "buy", amount: n, why: item.name, cat: item.cat, id: item.id });
    return true;
  },
  grant(cat: OwnCat, id: string, why = "") {
    if (this.owns(cat, id)) return;
    (owned[cat] ??= []).push(id);
    save();
    emit({ kind: "grant", amount: 0, why, cat, id });
  },
  owns(cat: OwnCat, id: string): boolean {
    return owned[cat]?.includes(id) ?? false;
  },
  owned(cat: OwnCat): string[] {
    return [...(owned[cat] ?? [])];
  },
  onChange(f: (e: EconomyEvent) => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

// (ⓩ paid or spent anywhere else in the city — ZK PARTY, the casino — tell the listeners too)
profile.subscribe((_p, delta, why) => {
  if (delta && !inside) for (const f of listeners) f({ kind: delta > 0 ? "earn" : "spend", amount: Math.abs(delta), why, balance: Economy.balance() });
});
