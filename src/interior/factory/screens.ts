import { Market } from "../../data/market";
import { fitText } from "../../scene/fit";
import { fmtAgo, GOLD, JP, minerName, MONO, POOL_COLORS, scanlines, type Miners } from "./canvas";

/** What the hall's screens show. */
export interface HallState {
  miners: Miners | null;
  last: { height: number; pool: string | null; at: number } | null;
  recent: { height: number; pool: string | null; at: number }[];
  /** performance.now() until which the screens flash BLOCK FOUND. */
  flashUntil: number;
  stamped: number;
  porter: string;
}

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const hex = () => Array.from({ length: 16 }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");

/** Wall canvas size (device pixels); the layout is drawn in a 1920 × 610 logical space. */
export const WALL_PX = { w: 3072, h: 976 };
const LW = 1920,
  LH = 610;

/** Set the largest font (≤ px) at which `text` fits in `maxW`; returns the width. */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number, px: number, weight = 700, font = MONO) {
  let size = px;
  g.font = font(size, weight);
  while (size > 10 && g.measureText(text).width > maxW) {
    size -= 2;
    g.font = font(size, weight);
  }
  return g.measureText(text).width;
}
/** Cut `text` with an ellipsis so it fits `maxW` in the current font. */
function clip(g: CanvasRenderingContext2D, text: string, maxW: number) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

