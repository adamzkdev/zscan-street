/**
 * Deterministic lockstep for ZK PARTY's real-time mini-games, delay-based (no rollback).
 *
 * Every client runs the same mini-game from the same seed, at the same fixed 60 Hz ticks, fed the
 * same inputs for every seat; each draws it with its own player as "you". A tick only runs once every
 * person's input for it is in, so a client never guesses: there is nothing to roll back.
 *
 *   local input ──sample at tick T──▶ frame for tick T+D ──batched every 2 ticks──▶ relay (server order)
 *   every client: tick T runs once all people's frames for T are in; AIs think locally, deterministically
 *
 * - D, the input delay, is this device's own choice (each stream only has to stay gapless): it starts
 *   at `delay.start` (the same on every client: ticks 0…start−1 are neutral for everyone), then follows
 *   the round trips it measures to its peers (pings through the relay), between `delay.min` and
 *   `delay.max`; a peer that had to wait for us says so, and we add a tick.
 * - A tick whose frames are not all in waits: the sim stalls, the screen keeps drawing, and after half
 *   a second the host shows "waiting for players".
 * - A client that is ahead of its peers runs a little slower (5 %) until they catch up, so the leader
 *   does not stall in bursts.
 * - Every 30 ticks each client sends a checksum of the sim (Mini.hash()); a mismatch is logged loudly.
 *   The lowest connected person's seat is the host: its result() is the one the board scores.
 * - A seat whose client leaves (`leave()`, or its own "bye") plays neutral input from the last tick it
 *   sent, and the match hands it to the AI at that tick (match.ts): the same tick on every client,
 *   because the notice comes through the same ordered relay as its inputs.
 *
 * The sim runs inside Det (det.ts): fdlibm maths instead of the engine's, a seeded Math.random, and
 * performance.now()/Date.now() on the sim's clock. Drawing runs on the native ones.
 *
 * ==== Converting a mini-game (the pilot: games/coins.ts) ============================================
 *
 * Offline play must not change: every step below keeps the old path when `p.input` is unset.
 *
 * 1. Who is who. `p.human` now means "a person plays this seat, here or online" (the same on every
 *    client); `isLocal(p)` (kit.ts) means "this device's player". Go through every `human`:
 *    - input instead of the AI brain, AI leniency toward people, rules about people: keep `p.human`;
 *    - camera follow, "YOU", HUD, red/gold screen flashes, the player's own sounds, combo jingles,
 *      shake strength: `isLocal(p)`;
 *    - a single `this.human = players.findIndex(p => p.human)`: rename it (`this.you`, via isLocal)
 *      and check every read: the sim must never read it. If a rule needs "the" person (kart's
 *      rubber-banding, bumper's grace period), make it per seat over every `p.human`.
 * 2. Per-seat input. Where a person's seat reads `input`, read `inputOf(p, input)` instead (kit.ts):
 *    its own NetInput online, the device's offline. Several people may be in the game: no single
 *    control object (kart's `hctrl`, qball's `ctl`), no single "last direction" field; keep them per seat.
 * 3. Screen-relative controls. Online, never read the eased, shaking, local camera to turn a stick
 *    into a direction: compute the basis from where that seat's own camera aims (a pure function of
 *    the sim state, coins' `playCam(seat)`), or use a constant when the camera never turns (bumper,
 *    turf, qball: eye.x == at.x). Offline, keep reading the live camera.
 * 4. Randomness. Sim decisions use the seeded `rnd` from make() (already the rule). Math.random in the
 *    sim is seeded too, reseeded every tick, but it must be called the same number of times on every
 *    client: never behind `isLocal`, a camera distance, or anything only one screen knows (run.ts's
 *    near() draws `rnd` depending on the local camera: a desync). Particles (Fx3, Bits) and kit's
 *    sfx already step outside the sim's stream; your own synth code that calls Math.random should be
 *    wrapped in `Det.free(() => …)`.
 * 5. Time. No setTimeout/setInterval for game state (a tick-counted timer instead); performance.now()
 *    and Date.now() read the sim's clock during a tick, so they are fine. No `x ** y`: the operator
 *    cannot be patched (use x * x, or Math.pow). No reads of window size, canvas size, DOM, or audio
 *    time in update() (beat.ts's song clock must become the tick count).
 * 6. idle(). The card and the countdown are lockstep ticks too: idle(dt, phase, k) may move state,
 *    but online its `input` is empty; a countdown charge reads `inputOf(p, input)` per seat.
 * 7. humanOut(). Online the host never fast-forwards (each client would decide on its own).
 * 8. hash(). Add `hash()` (net/hash.ts' Hasher): every position, velocity, timer and score the sim
 *    reads, never cameras, particles or HUD state. The bench's lockstep test then proves the rest:
 *      partylab.html?nettest=<game>  (and in Node and JavaScriptCore: src/party/net/test/run.mjs)
 * 9. Module-level state (forge's LV, planet's R): fine for one sim per page, but the tests run four
 *    clients in one page; move it onto the instance.
 */
