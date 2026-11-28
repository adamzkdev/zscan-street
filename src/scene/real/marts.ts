import * as THREE from "three";
import { GLASS_NIGHT } from "../voxel/surface";
import { kitGeos, kitMeshes, mergeKit, type KitGeos } from "./kitobj";
import { hex, Kit, type V3 } from "./lmkit";
import { CHAIN_KEYS, CHAINS, MALLS, type Chain, type ChainKey } from "./martdata";
import type { PropSpot } from "./props";

/**
 * The convenience stores and the malls, drawn (the chains and the malls themselves: ./martdata.ts):
 *
 *  - `store`: the stand-alone 24-hour store — one storey under a flat roof, its fascia lit in the
 *    chain's colours over a full glass front (the bright shop seen through it: aisles, fridges, the
 *    counter), OPEN 24H on the glass, posters; outside the ATM, the ice freezer, the newspaper rack,
 *    the bins, a bike rack; in front its forecourt's parking bays and the pylon sign by the street;
 *  - `front`: the konbini on the ground floor of a building (the fascia, the glass, posters, a bin
 *    and a bike rack), and `kiosk`, the old town's narrow 24-hour kiosk in a house's ground floor;
 *  - `mall`: a mall's big box — the glass atrium over its entrance, the name over it, the anchor
 *    stores' blocks with their own signs, banners, the parapet's light; `parkade`: a car park's
 *    decks on columns, `lot`: an open car park's bays.
 *
 * Everything is the realistic kit's geometry (src/scene/real/lmkit.ts: the caller merges it with its
 * own, per material) except what carries a picture — fascias, windows, logos, the ATM's face, the
 * malls' signs — which is quads on one shared atlas (`MartDecals`: one draw for all of them), lit by
 * day and brighter at night. Every door is pushed as a facade with its name (the chain's, the
 * mall's): the game's E walks in, and the interior is dressed after the name.
 */

export type Face = "n" | "s" | "e" | "w";
const OUT: Record<Face, [number, number]> = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

/** A front door for the game (an island's IsleFacade, the city's marts): `name` is the store's. */
export interface MartFacade {
  type: string;
  face: Face;
  x0: number;
  x1: number;
  z: number;
  out: { x: number; y: number; z: number };
  door: { x: number; z: number };
  name: string;
}

/** What a builder hands back besides its geometry: doors, street furniture, lights, footprints. */
export interface MartOut {
  facades: MartFacade[];
  props: PropSpot[];
  /** Lights over the forecourt (world x, y, z, colour): the street's pool of lamp lights at night. */
  lamps: [number, number, number, string][];
  /** Footprints (walls, the freezer, the pylon): for the caller's own obstacles and nav. */
  boxes: { x0: number; z0: number; x1: number; z1: number }[];
  /** Parking bays a car could stand in (centre, heading along the bay). */
  bays: { x: number; z: number; rot: number }[];
}
export const emptyOut = (): MartOut => ({ facades: [], props: [], lamps: [], boxes: [], bays: [] });

/** A frame on a front facing `face` (its line `front`, centred `at` along it): u to the right seen from outside, y up, d out of it. */
export function frontFrame(face: Face, front: number, at: number) {
  const [ox, oz] = OUT[face];
  const P = (u: number, y: number, d: number): V3 => (ox === 0 ? [at + u * (oz > 0 ? 1 : -1), y, front + d * oz] : [front + d * ox, y, at + u * (ox > 0 ? -1 : 1)]);
  const box = (K: Kit, slot: string, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, col: V3, skip?: string, fh?: number) => {
    const a = P(u0, y0, d0),
      b = P(u1, y1, d1);
    K.box(slot as never, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), col, { ...(skip ? { skip } : {}), ...(fh ? { fh } : {}) });
  };
  /** The footprint of (u0…u1, d0…d1) on the ground. */
  const foot = (u0: number, u1: number, d0: number, d1: number) => {
    const a = P(u0, 0, d0),
      b = P(u1, 0, d1);
    return { x0: Math.min(a[0], b[0]), z0: Math.min(a[2], b[2]), x1: Math.max(a[0], b[0]), z1: Math.max(a[2], b[2]) };
  };
  return { P, box, foot, n: [ox, 0, oz] as V3, ox, oz };
}
type Frame = ReturnType<typeof frontFrame>;

/** The facade of a door at `u` on a frame's front line (pushed for the game). */
function doorOf(F: Frame, face: Face, front: number, u: number, d: number, w: number, name: string): MartFacade {
  const c = F.P(u, 0, d);
  const p = F.P(u, 0, d + 0.35);
  const ns = F.ox === 0;
  return { type: "streetshop", face, x0: ns ? c[0] - w / 2 : front + d * F.ox, x1: ns ? c[0] + w / 2 : front + d * F.ox, z: ns ? front + d * F.oz : c[2], out: { x: F.ox, y: 0, z: F.oz }, door: { x: p[0], z: p[2] }, name };
}

// ---- the atlas ----------------------------------------------------------------------------------

const AW = 2048,
  AH = 1536;
/** A cell of the atlas: its rectangle in the canvas (px). */
type Cell = [number, number, number, number];
const CELLS = new Map<string, Cell>();
(() => {
  CHAIN_KEYS.forEach((k, i) => {
    CELLS.set(`fascia:${k}`, [0, i * 128, 1024, 128]);
    CELLS.set(`inside:${k}`, [1024 + (i % 2) * 512, Math.floor(i / 2) * 256, 512, 256]);
    CELLS.set(`open:${k}`, [512 + (i % 2) * 256, 1024 + Math.floor(i / 2) * 64, 256, 64]);
    CELLS.set(`logo:${k}`, [1536 + (i % 2) * 256, 1024 + Math.floor(i / 2) * 256, 256, 256]);
  });
  Object.values(MALLS).forEach((m, i) => {
    CELLS.set(`mall:${m.key}`, [0, 512 + i * 128, 1024, 128]);
    CELLS.set(`banner:${m.key}`, [i * 128, 1024, 128, 512]);
    m.anchors.forEach((a, j) => CELLS.set(`anchor:${m.key}:${j}`, [1024 + ((i * 4 + j) % 2) * 512, 512 + Math.floor((i * 4 + j) / 2) * 64, 512, 64]));
  });
  for (let i = 0; i < 4; i++) CELLS.set(`poster:${i}`, [512 + i * 128, 1152, 128, 256]);
  CELLS.set("parking", [512, 1408, 128, 128]);
  CELLS.set("atm", [1024, 1024, 128, 256]);
  CELLS.set("ice", [1152, 1024, 256, 128]);
  CELLS.set("news", [1152, 1152, 256, 128]);
  CELLS.set("bins", [1408, 1024, 128, 128]);
  CELLS.set("menu", [1408, 1152, 128, 128]);
  CELLS.set("mallin", [1024, 1280, 512, 256]);
})();

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const SANS = '"Helvetica Neue", "Hiragino Sans", Arial, sans-serif';
/** Text fitted into a width (shrunk to fit). */
function fit(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, weight = 800, font = SANS) {
  g.font = `${weight} ${px}px ${font}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.floor((px * maxW) / w)}px ${font}`;
  g.fillText(text, x, y);
}

/** A chain's emblem in a square of side s at (x, y). */
function emblem(g: CanvasRenderingContext2D, c: Chain, x: number, y: number, s: number) {
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (c.key === "zkmart") {
    // a black rounded square, a gold ZK in it
    g.fillStyle = c.stripe;
    roundRect(g, x, y, s, s, s * 0.18);
    g.fill();
    g.fillStyle = c.band;
    fit(g, "ZK", x + s / 2, y + s * 0.54, s * 0.8, s * 0.56, 900);
  } else if (c.key === "shield24") {
    // a white shield, a red 24 in it
    g.fillStyle = c.stripe;
    g.beginPath();
    g.moveTo(x + s * 0.5, y + s * 0.04);
    g.lineTo(x + s * 0.92, y + s * 0.18);
    g.quadraticCurveTo(x + s * 0.9, y + s * 0.72, x + s * 0.5, y + s * 0.97);
    g.quadraticCurveTo(x + s * 0.1, y + s * 0.72, x + s * 0.08, y + s * 0.18);
    g.closePath();
    g.fill();
    g.fillStyle = c.band;
    fit(g, "24", x + s / 2, y + s * 0.47, s * 0.6, s * 0.42, 900);
  } else if (c.key === "konbiniz") {
    // a coral disc, a white Z
    g.fillStyle = c.stripe;
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    fit(g, "Z", x + s / 2, y + s * 0.54, s * 0.7, s * 0.66, 900);
  } else {
    // a pink disc, 24 over a slash
    g.fillStyle = c.stripe;
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    fit(g, "24", x + s / 2, y + s * 0.42, s * 0.62, s * 0.4, 900);
    g.fillRect(x + s * 0.26, y + s * 0.66, s * 0.48, s * 0.05);
  }
  g.restore();
}

