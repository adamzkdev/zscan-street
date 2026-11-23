/**
 * ZK LEGENDS: the 10,000 zkSNARKs, each one a card. Generated (never stored) from the collection's
 * own data (public/legends/snarks.bin: rank and traits, from ZScan's map of the collection):
 *  - RARITY from the rank: the 26 Apparitions and ranks 1–100 are legendary, 101–1,000 epic,
 *    1,001–3,500 rare, the rest common. The 676 snarks purged to raise the Apparitions are Ghosts.
 *  - POWER from the rank too: every card gets the vanilla budget (2 × cost + 1 stat points), and the
 *    rarer it is the more on top (a tier's bonus, plus up to +3 more by how high its rank is). The
 *    rarest are, by construction, the strongest for their cost.
 *  - FACTION from the skin (warm: Transparent; green and blossom: Sapling; grey, bone and violet:
 *    Sprout; blue, ice and cosmic: Orchard; earth and metal: neutral), TRIBE from the head (Miner,
 *    Node, Whale…), ABILITIES from the eyes (Shielded eyes: Shielded; Frost: Timelock; Halogen: Halo;
 *    404: Dust…), then the head and lineage for the rarer ones. Each ability costs stat points
 *    out of the budget, so stats and text always add up to the card's worth.
 *  - The NAME from eyes and head ("Frost Captain"), the number on its plate (#4071).
 * Card ids are "z<id>" (z1 … z10000); a deck holds one of each (every zkSNARK is unique).
 */
import {
  CARDS,
  KW,
  HERO_UID,
  alive,
  armor,
  buff,
  card,
  damage,
  destroy,
  draw,
  foe,
  freeze,
  fx,
  heal,
  minion,
  pick,
  redact,
  summon,
  type CardDef,
  type Ctx,
  type Faction,
  type Minion,
  type Rarity,
  type Tribe,
} from "./engine";
import { ACCESSORY, EYES, HEAD, LINEAGE, SKIN } from "./snarktraits";

export const SNARKS = 10_000;

// ---- the data ------------------------------------------------------------------------------------------

let data: Uint8Array | null = null;
let loading: Promise<void> | null = null;

/** Hand the data over directly (the bench reads the file itself). */
export function setSnarkData(buf: ArrayBuffer | Uint8Array) {
  data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}
/** Load public/legends/snarks.bin once (70 KB). */
export function loadSnarks(): Promise<void> {
  if (data) return Promise.resolve();
  loading ??= (async () => {
    for (let k = 0; k < 4; k++) {
      try {
        const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
        const r = await fetch(`${base}legends/snarks.bin`);
        if (r.ok) return setSnarkData(await r.arrayBuffer());
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 800 * 2 ** k));
    }
    loading = null;
    throw new Error("zkSNARK data unavailable");
  })();
  return loading;
}
export const snarksReady = () => !!data;

export interface SnarkInfo {
  id: number;
  /** 1 = the rarest; 0 for the purged. */
  rank: number;
  purged: boolean;
  apparition: boolean;
  tier: Rarity;
  /** 0 … 1, how rare (1: rank 1). */
  power: number;
  traits: { Accessory: string; Eyes: string; Head: string; Lineage: string; Skin: string };
  faction: Faction;
  tribe?: Tribe;
}

const SKIN_FACTION: Record<string, Faction> = {};
for (const s of ["Infrared", "Blaze", "Solar", "Ember", "Yellow", "Hot Pink", "Hazard", "Molten", "Crimson", "Rust", "Tangerine", "Magenta"]) SKIN_FACTION[s] = "transparent";
for (const s of ["Moss", "Green", "Lime", "Acid", "Patina", "Sage", "Emerald", "Phosphor", "Rose", "Blush", "Dusty Rose"]) SKIN_FACTION[s] = "sapling";
for (const s of ["Grey", "Zombie", "Corrosive", "Bone", "Graphite", "Redacted", "Carbon", "Lilac", "Violet", "Ultraviolet"]) SKIN_FACTION[s] = "sprout";
for (const s of ["Cobalt", "Blue", "Cyan", "Ethereal", "Glacier", "Frost", "Cosmic", "Signal", "Aura", "Mirage", "Nullstate", "Venom", "SMPTE", "Alien"]) SKIN_FACTION[s] = "orchard";

