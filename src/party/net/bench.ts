/**
 * The bench's online play (partylab.html), without a server:
 *
 * - `?g=coins&net=loop&humans=2`: a game through the loopback relay with simulated latency, two
 *   players at one keyboard (P1 arrows + Enter, P2 WASD + Space; seats 3–4, with `humans=3|4`, are
 *   scripted). This screen is P1's client; P2 is a second client in the page, with its own copy of
 *   the game nobody watches, so every move of P2 crosses the "network" too, and the two compare
 *   checksums as real clients do. `&rtt=` each link's round trip (ms, 80), `&jitter=` (ms, 10),
 *   `&delay=` a fixed input delay in ticks (none: adaptive).
 * - `?nettest=coins&suite=quick|full`: the lockstep test suite in this page (window.lab.lines).
 */
import { playMini, type Stage } from "../host";
import { rng, type MiniDef, type Player } from "../kit";
import { ARROWS, BotPad, KeyPad, Sampler, WASD } from "./input";
import { NetMatch } from "./match";
import { Loopback, realClock } from "./transport";

export async function loopDemo(stage: Stage, def: MiniDef, players: Player[], q: URLSearchParams, variant?: string) {
  const n = Math.max(1, Math.min(4, Number(q.get("humans") ?? 2)));
  const seed = Number(q.get("seed") ?? 7);
  const rtt = Number(q.get("rtt") ?? 80);
  const jitter = Number(q.get("jitter") ?? 10);
  const delay = q.get("delay") ? Number(q.get("delay")) : undefined;
  const hub = new Loopback(realClock, { seed });
  const humans = Array.from({ length: n }, (_, i) => i);
  const links = humans.map(() => hub.client({ up: rtt / 2, down: rtt / 2, jitter }));
  const p1 = new KeyPad(ARROWS);
  const p2 = n > 1 ? new KeyPad(WASD) : null;
  // the other clients: P2 at this keyboard, the rest scripted; each its own sim, silent and unseen
  const peers = humans.slice(1).map((s) => {
    const m = new NetMatch({ def, players, seed, humans, local: [s], transport: links[s], variant, delay, quiet: true, name: `client ${s}` });
    const bot = s === 1 ? null : new BotPad(rng(seed * 31 + s));
    const sm = new Sampler(bot ?? p2!);
    return { s, m, bot, sm };
  });
  let main: NetMatch | null = null;
  const info = document.createElement("div");
  info.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:50;font:600 12px/1.45 ui-monospace,monospace;color:#fff;background:rgba(10,6,30,.78);padding:8px 10px;border-radius:10px;pointer-events:none;white-space:pre";
  document.body.append(info);
  const show = () => {
    if (!main) return;
    const L = main.lock;
    const rows = [
      `LOOPBACK · rtt ${rtt} ms ±${jitter} per link · ${n} ${n > 1 ? "people" : "person"}`,
      `P1 arrows + Enter${p2 ? " · P2 WASD + Space" : ""}${n > 2 ? ` · seats ${humans.slice(2).map((s) => s + 1).join(", ")} scripted` : ""}`,
      `tick ${L.cur} · delay ${L.D} ticks (${Math.round(L.D * 16.7)} ms) · rtt to peers ${JSON.stringify(L.rtts())}`,
      `stalls ${L.stats.stalls} (max ${Math.round(L.stats.maxStallMs)} ms) · checks ${L.checks} · desyncs ${L.desyncs.length} · ${main.phase}`,
      ...peers.map((p) => `client ${p.s + 1}: tick ${p.m.lock.cur}, delay ${p.m.lock.D}, desyncs ${p.m.lock.desyncs.length}`),
    ];
    info.textContent = rows.join("\n");
  };
  const timer = setInterval(show, 250);
  const lab = (window as unknown as { lab: Record<string, unknown> }).lab;
  try {
    const order = await playMini(stage, def, players, rng(seed), {
      note: "lab · online (loopback)",
      prizes: ["+10", "+5", "+2", ""],
      variant,
      net: {
        transport: links[0],
        seed,
        humans,
        local: [0],
        delay,
        pads: { 0: p1 },
        made: (m) => {
          main = m;
          lab.net = m;
        },
        each: (dt) => {
          p2?.tick();
          for (const p of peers) {
            // (P2's keys once per screen frame; a scripted one presses only when its tick comes)
            if (!p.bot) p.sm.frame();
            p.m.frame(dt, () => {
              if (p.bot) (p.bot.step(), p.sm.frame());
              return p.sm.take();
            });
          }
        },
      },
    });
    return order;
  } finally {
    clearInterval(timer);
    show();
    p1.dispose();
    p2?.dispose();
    for (const p of peers) p.m.dispose();
    lab.peers = peers.map((p) => ({ seat: p.s, desyncs: p.m.lock.desyncs.length, checks: p.m.lock.checks, order: p.m.order }));
  }
}

/** The test suite in this page: Chrome, Safari… (window.lab.lines, one JSON line per result). */
export async function pageTest(q: URLSearchParams) {
  const lab = (window as unknown as { lab: Record<string, unknown> }).lab;
  const lines: unknown[] = (lab.lines = []);
  const { COINS } = await import("../games/coins");
  const { SUITES, runSuite } = await import("./test/suite");
  const ua = navigator.userAgent;
  const engine = /Chrome\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "browser";
  // (a tick to paint the page first; the suite then runs to its end in one go)
  await new Promise((r) => setTimeout(r, 50));
  runSuite(COINS, SUITES[q.get("suite") ?? "quick"] ?? SUITES.quick, engine, (o) => lines.push(o));
}
