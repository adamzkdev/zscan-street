/**
 * BLOCK BARONS: the print shop. Everything on the table that is printed or painted: the spaces
 * (cream card stock, a printed district band, condensed type, a pixel icon, the price), the board's
 * middle (a void field with a dot-grid print, the deck spots, the ⓩ wordmark), the card backs, the
 * ivory dice, the clay credit chips and their stacks, the owners' portrait coins and the rubber
 * stamp of collateral. Canvas only; view3d.ts puts them on the board.
 *
 * Type: "BB Cond" (Barlow Condensed, OFL, in ./fonts) for names and numbers, Geist for prose,
 * Geist Mono for figures. `fontsReady()` resolves once the display face can paint a canvas.
 */
import { drawMark } from "../../party/theme";
import { GROUPS, SPACES, type Space } from "./board";

export const DISPLAY = '"BB Cond", "Barlow Condensed", "Arial Narrow", Geist, sans-serif';
export const FONT = "Geist, Roboto, ui-sans-serif, system-ui, sans-serif";
export const MONO = '"Geist Mono", "JetBrains Mono", ui-monospace, monospace';
/** Print ink: a warm black, never pure. */
export const INK = "#1d1a17";
/** Card stock. */
export const PAPER = "#ece4d3";
export const VOIDC = "#141211";
export const FLARE = "#ff6b35";
export const LILAC = "#c4b1fc";
/** Inks that hold on cream paper (the palette's tints are too light to print text with). */
const PRINT_LILAC = "#7a62d6";
const PRINT_FLARE = "#e2521c";
const PRINT_SAGE = "#3f8a5a";

let fontsP: Promise<void> | null = null;
/** The display face, loaded for canvas painting (or given up on after a moment). */
export function fontsReady(): Promise<void> {
  fontsP ??= Promise.race([
    Promise.all(["800 40px", "700 40px", "600 40px"].map((w) => document.fonts.load(`${w} "BB Cond"`))).then(() => undefined),
    new Promise<void>((r) => setTimeout(r, 2500)),
  ]).catch(() => undefined);
  return fontsP;
}

