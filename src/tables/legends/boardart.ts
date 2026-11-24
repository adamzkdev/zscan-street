/**
 * ZK LEGENDS' board, painted: the textures the 3D duel wears, drawn from code the way paint.ts paints
 * the cards (bevels lit from the top left, inner shadows, brushed metal and lacquer grain, pixel-step
 * filigree, faceted gems with big outlined numbers). Every painter bakes once into a cached canvas
 * texture: the minions' frames (per pool and rarity, a legendary's with crown and wings), the heroes'
 * frames, the gems (attack, health, armor, durability, cost) with their numbers, the hero power's
 * medallion (and its spent back), the weapon's, the END TURN plaque in its states, Guard's stone
 * shield, Timelock's ice, Shielded's smoke, the deck's card edges, the soft sprites for particles,
 * smoke puffs and the turn's light sweep, and a grain tile for the arenas' voxels.
 */
import * as THREE from "three";
import type { Faction } from "./engine";
import { iconCanvas } from "./art";

type G = CanvasRenderingContext2D;

// ---- palettes (the cards' own) ----------------------------------------------------------------------------

export interface Trim {
  m0: string;
  m1: string;
  m2: string;
  m3: string;
}
interface Pal extends Trim {
  deep: string;
  mid: string;
  light: string;
}
const PAL: Record<Faction, Pal> = {
  transparent: { deep: "#3a1206", mid: "#8a3410", light: "#e2662a", m0: "#4a2410", m1: "#a8602e", m2: "#e8a070", m3: "#fff0dc" },
  sapling: { deep: "#0b2a18", mid: "#1f6a3e", light: "#5fc489", m0: "#2a3a1a", m1: "#7a8a3a", m2: "#cfd68a", m3: "#f8ffe0" },
  sprout: { deep: "#1c0f2a", mid: "#4a2a6c", light: "#a27ad0", m0: "#2e2a34", m1: "#7a7484", m2: "#c8c2d2", m3: "#f4f0ff" },
  orchard: { deep: "#0a0d1c", mid: "#1c2244", light: "#4a5a9a", m0: "#5a3d08", m1: "#b07e16", m2: "#f2c64a", m3: "#fff4c8" },
  neutral: { deep: "#141412", mid: "#3a3934", light: "#8c8a82", m0: "#2c2b28", m1: "#7a7770", m2: "#cfcbc0", m3: "#ffffff" },
};
export const GOLD: Trim = { m0: "#5a3a06", m1: "#b5800f", m2: "#f6cc55", m3: "#fff6cf" };
const STEEL: Trim = { m0: "#22252a", m1: "#6c727a", m2: "#c9ced4", m3: "#ffffff" };
const IRON: Trim = { m0: "#1a1816", m1: "#4a4642", m2: "#8a847c", m3: "#d8d2c8" };

// ---- helpers ------------------------------------------------------------------------------------------------

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
function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(c: string, a: number) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}
export function mixc(a: string, b: string, t: number) {
  const x = hex(a),
    y = hex(b);
  const m = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}
