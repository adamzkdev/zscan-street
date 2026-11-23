/**
 * Every controller the TV knows, merged: phones (over the network), two keyboard layouts and
 * gamepads. Each is a "source"; a seat (0..3) is bound to a source, and games read `pad(seat)`.
 *
 *   keyboard 1 ("kb0"): arrows · A = Enter · B = Backspace / Échap / Shift droit (also the TV remote)
 *   keyboard 2 ("kb1"): WASD (ZQSD on AZERTY) · A = Espace · B = Shift gauche / E
 *   gamepads ("gp0".."gp3"): left stick / d-pad · A = bottom button · B = right button
 *   phones ("ph:<id>"): joystick · A · B
 *
 * Call `input.frame()` once per frame (the app's loop does it) before reading.
 */

export interface PadState {
  /** Stick, each axis -1..1 (length ≤ 1). Pushing up gives y = -1. */
  x: number;
  y: number;
  /** Held now. */
  a: boolean;
  b: boolean;
  /** Pressed / released since the previous frame. */
  aDown: boolean;
  bDown: boolean;
  aUp: boolean;
  bUp: boolean;
}

export const NEUTRAL: Readonly<PadState> = Object.freeze({ x: 0, y: 0, a: false, b: false, aDown: false, bDown: false, aUp: false, bUp: false });

export type NavKey = "up" | "down" | "left" | "right" | "a" | "b";
export interface NavEvent {
  key: NavKey;
  src: string;
}

interface Raw {
  x: number;
  y: number;
  a: boolean;
  b: boolean;
  start?: boolean;
  /** Presses that happened between frames (a tap shorter than a frame still counts). */
  aTap: boolean;
  bTap: boolean;
  seen: number;
}

const KB0: Record<string, "up" | "down" | "left" | "right" | "a" | "b"> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "a",
  NumpadEnter: "a",
  Backspace: "b",
  Escape: "b",
  ShiftRight: "b",
  // smart-TV remotes' back keys come as keyCodes (handled below)
};
const KB1: Record<string, "up" | "down" | "left" | "right" | "a" | "b"> = {
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Space: "a",
  ShiftLeft: "b",
  KeyE: "b",
};

class InputHub {
  private raw = new Map<string, Raw>();
  private st = new Map<string, PadState>();
  private prev = new Map<string, { a: boolean; b: boolean }>();
  private keys = new Set<string>();
  /** seat → source id */
  seats: (string | null)[] = [null, null, null, null];
  private navHeld = new Map<string, { key: NavKey; t: number; next: number }>();
  private dirTaps: { src: string; key: NavKey }[] = [];
  private navEvents: NavEvent[] = [];
  private lastFrame = performance.now();
  /** Sources that sent something recently (for "press A to join"). */
  private attached = false;
  /** Called for every menu event (any source): the lobby, menus. */
  onAny: ((src: string, key: NavKey) => void) | null = null;
  private navListeners = new Set<(e: NavEvent) => void>();
  /** Listen to menu events (returns the unsubscribe). Listeners run inside `frame()`. */
  onNav(fn: (e: NavEvent) => void) {
    this.navListeners.add(fn);
    return () => this.navListeners.delete(fn);
  }
  /** Vibrate a phone (wired by the app to the network). */
  vibrate: (src: string, ms: number | number[]) => void = () => {};

