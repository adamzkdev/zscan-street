import * as THREE from "three";
import type { City, Facade } from "./city";
import { CURB } from "./city";
import { Market, type MarketState } from "../data/market";
import { blobTexture, zcashBadge } from "./textures";
import { fitText, shrink } from "./fit";

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
}

export interface Decor {
  update(t: number, dt: number, focus: THREE.Vector3, camPos: THREE.Vector3): void;
  setLive(d: Partial<LiveData>): void;
  setRain(on: boolean): void;
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
  ads(city, ticks, live);
  neonTrim(city);
  const rain = rainfall(scene, ticks);
  hologram(scene, ticks);
  koi(scene, ticks);
  spray(scene, ticks);
  return {
    update(t, dt, focus, camPos) {
      for (const k of ticks) k(t, dt, focus, camPos);
    },
    setLive(d) {
      Object.assign(live, d);
    },
    setRain(on) {
      rain.visible = on;
    },
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
  ticks.push((t) => {
    if (t - last < 1 / 15) return;
    last = t;
    for (const s of screens) {
      const slot = Math.floor((t + s.at) / 7) % s.ads.length;
      const phase = (t + s.at) % 7;
      s.ads[slot](s.ctx, s.w, s.h, t, live);
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
}

// ---- neon tubes ---------------------------------------------------------------------------------

/** Thin neon tubes along the roof lines and corners of the downtown buildings. */
function neonTrim(city: City) {
  const colors = ["#3ef0ff", "#ff3e8a", "#b07bff", "#ff9f2e", "#38ff9c"];
  const rand = r(9);
  for (const f of city.facades) {
    if (f.face !== "s" || !f.frontRow || f.type === "house" || f.type === "mempool") continue;
    const c = new THREE.Color(colors[Math.floor(rand() * colors.length)]).multiplyScalar(2.4);
    const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
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
}

// ---- rain ---------------------------------------------------------------------------------------

/** Fine rain falling around what the camera looks at: streaks, slanted by a light wind. */
function rainfall(scene: THREE.Scene, ticks: Tick[]) {
  const N = 2600,
    R = 26,
    H = 22;
  const pos = new Float32Array(N * 6);
  const seeds = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    seeds[i * 3] = (Math.random() - 0.5) * 2 * R;
    seeds[i * 3 + 1] = Math.random() * H;
    seeds[i * 3 + 2] = (Math.random() - 0.5) * 2 * R;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(0.55, 0.6, 0.85), transparent: true, opacity: 0.32, depthWrite: false }));
  lines.frustumCulled = false;
  scene.add(lines);
  ticks.push((_t, dt, focus) => {
    if (!lines.visible) return;
    for (let i = 0; i < N; i++) {
      let y = seeds[i * 3 + 1] - dt * 16;
      if (y < 0) y += H;
      seeds[i * 3 + 1] = y;
      const x = focus.x + seeds[i * 3] + y * 0.12,
        z = focus.z + seeds[i * 3 + 2];
      pos[i * 6] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.05;
      pos[i * 6 + 4] = y + 0.42;
      pos[i * 6 + 5] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return lines;
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
