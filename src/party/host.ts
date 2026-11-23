/**
 * The party's stage: one canvas (960×540 logical, fitted to the screen, sharp on any density), its
 * frame loop, the input and the touch pad. A board or a mini-game is a `Scene` shown on it.
 *
 * `playMini` runs one mini-game the party way: its card (rules, controls, the four players), the
 * 3-2-1 countdown, the game, a FINISH banner and the podium; it resolves with the order (seats,
 * winner first), or null when the visitor walked away.
 */
import * as THREE from "three";
import { T } from "../i18n/lang";
import { Bits, FONT, H, HUD, Input, SEAT, VIEW, W, backdrop, clamp, easeOut, floorFonts, fpx, isLocal, ord, paidPlace, readAt, rr, sfx, stickOf, text, variantPick, type Btn, type MiniDef, type MiniVariant, type Player, type Rnd, type View3 } from "./kit";
import { INK, badge, crown, dpad, keycap, numeral, padBtn, thumbFallback, tint, touchWords, touchy, toy, toyLetters, wrap } from "./hud";
import { thumbImg } from "./thumbs";
import type { ChainSeed } from "./chain";
import { Podium3D } from "./podium";
import { music } from "./music";
import { ambience } from "../audio/ambience";
import { actSvg, actWord, actsOf, type Act } from "./acts";
import { PartyPost } from "./post";
import { MiniIntro } from "./cine";
import { haptic } from "../game/haptic";
import { NetMatch, COUNT as NET_COUNT, type NetPhase } from "./net/match";
import { Sampler, type Pad } from "./net/input";
import type { DelayOpts } from "./net/lockstep";
import type { Transport } from "./net/transport";

export interface Scene {
  update(dt: number, input: Input): void;
  /** Over the 3D when view() gives one (the canvas is cleared each frame). */
  draw(g: CanvasRenderingContext2D, t: number): void;
  /** A 3D scene to draw under the 2D canvas this frame. */
  view?(): View3 | null;
}

const PAD_LABEL: Record<Btn, string> = { left: "◀", right: "▶", up: "▲", down: "▼", a: "A", b: "B" };
/** The touch stick: how far the knob travels (px) and the dead zone near its centre (a share of that). */
const STICK_R = 50;
const STICK_DEAD = 0.16;

/** The shapes of screen the view fills whole (width / height): from a tablet's 4:3 to a long phone's 21.6:9. */
const VIEW_ASPECT: [number, number] = [4 / 3, 2.4];
/** `?frame`: the stage as a 16:9 box in the middle of the screen (how it was), for comparisons. */
const BOXED = typeof location !== "undefined" && new URLSearchParams(location.search).has("frame");

