/**
 * LAST SNARK's deck, painted once on canvas and kept as images (blob URLs, so a card in the DOM is a
 * plain <img>): cream card stock with a printed ink panel per suit (the four pools: IRONWOOD, SAPLING,
 * ORCHARD, SPROUT), each suit with its own engraving (its pip echoed outwards: flames, diamonds,
 * hexagons, leaves), the value set as a dot glyph (a 5 × 7 dot matrix, the off points left faint), a
 * zkSNARK sigil as the printer's mark, and a guilloché back with the ⓩ mark. `artReady()` waits for
 * the type before the first card.
 */
import { T } from "../../i18n/lang";
import { type Card, mulberry } from "./engine";
import { drawMark } from "../../party/theme";

export interface InkMeta {
  name: string;
  zh: string;
  c: string;
  hi: string;
  lo: string;
  deep: string;
}
export const INKS: InkMeta[] = [
  { name: "IRONWOOD", zh: "铁木", c: "#ff6b35", hi: "#ff9466", lo: "#e5521f", deep: "#6e1f05" },
  { name: "SAPLING", zh: "树苗", c: "#c4b1fc", hi: "#ddd2ff", lo: "#a891f0", deep: "#3d2a86" },
  { name: "ORCHARD", zh: "果园", c: "#a8d8e8", hi: "#cdeef8", lo: "#84c1d6", deep: "#1c5466" },
  { name: "SPROUT", zh: "萌芽", c: "#6dbf8a", hi: "#94d6aa", lo: "#4fa36d", deep: "#174a2a" },
];
export const inkName = (i: number) => (i >= 0 ? T(INKS[i].name, INKS[i].zh) : "");

const VOID = "#121114";
const STOCK = "#efeadf";
const FONT = "Geist, Roboto, ui-sans-serif, system-ui, sans-serif";
const MONO = '"Geist Mono", "JetBrains Mono", ui-monospace, monospace';

export function cardName(c: Card): string {
  switch (c.kind) {
    case "num":
      return `${inkName(c.ink)} ${c.n}`;
    case "skip":
      return T("MISSED BLOCK", "漏块");
    case "reorg":
      return T("REORG", "重组");
    case "fees":
      return T("+2 FEES", "+2 手续费");
    case "fork":
      return T("FORK", "分叉");
    case "shor":
      return T("DUST ATTACK", "粉尘攻击");
    case "makers":
      return T("SHIELDED HOUR", "屏蔽时刻");
  }
}
/** The name with its pool for the log: "SAPLING REORG". */
export const cardLabel = (c: Card) => (c.kind === "num" || c.ink < 0 ? cardName(c) : `${inkName(c.ink)} ${cardName(c)}`);

const f = (v: number) => Math.round(v * 100) / 100;

/** The pool's shape (an SVG path): IRONWOOD a flame, SAPLING a diamond, ORCHARD a hexagon, SPROUT a leaf. */
export function pipPath(ink: number, cx: number, cy: number, r: number): string {
  if (ink === 0) return `M${f(cx)} ${f(cy - r)}C${f(cx + r * 0.95)} ${f(cy - r * 0.05)} ${f(cx + r * 0.8)} ${f(cy + r)} ${f(cx)} ${f(cy + r)}C${f(cx - r * 0.8)} ${f(cy + r)} ${f(cx - r * 0.95)} ${f(cy - r * 0.05)} ${f(cx)} ${f(cy - r)}Z`;
  if (ink === 1) return `M${f(cx)} ${f(cy - r)}L${f(cx + r * 0.78)} ${f(cy)}L${f(cx)} ${f(cy + r)}L${f(cx - r * 0.78)} ${f(cy)}Z`;
  if (ink === 2) {
    let d = "";
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
      d += `${k ? "L" : "M"}${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`;
    }
    return d + "Z";
  }
  return `M${f(cx - r * 0.85)} ${f(cy + r * 0.85)}C${f(cx - r * 0.95)} ${f(cy - r * 0.4)} ${f(cx - r * 0.2)} ${f(cy - r * 0.95)} ${f(cx + r * 0.9)} ${f(cy - r * 0.9)}C${f(cx + r * 0.95)} ${f(cy + r * 0.2)} ${f(cx + r * 0.4)} ${f(cy + r * 0.95)} ${f(cx - r * 0.85)} ${f(cy + r * 0.85)}Z`;
}
/** The same shapes on a canvas (a path, not filled). */
export function pipTrace(g: CanvasRenderingContext2D, ink: number, cx: number, cy: number, r: number) {
  g.beginPath();
  if (ink === 0) {
    g.moveTo(cx, cy - r);
    g.bezierCurveTo(cx + r * 0.95, cy - r * 0.05, cx + r * 0.8, cy + r, cx, cy + r);
    g.bezierCurveTo(cx - r * 0.8, cy + r, cx - r * 0.95, cy - r * 0.05, cx, cy - r);
  } else if (ink === 1) {
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.78, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r * 0.78, cy);
  } else if (ink === 2) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
      g[k ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  } else {
    g.moveTo(cx - r * 0.85, cy + r * 0.85);
    g.bezierCurveTo(cx - r * 0.95, cy - r * 0.4, cx - r * 0.2, cy - r * 0.95, cx + r * 0.9, cy - r * 0.9);
    g.bezierCurveTo(cx + r * 0.95, cy + r * 0.2, cx + r * 0.4, cy + r * 0.95, cx - r * 0.85, cy + r * 0.85);
  }
  g.closePath();
}

