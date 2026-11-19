/**
 * The few Cloudflare Workers globals worker.ts uses, declared by hand so it typechecks without
 * @cloudflare/workers-types (tsconfig.worker.json, over the DOM's Request, Response and WebSocket).
 * Only what is used; the names and shapes are Cloudflare's own.
 */
declare module "cloudflare:workers" {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void;
  getWebSocketAutoResponseTimestamp(ws: WebSocket): Date | null;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string);
}

/** Cloudflare's WebSocket: what the DOM's has, and an attachment that survives hibernation. */
interface WebSocket {
  /** The standard API (no hibernation): the Worker handles this socket's events itself. */
  accept(): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

/** A 101 answer carries the page's end of the WebSocketPair. */
interface ResponseInit {
  webSocket?: WebSocket | null;
}
