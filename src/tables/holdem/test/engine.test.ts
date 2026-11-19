/** The betting engine: node src/tables/holdem/test/engine.test.ts */
import { parseCards, mulberry, shuffledDeck } from "../cards";
import { Hand, type Action } from "../engine";
import { ok, eq, done } from "./check";

/** A deck that deals these hole cards (by seat) and this board, in the engine's dealing order. */
function rig(stacks: number[], button: number, holes: Record<number, string>, board: string) {
  const active = stacks.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
  const n = stacks.length;
  const nextActive = (from: number) => {
    for (let k = 1; k <= n; k++) if (stacks[(from + k) % n] > 0) return (from + k) % n;
    return -1;
  };
  const sb = active.length === 2 ? button : nextActive(button);
  const order: number[] = [];
  for (let s = sb, k = 0; k < active.length; k++, s = nextActive(s)) order.push(s);
  const used = new Set<number>();
  const deck: number[] = [];
  const hc = Object.fromEntries(Object.entries(holes).map(([k, v]) => [k, parseCards(v)]));
  const filler = () => {
    for (let c = 51; c >= 0; c--) if (!used.has(c) && !allNamed.has(c)) { used.add(c); return c; }
    throw new Error("no filler");
  };
  const b = parseCards(board);
  const allNamed = new Set<number>([...Object.values(hc).flat(), ...b]);
  for (let r = 0; r < 2; r++) for (const s of order) deck.push(hc[s] ? hc[s][r] : filler());
  deck.push(filler(), b[0], b[1], b[2], filler(), b[3], filler(), b[4]);
  for (let c = 0; c < 52; c++) if (!deck.includes(c)) deck.push(c);
  return deck;
}
const total = (h: Hand) => h.players.reduce((s, p) => s + p.stack + p.bet, 0) + h.pot;
function runOut(h: Hand) {
  while (h.phase === "deal") h.step();
}
const A = (kind: Action["kind"], to?: number): Action => ({ kind, to });

