/**
 * ZK PARTY's board rules, apart from any picture: the graph of spaces, the players' coins,
 * Z-Blocks and items, every space's effect, THE TRACKER ("shor" in the code), the duels, the gimmicks (the ZEC LINE metro, the
 * drawbridge, the hash wheel; MARINA NIGHTS' sky wheel and MONSOON), LAST 5 TURNS, the bonus
 * Z-Blocks, and the rivals' minds.
 *
 * The game is a script (`Rules.run`) over a `Ui`: it `show`s what happens (the 3D board animates
 * it; the Node sim skips it), `ask`s the human's choices (the AI answers its own seats), and plays
 * the mini-game after each turn (`mini`). Only `rnd` decides anything, so a seed replays a game.
 * No three, no DOM: the bench sims hundreds of games in plain Node.
 */
import type { MapDef } from "./maps";

// ---- the graph -------------------------------------------------------------------------------------

export type Kind = "blue" | "red" | "lucky" | "shop" | "shor" | "vs" | "event";
export type EvKind = "metro" | "lever" | "wheel" | "ride" | "storm" | "lift" | "buran";
const LETTER: Record<string, [Kind, EvKind?]> = {
  b: ["blue"],
  r: ["red"],
  l: ["lucky"],
  s: ["shop"],
  x: ["shor"],
  v: ["vs"],
  m: ["event", "metro"],
  k: ["event", "lever"],
  w: ["event", "wheel"],
  o: ["event", "ride"],
  t: ["event", "storm"],
  e: ["event", "lift"],
  z: ["event", "buran"],
};

export interface Edge {
  to: number;
  zip?: boolean;
  toll?: number;
  gate?: "bridge" | "ice";
  /** The path it leads into (the arrows' names). */
  path: string;
}

export interface Space {
  i: number;
  kind: Kind;
  ev?: EvKind;
  x: number;
  y: number;
  z: number;
  path: string;
  /** Its index along its path. */
  k: number;
  next: Edge[];
  prev: number[];
  /** The Z-Block may sit here. */
  q: boolean;
  station?: string;
  bridge: boolean;
  pier: boolean;
  /** Low ground by the water (a MONSOON floods it). */
  low: boolean;
  /** On the frozen canal (NU7 QUARTER's ice run): nobody stops on it. */
  ice: boolean;
}

export interface Graph {
  map: MapDef;
  spaces: Space[];
  start: number;
  stations: number[];
  qspots: number[];
  /** The drawbridge's head (where the knocked-off land) and its spaces. */
  head: number;
  bridge: number[];
  /** Steps from a to b: [bridge down, bridge up], a * N + b; 999 when out of reach. */
  dist: [Int16Array, Int16Array];
  /** The low spaces (a MONSOON floods them); the sky wheel's stops, one per turn in turn. */
  low: number[];
  drops: number[];
  /** (NU7 QUARTER) The ice run's spaces; the NU7 TOWER LIFT's drop zones. */
  ice: number[];
  liftTo: number[];
}

/** Lays the paths' spaces out and links them. */
export function buildGraph(map: MapDef): Graph {
  const spaces: Space[] = [];
  const first = new Map<string, number>();
  const count = new Map<string, number>();
  for (const p of map.paths) {
    first.set(p.id, spaces.length);
    count.set(p.id, p.kinds.length);
    const n = p.kinds.length;
    // (the spaces spread evenly along the control points, the first on the first, the last on the last)
    const segs: number[] = [];
    let total = 0;
    for (let i = 1; i < p.pts.length; i++) {
      const d = Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
      segs.push(d);
      total += d;
    }
    for (let k = 0; k < n; k++) {
      let want = n === 1 ? 0 : (total * k) / (n - 1);
      let x = p.pts[0][0],
        z = p.pts[0][1];
      for (let s = 0; s < segs.length; s++) {
        if (want <= segs[s] + 1e-6 || s === segs.length - 1) {
          const f = segs[s] ? Math.min(1, want / segs[s]) : 0;
          x = p.pts[s][0] + (p.pts[s + 1][0] - p.pts[s][0]) * f;
          z = p.pts[s][1] + (p.pts[s + 1][1] - p.pts[s][1]) * f;
          break;
        }
        want -= segs[s];
      }
      const [kind, ev] = LETTER[p.kinds[k]] ?? ["blue"];
      spaces.push({ i: spaces.length, kind, ev, x, y: p.y ?? 0, z, path: p.id, k, next: [], prev: [], q: !!p.q?.includes(k), station: p.stations?.[k], bridge: !!p.bridge, pier: !!p.pier, low: !!p.low, ice: !!p.ice });
    }
  }
  for (const p of map.paths) {
    const base = first.get(p.id)!;
    const n = p.kinds.length;
    for (let k = 0; k < n - 1; k++) spaces[base + k].next.push({ to: base + k + 1, path: p.id });
    for (const nx of p.next) {
      const d = typeof nx === "string" ? { to: nx } : nx;
      const to = first.get(d.to);
      if (to === undefined) throw new Error(`board ${map.key}: no path ${d.to}`);
      spaces[base + n - 1].next.push({ to: to + Math.min(d.at ?? 0, count.get(d.to)! - 1), zip: d.zip, toll: d.toll, gate: d.gate, path: d.to });
    }
  }
  for (const s of spaces) for (const e of s.next) spaces[e.to].prev.push(s.i);
  const N = spaces.length;
  const table = (up: boolean) => {
    const t = new Int16Array(N * N).fill(999);
    const q = new Int32Array(N);
    for (let a = 0; a < N; a++) {
      t[a * N + a] = 0;
      let h = 0,
        e = 0;
      q[e++] = a;
      while (h < e) {
        const s = q[h++];
        const d = t[a * N + s];
        for (const ed of spaces[s].next) {
          // (table 1: every gate shut, the drawbridge up or the river's ice broken; no board has both)
          if (up && ed.gate) continue;
          if (t[a * N + ed.to] > d + 1) ((t[a * N + ed.to] = d + 1), (q[e++] = ed.to));
        }
      }
    }
    return t;
  };
  const head = map.drawbridge ? first.get(map.drawbridge.head) ?? 0 : 0;
  return {
    map,
    spaces,
    start: first.get(map.start) ?? 0,
    stations: spaces.filter((s) => s.ev === "metro").map((s) => s.i),
    qspots: spaces.filter((s) => s.q && s.kind === "blue").map((s) => s.i),
    head,
    bridge: spaces.filter((s) => s.bridge).map((s) => s.i),
    dist: [table(false), table(true)],
    low: spaces.filter((s) => s.low).map((s) => s.i),
    drops: (map.ride?.stops ?? []).map((d) => first.get(d.path)! + Math.min(d.at, count.get(d.path)! - 1)),
    ice: spaces.filter((s) => s.ice).map((s) => s.i),
    liftTo: (map.lift?.drops ?? []).map((d) => first.get(d.path)! + Math.min(d.at, count.get(d.path)! - 1)),
  };
}

// ---- items ---------------------------------------------------------------------------------------

