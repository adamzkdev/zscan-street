import * as THREE from "three";
import { KIND_LABEL, type ArchiveBlock, type TxKind } from "../../data/types";
import { NODE_LABEL, shortAddr, zecText, type ArchiveTx, type Node } from "./money";
import { KIND_COLOR } from "../../scene/snark";
import { fitText } from "../../scene/fit";
import { canvasTex, JP, makeCanvas, MONO, scanlines } from "../factory/canvas";

/** What the archive's screens show: the block on the plinth, or the one being fetched. */
export interface ArchiveState {
  block: ArchiveBlock | null;
  /** Height being fetched (the screens say so), or null. */
  loading: number | null;
  error: string | null;
  /** Network upgrade in force at the block ("Sapling", "NU5", "Ironwood"…). */
  era: string;
  /** Latest height known, for confirmations and the "LIVE" badge. */
  tip: number;
  live: boolean;
  /** When the current block was laid out (seconds, the interior's clock): flaps flip from there. */
  shownAt: number;
}

const BG = "#06070a";
const INK = "#e8e4da";
const DIM = "#8a8a94";
const ORANGE = "#ff9f2e";
const TEAL = "#3ec9b0";
const num = (n: number) => n.toLocaleString("en-US");
const zec = (zat: number, d = 4) => (zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d });
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d < 730 ? `${d} days ago` : `${(d / 365.25).toFixed(1)} years ago`;
};
const KINDS: TxKind[] = ["shielded", "migration", "shielding", "deshielding", "transparent", "mixed", "coinbase"];

/** A canvas screen on a wall: `draw` runs when asked, the texture follows. */
export class Screen {
  readonly mesh: THREE.Mesh;
  readonly g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  constructor(
    readonly W: number,
    readonly H: number,
    widthM: number,
  ) {
    const { c, g } = makeCanvas(W, H);
    this.g = g;
    this.tex = canvasTex(c);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, (widthM * H) / W), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
  }
  draw(fn: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
    const g = this.g;
    g.save();
    g.fillStyle = BG;
    g.fillRect(0, 0, this.W, this.H);
    fn(g, this.W, this.H);
    g.restore();
    scanlines(g, this.W, this.H);
    this.tex.needsUpdate = true;
  }
}

function frame(g: CanvasRenderingContext2D, W: number, H: number, color: string) {
  g.save();
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.lineWidth = 4;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.restore();
}

function header(g: CanvasRenderingContext2D, jp: string, en: string, color: string, x = 34, y = 62) {
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.font = JP(30);
  const w = fitText(g, jp, x, y);
  g.font = MONO(24, 700);
  g.fillText(`  ${en}`, x + w, y - 2);
  g.shadowBlur = 0;
}

// ---- left wall: the block's card ------------------------------------------------------------------

