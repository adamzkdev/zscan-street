/**
 * The zkSNARKs at the table. Each one has a style (rock, tight-passive, solid, loose-aggressive,
 * calling station, maniac) scaled by its skill, and decides from what it may see only (`SeatView`:
 * its own two cards and the public actions). It estimates its equity by Monte Carlo against the
 * ranges the others' actions suggest (seeded, a few hundred deals), weighs pot odds, position and
 * stack depth, bluffs and semi-bluffs at its style's rate, and sizes its bets in round numbers.
 */
import type { Rnd } from "./cards";
import { category, evaluate, rankAt } from "./eval";
import type { Action, Line, SeatView } from "./engine";
import { COMBOS, handPct } from "./preflop";

export type Style = "rock" | "passive" | "solid" | "lag" | "station" | "maniac";
export const STYLES: Style[] = ["rock", "passive", "solid", "lag", "station", "maniac"];

interface StyleDef {
  /** How many hands it plays and raises (preflop fractions, at a full table). */
  vpip: number;
  pfr: number;
  /** Postflop: how often it bets and raises rather than calls. */
  agg: number;
  /** Pure bluffs. */
  bluff: number;
  /** Calls down lighter (+) or folds more (−) than the pot odds say. */
  sticky: number;
  /** Open-limps instead of raising. */
  limp: number;
  /** Slow-plays a monster. */
  slow: number;
  /** Bet sizes, times the usual. */
  size: number;
}
export const STYLE: Record<Style, StyleDef> = {
  rock: { vpip: 0.13, pfr: 0.1, agg: 0.42, bluff: 0.03, sticky: -0.07, limp: 0.05, slow: 0.15, size: 1 },
  passive: { vpip: 0.22, pfr: 0.06, agg: 0.2, bluff: 0.03, sticky: 0.04, limp: 0.65, slow: 0.35, size: 0.8 },
  solid: { vpip: 0.24, pfr: 0.19, agg: 0.62, bluff: 0.1, sticky: 0, limp: 0.03, slow: 0.12, size: 1 },
  lag: { vpip: 0.36, pfr: 0.28, agg: 0.78, bluff: 0.2, sticky: 0.02, limp: 0.04, slow: 0.08, size: 1.1 },
  station: { vpip: 0.5, pfr: 0.07, agg: 0.16, bluff: 0.03, sticky: 0.2, limp: 0.75, slow: 0.25, size: 0.8 },
  maniac: { vpip: 0.62, pfr: 0.46, agg: 0.93, bluff: 0.36, sticky: 0.1, limp: 0.08, slow: 0.04, size: 1.45 },
};
export const STYLE_NAME: Record<Style, { en: string; zh: string }> = {
  rock: { en: "Rock", zh: "石头" },
  passive: { en: "Tight-passive", zh: "紧弱" },
  solid: { en: "Solid", zh: "稳健" },
  lag: { en: "Loose-aggressive", zh: "松凶" },
  station: { en: "Calling station", zh: "跟注站" },
  maniac: { en: "Maniac", zh: "疯子" },
};

export interface Persona {
  style: Style;
  /** 0…1. */
  skill: number;
}

// ---- reads: what everyone can see of everyone ----------------------------------------------

