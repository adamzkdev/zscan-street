/**
 * ZK LEGENDS' look: the cards, the minions on the board, the heroes' portraits and the pixel icons.
 * Cards are DOM (crisp text at any size, CSS transitions for free) sized by one number, `--w`: every
 * inside measure is in `em` of a font size tied to it. The art is the zkSNARK itself, read cell by
 * cell from its 26 × 26 pixel picture and drawn on a 26 px canvas the browser scales with
 * `image-rendering: pixelated` (the black round the figure keyed out, so it stands on the card's own
 * backdrop). Pictures come one at a time through the city's portrait queue, and are kept.
 */
import { T } from "../../i18n/lang";
import { CARDS, KW, KW_NAMES, POWERS, card, type CardDef, type Faction, type Hero, type Minion } from "./engine";
import { FACTION_INFO } from "./cards";

import { snarkCanvas } from "./pixels";
import { backUrl, cardUrl, onPainted, paintKey, type PaintOpts } from "./paint";
export { snarkPixels, snarkCanvas, preload } from "./pixels";

// ---- pixel icons ---------------------------------------------------------------------------------------------

/** 9 × 9 pixel icons ("#" on, "." off). */
const ICONS: Record<string, string[]> = {
  sword: ["......##.", ".....###.", "....###..", "#..###...", ".####....", "..##.....", ".####....", "##..#....", "#........"],
  heart: [".##...##.", "####.####", "#########", "#########", ".#######.", "..#####..", "...###...", "....#....", "........."],
  shield: ["#########", "#########", "#########", "#########", ".#######.", ".#######.", "..#####..", "...###...", "....#...."],
  skull: ["..#####..", ".#######.", "##.###.##", "##.###.##", "#########", ".###.###.", "..#####..", "..#.#.#..", "........."],
  bolt: ["....###..", "...###...", "..###....", ".#######.", "....###..", "...###...", "..##.....", ".##......", "#........"],
  eye: [".........", "..#####..", ".##...##.", "##..#..##", "#..###..#", "##..#..##", ".##...##.", "..#####..", "........."],
  lock: ["..#####..", ".##...##.", ".#.....#.", ".#.....#.", "#########", "####.####", "####.####", "#########", "#########"],
  drop: ["....#....", "...###...", "...###...", "..#####..", ".#######.", ".#######.", ".#######.", "..#####..", "...###..."],
  loop: ["..####.#.", ".#....##.", "#....###.", "#........", "#.......#", "........#", ".###....#", ".##....#.", ".#.####.."],
  wave: ["....#....", "..#...#..", ".#.#.#.#.", "#.#...#.#", "#.#.#.#.#", "#.#...#.#", ".#.#.#.#.", "..#...#..", "....#...."],
  leaf: [".....####", "...######", "..###.###", ".###.####", ".##.#####", "##.#####.", "#.#####..", ".#####...", "#........"],
  door: ["#######..", "#.....#..", "#.....#..", "#...#.#.#", "#.....##.", "#.....###", "#.....##.", "#.....#.#", "#######.."],
  halo: ["..#####..", ".#.....#.", "#..###..#", "#.#...#.#", "#.#...#.#", "#.#...#.#", "#..###..#", ".#.....#.", "..#####.."],
  x2: [".........", "#...#.###", ".#.#....#", "..#....##", ".#.#..#..", "#...#.###", ".........", ".........", "........."],
  q: ["..#####..", ".##...##.", ".....##..", "....##...", "...##....", "...##....", ".........", "...##....", "...##...."],
  axe: ["..####...", ".######..", "########.", ".######..", "..####.#.", "......#..", ".....#...", "....#....", "...#....."],
  card: ["#######..", "#.....#..", "#.###.#..", "#.....#..", "#.###.#..", "#.....##.", "#######.#", "........#", "......###"],
};

export function iconCanvas(name: string, color: string): HTMLCanvasElement {
  const rows = ICONS[name] ?? ICONS.q;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 9;
  cv.className = "zkl-ico";
  const g = cv.getContext("2d")!;
  g.fillStyle = color;
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && g.fillRect(x, y, 1, 1)));
  return cv;
}

// ---- text ---------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export const cardName = (d: CardDef) => T(d.name, d.zh);

/** A card's text as HTML: *keywords* bold, $n spell damage with Prover added (marked when boosted). */
export function cardText(d: CardDef, prover = 0): string {
  let s = esc(T(d.text, d.textZh));
  s = s.replace(/\*([^*]+)\*/g, "<b>$1</b>");
  s = s.replace(/\$(\d+)/g, (_m, n) => (prover ? `<i class="zkl-boost">${Number(n) + prover}</i>` : n));
  return s;
}

