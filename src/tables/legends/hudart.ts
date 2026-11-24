/**
 * ZK LEGENDS' HUD art, painted once on canvases and handed to the CSS as custom properties on the
 * table's root (`installHudArt`): the same metal-and-lacquer language as the painted cards (paint.ts)
 * and the menus (menus.css): gold trim with a bevel lit from the top left over brushed grain, stepped
 * (voxel) corners, lacquered faces, the Z seal. Nine-slice frames (border-image), the turn banner
 * plaques with their ribbon tails, damage splats, the speech bubble and its tail, the history frame,
 * the end medallion, the swap mark, the coin and pack icons.
 */
import { materialUrl } from "./paint";

type G = CanvasRenderingContext2D;
type Tones = { m0: string; m1: string; m2: string; m3: string };

const GOLD: Tones = { m0: "#4a2e04", m1: "#a8740c", m2: "#f2c64e", m3: "#fff4cc" };
const IRON: Tones = { m0: "#1e1c1a", m1: "#5a5650", m2: "#a8a296", m3: "#ece6d8" };
const BRONZE: Tones = { m0: "#3a2208", m1: "#7e4e1a", m2: "#c88a42", m3: "#f4d6a0" };
const VIOLET: Tones = { m0: "#24123e", m1: "#5a3a9a", m2: "#b494f0", m3: "#efe2ff" };

function cv(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function stepPath(x: number, y: number, w: number, h: number, s: number) {
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

let brushed: HTMLImageElement | null = null;
let grain: HTMLImageElement | null = null;
function tile(kind: "brushed" | "grain"): HTMLImageElement | null {
  const have = kind === "brushed" ? brushed : grain;
  if (have) return have.complete && have.naturalWidth ? have : null;
  const im = new Image();
  im.src = materialUrl(kind);
  if (kind === "brushed") brushed = im;
  else grain = im;
  return im.complete && im.naturalWidth ? im : null;
}

/** A texture over a path (overlay blend), when the tile has decoded. */
function texture(g: G, path: Path2D, kind: "brushed" | "grain", a: number) {
  const t = tile(kind);
  if (!t) return;
  g.save();
  g.clip(path);
  g.globalAlpha = a;
  g.globalCompositeOperation = "overlay";
  g.fillStyle = g.createPattern(t, "repeat")!;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
}

/** A bevel on a path: light along the top-left edges, shade along the bottom-right. */
function bevel(g: G, path: Path2D, w: number, light = 0.6, dark = 0.55) {
  g.save();
  g.clip(path);
  g.lineWidth = w * 2;
  g.translate(w * 0.7, w * 0.7);
  g.strokeStyle = `rgba(255,250,225,${light})`;
  g.stroke(path);
  g.translate(-w * 1.4, -w * 1.4);
  g.strokeStyle = `rgba(0,0,0,${dark})`;
  g.stroke(path);
  g.restore();
}

/** Metal: the four tones down the path, brushed grain, a bevel, a dark hairline round it. */
function metal(g: G, path: Path2D, m: Tones, y0: number, y1: number, bw = 3) {
  g.save();
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, m.m2);
  gr.addColorStop(0.16, m.m3);
  gr.addColorStop(0.36, m.m2);
  gr.addColorStop(0.62, m.m1);
  gr.addColorStop(0.88, m.m0);
  gr.addColorStop(1, m.m1);
  g.fillStyle = gr;
  g.fill(path);
  g.restore();
  texture(g, path, "brushed", 0.6);
  bevel(g, path, bw);
  g.save();
  g.lineWidth = 1.2;
  g.strokeStyle = m.m0;
  g.stroke(path);
  g.restore();
}

/** Lacquer: a deep colour lit from the top, with grain. */
function lacquer(g: G, path: Path2D, x: number, y: number, w: number, h: number, base: string, deep = "#080604") {
  g.save();
  const r = g.createRadialGradient(x + w * 0.38, y - h * 0.1, 2, x + w / 2, y + h / 2, Math.max(w, h) * 0.85);
  r.addColorStop(0, base);
  r.addColorStop(1, deep);
  g.fillStyle = r;
  g.fill(path);
  // a sheen across the top
  const s = g.createLinearGradient(0, y, 0, y + h * 0.45);
  s.addColorStop(0, "rgba(255,255,255,0.10)");
  s.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = s;
  g.fill(path);
  g.restore();
  texture(g, path, "grain", 0.5);
}

/** The pixel Z (7 × 8), centred at (cx, cy), `p` px a cell. */
function pixelZ(g: G, cx: number, cy: number, p: number, col: string) {
  const z = ["#######", "#######", "....###", "...###.", "..###..", ".###...", "#######", "#######"];
  g.fillStyle = col;
  z.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && g.fillRect(Math.round(cx + (x - 3.5) * p), Math.round(cy + (y - 4) * p), Math.ceil(p), Math.ceil(p))));
}

