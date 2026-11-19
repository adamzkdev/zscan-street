/**
 * The hand evaluator: the best five of five, six or seven cards, as one integer that compares
 * directly (higher wins, equal splits). Layout: category << 20, then up to five ranks, 4 bits each.
 *
 *   8 straight flush · 7 four of a kind · 6 full house · 5 flush · 4 straight
 *   3 three of a kind · 2 two pair · 1 one pair · 0 high card
 *
 * No allocation per call (module scratch arrays), so the AI's Monte Carlo can run it a lot.
 */
import { RANKS } from "./cards";

const counts = new Int8Array(13);
const suitCnt = new Int8Array(4);
const suitMask = new Int32Array(4);

/** The highest straight in a 13-bit rank mask (its top rank; 3 for the wheel A-2-3-4-5), or -1. */
function straightTop(m: number) {
  for (let top = 12; top >= 4; top--) if (((m >> (top - 4)) & 31) === 31) return top;
  if ((m & 0x100f) === 0x100f) return 3;
  return -1;
}

/** The top `k` ranks of a mask, packed from bit 16 down. */
function topRanks(m: number, k: number) {
  let out = 0;
  let shift = 16;
  for (let r = 12; r >= 0 && k > 0; r--)
    if (m & (1 << r)) {
      out |= r << shift;
      shift -= 4;
      k--;
    }
  return out;
}

/** Scores `n` cards (5…7; fewer works too, for a partial look). */
export function evaluate(cards: ArrayLike<number>, n = cards.length): number {
  counts.fill(0);
  suitCnt[0] = suitCnt[1] = suitCnt[2] = suitCnt[3] = 0;
  suitMask[0] = suitMask[1] = suitMask[2] = suitMask[3] = 0;
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2,
      s = c & 3;
    counts[r]++;
    suitCnt[s]++;
    suitMask[s] |= 1 << r;
    mask |= 1 << r;
  }
  for (let s = 0; s < 4; s++)
    if (suitCnt[s] >= 5) {
      const sf = straightTop(suitMask[s]);
      if (sf >= 0) return (8 << 20) | (sf << 16);
      return (5 << 20) | topRanks(suitMask[s], 5);
    }
  let quad = -1,
    trips = -1,
    trips2 = -1,
    p1 = -1,
    p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const c = counts[r];
    if (c === 4) quad = r;
    else if (c === 3) {
      if (trips < 0) trips = r;
      else if (trips2 < 0) trips2 = r;
    } else if (c === 2) {
      if (p1 < 0) p1 = r;
      else if (p2 < 0) p2 = r;
    }
  }
  if (quad >= 0) return (7 << 20) | (quad << 16) | (topRanks(mask & ~(1 << quad), 1) >> 4);
  if (trips >= 0 && (trips2 >= 0 || p1 >= 0)) return (6 << 20) | (trips << 16) | (Math.max(trips2, p1) << 12);
  const st = straightTop(mask);
  if (st >= 0) return (4 << 20) | (st << 16);
  if (trips >= 0) return (3 << 20) | (trips << 16) | (topRanks(mask & ~(1 << trips), 2) >> 4);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (topRanks(mask & ~(1 << p1) & ~(1 << p2), 1) >> 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | (topRanks(mask & ~(1 << p1), 3) >> 4);
  return topRanks(mask, 5);
}

export const category = (score: number) => score >> 20;
/** The i-th rank (0 = the first) packed in a score. */
export const rankAt = (score: number, i: number) => (score >> (16 - 4 * i)) & 15;

export const CAT_EN = ["High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"] as const;
export const CAT_ZH = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"] as const;

const NAME_EN = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
const PLURAL_EN = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];
const NAME_ZH = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** The banner word ("ROYAL FLUSH" for the ace-high straight flush). */
export function catName(score: number): { en: string; zh: string } {
  const c = category(score);
  if (c === 8 && rankAt(score, 0) === 12) return { en: "Royal Flush", zh: "皇家同花顺" };
  return { en: CAT_EN[c], zh: CAT_ZH[c] };
}

/** A full description: "Full House, Kings full of Sevens" / "葫芦，K 带 7". */
export function describe(score: number): { en: string; zh: string } {
  const c = category(score);
  const r0 = rankAt(score, 0),
    r1 = rankAt(score, 1);
  switch (c) {
    case 8:
      return r0 === 12 ? { en: "Royal Flush", zh: "皇家同花顺" } : { en: `Straight Flush, ${NAME_EN[r0]} high`, zh: `同花顺，${NAME_ZH[r0]} 大` };
    case 7:
      return { en: `Four of a Kind, ${PLURAL_EN[r0]}`, zh: `四条 ${NAME_ZH[r0]}` };
    case 6:
      return { en: `Full House, ${PLURAL_EN[r0]} full of ${PLURAL_EN[r1]}`, zh: `葫芦，${NAME_ZH[r0]} 带 ${NAME_ZH[r1]}` };
    case 5:
      return { en: `Flush, ${NAME_EN[r0]} high`, zh: `同花，${NAME_ZH[r0]} 大` };
    case 4:
      return r0 === 3 ? { en: "Straight, Five high (the wheel)", zh: "顺子，5 大（A-2-3-4-5）" } : { en: `Straight, ${NAME_EN[r0]} high`, zh: `顺子，${NAME_ZH[r0]} 大` };
    case 3:
      return { en: `Three of a Kind, ${PLURAL_EN[r0]}`, zh: `三条 ${NAME_ZH[r0]}` };
    case 2:
      return { en: `Two Pair, ${PLURAL_EN[r0]} and ${PLURAL_EN[r1]}`, zh: `两对，${NAME_ZH[r0]} 和 ${NAME_ZH[r1]}` };
    case 1:
      return { en: `Pair of ${PLURAL_EN[r0]}`, zh: `一对 ${NAME_ZH[r0]}` };
    default:
      return { en: `${NAME_EN[r0]} High`, zh: `${NAME_ZH[r0]} 高牌` };
  }
}

/** The five cards that make the best hand (for the showdown's highlight), in no special order. */
export function bestFive(cards: number[]): number[] {
  if (cards.length <= 5) return cards.slice();
  const target = evaluate(cards);
  const n = cards.length;
  const pick: number[] = [0, 0, 0, 0, 0];
  // every 5 of n (21 at most): the first that scores the same, preferring the higher cards
  const sorted = cards.slice().sort((a, b) => b - a);
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            pick[0] = sorted[a];
            pick[1] = sorted[b];
            pick[2] = sorted[c];
            pick[3] = sorted[d];
            pick[4] = sorted[e];
            if (evaluate(pick, 5) === target) return pick.slice();
          }
  return sorted.slice(0, 5);
}

/** "AKs", "QJo", "77": a starting hand's class. */
export function startClass(a: number, b: number) {
  const ra = a >> 2,
    rb = b >> 2;
  const hi = Math.max(ra, rb),
    lo = Math.min(ra, rb);
  if (hi === lo) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + ((a & 3) === (b & 3) ? "s" : "o");
}