/** What each keyword does (the card's side notes and the rules page). */
export const KW_HELP: Record<string, [string, string]> = {
  Guard: ["Enemies must attack minions with Guard first.", "敌人必须优先攻击具有守卫的随从。"],
  Shielded: ["Can't be attacked or targeted by the enemy until it attacks.", "在其攻击之前，无法被敌人攻击或指定。"],
  Halo: ["The first time it takes damage, ignore it.", "第一次受到伤害时，忽略该伤害。"],
  Charge: ["Can attack the turn it's played.", "在使用的回合即可攻击。"],
  Rush: ["Can attack minions the turn it's played.", "在使用的回合即可攻击随从。"],
  "Double-spend": ["Can attack twice each turn.", "每回合可以攻击两次。"],
  Dust: ["Destroys any minion it damages.", "消灭任何受到其伤害的随从。"],
  Drain: ["Damage it deals heals your hero.", "其造成的伤害会为你的英雄恢复生命值。"],
  Reorg: ["The first time it dies, it comes back with 1 Health.", "第一次死亡时，以 1 点生命值回到战场。"],
  Private: ["Can't be targeted by spells or hero powers.", "无法成为法术或英雄技能的目标。"],
  Mint: ["Does something when you play it from your hand.", "从手牌中使用时触发效果。"],
  Nullifier: ["Does something when it dies.", "死亡时触发效果。"],
  Timelock: ["Can't attack until the end of its owner's next turn.", "在其拥有者的下个回合结束前无法攻击。"],
  Redact: ["Removes its card text, buffs and keywords.", "移除其卡牌描述、增益与关键词。"],
  Prover: ["Your spells deal that much more damage.", "你的法术伤害相应提高。"],
  Secret: ["Hidden until your opponent sets it off.", "在对手触发前保持隐藏。"],
  Discover: ["Pick one of three cards to add to your hand.", "从三张牌中选择一张置入手牌。"],
};
/** The keywords a card's text mentions (for the side notes). */
export function keywordsOf(d: CardDef): string[] {
  const out: string[] = [];
  const t = d.text;
  for (const k of Object.keys(KW_HELP)) if (new RegExp(`\\b${k}\\b`).test(t)) out.push(k);
  return out;
}
export const kwLabel = (k: string) => {
  const zh: Record<string, string> = { Mint: "铸造", Nullifier: "作废", Timelock: "时间锁定", Redact: "涂黑", Prover: "证明", Secret: "奥秘", Discover: "发现" };
  const row = KW_NAMES.find((r) => r[1] === k);
  return T(k, row ? row[2] : (zh[k] ?? k));
};

export const TRIBE_ZH: Record<string, string> = { Miner: "矿工", Node: "节点", Whale: "巨鲸", Ghost: "幽灵", Plant: "植物", Bot: "机器人" };
const RARITY_ZH: Record<string, string> = { basic: "基本", common: "普通", rare: "稀有", epic: "史诗", legendary: "传说" };
export const rarityName = (r: string) => T(r[0].toUpperCase() + r.slice(1), RARITY_ZH[r] ?? r);
export const factionName = (f: Faction) => T(FACTION_INFO[f].name, FACTION_INFO[f].zh);

// ---- a card ---------------------------------------------------------------------------------------------------

export interface CardOpts {
  /** Shown cost (when the game changes it), and whether that's cheaper or dearer than printed. */
  cost?: number;
  prover?: number;
  /** Stats of the minion (a bounced or buffed copy). */
  atk?: number;
  hp?: number;
}

/**
 * A card face: `<div class="zkl-card">` sized by the CSS variable --w (on it or an ancestor), showing
 * the card as paint.ts painted it (an <img>, swapped when the painting is redone).
 */
export function cardEl(id: string, o: CardOpts = {}): HTMLDivElement {
  const d = card(id);
  const el = document.createElement("div");
  el.className = `zkl-card zkl-f-${d.faction} zkl-r-${d.rarity} zkl-t-${d.type}`;
  el.dataset.id = id;
  el.style.setProperty("--fc", FACTION_INFO[d.faction].color);
  const img = document.createElement("img");
  img.className = "zkl-card-img";
  img.draggable = false;
  img.alt = cardName(d);
  el.appendChild(img);
  showCard(el, o);
  return el;
}

