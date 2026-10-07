import { Market } from "../../data/market";
import type { PickInfo } from "../types";
import { big, GOLD, MONO, num, rr, SANS, usd, zec } from "./kit";

/** The live figures as the Reserve draws them: boards, tapes, pool plates, and their panels. */

export const POOLS = ["orchard", "ironwood", "sapling", "sprout", "transparent"] as const;
export type PoolKey = (typeof POOLS)[number];
export const POOL_COLOR: Record<PoolKey, string> = { transparent: "#eda100", sprout: "#9085e9", sapling: "#3987e5", orchard: "#eb6834", ironwood: "#1baf7a" };
export const POOL_NAME: Record<PoolKey, string> = { transparent: "Transparent", sprout: "Sprout", sapling: "Sapling", orchard: "Orchard", ironwood: "Ironwood" };
export const POOL_SINCE: Record<PoolKey, string> = { transparent: "2016", sprout: "2016", sapling: "2018", orchard: "2022", ironwood: "2026" };

const UP = "#3ee08f",
  DOWN = "#ff5d6c",
  DIM = "#8f8a80",
  INK = "#07090f";

export function poolZat(k: PoolKey) {
  return Market.state.pools?.pools[k] ?? 0;
}

/** A dark board with a gold rule and a title. */
export function board(g: CanvasRenderingContext2D, W: number, H: number, title: string, sub?: string) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "#0c1220");
  gr.addColorStop(1, "#05070c");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.025)";
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  const s = Math.min(H / 300, W / 520);
  g.fillStyle = GOLD;
  g.fillRect(0, 0, W, Math.max(3, 4 * s));
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.font = `800 ${Math.round(30 * s)}px ${SANS}`;
  g.fillText(title, 18 * s, 44 * s);
  if (sub) {
    g.fillStyle = DIM;
    g.font = `500 ${Math.round(18 * s)}px ${MONO}`;
    g.textAlign = "right";
    g.fillText(sub, W - 18 * s, 42 * s);
    g.textAlign = "left";
  }
}

/** The 14-day price line, filled under, in the box (x, y, w, h). */
export function chart(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lw = 4) {
  const hist = Market.state.price?.history ?? [];
  const pts = hist.map((p) => p[1]);
  if (Market.state.price) pts.push(Market.state.price.usd);
  if (pts.length < 2) return;
  const lo = Math.min(...pts),
    hi = Math.max(...pts);
  const span = hi - lo || 1;
  const up = pts[pts.length - 1] >= pts[0];
  const col = up ? UP : DOWN;
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    g.beginPath();
    g.moveTo(x, y + (h * k) / 4);
    g.lineTo(x + w, y + (h * k) / 4);
    g.stroke();
  }
  const X = (i: number) => x + (w * i) / (pts.length - 1),
    Y = (v: number) => y + h - ((v - lo) / span) * h * 0.9 - h * 0.05;
  const fill = g.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, up ? "rgba(62,224,143,0.35)" : "rgba(255,93,108,0.35)");
  fill.addColorStop(1, "rgba(0,0,0,0)");
  g.beginPath();
  g.moveTo(X(0), y + h);
  pts.forEach((v, i) => g.lineTo(X(i), Y(v)));
  g.lineTo(X(pts.length - 1), y + h);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.beginPath();
  pts.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.strokeStyle = col;
  g.lineWidth = lw;
  g.shadowColor = col;
  g.shadowBlur = 12;
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = DIM;
  g.font = `500 ${Math.max(12, Math.round(h * 0.09))}px ${MONO}`;
  g.textAlign = "right";
  g.fillText(usd(hi, 0), x + w, y + h * 0.1);
  g.fillText(usd(lo, 0), x + w, y + h - 4);
  g.textAlign = "left";
}

/** Big price, 24 h change, chart under it. */
export function drawPrice(g: CanvasRenderingContext2D, W: number, H: number, title = "ZEC / USD") {
  board(g, W, H, title, "14D");
  const p = Market.state.price;
  const s = Math.min(H / 300, W / 520);
  if (!p) return;
  const ch = p.usd_24h_change;
  g.fillStyle = "#f6f1e6";
  g.font = `800 ${Math.round(70 * s)}px ${MONO}`;
  g.fillText(usd(p.usd), 18 * s, 118 * s);
  g.fillStyle = ch >= 0 ? UP : DOWN;
  g.font = `700 ${Math.round(30 * s)}px ${MONO}`;
  g.fillText(`${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%`, 18 * s, 156 * s);
  chart(g, 18 * s, 172 * s, W - 36 * s, H - 186 * s, 3 * s);
}

