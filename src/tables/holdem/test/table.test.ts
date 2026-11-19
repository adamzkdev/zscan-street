/** The session layer: node src/tables/holdem/test/table.test.ts */
import { Table, cashBlinds, prizes } from "../table";
import type { Persona } from "../ai";
import { ok, eq, done } from "./check";

const P = (n: number): Persona[] => Array.from({ length: n }, (_, i) => ({ style: (["solid", "rock", "lag", "station", "maniac", "passive"] as const)[i % 6], skill: 0.6 }));

// cash blinds and stacks
eq(JSON.stringify(cashBlinds(100)), JSON.stringify({ sb: 1, bb: 2, buyin: 100 }), "ⓩ100 plays 1/2 with 50 big blinds");
eq(JSON.stringify(cashBlinds(2000)), JSON.stringify({ sb: 20, bb: 40, buyin: 2000 }), "ⓩ2000 plays 20/40");
eq(cashBlinds(0).buyin, 200, "a free table plays 200 chips");
{
  const t = new Table({ format: "cash", n: 6, stake: 500, seed: 1, personas: P(6) });
  eq(t.seats[0].stack, 500, "you sit with your buy-in");
  ok(t.seats.slice(1).every((s) => s.stack >= 300 && s.stack <= 1000 && s.stack % 10 === 0), "the snarks sit with 30–100 big blinds, in big blinds");
  eq(t.payout(), 500, "leaving at once pays the buy-in back");
}
// an AI that busts at the cash table rebuys; you busting ends the session
{
  const t = new Table({ format: "cash", n: 3, stake: 100, seed: 2, personas: P(3) });
  let rebuys = 0,
    overs = 0;
  for (let k = 0; k < 1500; k++) {
    const a = t.playHandInstantly(40);
    rebuys += a.rebuys.length;
    for (const r of a.rebuys) eq(r.amount, 100, "a rebuy is one buy-in");
    if (a.over) {
      overs++;
      eq(t.seats[0].stack, 0, "the session ends when you bust");
      // (play on for the test: you buy in again)
      t.seats[0].stack = 100;
      t.seats[0].bought += 100;
    }
  }
  ok(rebuys > 0, `the snarks rebuy (${rebuys})`);
  ok(overs > 0, `you can bust (${overs})`);
  eq(t.seats.reduce((a, s) => a + s.stack, 0), t.seats.reduce((a, s) => a + s.bought, 0), "every chip is accounted for by the buy-ins");
}
// Sit & Go: places 1..n, payouts by place, the blinds rise
{
  for (const n of [2, 4, 6, 8]) {
    const t = new Table({ format: "turbo", n, stake: 100, seed: 40 + n, personas: P(n) });
    let levels = 0;
    while (t.alive().length > 1) if (t.playHandInstantly(40).levelUp) levels++;
    const places = t.seats.map((s) => s.place).sort((a, b) => a - b);
    eq(places.join(), Array.from({ length: n }, (_, i) => i + 1).join(), `${n} seats: every place given once`);
    eq(t.order().map((s) => t.seats[s].place).join(), places.join(), `${n} seats: the order follows the places`);
    eq(t.payout(), prizes(n, 100)[t.seats[0].place - 1] ?? 0, `${n} seats: your payout is your place's prize`);
    ok(levels >= 1, `${n} seats: the blinds went up (${levels} times)`);
  }
}
// a free Sit & Go pays nothing
{
  const t = new Table({ format: "sng", n: 3, stake: 0, seed: 9, personas: P(3) });
  t.finishInstantly();
  eq(t.payout(), 0, "free tables pay nothing");
}
// the same seed deals the same cards
{
  const a = new Table({ format: "cash", n: 4, stake: 100, seed: 77, personas: P(4) });
  const b = new Table({ format: "cash", n: 4, stake: 100, seed: 77, personas: P(4) });
  const ha = a.newHand(),
    hb = b.newHand();
  eq(ha.players.map((p) => p.hole.join("-")).join(), hb.players.map((p) => p.hole.join("-")).join(), "seeded deals repeat");
  eq(ha.button, hb.button, "seeded button repeats");
}
done("table");