export class Stage {
  readonly el: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  /** Under the 2D canvas: the 3D games' (one renderer, made the first time one is drawn). */
  private glCanvas: HTMLCanvasElement;
  private gl: THREE.WebGLRenderer | null = null;
  private post: PartyPost | null = null;
  readonly input = new Input();
  private pad: HTMLElement;
  /** The touch stick's zone (the left of the screen): the stick comes to the thumb that lands in it. */
  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  /** The pointer on the stick (-1: none) and where it landed, in the zone's own pixels. */
  private stickId = -1;
  private stickAt = { x: 0, y: 0 };
  /** The stick steers left and right only (a kart). */
  private stickX = false;
  /** What the pad shows, for the room it leaves (HUD.free): the left (arrows, a stick, none), a B. */
  private padLeft: "arrows" | "stick" | "" = "";
  private padB = false;
  /** With the stick: the right of the screen is A, held while a finger is on it (no button to aim at). */
  private azone: HTMLElement;
  private aFingers = new Set<number>();
  private padFingers = new Map<number, Btn>();
  private events = new AbortController();
  /** The view on the page (CSS px) and the 960×540 frame in it (its place and size): fit(). */
  private vw = 0;
  private vh = 0;
  private fw = W;
  private fh = H;
  private fx = 0;
  private fy = 0;
  /** The frame's transform on the 2D canvas (its scale and its origin, in canvas pixels). */
  private gk = 1;
  private gx = 0;
  private gy = 0;
  private scene: Scene | null = null;
  private raf = 0;
  private last = 0;
  private t = 0;
  private ro: ResizeObserver;
  /** A dialog is up over the game: it is drawn, not stepped. */
  paused = false;
  /** Set by whoever is waiting on the stage: the visitor walked away. */
  aborts: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "pt-stage";
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.className = "pt-gl";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "pt-canvas";
    this.el.append(this.glCanvas, this.canvas);
    this.pad = document.createElement("div");
    this.pad.className = "pt-pad";
    this.zone = document.createElement("div");
    this.zone.className = "pt-zone";
    this.zone.hidden = true;
    this.zone.innerHTML = `<div class="pt-stick"><b></b></div>`;
    this.base = this.zone.firstElementChild as HTMLElement;
    this.knob = this.base.firstElementChild as HTMLElement;
    this.azone = document.createElement("div");
    this.azone.className = "pt-azone";
    this.azone.hidden = true;
    this.el.append(this.zone, this.azone, this.pad);
    parent.append(this.el);
    this.g = this.canvas.getContext("2d")!;
    this.bleed();
    // (a touch screen: the HUD's small print grows on this canvas, kit.ts)
    if (touchy()) floorFonts(this.g);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    this.input.attach(this.canvas);
    window.addEventListener("blur", () => this.resetControls(), { signal: this.events.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.resetControls();
    }, { signal: this.events.signal });
    // the touch pad: held while touched
    this.pad.addEventListener("pointerdown", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pad]");
      if (!b) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      const btn = b.dataset.pad as Btn;
      if (![...this.padFingers.values()].includes(btn) && !(btn === "a" && this.aFingers.size)) this.input.press(btn);
      this.padFingers.set(e.pointerId, btn);
      b.classList.add("on");
      haptic();
    });
    const up = (e: PointerEvent) => {
      const btn = this.padFingers.get(e.pointerId);
      if (!btn) return;
      this.padFingers.delete(e.pointerId);
      if ([...this.padFingers.values()].includes(btn) || (btn === "a" && this.aFingers.size)) return;
      this.input.release(btn);
      this.pad.querySelector(`[data-pad="${btn}"]`)?.classList.remove("on");
    };
    this.pad.addEventListener("pointerup", up);
    this.pad.addEventListener("pointercancel", up);
    this.pad.addEventListener("lostpointercapture", up);
    // the stick: offsetX/Y are in the zone's own pixels, so it reads the same when the stage is turned
    this.zone.addEventListener("pointerdown", (e) => {
      if (this.stickId !== -1) return;
      e.preventDefault();
      this.zone.setPointerCapture(e.pointerId);
      this.stickId = e.pointerId;
      const R = STICK_R + 14;
      const Ry = this.stickX ? 38 : R;
      this.stickAt = { x: clamp(e.offsetX, R + (this.stickX ? 11 : 0), this.zone.clientWidth - R - (this.stickX ? 11 : 0)), y: clamp(e.offsetY, Ry, this.zone.clientHeight - Ry) };
      this.base.style.left = `${this.stickAt.x}px`;
      this.base.style.top = `${this.stickAt.y}px`;
      this.zone.classList.add("on");
      haptic(5);
      this.tilt(e);
    });
    this.zone.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.stickId) this.tilt(e);
    });
    const off = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = -1;
      this.zone.classList.remove("on");
      this.base.style.left = this.base.style.top = "";
      this.knob.style.transform = "";
      this.input.setStick(null);
    };
    this.zone.addEventListener("pointerup", off);
    this.zone.addEventListener("pointercancel", off);
    this.zone.addEventListener("lostpointercapture", off);
    // the right of the screen: A, held while any finger is down on it
    this.azone.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.azone.setPointerCapture(e.pointerId);
      if (!this.aFingers.size && ![...this.padFingers.values()].includes("a")) {
        this.input.press("a");
        this.pad.querySelector('[data-pad="a"]')?.classList.add("on");
        haptic();
      }
      this.aFingers.add(e.pointerId);
    });
    const aOff = (e: PointerEvent) => {
      if (!this.aFingers.delete(e.pointerId) || this.aFingers.size || [...this.padFingers.values()].includes("a")) return;
      this.input.release("a");
      this.pad.querySelector('[data-pad="a"]')?.classList.remove("on");
    };
    this.azone.addEventListener("pointerup", aOff);
    this.azone.addEventListener("pointercancel", aOff);
    this.azone.addEventListener("lostpointercapture", aOff);
  }

  /** Cancel gestures when a scene changes or the system interrupts a touch. */
  private resetControls() {
    this.input.clear();
    this.padFingers.clear();
    this.aFingers.clear();
    this.stickId = -1;
    this.zone.classList.remove("on");
    this.base.style.left = this.base.style.top = "";
    this.knob.style.transform = "";
    this.pad.querySelectorAll(".on").forEach((b) => b.classList.remove("on"));
  }

  /** The thumb moved on the stick: the knob follows (to its rim), the input gets the tilt. */
  private tilt(e: PointerEvent) {
    const dx = e.offsetX - this.stickAt.x;
    const dy = this.stickX ? 0 : e.offsetY - this.stickAt.y;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, d / STICK_R);
    const nx = d ? dx / d : 0,
      ny = d ? dy / d : 0;
    this.knob.style.transform = `translate(${nx * k * STICK_R}px, ${ny * k * STICK_R}px)`;
    const m = k < STICK_DEAD ? 0 : (k - STICK_DEAD) / (1 - STICK_DEAD);
    this.input.setStick({ x: nx * m, y: ny * m });
  }

  /** A pointer event on the canvas, in its 960×540 logical pixels (right even when the stage is turned for a phone held upright). */
  toCanvas(e: PointerEvent | MouseEvent) {
    const c = this.canvas;
    const r = e.target === c ? null : c.getBoundingClientRect();
    const x = r ? e.clientX - r.left : e.offsetX;
    const y = r ? e.clientY - r.top : e.offsetY;
    // (the canvas is the whole view; the 960×540 frame sits in its middle)
    const u = this.fw / W || 1;
    return { x: (x - this.fx) / u, y: (y - this.fy) / u };
  }

  private fit() {
    // (its layout size, not its box on the screen: on a phone held upright the stage is turned a quarter)
    const r = { width: this.el.clientWidth, height: this.el.clientHeight };
    // the view: the whole stage, whatever its shape between 4:3 and 21.6:9 (past those, bands), so a
    // phone on its side is filled edge to edge; `&frame`: the old 16:9 box, for comparisons
    let vw = Math.max(1, r.width);
    let vh = Math.max(1, r.height);
    const [lo, hi] = BOXED ? [W / H, W / H] : VIEW_ASPECT;
    if (vw / vh > hi) vw = vh * hi;
    else if (vw / vh < lo) vh = vw / lo;
    vw = Math.max(1, Math.floor(vw));
    vh = Math.max(1, Math.floor(vh));
    // the 960×540 frame, whole and centred in it: the HUD's layout; the 3D shows more round it
    const s = Math.min(vw / W, vh / H);
    this.fw = W * s;
    this.fh = H * s;
    this.fx = (vw - this.fw) / 2;
    this.fy = (vh - this.fh) / 2;
    this.vw = vw;
    this.vh = vh;
    VIEW.w = vw / s;
    VIEW.h = vh / s;
    VIEW.mx = (VIEW.w - W) / 2;
    VIEW.my = (VIEW.h - H) / 2;
    this.canvas.style.width = this.glCanvas.style.width = `${vw}px`;
    this.canvas.style.height = this.glCanvas.style.height = `${vh}px`;
    // the hall's pause button (index.ts, the stage's top right corner): the room it takes off the
    // frame's own corner, for the panels there (HUD.tr); none when it sits out in the view's margin
    const pause = this.el.querySelector<HTMLElement>(".pt-quit");
    const fl = (r.width - vw) / 2 + this.fx;
    const ft = (r.height - vh) / 2 + this.fy;
    const over = pause && pause.offsetWidth ? fl + this.fw - (pause.offsetLeft - 8) : 0;
    HUD.tr = pause && over > 0 && pause.offsetTop < ft + 62 * s && pause.offsetTop + pause.offsetHeight > ft ? over / s : 0;
    // (rounded like a window only when it floats in the stage with bands round it)
    this.el.classList.toggle("pt-boxed", vw < r.width - 1 && vh < r.height - 1);
    // (a touch screen: the HUD's small print and panels grow until they read 12 px at this size, kit.ts)
    if (touchy() && r.width > 0 && r.height > 0) {
      const u = s;
      HUD.min = Math.min(18, 12 / u);
      HUD.k = clamp(0.96 / u, 1, 1.4);
      HUD.thumbs = true;
      this.room();
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(vw * dpr);
    this.canvas.height = Math.floor(vh * dpr);
    // the frame's transform on the canvas: its units to the canvas's pixels
    this.gk = (this.canvas.width / vw) * s;
    this.gx = this.fx * (this.canvas.width / vw);
    this.gy = this.fy * (this.canvas.height / vh);
  }

  /**
   * A fill or a clear over the stage's canvas that spans the frame (side to side, or top to bottom) is
   * meant for the screen: it is taken out to the view's edges, so a fade, a letterbox bar or a strip
   * does not stop short in the margins round the frame (kit VIEW). Only under the frame's own
   * transform: a piece drawn turned or zoomed keeps its shape.
   */
  private bleed() {
    const g = this.g;
    const wide = (x: number, y: number, w: number, h: number): [number, number, number, number] => {
      const mx = VIEW.mx;
      const my = VIEW.my;
      if (w < 0) ((x += w), (w = -w));
      if (h < 0) ((y += h), (h = -h));
      const ax = mx > 0 && x <= 0.5 && x + w >= W - 0.5;
      const ay = my > 0 && y <= 0.5 && y + h >= H - 0.5;
      if (!ax && !ay) return [x, y, w, h];
      const t = g.getTransform();
      if (t.b || t.c || Math.abs(t.a - this.gk) > 1e-3 || Math.abs(t.e - this.gx) > 0.5 || Math.abs(t.f - this.gy) > 0.5) return [x, y, w, h];
      if (ax) {
        const x1 = Math.max(x + w, W + mx + 1);
        x = Math.min(x, -mx - 1);
        w = x1 - x;
      }
      if (ay) {
        const y1 = Math.max(y + h, H + my + 1);
        y = Math.min(y, -my - 1);
        h = y1 - y;
      }
      return [x, y, w, h];
    };
    const fill = g.fillRect.bind(g);
    const clear = g.clearRect.bind(g);
    g.fillRect = (x, y, w, h) => fill(...wide(x, y, w, h));
    g.clearRect = (x, y, w, h) => clear(...wide(x, y, w, h));
  }

  /**
   * The frame's room between the thumbs along its bottom (HUD.free, in its units): right of the arrows
   * or the stick at rest, left of A and B, as party.css lays the pad out (its edges 18 px in).
   */
  private room() {
    if (!touchy()) return;
    const sw = this.el.clientWidth;
    const cw = this.fw;
    if (!sw || !cw) return;
    const u = cw / W;
    // (how far in from the stage's edge the frame starts: the view's margin, and a band past 21.6:9)
    const band = (sw - cw) / 2;
    const left = this.padLeft === "arrows" ? 18 + 3 * 64 + 2 * 6 : this.padLeft === "stick" ? 24 + 132 : 0;
    const right = 18 + 84 + (this.padB ? 14 + 66 : 0);
    HUD.free = [Math.max(0, (left - band) / u), Math.min(W, W - (right - band) / u)];
    // (how high the pad reaches from the stage's bottom: the stick's ring at rest, the arrows, B raised, A)
    const up = Math.max(16 + 84, this.padB ? 16 + 44 + 66 : 0, this.padLeft === "arrows" ? 16 + 2 * 64 + 6 : this.padLeft === "stick" ? 20 + 66 + 62 : 0);
    const bandY = (this.el.clientHeight - this.fh) / 2;
    HUD.top = Math.min(H, H - (up - bandY) / u);
  }

  /** Draw a 3D frame under the HUD. */
  private render3(v: View3 | null) {
    // (the bench's `&no3d`: the HUD alone over the backdrop, quick to check under software GL)
    if (NO3D) v = null;
    if (!v) {
      if (this.glCanvas.style.visibility !== "hidden") this.glCanvas.style.visibility = "hidden";
      return;
    }
    if (!this.gl) {
      // (the canvas keeps its own MSAA for the low tier, which draws straight to it)
      this.gl = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: true, powerPreference: "high-performance" });
      // (the dev server prints these: what a phone was doing when its page died)
      if (import.meta.env?.DEV) console.warn(`[stage] WebGL up · ${navigator.userAgent.slice(0, 60)} · ${innerWidth}x${innerHeight} @${devicePixelRatio}`);
      this.glCanvas.addEventListener("webglcontextlost", () => console.warn("[stage] WebGL context lost"));
      this.gl.outputColorSpace = THREE.SRGBColorSpace;
      this.post = new PartyPost(this.gl);
    }
    const cw = this.vw || W;
    const ch = this.vh || H;
    // the camera draws the whole view. A game frames its shot for 16:9: a wider screen sees more to
    // the sides at the same height; a taller one keeps the shot's width and sees more above and below
    // (its lens opened for this frame only; the matrix stays as drawn for the HUD's toScreen)
    const a = cw / ch;
    const fov = v.camera.fov;
    v.camera.aspect = a;
    if (a < W / H - 1e-3) v.camera.fov = (Math.atan((Math.tan((fov * Math.PI) / 360) * (W / H)) / a) * 360) / Math.PI;
    v.camera.updateProjectionMatrix();
    v.camera.fov = fov;
    // (the finish: HDR, AO, bloom, tone and grade; its tier sets the density, post.ts)
    this.post!.render(v.scene, v.camera, cw, ch);
    if (this.glCanvas.style.visibility !== "visible") this.glCanvas.style.visibility = "visible";
  }

  /** Get the 3D game's shaders ready before it is seen (no hitch at its start). */
  warm(v: View3) {
    if (!this.gl) this.render3(v);
    else this.post!.compile(v.scene, v.camera);
  }

  /**
   * The pad away (a touch screen): over a screen a tap anywhere goes on from (the intro, the rules
   * card, a podium, the standings), so the stick and the buttons do not cover what it says.
   */
  bare(on: boolean) {
    if (this.el.classList.contains("pt-bare") !== on) this.el.classList.toggle("pt-bare", on);
  }

  /** Show a scene, with these pad buttons on a touch screen (`stick`: its arrows as an analog stick). */
  show(scene: Scene, pad: Btn[] = ["a"], tap = true, stick: boolean | "x" = false, acts: { a?: Act; b?: Act } = {}) {
    this.scene = scene;
    this.bare(false);
    this.resetControls();
    this.input.enabled = true;
    this.input.tapIsA = tap;
    const key = pad.join(",") + `|${stick}|${acts.a ?? ""}|${acts.b ?? ""}`;
    if (this.pad.dataset.k !== key) {
      this.pad.dataset.k = key;
      this.zone.hidden = !stick;
      this.azone.hidden = !stick || !pad.includes("a");
      this.aFingers.clear();
      this.stickX = stick === "x";
      this.zone.classList.toggle("pt-x", this.stickX);
      const arrows = stick ? [] : pad.filter((b) => b !== "a" && b !== "b");
      this.padLeft = stick ? "stick" : arrows.length ? "arrows" : "";
      this.padB = pad.includes("b");
      this.room();
      // (A and B say what they do in this game: a pictogram and its word, acts.ts; else their letter)
      const btn = (b: "a" | "b") => {
        const act = acts[b];
        return `<button data-pad="${b}" class="pt-${b}btn${act ? " pt-act" : ""}"${act ? ` aria-label="${actWord(act)}"` : ""}>${act ? `${actSvg(act)}<span>${actWord(act)}</span>` : b.toUpperCase()}</button>`;
      };
      this.pad.innerHTML = `${arrows.length ? `<div class="pt-arrows">${arrows.map((b) => `<button data-pad="${b}" class="pt-${b}">${PAD_LABEL[b]}</button>`).join("")}</div>` : ""}<div class="pt-btns">${pad.includes("b") ? btn("b") : ""}${pad.includes("a") ? btn("a") : ""}</div>`;
    }
    if (!this.raf) this.start();
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      // (the first frame's stamp can be older than start(): never a negative step)
      const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
      this.last = now;
      this.t += dt;
      this.input.tick();
      const sc = this.scene;
      if (!sc) return;
      if (!this.paused) sc.update(dt, this.input);
      this.render3(sc.view?.() ?? null);
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      g.setTransform(this.gk, 0, 0, this.gk, this.gx, this.gy);
      g.imageSmoothingEnabled = true;
      sc.draw(g, this.t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.input.enabled = false;
    this.resetControls();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scene = null;
    this.render3(null);
  }

  /** The visitor walked away: whatever waits on the stage gives up. */
  abort() {
    const a = this.aborts;
    this.aborts = [];
    for (const f of a) f();
  }

  dispose() {
    this.events.abort();
    this.stop();
    this.post?.dispose();
    this.post = null;
    this.gl?.dispose();
    this.gl?.forceContextLoss();
    this.gl = null;
    this.input.detach();
    this.ro.disconnect();
    this.el.remove();
  }
}

/** Wait on a scene until it calls `done(v)` (or the stage is aborted: null). Its dispose() follows. */
export function hold<V>(stage: Stage, make: (done: (v: V) => void) => Scene & { dispose?(): void }, pad?: Btn[], tap?: boolean, stick?: boolean | "x", acts?: { a?: Act; b?: Act }): Promise<V | null> {
  return new Promise((resolve) => {
    let over = false;
    let sc: (Scene & { dispose?(): void }) | null = null;
    const finish = (v: V | null) => {
      if (over) return;
      over = true;
      stage.aborts = stage.aborts.filter((f) => f !== quit);
      sc?.dispose?.();
      resolve(v);
    };
    const quit = () => finish(null);
    stage.aborts.push(quit);
    sc = make((v) => finish(v));
    stage.show(sc, pad, tap, stick, acts);
  });
}

export interface MiniOpts {
  /** A line on the card (the round, what is at stake). */
  note?: string;
  /** What each place pays, shown on the podium (index: place). */
  prizes?: string[];
  /** Skip the rules card (a rematch). */
  quick?: boolean;
  /** The Zcash block this arena was seeded from (a chip on the card); null: a local seed. */
  block?: ChainSeed | null;
  /** false: no podium, it resolves after the finish (a round of a match, a game of a tournament). */
  podium?: boolean;
  /** This round of how many (shown over the 3-2-1). */
  round?: [number, number];
  /** The version to play (a kart track: one of def.variants' keys); none: the seed draws one. */
  variant?: string;
  /** Online: the game runs in lockstep with the other clients (src/party/net/lockstep.ts). */
  net?: NetPlay;
}

/**
 * An online mini-game: the room's relay, its seed for this game, who plays where. `rnd` is not used
 * online (every client draws from `seed`), and the game is the same on every client: only who is
 * "you" differs.
 */
export interface NetPlay {
  /** The room's game channel (src/net/rooms.ts), or a loopback (net/transport.ts). */
  transport: Transport;
  /** The same on every client: the game's arena, its version, its AIs, Math.random in the sim. */
  seed: number;
  /** The seats people play, anywhere, and this device's (one, usually). */
  humans: number[];
  local: number[];
  /** Input delay in ticks: a number fixes it, else adaptive (net/lockstep.ts DelayOpts). */
  delay?: number | DelayOpts;
  /** Each local seat's input (none: the stage's, for the first one); `tick()` once a frame if it has one. */
  pads?: Record<number, Pad & { tick?(): void }>;
  /** Every frame, before the match steps: the bench steps its simulated peers here. */
  each?: (dt: number) => void;
  /** The match, once made (the bench reads it). */
  made?: (m: NetMatch) => void;
}