/** Market cap, volume, BTC price. */
export function drawMarket(g: CanvasRenderingContext2D, W: number, H: number) {
  board(g, W, H, "MARKET", "24H");
  const p = Market.state.price as (typeof Market.state.price & { btc?: number }) | null;
  const s = Math.min(H / 300, W / 520);
  if (!p) return;
  const rows: [string, string][] = [
    ["MARKET CAP", big(p.market_cap_usd)],
    ["VOLUME 24H", big(p.volume_24h_usd)],
    ["ZEC / BTC", p.btc ? p.btc.toFixed(5) : "—"],
  ];
  rows.forEach(([k, v], i) => {
    const y = (92 + i * 70) * s;
    g.fillStyle = DIM;
    g.font = `600 ${Math.round(20 * s)}px ${MONO}`;
    g.fillText(k, 18 * s, y);
    g.fillStyle = i === 0 ? GOLD : "#f6f1e6";
    g.font = `800 ${Math.round(40 * s)}px ${MONO}`;
    g.fillText(v, 18 * s, y + 40 * s);
  });
}

/** The value pools: bars by share, amount and 24 h change. */
export function drawPools(g: CanvasRenderingContext2D, W: number, H: number, title = "VALUE POOLS") {
  const P = Market.state.pools;
  board(g, W, H, title, P ? `${(P.shielded_ratio * 100).toFixed(1)}% SHIELDED` : "");
  if (!P) return;
  const s = Math.min(H / 300, W / 520);
  const total = POOLS.reduce((a, k) => a + P.pools[k], 0) || 1;
  const rowH = (H - 70 * s) / POOLS.length;
  POOLS.forEach((k, i) => {
    const y = 64 * s + i * rowH;
    const v = P.pools[k];
    const share = v / total;
    g.fillStyle = POOL_COLOR[k];
    g.font = `800 ${Math.round(rowH * 0.36)}px ${SANS}`;
    g.fillText(POOL_NAME[k].toUpperCase(), 18 * s, y + rowH * 0.42);
    g.fillStyle = "#f6f1e6";
    g.font = `700 ${Math.round(rowH * 0.34)}px ${MONO}`;
    g.textAlign = "right";
    g.fillText(`${zec(v)} ZEC`, W - 18 * s, y + rowH * 0.42);
    const ch = P.change_24h[k] ?? 0;
    g.fillStyle = ch > 0 ? UP : ch < 0 ? DOWN : DIM;
    g.font = `600 ${Math.round(rowH * 0.24)}px ${MONO}`;
    g.fillText(`${ch >= 0 ? "+" : "−"}${zec(Math.abs(ch), Math.abs(ch) < 1e10 ? 1 : 0)} 24h`, W - 18 * s, y + rowH * 0.8);
    g.textAlign = "left";
    g.fillStyle = "rgba(255,255,255,0.08)";
    rr(g, 18 * s, y + rowH * 0.56, W * 0.6, rowH * 0.22, 4);
    g.fill();
    g.fillStyle = POOL_COLOR[k];
    rr(g, 18 * s, y + rowH * 0.56, Math.max(6, W * 0.6 * share), rowH * 0.22, 4);
    g.fill();
  });
}

