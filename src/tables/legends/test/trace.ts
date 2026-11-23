/** One game, move by move: npx rolldown src/tables/legends/test/trace.ts -o /tmp/t.mjs -p node && node /tmp/t.mjs [a] [b] [seed] */
import "../cards";
import { apply, newGame, card, mulberry, minion, type Side, type Game } from "../engine";
import { decide, mulligan } from "../ai";
import { STARTERS, type Pool } from "../decks";
declare const process: { argv: string[] };
const a = (process.argv[2] ?? "transparent") as Pool,
  b = (process.argv[3] ?? "orchard") as Pool,
  seed = Number(process.argv[4] ?? 5),
  skill = Number(process.argv[5] ?? 0.7);
const g: Game = newGame({ seed, decks: [STARTERS[a], STARTERS[b]], factions: [a, b], arts: [1, 2], first: 0 });
const r = mulberry(9);
for (const s of [0, 1] as Side[]) apply(g, s, { k: "mull", side: s, swap: mulligan(g, s, { skill, rnd: r }) });
const nm = (uid: number) => (uid === 1 ? "HERO0" : uid === 2 ? "HERO1" : (minion(g, uid) ? card(minion(g, uid)!.id).name : `#${uid}`));
let n = 0;
while (g.phase === "play" && n++ < 400) {
  const s = g.turn;
  const act = decide(g, s, { skill, rnd: r });
  let line = `T${g.turnNo} P${s} mana ${g.s[s].mana}/${g.s[s].maxMana} hp ${g.s[0].hero.hp}/${g.s[1].hero.hp}: `;
  if (act.k === "play") line += `play ${card(g.s[s].hand.find((h) => h.uid === act.uid)!.id).name}` + (act.target != null ? ` -> ${nm(act.target)}` : "");
  else if (act.k === "attack") line += `attack ${nm(act.from)} -> ${nm(act.to)}`;
  else line += JSON.stringify(act);
  g.ev = [];
  apply(g, s, act);
  if (act.k === "end") line += `   | boards: [${g.s[0].board.map((m) => `${card(m.id).name} ${m.atk + m.aura}/${m.hp}`).join(", ")}] vs [${g.s[1].board.map((m) => `${card(m.id).name} ${m.atk + m.aura}/${m.hp}`).join(", ")}]  hands ${g.s[0].hand.length}/${g.s[1].hand.length}`;
  console.log(line);
}
console.log("winner", g.winner, "turn", g.turnNo);
