/**
 * ZK LEGENDS: the rules. A duel of two heroes (two zkSNARKs) with 30 Health, a 30-card deck each,
 * ZEC crystals growing by one a turn up to ten, seven places on each side of the board, ten in a hand.
 * Pure data and functions, no DOM: the table (ui.ts), the snarks' play (ai.ts) and the balance bench
 * (sim.ts, run by node) all drive the same `apply()`. The state is plain objects, so the AI clones it
 * cheaply (`clone`) to try a line of play; cards' code lives in cards.ts and is looked up by id.
 *
 * Every change the table must show is an event in `g.ev` (draws, plays, hits, deaths, buffs…), in
 * order; the table animates them, then reads the state. An AI's clone sets `g.ev = null` (no events).
 */

export type Side = 0 | 1;
export type Faction = "neutral" | "transparent" | "sapling" | "sprout" | "orchard";
export type Rarity = "basic" | "common" | "rare" | "epic" | "legendary";
export type Tribe = "Miner" | "Node" | "Whale" | "Ghost" | "Plant" | "Bot";
export type CardType = "minion" | "spell" | "secret" | "weapon";

/** Keywords, as bits. */
export const KW = {
  GUARD: 1,
  SHIELDED: 2,
  HALO: 4,
  CHARGE: 8,
  RUSH: 16,
  DOUBLE: 32,
  DUST: 64,
  DRAIN: 128,
  REORG: 256,
  ELUSIVE: 512,
} as const;
export const KW_NAMES: [number, string, string][] = [
  [KW.GUARD, "Guard", "守卫"],
  [KW.SHIELDED, "Shielded", "屏蔽"],
  [KW.HALO, "Halo", "光环"],
  [KW.CHARGE, "Charge", "冲锋"],
  [KW.RUSH, "Rush", "突袭"],
  [KW.DOUBLE, "Double-spend", "双花"],
  [KW.DUST, "Dust", "粉尘"],
  [KW.DRAIN, "Drain", "吸取"],
  [KW.REORG, "Reorg", "重组"],
  [KW.ELUSIVE, "Private", "隐私"],
];

/** Who a card's effect may point at. */
export type Tgt = "any" | "minion" | "enemy" | "enemyMinion" | "friendly" | "friendlyMinion" | "otherFriendlyMinion";

export interface Minion {
  uid: number;
  id: string;
  side: Side;
  /** Attack and Health with every lasting buff (auras come on top: `aura`). */
  atk: number;
  hp: number;
  maxHp: number;
  /** Attack from auras, recomputed after every step. */
  aura: number;
  kw: number;
  /** Played this turn (can't attack unless Charge, or Rush against minions). */
  sick: boolean;
  attacks: number;
  /** Timelocked: can't attack until the end of its owner's turn number `frozen` (0: not frozen). */
  frozen: number;
  redacted: boolean;
  /** Marked to die (Dust, "destroy"), resolved with the other deaths. */
  doomed: boolean;
  /** Cost change carried back to the hand (bounce). */
  turnPlayed: number;
}

export interface HandCard {
  uid: number;
  id: string;
  /** A lasting cost change on this card (−1: one cheaper). */
  mod: number;
}

export interface Weapon {
  id: string;
  atk: number;
  dur: number;
}

export interface Hero {
  uid: number;
  hp: number;
  maxHp: number;
  armor: number;
  /** Attack this turn (from spells), on top of the weapon's. */
  tmpAtk: number;
  attacks: number;
  frozen: number;
  weapon: Weapon | null;
  /** The zkSNARK's id (the portrait). */
  art: number;
  faction: Faction;
  powerUsed: boolean;
}

export interface PSide {
  hero: Hero;
  deck: string[];
  hand: HandCard[];
  board: Minion[];
  mana: number;
  maxMana: number;
  fatigue: number;
  secrets: { uid: number; id: string }[];
  /** Card ids of this side's minions that died, in order. */
  dead: string[];
  /** Cards played this turn. */
  played: number;
  /** Turns this side has started. */
  turns: number;
  /** Mulligan done. */
  ready: boolean;
}

export interface Pending {
  side: Side;
  /** Discover: pick one of these ids into the hand. */
  opts: string[];
}

export type Ev =
  | { t: "turn"; side: Side; n: number }
  | { t: "mana"; side: Side; mana: number; max: number }
  | { t: "draw"; side: Side; uid: number; id: string }
  | { t: "give"; side: Side; uid: number; id: string }
  | { t: "burn"; side: Side; id: string }
  | { t: "fatigue"; side: Side; n: number }
  | { t: "mull"; side: Side; out: number[]; in: { uid: number; id: string }[] }
  | { t: "play"; side: Side; uid: number; id: string; target: number | null }
  | { t: "summon"; side: Side; m: Minion; pos: number }
  | { t: "attack"; from: number; to: number }
  | { t: "dmg"; uid: number; n: number; hp: number; armor: number; src: number }
  | { t: "halo"; uid: number }
  | { t: "heal"; uid: number; n: number; hp: number }
  | { t: "armor"; side: Side; n: number; armor: number }
  | { t: "die"; uid: number }
  | { t: "stats"; m: Minion }
  | { t: "hero"; side: Side; hero: Hero }
  | { t: "fx"; kind: string; from: number; to: number[] }
  | { t: "secret"; side: Side; uid: number }
  | { t: "reveal"; side: Side; uid: number; id: string }
  | { t: "counter"; uid: number; id: string }
  | { t: "bounce"; uid: number; side: Side; to: number; id: string }
  | { t: "steal"; uid: number; side: Side }
  | { t: "power"; side: Side; target: number | null }
  | { t: "weapon"; side: Side; w: Weapon | null }
  | { t: "discover"; side: Side; opts: string[] }
  | { t: "trigger"; uid: number }
  | { t: "over"; winner: Side | -1 };

