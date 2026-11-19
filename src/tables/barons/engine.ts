/**
 * BLOCK BARONS: the rules engine. The whole game's state and every rule (dice, moves, rent, the
 * cards, building, collateral, trades, the sealed fee auction, the Penitentiary, bankruptcy, the
 * end of a Speed game), with no DOM: the simulations run it in Node, the table (index.ts) runs the
 * very same code and only animates the events it emits.
 *
 *   const g = new Game({ seats: 6, mode: "speed", seed: 7 }, agents, fx);
 *   await g.run();          // plays the whole game; agents decide, fx animates each event
 *   g.standings();          // seats, winner first
 *
 * Engine calls are synchronous and push events; `await g.flush()` plays them through `fx`.
 */
import { BLOCK_REWARD, GROUPS, GROUP_SPACES, JAIL, JAIL_FINE, LINES, LINE_RENT, MEMPOOL, MODES, N, OWNABLE, PERFECT_BLOCK, QIPS, REDEEM, SELL_BACK, SPACES, START_CASH, UTILS, UTIL_MULT, type Card, type Mode } from "./board";

export const BANK = -1;
export const PARKPOT = -2;

export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Baron {
  seat: number;
  cash: number;
  pos: number;
  jailed: boolean;
  /** Failed tries at the Penitentiary so far (0…2). */
  jailTurns: number;
  /** The decks of the VIEWING KEY PARDONs held (they go back there when used). */
  pardons: ("mempool" | "qip")[];
  out: boolean;
  /** 1 for the first one out, 2 for the next… (0 while in). */
  outRank: number;
  doubles: number;
}

export interface Deed {
  owner: number;
  /** 0 bare, 1…4 miners, 5 the Foundry. */
  level: number;
  mortgaged: boolean;
}

export interface Offer {
  from: number;
  to: number;
  /** Spaces `from` gives, spaces `from` gets. */
  give: number[];
  get: number[];
  giveCash: number;
  getCash: number;
  givePardon: number;
  getPardon: number;
}

export type PayWhy = "rent" | "tax" | "reward" | "perfect" | "card" | "fine" | "park" | "bankrupt";

export type Ev =
  | { t: "turn"; seat: number }
  | { t: "round"; round: number }
  | { t: "dice"; seat: number; a: number; b: number; why: "move" | "jail" | "util" }
  | { t: "move"; seat: number; from: number; to: number; steps: number; jump?: boolean }
  | { t: "land"; seat: number; space: number }
  | { t: "pay"; from: number; to: number; amount: number; why: PayWhy; space?: number }
  | { t: "buy"; seat: number; space: number; price: number }
  | { t: "auction"; space: number; bids: number[]; winner: number; price: number }
  | { t: "build"; seat: number; space: number; level: number; sold: boolean; amount: number }
  | { t: "collateral"; seat: number; space: number; on: boolean; amount: number }
  | { t: "card"; seat: number; deck: "mempool" | "qip"; card: number }
  | { t: "jail"; seat: number; why: "raid" | "card" | "doubles" }
  | { t: "free"; seat: number; how: "pay" | "pardon" | "doubles" | "forced" }
  | { t: "bankrupt"; seat: number; to: number }
  | { t: "trade"; offer: Offer }
  | { t: "doubles"; seat: number; n: number }
  | { t: "say"; seat: number; key: string }
  | { t: "end"; why: EndWhy };

/** Why the game ended: the rounds ran out, the clock, one baron left, Classic's safety cap. */
export type EndWhy = "rounds" | "time" | "last" | "cap";

/** Who plays a seat: the human through the table's UI, or a zkSNARK (ai.ts). */
export interface Agent {
  /** Before the roll ("pre") and after the turn ("post"): build, collateral, trades. */
  manage(g: Game, seat: number, phase: "pre" | "post"): Promise<void>;
  jail(g: Game, seat: number): Promise<"pay" | "pardon" | "roll">;
  buy(g: Game, seat: number, space: number): Promise<boolean>;
  /** A sealed bid for the fee auction (0: no bid). */
  bid(g: Game, seat: number, space: number): Promise<number>;
  /** Owes `owed` and has less: sell miners, post collateral, trade… (the engine checks after). */
  raise(g: Game, seat: number, owed: number): Promise<void>;
  /** A trade offered to this seat: yes, no, or a counter-offer (from this seat's side). */
  answer(g: Game, offer: Offer): Promise<"yes" | "no" | Offer>;
}

