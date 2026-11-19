/**
 * ZK PARTY online, the page's side of a room: the connection, the room as the server tells it,
 * and the relay the game talks through. The protocol is server/rooms/protocol.ts.
 *
 *   const code = await createRoom();
 *   const room = new RoomClient(code, { name, avatar });
 *   room.on("room", (r) => draw(r));                 // the lobby, at every change
 *   room.on("start", ({ seed, seats }) => …);         // the game begins (again after a reload)
 *   room.on("game", ({ seq, from, data }) => …);      // every relay, in the room's one order
 *   room.send({ …a board choice, a lockstep frame… });
 *
 * It comes back by itself after a drop (the same token: the same seat, and the relays missed sent
 * again; "gap" if some were too old to be kept), says it is alive every 10 s (the room's answer
 * measures the round trip; no answer in 25 s and the socket is taken for dead), and stops for good
 * when the room says so ("closed": full, started, no such room, replaced by another tab, left).
 *
 * The server: VITE_ROOMS_SERVER (wss://…, at build time); unset, in production the page's own origin
 * (the site's worker routes /rooms/* to the rooms' Durable Object: server/rooms/worker.ts), and in
 * dev the Node one beside the page (npm run rooms, port 3011, or ?roomsport=), so a phone on the
 * same Wi-Fi reaches it too. `VITE_ROOMS_SERVER=off` turns online play off (`roomsOnline()`).
 */
import { FINAL, HB, cleanCode, startSeats, type ErrorCode, type RoomView, type Settings, type StartSeat } from "../../server/rooms/protocol";

