import * as THREE from "three";
import type { Pools, MarketState } from "../../data/market";

/** Canvas-drawn surfaces of the bank: marble, boards, neon, deposit boxes. */

export const GOLD = "#f4b728";
export const INK = "#0d0d0d";
export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SANS = 'Roboto, "Helvetica Neue", Arial, sans-serif';
export const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';

export const POOLS = ["transparent", "sapling", "orchard", "ironwood", "sprout"] as const;
export type PoolKey = (typeof POOLS)[number];
export const POOL_COLOR: Record<PoolKey, string> = { transparent: "#eda100", sprout: "#9085e9", sapling: "#3987e5", orchard: "#eb6834", ironwood: "#1baf7a" };
export const POOL_NAME: Record<PoolKey, string> = { transparent: "Transparent", sprout: "Sprout", sapling: "Sapling", orchard: "Orchard", ironwood: "Ironwood" };
export const POOL_JP: Record<PoolKey, string> = { transparent: "透明", sprout: "新芽", sapling: "若木", orchard: "果樹園", ironwood: "鉄木" };

export const zecOf = (zat: number) => zat / 1e8;
export const fmtZec = (zat: number, digits = 0) => (zat / 1e8).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtSigned = (zat: number) => `${zat >= 0 ? "+" : "−"}${fmtZec(Math.abs(zat), Math.abs(zat) < 1e10 ? 1 : 0)}`;
export const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

export function surface(w: number, h: number): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex };
}