export function drawCard(s: Screen, st: ArchiveState) {
  s.draw((g, W, H) => {
    frame(g, W, H, ORANGE);
    header(g, "ブロック", "BLOCK ARCHIVE", ORANGE);
    const b = st.block;
    if (st.loading !== null && (!b || b.height !== st.loading)) {
      g.fillStyle = INK;
      g.font = MONO(92, 800);
      fitText(g, `#${num(st.loading)}`, 34, 200);
      g.fillStyle = ORANGE;
      g.font = MONO(34, 700);
      g.fillText(`FETCHING${".".repeat(1 + (Math.floor(performance.now() / 350) % 3))}`, 38, 262);
      return;
    }
    if (!b) {
      g.fillStyle = st.error ? "#ff6a6a" : DIM;
      g.font = MONO(34, 700);
      fitText(g, st.error ?? "Pick a block at the console", 38, 210);
      return;
    }
    // height, date and age
    g.fillStyle = "#ffffff";
    g.shadowColor = ORANGE;
    g.shadowBlur = 18;
    g.font = MONO(108, 800);
    fitText(g, `#${num(b.height)}`, 30, 186, W * 0.66);
    g.shadowBlur = 0;
    const t = Date.parse(b.time);
    g.fillStyle = INK;
    g.font = MONO(28, 600);
    fitText(g, `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC · ${ago(t)}`, 38, 238);
    // the era badge on the right
    g.textAlign = "right";
    g.fillStyle = TEAL;
    g.font = MONO(22, 700);
    g.fillText("ERA", W - 40, 110);
    g.font = MONO(40, 800);
    fitText(g, st.era.toUpperCase(), W - 40, 158, W * 0.3);
    if (st.live && st.tip === b.height) {
      g.fillStyle = "#3ee08f";
      g.font = MONO(24, 800);
      g.fillText("● LIVE", W - 40, 200);
    }
    g.textAlign = "left";
    // figures
    const reward = b.coinbase_value ?? 0;
    const stats: [string, string][] = [
      ["TRANSACTIONS", num(b.tx_count)],
      ["SIZE", b.size >= 1e6 ? `${(b.size / 1e6).toFixed(2)} MB` : `${(b.size / 1000).toFixed(1)} kB`],
      ["FEES · ZEC", b.fees == null ? "—" : zec(b.fees, 6)],
      ["MINER REWARD · ZEC", reward ? zec(reward, 4) : "—"],
      ["MINED BY", b.miner_pool ?? (b.miner ? `${b.miner.slice(0, 7)}…${b.miner.slice(-4)}` : "—")],
      ["CONFIRMATIONS", b.confirmations ? num(b.confirmations) : st.tip ? num(Math.max(1, st.tip - b.height + 1)) : "—"],
    ];
    stats.forEach(([k, v], i) => {
      const x = 38 + (i % 3) * ((W - 76) / 3),
        y = 300 + Math.floor(i / 3) * 92;
      g.fillStyle = DIM;
      g.font = MONO(18, 600);
      fitText(g, k, x, y, (W - 90) / 3);
      g.fillStyle = INK;
      g.font = MONO(36, 800);
      fitText(g, v, x, y + 42, (W - 100) / 3);
    });
    // the kinds, as a bar along the bottom with their counts
    const counts = KINDS.map((k) => [k, b.txs.filter((x) => x.kind === k).length] as const).filter(([, n]) => n);
    const total = Math.max(1, b.txs.length);
    let x = 38;
    const barW = W - 76;
    for (const [k, n] of counts) {
      const w = (n / total) * barW;
      g.fillStyle = KIND_COLOR[k];
      g.fillRect(x, H - 96, Math.max(2, w - 3), 22);
      x += w;
    }
    x = 38;
    g.font = MONO(18, 600);
    for (const [k, n] of counts) {
      g.fillStyle = KIND_COLOR[k];
      g.fillRect(x, H - 52, 14, 14);
      g.fillStyle = INK;
      const label = `${KIND_LABEL[k]} ${n}`;
      g.fillText(label, x + 20, H - 39);
      x += g.measureText(label).width + 40;
      if (x > W - 120) break;
    }
    // hash, small, top right under the badge
    g.textAlign = "right";
    g.fillStyle = DIM;
    g.font = MONO(18, 500);
    g.fillText(`${b.hash.slice(0, 12)}…${b.hash.slice(-8)}`, W - 40, 238);
    g.textAlign = "left";
  });
}

// ---- shared: a transaction in one line ------------------------------------------------------------

/** What a transaction moved, in one line each way: from → to, the amount. */
export function summary(x: ArchiveTx) {
  const f = x.full;
  const known = x.moves.filter((m) => m.zat !== null);
  const main = known.sort((a, b) => b.zat! - a.zat!)[0] ?? x.moves[0];
  const addr = (a: string | null | undefined) => (a ? shortAddr(a) : null);
  const ins = (f?.inputs ?? []).map((i) => i.address).filter(Boolean) as string[];
  const outs = (f?.outputs ?? []).map((o) => o.address).filter(Boolean) as string[];
  const more = (l: string[]) => (l.length > 1 ? ` +${l.length - 1}` : "");
  const side = (n: Node, list: string[]) => (n === "transparent" ? (list.length ? `${addr(list[0])}${more(list)}` : "transparent") : NODE_LABEL[n]);
  const from = main ? side(main.from, ins) : "—";
  const to = main ? side(main.to, outs) : "—";
  const amount = main?.zat ? `${zecText(main.zat)} ZEC` : x.row.kind === "coinbase" ? "reward" : "🔒 hidden";
  return { from, to, amount, main };
}

