/**
 * LAST SNARK's rules, with no DOM: a shedding game of four inks, the pools (IRONWOOD, SAPLING,
 * ORCHARD, SPROUT). Match the pool or the symbol on the discard, shed your hand, and call "LAST SNARK!" on your last
 * card or a rival catches you (+2). The UI (ui.ts) and the Node tests drive the same `Game`: every
 * action returns the events it caused, in order, for the table to animate.
 *
 * Imports keep their `.ts` so the engine runs as is in Node (`--experimental-strip-types`).
 */

export type Kind = "num" | "skip" | "reorg" | "fees" | "fork" | "shor" | "makers";
export interface Card {
  id: number;
  /** 0 IRONWOOD, 1 SAPLING, 2 ORCHARD, 3 SPROUT; -1 for the wilds (FORK, DUST ATTACK; kind "shor"). */
  ink: number;
  kind: Kind;
  /** 0…9 for a number, -1 otherwise. */
  n: number;
}

export interface Rules {
  /** Points to win the game; 0 is a quick game of one round. */
  target: number;
  /** +2 on +2, DUST ATTACK on either: the penalty passes on and grows. */
  stacking: boolean;
  /** Drawing goes on until a playable card comes (else one card). */
  drawUntil: boolean;
  /** The four SHIELDED HOUR cards (kind "makers") are in the deck. */
  makers: boolean;
}
export const RULES: Rules = { target: 250, stacking: false, drawUntil: false, makers: true };
export const HAND = 7;

export type Phase = "turn" | "drawn" | "makers" | "roundOver" | "gameOver";

export type Ev =
  | { t: "deal"; seat: number; card: Card }
  | { t: "start"; card: Card }
  | { t: "turn"; seat: number }
  | { t: "play"; seat: number; card: Card; ink: number }
  | { t: "draw"; seat: number; cards: Card[]; why: "turn" | "fees" | "shor" | "catch" | "stack" }
  | { t: "reshuffle"; count: number }
  | { t: "skip"; seat: number }
  | { t: "reorg"; dir: 1 | -1 }
  | { t: "stack"; seat: number; pending: number }
  | { t: "call"; seat: number; late: boolean }
  | { t: "exposed"; seat: number }
  | { t: "caught"; by: number; seat: number }
  | { t: "keep"; seat: number }
  | { t: "makers"; seat: number }
  | { t: "passed"; moves: { from: number; to: number; card: Card }[] }
  | { t: "out"; seat: number }
  | { t: "round"; winner: number; points: number; pts: number[] }
  | { t: "over"; order: number[] };

/** mulberry32: the seed in, a repeatable stream in [0, 1) out. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

/** Per ink: one 0, two of 1…9, two MISSED BLOCK, two REORG, two +2 FEES (and a SHIELDED HOUR); four FORK and four DUST ATTACK. */
export function buildDeck(makers: boolean): Card[] {
  const d: Card[] = [];
  let id = 0;
  for (let ink = 0; ink < 4; ink++) {
    d.push({ id: id++, ink, kind: "num", n: 0 });
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) d.push({ id: id++, ink, kind: "num", n });
    for (const kind of ["skip", "reorg", "fees"] as const) for (let k = 0; k < 2; k++) d.push({ id: id++, ink, kind, n: -1 });
    if (makers) d.push({ id: id++, ink, kind: "makers", n: -1 });
  }
  for (let k = 0; k < 4; k++) d.push({ id: id++, ink: -1, kind: "fork", n: -1 }, { id: id++, ink: -1, kind: "shor", n: -1 });
  return d;
}

export const isWild = (c: Card) => c.ink < 0;
/** What a card left in a hand is worth to the round's winner. */
export const points = (c: Card) => (c.kind === "num" ? c.n : c.ink < 0 ? 50 : 20);
export const handPoints = (h: Card[]) => h.reduce((s, c) => s + points(c), 0);

/** Share of the pot by place (percent), for `n` seats: 50/30/20 at four, scaled to the table. */
export function shares(n: number): number[] {
  if (n <= 2) return [100];
  if (n === 3) return [65, 35];
  if (n <= 5) return [50, 30, 20];
  if (n <= 7) return [45, 28, 17, 10];
  return [40, 26, 17, 11, 6];
}
/** The ⓩ the seat in `place` (0 the winner) takes from a pot of `stake` × n. */
export const payoutFor = (place: number, n: number, stake: number) => Math.round((stake * n * (shares(n)[place] ?? 0)) / 100);

