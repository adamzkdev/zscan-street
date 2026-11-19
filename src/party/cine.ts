/**
 * ZK PARTY's cinematics: the few seconds before a mini-game's rules card, and the board's opening.
 *
 * - `MiniIntro` (host.ts playMini, before the card): letterbox bars slide in, the camera cuts through
 *   the level (a crane down over the arena, a low pass on its landmark under the level's twist, then
 *   the four players), the game's title slams in with its level's name and a sting, the snarks drop
 *   in one by one with their name plates (yours under a spotlight), and a wipe opens the rules card.
 *   It works for any 3D game from what it can see (the game's scene, its card camera, its snarks); a
 *   game may hand it its own shots (`Mini.intro()`, or a level's `MiniVariant.shots`: kit.ts
 *   IntroShot). It holds the game's camera and snarks only while it runs: each frame it gives them
 *   back as the game left them before the game's own `idle("card")`, then puts its own on top.
 * - `CineHud`: the overlay both draw with (letterbox, title slam, captions, zone stamps, name plates,
 *   spotlight, flash, skip hint, wipe), in the HUD's own letters (hud.ts). board/game.ts uses it for
 *   the board's opening fly-over.
 *
 * (k3's Avatar is every game's player: the intro tags each one on its root as it syncs, below, to know
 * whose monkey is whose and to give it a pose; a monkey without the tag is still found, by order.)
 */
import * as THREE from "three";
import { T } from "../i18n/lang";
import { FONT, H, HUD, W, clamp, fpx, rr, sfx, text, type Input, type IntroShot, type Mini, type MiniDef, type MiniVariant, type Player, type View3 } from "./kit";
import { Avatar, Fx3, short, toScreen } from "./k3";
import { INK, badge, padBtn, tint, touchWords, toy, touchy, wrap } from "./hud";
import { music, type Song } from "./music";

const sync0 = Avatar.prototype.sync;
Avatar.prototype.sync = function (this: Avatar, dt: number, t?: number) {
  this.root.userData.av = this;
  return sync0.call(this, dt, t);
};

// ---- easing --------------------------------------------------------------------------------------

export const ez = {
  /** Sine in and out: a crane, a truck. */
  io: (u: number) => -(Math.cos(Math.PI * clamp(u, 0, 1)) - 1) / 2,
  /** Cubic in and out. */
  io3: (u: number) => ((u = clamp(u, 0, 1)) < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out3: (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3),
  out5: (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 5),
  in2: (u: number) => clamp(u, 0, 1) ** 2,
  back: (u: number) => {
    u = clamp(u, 0, 1);
    return 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2);
  },
};
const k01 = (t: number, a: number, len: number) => clamp((t - a) / len, 0, 1);

// ---- the sting -----------------------------------------------------------------------------------

/** The title's hit: a stab on the downbeat, then ♭VI ♭VII I ringing out (da… da-da DAAA). */
const STING: Song = {
  bpm: 150,
  level: 1.15,
  once: true,
  fx: false,
  stages: [
    {
      ch: "C,C,Ab,Bb C",
      lp: 3800,
      parts: [
        { i: "brass", n: "G5 - - - . . . . Ab5 - - . Bb5 - - . | C6 - - - - - - - - - - - . . . .", r: 1 },
        { i: "brass", h: "G5 - - - . . . . Ab5 - - . Bb5 - - . | C6 - - - - - - - - - - - . . . .", r: 1, v: 0.55 },
        { i: "square", n: "G5 - - - . . . . Ab5 - - . Bb5 - - . | C6 - - - - - - - - - - - . . . .", r: 1, o: 1, v: 0.22 },
        { i: "brass", c: "x - - - . . . . x - - . x - - . | x - - - - - - - - - - - . . . .", r: 1, o: -1, v: 0.6 },
        { i: "strings", v: 0.6 },
        { i: "bass", b: "R - - - . . . . R - - . R - - . | R - - - - - - - - - - - . . . .", r: 1 },
        { d: "y", p: "x... .... .... .... | x... .... .... ....", v: 0.9 },
        { d: "k", p: "X... .... X... X... | X... .... .... ....", v: 1 },
        { d: "s", p: "x... .... x... x... | x... .... .... ....", v: 0.8 },
        { d: "3", p: ".... ..xx .... ..xx | .... .... .... ....", v: 0.7 },
      ],
    },
  ],
};

/** The sting, once (it ducks whatever plays). */
export function sting() {
  try {
    music.sting(STING);
  } catch {
    // (no sound: no sting)
  }
}

// ---- the overlay ---------------------------------------------------------------------------------

/** The letterbox's bars (px of the 540). */
export const BAR = 62;
const BAR_C = "#07041a";

interface Slam {
  title: string;
  sub?: string;
  chip?: string;
  color: string;
  t: number;
  /** When it docks in the top bar (s after it starts); Infinity: it stays. */
  dock: number;
  /** When it goes (s; Infinity: it stays until cleared). */
  out: number;
  size: number;
  hit: boolean;
}
interface Cap {
  chip: string;
  s: string;
  color: string;
  t: number;
  dur: number;
}
export interface Plate {
  p: Player;
  /** Over its head on the HUD (set every frame by the owner); off screen: on false. */
  x: number;
  y: number;
  on: boolean;
  /** Since it popped up (s); < 0: not yet. */
  t: number;
}

/** The impact's beat: the title lands this long after its slam starts. */
export const SLAM_HIT = 0.17;

/**
 * Everything a cinematic draws over the 3D: the bars, the title slam, a caption in the bottom bar, a
 * zone's stamp under the top bar, the players' plates, a spotlight, a flash, the skip hint.
 */
export class CineHud {
  /** The bars want in (true) or out. */
  bars = false;
  private barK = 0;
  slam: Slam | null = null;
  cap: Cap | null = null;
  stamp: (Cap & { idx?: string }) | null = null;
  plates: Plate[] = [];
  flash = 0;
  /** A darkening round one spot (yours): screen x, y, its radius; `want` 0…1. */
  spot = { x: W / 2, y: H / 2, r: 110, a: 0, want: 0 };
  hint: { btn: "a" | "b"; s: string; s2?: string } | null = null;
  /** The game's colour on the bars' edges. */
  accent = "#ff6b35";
  /** True for the one frame the title lands (the owner shakes its camera). */
  impact = false;
  private t = 0;

  /** How far in the bars are (0…1, eased). */
  get barH() {
    return BAR * (this.bars ? ez.out3(this.barK) : ez.io(this.barK));
  }

  update(dt: number) {
    this.t += dt;
    this.barK = clamp(this.barK + (this.bars ? dt / 0.5 : -dt / 0.4), 0, 1);
    this.impact = false;
    const s = this.slam;
    if (s) {
      const was = s.t;
      s.t += dt;
      if (was < SLAM_HIT && s.t >= SLAM_HIT) ((s.hit = true), (this.impact = true));
      if (s.t > s.out + 0.4) this.slam = null;
    }
    if (this.cap && (this.cap.t += dt) > this.cap.dur) this.cap = null;
    if (this.stamp && (this.stamp.t += dt) > this.stamp.dur) this.stamp = null;
    for (const p of this.plates) if (p.t >= 0) p.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.spot.a += (this.spot.want - this.spot.a) * Math.min(1, dt * 5);
  }

