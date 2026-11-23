/** Do the rarer zkSNARKs win more? Decks with 12 zkSNARK cards of one tier against the plain starters.
 * npx rolldown src/tables/legends/test/snarksim.ts -o <scratch>/ss.mjs -p node && node <scratch>/ss.mjs [games per pool pair] */
import "../cards";
import { readFileSync } from "node:fs";
import { apply, newGame, mulberry, card, type Side, type Rarity } from "../engine";
import { decide, mulligan } from "../ai";
import { STARTERS, deckProblem, type Pool } from "../decks";
import { setSnarkData, snarksOf, snarkCard, snarkCardId } from "../snarkcards";
declare const process: { argv: string[] };
setSnarkData(new Uint8Array(readFileSync("public/legends/snarks.bin")));
const N = Number(process.argv[2] ?? 12);
const POOLS: Pool[] = ["transparent", "sapling", "sprout", "orchard"];

function withSnarks(pool: Pool, tier: Rarity, seed: number): string[] {
  const r = mulberry(seed);
  const deck = STARTERS[pool].slice();
  const order = deck.map((id, i) => ({ id, i, k: r() })).sort((a, b) => a.k - b.k);
  const ids = snarksOf(tier, pool);
  const used = new Set<number>();
  let n = 0;
  for (const s of order) {
    if (n >= 12) break;
    if (card(s.id).rarity === "legendary") continue;
    const want = card(s.id).cost;
    let best = 0;
    for (let t = 0; t < 60; t++) {
      const id = ids[Math.floor(r() * ids.length)];
      if (used.has(id)) continue;
      if (!best || Math.abs(snarkCard(id).cost - want) < Math.abs(snarkCard(best).cost - want)) best = id;
    }
    used.add(best);
    deck[s.i] = snarkCardId(best);
    n++;
  }
  const p = deckProblem(deck, pool);
  if (p) throw new Error(p);
  return deck;
}

function game(d0: string[], d1: string[], p0: Pool, p1: Pool, seed: number, first: Side) {
  const g = newGame({ seed, decks: [d0, d1], factions: [p0, p1], arts: [1, 2], first });
  const r = mulberry(seed + 3);
  const o = { skill: 0.6, rnd: r };
  for (const s of [0, 1] as Side[]) apply(g, s, { k: "mull", side: s, swap: mulligan(g, s, o) });
  let guard = 0;
  while (g.phase === "play" && guard++ < 3000) if (!apply(g, g.turn, decide(g, g.turn, o))) apply(g, g.turn, { k: "end" });
  return g.winner;
}

for (const tier of ["common", "rare", "epic", "legendary"] as Rarity[]) {
  let w = 0,
    t = 0;
  for (const a of POOLS)
    for (const b of POOLS)
      for (let i = 0; i < N; i++) {
        const seed = 77 + i * 13 + a.length * 101 + b.length * 7;
        const d0 = withSnarks(a, tier, seed);
        const win = game(d0, STARTERS[b], a, b, seed, (i % 2) as Side);
        t++;
        if (win === 0) w++;
      }
  console.log(`${tier.padEnd(10)} decks (12 zkSNARKs) vs starters: ${((w / t) * 100).toFixed(0)}% of ${t}`);
}
