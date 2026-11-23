/**
 * ZK LEGENDS: how the zkSNARKs play. Each move is chosen by a beam search over the rest of the turn:
 * every move allowed now is tried on a clone of the game, the best few lines are carried on (beam
 * `width`, `depth` moves deep), and every state on the way is scored as if the turn ended there
 * (`score`: Health with danger below 10, the boards' worth, cards in hand, the enemy's threat next
 * turn). The first move of the best line is played; then the search runs again from the new state
 * (draws and dice may have changed things). Skill sets the beam (a street player looks one move
 * ahead and slips; a shark looks five) and how much noise blurs its judgement.
 */
import {
  CARDS,
  KW,
  HERO_UID,
  apply,
  atkOf,
  card,
  clone,
  costOf,
  foe,
  heroAtk,
  moves,
  type Action,
  type Game,
  type HandCard,
  type Minion,
  type Side,
} from "./engine";

export interface AiOpts {
  skill: number;
  /** Noise and tie-breaks (not the game's dice). */
  rnd: () => number;
}

const hasKw = (m: Minion, k: number) => (m.kw & k) !== 0;

/** Health's worth: more per point the closer to death. */
function life(h: number) {
  if (h <= 0) return -60;
  if (h <= 10) return h * 1.6 + (h <= 5 ? -4 : 0);
  if (h <= 20) return 16 + (h - 10) * 0.9;
  return 25 + (h - 20) * 0.45;
}

function minionWorth(m: Minion, mine: boolean, g: Game): number {
  const d = card(m.id);
  const a = atkOf(m);
  let v = a * 1.05 + m.hp * 0.95 + 0.6;
  if (hasKw(m, KW.GUARD)) v += 0.8 + (mine ? Math.max(0, 15 - g.s[m.side].hero.hp) * 0.08 : 0);
  if (hasKw(m, KW.HALO)) v += 0.6 + a * 0.6;
  if (hasKw(m, KW.SHIELDED)) v += 0.8;
  if (hasKw(m, KW.DOUBLE)) v += a * 0.75;
  if (hasKw(m, KW.DUST)) v += 2;
  if (hasKw(m, KW.DRAIN)) v += a * 0.4;
  if (hasKw(m, KW.REORG)) v += 1.5;
  if (hasKw(m, KW.ELUSIVE)) v += 0.6;
  if (!m.redacted) {
    // what its text keeps doing (end of turn engines, auras, Nullifiers, Prover)
    if (d.turnEnd || d.turnStart || d.onSummon || d.onSpell || d.onDeath || d.aura || d.doubleDeath || d.spellDiscount) v += (d.worth ?? 2) * 0.8;
    if (d.death) v += (d.worth ?? 2) * 0.55;
    if (d.prover) v += d.prover * 1.2;
  }
  if (m.frozen) v -= a * 0.6;
  // (a minion at 0 Health is about to go)
  if (m.hp <= 0 || m.doomed) return 0;
  return v;
}

function handWorth(g: Game, side: Side, h: HandCard): number {
  const d = card(h.id);
  // a card in hand: options for later; a bit less once it can't be paid for a while
  const c = costOf(g, side, h);
  return 1.6 + Math.min(c, 8) * 0.12 + (d.rarity === "legendary" ? 0.6 : 0);
}

/** How hard `side` can hit the enemy hero next turn with what's on the board now. */
function threat(g: Game, side: Side): number {
  const s = g.s[side];
  let n = 0;
  for (const m of s.board) {
    if (m.frozen && m.frozen <= g.turnNo + 1) continue;
    n += atkOf(m) * (hasKw(m, KW.DOUBLE) ? 2 : 1);
  }
  if (s.hero.weapon) n += s.hero.weapon.atk;
  return n;
}
/** Health of the guards between `side`'s hero and the enemy. */
function wall(g: Game, side: Side): number {
  let n = 0;
  for (const m of g.s[side].board) if (hasKw(m, KW.GUARD) && !hasKw(m, KW.SHIELDED)) n += m.hp;
  return n;
}

export interface Style {
  /** How much the enemy hero's Health counts against our own (aggro > 1). */
  face: number;
}
export const STYLES: Record<string, Style> = {
  transparent: { face: 1.45 },
  sapling: { face: 1.1 },
  sprout: { face: 0.95 },
  orchard: { face: 0.9 },
  neutral: { face: 1 },
};