/** The bright shop seen through the glass: lights, the back wall's band, shelves of goods, the fridges, the counter, a figure or two. */
function insideView(g: CanvasRenderingContext2D, c: Chain, x: number, y: number, w: number, h: number, seed: number) {
  let s = seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  // the room: white walls, the ceiling's light, the floor
  g.fillStyle = "#f4f6f8";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#e2e6ea";
  g.fillRect(0, 0, w, h * 0.12);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.fillRect(w * (0.06 + k * 0.24), h * 0.03, w * 0.16, h * 0.025);
  }
  // the back wall's band in the chain's colour
  g.fillStyle = c.wall;
  g.fillRect(0, h * 0.14, w, h * 0.07);
  g.fillStyle = c.stripe;
  g.fillRect(0, h * 0.21, w, h * 0.012);
  // the fridges along the back: lit glass doors with drinks
  for (let fx = 0; fx < w; fx += w / 9) {
    g.fillStyle = "#dff2fa";
    g.fillRect(fx + 2, h * 0.23, w / 9 - 4, h * 0.42);
    for (let r = 0; r < 5; r++)
      for (let k = 0; k < 6; k++) {
        g.fillStyle = ["#e8463a", "#3fa8ff", "#f4b728", "#43d17a", "#ff8a1f", "#f2f0ea", "#2a2a30"][Math.floor(R() * 7)];
        g.fillRect(fx + 5 + k * ((w / 9 - 10) / 6), h * (0.25 + r * 0.08), (w / 9 - 10) / 6 - 2, h * 0.055);
      }
    g.fillStyle = "rgba(120,130,140,0.9)";
    g.fillRect(fx, h * 0.23, 2, h * 0.42);
  }
  // the floor
  const fg = g.createLinearGradient(0, h * 0.66, 0, h);
  fg.addColorStop(0, "#cfd2d4");
  fg.addColorStop(1, "#a9adb0");
  g.fillStyle = fg;
  g.fillRect(0, h * 0.66, w, h * 0.34);
  // the aisles: gondolas end-on and side-on, packed with goods
  for (let k = 0; k < 4; k++) {
    const gx = w * (0.08 + k * 0.23),
      gw = w * 0.15;
    g.fillStyle = "#e4e6ea";
    g.fillRect(gx, h * 0.42, gw, h * 0.4);
    for (let r = 0; r < 4; r++) {
      g.fillStyle = "#b8bcc2";
      g.fillRect(gx, h * (0.5 + r * 0.08), gw, 2);
      for (let px = gx + 2; px < gx + gw - 4; px += 4 + R() * 5) {
        g.fillStyle = ["#e8463a", "#3fa8ff", "#f4b728", "#43d17a", "#ff8a1f", "#b07bff", "#ff5aa8", "#f2f0ea"][Math.floor(R() * 8)];
        const ph = h * (0.03 + R() * 0.03);
        g.fillRect(px, h * (0.5 + r * 0.08) - ph, 3 + R() * 3, ph);
      }
    }
    // the price rail in the chain's colour
    g.fillStyle = c.band;
    g.fillRect(gx, h * 0.42, gw, h * 0.02);
  }
  // the counter on one side, its till, the cashier behind it
  g.fillStyle = c.counter;
  g.fillRect(w * 0.7, h * 0.7, w * 0.3, h * 0.22);
  g.fillStyle = c.band;
  g.fillRect(w * 0.7, h * 0.7, w * 0.3, h * 0.025);
  g.fillStyle = "#1a1a20";
  g.fillRect(w * 0.76, h * 0.62, w * 0.05, h * 0.08);
  g.fillStyle = "rgba(40,40,52,0.85)";
  g.beginPath();
  g.arc(w * 0.87, h * 0.53, h * 0.045, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.band;
  g.fillRect(w * 0.84, h * 0.58, w * 0.06, h * 0.12);
  // shoppers between the aisles
  for (let k = 0; k < 2; k++) {
    const px = w * (0.2 + R() * 0.4);
    g.fillStyle = "rgba(30,30,38,0.7)";
    g.beginPath();
    g.arc(px, h * 0.55, h * 0.04, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px - h * 0.04, h * 0.59, h * 0.08, h * 0.26);
  }
  // the glass: a reflection's soft diagonal, the bottom a little darker
  const rg = g.createLinearGradient(0, 0, w, h);
  rg.addColorStop(0, "rgba(255,255,255,0.18)");
  rg.addColorStop(0.35, "rgba(255,255,255,0)");
  rg.addColorStop(0.55, "rgba(255,255,255,0.1)");
  rg.addColorStop(0.62, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** A mall's atrium seen through its doors: levels of lit shopfronts, the escalators, people, warm light. */
function mallView(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.translate(x, y);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#fff4de");
  bg.addColorStop(0.5, "#e8d6b8");
  bg.addColorStop(1, "#b8a488");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  for (let lv = 0; lv < 3; lv++) {
    const y0 = h * (0.08 + lv * 0.3);
    g.fillStyle = "#f6f2ea";
    g.fillRect(0, y0 + h * 0.2, w, h * 0.035);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = ["#ffe6b8", "#e8f4ff", "#ffd0dc", "#e6ffe8", "#fff6d0"][(k + lv) % 5];
      g.fillRect(w * (0.02 + k * 0.14), y0, w * 0.12, h * 0.19);
      g.fillStyle = ["#e8622c", "#3a7bff", "#1f3d33", "#ff6fb1", "#24262c"][(k * 3 + lv) % 5];
      g.fillRect(w * (0.02 + k * 0.14), y0, w * 0.12, h * 0.035);
    }
  }
  // the escalators' diagonals, the people
  g.strokeStyle = "rgba(60,60,70,0.8)";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(w * 0.3, h * 0.95);
  g.lineTo(w * 0.55, h * 0.4);
  g.moveTo(w * 0.62, h * 0.95);
  g.lineTo(w * 0.4, h * 0.4);
  g.stroke();
  for (let k = 0; k < 9; k++) {
    const px = w * (0.05 + ((k * 37) % 90) / 100);
    g.fillStyle = "rgba(30,28,34,0.65)";
    g.beginPath();
    g.arc(px, h * 0.8, h * 0.035, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px - h * 0.03, h * 0.83, h * 0.06, h * 0.16);
  }
  g.restore();
}

let atlasTex: THREE.CanvasTexture | null = null;
/** The atlas, drawn once. */
function martAtlas() {
  if (atlasTex) return atlasTex;
  const cv = document.createElement("canvas");
  cv.width = AW;
  cv.height = AH;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#202024";
  g.fillRect(0, 0, AW, AH);
  g.textAlign = "center";
  g.textBaseline = "middle";
  CHAIN_KEYS.forEach((k, i) => {
    const c = CHAINS[k];
    // the fascia: the chain's band, its stripe below, the emblem, the name, its line at the right
    {
      const [x, y, w, h] = CELLS.get(`fascia:${k}`)!;
      g.fillStyle = c.band;
      g.fillRect(x, y, w, h);
      g.fillStyle = c.stripe;
      g.fillRect(x, y + h - 22, w, 22);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(x, y + h - 26, w, 3);
      emblem(g, c, x + 22, y + 10, h - 40);
      g.fillStyle = c.ink;
      g.textAlign = "left";
      fit(g, c.name, x + h + 10, y + (h - 22) / 2 + 4, w * 0.6, 78, 900);
      g.textAlign = "right";
      g.font = `700 20px ${SANS}`;
      g.fillStyle = c.ink;
      g.globalAlpha = 0.85;
      g.fillText("OPEN 24H", x + w - 24, y + 30);
      g.globalAlpha = 1;
      g.textAlign = "center";
    }
    insideView(g, c, ...CELLS.get(`inside:${k}`)!, 1234 + i * 77);
    // OPEN 24H on the glass: white letters on the stripe's colour
    {
      const [x, y, w, h] = CELLS.get(`open:${k}`)!;
      g.fillStyle = "#16161a";
      g.fillRect(x, y, w, h);
      g.fillStyle = c.band;
      g.fillRect(x + 4, y + 4, 10, h - 8);
      g.fillRect(x + w - 14, y + 4, 10, h - 8);
      g.fillStyle = "#ffffff";
      fit(g, "OPEN 24H", x + w / 2, y + h / 2 + 2, w - 40, 40, 900);
    }
    // the pylon's square: the band, the emblem, the name under it
    {
      const [x, y, w, h] = CELLS.get(`logo:${k}`)!;
      g.fillStyle = c.band;
      g.fillRect(x, y, w, h);
      g.fillStyle = c.stripe;
      g.fillRect(x, y + h - 30, w, 30);
      emblem(g, c, x + w * 0.22, y + 18, w * 0.56);
      g.fillStyle = c.ink;
      fit(g, c.name, x + w / 2, y + h * 0.76, w - 20, 44, 900);
    }
  });
  // the malls: the name sign, the banners, the anchors' signs
  for (const m of Object.values(MALLS)) {
    {
      const [x, y, w, h] = CELLS.get(`mall:${m.key}`)!;
      g.fillStyle = m.band;
      g.fillRect(x, y, w, h);
      g.fillStyle = m.accent;
      g.fillRect(x, y + h - 12, w, 12);
      g.fillStyle = m.ink;
      fit(g, m.name, x + w / 2, y + h / 2 - 2, w - 60, 84, 800);
    }
    {
      const [x, y, w, h] = CELLS.get(`banner:${m.key}`)!;
      g.fillStyle = m.accent;
      g.fillRect(x, y, w, h);
      g.fillStyle = m.band;
      g.fillRect(x + 8, y + 8, w - 16, h * 0.62);
      g.save();
      g.translate(x + w / 2, y + 8 + (h * 0.62) / 2);
      g.rotate(-Math.PI / 2);
      g.fillStyle = m.ink;
      fit(g, m.name, 0, 4, h * 0.58, 58, 800);
      g.restore();
      g.fillStyle = "#ffffff";
      fit(g, "SALE", x + w / 2, y + h * 0.76, w - 20, 40, 900);
      fit(g, "OPEN DAILY", x + w / 2, y + h * 0.88, w - 16, 18, 700);
    }
    m.anchors.forEach((a, j) => {
      const [x, y, w, h] = CELLS.get(`anchor:${m.key}:${j}`)!;
      g.fillStyle = j % 2 ? m.accent : m.band;
      g.fillRect(x, y, w, h);
      g.fillStyle = j % 2 ? "#ffffff" : m.ink;
      fit(g, a, x + w / 2, y + h / 2 + 2, w - 30, 44, 800);
    });
  }
  // posters on the glass
  const POSTERS: [string, string, string, string][] = [
    ["#e8463a", "#ffffff", "HOT", "COFFEE ⓩ1"],
    ["#2a6ad8", "#ffffff", "ONIGIRI", "2 FOR 1"],
    ["#f4b728", "#1a1a1e", "NEW", "ZEC LATTE"],
    ["#43a86a", "#ffffff", "FRESH", "BENTO"],
  ];
  POSTERS.forEach(([bgc, ink, a, b], i) => {
    const [x, y, w, h] = CELLS.get(`poster:${i}`)!;
    g.fillStyle = bgc;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.arc(x + w / 2, y + h * 0.42, w * 0.36, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ink;
    fit(g, a, x + w / 2, y + h * 0.2, w - 14, 34, 900);
    fit(g, b, x + w / 2, y + h * 0.78, w - 12, 22, 800);
  });
  // a parking sign
  {
    const [x, y, w, h] = CELLS.get("parking")!;
    g.fillStyle = "#1f5aa8";
    g.fillRect(x, y, w, h);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = "#ffffff";
    fit(g, "P", x + w / 2, y + h / 2 + 4, w, 92, 900);
  }
  // the ATM's face: its header, the screen, the card slot, the keypad
  {
    const [x, y, w, h] = CELLS.get("atm")!;
    g.fillStyle = "#cfd3d8";
    g.fillRect(x, y, w, h);
    g.fillStyle = "#1f5aa8";
    g.fillRect(x, y, w, 34);
    g.fillStyle = "#ffffff";
    fit(g, "ATM 24H", x + w / 2, y + 18, w - 10, 22, 900);
    g.fillStyle = "#14283c";
    g.fillRect(x + 14, y + 46, w - 28, 70);
    g.fillStyle = "#58c8ff";
    fit(g, "ZEC ⓩ", x + w / 2, y + 72, w - 40, 20, 800);
    g.fillStyle = "#2a2a30";
    g.fillRect(x + w - 40, y + 126, 26, 6);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) (g.fillStyle = r === 3 && k === 2 ? "#43d17a" : "#3a3a42"), g.fillRect(x + 22 + k * 22, y + 144 + r * 18, 18, 14);
    g.fillStyle = "#3a3a42";
    g.fillRect(x + 20, y + 226, w - 40, 8);
  }
  // the ice freezer's front: frosted white, ICE in blue, snowflakes
  {
    const [x, y, w, h] = CELLS.get("ice")!;
    const ig = g.createLinearGradient(x, y, x, y + h);
    ig.addColorStop(0, "#ffffff");
    ig.addColorStop(1, "#d6e8f4");
    g.fillStyle = ig;
    g.fillRect(x, y, w, h);
    g.fillStyle = "#1f6ad8";
    fit(g, "ICE", x + w / 2, y + h * 0.48, w * 0.6, 80, 900);
    g.fillStyle = "#7ab8ff";
    for (const [sx, sy] of [
      [0.12, 0.25],
      [0.88, 0.3],
      [0.2, 0.8],
      [0.82, 0.78],
    ]) fit(g, "✱", x + w * sx, y + h * sy, 40, 26, 700);
  }
  // the newspapers in their rack
  {
    const [x, y, w, h] = CELLS.get("news")!;
    g.fillStyle = "#2a2c30";
    g.fillRect(x, y, w, h);
    const heads = ["THE BLOCK", "ZK TIMES", "NU7 SOON?", "DAILY PROOF"];
    heads.forEach((t, i) => {
      const px = x + 6 + (i % 2) * (w / 2),
        py = y + 6 + Math.floor(i / 2) * (h / 2);
      g.fillStyle = "#f2efe6";
      g.fillRect(px, py, w / 2 - 12, h / 2 - 12);
      g.fillStyle = "#16161a";
      fit(g, t, px + (w / 2 - 12) / 2, py + 14, w / 2 - 20, 16, 900);
      g.fillStyle = "#9a968c";
      for (let l = 0; l < 3; l++) g.fillRect(px + 6, py + 28 + l * 8, w / 2 - 24, 3);
    });
  }
  // the bins' openings' labels, the hot snacks' menu
  {
    const [x, y, w, h] = CELLS.get("bins")!;
    const cols = ["#2a6ad8", "#43a86a", "#e8463a", "#f4b728"];
    cols.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(x + (i * w) / 4, y, w / 4, h);
      g.fillStyle = "#16161a";
      g.fillRect(x + (i * w) / 4 + 6, y + 24, w / 4 - 12, 18);
    });
  }
  {
    const [x, y, w, h] = CELLS.get("menu")!;
    g.fillStyle = "#24262c";
    g.fillRect(x, y, w, h);
    g.fillStyle = "#ffd28a";
    fit(g, "HOT SNACKS", x + w / 2, y + 18, w - 10, 16, 900);
    g.fillStyle = "#f2efe6";
    ["KARAAGE  ⓩ2", "NIKUMAN ⓩ1", "ODEN     ⓩ3", "COFFEE   ⓩ1"].forEach((t, i) => fit(g, t, x + w / 2, y + 44 + i * 22, w - 12, 14, 700));
  }
  mallView(g, ...CELLS.get("mallin")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  atlasTex = t;
  return t;
}