/** Public stats per seat, from the actions seen (VPIP, PFR, postflop aggression). */
export class Reads {
  hands: number[];
  vpip: number[];
  pfr: number[];
  aggr: number[];
  calls: number[];
  constructor(n: number) {
    this.hands = new Array(n).fill(0);
    this.vpip = new Array(n).fill(0);
    this.pfr = new Array(n).fill(0);
    this.aggr = new Array(n).fill(0);
    this.calls = new Array(n).fill(0);
  }
  /** After a hand: its public lines, and who was dealt in. */
  learn(lines: Line[], dealt: number[]) {
    for (const s of dealt) {
      this.hands[s]++;
      const pre = lines.filter((l) => l.seat === s && l.street === 0);
      if (pre.some((l) => l.said === "call" || l.said === "raise" || l.said === "bet")) this.vpip[s]++;
      if (pre.some((l) => l.said === "raise" || l.said === "bet")) this.pfr[s]++;
      for (const l of lines)
        if (l.seat === s && l.street > 0) {
          if (l.said === "bet" || l.said === "raise") this.aggr[s]++;
          else if (l.said === "call") this.calls[s]++;
        }
    }
  }
  /** Estimates with a prior (an average player) that fades as hands come in. */
  vpipOf(s: number) {
    return (this.vpip[s] + 0.3 * 8) / (this.hands[s] + 8);
  }
  pfrOf(s: number) {
    return (this.pfr[s] + 0.17 * 8) / (this.hands[s] + 8);
  }
  /** Postflop: bets and raises per call (about 1 is average). */
  afOf(s: number) {
    return (this.aggr[s] + 2) / (this.calls[s] + 2);
  }
}

// ---- the Monte Carlo -------------------------------------------------------------------------

interface Opp {
  /** Has put money in by choice this hand (preflop: the others are expected to fold). */
  acted: boolean;
  /** Top fraction of hands its preflop action allows. */
  pct: number;
  /** Per street (1 flop, 2 turn, 3 river): 0 no info, 1 called, 2 bet or raised. */
  post: number[];
  /** How often its bets are air (from its aggression). */
  air: number;
}

const used = new Uint8Array(52);
const scratch = new Uint8Array(52);
const seven = new Int32Array(7);
const oppCards = new Int32Array(16);
const board5 = new Int32Array(5);
const streetInfo = { cat: [0, 0, 0, 0], top: [0, 0, 0, 0], len: [0, 3, 4, 5] };

/** A hand's showing on a board: 3 two pair or better (its own), 2 top pair or an overpair, 1 a weaker pair or a draw, 0 air. */
function strength(c1: number, c2: number, board: ArrayLike<number>, n: number, boardCat: number, boardTop: number) {
  seven[0] = c1;
  seven[1] = c2;
  for (let i = 0; i < n; i++) seven[2 + i] = board[i];
  const s = evaluate(seven, n + 2);
  const cat = category(s);
  if (cat >= 2 && cat > boardCat) return 3;
  if (cat === 1 && boardCat === 0) return rankAt(s, 0) >= boardTop ? 2 : 1;
  if (n < 5) {
    // a flush draw with a hole card in it
    const s1 = c1 & 3,
      s2 = c2 & 3;
    let k1 = 1,
      k2 = 1;
    for (let i = 0; i < n; i++) {
      if ((board[i] & 3) === s1) k1++;
      if ((board[i] & 3) === s2) k2++;
    }
    if (s1 === s2) k1++;
    if (k1 >= 4 || k2 >= 4) return 1;
    // an open-ended straight draw
    let m = (1 << (c1 >> 2)) | (1 << (c2 >> 2));
    for (let i = 0; i < n; i++) m |= 1 << (board[i] >> 2);
    for (let lo = 0; lo <= 8; lo++) if (((m >> lo) & 15) === 15) return 1;
  }
  return 0;
}

/** Odds that its action is taken with a hand of this strength (rows: called, bet). */
const ACCEPT = [
  [0.32, 0.72, 1, 0.85],
  [0.2, 0.5, 0.88, 1],
];

