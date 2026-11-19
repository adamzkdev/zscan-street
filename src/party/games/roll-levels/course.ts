/**
 * BIG Q ROLL's road, chunk after chunk: its floors (the holes are what is missing), what stands on it,
 * the ice on it, the pools and their rafts. A level's layout picks the chunks (easy first, denser
 * toward the goal); the run-up and the goal straight are the same everywhere.
 */
import type { Rnd } from "../../kit";
import { clamp } from "../../kit";
import { BAR, CRATE, HALF, PY, SL, START, WALL, shuffle, span, type Floor, type Level, type Mover, type Raft, type Rect, type Solid, type Swing } from "./kit";

export class Course {
  floors: Floor[] = [];
  solids: Solid[] = [];
  movers: Mover[] = [];
  swings: Swing[] = [];
  belts: Rect[] = [];
  pads: Rect[] = [];
  /** Slippery sheets (the Sprout ice road). */
  ices: Rect[] = [];
  /** Water between the floors, and the rafts gliding over it (Marina's rooftop pools). */
  pools: Rect[] = [];
  rafts: Raft[] = [];
  s = -26;
  fin = 0;
  /** Where each chunk starts (for the bench's log). */
  chunks: string[] = [];

  constructor(
    private rnd: Rnd,
    level: Level,
  ) {
    // behind the line (the Q's first face) and the run-up
    this.plain(-this.s + START + 6);
    level.layout(this, rnd);
    this.plain(5);
    this.fin = this.s;
    this.plain(40);
    this.rafts.sort((a, b) => a.s0 - b.s0);
  }