let atlasMat: THREE.MeshStandardMaterial | null = null;
/** The atlas's material: the picture lit from within (a lightbox), brighter at night. */
export function martMat() {
  if (atlasMat) return atlasMat;
  const t = martAtlas();
  // (its own light carries the picture: the street's lamps add only a little on top, no glare at night)
  const m = new THREE.MeshStandardMaterial({ map: t, color: "#8a8a8a", emissiveMap: t, emissive: "#ffffff", emissiveIntensity: 1, roughness: 0.32, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = GLASS_NIGHT;
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uNight;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.55, 0.8, uNight);");
  };
  m.customProgramCacheKey = () => "mart-atlas";
  m.userData.shared = true;
  atlasMat = m;
  return m;
}

/** The quads on the atlas, collected and drawn in one mesh. */
export class MartDecals {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  /** A quad: a b c d = bottom-left, bottom-right, top-right, top-left seen from the front (n), the atlas cell `key` (or a part of it: u0…u1, v0…v1 of the cell). */
  quad(key: string, a: V3, b: V3, c: V3, d: V3, n: V3, part: [number, number, number, number] = [0, 1, 0, 1]) {
    const cell = CELLS.get(key);
    if (!cell) return;
    const [cx, cy, cw, ch] = cell;
    // (a canvas texture is flipped: the canvas's top is v = 1)
    const U = (k: number) => (cx + (k * cw)) / AW,
      V = (k: number) => 1 - (cy + (1 - k) * ch) / AH;
    const uvs = [
      [U(part[0]) + 0.5 / AW, V(part[2]) + 0.5 / AH],
      [U(part[1]) - 0.5 / AW, V(part[2]) + 0.5 / AH],
      [U(part[1]) - 0.5 / AW, V(part[3]) - 0.5 / AH],
      [U(part[0]) + 0.5 / AW, V(part[3]) - 0.5 / AH],
    ];
    const i0 = this.pos.length / 3;
    for (const [k, p] of [a, b, c, d].entries()) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[k][0], uvs[k][1]);
    }
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    else this.idx.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
  }

  /** A quad of w × h centred at (x, y, z) facing the horizontal `n` (its text upright, read from in front). */
  facing(key: string, x: number, y: number, z: number, n: V3, w: number, h: number) {
    // (seen from in front, looking along −n: the right hand is (−n) × up)
    const rx = n[2],
      rz = -n[0];
    const a: V3 = [x - (rx * w) / 2, y - h / 2, z - (rz * w) / 2],
      b: V3 = [x + (rx * w) / 2, y - h / 2, z + (rz * w) / 2];
    this.quad(key, a, b, [b[0], y + h / 2, b[2]], [a[0], y + h / 2, a[2]], n);
  }

  /** A quad on a frame's front plane at d, from (u0, y0) to (u1, y1). */
  onFront(F: Frame, key: string, u0: number, u1: number, y0: number, y1: number, d: number, part?: [number, number, number, number]) {
    this.quad(key, F.P(u0, y0, d), F.P(u1, y0, d), F.P(u1, y1, d), F.P(u0, y1, d), F.n, part);
  }

  /** The decals as one mesh (null: none), placed at its own centre. */
  mesh(name: string) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, martMat());
    m.position.copy(c);
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = false;
    // (its matrix left live: an island's content is moved as a whole once built)
    return m;
  }
}

