/**
 * ZK LEGENDS' Arena (Hearthstone's draft): pay in, pick one of three pools, then build a deck one
 * pick at a time (three cards offered, all of one rarity: mostly common, now and then rare, epic,
 * and once in a long while legendary — zkSNARKs and the Classics alike), and play duels with it until
 * 12 wins or 3 losses. The further you go, the bigger the prize (gold, packs, zats). The run lives in
 * this browser (localStorage "street.legends.arena"); the duel tells it each result (ui.ts).
 */
import { CARDS, card, DECK_SIZE, type Rarity } from "./engine";
import { COLLECTIBLE, FACTIONS } from "./cards";
import type { Pool } from "./decks";
import { snarksOf, snarkCardId, snarksReady, ensureCards, isSnarkCard } from "./snarkcards";
import * as P from "./progress";

export const ARENA_PRICE = 150;
export const ARENA_WINS = 12;
export const ARENA_LOSSES = 3;

export interface ArenaRun {
  /** The three pools offered, then the one taken. */
  heroes: Pool[];
  pool: Pool | null;
  deck: string[];
  /** The three cards on offer now (null: none, the deck is full). */
  offer: string[] | null;
  wins: number;
  losses: number;
  done: boolean;
  /** What the run paid out, once over. */
  prize?: string[];
}

const KEY = "street.legends.arena";
const RUNS = "street.legends.arena.runs";

export function arenaLoad(): ArenaRun | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const r = raw ? (JSON.parse(raw) as ArenaRun) : null;
    if (r) ensureCards([...r.deck, ...(r.offer ?? [])]);
    return r;
  } catch {
    return null;
  }
}
function save(r: ArenaRun | null) {
  try {
    if (r) globalThis.localStorage?.setItem(KEY, JSON.stringify(r));
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
/** Runs started in this browser (the first one is on the house). */
export function arenaRuns(): number {
  try {
    return Number(globalThis.localStorage?.getItem(RUNS) ?? 0) || 0;
  } catch {
    return 0;
  }
}
export const arenaFree = () => arenaRuns() === 0;

/** Pay in and get three pools to choose from (false: not enough gold). */
export function arenaStart(): ArenaRun | null {
  if (!arenaFree() && !P.spendGold(ARENA_PRICE)) return null;
  try {
    globalThis.localStorage?.setItem(RUNS, String(arenaRuns() + 1));
  } catch {
    /* private mode */
  }
  const pools = FACTIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  const r: ArenaRun = { heroes: pools, pool: null, deck: [], offer: null, wins: 0, losses: 0, done: false };
  save(r);
  return r;
}

export function arenaPickPool(r: ArenaRun, pool: Pool) {
  r.pool = pool;
  r.offer = offer(r);
  save(r);
}

/** Take card i of the offer; the next three come (null when the deck is complete). */
export function arenaPick(r: ArenaRun, i: number) {
  if (!r.offer || !r.offer[i]) return;
  r.deck.push(r.offer[i]);
  r.offer = r.deck.length >= DECK_SIZE ? null : offer(r);
  save(r);
}

/** The deck is built and the run still on. */
export const arenaReady = (r: ArenaRun | null) => !!r && !r.done && !!r.pool && r.deck.length >= DECK_SIZE;

function roll(): Rarity {
  const x = Math.random();
  return x < 0.015 ? "legendary" : x < 0.08 ? "epic" : x < 0.3 ? "rare" : "common";
}

/** Three different cards of one rarity for this pool (zkSNARKs and Classics), none it can't hold. */
function offer(r: ArenaRun): string[] {
  const pool = r.pool!;
  const tier = roll();
  const classics = COLLECTIBLE.filter((d) => (d.faction === pool || d.faction === "neutral") && (d.rarity === tier || (tier === "common" && d.rarity === "basic"))).map((d) => d.id);
  const snarks = snarksReady() ? snarksOf(tier, pool).map(snarkCardId) : [];
  const out: string[] = [];
  for (let t = 0; t < 200 && out.length < 3; t++) {
    // about one in three from the Classics, the rest zkSNARKs
    const from = !snarks.length || (classics.length && Math.random() < 0.33) ? classics : snarks;
    const id = from[Math.floor(Math.random() * from.length)];
    if (!id || out.includes(id)) continue;
    if (isSnarkCard(id) && r.deck.includes(id)) continue;
    if (!isSnarkCard(id) && card(id).rarity === "legendary" && r.deck.includes(id)) continue;
    out.push(id);
  }
  ensureCards(out);
  return out;
}

/** A duel of the run ended: count it; at 12 wins or 3 losses the run is over and pays out. */
export function arenaResult(won: boolean): { lines: string[]; over: boolean } {
  const r = arenaLoad();
  if (!r || !arenaReady(r)) return { lines: [], over: false };
  if (won) r.wins++;
  else r.losses++;
  const lines = [`Arena: ${r.wins} win${r.wins === 1 ? "" : "s"}, ${r.losses} loss${r.losses === 1 ? "" : "es"}`];
  const over = r.wins >= ARENA_WINS || r.losses >= ARENA_LOSSES;
  if (over) {
    r.done = true;
    r.prize = payOut(r.wins);
    lines.push(...r.prize);
  }
  save(r);
  return { lines, over };
}

/** Leave the run now (it pays what the wins so far are worth). */
export function arenaRetire() {
  const r = arenaLoad();
  if (!r || r.done) return;
  r.done = true;
  r.prize = r.pool && r.deck.length >= DECK_SIZE ? payOut(r.wins) : [];
  save(r);
}
export function arenaClear() {
  save(null);
}

/** Hearthstone's ladder, roughly: more gold, packs and zats the more you win. */
function payOut(wins: number): string[] {
  const gold = 25 + wins * 22 + (wins >= 7 ? 60 : 0) + (wins >= 12 ? 150 : 0);
  const packs = 1 + (wins >= 5 ? 1 : 0) + (wins >= 9 ? 1 : 0) + (wins >= 12 ? 1 : 0);
  const zats = wins >= 3 ? wins * 10 : 0;
  P.grant({ gold, packs, zats });
  return [`Arena prize: +${gold} gold`, `${packs} pack${packs > 1 ? "s" : ""}`, ...(zats ? [`+${zats} zats`] : [])];
}

/** (the deck as cards, for lists) */
export const arenaCards = (r: ArenaRun) => r.deck.filter((id) => CARDS.has(id));