import { NEUTRAL, hold } from "./input";
import type { NetMsg, Transport } from "./transport";

/** The sim's fixed step: 60 Hz whatever the screen's refresh rate. */
export const TICK = 1 / 60;
export const TICK_MS = 1000 / 60;

export interface DelayOpts {
  /** The delay every client starts with, in ticks: a constant of the session, the same everywhere. */
  start?: number;
  /** The bounds the adaptive delay moves in (min = max: a fixed delay). */
  min?: number;
  max?: number;
}

export interface LockstepOpts {
  transport: Transport;
  /** The seats people play (online or here), and those played on this device (one, usually). */
  humans: number[];
  local: number[];
  /** Ticks of input delay: a number fixes it; else adaptive (start 6, between 3 and 12). */
  delay?: number | DelayOpts;
  /** Frames per input message (2). */
  batch?: number;
  /** Ticks between checksums (30: twice a second). */
  hashEvery?: number;
  /** A real-time clock in ms (pings, stalls); the browser's by default, a test's virtual one. */
  now?: () => number;
  /** Who is speaking in the logs. */
  name?: string;
}

/** A checksum that did not match: ours and another client's at the same tick. */
export interface Desync {
  tick: number;
  seat: number;
  mine: number;
  theirs: number;
}

type Msg =
  | { k: "hi"; s: number[]; seen: number[] }
  | { k: "i"; s: number[]; t: number; f: number[][]; c: number }
  | { k: "h"; s: number; t: number; h: number }
  | { k: "r"; s: number; t: number; o: number[] }
  | { k: "p"; s: number; n: number; w: number[] }
  | { k: "q"; s: number; to: number; n: number }
  | { k: "b"; s: number[] };

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

export class Lockstep {
  readonly humans: number[];
  readonly local: number[];
  /** This client's name on the wire: its first seat. */
  readonly me: number;
  /** The next tick to run. */
  cur = 0;
  /** The input delay now (ticks). */
  D: number;
  /** The delay every client started with: ticks 0…P−1 are neutral for everyone. */
  readonly P: number;
  private minD: number;
  private maxD: number;
  private batch: number;
  private hashEvery: number;
  private now: () => number;
  private tag: string;
  private tr: Transport;
  private off: () => void;
  /** Every person's frames by tick, the last tick known for each, and when a leaver last played. */
  private frames = new Map<number, number[]>();
  private known = new Map<number, number>();
  private gone = new Map<number, number>();
  /** The last tick this device has made frames for, and the frames not sent yet. */
  private sent: number;
  private pend: number[][] = [];
  private pendT = 0;
  /** The start: whom we have heard from, and who has heard from us. */
  private heard = new Set<number>();
  private heardBy = new Set<number>();
  started = false;
  private hiAt = -1e9;
  /** Real time stalled since the last tick ran (ms), and the accumulator of real time to run. */
  stallMs = 0;
  private acc = 0;
  /** Checksums: ours and the others', by tick. */
  private mine = new Map<number, number>();
  private theirs = new Map<number, Map<number, number>>();
  readonly desyncs: Desync[] = [];
  /** The checks that matched (the tests count them), and every checksum we made, in order. */
  checks = 0;
  readonly hashLog: [number, number][] = [];
  /** Results: ours, and those the others sent (the host's is the one that counts). */
  private myResult: number[] | null = null;
  private results = new Map<number, number[]>();
  /** Pings: when each went, the round trips to each peer (ms), the peers we waited for since the last ping. */
  private pingN = 0;
  private pingAt = -1e9;
  private pings = new Map<number, number>();
  private rtt = new Map<number, number[]>();
  private waitedOn = new Set<number>();
  private late = 0;
  private lowerOk = 0;
  /** Where each peer was (its tick, when we heard): the pace of the one ahead. */
  private peerAt = new Map<number, { c: number; at: number }>();
  /** For the report: ticks run, frames stalled, the longest stall, the delay's range, messages sent. */
  readonly stats = { ticks: 0, stalls: 0, maxStallMs: 0, minD: 0, maxD: 0, sent: 0, slowed: 0 };

