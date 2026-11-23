import { DurableObject } from "cloudflare:workers";

/**
 * The game's shared city (src/gta/net.ts): one Durable Object per world, everyone playing ZStreet
 * in it at once. Each page sends where it is a few times a second (its zkSNARK, on foot or in which
 * car); the world stamps it with the sender's id and hands it to everyone else. Nothing is kept:
 * no names, no accounts, no history. A world takes MAX players; the page tries the next one when
 * one is full.
 *
 *   GET /world/<name> (WebSocket)   → { t: "hi", id, n }, then others' states { id, … } and { id, gone: 1 }
 *
 * The sockets use the hibernation API, so an empty world costs nothing.
 */
const MAX = 80;
/** A state is a small JSON object: anything longer is dropped. */
const LONGEST = 240;
/** Per socket: no more than this many states a second are passed on. */
const RATE = 12;

interface Tag {
  id: string;
}

const KEYS = ["x", "y", "z", "h", "c", "v", "s"] as const;

export class World extends DurableObject {
  /** When each socket last sent (rate), kept in memory only. */
  private last = new Map<string, number[]>();

  async fetch(req: Request) {
    if (req.headers.get("upgrade") !== "websocket") return new Response("a WebSocket, please", { status: 426 });
    const open = this.ctx.getWebSockets();
    if (open.length >= MAX) return new Response("full", { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id } satisfies Tag);
    server.send(JSON.stringify({ t: "hi", id, n: open.length + 1 }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (typeof msg !== "string" || msg.length > LONGEST) return;
    const tag = ws.deserializeAttachment() as Tag | null;
    if (!tag) return;
    const now = Date.now();
    const times = (this.last.get(tag.id) ?? []).filter((t) => now - t < 1000);
    if (times.length >= RATE) return;
    times.push(now);
    this.last.set(tag.id, times);
    let s: Record<string, unknown>;
    try {
      s = JSON.parse(msg);
    } catch {
      return;
    }
    // only what a state holds, numbers in range, a car's kind as a short word
    const out: Record<string, unknown> = { id: tag.id };
    for (const k of KEYS) {
      const v = s[k];
      if (k === "c") {
        if (typeof v === "string" && /^[a-z]{0,8}$/.test(v)) out.c = v;
      } else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e5) out[k] = Math.round(v * 100) / 100;
    }
    const line = JSON.stringify(out);
    for (const o of this.ctx.getWebSockets()) if (o !== ws) safeSend(o, line);
  }

  async webSocketClose(ws: WebSocket) {
    this.gone(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.gone(ws);
  }

  private gone(ws: WebSocket) {
    const tag = ws.deserializeAttachment() as Tag | null;
    if (!tag) return;
    this.last.delete(tag.id);
    const line = JSON.stringify({ id: tag.id, gone: 1 });
    for (const o of this.ctx.getWebSockets()) if (o !== ws) safeSend(o, line);
  }
}

function safeSend(ws: WebSocket, line: string) {
  try {
    ws.send(line);
  } catch {
    /* (closing) */
  }
}

/** /world/<name>: the world's object, by name (letters, digits, dashes). */
export function isWorldPath(path: string) {
  return /^\/world\/[a-z0-9-]{1,24}$/.test(path);
}

export function worldFetch(req: Request, ns: DurableObjectNamespace) {
  const name = new URL(req.url).pathname.split("/")[2];
  return ns.get(ns.idFromName(name)).fetch(req);
}