function optsOf(el: HTMLElement): PaintOpts {
  try {
    return JSON.parse(el.dataset.o ?? "{}") as PaintOpts;
  } catch {
    return {};
  }
}
function showCard(el: HTMLElement, o: PaintOpts) {
  const id = el.dataset.id!;
  const d = card(id);
  // (only what differs from the print goes into the key, so equal cards share one painting)
  const p: PaintOpts = {};
  if (o.cost !== undefined && o.cost !== d.cost) p.cost = o.cost;
  if (o.atk !== undefined && o.atk !== d.atk) p.atk = o.atk;
  if (o.hp !== undefined && o.hp !== d.hp) p.hp = o.hp;
  if (o.prover && (d.type === "spell" || d.type === "secret")) p.prover = o.prover;
  el.dataset.o = JSON.stringify(p);
  const key = paintKey(id, p);
  const img = el.querySelector("img.zkl-card-img") as HTMLImageElement;
  img.dataset.ck = key;
  img.src = cardUrl(id, p);
}
// a card painted again (its zkSNARK came, the fonts loaded): every <img> of it on the page follows
if (typeof document !== "undefined")
  onPainted((key) => {
    if (key === "back") {
      const u = backUrl();
      document.querySelectorAll<HTMLElement>(".zkl-back").forEach((b) => (b.style.backgroundImage = `url(${u})`));
      return;
    }
    let url = "";
    document.querySelectorAll<HTMLImageElement>("img.zkl-card-img").forEach((img) => {
      if (img.dataset.ck !== key) return;
      const el = img.parentElement as HTMLElement;
      url ||= cardUrl(el.dataset.id!, optsOf(el));
      img.src = url;
    });
  });

/** Update a card's cost in place (a hand card whose price moved). */
export function setCardCost(el: HTMLElement, cost: number) {
  const d = CARDS.get(el.dataset.id ?? "");
  if (!d || !el.querySelector("img.zkl-card-img")) return;
  const o = optsOf(el);
  if ((o.cost ?? d.cost) === cost) return;
  showCard(el, { ...o, cost });
}

/** The card back (paint.ts's, shared). */
export function backEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "zkl-back";
  el.style.backgroundImage = `url(${backUrl()})`;
  return el;
}

// ---- a minion on the board ---------------------------------------------------------------------------------

export function minionEl(m: Minion): HTMLDivElement {
  const d = card(m.id);
  const el = document.createElement("div");
  el.className = `zkl-m zkl-f-${d.faction} zkl-r-${d.rarity}`;
  el.dataset.uid = String(m.uid);
  el.style.setProperty("--fc", FACTION_INFO[d.faction].color);
  el.innerHTML = `
    <div class="zkl-m-guard"></div>
    <div class="zkl-m-body"><div class="zkl-m-art"></div><div class="zkl-m-veil"></div><div class="zkl-m-ice"></div></div>
    <div class="zkl-m-halo"></div>
    <div class="zkl-m-chips"></div>
    <div class="zkl-m-atk"><span></span></div>
    <div class="zkl-m-hp"><span></span></div>`;
  el.querySelector(".zkl-m-art")!.appendChild(snarkCanvas(d.art));
  setMinion(el, m);
  return el;
}

/** Bring a board minion's look up to date (stats, keywords, frozen, chips). */
export function setMinion(el: HTMLElement, m: Minion) {
  const d = card(m.id);
  const a = Math.max(0, m.atk + m.aura);
  const atk = el.querySelector(".zkl-m-atk span")!;
  const hp = el.querySelector(".zkl-m-hp span")!;
  atk.textContent = String(a);
  hp.textContent = String(m.hp);
  (atk.parentElement as HTMLElement).classList.toggle("up", a > (d.atk ?? 0));
  (atk.parentElement as HTMLElement).classList.toggle("dn", a < (d.atk ?? 0));
  (hp.parentElement as HTMLElement).classList.toggle("hurt", m.hp < m.maxHp);
  (hp.parentElement as HTMLElement).classList.toggle("up", m.hp >= m.maxHp && m.maxHp > (d.hp ?? 0));
  const k = (b: number) => (m.kw & b) !== 0;
  el.classList.toggle("is-guard", k(KW.GUARD));
  el.classList.toggle("is-halo", k(KW.HALO));
  el.classList.toggle("is-shielded", k(KW.SHIELDED));
  el.classList.toggle("is-frozen", !!m.frozen);
  el.classList.toggle("is-redacted", m.redacted);
  el.classList.toggle("is-legend", d.rarity === "legendary");
  const chips: [string, string][] = [];
  if (!m.redacted) {
    if (d.death) chips.push(["skull", "#e8e6e0"]);
    if (d.turnEnd || d.turnStart || d.onSummon || d.onSpell || d.onDeath || d.onHurt) chips.push(["bolt", "#f4b728"]);
    if (d.aura || d.spellDiscount || d.doubleDeath || d.prover) chips.push(["halo", "#c4b1fc"]);
  }
  if (k(KW.DOUBLE)) chips.push(["x2", "#a8d8e8"]);
  if (k(KW.DUST)) chips.push(["drop", "#9be36a"]);
  if (k(KW.DRAIN)) chips.push(["drop", "#ff5c6a"]);
  if (k(KW.REORG)) chips.push(["loop", "#c4b1fc"]);
  if (k(KW.ELUSIVE)) chips.push(["eye", "#e8e6e0"]);
  const key = chips.map((c) => c.join(":")).join("|");
  const box = el.querySelector(".zkl-m-chips") as HTMLElement;
  if (box.dataset.k !== key) {
    box.dataset.k = key;
    box.replaceChildren(...chips.map(([n, c]) => {
      const s = document.createElement("i");
      s.appendChild(iconCanvas(n, c));
      return s;
    }));
  }
}

