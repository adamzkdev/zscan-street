/**
 * ZK LEGENDS' cards, painted on canvas at 512 × 716 like a printed collectible: a lacquered body in
 * the pool's colour with brushed-metal trim and pixel-step filigree, the art window (an arch for a
 * minion, a lens for a spell, a sealed lens for a secret, a shield for a weapon) holding the zkSNARK
 * itself crisp over a little scene of its pool, a curved name ribbon, the rarity gem, an engraved
 * rules plate, faceted gems (the gold Zcash coin for the cost, an orange blade for Attack, a red drop
 * for Health, a steel shield for Durability) with big outlined numbers, and for a legendary a gold
 * crown and wings. Everything is drawn from code (no image files): shading is done by hand (bevels
 * lit from the top left, inner shadows, brushed and lacquer grain patterns made once).
 *
 * `paintCard` returns a cached canvas per card and options (repainted, and `onChange` called, when the
 * zkSNARK's pixels or the fonts arrive). The canvas is shared: for the DOM use art.ts's `cardEl`,
 * which shows it as an image.
 */
import { T } from "../../i18n/lang";
import { card, type CardDef, type Faction } from "./engine";
import { snarkPixels } from "./pixels";
import { isSnarkCard, snarkInfo } from "./snarkcards";

export const CARD_W = 512;
export const CARD_H = 716;

type G = CanvasRenderingContext2D;
export interface PaintOpts {
  cost?: number;
  atk?: number;
  hp?: number;
  prover?: number;
}

// ---- palettes ----------------------------------------------------------------------------------------

interface Pal {
  /** Lacquer body: deep, mid, light. */
  deep: string;
  mid: string;
  light: string;
  /** Trim metal: dark, mid, light, shine. */
  m0: string;
  m1: string;
  m2: string;
  m3: string;
  /** The art scene: sky top, sky low, glow, particle. */
  sky0: string;
  sky1: string;
  glow: string;
  dust: string;
  ink: string;
}
const PAL: Record<Faction, Pal> = {
  transparent: { deep: "#3a1206", mid: "#8a3410", light: "#e2662a", m0: "#4a2410", m1: "#a8602e", m2: "#e8a070", m3: "#fff0dc", sky0: "#2a0a08", sky1: "#c2461a", glow: "#ffb35a", dust: "#ffcf7a", ink: "#ffd9c0" },
  sapling: { deep: "#0b2a18", mid: "#1f6a3e", light: "#5fc489", m0: "#2a3a1a", m1: "#7a8a3a", m2: "#cfd68a", m3: "#f8ffe0", sky0: "#06201a", sky1: "#2f8a64", glow: "#b8ffb0", dust: "#e2ff9a", ink: "#d8f4e0" },
  sprout: { deep: "#1c0f2a", mid: "#4a2a6c", light: "#a27ad0", m0: "#2e2a34", m1: "#7a7484", m2: "#c8c2d2", m3: "#f4f0ff", sky0: "#0d0814", sky1: "#4a2f6a", glow: "#c6a0ff", dust: "#9affc8", ink: "#e6dcf4" },
  orchard: { deep: "#0a0d1c", mid: "#1c2244", light: "#4a5a9a", m0: "#5a3d08", m1: "#b07e16", m2: "#f2c64a", m3: "#fff4c8", sky0: "#04060f", sky1: "#1a2a5a", glow: "#ffd76a", dust: "#fff1b0", ink: "#f4e8c8" },
  neutral: { deep: "#141412", mid: "#3a3934", light: "#8c8a82", m0: "#2c2b28", m1: "#7a7770", m2: "#cfcbc0", m3: "#ffffff", sky0: "#0b0d12", sky1: "#3a4458", glow: "#a8d8e8", dust: "#cfe8ff", ink: "#ecebe6" },
};
const GOLD = { m0: "#5a3a06", m1: "#b5800f", m2: "#f6cc55", m3: "#fff6cf" };
const RARITY_GEM: Record<string, [string, string, string] | null> = {
  basic: null,
  common: ["#5a5a5a", "#d8d8d8", "#ffffff"],
  rare: ["#0b3a8a", "#3d8cff", "#cfe6ff"],
  epic: ["#3a0b6e", "#a04dff", "#ecd6ff"],
  legendary: ["#7a2a00", "#ff8a1e", "#ffe6b0"],
};