function tribeOf(head: string, lineage: string, faction: Faction, purged: boolean): Tribe | undefined {
  if (purged || lineage === "Zombie" || lineage === "Skele" || lineage === "Apparition" || lineage === "Spectral") return "Ghost";
  if (head.startsWith("Miner")) return "Miner";
  if (head.startsWith("Node")) return "Node";
  if (head.startsWith("Maxi")) return "Whale";
  if (head.startsWith("Courier") || head === "Drift" || head === "Recon" || lineage === "Grid" || lineage === "Glitch") return "Bot";
  if (faction === "sapling" && (lineage === "Vibrant" || lineage === "Dune")) return "Plant";
  return undefined;
}

export function snarkInfo(id: number): SnarkInfo {
  if (!data) throw new Error("zkSNARK data not loaded");
  const o = (id - 1) * 7;
  const rank = data[o] | (data[o + 1] << 8);
  const traits = { Accessory: ACCESSORY[data[o + 2]], Eyes: EYES[data[o + 3]], Head: HEAD[data[o + 4]], Lineage: LINEAGE[data[o + 5]], Skin: SKIN[data[o + 6]] };
  const purged = rank === 0;
  const apparition = traits.Lineage === "Apparition";
  const tier: Rarity = apparition || (rank > 0 && rank <= 100) ? "legendary" : rank > 0 && rank <= 1000 ? "epic" : purged || rank <= 3500 ? "rare" : "common";
  const power = purged ? 0.35 : apparition ? 1 : Math.max(0, 1 - Math.log(rank) / Math.log(9324));
  const faction: Faction = purged ? "sprout" : apparition ? "neutral" : (SKIN_FACTION[traits.Skin] ?? "neutral");
  return { id, rank, purged, apparition, tier, power, traits, faction, tribe: tribeOf(traits.Head, traits.Lineage, faction, purged) };
}

export const snarkCardId = (id: number) => `z${id}`;
export const isSnarkCard = (cid: string) => /^z\d+$/.test(cid);
export const snarkIdOf = (cid: string) => Number(cid.slice(1));

// ---- abilities ---------------------------------------------------------------------------------------------

/** A seeded little generator per zkSNARK. */
function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type AbilityKey =
  | "guard"
  | "rush"
  | "charge"
  | "halo"
  | "shielded"
  | "double"
  | "dust"
  | "drain"
  | "reorg"
  | "private"
  | "dmg"
  | "aoe"
  | "heal"
  | "draw"
  | "buff"
  | "token"
  | "armor"
  | "freeze"
  | "destroy"
  | "redact"
  | "death_draw"
  | "death_dmg"
  | "death_token"
  | "end_grow"
  | "end_ping"
  | "end_heal"
  | "aura"
  | "prover"
  | "spellgrow";

