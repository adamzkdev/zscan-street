/**
 * BLOCK BARONS: the zkSNARK barons. Each AI weighs the board with one valuation (`value()`: cash,
 * deeds, districts made or nearly made, the lines, minus the threat of rivals' districts), and lets
 * its skill (0…1) and its persona bend the numbers: how much cash it keeps in reserve, how high it
 * bids, how eager it is to trade, how fast it builds. No DOM: the sims run it in Node.
 */
import { GROUPS, GROUP_SPACES, LINES, N, OWNABLE, SPACES, UTILS } from "./board";
import { BANK, rng, type Agent, type Game, type Offer } from "./engine";

export interface Persona {
  key: string;
  en: string;
  zh: string;
  /** × the cash it keeps back. */
  reserve: number;
  /** × its auction bids. */
  bid: number;
  /** × how often it proposes trades. */
  trade: number;
  /** × how keen it is to build. */
  build: number;
  /** × the value it puts on the ZEC LINE. */
  lines: number;
}

export const PERSONAS: Persona[] = [
  { key: "shark", en: "The Shark", zh: "鲨鱼", reserve: 0.75, bid: 1.12, trade: 1.2, build: 1.25, lines: 1 },
  { key: "hodler", en: "The Hodler", zh: "死拿派", reserve: 1.6, bid: 0.85, trade: 0.7, build: 0.8, lines: 1 },
  { key: "commuter", en: "The Commuter", zh: "通勤族", reserve: 1, bid: 1, trade: 1, build: 1, lines: 1.5 },
  { key: "gambler", en: "The Gambler", zh: "赌徒", reserve: 0.5, bid: 1.25, trade: 1, build: 1.3, lines: 1 },
  { key: "builder", en: "The Builder", zh: "建造者", reserve: 0.9, bid: 1, trade: 0.9, build: 1.45, lines: 0.9 },
  { key: "diplomat", en: "The Diplomat", zh: "外交家", reserve: 1.1, bid: 0.95, trade: 1.6, build: 1, lines: 1 },
];

/** A deed's spot in the valuation: who owns it and whether it is collateralised. */
interface View {
  owner: Int8Array;
  mort: Uint8Array;
  cash: number[];
  pardons: number[];
}

function snapshot(g: Game): View {
  const owner = new Int8Array(N).fill(-1);
  const mort = new Uint8Array(N);
  for (const i of OWNABLE) {
    owner[i] = g.deeds[i]!.owner;
    mort[i] = g.deeds[i]!.mortgaged ? 1 : 0;
  }
  return { owner, mort, cash: g.p.map((b) => b.cash), pardons: g.p.map((b) => b.pardons.length) };
}

/** The same view after the offer went through. */
function after(v: View, o: Offer): View {
  const owner = v.owner.slice();
  for (const i of o.give) owner[i] = o.to;
  for (const i of o.get) owner[i] = o.from;
  const cash = v.cash.slice();
  cash[o.from] += o.getCash - o.giveCash;
  cash[o.to] += o.giveCash - o.getCash;
  const pardons = v.pardons.slice();
  pardons[o.from] += o.getPardon - o.givePardon;
  pardons[o.to] += o.givePardon - o.getPardon;
  return { owner, mort: v.mort, cash, pardons };
}

const LINE_X = [0, 1, 2.25, 3.7, 5.4];
const UTIL_X = [0, 1, 2.3];
/** What a full district is worth against its price (its rent doubles, then miners). */
const MONO = 2.3;

/**
 * How good this position is for `seat`, in credits. `threat` (0…1): how much it fears a rival's
 * full district (the skilled fear it more). Levels (miners) come from the live game.
 */