// ---- the stores ----------------------------------------------------------------------------------

const WHITE_WALL = hex("#f1efea");
const STEEL = hex("#9ea3aa");
const DARK = hex("#2a2c30");

/** Outside things along a store's front: the ATM, the ice freezer, the newspaper rack, the bins (u from…to on the walk in front, at depth d). */
function frontThings(K: Kit, A: MartDecals, F: Frame, c: Chain, y0: number, d: number, slots: ("atm" | "ice" | "news" | "bins" | "bin")[], at: number[], out: MartOut) {
  slots.forEach((s, i) => {
    const u = at[i];
    if (s === "atm") {
      // a stand-alone ATM: its grey body, the face on the atlas, a little hood
      F.box(K, "lm.paint", u - 0.42, u + 0.42, y0, y0 + 1.72, d, d + 0.7, hex("#c9ced4"));
      F.box(K, "lm.paint", u - 0.46, u + 0.46, y0 + 1.72, y0 + 1.86, d - 0.02, d + 0.82, hex(c.band));
      A.onFront(F, "atm", u - 0.38, u + 0.38, y0 + 0.2, y0 + 1.68, d + 0.705);
      out.boxes.push(F.foot(u - 0.42, u + 0.42, d, d + 0.7));
    } else if (s === "ice") {
      F.box(K, "lm.paint", u - 0.7, u + 0.7, y0, y0 + 1.05, d, d + 0.78, hex("#f4f6f8"));
      F.box(K, "lm.paint", u - 0.72, u + 0.72, y0 + 1.05, y0 + 1.12, d - 0.01, d + 0.8, hex("#c8d0d8"));
      A.onFront(F, "ice", u - 0.64, u + 0.64, y0 + 0.12, y0 + 0.98, d + 0.785);
      out.boxes.push(F.foot(u - 0.7, u + 0.7, d, d + 0.78));
    } else if (s === "news") {
      // a wire rack, the papers in it facing out
      F.box(K, "lm.dark", u - 0.48, u + 0.48, y0, y0 + 0.08, d, d + 0.42, DARK);
      for (const su of [-0.46, 0.44]) F.box(K, "lm.dark", u + su, u + su + 0.04, y0, y0 + 1.15, d, d + 0.42, DARK);
      A.quad("news", F.P(u - 0.44, y0 + 0.3, d + 0.4), F.P(u + 0.44, y0 + 0.3, d + 0.4), F.P(u + 0.44, y0 + 1.1, d + 0.2), F.P(u - 0.44, y0 + 1.1, d + 0.2), [F.n[0] * 0.92, 0.38, F.n[2] * 0.92]);
      out.boxes.push(F.foot(u - 0.48, u + 0.48, d, d + 0.42));
    } else if (s === "bins") {
      // the sorting bins: a box with four openings, the chain's colour on its lid
      F.box(K, "lm.paint", u - 0.82, u + 0.82, y0, y0 + 0.98, d, d + 0.52, hex("#e4e6e8"));
      F.box(K, "lm.paint", u - 0.84, u + 0.84, y0 + 0.98, y0 + 1.04, d - 0.01, d + 0.54, hex(c.band));
      A.onFront(F, "bins", u - 0.8, u + 0.8, y0 + 0.7, y0 + 0.96, d + 0.525);
      out.boxes.push(F.foot(u - 0.82, u + 0.82, d, d + 0.52));
    } else {
      const p = F.P(u, 0, d + 0.35);
      out.props.push({ type: "trashBin", args: [], x: p[0], z: p[2], y: y0, rot: 0 });
    }
  });
}

/** A bike rack: steel hoops in a row along u (from u0, n hoops), at depth d. */
function bikeRack(K: Kit, F: Frame, y0: number, u0: number, n: number, d: number, out: MartOut, bikes = 2) {
  for (let k = 0; k < n; k++) {
    const u = u0 + k * 0.9;
    const a = F.P(u, y0, d),
      b = F.P(u, y0, d + 0.9);
    K.bar("lm.Metal032.metal", a, [a[0], y0 + 0.8, a[2]], 0.05, STEEL);
    K.bar("lm.Metal032.metal", b, [b[0], y0 + 0.8, b[2]], 0.05, STEEL);
    K.bar("lm.Metal032.metal", [a[0], y0 + 0.8, a[2]], [b[0], y0 + 0.8, b[2]], 0.05, STEEL);
  }
  for (let k = 0; k < Math.min(bikes, n); k++) {
    const p = F.P(u0 + k * 0.9 + 0.45, 0, d + 0.45);
    // (a bicycle's frame runs along x at rot 0: across the rack's line, into it)
    out.props.push({ type: "bicycle", args: [["#c03a3a", "#2a5aa0", "#e8e4da", "#2a2a2a"][k % 4]], x: p[0], z: p[2], y: y0, rot: F.ox === 0 ? Math.PI / 2 : 0 });
  }
}

export interface StoreSpot {
  chain: ChainKey;
  face: Face;
  /** The lot's front line (the pavement's back, or the kerb), its centre along it. */
  front: number;
  at: number;
  /** The store's frontage and depth (m). */
  w: number;
  d: number;
  /** Parking bays on the forecourt in front (0: the store's glass a walk's width behind the line). */
  bays?: number;
  /** The pylon sign at the forecourt's corner: -1 left, 1 right (seen from the street), 0 none. */
  pylon?: -1 | 0 | 1;
  /** The ground's height. */
  y0: number;
}

