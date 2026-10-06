import * as THREE from "three";
import type { City, Facade } from "./city";
import { CURB } from "./city";
import { Market, type MarketState } from "../data/market";
import { blobTexture, zcashBadge } from "./textures";
import { fitText, shrink } from "./fit";
import { EMIT_TIME } from "./voxel/mesher";

/**
 * Cyberpunk dressing on top of the city: animated ad screens (some showing live chain data),
 * neon tubes on the buildings, rain, a hologram over the fountain, koi in
 * the garden pond, and a glowing megacity skyline in the distance.
 */

export interface LiveData {
  height: number | null;
  mempool: number;
  since: number;
  market?: MarketState;
  /** The NU7 upgrade: its height once set, the announced date, and whether it is live. */
  nu7?: { height: number | null; date: string | null; activated: boolean };
}

/** Something just happened on the chain: every LED screen in the city shows it for a few seconds. */
export type Alert =
  | { kind: "block"; height: number; txs: number; pool: string | null }
  | { kind: "empty"; height: number; pool: string | null }
  | { kind: "proof"; actions: number; pool: string | null }
  | { kind: "price"; usd: number; pct: number };

export interface Decor {
  update(t: number, dt: number, focus: THREE.Vector3, camPos: THREE.Vector3): void;
  setLive(d: Partial<LiveData>): void;
  /** Rain on or off; it builds up and dies away unless `now`. */
  setRain(on: boolean, now?: boolean): void;
  alert(a: Alert): void;
  /** The neon tubes all swing to `color` and glow brighter, then settle back over `seconds`. */
  pulse(color: string, seconds: number): void;
  /** Lightning on the Proof Factory's roof (a big shielded transaction being proven). */
  strike(): void;
}

type Tick = (t: number, dt: number, focus: THREE.Vector3, camPos: THREE.Vector3) => void;
const r = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function buildDecor(scene: THREE.Scene, city: City): Decor {
  const ticks: Tick[] = [];
  const live: LiveData = { height: null, mempool: 0, since: 0 };
  Market.subscribe((m) => (live.market = m));
  const screens = ads(city, ticks, live);
  const neon = neonTrim(city, ticks);
  const bolt = lightning(scene, city, ticks);
  lampGlow(city, ticks);
  const rain = rainfall(scene, ticks);
  hologram(scene, ticks);
  koi(scene, ticks);
  spray(scene, ticks);
  return {
    update(t, dt, focus, camPos) {
      EMIT_TIME.value = t;
      for (const k of ticks) k(t, dt, focus, camPos);
    },
    setLive(d) {
      Object.assign(live, d);
    },
    setRain(on, now) {
      rain.set(on, now);
    },
    alert: (a) => screens.alert(a),
    pulse: (c, sec) => neon.pulse(c, sec),
    strike: () => bolt(),
  };
}

// ---- ad screens -----------------------------------------------------------------------------------

type Ad = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, live: LiveData) => void;

const FONT = '"Hiragino Sans", "Noto Sans JP", Inter, sans-serif';
const MONO = '"JetBrains Mono", Menlo, monospace';

function zLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.12;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = s * 0.14;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.2);
  ctx.lineTo(cx + s * 0.2, cy - s * 0.2);
  ctx.lineTo(cx - s * 0.2, cy + s * 0.2);
  ctx.lineTo(cx + s * 0.2, cy + s * 0.2);
  ctx.stroke();
  ctx.restore();
}

const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

/** A small price line over the last two weeks, filled underneath. */
function sparkline(ctx: CanvasRenderingContext2D, pts: [number, number][], x: number, y: number, w: number, h: number, color: string) {
  if (pts.length < 2) return;
  const vs = pts.map((p) => p[1]);
  const lo = Math.min(...vs),
    hi = Math.max(...vs);
  const px = (i: number) => x + (i / (pts.length - 1)) * w;
  const py = (v: number) => y + h - ((v - lo) / (hi - lo || 1)) * h;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(px(i), py(p[1])) : ctx.moveTo(px(i), py(p[1]))));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, h * 0.05);
  ctx.stroke();
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, color + "55");
  g.addColorStop(1, color + "00");
  ctx.fillStyle = g;
  ctx.fill();
  // the last point blinks
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px(pts.length - 1), py(vs[vs.length - 1]), h * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