// ---- right wall: the last 60 blocks, tap a bar to go there ----------------------------------------

export const HISTORY_N = 60;
const HIST = { x0: 40, y0: 120, w: 944, h: 300 };

export function historyAt(hist: { height: number }[], x: number, y: number) {
  if (y < HIST.y0 - 20 || y > HIST.y0 + HIST.h + 40 || x < HIST.x0 || x > HIST.x0 + HIST.w) return null;
  const i = Math.floor(((x - HIST.x0) / HIST.w) * HISTORY_N);
  return hist[i]?.height ?? null;
}

export function drawHistory(s: Screen, st: ArchiveState, hist: { height: number; tx_count: number; fees: number | null; time: string }[]) {
  s.draw((g, W, H) => {
    frame(g, W, H, TEAL);
    header(g, "履歴", `HISTORY · THE ${HISTORY_N} BLOCKS UP TO HERE`, TEAL);
    if (hist.length < 2) {
      g.fillStyle = DIM;
      g.font = MONO(26, 600);
      fitText(g, "This stretch is still being indexed back toward genesis.", 40, 260);
      fitText(g, "Step through it block by block with ◀ ▶.", 40, 300);
      return;
    }
    const max = Math.max(2, ...hist.map((b) => b.tx_count));
    const bw = HIST.w / HISTORY_N;
    hist.forEach((b, i) => {
      const k = Math.log(1 + b.tx_count) / Math.log(1 + max);
      const h = Math.max(4, k * HIST.h);
      const cur = st.block?.height === b.height;
      g.fillStyle = cur ? "#f4b728" : "#2fb8a8";
      if (cur) {
        g.shadowColor = "#f4b728";
        g.shadowBlur = 16;
      }
      g.fillRect(HIST.x0 + i * bw + 1, HIST.y0 + HIST.h - h, bw - 3, h);
      g.shadowBlur = 0;
    });
    // fees as a line over the bars
    const fmax = Math.max(1, ...hist.map((b) => b.fees ?? 0));
    g.strokeStyle = "#ff9f2e";
    g.lineWidth = 3;
    g.beginPath();
    hist.forEach((b, i) => {
      const x = HIST.x0 + (i + 0.5) * bw,
        y = HIST.y0 + HIST.h - ((b.fees ?? 0) / fmax) * HIST.h * 0.9;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
    // axis and legend
    const t0 = Date.parse(hist[0].time),
      t1 = Date.parse(hist[hist.length - 1].time);
    const avg = (t1 - t0) / 1000 / (hist.length - 1);
    g.fillStyle = DIM;
    g.font = MONO(20, 600);
    g.fillText(`#${num(hist[0].height)}`, HIST.x0, HIST.y0 + HIST.h + 30);
    g.textAlign = "right";
    g.fillText(`#${num(hist[hist.length - 1].height)}`, HIST.x0 + HIST.w, HIST.y0 + HIST.h + 30);
    g.textAlign = "left";
    const total = hist.reduce((a, b) => a + b.tx_count, 0);
    g.fillStyle = INK;
    g.font = MONO(24, 700);
    fitText(g, `${num(total)} tx · avg ${Math.round(avg)} s per block · max ${num(max)} tx`, 40, H - 64, W - 80);
    g.fillStyle = "#2fb8a8";
    g.fillRect(40, H - 34, 14, 14);
    g.fillStyle = DIM;
    g.font = MONO(18, 600);
    g.fillText("transactions", 60, H - 21);
    g.fillStyle = "#ff9f2e";
    g.fillRect(230, H - 30, 22, 4);
    g.fillStyle = DIM;
    g.fillText("fees", 258, H - 21);
    g.fillText("tap a bar to open that block", 330, H - 21);
  });
}