/** 12 × 12 pixel icons. '#' ink, 'w' white, 'g' the district's colour, 'o' flare, 'b' glacier, 's' sage, 'l' lilac. */
const ICONS: Record<string, string[]> = {
  genesis: ["....####....", "..##oooo##..", "##oooooooo##", "#w##oooo##w#", "#www####www#", "#wwww##wwww#", "#wwww##wwww#", "#wwww##wwww#", "#wwww##wwww#", "##www##www##", "..##w##w##..", "....####...."],
  falls: ["............", "##########..", "#bbbbbbbb#..", "..bwbbwbb...", "..bbwbbwb...", "..bwbbwbb...", "..bbwbbwb...", "..bwbbwbb...", ".bbbbbbbbbb.", "bwbbwbbwbbwb", "bbbbbbbbbbbb", "............"],
  creek: ["............", "............", ".bb...bb....", "b..b.b..b.b.", "....b....b..", "............", ".bb...bb....", "b..b.b..b.b.", "....b....b..", "............", "ssss....ssss", "............"],
  woods: [".....ss.....", "....ssss....", "...ssssss...", "....ssss....", "...ssssss...", "..ssssssss..", "...ssssss...", "..ssssssss..", ".ssssssssss.", ".....##.....", ".....##.....", "....####...."],
  pin: ["....oooo....", "...oooooo...", "..oooooooo..", "..ooowwooo..", "..oowwwwoo..", "..ooowwooo..", "..oooooooo..", "...oooooo...", "....oooo....", ".....oo.....", ".....oo.....", "...######..."],
  note: ["....#######.", "....#######.", "....#.....#.", "....#.....#.", "....#.....#.", "....#.....#.", "....#.....#.", "..###...###.", ".####..####.", ".####..####.", "..##....##..", "............"],
  coffee: ["...w..w.....", "....w..w....", "...w..w.....", "............", ".########...", ".#oooooo####", ".#oooooo#..#", ".#oooooo#..#", ".#oooooo####", "..#oooo#....", "...####.....", "############"],
  film: ["############", "#w##w##w##w#", "############", "............", "############", "#gggggggggg#", "#ggwwggggggg", "#ggwwwwggggg", "#ggwwggggggg", "#gggggggggg#", "############", "............"],
  bag: ["....####....", "...#....#...", "...#....#...", ".##########.", ".#gggggggg#.", ".#gggggggg#.", ".#ggwwwwgg#.", ".#gggggggg#.", ".#gggggggg#.", ".#gggggggg#.", ".##########.", "............"],
  hotel: ["..########..", "..#wwwwww#..", "..#w#ww#w#..", "..#w####w#..", "..#w#ww#w#..", "..#wwwwww#..", "..#gwgwgw#..", "..#wgwgwg#..", "..#gwgwgw#..", "..#ww##ww#..", "..#ww##ww#..", "############"],
  torch: [".....o......", "....ooo.....", "...ooooo....", "...oowoo....", "....ooo.....", "..########..", "...######...", "....####....", ".....##.....", ".....##.....", ".....##.....", "....####...."],
  museum: [".....##.....", "...######...", ".##########.", "############", "............", ".#..#..#..#.", ".#..#..#..#.", ".#..#..#..#.", ".#..#..#..#.", "............", ".##########.", "############"],
  spec: [".....##.....", ".....##.....", "....####....", "....#gg#....", "....####....", "....#gg#....", "....####....", "...#gggg#...", "...######...", "...#gggg#...", "..########..", "############"],
  flag: ["..#.........", "..#ww##ww##.", "..#ww##ww##.", "..###ww##ww.", "..###ww##ww.", "..#ww##ww##.", "..#ww##ww##.", "..#.........", "..#.........", "..#.........", "..#.........", ".###........"],
  stadium: ["............", "............", "...######...", ".##wwwwww##.", "#wwggggggww#", "#wggwwwwggw#", "#wwggggggww#", "##.######.##", "#..........#", "#..........#", "############", "............"],
  cap: ["............", ".....##.....", "...######...", ".##########.", "############", ".##########.", "...######..#", "...#gggg#..#", "...#gggg#..#", "....####..##", "..........##", "............"],
  arena: ["............", "............", "############", "#w#w#w#w#w##", "############", "#gg#gg#gg#g#", "############", "#w..w..w..w#", "#w..w..w..w#", "############", "............", "............"],
  needle: [".....#......", ".....#......", ".....#......", "....###.....", "...#####....", "....#g#.....", "....#g#.....", "....#g#.....", "...##g##....", "...#ggg#....", "..##ggg##...", ".#########.."],
  tower: ["....####....", "....#oo#....", "...######...", "...#o#o##...", "...######...", "...#o#o##...", "...######...", "...#o#o##...", "...######...", "...#o#o##...", "..########..", "############"],
  vault: ["############", "#..........#", "#...####...#", "#..#....#..#", "#.#..##..#.#", "#.#.#oo#.#.#", "#.#.#oo#.#.#", "#.#..##..#.#", "#..#....#..#", "#...####...#", "#..........#", "############"],
  heli: ["............", "...######...", ".##......##.", ".#.##..##.#.", "#..##..##..#", "#..######..#", "#..######..#", "#..##..##..#", ".#.##..##.#.", ".##......##.", "...######...", "............"],
  mark: ["...######...", ".##......##.", ".#...oo...#.", "#..oooooo..#", "#......oo..#", "#.....oo...#", "#....oo....#", "#...oo.....#", "#..oooooo..#", ".#...oo...#.", ".##......##.", "...######..."],
  burj: ["....#.......", "....##......", "....#w#.....", "....#ww#....", "....#www#...", "....#wwww#..", "....#wwwww#.", "....#wwwww#.", "....#wwww#..", "....#www#...", "....####....", "..########.."],
  train: ["..########..", ".#oooooooo#.", ".#ww#oo#ww#.", ".#ww#oo#ww#.", ".#oooooooo#.", ".#oooooooo#.", ".#o##oo##o#.", ".#oooooooo#.", "..########..", "...#....#...", "..#......#..", "############"],
  pick: ["...######...", ".##oooooo##.", "#oo..##..oo#", "#o...##...o#", ".....##.....", ".....##.....", ".....##.....", ".....##.....", ".....##.....", ".....##.....", ".....##.....", "............"],
  parcel: ["............", "..########..", ".#oooooooo#.", "############", "#oooo##oooo#", "#oooo##oooo#", "#oooo##oooo#", "#oooo##oooo#", "#oooooooooo#", "############", "............", "............"],
  mempool: ["..########..", "..#oooooo#..", "..########..", ".##########.", ".#wwwwwwww#.", ".##########.", "############", "#oooooooooo#", "############", "............", "............", "............"],
  qip: ["....####....", "...#wwww#...", "...#w##w#...", "...#wwww#...", "############", "#llll##llll#", "#llllllllll#", "#llllllllll#", "#llllllllll#", "#llllllllll#", "############", "............"],
  fee: [".....o......", "....oo......", "....ooo.....", "...oooo.o...", "...ooooooo..", "..ooowooooo.", "..oowwwoooo.", ".oowwwwwooo.", ".oowwwwwwoo.", "..owwwwwwo..", "...oooooo...", "............"],
  sig: ["............", "..........oo", ".........oo.", "........oo..", ".......oo...", "##....oo....", ".##..oo.....", "..####......", "...##.......", "............", "############", "............"],
  jail: ["############", "#..#..#..#.#", "#..#..#..#.#", "#..#..#..#.#", "#..#..#..#.#", "############", "#..#..#..#.#", "#..#..#..#.#", "#..#..#..#.#", "#..#..#..#.#", "############", "............"],
  park: ["..ss........", ".ssss.......", "ssssss......", ".ssss.......", "..##........", "..##.#######", "..##.#.....#", "..##.#######", "..##.#.....#", "..##.#######", "..##.#.....#", "############"],
  raid: ["......####..", ".....####...", "....####....", "...####.....", "..########..", ".....####...", "....####....", "...####.....", "..###.......", ".##.........", "#...........", "............"],
  miner: ["............", "..########..", "..#oooooo#..", "..#o####o#..", "..#oooooo#..", "..########..", "...#....#...", "..########..", "..#gggggg#..", "..#gggggg#..", "..########..", "............"],
  foundry: [".........##.", ".........##.", "..####...##.", "..#oo#..###.", "############", "#oo#oo#oo#o#", "#oo#oo#oo#o#", "############", "#gggggggggg#", "#gg####gggg#", "#gg#..#gggg#", "############"],
};

