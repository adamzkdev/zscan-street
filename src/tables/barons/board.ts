/**
 * BLOCK BARONS: the board. Forty spaces round ZStreet (its real places, grouped by district),
 * the two card decks (MEMPOOL: random events; ZIP: governance, kind "qip") and the numbers. Pure data: no DOM,
 * so the rules engine and the simulations run in Node.
 *
 * Money on the board is CREDITS ("cr"), board money only: never ⓩ chips, never ZEC.
 */

export type Kind = "genesis" | "deed" | "line" | "util" | "mempool" | "qip" | "tax" | "jail" | "park" | "raid";

export interface Group {
  key: string;
  en: string;
  zh: string;
  color: string;
  /** What one miner (and the Foundry) costs to build on a deed of this district. */
  build: number;
}

export interface Space {
  i: number;
  kind: Kind;
  en: string;
  zh: string;
  /** A short second line (the district, the line…). */
  subEn?: string;
  subZh?: string;
  /** Deeds (and lines and utilities). */
  price?: number;
  group?: number;
  /** Rent by level: bare, 1…4 miners, the Foundry (deeds only). */
  rent?: number[];
  /** Taxes: the amount (or the rule, see engine). */
  tax?: number;
  /** The pixel icon (icons in view3d). */
  icon: string;
}

export const START_CASH = 1500;
export const BLOCK_REWARD = 200;
/** Landing right on GENESIS BLOCK: the reward and this bonus ("a perfect block"). */
export const PERFECT_BLOCK = 100;
export const JAIL_FINE = 50;
export const JAIL = 10;
export const PARK = 20;
export const RAID = 30;
export const LINE_RENT = [25, 50, 100, 200];
export const UTIL_MULT = [4, 10];
/** A miner's resale: half its cost. Collateral: half the price; redeeming it costs 10 % more. */
export const SELL_BACK = 0.5;
export const REDEEM = 1.1;

export const GROUPS: Group[] = [
  { key: "genesis", en: "SHIELDED WOODS", zh: "屏蔽森林", color: "#d9bc8a", build: 50 },
  { key: "lattice", en: "ORCHARD", zh: "果园区", color: "#c4b1fc", build: 50 },
  { key: "market", en: "SHIBUYA", zh: "涩谷", color: "#ff5c8a", build: 100 },
  { key: "water", en: "MARINA BAY", zh: "滨海湾", color: "#5cc8ff", build: 100 },
  { key: "runtime", en: "NU7 QUARTER", zh: "NU7区", color: "#6dbf8a", build: 150 },
  { key: "poseidon", en: "MIDTOWN", zh: "中城", color: "#2ee6c8", build: 150 },
  { key: "dilithium", en: "WALL STREET", zh: "华尔街", color: "#ff6b35", build: 200 },
  { key: "skyline", en: "THE PALM", zh: "棕榈岛", color: "#e8e6e0", build: 200 },
];

/** Bare rent from the price: cheap streets earn little, the skyline a lot. */
const baseRent = (p: number) => Math.max(2, Math.round(p * (0.035 + p / 5000)));
/** 1…4 miners, then the Foundry, as multiples of the bare rent. */
const LEVEL_X = [5, 14, 36, 46, 56];
const nice = (v: number) => (v < 20 ? Math.round(v) : Math.round(v / 5) * 5);
export function rentTable(price: number) {
  const b = baseRent(price);
  return [b, ...LEVEL_X.map((x) => nice(b * x))];
}

type Def = Omit<Space, "i">;
const deed = (en: string, zh: string, group: number, price: number, icon: string): Def => ({ kind: "deed", en, zh, group, price, rent: rentTable(price), icon, subEn: GROUPS[group].en, subZh: GROUPS[group].zh });
const line = (en: string, zh: string): Def => ({ kind: "line", en, zh, price: 200, icon: "train", subEn: "ZEC LINE", subZh: "ZEC线" });
const util = (en: string, zh: string, icon: string): Def => ({ kind: "util", en, zh, price: 150, icon, subEn: "UTILITY", subZh: "公用设施" });
const mempool = (): Def => ({ kind: "mempool", en: "MEMPOOL", zh: "内存池", icon: "mempool", subEn: "DRAW A TX", subZh: "抽一笔交易" });
const qip = (): Def => ({ kind: "qip", en: "ZIP", zh: "ZIP 提案", icon: "qip", subEn: "GOVERNANCE", subZh: "治理" });

