/**
 * One hand of No-Limit Hold'em, as a pure state machine (no DOM, no timers): blinds and antes, the
 * four betting rounds with the no-limit minimum-raise rule (a short all-in does not reopen the
 * betting), uncalled bets returned, side pots, showdown order, muck or show, split pots with the odd
 * chip going to the first winner left of the button.
 *
 * The table drives it: while `phase` is "bet" the seat `toAct` owes an `act()`; while it is "deal"
 * the dealer owes a `step()` (collect the bets, lay out the next street, table the hands of an
 * all-in, the showdown). Each call returns the events it made, for the table to animate and log.
 */
import { evaluate } from "./eval";

export type ActKind = "fold" | "check" | "call" | "raise";
/** `raise` covers a bet, a raise and an all-in: `to` is the seat's total bet for the street. */
export interface Action {
  kind: ActKind;
  to?: number;
}
/** What an action was, as said at the table. */
export type Said = "fold" | "check" | "call" | "bet" | "raise";

export interface HP {
  seat: number;
  /** Dealt into this hand (had chips). */
  inHand: boolean;
  /** Chips behind. */
  stack: number;
  /** Put in on this street. */
  bet: number;
  /** Put in during the whole hand (antes and blinds too). */
  total: number;
  hole: number[];
  folded: boolean;
  allIn: boolean;
  /** Has acted by choice on this street (blinds don't count). */
  acted: boolean;
  /** The street's bet level when this seat last acted (for the reopening rule). */
  facedAt: number;
  shown: boolean;
  mucked: boolean;
}

export interface Pot {
  amount: number;
  /** Seats that can win it. */
  eligible: number[];
}

export interface Legal {
  seat: number;
  /** Chips to put in to call (already capped by the stack). */
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  /** The smallest legal bet or raise, as a street total (the all-in when that is less). */
  minTo: number;
  /** The all-in, as a street total. */
  maxTo: number;
  currentBet: number;
  /** Nothing bet yet on this street: a bet, not a raise. */
  isBet: boolean;
}

/** A public line of the hand's history. */
export interface Line {
  street: number;
  seat: number;
  said: Said | "sb" | "bb" | "ante";
  /** Chips put in by this action. */
  add: number;
  /** The seat's street total after it. */
  to: number;
  allIn: boolean;
}

export type Ev =
  | { t: "post"; seat: number; kind: "sb" | "bb" | "ante"; amount: number; allIn: boolean }
  | { t: "deal"; order: number[] }
  | { t: "act"; seat: number; said: Said; add: number; to: number; allIn: boolean }
  | { t: "return"; seat: number; amount: number }
  | { t: "collect"; pot: number; pots: Pot[] }
  | { t: "board"; street: number; cards: number[] }
  | { t: "expose"; seats: number[] }
  | { t: "show"; seat: number; cards: number[]; score: number }
  | { t: "muck"; seat: number }
  | { t: "award"; index: number; amount: number; shares: { seat: number; amount: number }[]; score: number }
  | { t: "end" };

export interface HandConfig {
  /** Every seat's stack at the start of the hand; 0 sits it out. */
  stacks: number[];
  button: number;
  sb: number;
  bb: number;
  ante?: number;
  /** A shuffled deck (52 cards). */
  deck: number[];
}