function sampleOpp(o: Opp, board: number[], street: number, rnd: Rnd, slot: number) {
  const K = Math.max(24, Math.min(1326, Math.round(o.pct * 1326)));
  let c1 = -1,
    c2 = -1;
  for (let tries = 0; tries < 30; tries++) {
    const combo = COMBOS[Math.floor(rnd() * K)];
    const a = (combo / 52) | 0,
      b = combo % 52;
    if (scratch[a] || scratch[b]) continue;
    c1 = a;
    c2 = b;
    let ok = true;
    for (let s = 1; s <= street && ok && tries < 22; s++) {
      const act = o.post[s];
      if (!act) continue;
      const cls = strength(a, b, board, streetInfo.len[s], streetInfo.cat[s], streetInfo.top[s]);
      let p = ACCEPT[act - 1][cls];
      if (act === 2 && cls === 0) p = o.air;
      if (rnd() > p) ok = false;
    }
    if (ok) break;
  }
  if (c1 < 0) {
    // (a range all blocked: any two cards)
    do c1 = Math.floor(rnd() * 52);
    while (scratch[c1]);
    scratch[c1] = 1;
    do c2 = Math.floor(rnd() * 52);
    while (scratch[c2]);
  }
  scratch[c1] = 1;
  scratch[c2] = 1;
  oppCards[slot * 2] = c1;
  oppCards[slot * 2 + 1] = c2;
}

/** My share of the pot if everything went to showdown, against these ranges (0…1). */
export function equity(hole: number[], board: number[], opps: Opp[], iters: number, rnd: Rnd): number {
  used.fill(0);
  for (const c of hole) used[c] = 1;
  for (const c of board) used[c] = 1;
  const street = board.length === 0 ? 0 : board.length - 2;
  for (let s = 1; s <= street; s++) {
    const n = streetInfo.len[s];
    const sc = evaluate(board, n);
    streetInfo.cat[s] = category(sc);
    let top = 0;
    for (let i = 0; i < n; i++) top = Math.max(top, board[i] >> 2);
    streetInfo.top[s] = top;
  }
  let win = 0;
  for (let it = 0; it < iters; it++) {
    scratch.set(used);
    for (let o = 0; o < opps.length; o++) sampleOpp(opps[o], board, street, rnd, o);
    for (let i = 0; i < 5; i++) {
      if (i < board.length) board5[i] = board[i];
      else {
        let c: number;
        do c = Math.floor(rnd() * 52);
        while (scratch[c]);
        scratch[c] = 1;
        board5[i] = c;
      }
    }
    seven[0] = hole[0];
    seven[1] = hole[1];
    for (let i = 0; i < 5; i++) seven[2 + i] = board5[i];
    const me = evaluate(seven, 7);
    let best = -1,
      ties = 0;
    for (let o = 0; o < opps.length; o++) {
      seven[0] = oppCards[o * 2];
      seven[1] = oppCards[o * 2 + 1];
      const s = evaluate(seven, 7);
      if (s > best) {
        best = s;
        ties = 0;
      }
      if (s === best) ties++;
    }
    if (me > best) win += 1;
    else if (me === best) win += 1 / (ties + 1);
  }
  return win / iters;
}

// ---- the decision ----------------------------------------------------------------------------

export interface Decision {
  action: Action;
  /** How hard it was (0…1): the table turns it into thinking time. */
  hard: number;
  /** What it was about: for an emote now and then. */
  mood: "value" | "bluff" | "draw" | "call" | "fold" | "check" | "shove" | "trap";
  /** Its equity estimate (for the bench). */
  eq: number;
}

const gauss = (rnd: Rnd) => (rnd() + rnd() + rnd() - 1.5) * 1.15;
/** The price a player feels: the pot odds for a good one; a weak one half ignores them (calls big bets light, folds to small ones). */
const priced = (odds: number, sk: number) => {
  const w = 0.35 + 0.65 * sk;
  return odds * w + 0.3 * (1 - w);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A round number of chips near x (steps of 1, 2, 5 × 10ⁿ; at least the small blind). */
export function nice(x: number, unit: number) {
  if (x <= unit) return unit;
  let step = unit;
  for (const m of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]) if (m * unit <= x / 9) step = m * unit;
  return Math.round(x / step) * step;
}

/** Order of action after the flop: 1 first … */
function postOrder(v: SeatView, seat: number) {
  const n = v.players.length;
  return (seat - v.button + n - 1) % n;
}