/** The Z seal: a gold coin with a lacquered heart and the pixel Z. */
function seal(g: G, cx: number, cy: number, r: number, m: Tones = GOLD, heart = "#2a1a08") {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = r * 0.3;
  g.shadowOffsetY = r * 0.12;
  g.fillStyle = m.m0;
  g.beginPath();
  g.arc(cx, cy, r + 2, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const rim = new Path2D();
  // a twelve-sided rim (cut like a coin)
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = cx + Math.cos(a) * r,
      y = cy + Math.sin(a) * r;
    if (i) rim.lineTo(x, y);
    else rim.moveTo(x, y);
  }
  rim.closePath();
  metal(g, rim, m, cy - r, cy + r, Math.max(2, r * 0.08));
  const inner = new Path2D();
  inner.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  lacquer(g, inner, cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44, heart, "#050302");
  g.save();
  g.lineWidth = Math.max(1, r * 0.05);
  g.strokeStyle = "rgba(0,0,0,0.7)";
  g.stroke(inner);
  g.restore();
  pixelZ(g, cx, cy, r * 0.13, m.m2);
  pixelZ(g, cx - r * 0.02, cy - r * 0.03, r * 0.13, m.m3);
}

// ---- nine-slice frames ------------------------------------------------------------------------------------

/**
 * A frame for border-image: N × N, slice `k` (the corners keep their stepped shape at any size).
 * `face`: the lacquer inside (null: hollow, for frames over pictures).
 */
function frame(m: Tones, face: string | null, N = 96, s = 8, deep = "#070503") {
  const [c, g] = cv(N, N);
  const outer = stepPath(1, 1, N - 2, N - 2, s);
  metal(g, outer, m, 0, N, 2.5);
  // the groove
  const groove = stepPath(9, 9, N - 18, N - 18, s - 3);
  g.fillStyle = m.m0;
  g.fill(groove);
  // the inner lip, lit from below (a recess)
  const lip = stepPath(11, 11, N - 22, N - 22, s - 4);
  g.save();
  const gr = g.createLinearGradient(0, 11, 0, N - 11);
  gr.addColorStop(0, m.m1);
  gr.addColorStop(0.5, m.m2);
  gr.addColorStop(1, m.m3);
  g.fillStyle = gr;
  g.fill(lip);
  g.restore();
  const hole = stepPath(14, 14, N - 28, N - 28, Math.max(2, s - 5));
  if (face) lacquer(g, hole, 14, 14, N - 28, N - 28, face, deep);
  else {
    g.save();
    g.globalCompositeOperation = "destination-out";
    g.fill(hole);
    g.restore();
  }
  // studs in the corners
  for (const [x, y] of [
    [5, 5],
    [N - 8, 5],
    [5, N - 8],
    [N - 8, N - 8],
  ]) {
    g.fillStyle = m.m0;
    g.fillRect(x - 1, y - 1, 5, 5);
    g.fillStyle = m.m3;
    g.fillRect(x, y, 2, 2);
  }
  return c.toDataURL();
}