// ---- blinds, order, heads-up ----
{
  const h = new Hand({ stacks: [100, 100, 100, 100], button: 0, sb: 1, bb: 2, deck: shuffledDeck(mulberry(1)) });
  eq(h.sbSeat, 1, "sb left of button");
  eq(h.bbSeat, 2, "bb after sb");
  eq(h.toAct, 3, "UTG acts first");
  eq(h.players[1].bet, 1, "sb posted");
  eq(h.players[2].bet, 2, "bb posted");
  const L = h.legal();
  eq(L.toCall, 2, "UTG calls 2");
  eq(L.minTo, 4, "min raise to 4 (BB + BB)");
  eq(L.maxTo, 100, "max is all in");
  h.act(A("raise", 7)); // raise of 5
  eq(h.lastRaise, 5, "last raise 5");
  eq(h.legal().minTo, 12, "next min raise to 7 + 5");
  h.act(A("raise", 9)); // too small: clamped up to 12
  eq(h.players[0].bet, 12, "an under-raise is lifted to the minimum");
  eq(h.legal().seat, 1, "sb to act");
  h.act(A("fold"));
  h.act(A("fold")); // bb
  h.act(A("call")); // UTG calls 12
  eq(h.phase, "deal", "round over");
  h.step(); // collect
  eq(h.pot, 1 + 2 + 12 + 12, "pot collected");
  h.step(); // flop
  eq(h.board.length, 3, "flop dealt");
  eq(h.toAct, 3, "first live seat left of the button acts first postflop");
  eq(total(h), 400, "chips conserved");
}
{
  const h = new Hand({ stacks: [50, 80], button: 1, sb: 1, bb: 2, deck: shuffledDeck(mulberry(2)) });
  eq(h.sbSeat, 1, "heads-up: the button is the small blind");
  eq(h.bbSeat, 0, "heads-up: the other is the big blind");
  eq(h.toAct, 1, "heads-up: the button acts first preflop");
  h.act(A("call"));
  eq(h.toAct, 0, "the big blind has the option");
  ok(h.legal().canCheck && h.legal().canRaise, "BB may check or raise");
  h.act(A("check"));
  h.step();
  h.step();
  eq(h.toAct, 0, "heads-up: the big blind acts first after the flop");
}
// everyone folds to the BB: the BB takes the SB, its own blind comes back
{
  const h = new Hand({ stacks: [100, 100, 100], button: 0, sb: 1, bb: 2, deck: shuffledDeck(mulberry(3)) });
  h.act(A("fold")); // button (UTG 3-handed)
  h.act(A("fold")); // sb
  eq(h.phase, "deal", "hand over");
  const evs = h.step();
  ok(evs.some((e) => e.t === "return" && e.seat === 2 && e.amount === 1), "uncalled part of the BB returned");
  h.step();
  eq(h.players[2].stack, 101, "BB wins the small blind");
  eq(h.players[1].stack, 99, "SB lost 1");
  eq(h.phase, "done", "done");
}
// ---- the short all-in does not reopen the betting ----
{
  // seats: 0 button, 1 sb, 2 bb, 3 utg; postflop: 1 bets 100, 2 all-in 150, 3 calls, back to 1
  const h = new Hand({ stacks: [1000, 1000, 152, 1000], button: 0, sb: 1, bb: 2, deck: shuffledDeck(mulberry(4)) });
  h.act(A("call")); // 3
  h.act(A("call")); // 0
  h.act(A("call")); // 1
  h.act(A("check")); // 2
  h.step(); h.step();
  eq(h.toAct, 1, "sb first on the flop");
  h.act(A("raise", 100)); // bet 100
  eq(h.lastRaise, 100, "a 100 bet sets the raise size");
  eq(h.legal().minTo, 150, "the bb's min raise (200) is capped by its all-in (150)");
  h.act(A("raise", 150)); // bb all-in for 150: short
  ok(h.players[2].allIn, "bb all in");
  eq(h.currentBet, 150, "bet level 150");
  eq(h.lastRaise, 100, "a short all-in leaves the raise size");
  eq(h.legal().minTo, 250, "a full raise now goes to 250");
  ok(h.legal().canRaise, "seat 3 had not acted: may raise");
  h.act(A("call")); // 3 calls 150
  ok(h.legal().canRaise, "seat 0 had not acted on the flop: may raise");
  h.act(A("call")); // 0 calls 150
  eq(h.toAct, 1, "back to the bettor");
  ok(!h.legal().canRaise, "the bettor faces only 50 more: call or fold");
  eq(h.legal().toCall, 50, "50 to call");
  h.act(A("raise", 400)); // not allowed: becomes a call
  eq(h.players[1].bet, 150, "a raise that is not allowed is a call");
  eq(h.phase, "deal", "round over");
}
// two short all-ins add up to a full raise: the betting reopens
{
  const h = new Hand({ stacks: [1000, 1000, 152, 212], button: 0, sb: 1, bb: 2, deck: shuffledDeck(mulberry(5)) });
  h.act(A("call")); h.act(A("call")); h.act(A("call")); h.act(A("check"));
  h.step(); h.step();
  h.act(A("raise", 100)); // 1 bets 100
  h.act(A("raise", 150)); // 2 all-in 150 (short)
  h.act(A("raise", 210)); // 3 all-in 210 (short over 150, but 110 over 100)
  eq(h.lastRaise, 100, "still 100");
  h.act(A("call")); // 0 calls 210
  eq(h.toAct, 1, "back to the bettor");
  ok(h.legal().canRaise, "facing 110 more (a full raise in total): may re-raise");
  eq(h.legal().minTo, 310, "min re-raise to 310");
}
// a bet all-in for less than the big blind still lets the next seat call it
{
  const h = new Hand({ stacks: [1000, 1000, 3], button: 0, sb: 1, bb: 2, deck: shuffledDeck(mulberry(6)) });
  h.act(A("call")); h.act(A("call")); h.act(A("check"));
  h.step(); h.step();
  h.act(A("check")); // sb
  h.act(A("raise", 1)); // bb all-in for its last chip
  eq(h.currentBet, 1, "a 1-chip bet");
  eq(h.legal().toCall, 1, "the button calls 1");
  eq(h.legal().minTo, 3, "or raises to at least 1 + the big blind");
}
// ---- side pots: three all-ins of different sizes ----
{
  // seats 0..3, stacks 50 / 100 / 200 / 300; button 3, sb 0, bb 1, utg 2
  const stacks = [50, 100, 200, 300];
  const deck = rig(stacks, 3, { 0: "As Ah", 1: "Ks Kh", 2: "Qs Qh", 3: "Js Jh" }, "2c 7d 9c 3h 4d");
  const h = new Hand({ stacks, button: 3, sb: 1, bb: 2, deck });
  eq(h.toAct, 2, "utg first");
  h.act(A("raise", 200)); // utg all in
  h.act(A("raise", 300)); // button all in
  h.act(A("call")); // sb all in 50
  h.act(A("call")); // bb all in 100
  eq(h.phase, "deal", "all in");
  const ev = h.step();
  ok(ev.some((e) => e.t === "return" && e.seat === 3 && e.amount === 100), "the button's uncalled 100 comes back");
  const pots = h.pots();
  eq(pots.length, 3, "a main pot and two side pots");
  eq(pots[0].amount, 200, "main pot 4 × 50");
  eq(pots[0].eligible.length, 4, "main pot: all four");
  eq(pots[1].amount, 150, "side pot 1: 3 × 50");
  eq(pots[1].eligible.join(), "1,2,3", "side pot 1: three");
  eq(pots[2].amount, 200, "side pot 2: 2 × 100");
  eq(pots[2].eligible.join(), "2,3", "side pot 2: two");
  const ex = h.step();
  ok(ex.some((e) => e.t === "expose"), "the hands are tabled");
  runOut(h);
  eq(h.players[0].stack, 200, "aces win the main pot");
  eq(h.players[1].stack, 150, "kings win side pot 1");
  eq(h.players[2].stack, 200, "queens win side pot 2");
  eq(h.players[3].stack, 100, "jacks keep their uncalled 100");
  eq(h.players.reduce((s, p) => s + p.stack, 0), 650, "chips conserved");
}
// four all-ins, the biggest stack has the best hand: it scoops every pot
{
  const stacks = [40, 90, 160, 500, 500];
  const deck = rig(stacks, 4, { 0: "2s 3h", 1: "5s 6h", 2: "8s 9h", 3: "As Ah", 4: "Ks Kh" }, "Ac Kd 7c 2c 4d");
  const h = new Hand({ stacks, button: 4, sb: 5, bb: 10, deck });
  // utg 2, then 3, 4, 0 (sb), 1 (bb)
  h.act(A("raise", 160)); h.act(A("raise", 500)); h.act(A("call")); h.act(A("call")); h.act(A("call"));
  runOut(h);
  eq(h.players[3].stack, 40 * 5 + 50 * 4 + 70 * 3 + 340 * 2, "aces take all four pots");
  eq(h.players[4].stack, 0, "kings busted");
}
// ---- split pots and the odd chip ----
{
  // the board plays for both: a royal flush; pot 2 × 1 + 3 = 5 → 3 and 2
  const stacks = [100, 100, 100];
  const deck = rig(stacks, 0, { 0: "2c 3d", 1: "4c 5d", 2: "6c 7d" }, "As Ks Qs Js Ts");
  const h = new Hand({ stacks, button: 0, sb: 1, bb: 2, deck });
  h.act(A("fold")); // button
  h.act(A("raise", 3)); // sb raises to 3... (min is 4: lifted to 4)
  h.act(A("call")); // bb
  h.step(); // collect: 8
  runOutChecks(h);
  eq(h.players[1].stack + h.players[2].stack, 200, "pot fully paid");
  eq(h.players[1].stack, 100, "split evenly (8 → 4 + 4)");
}
{
  // odd chip: three-way split of 7 is impossible to force with blinds 1/2... use an ante of 1 with 4 seats:
  // antes 4, sb 1, bb 2; utg and button fold → pot 7 between sb and bb on a royal board → 4 to sb (left of button), 3 to bb
  const stacks = [100, 100, 100, 100];
  const deck = rig(stacks, 0, { 0: "2c 3d", 1: "4c 5d", 2: "6c 7d", 3: "8c 9d" }, "As Ks Qs Js Ts");
  const h = new Hand({ stacks, button: 0, sb: 1, bb: 2, ante: 1, deck });
  h.act(A("fold")); // utg (3)
  h.act(A("fold")); // button (0)
  h.act(A("call")); // sb completes to 2
  h.act(A("check")); // bb
  runOutChecks(h);
  // pot = 4 antes + 2 + 2 = 8 … make it odd: no. Check the split and the order instead.
  eq(h.won[1], h.won[2], "even pot splits evenly");
}
{
  // a true odd chip: sb 1 and bb 2 with the button folding 3-handed and the sb calling: pot 4; add an all-in
  // of 3 by a short stack so the main pot is 3 + 3 + 3 = 9 split three ways… instead force 5 between two:
  // stacks: sb has 101, bb 100, button 3 (all in for 3, folds? no): button shoves 3, sb calls, bb calls → 9 three ways
  const stacks = [3, 100, 100];
  const deck = rig(stacks, 0, { 0: "2c 3d", 1: "4c 5d", 2: "6c 7d" }, "As Ks Qs Js Ts");
  const h = new Hand({ stacks, button: 0, sb: 1, bb: 2, deck });
  h.act(A("raise", 3)); // button all in 3
  h.act(A("call")); // sb
  h.act(A("raise", 5)); // bb raises to 5 (min to 3 + 2 = 5)
  h.act(A("call")); // sb calls 5
  h.step(); h.step(); // collect, flop
  // sb bets 1 (all-in? no) and bb folds: no. Just check down
  runOutChecks(h);
  eq(h.won[0], 3, "main pot 9 split three ways: 3 each");
  eq(h.won[1], 3 + 2, "sb: 3 + half of the side pot 4");
  eq(h.won[2], 3 + 2, "bb: 3 + half of the side pot 4");
}
{
  // odd chip to the first winner left of the button: main pot 3 + 2 + 2 = 7 from a short sb
  // stacks: button 100, sb 1 (posts 1, all in), bb 100; button calls 2, bb checks; board plays
  const stacks = [100, 1, 100];
  const deck = rig(stacks, 0, { 0: "2c 3d", 1: "4c 5d", 2: "6c 7d" }, "As Ks Qs Js Ts");
  const h = new Hand({ stacks, button: 0, sb: 1, bb: 2, deck });
  h.act(A("call")); // button
  h.act(A("check")); // bb
  runOutChecks(h);
  // main pot 3 (1 each) split three ways = 1 each; side pot 2 (1+1) between button and bb: 1 each
  eq(h.won[0] + h.won[1] + h.won[2], 5, "everything paid");
  eq(h.won[1], 1, "the short sb gets a third of the main pot");
}
{
  // 5 chips between two winners: the extra chip goes to the first winner clockwise from the button
  // seats 0 (button), 1 (sb), 2 (bb), 3: stacks give a side pot of 5? Simplest: antes of 1 with 5 seats,
  // three fold, sb and bb tie: pot = 5 antes + 2 + 2 = 9 → 5 to the sb, 4 to the bb
  const stacks = [100, 100, 100, 100, 100];
  const deck = rig(stacks, 0, { 0: "2c 3d", 1: "4c 5d", 2: "6c 7d", 3: "8c 9d", 4: "2h 3h" }, "As Ks Qs Js Ts");
  const h = new Hand({ stacks, button: 0, sb: 1, bb: 2, ante: 1, deck });
  h.act(A("fold")); h.act(A("fold")); h.act(A("fold"));
  h.act(A("call")); h.act(A("check"));
  runOutChecks(h);
  eq(h.won[1], 5, "odd chip: the small blind (first left of the button) gets 5");
  eq(h.won[2], 4, "the big blind gets 4");
}
{
  // odd chips with three winners and a button in the middle: pot 11 split three ways → 4, 4, 3 from the button's left
  const stacks = [100, 100, 100, 100];
  const deck = rig(stacks, 2, { 0: "2c 3d", 1: "4c 5d", 2: "6c 7d", 3: "8c 9d" }, "As Ks Qs Js Ts");
  const h = new Hand({ stacks, button: 2, sb: 1, bb: 2, ante: 1, deck });
  // sb 3, bb 0, utg 1, button 2
  h.act(A("call")); // utg 1 calls 2
  h.act(A("fold")); // button folds
  h.act(A("call")); // sb completes
  h.act(A("check")); // bb
  runOutChecks(h);
  // pot = 4 antes + 3 × 2 = 10 … 10/3 = 3 r1 → the first left of the button (seat 3) gets 4
  eq(h.won[3], 4, "seat 3 (left of the button) takes the odd chip");
  eq(h.won[0], 3, "seat 0: 3");
  eq(h.won[1], 3, "seat 1: 3");
}
// a showdown: the loser may muck, the winner shows
{
  const stacks = [100, 100];
  const deck = rig(stacks, 0, { 0: "As Ah", 1: "7c 2d" }, "Kc 9d 4h 3s Jc");
  const h = new Hand({ stacks, button: 0, sb: 1, bb: 2, deck });
  h.act(A("call")); h.act(A("check"));
  h.step(); h.step();
  h.act(A("raise", 2)); // bb bets 2 on the flop (bb acts first heads-up)
  h.act(A("call"));
  h.step(); h.step(); h.act(A("check")); h.act(A("check"));
  h.step(); h.act(A("check")); h.act(A("check"));
  const evs = h.step();
  // the flop bettor was seat 1, but the river was checked: the first left of the button (seat 1) shows first
  ok(evs.some((e) => e.t === "show" && e.seat === 1), "first to show must show");
  ok(evs.some((e) => e.t === "show" && e.seat === 0), "the winner shows");
  eq(h.players[0].stack, 104, "aces win 4");
}
{
  const stacks = [100, 100, 100];
  const deck = rig(stacks, 0, { 0: "As Ah", 1: "7c 2d", 2: "8c 3d" }, "Kc 9d 4h 5s Jc");
  const h = new Hand({ stacks, button: 0, sb: 1, bb: 2, deck });
  h.act(A("call")); h.act(A("call")); h.act(A("check"));
  h.step(); h.step();
  h.act(A("check")); h.act(A("check")); h.act(A("raise", 6)); // the button bets the flop
  h.act(A("call")); h.act(A("call"));
  h.step(); h.step();
  h.act(A("check")); h.act(A("check")); h.act(A("check"));
  h.step(); h.act(A("check")); h.act(A("raise", 10)); h.act(A("call")); h.act(A("call"));
  // seat 2 bet the river and seat 0 (aces) called: seat 2 shows first, seat 0 shows (wins), seat 1 mucks
  h.step(); // collect
  const evs = h.step();
  const order = evs.filter((e) => e.t === "show" || e.t === "muck").map((e) => `${e.t}${(e as { seat: number }).seat}`);
  eq(order.join(" "), "show2 show0 muck1", "river bettor first, the winner shows, the loser mucks");
}
// the BB is all in from the blind: the button just calls or folds, nobody to raise against
{
  const h = new Hand({ stacks: [100, 1], button: 0, sb: 2, bb: 4, deck: shuffledDeck(mulberry(9)) });
  // heads-up: button 0 is sb (posts 2), seat 1 bb all-in for 1
  ok(h.players[1].allIn, "bb all in from the blind");
  eq(h.toAct, 0, "the button acts");
  ok(!h.legal().canRaise, "no raise against an all-in");
  h.act(A("call"));
  runOut(h);
  eq(h.players[0].stack + h.players[1].stack, 101, "chips conserved");
}

