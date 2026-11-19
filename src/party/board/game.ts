/**
 * ZK PARTY's board game, on the stage: the rules (core.ts) played out on the 3D board
 * (view.ts) with the HUD over it (paint.ts). Every event the rules show is animated here (a hop
 * along the path, the dice block hit, THE TRACKER coming down from the sky, the train, the drawbridge,
 * the hash wheel, the Z-Block flying off to its next spot); every choice they ask the human for
 * is a menu (keys, pad, mouse or touch); after each turn the mini-game roulette, the side bet
 * (the hub's hook) and the mini-game itself (host.ts). At the end, the bonus Z-Blocks one by one,
 * the winner and the 3D podium.
 *
 * Keys: A (Space, Enter) roll / confirm · arrows choose · B (X, E, Shift, B) items / back ·
 * M the map · F fast-forward the rivals (or hold A).
 */
import * as THREE from "three";
import { T } from "../../i18n/lang";
import { playMini, roulette as miniRoulette, showPodium, type Scene, type Stage } from "../host";
import { FONT, H, HUD, W, clamp, fpx, isLocal, rr, sfx, text, type Btn, type Input, type MiniDef, type Player, type Rnd } from "../kit";
import { CineHud, ez, spreadPlates, sting } from "../cine";
import { banner, short } from "../k3";
import { INK, badge, numeral, tint, toy } from "../hud";
import { GAMES } from "../games";
import { music } from "../music";
import { ambience } from "../../audio/ambience";
import type { ChainSeed } from "../chain";
import type { BoardNet } from "../net/roomboard";
import { BAG, ICE_ODDS, ICE_THAW, ITEMS, LOCK_FINE, Q_PRICE, Rules, SNIPE, SOAK, WHEEL, buildGraph, type Ask, type BEv, type BonusKey, type ItemKey, type LuckyOut, type ShorOut, type Twist, type Ui, type WheelOut } from "./core";
import { mapOf, type MapDef } from "./maps";
import { BoardView } from "./view";
import { KIND_C } from "./props";
import type { MapArt } from "./decor";
import * as P from "./paint";
import { SG } from "./art/singapore";

export const TURN_CHOICES = [10, 15, 20];
export const BLOCK_PRICE = Q_PRICE;

export interface BoardResult {
  order: number[];
  coins: number[];
  blocks: number[];
  miniWins: number[];
}

export interface BoardHooks {
  /** Before each turn's mini-game (the hub asks about a side bet there). */
  beforeMini?(def: MiniDef, turn: number): Promise<void>;
  /** After it, with its order. */
  afterMini?(def: MiniDef, order: number[]): void;
  /** A Z-Block bought. */
  bought?(seat: number): void;
}

export interface BoardOpts {
  /** The Zcash block the session was seeded from (the chip on the HUD). */
  block?: ChainSeed | null;
  /** What each final place pays (the podium). */
  prizes?: string[];
  map?: string;
  /** The bench: forced dice for the human, instant mini-games, a later start, more coins, a faster clock. */
  lab?: { dice?: number[]; skipMini?: boolean; startTurn?: number; coins?: number; speed?: number; noIntro?: boolean; at?: number };
  /**
   * Online (ZK PARTY port, net/roomboard.ts): a room's board. Every page plays the same game; each
   * person's choices are asked on their own page and relayed, and the mini-games run in lockstep.
   */
  net?: BoardNet;
}

const PAD: Btn[] = ["left", "right", "up", "down", "a", "b"];
/**
 * A phone: A and B only. Every menu's choices take a tap (a card, a label, an arrow), and the four
 * arrows would take a third of the screen's bottom from the board and its buttons.
 */
const PHONE = typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (max-height: 520px), (pointer: coarse) and (max-width: 600px)").matches;
const padOf = (): Btn[] => (PHONE ? ["a", "b"] : PAD);
/** The bench (partylab.html): the board tells where it is (window.boardState) for the scripted checks. */
const LAB = typeof location !== "undefined" && /partylab/.test(location.pathname);
type Key = Btn | "m" | "f";

interface Waiter {
  fn: (dt: number) => boolean;
  done: () => void;
}
interface Pop {
  x: number;
  y: number;
  z: number;
  n: number;
  s?: string;
  c?: string;
  t: number;
}
interface Emo {
  seat: number;
  s: string;
  c: string;
  t: number;
  dur: number;
}
interface Ban {
  s: string;
  c: string;
  sub?: string;
  t: number;
  dur: number;
  size: number;
  y: number;
}
interface Roul {
  title: string;
  tiles: P.Tile[];
  target: number;
  t: number;
  dur: number;
  color: string;
  last: number;
}
interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  key?: Key;
  sel?: number;
}

type Menu =
  | { kind: "main"; seat: number }
  | { kind: "items"; seat: number; sel: number }
  | { kind: "branch"; seat: number; from: number; opts: { to: number; path: string; toll?: number; zip?: boolean }[]; sel: number }
  | { kind: "yesno"; title: string; sub: string; yes: string; no: string; q?: boolean }
  | { kind: "shop"; seat: number; offer: ItemKey[]; sel: number }
  | { kind: "target"; seat: number; why: ItemKey | "duel"; opts: number[]; sel: number }
  | { kind: "nonce"; seat: number; v: number }
  | { kind: "station"; seat: number; opts: number[]; sel: number; why?: "lift" }
  | { kind: "hit"; seat: number }
  | { kind: "next" };

/** A board's art module may follow the rules' events (NU7 QUARTER: the lift's cabin, the ice, the blizzard). */
type ArtHook = MapArt & { on?(e: BEv, view: BoardView): void };
/** The glide down from the NU7 TOWER's crown (s; art/astana.ts flies its wing as long). */
const LIFT_GLIDE = 3.4;

const NAMES: Record<string, [string, string]> = {
  coast: ["COAST", "海岸"],
  market: ["MEMPOOL", "内存池"],
  bridge: ["BRIDGE", "吊桥"],
  docks: ["HARBOR", "港口"],
  toll: ["PRISON", "监狱"],
  needleA: ["NEEDLE", "尖塔"],
  needleB: ["WEST", "西行"],
};

/** THE TRACKER's roulette (the keys stay the old ones: saves and the sim's stats go by them). */
const SHOR_TXT: Record<ShorOut, { n: [string, string]; d: [string, string]; c: string }> = {
  crack: { n: ["LINKED", "被关联"], d: ["lose 10 coins", "失去 10 金币"], c: "#ff3d56" },
  harvest: { n: ["DUST ATTACK", "粉尘攻击"], d: ["lose half", "失去一半"], c: "#ff6b35" },
  swap: { n: ["CLUSTER SWAP", "聚类互换"], d: ["swap places", "交换位置"], c: "#b48cff" },
  charity: { n: ["CHARITY", "施舍"], d: ["10 to last", "给最后一名 10"], c: "#3ec6ff" },
  decohere: { n: ["FLAGGED", "被标记"], d: ["lose items", "失去道具"], c: "#7a6aa8" },
  qblock: { n: ["DOXXED", "身份曝光"], d: ["lose a Z-Block", "失去 1 个 Z 方块"], c: "#ffd23f" },
  mercy: { n: ["MERCY?", "仁慈？"], d: ["just 1 coin", "只要 1 金币"], c: "#33d67c" },
};
const SHOR_QUIPS: [string, string][] = [
  ["A transparent address? I read it like a menu!", "透明地址？我像看菜单一样读它！"],
  ["Dust now, link later. Mostly now.", "先撒粉尘，后做关联。主要是现在。"],
  ["I cluster, therefore I am.", "我聚类，故我在。"],
  ["t-address? T for TRACKED!", "t 地址？t 就是“被追踪”！"],
  ["Every input, every output: I see you!", "每个输入，每个输出：我都看得见！"],
];
const SHOR_BYE: [string, string][] = [
  ["Shielded pools… my one weakness. Until next time!", "屏蔽池……我唯一的弱点。下次见！"],
  ["Keep your coins transparent for me!", "替我把你的币保持透明！"],
  ["Tracker out! HAHAHA!", "追踪者退场！哈哈哈！"],
];
const LUCKY_TXT: Record<LuckyOut, [string, string]> = {
  coins5: ["+5 COINS", "+5 金币"],
  coins10: ["+10 COINS", "+10 金币"],
  item: ["FREE ITEM", "免费道具"],
  tax: ["RIVALS PAY 3", "对手各付 3"],
};
const WHEEL_TXT: Record<WheelOut, { n: [string, string]; d: [string, string] }> = {
  airdrop: { n: ["AIRDROP!", "空投！"], d: ["everyone +5 coins", "所有人 +5 金币"] },
  burn: { n: ["FEE BURN!", "手续费销毁！"], d: ["everyone −5 coins", "所有人 −5 金币"] },
  flush: { n: ["MEMPOOL FLUSH!", "清空内存池！"], d: ["all coins shared out evenly", "所有金币平分"] },
  reorg: { n: ["BLOCK REORG!", "区块重组！"], d: ["the Z-Block moves", "Z 方块移动"] },
  lever: { n: ["BRIDGE FLIP!", "吊桥翻转！"], d: ["the drawbridge swings", "吊桥摆动"] },
  reward: { n: ["BLOCK REWARD!", "区块奖励！"], d: ["+10 coins", "+10 金币"] },
};
const TWIST_TXT: Record<Twist, { n: [string, string]; d: [string, string]; c: string }> = {
  double: { n: ["DOUBLE SPACES", "双倍格子"], d: ["Blue spaces give 6, red ones take 6!", "蓝格 +6，红格 −6！"], c: "#2f8bff" },
  catchup: { n: ["CATCH-UP", "追赶"], d: ["Last place gets 10 coins and a TRIPLE HASH!", "最后一名获得 10 金币和三重哈希！"], c: "#33d67c" },
  shorstorm: { n: ["TRACKER STORM", "追踪者风暴"], d: ["Every red space is now a TRACKER space!", "所有红格都变成追踪者格！"], c: "#7a3cc8" },
};
const BONUS_TXT: Record<BonusKey, { n: [string, string]; d: [string, string]; c: string }> = {
  mini: { n: ["MINI-GAME Z-BLOCK", "小游戏 Z 方块"], d: ["most coins won in mini-games", "小游戏赢得金币最多"], c: "#ff5fa2" },
  coin: { n: ["COIN Z-BLOCK", "金币 Z 方块"], d: ["most coins held at one time", "同时持有金币最多"], c: "#ffb81f" },
  event: { n: ["EVENT Z-BLOCK", "事件 Z 方块"], d: ["most event spaces landed on", "停在事件格最多"], c: "#33d67c" },
  explorer: { n: ["EXPLORER Z-BLOCK", "探险 Z 方块"], d: ["most spaces walked", "走过的格子最多"], c: "#3ec6ff" },
  unlucky: { n: ["UNLUCKY Z-BLOCK", "倒霉 Z 方块"], d: ["most red and TRACKER spaces", "停在红格和追踪者格最多"], c: "#ff3d56" },
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/** Age a list of timed things and drop the old ones, in place. */
function age<X extends { t: number; dur?: number }>(a: X[], d: number, life = 0) {
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    x.t += d;
    if (x.t < (x.dur ?? life)) a[k++] = x;
  }
  a.length = k;
}

export class Board implements Scene {
  private v: BoardView;
  private r: Rules;
  private map: MapDef;
  private aborted = false;
  private gone = false;
  private waiters: Waiter[] = [];
  private t = 0;
  /** Real time (menus, blinking). */
  private rt = 0;
  private input: Input | null = null;
  private vp = new Set<Key>();
  private hits: Hit[] = [];
  private menu: Menu | null = null;
  private answer: ((v: number) => void) | null = null;
  private menuT = 0;
  private cur = -1;
  private ff = false;
  private mapOn = false;
  private pops: Pop[] = [];
  private emos: Emo[] = [];
  private bans: Ban[] = [];
  private talk: { who: "nota" | "shor"; s: string; t: number; dur: number } | null = null;
  private roul: Roul | null = null;
  private steps: { seat: number; n: number; t: number } | null = null;
  private bigNum: { s: string; t: number; x: number; y: number; z: number; c: string } | null = null;
  private dispCoins: number[];
  private flash = [0, 0, 0, 0];
  private angry = [0, 0, 0, 0];
  private duel: { seat: number; rival: number; stake: number; ra: number; rb: number; t: number; shown: boolean; done: boolean } | null = null;
  private cardOn: { kind: "order" | "awards" | "standings" | "bonus" | "shopAi"; t: number; data: number[]; extra?: number[]; key?: BonusKey; winners?: number[]; items?: ItemKey[] } | null = null;
  private flight: { eye: THREE.CatmullRomCurve3; at: THREE.CatmullRomCurve3; t: number; dur: number } | null = null;
  private vignette = 0;
  private vignetteWant = 0;
  private games: MiniDef[];
  private last5 = false;
  private lab: NonNullable<BoardOpts["lab"]>;
  private ui: Ui;
  private offKeys: (() => void)[] = [];
  private shopName = "";
  /** The opening's cinematic overlay (cine.ts); on: the HUD steps aside; skipped (B). */
  private cine = new CineHud();
  private cineOn = false;
  private cineSkip = false;
  /** When the HUD comes back (real time), once the bars are out. */
  private cineOffAt = -1;

  constructor(
    private stage: Stage,
    private players: Player[],
    private rnd: Rnd,
    private turns: number,
    private hooks: BoardHooks = {},
    private opts: BoardOpts = {},
  ) {
    this.map = mapOf(opts.map ?? "genesis");
    this.lab = opts.lab ?? {};
    const graph = buildGraph(this.map);
    this.r = new Rules(this.map, players.map((p) => ({ human: p.human, skill: p.skill })), rnd, { turns, startTurn: this.lab.startTurn, coins: this.lab.coins, dice: this.lab.dice, at: this.lab.at }, graph);
    this.v = new BoardView(this.map, graph, players, rnd);
    this.dispCoins = this.r.coins.slice();
    this.games = GAMES.slice();
    for (let i = this.games.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [this.games[i], this.games[j]] = [this.games[j], this.games[i]];
    }
    const self = this;
    this.ui = {
      get aborted() {
        return self.aborted;
      },
      show: (e) => this.show(e),
      ask: (q) => this.ask(q),
      mini: (turn) => this.mini(turn),
    };
  }

  // ---- the session -------------------------------------------------------------------------------

  async play(): Promise<BoardResult | null> {
    const quit = () => {
      this.aborted = true;
      const w = this.waiters;
      this.waiters = [];
      for (const x of w) x.done();
      this.answer?.(0);
      this.answer = null;
    };
    this.stage.aborts.push(quit);
    this.attach();
    this.stage.show(this, padOf(), false);
    this.stage.warm(this.v.view());
    // (audio) the map's ambience bed under the board's music
    ambience.play(this.map.ambience ?? "sea", 2.5);
    try {
      const res = await this.r.run(this.ui);
      if (!res || this.aborted) return null;
      return { order: res.order, coins: res.coins, blocks: res.blocks, miniWins: res.miniWins };
    } finally {
      this.stage.aborts = this.stage.aborts.filter((f) => f !== quit);
      for (const f of this.offKeys) f();
      this.offKeys = [];
      this.gone = true;
      ambience.stop(1.5);
      this.v.dispose();
    }
  }

  /**
   * A still of the board for a picture (the hub card's, from the bench): the players spread on
   * their spaces, the Z-Block out, a wide camera, no HUD. Shown until the stage moves on.
   */
  still(at = [7, 23, 41, 66], q = 30) {
    const sp = this.r.g.spaces;
    const pos = at.map((i) => Math.min(sp.length - 1, i));
    this.r.pos = pos;
    this.v.place(pos);
    this.v.qPlace(Math.min(sp.length - 1, q));
    this.v.bridgeSnap(false);
    this.stillMode = true;
    this.shot(new THREE.Vector3(30, 38, 52), new THREE.Vector3(2, 0, -6), 50);
    this.v.cam.set(this.v.shotEye, this.v.shotAt);
    this.stage.show(this, padOf(), false);
  }
  private stillMode = false;
  /** The bench: aim the still's camera (eye x, y, z, target x, y, z). */
  aim(c: number[]) {
    this.shot(new THREE.Vector3(c[0], c[1], c[2]), new THREE.Vector3(c[3], c[4], c[5]), 50);
    this.v.cam.set(this.v.shotEye, this.v.shotAt);
  }

