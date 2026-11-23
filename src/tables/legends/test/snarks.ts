/** The 10,000 zkSNARK cards: samples by rank, the spread of power, and a few odd ones.
 * npx rolldown src/tables/legends/test/snarks.ts -o <scratch>/sn.mjs -p node && node <scratch>/sn.mjs */
import "../cards";
import { readFileSync } from "node:fs";
import { setSnarkData, snarkCard, snarkInfo, SNARKS } from "../snarkcards";
setSnarkData(new Uint8Array(readFileSync("public/legends/snarks.bin")));
const show = (id: number) => {
  const d = snarkCard(id);
  const s = snarkInfo(id);
  return `#${String(id).padStart(5)} rank ${String(s.rank).padStart(4)} ${s.tier.padEnd(9)} ${d.faction.padEnd(11)} ${String(d.cost).padStart(2)}  ${d.atk}/${d.hp}  ${d.name.padEnd(26)} ${d.tribe ?? ""}  ${d.text}`;
};
const byRank = [...Array(SNARKS).keys()].map((i) => i + 1).sort((a, b) => (snarkInfo(a).rank || 99999) - (snarkInfo(b).rank || 99999));
for (const r of [0, 1, 2, 5, 9, 30, 99, 150, 500, 999, 1500, 3000, 5000, 8000, 9300]) console.log(show(byRank[r]));
console.log("— purged:");
for (const id of byRank.slice(-3)) console.log(show(id));
// power per cost by tier (stat points + rough worth of text)
const agg: Record<string, { n: number; v: number }> = {};
const fac: Record<string, number> = {};
for (let id = 1; id <= SNARKS; id++) {
  const d = snarkCard(id);
  const v = (d.atk ?? 0) + (d.hp ?? 0) + (d.worth ?? 0) - (2 * d.cost + 1);
  const k = d.rarity;
  agg[k] ??= { n: 0, v: 0 };
  agg[k].n++;
  agg[k].v += v;
  fac[d.faction] = (fac[d.faction] ?? 0) + 1;
}
console.log("— over the vanilla curve, mean by tier:", Object.entries(agg).map(([k, a]) => `${k} ${a.n} ${(a.v / a.n).toFixed(2)}`).join(" | "));
console.log("— factions:", JSON.stringify(fac));