export function iconNames() {
  return Object.keys(ICONS);
}

/** Paint an icon, `px` per pixel, its top-left at (x, y). */
export function drawIcon(g: CanvasRenderingContext2D, name: string, x: number, y: number, px: number, groupColor = FLARE, ink = INK) {
  const rows = ICONS[name] ?? ICONS.genesis;
  const pal: Record<string, string> = { "#": ink, w: "#ffffff", g: groupColor, o: FLARE, b: "#3d9fd6", s: "#4f9e6a", l: "#9d86f0" };
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === ".") continue;
      g.fillStyle = pal[ch] ?? ink;
      g.fillRect(Math.round(x + c * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
}

/** An icon as a data URL (for the HUD). */
const iconCache = new Map<string, string>();
export function iconURL(name: string, color = FLARE, ink = INK, px = 4) {
  const k = `${name}|${color}|${ink}|${px}`;
  let u = iconCache.get(k);
  if (!u) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 12 * px;
    drawIcon(cv.getContext("2d")!, name, 0, 0, px, color, ink);
    u = cv.toDataURL();
    iconCache.set(k, u);
  }
  return u;
}


// ---- paper ---------------------------------------------------------------------------------------

let grainCv: HTMLCanvasElement | null = null;
/** A tile of paper grain: speckles and short fibres, light and dark (shared). */
function grain() {
  if (grainCv) return grainCv;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(256, 256);
  let s = 1234567;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 256 * 256; i++) {
    const v = r();
    const k = v < 0.5 ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = k;
    img.data[i * 4 + 3] = Math.floor(Math.pow(Math.abs(v - 0.5) * 2, 3) * 70);
  }
  g.putImageData(img, 0, 0);
  g.lineCap = "round";
  for (let k = 0; k < 90; k++) {
    g.strokeStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.09)";
    g.lineWidth = 0.6 + r();
    const x = r() * 256,
      y = r() * 256,
      a = r() * Math.PI,
      l = 4 + r() * 12;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  grainCv = cv;
  return cv;
}
/** Fill with a colour and lay the grain over it (`k`: how strong). */
export function paperFill(g: CanvasRenderingContext2D, w: number, h: number, color: string, k = 1) {
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const p = g.createPattern(grain(), "repeat")!;
  g.save();
  g.globalAlpha = 0.55 * k;
  g.fillStyle = p;
  g.fillRect(0, 0, w, h);
  g.restore();
}
/** Printed halftone: a dot screen over a band (a hint of offset printing). */
function halftone(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, a: number, step = 7) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = color;
  g.globalAlpha = a;
  for (let yy = y; yy < y + h + step; yy += step)
    for (let xx = x + (Math.round((yy - y) / step) % 2 ? step / 2 : 0); xx < x + w + step; xx += step) {
      g.beginPath();
      g.arc(xx, yy, step * 0.26, 0, Math.PI * 2);
      g.fill();
    }
  g.restore();
}

