/**
 * ORCHARD HOLD'EM's deck: 52 cards as small integers (rank << 2 | suit), the four ZStreet suits, and a
 * seeded shuffle. Pure (no DOM): the engine, the AI and the Node tests all use it.
 *
 * The suits are the city's four inks: Sparks (flare), Shields (lilac), Proofs (glacier) and
 * Blocks (sage). Their letters (s q l b) are the old keys, kept for the tests and logs. Ranks run 0 (a two) … 12 (an ace).
 */

export const RANKS = "23456789TJQKA";
/** Short suit letters for logs and tests: Sparks, Shields (q), Proofs (l), Blocks. */
export const SUIT_KEYS = ["s", "q", "l", "b"] as const;
export const SUIT_EN = ["Sparks", "Shields", "Proofs", "Blocks"] as const;
export const SUIT_ZH = ["火花", "盾牌", "证明", "区块"] as const;
/** The suits' inks (on the dark felt) and their deep print colours (on the card's paper). */
export const SUIT_INK = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a"] as const;
export const SUIT_PRINT = ["#e4531d", "#7656e0", "#1f86ad", "#2c9257"] as const;

export const rankOf = (c: number) => c >> 2;
export const suitOf = (c: number) => c & 3;
export const card = (rank: number, suit: number) => (rank << 2) | suit;

/** "As" style: rank letter + suit letter (s q l b, or the classic s h d c in tests). */
export function cardStr(c: number) {
  return RANKS[c >> 2] + SUIT_KEYS[c & 3];
}

/** Parses "As Kq Tl 2b" (also the classic s h d c letters: s→Sparks, h→Shields, d→Proofs, c→Blocks). */
export function parseCards(s: string): number[] {
  const out: number[] = [];
  for (const tok of s.trim().split(/\s+/)) {
    if (!tok) continue;
    const r = RANKS.indexOf(tok[0].toUpperCase());
    const k = tok[1].toLowerCase();
    const su = "sqlb".indexOf(k) >= 0 ? "sqlb".indexOf(k) : "shdc".indexOf(k);
    if (r < 0 || su < 0) throw new Error("bad card " + tok);
    out.push(card(r, su));
  }
  return out;
}

/** mulberry32: a seed in, a repeatable stream in [0, 1) out. */
export function mulberry(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rnd = () => number;

/** Mixes two numbers into one seed (a hand's deck from the table's seed and the hand number). */
export function mix(a: number, b: number) {
  let h = Math.imul((a ^ 0x5bd1e995) >>> 0, 0x9e3779b1) ^ Math.imul((b + 0x7f4a7c15) >>> 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** A fresh deck, Fisher–Yates shuffled by `rnd`. */
export function shuffledDeck(rnd: Rnd): number[] {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  return d;
}