/** A game's version by key (none: null). */
export const variantOf = (def: MiniDef, key: string | undefined): MiniVariant | null => (key && def.variants?.find((v) => v.key === key)) || null;

/** The rules card's game for a version: its picture, its name under the title, its own line. */
function cardOf(def: MiniDef, v: MiniVariant | null): MiniDef {
  if (!v) return def;
  return { ...def, key: v.thumb ?? `${def.key}-${v.key}`, tag: `${v.title} · ${v.tag ?? def.tag}`, tagZh: `${v.titleZh} · ${v.tagZh ?? def.tagZh}` };
}

/** The block that seeded the session in progress (a board's mini-games, seeded from the board's dice, show it). */
let arenaBlock: ChainSeed | null = null;
export const setArenaBlock = (b: ChainSeed | null) => void (arenaBlock = b);

const COUNT = 0.62;

/** The bench (partylab.html): `&nohud` draws no 2D over the 3D (clean frames for the thumbnails); window.labPhase tells where a game is. */
const LAB = typeof location !== "undefined" && /partylab/.test(location.pathname);
const NOHUD = LAB && new URLSearchParams(location.search).has("nohud");
/** The bench: `&no3d` draws the HUD with no 3D under it (a layout check, fast under software GL). */
const NO3D = LAB && new URLSearchParams(location.search).has("no3d");
/** The bench: `&cine=0` no intro cinematic, `&cine=full` the whole one even for four AIs, `&cine=short` the short one. */
const CINE = LAB ? new URLSearchParams(location.search).get("cine") : null;

/** One mini-game, from its card to its podium (a game loaded on demand is fetched first: gp/). */
export async function playMini(stage: Stage, def: MiniDef, players: Player[], rnd: Rnd, opts: MiniOpts = {}): Promise<number[] | null> {
  if (def.load) {
    try {
      await def.load();
    } catch (e) {
      console.warn(`[party] ${def.key} did not load`, e);
      return null;
    }
  }
  if (opts.net) return playNet(stage, def, players, opts, opts.net);
  return hold<number[]>(
    stage,
    (done) => {
      // (a game with versions: the one asked for, or one drawn by the seed: the board, a random match)
      const vdef = def.variants?.length ? (variantOf(def, opts.variant) ?? def.variants[Math.floor(rnd() * def.variants.length) % def.variants.length]) : null;
      const mini = def.make(players, rnd, vdef?.key);
      const card = cardOf(def, vdef);
      const song = vdef?.song ?? def.song;
      // (audio) its ambience bed under the intro, the card and the game; its song's instruments readied meanwhile
      const amb = vdef?.ambience ?? def.ambience;
      if (amb) ambience.play(amb, 2);
      else ambience.stop(1);
      if (song) music.prepare(song);
      const block = opts.block !== undefined ? opts.block : arenaBlock;
      const three = !!mini.view;
      // the intro cinematic before the card (cine.ts): the short one for a rematch or a table of four AIs
      const noHuman = !players.some((p) => p.human);
      const intro = three && !NOHUD && CINE !== "0" ? new MiniIntro(def, vdef, mini, players, { short: CINE === "full" ? false : CINE === "short" || !!opts.quick || noHuman, round: opts.round }) : null;
      let phase: "intro" | "card" | "count" | "play" | "finish" | "podium" = intro ? "intro" : opts.quick ? "count" : "card";
      /** Since the intro handed over (its wipe's tail over the card). */
      let wipeT = Infinity;
      let pt = 0;
      let order: number[] = [];
      let lastCount = -1;
      let podium: Podium3D | null = null;
      let miniGone = false;
      let fast = false;
      /** Resolved with no podium: the scene is gone, nothing more to step or draw. */
      let over = false;
      const bits = new Bits();
      const still = new Input();
      const human = players.findIndex((p) => p.human);
      const dropMini = () => {
        if (miniGone) return;
        miniGone = true;
        mini.dispose?.();
      };
      return {
        update(dt, input) {
          if (over) return;
          pt += dt;
          bits.update(dt);
          if (LAB) (window as unknown as { labPhase: unknown }).labPhase = { phase, pt, key: def.key };
          stage.bare(phase === "intro" || phase === "card" || phase === "podium");
          wipeT += dt;
          if (phase === "intro") {
            // (a tap skips it in any game; the game idles under it as under the card)
            input.tapIsA = true;
            if (intro!.step(dt, input, () => mini.idle?.(dt, "card", pt))) {
              input.tapIsA = def.tap;
              phase = opts.quick ? "count" : "card";
              pt = 0;
              wipeT = 0;
            }
          } else if (phase === "card") {
            // ("TAP TO START!": a tap anywhere starts, even in a game whose taps are not A)
            input.tapIsA = true;
            mini.idle?.(dt, "card", pt);
            // (a table of four AIs, in a test: no one to press start)
            if ((pt > 0.5 && input.pressed("a")) || (human < 0 && pt > 1)) ((phase = "count"), (pt = 0), (input.tapIsA = def.tap));
          } else if (phase === "count") {
            mini.idle?.(dt, "count", Math.min(1, pt / (COUNT * 3)), input);
            const n = 3 - Math.floor(pt / COUNT);
            if (n !== lastCount && n > 0) ((lastCount = n), sfx.count());
            if (pt >= COUNT * 3) {
              phase = "play";
              pt = 0;
              sfx.go();
              input.clear();
              if (song) music.play(song);
            }
          } else if (phase === "play") {
            // (out already: the rivals finish it at triple speed)
            const ff = mini.humanOut?.() ? 3 : 1;
            // (a slow frame, under 40 a second, is played as two or three short steps of 1/60 s or
            // so: what moves fast does not skip a wall, and a jump is as high on a slow phone as on
            // a fast one; a press counts in the first step only)
            const sub = dt > 0.025 ? Math.min(3, Math.ceil(dt * 60 - 0.05)) : 1;
            for (let n = 0; n < ff && !mini.result(); n++)
              for (let k = 0; k < sub && !mini.result(); k++) {
                if (k > 0) input.spent();
                mini.update(dt / sub, input);
              }
            fast = ff > 1;
            const r = mini.result();
            if (r) {
              order = r;
              phase = "finish";
              pt = 0;
              sfx.whoosh();
              // (audio) the song lands on its home chord instead of fading
              music.end();
            }
          } else if (phase === "finish") {
            // (the game goes on moving, without hands on it: the last fall, the winner's leap)
            mini.update(dt, still);
            if (pt > 1.6 && opts.podium === false) {
              over = true;
              ambience.stop(1.2);
              done(order);
            } else if (pt > 1.6) {
              phase = "podium";
              pt = 0;
              ambience.stop(1.2);
              dropMini();
              podium = new Podium3D(players, order);
              const place = order.indexOf(human);
              if (place === 0) bits.burst(W / 2, 140, 60, [...SEAT, "#ffd23f", "#fff"], 420, 380, 7);
              podiumMusic(place);
            }
          } else if (phase === "podium") {
            input.tapIsA = true;
            podium?.update(dt);
            if ((pt > 0.9 && input.pressed("a")) || (human < 0 && pt > 1.5)) done(order);
            if (pt > 7) done(order);
          }
        },
        view() {
          if (over) return null;
          if (phase === "podium") return podium?.view() ?? null;
          return miniGone ? null : (mini.view?.() ?? null);
        },
        draw(g, t) {
          if (over) return;
          if (phase === "intro") return intro!.draw(g, t);
          if (phase === "card") return (drawCard(g, t, card, players, opts.note, pt, three, block), intro?.tail(g, wipeT));
          if (phase === "podium") {
            if (podium) drawPodium3(g, t, players, order, opts.prizes, pt, podium);
            bits.draw(g);
            return;
          }
          // (the bench's clean frames: the 3D alone)
          if (NOHUD) return;
          mini.draw(g, t);
          if (phase === "count") (drawCount(g, pt, three, opts.round, opts.quick ? block : null), intro?.tail(g, wipeT));
          else if (phase === "play" && pt < 0.7) drawGo(g, pt);
          if (phase === "play" && fast) drawFast(g, t);
          else if (phase === "finish") drawFinish(g, pt, three);
          bits.draw(g);
        },
        dispose() {
          music.stop();
          ambience.stop(0.8);
          intro?.dispose();
          dropMini();
          podium?.dispose();
          podium = null;
        },
      };
    },
    def.pad,
    def.tap,
    stickOf(def),
    actsOf(def.key),
  );
}

/** How long the result of the host may keep us at the finish before ours stands in (and a loud log). */
const HOST_WAIT = 6;

/**
 * playMini online: the card, the 3-2-1, the game and its finish are lockstep ticks (net/match.ts),
 * drawn here at the screen's own rate; the podium is this screen's own. No intro cinematic (it moves
 * the game's players about on each screen's own time) and no fast-forward.
 */
function playNet(stage: Stage, def: MiniDef, players: Player[], opts: MiniOpts, net: NetPlay): Promise<number[] | null> {
  return hold<number[]>(
    stage,
    (done) => {
      const match = new NetMatch({ def, players, seed: net.seed, humans: net.humans, local: net.local, transport: net.transport, variant: opts.variant, delay: net.delay });
      net.made?.(match);
      const mini = match.mini;
      const seats = match.players;
      const vdef = variantOf(def, match.variant ?? undefined);
      const card = cardOf(def, vdef);
      const song = vdef?.song ?? def.song;
      const amb = vdef?.ambience ?? def.ambience;
      if (amb) ambience.play(amb, 2);
      else ambience.stop(1);
      if (song) music.prepare(song);
      const block = opts.block !== undefined ? opts.block : arenaBlock;
      const three = !!mini.view;
      // (each local seat's input, sampled once per screen frame, handed out once per tick)
      const samplers = new Map(net.local.map((s, i) => [s, new Sampler(net.pads?.[s] ?? (i === 0 ? stage.input : new Input()))]));
      const pads = Object.values(net.pads ?? {});
      const you = net.local[0];
      let seen: NetPhase = "card";
      let lastCount = -1;
      /** Past the lockstep: waiting for the host's result, then the podium (this screen's own). */
      let after: "" | "wait" | "podium" = "";
      let pt = 0;
      let order: number[] = [];
      let podium: Podium3D | null = null;
      let over = false;
      let finished = false;
      const bits = new Bits();
      const finish = (o: number[]) => {
        order = o;
        finished = true;
        if (opts.podium === false) {
          over = true;
          ambience.stop(1.2);
          done(order);
          return;
        }
        after = "podium";
        pt = 0;
        ambience.stop(1.2);
        podium = new Podium3D(seats, order);
        const place = order.indexOf(you);
        if (place === 0) bits.burst(W / 2, 140, 60, [...SEAT, "#ffd23f", "#fff"], 420, 380, 7);
        podiumMusic(place);
      };
      return {
        update(dt, input) {
          if (over) return;
          pt += dt;
          bits.update(dt);
          net.each?.(dt);
          for (const p of pads) p.tick?.();
          for (const sm of samplers.values()) sm.frame();
          if (LAB) (window as unknown as { labPhase: unknown }).labPhase = { phase: after || match.phase, pt: match.pt, key: def.key, net: true };
          stage.bare(match.phase === "card" || after === "podium");
          // ("TAP TO START!": a tap anywhere is A while the card is up)
          input.tapIsA = match.phase === "card" || after === "podium" ? true : def.tap;
          if (!after) match.frame(dt, (s) => samplers.get(s)!.take());
          // what this screen does as the shared phases go by: the beeps, GO, the music, the whoosh
          if (match.phase === "count") {
            const n = 3 - Math.floor(match.pt / NET_COUNT);
            if (n !== lastCount && n > 0) ((lastCount = n), sfx.count());
          }
          if (match.phase !== seen) {
            if (match.phase === "play") {
              sfx.go();
              if (song) music.play(song);
            } else if (match.phase === "finish") {
              sfx.whoosh();
              music.end();
            }
            seen = match.phase;
            if (match.phase === "done") ((after = "wait"), (pt = 0));
          }
          if (after === "wait") {
            // (the host's result is the one the board scores; it is normally here already)
            const a = match.result();
            if (a) finish(a);
            else if (pt > HOST_WAIT) {
              console.error(`[lockstep] no result from the host (seat ${match.lock.host()}) after ${HOST_WAIT} s: this client's own stands`);
              finish(match.order ?? [0, 1, 2, 3]);
            }
          } else if (after === "podium") {
            podium?.update(dt);
            if ((pt > 0.9 && input.pressed("a")) || pt > 7) done(order);
          }
        },
        view() {
          if (over) return null;
          if (after === "podium") return podium?.view() ?? null;
          return mini.view?.() ?? null;
        },
        draw(g, t) {
          if (over) return;
          if (after === "podium") {
            if (podium) drawPodium3(g, t, seats, order, opts.prizes, pt, podium);
            bits.draw(g);
            return;
          }
          if (match.phase === "card") drawCard(g, t, card, seats, opts.note, match.pt, three, block, match.ready);
          else {
            if (NOHUD) return;
            mini.draw(g, t);
            if (match.phase === "count") drawCount(g, match.pt, three, opts.round, opts.quick ? block : null);
            else if (match.phase === "play" && match.pt < 0.7) drawGo(g, match.pt);
            else if (match.phase === "finish" || match.phase === "done") drawFinish(g, match.phase === "done" ? 1.6 + pt : match.pt, three);
          }
          // (half a second without a tick: who it is waiting for)
          if (match.lock.stallMs > 500 && !after) drawWaiting(g, t, match.lock.waitingFor().map((s) => seats[s]));
          bits.draw(g);
        },
        dispose() {
          music.stop();
          ambience.stop(0.8);
          // (walked away mid-game: the others' AI takes our seat from our last frame on)
          match.dispose(!finished);
          podium?.dispose();
          podium = null;
        },
      };
    },
    def.pad,
    def.tap,
    stickOf(def),
    actsOf(def.key),
  );
}

