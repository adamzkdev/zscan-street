/**
 * The rooms' test: four pages (and a few rude ones) against a room server, through the real
 * protocol. Create, join, the fifth refused, bad input, settings, ready, start, the relay's order,
 * a reconnect within the grace, the host handing over, the lobby again, a seat given up, the rate
 * limit, the hello timeout, the rooms per address.
 *
 *   node server/rooms/test.ts                                  its own server (main.ts) on :3019, short clocks
 *   ROOMS_URL=http://localhost:8787 ROOMS_GRACE=3000 ROOMS_HOST_GRACE=1500 node server/rooms/test.ts
 *                                                              a running one (wrangler dev, given the same clocks)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { CLOSE, CODE_ABC, HB } from "./protocol.ts";
import { Room, type Conn } from "./room.ts";

type Msg = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: ChildProcess | null = null;
let BASE = process.env.ROOMS_URL?.replace(/\/$/, "") ?? "";
if (!BASE) {
  const port = 3019;
  server = spawn(process.execPath, [fileURLToPath(new URL("./main.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(port), ROOMS_GRACE: "3000", ROOMS_HOST_GRACE: "1500", ROOMS_EMPTY_TTL: "3000" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((ok, no) => {
    server!.stdout!.on("data", (b: Buffer) => String(b).includes("rooms on") && ok());
    server!.on("exit", (c) => no(new Error(`server exited ${c}`)));
  });
  BASE = `http://localhost:${port}`;
}
const WS = BASE.replace(/^http/, "ws");
const health = (await (await fetch(`${BASE}/health`)).json()) as Msg;
const GRACE = Number(health.grace ?? process.env.ROOMS_GRACE ?? 60_000);
const HOST_GRACE = Number(health.hostGrace ?? process.env.ROOMS_HOST_GRACE ?? 15_000);

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = "") {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  → ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}

/** A page: its socket, everything it was told, and a way to wait for one message. */
class Page {
  ws!: WebSocket;
  got: Msg[] = [];
  closed: { code: number; why: string } | null = null;
  private taken = new Set<Msg>();
  private wake: (() => void) | null = null;
  readonly code: string;
  readonly token: string;
  constructor(code: string, token?: string) {
    this.code = code;
    this.token = token ?? `t${crypto.randomUUID().replace(/-/g, "")}`;
  }
  open() {
    this.closed = null;
    this.ws = new WebSocket(`${WS}/rooms/${this.code}/ws`);
    this.ws.on("message", (d) => {
      const s = String(d);
      this.got.push(s === HB ? { t: "hb" } : JSON.parse(s));
      this.wake?.();
    });
    this.ws.on("close", (code, why) => {
      this.closed = { code, why: String(why) };
      this.wake?.();
    });
    this.ws.on("error", () => {});
    return new Promise<this>((ok) => this.ws.once("open", () => ok(this)));
  }
  send(m: unknown) {
    this.ws.send(typeof m === "string" ? m : JSON.stringify(m));
  }
  hello(name: string, avatar = 42, since?: number) {
    this.send({ t: "hello", token: this.token, name, avatar, ...(since === undefined ? {} : { since }) });
    return this.next((m) => m.t === "welcome" || m.t === "error");
  }
  /** The first message not yet looked at that `fit` accepts (or null after `ms`). */
  async next(fit: (m: Msg) => boolean, ms = 3000): Promise<Msg | null> {
    const end = Date.now() + ms;
    for (;;) {
      const m = this.got.find((x) => !this.taken.has(x) && fit(x));
      if (m) {
        this.taken.add(m);
        return m;
      }
      if (Date.now() >= end) return null;
      await new Promise<void>((ok) => {
        this.wake = ok;
        setTimeout(ok, 50);
      });
    }
  }
  async shut(ms = 3000) {
    const end = Date.now() + ms;
    while (!this.closed && Date.now() < end) await sleep(20);
    return this.closed;
  }
  /** The latest room it was told about. */
  room(): Msg | null {
    for (let i = this.got.length - 1; i >= 0; i--) if (this.got[i].t === "room" || this.got[i].t === "welcome") return this.got[i].room;
    return null;
  }
  relays() {
    return this.got.filter((m) => m.t === "game");
  }
}
const roomWhere = (p: Page, fit: (r: Msg) => boolean, ms = 3000) => p.next((m) => (m.t === "room" || m.t === "welcome") && fit(m.room), ms);
async function newRoom() {
  const r = await fetch(`${BASE}/rooms`, { method: "POST" });
  return ((await r.json()) as Msg).code as string;
}