// ---- small helpers -------------------------------------------------------------------------------------

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
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(c: string, a: number) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(a: string, b: string, t: number) {
  const x = hex(a),
    y = hex(b);
  const m = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

let brushed: HTMLCanvasElement | null = null;
/** Brushed metal grain: long faint horizontal streaks. */
function brushedTile() {
  if (brushed) return brushed;
  const c = (brushed = canvas(256, 256));
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
let grain: HTMLCanvasElement | null = null;
/** Lacquer grain: fine noise with soft blotches. */
function grainTile() {
  if (grain) return grain;
  const c = (grain = canvas(192, 192));
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

/** Overlay a tile over the current clip (overlay blend, alpha). */
function texture(g: G, tile: HTMLCanvasElement, a: number, x: number, y: number, w: number, h: number, mode: GlobalCompositeOperation = "overlay") {
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha = a;
  g.fillStyle = g.createPattern(tile, "repeat")!;
  g.fillRect(x, y, w, h);
  g.restore();
}

/** A bevel on the current path: light from the top left, shade to the bottom right, inside the path. */
function bevel(g: G, path: Path2D, w: number, light = 0.55, dark = 0.6, x0 = 0, y0 = 0, x1 = CARD_W, y1 = CARD_H) {
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
/** An inner shadow along the edge of `path`. */
function innerShadow(g: G, path: Path2D, blur: number, a: number, dx = 0, dy = 3) {
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
/** Metal fill: a vertical gradient through the four tones, with the brushed grain. */
function metal(g: G, path: Path2D, m: { m0: string; m1: string; m2: string; m3: string }, y0: number, y1: number, bevelW = 4) {
  g.save();
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, m.m2);
  gr.addColorStop(0.18, m.m3);
  gr.addColorStop(0.38, m.m2);
  gr.addColorStop(0.62, m.m1);
  gr.addColorStop(0.86, m.m0);
  gr.addColorStop(1, m.m1);
  g.fillStyle = gr;
  g.fill(path);
  g.clip(path);
  texture(g, brushedTile(), 0.55, 0, y0, CARD_W, y1 - y0);
  g.restore();
  bevel(g, path, bevelW, 0.6, 0.55);
  g.save();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(m.m0, 0.95);
  g.stroke(path);
  g.restore();
}

/** A rectangle with stepped (pixel) corners. */
function stepRect(x: number, y: number, w: number, h: number, s: number) {
  const p = new Path2D();
  p.moveTo(x + 2 * s, y);
  p.lineTo(x + w - 2 * s, y);
  p.lineTo(x + w - 2 * s, y + s);
  p.lineTo(x + w - s, y + s);
  p.lineTo(x + w - s, y + 2 * s);
  p.lineTo(x + w, y + 2 * s);
  p.lineTo(x + w, y + h - 2 * s);
  p.lineTo(x + w - s, y + h - 2 * s);
  p.lineTo(x + w - s, y + h - s);
  p.lineTo(x + w - 2 * s, y + h - s);
  p.lineTo(x + w - 2 * s, y + h);
  p.lineTo(x + 2 * s, y + h);
  p.lineTo(x + 2 * s, y + h - s);
  p.lineTo(x + s, y + h - s);
  p.lineTo(x + s, y + h - 2 * s);
  p.lineTo(x, y + h - 2 * s);
  p.lineTo(x, y + 2 * s);
  p.lineTo(x + s, y + 2 * s);
  p.lineTo(x + s, y + s);
  p.lineTo(x + 2 * s, y + s);
  p.closePath();
  return p;
}
function poly(pts: [number, number][]) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

// ---- the art window shapes ----------------------------------------------------------------------------

interface Win {
  path: Path2D;
  /** Bounds of the window. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The frame ring round it (a slightly bigger copy). */
  ring: Path2D;
}
function windowFor(d: CardDef): Win {
  const t = d.type;
  if (t === "spell" || t === "secret") {
    const cx = 256,
      cy = 236,
      r = 168;
    const p = new Path2D();
    p.arc(cx, cy, r, 0, Math.PI * 2);
    const ring = new Path2D();
    ring.arc(cx, cy, r + 22, 0, Math.PI * 2);
    return { path: p, x: cx - r, y: cy - r, w: r * 2, h: r * 2, ring };
  }
  if (t === "weapon") {
    const s = (k: number): [number, number][] => [
      [96 - k, 46 - k],
      [416 + k, 46 - k],
      [416 + k, 300 + k * 0.3],
      [256, 430 + k * 1.2],
      [96 - k, 300 + k * 0.3],
    ];
    return { path: poly(s(0)), x: 96, y: 46, w: 320, h: 384, ring: poly(s(20)) };
  }
  // minion: an arch (a tall oval)
  const cx = 256,
    cy = 232,
    rx = 166,
    ry = 196;
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const ring = new Path2D();
  ring.ellipse(cx, cy, rx + 21, ry + 21, 0, 0, Math.PI * 2);
  return { path: p, x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, ring };
}

// ---- the scene behind the zkSNARK ---------------------------------------------------------------------

function scene(g: G, d: CardDef, w: Win, pal: Pal) {
  const r = rng(hash(d.id));
  const { x, y, w: W, h: H } = w;
  // sky
  const sky = g.createLinearGradient(0, y, 0, y + H);
  sky.addColorStop(0, pal.sky0);
  sky.addColorStop(0.62, pal.sky1);
  sky.addColorStop(1, mix(pal.sky1, "#000000", 0.55));
  g.fillStyle = sky;
  g.fillRect(x, y, W, H);
  // the glow behind the figure
  const cx = x + W / 2,
    gy = y + H * 0.58;
  const glow = g.createRadialGradient(cx, gy, 4, cx, gy, W * 0.62);
  glow.addColorStop(0, rgba(pal.glow, 0.62));
  glow.addColorStop(0.35, rgba(pal.glow, 0.2));
  glow.addColorStop(1, rgba(pal.glow, 0));
  g.fillStyle = glow;
  g.fillRect(x, y, W, H);
  // light rays fanning from behind
  g.save();
  g.globalCompositeOperation = "screen";
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.28 + (r() - 0.5) * 0.12;
    const len = H * 1.1;
    const spread = 0.05 + r() * 0.05;
    g.beginPath();
    g.moveTo(cx, gy);
    g.lineTo(cx + Math.cos(a - spread) * len, gy + Math.sin(a - spread) * len);
    g.lineTo(cx + Math.cos(a + spread) * len, gy + Math.sin(a + spread) * len);
    g.closePath();
    const rg = g.createLinearGradient(cx, gy, cx + Math.cos(a) * len, gy + Math.sin(a) * len);
    rg.addColorStop(0, rgba(pal.glow, 0.22));
    rg.addColorStop(1, rgba(pal.glow, 0));
    g.fillStyle = rg;
    g.fill();
  }
  g.restore();
  // the pool's own skyline, in pixel steps, dark against the light
  const px = 8;
  const base = y + H * 0.86;
  g.fillStyle = mix(pal.deep, "#000000", 0.35);
  const f = d.faction;
  if (f === "transparent" || f === "neutral") {
    // blocks / rigs / towers with lit windows
    let xx = x - 10;
    while (xx < x + W + 10) {
      const bw = (2 + Math.floor(r() * 4)) * px,
        bh = (4 + Math.floor(r() * 12)) * px;
      g.fillStyle = mix(pal.deep, "#000000", 0.25 + r() * 0.2);
      g.fillRect(xx, base - bh, bw, bh + H);
      for (let wy = base - bh + px; wy < base - px; wy += px * 1.5)
        for (let wx = xx + 3; wx < xx + bw - 4; wx += px)
          if (r() < 0.35) {
            g.fillStyle = rgba(f === "transparent" ? "#ffb060" : "#bfe8ff", 0.5 + r() * 0.4);
            g.fillRect(wx, wy, 3, 3);
          }
      xx += bw + px * (r() < 0.3 ? 1 : 0);
    }
  } else if (f === "sapling") {
    // hills and pixel trees
    for (let k = 0; k < 2; k++) {
      g.fillStyle = mix(pal.deep, pal.mid, k * 0.35);
      const hy = base - H * (0.12 - k * 0.06);
      for (let xx = x; xx < x + W; xx += px) g.fillRect(xx, hy - Math.round((Math.sin((xx + k * 90) * 0.02) * 18) / px) * px, px, H);
    }
    for (let i = 0; i < 6; i++) {
      const tx = x + r() * W,
        th = (5 + Math.floor(r() * 5)) * px;
      g.fillStyle = mix(pal.deep, "#000000", 0.2);
      g.fillRect(tx, base - th, px, th);
      for (let k = 0; k < 4; k++) g.fillRect(tx - k * px, base - th - (3 - k) * px * 1.2, px * (1 + 2 * k), px * 1.2);
    }
  } else if (f === "sprout") {
    // tombstones and old pillars in the fog
    for (let i = 0; i < 7; i++) {
      const tx = x + (i / 7) * W + r() * 20,
        tw = (2 + Math.floor(r() * 2)) * px,
        th = (3 + Math.floor(r() * 5)) * px;
      g.fillStyle = mix(pal.deep, "#000000", 0.1 + r() * 0.2);
      g.fillRect(tx, base - th, tw, th + H);
      g.fillRect(tx + px / 2, base - th - px / 2, tw - px, px / 2);
    }
    for (let k = 0; k < 3; k++) {
      const fy = base - 10 + k * 18;
      const fog = g.createLinearGradient(0, fy - 30, 0, fy + 30);
      fog.addColorStop(0, rgba(pal.dust, 0));
      fog.addColorStop(0.5, rgba(pal.dust, 0.1));
      fog.addColorStop(1, rgba(pal.dust, 0));
      g.fillStyle = fog;
      g.fillRect(x, fy - 30, W, 60);
    }
  } else {
    // orchard: stars, an aurora and the shield's sigil
    for (let i = 0; i < 70; i++) {
      g.fillStyle = rgba(pal.dust, 0.3 + r() * 0.6);
      const s = r() < 0.15 ? 3 : 2;
      g.fillRect(x + r() * W, y + r() * H * 0.7, s, s);
    }
    g.save();
    g.globalCompositeOperation = "screen";
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const ay = y + H * (0.22 + k * 0.1);
      g.moveTo(x, ay);
      for (let xx = x; xx <= x + W; xx += 16) g.lineTo(xx, ay + Math.sin(xx * 0.02 + k) * 22);
      g.lineWidth = 14 - k * 3;
      g.strokeStyle = rgba(k === 1 ? "#7affd0" : pal.glow, 0.12);
      g.stroke();
    }
    g.restore();
    g.fillStyle = mix(pal.deep, "#000000", 0.2);
    for (let xx = x; xx < x + W; xx += px) g.fillRect(xx, base - Math.round(Math.abs(Math.sin(xx * 0.013)) * 3) * px, px, H);
  }
  // floating pixel motes
  for (let i = 0; i < 26; i++) {
    const s = r() < 0.2 ? 6 : 3;
    g.fillStyle = rgba(pal.dust, 0.25 + r() * 0.6);
    g.fillRect(Math.round(x + r() * W), Math.round(y + r() * H * 0.9), s, s);
  }
}

/** The zkSNARK, crisp, standing in the window: a soft shadow, a rim of light, the pixels. */
function figure(g: G, cells: Int32Array | null, d: CardDef, w: Win, pal: Pal) {
  const GRID = 26;
  const size = Math.min(w.w * 1.02, w.h * 0.98);
  const cell = Math.floor(size / GRID);
  const fw = cell * GRID;
  const fx = Math.round(w.x + (w.w - fw) / 2);
  const fy = Math.round(w.y + w.h - fw + (d.type === "minion" ? cell * 2.2 : d.type === "weapon" ? cell * 0 : cell * 1.4));
  // the shadow on the ground
  const sh = g.createRadialGradient(fx + fw / 2, fy + fw - cell * 1.2, 2, fx + fw / 2, fy + fw - cell * 1.2, fw * 0.42);
  sh.addColorStop(0, "rgba(0,0,0,0.55)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh;
  g.fillRect(fx - 20, fy + fw - cell * 6, fw + 40, cell * 10);
  if (!cells) {
    // the hood of a stand-in while the picture comes
    g.fillStyle = rgba(pal.mid, 0.9);
    g.fillRect(fx + cell * 8, fy + cell * 6, cell * 11, cell * 15);
    g.fillRect(fx + cell * 6, fy + cell * 20, cell * 15, cell * 6);
    g.fillStyle = rgba(pal.light, 0.5);
    g.fillRect(fx + cell * 11, fy + cell * 10, cell * 7, cell * 7);
    return;
  }
  // a rim: the silhouette one cell out, in the scene's light
  g.fillStyle = rgba(pal.glow, 0.55);
  for (let i = 0; i < GRID * GRID; i++) {
    if (cells[i] < 0) continue;
    const cx = i % GRID,
      cy = (i / GRID) | 0;
    const edge = (dx: number, dy: number) => {
      const nx = cx + dx,
        ny = cy + dy;
      return nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || cells[ny * GRID + nx] < 0;
    };
    if (edge(-1, 0)) g.fillRect(fx + (cx - 0.35) * cell, fy + cy * cell, cell * 0.4, cell);
    if (edge(1, 0)) g.fillRect(fx + (cx + 0.95) * cell, fy + cy * cell, cell * 0.4, cell);
    if (edge(0, -1)) g.fillRect(fx + cx * cell, fy + (cy - 0.35) * cell, cell, cell * 0.4);
  }
  for (let i = 0; i < GRID * GRID; i++) {
    const v = cells[i];
    if (v < 0) continue;
    g.fillStyle = `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`;
    g.fillRect(fx + (i % GRID) * cell, fy + ((i / GRID) | 0) * cell, cell, cell);
  }
  // the light falls from the top left: a soft sheen over the figure
  g.save();
  g.globalCompositeOperation = "soft-light";
  const sheen = g.createLinearGradient(fx, fy, fx + fw, fy + fw);
  sheen.addColorStop(0, "rgba(255,255,255,0.45)");
  sheen.addColorStop(1, "rgba(0,0,0,0.4)");
  g.fillStyle = sheen;
  g.fillRect(fx, fy, fw, fw);
  g.restore();
}

// ---- the body and the trim ----------------------------------------------------------------------------

function body(g: G, d: CardDef, pal: Pal, trim: typeof GOLD) {
  const outer = stepRect(6, 6, CARD_W - 12, CARD_H - 12, 13);
  // drop shadow round the card (soft, inside the canvas margin)
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 10;
  g.shadowOffsetY = 3;
  g.fillStyle = "#000";
  g.fill(outer);
  g.restore();
  // the trim: brushed metal all round
  metal(g, outer, trim, 6, CARD_H - 6, 5);
  // the lacquered body inside the trim
  const inner = stepRect(22, 22, CARD_W - 44, CARD_H - 44, 10);
  const lg = g.createLinearGradient(0, 22, 0, CARD_H - 22);
  lg.addColorStop(0, pal.light);
  lg.addColorStop(0.18, pal.mid);
  lg.addColorStop(0.7, pal.deep);
  lg.addColorStop(1, mix(pal.deep, "#000000", 0.4));
  g.save();
  g.fillStyle = lg;
  g.fill(inner);
  g.clip(inner);
  texture(g, grainTile(), 0.5, 0, 0, CARD_W, CARD_H);
  // a lacquer sheen: a broad diagonal highlight
  const sh = g.createLinearGradient(40, 0, 420, 380);
  sh.addColorStop(0, "rgba(255,255,255,0)");
  sh.addColorStop(0.42, "rgba(255,255,255,0.0)");
  sh.addColorStop(0.5, "rgba(255,255,255,0.13)");
  sh.addColorStop(0.58, "rgba(255,255,255,0)");
  g.fillStyle = sh;
  g.fillRect(0, 0, CARD_W, CARD_H);
  // engraved circuit traces in the lacquer
  circuit(g, d, pal);
  g.restore();
  innerShadow(g, inner, 12, 0.85, 2, 4);
  // a fine engraved line just inside the trim
  g.save();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(trim.m2, 0.5);
  g.stroke(stepRect(30, 30, CARD_W - 60, CARD_H - 60, 8));
  g.restore();
  // corner filigree: stepped brackets with a stud
  for (const [cx, cy, sx, sy] of [
    [34, 34, 1, 1],
    [CARD_W - 34, 34, -1, 1],
    [34, CARD_H - 34, 1, -1],
    [CARD_W - 34, CARD_H - 34, -1, -1],
  ] as [number, number, number, number][]) {
    g.fillStyle = trim.m2;
    const s = 5;
    for (let k = 0; k < 6; k++) {
      g.fillRect(cx + sx * k * s, cy, sx * s, s);
      g.fillRect(cx, cy + sy * k * s, s * sx, sy * s);
    }
    stud(g, cx + sx * 12, cy + sy * 12, 5, trim);
  }
}

/** Circuit traces engraved in the body: right-angled lines with pads, seeded by the card. */
function circuit(g: G, d: CardDef, pal: Pal) {
  const r = rng(hash(d.id + "c"));
  g.save();
  g.lineWidth = 2;
  g.strokeStyle = rgba(pal.light, 0.16);
  g.fillStyle = rgba(pal.light, 0.22);
  for (let i = 0; i < 14; i++) {
    let x = 40 + Math.round(r() * 430),
      y = 40 + Math.round(r() * 640);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (r() < 0.5) x += (r() < 0.5 ? -1 : 1) * (10 + Math.round(r() * 50));
      else y += (r() < 0.5 ? -1 : 1) * (10 + Math.round(r() * 50));
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillRect(x - 3, y - 3, 6, 6);
  }
  g.restore();
}

function stud(g: G, x: number, y: number, r: number, m: typeof GOLD) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
  gr.addColorStop(0, m.m3);
  gr.addColorStop(0.5, m.m2);
  gr.addColorStop(1, m.m0);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// ---- faceted gems -------------------------------------------------------------------------------------

/** A faceted polygon gem: triangles from a centre point, each shaded by how it faces the light. */
function facets(g: G, pts: [number, number][], cx: number, cy: number, tones: [string, string, string], table = 0.5) {
  const [dk, md, lt] = tones;
  const L = [-0.62, -0.78];
  const n = pts.length;
  // the crown: outer facets
  for (let i = 0; i < n; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2 - cx,
      my = (a[1] + b[1]) / 2 - cy;
    const len = Math.hypot(mx, my) || 1;
    const k = (mx / len) * L[0] + (my / len) * L[1]; // −1 … 1
    const t = (k + 1) / 2;
    g.fillStyle = t > 0.5 ? mix(md, lt, (t - 0.5) * 2) : mix(dk, md, t * 2);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.closePath();
    g.fill();
  }
  // the table: an inner copy of the outline, flatter and bright
  const tp = pts.map(([x, y]) => [cx + (x - cx) * table, cy + (y - cy) * table] as [number, number]);
  const tg = g.createLinearGradient(cx - 30, cy - 30, cx + 30, cy + 30);
  tg.addColorStop(0, lt);
  tg.addColorStop(1, md);
  g.fillStyle = tg;
  g.fill(poly(tp));
  // the facet edges
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
function ngon(cx: number, cy: number, r: number, n: number, rot: number, sx = 1, sy = 1): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r * sy] as [number, number];
  });
}

