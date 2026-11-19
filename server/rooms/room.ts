/**
 * One ZK PARTY room, apart from any transport: its four seats, the host, the ready flags, the
 * settings, the start (a seed, the seats frozen) and the ordered relay the game talks through. The
 * protocol it speaks is described at the top of protocol.ts.
 *
 * The host process owns the sockets and the clock: it hands the room each socket (`open`, a
 * `Conn`), each frame (`receive`) and each close (`close`), and calls `tick` when `wake` says. It
 * never trusts a page: every frame is checked for size, shape and rate here, whoever runs it.
 * main.ts runs many rooms in Node; worker.ts runs one per Durable Object and keeps `save()` in
 * the object's storage, to make the room again (`Room.from`) after it slept.
 *
 * Plain TypeScript Node can run as it is (no enums, no parameter properties, `import type`).
 */
import {
  CLOSE,
  DEFAULT_SETTINGS,
  EMPTY_TTL_MS,
  GRACE_MS,
  HB,
  HELLO_MS,
  HOST_GRACE_MS,
  LOG_BYTES,
  LOG_MAX,
  MAX_AGE_MS,
  MAX_DATA,
  MAX_FRAME,
  MAX_PEERS,
  RATE,
  SEATS,
  TOKEN_RE,
  cleanName,
  cleanSettings,
  newSeed,
  startSeats,
  validAvatar,
  type ErrorCode,
  type Phase,
  type RoomView,
  type Settings,
} from "./protocol.ts";

/** A socket, as the host process gives it. */
export interface Conn {
  /** One message, already JSON. */
  send(line: string): void;
  /** Close it (a code from protocol.ts CLOSE). The host still calls `close(peer)` when it is closed. */
  close(code: number, why: string): void;
  /** Its seat changed: a host whose sockets outlive the room in memory keeps it with them (worker.ts). */
  seated?(seat: number): void;
}

interface Bucket {
  n: number;
  at: number;
}

/** A socket in the room: seated after its hello. */
export interface Peer {
  readonly conn: Conn;
  seat: number;
  readonly opened: number;
  relay: Bucket;
  other: Bucket;
  /** Broken rules lately (they fade, one every STRIKE_FADE ms); past MAX_STRIKES the socket is dropped. */
  strikes: number;
  struck: number;
  /** When it was last told it is going too fast (once a second at most). */
  warned: number;
  closed: boolean;
}

interface Seat {
  /** The page's secret: whoever says it holds the seat. Never sent to anyone. */
  token: string;
  name: string;
  avatar: number;
  ready: boolean;
  /** When its socket dropped (0: connected). */
  away: number;
  /** Left a started game, or did not come back in time: the seat stays theirs until the lobby. */
  gone: boolean;
  peer: Peer | null;
}

export interface RoomOpts {
  now?: () => number;
  /** A game's seed (32 bits): random by default. */
  seed?: () => number;
  /** The clocks, shortened by the tests (ms). */
  grace?: number;
  hostGrace?: number;
  emptyTtl?: number;
}

/** What worker.ts keeps on disk: the room without its sockets. */
export interface RoomSave {
  v: 1;
  code: string;
  created: number;
  host: number;
  phase: Phase;
  settings: Settings;
  seed: number;
  seq: number;
  log: { seq: number; line: string }[];
  seats: (Omit<Seat, "peer"> | null)[];
  emptySince: number;
}

const MAX_STRIKES = 20;
const STRIKE_FADE = 3000;

export class Room {
  readonly code: string;
  readonly created: number;
  host = -1;
  phase: Phase = "lobby";
  settings: Settings = { ...DEFAULT_SETTINGS };
  seed = 0;
  /** The last relay's number: it only goes up, for the room's whole life. */
  seq = 0;
  /**
   * What a host keeping the room on disk has to write: "state" (seats, settings, phase) at once,
   * "log" (relays only) when it suits it. The host clears it once written.
   */
  dirty: "" | "log" | "state" = "state";
  private log: { seq: number; line: string }[] = [];
  private logBytes = 0;
  private seats: (Seat | null)[] = Array.from({ length: SEATS }, () => null);
  private peers = new Set<Peer>();
  /** Since when nobody holds a seat (0: someone does). */
  private emptySince: number;
  /** Something everyone sees changed: one "room" message goes out at the end of the event. */
  private changed = false;
  /** Made again from disk: relays may have been lost with the memory (see hello). */
  private restored = false;
  private now: () => number;
  private newSeed: () => number;
  private grace: number;
  private hostGrace: number;
  private emptyTtl: number;

