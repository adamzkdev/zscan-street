/**
 * One mini-game played online: the game itself, the card ("press A when ready") and the 3-2-1 before
 * it and the finish after, all as lockstep ticks, so every client's sim goes through the same states
 * at the same ticks. No drawing here: the host (host.ts playMini with `net`) draws it, a test runs it
 * headless.
 */
import { Input, rng, type Mini, type MiniDef, type Player } from "../kit";
import { Det } from "./det";
import { Hasher } from "./hash";
import { NetInput } from "./input";
import { Lockstep, TICK, type DelayOpts } from "./lockstep";
import type { Transport } from "./transport";

/** The 3-2-1: three counts of this long (as the host's offline one). */
export const COUNT = 0.62;
/** The card waits this long for everyone to press A, then starts anyway. */
const CARD_MAX = 20;
/** The finish runs on this long after the result (the last fall, the winner's leap). */
const FINISH = 1.6;

export type NetPhase = "card" | "count" | "play" | "finish" | "done";
const PHASES: NetPhase[] = ["card", "count", "play", "finish", "done"];

export interface NetSetup {
  def: MiniDef;
  /** The table, as the board has it (not changed: the game gets copies). */
  players: Player[];
  /** The room's seed for this game: the same on every client. */
  seed: number;
  /** The seats people play, and this device's. */
  humans: number[];
  local: number[];
  transport: Transport;
  /** A version of the game (a kart track); none: the seed draws one. */
  variant?: string;
  delay?: number | DelayOpts;
  /** A sim nobody watches (a test's clients, the bench's second one): no sound. */
  quiet?: boolean;
  /** A real-time clock (ms); a test's virtual one. */
  now?: () => number;
  name?: string;
}

export class NetMatch {
  readonly def: MiniDef;
  readonly mini: Mini;
  /** The game's players: copies, `human` a person anywhere, `local` this device, `input` per person. */
  readonly players: Player[];
  readonly lock: Lockstep;
  readonly seed: number;
  readonly variant: string | null;
  phase: NetPhase = "card";
  /** The time in this phase (sim seconds). */
  pt = 0;
  /** Who has pressed A on the card (the AIs get ready by themselves, as on the card offline). */
  readonly ready: boolean[];
  /** The order the game gave (this client's own), and the tick it came at. */
  order: number[] | null = null;
  doneAt = -1;
  private inputs: (NetInput | null)[];
  /** What the game's update() gets for its `input`: nothing held (online, every seat reads its own). */
  private none = new Input();
  private quiet: boolean;
  /** Sim time spent in ticks (ms), for the cost report. */
  simMs = 0;

  constructor(o: NetSetup) {
    this.def = o.def;
    this.seed = o.seed >>> 0;
    this.quiet = !!o.quiet;
    const humans = new Set(o.humans);
    const local = new Set(o.local);
    this.inputs = o.players.map((p, i) => (humans.has(i) ? new NetInput() : null));
    this.players = o.players.map((p, i) => ({ ...p, human: humans.has(i), local: local.has(i), input: this.inputs[i] ?? undefined }));
    this.ready = this.players.map(() => false);
    this.lock = new Lockstep({ transport: o.transport, humans: o.humans, local: o.local, delay: o.delay, now: o.now, name: o.name });
    // the game, built inside the sim's environment too: its make() may draw from Math.random
    const rnd = rng(this.seed);
    const def = o.def;
    this.variant = def.variants?.length ? (def.variants.find((v) => v.key === o.variant)?.key ?? def.variants[Math.floor(rnd() * def.variants.length) % def.variants.length].key) : null;
    this.mini = Det.run(this.seed, -1, () => def.make(this.players, rnd, this.variant ?? undefined), this.quiet);
  }

  /**
   * One screen frame: this device's seats sampled as their ticks come (`sample(seat)` → a frame,
   * input.ts), the ticks that are due run. Returns how many ran.
   */
  frame(dt: number, sample: (seat: number) => number): number {
    if (this.phase === "done") return 0;
    return this.lock.advance(
      dt,
      sample,
      (t) => this.tick(t),
      () => this.hash(),
    );
  }

  /** One lockstep tick of the whole match. */
  private tick(t: number) {
    for (let i = 0; i < this.players.length; i++) {
      const inp = this.inputs[i];
      if (!inp) continue;
      // (its client has left: from this tick on, the AI plays it, the same tick on every client)
      if (this.players[i].human && this.lock.left(i, t)) {
        this.players[i].human = false;
        this.players[i].input = undefined;
      }
      inp.set(this.lock.frame(i, t));
    }
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    Det.run(this.seed, t, () => this.step(t), this.quiet);
    if (t0) this.simMs += performance.now() - t0;
  }

  /** The phases, as the host's offline ones, on ticks. */
  private step(t: number) {
    const mini = this.mini;
    this.pt += TICK;
    const pt = this.pt;
    if (this.phase === "card") {
      mini.idle?.(TICK, "card", pt);
      this.players.forEach((p, i) => {
        if (this.ready[i]) return;
        if (p.human ? pt > 0.5 && !!p.input?.pressed("a") : pt > 0.55 + i * 0.32) this.ready[i] = true;
      });
      if ((pt > 1 && this.ready.every(Boolean)) || pt > CARD_MAX) ((this.phase = "count"), (this.pt = 0));
    } else if (this.phase === "count") {
      mini.idle?.(TICK, "count", Math.min(1, pt / (COUNT * 3)), this.none);
      if (pt >= COUNT * 3) ((this.phase = "play"), (this.pt = 0));
    } else if (this.phase === "play") {
      mini.update(TICK, this.none);
      const r = mini.result();
      if (r) {
        this.order = r;
        this.phase = "finish";
        this.pt = 0;
        this.lock.result(r, t);
      }
    } else if (this.phase === "finish") {
      mini.update(TICK, this.none);
      if (pt > FINISH) ((this.phase = "done"), (this.doneAt = t));
    }
  }

  /** The match's checksum: its phase and clock, who is ready, and the game's own. */
  hash(): number {
    const h = new Hasher().int(PHASES.indexOf(this.phase)).num(this.pt);
    for (const r of this.ready) h.bool(r);
    for (const p of this.players) h.bool(p.human);
    // (the game's own, computed on the sim's maths: it may call them)
    h.int(this.mini.hash ? Det.run(this.seed, this.lock.cur, () => this.mini.hash!(), true) : 0);
    return h.value;
  }

  /** The result that counts (the host's), once it is here. */
  result(): number[] | null {
    return this.lock.authority();
  }

  dispose(bye = false) {
    this.lock.dispose(bye);
    this.mini.dispose?.();
  }
}
