/**
 * ZK PARTY online: the rooms' protocol, shared by the room (room.ts), its two hosts (main.ts in
 * Node, worker.ts on Cloudflare) and the page (src/net/rooms.ts). Plain TypeScript: no Node, no DOM,
 * no Cloudflare, so all four read the same rules.
 *
 * A room is private: four letters (CODE_ABC, no vowels so no words, nothing to misread), shared as
 * a code or a link (party.html?room=CODE). Four seats; the first to join is the host; empty seats
 * are played by the AI once the host starts. No wallet: a name and a face (a zkSNARK's number).
 *
 * HTTP
 *   POST /rooms              → 200 { code }          a new, empty room (gone after EMPTY_TTL if nobody comes)
 *                            → 429 { error: "rate" }  too many rooms from this address
 *   GET  /health             → 200 { ok, … }
 *   GET  /rooms/CODE/ws      Upgrade: websocket, the room's socket
 *
 * The socket: JSON text frames, one message each, at most MAX_FRAME bytes, every message with `t`.
 *
 *   page → room
 *   { t: "hello", token, name, avatar, since? }  first, within HELLO_MS. `token`: this browser's own
 *                                     secret (TOKEN_RE), never shown to anyone: the same token takes
 *                                     its seat back after a drop (GRACE_MS; any time once started).
 *                                     `since`: the last relay seen, to get the ones missed.
 *   { t: "me", name, avatar }         lobby: a new name or face
 *   { t: "ready", on }                lobby
 *   { t: "settings", settings }       host, lobby: any of mode, map, turns, skill
 *   { t: "start" }                    host, lobby, every other player ready
 *   { t: "lobby" }                    host, playing: back to the lobby (the game is over, a rematch)
 *   { t: "game", data }               playing: any JSON (MAX_DATA), relayed to every seat, sender included
 *   { t: "ping", at }                 → pong, with the room's clock
 *   { t: "leave" }                    for good: the seat frees (lobby) or is marked gone (playing)
 *   {"t":"hb"}                        exactly this text: answered with the same, nothing else (a hosted
 *                                     room answers it without waking up, worker.ts)
 *
 *   room → page
 *   { t: "welcome", seat, room, now, seq, oldest }  after hello; then every relay after `since` still kept
 *                                     (from `oldest`: older ones are lost, the game must resync)
 *   { t: "room", room }               the room changed (a RoomView, whole: it is small)
 *   { t: "start", seed, seats, settings, seq }      the host started: a 32-bit seed, the frozen seats
 *   { t: "game", seq, from, data }    a relay: `seq` counts up by one for the whole room, `from` a seat
 *   { t: "pong", at, now }
 *   { t: "error", code, of? }         an ErrorCode; `of` the message refused
 *   { t: "bye", why }                 the room closes this socket (a CLOSE code follows)
 *
 * Every message is checked (shape, size, rate: RATE); a page that keeps breaking the rules is
 * dropped. Names are cleaned (cleanName) on both sides; the page still escapes everything it shows.
 */

export const SEATS = 4;
/** Letters a code is made of: no vowels (no words), no I, L, O, U, Y (nothing to misread). */
export const CODE_ABC = "BCDFGHJKMNPQRSTVWXZ";
export const CODE_LEN = 4;
export const NAME_MAX = 16;
/** A frame from a page, in bytes (the Node host's maxPayload); a relay's data as JSON, in characters. */
export const MAX_FRAME = 4096;
export const MAX_DATA = 2048;
/** A dropped seat is kept this long for its token (ms); a dropped host hands over sooner. */
export const GRACE_MS = 60_000;
export const HOST_GRACE_MS = 15_000;
/** A room with nobody in it is kept this long (the creator's first join, a reload); none lives longer than MAX_AGE_MS. */
export const EMPTY_TTL_MS = 120_000;
export const MAX_AGE_MS = 8 * 3600_000;
/** A socket must say hello within this (ms). */
export const HELLO_MS = 10_000;
/** Sockets a room takes at once (seated or about to be): four seats, a reload or two, a few strays. */
export const MAX_PEERS = 12;
/** Messages a page may send: relays (lockstep frames: 60 a second), everything else (taps). Per second, and a burst. */
export const RATE = { relay: { rate: 60, burst: 120 }, other: { rate: 5, burst: 15 } } as const;
/** The relays a room keeps for pages coming back (by count and by size). */
export const LOG_MAX = 4096;
export const LOG_BYTES = 512 * 1024;
/** The heartbeat, word for word (a hosted room answers it without waking). */
export const HB = '{"t":"hb"}';
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** The ways to play online: the board first; more join here (and the lobby shows them). */
export const MODES = ["board"] as const;
export const MAPS = ["genesis", "astana", "singapore"] as const;
export const TURNS = [10, 15, 20] as const;
/** The AI's skill: Easy, Normal, Hard, Pro (select.ts LEVELS). */
export const SKILLS = [0, 1, 2, 3] as const;