/** Live market boards: price with its 24 h move, market cap, supply. */
const MARKET_ADS: Ad[] = [
  // ZEC / USD, the move over 24 h, two weeks of closes
  (ctx, w, h, t, live) => {
    const p = live.market?.price;
    ctx.fillStyle = "#06070a";
    ctx.fillRect(0, 0, w, h);
    zLogo(ctx, h * 0.2, h * 0.22, h * 0.26, "#f4b728");
    ctx.fillStyle = "#f4b728";
    ctx.font = `700 ${h * 0.12}px ${MONO}`;
    fitText(ctx, "ZEC / USD", h * 0.4, h * 0.26);
    if (!p) return void ((ctx.fillStyle = "#666"), fitText(ctx, "LOADING…", w * 0.06, h * 0.6));
    const up = p.usd_24h_change >= 0;
    const col = up ? "#2fbf9c" : "#f06b76";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${h * 0.3}px ${MONO}`;
    fitText(ctx, usd(p.usd), w * 0.05, h * 0.62, w * 0.48);
    ctx.fillStyle = col;
    ctx.font = `700 ${h * 0.14}px ${MONO}`;
    fitText(ctx, `${up ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(2)}% 24H`, w * 0.05, h * 0.86, w * 0.48);
    sparkline(ctx, [...p.history, [Date.now(), p.usd]], w * 0.56, h * 0.38, w * 0.38, h * 0.48, col);
    if (Math.sin(t * 5) > 0) {
      ctx.fillStyle = col;
      ctx.fillRect(w * 0.94, h * 0.12, h * 0.06, h * 0.06);
    }
  },
  // market cap and volume
  (ctx, w, h, t, live) => {
    const p = live.market?.price;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#14100a");
    g.addColorStop(1, "#060608");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#a3a3a3";
    ctx.font = `600 ${h * 0.11}px ${MONO}`;
    fitText(ctx, "ZCASH MARKET CAP", w * 0.06, h * 0.22);
    if (!p) return;
    const up = p.usd_24h_change >= 0;
    ctx.fillStyle = "#f4b728";
    ctx.font = `800 ${h * 0.3}px ${MONO}`;
    fitText(ctx, usd(p.market_cap_usd), w * 0.06, h * 0.56);
    ctx.fillStyle = up ? "#2fbf9c" : "#f06b76";
    ctx.font = `700 ${h * 0.12}px ${MONO}`;
    fitText(ctx, `${up ? "+" : "−"}${usd(Math.abs((p.market_cap_usd * p.usd_24h_change) / (100 + p.usd_24h_change)))} TODAY`, w * 0.06, h * 0.74);
    // volume ticker
    ctx.fillStyle = "#f4b728";
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    ctx.fillStyle = "#0d0d0d";
    ctx.font = `700 ${h * 0.11}px ${MONO}`;
    const msg = `  24H VOLUME ${usd(p.volume_24h_usd)} · PRICE ${usd(p.usd)} · ${up ? "▲" : "▼"} ${Math.abs(p.usd_24h_change).toFixed(2)}% · `;
    const mw = ctx.measureText(msg).width;
    for (let x = -((t * 60) % mw); x < w; x += mw) ctx.fillText(msg, x, h * 0.94);
  },
  // supply mined so far, and how much of it is shielded
  (ctx, w, h, _t, live) => {
    const s = live.market?.supply,
      pools = live.market?.pools;
    ctx.fillStyle = "#04080f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#a3a3a3";
    ctx.font = `600 ${h * 0.11}px ${MONO}`;
    fitText(ctx, "ZEC SUPPLY", w * 0.06, h * 0.22);
    if (!s) return;
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${h * 0.26}px ${MONO}`;
    const fig = fitText(ctx, `${(s.supply / 1e14).toFixed(2)}M`, w * 0.06, h * 0.52, w * 0.62);
    ctx.fillStyle = "#737373";
    ctx.font = `600 ${h * 0.12}px ${MONO}`;
    fitText(ctx, "/ 21M", w * 0.06 + fig + h * 0.04, h * 0.52);
    // bar: mined share, with the shielded part in green
    const x = w * 0.06,
      bw = w * 0.88,
      y = h * 0.64,
      bh = h * 0.1;
    ctx.fillStyle = "#1a1f2a";
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = "#f4b728";
    ctx.fillRect(x, y, bw * (s.supply / s.max_supply), bh);
    if (pools) {
      ctx.fillStyle = "#1baf7a";
      ctx.fillRect(x, y, bw * (pools.shielded / s.max_supply), bh);
      ctx.fillStyle = "#3ddc97";
      ctx.font = `700 ${h * 0.11}px ${MONO}`;
      fitText(ctx, `${Math.round(pools.shielded_ratio * 100)}% SHIELDED`, x, h * 0.92);
    }
  },
];

/**
 * NU7 on every screen in turn: a countdown to the announced date (or, once the height is set, the
 * blocks left), then "NU7 IS LIVE" with what changed.
 */