/** A small ink chip: its shape in its colour (for the picker and the HUD). */
export const pipSvg = (ink: number, size = 14) => `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><path d="${pipPath(ink, 10, 10, 8.4)}" fill="${INKS[ink].c}"/></svg>`;

// ---- the dot glyphs: 5 × 7 dot matrices -------------------------------------------------------

const DOTS: Record<string, string> = {
  "0": ".###.#...##...##...##...##...#.###.",
  "1": "..#...##....#....#....#....#...###.",
  "2": ".###.#...#....#...#...#...#...#####",
  "3": ".###.#...#....#..##.....##...#.###.",
  "4": "...#...##..#.#.#..#.#####...#....#.",
  "5": "######....####.....#....##...#.###.",
  "6": "..##..#...#....####.#...##...#.###.",
  "7": "#####....#...#...#...#....#....#...",
  "8": ".###.#...##...#.###.#...##...#.###.",
  "9": ".###.#...##...#.####....#...#..##..",
  "+": ".......#....#..#####..#....#.......",
};

/** A string of dot glyphs centred on (cx, cy): `on` dots in `ink`, the rest faint dots. */
function dotGlyphs(g: CanvasRenderingContext2D, s: string, cx: number, cy: number, pitch: number, ink: string, off: string, offA: number, emboss: boolean) {
  const cols = s.length * 5 + (s.length - 1);
  const x0 = cx - ((cols - 1) * pitch) / 2,
    y0 = cy - 3 * pitch;
  const R = pitch * 0.4;
  // the faint points first (every point of the box)
  g.fillStyle = off;
  g.globalAlpha = offA;
  const dot = (x: number, y: number, r: number) => (g.moveTo(x + r, y), g.arc(x, y, r, 0, Math.PI * 2));
  g.beginPath();
  for (let c = 0; c < cols; c++) for (let y = 0; y < 7; y++) dot(x0 + c * pitch, y0 + y * pitch, R * 0.42);
  g.fill();
  g.globalAlpha = 1;
  const on: [number, number][] = [];
  for (let k = 0; k < s.length; k++) {
    const m = DOTS[s[k]];
    if (!m) continue;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (m[y * 5 + x] === "#") on.push([x0 + (k * 6 + x) * pitch, y0 + y * pitch]);
  }
  if (emboss) {
    // pressed into the stock: a soft lip below each dot
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.beginPath();
    for (const [x, y] of on) dot(x + R * 0.12, y + R * 0.2, R * 1.04);
    g.fill();
  }
  g.fillStyle = ink;
  g.beginPath();
  for (const [x, y] of on) dot(x, y, R);
  g.fill();
  if (emboss) {
    // a glint on each printed dot
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.beginPath();
    for (const [x, y] of on) dot(x - R * 0.3, y - R * 0.32, R * 0.36);
    g.fill();
  }
}

// ---- the canvas -----------------------------------------------------------------------------------

/** Pixels per card unit (a card is 100 × 140 units): sharp on the biggest card at this screen's density. */
let PX = 0;
const px = () => (PX ||= Math.min(3, Math.max(2, (typeof devicePixelRatio === "number" ? devicePixelRatio : 1) * 1.2)));