export interface Cfg {
  seats: number;
  mode: Mode;
  seed: number;
  /** Speed and Blitz: the rounds (default the mode's). */
  rounds?: number;
  /** Speed and Blitz: true once the clock has run out (checked after each turn). */
  deadline?: () => boolean;
  /** Keep every event in `g.log` (tests). */
  log?: boolean;
  /** The GENESIS AIRDROP of starting deeds (default: on in the timed modes). */
  airdrop?: boolean;
}

export class Game {
  readonly cfg: Cfg;
  readonly rnd: () => number;
  readonly p: Baron[];
  /** Per space: the deed (lines, utilities, deeds), or null. */
  readonly deeds: (Deed | null)[];
  park = 0;
  /** Whose turn it is. */
  turn = 0;
  round = 1;
  turns = 0;
  over = false;
  endWhy: EndWhy = "last";
  readonly rounds: number;
  mempool: number[];
  qip: number[];
  /** The dice of the last roll (utility rent). */
  dice: [number, number] = [1, 1];
  log: Ev[] = [];
  private queue: Ev[] = [];
  private outCount = 0;
  agents: Agent[];
  fx: (e: Ev) => Promise<void> | void;
  /** The last auction's sealed bids (the table reveals them). */
  lastBids: number[] = [];

  constructor(cfg: Cfg, agents: Agent[], fx: (e: Ev) => Promise<void> | void = () => {}) {
    this.cfg = cfg;
    this.rnd = rng(cfg.seed);
    this.agents = agents;
    this.fx = fx;
    this.rounds = cfg.rounds ?? MODES[cfg.mode].rounds;
    this.p = Array.from({ length: cfg.seats }, (_, seat) => ({ seat, cash: START_CASH, pos: 0, jailed: false, jailTurns: 0, pardons: [], out: false, outRank: 0, doubles: 0 }));
    this.deeds = SPACES.map((s) => (s.price !== undefined ? { owner: BANK, level: 0, mortgaged: false } : null));
    this.mempool = this.shuffle(MEMPOOL.map((_, i) => i));
    this.qip = this.shuffle(QIPS.map((_, i) => i));
    if (cfg.airdrop ?? cfg.mode !== "classic") this.airdrop();
  }

  /** The timed modes start with the GENESIS AIRDROP: a few random deeds each (never a whole district). */
  readonly dropped: number[][] = [];
  private airdrop() {
    const n = this.p.length;
    const each = n <= 2 ? 3 : n <= 5 ? 2 : 1;
    const pool = this.shuffle(OWNABLE.slice());
    for (let s = 0; s < n; s++) this.dropped.push([]);
    for (let k = 0; k < each; k++)
      for (let s = 0; s < n; s++) {
        const at = pool.findIndex((i) => {
          const gi = SPACES[i].kind === "deed" ? SPACES[i].group! : -1;
          return gi < 0 || !GROUP_SPACES[gi].every((j) => j === i || this.deeds[j]!.owner === s);
        });
        const [i] = pool.splice(at, 1);
        this.deeds[i]!.owner = s;
        this.dropped[s].push(i);
      }
  }