/** Check (or call) everything down to the end. */
function runOutChecks(h: Hand) {
  while (h.phase !== "done") {
    if (h.phase === "deal") h.step();
    else h.act(h.legal().canCheck ? A("check") : A("call"));
  }
}

// ---- random play: chips are conserved, every hand ends ----
{
  const rnd = mulberry(77);
  let hands = 0,
    stuck = 0,
    bad = 0,
    sidePots = 0,
    splits = 0;
  for (let t = 0; t < 40000; t++) {
    const n = 2 + Math.floor(rnd() * 7);
    const stacks = Array.from({ length: n }, () => (rnd() < 0.12 ? 0 : 1 + Math.floor(rnd() * (rnd() < 0.3 ? 30 : 400))));
    if (stacks.filter((s) => s > 0).length < 2) continue;
    let button = Math.floor(rnd() * n);
    while (stacks[button] === 0) button = (button + 1) % n;
    const before = stacks.reduce((a, b) => a + b, 0);
    const h = new Hand({ stacks, button, sb: 1 + Math.floor(rnd() * 3), bb: 4, ante: rnd() < 0.2 ? 1 : 0, deck: shuffledDeck(rnd) });
    h.showPolicy = () => rnd() < 0.3;
    let guard = 0;
    while (h.phase !== "done" && guard++ < 500) {
      if (h.phase === "deal") {
        const evs = h.step();
        for (const e of evs) if (e.t === "award" && e.index > 0) sidePots++;
        for (const e of evs) if (e.t === "award" && e.shares.length > 1) splits++;
        continue;
      }
      const L = h.legal();
      const x = rnd();
      if (x < 0.15 && !L.canCheck) h.act(A("fold"));
      else if (x < 0.55 || !L.canRaise) h.act(A(L.canCheck ? "check" : "call"));
      else h.act(A("raise", L.minTo + Math.floor(rnd() * rnd() * (L.maxTo - L.minTo + 1))));
      if (h.players.some((p) => p.stack < 0)) bad++;
    }
    if (h.phase !== "done") stuck++;
    const after = h.players.reduce((s, p) => s + p.stack, 0);
    if (after !== before) bad++;
    hands++;
  }
  eq(stuck, 0, `no stuck hands (${hands} random hands)`);
  eq(bad, 0, "chips conserved, no negative stacks");
  ok(sidePots > 1000, `side pots happen (${sidePots})`);
  ok(splits > 100, `split pots happen (${splits})`);
}
done("engine");