/** What each eye gives. */
const EYE_ABILITY: Record<string, AbilityKey> = {
  "3D": "double", "404": "dust", Beacon: "halo", Blackout: "shielded", Charcoal: "guard", "Charcoal Amber": "death_draw", "Charcoal Blue": "armor", "Charcoal Green": "death_token",
  "Charcoal Purple": "reorg", "Charcoal Red": "drain", Chevron: "rush", "Cobalt Gaze": "freeze", "Cobalt Wander": "draw", Crimson: "charge", Deadlink: "dust", Distracted: "death_dmg",
  Focus: "dmg", "Focus Graphite": "dmg", Frieza: "freeze", Frost: "freeze", Gilt: "halo", Halogen: "halo", Jade: "heal", Jester: "double", "Mono Green": "end_heal", "Mono RGB": "double",
  Mosaic: "token", Nouns: "aura", Nyro: "end_grow", Optic: "draw", Overlord: "aoe", "Perfect Dark": "shielded", Phosphor: "prover", Ping: "dmg", Polar: "freeze", Pulse: "end_ping",
  Redline: "charge", "Rim Bone": "death_dmg", "Rim Cobalt": "guard", "Rim Graphite": "guard", "Rim Ruby": "rush", "Rim Verdigris": "death_token", Ruby: "drain", "Scanline Amber": "prover",
  "Scanline Green": "spellgrow", "Scanline Ice": "freeze", Shielded: "shielded", "Signal Error": "dust", Sodium: "end_grow", Terminal: "redact", Tinted: "private", Ultraviolet: "end_ping",
  "Vanta Rei": "private", Volt: "dmg", "Z-frame": "destroy", "Zero Dark": "shielded",
};
/** What the head adds (rarer cards). */
const HEAD_ABILITY: Record<string, AbilityKey> = {
  Ascension: "halo", Cinder: "dmg", Courier: "rush", "Courier Red": "charge", Drift: "rush", Halo: "halo", Hoodie: "shielded", Luma: "heal", "Miner": "buff", "Miner Graphite": "buff",
  Node: "guard", "Node Bone": "death_token", "Node Captain": "guard", "Node White": "guard", "Node ZK": "prover", Nyx: "death_token", Recon: "draw", "Saint Zero": "halo", Tenrai: "double",
  "Wrap Blue": "armor", "Wrap Hot Pink": "rush", "Wrap Orange": "armor", Zhalo: "halo",
};
/** And the lineage (legendaries' third). */
const LINEAGE_ABILITY: Record<string, AbilityKey> = {
  Zombie: "reorg", Skele: "death_dmg", Spectral: "shielded", "Zero-Knowledge": "prover", Glitch: "redact", Alien: "double", Relic: "death_draw", Corrupted: "dust", Thermal: "dmg", Flare: "charge",
  Noir: "private", Obsidian: "guard", Nullstate: "freeze", Signal: "draw", Grid: "end_ping", Gemini: "token", Vibrant: "end_grow", Dune: "armor", Noise: "aoe", "0dB": "shielded", Bare: "buff", Apparition: "end_grow",
};

interface Built {
  kw: number;
  /** Stat points it costs: fixed, and per point of Attack. */
  fixed: number;
  perAtk: number;
  text: [string, string];
  apply?: (d: CardDef) => void;
}

const ECHO = (n: number) => `zecho${Math.max(1, Math.min(6, n))}`;