const DEFS: Def[] = [
  { kind: "genesis", en: "GENESIS BLOCK", zh: "创世区块", icon: "genesis", subEn: `PASS: +${BLOCK_REWARD} cr`, subZh: `经过：+${BLOCK_REWARD}` },
  deed("SPROUT FALLS", "萌芽瀑布", 0, 60, "falls"),
  mempool(),
  deed("REDWOOD CREEK", "红杉溪", 0, 80, "creek"),
  { kind: "tax", en: "FEE MARKET", zh: "手续费市场", icon: "fee", subEn: "60 + 10 / DEED", subZh: "60 + 每张地契10" },
  line("GENESIS STATION", "创世站"),
  deed("ORCHARD GROVE", "果园林", 1, 100, "woods"),
  qip(),
  deed("PROOF POINT", "证明角", 1, 100, "pin"),
  deed("THE ORCHARD ROOM", "果园爵士厅", 1, 120, "note"),
  { kind: "jail", en: "ZEC STATE PENITENTIARY", zh: "ZEC州立监狱", icon: "jail", subEn: "JUST VISITING", subZh: "仅探访" },
  deed("ZK COFFEE", "ZK咖啡", 2, 140, "coffee"),
  util("PROOF FACTORY", "证明工厂", "pick"),
  deed("SHIBUYA CINEMA", "涩谷影院", 2, 150, "film"),
  deed("ZK MALL", "ZK商场", 2, 160, "bag"),
  line("TRANSPARENT SQUARE", "透明广场站"),
  deed("MARINA ZEC HOTEL", "滨海ZEC酒店", 3, 180, "hotel"),
  mempool(),
  deed("zkSNARK OF LIBERTY", "自由zkSNARK像", 3, 190, "torch"),
  deed("zkSNARK MUSEUM", "zkSNARK博物馆", 3, 200, "museum"),
  { kind: "park", en: "CENTRAL PARK", zh: "中央公园", icon: "park", subEn: "TAKE THE POT", subZh: "拿走奖池" },
  deed("NU7 TOWER", "NU7塔", 4, 220, "spec"),
  qip(),
  deed("NU7 GRAND PRIX", "NU7大奖赛", 4, 230, "flag"),
  deed("BLOCK STADIUM", "区块体育场", 4, 240, "stadium"),
  line("DOWNTOWN CENTRAL", "市中心总站"),
  deed("ZK UNIVERSITY", "ZK大学", 5, 260, "cap"),
  deed("THE COLOSSEUM", "斗兽场", 5, 270, "arena"),
  util("PORT DOCKS", "港口码头", "parcel"),
  deed("ZEC NEEDLE", "ZEC针塔", 5, 280, "needle"),
  { kind: "raid", en: "TRACKER'S RAID", zh: "追踪者突袭", icon: "raid", subEn: "TO THE PENITENTIARY", subZh: "送进监狱" },
  deed("SAPLING TOWER", "Sapling塔", 6, 300, "tower"),
  deed("ZEC RESERVE", "ZEC储备", 6, 310, "vault"),
  mempool(),
  deed("HALO TOWER", "Halo塔", 6, 320, "heli"),
  line("BAY PIER", "海湾码头站"),
  qip(),
  deed("ZK TOWER", "ZK塔", 7, 350, "mark"),
  { kind: "tax", en: "BIG PROOF", zh: "大证明费", tax: 100, icon: "sig", subEn: "PAY 100 cr", subZh: "支付100" },
  deed("BURJ AL ZEC", "ZEC帆船塔", 7, 400, "burj"),
];

export const SPACES: Space[] = DEFS.map((d, i) => ({ ...d, i }));
export const N = SPACES.length;
export const OWNABLE = SPACES.filter((s) => s.price !== undefined).map((s) => s.i);
export const LINES = SPACES.filter((s) => s.kind === "line").map((s) => s.i);
export const UTILS = SPACES.filter((s) => s.kind === "util").map((s) => s.i);
/** Each district's deeds, in board order. */
export const GROUP_SPACES: number[][] = GROUPS.map((_, g) => SPACES.filter((s) => s.kind === "deed" && s.group === g).map((s) => s.i));

// ---- the decks ----------------------------------------------------------------------------------