export type ItemKey = "double" | "triple" | "nonce" | "wormhole" | "reorg" | "sniper" | "lock";
export const ITEMS: Record<ItemKey, { price: number }> = {
  double: { price: 5 },
  triple: { price: 10 },
  nonce: { price: 7 },
  wormhole: { price: 15 },
  reorg: { price: 10 },
  sniper: { price: 8 },
  lock: { price: 5 },
};
export const ITEM_KEYS = Object.keys(ITEMS) as ItemKey[];
export const BAG = 3;
/** What a FEE SNIPER takes, a FINALITY LOCK costs whoever steps in it. */
export const SNIPE = 10;
export const LOCK_FINE = 8;
/** The drawbridge swings by itself at the start of every third turn (from the fourth). */
export const BRIDGE_EVERY = 3;
/** A MONSOON floods the low spaces for this many turns (the rest of this one and the next); landing on a flooded one (or standing on one when it breaks) costs SOAK coins. */
export const FLOOD_TURNS = 2;
export const SOAK = 5;
/** NU7 QUARTER's ice run: the chance it gives way under the next slider, by its cracks (each slider adds one); what a cold bath costs; how many turns a broken run takes to refreeze. A BLIZZARD pushes the rivals back this far. */
export const ICE_ODDS = [0, 0.2, 0.4, 0.65];
export const ICE_FINE = 5;
export const ICE_THAW = 2;
export const BURAN_BACK = 2;

// ---- what happens --------------------------------------------------------------------------------

export type Twist = "double" | "catchup" | "shorstorm";
export type ShorOut = "crack" | "harvest" | "swap" | "charity" | "decohere" | "qblock" | "mercy";
export type LuckyOut = "coins5" | "coins10" | "item" | "tax";
export type WheelOut = "airdrop" | "burn" | "flush" | "reorg" | "lever" | "reward";
export type BonusKey = "mini" | "coin" | "event" | "explorer" | "unlucky";
export const WHEEL: WheelOut[] = ["airdrop", "burn", "flush", "reorg", "lever", "reward"];

export type BEv =
  | { t: "intro" }
  | { t: "order"; rolls: number[]; order: number[] }
  | { t: "turn"; turn: number; of: number }
  | { t: "last5"; standings: number[] }
  | { t: "twist"; twist: Twist; opts: Twist[]; seat: number }
  | { t: "start"; seat: number }
  | { t: "item"; seat: number; item: ItemKey; target?: number }
  | { t: "swap"; a: number; b: number; why: "reorg" | "shor" }
  | { t: "warp"; seat: number; from: number; to: number }
  | { t: "steal"; seat: number; from: number; n: number }
  | { t: "trapSet"; seat: number; space: number }
  | { t: "trapHit"; seat: number; owner: number; n: number; space: number }
  | { t: "diceUp"; seat: number; n: number; fixed?: number }
  | { t: "hitDie"; seat: number; k: number; v: number }
  | { t: "dice"; seat: number; values: number[] }
  | { t: "step"; seat: number; from: number; to: number; left: number; zip?: boolean; slide?: boolean }
  /** A junction passed: the ways there were, the one taken. */
  | { t: "fork"; seat: number; from: number; opts: number[]; k: number }
  | { t: "toll"; seat: number; n: number }
  | { t: "coins"; seat: number; n: number }
  | { t: "coinsAll"; deltas: number[] }
  | { t: "land"; seat: number; space: number }
  | { t: "qpoor"; seat: number; price: number }
  | { t: "qbuy"; seat: number; price: number }
  | { t: "qmove"; from: number; to: number; first?: boolean }
  | { t: "shop"; seat: number; offer: ItemKey[] }
  | { t: "buy"; seat: number; item: ItemKey; price: number }
  | { t: "bagFull"; seat: number }
  | { t: "lucky"; seat: number; out: LuckyOut; opts: LuckyOut[]; item?: ItemKey; n: number }
  | { t: "shor"; seat: number; opts: ShorOut[]; out: ShorOut; target?: number; n: number }
  | { t: "shorGone"; seat: number }
  | { t: "duel"; seat: number; rival: number; stake: number; stakes: number[] }
  | { t: "duelRoll"; seat: number; rival: number; ra: number; rb: number; stake: number; n: number }
  | { t: "metro"; seat: number; from: number; to: number }
  | { t: "bridge"; up: boolean; knocked: number[]; to: number; auto?: boolean }
  | { t: "wheel"; seat: number; out: WheelOut }
  /** The sky wheel: a ride to this turn's stop (its index in the map's stops). */
  | { t: "ride"; seat: number; from: number; to: number; stop: number }
  /** A MONSOON breaks (`seat` called it): the low spaces flood; who stood on one is soaked (deltas: the caller collects). */
  | { t: "storm"; seat: number; turns: number; deltas: number[] }
  /** The flood goes down. */
  | { t: "recede" }
  /** Landed on a flooded space: n coins to the monsoon's caller (`to`; lost when it's their own storm). */
  | { t: "soaked"; seat: number; n: number; space: number; to: number }
  /** (NU7 QUARTER) The NU7 TOWER LIFT: up to the golden crown, then (the drop zone picked) the glide down. */
  | { t: "liftUp"; seat: number; from: number }
  | { t: "lift"; seat: number; from: number; to: number }
  /** Onto the ice run: it holds (one more crack) or gives way (a cold bath: n coins lost, hauled back out at `back`). */
  | { t: "ice"; seat: number; out: "crack" | "break"; cracks: number; at: number; back: number; n: number }
  /** The ice run refreezes, cracks gone (two turns after it broke, or in a BLIZZARD). */
  | { t: "freeze"; why: "thaw" | "buran" }
  /** A BLIZZARD blows the rivals back (seat, from, to). */
  | { t: "buran"; seat: number; moves: [number, number, number][] }
  | { t: "lockLost"; space: number }
  | { t: "miniAward"; order: number[]; gains: number[] }
  | { t: "over" }
  | { t: "bonus"; key: BonusKey; vals: number[]; winners: number[]; k: number }
  | { t: "final"; order: number[] };

export type Ask =
  /** The human's turn: −1 roll, else the item to use (its index in the bag). */
  | { q: "menu"; seat: number }
  | { q: "branch"; seat: number; opts: Edge[] }
  | { q: "buyQ"; seat: number; price: number }
  /** A shop on the way: 1 to step in. */
  | { q: "shopIn"; seat: number }
  /** (MARINA NIGHTS) Passing the sky wheel's gate: 1 to ride it now (to this turn's stop; the walk ends there). */
  | { q: "rideIn"; seat: number; to: number; stop: number; left: number }
  /** Which to buy (index in the offer), −1 none. */
  | { q: "shop"; seat: number; offer: ItemKey[] }
  | { q: "target"; seat: number; why: ItemKey | "duel"; opts: number[] }
  | { q: "nonce"; seat: number }
  | { q: "station"; seat: number; opts: number[]; why?: "lift" }
  /** Wait for the human to hit dice block k. */
  | { q: "hit"; seat: number; k: number };