export function cnv(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

let brushedT: HTMLCanvasElement | null = null;
/** Brushed metal grain. */
export function brushedTile() {
  if (brushedT) return brushedT;
  const c = (brushedT = cnv(256, 256));
  const g = c.getContext("2d")!;
  const r = rng(3);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const y = r() * 256,
      x = r() * 256,
      l = 20 + r() * 120;
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.04 + r() * 0.08})` : `rgba(0,0,0,${0.04 + r() * 0.1})`;
    g.fillRect(x, y, l, 1);
    g.fillRect(x - 256, y, l, 1);
  }
  return c;
}
let grainT: HTMLCanvasElement | null = null;
/** Lacquer grain: fine noise, soft blotches. */
export function grainTile() {
  if (grainT) return grainT;
  const c = (grainT = cnv(192, 192));
  const g = c.getContext("2d")!;
  const im = g.createImageData(192, 192);
  const r = rng(17);
  for (let i = 0; i < 192 * 192; i++) {
    const v = 128 + (r() - 0.5) * 46;
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  for (let i = 0; i < 40; i++) {
    const x = r() * 192,
      y = r() * 192,
      s = 8 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    const d = r() < 0.5;
    gr.addColorStop(0, d ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  return c;
}
export function texture(g: G, tile: HTMLCanvasElement, a: number, x: number, y: number, w: number, h: number, mode: GlobalCompositeOperation = "overlay") {
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha = a;
  g.fillStyle = g.createPattern(tile, "repeat")!;
  g.fillRect(x, y, w, h);
  g.restore();
}
/** A bevel inside `path`: light from the top left, shade to the bottom right. */
export function bevel(g: G, path: Path2D, w: number, x0: number, y0: number, x1: number, y1: number, light = 0.55, dark = 0.6) {
  g.save();
  g.clip(path);
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, `rgba(255,255,255,${light})`);
  gr.addColorStop(0.45, "rgba(255,255,255,0.05)");
  gr.addColorStop(0.55, "rgba(0,0,0,0.05)");
  gr.addColorStop(1, `rgba(0,0,0,${dark})`);
  g.strokeStyle = gr;
  g.lineWidth = w * 2;
  g.stroke(path);
  g.restore();
}
/** An inner shadow along the inside of `path`. */
export function innerShadow(g: G, path: Path2D, blur: number, a: number, dx = 0, dy = 3) {
  g.save();
  g.clip(path);
  g.shadowColor = `rgba(0,0,0,${a})`;
  g.shadowBlur = blur;
  g.shadowOffsetX = dx;
  g.shadowOffsetY = dy;
  g.lineWidth = blur * 2;
  g.strokeStyle = "#000";
  g.stroke(path);
  g.restore();
}
/** Metal: a vertical gradient through four tones, brushed grain, bevel, a dark edge. */
export function metalFill(g: G, path: Path2D, m: Trim, x0: number, y0: number, x1: number, y1: number, bw = 4) {
  g.save();
  const gr = g.createLinearGradient(x0, y0, x0 + (x1 - x0) * 0.25, y1);
  gr.addColorStop(0, m.m2);
  gr.addColorStop(0.18, m.m3);
  gr.addColorStop(0.38, m.m2);
  gr.addColorStop(0.62, m.m1);
  gr.addColorStop(0.86, m.m0);
  gr.addColorStop(1, m.m1);
  g.fillStyle = gr;
  g.fill(path);
  g.clip(path);
  texture(g, brushedTile(), 0.55, x0, y0, x1 - x0, y1 - y0);
  g.restore();
  bevel(g, path, bw, x0, y0, x1, y1, 0.6, 0.55);
  g.save();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(m.m0, 0.95);
  g.stroke(path);
  g.restore();
}
/** Lacquer: a deep gradient with grain and a soft top light. */
export function lacquer(g: G, path: Path2D, p: { deep: string; mid: string; light: string }, x0: number, y0: number, x1: number, y1: number) {
  g.save();
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, p.light);
  gr.addColorStop(0.35, p.mid);
  gr.addColorStop(1, p.deep);
  g.fillStyle = gr;
  g.fill(path);
  g.clip(path);
  texture(g, grainTile(), 0.45, x0, y0, x1 - x0, y1 - y0);
  const sh = g.createRadialGradient(x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.15, 0, x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.15, (x1 - x0) * 0.8);
  sh.addColorStop(0, "rgba(255,255,255,0.18)");
  sh.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sh;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.restore();
}
export function stepRect(x: number, y: number, w: number, h: number, s: number) {
  const p = new Path2D();
  const pts: [number, number][] = [
    [x + 2 * s, y],
    [x + w - 2 * s, y],
    [x + w - 2 * s, y + s],
    [x + w - s, y + s],
    [x + w - s, y + 2 * s],
    [x + w, y + 2 * s],
    [x + w, y + h - 2 * s],
    [x + w - s, y + h - 2 * s],
    [x + w - s, y + h - s],
    [x + w - 2 * s, y + h - s],
    [x + w - 2 * s, y + h],
    [x + 2 * s, y + h],
    [x + 2 * s, y + h - s],
    [x + s, y + h - s],
    [x + s, y + h - 2 * s],
    [x, y + h - 2 * s],
    [x, y + 2 * s],
    [x + s, y + 2 * s],
    [x + s, y + s],
    [x + 2 * s, y + s],
  ];
  pts.forEach(([a, b], i) => (i ? p.lineTo(a, b) : p.moveTo(a, b)));
  p.closePath();
  return p;
}
export function poly(pts: [number, number][]) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
export function ngon(cx: number, cy: number, r: number, n: number, rot: number, sx = 1, sy = 1): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r * sy] as [number, number];
  });
}
/** A faceted gem: triangles from the centre, each shaded by how it faces the light; a flat table. */
export function facets(g: G, pts: [number, number][], cx: number, cy: number, tones: [string, string, string], table = 0.5) {
  const [dk, md, lt] = tones;
  const L = [-0.62, -0.78];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2 - cx,
      my = (a[1] + b[1]) / 2 - cy;
    const len = Math.hypot(mx, my) || 1;
    const k = (mx / len) * L[0] + (my / len) * L[1];
    const t = (k + 1) / 2;
    g.fillStyle = t > 0.5 ? mixc(md, lt, (t - 0.5) * 2) : mixc(dk, md, t * 2);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.closePath();
    g.fill();
  }
  const tp = pts.map(([x, y]) => [cx + (x - cx) * table, cy + (y - cy) * table] as [number, number]);
  const tg = g.createLinearGradient(cx - 30, cy - 30, cx + 30, cy + 30);
  tg.addColorStop(0, lt);
  tg.addColorStop(1, md);
  g.fillStyle = tg;
  g.fill(poly(tp));
  g.save();
  g.strokeStyle = rgba("#ffffff", 0.22);
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.moveTo(tp[i][0], tp[i][1]);
    g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
  g.restore();
  g.save();
  g.lineWidth = 3;
  g.strokeStyle = dk;
  g.stroke(poly(pts));
  g.restore();
}
export function stud(g: G, x: number, y: number, r: number, m: Trim) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
  gr.addColorStop(0, m.m3);
  gr.addColorStop(0.5, m.m2);
  gr.addColorStop(1, m.m0);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rgba("#000000", 0.45);
  g.lineWidth = 1;
  g.stroke();
}
/** A number as on the cards: heavy, white, outlined, a drop of shadow. */
export function bigNumber(g: G, s: string, x: number, y: number, size: number, color = "#ffffff") {
  g.save();
  g.font = `700 ${size}px Geist, Roboto, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = size * 0.08;
  g.shadowOffsetY = size * 0.05;
  g.lineWidth = size * 0.2;
  g.strokeStyle = "#0b0805";
  g.strokeText(s, x, y + size * 0.04);
  g.shadowColor = "transparent";
  g.lineWidth = size * 0.05;
  g.strokeStyle = color;
  g.strokeText(s, x, y + size * 0.04);
  g.fillStyle = color;
  g.fillText(s, x, y + size * 0.04);
  g.restore();
}
/** Pixel-step scroll filigree (a little leaf of steps), mirrored. */
function scroll(g: G, x: number, y: number, s: number, dir: 1 | -1, m: Trim) {
  const steps: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, -1],
    [3, -1],
    [4, -2],
    [4, -3],
    [3, -4],
    [2, -4],
    [2, -3],
  ];
  g.save();
  for (const [a, b] of steps) {
    g.fillStyle = m.m0;
    g.fillRect(x + a * s * dir - (dir < 0 ? s : 0) + 1, y + b * s + 1, s, s);
    g.fillStyle = m.m2;
    g.fillRect(x + a * s * dir - (dir < 0 ? s : 0), y + b * s, s, s);
  }
  g.restore();
}