const env = import.meta.env ?? {};
const devPort = env.DEV ? (new URLSearchParams(location.search).get("roomsport") ?? "3011").replace(/\D/g, "") : "";
const sameOrigin = () => (typeof location === "undefined" ? "" : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
const asked = env.VITE_ROOMS_SERVER as string | undefined;
export const ROOMS_SERVER = (asked === "off" ? "" : (asked ?? (env.DEV ? `ws://${location.hostname}:${devPort}` : sameOrigin()))).replace(/\/$/, "");
export const roomsOnline = () => !!ROOMS_SERVER;
const HTTP = ROOMS_SERVER.replace(/^ws/, "http");

const HB_EVERY = 10_000;
const HB_DEAD = 25_000;
/** Waits between tries to come back (ms), the last one repeated; given up after GIVE_UP. */
const RETRY = [250, 1000, 2000, 4000, 8000];
const GIVE_UP = 5 * 60_000;

const TKEY = "pt-net-token";
let token = "";
/** This browser's secret for the rooms: it takes a seat back after a drop or a reload. Never shown to anyone. */
export function myToken() {
  if (token) return token;
  try {
    token = localStorage.getItem(TKEY) ?? "";
  } catch {
    /* a private window: this visit only */
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    const b = crypto.getRandomValues(new Uint8Array(24));
    token = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    try {
      localStorage.setItem(TKEY, token);
    } catch {
      /* this visit only */
    }
  }
  return token;
}

/** The link that opens a room straight away (party.html?room=CODE). */
export const roomLink = (code: string) => `${location.origin}${env.BASE_URL ?? "/"}party.html?room=${code}`;

/** A new room's code; throws "rate" (too many rooms from here), "busy" or "offline". */
export async function createRoom(): Promise<string> {
  if (!HTTP) throw new Error("offline");
  let r: Response;
  try {
    r = await fetch(`${HTTP}/rooms`, { method: "POST" });
  } catch {
    throw new Error("offline");
  }
  const j = (await r.json().catch(() => ({}))) as { code?: unknown; error?: unknown };
  const code = cleanCode(j.code);
  if (!r.ok || !code) throw new Error(typeof j.error === "string" ? j.error : "busy");
  return code;
}

export type NetState = "connecting" | "open" | "reconnecting" | "closed";

export interface RoomEvents {
  state: NetState;
  /** Seated (again): the room as it stands. */
  welcome: { seat: number; room: RoomView };
  room: RoomView;
  /** The game begins: also sent to a page that comes back (or reloads) into a game already on. */
  start: { seed: number; seats: StartSeat[]; settings: Settings };
  game: { seq: number; from: number; data: unknown };
  /** Relays this page will never get (it was away longer than the room keeps them): the game must catch up another way. */
  gap: { from: number; to: number };
  error: { code: ErrorCode; of?: string };
  /** The room is over for this page: noRoom, full, started, replaced, left, expired, bad, lost. */
  closed: { why: string };
}
type Fn<K extends keyof RoomEvents> = (v: RoomEvents[K]) => void;

export class RoomClient {
  readonly code: string;
  state: NetState = "connecting";
  room: RoomView | null = null;
  /** This page's seat (-1 until seated). */
  mySeat = -1;
  /** The last round trip (ms). */
  rtt = 0;
  private skew = 0;
  private ws: WebSocket | null = null;
  /** The last relay seen. */
  private seq = 0;
  /** The seed of the game this page was told about (0: none on). */
  private playing = 0;
  private me: { name: string; avatar: number };
  private fns = new Map<keyof RoomEvents, Set<Fn<never>>>();
  private tries = 0;
  private lostSince = 0;
  private retryT: ReturnType<typeof setTimeout> | undefined;
  private hbT: ReturnType<typeof setInterval> | undefined;
  private hbSent = 0;
  private hbOut = false;
  private pingT: ReturnType<typeof setInterval> | undefined;
  private why = "";
  private ended = false;

  constructor(code: string, me: { name: string; avatar: number }) {
    this.code = code;
    this.me = { ...me };
    addEventListener("online", this.nudge);
    document.addEventListener("visibilitychange", this.nudge);
    this.connect();
  }

  get isHost() {
    return this.mySeat >= 0 && this.room?.host === this.mySeat;
  }
  /** The room's clock now (ms), as well as the last ping could tell: for anything the pages must time together. */
  serverNow() {
    return Date.now() + this.skew;
  }

  on<K extends keyof RoomEvents>(k: K, fn: Fn<K>): () => void {
    let set = this.fns.get(k);
    if (!set) this.fns.set(k, (set = new Set()));
    set.add(fn as Fn<never>);
    return () => set.delete(fn as Fn<never>);
  }
  private emit<K extends keyof RoomEvents>(k: K, v: RoomEvents[K]) {
    for (const fn of this.fns.get(k) ?? []) {
      try {
        (fn as Fn<K>)(v);
      } catch (e) {
        console.error(`[rooms] ${k}:`, e);
      }
    }
  }

  // ---- what the page says ---------------------------------------------------------------------

  /** A relay for every seat (this one too), in the room's one order. False when not connected or no game is on. */
  send(data: unknown) {
    return this.room?.phase === "playing" && this.raw({ t: "game", data });
  }
  ready(on: boolean) {
    return this.raw({ t: "ready", on });
  }
  /** The host's settings (any of them). */
  setSettings(s: Partial<Settings>) {
    return this.raw({ t: "settings", settings: s });
  }
  start() {
    return this.raw({ t: "start" });
  }
  /** The host: everyone back to the lobby. */
  backToLobby() {
    return this.raw({ t: "lobby" });
  }
  /** A new name or face (the lobby only); kept for the next hello either way. */
  setMe(name: string, avatar: number) {
    this.me = { name, avatar };
    return this.raw({ t: "me", name, avatar });
  }
  /** Leave for good: the seat goes to someone else (or, once started, is marked gone). */
  leave() {
    this.raw({ t: "leave" });
    this.end("left");
  }
  /** A clock reading: the round trip, and the room's clock against ours. */
  ping() {
    return this.raw({ t: "ping", at: Date.now() });
  }

  private raw(m: unknown) {
    if (this.state !== "open" || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  // ---- the connection -------------------------------------------------------------------------

  private set(s: NetState) {
    if (this.state === s) return;
    this.state = s;
    this.emit("state", s);
  }

  private connect() {
    if (this.ended) return;
    clearTimeout(this.retryT);
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${ROOMS_SERVER}/rooms/${this.code}/ws`);
    } catch {
      return this.lost();
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", token: myToken(), name: this.me.name, avatar: this.me.avatar, since: this.seq }));
    ws.onmessage = (e) => ws === this.ws && this.onMessage(String(e.data));
    ws.onclose = (e) => ws === this.ws && this.onClose(e.code);
    ws.onerror = () => {};
  }

  private onMessage(raw: string) {
    if (raw === HB) {
      this.rtt = Date.now() - this.hbSent;
      this.hbOut = false;
      return;
    }
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (m.t === "game") {
      const seq = Number(m.seq);
      // (one already seen: sent again after a reconnect)
      if (!(seq > this.seq)) return;
      this.seq = seq;
      this.emit("game", { seq, from: Number(m.from), data: m.data });
    } else if (m.t === "room") {
      this.setRoom(m.room as RoomView);
    } else if (m.t === "welcome") {
      this.mySeat = Number(m.seat);
      this.tries = 0;
      this.lostSince = 0;
      this.skew = Number(m.now) - Date.now();
      const oldest = Number(m.oldest);
      if (this.seq > 0 && oldest > this.seq + 1) this.emit("gap", { from: this.seq + 1, to: oldest - 1 });
      // (a fresh page, or one back from a room made again from disk: it follows the room's count)
      if (this.seq === 0 || this.seq > Number(m.seq)) this.seq = Math.max(0, oldest - 1);
      this.set("open");
      this.beat(true);
      this.emit("welcome", { seat: this.mySeat, room: m.room as RoomView });
      this.setRoom(m.room as RoomView);
    } else if (m.t === "start") {
      this.playing = Number(m.seed);
      this.emit("start", { seed: Number(m.seed), seats: m.seats as StartSeat[], settings: m.settings as Settings });
    } else if (m.t === "pong") {
      const at = Number(m.at);
      if (at > 0) {
        this.rtt = Date.now() - at;
        this.skew = Number(m.now) + this.rtt / 2 - Date.now();
      }
    } else if (m.t === "error") {
      this.emit("error", { code: m.code as ErrorCode, of: typeof m.of === "string" ? m.of : undefined });
      if (m.code === "noRoom" || m.code === "full" || m.code === "started") this.why = String(m.code);
    } else if (m.t === "bye") {
      // (the room closes this socket: its word is final, whether or not the close itself arrives)
      this.end(String(m.why));
    }
  }

  private setRoom(r: RoomView) {
    this.room = r;
    if (r.phase === "lobby") this.playing = 0;
    this.emit("room", r);
    // a page back into a game already on (a reload, a long drop): the game starts for it here
    if (r.phase === "playing" && r.seed && r.seed !== this.playing) {
      this.playing = r.seed;
      this.emit("start", { seed: r.seed, seats: startSeats(r), settings: r.settings });
    }
  }

  private onClose(code: number) {
    this.ws = null;
    this.beat(false);
    if (this.ended) return;
    if (FINAL.has(code) || this.why) return this.end(this.why || "closed");
    this.lost();
  }

  /** The socket is gone without a word from the room: try again, sooner then later, for a while. */
  private lost() {
    if (this.ended) return;
    this.set("reconnecting");
    const now = Date.now();
    this.lostSince ||= now;
    if (now - this.lostSince > GIVE_UP) return this.end("lost");
    clearTimeout(this.retryT);
    this.retryT = setTimeout(() => this.connect(), RETRY[Math.min(this.tries++, RETRY.length - 1)]);
  }

  /** Back on screen, or back online: try now rather than at the next turn; an open socket is checked. */
  private nudge = () => {
    if (this.ended || document.visibilityState === "hidden") return;
    if (this.state === "reconnecting") {
      this.tries = 0;
      this.connect();
    } else if (this.state === "open") this.hb();
  };

  private beat(on: boolean) {
    clearInterval(this.hbT);
    clearInterval(this.pingT);
    this.hbOut = false;
    if (!on) return;
    this.hbT = setInterval(() => this.hb(), HB_EVERY);
    // (the room's clock: read now, then every 30 s while a game is on; a lobby's room may sleep)
    this.ping();
    this.pingT = setInterval(() => this.room?.phase === "playing" && this.ping(), 30_000);
  }

  private hb() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (this.hbOut && Date.now() - this.hbSent > HB_DEAD) {
      // (no answer: a socket the network lost without a word; let it go and come back)
      this.ws = null;
      ws.onclose = null;
      ws.close();
      this.beat(false);
      return this.lost();
    }
    if (this.hbOut) return;
    this.hbOut = true;
    this.hbSent = Date.now();
    ws.send(HB);
  }

  /** Over for this page: the socket closed, nothing comes back. */
  private end(why: string) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.retryT);
    this.beat(false);
    removeEventListener("online", this.nudge);
    document.removeEventListener("visibilitychange", this.nudge);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      // (what was sent last, a leave, goes before the close)
      if (ws.readyState <= WebSocket.OPEN) ws.close(1000);
    }
    this.set("closed");
    this.emit("closed", { why });
  }

  /** Close without leaving (the page goes away; the seat waits for a while). */
  close() {
    this.end("closed");
  }
}