export interface Ui {
  readonly aborted: boolean;
  show(e: BEv): Promise<void>;
  ask(q: Ask): Promise<number>;
  /** The mini-game after a turn: the order (seats, winner first), null when left. */
  /** The mini-game after the turn: its order, and `teams` for a 2-vs-2 one (both winners paid as 1st). */
  mini(turn: number): Promise<{ order: number[]; teams?: boolean } | null>;
}

export interface Seat {
  human: boolean;
  /** 0 (a tourist) … 1 (a shark). */
  skill: number;
}

export interface RulesOpts {
  turns: number;
  /** Bench: begin at this turn; start with these coins; the human's dice. */
  startTurn?: number;
  coins?: number;
  dice?: number[];
  /** Bench: everyone starts on this space (a gimmick's doorstep). */
  at?: number;
}

export interface RulesResult {
  order: number[];
  coins: number[];
  blocks: number[];
  miniWins: number[];
  stats: Stats;
  bought: number;
}

export interface Stats {
  /** Coins won in mini-games. */
  mini: number[];
  /** The most coins held at any one time. */
  maxCoins: number[];
  events: number[];
  walked: number[];
  /** Red and TRACKER spaces landed on. */
  unlucky: number[];
  shor: number[];
  items: number[];
  kinds: Record<string, number>;
  itemsUsed: Record<string, number>;
  /** Every space type landed on, every item used, the gimmicks' runs: for the sim's coverage. */
  happened: Record<string, number>;
}

class Abort extends Error {}

export const Q_PRICE = 20;
export const MINI_PRIZE = [10, 5, 2, 0];
const BLUE = 3;
const RED = 3;

/** Seats ranked: most Z-Blocks, then coins, then the seat. */
export function standing(blocks: number[], coins: number[]) {
  return [0, 1, 2, 3].sort((a, b) => blocks[b] - blocks[a] || coins[b] - coins[a] || a - b);
}

export class Rules {
  readonly g: Graph;
  readonly N: number;
  coins: number[];
  blocks = [0, 0, 0, 0];
  pos: number[];
  items: ItemKey[][] = [[], [], [], []];
  /** Finality locks: space → its owner. */
  traps = new Map<number, number>();
  qAt = -1;
  bridgeUp = false;
  /** Turns the MONSOON's flood still lasts (0: dry), and who called it (the soaked pay them). */
  flood = 0;
  floodBy = -1;
  /** NU7 QUARTER's ice run: its cracks (0…3), broken (closed) until turn thawAt. */
  iceCracks = 0;
  iceBroken = false;
  private thawAt = 0;
  /** The mover fell through the ice: no landing this turn. */
  private wet = false;
  /** The mover rode the sky wheel from its gate on the way: no landing this turn. */
  private rode = false;
  turn = 1;
  turns: number;
  order = [0, 1, 2, 3];
  twist: Twist | null = null;
  miniWins = [0, 0, 0, 0];
  stats: Stats;
  /** The current mover (and whether they have already shopped this turn). */
  private shopped = false;
  private forced: number[];
  bought = 0;

  constructor(
    map: MapDef,
    readonly seats: Seat[],
    readonly rnd: () => number,
    readonly o: RulesOpts,
    graph?: Graph,
  ) {
    this.g = graph ?? buildGraph(map);
    this.N = this.g.spaces.length;
    this.turns = o.turns;
    const c0 = o.coins ?? 10;
    this.coins = [c0, c0, c0, c0];
    this.pos = [0, 1, 2, 3].map(() => (o.at !== undefined && o.at >= 0 && o.at < this.N ? o.at : this.g.start));
    this.forced = (o.dice ?? []).slice();
    this.stats = { mini: [0, 0, 0, 0], maxCoins: [c0, c0, c0, c0], events: [0, 0, 0, 0], walked: [0, 0, 0, 0], unlucky: [0, 0, 0, 0], shor: [0, 0, 0, 0], items: [0, 0, 0, 0], kinds: {}, itemsUsed: {}, happened: {} };
  }

  // ---- helpers -----------------------------------------------------------------------------------

  dist(a: number, b: number) {
    if (a < 0 || b < 0) return 999;
    return this.g.dist[this.bridgeUp || this.iceBroken ? 1 : 0][a * this.N + b];
  }
  /** The steps from a seat to the Z-Block. */
  toQ(seat: number) {
    return this.dist(this.pos[seat], this.qAt);
  }
  /** A space's edges open now. */
  open(s: number) {
    return this.g.spaces[s].next.filter((e) => !(e.gate === "bridge" && this.bridgeUp) && !(e.gate === "ice" && this.iceBroken));
  }
  standing() {
    return standing(this.blocks, this.coins);
  }
  private hap(k: string) {
    this.stats.happened[k] = (this.stats.happened[k] ?? 0) + 1;
  }
  private pick<X>(a: readonly X[]): X {
    return a[Math.floor(this.rnd() * a.length) % a.length];
  }
  private weighted<X>(w: [X, number][]): X {
    let tot = 0;
    for (const [, n] of w) tot += n;
    let r = this.rnd() * tot;
    for (const [x, n] of w) if ((r -= n) < 0) return x;
    return w[w.length - 1][0];
  }
  private d10() {
    return 1 + Math.floor(this.rnd() * 10);
  }
  /** Coins in or out (never under 0): what really changed. */
  private add(seat: number, n: number) {
    const was = this.coins[seat];
    this.coins[seat] = Math.max(0, Math.min(999, was + n));
    this.stats.maxCoins[seat] = Math.max(this.stats.maxCoins[seat], this.coins[seat]);
    return this.coins[seat] - was;
  }
  private async give(ui: Ui, seat: number, n: number) {
    const d = this.add(seat, n);
    if (d) await this.show(ui, { t: "coins", seat, n: d });
    return d;
  }
  private async show(ui: Ui, e: BEv) {
    await ui.show(e);
    if (ui.aborted) throw new Abort();
  }
  private async ask(ui: Ui, q: Ask) {
    const v = this.seats[q.seat].human ? await ui.ask(q) : this.ai(q);
    if (ui.aborted) throw new Abort();
    return v;
  }
  /** The rivals of a seat. */
  private others(seat: number) {
    return [0, 1, 2, 3].filter((i) => i !== seat);
  }
  /** The place of a seat now (0 first). */
  place(seat: number) {
    return this.standing().indexOf(seat);
  }
  /** Where a WORMHOLE drops you: the space before the Z-Block (on its main way in, if it can). */
  wormholeSpot() {
    const pr = this.g.spaces[this.qAt].prev.filter((p) => !this.g.spaces[p].bridge || !this.bridgeUp);
    // (the one on the same path first)
    const same = pr.find((p) => this.g.spaces[p].path === this.g.spaces[this.qAt].path);
    return same ?? pr[0] ?? this.qAt;
  }

  // ---- the game ----------------------------------------------------------------------------------

  async run(ui: Ui): Promise<RulesResult | null> {
    try {
      return await this.play(ui);
    } catch (e) {
      if (e instanceof Abort) return null;
      throw e;
    }
  }