/** A number in the card's way: heavy, white, outlined in black, a drop of shadow. */
function number(g: G, n: number, x: number, y: number, size: number, color = "#ffffff") {
  g.save();
  g.font = `700 ${size}px Geist, Roboto, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const s = String(n);
  g.lineJoin = "round";
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 4;
  g.lineWidth = size * 0.2;
  g.strokeStyle = "#0b0805";
  g.strokeText(s, x, y + size * 0.04);
  g.shadowColor = "transparent";
  // (a heavier weight than the font has: a thin stroke of the fill colour)
  g.lineWidth = size * 0.05;
  g.strokeStyle = color;
  g.strokeText(s, x, y + size * 0.04);
  g.fillStyle = color;
  g.fillText(s, x, y + size * 0.04);
  g.restore();
}

function costGem(g: G, n: number, base: number) {
  const cx = 82,
    cy = 82,
    r = 66;
  // the coin's rim and its shadow
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  g.fillStyle = GOLD.m0;
  g.beginPath();
  g.arc(cx, cy, r + 4, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const rim = new Path2D();
  rim.arc(cx, cy, r + 3, 0, Math.PI * 2);
  metal(g, rim, GOLD, cy - r, cy + r, 4);
  facets(g, ngon(cx, cy, r - 6, 12, -Math.PI / 2 + Math.PI / 12), cx, cy, ["#7a4f06", "#e0a92a", "#fff0b0"], 0.62);
  // the Z engraved on the table, faint
  g.save();
  g.translate(cx, cy);
  g.fillStyle = "rgba(122,79,6,0.35)";
  const z = ["#######", "#######", "....###", "...###.", "..###..", ".###...", "#######", "#######"];
  const p = 7;
  z.forEach((row, yy) => [...row].forEach((ch, xx) => ch === "#" && g.fillRect((xx - 3.5) * p, (yy - 4) * p, p, p)));
  g.restore();
  number(g, n, cx, cy, n >= 10 ? 74 : 88, n < base ? "#a8ff9a" : n > base ? "#ff9a8a" : "#ffffff");
}

function attackGem(g: G, n: number, base: number) {
  const cx = 78,
    cy = 638;
  // an orange blade crest: a pointed hexagon tilted like a sword's guard
  const pts: [number, number][] = [
    [cx, cy - 66],
    [cx + 52, cy - 34],
    [cx + 56, cy + 30],
    [cx, cy + 64],
    [cx - 56, cy + 30],
    [cx - 52, cy - 34],
  ];
  g.save();
  g.shadowColor = "rgba(0,0,0,0.75)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  g.fillStyle = "#000";
  g.fill(poly(pts.map(([x, y]) => [cx + (x - cx) * 1.12, cy + (y - cy) * 1.12])));
  g.restore();
  metal(g, poly(pts.map(([x, y]) => [cx + (x - cx) * 1.12, cy + (y - cy) * 1.12])), GOLD, cy - 74, cy + 72, 3);
  facets(g, pts, cx, cy, ["#7a2604", "#f06a1e", "#ffd08a"], 0.55);
  number(g, n, cx, cy + 2, n >= 10 ? 68 : 80, n > base ? "#a8ff9a" : n < base ? "#ff9a8a" : "#ffffff");
}

function healthGem(g: G, n: number, base: number, weapon = false) {
  const cx = 434,
    cy = 640;
  let pts: [number, number][];
  if (weapon) {
    pts = [
      [cx - 54, cy - 56],
      [cx + 54, cy - 56],
      [cx + 54, cy + 10],
      [cx, cy + 66],
      [cx - 54, cy + 10],
    ];
  } else {
    // a drop: round at the bottom, a point at the top
    pts = [];
    pts.push([cx, cy - 72]);
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI * 0.18 + (i / 10) * Math.PI * 1.36;
      pts.push([cx + Math.cos(a) * 54, cy + 12 + Math.sin(a) * 52]);
    }
  }
  const big = pts.map(([x, y]) => [cx + (x - cx) * 1.12, cy + (y - cy) * 1.12] as [number, number]);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.75)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  g.fillStyle = "#000";
  g.fill(poly(big));
  g.restore();
  metal(g, poly(big), weapon ? { m0: "#2a2a2a", m1: "#7a7a7a", m2: "#d4d4d4", m3: "#ffffff" } : GOLD, cy - 80, cy + 72, 3);
  facets(g, pts, cx, cy + (weapon ? 0 : 10), weapon ? ["#2c3036", "#8a939e", "#e8eef4"] : ["#5a0610", "#d8222e", "#ff9aa0"], 0.55);
  number(g, n, cx, cy + (weapon ? 0 : 12), n >= 10 ? 68 : 80, weapon ? "#ffffff" : n > base ? "#a8ff9a" : n < base ? "#ff9a8a" : "#ffffff");
}

// ---- name ribbon, rarity, rules, tribe --------------------------------------------------------------------

function ribbon(g: G, d: CardDef, pal: Pal, trim: typeof GOLD, y: number) {
  // a band bowed upwards, its ends folded back
  const x0 = 30,
    x1 = CARD_W - 30,
    h = 62,
    bow = 18;
  const band = new Path2D();
  band.moveTo(x0, y);
  band.quadraticCurveTo(256, y - bow * 2, x1, y);
  band.lineTo(x1, y + h);
  band.quadraticCurveTo(256, y + h - bow * 2, x0, y + h);
  band.closePath();
  // the folded ends (darker, behind)
  for (const s of [-1, 1]) {
    const ex = s < 0 ? x0 : x1;
    const tail = poly([
      [ex, y + 10],
      [ex - s * 22, y + 16],
      [ex - s * 12, y + h / 2 + 12],
      [ex - s * 22, y + h + 6],
      [ex, y + h],
    ]);
    g.fillStyle = mix(pal.deep, "#000000", 0.3);
    g.fill(tail);
    g.strokeStyle = trim.m0;
    g.lineWidth = 2;
    g.stroke(tail);
  }
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = "#000";
  g.fill(band);
  g.restore();
  const bg = g.createLinearGradient(0, y - bow, 0, y + h);
  bg.addColorStop(0, pal.light);
  bg.addColorStop(0.45, pal.mid);
  bg.addColorStop(1, pal.deep);
  g.save();
  g.fillStyle = bg;
  g.fill(band);
  g.clip(band);
  texture(g, grainTile(), 0.5, 0, y - 40, CARD_W, h + 60);
  g.restore();
  bevel(g, band, 4, 0.5, 0.6, 0, y - bow, 0, y + h);
  // gold edges top and bottom
  g.save();
  g.lineWidth = 4;
  g.strokeStyle = trim.m2;
  g.beginPath();
  g.moveTo(x0, y);
  g.quadraticCurveTo(256, y - bow * 2, x1, y);
  g.stroke();
  g.beginPath();
  g.moveTo(x0, y + h);
  g.quadraticCurveTo(256, y + h - bow * 2, x1, y + h);
  g.stroke();
  g.restore();
  // the name along the bow
  const name = T(d.name, d.zh);
  let size = 40;
  g.font = `700 ${size}px Geist, Roboto, system-ui, sans-serif`;
  while (g.measureText(name).width > x1 - x0 - 70 && size > 22) {
    size -= 1;
    g.font = `700 ${size}px Geist, Roboto, system-ui, sans-serif`;
  }
  const total = g.measureText(name).width;
  let x = 256 - total / 2;
  g.textBaseline = "middle";
  g.lineJoin = "round";
  for (const ch of name) {
    const cw = g.measureText(ch).width;
    const mx = x + cw / 2;
    // the quadratic's y at this x (t solved for a symmetric curve)
    const t = (mx - x0) / (x1 - x0);
    const cy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y - bow * 2) + t * t * y + h / 2 + 1;
    const slope = 2 * (1 - t) * (-bow * 2) + 2 * t * (bow * 2);
    const ang = Math.atan2(slope, x1 - x0);
    g.save();
    g.translate(mx, cy);
    g.rotate(ang);
    g.lineWidth = size * 0.22;
    g.strokeStyle = "#0b0805";
    g.strokeText(ch, -cw / 2, 0);
    g.lineWidth = size * 0.04;
    g.strokeStyle = "#ffffff";
    g.strokeText(ch, -cw / 2, 0);
    g.fillStyle = "#ffffff";
    g.fillText(ch, -cw / 2, 0);
    g.restore();
    x += cw;
  }
}

function rarityGem(g: G, d: CardDef, y: number) {
  const tones = RARITY_GEM[d.rarity];
  if (!tones) return;
  const cx = 256;
  const pts = ngon(cx, y, 17, 4, -Math.PI / 2, 1.2, 1);
  const holder = poly(ngon(cx, y, 25, 4, -Math.PI / 2, 1.25, 1));
  metal(g, holder, GOLD, y - 25, y + 25, 2);
  facets(g, pts, cx, y, tones, 0.45);
  if (d.rarity === "legendary" || d.rarity === "epic") {
    const gl = g.createRadialGradient(cx, y, 2, cx, y, 40);
    gl.addColorStop(0, rgba(tones[2], 0.5));
    gl.addColorStop(1, rgba(tones[2], 0));
    g.fillStyle = gl;
    g.fillRect(cx - 40, y - 40, 80, 80);
  }
}

/** The rules plate: a dark glass panel in an engraved frame, the text wrapped and centred. */
function rules(g: G, d: CardDef, pal: Pal, trim: typeof GOLD, top: number, bottom: number, prover: number) {
  const x = 84,
    w = CARD_W - 168;
  const plate = stepRect(x, top, w, bottom - top, 8);
  metal(g, stepRect(x - 6, top - 6, w + 12, bottom - top + 12, 10), trim, top - 6, bottom + 6, 3);
  const pg = g.createLinearGradient(0, top, 0, bottom);
  pg.addColorStop(0, "#1b1914");
  pg.addColorStop(1, "#0b0a08");
  g.fillStyle = pg;
  g.fill(plate);
  g.save();
  g.clip(plate);
  const tint = g.createRadialGradient(256, top, 10, 256, top + 40, w * 0.8);
  tint.addColorStop(0, rgba(pal.light, 0.16));
  tint.addColorStop(1, rgba(pal.light, 0));
  g.fillStyle = tint;
  g.fillRect(x, top, w, bottom - top);
  texture(g, grainTile(), 0.3, x, top, w, bottom - top);
  g.restore();
  innerShadow(g, plate, 10, 0.9, 0, 3);
  // the text
  const flavour = !d.text && (FLAVOUR[d.id] ?? snarkFlavour(d));
  const raw = flavour ? `_${T(flavour[0], flavour[1])}` : T(d.text, d.textZh);
  if (!raw) {
    // a vanilla body: a small engraved Z mark instead
    g.save();
    g.globalAlpha = 0.35;
    g.fillStyle = trim.m2;
    const z = ["#####", "...##", "..##.", ".##..", "#####"];
    const p = 6;
    z.forEach((row, yy) => [...row].forEach((ch, xx) => ch === "#" && g.fillRect(256 + (xx - 2.5) * p, (top + bottom) / 2 + (yy - 2.5) * p, p, p)));
    g.restore();
    return;
  }
  // tokens: words, bold runs (*…*), spell damage ($n)
  const text = raw.startsWith("_") ? raw.slice(1) : raw;
  interface Tok {
    t: string;
    b: boolean;
    boost: boolean;
  }
  const toks: Tok[] = [];
  const parts = text.split(/(\*[^*]+\*)/);
  const zh = /[㐀-鿿]/.test(text);
  for (const part of parts) {
    if (!part) continue;
    const bold = part.startsWith("*") && part.endsWith("*");
    const s = bold ? part.slice(1, -1) : part;
    const pieces = zh ? [...s] : s.split(/(\s+)/);
    for (const pc of pieces) {
      if (!pc) continue;
      const m = pc.match(/^(.*)\$(\d+)(.*)$/);
      if (m) {
        if (m[1]) toks.push({ t: m[1], b: bold, boost: false });
        toks.push({ t: String(Number(m[2]) + prover), b: true, boost: prover > 0 });
        if (m[3]) toks.push({ t: m[3], b: bold, boost: false });
      } else toks.push({ t: pc, b: bold, boost: false });
    }
  }
  const maxW = w - 34,
    maxH = bottom - top - 20;
  let size = text.length < 14 ? 40 : text.length < 30 ? 34 : 30;
  let lines: Tok[][] = [];
  const fontOf = (b: boolean, s: number) => (flavour ? `italic 500 ${s * 0.86}px Geist, Roboto, system-ui, sans-serif` : `${b ? 700 : 500} ${s}px Geist, Roboto, system-ui, sans-serif`);
  const widthOf = (t: Tok, s: number) => {
    g.font = fontOf(t.b, s);
    return g.measureText(t.t).width;
  };
  for (; size >= 17; size--) {
    lines = [[]];
    let lw = 0;
    for (const t of toks) {
      const tw = widthOf(t, size);
      const space = /^\s+$/.test(t.t);
      if (lw + tw > maxW && !space && lines[lines.length - 1].length) {
        lines.push([]);
        lw = 0;
      }
      if (space && !lines[lines.length - 1].length) continue;
      lines[lines.length - 1].push(t);
      lw += tw;
    }
    if (lines.length * size * 1.22 <= maxH) break;
  }
  const lh = size * 1.22;
  let yy = (top + bottom) / 2 - ((lines.length - 1) * lh) / 2;
  g.textBaseline = "middle";
  for (const line of lines) {
    while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
    const lw = line.reduce((a, t) => a + widthOf(t, size), 0);
    let xx = 256 - lw / 2;
    for (const t of line) {
      g.font = fontOf(t.b, size);
      g.fillStyle = flavour ? "#b8ae98" : t.boost ? "#9dff9e" : t.b ? "#ffffff" : "#e2dccd";
      g.shadowColor = "rgba(0,0,0,0.9)";
      g.shadowBlur = 3;
      g.fillText(t.t, xx, yy);
      xx += g.measureText(t.t).width;
    }
    yy += lh;
  }
  g.shadowColor = "transparent";
}

function tribePlate(g: G, label: string, trim: typeof GOLD) {
  if (!label) return;
  g.font = `600 19px "Geist Mono", "JetBrains Mono", monospace`;
  const tw = g.measureText(label).width + 40;
  const x = 256 - tw / 2,
    y = 664;
  const p = stepRect(x, y - 17, tw, 34, 5);
  metal(g, p, trim, y - 17, y + 17, 2);
  const inner = stepRect(x + 4, y - 13, tw - 8, 26, 4);
  g.fillStyle = "#16130e";
  g.fill(inner);
  g.fillStyle = "#e9e1cc";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "3px";
  g.fillText(label, 256 + 1.5, y + 1);
  g.letterSpacing = "0px";
  g.textAlign = "left";
}

/** A zkSNARK card with no rules: its traits, as a printed line. */
function snarkFlavour(d: CardDef): [string, string] | undefined {
  if (!isSnarkCard(d.id) || !d.serial) return undefined;
  try {
    const s = snarkInfo(d.serial);
    if (s.purged) return ["Burned to raise an Apparition. Still here.", "为唤出显灵者而被焚，却仍在此处。"];
    const t = s.traits;
    return [`${t.Lineage} line · ${t.Skin} skin · ${t.Eyes} eyes`, `${t.Lineage} 血统 · ${t.Skin} 皮肤 · ${t.Eyes} 之眼`];
  } catch {
    return undefined;
  }
}

/**
 * A zkSNARK's standing, as a tab on the card's right shoulder: its rank for the epics and the
 * legendaries ("RANK 7", the top ten in white gold), APPARITION for the 26, PURGED for the 676 burned.
 */
function snarkTab(g: G, d: CardDef) {
  let s;
  try {
    s = snarkInfo(d.serial ?? 0);
  } catch {
    return;
  }
  const text = s.apparition ? T("APPARITION", "显灵") : s.purged ? T("PURGED", "已净化") : s.rank <= 1000 ? `${T("RANK", "排名")} ${s.rank}` : "";
  if (!text) return;
  g.font = `700 17px "Geist Mono", "JetBrains Mono", monospace`;
  g.letterSpacing = "2px";
  const tw = g.measureText(text).width + 30;
  g.letterSpacing = "0px";
  const x = CARD_W - 22 - tw,
    y = 30;
  const m = s.purged ? { m0: "#2a1a3a", m1: "#6a4a8a", m2: "#b48ad8", m3: "#efe2ff" } : s.apparition || s.rank <= 10 ? { m0: "#6a6a72", m1: "#c9c9d2", m2: "#ffffff", m3: "#ffffff" } : s.tier === "legendary" ? GOLD : { m0: "#3a1a5a", m1: "#7a4ab8", m2: "#c88aff", m3: "#f2e2ff" };
  const p = stepRect(x, y, tw, 34, 5);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.fillStyle = "#000";
  g.fill(p);
  g.restore();
  metal(g, p, m, y, y + 34, 2);
  g.fillStyle = "#14110c";
  g.fill(stepRect(x + 4, y + 4, tw - 8, 26, 4));
  g.fillStyle = s.purged ? "#e6d6f4" : s.apparition || s.rank <= 10 ? "#ffffff" : s.tier === "legendary" ? "#ffe39a" : "#e2ccff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "2px";
  g.fillText(text, x + tw / 2 + 1, y + 18);
  g.letterSpacing = "0px";
  g.textAlign = "left";
}

/** Legendary: gold feathers along both shoulders of the window, a crown with a gem on top. */
function legendary(g: G, w: Win) {
  const cx = 256,
    cy = w.y + w.h / 2;
  const rx = w.w / 2 + 18,
    ry = w.h / 2 + 18;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      // round the ellipse from near the top down the shoulder
      const a = -Math.PI / 2 + s * (0.42 + k * 0.15);
      const px = cx + Math.cos(a) * rx,
        py = cy + Math.sin(a) * ry;
      // the outward normal, turned a little upwards
      let nx = Math.cos(a) / rx,
        ny = Math.sin(a) / ry;
      const nl = Math.hypot(nx, ny);
      nx /= nl;
      ny /= nl;
      const up = 0.55;
      let dx = nx * (1 - up),
        dy = ny * (1 - up) - up;
      const dl = Math.hypot(dx, dy);
      dx /= dl;
      dy /= dl;
      const len = 58 - k * 5,
        wd = 13 - k * 0.8;
      const tx = -dy,
        ty = dx;
      const p = poly([
        [px - tx * wd, py - ty * wd],
        [px + dx * len * 0.75 - tx * wd * 0.8, py + dy * len * 0.75 - ty * wd * 0.8],
        [px + dx * len, py + dy * len],
        [px + dx * len * 0.7 + tx * wd * 0.6, py + dy * len * 0.7 + ty * wd * 0.6],
        [px + tx * wd, py + ty * wd],
      ]);
      g.save();
      g.shadowColor = "rgba(0,0,0,0.65)";
      g.shadowBlur = 6;
      g.shadowOffsetY = 3;
      metal(g, p, GOLD, py - len, py + len, 2);
      g.restore();
    }
  }
  const top = w.y - 6;
  // the crown
  const ky = top - 4;
  const crown = poly([
    [196, ky + 30],
    [196, ky - 6],
    [216, ky + 8],
    [234, ky - 26],
    [256, ky - 4],
    [278, ky - 26],
    [296, ky + 8],
    [316, ky - 6],
    [316, ky + 30],
  ]);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  metal(g, crown, GOLD, ky - 26, ky + 30, 3);
  g.restore();
  facets(g, ngon(256, ky + 14, 12, 4, -Math.PI / 2, 1, 1.15), 256, ky + 14, ["#7a2a00", "#ff8a1e", "#ffe6b0"], 0.45);
  for (const x of [234, 278]) stud(g, x, ky - 22, 5, GOLD);
}

/** A seal over a secret's lens: a round wax-like disc with the ? */
function secretSeal(g: G, pal: Pal) {
  const cx = 256,
    cy = 392;
  const p = new Path2D();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = 44 + (i % 2 ? 5 : 0);
    if (i) p.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else p.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  p.closePath();
  metal(g, p, GOLD, cy - 50, cy + 50, 3);
  const inner = new Path2D();
  inner.arc(cx, cy, 34, 0, Math.PI * 2);
  const ig = g.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, 36);
  ig.addColorStop(0, pal.light);
  ig.addColorStop(1, pal.deep);
  g.fillStyle = ig;
  g.fill(inner);
  innerShadow(g, inner, 6, 0.8);
  g.save();
  g.font = `700 50px Geist, Roboto, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "#0b0805";
  g.strokeText("?", cx, cy + 2);
  g.fillStyle = GOLD.m3;
  g.fillText("?", cx, cy + 2);
  g.restore();
}

