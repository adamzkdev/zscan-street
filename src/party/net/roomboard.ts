/**
 * ZK PARTY online: the board played in a room. Every page runs the same board (the room's seed, the
 * same seats, the same Rules: board/core.ts decides everything from its `rnd`), so only the people's
 * choices have to cross the network, and the mini-games, which run in lockstep (net/match.ts).
 *
 * - A question to a person's seat (the dice's hit, a junction, the shop, a target…) is the n-th of
 *   the game on every page. The page that seat sits at asks its own player and relays the answer
 *   ({c: "ask", n, v}); the others wait for it on the room's relay. An answer already on the relay
 *   (a page that came back after a drop) is taken at once without asking again.
 * - The k-th mini-game talks on a channel of its own ({c: "m<k>", d}): a page that gets there later
 *   than the others finds what was already said kept for it.
 * - The AI's seats answer on every page alike (their minds are the Rules', from `rnd`).
 */
import type { RoomClient } from "../../net/rooms";
import type { NetMsg, Transport } from "./transport";

/** What the board needs to be played online (board/game.ts BoardOpts.net). */
export interface BoardNet {
  /** The seats people play (anywhere), and this page's. */
  readonly humans: number[];
  readonly me: number;
  /** The answer to the game's n-th question, to `seat`: asked here (`ask`) when it is this page's, else waited for. */
  answer(n: number, seat: number, ask: () => Promise<number>): Promise<number>;
  /** The k-th mini-game's channel. */
  mini(k: number): Transport;
  /** The k-th mini-game's seed (the same on every page). */
  miniSeed(k: number): number;
  /** Who is being waited for (for the board's line): a seat, or −1. */
  waitingFor(): number;
  dispose(): void;
}

type Msg = { c?: unknown; n?: unknown; v?: unknown; d?: unknown };

export class RoomBoardNet implements BoardNet {
  private answers = new Map<number, number>();
  private waiting = new Map<number, { seat: number; done: (v: number) => void }>();
  private chans = new Map<string, { subs: Set<(m: NetMsg) => void>; kept: NetMsg[] }>();
  private off: () => void;

  constructor(
    private room: RoomClient,
    readonly humans: number[],
    readonly me: number,
    private seed: number,
  ) {
    this.off = room.on("game", (m) => this.got(m as NetMsg));
  }

  private got(m: NetMsg) {
    const d = m.data as Msg;
    if (!d || typeof d.c !== "string") return;
    if (d.c === "ask") {
      const n = Number(d.n),
        v = Number(d.v);
      if (!Number.isInteger(n) || !Number.isFinite(v) || this.answers.has(n)) return;
      this.answers.set(n, v);
      const w = this.waiting.get(n);
      if (w) (this.waiting.delete(n), w.done(v));
      return;
    }
    const ch = this.chan(d.c);
    const msg: NetMsg = { seq: m.seq, from: m.from, data: d.d };
    ch.kept.push(msg);
    for (const f of ch.subs) f(msg);
  }

  private chan(c: string) {
    let ch = this.chans.get(c);
    if (!ch) this.chans.set(c, (ch = { subs: new Set(), kept: [] }));
    return ch;
  }

  async answer(n: number, seat: number, ask: () => Promise<number>): Promise<number> {
    const have = this.answers.get(n);
    if (have !== undefined) return have;
    if (seat === this.me) {
      const v = await ask();
      // (asked meanwhile on the relay by this same seat from another tab that came back: that one counts)
      if (!this.answers.has(n)) {
        this.answers.set(n, v);
        this.room.send({ c: "ask", n, v });
      }
      return this.answers.get(n)!;
    }
    return new Promise((done) => this.waiting.set(n, { seat, done }));
  }

  mini(k: number): Transport {
    const c = `m${k}`;
    const ch = this.chan(c);
    return {
      send: (d) => this.room.send({ c, d }),
      onMessage: (cb) => {
        // (what the others already said on this channel first, in the relay's order)
        for (const m of ch.kept) cb(m);
        ch.subs.add(cb);
        return () => ch.subs.delete(cb);
      },
    };
  }

  miniSeed(k: number) {
    let h = (this.seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    return (h ^ (h >>> 13)) >>> 0 || 1;
  }

  waitingFor() {
    for (const [, w] of this.waiting) return w.seat;
    return -1;
  }

  dispose() {
    this.off();
    for (const [, w] of this.waiting) w.done(0);
    this.waiting.clear();
    this.chans.clear();
  }
}