export class Game {
  readonly n: number;
  readonly rules: Rules;
  readonly rnd: () => number;
  hands: Card[][] = [];
  /** The draw pile, its top the last card. */
  pile: Card[] = [];
  /** The discard pile, its top the last card. */
  discard: Card[] = [];
  /** The ink in play (a wild's chosen ink, or the top card's). */
  ink = 0;
  dir: 1 | -1 = 1;
  turn = 0;
  phase: Phase = "roundOver";
  /** Stacked +2/+4 waiting for the player on turn (stacking rule only). */
  pending = 0;
  /** The card just drawn that the player on turn may still play (phase "drawn"). */
  drawn: Card | null = null;
  /** Called LAST SNARK and safe with one card. */
  called: boolean[];
  /** The seat sitting on one card without having called: catchable until the next action. */
  exposed = -1;
  /** SHIELDED HOUR: the card each seat passes on (null: not chosen yet). */
  picks: (Card | null)[] = [];
  private afterMakers = 0;
  scores: number[];
  /** Points left in hand, every round summed: the tie-break (fewer is better). */
  held: number[];
  round = 0;
  dealer: number;
  winner = -1;
  /** Actions taken this round (plays and draws). */
  turns = 0;

  constructor(n: number, rules: Rules, seed: number) {
    this.n = n;
    this.rules = { ...rules };
    this.rnd = mulberry(seed);
    this.called = new Array(n).fill(false);
    this.scores = new Array(n).fill(0);
    this.held = new Array(n).fill(0);
    this.dealer = Math.floor(this.rnd() * n);
  }

  next(from: number, k = 1) {
    return (((from + this.dir * k) % this.n) + this.n) % this.n;
  }
  top(): Card {
    return this.discard[this.discard.length - 1];
  }

  /** Shuffle a fresh deck, deal seven each from the dealer's left, flip a number card to start. */
  startRound(): Ev[] {
    this.round++;
    this.dir = 1;
    this.pending = 0;
    this.drawn = null;
    this.exposed = -1;
    this.called.fill(false);
    this.winner = -1;
    this.turns = 0;
    this.pile = shuffle(buildDeck(this.rules.makers), this.rnd);
    this.discard = [];
    this.hands = Array.from({ length: this.n }, () => []);
    const ev: Ev[] = [];
    const first = this.next(this.dealer);
    for (let r = 0; r < HAND; r++)
      for (let k = 0; k < this.n; k++) {
        const seat = (first + k) % this.n;
        const c = this.pile.pop()!;
        this.hands[seat].push(c);
        ev.push({ t: "deal", seat, card: c });
      }
    // the starter is always a number: anything else goes back into the pile, somewhere below the top
    let c = this.pile.pop()!;
    while (c.kind !== "num") {
      this.pile.splice(Math.floor(this.rnd() * this.pile.length), 0, c);
      c = this.pile.pop()!;
    }
    this.discard.push(c);
    this.ink = c.ink;
    ev.push({ t: "start", card: c });
    this.turn = first;
    this.phase = "turn";
    ev.push({ t: "turn", seat: first });
    return ev;
  }

  /** Does `c` go on the discard now (whoever holds it)? */
  matches(c: Card): boolean {
    const t = this.top();
    if (this.pending > 0) return c.kind === "shor" || (c.kind === "fees" && t.kind === "fees");
    if (c.ink < 0 || c.ink === this.ink) return true;
    return c.kind === t.kind && (c.kind !== "num" || c.n === t.n);
  }
  canPlay(seat: number, c: Card): boolean {
    if (seat !== this.turn) return false;
    if (this.phase === "drawn") return this.drawn?.id === c.id && this.matches(c);
    return this.phase === "turn" && this.matches(c);
  }
  legal(seat: number): Card[] {
    return this.hands[seat].filter((c) => this.canPlay(seat, c));
  }

