import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import type { PickInfo } from "../types";
import { bush } from "./atrium";
import { JP, LEVELS, MallKit, MONO, SANS, SERIF } from "./kit";
import { tiledMat, woodTex } from "./tex";

/**
 * Shops. One builder for every unit: built in a local frame (front glass on z = 0 facing +z,
 * the unit behind it over z −D…0, x ±W/2), then fitted out by kind — racks and mannequins,
 * sneaker walls, beauty counters, device tables, toy shelves, bookcases, jewellery vitrines…
 * The walker can go in through the door gap; a click on the front shows the brand and its data.
 */

export type Kind =
  | "fashion"
  | "luxury"
  | "sneakers"
  | "beauty"
  | "tech"
  | "toys"
  | "books"
  | "jewels"
  | "watches"
  | "exchange"
  | "cafe"
  | "florist"
  | "luggage"
  | "optics"
  | "perfume"
  | "restaurant"
  | "dessert"
  | "gacha"
  | "photo"
  | "games"
  | "audio"
  | "camera";

export interface ShopDef {
  brand: string;
  kind: Kind;
  /** Sign colour. */
  color: string;
  /** A second line under the brand (Japanese/Chinese, a tagline of the trade). */
  sub?: string;
  font?: string;
  /** Live figures for the panel. */
  info?: () => Partial<PickInfo> | null;
}

const LABEL: Record<Kind, string> = {
  fashion: "Fashion",
  luxury: "Luxury",
  sneakers: "Sneakers",
  beauty: "Beauty",
  tech: "Electronics",
  toys: "Toys",
  books: "Books",
  jewels: "Jewellery",
  watches: "Watches",
  exchange: "Bureau de change",
  cafe: "Café",
  florist: "Florist",
  luggage: "Luggage",
  optics: "Optics",
  perfume: "Perfume",
  restaurant: "Restaurant",
  dessert: "Desserts",
  gacha: "Capsule toys",
  photo: "Photo booths",
  games: "Games",
  audio: "Audio",
  camera: "Cameras",
};

/** Floor, walls, ceiling and fascia of each trade. */
const LOOK: Record<Kind, { floor: string; wall: string; back: string; ceil: string; fascia: string; light: string }> = {
  fashion: { floor: "#d9d2c6", wall: "#efebe4", back: "#d8cbb8", ceil: "#f4f1ec", fascia: "#1c1a1e", light: "#fff2dc" },
  luxury: { floor: "#2a2624", wall: "#3a332c", back: "#b89a62", ceil: "#1e1b1a", fascia: "#120f0c", light: "#ffe2a8" },
  sneakers: { floor: "#3a3a3e", wall: "#232326", back: "#e85a2a", ceil: "#18181a", fascia: "#0e0e10", light: "#ffffff" },
  beauty: { floor: "#f6eef0", wall: "#fbf4f6", back: "#f2c4d6", ceil: "#ffffff", fascia: "#2a1420", light: "#fff4f8" },
  tech: { floor: "#e8e8ea", wall: "#f4f4f6", back: "#dcdde0", ceil: "#ffffff", fascia: "#101418", light: "#f4f8ff" },
  toys: { floor: "#7ac8e8", wall: "#fff3c8", back: "#ffd23a", ceil: "#ffffff", fascia: "#1a3a6a", light: "#fffaf0" },
  books: { floor: "#7a5236", wall: "#3a2a20", back: "#2a1e16", ceil: "#2a2420", fascia: "#1a1410", light: "#ffdcae" },
  jewels: { floor: "#1a1418", wall: "#2a1a24", back: "#3a1e30", ceil: "#120e10", fascia: "#0a0808", light: "#fff0d8" },
  watches: { floor: "#1e1e22", wall: "#2a2a30", back: "#16243a", ceil: "#121216", fascia: "#0a0a0c", light: "#f0f4ff" },
  exchange: { floor: "#1a1a1e", wall: "#24242a", back: "#14141a", ceil: "#121214", fascia: "#0a0a0c", light: "#fff0c8" },
  cafe: { floor: "#8a5a36", wall: "#e9dcc6", back: "#4a3020", ceil: "#2a2220", fascia: "#2a1e16", light: "#ffd9a0" },
  florist: { floor: "#cfc8b8", wall: "#e8efe2", back: "#4a6a3e", ceil: "#f4f4ee", fascia: "#2a3a26", light: "#fff6e4" },
  luggage: { floor: "#3a3836", wall: "#d8d4ce", back: "#5a5450", ceil: "#efece8", fascia: "#1a1a1c", light: "#fff2e0" },
  optics: { floor: "#e4e2de", wall: "#f6f6f4", back: "#2a2a2e", ceil: "#ffffff", fascia: "#16161a", light: "#ffffff" },
  perfume: { floor: "#efe6d8", wall: "#f6efe4", back: "#d8b878", ceil: "#fbf8f2", fascia: "#1a1612", light: "#fff0d8" },
  restaurant: { floor: "#5a3a26", wall: "#3a1e18", back: "#7a1e1e", ceil: "#1e1210", fascia: "#1a0c0a", light: "#ffc890" },
  dessert: { floor: "#fff4f2", wall: "#ffe4ec", back: "#ffb8cc", ceil: "#ffffff", fascia: "#3a1424", light: "#fff4f6" },
  gacha: { floor: "#ffe8a0", wall: "#fff6dc", back: "#ff6a5a", ceil: "#ffffff", fascia: "#e83a3a", light: "#fffaf0" },
  photo: { floor: "#2a1a3a", wall: "#3a1e4a", back: "#ff4fb8", ceil: "#1a1024", fascia: "#120a1a", light: "#ffd8f4" },
  games: { floor: "#1a1e2a", wall: "#20263a", back: "#2a3a8a", ceil: "#12141c", fascia: "#0a0c14", light: "#e0e8ff" },
  audio: { floor: "#2a2a2e", wall: "#e8e6e2", back: "#1a1a1e", ceil: "#f4f4f2", fascia: "#0e0e10", light: "#ffffff" },
  camera: { floor: "#d8d6d2", wall: "#efefed", back: "#c8402a", ceil: "#ffffff", fascia: "#141416", light: "#ffffff" },
};

const PAL: Record<string, string[]> = {
  fashion: ["#1a1a1e", "#f2efe8", "#c8b89a", "#5a6a8a", "#8a2a2a", "#2a4a3a", "#d8c8a8", "#3a3a4a"],
  street: ["#f4b728", "#1a1a1e", "#e85a2a", "#3a7ac8", "#f2f2f2", "#6a3a8a", "#2aa86a"],
  pastel: ["#ffc8d8", "#c8e8ff", "#fff0b0", "#d8c8ff", "#c8ffd8", "#ffffff", "#ffb090"],
  toys: ["#ff3a3a", "#3a8aff", "#ffd23a", "#3ad06a", "#ff8a2a", "#b04aff", "#ff5ab0", "#2ad0d0"],
  books: ["#8a2a2a", "#2a4a7a", "#c89a3a", "#2a5a3a", "#5a2a5a", "#d8c8a8", "#1a1a1e", "#c8582a", "#e8e0d0"],
  tech: ["#1a1a1e", "#d8d8dc", "#f4b728", "#3a3a40", "#c8ccd4"],
};
const pick = (arr: string[], i: number, j = 0) => arr[Math.floor(hash(i, j, 41, 7) * arr.length) % arr.length];

let woodMat: THREE.Material | null = null;
const wood = () => (woodMat ??= tiledMat(woodTex("#9a6a42"), 2.4, { roughness: 0.5 }));

const H = 4.4;
const TOP = 5.55;