  /** The board's own keys (M, B, F) and the pointer on its buttons. */
  private attach() {
    const kd = (e: KeyboardEvent) => {
      if (this.gone || !this.stage.input.enabled) return;
      if ((e.target as HTMLElement).closest?.("input,textarea")) return;
      if (e.code === "KeyM") this.vp.add("m");
      else if (e.code === "KeyB") this.vp.add("b");
      else if (e.code === "KeyF") this.vp.add("f");
    };
    window.addEventListener("keydown", kd, true);
    const cv = this.stage.canvas;
    const pd = (e: PointerEvent) => {
      if (this.gone || !this.stage.input.enabled || (e.target as HTMLElement).closest?.("button,[data-pad]")) return;
      const { x, y } = this.stage.toCanvas(e);
      // (a touch screen: a button drawn under 44 px still takes a finger 44 px across)
      const reach = HUD.min ? (44 * HUD.min) / 12 : 0;
      const inside = (b: Hit, sx: number, sy: number) => x >= b.x - sx && x <= b.x + b.w + sx && y >= b.y - sy && y <= b.y + b.h + sy;
      const h = this.hits.find((b) => inside(b, 0, 0)) ?? (reach ? this.hits.find((b) => inside(b, Math.max(0, (reach - b.w) / 2), Math.max(0, (reach - b.h) / 2))) : undefined);
      if (h) {
        if (h.sel !== undefined && this.menu && "sel" in this.menu) {
          if (this.menu.sel === h.sel) this.vp.add("a");
          else ((this.menu.sel = h.sel), sfx.blip(2), this.menuMoved());
        } else if (h.key) this.vp.add(h.key);
      } else if (!this.menu || this.menu.kind === "main" || this.menu.kind === "hit" || this.menu.kind === "next") this.vp.add("a");
    };
    cv.addEventListener("pointerdown", pd);
    this.offKeys.push(
      () => window.removeEventListener("keydown", kd, true),
      () => cv.removeEventListener("pointerdown", pd),
    );
  }

  private pressed(b: Key) {
    return this.vp.has(b) || (b !== "m" && b !== "f" && !!this.input?.pressed(b));
  }

  // ---- the clock ---------------------------------------------------------------------------------

  private speed() {
    const ai = this.cur >= 0 && !isLocal(this.players[this.cur]);
    const human = this.players.some(isLocal);
    return (this.lab.speed ?? 1) * (ai && (this.ff || !human || this.input?.held("a")) ? 3 : 1);
  }

  /** Resolve when fn says so (fn gets the board's own, sped-up, step). */
  private until(fn: (dt: number) => boolean): Promise<void> {
    if (this.aborted) return Promise.resolve();
    return new Promise((done) => this.waiters.push({ fn, done }));
  }
  private wait(s: number) {
    let left = s;
    return this.until((dt) => (left -= dt) <= 0);
  }
  /** Wait, or less when the human presses A (a line read, a card seen). */
  private waitA(s: number, min = 0.35) {
    let left = s;
    let el = 0;
    const human = this.players.some(isLocal);
    return this.until((dt) => {
      el += dt;
      left -= dt;
      return left <= 0 || (human && el > min && this.pressed("a"));
    });
  }