try {
  // ---- making a room, and a code that leads nowhere -------------------------------------------
  const code = await newRoom();
  check("POST /rooms gives a 4-letter code from the alphabet", new RegExp(`^[${CODE_ABC}]{4}$`).test(code), code);
  let ghost = code;
  while (ghost === code) ghost = [...code].reverse().join("");
  if (ghost === code) ghost = "BBBB";
  const nobody = await new Page(ghost).open();
  const nr = await nobody.next((m) => m.t === "error");
  check("a code with no room: error noRoom, closed 4004", nr?.code === "noRoom" && (await nobody.shut())?.code === CLOSE.noRoom, { nr, closed: nobody.closed });

  // (a socket that never says hello, looked at near the end)
  const mute = await new Page(code).open();

  // ---- four pages join ------------------------------------------------------------------------
  const A = await new Page(code).open();
  const wa = await A.hello("Alice", 101);
  const B = await new Page(code).open();
  const wb = await B.hello("  Bob   the  Builder  ", 2003);
  const C = await new Page(code).open();
  const wc = await C.hello('<b>Eve</b>\u0007‮"x"&', 7);
  const D = await new Page(code).open();
  const wd = await D.hello("Dave", 9999);
  check("four pages seated 0, 1, 2, 3", [wa, wb, wc, wd].map((w) => w?.seat).join() === "0,1,2,3", [wa, wb, wc, wd].map((w) => w?.seat ?? w?.code));
  check("the creator (first in) is the host", wd?.room.host === 0, wd?.room.host);
  const seen = (await roomWhere(A, (r) => r.seats.every(Boolean)))?.room;
  check("names cleaned: spaces, markup, control and bidi characters", seen?.seats[1].name === "Bob the Builder" && seen?.seats[2].name === "bEve/bx", seen?.seats.map((s: Msg) => s.name));
  check("every page sees the others, the tokens never", !JSON.stringify(A.got).includes(B.token) && !JSON.stringify(seen).includes("token"));

  const E = await new Page(code).open();
  const we = await E.hello("Eve2");
  check("a fifth page: error full, closed 4009", we?.code === "full" && (await E.shut())?.code === CLOSE.full, { we, closed: E.closed });

  // ---- bad input --------------------------------------------------------------------------------
  const R = await new Page(code).open();
  R.send({ t: "ready", on: true });
  check("anything before hello: error hello", (await R.next((m) => m.t === "error"))?.code === "hello");
  R.send("this is not json");
  check("not JSON: error bad", (await R.next((m) => m.t === "error"))?.code === "bad");
  R.send([1, 2, 3]);
  check("not an object: error bad", (await R.next((m) => m.t === "error"))?.code === "bad");
  R.ws.send(Buffer.from([1, 2, 3]), { binary: true });
  check("a binary frame: error bad", (await R.next((m) => m.t === "error"))?.code === "bad");
  R.send({ t: "hello", token: "short", name: "x", avatar: 1 });
  check("a hello with a bad token: error bad", (await R.next((m) => m.t === "error"))?.code === "bad");
  R.send({ t: "hello", token: "x".repeat(32), name: "x", avatar: 123456 });
  check("a hello with an impossible face: error bad", (await R.next((m) => m.t === "error"))?.code === "bad");
  R.send({ t: "x".repeat(10), pad: "y".repeat(5000) });
  const big = await R.shut();
  check("a frame over 4 KB: the socket is closed", !!big && (big.code === 1009 || big.code === CLOSE.bad), big);
  B.send({ t: "nope" });
  check("an unknown message: error bad", (await B.next((m) => m.t === "error"))?.code === "bad");
  B.send({ t: "settings", settings: { turns: 15 } });
  check("settings from a page that is not the host: notHost", (await B.next((m) => m.t === "error"))?.code === "notHost");
  A.send({ t: "settings", settings: { turns: 99 } });
  check("settings out of range: error bad", (await A.next((m) => m.t === "error"))?.code === "bad");
  A.send({ t: "settings", settings: { map: "moon" } });
  check("an unknown map: error bad", (await A.next((m) => m.t === "error"))?.code === "bad");
  B.send({ t: "game", data: 1 });
  check("a relay in the lobby: error phase", (await B.next((m) => m.t === "error"))?.code === "phase");
  B.send({ t: "ready", on: "yes" });
  check("ready that is not a boolean: error bad", (await B.next((m) => m.t === "error"))?.code === "bad");

  // ---- settings, a seat given up, ready, start ---------------------------------------------------
  A.send({ t: "settings", settings: { map: "astana", turns: 15, skill: 2 } });
  const st = await roomWhere(D, (r) => r.settings.map === "astana");
  check("the host's settings reach everyone", st?.room.settings.turns === 15 && st?.room.settings.skill === 2, st?.room.settings);
  D.send({ t: "leave" });
  const bye = await D.next((m) => m.t === "bye");
  const freed = await roomWhere(A, (r) => r.seats[3] === null);
  check("a page that leaves: bye, closed 4012, its seat empty", bye?.why === "left" && (await D.shut())?.code === CLOSE.left && !!freed);
  B.send({ t: "ready", on: true });
  await roomWhere(A, (r) => r.seats[1]?.ready);
  A.send({ t: "start" });
  check("start before everyone is ready: notReady", (await A.next((m) => m.t === "error"))?.code === "notReady");
  C.send({ t: "ready", on: true });
  await roomWhere(A, (r) => r.seats[2]?.ready);
  C.send({ t: "start" });
  check("start from a page that is not the host: notHost", (await C.next((m) => m.t === "error"))?.code === "notHost");
  A.send({ t: "start" });
  const [sa, sb, sc] = await Promise.all([A, B, C].map((p) => p.next((m) => m.t === "start")));
  check(
    "start: one 32-bit seed for all, the same seats",
    !!sa && sa.seed === sb?.seed && sa.seed === sc?.seed && Number.isInteger(sa.seed) && sa.seed > 0 && sa.seed < 2 ** 32 && JSON.stringify(sa.seats) === JSON.stringify(sc?.seats),
    [sa?.seed, sb?.seed, sc?.seed],
  );
  check("the empty seat is the AI's, at the room's skill", sa?.seats[3]?.ai === true && sa?.seats[3]?.skill === 2 && sa?.seats[0]?.name === "Alice", sa?.seats);
  const late = await new Page(code).open();
  const wl = await late.hello("Late");
  check("a new page once started: error started, closed 4010", wl?.code === "started" && (await late.shut())?.code === CLOSE.started, { wl, closed: late.closed });

  // ---- the relay: one order for everyone ------------------------------------------------------
  const N = 100;
  for (let i = 0; i < N; i++) for (const [k, p] of [A, B, C].entries()) p.send({ t: "game", data: { k, i } });
  await Promise.all([A, B, C].map((p) => p.next(() => p.relays().length >= 3 * N, 5000)));
  const order = [A, B, C].map((p) => p.relays().map((m) => `${m.seq}:${m.from}:${m.data.i}`).join());
  const ra = A.relays();
  check(`relay: ${3 * N} messages, seq 1…${3 * N} with no gap`, ra.length === 3 * N && ra.every((m, i) => m.seq === i + 1), ra.length);
  check("relay: the same order on every page, sender included", order[0] === order[1] && order[1] === order[2]);
  check("relay: each sender's own order kept, `from` its seat", [0, 1, 2].every((k) => ra.filter((m) => m.from === k).every((m, i) => m.data.i === i && m.data.k === k)));
  C.send({ t: "game", data: "x".repeat(3000) });
  check("relay data over 2 KB: error big", (await C.next((m) => m.t === "error"))?.code === "big");
  C.send({ t: "game" });
  check("a relay without data: error bad", (await C.next((m) => m.t === "error"))?.code === "bad");

  // ---- a drop, and back within the grace --------------------------------------------------------
  const lastC = C.relays().at(-1)!.seq as number;
  C.ws.terminate();
  const off = await roomWhere(A, (r) => r.seats[2] && !r.seats[2].online);
  check("a dropped page shows offline to the others", !!off);
  for (let i = 0; i < 10; i++) A.send({ t: "game", data: { missed: i } });
  await A.next(() => A.relays().length >= 3 * N + 10);
  const C2 = await new Page(code, C.token).open();
  const wc2 = await C2.hello("Eve again", 7, lastC);
  await C2.next(() => C2.relays().length >= 10);
  const missed = C2.relays();
  check("back with its token: the same seat, the game still on", wc2?.seat === 2 && wc2?.room.phase === "playing" && wc2?.room.seed === sa?.seed, wc2);
  check("the relays missed meanwhile come again, in order", missed.length === 10 && missed.every((m, i) => m.seq === lastC + 1 + i && m.data.missed === i), missed.map((m) => m.seq));
  check("the name stays frozen once started", wc2?.room.seats[2].name === "bEve/bx");
  const on = await roomWhere(A, (r) => r.seats[2]?.online);
  check("…and shows online again", !!on);
  const C3 = await new Page(code, C.token).open();
  await C3.hello("Eve", 7);
  const rep = await C2.next((m) => m.t === "bye");
  check("the same token from another tab takes over: the old one closed 4011", rep?.why === "replaced" && (await C2.shut())?.code === CLOSE.replaced);

  // ---- the host drops: handed over; the host leaves: handed over at once ------------------------------
  A.ws.terminate();
  const t0 = Date.now();
  const hb1 = await roomWhere(B, (r) => r.host === 1, HOST_GRACE + 3000);
  check(`the host dropped: B is host after ~${HOST_GRACE} ms`, !!hb1 && Date.now() - t0 >= HOST_GRACE - 200, Date.now() - t0);
  const A2 = await new Page(code, A.token).open();
  const wa2 = await A2.hello("Alice", 101);
  check("the old host back: its seat, not the host any more", wa2?.seat === 0 && wa2?.room.host === 1, wa2?.room.host);
  B.send({ t: "leave" });
  const hb2 = await roomWhere(A2, (r) => r.host === 0 && r.seats[1]?.gone);
  check("the host leaves a game: handed over at once, its seat marked gone", !!hb2, A2.room());
  A2.send({ t: "lobby" });
  const lob = await roomWhere(C3, (r) => r.phase === "lobby");
  check("the host takes everyone back to the lobby: the gone seat free, nobody ready", !!lob && lob.room.seats[1] === null && !lob.room.seats.some((s: Msg) => s?.ready) && lob.room.seed === 0, lob?.room);

  // ---- a seat given up in the lobby after the grace ---------------------------------------------------
  C3.ws.terminate();
  const t1 = Date.now();
  const gone = await roomWhere(A2, (r) => r.seats[2] === null, GRACE + 3000);
  check(`a page away longer than the grace (~${GRACE} ms): its seat frees`, !!gone && Date.now() - t1 >= GRACE - 200, Date.now() - t1);

  // ---- the heartbeat, the clock -------------------------------------------------------------------------
  A2.send(HB);
  check("the heartbeat is answered word for word", !!(await A2.next((m) => m.t === "hb")));
  A2.send({ t: "ping", at: 12345 });
  const pong = await A2.next((m) => m.t === "pong");
  check("ping: pong with the room's clock", pong?.at === 12345 && Math.abs(pong.now - Date.now()) < 5000, pong);

  // ---- too fast: refused, then dropped ---------------------------------------------------------------------
  const code2 = await newRoom();
  const F = await new Page(code2).open();
  await F.hello("Flood");
  F.send({ t: "start" });
  await F.next((m) => m.t === "start");
  for (let i = 0; i < 400; i++) F.send({ t: "game", data: i });
  const rate = await F.next((m) => m.t === "error" && m.code === "rate");
  const shut = await F.shut(4000);
  check("a flood of relays: error rate, then the socket dropped", !!rate && !!shut && (shut.code === CLOSE.bad || shut.code === CLOSE.rate), { rate, shut, relayed: F.relays().length });
  check("…and most of the flood never relayed", F.relays().length <= 140, F.relays().length);

  // ---- the hello that never came ----------------------------------------------------------------------------
  // (a hibernated room's alarm may not get its close to a socket that never spoke, worker.ts: its bye says it)
  const ms = await mute.shut(12_000);
  const mb = mute.got.find((m) => m.t === "bye");
  check("a socket that never says hello: told bye and closed (4008) after 10 s", ms?.code === CLOSE.hello || mb?.why === "hello", { closed: ms, bye: mb });

  // ---- rooms per address ---------------------------------------------------------------------------------------
  let refused = 0;
  for (let i = 0; i < 30 && !refused; i++) if ((await fetch(`${BASE}/rooms`, { method: "POST" })).status === 429) refused = i + 1;
  check("rooms per address are capped (429)", refused > 0, refused);

  for (const p of [A2, B, C3, F]) p.ws.terminate();

  // ---- the room made again from its save (worker.ts, after a hibernation or a restart) ----------------
  const said = new Map<string, Msg[]>();
  const fake = (k: string): Conn => (said.set(k, []), { send: (l) => said.get(k)!.push(JSON.parse(l)), close: () => {} });
  const r1 = new Room("BCDF");
  const pa = r1.open(fake("a"))!;
  const pb = r1.open(fake("b"))!;
  r1.receive(pa, JSON.stringify({ t: "hello", token: "a".repeat(20), name: "A", avatar: 1 }));
  r1.receive(pb, JSON.stringify({ t: "hello", token: "b".repeat(20), name: "B", avatar: 2 }));
  r1.receive(pb, JSON.stringify({ t: "ready", on: true }));
  r1.receive(pa, JSON.stringify({ t: "start" }));
  for (let i = 0; i < 5; i++) r1.receive(pa, JSON.stringify({ t: "game", data: i }));
  const r2 = Room.from(JSON.parse(JSON.stringify(r1.save())));
  r2.attach(fake("a2"), 0, Date.now());
  r2.settle();
  const v2 = r2.view();
  check("from its save: phase, seed, seats and settings as they were", v2.phase === "playing" && v2.seed === r1.seed && v2.seats[0]?.online === true && v2.seats[1]?.online === false && v2.seats[1]?.name === "B");
  const pb2 = r2.open(fake("b2"))!;
  r2.receive(pb2, JSON.stringify({ t: "hello", token: "b".repeat(20), name: "B", avatar: 2, since: 2 }));
  const b2 = said.get("b2")!;
  check("from its save: a page back gets its seat and the relays it missed", b2[0]?.t === "welcome" && b2[0].seat === 1 && b2.filter((m) => m.t === "game").map((m) => m.seq).join() === "3,4,5", b2.map((m) => m.t + (m.seq ?? "")));
  const r3 = Room.from({ ...r1.save(), log: [] });
  const pa3 = r3.open(fake("a3"))!;
  r3.receive(pa3, JSON.stringify({ t: "hello", token: "a".repeat(20), name: "A", avatar: 1, since: 9 }));
  r3.receive(pa3, JSON.stringify({ t: "game", data: "next" }));
  const a3 = said.get("a3")!;
  check("from an older save: the count goes on from the page's, never back", a3[0]?.oldest === 10 && a3.find((m) => m.t === "game")?.seq === 10, a3.map((m) => [m.t, m.seq, m.oldest]));
} catch (e) {
  fails++;
  console.log("FAIL  the test itself:", e);
} finally {
  server?.kill();
}
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