/** A poster or light box drawn into the atlas: a title, a line, a gradient. */
export function poster(k: MallKit, w: number, h: number, x: number, y: number, z: number, ry: number, title: string, sub: string, c0: string, c1: string, glow = true, fg = "#ffffff") {
  k.picture(w, h, x, y, z, ry, (g, W, Hh) => {
    const grd = g.createLinearGradient(0, 0, W * 0.3, Hh);
    grd.addColorStop(0, c0);
    grd.addColorStop(1, c1);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, Hh);
    g.globalAlpha = 0.18;
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(W * hash(i, 1, title.length, 3), Hh * hash(i, 2, title.length, 3), W * (0.1 + hash(i, 3, 1, 3) * 0.3), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = fg;
    g.textAlign = "center";
    g.font = `800 ${Math.round(Math.min(W / Math.max(4, title.length) * 1.5, Hh * 0.22))}px ${SANS}`;
    g.fillText(title, W / 2, Hh * 0.55, W * 0.9);
    g.font = `600 ${Math.round(Math.min(W / Math.max(8, sub.length) * 1.4, Hh * 0.08))}px ${MONO}`;
    g.globalAlpha = 0.85;
    g.fillText(sub, W / 2, Hh * 0.72, W * 0.9);
    g.globalAlpha = 1;
  }, { glow });
}

// ---- props (in the current frame) -----------------------------------------------------------------

function garment(k: MallKit, x: number, y: number, z: number, color: string, ry = 0, long = false) {
  k.box(k.paint, color, 0.44, long ? 1.0 : 0.66, 0.05, x, y - (long ? 1.0 : 0.66), z, ry);
  k.box(k.metal, "#c8ccd2", 0.34, 0.03, 0.02, x, y - 0.02, z, ry);
}

/** A clothes rail along x (or z), garments hanging side on. */
function rail(k: MallKit, x: number, z: number, len: number, alongX: boolean, colors: string[], seed: number) {
  const ry = alongX ? Math.PI / 2 : 0;
  for (const s of [-len / 2, len / 2]) k.box(k.metal, "#b8bcc4", 0.05, 1.55, 0.05, x + (alongX ? s : 0), 0, z + (alongX ? 0 : s));
  k.box(k.metal, "#d0d4da", alongX ? len : 0.04, 0.04, alongX ? 0.04 : len, x, 1.5, z);
  const n = Math.floor(len / 0.14);
  for (let i = 0; i < n; i++) {
    const s = -len / 2 + 0.1 + (i * (len - 0.2)) / Math.max(1, n - 1);
    garment(k, x + (alongX ? s : 0), 1.5, z + (alongX ? 0 : s), pick(colors, seed, i), ry + Math.PI / 2, hash(seed, i, 3, 3) > 0.7);
  }
}

/** A mannequin dressed in `color`, on a little plinth. */
function mannequin(k: MallKit, x: number, z: number, color: string, ry = 0, skin = "#f0ece6", dy = 0) {
  k.cyl(k.gloss, "#e8e4de", 0.25, 0.25, 0.05, x, dy, z, 16);
  k.box(k.metal, "#b8bcc4", 0.03, 0.4, 0.03, x, dy + 0.05, z, ry);
  k.box(k.paint, "#2a2a30", 0.13, 0.62, 0.14, x - 0.08, dy + 0.38, z, ry);
  k.box(k.paint, "#2a2a30", 0.13, 0.62, 0.14, x + 0.08, dy + 0.38, z, ry);
  k.box(k.paint, color, 0.42, 0.62, 0.24, x, dy + 0.98, z, ry);
  k.box(k.paint, color, 0.1, 0.55, 0.12, x - 0.27, dy + 1.02, z, ry);
  k.box(k.paint, color, 0.1, 0.55, 0.12, x + 0.27, dy + 1.02, z, ry);
  k.box(k.gloss, skin, 0.08, 0.1, 0.08, x, dy + 1.6, z, ry);
  k.box(k.gloss, skin, 0.2, 0.25, 0.2, x, dy + 1.68, z, ry);
}

function sneaker(k: MallKit, x: number, y: number, z: number, color: string, ry = 0) {
  k.box(k.paint, "#f4f2ee", 0.3, 0.05, 0.11, x, y, z, ry);
  k.box(k.paint, color, 0.22, 0.08, 0.1, x - 0.03, y + 0.05, z, ry);
  k.box(k.paint, color, 0.08, 0.05, 0.1, x + 0.1, y + 0.05, z, ry);
}

/** Shelving against a wall at local z (facing +z), x0…x1, `rows` shelves from y0, items by callback. */
function shelves(k: MallKit, x0: number, x1: number, z: number, rows: number, y0: number, dy: number, panel: string, edge: string, item: (x: number, y: number, z: number, i: number, r: number) => void, step = 0.3, depth = 0.4) {
  const w = x1 - x0;
  k.box(k.paint, panel, w, y0 + rows * dy + 0.1, 0.06, (x0 + x1) / 2, 0, z + 0.03);
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * dy;
    k.box(k.paint, edge, w, 0.03, depth, (x0 + x1) / 2, y - 0.03, z + depth / 2 + 0.06);
    k.box(k.glow, "#fff4e0", w, 0.012, 0.012, (x0 + x1) / 2, y - 0.045, z + depth + 0.05, 0, 1.2);
    let i = 0;
    for (let x = x0 + step / 2; x < x1 - step / 4; x += step) item(x, y, z + depth / 2 + 0.06, i++, r);
  }
}

/** A glass vitrine on a dark base, its contents glowing. */
function vitrine(k: MallKit, x: number, z: number, w: number, d: number, base: string, items: (x: number, y: number, z: number, i: number) => void, n = 4) {
  k.box(k.gloss, base, w, 0.9, d, x, 0, z);
  k.box(k.glow, "#fff0d0", w - 0.04, 0.02, d - 0.04, x, 0.9, z, 0, 0.6);
  k.box(k.glass, "#ffffff", w, 0.4, d, x, 0.92, z);
  k.box(k.metal, "#d8c088", w, 0.03, d, x, 1.32, z);
  for (let i = 0; i < n; i++) items(x - w / 2 + (w * (i + 0.5)) / n, 0.92, z, i);
}

function counter(k: MallKit, x: number, z: number, w: number, top: string, front: string, ry = 0) {
  k.box(k.paint, front, w, 1.0, 0.6, x, 0, z, ry);
  k.box(k.gloss, top, w + 0.06, 0.05, 0.66, x, 1.0, z, ry);
  k.box(k.paint, "#1a1a1e", 0.3, 0.22, 0.04, x + w / 2 - 0.4, 1.05, z - 0.1, ry);
  k.box(k.glow, "#9ad8ff", 0.26, 0.17, 0.01, x + w / 2 - 0.4, 1.075, z - 0.075, ry, 0.9);
}

function table(k: MallKit, x: number, z: number, w: number, d: number, h: number, top: string, legs = "#2a2a30", mat: THREE.Material = k.paint) {
  k.box(mat, top, w, 0.05, d, x, h - 0.05, z);
  k.box(k.paint, legs, w - 0.2, h - 0.05, d - 0.2, x, 0, z);
}

function stool(k: MallKit, x: number, z: number, seat: string, h = 0.7) {
  k.cyl(k.metal, "#9a9ea6", 0.03, 0.03, h - 0.05, x, 0, z, 6);
  k.cyl(k.paint, seat, 0.18, 0.18, 0.06, x, h - 0.06, z, 10);
}

function chair(k: MallKit, x: number, z: number, color: string, ry: number) {
  k.box(k.paint, color, 0.42, 0.06, 0.42, x, 0.42, z, ry);
  for (const [a, b] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ]) {
    const c = Math.cos(ry),
      s = Math.sin(ry);
    k.box(k.paint, "#2a2a30", 0.04, 0.42, 0.04, x + a * c + b * s, 0, z - a * s + b * c);
  }
  k.box(k.paint, color, 0.42, 0.45, 0.05, x + Math.sin(ry) * -0.19, 0.48, z + Math.cos(ry) * -0.19, ry);
}

