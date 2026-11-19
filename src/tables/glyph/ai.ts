/**
 * LAST SNARK's zkSNARK players, with no DOM: what to play, which pool to name, what to pass at
 * SHIELDED HOUR, and the human side of the shout (forgetting to call, catching others), all scaled
 * by the seat's `skill` (0.22 street … 0.92 whale room). Shared by the table and the Node sims.
 */
import { type Card, type Game, points } from "./engine";

export type Move = { t: "play"; card: Card; ink: number; call: boolean } | { t: "draw" } | { t: "keep" };

const inkCount = (hand: Card[], ink: number, skip: Card | null = null) => {
  let k = 0;
  for (const c of hand) if (c !== skip && c.ink === ink) k++;
  return k;
};

/** The ink to name for a wild: the one held most (actions count a little more); weak players guess. */
export function bestInk(hand: Card[], skip: Card | null, skill: number, rnd: () => number): number {
  if (rnd() < (1 - skill) * 0.35) return Math.floor(rnd() * 4);
  const w = [0, 0, 0, 0];
  for (const c of hand) if (c !== skip && c.ink >= 0) w[c.ink] += c.kind === "num" ? 1 : 1.4;
  let best = Math.floor(rnd() * 4);
  for (let i = 0; i < 4; i++) if (w[i] > w[best]) best = i;
  return best;
}

/** Forgets to call LAST SNARK when going down to one card. */
export const forgets = (skill: number, rnd: () => number) => rnd() < 0.04 + 0.42 * (1 - skill) ** 2;
/** Ms until this seat points at an exposed rival (null: it does not notice). */
export const catchDelay = (skill: number, rnd: () => number) => (rnd() < 0.12 + 0.8 * skill ? 2100 - 1400 * skill + rnd() * 500 : null);
/** Ms until a seat that forgot remembers and calls late (null: it never does). */
export const lateCallDelay = (skill: number, rnd: () => number) => (rnd() < 0.15 + 0.55 * skill ? 500 + rnd() * 1200 : null);
/** The thinking pause before a move (ms), longer while someone sits exposed (everyone looks). */
export const thinkMs = (rnd: () => number, exposed: boolean) => 560 + rnd() * 480 + (exposed ? 650 : 0);

/** The seat's move on its turn (phase "turn" or "drawn"). */
export function decide(g: Game, seat: number, skill: number, rnd: () => number): Move {
  const hand = g.hands[seat];
  if (g.phase === "drawn" && g.drawn) {
    const c = g.drawn;
    // a DUST ATTACK drawn early is worth keeping for a skilled player
    if (c.kind === "shor" && skill > 0.6 && hand.length > 4 && g.hands[g.next(seat)].length > 3 && rnd() < 0.6) return { t: "keep" };
    return { t: "play", card: c, ink: c.ink < 0 ? bestInk(hand, c, skill, rnd) : -1, call: hand.length === 2 && !forgets(skill, rnd) };
  }
  const legal = g.legal(seat);
  if (!legal.length) return { t: "draw" };
  // a stacked penalty: weak players sometimes just take it
  if (g.pending > 0 && rnd() < (1 - skill) * 0.3) return { t: "draw" };

  const nextN = g.hands[g.next(seat)].length;
  const prevN = g.hands[g.next(seat, -1)].length;
  const anyPlain = legal.some((c) => c.ink >= 0);
  let best = legal[0];
  let bestS = -Infinity;
  for (const c of legal) {
    let s = 0;
    const ink = c.ink >= 0 ? c.ink : bestInk(hand, c, 1, rnd);
    // keep the ink you hold: more cards to follow with
    s += inkCount(hand, ink, c) * (2 + 3 * skill);
    // dump the heavy cards first
    s += points(c) * 0.22;
    if (c.ink < 0 && anyPlain) s -= 22 + 18 * skill;
    switch (c.kind) {
      case "shor":
        s += nextN <= 2 ? 46 : -22 * skill;
        break;
      case "fees":
        s += nextN <= 2 ? 30 : 5;
        break;
      case "skip":
        s += nextN <= 2 ? 26 : 4;
        break;
      case "reorg":
        // turn the table away from a rival about to go out
        s += nextN <= 2 && prevN > nextN ? 26 : prevN > nextN ? 4 : -2;
        break;
      case "makers":
        s += 3 + (nextN <= 2 ? 6 : 0);
        break;
      default:
    }
    s += (rnd() - 0.5) * 50 * (1 - skill);
    if (s > bestS) {
      bestS = s;
      best = c;
    }
  }
  if (rnd() < (1 - skill) * 0.18) best = legal[Math.floor(rnd() * legal.length)];
  return { t: "play", card: best, ink: best.ink < 0 ? bestInk(hand, best, skill, rnd) : -1, call: hand.length === 2 && !forgets(skill, rnd) };
}

/** SHIELDED HOUR: the card least worth keeping (a heavy number of a thin ink; never a wild if avoidable). */
export function passPick(hand: Card[], skill: number, rnd: () => number): Card {
  let best = hand[0];
  let bestV = Infinity;
  for (const c of hand) {
    let v = c.ink < 0 ? 100 : c.kind !== "num" ? 18 : 0;
    if (c.ink >= 0) v += inkCount(hand, c.ink, c) * 5;
    v -= points(c) * 0.6;
    v += (rnd() - 0.5) * 30 * (1 - skill);
    if (v < bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/**
 * The catch window without a clock (the Node sims, the bench's `fast`): the exposed seat may still
 * call late, a rival may point first, or the next player acts and it closes.
 */
export function windowOutcome(g: Game, skills: number[], rnd: () => number, nextThink: number): { t: "call" } | { t: "catch"; by: number } | null {
  const v = g.exposed;
  if (v < 0) return null;
  let bestT = nextThink;
  let res: { t: "call" } | { t: "catch"; by: number } | null = null;
  const late = lateCallDelay(skills[v], rnd);
  if (late !== null && late < bestT) {
    bestT = late;
    res = { t: "call" };
  }
  for (let i = 0; i < g.n; i++) {
    if (i === v) continue;
    const d = catchDelay(skills[i], rnd);
    if (d !== null && d < bestT) {
      bestT = d;
      res = { t: "catch", by: i };
    }
  }
  return res;
}
