import type { Block } from "../data/types";
import { ZScan } from "../data/zscan";
import type { Zone } from "../scene/city/plan";
import type { ChainClock } from "./clock";
import { profile, type Faction } from "./profile";
import type { GameHud } from "./ui";

export const ZONES: Zone[] = ["midtown", "parkside", "uptown", "west", "westres", "finance", "eastcom", "south", "southbank", "marina", "port"];
export const ZONE_NAME: Record<Zone, string> = {
  midtown: "Midtown",
  parkside: "Parkside",
  uptown: "Uptown",
  west: "West End",
  westres: "West Heights",
  finance: "Wall Street",
  eastcom: "East Market",
  south: "Southside",
  southbank: "South Bank",
  marina: "Marina",
  port: "The Port",
};

const SHIELDED = new Set(["shielded", "shielding", "migration"]);
const KEY = "street.factions";

/** Which quarter a transaction "happens" in: a hash of its id (every visitor agrees). */
function zoneOfTx(txid: string): Zone {
  let h = 0;
  for (let i = 0; i < 8; i++) h = (h * 31 + txid.charCodeAt(i)) >>> 0;
  return ZONES[h % ZONES.length];
}

export type Score = { sh: number; tr: number };

/**
 * Shielded vs Transparent, quarter by quarter. Every real transaction of the day lands in a
 * quarter (by its id) and scores for its side; visitors add to their own side's score by shielding
 * whales, solving cases and winning bets. A quarter belongs to whoever leads it. The score starts
 * over each day (UTC).
 */
export class Factions {
  readonly scores = new Map<Zone, Score>();
  private day = "";
  private seen = new Set<number>();
  private fns: (() => void)[] = [];

  constructor(
    clock: ChainClock,
    private hud: GameHud,
  ) {
    this.load();
    clock.onBlock((b) => this.block(b));
    hud.root.addEventListener("click", (e) => {
      const j = (e.target as HTMLElement).closest<HTMLElement>("[data-join]")?.dataset.join as Faction | undefined;
      if (!j) return;
      profile.update((p) => (p.faction = j));
      this.hud.say(`<b>WELCOME TO ${j.toUpperCase()}</b> · your whales, cases and bets now score for your side`);
    });
  }

  onChange(fn: () => void) {
    this.fns.push(fn);
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private load() {
    this.day = this.today();
    for (const z of ZONES) this.scores.set(z, { sh: 0, tr: 0 });
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { day: string; scores: [Zone, Score][]; seen: number[] } | null;
      if (s?.day === this.day) {
        for (const [z, v] of s.scores) this.scores.set(z, v);
        this.seen = new Set(s.seen);
      }
    } catch {}
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: this.day, scores: [...this.scores], seen: [...this.seen].slice(-400) }));
    } catch {}
    for (const fn of this.fns) fn();
  }

  /** Seed the day with the last blocks (only the first time today). */
  async seed(tip: number, n = 24) {
    if (this.seen.size) return;
    for (let h = tip - n + 1; h <= tip; h++) {
      const b = await ZScan.block(h);
      if (b) this.block(b, false);
    }
    this.save();
  }

  private block(b: Block, save = true) {
    if (this.today() !== this.day) this.load();
    if (this.seen.has(b.height)) return;
    // only today's blocks count
    if (new Date(b.time).toISOString().slice(0, 10) !== this.day) return;
    this.seen.add(b.height);
    for (const t of b.txs) {
      const s = this.scores.get(zoneOfTx(t.txid))!;
      if (SHIELDED.has(t.kind)) s.sh++;
      else s.tr++;
    }
    if (save) this.save();
  }

  /** A visitor's deed for their side (points into a quarter, or a random one). */
  deed(points: number, zone?: Zone) {
    const f = profile.p.faction;
    if (!f) return;
    const z = zone ?? ZONES[Math.floor(Math.random() * ZONES.length)];
    const s = this.scores.get(z)!;
    if (f === "shielded") s.sh += points;
    else s.tr += points;
    this.save();
  }

  owner(z: Zone): Faction | null {
    const s = this.scores.get(z)!;
    return s.sh === s.tr ? null : s.sh > s.tr ? "shielded" : "transparent";
  }

  held(f: Faction) {
    return ZONES.filter((z) => this.owner(z) === f).length;
  }
}
