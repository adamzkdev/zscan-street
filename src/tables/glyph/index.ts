/**
 * LAST SNARK: the Game House's shedding card game for 2–8 seats (you and up to seven zkSNARKs).
 * Rules in engine.ts, the snarks' play in ai.ts, the cards in art.ts, the table in ui.ts.
 */
import type { TableDef } from "../types";
import { GlyphTable } from "./ui";

const glyph: TableDef = {
  key: "glyph",
  title: "Last Snark",
  titleZh: "最后一证",
  tag: "Match the pool, shed your hand, shout LAST SNARK!",
  tagZh: "同池同符出牌，出光手牌，高喊“最后一证！”",
  help: "Play a card of the same pool or symbol as the discard, or draw. FORK and DUST ATTACK are wild. Press L (LAST SNARK!) on your second-to-last card or a rival may catch you for +2. Shed your hand to score the others' cards.",
  helpZh: "出与弃牌同池或同符的牌，否则摸牌。分叉与粉尘攻击是万能牌。剩两张出牌时按 L（最后一证！），否则可能被对手抓到罚摸 2 张。出光手牌即可赢得其他人手中的牌分。",
  minSeats: 2,
  maxSeats: 8,
  defaultSeats: 4,
  stakes: [0, 25, 100, 250],
  minutes: 7,
  color: "#ff6b35",
  thumb: "/party/thumbs/tables-glyph.jpg",
  open(o) {
    const t = new GlyphTable(o);
    return { close: () => t.close() };
  },
};

export default glyph;
