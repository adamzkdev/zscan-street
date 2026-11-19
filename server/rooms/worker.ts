/**
 * ZK PARTY's online rooms on Cloudflare: a Worker that makes rooms, and one Durable Object per
 * room (named by its code) running the same room.ts as the Node server (main.ts), on the same
 * paths (protocol.ts).
 *
 * Sockets use the hibernation API: a quiet lobby costs nothing, the heartbeat is answered by
 * Cloudflare without waking the room, and the room is kept in the object's storage (SQLite backed)
 * so it wakes up where it was. Seats and settings are written at once; the relay's log once the
 * game goes quiet for 2 s, or every 10 s (a room only hibernates after 10 s of quiet). Timers are
 * the object's alarm, set to the room's next `wake()`.
 *
 *   cd server/rooms && npx -y wrangler@4 dev       a local room server on :8787, no account used
 *
 * In ZStreet's production worker (one origin for the site and the rooms, so the page's default
 * server, src/net/rooms.ts, is its own origin): bind the Durable Object and hand it /rooms/*:
 *
 *   import { Room, roomsFetch, isRoomsPath } from "./server/rooms/worker";
 *   export { Room };                                  // the class, exported from the worker's entry
 *   …fetch(req, env) { if (isRoomsPath(new URL(req.url).pathname)) return roomsFetch(req, env); … }
 *
 *   wrangler.toml / wrangler.jsonc of that worker:
 *     [[durable_objects.bindings]]  name = "ROOMS"  class_name = "Room"
 *     [[migrations]]  tag = "rooms-v1"  new_sqlite_classes = ["Room"]
 *
 * Vars (wrangler.toml [vars], or --var for dev): ROOMS_ORIGINS, the pages allowed to use the
 * rooms (comma separated, unset: any); ROOMS_GRACE, ROOMS_HOST_GRACE, ROOMS_EMPTY_TTL (ms), the
 * room's clocks shortened for a test.
 */
import { DurableObject } from "cloudflare:workers";
import { Room as Core, type Conn, type Peer, type RoomOpts, type RoomSave } from "./room.ts";
import { CLOSE, HB, MAX_PEERS, cleanCode, newCode } from "./protocol.ts";

export interface Env {
  ROOMS: DurableObjectNamespace;
  ROOMS_ORIGINS?: string;
  ROOMS_GRACE?: string;
  ROOMS_HOST_GRACE?: string;
  ROOMS_EMPTY_TTL?: string;
}
/** What each socket keeps through a hibernation (`dead`: the room closed it, the page has not yet). */
interface Tag {
  seat: number;
  opened: number;
  dead?: boolean;
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
const ms = (v: string | undefined) => (v && Number(v) > 0 ? Number(v) : undefined);
/**
 * A socket whose page has not sent its heartbeat (every 10 s, src/net/rooms.ts) for DEAD ms is
 * closed: its seat then waits for it as any dropped one. Looked at every SWEEP ms while anyone is in.
 */
const SWEEP = 30_000;
const DEAD = 45_000;

/**
 * Rooms made per address, counted in this isolate only: a best effort (one address usually lands
 * on the same machine). A rate limiting rule on the zone is the real fence.
 */
const made = new Map<string, number[]>();
const MADE_MAX = 12;
const MADE_WINDOW = 10 * 60_000;
function mayMake(ip: string) {
  const now = Date.now();
  const list = (made.get(ip) ?? []).filter((t) => now - t < MADE_WINDOW);
  if (made.size > 10_000) made.clear();
  const ok = list.length < MADE_MAX;
  if (ok) list.push(now);
  made.set(ip, list);
  return ok;
}

function originOk(req: Request, env: Env) {
  const allowed = (env.ROOMS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const o = req.headers.get("origin");
  return !allowed.length || !o || allowed.includes(o);
}

const roomOf = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

/** The paths the rooms answer (for a worker that serves other things too). */
export const isRoomsPath = (p: string) => p === "/rooms" || p.startsWith("/rooms/") || p === "/rooms-health";

/** The rooms' HTTP side: POST /rooms (a new room's code), GET /rooms/CODE/ws (a seat's socket), /health. */
export async function roomsFetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (!originOk(req, env)) return json({ error: "origin" }, 403);
    if (url.pathname === "/health" || url.pathname === "/rooms-health") return json({ ok: true, service: "zstreet-rooms" });
    if (url.pathname === "/rooms" && req.method === "POST") {
      if (!mayMake(req.headers.get("cf-connecting-ip") ?? "?")) return json({ error: "rate" }, 429);
      // (a code already in use answers 409: another one)
      for (let i = 0; i < 6; i++) {
        const code = newCode();
        const r = await roomOf(env, code).fetch(`https://room/create?code=${code}`, { method: "POST" });
        if (r.status === 201) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }
    const m = url.pathname.match(/^\/rooms\/([A-Za-z]{4})\/ws$/);
    if (m) {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "upgrade" }, 426);
      const code = cleanCode(m[1]);
      if (!code) return json({ error: "noRoom" }, 404);
      return roomOf(env, code).fetch(req);
    }
    return json({ error: "notFound" }, 404);
}