  private async play(ui: Ui): Promise<RulesResult> {
    this.qAt = this.firstQ();
    await this.show(ui, { t: "intro" });
    await this.show(ui, { t: "qmove", from: -1, to: this.qAt, first: true });
    // who goes first: everyone hits a dice block (ties broken by the dice again)
    const rolls = [0, 1, 2, 3].map(() => this.d10());
    const tie = [0, 1, 2, 3].map(() => this.rnd());
    this.order = [0, 1, 2, 3].sort((a, b) => rolls[b] - rolls[a] || tie[b] - tie[a]);
    await this.show(ui, { t: "order", rolls, order: this.order.slice() });
    for (this.turn = Math.max(1, this.o.startTurn ?? 1); this.turn <= this.turns; this.turn++) {
      if (this.turn === this.turns - 4 && this.turns >= 10) await this.last5(ui);
      await this.show(ui, { t: "turn", turn: this.turn, of: this.turns });
      if (this.g.bridge.length && this.turn > 1 && (this.turn - 1) % BRIDGE_EVERY === 0) await this.flipBridge(ui, true);
      if (this.flood > 0 && --this.flood === 0) await this.show(ui, { t: "recede" });
      if (this.iceBroken && this.turn >= this.thawAt) await this.freeze(ui, "thaw");
      for (const seat of this.order) await this.playerTurn(ui, seat);
      const out = await ui.mini(this.turn);
      if (!out || ui.aborted) throw new Abort();
      const res = out.order;
      const gains = [0, 0, 0, 0];
      res.forEach((seat, place) => {
        // (a team game: both winners paid as 1st, both losers as 4th; kit.ts paidPlace)
        const pp = out.teams ? (place < 2 ? 0 : 3) : place;
        gains[seat] = this.add(seat, MINI_PRIZE[pp] ?? 0);
        this.stats.mini[seat] += gains[seat];
      });
      for (const s of res.slice(0, out.teams ? 2 : 1)) this.miniWins[s]++;
      await this.show(ui, { t: "miniAward", order: res.slice(), gains });
    }
    await this.show(ui, { t: "over" });
    // the bonus Z-Blocks: the mini-game one, the coin one, and one more
    const third = this.pick<BonusKey>(["event", "explorer", "unlucky"]);
    const bonus: [BonusKey, number[]][] = [
      ["mini", this.stats.mini],
      ["coin", this.stats.maxCoins],
      [third, third === "event" ? this.stats.events : third === "explorer" ? this.stats.walked : this.stats.unlucky],
    ];
    for (let k = 0; k < bonus.length; k++) {
      const [key, vals] = bonus[k];
      const top = Math.max(...vals);
      const winners = top > 0 ? [0, 1, 2, 3].filter((i) => vals[i] === top) : [];
      for (const w of winners) this.blocks[w]++;
      await this.show(ui, { t: "bonus", key, vals: vals.slice(), winners, k });
    }
    const order = this.standing();
    await this.show(ui, { t: "final", order });
    return { order, coins: this.coins.slice(), blocks: this.blocks.slice(), miniWins: this.miniWins.slice(), stats: this.stats, bought: this.bought };
  }

  /** The first Z-Block: a spot some way from the start (not on top of it). */
  private firstQ() {
    const s = this.g.start;
    const ok = this.g.qspots.filter((q) => this.dist(s, q) >= 12 && this.dist(s, q) <= 26);
    return this.pick(ok.length ? ok : this.g.qspots);
  }

  /** The Z-Block moves: somewhere else, not right in front of anyone, not where it was. */
  private nextQ(was: number) {
    const spots = this.g.qspots.filter((s) => s !== was && !this.pos.includes(s));
    const far = spots.filter((s) => this.pos.every((p) => this.dist(p, s) >= 4) && this.dist(was, s) >= 8);
    return this.pick(far.length ? far : spots.length ? spots : this.g.qspots);
  }

  private async last5(ui: Ui) {
    const st = this.standing();
    await this.show(ui, { t: "last5", standings: st });
    const last = st[3];
    const behind = this.blocks[st[0]] - this.blocks[last];
    const opts: Twist[] = ["double", "catchup", "shorstorm"];
    this.twist = this.weighted<Twist>([
      ["double", 4],
      ["catchup", behind >= 2 ? 6 : 3],
      ["shorstorm", 3],
    ]);
    this.hap(`twist:${this.twist}`);
    if (this.twist === "shorstorm") for (const s of this.g.spaces) if (s.kind === "red") s.kind = "shor";
    await this.show(ui, { t: "twist", twist: this.twist, opts, seat: last });
    if (this.twist === "catchup") {
      await this.give(ui, last, 10);
      if (this.items[last].length < BAG) {
        this.items[last].push("triple");
        await this.show(ui, { t: "lucky", seat: last, out: "item", opts: ["item"], item: "triple", n: 0 });
      } else await this.give(ui, last, 5);
    }
  }

  private async playerTurn(ui: Ui, seat: number) {
    this.shopped = false;
    await this.show(ui, { t: "start", seat });
    let dice = 1;
    let fixed = 0;
    const pick = await this.ask(ui, { q: "menu", seat });
    if (pick >= 0 && pick < this.items[seat].length) {
      const item = this.items[seat][pick];
      const r = await this.useItem(ui, seat, item, pick);
      dice = r.dice;
      fixed = r.fixed;
    }
    // the dice block(s)
    await this.show(ui, { t: "diceUp", seat, n: dice, fixed: fixed || undefined });
    const values: number[] = [];
    for (let k = 0; k < dice; k++) {
      await this.ask(ui, { q: "hit", seat, k });
      const v = fixed || (this.seats[seat].human && this.forced.length ? this.forced.shift()! : this.d10());
      values.push(v);
      await this.show(ui, { t: "hitDie", seat, k, v });
    }
    await this.show(ui, { t: "dice", seat, values });
    await this.walk(ui, seat, values.reduce((a, b) => a + b, 0));
    // (through the ice: hauled out, no landing; off the sky wheel: set down, no landing)
    if (this.wet) this.wet = false;
    else if (this.rode) this.rode = false;
    else await this.land(ui, seat);
  }