  /** Run these chunks in this order, `pad` metres of plain road after each. */
  seq(fs: (() => void)[], pad: number) {
    for (const f of fs) (this.tag(f), f(), pad > 0 && this.plain(pad));
  }
  /** `n` of these chunks, shuffled. */
  some(fs: (() => void)[], n: number, pad: number) {
    this.seq(shuffle(fs, this.rnd).slice(0, n), pad);
  }
  private tag(f: () => void) {
    const m = /this\.(\w+)\(([^)]*)\)|c\.(\w+)\(([^)]*)\)/.exec(f.toString());
    const name = m ? (m[1] ?? m[3]) : "?";
    const arg = m ? (m[2] ?? m[4] ?? "") : "";
    this.chunks.push(`${name}${arg ? ":" + arg.replace(/[^\w.]/g, "") : ""}@${this.s.toFixed(0)}`);
  }
  pick<X>(a: X[]) {
    return a[Math.floor(this.rnd() * a.length) % a.length];
  }
  private floor(s0: number, s1: number, x0 = -HALF, x1 = HALF, wood = false) {
    this.floors.push({ s0, s1, x0, x1, wood });
  }
  private solid(s0: number, s1: number, x0: number, x1: number, h: number, kind: number) {
    this.solids.push({ s0, s1, x0, x1, h, kind, n: -1, dead: false });
  }
  private pad(s: number, x: number) {
    this.pads.push({ s0: s, s1: s + 1.8, x0: x - 0.9, x1: x + 0.9 });
  }
  private ice(s0: number, s1: number, x0 = -HALF, x1 = HALF) {
    this.ices.push({ s0, s1, x0, x1 });
  }
  plain(len: number) {
    this.floor(this.s, this.s + len);
    this.s += len;
  }

  // ---- the sky road's chunks (every level uses some) ---------------------------------------------

  /** Rows of crates, always two lanes free, the way through never more than `shift` lanes over from the last. */
  crates(rows: number, step = 6.2, shift = 2) {
    const s = this.s;
    this.plain(rows * step + 2);
    const lanes = [-3.15, -1.6, 0, 1.6, 3.15];
    let open = Math.floor(this.rnd() * 4);
    for (let k = 0; k < rows; k++) {
      const sr = s + 2.2 + k * step;
      if (k) open = clamp(open + this.pick(shift > 1 ? [-2, -1, 1, 2] : [-1, 1]), 0, 3);
      const rest = shuffle([0, 1, 2, 3, 4].filter((l) => l !== open && l !== open + 1), this.rnd);
      const n = rows > 2 ? 2 + (this.rnd() < 0.5 ? 1 : 0) : 1 + (this.rnd() < 0.6 ? 1 : 0);
      for (let i = 0; i < Math.min(n, rest.length); i++) {
        const x = lanes[rest[i]] + (this.rnd() - 0.5) * 0.2;
        const ds = (this.rnd() - 0.5) * 0.5;
        this.solid(sr + ds, sr + ds + 1.4, x - 0.7, x + 0.7, this.rnd() < 0.3 ? 2.8 : 1.4, CRATE);
      }
    }
  }
  gap(g: number) {
    const s = this.s;
    this.floor(s, s + 3);
    this.floor(s + 3 + g, s + 7 + g);
    this.s = s + 7 + g;
  }
  /** Walls from a kerb (or in the middle), the opening on alternate sides. */
  walls(k: number, step: number) {
    const s = this.s;
    this.plain(3 + k * step);
    let side = this.rnd() < 0.5 ? -1 : 1;
    for (let i = 0; i < k; i++) {
      const sw = s + 2.5 + i * step;
      if (k > 2 && i === 1 && this.rnd() < 0.5) this.solid(sw, sw + 0.9, -2.1, 2.1, 2.3, WALL);
      else if (side < 0) this.solid(sw, sw + 0.9, -HALF, HALF - 3.5, 2.3, WALL);
      else this.solid(sw, sw + 0.9, -HALF + 3.5, HALF, 2.3, WALL);
      side = -side;
    }
  }
  bar() {
    const s = this.s;
    this.plain(9);
    this.solid(s + 4.5, s + 5, -HALF, HALF, 0.8, BAR);
  }
  boosts() {
    const s = this.s;
    this.plain(13);
    const a = this.pick([-2.4, 0, 2.4]);
    this.pad(s + 2.5, a);
    this.pad(s + 8, this.pick([-2.4, 0, 2.4].filter((x) => x !== a)));
  }
  belt() {
    const s = this.s;
    this.plain(17);
    this.belts.push({ s0: s + 2.5, s1: s + 15, x0: -HALF, x1: HALF });
    const a = this.pick([-2.4, 0, 2.4]);
    this.pad(s + 0.6, a);
    this.pad(s + 8.5, this.pick([-2.4, 0, 2.4].filter((x) => x !== a)));
  }
  bridge(kind: "one" | "twin" | "zig", len = 12) {
    const s = this.s;
    this.floor(s, s + 2.5);
    const b = s + 2.5;
    if (kind === "one") this.floor(b, b + len, ...span(this.pick([-1.5, 0, 1.5]), 2.6), true);
    else if (kind === "twin") (this.floor(b, b + len, -3.6, -1.4, true), this.floor(b, b + len, 1.4, 3.6, true));
    else {
      const d = this.rnd() < 0.5 ? 1 : -1;
      this.floor(b, b + 5, ...span(-1.9 * d, 2.6), true);
      this.floor(b + 3.5, b + 8.5, -1.3, 1.3, true);
      this.floor(b + 7, b + len, ...span(1.9 * d, 2.6), true);
    }
    this.floor(b + len, b + len + 2.5);
    this.s = b + len + 2.5;
  }
  holes(rows: number) {
    let s = this.s;
    this.floor(s, s + 2.5);
    s += 2.5;
    const LX = [
      [-HALF, -1.4],
      [-1.4, 1.4],
      [1.4, HALF],
    ];
    let prev = -1;
    for (let k = 0; k < rows; k++) {
      let l = Math.floor(this.rnd() * 3);
      if (l === prev) l = (l + 1 + Math.floor(this.rnd() * 2)) % 3;
      prev = l;
      this.floor(s, s + 2.6, LX[l][0], LX[l][1]);
      if (rows < 3 && this.rnd() < 0.5) {
        const l2 = (l + 1 + Math.floor(this.rnd() * 2)) % 3;
        this.floor(s, s + 2.6, LX[l2][0], LX[l2][1]);
      }
      s += 2.6;
      this.floor(s, s + 2.8);
      s += 2.8;
    }
    this.s = s;
  }
  pushers(n: number, om: number) {
    const s = this.s;
    this.plain(3 + n * 5);
    const ph = this.rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) this.movers.push({ s: s + 3.5 + i * 5, d: 1.6, w: 2.2, h: 1.9, amp: HALF - 1.25, om, ph: ph + i * 2.1, x: 0, vx: 0, dead: false });
  }
  private mkSwing(s: number, ph: number): Swing {
    return { s, amp: 0.95, om: 2.4, ph, a: 0, bx: 0, by: PY - SL, bvx: 0, dead: false };
  }
  swing(n: number) {
    const s = this.s;
    this.plain(n === 1 ? 12 : 18);
    const ph = this.rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) this.swings.push(this.mkSwing(s + 6 + i * 6.5, ph + i * Math.PI));
  }
  bridgeSwing() {
    const s = this.s;
    this.floor(s, s + 2.5);
    const b = s + 2.5;
    const len = 13;
    this.floor(b, b + len, -1.5, 1.5, true);
    this.swings.push(this.mkSwing(b + len / 2, this.rnd() * Math.PI * 2));
    this.floor(b + len, b + len + 2.5);
    this.s = b + len + 2.5;
  }
  gapCrates() {
    this.gap(2.8);
    this.crates(2);
  }
  doubleGap() {
    const s = this.s;
    this.floor(s, s + 3);
    this.floor(s + 5.4, s + 8.6);
    this.floor(s + 11.4, s + 15.4);
    this.s = s + 15.4;
  }
  barGap() {
    const s = this.s;
    this.floor(s, s + 7.5);
    this.solid(s + 2.5, s + 3, -HALF, HALF, 0.8, BAR);
    this.floor(s + 10, s + 14);
    this.s = s + 14;
  }

  // ---- the Sprout ice road: ice ---------------------------------------------------------------------------------

  /** Crates on an ice sheet: wider rows, the way through one lane over at most (a slide needs room). */
  rink(rows: number) {
    const s = this.s;
    this.crates(rows, 7.6, 1);
    this.ice(s + 0.8, this.s - 0.4);
  }
  /** Walls from the kerbs on an ice sheet: turn early or slide into them. */
  iceSlalom(k: number) {
    const s = this.s;
    this.walls(k, 9.5);
    this.ice(s + 0.5, this.s - 0.3);
  }
  /** The river broken into floes: rows of ice with open water between, a crack down each row (`cracks`). */
  floes(rows: number, cracks = true) {
    let s = this.s;
    this.floor(s, s + 2.5);
    s += 2.5;
    let prev = 0;
    for (let k = 0; k < rows; k++) {
      s += 1.4 + this.rnd() * 0.4;
      const len = 4.3 + this.rnd() * 0.6;
      if (!cracks) {
        this.floor(s, s + len);
        this.ice(s, s + len);
        s += len;
        continue;
      }
      // (the crack: somewhere off the middle of the last one's, never the whole road)
      let cx = (this.rnd() * 2 - 1) * 1.6;
      if (Math.abs(cx - prev) < 0.9) cx = clamp(prev + (cx >= prev ? 1.2 : -1.2), -2, 2);
      prev = cx;
      const w = 0.7 + this.rnd() * 0.2;
      if (k === rows - 1 || this.rnd() < 0.65) {
        this.floor(s, s + len, -HALF, cx - w / 2);
        this.floor(s, s + len, cx + w / 2, HALF);
        this.ice(s, s + len, -HALF, cx - w / 2);
        this.ice(s, s + len, cx + w / 2, HALF);
      } else {
        // (one floe off to a side)
        const side = cx < 0 ? 1 : -1;
        const x0 = side > 0 ? -1.2 : -HALF,
          x1 = side > 0 ? HALF : 1.2;
        this.floor(s, s + len, x0, x1);
        this.ice(s, s + len, x0, x1);
      }
      s += len;
    }
    s += 1.6;
    this.floor(s, s + 3);
    this.s = s + 3;
  }

  // ---- Marina: rooftops and pools -------------------------------------------------------------

  /** Shophouse roofs with a gap between each, some (`narrow`) only part of the road wide. */
  roofs(n: number, narrow = true) {
    let s = this.s;
    this.floor(s, s + 2);
    s += 2;
    let last = 0;
    for (let k = 0; k < n; k++) {
      s += 1.7 + this.rnd() * 0.7;
      const len = 5 + this.rnd() * 1.6;
      let kind = narrow ? Math.floor(this.rnd() * 3) - 1 : 0;
      if (kind !== 0 && kind === last) kind = -kind;
      last = kind;
      if (kind < 0) this.floor(s, s + len, -HALF, 1.3);
      else if (kind > 0) this.floor(s, s + len, -1.3, HALF);
      else this.floor(s, s + len);
      s += len;
    }
    s += 1.8;
    this.floor(s, s + 2.5);
    this.s = s + 2.5;
  }
  /** Two roof strips with an alley between (a shove's chance), a water tank on each, a plank across. */
  alley() {
    const s = this.s;
    this.floor(s, s + 2.5);
    const b = s + 2.5,
      len = 14;
    this.floor(b, b + len, -HALF, -0.9);
    this.floor(b, b + len, 0.9, HALF);
    this.floor(b + 6.2, b + 7.6, -0.95, 0.95, true);
    const d = this.rnd() < 0.5 ? 1 : -1;
    this.solid(b + 2.4, b + 3.8, ...span(d * (HALF - 0.7), 1.3), 1.4, CRATE);
    this.solid(b + 9.6, b + 11, ...span(-d * (HALF - 0.7), 1.3), 1.4, CRATE);
    this.floor(b + len, b + len + 2.5);
    this.s = b + len + 2.5;
  }
  /**
   * A rooftop pool: `lanes` lanes of water, a raft gliding side to side in each; jump on, ride, jump off.
   * `om`: how fast they glide (rad/s); `w`: how wide they are; `lag`: each lane's raft follows the
   * last one's this late (s): a hop's time and the next raft is where you left (a wave), less and it
   * is a wait.
   */
  pool(lanes: number, om: number, w: number, lag = 0.55) {
    const s = this.s;
    this.floor(s, s + 2.5);
    let a = s + 2.5;
    const p0 = a;
    const amp = HALF - w / 2 - 0.05;
    let ph = this.rnd() * Math.PI * 2;
    for (let k = 0; k < lanes; k++) {
      a += 1.1;
      const d = 3.6;
      this.rafts.push({ s0: a, s1: a + d, w, amp, om, ph, x: 0, vx: 0, dead: false, sink: 0 });
      ph -= om * lag;
      a += d;
    }
    a += 1.1;
    this.pools.push({ s0: p0, s1: a, x0: -HALF, x1: HALF });
    this.floor(a, a + 2.5);
    this.s = a + 2.5;
  }
}