  update(dt: number, input: Input) {
    if (this.gone) return;
    this.input = input;
    const k = this.speed();
    const d = dt * k;
    this.t += d;
    this.rt += dt;
    this.menuT += dt;
    // the board's own keys
    if (this.pressed("f")) ((this.ff = !this.ff), sfx.blip(this.ff ? 4 : 1));
    if (this.pressed("m") && this.menu) this.toggleMap();
    else if (this.mapOn && (this.pressed("a") || this.pressed("b"))) {
      this.toggleMap();
      this.vp.clear();
      input.clear();
    }
    this.v.mapOn = this.mapOn;
    if (this.flight) {
      const f = this.flight;
      f.t += d;
      const u = Math.min(1, f.t / f.dur);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      f.eye.getPoint(e, this.v.shotEye);
      f.at.getPoint(e, this.v.shotAt);
    }
    this.v.update(d);
    if (this.v.wheelTick) ((this.v.wheelTick = false), sfx.tick());
    // the panels' coins count toward the real ones
    for (let i = 0; i < 4; i++) {
      const want = this.r.coins[i];
      const diff = want - this.dispCoins[i];
      if (diff) {
        const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, d * 6)));
        this.dispCoins[i] = Math.abs(step) >= Math.abs(diff) ? want : this.dispCoins[i] + step;
      }
      this.flash[i] = Math.max(0, this.flash[i] - dt * 2);
      if (this.angry[i] > 0 && (this.angry[i] -= d) <= 0) this.v.av[i].angry = false;
    }
    age(this.pops, d, 1.3);
    age(this.emos, d);
    age(this.bans, d);
    if (this.talk) this.talk.t += d;
    if (this.steps) this.steps.t += d;
    if (this.bigNum) ((this.bigNum.t += d), this.bigNum.t > 1.0 && (this.bigNum = null));
    if (this.duel) this.duel.t += d;
    if (this.cardOn) this.cardOn.t += d;
    this.vignette += (this.vignetteWant - this.vignette) * Math.min(1, dt * 4);
    // the opening's overlay: the plates over their heads, the spotlight on you
    this.cine.update(dt);
    if (this.cine.impact) this.v.cam.shake(0.5);
    if (this.cineOffAt >= 0 && this.rt >= this.cineOffAt) ((this.cineOn = false), (this.cineOffAt = -1));
    if (this.cine.plates.length) {
      for (const pl of this.cine.plates) {
        const s = this.v.toScreen(this.v.head(pl.p.seat, 3.0, tmp));
        pl.x = s.x;
        pl.y = s.y;
        pl.on = s.on;
        if (isLocal(pl.p) && pl.t >= 0) ((this.cine.spot.x = s.x), (this.cine.spot.y = s.y + 50), (this.cine.spot.r = 120), (this.cine.spot.want = this.cineOn ? 1 : 0));
      }
      spreadPlates(this.cine.plates);
    }
    if (this.roul) {
      const r = this.roul;
      r.t += d;
      const i = Math.floor(this.roulPos());
      if (i !== r.last) ((r.last = i), sfx.roll());
    }
    // the human's menu
    if (this.menu && !this.mapOn) this.menuInput();
    // (the waiters done this frame, in order; a new one added by a done() waits for the next frame)
    const n = this.waiters.length;
    let keep = 0;
    for (let i = 0; i < n; i++) {
      const x = this.waiters[i];
      if (x.fn(d)) this.doneNow.push(x);
      else this.waiters[keep++] = x;
    }
    this.waiters.splice(keep, n - keep);
    for (let i = 0; i < this.doneNow.length; i++) this.doneNow[i].done();
    this.doneNow.length = 0;
    this.vp.clear();
    if (this.rt - this.stAt > 0.2) ((this.stAt = this.rt), (this.st = this.r.standing()));
    if (LAB)
      (window as unknown as { boardState: unknown }).boardState = {
        menu: this.menu?.kind ?? null,
        sel: this.menu && "sel" in this.menu ? this.menu.sel : -1,
        cur: this.cur,
        turn: this.r.turn,
        evs: this.labEvs,
        coins: this.r.coins,
        blocks: this.r.blocks,
        items: this.r.items,
        map: this.mapOn,
        fps: Math.round(1 / Math.max(1e-3, dt)),
      };
  }
  private labEvs: string[] = [];
  private doneNow: Waiter[] = [];
  /** The standings, refreshed a few times a second (the panels' places). */
  private st = [0, 1, 2, 3];
  private stAt = -1;
  /** The bench: about how many draws the board makes (visible meshes and sprites; instanced ones count once). */
  labDraws() {
    let n = 0;
    const kinds: Record<string, number> = {};
    this.v.w.scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh && !(o as unknown as { isSprite?: boolean }).isSprite) return;
      const k = Array.isArray(m.material) ? m.material.length : 1;
      n += k;
      const key = (o as THREE.InstancedMesh).isInstancedMesh ? "instanced" : (o as unknown as { isSprite?: boolean }).isSprite ? "sprite" : "mesh";
      kinds[key] = (kinds[key] ?? 0) + k;
    });
    return { n, kinds };
  }

  private toggleMap() {
    this.mapOn = !this.mapOn;
    sfx.blip(this.mapOn ? 5 : 2);
  }

  view() {
    return this.gone ? null : this.v.view();
  }

  // ---- the HUD's helpers -------------------------------------------------------------------------

  private nm(seat: number) {
    const p = this.players[seat];
    return isLocal(p) ? T("you", "你") : short(p);
  }
  private NM(seat: number) {
    return this.nm(seat).toUpperCase();
  }
  private say(s: string, c = "#ffd23f", sub?: string, dur = 1.7, size = 58, y = H * 0.3) {
    for (const b of this.bans) if (b.y === y) b.t = b.dur;
    this.bans.push({ s, c, sub, t: 0, dur, size, y });
  }
  /** A host line (or THE TRACKER's): shown for about as long as it takes to read. */
  private async host(s: string, who: "nota" | "shor" = "nota", dur?: number) {
    const d = dur ?? Math.min(4, 1.3 + Array.from(s).length * 0.035);
    this.talk = { who, s, t: 0, dur: d };
    await this.waitA(d, 0.45);
    if (this.talk?.s === s) this.talk = null;
  }
  private pop(seat: number, n: number, s?: string, c?: string) {
    const p = this.v.head(seat, 2.7, tmp);
    this.pops.push({ x: p.x, y: p.y, z: p.z, n, s, c, t: 0 });
  }
  private emo(seat: number, s: string, c = INK, dur = 1.4) {
    for (const e of this.emos) if (e.seat === seat) e.t = e.dur;
    this.emos.push({ seat, s, c, t: 0, dur });
  }
  private react(seat: number, mood: "happy" | "sad" | "shock" | "big") {
    const a = this.v.av[seat];
    if (mood === "happy") (a.cheer(1.0), this.emo(seat, ["♪", "★", "+!"][Math.floor(Math.random() * 3)], "#ff6b35", 1.1));
    else if (mood === "big") (a.cheer(2.4), a.jump(8), this.emo(seat, "★★", "#ff6b35", 1.6));
    else if (mood === "sad") {
      a.angry = true;
      this.angry[seat] = 1.6;
      a.hit();
      this.emo(seat, ["#@!", "ARGH", "NO!"][Math.floor(Math.random() * 3)], "#ff3d56", 1.4);
    } else (a.hit(), this.emo(seat, "!?", "#7b5cff", 1.1));
  }
  /** The camera on a seat (zoom: 1 the turn's view, less closer). */
  private follow(seat: number, zoom = 1, k = 3.2) {
    this.v.mode = "follow";
    this.v.followSeat = seat;
    this.v.zoom = zoom;
    this.v.camK = k;
  }
  private shot(eye: THREE.Vector3, at: THREE.Vector3, k = 2.6) {
    this.v.mode = "shot";
    this.v.shotEye.copy(eye);
    this.v.shotAt.copy(at);
    this.v.camK = k;
  }
  private roulPos() {
    const r = this.roul!;
    const n = r.tiles.length;
    const total = n * 3 + r.target;
    const k = Math.min(1, r.t / r.dur);
    return total * (1 - Math.pow(1 - k, 3));
  }
  /** A roulette strip: it spins and lands on `target` (then stays up until cleared). */
  private async spin(title: string, tiles: P.Tile[], target: number, color: string, dur = 2.2) {
    this.roul = { title, tiles, target, t: 0, dur, color, last: -1 };
    await this.until(() => !!this.roul && (this.roul.t >= this.roul.dur || (this.players.some(isLocal) && this.roul.t > 0.5 && this.pressed("a") && ((this.roul.t = this.roul.dur), true))));
    sfx.star();
  }

  // ---- what the rules show -----------------------------------------------------------------------

  private async show(e: BEv): Promise<void> {
    if (this.aborted) return;
    if (LAB) this.labEvs.push(e.t === "land" ? `land:${this.r.g.spaces[e.space].ev ?? this.r.g.spaces[e.space].kind}` : e.t === "bridge" ? `bridge:${e.up ? "up" : "down"}` : e.t === "step" && e.zip ? "zip" : e.t);
    const v = this.v;
    const r = this.r;
    (v.art as ArtHook | null)?.on?.(e, v);
    switch (e.t) {
      case "intro":
        return this.intro();
      case "qmove": {
        const first = !!e.first;
        // (the opening's reveal: out of the sky, then the players' entrance)
        if (first && !this.lab.noIntro) return this.qReveal(e.to);
        if (!first) this.say(T("THE Z-BLOCK MOVES!", "Z 方块移动了！"), "#ffd23f", undefined, 2.2);
        v.track = () => v.qPos(tmp2);
        v.mode = "track";
        v.zoom = 1.9;
        v.camK = 2.4;
        // (bought: it comes down out of the sky onto its new spot; the wheel's reorg: it flies there)
        v.qMove(e.to, first ? 2.2 : 2.6);
        sfx.whoosh();
        await this.wait(first ? 2.3 : 2.7);
        sfx.star();
        v.zoom = 1.15;
        if (first) {
          await this.host(T(`There it is: the GENESIS Z-BLOCK! Pass it with ${Q_PRICE} coins and it's yours. Then it flies somewhere new.`, `看，那就是创世 Z 方块！带着 ${Q_PRICE} 金币经过它就能买下。之后它会飞到新的地方。`));
        } else await this.wait(0.9);
        if (this.cur >= 0) this.follow(this.cur);
        return;
      }
      case "order":
        return this.order(e.rolls, e.order);
      case "turn": {
        this.cur = -1;
        v.walker = -1;
        const lastT = e.turn === e.of;
        this.say(lastT ? T("LAST TURN!", "最后一回合！") : T(`TURN ${e.turn}`, `第 ${e.turn} 回合`), lastT ? "#ff5fa2" : "#ffffff", T(`of ${e.of}`, `共 ${e.of} 回合`), 1.6, 70);
        sfx.fanfare();
        if (lastT) music.rate(1.12);
        // (MARINA NIGHTS: where the sky wheel sets riders down this turn)
        const stop = this.map.ride?.stops[r.stopNow()];
        if (stop) this.say(T(`SKY WHEEL → ${stop.n[0]}`, `摩天轮 → ${stop.n[1]}`), "#ff7fe6", undefined, 2.0, 30, H * 0.47);
        // (the whole board, every turn: who is where, where the Z-Block waits)
        this.shot(tmp.set(4, 78, 52), tmp2.set(4, 0, -10), 2.2);
        await this.waitA(1.6);
        return;
      }
      case "start": {
        this.cur = e.seat;
        v.walker = e.seat;
        this.follow(e.seat);
        const p = this.players[e.seat];
        if (isLocal(p)) this.say(T("YOUR TURN!", "轮到你了！"), p.color, undefined, 1.3, 60);
        else this.say(T(`${this.NM(e.seat)}'S TURN`, `${this.NM(e.seat)} 的回合`), p.color, undefined, 1.0, 40, H * 0.22);
        sfx.blip(3);
        v.av[e.seat].body.wave(1);
        await this.wait(isLocal(p) ? 0.9 : 0.75);
        return;
      }
      case "item": {
        const it = e.item;
        this.say(P.itemName(it), P.ITEM_TXT[it].c, e.target !== undefined ? T(`on ${this.nm(e.target)}`, `对 ${this.nm(e.target)}`) : P.itemDesc(it), 1.6, 48, H * 0.26);
        this.emo(e.seat, "!", P.ITEM_TXT[it].c, 1.2);
        sfx.star();
        v.fx.burst(v.head(e.seat, 2.4, tmp), 30, [P.ITEM_TXT[it].c, "#ffffff"], { speed: 5, up: 4 });
        await this.wait(1.1);
        return;
      }
      case "warp": {
        this.follow(e.seat, 1.2);
        v.move(e.seat, e.to, "warp", 1.5);
        sfx.whoosh();
        await this.wait(0.8);
        this.follow(e.seat, 1.0, 6);
        await this.wait(0.9);
        return;
      }
      case "swap": {
        const a = v.spacePos(r.pos[e.a], new THREE.Vector3());
        const b = v.spacePos(r.pos[e.b], new THREE.Vector3());
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const d = a.distanceTo(b);
        this.shot(tmp.set(mid.x, 12 + d * 0.55, mid.z + 10 + d * 0.6), mid, 3);
        await this.wait(0.5);
        v.move(e.a, r.pos[e.a], "fly", 1.5, 4 + d * 0.15);
        v.move(e.b, r.pos[e.b], "fly", 1.5, 4 + d * 0.15);
        sfx.whoosh();
        this.say(e.why === "reorg" ? T("REORG!", "链重组！") : T("CLUSTER SWAP!", "聚类互换！"), "#b48cff", T(`${this.nm(e.a)} ⇄ ${this.nm(e.b)}`, `${this.nm(e.a)} ⇄ ${this.nm(e.b)}`), 1.8);
        await this.wait(1.7);
        this.react(e.b, "shock");
        this.follow(this.cur >= 0 ? this.cur : e.a);
        await this.wait(0.6);
        return;
      }
      case "steal": {
        this.pop(e.from, -e.n);
        this.react(e.from, "sad");
        sfx.lose();
        await this.wait(0.6);
        this.pop(e.seat, e.n);
        this.react(e.seat, "happy");
        sfx.coin();
        await this.wait(0.8);
        return;
      }
      case "trapSet": {
        v.setLocks(r.traps);
        sfx.thud();
        this.emo(e.seat, "🔒", "#1a1033");
        await this.wait(0.8);
        return;
      }
      case "trapHit": {
        this.follow(e.seat, 0.9);
        v.setLocks(r.traps);
        this.say(T("FINALITY LOCK!", "最终性锁！"), "#7fd8ff", T(`${this.nm(e.seat)} pays ${this.nm(e.owner)} ${e.n}`, `${this.nm(e.seat)} 付给 ${this.nm(e.owner)} ${e.n}`), 1.6, 46);
        sfx.thud();
        v.cam.shake(0.3);
        this.pop(e.seat, -e.n);
        this.react(e.seat, "sad");
        await this.wait(1.0);
        this.pop(e.owner, e.n);
        this.react(e.owner, "happy");
        await this.wait(0.5);
        this.follow(e.seat);
        return;
      }
      case "diceUp": {
        v.walker = e.seat;
        if (e.n > 1 || e.fixed || v.diceCount !== e.n) v.diceUp(e.seat, e.n, e.fixed ?? 0);
        this.follow(e.seat, 0.82);
        await this.wait(0.25);
        return;
      }
      case "hitDie": {
        const a = v.av[e.seat];
        if (!this.players[e.seat].human) await this.wait(0.25 + Math.random() * 0.3);
        a.jump(10.5);
        await this.wait(0.21);
        v.diceHit(e.k, e.v);
        sfx.hit();
        const dp = v.diePos(e.k, tmp);
        this.bigNum = { s: String(e.v), t: 0, x: dp.x, y: dp.y + 0.6, z: dp.z, c: this.players[e.seat].color };
        await this.wait(0.5);
        return;
      }
      case "dice": {
        const sum = e.values.reduce((a, b) => a + b, 0);
        if (e.values.length > 1) {
          this.say(`${e.values.join(" + ")} = ${sum}`, this.players[e.seat].color, undefined, 1.3, 52, H * 0.24);
          sfx.coin();
          await this.wait(0.8);
        }
        v.diceGo();
        this.steps = { seat: e.seat, n: sum, t: 0 };
        await this.wait(0.35);
        v.diceDown();
        this.follow(e.seat, 1);
        return;
      }
      case "fork": {
        if (isLocal(this.players[e.seat])) return;
        v.showArrows(e.from, e.opts, e.k, this.players[e.seat].color);
        this.emo(e.seat, "?", INK, 0.7);
        await this.wait(0.7);
        v.showArrows(e.from, null);
        return;
      }
      case "step": {
        if (e.slide) return this.slideStep(e.seat, e.from, e.to, e.left);
        v.walker = e.seat;
        const zip = !!e.zip;
        // (up onto a raised way or down off it, MARINA NIGHTS' skyway: a bigger hop)
        const climb = Math.abs(r.g.spaces[e.to].y - r.g.spaces[e.from].y) > 2;
        const dur = zip ? 3.1 : climb ? 0.6 : 0.3;
        v.move(e.seat, e.to, zip ? "zip" : "hop", dur, climb ? 1.4 : 0.42);
        if (!zip) this.follow(e.seat, 1, 5.5);
        else (v.cheerAll(), sfx.cheer(0.5));
        this.steps = { seat: e.seat, n: e.left, t: 0 };
        // (the crowd by the way cheers them past)
        const to = r.g.spaces[e.to];
        v.cheer(to.x, to.z, 7.5, 0.3);
        if (zip) {
          this.say(T("ZIPLINE!", "滑索！"), "#ff6b35", T("from the Needle, all the way down", "从尖塔一路滑下"), 2.2, 54);
          sfx.whoosh();
          this.follow(e.seat, 1.5, 4);
          this.emo(e.seat, "WHEE!", "#ff6b35", 2.6);
        } else sfx.step(e.left);
        await this.wait(dur);
        if (zip) this.follow(e.seat);
        return;
      }
      case "toll": {
        v.tollOpen();
        // (the shortcut's name: GENESIS's Penitentiary, else the toll way's own)
        const tw = r.g.spaces[r.pos[e.seat]].next.find((x) => x.toll);
        const twn = this.map.key === "genesis" ? null : tw && this.map.paths.find((p) => p.id === tw.path)?.name;
        this.say(T("TOLL PAID", "已付过路费"), "#ff6b35", twn ? T(`−${e.n} coins · the ${twn[0]}`, `−${e.n} 金币 · ${twn[1]}`) : T(`−${e.n} coins · the Penitentiary's shortcut`, `−${e.n} 金币 · 监狱捷径`), 1.4, 40, H * 0.24);
        this.pop(e.seat, -e.n);
        sfx.chips();
        await this.wait(0.8);
        return;
      }
      case "coins": {
        this.pop(e.seat, e.n);
        if (e.n > 0) (sfx.coin(), this.react(e.seat, "happy"));
        else (sfx.lose(), this.react(e.seat, "sad"));
        await this.wait(0.7);
        return;
      }
      case "coinsAll": {
        e.deltas.forEach((n, i) => n && this.pop(i, n));
        if (e.deltas.some((n) => n > 0)) sfx.coin();
        else sfx.lose();
        e.deltas.forEach((n, i) => n && this.react(i, n > 0 ? "happy" : "sad"));
        await this.wait(1.2);
        return;
      }
      case "land": {
        const sp = r.g.spaces[e.space];
        this.steps = null;
        if (sp.kind !== "red" && sp.kind !== "shor") v.cheer(sp.x, sp.z, 10, 0.7);
        v.flashSpace(e.space);
        v.fx.burst(v.spacePos(e.space, tmp).setY(0.6), 24, [KIND_C[sp.kind], "#ffffff"], { speed: 5, up: 3, size: 0.16 });
        sfx.thud();
        await this.wait(0.3);
        return;
      }
      case "qpoor": {
        if (isLocal(this.players[e.seat])) await this.host(T(`The Z-Block costs ${e.price} coins. Come back with more!`, `Z 方块要 ${e.price} 金币。多攒点再来！`), "nota", 2.2);
        else (this.emo(e.seat, "…", INK, 1), await this.wait(0.6));
        return;
      }
      case "qbuy": {
        this.follow(e.seat, 0.72, 3);
        v.qTake(e.seat);
        this.react(e.seat, "big");
        v.cheerAll();
        this.say(isLocal(this.players[e.seat]) ? T("Z-BLOCK GET!", "得到 Z 方块！") : T(`${this.NM(e.seat)} GETS A Z-BLOCK!`, `${this.NM(e.seat)} 得到 Z 方块！`), "#ffd23f", T(`−${e.price} coins`, `−${e.price} 金币`), 2.4, 58, H * 0.17);
        music.sting("fanfare");
        // (audio) ka-ching, and the crowd goes up
        sfx.register(0.8);
        sfx.cheer(0.9);
        ambience.swell(1.5, 2.5);
        this.flash[e.seat] = 1.5;
        this.pop(e.seat, -e.price);
        for (let k = 0; k < 3; k++) setTimeout(() => !this.gone && v.fx.burst(v.head(e.seat, 3, new THREE.Vector3()), 50, ["#ffd23f", "#fff3c4", "#ff6b35", "#ffffff"], { speed: 8, up: 7 }), k * 220);
        this.hooks.bought?.(e.seat);
        await this.waitA(2.4, 1.2);
        return;
      }
      case "shop": {
        this.shopName = this.shopOf(r.pos[e.seat]);
        if (!this.players[e.seat].human) {
          this.cardOn = { kind: "shopAi", t: 0, data: [e.seat], items: e.offer };
          this.emo(e.seat, "$?", "#ff6b35", 1);
          sfx.blip(3);
          await this.wait(0.9);
          this.cardOn = null;
        }
        return;
      }
      case "buy": {
        this.pop(e.seat, -e.price);
        this.say(T(`${isLocal(this.players[e.seat]) ? "YOU" : this.NM(e.seat)} BOUGHT`, `${this.NM(e.seat)} 买了`), P.ITEM_TXT[e.item].c, P.itemName(e.item), 1.3, 34, H * 0.24);
        sfx.chips();
        this.react(e.seat, "happy");
        await this.wait(0.9);
        return;
      }
      case "bagFull": {
        if (isLocal(this.players[e.seat])) await this.host(T(`Your bag is full: ${BAG} items at most. Use one first!`, `你的背包满了：最多 ${BAG} 个道具。先用掉一个！`), "nota", 2);
        return;
      }
      case "lucky": {
        this.follow(e.seat, 0.95);
        const tiles: P.Tile[] = e.opts.map((o) => ({ top: T(...LUCKY_TXT[o]), c: o === "item" ? "#b48cff" : o === "tax" ? "#3ec6ff" : "#ffb81f", coin: o !== "item", item: o === "item" ? e.item ?? "double" : undefined }));
        if (e.opts.length > 1) {
          this.emo(e.seat, "?", "#b48cff", 1);
          sfx.star();
          await this.spin(T("LUCKY SPACE", "幸运格"), tiles, e.opts.indexOf(e.out), "#b48cff", 1.8);
        }
        if (e.out === "item" && e.item) {
          this.say(T("FREE ITEM!", "免费道具！"), P.ITEM_TXT[e.item].c, P.itemName(e.item), 1.6, 52);
          this.react(e.seat, "happy");
          sfx.coin();
        } else if (e.out === "tax") this.say(T("BLOCK FEES!", "区块手续费！"), "#3ec6ff", T("every rival pays 3", "每个对手付 3"), 1.6, 50);
        await this.wait(1.0);
        this.roul = null;
        return;
      }
      case "shor":
        return this.shorShow(e.seat, e.opts, e.out, e.target, e.n);
      case "shorGone": {
        this.v.shorOut();
        this.vignetteWant = 0;
        await this.host(T(...SHOR_BYE[Math.floor(Math.random() * SHOR_BYE.length)]), "shor", 1.6);
        this.roul = null;
        return;
      }
      case "duel":
        return this.duelShow(e.seat, e.rival, e.stake, e.stakes);
      case "duelRoll":
        return this.duelRoll(e.seat, e.rival, e.ra, e.rb, e.n);
      case "metro":
        return this.metroShow(e.seat, e.from, e.to);
      case "bridge":
        return this.bridgeShow(e.up, e.knocked, e.to, !!e.auto);
      case "wheel":
        return this.wheelShow(e.seat, e.out);
      case "liftUp":
        return this.liftUpShow(e.seat);
      case "lift":
        return this.liftShow(e.seat, e.to);
      case "ice":
        return this.iceShow(e.seat, e.out, e.cracks, e.at, e.back, e.n);
      case "freeze":
        return this.freezeShow(e.why);
      case "buran":
        return this.buranShow(e.seat, e.moves);
      case "ride":
        return this.rideShow(e.seat, e.to, e.stop);
      case "storm":
        return this.stormShow(e.seat, e.deltas);
      case "recede":
        return this.recedeShow();
      case "soaked":
        return this.soakedShow(e.seat, e.n, e.space, e.to);
      case "miniAward": {
        this.cur = -1;
        this.cardOn = { kind: "awards", t: 0, data: e.order, extra: e.gains };
        sfx.fanfare();
        sfx.cheer(0.7);
        await this.wait(0.6);
        e.order.forEach((seat) => e.gains[seat] && (this.pop(seat, e.gains[seat]), (this.flash[seat] = 1)));
        sfx.coin();
        await this.waitA(2.4, 0.8);
        this.cardOn = null;
        return;
      }
      case "last5":
        return this.last5Show(e.standings);
      case "twist":
        return this.twistShow(e.twist, e.opts);
      case "over":
        return this.overShow();
      case "bonus":
        return this.bonusShow(e.key, e.vals, e.winners, e.k);
      case "final":
        return this.finalShow(e.order);
      case "lockLost":
        return;
    }
  }

  private shopOf(space: number) {
    const p = this.r.g.spaces[space].path;
    const own = this.map.shops?.[p];
    if (own) return T(...own);
    return p === "market" ? T("MEMPOOL MART", "内存池商店") : p === "docks" ? T("HARBOR MART", "港口商店") : p === "west" ? T("FACTORY STORE", "工厂商店") : T("ITEM SHOP", "道具店");
  }

  // ---- the big moments ---------------------------------------------------------------------------

  /**
   * The opening, a cinematic in letterbox (cine.ts): the map's title slams in over a crane above the
   * whole board, then a cut to each of its zones (its tour) with its name stamped, ZEE's welcome
   * over them (the map's gimmick in the last line); then the Z-Block's reveal (qReveal) and the four
   * players' entrance (entrance). A: ZEE's next line (then: on with it); B: skip it all.
   */
  private async intro() {
    const v = this.v;
    v.place(this.r.pos);
    if (this.lab.noIntro) return;
    const human = this.players.some(isLocal);
    const c = this.cine;
    this.cineOn = true;
    this.cineSkip = false;
    c.bars = true;
    c.accent = "#ffd23f";
    c.hint = human ? { btn: "b", s: T("SKIP", "跳过"), s2: T("NEXT", "继续") } : null;
    // (the four wait off stage: they make their entrance once the Z-Block is out)
    this.offStage(true);
    sfx.whoosh();
    const V3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    const tour = this.map.tour && this.map.tour.length >= 2 ? this.map.tour : [{ n: [this.map.title, this.map.titleZh] as [string, string], eye: [70, 46, 70] as [number, number, number], at: [4, 0, -8] as [number, number, number] }];
    const lines: [string, string][] = this.map.intro ?? [
      ["Welcome to GENESIS HARBOR, ZStreet's floating harbour! I'm ZEE, your host for tonight.", "欢迎来到创世港，ZStreet 的浮空港口！我是 ZEE，今晚的主持人。"],
      ["Roll, run the paths and buy GENESIS Z-BLOCKS. Most Z-Blocks wins the party!", "掷骰、跑图、购买创世 Z 方块。Z 方块最多者赢得派对！"],
      ["Mind the SAPLING BRIDGE, ride the ZEC LINE… and watch out for THE TRACKER!", "小心树苗吊桥，搭乘 ZEC 线……还要提防追踪者！"],
    ];
    // the shots: the title's crane over the whole board, then each zone (a slow truck and push in)
    const TITLE = 3.4;
    const LINE = 4.4;
    const LINE0 = 2.6;
    const n = tour.length - 1;
    const zd = n > 0 ? clamp((LINE0 + lines.length * LINE - TITLE) / n, 1.45, 2.2) : 0;
    const shots = tour.map((z, i) => {
      const eye = V3(z.eye),
        at = V3(z.at);
      const back = eye.clone().sub(at);
      const dist = back.length();
      const side = new THREE.Vector3(-back.z, 0, back.x).normalize();
      if (i === 0) {
        // (round and down onto the zone's own view)
        const a = 0.55;
        const r = back.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(1.22);
        return { e0: at.clone().add(r).setY(eye.y * 1.3), e1: eye, a0: at.clone().setY(at.y - 6), a1: at, dur: TITLE, name: null as [string, string] | null };
      }
      const sd = i % 2 ? 1 : -1;
      // (it ends on the zone's own view, the map's: clear of its scenery)
      return {
        e0: eye.clone().addScaledVector(side, sd * dist * 0.1).addScaledVector(back, 0.12),
        e1: eye.clone().addScaledVector(back, -0.04),
        a0: at.clone().addScaledVector(side, sd * dist * 0.04),
        a1: at,
        dur: zd,
        name: z.n,
      };
    });
    const starts: number[] = [];
    let total = 0;
    for (const s of shots) (starts.push(total), (total += s.dur));
    v.mode = "shot";
    v.camK = 30;
    v.shotEye.copy(shots[0].e0);
    v.shotAt.copy(shots[0].a0);
    v.cam.set(v.shotEye, v.shotAt);
    let t = 0;
    let cur = -1;
    let li = -1;
    let lt = 0;
    let slam = false;
    let stop = false;
    await this.until((dt) => {
      if (this.aborted) return true;
      t += dt;
      if (!slam && t >= 0.45) {
        slam = true;
        c.title(T(this.map.title, this.map.titleZh), "#ffd23f", { sub: T(this.map.tag, this.map.tagZh), chip: T("ZK PARTY", "ZK 派对"), dock: TITLE - 0.45 - 0.5, size: 86 });
      }
      // ZEE's welcome, line by line from just after the title (A: the next one; past the last: on with it)
      if (human && t > 0.5 && this.pressed("b")) this.cineSkip = true;
      const tapA = human && t > 0.7 && this.pressed("a");
      if (t >= LINE0 && li < lines.length) {
        lt += dt;
        if (li < 0 || lt >= LINE || (tapA && lt > 0.35)) {
          li++;
          lt = 0;
          this.talk = li < lines.length ? { who: "nota", s: T(...lines[li]), t: 0, dur: LINE } : null;
        }
      } else if (tapA && li >= lines.length) stop = true;
      // the shot of the moment
      let k = shots.length - 1;
      while (k > 0 && t < starts[k]) k--;
      const s = shots[k];
      const u = Math.min(1, (t - starts[k]) / s.dur);
      const e = k === 0 ? ez.io3(u) : ez.io(u);
      v.shotEye.lerpVectors(s.e0, s.e1, e);
      v.shotAt.lerpVectors(s.a0, s.a1, e);
      if (k !== cur) {
        cur = k;
        if (k > 0) {
          // a cut: snap there, a flash, its name stamped
          v.cam.set(v.shotEye, v.shotAt);
          c.flash = 0.3;
          sfx.whoosh();
          if (s.name) c.zone(T(...s.name), `${String(k).padStart(2, "0")} / ${String(n).padStart(2, "0")}`, "#ffd23f", s.dur + 0.1);
        }
      }
      if (c.impact) (v.cam.shake(0.6), sting(), sfx.thud());
      return this.cineSkip || stop || (t >= total && li >= lines.length);
    });
    this.talk = null;
    c.stamp = null;
  }

  /** The four off the board (hidden, no ring, no shadow) or back on their spaces. */
  private offStage(off: boolean) {
    const v = this.v;
    for (let i = 0; i < 4; i++) {
      const a = v.av[i];
      a.root.visible = !off;
      if (off) {
        v.hold[i] = a.pos.clone();
        a.floor = null;
      } else if (v.hold[i]) {
        v.hold[i] = null;
        a.floor = v.floorY(this.r.pos[i]);
      }
    }
  }

  /** The opening's end: the bars go, the HUD comes back. */
  private cineEnd() {
    const c = this.cine;
    c.bars = false;
    c.titleOut();
    c.cap = null;
    c.stamp = null;
    c.spot.want = 0;
    for (const p of c.plates) p.t = -1;
    this.offStage(false);
    this.v.lineUp(null);
    // (the HUD once the bars are out)
    this.cineOffAt = this.rt + 0.38;
  }

  /** The Z-Block's reveal: out of the sky, the camera on it all the way down to its first spot, ZEE's word on it. */
  private async qReveal(to: number) {
    const v = this.v;
    const c = this.cine;
    if (this.cineSkip || this.aborted) {
      v.qPlace(to);
      sfx.star();
      return this.cineEnd();
    }
    c.zone(T("THE Z-BLOCK", "Z 方块"), undefined, "#ffd23f", 3.4);
    v.track = () => v.qPos(tmp2);
    v.mode = "track";
    v.zoom = 1.9;
    v.camK = 2.6;
    v.qMove(to, 2.2);
    // (a cut to the sky over its spot, where it shows first)
    const sp = v.spacePos(to, new THREE.Vector3());
    v.cam.set(tmp.set(sp.x, 26 + 8 * 1.9, sp.z + 10.9 * 1.9), tmp2.set(sp.x, 26, sp.z));
    c.flash = 0.3;
    sfx.whoosh();
    const human = this.players.some(isLocal);
    let el = 0;
    await this.until((dt) => (el += dt) >= 2.25 || (human && el > 0.3 && this.pressed("b") && (this.cineSkip = true)));
    if (this.aborted) return;
    if (this.cineSkip) return (v.qPlace(to), this.cineEnd());
    // it lands: a flash, a shake, gold
    c.flash = 0.45;
    v.cam.shake(0.45);
    sfx.thud();
    sfx.star();
    const q = v.qPos(new THREE.Vector3());
    v.fx.burst(q, 60, ["#ffd23f", "#fff3c4", "#ff6b35", "#ffffff"], { speed: 8, up: 6 });
    v.cheerAll();
    v.zoom = 1.15;
    // ZEE on it (A: on; B: skip the rest)
    const say = T(`There it is: the ${this.map.key === "genesis" ? "GENESIS " : ""}Z-BLOCK! Pass it with ${Q_PRICE} coins and it's yours. Then it flies somewhere new.`, `看，那就是${this.map.key === "genesis" ? "创世 " : ""}Z 方块！带着 ${Q_PRICE} 金币经过它就能买下。之后它会飞到新的地方。`);
    const dur = Math.min(4, 1.3 + Array.from(say).length * 0.035);
    this.talk = { who: "nota", s: say, t: 0, dur };
    el = 0;
    await this.until((dt) => (el += dt) >= dur || (human && el > 0.45 && (this.pressed("a") || (this.pressed("b") && (this.cineSkip = true)))));
    this.talk = null;
    if (this.aborted) return;
    if (this.cineSkip) return this.cineEnd();
    await this.entrance();
  }

  /** The four come on: one by one out of the sky onto the start, a pose, a plate each (yours under a spotlight). */
  private async entrance() {
    const v = this.v;
    const c = this.cine;
    const st = this.r.g.start;
    const sp = this.r.g.spaces[st];
    const fy = v.floorY(st);
    const human = this.players.some(isLocal);
    // (the plates take the top of the frame: the words go in the bottom bar)
    c.caption(T("THE PLAYERS", "选手"), T("Four snarks, one board: the most Z-Blocks wins the party!", "四只 snark，一张棋盘：Z 方块最多者赢得派对！"), "#ffd23f", 5);
    // (side by side on the start for the picture: they step back round it after)
    const row = [0, 1, 2, 3].map((i) => new THREE.Vector3(sp.x + (i - 1.5) * 0.9, fy, sp.z + 0.2));
    v.lineUp(row);
    this.shot(tmp.set(sp.x + 1.4, fy + 4.6, sp.z + 11.4), tmp2.set(sp.x, fy + 1.75, sp.z), 30);
    v.cam.set(v.shotEye, v.shotAt);
    c.flash = 0.3;
    sfx.whoosh();
    c.plates = this.players.map((p) => ({ p, x: 0, y: 0, on: false, t: -1 }));
    const landed = [false, false, false, false];
    let t = 0;
    let next = 0;
    await this.until((dt) => {
      if (this.aborted) return true;
      t += dt;
      // (a slow push in all along)
      const k = ez.io(Math.min(1, t / 3.2));
      v.shotEye.set(sp.x + 1.4 - k * 0.8, fy + 4.6 - k * 0.8, sp.z + 11.4 - k * 1.8);
      // the next one drops in
      if (next < 4 && t >= 0.25 + next * 0.42) {
        const a = v.av[next];
        v.hold[next] = null;
        a.root.visible = true;
        a.floor = fy;
        a.pos.set(row[next].x, fy + 11, row[next].z);
        a.grounded = false;
        a.vy = 0;
        sfx.whoosh();
        next++;
      }
      for (let i = 0; i < next; i++) {
        const a = v.av[i];
        if (landed[i] || !a.grounded) continue;
        landed[i] = true;
        v.fx.burst(tmp.copy(a.pos).setY(fy + 0.3), 18, ["#ffffff", "#e9dcc6", this.players[i].color], { speed: 4.5, up: 2.5 });
        sfx.thud();
        if (isLocal(this.players[i])) (sfx.coin(), a.cheer(1.6), this.emo(i, "★", "#ff6b35", 1.2));
        else i % 2 ? a.cheer(1.2) : a.body.wave(1.4);
        c.plates[i].t = 0;
      }
      if (human && t > 0.6 && (this.pressed("a") || this.pressed("b"))) return true;
      return (landed.every(Boolean) && t > 3.4) || t > 6;
    });
    this.cineEnd();
  }

  private async order(rolls: number[], order: number[]) {
    const v = this.v;
    const sp = this.r.g.spaces[this.r.g.start];
    this.shot(tmp.set(sp.x + 0.5, sp.y + 7, sp.z + 9.5), tmp2.set(sp.x, sp.y + 1.8, sp.z), 3);
    await this.host(T("Who goes first? Everyone hits a dice block!", "谁先走？每个人都来击打骰子方块！"), "nota", 1.8);
    for (const seat of [0, 1, 2, 3]) {
      if (this.aborted) return;
      v.walker = seat;
      v.diceUp(seat, 1);
      await this.wait(0.3);
      if (isLocal(this.players[seat])) {
        this.menu = { kind: "hit", seat };
        await new Promise<number>((res) => (this.answer = res));
        this.menu = null;
      } else await this.wait(0.35);
      v.av[seat].jump(10.5);
      await this.wait(0.21);
      v.diceHit(0, rolls[seat]);
      sfx.hit();
      const dp = v.diePos(0, tmp);
      this.bigNum = { s: String(rolls[seat]), t: 0, x: dp.x, y: dp.y + 0.6, z: dp.z, c: this.players[seat].color };
      await this.wait(0.7);
      v.diceDown();
    }
    v.walker = -1;
    this.cardOn = { kind: "order", t: 0, data: order, extra: rolls };
    sfx.fanfare();
    await this.waitA(2.6, 0.8);
    this.cardOn = null;
    const first = order[0];
    await this.host(isLocal(this.players[first]) ? T("You go first! Good luck out there.", "你先走！祝你好运。") : T(`${this.nm(first)} goes first! Let's play!`, `${this.nm(first)} 先走！开始吧！`), "nota", 1.8);
  }

  private async shorShow(seat: number, opts: ShorOut[], out: ShorOut, target: number | undefined, n: number) {
    const v = this.v;
    // (the camera on the victim and THE TRACKER over them)
    const av = v.av[seat];
    v.track = () => tmp2.copy(av.pos).setY(av.pos.y + 3.4);
    v.mode = "track";
    v.zoom = 1.45;
    v.camK = 2.5;
    this.vignetteWant = 1;
    v.shorIn(seat);
    sfx.thud();
    // (audio) THE TRACKER comes down with a thunderclap; the world holds its breath
    sfx.thunder(0.8);
    ambience.swell(0.35, 4);
    v.cam.shake(0.5);
    this.say(T("THE TRACKER!", "追踪者！"), "#ff3d56", T("the chain-analysis bot that links transparent coins", "关联透明币的链上分析机器人"), 2.2, 80);
    this.react(seat, "shock");
    await this.wait(1.2);
    v.shorLaugh = 1.4;
    await this.host(T(...SHOR_QUIPS[Math.floor(Math.random() * SHOR_QUIPS.length)]), "shor", 2.0);
    const tiles: P.Tile[] = opts.map((o) => ({ top: T(...SHOR_TXT[o].n), sub: T(...SHOR_TXT[o].d), c: SHOR_TXT[o].c, q: o === "qblock", coin: o === "crack" || o === "harvest" || o === "charity" || o === "mercy" }));
    await this.spin(T("TRACKER'S ROULETTE", "追踪者轮盘"), tiles, opts.indexOf(out), "#7a3cc8", 2.6);
    v.shorLaugh = 2;
    const human = isLocal(this.players[seat]);
    if (human) music.sting("lose");
    else sfx.sad();
    sfx.aww(0.7);
    const txt = SHOR_TXT[out];
    this.say(T(...txt.n) + "!", txt.c, out === "charity" && target !== undefined ? T(`10 coins to ${this.nm(target)}`, `给 ${this.nm(target)} 10 金币`) : T(...txt.d), 2.2, 56);
    await this.wait(0.5);
    this.roul = null;
    if (out !== "swap") v.shorZap(seat);
    if (out === "crack" || out === "harvest" || out === "mercy") (n && this.pop(seat, -n), this.react(seat, "sad"));
    else if (out === "charity" && target !== undefined) {
      this.pop(seat, -n);
      this.react(seat, "sad");
      await this.wait(0.7);
      this.pop(target, n);
      this.react(target, "happy");
    } else if (out === "decohere") (this.flash[seat] = 1.2, this.react(seat, "sad"), this.emo(seat, T("MY ITEMS!", "我的道具！"), "#ff3d56"));
    else if (out === "qblock") (this.flash[seat] = 1.5, this.pop(seat, 0, T("−1 Z-BLOCK", "−1 Z 方块"), "#ffd23f"), this.react(seat, "sad"));
    await this.wait(1.3);
  }

  private async duelShow(seat: number, rival: number, stake: number, stakes: number[]) {
    this.follow(seat, 1.1);
    this.say(T("HASH DUEL!", "哈希对决！"), "#ff4fa8", T(`${this.nm(seat)} vs ${this.nm(rival)}`, `${this.nm(seat)} 对 ${this.nm(rival)}`), 1.8, 64);
    sfx.fanfare();
    this.duel = { seat, rival, stake: 0, ra: 0, rb: 0, t: 0, shown: false, done: false };
    this.react(rival, "shock");
    await this.wait(1.0);
    const tiles: P.Tile[] = stakes.map((s) => ({ top: T(`${s} COINS`, `${s} 金币`), c: "#ff4fa8", coin: true }));
    this.duel.shown = true;
    await this.spin(T("THE STAKE", "赌注"), tiles, stakes.indexOf(stake), "#ff4fa8", 1.6);
    this.duel.stake = stake;
    await this.wait(0.7);
    this.roul = null;
  }

  private async duelRoll(seat: number, rival: number, ra: number, rb: number, n: number) {
    const d = this.duel;
    if (!d) return;
    d.t = 0;
    sfx.hit();
    await this.wait(1.0);
    d.ra = ra;
    sfx.hit();
    await this.wait(0.6);
    d.rb = rb;
    sfx.hit();
    d.done = true;
    await this.wait(0.5);
    const win = ra > rb ? seat : rival;
    const lose = win === seat ? rival : seat;
    this.say(isLocal(this.players[win]) ? T("YOU WIN THE DUEL!", "你赢了对决！") : T(`${this.NM(win)} WINS!`, `${this.NM(win)} 获胜！`), this.players[win].color, T(`+${n} coins`, `+${n} 金币`), 1.8, 56);
    if (n) (this.pop(win, n), this.pop(lose, -n));
    this.react(win, "big");
    this.react(lose, "sad");
    sfx.coin();
    await this.waitA(1.8, 0.6);
    this.duel = null;
  }

  private async metroShow(seat: number, from: number, to: number) {
    const v = this.v;
    const line = this.map.metro?.name ?? "METRO";
    const dest = this.r.g.spaces[to].station ?? "";
    this.say(line + "!", "#ff6b35", T(`all aboard: next stop ${dest}`, `请上车：下一站 ${dest}`), 2.2, 60);
    sfx.whoosh();
    sfx.chime();
    if (!v.trainHas()) {
      v.move(seat, to, "warp", 1.4);
      await this.wait(1.5);
      return;
    }
    v.track = () => v.roof(tmp2);
    v.mode = "track";
    v.zoom = 1.6;
    v.camK = 3;
    const d1 = v.trainTo(from, 30);
    await this.wait(d1 + 0.2);
    v.parked = true;
    v.flyTo(seat, v.roof(new THREE.Vector3()), 0.8, 2.5);
    this.emo(seat, "♪", "#ff6b35", 1);
    await this.wait(0.85);
    v.rider = seat;
    sfx.go();
    const d2 = v.trainTo(to, 24);
    await this.wait(d2 + 0.2);
    v.rider = -1;
    v.move(seat, to, "fly", 0.9, 2.5);
    this.follow(seat, 1.1, 4);
    await this.wait(1.0);
    v.parked = false;
    this.react(seat, "happy");
    await this.wait(0.4);
  }

  private async bridgeShow(up: boolean, knocked: number[], to: number, auto: boolean) {
    const v = this.v;
    const b = this.map.drawbridge;
    if (!b) return;
    const mid = tmp2.set(b.x, 0, (b.z0 + b.z1) / 2);
    this.shot(tmp.set(mid.x + 15, 11, mid.z + 13), mid, 2.6);
    if (auto) await this.host(up ? T("Every third turn the SAPLING BRIDGE swings. Up it goes: the long way round by the harbor!", "每三回合树苗吊桥都会摆动。吊起来了：只能绕道港口！") : T("Every third turn the SAPLING BRIDGE swings. Down it comes: the short way is open!", "每三回合树苗吊桥都会摆动。放下来了：近路开通！"), "nota", 2.4);
    else await this.wait(0.7);
    v.bridgeTo(up);
    sfx.thud();
    v.cam.shake(0.4);
    this.say(up ? T("THE BRIDGE RISES!", "吊桥升起！") : T("THE BRIDGE IS DOWN!", "吊桥放下！"), "#c4b1fc", up ? T("closed: go round by the harbor", "关闭：请绕道港口") : T("open: the short way north", "开通：北上近路"), 2, 54);
    await this.wait(1.3);
    for (const k of knocked) {
      v.move(k, to, "fly", 1.4, 7);
      this.react(k, "shock");
      this.emo(k, "WAAAH!", "#ff3d56", 1.6);
    }
    if (knocked.length) {
      sfx.whoosh();
      this.say(T("LAUNCHED!", "被弹飞了！"), "#ff3d56", undefined, 1.4, 50, H * 0.42);
      await this.wait(1.6);
    }
    await this.wait(0.4);
    if (this.cur >= 0) this.follow(this.cur);
  }

  private async wheelShow(seat: number, out: WheelOut) {
    const v = this.v;
    const wp = v.wheelPos(new THREE.Vector3());
    const f = v.wheelFacing();
    this.shot(tmp.set(wp.x + Math.sin(f) * 12.5, wp.y + 2.6, wp.z + Math.cos(f) * 12.5), tmp2.copy(wp).setY(wp.y - 0.6), 3);
    this.say(T("HASH WHEEL!", "哈希转盘！"), "#ff6b35", T("a spin for the whole board", "全场都受影响的一转"), 1.8, 60);
    sfx.fanfare();
    await this.wait(0.9);
    const dur = v.wheelTo(WHEEL.indexOf(out), 3.2);
    await this.wait(dur + 0.2);
    sfx.star();
    const t = WHEEL_TXT[out];
    this.say(T(...t.n), "#ffd23f", T(...t.d), 2, 58);
    await this.wait(1.4);
    this.follow(seat);
  }

  // ---- NU7 QUARTER: the NU7 TOWER LIFT, the ICE RUN, the BLIZZARD -----------------------------------

  /** A step onto, along or off the ice run: a long slide (a jump down onto it, a scramble up off it). */
  private async slideStep(seat: number, from: number, to: number, left: number) {
    const v = this.v;
    const a = this.r.g.spaces[from],
      b = this.r.g.spaces[to];
    const onto = !a.ice && b.ice,
      off = a.ice && !b.ice;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const dur = onto || off ? 0.55 : Math.max(0.45, d / 13);
    v.walker = seat;
    v.move(seat, to, onto || off ? "hop" : "zip", dur, onto || off ? 1.3 : 0.04);
    this.steps = { seat, n: left, t: 0 };
    this.follow(seat, onto ? 1.25 : 1.1, onto ? 3 : 6);
    if (onto) this.emo(seat, "WHEE!", "#3ec6ff", 1.8);
    sfx.whoosh();
    v.fx.burst(tmp.set(a.x, a.y + 0.4, a.z), 16, ["#ffffff", "#cfefff", "#9fd8ff"], { speed: 4, up: 2, size: 0.14 });
    await this.wait(dur);
    if (off) v.cheer(b.x, b.z, 8, 0.5);
  }

  /** The ice run holds (one more crack, the next one's risk told) or gives way: a splash, a cold bath, hauled out. */
  private async iceShow(seat: number, out: "crack" | "break", cracks: number, at: number, back: number, n: number) {
    const v = this.v;
    const p = v.spacePos(at, new THREE.Vector3());
    if (out === "crack") {
      sfx.hit();
      sfx.crack(0.6 + cracks * 0.15);
      v.cam.shake(0.12 + cracks * 0.08);
      v.fx.burst(tmp.copy(p).setY(p.y + 0.3), 18 + cracks * 8, ["#ffffff", "#cfefff"], { speed: 3, up: 1.5, size: 0.12 });
      const risk = Math.round(ICE_ODDS[Math.min(cracks, ICE_ODDS.length - 1)] * 100);
      this.say(T(`ICE RUN · CRACK ×${cracks}`, `冰道 · 冰裂 ×${cracks}`), "#7fd8ff", T(`slide on! the next slider: ${risk}% it gives way`, `滑过去！下一个滑行者：${risk}% 会掉下去`), 1.6, 44, H * 0.24);
      this.emo(seat, "!", "#3ec6ff", 0.9);
      await this.wait(0.7);
      return;
    }
    this.follow(seat, 0.9, 4);
    sfx.thud();
    sfx.hit();
    sfx.crack(1.2);
    setTimeout(() => !this.gone && (sfx.splash(), sfx.aww(0.6)), 420);
    v.cam.shake(0.6);
    this.say(T("THE ICE BREAKS!", "冰面破裂！"), "#3ec6ff", T(`a cold bath: −${n} coins`, `冰水浴：−${n} 金币`), 2.2, 60);
    v.flyTo(seat, tmp.copy(p).setY(p.y - 2.2), 0.45, 0.6);
    for (let k = 0; k < 3; k++) setTimeout(() => !this.gone && v.fx.burst(new THREE.Vector3(p.x, p.y + 0.4, p.z), 40, ["#ffffff", "#9fd8ff", "#3e8fd0"], { speed: 7, up: 7 }), 300 + k * 160);
    this.react(seat, "shock");
    this.emo(seat, "BRRR!", "#3ec6ff", 2.2);
    await this.wait(1.3);
    this.pop(seat, -n);
    sfx.lose();
    v.move(seat, back, "fly", 1.2, 3.5);
    await this.wait(1.3);
    this.react(seat, "sad");
    await this.host(T(`The ice run is closed: it refreezes in ${ICE_THAW} turns, or in a BLIZZARD.`, `冰道关闭：${ICE_THAW} 回合后重新冻结，或者遇到暴风雪。`), "nota", 2.2);
  }

  /** The ice run refreezes, its cracks gone. */
  private async freezeShow(why: "thaw" | "buran") {
    const v = this.v;
    const run = this.r.g.ice;
    if (!run.length) return;
    const a = this.r.g.spaces[run[0]],
      b = this.r.g.spaces[run[run.length - 1]];
    const mid = new THREE.Vector3((a.x + b.x) / 2, a.y, (a.z + b.z) / 2);
    this.shot(tmp.set(mid.x - 4, 17, mid.z + 21), mid, 2.6);
    await this.wait(0.6);
    for (const i of run) {
      const s = this.r.g.spaces[i];
      v.fx.burst(tmp.set(s.x, s.y + 0.4, s.z), 22, ["#ffffff", "#cfefff", "#7fd8ff"], { speed: 3, up: 3, size: 0.16 });
    }
    sfx.star();
    this.say(T("THE ICE REFREEZES!", "冰面重新冻结！"), "#7fd8ff", why === "buran" ? T("the blizzard's frost: no more cracks", "暴风雪的严寒：裂缝消失") : T("the ice run is open again", "冰道重新开放"), 2, 54);
    await this.wait(1.6);
    if (this.cur >= 0) this.follow(this.cur);
  }

  /** The NU7 TOWER LIFT: to its door, up the glass shaft with the cabin, out on top of the golden crown. */
  private async liftUpShow(seat: number) {
    const v = this.v;
    const L = this.map.lift;
    if (!L) return;
    this.say(T("NU7 TOWER LIFT!", "NU7 塔观景电梯！"), "#ffd23f", T("up to the golden crown", "直上金色塔冠"), 2.0, 58);
    sfx.go();
    v.flyTo(seat, tmp.set(L.x, 1.2, L.z + 1.6), 0.7, 1.1);
    this.follow(seat, 1.1, 3);
    await this.wait(0.75);
    const p = v.av[seat].pos;
    v.track = () => tmp2.copy(p).setY(p.y + 1);
    v.mode = "track";
    v.zoom = 1.7;
    v.camK = 3.2;
    sfx.whoosh();
    v.flyTo(seat, tmp.set(L.x, L.top - 3.45, L.z + 1.6), 2.7, 0);
    await this.wait(2.75);
    // out on top of the crown, the whole city below
    const top = new THREE.Vector3(L.x, L.top + 2.45, L.z);
    v.flyTo(seat, top, 0.7, 1.4);
    v.hold[seat] = top;
    await this.wait(0.75);
    this.react(seat, "happy");
    this.emo(seat, "WOW!", "#ffd23f", 1.6);
    sfx.star();
    this.shot(tmp.set(L.x + 9, L.top + 7, L.z + 20), tmp2.set(L.x, L.top - 3, L.z - 4), 2.6);
    await this.wait(1.0);
  }

  /** A drop zone's name (en, zh). */
  private dropName(space: number): [string, string] {
    const i = this.r.g.liftTo.indexOf(space);
    return this.map.lift?.drops[i]?.n ?? ["?", "?"];
  }

  /** Down from the crown on a kite-wing to the drop zone picked. */
  private async liftShow(seat: number, to: number) {
    const v = this.v;
    v.hold[seat] = null;
    const [en, zh] = this.dropName(to);
    this.say(T(`GLIDE TO ${en}!`, `滑翔到${zh}！`), "#00afca", undefined, 2, 50);
    sfx.whoosh();
    v.at[seat] = to;
    const p = v.av[seat].pos;
    v.track = () => tmp2.copy(p);
    v.mode = "track";
    v.zoom = 1.45;
    v.camK = 2.6;
    v.flyTo(seat, v.spacePos(to, new THREE.Vector3()).setY(v.floorY(to)), LIFT_GLIDE, 2.5);
    this.emo(seat, "♪", "#00afca", 2);
    await this.wait(LIFT_GLIDE + 0.1);
    const s = this.r.g.spaces[to];
    v.cheer(s.x, s.z, 8, 0.7);
    this.follow(seat, 1.1, 4);
    this.react(seat, "happy");
    await this.wait(0.5);
  }

  /** A BLIZZARD: the whiteout rolls in off the plains, the rivals are blown back. */
  private async buranShow(seat: number, moves: [number, number, number][]) {
    const v = this.v;
    // (over the one who called it and the three it blows back)
    const c = v.spacePos(this.r.pos[seat], new THREE.Vector3());
    for (const [, from] of moves) c.add(v.spacePos(from, tmp));
    c.multiplyScalar(1 / (moves.length + 1));
    this.shot(tmp.set(c.x, 24, c.z + 27), tmp2.set(c.x, 0, c.z - 2), 2.2);
    this.say(T("BLIZZARD!", "暴风雪！"), "#eef4ff", T("the blizzard blows the others back", "暴风雪把其他人都吹回去了"), 2.4, 72);
    sfx.whoosh();
    sfx.gust(1.2);
    ambience.swell(2, 4);
    setTimeout(() => !this.gone && sfx.whoosh(), 260);
    v.cam.shake(0.5);
    await this.wait(1.4);
    for (const [s, , to] of moves) {
      v.move(s, to, "fly", 1.1, 2.2);
      this.react(s, "shock");
      this.emo(s, "WAAAH!", "#7fd8ff", 1.4);
      sfx.whoosh();
      await this.wait(0.35);
    }
    await this.wait(1.0);
    for (const [s] of moves) this.react(s, "sad");
    this.react(seat, "happy");
    if (this.cur >= 0) this.follow(this.cur);
    await this.wait(0.4);
  }

  // ---- MARINA NIGHTS: the SKY WHEEL, the MONSOON ------------------------------------------------------

  /** The sky wheel: into the lowest cabin, up round the wheel, then off at the top and down the searchlight to this turn's stop. */
  private async rideShow(seat: number, to: number, stop: number) {
    const v = this.v;
    const R = this.map.ride;
    if (!R) return;
    const [en, zh] = R.stops[stop]?.n ?? ["?", "?"];
    const hub = SG.hub(new THREE.Vector3());
    this.shot(tmp.set(hub.x - 13, hub.y - 1, hub.z + 15), tmp2.set(hub.x, hub.y - 1.5, hub.z), 2.6);
    this.say(T("SKY WHEEL!", "摩天轮！"), "#ff3fd0", T(`this turn it sets you down at ${en}`, `本回合下车点：${zh}`), 2.2, 62);
    sfx.fanfare();
    const cab = SG.lowest();
    const spot = SG.rider(cab);
    v.flyTo(seat, spot, 0.8, 1.6);
    this.emo(seat, "♪", "#ff3fd0", 1.2);
    await this.wait(0.85);
    v.hold[seat] = spot;
    SG.spin(0.8);
    v.track = () => tmp2.copy(spot).setY(spot.y + 0.6);
    v.mode = "track";
    v.zoom = 1.75;
    v.camK = 2.4;
    sfx.go();
    // (round to the top)
    let el = 0;
    await this.until((dt) => (el += dt) > 6 || SG.height(cab) > SG.top() - 0.4);
    SG.spin(0.09);
    this.react(seat, "happy");
    this.emo(seat, "WOW!", "#3ef0ff", 1.4);
    const s = this.r.g.spaces[to];
    this.shot(tmp.set((hub.x + s.x) / 2 - 8, 26, (hub.z + s.z) / 2 + 26), tmp2.set((hub.x + s.x) / 2, 4, (hub.z + s.z) / 2), 2.2);
    this.say(T(`NEXT STOP: ${en}!`, `下一站：${zh}！`), "#3ef0ff", undefined, 2.2, 50);
    await this.wait(0.9);
    // off with an umbrella, down along the beam
    v.hold[seat] = null;
    v.at[seat] = to;
    sfx.whoosh();
    const p = v.av[seat].pos;
    v.track = () => tmp2.copy(p);
    v.mode = "track";
    v.zoom = 1.6;
    v.camK = 2.4;
    v.flyTo(seat, v.spacePos(to, new THREE.Vector3()).setY(v.floorY(to)), 3.2, 5);
    await this.wait(3.3);
    v.cheer(s.x, s.z, 9, 0.8);
    v.fx.burst(tmp.set(s.x, v.floorY(to) + 0.3, s.z), 40, ["#ff3fd0", "#3ef0ff", "#ffffff"], { speed: 6, up: 4 });
    this.follow(seat, 1.1, 4);
    sfx.star();
    await this.wait(0.6);
  }

  /** A MONSOON breaks: rain, lightning, the low promenade floods; who stood on it is soaked (the caller collects). */
  private async stormShow(seat: number, deltas: number[]) {
    const v = this.v;
    this.shot(tmp.set(4, 50, 46), tmp2.set(4, 0, -4), 2.0);
    SG.storm(true);
    SG.flash();
    sfx.thud();
    sfx.thunder();
    // (audio) the monsoon: the night turns to a downpour until the bay recedes
    ambience.play("storm", 1.5);
    v.cam.shake(0.5);
    this.say(T("MONSOON!", "季风暴雨！"), "#9fb2ff", T("the bay floods the low promenade for two turns", "海湾淹没低处步道两回合"), 2.6, 76);
    await this.wait(1.8);
    SG.flash();
    sfx.thud();
    const caller = isLocal(this.players[seat]) ? T("You", "你") : this.nm(seat);
    await this.host(T(`${caller} called the monsoon! Land on a flooded space and you pay ${isLocal(this.players[seat]) ? "you" : this.nm(seat)} ${SOAK} coins.`, `${caller}召来了季风！停在被淹的格子上，就要付给${isLocal(this.players[seat]) ? "你" : this.nm(seat)} ${SOAK} 金币。`), "nota", 2.6);
    if (deltas.some((d) => d)) {
      deltas.forEach((d, i) => {
        if (!d) return;
        this.pop(i, d);
        if (d < 0) (this.react(i, "sad"), this.emo(i, T("SOAKED!", "湿透了！"), "#3ec6ff", 1.4));
        else this.react(i, "happy");
      });
      sfx.lose();
      await this.wait(1.4);
    }
    if (this.cur >= 0) this.follow(this.cur);
  }

  private async recedeShow() {
    this.shot(tmp.set(4, 50, 46), tmp2.set(4, 0, -4), 2.0);
    SG.storm(false);
    ambience.play(this.map.ambience ?? "sea", 3);
    this.say(T("THE FLOOD GOES DOWN", "洪水退去"), "#bfe6ff", T("the monsoon has passed", "季风过去了"), 2.0, 50);
    sfx.star();
    await this.wait(1.6);
  }

  /** Landed on a flooded space: a splash, the coins to the monsoon's caller. */
  private async soakedShow(seat: number, n: number, space: number, to: number) {
    const v = this.v;
    const p = v.spacePos(space, new THREE.Vector3());
    v.fx.burst(p.setY(v.floorY(space) + 0.2), 50, ["#ffffff", "#bfe6ff", "#3e8fd0"], { speed: 6, up: 6 });
    sfx.thud();
    v.cam.shake(0.25);
    sfx.splash();
    this.say(T("SOAKED!", "湿透了！"), "#3ec6ff", to >= 0 && to !== seat ? T(`−${n} coins to ${this.nm(to)}`, `−${n} 金币给 ${this.nm(to)}`) : T(`−${n} coins`, `−${n} 金币`), 1.6, 56, H * 0.26);
    this.pop(seat, -n);
    this.react(seat, "sad");
    await this.wait(0.8);
    if (to >= 0 && to !== seat && n) (this.pop(to, n), this.react(to, "happy"), sfx.coin());
    await this.wait(0.5);
  }

  private async last5Show(st: number[]) {
    this.last5 = true;
    music.stage(2);
    const lead = st[0];
    this.follow(lead, 1.5, 2);
    this.say(T("LAST 5 TURNS!", "最后 5 回合！"), "#ff5fa2", undefined, 2.6, 78);
    sfx.fanfare();
    this.v.cam.shake(0.3);
    await this.wait(1.6);
    await this.host(T("Only five turns left! Here's how it stands…", "只剩五回合了！来看看目前的排名……"), "nota", 2.2);
    this.cardOn = { kind: "standings", t: 0, data: st };
    await this.waitA(3.2, 0.8);
    this.cardOn = null;
    await this.host(T("And to shake things up… a twist!", "为了让比赛更刺激……来个变化！"), "nota", 1.8);
  }

  private async twistShow(tw: Twist, opts: Twist[]) {
    const tiles: P.Tile[] = opts.map((o) => ({ top: T(...TWIST_TXT[o].n), c: TWIST_TXT[o].c, item: o === "catchup" ? "triple" : undefined, coin: o === "double" }));
    await this.spin(T("THE TWIST", "变化"), tiles, opts.indexOf(tw), "#ff5fa2", 2.4);
    await this.wait(0.5);
    this.roul = null;
    const t = TWIST_TXT[tw];
    this.say(T(...t.n) + "!", t.c, undefined, 2.2, 60);
    if (tw === "shorstorm") {
      this.v.buildSpaces();
      for (const s of this.r.g.spaces) if (s.kind === "shor") this.v.fx.burst(tmp.set(s.x, 0.6, s.z), 16, ["#7a3cc8", "#ff3d56", "#ffffff"], { speed: 5, up: 4 });
      sfx.thud();
      this.v.cam.shake(0.4);
      this.shot(tmp.set(4, 70, 52), tmp2.set(4, 0, -8), 2.5);
      await this.wait(1.6);
    }
    await this.host(T(...t.d), "nota", 2.4);
  }

  private async overShow() {
    this.cur = -1;
    this.v.walker = -1;
    this.say(T("GAME OVER!", "游戏结束！"), "#ffffff", undefined, 2.4, 80);
    sfx.fanfare();
    this.shot(tmp.set(4, 70, 52), tmp2.set(4, 0, -8), 1.6);
    await this.wait(2.0);
    // everyone to the ceremony's stage (the MEMPOOL plaza, the hash wheel behind them)
    const st = this.map.stage ?? { x: 0, z: 10 };
    const c = new THREE.Vector3(st.x, 0, st.z);
    this.v.lineUp([0, 1, 2, 3].map((i) => c.clone().add(tmp2.set((i - 1.5) * 2.1, 0, 0))));
    this.v.qHidden = true;
    this.v.parkTrain();
    this.shot(tmp.copy(c).add(tmp2.set(0, 4.2, 10.5)), tmp2.copy(c).setY(2.0), 3);
    this.v.cam.set(this.v.shotEye, this.v.shotAt);
    await this.host(T("That was the last turn! Before the results… the bonus Z-Blocks!", "最后一回合结束！公布结果之前……先颁发奖励 Z 方块！"), "nota", 2.6);
  }

  private async bonusShow(key: BonusKey, vals: number[], winners: number[], k: number) {
    this.cardOn = { kind: "bonus", t: 0, data: vals, key, winners, extra: [k] };
    sfx.star();
    await this.wait(1.6);
    if (winners.length) {
      sfx.fanfare();
      for (const w of winners) {
        this.react(w, "big");
        this.flash[w] = 1.5;
        this.v.fx.burst(this.v.head(w, 2.5, tmp), 60, ["#ffd23f", "#fff3c4", BONUS_TXT[key].c], { speed: 8, up: 6 });
      }
      for (const i of [0, 1, 2, 3]) if (!winners.includes(i)) this.v.av[i].hit();
    }
    await this.waitA(2.6, 1.0);
    this.cardOn = null;
  }

  private async finalShow(order: number[]) {
    const w = order[0];
    this.say(T("AND THE WINNER IS…", "冠军是……"), "#ffffff", undefined, 2.4, 56);
    for (let k = 0; k < 14; k++) setTimeout(() => !this.gone && sfx.tick(), k * 110);
    await this.wait(2.0);
    const a = this.v.av[w];
    this.shot(tmp.copy(a.pos).add(tmp2.set(0, 3.0, 7.2)), tmp2.copy(a.pos).setY(1.9), 3);
    this.say(isLocal(this.players[w]) ? T("YOU!", "你！") : this.NM(w), this.players[w].color, T(`${this.r.blocks[w]} Z-Blocks · ${this.r.coins[w]} coins`, `${this.r.blocks[w]} 个 Z 方块 · ${this.r.coins[w]} 金币`), 3, 84);
    sfx.fanfare();
    sfx.cheer(1);
    ambience.swell(1.8, 3);
    this.react(w, "big");
    for (let k = 0; k < 4; k++) setTimeout(() => !this.gone && this.v.fx.burst(tmp.copy(a.pos).setY(3), 70, ["#ffd23f", "#ff6b35", "#c4b1fc", "#3ec6ff", "#ffffff"], { speed: 9, up: 8 }), k * 300);
    await this.waitA(3.0, 1.2);
    if (this.aborted) return;
    const prizes = order.map((seat, place) => [this.opts.prizes?.[place], T(`${this.r.blocks[seat]} Z · ${this.r.coins[seat]} coins`, `${this.r.blocks[seat]} Z · ${this.r.coins[seat]} 金币`)].filter(Boolean).join(" · "));
    await showPodium(this.stage, this.players, order, { prizes, label: T(`${this.map.title} · ${this.turns} TURNS`, `${this.map.titleZh} · ${this.turns} 回合`) });
  }

  // ---- the mini-game ---------------------------------------------------------------------------------

  private async mini(turn: number): Promise<{ order: number[]; teams?: boolean } | null> {
    this.cur = -1;
    this.v.walker = -1;
    this.steps = null;
    const def = this.games[(turn - 1) % this.games.length];
    this.say(T("MINI-GAME!", "小游戏！"), "#ff5fa2", undefined, 1.5, 76);
    sfx.star();
    this.shot(tmp.set(4, 74, 56), tmp2.set(4, 0, -8), 1.6);
    await this.wait(1.4);
    if (this.aborted) return null;
    if (this.lab.skipMini) {
      const sc = this.players.map((p) => (p.human ? 0.6 : p.skill) + this.rnd());
      return { order: [0, 1, 2, 3].sort((a, b) => sc[b] - sc[a]) };
    }
    const ok = await miniRoulette(this.stage, GAMES, def, turn, this.turns, T("MINI-GAME!", "小游戏！"), T(`Turn ${turn} / ${this.turns} · drawing the mini-game…`, `第 ${turn} / ${this.turns} 回合 · 抽取小游戏…`));
    if (!ok || this.aborted) return null;
    await this.hooks.beforeMini?.(def, turn);
    if (this.aborted) return null;
    // (online: the k-th mini-game in lockstep on its own channel of the room's relay)
    const k = turn - 1;
    const net = this.opts.net ? { transport: this.opts.net.mini(k), seed: this.opts.net.miniSeed(k), humans: this.opts.net.humans, local: [this.opts.net.me] } : undefined;
    const res = await playMini(this.stage, def, this.players, this.rnd, {
      net,
      note: def.teams
        ? T(`Turn ${turn} of ${this.turns} · the winning pair +10 coins each`, `第 ${turn}/${this.turns} 回合 · 获胜的一队每人 +10 金币`)
        : T(`Turn ${turn} of ${this.turns} · 1st +10 coins, 2nd +5, 3rd +2`, `第 ${turn}/${this.turns} 回合 · 第一 +10 金币，第二 +5，第三 +2`),
      prizes: (def.teams ? ["+10", "+10", "", ""] : ["+10", "+5", "+2", ""]).map((s) => (s ? T(`${s} coins`, `${s} 金币`) : "")),
      block: this.opts.block,
    });
    if (!res || this.aborted) return null;
    this.hooks.afterMini?.(def, res);
    this.stage.show(this, padOf(), false);
    if (music.playing !== "board") music.play("board");
    ambience.play(this.r.flood > 0 ? "storm" : (this.map.ambience ?? "sea"), 2);
    if (this.last5) music.stage(2);
    this.shot(tmp.set(4, 74, 56), tmp2.set(4, 0, -8), 2);
    this.v.cam.set(this.v.shotEye, this.v.shotAt);
    return { order: res, teams: def.teams };
  }

  // ---- the human's choices -------------------------------------------------------------------------

  /** Online: the questions asked so far (the n-th is the same question on every page). */
  private asked = 0;
  private ask(q: Ask): Promise<number> {
    if (this.aborted) return Promise.resolve(0);
    const net = this.opts.net;
    if (net) {
      // a person's seat: asked on their own page (relayed from there), waited for everywhere else
      const n = this.asked++;
      if (q.seat !== net.me) {
        this.follow(q.seat, 0.95);
        this.say(T(`${this.NM(q.seat)}'s move…`, `等待 ${this.NM(q.seat)}…`), this.players[q.seat].color, undefined, 1.4, 52);
      }
      return net.answer(n, q.seat, () => this.askHere(q));
    }
    return this.askHere(q);
  }
  /** This page's player answers (the menus, the arrows, the dice). */
  private askHere(q: Ask): Promise<number> {
    if (this.aborted) return Promise.resolve(0);
    const v = this.v;
    const seat = q.seat;
    switch (q.q) {
      case "menu":
        v.diceUp(seat, 1);
        this.follow(seat, 0.82);
        this.menu = { kind: "main", seat };
        break;
      case "hit":
        this.menu = { kind: "hit", seat };
        break;
      case "branch": {
        const opts = q.opts.map((o) => ({ to: o.to, path: o.path, toll: o.toll, zip: o.zip }));
        // (the arrow toward the Z-Block picked first)
        let sel = 0;
        opts.forEach((o, i) => this.r.dist(o.to, this.r.qAt) < this.r.dist(opts[sel].to, this.r.qAt) && (sel = i));
        this.menu = { kind: "branch", seat, from: this.r.pos[seat], opts, sel };
        this.follow(seat, 1.25, 3);
        v.showArrows(this.r.pos[seat], opts.map((o) => o.to), sel, this.players[seat].color);
        break;
      }
      case "buyQ":
        this.follow(seat, 0.85);
        this.menu = { kind: "yesno", title: T("GENESIS Z-BLOCK", "创世 Z 方块"), sub: T(`Buy it for ${q.price} coins?`, `花 ${q.price} 金币买下？`), yes: T("Buy it!", "买！"), no: T("Not now", "不买"), q: true };
        break;
      case "rideIn": {
        const n = this.map.ride?.stops[q.stop]?.n ?? ["?", "?"];
        this.follow(seat, 1.1);
        this.menu = { kind: "yesno", title: T("SKY WHEEL", "摩天轮"), sub: T(`Ride it now? It sets you down at ${n[0]} (your walk ends there).`, `现在乘坐？下车点：${n[1]}（步数到此结束）。`), yes: T("Ride!", "坐！"), no: T("Walk on", "继续走") };
        break;
      }
      case "shopIn":
        this.menu = { kind: "yesno", title: this.shopOf(this.r.pos[seat]), sub: T("A shop on your way. Have a look?", "路过一家商店。进去看看？"), yes: T("Let's see", "看看"), no: T("Walk on", "继续走") };
        break;
      case "shop":
        this.shopName = this.shopOf(this.r.pos[seat]);
        this.menu = { kind: "shop", seat, offer: q.offer, sel: Math.max(0, q.offer.findIndex((k) => ITEMS[k].price <= this.r.coins[seat])) };
        break;
      case "target":
        this.menu = { kind: "target", seat, why: q.why, opts: q.opts, sel: 0 };
        break;
      case "nonce": {
        const d = this.r.toQ(seat);
        this.menu = { kind: "nonce", seat, v: d >= 1 && d <= 10 ? d : 5 };
        break;
      }
      case "station":
        this.menu = { kind: "station", seat, opts: q.opts, sel: 0, why: q.why };
        this.menuMoved();
        break;
    }
    this.menuT = 0;
    if (LAB) this.labEvs.push(`ask:${q.q}`);
    return new Promise((res) => (this.answer = res));
  }

  private reply(n: number) {
    const a = this.answer;
    this.answer = null;
    const m = this.menu;
    this.menu = null;
    if (m?.kind === "branch") this.v.showArrows(0, null);
    if (m?.kind === "station" || m?.kind === "main") this.follow(this.cur >= 0 ? this.cur : 0, m.kind === "main" ? 0.82 : 1);
    this.input?.clear();
    a?.(n);
  }

  /** The camera follows what the menu points at (a station). */
  private menuMoved() {
    const m = this.menu;
    if (m?.kind === "station") {
      const s = this.r.g.spaces[m.opts[m.sel]];
      this.shot(tmp.set(s.x, 13, s.z + 15), tmp2.set(s.x, 1, s.z), 3);
    } else if (m?.kind === "branch") this.v.showArrows(m.from, m.opts.map((o) => o.to), m.sel, this.players[m.seat].color);
  }

  private menuInput() {
    const m = this.menu!;
    if (this.menuT < 0.15) return;
    const L = this.pressed("left") || this.pressed("up");
    const R = this.pressed("right") || this.pressed("down");
    const A = this.pressed("a");
    const B = this.pressed("b");
    const cycle = (sel: number, n: number) => {
      if (L || R) {
        sfx.blip(2);
        return (sel + (R ? 1 : -1) + n) % n;
      }
      return sel;
    };
    switch (m.kind) {
      case "hit":
        if (A) this.reply(0);
        return;
      case "next":
        if (A) this.reply(0);
        return;
      case "main":
        if (A) (sfx.blip(4), this.reply(-1));
        else if (B) {
          sfx.blip(3);
          this.menu = { kind: "items", seat: m.seat, sel: 0 };
          this.menuT = 0;
        }
        return;
      case "items": {
        const it = this.r.items[m.seat];
        if (B || !it.length) {
          if (B) sfx.blip(1);
          if (B || A) ((this.menu = { kind: "main", seat: m.seat }), (this.menuT = 0));
          return;
        }
        m.sel = cycle(m.sel, it.length);
        if (A) (sfx.blip(5), this.v.diceDown(), this.reply(m.sel));
        return;
      }
      case "branch": {
        const was = m.sel;
        m.sel = cycle(m.sel, m.opts.length);
        if (was !== m.sel) this.menuMoved();
        if (A) (sfx.blip(4), this.reply(m.sel));
        return;
      }
      case "yesno":
        if (A) (sfx.blip(4), this.reply(1));
        else if (B) (sfx.blip(1), this.reply(0));
        return;
      case "shop": {
        m.sel = cycle(m.sel, m.offer.length);
        if (A) {
          if (ITEMS[m.offer[m.sel]].price <= this.r.coins[m.seat]) (sfx.blip(5), this.reply(m.sel));
          else sfx.lose();
        } else if (B) (sfx.blip(1), this.reply(-1));
        return;
      }
      case "target":
        m.sel = cycle(m.sel, m.opts.length);
        if (A) (sfx.blip(4), this.reply(m.opts[m.sel]));
        return;
      case "nonce":
        if (L || R) ((m.v = ((m.v - 1 + (R ? 1 : -1) + 10) % 10) + 1), sfx.blip(m.v % 5));
        if (A) (sfx.blip(5), this.reply(m.v));
        return;
      case "station": {
        const was = m.sel;
        m.sel = cycle(m.sel, m.opts.length);
        if (was !== m.sel) this.menuMoved();
        if (A) (sfx.blip(4), this.reply(m.opts[m.sel]));
        return;
      }
    }
  }

  // ---- drawing -----------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, t: number) {
    if (this.gone || this.stillMode) return;
    this.hits = [];
    const v = this.v;
    const cam = v.w.camera;
    void cam;
    if (this.vignette > 0.01) {
      const rg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
      rg.addColorStop(0, "rgba(40,0,70,0)");
      rg.addColorStop(1, `rgba(40,0,70,${0.6 * this.vignette})`);
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    }
    // the map: everyone's spot, the Z-Block
    if (this.mapOn) this.drawMap(g, t);
    // over heads: emotes, the steps left, coin pops, the dice's number
    for (const e of this.emos) {
      const s = v.toScreen(v.head(e.seat, 2.9, tmp));
      if (s.on) P.emote(g, s.x + 26, s.y - 6, e.s, e.c, e.t / e.dur);
    }
    if (this.steps && this.steps.n > 0 && !this.mapOn) {
      const s = v.toScreen(v.head(this.steps.seat, 3.0, tmp));
      if (s.on) P.stepsBubble(g, s.x, s.y - 14, this.steps.n, this.players[this.steps.seat].color, Math.max(0, 1 - this.steps.t * 5));
    }
    for (const p of this.pops) {
      const s = v.toScreen(tmp.set(p.x, p.y, p.z));
      if (!s.on) continue;
      if (p.s) {
        g.save();
        g.globalAlpha = p.t < 1 ? 1 : 1 - (p.t - 1) / 0.3;
        toy(g, p.s, s.x, s.y - p.t * 40, 26, p.c ?? "#ffffff", { rim: false });
        g.restore();
      } else P.coinPop(g, s.x, s.y, p.n, p.t / 1.3);
    }
    if (this.bigNum) {
      const b = this.bigNum;
      const s = v.toScreen(tmp.set(b.x, b.y, b.z));
      if (s.on) {
        const k = b.t;
        const sc = k < 0.2 ? 0.5 + (k / 0.2) * 0.9 : 1.4 - Math.min(0.4, (k - 0.2) * 1.5);
        g.save();
        g.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
        g.translate(s.x, s.y - 30 - k * 30);
        g.scale(sc, sc);
        toy(g, b.s, 0, 0, 64, b.c);
        g.restore();
      }
    }
    // junction labels
    const m = this.menu;
    if (m?.kind === "branch") {
      m.opts.forEach((o, k) => {
        const s = v.toScreen(v.arrowTip(k, tmp));
        if (!s.on) return;
        // (clear of the buttons along the bottom)
        s.y = Math.min(s.y + 34, H - 176);
        const nm = o.zip ? T("ZIPLINE", "滑索") : T(...(this.map.paths.find((p) => p.id === o.path)?.name ?? NAMES[o.path] ?? ["→", "→"]));
        // (the ice run: the risk it gives way now)
        const risk = this.r.g.spaces[o.to].ice ? Math.round(ICE_ODDS[Math.min(this.r.iceCracks, ICE_ODDS.length - 1)] * 100) : -1;
        const words = o.toll ? `${nm} · ${o.toll}` : risk >= 0 ? T(`${nm} · RISK ${risk}%`, `${nm} · 风险 ${risk}%`) : nm;
        g.font = `900 ${fpx(13)}px ${FONT}`;
        const w = g.measureText(words).width + (o.toll ? 40 : 22);
        const on = k === m.sel;
        rr(g, s.x - w / 2, s.y - 32, w, 26, 13);
        g.fillStyle = on ? this.players[m.seat].color : "rgba(20,14,50,0.88)";
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = on ? "#ffffff" : INK;
        g.stroke();
        text(g, words, s.x - (o.toll ? 9 : 0), s.y - 18.5, 13, "#ffffff", "center", 900);
        if (o.toll) P.coinIcon(g, s.x + w / 2 - 16, s.y - 19, 7);
        this.hits.push({ x: s.x - w / 2, y: s.y - 34, w, h: 30, sel: k });
      });
    }
    if (this.mapOn) return this.drawMapHud(g, t);
    // the panels (out of the way while the opening rolls)
    if (!this.cineOn) {
      const st = this.st;
      // (a roulette or a card across the bottom: the bottom panels step aside)
      const low = !!this.roul || this.menu?.kind === "shop" || this.menu?.kind === "target" || this.menu?.kind === "items";
      for (let i = 0; i < 4; i++) if (!(low && i >= 2)) P.panel(g, this.players[i], i, { place: st.indexOf(i), blocks: this.r.blocks[i], coins: this.dispCoins[i], items: this.r.items[i], active: this.cur === i, t: this.rt, flash: this.flash[i] });
      P.turnBadge(g, this.r.turn, this.turns, this.last5, this.rt);
      // the block chip and the map button under the turn
      if (this.opts.block) {
        const s = `#${this.opts.block.height.toLocaleString("en-US")}`;
        g.font = `800 ${fpx(10)}px ${FONT}`;
        const bw = g.measureText(s).width + 30;
        const bh = HUD.min ? 24 : 20;
        // (under the turn badge, grown on a small screen)
        const by = HUD.min ? Math.round(12 + 44 * P.badgeK() + 5) : 62;
        rr(g, W / 2 - bw / 2, by, bw, bh, bh / 2);
        g.fillStyle = "rgba(10,6,30,0.75)";
        g.fill();
        g.save();
        g.translate(W / 2 - bw / 2 + 11, by + bh / 2);
        g.rotate(Math.PI / 4);
        g.fillStyle = "#ffd23f";
        g.fillRect(-4, -4, 8, 8);
        g.restore();
        text(g, s, W / 2 + 6, by + 0.5 + bh / 2, 10, "rgba(255,255,255,0.85)", "center", 800);
      }
      const human = this.players.some(isLocal);
      // (a touch screen: the bottom panels stack at the top, so the buttons go between them and the turn)
      const side = HUD.thumbs ? (W / 2 + 92 * P.badgeK() + W - 14 - P.PW) / 2 - W / 2 : 0;
      if (human) {
        const mb = P.pill(g, "M", T("MAP", "地图"), W / 2 + (side || 140), 34, { c: "#8e7cff" });
        this.hits.push({ ...mb, key: "m" });
      }
      // the rivals' turn: fast-forward
      if (this.cur >= 0 && !isLocal(this.players[this.cur]) && human && !this.menu) {
        const fb = P.pill(g, "F", this.ff ? T("▶▶ ×3 ON", "▶▶ ×3 开") : T("▶▶ FAST", "▶▶ 快进"), W / 2 - (side || 150), 34, { c: this.ff ? "#ff6b35" : "#5a4e8a" });
        this.hits.push({ ...fb, key: "f" });
      }
    }
    this.cine.draw(g, t);
    // banners
    for (const b of this.bans) {
      const k = b.t / b.dur;
      banner(g, b.s, k, b.c, b.y, b.size);
      if (b.sub && k > 0.08 && k < 0.92) {
        g.save();
        g.globalAlpha = Math.min(1, (k - 0.08) * 8, (0.92 - k) * 10);
        g.font = `800 ${fpx(17)}px ${FONT}`;
        const w = g.measureText(b.sub).width + 34;
        rr(g, W / 2 - w / 2, b.y + b.size * 0.55, w, 30, 15);
        g.fillStyle = "rgba(10,6,30,0.78)";
        g.fill();
        text(g, b.sub, W / 2, b.y + b.size * 0.55 + 15.5, 17, "#ffffff", "center", 800);
        g.restore();
      }
    }
    if (this.roul) P.roulette(g, this.roul.title, this.roul.tiles, this.roulPos(), this.roul.t >= this.roul.dur, this.rt, this.roul.color);
    if (this.duel) this.drawDuel(g, t);
    if (this.cardOn) this.drawCard(g, t);
    if (this.menu) this.drawMenu(g, t);
    if (this.talk) P.hostBox(g, this.talk.who, this.talk.s, this.talk.t / Math.max(0.5, this.talk.dur), this.rt);
  }

  private drawMap(g: CanvasRenderingContext2D, t: number) {
    const v = this.v;
    g.fillStyle = "rgba(10,6,30,0.25)";
    g.fillRect(0, 0, W, H);
    // the Z-Block
    if (this.r.qAt >= 0) {
      const s = v.toScreen(v.spacePos(this.r.qAt, tmp).setY(1));
      if (s.on) {
        g.save();
        g.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3;
        g.beginPath();
        g.arc(s.x, s.y, 22 + Math.sin(t * 5) * 4, 0, Math.PI * 2);
        g.lineWidth = 4;
        g.strokeStyle = "#ffd23f";
        g.stroke();
        g.restore();
        P.qIcon(g, s.x, s.y - 26, 30, Math.sin(t * 3) * 0.15);
      }
    }
    for (let i = 0; i < 4; i++) {
      const s = v.toScreen(tmp.copy(v.av[i].pos).setY(1));
      if (!s.on) continue;
      badge(g, this.players[i], s.x, s.y - 22, 30, { rim: "#ffffff" });
      g.beginPath();
      g.moveTo(s.x - 6, s.y - 6);
      g.lineTo(s.x, s.y + 2);
      g.lineTo(s.x + 6, s.y - 6);
      g.fillStyle = "#ffffff";
      g.fill();
    }
  }
  private drawMapHud(g: CanvasRenderingContext2D, t: number) {
    void t;
    toy(g, T("MAP", "地图"), W / 2, 40, 40, "#ffffff");
    text(g, T(`${this.map.title} · the Z-Block is ${this.cur >= 0 ? this.r.toQ(this.cur) + " spaces ahead of " + this.nm(this.cur) : "marked in gold"}`, `${this.map.titleZh} · Z 方块${this.cur >= 0 ? `在 ${this.nm(this.cur)} 前方 ${this.r.toQ(this.cur)} 格` : "以金色标出"}`), W / 2, 76, 14, "#ffffff", "center", 800);
    const r = P.pills(g, [{ key: "M", words: T("Back", "返回"), c: "#8e7cff" }], H - 34);
    this.hits.push({ ...r[0], key: "m" });
    // the legend
    const kinds: [string, [string, string]][] = [
      ["blue", ["+3", "+3"]],
      ["red", ["−3", "−3"]],
      ["event", ["Event", "事件"]],
      ["lucky", ["Lucky", "幸运"]],
      ["shop", ["Shop", "商店"]],
      ["shor", ["TRACKER", "追踪者"]],
      ["vs", ["Duel", "对决"]],
    ];
    // (a touch screen: the arrows sit in the bottom left, so the key goes centred under the title)
    g.font = `800 ${fpx(12)}px ${FONT}`;
    let x = HUD.thumbs ? W / 2 - (kinds.reduce((a, [, l]) => a + g.measureText(T(...l)).width + 36, 0) - 15) / 2 : 24;
    const ly = HUD.thumbs ? 106 : H - 80;
    for (const [k, l] of kinds) {
      g.beginPath();
      g.arc(x + 8, ly, 8, 0, Math.PI * 2);
      g.fillStyle = KIND_C[k];
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#ffffff";
      g.stroke();
      text(g, T(...l), x + 21, ly + 0.5, 12, "#ffffff", "left", 800);
      g.font = `800 ${fpx(12)}px ${FONT}`;
      x += g.measureText(T(...l)).width + 36;
    }
  }

  private drawDuel(g: CanvasRenderingContext2D, t: number) {
    const d = this.duel!;
    if (!d.shown && d.t < 0.2) return;
    const y = 360;
    const k = Math.min(1, d.t * 4);
    for (const [seat, side, val] of [
      [d.seat, -1, d.ra],
      [d.rival, 1, d.rb],
    ] as [number, number, number][]) {
      const p = this.players[seat];
      const x = W / 2 + side * 150 * k;
      rr(g, x - 70, y - 50, 140, 112, 20);
      g.fillStyle = "rgba(10,6,30,0.85)";
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = p.color;
      g.stroke();
      badge(g, p, x, y - 14, 50);
      text(g, isLocal(p) ? T("YOU", "你") : short(p), x, y + 24, 13, tint(p.color, 0.4), "center", 900);
      if (d.stake) {
        const rolling = !val && !d.done && this.roul === null;
        const s = val ? String(val) : rolling ? String(1 + Math.floor((t * 17 + side * 3) % 10)) : "?";
        numeral(g, s, x + side * 104, y - 6, 44, val ? p.color : "#ffffff", "center");
      }
    }
    toy(g, "VS", W / 2, y - 6, 46, "#ff4fa8");
    if (d.stake) {
      P.coinIcon(g, W / 2 - 22, y + 42, 10);
      text(g, `${d.stake}`, W / 2 + 4, y + 43, 18, "#ffffff", "center", 900);
    }
    if (this.menu?.kind === "hit") return;
  }

  private drawCard(g: CanvasRenderingContext2D, t: number) {
    const c = this.cardOn!;
    const k = Math.min(1, c.t * 4);
    if (c.kind === "order") {
      P.card(g, W / 2 - 280, 120, 560, 250, T("TURN ORDER", "出场顺序"), "#7b5cff", k);
      c.data.forEach((seat, i) => {
        const p = this.players[seat];
        const x = W / 2 - 210 + i * 140;
        const d = Math.min(1, Math.max(0, (c.t - 0.2 - i * 0.18) * 4));
        if (d <= 0) return;
        g.save();
        g.globalAlpha = d;
        text(g, ["1st", "2nd", "3rd", "4th"][i], x, 200, 18, ["#ffd23f", "#d6dde8", "#e39a5f", "#8d88a8"][i], "center", 900);
        badge(g, p, x, 256, 70);
        text(g, isLocal(p) ? T("YOU", "你") : short(p), x, 310, 14, tint(p.color, 0.4), "center", 900);
        numeral(g, String(c.extra?.[seat] ?? ""), x + 34, 228, 24, "#ffffff", "center");
        g.restore();
      });
    } else if (c.kind === "awards") {
      P.card(g, W / 2 - 250, 110, 500, 290, T("MINI-GAME RESULTS", "小游戏结果"), "#ff5fa2", k);
      c.data.forEach((seat, i) => {
        const p = this.players[seat];
        const y = 196 + i * 52;
        const d = Math.min(1, Math.max(0, (c.t - 0.15 - i * 0.12) * 4));
        if (d <= 0) return;
        g.save();
        g.globalAlpha = d;
        g.translate((1 - d) * 40, 0);
        text(g, String(i + 1), W / 2 - 200, y, 22, ["#ffd23f", "#d6dde8", "#e39a5f", "#8d88a8"][i], "center", 900);
        badge(g, p, W / 2 - 150, y, 40);
        text(g, isLocal(p) ? T("You", "你") : p.name, W / 2 - 116, y, 16, "#ffffff", "left", 800);
        const gn = c.extra?.[seat] ?? 0;
        if (gn) {
          P.coinIcon(g, W / 2 + 140, y, 11);
          numeral(g, `+${gn}`, W / 2 + 200, y + 1, 24, "#ffe34d", "right");
        }
        g.restore();
      });
    } else if (c.kind === "standings") {
      P.card(g, W / 2 - 250, 110, 500, 290, T("STANDINGS", "排名"), "#ff5fa2", k);
      c.data.forEach((seat, i) => {
        const p = this.players[seat];
        const y = 196 + i * 52;
        const d = Math.min(1, Math.max(0, (c.t - 0.15 - (3 - i) * 0.25) * 4));
        if (d <= 0) return;
        g.save();
        g.globalAlpha = d;
        text(g, String(i + 1), W / 2 - 200, y, 22, ["#ffd23f", "#d6dde8", "#e39a5f", "#8d88a8"][i], "center", 900);
        badge(g, p, W / 2 - 150, y, 40);
        text(g, isLocal(p) ? T("You", "你") : p.name, W / 2 - 116, y, 16, "#ffffff", "left", 800);
        P.qIcon(g, W / 2 + 90, y, 22);
        numeral(g, String(this.r.blocks[seat]), W / 2 + 106, y + 1, 22, "#ffffff", "left");
        P.coinIcon(g, W / 2 + 160, y, 10);
        numeral(g, String(this.r.coins[seat]), W / 2 + 174, y + 1, 22, "#ffffff", "left");
        g.restore();
      });
    } else if (c.kind === "bonus" && c.key) {
      const bt = BONUS_TXT[c.key];
      P.card(g, W / 2 - 250, 70, 500, 214, T(...bt.n), bt.c, k);
      text(g, T(`Bonus ${(c.extra?.[0] ?? 0) + 1} of 3 · ${bt.d[0]}`, `奖励 ${(c.extra?.[0] ?? 0) + 1}/3 · ${bt.d[1]}`), W / 2, 140, 14, "rgba(255,255,255,0.85)", "center", 800);
      const top = Math.max(1, ...c.data);
      const reveal = c.t > 1.4;
      c.data.forEach((val, seat) => {
        const p = this.players[seat];
        const x = W / 2 - 180 + seat * 120;
        const win = reveal && !!c.winners?.includes(seat);
        // (a small screen: the line over the bars is grown, so the tallest bar and its Q stay under it)
        const hgt = (HUD.min ? 46 : 70) * Math.min(1, c.t / 1.2) * (val / top);
        rr(g, x - 26, 246 - hgt, 52, hgt + 2, 8);
        g.fillStyle = win ? bt.c : tint(p.color, -0.25);
        g.fill();
        if (win) {
          g.lineWidth = 3;
          g.strokeStyle = "#ffffff";
          g.stroke();
        }
        badge(g, p, x - 40, 236, 26);
        numeral(g, String(Math.round(val * Math.min(1, c.t / 1.2))), x, 232 - hgt, 20, "#ffffff", "center");
        if (win) P.qIcon(g, x + 30, 214 - hgt + Math.sin(t * 6) * 3, 26, Math.sin(t * 3) * 0.2);
      });
      if (reveal) {
        const ws = c.winners ?? [];
        text(g, ws.length ? T(`+1 Z-BLOCK for ${ws.map((w) => this.nm(w)).join(" & ")}`, `${ws.map((w) => this.nm(w)).join(" & ")} +1 Z 方块`) : T("Nobody earned it!", "没有人获得！"), W / 2, 268, 15, "#ffd23f", "center", 900);
      }
    } else if (c.kind === "shopAi" && c.items) {
      const seat = c.data[0];
      P.card(g, W / 2 - 200, 140, 400, 160, this.shopName, "#ff7a2f", k);
      text(g, T(`${this.nm(seat)} browses…`, `${this.nm(seat)} 在逛…`), W / 2, 212, 14, "#ffffff", "center", 800);
      c.items.forEach((it, i) => P.itemIcon(g, it, W / 2 - 90 + i * 90, 256, 44));
    }
  }

  private drawMenu(g: CanvasRenderingContext2D, t: number) {
    const m = this.menu!;
    const y = H - 150;
    const add = (r: { x: number; y: number; w: number; h: number }[], keys: Key[]) => r.forEach((b, i) => this.hits.push({ ...b, key: keys[i] }));
    switch (m.kind) {
      case "hit":
        add(P.pills(g, [{ key: "A", words: T("HIT THE BLOCK!", "击打方块！") }], y + 22, true), ["a"]);
        return;
      case "next":
        add(P.pills(g, [{ key: "A", words: T("Next", "继续") }], y + 22), ["a"]);
        return;
      case "main": {
        const n = this.r.items[m.seat].length;
        add(
          P.pills(
            g,
            [
              { key: "A", words: T("ROLL", "掷骰") },
              { key: "B", words: n ? T(`ITEMS · ${n}`, `道具 · ${n}`) : T("ITEMS", "道具"), on: n > 0 },
              { key: "M", words: T("MAP", "地图"), c: "#8e7cff" },
            ],
            y + 22,
            true,
          ),
          ["a", "b", "m"],
        );
        if (this.r.turn === 1 && this.menuT < 6) text(g, T(`The Z-Block is ${this.r.toQ(m.seat)} spaces away`, `Z 方块在 ${this.r.toQ(m.seat)} 格外`), W / 2, y - 14, 14, "#ffffff", "center", 800);
        return;
      }
      case "items": {
        const it = this.r.items[m.seat];
        P.card(g, W / 2 - 260, 150, 520, 220, T("YOUR ITEMS", "你的道具"), "#3ec6ff");
        if (!it.length) text(g, T("Your bag is empty: buy items in the shops.", "背包是空的：去商店买道具吧。"), W / 2, 270, 16, "#ffffff", "center", 800);
        it.forEach((k, i) => {
          const x = W / 2 - (it.length - 1) * 85 + i * 170;
          const on = i === m.sel;
          rr(g, x - 72, 214, 144, 112, 16);
          g.fillStyle = on ? tint(P.ITEM_TXT[k].c, -0.35) : "rgba(255,255,255,0.06)";
          g.fill();
          g.lineWidth = on ? 3.5 : 1.5;
          g.strokeStyle = on ? "#ffffff" : "rgba(255,255,255,0.2)";
          g.stroke();
          P.itemIcon(g, k, x, 252, on ? 56 : 48);
          text(g, P.itemName(k), x, 300, 12, "#ffffff", "center", 900);
          this.hits.push({ x: x - 72, y: 214, w: 144, h: 112, sel: i });
        });
        if (it[m.sel]) text(g, P.itemDesc(it[m.sel]), W / 2, 346, 14, "rgba(255,255,255,0.9)", "center", 800);
        add(
          P.pills(
            g,
            [
              { key: "A", words: T("Use", "使用"), on: it.length > 0 },
              { key: "B", words: T("Back", "返回") },
            ],
            y + 50,
          ),
          ["a", "b"],
        );
        return;
      }
      case "branch":
        add(
          P.pills(
            g,
            [
              { key: "◀▶", words: T("Choose your way", "选择路线"), c: "#5a4e8a" },
              { key: "A", words: T("Go!", "出发！") },
              { key: "M", words: T("MAP", "地图"), c: "#8e7cff" },
            ],
            y + 22,
          ),
          ["right", "a", "m"],
        );
        return;
      case "yesno": {
        P.card(g, W / 2 - 220, 150, 440, 190, m.title, m.q ? "#e5a300" : "#ff7a2f");
        if (m.q) P.qIcon(g, W / 2, 245, 56, Math.sin(t * 3) * 0.12);
        text(g, m.sub, W / 2, m.q ? 302 : 250, 17, "#ffffff", "center", 800);
        if (m.q) {
          const have = T(`you have ${this.r.coins[this.cur >= 0 ? this.cur : 0]}`, `你有 ${this.r.coins[this.cur >= 0 ? this.cur : 0]}`);
          // (the coin just before the words, however wide they are drawn)
          g.font = `800 ${fpx(13)}px ${FONT}`;
          P.coinIcon(g, HUD.min ? W / 2 + 6 - g.measureText(have).width / 2 - 14 : W / 2 - 40, 330, 9);
          text(g, have, W / 2 + 6, 331, 13, "rgba(255,255,255,0.8)", "center", 800);
        }
        add(
          P.pills(
            g,
            [
              { key: "A", words: m.yes },
              { key: "B", words: m.no },
            ],
            y + 50,
            true,
          ),
          ["a", "b"],
        );
        return;
      }
      case "shop": {
        P.card(g, W / 2 - 290, 110, 580, 270, this.shopName, "#ff7a2f");
        text(g, T("Pick an item · ", "选一个道具 · ") + T(`bag ${this.r.items[m.seat].length}/${BAG}`, `背包 ${this.r.items[m.seat].length}/${BAG}`), W / 2, 178, 13, "rgba(255,255,255,0.8)", "center", 800);
        m.offer.forEach((k, i) => {
          const x = W / 2 - 180 + i * 180;
          const on = i === m.sel;
          const price = ITEMS[k].price;
          const ok = price <= this.r.coins[m.seat];
          rr(g, x - 78, 196, 156, 140, 18);
          g.fillStyle = on ? tint(P.ITEM_TXT[k].c, -0.35) : "rgba(255,255,255,0.06)";
          g.fill();
          g.lineWidth = on ? 3.5 : 1.5;
          g.strokeStyle = on ? "#ffffff" : "rgba(255,255,255,0.2)";
          g.stroke();
          g.globalAlpha = ok ? 1 : 0.45;
          P.itemIcon(g, k, x, 238, on ? 58 : 50);
          text(g, P.itemName(k), x, 284, 12.5, "#ffffff", "center", 900);
          P.coinIcon(g, x - 16, 312, 9);
          numeral(g, String(price), x + 2, 313, 20, ok ? "#ffe34d" : "#ff8a8a", "left");
          g.globalAlpha = 1;
          this.hits.push({ x: x - 78, y: 196, w: 156, h: 140, sel: i });
        });
        text(g, P.itemDesc(m.offer[m.sel]), W / 2, 356, 14, "#ffffff", "center", 800);
        P.coinIcon(g, W / 2 + 210, 178, 8);
        text(g, String(this.r.coins[m.seat]), W / 2 + 222, 178.5, 13, "#ffffff", "left", 900);
        add(
          P.pills(
            g,
            [
              { key: "A", words: T("Buy", "购买"), on: ITEMS[m.offer[m.sel]].price <= this.r.coins[m.seat] },
              { key: "B", words: T("Leave", "离开") },
            ],
            y + 62,
          ),
          ["a", "b"],
        );
        return;
      }
      case "target": {
        const title = m.why === "duel" ? T("DUEL WHO?", "和谁对决？") : m.why === "reorg" ? T("SWAP WITH WHO?", "和谁交换？") : T("SNIPE WHO?", "狙击谁？");
        P.card(g, W / 2 - 280, 130, 560, 230, title, m.why === "duel" ? "#ff4fa8" : P.ITEM_TXT[m.why as ItemKey]?.c ?? "#ff6b35");
        m.opts.forEach((seat, i) => {
          const p = this.players[seat];
          const x = W / 2 - 180 + i * 180;
          const on = i === m.sel;
          rr(g, x - 76, 198, 152, 140, 18);
          g.fillStyle = on ? tint(p.color, -0.3) : "rgba(255,255,255,0.06)";
          g.fill();
          g.lineWidth = on ? 3.5 : 1.5;
          g.strokeStyle = on ? "#ffffff" : "rgba(255,255,255,0.2)";
          g.stroke();
          badge(g, p, x, 238, on ? 54 : 46);
          text(g, short(p), x, 280, 13, "#ffffff", "center", 900);
          P.qIcon(g, x - 38, 312, 18);
          text(g, String(this.r.blocks[seat]), x - 24, 313, 14, "#ffffff", "left", 900);
          P.coinIcon(g, x + 10, 312, 8);
          text(g, String(this.r.coins[seat]), x + 22, 313, 14, "#ffffff", "left", 900);
          if (m.why === "reorg") text(g, T(`${this.r.toQ(seat)} to Z`, `距 Z ${this.r.toQ(seat)}`), x, 330, 11, "rgba(255,255,255,0.7)", "center", 800);
          this.hits.push({ x: x - 76, y: 198, w: 152, h: 140, sel: i });
        });
        if (m.why === "sniper") text(g, T(`Steal up to ${SNIPE} coins`, `最多偷 ${SNIPE} 金币`), W / 2, 352, 13, "rgba(255,255,255,0.85)", "center", 800);
        add(P.pills(g, [{ key: "A", words: T("Choose", "选择") }], y + 54), ["a"]);
        return;
      }
      case "nonce": {
        P.card(g, W / 2 - 220, 140, 440, 220, P.itemName("nonce"), P.ITEM_TXT.nonce.c);
        const d = this.r.toQ(m.seat);
        toy(g, String(m.v), W / 2, 262, 96, "#ffffff", { ink: INK });
        for (const side of [-1, 1]) {
          const x = W / 2 + side * 130;
          g.beginPath();
          g.moveTo(x + side * 16, 262);
          g.lineTo(x - side * 10, 244);
          g.lineTo(x - side * 10, 280);
          g.closePath();
          g.fillStyle = "#ffffff";
          g.fill();
          this.hits.push({ x: x - 30, y: 232, w: 60, h: 60, key: side < 0 ? "left" : "right" });
        }
        text(g, d <= 10 ? T(`The Z-Block is ${d} away`, `Z 方块在 ${d} 格外`) : T("Pick your roll: 1 to 10", "选择点数：1 到 10"), W / 2, 334, 14, "#ffffff", "center", 800);
        add(P.pills(g, [{ key: "A", words: T("Roll it", "就这个") }], y + 54), ["a"]);
        return;
      }
      case "station": {
        const lift = m.why === "lift";
        P.card(g, W / 2 - 230, 118, 460, 110, lift ? T("NU7 TOWER LIFT · GLIDE WHERE?", "NU7 塔 · 滑翔去哪里？") : T("ZEC LINE · WHERE TO?", "ZEC 线 · 去哪里？"), lift ? "#00afca" : "#ff6b35");
        const s = this.r.g.spaces[m.opts[m.sel]];
        text(g, `◀  ${lift ? T(...this.dropName(m.opts[m.sel])) : s.station ?? ""}  ▶`, W / 2, 196, 24, "#ffffff", "center", 900);
        const dq = this.r.dist(m.opts[m.sel], this.r.qAt);
        text(g, T(`${dq} spaces from the Z-Block`, `距 Z 方块 ${dq} 格`), W / 2, 220, 12, "rgba(255,255,255,0.8)", "center", 800);
        add(
          P.pills(
            g,
            [
              { key: "◀▶", words: lift ? T("Drop zone", "降落点") : T("Station", "车站"), c: "#5a4e8a" },
              { key: "A", words: lift ? T("Jump!", "跳！") : T("Ride!", "出发！") },
            ],
            y + 50,
          ),
          ["right", "a"],
        );
        return;
      }
    }
  }
}

export { LOCK_FINE };
