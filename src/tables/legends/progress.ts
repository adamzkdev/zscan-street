/**
 * ZK LEGENDS' collection, kept in this browser (localStorage "street.legends.collection"): how many
 * of each card you own, your gold (earned in duels, spent on packs), your zats (the crafting dust:
 * from duplicates and disenchanted cards, spent to craft the card you want) and your unopened packs.
 *
 * Two sets: the Classics (the hand-made cards, two of each, one of a legendary) and the 10,000
 * zkSNARKs (snarkcards.ts: one card each, "z<id>", their rarity and power from their rank).
 * You start with every card of the four starter decks (so they always play), every basic card, your
 * own zkSNARK's card, and three free packs. A pack is five cards, mostly zkSNARKs, at least one rare
 * or better, with odds close to Hearthstone's (a legendary about one pack in twenty, never more than
 * 30 packs without one, an epic one pack in four); a copy beyond what a deck can hold turns into zats
 * at once. Craft and disenchant at Hearthstone's prices, any card of either set.
 */
import { CARDS, card, type CardDef, type Rarity } from "./engine";
import { COLLECTIBLE } from "./cards";
import { STARTERS, maxCopies, loadDecks, type SavedDeck } from "./decks";
import { SNARKS, ensureCards, isSnarkCard, snarkCard, snarkCardId, snarkIdOf, snarksOf, snarksReady } from "./snarkcards";

const KEY = "street.legends.collection";

export interface Save {
  v: 1;
  owned: Record<string, number>;
  gold: number;
  zats: number;
  packs: number;
  /** Packs opened, and since the last legendary/epic (the pity counters). */
  opened: number;
  sinceLeg: number;
  sinceEpic: number;
  /** Cards new since you last looked at the collection. */
  fresh: Record<string, 1>;
  wins: number;
  played: number;
  /** Your own zkSNARK (its card is yours from the start, and stays). */
  mine?: number;
}

export const PACK_PRICE = 100;
export const CRAFT: Record<Rarity, number> = { basic: 0, common: 40, rare: 100, epic: 400, legendary: 1600 };
export const DISENCHANT: Record<Rarity, number> = { basic: 0, common: 5, rare: 20, epic: 100, legendary: 400 };

function fresh(): Save {
  const owned: Record<string, number> = {};
  for (const list of Object.values(STARTERS)) {
    const n = new Map<string, number>();
    for (const id of list) n.set(id, (n.get(id) ?? 0) + 1);
    for (const [id, k] of n) owned[id] = Math.max(owned[id] ?? 0, k);
  }
  for (const d of COLLECTIBLE) if (d.rarity === "basic") owned[d.id] = maxCopies(d.id);
  return { v: 1, owned, gold: 100, zats: 0, packs: 3, opened: 0, sinceLeg: 0, sinceEpic: 0, fresh: {}, wins: 0, played: 0 };
}

let mem: Save | null = null;
const listeners = new Set<() => void>();
/** Told whenever the collection changes. */
export function onProgress(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function load(): Save {
  if (mem) return mem;
  let s: Save | null = null;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) s = JSON.parse(raw) as Save;
  } catch {
    s = null;
  }
  const base = fresh();
  if (!s || s.v !== 1) s = base;
  else {
    s = { ...base, ...s, owned: { ...s.owned } };
    // (the starters always stay playable, even after a card was added to them)
    for (const [id, k] of Object.entries(base.owned)) s.owned[id] = Math.max(s.owned[id] ?? 0, k);
    // (a card that no longer exists goes; zkSNARK cards are made on demand, so they stay)
    for (const id of Object.keys(s.owned)) if (!isSnarkCard(id) && !CARDS.has(id)) delete s.owned[id];
  }
  mem = s;
  return s;
}
function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(mem));
  } catch {
    /* private mode: it lives for this visit */
  }
  for (const f of listeners) f();
}

export const owned = (id: string) => load().owned[id] ?? 0;

