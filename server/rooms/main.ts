/**
 * ZK PARTY's online rooms in Node: many rooms in one process, each the same room.ts the
 * Cloudflare Worker runs (worker.ts), same paths, same protocol (protocol.ts). Rooms live in
 * memory: a restart ends them. For development, and any host that runs Node.
 *
 *   npm run rooms                      (port 3011, or PORT)
 *   ROOMS_GRACE=3000 ROOMS_HOST_GRACE=1500 npm run rooms     (shorter clocks, for test.ts)
 *
 * A phone on the same Wi-Fi reaches it at ws://<this computer's address>:3011 (src/net/rooms.ts
 * picks that in dev). Every address is held to a few rooms and sockets (LIMIT); behind a proxy set
 * TRUST_PROXY=1 so the address is read from X-Forwarded-For (otherwise anyone could claim any).
 * ROOMS_ORIGINS (comma separated) keeps the rooms to those pages.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { Room, type Peer } from "./room.ts";
import { CLOSE, GRACE_MS, HOST_GRACE_MS, MAX_FRAME, cleanCode, newCode } from "./protocol.ts";

const PORT = Number(process.env.PORT ?? 3011);
const ms = (v: string | undefined) => (v && Number(v) > 0 ? Number(v) : undefined);
const OPTS = { grace: ms(process.env.ROOMS_GRACE), hostGrace: ms(process.env.ROOMS_HOST_GRACE), emptyTtl: ms(process.env.ROOMS_EMPTY_TTL) };
const ORIGINS = (process.env.ROOMS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
/**
 * Per address, over WINDOW: rooms made, codes tried that led to no room (someone guessing codes);
 * at once: rooms alive that it made, sockets open. Generous: a whole school or a phone carrier
 * can share one address.
 */
const LIMIT = { made: 12, live: 6, misses: 40, sockets: 24, window: 10 * 60_000 };
const MAX_ROOMS = 5000;
/** A page that stops reading: dropped rather than buffered for (bytes). */
const MAX_BUFFERED = 1 << 20;

const rooms = new Map<string, { room: Room; ip: string }>();
const made = new Map<string, number[]>();
const misses = new Map<string, number[]>();
const sockets = new Map<string, number>();

/** Events from an address within the window, this one counted when under `max`. */
function within(m: Map<string, number[]>, ip: string, max: number) {
  const now = Date.now();
  const list = (m.get(ip) ?? []).filter((t) => now - t < LIMIT.window);
  const ok = list.length < max;
  if (ok) list.push(now);
  m.set(ip, list);
  return ok;
}
const over = (m: Map<string, number[]>, ip: string, max: number) => (m.get(ip) ?? []).filter((t) => Date.now() - t < LIMIT.window).length >= max;

function addressOf(req: IncomingMessage) {
  const fwd = process.env.TRUST_PROXY ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
  return fwd || req.socket.remoteAddress || "?";
}
const originOk = (req: IncomingMessage) => !ORIGINS.length || !req.headers.origin || ORIGINS.includes(req.headers.origin);

function reply(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(body === null ? "" : JSON.stringify(body));
}

function create(ip: string): [number, unknown] {
  if (rooms.size >= MAX_ROOMS) return [503, { error: "busy" }];
  const live = [...rooms.values()].filter((r) => r.ip === ip).length;
  if (live >= LIMIT.live || !within(made, ip, LIMIT.made)) return [429, { error: "rate" }];
  let code = newCode();
  while (rooms.has(code)) code = newCode();
  rooms.set(code, { room: new Room(code, OPTS), ip });
  return [200, { code }];
}

const http = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (req.method === "OPTIONS") return reply(res, 204, null);
  if (!originOk(req)) return reply(res, 403, { error: "origin" });
  if (req.method === "GET" && path === "/health") {
    let peers = 0;
    for (const { room } of rooms.values()) peers += room.size;
    return reply(res, 200, { ok: true, service: "rooms (node)", rooms: rooms.size, peers, grace: OPTS.grace ?? GRACE_MS, hostGrace: OPTS.hostGrace ?? HOST_GRACE_MS });
  }
  if (req.method === "POST" && path === "/rooms") {
    // (no body is read: a room needs nothing to be made)
    req.resume();
    const [code, body] = create(addressOf(req));
    return reply(res, code, body);
  }
  reply(res, 404, { error: "notFound" });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
wss.on("error", (e) => console.error("rooms socket server:", e.message));

function deny(socket: Duplex, status: string) {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

http.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  const m = new URL(req.url ?? "/", "http://x").pathname.match(/^\/rooms\/([A-Za-z]{4})\/ws$/);
  if (!m) return deny(socket, "404 Not Found");
  if (!originOk(req)) return deny(socket, "403 Forbidden");
  const ip = addressOf(req);
  if ((sockets.get(ip) ?? 0) >= LIMIT.sockets || over(misses, ip, LIMIT.misses)) return deny(socket, "429 Too Many Requests");
  wss.handleUpgrade(req, socket, head, (ws) => welcome(ws, ip, cleanCode(m[1])));
});

/** A socket on a room's path: into the room, or told there is none. */
function welcome(ws: WebSocket, ip: string, code: string) {
  sockets.set(ip, (sockets.get(ip) ?? 0) + 1);
  ws.on("close", () => {
    const n = (sockets.get(ip) ?? 1) - 1;
    if (n > 0) sockets.set(ip, n);
    else sockets.delete(ip);
  });
  // (a broken frame from one page must not take the server down)
  ws.on("error", () => ws.terminate());
  const r = rooms.get(code);
  if (!r) {
    within(misses, ip, Infinity);
    ws.send(JSON.stringify({ t: "error", code: "noRoom" }));
    return ws.close(CLOSE.noRoom, "noRoom");
  }
  const room = r.room;
  const peer: Peer | null = room.open({
    send: (line) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED) return ws.terminate();
      ws.send(line);
    },
    close: (c, why) => ws.close(c, why),
  });
  if (!peer) return;
  let alive = true;
  ws.on("pong", () => (alive = true));
  ws.on("message", (data, binary) => {
    try {
      room.receive(peer, binary ? null : data.toString());
    } catch (e) {
      // (a bug in one room must not take the server down)
      console.error(`room ${code}:`, e);
    }
  });
  ws.on("close", () => room.close(peer));
  // a connection that died without a word is found within 30 s (its seat then waits for it)
  const beat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 15_000);
  ws.on("close", () => clearInterval(beat));
}

// the rooms' clocks: hellos due, seats given up, hosts handed over, rooms ended
setInterval(() => {
  for (const [code, { room }] of rooms) {
    try {
      room.tick();
      if (room.expired) {
        room.shutdown();
        rooms.delete(code);
      }
    } catch (e) {
      // (a bug in one room must not stop the others)
      console.error(`room ${code}:`, e);
    }
  }
  const now = Date.now();
  for (const m of [made, misses]) for (const [ip, list] of m) if (!list.some((t) => now - t < LIMIT.window)) m.delete(ip);
}, 1000);

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    for (const { room } of rooms.values()) room.shutdown();
    process.exit(0);
  });

http.listen(PORT, () => console.log(`rooms on :${PORT}${OPTS.grace || OPTS.hostGrace ? ` (grace ${OPTS.grace ?? GRACE_MS} ms, host ${OPTS.hostGrace ?? HOST_GRACE_MS} ms)` : ""}`));
