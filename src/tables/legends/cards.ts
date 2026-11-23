/**
 * ZK LEGENDS: every card. Four factions, the four ways Zcash has held value, and the neutrals:
 * - TRANSPARENT (out in the open): fast, loud, straight at the hero. Miners, Charge, weapons.
 *   Power BROADCAST: 2 damage to the enemy hero.
 * - SAPLING (the pool that grew): many small Plants, then everyone bigger. Power SEED: a 1/1 Seedling.
 * - SPROUT (the first pool, deprecated, never quite gone): Nullifiers, the dead brought back, cards
 *   for Health. Power MIGRATE: draw a card, take 2 damage.
 * - ORCHARD (the shielded one, Halo 2): secrets, Timelocks, spells, Shielded and Halo.
 *   Power HALO2: 1 damage to anything.
 * Keywords: Guard (must be attacked first), Shielded (can't be targeted by the enemy until it attacks),
 * Halo (the first damage is ignored), Charge, Rush, Double-spend (attacks twice), Dust (destroys any
 * minion it damages), Drain (damage heals your hero), Reorg (comes back once with 1 Health), Private
 * (spells and powers can't target it), Mint: (when played from hand), Nullifier: (when it dies),
 * Timelock (can't attack next turn), Redact (its text and buffs are gone), Prover +n (spell damage).
 * Card text: *word* is a keyword (bold), $n is spell damage (Prover adds to it).
 */
import {
  CARDS,
  POWERS,
  KW,
  HERO_UID,
  card,
  foe,
  alive,
  atkOf,
  isHero,
  minion,
  pick,
  rnd,
  draw,
  drawWhere,
  give,
  summon,
  damage,
  heal,
  armor,
  buff,
  setStats,
  addKw,
  destroy,
  redact,
  freeze,
  bounce,
  equip,
  fx,
  discover,
  gainMana,
  setHeroHp,
  sdmg,
  type CardDef,
  type Ctx,
  type Faction,
  type Game,
  type Minion,
  type Side,
} from "./engine";
import { ART } from "./arts";

type Def = Omit<CardDef, "art" | "faction" | "rarity" | "zh" | "textZh"> & { zh?: string; textZh?: string; rarity?: CardDef["rarity"] };