/** A thin frame (name plates, chips, notes): 48 × 48, slice 14. */
function thinFrame(m: Tones, face: string, N = 48) {
  const [c, g] = cv(N, N);
  const outer = stepPath(1, 1, N - 2, N - 2, 4);
  metal(g, outer, m, 0, N, 1.6);
  const hole = stepPath(6, 6, N - 12, N - 12, 2);
  g.fillStyle = m.m0;
  g.fill(stepPath(5, 5, N - 10, N - 10, 2));
  lacquer(g, hole, 6, 6, N - 12, N - 12, face);
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,215,106,0.22)";
  g.stroke(stepPath(9, 9, N - 18, N - 18, 1));
  g.restore();
  return c.toDataURL();
}

// ---- the banner plaques -----------------------------------------------------------------------------------

/** The turn banner: a lacquered plaque in gold (or violet, iron), ribbon tails behind, the Z seal on top. 1200 × 340. */
function banner(m: Tones, ribbon: [string, string, string], face: string) {
  const W = 1200,
    H = 340;
  const [c, g] = cv(W, H);
  const top = 92,
    bot = 290,
    x0 = 170,
    x1 = W - 170;
  // ribbon tails, behind
  for (const dir of [-1, 1]) {
    g.save();
    if (dir > 0) {
      g.translate(W, 0);
      g.scale(-1, 1);
    }
    const tail = poly([
      [30, top + 40],
      [x0 + 60, top + 40],
      [x0 + 60, bot - 20],
      [30, bot - 20],
      [84, (top + 40 + bot - 20) / 2],
    ]);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 18;
    g.shadowOffsetY = 8;
    const rg = g.createLinearGradient(0, top + 40, 0, bot - 20);
    rg.addColorStop(0, ribbon[2]);
    rg.addColorStop(0.35, ribbon[1]);
    rg.addColorStop(1, ribbon[0]);
    g.fillStyle = rg;
    g.fill(tail);
    g.restore();
    texture(g, tail, "grain", 0.45);
    bevel(g, tail, 3, 0.35, 0.5);
    // the fold where it goes behind the plaque
    const fold = poly([
      [x0 + 10, top + 40],
      [x0 + 60, top + 22],
      [x0 + 60, bot - 2],
      [x0 + 10, bot - 20],
    ]);
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fill(fold);
    // stitched edges
    g.setLineDash([7, 6]);
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255,235,200,0.35)";
    g.beginPath();
    g.moveTo(40, top + 52);
    g.lineTo(x0 + 10, top + 52);
    g.moveTo(40, bot - 32);
    g.lineTo(x0 + 10, bot - 32);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }
  // the plaque
  g.save();
  g.shadowColor = "rgba(0,0,0,0.75)";
  g.shadowBlur = 30;
  g.shadowOffsetY = 14;
  g.fillStyle = m.m0;
  g.fill(stepPath(x0, top, x1 - x0, bot - top, 18));
  g.restore();
  const plate = stepPath(x0, top, x1 - x0, bot - top, 18);
  metal(g, plate, m, top, bot, 5);
  g.fillStyle = m.m0;
  g.fill(stepPath(x0 + 18, top + 18, x1 - x0 - 36, bot - top - 36, 12));
  const face2 = stepPath(x0 + 22, top + 22, x1 - x0 - 44, bot - top - 44, 11);
  lacquer(g, face2, x0 + 22, top + 22, x1 - x0 - 44, bot - top - 44, face);
  // an engraved line inside, and pixel brackets at the corners
  g.save();
  g.lineWidth = 2;
  g.strokeStyle = `${m.m2}55`;
  g.stroke(stepPath(x0 + 34, top + 34, x1 - x0 - 68, bot - top - 68, 7));
  g.restore();
  const br = (x: number, y: number, sx: number, sy: number) => {
    g.fillStyle = m.m3;
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [0, 2],
    ])
      g.fillRect(x + a * 6 * sx, y + b * 6 * sy, 6 * sx, 6 * sy);
  };
  br(x0 + 42, top + 42, 1, 1);
  br(x1 - 42, top + 42, -1, 1);
  br(x0 + 42, bot - 42, 1, -1);
  br(x1 - 42, bot - 42, -1, -1);
  // side gems
  for (const x of [x0 + 2, x1 - 2]) {
    const d = poly([
      [x, (top + bot) / 2 - 26],
      [x + 18, (top + bot) / 2],
      [x, (top + bot) / 2 + 26],
      [x - 18, (top + bot) / 2],
    ]);
    metal(g, d, m, (top + bot) / 2 - 26, (top + bot) / 2 + 26, 2);
    const core = poly([
      [x, (top + bot) / 2 - 14],
      [x + 9, (top + bot) / 2],
      [x, (top + bot) / 2 + 14],
      [x - 9, (top + bot) / 2],
    ]);
    g.fillStyle = ribbon[1];
    g.fill(core);
  }
  // the seal on the top edge
  seal(g, W / 2, top + 4, 62, m);
  return c.toDataURL();
}

