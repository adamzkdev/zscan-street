import * as THREE from "three";
import { get } from "../../data/zscan";
import type { InteriorContext } from "../types";
import type { Level, LiftStyle, SkyKit } from "../zktowers/kit";

/**
 * The NU7 TOWER's shared pieces: its floors, its palette (the tower's violet and Zcash gold on
 * plum-black slab), the LED boards' look (DotGothic16 on a dot matrix, scan lines), and the live
 * data every floor reads: the tip, the last 100 blocks, the daily rows, the supply, the upgrades,
 * all from the ZScan API.
 */

export const VIOLET = "#b07bff";
export const GOLD = "#f4b728";
export const SLAB = "#2a2838";
export const PLUM = "#17121f";
export const INK = "#0b0913";
export const STEEL = "#b8bcc6";
export const AMBER = "#ffb347";
export const MINT = "#5cff9a";

/** NU7 on mainnet (from /v1/upgrades; these are the facts the tower is built on). */
export const NU7 = {
  height: 3_543_405,
  at: Date.parse("2026-11-06T02:34:02Z"),
  date: "2026-11-06",
  time: "02:34 UTC",
  branch: "0x77190AD9",
  target: 25,
  before: 75,
  /** Block subsidy before and after (ZEC): divided by 3, the same issuance per unit of time. */
  subsidy: 0.52083333,
  oldSubsidy: 1.5625,
  /** Share of each block's fees burned to the Network Sustainability Mechanism (ZIP 235). */
  burn: 0.6,
  halving: 6_132_390,
  lastHalving: 2_726_400,
  blossom: 653_600,
};

/** The floors. Interior heights are spaced out; `view` is the real height the windows look from. */
export const F = { hall: 0, pit: 1, vault: 2, clock: 3, obs: 4, deck: 5 } as const;
export const LEVELS: Level[] = [
  { label: "G", name: "NU7 HALL · activation monument · the 25 s era", y: 0, spawn: [0, -2.6], yaw: 0, view: 2 },
  // (the pit garage looks out from the circuit's pit gate, 19.5 m west of the tower's axis)
  { label: "P", name: "PIT GARAGE · karts · RACE the NU7 GRAND PRIX", y: 0, spawn: [11, -13], yaw: Math.PI / 2, view: 2.2, side: -19.5 },
  { label: "7", name: "NSM VAULT · fees burned block by block", y: 30, spawn: [1.7, -3], yaw: 0, view: 24 },
  { label: "25", name: "25-SECOND CLOCK · a block every 25 s", y: 70, spawn: [1.7, -3], yaw: 0, view: 84 },
  { label: "35", name: "HALVING OBSERVATORY · block 6,132,390", y: 110, spawn: [1.7, -5], yaw: 0, view: 117 },
  { label: "R", name: "SKY DECK · the view · SKY BAR", y: 150, spawn: [0, -6], yaw: Math.PI, view: 124 },
];
/** Where each floor's lift lobby wall stands (x, z, turn): k.lifts and liftplan's PLANS agree on it. */
export const LIFT: [number, number, number][] = [
  [-14.8, -20, Math.PI / 2],
  [13.8, -13, -Math.PI / 2],
  [0, -0.2, Math.PI],
  [0, -0.2, Math.PI],
  [0, -2.2, Math.PI],
  [0, -9.8, 0],
];
export const LIFT_STYLE: LiftStyle = { wall: "#1a1424", frame: GOLD, door: "#2a2238", ink: "#efe6ff", lit: VIOLET, accent: GOLD, deco: "bar" };

export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const zec = (zat: number, d = 8) => (zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const PX = (px: number) => `400 ${Math.round(px)}px "DotGothic16", "JetBrains Mono", monospace`;
export const MONO = (px: number, w = 700) => `${w} ${Math.round(px)}px "JetBrains Mono", Menlo, monospace`;
/** A team's name on a board: pools in capitals, a bare address as it is (its case is part of it). */
export const teamName = (n: string) => (/^t[13][a-zA-Z0-9]/.test(n) ? n : n.toUpperCase());
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** "13 d 15 h 22 m" */
export function span(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440),
    h = Math.floor((m % 1440) / 60);
  return d ? `${d} d ${String(h).padStart(2, "0")} h ${String(m % 60).padStart(2, "0")} m` : `${h} h ${String(m % 60).padStart(2, "0")} m`;
}