/**
 * The stand-alone store: one storey of white walls under a flat roof and its parapet, a lit fascia in
 * the chain's colours round the front corners, a full glass front with the shop bright behind it
 * (OPEN 24H, posters), the sliding door; the canopy's lights over the walk; the ATM, the ice freezer,
 * the newspapers, the bins along the front; a bike rack at the end; the forecourt's parking bays and
 * the pylon sign by the street.
 */
export function store(K: Kit, A: MartDecals, s: StoreSpot, out: MartOut) {
  const c = CHAINS[s.chain];
  const F = frontFrame(s.face, s.front, s.at);
  const y0 = s.y0;
  const bays = s.bays ?? 0;
  const fd = bays > 0 ? 7.2 : 2.2;
  // the glass front's line (d) and the back's
  const g0 = -fd,
    gb = g0 - s.d;
  const hw = s.w / 2;
  const H = 4.4;
  // the body, its parapet, the roof's slab and plant
  F.box(K, "plaster", -hw, hw, y0, y0 + H, gb, g0, WHITE_WALL, "-y");
  F.box(K, "lm.Concrete034", -hw - 0.12, hw + 0.12, y0 + H, y0 + H + 0.75, gb - 0.12, g0 + 0.12, hex("#d4d0c8"), "-y");
  F.box(K, "lm.Concrete034", -hw + 0.3, hw - 0.3, y0 + H + 0.05, y0 + H + 0.12, gb + 0.3, g0 - 0.3, hex("#8a8884"));
  F.box(K, "lm.Metal032.metal", -hw + 1.5, -hw + 3.4, y0 + H, y0 + H + 1.3, gb + 1.2, gb + 2.6, hex("#c4c8cc"));
  F.box(K, "lm.Metal032.metal", hw - 3.2, hw - 1.6, y0 + H, y0 + H + 1.1, gb + 1.2, gb + 2.4, hex("#c4c8cc"));
  // a plinth of dark tiles along the foot of the walls
  F.box(K, "lm.paint", -hw - 0.03, hw + 0.03, y0, y0 + 0.35, gb - 0.03, g0 + 0.03, hex("#3a3c40"), "-y+y");
  out.boxes.push(F.foot(-hw, hw, gb, g0));
  // the glass front: the shop seen through it, bay by bay, its mullions; a low bulkhead
  const doorU = hw - 3.2;
  const gl0 = -hw + 0.3,
    gl1 = hw - 0.3;
  F.box(K, "lm.paint", gl0, gl1, y0 + 0.02, y0 + 0.5, g0, g0 + 0.08, hex(c.stripe === "#ffffff" || c.stripe === "#f4f2ee" ? "#3a3c40" : c.stripe));
  const span = gl1 - gl0;
  const nb = Math.max(1, Math.round(span / 4.6));
  for (let k = 0; k < nb; k++) {
    const u0 = gl0 + (span * k) / nb,
      u1 = gl0 + (span * (k + 1)) / nb;
    // (the door's opening shows the shop too, down to the floor)
    A.onFront(F, `inside:${c.key}`, u0, u1, y0 + 0.5, y0 + 3.05, g0 + 0.04);
  }
  A.onFront(F, `inside:${c.key}`, doorU - 0.95, doorU + 0.95, y0 + 0.02, y0 + 0.5, g0 + 0.09, [0.62, 0.86, 0, 0.2]);
  for (let k = 0; k <= nb; k++) {
    const u = gl0 + (span * k) / nb;
    F.box(K, "lm.dark", u - 0.05, u + 0.05, y0, y0 + 3.1, g0, g0 + 0.14, DARK);
  }
  F.box(K, "lm.dark", gl0, gl1, y0 + 3.05, y0 + 3.2, g0, g0 + 0.14, DARK);
  // the sliding doors: two leaves in a steel frame (one slid a little open)
  F.box(K, "lm.Metal032.metal", doorU - 1.0, doorU + 1.0, y0 + 2.45, y0 + 2.6, g0 + 0.08, g0 + 0.2, STEEL);
  for (const su of [-1, 1]) F.box(K, "lm.Metal032.metal", doorU + su * 0.95 - 0.04, doorU + su * 0.95 + 0.04, y0, y0 + 2.45, g0 + 0.08, g0 + 0.2, STEEL);
  F.box(K, "lm.Metal032.metal", doorU - 0.03, doorU + 0.03, y0, y0 + 2.45, g0 + 0.16, g0 + 0.2, STEEL);
  // OPEN 24H and the posters on the glass
  A.onFront(F, `open:${c.key}`, doorU - 0.9, doorU + 0.9, y0 + 2.62, y0 + 3.0, g0 + 0.1);
  A.onFront(F, `open:${c.key}`, -hw + 0.6, -hw + 2.3, y0 + 2.55, y0 + 2.9, g0 + 0.1);
  for (let k = 0; k < 3 && -hw + 0.8 + k * 1.1 < doorU - 2.4; k++) A.onFront(F, `poster:${(k + c.key.length) % 4}`, -hw + 0.7 + k * 1.1, -hw + 1.5 + k * 1.1, y0 + 0.7, y0 + 2.3, g0 + 0.1);
  // the fascia: lit in the chain's colours round the front and its two corners, the name on the front
  const fy0 = y0 + 3.25,
    fy1 = y0 + 4.55;
  F.box(K, "lm.glow", -hw - 0.15, hw + 0.15, fy0, fy1, g0 - 2.4, g0 + 0.6, hex(c.band, 0.9), "-y");
  F.box(K, "lm.glow", -hw - 0.16, hw + 0.16, fy0, fy0 + 0.2, g0 - 2.4, g0 + 0.61, hex(c.stripe, 0.8), "+y");
  A.onFront(F, `fascia:${c.key}`, -hw - 0.15, hw + 0.15, fy0, fy1, g0 + 0.615);
  // the canopy over the walk in front, its light strip
  F.box(K, "lm.Metal032.metal", -hw - 0.1, hw + 0.1, y0 + 3.12, y0 + 3.25, g0, g0 + 1.6, hex("#e8eaec"));
  F.box(K, "lm.glow", -hw + 0.3, hw - 0.3, y0 + 3.1, y0 + 3.12, g0 + 0.4, g0 + 1.2, hex("#f6fbff", 0.9));
  const lp = F.P(0, y0 + 3.0, g0 + 1.4);
  out.lamps.push([lp[0], lp[1], lp[2], "#eef6ff"]);
  // the walk's things: the ATM and the ice freezer at the left, the newspapers, the bins by the door
  const wd = g0 + 0.15;
  frontThings(K, A, F, c, y0, wd, ["atm", "ice", "news", "bins"], [-hw + 0.75, -hw + 2.15, doorU - 2.2, hw - 1.0], out);
  // the door's facade
  out.facades.push(doorOf(F, s.face, s.front, doorU, g0, 2, c.name));
  // a mat at the door
  F.box(K, "lm.dark", doorU - 0.9, doorU + 0.9, y0, y0 + 0.012, g0 + 0.2, g0 + 1.2, hex("#2a2a2e"));
  if (bays > 0) {
    // the forecourt: the bays' lines, wheel stops, a bike rack at its end
    const bw = 2.6;
    const n = Math.min(bays, Math.floor((s.w - 1.5) / bw));
    const b0 = -((n * bw) / 2);
    const dz0 = g0 + 1.7,
      dz1 = -0.5;
    for (let k = 0; k <= n; k++) {
      const u = b0 + k * bw;
      F.box(K, "lm.paint", u - 0.06, u + 0.06, y0, y0 + 0.014, dz0, dz1, hex("#f2f2ee"));
    }
    F.box(K, "lm.paint", b0, b0 + n * bw, y0, y0 + 0.014, dz0 - 0.06, dz0 + 0.06, hex("#f2f2ee"));
    for (let k = 0; k < n; k++) {
      const u = b0 + (k + 0.5) * bw;
      F.box(K, "lm.Concrete034", u - 0.8, u + 0.8, y0, y0 + 0.13, dz0 + 0.45, dz0 + 0.65, hex("#e8e4da"));
      const p = F.P(u, 0, (dz0 + dz1) / 2 + 0.3);
      out.bays.push({ x: p[0], z: p[2], rot: F.ox === 0 ? (F.oz > 0 ? -Math.PI / 2 : Math.PI / 2) : F.ox > 0 ? Math.PI : 0 });
    }
    // the pylon sign by the street: a steel post, the chain's square both ways along the street
    if (s.pylon) {
      // the pylon sign by the street: a steel post, the chain's square both ways along the street
      const u = s.pylon * (hw - 0.6),
        dd = -1.2;
      F.box(K, "lm.Metal032.metal", u - 0.14, u + 0.14, y0, y0 + 4.6, dd - 0.14, dd + 0.14, hex("#d8dadc"));
      F.box(K, "lm.paint", u - 0.26, u + 0.26, y0 + 4.4, y0 + 6.6, dd - 1.0, dd + 1.0, hex(c.band));
      for (const su of [-1, 1]) {
        const p = F.P(u + su * 0.27, y0 + 5.5, dd);
        const q = F.P(u + su, 0, dd);
        const r = F.P(u, 0, dd);
        A.facing(`logo:${c.key}`, p[0], p[1], p[2], [Math.sign(q[0] - r[0]), 0, Math.sign(q[2] - r[2])], 1.9, 1.9);
      }
      out.boxes.push(F.foot(u - 0.3, u + 0.3, dd - 0.3, dd + 0.3));
    }
  }
}