  constructor(o: LockstepOpts) {
    this.humans = [...o.humans].sort((a, b) => a - b);
    this.local = [...o.local].sort((a, b) => a - b);
    if (!this.local.length) throw new Error("lockstep: no local seat");
    this.me = this.local[0];
    const d = typeof o.delay === "number" ? { start: o.delay, min: o.delay, max: o.delay } : (o.delay ?? {});
    this.P = d.start ?? 6;
    this.minD = d.min ?? 3;
    this.maxD = Math.max(this.minD, d.max ?? 12);
    this.D = this.P;
    this.stats.minD = this.stats.maxD = this.D;
    this.batch = o.batch ?? 2;
    this.hashEvery = o.hashEvery ?? 30;
    this.now = o.now ?? (() => performance.now());
    this.tag = o.name ?? `seat ${this.me}`;
    this.tr = o.transport;
    // (ticks 0…P−1: neutral for every person, on every client)
    for (const s of this.humans) {
      this.frames.set(s, new Array(this.P).fill(NEUTRAL));
      this.known.set(s, this.P - 1);
    }
    this.sent = this.P - 1;
    for (const s of this.local) this.heard.add(s);
    this.off = this.tr.onMessage((m) => this.receive(m));
  }

  // ---- the wire -------------------------------------------------------------------------------------

  private send(m: Msg) {
    this.stats.sent++;
    this.tr.send(m);
  }

  private receive(m: NetMsg) {
    const d = m.data as Msg;
    if (!d || typeof d !== "object") return;
    switch (d.k) {
      case "hi": {
        if (d.s.every((s) => this.local.includes(s))) return;
        for (const s of d.s) this.heard.add(s);
        if (d.seen.includes(this.me)) for (const s of d.s) this.heardBy.add(s);
        return;
      }
      case "i": {
        // (our own, echoed: we have them)
        if (d.s.some((s) => this.local.includes(s))) return;
        d.s.forEach((s, j) => {
          const fr = this.frames.get(s);
          if (!fr || this.gone.has(s)) return;
          const list = d.f[j];
          for (let k = 0; k < list.length; k++) fr[d.t + k] = list[k];
          const last = d.t + list.length - 1;
          if (last > (this.known.get(s) ?? -1)) this.known.set(s, last);
        });
        this.peerAt.set(d.s[0], { c: d.c, at: this.now() });
        return;
      }
      case "h": {
        if (this.local.includes(d.s)) return;
        let m2 = this.theirs.get(d.t);
        if (!m2) this.theirs.set(d.t, (m2 = new Map()));
        m2.set(d.s, d.h);
        this.compare(d.t);
        return;
      }
      case "r": {
        if (this.local.includes(d.s)) return;
        this.results.set(d.s, d.o);
        this.compareResult();
        return;
      }
      case "p": {
        if (d.s === this.me || this.local.includes(d.s)) return;
        // (a pong at once: the round trip is the relay's, not our frame rate's)
        this.send({ k: "q", s: this.me, to: d.s, n: d.n });
        if (d.w.some((s) => this.local.includes(s))) this.late++;
        return;
      }
      case "q": {
        if (d.to !== this.me) return;
        const at = this.pings.get(d.n);
        if (at === undefined) return;
        const r = this.now() - at;
        const list = this.rtt.get(d.s) ?? [];
        list.push(r);
        if (list.length > 16) list.shift();
        this.rtt.set(d.s, list);
        return;
      }
      case "b": {
        for (const s of d.s) this.leave(s);
        return;
      }
    }
  }

  /** The frames made since the last message, out. */
  private flush() {
    if (!this.pend.length || !this.pend[0].length) return;
    this.send({ k: "i", s: this.local, t: this.pendT, f: this.pend, c: this.cur });
    this.pend = [];
  }

  // ---- the ticks ------------------------------------------------------------------------------------

  /** Seat `s`'s frame for tick `t` (neutral once it has left). */
  frame(s: number, t: number): number {
    const g = this.gone.get(s);
    if (g !== undefined && t > g) return NEUTRAL;
    return this.frames.get(s)?.[t] ?? NEUTRAL;
  }

