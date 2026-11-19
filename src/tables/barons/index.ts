/**
 * BLOCK BARONS: the Game House's property-trading board game (2–8 seats). Roll round ZStreet,
 * buy its places, complete districts, build miners and Foundries, trade with the zkSNARK barons.
 * Board money is credits (cr); the stake is ⓩ play chips, paid back by final place.
 *
 *   board.ts: the spaces, decks, numbers · engine.ts: the rules (Node-safe) · ai.ts: the barons
 *   view3d.ts: the 3D board · table.ts: the HUD and the flow · art.ts: the paint · lines.ts: the talk
 */
import type { TableDef } from "../types";
import { Table } from "./table";

const barons: TableDef = {
  key: "barons",
  title: "BLOCK BARONS",
  titleZh: "区块大亨",
  tag: "Property trading · build miners · out-trade the snarks",
  tagZh: "地产交易 · 建矿机 · 智胜 zkSNARK",
  help: "Roll round ZStreet and buy its places. Own a whole district to double its rent, then plug in miners and raise a Foundry. Decline a deed and it goes to a sealed fee auction. Trade deeds, credits and pardons; dodge the Tracker's Raid. Speed: the richest net worth after 20 rounds (or 25 min) wins; Classic: last baron standing. Pot paid by final place.",
  helpZh: "掷骰绕行 ZStreet，买下地产。拥有整个区租金翻倍，再装矿机、建铸造厂。放弃购买则进入密封出价拍卖。交易地契、钱和特赦卡；躲开追踪者突袭。快速模式：20 轮（或 25 分钟）后身家最高者胜；经典模式：坚持到最后者胜。奖池按名次分配。",
  minSeats: 2,
  maxSeats: 8,
  defaultSeats: 6,
  stakes: [0, 50, 100, 250, 500],
  minutes: 20,
  color: "#ff6b35",
  thumb: "/party/thumbs/tables-barons.jpg",
  open(o) {
    const t = new Table(o);
    return { close: () => t.close() };
  },
};

export default barons;
