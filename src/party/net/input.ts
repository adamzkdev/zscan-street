/**
 * One seat's input for one lockstep tick, packed in an int32 (JSON-friendly, 4 bytes on the wire):
 *
 *   bits 0–5    the buttons held (left, right, up, down, a, b)
 *   bits 6–11   the buttons pressed since the last tick (the edges: `pressed()`)
 *   bits 12–19  the stick's x, int8 (−127…127; the arrows give ±127)
 *   bits 20–27  the stick's y, int8
 *
 * A neutral frame (nothing held, stick centred) is 0. NetInput reads a frame back through kit's
 * Input API, so a game reads a remote seat exactly as it reads the keyboard.
 */
import { Input, type Btn } from "../kit";
import { cos, sin } from "./det";

export const BTNS: readonly Btn[] = ["left", "right", "up", "down", "a", "b"];
const BIT: Record<Btn, number> = { left: 0, right: 1, up: 2, down: 3, a: 4, b: 5 };

/** Nothing held, the stick centred. */
export const NEUTRAL = 0;

const i8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)));

/** A frame from what is held, what was just pressed (bit masks), and the stick (−1…1). */
export function pack(held: number, edges: number, x: number, y: number): number {
  return (held & 63) | ((edges & 63) << 6) | ((i8(x) & 0xff) << 12) | ((i8(y) & 0xff) << 20);
}
export const heldOf = (f: number) => f & 63;
export const edgesOf = (f: number) => (f >> 6) & 63;
export const stickX = (f: number) => ((f << 12) >> 24) / 127;
export const stickY = (f: number) => ((f << 4) >> 24) / 127;
/** The same buttons held and the same stick, no new presses (a frame repeated to fill a gap). */
export const hold = (f: number) => f & ~(63 << 6);

/** What a device offers to be sampled: kit's Input, or a pad of the bench's own. */
export interface Pad {
  held(b: Btn): boolean;
  pressed(b: Btn): boolean;
  axis(): { x: number; y: number };
}

/**
 * Turns a device's input into one frame per sim tick. The stage ticks the device's Input once per
 * screen refresh (120 Hz on ProMotion), so a press can be "pressed" during a refresh no sim tick
 * samples: `frame()` gathers every press, `take()` hands them to the next tick. `pressed()` keeps its
 * meaning: true for exactly one tick per press.
 */
export class Sampler {
  private edges = 0;
  constructor(public pad: Pad) {}
  /** Every screen refresh, after the device's input has ticked. */
  frame() {
    for (let i = 0; i < 6; i++) if (this.pad.pressed(BTNS[i])) this.edges |= 1 << i;
  }
  /** One tick's frame: what is held now, every press gathered since the last one (call frame() first). */
  take(): number {
    let held = 0;
    for (let i = 0; i < 6; i++) if (this.pad.held(BTNS[i])) held |= 1 << i;
    const a = this.pad.axis();
    const f = pack(held, this.edges, a.x, a.y);
    this.edges = 0;
    return f;
  }
}

/** A seat's input in the sim: its frame for the tick being run (the same on every client). */
export class NetInput extends Input {
  private f = NEUTRAL;
  /** The frame of the tick about to run. */
  set(frame: number) {
    this.f = frame;
  }
  get frame() {
    return this.f;
  }
  override held(b: Btn) {
    return ((this.f >> BIT[b]) & 1) === 1;
  }
  override pressed(b: Btn) {
    return ((this.f >> (6 + BIT[b])) & 1) === 1;
  }
  override axis() {
    return { x: stickX(this.f), y: stickY(this.f) };
  }
  // (fed by the lockstep only: the device's keys and the stage's ticks have no say)
  override press() {}
  override release() {}
  override setStick() {}
  override tick() {}
  override clear() {}
  override attach() {}
  override detach() {}
}

/**
 * A pad on part of the keyboard, for two players at one keyboard (the bench's `&net=loop&humans=2`):
 * its own keys, pressed() true once per press until the next tick().
 */
export class KeyPad implements Pad {
  private down = new Set<Btn>();
  private hits = new Set<Btn>();
  private next = new Set<Btn>();
  private off: () => void;
  constructor(map: Record<string, Btn>) {
    const kd = (e: KeyboardEvent) => {
      const b = map[e.code];
      if (!b) return;
      if (!e.repeat) (this.down.add(b), this.next.add(b));
    };
    const ku = (e: KeyboardEvent) => {
      const b = map[e.code];
      if (b) this.down.delete(b);
    };
    const blur = () => this.down.clear();
    window.addEventListener("keydown", kd, true);
    window.addEventListener("keyup", ku, true);
    window.addEventListener("blur", blur);
    this.off = () => (window.removeEventListener("keydown", kd, true), window.removeEventListener("keyup", ku, true), window.removeEventListener("blur", blur));
  }
  held(b: Btn) {
    return this.down.has(b);
  }
  pressed(b: Btn) {
    return this.hits.has(b);
  }
  axis() {
    return { x: (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0), y: (this.held("down") ? 1 : 0) - (this.held("up") ? 1 : 0) };
  }
  /** Once per screen refresh, as the stage ticks its Input. */
  tick() {
    this.hits = this.next;
    this.next = new Set();
  }
  dispose() {
    this.off();
  }
}

/** Player 1 at a shared keyboard: the arrows, Enter (A), right Shift (B). */
export const ARROWS: Record<string, Btn> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Enter: "a", NumpadEnter: "a", ShiftRight: "b", Slash: "b" };
/** Player 2: WASD, Space (A), left Shift (B). */
export const WASD: Record<string, Btn> = { KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down", Space: "a", KeyF: "a", ShiftLeft: "b", KeyG: "b" };

/**
 * A scripted player for tests and the bench: wanders with the stick, changing its mind now and then,
 * and taps A (or B) at random. Seeded, so a test run is the same every time.
 */
export class BotPad implements Pad {
  private x = 0;
  private y = 0;
  private hold = 0;
  private hits = 0;
  private downs = 0;
  constructor(private rnd: () => number) {}
  /** One sim tick of its mind (called before the sampler takes the tick's frame). */
  step() {
    this.hits = 0;
    if (--this.hold <= 0) {
      this.hold = 6 + Math.floor(this.rnd() * 40);
      const r = this.rnd();
      if (r < 0.15) this.x = this.y = 0;
      else if (r < 0.55) {
        // the arrows: whole directions
        this.x = Math.floor(this.rnd() * 3) - 1;
        this.y = Math.floor(this.rnd() * 3) - 1;
      } else {
        // a stick's lean
        // (det's cos and sin: a cross-engine test feeds every engine the same stick)
        const a = this.rnd() * Math.PI * 2,
          m = 0.3 + this.rnd() * 0.7;
        this.x = cos(a) * m;
        this.y = sin(a) * m;
      }
    }
    this.downs &= ~(1 << 4 | 1 << 5);
    if (this.rnd() < 0.04) ((this.hits |= 1 << 4), (this.downs |= 1 << 4));
    if (this.rnd() < 0.01) ((this.hits |= 1 << 5), (this.downs |= 1 << 5));
  }
  held(b: Btn) {
    if (b === "a" || b === "b") return ((this.downs >> BIT[b]) & 1) === 1;
    return b === "left" ? this.x < -0.5 : b === "right" ? this.x > 0.5 : b === "up" ? this.y < -0.5 : this.y > 0.5;
  }
  pressed(b: Btn) {
    return ((this.hits >> BIT[b]) & 1) === 1;
  }
  axis() {
    return { x: this.x, y: this.y };
  }
}