  shuffle<T>(a: T[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  emit(e: Ev) {
    this.queue.push(e);
    if (this.cfg.log) this.log.push(e);
  }
  /** Play the queued events (the table animates them; the sims don't wait). */
  async flush() {
    while (this.queue.length) {
      const e = this.queue.shift()!;
      const r = this.fx(e);
      if (r) await r;
    }
  }
  say(seat: number, key: string) {
    this.emit({ t: "say", seat, key });
  }

  // ---- reading the board -------------------------------------------------------------------------

  alive() {
    return this.p.filter((b) => !b.out);
  }
  ownerOf(i: number) {
    return this.deeds[i]?.owner ?? BANK;
  }
  /** The spaces this seat owns. */
  owned(seat: number) {
    return OWNABLE.filter((i) => this.deeds[i]!.owner === seat);
  }
  /** True when this seat owns the whole district. */
  full(seat: number, group: number) {
    return GROUP_SPACES[group].every((i) => this.deeds[i]!.owner === seat);
  }
  groupBuilt(group: number) {
    return GROUP_SPACES[group].some((i) => this.deeds[i]!.level > 0);
  }
  linesOf(seat: number) {
    return LINES.filter((i) => this.deeds[i]!.owner === seat).length;
  }
  utilsOf(seat: number) {
    return UTILS.filter((i) => this.deeds[i]!.owner === seat).length;
  }
  /** The rent a visitor owes here (dice: the roll's sum, for utilities). */
  rent(i: number, dice = this.dice[0] + this.dice[1]) {
    const s = SPACES[i];
    const d = this.deeds[i];
    if (!d || d.owner < 0 || d.mortgaged) return 0;
    if (s.kind === "line") return LINE_RENT[this.linesOf(d.owner) - 1];
    if (s.kind === "util") return dice * UTIL_MULT[this.utilsOf(d.owner) - 1];
    if (d.level > 0) return s.rent![d.level];
    return this.full(d.owner, s.group!) ? s.rent![0] * 2 : s.rent![0];
  }
  /** Book value: cash, deeds at their price (half when collateralised), miners and Foundries at cost. */
  worth(seat: number) {
    const b = this.p[seat];
    let w = b.cash;
    for (const i of OWNABLE) {
      const d = this.deeds[i]!;
      if (d.owner !== seat) continue;
      const s = SPACES[i];
      w += d.mortgaged ? s.price! / 2 : s.price!;
      if (d.level) w += d.level * GROUPS[s.group!].build;
    }
    return w;
  }
  /** What this seat could raise right now (cash, miners sold back, every deed collateralised). */
  liquid(seat: number) {
    let w = this.p[seat].cash;
    for (const i of OWNABLE) {
      const d = this.deeds[i]!;
      if (d.owner !== seat) continue;
      const s = SPACES[i];
      if (!d.mortgaged) w += s.price! / 2;
      if (d.level) w += Math.floor(d.level * GROUPS[s.group!].build * SELL_BACK);
    }
    return w;
  }
  miners(seat: number) {
    let m = 0,
      f = 0;
    for (const i of OWNABLE) {
      const d = this.deeds[i]!;
      if (d.owner !== seat || !d.level) continue;
      if (d.level === 5) f++;
      else m += d.level;
    }
    return { miners: m, foundries: f };
  }

  // ---- building and collateral (any time on your own turn) ----------------------------------------

  buildCost(i: number) {
    const s = SPACES[i];
    return s.kind === "deed" ? GROUPS[s.group!].build : 0;
  }
  canBuild(seat: number, i: number) {
    const s = SPACES[i];
    const d = this.deeds[i];
    if (!d || s.kind !== "deed" || d.owner !== seat || d.level >= 5) return false;
    if (!this.full(seat, s.group!)) return false;
    const g = GROUP_SPACES[s.group!];
    if (g.some((j) => this.deeds[j]!.mortgaged)) return false;
    if (d.level > Math.min(...g.map((j) => this.deeds[j]!.level))) return false;
    return this.p[seat].cash >= this.buildCost(i);
  }
  build(seat: number, i: number) {
    if (!this.canBuild(seat, i)) return false;
    const d = this.deeds[i]!;
    const c = this.buildCost(i);
    this.p[seat].cash -= c;
    d.level++;
    this.emit({ t: "build", seat, space: i, level: d.level, sold: false, amount: c });
    return true;
  }
  canSell(seat: number, i: number) {
    const s = SPACES[i];
    const d = this.deeds[i];
    if (!d || s.kind !== "deed" || d.owner !== seat || d.level <= 0) return false;
    return d.level >= Math.max(...GROUP_SPACES[s.group!].map((j) => this.deeds[j]!.level));
  }
  sell(seat: number, i: number) {
    if (!this.canSell(seat, i)) return false;
    const d = this.deeds[i]!;
    const v = Math.floor(this.buildCost(i) * SELL_BACK);
    this.p[seat].cash += v;
    d.level--;
    this.emit({ t: "build", seat, space: i, level: d.level, sold: true, amount: v });
    return true;
  }
  canMortgage(seat: number, i: number) {
    const s = SPACES[i];
    const d = this.deeds[i];
    if (!d || d.owner !== seat || d.mortgaged) return false;
    return s.kind !== "deed" || !this.groupBuilt(s.group!);
  }
  mortgage(seat: number, i: number) {
    if (!this.canMortgage(seat, i)) return false;
    const v = SPACES[i].price! / 2;
    this.deeds[i]!.mortgaged = true;
    this.p[seat].cash += v;
    this.emit({ t: "collateral", seat, space: i, on: true, amount: v });
    return true;
  }
  redeemCost(i: number) {
    return Math.ceil((SPACES[i].price! / 2) * REDEEM);
  }
  canRedeem(seat: number, i: number) {
    const d = this.deeds[i];
    return !!d && d.owner === seat && d.mortgaged && this.p[seat].cash >= this.redeemCost(i);
  }
  redeem(seat: number, i: number) {
    if (!this.canRedeem(seat, i)) return false;
    const v = this.redeemCost(i);
    this.deeds[i]!.mortgaged = false;
    this.p[seat].cash -= v;
    this.emit({ t: "collateral", seat, space: i, on: false, amount: v });
    return true;
  }

  // ---- trades ------------------------------------------------------------------------------------

  /** A deed can change hands while its district has no miners on it. */
  tradable(i: number) {
    const s = SPACES[i];
    return !!this.deeds[i] && (s.kind !== "deed" || !this.groupBuilt(s.group!));
  }
  validOffer(o: Offer) {
    const a = this.p[o.from],
      b = this.p[o.to];
    if (!a || !b || a.out || b.out || o.from === o.to) return false;
    if (o.giveCash < 0 || o.getCash < 0 || o.giveCash > a.cash || o.getCash > b.cash) return false;
    if (o.givePardon > a.pardons.length || o.getPardon > b.pardons.length || o.givePardon < 0 || o.getPardon < 0) return false;
    if (!o.give.every((i) => this.deeds[i]?.owner === o.from && this.tradable(i))) return false;
    if (!o.get.every((i) => this.deeds[i]?.owner === o.to && this.tradable(i))) return false;
    if (new Set(o.give).size !== o.give.length || new Set(o.get).size !== o.get.length) return false;
    return o.give.length + o.get.length + o.giveCash + o.getCash + o.givePardon + o.getPardon > 0;
  }
  /** Swap everything in the offer (it must be valid). */
  trade(o: Offer) {
    if (!this.validOffer(o)) return false;
    const a = this.p[o.from],
      b = this.p[o.to];
    for (const i of o.give) this.deeds[i]!.owner = o.to;
    for (const i of o.get) this.deeds[i]!.owner = o.from;
    a.cash += o.getCash - o.giveCash;
    b.cash += o.giveCash - o.getCash;
    for (let k = 0; k < o.givePardon; k++) b.pardons.push(a.pardons.pop()!);
    for (let k = 0; k < o.getPardon; k++) a.pardons.push(b.pardons.pop()!);
    this.emit({ t: "trade", offer: o });
    return true;
  }
  /** Offer `o` to its target and settle it: true when a deal was done. Counter-offers go back once. */
  async propose(o: Offer) {
    if (!this.validOffer(o)) return false;
    const r = await this.agents[o.to].answer(this, o);
    if (r === "yes") return this.trade(o) && (await this.flush(), true);
    if (r === "no") return false;
    // a counter: the same deal seen from the other side, to the proposer (no counter to a counter)
    if (!this.validOffer(r)) return false;
    const back = await this.agents[r.to].answer(this, r);
    if (back === "yes") return this.trade(r) && (await this.flush(), true);
    return false;
  }

  // ---- money -------------------------------------------------------------------------------------

  private credit(to: number, v: number) {
    if (to === PARKPOT) this.park += v;
    else if (to >= 0) this.p[to].cash += v;
  }
  /** The bank pays `seat`. */
  gain(seat: number, v: number, why: PayWhy, space?: number) {
    this.p[seat].cash += v;
    this.emit({ t: "pay", from: BANK, to: seat, amount: v, why, space });
  }
  /** `seat` must pay `v` to `to` (a seat, the BANK or the PARKPOT): raises money or goes bankrupt. True when paid. */
  async charge(seat: number, to: number, v: number, why: PayWhy, space?: number) {
    const b = this.p[seat];
    if (v <= 0 || b.out) return !b.out;
    if (b.cash < v) {
      await this.agents[seat].raise(this, seat, v);
      await this.flush();
    }
    if (b.cash >= v) {
      b.cash -= v;
      this.credit(to, v);
      this.emit({ t: "pay", from: seat, to, amount: v, why, space });
      await this.flush();
      return true;
    }
    this.bankrupt(seat, to);
    await this.flush();
    return false;
  }
  /** Out of the game: to a seat, everything goes to them; to the bank, the deeds go back on sale. */
  bankrupt(seat: number, to: number) {
    const b = this.p[seat];
    // the miners go back to the bank first (half price, into the cash that is handed over)
    for (const i of this.owned(seat)) {
      const d = this.deeds[i]!;
      if (d.level) b.cash += Math.floor(d.level * this.buildCost(i) * SELL_BACK);
      d.level = 0;
    }
    const cash = Math.max(0, b.cash);
    b.cash = 0;
    if (cash > 0) {
      this.credit(to, cash);
      this.emit({ t: "pay", from: seat, to, amount: cash, why: "bankrupt" });
    }
    for (const i of this.owned(seat)) {
      const d = this.deeds[i]!;
      if (to >= 0) d.owner = to;
      else ((d.owner = BANK), (d.mortgaged = false));
    }
    if (to >= 0) this.p[to].pardons.push(...b.pardons);
    else for (const k of b.pardons) this.returnPardon(k);
    b.pardons = [];
    b.out = true;
    b.jailed = false;
    b.outRank = ++this.outCount;
    this.emit({ t: "bankrupt", seat, to });
  }

  // ---- moving ------------------------------------------------------------------------------------

  /** Tests: the dice to throw instead of the seeded ones. */
  loaded: [number, number][] = [];
  roll(seat: number, why: "move" | "jail" | "util" = "move") {
    const ld = this.loaded.shift();
    const a = ld ? ld[0] : 1 + Math.floor(this.rnd() * 6),
      b = ld ? ld[1] : 1 + Math.floor(this.rnd() * 6);
    this.dice = [a, b];
    this.emit({ t: "dice", seat, a, b, why });
    return [a, b] as const;
  }
  /** Forward `steps` (the block reward when passing GENESIS BLOCK), or back when negative. */
  step(seat: number, steps: number) {
    const b = this.p[seat];
    const from = b.pos;
    const to = (((from + steps) % N) + N) % N;
    b.pos = to;
    this.emit({ t: "move", seat, from, to, steps });
    if (steps > 0 && from + steps >= N) {
      this.gain(seat, BLOCK_REWARD, "reward", 0);
      if (to === 0) this.gain(seat, PERFECT_BLOCK, "perfect", 0);
    }
  }
  /** Forward to space `to`. */
  advanceTo(seat: number, to: number) {
    const from = this.p[seat].pos;
    this.step(seat, (((to - from) % N) + N) % N || N);
  }
  toJail(seat: number, why: "raid" | "card" | "doubles") {
    const b = this.p[seat];
    const from = b.pos;
    b.pos = JAIL;
    b.jailed = true;
    b.jailTurns = 0;
    b.doubles = 0;
    this.emit({ t: "move", seat, from, to: JAIL, steps: 0, jump: true });
    this.emit({ t: "jail", seat, why });
  }

  /** What happens where `seat` stands. `mul`: a card's double fare; `util10`: a card's 10× utility rent. */
  async land(seat: number, o: { mul?: number; util10?: boolean } = {}) {
    const b = this.p[seat];
    const i = b.pos;
    const s = SPACES[i];
    this.emit({ t: "land", seat, space: i });
    await this.flush();
    switch (s.kind) {
      case "deed":
      case "line":
      case "util": {
        const d = this.deeds[i]!;
        if (d.owner === BANK) {
          const want = b.cash >= s.price! && (await this.agents[seat].buy(this, seat, i));
          if (want && b.cash >= s.price!) {
            b.cash -= s.price!;
            d.owner = seat;
            this.emit({ t: "buy", seat, space: i, price: s.price! });
            await this.flush();
          } else await this.auction(i);
        } else if (d.owner !== seat && !d.mortgaged) {
          let r: number;
          if (s.kind === "util" && o.util10) {
            const [x, y] = this.roll(seat, "util");
            await this.flush();
            r = (x + y) * UTIL_MULT[1];
          } else r = this.rent(i) * (o.mul ?? 1);
          await this.charge(seat, d.owner, r, "rent", i);
        }
        break;
      }
      case "tax": {
        const v = s.tax ?? 60 + 10 * this.owned(seat).length;
        await this.charge(seat, PARKPOT, v, "tax", i);
        break;
      }
      case "park":
        if (this.park > 0) {
          const v = this.park;
          this.park = 0;
          b.cash += v;
          this.emit({ t: "pay", from: PARKPOT, to: seat, amount: v, why: "park", space: i });
          await this.flush();
        }
        break;
      case "raid":
        this.toJail(seat, "raid");
        await this.flush();
        break;
      case "mempool":
      case "qip":
        await this.draw(seat, s.kind);
        break;
      default:
        break;
    }
  }

  /** The sealed fee auction: every baron still in bids at once; the highest fee takes the deed and pays it. */
  async auction(i: number) {
    const who = this.alive().map((b) => b.seat);
    const raw = await Promise.all(who.map((s) => this.agents[s].bid(this, s, i)));
    const bids = this.p.map(() => 0);
    who.forEach((s, k) => (bids[s] = Math.max(0, Math.min(this.p[s].cash, Math.floor(raw[k] || 0)))));
    for (const s of who) if (bids[s] < 10) bids[s] = 0;
    // highest fee wins; a tie goes to the baron soonest after the one whose turn it is
    let win = -1;
    for (let k = 0; k < this.p.length; k++) {
      const s = (this.turn + k) % this.p.length;
      if (bids[s] > 0 && (win < 0 || bids[s] > bids[win])) win = s;
    }
    this.lastBids = bids;
    const price = win >= 0 ? bids[win] : 0;
    if (win >= 0) {
      this.p[win].cash -= price;
      this.deeds[i]!.owner = win;
    }
    this.emit({ t: "auction", space: i, bids, winner: win, price });
    await this.flush();
  }

  async draw(seat: number, deck: "mempool" | "qip") {
    const pile = deck === "mempool" ? this.mempool : this.qip;
    const k = pile.shift()!;
    const card: Card = (deck === "mempool" ? MEMPOOL : QIPS)[k];
    const b = this.p[seat];
    this.emit({ t: "card", seat, deck, card: k });
    await this.flush();
    const fx = card.fx;
    if (fx.k !== "pardon") pile.push(k);
    switch (fx.k) {
      case "gain":
        this.gain(seat, fx.v, "card");
        await this.flush();
        break;
      case "lose":
        await this.charge(seat, BANK, fx.v, "card");
        break;
      case "park":
        await this.charge(seat, PARKPOT, fx.v, "card");
        break;
      case "each":
        for (const o of this.alive()) if (o.seat !== seat && !b.out) await this.charge(seat, o.seat, fx.v, "card");
        break;
      case "fromEach":
        for (const o of this.alive()) if (o.seat !== seat) await this.charge(o.seat, seat, fx.v, "card");
        break;
      case "goto":
        this.advanceTo(seat, fx.to);
        await this.flush();
        await this.land(seat);
        break;
      case "back":
        this.step(seat, -fx.n);
        await this.flush();
        await this.land(seat);
        break;
      case "nearLine": {
        const to = LINES.find((i) => i > b.pos) ?? LINES[0];
        this.advanceTo(seat, to);
        await this.flush();
        await this.land(seat, { mul: 2 });
        break;
      }
      case "nearUtil": {
        const to = UTILS.find((i) => i > b.pos) ?? UTILS[0];
        this.advanceTo(seat, to);
        await this.flush();
        await this.land(seat, { util10: true });
        break;
      }
      case "jail":
        this.toJail(seat, "card");
        await this.flush();
        break;
      case "pardon":
        b.pardons.push(deck);
        break;
      case "repairs": {
        const { miners, foundries } = this.miners(seat);
        await this.charge(seat, BANK, miners * fx.miner + foundries * fx.foundry, "card");
        break;
      }
    }
  }

  /** A used (or forfeited) pardon goes back under its deck. */
  private returnPardon(deck: "mempool" | "qip") {
    if (deck === "mempool") this.mempool.push(MEMPOOL.findIndex((c) => c.fx.k === "pardon"));
    else this.qip.push(QIPS.findIndex((c) => c.fx.k === "pardon"));
  }
  usePardon(seat: number) {
    const b = this.p[seat];
    const k = b.pardons.pop();
    if (!k) return false;
    this.returnPardon(k);
    b.jailed = false;
    b.jailTurns = 0;
    this.emit({ t: "free", seat, how: "pardon" });
    return true;
  }

  // ---- a turn ------------------------------------------------------------------------------------

  async playTurn(seat: number) {
    const b = this.p[seat];
    const ag = this.agents[seat];
    b.doubles = 0;
    this.emit({ t: "turn", seat });
    await this.flush();
    await ag.manage(this, seat, "pre");
    await this.flush();
    if (b.out) return;
    if (b.jailed) {
      const c = await ag.jail(this, seat);
      if (c === "pardon" && b.pardons.length) this.usePardon(seat);
      else if (c === "pay") {
        if (!(await this.charge(seat, PARKPOT, JAIL_FINE, "fine"))) return;
        b.jailed = false;
        b.jailTurns = 0;
        this.emit({ t: "free", seat, how: "pay" });
      } else {
        const [x, y] = this.roll(seat, "jail");
        await this.flush();
        if (x === y) {
          b.jailed = false;
          b.jailTurns = 0;
          this.emit({ t: "free", seat, how: "doubles" });
        } else if (++b.jailTurns >= 3) {
          if (!(await this.charge(seat, PARKPOT, JAIL_FINE, "fine"))) return;
          b.jailed = false;
          b.jailTurns = 0;
          this.emit({ t: "free", seat, how: "forced" });
        } else {
          await ag.manage(this, seat, "post");
          await this.flush();
          return;
        }
        // out by the dice (doubles or a forced fine): move by them, no roll again
        await this.flush();
        this.step(seat, x + y);
        await this.flush();
        await this.land(seat);
        if (!b.out) {
          await ag.manage(this, seat, "post");
          await this.flush();
        }
        return;
      }
      await this.flush();
    }
    for (;;) {
      const [x, y] = this.roll(seat);
      await this.flush();
      const dbl = x === y;
      if (dbl && ++b.doubles >= 3) {
        this.toJail(seat, "doubles");
        await this.flush();
        break;
      }
      this.step(seat, x + y);
      await this.flush();
      await this.land(seat);
      if (b.out || b.jailed || !dbl) break;
      this.emit({ t: "doubles", seat, n: b.doubles });
      await this.flush();
      await ag.manage(this, seat, "pre");
      await this.flush();
      if (b.out) return;
    }
    if (!b.out) {
      await ag.manage(this, seat, "post");
      await this.flush();
    }
  }

  /** The whole game, to its end. */
  async run() {
    const n = this.p.length;
    this.emit({ t: "round", round: 1 });
    await this.flush();
    while (!this.over) {
      const seat = this.turn;
      if (!this.p[seat].out) {
        await this.playTurn(seat);
        this.turns++;
      }
      if (this.alive().length <= 1) {
        this.finish("last");
        break;
      }
      if (this.cfg.mode !== "classic" && this.cfg.deadline?.()) {
        this.finish("time");
        break;
      }
      // next seat still in (a new round once it wraps)
      let next = (seat + 1) % n;
      while (this.p[next].out) next = (next + 1) % n;
      if (next <= seat) {
        this.round++;
        if (this.round > this.rounds) {
          this.finish(this.cfg.mode === "classic" ? "cap" : "rounds");
          break;
        }
        this.emit({ t: "round", round: this.round });
      }
      this.turn = next;
      await this.flush();
    }
    await this.flush();
  }

  finish(why: EndWhy) {
    this.over = true;
    this.endWhy = why;
    this.emit({ t: "end", why });
  }

  /** Seats, winner first: those still in by net worth, then the bankrupt, the last one out first. */
  standings() {
    const inn = this.alive()
      .map((b) => b.seat)
      .sort((a, b) => this.worth(b) - this.worth(a) || a - b);
    const out = this.p
      .filter((b) => b.out)
      .sort((a, b) => b.outRank - a.outRank)
      .map((b) => b.seat);
    return [...inn, ...out];
  }
}
