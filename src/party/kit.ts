/**
 * ZK PARTY's common kit: the four players, the input (keyboard and the touch pad), the little
 * synth that makes every bleep, and the canvas helpers every mini-game draws with.
 *
 * A mini-game is a `MiniDef`: its card (name, rules, controls) and `make()`, which returns a `Mini`
 * the host (host.ts) steps and draws on a 960×540 logical canvas until `result()` gives the final
 * order. The host owns the title card, the 3-2-1 countdown, the finish banner and the podium.
 */
import { party } from "../audio/engine";
import { playSfx } from "../audio/sfx";
import { personImage, personName } from "./people";
import { portraitImage } from "../data/portrait";
import { T } from "../i18n/lang";
import { Det } from "./net/det";

export const W = 960;
export const H = 540;

/**
 * What the screen really shows. A game lays its HUD out in the 960×540 frame, and that frame is always
 * whole on the screen, centred; a screen of another shape (a phone on its side is 19.5:9, a tablet
 * 4:3) shows more of the 3D world round it instead of dark bands: `w`×`h` is the whole view in the
 * frame's units (never less than W×H), `mx`, `my` the margins on each side ((w − W) / 2, (h − H) / 2).
 * The stage sets it (host.ts fit()); a full-frame fill on its canvas reaches the screen's edges on its
 * own. Anchor to the true edges with −VIEW.mx … W + VIEW.mx.
 */
export const VIEW = { w: W, h: H, mx: 0, my: 0 };

/** The four seats' colours: you are always the flare. */
export const SEAT = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2"] as const;
export const SEAT_DARK = ["#9c3311", "#155f86", "#3f7a1c", "#8f2257"] as const;

export interface Player {
  /** Seat 0..3 (0 is you, offline). */
  seat: number;
  id: number;
  name: string;
  color: string;
  dark: string;
  /**
   * A person plays this seat, here or online: it reads its input instead of the AI's brain, and any
   * rule about people (the AI going easy on them) applies. The same on every client of an online game,
   * so the sim may read it.
   */
  human: boolean;
  /**
   * This device's player (none: the same as `human`): the camera follows it, it is "YOU" on the
   * labels and the HUD, its sounds play. It differs from one client to the next, so the sim must
   * never read it (see src/party/net/lockstep.ts).
   */
  local?: boolean;
  /** Online: this seat's own input (a NetInput, the same on every client). None: the device's. */
  input?: Input;
  /** AI only: 0 (a tourist) .. 1 (a pro). */
  skill: number;
  img: HTMLImageElement;
}

/** This device's player: the camera, "YOU", the HUD and the sounds go by it, never the rules. */
export const isLocal = (p: Player) => p.local ?? p.human;

/** The input a person's seat plays with: its own online, else the device's (`input`, the game's argument). */
export const inputOf = (p: Player, input: Input) => p.input ?? input;

export function makePlayer(seat: number, id: number, human: boolean, skill: number, name?: string): Player {
  const img = new Image();
  img.crossOrigin = "anonymous";
  // (through the city's portrait queue: a few at a time, retried, so the API's rate limit never
  // leaves a seat without its face; the picture is then in the browser's cache)
  const src = personImage(id);
  void portraitImage(src).then(
    (im) => (img.src = im.src),
    () => (img.src = src),
  );
  return { seat, id, name: name ?? personName(id), color: SEAT[seat], dark: SEAT_DARK[seat], human, skill, img };
}

