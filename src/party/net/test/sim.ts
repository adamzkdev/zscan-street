/**
 * The lockstep test: N clients, each its own copy of the game, each played by a scripted player,
 * through the loopback relay (latency, jitter, server order) on a virtual clock. Every client runs at
 * its own screen rate (60 Hz, 120 Hz ProMotion, a jittery 60, a slow 50). It checks what the design
 * promises: every checksum equal on every client at every check, the same result everywhere.
 *
 * It runs anywhere: the bench page (partylab.html?nettest=coins), Node and JavaScriptCore (run.mjs
 * bundles it with stubs.ts), so the same scripted run can be compared across engines (`digest`).
 */
import { SEAT, SEAT_DARK, rng, type MiniDef, type Player } from "../../kit";
import { Det } from "../det";
import { BotPad, Sampler } from "../input";
import { NetMatch } from "../match";
import { Loopback, VirtualClock, type Link } from "../transport";
import { Hasher } from "../hash";

export interface ScenarioOpts {
  def: MiniDef;
  /** Clients, each playing one seat (seats 0…n−1; the rest are AIs). */
  clients: number;
  seed: number;
  /** The version (a level); none: the seed draws one. */
  variant?: string;
  /** Mean round trip (ms) and jitter (± ms on each leg). */
  rtt?: [number, number];
  jitter?: number;
  /** Input delay: fixed, or adaptive (default). */
  delay?: number;
  /** Stop after this much sim time (s) even if the game has not finished. */
  maxSecs?: number;
  /** The control run: the engine's own maths in the sim. */
  native?: boolean;
  /** Checksums of every bit (not rounded to a millionth). */
  exact?: boolean;
}

export interface ClientReport {
  seat: number;
  ticks: number;
  hashes: number;
  checks: number;
  desyncs: number;
  order: string;
  authority: string;
  stalls: number;
  maxStallMs: number;
  delay: string;
  rtt: string;
  simMsPerTick: number;
}

export interface ScenarioResult {
  ok: boolean;
  variant: string | null;
  simSecs: number;
  /** One number for every checksum of every client: what the cross-engine runs compare. */
  digest: string;
  /** Every checksum of client 0, in order (the reruns compare them all). */
  log: [number, number][];
  clients: ClientReport[];
  problems: string[];
  messages: number;
}

/** A table without images (headless: the game only reads seats, ids, colours, skills). */
export function table(): Player[] {
  const ids = [4071, 1337, 77, 9001];
  return ids.map((id, i) => ({ seat: i, id, name: ["Ada", "Bo", "Cy", "Di"][i], color: SEAT[i], dark: SEAT_DARK[i], human: i === 0, skill: [0.5, 0.35, 0.6, 0.85][i], img: { complete: false, naturalWidth: 0 } as unknown as HTMLImageElement }));
}

/** The screen rates the clients run at, in turn: 60 Hz, ProMotion, a jittery 60, a slow 50. */
const RATES = [
  (r: () => number) => 1000 / 60,
  (r: () => number) => 1000 / 120,
  (r: () => number) => 1000 / 60 + (r() - 0.5) * 9,
  (r: () => number) => 1000 / 50 + (r() < 0.03 ? 40 : 0),
];

