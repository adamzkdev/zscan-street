/**
 * The GAME HOUSE's tables, light: what the walk-in house (src/interior/gamehouse) shows of them
 * (their cards, their records in this browser, their drawn art) without loading any table game's
 * code (the launcher, launcher.ts, loads them when a table is opened).
 */
import { T } from "../i18n/lang";
import { HOUSE_TABLES } from "./catalog";
import { drawMark } from "../party/theme";

export { HOUSE_TABLES };

/** About how long a table plays (the games' own, src/tables/<key>/index.ts). */
const MINUTES: Record<string, number> = { barons: 20, glyph: 7, holdem: 20, legends: 12 };

/** A table's name, colour and line for the room (the house's card). */
export function tableCard(key: string) {
  const h = HOUSE_TABLES.find((t) => t.key === key);
  return {
    key,
    ready: !!h,
    title: h ? T(h.title, h.titleZh) : key.toUpperCase(),
    tag: h ? T(h.tag, h.tagZh) : "",
    color: h?.color ?? "#ff6b35",
    seats: h?.seats ?? "",
    minutes: MINUTES[key] ?? 0,
    thumb: h ? `/party/thumbs/tables-${key}.jpg` : undefined,
  };
}

export interface TableRecord {
  played: number;
  wins: number;
  best: number;
  net: number;
}
/** Where the launcher keeps every table's record (launcher.ts writes it). */
export const TABLE_STATS = "street.tables.stats";
/** Every table's record in this browser: games played, won, the best payout, the net in ⓩ. */
export function tableStats(): Record<string, TableRecord> {
  try {
    const raw = localStorage.getItem(TABLE_STATS);
    return raw ? (JSON.parse(raw) as Record<string, TableRecord>) : {};
  } catch {
    return {};
  }
}

/** A small seeded generator (mulberry32). */
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

// ---- the table's art (a thumbnail when the game has none) ---------------------------------------------

/**
 * A card picture for a table: the game's thumbnail when it ships one, otherwise drawn here (a board of
 * properties, a fan of snark cards, chips and two cards, dice), in the game's colour. Also used by the
 * room's signs.
 */
export function tableArt(key: string, color: string, w = 640, h = 360): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const r = rng(key.split("").reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const bg = g.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.5, w * 0.75);
  bg.addColorStop(0, mix(color, "#0e0e0e", 0.55));
  bg.addColorStop(1, "#0b0a10");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // a grid of faint dots
  g.fillStyle = "rgba(232,230,224,0.06)";
  for (let y = 12; y < h; y += 24) for (let x = (y / 24) % 2 ? 12 : 24; x < w; x += 24) g.fillRect(x, y, 2, 2);
  const s = h / 360;
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(s, s);
  if (key === "barons") {
    // a square board seen from above, tilted: property tiles in groups, the centre logo
    g.rotate(-0.12);
    g.fillStyle = "#14121a";
    rrect(g, -150, -150, 300, 300, 14);
    g.fill();
    const groups = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a", "#ff5c8a", "#d9bc8a", "#5cc8ff", "#e8e6e0"];
    for (let i = 0; i < 28; i++) {
      const side = Math.floor(i / 7),
        k = i % 7;
      const t = -126 + k * 36;
      const [x, y] = [
        [t, -150],
        [114, t],
        [-t - 36, 114],
        [-150, -t - 36],
      ][side];
      g.fillStyle = "#211e29";
      g.fillRect(x + 2, y + 2, 32, 32);
      g.fillStyle = groups[Math.floor(i / 3.5) % 8];
      g.fillRect(x + 2, y + 2, 32, 9);
    }
    g.fillStyle = color;
    g.font = '800 34px Geist, "PingFang SC", sans-serif';
    g.textAlign = "center";
    g.fillText("BLOCK", 0, -6);
    g.fillText("BARONS", 0, 30);
    // two dice and a token
    die(g, 160, 60, 46, 5, 0.3);
    die(g, 205, 120, 40, 2, -0.4);
  } else if (key === "glyph") {
    // a fan of snark cards
    const cols = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a", "#ff5c8a"];
    for (let i = 0; i < 7; i++) {
      g.save();
      g.rotate((i - 3) * 0.17);
      g.translate(0, 40);
      g.fillStyle = "#f2eee6";
      rrect(g, -55, -190, 110, 160, 12);
      g.fill();
      g.fillStyle = cols[i % 5];
      rrect(g, -47, -182, 94, 144, 8);
      g.fill();
      drawMark(g, 0, -110, 66, "rgba(255,255,255,0.85)", "#fff");
      g.fillStyle = "#fff";
      g.font = '800 22px Geist, sans-serif';
      g.textAlign = "left";
      g.fillText(String((i * 3) % 9), -40, -158);
      g.restore();
    }
  } else if (key === "holdem") {
    // chips and two cards on felt
    g.fillStyle = "rgba(168,216,232,0.10)";
    g.beginPath();
    g.ellipse(0, 40, 300, 120, 0, 0, Math.PI * 2);
    g.fill();
    const chip = (x: number, y: number, c: string) => {
      for (let k = 0; k < 6; k++) {
        g.fillStyle = mix(c, "#000", 0.35);
        g.beginPath();
        g.ellipse(x, y - k * 9 + 4, 34, 13, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, y - k * 9, 34, 13, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.8)";
        g.setLineDash([6, 8]);
        g.lineWidth = 3;
        g.stroke();
        g.setLineDash([]);
      }
    };
    chip(-170, 90, "#ff6b35");
    chip(-95, 120, "#c4b1fc");
    chip(170, 100, "#a8d8e8");
    for (const [x, rot, label, suit] of [
      [-30, -0.16, "A", "◆"],
      [40, 0.14, "Q", "◆"],
    ] as const) {
      g.save();
      g.translate(x, -10);
      g.rotate(rot);
      g.fillStyle = "#f2eee6";
      rrect(g, -55, -80, 110, 155, 10);
      g.fill();
      g.fillStyle = label === "A" ? "#c4302a" : "#1a1a22";
      g.font = '800 40px Geist, sans-serif';
      g.textAlign = "center";
      g.fillText(label, -30, -38);
      g.font = '800 64px Geist, sans-serif';
      g.fillText(suit, 6, 40);
      g.restore();
    }
  } else {
    die(g, -60, 0, 110, 5, -0.2);
    die(g, 80, 30, 90, 3, 0.25);
  }
  g.restore();
  // a few sparks of the colour
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `${color}${Math.random() < 0.5 ? "55" : "33"}`;
    const x = r() * w,
      y = r() * h;
    g.fillRect(x, y, 3, 3);
  }
  return c;
}
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function die(g: CanvasRenderingContext2D, x: number, y: number, s: number, n: number, rot: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = "#f2eee6";
  rrect(g, -s / 2, -s / 2, s, s, s * 0.18);
  g.fill();
  const P: number[][][] = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
  g.fillStyle = n === 1 ? "#ff6b35" : "#16141c";
  for (const [u, v] of P[n]) {
    g.beginPath();
    g.arc(u * s * 0.27, v * s * 0.27, s * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
function mix(a: string, b: string, k: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

