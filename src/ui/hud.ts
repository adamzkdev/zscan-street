import * as THREE from "three";
import type { Block, BlockSummary, Tx } from "../data/types";
import { KIND_HELP, KIND_LABEL } from "../data/types";
import { Market, type BlockFlow } from "../data/market";
import { API, EXPLORER, links, ZScan } from "../data/zscan";
import type { Mode, Shot } from "../scene/camera";
import { AREAS } from "../scene/city";
import type { BusPhase, Director } from "../scene/director";
import { KIND_COLOR, type Snark } from "../scene/snark";
import type { Theme } from "../scene/theme";
import type { Interior, PickInfo } from "../interior/types";

/** ZIP 317 marginal fee (zat) per logical action, before the drop at mainnet height 3,590,000. */
const MARGINAL_FEE = 5000;
/** Zcash block target. */
const TARGET_S = 75;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const zec = (zat: number, digits = 5) => `${(zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })} ZEC`;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** The ZScan shield (brand/zscan-mark.svg): gold shield, Z, dashed green line. */
const MARK = `<svg class="mark" viewBox="0 0 32 32"><path d="M16 2.5 27.5 7v8.6c0 7-4.8 11.9-11.5 13.9C9.3 27.5 4.5 22.6 4.5 15.6V7L16 2.5Z" fill="none" stroke="#f4b728" stroke-width="2" stroke-linejoin="round"/><path d="M11 11h10l-10 10h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 16h17" stroke="#1baf7a" stroke-width="1.2" stroke-dasharray="2 2" opacity=".85"/></svg>`;

const ICON: Record<string, string> = {
  follow: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  ext: '<path d="M7 17L17 7M9 7h8v8"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  ccw: '<path d="M4 4v6h6"/><path d="M4.5 15a8 8 0 1 0 1.9-8.3L4 10"/>',
  cw: '<path d="M20 4v6h-6"/><path d="M19.5 15a8 8 0 1 1-1.9-8.3L20 10"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="1"/><path d="M16 10l5-3v10l-5-3"/>',
  map: '<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  parcel: '<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  hand: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.6 14.6a1.5 1.5 0 0 1 2.4-1.8L7 14"/>',
  stop: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  car: '<path d="M3 15l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 21v-3M16 21v-3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  block: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/>',
  pulse: '<path d="M2 12h4l3-8 4 16 3-8h6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path class="w1" d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path class="w2" d="M18.5 7a7 7 0 0 1 0 10"/><path class="x" d="M16 9l5 6M21 9l-5 6"/>',
};
const icon = (k: string) => `<svg class="i" viewBox="0 0 24 24">${ICON[k]}</svg>`;

export interface HudCallbacks {
  mode(m: "live" | "overview" | "free"): void;
  district(key: string): void;
  lookIn(key: string): void;
  follow(s: Snark): void;
  followNextBus(): void;
  pickShot(s: Shot | null): void;
  setAuto(on: boolean): void;
  setRain(on: boolean): void;
  setTheme(t: Theme): void;
  setSound(on: boolean): Promise<void>;
  zoom(k: number): void;
  turn(rad: number): void;
  home(): void;
  exitFollow(): void;
  select(s: Snark | null): void;
  /** Walk into a place: the MEMPOOL shop, the mining hall, the card shop, the bank. */
  enterPlace(key: string): void;
  floor(n: number): void;
  leave(): void;
}

type Section = "block" | "mempool" | "market" | "supply" | "network";
const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

