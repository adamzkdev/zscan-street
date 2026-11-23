/**
 * ZK LEGENDS' balance bench: the four starters against each other, AI on both sides.
 * Bundle and run: npx rolldown src/tables/legends/test/sim.ts -o /tmp/x/sim.mjs -p node && node /tmp/x/sim.mjs [games per pair] [skill]
 * Prints the win matrix (row's win rate against column, both seats), game length, and per card the
 * win rate of the games its side played it in (to spot cards too strong or too weak).
 */
import "../cards";
import { apply, newGame, type Game, type Side, card, mulberry, FIRST_DRAW } from "../engine";
import { decide, mulligan } from "../ai";
import { STARTERS, deckProblem, type Pool } from "../decks";

declare const process: { argv: string[]; stdout: { write(s: string): void } };
const N = Number(process.argv[2] ?? 20);
const SKILL = Number(process.argv[3] ?? 0.6);
const ONLY = process.argv[4] ?? "";
FIRST_DRAW.on = !process.argv.includes("--nofirstdraw");
const POOLS: Pool[] = ["transparent", "sapling", "sprout", "orchard"];

for (const p of POOLS) {
  const pr = deckProblem(STARTERS[p], p);
  if (pr) throw new Error(`${p}: ${pr}`);
}

const cardStats = new Map<string, { played: number; won: number }>();
let decisions = 0,
  decMs = 0;

function play(a: Pool, b: Pool, seed: number, first: Side): { winner: Side | -1; turns: number } {
  const g: Game = newGame({ seed, decks: [STARTERS[a], STARTERS[b]], factions: [a, b], arts: [1, 2], first });
  const r = mulberry(seed * 7 + 1);
  // --vs A,B: the row's deck (seat 0) played at skill A, the column's at B
  const vs = process.argv.find((x) => x.startsWith("--vs="))?.slice(5).split(",").map(Number);
  const opts = vs ? [{ skill: vs[0], rnd: r }, { skill: vs[1], rnd: r }] : [{ skill: SKILL, rnd: r }, { skill: SKILL, rnd: r }];
  for (const s of [0, 1] as Side[]) apply(g, s, { k: "mull", side: s, swap: mulligan(g, s, opts[s]) });
  const played: [Set<string>, Set<string>] = [new Set(), new Set()];
  let guard = 0;
  while (g.phase === "play" && guard++ < 3000) {
    const s = g.turn;
    const t0 = performance.now();
    const act = decide(g, s, opts[s]);
    decMs += performance.now() - t0;
    decisions++;
    g.ev = [];
    if (!apply(g, s, act)) {
      apply(g, s, { k: "end" });
      continue;
    }
    for (const e of g.ev) if (e.t === "play") played[e.side].add(e.id);
  }
  const w = g.phase === "over" ? g.winner! : -1;
  for (const s of [0, 1] as Side[])
    for (const id of played[s]) {
      const st = cardStats.get(id) ?? { played: 0, won: 0 };
      st.played++;
      if (w === s) st.won++;
      cardStats.set(id, st);
    }
  return { winner: w, turns: g.turnNo };
}

const wins: Record<string, number> = {};
const games: Record<string, number> = {};
let turns = 0,
  total = 0,
  firstWins = 0,
  draws = 0;
const t0 = performance.now();
for (const a of POOLS)
  for (const b of POOLS) {
    if (a >= b && a !== b) continue;
    if (ONLY && a !== ONLY && b !== ONLY) continue;
    for (let i = 0; i < N; i++) {
      const first = (i % 2) as Side;
      const r = play(a, b, 1000 + i * 31 + a.length * 7 + b.length, first);
      total++;
      turns += r.turns;
      if (r.winner === -1) draws++;
      if (r.winner === first) firstWins++;
      const k = `${a}|${b}`,
        k2 = `${b}|${a}`;
      games[k] = (games[k] ?? 0) + 1;
      if (a !== b) games[k2] = (games[k2] ?? 0) + 1;
      if (r.winner === 0) wins[k] = (wins[k] ?? 0) + 1;
      if (r.winner === 1 && a !== b) wins[k2] = (wins[k2] ?? 0) + 1;
    }
    process.stdout.write(".");
  }
const pct = (x: number) => (x * 100).toFixed(0).padStart(4) + "%";
console.log(`\n${total} games in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${(turns / total).toFixed(1)} turns avg, first player wins ${pct(firstWins / total)}, draws ${draws}, ${(decMs / decisions).toFixed(1)} ms/decision`);
console.log("".padEnd(13) + POOLS.map((p) => p.slice(0, 11).padStart(12)).join(""));
for (const a of POOLS) {
  let row = a.padEnd(13);
  let tw = 0,
    tg = 0;
  for (const b of POOLS) {
    const k = `${a}|${b}`;
    if (a === b || !games[k]) {
      row += "-".padStart(12);
      continue;
    }
    row += pct((wins[k] ?? 0) / games[k]).padStart(12);
    tw += wins[k] ?? 0;
    tg += games[k];
  }
  console.log(row + "   overall " + pct(tg ? tw / tg : 0));
}
const rows = [...cardStats.entries()].filter(([, s]) => s.played >= 6).map(([id, s]) => ({ id, n: s.played, wr: s.won / s.played }));
rows.sort((x, y) => y.wr - x.wr);
const fmt = (r: { id: string; n: number; wr: number }) => `${card(r.id).name.padEnd(22)} ${card(r.id).faction.slice(0, 5).padEnd(6)} ${pct(r.wr)} (${r.n})`;
console.log("\nbest-performing cards:\n" + rows.slice(0, 14).map(fmt).join("\n"));
console.log("\nworst-performing cards:\n" + rows.slice(-14).map(fmt).join("\n"));