  /** The title slams in (`sub` on a ribbon under it, `chip` at the ribbon's end), docks up in the top bar after `dock` s. */
  title(title: string, color: string, o: { sub?: string; chip?: string; dock?: number; out?: number; size?: number } = {}) {
    this.slam = { title, sub: o.sub, chip: o.chip, color, t: 0, dock: o.dock ?? Infinity, out: o.out ?? Infinity, size: o.size ?? 80, hit: false };
  }
  caption(chip: string, s: string, color: string, dur: number) {
    this.cap = { chip, s, color, t: 0, dur };
  }
  zone(s: string, idx: string | undefined, color: string, dur: number) {
    this.stamp = { chip: "", s, idx, color, t: 0, dur };
  }
  /** Fade the title out now. */
  titleOut() {
    if (this.slam) this.slam.out = Math.min(this.slam.out, this.slam.t);
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    const bh = this.barH;
    // a vignette while it rolls: the frame reads as a film
    if (bh > 0.5) {
      const rg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      rg.addColorStop(0, "rgba(6,3,20,0)");
      rg.addColorStop(1, `rgba(6,3,20,${0.42 * (bh / BAR)})`);
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    }
    if (this.spot.a > 0.01) this.drawSpot(g);
    if (this.flash > 0.01) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.75, this.flash)})`;
      g.fillRect(0, 0, W, H);
    }
    if (bh > 0.5) this.drawBars(g, bh, t);
    for (const p of this.plates) if (p.t >= 0 && p.on) drawPlate(g, p, t);
    if (this.stamp) this.drawStamp(g, this.stamp, bh);
    if (this.cap) this.drawCap(g, this.cap, bh);
    if (this.slam) this.drawSlam(g, this.slam, bh);
  }

  private drawBars(g: CanvasRenderingContext2D, bh: number, t: number) {
    g.fillStyle = BAR_C;
    g.fillRect(0, 0, W, bh);
    g.fillRect(0, H - bh, W, bh);
    // the party's slow stripes in the bars, and a thin edge of the game's colour
    g.save();
    g.beginPath();
    g.rect(0, 0, W, bh);
    g.rect(0, H - bh, W, bh);
    g.clip();
    g.globalAlpha = 0.06;
    g.fillStyle = this.accent;
    const off = (t * 26) % 64;
    for (let x = -80 + off; x < W + 80; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 24, 0);
      g.lineTo(x + 24 - H * 0.3, H);
      g.lineTo(x - H * 0.3, H);
      g.fill();
    }
    g.restore();
    g.fillStyle = this.accent;
    g.globalAlpha = 0.9;
    g.fillRect(0, bh - 2.5, W, 2.5);
    g.fillRect(0, H - bh, W, 2.5);
    g.globalAlpha = 1;
    const h = this.hint;
    if (h && bh > BAR * 0.6) {
      const y = H - bh / 2;
      const a = 0.55 + 0.25 * Math.sin(t * 4);
      g.save();
      g.globalAlpha = a;
      if (touchy()) text(g, h.btn === "a" ? T("TAP TO SKIP", "点击跳过") : h.s, W - 28, y, 12, "#ffffff", "right", 900);
      else {
        g.font = `900 ${fpx(12)}px ${FONT}`;
        const w1 = g.measureText(h.s).width;
        text(g, h.s, W - 28, y + 1, 12, "#ffffff", "right", 900);
        padBtn(g, h.btn, W - 28 - w1 - 16, y, 10);
        if (h.s2) {
          const x2 = W - 28 - w1 - 40;
          g.font = `900 ${fpx(12)}px ${FONT}`;
          const w2 = g.measureText(h.s2).width;
          text(g, h.s2, x2, y + 1, 12, "#ffffff", "right", 900);
          padBtn(g, "a", x2 - w2 - 16, y, 10);
        }
      }
      g.restore();
    }
  }

  private drawSpot(g: CanvasRenderingContext2D) {
    const s = this.spot;
    const rg = g.createRadialGradient(s.x, s.y, s.r * 0.55, s.x, s.y, s.r * 2.1);
    rg.addColorStop(0, "rgba(6,3,20,0)");
    rg.addColorStop(1, `rgba(6,3,20,${0.5 * s.a})`);
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    // a soft warm halo round you
    const hg = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    hg.addColorStop(0, `rgba(255,236,170,${0.16 * s.a})`);
    hg.addColorStop(1, "rgba(255,236,170,0)");
    g.fillStyle = hg;
    g.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
  }

  /** The title: it slams in from big, lands with a ring and speed lines, settles, then docks in the top bar. */
  private drawSlam(g: CanvasRenderingContext2D, s: Slam, bh: number) {
    const t = s.t;
    const cy = H * 0.4;
    // in, the hit's wobble, the dock up, the fade out
    const kin = k01(t, 0, SLAM_HIT);
    const after = Math.max(0, t - SLAM_HIT);
    const dock = ez.io3(k01(t, s.dock, 0.5));
    const fade = 1 - k01(t, s.out, 0.35);
    let sc = t < SLAM_HIT ? 2.5 - 1.5 * ez.in2(kin) : 1 + 0.1 * Math.sin(after * 26) * Math.exp(-after * 7);
    sc *= 1 - dock * 0.62;
    const y = cy + (Math.max(bh, 22) / 2 + 1 - cy) * dock;
    g.save();
    g.globalAlpha = Math.min(1, kin * 2.5) * fade;
    // the hit: a ring bursting out and speed lines (only before it docks)
    if (s.hit && after < 0.6 && dock < 0.01) {
      const k = after / 0.6;
      g.save();
      g.globalAlpha *= (1 - k) * 0.85;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 10 * (1 - k) + 2;
      g.beginPath();
      g.ellipse(W / 2, cy, 120 + ez.out3(k) * 420, 50 + ez.out3(k) * 170, 0, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = s.color;
      g.lineWidth = 4;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.2;
        const r0 = 170 + ez.out3(k) * 160;
        const r1 = r0 + 60 * (1 - k);
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(a) * r0 * 1.5, cy + Math.sin(a) * r0 * 0.6);
        g.lineTo(W / 2 + Math.cos(a) * r1 * 1.5, cy + Math.sin(a) * r1 * 0.6);
        g.stroke();
      }
      g.restore();
    }
    // the ribbon under it (gone as it docks)
    if (s.sub && dock < 0.99) {
      const rk = ez.out5(k01(t, SLAM_HIT + 0.08, 0.38));
      g.save();
      g.globalAlpha *= 1 - dock;
      g.translate(W / 2 + (1 - rk) * W * 0.7, cy + 68 - dock * 40);
      ribbon(g, s.sub, s.chip, s.color);
      g.restore();
    }
    g.translate(W / 2, y);
    g.scale(sc, sc);
    g.font = `900 ${s.size}px ${FONT}`;
    const tw = g.measureText(s.title).width;
    const size = tw > 840 ? (s.size * 840) / tw : s.size;
    toy(g, s.title, 0, 0, size, "#ffffff", { ink: tint(s.color, -0.62), rim: s.color, top: "#ffffff" });
    g.restore();
    // docked: its level beside it, small
    if (dock > 0.98 && s.sub) {
      g.save();
      g.globalAlpha = fade * k01(t, s.dock + 0.45, 0.25);
      g.font = `900 ${size * 0.38}px ${FONT}`;
      const w = g.measureText(s.title).width;
      g.font = `900 ${fpx(12)}px ${FONT}`;
      const sw = g.measureText(s.sub).width + 22;
      const x = W / 2 + w / 2 + 14;
      // (too long for the bar: the title alone)
      if (x + sw > W - 150) return g.restore();
      rr(g, x, y - 11, sw, 22, 11);
      g.fillStyle = s.color;
      g.fill();
      text(g, s.sub, x + sw / 2, y + 0.5, 12, tint(s.color, -0.72), "center", 900);
      g.restore();
    }
  }

  /** A caption in the bottom bar: a chip of the colour (what this shot is), the line. */
  private drawCap(g: CanvasRenderingContext2D, c: Cap, bh: number) {
    const kin = ez.out3(k01(c.t, 0, 0.32));
    const kout = k01(c.t, c.dur - 0.25, 0.25);
    const a = kin * (1 - kout);
    if (a <= 0.01) return;
    const y = H - Math.max(bh, 40) / 2;
    g.save();
    g.globalAlpha = a;
    g.translate(-(1 - kin) * 30, 0);
    g.font = `900 ${fpx(11.5)}px ${FONT}`;
    const cw = g.measureText(c.chip).width + 20;
    rr(g, 32, y - 11, cw, 22, 11);
    g.fillStyle = c.color;
    g.fill();
    text(g, c.chip, 32 + cw / 2, y + 0.5, 11.5, tint(c.color, -0.72), "center", 900);
    // the line, as big as the bar leaves room for
    const room = W - 32 - cw - 14 - (this.hint ? 170 : 40);
    let fs = 18;
    g.font = `800 ${fs}px ${FONT}`;
    // (never under the small print's floor on a small screen: it takes two lines there instead)
    const lo = Math.max(12, Math.ceil(fpx(12)));
    while (fs > lo && g.measureText(c.s).width > room) g.font = `800 ${--fs}px ${FONT}`;
    let lines = [c.s];
    if (g.measureText(c.s).width > room) {
      // (a small screen: two lines in the bar before a word is cut; a computer cuts, as it always has)
      lines = HUD.min ? wrap(g, c.s, room) : [c.s];
      const keep = HUD.min ? 2 : 1;
      let s = lines.slice(keep - 1).join(" ");
      if (lines.length > keep || g.measureText(s).width > room) {
        while (s.length > 4 && g.measureText(s + "…").width > room) s = s.slice(0, -1);
        lines = [...lines.slice(0, keep - 1), s + "…"];
      }
    }
    const lh = fs + 3;
    lines.forEach((l, i) => text(g, l, 32 + cw + 12, y + 1 + (i - (lines.length - 1) / 2) * lh, fs, "#ffffff", "left", 800));
    g.restore();
  }

  /** A place's name under the top bar (the board's zones): its number, the name in toy letters, an underline. */
  private drawStamp(g: CanvasRenderingContext2D, c: Cap & { idx?: string }, bh: number) {
    const kin = ez.out5(k01(c.t, 0, 0.4));
    const kout = ez.in2(k01(c.t, c.dur - 0.3, 0.3));
    if (kin * (1 - kout) <= 0.01) return;
    const y = Math.max(bh, 20) + 44;
    g.save();
    g.globalAlpha = 1 - kout;
    g.translate(-(1 - kin) * 260 - kout * 40, 0);
    let x = 30;
    if (c.idx) {
      g.font = `900 ${fpx(12)}px ${FONT}`;
      const iw = g.measureText(c.idx).width + 18;
      rr(g, x, y - 11, iw, 22, 11);
      g.fillStyle = "rgba(7,4,26,0.82)";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = c.color;
      g.stroke();
      text(g, c.idx, x + iw / 2, y + 0.5, 12, c.color, "center", 900);
      x += iw + 12;
    }
    g.font = `900 34px ${FONT}`;
    const w = Math.min(560, g.measureText(c.s).width);
    // the underline, slanted, of the colour
    g.beginPath();
    g.moveTo(x - 6, y + 20);
    g.lineTo(x + w * kin + 18, y + 20);
    g.lineTo(x + w * kin + 10, y + 27);
    g.lineTo(x - 14, y + 27);
    g.closePath();
    g.fillStyle = c.color;
    g.fill();
    toy(g, c.s, x, y, w < g.measureText(c.s).width ? (34 * w) / g.measureText(c.s).width : 34, "#ffffff", { align: "left", ink: INK, rim: false });
    g.restore();
  }
}

/** The level's ribbon: a slanted band of the colour, its name, a white chip at its left end. */
function ribbon(g: CanvasRenderingContext2D, s: string, chip: string | undefined, color: string) {
  // (a long line shrinks to fit the screen with its chip)
  g.font = `900 25px ${FONT}`;
  const fs = Math.max(14, Math.min(25, (25 * (chip ? 600 : 720)) / Math.max(1, g.measureText(s).width)));
  g.font = `900 ${fs}px ${FONT}`;
  const tw = g.measureText(s).width;
  const w = tw + 70;
  const h = 42;
  const sk = 14;
  const band = (dx: number, dy: number, grow: number) => {
    g.beginPath();
    g.moveTo(-w / 2 + sk + dx - grow, -h / 2 + dy - grow);
    g.lineTo(w / 2 + sk + dx + grow, -h / 2 + dy - grow);
    g.lineTo(w / 2 - sk + dx + grow, h / 2 + dy + grow);
    g.lineTo(-w / 2 - sk + dx - grow, h / 2 + dy + grow);
    g.closePath();
  };
  band(0, 5, 0);
  g.fillStyle = "rgba(6,3,18,0.5)";
  g.fill();
  band(0, 0, 3);
  g.fillStyle = INK;
  g.fill();
  band(0, 0, 0);
  const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, tint(color, 0.28));
  gr.addColorStop(1, tint(color, -0.12));
  g.fillStyle = gr;
  g.fill();
  g.lineJoin = "round";
  g.lineWidth = 6;
  g.strokeStyle = tint(color, -0.65);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.strokeText(s, 4, 1);
  g.fillStyle = "#ffffff";
  g.fillText(s, 4, 1);
  if (chip) {
    g.font = `900 ${fpx(12)}px ${FONT}`;
    const cw = g.measureText(chip).width + 20;
    const cx = -w / 2 - sk - cw / 2 + 6;
    rr(g, cx - cw / 2 - 2, -13, cw + 4, 26, 13);
    g.fillStyle = INK;
    g.fill();
    rr(g, cx - cw / 2, -11, cw, 22, 11);
    g.fillStyle = "#ffffff";
    g.fill();
    text(g, chip, cx, 0.5, 12, INK, "center", 900);
  }
}

/** A player's plate over its head: its portrait, its name, its colour (yours: bigger, white-rimmed, YOU). */
function drawPlate(g: CanvasRenderingContext2D, pl: Plate, t: number) {
  const p = pl.p;
  const k = clamp(pl.t / 0.34, 0, 1);
  const s = ez.back(k);
  if (s <= 0.01) return;
  const you = p.human;
  const name = you ? T("YOU!", "你！") : short(p);
  const fs = you ? 20 : 16;
  g.font = `900 ${fs}px ${FONT}`;
  const h = you ? 44 : 36;
  const w = g.measureText(name).width + h + 26;
  g.save();
  g.translate(pl.x, pl.y);
  g.scale(s, s);
  g.rotate((1 - k) * -0.25 + (you ? Math.sin(t * 5) * 0.025 : 0));
  // the pointer down to the head, then the body, a rim for you
  const body = (grow: number) => {
    rr(g, -w / 2 - grow, -h - grow, w + grow * 2, h + grow * 2, h / 2 + grow);
    g.moveTo(-8 - grow, -1);
    g.lineTo(0, 10 + grow * 1.4);
    g.lineTo(8 + grow, -1);
  };
  if (you) {
    g.beginPath();
    body(6);
    g.fillStyle = "#ffffff";
    g.fill();
  }
  g.beginPath();
  body(3);
  g.fillStyle = INK;
  g.fill();
  g.beginPath();
  body(0);
  const gr = g.createLinearGradient(0, -h, 0, 0);
  gr.addColorStop(0, tint(p.color, 0.3));
  gr.addColorStop(1, tint(p.color, -0.12));
  g.fillStyle = gr;
  g.fill();
  // a gloss along the top
  rr(g, -w / 2 + h * 0.5, -h + 3, w - h, 3, 1.5);
  g.fillStyle = "rgba(255,255,255,0.45)";
  g.fill();
  badge(g, p, -w / 2 + h / 2 + 2, -h / 2, h - 10, { shadow: false });
  g.lineJoin = "round";
  g.lineWidth = Math.max(4, fs * 0.28);
  g.strokeStyle = INK;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.font = `900 ${fs}px ${FONT}`;
  const tx = -w / 2 + h + 6;
  g.strokeText(name, tx, -h / 2 + 1);
  g.fillStyle = you ? "#fff6c9" : "#ffffff";
  g.fillText(name, tx, -h / 2 + 1);
  g.restore();
}

/** The wipe between the intro and the card: a band of the colour sweeping across (`u` 0…1; covered at 0.5). */
export function drawWipe(g: CanvasRenderingContext2D, u: number, color: string) {
  if (u <= 0 || u >= 1) return;
  const sk = H * 0.36;
  const cx = -W - sk + (3 * W + 2 * sk) * ez.io3(u);
  const edge = (x: number, w: number, c: string) => {
    g.beginPath();
    g.moveTo(x + sk, 0);
    g.lineTo(x + sk + w, 0);
    g.lineTo(x - sk + w, H);
    g.lineTo(x - sk, H);
    g.closePath();
    g.fillStyle = c;
    g.fill();
  };
  edge(cx - W, 2 * W, tint(color, -0.08));
  // stripes inside it, and its edges: white, then ink
  g.save();
  g.globalAlpha = 0.16;
  for (let x = cx - W + 40; x < cx + W - 60; x += 90) edge(x, 34, "#ffffff");
  g.restore();
  edge(cx + W - 2, 14, "#ffffff");
  edge(cx + W + 12, 6, INK);
  edge(cx - W - 14, 14, "#ffffff");
  edge(cx - W - 20, 6, INK);
}

/** Plates sharing a row slide apart so none covers another (in place; plates' widths are guessed). */
export function spreadPlates(plates: Plate[]) {
  const on = plates.filter((p) => p.on && p.t >= 0).sort((a, b) => a.x - b.x);
  const wOf = (p: Plate) => (p.p.human ? 132 : 112);
  for (let pass = 0; pass < 3; pass++)
    for (let i = 1; i < on.length; i++) {
      const a = on[i - 1],
        b = on[i];
      // (boxes: a plate is ~50 px tall with its pointer)
      if (Math.abs(a.y - b.y) > 54) continue;
      const need = (wOf(a) + wOf(b)) / 2 + 8 - (b.x - a.x);
      if (need > 0) ((a.x -= need / 2), (b.x += need / 2));
    }
  for (const p of on) p.x = clamp(p.x, wOf(p) / 2 + 10, W - wOf(p) / 2 - 10);
}

// ---- the mini-game's intro -----------------------------------------------------------------------

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const tv = V();
const tv2 = V();
const tq = new THREE.Quaternion();

/** An object as the game left it this frame (put back exactly before the game's next step). */
interface Kept {
  pos: V3;
  rot: THREE.Euler;
  scale: V3;
  vis: boolean;
  /** Held this frame. */
  on: boolean;
}
const kept = (): Kept => ({ pos: V(), rot: new THREE.Euler(), scale: V(1, 1, 1), vis: true, on: false });
function keep(o: THREE.Object3D, k: Kept) {
  k.pos.copy(o.position);
  k.rot.copy(o.rotation);
  k.scale.copy(o.scale);
  k.vis = o.visible;
  k.on = true;
}
function giveBack(o: THREE.Object3D, k: Kept) {
  if (!k.on) return;
  o.position.copy(k.pos);
  o.rotation.copy(k.rot);
  o.scale.copy(k.scale);
  o.visible = k.vis;
  k.on = false;
}

/** One of the four in the game's scene. */
interface Member {
  p: Player;
  monkey: THREE.Object3D;
  /** What drops in and turns: the avatar's root (the monkey, its marker, its kart…). */
  obj: THREE.Object3D;
  av: Avatar | null;
  scale: number;
  kept: Kept;
  /** When it drops in (s on the intro's clock; −1: there from the start, no drop). */
  due: number;
  /** In its own close-up: it pops up on the spot (a drop would take the whole shot). */
  pop: boolean;
  landed: boolean;
  /** How far it has turned to the camera (0…1). */
  turn: number;
}

interface Shot {
  e0: V3;
  e1: V3;
  a0: V3;
  a1: V3;
  f0: number;
  f1: number;
  dur: number;
  ease: (u: number) => number;
  eye?: THREE.CatmullRomCurve3;
  look?: THREE.CatmullRomCurve3;
  /** Caption: its chip, its line. */
  chip?: string;
  say?: string;
  /** The players' shot: all together (turned to the camera), one close (`who`), or the arena wide. */
  cast?: "group" | "solo" | "wide";
  who?: number;
  /** The camera's up (a close-up on a planet's side). */
  up?: V3;
}

export interface IntroOpts {
  /** The short one (a rematch, a table of four AIs): one sweep, the title, the four at once. */
  short: boolean;
  /** This round of a match. */
  round?: [number, number];
}

/** The goal in one line: the sentence of the help (or the tag) that says how to win. */
function goalOf(def: MiniDef) {
  if (def.goal) return T(def.goal, def.goalZh ?? def.goal);
  const find = (s: string) => {
    const parts = s
      .split(/(?<=[.!?。！])\s*|[:;·：；]\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    return parts.find((x) => /\bwins?\b|赢|获胜/i.test(x)) ?? null;
  };
  const tag = T(def.tag, def.tagZh);
  // (no word of winning: the tag, up to its first colon, past which it lists the levels)
  const cut = tag.search(/[:：]/);
  const s = find(touchWords(T(def.help, def.helpZh), def)) ?? find(tag) ?? (cut >= 12 ? tag.slice(0, cut) : tag);
  const c = s.replace(/[.!。！]+$/, "");
  return c.charAt(0).toUpperCase() + c.slice(1) + T("!", "！");
}

/**
 * The intro cinematic of one mini-game, before its card (host.ts). Each frame `step(dt, input, idle)`
 * puts the game's camera and snarks back as the game left them, lets the game idle (`idle`: its own
 * idle("card")), then takes them for the shot; true once it is over (everything given back for good).
 */
export class MiniIntro {
  readonly hud = new CineHud();
  /** The intro's clock (s). */
  t = 0;
  total = 1;
  private shots: Shot[] = [];
  private starts: number[] = [];
  private cur = -1;
  private view: View3 | null = null;
  private members: Member[] = [];
  private fx: Fx3 | null = null;
  private cam = { pos: V(), rot: new THREE.Euler(), up: V(0, 1, 0), fov: 50, on: false };
  private built = false;
  private over = false;
  private shake = 0;
  private skipped = false;
  private human: number;
  private slamAt = 0;
  private slamArgs: [string, string, { sub?: string; chip?: string; dock: number }] | null = null;
  /** The wipe out starts this long before the end. */
  static readonly WIPE = 0.3;

  constructor(
    private def: MiniDef,
    private vdef: MiniVariant | null,
    private mini: Mini,
    private players: Player[],
    private o: IntroOpts,
  ) {
    this.human = players.findIndex((p) => p.human);
    this.hud.accent = def.color;
  }

  /** The intro's frame. `idle` steps the game (its own idle("card")). True when over. */
  step(dt: number, input: Input, idle: () => void): boolean {
    if (this.over) return true;
    this.giveBack();
    idle();
    if (!this.built) {
      this.built = true;
      if (!this.build()) return this.finish();
    }
    this.t += dt;
    if (this.slamArgs && this.t >= this.slamAt) {
      this.hud.title(...this.slamArgs);
      this.slamArgs = null;
    }
    this.hud.update(dt);
    // A (Enter, a tap) skips to the wipe
    if (this.human >= 0 && !this.skipped && this.t > 0.3 && this.t < this.total - MiniIntro.WIPE && input.pressed("a")) this.skip();
    if (this.t >= this.total) return this.finish();
    this.take(dt);
    return false;
  }

  /** Over the 3D, while it runs. */
  draw(g: CanvasRenderingContext2D, t: number) {
    this.hud.draw(g, t);
    const w0 = this.total - MiniIntro.WIPE;
    if (this.t > w0) drawWipe(g, ((this.t - w0) / MiniIntro.WIPE) * 0.5, this.def.color);
  }

  /** The wipe's second half, over whatever follows (the card): `pt` s into it. */
  tail(g: CanvasRenderingContext2D, pt: number) {
    if (pt >= MiniIntro.WIPE || !this.built) return;
    drawWipe(g, 0.5 + (pt / MiniIntro.WIPE) * 0.5, this.def.color);
  }

  /** Let go of everything for good (the game was dropped mid-intro). */
  dispose() {
    if (!this.over) this.finish();
  }

  private skip() {
    this.skipped = true;
    this.t = Math.max(this.t, this.total - MiniIntro.WIPE);
    sfx.whoosh();
    // (everyone in at once, standing)
    for (const m of this.members) ((m.due = -1), (m.landed = true));
  }

  private finish() {
    this.over = true;
    this.giveBack();
    if (this.fx && this.view) {
      this.view.scene.remove(this.fx.mesh);
      this.fx.mesh.dispose();
      (this.fx.mesh.material as THREE.Material).dispose();
    }
    this.fx = null;
    return true;
  }

  // ---- the game's things, given back and taken -----------------------------------------------------

  /** Everything as the game left it: the camera, the snarks. */
  private giveBack() {
    if (!this.view) return;
    const c = this.view.camera;
    const k = this.cam;
    if (k.on) {
      k.on = false;
      c.position.copy(k.pos);
      c.rotation.copy(k.rot);
      c.up.copy(k.up);
      if (c.fov !== k.fov) ((c.fov = k.fov), c.updateProjectionMatrix());
    }
    for (const m of this.members) giveBack(m.obj, m.kept);
  }

  /** The shot of this frame on the camera, the snarks' drops and turns on top of the game's. */
  private take(dt: number) {
    const v = this.view!;
    const c = v.camera;
    const k = this.cam;
    k.pos.copy(c.position);
    k.rot.copy(c.rotation);
    k.up.copy(c.up);
    k.fov = c.fov;
    k.on = true;
    // which shot
    let i = this.shots.length - 1;
    while (i > 0 && this.t < this.starts[i]) i--;
    const sh = this.shots[i];
    if (i !== this.cur) this.cut(i, sh);
    const e = sh.ease((this.t - this.starts[i]) / sh.dur);
    if (sh.eye) sh.eye.getPoint(e, c.position);
    else c.position.lerpVectors(sh.e0, sh.e1, e);
    const at = sh.look ? sh.look.getPoint(e, tv2) : tv2.lerpVectors(sh.a0, sh.a1, e);
    if (this.hud.impact) ((this.shake = 1), sting(), sfx.thud());
    this.shake *= Math.exp(-7 * dt);
    if (this.shake > 0.01) {
      const amp = this.shake * 0.014 * c.position.distanceTo(at);
      c.position.x += Math.sin(this.t * 63) * amp;
      c.position.y += Math.sin(this.t * 51 + 1) * amp;
      c.position.z += Math.sin(this.t * 57 + 2) * amp;
    }
    c.up.copy(sh.up ?? UP);
    c.lookAt(at);
    const fov = sh.f0 + (sh.f1 - sh.f0) * e;
    if (Math.abs(c.fov - fov) > 1e-3) ((c.fov = fov), c.updateProjectionMatrix());
    c.updateMatrixWorld();
    this.cast(dt, sh);
    this.fx?.update(dt);
  }

  /** A new shot: a flash, a whoosh, its caption. */
  private cut(i: number, sh: Shot) {
    if (this.cur >= 0 && !this.skipped) ((this.hud.flash = 0.35), sfx.whoosh());
    this.cur = i;
    // (the players' caption stays up through all their shots)
    const castLeft = sh.cast ? this.total - this.starts[i] + 0.4 : 0;
    if (sh.say && !(sh.cast && this.hud.cap?.s === sh.say)) this.hud.caption(sh.chip ?? "", sh.say, this.def.color, sh.cast ? castLeft : sh.dur - 0.05);
  }

  /** The players: hidden till they drop, the drop, the landing (dust, a pose, the plate), the turn to the camera. */
  private cast(dt: number, sh: Shot) {
    const v = this.view!;
    const cam = v.camera;
    const FALL = 0.36;
    this.members.forEach((m, k) => {
      const plate = this.hud.plates[m.p.seat];
      const ft = this.t - m.due;
      keep(m.obj, m.kept);
      if (m.due >= 0 && ft < 0) {
        // not yet: out of sight
        m.obj.visible = false;
        return;
      }
      const fall = m.pop ? 0.1 : FALL;
      if (!m.landed && (m.due < 0 || ft >= fall)) {
        m.landed = true;
        if (m.due >= 0) this.landed(m, k);
      }
      if (m.landed && plate.t < 0) plate.t = 0.34;
      // the drop along its own up, then a squash as it lands (in a close-up: a pop, from nothing to a bounce)
      if (m.pop && m.due >= 0 && ft < 0.36) m.obj.scale.multiplyScalar(Math.max(0.001, ez.back(ft / 0.36)));
      else if (m.due >= 0 && ft < FALL) {
        const dy = 7 * m.scale * (1 - ez.in2(ft / FALL));
        m.obj.getWorldQuaternion(tq);
        const d = tv.copy(UP).applyQuaternion(tq).multiplyScalar(dy);
        // (into its parent's frame: its turn and its scale)
        if (m.obj.parent) {
          m.obj.parent.getWorldQuaternion(tq);
          d.applyQuaternion(tq.invert());
          m.obj.parent.getWorldScale(tv2);
          d.divide(tv2);
        }
        m.obj.position.add(d);
      } else if (m.due >= 0 && ft < FALL + 0.34) {
        const q = (ft - FALL) / 0.34;
        const sq = Math.sin(q * Math.PI) * Math.exp(-q * 2.2) * 0.3;
        m.obj.scale.x *= 1 + sq * 0.6;
        m.obj.scale.y *= 1 - sq;
        m.obj.scale.z *= 1 + sq * 0.6;
      }
      // the group shot: everyone turns to face the camera
      m.turn += ((sh.cast === "group" ? 1 : 0) - m.turn) * Math.min(1, dt * 6);
      if (m.turn > 0.01) {
        m.obj.updateWorldMatrix(true, false);
        const local = m.obj.worldToLocal(tv.copy(cam.position));
        m.obj.quaternion.multiply(tq.setFromAxisAngle(UP, Math.atan2(local.x, local.z) * m.turn));
      }
      // its plate over its head
      m.obj.updateWorldMatrix(true, true);
      m.monkey.getWorldPosition(tv);
      m.obj.getWorldQuaternion(tq);
      tv.add(tv2.set(0, 2.15 * m.scale + 0.25, 0).applyQuaternion(tq));
      const s = toScreen(tv, cam);
      plate.x = s.x;
      plate.y = clamp(s.y - 6, BAR + 56, H - BAR - 8);
      plate.on = s.on && !!sh.cast;
      if (m.p.human && m.landed && s.on && sh.cast) {
        const sp = this.hud.spot;
        sp.x = s.x;
        sp.y = s.y + 44;
        sp.r = clamp(1700 / Math.max(2, cam.position.distanceTo(tv)), 70, 180);
        sp.want = sh.cast === "solo" && sh.who !== k ? 0 : 1;
      }
    });
    if (!sh.cast) this.hud.spot.want = 0;
    spreadPlates(this.hud.plates);
  }

  /** One lands: dust, a little confetti of its colour, a thud, a pose, its plate. */
  private landed(m: Member, k: number) {
    m.monkey.getWorldPosition(tv);
    this.fx?.burst(tv, 16, ["#ffffff", "#e9dcc6", "#ffffff"], { speed: 4.2 * m.scale, up: 2.2 * m.scale, size: 0.16 * m.scale, life: 0.55 });
    this.fx?.burst(tv.addScaledVector(UP, 1.2 * m.scale), 14, [m.p.color, "#ffffff", "#ffd23f"], { speed: 5 * m.scale, up: 5 * m.scale, size: 0.12 * m.scale, life: 0.9 });
    if (!this.skipped) {
      sfx.thud();
      if (m.p.human) sfx.coin();
      else sfx.blip(k + 2);
    }
    // a pose (the avatar the game made: tagged as it synced)
    if (m.av) {
      if (m.p.human || k % 2 === 1) m.av.cheer(1.3);
      else m.av.body.wave(1.3);
    }
    this.hud.plates[m.p.seat].t = 0;
  }

  // ---- the shots -----------------------------------------------------------------------------------

  /** Survey the level and lay out the shots (false: nothing to film, no intro). */
  private build() {
    const v = this.mini.view?.() ?? null;
    if (!v) return false;
    this.view = v;
    v.scene.updateMatrixWorld(true);
    this.members = findCast(v.scene, this.players);
    this.hud.plates = this.players.map((p) => ({ p, x: 0, y: 0, on: false, t: -1 }));
    this.fx = new Fx3(v.scene, 220);
    const cam = v.camera;
    const short = this.o.short;
    // the arena: where the game's card camera looks (the point of its line of sight nearest the players)
    const P = cam.position.clone();
    const f = cam.getWorldDirection(V());
    const C = V();
    for (const m of this.members) C.add(m.monkey.getWorldPosition(tv));
    if (this.members.length) C.multiplyScalar(1 / this.members.length);
    const floorY = C.y;
    const T0 = P.clone().addScaledVector(f, Math.max(4, tv.copy(C).sub(P).dot(f)));
    T0.y = floorY;
    // (looking nowhere near them: the players' middle)
    if (this.members.length && Math.hypot(T0.x - C.x, T0.z - C.z) > 60) T0.copy(C);
    const D = clamp(P.distanceTo(T0), 7, 140);
    const az = Math.atan2(P.x - T0.x, P.z - T0.z);
    const sc = this.members.length ? this.members.reduce((a, m) => a + m.scale, 0) / this.members.length : 1;
    const hz = (a: number, r: number, y: number, from = T0) => V(from.x + Math.sin(a) * r, from.y + y, from.z + Math.cos(a) * r);
    const shots: Shot[] = [];
    const twist = this.vdef?.tag ? T(this.vdef.tag, this.vdef.tagZh ?? this.vdef.tag) : T(this.def.tag, this.def.tagZh);
    const twistChip = this.vdef?.tag ? T("THE TWIST", "机关") : T("THE GAME", "玩法");
    // the game's own shots, or its level's
    const own = this.mini.intro?.() || this.vdef?.shots || null;
    if (own?.length) {
      const list = short ? own.filter((s) => !s.cast).slice(0, 1) : own;
      const scene = list.filter((s) => !s.cast);
      const sum = scene.reduce((a, s) => a + (s.w ?? 1), 0) || 1;
      const len = short ? 1.25 : clamp(1.45 * scene.length, 2.6, 3.6);
      // (the players' shot: the game's own caption or the goal, below; the others: the twist)
      list.forEach((s, k) => shots.push(this.own(s, s.cast ? 0.55 + this.members.length * 0.3 + 0.8 : ((s.w ?? 1) / sum) * len, k > 0 && !s.cast ? twistChip : undefined, k > 0 && !s.cast ? twist : undefined)));
      // (the twist's caption on the second shot only, unless the game wrote its own)
      shots.forEach((s, k) => k > 1 && !own[k]?.say && !s.cast && ((s.say = undefined), (s.chip = undefined)));
    } else {
      // 1. the establishing shot: a crane down and round over the arena
      shots.push({
        e0: hz(az + 0.95, D * 0.65, D * 1.0),
        e1: hz(az + 0.35, D * 1.0, D * 0.46),
        a0: V(T0.x, T0.y - D * 0.05, T0.z),
        a1: V(T0.x, T0.y + D * 0.02, T0.z),
        f0: 50,
        f1: 44,
        dur: short ? 1.25 : 1.6,
        ease: ez.io,
      });
      // 2. the twist: a low pass round the landmark in the arena's middle, or across its floor
      if (!short) {
        // (the arena's size, from where the players stand round its middle)
        let far = 0;
        for (const m of this.members) far = Math.max(far, Math.hypot(m.monkey.getWorldPosition(tv).x - T0.x, tv.z - T0.z));
        const R = clamp(far * 1.5 + 2 * sc, 4, D * 0.8);
        const L = landmark(v.scene, T0, R, floorY, Math.max(2.2 * sc, R * 0.22), D * 0.8);
        if (L) {
          const g0 = V(L.c.x, floorY, L.c.z);
          const off = Math.hypot(T0.x - L.c.x, T0.z - L.c.z);
          const dir = off > R * 0.3 ? Math.atan2(T0.x - L.c.x, T0.z - L.c.z) : az - 1.0;
          const r = clamp(Math.max(L.h * 1.1, R * 0.85), 4, D * 0.9);
          const ey = Math.max(1.5 * sc, r * 0.18);
          shots.push({
            e0: hz(dir - 0.4, r * 1.12, ey * 1.15, g0),
            e1: hz(dir + 0.25, r * 0.9, ey, g0),
            a0: V(L.c.x, floorY + L.h * 0.38, L.c.z),
            a1: V(L.c.x, floorY + L.h * 0.5, L.c.z),
            f0: 52,
            f1: 45,
            dur: 1.35,
            ease: ez.io,
            chip: twistChip,
            say: twist,
          });
        } else
          shots.push({
            e0: hz(az - 1.3, R * 1.2, 1.0 * sc + R * 0.2),
            e1: hz(az - 0.75, R * 1.0, 0.9 * sc + R * 0.15),
            a0: V(T0.x, floorY + 0.6 * sc, T0.z),
            a1: V(T0.x, floorY + 0.9 * sc, T0.z),
            f0: 54,
            f1: 47,
            dur: 1.35,
            ease: ez.io,
            chip: twistChip,
            say: twist,
          });
      }
    }
    // 3. the players, unless a shot of the game's own has them
    const goal = T("THE GOAL", "目标");
    const gl = goalOf(this.def);
    const ownCast = shots.findIndex((s) => s.cast);
    if (ownCast >= 0) ((shots[ownCast].chip ??= goal), (shots[ownCast].say ??= gl));
    else if (this.members.length) shots.push(...this.castShots(short, az, T0, sc, goal, gl, shots[shots.length - 1]));
    let at = 0;
    for (const s of shots) ((s.dur = Math.max(0.3, s.dur)), this.starts.push(at), (at += s.dur));
    this.shots = shots;
    this.total = at + (shots[shots.length - 1].cast ? 0.15 : 0);
    // when each one drops: in turn in the players' shot, or as its own close-up starts
    const ci = shots.findIndex((s) => s.cast);
    const gap = short ? 0.11 : 0.3;
    this.members.forEach((m, k) => {
      const solo = shots.findIndex((s) => s.cast === "solo" && s.who === k);
      m.pop = solo >= 0;
      m.due = solo >= 0 ? this.starts[solo] + 0.04 : ci >= 0 ? this.starts[ci] + (short ? 0.12 : 0.18) + k * gap : -1;
    });
    // the bars, the hint; the title a beat in, docked in the top bar as the next shot cuts in
    this.hud.bars = true;
    sfx.whoosh();
    if (this.human >= 0) this.hud.hint = { btn: "a", s: T("SKIP", "跳过") };
    const vs = this.def.variants ?? [];
    const li = this.vdef ? vs.indexOf(this.vdef) : -1;
    const chip = this.o.round ? T(`ROUND ${this.o.round[0]}/${this.o.round[1]}`, `第 ${this.o.round[0]}/${this.o.round[1]} 局`) : li >= 0 ? T(`LEVEL ${li + 1}`, `第 ${li + 1} 关`) : undefined;
    this.slamAt = short ? 0.02 : 0.22;
    const dock = (short ? 0.95 : (this.starts[1] ?? 1.6)) - this.slamAt;
    this.slamArgs = [T(this.def.title, this.def.titleZh), this.def.color, { sub: this.vdef ? T(this.vdef.title, this.vdef.titleZh) : undefined, chip, dock }];
    return true;
  }

  /** A shot the game handed over. */
  private own(s: IntroShot, dur: number, chip?: string, say?: string): Shot {
    const v3 = (a: [number, number, number]) => V(a[0], a[1], a[2]);
    const sh: Shot = {
      e0: v3(s.eye),
      e1: v3(s.eye2 ?? s.eye),
      a0: v3(s.at),
      a1: v3(s.at2 ?? s.at),
      f0: s.fov ?? 48,
      f1: s.fov2 ?? s.fov ?? 44,
      dur,
      ease: s.via ? ez.io3 : ez.io,
      chip: s.chip ? T(s.chip, s.chipZh ?? s.chip) : s.say ? (chip ?? (s.cast ? T("THE GOAL", "目标") : T("THE STAGE", "场地"))) : chip,
      say: s.say ? T(s.say, s.sayZh ?? s.say) : say,
      cast: s.cast ? "group" : undefined,
    };
    if (s.via?.length) sh.eye = new THREE.CatmullRomCurve3([sh.e0, ...s.via.map(v3), sh.e1], false, "centripetal");
    if (s.atVia?.length) sh.look = new THREE.CatmullRomCurve3([sh.a0, ...s.atVia.map(v3), sh.a1], false, "centripetal");
    return sh;
  }

  /** The players' shot(s): together if they stand close, else each one close, then all of them wide. */
  private castShots(short: boolean, az: number, T0: V3, sc: number, chip: string, say: string, last: Shot): Shot[] {
    const ms = this.members;
    const pos = ms.map((m) => m.monkey.getWorldPosition(V()));
    const Pc = pos.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / pos.length);
    // (seen from the card camera's side, a little round)
    const ang = az + 0.18;
    const fwd = V(Math.sin(ang), 0, Math.cos(ang));
    const right = V(Math.cos(ang), 0, -Math.sin(ang));
    let hw = 0,
      dd = 0,
      dy = 0;
    for (const p of pos) {
      tv.copy(p).sub(Pc);
      hw = Math.max(hw, Math.abs(tv.dot(right)));
      dd = Math.max(dd, Math.abs(tv.dot(fwd)));
      dy = Math.max(dy, Math.abs(tv.y));
    }
    const fov = 40;
    const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (W / H);
    const together = hw < 7.5 * sc && dd < 6 * sc && dy < 2.5 * sc;
    const wide = (dur: number): Shot => ({ e0: last.e1.clone(), e1: last.e1.clone().lerp(T0, 0.08), a0: last.a1.clone(), a1: last.a1.clone(), f0: last.f1 + 1, f1: last.f1 - 1, dur, ease: ez.out3, cast: "wide", chip, say });
    if (!together && short) return [wide(1.15)];
    if (together) {
      const dist = Math.max(3.4 * sc, (hw + 1.1 * sc) / (tanH * 0.64)) + dd;
      const at = V(Pc.x, Pc.y + 0.95 * sc, Pc.z);
      return [
        {
          e0: V(Pc.x + Math.sin(ang + 0.14) * dist * 1.14, Pc.y + 1.3 * sc + dist * 0.36, Pc.z + Math.cos(ang + 0.14) * dist * 1.14),
          e1: V(Pc.x + Math.sin(ang) * dist, Pc.y + 1.05 * sc + dist * 0.3, Pc.z + Math.cos(ang) * dist),
          a0: at.clone().setY(at.y + 0.2 * sc),
          a1: at,
          f0: fov + 2,
          f1: fov,
          dur: short ? 1.2 : 0.55 + ms.length * 0.3 + 0.75,
          ease: ez.out3,
          cast: "group",
          chip,
          say,
        },
      ];
    }
    // far apart: each one in its own close-up (from its front), then the arena wide with every plate
    const out: Shot[] = ms.map((m, k) => {
      const p = pos[k];
      m.obj.getWorldQuaternion(tq);
      const up = V(0, 1, 0).applyQuaternion(tq);
      m.monkey.getWorldQuaternion(tq);
      const front = V(0, 0, 1).applyQuaternion(tq);
      front.addScaledVector(up, -front.dot(up));
      if (front.lengthSq() < 0.05) front.set(Math.sin(az), 0, Math.cos(az));
      front.normalize();
      const side = V().crossVectors(up, front).normalize();
      const s = m.scale;
      const sd = k % 2 ? 1 : -1;
      const at = p.clone().addScaledVector(up, 1.0 * s);
      const e = p.clone().addScaledVector(front, 3.6 * s).addScaledVector(up, 1.5 * s).addScaledVector(side, sd * 1.1 * s);
      return {
        e0: e.clone().addScaledVector(front, 0.7 * s).addScaledVector(side, sd * 0.4 * s),
        e1: e,
        a0: at.clone(),
        a1: at.clone().addScaledVector(up, 0.12 * s),
        f0: 42,
        f1: 38,
        dur: 0.62,
        ease: ez.out3,
        cast: "solo" as const,
        who: k,
        up,
        chip,
        say,
      };
    });
    out.push(wide(0.85));
    return out;
  }
}

/** The players' snarks in a scene: the avatars (tagged as they synced), or the snarks in order. */
function findCast(scene: THREE.Scene, players: Player[]): Member[] {
  const found: THREE.Object3D[] = [];
  scene.traverse((o) => void (o.name === "snark" && found.push(o)));
  const out: Member[] = [];
  const used = new Set<THREE.Object3D>();
  const member = (p: Player, monkey: THREE.Object3D): Member => {
    const root = monkey.parent && monkey.parent !== scene && monkey.parent.userData.av ? monkey.parent : monkey;
    const av = (root.userData.av as Avatar | undefined) ?? null;
    monkey.updateWorldMatrix(true, false);
    const e = monkey.matrixWorld.elements;
    return { p, monkey, obj: root, av, scale: Math.hypot(e[0], e[1], e[2]) || 1, kept: kept(), due: -1, pop: false, landed: false, turn: 0 };
  };
  // by the avatars' own players first
  for (const p of players) {
    const m = found.find((o) => !used.has(o) && (o.parent?.userData.av as Avatar | undefined)?.player === p);
    if (m) (used.add(m), out.push(member(p, m)));
  }
  // then the untagged ones, in the order the game made them
  if (out.length < players.length) {
    const rest = found.filter((o) => !used.has(o));
    for (const p of players) {
      if (out.some((m) => m.p === p) || !rest.length) continue;
      out.push(member(p, rest.shift()!));
    }
  }
  return players.map((p) => out.find((m) => m.p === p)).filter((m): m is Member => !!m);
}

/** The level's landmark: the tallest thing standing in the arena (within R of its middle, lo…hi m tall; null: none stands out). */
function landmark(scene: THREE.Scene, T0: V3, R: number, floorY: number, lo: number, hi: number): { c: V3; h: number; w: number } | null {
  const box = new THREE.Box3();
  const c = V();
  const sz = V();
  let best: { c: V3; h: number; w: number } | null = null;
  let bestS = 0;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o.name === "snark") return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        if (im.count > 0) {
          if (!im.boundingBox) im.computeBoundingBox();
          box.copy(im.boundingBox!).applyMatrix4(im.matrixWorld);
        } else box.makeEmpty();
      } else {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      }
      if (!box.isEmpty()) {
        box.getCenter(c);
        box.getSize(sz);
        const hd = Math.hypot(c.x - T0.x, c.z - T0.z);
        const top = box.max.y - floorY;
        const w = Math.max(sz.x, sz.z);
        if (hd < R && box.min.y < floorY + 2.5 && box.min.y > floorY - 30 && top > lo && top < hi && w < R * 1.2) {
          const s = top + Math.min(sz.x, sz.z) * 0.4 - hd * 0.5;
          if (s > bestS) ((bestS = s), (best = { c: c.clone(), h: top, w }));
        }
      }
    }
    for (const k of o.children) walk(k);
  };
  walk(scene);
  return best;
}