export function runScenario(o: ScenarioOpts): ScenarioResult {
  Det.native(!!o.native);
  Hasher.exact = !!o.exact;
  const clock = new VirtualClock();
  const hub = new Loopback(clock, { seed: o.seed ^ 0x5eed });
  const lr = rng(o.seed ^ 0x11ce);
  const [rLo, rHi] = o.rtt ?? [40, 120];
  const humans = Array.from({ length: o.clients }, (_, i) => i);
  const players = table();
  const cl = humans.map((seat) => {
    // (each client's own link: a round trip somewhere in the range, split evenly)
    const rtt = rLo + lr() * (rHi - rLo);
    const link: Link = { up: rtt / 2, down: rtt / 2, jitter: o.jitter ?? 15 };
    const transport = hub.client(link);
    const match = new NetMatch({ def: o.def, players, seed: o.seed, humans, local: [seat], transport, variant: o.variant, delay: o.delay, quiet: true, now: () => clock.now(), name: `client ${seat}` });
    const bot = new BotPad(rng((o.seed * 31 + seat * 7919) >>> 0));
    const sampler = new Sampler(bot);
    const fr = rng((o.seed + seat * 104729) >>> 0);
    return { seat, match, bot, sampler, fr, next: fr() * 16, last: 0 };
  });
  const maxMs = (o.maxSecs ?? 120) * 1000;
  // every client's frames in time order, the relay's messages delivered between them
  for (;;) {
    let c = cl[0];
    for (const x of cl) if (x.next < c.next) c = x;
    if (c.next > maxMs) break;
    clock.advance(c.next - clock.now());
    const dt = (c.next - c.last) / 1000;
    c.last = c.next;
    c.next += RATES[c.seat % RATES.length](c.fr);
    c.match.frame(dt, () => {
      c.bot.step();
      c.sampler.frame();
      return c.sampler.take();
    });
    // (done once every client is past its finish and has the host's result)
    if (cl.every((x) => x.match.phase === "done" && x.match.result())) break;
  }
  const simSecs = clock.now() / 1000;
  const problems: string[] = [];
  const logs = cl.map((x) => x.match.lock.hashLog);
  const ref = logs[0];
  // every client's checksums, tick by tick, against client 0's
  cl.forEach((x, i) => {
    const l = logs[i];
    const n = Math.min(l.length, ref.length);
    if (Math.abs(l.length - ref.length) > 2) problems.push(`client ${i} made ${l.length} checksums, client 0 made ${ref.length}`);
    for (let k = 0; k < n; k++)
      if (l[k][0] !== ref[k][0] || l[k][1] !== ref[k][1]) {
        problems.push(`client ${i} differs from client 0 at tick ${l[k][0]} (${l[k][1].toString(16)} vs ${ref[k][1].toString(16)})`);
        break;
      }
    if (x.match.lock.desyncs.length) problems.push(`client ${i} logged ${x.match.lock.desyncs.length} desyncs`);
    if (x.match.phase !== "done") problems.push(`client ${i} did not finish (phase ${x.match.phase})`);
  });
  const orders = cl.map((x) => (x.match.order ?? []).join(","));
  if (new Set(orders).size !== 1) problems.push(`results differ: ${orders.join(" | ")}`);
  const auth = cl.map((x) => (x.match.result() ?? []).join(","));
  if (new Set(auth).size !== 1 || auth[0] !== orders[0]) problems.push(`authoritative results differ: ${auth.join(" | ")}`);
  const dg = new Hasher();
  for (const l of logs) for (const [t, h] of l) dg.int(t).int(h);
  const clients: ClientReport[] = cl.map((x) => {
    const L = x.match.lock;
    return {
      seat: x.seat,
      ticks: L.stats.ticks,
      hashes: L.hashLog.length,
      checks: L.checks,
      desyncs: L.desyncs.length,
      order: orders[x.seat],
      authority: auth[x.seat],
      stalls: L.stats.stalls,
      maxStallMs: Math.round(L.stats.maxStallMs),
      delay: `${L.stats.minD}..${L.stats.maxD} (now ${L.D})`,
      rtt: JSON.stringify(L.rtts()),
      simMsPerTick: L.stats.ticks ? +(x.match.simMs / L.stats.ticks).toFixed(3) : 0,
    };
  });
  for (const x of cl) x.match.dispose();
  Det.native(false);
  Hasher.exact = false;
  return { ok: problems.length === 0, variant: cl[0].match.variant, simSecs: +simSecs.toFixed(1), digest: (dg.value >>> 0).toString(16).padStart(8, "0"), log: ref, clients, problems, messages: hub.sent };
}

/** The same game, solo-style (four AIs, no lockstep), stepped N ticks with or without Det: the cost of the patches. */
export function costRun(def: MiniDef, seed: number, ticks: number, det: boolean): { msPerTick: number } {
  const players = table().map((p) => ({ ...p, human: false }));
  const rnd = rng(seed);
  const mini = def.make(players, rnd, def.variants?.[0]?.key);
  const none = { held: () => false, pressed: () => false, axis: () => ({ x: 0, y: 0 }) } as unknown as Parameters<typeof mini.update>[1];
  // (warm the JIT first)
  for (let t = 0; t < 120; t++) (det ? Det.run(seed, t, () => mini.update(1 / 60, none), true) : mini.update(1 / 60, none));
  const t0 = performance.now();
  let n = 0;
  for (; n < ticks && !mini.result(); n++) {
    if (det) Det.run(seed, n, () => mini.update(1 / 60, none), true);
    else mini.update(1 / 60, none);
  }
  const ms = performance.now() - t0;
  mini.dispose?.();
  return { msPerTick: ms / Math.max(1, n) };
}