export function value(g: Game, v: View, seat: number, threat = 0.5, lineK = 1): number {
  let w = v.cash[seat] + v.pardons[seat] * 30;
  for (let gi = 0; gi < GROUPS.length; gi++) {
    const sp = GROUP_SPACES[gi];
    let mine = 0,
      sumMine = 0,
      sumAll = 0;
    const others = new Set<number>();
    for (const i of sp) {
      const pr = SPACES[i].price!;
      sumAll += pr;
      if (v.owner[i] === seat) {
        mine++;
        sumMine += pr;
      } else if (v.owner[i] >= 0) others.add(v.owner[i]);
    }
    if (mine === sp.length) {
      w += sumAll * MONO;
      for (const i of sp) w += g.deeds[i]!.level * GROUPS[gi].build * 0.95;
    } else if (mine > 0) {
      let x = sumMine * (1 + 0.18 * (mine - 1));
      const rest = sp.length - mine;
      // one away from the district, the last deed still in the bank: a fair chance
      if (rest === 1 && others.size === 0) x += 0.25 * sumMine;
      // a single rival holds the rest: this one is the key they need (a bargaining chip)
      if (others.size === 1) x += 0.25 * sumMine;
      w += x;
    } else if (others.size === 1) {
      // a rival's full district: the rent it will cost everyone
      const o = [...others][0];
      if (sp.every((i) => v.owner[i] === o)) {
        let lv = 0;
        for (const i of sp) lv += g.deeds[i]!.level;
        w -= threat * (sumAll * 0.75 + lv * GROUPS[gi].build * 0.6);
      }
    }
  }
  let ln = 0,
    ut = 0;
  for (const i of LINES) if (v.owner[i] === seat) ln++;
  for (const i of UTILS) if (v.owner[i] === seat) ut++;
  w += 200 * LINE_X[ln] * lineK + 150 * UTIL_X[ut];
  // collateral is a debt
  for (const i of OWNABLE) if (v.owner[i] === seat && v.mort[i]) w -= Math.ceil(SPACES[i].price! * 0.55);
  return w;
}

const groupOf = (i: number) => (SPACES[i].kind === "deed" ? SPACES[i].group! : -1);

export class Baron implements Agent {
  readonly r: () => number;
  /** Per target: the round it was last offered a trade. */
  private lastOffer = new Map<number, number>();
  private offeredThisTurn = false;

  readonly seat: number;
  readonly skill: number;
  readonly persona: Persona;

  constructor(seat: number, skill: number, persona: Persona, seed: number) {
    this.seat = seat;
    this.skill = skill;
    this.persona = persona;
    this.r = rng(seed * 7919 + seat * 104729 + 13);
  }

  get threat() {
    return 0.2 + 0.45 * this.skill;
  }
  private val(g: Game, v: View, seat = this.seat) {
    return value(g, v, seat, this.threat, seat === this.seat ? this.persona.lines : 1);
  }
  /** How much cash it wants to keep: more when rivals have built, more for the careful. */
  reserve(g: Game) {
    let top = 0;
    for (const i of OWNABLE) {
      const d = g.deeds[i]!;
      if (d.owner >= 0 && d.owner !== this.seat && !d.mortgaged) top = Math.max(top, g.rent(i, 7));
    }
    const early = OWNABLE.filter((i) => g.deeds[i]!.owner === BANK).length > 12;
    // the skilled keep just what the likely rents need; the weak fear (or forget) them
    let base = early ? 50 : 60 + top * (0.32 - 0.2 * this.skill);
    // the last rounds of a timed game: what counts is worth, and miners count at cost
    if (g.cfg.mode !== "classic" && g.rounds - g.round <= 2) base *= 1 - 0.6 * this.skill;
    const noise = 1 + (this.r() - 0.5) * (1 - this.skill) * 1.2;
    return Math.min(900, base * this.persona.reserve * noise);
  }

  // ---- decisions ---------------------------------------------------------------------------------

  async buy(g: Game, seat: number, i: number) {
    const s = SPACES[i];
    const b = g.p[seat];
    const v = snapshot(g);
    const now = this.val(g, v);
    v.owner[i] = seat;
    v.cash[seat] -= s.price!;
    const gain = this.val(g, v) - now;
    const left = b.cash - s.price!;
    const gi = groupOf(i);
    const completes = gi >= 0 && GROUP_SPACES[gi].every((j) => j === i || g.deeds[j]!.owner === seat);
    // a rival would be one deed from (or at) a full district without it
    const blocks = gi >= 0 && new Set(GROUP_SPACES[gi].filter((j) => j !== i).map((j) => g.deeds[j]!.owner)).size === 1 && g.deeds[GROUP_SPACES[gi].find((j) => j !== i)!]!.owner >= 0 && g.deeds[GROUP_SPACES[gi].find((j) => j !== i)!]!.owner !== seat;
    let yes: boolean;
    if (completes) yes = left >= 0;
    else if (blocks) yes = left >= 30;
    else yes = gain > -s.price! * 0.15 && left >= this.reserve(g) * 0.6;
    // a street baron's whims
    if (this.r() < (1 - this.skill) * 0.12) yes = !yes && left >= 0;
    g.say(seat, yes ? (completes ? "complete" : "buy") : "pass");
    return yes;
  }