export default { fetch: roomsFetch };

export class Room extends DurableObject<Env> {
  private core: Core | null = null;
  private peers = new Map<WebSocket, Peer>();
  private saveT: ReturnType<typeof setTimeout> | undefined;
  private savedAt = 0;
  private alarmAt = 0;
  private sweepAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // the heartbeat, answered by Cloudflare itself: the room sleeps on
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HB, HB));
    // (woken from a hibernation, or after a restart: the room from disk, its sockets back on their seats)
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomSave>("room");
      if (!saved) return;
      const core = Core.from(saved, this.opts());
      for (const ws of ctx.getWebSockets()) {
        const tag = (ws.deserializeAttachment() as Tag | null) ?? { seat: -1, opened: Date.now() };
        if (!tag.dead) this.peers.set(ws, core.attach(this.conn(ws, tag.opened), tag.seat, tag.opened));
      }
      core.settle();
      this.core = core;
    });
  }

  private opts(): RoomOpts {
    return { grace: ms(this.env.ROOMS_GRACE), hostGrace: ms(this.env.ROOMS_HOST_GRACE), emptyTtl: ms(this.env.ROOMS_EMPTY_TTL) };
  }

  private conn(ws: WebSocket, opened: number): Conn {
    return {
      send: (line) => {
        try {
          ws.send(line);
        } catch {
          /* closing already */
        }
      },
      close: (code, why) => {
        // (a socket that never spoke may not get the close from a hibernated room's alarm: the
        // page leaves on the "bye" before it, and a socket marked dead never takes a seat again)
        this.peers.delete(ws);
        try {
          ws.serializeAttachment({ seat: -1, opened, dead: true } satisfies Tag);
          ws.close(code, why);
        } catch {
          /* closed already */
        }
      },
      seated: (seat) => ws.serializeAttachment({ seat, opened } satisfies Tag),
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/create") {
      const code = cleanCode(url.searchParams.get("code"));
      if (this.core || !code) return new Response(null, { status: 409 });
      this.core = new Core(code, this.opts());
      await this.after();
      return new Response(null, { status: 201 });
    }
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response(null, { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // No such room (nothing is written, so this object goes away again), or no room for another
    // socket: told and closed without the hibernation API, whose close before the answer never
    // reaches the page.
    const no = !this.core ? "noRoom" : this.core.size >= MAX_PEERS || this.ctx.getWebSockets().length >= MAX_PEERS * 2 ? "full" : "";
    if (no) {
      server.accept();
      server.send(JSON.stringify({ t: "error", code: no }));
      server.close(CLOSE[no], no);
      return new Response(null, { status: 101, webSocket: client });
    }
    const core = this.core!;
    this.ctx.acceptWebSocket(server);
    const opened = Date.now();
    server.serializeAttachment({ seat: -1, opened } satisfies Tag);
    const p = core.open(this.conn(server, opened), opened);
    if (p) this.peers.set(server, p);
    await this.after();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const p = this.peers.get(ws);
    if (!this.core || !p) return void ws.close(CLOSE.noRoom, "noRoom");
    this.core.receive(p, typeof msg === "string" ? msg : null);
    await this.after();
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.gone(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {
      /* closed already */
    }
    await this.after();
  }

  async webSocketError(ws: WebSocket) {
    this.gone(ws);
    await this.after();
  }

  async alarm() {
    this.alarmAt = 0;
    const now = Date.now();
    if (this.sweepAt && now >= this.sweepAt) {
      this.sweepAt = 0;
      for (const ws of this.ctx.getWebSockets()) {
        const p = this.peers.get(ws);
        const heard = Math.max(p?.opened ?? 0, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0);
        if (now - heard < DEAD) continue;
        this.gone(ws);
        try {
          ws.close(1001, "silent");
        } catch {
          /* closed already */
        }
      }
    }
    this.core?.tick();
    await this.after();
  }

  private gone(ws: WebSocket) {
    const p = this.peers.get(ws);
    this.peers.delete(ws);
    if (p) this.core?.close(p);
  }

  /** After every event: an ended room wiped, what changed written, the alarm on the room's next wake. */
  private async after() {
    const core = this.core;
    if (!core) return;
    if (core.expired) {
      core.shutdown();
      this.core = null;
      this.peers.clear();
      clearTimeout(this.saveT);
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    if (core.dirty === "state" || (core.dirty === "log" && Date.now() - this.savedAt > 10_000)) await this.save();
    else if (core.dirty === "log") {
      clearTimeout(this.saveT);
      this.saveT = setTimeout(() => void this.save(), 2000);
    }
    let at = core.wake();
    if (this.peers.size) at = Math.min(at, (this.sweepAt ||= Date.now() + SWEEP));
    if (at !== this.alarmAt) {
      this.alarmAt = at;
      await this.ctx.storage.setAlarm(at);
    }
  }

  private async save() {
    clearTimeout(this.saveT);
    const core = this.core;
    if (!core || !core.dirty) return;
    core.dirty = "";
    this.savedAt = Date.now();
    await this.ctx.storage.put("room", core.save());
  }
}