/** Your own zkSNARK's card: yours from the start (call once the zkSNARK data is loaded). */
export function grantMine(id: number) {
  if (!(id >= 1 && id <= SNARKS)) return;
  const s = load();
  const cid = snarkCardId(id);
  if (s.mine === id && s.owned[cid]) return;
  s.mine = id;
  if (!s.owned[cid]) {
    s.owned[cid] = 1;
    s.fresh[cid] = 1;
  }
  save();
}
export const mineId = () => load().mine ?? 0;

/** Your zkSNARK cards (ids), registered. */
export function ownedSnarks(): number[] {
  const out: number[] = [];
  for (const [id, n] of Object.entries(load().owned)) if (n > 0 && isSnarkCard(id)) out.push(snarkIdOf(id));
  return out.sort((a, b) => a - b);
}

/** Your saved decks, with their zkSNARK cards registered first (loadDecks drops cards it doesn't know). */
export function allDecks(): SavedDeck[] {
  try {
    const raw = globalThis.localStorage?.getItem("street.legends.decks");
    const list = raw ? (JSON.parse(raw) as SavedDeck[]) : [];
    if (snarksReady()) ensureCards(list.flatMap((d) => d.cards ?? []).filter(isSnarkCard));
  } catch {
    /* (a broken save: loadDecks copes) */
  }
  return loadDecks();
}
export const isStarterCard = (id: string) => Object.values(STARTERS).some((l) => l.includes(id));

/** How complete the collection is: the Classics (copies) and the zkSNARKs (cards). */
export function completion() {
  const s = load();
  let have = 0,
    total = 0;
  for (const d of COLLECTIBLE) {
    const m = maxCopies(d.id);
    total += m;
    have += Math.min(m, s.owned[d.id] ?? 0);
  }
  let snarks = 0;
  for (const [id, n] of Object.entries(s.owned)) if (n > 0 && isSnarkCard(id)) snarks++;
  return { have, total, snarks, snarkTotal: SNARKS };
}

// ---- packs ---------------------------------------------------------------------------------------------

const POOL = () => COLLECTIBLE.filter((d) => d.rarity !== "basic");

function roll(r: () => number, sinceLeg: number, sinceEpic: number, needRare: boolean): Rarity {
  const x = r();
  // a legendary guaranteed by the 30th pack, an epic by the 10th
  if (sinceLeg >= 29) return "legendary";
  if (sinceEpic >= 9) return "epic";
  if (x < 0.011) return "legendary";
  if (x < 0.055) return "epic";
  if (x < 0.283 || needRare) return "rare";
  return "common";
}

export interface Pulled {
  id: string;
  /** It went beyond what a deck can hold: these zats instead (the card is still shown). */
  zats: number;
  isNew: boolean;
}

/** Open one pack (false: none to open). Returns the five cards, in order. */
export function openPack(): Pulled[] | null {
  const s = load();
  if (s.packs <= 0) return null;
  s.packs--;
  s.opened++;
  const r = Math.random;
  const pool = POOL();
  const by = (rar: Rarity) => pool.filter((d) => d.rarity === rar);
  const out: Pulled[] = [];
  let gotLeg = false,
    gotEpic = false,
    gotRare = false;
  for (let i = 0; i < 5; i++) {
    const needRare = i === 4 && !gotRare;
    let rar = roll(r, gotLeg ? 0 : s.sinceLeg, gotEpic ? 0 : s.sinceEpic, needRare);
    if (gotLeg && rar === "legendary") rar = "epic";
    if (rar === "legendary") gotLeg = true;
    if (rar === "epic" || rar === "legendary") gotEpic = true;
    if (rar !== "common") gotRare = true;
    let d: CardDef;
    // most slots are zkSNARKs (once their data is in), the rest Classics
    if (snarksReady() && r() < 0.78) {
      const ids = snarksOf(rar);
      let id = ids[Math.floor(r() * ids.length)];
      // (one you don't have, if a few tries find one)
      for (let k = 0; k < 6 && s.owned[snarkCardId(id)]; k++) id = ids[Math.floor(r() * ids.length)];
      d = snarkCard(id);
    } else {
      // duplicate protection: a card you can still use first, then anything of that rarity
      const all = by(rar);
      const missing = all.filter((c) => (s.owned[c.id] ?? 0) < maxCopies(c.id));
      const list = missing.length ? missing : all;
      d = list[Math.floor(r() * list.length)];
    }
    const have = s.owned[d.id] ?? 0;
    let z = 0;
    if (have >= maxCopies(d.id)) {
      z = DISENCHANT[d.rarity];
      s.zats += z;
    } else {
      s.owned[d.id] = have + 1;
      if (!have) s.fresh[d.id] = 1;
    }
    out.push({ id: d.id, zats: z, isNew: !have });
  }
  s.sinceLeg = gotLeg ? 0 : s.sinceLeg + 1;
  s.sinceEpic = gotEpic ? 0 : s.sinceEpic + 1;
  // rarest last, the way packs are revealed
  const rank: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
  out.sort((a, b) => rank[card(a.id).rarity] - rank[card(b.id).rarity]);
  save();
  return out;
}