/** "#rrggbb" with an alpha. */
export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** A colour darkened (k < 1) or lightened toward white (k > 1). */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1));
  const r = f((n >> 16) & 255),
    gg = f((n >> 8) & 255),
    b = f(n & 255);
  return `#${((1 << 24) | (Math.min(255, r) << 16) | (Math.min(255, gg) << 8) | Math.min(255, b)).toString(16).slice(1)}`;
}

/** Condensed caps that shrink to fit `w`, on up to two balanced lines. */
function fitText(g: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, size: number, weight = 800, color = INK, lines = 2, font = DISPLAY, track = 0.01) {
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const words = s.split(" ");
  let rows: string[] = [s];
  g.font = `${weight} ${size}px ${font}`;
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(size * track).toFixed(1)}px`;
  if (g.measureText(s).width > w && words.length > 1 && lines > 1) {
    let best = 1,
      bw = Infinity;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(" "),
        b = words.slice(k).join(" ");
      const m = Math.max(g.measureText(a).width, g.measureText(b).width);
      if (m < bw) ((bw = m), (best = k));
    }
    rows = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }
  const widest = Math.max(...rows.map((r) => g.measureText(r).width));
  const fs = widest > w ? Math.floor((size * w) / widest) : size;
  g.font = `${weight} ${fs}px ${font}`;
  const lh = fs * 0.94;
  rows.forEach((r, k) => g.fillText(r, x, y + (k - (rows.length - 1) / 2) * lh));
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  return rows.length;
}
function caps(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 700, track = 0.12, align: CanvasTextAlign = "center", font = DISPLAY) {
  g.font = `${weight} ${size}px ${font}`;
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(size * track).toFixed(1)}px`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(s, x + (align === "center" ? (size * track) / 2 : 0), y);
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
}

// ---- the spaces ----------------------------------------------------------------------------------

export const EDGE_W = 256;
export const EDGE_H = 410;
export const CORNER = 410;

/** The accent a non-deed space is printed in. */
function accentOf(s: Space) {
  switch (s.kind) {
    case "qip":
      return PRINT_LILAC;
    case "util":
      return "#6f6a64";
    case "tax":
      return PRINT_FLARE;
    default:
      return PRINT_FLARE;
  }
}

/**
 * A space's face, printed on card stock. Edge spaces are 256 × 410 (the board's middle at the
 * top), corners 410 × 410. The ink rules on its sides make the board's printed grid.
 */
