/** The evaluator, exhaustively: node src/tables/holdem/test/eval.test.ts [--seven] */
import { parseCards, mulberry, shuffledDeck } from "../cards";
import { evaluate, category, describe, bestFive } from "../eval";
import { ok, eq, done } from "./check";

const sc = (s: string) => evaluate(parseCards(s));
const cat = (s: string) => category(sc(s));

// ---- known hands ----
eq(cat("As Ks Qs Js Ts 2c 3d"), 8, "royal flush");
eq(describe(sc("As Ks Qs Js Ts")).en, "Royal Flush", "royal name");
eq(cat("5h 4h 3h 2h Ah Kc Kd"), 8, "steel wheel");
eq(describe(sc("5h 4h 3h 2h Ah")).en, "Straight Flush, Five high", "steel wheel name");
eq(cat("9c 9d 9h 9s Ac"), 7, "quads");
eq(cat("Kc Kd Kh 7s 7c 2d 3d"), 6, "full house");
eq(cat("Kc Kd Kh 7s 7c 7d 3d"), 6, "two trips make a full house");
eq(describe(sc("Kc Kd Kh 7s 7c 7d 3d")).en, "Full House, Kings full of Sevens", "FH name");
eq(cat("2h 7h 9h Jh Kh As Ad"), 5, "flush over pair");
eq(cat("Ah 2c 3d 4s 5h Kc Qd"), 4, "wheel straight");
eq(describe(sc("Ah 2c 3d 4s 5h Kc Qd")).en, "Straight, Five high (the wheel)", "wheel name");
eq(cat("Ah Kc Qd Js Th 2c 3d"), 4, "broadway");
eq(cat("Qh Kc Ad 2s 3h"), 0, "no wraparound straight (Q K A 2 3)");
eq(cat("7c 7d 7h As 2d"), 3, "trips");
eq(cat("7c 7d 5h 5s 2d"), 2, "two pair");
eq(cat("7c 7d 5h 4s 2d"), 1, "pair");
eq(cat("Ac Jd 9h 4s 2d"), 0, "high card");

// ---- comparisons and kickers ----
ok(sc("Ac Ad Kh 9s 2d") > sc("Ac Ad Qh Js Td"), "pair kicker K beats Q");
ok(sc("Ac Ad Kh 9s 3d") > sc("As Ah Kd 9c 2s"), "pair: third kicker decides");
ok(sc("Kc Kd 5h 5s Ad") > sc("Kh Ks 5c 5d Qs"), "two pair kicker");
ok(sc("Kc Kd 5h 5s 2d") > sc("Qh Qs Jc Jd As"), "two pair top pair");
ok(sc("Kc Kd 6h 6s 2d") > sc("Kh Ks 5c 5d As"), "two pair second pair");
// three pairs: the best two plus the best kicker (which may be the third pair)
eq(sc("Kc Kd 6h 6s 4d 4c 2h"), sc("Kh Ks 6c 6d 4h 3s 2c"), "third pair plays as a kicker");
ok(sc("Kc Kd 6h 6s 4d 4c 9h") > sc("Kh Ks 6c 6d 4h 4s 8c"), "three pairs: best kicker wins");
ok(sc("6c 5d 4h 3s 2d") > sc("Ac 2d 3h 4s 5d"), "six-high straight beats the wheel");
ok(sc("Ac Kc Qc Jc 9c") > sc("Ac Kd Qh Js Td"), "flush beats straight");
ok(sc("Ah 9h 8h 7h 3h") > sc("Kc Qc Jc Tc 8c"), "ace-high flush beats king-high");
ok(sc("Ah 9h 8h 7h 4h") > sc("As 9s 8s 7s 3s"), "flush: fifth card decides");
ok(sc("3c 3d 3h 2s 2d") > sc("Ac Ad Kh Ks Qd"), "small boat beats aces up");
ok(sc("Ac Ad Ah 2s 2d") > sc("Kc Kd Kh As Ad"), "aces full beats kings full");
ok(sc("Kc Kd Kh Ks 3d") < sc("Kc Kd Kh Ks 4d"), "quads kicker");
ok(sc("7c 7d 7h As Kd") > sc("7c 7d 7h As Qd"), "trips second kicker");
// the board plays: a tie
eq(sc("2c 3d Ah Kh Qh Jh Th"), sc("4c 5d Ah Kh Qh Jh Th"), "royal on board: split");
eq(sc("2c 3d As Ad Kc Kh Qd"), sc("4c 5d As Ad Kc Kh Qd"), "two pair on board, Q kicker plays");
ok(sc("2c Qs As Ad Kc Kh Jd") === sc("Qh 3d As Ad Kc Kh Jd"), "same two pair + queen kicker: tie");
ok(sc("2c 3d 9s 9d 8c 8h 4d") < sc("2c 5d 9s 9d 8c 8h 4d"), "kicker 5 beats 4 when the board has 4");
// a flush with six suited cards uses the top five
eq(sc("Ah Kh 9h 7h 4h 2h 3c"), sc("Ah Kh 9h 7h 4h"), "six-card flush top five");
// straight from 7 with a pair inside
eq(cat("9c 8d 7h 6s 5d 5c 2h"), 4, "straight with a pair");
// a straight flush beats a bigger quads/flush mix
ok(sc("9h 8h 7h 6h 5h 9c 9d") > sc("9s 9c 9d 9h Ah"), "SF beats quads");
// bestFive returns the five cards that score
{
  const seven = parseCards("Kc Kd Kh 7s 7c 2d 3d");
  const five = bestFive(seven);
  eq(evaluate(five), evaluate(seven), "bestFive scores like the seven");
}

