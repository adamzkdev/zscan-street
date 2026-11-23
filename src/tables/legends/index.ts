/**
 * ZK LEGENDS: the Game House's collectible card duel (you against one zkSNARK). Four pools of Zcash
 * as factions, a hundred-odd cards drawn with the zkSNARKs themselves (the 26 Apparitions are the
 * legendaries). Rules in engine.ts, the cards in cards.ts, decks in decks.ts, the snarks' play in
 * ai.ts, the table in ui.ts (art.ts, board.ts, sound.ts), the deck builder in builder.ts; the balance
 * bench in test/sim.ts.
 */
import type { TableDef } from "../types";
import { LegendsTable } from "./ui";

const legends: TableDef = {
  key: "legends",
  title: "ZK Legends",
  titleZh: "零知传奇",
  tag: "Build a deck of zkSNARKs and duel for the chain",
  tagZh: "用零知证明者组牌，为链而战",
  help: "Each turn you get one more ZEC to spend on minions and spells. Drag cards onto the board, then attack with your minions. Bring the rival's hero from 30 Health to 0. Four pools, four ways to win: Transparent rushes, Sapling grows, Sprout comes back, Orchard hides.",
  helpZh: "每回合多获得一个 ZEC，用来使用随从与法术。把卡牌拖到战场，然后用随从攻击。把对手英雄的生命值从 30 打到 0。四个池，四种胜法：透明池快攻、Sapling 成长、Sprout 复生、Orchard 隐匿。",
  minSeats: 2,
  maxSeats: 2,
  defaultSeats: 2,
  stakes: [0, 25, 100, 250],
  minutes: 12,
  color: "#f4b728",
  thumb: "/party/thumbs/tables-legends.jpg",
  open(o) {
    const t = new LegendsTable(o);
    return { close: () => t.close() };
  },
};

export default legends;