export function paintSpace(cv: HTMLCanvasElement, s: Space, name: string, sub: string) {
  const corner = s.i % 10 === 0;
  cv.width = corner ? CORNER : EDGE_W;
  cv.height = corner ? CORNER : EDGE_H;
  const g = cv.getContext("2d")!;
  const W = cv.width,
    H = cv.height;
  g.imageSmoothingEnabled = false;
  paperFill(g, W, H, PAPER);
  // a whisper of light in the middle of the card, darker at its edges (the press's ink spread)
  const vg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.8);
  vg.addColorStop(0, "rgba(255,252,240,0.18)");
  vg.addColorStop(1, "rgba(90,70,40,0.10)");
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  if (corner) {
    paintCorner(g, s, name, sub, W, H);
    rules(g, W, H, true);
    return;
  }
  const grp = s.group !== undefined ? GROUPS[s.group] : null;
  let nameY = 64;
  if (grp) {
    // the district band (the buildings stand on it, in 3D)
    g.fillStyle = grp.color;
    g.fillRect(0, 0, W, 86);
    halftone(g, 0, 0, W, 86, "#000", 0.08, 8);
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.fillRect(0, 0, W, 4);
    g.fillStyle = INK;
    g.fillRect(0, 86, W, 5);
    nameY = 140;
  } else if (s.kind === "line") {
    // a station sign: a void band with the line's name in cream
    g.fillStyle = VOIDC;
    g.fillRect(0, 0, W, 64);
    g.fillStyle = PRINT_FLARE;
    g.fillRect(0, 64, W, 8);
    caps(g, "ZEC LINE", W / 2, 34, 30, "#ece4d3", 800, 0.16);
    nameY = 124;
  } else if (s.kind === "util") {
    g.save();
    g.fillStyle = "#c9c1b0";
    g.fillRect(0, 0, W, 50);
    g.strokeStyle = "rgba(29,26,23,0.35)";
    g.lineWidth = 6;
    for (let k = -50; k < W; k += 22) {
      g.beginPath();
      g.moveTo(k, 50);
      g.lineTo(k + 50, 0);
      g.stroke();
    }
    g.restore();
    g.fillStyle = INK;
    g.fillRect(0, 50, W, 4);
    nameY = 110;
  } else {
    g.fillStyle = accentOf(s);
    g.fillRect(0, 0, W, 14);
    nameY = 74;
  }
  const nameC = s.kind === "mempool" ? PRINT_FLARE : s.kind === "qip" ? PRINT_LILAC : INK;
  const rows = fitText(g, name.toUpperCase(), W / 2, nameY, W - 34, 54, 800, nameC);
  // the second line: small spaced caps
  if (!grp && sub) caps(g, sub.toUpperCase(), W / 2, nameY + (rows > 1 ? 58 : 38), 21, "rgba(29,26,23,0.62)", 700, 0.14);
  // the icon, printed in ink and the district's colour
  const ip = 10;
  const iy = grp ? 206 : s.kind === "line" ? 196 : 200;
  drawIcon(g, s.icon, W / 2 - 6 * ip, iy, ip, grp?.color ?? (s.kind === "qip" ? LILAC : FLARE));
  // the price, under a short rule
  if (s.price || s.kind === "tax") {
    g.fillStyle = "rgba(29,26,23,0.5)";
    g.fillRect(W / 2 - 36, H - 78, 72, 3);
  }
  if (s.price) {
    priceTag(g, W / 2, H - 42, String(s.price), INK, 50);
  } else if (s.kind === "tax") {
    if (s.tax) priceTag(g, W / 2, H - 42, String(s.tax), PRINT_FLARE, 50, "PAY");
    else caps(g, "60 + 10 / DEED", W / 2, H - 44, 30, PRINT_FLARE, 800, 0.04);
  }
  rules(g, W, H, false);
}

/** "PAY 100 cr": the number big, the unit small (condensed). */
function priceTag(g: CanvasRenderingContext2D, x: number, y: number, n: string, color: string, size: number, pre = "") {
  g.textBaseline = "alphabetic";
  g.font = `800 ${size}px ${DISPLAY}`;
  const wn = g.measureText(n).width;
  g.font = `700 ${size * 0.5}px ${DISPLAY}`;
  const wu = g.measureText(" cr").width;
  const wp = pre ? g.measureText(pre + " ").width : 0;
  let x0 = x - (wn + wu + wp) / 2;
  g.fillStyle = color;
  g.textAlign = "left";
  const base = y + size * 0.36;
  if (pre) {
    g.fillText(pre + " ", x0, base);
    x0 += wp;
  }
  g.font = `800 ${size}px ${DISPLAY}`;
  g.fillText(n, x0, base);
  g.font = `700 ${size * 0.5}px ${DISPLAY}`;
  g.fillText(" cr", x0 + wn, base);
  g.textBaseline = "middle";
}

/** The printed grid: ink rules on the sides of a space (the board's lines between spaces). */
function rules(g: CanvasRenderingContext2D, W: number, H: number, corner: boolean) {
  g.fillStyle = "rgba(29,26,23,0.86)";
  g.fillRect(0, 0, 3, H);
  g.fillRect(W - 3, 0, 3, H);
  g.fillRect(0, 0, W, 3);
  if (corner) g.fillRect(0, H - 3, W, 3);
  else g.fillRect(0, H - 4, W, 4);
}