/** A self-lit screen: a plane showing a canvas, slightly overdriven so its brightest parts bloom. */
export function screen(s: Surface, wM: number, hM: number, k = 1.15) {
  const mat = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false, transparent: true });
  mat.color.setScalar(k);
  return new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), mat);
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Marble veins: wandering thin strokes. */
function veins(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, n: number, r: () => number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.12 + r() * 0.3;
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.beginPath();
    let px = x + r() * w,
      py = y + r() * h;
    ctx.moveTo(px, py);
    const a0 = r() * Math.PI * 2;
    for (let k = 0; k < 7; k++) {
      const a = a0 + (r() - 0.5) * 1.6;
      const len = (w + h) * (0.05 + r() * 0.12);
      const nx = px + Math.cos(a) * len,
        ny = py + Math.sin(a) * len;
      ctx.quadraticCurveTo(px + (r() - 0.5) * len, py + (r() - 0.5) * len, nx, ny);
      px = nx;
      py = ny;
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The banking hall floor: black and ivory marble checker on the diagonal, a gold inlay border and a
 * medallion around the key island. `cx, cz` is the medallion centre, in metres from the top-left.
 */
export function marbleFloor(wM: number, dM: number, cx: number, cz: number) {
  const ppm = 64;
  const s = surface(Math.round(wM * ppm), Math.round(dM * ppm));
  const { ctx, canvas } = s;
  const r = rng(7);
  const tile = 1.5 * ppm;
  ctx.fillStyle = "#121115";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let j = -1; j < canvas.height / tile + 1; j++)
    for (let i = -1; i < canvas.width / tile + 1; i++) {
      const light = (i + j) % 2 === 0;
      const x = i * tile,
        y = j * tile;
      const g = ctx.createLinearGradient(x, y, x + tile, y + tile);
      if (light) {
        const b = 0.92 + r() * 0.08;
        g.addColorStop(0, `rgb(${222 * b},${212 * b},${192 * b})`);
        g.addColorStop(1, `rgb(${200 * b},${190 * b},${170 * b})`);
      } else {
        g.addColorStop(0, "#19171c");
        g.addColorStop(1, "#0f0e12");
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, tile, tile);
      veins(ctx, x, y, tile, tile, light ? "#8a8072" : "#4a4552", 3, r);
      // a hairline joint
      ctx.globalAlpha = 1;
      ctx.strokeStyle = light ? "rgba(90,80,64,.5)" : "rgba(0,0,0,.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    }
  // diamond inserts where four tiles meet
  ctx.fillStyle = "#b8862a";
  for (let j = 0; j < canvas.height / tile + 1; j++)
    for (let i = 0; i < canvas.width / tile + 1; i++) {
      const x = i * tile,
        y = j * tile;
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 7, y);
      ctx.fill();
    }
  // border: black marble band with a gold inlay
  const bw = 1.1 * ppm;
  ctx.fillStyle = "#0d0c10";
  ctx.fillRect(0, 0, canvas.width, bw);
  ctx.fillRect(0, canvas.height - bw, canvas.width, bw);
  ctx.fillRect(0, 0, bw, canvas.height);
  ctx.fillRect(canvas.width - bw, 0, bw, canvas.height);
  veins(ctx, 0, 0, canvas.width, canvas.height, "#3a3640", 0, r);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  ctx.strokeRect(bw, bw, canvas.width - 2 * bw, canvas.height - 2 * bw);
  ctx.lineWidth = 2;
  ctx.strokeRect(bw - 12, bw - 12, canvas.width - 2 * bw + 24, canvas.height - 2 * bw + 24);
  // the medallion
  const mx = cx * ppm,
    my = cz * ppm;
  const R = 4.6 * ppm;
  ctx.fillStyle = "#0e0d11";
  ctx.beginPath();
  ctx.arc(mx, my, R, 0, Math.PI * 2);
  ctx.fill();
  veins(ctx, mx - R, my - R, 2 * R, 2 * R, "#3e3946", 12, r);
  for (const [rr, lw] of [
    [R, 8],
    [R - 18, 2],
    [R * 0.72, 4],
  ] as const) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(mx, my, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // compass rays between the rings
  ctx.fillStyle = "#c99a2e";
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    const r0 = R * 0.74,
      r1 = R - 22 - (k % 2 ? 18 : 0);
    ctx.beginPath();
    ctx.moveTo(mx + Math.cos(a - 0.03) * r0, my + Math.sin(a - 0.03) * r0);
    ctx.lineTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1);
    ctx.lineTo(mx + Math.cos(a + 0.03) * r0, my + Math.sin(a + 0.03) * r0);
    ctx.fill();
  }
  // a gold ⓩ inlaid at the door, the first thing you step on
  const zx = canvas.width / 2,
    zy = canvas.height - 3.4 * ppm;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(zx, zy, 1.05 * ppm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.font = `700 ${1.5 * ppm}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Z", zx, zy + 4);
  ctx.fillRect(zx - 4, zy - 1.15 * ppm, 8, 0.32 * ppm);
  ctx.fillRect(zx - 4, zy + 0.83 * ppm, 8, 0.32 * ppm);
  s.tex.needsUpdate = true;
  return s.tex;
}

/** Brushed steel tiles with a yellow hazard border: the vault floor. */
export function vaultFloor() {
  const s = surface(512, 512);
  const { ctx } = s;
  const r = rng(11);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const v = 30 + r() * 8;
      ctx.fillStyle = `rgb(${v},${v - 1},${v + 4})`;
      ctx.fillRect(i * 128, j * 128, 128, 128);
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#9a9aa8";
      for (let k = 0; k < 40; k++) {
        const y = j * 128 + r() * 128;
        ctx.beginPath();
        ctx.moveTo(i * 128, y);
        ctx.lineTo(i * 128 + 128, y + (r() - 0.5) * 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#0b0b0e";
      ctx.lineWidth = 3;
      ctx.strokeRect(i * 128, j * 128, 128, 128);
      ctx.fillStyle = "#55535e";
      for (const [dx, dy] of [
        [10, 10],
        [118, 10],
        [10, 118],
        [118, 118],
      ])
        ctx.fillRect(i * 128 + dx - 3, j * 128 + dy - 3, 6, 6);
    }
  s.tex.wrapS = s.tex.wrapT = THREE.RepeatWrapping;
  s.tex.needsUpdate = true;
  return s.tex;
}

/** A wall of safe-deposit boxes: brushed doors, numbers, keyholes. Tiles 1 m square. */
export function depositBoxes() {
  const s = surface(512, 512);
  const { ctx } = s;
  const r = rng(23);
  ctx.fillStyle = "#1a191e";
  ctx.fillRect(0, 0, 512, 512);
  const rows = [
    [4, 120],
    [4, 120],
    [2, 136],
    [4, 136],
  ] as const;
  let y = 0;
  let n = 101;
  for (const [cols, h] of rows) {
    const w = 512 / cols;
    for (let i = 0; i < cols; i++) {
      const x = i * w;
      const v = 120 + r() * 26;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, `rgb(${v + 14},${v + 8},${v - 6})`);
      g.addColorStop(1, `rgb(${v - 30},${v - 34},${v - 44})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.strokeStyle = "rgba(255,240,200,.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);
      // brushing
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      for (let k = 0; k < 14; k++) {
        const yy = y + 8 + r() * (h - 16);
        ctx.beginPath();
        ctx.moveTo(x + 8, yy);
        ctx.lineTo(x + w - 8, yy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // number plate and keyhole
      ctx.fillStyle = "#2a2014";
      ctx.fillRect(x + w / 2 - 22, y + 18, 44, 18);
      ctx.fillStyle = "#e8c070";
      ctx.font = `500 14px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n++), x + w / 2, y + 28);
      ctx.fillStyle = "#0c0b0e";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2 + 10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + w / 2 - 2.5, y + h / 2 + 10, 5, 14);
      ctx.strokeStyle = "#d8b060";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2 + 10, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
    y += h;
  }
  s.tex.wrapS = s.tex.wrapT = THREE.RepeatWrapping;
  s.tex.needsUpdate = true;
  return s.tex;
}

/** Neon tubes: a glowing text on a transparent canvas, horizontal or stacked vertically (kanji). */
export function neon(text: string, o: { h: number; color: string; font?: string; vertical?: boolean; k?: number; frame?: boolean }) {
  const font = o.font ?? `700 110px ${SANS}`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const chars = o.vertical ? [...text] : [text];
  const cw = Math.max(...chars.map((c) => probe.measureText(c).width));
  const lh = 140;
  const pad = 60;
  const W = Math.ceil(cw + pad * 2),
    H = Math.ceil(lh * chars.length + pad * 2 - (o.vertical ? 0 : 0));
  const s = surface(W, H);
  const { ctx } = s;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const core = new THREE.Color(o.color).lerp(new THREE.Color("#ffffff"), 0.55);
  const draw = () => {
    chars.forEach((c, i) => ctx.fillText(c, W / 2, pad + lh * i + lh / 2 + 6));
  };
  if (o.frame) {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 8;
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.roundRect(14, 14, W - 28, H - 28, 26);
    ctx.stroke();
  }
  ctx.shadowColor = o.color;
  for (const blur of [44, 22, 10]) {
    ctx.shadowBlur = blur;
    ctx.fillStyle = o.color;
    draw();
  }
  ctx.shadowBlur = 4;
  ctx.fillStyle = `#${core.getHexString()}`;
  draw();
  s.tex.needsUpdate = true;
  const hM = o.h * (H / (lh + pad * 2));
  const mat = new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, depthWrite: false, toneMapped: false });
  mat.color.setScalar(o.k ?? 1.6);
  const m = new THREE.Mesh(new THREE.PlaneGeometry((hM * W) / H, hM), mat);
  m.renderOrder = 2;
  return m;
}

// ---- live boards --------------------------------------------------------------------------------

function frame(ctx: CanvasRenderingContext2D, W: number, H: number, title: string, jp: string) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#111014");
  g.addColorStop(1, "#08080a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // faint grid, like an LED matrix behind the glass
  ctx.strokeStyle = "rgba(244,183,40,.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.fillStyle = GOLD;
  ctx.font = `700 64px ${SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 16;
  ctx.fillText(title, 64, 108);
  ctx.shadowBlur = 0;
  ctx.font = `500 44px ${JP}`;
  ctx.fillStyle = "#ff4f8b";
  ctx.textAlign = "right";
  ctx.shadowColor = "#ff4f8b";
  ctx.shadowBlur = 14;
  ctx.fillText(jp, W - 64, 104);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(244,183,40,.5)";
  ctx.fillRect(64, 132, W - 128, 3);
}

function live(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  ctx.fillStyle = on ? "#3ee08f" : "#5a5a60";
  ctx.shadowColor = "#3ee08f";
  ctx.shadowBlur = on ? 14 : 0;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = `500 26px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillStyle = on ? "#9fe8c0" : "#777";
  ctx.fillText(on ? "LIVE" : "…", x + 18, y + 9);
}

/** The value pools board: one row per pool, its share of the supply as a bar, 24 h change. */
export function drawPools(s: Surface, p: Pools | null, height: number | null) {
  const { ctx, canvas } = s;
  const W = canvas.width,
    H = canvas.height;
  frame(ctx, W, H, "VALUE POOLS", "価値プール");
  live(ctx, W - 380, 96, !!p);
  if (!p) {
    ctx.fillStyle = "#888";
    ctx.font = `500 40px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillText("waiting for the chain…", 64, 260);
    s.tex.needsUpdate = true;
    return;
  }
  const total = POOLS.reduce((a, k) => a + p.pools[k], 0) || 1;
  const order = [...POOLS].sort((a, b) => p.pools[b] - p.pools[a]);
  const top = 170,
    rowH = 112;
  order.forEach((k, i) => {
    const y = top + i * rowH;
    const col = POOL_COLOR[k];
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.fillRect(64, y + 18, 14, 64);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
    ctx.fillStyle = "#f2efe8";
    ctx.font = `700 46px ${SANS}`;
    ctx.fillText(POOL_NAME[k], 100, y + 62);
    ctx.font = `400 26px ${JP}`;
    ctx.fillStyle = col;
    ctx.fillText(POOL_JP[k], 100, y + 96);
    // bar: share of all ZEC
    const share = p.pools[k] / total;
    const bx = 420,
      bw = W - bx - 640;
    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(bx, y + 34, bw, 34);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    ctx.fillRect(bx, y + 34, Math.max(4, bw * share), 34);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#cfcac0";
    ctx.font = `500 26px ${MONO}`;
    ctx.fillText(pct(share, share < 0.01 ? 2 : 1), bx, y + 100);
    // amount and change
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff6dc";
    ctx.font = `500 50px ${MONO}`;
    ctx.fillText(fmtZec(p.pools[k]), W - 180, y + 66);
    ctx.font = `500 24px ${MONO}`;
    ctx.fillStyle = "#a8a39a";
    ctx.fillText("ZEC", W - 120, y + 66);
    const ch = p.change_24h[k] ?? 0;
    ctx.font = `500 30px ${MONO}`;
    ctx.fillStyle = ch > 0 ? "#3ee08f" : ch < 0 ? "#ff5d6c" : "#8a8680";
    ctx.fillText(`${ch > 0 ? "▲" : ch < 0 ? "▼" : "■"} ${fmtSigned(ch)} 24h`, W - 64, y + 102);
  });
  // shielded share
  const y = top + 5 * rowH + 20;
  ctx.fillStyle = "rgba(244,183,40,.5)";
  ctx.fillRect(64, y, W - 128, 3);
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = `700 40px ${SANS}`;
  ctx.fillText("SHIELDED", 64, y + 72);
  ctx.font = `400 28px ${JP}`;
  ctx.fillStyle = "#ff4f8b";
  ctx.fillText("シールド", 64, y + 112);
  const bx = 300,
    bw = W - bx - 420;
  ctx.fillStyle = "rgba(255,255,255,.06)";
  ctx.fillRect(bx, y + 40, bw, 44);
  const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  grad.addColorStop(0, "#1baf7a");
  grad.addColorStop(0.5, "#3987e5");
  grad.addColorStop(1, "#eb6834");
  ctx.fillStyle = grad;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 14;
  ctx.fillRect(bx, y + 40, bw * p.shielded_ratio, 44);
  ctx.shadowBlur = 0;
  ctx.textAlign = "right";
  ctx.fillStyle = "#fff6dc";
  ctx.font = `700 80px ${MONO}`;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 20;
  ctx.fillText(pct(p.shielded_ratio), W - 64, y + 96);
  ctx.shadowBlur = 0;
  ctx.font = `400 24px ${MONO}`;
  ctx.fillStyle = "#8a857c";
  ctx.textAlign = "left";
  ctx.fillText(`${fmtZec(p.shielded)} ZEC private${height ? `  ·  block ${height.toLocaleString("en-US")}` : ""}`, bx, y + 122);
  s.tex.needsUpdate = true;
}

/** The supply board: issued vs the 21M cap, issuance, halving countdown, price. */
export function drawSupply(s: Surface, m: MarketState, height: number | null) {
  const { ctx, canvas } = s;
  const W = canvas.width,
    H = canvas.height;
  frame(ctx, W, H, "SUPPLY", "供給量");
  const sup = m.supply;
  live(ctx, W - 300, 96, !!sup);
  if (!sup) {
    s.tex.needsUpdate = true;
    return;
  }
  const issued = sup.supply / sup.max_supply;
  ctx.textAlign = "left";
  ctx.fillStyle = "#a8a39a";
  ctx.font = `500 30px ${MONO}`;
  ctx.fillText("CIRCULATING", 64, 210);
  ctx.fillStyle = "#fff6dc";
  ctx.font = `700 110px ${MONO}`;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 22;
  ctx.fillText(fmtZec(sup.supply), 64, 330);
  ctx.shadowBlur = 0;
  ctx.fillStyle = GOLD;
  ctx.font = `500 40px ${MONO}`;
  ctx.fillText("ZEC", 64 + ctx.measureText("").width + 0, 390);
  ctx.fillStyle = "#8a857c";
  ctx.font = `400 30px ${MONO}`;
  ctx.fillText(`of ${fmtZec(sup.max_supply)} max`, 170, 390);
  // the cap bar, with halving ticks
  const bx = 64,
    by = 430,
    bw = W - 128;
  ctx.fillStyle = "rgba(255,255,255,.07)";
  ctx.fillRect(bx, by, bw, 46);
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  g.addColorStop(0, "#a8771a");
  g.addColorStop(1, GOLD);
  ctx.fillStyle = g;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 18;
  ctx.fillRect(bx, by, bw * issued, 46);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0d0d0d";
  ctx.font = `700 28px ${MONO}`;
  ctx.fillText(pct(issued, 1) + " ISSUED", bx + 16, by + 33);
  const rows: [string, string][] = [
    ["Block", (height ?? sup.height).toLocaleString("en-US")],
    ["Issued 24h", `${fmtZec(sup.block_subsidy * (86400 / (sup.avg_block_time || 75)), 0)} ZEC`],
    ["Inflation", pct(sup.inflation_rate)],
    ["Next halving", `${sup.next_halving_eta.slice(0, 10)}  #${sup.next_halving_height.toLocaleString("en-US")}`],
    ["Lockbox", `${fmtZec(sup.lockbox)} ZEC`],
  ];
  if (m.price) rows.unshift(["ZEC / USD", `$${m.price.usd.toFixed(2)}  ${m.price.usd_24h_change >= 0 ? "▲" : "▼"}${Math.abs(m.price.usd_24h_change).toFixed(1)}%`]);
  rows.forEach(([k, v], i) => {
    const y = 560 + i * 66;
    ctx.textAlign = "left";
    ctx.fillStyle = "#a8a39a";
    ctx.font = `500 32px ${MONO}`;
    ctx.fillText(k.toUpperCase(), 64, y);
    ctx.textAlign = "right";
    ctx.fillStyle = k === "ZEC / USD" ? (m.price!.usd_24h_change >= 0 ? "#3ee08f" : "#ff5d6c") : "#f2efe8";
    ctx.font = `500 40px ${MONO}`;
    ctx.fillText(v, W - 64, y);
    ctx.fillStyle = "rgba(255,255,255,.07)";
    ctx.fillRect(64, y + 20, W - 128, 2);
  });
  s.tex.needsUpdate = true;
}

/** "INSERT VIEWING KEY" on a terminal; `blink` toggles the cursor, `scan` sweeps a line. */
export function drawTerminal(s: Surface, blink: boolean, scan: number, label: string) {
  const { ctx, canvas } = s;
  const W = canvas.width,
    H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1a14");
  g.addColorStop(1, "#050a08");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  // key glyph
  ctx.strokeStyle = GOLD;
  ctx.fillStyle = GOLD;
  ctx.lineWidth = 10;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(W / 2 - 60, 62, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(W / 2 - 36, 57, 104, 10);
  ctx.fillRect(W / 2 + 46, 57, 10, 28);
  ctx.fillRect(W / 2 + 64, 57, 10, 20);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 44px ${SANS}`;
  ctx.fillText("INSERT VIEWING KEY", W / 2, 150);
  ctx.shadowBlur = 0;
  ctx.font = `400 24px ${JP}`;
  ctx.fillStyle = "#ff6f9e";
  ctx.fillText("閲覧鍵を入力してください", W / 2, 190);
  // input field
  ctx.strokeStyle = "rgba(62,224,143,.7)";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 214, W - 80, 54);
  ctx.textAlign = "left";
  ctx.fillStyle = "#3ee08f";
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText(`> uview1${blink ? "█" : ""}`, 58, 251);
  ctx.fillStyle = "#7f9a8c";
  ctx.font = `400 18px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(label, W / 2, H - 34);
  // scan line
  ctx.fillStyle = "rgba(62,224,143,.10)";
  ctx.fillRect(0, scan * H, W, 18);
  s.tex.needsUpdate = true;
}

/** A ticker tape texture: one long line, scrolled by the texture offset. */
export function drawTicker(s: Surface, items: string[]) {
  const { ctx, canvas } = s;
  ctx.fillStyle = "#070608";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `500 ${canvas.height * 0.56}px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let x = 20;
  let i = 0;
  while (x < canvas.width) {
    const t = items[i++ % items.length];
    const [label, val, tone] = t.split("|");
    ctx.fillStyle = "#a8a39a";
    ctx.fillText(label, x, canvas.height / 2 + 2);
    x += ctx.measureText(label + " ").width;
    ctx.fillStyle = tone === "up" ? "#3ee08f" : tone === "down" ? "#ff5d6c" : GOLD;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fillText(val, x, canvas.height / 2 + 2);
    ctx.shadowBlur = 0;
    x += ctx.measureText(val).width + 30;
    ctx.fillStyle = "#ff4f8b";
    ctx.fillText("◆", x, canvas.height / 2 + 2);
    x += 60;
  }
  s.tex.needsUpdate = true;
}

/** A pool vault's sign: name, kanji, amount, share, 24 h change. */
export function drawVaultSign(s: Surface, k: PoolKey, p: Pools | null, supply: number | null) {
  const { ctx, canvas } = s;
  const W = canvas.width,
    H = canvas.height;
  const col = POOL_COLOR[k];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(8,8,10,.92)";
  ctx.beginPath();
  ctx.roundRect(8, 8, W - 16, H - 16, 28);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 8;
  ctx.shadowColor = col;
  ctx.shadowBlur = 26;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = col;
  ctx.font = `700 92px ${SANS}`;
  ctx.fillText(POOL_NAME[k].toUpperCase(), 56, 128);
  ctx.textAlign = "right";
  ctx.font = `500 70px ${JP}`;
  ctx.fillStyle = "#ff4f8b";
  ctx.shadowColor = "#ff4f8b";
  ctx.fillText(POOL_JP[k], W - 56, 124);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  if (p) {
    ctx.fillStyle = "#fff6dc";
    ctx.font = `700 104px ${MONO}`;
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    ctx.fillText(fmtZec(p.pools[k]), 56, 270);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#a8a39a";
    ctx.font = `500 44px ${MONO}`;
    ctx.fillText("ZEC", 60 + ctx.measureText("").width, 330);
    const share = supply ? p.pools[k] / supply : 0;
    ctx.fillText(`${pct(share, share < 0.01 ? 2 : 1)} of supply`, 200, 330);
    const ch = p.change_24h[k] ?? 0;
    ctx.textAlign = "right";
    ctx.fillStyle = ch > 0 ? "#3ee08f" : ch < 0 ? "#ff5d6c" : "#8a8680";
    ctx.font = `500 44px ${MONO}`;
    ctx.fillText(`${ch > 0 ? "▲" : ch < 0 ? "▼" : "■"} ${fmtSigned(ch)} · 24h`, W - 56, 330);
  } else {
    ctx.fillStyle = "#777";
    ctx.font = `500 50px ${MONO}`;
    ctx.fillText("counting…", 56, 260);
  }
  s.tex.needsUpdate = true;
}

/** A soft vertical gradient for light beams (alpha only). */
export function beamTexture(color: string) {
  const s = surface(8, 128);
  const g = s.ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.6, color + "33");
  g.addColorStop(1, color + "aa");
  s.ctx.fillStyle = g;
  s.ctx.fillRect(0, 0, 8, 128);
  s.tex.needsUpdate = true;
  return s.tex;
}

/** A ring of text wrapped around a cylinder (the hologram band). */
export function bandTexture(text: string, color: string) {
  const s = surface(2048, 96);
  const { ctx } = s;
  ctx.font = `500 54px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  let x = 0;
  while (x < 2048) {
    ctx.fillText(text, x, 50);
    x += ctx.measureText(text).width;
  }
  s.tex.wrapS = THREE.RepeatWrapping;
  s.tex.needsUpdate = true;
  return s.tex;
}

/** A static framed plaque of a few lines. */
export function plaque(lines: { t: string; font: string; color: string }[], w = 900, h = 500) {
  const s = surface(w, h);
  const { ctx } = s;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#1a1712");
  g.addColorStop(1, "#0b0a08");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = (h - 120) / lines.length;
  lines.forEach((l, i) => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.shadowColor = l.color;
    ctx.shadowBlur = 8;
    ctx.fillText(l.t, w / 2, 60 + step * (i + 0.5));
  });
  s.tex.needsUpdate = true;
  return s;
}