/** One ability, sized by N (its number: damage, stats, …). */
function build(key: AbilityKey, N: number): Built {
  const B = (kw: number, fixed: number, perAtk: number, text: [string, string], apply?: Built["apply"]): Built => ({ kw, fixed, perAtk, text, apply });
  switch (key) {
    case "guard":
      return B(KW.GUARD, 0.6, 0, ["*Guard*", "*守卫*"]);
    case "rush":
      return B(KW.RUSH, 0.6, 0.15, ["*Rush*", "*突袭*"]);
    case "charge":
      return B(KW.CHARGE, 0.8, 0.5, ["*Charge*", "*冲锋*"]);
    case "halo":
      return B(KW.HALO, 0.8, 0.35, ["*Halo*", "*光环*"]);
    case "shielded":
      return B(KW.SHIELDED, 1, 0.1, ["*Shielded*", "*屏蔽*"]);
    case "double":
      return B(KW.DOUBLE, 0.4, 0.75, ["*Double-spend*", "*双花*"]);
    case "dust":
      return B(KW.DUST, 2.4, 0, ["*Dust*", "*粉尘*"]);
    case "drain":
      return B(KW.DRAIN, 0.3, 0.4, ["*Drain*", "*吸取*"]);
    case "reorg":
      return B(KW.REORG, 2.2, 0.2, ["*Reorg*", "*重组*"]);
    case "private":
      return B(KW.ELUSIVE, 0.5, 0, ["*Private*", "*隐私*"]);
    case "dmg":
      return B(0, N * 1.05, 0, [`*Mint:* Deal ${N} damage.`, `*铸造：*造成 ${N} 点伤害。`], (d) => {
        d.target = "any";
        d.play = (c) => c.target != null && hitOne(c, c.target, N);
      });
    case "aoe":
      return B(0, N * 2.3, 0, [`*Mint:* Deal ${N} damage to all enemy minions.`, `*铸造：*对所有敌方随从造成 ${N} 点伤害。`], (d) => {
        d.play = (c) => {
          const list = c.g.s[foe(c.side)].board.filter(alive);
          fx(c.g, "nova", c.self?.uid ?? 0, list.map((m) => m.uid));
          for (const m of list) damage(c.g, m.uid, N, c.self?.uid ?? 0);
        };
      });
    case "heal":
      return B(0, N * 0.35, 0, [`*Mint:* Restore ${N} Health to your hero.`, `*铸造：*为你的英雄恢复 ${N} 点生命值。`], (d) => {
        d.play = (c) => heal(c.g, HERO_UID[c.side], N);
      });
    case "draw":
      return B(0, N === 1 ? 2.2 : 5, 0, [N === 1 ? "*Mint:* Draw a card." : `*Mint:* Draw ${N} cards.`, N === 1 ? "*铸造：*抽一张牌。" : `*铸造：*抽 ${N} 张牌。`], (d) => {
        d.play = (c) => void draw(c.g, c.side, N);
      });
    case "buff":
      return B(0, N * 1.5, 0, [`*Mint:* Give a friendly minion +${N}/+${N}.`, `*铸造：*使一个友方随从获得 +${N}/+${N}。`], (d) => {
        d.target = "otherFriendlyMinion";
        d.play = (c) => {
          const m = c.target != null ? minion(c.g, c.target) : null;
          if (m) {
            fx(c.g, "buff", c.self?.uid ?? 0, [m.uid]);
            buff(c.g, m, N, N);
          }
        };
      });
    case "token":
      return B(0, N * 1.9, 0, [`*Mint:* Summon a ${N}/${N} Proof Echo.`, `*铸造：*召唤一个 ${N}/${N} 的证明回声。`], (d) => {
        d.play = (c) => void summon(c.g, c.side, ECHO(N), c.pos + 1);
      });
    case "armor":
      return B(0, N * 0.55, 0, [`*Mint:* Gain ${N} Armor.`, `*铸造：*获得 ${N} 点护甲。`], (d) => {
        d.play = (c) => armor(c.g, c.side, N);
      });
    case "freeze":
      return B(0, 1.2 + N * 0.9, 0, [N ? `*Mint:* Deal ${N} damage to an enemy and *Timelock* it.` : "*Mint:* *Timelock* an enemy minion.", N ? `*铸造：*对一个敌人造成 ${N} 点伤害并使其*时间锁定*。` : "*铸造：**时间锁定*一个敌方随从。"], (d) => {
        d.target = N ? "enemy" : "enemyMinion";
        d.play = (c) => {
          if (c.target == null) return;
          if (N) hitOne(c, c.target, N, "frost");
          else fx(c.g, "frost", c.self?.uid ?? 0, [c.target]);
          freeze(c.g, c.target);
        };
      });
    case "destroy":
      return B(0, N + 2.6, 0, [`*Mint:* Destroy an enemy minion with ${N} or less Attack.`, `*铸造：*消灭一个攻击力小于或等于 ${N} 的敌方随从。`], (d) => {
        d.target = "enemyMinion";
        d.tf = (g, _s, uid) => {
          const m = minion(g, uid);
          return !!m && m.atk + m.aura <= N;
        };
        d.play = (c) => {
          if (c.target == null) return;
          fx(c.g, "doom", c.self?.uid ?? 0, [c.target]);
          destroy(c.g, c.target);
        };
      });
    case "redact":
      return B(0, 1.6, 0, ["*Mint:* *Redact* a minion.", "*铸造：**涂黑*一个随从。"], (d) => {
        d.target = "minion";
        d.play = (c) => {
          const m = c.target != null ? minion(c.g, c.target) : null;
          if (m) {
            fx(c.g, "redact", c.self?.uid ?? 0, [m.uid]);
            redact(c.g, m);
          }
        };
      });
    case "death_draw":
      return B(0, 1.6, 0, ["*Nullifier:* Draw a card.", "*作废：*抽一张牌。"], (d) => {
        d.death = (c) => void draw(c.g, c.side);
      });
    case "death_dmg":
      return B(0, N * 0.85, 0, [`*Nullifier:* Deal ${N} damage to a random enemy.`, `*作废：*随机对一个敌人造成 ${N} 点伤害。`], (d) => {
        d.death = (c) => {
          const list = [HERO_UID[foe(c.side)], ...c.g.s[foe(c.side)].board.filter(alive).map((m) => m.uid)];
          const t = pick(c.g, list);
          if (t != null) hitOne(c, t, N, "shot");
        };
      });
    case "death_token":
      return B(0, N * 1.55, 0, [`*Nullifier:* Summon a ${N}/${N} Proof Echo.`, `*作废：*召唤一个 ${N}/${N} 的证明回声。`], (d) => {
        d.death = (c) => void summon(c.g, c.side, ECHO(N), c.pos);
      });
    case "end_grow":
      return B(0, 2.6, 0, ["At the end of your turn, gain +1/+1.", "在你的回合结束时，获得 +1/+1。"], (d) => {
        d.turnEnd = (c) => c.self && buff(c.g, c.self, 1, 1);
        d.worth = 3;
      });
    case "end_ping":
      return B(0, N * 1.9, 0, [`At the end of your turn, deal ${N} damage to a random enemy.`, `在你的回合结束时，随机对一个敌人造成 ${N} 点伤害。`], (d) => {
        d.turnEnd = (c) => {
          const list = [HERO_UID[foe(c.side)], ...c.g.s[foe(c.side)].board.filter(alive).map((m) => m.uid)];
          const t = pick(c.g, list);
          if (t != null) hitOne(c, t, N, "ping");
        };
        d.worth = 3;
      });
    case "end_heal":
      return B(0, N * 0.5, 0, [`At the end of your turn, restore ${N} Health to your hero.`, `在你的回合结束时，为你的英雄恢复 ${N} 点生命值。`], (d) => {
        d.turnEnd = (c) => heal(c.g, HERO_UID[c.side], N);
        d.worth = 2;
      });
    case "aura":
      return B(0, 2.8, 0, ["Your other minions have +1 Attack.", "你的其他随从拥有 +1 攻击力。"], (d) => {
        d.aura = { n: 1, who: () => true };
        d.worth = 3;
      });
    case "prover":
      return B(0, 1.4 * N, 0, [`*Prover +${N}*`, `*证明 +${N}*`], (d) => {
        d.prover = N;
      });
    case "spellgrow":
      return B(0, 1.3, 0, ["Whenever you cast a spell, gain +1 Attack.", "每当你施放一个法术，获得 +1 攻击力。"], (d) => {
        d.onSpell = (c) => c.self && buff(c.g, c.self, 1, 0);
        d.worth = 2;
      });
  }
}