function paintCorner(g: CanvasRenderingContext2D, s: Space, name: string, sub: string, W: number, H: number) {
  const tint = s.kind === "genesis" ? PRINT_FLARE : s.kind === "jail" ? "#55504a" : s.kind === "park" ? PRINT_SAGE : "#c2412b";
  if (s.kind === "raid" || s.kind === "jail") {
    // hazard hatching in pale ink
    g.save();
    g.globalAlpha = 0.09;
    g.fillStyle = INK;
    for (let k = -H; k < W; k += 40) {
      g.beginPath();
      g.moveTo(k, H);
      g.lineTo(k + 20, H);
      g.lineTo(k + 20 + H, 0);
      g.lineTo(k + H, 0);
      g.fill();
    }
    g.restore();
  }
  if (s.kind === "jail") {
    // the cell: a void square in the inner corner (the bars stand on its edges, in 3D)
    g.fillStyle = "#2a2622";
    g.fillRect(0, 0, W * 0.6, H * 0.6);
    halftone(g, 0, 0, W * 0.6, H * 0.6, "#000", 0.25, 9);
    g.fillStyle = INK;
    g.fillRect(W * 0.6, 0, 6, H * 0.6 + 6);
    g.fillRect(0, H * 0.6, W * 0.6 + 6, 6);
    caps(g, "IN THE CELL", W * 0.3, H * 0.3, 26, "rgba(236,228,211,0.55)", 700, 0.14);
    fitText(g, name.toUpperCase(), W / 2 + 60, H - 92, W - 150, 46, 800, INK);
    caps(g, sub.toUpperCase(), W / 2 + 60, H - 40, 22, "rgba(29,26,23,0.6)", 700, 0.14);
    return;
  }
  if (s.kind === "genesis") {
    // a big printed arrow: the way round
    g.fillStyle = tint;
    g.beginPath();
    g.moveTo(W * 0.82, H * 0.2);
    g.lineTo(W * 0.38, H * 0.2);
    g.lineTo(W * 0.38, H * 0.1);
    g.lineTo(W * 0.14, H * 0.27);
    g.lineTo(W * 0.38, H * 0.44);
    g.lineTo(W * 0.38, H * 0.34);
    g.lineTo(W * 0.82, H * 0.34);
    g.closePath();
    g.fill();
    halftone(g, 0, H * 0.08, W, H * 0.4, "#000", 0.07, 8);
    fitText(g, name.toUpperCase(), W / 2, H * 0.6, W - 40, 66, 800, INK);
    caps(g, sub.toUpperCase(), W / 2, H * 0.78, 28, tint, 800, 0.1);
    g.fillStyle = tint;
    g.fillRect(0, H - 18, W, 18);
    return;
  }
  drawIcon(g, s.icon, W / 2 - 78, 52, 13, s.kind === "park" ? "#6dbf8a" : "#ff5c8a");
  fitText(g, name.toUpperCase(), W / 2, 270, W - 40, 58, 800, INK);
  caps(g, sub.toUpperCase(), W / 2, 336, 25, tint, 800, 0.1);
  g.fillStyle = tint;
  g.fillRect(0, H - 18, W, 18);
}

// ---- the board's middle --------------------------------------------------------------------------

/**
 * The middle of the board (S × S for the inner square of `side` units): a void field printed with
 * a dot grid, the two deck spots at ±`deckX` units, the wordmark at the near side, the bank's label.
 */