  async bid(g: Game, seat: number, i: number) {
    const s = SPACES[i];
    const b = g.p[seat];
    const v = snapshot(g);
    const now = this.val(g, v);
    v.owner[i] = seat;
    let worth = this.val(g, v) - now;
    // keeping it from a rival who would complete a district is worth something too
    const gi = groupOf(i);
    if (gi >= 0) {
      const rest = GROUP_SPACES[gi].filter((j) => j !== i).map((j) => g.deeds[j]!.owner);
      if (rest.length && rest.every((o) => o === rest[0] && o >= 0 && o !== seat)) worth = Math.max(worth, s.price! * (1.1 + 0.5 * this.skill));
    }
    worth = Math.max(worth, s.price! * 0.5);
    const cap = b.cash - Math.min(this.reserve(g) * 0.5, b.cash * 0.3);
    const shade = 0.62 + 0.2 * this.r() + 0.12 * this.skill;
    let x = Math.min(cap, worth * this.persona.bid * shade);
    x = Math.floor(x / 5) * 5;
    return x >= 10 ? x : 0;
  }

  async jail(g: Game, seat: number) {
    const b = g.p[seat];
    const free = OWNABLE.filter((i) => g.deeds[i]!.owner === BANK).length;
    // late game, rivals built: the Penitentiary is the safest place on the board (the skilled know)
    let built = 0;
    for (const i of OWNABLE) if (g.deeds[i]!.owner >= 0 && g.deeds[i]!.owner !== seat && g.deeds[i]!.level >= 2) built++;
    const stay = free <= 4 && built >= 3 && this.r() < this.skill;
    if (stay) return "roll" as const;
    if (b.pardons.length) return "pardon" as const;
    if (b.cash >= 50 + this.reserve(g) * 0.5 && (free > 6 || this.r() < 0.5)) {
      g.say(seat, "jailpay");
      return "pay" as const;
    }
    return "roll" as const;
  }

  async raise(g: Game, seat: number, owed: number) {
    const b = g.p[seat];
    if (g.liquid(seat) < owed) return; // nothing will save it: the creditor takes it all
    g.say(seat, "broke");
    const v = snapshot(g);
    // the deeds it least minds pledging: those outside a full district, least strategic first
    const loose = () =>
      g
        .owned(seat)
        .filter((i) => g.canMortgage(seat, i) && (groupOf(i) < 0 || !g.full(seat, groupOf(i))))
        .sort((a, c) => this.keep(g, v, a) - this.keep(g, v, c));
    for (const i of loose()) {
      if (b.cash >= owed) return;
      g.mortgage(seat, i);
    }
    // then the miners, from the cheapest district, evenly
    for (let guard = 0; b.cash < owed && guard < 200; guard++) {
      const built = g.owned(seat).filter((i) => g.canSell(seat, i));
      if (!built.length) break;
      built.sort((a, c) => GROUPS[groupOf(a)].build - GROUPS[groupOf(c)].build || g.deeds[c]!.level - g.deeds[a]!.level);
      g.sell(seat, built[0]);
    }
    for (const i of g.owned(seat).sort((a, c) => SPACES[a].price! - SPACES[c].price!)) {
      if (b.cash >= owed) return;
      g.mortgage(seat, i);
    }
  }
  /** How much it wants to keep this deed (lower: pledged first). */
  private keep(g: Game, v: View, i: number) {
    const w = this.val(g, v);
    const o = v.owner[i];
    v.owner[i] = -1;
    const x = w - this.val(g, v);
    v.owner[i] = o;
    return x / SPACES[i].price!;
  }