export class Hand {
  readonly n: number;
  readonly players: HP[];
  readonly button: number;
  readonly sbSeat: number;
  readonly bbSeat: number;
  readonly sb: number;
  readonly bb: number;
  readonly ante: number;
  private deck: number[];
  private di = 0;
  board: number[] = [];
  /** 0 preflop, 1 flop, 2 turn, 3 river. */
  street = 0;
  phase: "bet" | "deal" | "done" = "bet";
  toAct = -1;
  currentBet = 0;
  /** The last full bet or raise (the minimum raise increment). */
  lastRaise = 0;
  /** Chips collected in the middle (not counting this street's bets). */
  pot = 0;
  /** All hands tabled (an all-in with nobody left to bet). */
  exposed = false;
  /** The last to bet or raise on the current street (-1: none). */
  aggressor = -1;
  preflopRaiser = -1;
  readonly lines: Line[] = [];
  /** What each seat took from the pots. */
  readonly won: number[];
  /** Each seat's best score at the showdown (-1 when not shown). */
  readonly scores: number[];
  private pending: boolean[];
  private evs: Ev[] = [];
  /** At the showdown, a seat that may muck: show anyway? (default: muck) */
  showPolicy: ((seat: number) => boolean) | null = null;
  /** Everyone folded to this seat: does it show? (default: no) */
  showUncontested: ((seat: number) => boolean) | null = null;

  constructor(cfg: HandConfig) {
    this.n = cfg.stacks.length;
    this.sb = cfg.sb;
    this.bb = cfg.bb;
    this.ante = cfg.ante ?? 0;
    this.deck = cfg.deck.slice();
    this.players = cfg.stacks.map((s, seat) => ({ seat, inHand: s > 0, stack: s, bet: 0, total: 0, hole: [], folded: s <= 0, allIn: false, acted: false, facedAt: 0, shown: false, mucked: false }));
    this.won = new Array(this.n).fill(0);
    this.scores = new Array(this.n).fill(-1);
    this.pending = new Array(this.n).fill(false);
    const active = this.players.filter((p) => p.inHand).length;
    if (active < 2) throw new Error("a hand needs two players");
    if (!this.players[cfg.button].inHand) throw new Error("the button must be dealt in");
    this.button = cfg.button;
    // heads-up: the button posts the small blind and acts first before the flop
    this.sbSeat = active === 2 ? this.button : this.next(this.button, (p) => p.inHand);
    this.bbSeat = this.next(this.sbSeat, (p) => p.inHand);
    if (this.ante > 0)
      for (const p of this.players)
        if (p.inHand) {
          const a = Math.min(this.ante, p.stack);
          p.stack -= a;
          p.total += a;
          this.pot += a;
          if (p.stack === 0) p.allIn = true;
          this.lines.push({ street: 0, seat: p.seat, said: "ante", add: a, to: 0, allIn: p.allIn });
          this.evs.push({ t: "post", seat: p.seat, kind: "ante", amount: a, allIn: p.allIn });
        }
    this.post(this.sbSeat, this.sb, "sb");
    this.post(this.bbSeat, this.bb, "bb");
    // short blinds still make the full big blind the price to play
    this.currentBet = this.bb;
    this.lastRaise = this.bb;
    // the hole cards: one at a time, twice round, from the small blind
    const order: number[] = [];
    for (let s = this.sbSeat, k = 0; k < active; k++, s = this.next(s, (p) => p.inHand)) order.push(s);
    for (let round = 0; round < 2; round++) for (const s of order) this.players[s].hole.push(this.draw());
    this.evs.push({ t: "deal", order });
    for (const p of this.players) this.pending[p.seat] = this.canAct(p);
    this.toAct = this.next(this.bbSeat, (p) => this.owes(p));
    if (this.toAct < 0) this.endRound();
  }

  // ---- queries -----------------------------------------------------------------------------

