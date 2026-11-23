/**
 * ZK LEGENDS' decks: a starter for each faction (30 cards, tuned on the bench), the rules a deck must
 * keep (30 cards, one faction and the neutrals, two of a card, one of a legendary) and the visitor's
 * own decks in this browser.
 */
import { CARDS, DECK_SIZE, card, type Faction } from "./engine";
import { COLLECTIBLE } from "./cards";

export type Pool = Exclude<Faction, "neutral">;

const x = (n: number, id: string) => Array.from({ length: n }, () => id);

export const STARTERS: Record<Pool, string[]> = {
  transparent: [
    ...x(2, "t_hotkey"), ...x(2, "t_pickaxe"), ...x(2, "t_expose"), ...x(1, "t_reward"),
    ...x(2, "t_pick"), ...x(2, "t_poolop"), ...x(2, "n_relay"), ...x(1, "t_frontrun"), ...x(2, "n_hound"),
    ...x(2, "t_crew"), ...x(2, "t_raider"), ...x(2, "t_exploit"), ...x(1, "t_hammer"),
    ...x(1, "t_boss"), ...x(2, "t_dumper"), ...x(1, "t_storm"),
    ...x(1, "t_leaker"), ...x(1, "n_liquidator"), ...x(1, "t_kingpin"),
  ],
  sapling: [
    ...x(2, "s_germ"), ...x(1, "s_root"), ...x(1, "s_rain"), ...x(1, "n_light"),
    ...x(2, "s_warden"), ...x(1, "s_hedge"), ...x(2, "s_thorns"), ...x(2, "n_runner"),
    ...x(2, "s_oak"), ...x(2, "s_pollen"), ...x(2, "s_swarm"), ...x(1, "s_bloom"),
    ...x(2, "s_gardener"), ...x(1, "s_vault"), ...x(1, "s_spirit"), ...x(1, "n_hw"),
    ...x(2, "s_overgrowth"), ...x(1, "s_mother"), ...x(1, "s_elder"), ...x(1, "s_canopy"), ...x(1, "n_sandwich"),
  ],
  sprout: [
    ...x(2, "p_note"), ...x(1, "p_spend"),
    ...x(2, "n_rat"), ...x(2, "p_drain"), ...x(2, "p_shade_m"), ...x(2, "p_depr"),
    ...x(2, "p_soul"), ...x(1, "p_eater"), ...x(1, "p_exhume"),
    ...x(1, "p_keeper"), ...x(2, "p_revenant"), ...x(2, "p_purge"), ...x(1, "p_banker"),
    ...x(2, "p_crypt"), ...x(2, "p_final"), ...x(1, "p_shift"), ...x(1, "n_whale"), ...x(1, "n_archive"),
    ...x(1, "p_lich"), ...x(1, "n_apparition"),
  ],
  orchard: [
    ...x(2, "o_wyrm"), ...x(1, "o_prove"), ...x(1, "o_shield"),
    ...x(2, "o_frost"), ...x(2, "o_spark"), ...x(1, "n_cold"), ...x(1, "o_snare"), ...x(1, "o_trap"), ...x(1, "o_ward"),
    ...x(1, "o_counter"), ...x(2, "o_recursion"), ...x(1, "o_archivist"), ...x(1, "o_timelock"), ...x(1, "n_turnstile"), ...x(2, "n_validator"),
    ...x(2, "o_pallas"), ...x(1, "n_notary"),
    ...x(2, "o_sentinel"), ...x(1, "n_prover"),
    ...x(1, "o_pool"), ...x(2, "o_storm"), ...x(1, "o_recursor"),
  ],
};

export const STARTER_NAMES: Record<Pool, [string, string]> = {
  transparent: ["Open Ledger", "公开账本"],
  sapling: ["Green Pool", "绿色之池"],
  sprout: ["Old Pool", "旧池"],
  orchard: ["Shielded Set", "屏蔽套牌"],
};

/** How many of a card a deck may hold. */
export const maxCopies = (id: string) => (/^z\d+$/.test(id) || card(id).rarity === "legendary" ? 1 : 2);

/** What's wrong with a deck (null: it's fine). */
export function deckProblem(cards: string[], pool: Pool): string | null {
  if (cards.length !== DECK_SIZE) return `${cards.length}/${DECK_SIZE} cards`;
  const n = new Map<string, number>();
  for (const id of cards) {
    const d = CARDS.get(id);
    if (!d || d.token) return `unknown card ${id}`;
    if (d.faction !== "neutral" && d.faction !== pool) return `${d.name} is not ${pool}`;
    n.set(id, (n.get(id) ?? 0) + 1);
    if (n.get(id)! > maxCopies(id)) return `too many ${d.name}`;
  }
  return null;
}

/** The cards a deck of this pool may use, by cost then name. */
export const poolCards = (pool: Pool) =>
  COLLECTIBLE.filter((d) => d.faction === pool || d.faction === "neutral").sort((a, b) => a.cost - b.cost || (a.faction === "neutral" ? 1 : 0) - (b.faction === "neutral" ? 1 : 0) || a.name.localeCompare(b.name));

// ---- the visitor's decks ---------------------------------------------------------------------------------

export interface SavedDeck {
  id: string;
  name: string;
  pool: Pool;
  cards: string[];
}
const KEY = "street.legends.decks";
export function loadDecks(): SavedDeck[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedDeck[]) : [];
    // (cards that no longer exist are dropped)
    return list.map((d) => ({ ...d, cards: d.cards.filter((id) => CARDS.has(id) && !CARDS.get(id)!.token) }));
  } catch {
    return [];
  }
}
export function saveDecks(list: SavedDeck[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: the decks live for this visit */
  }
}
