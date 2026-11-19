/**
 * The visitor's progress in the city's games, over the play-money profile (profile.ts): levels from
 * experience, the day's three missions, and the free refill for an empty purse. All of it stays
 * in this browser; ⓩ are play chips, never real ZEC.
 *
 * Anything in the city can report what happened (`progress.track("enter")`); the HUD and the party
 * hub listen for levels and missions done (`progress.on`).
 */
import { T } from "../i18n/lang";
import { profile } from "./profile";

/** Experience to go from `level` to the next one. */
export const needFor = (level: number) => 80 + 45 * (level - 1);

/** The level a total of experience reaches, and how far into the next one. */
export function levelOf(xp: number) {
  let level = 1;
  let left = xp;
  while (left >= needFor(level)) {
    left -= needFor(level);
    level++;
  }
  return { level, into: left, need: needFor(level), k: left / needFor(level) };
}

/** What a new level pays. */
export const levelPrize = (level: number) => 40 * level;

export type Track = "mini" | "miniWin" | "party" | "partyTop2" | "partyWin" | "quick" | "quickWin" | "enter" | "betWin" | "qblock";

interface MissionDef {
  id: string;
  on: Track;
  n: number;
  prize: number;
  en: string;
  zh: string;
}
const MISSIONS: MissionDef[] = [
  { id: "mini5", on: "mini", n: 5, prize: 60, en: "Play 5 mini-games", zh: "玩 5 局小游戏" },
  { id: "win3", on: "miniWin", n: 3, prize: 120, en: "Win 3 mini-games", zh: "赢 3 局小游戏" },
  { id: "party1", on: "party", n: 1, prize: 150, en: "Finish a ZK Party", zh: "打完一局 ZK 派对" },
  { id: "top2", on: "partyTop2", n: 1, prize: 200, en: "Finish top 2 in a ZK Party", zh: "ZK Party 进入前二" },
  { id: "quick2", on: "quickWin", n: 2, prize: 100, en: "Win 2 mini-games played for ⓩ", zh: "押 ⓩ 赢 2 局小游戏" },
  { id: "quick4", on: "quick", n: 4, prize: 70, en: "Play 4 mini-games for ⓩ", zh: "押 ⓩ 玩 4 局小游戏" },
  { id: "enter3", on: "enter", n: 3, prize: 50, en: "Walk into 3 buildings", zh: "走进 3 栋建筑" },
  { id: "bet1", on: "betWin", n: 1, prize: 80, en: "Win a side bet on yourself", zh: "押自己赢一次" },
  { id: "qblock2", on: "qblock", n: 2, prize: 90, en: "Buy 2 Z-Blocks on the board", zh: "在棋盘上买 2 个 Z 方块" },
];

const today = () => new Date().toISOString().slice(0, 10);

/** The day's three missions: drawn from the date, the same for everyone that day. */
function draw(day: string) {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const pool = MISSIONS.slice();
  const out: MissionDef[] = [];
  while (out.length < 3) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

export interface Mission extends MissionDef {
  /** Progress so far (capped at n). */
  at: number;
  claimed: boolean;
  title: string;
}

type Event = { kind: "level"; level: number; prize: number } | { kind: "mission"; m: Mission } | { kind: "xp"; xp: number };
type Listener = (e: Event) => void;

const REFILL = 150;
const REFILL_EVERY = 3 * 3600_000;
const REFILL_UNDER = 25;

class Progress {
  private fns: Listener[] = [];

  constructor() {
    // (a fresh profile's avatar and the day's missions are written down at once)
    this.missions();
  }

  on(fn: Listener) {
    this.fns.push(fn);
    return () => (this.fns = this.fns.filter((f) => f !== fn));
  }
  private emit(e: Event) {
    for (const f of this.fns) f(e);
  }

  get level() {
    return levelOf(profile.p.xp);
  }

  /** Experience: a level reached pays its prize. */
  gain(xp: number) {
    if (xp <= 0) return;
    const before = levelOf(profile.p.xp).level;
    profile.update((p) => (p.xp += Math.round(xp)));
    this.emit({ kind: "xp", xp });
    const after = levelOf(profile.p.xp).level;
    for (let l = before + 1; l <= after; l++) {
      const prize = levelPrize(l);
      profile.pay(prize, `level ${l}`);
      this.emit({ kind: "level", level: l, prize });
    }
  }

  /** Today's missions (drawn again on a new day). */
  missions(): Mission[] {
    const day = today();
    const defs = draw(day);
    if (profile.p.missions.day !== day) profile.update((p) => (p.missions = { day, list: defs.map((d) => ({ id: d.id, n: 0, claimed: false })) }));
    return defs.map((d) => {
      const s = profile.p.missions.list.find((x) => x.id === d.id) ?? { n: 0, claimed: false };
      return { ...d, at: Math.min(d.n, s.n), claimed: s.claimed, title: T(d.en, d.zh) };
    });
  }

  /** Something happened: the missions that count it move on (a finished one is announced once). */
  track(what: Track, n = 1) {
    const list = this.missions();
    for (const m of list) {
      if (m.on !== what || m.claimed || m.at >= m.n) continue;
      const was = m.at;
      profile.update((p) => {
        const s = p.missions.list.find((x) => x.id === m.id);
        if (s) s.n = Math.min(m.n, s.n + n);
      });
      if (was < m.n && was + n >= m.n) this.emit({ kind: "mission", m: { ...m, at: m.n } });
    }
  }

  /** Collect a finished mission's prize (and a little experience). */
  claim(id: string) {
    const m = this.missions().find((x) => x.id === id);
    if (!m || m.claimed || m.at < m.n) return 0;
    profile.update((p) => {
      const s = p.missions.list.find((x) => x.id === id);
      if (s) s.claimed = true;
    });
    profile.pay(m.prize, "mission");
    this.gain(30);
    return m.prize;
  }

  /** How many finished missions wait to be claimed. */
  get ready() {
    return this.missions().filter((m) => !m.claimed && m.at >= m.n).length;
  }

  /** The free refill: offered when the purse is nearly empty, once every three hours. */
  refill(): { can: boolean; inMs: number; amount: number } {
    const wait = Math.max(0, profile.p.refillAt + REFILL_EVERY - Date.now());
    return { can: profile.p.z < REFILL_UNDER && wait === 0, inMs: wait, amount: REFILL };
  }
  takeRefill() {
    if (!this.refill().can) return 0;
    profile.update((p) => (p.refillAt = Date.now()));
    profile.pay(REFILL, "refill");
    return REFILL;
  }
}

export const progress = new Progress();