// ---- the LED look ------------------------------------------------------------------------------------

let dots: CanvasPattern | null = null;
/** A board's ground: near black, a faint dot matrix. */
export function ledBg(g: CanvasRenderingContext2D, W: number, H: number, tint = VIOLET) {
  g.fillStyle = "#06040b";
  g.fillRect(0, 0, W, H);
  if (!dots) {
    const c = document.createElement("canvas");
    c.width = c.height = 6;
    const d = c.getContext("2d")!;
    d.fillStyle = "rgba(255,255,255,0.045)";
    d.fillRect(1, 1, 3, 3);
    dots = g.createPattern(c, "repeat");
  }
  if (dots) {
    g.fillStyle = dots;
    g.fillRect(0, 0, W, H);
  }
  // a breath of the tint from the top
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hexA(tint, 0.1));
  grad.addColorStop(0.5, hexA(tint, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}
/** Scan lines over a finished board. */
export function scan(g: CanvasRenderingContext2D, W: number, H: number, step = 4) {
  g.fillStyle = "rgba(0,0,0,0.26)";
  for (let y = 0; y < H; y += step) g.fillRect(0, y, W, Math.max(1, step / 3));
}
/** The header strip: a Japanese label and an English one, in a band of `color`. */
export function header(g: CanvasRenderingContext2D, W: number, h: number, jp: string, en: string, color = VIOLET, right?: string) {
  g.fillStyle = color;
  g.fillRect(0, 0, W, h);
  g.fillStyle = "#0b0913";
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = PX(h * 0.6);
  g.fillText(`${jp}  ${en}`, h * 0.4, h * 0.54);
  if (right) {
    g.textAlign = "right";
    g.fillText(right, W - h * 0.4, h * 0.54);
    g.textAlign = "left";
  }
}
/** Text that glows like an LED: a blurred pass, then a crisp one. */
export function glow(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = "left", blur = 0.35) {
  g.font = PX(px);
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.shadowColor = color;
  g.shadowBlur = px * blur;
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  g.fillStyle = mix(color, "#ffffff", 0.35);
  g.fillText(text, x, y);
  g.textAlign = "left";
}
/** A small dim caption. */
export function cap(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = "#8d84a3", align: CanvasTextAlign = "left") {
  g.font = PX(px);
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.textAlign = "left";
}
export function hexA(hex: string, a: number) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
export function mix(a: string, b: string, k: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
}

/** A neon sign (text on a transparent plane, `h` metres tall). */
export function neon(text: string, h: number, color: string, o: { font?: (px: number) => string; k?: number } = {}) {
  const font = o.font ?? PX;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const px = 120;
  g.font = font(px);
  c.width = Math.ceil(g.measureText(text).width) + px;
  c.height = Math.round(px * 1.5);
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.font = font(px);
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.shadowColor = color;
    g.shadowBlur = px * 0.3;
    g.fillStyle = color;
    g.fillText(text, c.width / 2, c.height / 2 + px * 0.04);
    g.shadowBlur = px * 0.08;
    g.fillStyle = mix(color, "#ffffff", 0.55);
    g.fillText(text, c.width / 2, c.height / 2 + px * 0.04);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  draw();
  onFonts(draw);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(o.k ?? 1.6) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry((h * c.width) / c.height, h), mat);
  m.raycast = () => {};
  return m;
}

/** Redraws once the pixel font's glyphs are in (its subsets load on demand). */
const fontWaiters: (() => void)[] = [];
let fontsIn = false;
export function onFonts(fn: () => void) {
  if (fontsIn) return;
  fontWaiters.push(fn);
}
if (typeof document !== "undefined" && document.fonts) {
  const sample = "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz #,.:·%→▲▼▶+−-/ 七番塔二十五秒時代焼却金庫展望台天空次の半減期観測所到着案内入口出口車庫ピットレース中カートバー";
  void Promise.all([document.fonts.load(PX(40), sample), document.fonts.load(MONO(40), "0123456789")])
    .catch(() => {})
    .then(() => {
      fontsIn = true;
      for (const fn of fontWaiters.splice(0)) fn();
    });
}