function bottle(k: MallKit, x: number, y: number, z: number, color: string, s = 1) {
  k.box(k.gloss, color, 0.06 * s, 0.14 * s, 0.06 * s, x, y, z);
  k.box(k.metal, "#d8c088", 0.03 * s, 0.04 * s, 0.03 * s, x, y + 0.14 * s, z);
}

function suitcase(k: MallKit, x: number, y: number, z: number, color: string, h = 0.65, ry = 0) {
  k.box(k.gloss, color, 0.42, h, 0.24, x, y + 0.04, z, ry);
  k.box(k.metal, "#c8ccd2", 0.2, 0.03, 0.03, x, y + h + 0.04, z, ry);
  k.box(k.paint, "#1a1a1e", 0.05, 0.04, 0.05, x - 0.15, y, z, ry);
  k.box(k.paint, "#1a1a1e", 0.05, 0.04, 0.05, x + 0.15, y, z, ry);
}

function laptop(k: MallKit, x: number, y: number, z: number, screen: string) {
  k.box(k.metal, "#c8ccd4", 0.34, 0.015, 0.24, x, y, z);
  k.boxR(k.metal, "#c8ccd4", 0.34, 0.22, 0.012, x, y + 0.11, z - 0.13, -0.25, 0);
  k.boxR(k.glow, screen, 0.31, 0.19, 0.004, x, y + 0.11, z - 0.122, -0.25, 0, 0, 0.9);
}

function phone(k: MallKit, x: number, y: number, z: number, screen: string, big = false) {
  const w = big ? 0.22 : 0.08,
    h = big ? 0.3 : 0.16;
  k.boxR(k.paint, "#1a1a1e", w, 0.012, h, x, y + 0.02, z, -0.35, 0);
  k.boxR(k.glow, screen, w - 0.012, 0.004, h - 0.02, x, y + 0.028, z, -0.35, 0, 0, 0.9);
}

function flowers(k: MallKit, x: number, y: number, z: number, seed: number, colors = ["#ff6a8a", "#ffffff", "#ffd84a", "#c84aff", "#ff8a3a", "#ff3a5a"]) {
  k.cyl(k.metal, "#a8acb4", 0.16, 0.13, 0.32, x, y, z, 10);
  for (let i = 0; i < 9; i++) {
    const a = hash(seed, i, 1, 2) * Math.PI * 2,
      r = hash(seed, i, 2, 2) * 0.14;
    k.box(k.leaf, "#3a7a3a", 0.02, 0.35, 0.02, x + Math.sin(a) * r, y + 0.3, z + Math.cos(a) * r);
    k.boxR(k.paint, pick(colors, seed, i), 0.1, 0.08, 0.1, x + Math.sin(a) * r, y + 0.68 + hash(seed, i, 3, 1) * 0.1, z + Math.cos(a) * r, 0, a);
  }
}

/** Downlights in a ceiling, or a full light box. */
function ceilingLights(k: MallKit, W: number, D: number, color: string, panel = false) {
  if (panel && W > 20) {
    // a whole lit ceiling in a fine grid (the flagship look)
    k.flat(k.glow, color, W - 0.4, D - 0.4, 0, H - 0.02, -D / 2, undefined, true, 0.92);
    for (let x = -W / 2 + 1.2; x < W / 2; x += 1.2) k.box(k.paint, "#d8d8dc", 0.05, 0.05, D - 0.4, x, H - 0.08, -D / 2);
    for (let z = -D + 1.2; z < 0; z += 1.2) k.box(k.paint, "#d8d8dc", W - 0.4, 0.05, 0.05, 0, H - 0.08, z);
    return;
  }
  if (panel) {
    for (let x = -W / 2 + 1.2; x < W / 2 - 0.6; x += 2.2) k.box(k.glow, color, 1.6, 0.02, D - 1.4, x + 0.4, H - 0.03, -D / 2, 0, 1.15);
    return;
  }
  for (let x = -W / 2 + 1; x < W / 2; x += 1.6) for (let z = -D + 1; z < -0.4; z += 1.6) k.cyl(k.glow, color, 0.08, 0.08, 0.02, x, H - 0.03, z, 8, 1.8);
}

// ---- the unit -------------------------------------------------------------------------------------

export interface Unit {
  /** World position just inside the door (for staff and shoppers). */
  inside: THREE.Vector3;
}

/**
 * A shop on level f, its front centre at world (x, z), facing `ry` (0: +z), W wide and D deep.
 */
export function shop(k: MallKit, f: number, x: number, z: number, ry: number, W: number, D: number, def: ShopDef, o: { noFront?: boolean; bare?: boolean } = {}): Unit {
  const L = LOOK[def.kind];
  k.at(f, x, z, ry);
  // shell
  const floorM = def.kind === "books" || def.kind === "cafe" ? wood() : k.gloss;
  k.flat(floorM, def.kind === "books" || def.kind === "cafe" ? "#ffffff" : L.floor, W, D, 0, 0.012, -D / 2, def.kind === "books" || def.kind === "cafe" ? [0, 0, W, D] : undefined);
  k.box(k.paint, L.wall, 0.2, TOP, D, -W / 2, 0, -D / 2);
  k.box(k.paint, L.wall, 0.2, TOP, D, W / 2, 0, -D / 2);
  k.box(k.paint, L.back, W, TOP, 0.2, 0, 0, -D);
  k.flat(k.paint, L.ceil, W, D, 0, H, -D / 2, undefined, true);
  k.box(k.paint, L.ceil, W, 0.04, D, 0, H, -D / 2);
  k.solid(f, -W / 2 - 0.1, -D, -W / 2 + 0.12, 0);
  k.solid(f, W / 2 - 0.12, -D, W / 2 + 0.1, 0);
  k.solid(f, -W / 2, -D - 0.1, W / 2, -D + 0.12);
  ceilingLights(k, W, D, L.light, def.kind === "tech" || def.kind === "beauty" || def.kind === "toys" || def.kind === "dessert" || def.kind === "gacha" || def.kind === "optics");
  // front: stone piers, glass either side of a door gap, a lit fascia with the brand
  const door = Math.min(2.4, W * 0.3);
  // dark bronze piers, each with a light line in the brand's colour: every front reads apart
  for (const sx of [-1, 1]) {
    k.box(k.gloss, "#2a2420", 0.4, TOP, 0.4, (sx * W) / 2, 0, 0);
    k.box(k.glow, def.color, 0.04, H - 0.2, 0.02, (sx * W) / 2 - sx * 0.12, 0.1, 0.205, 0, 0.75);
  }
  if (!o.noFront) {
    for (const [a, b] of [
      [-W / 2 + 0.2, -door / 2],
      [door / 2, W / 2 - 0.2],
    ]) {
      k.box(k.glass, "#ffffff", b - a, H, 0.03, (a + b) / 2, 0, 0);
      k.box(k.metal, "#2a2a30", b - a, 0.08, 0.08, (a + b) / 2, 0, 0);
      k.solid(f, a, -0.1, b, 0.1);
    }
    for (const s of [-door / 2, door / 2]) k.box(k.metal, "#2a2a30", 0.08, H, 0.1, s, 0, 0);
    k.box(k.metal, "#2a2a30", W - 0.4, 0.08, 0.1, 0, H - 0.08, 0);
  }
  k.box(k.paint, L.fascia, W - 0.4, TOP - H, 0.25, 0, H, 0.02);
  const signW = k.sign(def.brand, def.sub ? 0.74 : 0.84, 0, def.sub ? 5.08 : 4.98, 0.16, 0, { color: def.color, font: def.font });
  void signW;
  if (def.sub) k.sign(def.sub, 0.24, 0, 4.58, 0.16, 0, { color: def.color, font: `600 64px ${/[^\x00-\x7f]/.test(def.sub) ? JP : MONO}`, spacing: 6 });
  k.box(k.glow, def.color, W - 0.4, 0.03, 0.03, 0, H + 0.02, 0.16, 0, 0.8);
  // blade sign sticking out over the corridor, readable along it
  k.box(k.paint, L.fascia, 0.08, 0.5, 1.1, W / 2 - 0.5, 3.5, 0.75);
  k.sign(def.brand, 0.24, W / 2 - 0.45, 3.75, 0.75, Math.PI / 2, { color: def.color, font: def.font });
  k.sign(def.brand, 0.24, W / 2 - 0.55, 3.75, 0.75, -Math.PI / 2, { color: def.color, font: def.font });

  if (!o.bare) fitOut(k, f, def, W, D);

  // click: the brand, its level and trade, its live figures
  const info = (): PickInfo => ({ eyebrow: `${LEVELS[f].label} · ${LABEL[def.kind]}`, title: def.brand, ...(def.info?.() ?? {}) });
  const hover = `<b>${def.brand}</b><span>${LEVELS[f].label} · ${LABEL[def.kind]}</span>`;
  k.hit(f, W, TOP, 0.4, 0, 0, 0.05, hover, info);
  k.hit(f, 1.6, 1.2, 0.8, 0, 0, -D + 1.2, hover, info);
  return { inside: k.world(0, 0, -1.6) };
}