/** Pay gold (false: not enough). */
export function spendGold(n: number): boolean {
  const s = load();
  if (s.gold < n) return false;
  s.gold -= n;
  save();
  return true;
}
/** Hand out a prize (the Arena's). */
export function grant(o: { gold?: number; packs?: number; zats?: number }) {
  const s = load();
  s.gold += o.gold ?? 0;
  s.packs += o.packs ?? 0;
  s.zats += o.zats ?? 0;
  save();
}

export function buyPack(): boolean {
  const s = load();
  if (s.gold < PACK_PRICE) return false;
  s.gold -= PACK_PRICE;
  s.packs++;
  save();
  return true;
}

// ---- crafting ------------------------------------------------------------------------------------------

export function canCraft(id: string) {
  if (isSnarkCard(id)) ensureCards([id]);
  const d = card(id);
  return d.rarity !== "basic" && !d.token && owned(id) < maxCopies(id) && load().zats >= CRAFT[d.rarity];
}
export function craft(id: string): boolean {
  if (!canCraft(id)) return false;
  const s = load();
  const d = card(id);
  s.zats -= CRAFT[d.rarity];
  s.owned[id] = (s.owned[id] ?? 0) + 1;
  save();
  return true;
}
/** Disenchant one copy (not below what the starters need, not a basic). */
export function canDisenchant(id: string) {
  if (isSnarkCard(id)) {
    ensureCards([id]);
    return owned(id) > 0 && snarkIdOf(id) !== load().mine;
  }
  const d = card(id);
  if (d.rarity === "basic" || d.token) return false;
  const floor = Math.max(0, ...Object.values(STARTERS).map((l) => l.filter((x) => x === id).length));
  return owned(id) > floor;
}
export function disenchant(id: string): boolean {
  if (!canDisenchant(id)) return false;
  const s = load();
  s.owned[id]--;
  s.zats += DISENCHANT[card(id).rarity];
  save();
  return true;
}

export function seen(id?: string) {
  const s = load();
  if (id) delete s.fresh[id];
  else s.fresh = {};
  save();
}

// ---- after a duel --------------------------------------------------------------------------------------------

/**
 * What a duel earns: gold for playing (more for a win, more against a stronger rival), a pack every
 * third win, the first win's pack. Lines to show (EN; the table shows them as they are).
 */
export function awardDuel(won: boolean, skill: number): { gold: number; pack: boolean; lines: string[] } {
  const s = load();
  s.played++;
  const lines: string[] = [];
  let gold = won ? Math.round(40 + 70 * Math.max(0, Math.min(1, skill))) : 15;
  let pack = false;
  if (won) {
    s.wins++;
    if (s.wins === 1 || s.wins % 3 === 0) pack = true;
  }
  // (a little extra for the first duels, to fill a collection fast)
  if (s.played <= 3) gold += 25;
  s.gold += gold;
  if (pack) s.packs++;
  lines.push(`+${gold} gold`);
  if (pack) lines.push(s.wins === 1 ? "First win: a free pack" : `${s.wins} wins: a free pack`);
  else if (won) lines.push(`${3 - (s.wins % 3)} more win${3 - (s.wins % 3) > 1 ? "s" : ""} to the next free pack`);
  save();
  return { gold, pack, lines };
}

/** (bench) Start the collection again. */
export function resetProgress() {
  mem = fresh();
  save();
}