  private async useItem(ui: Ui, seat: number, item: ItemKey, idx: number): Promise<{ dice: number; fixed: number }> {
    this.items[seat].splice(idx, 1);
    this.stats.items[seat]++;
    this.stats.itemsUsed[item] = (this.stats.itemsUsed[item] ?? 0) + 1;
    this.hap(`item:${item}`);
    if (item === "double" || item === "triple") {
      await this.show(ui, { t: "item", seat, item });
      return { dice: item === "double" ? 2 : 3, fixed: 0 };
    }
    if (item === "nonce") {
      await this.show(ui, { t: "item", seat, item });
      const v = Math.max(1, Math.min(10, Math.round(await this.ask(ui, { q: "nonce", seat }))));
      return { dice: 1, fixed: v };
    }
    if (item === "wormhole") {
      await this.show(ui, { t: "item", seat, item });
      const to = this.wormholeSpot();
      const from = this.pos[seat];
      this.pos[seat] = to;
      await this.show(ui, { t: "warp", seat, from, to });
      return { dice: 1, fixed: 0 };
    }
    if (item === "reorg") {
      const target = await this.ask(ui, { q: "target", seat, why: "reorg", opts: this.others(seat) });
      await this.show(ui, { t: "item", seat, item, target });
      [this.pos[seat], this.pos[target]] = [this.pos[target], this.pos[seat]];
      await this.show(ui, { t: "swap", a: seat, b: target, why: "reorg" });
      return { dice: 1, fixed: 0 };
    }
    if (item === "sniper") {
      const target = await this.ask(ui, { q: "target", seat, why: "sniper", opts: this.others(seat) });
      await this.show(ui, { t: "item", seat, item, target });
      const n = -this.add(target, -SNIPE);
      this.add(seat, n);
      await this.show(ui, { t: "steal", seat, from: target, n });
      return { dice: 1, fixed: 0 };
    }
    // the lock: set on the space you stand on
    await this.show(ui, { t: "item", seat, item });
    const sp = this.pos[seat];
    this.traps.set(sp, seat);
    await this.show(ui, { t: "trapSet", seat, space: sp });
    return { dice: 1, fixed: 0 };
  }

  private async walk(ui: Ui, seat: number, n: number) {
    let left = n;
    let rideAsked = false;
    // (nobody stops on the ice: a count ending on it slides on to the far bank)
    while (left > 0 || this.g.spaces[this.pos[seat]].ice) {
      const here = this.pos[seat];
      let opts = this.open(here);
      let e = opts[0];
      if (opts.length > 1) {
        // (a toll you can't pay is no way at all)
        const can = opts.filter((o) => !o.toll || this.coins[seat] >= o.toll);
        opts = can.length ? can : opts;
        if (opts.length > 1) {
          const k = Math.max(0, Math.min(opts.length - 1, await this.ask(ui, { q: "branch", seat, opts })));
          e = opts[k];
          await this.show(ui, { t: "fork", seat, from: here, opts: opts.map((o) => o.to), k });
        } else e = opts[0];
      }
      if (e.toll) {
        const paid = -this.add(seat, -e.toll);
        this.hap("toll");
        await this.show(ui, { t: "toll", seat, n: paid });
      }
      if (e.zip) this.hap("zipline");
      if (this.g.spaces[e.to].bridge) this.hap("bridgeCross");
      this.pos[seat] = e.to;
      if (left > 0) left--;
      this.stats.walked[seat]++;
      const slide = this.g.spaces[here].ice || this.g.spaces[e.to].ice;
      await this.show(ui, { t: "step", seat, from: here, to: e.to, left, zip: e.zip, slide: slide || undefined });
      // onto the ice run: does it hold?
      if (this.g.spaces[e.to].ice && !this.g.spaces[here].ice && (await this.onIce(ui, seat, here))) return;
      // a rival's FINALITY LOCK, passed or landed on
      const owner = this.traps.get(e.to);
      if (owner !== undefined && owner !== seat) {
        this.traps.delete(e.to);
        const n = -this.add(seat, -LOCK_FINE);
        this.add(owner, n);
        this.hap("trapHit");
        await this.show(ui, { t: "trapHit", seat, owner, n, space: e.to });
      }
      // passing (or reaching) the Z-Block, a shop on the way
      if (e.to === this.qAt) await this.offerQ(ui, seat);
      if (left > 0 && this.g.spaces[e.to].kind === "shop" && !this.shopped) {
        if (this.items[seat].length < BAG && this.coins[seat] >= 5 && (await this.ask(ui, { q: "shopIn", seat })) > 0) await this.shop(ui, seat);
      }
      // (MARINA NIGHTS) the sky wheel's gate on the way: ride it now?
      if (left > 0 && !rideAsked && this.g.spaces[e.to].ev === "ride" && this.g.drops.length) {
        rideAsked = true;
        const stop = this.stopNow();
        if ((await this.ask(ui, { q: "rideIn", seat, to: this.g.drops[stop], stop, left })) > 0) {
          this.hap("rideOnTheWay");
          await this.ride(ui, seat);
          this.rode = true;
          return;
        }
      }
    }
  }

  private async offerQ(ui: Ui, seat: number) {
    const price = Q_PRICE;
    if (this.coins[seat] < price) {
      await this.show(ui, { t: "qpoor", seat, price });
      return;
    }
    const yes = await this.ask(ui, { q: "buyQ", seat, price });
    if (!yes) return;
    this.add(seat, -price);
    this.blocks[seat]++;
    this.bought++;
    this.hap("qbuy");
    await this.show(ui, { t: "qbuy", seat, price });
    const from = this.qAt;
    this.qAt = this.nextQ(from);
    await this.show(ui, { t: "qmove", from, to: this.qAt });
  }

  private offer(seat: number): ItemKey[] {
    // (further back, better wares)
    const place = this.place(seat);
    const pool: [ItemKey, number][] = [
      ["double", 5],
      ["triple", 2 + place],
      ["nonce", 4],
      ["wormhole", 1 + place],
      ["reorg", 2 + place * 0.5],
      ["sniper", 3],
      ["lock", 3],
    ];
    const out: ItemKey[] = [];
    while (out.length < 3) {
      const k = this.weighted(pool.filter(([x]) => !out.includes(x)));
      out.push(k);
    }
    return out.sort((a, b) => ITEMS[a].price - ITEMS[b].price);
  }

  private async shop(ui: Ui, seat: number) {
    this.shopped = true;
    this.hap("shop");
    if (this.items[seat].length >= BAG) {
      await this.show(ui, { t: "bagFull", seat });
      return;
    }
    const offer = this.offer(seat);
    await this.show(ui, { t: "shop", seat, offer });
    const k = await this.ask(ui, { q: "shop", seat, offer });
    if (k < 0 || k >= offer.length) return;
    const item = offer[k];
    const price = ITEMS[item].price;
    if (this.coins[seat] < price) return;
    this.add(seat, -price);
    this.items[seat].push(item);
    this.hap("buy");
    await this.show(ui, { t: "buy", seat, item, price });
  }

  /** A low space under the MONSOON's flood. */
  flooded(i: number) {
    return this.flood > 0 && this.g.spaces[i].low;
  }