function hitOne(c: Ctx, uid: number, n: number, kind = "bolt") {
  fx(c.g, kind, c.self?.uid ?? HERO_UID[c.side], [uid]);
  damage(c.g, uid, n, c.self?.uid ?? 0);
}

/** How big an ability's number is, for a card of this cost and tier. */
function sizeOf(key: AbilityKey, cost: number, tierN: number, r: () => number): number {
  const k = cost + tierN;
  switch (key) {
    case "dmg":
      return Math.max(1, Math.min(6, Math.round(k * 0.5 + r() * 0.8)));
    case "aoe":
      return k >= 9 ? 2 : 1;
    case "heal":
      return Math.max(2, Math.min(8, Math.round(k * 0.8)));
    case "draw":
      return tierN >= 3 && cost >= 6 ? 2 : 1;
    case "buff":
    case "token":
    case "death_token":
      return Math.max(1, Math.min(5, Math.round(k * 0.4)));
    case "armor":
      return Math.max(2, Math.min(8, Math.round(k * 0.8)));
    case "freeze":
      return cost >= 3 ? Math.min(4, Math.round(cost * 0.45)) : 0;
    case "destroy":
      return Math.max(2, Math.min(6, Math.round(k * 0.55)));
    case "death_dmg":
      return Math.max(1, Math.min(5, Math.round(k * 0.45)));
    case "end_ping":
    case "end_heal":
      return k >= 8 ? 2 : 1;
    case "prover":
      return tierN >= 3 ? 2 : 1;
    default:
      return 1;
  }
}

// ---- names ------------------------------------------------------------------------------------------------