/** The state's worth for `me`, as if the turn ended now. */
export function score(g: Game, me: Side, style: Style = STYLES.neutral): number {
  if (g.phase === "over") return g.winner === me ? 1e6 - g.turnNo : g.winner === -1 ? -500 : -1e6;
  const you = foe(me);
  const A = g.s[me],
    B = g.s[you];
  let v = 0;
  v += life(A.hero.hp + A.hero.armor);
  v -= life(B.hero.hp + B.hero.armor) * style.face;
  for (const m of A.board) v += minionWorth(m, true, g);
  for (const m of B.board) v -= minionWorth(m, false, g) * 1.05;
  v += Math.min(A.hand.length, 9) * 0 + A.hand.reduce((x, h) => x + handWorth(g, me, h), 0);
  v -= B.hand.length * 1.4;
  v += A.secrets.length * 2.5 - B.secrets.length * 2.5;
  if (A.hero.weapon) v += A.hero.weapon.atk * A.hero.weapon.dur * 0.7;
  if (B.hero.weapon) v -= B.hero.weapon.atk * B.hero.weapon.dur * 0.7;
  // the enemy's swing next turn: lethal on board is a disaster, a big one hurts
  const th = threat(g, you);
  const myHp = A.hero.hp + A.hero.armor;
  if (th >= myHp + wall(g, me) * 0.5) v -= 40;
  else if (th >= myHp * 0.6) v -= (th / Math.max(1, myHp)) * 6;
  // our own swing (lethal next turn if they don't answer)
  const mine = threat(g, me);
  const theirHp = B.hero.hp + B.hero.armor;
  if (mine >= theirHp + wall(g, you)) v += 8;
  // an empty deck: fatigue is coming
  if (A.deck.length === 0) v -= 3;
  return v;
}

/** Pick a Discover option: the best card it can play soon. */
function chooseOpt(g: Game, side: Side): number {
  const p = g.pending!;
  let best = 0,
    bv = -1e9;
  p.opts.forEach((id, i) => {
    const d = CARDS.get(id)!;
    const reach = g.s[side].maxMana + 1;
    const v = (d.rarity === "legendary" ? 3 : d.rarity === "epic" ? 2 : 1) + Math.min(d.cost, reach) * 0.6 - (d.cost > reach ? 2 : 0);
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best;
}

interface Node {
  g: Game;
  first: Action | null;
  v: number;
}

function key(a: Action) {
  return JSON.stringify(a);
}

/** The next move for `side` (an "end" when nothing beats stopping here). */
export function decide(g: Game, side: Side, o: AiOpts): Action {
  if (g.pending && g.pending.side === side) return { k: "choose", i: chooseOpt(g, side) };
  const style = STYLES[g.s[side].hero.faction] ?? STYLES.neutral;
  const sk = Math.max(0, Math.min(1, o.skill));
  const width = sk < 0.3 ? 1 : sk < 0.55 ? 3 : sk < 0.8 ? 5 : 7;
  const depth = sk < 0.3 ? 2 : sk < 0.55 ? 3 : sk < 0.8 ? 4 : 5;
  const noise = (1 - sk) * 3.2;
  const jitter = () => (noise ? (o.rnd() - 0.5) * noise : 0);

  const root: Node = { g: clone(g), first: null, v: score(g, side, style) };
  let best: Node = { g: root.g, first: { k: "end" }, v: root.v + jitter() };
  let beam: Node[] = [root];
  const budget = sk < 0.3 ? 400 : sk < 0.55 ? 1500 : sk < 0.8 ? 3500 : 7000;
  let spent = 0;
  for (let d = 0; d < depth && beam.length; d++) {
    const next: Node[] = [];
    for (const n of beam) {
      const list = moves(n.g, side).filter((a) => a.k !== "end");
      for (const a of list) {
        if (spent++ > budget) break;
        const c = clone(n.g);
        if (!apply(c, side, a)) continue;
        // a Discover in the line: the AI picks at once
        if (c.pending && c.pending.side === side) apply(c, side, { k: "choose", i: chooseOpt(c, side) });
        const v = score(c, side, style) + jitter();
        const node = { g: c, first: n.first ?? a, v };
        next.push(node);
        if (v > best.v) best = node;
      }
    }
    if (best.v > 5e5) break; // lethal found
    next.sort((a, b) => b.v - a.v);
    // keep the beam varied: at most two lines starting with the same move
    const seen = new Map<string, number>();
    beam = [];
    for (const n of next) {
      const k = key(n.first!);
      const c = seen.get(k) ?? 0;
      if (c >= 2) continue;
      seen.set(k, c + 1);
      beam.push(n);
      if (beam.length >= width) break;
    }
  }
  // a weak player sometimes forgets a move or two and ends early
  if (sk < 0.4 && best.first!.k !== "end" && o.rnd() < (0.4 - sk) * 0.25) return { k: "end" };
  return best.first!;
}

/** The mulligan: keep the cheap cards (and a 4 when the hand is already low), send the rest back. */
export function mulligan(g: Game, side: Side, o: AiOpts): number[] {
  const hand = g.s[side].hand;
  const out: number[] = [];
  const cheap = hand.filter((h) => card(h.id).cost <= 2).length;
  for (const h of hand) {
    const c = card(h.id).cost;
    if (h.id === "coin") continue;
    if (c >= 5 || (c === 4 && cheap < 1) || (o.skill < 0.3 && o.rnd() < 0.2)) out.push(h.uid);
  }
  return out;
}

/** The player's possible damage this turn (for the table's "lethal" hint). */
export function boardDamage(g: Game, side: Side) {
  let n = heroAtk(g.s[side].hero);
  for (const m of g.s[side].board) if (!m.sick || hasKw(m, KW.CHARGE)) n += atkOf(m) * (hasKw(m, KW.DOUBLE) ? 2 : 1);
  return n;
}
void HERO_UID;