  private async land(ui: Ui, seat: number) {
    const sp = this.g.spaces[this.pos[seat]];
    await this.show(ui, { t: "land", seat, space: sp.i });
    if (this.flooded(sp.i)) {
      // (under the flood: SOAKED, whatever the space)
      this.stats.kinds.soaked = (this.stats.kinds.soaked ?? 0) + 1;
      this.hap("soaked");
      this.stats.unlucky[seat]++;
      const n = -this.add(seat, -SOAK);
      const to = this.floodBy;
      if (to >= 0 && to !== seat) this.add(to, n);
      await this.show(ui, { t: "soaked", seat, n, space: sp.i, to });
      return;
    }
    this.stats.kinds[sp.ev ?? sp.kind] = (this.stats.kinds[sp.ev ?? sp.kind] ?? 0) + 1;
    this.hap(`land:${sp.ev ?? sp.kind}`);
    const k2 = this.twist === "double" ? 2 : 1;
    if (sp.kind === "blue") await this.give(ui, seat, BLUE * k2);
    else if (sp.kind === "red") {
      this.stats.unlucky[seat]++;
      await this.give(ui, seat, -RED * k2);
    } else if (sp.kind === "lucky") await this.lucky(ui, seat);
    else if (sp.kind === "shop") {
      if (!this.shopped && this.coins[seat] >= 5) await this.shop(ui, seat);
      else await this.give(ui, seat, 2);
    } else if (sp.kind === "shor") {
      this.stats.unlucky[seat]++;
      await this.shor(ui, seat);
    } else if (sp.kind === "vs") await this.duel(ui, seat);
    else if (sp.kind === "event") {
      this.stats.events[seat]++;
      if (sp.ev === "metro") await this.metro(ui, seat);
      else if (sp.ev === "lever") await this.lever(ui, seat);
      else if (sp.ev === "ride") await this.ride(ui, seat);
      else if (sp.ev === "storm") await this.storm(ui, seat);
      else if (sp.ev === "lift") await this.lift(ui, seat);
      else if (sp.ev === "buran") await this.buran(ui, seat);
      else await this.wheel(ui, seat);
    }
  }

  private async lucky(ui: Ui, seat: number) {
    const full = this.items[seat].length >= BAG;
    const opts: LuckyOut[] = ["coins5", "coins10", "item", "tax"];
    const out = this.weighted<LuckyOut>([
      ["coins5", 3],
      ["coins10", 1.5],
      ["item", full ? 0 : 3.5],
      ["tax", 2],
    ]);
    this.hap(`lucky:${out}`);
    if (out === "item") {
      const item = this.weighted<ItemKey>([
        ["double", 4],
        ["triple", 2],
        ["nonce", 3],
        ["wormhole", 1.2],
        ["reorg", 1.5],
        ["sniper", 2],
        ["lock", 2],
      ]);
      this.items[seat].push(item);
      await this.show(ui, { t: "lucky", seat, out, opts, item, n: 0 });
    } else if (out === "tax") {
      // every rival chips in 3
      let got = 0;
      const deltas = [0, 0, 0, 0];
      for (const o of this.others(seat)) ((deltas[o] = this.add(o, -3)), (got -= deltas[o]));
      deltas[seat] = this.add(seat, got);
      await this.show(ui, { t: "lucky", seat, out, opts, n: got });
      await this.show(ui, { t: "coinsAll", deltas });
    } else {
      const n = out === "coins5" ? 5 : 10;
      await this.show(ui, { t: "lucky", seat, out, opts, n });
      await this.give(ui, seat, n);
    }
  }

  /** THE TRACKER, the chain-analysis bot that links transparent coins: his roulette of bad news. */
  private async shor(ui: Ui, seat: number) {
    this.stats.shor[seat]++;
    const st = this.standing();
    const opts: ShorOut[] = ["crack", "harvest", "swap", "charity", "decohere", "mercy"];
    if (this.blocks[seat] > 0) opts.splice(5, 0, "qblock");
    const w: [ShorOut, number][] = [
      ["crack", 3],
      ["harvest", this.coins[seat] >= 8 ? 2 : 0.5],
      ["swap", 2],
      ["charity", 2],
      ["decohere", this.items[seat].length ? 2 : 0],
      ["qblock", this.blocks[seat] > 0 ? 0.8 : 0],
      ["mercy", 1],
    ];
    const out = this.weighted(w);
    this.hap(`shor:${out}`);
    let target: number | undefined;
    let n = 0;
    if (out === "crack") n = -this.add(seat, -10);
    else if (out === "harvest") n = -this.add(seat, -Math.ceil(this.coins[seat] / 2));
    else if (out === "mercy") n = -this.add(seat, -1);
    else if (out === "swap") target = this.pick(this.others(seat));
    else if (out === "charity") {
      target = st[3] === seat ? st[2] : st[3];
      n = -this.add(seat, -10);
      this.add(target, n);
    } else if (out === "decohere") n = this.items[seat].length;
    else if (out === "qblock") n = 1;
    await this.show(ui, { t: "shor", seat, opts, out, target, n });
    if (out === "swap" && target !== undefined) {
      [this.pos[seat], this.pos[target]] = [this.pos[target], this.pos[seat]];
      await this.show(ui, { t: "swap", a: seat, b: target, why: "shor" });
    } else if (out === "decohere") this.items[seat] = [];
    else if (out === "qblock") this.blocks[seat] = Math.max(0, this.blocks[seat] - 1);
    await this.show(ui, { t: "shorGone", seat });
  }

  /** A VS space: a coin duel with a rival, both hit a dice block, the higher takes the stake. */
  private async duel(ui: Ui, seat: number) {
    const opts = this.others(seat);
    const rival = await this.ask(ui, { q: "target", seat, why: "duel", opts });
    const stakes = [5, 10, 15, 20];
    const stake = this.weighted<number>([
      [5, 3],
      [10, 4],
      [15, 2],
      [20, 1],
    ]);
    this.hap("duel");
    await this.show(ui, { t: "duel", seat, rival, stake, stakes });
    await this.ask(ui, { q: "hit", seat, k: 0 });
    let ra = this.d10(),
      rb = this.d10();
    // (no draws: a tie rolls again)
    for (let i = 0; ra === rb && i < 8; i++) ((ra = this.d10()), (rb = this.d10()));
    let n = 0;
    if (ra > rb) ((n = -this.add(rival, -stake)), this.add(seat, n));
    else if (rb > ra) ((n = -this.add(seat, -stake)), this.add(rival, n));
    await this.show(ui, { t: "duelRoll", seat, rival, ra, rb, stake, n });
  }

  /** The ZEC LINE: ride the train to any other station. */
  private async metro(ui: Ui, seat: number) {
    const from = this.pos[seat];
    const opts = this.g.stations.filter((s) => s !== from);
    if (!opts.length) return;
    const to = await this.ask(ui, { q: "station", seat, opts });
    const dest = opts.includes(to) ? to : opts[0];
    this.hap("metro");
    this.pos[seat] = dest;
    await this.show(ui, { t: "metro", seat, from, to: dest });
  }

  private async lever(ui: Ui, _seat: number) {
    await this.flipBridge(ui);
  }

  private async flipBridge(ui: Ui, auto = false) {
    this.bridgeUp = !this.bridgeUp;
    this.hap(this.bridgeUp ? "bridgeUp" : "bridgeDown");
    const knocked = this.bridgeUp ? [0, 1, 2, 3].filter((i) => this.g.bridge.includes(this.pos[i])) : [];
    for (const k of knocked) this.pos[k] = this.g.head;
    await this.show(ui, { t: "bridge", up: this.bridgeUp, knocked, to: this.g.head, auto });
  }

