/**
 * The visitor's game profile, kept in this browser only: play money (ⓩ, not ZEC), the daily
 * streak, a faction, solved cases and a few counters. Every read and write survives a blocked
 * storage (private windows): the game then simply forgets on reload.
 */

export type Faction = "shielded" | "transparent";

export interface Profile {
  /** Play money. */
  z: number;
  /** Days in a row with a visit, and the last one (UTC, YYYY-MM-DD). */
  streak: number;
  lastDay: string;
  faction: Faction | null;
  /** Case id → when it was solved (ms). */
  cases: Record<string, number>;
  stats: { bets: number; won: number; whales: number; jobs: number; eggs: number };
  /** Easter eggs found (rule key → height). */
  eggs: Record<string, number>;
  /** An adopted street cat. */
  cat: { id: number; name: string } | null;
}

const KEY = "street.profile";
const START = 100;
const DAILY = 50;

const fresh = (): Profile => ({
  z: START,
  streak: 0,
  lastDay: "",
  faction: null,
  cases: {},
  stats: { bets: 0, won: 0, whales: 0, jobs: 0, eggs: 0 },
  eggs: {},
  cat: null,
});

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      const f = fresh();
      return { ...f, ...p, stats: { ...f.stats, ...(p.stats ?? {}) }, cases: p.cases ?? {}, eggs: p.eggs ?? {} };
    }
  } catch {}
  return fresh();
}

type Listener = (p: Profile, delta: number, why: string) => void;

class Store {
  p: Profile = load();
  private fns: Listener[] = [];

  subscribe(fn: Listener) {
    this.fns.push(fn);
    fn(this.p, 0, "");
  }

  private save(delta = 0, why = "") {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.p));
    } catch {}
    for (const fn of this.fns) fn(this.p, delta, why);
  }

  /** Add (or with a negative amount, spend) play money. False when there isn't enough. */
  pay(amount: number, why: string) {
    if (amount < 0 && this.p.z + amount < 0) return false;
    this.p.z = Math.round(this.p.z + amount);
    this.save(amount, why);
    return true;
  }

  update(fn: (p: Profile) => void) {
    fn(this.p);
    this.save();
  }

  /** The daily visit: +50 ⓩ and a longer streak (it starts over after a missed day). */
  checkIn() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.p.lastDay === today) return 0;
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    this.p.streak = this.p.lastDay === yesterday ? this.p.streak + 1 : 1;
    this.p.lastDay = today;
    const bonus = DAILY + Math.min(6, this.p.streak - 1) * 10;
    this.pay(bonus, `day ${this.p.streak}`);
    return bonus;
  }

  reset() {
    this.p = fresh();
    this.save();
  }
}

export const profile = new Store();