const tex = (c: HTMLCanvasElement, srgb = true, aniso = 8) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
};
const cache = new Map<string, THREE.CanvasTexture>();
const memo = (k: string, f: () => THREE.CanvasTexture) => {
  let t = cache.get(k);
  if (!t) cache.set(k, (t = f()));
  return t;
};

// ---- the minion's frame ---------------------------------------------------------------------------------------

/** World size the frame texture covers (the token is 1.56 × 1.98 in the middle; the rest: room for wings). */
export const FRAME_SIZE = { w: 2.3, d: 2.5, tw: 1.56, td: 1.98 };

/**
 * A minion's frame, painted: metal band in the pool's trim (gold for a legendary), stepped corners,
 * studs, filigree, the window cut out (transparent) with an inner shadow falling on the portrait.
 * A legendary gets a crown above and wings at the sides.
 */
export function minionFrame(f: Faction, rarity: string): THREE.CanvasTexture {
  return memo(`mf|${f}|${rarity}`, () => {
    const PX = 200; // px per world unit
    const W = Math.round(FRAME_SIZE.w * PX),
      H = Math.round(FRAME_SIZE.d * PX);
    const c = cnv(W, H);
    const g = c.getContext("2d")!;
    const legend = rarity === "legendary";
    const p = PAL[f];
    const trim = legend ? GOLD : rarity === "epic" ? mixTrim(p, GOLD, 0.35) : p;
    const tw = FRAME_SIZE.tw * PX,
      th = FRAME_SIZE.td * PX;
    const x0 = (W - tw) / 2,
      y0 = (H - th) / 2;
    if (legend) wings(g, x0, y0, tw, th);
    const outer = stepRect(x0, y0, tw, th, 22);
    // a soft shadow under the frame on the token's own base
    g.save();
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 14;
    g.shadowOffsetY = 6;
    g.fillStyle = trim.m0;
    g.fill(outer);
    g.restore();
    metalFill(g, outer, trim, x0, y0, x0 + tw, y0 + th, 6);
    // the inner lacquer band (the pool's colour) and its gold lip
    const bw = 22;
    const band = stepRect(x0 + bw, y0 + bw, tw - bw * 2, th - bw * 2, 16);
    lacquer(g, band, p, x0, y0, x0 + tw, y0 + th);
    bevel(g, band, 3, x0, y0, x0 + tw, y0 + th, 0.35, 0.6);
    // filigree in the band: steps in the trim's light tone
    g.save();
    g.clip(band);
    for (let i = 0; i < 4; i++) {
      const yy = y0 + bw + 10 + i * ((th - bw * 2 - 30) / 3);
      scroll(g, x0 + bw + 4, yy, 3, 1, trim);
      scroll(g, x0 + tw - bw - 4, yy, 3, -1, trim);
    }
    g.restore();
    // the window: cut out, then the shadow its rim casts on the picture
    const win = stepRect(x0 + bw + 12, y0 + bw + 12, tw - (bw + 12) * 2, th - (bw + 12) * 2, 12);
    g.save();
    g.globalCompositeOperation = "destination-out";
    g.fill(win);
    g.restore();
    const lip = stepRect(x0 + bw + 8, y0 + bw + 8, tw - (bw + 8) * 2, th - (bw + 8) * 2, 13);
    const ringP = new Path2D();
    ringP.addPath(lip);
    g.save();
    g.lineWidth = 6;
    g.strokeStyle = mixc(trim.m1, "#000000", 0.35);
    g.stroke(win);
    g.lineWidth = 2;
    g.strokeStyle = rgba(trim.m3, 0.7);
    g.stroke(lip);
    g.restore();
    // inner shadow (on the picture: drawn semi-transparent in the window)
    g.save();
    g.clip(win);
    g.shadowColor = "rgba(0,0,0,0.85)";
    g.shadowBlur = 22;
    g.shadowOffsetY = 8;
    g.lineWidth = 30;
    g.strokeStyle = "rgba(0,0,0,0.9)";
    g.stroke(win);
    g.shadowColor = "transparent";
    // a glint of glass across the top-left of the window
    const gl = g.createLinearGradient(x0, y0, x0 + tw * 0.6, y0 + th * 0.4);
    gl.addColorStop(0, "rgba(255,255,255,0.16)");
    gl.addColorStop(0.4, "rgba(255,255,255,0.04)");
    gl.addColorStop(0.42, "rgba(255,255,255,0)");
    g.fillStyle = gl;
    g.fillRect(x0, y0, tw, th);
    g.restore();
    // studs at the corners, a rarity gem on the top edge
    for (const [sx, sy] of [
      [x0 + 18, y0 + 18],
      [x0 + tw - 18, y0 + 18],
      [x0 + 18, y0 + th - 18],
      [x0 + tw - 18, y0 + th - 18],
    ])
      stud(g, sx, sy, 7, trim);
    const RG: Record<string, [string, string, string]> = { rare: ["#0b3a8a", "#3d8cff", "#cfe6ff"], epic: ["#3a0b6e", "#a04dff", "#ecd6ff"], legendary: ["#7a2a00", "#ff8a1e", "#ffe6b0"], common: ["#4a4a4a", "#c8c8c8", "#ffffff"] };
    const rg = RG[rarity];
    if (rg) {
      const cx = W / 2,
        cy = y0 + 11;
      metalFill(g, poly(ngon(cx, cy, 15, 4, -Math.PI / 2)), trim, cx - 15, cy - 15, cx + 15, cy + 15, 2);
      facets(g, ngon(cx, cy, 11, 4, -Math.PI / 2), cx, cy, rg, 0.45);
    }
    if (legend) crown(g, W / 2, y0 - 2);
    return tex(c);
  });
}
function mixTrim(a: Trim, b: Trim, t: number): Trim {
  return { m0: mixc(a.m0, b.m0, t), m1: mixc(a.m1, b.m1, t), m2: mixc(a.m2, b.m2, t), m3: mixc(a.m3, b.m3, t) };
}
function wings(g: G, x0: number, y0: number, tw: number, th: number) {
  for (const dir of [-1, 1] as const) {
    const bx = dir < 0 ? x0 + 10 : x0 + tw - 10;
    for (let i = 0; i < 5; i++) {
      const y = y0 + 40 + i * 26;
      const len = 62 - i * 9;
      const pts: [number, number][] = [
        [bx, y],
        [bx + dir * len, y - 18 + i * 3],
        [bx + dir * (len - 10), y + 10],
        [bx, y + 22],
      ];
      const p = poly(pts);
      g.save();
      g.shadowColor = "rgba(0,0,0,0.6)";
      g.shadowBlur = 8;
      g.shadowOffsetY = 3;
      g.fillStyle = GOLD.m0;
      g.fill(p);
      g.restore();
      metalFill(g, p, GOLD, bx - 70, y - 20, bx + 70, y + 24, 2);
    }
  }
}
function crown(g: G, cx: number, y: number) {
  const pts: [number, number][] = [
    [cx - 58, y + 18],
    [cx - 58, y - 8],
    [cx - 36, y + 4],
    [cx - 18, y - 26],
    [cx, y - 4],
    [cx + 18, y - 26],
    [cx + 36, y + 4],
    [cx + 58, y - 8],
    [cx + 58, y + 18],
  ];
  const p = poly(pts);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.fillStyle = GOLD.m0;
  g.fill(p);
  g.restore();
  metalFill(g, p, GOLD, cx - 60, y - 28, cx + 60, y + 20, 3);
  facets(g, ngon(cx, y + 6, 9, 4, -Math.PI / 2), cx, y + 6, ["#7a2a00", "#ff8a1e", "#ffe6b0"], 0.45);
}