  /** The MEMPOOL's hash wheel: a spin for the whole board. */
  private async wheel(ui: Ui, seat: number) {
    const out = this.pick(WHEEL);
    this.hap(`wheel:${out}`);
    await this.show(ui, { t: "wheel", seat, out });
    if (out === "airdrop") await this.show(ui, { t: "coinsAll", deltas: [0, 1, 2, 3].map((i) => this.add(i, 5)) });
    else if (out === "burn") await this.show(ui, { t: "coinsAll", deltas: [0, 1, 2, 3].map((i) => this.add(i, -5)) });
    else if (out === "reward") await this.give(ui, seat, 10);
    else if (out === "flush") {
      // every coin pooled and shared out evenly
      const total = this.coins.reduce((a, b) => a + b, 0);
      const each = Math.floor(total / 4);
      await this.show(ui, { t: "coinsAll", deltas: [0, 1, 2, 3].map((i) => this.add(i, each - this.coins[i])) });
    } else if (out === "reorg") {
      const from = this.qAt;
      this.qAt = this.nextQ(from);
      await this.show(ui, { t: "qmove", from, to: this.qAt });
    } else await this.flipBridge(ui);
  }

  /** The sky wheel: one turn round, then down at the stop it faces this turn (a new one each turn). */
  stopNow() {
    return this.g.drops.length ? (this.turn - 1) % this.g.drops.length : -1;
  }
  private async ride(ui: Ui, seat: number) {
    const stop = this.stopNow();
    if (stop < 0) return;
    const from = this.pos[seat];
    const to = this.g.drops[stop];
    this.hap("ride");
    this.pos[seat] = to;
    await this.show(ui, { t: "ride", seat, from, to, stop });
  }

  /**
   * The MONSOON (`seat` called it): the bay floods the low spaces for FLOOD_TURNS turns. Whoever
   * stands on one now is soaked, and so is whoever lands on one while it lasts: SOAK coins each,
   * paid to the caller (the umbrella seller; their own soaking is just lost).
   */
  private async storm(ui: Ui, seat: number) {
    this.hap(this.flood > 0 ? "stormAgain" : "storm");
    this.flood = FLOOD_TURNS;
    this.floodBy = seat;
    const deltas = [0, 1, 2, 3].map((i) => (this.g.spaces[this.pos[i]].low ? this.add(i, -SOAK) : 0));
    let got = 0;
    for (let i = 0; i < 4; i++)
      if (deltas[i]) {
        this.stats.unlucky[i]++;
        this.hap("soakedStanding");
        if (i !== seat) got -= deltas[i];
      }
    deltas[seat] += this.add(seat, got);
    await this.show(ui, { t: "storm", seat, turns: FLOOD_TURNS, deltas });
  }

  /** NU7 QUARTER's ice run, stepped onto from `back`: it holds (one more crack) or gives way (true: the walk ends there). */
  private async onIce(ui: Ui, seat: number, back: number) {
    const odds = ICE_ODDS[Math.min(this.iceCracks, ICE_ODDS.length - 1)];
    const at = this.pos[seat];
    if (this.rnd() < odds) {
      this.hap("iceBreak");
      this.iceBroken = true;
      this.iceCracks = 0;
      this.thawAt = this.turn + ICE_THAW;
      this.pos[seat] = back;
      this.wet = true;
      this.stats.unlucky[seat]++;
      const n = -this.add(seat, -ICE_FINE);
      await this.show(ui, { t: "ice", seat, out: "break", cracks: 0, at, back, n });
      return true;
    }
    this.hap("iceSlide");
    this.iceCracks = Math.min(ICE_ODDS.length - 1, this.iceCracks + 1);
    await this.show(ui, { t: "ice", seat, out: "crack", cracks: this.iceCracks, at, back, n: 0 });
    return false;
  }

  /** The ice run refreezes: no cracks, open again. */
  private async freeze(ui: Ui, why: "thaw" | "buran") {
    this.iceBroken = false;
    this.iceCracks = 0;
    this.hap(`freeze:${why}`);
    await this.show(ui, { t: "freeze", why });
  }

  /** The NU7 TOWER LIFT: up to the golden crown, then a glide down to the drop zone picked. */
  private async lift(ui: Ui, seat: number) {
    const from = this.pos[seat];
    const opts = this.g.liftTo.filter((s) => s !== from);
    if (!opts.length) return;
    this.hap("lift");
    await this.show(ui, { t: "liftUp", seat, from });
    const to = await this.ask(ui, { q: "station", seat, opts, why: "lift" });
    const dest = opts.includes(to) ? to : opts[0];
    this.pos[seat] = dest;
    await this.show(ui, { t: "lift", seat, from, to: dest });
  }

  /** A BLIZZARD blows the three rivals back, and the ice run refreezes. */
  private async buran(ui: Ui, seat: number) {
    this.hap("buran");
    const moves: [number, number, number][] = [];
    for (const o of this.others(seat)) {
      const from = this.pos[o];
      const to = this.back(from, BURAN_BACK);
      if (to !== from) {
        this.pos[o] = to;
        moves.push([o, from, to]);
      }
    }
    await this.show(ui, { t: "buran", seat, moves });
    if (this.g.ice.length && (this.iceCracks > 0 || this.iceBroken)) await this.freeze(ui, "buran");
  }

  /** n spaces back along the way (its own path first; never onto the ice). */
  private back(from: number, n: number) {
    let at = from;
    for (let k = 0; k < n; k++) {
      const pr = this.g.spaces[at].prev.filter((p) => !this.g.spaces[p].ice);
      const same = pr.find((p) => this.g.spaces[p].path === this.g.spaces[at].path);
      const to = same ?? pr[0];
      if (to === undefined) break;
      at = to;
    }
    return at;
  }

  // ---- the rivals' minds -------------------------------------------------------------------------