/** Ranges for every live opponent, from their public actions in this hand and their reads. */
function opponents(v: SeatView, reads: Reads | null, useReads: boolean): Opp[] {
  const out: Opp[] = [];
  const bbN = v.players.filter((p) => p.inHand).length;
  for (const p of v.players) {
    if (p.seat === v.me || !p.inHand || p.folded) continue;
    const vp = useReads && reads ? reads.vpipOf(p.seat) : 0.3;
    const pf = useReads && reads ? reads.pfrOf(p.seat) : 0.17;
    const af = useReads && reads ? reads.afOf(p.seat) : 1;
    // preflop: the raises before theirs tell how strong their raise is
    let pct = 1;
    let raisesSeen = 0;
    let acted = false;
    for (const l of v.lines) {
      if (l.street !== 0 || l.said === "sb" || l.said === "bb" || l.said === "ante") continue;
      if (l.seat === p.seat) {
        acted = true;
        if (l.said === "raise" || l.said === "bet") {
          const stackBB = (l.to + p.stack) / v.bb;
          const shove = l.allIn && stackBB < 20 ? 1 + 8 / Math.max(2, stackBB) : 1;
          pct = Math.min(pct, pf * Math.pow(0.32, raisesSeen) * shove * (bbN <= 3 ? 1.8 : 1));
        } else if (l.said === "call") pct = Math.min(pct, raisesSeen ? Math.max(0.06, vp * 0.55 * Math.pow(0.5, raisesSeen - 1)) : vp);
      }
      if (l.said === "raise" || l.said === "bet") raisesSeen++;
    }
    if (!acted) pct = 1; // the big blind's free look, or not acted yet
    const post = [0, 0, 0, 0];
    for (const l of v.lines)
      if (l.seat === p.seat && l.street > 0) {
        if (l.said === "bet" || l.said === "raise") post[l.street] = 2;
        else if (l.said === "call" && post[l.street] < 2) post[l.street] = 1;
      }
    out.push({ acted, pct: clamp(pct, 0.025, 1), post, air: clamp(0.12 + 0.12 * af, 0.12, 0.6) });
  }
  return out;
}

/** Draws I hold (for semi-bluffs and implied odds). */
function myDraws(hole: number[], board: number[]) {
  if (board.length >= 5 || board.length === 0) return { flush: false, oesd: false };
  const all = [...hole, ...board];
  const suits = [0, 0, 0, 0];
  for (const c of all) suits[c & 3]++;
  const flush = hole.some((c) => suits[c & 3] === 4);
  let m = 0;
  for (const c of all) m |= 1 << (c >> 2);
  let oesd = false;
  for (let lo = 0; lo <= 8; lo++) if (((m >> lo) & 15) === 15) oesd = true;
  return { flush, oesd };
}

/** How wet the board is (0 dry … 1 very coordinated). */
function wetness(board: number[]) {
  if (board.length < 3) return 0;
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[c & 3]++;
  const maxS = Math.max(...suits);
  const ranks = [...new Set(board.map((c) => c >> 2))].sort((a, b) => a - b);
  let close = 0;
  for (let i = 1; i < ranks.length; i++) if (ranks[i] - ranks[i - 1] <= 2) close++;
  const paired = ranks.length < board.length;
  return clamp((maxS >= 3 ? 0.45 : maxS === 2 ? 0.2 : 0) + close * 0.18 - (paired ? 0.15 : 0), 0, 1);
}

