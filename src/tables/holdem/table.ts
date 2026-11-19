/**
 * A session at the Orchard Room's table, hand after hand: the button, the blinds, the formats.
 *
 * - Cash table: your buy-in is your stack (50 big blinds); the zkSNARKs sit with stacks of the same
 *   stakes and rebuy when they bust. You leave between hands with what is in front of you.
 * - Sit & Go: everyone buys in for the same, 1,500 tournament chips each, the blinds go up every
 *   few hands, the last one standing wins. The prize pool (every buy-in) pays 65 / 35, or
 *   50 / 30 / 20 with six seats or more.
 *
 * Pure: the Node sims run it with AIs in every seat.
 */
import { mix, mulberry, shuffledDeck, type Rnd } from "./cards";
import { Hand } from "./engine";
import { Reads, decide, styleOf, type Persona, type Style } from "./ai";

export type Format = "cash" | "sng" | "turbo";

/** The Sit & Go's blinds, level by level. */
export const LEVELS: [number, number][] = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800],
  [600, 1200], [800, 1600], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [5000, 10000], [8000, 16000],
];
export const SNG_STACK = 1500;
/** Hands per blind level. */
export const HANDS_PER_LEVEL: Record<Format, number> = { cash: 0, sng: 8, turbo: 4 };

/** The prize shares of a Sit & Go with n seats. */
export const shares = (n: number) => (n >= 6 ? [0.5, 0.3, 0.2] : [0.65, 0.35]);
/** The prizes in ⓩ (rounded down; what is left over goes to the winner). */
export function prizes(n: number, stake: number) {
  const pool = stake * n;
  const p = shares(n).map((s) => Math.floor(pool * s));
  p[0] += pool - p.reduce((a, b) => a + b, 0);
  return p;
}
/** The cash table's blinds for a buy-in (50 big blinds; a free table plays 1/2 with 200). */
export function cashBlinds(stake: number) {
  const sb = Math.max(1, Math.round(stake / 100));
  return { sb, bb: sb * 2, buyin: stake > 0 ? stake : 200 };
}

export interface TSeat {
  seat: number;
  stack: number;
  /** Cash: everything bought in (the first buy-in and the rebuys). */
  bought: number;
  rebuys: number;
  /** Sit & Go: out of chips. */
  out: boolean;
  /** Sit & Go: the finishing place (1 = the winner), 0 while still in. */
  place: number;
  /** The AI's character (the human's too, for the bench's auto mode). */
  persona: Persona;
}

export interface AfterHand {
  /** Seats that lost their last chip this hand. */
  busted: number[];
  /** Cash: AIs that bought back in, and for how much. */
  rebuys: { seat: number; amount: number }[];
  /** The blinds just went up (Sit & Go). */
  levelUp: boolean;
  /** The session is over (the Sit & Go has a winner, or the human busted at the cash table). */
  over: boolean;
}

export class Table {
  readonly format: Format;
  readonly n: number;
  readonly stake: number;
  readonly seed: number;
  readonly seats: TSeat[];
  readonly reads: Reads;
  readonly aiRnd: Rnd;
  button = -1;
  handNo = 0;
  level = 0;
  hand: Hand | null = null;
  /** Sit & Go: seats in the order they went out. */
  readonly outOrder: number[] = [];
  private handStart: number[] = [];

  constructor(o: { format: Format; n: number; stake: number; seed: number; personas: Persona[] }) {
    this.format = o.format;
    this.n = o.n;
    this.stake = o.stake;
    this.seed = o.seed >>> 0;
    this.reads = new Reads(o.n);
    this.aiRnd = mulberry(mix(this.seed, 0xa1));
    const r = mulberry(mix(this.seed, 0xb7));
    const cb = cashBlinds(o.stake);
    this.seats = o.personas.map((persona, seat) => {
      let stack = SNG_STACK;
      if (o.format === "cash") {
        // the human sits with the buy-in; the snarks with stacks of the same stakes (40…100 big blinds), by style
        stack = seat === 0 ? cb.buyin : Math.round((cb.buyin * CASH_DEPTH[persona.style] * (0.85 + 0.3 * r())) / cb.bb) * cb.bb;
      }
      return { seat, stack, bought: stack, rebuys: 0, out: false, place: 0, persona };
    });
    this.button = Math.floor(r() * o.n);
  }

  /** The blinds now. */
  blinds() {
    if (this.format === "cash") {
      const cb = cashBlinds(this.stake);
      return { sb: cb.sb, bb: cb.bb, ante: 0 };
    }
    const [sb, bb] = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    return { sb, bb, ante: 0 };
  }
  /** Hands left at this level (Sit & Go). */
  handsToNextLevel() {
    const k = HANDS_PER_LEVEL[this.format];
    // (counting the hand being played, if any)
    const played = this.hand ? this.handNo - 1 : this.handNo;
    return k ? k - (played % k) : 0;
  }
  /** Seats still with chips. */
  alive() {
    return this.seats.filter((s) => !s.out && s.stack > 0);
  }