/** A deterministic little random (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rnd = () => number;

// ---- input ---------------------------------------------------------------------------------------

export type Btn = "left" | "right" | "up" | "down" | "a" | "b";
const KEYMAP: Record<string, Btn> = {
  ArrowLeft: "left",
  KeyA: "left",
  KeyQ: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  KeyZ: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "a",
  Enter: "a",
  NumpadEnter: "a",
  KeyX: "b",
  KeyE: "b",
  ShiftLeft: "b",
  ShiftRight: "b",
};

/** What the human holds and what was just pressed (pressed() is true for one frame). */
export class Input {
  private down = new Set<Btn>();
  private hits = new Set<Btn>();
  private hitsNext = new Set<Btn>();
  /** The touch stick's tilt (each axis -1..1, length ≤ 1) while a thumb is on it: axis() reads it. */
  private stick: { x: number; y: number } | null = null;
  /** The arrows the stick holds down (for the games and menus that read held() or pressed()). */
  private stickDirs = new Set<Btn>();
  /** A press anywhere on the canvas counts as "a" (mash, draw, roll). */
  tapIsA = true;
  /** Off while nothing is played: the keys then belong to the city. */
  enabled = false;
  private off: (() => void)[] = [];

  attach(surface: HTMLElement) {
    const kd = (e: KeyboardEvent) => {
      const b = KEYMAP[e.code];
      if (!b || !this.enabled || (e.target as HTMLElement).closest?.("input,textarea")) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.press(b);
    };
    const ku = (e: KeyboardEvent) => {
      const b = KEYMAP[e.code];
      if (b) this.release(b);
    };
    const pd = (e: PointerEvent) => {
      if (!this.enabled || !this.tapIsA || (e.target as HTMLElement).closest("button,[data-pad]")) return;
      this.press("a");
      setTimeout(() => this.release("a"), 60);
    };
    window.addEventListener("keydown", kd, true);
    window.addEventListener("keyup", ku, true);
    surface.addEventListener("pointerdown", pd);
    const blur = () => (this.down.clear(), this.stickDirs.clear(), (this.stick = null));
    window.addEventListener("blur", blur);
    this.off.push(
      () => window.removeEventListener("keydown", kd, true),
      () => window.removeEventListener("keyup", ku, true),
      () => surface.removeEventListener("pointerdown", pd),
      () => window.removeEventListener("blur", blur),
    );
  }
  detach() {
    for (const f of this.off) f();
    this.off = [];
    this.down.clear();
  }
  press(b: Btn) {
    this.down.add(b);
    this.hitsNext.add(b);
  }
  release(b: Btn) {
    this.down.delete(b);
  }
  held(b: Btn) {
    return this.down.has(b);
  }
  pressed(b: Btn) {
    return this.hits.has(b);
  }
  /**
   * The touch stick (host.ts): its tilt, or null when the thumb is off. It also holds the arrow it
   * leans towards (past half-way, let go under a third), so held() and pressed() follow it.
   */
  setStick(v: { x: number; y: number } | null) {
    this.stick = v;
    const lean = (b: Btn, k: number) => {
      const on = this.stickDirs.has(b);
      if (!on && k > 0.5) (this.stickDirs.add(b), this.press(b));
      else if (on && k < 0.33) (this.stickDirs.delete(b), this.release(b));
    };
    const x = v?.x ?? 0,
      y = v?.y ?? 0;
    lean("right", x);
    lean("left", -x);
    lean("down", y);
    lean("up", -y);
  }
  /** -1..1 on each axis: the touch stick's tilt, else the held arrows. */
  axis() {
    if (this.stick) return { x: this.stick.x, y: this.stick.y };
    return { x: (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0), y: (this.held("down") ? 1 : 0) - (this.held("up") ? 1 : 0) };
  }
  /** Called by the host once per frame, before the game's update. */
  tick() {
    this.hits = this.hitsNext;
    this.hitsNext = new Set();
  }
  /** The host played a step of this frame: what was just pressed has been seen (the steps that follow see it held). */
  spent() {
    if (this.hits.size) this.hits = new Set();
  }
  clear() {
    this.stick = null;
    this.stickDirs.clear();
    this.down.clear();
    this.hits.clear();
    this.hitsNext.clear();
  }
}

// ---- sound ---------------------------------------------------------------------------------------

/**
 * The party's audio context and its bus (null when the sound is off): for a game's own sounds (an
 * engine). The bus feeds the party's mixer (src/audio/engine.ts): glue, limiter, the room's reverb.
 */