/** Price line for the market section. */
function sparkSvg(pts: [number, number][], up: boolean) {
  const vs = pts.map((p) => p[1]);
  const lo = Math.min(...vs),
    hi = Math.max(...vs);
  const W = 220,
    H = 54;
  const xy = vs.map((v, i) => `${((i / (vs.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6)).toFixed(1)}`);
  const c = up ? "var(--good)" : "var(--bad)";
  return `<svg class="sparkl" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polygon points="0,${H} ${xy.join(" ")} ${W},${H}" fill="${c}" opacity=".12"/><polyline points="${xy.join(" ")}" fill="none" stroke="${c}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
type BusInfo = { height: number; phase: BusPhase; carried: number; boarded: number; stop: string | null; txs: number };
/** Screen position of a world point, or null when it is off screen / behind the camera. */
export type Project = (v: THREE.Vector3) => { x: number; y: number } | null;

/** Where a carrier is in the life of its transaction, 0..4 (−1: not carrying). */
function stageOf(s: Snark, done = false): number {
  if (done) return 4;
  const h = s.txs.some((t) => t.height);
  switch (s.state) {
    case "arriving":
      return 0;
    case "shopping":
    case "vip":
      return 1;
    case "waiting":
      return 2;
    case "chauffeured":
      return h ? 3 : 2;
    case "boarding":
    case "riding":
      return 3;
    case "leaving":
      return h ? 4 : 2;
    default:
      return -1;
  }
}

const STAGES = ["Mempool", "Picked up", "At the stop", "On the bus", "Confirmed"];

export class Hud {
  private root = document.getElementById("ui")!;
  private $ = <T extends HTMLElement>(sel: string) => this.root.querySelector<T>(sel)!;
  private selected: Snark | null = null;
  private tab: "txs" | "traits" | "journey" = "txs";
  private section: Section | null = null;
  private flows = new Map<number, BlockFlow>();
  private stats: { mempool: number; shown: number; lastBlock: BlockSummary | null } = { mempool: 0, shown: 0, lastBlock: null };
  private status: "connecting" | "live" | "offline" = "connecting";
  private history: BlockSummary[] = [];
  private buses = new Map<number, BusInfo>();
  private busBlock: Block | null = null;
  private blockTimer: ReturnType<typeof setTimeout> | undefined;
  private mode: Mode = "live";
  private shot: Shot | null = null;
  private picked: Shot | null = null;
  private followed: Snark | null = null;
  /** Block a followed zkSNARK was confirmed in (kept after it leaves the street). */
  private flowDone: { s: Snark; height: number } | null = null;
  private auto = false;
  private rain = true;
  private theme: Theme;
  private sig = "";
  private trackSig = "";
  private camOpen = false;
  private labels = new Map<string, HTMLElement>();

  constructor(
    private cb: HudCallbacks,
    private director: Director,
    theme: Theme,
  ) {
    this.theme = theme;
    this.root.innerHTML = `
      <div class="lb"><i></i><i></i></div>
      <div class="labels"></div>
      <a class="brand" href="${EXPLORER}" target="_blank" rel="noopener" title="ZScan explorer">${MARK}<span><b>Z</b>STREET</span></a>
      <div class="corner">
        <div class="seg" role="group" aria-label="Theme"><button data-theme="day" aria-label="Day" title="Day">${icon("sun")}</button><button data-theme="night" aria-label="Night" title="Night">${icon("moon")}</button></div>
        <button class="hbtn sound" data-act="sound" aria-label="Sound" title="Sound">${icon("sound")}</button>
      </div>
      <nav class="rail">
        <button data-act="zoom-in" title="Zoom in">${icon("plus")}</button>
        <button data-act="zoom-out" title="Zoom out">${icon("minus")}</button>
        <i></i>
        <button data-act="turn-l" title="Turn left">${icon("ccw")}</button>
        <button data-act="turn-r" title="Turn right">${icon("cw")}</button>
        <button data-act="home" title="Back to the start">${icon("home")}</button>
        <i></i>
        <button data-act="cam" title="Camera and places">${icon("camera")}</button>
        <div class="campop hud hidden"></div>
      </nav>
      <aside class="panel hud"></aside>
      <section class="strip hud"></section>
      <div class="toast hud hidden"></div>
      <div class="indoor"></div>
      <div class="followhead hud hidden"></div>
      <div class="shots hud hidden"></div>
      <div class="tip"></div>
      <div class="cut"></div>
      <div class="loading"><div>${MARK}<span>LOADING THE STREET</span></div></div>`;

    this.root.addEventListener("click", (e) => this.onClick(e));
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (this.camOpen) this.setCam(false);
      else if (this.section) {
        this.section = null;
        this.renderStrip(true);
      }
      else if (this.mode === "follow" || this.mode === "inspect") cb.exitFollow();
      else cb.select(null);
    });
    document.addEventListener("pointerdown", (e) => {
      if (this.camOpen && !(e.target as HTMLElement).closest(".campop,[data-act=cam]")) this.setCam(false);
    });
    setInterval(() => this.tick(), 1000);
    void fetch(`${API}/v1/blocks?limit=24`)
      .then((r) => (r.ok ? r.json() : []))
      .then((b: BlockSummary[]) => {
        this.history = b.reverse();
        this.renderStrip(true);
      })
      .catch(() => {});
    this.renderTheme();
    this.renderStrip(true);
    Market.subscribe(() => this.renderStrip(true));
  }

  // ---- inputs ---------------------------------------------------------------------------------

  ready() {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      setTimeout(() => boot.remove(), 900);
    }
    const l = this.root.querySelector<HTMLElement>(".loading");
    if (!l) return;
    l.style.opacity = "0";
    setTimeout(() => l.remove(), 900);
  }

  setStatus(s: "connecting" | "live" | "offline") {
    this.status = s;
    this.renderStrip(true);
  }

  setStats(s: { mempool: number; shown: number; lastBlock: BlockSummary | null }) {
    this.stats = s;
    this.renderStrip();
  }

  bus(phase: BusPhase, b: Block, carried: number, stop: string | null = null) {
    this.busBlock = b;
    const info = this.buses.get(b.height) ?? { height: b.height, phase, carried, boarded: 0, stop, txs: b.txs.length };
    info.phase = phase;
    info.carried = Math.max(info.carried, carried);
    if (stop) info.stop = stop;
    if (phase === "departing" || phase === "confirmed") info.boarded = info.carried;
    this.buses.set(b.height, info);
    if (phase === "confirmed") {
      const summary = { height: b.height, hash: "", time: new Date(b.time).toISOString(), tx_count: b.txs.length + 1, size: b.size, fees: b.fees, miner_pool: b.pool };
      if (!this.history.some((h) => h.height === b.height)) this.history = [...this.history, summary].slice(-24);
      this.showToast(b, info.carried);
      setTimeout(() => {
        this.buses.delete(b.height);
        this.renderStrip(true);
      }, 6000);
    }
    this.renderStrip(true);
  }

  /** Camera told us what it is showing. */
  camera(shot: Shot | null, mode: Mode, picked: Shot | null, auto: boolean, place = "the MEMPOOL shop") {
    this.place = place;
    this.shot = shot;
    this.mode = mode;
    this.picked = picked;
    this.auto = auto;
    const following = mode === "follow" || mode === "inspect";
    this.root.classList.toggle("following", following);
    this.$(".followhead").classList.toggle("hidden", !following);
    this.$(".shots").classList.toggle("hidden", !following);
    this.root.classList.toggle("letterbox", !!shot);
    if (this.camOpen) this.renderCam();
    this.renderFollow();
    this.renderStrip(true);
  }

  cut() {
    const c = this.$(".cut");
    c.classList.remove("go");
    void c.offsetWidth;
    c.classList.add("go");
  }

  follow(s: Snark | null) {
    this.followed = s;
    this.flowDone = null;
    this.renderFollow();
    this.renderStrip(true);
  }

  /** The followed zkSNARK's block was confirmed and it left the street. */
  flowConfirmed(height: number) {
    if (this.followed) this.flowDone = { s: this.followed, height };
    this.renderStrip(true);
  }

  /** A block box from the shop shelves: what it carried, with links to ZScan. */
  showBlock(b: BlockSummary) {
    this.selected = null;
    const panel = this.$(".panel");
    const txs = Math.max(0, b.tx_count - 1);
    const draw = (detail: Block | null, flow: BlockFlow | null) => {
      if (this.selected || panel.dataset.item !== `b${b.height}`) return;
      const kinds = detail ? [...new Set(detail.txs.map((t) => t.kind))] : [];
      panel.innerHTML = `
        <header>
          <span class="thumb blockthumb">${icon("block")}</span>
          <div class="grow"><div class="eyebrow">Block · on the shelf</div><h2 class="mono">${num(b.height)}</h2><div class="muted">${ago(Date.parse(b.time))} ago · ${esc(b.miner_pool ?? "unknown pool")}</div></div>
          <button class="x" data-act="close" aria-label="Close">${icon("close")}</button>
        </header>
        <div class="state"><span class="tag ${txs ? "ok" : "muted"}">${txs ? (kinds.length === 1 ? `${KIND_LABEL[kinds[0]]} block` : kinds.length ? "Mixed block" : `${txs} transactions`) : "Coinbase only"}</span><span class="muted">${txs} tx · ${(b.size / 1000).toFixed(1)} kB</span></div>
        <dl class="stats">
          <div><dt>Fees</dt><dd>${zec(b.fees ?? 0, 5).replace(" ZEC", "")}</dd></div>
          <div><dt>Public out</dt><dd>${flow ? zec(flow.publicOut, 2).replace(" ZEC", "") : "…"}</dd></div>
          <div><dt>Shielded Δ</dt><dd>${flow ? (((flow.deltas.sapling ?? 0) + (flow.deltas.orchard ?? 0) + (flow.deltas.ironwood ?? 0)) / 1e8).toFixed(2) : "…"}</dd></div>
          <div><dt>Tx</dt><dd>${txs}</dd></div>
        </dl>
        <div class="pbody">${
          detail
            ? detail.txs.length
              ? detail.txs.map((t) => this.txRow(t)).join("")
              : `<div class="note">Only the miner's reward (coinbase) is in this block.</div>`
            : `<div class="note">Opening the box…</div>`
        }</div>
        <div class="actions"><a class="btn primary" href="${links.block(b.height)}" target="_blank" rel="noopener">Block on ZScan ${icon("ext")}</a></div>`;
    };
    panel.dataset.item = `b${b.height}`;
    panel.classList.add("open");
    this.root.classList.add("inspecting");
    let detail: Block | null = null,
      flow: BlockFlow | null = null;
    draw(null, null);
    void ZScan.block(b.height).then((d) => draw((detail = d), flow));
    void Market.flow(b.height).then((f) => draw(detail, (flow = f)));
  }

  /** A parcel from the shop's pickup rack: a mempool transaction. */
  showTx(t: Tx) {
    this.selected = null;
    const panel = this.$(".panel");
    const carrier = this.director.snarkOf(t.txid);
    panel.dataset.item = `t${t.txid}`;
    panel.innerHTML = `
      <header>
        <span class="thumb blockthumb" style="color:${KIND_COLOR[t.kind]}">${icon("parcel")}</span>
        <div class="grow"><div class="eyebrow">Parcel · mempool transaction</div><h2 class="mono">${short(t.txid)}</h2><div class="muted">waiting ${ago(t.seenAt)} for a block</div></div>
        <button class="x" data-act="close" aria-label="Close">${icon("close")}</button>
      </header>
      <div class="state"><span class="tag" style="color:${KIND_COLOR[t.kind]}">${KIND_LABEL[t.kind]}</span><span class="muted">${esc(KIND_HELP[t.kind])}</span></div>
      <dl class="stats">
        <div><dt>Fee</dt><dd>${t.fee == null ? "—" : zec(t.fee, 6).replace(" ZEC", "")}</dd></div>
        <div><dt>Actions</dt><dd>${t.actions}</dd></div>
        <div><dt>Size</dt><dd>${(t.size / 1000).toFixed(1)} kB</dd></div>
        <div><dt>Public out</dt><dd>${t.transparentOut ? zec(t.transparentOut, 3).replace(" ZEC", "") : "—"}</dd></div>
      </dl>
      <div class="pbody">${this.txRow(t)}</div>
      <div class="actions">
        <a class="btn primary" href="${links.tx(t.txid)}" target="_blank" rel="noopener">Transaction on ZScan ${icon("ext")}</a>
        ${carrier ? `<button class="btn" data-tx="${t.txid}">${icon("follow")}Its carrier</button>` : ""}
      </div>`;
    panel.classList.add("open");
    this.root.classList.add("inspecting");
  }

  open(s: Snark) {
    delete this.$(".panel").dataset.item;
    if (this.selected !== s) this.tab = s.txs.length ? "txs" : "traits";
    this.selected = s;
    this.renderPanel();
    this.$(".panel").classList.add("open");
    this.root.classList.add("inspecting");
    this.renderStrip(true);
  }

  close() {
    this.selected = null;
    delete this.$(".panel").dataset.item;
    this.$(".panel").classList.remove("open");
    this.root.classList.remove("inspecting");
    this.renderStrip(true);
  }

  // ---- events ---------------------------------------------------------------------------------

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>("[data-shop],[data-act],[data-tab],[data-sec],[data-shot],[data-district],[data-tx],[data-theme],[data-bus],[data-place],[data-floor]");
    if (!el) return;
    const d = el.dataset;
    if (d.theme) {
      this.theme = d.theme as Theme;
      this.renderTheme();
      this.cb.setTheme(this.theme);
      if (this.camOpen) this.renderCam();
      return;
    }
    if (d.shop) {
      this.setCam(false);
      return this.cb.lookIn(d.shop);
    }
    if (d.floor !== undefined) return this.cb.floor(Number(d.floor));
    if (d.place) {
      this.setCam(false);
      return this.cb.enterPlace(d.place);
    }
    if (d.tab) {
      this.tab = d.tab as typeof this.tab;
      return this.renderPanel();
    }
    if (d.sec) {
      this.section = this.section === d.sec || el.classList.contains("chev") && this.section ? null : (d.sec as Section);
      return this.renderStrip(true);
    }
    if (d.shot !== undefined) return this.cb.pickShot(d.shot ? (d.shot as Shot) : null);
    if (d.district) {
      this.setCam(false);
      return this.cb.district(d.district);
    }
    if (d.tx) {
      const s = this.director.snarkOf(d.tx);
      if (s) this.followSnark(s);
      return;
    }
    if (d.bus) return this.cb.followNextBus();
    switch (d.act) {
      case "live":
      case "overview":
      case "free":
        this.setCam(false);
        return this.cb.mode(d.act);
      case "zoom-in":
        return this.cb.zoom(1.35);
      case "zoom-out":
        return this.cb.zoom(1 / 1.35);
      case "turn-l":
        return this.cb.turn(Math.PI / 4);
      case "turn-r":
        return this.cb.turn(-Math.PI / 4);
      case "home":
        return this.cb.home();
      case "cam":
        return this.setCam(!this.camOpen);
      case "close":
        return this.cb.select(null);
      case "leave":
        return this.cb.leave();
      case "follow":
        if (this.selected) this.cb.follow(this.selected);
        return;
      case "unfollow":
      case "exit":
        return this.cb.exitFollow();
      case "next-bus":
        this.setCam(false);
        return this.cb.followNextBus();
      case "auto":
        this.cb.setAuto(!this.auto);
        return this.renderCam();
      case "sound": {
        const on = !el.classList.contains("on");
        el.classList.toggle("on", on);
        void this.cb.setSound(on);
        return;
      }
      case "rain":
        this.rain = !this.rain;
        this.cb.setRain(this.rain);
        return this.renderCam();
      case "follow-random": {
        this.setCam(false);
        const c = [...this.director.snarks].filter((s) => s.state === "waiting" || s.state === "arriving");
        const s = c[Math.floor(Math.random() * c.length)];
        if (s) this.followSnark(s);
        return;
      }
    }
  }

  private followSnark(s: Snark) {
    this.cb.select(s);
    this.cb.follow(s);
  }

  private setCam(on: boolean) {
    this.camOpen = on;
    this.$(".campop").classList.toggle("hidden", !on);
    this.root.querySelector("[data-act=cam]")!.classList.toggle("on", on);
    if (on) this.renderCam();
  }

  private tick() {
    this.renderStrip();
    if (this.selected) {
      if (this.signature(this.selected) !== this.sig) this.renderPanel();
      else {
        const [st, stv, tone] = this.stateLine(this.selected);
        const el = this.root.querySelector(".panel .state");
        if (el) el.innerHTML = `<span class="tag ${tone}">${st}</span><span class="muted">${stv}</span>`;
      }
    }
    if (this.mode === "follow") this.renderFollow();
  }

  /** Small label that follows the cursor over a zkSNARK. */
  hover(s: Snark | null, x = 0, y = 0) {
    const tip = this.$(".tip");
    if (!s || s === this.selected) return void tip.classList.remove("on");
    const t = s.txs[0];
    const what = s.state === "guard" ? `Bodyguard${s.rank ? ` · rank #${num(s.rank)}` : ""}` : s.role ?? (t ? `${KIND_LABEL[t.kind]}${t.fee != null ? ` · ${zec(t.fee, 5)}` : ""}` : "Lives here");
    tip.innerHTML = `${t ? `<i style="background:${KIND_COLOR[t.kind]}"></i>` : ""}<b>#${num(s.id)}</b><span>${esc(what)}</span>`;
    tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
    tip.classList.add("on");
  }

  private places: { key: string; label: string; sub: string; at: THREE.Vector3 }[] = [];
  /** The place under the cursor: its tag shows for a moment, and while the tag itself is hovered. */
  private hovered: { key: string; until: number } | null = null;
  private tagHover = false;
  hoverPlace(key: string | null) {
    if (key) this.hovered = { key, until: performance.now() + 1200 };
  }

  // ---- inside a place -----------------------------------------------------------------------

  private indoor: Interior | null = null;
  enterInterior(i: Interior, floor: number) {
    this.indoor = i;
    this.root.classList.add("indoors");
    this.cb.select(null);
    this.renderIndoor(floor);
  }
  leaveInterior() {
    this.indoor = null;
    this.root.classList.remove("indoors");
    this.close();
  }
  renderIndoor(floor: number) {
    const i = this.indoor;
    if (!i) return;
    const f = i.floors[floor];
    this.$(".indoor").innerHTML = `
      <div class="ihead hud"><span class="rec"></span><b>${esc(i.title)}</b><span>${esc(f.name)}</span></div>
      ${
        i.floors.length > 1
          ? `<nav class="lift hud"><div class="mh">Floors</div>${i.floors
              .map((x, k) => `<button data-floor="${k}" class="${k === floor ? "on" : ""}" title="${esc(x.name)}"><b>${esc(x.label)}</b><span>${esc(x.name)}</span></button>`)
              .reverse()
              .join("")}</nav>`
          : ""
      }
      <button class="leave hud" data-act="leave">${icon("close")}Leave <kbd>Esc</kbd></button>
      <div class="ihint">${"<kbd>Z Q S D</kbd> / <kbd>W A S D</kbd> walk · <kbd>drag</kbd> look · <kbd>scroll</kbd> step · <kbd>Shift</kbd> hurry · <kbd>click</kbd> inspect"}</div>`;
  }

  /** Info about something clicked inside. */
  showPick(p: PickInfo) {
    this.selected = null;
    const panel = this.$(".panel");
    panel.dataset.item = "pick";
    panel.innerHTML = `
      <header>
        ${p.image ? `<img class="thumb" src="${p.image}" alt="" />` : `<span class="thumb blockthumb">${icon("block")}</span>`}
        <div class="grow"><div class="eyebrow">${p.eyebrow}</div><h2 class="${p.mono ? "mono" : ""}">${p.title}</h2></div>
        <button class="x" data-act="close" aria-label="Close">${icon("close")}</button>
      </header>
      ${p.tag ? `<div class="state"><span class="tag ${p.tag[1]}">${p.tag[0]}</span></div>` : ""}
      ${p.stats?.length ? `<dl class="stats">${p.stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
      ${p.body ? `<div class="pbody">${p.body}</div>` : ""}
      ${p.link ? `<div class="actions"><a class="btn primary" href="${p.link.href}" target="_blank" rel="noopener">${p.link.label} ${icon("ext")}</a></div>` : ""}`;
    panel.classList.add("open");
    this.root.classList.add("inspecting");
  }
  setPlaces(p: { key: string; label: string; sub: string; at: THREE.Vector3 }[]) {
    this.places = p;
  }

  /** Plain label under the cursor (shops, shelves). */
  hoverText(text: string | null, x = 0, y = 0) {
    const tip = this.$(".tip");
    if (!text) return void tip.classList.remove("on");
    tip.innerHTML = text;
    tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
    tip.classList.add("on");
  }

  // ---- in-world labels --------------------------------------------------------------------------

  private pos = new THREE.Vector3();

  /** Tags over the selected zkSNARK and the buses, placed every frame. */
  frame(project: Project) {
    const want = new Map<string, { at: THREE.Vector3; html: string; cls: string }>();
    const s = this.selected;
    if (s && s.root.visible && s.root.parent && s.state !== "riding" && this.mode !== "follow") {
      s.root.getWorldPosition(this.pos);
      want.set(`s${s.id}`, { at: this.pos.clone().setY(this.pos.y + 2.3), cls: "pinlabel", html: `<b>#${num(s.id)}</b>` });
    }
    if (!this.root.classList.contains("letterbox"))
      for (const b of this.director.buses) {
        if (!b.group.parent || !b.blockHeight) continue;
        const info = this.buses.get(b.blockHeight);
        b.group.getWorldPosition(this.pos);
        const ph = info?.phase === "boarding" ? `${Math.max(info.boarded, this.onBoard(b.blockHeight))}/${info.carried}` : info?.phase === "departing" ? "→" : "";
        want.set(`b${b.blockHeight}`, { at: this.pos.clone().setY(this.pos.y + b.height + 0.8), cls: "buslabel", html: `<b>${num(b.blockHeight)}</b>${ph ? `<span>${ph}</span>` : ""}` });
      }
    // the walk-in place under the cursor gets its tag over the door (name, and the way in)
    const hv = this.hovered;
    const showTag = hv && (performance.now() < hv.until || this.tagHover) && !this.indoor && !this.root.classList.contains("letterbox") && (this.mode === "live" || this.mode === "free" || this.mode === "district");
    if (!showTag) this.tagHover = false;
    if (showTag)
      for (const p of this.places.filter((x) => x.key === hv.key))
        want.set(`p${p.key}`, { at: p.at, cls: "placetag", html: `<button data-place="${p.key}"><b>${p.label}</b><span>${p.sub}</span><i>ENTER ▸</i></button>` });
    for (const [k, el] of this.labels)
      if (!want.has(k)) {
        el.remove();
        this.labels.delete(k);
      }
    const layer = this.$(".labels");
    if (!layer.dataset.wired) {
      layer.dataset.wired = "1";
      layer.addEventListener("pointerover", (e) => (this.tagHover = !!(e.target as HTMLElement).closest(".placetag")));
      layer.addEventListener("pointerout", () => (this.tagHover = false));
    }
    for (const [k, w] of want) {
      let el = this.labels.get(k);
      if (!el) {
        el = document.createElement("div");
        el.className = w.cls;
        layer.append(el);
        this.labels.set(k, el);
      }
      if (el.dataset.html !== w.html) {
        el.innerHTML = w.html;
        el.dataset.html = w.html;
      }
      const p = project(w.at);
      el.style.display = p ? "" : "none";
      if (p) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  // ---- rendering ------------------------------------------------------------------------------

  private renderTheme() {
    this.root.querySelectorAll<HTMLElement>("[data-theme]").forEach((b) => b.classList.toggle("on", b.dataset.theme === this.theme));
  }

  private renderCam() {
    const item = (act: string, ic: string, label: string, on = false) => `<button class="row ${on ? "on" : ""}" data-act="${act}">${icon(ic)}<span>${label}</span></button>`;
    const sites = this.director.shopSites();
    this.$(".campop").innerHTML = `
      <div class="mh">Camera</div>
      ${item("live", "home", "Live view", this.mode === "live")}
      ${item("overview", "map", "Overview", this.mode === "overview")}
      ${item("free", "camera", "Free camera", this.mode === "free")}
      ${item("follow-random", "follow", "Follow a zkSNARK")}
      ${item("next-bus", "bus", "Follow the next block")}
      <div class="mh">Places</div>
      ${AREAS.map((d) => `<button class="row" data-district="${d.key}"><i class="kind" style="background:${d.color}"></i><span>${d.name}</span></button>`).join("")}
      <button class="row" data-shop="downtown">${icon("parcel")}<span>Inside the MEMPOOL shop</span><small>${sites[0]?.waiting ?? 0}</small></button>
      <div class="mh">Options</div>
      <div class="switch"><span>Cut to the bus stop</span><button class="toggle ${this.auto ? "on" : ""}" data-act="auto" aria-label="Toggle cinematic cuts"></button></div>
      ${this.theme === "night" ? `<div class="switch"><span>Rain</span><button class="toggle ${this.rain ? "on" : ""}" data-act="rain" aria-label="Toggle rain"></button></div>` : ""}
      <div class="keys">drag move · right-drag turn · scroll zoom · WASD fly</div>`;
  }

  /** zkSNARKs from this street already on board the bus of block `h`. */
  private onBoard(h: number) {
    let n = 0;
    for (const s of this.director.snarks) if (s.bus?.blockHeight === h && (s.state === "riding" || s.state === "chauffeured")) n++;
    return n;
  }

  /**
   * The thin bar at the bottom: one reading per subject (last block, mempool, market, supply,
   * network). A click on a reading unfolds that subject above the bar.
   */
  private renderStrip(force = false) {
    const el = this.$(".strip");
    const lb = this.stats.lastBlock;
    const since = lb ? Date.parse(lb.time) : 0;
    const sec = lb ? (Date.now() - since) / 1000 : 0;
    const m = Market.state;
    const txs = this.director.mempoolList();
    const sig = [this.status, lb?.height, Math.floor(sec), this.section, txs.length, txs[0]?.txid, this.buses.size, this.history.length, m.price?.usd, m.supply?.height, this.flowSig].join("|");
    if (!force && sig === this.trackSig) return;
    this.trackSig = sig;

    const k = Math.min(1, sec / TARGET_S);
    const ring = `<svg class="ring" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" class="bg"/><circle cx="10" cy="10" r="7.5" class="fg ${sec > TARGET_S ? "late" : ""}" style="stroke-dasharray:${(k * 47.1).toFixed(1)} 47.1"/></svg>`;
    const p = m.price;
    const up = (p?.usd_24h_change ?? 0) >= 0;
    const item = (key: Section, inner: string, title: string) => `<button class="rd ${this.section === key ? "on" : ""}" data-sec="${key}" title="${title}">${inner}</button>`;
    const bar = `<div class="bar">
      <span class="live ${this.status}"><i></i>${this.status === "live" ? "LIVE" : this.status === "offline" ? "OFFLINE" : "…"}</span>
      ${item("block", `${ring}<span class="mono">${lb ? num(lb.height) : "—"}</span><small>${lb ? ago(since) : ""}</small>`, "Last block")}
      ${item("mempool", `${icon("parcel")}<span class="mono">${this.stats.mempool}</span><small>TX</small>`, "Mempool")}
      ${item("market", `${icon("chart")}<span class="mono">${p ? usd(p.usd) : "—"}</span>${p ? `<small class="${up ? "up" : "down"}">${up ? "▲" : "▼"}${Math.abs(p.usd_24h_change).toFixed(1)}%</small>` : ""}`, "ZEC market")}
      ${item("supply", `${icon("coins")}<span class="mono">${m.supply ? `${(m.supply.supply / 1e14).toFixed(2)}M` : "—"}</span>${m.pools ? `<small>${Math.round(m.pools.shielded_ratio * 100)}% ${icon("shield")}</small>` : ""}`, "Supply")}
      ${item("network", `${icon("pulse")}<span class="mono">${m.network ? `${(m.network.solps / 1e9).toFixed(1)}` : "—"}</span><small>GSOL/S</small>`, "Network")}
      <span class="chev" data-sec="${this.section ?? "block"}">${icon("up")}</span>
    </div>`;
    el.classList.toggle("open", !!this.section);
    // the unfold animation plays when a section opens, not on every refresh
    const fresh = this.section !== this.shown;
    this.shown = this.section;
    const scroll = el.querySelector(".rows")?.scrollTop ?? 0;
    el.innerHTML = (this.section ? `<div class="details ${fresh ? "anim" : ""}">${this.sectionHtml(this.section)}</div>` : "") + bar;
    const rows = el.querySelector(".rows");
    if (rows) rows.scrollTop = scroll;
  }
  private shown: Section | null = null;
  private place = "the MEMPOOL shop";

  private flowSig = "";

  private sectionHtml(sec: Section): string {
    const m = Market.state;
    const cell = (k: string, v: string, sub = "") => `<div class="cell"><dt>${k}</dt><dd>${v}</dd>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const head = (t: string, right = "") => `<div class="dh"><b>${t}</b>${right}</div>`;
    switch (sec) {
      case "block": {
        const lb = this.stats.lastBlock;
        if (!lb) return head("LAST BLOCK") + `<div class="empty">Waiting for the feed…</div>`;
        const f = this.flows.get(lb.height);
        if (!f)
          void Market.flow(lb.height).then((x) => {
            if (!x) return;
            this.flows.set(lb.height, x);
            this.flowSig = String(lb.height);
            this.renderStrip(true);
          });
        const shieldedIn = f ? (f.deltas.sapling ?? 0) + (f.deltas.orchard ?? 0) + (f.deltas.ironwood ?? 0) : null;
        const max = Math.max(1, ...this.history.map((h) => h.tx_count));
        const sec = (Date.now() - Date.parse(lb.time)) / 1000;
        return `${head(`BLOCK <a class="mono" href="${links.block(lb.height)}" target="_blank" rel="noopener">${num(lb.height)} ${icon("ext")}</a>`, `<span class="muted">${ago(Date.parse(lb.time))} ago · ${sec > TARGET_S ? "next one is late" : `next in ~${Math.round(TARGET_S - sec)} s`}</span>`)}
          <dl class="cells">
            ${cell("Transactions", num(Math.max(0, lb.tx_count - 1)), "plus the coinbase")}
            ${cell("Public ZEC moved", f ? zec(f.publicOut, 2) : "…", "transparent outputs")}
            ${cell("Into shielded pools", shieldedIn == null ? "…" : `${shieldedIn >= 0 ? "+" : "−"}${zec(Math.abs(shieldedIn), 2)}`, "net, this block")}
            ${cell("Fees", zec(lb.fees ?? 0, 5))}
            ${cell("Size", `${(lb.size / 1000).toFixed(1)} kB`)}
            ${cell("Mined by", esc(lb.miner_pool ?? "unknown pool"))}
          </dl>
          <div class="spark" title="Transactions per block">${this.history
            .map((h) => `<a href="${links.block(h.height)}" target="_blank" rel="noopener" title="${num(h.height)} · ${Math.max(0, h.tx_count - 1)} tx" class="${h.height === lb.height ? "cur" : ""}" style="height:${Math.max(8, (h.tx_count / max) * 100)}%"></a>`)
            .join("")}</div>`;
      }
      case "mempool": {
        const txs = this.director.mempoolList();
        const fees = txs.reduce((a, t) => a + (t.fee ?? 0), 0);
        const kinds = (["shielded", "migration", "shielding", "deshielding", "transparent", "mixed"] as const).map((k) => [k, txs.filter((t) => t.kind === k).length] as const).filter(([, n]) => n);
        const oldest = txs[0];
        return `${head("MEMPOOL", `<span class="muted">${txs.length} waiting for a block</span>`)}
          <dl class="cells">
            ${cell("Pending", `${txs.length} tx`)}
            ${cell("Fees on offer", zec(fees, 5))}
            ${cell("Oldest", oldest ? ago(oldest.seenAt) : "—")}
            ${cell("Fully shielded", txs.length ? `${Math.round((txs.filter((t) => t.kind === "shielded" || t.kind === "migration").length / txs.length) * 100)}%` : "—")}
          </dl>
          ${kinds.length ? `<div class="stack">${kinds.map(([k, n]) => `<i style="flex:${n};background:${KIND_COLOR[k]}" title="${KIND_LABEL[k]} · ${n}"></i>`).join("")}</div><div class="legend">${kinds.map(([k, n]) => `<span><i class="kind" style="background:${KIND_COLOR[k]}"></i>${KIND_LABEL[k]} ${n}</span>`).join("")}</div>` : ""}
          <div class="rows">${
            txs.length
              ? txs
                  .slice()
                  .reverse()
                  .map((t) => {
                    const c = this.director.snarkOf(t.txid);
                    const st = c ? stageOf(c) : -1;
                    return `<div class="tr"><i class="kind" style="background:${KIND_COLOR[t.kind]}"></i><a class="mono" href="${links.tx(t.txid)}" target="_blank" rel="noopener">${short(t.txid)}</a><span class="muted">${KIND_LABEL[t.kind]} · ${st >= 0 ? STAGES[st].toLowerCase() : "on the rack"}</span><span class="r">${t.fee == null ? "—" : zec(t.fee, 5)}</span><span class="r muted">${ago(t.seenAt)}</span>${c ? `<button class="eye" data-tx="${t.txid}" title="Watch its carrier">${icon("follow")}</button>` : "<i></i>"}</div>`;
                  })
                  .join("")
              : `<div class="empty">The mempool is empty right now.</div>`
          }</div>`;
      }
      case "market": {
        const p = m.price;
        if (!p) return head("ZEC MARKET") + `<div class="empty">Loading…</div>`;
        const up = p.usd_24h_change >= 0;
        return `${head("ZEC / USD", `<span class="${up ? "up" : "down"} mono">${up ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(2)}% 24h</span>`)}
          <div class="mk">
            <div><div class="big mono">${usd(p.usd)}</div>${sparkSvg([...p.history, [Date.now(), p.usd]], up)}<small class="muted">last ${p.history.length} days</small></div>
            <dl class="cells two">
              ${cell("Market cap", usd(p.market_cap_usd))}
              ${cell("24h volume", usd(p.volume_24h_usd))}
              ${cell("24h change", `${up ? "+" : "−"}${usd(Math.abs((p.market_cap_usd * p.usd_24h_change) / (100 + p.usd_24h_change)))}`, "market cap")}
              ${cell("Fully diluted", m.supply ? usd((p.market_cap_usd / m.supply.supply) * m.supply.max_supply) : "—", "at 21M ZEC")}
            </dl>
          </div>`;
      }
      case "supply": {
        const s = m.supply,
          pl = m.pools;
        if (!s) return head("SUPPLY") + `<div class="empty">Loading…</div>`;
        const days = Math.max(0, Math.round((Date.parse(s.next_halving_eta) - Date.now()) / 86400000));
        const POOL = [
          ["transparent", "Transparent", "#eda100"],
          ["sprout", "Sprout", "#9085e9"],
          ["sapling", "Sapling", "#3987e5"],
          ["orchard", "Orchard", "#eb6834"],
          ["ironwood", "Ironwood", "#1baf7a"],
        ] as const;
        return `${head("ZEC SUPPLY", `<span class="muted mono">${(s.supply / 1e14).toFixed(3)}M / 21M · ${((s.supply / s.max_supply) * 100).toFixed(1)}% mined</span>`)}
          <div class="supbar"><i style="width:${(s.supply / s.max_supply) * 100}%"></i></div>
          ${
            pl
              ? `<div class="stack">${POOL.map(([k, n, c]) => `<i style="flex:${pl.pools[k]};background:${c}" title="${n} · ${zec(pl.pools[k], 0)}"></i>`).join("")}</div>
                 <div class="legend">${POOL.map(([k, n, c]) => `<span><i class="kind" style="background:${c}"></i>${n} ${((pl.pools[k] / s.supply) * 100).toFixed(1)}%</span>`).join("")}</div>`
              : ""
          }
          <dl class="cells">
            ${cell("Shielded", pl ? `${(pl.shielded_ratio * 100).toFixed(1)}%` : "—", pl ? zec(pl.shielded, 0) : "")}
            ${cell("Inflation", `${(s.inflation_rate * 100).toFixed(2)}%`, "per year")}
            ${cell("Next halving", `${num(days)} days`, `block ${num(s.next_halving_height)}`)}
            ${cell("Block reward", zec(s.block_subsidy, 4))}
            ${cell("Lockbox", zec(s.lockbox, 0))}
          </dl>`;
      }
      case "network": {
        const n = m.network;
        if (!n) return head("NETWORK") + `<div class="empty">Loading…</div>`;
        return `${head("NETWORK", `<span class="muted">last 24 hours</span>`)}
          <dl class="cells">
            ${cell("Hashrate", `${(n.solps / 1e9).toFixed(2)} GSol/s`)}
            ${cell("Difficulty", `${(n.difficulty / 1e6).toFixed(1)}M`)}
            ${cell("Block time", `${n.avg_block_time.toFixed(1)} s`, "target 75 s")}
            ${cell("Transactions", num(n.txs_24h))}
            ${cell("Shielded tx", `${Math.round(n.shielded_tx_ratio_24h * 100)}%`)}
            ${cell("Fees paid", zec(n.fees_24h, 3))}
          </dl>`;
      }
    }
  }

  private showToast(b: Block, carried: number) {
    const card = this.$(".toast");
    const fees = b.txs.reduce((a, t) => a + (t.fee ?? 0), 0);
    card.innerHTML = `${icon("check")}<span>BLOCK <a class="mono" href="${links.block(b.height)}" target="_blank" rel="noopener">${num(b.height)}</a></span><small>${num(b.txs.length)} tx · ${zec(fees, 5)}${carried ? ` · ${carried} from this street` : ""}</small>`;
    card.classList.remove("hidden");
    clearTimeout(this.blockTimer);
    this.blockTimer = setTimeout(() => card.classList.add("hidden"), 7000);
  }

  private renderFollow() {
    const s = this.followed;
    const subject = this.mode === "inspect" ? this.place : s ? `zkSNARK #${num(s.id)}` : this.busBlock ? `block ${num(this.busBlock.height)}` : "the next block";
    const shotName: Record<Shot, string> = { "three-quarter": "¾ view", street: "street level", high: "from above", inside: "inside the bus", "bus-side": "alongside the bus", boarding: "at the stop", shop: "inside" };
    const done = this.flowDone && this.flowDone.s === s ? `<small class="up">confirmed in ${num(this.flowDone.height)}</small>` : "";
    this.$(".followhead").innerHTML = `<span class="rec"></span><span>${this.mode === "inspect" ? "INSIDE" : "FOLLOWING"}</span><b>${subject}</b>${this.shot ? `<small>${shotName[this.shot]}</small>` : ""}${done}`;
    const b = (shot: Shot | "", label: string) => `<button data-shot="${shot}" class="${(shot || null) === this.picked ? "on" : ""}">${label}</button>`;
    this.$(".shots").innerHTML = `${s ? `${b("", "Auto")}${b("three-quarter", "¾")}${b("street", "Street")}${b("high", "Above")}<i></i>` : ""}<button data-act="exit">Exit <kbd>Esc</kbd></button>`;
  }

  private stateLine(s: Snark): [string, string, string] {
    const h = s.txs.find((t) => t.height)?.height;
    switch (s.state) {
      case "arriving":
        return ["Walking to the shop", s.rush > 1 ? "running!" : "", "info"];
      case "shopping":
        return ["Picking up", "at the MEMPOOL shop", "info"];
      case "waiting":
        return ["Waiting for a block", s.txs.length ? `in mempool ${ago(Math.min(...s.txs.map((t) => t.seenAt)))}` : "", "warn"];
      case "boarding":
        return ["Boarding", h ? `block ${num(h)}` : "", "ok"];
      case "riding":
        return ["On the bus", h ? `block ${num(h)}` : "", "ok"];
      case "leaving":
        return [h ? "Delivered" : "Left the mempool", h ? "heading home" : "", h ? "ok" : "muted"];
      case "resident":
        return ["Lives here", "carrying nothing", "muted"];
      case "vip":
        return [s.ride === "limo" ? "Arrived by limousine" : "Arrived by taxi", s.txs[0]?.visible ? zec(s.txs[0].visible, 2) : "", "info"];
      case "chauffeured":
        return [h ? "Riding to its block" : `Waiting in a ${s.ride === "limo" ? "limousine" : "taxi"}`, h ? num(h) : "", h ? "ok" : "warn"];
      case "guard":
        return ["Bodyguard", s.rank ? `rank #${num(s.rank)}` : "", "info"];
    }
  }

  private signature(s: Snark) {
    return [s.id, s.state, !!s.item, this.tab, this.mode, this.followed === s, ...s.txs.map((t) => t.txid + (t.height ?? ""))].join("|");
  }

  private txRow(t: Tx) {
    const floor = MARGINAL_FEE * Math.max(2, t.actions);
    const amount = t.transparentOut > 0 ? `public out ${zec(t.transparentOut, 4)}` : t.kind === "shielded" || t.kind === "migration" ? "amount hidden" : "no public outputs";
    return `<div class="tx">
      <div class="line"><i class="kind" style="background:${KIND_COLOR[t.kind]}"></i><a class="mono" href="${links.tx(t.txid)}" target="_blank" rel="noopener">${short(t.txid)}</a><span class="muted" title="${esc(KIND_HELP[t.kind])}">${KIND_LABEL[t.kind]}</span><span class="fee mono">${t.fee == null ? "—" : zec(t.fee, 6)}</span></div>
      <div class="sub">${t.fee == null ? "" : `${num(t.fee)} zat · ZIP 317 asks ${num(floor)} · `}${t.actions} action${t.actions > 1 ? "s" : ""} · ${(t.size / 1000).toFixed(1)} kB · ${amount}${t.height ? ` · <span class="okt">mined ${num(t.height)}</span>` : ""}</div>
    </div>`;
  }

  private renderPanel() {
    const s = this.selected;
    if (!s) return;
    this.sig = this.signature(s);
    const it = s.item;
    const trait = (k: string) => it?.traits.find((t) => t.trait_type === k)?.value ?? "—";
    const fees = s.txs.reduce((a, t) => a + (t.fee ?? 0), 0);
    const [st, stv, tone] = this.stateLine(s);
    const rank = it?.rank ?? s.rank ?? null;
    const mined = s.txs.find((t) => t.height)?.height;
    const following = this.mode === "follow" && this.followed === s;
    const stage = stageOf(s);
    const role = s.state === "guard" ? "bodyguard" : s.state === "resident" ? "resident" : s.role ? "worker" : "carrier";
    const journey =
      stage < 0
        ? `<div class="note">Residents live in the city and carry nothing. Carriers appear when real transactions enter the mempool.</div>`
        : `<ol class="flow v">${STAGES.map((t, i) => `<li class="${i < stage ? "done" : i === stage ? "now" : ""}"><b>${t}${i === 3 && mined ? ` · ${num(mined)}` : ""}</b></li>`).join("")}</ol>`;
    this.$(".panel").innerHTML = `
      <header>
        <img class="thumb" src="${ZScan.zkSnarkImage(s.id)}" alt="" />
        <div class="grow"><div class="eyebrow">zkSNARK · ${role}</div><h2>${esc(s.name)}</h2><div class="muted">${esc(trait("Lineage"))}</div></div>
        <button class="x" data-act="close" aria-label="Close">${icon("close")}</button>
      </header>
      <div class="state"><span class="tag ${tone}">${st}</span><span class="muted">${stv}</span></div>
      <dl class="stats">
        <div><dt>Rank</dt><dd class="${rank && rank <= 500 ? "gold" : ""}">${rank ? `#${num(rank)}` : "—"}</dd></div>
        <div><dt>Carrying</dt><dd>${s.txs.length} tx</dd></div>
        <div><dt>Fees</dt><dd>${s.txs.length ? zec(fees, 6).replace(" ZEC", "") : "—"}</dd></div>
        <div><dt>Block</dt><dd>${mined ? num(mined) : s.txs.length ? "next" : "—"}</dd></div>
      </dl>
      <div class="tabs">
        <button data-tab="txs" class="${this.tab === "txs" ? "on" : ""}">Transactions</button>
        <button data-tab="traits" class="${this.tab === "traits" ? "on" : ""}">Traits</button>
        <button data-tab="journey" class="${this.tab === "journey" ? "on" : ""}">Journey</button>
      </div>
      <div class="pbody">${
        this.tab === "txs"
          ? s.txs.length
            ? s.txs.map((t) => this.txRow(t)).join("")
            : `<div class="note">Not carrying anything right now.</div>`
          : this.tab === "traits"
            ? `<dl class="kvlist">${(it?.traits ?? [])
                .filter((t) => t.trait_type !== "Background")
                .map((t) => `<div><dt>${esc(t.trait_type)}</dt><dd>${esc(t.value)}</dd></div>`)
                .join("")}${it ? "" : `<div><dt>Loading…</dt><dd></dd></div>`}</dl>${it?.last ? `<div class="note">Last sale ${zec(it.last, 3)} on Zilkroad.</div>` : ""}`
            : journey
      }</div>
      <div class="actions">
        <button class="btn ${following ? "" : "primary"}" data-act="${following ? "unfollow" : "follow"}">${icon("follow")}${following ? "Stop following" : "Follow"}</button>
        <a class="btn" href="${s.txs[0] ? links.tx(s.txs[0].txid) : it?.url ?? "https://zilkroad.com"}" target="_blank" rel="noopener">${s.txs[0] ? "ZScan" : "Zilkroad"} ${icon("ext")}</a>
      </div>
      <div class="note">The carrier is picked from the transaction id: casting, not ownership.</div>`;
  }
}