  /** Has seat `s` left by tick `t` (its client gone, the AI plays it)? */
  left(s: number, t: number) {
    const g = this.gone.get(s);
    return g !== undefined && t > g;
  }

  /** Every person's frame for tick `t` is in. */
  ready(t = this.cur) {
    for (const s of this.humans) {
      if (this.left(s, t)) continue;
      if ((this.known.get(s) ?? -1) < t) return false;
    }
    return true;
  }

  /** The seats tick `cur` is waiting for. */
  waitingFor(): number[] {
    if (!this.started) return this.humans.filter((s) => !this.heard.has(s) && !this.gone.has(s));
    return this.humans.filter((s) => !this.left(s, this.cur) && (this.known.get(s) ?? -1) < this.cur);
  }

  /**
   * Run one tick if it can: first this device's frames up to cur + D (sampled now, a gap left by a
   * longer delay filled with the last frame held), then the tick itself once every frame is in.
   */
  step(sample: (seat: number) => number, run: (tick: number) => void, hash?: () => number): boolean {
    const want = this.cur + this.D;
    while (this.sent < want) {
      this.sent++;
      if (!this.pend.length) {
        this.pend = this.local.map(() => []);
        this.pendT = this.sent;
      }
      this.local.forEach((s, j) => {
        const fr = this.frames.get(s)!;
        const f = this.sent === want ? sample(s) : hold(fr[this.sent - 1] ?? NEUTRAL);
        fr[this.sent] = f;
        this.known.set(s, this.sent);
        this.pend[j].push(f);
      });
      if (this.pend[0].length >= this.batch) this.flush();
    }
    if (!this.ready()) {
      // (what we have made goes out now: a peer may be waiting on it)
      this.flush();
      for (const s of this.waitingFor()) this.waitedOn.add(s);
      return false;
    }
    run(this.cur);
    if (hash && this.cur % this.hashEvery === 0) this.check(this.cur, hash());
    this.cur++;
    this.stats.ticks++;
    return true;
  }

  /**
   * One screen frame: run the ticks `dt` seconds of real time are worth (at most 4; a long hitch slows
   * the sim rather than racing it). Returns how many ran.
   */
  advance(dt: number, sample: (seat: number) => number, run: (tick: number) => void, hash?: () => number): number {
    const now = this.now();
    if (!this.started) {
      this.greet(now);
      if (!this.started) {
        this.stallMs += dt * 1000;
        return 0;
      }
    } else if (this.heardBy.size < this.humans.length - this.local.length) this.greet(now);
    this.ping(now);
    this.acc += dt * this.pace(now);
    let n = 0;
    while (this.acc >= TICK && n < 4) {
      if (!this.step(sample, run, hash)) {
        this.acc = Math.min(this.acc, TICK);
        if (!n) {
          this.stallMs += dt * 1000;
          this.stats.stalls++;
          this.stats.maxStallMs = Math.max(this.stats.maxStallMs, this.stallMs);
        }
        return n;
      }
      this.acc -= TICK;
      n++;
    }
    if (this.acc > TICK * 2) this.acc = TICK * 2;
    if (n) this.stallMs = 0;
    if (n && this.cur % 30 < n) this.adapt();
    return n;
  }

  /** Hello until everyone has heard us; start once we have heard everyone. */
  private greet(now: number) {
    if (now - this.hiAt >= 250) {
      this.hiAt = now;
      this.send({ k: "hi", s: this.local, seen: [...this.heard] });
    }
    if (!this.started && this.humans.every((s) => this.heard.has(s) || this.gone.has(s))) this.started = true;
  }

  // ---- the delay and the pace ---------------------------------------------------------------------------

  private ping(now: number) {
    if (now - this.pingAt < 500 || this.humans.length <= this.local.length) return;
    this.pingAt = now;
    const n = ++this.pingN;
    this.pings.set(n, now);
    this.pings.delete(n - 40);
    this.send({ k: "p", s: this.me, n, w: [...this.waitedOn] });
    this.waitedOn.clear();
  }