// ---- exhaustive: all C(52,5) five-card hands ----
{
  const want = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
  const got = new Array(9).fill(0);
  const distinct = new Set<number>();
  const h = [0, 0, 0, 0, 0];
  const t0 = performance.now();
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++)
        for (let d = c + 1; d < 52; d++)
          for (let e = d + 1; e < 52; e++) {
            h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
            const s = evaluate(h, 5);
            got[s >> 20]++;
            distinct.add(s);
          }
  for (let i = 0; i < 9; i++) eq(got[i], want[i], `5-card count of category ${i}`);
  eq(distinct.size, 7462, "distinct 5-card hand values");
  console.log(`  5-card: 2,598,960 hands in ${(performance.now() - t0).toFixed(0)} ms`);
}

// ---- random 7-card hands: the score is the best of the 21 fives ----
{
  const rnd = mulberry(42);
  const five = [0, 0, 0, 0, 0];
  let bad = 0;
  for (let it = 0; it < 30000; it++) {
    const d = shuffledDeck(rnd).slice(0, 7);
    let best = -1;
    for (let a = 0; a < 7; a++)
      for (let b = a + 1; b < 7; b++)
        for (let c = b + 1; c < 7; c++)
          for (let x = c + 1; x < 7; x++)
            for (let y = x + 1; y < 7; y++) {
              five[0] = d[a]; five[1] = d[b]; five[2] = d[c]; five[3] = d[x]; five[4] = d[y];
              best = Math.max(best, evaluate(five, 5));
            }
    if (best !== evaluate(d, 7)) bad++;
  }
  eq(bad, 0, "7-card score equals the best 5 of 7 (30,000 random hands)");
}

// ---- exhaustive: all C(52,7) seven-card hands (about 134 million; --seven) ----
if (typeof process !== "undefined" && process.argv.includes("--seven")) {
  const want = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584];
  const got = new Array(9).fill(0);
  const h = [0, 0, 0, 0, 0, 0, 0];
  const t0 = performance.now();
  for (let a = 0; a < 52; a++) { h[0] = a;
    for (let b = a + 1; b < 52; b++) { h[1] = b;
      for (let c = b + 1; c < 52; c++) { h[2] = c;
        for (let d = c + 1; d < 52; d++) { h[3] = d;
          for (let e = d + 1; e < 52; e++) { h[4] = e;
            for (let f = e + 1; f < 52; f++) { h[5] = f;
              for (let g = f + 1; g < 52; g++) { h[6] = g; got[evaluate(h, 7) >> 20]++; } } } } } } }
  for (let i = 0; i < 9; i++) eq(got[i], want[i], `7-card count of category ${i}`);
  console.log(`  7-card: 133,784,560 hands in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
declare const process: { argv: string[] };
done("eval");