  /** Deals the next hand. */
  newHand(): Hand {
    const live = (i: number) => !this.seats[i].out && this.seats[i].stack > 0;
    let b = this.button;
    for (let k = 1; k <= this.n; k++)
      if (live((b + k) % this.n)) {
        b = (b + k) % this.n;
        break;
      }
    this.button = b;
    this.handNo++;
    const { sb, bb, ante } = this.blinds();
    this.handStart = this.seats.map((s) => (live(s.seat) ? s.stack : 0));
    const deck = shuffledDeck(mulberry(mix(this.seed, this.handNo)));
    this.hand = new Hand({ stacks: this.handStart.slice(), button: b, sb, bb, ante, deck });
    return this.hand;
  }

  /** After a hand: stacks back to the seats, eliminations, rebuys, the blinds. */
  finishHand(): AfterHand {
    const h = this.hand!;
    const dealt = h.players.filter((p) => p.inHand).map((p) => p.seat);
    for (const p of h.players) if (p.inHand) this.seats[p.seat].stack = p.stack;
    this.reads.learn(h.lines, dealt);
    const busted = dealt.filter((s) => this.seats[s].stack <= 0);
    const rebuys: { seat: number; amount: number }[] = [];
    let over = false;
    if (this.format === "cash") {
      for (const s of busted) {
        if (s === 0) over = true;
        else {
          const amount = cashBlinds(this.stake).buyin;
          const seat = this.seats[s];
          seat.stack = amount;
          seat.bought += amount;
          seat.rebuys++;
          rebuys.push({ seat: s, amount });
        }
      }
    } else {
      // out together: the one who started the hand with more chips places higher
      busted.sort((a, b) => this.handStart[a] - this.handStart[b]);
      for (const s of busted) {
        this.seats[s].out = true;
        this.outOrder.push(s);
      }
      const left = this.alive();
      for (const s of busted) this.seats[s].place = this.n - this.outOrder.indexOf(s);
      if (left.length === 1) {
        left[0].place = 1;
        over = true;
      }
    }
    let levelUp = false;
    const k = HANDS_PER_LEVEL[this.format];
    if (k && !over && this.handNo % k === 0 && this.level < LEVELS.length - 1) {
      this.level++;
      levelUp = true;
    }
    this.hand = null;
    return { busted, rebuys, levelUp, over };
  }

  /** The finishing order, winner first (Sit & Go: by place; cash: by what each won or lost). */
  order(): number[] {
    if (this.format !== "cash") {
      const left = this.alive().sort((a, b) => b.stack - a.stack).map((s) => s.seat);
      return [...left, ...this.outOrder.slice().reverse()];
    }
    return this.seats
      .slice()
      .sort((a, b) => b.stack - b.bought - (a.stack - a.bought) || a.seat - b.seat)
      .map((s) => s.seat);
  }

  /** What the human takes home (ⓩ). */
  payout(): number {
    if (this.stake <= 0) return 0;
    if (this.format === "cash") return Math.max(0, this.seats[0].stack);
    const place = this.seats[0].place;
    const p = prizes(this.n, this.stake);
    return place >= 1 && place <= p.length ? p[place - 1] : 0;
  }

  /** The AI's decision for the seat to act (from what that seat may see). */
  decide(iters?: number) {
    const h = this.hand!;
    const seat = h.toAct;
    return decide(h.view(seat), this.seats[seat].persona, this.reads, this.aiRnd, iters);
  }

  /** Plays one whole hand with AIs everywhere, instantly (a sim, or the end of a Sit & Go you left). */
  playHandInstantly(iters = 90): AfterHand {
    const h = this.newHand();
    let guard = 0;
    while (h.phase !== "done") {
      if (++guard > 400) throw new Error("a hand did not end");
      if (h.phase === "deal") h.step();
      else h.act(this.decide(iters).action);
    }
    return this.finishHand();
  }

  /** A Sit & Go's remaining hands, played out instantly. */
  finishInstantly() {
    let guard = 0;
    while (this.alive().length > 1 && guard++ < 3000) this.playHandInstantly(60);
  }
}

/** Cash stacks by style (times the buy-in): the loose ones have been winning, or reloading deep. */
const CASH_DEPTH: Record<Style, number> = { rock: 1, passive: 0.9, solid: 1.2, lag: 1.5, station: 0.8, maniac: 1.7 };

/** Every seat's character: seat 0 (the human) gets a solid one for the bench's auto mode. */
export function personas(seats: { id: number; skill: number }[], seed: number): Persona[] {
  const used = new Set<Style>();
  return seats.map((s, i) => {
    if (i === 0) return { style: "solid", skill: 0.6 };
    // a mix: avoid repeating a style until all six have sat down
    let st = styleOf(s.id, seed, i);
    for (let k = 0; used.has(st) && k < 6; k++) st = (["rock", "passive", "solid", "lag", "station", "maniac"] as Style[])[(["rock", "passive", "solid", "lag", "station", "maniac"].indexOf(st) + 1) % 6];
    used.add(st);
    if (used.size >= 6) used.clear();
    return { style: st, skill: s.skill };
  });
}