/** Big wall screen: three columns (network, last block and the race for the next, pools). */
export function drawWall(g: CanvasRenderingContext2D, t: number, st: HallState) {
  g.setTransform(WALL_PX.w / LW, 0, 0, WALL_PX.h / LH, 0, 0);
  const W = LW,
    H = LH;
  const flash = performance.now() < st.flashUntil;
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.shadowBlur = 0;
  if (flash && st.last) {
    const on = Math.sin(t * 10) > -0.3;
    g.fillStyle = on ? "#2a1e02" : "#120d02";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? "#1a1302" : "#231a03";
      g.fillRect(0, i * 46, W, 23);
    }
    g.textAlign = "center";
    g.fillStyle = on ? GOLD : "#ffe08a";
    g.shadowColor = GOLD;
    g.shadowBlur = 40;
    fit(g, "BLOCK FOUND", W - 120, 170, 800);
    fitText(g, "BLOCK FOUND", W / 2, 240);
    fit(g, `#${fmt(st.last.height)}`, W - 120, 110, 800);
    fitText(g, `#${fmt(st.last.height)}`, W / 2, 380);
    g.shadowBlur = 0;
    g.fillStyle = "#f0e6cc";
    const by = `mined by ${st.last.pool ?? "an unknown miner"}`;
    fit(g, by, W - 160, 48, 600);
    fitText(g, by, W / 2, 468);
    g.font = JP(42);
    g.fillStyle = GOLD;
    fitText(g, "ブロック発見", W / 2, 550);
    g.setTransform(1, 0, 0, 1, 0, 0);
    scanlines(g, WALL_PX.w, WALL_PX.h, 4);
    return;
  }
  g.fillStyle = "#06070a";
  g.fillRect(0, 0, W, H);
  // header
  g.fillStyle = "#0f0e13";
  g.fillRect(0, 0, W, 74);
  g.fillStyle = GOLD;
  g.fillRect(0, 72, W, 3);
  g.font = MONO(34, 800);
  fitText(g, "PROOF FACTORY", 34, 50);
  g.font = JP(32);
  fitText(g, "証明工場", 340, 50);
  g.fillStyle = "#7a8a84";
  g.font = MONO(26, 600);
  fitText(g, "MINING HALL · EQUIHASH (200,9) · ZCASH MAINNET", 500, 48);
  g.fillStyle = Math.sin(t * 5) > 0 ? "#3ddc97" : "#0f3a2a";
  g.beginPath();
  g.arc(W - 210, 38, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3ddc97";
  g.font = MONO(28, 700);
  fitText(g, "LIVE", W - 188, 48);
  g.fillStyle = "#a3a3a3";
  fitText(g, new Date().toTimeString().slice(0, 5), W - 104, 48);

  // three columns with real gutters
  const C1 = 34,
    C1W = 560,
    C2 = 650,
    C2W = 590,
    C3 = 1290,
    C3W = W - 1290 - 34;
  g.fillStyle = "#1b1a20";
  g.fillRect(C2 - 26, 96, 2, 490);
  g.fillRect(C3 - 26, 96, 2, 490);
  const label = (s: string, x: number) => {
    g.fillStyle = "#7a8a84";
    g.font = MONO(26, 700);
    fitText(g, s, x, 128);
  };

  // 1 · hashrate and network figures
  const n = Market.state.network;
  label("NETWORK HASHRATE", C1);
  const hr = n ? (n.solps / 1e9).toFixed(2) : "—";
  g.font = MONO(38, 700);
  const unitW = g.measureText("GSol/s").width;
  g.fillStyle = "#ffffff";
  const hw = fit(g, hr, C1W - unitW - 18, 140, 800);
  fitText(g, hr, C1, 262);
  g.fillStyle = GOLD;
  g.font = MONO(38, 700);
  fitText(g, "GSol/s", C1 + hw + 14, 262);
  const kv: [string, string][] = [
    ["DIFFICULTY", n ? `${fmt(n.difficulty / 1e6, 1)} M` : "—"],
    ["AVG BLOCK TIME", n ? `${fmt(n.avg_block_time, 0)} s` : "—"],
    ["TXS · 24H", n ? fmt(n.txs_24h) : "—"],
  ];
  kv.forEach(([k, v], i) => {
    const y = 340 + i * 64;
    g.fillStyle = "#14161b";
    g.fillRect(C1, y - 42, C1W, 56);
    g.fillStyle = "#7a8a84";
    g.font = MONO(24, 600);
    fitText(g, k, C1 + 18, y - 4);
    g.fillStyle = "#e8e0c8";
    g.font = MONO(34, 700);
    g.textAlign = "right";
    fitText(g, v, C1 + C1W - 16, y - 2);
    g.textAlign = "left";
  });
  if (st.miners?.nakamoto_coefficient) {
    g.fillStyle = "#7a8a84";
    g.font = MONO(24, 600);
    fitText(g, `NAKAMOTO COEFFICIENT (7D) · ${st.miners.nakamoto_coefficient}`, C1, 568);
  }

  // 2 · last block and the race for the next one
  label("LAST BLOCK", C2);
  if (st.last) {
    const ht = `#${fmt(st.last.height)}`;
    g.fillStyle = GOLD;
    g.shadowColor = GOLD;
    g.shadowBlur = 18;
    fit(g, ht, C2W, 104, 800);
    fitText(g, ht, C2, 236);
    g.shadowBlur = 0;
    g.fillStyle = "#e8e0c8";
    g.font = MONO(32, 600);
    const ago = ` · ${fmtAgo(Date.now() - st.last.at)}`;
    const agoW = g.measureText(ago).width;
    const who = clip(g, st.last.pool ?? "unknown miner", C2W - agoW);
    fitText(g, who + ago, C2, 288);
    const avg = n?.avg_block_time ?? 75;
    const el = (Date.now() - st.last.at) / 1000;
    const k = Math.min(1, el / avg);
    g.fillStyle = "#7a8a84";
    g.font = MONO(24, 700);
    fitText(g, `HASHING BLOCK #${fmt(st.last.height + 1)}`, C2, 352);
    g.fillStyle = "#14161b";
    g.fillRect(C2, 370, C2W, 36);
    g.fillStyle = el > avg ? "#ff8a3a" : "#3ddc97";
    g.fillRect(C2, 370, C2W * k, 36);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let x = C2; x < C2 + C2W; x += 18) g.fillRect(x, 370, 3, 36);
    g.fillStyle = "#a3a3a3";
    g.font = MONO(24, 600);
    fitText(g, el > avg ? `${Math.round(el - avg)}s over the ${Math.round(avg)}s average` : `~${Math.round(avg - el)}s to the average`, C2, 440);
    if (n) {
      g.fillStyle = "#3ddc97";
      g.font = MONO(26, 600);
      fitText(g, `≈ ${fmt((n.solps * el) / 1e12, 2)} T solutions tried`, C2, 488);
    }
    g.fillStyle = "#2f7a5a";
    g.font = MONO(24, 500);
    fitText(g, `nonce 0x${hex()}`, C2, 532);
    fitText(g, `nonce 0x${hex()}`, C2, 564);
  }

  // 3 · pools
  label("POOLS · LAST 7 DAYS", C3);
  const list = st.miners?.miners.slice(0, 7) ?? [];
  const tot = st.miners?.total_blocks || 1;
  const max = list[0]?.blocks || 1;
  list.forEach((m, i) => {
    const y = 178 + i * 60;
    const share = m.blocks / tot;
    const found = st.last && m.pool && st.last.pool === m.pool && performance.now() < st.flashUntil + 20000;
    g.fillStyle = found ? GOLD : "#d8d4cc";
    g.font = MONO(28, 700);
    const pct = `${(share * 100).toFixed(1)}%`;
    const pw = g.measureText(pct).width;
    fitText(g, clip(g, minerName(m), C3W - pw - 24), C3, y);
    g.textAlign = "right";
    fitText(g, pct, C3 + C3W, y);
    g.textAlign = "left";
    g.fillStyle = "#14161b";
    g.fillRect(C3, y + 12, C3W, 14);
    g.fillStyle = POOL_COLORS[i % POOL_COLORS.length];
    g.fillRect(C3, y + 12, (C3W * m.blocks) / max, 14);
  });
  g.setTransform(1, 0, 0, 1, 0, 0);
  scanlines(g, WALL_PX.w, WALL_PX.h, 4);
}

