/**
 * ORCHARD HOLD'EM: no-limit Texas Hold'em for 2–8 seats in The Orchard Room (Orchard Tower's
 * jazz club), for ⓩ play chips. A cash table (your buy-in is your stack, leave between hands with
 * it) or a Sit & Go (last one standing; 65/35, or 50/30/20 from six seats).
 *
 * The rules engine (engine.ts, eval.ts, table.ts) and the AI (ai.ts) are pure and tested in Node:
 *   node src/tables/holdem/test/eval.test.ts [--seven]
 *   node src/tables/holdem/test/engine.test.ts
 *   node src/tables/holdem/test/sim.test.ts [--long]
 */
import type { TableDef } from "../types";
import { Game } from "./ui";

const holdem: TableDef = {
  key: "holdem",
  title: "Orchard Hold'em",
  titleZh: "果园德州扑克",
  tag: "No-limit Hold'em in The Orchard Room",
  tagZh: "果园厅里的无限注德州扑克",
  help: "Two cards each, five on the board: make the best five-card hand, or make everyone fold. Cash table: your buy-in is your stack, leave between hands. Sit & Go: last one standing. F fold · C check/call · R raise · arrows size the bet.",
  helpZh: "每人两张底牌，公共牌五张：组成最好的五张牌，或者让所有人弃牌。现金桌：买入即筹码，每手之间可离开。坐满即玩：最后站着的人获胜。F 弃牌 · C 过牌/跟注 · R 加注 · 方向键调整下注。",
  minSeats: 2,
  maxSeats: 8,
  defaultSeats: 6,
  stakes: [0, 100, 500, 2000],
  minutes: 20,
  color: "#c4b1fc",
  thumb: "/party/thumbs/tables-holdem.jpg",
  open(o) {
    const g = new Game(o);
    return { close: () => g.close() };
  },
};

export default holdem;