export interface Game {
  s: [PSide, PSide];
  turn: Side;
  /** Turns played, both sides (1 is the first player's first turn). */
  turnNo: number;
  first: Side;
  phase: "mulligan" | "play" | "over";
  winner: Side | -1 | null;
  rs: number;
  uid: number;
  /** Minions that died this game (both sides). */
  deaths: number;
  /** Minions that died this turn. */
  deathsTurn: number;
  pending: Pending | null;
  ev: Ev[] | null;
  /** Nested effect depth (deaths resolve when the outermost step ends). */
  depth: number;
}

export type Action =
  | { k: "mull"; side: Side; swap: number[] }
  | { k: "play"; uid: number; pos?: number; target?: number | null }
  | { k: "attack"; from: number; to: number }
  | { k: "power"; target?: number | null }
  | { k: "choose"; i: number }
  | { k: "end" }
  | { k: "concede"; side: Side };

// ---- the cards' shape (cards.ts fills the registry) ----------------------------------------------------

export interface Ctx {
  g: Game;
  side: Side;
  /** The minion whose effect this is (its last state when it died). */
  self: Minion | null;
  target: number | null;
  /** Where the source stood on the board (Nullifiers summon there). */
  pos: number;
  /** For "whenever" triggers: the minion or card concerned. */
  other?: Minion | null;
  otherId?: string;
}

export interface CardDef {
  id: string;
  name: string;
  zh: string;
  type: CardType;
  cost: number;
  faction: Faction;
  rarity: Rarity;
  atk?: number;
  hp?: number;
  /** Weapons: durability. */
  dur?: number;
  tribe?: Tribe;
  kw?: number;
  text: string;
  textZh: string;
  /** The zkSNARK drawn on the card. */
  art: number;
  /** A zkSNARK card's number (#4071), shown on its plate. */
  serial?: number;
  /** Not in decks (summoned or given by other cards). */
  token?: boolean;
  /** Spells: required. Minions: their Mint's target (skipped when nothing is valid). */
  target?: Tgt;
  /** Extra condition on a target. */
  tf?: (g: Game, side: Side, uid: number) => boolean;
  /** Minions: their Mint (battlecry). Spells: their effect. */
  play?: (c: Ctx) => void;
  /** Nullifier (deathrattle). */
  death?: (c: Ctx) => void;
  turnEnd?: (c: Ctx) => void;
  turnStart?: (c: Ctx) => void;
  /** Another friendly minion was summoned (c.other). */
  onSummon?: (c: Ctx) => void;
  /** Its owner cast a spell (c.otherId). */
  onSpell?: (c: Ctx) => void;
  /** It took damage and lived. */
  onHurt?: (c: Ctx) => void;
  /** A minion died (c.other; friendly or not: check c.other.side). */
  onDeath?: (c: Ctx) => void;
  /** Attack aura: `who` gets +n. */
  aura?: { n: number; who: (self: Minion, m: Minion) => boolean };
  /** Your spells deal this much more damage. */
  prover?: number;
  /** Cost in hand, from the game (e.g. cheaper per death). */
  costFn?: (g: Game, side: Side) => number;
  /** Secrets: what sets it off. */
  secret?: "spell" | "minion" | "attack" | "death";
  /** Secrets: true if it went off (it's revealed and gone). */
  fire?: (c: Ctx, info: SecretInfo) => boolean;
  /** Can be played now (beyond mana and targets). */
  can?: (g: Game, side: Side) => boolean;
  /** AI: a rough worth of the card's text beyond its body, in "stat points". */
  worth?: number;
  /** While it's on the board: your spells cost this much less. */
  spellDiscount?: number;
  /** While it's on the board: your Nullifiers go off twice. */
  doubleDeath?: boolean;
  /** It can't attack heroes. */
  noFace?: boolean;
}

export interface SecretInfo {
  /** "spell": the spell's id; it is countered if `counter` is set. */
  spellId?: string;
  counter?: boolean;
  /** "minion": the minion just played. "attack": the attacker. "death": the friendly minion that died. */
  m?: Minion | null;
  attacker?: number;
  defender?: number;
  /** "attack": the attack is called off. */
  cancel?: boolean;
}