  /** In the hand, not folded, not all-in: can still bet. */
  canAct(p: HP) {
    return p.inHand && !p.folded && !p.allIn;
  }
  /** Not folded (all-in included). */
  live() {
    return this.players.filter((p) => p.inHand && !p.folded);
  }
  /** The next seat after `from` (clockwise) matching `pred`, or -1. */
  next(from: number, pred: (p: HP) => boolean) {
    for (let k = 1; k <= this.n; k++) {
      const s = (from + k) % this.n;
      if (pred(this.players[s])) return s;
    }
    return -1;
  }
  /** Everything in the middle, this street's bets included. */
  potTotal() {
    let t = this.pot;
    for (const p of this.players) t += p.bet;
    return t;
  }
  /** What the seat to act may do. */
  legal(): Legal {
    const p = this.players[this.toAct];
    const toCall = Math.max(0, Math.min(this.currentBet - p.bet, p.stack));
    const maxTo = p.bet + p.stack;
    // a raise needs chips past the call, someone left to raise against, and the betting open to this
    // seat (it has not acted yet, or it faces at least a full raise since it last did)
    const others = this.players.some((q) => q !== p && this.canAct(q));
    const reopened = !p.acted || this.currentBet - p.facedAt >= this.lastRaise;
    const canRaise = maxTo > this.currentBet && reopened && others;
    const minTo = Math.min(maxTo, this.currentBet === 0 ? Math.max(this.bb, 1) : this.currentBet + this.lastRaise);
    return { seat: p.seat, toCall, canCheck: this.currentBet - p.bet <= 0, canRaise, minTo, maxTo, currentBet: this.currentBet, isBet: this.currentBet === 0 };
  }
  /** The pots as they stand (main first), from every seat's total. */
  pots(): Pot[] {
    const live = this.live();
    const levels = [...new Set(live.map((p) => p.total))].filter((v) => v > 0).sort((a, b) => a - b);
    const out: Pot[] = [];
    let prev = 0;
    for (const L of levels) {
      let amount = 0;
      for (const p of this.players) amount += Math.min(p.total, L) - Math.min(p.total, prev);
      const eligible = live.filter((p) => p.total >= L).map((p) => p.seat);
      if (amount > 0) out.push({ amount, eligible });
      prev = L;
    }
    // dead money above every live seat's total (can only follow a fold after a bigger bet)
    let extra = 0;
    for (const p of this.players) extra += Math.max(0, p.total - prev);
    if (extra > 0) {
      if (out.length) out[out.length - 1].amount += extra;
      else out.push({ amount: extra, eligible: live.map((p) => p.seat) });
    }
    return out;
  }
  /** Events since the last call. */
  drain(): Ev[] {
    const e = this.evs;
    this.evs = [];
    return e;
  }

  // ---- the players' actions ----------------------------------------------------------------

  act(a: Action): Ev[] {
    if (this.phase !== "bet" || this.toAct < 0) throw new Error("no one is to act");
    const p = this.players[this.toAct];
    const L = this.legal();
    const before = this.currentBet;
    let said: Said;
    let add = 0;
    if (a.kind === "fold") {
      p.folded = true;
      said = "fold";
    } else if (a.kind === "check" || (a.kind === "call" && L.toCall === 0)) {
      if (!L.canCheck) throw new Error("cannot check facing a bet");
      said = "check";
    } else if (a.kind === "call" || !L.canRaise) {
      // (a raise that is not allowed becomes a call, or a check when there is nothing to call)
      add = L.toCall;
      said = add > 0 ? "call" : "check";
    } else {
      // a bet or a raise: clamped into [minTo, maxTo] (the all-in when it is short)
      const to = Math.round(Math.max(L.minTo, Math.min(L.maxTo, a.to ?? L.minTo)));
      add = to - p.bet;
      said = before === 0 ? "bet" : "raise";
      const inc = to - before;
      if (inc >= this.lastRaise) this.lastRaise = inc;
      this.currentBet = to;
      this.aggressor = p.seat;
      if (this.street === 0) this.preflopRaiser = p.seat;
      // everyone else still able to bet owes an answer
      for (const q of this.players) if (q !== p && this.canAct(q)) this.pending[q.seat] = true;
    }
    if (add > 0) {
      p.stack -= add;
      p.bet += add;
      p.total += add;
      if (p.stack === 0) p.allIn = true;
    }
    p.acted = true;
    p.facedAt = this.currentBet;
    this.pending[p.seat] = false;
    this.lines.push({ street: this.street, seat: p.seat, said, add, to: p.bet, allIn: p.allIn });
    this.evs.push({ t: "act", seat: p.seat, said, add, to: p.bet, allIn: p.allIn });
    if (this.live().length <= 1 || !this.needsAction()) this.endRound();
    else this.toAct = this.next(p.seat, (q) => this.owes(q));
    return this.drain();
  }