const HEAD_NOUN: Record<string, [string, string]> = {
  Ascension: ["Ascendant", "飞升者"], Cinder: ["Firebrand", "焰徒"], Courier: ["Courier", "信使"], "Courier Red": ["Runner", "跑者"], Drift: ["Drifter", "漂流者"], Halo: ["Saint", "圣者"],
  Hoodie: ["Hood", "兜帽客"], Luma: ["Lamplighter", "掌灯人"], Maxi: ["Whale", "巨鲸"], "Maxi Charcoal": ["Dark Whale", "暗鲸"], "Maxi Cobalt": ["Deep Whale", "深海鲸"],
  "Maxi Hot Pink": ["Pink Whale", "粉鲸"], Miner: ["Miner", "矿工"], "Miner Graphite": ["Rig Miner", "矿机工"], Node: ["Node", "节点"], "Node Bone": ["Bone Node", "骨节点"],
  "Node Captain": ["Captain", "舰长"], "Node White": ["Validator", "验证者"], "Node ZK": ["Prover", "证明者"], Nyx: ["Nightwalker", "夜行者"], Recon: ["Scout", "侦察兵"],
  "Saint Zero": ["Saint Zero", "零圣"], Tenrai: ["Sky Monk", "天籁僧"], "Wrap Blue": ["Blue Wrap", "蓝巾客"], "Wrap Hot Pink": ["Pink Wrap", "粉巾客"], "Wrap Orange": ["Orange Wrap", "橙巾客"],
  Zhalo: ["Zealot", "狂信者"],
};
const LINEAGE_NOUN: Record<string, [string, string]> = {
  Bare: ["Snark", "证明者"], Noise: ["Static", "杂讯"], "0dB": ["Mute", "静默者"], Vibrant: ["Bloom", "繁花"], Gemini: ["Twin", "双子"], Dune: ["Nomad", "游牧者"], Noir: ["Shade", "暗影"],
  Corrupted: ["Corruptor", "腐化者"], Flare: ["Flare", "耀斑"], Grid: ["Gridling", "网格体"], Obsidian: ["Obsidian", "黑曜"], Skele: ["Skeleton", "骷髅"], Corrosive: ["Acidling", "蚀者"],
  Relic: ["Relic", "遗物"], Zombie: ["Zombie", "僵尸"], Thermal: ["Thermal", "热能体"], Glitch: ["Glitch", "故障体"], Nullstate: ["Nullstate", "空态"], Spectral: ["Specter", "幽灵"],
  Signal: ["Signal", "信号"], Apparition: ["Apparition", "显灵者"], Alien: ["Alien", "异星人"], "Zero-Knowledge": ["Zero-Knowledge", "零知者"],
};

// ---- the card -----------------------------------------------------------------------------------------------

const TIER_N: Record<Rarity, number> = { basic: 0, common: 0, rare: 1, epic: 2, legendary: 3 };
/** Stat points on top of the vanilla curve, by tier. */
const TIER_BONUS: Record<Rarity, number> = { basic: 0, common: 0.45, rare: 1, epic: 1.15, legendary: 1.9 };
/** The eyes as one word for the name ("Scanline Amber" → "Amber"). */
const ADJ: Record<string, string> = {
  "Charcoal Amber": "Amber", "Charcoal Blue": "Blue", "Charcoal Green": "Green", "Charcoal Purple": "Purple", "Charcoal Red": "Red", "Cobalt Gaze": "Cobalt", "Cobalt Wander": "Wandering",
  "Focus Graphite": "Graphite", "Mono Green": "Green", "Mono RGB": "RGB", "Perfect Dark": "Dark", "Rim Bone": "Bone", "Rim Cobalt": "Cobalt", "Rim Graphite": "Graphite", "Rim Ruby": "Ruby",
  "Rim Verdigris": "Verdigris", "Scanline Amber": "Amber", "Scanline Green": "Scanline", "Scanline Ice": "Icy", "Signal Error": "Errant", "Vanta Rei": "Vanta", "Zero Dark": "Dark",
};
const COSTS: Record<Rarity, number[]> = {
  basic: [0, 10, 20, 22, 18, 12, 9, 5, 4],
  common: [0, 10, 20, 22, 18, 12, 9, 5, 4],
  rare: [0, 6, 14, 20, 20, 16, 12, 7, 5],
  epic: [0, 0, 10, 15, 20, 20, 15, 10, 6, 4],
  legendary: [0, 0, 0, 6, 12, 18, 20, 18, 14, 8, 4],
};
function weighted(w: number[], r: () => number) {
  const t = w.reduce((a, b) => a + b, 0);
  let x = r() * t;
  for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i;
  return w.length - 1;
}
const WARM = new Set(["Infrared", "Blaze", "Solar", "Ember", "Hot Pink", "Hazard", "Molten", "Crimson", "Rust", "Tangerine", "Magenta", "Yellow"]);
const COOL = new Set(["Glacier", "Frost", "Cobalt", "Blue", "Grey", "Bone", "Graphite", "Carbon", "White"]);