const NU7_AD: Ad = (ctx, w, h, t, live) => {
  const n = live.nu7!;
  ctx.fillStyle = "#07060c";
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, w * 0.7);
  glow.addColorStop(0, n.activated ? "rgba(62,224,143,0.32)" : "rgba(176,123,255,0.32)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  const accent = n.activated ? "#3ee08f" : "#b07bff";
  ctx.fillStyle = accent;
  ctx.font = `800 ${h * 0.13}px ${FONT}`;
  fitText(ctx, n.activated ? "NU7 稼働中 · IS LIVE" : "NU7 · アップグレード", w / 2, h * 0.2);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = accent;
  ctx.shadowBlur = h * 0.08;
  if (n.activated) {
    ctx.font = `800 ${h * 0.24}px ${MONO}`;
    fitText(ctx, "25 s BLOCKS", w / 2, h * 0.52);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#cfc8e8";
    ctx.font = `600 ${h * 0.085}px ${MONO}`;
    fitText(ctx, "NSM · 60% OF FEES → RESERVE", w / 2, h * 0.72);
    fitText(ctx, n.height ? `SINCE BLOCK #${n.height.toLocaleString("en-US")}` : "", w / 2, h * 0.86);
  } else if (n.height && live.height) {
    const left = Math.max(0, n.height - live.height);
    ctx.font = `800 ${h * 0.26}px ${MONO}`;
    fitText(ctx, left.toLocaleString("en-US"), w / 2, h * 0.53);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#cfc8e8";
    ctx.font = `600 ${h * 0.085}px ${MONO}`;
    fitText(ctx, `BLOCKS TO #${n.height.toLocaleString("en-US")}`, w / 2, h * 0.72);
    const eta = new Date(Date.now() + left * 75_000);
    fitText(ctx, `≈ ${eta.toISOString().slice(0, 16).replace("T", " ")} UTC`, w / 2, h * 0.86);
  } else {
    // only a date announced: count down to it (mid-day UTC)
    const target = Date.parse(`${n.date ?? "2026-11-05"}T12:00:00Z`);
    const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const d = Math.floor(s / 86400),
      hh = Math.floor((s % 86400) / 3600),
      mm = Math.floor((s % 3600) / 60),
      ss = s % 60;
    ctx.font = `800 ${h * 0.2}px ${MONO}`;
    fitText(ctx, `${d}d ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`, w / 2, h * 0.52);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#cfc8e8";
    ctx.font = `600 ${h * 0.085}px ${MONO}`;
    fitText(ctx, `TARGET ${n.date ?? "2026-11-05"} · 25 s BLOCKS`, w / 2, h * 0.72);
    fitText(ctx, "HEIGHT TO BE SET · ZEBRA 7", w / 2, h * 0.86);
  }
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  // a pulse bar along the bottom
  ctx.fillStyle = accent;
  ctx.fillRect(0, h - h * 0.03, w * ((t * 0.25) % 1), h * 0.03);
};

