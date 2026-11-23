/** Lightweight game catalog shared by the hall and table launcher. No game engines are loaded here. */
/** The house's tables, known before their games are: their names for the room's signs and the COMING SOON card. */
export const HOUSE_TABLES: { key: string; title: string; titleZh: string; tag: string; tagZh: string; color: string; seats: string }[] = [
  { key: "barons", title: "BLOCK BARONS", titleZh: "区块大亨", tag: "Buy the blocks, build the chain, outlast the table", tagZh: "买下街区，建起链条，撑到最后", color: "#ff6b35", seats: "2–8" },
  { key: "glyph", title: "LAST SNARK", titleZh: "最后一证", tag: "Shed every card in your hand before the others", tagZh: "抢先打光手中所有的牌", color: "#c4b1fc", seats: "2–8" },
  { key: "legends", title: "ZK LEGENDS", titleZh: "零知传奇", tag: "Build a deck of zkSNARKs and duel for the chain", tagZh: "用零知证明者组牌，为链而战", color: "#f4b728", seats: "2" },
  { key: "holdem", title: "ORCHARD HOLD'EM", titleZh: "果园德州扑克", tag: "Two cards, five on the felt, the best hand takes the pot", tagZh: "两张底牌，五张公共牌，最好的牌拿走奖池", color: "#a8d8e8", seats: "2–8" },
];