// ---- the hero's frame ---------------------------------------------------------------------------------------

/** World size of the hero's frame texture (the portrait window in the middle is 1.86 × 2.2). */
export const HERO_FRAME = { w: 3.3, d: 3.5 };
export function heroFrame(f: Faction): THREE.CanvasTexture {
  return memo(`hf|${f}`, () => {
    const PX = 180;
    const W = Math.round(HERO_FRAME.w * PX),
      H = Math.round(HERO_FRAME.d * PX);
    const c = cnv(W, H);
    const g = c.getContext("2d")!;
    const p = PAL[f];
    const ow = 2.62 * PX,
      oh = 2.98 * PX;
    const x0 = (W - ow) / 2,
      y0 = (H - oh) / 2 + 18;
    // the crest behind the top: a fan of gold steps with the Z seal
    const crest = poly([
      [W / 2 - 150, y0 + 30],
      [W / 2 - 120, y0 - 30],
      [W / 2 - 60, y0 - 58],
      [W / 2, y0 - 72],
      [W / 2 + 60, y0 - 58],
      [W / 2 + 120, y0 - 30],
      [W / 2 + 150, y0 + 30],
    ]);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 14;
    g.fillStyle = GOLD.m0;
    g.fill(crest);
    g.restore();
    metalFill(g, crest, GOLD, W / 2 - 150, y0 - 72, W / 2 + 150, y0 + 30, 4);
    const outer = stepRect(x0, y0, ow, oh, 30);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 20;
    g.shadowOffsetY = 8;
    g.fillStyle = GOLD.m0;
    g.fill(outer);
    g.restore();
    metalFill(g, outer, GOLD, x0, y0, x0 + ow, y0 + oh, 8);
    const bw = 30;
    const band = stepRect(x0 + bw, y0 + bw, ow - bw * 2, oh - bw * 2, 22);
    lacquer(g, band, p, x0, y0, x0 + ow, y0 + oh);
    bevel(g, band, 4, x0, y0, x0 + ow, y0 + oh, 0.35, 0.6);
    // filigree columns in the band
    g.save();
    g.clip(band);
    for (let i = 0; i < 6; i++) {
      const yy = y0 + bw + 26 + i * ((oh - bw * 2 - 60) / 5);
      scroll(g, x0 + bw + 6, yy, 4, 1, GOLD);
      scroll(g, x0 + ow - bw - 6, yy, 4, -1, GOLD);
    }
    g.restore();
    const ww = 1.86 * PX,
      wh = 2.2 * PX;
    const win = stepRect((W - ww) / 2, y0 + (oh - wh) / 2, ww, wh, 16);
    g.save();
    g.globalCompositeOperation = "destination-out";
    g.fill(win);
    g.restore();
    g.save();
    g.lineWidth = 8;
    g.strokeStyle = GOLD.m0;
    g.stroke(win);
    g.lineWidth = 3;
    g.strokeStyle = rgba(GOLD.m3, 0.8);
    g.stroke(stepRect((W - ww) / 2 - 6, y0 + (oh - wh) / 2 - 6, ww + 12, wh + 12, 18));
    g.restore();
    g.save();
    g.clip(win);
    g.shadowColor = "rgba(0,0,0,0.85)";
    g.shadowBlur = 26;
    g.shadowOffsetY = 10;
    g.lineWidth = 36;
    g.strokeStyle = "rgba(0,0,0,0.9)";
    g.stroke(win);
    g.shadowColor = "transparent";
    const gl = g.createLinearGradient(0, 0, W * 0.6, H * 0.4);
    gl.addColorStop(0, "rgba(255,255,255,0.15)");
    gl.addColorStop(0.45, "rgba(255,255,255,0.03)");
    gl.addColorStop(0.47, "rgba(255,255,255,0)");
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
    g.restore();
    for (const [sx, sy] of [
      [x0 + 26, y0 + 26],
      [x0 + ow - 26, y0 + 26],
      [x0 + 26, y0 + oh - 26],
      [x0 + ow - 26, y0 + oh - 26],
    ])
      stud(g, sx, sy, 10, GOLD);
    // the Z seal at the top of the crest
    const cx = W / 2,
      cy = y0 - 22;
    const rim = new Path2D();
    rim.arc(cx, cy, 34, 0, Math.PI * 2);
    metalFill(g, rim, GOLD, cx - 34, cy - 34, cx + 34, cy + 34, 3);
    facets(g, ngon(cx, cy, 28, 12, -Math.PI / 2 + Math.PI / 12), cx, cy, ["#7a4f06", "#e0a92a", "#fff0b0"], 0.62);
    zMark(g, cx, cy, 4.2, "rgba(90,58,6,0.85)");
    return tex(c);
  });
}
export function zMark(g: G, cx: number, cy: number, px: number, color: string) {
  const z = ["#######", "#######", "....###", "...###.", "..###..", ".###...", "#######", "#######"];
  g.fillStyle = color;
  z.forEach((row, yy) => [...row].forEach((ch, xx) => ch === "#" && g.fillRect(cx + (xx - 3.5) * px, cy + (yy - 4) * px, px + 0.4, px + 0.4)));
}

