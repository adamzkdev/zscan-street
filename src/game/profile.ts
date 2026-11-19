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
  /** ZK PARTY (src/party): experience, the counters, the day's missions, the last free refill. */
  xp: number;
  party: PartyStats;
  missions: { day: string; list: { id: string; n: number; claimed: boolean }[] };
  refillAt: number;
  /** The zkSNARK this visitor plays as (the one the city gave them: localStorage "street.avatar"). */
  avatar: number;
  /** The name others see online (ZK PARTY's rooms): drawn once ("Snark#4071"), then the visitor's own. */
  nick: string;
}

/** A name to start with online, until the visitor picks one. */
export const randomNick = () => `Snark#${1000 + Math.floor(Math.random() * 9000)}`;

export interface PartyStats {
  /** Board games played and won (first place). */
  played: number;
  wins: number;
  /** Quick matches played and won, and the current run of quick wins. */
  quick: number;
  quickWins: number;
  run: number;
  /** Mini-games played and won, anywhere. */
  minis: number;
  miniWins: number;
  /** The biggest single payout (ⓩ). */
  best: number;
  /** Per mini-game: the best place reached (0 = first). */
  places: Record<string, number>;
}

/** The visitor's zkSNARK: the one the city's presence gave them (scene/visitors.ts), drawn once. */
function streetAvatar() {
  try {
    let a = Number(localStorage.getItem("street.avatar")) || 0;
    if (!a) {
      a = 1 + Math.floor(Math.random() * 10000);
      localStorage.setItem("street.avatar", String(a));
    }
    return a;
  } catch {
    return 1 + Math.floor(Math.random() * 10000);
  }
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
  xp: 0,
  party: { played: 0, wins: 0, quick: 0, quickWins: 0, run: 0, minis: 0, miniWins: 0, best: 0, places: {} },
  missions: { day: "", list: [] },
  refillAt: 0,
  avatar: streetAvatar(),
  nick: randomNick(),
});

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      const f = fresh();
      const out: Profile = {
        ...f,
        ...p,
        stats: { ...f.stats, ...(p.stats ?? {}) },
        cases: p.cases ?? {},
        eggs: p.eggs ?? {},
        party: { ...f.party, ...(p.party ?? {}), places: p.party?.places ?? {} },
        missions: p.missions?.list ? p.missions : f.missions,
        nick: typeof p.nick === "string" && p.nick ? p.nick : f.nick,
        // (always the city's zkSNARK: the street and the party show the same one; a face picked
        // online is written there too, party/online.ts)
        avatar: f.avatar,
      };
      // (a profile from before ZK PARTY: its drawn name kept at once, the same on the next visit)
      if (out.nick !== p.nick)
        try {
          localStorage.setItem(KEY, JSON.stringify(out));
        } catch {}
      return out;
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