  /** Play card `id` (a wild needs its `ink`). Returns [] when the move is not allowed. */
  play(seat: number, id: number, ink = -1): Ev[] {
    const hand = this.hands[seat];
    const i = hand.findIndex((c) => c.id === id);
    if (i < 0) return [];
    const c = hand[i];
    if (!this.canPlay(seat, c)) return [];
    if (c.ink < 0 && !(ink >= 0 && ink < 4)) return [];
    const ev: Ev[] = [];
    // the next action closes the catch window
    this.exposed = -1;
    hand.splice(i, 1);
    this.discard.push(c);
    this.ink = c.ink < 0 ? ink : c.ink;
    this.drawn = null;
    this.phase = "turn";
    this.turns++;
    ev.push({ t: "play", seat, card: c, ink: this.ink });
    if (hand.length === 1) {
      if (!this.called[seat]) {
        this.exposed = seat;
        ev.push({ t: "exposed", seat });
      }
    } else this.called[seat] = false;

    if (!hand.length) {
      // the last card still bites: the next player draws what it says (and every stacked card)
      if (c.kind === "fees" || c.kind === "shor") {
        const k = this.pending + (c.kind === "fees" ? 2 : 4);
        this.pending = 0;
        ev.push(...this.give(this.next(seat), k, c.kind));
      }
      this.pending = 0;
      ev.push({ t: "out", seat });
      ev.push(...this.finish(seat));
      return ev;
    }

    switch (c.kind) {
      case "skip": {
        ev.push({ t: "skip", seat: this.next(seat) });
        this.turn = this.next(seat, 2);
        break;
      }
      case "reorg": {
        this.dir = this.dir === 1 ? -1 : 1;
        ev.push({ t: "reorg", dir: this.dir });
        // two at the table: a reorg is a missed block, the same player goes again
        if (this.n === 2) {
          ev.push({ t: "skip", seat: this.next(seat) });
          this.turn = seat;
        } else this.turn = this.next(seat);
        break;
      }
      case "fees":
      case "shor": {
        const k = c.kind === "fees" ? 2 : 4;
        if (this.rules.stacking) {
          this.pending += k;
          this.turn = this.next(seat);
          ev.push({ t: "stack", seat: this.turn, pending: this.pending });
        } else {
          const v = this.next(seat);
          ev.push(...this.give(v, k, c.kind));
          ev.push({ t: "skip", seat: v });
          this.turn = this.next(seat, 2);
        }
        break;
      }
      case "makers": {
        this.phase = "makers";
        this.picks = this.hands.map(() => null);
        this.afterMakers = this.next(seat);
        ev.push({ t: "makers", seat });
        return ev;
      }
      default:
        this.turn = this.next(seat);
    }
    ev.push({ t: "turn", seat: this.turn });
    return ev;
  }

  /** Draw on your turn: the stacked penalty, else one card (or until playable). */
  draw(seat: number): Ev[] {
    if (this.phase !== "turn" || seat !== this.turn) return [];
    this.exposed = -1;
    this.turns++;
    const ev: Ev[] = [];
    if (this.pending > 0) {
      const k = this.pending;
      this.pending = 0;
      ev.push(...this.give(seat, k, "stack"));
      this.turn = this.next(seat);
      ev.push({ t: "turn", seat: this.turn });
      return ev;
    }
    const got: Card[] = [];
    let last: Card | null = null;
    for (;;) {
      const c = this.pull(ev);
      if (!c) break;
      got.push(c);
      last = c;
      if (!this.rules.drawUntil || this.matches(c)) break;
    }
    this.hands[seat].push(...got);
    if (this.hands[seat].length > 1) this.called[seat] = false;
    ev.push({ t: "draw", seat, cards: got, why: "turn" });
    if (last && this.matches(last)) {
      this.phase = "drawn";
      this.drawn = last;
    } else {
      this.turn = this.next(seat);
      ev.push({ t: "turn", seat: this.turn });
    }
    return ev;
  }

  /** Keep the playable card just drawn and end the turn. */
  keep(seat: number): Ev[] {
    if (this.phase !== "drawn" || seat !== this.turn) return [];
    this.phase = "turn";
    this.drawn = null;
    this.turn = this.next(seat);
    return [{ t: "keep", seat }, { t: "turn", seat: this.turn }];
  }