  attach() {
    if (this.attached) return;
    this.attached = true;
    const set = (e: KeyboardEvent, on: boolean) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select")) return;
      let hit = false;
      for (const [map, src] of [
        [KB0, "kb0"],
        [KB1, "kb1"],
      ] as const) {
        const k = map[e.code] ?? (src === "kb0" && (e.keyCode === 10009 || e.keyCode === 461) ? "b" : undefined);
        if (!k) continue;
        hit = true;
        const r = this.rawOf(src);
        if (k === "a" || k === "b") {
          if (on && !r[k]) r[k === "a" ? "aTap" : "bTap"] = true;
          r[k] = on;
        } else if (on) {
          // (a tap shorter than a frame — some TV remotes — still counts once)
          if (!this.keys.has(`${src}:${k}`) && !e.repeat) this.dirTaps.push({ src, key: k });
          this.keys.add(`${src}:${k}`);
        } else this.keys.delete(`${src}:${k}`);
        r.seen = performance.now();
      }
      if (hit) e.preventDefault();
    };
    window.addEventListener("keydown", (e) => {
      if (e.repeat && !e.code.startsWith("Arrow")) {
        if (KB0[e.code] || KB1[e.code]) e.preventDefault();
        return;
      }
      set(e, true);
    });
    window.addEventListener("keyup", (e) => set(e, false));
    window.addEventListener("blur", () => {
      this.keys.clear();
      for (const id of ["kb0", "kb1"]) {
        const r = this.raw.get(id);
        if (r) r.a = r.b = false;
      }
    });
  }

  private rawOf(src: string): Raw {
    let r = this.raw.get(src);
    if (!r) {
      r = { x: 0, y: 0, a: false, b: false, aTap: false, bTap: false, seen: 0 };
      this.raw.set(src, r);
    }
    return r;
  }

  private startListeners = new Set<(src: string) => void>();
  /** START pressed (a phone's Start button, a gamepad's Start): the pause. */
  onStart(fn: (src: string) => void) {
    this.startListeners.add(fn);
    return () => this.startListeners.delete(fn);
  }

  /** A phone's state, from the network. */
  phone(cid: string, x: number, y: number, bits: number) {
    const r = this.rawOf(`ph:${cid}`);
    const start = !!(bits & 8);
    if (start && !r.start) for (const f of this.startListeners) f(`ph:${cid}`);
    r.start = start;
    const a = !!(bits & 1),
      b = !!(bits & 2);
    if (a && !r.a) r.aTap = true;
    if (b && !r.b) r.bTap = true;
    r.a = a;
    r.b = b;
    const len = Math.hypot(x, y);
    r.x = len > 1 ? x / len : x;
    r.y = len > 1 ? y / len : y;
    r.seen = performance.now();
  }
  /** A phone left: its state goes neutral. */
  phoneGone(cid: string) {
    const r = this.raw.get(`ph:${cid}`);
    if (r) Object.assign(r, { x: 0, y: 0, a: false, b: false, aTap: false, bTap: false });
  }

  private pollGamepads() {
    const gps = navigator.getGamepads?.() ?? [];
    for (const gp of gps) {
      if (!gp || !gp.connected) continue;
      const r = this.rawOf(`gp${gp.index}`);
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      let x = dz(gp.axes[0] ?? 0),
        y = dz(gp.axes[1] ?? 0);
      const bt = (i: number) => !!gp.buttons[i]?.pressed;
      if (bt(14)) x = -1;
      if (bt(15)) x = 1;
      if (bt(12)) y = -1;
      if (bt(13)) y = 1;
      const a = bt(0),
        b = bt(1) || bt(2);
      const start = bt(9);
      if (start && !r.start) for (const f of this.startListeners) f(`gp${gp.index}`);
      r.start = start;
      if (a && !r.a) r.aTap = true;
      if (b && !r.b) r.bTap = true;
      if (a || b || x || y) r.seen = performance.now();
      r.x = x;
      r.y = y;
      r.a = a;
      r.b = b;
    }
  }

  /** Once per frame: edges, stick from keys, menu navigation events. */
  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.pollGamepads();
    for (const src of ["kb0", "kb1"]) {
      const r = this.raw.get(src);
      if (!r) continue;
      const k = (d: string) => (this.keys.has(`${src}:${d}`) ? 1 : 0);
      let x = k("right") - k("left"),
        y = k("down") - k("up");
      if (x && y) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      r.x = x;
      r.y = y;
    }
    this.navEvents = [];
    for (const [src, r] of this.raw) {
      const p = this.prev.get(src) ?? { a: false, b: false };
      const aDown = r.aTap || (r.a && !p.a);
      const bDown = r.bTap || (r.b && !p.b);
      const s: PadState = { x: r.x, y: r.y, a: r.a || r.aTap, b: r.b || r.bTap, aDown, bDown, aUp: !r.a && p.a, bUp: !r.b && p.b };
      r.aTap = r.bTap = false;
      this.prev.set(src, { a: r.a, b: r.b });
      this.st.set(src, s);
      // navigation with auto-repeat
      if (aDown) this.pushNav("a", src);
      if (bDown) this.pushNav("b", src);
      const dir: NavKey | null = Math.abs(r.x) > 0.55 || Math.abs(r.y) > 0.55 ? (Math.abs(r.x) > Math.abs(r.y) ? (r.x > 0 ? "right" : "left") : r.y > 0 ? "down" : "up") : null;
      const h = this.navHeld.get(src);
      // taps that came and went between two frames
      for (const t of this.dirTaps) if (t.src === src && t.key !== dir) this.pushNav(t.key, src);
      if (!dir) this.navHeld.delete(src);
      else if (!h || h.key !== dir) {
        this.navHeld.set(src, { key: dir, t: 0, next: 0.38 });
        this.pushNav(dir, src);
      } else {
        h.t += dt;
        if (h.t >= h.next) {
          h.next += 0.11;
          this.pushNav(dir, src);
        }
      }
    }
    this.dirTaps = [];
  }
  private pushNav(key: NavKey, src: string) {
    const e = { key, src };
    this.navEvents.push(e);
    this.onAny?.(src, key);
    for (const f of [...this.navListeners]) {
      try {
        f(e);
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** This frame's menu events (from every source, or only `srcs`). */
  nav(srcs?: (string | null)[]): NavEvent[] {
    return srcs ? this.navEvents.filter((e) => srcs.includes(e.src)) : this.navEvents;
  }
  /** Menu events of the source bound to a seat. */
  navSeat(seat: number): NavEvent[] {
    const s = this.seats[seat];
    return s ? this.navEvents.filter((e) => e.src === s) : [];
  }
  /** Swallow this frame's events (a screen consumed them). */
  eatNav() {
    this.navEvents = [];
  }

  /** A source's state. */
  src(id: string | null): PadState {
    return (id && this.st.get(id)) || NEUTRAL;
  }
  /** The state of the controller in a seat (neutral if none / CPU). */
  pad(seat: number): PadState {
    return this.src(this.seats[seat]);
  }
  /** Vibrate the phone in a seat (no-op for other controllers). */
  buzz(seat: number, ms: number | number[] = 40) {
    const s = this.seats[seat];
    if (s?.startsWith("ph:")) this.vibrate(s, ms);
  }
  /** Sources seen in the last `ms`. */
  active(ms = 60000) {
    const now = performance.now();
    return [...this.raw.entries()].filter(([, r]) => now - r.seen < ms).map(([id]) => id);
  }
}

export const input = new InputHub();

/** A friendly name for a source. */
export function sourceLabel(src: string | null) {
  if (!src) return "CPU";
  if (src === "kb0") return "Clavier ⬅➡";
  if (src === "kb1") return "Clavier ZQSD";
  if (src.startsWith("gp")) return `Manette ${Number(src.slice(2)) + 1}`;
  return "Téléphone";
}