// ---- gems with numbers --------------------------------------------------------------------------------------

export type GemKind = "atk" | "hp" | "armor" | "dur" | "cost";
/** A painted gem with its number (cached by kind, value and colour), 192 px square. */
export function gemTex(kind: GemKind, n: number | string, color = "#ffffff"): THREE.CanvasTexture {
  return memo(`gem|${kind}|${n}|${color}`, () => {
    const S = 192;
    const c = cnv(S, S);
    const g = c.getContext("2d")!;
    const cx = S / 2,
      cy = S / 2;
    let pts: [number, number][];
    let tones: [string, string, string];
    let rim: Trim = GOLD;
    let ny = cy + 2;
    if (kind === "atk") {
      pts = [
        [cx, cy - 74],
        [cx + 60, cy - 38],
        [cx + 64, cy + 34],
        [cx, cy + 72],
        [cx - 64, cy + 34],
        [cx - 60, cy - 38],
      ];
      tones = ["#7a2604", "#f06a1e", "#ffd08a"];
    } else if (kind === "hp") {
      pts = [[cx, cy - 80]];
      for (let i = 0; i <= 12; i++) {
        const a = -Math.PI * 0.18 + (i / 12) * Math.PI * 1.36;
        pts.push([cx + Math.cos(a) * 62, cy + 14 + Math.sin(a) * 60]);
      }
      tones = ["#5a0610", "#d8222e", "#ff9aa0"];
      ny = cy + 14;
    } else if (kind === "armor" || kind === "dur") {
      pts = [
        [cx - 62, cy - 64],
        [cx + 62, cy - 64],
        [cx + 62, cy + 10],
        [cx, cy + 74],
        [cx - 62, cy + 10],
      ];
      tones = ["#2c3036", "#8a939e", "#e8eef4"];
      rim = STEEL;
      ny = cy - 2;
    } else {
      pts = ngon(cx, cy, 66, 12, -Math.PI / 2 + Math.PI / 12);
      tones = ["#7a4f06", "#e0a92a", "#fff0b0"];
    }
    const big = pts.map(([x, y]) => [cx + (x - cx) * 1.14, cy + (y - cy) * 1.14] as [number, number]);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.8)";
    g.shadowBlur = 12;
    g.shadowOffsetY = 6;
    g.fillStyle = "#000";
    g.fill(poly(big));
    g.restore();
    metalFill(g, poly(big), rim, cx - 80, cy - 84, cx + 80, cy + 84, 4);
    facets(g, pts, cx, kind === "hp" ? cy + 12 : cy, tones, 0.55);
    if (kind === "cost") zMark(g, cx, cy, 7, "rgba(122,79,6,0.35)");
    const s = String(n);
    bigNumber(g, s, cx, ny, s.length > 1 ? 82 : 98, color);
    return tex(c);
  });
}

// ---- the hero power and the weapon ----------------------------------------------------------------------------

const POWER_ICON: Record<string, string> = { transparent: "wave", sapling: "leaf", sprout: "door", orchard: "halo", neutral: "q" };
/** The hero power's face: a gold ring with notches round a lacquer disc in the pool's colour, the icon struck in. */
export function powerFace(f: Faction): THREE.CanvasTexture {
  return memo(`pw|${f}`, () => medallion(PAL[f], GOLD, POWER_ICON[f] ?? "q", "#1a1206", 8));
}
/** The spent power's back: dark iron with the Z. */
export function powerBack(): THREE.CanvasTexture {
  return memo("pw|back", () => {
    const c = cnv(256, 256);
    const g = c.getContext("2d")!;
    const rim = poly(ngon(128, 128, 124, 8, Math.PI / 8));
    metalFill(g, rim, IRON, 4, 4, 252, 252, 5);
    const disc = poly(ngon(128, 128, 98, 8, Math.PI / 8));
    lacquer(g, disc, { deep: "#0c0b0a", mid: "#24211e", light: "#3e3a34" }, 30, 30, 226, 226);
    innerShadow(g, disc, 12, 0.8);
    zMark(g, 128, 128, 9, "rgba(140,132,120,0.55)");
    return tex(c);
  });
}
/** The weapon's face: a steel ring, dark leather, the axe struck in. */
export function weaponFace(): THREE.CanvasTexture {
  return memo("wp", () => medallion({ deep: "#120e0a", mid: "#3a2c20", light: "#6a5038" }, STEEL, "axe", "#e8e0d0", 10));
}
function medallion(p: { deep: string; mid: string; light: string }, trim: Trim, icon: string, ink: string, notches: number): THREE.CanvasTexture {
  const c = cnv(256, 256);
  const g = c.getContext("2d")!;
  const rim = poly(ngon(128, 128, 124, 8, Math.PI / 8));
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 8;
  g.fillStyle = trim.m0;
  g.fill(rim);
  g.restore();
  metalFill(g, rim, trim, 4, 4, 252, 252, 6);
  // notches round the ring
  for (let i = 0; i < notches * 2; i++) {
    const a = (i / (notches * 2)) * Math.PI * 2;
    g.fillStyle = rgba(trim.m0, 0.8);
    g.fillRect(128 + Math.cos(a) * 110 - 3, 128 + Math.sin(a) * 110 - 3, 6, 6);
  }
  const disc = poly(ngon(128, 128, 96, 8, Math.PI / 8));
  lacquer(g, disc, p, 32, 32, 224, 224);
  innerShadow(g, disc, 14, 0.85, 0, 5);
  // the icon, struck: a dark shadow under, the colour on top
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 0.6;
  g.drawImage(iconCanvas(icon, "#000000"), 70, 74, 120, 120);
  g.globalAlpha = 1;
  g.drawImage(iconCanvas(icon, ink), 66, 68, 120, 120);
  // glaze
  const gl = g.createLinearGradient(40, 40, 160, 160);
  gl.addColorStop(0, "rgba(255,255,255,0.22)");
  gl.addColorStop(0.5, "rgba(255,255,255,0)");
  g.save();
  g.clip(disc);
  g.fillStyle = gl;
  g.fillRect(0, 0, 256, 256);
  g.restore();
  return tex(c);
}