/** What is inside, by trade. Same frame as the shell. */
function fitOut(k: MallKit, f: number, def: ShopDef, W: number, D: number) {
  const s = def.brand.length * 31 + f * 7;
  const back = -D + 0.15;
  const side = (fn: (sx: number) => void) => [-1, 1].forEach(fn);
  const cash = (top: string, front: string) => {
    counter(k, 0, -D + 1.2, 1.8, top, front);
    k.solid(f, -0.95, -D + 0.85, 0.95, -D + 1.55);
  };
  switch (def.kind) {
    case "fashion":
    case "luxury": {
      const lux = def.kind === "luxury";
      const pal = lux ? ["#1a1a1e", "#e8dcc4", "#8a6a3a", "#5a1a2a", "#c8b088"] : PAL.fashion;
      // wall shelving of folded clothes along both sides
      side((sx) => {
        const wx = sx * (W / 2 - 0.1);
        for (let zz = -D + 1; zz < -1.4; zz += 0.9)
          for (let r = 0; r < 3; r++) {
            k.box(k.paint, lux ? "#3a3028" : "#e2dccf", 0.4, 0.03, 0.8, wx - sx * 0.2, 1.1 + r * 0.5, zz);
            for (let st = 0; st < 2; st++) k.box(k.paint, pick(pal, s + r, Math.round(zz * 10) + st), 0.32, 0.18, 0.3, wx - sx * 0.22, 1.13 + r * 0.5, zz - 0.18 + st * 0.36);
          }
        k.box(k.glow, L(def).light, 0.02, 0.02, D - 2, wx - sx * 0.05, 3.0, -D / 2 - 0.4, 0, 1.2);
        k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.5, -D, sx < 0 ? -W / 2 + 0.5 : W / 2, -1.2);
      });
      if (lux) {
        // gold-lit niches with handbags on the back wall, an island table, a chandelier
        for (let i = 0; i < 5; i++) {
          const x = -W / 2 + 1 + (i * (W - 2)) / 4;
          k.box(k.paint, "#2a221a", 0.9, 0.9, 0.3, x, 1.2, back + 0.15);
          k.box(k.glow, "#ffd9a0", 0.86, 0.02, 0.26, x, 2.08, back + 0.17, 0, 1.4);
          k.box(k.gloss, pick(["#1a1a1e", "#8a5a2a", "#c8b088", "#5a1a2a", "#f2efe8"], s, i), 0.4, 0.3, 0.16, x, 1.22, back + 0.16);
          k.box(k.metal, "#d8c088", 0.24, 0.12, 0.02, x, 1.52, back + 0.16);
        }
        table(k, 0, -D / 2, 2.2, 1.0, 0.9, "#1a1612", "#2a221a", k.gloss);
        k.solid(f, -1.1, -D / 2 - 0.5, 1.1, -D / 2 + 0.5);
        for (let i = 0; i < 3; i++) k.box(k.gloss, pick(["#1a1a1e", "#8a5a2a", "#e8dcc4", "#5a1a2a"], s, i + 9), 0.36, 0.26, 0.14, -0.7 + i * 0.7, 0.9, -D / 2);
        for (let r = 0; r < 3; r++) {
          const ring = new THREE.TorusGeometry(0.7 - r * 0.18, 0.02, 4, 32);
          ring.rotateX(Math.PI / 2);
          ring.translate(0, H - 0.4 - r * 0.2, -D / 2);
          k.geo(k.glow, "#ffe2b0", ring, undefined, 1.6);
        }
        side((sx) => mannequin(k, sx * (W / 4 + 0.4), -0.9, pick(pal, s, sx + 5), 0, "#d8c8a8", 0.25));
        side((sx) => k.box(k.gloss, "#1a1612", 1.4, 0.25, 0.8, sx * (W / 4 + 0.4), 0, -0.9));
      } else {
        rail(k, -W / 4 + 0.2, -D / 2 - 0.2, D * 0.45, false, pal, s);
        rail(k, W / 4 - 0.2, -D / 2 - 0.2, D * 0.45, false, pal, s + 3);
        k.solid(f, -W / 4, -D / 2 - D * 0.23, -W / 4 + 0.4, -D / 2 + D * 0.2);
        k.solid(f, W / 4 - 0.4, -D / 2 - D * 0.23, W / 4, -D / 2 + D * 0.2);
        table(k, 0, -D / 2 + 0.6, 1.4, 0.9, 0.8, "#c8b89a", "#8a7a6a");
        for (let i = 0; i < 4; i++) k.box(k.paint, pick(pal, s, i + 20), 0.34, 0.12, 0.3, -0.45 + i * 0.3, 0.8, -D / 2 + 0.6);
        k.solid(f, -0.7, -D / 2 + 0.15, 0.7, -D / 2 + 1.05);
        // fitting rooms on the back wall, curtains
        for (let i = 0; i < 3; i++) {
          const x = -W / 2 + 1.2 + i * 1.1;
          k.box(k.paint, "#8a7a6a", 1.0, 2.2, 0.02, x, 0.15, back + 0.9);
        }
        k.sign("FITTING", 0.16, -W / 2 + 2.3, 2.6, back + 0.95, 0, { color: "#3a3028", glow: false });
        side((sx) => {
          mannequin(k, sx * (W / 4 + 0.6), -0.8, pick(pal, s, sx + 7), 0, "#f0ece6", 0.2);
          mannequin(k, sx * (W / 4 - 0.2), -1.0, pick(pal, s, sx + 8), 0.3, "#f0ece6", 0.2);
          k.box(k.gloss, "#f2efe8", 1.8, 0.2, 0.8, sx * (W / 4 + 0.2), 0, -0.9);
        });
      }
      cash(lux ? "#d8c088" : "#e8e4de", lux ? "#1a1612" : "#3a3028");
      break;
    }
    case "sneakers": {
      // floor-to-ceiling walls of lit cubbies, one shoe each
      side((sx) => {
        const wx = sx * (W / 2 - 0.12);
        for (let zz = -D + 0.6; zz < -1.0; zz += 0.5)
          for (let r = 0; r < 7; r++) {
            k.box(k.paint, "#16161a", 0.4, 0.02, 0.44, wx - sx * 0.2, 0.5 + r * 0.5, zz);
            k.box(k.glow, "#ffffff", 0.02, 0.012, 0.44, wx - sx * 0.39, 0.49 + r * 0.5, zz, 0, 1.2);
            sneaker(k, wx - sx * 0.22, 0.52 + r * 0.5, zz, pick(PAL.street, s + r, Math.round(zz * 10)), Math.PI / 2);
          }
        k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.45, -D, sx < 0 ? -W / 2 + 0.45 : W / 2, -1.0);
      });
      // the back wall: the hero shoe in a light box
      k.box(k.glow, "#ff7a3a", W - 1, 2.6, 0.04, 0, 0.8, back + 0.05, 0, 0.9);
      sneaker(k, 0, 1.9, back + 0.3, "#f4b728", 0.4);
      k.box(k.paint, "#16161a", 1.2, 0.04, 0.5, 0, 1.86, back + 0.3);
      // try-on benches, a sneaker island
      for (const zz of [-D / 2 - 0.8, -D / 2 + 1.2]) {
        k.box(k.paint, "#e85a2a", 2.0, 0.42, 0.5, 0, 0, zz);
        k.solid(f, -1.0, zz - 0.25, 1.0, zz + 0.25);
      }
      side((sx) => {
        k.box(k.gloss, "#16161a", 0.6, 0.9, 0.6, sx * (W / 4 + 0.3), 0, -0.9);
        sneaker(k, sx * (W / 4 + 0.3), 0.9, -0.9, sx > 0 ? "#f4b728" : "#3a7ac8", 0.6);
        k.box(k.glass, "#ffffff", 0.6, 0.4, 0.6, sx * (W / 4 + 0.3), 0.9, -0.9);
      });
      cash("#e85a2a", "#16161a");
      break;
    }
    case "beauty":
    case "perfume": {
      const beauty = def.kind === "beauty";
      side((sx) => {
        const wx = sx * (W / 2 - 0.12);
        // backlit wall bays of products
        for (let zz = -D + 0.8; zz < -1.2; zz += 1.2) {
          k.box(k.glow, beauty ? "#fff0f6" : "#fff2dc", 0.02, 1.8, 1.0, wx - sx * 0.02, 0.6, zz, 0, 0.8);
          for (let r = 0; r < 4; r++) {
            k.box(k.gloss, "#ffffff", 0.3, 0.02, 1.0, wx - sx * 0.17, 0.75 + r * 0.42, zz);
            for (let i = 0; i < 6; i++) bottle(k, wx - sx * 0.18, 0.77 + r * 0.42, zz - 0.4 + i * 0.16, pick(beauty ? ["#ff6a9a", "#c83a6a", "#ffd0e0", "#1a1a1e", "#f4b728", "#ffffff"] : ["#d8b878", "#f4e8c8", "#ffb0c8", "#b8e0f0", "#1a1a1e"], s + r, i + Math.round(zz)), beauty ? 0.8 : 1);
          }
        }
        k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.4, -D, sx < 0 ? -W / 2 + 0.4 : W / 2, -1.0);
      });
      // the counters: glossy white islands with lit mirrors
      for (const [x, zz] of [
        [0, -D / 2 - 0.4],
        [0, -D + 1.4],
      ] as [number, number][]) {
        k.box(k.gloss, beauty ? "#ffffff" : "#f6efe4", 2.2, 0.95, 0.8, x, 0, zz);
        k.box(k.glow, beauty ? "#ff9ac8" : "#d8b878", 2.2, 0.02, 0.82, x, 0.95, zz, 0, 1.0);
        for (let i = 0; i < 9; i++) bottle(k, x - 0.9 + i * 0.22, 0.97, zz + 0.1 * Math.sin(i), pick(beauty ? ["#ff6a9a", "#ffd0e0", "#1a1a1e", "#f4b728", "#c83a6a"] : ["#d8b878", "#f4e8c8", "#ffb0c8", "#1a1a1e"], s, i + Math.round(zz)), 0.9);
        k.solid(f, x - 1.1, zz - 0.4, x + 1.1, zz + 0.4);
      }
      if (beauty) {
        for (const sx of [-1, 1]) {
          const ring = new THREE.TorusGeometry(0.28, 0.025, 6, 32);
          ring.translate(sx * 0.6, 1.5, -D + 1.0);
          k.geo(k.glow, "#ffffff", ring, undefined, 1.4);
          k.box(k.gloss, "#c8d8e0", 0.5, 0.5, 0.02, sx * 0.6, 1.25, -D + 0.99);
        }
      }
      k.box(k.glow, beauty ? "#ffc8dc" : "#e8c888", W - 1.2, 2.0, 0.03, 0, 1.4, back + 0.04, 0, 0.6);
      poster(k, 1.6, 2.2, 0, 2.6, back + 0.08, 0, def.brand.split(" ")[0], beauty ? "SHIELDED GLOW" : "EAU DE ZEC", beauty ? "#ff8ac8" : "#d8b878", beauty ? "#ffd8e8" : "#5a4020");
      side((sx) => {
        k.cyl(k.gloss, "#ffffff", 0.45, 0.45, 0.7, sx * (W / 4 + 0.3), 0, -0.9, 24);
        for (let i = 0; i < 5; i++) bottle(k, sx * (W / 4 + 0.3) - 0.3 + i * 0.15, 0.7, -0.9, pick(["#ff6a9a", "#d8b878", "#ffffff", "#c83a6a", "#f4b728"], s, i + sx), 1.6);
      });
      break;
    }
    case "tech":
    case "audio":
    case "camera":
    case "games": {
      // long light-wood tables of devices with lit screens
      const scr = ["#3ef0ff", "#f4b728", "#7a9aff", "#3ee08f", "#ff6ab8", "#ffffff"];
      for (const x of [-W / 4 + 0.1, W / 4 - 0.1]) {
        table(k, x, -D / 2 - 0.2, 1.1, D - 3.4, 0.9, "#d8c0a0", "#e8e8ea", wood());
        k.solid(f, x - 0.55, -D / 2 - 0.2 - (D - 3.4) / 2, x + 0.55, -D / 2 - 0.2 + (D - 3.4) / 2);
        for (let zz = -D + 2.2; zz < -1.9; zz += 0.7) {
          if (def.kind === "tech") (Math.round(zz * 10) % 2 ? laptop : phone)(k, x, 0.9, zz, pick(scr, s, Math.round(zz * 10)));
          else if (def.kind === "audio") {
            const ring = new THREE.TorusGeometry(0.1, 0.025, 4, 16, Math.PI);
            ring.translate(x, 1.02, zz);
            k.geo(k.gloss, pick(["#1a1a1e", "#f4f2ee", "#f4b728", "#3a7ac8"], s, Math.round(zz * 10)), ring);
            k.box(k.metal, "#8a8e96", 0.04, 0.12, 0.04, x, 0.9, zz);
          } else if (def.kind === "camera") {
            k.box(k.paint, "#1a1a1e", 0.16, 0.1, 0.07, x, 0.9, zz);
            k.cyl(k.metal, "#2a2a30", 0.04, 0.04, 0.08, x, 0.92, zz + 0.07);
          } else phone(k, x, 0.9, zz, pick(scr, s, Math.round(zz * 10)), true);
        }
      }
      // the back wall: a screen wall of the brand
      k.picture(W - 1.2, 2.2, 0, 2.2, back + 0.06, 0, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, "#06121e");
        grd.addColorStop(1, def.kind === "camera" ? "#3a1208" : "#0e2a4a");
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = def.color;
        g.globalAlpha = 0.5;
        for (let i = 0; i < 18; i++) {
          g.beginPath();
          g.arc(w / 2, h * 1.4, h * (0.4 + i * 0.12), Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = "#ffffff";
        g.textAlign = "center";
        g.font = `800 ${Math.round(h * 0.2)}px ${SANS}`;
        g.fillText(def.brand, w / 2, h * 0.5, w * 0.9);
      }, { glow: true });
      side((sx) => {
        const wx = sx * (W / 2 - 0.12);
        // wall accessory pegs
        for (let zz = -D + 0.8; zz < -1.4; zz += 0.36) for (let r = 0; r < 4; r++) k.box(k.paint, pick(def.kind === "games" ? PAL.toys : PAL.tech, s + r, Math.round(zz * 10)), 0.06, 0.26, 0.2, wx - sx * 0.06, 0.8 + r * 0.45, zz);
        k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.25, -D, sx < 0 ? -W / 2 + 0.25 : W / 2, -1.0);
        k.box(k.gloss, "#ffffff", 0.7, 0.95, 0.7, sx * (W / 4 + 0.4), 0, -0.9);
        if (def.kind === "tech") laptop(k, sx * (W / 4 + 0.4), 0.95, -0.9, sx > 0 ? "#f4b728" : "#3ef0ff");
        else phone(k, sx * (W / 4 + 0.4), 0.95, -0.9, "#3ef0ff", true);
      });
      cash("#ffffff", "#e8e8ea");
      break;
    }
    case "toys":
    case "gacha": {
      if (def.kind === "gacha") {
        // rows of capsule machines, stacked two high
        for (const zz of [-D + 0.6, -D / 2 - 0.3]) {
          for (let x = -W / 2 + 0.6; x < W / 2 - 0.4; x += 0.62)
            for (let r = 0; r < 2; r++) {
              const c = pick(PAL.toys, s, Math.round(x * 10) + r);
              k.box(k.gloss, c, 0.56, 0.5, 0.5, x, r * 0.95, zz);
              k.box(k.glass, "#ffffff", 0.5, 0.42, 0.44, x, r * 0.95 + 0.5, zz);
              for (let b = 0; b < 5; b++) k.box(k.gloss, pick(PAL.toys, s + b, Math.round(x * 10) + r), 0.1, 0.1, 0.1, x - 0.15 + (b % 3) * 0.15, r * 0.95 + 0.52 + Math.floor(b / 3) * 0.1, zz);
              k.cyl(k.metal, "#d8d8dc", 0.07, 0.07, 0.03, x, r * 0.95 + 0.25, zz + 0.25);
            }
          k.solid(f, -W / 2 + 0.3, zz - 0.25, W / 2 - 0.3, zz + 0.25);
        }
      } else {
        side((sx) => {
          const wx = sx * (W / 2 - 0.12);
          for (let zz = -D + 0.7; zz < -1.2; zz += 0.5) for (let r = 0; r < 5; r++) k.box(k.paint, pick(PAL.toys, s + r, Math.round(zz * 10)), 0.3, 0.32, 0.4, wx - sx * 0.2, 0.3 + r * 0.55, zz);
          k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.45, -D, sx < 0 ? -W / 2 + 0.45 : W / 2, -1.0);
        });
        // a giant voxel bear and a train table
        const bx = 0,
          bz = -D + 1.3;
        k.box(k.paint, "#c8884a", 1.0, 1.1, 0.7, bx, 0, bz);
        k.box(k.paint, "#c8884a", 0.8, 0.7, 0.6, bx, 1.1, bz);
        for (const ex of [-0.3, 0.3]) k.box(k.paint, "#a86a3a", 0.22, 0.22, 0.12, bx + ex, 1.8, bz);
        k.box(k.paint, "#f4e0c0", 0.3, 0.2, 0.1, bx, 1.25, bz + 0.31);
        for (const ex of [-0.18, 0.18]) k.box(k.paint, "#1a1a1e", 0.08, 0.08, 0.02, bx + ex, 1.5, bz + 0.31);
        k.box(k.paint, "#f4b728", 0.9, 0.1, 0.05, bx, 1.05, bz + 0.33);
        k.solid(f, -0.6, bz - 0.4, 0.6, bz + 0.4);
        table(k, 0, -D / 2 + 0.4, 2.0, 1.2, 0.7, "#3ad06a", "#2a7ac8");
        for (let i = 0; i < 6; i++) k.box(k.paint, pick(PAL.toys, s, i), 0.22, 0.14, 0.12, -0.8 + i * 0.32, 0.7, -D / 2 + 0.4 + Math.sin(i) * 0.3);
        k.solid(f, -1.0, -D / 2 - 0.2, 1.0, -D / 2 + 1.0);
      }
      side((sx) => {
        k.box(k.gloss, "#ffffff", 1.2, 0.3, 0.7, sx * (W / 4 + 0.3), 0, -0.9);
        for (let i = 0; i < 4; i++) k.box(k.paint, pick(PAL.toys, s + sx, i), 0.22, 0.3 + hash(s, i, 1, 1) * 0.3, 0.22, sx * (W / 4 + 0.3) - 0.4 + i * 0.27, 0.3, -0.9);
      });
      break;
    }
    case "books": {
      // tall bookcases round the walls, spines in every colour, tables of new books, a reading chair
      side((sx) => {
        const wx = sx * (W / 2 - 0.12);
        for (let r = 0; r < 7; r++) {
          k.box(k.paint, "#3a2618", 0.36, 0.03, D - 1.4, wx - sx * 0.18, 0.3 + r * 0.55, -D / 2 - 0.5);
          for (let zz = -D + 0.3; zz < -1.3; zz += 0.07 + hash(s, r, Math.round(zz * 50), 1) * 0.04) k.box(k.paint, pick(PAL.books, s + r, Math.round(zz * 30)), 0.24, 0.32 + hash(s, r, Math.round(zz * 40), 2) * 0.14, 0.06, wx - sx * 0.2, 0.33 + r * 0.55, zz);
        }
        k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.45, -D, sx < 0 ? -W / 2 + 0.45 : W / 2, -1.0);
      });
      for (let r = 0; r < 7; r++) {
        k.box(k.paint, "#3a2618", W - 1, 0.03, 0.36, 0, 0.3 + r * 0.55, back + 0.2);
        for (let x = -W / 2 + 0.6; x < W / 2 - 0.5; x += 0.07 + hash(s, r, Math.round(x * 50), 3) * 0.04) k.box(k.paint, pick(PAL.books, s + r + 3, Math.round(x * 30)), 0.06, 0.32 + hash(s, r, Math.round(x * 40), 4) * 0.14, 0.24, x, 0.33 + r * 0.55, back + 0.2);
      }
      k.solid(f, -W / 2, -D, W / 2, -D + 0.5);
      for (const zz of [-D / 2 - 0.6, -D / 2 + 1.0]) {
        table(k, 0, zz, 1.6, 0.9, 0.8, "#5a3a22", "#3a2618");
        for (let i = 0; i < 8; i++) k.box(k.paint, pick(PAL.books, s, i + Math.round(zz)), 0.28, 0.04 + (i % 3) * 0.04, 0.2, -0.6 + (i % 4) * 0.4, 0.8, zz - 0.2 + Math.floor(i / 4) * 0.4);
        k.solid(f, -0.8, zz - 0.45, 0.8, zz + 0.45);
      }
      k.box(k.paint, "#8a2a2a", 0.8, 0.45, 0.8, W / 2 - 1.2, 0, -D + 1.4);
      k.box(k.paint, "#8a2a2a", 0.8, 0.5, 0.2, W / 2 - 1.2, 0.45, -D + 1.1);
      k.cyl(k.glow, "#ffd9a0", 0.15, 0.2, 0.25, W / 2 - 0.6, 1.4, -D + 1.6, 12, 1.2);
      k.cyl(k.metal, "#2a2a30", 0.015, 0.015, 1.4, W / 2 - 0.6, 0, -D + 1.6, 6);
      side((sx) => {
        k.box(k.paint, "#5a3a22", 1.4, 0.6, 0.6, sx * (W / 4 + 0.3), 0, -0.9);
        for (let i = 0; i < 5; i++) k.boxR(k.paint, pick(PAL.books, s + sx, i), 0.22, 0.3, 0.05, sx * (W / 4 + 0.3) - 0.5 + i * 0.25, 0.76, -0.9, -0.2, 0);
      });
      break;
    }
    case "jewels":
    case "watches":
    case "optics": {
      const jew = def.kind === "jewels",
        opt = def.kind === "optics";
      const item = (x: number, y: number, z: number, i: number) => {
        if (jew) {
          const ring = new THREE.TorusGeometry(0.05, 0.012, 6, 16);
          ring.translate(x, y + 0.08, z);
          k.geo(k.metal, i % 2 ? "#e8c860" : "#e8e8f0", ring);
          k.box(k.glow, pick(["#ffffff", "#9ae8ff", "#ff6a8a", "#7aff9a"], s, i), 0.035, 0.035, 0.035, x, y + 0.14, z, 0.8, 2.2);
          k.box(k.paint, "#2a1a24", 0.16, 0.05, 0.16, x, y, z);
        } else if (opt) {
          k.box(k.paint, "#1a1a1e", 0.16, 0.05, 0.01, x, y + 0.05, z);
        } else {
          k.cyl(k.metal, i % 2 ? "#e8c860" : "#d8dce4", 0.06, 0.06, 0.02, x, y + 0.06, z, 16);
          k.box(k.paint, "#1a1a1e", 0.04, 0.14, 0.01, x, y, z);
        }
      };
      for (const zz of [-D / 2 - 0.8, -D / 2 + 1.0])
        side((sx) => {
          vitrine(k, sx * 1.4, zz, 1.6, 0.6, jew ? "#2a1a24" : "#1a1a22", item, 6);
          k.solid(f, sx * 1.4 - 0.8, zz - 0.3, sx * 1.4 + 0.8, zz + 0.3);
        });
      side((sx) => {
        const wx = sx * (W / 2 - 0.12);
        for (let zz = -D + 0.9; zz < -1.4; zz += 0.8) {
          k.box(k.paint, jew ? "#3a1e30" : opt ? "#ffffff" : "#16243a", 0.25, 1.6, 0.7, wx - sx * 0.12, 0.6, zz);
          k.box(k.glow, "#fff0d8", 0.02, 1.5, 0.64, wx - sx * 0.25, 0.65, zz, 0, opt ? 0.5 : 0.3);
          for (let r = 0; r < (opt ? 6 : 3); r++) item(wx - sx * 0.28, 0.75 + r * (opt ? 0.24 : 0.45), zz, r);
        }
        k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.4, -D, sx < 0 ? -W / 2 + 0.4 : W / 2, -1.0);
      });
      if (def.kind === "watches")
        k.picture(1.8, 1.8, 0, 2.3, back + 0.06, 0, (g, w, h) => {
          g.fillStyle = "#0c1626";
          g.fillRect(0, 0, w, h);
          g.strokeStyle = "#e8c860";
          g.lineWidth = w * 0.02;
          g.beginPath();
          g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = "#e8c860";
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            g.fillRect(w / 2 + Math.sin(a) * w * 0.36 - 4, h / 2 - Math.cos(a) * h * 0.36 - 4, 8, 8);
          }
          g.lineWidth = w * 0.025;
          g.beginPath();
          g.moveTo(w / 2, h / 2);
          g.lineTo(w / 2 + w * 0.2, h / 2 - h * 0.12);
          g.moveTo(w / 2, h / 2);
          g.lineTo(w / 2 - w * 0.05, h / 2 - h * 0.32);
          g.stroke();
          g.font = `600 ${Math.round(h * 0.06)}px ${SERIF}`;
          g.textAlign = "center";
          g.fillText(def.brand.split(" ")[0], w / 2, h * 0.7);
        }, { glow: true });
      else k.box(k.glow, jew ? "#ffd8f0" : "#ffffff", W - 1.4, 1.8, 0.03, 0, 1.0, back + 0.05, 0, jew ? 0.5 : 0.7);
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.TorusGeometry(0.6 - r * 0.15, 0.015, 4, 32);
        ring.rotateX(Math.PI / 2);
        ring.translate(0, H - 0.4 - r * 0.15, -D / 2);
        k.geo(k.glow, "#fff0d0", ring, undefined, 1.8);
      }
      side((sx) => vitrine(k, sx * (W / 4 + 0.4), -0.9, 1.2, 0.6, "#1a1214", item, 3));
      cash(jew ? "#e8c860" : "#d8dce4", "#1a1418");
      break;
    }
    case "exchange": {
      // the counter with its glass windows; the rate board is live (see the level builder)
      k.box(k.gloss, "#1a1a1e", W - 1, 1.05, 0.7, 0, 0, -D / 2);
      k.box(k.metal, "#d8c088", W - 1, 0.04, 0.74, 0, 1.05, -D / 2);
      k.box(k.glass, "#ffffff", W - 1, 1.3, 0.03, 0, 1.1, -D / 2);
      for (let x = -W / 2 + 1; x <= W / 2 - 1; x += (W - 2) / 3) {
        k.box(k.metal, "#d8c088", 0.05, 1.3, 0.05, x, 1.1, -D / 2);
        k.box(k.glow, "#f4b728", 0.5, 0.04, 0.02, x + 0.6, 2.5, -D / 2, 0, 1.2);
      }
      k.solid(f, -W / 2, -D / 2 - 0.4, W / 2, -D / 2 + 0.4);
      k.box(k.paint, "#2a2a30", 0.8, 0.9, 0.4, -W / 2 + 1, 0, -0.7);
      break;
    }
    case "cafe":
    case "dessert": {
      const cafe = def.kind === "cafe";
      // the bar along the back with pastries and a machine, menu boards, bistro tables
      k.box(k.paint, cafe ? "#4a3020" : "#ffffff", W - 1.4, 1.0, 0.7, 0, 0, -D + 1.3);
      k.box(k.gloss, cafe ? "#e8e4de" : "#ffb8cc", W - 1.3, 0.05, 0.76, 0, 1.0, -D + 1.3);
      k.box(k.glass, "#ffffff", 1.6, 0.4, 0.5, -W / 4, 1.05, -D + 1.3);
      for (let i = 0; i < 8; i++) k.box(k.paint, pick(cafe ? ["#c8884a", "#8a5a2a", "#f4d8a0", "#5a3020"] : ["#ff8ab0", "#fff0b0", "#c8e8ff", "#ffffff", "#8a5a2a"], s, i), 0.14, 0.08, 0.14, -W / 4 - 0.6 + (i % 4) * 0.4, 1.06 + Math.floor(i / 4) * 0.2, -D + 1.3);
      k.box(k.metal, "#c8ccd4", 0.6, 0.5, 0.4, W / 4, 1.05, -D + 1.3);
      k.box(k.glow, "#ff6a3a", 0.05, 0.05, 0.02, W / 4 + 0.2, 1.4, -D + 1.09, 0, 2);
      k.solid(f, -W / 2, -D, W / 2, -D + 1.7);
      for (let i = 0; i < 3; i++)
        k.picture(1.0, 0.7, -1.2 + i * 1.2, 3.1, back + 0.06, 0, (g, w, h) => {
          g.fillStyle = cafe ? "#1a1410" : "#fff4f6";
          g.fillRect(0, 0, w, h);
          g.fillStyle = cafe ? "#f4e0c0" : "#c83a6a";
          g.font = `700 ${Math.round(h * 0.12)}px ${MONO}`;
          const items = cafe ? [["FLAT WHITE", "5.2"], ["KOPI-O", "2.4"], ["MATCHA", "6.0"], ["CROISSANT", "4.5"], ["KAYA TOAST", "3.8"]] : [["ICE KACANG", "4.8"], ["MANGO SAGO", "6.2"], ["DURIAN PUFF", "3.6"], ["BOBA MILK", "5.4"], ["MOCHI", "4.0"]];
          items.slice(i, i + 4).forEach(([n, p], j) => {
            g.textAlign = "left";
            g.fillText(n, w * 0.06, h * (0.22 + j * 0.2));
            g.textAlign = "right";
            g.fillText(p, w * 0.94, h * (0.22 + j * 0.2));
          });
        }, { glow: true });
      for (const [x, zz] of [
        [-W / 4, -D / 2 + 0.4],
        [W / 4, -D / 2 + 0.4],
        [0, -2.0],
      ] as [number, number][]) {
        k.cyl(k.gloss, cafe ? "#e8e4de" : "#ffffff", 0.4, 0.4, 0.04, x, 0.74, zz, 16);
        k.cyl(k.metal, "#2a2a30", 0.04, 0.04, 0.74, x, 0, zz, 6);
        chair(k, x - 0.6, zz, cafe ? "#c9a227" : "#ff9ab8", Math.PI / 2);
        chair(k, x + 0.6, zz, cafe ? "#c9a227" : "#ff9ab8", -Math.PI / 2);
        k.solid(f, x - 0.85, zz - 0.4, x + 0.85, zz + 0.4);
      }
      break;
    }
    case "restaurant": {
      // an open kitchen glowing at the back, lanterns, tables for four
      k.box(k.paint, "#2a1e18", W - 1, 1.05, 0.7, 0, 0, -D + 1.4);
      k.box(k.gloss, "#c8ccd4", W - 0.9, 0.05, 0.76, 0, 1.05, -D + 1.4);
      k.box(k.glow, "#ffb070", W - 1, 1.2, 0.03, 0, 1.4, back + 0.05, 0, 0.7);
      for (let i = 0; i < 4; i++) k.cyl(k.metal, "#3a3a40", 0.18, 0.15, 0.12, -W / 2 + 1.4 + i * 1.3, 1.1, -D + 1.4, 10);
      k.solid(f, -W / 2, -D, W / 2, -D + 1.8);
      for (let x = -W / 2 + 1.1; x < W / 2 - 0.4; x += 1.6) {
        k.cyl(k.glow, "#ff4a3a", 0.22, 0.22, 0.38, x, 3.4, -D / 2, 10, 1.1);
        k.cyl(k.paint, "#1a1a1e", 0.05, 0.05, 0.6, x, 3.78, -D / 2, 6);
      }
      for (const [x, zz] of [
        [-W / 4, -D / 2 - 0.2],
        [W / 4, -D / 2 - 0.2],
        [-W / 4, -2.0],
        [W / 4, -2.0],
      ] as [number, number][]) {
        table(k, x, zz, 1.0, 0.9, 0.75, "#3a2416", "#1a1a1e");
        for (const [dx, dz, r] of [
          [-0.7, 0, Math.PI / 2],
          [0.7, 0, -Math.PI / 2],
        ] as [number, number, number][])
          chair(k, x + dx, zz + dz, "#7a1e1e", r);
        for (let i = 0; i < 3; i++) k.cyl(k.gloss, "#f4f2ee", 0.1, 0.08, 0.04, x - 0.25 + i * 0.25, 0.75, zz, 10);
        k.solid(f, x - 0.95, zz - 0.45, x + 0.95, zz + 0.45);
      }
      break;
    }
    case "florist": {
      for (let x = -W / 2 + 0.7; x < W / 2 - 0.4; x += 0.55)
        for (const zz of [-D + 0.7, -D + 1.3]) flowers(k, x, 0, zz, s + Math.round(x * 10) + Math.round(zz));
      k.solid(f, -W / 2, -D, W / 2, -D + 1.7);
      k.box(k.leaf, "#3a6a34", W - 1, 2.4, 0.08, 0, 1.6, back + 0.08);
      for (let i = 0; i < 40; i++) k.box(k.paint, pick(["#ff6a8a", "#ffffff", "#ffd84a"], s, i), 0.08, 0.08, 0.04, -W / 2 + 0.8 + hash(s, i, 1, 1) * (W - 1.6), 1.7 + hash(s, i, 2, 1) * 2.2, back + 0.14);
      side((sx) => {
        table(k, sx * (W / 4), -D / 2 + 0.4, 1.4, 0.8, 0.75, "#8a6a4a", "#5a4a3a", wood());
        for (let i = 0; i < 4; i++) flowers(k, sx * (W / 4) - 0.5 + i * 0.33, 0.75, -D / 2 + 0.4, s + i * 3 + sx);
        k.solid(f, sx * (W / 4) - 0.7, -D / 2, sx * (W / 4) + 0.7, -D / 2 + 0.8);
        for (let i = 0; i < 3; i++) flowers(k, sx * (W / 4 + 0.4) - 0.4 + i * 0.4, 0, -0.8, s + i + 11 * sx);
      });
      k.box(k.paint, "#5a4a3a", 1.4, 0.95, 0.6, 0, 0, -D / 2 - 1.4);
      k.solid(f, -0.7, -D / 2 - 1.7, 0.7, -D / 2 - 1.1);
      break;
    }
    case "luggage": {
      side((sx) => {
        const wx = sx * (W / 2 - 0.12);
        for (let r = 0; r < 3; r++) {
          k.box(k.paint, "#2a2a30", 0.5, 0.03, D - 1.6, wx - sx * 0.25, r * 1.0 + 0.05, -D / 2 - 0.5);
          for (let zz = -D + 0.6; zz < -1.5; zz += 0.5) suitcase(k, wx - sx * 0.28, r * 1.0 + 0.05, zz, pick(["#1a1a1e", "#c8ccd4", "#f4b728", "#3a7ac8", "#c83a3a", "#f4f2ee"], s + r, Math.round(zz * 10)), 0.55 + r * 0.05, Math.PI / 2);
        }
        k.solid(f, sx < 0 ? -W / 2 : W / 2 - 0.55, -D, sx < 0 ? -W / 2 + 0.55 : W / 2, -1.0);
      });
      for (let i = 0; i < 5; i++) suitcase(k, -1.2 + i * 0.6, 0.2, -D / 2, pick(["#f4b728", "#1a1a1e", "#c8ccd4", "#3a7ac8"], s, i), 0.75);
      k.box(k.paint, "#f2efe8", 3.2, 0.2, 0.8, 0, 0, -D / 2);
      k.solid(f, -1.6, -D / 2 - 0.4, 1.6, -D / 2 + 0.4);
      side((sx) => suitcase(k, sx * (W / 4 + 0.3), 0, -0.9, sx > 0 ? "#f4b728" : "#c8ccd4", 0.8, 0.4));
      cash("#c8ccd4", "#2a2a30");
      break;
    }
    case "photo": {
      for (let i = 0; i < 3; i++) {
        const x = -W / 2 + 1.3 + i * ((W - 2.6) / 2);
        k.box(k.paint, pick(["#ff4fb8", "#7a5cff", "#3ef0ff"], s, i), 1.6, 2.3, 1.6, x, 0, -D + 1.2);
        k.box(k.paint, "#ffffff", 1.0, 1.8, 0.02, x, 0.1, -D + 2.01);
        k.box(k.glow, "#ffd8f4", 1.6, 0.06, 0.06, x, 2.3, -D + 2.0, 0, 1.6);
        k.sign("PURIKURA", 0.18, x, 2.55, -D + 2.02, 0, { color: "#ffffff" });
      }
      k.solid(f, -W / 2, -D, W / 2, -D + 2.1);
      side((sx) => {
        k.box(k.paint, "#ff4fb8", 1.0, 1.0, 0.6, sx * (W / 4 + 0.3), 0, -D / 2 + 0.6);
        k.box(k.glow, "#3ef0ff", 0.6, 0.35, 0.02, sx * (W / 4 + 0.3), 0.55, -D / 2 + 0.91, 0, 0.9);
        k.solid(f, sx * (W / 4 + 0.3) - 0.5, -D / 2 + 0.3, sx * (W / 4 + 0.3) + 0.5, -D / 2 + 0.9);
      });
      break;
    }
  }
  // a couple of plants by the door
  if (def.kind !== "exchange") bush(k, -W / 2 + 0.5, 0, -0.5, 0.45, s + 77);
}

const L = (def: ShopDef) => LOOK[def.kind];

void shelves;
void stool;