  /** LAST SNARK can be called on your turn with two cards, or any time on one card not yet called. */
  canCall(seat: number): boolean {
    if (this.called[seat] || (this.phase !== "turn" && this.phase !== "drawn" && this.phase !== "makers")) return false;
    const h = this.hands[seat].length;
    if (h === 1) return true;
    return h === 2 && seat === this.turn && this.phase !== "makers";
  }
  call(seat: number): Ev[] {
    if (!this.canCall(seat)) return [];
    this.called[seat] = true;
    const late = this.exposed === seat;
    if (late) this.exposed = -1;
    return [{ t: "call", seat, late }];
  }
  /** A rival points at the exposed seat: it draws two. */
  catchOut(by: number): Ev[] {
    const v = this.exposed;
    if (v < 0 || v === by || this.phase === "roundOver" || this.phase === "gameOver") return [];
    this.exposed = -1;
    return [{ t: "caught", by, seat: v }, ...this.give(v, 2, "catch")];
  }

  /** SHIELDED HOUR: `seat` picks the card it passes; once everyone has, they all move one seat on. */
  makersPick(seat: number, id: number): Ev[] {
    if (this.phase !== "makers" || this.picks[seat] || !this.hands[seat].length) return [];
    const c = this.hands[seat].find((x) => x.id === id);
    if (!c) return [];
    this.picks[seat] = c;
    for (let i = 0; i < this.n; i++) if (this.hands[i].length && !this.picks[i]) return [];
    const moves: { from: number; to: number; card: Card }[] = [];
    for (let i = 0; i < this.n; i++) {
      const p = this.picks[i];
      if (!p) continue;
      this.hands[i].splice(this.hands[i].indexOf(p), 1);
      moves.push({ from: i, to: this.next(i), card: p });
    }
    for (const m of moves) this.hands[m.to].push(m.card);
    this.picks = [];
    this.phase = "turn";
    this.turn = this.afterMakers;
    return [{ t: "passed", moves }, { t: "turn", seat: this.turn }];
  }

  /** Seats, best first: score, then fewest points held over the game, then seat. */
  order(): number[] {
    return Array.from({ length: this.n }, (_, i) => i).sort((a, b) => this.scores[b] - this.scores[a] || this.held[a] - this.held[b] || a - b);
  }

  /** After a round: the next one (the deal passes left). */
  nextRound(): Ev[] {
    if (this.phase !== "roundOver") return [];
    return this.startRound();
  }

  private finish(winner: number): Ev[] {
    const pts = this.hands.map(handPoints);
    let total = 0;
    for (let i = 0; i < this.n; i++) {
      this.held[i] += pts[i];
      if (i !== winner) total += pts[i];
    }
    this.scores[winner] += total;
    this.winner = winner;
    this.exposed = -1;
    this.drawn = null;
    const ev: Ev[] = [{ t: "round", winner, points: total, pts }];
    if (this.rules.target <= 0 || this.scores[winner] >= this.rules.target) {
      this.phase = "gameOver";
      ev.push({ t: "over", order: this.order() });
    } else {
      this.phase = "roundOver";
      this.dealer = (this.dealer + 1) % this.n;
    }
    return ev;
  }

  private give(seat: number, k: number, why: "turn" | "fees" | "shor" | "catch" | "stack"): Ev[] {
    const ev: Ev[] = [];
    const got: Card[] = [];
    for (let i = 0; i < k; i++) {
      const c = this.pull(ev);
      if (!c) break;
      got.push(c);
    }
    this.hands[seat].push(...got);
    if (this.hands[seat].length > 1) {
      this.called[seat] = false;
      if (this.exposed === seat) this.exposed = -1;
    }
    ev.push({ t: "draw", seat, cards: got, why });
    return ev;
  }

  /** One card off the pile; an empty pile takes the discard back (all but its top), shuffled. */
  private pull(ev: Ev[]): Card | null {
    if (!this.pile.length && this.discard.length > 1) {
      const top = this.discard.pop()!;
      this.pile = shuffle(this.discard, this.rnd);
      this.discard = [top];
      ev.push({ t: "reshuffle", count: this.pile.length });
    }
    return this.pile.pop() ?? null;
  }
}