  /**
   * The delay for the slowest peer: half its slow round trip (90th percentile, jitter in it), one tick
   * for the batching and one for the frame's phase. Up at once, down one tick at a time and only
   * after two seconds of room; a peer that waited for us adds one.
   */
  private adapt() {
    if (this.minD === this.maxD) return;
    let worst = -1;
    for (const list of this.rtt.values()) {
      if (list.length < 3) continue;
      const s = [...list].sort((a, b) => a - b);
      worst = Math.max(worst, s[Math.floor(0.9 * (s.length - 1))]);
    }
    let target = this.D;
    if (worst >= 0) target = Math.ceil(worst / 2 / TICK_MS) + 2;
    if (this.late > 0) {
      target = Math.max(target, this.D + 1);
      this.late = 0;
      this.lowerOk = -4;
    }
    target = Math.max(this.minD, Math.min(this.maxD, target));
    if (target > this.D) {
      this.D = target;
      this.lowerOk = Math.min(this.lowerOk, 0);
    } else if (target < this.D) {
      if (++this.lowerOk >= 4) ((this.D -= 1), (this.lowerOk = 0));
    } else this.lowerOk = Math.min(this.lowerOk + 1, 0);
    this.stats.minD = Math.min(this.stats.minD, this.D);
    this.stats.maxD = Math.max(this.stats.maxD, this.D);
  }

  /** 0.95 while we are more than two ticks ahead of a peer (where it is now, from its last message). */
  private pace(now: number) {
    let ahead = 0;
    for (const [s, p] of this.peerAt) {
      if (this.gone.has(s)) continue;
      const r = this.rtt.get(s);
      const oneway = r && r.length ? median(r) / 2 : 0;
      const there = p.c + (now - p.at + oneway) / TICK_MS;
      ahead = Math.max(ahead, this.cur - there);
    }
    if (ahead > 2) {
      this.stats.slowed++;
      return 0.95;
    }
    return 1;
  }

  // ---- checksums, results, leaving ------------------------------------------------------------------

  private check(t: number, h: number) {
    this.mine.set(t, h);
    this.hashLog.push([t, h]);
    this.send({ k: "h", s: this.me, t, h });
    this.compare(t);
    // (old ones go)
    const old = t - this.hashEvery * 40;
    this.mine.delete(old);
    this.theirs.delete(old);
  }

  private compare(t: number) {
    const h = this.mine.get(t);
    const m = this.theirs.get(t);
    if (h === undefined || !m) return;
    for (const [s, x] of m) {
      if (x === h) this.checks++;
      else {
        this.desyncs.push({ tick: t, seat: s, mine: h, theirs: x });
        console.error(`[lockstep] DESYNC at tick ${t}: ${this.tag} has ${h.toString(16)}, seat ${s} has ${x.toString(16)}`);
      }
    }
    this.theirs.delete(t);
  }

  /** The lowest seat a person still plays: its result is the board's. */
  host() {
    return this.humans.find((s) => !this.gone.has(s)) ?? this.humans[0];
  }

  /** Our result (the order, winner first); the host sends its own to everyone. */
  result(order: number[], tick: number) {
    if (this.myResult) return;
    this.myResult = order;
    if (this.local.includes(this.host())) this.send({ k: "r", s: this.me, t: tick, o: order });
    this.compareResult();
  }

  /** The result that counts: the host's (ours if we are the host), or null until it is here. */
  authority(): number[] | null {
    const h = this.host();
    if (this.local.includes(h)) return this.myResult;
    return this.results.get(h) ?? null;
  }

  private compareResult() {
    const a = this.authority();
    if (!a || !this.myResult) return;
    if (a.join() !== this.myResult.join()) console.error(`[lockstep] RESULT MISMATCH: ${this.tag} has ${this.myResult.join(",")}, the host (seat ${this.host()}) has ${a.join(",")}: the host's counts`);
  }

  /**
   * A seat's client is gone (the room's notice, delivered in the relay's order): from the tick after its
   * last frame, it plays neutral input (and the match gives it to the AI).
   */
  leave(s: number) {
    if (this.gone.has(s) || !this.humans.includes(s) || this.local.includes(s)) return;
    this.gone.set(s, this.known.get(s) ?? this.P - 1);
  }

  /** The RTT to each peer (median, ms), for the bench's readout. */
  rtts(): Record<number, number> {
    const o: Record<number, number> = {};
    for (const [s, l] of this.rtt) if (l.length) o[s] = Math.round(median(l));
    return o;
  }

  /** Done: what is pending goes out; `bye`: we are leaving the game (the others' AI takes our seats). */
  dispose(bye = false) {
    this.flush();
    if (bye) this.send({ k: "b", s: this.local });
    this.off();
  }
}