export interface FrontSpot {
  chain: ChainKey;
  face: Face;
  /** The building's front wall (its line), the shopfront's centre along it, its width. */
  front: number;
  at: number;
  w: number;
  y0: number;
  /** The old town's kiosk: a narrow front, a dark board for its name, A-boards out on the pavement. */
  kiosk?: boolean;
  /** Leave the bike rack and the bin out (a pavement too narrow). */
  bare?: boolean;
}

/**
 * The konbini on a building's ground floor: the fascia lit in the chain's colours across the front
 * (out a hand from the wall), the glass with the bright shop behind it, OPEN 24H and posters, the
 * door; a bin and a bike rack on the pavement. The kiosk: the same, narrower, the name on a dark
 * board, the newspapers' A-boards outside.
 */
export function front(K: Kit, A: MartDecals, s: FrontSpot, out: MartOut) {
  const c = CHAINS[s.chain];
  const F = frontFrame(s.face, s.front, s.at);
  const y0 = s.y0;
  const hw = s.w / 2;
  const doorU = s.kiosk ? -hw + 1.0 : hw - 1.4;
  // a frame of dark metal round the opening, the bulkhead, the glass bays with the shop behind
  F.box(K, "lm.dark", -hw, hw, y0, y0 + 0.45, -0.05, 0.1, DARK, "-y");
  F.box(K, "lm.dark", -hw - 0.12, -hw + 0.06, y0, y0 + 3.0, -0.05, 0.14, DARK);
  F.box(K, "lm.dark", hw - 0.06, hw + 0.12, y0, y0 + 3.0, -0.05, 0.14, DARK);
  const span = s.w - 0.2;
  const nb = Math.max(1, Math.round(span / 4.4));
  for (let k = 0; k < nb; k++) {
    const u0 = -hw + 0.1 + (span * k) / nb,
      u1 = -hw + 0.1 + (span * (k + 1)) / nb;
    A.onFront(F, `inside:${c.key}`, u0, u1, y0 + 0.45, y0 + 2.9, 0.06);
    if (k) F.box(K, "lm.dark", u0 - 0.04, u0 + 0.04, y0, y0 + 2.9, 0.0, 0.12, DARK);
  }
  A.onFront(F, `inside:${c.key}`, doorU - 0.8, doorU + 0.8, y0 + 0.02, y0 + 0.45, 0.105, [0.62, 0.86, 0, 0.2]);
  F.box(K, "lm.Metal032.metal", doorU - 0.85, doorU + 0.85, y0 + 2.35, y0 + 2.48, 0.04, 0.16, STEEL);
  for (const su of [-1, 1]) F.box(K, "lm.Metal032.metal", doorU + su * 0.8 - 0.04, doorU + su * 0.8 + 0.04, y0, y0 + 2.35, 0.04, 0.16, STEEL);
  // OPEN 24H, posters
  if (!s.kiosk) {
    A.onFront(F, `open:${c.key}`, doorU - 0.75, doorU + 0.75, y0 + 2.5, y0 + 2.82, 0.12);
    for (let k = 0; k < 2 && -hw + 0.6 + k * 1.0 < doorU - 2; k++) A.onFront(F, `poster:${(k + c.key.length + 1) % 4}`, -hw + 0.5 + k * 1.0, -hw + 1.2 + k * 1.0, y0 + 0.65, y0 + 2.0, 0.12);
  } else A.onFront(F, `poster:${c.key.length % 4}`, hw - 1.1, hw - 0.35, y0 + 0.7, y0 + 2.0, 0.12);
  // the fascia: a lit box across the front, the name on it
  const fy0 = y0 + 3.0,
    fy1 = y0 + (s.kiosk ? 3.7 : 3.95);
  if (s.kiosk) {
    F.box(K, "lm.paint", -hw - 0.05, hw + 0.05, fy0 - 0.05, fy1 + 0.05, -0.02, 0.26, hex("#1e2024"));
    A.onFront(F, `fascia:${c.key}`, -hw + 0.08, hw - 0.08, fy0 + 0.04, fy1 - 0.04, 0.265);
  } else {
    F.box(K, "lm.glow", -hw - 0.05, hw + 0.05, fy0, fy1, -0.02, 0.42, hex(c.band, 0.9));
    A.onFront(F, `fascia:${c.key}`, -hw - 0.05, hw + 0.05, fy0, fy1, 0.425);
    // its light down onto the pavement
    F.box(K, "lm.glow", -hw + 0.2, hw - 0.2, fy0 - 0.02, fy0, 0.1, 0.36, hex("#f6fbff", 0.85));
  }
  const lp = F.P(0, y0 + 2.9, 1.2);
  out.lamps.push([lp[0], lp[1], lp[2], "#eef6ff"]);
  out.facades.push(doorOf(F, s.face, s.front, doorU, 0, 1.6, c.name));
  if (s.kiosk) {
    // the newspapers' A-boards out on the pavement, either side of the door
    for (const u of [doorU - 1.3, hw + 0.6]) {
      const a = F.P(u - 0.32, y0, 0.9),
        b = F.P(u + 0.32, y0, 0.9),
        cc = F.P(u + 0.32, y0 + 1.0, 0.55),
        d = F.P(u - 0.32, y0 + 1.0, 0.55);
      F.box(K, "lm.dark", u - 0.34, u + 0.34, y0, y0 + 1.02, 0.5, 0.92, DARK);
      A.quad("news", a, b, cc, d, [F.n[0] * 0.94, 0.33, F.n[2] * 0.94], [0, 0.5, 0, 1]);
      out.boxes.push(F.foot(u - 0.34, u + 0.34, 0.5, 0.92));
    }
  } else if (!s.bare) {
    out.props.push({ type: "trashBin", args: [], ...xz(F.P(doorU + 1.4 > hw ? hw + 0.5 : doorU + 1.4, 0, 0.45)), y: y0, rot: 0 });
    bikeRack(K, F, y0, -hw + 0.4, 2, 0.15, out, 1);
  }
}
const xz = (p: V3) => ({ x: p[0], z: p[2] });

/**
 * A konbini on the ground floor of a block of flats (the city's denser corners): the shop's storey in
 * plaster, three floors of flats over it in a photographed facade, the parapet and the roof's plant —
 * set back a little from the line so the store's bin and bike rack stand off the pavement — and the
 * store's front (`front`) on it.
 */
export function konbiniHouse(K: Kit, A: MartDecals, s: StoreSpot & { floors?: number; slot?: string; col?: string }, out: MartOut) {
  const F = frontFrame(s.face, s.front, s.at);
  const y0 = s.y0;
  const hw = s.w / 2;
  const set = 1.2;
  const gf = 4.3,
    H = gf + (s.floors ?? 3) * 3.4;
  F.box(K, "plaster", -hw, hw, y0, y0 + gf, -set - s.d, -set, hex("#ebe7e0"), "-y");
  F.box(K, s.slot ?? "f019", -hw, hw, y0 + gf, y0 + H, -set - s.d, -set, hex(s.col ?? "#ddd6ca"), "-y", 3.4);
  F.box(K, "lm.Concrete034", -hw - 0.12, hw + 0.12, y0 + H, y0 + H + 0.9, -set - s.d - 0.12, -set + 0.12, hex("#c8c4bc"), "-y");
  F.box(K, "lm.Metal032.metal", -hw + 1.2, -hw + 4, y0 + H, y0 + H + 1.6, -set - s.d + 1, -set - s.d + 3.4, hex("#b8bcc2"));
  F.box(K, "lm.dark", -hw, hw, y0 + gf - 0.12, y0 + gf + 0.05, -set - 0.02, -set + 0.12, hex("#3a3c40"));
  out.boxes.push(F.foot(-hw, hw, -set - s.d, -set));
  front(K, A, { chain: s.chain, face: s.face, front: s.front - set * (F.ox || F.oz), at: s.at, w: s.w - 0.5, y0 }, out);
}