export type CardFx =
  | { k: "gain"; v: number }
  | { k: "lose"; v: number }
  /** Paid into CENTRAL PARK's pot. */
  | { k: "park"; v: number }
  | { k: "each"; v: number }
  | { k: "fromEach"; v: number }
  | { k: "goto"; to: number }
  | { k: "back"; n: number }
  | { k: "nearLine" }
  | { k: "nearUtil" }
  | { k: "jail" }
  | { k: "pardon" }
  /** Per miner and per Foundry you own. */
  | { k: "repairs"; miner: number; foundry: number };

export interface Card {
  en: string;
  zh: string;
  fx: CardFx;
}

export const MEMPOOL: Card[] = [
  { en: "A kind miner picked your tx first. Advance to GENESIS BLOCK.", zh: "好心矿工优先打包了你的交易。前进到创世区块。", fx: { k: "goto", to: 0 } },
  { en: "Your stuck transaction finally dropped: fee refund. Collect 50 cr.", zh: "卡住的交易终于被丢弃：退还手续费。收取 50。", fx: { k: "gain", v: 50 } },
  { en: "Dust attack: the Tracker linked your old t-addr. Go to ZEC STATE PENITENTIARY.", zh: "粉尘攻击：追踪者关联了你的旧透明地址。进入 ZEC州立监狱。", fx: { k: "jail" } },
  { en: "VIEWING KEY. Show it to the warden and leave the Penitentiary free. Keep this card until used (or trade it).", zh: "查看密钥。出示给狱警，免费离开监狱。保留此卡直到使用（也可交易）。", fx: { k: "pardon" } },
  { en: "Hop on the ZEC LINE: advance to the nearest station. If someone owns it, pay them double fare.", zh: "搭乘 ZEC 线：前进到最近的车站。若有人拥有，付双倍车费。", fx: { k: "nearLine" } },
  { en: "Your tx hit its expiry height (ZIP 203): resend it. Move back 3 spaces.", zh: "你的交易到了过期高度（ZIP 203）：重新发送。后退 3 格。", fx: { k: "back", n: 3 } },
  { en: "Your inscription went viral. Collect 25 cr from every player.", zh: "你的铭文爆红了。向每位玩家收取 25。", fx: { k: "fromEach", v: 25 } },
  { en: "Rig maintenance day: pay 25 cr per miner and 100 cr per Foundry you own.", zh: "矿机维护日：每台矿机付 25，每座铸造厂付 100。", fx: { k: "repairs", miner: 25, foundry: 100 } },
  { en: "Penthouse viewing: advance to BURJ AL ZEC.", zh: "顶层看房：前进到 ZEC帆船塔。", fx: { k: "goto", to: 39 } },
  { en: "Morning run through the orchard: advance to ORCHARD GROVE.", zh: "果园晨跑：前进到果园林。", fx: { k: "goto", to: 6 } },
  { en: "Mempool flush! Advance to the nearest utility. If owned, roll and pay 10× the dice.", zh: "内存池清空！前进到最近的公用设施。若有人拥有，掷骰并支付点数的 10 倍。", fx: { k: "nearUtil" } },
  { en: "Your Orchard proof verified on the first try. Collect 150 cr.", zh: "你的 Orchard 证明一次就验证通过。收取 150。", fx: { k: "gain", v: 150 } },
  { en: "Fat-finger fee: you paid 100× the ZIP 317 fee. Pay 60 cr into CENTRAL PARK.", zh: "手滑：手续费多付了 100 倍（ZIP 317）。向中央公园支付 60。", fx: { k: "park", v: 60 } },
  { en: "Dust sweep: you consolidate a hundred tiny notes. Collect 20 cr.", zh: "清扫粉尘：合并了一百个小额票据。收取 20。", fx: { k: "gain", v: 20 } },
  { en: "Front-run by a bot on a transparent swap: pay 40 cr.", zh: "透明兑换被机器人抢跑：支付 40。", fx: { k: "lose", v: 40 } },
  { en: "Late-night block at the Grand Prix: advance to NU7 GRAND PRIX.", zh: "深夜出块赶赴大奖赛：前进到 NU7大奖赛。", fx: { k: "goto", to: 23 } },
];