export type Mode = (typeof MODES)[number];
export type MapKey = (typeof MAPS)[number];
export interface Settings {
  mode: Mode;
  map: MapKey;
  turns: (typeof TURNS)[number];
  skill: (typeof SKILLS)[number];
}
export const DEFAULT_SETTINGS: Settings = { mode: "board", map: "genesis", turns: 10, skill: 1 };

export type Phase = "lobby" | "playing";
/** A seat as everyone sees it (null in RoomView.seats: empty, the AI's once started). */
export interface SeatView {
  name: string;
  avatar: number;
  ready: boolean;
  /** Connected now. */
  online: boolean;
  /** Left a started game for good (or never came back): the seat stays theirs, the game decides who plays it. */
  gone: boolean;
}
export interface RoomView {
  code: string;
  phase: Phase;
  /** The host's seat (-1: nobody in the room). */
  host: number;
  settings: Settings;
  seats: (SeatView | null)[];
  /** The game's seed (0 in the lobby). */
  seed: number;
}
/** A seat as the game starts with it. */
export type StartSeat = { seat: number; ai: false; name: string; avatar: number } | { seat: number; ai: true; skill: number };

/** The seats a game starts with, from the room as everyone sees it: an empty seat is the AI's. */
export function startSeats(r: RoomView): StartSeat[] {
  return r.seats.map((s, seat): StartSeat => (s ? { seat, ai: false, name: s.name, avatar: s.avatar } : { seat, ai: true, skill: r.settings.skill }));
}

export type ErrorCode = "bad" | "big" | "rate" | "noRoom" | "full" | "started" | "notHost" | "notReady" | "phase" | "hello";

/** Close codes (4000 and up are the room's own). The page comes back after any other. */
export const CLOSE = {
  bad: 4001,
  noRoom: 4004,
  hello: 4008,
  full: 4009,
  started: 4010,
  replaced: 4011,
  left: 4012,
  expired: 4013,
  rate: 4029,
} as const;
/** A socket closed with one of these is not coming back by itself. */
export const FINAL = new Set<number>(Object.values(CLOSE));

/**
 * A player's name, safe to keep and to show: no control or invisible characters (bidi overrides,
 * zero widths), no markup, no pile of accents, single spaces, at most NAME_MAX characters.
 * "" when nothing is left.
 */
export function cleanName(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v
    .slice(0, 256)
    .normalize("NFC")
    .replace(/\p{C}/gu, "")
    .replace(/[<>&"`\\]/g, "")
    .replace(/(\p{M}{2})\p{M}+/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  return [...s].slice(0, NAME_MAX).join("").trim();
}


/** A face: a zkSNARK's id (1 … 10,000). */
export const validAvatar = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10_000;

/** A room's code as typed (any case, spaces, a pasted link), or "" when it can't be one. */
export function cleanCode(v: unknown): string {
  if (typeof v !== "string") return "";
  const up = v.slice(0, 512).toUpperCase();
  const m = up.match(/ROOM=([A-Z]+)/);
  const c = m ? m[1] : up.replace(/[^A-Z]/g, "");
  return c.length === CODE_LEN && [...c].every((ch) => CODE_ABC.includes(ch)) ? c : "";
}

/** A fresh code (the caller makes sure no room has it). */
export function newCode(): string {
  const r = crypto.getRandomValues(new Uint32Array(CODE_LEN));
  return Array.from(r, (n) => CODE_ABC[n % CODE_ABC.length]).join("");
}

/** A game's seed: 32 random bits, never 0 (the games' rng treats 0 as 1). */
export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;

/** Settings from a page: `cur` with every valid field of `v` taken; null when anything in it is wrong. */
export function cleanSettings(v: unknown, cur: Settings): Settings | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Settings = { ...cur };
  for (const [k, x] of Object.entries(o)) {
    if (k === "mode" && MODES.includes(x as Mode)) out.mode = x as Mode;
    else if (k === "map" && MAPS.includes(x as MapKey)) out.map = x as MapKey;
    else if (k === "turns" && TURNS.includes(x as Settings["turns"])) out.turns = x as Settings["turns"];
    else if (k === "skill" && SKILLS.includes(x as Settings["skill"])) out.skill = x as Settings["skill"];
    else return null;
  }
  return out;
}
