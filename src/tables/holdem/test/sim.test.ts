/**
 * Thousands of hands with AIs in every seat: node src/tables/holdem/test/sim.test.ts [--long]
 * Chips are conserved, every hand ends, the styles play distinctly, skill earns, Sit & Gos finish.
 */
import { Table, prizes, type Format } from "../table";
import { STYLES, type Persona, type Style } from "../ai";
import { ok, eq, done } from "./check";

declare const process: { argv: string[] };
const LONG = typeof process !== "undefined" && process.argv.includes("--long");
const pct = (x: number) => (x * 100).toFixed(0).padStart(3) + "%";

// ---- decision speed ----
{
  const personas: Persona[] = Array.from({ length: 8 }, (_, i) => ({ style: STYLES[i % 6], skill: 0.9 }));
  const t = new Table({ format: "cash", n: 8, stake: 100, seed: 3, personas });
  let n = 0;
  const t0 = performance.now();
  for (let k = 0; k < 40; k++) {
    const h = t.newHand();
    while (h.phase !== "done") {
      if (h.phase === "deal") h.step();
      else {
        h.act(t.decide().action);
        n++;
      }
    }
    t.finishHand();
  }
  const ms = (performance.now() - t0) / n;
  console.log(`  decisions at skill 0.9, 8 seats: ${ms.toFixed(2)} ms each (${n})`);
  ok(ms < 25, "a decision takes under 25 ms");
}