/** Desk monitors, 512 × 288 each. */
export type MonitorKind = "leaderboard" | "blocks" | "nakamoto" | "network" | "recent" | "line";

export function drawMonitor(g: CanvasRenderingContext2D, kind: MonitorKind, t: number, st: HallState) {
  const W = 512,
    H = 288;
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.shadowBlur = 0;
  const flash = performance.now() < st.flashUntil;
  g.fillStyle = flash && Math.sin(t * 10) > 0 ? "#1c1503" : "#06080a";
  g.fillRect(0, 0, W, H);
  const head = (s: string, jp: string) => {
    g.fillStyle = "#0f0e13";
    g.fillRect(0, 0, W, 34);
    g.fillStyle = GOLD;
    g.fillRect(0, 33, W, 2);
    g.font = MONO(17, 800);
    fitText(g, s, 12, 23);
    g.font = JP(16);
    g.textAlign = "right";
    fitText(g, jp, W - 12, 23);
    g.textAlign = "left";
  };
  const list = st.miners?.miners ?? [];
  const tot = st.miners?.total_blocks || 1;
  if (kind === "leaderboard") {
    head("POOL LEADERBOARD · 7D", "採掘者順位");
    g.font = MONO(13, 600);
    g.fillStyle = "#7a8a84";
    fitText(g, "#  MINER              BLOCKS   SHARE   REWARDS", 12, 56);
    list.slice(0, 9).forEach((m, i) => {
      const y = 80 + i * 22;
      g.fillStyle = i === 0 ? GOLD : i % 2 ? "#c8d0cc" : "#e8e0c8";
      g.font = MONO(14, 600);
      fitText(g, `${i + 1}`.padEnd(3) + minerName(m).slice(0, 17).padEnd(19) + fmt(m.blocks).padStart(6) + `${((m.blocks / tot) * 100).toFixed(1)}%`.padStart(8) + `${fmt(m.rewards / 1e8, 0)} ZEC`.padStart(12), 12, y);
    });
  } else if (kind === "blocks") {
    head("BLOCKS FOUND · 7 DAYS", "ブロック数");
    const top = list.slice(0, 8);
    const max = top[0]?.blocks || 1;
    const bw = 52;
    top.forEach((m, i) => {
      const x = 22 + i * 60;
      const h = (180 * m.blocks) / max;
      g.fillStyle = "#14161b";
      g.fillRect(x, 70, bw, 180);
      g.fillStyle = POOL_COLORS[i % POOL_COLORS.length];
      g.fillRect(x, 250 - h, bw, h);
      g.fillStyle = "#e8e0c8";
      g.font = MONO(12, 700);
      g.textAlign = "center";
      fitText(g, fmt(m.blocks), x + bw / 2, 246 - h);
      g.fillStyle = "#a3a3a3";
      g.font = MONO(10, 600);
      fitText(g, minerName(m).slice(0, 8), x + bw / 2, 270);
      g.textAlign = "left";
    });
    g.fillStyle = "#7a8a84";
    g.font = MONO(12, 600);
    fitText(g, `${fmt(tot)} blocks`, 380, 56);
  } else if (kind === "nakamoto") {
    head("DECENTRALISATION", "分散度");
    const nk = st.miners?.nakamoto_coefficient;
    g.fillStyle = "#7a8a84";
    g.font = MONO(15, 700);
    fitText(g, "NAKAMOTO COEFFICIENT", 22, 70);
    g.fillStyle = nk && nk <= 3 ? "#ff8a3a" : "#3ddc97";
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 20;
    g.font = MONO(120, 800);
    fitText(g, nk ? String(nk) : "—", 22, 192);
    g.shadowBlur = 0;
    g.fillStyle = "#c8d0cc";
    g.font = MONO(14, 500);
    fitText(g, "miners needed to control", 170, 120);
    fitText(g, "more than half of the blocks", 170, 140);
    fitText(g, "found in the last 7 days", 170, 160);
    const top = st.miners?.top_share ?? (list[0] ? list[0].blocks / tot : 0);
    g.fillStyle = "#7a8a84";
    fitText(g, `largest miner: ${(top * 100).toFixed(1)}%`, 22, 236);
    // cumulative bar
    let acc = 0;
    list.slice(0, 8).forEach((m, i) => {
      const w = (m.blocks / tot) * 468;
      g.fillStyle = POOL_COLORS[i % POOL_COLORS.length];
      g.fillRect(22 + acc, 250, Math.max(1, w - 2), 16);
      acc += w;
    });
    g.fillStyle = "#ffffff";
    g.fillRect(22 + 234, 244, 2, 28);
  } else if (kind === "network") {
    head("NETWORK", "ネットワーク");
    const n = Market.state.network;
    const rows: [string, string][] = [
      ["hashrate", n ? `${(n.solps / 1e9).toFixed(2)} GSol/s` : "—"],
      ["difficulty", n ? `${fmt(n.difficulty / 1e6, 2)} M` : "—"],
      ["avg block", n ? `${n.avg_block_time.toFixed(1)} s` : "—"],
      ["txs 24h", n ? fmt(n.txs_24h) : "—"],
      ["fees 24h", n ? `${(n.fees_24h / 1e8).toFixed(3)} ZEC` : "—"],
      ["shielded 24h", n ? `${(n.shielded_tx_ratio_24h * 100).toFixed(1)}%` : "—"],
    ];
    rows.forEach(([k, v], i) => {
      const y = 70 + i * 35;
      g.fillStyle = "#7a8a84";
      g.font = MONO(16, 600);
      fitText(g, k.toUpperCase(), 22, y);
      g.fillStyle = i === 0 ? GOLD : "#e8e0c8";
      g.font = MONO(20, 700);
      g.textAlign = "right";
      fitText(g, v, W - 22, y);
      g.textAlign = "left";
    });
  } else if (kind === "recent") {
    head("BLOCKS SHIPPED", "出荷記録");
    st.recent.slice(0, 9).forEach((b, i) => {
      const y = 62 + i * 24;
      g.fillStyle = i === 0 ? GOLD : "#c8d0cc";
      g.font = MONO(15, 700);
      fitText(g, `#${fmt(b.height)}`, 18, y);
      g.font = MONO(14, 500);
      fitText(g, (b.pool ?? "unknown").slice(0, 18), 160, y);
      g.fillStyle = "#7a8a84";
      g.textAlign = "right";
      fitText(g, fmtAgo(Date.now() - b.at), W - 18, y);
      g.textAlign = "left";
    });
  } else {
    head("LINE STATUS", "製造ライン");
    const items: [string, string, string][] = [
      ["PRESS", flash ? "STAMPING" : "READY", flash ? GOLD : "#3ddc97"],
      ["CONVEYOR", "RUNNING", "#3ddc97"],
      ["PORTER", st.porter, "#4ad0ff"],
      ["DISPATCH", "TO THE BUS", GOLD],
      ["STAMPED", `${st.stamped} this shift`, "#e8e0c8"],
    ];
    items.forEach(([k, v, c], i) => {
      const y = 72 + i * 42;
      g.fillStyle = c;
      g.beginPath();
      g.arc(26, y - 6, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#7a8a84";
      g.font = MONO(16, 700);
      fitText(g, k, 44, y);
      g.fillStyle = c;
      g.font = MONO(18, 700);
      g.textAlign = "right";
      fitText(g, v, W - 22, y);
      g.textAlign = "left";
    });
  }
  scanlines(g, W, H, 3);
}