  /** The seat still owes an action this round (a seat alone with chips that has matched the bet does not). */
  private owes(q: HP) {
    if (!this.canAct(q) || !this.pending[q.seat]) return false;
    return q.bet < this.currentBet || this.players.some((o) => o !== q && this.canAct(o));
  }
  private needsAction() {
    return this.players.some((q) => this.owes(q));
  }
  private endRound() {
    this.toAct = -1;
    this.phase = "deal";
  }

  // ---- the dealer --------------------------------------------------------------------------

  /** The dealer's next move. */
  step(): Ev[] {
    if (this.phase !== "deal") throw new Error("the dealer has nothing to do");
    if (this.players.some((p) => p.bet > 0)) {
      this.collect();
      return this.drain();
    }
    const live = this.live();
    if (live.length === 1) {
      const w = live[0];
      const amount = this.pot;
      w.stack += amount;
      this.won[w.seat] += amount;
      if (this.showUncontested?.(w.seat)) {
        w.shown = true;
        this.evs.push({ t: "show", seat: w.seat, cards: w.hole.slice(), score: -1 });
      }
      this.evs.push({ t: "award", index: 0, amount, shares: [{ seat: w.seat, amount }], score: -1 });
      this.finish();
      return this.drain();
    }
    if (this.street === 3) {
      this.showdown();
      return this.drain();
    }
    const able = this.players.filter((p) => this.canAct(p)).length;
    if (able < 2 && !this.exposed) {
      this.exposed = true;
      for (const p of live) p.shown = true;
      this.evs.push({ t: "expose", seats: live.map((p) => p.seat) });
      return this.drain();
    }
    this.draw(); // the burn
    const cards = this.street === 0 ? [this.draw(), this.draw(), this.draw()] : [this.draw()];
    this.board.push(...cards);
    this.street++;
    this.evs.push({ t: "board", street: this.street, cards });
    if (able >= 2) {
      this.currentBet = 0;
      this.lastRaise = this.bb;
      this.aggressor = -1;
      for (const p of this.players) {
        p.acted = false;
        p.facedAt = 0;
        this.pending[p.seat] = this.canAct(p);
      }
      this.phase = "bet";
      this.toAct = this.next(this.button, (p) => this.owes(p));
    }
    return this.drain();
  }

  /** Bets into the middle; the part nobody called goes back first. */
  private collect() {
    let top = -1;
    for (const p of this.players) if (top < 0 || p.bet > this.players[top].bet) top = p.seat;
    const t = this.players[top];
    let second = 0;
    for (const p of this.players) if (p !== t) second = Math.max(second, p.bet);
    if (!t.folded && t.bet > second) {
      const back = t.bet - second;
      t.bet -= back;
      t.total -= back;
      t.stack += back;
      if (t.stack > 0) t.allIn = false;
      this.evs.push({ t: "return", seat: t.seat, amount: back });
    }
    for (const p of this.players) {
      this.pot += p.bet;
      p.bet = 0;
    }
    this.evs.push({ t: "collect", pot: this.pot, pots: this.pots() });
  }

  /** The showdown's pots, their winners, and who shows first (from all the cards: the dealer's view). */
  private plan() {
    const live = this.live();
    for (const p of live) this.scores[p.seat] = evaluate([...p.hole, ...this.board]);
    const pots = this.pots();
    const winners = pots.map((pot) => {
      let best = -1;
      for (const s of pot.eligible) best = Math.max(best, this.scores[s]);
      return pot.eligible.filter((s) => this.scores[s] === best);
    });
    // the last to bet on the river shows first; otherwise the first seat left of the button
    const first = this.aggressor >= 0 && !this.players[this.aggressor].folded ? this.aggressor : this.next(this.button, (p) => p.inHand && !p.folded);
    return { pots, winners, first };
  }