export function sound(): { ac: AudioContext; bus: GainNode } | null {
  // (a sim nobody watches, a test's second client, is silent)
  if (Det.quiet) return null;
  const m = party();
  return m ? { ac: m.ac as AudioContext, bus: m.bus } : null;
}

/** blip(k), step(k): the old bleeps' pitch steps, kept (k may be fractional or negative). */
const blipRate = (k: number) => Math.max(0.5, Math.min(2.5, (520 + k * 60) / 520));
const stepRate = (k: number) => (392 + (((Math.floor(k) % 4) + 4) % 4) * 49) / 392;

/**
 * A sound from inside a lockstep tick plays on the native Math.random (each one is a little different,
 * and that must not move the sim's own stream); a sim nobody watches plays none.
 */
const play = (...a: Parameters<typeof playSfx>) => {
  if (!Det.active) return playSfx(...a);
  if (!Det.quiet) Det.free(() => playSfx(...a));
};

/**
 * Every sound of the party, synthesised (src/audio/sfx.ts): layered, a little different on every
 * play. The new ones take a level (1 by default): a far crowd, a distant storm.
 */
export const sfx = {
  tick: () => play("tick"),
  blip: (k = 0) => play("blip", { rate: blipRate(k) }),
  count: () => play("count"),
  go: () => play("go"),
  coin: () => play("coin"),
  lose: () => play("lose"),
  hit: () => play("hit"),
  thud: () => play("thud"),
  whoosh: () => play("whoosh"),
  step: (k = 0) => play("step", { rate: stepRate(k) }),
  roll: () => play("roll"),
  fanfare: () => play("fanfare"),
  sad: () => play("sad"),
  star: () => play("star"),
  chips: () => play("chips"),
  /** A crowd's cheer (a goal, a win, a big play). */
  cheer: (k = 1) => play("cheer", { gain: k }),
  /** A crowd's "awww" (a near miss, a fall). */
  aww: (k = 1) => play("aww", { gain: k }),
  /** Into the water. */
  splash: (k = 1) => play("splash", { gain: k }),
  /** Ice cracking (the "pew" of a frozen sheet). */
  crack: (k = 1) => play("crack", { gain: k }),
  /** A gust of wind. */
  gust: (k = 1) => play("gust", { gain: k }),
  /** Thunder: a crack and a long roll (lower k: further away). */
  thunder: (k = 1) => play("thunder", { gain: k, send: 1 + (1 - Math.min(1, k)) }),
  /** The metro's three-tone chime. */
  chime: (k = 1) => play("chime", { gain: k }),
  /** A cash register: ka-ching (a purchase). */
  register: (k = 1) => play("register", { gain: k }),
  /** Dice thrown: a landing and a tumble. */
  dice: (k = 1) => play("dice", { gain: k }),
};

// ---- drawing -------------------------------------------------------------------------------------

export const FONT = "Geist, Roboto, ui-sans-serif, system-ui, sans-serif";
export const MONO = '"Geist Mono", "JetBrains Mono", ui-monospace, monospace';

export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/**
 * The HUD on a small touch screen. Everything is drawn on the 960×540 canvas whatever its size; on a
 * phone that is 0.7 of a CSS pixel a unit, so 11-unit small print reads 8 px. The stage sets these
 * from its size on a touch screen only (a computer keeps 0 and 1, so its HUD never changes):
 * - `min`: the smallest letters, in units, that still read 12 px. The stage's canvas never sets a
 *   font smaller (floorFonts()), so what a game measures is what it draws; a lone glyph drawn with
 *   text() or shout() keeps its size (it is part of an icon), and so do toy letters bouncing in;
 * - `k`: how much the shared panels grow (the clock, the name tags, the rules card's parts);
 * - `z`: the zoom a helper is drawing under (zoom()), so its letters are not grown twice;
 * - `thumbs`: the pad is on the screen, so the bottom corners are under the thumbs;
 * - `raw`: the next font set keeps its size (an icon's letter);
 * - `free`: the canvas's span (x, in its units) between the thumbs along its bottom;
 * - `top`: the canvas's y (its units) above which no pad button is;
 * - `tr`: the width (its units) to keep clear at the frame's top right corner, where the hall's pause
 *   button sits over it (0 when the button is out in the margin, as on a long phone, or not there).
 */