  /** What a seat's own mind says (every AI, and the sim's stand-in human). */
  ai(q: Ask): number {
    const seat = q.seat;
    const sk = this.seats[seat].skill;
    const noise = (k: number) => (this.rnd() - 0.5) * k * (1.15 - sk);
    const canQ = this.coins[seat] >= Q_PRICE;
    switch (q.q) {
      case "hit":
        return 0;
      case "buyQ":
        return 1;
      case "rideIn": {
        // (when this turn's stop is nearer the Z-Block than the walk would get, give or take)
        const walkTo = Math.max(0, this.toQ(seat) - q.left);
        return this.dist(q.to, this.qAt) + 2 + noise(6) < walkTo ? 1 : 0;
      }
      case "shopIn": {
        // (saving up for a Z-Block close by: walk on, unless rich enough for both)
        const saving = this.toQ(seat) <= 14 && !canQ;
        return this.coins[seat] >= Q_PRICE + 5 || (!saving && this.coins[seat] >= 5) ? 1 : 0;
      }
      case "menu":
        return this.aiMenu(seat, noise);
      case "nonce":
        return this.aiNonce(seat);
      case "branch": {
        let best = 0,
          bestS = -Infinity;
        q.opts.forEach((e, i) => {
          let s = 0;
          const dq = (e.to === this.qAt ? 0 : this.dist(e.to, this.qAt)) + 1;
          const want = this.coins[seat] + 6 >= Q_PRICE;
          if (want) s -= dq * 1.2;
          else s += this.ahead(e.to, 9) - dq * 0.15;
          if (e.toll) s -= this.coins[seat] - e.toll >= Q_PRICE || !want ? e.toll * 0.35 : e.toll * 1.2;
          // (the ice run: its cracks are the risk of a cold bath)
          if (e.gate === "ice") s -= ICE_ODDS[Math.min(this.iceCracks, ICE_ODDS.length - 1)] * (want ? 12 : 7);
          s += noise(9);
          if (s > bestS) ((bestS = s), (best = i));
        });
        return best;
      }
      case "shop": {
        // (what to keep: the Z-Block's price when it is close, a little float otherwise)
        const keep = this.toQ(seat) <= 14 ? Q_PRICE : 4;
        let best = -1,
          bestU = 1.5;
        q.offer.forEach((it, i) => {
          const p = ITEMS[it].price;
          if (this.coins[seat] - p < keep && !(this.coins[seat] >= p && keep < Q_PRICE && sk < 0.4 && this.rnd() < 0.3)) return;
          const u = this.useful(seat, it) + noise(2.5);
          if (u > bestU) ((bestU = u), (best = i));
        });
        return best;
      }
      case "target": {
        const opts = q.opts;
        if (q.why === "reorg") return opts.reduce((a, b) => (this.toQ(b) < this.toQ(a) ? b : a));
        if (this.rnd() > 0.35 + sk * 0.6) return this.pick(opts);
        // the richest (duel, sniper)
        return opts.reduce((a, b) => (this.coins[b] > this.coins[a] ? b : a));
      }
      case "station": {
        const want = this.coins[seat] + 6 >= Q_PRICE;
        if (want && this.rnd() < 0.5 + sk * 0.5) return q.opts.reduce((a, b) => (this.dist(b, this.qAt) < this.dist(a, this.qAt) ? b : a));
        return q.opts.reduce((a, b) => (this.ahead(b, 8) + noise(4) > this.ahead(a, 8) ? b : a));
      }
    }
  }

  /** How good the next n spaces along the way are (the AI's nose for a path). */
  private ahead(from: number, n: number) {
    let s = 0;
    let at = from;
    for (let k = 0; k < n; k++) {
      const sp = this.g.spaces[at];
      const w = 1 - k / (n + 2);
      s += w * (this.flooded(at) ? -2 : sp.kind === "blue" ? 1 : sp.kind === "red" ? -1.6 : sp.kind === "lucky" ? 1.6 : sp.kind === "shor" ? -2.2 : sp.kind === "event" ? 1 : sp.kind === "shop" ? 0.4 : 0.2);
      if (this.traps.has(at)) s -= 2 * w;
      const nx = this.open(at);
      if (!nx.length) break;
      at = nx[0].to;
    }
    return s;
  }

  /** How much an item would help this seat now. */
  private useful(seat: number, it: ItemKey) {
    const d = this.toQ(seat);
    const late = this.turn >= this.turns - 1;
    switch (it) {
      case "double":
        return late ? 1 : 2.6;
      case "triple":
        return late ? 1 : 3.4;
      case "nonce":
        return d <= 18 ? 3.6 : 2.4;
      case "wormhole":
        return d > 14 ? 4.4 : 2;
      case "reorg":
        return 2.4;
      case "sniper":
        return Math.max(...this.others(seat).map((o) => this.coins[o])) >= 12 ? 3 : 1.4;
      case "lock":
        return 1.8;
    }
  }

  private aiMenu(seat: number, noise: (k: number) => number): number {
    const it = this.items[seat];
    if (!it.length) return -1;
    const sk = this.seats[seat].skill;
    const d = this.toQ(seat);
    const c = this.coins[seat];
    const want = c >= Q_PRICE - 3;
    const idx = (k: ItemKey) => it.indexOf(k);
    const last = this.turn === this.turns;
    // (a weak one forgets its bag now and then)
    if (this.rnd() < 0.25 * (1 - sk)) return -1;
    if (idx("wormhole") >= 0 && c >= Q_PRICE && d > 11) return idx("wormhole");
    if (idx("nonce") >= 0 && want && d >= 1 && d <= 10) return idx("nonce");
    if (idx("triple") >= 0 && want && d > 11 && d <= 30) return idx("triple");
    if (idx("double") >= 0 && want && d > 6 && d <= 20) return idx("double");
    if (idx("reorg") >= 0 && c >= Q_PRICE - 6) {
      const best = this.others(seat).reduce((a, b) => (this.toQ(b) < this.toQ(a) ? b : a));
      if (this.toQ(best) + 8 < d) return idx("reorg");
    }
    if (idx("sniper") >= 0) {
      const rich = this.others(seat).reduce((a, b) => (this.coins[b] > this.coins[a] ? b : a));
      if (this.coins[rich] >= 10 && (c < Q_PRICE || sk > 0.6 || last)) return idx("sniper");
    }
    if (idx("lock") >= 0 && !this.traps.has(this.pos[seat])) {
      // (a lock pays when rivals come this way soon)
      const behind = this.others(seat).filter((o) => this.dist(this.pos[o], this.pos[seat]) <= 12).length;
      if (behind >= 1 && this.rnd() < 0.45 + behind * 0.15 + noise(0.3)) return idx("lock");
    }
    // the last turns: use the dice ones anyway (more steps, more chances)
    if (this.turn >= this.turns - 1) for (const k of ["triple", "double"] as ItemKey[]) if (idx(k) >= 0) return idx(k);
    return -1;
  }

  /** CUSTOM NONCE: right onto (well, past) the Z-Block if it's in reach, else the best landing. */
  private aiNonce(seat: number) {
    const d = this.toQ(seat);
    if (d >= 1 && d <= 10 && this.coins[seat] >= Q_PRICE) {
      // past it, onto the best space up to 10
      let best = d,
        bestS = -Infinity;
      for (let v = d; v <= 10; v++) {
        const s = this.landValue(this.pos[seat], v) - (v - d) * 0.05;
        if (s > bestS) ((bestS = s), (best = v));
      }
      return best;
    }
    let best = 10,
      bestS = -Infinity;
    for (let v = 1; v <= 10; v++) {
      const s = this.landValue(this.pos[seat], v) + v * 0.08;
      if (s > bestS) ((bestS = s), (best = v));
    }
    return best;
  }

  /** The space n steps ahead along the first ways, valued. */
  private landValue(from: number, n: number) {
    let at = from;
    for (let k = 0; k < n; k++) {
      const nx = this.open(at);
      at = nx[0]?.to ?? at;
    }
    const sp = this.g.spaces[at];
    if (this.flooded(at)) return -2.4;
    return sp.kind === "blue" ? 1 : sp.kind === "red" ? -2 : sp.kind === "lucky" ? 2 : sp.kind === "shor" ? -3 : sp.kind === "event" ? 1.4 : sp.kind === "vs" ? 0.3 : 0.6;
  }
}