const ADS: Ad[] = [
  // SHIELD EVERYTHING, gold on black, logo pulsing
  (ctx, w, h, t) => {
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.25, h / 2, 4, w * 0.25, h / 2, h);
    g.addColorStop(0, "rgba(244,183,40,0.35)");
    g.addColorStop(1, "rgba(244,183,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    zLogo(ctx, w * 0.22, h / 2, h * (0.62 + Math.sin(t * 3) * 0.04), "#f4b728");
    ctx.fillStyle = "#ffe08a";
    ctx.font = `800 ${h * 0.24}px ${FONT}`;
    shrink(ctx, "EVERYTHING", w * 0.54);
    ctx.fillText("SHIELD", w * 0.42, h * 0.45);
    ctx.fillText("EVERYTHING", w * 0.42, h * 0.75);
  },
  // live chain data: block height and mempool
  (ctx, w, h, _t, live) => {
    ctx.fillStyle = "#04121a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3ef0ff";
    ctx.font = `600 ${h * 0.14}px ${MONO}`;
    fitText(ctx, "ZCASH MAINNET · LIVE", w * 0.06, h * 0.22);
    ctx.font = `800 ${h * 0.32}px ${MONO}`;
    ctx.fillStyle = "#e8fbff";
    fitText(ctx, live.height ? `#${live.height.toLocaleString("en-US")}` : "SYNCING", w * 0.06, h * 0.6);
    ctx.font = `600 ${h * 0.14}px ${MONO}`;
    ctx.fillStyle = "#ff3e8a";
    fitText(ctx, `MEMPOOL ${live.mempool} TX · ${Math.floor(live.since)}s AGO`, w * 0.06, h * 0.85);
  },
  // 零知識 — zero knowledge, magenta kanji with a scan line
  (ctx, w, h, t) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#2a0420");
    g.addColorStop(1, "#08021a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ff3e8a";
    ctx.font = `800 ${h * 0.5}px ${FONT}`;
    fitText(ctx, "零知識", w * 0.06, h * 0.62);
    ctx.fillStyle = "#ffb0d0";
    ctx.font = `600 ${h * 0.13}px ${FONT}`;
    fitText(ctx, "PROVE IT. REVEAL NOTHING.", w * 0.07, h * 0.88);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, ((t * 60) % (h + 20)) - 10, w, 6);
  },
  // ZSCAN.CASH ad with a scrolling ticker
  (ctx, w, h, t) => {
    ctx.fillStyle = "#0b0a14";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${h * 0.3}px ${FONT}`;
    shrink(ctx, "ZSCAN.CASH", w * 0.88);
    ctx.fillText("ZSCAN", w * 0.06, h * 0.45);
    ctx.fillStyle = "#f4b728";
    ctx.fillText(".CASH", w * 0.06 + ctx.measureText("ZSCAN").width, h * 0.45);
    ctx.fillStyle = "#9895a8";
    ctx.font = `500 ${h * 0.12}px ${FONT}`;
    fitText(ctx, "the Zcash explorer", w * 0.06, h * 0.62);
    ctx.fillStyle = "#59e3ff";
    ctx.fillRect(0, h * 0.74, w, h * 0.26);
    ctx.fillStyle = "#04121a";
    ctx.font = `700 ${h * 0.14}px ${MONO}`;
    const msg = "  SUPPLY AUDIT · SHIELDED POOLS · VIEWING KEYS · NU7 · ";
    const mw = ctx.measureText(msg).width;
    const off = -((t * 70) % mw);
    for (let x = off; x < w; x += mw) ctx.fillText(msg, x, h * 0.92);
  },
  // NU7 · 25s blocks, cyan countdown bars
  (ctx, w, h, t) => {
    ctx.fillStyle = "#020a14";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      const on = (Math.floor(t * 4) + i) % 12 < 8;
      ctx.fillStyle = on ? "#3ef0ff" : "#0c2a36";
      ctx.fillRect(w * 0.06 + i * w * 0.075, h * 0.68, w * 0.06, h * 0.14);
    }
    ctx.fillStyle = "#e8fbff";
    ctx.font = `800 ${h * 0.34}px ${FONT}`;
    const nw = fitText(ctx, "NU7", w * 0.06, h * 0.48, w * 0.4);
    ctx.fillStyle = "#3ef0ff";
    ctx.font = `600 ${h * 0.13}px ${FONT}`;
    fitText(ctx, "25s BLOCKS · COMING", w * 0.06 + nw + h * 0.08, h * 0.46);
  },
  // ramen ad, warm
  (ctx, w, h, t) => {
    ctx.fillStyle = "#2a0e06";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ff8a3a";
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.58, h * 0.3, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = "#ffe0b0";
    for (let i = 0; i < 3; i++) ctx.fillRect(w * (0.12 + i * 0.07), h * (0.2 + Math.sin(t * 2 + i) * 0.03), w * 0.012, h * 0.3);
    ctx.fillStyle = "#fff0d8";
    ctx.font = `800 ${h * 0.36}px ${FONT}`;
    fitText(ctx, "ラーメン", w * 0.44, h * 0.55);
    ctx.fillStyle = "#ffb070";
    ctx.font = `600 ${h * 0.12}px ${FONT}`;
    fitText(ctx, "24H · PAY IN ZEC", w * 0.45, h * 0.8);
  },
  // 10,000 encrypted identities (zkSNARK pixel face)
  (ctx, w, h, t) => {
    ctx.fillStyle = "#0a0414";
    ctx.fillRect(0, 0, w, h);
    const px = h / 13;
    const face = ["00111110", "01111111", "11011011", "11111111", "11100111", "01111110", "00111100"];
    face.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === "1") {
          ctx.fillStyle = y === 2 && (x === 2 || x === 5) ? (Math.sin(t * 4) > 0 ? "#3ee08f" : "#f4b728") : "#b07bff";
          ctx.fillRect(w * 0.06 + x * px, h * 0.2 + y * px, px - 1, px - 1);
        }
      }),
    );
    ctx.fillStyle = "#e8e0ff";
    ctx.font = `800 ${h * 0.22}px ${FONT}`;
    fitText(ctx, "zkSNARKs", w * 0.42, h * 0.48);
    ctx.fillStyle = "#b07bff";
    ctx.font = `600 ${h * 0.11}px ${FONT}`;
    fitText(ctx, "10,000 encrypted identities", w * 0.42, h * 0.7);
  },
];

/** LED screens on the tall buildings, a giant one on the tower, flicker and scan lines on all. */
function ads(city: City, ticks: Tick[], live: LiveData) {
  const screens: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; ads: Ad[]; at: number; w: number; h: number }[] = [];
  const make = (parent: THREE.Object3D, w: number, h: number, pos: THREE.Vector3, yaw: number, list: Ad[]) => {
    const W = 384,
      H = Math.round((384 * h) / w);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
    screen.position.copy(pos);
    screen.rotation.y = yaw;
    // bezel and a soft glow behind
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.12), new THREE.MeshStandardMaterial({ color: "#0e0d14", roughness: 0.5, metalness: 0.6 }));
    bezel.position.copy(pos).add(new THREE.Vector3(0, 0, -0.07).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    bezel.rotation.y = yaw;
    parent.add(bezel, screen);
    screens.push({ ctx: c.getContext("2d")!, tex, ads: list, at: Math.random() * 10, w: W, h: H });
  };
  const rand = r(77);
  for (const f of city.facades) {
    if (f.face !== "s" || f.height < 7) continue;
    const width = f.x1 - f.x0;
    const z = f.z + 0.12;
    if (f.type === "office" && f.height > 14) {
      // a vertical banner screen up the front of the tower, high above the street
      const w = Math.min(width * 0.55, 3.6),
        h = w * 0.56;
      // towers carry the market: price or market cap on every one, between two ads
      for (let k = 0; k < (f.height > 25 ? 2 : 1); k++)
        make(f.extras, w, h, new THREE.Vector3(f.x0 + width * (0.3 + k * 0.4), CURB + f.height * (0.55 + k * 0.18), z + 0.2), 0, [MARKET_ADS[(k + Math.floor(rand() * 3)) % 3], ADS[Math.floor(rand() * ADS.length)]]);
    } else if (f.type === "apartment" || f.type === "shophouse") {
      if (rand() > 0.55) make(f.extras, Math.min(2.4, width * 0.4), 1.35, new THREE.Vector3(f.x0 + width * (0.25 + rand() * 0.5), CURB + f.height * 0.72, z + 0.95), 0, [ADS[Math.floor(rand() * ADS.length)]]);
    }
  }
  // the downtown tower gets the live board, big, on the side facing the crossing
  const tower = city.facades.find((f) => f.type === "office" && f.frontRow);
  if (tower) make(tower.extras, 4.2, 2.4, new THREE.Vector3((tower.x0 + tower.x1) / 2, CURB + tower.height * 0.48, tower.z + 0.4), 0, [MARKET_ADS[0], ADS[1], MARKET_ADS[1], MARKET_ADS[2]]);
  // two rooftop billboards over the square and over the yard
  const board = new THREE.Group();
  make(board, 7, 3, new THREE.Vector3(0, 0, -0.08), Math.PI, [ADS[6], ADS[2], ADS[4]]);
  make(board, 7, 3, new THREE.Vector3(0, 0, 0.08), 0, [MARKET_ADS[0], ADS[3], MARKET_ADS[1], ADS[0]]);
  board.position.set(0, CURB + 13.4, 29.2);
  const legs = new THREE.MeshStandardMaterial({ color: "#1e1c26", metalness: 0.6, roughness: 0.4 });
  for (const x of [-2.6, 2.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4, 0.16), legs);
    l.position.set(x, -3.2, 0.2);
    board.add(l);
  }
  city.group.add(board);
  const yardBoard = new THREE.Group();
  make(yardBoard, 6, 2.6, new THREE.Vector3(0.08, 0, 0), Math.PI / 2, [MARKET_ADS[2], ADS[4], MARKET_ADS[0]]);
  make(yardBoard, 6, 2.6, new THREE.Vector3(-0.08, 0, 0), -Math.PI / 2, [ADS[2], ADS[6], ADS[1]]);
  yardBoard.position.set(49.6, CURB + 9, 18);
  city.group.add(yardBoard);

  let last = 0;
  let now = 0;
  let alert: { a: Alert; from: number; until: number } | null = null;
  ticks.push((t) => {
    now = t;
    if (t - last < 1 / 15) return;
    last = t;
    if (alert && t > alert.until) alert = null;
    for (const s of screens) {
      if (alert) {
        alertAd(s.ctx, s.w, s.h, t - alert.from, alert.a);
        s.ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let y = 0; y < s.h; y += 3) s.ctx.fillRect(0, y, s.w, 1);
        s.tex.needsUpdate = true;
        continue;
      }
      // NU7 takes a turn on every screen until (and after) it activates
      const list = live.nu7 ? [...s.ads, NU7_AD] : s.ads;
      const slot = Math.floor((t + s.at) / 7) % list.length;
      const phase = (t + s.at) % 7;
      list[slot](s.ctx, s.w, s.h, t, live);
      // scan lines, and a glitch on the cut between two ads
      s.ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0; y < s.h; y += 3) s.ctx.fillRect(0, y, s.w, 1);
      if (phase < 0.25) {
        for (let i = 0; i < 6; i++) {
          const y = Math.random() * s.h;
          s.ctx.drawImage(s.ctx.canvas, 0, y, s.w, 8, (Math.random() - 0.5) * 30, y, s.w, 8);
        }
        s.ctx.fillStyle = "rgba(62,240,255,0.15)";
        s.ctx.fillRect(0, 0, s.w, s.h);
      }
      s.tex.needsUpdate = true;
    }
  });
  return {
    alert(a: Alert) {
      alert = { a, from: now, until: now + (a.kind === "block" || a.kind === "empty" ? 6.5 : 5) };
    },
  };
}

const POOL_NAME: Record<string, string> = { orchard: "ORCHARD", ironwood: "IRONWOOD", sapling: "SAPLING" };

/** What every screen shows while an alert is on: a flash, a band, one big figure, one line. */
function alertAd(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, a: Alert) {
  const look = {
    block: { bg: "#06070a", band: "#f4b728", ink: "#0d0d0d", title: "NEW BLOCK  新ブロック", big: "", line: "", lineCol: "#f4b728" },
    empty: { bg: "#0b0b0e", band: "#5a5866", ink: "#e8e6ee", title: "EMPTY BLOCK  空", big: "", line: "", lineCol: "#8a8896" },
    proof: { bg: "#05100b", band: "#3ee08f", ink: "#04140c", title: "SHIELDED  秘密", big: "", line: "", lineCol: "#3ee08f" },
    price: { bg: "#06070a", band: "#2fbf9c", ink: "#04140c", title: "ZEC / USD", big: "", line: "", lineCol: "#2fbf9c" },
  }[a.kind];
  if (a.kind === "block") {
    look.big = `#${a.height.toLocaleString("en-US")}`;
    look.line = `${a.txs} TX${a.pool ? ` · ${a.pool.toUpperCase()}` : ""}`;
  } else if (a.kind === "empty") {
    look.big = `#${a.height.toLocaleString("en-US")}`;
    look.line = `COINBASE ONLY${a.pool ? ` · ${a.pool.toUpperCase()}` : ""}`;
  } else if (a.kind === "proof") {
    look.big = `${a.actions} ACTIONS`;
    look.line = a.pool ? `${POOL_NAME[a.pool] ?? a.pool.toUpperCase()} POOL` : "SHIELDED POOL";
  } else {
    const up = a.pct >= 0;
    look.band = look.lineCol = up ? "#2fbf9c" : "#f06b76";
    look.big = `${up ? "▲" : "▼"} ${Math.abs(a.pct).toFixed(2)}%`;
    look.line = usd(a.usd);
  }
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, w, h);
  // the band blinks for the first two seconds
  const on = age > 2 || Math.floor(age * 4) % 2 === 0;
  ctx.fillStyle = on ? look.band : look.bg;
  ctx.fillRect(0, 0, w, h * 0.26);
  ctx.fillStyle = on ? look.ink : look.band;
  ctx.font = `800 ${h * 0.14}px ${FONT}`;
  fitText(ctx, look.title, w * 0.05, h * 0.18, w * 0.9);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${h * 0.3}px ${MONO}`;
  fitText(ctx, look.big, w * 0.05, h * 0.62, w * 0.9);
  ctx.fillStyle = look.lineCol;
  ctx.font = `700 ${h * 0.13}px ${MONO}`;
  fitText(ctx, look.line, w * 0.05, h * 0.86, w * 0.9);
  // the cut-in: a white flash that fades
  if (age < 0.5) {
    ctx.fillStyle = `rgba(255,255,255,${(1 - age / 0.5) * 0.85})`;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---- lamp glow ----------------------------------------------------------------------------------

/**
 * At night each street lamp gets a soft halo around its head and a faint cone of light down to
 * the pavement, where the rain shows. Two draw calls for the whole city (points and an instanced
 * cone); hidden by day through the theme's `night` tag.
 */
function lampGlow(city: City, ticks: Tick[]) {
  const lamps = city.lamps.filter((l) => (l.intensity ?? 14) >= 10);
  if (!lamps.length) return;
  // halos: one point each, a radial glow texture
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const tmp = new THREE.Color();
  const haloMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  haloMat.userData.night = true;
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.8, 2.8), haloMat, lamps.length);
  lamps.forEach((l, i) => halos.setColorAt(i, tmp.set(l.color)));
  halos.renderOrder = 3;
  halos.frustumCulled = false;
  city.group.add(halos);
  // the halos turn to face the camera
  const dummy = new THREE.Object3D();
  ticks.push((_t, _dt, _focus, camPos) => {
    if (!halos.visible) return;
    lamps.forEach((l, i) => {
      dummy.position.copy(l.pos);
      dummy.lookAt(camPos);
      dummy.updateMatrix();
      halos.setMatrixAt(i, dummy.matrix);
    });
    halos.instanceMatrix.needsUpdate = true;
  });
  // cones of light down to the pavement
  const cone = new THREE.ConeGeometry(1.5, 1, 20, 1, true);
  cone.translate(0, -0.5, 0);
  const coneMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  coneMat.userData.night = true;
  const cones = new THREE.InstancedMesh(cone, coneMat, lamps.length);
  const m = new THREE.Matrix4();
  lamps.forEach((l, i) => {
    const h = Math.max(1, l.pos.y - CURB);
    m.compose(l.pos.clone().add(new THREE.Vector3(0, -0.1, 0)), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
    cones.setMatrixAt(i, m);
    cones.setColorAt(i, tmp.set(l.color));
  });
  cones.renderOrder = 2;
  city.group.add(cones);
}

// ---- neon tubes ---------------------------------------------------------------------------------

/** Thin neon tubes along the roof lines and corners of the downtown buildings. */
function neonTrim(city: City, ticks: Tick[]) {
  const colors = ["#3ef0ff", "#ff3e8a", "#b07bff", "#ff9f2e", "#38ff9c"];
  const rand = r(9);
  const tubes: { m: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  for (const f of city.facades) {
    if (f.face !== "s" || !f.frontRow || f.type === "house" || f.type === "mempool") continue;
    const c = new THREE.Color(colors[Math.floor(rand() * colors.length)]).multiplyScalar(2.4);
    const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    tubes.push({ m, base: c.clone() });
    const w = f.x1 - f.x0;
    const top = CURB + f.height + 0.05;
    const tube = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      t.position.set(x, y, z);
      f.extras.add(t);
    };
    tube(w, 0.06, 0.06, (f.x0 + f.x1) / 2, top, f.z + 0.1);
    if (rand() > 0.4) {
      tube(0.06, f.height - 3, 0.06, f.x1 - 0.1, CURB + 3 + (f.height - 3) / 2, f.z + 0.1);
      tube(0.06, f.height - 3, 0.06, f.x0 + 0.1, CURB + 3 + (f.height - 3) / 2, f.z + 0.1);
    }
  }
  let pulse: { color: THREE.Color; left: number; len: number } | null = null;
  ticks.push((_t, dt) => {
    if (!pulse) return;
    pulse.left -= dt;
    const k = Math.max(0, pulse.left / pulse.len);
    for (const tb of tubes) tb.m.color.copy(tb.base).lerp(pulse.color, Math.min(1, k * 1.6)).multiplyScalar(1 + k * 0.9);
    if (pulse.left <= 0) pulse = null;
  });
  return {
    pulse(color: string, seconds: number) {
      pulse = { color: new THREE.Color(color).multiplyScalar(2.4), left: seconds, len: seconds };
    },
  };
}

// ---- lightning ------------------------------------------------------------------------------------

/**
 * A bolt from the sky onto the Proof Factory's roof, flickering twice, with a glow where it lands.
 * Plain lines and one additive plane: no extra light in the scene (that would recompile every
 * material).
 */
function lightning(scene: THREE.Scene, city: City, ticks: Tick[]) {
  const hall = city.factory?.hall;
  if (!hall) return () => {};
  const occ = city.occluders.find((o) => o.box.containsPoint(new THREE.Vector3(hall.x, CURB + 1, hall.z)));
  const top = occ ? occ.box.max.y : CURB + 10;
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, 2.6, 3.2), toneMapped: false, transparent: true });
  const bolt = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
  bolt.frustumCulled = false;
  bolt.visible = false;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(220,240,255,1)");
  grad.addColorStop(0.3, "rgba(140,200,255,0.5)");
  grad.addColorStop(1, "rgba(120,160,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(hall.x, top + 0.2, hall.z);
  glow.visible = false;
  scene.add(bolt, glow);
  let age = -1;
  const shape = () => {
    // a main channel zig-zagging down, with two short forks
    const pts: number[] = [];
    let x = hall.x + (Math.random() - 0.5) * 6,
      z = hall.z + (Math.random() - 0.5) * 3,
      y = top + 34;
    const seg = (x2: number, y2: number, z2: number) => {
      pts.push(x, y, z, x2, y2, z2);
      x = x2;
      y = y2;
      z = z2;
    };
    const fork = (fx: number, fy: number, fz: number) => {
      let a = fx,
        b = fy,
        cz = fz;
      for (let i = 0; i < 3; i++) {
        const na = a + (Math.random() - 0.5) * 3,
          nb = b - 2 - Math.random() * 2,
          nc = cz + (Math.random() - 0.5) * 2;
        pts.push(a, b, cz, na, nb, nc);
        a = na;
        b = nb;
        cz = nc;
      }
    };
    for (let i = 0; i < 12; i++) {
      seg(hall.x + (Math.random() - 0.5) * 3 * (1 - i / 12), Math.max(top, y - (34 / 12) * (0.6 + Math.random() * 0.8)), hall.z + (Math.random() - 0.5) * 2);
      if (i === 4 || i === 8) fork(x, y, z);
    }
    seg(hall.x, top, hall.z);
    bolt.geometry.dispose();
    bolt.geometry = new THREE.BufferGeometry();
    bolt.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  };
  ticks.push((_t, dt) => {
    if (age < 0) return;
    age += dt;
    // on, off, on again (a new shape), then out
    const on = age < 0.09 || (age > 0.16 && age < 0.34);
    if (age > 0.16 && age - dt <= 0.16) shape();
    bolt.visible = on;
    glow.visible = age < 0.9;
    (glow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age / 0.9);
    if (age > 0.9) age = -1;
  });
  return () => {
    shape();
    age = 0;
  };
}

// ---- rain ---------------------------------------------------------------------------------------

/** Fine rain falling around what the camera looks at: streaks, slanted by a light wind. */
/**
 * Rain over the whole map: streaks seeded once across the diorama (and the causeways out to the
 * tunnels), falling in the vertex shader, so it costs nothing on the CPU however big the area.
 */
function rainfall(scene: THREE.Scene, ticks: Tick[]) {
  const N = 16000,
    X = 120,
    Z = 90,
    H = 24;
  const seed = new Float32Array(N * 2 * 3);
  const end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * X,
      y = Math.random() * H,
      z = (Math.random() - 0.5) * Z - 3;
    seed.set([x, y, z, x, y, z], i * 6);
    end[i * 2] = 0;
    end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(seed, 3));
  geo.setAttribute("tip", new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { t: { value: 0 }, amount: { value: 1 }, color: { value: new THREE.Color(0.55, 0.6, 0.85) } },
    vertexShader: `
      attribute float tip;
      uniform float t;
      uniform float amount;
      varying float a;
      void main() {
        // a shower builds up and dies away: fewer streaks, not fainter ones
        if (fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453) > amount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 p = position;
        p.y = mod(p.y - t * 16.0, ${H.toFixed(1)});
        p.x += p.y * 0.12 + tip * 0.05;
        p.y += tip * 0.42;
        a = 0.32 * (1.0 - tip * 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      varying float a;
      void main() { gl_FragColor = vec4(color, a); }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  let target = 1;
  ticks.push((t, dt) => {
    const u = mat.uniforms.amount;
    u.value += Math.sign(target - u.value) * Math.min(Math.abs(target - u.value), dt / 6);
    lines.visible = u.value > 0.001;
    if (lines.visible) mat.uniforms.t.value = t;
  });
  return {
    /** Start or stop the rain: it builds up or dies away over a few seconds. */
    set(on: boolean, now = false) {
      target = on ? 1 : 0;
      if (now) mat.uniforms.amount.value = target;
      lines.visible = mat.uniforms.amount.value > 0.001;
    },
  };
}

// ---- hologram -------------------------------------------------------------------------------------

/** A turning ⓩ hologram over the fountain: scan lines, flicker, a beam from the spout. */
function hologram(scene: THREE.Scene, ticks: Tick[]) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { map: { value: zcashBadge("#ffe08a", "rgba(0,0,0,0)") }, t: { value: 0 } },
    vertexShader: "varying vec2 vUv; varying float vY; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform sampler2D map; uniform float t; varying vec2 vUv; varying float vY;
      void main(){
        vec4 c = texture2D(map, vUv);
        float scan = 0.65 + 0.35 * sin(vY * 40.0 - t * 6.0);
        float flick = 0.85 + 0.15 * sin(t * 23.0) * sin(t * 7.0);
        gl_FragColor = vec4(vec3(0.35, 1.1, 1.6) * c.a * scan * flick, c.a * 0.85);
      }`,
  });
  const coin = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), mat);
  coin.position.set(0, CURB + 6.4, 19);
  scene.add(coin);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 1.3, 2.4, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.7, 1.0), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.position.set(0, CURB + 4.9, 19);
  scene.add(beam);
  ticks.push((t) => {
    coin.rotation.y = t * 0.8;
    coin.position.y = CURB + 6.4 + Math.sin(t * 1.2) * 0.12;
    mat.uniforms.t.value = t;
  });
}

// ---- koi ----------------------------------------------------------------------------------------

function koi(scene: THREE.Scene, ticks: Tick[]) {
  const fish: { m: THREE.Mesh; a: number; rad: number; speed: number }[] = [];
  const colors = ["#ff7a2a", "#ffffff", "#ff4a2a", "#f0c040", "#ff9a5a"];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.16), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], emissive: colors[i % colors.length], emissiveIntensity: 0.25 }));
    scene.add(m);
    fish.push({ m, a: Math.random() * Math.PI * 2, rad: 0.8 + Math.random() * 1.4, speed: (0.25 + Math.random() * 0.25) * (i % 2 ? 1 : -1) });
  }
  ticks.push((t, dt) => {
    for (const f of fish) {
      f.a += f.speed * dt;
      const x = -37.5 + Math.cos(f.a) * f.rad * 1.6,
        z = 21 + Math.sin(f.a) * f.rad * 1.05;
      f.m.position.set(x, CURB + 0.0, z);
      f.m.rotation.y = -f.a - (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 6 + f.rad) * 0.2;
    }
  });
}

// ---- fountain spray -------------------------------------------------------------------------------

function spray(scene: THREE.Scene, ticks: Tick[]) {
  const N = 140;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: blobTexture("rgba(200,240,255,0.9)", "rgba(200,240,255,0)"), size: 0.18, transparent: true, depthWrite: false, color: new THREE.Color(1.4, 1.8, 2.0) }));
  pts.frustumCulled = false;
  scene.add(pts);
  const reset = (i: number) => {
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = 0;
    pos[i * 3 + 1] = CURB + 3.6;
    pos[i * 3 + 2] = 19;
    vel[i * 3] = Math.cos(a) * (0.6 + Math.random() * 0.5);
    vel[i * 3 + 1] = 2.2 + Math.random() * 0.8;
    vel[i * 3 + 2] = Math.sin(a) * (0.6 + Math.random() * 0.5);
    life[i] = 0;
  };
  for (let i = 0; i < N; i++) {
    reset(i);
    life[i] = Math.random() * 1.4;
  }
  ticks.push((_t, dt) => {
    for (let i = 0; i < N; i++) {
      life[i] += dt;
      vel[i * 3 + 1] -= 9.8 * dt * 0.6;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < CURB + 0.75 || life[i] > 1.6) reset(i);
    }
    geo.attributes.position.needsUpdate = true;
  });
}

export type { Facade };
