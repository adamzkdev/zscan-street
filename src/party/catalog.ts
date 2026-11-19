/**
 * ZK PARTY's mini-games as cards, light: what the city shows of them (the GAME HOUSE's wall of
 * screens) without loading a game's code. The same names as src/party/games (their MiniDef's
 * title, tag and colour); partylab's `?catalog` check says when one has drifted.
 */
export interface GameCard {
  key: string;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  color: string;
}

export const GAME_CARDS: GameCard[] = [
  { key: "kart", title: "SNARK KART", titleZh: "Snark 卡丁车", tag: "Street circuits: ZStreet, the NU7 Grand Prix in the snow, Marina Bay in the rain. Drift, jump, zap the leader.", tagZh: "街道赛道：ZStreet、雪中的 NU7 大奖赛、雨夜的滨海湾。漂移、飞跃、电击领先者。", color: "#ff6b35" },
  { key: "bumper", title: "BUMPER SNARKS", titleZh: "碰碰球", tag: "Bonk rivals off the arena, then survive NU7", tagZh: "把对手撞下场地，再撑过 NU7", color: "#3ec6ff" },
  { key: "tiles", title: "SAFE BLOCK", titleZh: "安全方块", tag: "Stand on the colour the block calls, or drop into the void", tagZh: "站到方块喊出的颜色上，否则掉进虚空", color: "#8ee35b" },
  { key: "coins", title: "ⓩ SHOWER", titleZh: "ⓩ 币雨", tag: "It's raining ⓩ coins on the plaza. Grab them all!", tagZh: "广场下起了ⓩ币雨，统统抢到手！", color: "#ffd23f" },
  { key: "laser", title: "LASER SWEEP", titleZh: "激光扫荡", tag: "Jump the pink, duck the cyan", tagZh: "跳过粉色，躲过青色", color: "#ff5fa2" },
  { key: "bomb", title: "HOT WALLET", titleZh: "烫手钱包", tag: "Don't be holding it when it blows", tagZh: "爆炸时别拿在手上", color: "#ff6b35" },
  { key: "planet", title: "PLANET GRAB", titleZh: "星球抢旗", tag: "Sprint round a tiny planet and snag the flags: a meadow, an ocean world, a proof factory", tagZh: "绕着小星球狂奔，抢下旗子：草原、海洋星球、证明工厂", color: "#a98bff" },
  { key: "dig", title: "PROOF OF DIG", titleZh: "挖矿证明", tag: "First to dig down to the GENESIS block wins: a sunny meadow, an ice cave under Central Park, a sunken reef off Marina Bay", tagZh: "第一个挖到创世区块者胜：晴天草地、中央公园地下冰洞、滨海湾外的沉没珊瑚礁", color: "#ffb02e" },
  { key: "turf", title: "INSCRIBE!", titleZh: "铭刻！", tag: "Every tile you run over takes your zkSNARK's sigil. Inscribe the most!", tagZh: "跑过的地砖都会刻上你的 zkSNARK 印记。刻得最多者胜！", color: "#b07bff" },
  { key: "roll", title: "BIG Z ROLL", titleZh: "巨Z滚滚来", tag: "The giant Z-Block is rolling after you: run! Over ZStreet, the frozen Sprout river, Marina Bay's rooftops.", tagZh: "巨大的Z方块滚过来了：快跑！ZStreet 上空、冰封的 Sprout 河、滨海湾屋顶。", color: "#ffd23f" },
  { key: "sign", title: "PROVE THE BLOCK", titleZh: "证明区块", tag: "Remember the proof. Race across the sigils. Prove it first!", tagZh: "记住证明，踩遍印记，抢先证明区块！", color: "#c4b1fc" },
  { key: "mempool", title: "MEMPOOL RUSH", titleZh: "内存池大抢运", tag: "Build Zcash blocks: grab fee parcels, fill your crate before the block is found!", tagZh: "打包 Zcash 区块：抢手续费包裹，在出块前装满你的箱子！", color: "#9d7bff" },
  { key: "lattice", title: "HALO FALL", titleZh: "光环坠落", tag: "EXPOSURE survival: the tiles crack under your feet", tagZh: "曝光求生：脚下的地砖会碎", color: "#c4b1fc" },
  { key: "stack", title: "CHAIN STACK", titleZh: "区块叠叠高", tag: "Drop your blocks dead on. The tallest chain wins!", tagZh: "看准时机落块，链最高者胜！", color: "#ff6b35" },
  { key: "gallery", title: "NULLIFIER GALLERY", titleZh: "废止符靶场", tag: "Nullify the transparent addresses in the prison yard: shoot the P2PKH and P2SH locks, never the Orchard shields!", tagZh: "在监狱大院作废透明地址：射爆 P2PKH 和 P2SH 锁，千万别打 Orchard 护盾！", color: "#ff6b35" },
  { key: "beat", title: "HASH BEAT", titleZh: "哈希节拍", tag: "A rhythm dance-off: the Equihash club, a Marina Bay pool deck, Central Park's winter fest. Dance to the beat!", tagZh: "节奏斗舞：Equihash 俱乐部、滨海湾泳池甲板、中央公园冬季音乐节。踩准节拍！", color: "#ff6b35" },
  { key: "run", title: "CONSENSUS RUN", titleZh: "共识大冲关", tag: "Race your transaction to finality: over ZStreet, through a night market, in low orbit", tagZh: "带着你的交易冲向最终确认：ZStreet 上空、夜市、近地轨道", color: "#8ee35b" },
  { key: "qball", title: "Z-BALL CUP", titleZh: "Z球杯", tag: "Shielded vs Transparent · 2 on 2 · most goals in 50 s: over ZStreet, on the frozen lake, on a Marina Bay roof", tagZh: "屏蔽对透明 · 二对二 · 50 秒进球多者胜：ZStreet 上空、冰封湖面、滨海湾屋顶", color: "#ff8a4c" },
  { key: "forge", title: "FORGERY GAP", titleZh: "伪造深渊", tag: "Valid proofs hold. Counterfeit notes shatter.", tagZh: "有效证明稳如磐石，伪钞一踩就碎", color: "#ff4fd8" },
];

/** The mini-games' thumbnails (public/party/thumbs/<key>.jpg). */
export const thumbOf = (key: string) => `${import.meta.env?.BASE_URL ?? "/"}party/thumbs/${key}.jpg`;