// ---- the END TURN plaque ----------------------------------------------------------------------------------------

export function endPlaque(state: "ready" | "done" | "wait" | "over", label: string): THREE.CanvasTexture {
  return memo(`end|${state}|${label}`, () => {
    const W = 600,
      H = 260;
    const c = cnv(W, H);
    const g = c.getContext("2d")!;
    const trim = state === "wait" || state === "over" ? IRON : GOLD;
    const outer = stepRect(8, 8, W - 16, H - 16, 22);
    metalFill(g, outer, trim, 8, 8, W - 8, H - 8, 7);
    const inner = stepRect(34, 34, W - 68, H - 68, 14);
    const lac =
      state === "done"
        ? { deep: "#0b2a10", mid: "#2a8a34", light: "#8af08a" }
        : state === "ready"
          ? { deep: "#3a2604", mid: "#c08a14", light: "#ffe08a" }
          : { deep: "#121110", mid: "#2c2a26", light: "#4a4640" };
    lacquer(g, inner, lac, 34, 34, W - 34, H - 34);
    innerShadow(g, inner, 14, 0.75, 0, 5);
    for (const [x, y] of [
      [22, 22],
      [W - 22, 22],
      [22, H - 22],
      [W - 22, H - 22],
    ])
      stud(g, x, y, 8, trim);
    // the text, embossed: a dark cut under, a light edge over
    g.save();
    g.font = `800 ${label.length > 10 ? 64 : 80}px Archivo, Geist, Roboto, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const tw = g.measureText(label).width;
    if (tw > W - 120) g.font = `800 ${Math.floor(((label.length > 10 ? 64 : 80) * (W - 120)) / tw)}px Archivo, Geist, Roboto, sans-serif`;
    const ink = state === "ready" ? "#2a1a02" : state === "done" ? "#06210a" : "#bdb6a8";
    g.fillStyle = state === "wait" || state === "over" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.45)";
    g.fillText(label, W / 2 + 2, H / 2 + 5);
    g.fillStyle = ink;
    g.fillText(label, W / 2, H / 2 + 2);
    g.restore();
    return tex(c);
  });
}

// ---- Guard, Timelock, Shielded ----------------------------------------------------------------------------------

/** Guard: a stone shield with an iron rim and rivets, seen from above (240 × 280). */
export function guardTex(): THREE.CanvasTexture {
  return memo("guard", () => {
    const W = 280,
      H = 330;
    const c = cnv(W, H);
    const g = c.getContext("2d")!;
    const shape = (k: number) =>
      poly([
        [W / 2 - 130 * k, 14 + (1 - k) * 30],
        [W / 2 + 130 * k, 14 + (1 - k) * 30],
        [W / 2 + 130 * k, H * 0.55],
        [W / 2 + 60 * k, H * 0.82],
        [W / 2, H - 10 - (1 - k) * 30],
        [W / 2 - 60 * k, H * 0.82],
        [W / 2 - 130 * k, H * 0.55],
      ]);
    const outer = shape(1);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 12;
    g.shadowOffsetY = 6;
    g.fillStyle = "#222";
    g.fill(outer);
    g.restore();
    metalFill(g, outer, IRON, 0, 0, W, H, 5);
    const stone = shape(0.88);
    g.save();
    g.clip(stone);
    const sg = g.createLinearGradient(0, 0, W, H);
    sg.addColorStop(0, "#b8b2a6");
    sg.addColorStop(0.5, "#8a847a");
    sg.addColorStop(1, "#5a554e");
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
    texture(g, grainTile(), 0.9, 0, 0, W, H);
    // blocks
    g.strokeStyle = "rgba(40,36,32,0.55)";
    g.lineWidth = 3;
    for (let y = 40; y < H; y += 44) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = ((y / 44) % 2) * 40 + 20; x < W; x += 80) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 44);
        g.stroke();
      }
    }
    g.restore();
    innerShadow(g, stone, 14, 0.7);
    for (const [x, y] of [
      [W / 2 - 108, 34],
      [W / 2 + 108, 34],
      [W / 2 - 108, H * 0.52],
      [W / 2 + 108, H * 0.52],
      [W / 2, H - 40],
    ])
      stud(g, x, y, 9, IRON);
    return tex(c);
  });
}
/** Timelock: ice, blue-white with cracks and bright edges (tiles on a block). */
export function iceTex(): THREE.CanvasTexture {
  return memo("ice", () => {
    const S = 256;
    const c = cnv(S, S);
    const g = c.getContext("2d")!;
    const r = rng(41);
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, "#f4fbff");
    gr.addColorStop(0.5, "#a8dcff");
    gr.addColorStop(1, "#5ab0f0");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    texture(g, grainTile(), 0.5, 0, 0, S, S);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.4 + r() * 0.5})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      let x = r() * S,
        y = r() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo((x += (r() - 0.5) * 80), (y += (r() - 0.5) * 80));
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 6;
    g.strokeRect(3, 3, S - 6, S - 6);
    return tex(c);
  });
}
/** Shielded: drifting violet smoke over the picture (tiles, scrolls). */
export function smokeTex(): THREE.CanvasTexture {
  return memo("smoke", () => {
    const S = 256;
    const c = cnv(S, S);
    const g = c.getContext("2d")!;
    const r = rng(77);
    g.fillStyle = "rgba(14,8,26,0.55)";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const x = r() * S,
        y = r() * S,
        s = 20 + r() * 60;
      for (const [ox, oy] of [
        [0, 0],
        [-S, 0],
        [S, 0],
        [0, -S],
        [0, S],
      ]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, s);
        gr.addColorStop(0, r() < 0.5 ? "rgba(120,80,200,0.22)" : "rgba(10,6,20,0.35)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(x + ox - s, y + oy - s, s * 2, s * 2);
      }
    }
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = "rgba(160,120,255,0.06)";
      g.fillRect(0, y, S, 1);
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// ---- the deck, the crystals, the light ----------------------------------------------------------------------

/** A stack of cards seen from the side: edges of card stock in thin layers. */
export function deckEdgeTex(): THREE.CanvasTexture {
  return memo("deckedge", () => {
    const c = cnv(64, 256);
    const g = c.getContext("2d")!;
    for (let y = 0; y < 256; y += 4) {
      g.fillStyle = (y / 4) % 2 ? "#e8dcc0" : "#cbbd9c";
      g.fillRect(0, y, 64, 3);
      g.fillStyle = "#3a2a10";
      g.fillRect(0, y + 3, 64, 1);
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}
/** A soft round dot for particles (white; tinted per particle). */
export function softDot(): THREE.CanvasTexture {
  return memo("dot", () => {
    const c = cnv(64, 64);
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.3, "rgba(255,255,255,0.75)");
    r.addColorStop(0.7, "rgba(255,255,255,0.15)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return tex(c, false, 1);
  });
}
/** A soft smoke puff (white, tinted per puff). */
export function puffTex(): THREE.CanvasTexture {
  return memo("puff", () => {
    const S = 128;
    const c = cnv(S, S);
    const g = c.getContext("2d")!;
    const r = rng(9);
    for (let i = 0; i < 14; i++) {
      const x = S / 2 + (r() - 0.5) * 50,
        y = S / 2 + (r() - 0.5) * 50,
        s = 18 + r() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, "rgba(255,255,255,0.35)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    return tex(c, false, 1);
  });
}
/** The turn's light: a soft bright bar (white; along x). */
export function sweepTex(): THREE.CanvasTexture {
  return memo("sweep", () => {
    const c = cnv(256, 32);
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.42, "rgba(255,255,255,0.15)");
    gr.addColorStop(0.5, "rgba(255,255,255,1)");
    gr.addColorStop(0.58, "rgba(255,255,255,0.15)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 32);
    return tex(c, false, 1);
  });
}
/** A pale grain tile for the arenas' voxels (multiplies their colours: worn, painted surfaces). */
export function voxelGrain(): THREE.CanvasTexture {
  return memo("voxgrain", () => {
    const S = 128;
    const c = cnv(S, S);
    const g = c.getContext("2d")!;
    const r = rng(5);
    const im = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 214 + (r() - 0.5) * 50;
      im.data[i * 4] = v;
      im.data[i * 4 + 1] = v;
      im.data[i * 4 + 2] = v;
      im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    // a lit top-left edge and a dark worn bottom-right: every face reads as a bevelled block
    const e = g.createLinearGradient(0, 0, S, S);
    e.addColorStop(0, "rgba(255,255,255,0.35)");
    e.addColorStop(0.2, "rgba(255,255,255,0)");
    e.addColorStop(0.8, "rgba(0,0,0,0)");
    e.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = e;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      const x = r() * S,
        y = r() * S;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30);
      g.stroke();
    }
    return tex(c);
  });
}
/** Brushed metal / wood for rims: a grain tile in a tone, repeated. */
export function rimTex(base: string, kind: "metal" | "wood" | "stone"): THREE.CanvasTexture {
  return memo(`rim|${base}|${kind}`, () => {
    const W = 512,
      H = 64;
    const c = cnv(W, H);
    const g = c.getContext("2d")!;
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    if (kind === "wood") {
      const r = rng(11);
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = r() < 0.5 ? "rgba(0,0,0,0.18)" : "rgba(255,230,190,0.08)";
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        const y = r() * H;
        g.moveTo(0, y);
        for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
        g.stroke();
      }
    } else texture(g, kind === "metal" ? brushedTile() : grainTile(), 0.8, 0, 0, W, H);
    const e = g.createLinearGradient(0, 0, 0, H);
    e.addColorStop(0, "rgba(255,255,255,0.35)");
    e.addColorStop(0.25, "rgba(255,255,255,0)");
    e.addColorStop(0.75, "rgba(0,0,0,0)");
    e.addColorStop(1, "rgba(0,0,0,0.4)");
    g.fillStyle = e;
    g.fillRect(0, 0, W, H);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// ---- the arenas' cloth: the drape hung round the table, the rug under it ----------------------------------

/**
 * The drape round the table (one tile, 4 × 1.5 world units, repeating along the side): folds of the
 * cloth, an embroidered gold band at the top with Z medallions, a scalloped hem with a gold fringe.
 */
export function clothTex(base: string, hem: string): THREE.CanvasTexture {
  return memo(`cloth|${base}|${hem}`, () => {
    const W = 1024,
      H = 384;
    const c = cnv(W, H);
    const g = c.getContext("2d")!;
    const r = rng(7);
    // the cloth and its folds
    g.fillStyle = base;
    g.fillRect(0, 0, W, H - 40);
    for (let x = 0; x < W; x += 2) {
      const k = Math.sin((x / W) * Math.PI * 12) * 0.5 + Math.sin((x / W) * Math.PI * 30 + 1) * 0.15;
      g.fillStyle = k > 0 ? `rgba(255,240,220,${k * 0.16})` : `rgba(0,0,0,${-k * 0.42})`;
      g.fillRect(x, 0, 2, H - 40);
    }
    texture(g, grainTile(), 0.35, 0, 0, W, H - 40);
    // shade toward the floor
    const sh = g.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0, "rgba(0,0,0,0)");
    sh.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
    // the embroidered band
    const tr: Trim = { m0: mixc(hem, "#000000", 0.6), m1: mixc(hem, "#000000", 0.25), m2: hem, m3: mixc(hem, "#ffffff", 0.65) };
    const band = new Path2D();
    band.rect(0, 18, W, 46);
    metalFill(g, band, tr, 0, 18, W, 64, 3);
    g.fillStyle = mixc(base, "#000000", 0.35);
    for (let x = 8; x < W; x += 32) {
      g.save();
      g.translate(x + 8, 41);
      g.rotate(Math.PI / 4);
      g.fillRect(-7, -7, 14, 14);
      g.restore();
    }
    // two Z medallions per tile
    for (const mx of [W * 0.25, W * 0.75]) {
      const disc = new Path2D();
      disc.arc(mx, 150, 54, 0, Math.PI * 2);
      g.save();
      g.shadowColor = "rgba(0,0,0,0.5)";
      g.shadowBlur = 12;
      g.shadowOffsetY = 5;
      g.fillStyle = tr.m0;
      g.fill(disc);
      g.restore();
      metalFill(g, disc, tr, mx - 54, 96, mx + 54, 204, 4);
      const inner = new Path2D();
      inner.arc(mx, 150, 40, 0, Math.PI * 2);
      g.fillStyle = mixc(base, "#000000", 0.25);
      g.fill(inner);
      zMark(g, mx, 150, 8, hem);
    }
    // the scalloped hem: cut the cloth's foot into arcs, a gold fringe hanging under each
    g.save();
    g.globalCompositeOperation = "destination-out";
    for (let x = 0; x < W; x += 64) {
      g.beginPath();
      g.ellipse(x + 32, H - 40, 34, 22, 0, 0, Math.PI);
      g.rect(x, H - 40, 64, 40);
      g.fill();
    }
    g.restore();
    for (let x = 0; x < W; x += 64) {
      g.strokeStyle = tr.m1;
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(x + 32, H - 42, 32, 20, 0, 0, Math.PI);
      g.stroke();
      // tassel
      const tx = x + 32;
      g.fillStyle = tr.m1;
      g.fillRect(tx - 5, H - 26, 10, 22);
      g.fillStyle = tr.m3;
      g.fillRect(tx - 5, H - 26, 4, 22);
      g.fillStyle = tr.m0;
      g.fillRect(tx - 7, H - 28, 14, 5);
    }
    void r;
    const t = tex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

/** The rug under the table: a field with a lattice of motifs, wide bands with a stepped border, a fringe. */
export function rugTex(dark: string, field: string, gold: string): THREE.CanvasTexture {
  return memo(`rug|${dark}|${field}|${gold}`, () => {
    const W = 1024,
      H = 768;
    const c = cnv(W, H);
    const g = c.getContext("2d")!;
    const r = rng(23);
    g.fillStyle = field;
    g.fillRect(0, 0, W, H);
    // the lattice: small diamonds, a dot of gold in each, a quiet weave
    g.strokeStyle = mixc(field, "#000000", 0.18);
    g.lineWidth = 2;
    for (let y = -24; y < H + 24; y += 24)
      for (let x = ((y / 24) % 2 ? 12 : 0) - 24; x < W + 24; x += 24) {
        g.beginPath();
        g.moveTo(x, y - 11);
        g.lineTo(x + 11, y);
        g.lineTo(x, y + 11);
        g.lineTo(x - 11, y);
        g.closePath();
        g.stroke();
        g.fillStyle = mixc(field, gold, 0.3);
        g.fillRect(x - 2, y - 2, 4, 4);
      }
    // the borders: dark band, gold stepped line, dark band with gold blocks
    const band = (inset: number, w: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(inset, inset, W - inset * 2, w);
      g.fillRect(inset, H - inset - w, W - inset * 2, w);
      g.fillRect(inset, inset, w, H - inset * 2);
      g.fillRect(W - inset - w, inset, w, H - inset * 2);
    };
    band(0, 70, dark);
    band(70, 10, gold);
    band(80, 26, mixc(dark, field, 0.4));
    band(106, 6, gold);
    for (let x = 20; x < W - 20; x += 40) {
      g.fillStyle = gold;
      g.fillRect(x, 26, 18, 18);
      g.fillRect(x, H - 44, 18, 18);
    }
    for (let y = 20; y < H - 20; y += 40) {
      g.fillStyle = gold;
      g.fillRect(26, y, 18, 18);
      g.fillRect(W - 44, y, 18, 18);
    }
    // wool: fibres and wear
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
      g.fillRect(r() * W, r() * H, 1 + r() * 3, 1);
    }
    texture(g, grainTile(), 0.4, 0, 0, W, H);
    return tex(c);
  });
}

/** A gold coin's face with the pixel Z struck in it. */
export function zCoinTex(): THREE.CanvasTexture {
  return memo("zcoin", () => {
    const S = 128;
    const c = cnv(S, S);
    const g = c.getContext("2d")!;
    const d = new Path2D();
    d.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    metalFill(g, d, GOLD, 0, 0, S, S, 5);
    const i = new Path2D();
    i.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2);
    g.fillStyle = "rgba(90,58,6,0.25)";
    g.fill(i);
    zMark(g, S / 2 + 1.5, S / 2 + 2, 9, "rgba(60,36,2,0.7)");
    zMark(g, S / 2, S / 2, 9, "#ffe48a");
    return tex(c);
  });
}