// ---- the whole card ------------------------------------------------------------------------------------------

/** A line for the cards with no rules (a vanilla body), like a printed flavour text. */
const FLAVOUR: Record<string, [string, string]> = {
  n_kiddie: ["Copied the exploit. Kept the typo.", "抄了漏洞，连错字一起抄。"],
  n_hound: ["It smells a collision a mile off.", "隔着一英里就能闻到碰撞。"],
  n_runner: ["Twenty-four seven, nine years, no reboot.", "全年无休，九年未曾重启。"],
  n_validator: ["Checks every proof twice. Then once more.", "每个证明检查两遍，再来一遍。"],
  n_orphan: ["Mined in good faith. Lost the race anyway.", "诚实出块，还是输了赛跑。"],
  n_whale: ["Moves the market by breathing.", "呼吸一下，市场就动了。"],
  n_megawhale: ["The order book bends round it.", "订单簿都绕着它弯。"],
  n_light: ["Trusts the headers. Watches the rest.", "相信区块头，盯着其余的。"],
  n_cold: ["Offline since the genesis block.", "自创世区块起就离线了。"],
  n_hw: ["Confirm on device.", "请在设备上确认。"],
  n_bridge: ["Nobody crosses without the toll.", "不交过路费，谁也别想过。"],
  n_turnstile: ["What goes into the pool comes out counted.", "进池的，出来时都要数清。"],
  n_squire: ["Proves it before anyone asks.", "没人问就先证明了。"],
  n_courier: ["The package is sealed. So is the courier.", "包裹是密封的，信使也是。"],
  n_darkpool: ["You'll see the trade when it's done.", "交易完成时你才会看见。"],
  n_double: ["Same coin, two receipts.", "同一枚币，两张收据。"],
  n_frontrunner: ["Saw your order. Got there first.", "看到你的单子，先到一步。"],
  n_relay: ["Gossip travels fast. So does it.", "流言传得快，它更快。"],
  n_notary: ["Stamps it, signs it, stands in front of it.", "盖章、签名，再挡在前面。"],
  n_dust: ["Too small to spend. Big enough to hurt.", "小到花不掉，大到够疼。"],
  t_raider: ["The rig was unlocked. Mostly.", "矿机基本上没上锁。"],
  t_dumper: ["Sells the top. Every time.", "每次都卖在山顶。"],
  t_pick: ["Every block starts with one swing.", "每个区块都从一镐开始。"],
  t_hammer: ["Hits like a difficulty adjustment.", "砸下去像难度调整。"],
  s_oak: ["It remembers the first Sapling.", "它还记得第一棵 Sapling。"],
  p_soul: ["Mines the old pool for what it left.", "在旧池里挖它留下的东西。"],
  p_revenant: ["Deprecated. Not gone.", "已弃用，未消失。"],
  o_sentinel: ["Nothing gets in. Nothing gets seen.", "什么也进不来，什么也看不见。"],
  t_miner: ["Paid by the share.", "按份额领工钱。"],
  s_seed: ["Small now.", "现在还小。"],
  s_sapling: ["Growing into the pool.", "在池子里慢慢长大。"],
  p_shade: ["A note nobody spent.", "一张没人花掉的票据。"],
  p_shade2: ["It waited a long time for this.", "它为此等了很久。"],
  n_sybil_t: ["One of many. All of them it.", "众多之一，全都是它。"],
  n_rat_t: ["Squeaks in the mempool at night.", "夜里在内存池里吱吱叫。"],
};