// ---- splats, bubble, marks, icons --------------------------------------------------------------------------

/** A jagged burst, bevelled: the damage number's ground. */
function splat(c0: string, c1: string, c2: string, N = 160) {
  const [c, g] = cv(N, N);
  const cx = N / 2,
    cy = N / 2;
  const pts: [number, number][] = [];
  const spikes = 11;
  for (let i = 0; i < spikes * 2; i++) {
    const a = -Math.PI / 2 + ((i + ((i * 5) % 3) * 0.18) / (spikes * 2)) * Math.PI * 2;
    const r = (i % 2 ? 0.27 + ((i * 3) % 4) * 0.012 : 0.48 - ((i * 7) % 5) * 0.022) * N;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const p = poly(pts);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = c0;
  g.fill(p);
  g.restore();
  const r = g.createRadialGradient(cx - N * 0.08, cy - N * 0.1, 4, cx, cy, N * 0.48);
  r.addColorStop(0, c2);
  r.addColorStop(0.45, c1);
  r.addColorStop(1, c0);
  g.fillStyle = r;
  g.fill(p);
  bevel(g, p, 4, 0.55, 0.6);
  g.save();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.stroke(p);
  g.restore();
  // an inner burst, lighter
  const q: [number, number][] = pts.map(([x, y]) => [cx + (x - cx) * 0.55, cy + (y - cy) * 0.55]);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fill(poly(q));
  return c.toDataURL();
}

/** Parchment for the speech bubbles (nine-slice 72, slice 22). */
function parchment() {
  const N = 72;
  const [c, g] = cv(N, N);
  const outer = stepPath(1, 1, N - 2, N - 2, 5);
  metal(g, outer, GOLD, 0, N, 1.6);
  const face = stepPath(6, 6, N - 12, N - 12, 3);
  const r = g.createLinearGradient(0, 6, 0, N - 6);
  r.addColorStop(0, "#f5ead0");
  r.addColorStop(1, "#d8c39a");
  g.fillStyle = r;
  g.fill(face);
  texture(g, face, "grain", 0.55);
  g.save();
  g.clip(face);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(120,80,30,${0.03 + ((i * 13) % 7) / 120})`;
    g.fillRect((i * 37) % N, (i * 53) % N, 2, 2);
  }
  g.restore();
  return c.toDataURL();
}
/** The bubble's tail, pointing right (towards the hero). 40 × 36. */
function tail() {
  const [c, g] = cv(40, 36);
  const p = poly([
    [0, 4],
    [38, 18],
    [0, 32],
  ]);
  g.fillStyle = GOLD.m1;
  g.fill(p);
  const q = poly([
    [0, 9],
    [28, 18],
    [0, 27],
  ]);
  g.fillStyle = "#e2d0a8";
  g.fill(q);
  return c.toDataURL();
}

/** The history's frame: a square of bronze or gold round a picture (hollow), 104 × 104. */
function logFrame(m: Tones) {
  const N = 104;
  const [c, g] = cv(N, N);
  const outer = stepPath(2, 2, N - 4, N - 4, 9);
  metal(g, outer, m, 0, N, 3);
  g.fillStyle = m.m0;
  g.fill(stepPath(12, 12, N - 24, N - 24, 5));
  g.save();
  g.globalCompositeOperation = "destination-out";
  g.fill(stepPath(15, 15, N - 30, N - 30, 4));
  g.restore();
  // an inner shadow over the picture's edge
  g.save();
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.stroke(stepPath(18, 18, N - 36, N - 36, 3));
  g.restore();
  return c.toDataURL();
}

/** The end screen's medallion round a face: hollow octagon of gold, 300 × 300 (border-image slice 30%). */
function medallion(m: Tones) {
  const N = 300;
  const [c, g] = cv(N, N);
  const oct = (r: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
      pts.push([N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r]);
    }
    return poly(pts);
  };
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 20;
  g.fillStyle = m.m0;
  g.fill(oct(146));
  g.restore();
  metal(g, oct(146), m, 4, N - 4, 5);
  g.fillStyle = m.m0;
  g.fill(oct(122));
  const inner = oct(116);
  const gr = g.createLinearGradient(0, 30, 0, N - 30);
  gr.addColorStop(0, m.m1);
  gr.addColorStop(1, m.m3);
  g.fillStyle = gr;
  g.fill(inner);
  g.save();
  g.globalCompositeOperation = "destination-out";
  g.fill(oct(108));
  g.restore();
  // rivets
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = N / 2 + Math.cos(a) * 134,
      y = N / 2 + Math.sin(a) * 134;
    g.fillStyle = m.m0;
    g.fillRect(x - 5, y - 5, 10, 10);
    g.fillStyle = m.m3;
    g.fillRect(x - 3, y - 3, 4, 4);
  }
  return c.toDataURL();
}

/** A red brush cross (the mulligan's "send it back"). 200 × 200. */
function cross() {
  const [c, g] = cv(200, 200);
  g.lineCap = "square";
  for (const [a, b, x, y] of [
    [30, 30, 170, 170],
    [170, 30, 30, 170],
  ] as [number, number, number, number][]) {
    g.save();
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 8;
    g.shadowOffsetY = 4;
    g.strokeStyle = "#5a0a10";
    g.lineWidth = 34;
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(x, y);
    g.stroke();
    g.restore();
    const gr = g.createLinearGradient(a, b, x, y);
    gr.addColorStop(0, "#ff6a5a");
    gr.addColorStop(0.5, "#e0242e");
    gr.addColorStop(1, "#a0101a");
    g.strokeStyle = gr;
    g.lineWidth = 24;
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(x, y);
    g.stroke();
    g.strokeStyle = "rgba(255,220,210,0.45)";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(a + 6, b - 4 * Math.sign(y - b));
    g.lineTo(x + 6, y - 4 * Math.sign(y - b));
    g.stroke();
  }
  return c.toDataURL();
}

/** A gold rule ending in a pixel diamond (title ornaments), pointing right. 180 × 22. */
function rule() {
  const [c, g] = cv(180, 22);
  const gr = g.createLinearGradient(0, 0, 150, 0);
  gr.addColorStop(0, "rgba(192,138,20,0)");
  gr.addColorStop(1, "#e8b440");
  g.fillStyle = gr;
  g.fillRect(0, 9, 152, 2);
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.fillRect(0, 11, 152, 2);
  const d = poly([
    [166, 1],
    [178, 11],
    [166, 21],
    [154, 11],
  ]);
  metal(g, d, GOLD, 1, 21, 1.5);
  g.fillStyle = GOLD.m3;
  g.fillRect(140, 8, 4, 4);
  g.fillRect(132, 8, 3, 3);
  return c.toDataURL();
}

function coinIcon() {
  const [c, g] = cv(64, 64);
  seal(g, 32, 32, 26);
  return c.toDataURL();
}
function packIcon() {
  const [c, g] = cv(64, 64);
  const p = stepPath(12, 4, 40, 56, 4);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.fillStyle = "#1a0d2a";
  g.fill(p);
  g.restore();
  lacquer(g, p, 12, 4, 40, 56, "#5a2a9a", "#140a26");
  metal(g, stepPath(12, 4, 40, 7, 2), GOLD, 4, 11, 1);
  metal(g, stepPath(12, 53, 40, 7, 2), GOLD, 53, 60, 1);
  seal(g, 32, 32, 11);
  return c.toDataURL();
}


/** A ZEC crystal (Hearthstone's mana gem): a cut hexagon, facets lit from the top left, in a thin rim. */
function crystal(face: [string, string, string, string], rim: Tones) {
  const [c, g] = cv(64, 72);
  const cx = 32,
    cy = 36;
  const R = 26;
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R * 1.18]);
  }
  const outer = poly(pts.map(([x, y]) => [cx + (x - cx) * 1.16, cy + (y - cy) * 1.12] as [number, number]));
  g.save();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowBlur = 4;
  g.shadowOffsetY = 2;
  g.fillStyle = rim.m0;
  g.fill(outer);
  g.restore();
  metal(g, outer, rim, 2, 70, 1.5);
  // facets: a small table in the middle, six panels round it
  const inner: [number, number][] = pts.map(([x, y]) => [cx + (x - cx) * 0.42, cy - 3 + (y - cy) * 0.42]);
  const shades = [face[3], face[2], face[1], face[0], face[1], face[2]];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    g.fillStyle = shades[i];
    g.fill(poly([pts[i], pts[j], inner[j], inner[i]]));
  }
  g.fillStyle = face[2];
  g.fill(poly(inner));
  // the table's glint
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.fill(poly([inner[5], inner[0], [inner[0][0] - 2, inner[0][1] + 5], [inner[5][0] + 3, inner[5][1] + 2]]));
  g.lineWidth = 1;
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.stroke(poly(pts));
  return c.toDataURL();
}

/** The round brass button the gear sits in. */
function knob() {
  const [c, g] = cv(96, 96);
  const o = new Path2D();
  o.arc(48, 48, 44, 0, Math.PI * 2);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.65)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.fillStyle = GOLD.m0;
  g.fill(o);
  g.restore();
  metal(g, o, GOLD, 4, 92, 2.5);
  const i = new Path2D();
  i.arc(48, 48, 35, 0, Math.PI * 2);
  lacquer(g, i, 13, 13, 70, 70, "#3a2a1a", "#0c0805");
  g.save();
  g.clip(i);
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.arc(49, 51, 35, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  return c.toDataURL();
}


/** The table's pointer: a pixel arrow in gold with a dark edge (2 px a pixel). */
function cursor() {
  const rows = [
    "X...........",
    "XX..........",
    "XOX.........",
    "XOOX........",
    "XOOOX.......",
    "XOOOOX......",
    "XOOOOOX.....",
    "XOOOOOOX....",
    "XOOOOOOOX...",
    "XOOOOOOOOX..",
    "XOOOOOOOOOX.",
    "XOOOOOOXXXXX",
    "XOOOXOOX....",
    "XOOXXOOX....",
    "XOX..XOOX...",
    "XX...XOOX...",
    "X.....XOOX..",
    "......XOOX..",
    ".......XX...",
  ];
  const [c, g] = cv(32, 40);
  const P = 2;
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === ".") return;
      // gold lit from the top left: lighter near the tip and the left edge
      const k = (x + y * 0.6) / 14;
      g.fillStyle = ch === "X" ? "#1a0e02" : k < 0.35 ? GOLD.m3 : k < 0.75 ? GOLD.m2 : GOLD.m1;
      g.fillRect(x * P, y * P, P, P);
    }),
  );
  return c.toDataURL();
}

// ---- install ---------------------------------------------------------------------------------------------

let urls: Record<string, string> | null = null;

function paintAll(): Record<string, string> {
  return {
    "--brushed": `url(${materialUrl("brushed")})`,
    "--grain": `url(${materialUrl("grain")})`,
    "--hud-frame": `url(${frame(GOLD, "#3a2610")})`,
    "--hud-frame-go": `url(${frame(GOLD, "#1f5a2a", 96, 8, "#06140a")})`,
    "--hud-frame-red": `url(${frame(GOLD, "#7a1a14", 96, 8, "#1a0504")})`,
    "--hud-frame-iron": `url(${frame(IRON, "#2a2824")})`,
    "--hud-frame-violet": `url(${frame(VIOLET, "#2a1844", 96, 8, "#08040e")})`,
    "--hud-frame-hollow": `url(${frame(GOLD, null)})`,
    "--hud-thin": `url(${thinFrame(GOLD, "#2a1c0e")})`,
    "--hud-thin-bronze": `url(${thinFrame(BRONZE, "#22160c")})`,
    "--hud-thin-iron": `url(${thinFrame(IRON, "#1e1c1a")})`,
    "--hud-banner": `url(${banner(GOLD, ["#5a0a10", "#b8202a", "#ff6a5a"], "#3a2610")})`,
    "--hud-banner-violet": `url(${banner(VIOLET, ["#1a0a3a", "#5a2ab0", "#b494f0"], "#24143a")})`,
    "--hud-banner-iron": `url(${banner(IRON, ["#141414", "#3a3836", "#7a7670"], "#22201c")})`,
    "--hud-splat": `url(${splat("#8a3a02", "#f0a010", "#fff2a0")})`,
    "--hud-splat-heal": `url(${splat("#0a3a12", "#2aa83a", "#b8ffb0")})`,
    "--hud-parchment": `url(${parchment()})`,
    "--hud-tail": `url(${tail()})`,
    "--hud-log": `url(${logFrame(GOLD)})`,
    "--hud-log-foe": `url(${logFrame(BRONZE)})`,
    "--hud-medal": `url(${medallion(GOLD)})`,
    "--hud-medal-iron": `url(${medallion(IRON)})`,
    "--hud-cross": `url(${cross()})`,
    "--hud-coin": `url(${coinIcon()})`,
    "--hud-rule": `url(${rule()})`,
    "--hud-pack": `url(${packIcon()})`,
    "--hud-zec-on": `url(${crystal(["#7a4a04", "#c8860c", "#f4b728", "#fff0b0"], GOLD)})`,
    "--hud-zec-extra": `url(${crystal(["#0e4a18", "#2a9a3a", "#7ee08a", "#e0ffd8"], GOLD)})`,
    "--hud-zec-off": `url(${crystal(["#0c0a08", "#1a1612", "#2a241c", "#3a3226"], BRONZE)})`,
    "--hud-knob": `url(${knob()})`,
    "--hud-cursor": `url(${cursor()})`,
  };
}

/**
 * Paint the HUD's art (once) and set it on the table's root as CSS custom properties. The grain
 * tiles are images: when they had not decoded yet, everything is painted again once they have.
 */
export function installHudArt(root: HTMLElement) {
  const set = (u: Record<string, string>) => {
    for (const [k, v] of Object.entries(u)) root.style.setProperty(k, v);
  };
  if (urls) return set(urls);
  urls = paintAll();
  set(urls);
  const b = tile("brushed"),
    gr = tile("grain");
  if (!b || !gr) {
    const again = () => {
      if (!tile("brushed") || !tile("grain")) return;
      urls = paintAll();
      set(urls);
    };
    brushed?.addEventListener("load", again, { once: true });
    grain?.addEventListener("load", again, { once: true });
  }
}