let faction: Faction = "neutral";
function add(d: Def) {
  const c: CardDef = { art: 0, zh: d.name, textZh: d.text, rarity: "common", faction, ...d } as CardDef;
  c.art = ART[c.id] ?? 1 + (Math.abs(hash(c.id)) % 9999);
  CARDS.set(c.id, c);
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

// ---- helpers for the effects ---------------------------------------------------------------------------

const foes = (c: Ctx) => c.g.s[foe(c.side)].board.filter(alive);
const friends = (c: Ctx) => c.g.s[c.side].board.filter(alive);
const others = (c: Ctx) => friends(c).filter((m) => m !== c.self);
const all = (c: Ctx) => [...friends(c), ...foes(c)];
const tribe = (m: Minion, t: string) => card(m.id).tribe === t;
const enemyHero = (c: Ctx) => HERO_UID[foe(c.side)];
const myHero = (c: Ctx) => HERO_UID[c.side];
const srcOf = (c: Ctx) => c.self?.uid ?? myHero(c);
const hit = (c: Ctx, uid: number, n: number, kind = "bolt") => {
  fx(c.g, kind, srcOf(c), [uid]);
  damage(c.g, uid, n, c.self?.uid ?? 0);
};
const hitAll = (c: Ctx, list: Minion[], n: number, kind = "nova") => {
  fx(c.g, kind, srcOf(c), list.map((m) => m.uid));
  for (const m of list) damage(c.g, m.uid, n, c.self?.uid ?? 0);
};
/** A friendly minion that died this game, at random (its id). */
const deadOne = (c: Ctx) => pick(c.g, c.g.s[c.side].dead);
const spellsOf = (f: Faction) => [...CARDS.values()].filter((d) => !d.token && (d.type === "spell" || d.type === "secret") && (d.faction === f || d.faction === "neutral")).map((d) => d.id);
const isHeroT = (_g: Game, _s: Side, uid: number) => isHero(uid);

// ---- the powers -----------------------------------------------------------------------------------------

POWERS.set("transparent", {
  name: "Broadcast",
  zh: "广播",
  text: "Deal 2 damage to the enemy hero.",
  textZh: "对敌方英雄造成 2 点伤害。",
  cost: 2,
  use: (c) => hit(c, enemyHero(c), 2, "shot"),
});
POWERS.set("sapling", {
  name: "Seed",
  zh: "播种",
  text: "Summon a 1/1 Seedling.",
  textZh: "召唤一个 1/1 的幼苗。",
  cost: 2,
  use: (c) => void summon(c.g, c.side, "s_seed"),
});
POWERS.set("sprout", {
  name: "Migrate",
  zh: "迁移",
  text: "Draw a card. Take 2 damage.",
  textZh: "抽一张牌。受到 2 点伤害。",
  cost: 2,
  use: (c) => {
    damage(c.g, myHero(c), 2, 0);
    draw(c.g, c.side);
  },
});
POWERS.set("orchard", {
  name: "Halo2",
  zh: "Halo2",
  text: "Deal 1 damage.",
  textZh: "造成 1 点伤害。",
  cost: 2,
  target: "any",
  use: (c) => c.target != null && hit(c, c.target, 1, "ping"),
});

// ---- tokens -----------------------------------------------------------------------------------------------

add({ id: "coin", name: "Spare Zatoshi", zh: "零钱", type: "spell", cost: 0, token: true, text: "Gain 1 ZEC this turn only.", textZh: "仅在本回合获得 1 个 ZEC。", play: (c) => gainMana(c.g, c.side, 1) });
add({ id: "n_sybil_t", name: "Sybil Clone", zh: "女巫分身", type: "minion", cost: 1, atk: 1, hp: 1, token: true, text: "", textZh: "" });
add({ id: "n_rat_t", name: "Mempool Pup", zh: "内存池幼鼠", type: "minion", cost: 1, atk: 1, hp: 1, token: true, text: "", textZh: "" });
faction = "transparent";
add({ id: "t_miner", name: "Hired Miner", zh: "雇佣矿工", type: "minion", cost: 2, atk: 2, hp: 2, tribe: "Miner", token: true, text: "", textZh: "" });
faction = "sapling";
add({ id: "s_seed", name: "Seedling", zh: "幼苗", type: "minion", cost: 1, atk: 1, hp: 1, tribe: "Plant", token: true, text: "", textZh: "" });
add({ id: "s_thorn", name: "Thornling", zh: "棘苗", type: "minion", cost: 1, atk: 1, hp: 2, tribe: "Plant", kw: KW.GUARD, token: true, text: "*Guard*", textZh: "*守卫*" });
add({ id: "s_sapling", name: "Sapling", zh: "树苗", type: "minion", cost: 2, atk: 2, hp: 2, tribe: "Plant", token: true, text: "", textZh: "" });
faction = "sprout";
add({ id: "p_shade", name: "Shade", zh: "暗影", type: "minion", cost: 1, atk: 1, hp: 1, tribe: "Ghost", token: true, text: "", textZh: "" });
add({ id: "p_shade2", name: "Old Shade", zh: "古老暗影", type: "minion", cost: 2, atk: 2, hp: 2, tribe: "Ghost", token: true, text: "", textZh: "" });

// ---- NEUTRAL -----------------------------------------------------------------------------------------------
faction = "neutral";

add({ id: "n_dust", name: "Dust Mote", zh: "粉尘微粒", type: "minion", cost: 1, atk: 1, hp: 1, kw: KW.DUST, text: "*Dust*", textZh: "*粉尘*", worth: 2 });
add({ id: "n_ping", name: "Ping Node", zh: "Ping 节点", type: "minion", cost: 1, atk: 1, hp: 1, tribe: "Node", target: "any", text: "*Mint:* Deal 1 damage.", textZh: "*铸造：*造成 1 点伤害。", play: (c) => c.target != null && hit(c, c.target, 1, "ping"), worth: 1.5 });
add({ id: "n_light", name: "Light Client", zh: "轻客户端", type: "minion", cost: 1, atk: 1, hp: 2, tribe: "Node", kw: KW.GUARD, rarity: "basic", text: "*Guard*", textZh: "*守卫*" });
add({ id: "n_squire", name: "Proof Squire", zh: "证明侍从", type: "minion", cost: 1, atk: 1, hp: 1, kw: KW.HALO, text: "*Halo*", textZh: "*光环*" });
add({ id: "n_kiddie", name: "Script Kiddie", zh: "脚本小子", type: "minion", cost: 1, atk: 2, hp: 1, tribe: "Bot", rarity: "basic", text: "", textZh: "" });
add({ id: "n_explorer", name: "Block Explorer", zh: "区块浏览器", type: "minion", cost: 2, atk: 1, hp: 1, tribe: "Node", rarity: "basic", text: "*Mint:* Draw a card.", textZh: "*铸造：*抽一张牌。", play: (c) => void draw(c.g, c.side), worth: 2.5 });
add({ id: "n_hound", name: "Hash Hound", zh: "哈希猎犬", type: "minion", cost: 2, atk: 3, hp: 2, tribe: "Bot", rarity: "basic", text: "", textZh: "" });
add({ id: "n_runner", name: "Node Runner", zh: "节点跑者", type: "minion", cost: 2, atk: 2, hp: 3, tribe: "Node", rarity: "basic", text: "", textZh: "" });
add({ id: "n_cold", name: "Cold Wallet", zh: "冷钱包", type: "minion", cost: 2, atk: 1, hp: 4, kw: KW.GUARD, text: "*Guard*", textZh: "*守卫*" });
add({ id: "n_relay", name: "Relay Runner", zh: "中继信使", type: "minion", cost: 2, atk: 2, hp: 1, kw: KW.CHARGE, text: "*Charge*", textZh: "*冲锋*" });
add({ id: "n_sybil", name: "Sybil", zh: "女巫", type: "minion", cost: 2, atk: 2, hp: 1, text: "*Mint:* Summon a 1/1 Sybil Clone.", textZh: "*铸造：*召唤一个 1/1 的女巫分身。", play: (c) => void summon(c.g, c.side, "n_sybil_t", c.pos + 1), worth: 2 });
add({ id: "n_rat", name: "Mempool Rat", zh: "内存池老鼠", type: "minion", cost: 2, atk: 2, hp: 1, text: "*Nullifier:* Summon a 1/1 Mempool Pup.", textZh: "*作废：*召唤一个 1/1 的内存池幼鼠。", death: (c) => void summon(c.g, c.side, "n_rat_t", c.pos), worth: 2 });
add({ id: "n_faucet", name: "Faucet", zh: "水龙头", type: "minion", cost: 2, atk: 2, hp: 2, text: "*Mint:* Restore 3 Health to your hero.", textZh: "*铸造：*为你的英雄恢复 3 点生命值。", play: (c) => heal(c.g, myHero(c), 3), worth: 1 });
add({ id: "n_turnstile", name: "Turnstile", zh: "旋转门", type: "minion", cost: 3, atk: 3, hp: 3, tribe: "Node", kw: KW.GUARD, rarity: "basic", text: "*Guard*", textZh: "*守卫*" });
add({ id: "n_validator", name: "Validator", zh: "验证者", type: "minion", cost: 3, atk: 3, hp: 4, tribe: "Node", rarity: "basic", text: "", textZh: "" });
add({ id: "n_courier", name: "Shielded Courier", zh: "屏蔽信使", type: "minion", cost: 3, atk: 4, hp: 2, kw: KW.SHIELDED, text: "*Shielded*", textZh: "*屏蔽*" });
add({ id: "n_double", name: "Double-spender", zh: "双花者", type: "minion", cost: 3, atk: 2, hp: 3, kw: KW.DOUBLE, text: "*Double-spend*", textZh: "*双花*" });
add({ id: "n_frontrunner", name: "Front-runner", zh: "抢跑者", type: "minion", cost: 3, atk: 3, hp: 2, tribe: "Bot", kw: KW.RUSH, text: "*Rush*", textZh: "*突袭*" });
add({
  id: "n_collector",
  name: "Dust Collector",
  zh: "粉尘收集者",
  type: "minion",
  cost: 3,
  atk: 2,
  hp: 3,
  rarity: "rare",
  text: "Whenever a minion dies, gain +1 Attack.",
  textZh: "每当一个随从死亡，获得 +1 攻击力。",
  onDeath: (c) => c.self && buff(c.g, c.self, 1, 0),
  worth: 2,
});
add({ id: "n_gossip", name: "Gossip Peer", zh: "八卦节点", type: "minion", cost: 3, atk: 2, hp: 2, tribe: "Node", rarity: "rare", text: "*Mint:* Discover a spell.", textZh: "*铸造：*发现一张法术牌。", play: (c) => discover(c.g, c.side, spellsOf(c.g.s[c.side].hero.faction)), worth: 3 });
add({ id: "n_rig", name: "Mining Rig", zh: "矿机", type: "minion", cost: 3, atk: 2, hp: 3, tribe: "Miner", rarity: "rare", text: "At the end of your turn, gain +1 Attack.", textZh: "在你的回合结束时，获得 +1 攻击力。", turnEnd: (c) => c.self && buff(c.g, c.self, 1, 0), worth: 2 });
add({ id: "n_hw", name: "Hardware Wallet", zh: "硬件钱包", type: "minion", cost: 4, atk: 3, hp: 5, kw: KW.GUARD, rarity: "basic", text: "*Guard*", textZh: "*守卫*" });
add({
  id: "n_analyst",
  name: "Chain Analyst",
  zh: "链上分析师",
  type: "minion",
  cost: 4,
  atk: 4,
  hp: 3,
  rarity: "rare",
  target: "minion",
  text: "*Mint:* *Redact* a minion.",
  textZh: "*铸造：**涂黑*一个随从。",
  play: (c) => {
    const m = c.target != null ? minion(c.g, c.target) : null;
    if (m) {
      fx(c.g, "redact", srcOf(c), [m.uid]);
      redact(c.g, m);
    }
  },
  worth: 2,
});
add({ id: "n_orphan", name: "Orphan Block", zh: "孤块", type: "minion", cost: 4, atk: 4, hp: 5, tribe: "Bot", rarity: "basic", text: "", textZh: "" });
add({ id: "n_notary", name: "Notary", zh: "公证人", type: "minion", cost: 4, atk: 3, hp: 3, tribe: "Node", kw: KW.GUARD | KW.HALO, rarity: "rare", text: "*Guard*. *Halo*", textZh: "*守卫*。*光环*" });
add({ id: "n_sandwich", name: "Sandwich Bot", zh: "三明治机器人", type: "minion", cost: 4, atk: 3, hp: 3, tribe: "Bot", rarity: "rare", text: "*Mint:* Deal 1 damage to all enemy minions.", textZh: "*铸造：*对所有敌方随从造成 1 点伤害。", play: (c) => hitAll(c, foes(c), 1), worth: 2.5 });
add({ id: "n_bridge", name: "Bridge Operator", zh: "跨链桥操作员", type: "minion", cost: 5, atk: 4, hp: 6, kw: KW.GUARD, text: "*Guard*", textZh: "*守卫*" });
add({ id: "n_prover", name: "Halo2 Prover", zh: "Halo2 证明者", type: "minion", cost: 5, atk: 4, hp: 4, tribe: "Node", prover: 1, rarity: "rare", text: "*Prover +1*. *Mint:* Draw a card.", textZh: "*证明 +1*。*铸造：*抽一张牌。", play: (c) => void draw(c.g, c.side), worth: 3 });
add({ id: "n_darkpool", name: "Dark Pool", zh: "暗池", type: "minion", cost: 5, atk: 5, hp: 5, kw: KW.SHIELDED, text: "*Shielded*", textZh: "*屏蔽*" });
add({ id: "n_liquidator", name: "Liquidator", zh: "清算人", type: "minion", cost: 5, atk: 4, hp: 3, target: "any", text: "*Mint:* Deal 3 damage.", textZh: "*铸造：*造成 3 点伤害。", play: (c) => c.target != null && hit(c, c.target, 3), worth: 3 });
add({ id: "n_whale", name: "Exchange Whale", zh: "交易所巨鲸", type: "minion", cost: 6, atk: 6, hp: 7, tribe: "Whale", rarity: "basic", text: "", textZh: "" });
add({
  id: "n_attacker",
  name: "51% Attacker",
  zh: "51% 攻击者",
  type: "minion",
  cost: 6,
  atk: 4,
  hp: 4,
  rarity: "epic",
  text: "*Mint:* Destroy a random enemy minion.",
  textZh: "*铸造：*随机消灭一个敌方随从。",
  play: (c) => {
    const m = pick(c.g, foes(c));
    if (m) {
      fx(c.g, "doom", srcOf(c), [m.uid]);
      destroy(c.g, m.uid);
    }
  },
  worth: 5,
});
add({ id: "n_archive", name: "Archive Node", zh: "归档节点", type: "minion", cost: 6, atk: 4, hp: 7, tribe: "Node", kw: KW.GUARD, rarity: "rare", text: "*Guard*. *Mint:* Gain 5 Armor.", textZh: "*守卫*。*铸造：*获得 5 点护甲。", play: (c) => armor(c.g, c.side, 5), worth: 2 });
add({ id: "n_megawhale", name: "Mega Whale", zh: "超级巨鲸", type: "minion", cost: 7, atk: 8, hp: 8, tribe: "Whale", text: "", textZh: "" });
add({
  id: "n_oracle",
  name: "Halving Oracle",
  zh: "减半神谕",
  type: "minion",
  cost: 6,
  atk: 4,
  hp: 5,
  rarity: "legendary",
  text: "*Mint:* Halve the Attack and Health of all other minions.",
  textZh: "*铸造：*所有其他随从的攻击力和生命值减半。",
  play: (c) => {
    const list = all(c).filter((m) => m !== c.self);
    fx(c.g, "halving", srcOf(c), list.map((m) => m.uid));
    for (const m of list) setStats(c.g, m, Math.ceil(m.atk / 2), Math.ceil(m.hp / 2));
  },
  worth: 4,
});
add({
  id: "n_keeper",
  name: "Turnstile Keeper",
  zh: "旋转门守护者",
  type: "minion",
  cost: 9,
  atk: 8,
  hp: 8,
  rarity: "legendary",
  target: "any",
  tf: isHeroT,
  text: "*Mint:* Set a hero's remaining Health to 15.",
  textZh: "*铸造：*将一个英雄的剩余生命值变为 15。",
  play: (c) => {
    if (c.target == null) return;
    fx(c.g, "turnstile", srcOf(c), [c.target]);
    setHeroHp(c.g, c.target === 1 ? 0 : 1, 15);
  },
  worth: 4,
});
add({
  id: "n_genesis",
  name: "Genesis Miner",
  zh: "创世矿工",
  type: "minion",
  cost: 5,
  atk: 4,
  hp: 5,
  tribe: "Miner",
  rarity: "legendary",
  text: "At the end of your turn, give another random friendly minion +1/+1.",
  textZh: "在你的回合结束时，随机使另一个友方随从获得 +1/+1。",
  turnEnd: (c) => {
    const m = pick(c.g, others(c));
    if (m) {
      fx(c.g, "buff", srcOf(c), [m.uid]);
      buff(c.g, m, 1, 1);
    }
  },
  worth: 3,
});
add({
  id: "n_apparition",
  name: "The Apparition",
  zh: "显灵者",
  type: "minion",
  cost: 20,
  atk: 8,
  hp: 8,
  tribe: "Ghost",
  kw: KW.HALO,
  rarity: "legendary",
  text: "*Halo*. Costs (1) less for each minion that died this game.",
  textZh: "*光环*。本局每有一个随从死亡，费用便减少 (1) 点。",
  costFn: (g) => Math.max(0, 20 - g.deaths),
  worth: 2,
});

// ---- TRANSPARENT ---------------------------------------------------------------------------------------------
faction = "transparent";

const miners = (c: Ctx) => others(c).filter((m) => tribe(m, "Miner"));
add({ id: "t_hotkey", name: "Hot Key", zh: "热密钥", type: "minion", cost: 1, atk: 1, hp: 1, kw: KW.CHARGE, text: "*Charge*. *Mint:* Deal 1 damage to the enemy hero.", textZh: "*冲锋*。*铸造：*对敌方英雄造成 1 点伤害。", play: (c) => hit(c, enemyHero(c), 1, "shot"), worth: 1 });
add({
  id: "t_pickaxe",
  name: "Pickaxe Miner",
  zh: "镐头矿工",
  type: "minion",
  cost: 1,
  atk: 2,
  hp: 1,
  tribe: "Miner",
  text: "*Mint:* If you control another Miner, gain +1/+1.",
  textZh: "*铸造：*如果你控制另一个矿工，获得 +1/+1。",
  play: (c) => c.self && miners(c).length > 0 && buff(c.g, c.self, 1, 1),
  worth: 1,
});
add({ id: "t_expose", name: "Exposé", zh: "曝光", type: "spell", cost: 1, rarity: "basic", target: "any", text: "Deal $2 damage.", textZh: "造成 $2 点伤害。", play: (c) => c.target != null && hit(c, c.target, sdmg(c, 2)) });
add({ id: "t_pick", name: "Mining Pick", zh: "矿镐", type: "weapon", cost: 2, atk: 2, dur: 2, rarity: "basic", text: "", textZh: "" });
add({
  id: "t_poolop",
  name: "Pool Operator",
  zh: "矿池运营者",
  type: "minion",
  cost: 2,
  atk: 2,
  hp: 2,
  tribe: "Miner",
  rarity: "rare",
  text: "Your other Miners have +1 Attack.",
  textZh: "你的其他矿工拥有 +1 攻击力。",
  aura: { n: 1, who: (_s, m) => tribe(m, "Miner") },
  worth: 2,
});
add({
  id: "t_frontrun",
  name: "Front-run",
  zh: "抢先交易",
  type: "spell",
  cost: 1,
  target: "friendlyMinion",
  text: "Give a friendly minion +2 Attack and *Charge*.",
  textZh: "使一个友方随从获得 +2 攻击力和*冲锋*。",
  play: (c) => {
    const m = c.target != null ? minion(c.g, c.target) : null;
    if (m) {
      fx(c.g, "buff", myHero(c), [m.uid]);
      buff(c.g, m, 2, 0, KW.CHARGE);
    }
  },
});
add({ id: "t_crew", name: "Mining Crew", zh: "挖矿小队", type: "minion", cost: 3, atk: 2, hp: 2, tribe: "Miner", text: "*Mint:* Summon a 2/2 Hired Miner.", textZh: "*铸造：*召唤一个 2/2 的雇佣矿工。", play: (c) => void summon(c.g, c.side, "t_miner", c.pos + 1), worth: 4 });
add({ id: "t_raider", name: "Rig Raider", zh: "矿场突袭者", type: "minion", cost: 3, atk: 3, hp: 2, tribe: "Miner", kw: KW.CHARGE, text: "*Charge*", textZh: "*冲锋*" });
add({ id: "t_hammer", name: "Hash Hammer", zh: "哈希重锤", type: "weapon", cost: 3, atk: 3, dur: 2, rarity: "basic", text: "", textZh: "" });
add({ id: "t_exploit", name: "Exploit", zh: "漏洞利用", type: "spell", cost: 3, target: "minion", text: "Deal $5 damage to a minion.", textZh: "对一个随从造成 $5 点伤害。", play: (c) => c.target != null && hit(c, c.target, sdmg(c, 5)) });
add({
  id: "t_boss",
  name: "Pool Boss",
  zh: "矿池老板",
  type: "minion",
  cost: 4,
  atk: 4,
  hp: 5,
  tribe: "Miner",
  rarity: "rare",
  text: "*Mint:* Give your other Miners +1/+1.",
  textZh: "*铸造：*使你的其他矿工获得 +1/+1。",
  play: (c) => {
    const list = miners(c);
    fx(c.g, "buff", srcOf(c), list.map((m) => m.uid));
    for (const m of list) buff(c.g, m, 1, 1);
  },
  worth: 2,
});
add({ id: "t_dumper", name: "Dumper", zh: "砸盘者", type: "minion", cost: 4, atk: 4, hp: 3, kw: KW.CHARGE, text: "*Charge*", textZh: "*冲锋*" });
add({ id: "t_storm", name: "Broadcast Storm", zh: "广播风暴", type: "spell", cost: 3, rarity: "rare", text: "Deal $2 damage to all enemy minions.", textZh: "对所有敌方随从造成 $2 点伤害。", play: (c) => hitAll(c, foes(c), sdmg(c, 2)) });
add({ id: "t_reward", name: "Block Reward", zh: "区块奖励", type: "spell", cost: 3, text: "Draw 2 cards.", textZh: "抽两张牌。", play: (c) => void draw(c.g, c.side, 2) });
add({
  id: "t_rugpull",
  name: "Rugpull",
  zh: "卷款跑路",
  type: "spell",
  cost: 6,
  rarity: "epic",
  text: "Deal $3 damage to all enemies.",
  textZh: "对所有敌人造成 $3 点伤害。",
  play: (c) => {
    const n = sdmg(c, 3);
    hitAll(c, foes(c), n);
    damage(c.g, enemyHero(c), n, 0);
  },
});
add({
  id: "t_leaker",
  name: "The Leaker",
  zh: "泄密者",
  type: "minion",
  cost: 5,
  atk: 6,
  hp: 2,
  kw: KW.CHARGE,
  rarity: "legendary",
  text: "*Charge*. *Mint:* Enemy minions lose *Shielded*.",
  textZh: "*冲锋*。*铸造：*敌方随从失去*屏蔽*。",
  play: (c) => {
    const list = foes(c).filter((m) => m.kw & KW.SHIELDED);
    fx(c.g, "reveal", srcOf(c), list.map((m) => m.uid));
    for (const m of list) {
      m.kw &= ~KW.SHIELDED;
      addKw(c.g, m, 0);
    }
  },
  worth: 1,
});
add({
  id: "t_kingpin",
  name: "Hashrate Kingpin",
  zh: "算力大亨",
  type: "minion",
  cost: 7,
  atk: 6,
  hp: 6,
  tribe: "Miner",
  rarity: "legendary",
  text: "*Mint:* Summon two 2/2 Hired Miners with *Charge*.",
  textZh: "*铸造：*召唤两个具有*冲锋*的 2/2 雇佣矿工。",
  play: (c) => {
    for (let i = 0; i < 2; i++) {
      const m = summon(c.g, c.side, "t_miner", c.pos + 1 + i);
      if (m) addKw(c.g, m, KW.CHARGE);
    }
  },
  worth: 6,
});

// ---- SAPLING ---------------------------------------------------------------------------------------------------
faction = "sapling";

const plants = (c: Ctx) => friends(c).filter((m) => tribe(m, "Plant"));
add({ id: "s_germ", name: "Germinator", zh: "萌芽者", type: "minion", cost: 1, atk: 1, hp: 1, tribe: "Plant", text: "*Mint:* Summon a 1/1 Seedling.", textZh: "*铸造：*召唤一个 1/1 的幼苗。", play: (c) => void summon(c.g, c.side, "s_seed", c.pos + 1), worth: 2 });
add({
  id: "s_rain",
  name: "Rain",
  zh: "春雨",
  type: "spell",
  cost: 1,
  text: "Give your Plants +1/+1.",
  textZh: "使你的植物获得 +1/+1。",
  can: (g, side) => g.s[side].board.some((m) => tribe(m, "Plant")),
  play: (c) => {
    const list = plants(c);
    fx(c.g, "buff", myHero(c), list.map((m) => m.uid));
    for (const m of list) buff(c.g, m, 1, 1);
  },
});
add({
  id: "s_root",
  name: "Root Down",
  zh: "扎根",
  type: "spell",
  cost: 1,
  rarity: "basic",
  target: "friendlyMinion",
  text: "Give a friendly minion +1/+2 and *Guard*.",
  textZh: "使一个友方随从获得 +1/+2 和*守卫*。",
  play: (c) => {
    const m = c.target != null ? minion(c.g, c.target) : null;
    if (m) {
      fx(c.g, "buff", myHero(c), [m.uid]);
      buff(c.g, m, 1, 2, KW.GUARD);
    }
  },
});
add({
  id: "s_warden",
  name: "Grove Warden",
  zh: "林地守望者",
  type: "minion",
  cost: 2,
  atk: 1,
  hp: 2,
  tribe: "Plant",
  rarity: "rare",
  text: "Whenever you summon a Plant, give it +1/+1.",
  textZh: "每当你召唤一个植物，使其获得 +1/+1。",
  onSummon: (c) => c.other && tribe(c.other, "Plant") && buff(c.g, c.other, 1, 1),
  worth: 2.5,
});
add({
  id: "s_hedge",
  name: "Hedgerow",
  zh: "树篱",
  type: "spell",
  cost: 2,
  text: "Summon two 1/2 Thornlings with *Guard*.",
  textZh: "召唤两个具有*守卫*的 1/2 棘苗。",
  can: (g, side) => g.s[side].board.length < 7,
  play: (c) => {
    summon(c.g, c.side, "s_thorn");
    summon(c.g, c.side, "s_thorn");
  },
});
add({
  id: "s_thorns",
  name: "Thorn Volley",
  zh: "荆棘齐射",
  type: "spell",
  cost: 2,
  rarity: "basic",
  target: "minion",
  text: "Deal $2 damage to a minion. Summon a 1/1 Seedling.",
  textZh: "对一个随从造成 $2 点伤害。召唤一个 1/1 的幼苗。",
  play: (c) => {
    if (c.target != null) hit(c, c.target, sdmg(c, 2), "thorns");
    summon(c.g, c.side, "s_seed");
  },
});
add({ id: "s_oak", name: "Old Oak", zh: "老橡树", type: "minion", cost: 3, atk: 2, hp: 5, tribe: "Plant", kw: KW.GUARD, rarity: "basic", text: "*Guard*", textZh: "*守卫*" });
add({
  id: "s_pollen",
  name: "Pollinator",
  zh: "传粉者",
  type: "minion",
  cost: 3,
  atk: 2,
  hp: 3,
  tribe: "Plant",
  text: "*Nullifier:* Summon two 1/1 Seedlings.",
  textZh: "*作废：*召唤两个 1/1 的幼苗。",
  death: (c) => {
    summon(c.g, c.side, "s_seed", c.pos);
    summon(c.g, c.side, "s_seed", c.pos);
  },
  worth: 2.5,
});
add({
  id: "s_swarm",
  name: "Swarm",
  zh: "蜂拥",
  type: "spell",
  cost: 3,
  target: "enemyMinion",
  text: "Deal $1 damage to an enemy minion for each minion you control.",
  textZh: "你每控制一个随从，便对一个敌方随从造成 $1 点伤害。",
  play: (c) => c.target != null && hit(c, c.target, sdmg(c, friends(c).length) - 0, "thorns"),
});
add({
  id: "s_bloom",
  name: "Bloom",
  zh: "绽放",
  type: "spell",
  cost: 3,
  text: "Give your minions +1/+1.",
  textZh: "使你的随从获得 +1/+1。",
  can: (g, side) => g.s[side].board.length > 0,
  play: (c) => {
    const list = friends(c);
    fx(c.g, "buff", myHero(c), list.map((m) => m.uid));
    for (const m of list) buff(c.g, m, 1, 1);
  },
});
add({
  id: "s_gardener",
  name: "Gardener",
  zh: "园丁",
  type: "minion",
  cost: 4,
  atk: 2,
  hp: 3,
  rarity: "rare",
  text: "*Mint:* Give your other minions +1/+1.",
  textZh: "*铸造：*使你的其他随从获得 +1/+1。",
  play: (c) => {
    const list = others(c);
    fx(c.g, "buff", srcOf(c), list.map((m) => m.uid));
    for (const m of list) buff(c.g, m, 1, 1);
  },
  worth: 2,
});
add({ id: "s_vault", name: "Seed Vault", zh: "种子库", type: "minion", cost: 4, atk: 1, hp: 5, rarity: "rare", text: "At the end of your turn, summon a 1/1 Seedling.", textZh: "在你的回合结束时，召唤一个 1/1 的幼苗。", turnEnd: (c) => void summon(c.g, c.side, "s_seed", c.pos + 1), worth: 4 });
add({
  id: "s_overgrowth",
  name: "Overgrowth",
  zh: "疯长",
  type: "spell",
  cost: 5,
  text: "Summon three 2/2 Saplings.",
  textZh: "召唤三个 2/2 的树苗。",
  can: (g, side) => g.s[side].board.length < 7,
  play: (c) => {
    for (let i = 0; i < 3; i++) summon(c.g, c.side, "s_sapling");
  },
});
add({
  id: "s_canopy",
  name: "Canopy Giant",
  zh: "树冠巨人",
  type: "minion",
  cost: 10,
  atk: 7,
  hp: 7,
  tribe: "Plant",
  rarity: "epic",
  text: "Costs (1) less for each minion on the board.",
  textZh: "场上每有一个随从，费用便减少 (1) 点。",
  costFn: (g) => Math.max(0, 10 - g.s[0].board.length - g.s[1].board.length),
});
add({
  id: "s_spirit",
  name: "Forest Spirit",
  zh: "森林之灵",
  type: "minion",
  cost: 4,
  atk: 3,
  hp: 3,
  rarity: "epic",
  text: "Whenever another friendly minion dies, summon a 1/1 Seedling.",
  textZh: "每当另一个友方随从死亡，召唤一个 1/1 的幼苗。",
  onDeath: (c) => c.other && c.other.side === c.side && c.other !== c.self && void summon(c.g, c.side, "s_seed"),
  worth: 3,
});
add({
  id: "s_elder",
  name: "Elder Sapling",
  zh: "长老树苗",
  type: "minion",
  cost: 7,
  atk: 6,
  hp: 6,
  tribe: "Plant",
  rarity: "legendary",
  text: "*Mint:* Fill your board with 1/1 Seedlings.",
  textZh: "*铸造：*用 1/1 的幼苗填满你的战场。",
  play: (c) => {
    while (c.g.s[c.side].board.length < 7) if (!summon(c.g, c.side, "s_seed")) break;
  },
  worth: 4,
});
add({
  id: "s_mother",
  name: "The Mother Tree",
  zh: "母树",
  type: "minion",
  cost: 6,
  atk: 4,
  hp: 5,
  tribe: "Plant",
  rarity: "legendary",
  text: "At the end of your turn, give your other minions +1/+1.",
  textZh: "在你的回合结束时，使你的其他随从获得 +1/+1。",
  turnEnd: (c) => {
    const list = others(c);
    fx(c.g, "buff", srcOf(c), list.map((m) => m.uid));
    for (const m of list) buff(c.g, m, 1, 1);
  },
  worth: 5,
});

// ---- SPROUT -------------------------------------------------------------------------------------------------------
faction = "sprout";

add({ id: "p_note", name: "Legacy Note", zh: "遗留票据", type: "minion", cost: 1, atk: 1, hp: 1, tribe: "Ghost", text: "*Nullifier:* Draw a card.", textZh: "*作废：*抽一张牌。", death: (c) => void draw(c.g, c.side), worth: 2 });
add({
  id: "p_spend",
  name: "Spend",
  zh: "花费",
  type: "spell",
  cost: 1,
  target: "friendlyMinion",
  text: "Destroy a friendly minion. Draw a card.",
  textZh: "消灭一个友方随从。抽一张牌。",
  play: (c) => {
    if (c.target != null) {
      fx(c.g, "doom", myHero(c), [c.target]);
      destroy(c.g, c.target);
    }
    draw(c.g, c.side);
  },
});
add({
  id: "p_drain",
  name: "Life Drain",
  zh: "生命吸取",
  type: "spell",
  cost: 2,
  rarity: "basic",
  target: "any",
  text: "Deal $2 damage. Restore 2 Health to your hero.",
  textZh: "造成 $2 点伤害。为你的英雄恢复 2 点生命值。",
  play: (c) => {
    if (c.target != null) hit(c, c.target, sdmg(c, 2), "drain");
    heal(c.g, myHero(c), 2);
  },
});
add({ id: "p_shade_m", name: "Unspent Shade", zh: "未花之影", type: "minion", cost: 2, atk: 1, hp: 3, tribe: "Ghost", kw: KW.GUARD, text: "*Guard*. *Nullifier:* Deal 1 damage to all minions.", textZh: "*守卫*。*作废：*对所有随从造成 1 点伤害。", death: (c) => hitAll(c, all(c), 1), worth: 1.5 });
add({ id: "p_depr", name: "Deprecated Node", zh: "弃用节点", type: "minion", cost: 2, atk: 2, hp: 2, tribe: "Ghost", rarity: "basic", text: "*Nullifier:* Summon a 1/1 Shade.", textZh: "*作废：*召唤一个 1/1 的暗影。", death: (c) => void summon(c.g, c.side, "p_shade", c.pos), worth: 2 });
add({ id: "p_soul", name: "Soul Miner", zh: "灵魂矿工", type: "minion", cost: 3, atk: 3, hp: 3, tribe: "Miner", kw: KW.DRAIN, text: "*Drain*", textZh: "*吸取*" });
add({
  id: "p_exhume",
  name: "Exhume",
  zh: "掘墓",
  type: "spell",
  cost: 3,
  rarity: "rare",
  text: "Summon a random friendly minion that died this game.",
  textZh: "随机召唤一个本局死亡的友方随从。",
  can: (g, side) => g.s[side].dead.length > 0 && g.s[side].board.length < 7,
  play: (c) => {
    const id = deadOne(c);
    if (id) summon(c.g, c.side, id);
  },
});
add({
  id: "p_keeper",
  name: "Gravekeeper",
  zh: "守墓人",
  type: "minion",
  cost: 4,
  atk: 3,
  hp: 3,
  rarity: "rare",
  text: "Whenever another friendly minion dies, draw a card.",
  textZh: "每当另一个友方随从死亡，抽一张牌。",
  onDeath: (c) => c.other && c.other.side === c.side && c.other !== c.self && void draw(c.g, c.side),
  worth: 4,
});
add({ id: "p_revenant", name: "Revenant", zh: "亡魂", type: "minion", cost: 4, atk: 4, hp: 3, tribe: "Ghost", kw: KW.REORG, text: "*Reorg*", textZh: "*重组*" });
add({ id: "p_purge", name: "The Purge", zh: "大清洗", type: "spell", cost: 4, rarity: "rare", text: "Deal $2 damage to all minions.", textZh: "对所有随从造成 $2 点伤害。", play: (c) => hitAll(c, all(c), sdmg(c, 2), "purge") });
add({ id: "p_crypt", name: "Crypt Guard", zh: "墓穴守卫", type: "minion", cost: 5, atk: 3, hp: 6, tribe: "Ghost", kw: KW.GUARD, text: "*Guard*. *Nullifier:* Summon a 2/2 Old Shade.", textZh: "*守卫*。*作废：*召唤一个 2/2 的古老暗影。", death: (c) => void summon(c.g, c.side, "p_shade2", c.pos), worth: 2.5 });
add({
  id: "p_final",
  name: "Final Spend",
  zh: "最终花费",
  type: "spell",
  cost: 5,
  rarity: "basic",
  target: "enemyMinion",
  text: "Destroy an enemy minion.",
  textZh: "消灭一个敌方随从。",
  play: (c) => {
    if (c.target == null) return;
    fx(c.g, "doom", myHero(c), [c.target]);
    destroy(c.g, c.target);
  },
});
add({
  id: "p_shift",
  name: "Graveyard Shift",
  zh: "墓地夜班",
  type: "spell",
  cost: 6,
  rarity: "epic",
  text: "Summon 3 random friendly minions that died this game.",
  textZh: "随机召唤三个本局死亡的友方随从。",
  can: (g, side) => g.s[side].dead.length > 0 && g.s[side].board.length < 7,
  play: (c) => {
    for (let i = 0; i < 3; i++) {
      const id = deadOne(c);
      if (id) summon(c.g, c.side, id);
    }
  },
});
add({
  id: "p_eater",
  name: "Corpse Eater",
  zh: "食尸者",
  type: "minion",
  cost: 3,
  atk: 2,
  hp: 2,
  tribe: "Ghost",
  rarity: "rare",
  target: "otherFriendlyMinion",
  text: "*Mint:* Destroy another friendly minion and gain its Attack and Health.",
  textZh: "*铸造：*消灭另一个友方随从，并获得其攻击力和生命值。",
  play: (c) => {
    const m = c.target != null ? minion(c.g, c.target) : null;
    if (!m || !c.self) return;
    fx(c.g, "doom", c.self.uid, [m.uid]);
    destroy(c.g, m.uid);
    buff(c.g, c.self, atkOf(m), Math.max(0, m.hp));
  },
  worth: 1,
});
add({ id: "p_banker", name: "Grave Banker", zh: "墓地银行家", type: "minion", cost: 4, atk: 3, hp: 4, rarity: "legendary", doubleDeath: true, text: "Your *Nullifiers* go off twice.", textZh: "你的*作废*效果触发两次。", worth: 3 });
add({
  id: "p_lich",
  name: "Old Pool Lich",
  zh: "旧池巫妖",
  type: "minion",
  cost: 7,
  atk: 5,
  hp: 6,
  tribe: "Ghost",
  rarity: "legendary",
  text: "*Mint:* Summon 2 random friendly minions that died this game.",
  textZh: "*铸造：*随机召唤两个本局死亡的友方随从。",
  play: (c) => {
    for (let i = 0; i < 2; i++) {
      const id = deadOne(c);
      if (id) summon(c.g, c.side, id, c.pos + 1);
    }
  },
  worth: 6,
});

// ---- ORCHARD ---------------------------------------------------------------------------------------------------------
faction = "orchard";

add({ id: "o_wyrm", name: "Halo Wyrm", zh: "光环幼龙", type: "minion", cost: 1, atk: 1, hp: 3, text: "Whenever you cast a spell, gain +1 Attack.", textZh: "每当你施放一个法术，获得 +1 攻击力。", onSpell: (c) => c.self && buff(c.g, c.self, 1, 0), worth: 1.5 });
add({ id: "o_spark", name: "Spark Prover", zh: "火花证明者", type: "minion", cost: 2, atk: 2, hp: 2, tribe: "Node", prover: 1, text: "*Prover +1*", textZh: "*证明 +1*", worth: 1 });
add({
  id: "o_prove",
  name: "Prove",
  zh: "证明",
  type: "spell",
  cost: 1,
  target: "minion",
  text: "Give a minion *Halo*. Draw a card.",
  textZh: "使一个随从获得*光环*。抽一张牌。",
  play: (c) => {
    const m = c.target != null ? minion(c.g, c.target) : null;
    if (m) {
      fx(c.g, "halo", myHero(c), [m.uid]);
      addKw(c.g, m, KW.HALO);
    }
    draw(c.g, c.side);
  },
});
add({
  id: "o_shield",
  name: "Shield",
  zh: "屏蔽",
  type: "spell",
  cost: 1,
  target: "friendlyMinion",
  text: "Give a friendly minion +1/+1 and *Shielded*.",
  textZh: "使一个友方随从获得 +1/+1 和*屏蔽*。",
  play: (c) => {
    const m = c.target != null ? minion(c.g, c.target) : null;
    if (m) {
      fx(c.g, "shield", myHero(c), [m.uid]);
      buff(c.g, m, 1, 1, KW.SHIELDED);
    }
  },
});
add({
  id: "o_frost",
  name: "Vesta Frost",
  zh: "Vesta 冰冻",
  type: "spell",
  cost: 2,
  rarity: "basic",
  target: "any",
  text: "Deal $3 damage to a character and *Timelock* it.",
  textZh: "对一个角色造成 $3 点伤害，并使其*时间锁定*。",
  play: (c) => {
    if (c.target == null) return;
    hit(c, c.target, sdmg(c, 3), "frost");
    freeze(c.g, c.target);
  },
});
add({
  id: "o_counter",
  name: "Counterproof",
  zh: "反证",
  type: "secret",
  cost: 2,
  rarity: "rare",
  secret: "spell",
  text: "*Secret:* When your opponent casts a spell, counter it.",
  textZh: "*奥秘：*当你的对手施放一个法术时，反制该法术。",
  fire: (_c, i) => ((i.counter = true), true),
});
add({
  id: "o_snare",
  name: "Nullifier Snare",
  zh: "作废陷阱",
  type: "secret",
  cost: 2,
  secret: "minion",
  text: "*Secret:* After your opponent plays a minion, deal $4 damage to it.",
  textZh: "*奥秘：*在你的对手使用一个随从后，对其造成 $4 点伤害。",
  fire: (c, i) => {
    if (!i.m || !alive(i.m)) return false;
    fx(c.g, "snare", HERO_UID[c.side], [i.m.uid]);
    damage(c.g, i.m.uid, sdmg(c, 4), 0);
    return true;
  },
});
add({
  id: "o_trap",
  name: "Viewing Key Trap",
  zh: "查看密钥陷阱",
  type: "secret",
  cost: 2,
  rarity: "rare",
  secret: "attack",
  text: "*Secret:* When an enemy minion attacks, return it to its owner's hand. It costs (2) more.",
  textZh: "*奥秘：*当一个敌方随从攻击时，将其移回拥有者的手牌，其费用增加 (2) 点。",
  fire: (c, i) => {
    if (i.attacker == null || isHero(i.attacker)) return false;
    fx(c.g, "trap", HERO_UID[c.side], [i.attacker]);
    bounce(c.g, i.attacker, 2);
    i.cancel = true;
    return true;
  },
});
add({
  id: "o_ward",
  name: "Reorg Ward",
  zh: "重组结界",
  type: "secret",
  cost: 2,
  secret: "death",
  text: "*Secret:* When a friendly minion dies, return it to life with 1 Health.",
  textZh: "*奥秘：*当一个友方随从死亡时，使其回到战场，并具有 1 点生命值。",
  fire: (c, i) => {
    if (!i.m || c.g.s[c.side].board.length >= 7) return false;
    const m = summon(c.g, c.side, i.m.id);
    if (m) {
      m.hp = 1;
      addKw(c.g, m, 0);
    }
    return true;
  },
});
add({ id: "o_recursion", name: "Recursion", zh: "递归", type: "spell", cost: 3, rarity: "basic", text: "Draw 2 cards.", textZh: "抽两张牌。", play: (c) => void draw(c.g, c.side, 2) });
add({
  id: "o_timelock",
  name: "Time Lock",
  zh: "时间锁",
  type: "spell",
  cost: 3,
  text: "Deal $1 damage to all enemy minions and *Timelock* them.",
  textZh: "对所有敌方随从造成 $1 点伤害，并使其*时间锁定*。",
  play: (c) => {
    const list = foes(c);
    fx(c.g, "frostnova", myHero(c), list.map((m) => m.uid));
    const n = sdmg(c, 1);
    for (const m of list) {
      damage(c.g, m.uid, n, 0);
      freeze(c.g, m.uid);
    }
  },
});
add({ id: "o_pallas", name: "Pallas Blast", zh: "Pallas 冲击", type: "spell", cost: 4, rarity: "basic", target: "any", text: "Deal $6 damage.", textZh: "造成 $6 点伤害。", play: (c) => c.target != null && hit(c, c.target, sdmg(c, 6), "blast") });
add({ id: "o_sentinel", name: "Orchard Sentinel", zh: "果园哨兵", type: "minion", cost: 5, atk: 4, hp: 5, tribe: "Node", kw: KW.GUARD | KW.HALO, text: "*Guard*. *Halo*", textZh: "*守卫*。*光环*" });
add({ id: "o_archivist", name: "Proof Archivist", zh: "证明档案员", type: "minion", cost: 3, atk: 3, hp: 3, rarity: "rare", spellDiscount: 1, text: "Your spells cost (1) less.", textZh: "你的法术费用减少 (1) 点。", worth: 2 });
add({ id: "o_storm", name: "Halo Storm", zh: "光环风暴", type: "spell", cost: 7, rarity: "rare", text: "Deal $4 damage to all enemy minions.", textZh: "对所有敌方随从造成 $4 点伤害。", play: (c) => hitAll(c, foes(c), sdmg(c, 4), "storm") });
add({
  id: "o_pool",
  name: "The Shielded Pool",
  zh: "屏蔽池",
  type: "minion",
  cost: 6,
  atk: 5,
  hp: 5,
  kw: KW.ELUSIVE,
  rarity: "legendary",
  text: "*Private*. *Mint:* Give your other minions *Shielded*.",
  textZh: "*隐私*。*铸造：*使你的其他随从获得*屏蔽*。",
  play: (c) => {
    const list = others(c);
    fx(c.g, "shield", srcOf(c), list.map((m) => m.uid));
    for (const m of list) addKw(c.g, m, KW.SHIELDED);
  },
  worth: 4,
});
add({
  id: "o_recursor",
  name: "The Recursor",
  zh: "递归者",
  type: "minion",
  cost: 7,
  atk: 5,
  hp: 7,
  rarity: "legendary",
  text: "At the end of your turn, add a random Orchard spell to your hand.",
  textZh: "在你的回合结束时，随机将一张果园法术牌置入你的手牌。",
  turnEnd: (c) => {
    const pool = [...CARDS.values()].filter((d) => d.faction === "orchard" && d.type === "spell" && !d.token).map((d) => d.id);
    const id = pool[Math.floor(rnd(c.g) * pool.length)];
    if (id) give(c.g, c.side, id);
  },
  worth: 5,
});

// (kept for the effects above that read the deck)
void drawWhere;
void equip;
void foe;

/** Every card a deck may hold. */
export const COLLECTIBLE = [...CARDS.values()].filter((d) => !d.token);
export const FACTIONS: Exclude<Faction, "neutral">[] = ["transparent", "sapling", "sprout", "orchard"];
export const FACTION_INFO: Record<Faction, { name: string; zh: string; color: string; ink: string; tag: string; tagZh: string }> = {
  transparent: { name: "Transparent", zh: "透明池", color: "#ff6b35", ink: "#ffd2b8", tag: "Out in the open: fast, loud, straight at the hero.", tagZh: "公开透明：快速、响亮、直取英雄。" },
  sapling: { name: "Sapling", zh: "Sapling 池", color: "#6dbf8a", ink: "#cdeed8", tag: "The pool that grew: many small Plants, then all of them bigger.", tagZh: "成长之池：许多小植物，然后全都变大。" },
  sprout: { name: "Sprout", zh: "Sprout 池", color: "#b48ad8", ink: "#e6d6f4", tag: "The first pool, deprecated, never quite gone: Nullifiers and the dead brought back.", tagZh: "最初的池，已弃用却从未消失：作废与亡者归来。" },
  orchard: { name: "Orchard", zh: "Orchard 池", color: "#f4b728", ink: "#fbe6b0", tag: "Shielded, Halo 2: secrets, Timelocks and spells.", tagZh: "屏蔽、Halo 2：奥秘、时间锁与法术。" },
  neutral: { name: "Neutral", zh: "中立", color: "#a8a4a0", ink: "#e8e6e0", tag: "", tagZh: "" },
};
