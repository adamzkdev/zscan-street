// node shots/_ggsim.mjs [minutes]: the Golden Gate / Orchard Keys traffic (src/scene/goldengate.ts) stepped on its own
// (synchronously, you far off in the city) for game minutes: the longest any car stands still, where, and what it waits for —
// a gridlock anywhere on the loops (the bridge's city end, the deck, the tunnel, Orchard Keys' junctions) shows here.
import puppeteer from "puppeteer-core";
const MIN = +(process.argv[2] ?? 20);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const r = await p.evaluate((MIN) => {
  const g = street.gta, gg = street.goldenGate, ct = g.host.traffic;
  g.player.place(-150, 0.2, -100, 0);
  const dt = 1 / 60, r1 = (v) => +v.toFixed(1);
  const still = new Map();
  const worst = { bayEnd: 0, deck: 0, tunnel: 0, town: 0 }, worstAt = {};
  let throws = 0, first = "", over15 = 0, cars = 0;
  const zone = (c) => (c.z < 150 ? "bayEnd" : c.z < 590 ? "deck" : c.z < 640 ? "tunnel" : "town");
  for (let i = 0; i < MIN * 3600; i++) {
    try { ct.update(dt); gg.update(dt); } catch (e) { throws++; if (!first) first = String(e?.stack).slice(0, 400); }
    if (i % 6) continue;
    cars = Math.max(cars, gg.cars.length);
    for (const c of gg.cars) {
      const s = c.cur < 0.2 ? (still.get(c) ?? 0) + 0.1 : 0;
      still.set(c, s);
      const zn = zone(c);
      if (s > 15 && s < 15.1) over15++;
      if (s > worst[zn]) {
        worst[zn] = r1(s);
        const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
        const ahead = gg.cars.filter((o) => o !== c).map((o) => { const dx = o.x - c.x, dz = o.z - c.z; return { x: r1(o.x), z: r1(o.z), cur: r1(o.cur), al: r1(dx * fx + dz * fz), ac: r1(Math.abs(-dx * fz + dz * fx)) }; }).filter((q) => q.al > 0 && q.al < 18 && q.ac < 1.6);
        worstAt[zn] = { x: r1(c.x), z: r1(c.z), yaw: r1(c.yaw), dodge: c.dodge?.stage ?? null, jam: r1(c.jam ?? 0), ahead };
      }
    }
  }
  return { minutes: MIN, cars, throws, first, worst, over15, worstAt };
}, MIN);
console.log(JSON.stringify(r));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