  /** Coming to a showdown (the river's bets collected): this seat has to show (first to, or wins a pot). */
  mustShow(seat: number) {
    if (this.phase !== "deal" || this.street !== 3 || this.live().length < 2 || this.players.some((p) => p.bet > 0)) return true;
    const p = this.players[seat];
    if (!p.inHand || p.folded) return false;
    if (p.shown) return true;
    const { winners, first } = this.plan();
    return seat === first || winners.some((w) => w.includes(seat));
  }

  private showdown() {
    const { pots, winners, first } = this.plan();
    const wins = (seat: number) => winners.some((w) => w.includes(seat));
    const order: number[] = [];
    for (let s = first, k = 0; k < this.n; k++, s = (s + 1) % this.n) if (this.players[s].inHand && !this.players[s].folded) order.push(s);
    for (const s of order) {
      const p = this.players[s];
      if (p.shown || s === first || wins(s) || this.showPolicy?.(s)) {
        p.shown = true;
        this.evs.push({ t: "show", seat: s, cards: p.hole.slice(), score: this.scores[s] });
      } else {
        p.mucked = true;
        this.evs.push({ t: "muck", seat: s });
      }
    }
    // each pot to its winners; odd chips one by one from the button's left
    pots.forEach((pot, index) => {
      const w = winners[index].slice().sort((a, b) => this.fromButton(a) - this.fromButton(b));
      const share = Math.floor(pot.amount / w.length);
      let rem = pot.amount - share * w.length;
      const shares = w.map((seat) => {
        const amount = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        this.players[seat].stack += amount;
        this.won[seat] += amount;
        return { seat, amount };
      });
      this.evs.push({ t: "award", index, amount: pot.amount, shares, score: this.scores[w[0]] });
    });
    this.finish();
  }

  /** 1 for the seat left of the button … n for the button itself. */
  fromButton(seat: number) {
    return ((seat - this.button + this.n - 1) % this.n) + 1;
  }

  private finish() {
    this.pot = 0;
    this.phase = "done";
    this.toAct = -1;
    this.evs.push({ t: "end" });
  }

  private post(seat: number, amount: number, kind: "sb" | "bb") {
    const p = this.players[seat];
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.bet += a;
    p.total += a;
    if (p.stack === 0) p.allIn = true;
    this.lines.push({ street: 0, seat, said: kind, add: a, to: p.bet, allIn: p.allIn });
    this.evs.push({ t: "post", seat, kind, amount: a, allIn: p.allIn });
  }

  private draw() {
    if (this.di >= this.deck.length) throw new Error("the deck ran out");
    return this.deck[this.di++];
  }

  // ---- what a seat may know ----------------------------------------------------------------

  /** Everything public, plus this seat's own cards: all an AI ever gets to see. */
  view(seat: number): SeatView {
    return {
      me: seat,
      hole: this.players[seat].hole.slice(),
      board: this.board.slice(),
      street: this.street,
      button: this.button,
      sb: this.sb,
      bb: this.bb,
      pot: this.potTotal(),
      currentBet: this.currentBet,
      preflopRaiser: this.preflopRaiser,
      bbSeatIs: this.bbSeat,
      players: this.players.map((p) => ({ seat: p.seat, inHand: p.inHand, stack: p.stack, bet: p.bet, total: p.total, folded: p.folded, allIn: p.allIn })),
      lines: this.lines.map((l) => ({ ...l })),
      legal: this.toAct === seat ? this.legal() : null,
    };
  }
}

export interface SeatView {
  me: number;
  hole: number[];
  board: number[];
  street: number;
  button: number;
  sb: number;
  bb: number;
  pot: number;
  currentBet: number;
  preflopRaiser: number;
  /** The big blind's seat. */
  bbSeatIs: number;
  players: { seat: number; inHand: boolean; stack: number; bet: number; total: number; folded: boolean; allIn: boolean }[];
  lines: Line[];
  /** Set when it is this seat's turn. */
  legal: Legal | null;
}