export function paintCentre(cv: HTMLCanvasElement, side: number, deckX: number, deckNames: [string, string], title: string, tagline: string, bank: string, S = 2048) {
  cv.width = cv.height = S;
  const g = cv.getContext("2d")!;
  const u = S / side;
  const cx = S / 2;
  paperFill(g, S, S, VOIDC, 0.8);
  const vg = g.createRadialGradient(cx, cx, S * 0.1, cx, cx, S * 0.75);
  vg.addColorStop(0, "rgba(60,48,38,0.35)");
  vg.addColorStop(1, "rgba(0,0,0,0.25)");
  g.fillStyle = vg;
  g.fillRect(0, 0, S, S);
  // the print: dots on a skewed grid
  const b1 = [u * 0.62, u * 0.1],
    b2 = [u * 0.22, u * 0.58];
  g.fillStyle = hexA(LILAC, 0.22);
  for (let i = -24; i <= 24; i++)
    for (let j = -24; j <= 24; j++) {
      const x = cx + i * b1[0] + j * b2[0],
        y = cx + i * b1[1] + j * b2[1];
      if (x < 30 || y < 30 || x > S - 30 || y > S - 30) continue;
      g.beginPath();
      g.arc(x, y, u * 0.028, 0, Math.PI * 2);
      g.fill();
    }
  // a fine frame inside the track
  g.strokeStyle = "rgba(236,228,211,0.28)";
  g.lineWidth = 3;
  g.strokeRect(u * 0.18, u * 0.18, S - u * 0.36, S - u * 0.36);
  g.strokeStyle = "rgba(236,228,211,0.12)";
  g.lineWidth = 2;
  g.strokeRect(u * 0.26, u * 0.26, S - u * 0.52, S - u * 0.52);
  // the deck spots: printed outlines with corner ticks, the deck's name under
  const spot = (x: number, c: string, label: string) => {
    const w = u * 1.36,
      h = u * 1.86;
    g.save();
    g.translate(x, cx);
    g.strokeStyle = hexA(c, 0.85);
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, u * 0.1);
    g.stroke();
    g.fillStyle = hexA(c, 0.07);
    g.fill();
    g.lineWidth = 8;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      g.beginPath();
      g.moveTo((sx * w) / 2 + sx * 12, (sy * h) / 2 - sy * 26 + sy * 12);
      g.lineTo((sx * w) / 2 + sx * 12, (sy * h) / 2 + sy * 12);
      g.lineTo((sx * w) / 2 - sx * 26 + sx * 12, (sy * h) / 2 + sy * 12);
      g.stroke();
    }
    caps(g, label, 0, h / 2 + u * 0.3, u * 0.3, c, 800, 0.2);
    g.restore();
  };
  spot(cx - deckX * u, FLARE, deckNames[0]);
  spot(cx + deckX * u, LILAC, deckNames[1]);
  // the wordmark at the near side, the ⓩ mark beside it
  const wy = cx + u * 3.02;
  g.font = `800 ${u * 0.82}px ${DISPLAY}`;
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(u * 0.05).toFixed(1)}px`;
  const tw = g.measureText(title).width;
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  const mk = u * 0.78;
  const x0 = cx - (tw + mk + u * 0.2) / 2;
  drawMark(g, x0 + mk / 2, wy - u * 0.02, mk, "#ece4d3", FLARE);
  caps(g, title, x0 + mk + u * 0.2, wy + u * 0.02, u * 0.82, "#ece4d3", 800, 0.06, "left");
  caps(g, tagline, cx, wy + u * 0.66, u * 0.2, "rgba(236,228,211,0.5)", 700, 0.32);
  // the bank, at the far side (its rack of chips stands there in 3D)
  caps(g, bank, cx, cx - u * 2.12, u * 0.2, "rgba(236,228,211,0.45)", 700, 0.36);
}

// ---- cards ---------------------------------------------------------------------------------------

/** A card's back (the 3D decks): the deck's colour, a cross weave, an emblem, a cream border. */
export function paintCardBack(cv: HTMLCanvasElement, deck: "mempool" | "qip", name: string) {
  cv.width = 256;
  cv.height = 360;
  const g = cv.getContext("2d")!;
  const c = deck === "mempool" ? FLARE : LILAC;
  paperFill(g, 256, 360, "#efe8d8");
  g.fillStyle = c;
  g.beginPath();
  g.roundRect(14, 14, 228, 332, 10);
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "rgba(20,18,17,0.18)";
  g.lineWidth = 3;
  for (let k = -360; k < 360; k += 18) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 360, 360);
    g.stroke();
    g.beginPath();
    g.moveTo(k + 360, 0);
    g.lineTo(k, 360);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = "rgba(20,18,17,0.55)";
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(24, 24, 208, 312, 8);
  g.stroke();
  g.fillStyle = VOIDC;
  g.beginPath();
  g.arc(128, 160, 70, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#efe8d8";
  g.lineWidth = 5;
  g.stroke();
  drawIcon(g, deck, 128 - 42, 160 - 44, 7, c, "#efe8d8");
  g.fillStyle = VOIDC;
  g.fillRect(24, 262, 208, 54);
  caps(g, name, 128, 290, 34, c, 800, 0.16);
}

// ---- dice ----------------------------------------------------------------------------------------

/** A die's face (n pips): ivory, the pips drilled and inked, the one in flare. */
export function paintDie(cv: HTMLCanvasElement, n: number) {
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  paperFill(g, 128, 128, "#f4efe4", 0.25);
  const sh = g.createRadialGradient(64, 64, 30, 64, 64, 92);
  sh.addColorStop(0, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(120,100,70,0.16)");
  g.fillStyle = sh;
  g.fillRect(0, 0, 128, 128);
  const P: Record<number, [number, number][]> = {
    1: [[64, 64]],
    2: [
      [38, 38],
      [90, 90],
    ],
    3: [
      [34, 34],
      [64, 64],
      [94, 94],
    ],
    4: [
      [38, 38],
      [90, 38],
      [38, 90],
      [90, 90],
    ],
    5: [
      [35, 35],
      [93, 35],
      [64, 64],
      [35, 93],
      [93, 93],
    ],
    6: [
      [38, 32],
      [90, 32],
      [38, 64],
      [90, 64],
      [38, 96],
      [90, 96],
    ],
  };
  const r = n === 1 ? 17 : 11.5;
  for (const [x, y] of P[n]) {
    // the drill's shadow rim, the ink, a glint on the far lip
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath();
    g.arc(x + 1.2, y + 1.6, r + 1.5, 0, Math.PI * 2);
    g.fill();
    const ink = n === 1 ? FLARE : "#1b1714";
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, n === 1 ? "#c8441a" : "#000");
    gr.addColorStop(1, ink);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

// ---- chips and coins -----------------------------------------------------------------------------

/** The four credit chips of the bank: their colours and values. */
export const CHIP_COLORS = ["#ece4d3", "#a8d8e8", "#c4b1fc", "#ff6b35"];

/** A clay chip's face: its colour, six cream edge inserts, an inner ring, "cr" in the middle. */
export function paintChipFace(cv: HTMLCanvasElement, color: string) {
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  const light = color === CHIP_COLORS[0];
  paperFill(g, 128, 128, color, 0.6);
  const ins = light ? "#2b2622" : "#f2ecdf";
  g.fillStyle = ins;
  for (let k = 0; k < 6; k++) {
    g.save();
    g.translate(64, 64);
    g.rotate((k / 6) * Math.PI * 2);
    g.fillRect(-9, -64, 18, 16);
    g.restore();
  }
  g.strokeStyle = light ? "rgba(43,38,34,0.55)" : "rgba(242,236,223,0.8)";
  g.lineWidth = 3;
  g.setLineDash([6, 5]);
  g.beginPath();
  g.arc(64, 64, 38, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = shade(color, light ? 0.92 : 0.86);
  g.beginPath();
  g.arc(64, 64, 32, 0, Math.PI * 2);
  g.fill();
  caps(g, "cr", 64, 62, 34, light ? "#2b2622" : "#f2ecdf", 800, 0);
}
/** One chip's edge, for a stack (repeat it vertically): the colour, inserts, a dark seam. */
export function paintChipEdge(cv: HTMLCanvasElement, color: string) {
  cv.width = 128;
  cv.height = 16;
  const g = cv.getContext("2d")!;
  const light = color === CHIP_COLORS[0];
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 16);
  g.fillStyle = light ? "#2b2622" : "#f2ecdf";
  for (let k = 0; k < 6; k++) g.fillRect(k * 21.33 + 4, 3, 7, 10);
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(0, 14, 128, 2);
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(0, 0, 128, 1);
}

/** An owner's coin: the seat's colour rim with inserts, their portrait struck in the middle. */
export function paintCoin(cv: HTMLCanvasElement, color: string, img: HTMLImageElement | null) {
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f2ecdf";
  for (let k = 0; k < 8; k++) {
    g.save();
    g.translate(64, 64);
    g.rotate((k / 8) * Math.PI * 2);
    g.fillRect(-6, -64, 12, 12);
    g.restore();
  }
  g.fillStyle = VOIDC;
  g.beginPath();
  g.arc(64, 64, 46, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(64, 64, 42, 0, Math.PI * 2);
  g.clip();
  if (img && img.complete && img.naturalWidth) {
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 64 - 46, 64 - 44, 92, 92);
  } else {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
  }
  g.restore();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 64, 45, 0, Math.PI * 2);
  g.stroke();
}

/** The rubber stamp of collateral, in red ink with a worn edge (transparent around it). */
export function paintPledged(cv: HTMLCanvasElement, word: string) {
  cv.width = 256;
  cv.height = 410;
  const g = cv.getContext("2d")!;
  g.fillStyle = "rgba(29,26,23,0.30)";
  g.fillRect(0, 0, 256, 410);
  g.save();
  g.translate(128, 205);
  g.rotate(-Math.PI / 2.5);
  g.strokeStyle = "#c8323c";
  g.lineWidth = 9;
  g.strokeRect(-160, -42, 320, 84);
  g.lineWidth = 3;
  g.strokeRect(-150, -32, 300, 64);
  caps(g, word, 0, 2, 50, "#c8323c", 800, 0.1);
  g.restore();
  // the worn ink: knock holes out of the stamp
  g.save();
  g.globalCompositeOperation = "destination-out";
  const p = g.createPattern(grain(), "repeat")!;
  g.fillStyle = p;
  g.globalAlpha = 0.9;
  g.fillRect(0, 0, 256, 410);
  g.restore();
}

export const spaceIcon = (i: number) => SPACES[i].icon;