// ---- the malls ----------------------------------------------------------------------------------

export interface MallSpot {
  mall: string;
  face: Face;
  /** The box's front line, its centre along it, its frontage, its depth back from the front, its height. */
  front: number;
  at: number;
  w: number;
  d: number;
  h: number;
  y0: number;
  /** The atrium's width (centred at `atU` along the front), how far it stands out. */
  atrium: number;
  atU?: number;
  /** The anchors' blocks along the front: [u0, u1, index of the mall's anchors, a door into the mall]. */
  anchors: [number, number, number, boolean][];
  /** The cladding's colour, and its material (metal panels; an old town's: plaster). */
  clad?: string;
  cladSlot?: string;
}

/**
 * A mall's big box: cladding in panels over a stone plinth, the parapet's light strip in the mall's
 * accent; the glass atrium standing out over the entrance (mullions, its lit inside, the doors), the
 * mall's name over it; the anchor stores' blocks standing a little proud along the front, each with its
 * sign, its glass entrance and canopy; banners down the front; the roof's plant. Its doors: the
 * atrium's, and the anchors' that open into the mall.
 */
export function mall(K: Kit, A: MartDecals, s: MallSpot, out: MartOut) {
  const m = MALLS[s.mall];
  const F = frontFrame(s.face, s.front, s.at);
  const y0 = s.y0;
  const hw = s.w / 2;
  const clad = hex(s.clad ?? "#dcdad6");
  // the body: cladding over the plinth, the reveals between the panels, the parapet
  F.box(K, s.cladSlot ?? "lm.Metal024.metal", -hw, hw, y0 + 1.2, y0 + s.h, -s.d, 0, clad, "-y");
  F.box(K, "lm.Concrete034", -hw - 0.05, hw + 0.05, y0, y0 + 1.2, -s.d - 0.05, 0.05, hex("#b8b2a8"), "-y");
  for (let y = 5.6; y < s.h - 1; y += 4.4) F.box(K, "lm.dark", -hw - 0.04, hw + 0.04, y0 + y - 0.06, y0 + y + 0.06, -s.d - 0.04, 0.04, hex("#6a6c70"));
  F.box(K, "lm.Concrete034", -hw - 0.2, hw + 0.2, y0 + s.h, y0 + s.h + 0.9, -s.d - 0.2, 0.2, hex("#c8c4bc"), "-y");
  F.box(K, "lm.glow", -hw - 0.22, hw + 0.22, y0 + s.h + 0.55, y0 + s.h + 0.7, -s.d - 0.22, 0.22, hex(m.accent, 0.85), "-y+y");
  // the roof's plant and its skylight's ridge
  F.box(K, "lm.Metal032.metal", -hw + 6, -hw + 14, y0 + s.h, y0 + s.h + 2.2, -s.d + 6, -s.d + 12, hex("#b8bcc2"));
  F.box(K, "lm.Metal032.metal", hw - 16, hw - 8, y0 + s.h, y0 + s.h + 1.8, -s.d + 8, -s.d + 14, hex("#b8bcc2"));
  out.boxes.push(F.foot(-hw, hw, -s.d, 0));
  // the atrium: a glass box standing out over the entrance, mullions and transoms in white steel
  const aU = s.atU ?? 0,
    aw = s.atrium / 2,
    ad = 6;
  const ah = s.h + 3;
  // (inside the glass: the atrium's lit back wall, its galleries' edges and their light)
  F.box(K, "lm.glow", aU - aw + 0.3, aU + aw - 0.3, y0 + 0.1, y0 + ah - 0.4, 0.1, 0.2, hex("#ffe2b4", 0.42));
  for (let y = 5.2; y < ah - 2; y += 5.2) {
    F.box(K, "lm.Concrete034", aU - aw + 0.3, aU + aw - 0.3, y0 + y - 0.45, y0 + y, 0.2, 2.6, hex("#f2eee6"));
    F.box(K, "lm.glow", aU - aw + 0.4, aU + aw - 0.4, y0 + y - 0.47, y0 + y - 0.45, 0.4, 2.4, hex("#fff0d6", 0.7));
  }
  F.box(K, "lm.glass.clear", aU - aw, aU + aw, y0 + 3.4, y0 + ah, 0.2, ad, hex("#cfe0ea"), "-y");
  for (const su of [-1, 1]) F.box(K, "lm.glass.clear", aU + su * aw - 0.05, aU + su * aw + 0.05, y0, y0 + 3.4, 0.2, ad, hex("#cfe0ea"));
  A.onFront(F, "mallin", aU - aw + 0.4, aU + aw - 0.4, y0 + 0.05, y0 + 3.35, ad - 0.05);
  for (let u = aU - aw; u <= aU + aw + 0.01; u += aw / 3) F.box(K, "lm.Metal032.metal", u - 0.14, u + 0.14, y0, y0 + ah, ad - 0.1, ad + 0.12, hex("#f2f2f0"));
  for (let y = 3.4; y <= ah + 0.01; y += 3.6) F.box(K, "lm.Metal032.metal", aU - aw, aU + aw, y0 + y - 0.12, y0 + y + 0.12, ad - 0.1, ad + 0.12, hex("#f2f2f0"));
  for (const su of [-1, 1]) for (let dd = 0.2; dd <= ad; dd += ad / 2) F.box(K, "lm.Metal032.metal", aU + su * aw - 0.12, aU + su * aw + 0.12, y0, y0 + ah, dd - 0.12, dd + 0.12, hex("#f2f2f0"));
  F.box(K, "lm.Metal032.metal", aU - aw - 0.3, aU + aw + 0.3, y0 + ah, y0 + ah + 0.5, -0.2, ad + 0.3, hex("#f2f2f0"));
  // its canopy over the doors, lit underneath
  F.box(K, "lm.Metal032.metal", aU - 5, aU + 5, y0 + 3.4, y0 + 3.7, ad, ad + 3.2, hex("#e8eaec"));
  F.box(K, "lm.glow", aU - 4.6, aU + 4.6, y0 + 3.38, y0 + 3.4, ad + 0.3, ad + 2.9, hex("#fff2dc", 0.9));
  // the mall's name across the atrium's top, on its own board
  const nw = Math.min(s.atrium - 1, 30),
    nh = nw / 8;
  F.box(K, "lm.paint", aU - nw / 2 - 0.25, aU + nw / 2 + 0.25, y0 + ah - 1.0 - nh, y0 + ah - 0.6, ad + 0.12, ad + 0.4, hex(m.band));
  A.onFront(F, `mall:${m.key}`, aU - nw / 2, aU + nw / 2, y0 + ah - 0.8 - nh, y0 + ah - 0.8, ad + 0.41);
  const lp = F.P(aU, y0 + 3.2, ad + 2);
  out.lamps.push([lp[0], lp[1], lp[2], "#fff0d8"]);
  out.facades.push(doorOf(F, s.face, s.front, aU, ad, 4, m.name));
  out.boxes.push(F.foot(aU - aw, aU + aw, 0, ad));
  // the anchors: blocks standing out, their own cladding colour, sign, glass entrance and canopy
  for (const [u0, u1, ai, door] of s.anchors) {
    const col = hex(ai % 2 ? m.accent : m.band, ai % 2 ? 0.85 : 1);
    const ah2 = Math.min(s.h - 1, 14);
    F.box(K, "lm.paint", u0, u1, y0 + 1.2, y0 + ah2, 0, 1.6, col, "-y");
    F.box(K, "lm.Concrete034", u0, u1, y0, y0 + 1.2, 0, 1.6, hex("#b8b2a8"), "-y");
    const cu = (u0 + u1) / 2;
    const sw = Math.min(u1 - u0 - 2, 16);
    A.onFront(F, `anchor:${m.key}:${ai}`, cu - sw / 2, cu + sw / 2, y0 + ah2 - 3.2, y0 + ah2 - 3.2 + sw / 8, 1.62);
    // the entrance: glass doors, the shop's light behind, a canopy
    A.onFront(F, "mallin", cu - 2.95, cu + 2.95, y0 + 0.05, y0 + 3.15, 1.59, [0.2, 0.8, 0, 0.6]);
    F.box(K, "lm.glass.clear", cu - 3, cu + 3, y0 + 0.05, y0 + 3.2, 1.6, 1.68, hex("#cfe0ea"));
    for (const du of [-3, -1, 1, 3]) F.box(K, "lm.Metal032.metal", cu + du - 0.06, cu + du + 0.06, y0, y0 + 3.2, 1.6, 1.72, STEEL);
    F.box(K, "lm.Metal032.metal", cu - 3.6, cu + 3.6, y0 + 3.3, y0 + 3.55, 1.6, 3.8, hex("#e8eaec"));
    F.box(K, "lm.glow", cu - 3.3, cu + 3.3, y0 + 3.28, y0 + 3.3, 1.8, 3.6, hex("#fff2dc", 0.85));
    out.boxes.push(F.foot(u0, u1, 0, 1.6));
    if (door) out.facades.push(doorOf(F, s.face, s.front, cu, 1.6, 3, m.name));
  }
  // banners down the front between the anchors and the atrium
  for (let u = -hw + 4; u < hw - 3; u += 9) {
    if (Math.abs(u - aU) < aw + 2.5 || s.anchors.some(([a0, a1]) => u > a0 - 2 && u < a1 + 2)) continue;
    A.onFront(F, `banner:${m.key}`, u - 0.9, u + 0.9, y0 + Math.max(4.5, s.h - 10.5), y0 + s.h - 3.3, 0.06);
  }
}