let grainCv: HTMLCanvasElement | null = null;
/** A tile of paper grain (soft grey noise with a few fibres). */
function grain(): HTMLCanvasElement {
  if (grainCv) return grainCv;
  const N = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d")!;
  const im = g.createImageData(N, N);
  const r = mulberry(91);
  for (let i = 0; i < N * N; i++) {
    const v = 128 + (r() - 0.5) * 90;
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  g.strokeStyle = "rgba(90,80,64,0.35)";
  g.lineWidth = 0.6;
  for (let k = 0; k < 26; k++) {
    const x = r() * N,
      y = r() * N,
      a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4 + 2, x + Math.cos(a) * 9, y + Math.sin(a) * 9);
    g.stroke();
  }
  return (grainCv = cv);
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement("canvas");
  cv.width = Math.round(100 * px());
  cv.height = Math.round(140 * px());
  const g = cv.getContext("2d")!;
  g.scale(px(), px());
  g.lineCap = "round";
  g.lineJoin = "round";
  return [cv, g];
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Cream card stock: a soft light from the top left, grain, and a pressed edge. */
function stock(g: CanvasRenderingContext2D, dark = false) {
  const gr = g.createLinearGradient(0, 0, 100, 140);
  if (dark) {
    gr.addColorStop(0, "#1d1b20");
    gr.addColorStop(1, "#0d0c0f");
  } else {
    gr.addColorStop(0, "#f6f2e8");
    gr.addColorStop(0.6, STOCK);
    gr.addColorStop(1, "#ddd6c6");
  }
  rr(g, 0, 0, 100, 140, 7);
  g.fillStyle = gr;
  g.fill();
  g.save();
  g.clip();
  g.globalCompositeOperation = dark ? "screen" : "multiply";
  g.globalAlpha = dark ? 0.05 : 0.16;
  g.fillStyle = g.createPattern(grain(), "repeat")!;
  g.save();
  g.scale(1 / px(), 1 / px());
  g.fillRect(0, 0, 100 * px(), 140 * px());
  g.restore();
  g.restore();
  // the cut edge
  rr(g, 0.4, 0.4, 99.2, 139.2, 6.7);
  g.strokeStyle = dark ? "rgba(255,255,255,0.10)" : "rgba(120,104,80,0.45)";
  g.lineWidth = 0.7;
  g.stroke();
}

/** The printed panel of a suit: its gradient, its engraving (the pip echoed outwards), a keyline. */
function panel(g: CanvasRenderingContext2D, ink: number) {
  const x = 5.2,
    y = 5.2,
    w = 89.6,
    h = 129.6;
  g.save();
  rr(g, x, y, w, h, 4.2);
  if (ink >= 0) {
    const k = INKS[ink];
    const gr = g.createLinearGradient(x, y, x + w * 0.7, y + h);
    gr.addColorStop(0, k.hi);
    gr.addColorStop(0.45, k.c);
    gr.addColorStop(1, k.lo);
    g.fillStyle = gr;
  } else {
    const gr = g.createLinearGradient(x, y, x + w * 0.7, y + h);
    gr.addColorStop(0, "#252229");
    gr.addColorStop(1, "#0c0b0e");
    g.fillStyle = gr;
  }
  g.fill();
  g.clip();
  // the engraving
  g.lineWidth = 0.55;
  if (ink >= 0) {
    g.strokeStyle = INKS[ink].deep;
    g.globalAlpha = 0.22;
    for (let r = 7; r < 110; r += 5.2) {
      pipTrace(g, ink, 50, 70, r);
      g.stroke();
    }
  } else {
    // four inks, one quarter each, as fine rings
    for (let q = 0; q < 4; q++) {
      g.strokeStyle = INKS[q].c;
      g.globalAlpha = 0.16;
      for (let r = 9; r < 110; r += 5.2) {
        g.beginPath();
        g.arc(50, 70, r, ((q * 90 - 135) * Math.PI) / 180, ((q * 90 - 45) * Math.PI) / 180);
        g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
  // light falls from the top left, the foot is in shadow
  const sh = g.createLinearGradient(0, y, 0, y + h);
  sh.addColorStop(0, "rgba(255,255,255,0.16)");
  sh.addColorStop(0.35, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = sh;
  g.fillRect(x, y, w, h);
  g.restore();
  // the keyline, inside the panel
  rr(g, x + 2, y + 2, w - 4, h - 4, 2.8);
  g.strokeStyle = ink >= 0 ? "rgba(18,17,20,0.32)" : "rgba(232,230,224,0.18)";
  g.lineWidth = 0.5;
  g.stroke();
  // the panel's printed edge on the stock
  rr(g, x, y, w, h, 4.2);
  g.strokeStyle = ink >= 0 ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.6)";
  g.lineWidth = 0.6;
  g.stroke();
}

/** A zkSNARK's sigil, mirrored 7 × 7, as the card's printer's mark. */
function sigil(g: CanvasRenderingContext2D, seed: number, cx: number, cy: number, cell: number, fill: string, a: number) {
  const r = mulberry(seed * 2654435761);
  g.fillStyle = fill;
  g.globalAlpha = a;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 4; x++) {
      if (r() >= 0.47) continue;
      for (const xx of x === 3 ? [3] : [x, 6 - x]) g.fillRect(cx - 3.5 * cell + xx * cell + cell * 0.12, cy - 3.5 * cell + y * cell + cell * 0.12, cell * 0.76, cell * 0.76);
    }
  g.globalAlpha = 1;
}

/** The corner index (value over pip), and its twin turned round. */
function corners(g: CanvasRenderingContext2D, c: Card, col: string) {
  const one = () => {
    const x = 12.6,
      y = 17.5;
    g.fillStyle = col;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (c.kind === "num") {
      g.font = `700 17px ${FONT}`;
      g.fillText(String(c.n), x, y + 0.5);
      if (c.n === 6 || c.n === 9) g.fillRect(x - 3.2, y + 8.4, 6.4, 1.2);
    } else if (c.kind === "fees" || c.kind === "shor") {
      g.font = `700 12.5px ${FONT}`;
      g.fillText(c.kind === "fees" ? "+2" : "+4", x, y + 0.5);
    } else if (c.kind === "skip") {
      g.lineWidth = 1.6;
      g.strokeStyle = col;
      rr(g, x - 4.6, y - 4.6, 9.2, 9.2, 1.4);
      g.stroke();
      g.beginPath();
      g.moveTo(x - 6, y + 6);
      g.lineTo(x + 6, y - 6);
      g.stroke();
    } else if (c.kind === "reorg") {
      g.lineWidth = 1.6;
      g.strokeStyle = col;
      g.beginPath();
      g.moveTo(x - 5.5, y - 2.4);
      g.lineTo(x + 4.6, y - 2.4);
      g.moveTo(x + 2, y - 5);
      g.lineTo(x + 4.8, y - 2.4);
      g.lineTo(x + 2, y + 0.2);
      g.moveTo(x + 5.5, y + 3);
      g.lineTo(x - 4.6, y + 3);
      g.moveTo(x - 2, y + 0.4);
      g.lineTo(x - 4.8, y + 3);
      g.lineTo(x - 2, y + 5.6);
      g.stroke();
    } else if (c.kind === "makers") {
      g.fillStyle = col;
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        g.save();
        g.translate(x + Math.cos(a) * 4.2, y + Math.sin(a) * 4.2);
        g.rotate(a + Math.PI / 2);
        rr(g, -2, -2.8, 4, 5.6, 0.8);
        g.fill();
        g.restore();
      }
    } else if (c.kind === "fork") {
      for (let i = 0; i < 4; i++) {
        pipTrace(g, i, x + (i % 2 ? 3.1 : -3.1), y + (i < 2 ? -3.1 : 3.1), 2.8);
        g.fillStyle = INKS[i].c;
        g.fill();
      }
    }
    // the pip under the index
    if (c.ink >= 0) {
      pipTrace(g, c.ink, x, y + 14, 3.6);
      g.fillStyle = col;
      g.fill();
    } else if (c.kind === "shor") {
      for (let i = 0; i < 4; i++) {
        pipTrace(g, i, x - 4.5 + i * 3, y + 13, 1.5);
        g.fillStyle = INKS[i].c;
        g.fill();
      }
    }
  };
  g.save();
  one();
  g.translate(100, 140);
  g.rotate(Math.PI);
  one();
  g.restore();
}

/** The centre art of an action card (in void, on the ink). */
function action(g: CanvasRenderingContext2D, c: Card, ink: string) {
  const deep = c.ink >= 0 ? INKS[c.ink].deep : "#000";
  switch (c.kind) {
    case "skip": {
      // the block that missed: an isometric voxel, struck through; its slot left as a dotted ghost
      g.setLineDash([1.4, 2.2]);
      g.strokeStyle = VOID;
      g.globalAlpha = 0.35;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(50 + 9, 46);
      g.lineTo(50 + 9 + 16, 55);
      g.lineTo(50 + 9 + 16, 73);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      const cx = 46,
        cy = 70,
        s = 17;
      const top = [
          [cx, cy - s],
          [cx + s * 0.95, cy - s * 0.48],
          [cx, cy],
          [cx - s * 0.95, cy - s * 0.48],
        ],
        left = [
          [cx - s * 0.95, cy - s * 0.48],
          [cx, cy],
          [cx, cy + s * 1.05],
          [cx - s * 0.95, cy + s * 0.57],
        ],
        right = [
          [cx + s * 0.95, cy - s * 0.48],
          [cx, cy],
          [cx, cy + s * 1.05],
          [cx + s * 0.95, cy + s * 0.57],
        ];
      const face = (pts: number[][], col: string) => {
        g.beginPath();
        pts.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](x, y));
        g.closePath();
        g.fillStyle = col;
        g.fill();
      };
      face(top, "#38343d");
      face(left, "#1c1a20");
      face(right, VOID);
      // the sigil on its top face
      g.save();
      g.transform(0.95, 0.48, -0.95, 0.48, cx, cy - s);
      sigil(g, 404, 0, s * 0.53 * 1.05, 2.2, ink, 0.85);
      g.restore();
      g.lineWidth = 6.5;
      g.strokeStyle = ink;
      g.beginPath();
      g.moveTo(26, 98);
      g.lineTo(74, 42);
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = VOID;
      g.stroke();
      return;
    }
    case "reorg": {
      // a ring of blocks running both ways: two arcs of four blocks, each with its arrowhead
      const R = 21;
      for (const [a0, a1] of [
        [200, 320],
        [20, 140],
      ]) {
        for (let k = 0; k < 4; k++) {
          const a = ((a0 + ((a1 - a0) * k) / 4) * Math.PI) / 180;
          g.save();
          g.translate(50 + Math.cos(a) * R, 70 + Math.sin(a) * R);
          g.rotate(a);
          rr(g, -3.6, -4.4, 7.2, 8.8, 1.6);
          g.fillStyle = VOID;
          g.globalAlpha = 0.55 + k * 0.15;
          g.fill();
          g.restore();
        }
        g.globalAlpha = 1;
        const a = (a1 * Math.PI) / 180,
          t = a + Math.PI / 2;
        const hx = 50 + Math.cos(a) * R,
          hy = 70 + Math.sin(a) * R;
        g.beginPath();
        g.moveTo(hx + Math.cos(a) * 7.5, hy + Math.sin(a) * 7.5);
        g.lineTo(hx + Math.cos(t) * 9, hy + Math.sin(t) * 9);
        g.lineTo(hx - Math.cos(a) * 7.5, hy - Math.sin(a) * 7.5);
        g.closePath();
        g.fillStyle = VOID;
        g.fill();
      }
      g.beginPath();
      g.arc(50, 70, 5, 0, Math.PI * 2);
      g.fillStyle = VOID;
      g.fill();
      g.beginPath();
      g.arc(50, 70, 2, 0, Math.PI * 2);
      g.fillStyle = ink;
      g.fill();
      return;
    }
    case "fees": {
      dotGlyphs(g, "+2", 50, 64, 5.6, VOID, deep, 0.32, true);
      // two fee chips under it
      for (let k = 0; k < 2; k++) {
        const y = 98 - k * 3.4;
        g.beginPath();
        g.ellipse(50, y, 11, 3.6, 0, 0, Math.PI * 2);
        g.fillStyle = VOID;
        g.fill();
        g.beginPath();
        g.ellipse(50, y - 1, 11, 3.4, 0, 0, Math.PI * 2);
        g.fillStyle = k ? "#2a272e" : "#1d1b20";
        g.fill();
        g.setLineDash([2, 2.4]);
        g.strokeStyle = ink;
        g.lineWidth = 0.9;
        g.beginPath();
        g.ellipse(50, y - 1, 8.4, 2.4, 0, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      return;
    }
    case "makers": {
      // three cards handed round the table
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        g.save();
        g.translate(50 + Math.cos(a) * 15, 70 + Math.sin(a) * 15);
        g.rotate(a + Math.PI / 2);
        rr(g, -6, -8.5, 12, 17, 2);
        g.fillStyle = VOID;
        g.fill();
        sigil(g, 300 + k * 17, 0, 0, 1.5, ink, 0.9);
        g.restore();
        const b0 = a + 0.62,
          b1 = a + 1.48;
        g.beginPath();
        g.arc(50, 70, 23, b0, b1);
        g.strokeStyle = VOID;
        g.lineWidth = 2.2;
        g.stroke();
        const hx = 50 + Math.cos(b1) * 23,
          hy = 70 + Math.sin(b1) * 23,
          t = b1 + Math.PI / 2;
        g.beginPath();
        g.moveTo(hx + Math.cos(b1) * 3.6, hy + Math.sin(b1) * 3.6);
        g.lineTo(hx + Math.cos(t) * 4.6, hy + Math.sin(t) * 4.6);
        g.lineTo(hx - Math.cos(b1) * 3.6, hy - Math.sin(b1) * 3.6);
        g.closePath();
        g.fillStyle = VOID;
        g.fill();
      }
      return;
    }
    case "fork": {
      // one chain, four inks: three blocks up the trunk, then it forks
      g.strokeStyle = "#e8e6e0";
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(50, 106);
      g.lineTo(50, 74);
      g.stroke();
      for (let k = 0; k < 3; k++) {
        rr(g, 45, 99 - k * 10.5, 10, 8, 1.8);
        g.fillStyle = "#e8e6e0";
        g.fill();
        rr(g, 47.2, 101.2 - k * 10.5, 5.6, 3.6, 0.8);
        g.fillStyle = "#1a181d";
        g.fill();
      }
      const tips = [
        [24, 46],
        [40, 36],
        [60, 36],
        [76, 46],
      ];
      tips.forEach(([x, y], i) => {
        g.strokeStyle = INKS[i].c;
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(50, 75);
        g.bezierCurveTo(50, 64, x, y + 16, x, y + 6);
        g.stroke();
        g.save();
        g.shadowColor = INKS[i].c;
        g.shadowBlur = 5;
        pipTrace(g, i, x, y, 6);
        g.fillStyle = INKS[i].c;
        g.fill();
        g.restore();
      });
      g.beginPath();
      g.arc(50, 75, 3.4, 0, Math.PI * 2);
      g.fillStyle = "#e8e6e0";
      g.fill();
      return;
    }
    case "shor": {
      // the dust cloud: four waves interfering, above and below the +4
      for (const [y0, sgn] of [
        [43, 1],
        [97, -1],
      ]) {
        for (let i = 0; i < 4; i++) {
          g.strokeStyle = INKS[i].c;
          g.globalAlpha = 0.7;
          g.lineWidth = 0.9;
          g.beginPath();
          for (let k = 0; k <= 60; k++) {
            const x = 16 + k * 1.13;
            const env = Math.sin((k / 60) * Math.PI);
            const y = y0 + sgn * Math.sin(k * 0.34 + i * 1.3) * 7 * env * (0.6 + i * 0.13);
            g[k ? "lineTo" : "moveTo"](x, y);
          }
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      dotGlyphs(g, "+4", 50, 70, 5.9, "#efeadf", "#e8e6e0", 0.1, false);
      return;
    }
    case "num":
  }
}

function paintFace(c: Card): HTMLCanvasElement {
  const [cv, g] = canvas();
  const wild = c.ink < 0;
  stock(g);
  panel(g, c.ink);
  const ink = wild ? "#e8e6e0" : INKS[c.ink].c;
  const deep = wild ? "#e8e6e0" : INKS[c.ink].deep;
  if (wild) {
    // the four inks round the art, a ring cut in quarters
    for (let q = 0; q < 4; q++) {
      g.beginPath();
      g.arc(50, 70, 33, ((q * 90 - 135 + 7) * Math.PI) / 180, ((q * 90 - 45 - 7) * Math.PI) / 180);
      g.strokeStyle = INKS[q].c;
      g.lineWidth = 2.2;
      g.stroke();
    }
  }
  if (c.kind === "num") dotGlyphs(g, String(c.n), 50, 68, 8.6, VOID, deep, 0.3, true);
  else action(g, c, ink);
  if (c.kind === "num" && (c.n === 6 || c.n === 9)) {
    g.fillStyle = VOID;
    rr(g, 39, 102, 22, 2.4, 1.2);
    g.fill();
  }
  corners(g, c, wild ? "#e8e6e0" : VOID);
  // the printer's mark (a zkSNARK's sigil) and the name along the foot
  const seed = (c.ink + 2) * 31 + (c.kind === "num" ? c.n : 10 + ["skip", "reorg", "fees", "fork", "shor", "makers"].indexOf(c.kind)) * 7;
  sigil(g, seed, 50, 13.5, 1.25, wild ? "#e8e6e0" : VOID, wild ? 0.4 : 0.45);
  const label = c.kind === "num" ? INKS[c.ink].name : { skip: "MISSED BLOCK", reorg: "REORG", fees: "FEES", fork: "FORK", shor: "DUST ATTACK", makers: "SHIELDED HOUR" }[c.kind];
  const zh = c.kind === "num" ? INKS[c.ink].zh : { skip: "漏块", reorg: "重组", fees: "手续费", fork: "分叉", shor: "粉尘攻击", makers: "屏蔽时刻" }[c.kind];
  const name = T(label, zh);
  g.font = `600 ${name.length > 10 ? 5.2 : 6}px ${MONO}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = wild ? "rgba(232,230,224,0.62)" : "rgba(18,17,20,0.66)";
  g.letterSpacing = name.length > 10 ? "0.4px" : "1.2px";
  g.fillText(name, 50, 125.5);
  g.letterSpacing = "0px";
  return cv;
}

/** The back: void stock, a two-ink guilloché rosette, a dot field, the ⓩ mark in a medallion. */
function paintBack(): HTMLCanvasElement {
  const [cv, g] = canvas();
  stock(g, true);
  const x = 5.2,
    y = 5.2,
    w = 89.6,
    h = 129.6;
  g.save();
  rr(g, x, y, w, h, 4.2);
  g.clip();
  const bg = g.createRadialGradient(50, 70, 4, 50, 70, 80);
  bg.addColorStop(0, "#1e1a1f");
  bg.addColorStop(1, "#0b0a0c");
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  // the dot field
  g.fillStyle = "#c4b1fc";
  g.globalAlpha = 0.16;
  g.beginPath();
  for (let j = 0; j < 30; j++)
    for (let i = 0; i < 22; i++) {
      const cx = x + 1 + i * 4.3 + (j % 2) * 2.15,
        cy = y + 1 + j * 4.5;
      g.moveTo(cx + 0.42, cy);
      g.arc(cx, cy, 0.42, 0, Math.PI * 2);
    }
  g.fill();
  g.globalAlpha = 1;
  // the guilloché: two families of epitrochoids, twelve-fold, stretched to the card
  const rose = (col: string, a: number, d0: number, d1: number, n: number, rot: number, sx: number, sy: number) => {
    g.strokeStyle = col;
    g.globalAlpha = a;
    g.lineWidth = 0.32;
    for (let k = 0; k < n; k++) {
      const d = d0 + ((d1 - d0) * k) / Math.max(1, n - 1);
      g.beginPath();
      for (let s = 0; s <= 360; s++) {
        const t = (s / 360) * Math.PI * 2;
        const R = 24,
          r = 2;
        const px0 = (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t + rot);
        const py0 = (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t + rot);
        g[s ? "lineTo" : "moveTo"](50 + px0 * sx, 70 + py0 * sy);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  rose("#ff6b35", 0.5, 6, 11, 4, 0, 1.18, 1.62);
  rose("#c4b1fc", 0.36, 3, 7, 3, Math.PI / 12, 1.0, 1.36);
  // the border wave, all round
  g.strokeStyle = "#ff6b35";
  g.globalAlpha = 0.5;
  g.lineWidth = 0.4;
  for (const o of [0, Math.PI]) {
    g.beginPath();
    rr(g, x + 3.2, y + 3.2, w - 6.4, h - 6.4, 2.6);
    g.stroke();
    g.beginPath();
    const per = 2 * (w - 9) + 2 * (h - 9);
    for (let s = 0; s <= 600; s++) {
      const u = (s / 600) * per;
      let px1: number, py1: number, nx: number, ny: number;
      const W1 = w - 9,
        H1 = h - 9;
      if (u < W1) [px1, py1, nx, ny] = [x + 4.5 + u, y + 4.5, 0, 1];
      else if (u < W1 + H1) [px1, py1, nx, ny] = [x + 4.5 + W1, y + 4.5 + (u - W1), -1, 0];
      else if (u < 2 * W1 + H1) [px1, py1, nx, ny] = [x + 4.5 + W1 - (u - W1 - H1), y + 4.5 + H1, 0, -1];
      else [px1, py1, nx, ny] = [x + 4.5, y + 4.5 + H1 - (u - 2 * W1 - H1), 1, 0];
      const off = 1.6 + Math.sin(u * 1.3 + o) * 1.3;
      g[s ? "lineTo" : "moveTo"](px1 + nx * off, py1 + ny * off);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
  // the medallion and the ⓩ mark (a ring and a Z)
  g.beginPath();
  g.arc(50, 70, 15.5, 0, Math.PI * 2);
  g.fillStyle = "#0d0c0f";
  g.fill();
  g.lineWidth = 0.7;
  g.strokeStyle = "rgba(255,107,53,0.75)";
  g.stroke();
  g.beginPath();
  g.arc(50, 70, 13.6, 0, Math.PI * 2);
  g.lineWidth = 0.35;
  g.strokeStyle = "rgba(232,230,224,0.35)";
  g.stroke();
  drawMark(g, 50, 70, 25, "#efeadf", "#ff6b35");
  // the deck's name, top and (turned) bottom
  g.font = `600 5px ${MONO}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "2px";
  g.fillStyle = "rgba(239,234,223,0.55)";
  g.fillText("LAST SNARK", 51, 18);
  g.save();
  g.translate(100, 140);
  g.rotate(Math.PI);
  g.fillText("LAST SNARK", 51, 18);
  g.restore();
  g.letterSpacing = "0px";
  return cv;
}

// ---- images ---------------------------------------------------------------------------------------

const urls = new Map<string, string>();
function toUrl(cv: HTMLCanvasElement): string {
  // a blob URL (short, cached by the browser), made synchronously from the PNG
  const data = cv.toDataURL("image/png");
  const bin = atob(data.slice(data.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}
const faceKey = (c: Card) => `${c.kind}${c.ink}${c.n}${T("", "z")}`;
/** The face of `c` as an image URL (made once per kind of card and language). */
export function faceUrl(c: Card): string {
  const key = faceKey(c);
  let u = urls.get(key);
  if (!u) urls.set(key, (u = toUrl(paintFace(c))));
  return u;
}
export function backUrl(): string {
  let u = urls.get("back");
  if (!u) urls.set("back", (u = toUrl(paintBack())));
  return u;
}
const pending = new Set<string>();
/** Paint a face ahead of time and encode it off the main thread (so the deal never waits on it). */
export function warmFace(c: Card) {
  const key = faceKey(c);
  if (urls.has(key) || pending.has(key)) return;
  pending.add(key);
  paintFace(c).toBlob((b) => {
    pending.delete(key);
    if (b && !urls.has(key)) urls.set(key, URL.createObjectURL(b));
  }, "image/png");
}
/** A card as HTML (its face, or its back for null). */
export const cardImg = (c: Card | null) => `<img class="lg-img" src="${c ? faceUrl(c) : backUrl()}" alt="" draggable="false">`;

let ready: Promise<void> | null = null;
/** The faces need the type loaded before they are painted (once). */
export function artReady(): Promise<void> {
  if (!ready) {
    const fonts = typeof document !== "undefined" && document.fonts ? Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`600 10px ${MONO}`)]).then(() => undefined) : Promise.resolve();
    ready = Promise.race([fonts.catch(() => undefined), new Promise<void>((r) => setTimeout(r, 1500))]);
  }
  return ready;
}

let grainU = "";
/** The paper grain as a data URL (for CSS: the score sheet, the stamps). */
export function grainUrl(): string {
  return (grainU ||= grain().toDataURL("image/png"));
}