/**
 * A live LED board on floor f: `w` × `h` metres at (x, y, z) turned `ry`, redrawn every `every`
 * seconds while you are on its floor (and when the font arrives). Returns its mesh.
 */
export function board(k: SkyKit, f: number, w: number, h: number, x: number, y: number, z: number, ry: number, draw: (g: CanvasRenderingContext2D, W: number, H: number, t: number) => void, every = 2, res = 1024) {
  const mesh = k.screen(f, w, h, draw, every, res);
  k.add(f, mesh, x, y, z, ry);
  const s = (mesh.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture;
  const redraw = () => {
    const c = s.image as HTMLCanvasElement;
    draw(c.getContext("2d")!, c.width, c.height, performance.now() / 1000);
    s.needsUpdate = true;
  };
  onFonts(redraw);
  BOARDS.push({ k, f, redraw });
  return mesh;
}
/** Every board, to redraw those of the floor you are on when new data comes in (see Nu7Live.tick). */
const BOARDS: { k: SkyKit; f: number; redraw: () => void }[] = [];

/** A bezel behind a board: a dark frame with a thin gold lip. */
export function bezel(k: SkyKit, f: number, w: number, h: number, x: number, y: number, z: number, ry: number, lip = GOLD) {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  // (the frame sits 6 cm behind the board's face, along its normal)
  const bx = x - s * 0.06,
    bz = z - c * 0.06;
  k.box(f, w + 0.3, h + 0.3, 0.1, bx, y - h / 2 - 0.15, bz, "#0c0a12", "polish", ry);
  k.box(f, w + 0.36, 0.04, 0.12, bx, y + h / 2 + 0.15, bz, lip, "metal", ry);
  k.box(f, w + 0.36, 0.04, 0.12, bx, y - h / 2 - 0.19, bz, lip, "metal", ry);
}

// ---- the live data -------------------------------------------------------------------------------------

export interface BlockRow {
  height: number;
  hash: string;
  time: string;
  tx_count: number;
  size: number;
  fees: number | null;
  miner?: string | null;
  miner_pool: string | null;
}
export interface DailyRow {
  day: string;
  blocks: number;
  has_txs?: boolean;
  txs: number;
  fees: number;
  issued: number;
  burned: number;
}
interface Health {
  node_tip: number;
  indexed_tip: number;
  lag_blocks?: number;
  last_block_time: string | null;
}
export interface Supply {
  height: number;
  supply: number;
  block_subsidy: number;
  issued_24h: number;
  next_halving_height: number;
  next_halving_eta: string | null;
  avg_block_time: number | null;
  target_block_time: number;
}
export interface Upgrade {
  name: string;
  label: string;
  activation_height: number | null;
  activated: boolean;
  activated_at: string | null;
  target_block_time: number | null;
  branch_id: string | null;
}

/** A team on the pit wall: a mining pool and how it did over the last 100 blocks. */
export interface Team {
  name: string;
  blocks: number;
  /** Shortest spacing before one of its blocks (s), and its newest one. */
  best: number | null;
  last: number | null;
  lastHeight: number;
}

export class Nu7Live {
  /** The chain's tip (the node's), and the API's indexed tip. */
  tip = 0;
  indexed = 0;
  /** Wall clock when the tip last moved up (0: not seen yet). */
  tipAt = 0;
  blocks: BlockRow[] = [];
  daily: DailyRow[] = [];
  supply: Supply | null = null;
  upgrades: Upgrade[] = [];
  /** Heartbeat from the place's update: the tower polls only while someone is inside. */
  private seen = 0;
  /** Which floor is open (the clock asks for the tip more often). */
  floor = 0;
  private due = { health: 0, blocks: 0, daily: 0, supply: 0, upgrades: 0 };
  private busy = new Set<string>();
  private blockWait: ReturnType<typeof setTimeout> | null = null;
  private fns: (() => void)[] = [];
  private newFns: ((b: BlockRow) => void)[] = [];
  private tipFns: ((h: number) => void)[] = [];

  constructor(ctx: InteriorContext) {
    ctx.onBlock((h) => {
      this.seeTip(h);
      if (!this.inside()) return;
      // its full row (fees, pool) once the API has it
      if (this.blockWait) clearTimeout(this.blockWait);
      this.blockWait = setTimeout(() => void this.loadBlocks(), 2500);
    });
  }

  inside() {
    return performance.now() - this.seen < 2500;
  }
  /** Something changed (redraw). */
  on(fn: () => void) {
    this.fns.push(fn);
  }
  /** A block the tower had not seen yet, oldest first (its fees are known). */
  onNew(fn: (b: BlockRow) => void) {
    this.newFns.push(fn);
  }
  /** The tip moved up. */
  onTip(fn: (h: number) => void) {
    this.tipFns.push(fn);
  }
  private emit() {
    for (const fn of this.fns) fn();
    this.dirty = true;
  }
  /** Arriving on a floor: its boards redraw with what is known already. */
  touch() {
    this.dirty = true;
    this.drawnAt = 0;
  }
  /** New data since the boards were last drawn (they redraw at most twice a second). */
  private dirty = false;
  private drawnAt = 0;

  private seeTip(h: number, at = Date.now()) {
    if (!h || h <= this.tip) return;
    const first = !this.tip;
    this.tip = h;
    if (!first) {
      this.tipAt = at;
      for (const fn of this.tipFns) fn(h);
    }
    this.emit();
  }

  /** Every frame inside (`k`: the place's kit, its current floor's boards redraw on new data). */
  tick(k?: SkyKit) {
    this.seen = performance.now();
    const now = this.seen;
    if (k && this.dirty && now - this.drawnAt > 500) {
      this.dirty = false;
      this.drawnAt = now;
      for (const b of BOARDS) if (b.k === k && b.f === k.current) b.redraw();
    }
    const d = this.due;
    if (now > d.health) {
      d.health = now + (this.floor === F.clock ? 3000 : 8000);
      void this.load("health", async () => {
        const h = await get<Health>("/v1/health");
        if (!h) return;
        this.indexed = Math.max(this.indexed, h.indexed_tip ?? 0);
        // in step with the node: its last block's own time starts the clock
        if (!this.tip && h.node_tip && h.indexed_tip === h.node_tip && h.last_block_time) {
          this.tip = h.node_tip;
          this.tipAt = Date.parse(h.last_block_time);
          this.emit();
        } else this.seeTip(h.node_tip ?? 0);
      });
    }
    if (now > d.blocks) {
      d.blocks = now + 30_000;
      void this.loadBlocks();
    }
    if (now > d.daily) {
      d.daily = now + 600_000;
      void this.load("daily", async () => {
        const days = Math.ceil((Date.now() - NU7.at) / 86_400_000) + 32;
        const rows = await get<DailyRow[]>(`/v1/stats/daily?days=${Math.min(120, days)}`);
        if (rows?.length) {
          this.daily = rows;
          this.emit();
        }
      });
    }
    if (now > d.supply) {
      d.supply = now + 600_000;
      void this.load("supply", async () => {
        const s = await get<Supply & { daily?: unknown }>("/v1/supply");
        if (!s) return;
        delete s.daily;
        this.supply = s;
        this.emit();
      });
    }
    if (now > d.upgrades && !this.upgrades.length) {
      d.upgrades = now + 120_000;
      void this.load("upgrades", async () => {
        const u = await get<{ upgrades: Upgrade[] }>("/v1/upgrades");
        if (u?.upgrades?.length) {
          this.upgrades = u.upgrades;
          this.emit();
        }
      });
    }
  }

  private async load(key: string, fn: () => Promise<void>) {
    if (this.busy.has(key)) return;
    this.busy.add(key);
    try {
      await fn();
    } finally {
      this.busy.delete(key);
    }
  }

  private loadBlocks() {
    return this.load("blocks", async () => {
      const list = await get<BlockRow[]>("/v1/blocks?limit=100");
      if (!list?.length) return;
      const had = this.blocks.length ? this.blocks[0].height : 0;
      this.blocks = list;
      this.indexed = Math.max(this.indexed, list[0].height);
      if (!this.tip) this.seeTip(list[0].height);
      if (had)
        list
          .filter((b) => b.height > had)
          .reverse()
          .forEach((b) => this.newFns.forEach((fn) => fn(b)));
      this.emit();
    });
  }

  // ---- what the boards read ----

  /** Blocks mined since NU7's activation block. */
  get since() {
    return this.tip ? Math.max(0, this.tip - NU7.height) : null;
  }
  /** Average spacing (s) over the last blocks the API has. */
  get avg() {
    const b = this.blocks;
    if (b.length < 2) return null;
    return (Date.parse(b[0].time) - Date.parse(b[b.length - 1].time)) / 1000 / (b.length - 1);
  }
  /** Average spacing (s) since the activation (from the tip and the wall clock). */
  get avgSince() {
    const s = this.since;
    return s ? (Date.now() - NU7.at) / 1000 / s : null;
  }
  /** Spacing (s) before each of the last blocks, newest first (the oldest has none). */
  get gaps() {
    const b = this.blocks;
    const out: { h: number; s: number }[] = [];
    for (let i = 0; i < b.length - 1; i++) out.push({ h: b[i].height, s: (Date.parse(b[i].time) - Date.parse(b[i + 1].time)) / 1000 });
    return out;
  }
  /** Seconds since the last block reached the tip, or null while unknown. */
  get elapsed() {
    if (this.tipAt) return (Date.now() - this.tipAt) / 1000;
    const b = this.blocks[0];
    if (b && b.height >= this.tip) {
      const s = (Date.now() - Date.parse(b.time)) / 1000;
      if (s < 120) return s;
    }
    return null;
  }
  /** The last block the API has, and what it burned (60 % of its fees, ZIP 235). */
  get last() {
    const b = this.blocks[0];
    return b ? { ...b, burned: Math.floor((b.fees ?? 0) * NU7.burn) } : null;
  }
  /** Daily rows since NU7's day, oldest first (`has` false: the API has no transactions for it yet). */
  get nu7Days() {
    return this.daily.filter((d) => d.day.slice(0, 10) >= NU7.date).map((d) => ({ day: d.day.slice(0, 10), burned: d.burned, fees: d.fees, has: d.has_txs !== false && d.fees > 0, blocks: d.blocks, issued: d.issued }));
  }
  /** Burned since NU7 (zat), over the days the API has, and how many days that is out of all. */
  get burnedSince() {
    const d = this.nu7Days;
    if (!d.length) return null;
    return { zat: d.reduce((a, x) => a + (x.has ? x.burned : 0), 0), days: d.filter((x) => x.has).length, of: d.length };
  }
  /** The next halving: height, blocks to go, its ETA. */
  get halving() {
    const h = this.supply?.next_halving_height ?? NU7.halving;
    const left = this.tip ? Math.max(0, h - this.tip) : null;
    const eta = this.supply?.next_halving_eta ? Date.parse(this.supply.next_halving_eta) : left !== null ? Date.now() + left * NU7.target * 1000 : null;
    return { height: h, left, eta };
  }
  /** Mining pools as teams, over the last 100 blocks: most blocks first. */
  get teams(): Team[] {
    const b = this.blocks;
    const m = new Map<string, Team>();
    b.forEach((x, i) => {
      const name = x.miner_pool ?? (x.miner ? `${x.miner.slice(0, 6)}…${x.miner.slice(-3)}` : "UNKNOWN");
      let t = m.get(name);
      if (!t) m.set(name, (t = { name, blocks: 0, best: null, last: null, lastHeight: x.height }));
      t.blocks++;
      const prev = b[i + 1];
      if (prev) {
        const s = (Date.parse(x.time) - Date.parse(prev.time)) / 1000;
        if (t.last === null) t.last = s;
        if (t.best === null || s < t.best) t.best = s;
      }
    });
    return [...m.values()].sort((a, c) => c.blocks - a.blocks || c.lastHeight - a.lastHeight);
  }
  upgrade(name: string) {
    return this.upgrades.find((u) => u.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
}