export const HUD = { min: 0, k: 1, z: 1, thumbs: false, raw: false, free: [0, W] as [number, number], top: H, tr: 0 };

/** A strip's middle at y, moved up above the pad on a touch screen when it would run under the thumbs (`h`: its height), 10 px clear of it. */
export const overPad = (y: number, h: number) => (HUD.thumbs ? Math.min(y, HUD.top - padAir() - h / 2) : y);

/** A box `w`×`h` centred on (x, y): on a touch screen, moved up over the pad when it would sit in a thumb's corner (its new y). */
export const offThumbs = (x: number, y: number, w: number, h: number) =>
  HUD.thumbs && (x - w / 2 < HUD.free[0] || x + w / 2 > HUD.free[1]) ? Math.min(y, HUD.top - padAir() - h / 2) : y;

/** The air kept round the pad on a touch screen, in canvas units (10 px on the screen). */
export const padAir = () => (HUD.min ? (HUD.min * 10) / 12 : 8);

/** A row `w` wide centred on x, moved to stay in the room between the thumbs on a touch screen. */
export const between = (x: number, w: number) => (HUD.thumbs ? Math.max(HUD.free[0] + padAir() + w / 2, Math.min(HUD.free[1] - padAir() - w / 2, x)) : x);

const floored = new WeakSet<CanvasRenderingContext2D>();

/**
 * The stage's 2D context on a touch screen: every font set on it is floored at HUD.min (in the
 * current zoom). The textures a game paints have contexts of their own and keep their sizes.
 */
export function floorFonts(g: CanvasRenderingContext2D) {
  const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font");
  if (!d?.get || !d.set) return;
  floored.add(g);
  const { get, set } = d;
  Object.defineProperty(g, "font", {
    configurable: true,
    get() {
      return get.call(g);
    },
    set(v: string) {
      if (HUD.min && !HUD.raw) {
        const m = /(\d+(?:\.\d+)?)px/.exec(v);
        if (m) {
          const n = Number(m[1]);
          const f = fpx(n);
          if (f !== n) v = v.replace(m[0], `${f.toFixed(2)}px`);
        }
      }
      set.call(g, v);
    },
  });
}

/** A letter size as drawn: never under HUD.min (in the current zoom). */
export const fpx = (size: number) => (size * HUD.z < HUD.min ? HUD.min / HUD.z : size);
/** `size`, or more on a small touch screen, so it reads `px` CSS pixels there (body text: 14). */
export const readAt = (px: number, size: number) => (HUD.min ? Math.max(size, (px * HUD.min) / 12 / HUD.z) : size);

/** Draw `f` grown by `k` about (x, y) (a panel by its corner, a card by its centre); the letters in it know. */
export function zoom<R>(g: CanvasRenderingContext2D, x: number, y: number, k: number, f: () => R): R {
  if (k === 1) return f();
  const z = HUD.z;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.translate(-x, -y);
  HUD.z = z * k;
  try {
    return f();
  } finally {
    HUD.z = z;
    g.restore();
  }
}

/**
 * A HUD piece laid out round letters of `size` (a strip of hints, a key): on a small screen the whole
 * piece grows about (x, y) until those letters read 12 px, so nothing in it runs into its neighbour.
 */
export const grow = <R>(g: CanvasRenderingContext2D, x: number, y: number, size: number, f: () => R): R => zoom(g, x, y, fpx(size) / size, f);

/** A box drawn under zoom(x, y, k), as it lands on the canvas (for the pointer). */
export const zoomBox = <B extends { x: number; y: number; w: number; h: number }>(b: B, x: number, y: number, k: number): B =>
  k === 1 ? b : { ...b, x: x + (b.x - x) * k, y: y + (b.y - y) * k, w: b.w * k, h: b.h * k };