/** A car park's decks on columns (a multi-storey car park): slabs, their edges' parapets, lights under them, the P sign, a ramp's hint. */
export function parkade(K: Kit, A: MartDecals, s: { face: Face; front: number; at: number; w: number; d: number; levels: number; y0: number }, out: MartOut) {
  const F = frontFrame(s.face, s.front, s.at);
  const y0 = s.y0;
  const hw = s.w / 2;
  const lh = 3.1;
  for (let l = 1; l <= s.levels; l++) {
    const y = y0 + l * lh;
    F.box(K, "lm.Concrete034", -hw, hw, y - 0.35, y, -s.d, 0, hex("#c4c0b8"));
    // the parapets: concrete rails, open between them
    F.box(K, "lm.Concrete034", -hw, hw, y, y + 1.05, -0.3, 0, hex("#d8d4cc"));
    F.box(K, "lm.Concrete034", -hw, hw, y, y + 1.05, -s.d, -s.d + 0.3, hex("#d8d4cc"));
    F.box(K, "lm.Concrete034", -hw, -hw + 0.3, y, y + 1.05, -s.d, 0, hex("#d8d4cc"));
    F.box(K, "lm.Concrete034", hw - 0.3, hw, y, y + 1.05, -s.d, 0, hex("#d8d4cc"));
    F.box(K, "lm.glow", -hw + 1, hw - 1, y - 0.37, y - 0.35, -s.d + 2, -2, hex("#e8f0ff", 0.55));
  }
  for (let u = -hw + 0.4; u <= hw - 0.3; u += 7.5) for (let dd = -0.4; dd >= -s.d + 0.3; dd -= 7.5) F.box(K, "lm.Concrete034", u - 0.3, u + 0.3, y0, y0 + s.levels * lh, dd - 0.3, dd + 0.3, hex("#cfcac2"));
  // the ground floor's back wall and side wall (the street's side open: its way in)
  F.box(K, "lm.Concrete034", -hw, hw, y0, y0 + lh - 0.35, -s.d, -s.d + 0.3, hex("#cfcac2"));
  // the P sign up on its corner, lit
  const pu = hw - 1.2;
  F.box(K, "lm.paint", pu - 0.9, pu + 0.9, y0 + s.levels * lh + 0.3, y0 + s.levels * lh + 2.3, -0.2, 0.05, hex("#1f5aa8"));
  A.onFront(F, "parking", pu - 0.85, pu + 0.85, y0 + s.levels * lh + 0.35, y0 + s.levels * lh + 2.25, 0.06);
  // (a body stops at the columns and the back wall; the decks are seen, not walked)
  out.boxes.push(F.foot(-hw, hw, -s.d, -s.d + 0.3));
  for (let u = -hw + 0.4; u <= hw - 0.3; u += 7.5) for (let dd = -0.4; dd >= -s.d + 0.3; dd -= 7.5) out.boxes.push(F.foot(u - 0.3, u + 0.3, dd - 0.3, dd + 0.3));
}

/** An open car park: bays painted in rows along u (rows of depth 5.2, an aisle between), lamp posts, wheel stops. */
export function lot(K: Kit, s: { face: Face; front: number; at: number; w: number; d: number; y0: number; asphalt?: boolean }, out: MartOut) {
  const F = frontFrame(s.face, s.front, s.at);
  const y0 = s.y0;
  const hw = s.w / 2;
  if (s.asphalt !== false) F.box(K, "lm.Concrete034", -hw, hw, y0, y0 + 0.01, -s.d, 0, hex("#5e6064"));
  const bw = 2.6;
  const rows: [number, number][] = [];
  // (a strip left along the street's side: its pavement's walkers pass the bays' ends)
  for (let dd = -2.6; dd - 5.2 >= -s.d + 0.5; dd -= 5.2 + (rows.length % 2 ? 0 : 6.5)) rows.push([dd - 5.2, dd]);
  const line = hex("#f2f2ee");
  for (const [d0, d1] of rows) {
    const n = Math.floor((s.w - 2) / bw);
    const u0 = -((n * bw) / 2);
    for (let k = 0; k <= n; k++) F.box(K, "lm.paint", u0 + k * bw - 0.06, u0 + k * bw + 0.06, y0 + 0.01, y0 + 0.024, d0, d1, line);
    for (let k = 0; k < n; k++) {
      const p = F.P(u0 + (k + 0.5) * bw, 0, (d0 + d1) / 2);
      out.bays.push({ x: p[0], z: p[2], rot: F.ox === 0 ? Math.PI / 2 : 0 });
    }
  }
  // lamp posts down the aisles
  for (let u = -hw + 6; u < hw - 3; u += 16) {
    const p = F.P(u, 0, -s.d / 2);
    out.props.push({ type: "lamp", args: ["#fff0d8"], x: p[0], z: p[2], y: y0, rot: 0 });
  }
}

/** One of the chains, by a number (a district's mix). */
export const chainAt = (k: number): ChainKey => CHAIN_KEYS[((k % CHAIN_KEYS.length) + CHAIN_KEYS.length) % CHAIN_KEYS.length];

/**
 * The city's corner stores (src/scene/city/plan.ts CITY_MARTS), drawn: one group — the kit's geometry
 * of them all merged per material, their pictures in one draw — and what they hand back (doors,
 * furniture, lights, footprints).
 */
export function cityMarts(spots: (Omit<StoreSpot, "y0"> & { form?: "store" | "front" })[], y0: number) {
  const out = emptyOut();
  const A = new MartDecals();
  const parts: KitGeos[] = [];
  for (const s of spots) {
    const K = new Kit({ lod: 0 });
    if (s.form === "front") konbiniHouse(K, A, { ...s, y0 }, out);
    else store(K, A, { ...s, y0 }, out);
    parts.push(kitGeos(K.out()));
  }
  const group = new THREE.Group();
  group.name = "city:marts";
  if (!parts.length) return { group, out };
  const merged = mergeKit(parts);
  const box = new THREE.Box3();
  for (const g of Object.values(merged)) if (g) (g.computeBoundingBox(), box.union(g.boundingBox!));
  const c = box.getCenter(new THREE.Vector3()).setY(0);
  for (const g of Object.values(merged)) if (g) (g.translate(-c.x, 0, -c.z), g.computeBoundingSphere());
  const meshes = kitMeshes(merged);
  meshes.position.copy(c);
  group.add(meshes);
  const d = A.mesh("city:marts:signs");
  if (d) group.add(d);
  return { group, out };
}