const TRIBE_ZH: Record<string, string> = { Miner: "矿工", Node: "节点", Whale: "巨鲸", Ghost: "幽灵", Plant: "植物", Bot: "机器人" };

function draw(cv: HTMLCanvasElement, id: string, o: PaintOpts, cells: Int32Array | null) {
  const d = card(id);
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, CARD_W, CARD_H);
  const pal = PAL[d.faction];
  const trim = d.rarity === "legendary" ? GOLD : d.faction === "orchard" ? GOLD : { m0: pal.m0, m1: pal.m1, m2: pal.m2, m3: pal.m3 };
  body(g, d, pal, trim);
  const w = windowFor(d);
  // the window's frame ring (behind), then the scene and the figure inside
  g.save();
  g.shadowColor = "rgba(0,0,0,0.8)";
  g.shadowBlur = 14;
  g.shadowOffsetY = 5;
  g.fillStyle = "#000";
  g.fill(w.ring);
  g.restore();
  metal(g, w.ring, trim, w.y - 22, w.y + w.h + 22, 5);
  // studs round the ring
  const studs = d.type === "spell" || d.type === "secret" ? 12 : 10;
  for (let i = 0; i < studs; i++) {
    const a = (i / studs) * Math.PI * 2 + Math.PI / studs;
    const rx = w.w / 2 + 11,
      ry = d.type === "weapon" ? w.h / 2 : w.h / 2 + 11;
    if (d.type !== "weapon") stud(g, 256 + Math.cos(a) * rx, w.y + w.h / 2 + Math.sin(a) * ry, 4, trim);
  }
  g.save();
  g.clip(w.path);
  scene(g, d, w, pal);
  figure(g, cells, d, w, pal);
  // the glass: a curved reflection and a vignette
  const vg = g.createRadialGradient(256, w.y + w.h * 0.5, w.w * 0.3, 256, w.y + w.h * 0.5, w.w * 0.62);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg;
  g.fillRect(w.x, w.y, w.w, w.h);
  if (d.type === "spell" || d.type === "secret") {
    const rf = g.createLinearGradient(w.x, w.y, w.x + w.w * 0.6, w.y + w.h * 0.5);
    rf.addColorStop(0, "rgba(255,255,255,0.22)");
    rf.addColorStop(0.5, "rgba(255,255,255,0.04)");
    rf.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rf;
    g.beginPath();
    g.ellipse(w.x + w.w * 0.36, w.y + w.h * 0.28, w.w * 0.32, w.h * 0.16, -0.6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  innerShadow(g, w.path, 16, 0.9, 0, 5);
  if (d.type === "secret") secretSeal(g, pal);
  if (d.rarity === "legendary") legendary(g, w);

  // the lower half
  const spellish = d.type !== "minion" && d.type !== "weapon";
  const ribY = spellish ? 418 : 424;
  ribbon(g, d, pal, trim, ribY);
  rarityGem(g, d, ribY + 76);
  rules(g, d, pal, trim, ribY + 98, spellish ? 630 : 608, o.prover ?? 0);
  const kind = d.tribe ? T(d.tribe, TRIBE_ZH[d.tribe] ?? d.tribe) : d.type === "secret" ? T("Secret", "奥秘") : d.type === "spell" ? T("Spell", "法术") : d.type === "weapon" ? T("Weapon", "武器") : "";
  // a zkSNARK's card carries its number on the plate
  const label = d.serial ? `#${d.serial}${kind ? ` · ${kind}` : ""}` : kind;
  tribePlate(g, label.toUpperCase(), trim);
  if (isSnarkCard(d.id)) snarkTab(g, d);
  costGem(g, o.cost ?? d.cost, d.cost);
  if (d.type === "minion") {
    attackGem(g, o.atk ?? d.atk ?? 0, d.atk ?? 0);
    healthGem(g, o.hp ?? d.hp ?? 1, d.hp ?? 1);
  } else if (d.type === "weapon") {
    attackGem(g, o.atk ?? d.atk ?? 0, d.atk ?? 0);
    healthGem(g, d.dur ?? 1, d.dur ?? 1, true);
  }
}

// ---- the cache -----------------------------------------------------------------------------------------------

interface Entry {
  cv: HTMLCanvasElement;
  id: string;
  o: PaintOpts;
  done: boolean;
  fns: Set<() => void>;
  url: string;
}
const cache = new Map<string, Entry>();
/** Told when a painted card (its key) or the back ("back") has been painted again. */
const painted = new Set<(key: string) => void>();
export function onPainted(f: (key: string) => void) {
  painted.add(f);
}
let fontsOk = false;
let fontsWait: Promise<void> | null = null;
function fonts() {
  if (fontsOk || typeof document === "undefined" || !document.fonts) return;
  fontsWait ??= Promise.all([
    document.fonts.load('700 40px "Geist"'),
    document.fonts.load('500 30px "Geist"'),
    document.fonts.load('600 19px "Geist Mono"'),
    document.fonts.load('40px "DotGothic16"'),
  ])
    .then(() => {
      fontsOk = true;
      // everything painted with the stand-in fonts, again
      for (const e of cache.values()) repaint(e);
      if (backCv) {
        paintBackInto(backCv);
        backDataUrl = "";
        for (const f of painted) f("back");
      }
    })
    .catch(() => {
      fontsOk = true;
    });
}
function repaint(e: Entry) {
  const id = card(e.id).art;
  draw(e.cv, e.id, e.o, readyCells.get(id) ?? null);
  e.url = "";
  for (const f of e.fns) f();
  const key = paintKey(e.id, e.o);
  for (const f of painted) f(key);
}
const readyCells = new Map<number, Int32Array>();

export const paintKey = (id: string, o: PaintOpts = {}) => `${id}|${o.cost ?? ""}|${o.atk ?? ""}|${o.hp ?? ""}|${o.prover ?? 0}`;

export function paintCard(id: string, o: PaintOpts = {}, onChange?: () => void): HTMLCanvasElement {
  fonts();
  const key = paintKey(id, o);
  let e = cache.get(key);
  if (!e) {
    const cv = canvas(CARD_W, CARD_H);
    e = { cv, id, o: { ...o }, done: false, fns: new Set(), url: "" };
    cache.set(key, e);
    const art = card(id).art;
    draw(cv, id, o, readyCells.get(art) ?? null);
    if (!readyCells.has(art)) {
      const ent = e;
      void snarkPixels(art).then((c) => {
        if (!c) return;
        readyCells.set(art, c);
        repaint(ent);
      });
    } else e.done = true;
    // (a long session: the oldest cards go)
    if (cache.size > 400) {
      const first = cache.keys().next().value!;
      const old = cache.get(first)!;
      if (old.url) URL.revokeObjectURL(old.url);
      cache.delete(first);
    }
  }
  if (onChange) e.fns.add(onChange);
  return e.cv;
}

/** A small object URL of the painted card (for <img>), made when asked; "" until it's ready. */
export function cardUrl(id: string, o: PaintOpts = {}, onChange?: () => void): string {
  const key = paintKey(id, o);
  paintCard(id, o, onChange);
  const e = cache.get(key)!;
  if (!e.url) e.url = e.cv.toDataURL("image/webp", 0.92);
  return e.url;
}

// ---- the back ----------------------------------------------------------------------------------------------

let backCv: HTMLCanvasElement | null = null;
function paintBackInto(cv: HTMLCanvasElement) {
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, CARD_W, CARD_H);
  const pal = PAL.orchard;
  const outer = stepRect(6, 6, CARD_W - 12, CARD_H - 12, 13);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 10;
  g.shadowOffsetY = 3;
  g.fillStyle = "#000";
  g.fill(outer);
  g.restore();
  metal(g, outer, GOLD, 6, CARD_H - 6, 5);
  const inner = stepRect(24, 24, CARD_W - 48, CARD_H - 48, 10);
  g.save();
  const bg = g.createRadialGradient(256, 330, 20, 256, 358, 420);
  bg.addColorStop(0, "#2a2242");
  bg.addColorStop(0.5, "#141028");
  bg.addColorStop(1, "#07060e");
  g.fillStyle = bg;
  g.fill(inner);
  g.clip(inner);
  // a woven pixel lattice
  for (let y = 24; y < CARD_H; y += 16)
    for (let x = 24; x < CARD_W; x += 16) {
      const on = ((x / 16) ^ (y / 16)) % 3 === 0;
      g.fillStyle = on ? "rgba(244,183,40,0.13)" : "rgba(244,183,40,0.04)";
      g.fillRect(x + 4, y + 4, 8, 8);
    }
  // rays from the seal
  g.globalCompositeOperation = "screen";
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(256, 358);
    g.lineTo(256 + Math.cos(a - 0.06) * 600, 358 + Math.sin(a - 0.06) * 600);
    g.lineTo(256 + Math.cos(a + 0.06) * 600, 358 + Math.sin(a + 0.06) * 600);
    g.closePath();
    const rg = g.createRadialGradient(256, 358, 40, 256, 358, 420);
    rg.addColorStop(0, "rgba(255,215,106,0.16)");
    rg.addColorStop(1, "rgba(255,215,106,0)");
    g.fillStyle = rg;
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  texture(g, grainTile(), 0.35, 0, 0, CARD_W, CARD_H);
  circuit(g, card("n_whale"), pal);
  g.restore();
  innerShadow(g, inner, 14, 0.9, 2, 5);
  g.save();
  g.lineWidth = 2;
  g.strokeStyle = rgba(GOLD.m2, 0.6);
  g.stroke(stepRect(44, 44, CARD_W - 88, CARD_H - 88, 9));
  g.restore();
  // the seal: a gold ring with the Z
  const ring = new Path2D();
  ring.arc(256, 358, 128, 0, Math.PI * 2);
  ring.arc(256, 358, 100, 0, Math.PI * 2, true);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.8)";
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  metal(g, ring, GOLD, 230, 486, 4);
  g.restore();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    stud(g, 256 + Math.cos(a) * 114, 358 + Math.sin(a) * 114, 4, GOLD);
  }
  const disc = new Path2D();
  disc.arc(256, 358, 98, 0, Math.PI * 2);
  const dg = g.createRadialGradient(236, 330, 6, 256, 358, 100);
  dg.addColorStop(0, "#2c2448");
  dg.addColorStop(1, "#0c0a18");
  g.fillStyle = dg;
  g.fill(disc);
  innerShadow(g, disc, 12, 0.9, 0, 4);
  const z = ["#########", "#########", "......###", ".....###.", "....###..", "...###...", "..###....", ".###.....", "#########", "#########"];
  const p = 13;
  const zp = new Path2D();
  z.forEach((row, yy) => [...row].forEach((ch, xx) => ch === "#" && zp.rect(256 + (xx - 4.5) * p, 358 + (yy - 5) * p, p, p)));
  zp.rect(256 - p, 358 - 5 * p - p * 1.6, p * 2, p * 1.6);
  zp.rect(256 - p, 358 + 5 * p, p * 2, p * 1.6);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.8)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 4;
  metal(g, zp, GOLD, 358 - 80, 358 + 80, 3);
  g.restore();
  // the name on a plate below
  g.save();
  g.font = `40px DotGothic16, "Geist Mono", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "#0b0805";
  g.strokeText("ZK LEGENDS", 256, 586);
  g.fillStyle = GOLD.m2;
  g.fillText("ZK LEGENDS", 256, 586);
  g.font = `22px DotGothic16, monospace`;
  g.fillStyle = rgba(GOLD.m2, 0.7);
  g.fillText("零知传奇", 256, 626);
  g.font = `22px DotGothic16, monospace`;
  g.fillText("ZSTREET", 256, 128);
  g.restore();
}
export function paintBack(): HTMLCanvasElement {
  fonts();
  if (!backCv) {
    backCv = canvas(CARD_W, CARD_H);
    paintBackInto(backCv);
  }
  return backCv;
}
let backDataUrl = "";
export function backUrl(): string {
  paintBack();
  if (!backDataUrl) backDataUrl = backCv!.toDataURL("image/webp", 0.9);
  return backDataUrl;
}

// ---- the pack -----------------------------------------------------------------------------------------------

let packCv: HTMLCanvasElement | null = null;
/** A booster pack: gold foil with crimped ends, the seal, the name. 360 × 560. */
export function paintPack(): HTMLCanvasElement {
  if (packCv) return packCv;
  fonts();
  const W = 360,
    H = 560;
  const cv = (packCv = canvas(W, H));
  const g = cv.getContext("2d")!;
  const body = new Path2D();
  body.moveTo(18, 40);
  for (let x = 18; x <= W - 18; x += 12) body.lineTo(x, x % 24 ? 40 : 30);
  body.lineTo(W - 18, H - 40);
  for (let x = W - 18; x >= 18; x -= 12) body.lineTo(x, x % 24 ? H - 40 : H - 30);
  body.closePath();
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 20;
  g.shadowOffsetY = 10;
  g.fillStyle = "#000";
  g.fill(body);
  g.restore();
  const fg = g.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, "#3a2a6a");
  fg.addColorStop(0.35, "#1a1236");
  fg.addColorStop(0.65, "#241848");
  fg.addColorStop(1, "#0c0818");
  g.save();
  g.fillStyle = fg;
  g.fill(body);
  g.clip(body);
  // foil: diagonal iridescent bands
  g.globalCompositeOperation = "screen";
  for (let i = -6; i < 12; i++) {
    const x = i * 60;
    const gr = g.createLinearGradient(x, 0, x + 120, H);
    gr.addColorStop(0, "rgba(255,215,106,0)");
    gr.addColorStop(0.5, `rgba(${i % 2 ? "196,177,252" : "255,215,106"},0.14)`);
    gr.addColorStop(1, "rgba(255,215,106,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 40, 0);
    g.lineTo(x + 200, H);
    g.lineTo(x + 160, H);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  texture(g, brushedTile(), 0.25, 0, 0, W, H);
  // crimped bands at the ends
  for (const y of [30, H - 70]) {
    const band = g.createLinearGradient(0, y, 0, y + 40);
    band.addColorStop(0, GOLD.m3);
    band.addColorStop(0.5, GOLD.m1);
    band.addColorStop(1, GOLD.m0);
    g.fillStyle = band;
    g.fillRect(0, y, W, 40);
    g.fillStyle = "rgba(0,0,0,0.25)";
    for (let x = 0; x < W; x += 6) g.fillRect(x, y, 2, 40);
  }
  g.restore();
  // the seal
  const ring = new Path2D();
  ring.arc(W / 2, 250, 94, 0, Math.PI * 2);
  ring.arc(W / 2, 250, 72, 0, Math.PI * 2, true);
  metal(g, ring, GOLD, 156, 344, 4);
  const disc = new Path2D();
  disc.arc(W / 2, 250, 70, 0, Math.PI * 2);
  g.fillStyle = "#0e0a1c";
  g.fill(disc);
  const z = ["#######", "#######", "....###", "...###.", "..###..", ".###...", "#######", "#######"];
  const p = 12;
  const zp = new Path2D();
  z.forEach((row, yy) => [...row].forEach((ch, xx) => ch === "#" && zp.rect(W / 2 + (xx - 3.5) * p, 250 + (yy - 4) * p, p, p)));
  metal(g, zp, GOLD, 200, 300, 2);
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `44px DotGothic16, monospace`;
  g.lineWidth = 8;
  g.strokeStyle = "#0b0805";
  g.strokeText("ZK LEGENDS", W / 2, 400);
  g.fillStyle = GOLD.m2;
  g.fillText("ZK LEGENDS", W / 2, 400);
  g.font = `20px "Geist Mono", monospace`;
  g.fillStyle = "rgba(255,240,200,0.8)";
  g.fillText(T("5 CARDS · 1 RARE OR BETTER", "5 张卡 · 至少 1 张稀有"), W / 2, 440);
  g.restore();
  return cv;
}

// ---- materials for the menus (CSS backgrounds) ------------------------------------------------------------

const matUrls: Record<string, string> = {};
/** A material tile as a data URL: brushed metal grain or lacquer grain (grey, for overlay blending). */
export function materialUrl(kind: "brushed" | "grain"): string {
  return (matUrls[kind] ??= (kind === "brushed" ? brushedTile() : grainTile()).toDataURL("image/png"));
}

/** A faceted rarity gem as a small image (the collection's counts and filters). */
export function gemUrl(rarity: string, size = 40): string {
  const key = `gem:${rarity}:${size}`;
  if (matUrls[key]) return matUrls[key];
  const tones = RARITY_GEM[rarity] ?? (["#5a3a06", "#e0a92a", "#fff0b0"] as [string, string, string]);
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const r = size * 0.42;
  facets(g, ngon(size / 2, size / 2, r, 4, -Math.PI / 2, 1, 1), size / 2, size / 2, tones, 0.45);
  return (matUrls[key] = c.toDataURL());
}

/** The gold Zcash coin with a number (mana filters, deck rows). */
export function coinUrl(n: number | string, size = 64): string {
  const key = `coin:${n}:${size}`;
  if (matUrls[key]) return matUrls[key];
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const k = size / 160;
  g.scale(k, k);
  g.translate(-2, -2);
  const rim = new Path2D();
  rim.arc(82, 82, 69, 0, Math.PI * 2);
  metal(g, rim, GOLD, 13, 151, 4);
  facets(g, ngon(82, 82, 60, 12, -Math.PI / 2 + Math.PI / 12), 82, 82, ["#7a4f06", "#e0a92a", "#fff0b0"], 0.62);
  g.font = `700 ${String(n).length > 1 ? 70 : 84}px Geist, Roboto, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 16;
  g.strokeStyle = "#0b0805";
  g.strokeText(String(n), 82, 86);
  g.fillStyle = "#fff";
  g.fillText(String(n), 82, 86);
  return (matUrls[key] = c.toDataURL());
}