/** "WAITING FOR …": a pill under the clock while the lockstep waits for someone's input. */
function drawWaiting(g: CanvasRenderingContext2D, t: number, who: Player[]) {
  const names = who.map((p) => p.name.split(" ")[0]).join(", ");
  const msg = names ? T(`WAITING FOR ${names.toUpperCase()}`, `等待 ${names}`) : T("WAITING FOR PLAYERS", "等待玩家");
  g.font = `900 ${fpx(14)}px ${FONT}`;
  const w = g.measureText(msg).width + 64;
  const h = 38;
  const x = W / 2 - w / 2;
  const y = H / 2 + 70;
  rr(g, x, y, w, h, h / 2);
  g.fillStyle = "rgba(10,7,26,0.86)";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(255,255,255,0.22)";
  g.stroke();
  // three dots, breathing
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.35 + 0.65 * ((Math.sin(t * 6 - i * 0.9) + 1) / 2);
    g.beginPath();
    g.arc(x + 20 + i * 9, y + h / 2, 3, 0, Math.PI * 2);
    g.fillStyle = "#ffd23f";
    g.fill();
  }
  g.globalAlpha = 1;
  text(g, msg, x + w / 2 + 14, y + h / 2 + 1, 14, "#fff", "center", 900);
}

// ---- the host's words over the game: the 3-2-1, GO, FINISH, the fast-forward -----------------------

const COUNT_C = ["#ff5fa2", "#8ee35b", "#3ec6ff"];
const pop = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 3.4 * Math.pow(t - 1, 3) + 2.4 * Math.pow(t - 1, 2));