/** Supply against the 21M cap, block, inflation, halving. */
export function drawSupply(g: CanvasRenderingContext2D, W: number, H: number, height: number) {
  board(g, W, H, "SUPPLY", height ? `#${num(height)}` : "");
  const S = Market.state.supply;
  if (!S) return;
  const s = Math.min(H / 300, W / 520);
  g.fillStyle = "#f6f1e6";
  g.font = `800 ${Math.round(54 * s)}px ${MONO}`;
  g.fillText(zec(S.supply), 18 * s, 108 * s);
  g.fillStyle = DIM;
  g.font = `600 ${Math.round(20 * s)}px ${MONO}`;
  g.fillText(`/ 21,000,000 ZEC`, 18 * s, 136 * s);
  const frac = S.supply / 1e8 / 21e6;
  g.fillStyle = "rgba(255,255,255,0.08)";
  rr(g, 18 * s, 150 * s, W - 36 * s, 18 * s, 6);
  g.fill();
  g.fillStyle = GOLD;
  rr(g, 18 * s, 150 * s, (W - 36 * s) * frac, 18 * s, 6);
  g.fill();
  const rows: [string, string][] = [
    ["INFLATION", `${(S.inflation_rate * 100).toFixed(2)}%`],
    ["BLOCK REWARD", `${(S.block_subsidy > 1000 ? S.block_subsidy / 1e8 : S.block_subsidy).toFixed(4)}`],
    ["NEXT HALVING", S.next_halving_eta.slice(0, 10)],
  ];
  rows.forEach(([k, v], i) => {
    const x = 18 * s + i * ((W - 36 * s) / 3);
    g.fillStyle = DIM;
    g.font = `600 ${Math.round(16 * s)}px ${MONO}`;
    g.fillText(k, x, 206 * s);
    g.fillStyle = GOLD;
    g.font = `800 ${Math.round(28 * s)}px ${MONO}`;
    g.fillText(v, x, 242 * s);
  });
  g.fillStyle = DIM;
  g.font = `600 ${Math.round(16 * s)}px ${MONO}`;
  g.fillText(`LOCKBOX ${zec(S.lockbox)} ZEC`, 18 * s, 282 * s);
}

/** Ticker tape items: label|value|up/down. */
export function tape(height: number): string[] {
  const out: string[] = [];
  const m = Market.state;
  if (m.price) out.push(`ZEC/USD|${usd(m.price.usd)} ${m.price.usd_24h_change >= 0 ? "▲" : "▼"}${Math.abs(m.price.usd_24h_change).toFixed(2)}%|${m.price.usd_24h_change >= 0 ? "up" : "down"}`);
  if (height) out.push(`BLOCK|#${num(height)}|`);
  if (m.price) out.push(`MKT CAP|${big(m.price.market_cap_usd)}|`, `VOL 24H|${big(m.price.volume_24h_usd)}|`);
  if (m.pools) {
    out.push(`SHIELDED|${(m.pools.shielded_ratio * 100).toFixed(2)}%|`);
    for (const k of POOLS) {
      const ch = m.pools.change_24h[k] ?? 0;
      out.push(`${POOL_NAME[k].toUpperCase()}|${zec(m.pools.pools[k])} ${ch >= 0 ? "▲" : "▼"}${zec(Math.abs(ch))}|${ch > 0 ? "up" : ch < 0 ? "down" : ""}`);
    }
  }
  if (m.supply) out.push(`SUPPLY|${zec(m.supply.supply)} / 21M|`);
  if (m.network) out.push(`TX 24H|${num(m.network.txs_24h)}|`, `SHIELDED TX|${(m.network.shielded_tx_ratio_24h * 100).toFixed(1)}%|`);
  return out.length ? out : ["ZEC RESERVE|準備銀行|"];
}

/** One long line of tape on a wide canvas (scroll it with the texture offset). */
export function drawTape(g: CanvasRenderingContext2D, W: number, H: number, items: string[], bg = "#05060a") {
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.font = `700 ${Math.round(H * 0.56)}px ${MONO}`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  let x = 16,
    i = 0;
  while (x < W) {
    const [label, val, tone] = items[i++ % items.length].split("|");
    g.fillStyle = "#b8b2a6";
    g.fillText(label, x, H / 2 + 2);
    x += g.measureText(label + " ").width;
    g.fillStyle = tone === "up" ? UP : tone === "down" ? DOWN : GOLD;
    g.fillText(val, x, H / 2 + 2);
    x += g.measureText(val).width + H * 0.6;
    g.fillStyle = "#4b4740";
    g.fillText("|", x, H / 2 + 2);
    x += H * 0.8;
  }
}