  constructor(code: string, o: RoomOpts = {}) {
    this.now = o.now ?? Date.now;
    this.newSeed = o.seed ?? newSeed;
    this.grace = o.grace ?? GRACE_MS;
    this.hostGrace = o.hostGrace ?? HOST_GRACE_MS;
    this.emptyTtl = o.emptyTtl ?? EMPTY_TTL_MS;
    this.code = code;
    this.created = this.now();
    this.emptySince = this.created;
  }

  // ---- the host process's side ------------------------------------------------------------------

  /** A socket opened on this room; null when the room has no room for another (it is closed). */
  open(conn: Conn, opened = this.now()): Peer | null {
    if (this.peers.size >= MAX_PEERS) {
      conn.send(JSON.stringify({ t: "error", code: "full" }));
      conn.close(CLOSE.full, "busy");
      return null;
    }
    const p: Peer = { conn, seat: -1, opened, relay: { n: RATE.relay.burst, at: opened }, other: { n: RATE.other.burst, at: opened }, strikes: 0, struck: opened, warned: 0, closed: false };
    this.peers.add(p);
    return p;
  }

  /** A frame from a socket: text, or anything else (refused). */
  receive(p: Peer, raw: unknown) {
    if (p.closed) return;
    if (typeof raw !== "string") return this.fail(p, "bad");
    if (raw.length > MAX_FRAME) return this.drop(p, CLOSE.bad, "big");
    // (the heartbeat: as cheap as possible, but still counted)
    if (raw === HB) {
      if (this.take(p, p.other, RATE.other)) p.conn.send(HB);
      return;
    }
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return this.fail(p, "bad");
    }
    if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.t !== "string") return this.fail(p, "bad");
    const t = m.t;
    const relay = t === "game";
    if (!this.take(p, relay ? p.relay : p.other, relay ? RATE.relay : RATE.other)) return;
    if (p.seat < 0 && t !== "hello" && t !== "ping") return this.fail(p, "hello", t);
    if (t === "hello") this.hello(p, m);
    else if (t === "game") this.relay(p, m);
    else if (t === "ping") this.say(p, { t: "pong", at: typeof m.at === "number" && Number.isFinite(m.at) ? m.at : null, now: this.now() });
    else if (t === "ready") this.ready(p, m);
    else if (t === "me") this.me(p, m);
    else if (t === "settings") this.setSettings(p, m);
    else if (t === "start") this.start(p);
    else if (t === "lobby") this.toLobby(p);
    else if (t === "leave") this.leave(p);
    else this.fail(p, "bad", t.slice(0, 16));
    this.flush();
  }

  /** A socket closed (by the page, the network, or the room itself). */
  close(p: Peer) {
    p.closed = true;
    this.peers.delete(p);
    const s = p.seat >= 0 ? this.seats[p.seat] : null;
    if (s && s.peer === p) {
      s.peer = null;
      s.away = this.now();
      this.touch();
    }
    this.flush();
  }

  /** Time passed: hellos that never came, seats not taken back in time, a host away too long, an empty room. */
  tick() {
    const now = this.now();
    for (const p of this.peers) if (p.seat < 0 && now - p.opened >= HELLO_MS) this.refuse(p, "hello");
    this.seats.forEach((s, i) => {
      if (s && !s.gone && s.away && now - s.away >= this.grace) this.free(i);
    });
    const h = this.seats[this.host];
    if (!h || h.gone || (h.away && now - h.away >= this.hostGrace)) this.pickHost();
    this.checkEmpty();
    this.flush();
  }

  /** When `tick` next has something to do (ms, the host's clock). */
  wake(): number {
    let at = this.created + MAX_AGE_MS;
    for (const p of this.peers) if (p.seat < 0) at = Math.min(at, p.opened + HELLO_MS);
    this.seats.forEach((s, i) => {
      if (!s || s.gone || !s.away) return;
      at = Math.min(at, s.away + this.grace);
      if (i === this.host) at = Math.min(at, s.away + this.hostGrace);
    });
    if (this.emptySince) at = Math.min(at, this.emptySince + this.emptyTtl);
    return at;
  }

  /** Nobody has been in it for a while, or it is too old: the host process ends it (`shutdown`). */
  get expired() {
    const now = this.now();
    return (!!this.emptySince && now - this.emptySince >= this.emptyTtl) || now - this.created >= MAX_AGE_MS;
  }

  /** Every socket told and closed. */
  shutdown() {
    for (const p of [...this.peers]) this.drop(p, CLOSE.expired, "expired");
  }

  /** Sockets in the room, seated or not. */
  get size() {
    return this.peers.size;
  }

  view(): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      host: this.host,
      settings: { ...this.settings },
      seed: this.seed,
      seats: this.seats.map((s) => s && { name: s.name, avatar: s.avatar, ready: s.ready, online: !!s.peer, gone: s.gone }),
    };
  }

  save(): RoomSave {
    return {
      v: 1,
      code: this.code,
      created: this.created,
      host: this.host,
      phase: this.phase,
      settings: { ...this.settings },
      seed: this.seed,
      seq: this.seq,
      log: this.log.slice(),
      seats: this.seats.map((s) => s && { token: s.token, name: s.name, avatar: s.avatar, ready: s.ready, away: s.away, gone: s.gone }),
      emptySince: this.emptySince,
    };
  }

  /** The room again, from `save()`: then `attach` each socket that outlived it, then `settle`. */
  static from(s: RoomSave, o: RoomOpts = {}): Room {
    const r = new Room(s.code, { ...o, now: () => s.created });
    r.now = o.now ?? Date.now;
    r.host = s.host;
    r.phase = s.phase;
    r.settings = cleanSettings(s.settings, DEFAULT_SETTINGS) ?? { ...DEFAULT_SETTINGS };
    r.seed = s.seed;
    r.seq = s.seq;
    r.log = s.log.slice();
    r.logBytes = r.log.reduce((n, e) => n + e.line.length, 0);
    r.seats = s.seats.map((x) => x && { ...x, peer: null });
    r.emptySince = s.emptySince;
    r.restored = true;
    r.dirty = "";
    return r;
  }

  /** A socket that outlived the room in memory (a hibernation), back on its seat. */
  attach(conn: Conn, seat: number, opened: number): Peer {
    const p: Peer = { conn, seat: -1, opened, relay: { n: RATE.relay.burst, at: opened }, other: { n: RATE.other.burst, at: opened }, strikes: 0, struck: opened, warned: 0, closed: false };
    this.peers.add(p);
    const s = this.seats[seat];
    if (s && !s.peer) {
      s.peer = p;
      p.seat = seat;
    }
    return p;
  }

  /** After `attach`: a seat marked connected whose socket did not come back is away from now. */
  settle() {
    const now = this.now();
    for (const s of this.seats) {
      if (!s || s.peer || s.away || s.gone) continue;
      s.away = now;
      this.dirty = "state";
    }
  }

  // ---- the messages --------------------------------------------------------------------------

  private hello(p: Peer, m: Record<string, unknown>) {
    if (p.seat >= 0) return this.fail(p, "bad", "hello");
    const token = m.token;
    if (typeof token !== "string" || !TOKEN_RE.test(token) || !validAvatar(m.avatar)) return this.fail(p, "bad", "hello");
    const name = cleanName(m.name);
    let seat = this.seats.findIndex((s) => s?.token === token);
    if (seat >= 0) {
      // (the same page again: after a drop, a reload, or from another tab, which takes over)
      const s = this.seats[seat]!;
      if (s.peer) this.drop(s.peer, CLOSE.replaced, "replaced");
      s.peer = p;
      s.away = 0;
      s.gone = false;
      // (once started, the names are part of the game: frozen)
      if (this.phase === "lobby") {
        s.name = name || s.name;
        s.avatar = m.avatar;
      }
    } else {
      if (this.phase !== "lobby") return this.refuse(p, "started");
      seat = this.seats.findIndex((s) => !s);
      if (seat < 0) return this.refuse(p, "full");
      this.seats[seat] = { token, name: name || `Player ${seat + 1}`, avatar: m.avatar, ready: false, away: 0, gone: false, peer: p };
    }
    p.seat = seat;
    p.conn.seated?.(seat);
    if (this.host < 0 || !this.seats[this.host] || this.seats[this.host]!.gone) this.host = seat;
    this.emptySince = 0;
    // A page that saw more relays than this room remembers (it was made again from disk and the
    // last ones were lost with its memory): the count goes on from the page's, so it only goes up.
    const since = typeof m.since === "number" && Number.isInteger(m.since) && m.since >= 0 ? m.since : -1;
    if (this.restored && since > this.seq && since - this.seq <= LOG_MAX * 16) {
      this.seq = since;
      this.log = [];
      this.logBytes = 0;
    }
    const oldest = this.log.length ? this.log[0].seq : this.seq + 1;
    this.say(p, { t: "welcome", seat, room: this.view(), now: this.now(), seq: this.seq, oldest });
    if (since >= 0) for (const e of this.log) if (e.seq > since) p.conn.send(e.line);
    this.touch();
  }

  private relay(p: Peer, m: Record<string, unknown>) {
    if (this.phase !== "playing") return this.fail(p, "phase", "game", false);
    if (!("data" in m)) return this.fail(p, "bad", "game");
    const data = JSON.stringify(m.data);
    if (data.length > MAX_DATA) return this.fail(p, "big", "game");
    const seq = ++this.seq;
    const line = `{"t":"game","seq":${seq},"from":${p.seat},"data":${data}}`;
    this.log.push({ seq, line });
    this.logBytes += line.length;
    while (this.log.length > LOG_MAX || this.logBytes > LOG_BYTES) this.logBytes -= this.log.shift()!.line.length;
    for (const s of this.seats) if (s?.peer) s.peer.conn.send(line);
    if (!this.dirty) this.dirty = "log";
  }

  private ready(p: Peer, m: Record<string, unknown>) {
    if (typeof m.on !== "boolean") return this.fail(p, "bad", "ready");
    if (this.phase !== "lobby") return this.fail(p, "phase", "ready", false);
    const s = this.seats[p.seat]!;
    if (s.ready === m.on) return;
    s.ready = m.on;
    this.touch();
  }

  private me(p: Peer, m: Record<string, unknown>) {
    const name = cleanName(m.name);
    if (!name || !validAvatar(m.avatar)) return this.fail(p, "bad", "me");
    if (this.phase !== "lobby") return this.fail(p, "phase", "me", false);
    const s = this.seats[p.seat]!;
    s.name = name;
    s.avatar = m.avatar;
    this.touch();
  }

  private setSettings(p: Peer, m: Record<string, unknown>) {
    const next = cleanSettings(m.settings, this.settings);
    if (!next) return this.fail(p, "bad", "settings");
    if (p.seat !== this.host) return this.fail(p, "notHost", "settings", false);
    if (this.phase !== "lobby") return this.fail(p, "phase", "settings", false);
    this.settings = next;
    this.touch();
  }

  private start(p: Peer) {
    if (p.seat !== this.host) return this.fail(p, "notHost", "start", false);
    if (this.phase !== "lobby") return this.fail(p, "phase", "start", false);
    if (this.seats.some((s, i) => s && i !== this.host && !s.ready)) return this.fail(p, "notReady", "start", false);
    this.phase = "playing";
    this.seed = this.newSeed() >>> 0 || 1;
    this.log = [];
    this.logBytes = 0;
    const room = this.view();
    this.broadcast({ t: "start", seed: this.seed, seats: startSeats(room), settings: room.settings, seq: this.seq });
    this.touch();
  }

  /** The host takes everyone back to the lobby: the seats of those gone free again, nobody ready. */
  private toLobby(p: Peer) {
    if (p.seat !== this.host) return this.fail(p, "notHost", "lobby", false);
    if (this.phase !== "playing") return this.fail(p, "phase", "lobby", false);
    this.phase = "lobby";
    this.seed = 0;
    this.log = [];
    this.logBytes = 0;
    this.seats = this.seats.map((s) => (s && !s.gone ? { ...s, ready: false } : null));
    this.pickHost();
    this.touch();
  }

  private leave(p: Peer) {
    const seat = p.seat;
    this.drop(p, CLOSE.left, "left");
    this.free(seat);
  }

  // ---- the seats -----------------------------------------------------------------------------

  /** A seat let go: empty again in the lobby; in a game, kept but gone. */
  private free(i: number) {
    const s = this.seats[i];
    if (!s) return;
    if (s.peer) this.drop(s.peer, CLOSE.left, "left");
    if (this.phase === "lobby") this.seats[i] = null;
    else {
      s.gone = true;
      s.ready = false;
      s.away ||= this.now();
    }
    if (i === this.host) this.pickHost();
    this.checkEmpty();
    this.touch();
  }

  /** The host is gone or away too long: the first player still connected takes over (or, failing that, still in the room). */
  private pickHost() {
    const all = [...this.seats.keys()];
    const here = (i: number) => !!this.seats[i] && !this.seats[i]!.gone;
    const live = (i: number) => here(i) && !!this.seats[i]!.peer;
    const cur = this.host;
    if (live(cur)) return;
    const next = all.find(live) ?? (here(cur) ? cur : all.find(here)) ?? -1;
    if (next !== this.host) {
      this.host = next;
      this.touch();
    }
  }

  private checkEmpty() {
    const anyone = this.seats.some((s) => s && !s.gone);
    if (anyone) this.emptySince = 0;
    else if (!this.emptySince) this.emptySince = this.now();
  }

  // ---- saying things -------------------------------------------------------------------------

  private touch() {
    this.changed = true;
    this.dirty = "state";
  }

  /** Everyone seated hears what changed, once per event. */
  private flush() {
    if (!this.changed) return;
    this.changed = false;
    this.broadcast({ t: "room", room: this.view() });
  }

  private say(p: Peer, m: unknown) {
    if (!p.closed) p.conn.send(JSON.stringify(m));
  }

  private broadcast(m: unknown) {
    const line = JSON.stringify(m);
    for (const s of this.seats) if (s?.peer) s.peer.conn.send(line);
  }

  /** A message refused: told why; a broken rule (not a tap at the wrong time) counts towards being dropped. */
  private fail(p: Peer, code: ErrorCode, of?: string, strike = true) {
    this.say(p, of ? { t: "error", code, of } : { t: "error", code });
    if (strike) this.strike(p);
  }

  private strike(p: Peer, n = 1) {
    const now = this.now();
    p.strikes = Math.max(0, p.strikes - (now - p.struck) / STRIKE_FADE) + n;
    p.struck = now;
    if (p.strikes > MAX_STRIKES) this.drop(p, CLOSE.bad, "bad");
  }

  /** A socket that can't come in (full, started, no hello): told, closed. */
  private refuse(p: Peer, code: "full" | "started" | "hello") {
    this.say(p, { t: "error", code });
    this.drop(p, CLOSE[code], code);
  }

  /** A socket the room closes itself: told, closed, its seat (if still its own) away from now. */
  private drop(p: Peer, code: number, why: string) {
    if (p.closed) return;
    this.say(p, { t: "bye", why });
    p.conn.close(code, why);
    this.close(p);
  }

  /** The page's allowance of messages (a token bucket); over it, the message is dropped and the page told. */
  private take(p: Peer, b: Bucket, r: { rate: number; burst: number }) {
    const now = this.now();
    b.n = Math.min(r.burst, b.n + ((now - b.at) / 1000) * r.rate);
    b.at = now;
    if (b.n >= 1) {
      b.n -= 1;
      return true;
    }
    if (now - p.warned >= 1000) {
      p.warned = now;
      this.say(p, { t: "error", code: "rate" });
    }
    this.strike(p, 0.25);
    return false;
  }
}