function drawCount(g: CanvasRenderingContext2D, pt: number, three: boolean, round?: [number, number], block?: ChainSeed | null) {
  g.fillStyle = three ? "rgba(8,6,20,0.2)" : "rgba(8,6,20,0.45)";
  g.fillRect(0, 0, W, H);
  // (a later round: its arena's block under the figure, clear of the corner panels)
  if (block) drawBlockChip(g, block, 1, W / 2, H / 2 + 122);
  if (round) {
    // (a match: which round this is, over the figure)
    g.save();
    g.translate(W / 2, H / 2 - 128);
    const rs = pop(clamp(pt / 0.3, 0, 1));
    g.scale(rs, rs);
    toy(g, T(`ROUND ${round[0]} / ${round[1]}`, `第 ${round[0]} / ${round[1]} 局`), 0, 0, 36, round[0] === round[1] ? "#ff8a3c" : "#ffd23f");
    g.restore();
  }
  const n = Math.max(1, 3 - Math.floor(pt / COUNT));
  const k = (pt % COUNT) / COUNT;
  const c = COUNT_C[n - 1];
  // a ring bursting out behind the figure
  g.save();
  g.globalAlpha = (1 - k) * 0.7;
  g.lineWidth = 14 * (1 - k) + 2;
  g.strokeStyle = c;
  g.beginPath();
  g.arc(W / 2, H / 2, 70 + easeOut(k) * 150, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  g.save();
  g.translate(W / 2, H / 2);
  const sc = pop(Math.min(1, k / 0.32)) * (1 - Math.max(0, k - 0.7) * 0.25);
  g.rotate((1 - Math.min(1, k / 0.32)) * -0.25);
  g.scale(sc, sc);
  toy(g, String(n), 0, 0, 170, c);
  g.restore();
}

function drawGo(g: CanvasRenderingContext2D, pt: number) {
  const k = pt / 0.7;
  g.save();
  g.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
  g.translate(W / 2, H / 2);
  const sc = pop(Math.min(1, k / 0.25)) * (1 + Math.max(0, k - 0.4) * 0.5);
  g.scale(sc, sc);
  toy(g, T("GO!", "开始！"), 0, 0, 150, "#ffd23f");
  g.restore();
}

function drawFinish(g: CanvasRenderingContext2D, pt: number, three: boolean) {
  const k = clamp(pt / 0.4, 0, 1);
  g.fillStyle = `rgba(8,6,20,${(three ? 0.18 : 0.35) * k})`;
  g.fillRect(0, 0, W, H);
  const s = T("FINISH!", "结束！");
  const n = Array.from(s).length;
  const st = 0.09;
  const now = performance.now() / 1000;
  toyLetters(
    g,
    s,
    W / 2,
    H / 2,
    112,
    "#ff8a3c",
    (i) => {
      const t = clamp((pt / 0.5) * (1 + n * st) - i * st, 0, 1);
      return -(1 - t) * 90 + (t >= 1 ? Math.sin(now * 7 - i * 0.6) * 4 : 0);
    },
    (i) => pop(clamp((pt / 0.5) * (1 + n * st) - i * st, 0, 1)),
  );
}

function drawFast(g: CanvasRenderingContext2D, t: number) {
  const msg = T("OUT · FAST-FORWARD", "已出局 · 快进");
  g.font = `900 ${fpx(13)}px ${FONT}`;
  const w = HUD.min ? Math.max(236, g.measureText(msg).width + 76) : 236;
  const h = 40;
  const x = W / 2 - w / 2;
  const y = H - 62;
  rr(g, x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
  g.fillStyle = INK;
  g.fill();
  rr(g, x, y, w, h, h / 2);
  g.fillStyle = "#ffffff";
  g.fill();
  rr(g, x + 3, y + 3, w - 6, h - 6, h / 2 - 3);
  g.fillStyle = "#2a1f63";
  g.fill();
  // the chevrons run
  for (let i = 0; i < 3; i++) {
    const a = 0.3 + 0.7 * ((Math.sin(t * 9 - i * 1.1) + 1) / 2);
    g.globalAlpha = a;
    const cx = x + 24 + i * 11;
    g.beginPath();
    g.moveTo(cx - 5, y + 12);
    g.lineTo(cx + 4, y + 20);
    g.lineTo(cx - 5, y + 28);
    g.lineWidth = 3.5;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#ffd23f";
    g.stroke();
  }
  g.globalAlpha = 1;
  text(g, msg, x + w / 2 + 22, y + h / 2 + 1, 13, "#fff", "center", 900);
}

// ---- the rules card -------------------------------------------------------------------------------

/** The game's controls as glyphs, from x along y: key caps on a computer, the pad on a phone. Returns the width used. */
function drawControls(g: CanvasRenderingContext2D, def: MiniDef, x: number, y: number) {
  const dirs: Btn[] = def.pad.filter((b) => b !== "a" && b !== "b");
  const touch = touchy();
  const label = (s: string, cx: number) => text(g, s, cx, y + 30, 10.5, "rgba(255,255,255,0.6)", "center", 800);
  let cx = x;
  if (dirs.length) {
    if (touch && stickOf(def)) {
      // the stick: a ring and its knob, leaning
      g.beginPath();
      g.arc(cx + 20, y, 19, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.stroke();
      g.beginPath();
      g.arc(cx + 25, y - 4, 10, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      label(T("MOVE", "移动"), cx + 20);
      // (room for the next one's word: "MOVE" and "SHOVE" grown to read on a phone)
      cx += HUD.min ? 70 : 58;
    } else if (touch) {
      dpad(g, cx + 20, y, 40, dirs);
      label(T("MOVE", "移动"), cx + 20);
      cx += HUD.min ? 70 : 58;
    } else {
      const caps = (["left", "up", "down", "right"] as Btn[]).filter((b) => dirs.includes(b));
      const glyph: Record<Btn, string> = { left: "←", right: "→", up: "↑", down: "↓", a: "A", b: "B" };
      const w0 = cx;
      caps.forEach((b, i) => keycap(g, glyph[b], cx + 14 + i * 32, y, 28, 28, { size: 15 }));
      cx += caps.length * 32;
      label(caps.length > 2 ? T("MOVE · WASD", "移动 · WASD") : T("STEER · A D", "转向 · A D"), (w0 + cx - 4) / 2);
      cx += 18;
    }
  }
  const acts = actsOf(def.key);
  for (const b of ["a", "b"] as const) {
    if (!def.pad.includes(b)) continue;
    const act = acts[b];
    if (!touch) {
      // a keyboard: the button, its key, and under them what it does ("JUMP")
      padBtn(g, b, cx + 15, y, 15);
      const key = b === "a" ? T("SPACE", "空格") : T("SHIFT", "SHIFT");
      keycap(g, key, cx + 38 + 30, y, 60, 28, { size: 11 });
      label(act ? actWord(act) : b === "a" ? T("A · ENTER", "A · 回车") : T("B · X · E", "B · X · E"), cx + 50);
      cx += 118;
    } else if (act) {
      // a touch screen: the button as it is on the glass (its pictogram), its word under it
      padBtn(g, b, cx + 17, y, 17, act);
      g.font = `800 10.5px ${FONT}`;
      const lw = Math.max(34, g.measureText(actWord(act)).width + 10);
      label(actWord(act), cx + 17);
      cx += Math.max(48, lw + 12);
    } else {
      // (a small screen: the button says it already; its letter alone would be the only small print)
      padBtn(g, b, cx + 15, y, 15);
      if (!HUD.min) label(b.toUpperCase(), cx + 15);
      cx += 44;
    }
  }
  if (def.tap && touch) {
    // a finger on the glass: a tap is A
    g.beginPath();
    g.arc(cx + 16, y, 14, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.stroke();
    text(g, "☝", cx + 16, y + 1, 16, "#fff");
    label(T("TAP = A", "点击 = A"), cx + 16);
    cx += 44;
  }
  return cx - x;
}

/** A game's picture in a frame of its colour (or its stand-in). */
function drawThumb(g: CanvasRenderingContext2D, def: MiniDef, x: number, y: number, w: number, h: number) {
  rr(g, x - 6, y - 6 + 5, w + 12, h + 12, 20);
  g.fillStyle = "rgba(6,3,18,0.5)";
  g.fill();
  rr(g, x - 7, y - 7, w + 14, h + 14, 21);
  g.fillStyle = INK;
  g.fill();
  rr(g, x - 5, y - 5, w + 10, h + 10, 19);
  g.fillStyle = def.color;
  g.fill();
  g.save();
  rr(g, x, y, w, h, 14);
  g.clip();
  const im = thumbImg(def.key);
  if (im) g.drawImage(im, x, y, w, h);
  else thumbFallback(g, x, y, w, h, def.color, T(def.title, def.titleZh), def.key);
  // a gloss across the top
  const gl = g.createLinearGradient(0, y, 0, y + h * 0.4);
  gl.addColorStop(0, "rgba(255,255,255,0.22)");
  gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl;
  g.fillRect(x, y, w, h * 0.4);
  g.restore();
}

/** The arena's chip, top left of the card: the Zcash block it was seeded from. */
function drawBlockChip(g: CanvasRenderingContext2D, b: ChainSeed, k: number, cx?: number, cy = 25) {
  const lbl = `#${b.height.toLocaleString("en-US")} · …${b.hash.slice(-4)}`;
  const s = T(`ARENA · ZCASH BLOCK ${lbl}`, `竞技场 · ZCASH 区块 ${lbl}`);
  g.save();
  g.globalAlpha = k;
  g.font = `800 ${fpx(11)}px ${FONT}`;
  const w = g.measureText(s).width + 38;
  // (top left, or centred on cx)
  const x0 = cx === undefined ? 14 : cx - w / 2;
  g.translate(x0 - 14, cy - 25);
  rr(g, 14, 12, w, 26, 13);
  g.fillStyle = "rgba(10,6,30,0.8)";
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.stroke();
  // a little block, turning
  g.translate(29, 25);
  g.rotate(Math.PI / 4 + Math.sin(performance.now() / 600) * 0.15);
  rr(g, -5.5, -5.5, 11, 11, 2.5);
  g.fillStyle = "#ffd23f";
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = INK;
  g.stroke();
  g.restore();
  g.save();
  g.globalAlpha = k;
  g.translate(x0 - 14, cy - 25);
  text(g, s, 42, 26, 11, "#ffffff", "left", 800);
  g.restore();
}

/**
 * A line too long for `max` as two lines of about the same length (cut at the space nearest its
 * middle); when even those are too long, wrapped as it comes and kept to two.
 */
function balance(g: CanvasRenderingContext2D, s: string, max: number): string[] {
  const words = s.split(" ");
  let best: string[] | null = null;
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    // (a line is not left hanging on a dot or a dash)
    if (/^[·\-–—:]$/.test(words[i - 1]) || /^[·\-–—:]$/.test(words[i])) continue;
    const w = Math.max(g.measureText(a).width, g.measureText(b).width);
    if (w < bestW) ((bestW = w), (best = [a, b]));
  }
  return best && bestW <= max ? best : wrap(g, s, max).slice(0, 2);
}

function drawCard(g: CanvasRenderingContext2D, t: number, def: MiniDef, players: Player[], note: string | undefined, pt: number, three = false, block: ChainSeed | null = null, ready?: boolean[]) {
  if (three) {
    // the arena shows through, darkened behind the card
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "rgba(10,7,26,0.86)");
    gr.addColorStop(0.5, "rgba(10,7,26,0.7)");
    gr.addColorStop(1, "rgba(10,7,26,0.9)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  } else backdrop(g, t);
  // the game's colour in slow stripes behind it all
  g.save();
  g.globalAlpha = 0.07;
  g.fillStyle = def.color;
  const off = (t * 24) % 80;
  for (let x = -H - 80 + off; x < W + 80; x += 80) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 34, 0);
    g.lineTo(x + 34 + H * 0.6, H);
    g.lineTo(x + H * 0.6, H);
    g.fill();
  }
  g.restore();
  const human = players.findIndex(isLocal);
  const ease0 = (d: number, len = 0.4) => easeOut(clamp((pt - d) / len, 0, 1));
  if (block) drawBlockChip(g, block, ease0(0.15));
  // the head: an eyebrow, the name in toy letters, the line under it
  let k = ease0(0);
  g.save();
  g.globalAlpha = k;
  g.font = `900 ${fpx(12)}px ${FONT}`;
  const eb = T("MINI-GAME", "小游戏");
  const ew = g.measureText(eb).width + 30;
  rr(g, W / 2 - ew / 2, 13, ew, 24, 12);
  g.fillStyle = def.color;
  g.fill();
  text(g, eb, W / 2, 26, 12, tint(def.color, -0.7), "center", 900);
  g.restore();
  // (a small screen: a line too long for the card takes two, the note moves down under them)
  g.font = `700 17px ${FONT}`;
  const tag = T(def.tag, def.tagZh);
  // (a long line never runs edge to edge: two lines of about the same length, in the middle of the card)
  const tagW = HUD.min ? W - 48 : 720;
  const tagLines = g.measureText(tag).width > tagW ? balance(g, tag, tagW) : [tag];
  // (the name: a size down and a little higher over a tag of two lines, so its foot clears them)
  const two = tagLines.length > 1;
  const tsz = two ? 46 : 54;
  k = clamp(pt / 0.35, 0, 1);
  g.save();
  g.translate(W / 2, two ? 74 : 82);
  const ts = pop(k);
  g.scale(ts, ts);
  g.font = `900 ${tsz}px ${FONT}`;
  const title = T(def.title, def.titleZh);
  const tw = g.measureText(title).width;
  text(g, title, 0, 0, tw > 760 ? (tsz * 760) / tw : tsz, "#f5f6f8", "center", 900);
  g.restore();
  g.globalAlpha = ease0(0.1);
  // (two lines start under the title's foot, a little closer together, the note under them clear of the panel)
  tagLines.forEach((l, i) => text(g, l, W / 2, two ? 116 + i * 20 : 124, 17, "rgba(255,255,255,0.86)", "center", 700));
  if (note) text(g, note, W / 2, two ? 155 : 148, 13.5, "#ffd23f", "center", 800);
  g.globalAlpha = 1;
  // the panel: the picture, how to play, the controls
  k = ease0(0.08, 0.45);
  g.save();
  g.globalAlpha = k;
  g.translate(0, (1 - k) * 24);
  const px = 56;
  const py = 166;
  const pw = W - 112;
  const ph = 226;
  rr(g, px, py + 5, pw, ph, 24);
  g.fillStyle = "rgba(6,3,18,0.45)";
  g.fill();
  rr(g, px, py, pw, ph, 24);
  const pg = g.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, "rgba(30,38,50,0.96)");
  pg.addColorStop(1, "rgba(11,17,25,0.96)");
  g.fillStyle = pg;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.stroke();
  // (a small screen: a smaller picture, so the rules get the room to read 14 px)
  const small = HUD.min > 0 && readAt(14, 17) > 17;
  const tw2 = small ? 128 : 176;
  g.save();
  g.translate(px + 26 + tw2, py + 113);
  g.rotate(0);
  drawThumb(g, def, -tw2, -tw2 * 0.5625, tw2 * 2, tw2 * 1.125);
  g.restore();
  const cx = px + tw2 * 2 + 58;
  const cw = pw - (tw2 * 2 + 58) - 26;
  text(g, T("HOW TO PLAY", "玩法"), cx, py + 28, 12.5, def.color, "left", 900);
  rr(g, cx, py + 40, 34, 3, 1.5);
  g.fillStyle = def.color;
  g.fill();
  // (the rules fill the room above the controls: a size down when they would not fit)
  let room = small ? 4 : 5;
  const help = touchWords(T(def.help, def.helpZh), def);
  let fs = readAt(14, 17);
  g.font = `650 ${fs}px ${FONT}`;
  let lines = wrap(g, help, cw);
  if (lines.length > room - 1) {
    fs = readAt(13, 15);
    g.font = `650 ${fs}px ${FONT}`;
    lines = wrap(g, help, cw);
  }
  // (a small screen, still too long: the small print's floor, and a fifth line where the rule was)
  if (small && lines.length > room) {
    fs = HUD.min;
    room = 5;
    g.font = `650 ${fs}px ${FONT}`;
    lines = wrap(g, help, cw);
    if (lines.length > room) {
      let last = lines.slice(room - 1).join(" ");
      while (last.length > 4 && g.measureText(last + "…").width > cw) last = last.slice(0, -1);
      lines = [...lines.slice(0, room - 1), last + "…"];
    }
  }
  const lh = small ? (room > 4 ? fs + 3 : fs + 4) : fs + 7;
  const ly = small ? py + 60 : py + 64;
  lines.slice(0, room).forEach((l, i) => text(g, l, cx, ly + i * lh, fs, "rgba(255,255,255,0.93)", "left", 650));
  if (!small || lines.length < room) {
    rr(g, cx, py + 150 + (small ? 6 : 0), cw, 1.5, 1);
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.fill();
  }
  drawControls(g, def, cx, py + 182 + (small ? 4 : 0));
  g.restore();
  // the four players, each one ready in turn
  players.forEach((p, i) => {
    const d = ease0(0.18 + i * 0.07, 0.35);
    const x = W / 2 + (i - 1.5) * 218;
    const y = 434;
    g.save();
    g.globalAlpha = d;
    g.translate(x, y + (1 - d) * 18);
    const w = 204;
    const h = 54;
    rr(g, -w / 2, -h / 2 + 4, w, h, 18);
    g.fillStyle = "rgba(6,3,18,0.45)";
    g.fill();
    rr(g, -w / 2, -h / 2, w, h, 18);
    g.fillStyle = "rgba(17,24,34,0.94)";
    g.fill();
    const you = isLocal(p);
    g.lineWidth = you ? 3 : 2;
    g.strokeStyle = you ? tint(p.color, 0.15) : tint(p.color, -0.1);
    g.stroke();
    badge(g, p, -w / 2 + 29, Math.sin(t * 3 + i) * 2, 42);
    text(g, you ? T("YOU", "你") : p.name, -w / 2 + 58, -8, 14, tint(p.color, 0.35), "left", 900);
    if (you) text(g, T("that's you!", "这是你！"), -w / 2 + 58, 11, 11, "rgba(255,255,255,0.6)", "left", 700);
    // (online, another person: "PLAYER" where a rival's skill pips would be)
    else if (p.human) text(g, T("PLAYER", "玩家"), -w / 2 + 58, 11, 11, "rgba(255,255,255,0.6)", "left", 800);
    else {
      // how good they are: five pips
      const n = Math.max(1, Math.round(p.skill * 5));
      for (let s = 0; s < 5; s++) {
        rr(g, -w / 2 + 58 + s * 11, 8, 8, 8, 2.5);
        g.fillStyle = s < n ? tint(p.color, 0.2) : "rgba(255,255,255,0.14)";
        g.fill();
      }
    }
    // ready: a tick for the rivals as they get set; the A for you (online: a tick once they press it)
    const on = ready ? ready[i] : !p.human && pt > 0.55 + p.seat * 0.32;
    if (on) {
      const rk = ready && p.human ? 1 : pop(clamp((pt - 0.55 - p.seat * 0.32) / 0.25, 0, 1));
      g.save();
      g.translate(w / 2 - 22, 0);
      g.scale(rk, rk);
      g.beginPath();
      g.arc(0, 0, 13, 0, Math.PI * 2);
      g.fillStyle = "#5ee3a1";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#fff";
      g.stroke();
      g.beginPath();
      g.moveTo(-5.5, 0.5);
      g.lineTo(-1.5, 4.5);
      g.lineTo(6, -4.5);
      g.lineWidth = 3;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.stroke();
      g.restore();
    } else if (you) {
      g.save();
      g.translate(w / 2 - 22, 0);
      const s2 = 1 + Math.sin(t * 6) * 0.08;
      g.scale(s2, s2);
      padBtn(g, "a", 0, -1, 13);
      g.restore();
    } else text(g, "…", w / 2 - 22, -2, 18, "rgba(255,255,255,0.4)", "center", 900);
    g.restore();
  });
  // the ready prompt
  const pk = ease0(0.45, 0.3);
  if (pk > 0) {
    g.save();
    g.globalAlpha = pk;
    g.translate(W / 2, 498);
    const s2 = 1 + Math.sin(t * 5) * 0.025;
    g.scale(s2 * (0.8 + 0.2 * pop(pk)), s2 * (0.8 + 0.2 * pop(pk)));
    const touch = touchy();
    const msg = human < 0 ? T("GET READY!", "准备！") : touch ? T("TAP TO START!", "点击开始！") : T("READY? PRESS", "准备好？按");
    g.font = `900 19px ${FONT}`;
    const mw = g.measureText(msg).width;
    const glyph = human >= 0 && !touch;
    const w = mw + (glyph ? 84 : 56);
    const h = 44;
    rr(g, -w / 2, -h / 2 + 5, w, h, h / 2);
    g.fillStyle = tint(def.color, -0.55);
    g.fill();
    rr(g, -w / 2 - 2, -h / 2 - 2, w + 4, h + 4, h / 2 + 2);
    g.fillStyle = "#ffffff";
    g.fill();
    rr(g, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, h / 2 - 2);
    const bg = g.createLinearGradient(0, -h / 2, 0, h / 2);
    bg.addColorStop(0, tint(def.color, 0.3));
    bg.addColorStop(1, tint(def.color, -0.08));
    g.fillStyle = bg;
    g.fill();
    const tx = glyph ? -w / 2 + 24 + mw / 2 : 0;
    g.lineJoin = "round";
    g.lineWidth = 4;
    g.strokeStyle = tint(def.color, -0.6);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeText(msg, tx, 1);
    g.fillStyle = "#ffffff";
    g.fillText(msg, tx, 1);
    if (glyph) padBtn(g, "a", w / 2 - 34, -1, 15);
    g.restore();
  }
}

// ---- the podium's words over the 3D steps ----------------------------------------------------------

const MEDAL = ["#ffd23f", "#d6dde8", "#e39a5f", "#6d6888"];

function drawPodium3(g: CanvasRenderingContext2D, t: number, players: Player[], order: number[], prizes: string[] | undefined, pt: number, podium: Podium3D, extra: { label?: string; totals?: number[] } = {}) {
  const human = players.findIndex(isLocal);
  const place = order.indexOf(human);
  const head = place < 0 ? T("RESULTS", "结果") : place === 0 ? T("YOU WIN!", "你赢了！") : T(`YOU'RE ${ord(place).toUpperCase()}`, `你是${ord(place)}`);
  const n = Array.from(head).length;
  const st = 0.08;
  const now = performance.now() / 1000;
  toyLetters(
    g,
    head,
    W / 2,
    72,
    62,
    place === 0 ? "#ffd23f" : place < 0 ? "#ffffff" : "#8fd8ff",
    (i) => {
      const k = clamp((pt / 0.55) * (1 + n * st) - i * st, 0, 1);
      return -(1 - k) * 60 + (k >= 1 ? Math.sin(now * 6 - i * 0.5) * 3 : 0);
    },
    (i) => pop(clamp((pt / 0.55) * (1 + n * st) - i * st, 0, 1)),
  );
  if (extra.label) {
    // (a match or a tournament: what this podium crowns)
    g.save();
    g.globalAlpha = easeOut(clamp((pt - 0.3) / 0.3, 0, 1));
    g.font = `900 ${fpx(13)}px ${FONT}`;
    const lw = g.measureText(extra.label).width + 30;
    rr(g, W / 2 - lw / 2, 112, lw, 28, 14);
    g.fillStyle = "#ffd23f";
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = INK;
    g.stroke();
    text(g, extra.label, W / 2, 127, 13, "#4a2f00", "center", 900);
    g.restore();
  }
  const spots = podium.spots();
  order.forEach((seat, at) => {
    const p = players[seat];
    const s = spots[at];
    if (!p || !s) return;
    const d = clamp((pt - 0.3 - at * 0.12) / 0.4, 0, 1);
    if (d <= 0) return;
    g.save();
    g.globalAlpha = d;
    g.translate(s.x, s.y + 30);
    const sc = 0.7 + 0.3 * pop(d);
    g.scale(sc, sc);
    const name = p.human ? T("YOU", "你") : p.name;
    const tp = extra.totals?.[seat] ?? 0;
    const pts = extra.totals ? T(`${tp} ${tp === 1 ? "pt" : "pts"}`, `${tp} 分`) : "";
    const prize = [prizes?.[at] ?? "", pts].filter(Boolean).join(" · ");
    g.font = `800 ${fpx(12)}px ${FONT}`;
    const w = Math.max(110, Math.max(g.measureText(name).width * 1.15, g.measureText(prize).width) + 64);
    const h = 46;
    rr(g, -w / 2, -h / 2 + 4, w, h, 16);
    g.fillStyle = "rgba(6,3,18,0.45)";
    g.fill();
    rr(g, -w / 2, -h / 2, w, h, 16);
    g.fillStyle = "rgba(20,14,50,0.92)";
    g.fill();
    g.lineWidth = p.human ? 3 : 2;
    g.strokeStyle = p.color;
    g.stroke();
    // the place, a medal on the left
    const mx = -w / 2 + 22;
    g.beginPath();
    g.arc(mx, 3, 15, 0, Math.PI * 2);
    g.fillStyle = INK;
    g.fill();
    g.beginPath();
    g.arc(mx, 0, 15, 0, Math.PI * 2);
    const mg = g.createLinearGradient(0, -15, 0, 15);
    mg.addColorStop(0, tint(MEDAL[at] ?? MEDAL[3], 0.45));
    mg.addColorStop(1, MEDAL[at] ?? MEDAL[3]);
    g.fillStyle = mg;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#fff";
    g.stroke();
    text(g, String(at + 1), mx, 1, 16, at < 3 ? INK : "#fff", "center", 900);
    const tx = mx + 24;
    text(g, name, tx, prize ? -8 : 1, 15, tint(p.color, 0.35), "left", 900);
    if (prize) text(g, prize, tx, 11, 12, at === 0 ? "#ffd23f" : "rgba(255,255,255,0.78)", "left", 800);
    g.restore();
  });
  if (pt > 0.9) {
    g.save();
    g.globalAlpha = Math.min(1, (pt - 0.9) / 0.3) * (0.75 + Math.sin(t * 5) * 0.25);
    const msg = touchy() ? T("Tap to continue", "点击继续") : T("Press A to continue", "按 A 继续");
    g.font = `800 ${fpx(14)}px ${FONT}`;
    const w = g.measureText(msg).width + 36;
    rr(g, W / 2 - w / 2, 500, w, 30, 15);
    g.fillStyle = "rgba(12,9,28,0.75)";
    g.fill();
    text(g, msg, W / 2, 516, 14, "#ffffff", "center", 800);
    g.restore();
  }
}

// ---- matches of rounds, tournaments of games ---------------------------------------------------------

/** What a round gives by place (a match of rounds), and a game in a tournament. */
export const ROUND_POINTS = [3, 2, 1, 0];
export const TOUR_POINTS = [4, 2, 1, 0];

/**
 * Where the hall's own music goes (the coordinator wires them to music.ts): each is called as its
 * screen opens. The host stops the music when a podium closes.
 */
export const partyMusic: { lobby?(): void; standings?(): void; podium?(): void; roulette?(): void } = {};

/** Every podium: a fanfare (a sadder sting for last place), then the warm podium loop while it stays up. */
function podiumMusic(place: number) {
  // (audio) the crowd: a cheer for the podium, an "aww" when you came last
  if (place === 3) sfx.aww(0.55);
  else sfx.cheer(place <= 0 ? 0.85 : 0.55);
  if (partyMusic.podium) return partyMusic.podium();
  music.sting(place === 3 ? "lose" : "fanfare", "podium");
}

/** A match's or a tournament's ranking: by total; a tie by the best single placing, then the last one, then the seat. */
export function rankTotals(totals: number[], orders: number[][]): number[] {
  const seats = totals.map((_, i) => i);
  const best = seats.map((s) => Math.min(9, ...orders.map((o) => o.indexOf(s)).filter((x) => x >= 0)));
  const last = seats.map((s) => (orders.length ? orders[orders.length - 1].indexOf(s) : 9));
  return seats.sort((a, b) => totals[b] - totals[a] || best[a] - best[b] || last[a] - last[b] || a - b);
}

export interface RoundSeed {
  rnd: Rnd;
  /** The Zcash block it came from (null: a local seed). */
  block: ChainSeed | null;
}

export interface MatchOpts {
  /** 1, 3 or 5. */
  rounds: number;
  /** Round r's seed (r from 1), asked for as the round before it ends. */
  seed(r: number): Promise<RoundSeed>;
  note?: string;
  prizes?: string[];
  /** Each round played, its order (the counters, the missions). */
  onRound?(order: number[], r: number): void;
  /** Inside a tournament: no podium at the end (the tournament's standings follow). */
  inTour?: boolean;
  /**
   * A game with versions (kart tracks): the first round's (none: the one picked in the hall, else drawn
   * by the first round's seed); a match of 3 or 5 rounds goes on round them, a little Grand Prix.
   */
  variant?: string;
}

export interface MatchResult {
  /** Seats, by total (or the one round's order). */
  order: number[];
  totals: number[];
  orders: number[][];
  /** Ended early: the leader could no longer be caught. */
  early: boolean;
}

/** The bench's view of where a match is (window.labPhase), for the scripted checks. */
const labAt = (phase: string, pt: number) => LAB && ((window as unknown as { labPhase: unknown }).labPhase = { phase, pt, key: "" });

const nameOf = (p: Player | undefined) => (!p ? "" : p.human ? T("You", "你") : p.name.split(" ")[0]);

/**
 * One mini-game over 1, 3 or 5 rounds with the same rivals: the rules card before the first, the
 * 3-2-1 before the others, the standings between them, the podium by total at the end. A match of
 * one round is playMini as ever. Null when the visitor walked away.
 */
export async function playMatch(stage: Stage, def: MiniDef, players: Player[], o: MatchOpts): Promise<MatchResult | null> {
  const n = Math.max(1, Math.floor(o.rounds));
  let aborted = false;
  const quit = () => void (aborted = true);
  stage.aborts.push(quit);
  const out = <V>(v: V) => ((stage.aborts = stage.aborts.filter((f) => f !== quit)), v);
  const tot = players.map(() => 0);
  const orders: number[][] = [];
  let early = false;
  let seedP = o.seed(1);
  // (the versions in turn from the first one: the Grand Prix's tracks)
  const vs = def.variants ?? [];
  let v0 = -1;
  const asked = o.variant ?? (o.inTour ? undefined : variantPick.get(def.key));
  if (vs.length) v0 = Math.max(-1, vs.findIndex((v) => v.key === asked));
  for (let r = 1; r <= n; r++) {
    const s = await seedP;
    if (aborted) return out(null);
    if (vs.length && v0 < 0 && (n > 1 || o.inTour)) v0 = Math.floor(s.rnd() * vs.length) % vs.length;
    const variant = vs.length && v0 >= 0 ? vs[(v0 + r - 1) % vs.length].key : undefined;
    const order = await playMini(stage, def, players, s.rnd, {
      variant,
      note: o.note,
      prizes: o.prizes,
      block: s.block,
      quick: r > 1,
      podium: n === 1 && !o.inTour,
      round: n > 1 ? [r, n] : undefined,
    });
    if (!order || aborted) return out(null);
    orders.push(order);
    o.onRound?.(order, r);
    if (n === 1) {
      order.forEach((seat, place) => (tot[seat] = ROUND_POINTS[paidPlace(def, place)] ?? 0));
      return out({ order, totals: tot, orders, early });
    }
    const before = tot.slice();
    order.forEach((seat, place) => (tot[seat] += ROUND_POINTS[paidPlace(def, place)] ?? 0));
    const rankB = rankTotals(before, orders.slice(0, -1));
    const rankA = rankTotals(tot, orders);
    const left = n - r;
    early = left > 0 && tot[rankA[0]] > tot[rankA[1]] + ROUND_POINTS[0] * left;
    const last = r === n || early;
    // (in a tournament its own standings follow the last round)
    if (last && !early && o.inTour) break;
    if (!last) seedP = o.seed(r + 1);
    const ok = await standings(stage, def, players, {
      title: early ? T("UNCATCHABLE!", "无人能追！") : last ? T("FINAL STANDINGS", "最终排名") : T(`ROUND ${r} / ${n}`, `第 ${r} / ${n} 局`),
      sub: early ? T(`${nameOf(players[rankA[0]])} can't be caught with ${left} to play`, `还剩 ${left} 局，${nameOf(players[rankA[0]])} 已无人能追`) : `${T(def.title, def.titleZh)}${variant ? ` · ${T(variantOf(def, variant)!.title, variantOf(def, variant)!.titleZh)}` : ""} · ${T(`best of ${n}`, `${n} 局赛`)}`,
      before,
      after: tot.slice(),
      places: order,
      rankBefore: rankB,
      rankAfter: rankA,
      max: ROUND_POINTS[0] * n,
      block: s.block,
      prompt: last ? (o.inTour ? T("the standings", "积分榜") : T("the podium", "颁奖台")) : T(`round ${r + 1}`, `第 ${r + 1} 局`),
      early,
      color: def.color,
    });
    if (!ok || aborted) return out(null);
    if (last) break;
  }
  const order = rankTotals(tot, orders);
  if (!o.inTour) {
    await showPodium(stage, players, order, { prizes: o.prizes, label: T(`FINAL · BEST OF ${n}`, `总决赛 · ${n} 局赛`), totals: tot });
    // (left on the podium: the match was over, its result stands)
  }
  return out({ order, totals: tot, orders, early });
}

export interface TourOpts {
  games: MiniDef[];
  /** Drawn at random: a roulette reveals each one (from `pool`). */
  random: boolean;
  pool: MiniDef[];
  /** Rounds in each game (1, 3, 5). */
  rounds: number;
  seed(def: MiniDef, game: number, round: number): Promise<RoundSeed>;
  /** The line on each game's card. */
  note?(game: number, def: MiniDef): string;
  onRound?(def: MiniDef, order: number[]): void;
  /** Each game played, its final order (counted once a game: the counters, the missions, the medal). */
  onGame?(def: MiniDef, order: number[]): void;
  /** What each final place pays (the podium). */
  prizes?: string[];
}

export interface TourResult {
  order: number[];
  totals: number[];
  /** Each game's order. */
  games: number[][];
}

/**
 * A tournament: 3 to 10 mini-games in a row with the same rivals, each one worth 4 / 2 / 1 / 0 by
 * its final place; the standings between them (and the next game's picture), the tournament's
 * podium at the end. Null when the visitor walked away.
 */
export async function playTour(stage: Stage, players: Player[], o: TourOpts): Promise<TourResult | null> {
  const N = o.games.length;
  let aborted = false;
  const quit = () => void (aborted = true);
  stage.aborts.push(quit);
  const out = <V>(v: V) => ((stage.aborts = stage.aborts.filter((f) => f !== quit)), v);
  const tot = players.map(() => 0);
  const orders: number[][] = [];
  for (let g = 0; g < N; g++) {
    const def = o.games[g];
    if (o.random) {
      const ok = await roulette(stage, o.pool, def, g + 1, N);
      if (!ok || aborted) return out(null);
    }
    const m = await playMatch(stage, def, players, {
      rounds: o.rounds,
      seed: (r) => o.seed(def, g, r),
      note: o.note?.(g, def),
      onRound: (ord) => o.onRound?.(def, ord),
      inTour: true,
    });
    if (!m || aborted) return out(null);
    orders.push(m.order);
    o.onGame?.(def, m.order);
    const before = tot.slice();
    // (a one-round team game's order is its pairs; over several rounds it is each one's own total)
    const tp = o.rounds <= 1 ? def : {};
    m.order.forEach((seat, place) => (tot[seat] += TOUR_POINTS[paidPlace(tp, place)] ?? 0));
    const nextDef = o.games[g + 1] ?? null;
    const last = g === N - 1;
    const ok = await standings(stage, def, players, {
      title: last ? T("FINAL STANDINGS", "最终排名") : T(`GAME ${g + 1} / ${N}`, `第 ${g + 1} / ${N} 场`),
      sub: `${T("Tournament", "锦标赛")} · ${T(def.title, def.titleZh)} ${T("done", "结束")}`,
      before,
      after: tot.slice(),
      places: m.order,
      rankBefore: rankTotals(before, orders.slice(0, -1)),
      rankAfter: rankTotals(tot, orders),
      max: TOUR_POINTS[0] * N,
      prompt: last ? T("the podium", "颁奖台") : T(`game ${g + 2}`, `第 ${g + 2} 场`),
      next: last ? undefined : { def: o.random ? null : nextDef, label: T(`UP NEXT · GAME ${g + 2} / ${N}`, `下一场 · 第 ${g + 2} / ${N} 场`) },
      color: def.color,
    });
    if (!ok || aborted) return out(null);
  }
  const order = rankTotals(tot, orders);
  await showPodium(stage, players, order, { prizes: o.prizes, label: T(`TOURNAMENT · ${N} GAMES`, `锦标赛 · ${N} 场`), totals: tot });
  return out({ order, totals: tot, games: orders });
}

// ---- the standings between rounds and games -------------------------------------------------------------

interface StandOpts {
  title: string;
  sub: string;
  before: number[];
  after: number[];
  /** This round's (or game's) order: who gained what. */
  places: number[];
  rankBefore: number[];
  rankAfter: number[];
  /** The most points there were to win (the bars). */
  max: number;
  block?: ChainSeed | null;
  /** The next game's picture (null: drawn at random, a "?"). */
  next?: { def: MiniDef | null; label: string };
  /** What A goes on to ("round 3", "the podium"). */
  prompt: string;
  early?: boolean;
  color: string;
}

/** The standings: the four, their points flying in, the totals, the new order; A goes on (or it does, soon). */
function standings(stage: Stage, def: MiniDef, players: Player[], o: StandOpts): Promise<boolean | null> {
  return hold<boolean>(
    stage,
    (done) => {
      let pt = 0;
      let over = false;
      const human = players.findIndex((p) => p.human);
      const AUTO = human < 0 ? 2.4 : o.early ? 6 : 5;
      const fired = new Set<number>();
      const bits = new Bits();
      const ROW = 66;
      const GAP = 9;
      const top = 148;
      const wide = !o.next;
      const rw = wide ? 600 : 520;
      const rx = wide ? W / 2 - rw / 2 : 40;
      partyMusic.standings?.();
      const go = () => {
        if (over) return;
        over = true;
        sfx.blip(4);
        done(true);
      };
      return {
        update(dt, input) {
          if (over) return;
          pt += dt;
          bits.update(dt);
          labAt("standings", pt);
          stage.bare(true);
          // the points pop in by this round's place, the order shuffles after
          o.places.forEach((seat, place) => {
            const at = 0.35 + place * 0.14;
            if (pt >= at && !fired.has(seat)) {
              fired.add(seat);
              if (o.after[seat] > o.before[seat]) sfx.coin();
              else sfx.blip(0);
            }
          });
          if (pt >= 1.35 && !fired.has(99)) (fired.add(99), sfx.whoosh());
          if (o.early && pt >= 1.9 && !fired.has(98)) {
            fired.add(98);
            sfx.star();
            bits.burst(W / 2, 70, 50, [...SEAT, "#ffd23f", "#fff"], 360, 360, 6);
          }
          if (input.pressed("a")) {
            if (pt < 1.85) pt = 1.85;
            else if (pt > 0.6) go();
          }
          if (pt > AUTO) go();
        },
        draw(g, t) {
          backdrop(g, t, "#22165a", "#0b0820", "rgba(255,210,63,0.08)");
          partyStripes(g, t, o.color, 0.06);
          const k = clamp(pt / 0.35, 0, 1);
          // the head
          g.save();
          g.translate(W / 2, 60);
          const hs = pop(k);
          g.scale(hs, hs);
          toy(g, o.title, 0, 0, o.title.length > 14 ? 40 : 48, o.early ? "#ff5f8a" : "#ffd23f");
          g.restore();
          g.globalAlpha = easeOut(clamp((pt - 0.1) / 0.3, 0, 1));
          text(g, o.sub, W / 2, 106, 14.5, "rgba(255,255,255,0.82)", "center", 700);
          g.globalAlpha = 1;
          if (o.block) drawBlockChip(g, o.block, easeOut(clamp(pt / 0.4, 0, 1)));
          // the rows, by total
          const mk = easeOut(clamp((pt - 1.35) / 0.45, 0, 1));
          const lead = o.rankAfter[0];
          for (const seat of o.rankBefore) drawRow(g, seat);
          function drawRow(g: CanvasRenderingContext2D, seat: number) {
            const p = players[seat];
            const iB = o.rankBefore.indexOf(seat);
            const iA = o.rankAfter.indexOf(seat);
            const y = top + (iB + (iA - iB) * mk) * (ROW + GAP);
            const d = easeOut(clamp((pt - 0.05 - iB * 0.06) / 0.3, 0, 1));
            if (d <= 0) return;
            g.save();
            g.globalAlpha = d;
            g.translate((1 - d) * -30, 0);
            rr(g, rx, y + 4, rw, ROW, 20);
            g.fillStyle = "rgba(6,3,18,0.45)";
            g.fill();
            rr(g, rx, y, rw, ROW, 20);
            const bg = g.createLinearGradient(rx, 0, rx + rw, 0);
            bg.addColorStop(0, tint(p.color, -0.45));
            bg.addColorStop(0.35, "rgba(30,22,72,0.95)");
            bg.addColorStop(1, "rgba(20,14,50,0.95)");
            g.fillStyle = bg;
            g.fill();
            g.lineWidth = p.human ? 3 : 2;
            g.strokeStyle = p.human ? tint(p.color, 0.2) : tint(p.color, -0.1);
            g.stroke();
            if (o.early && seat === lead && pt > 1.9) {
              g.globalAlpha = d * (0.5 + Math.sin(t * 6) * 0.3);
              rr(g, rx - 4, y - 4, rw + 8, ROW + 8, 24);
              g.lineWidth = 3;
              g.strokeStyle = "#ffd23f";
              g.stroke();
              g.globalAlpha = d;
            }
            // the rank, a medal
            const rank = mk < 0.5 ? iB : iA;
            const mx = rx + 30;
            const my = y + ROW / 2;
            g.beginPath();
            g.arc(mx, my + 3, 16, 0, Math.PI * 2);
            g.fillStyle = INK;
            g.fill();
            g.beginPath();
            g.arc(mx, my, 16, 0, Math.PI * 2);
            const mg = g.createLinearGradient(0, my - 16, 0, my + 16);
            mg.addColorStop(0, tint(MEDAL[rank] ?? MEDAL[3], 0.45));
            mg.addColorStop(1, MEDAL[rank] ?? MEDAL[3]);
            g.fillStyle = mg;
            g.fill();
            g.lineWidth = 2;
            g.strokeStyle = "#fff";
            g.stroke();
            text(g, String(rank + 1), mx, my + 1, 16, rank < 3 ? INK : "#fff", "center", 900);
            badge(g, p, rx + 82, my, 46);
            if (seat === lead && mk >= 1) crown(g, rx + 82, y + 6, 22, Math.sin(t * 5) * 1.5);
            text(g, p.human ? T("YOU", "你") : p.name, rx + 116, my - 12, 16, tint(p.color, 0.38), "left", 900);
            // the bar: the total against all there was to win
            const bw = rw - 116 - 150;
            const shown = o.before[seat] + (o.after[seat] - o.before[seat]) * easeOut(clamp((pt - 1.0) / 0.35, 0, 1));
            rr(g, rx + 116, my + 6, bw, 9, 4.5);
            g.fillStyle = "rgba(0,0,0,0.35)";
            g.fill();
            if (shown > 0) {
              rr(g, rx + 116, my + 6, Math.max(9, (bw * shown) / Math.max(1, o.max)), 9, 4.5);
              g.fillStyle = p.color;
              g.fill();
            }
            const place = o.places.indexOf(seat);
            text(g, `${ord(place)}`, rx + 116 + bw + 10, my + 10, 11, "rgba(255,255,255,0.6)", "left", 800);
            numeral(g, String(Math.round(shown)), rx + rw - 18, my + 1, 30, "#ffffff", "right");
            // the points won, popping in, then flying into the total
            const gain = o.after[seat] - o.before[seat];
            const at = 0.35 + place * 0.14;
            if (pt >= at && pt < 1.35) {
              const pk = pop(clamp((pt - at) / 0.25, 0, 1));
              const fly = easeOut(clamp((pt - 1.0) / 0.3, 0, 1));
              g.save();
              g.globalAlpha = d * (1 - fly);
              g.translate(rx + rw - 96 + fly * 60, my - 2 - fly * 4);
              g.scale(pk * (1 - fly * 0.4), pk * (1 - fly * 0.4));
              toy(g, `+${gain}`, 0, 0, 26, gain > 0 ? "#ffd23f" : "#9aa0b8", { rim: false });
              g.restore();
            }
            g.restore();
          }
          // the next game (a tournament)
          if (o.next) {
            const nk = easeOut(clamp((pt - 0.5) / 0.4, 0, 1));
            g.save();
            g.globalAlpha = nk;
            g.translate((1 - nk) * 40, 0);
            const nx = 600;
            const ny = 196;
            const nw = 316;
            const nh = 178;
            g.font = `900 ${fpx(12)}px ${FONT}`;
            const lw = g.measureText(o.next.label).width + 26;
            rr(g, nx + nw / 2 - lw / 2, ny - 42, lw, 26, 13);
            g.fillStyle = "#ffd23f";
            g.fill();
            text(g, o.next.label, nx + nw / 2, ny - 28, 12, "#4a2f00", "center", 900);
            if (o.next.def) {
              g.save();
              g.translate(nx + nw / 2, ny + nh / 2);
              g.rotate(0.025 + Math.sin(t * 1.6) * 0.008);
              drawThumb(g, o.next.def, -nw / 2, -nh / 2, nw, nh);
              g.restore();
              toy(g, T(o.next.def.title, o.next.def.titleZh), nx + nw / 2, ny + nh + 34, 24, "#ffffff", { ink: tint(o.next.def.color, -0.62), rim: o.next.def.color, top: "#ffffff" });
            } else {
              mystery(g, nx, ny, nw, nh, t);
              text(g, T("drawn at random", "随机抽取"), nx + nw / 2, ny + nh + 30, 14, "rgba(255,255,255,0.7)", "center", 800);
            }
            g.restore();
          }
          // go on: A, or it goes by itself (the fill)
          const ak = easeOut(clamp((pt - 0.6) / 0.3, 0, 1));
          if (ak > 0) {
            g.save();
            g.globalAlpha = ak;
            const msg = `${touchy() ? T("Tap", "点击") : T("Press A", "按 A")} · ${o.prompt}`;
            g.font = `900 ${fpx(16)}px ${FONT}`;
            const w = g.measureText(msg).width + 48;
            const x = W / 2 - w / 2;
            const y = 486;
            rr(g, x - 2, y - 2, w + 4, 40, 20);
            g.fillStyle = INK;
            g.fill();
            rr(g, x, y, w, 36, 18);
            g.fillStyle = "#2a1f63";
            g.fill();
            g.save();
            rr(g, x, y, w, 36, 18);
            g.clip();
            g.fillStyle = tint(o.color, -0.15);
            g.fillRect(x, y, w * clamp(pt / AUTO, 0, 1), 36);
            g.restore();
            text(g, msg, W / 2, y + 19, 16, "#ffffff", "center", 900);
            g.restore();
          }
          bits.draw(g);
        },
      };
    },
    ["a"],
    true,
  );
}

/** A "?" card: the next game, still to be drawn. */
function mystery(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  rr(g, x - 7, y - 7, w + 14, h + 14, 21);
  g.fillStyle = INK;
  g.fill();
  rr(g, x - 5, y - 5, w + 10, h + 10, 19);
  g.fillStyle = "#ffffff";
  g.fill();
  g.save();
  rr(g, x, y, w, h, 14);
  g.clip();
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, "#6b4dff");
  gr.addColorStop(1, "#2a1f63");
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 0.18;
  g.fillStyle = "#fff";
  for (let i = 0; i < 6; i++) {
    const a = t * 0.6 + (i / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + w / 2, y + h / 2);
    g.arc(x + w / 2, y + h / 2, w, a, a + 0.3);
    g.fill();
  }
  g.restore();
  g.save();
  g.translate(x + w / 2, y + h / 2);
  const s = 1 + Math.sin(t * 4) * 0.06;
  g.scale(s, s);
  toy(g, "?", 0, 0, 96, "#ffd23f");
  g.restore();
}

/** The roulette: the mini-games spin past and land on the one drawn. A skips to it, and on. */
export function roulette(stage: Stage, pool: MiniDef[], pick: MiniDef, at: number, of: number, title?: string, sub?: string): Promise<boolean | null> {
  const list = pool.includes(pick) ? pool : [...pool, pick];
  return hold<boolean>(
    stage,
    (done) => {
      const n = list.length;
      const target = list.indexOf(pick);
      const total = n * 3 + target;
      const DUR = 2.3;
      let pt = 0;
      let over = false;
      let lastI = -1;
      let landed = false;
      const bits = new Bits();
      for (const d of list) thumbImg(d.key);
      partyMusic.roulette?.();
      const pos = () => total * (1 - Math.pow(1 - clamp(pt / DUR, 0, 1), 3));
      return {
        update(dt, input) {
          if (over) return;
          pt += dt;
          bits.update(dt);
          labAt("roulette", pt);
          stage.bare(true);
          const i = Math.floor(pos());
          if (i !== lastI) ((lastI = i), sfx.roll());
          if (!landed && pt >= DUR) {
            landed = true;
            sfx.star();
            bits.burst(W / 2, 260, 70, [pick.color, "#ffd23f", "#ffffff", ...SEAT], 420, 380, 7);
          }
          if (input.pressed("a")) {
            if (pt < DUR) pt = DUR;
            else if (pt > DUR + 0.3) ((over = true), done(true));
          }
          if (pt > DUR + 1.6) ((over = true), done(true));
        },
        draw(g, t) {
          backdrop(g, t, "#22165a", "#0b0820", "rgba(255,210,63,0.1)");
          partyStripes(g, t, landed ? pick.color : "#a98bff", landed ? 0.09 : 0.05);
          toy(g, title ?? T(`GAME ${at} / ${of}`, `第 ${at} / ${of} 场`), W / 2, 58, 44, "#ffd23f");
          text(g, landed ? T("Up next!", "下一场！") : (sub ?? T("Drawing the next mini-game…", "抽取下一个小游戏…")), W / 2, 102, 15, "rgba(255,255,255,0.82)", "center", 800);
          // the reel: a window, the pictures rolling up through it
          const ww = 432;
          const wh = 243;
          const wx = W / 2 - ww / 2;
          const wy = 140;
          rr(g, wx - 12, wy - 12 + 6, ww + 24, wh + 24, 26);
          g.fillStyle = "rgba(6,3,18,0.5)";
          g.fill();
          rr(g, wx - 12, wy - 12, ww + 24, wh + 24, 26);
          g.fillStyle = INK;
          g.fill();
          rr(g, wx - 9, wy - 9, ww + 18, wh + 18, 23);
          g.fillStyle = landed ? pick.color : "#ffd23f";
          g.fill();
          g.save();
          rr(g, wx, wy, ww, wh, 15);
          g.clip();
          g.fillStyle = "#120e2b";
          g.fillRect(wx, wy, ww, wh);
          const p = pos();
          const base = Math.floor(p);
          const frac = p - base;
          const step = wh + 14;
          for (let k = -1; k <= 1; k++) {
            const d = list[(((base + k) % n) + n) % n];
            const yy = wy + (k - frac) * step;
            const im = thumbImg(d.key);
            if (im) g.drawImage(im, wx, yy, ww, wh);
            else thumbFallback(g, wx, yy, ww, wh, d.color, T(d.title, d.titleZh), d.key);
          }
          // (a blur of speed: the faster, the darker the edges)
          const sp = clamp(1 - pt / DUR, 0, 1);
          if (sp > 0) {
            const sh = g.createLinearGradient(0, wy, 0, wy + wh);
            sh.addColorStop(0, `rgba(10,6,30,${0.7 * sp})`);
            sh.addColorStop(0.3, "rgba(10,6,30,0)");
            sh.addColorStop(0.7, "rgba(10,6,30,0)");
            sh.addColorStop(1, `rgba(10,6,30,${0.7 * sp})`);
            g.fillStyle = sh;
            g.fillRect(wx, wy, ww, wh);
          }
          g.restore();
          // the pointers either side
          for (const side of [-1, 1]) {
            const x = W / 2 + side * (ww / 2 + 30);
            const y = wy + wh / 2;
            g.beginPath();
            g.moveTo(x + side * 14, y - 16);
            g.lineTo(x - side * 10, y);
            g.lineTo(x + side * 14, y + 16);
            g.closePath();
            g.fillStyle = "#ffffff";
            g.fill();
            g.lineWidth = 3;
            g.strokeStyle = INK;
            g.stroke();
          }
          if (landed) {
            const lk = pop(clamp((pt - DUR) / 0.35, 0, 1));
            g.save();
            g.translate(W / 2, 440);
            g.scale(lk, lk);
            toy(g, T(pick.title, pick.titleZh), 0, 0, 44, "#ffffff", { ink: tint(pick.color, -0.62), rim: pick.color, top: "#ffffff" });
            g.restore();
            g.globalAlpha = clamp((pt - DUR - 0.2) / 0.3, 0, 1);
            text(g, T(pick.tag, pick.tagZh), W / 2, 486, 15, "rgba(255,255,255,0.85)", "center", 700);
            g.globalAlpha = 1;
          }
          bits.draw(g);
        },
      };
    },
    ["a"],
    true,
  );
}

/** The podium at the end of a match or a tournament, ranked by total (each one's points on their plate). */
export function showPodium(stage: Stage, players: Player[], order: number[], o: { prizes?: string[]; label?: string; totals?: number[] }): Promise<boolean | null> {
  return hold<boolean>(
    stage,
    (done) => {
      let pt = 0;
      let over = false;
      const podium = new Podium3D(players, order);
      const bits = new Bits();
      const human = players.findIndex((p) => p.human);
      const place = order.indexOf(human);
      if (place === 0) bits.burst(W / 2, 140, 70, [...SEAT, "#ffd23f", "#fff"], 440, 380, 7);
      podiumMusic(place);
      const end = () => {
        if (over) return;
        over = true;
        done(true);
      };
      return {
        update(dt, input) {
          if (over) return;
          pt += dt;
          bits.update(dt);
          labAt("final", pt);
          stage.bare(true);
          podium.update(dt);
          if ((pt > 0.9 && input.pressed("a")) || (human < 0 && pt > 1.5) || pt > 9) end();
        },
        view() {
          return over ? null : podium.view();
        },
        draw(g, t) {
          if (over) return;
          drawPodium3(g, t, players, order, o.prizes, pt, podium, { label: o.label, totals: o.totals });
          bits.draw(g);
        },
        dispose() {
          music.stop();
          podium.dispose();
        },
      };
    },
    ["a"],
    true,
  );
}

/** The game's colour in slow stripes over a screen. */
function partyStripes(g: CanvasRenderingContext2D, t: number, color: string, alpha: number) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  const off = (t * 24) % 80;
  for (let x = -H - 80 + off; x < W + 80; x += 80) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 34, 0);
    g.lineTo(x + 34 + H * 0.6, H);
    g.lineTo(x + H * 0.6, H);
    g.fill();
  }
  g.restore();
}