export function decide(v: SeatView, me: Persona, reads: Reads | null, rnd: Rnd, iters?: number): Decision {
  const L = v.legal!;
  const S = STYLE[me.style];
  const sk = clamp(me.skill, 0, 1);
  const p = v.players[v.me];
  const bb = v.bb;
  const unit = Math.max(1, v.sb);
  const pot = v.pot;
  const toCall = L.toCall;
  const live = v.players.filter((q) => q.inHand && !q.folded);
  const nOpp = live.length - 1;
  const oppDepth = Math.max(...live.filter((q) => q.seat !== v.me).map((q) => q.stack + q.bet));
  const eff = Math.min(p.stack + p.bet, oppDepth);
  const effBB = eff / bb;
  const odds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const raiseTo = (to: number): Action => {
    let t = nice(to, unit);
    // little left behind: commit
    if (L.maxTo - t < Math.max(pot * 0.35, 2 * bb) || t > L.maxTo * 0.72) t = L.maxTo;
    return { kind: "raise", to: clamp(t, L.minTo, L.maxTo) };
  };
  const call = (): Action => (toCall > 0 ? { kind: "call" } : { kind: "check" });
  const fold = (): Action => (toCall > 0 ? { kind: "fold" } : { kind: "check" });
  const opps = opponents(v, reads, sk > 0.4);
  const its = iters ?? Math.round(200 + 700 * sk);
  const noise = gauss(rnd) * 0.16 * (1 - sk);

  // ---- before the flop ----
  if (v.street === 0) {
    const pct = clamp(handPct(v.hole[0], v.hole[1]) + gauss(rnd) * 0.06 * (1 - sk), 0, 1);
    const pre = v.lines.filter((l) => l.street === 0 && l.said !== "sb" && l.said !== "bb" && l.said !== "ante");
    const raises = pre.filter((l) => l.said === "raise" || l.said === "bet").length;
    const limpers = raises ? 0 : pre.filter((l) => l.said === "call").length;
    const acted = new Set(pre.map((l) => l.seat));
    // seats still to act after me this round
    const behind = v.players.filter((q) => q.seat !== v.me && q.inHand && !q.folded && !q.allIn && !acted.has(q.seat)).length;
    const dealt = v.players.filter((q) => q.inHand).length;
    const isBB = v.currentBet <= bb && p.bet === bb && toCall === 0;
    const posK = 1 + (sk * 0.9 + 0.1) * (OPEN[Math.min(7, behind)] / 0.22 - 1);
    const width = (S.pfr / 0.19) * (dealt === 2 ? 3.4 : 1);

    if (raises === 0) {
      // short: shove or fold
      if (effBB <= 12 && S.agg > 0.15) {
        const shovePct = Math.min(0.85, (1.25 / (behind + 1.2)) * Math.sqrt(10 / Math.max(2, effBB))) * (0.75 + S.vpip);
        if (pct < shovePct) return { action: raiseTo(L.maxTo), hard: 0.5, mood: "shove", eq: 1 - pct };
        return isBB ? { action: call(), hard: 0.1, mood: "check", eq: 1 - pct } : { action: fold(), hard: 0.2, mood: "fold", eq: 1 - pct };
      }
      const openPct = clamp(0.22 * posK * width * (limpers ? 0.75 : 1), 0.04, 0.95);
      if (pct < openPct && L.canRaise && !(rnd() < S.limp * 0.5 && pct > openPct * 0.3)) {
        const size = (OPEN_SIZE[me.style] + limpers) * bb * (sk < 0.4 ? 1 + (0.25 - pct) * (1 - sk) : 1);
        return { action: raiseTo(isBB ? Math.max(size, bb * 3) : size), hard: 0.15, mood: "value", eq: 1 - pct };
      }
      if (isBB) return { action: call(), hard: 0.05, mood: "check", eq: 1 - pct };
      // limp (passive styles), or complete a cheap small blind
      const limpPct = S.vpip * (limpers ? 1.2 : 1) * (0.7 + 0.6 * (1 - behind / 7));
      if (pct < limpPct && (rnd() < S.limp + (limpers ? 0.3 : 0) || toCall <= v.sb)) return { action: call(), hard: 0.2, mood: "call", eq: 1 - pct };
      return { action: fold(), hard: 0.1, mood: "fold", eq: 1 - pct };
    }

    // facing a raise: what does it take?
    // (against those who put money in: the seats still to act are expected to fold)
    const inPot = opps.filter((o) => o.acted);
    const E = clamp(equity(v.hole, v.board, inPot.length ? inPot : opps, Math.max(80, its >> 1), rnd) + noise - 0.012 * behind, 0, 1);
    const ip = behind === 0 || (v.button === v.me && dealt > 2);
    const implied = effBB > 30 && raises === 1 ? (ip ? 0.05 : 0.025) * (1 - pct > 0.6 ? 1 : 0.6) : 0;
    // a cold call (not from the big blind) is worse than it looks: players behind may squeeze,
    // and the hands that call are dominated; a sound player 3-bets or folds instead
    const coldTax = p.bet === bb && v.bbSeatIs === v.me ? 0 : (0.035 + 0.01 * behind) * (1 - Math.max(0, S.sticky) * 3);
    const need = priced(odds, sk) - implied - S.sticky + coldTax + 0.02 * (inPot.length - 1) + (1 - sk) * 0.02 * gauss(rnd);
    const strongVs = raises >= 2 ? 0.55 : 0.6 - 0.12 * S.agg;
    if (E > strongVs + 0.05 * (inPot.length - 1) && L.canRaise && rnd() < 0.45 + 0.5 * S.agg) {
      const last = Math.max(...pre.filter((l) => l.said === "raise" || l.said === "bet").map((l) => l.to));
      const mult = raises >= 2 ? 2.3 : ip ? 3 : 3.6;
      return { action: raiseTo(effBB < 35 ? L.maxTo : last * mult * (0.85 + 0.15 * S.size)), hard: 0.45, mood: E > 0.62 ? "value" : "bluff", eq: E };
    }
    // a light 3-bet now and then (suited aces, suited connectors, by style)
    if (raises === 1 && L.canRaise && pct < 0.45 && v.hole[0] % 4 === v.hole[1] % 4 && rnd() < S.bluff * 0.4 && effBB > 25) {
      const last = Math.max(...pre.filter((l) => l.said === "raise" || l.said === "bet").map((l) => l.to));
      return { action: raiseTo(last * (ip ? 3 : 3.6)), hard: 0.5, mood: "bluff", eq: E };
    }
    if (E >= need) return { action: call(), hard: clamp(0.6 - Math.abs(E - need) * 3, 0.15, 0.9), mood: "call", eq: E };
    return { action: fold(), hard: clamp(0.55 - Math.abs(E - need) * 3, 0.1, 0.8), mood: "fold", eq: E };
  }

  // ---- after the flop ----
  const E = clamp(equity(v.hole, v.board, opps, its, rnd) + noise, 0, 1);
  const dr = myDraws(v.hole, v.board);
  const drawing = (dr.flush || dr.oesd) && v.street < 3;
  const wet = wetness(v.board);
  const order = postOrder(v, v.me);
  const ip = live.every((q) => q.seat === v.me || q.allIn || postOrder(v, q.seat) < order);
  const wasRaiser = v.preflopRaiser === v.me;
  const multi = nOpp - 1;
  const spr = (p.stack + p.bet) / Math.max(1, pot);
  /** A bet of this fraction of the pot (round, at least the minimum). */
  const betFrac = (f: number) => raiseTo(Math.max(L.minTo, v.currentBet + f * pot * S.size));

  if (toCall === 0) {
    const valueAt = 0.56 + 0.07 * multi - 0.1 * S.agg + (ip ? -0.03 : 0.02) * sk;
    if (E > 0.8 && v.street < 3 && rnd() < S.slow && wet < 0.5) return { action: call(), hard: 0.35, mood: "trap", eq: E };
    if (L.canRaise && E > valueAt && rnd() < 0.55 + 0.45 * S.agg) {
      const f = sk > 0.5 ? (wet > 0.4 ? 0.7 : 0.5) + (E > 0.85 && v.street === 3 ? 0.25 : 0) : E > 0.8 ? 0.85 : 0.45;
      return { action: betFrac(f + (rnd() < 0.5 ? 0 : 0.08)), hard: 0.3, mood: "value", eq: E };
    }
    if (L.canRaise && drawing && rnd() < S.agg * 0.7 * (multi ? 0.6 : 1)) return { action: betFrac(sk > 0.5 ? (wet > 0.4 ? 0.7 : 0.5) : 0.6), hard: 0.4, mood: "draw", eq: E };
    const cbet = wasRaiser && v.street === 1 && nOpp <= 2 ? (0.25 + 0.55 * S.agg) * (nOpp === 1 ? 1 : 0.55) * (1.1 - wet * 0.4) : 0;
    const bluff = S.bluff * (nOpp === 1 ? 1 : 0.35) * (ip ? 1.3 : 0.8) * (v.street === 3 ? 0.9 : 1);
    if (L.canRaise && E < valueAt && rnd() < Math.max(cbet, bluff)) {
      const f = sk > 0.5 ? (wet > 0.4 ? 0.7 : 0.5) : 0.35;
      return { action: betFrac(f), hard: 0.45, mood: "bluff", eq: E };
    }
    return { action: call(), hard: clamp(0.4 - Math.abs(E - valueAt), 0.1, 0.6), mood: "check", eq: E };
  }

  // facing a bet
  const big = toCall >= (p.stack + p.bet) * 0.45;
  const implied = drawing ? (v.street === 1 ? 0.06 : 0.035) * clamp(spr / 4, 0, 1) : 0;
  const need = priced(odds, sk) + 0.02 * multi - implied - (big ? S.sticky * 0.4 : S.sticky) + (1 - sk) * 0.03 * gauss(rnd) + (S.sticky < 0 ? 0.03 : 0);
  const raiseAt = 0.76 - 0.12 * S.agg + 0.05 * multi + (v.street === 3 ? 0.04 : 0);
  if (L.canRaise && E > raiseAt && rnd() < 0.5 + 0.45 * S.agg - (v.street < 3 ? S.slow * 0.5 : 0)) {
    const to = v.currentBet * (2.6 + 0.4 * rnd()) + (pot - v.currentBet) * 0.3;
    return { action: raiseTo(spr < 2.2 ? L.maxTo : to * S.size), hard: 0.5, mood: "value", eq: E };
  }
  if (E >= need) {
    // a draw that gets a good price may raise as a semi-bluff instead
    if (L.canRaise && drawing && nOpp === 1 && rnd() < S.agg * 0.22 && !big) return { action: raiseTo(v.currentBet * 3 * S.size), hard: 0.6, mood: "draw", eq: E };
    return { action: call(), hard: clamp(0.75 - Math.abs(E - need) * 3, 0.2, 1), mood: "call", eq: E };
  }
  if (L.canRaise && nOpp === 1 && !big && v.street >= 2 && rnd() < S.bluff * 0.22) return { action: raiseTo(v.currentBet * 3 * S.size), hard: 0.8, mood: "bluff", eq: E };
  return { action: fold(), hard: clamp(0.7 - Math.abs(E - need) * 3, 0.15, 0.9), mood: "fold", eq: E };
}

/** Open-raise width by seats still to act (0 … 7), the solid player's. */
const OPEN = [0.5, 0.46, 0.42, 0.28, 0.23, 0.19, 0.16, 0.14];
/** Open-raise size (big blinds) by style. */
const OPEN_SIZE: Record<Style, number> = { rock: 3, passive: 3, solid: 2.5, lag: 2.3, station: 3, maniac: 3.5 };

/** A zkSNARK's style, from its id and the table's seed (stable for a session). */
export function styleOf(id: number, seed: number, seat: number): Style {
  const h = (Math.imul(id ^ 0x2f6b, 0x9e3779b1) ^ Math.imul(seed + seat * 131, 0x85ebca6b)) >>> 0;
  return STYLES[h % STYLES.length];
}