  async manage(g: Game, seat: number, phase: "pre" | "post") {
    const b = g.p[seat];
    if (phase === "pre") this.offeredThisTurn = false;
    // a weak baron sometimes forgets to tend its streets
    if (this.r() < (1 - this.skill) * 0.45) return;
    const reserve = this.reserve(g);
    // free a full district's collateral first, then build it up evenly (to 3 first: the sweet spot)
    for (let gi = 0; gi < GROUPS.length; gi++) {
      if (!g.full(seat, gi)) continue;
      for (const i of GROUP_SPACES[gi]) if (g.deeds[i]!.mortgaged && b.cash - g.redeemCost(i) >= reserve) g.redeem(seat, i);
    }
    const target = this.skill > 0.5 ? 3 : 5;
    for (let pass = 0; pass < 2; pass++) {
      const cap = pass === 0 ? target : 5;
      for (let guard = 0; guard < 60; guard++) {
        const can = g.owned(seat).filter((i) => g.canBuild(seat, i) && g.deeds[i]!.level < cap && b.cash - g.buildCost(i) >= reserve / this.persona.build);
        if (!can.length) break;
        // the best rent added per credit
        can.sort((a, c) => this.gainOf(g, c) - this.gainOf(g, a));
        g.build(seat, can[0]);
        if (g.deeds[can[0]]!.level === 5) g.say(seat, "foundry");
        else if (guard === 0) g.say(seat, "build");
      }
    }
    // spare cash: redeem the rest
    for (const i of g.owned(seat)) if (g.deeds[i]!.mortgaged && b.cash - g.redeemCost(i) >= reserve * 2.2) g.redeem(seat, i);
    await g.flush();
    if (phase === "pre" && !this.offeredThisTurn) {
      this.offeredThisTurn = true;
      if (this.r() < 0.45 * this.persona.trade) {
        const o = this.findTrade(g, seat);
        if (o) {
          this.lastOffer.set(o.to, g.round);
          g.say(seat, "offer");
          await g.flush();
          await g.propose(o);
          await this.manage(g, seat, "post");
        }
      }
    }
  }
  private gainOf(g: Game, i: number) {
    const s = SPACES[i];
    const d = g.deeds[i]!;
    return (s.rent![d.level + 1] - (d.level ? s.rent![d.level] : s.rent![0] * 2)) / GROUPS[s.group!].build;
  }

  // ---- trades ------------------------------------------------------------------------------------

  /** Would `seat` (as this baron models it) take the offer? (dGain for `seat`, dGain for the other) */
  judge(g: Game, o: Offer, seat: number, skill = this.skill) {
    const v = snapshot(g);
    const w = after(v, o);
    const other = seat === o.to ? o.from : o.to;
    const th = 0.2 + 0.45 * skill;
    const mine = value(g, w, seat, th) - value(g, v, seat, th);
    const theirs = value(g, w, other, th) - value(g, v, other, th);
    return { mine, theirs };
  }
  private fairK(skill = this.skill) {
    return 0.15 + 0.6 * skill;
  }
  private margin(o: Offer) {
    let moved = o.giveCash + o.getCash;
    for (const i of [...o.give, ...o.get]) moved += SPACES[i].price!;
    return 15 + moved * 0.04;
  }
  private accepts(g: Game, o: Offer, skill: number) {
    const { mine, theirs } = this.judge(g, o, o.to, skill);
    return mine >= this.margin(o) && mine >= this.fairK(skill) * theirs;
  }

  async answer(g: Game, o: Offer): Promise<"yes" | "no" | Offer> {
    const me = o.to;
    const { mine, theirs } = this.judge(g, o, me);
    const need = this.margin(o);
    const k = this.fairK();
    // a little whim from the weak
    const noise = (this.r() - 0.5) * (1 - this.skill) * need * 4;
    if (mine + noise >= need && mine + noise >= k * theirs) {
      g.say(me, "deal");
      return "yes";
    }
    // how much more cash would make it fair, and can they pay it?
    const x = Math.ceil(Math.max(need - mine, (k * theirs - mine) / (1 + k)) / 10) * 10;
    const p = g.p[o.from];
    const room = p.cash - o.giveCash + o.getCash;
    const priceMoved = [...o.give, ...o.get].reduce((s, i) => s + SPACES[i].price!, 0);
    if (x > 0 && x <= room && x <= Math.max(300, priceMoved * 2.5) && this.r() < 0.4 + 0.5 * this.skill) {
      // the counter, from this seat's side: the same deeds, more cash coming its way
      const back = Math.min(x, o.getCash);
      const c: Offer = { from: me, to: o.from, give: o.get.slice(), get: o.give.slice(), giveCash: o.getCash - back, getCash: o.giveCash + (x - back), givePardon: o.getPardon, getPardon: o.givePardon };
      if (g.validOffer(c)) {
        g.say(me, "counter");
        return c;
      }
    }
    g.say(me, "nodeal");
    return "no";
  }