// ---- cash: one of each style, many hands ----
function cash(hands: number, skill: (i: number) => number, styles: Style[], seed: number) {
  const personas: Persona[] = styles.map((style, i) => ({ style, skill: skill(i) }));
  const t = new Table({ format: "cash", n: styles.length, stake: 100, seed, personas });
  let bad = 0;
  const won = new Array(styles.length).fill(0);
  for (let k = 0; k < hands; k++) {
    // the human seat never busts out of the sim: top it up like the AIs
    if (t.seats[0].stack <= 0) {
      t.seats[0].stack = 100;
      t.seats[0].bought += 100;
    }
    const before = t.seats.reduce((s, x) => s + x.stack, 0);
    const h = t.newHand();
    let guard = 0;
    while (h.phase !== "done" && guard++ < 400) {
      if (h.phase === "deal") h.step();
      else h.act(t.decide(80).action);
    }
    if (h.phase !== "done") bad++;
    const after = h.players.reduce((s, p) => s + p.stack, 0) + t.seats.filter((s) => !h.players[s.seat].inHand).reduce((s, x) => s + x.stack, 0);
    if (after !== before) bad++;
    for (const p of h.players) if (p.inHand) won[p.seat] += h.won[p.seat] - p.total;
    const a = t.finishHand();
    if (a.over) {
      t.seats[0].stack = 100;
      t.seats[0].bought += 100;
    }
  }
  const sumStack = t.seats.reduce((s, x) => s + x.stack, 0);
  const sumBought = t.seats.reduce((s, x) => s + x.bought, 0);
  return { t, bad, won, sumStack, sumBought };
}
{
  const styles: Style[] = ["solid", "rock", "passive", "lag", "station", "maniac"];
  const H = LONG ? 20000 : 4000;
  let agg = { hands: [0, 0, 0, 0, 0, 0], vpip: [0, 0, 0, 0, 0, 0], pfr: [0, 0, 0, 0, 0, 0], aggr: [0, 0, 0, 0, 0, 0], calls: [0, 0, 0, 0, 0, 0], won: [0, 0, 0, 0, 0, 0] };
  for (let rot = 0; rot < 6; rot++) {
    // rotate the styles round the seats so position evens out
    const st = styles.map((_, i) => styles[(i + rot) % 6]);
    const r = cash(Math.floor(H / 6), () => 0.65, st, 100 + rot);
    eq(r.bad, 0, `cash rotation ${rot}: every hand ends, chips conserved`);
    eq(r.sumStack, r.sumBought, `cash rotation ${rot}: stacks add up to all the buy-ins`);
    st.forEach((s, seat) => {
      const i = styles.indexOf(s);
      agg.hands[i] += r.t.reads.hands[seat];
      agg.vpip[i] += r.t.reads.vpip[seat];
      agg.pfr[i] += r.t.reads.pfr[seat];
      agg.aggr[i] += r.t.reads.aggr[seat];
      agg.calls[i] += r.t.reads.calls[seat];
      agg.won[i] += r.won[seat];
    });
  }
  console.log(`  cash, 6 seats, skill 0.65, ${H} hands (blinds 1/2):`);
  console.log("    style    VPIP  PFR   AF    bb/100");
  const vp: Record<string, number> = {};
  const af: Record<string, number> = {};
  styles.forEach((s, i) => {
    vp[s] = agg.vpip[i] / agg.hands[i];
    af[s] = agg.aggr[i] / Math.max(1, agg.calls[i]);
    console.log(`    ${s.padEnd(8)} ${pct(vp[s])} ${pct(agg.pfr[i] / agg.hands[i])}  ${af[s].toFixed(2).padStart(4)}  ${((agg.won[i] / 2 / agg.hands[i]) * 100).toFixed(1).padStart(6)}`);
  });
  ok(vp.rock < vp.solid && vp.solid < vp.lag && vp.lag < vp.maniac, "VPIP: rock < solid < lag < maniac");
  ok(vp.station > vp.solid + 0.1, "the calling station plays many hands");
  ok(af.maniac > af.solid && af.solid > af.station && af.solid > af.passive, "aggression: maniac > solid > station, passive");
}
// ---- skill: the same style, skilled vs unskilled ----
{
  const H = LONG ? 12000 : 3000;
  let hi = 0,
    lo = 0,
    hands = 0;
  for (let rot = 0; rot < 6; rot++) {
    const styles: Style[] = ["solid", "solid", "lag", "lag", "rock", "station"];
    const skillOf = (i: number) => ((i + rot) % 2 === 0 ? 0.92 : 0.2);
    const r = cash(Math.floor(H / 6), skillOf, styles, 900 + rot);
    for (let i = 0; i < 6; i++) {
      if (skillOf(i) > 0.5) hi += r.won[i];
      else lo += r.won[i];
    }
    hands += Math.floor(H / 6);
  }
  console.log(`  skill 0.92 vs 0.2 (same styles): ${((hi / 2 / hands / 3) * 100).toFixed(1)} vs ${((lo / 2 / hands / 3) * 100).toFixed(1)} bb/100 per seat`);
  ok(hi > lo, "skilled seats win more than unskilled ones");
}
// ---- Sit & Go: they finish, the order is whole, the prizes add up ----
for (const format of ["sng", "turbo"] as Format[]) {
  for (const n of [2, 3, 6, 8]) {
    const lengths: number[] = [];
    let bad = 0;
    const G = LONG ? 60 : n >= 6 ? 12 : 20;
    for (let g = 0; g < G; g++) {
      const personas: Persona[] = Array.from({ length: n }, (_, i) => ({ style: STYLES[(i + g) % 6], skill: 0.3 + ((i * 37 + g * 11) % 60) / 100 }));
      const t = new Table({ format, n, stake: 100, seed: 5000 + g * 13 + n, personas });
      const total = t.seats.reduce((s, x) => s + x.stack, 0);
      let guard = 0;
      while (t.alive().length > 1 && guard++ < 2000) {
        t.playHandInstantly(60);
        if (t.seats.reduce((s, x) => s + x.stack, 0) !== total) bad++;
      }
      lengths.push(t.handNo);
      const order = t.order();
      if (new Set(order).size !== n || order.length !== n) bad++;
      if (t.seats[order[0]].place !== 1) bad++;
      if (t.alive().length !== 1) bad++;
    }
    eq(bad, 0, `${format} ${n} seats: chips conserved, a winner, a full order`);
    lengths.sort((a, b) => a - b);
    console.log(`  ${format} ${n} seats: ${G} games, hands median ${lengths[lengths.length >> 1]}, max ${lengths[lengths.length - 1]}`);
  }
}
for (const n of [2, 5, 6, 8]) {
  const p = prizes(n, 100);
  eq(p.reduce((a, b) => a + b, 0), 100 * n, `prizes add up to the pool (${n} seats)`);
}
eq(prizes(6, 100).join(), "300,180,120", "6 seats pay 50/30/20");
eq(prizes(4, 100).join(), "260,140", "4 seats pay 65/35");
done("sim");
