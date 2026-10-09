import * as THREE from "three";
import { drawMark, emblem } from "../../scene/emblems";
import type { WalletFeed, WalletTower } from "../../data/walletfeed";
import type { LiftStyle, SkyKit } from "../zktowers/kit";
import { rr, SANS } from "../zktowers/kit";

/**
 * The wallet towers' shared pieces: each wallet's palette (ZODL white and black, Vizor crimson
 * and silver), its emblem turning on a beam of light, canvas text that wraps, dates and counts.
 */

export interface Look {
  key: WalletTower;
  name: string;
  /** The tower's name over the doors and in the HUD. */
  title: string;
  handle: string;
  site: string;
  /** The brand colour on cards and buttons (Zodl black, Vizor crimson). */
  accent: string;
  /** Second text colour on cards. */
  soft: string;
  /** Light: strips, rings, beams, lamps (Zodl white, Vizor pink neon). */
  glow: string;
  /** Text and lines on the walls. */
  sign: string;
  /** The app icon: its ground and its mark. */
  iconBg: string;
  iconMark: string;
  /** Ceilings, pedestals, mullions, walls, floors, frames. */
  dark: string;
  wall: string;
  floor: string;
  vein: string;
  trim: string;
  /** Poster cards (white, like X): background, ink, muted ink. */
  card: string;
  ink: string;
  muted: string;
  lift: LiftStyle;
  /** One line under the name. */
  motto: string;
  /** Lamps and screens dimmed by these (the white tower would burn out under the bloom). */
  lamps: number;
  screens: number;
}

/**
 * The wallets' real colours: Zodl's app icon is a black origami bird on white (its site is white
 * and charcoal); Vizor's is a silver knight's helmet on crimson (#b90b4a on vizor.cash); Noir's is
 * a silver eclipse on black with a green light, its wordmark white and emerald (#00d38c).
 */
export const LOOKS: Record<WalletTower, Look> = {
  zodl: {
    key: "zodl",
    name: "Zodl",
    title: "ZODL TOWER",
    handle: "zodl_app",
    site: "https://www.zodl.com",
    accent: "#151314",
    soft: "#3d393a",
    glow: "#ffffff",
    sign: "#151314",
    iconBg: "#ffffff",
    iconMark: "#000000",
    dark: "#151314",
    wall: "#e4e2de",
    floor: "#d6d4cf",
    vein: "#bdbbbc",
    trim: "#151314",
    card: "#ffffff",
    ink: "#151314",
    muted: "#797576",
    lift: { wall: "#f5f4f2", frame: "#151314", door: "#d8d6d2", ink: "#151314", lit: "#3d393a", accent: "#151314", deco: "bar" },
    motto: "The most private way to transact",
    lamps: 0.45,
    screens: 0.74,
  },
  vizor: {
    key: "vizor",
    name: "Vizor",
    title: "VIZOR TOWER",
    handle: "vizorwallet",
    site: "https://vizor.cash",
    accent: "#b90b4a",
    soft: "#8e0a3a",
    glow: "#ff4f86",
    sign: "#ffffff",
    iconBg: "#b90b4a",
    iconMark: "#e6e6ec",
    dark: "#141818",
    wall: "#9e0c41",
    floor: "#1c1f1f",
    vein: "#5a1030",
    trim: "#c8c8d0",
    card: "#ffffff",
    ink: "#141818",
    muted: "#626767",
    lift: { wall: "#141818", frame: "#c8c8d0", door: "#b8b8c0", ink: "#ffffff", lit: "#ff4f86", accent: "#b90b4a", deco: "arch" },
    motto: "Take your privacy back",
    lamps: 0.9,
    screens: 0.86,
  },
  noir: {
    key: "noir",
    name: "Noir",
    title: "NOIR TOWER",
    handle: "noir_wallet",
    site: "https://zknoir.com",
    accent: "#00a56c",
    soft: "#2e3a35",
    glow: "#00d38c",
    sign: "#e8eae9",
    iconBg: "#1a1a1a",
    iconMark: "#d8d8dc",
    dark: "#0b0b0d",
    wall: "#141416",
    floor: "#18181a",
    vein: "#1f4a3a",
    trim: "#bfc3c8",
    card: "#ffffff",
    ink: "#151314",
    muted: "#6b706e",
    lift: { wall: "#141416", frame: "#bfc3c8", door: "#2a2c2e", ink: "#e8eae9", lit: "#00d38c", accent: "#00d38c", deco: "bar" },
    motto: "Privacy-first wallet",
    lamps: 0.9,
    screens: 0.86,
  },
};