/** Words, not a lone glyph (an icon's letter keeps its size). */
const words = (s: string) => s.length > 1 && Array.from(s).length > 1;

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = "#fff", align: CanvasTextAlign = "center", weight = 800, font = FONT) {
  HUD.raw = !words(s);
  g.font = `${weight} ${size}px ${font}`;
  HUD.raw = false;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** Big game text: a dark outline under it, readable over anything. */
export function shout(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = "#fff", stroke = "rgba(10,8,24,0.85)") {
  // (the outline follows the letters as drawn, grown or not)
  if (floored.has(g) && words(s)) size = fpx(size);
  HUD.raw = !words(s);
  g.font = `900 ${size}px ${FONT}`;
  HUD.raw = false;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = Math.max(4, size * 0.16);
  g.strokeStyle = stroke;
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** A player's round token: portrait in a ring of their colour, a soft shadow under it. */
export function token(g: CanvasRenderingContext2D, p: Player, x: number, y: number, r: number, opts: { shadow?: boolean; dim?: boolean; ring?: number } = {}) {
  if (opts.shadow !== false) {
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.beginPath();
    g.ellipse(x, y + r * 1.05, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.globalAlpha = opts.dim ? 0.45 : 1;
  g.fillStyle = p.dark;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(x, y, r - (opts.ring ?? Math.max(2, r * 0.14)), 0, Math.PI * 2);
  g.clip();
  if (p.img.complete && p.img.naturalWidth) {
    g.imageSmoothingEnabled = false;
    g.drawImage(p.img, x - r, y - r, r * 2, r * 2);
  } else {
    g.fillStyle = p.color;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    text(g, p.name.slice(0, 1).toUpperCase(), x, y + 1, r, "#fff");
  }
  g.restore();
  g.save();
  g.globalAlpha = opts.dim ? 0.45 : 1;
  g.strokeStyle = p.color;
  g.lineWidth = opts.ring ?? Math.max(2, r * 0.14);
  g.beginPath();
  g.arc(x, y, r - g.lineWidth / 2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** The party's backdrop: a deep violet night with a soft glow and slow drifting dots. */
export function backdrop(g: CanvasRenderingContext2D, t: number, top = "#1b1540", bottom = "#0c0a1c", glow = "rgba(255,107,53,0.10)") {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, W * 0.6);
  rg.addColorStop(0, glow);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 40; i++) {
    const x = ((i * 137.5 + t * (6 + (i % 5) * 3)) % (W + 40)) - 20;
    const y = (i * 71.3) % H;
    g.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
  }
}

/** An isometric voxel block: `x, y` is the top face's centre, `s` its half width, `h` its height. */
export function cube(g: CanvasRenderingContext2D, x: number, y: number, s: number, h: number, top: string, left: string, right: string) {
  const q = s * 0.5;
  g.beginPath();
  g.moveTo(x, y - q);
  g.lineTo(x + s, y);
  g.lineTo(x, y + q);
  g.lineTo(x - s, y);
  g.closePath();
  g.fillStyle = top;
  g.fill();
  g.beginPath();
  g.moveTo(x - s, y);
  g.lineTo(x, y + q);
  g.lineTo(x, y + q + h);
  g.lineTo(x - s, y + h);
  g.closePath();
  g.fillStyle = left;
  g.fill();
  g.beginPath();
  g.moveTo(x + s, y);
  g.lineTo(x, y + q);
  g.lineTo(x, y + q + h);
  g.lineTo(x + s, y + h);
  g.closePath();
  g.fillStyle = right;
  g.fill();
}

/** Shade a #rrggbb colour: k < 0 darker, k > 0 lighter. */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    gg = (n >> 8) & 255,
    b = n & 255;
  if (k < 0) {
    r *= 1 + k;
    gg *= 1 + k;
    b *= 1 + k;
  } else {
    r += (255 - r) * k;
    gg += (255 - gg) * k;
    b += (255 - b) * k;
  }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const backOut = (t: number) => {
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Particles: bursts of confetti, coins, sparks. */
export class Bits {
  private p: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number; g: number }[] = [];
  burst(x: number, y: number, n: number, colors: readonly string[], speed = 260, gravity = 520, size = 5) {
    // (inside a lockstep tick: confetti is this screen's own, on the native Math.random)
    if (Det.active) return Det.free(() => this.spray(x, y, n, colors, speed, gravity, size));
    this.spray(x, y, n, colors, speed, gravity, size);
  }
  private spray(x: number, y: number, n: number, colors: readonly string[], speed: number, gravity: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0, max: 0.6 + Math.random() * 0.7, c: colors[i % colors.length], s: size * (0.6 + Math.random() * 0.8), g: gravity });
    }
  }
  update(dt: number) {
    for (const q of this.p) {
      q.life += dt;
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    this.p = this.p.filter((q) => q.life < q.max);
  }
  draw(g: CanvasRenderingContext2D) {
    for (const q of this.p) {
      g.globalAlpha = Math.max(0, 1 - q.life / q.max);
      g.fillStyle = q.c;
      g.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    g.globalAlpha = 1;
  }
}

// ---- the mini-game contract ----------------------------------------------------------------------

export interface Mini {
  update(dt: number, input: Input): void;
  /** A 2D game draws itself; a 3D one (view()) draws its HUD here, over the 3D (the canvas is clear). */
  draw(g: CanvasRenderingContext2D, t: number): void;
  /** The final order once the game is over (seats, winner first; all four); null while playing. */
  result(): number[] | null;
  /** A 3D game: the scene and camera the stage draws under the HUD this frame (k3.ts). */
  view?(): View3 | null;
  /**
   * A 3D game before its start, while the card and the 3-2-1 are up: the players idle, the camera
   * flies over the arena (`k` 0…1 through the phase; the countdown ends on the camera of the start).
   */
  idle?(dt: number, phase: "card" | "count", k: number, input?: Input): void;
  /** Let go of what it holds on the GPU (the host calls it once the game is over). */
  dispose?(): void;
  /** The visitor is out and only rivals play on: the host runs the game three times as fast (offline only). */
  humanOut?(): boolean;
  /**
   * Online: a checksum of the sim's state (positions, velocities, scores; src/party/net/hash.ts). The
   * clients compare it every half second to catch a desync. Only what the sim reads goes in.
   */
  hash?(): number;
  /**
   * Its own shots for the intro cinematic before the rules card (cine.ts), in world metres, once the
   * level is built; none (or null): the host makes them from the arena and the players.
   */
  intro?(): IntroShot[] | null;
}

/**
 * One camera move of a mini-game's intro cinematic (cine.ts): from `eye`/`at` to `eye2`/`at2`, eased,
 * in world metres. The host cuts from one to the next; its length is shared out by `w`.
 */
export interface IntroShot {
  eye: [number, number, number];
  at: [number, number, number];
  /** Where it ends (default: where it starts, a held frame). */
  eye2?: [number, number, number];
  at2?: [number, number, number];
  /** Points the eye (and the target) pass on the way: a fly-over along a track. */
  via?: [number, number, number][];
  atVia?: [number, number, number][];
  /** Its length against the other shots (default 1). */
  w?: number;
  /** The lens (degrees) at the start and at the end (default 48 → 44). */
  fov?: number;
  fov2?: number;
  /** Its caption (default: by its place: the twist, the goal), and the chip before it (default: THE STAGE). */
  say?: string;
  sayZh?: string;
  chip?: string;
  chipZh?: string;
  /** The four drop in during this one (default: a last shot of them, made by the host). */
  cast?: boolean;
}

export interface View3 {
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
}

/** One version of a game (a kart track): its key, its name, its own thumbnail (public/party/thumbs/<thumb>.jpg). */
export interface MiniVariant {
  key: string;
  title: string;
  titleZh: string;
  /** One line about it. */
  tag?: string;
  tagZh?: string;
  /** Its thumbnail's key under public/party/thumbs/ (default: `<game>-<variant>`). */
  thumb?: string;
  /** Its own music (instead of the game's). */
  song?: import("./music").SongKey;
  /** Its own ambience bed (instead of the game's): src/audio/kinds.ts. */
  ambience?: import("../audio/kinds").AmbienceKind;
  /** Hand-made shots for its intro cinematic (when the game's `intro()` gives none): see IntroShot. */
  shots?: IntroShot[];
}

/**
 * The version the visitor picked in the mini-game hall, by game key (none: drawn by the seed). A match
 * started from the hall plays it (host.ts playMatch); the board and the tournaments draw their own.
 */
export const variantPick = new Map<string, string>();

export interface MiniDef {
  key: string;
  title: string;
  titleZh: string;
  /** One line under the title. */
  tag: string;
  tagZh: string;
  /** How to win, in one line (the intro cinematic's last caption; default: drawn from `help`, else `tag`). */
  goal?: string;
  goalZh?: string;
  /** How to play, two short lines. */
  help: string;
  helpZh: string;
  /** The controls shown on the card and on the touch pad. */
  pad: Btn[];
  /** A press on the canvas is "a" (mash, draw); false when the pad's arrows are the whole game. */
  tap: boolean;
  /**
   * On a touch screen the arrows are an analog stick (default: when the game has all four arrows).
   * False keeps four buttons: a rhythm game, where each arrow is its own hit. "x": a stick that only
   * steers left and right (a kart: a thumb a little low must not brake).
   */
  stick?: boolean | "x";
  /** The card's accent. */
  color: string;
  /** Its music (music.ts), started at GO, stopped at the finish. */
  song?: import("./music").SongKey;
  /** Its ambience bed (src/audio/ambience.ts), under the card, the game and the finish; a variant's own wins. */
  ambience?: import("../audio/kinds").AmbienceKind;
  /** Versions of the game (kart tracks): the hall lets you pick one, or "Random". */
  variants?: MiniVariant[];
  /** A 2-vs-2 game: result() is the winning pair, then the losing pair (see `paidPlace`). */
  teams?: boolean;
  /** `variant`: one of `variants`' keys (none: the game draws one with `rnd`). */
  make(players: Player[], rnd: Rnd, variant?: string): Mini;
  /** Its code, fetched before the first make() (the host awaits it): a game loaded on demand (gp/). */
  load?(): Promise<unknown>;
  /** Played by two (a duel: the hall seats you and one rival); none: by all four. */
  seats?: number;
  /** Its shelf in the hall (gp/text.ts Genre). */
  genre?: string;
  /** false: never in an online room (its AIs are not deterministic). */
  net?: false;
  /** A GAMEPARTY game (gp/): how its players line up there. */
  gp?: "ffa" | "2v2" | "1v3" | "duel";
}

/** Its arrows are a stick on a touch screen (MiniDef.stick; by default, a game with all four arrows). */
export const stickOf = (def: Pick<MiniDef, "pad" | "stick">) => def.stick ?? (["left", "right", "up", "down"] as const).every((b) => def.pad.includes(b));

/** The place a round pays as: in a team game both winners are paid as 1st and both losers as 4th. */
export const paidPlace = (def: { teams?: boolean }, place: number) => (def.teams ? (place < 2 ? 0 : 3) : place);

/** Ranks seats by a score, highest first (ties broken by `tie`, then seat). */
export function rankBy(scores: number[], tie?: number[]) {
  return scores
    .map((s, i) => ({ s, i, t: tie?.[i] ?? 0 }))
    .sort((a, b) => b.s - a.s || b.t - a.t || a.i - b.i)
    .map((x) => x.i);
}

export const ord = (n: number) => T(["1st", "2nd", "3rd", "4th"][n] ?? `${n + 1}th`, ["第一", "第二", "第三", "第四"][n] ?? `第${n + 1}`);
