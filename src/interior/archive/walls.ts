import * as THREE from "three";
import { KIND_LABEL, type ArchiveBlock, type TxKind } from "../../data/types";
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

// ---- right wall: value flowing in and out of the pools --------------------------------------------

const POOLS = [
  ["transparent", "TRANSPARENT", "#ff9a3c"],
  ["sprout", "SPROUT", "#9a8f7a"],
  ["sapling", "SAPLING", "#3ec9b0"],
  ["orchard", "ORCHARD", "#3ee08f"],
  ["ironwood", "IRONWOOD", "#b07bff"],
] as const;

/** Redrawn about 20 times a second while you're on the floor: dots stream into or out of each pool. */
export function drawFlows(s: Screen, st: ArchiveState, t: number) {
  s.draw((g, W, H) => {
    frame(g, W, H, TEAL);
    header(g, "流れ", "POOL FLOWS · THIS BLOCK", TEAL);
    const b = st.block;
    const d = b?.pool_deltas ?? {};
    const shielded = (d.sprout ?? 0) + (d.sapling ?? 0) + (d.orchard ?? 0) + (d.ironwood ?? 0);
    g.textAlign = "right";
    g.font = MONO(22, 700);
    g.fillStyle = shielded > 0 ? "#3ee08f" : shielded < 0 ? "#ffcf4a" : DIM;
    g.fillText(b ? `SHIELDED NET ${shielded >= 0 ? "+" : "−"}${zec(Math.abs(shielded), 4)} ZEC` : "", W - 40, 60);
    g.textAlign = "left";
    const colW = (W - 80) / POOLS.length;
    const top = 110,
      bottom = H - 120;
    const max = Math.max(1, ...POOLS.map(([k]) => Math.abs(d[k] ?? 0)));
    POOLS.forEach(([k, label, color], i) => {
      const cx = 40 + colW * (i + 0.5);
      const v = d[k] ?? 0;
      // the pipe
      g.fillStyle = "#101219";
      g.fillRect(cx - 38, top, 76, bottom - top);
      g.strokeStyle = v ? color : "#2a2c34";
      g.lineWidth = 3;
      g.strokeRect(cx - 38, top, 76, bottom - top);
      // the stream: dots rising (into the pool) or falling (out of it), denser for bigger flows
      if (v && b) {
        const k01 = Math.log10(1 + Math.abs(v) / 1e5) / Math.log10(1 + max / 1e5);
        const n = Math.round(4 + 22 * k01);
        const speed = 0.35 + 0.5 * k01;
        g.fillStyle = color;
        g.shadowColor = color;
        g.shadowBlur = 10;
        for (let j = 0; j < n; j++) {
          let p = (j / n + t * speed + (i * 0.13)) % 1;
          if (v < 0) p = 1 - p;
          const y = bottom - 10 - p * (bottom - top - 20);
          const x = cx + Math.sin(j * 12.9 + i) * 22;
          g.fillRect(x - 5, y - 5, 10, 10);
        }
        g.shadowBlur = 0;
        // arrow head
        g.fillStyle = color;
        g.beginPath();
        if (v > 0) {
          g.moveTo(cx - 26, top - 8);
          g.lineTo(cx + 26, top - 8);
          g.lineTo(cx, top - 34);
        } else {
          g.moveTo(cx - 26, bottom + 8);
          g.lineTo(cx + 26, bottom + 8);
          g.lineTo(cx, bottom + 34);
        }
        g.fill();
      }
      g.textAlign = "center";
      g.fillStyle = v ? color : DIM;
      g.font = MONO(20, 800);
      fitText(g, label, cx, H - 70, colW - 8);
      g.fillStyle = v ? INK : "#4a4c56";
      g.font = MONO(22, 700);
      fitText(g, v ? `${v > 0 ? "+" : "−"}${zec(Math.abs(v), 3)}` : "—", cx, H - 38, colW - 8);
      g.textAlign = "left";
    });
  });
}

// ---- back wall: the departures board, flaps flipping to each transaction --------------------------

const ROWS = 7;
const FLAP = "ABCDEF0123456789#·-";

export function drawBoard(s: Screen, st: ArchiveState, t: number) {
  s.draw((g, W) => {
    frame(g, W, s.H, ORANGE);
    header(g, "出発", "DEPARTURES · TRANSACTIONS IN THIS BLOCK", ORANGE, 34, 56);
    const b = st.block;
    if (!b) return;
    const rows = b.txs.map((x, i) => ({ x, i }));
    const pages = Math.max(1, Math.ceil(rows.length / ROWS));
    const since = t - st.shownAt;
    const page = Math.floor(Math.max(0, since - 2) / 6) % pages;
    const pageStart = 2 + Math.floor(Math.max(0, since - 2) / 6) * 6;
    g.textAlign = "right";
    g.fillStyle = DIM;
    g.font = MONO(20, 600);
    g.fillText(`${page + 1} / ${pages}`, W - 36, 56);
    g.textAlign = "left";
    const cols = [36, 110, 520, 780, 990, 1190, 1350];
    g.fillStyle = DIM;
    g.font = MONO(16, 700);
    ["#", "TRANSACTION", "KIND", "FEE · ZEC", "SIZE", "IN/OUT", "ACTIONS"].forEach((h, k) => g.fillText(h, cols[k], 96));
    const flipFrom = page === 0 ? st.shownAt : st.shownAt + pageStart;
    // empty rows stay on the board as blank flaps, like a quiet departures hall
    for (let r = Math.min(ROWS, rows.length - page * ROWS); r < ROWS; r++) {
      const y = 134 + r * 34;
      g.fillStyle = "#0e1016";
      g.fillRect(28, y - 25, W - 56, 30);
      g.fillStyle = "#23262f";
      g.font = MONO(20, 600);
      cols.forEach((cx, k) => g.fillText(k === 1 ? "· · · · · · · ·" : "·", cx, y));
    }
    rows.slice(page * ROWS, page * ROWS + ROWS).forEach(({ x, i }, r) => {
      const y = 134 + r * 34;
      const acts = (x.n_sapling_spends ?? 0) + (x.n_sapling_outputs ?? 0) + (x.n_orchard_actions ?? 0) + (x.n_ironwood_actions ?? 0);
      const cells = [String(i), `${x.txid.slice(0, 16)}…${x.txid.slice(-6)}`, KIND_LABEL[x.kind].toUpperCase(), x.fee == null ? "—" : zec(x.fee, 6), `${(x.size / 1000).toFixed(1)}k`, `${x.n_tin ?? 0}/${x.n_tout ?? 0}`, String(acts)];
      // flaps settle left to right, row by row
      const settle = flipFrom + 0.25 + r * 0.07;
      g.fillStyle = "#0e1016";
      g.fillRect(28, y - 25, W - 56, 30);
      cells.forEach((text, k) => {
        const done = t > settle + k * 0.06;
        g.fillStyle = k === 2 ? KIND_COLOR[x.kind] : k === 1 ? INK : "#c8c4ba";
        g.font = MONO(20, k === 1 ? 700 : 600);
        const shown = done ? text : text.replace(/[^ ]/g, () => FLAP[Math.floor(Math.random() * FLAP.length)]);
        fitText(g, shown, cols[k], y, (cols[k + 1] ?? W - 30) - cols[k] - 12);
      });
    });
  });
}

/** Still flipping (or paging soon): the board needs redrawing this frame. */
export function boardBusy(st: ArchiveState, t: number) {
  const since = t - st.shownAt;
  if (since < 2) return true;
  // a page turns every 6 s; its flaps flip for about a second
  return (since - 2) % 6 < 1.1;
}