// ---- heroes ---------------------------------------------------------------------------------------------------

export function heroEl(h: Hero, name: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `zkl-hero zkl-f-${h.faction}`;
  el.dataset.uid = String(h.uid);
  el.style.setProperty("--fc", FACTION_INFO[h.faction].color);
  el.innerHTML = `
    <div class="zkl-h-frame"><div class="zkl-h-art"></div><div class="zkl-h-ice"></div></div>
    <div class="zkl-h-name">${esc(name)}</div>
    <div class="zkl-h-atk"><span></span></div>
    <div class="zkl-h-armor"><span></span></div>
    <div class="zkl-h-hp"><span></span></div>`;
  el.querySelector(".zkl-h-art")!.appendChild(snarkCanvas(h.art));
  return el;
}

export function setHero(el: HTMLElement, h: Hero) {
  const atk = h.tmpAtk + (h.weapon?.atk ?? 0);
  el.querySelector(".zkl-h-hp span")!.textContent = String(h.hp);
  (el.querySelector(".zkl-h-hp") as HTMLElement).classList.toggle("hurt", h.hp < h.maxHp);
  el.querySelector(".zkl-h-armor span")!.textContent = String(h.armor);
  el.classList.toggle("has-armor", h.armor > 0);
  el.querySelector(".zkl-h-atk span")!.textContent = String(atk);
  el.classList.toggle("has-atk", atk > 0);
  el.classList.toggle("is-frozen", !!h.frozen);
}

const POWER_ICON: Record<string, string> = { transparent: "wave", sapling: "leaf", sprout: "door", orchard: "halo" };
export function powerEl(f: Faction): HTMLButtonElement {
  const p = POWERS.get(f)!;
  const el = document.createElement("button");
  el.className = `zkl-power zkl-f-${f}`;
  el.style.setProperty("--fc", FACTION_INFO[f].color);
  el.innerHTML = `<div class="zkl-p-disc"></div><div class="zkl-p-cost"><span>${p.cost}</span></div>`;
  el.querySelector(".zkl-p-disc")!.appendChild(iconCanvas(POWER_ICON[f] ?? "q", "#141210"));
  el.title = `${T(p.name, p.zh)}: ${T(p.text, p.textZh)}`;
  return el;
}

export function weaponEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "zkl-weapon";
  el.innerHTML = `<div class="zkl-w-art"></div><div class="zkl-w-atk"><span></span></div><div class="zkl-w-dur"><span></span></div>`;
  return el;
}

/** A hero power as a card (for previews and the log). */
export function powerCardEl(f: Faction): HTMLDivElement {
  const p = POWERS.get(f)!;
  const el = document.createElement("div");
  el.className = `zkl-card zkl-t-power zkl-f-${f} zkl-r-basic`;
  el.style.setProperty("--fc", FACTION_INFO[f].color);
  el.innerHTML = `
    <div class="zkl-c-body"></div>
    <div class="zkl-c-art zkl-c-art-icon"></div>
    <div class="zkl-c-plate"><div class="zkl-c-name">${esc(T(p.name, p.zh))}</div></div>
    <div class="zkl-c-text"><p>${esc(T(p.text, p.textZh))}</p></div>
    <div class="zkl-c-tribe">${T("Hero power", "英雄技能")}</div>
    <div class="zkl-c-cost"><span>${p.cost}</span></div>`;
  el.querySelector(".zkl-c-art")!.appendChild(iconCanvas(POWER_ICON[f] ?? "q", FACTION_INFO[f].color));
  return el;
}