export interface WalletKit {
  k: SkyKit;
  look: Look;
  feed(): WalletFeed | null;
  /** Called when the feed arrives or changes. */
  onFeed(fn: () => void): void;
}

/**
 * The emblem on floor f at (x, y, z), `size` times the hall's, turning and bobbing; a cone of light
 * under it when `beam`. Returns the group (clickable through its first child).
 */
export function spinningEmblem(wk: WalletKit, f: number, x: number, y: number, z: number, size: number, beam = true) {
  const { k, look } = wk;
  const holder = new THREE.Group();
  const e = emblem(look.key, { glow: 1.6 });
  e.scale.multiplyScalar(size);
  holder.add(e);
  k.add(f, holder, x, y, z, 0);
  if (beam) {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 * size, 0.9 * size, y, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(look.glow).multiplyScalar(0.55), transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    cone.raycast = () => {};
    k.add(f, cone, x, y / 2, z, 0);
  }
  const phase = x + z;
  k.ticks[f].push((dt, t) => {
    e.rotation.y += dt * 0.9;
    holder.position.y = k.y(f) + y + Math.sin(t * 1.2 + phase) * 0.06 * size;
  });
  return holder;
}

/** Words to lines no wider than `max` pixels (a word longer than a line is cut). */
export function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    let line = "";
    for (const w of para.split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width <= max) line = next;
      else {
        if (line) out.push(line);
        line = w;
        while (g.measureText(line).width > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && g.measureText(line.slice(0, cut)).width > max) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
    }
    if (line) out.push(line);
  }
  while (out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * Text in a box: the largest font from `sizes` at which it fits `h` pixels (the smallest, cut
 * with an ellipsis, otherwise). Draws from (x, y) top-left; returns the height used.
 */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, font: (px: number) => string, sizes: number[], lh = 1.28) {
  for (let i = 0; i < sizes.length; i++) {
    const px = sizes[i];
    g.font = font(px);
    let lines = wrap(g, text, w);
    const fit = Math.floor(h / (px * lh));
    if (lines.length > fit) {
      if (i < sizes.length - 1) continue;
      lines = lines.slice(0, Math.max(1, fit));
      let last = lines[lines.length - 1];
      while (last && g.measureText(`${last}…`).width > w) last = last.slice(0, -1);
      lines[lines.length - 1] = `${last}…`;
    }
    g.textBaseline = "top";
    lines.forEach((l, j) => g.fillText(l, x, y + j * px * lh));
    return lines.length * px * lh;
  }
  return 0;
}

export const compact = (n: number | null | undefined) => {
  if (n == null) return "–";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
};

export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A circular picture (an avatar), or the wallet's mark on its accent while it loads. */
export function avatar(g: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, r: number, look: Look) {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.closePath();
  if (img) {
    g.clip();
    g.drawImage(img, x - r, y - r, r * 2, r * 2);
  } else {
    g.fillStyle = look.iconBg;
    g.fill();
    drawMark(g, look.key, x, y, r * 1.1, look.iconMark);
  }
  g.restore();
}

/** An image drawn to cover a rounded box (cropped to fill it). */
export function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r = 18) {
  g.save();
  rr(g, x, y, w, h, r);
  g.clip();
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s,
    ih = img.naturalHeight * s;
  g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  g.restore();
}

/** Stars out of five (a filled share of each). */
export function stars(g: CanvasRenderingContext2D, x: number, y: number, size: number, rating: number, on: string, off: string) {
  const star = (cx: number, cy: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.45 : r;
      g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    g.closePath();
  };
  for (let i = 0; i < 5; i++) {
    const cx = x + size / 2 + i * size * 1.1,
      cy = y + size / 2;
    star(cx, cy, size / 2);
    g.fillStyle = off;
    g.fill();
    const share = Math.max(0, Math.min(1, rating - i));
    if (share > 0) {
      g.save();
      g.beginPath();
      g.rect(cx - size / 2, cy - size / 2, size * share, size);
      g.clip();
      star(cx, cy, size / 2);
      g.fillStyle = on;
      g.fill();
      g.restore();
    }
  }
}

export const FONT = (w: number, px: number) => `${w} ${px}px ${SANS}`;
