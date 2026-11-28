// node shots/_keysjamshot.mjs: a few frames of a bridge car going round your stopped car on the deck (shots/gta/jam/*.jpg)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0]; g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0); g.input.tap("KeyF"); });
await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 });
const x = await p.evaluate(() => street.goldenGate.laneX(420, false, 0));
await p.evaluate((x) => { const g = street.gta; g.car.place(x, 420, Math.PI / 2); g.car.vel.set(0, 0); g.cam.behind(Math.PI, -0.25); }, x);
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < 60000 && n < 4) {
  await sleep(250);
  const st = await p.evaluate(() => { const g = street.gta; g.car.vel.set(0, 0); g.cam.behind(Math.PI, -0.25); const P = g.car.group.position; const c = street.goldenGate.cars.find((q) => q.dodge && Math.hypot(q.x - P.x, q.z - P.z) < 16); return c ? c.dodge.stage : null; });
  if (st) { await p.screenshot({ path: `shots/gta/jam/deck-${n}-${st}.jpg`, type: "jpeg", quality: 60 }); n++; await sleep(600); }
}
console.log("frames", n);
await b.close();
