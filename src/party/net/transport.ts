/**
 * What the lockstep needs from the network: a relay that stamps every message with a sequence number
 * as it passes the server and hands it to every client in that order (the room server's game channel,
 * src/net/rooms.ts: `send(data)` / `on("game", {seq, from, data})`). Whether a sender gets its own
 * messages back does not matter: the lockstep ignores its own.
 *
 * `Loopback` is the same thing inside one page or one Node process, for tests and the bench: N clients,
 * each with its own latency and jitter, on the real clock or on a virtual one.
 */

export interface NetMsg {
  /** The server's stamp: every client sees the messages in this order. */
  seq: number;
  /** The sender's connection (the lockstep reads seats from the message itself). */
  from: number | string;
  data: unknown;
}

export interface Transport {
  send(data: unknown): void;
  /** Every message, in the server's order; returns an unsubscribe. */
  onMessage(cb: (m: NetMsg) => void): () => void;
}

/** Time for the loopback: the browser's clock and timers, or a virtual clock a test winds on. */
export interface Clock {
  now(): number;
  after(ms: number, f: () => void): void;
}

export const realClock: Clock = {
  now: () => performance.now(),
  after: (ms, f) => void setTimeout(f, ms),
};

/** A clock that only moves when told: timers run in time order (ties in the order they were set). */
export class VirtualClock implements Clock {
  private t = 0;
  private n = 0;
  private q: { at: number; n: number; f: () => void }[] = [];
  now() {
    return this.t;
  }
  after(ms: number, f: () => void) {
    const e = { at: this.t + Math.max(0, ms), n: this.n++, f };
    // (a sorted insert: the queue stays short, a few messages in flight per client)
    let i = this.q.length;
    while (i > 0 && (this.q[i - 1].at > e.at || (this.q[i - 1].at === e.at && this.q[i - 1].n > e.n))) i--;
    this.q.splice(i, 0, e);
  }
  /** Move to `ms` from now, running every timer due on the way. */
  advance(ms: number) {
    const end = this.t + ms;
    while (this.q.length && this.q[0].at <= end) {
      const e = this.q.shift()!;
      this.t = e.at;
      e.f();
    }
    this.t = end;
  }
}

/** One client's link: its one-way delays to and from the server (ms) and how much each varies. */
export interface Link {
  up: number;
  down: number;
  /** Each delay varies by up to ± this (ms); the order still holds, as on a WebSocket. */
  jitter: number;
}

/** A relay in one place: a server that stamps and forwards, clients behind links. */
export class Loopback {
  private seq = 0;
  private clients: { link: Link; subs: Set<(m: NetMsg) => void>; upAt: number; downAt: number; upQ: string[]; downQ: NetMsg[] }[] = [];
  private r: () => number;
  /** Messages relayed (the bench and tests report it). */
  sent = 0;
  constructor(
    private clock: Clock,
    o: { seed?: number; echo?: boolean } = {},
  ) {
    // (the jitter's own little random: a test run is the same every time)
    let a = (o.seed ?? 1) >>> 0 || 1;
    this.r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.echo = o.echo ?? true;
  }
  private echo: boolean;

  /** A new client behind this link. */
  client(link: Link): Transport {
    const id = this.clients.length;
    const c = { link, subs: new Set<(m: NetMsg) => void>(), upAt: 0, downAt: 0, upQ: [] as string[], downQ: [] as NetMsg[] };
    this.clients.push(c);
    return {
      send: (data) => {
        // (a copy, as the wire would make: no client shares an object with another)
        const json = JSON.stringify(data);
        const now = this.clock.now();
        // (in order on the way up: never before the one sent before it; and each timer takes the
        // queue's head, so a timer that fires a hair early cannot pass the one before it)
        c.upAt = Math.max(c.upAt, now + this.delay(c.link.up, c.link.jitter));
        c.upQ.push(json);
        this.clock.after(c.upAt - now, () => this.relay(id, c.upQ.shift()!));
      },
      onMessage: (cb) => {
        c.subs.add(cb);
        return () => c.subs.delete(cb);
      },
    };
  }

  /** The link's delay this time: its mean, give or take its jitter. */
  private delay(mean: number, jitter: number) {
    return Math.max(0, mean + (this.r() * 2 - 1) * jitter);
  }

  /** At the server: stamp it, send it down to everyone. */
  private relay(from: number, json: string) {
    const seq = ++this.seq;
    this.sent++;
    const now = this.clock.now();
    this.clients.forEach((c, i) => {
      if (i === from && !this.echo) return;
      c.downAt = Math.max(c.downAt, now + this.delay(c.link.down, c.link.jitter));
      c.downQ.push({ seq, from, data: JSON.parse(json) });
      this.clock.after(c.downAt - now, () => {
        const m = c.downQ.shift()!;
        for (const f of c.subs) f(m);
      });
    });
  }
}