export const QIPS: Card[] = [
  { en: "NU7 activates without a hitch at block 3,543,405. Collect 100 cr.", zh: "NU7 在区块 3,543,405 顺利激活。收取 100。", fx: { k: "gain", v: 100 } },
  { en: "You authored a ZIP: everyone pays 15 cr in review fees.", zh: "你撰写了一份 ZIP：每位玩家支付 15 审阅费给你。", fx: { k: "fromEach", v: 15 } },
  { en: "Elected to run the community call. Pay every player 40 cr for snacks.", zh: "当选社区会议主持。付给每位玩家 40 买零食。", fx: { k: "each", v: 40 } },
  { en: "Community grant approved. Collect 200 cr.", zh: "社区资助获批。收取 200。", fx: { k: "gain", v: 200 } },
  { en: "Network upgrade audit: pay 40 cr per miner and 115 cr per Foundry.", zh: "网络升级审计：每台矿机付 40，每座铸造厂付 115。", fx: { k: "repairs", miner: 40, foundry: 115 } },
  { en: "VIEWING KEY. Show it to the warden and leave the Penitentiary free. Keep this card until used (or trade it).", zh: "查看密钥。出示给狱警，免费离开监狱。保留此卡直到使用（也可交易）。", fx: { k: "pardon" } },
  { en: "You reused a transparent address and the Tracker noticed. Go to ZEC STATE PENITENTIARY.", zh: "你重复使用了透明地址，被追踪者盯上。进入 ZEC州立监狱。", fx: { k: "jail" } },
  { en: "The upgrade activates at its block height. Advance to GENESIS BLOCK.", zh: "升级在指定区块高度激活。前进到创世区块。", fx: { k: "goto", to: 0 } },
  { en: "ZIP: fund the park. Pay 50 cr into CENTRAL PARK.", zh: "ZIP：资助公园。向中央公园支付 50。", fx: { k: "park", v: 50 } },
  { en: "Difficulty adjusts in your favour. Collect 45 cr.", zh: "难度调整对你有利。收取 45。", fx: { k: "gain", v: 45 } },
  { en: "Zcash's birthday (28 October): collect 10 cr from every player.", zh: "Zcash 生日（10 月 28 日）：向每位玩家收取 10。", fx: { k: "fromEach", v: 10 } },
  { en: "Miners' meetup at the PROOF FACTORY: pay 50 cr for the bar tab.", zh: "证明工厂矿工聚会：支付 50 酒水钱。", fx: { k: "lose", v: 50 } },
  { en: "Field trip on the ZEC LINE: advance to DOWNTOWN CENTRAL.", zh: "搭 ZEC 线考察：前进到市中心总站。", fx: { k: "goto", to: 25 } },
  { en: "Bug bounty paid out. Collect 75 cr.", zh: "漏洞赏金到账。收取 75。", fx: { k: "gain", v: 75 } },
  { en: "The halving cuts your block reward. Pay 30 cr.", zh: "减半削减了你的区块奖励。支付 30。", fx: { k: "lose", v: 30 } },
  { en: "You moved everything into the shielded pool. Collect 60 cr.", zh: "你把一切转进了屏蔽池。收取 60。", fx: { k: "gain", v: 60 } },
];

// ---- the stake's payout --------------------------------------------------------------------------

/** The pot's share by final place (index 0: the winner), scaled to the seats. */
export function shares(seats: number): number[] {
  if (seats <= 2) return [1];
  if (seats === 3) return [0.65, 0.35];
  if (seats === 4) return [0.55, 0.3, 0.15];
  if (seats <= 6) return [0.5, 0.3, 0.2];
  return [0.42, 0.26, 0.18, 0.14];
}

// ---- the modes ----------------------------------------------------------------------------------

export type Mode = "blitz" | "speed" | "classic";
export const MODES: Record<Mode, { en: string; zh: string; rounds: number; minutes: number; noteEn: string; noteZh: string }> = {
  blitz: { en: "BLITZ", zh: "闪电", rounds: 12, minutes: 15, noteEn: "12 rounds or 15 min · richest wins", noteZh: "12 轮或 15 分钟 · 身家最高者胜" },
  speed: { en: "SPEED", zh: "快速", rounds: 20, minutes: 25, noteEn: "20 rounds or 25 min · richest wins", noteZh: "20 轮或 25 分钟 · 身家最高者胜" },
  classic: { en: "CLASSIC", zh: "经典", rounds: 150, minutes: 0, noteEn: "Last baron standing", noteZh: "坚持到最后的大亨获胜" },
};