export const CARDS = new Map<string, CardDef>();
export const card = (id: string): CardDef => {
  const c = CARDS.get(id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};

/** The heroes' powers (2 ZEC, once a turn), one per faction. */
export interface Power {
  name: string;
  zh: string;
  text: string;
  textZh: string;
  cost: number;
  target?: Tgt;
  use: (c: Ctx) => void;
}
export const POWERS = new Map<Faction, Power>();

// ---- small things ----------------------------------------------------------------------------------------

export const HERO_UID: [number, number] = [1, 2];
export const MAX_BOARD = 7;
export const MAX_HAND = 10;
export const DECK_SIZE = 30;
export const START_HP = 30;
export const COIN = "coin";
/** Does the first player draw on turn 1 (the bench flips it to compare). */
export const FIRST_DRAW = { on: true };

const other = (s: Side): Side => (1 - s) as Side;
export { other as foe };

export function mulberry(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The game's own dice (its state lives in g.rs, so a clone rolls the same). */
export function rnd(g: Game): number {
  g.rs = (g.rs + 0x6d2b79f5) >>> 0;
  let t = g.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = <T>(g: Game, a: T[]): T | undefined => (a.length ? a[Math.floor(rnd(g) * a.length)] : undefined);
export function shuffle<T>(g: Game, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const emit = (g: Game, e: Ev) => g.ev?.push(e);

// ---- finding things ------------------------------------------------------------------------------------

export function minion(g: Game, uid: number): Minion | null {
  for (const s of g.s) for (const m of s.board) if (m.uid === uid) return m;
  return null;
}
export const isHero = (uid: number) => uid === 1 || uid === 2;
export const heroSide = (uid: number): Side => (uid === 1 ? 0 : 1);
export function sideOf(g: Game, uid: number): Side | null {
  if (isHero(uid)) return heroSide(uid);
  return minion(g, uid)?.side ?? null;
}
export const minions = (g: Game, side: Side) => g.s[side].board;
export const allMinions = (g: Game) => [...g.s[g.turn].board, ...g.s[other(g.turn)].board];
export const alive = (m: Minion) => m.hp > 0 && !m.doomed;
/** Characters of a side (hero first). */
export const chars = (g: Game, side: Side) => [HERO_UID[side], ...g.s[side].board.filter(alive).map((m) => m.uid)];
export const hasKw = (m: Minion, k: number) => (m.kw & k) !== 0;
export const atkOf = (m: Minion) => Math.max(0, m.atk + m.aura);
export function heroAtk(h: Hero) {
  return h.tmpAtk + (h.weapon?.atk ?? 0);
}
export function hpOf(g: Game, uid: number) {
  if (isHero(uid)) return g.s[heroSide(uid)].hero.hp;
  return minion(g, uid)?.hp ?? 0;
}

/** Your spells' extra damage (Prover). */
export function prover(g: Game, side: Side) {
  let n = 0;
  for (const m of g.s[side].board) if (!m.redacted && alive(m)) n += card(m.id).prover ?? 0;
  return n;
}
/** A spell's damage with Prover. */
export const sdmg = (c: Ctx, n: number) => n + prover(c.g, c.side);

/** What a card in hand costs now. */
export function costOf(g: Game, side: Side, h: HandCard) {
  const d = card(h.id);
  let c = (d.costFn ? d.costFn(g, side) : d.cost) + h.mod;
  // (cheaper spells: an aura on the board)
  if (d.type === "spell" || d.type === "secret")
    for (const m of g.s[side].board) if (!m.redacted && alive(m)) c -= card(m.id).spellDiscount ?? 0;
  return Math.max(0, c);
}

// ---- creating a game -------------------------------------------------------------------------------------

export interface Setup {
  seed: number;
  decks: [string[], string[]];
  factions: [Faction, Faction];
  arts: [number, number];
  /** Who plays first (default: by the seed). */
  first?: Side;
  /** Bench: the hero's Health (default 30). */
  hp?: number;
}

function newHero(side: Side, art: number, faction: Faction, hp: number): Hero {
  return { uid: HERO_UID[side], hp, maxHp: hp, armor: 0, tmpAtk: 0, attacks: 0, frozen: 0, weapon: null, art, faction, powerUsed: false };
}
function newSide(side: Side, deck: string[], art: number, faction: Faction, hp: number): PSide {
  return { hero: newHero(side, art, faction, hp), deck: deck.slice(), hand: [], board: [], mana: 0, maxMana: 0, fatigue: 0, secrets: [], dead: [], played: 0, turns: 0, ready: false };
}

export function newGame(o: Setup): Game {
  const hp = o.hp ?? START_HP;
  const g: Game = {
    s: [newSide(0, o.decks[0], o.arts[0], o.factions[0], hp), newSide(1, o.decks[1], o.arts[1], o.factions[1], hp)],
    turn: 0,
    turnNo: 0,
    first: 0,
    phase: "mulligan",
    winner: null,
    rs: (o.seed >>> 0) * 2654435761 + 12345,
    uid: 10,
    deaths: 0,
    deathsTurn: 0,
    pending: null,
    ev: [],
    depth: 0,
  };
  g.first = o.first ?? (rnd(g) < 0.5 ? 0 : 1);
  g.turn = g.first;
  for (const s of g.s) shuffle(g, s.deck);
  for (let i = 0; i < 3; i++) draw(g, g.first);
  for (let i = 0; i < 4; i++) draw(g, other(g.first));
  return g;
}

export function clone(g: Game): Game {
  const cs = (s: PSide): PSide => ({
    hero: { ...s.hero, weapon: s.hero.weapon ? { ...s.hero.weapon } : null },
    deck: s.deck.slice(),
    hand: s.hand.map((h) => ({ ...h })),
    board: s.board.map((m) => ({ ...m })),
    mana: s.mana,
    maxMana: s.maxMana,
    fatigue: s.fatigue,
    secrets: s.secrets.map((x) => ({ ...x })),
    dead: s.dead.slice(),
    played: s.played,
    turns: s.turns,
    ready: s.ready,
  });
  return {
    s: [cs(g.s[0]), cs(g.s[1])],
    turn: g.turn,
    turnNo: g.turnNo,
    first: g.first,
    phase: g.phase,
    winner: g.winner,
    rs: g.rs,
    uid: g.uid,
    deaths: g.deaths,
    deathsTurn: g.deathsTurn,
    pending: g.pending ? { side: g.pending.side, opts: g.pending.opts.slice() } : null,
    ev: null,
    depth: 0,
  };
}

// ---- the effects' toolbox (cards.ts uses these) -------------------------------------------------------------

export function draw(g: Game, side: Side, n = 1): HandCard[] {
  const out: HandCard[] = [];
  const s = g.s[side];
  for (let i = 0; i < n; i++) {
    const id = s.deck.pop();
    if (id === undefined) {
      s.fatigue++;
      emit(g, { t: "fatigue", side, n: s.fatigue });
      damage(g, HERO_UID[side], s.fatigue, 0);
      continue;
    }
    if (s.hand.length >= MAX_HAND) {
      emit(g, { t: "burn", side, id });
      continue;
    }
    const h = { uid: g.uid++, id, mod: 0 };
    s.hand.push(h);
    out.push(h);
    emit(g, { t: "draw", side, uid: h.uid, id });
  }
  return out;
}

/** Put a card into a hand (not from the deck). */
export function give(g: Game, side: Side, id: string, mod = 0): HandCard | null {
  const s = g.s[side];
  if (s.hand.length >= MAX_HAND) {
    emit(g, { t: "burn", side, id });
    return null;
  }
  const h = { uid: g.uid++, id, mod };
  s.hand.push(h);
  emit(g, { t: "give", side, uid: h.uid, id });
  return h;
}

/** Draw the first card of the deck that passes `f` (none: nothing). */
export function drawWhere(g: Game, side: Side, f: (d: CardDef) => boolean) {
  const s = g.s[side];
  for (let i = s.deck.length - 1; i >= 0; i--) {
    if (!f(card(s.deck[i]))) continue;
    const [id] = s.deck.splice(i, 1);
    if (s.hand.length >= MAX_HAND) {
      emit(g, { t: "burn", side, id });
      return;
    }
    const h = { uid: g.uid++, id, mod: 0 };
    s.hand.push(h);
    emit(g, { t: "draw", side, uid: h.uid, id });
    return;
  }
}

export function makeMinion(g: Game, side: Side, id: string): Minion {
  const d = card(id);
  return {
    uid: g.uid++,
    id,
    side,
    atk: d.atk ?? 0,
    hp: d.hp ?? 1,
    maxHp: d.hp ?? 1,
    aura: 0,
    kw: d.kw ?? 0,
    sick: true,
    attacks: 0,
    frozen: 0,
    redacted: false,
    doomed: false,
    turnPlayed: g.turnNo,
  };
}

/** Put a minion on the board (null: the board is full). */
export function summon(g: Game, side: Side, id: string, pos?: number, from?: Minion): Minion | null {
  const b = g.s[side].board;
  if (b.length >= MAX_BOARD) return null;
  const m = from ?? makeMinion(g, side, id);
  const at = pos === undefined ? b.length : Math.max(0, Math.min(b.length, pos));
  b.splice(at, 0, m);
  emit(g, { t: "summon", side, m: { ...m }, pos: at });
  refresh(g);
  for (const o of b.slice()) {
    if (o === m || o.redacted || !alive(o)) continue;
    const d = card(o.id);
    if (d.onSummon) {
      d.onSummon({ g, side, self: o, target: null, pos: b.indexOf(o), other: m });
    }
  }
  return m;
}

export function damage(g: Game, uid: number, n: number, src: number): number {
  if (n <= 0 || g.phase === "over") return 0;
  const srcM = src ? minion(g, src) : null;
  if (isHero(uid)) {
    const s = heroSide(uid);
    const h = g.s[s].hero;
    const soak = Math.min(h.armor, n);
    h.armor -= soak;
    h.hp -= n - soak;
    emit(g, { t: "dmg", uid, n, hp: h.hp, armor: h.armor, src });
    if (srcM && hasKw(srcM, KW.DRAIN) && !srcM.redacted) heal(g, HERO_UID[srcM.side], n);
    return n;
  }
  const m = minion(g, uid);
  if (!m || m.hp <= 0) return 0;
  if (hasKw(m, KW.HALO)) {
    m.kw &= ~KW.HALO;
    emit(g, { t: "halo", uid });
    return 0;
  }
  m.hp -= n;
  emit(g, { t: "dmg", uid, n, hp: m.hp, armor: 0, src });
  if (srcM && hasKw(srcM, KW.DUST)) m.doomed = true;
  if (srcM && hasKw(srcM, KW.DRAIN)) heal(g, HERO_UID[srcM.side], n);
  if (m.hp > 0 && !m.doomed && !m.redacted) {
    const d = card(m.id);
    if (d.onHurt) d.onHurt({ g, side: m.side, self: m, target: null, pos: g.s[m.side].board.indexOf(m) });
  }
  return n;
}

export function heal(g: Game, uid: number, n: number) {
  if (n <= 0) return;
  if (isHero(uid)) {
    const h = g.s[heroSide(uid)].hero;
    const k = Math.min(n, h.maxHp - h.hp);
    if (k <= 0) return;
    h.hp += k;
    emit(g, { t: "heal", uid, n: k, hp: h.hp });
    return;
  }
  const m = minion(g, uid);
  if (!m || !alive(m)) return;
  const k = Math.min(n, m.maxHp - m.hp);
  if (k <= 0) return;
  m.hp += k;
  emit(g, { t: "heal", uid, n: k, hp: m.hp });
}

export function armor(g: Game, side: Side, n: number) {
  const h = g.s[side].hero;
  h.armor += n;
  emit(g, { t: "armor", side, n, armor: h.armor });
}

export function buff(g: Game, m: Minion, atk: number, hp: number, kw = 0) {
  m.atk += atk;
  m.maxHp += hp;
  m.hp += hp;
  m.kw |= kw;
  refresh(g);
  emit(g, { t: "stats", m: { ...m } });
}
export function setStats(g: Game, m: Minion, atk: number, hp: number) {
  m.atk = atk;
  m.maxHp = hp;
  m.hp = hp;
  refresh(g);
  emit(g, { t: "stats", m: { ...m } });
}
export function addKw(g: Game, m: Minion, kw: number) {
  m.kw |= kw;
  emit(g, { t: "stats", m: { ...m } });
}

export function destroy(g: Game, uid: number) {
  const m = minion(g, uid);
  if (m) m.doomed = true;
}

/** Redact: the card text and every buff and keyword are gone (back to its printed body). */
export function redact(g: Game, m: Minion) {
  const d = card(m.id);
  m.redacted = true;
  m.kw = 0;
  m.frozen = 0;
  m.atk = d.atk ?? 0;
  m.maxHp = d.hp ?? 1;
  m.hp = Math.min(m.hp, m.maxHp);
  refresh(g);
  emit(g, { t: "stats", m: { ...m } });
}

/** Timelock: it can't attack until the end of its owner's next turn. */
export function freeze(g: Game, uid: number) {
  const until = (s: Side) => (g.turn === s ? g.turnNo + 2 : g.turnNo + 1);
  if (isHero(uid)) {
    const s = heroSide(uid);
    g.s[s].hero.frozen = until(s);
    emit(g, { t: "hero", side: s, hero: { ...g.s[s].hero } });
    return;
  }
  const m = minion(g, uid);
  if (!m) return;
  m.frozen = until(m.side);
  emit(g, { t: "stats", m: { ...m } });
}

/** Back to its owner's hand (costing `extra` more). */
export function bounce(g: Game, uid: number, extra = 0) {
  const m = minion(g, uid);
  if (!m) return;
  const b = g.s[m.side].board;
  b.splice(b.indexOf(m), 1);
  const s = g.s[m.side];
  if (s.hand.length >= MAX_HAND) {
    emit(g, { t: "die", uid });
    return;
  }
  const h = { uid: g.uid++, id: m.id, mod: extra };
  s.hand.push(h);
  emit(g, { t: "bounce", uid, side: m.side, to: h.uid, id: m.id });
  refresh(g);
}

/** Take control of an enemy minion. */
export function steal(g: Game, uid: number, by: Side) {
  const m = minion(g, uid);
  if (!m || m.side === by) return;
  const mine = g.s[by].board;
  if (mine.length >= MAX_BOARD) {
    m.doomed = true;
    return;
  }
  const theirs = g.s[m.side].board;
  theirs.splice(theirs.indexOf(m), 1);
  m.side = by;
  m.sick = true;
  m.attacks = 0;
  mine.push(m);
  emit(g, { t: "steal", uid, side: by });
  refresh(g);
}

export function equip(g: Game, side: Side, id: string) {
  const d = card(id);
  const w = { id, atk: d.atk ?? 0, dur: d.dur ?? 1 };
  g.s[side].hero.weapon = w;
  emit(g, { t: "weapon", side, w: { ...w } });
}

/** A hero's Health set outright (the Turnstile Keeper). */
export function setHeroHp(g: Game, side: Side, hp: number) {
  const h = g.s[side].hero;
  h.maxHp = Math.max(h.maxHp, hp);
  h.hp = hp;
  emit(g, { t: "hero", side, hero: { ...h, weapon: h.weapon ? { ...h.weapon } : null } });
  checkOver(g);
}

/** ZEC for this turn only (up to 10). */
export function gainMana(g: Game, side: Side, n: number) {
  const s = g.s[side];
  s.mana = Math.min(10, s.mana + n);
  emit(g, { t: "mana", side, mana: s.mana, max: s.maxMana });
}

export function fx(g: Game, kind: string, from: number, to: number[]) {
  emit(g, { t: "fx", kind, from, to });
}

/** Discover: three different cards from the pool, the side picks one (a choice the game waits for). */
export function discover(g: Game, side: Side, pool: string[]) {
  const p = pool.slice();
  const opts: string[] = [];
  while (opts.length < 3 && p.length) {
    const i = Math.floor(rnd(g) * p.length);
    opts.push(p.splice(i, 1)[0]);
  }
  if (!opts.length) return;
  g.pending = { side, opts };
  emit(g, { t: "discover", side, opts: opts.slice() });
}

/** The attack auras, recomputed (cheap: a board is at most seven). */
export function refresh(g: Game) {
  for (const s of g.s) {
    for (const m of s.board) m.aura = 0;
    for (const src of s.board) {
      if (src.redacted || !alive(src)) continue;
      const a = card(src.id).aura;
      if (!a) continue;
      for (const m of s.board) if (m !== src && a.who(src, m)) m.aura += a.n;
    }
  }
}

// ---- deaths ------------------------------------------------------------------------------------------------

/** How many times a side's Nullifiers go off (the Grave Banker doubles them). */
function deathTimes(g: Game, side: Side) {
  return g.s[side].board.some((m) => !m.redacted && alive(m) && card(m.id).doubleDeath) ? 2 : 1;
}

export function resolveDeaths(g: Game) {
  for (let guard = 0; guard < 40; guard++) {
    const dying: { m: Minion; pos: number }[] = [];
    for (const side of [g.turn, other(g.turn)] as Side[]) {
      const b = g.s[side].board;
      for (let i = 0; i < b.length; i++) if (!alive(b[i])) dying.push({ m: b[i], pos: i });
    }
    if (!dying.length) break;
    // off the board first (all of them), then their last words in order
    for (const { m } of dying) {
      const b = g.s[m.side].board;
      b.splice(b.indexOf(m), 1);
      g.s[m.side].dead.push(m.id);
      g.deaths++;
      g.deathsTurn++;
      emit(g, { t: "die", uid: m.uid });
    }
    refresh(g);
    for (const { m, pos } of dying) {
      const d = card(m.id);
      // its own position, shifted left by the friends that died before it
      const shift = dying.filter((x) => x.m.side === m.side && x.pos < pos).length;
      const at = pos - shift;
      if (d.death && !m.redacted) {
        const times = deathTimes(g, m.side);
        for (let k = 0; k < times; k++) {
          emit(g, { t: "trigger", uid: m.uid });
          d.death({ g, side: m.side, self: m, target: null, pos: at });
        }
      }
      if (hasKw(m, KW.REORG) && !m.redacted) {
        const r = makeMinion(g, m.side, m.id);
        r.hp = 1;
        r.kw &= ~KW.REORG;
        summon(g, m.side, m.id, at, r);
      }
      // "whenever a minion dies"
      for (const s of [g.turn, other(g.turn)] as Side[])
        for (const o of g.s[s].board.slice()) {
          if (o.redacted || !alive(o)) continue;
          const od = card(o.id);
          if (od.onDeath) od.onDeath({ g, side: o.side, self: o, target: null, pos: g.s[s].board.indexOf(o), other: m });
        }
      // the dead's side secrets ("when a friendly minion dies")
      secretsFire(g, m.side, "death", { m });
    }
  }
  checkOver(g);
}

function checkOver(g: Game) {
  if (g.phase === "over") return;
  const d0 = g.s[0].hero.hp <= 0,
    d1 = g.s[1].hero.hp <= 0;
  if (!d0 && !d1) return;
  g.phase = "over";
  g.winner = d0 && d1 ? -1 : d0 ? 1 : 0;
  emit(g, { t: "over", winner: g.winner });
}

/** Run an effect step: deaths are resolved when the outermost step is done. */
function step(g: Game, f: () => void) {
  g.depth++;
  try {
    f();
  } finally {
    g.depth--;
  }
  if (g.depth === 0) resolveDeaths(g);
}

// ---- secrets ---------------------------------------------------------------------------------------------

/** The secrets of `owner` that `kind` sets off, in the order they were played; true if one fired. */
function secretsFire(g: Game, owner: Side, kind: CardDef["secret"], info: SecretInfo): boolean {
  if (g.turn === owner) return false; // secrets only go off on the other player's turn
  let fired = false;
  for (const sc of g.s[owner].secrets.slice()) {
    const d = card(sc.id);
    if (d.secret !== kind || !d.fire) continue;
    const ok = d.fire({ g, side: owner, self: null, target: null, pos: 0 }, info);
    if (!ok) continue;
    fired = true;
    const list = g.s[owner].secrets;
    list.splice(list.indexOf(sc), 1);
    emit(g, { t: "reveal", side: owner, uid: sc.uid, id: sc.id });
    if (info.cancel || info.counter) break;
  }
  return fired;
}

// ---- targets -----------------------------------------------------------------------------------------------

/** Every uid `side` may point a `tgt` at (spells and powers can't pick Private minions). */
export function targets(g: Game, side: Side, tgt: Tgt, spell: boolean, tf?: CardDef["tf"], selfUid = 0): number[] {
  const out: number[] = [];
  const foe = other(side);
  const ok = (m: Minion) => {
    if (!alive(m) || m.uid === selfUid) return false;
    if (m.side !== side && hasKw(m, KW.SHIELDED)) return false;
    if (spell && hasKw(m, KW.ELUSIVE)) return false;
    return !tf || tf(g, side, m.uid);
  };
  const heroOk = (s: Side) => !tf || tf(g, side, HERO_UID[s]);
  const mins = (s: Side) => g.s[s].board.filter(ok).map((m) => m.uid);
  switch (tgt) {
    case "any":
      if (heroOk(side)) out.push(HERO_UID[side]);
      if (heroOk(foe)) out.push(HERO_UID[foe]);
      out.push(...mins(side), ...mins(foe));
      break;
    case "minion":
      out.push(...mins(side), ...mins(foe));
      break;
    case "enemy":
      if (heroOk(foe)) out.push(HERO_UID[foe]);
      out.push(...mins(foe));
      break;
    case "enemyMinion":
      out.push(...mins(foe));
      break;
    case "friendly":
      if (heroOk(side)) out.push(HERO_UID[side]);
      out.push(...mins(side));
      break;
    case "friendlyMinion":
    case "otherFriendlyMinion":
      out.push(...mins(side));
      break;
  }
  return out;
}

/** What a card in hand may be pointed at (null: it needs no target; [] with `need`: it can't be played). */
export function playTargets(g: Game, side: Side, h: HandCard): { list: number[]; need: boolean } | null {
  const d = card(h.id);
  if (!d.target) return null;
  const spell = d.type === "spell";
  return { list: targets(g, side, d.target, spell, d.tf), need: spell };
}

// ---- attacks -------------------------------------------------------------------------------------------

/** Can it attack at all this turn? */
export function canAttack(g: Game, side: Side, uid: number): boolean {
  if (g.phase !== "play" || g.turn !== side || g.pending) return false;
  if (isHero(uid)) {
    if (heroSide(uid) !== side) return false;
    const h = g.s[side].hero;
    if (h.frozen) return false;
    const a = heroAtk(h);
    return a > 0 && h.attacks < 1;
  }
  const m = minion(g, uid);
  if (!m || m.side !== side || !alive(m)) return false;
  if (m.frozen || atkOf(m) <= 0) return false;
  if (m.attacks >= (hasKw(m, KW.DOUBLE) ? 2 : 1)) return false;
  if (m.sick && !hasKw(m, KW.CHARGE) && !hasKw(m, KW.RUSH)) return false;
  return true;
}

/** Who it may attack (Guard first; Shielded can't be picked; Rush on its first turn: minions only). */
export function attackTargets(g: Game, side: Side, uid: number): number[] {
  if (!canAttack(g, side, uid)) return [];
  const foe = other(side);
  const visible = g.s[foe].board.filter((m) => alive(m) && !hasKw(m, KW.SHIELDED));
  const guards = visible.filter((m) => hasKw(m, KW.GUARD));
  const pool = guards.length ? guards : visible;
  const out = pool.map((m) => m.uid);
  const m = isHero(uid) ? null : minion(g, uid);
  const rushOnly = m && m.sick && !hasKw(m, KW.CHARGE);
  const noHero = m && card(m.id).noFace;
  if (!guards.length && !rushOnly && !noHero) out.unshift(HERO_UID[foe]);
  return out;
}

function doAttack(g: Game, side: Side, from: number, to: number) {
  const info: SecretInfo = { attacker: from, defender: to };
  secretsFire(g, other(side), "attack", info);
  resolveDeaths(g);
  if (g.phase === "over" || info.cancel) return;
  const att = isHero(from) ? null : minion(g, from);
  if (!isHero(from) && (!att || !alive(att))) return;
  const def = isHero(to) ? null : minion(g, to);
  if (!isHero(to) && (!def || !alive(def))) return;
  // a secret may have changed the defender (a decoy): it still has to be there
  emit(g, { t: "attack", from, to });
  if (att) {
    att.attacks++;
    att.kw &= ~KW.SHIELDED;
  } else g.s[side].hero.attacks++;
  const aDmg = att ? atkOf(att) : heroAtk(g.s[side].hero);
  const dDmg = def ? atkOf(def) : 0;
  step(g, () => {
    damage(g, to, aDmg, from);
    if (dDmg > 0) damage(g, from, dDmg, to);
    if (!att) {
      const w = g.s[side].hero.weapon;
      if (w) {
        w.dur--;
        if (w.dur <= 0) {
          g.s[side].hero.weapon = null;
          emit(g, { t: "weapon", side, w: null });
        } else emit(g, { t: "weapon", side, w: { ...w } });
      }
    }
    if (att && att.hp > 0 && !att.doomed) emit(g, { t: "stats", m: { ...att } });
  });
}

// ---- turns -------------------------------------------------------------------------------------------------

function startTurn(g: Game) {
  const side = g.turn;
  const s = g.s[side];
  g.turnNo++;
  g.deathsTurn = 0;
  s.turns++;
  s.played = 0;
  s.maxMana = Math.min(10, s.maxMana + 1);
  s.mana = s.maxMana;
  s.hero.attacks = 0;
  s.hero.powerUsed = false;
  for (const m of s.board) {
    m.sick = false;
    m.attacks = 0;
  }
  emit(g, { t: "turn", side, n: g.turnNo });
  emit(g, { t: "mana", side, mana: s.mana, max: s.maxMana });
  step(g, () => {
    // (the first player skips the very first draw: going first is already a head start)
    if (g.turnNo > 1 || FIRST_DRAW.on) draw(g, side);
    for (const m of s.board.slice()) {
      if (m.redacted || !alive(m)) continue;
      const d = card(m.id);
      if (d.turnStart) {
        emit(g, { t: "trigger", uid: m.uid });
        d.turnStart({ g, side, self: m, target: null, pos: s.board.indexOf(m) });
      }
    }
  });
}

function endTurn(g: Game) {
  const side = g.turn;
  const s = g.s[side];
  step(g, () => {
    for (const m of s.board.slice()) {
      if (m.redacted || !alive(m)) continue;
      const d = card(m.id);
      if (d.turnEnd) {
        emit(g, { t: "trigger", uid: m.uid });
        d.turnEnd({ g, side, self: m, target: null, pos: s.board.indexOf(m) });
      }
    }
  });
  if (g.phase === "over") return;
  // the thaw: a Timelock ends with its owner's turn
  for (const m of s.board)
    if (m.frozen && g.turnNo >= m.frozen) {
      m.frozen = 0;
      emit(g, { t: "stats", m: { ...m } });
    }
  if (s.hero.frozen && g.turnNo >= s.hero.frozen) s.hero.frozen = 0;
  s.hero.tmpAtk = 0;
  emit(g, { t: "hero", side, hero: { ...s.hero, weapon: s.hero.weapon ? { ...s.hero.weapon } : null } });
  // a long game is a draw (a safety for the bench)
  if (g.turnNo >= 89) {
    g.phase = "over";
    g.winner = -1;
    emit(g, { t: "over", winner: -1 });
    return;
  }
  g.turn = other(side);
  startTurn(g);
}

// ---- the moves ------------------------------------------------------------------------------------------------

export function canPlay(g: Game, side: Side, h: HandCard): boolean {
  if (g.phase !== "play" || g.turn !== side || g.pending) return false;
  const s = g.s[side];
  if (!s.hand.includes(h)) return false;
  if (costOf(g, side, h) > s.mana) return false;
  const d = card(h.id);
  if (d.type === "minion" && s.board.length >= MAX_BOARD) return false;
  if (d.type === "secret" && (s.secrets.some((x) => x.id === h.id) || s.secrets.length >= 5)) return false;
  if (d.can && !d.can(g, side)) return false;
  const t = playTargets(g, side, h);
  if (t && t.need && !t.list.length) return false;
  return true;
}

export function canPower(g: Game, side: Side): boolean {
  if (g.phase !== "play" || g.turn !== side || g.pending) return false;
  const s = g.s[side];
  const p = POWERS.get(s.hero.faction);
  if (!p || s.hero.powerUsed || s.mana < p.cost) return false;
  if (p.target && !targets(g, side, p.target, true).length) return false;
  if (s.hero.faction === "sapling" && s.board.length >= MAX_BOARD) return false;
  return true;
}

/** Apply a move for `side`. False: it isn't allowed (nothing changed). */
export function apply(g: Game, side: Side, a: Action): boolean {
  if (g.phase === "over") return false;
  if (a.k === "concede") {
    g.phase = "over";
    g.winner = other(a.side);
    emit(g, { t: "over", winner: g.winner });
    return true;
  }
  if (a.k === "mull") {
    if (g.phase !== "mulligan") return false;
    const s = g.s[a.side];
    if (s.ready) return false;
    const out = s.hand.filter((h) => a.swap.includes(h.uid) && h.id !== COIN);
    const back = out.map((h) => h.id);
    s.hand = s.hand.filter((h) => !out.includes(h));
    const ins: { uid: number; id: string }[] = [];
    for (let i = 0; i < out.length; i++) {
      const id = s.deck.pop();
      if (id === undefined) break;
      const h = { uid: g.uid++, id, mod: 0 };
      s.hand.push(h);
      ins.push({ uid: h.uid, id });
    }
    s.deck.push(...back);
    shuffle(g, s.deck);
    s.ready = true;
    emit(g, { t: "mull", side: a.side, out: out.map((h) => h.uid), in: ins });
    if (g.s[0].ready && g.s[1].ready) {
      // the second player's spare zatoshi
      give(g, other(g.first), COIN);
      g.phase = "play";
      g.turn = g.first;
      startTurn(g);
    }
    return true;
  }
  if (g.phase !== "play" || g.turn !== side) return false;
  if (a.k === "choose") {
    const p = g.pending;
    if (!p || p.side !== side || !p.opts[a.i]) return false;
    g.pending = null;
    give(g, side, p.opts[a.i]);
    return true;
  }
  if (g.pending) return false;
  const s = g.s[side];
  switch (a.k) {
    case "end":
      endTurn(g);
      return true;
    case "power": {
      if (!canPower(g, side)) return false;
      const p = POWERS.get(s.hero.faction)!;
      let target: number | null = null;
      if (p.target) {
        const list = targets(g, side, p.target, true);
        if (a.target == null || !list.includes(a.target)) return false;
        target = a.target;
      }
      s.mana -= p.cost;
      s.hero.powerUsed = true;
      emit(g, { t: "power", side, target });
      emit(g, { t: "mana", side, mana: s.mana, max: s.maxMana });
      step(g, () => p.use({ g, side, self: null, target, pos: s.board.length }));
      return true;
    }
    case "attack": {
      const list = attackTargets(g, side, a.from);
      if (!list.includes(a.to)) return false;
      doAttack(g, side, a.from, a.to);
      return true;
    }
    case "play": {
      const h = s.hand.find((x) => x.uid === a.uid);
      if (!h || !canPlay(g, side, h)) return false;
      const d = card(h.id);
      const t = playTargets(g, side, h);
      let target: number | null = null;
      if (t && t.list.length) {
        if (a.target != null && t.list.includes(a.target)) target = a.target;
        else if (t.need) return false;
        // (a Mint with targets about but none picked: it's played without)
      }
      const cost = costOf(g, side, h);
      s.mana -= cost;
      s.hand.splice(s.hand.indexOf(h), 1);
      s.played++;
      emit(g, { t: "play", side, uid: h.uid, id: h.id, target });
      emit(g, { t: "mana", side, mana: s.mana, max: s.maxMana });
      if (d.type === "minion") playMinion(g, side, h, d, a.pos, target);
      else if (d.type === "spell") playSpell(g, side, h, d, target);
      else if (d.type === "secret") {
        s.secrets.push({ uid: h.uid, id: h.id });
        emit(g, { t: "secret", side, uid: h.uid });
      } else if (d.type === "weapon") {
        step(g, () => {
          equip(g, side, h.id);
          d.play?.({ g, side, self: null, target, pos: 0 });
        });
      }
      return true;
    }
  }
  return false;
}

function playMinion(g: Game, side: Side, h: HandCard, d: CardDef, pos: number | undefined, target: number | null) {
  const s = g.s[side];
  const m = makeMinion(g, side, h.id);
  m.uid = h.uid; // the card keeps its uid from hand to board
  g.uid = Math.max(g.uid, h.uid + 1);
  const at = pos === undefined ? s.board.length : Math.max(0, Math.min(s.board.length, pos));
  step(g, () => {
    s.board.splice(at, 0, m);
    emit(g, { t: "summon", side, m: { ...m }, pos: at });
    refresh(g);
    if (d.play) d.play({ g, side, self: m, target, pos: at });
    for (const o of s.board.slice()) {
      if (o === m || o.redacted || !alive(o)) continue;
      const od = card(o.id);
      if (od.onSummon) od.onSummon({ g, side, self: o, target: null, pos: s.board.indexOf(o), other: m });
    }
  });
  if (g.phase === "over") return;
  if (s.board.includes(m) && alive(m)) {
    step(g, () => secretsFire(g, other(side), "minion", { m }));
  }
}

function playSpell(g: Game, side: Side, h: HandCard, d: CardDef, target: number | null) {
  const s = g.s[side];
  const info: SecretInfo = { spellId: h.id };
  step(g, () => secretsFire(g, other(side), "spell", info));
  if (info.counter) {
    emit(g, { t: "counter", uid: h.uid, id: h.id });
    return;
  }
  // the target may have gone meanwhile
  if (target != null && !isHero(target) && !minion(g, target)) target = null;
  if (d.target && target == null && d.type === "spell" && d.target !== "any") {
    // nothing left to hit: the spell fizzles
    return;
  }
  step(g, () => {
    d.play?.({ g, side, self: null, target, pos: s.board.length });
    for (const o of s.board.slice()) {
      if (o.redacted || !alive(o)) continue;
      const od = card(o.id);
      if (od.onSpell) {
        emit(g, { t: "trigger", uid: o.uid });
        od.onSpell({ g, side, self: o, target: null, pos: s.board.indexOf(o), otherId: h.id });
      }
    }
  });
}

// ---- for the AI and the table: every move allowed now ---------------------------------------------------------

export function moves(g: Game, side: Side): Action[] {
  const out: Action[] = [];
  if (g.phase !== "play" || g.turn !== side) return out;
  if (g.pending) {
    if (g.pending.side === side) g.pending.opts.forEach((_, i) => out.push({ k: "choose", i }));
    return out;
  }
  const s = g.s[side];
  const seen = new Set<string>();
  for (const h of s.hand) {
    if (seen.has(h.id) || !canPlay(g, side, h)) continue;
    seen.add(h.id);
    const d = card(h.id);
    const t = playTargets(g, side, h);
    // minions go to the right end, or the middle-left for auras (a small choice is enough)
    const positions = d.type === "minion" ? (d.aura || d.onSummon ? [Math.floor(s.board.length / 2)] : [s.board.length]) : [undefined];
    for (const pos of positions) {
      if (t && t.list.length) for (const tg of t.list) out.push({ k: "play", uid: h.uid, pos, target: tg });
      else if (!t || !t.need) out.push({ k: "play", uid: h.uid, pos });
    }
  }
  if (canPower(g, side)) {
    const p = POWERS.get(s.hero.faction)!;
    if (p.target) for (const tg of targets(g, side, p.target, true)) out.push({ k: "power", target: tg });
    else out.push({ k: "power" });
  }
  for (const uid of [HERO_UID[side], ...s.board.map((m) => m.uid)])
    for (const to of attackTargets(g, side, uid)) out.push({ k: "attack", from: uid, to });
  out.push({ k: "end" });
  return out;
}