/** The ZK LEGENDS logo: extruded gold pixel letters over a Z seal. 1000 × 360. */
export function paintLogo(): HTMLCanvasElement {
  const W = 1000,
    H = 360;
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  // the seal behind
  const ring = new Path2D();
  ring.arc(W / 2, 150, 140, 0, Math.PI * 2);
  ring.arc(W / 2, 150, 112, 0, Math.PI * 2, true);
  g.save();
  g.globalAlpha = 0.9;
  metal(g, ring, GOLD, 10, 290, 4);
  g.restore();
  const disc = new Path2D();
  disc.arc(W / 2, 150, 110, 0, Math.PI * 2);
  const dg = g.createRadialGradient(W / 2 - 20, 120, 6, W / 2, 150, 112);
  dg.addColorStop(0, "#2c2448");
  dg.addColorStop(1, "#0a0816");
  g.fillStyle = dg;
  g.fill(disc);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    stud(g, W / 2 + Math.cos(a) * 126, 150 + Math.sin(a) * 126, 4.5, GOLD);
  }
  // the words: one layer per depth step, dark to light, then the face
  const word = "ZK LEGENDS";
  g.font = `150px DotGothic16, "Geist Mono", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = 168;
  for (let k = 14; k >= 1; k--) {
    g.fillStyle = mix("#2a1802", "#8a5a0a", 1 - k / 14);
    g.fillText(word, W / 2 + k * 0.6, y + k);
  }
  g.lineWidth = 10;
  g.lineJoin = "round";
  g.strokeStyle = "#1a0f02";
  g.strokeText(word, W / 2, y);
  const fg = g.createLinearGradient(0, y - 70, 0, y + 70);
  fg.addColorStop(0, "#fff6cf");
  fg.addColorStop(0.35, "#f6cc55");
  fg.addColorStop(0.55, "#c08a14");
  fg.addColorStop(0.8, "#f2c04a");
  fg.addColorStop(1, "#8a5a0a");
  g.fillStyle = fg;
  g.fillText(word, W / 2, y);
  // a glint across the top of the letters
  g.save();
  g.globalCompositeOperation = "source-atop";
  const gl = g.createLinearGradient(W * 0.25, 0, W * 0.6, H);
  gl.addColorStop(0.45, "rgba(255,255,255,0)");
  gl.addColorStop(0.5, "rgba(255,255,255,0.55)");
  gl.addColorStop(0.55, "rgba(255,255,255,0)");
  g.fillStyle = gl;
  g.fillRect(0, 0, W, H);
  g.restore();
  // the Chinese name on a ribbon
  const rb = new Path2D();
  rb.moveTo(W / 2 - 170, 278);
  rb.quadraticCurveTo(W / 2, 262, W / 2 + 170, 278);
  rb.lineTo(W / 2 + 170, 326);
  rb.quadraticCurveTo(W / 2, 310, W / 2 - 170, 326);
  rb.closePath();
  metal(g, rb, { m0: "#3a0a0a", m1: "#7a1a14", m2: "#c43a2a", m3: "#ff8a6a" }, 262, 326, 3);
  g.font = `34px DotGothic16, monospace`;
  g.lineWidth = 6;
  g.strokeStyle = "#1a0505";
  g.strokeText("零 知 传 奇", W / 2, 296);
  g.fillStyle = "#ffe6b0";
  g.fillText("零 知 传 奇", W / 2, 296);
  return c;
}