/** The zkSNARK's card, made and registered (the same every time). */
export function snarkCard(id: number): CardDef {
  const cid = snarkCardId(id);
  const have = CARDS.get(cid);
  if (have) return have;
  const s = snarkInfo(id);
  const r = rng(id);
  const tierN = TIER_N[s.tier];
  let cost = Math.max(1, weighted(COSTS[s.tier], r));
  if (s.traits.Head.startsWith("Maxi")) cost = Math.min(10, Math.max(cost, 5) + 1);
  if (s.apparition) cost = Math.max(cost, 6);
  // the budget: vanilla, then rarity
  const bonus = TIER_BONUS[s.tier] + s.power * 2 * Math.min(1, cost / 5) + (s.apparition ? 1 : 0) + (s.traits.Accessory === "Diamond Stud" ? 0.6 : 0);
  let budget = Math.round(2 * cost + 1 + bonus);

  // abilities: eyes first, then head, then lineage; commons often none
  const keys: AbilityKey[] = [];
  const want = s.tier === "common" ? (r() < 0.55 ? 1 : 0) : s.tier === "rare" ? 1 : s.tier === "epic" ? 2 : 3;
  const cand = [EYE_ABILITY[s.traits.Eyes], HEAD_ABILITY[s.traits.Head], LINEAGE_ABILITY[s.traits.Lineage]];
  if (s.purged) cand.unshift(r() < 0.5 ? "death_dmg" : "death_draw");
  const onlyOne = new Set<AbilityKey>(["dmg", "aoe", "heal", "draw", "buff", "token", "armor", "freeze", "destroy", "redact"]);
  for (const k of cand) {
    if (keys.length >= want || !k || keys.includes(k)) continue;
    // one Mint per card; "destroy" and "aoe" only for epic and up; commons keep it cheap
    if (onlyOne.has(k) && keys.some((x) => onlyOne.has(x))) continue;
    if ((k === "destroy" || k === "aoe" || k === "aura" || k === "end_grow") && tierN < 2) continue;
    keys.push(k);
  }
  const built: Built[] = [];
  let fixed = 0,
    perAtk = 0,
    kw = 0;
  for (const k of keys) {
    const N = sizeOf(k, cost, tierN, r);
    const b = build(k, N);
    // too dear for this body: smaller, or dropped
    if (fixed + b.fixed > budget - 2) continue;
    built.push(b);
    fixed += b.fixed;
    perAtk += b.perAtk;
    kw |= b.kw;
  }
  budget -= fixed;
  // the body: warmer skins hit harder, cooler ones last longer
  let share = 0.48 + (r() - 0.5) * 0.2 + (WARM.has(s.traits.Skin) ? 0.08 : 0) - (COOL.has(s.traits.Skin) ? 0.08 : 0);
  if (kw & KW.GUARD) share -= 0.12;
  if (kw & (KW.CHARGE | KW.RUSH | KW.DOUBLE)) share += 0.04;
  share = Math.max(0.15, Math.min(0.7, share));
  let atk = Math.max(0, Math.round((budget * share) / (1 + perAtk)));
  let hp = Math.max(1, Math.round(budget - atk * (1 + perAtk)));
  if (kw & KW.DUST) atk = Math.min(atk, Math.max(1, Math.ceil(cost / 2)));
  if (atk === 0 && !(kw & KW.GUARD)) atk = 1;
  if (hp > 12) hp = 12;
  if (atk > 12) atk = 12;

  const h = HEAD_NOUN[s.traits.Head];
  const l = LINEAGE_NOUN[s.traits.Lineage] ?? ["Snark", "证明者"];
  const noun = h ?? l;
  const adj = ADJ[s.traits.Eyes] ?? s.traits.Eyes;
  // keywords first, then what it does
  built.sort((a, b) => (b.kw ? 1 : 0) - (a.kw ? 1 : 0));
  const text = built.map((b) => b.text[0]).join(" ");
  const textZh = built.map((b) => b.text[1]).join(" ");
  const d: CardDef = {
    id: cid,
    name: `${adj} ${noun[0]}`,
    zh: `${adj}${noun[1]}`,
    type: "minion",
    cost,
    faction: s.faction,
    rarity: s.tier,
    atk,
    hp,
    tribe: s.tribe,
    kw,
    text: tidy(text),
    textZh: tidyZh(textZh),
    art: id,
    serial: id,
    worth: built.length ? 1 + tierN : 0,
  } as CardDef;
  for (const b of built) b.apply?.(d);
  CARDS.set(cid, d);
  return d;
}