  /** The deal it would like to put to someone now, or null. */
  findTrade(g: Game, seat: number): Offer | null {
    const b = g.p[seat];
    const reserve = this.reserve(g);
    let best: Offer | null = null;
    let bestGain = 0;
    const v = snapshot(g);
    const spare = Math.max(0, b.cash - reserve * 0.5);
    const loose = g.owned(seat).filter((i) => g.tradable(i) && (groupOf(i) < 0 || !g.full(seat, groupOf(i))));
    const consider = (o: Offer, theirSkill: number) => {
      if (!g.validOffer(o)) return;
      const { mine } = this.judge(g, o, seat);
      if (mine <= 40 + 40 * this.skill) return;
      // only what it thinks they would take (it knows its rivals' measure)
      if (!this.accepts(g, o, theirSkill)) return;
      if (mine > bestGain) ((bestGain = mine), (best = o));
    };
    for (let gi = 0; gi < GROUPS.length; gi++) {
      const sp = GROUP_SPACES[gi];
      if (g.groupBuilt(gi)) continue;
      const mineN = sp.filter((i) => v.owner[i] === seat).length;
      for (const h of new Set(sp.map((i) => v.owner[i]))) {
        if (h < 0 || h === seat || g.p[h].out) continue;
        const cool = this.lastOffer.get(h);
        if (cool !== undefined && g.round - cool < (g.agents[h] instanceof Baron ? 2 : 3)) continue;
        const theirSkill = g.agents[h] instanceof Baron ? (g.agents[h] as Baron).skill : 0.6;
        const theirs = sp.filter((i) => v.owner[i] === h);
        const base = (give: number[], get: number[], cash: number, back = 0): Offer => ({ from: seat, to: h, give, get, giveCash: cash, getCash: back, givePardon: 0, getPardon: 0 });
        // buy: their part of a district it is (nearly) making
        if (mineN && mineN + theirs.length >= sp.length - 1) {
          const price = theirs.reduce((s, i) => s + SPACES[i].price!, 0);
          for (const k of [1, 1.4, 1.9, 2.5, 3.2]) {
            const c = Math.round((price * k) / 10) * 10;
            if (c <= spare) consider(base([], theirs, c), theirSkill);
          }
          // or swap a deed of ours they would love, cash either way
          for (const d of loose) {
            if (sp.includes(d)) continue;
            for (const c of [0, 50, 100, 200, -50, -100, -200]) {
              if (c > spare || -c > g.p[h].cash) continue;
              consider(base([d], theirs, Math.max(0, c), Math.max(0, -c)), theirSkill);
            }
          }
        }
        // sell: the key deed they lack, at a price that pays for the threat it creates
        if (mineN && mineN + theirs.length === sp.length && theirs.length >= sp.length - 1 && mineN <= 1) {
          const mineDeeds = sp.filter((i) => v.owner[i] === seat);
          const price = mineDeeds.reduce((s, i) => s + SPACES[i].price!, 0);
          for (const k of [1.8, 2.4, 3, 3.8]) {
            const c = Math.round((price * k) / 10) * 10;
            if (c <= g.p[h].cash) consider(base(mineDeeds, [], 0, c), theirSkill);
          }
        }
      }
    }
    return best;
  }
}

/** A seat's persona, from the seed (different at each table). */
export function personaOf(seed: number, seat: number) {
  return PERSONAS[Math.abs((seed * 31 + seat * 17) >>> 0) % PERSONAS.length];
}