/** A pool's plate on its cage: name, amount, share, 24 h. */
export function drawPoolPlate(g: CanvasRenderingContext2D, W: number, H: number, k: PoolKey) {
  const P = Market.state.pools;
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = POOL_COLOR[k];
  g.lineWidth = 10;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = POOL_COLOR[k];
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = `900 ${Math.round(H * 0.24)}px ${SANS}`;
  g.fillText(POOL_NAME[k].toUpperCase(), W / 2, H * 0.32);
  g.fillStyle = "#f6f1e6";
  g.font = `800 ${Math.round(H * 0.2)}px ${MONO}`;
  g.fillText(P ? `${zec(P.pools[k])} ZEC` : "…", W / 2, H * 0.6);
  if (P) {
    const total = POOLS.reduce((a, q) => a + P.pools[q], 0) || 1;
    const ch = P.change_24h[k] ?? 0;
    g.font = `600 ${Math.round(H * 0.12)}px ${MONO}`;
    g.fillStyle = "#b8b2a6";
    g.fillText(`${((P.pools[k] / total) * 100).toFixed(2)}%`, W * 0.3, H * 0.84);
    g.fillStyle = ch > 0 ? UP : ch < 0 ? DOWN : DIM;
    g.fillText(`${ch >= 0 ? "+" : "−"}${zec(Math.abs(ch), Math.abs(ch) < 1e10 ? 1 : 0)}`, W * 0.7, H * 0.84);
  }
  g.textAlign = "left";
}

export function poolInfo(k: PoolKey): PickInfo {
  const P = Market.state.pools;
  const price = Market.state.price?.usd ?? 0;
  if (!P) return { eyebrow: "Value pool", title: POOL_NAME[k] };
  const total = POOLS.reduce((a, q) => a + P.pools[q], 0) || 1;
  const v = P.pools[k];
  const ch = P.change_24h[k] ?? 0;
  return {
    eyebrow: `Gold vault · cage ${POOLS.indexOf(k) + 1}`,
    title: `${zec(v)} ZEC`,
    mono: true,
    tag: [POOL_NAME[k], k === "transparent" ? "warn" : "ok"],
    stats: [
      ["Share", `${((v / total) * 100).toFixed(2)}%`],
      ["24h", `${ch >= 0 ? "+" : "−"}${zec(Math.abs(ch), 2)} ZEC`],
      ["Value", price ? big((v / 1e8) * price) : "—"],
      ["Since", POOL_SINCE[k]],
    ],
  };
}

export function priceInfo(): PickInfo {
  const p = Market.state.price;
  if (!p) return { eyebrow: "Market", title: "ZEC / USD" };
  return {
    eyebrow: "Market · ZEC / USD",
    title: usd(p.usd),
    mono: true,
    tag: [`${p.usd_24h_change >= 0 ? "+" : ""}${p.usd_24h_change.toFixed(2)}% 24h`, p.usd_24h_change >= 0 ? "ok" : "warn"],
    stats: [
      ["Market cap", big(p.market_cap_usd)],
      ["Volume 24h", big(p.volume_24h_usd)],
      ["14d high", usd(Math.max(...p.history.map((h) => h[1]), p.usd), 0)],
      ["14d low", usd(Math.min(...p.history.map((h) => h[1]), p.usd), 0)],
    ],
  };
}

export function poolsInfo(): PickInfo {
  const P = Market.state.pools;
  if (!P) return { eyebrow: "Value pools", title: "Value pools" };
  return {
    eyebrow: "Value pools",
    title: `${zec(P.shielded)} ZEC shielded`,
    tag: [`${(P.shielded_ratio * 100).toFixed(2)}%`, "ok"],
    stats: POOLS.slice(0, 4).map((k) => [POOL_NAME[k], `${zec(P.pools[k])} ZEC`] as [string, string]),
    body: `<p>Transparent ${zec(P.pools.transparent)} ZEC</p>`,
  };
}

export function supplyInfo(height: number): PickInfo {
  const S = Market.state.supply;
  if (!S) return { eyebrow: "Supply", title: "Supply" };
  return {
    eyebrow: "Supply",
    title: `${zec(S.supply)} ZEC`,
    mono: true,
    tag: [`${((S.supply / 1e8 / 21e6) * 100).toFixed(2)}% of 21M`, "info"],
    stats: [
      ["Block", num(height || S.height)],
      ["Inflation", `${(S.inflation_rate * 100).toFixed(2)}%`],
      ["Lockbox", `${zec(S.lockbox)} ZEC`],
      ["Next halving", S.next_halving_eta.slice(0, 10)],
    ],
  };
}