/** "*Guard* *Halo* *Mint:* Deal 2 damage." → "*Guard*. *Halo*. *Mint:* Deal 2 damage." */
function tidy(s: string) {
  return s.replace(/(\*(?:Guard|Rush|Charge|Halo|Shielded|Double-spend|Dust|Drain|Reorg|Private|Prover \+\d)\*) (?=\*|[A-Z])/g, "$1. ");
}
function tidyZh(s: string) {
  return s.replace(/(\*[^*:：]+\*) (?=\*|[^\s])/g, "$1。");
}

/** Register every z-card of a list (a deck, a pack) before the engine sees it. */
export function ensureCards(ids: string[]) {
  for (const id of ids) if (isSnarkCard(id) && !CARDS.has(id)) snarkCard(snarkIdOf(id));
}

// ---- the echoes (tokens the snarks summon) ------------------------------------------------------------------

for (let n = 1; n <= 6; n++)
  CARDS.set(ECHO(n), {
    id: ECHO(n),
    name: "Proof Echo",
    zh: "证明回声",
    type: "minion",
    cost: n,
    faction: "neutral",
    rarity: "common",
    atk: n,
    hp: n,
    text: "",
    textZh: "",
    art: [7, 4012, 5531, 8820, 1290, 3333][n - 1],
    token: true,
  } as CardDef);

// ---- lists by tier and pool (packs, the collection, the rivals) -------------------------------------------------

let byTier: Map<string, number[]> | null = null;
/** Every zkSNARK id of a tier (and of a faction, neutral included when `withNeutral`). */
export function snarksOf(tier: Rarity, faction?: Faction, withNeutral = true): number[] {
  if (!byTier) {
    byTier = new Map();
    for (let id = 1; id <= SNARKS; id++) {
      const s = snarkInfo(id);
      for (const k of [s.tier, `${s.tier}|${s.faction}`]) {
        let a = byTier.get(k);
        if (!a) byTier.set(k, (a = []));
        a.push(id);
      }
    }
  }
  if (!faction) return byTier.get(tier) ?? [];
  return [...(byTier.get(`${tier}|${faction}`) ?? []), ...(withNeutral && faction !== "neutral" ? (byTier.get(`${tier}|neutral`) ?? []) : [])];
}

/**
 * The rival's deck: its pool's starter with zkSNARKs of that pool taking some places, rarer and
 * more of them the stronger the rival (a street player brings commons, a shark brings legends).
 */
export function rivalDeck(starter: string[], pool: Faction, skill: number, seed: number): string[] {
  const r = rng(seed ^ 0x9e3779b9);
  const n = Math.round(4 + skill * 10);
  const deck = starter.slice();
  // replace the cheapest non-legendary starter cards first, keeping the curve
  const order = deck.map((id, i) => ({ id, i, c: card(id).cost + r() })).sort((a, b) => a.c - b.c);
  const used = new Set<number>();
  let k = 0;
  for (const slot of order) {
    if (k >= n) break;
    if (card(slot.id).rarity === "legendary") continue;
    const tierRoll = r();
    const tier: Rarity = tierRoll < skill * 0.12 ? "legendary" : tierRoll < skill * 0.35 ? "epic" : tierRoll < 0.3 + skill * 0.4 ? "rare" : "common";
    const pool2 = snarksOf(tier, pool);
    // close in cost to the card it replaces
    const want = card(slot.id).cost;
    let best = 0;
    for (let t = 0; t < 40; t++) {
      const id = pool2[Math.floor(r() * pool2.length)];
      if (!id || used.has(id)) continue;
      const c = snarkCard(id).cost;
      if (!best || Math.abs(c - want) < Math.abs(snarkCard(best).cost - want)) best = id;
      if (c === want) break;
    }
    if (!best) continue;
    used.add(best);
    deck[slot.i] = snarkCardId(best);
    k++;
  }
  return deck;
}

/** (for type users: the minion fields a z-card always has) */
export type SnarkMinion = Minion;
