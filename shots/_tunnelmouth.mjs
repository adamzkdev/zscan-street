// node shots/_tunnelmouth.mjs: the car at the Orchard Keys tunnel's mouth on Orchard Boulevard (x 166, z 650) facing north — what stops it
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0]; g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0); g.input.tap("KeyF"); });
await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 });
await sleep(1000);
for (const x of [163.8, 152.2, 166]) {
  const r = await p.evaluate(async (x) => {
    const g = street.gta;
    g.car.place(x, 668, Math.PI / 2); g.car.vel.set(0, 0); g.cam.behind(0, -0.1);
    await new Promise((r) => setTimeout(r, 2500));
    g.input.stick.y = 1; g.input.stick.x = 0;
    const log = [];
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); const P = g.car.group.position; log.push([+P.x.toFixed(1), +P.z.toFixed(1), +g.car.speed.toFixed(1), g.car.hit?.what ?? null]); }
    g.input.stick.y = 0;
    return { x, end: log[log.length - 1], hits: [...new Set(log.map((q) => q[3]).filter(Boolean))], street: g.roads.where(x, 640).street, roadAt: [600, 620, 640, 660].map((z) => [z, g.roads.where(x, z).street]) };
  }, x);
  console.log(JSON.stringify(r));
  await p.screenshot({ path: `shots/gta/tunnel-${x}.jpg`, type: "jpeg", quality: 60 });
}
await b.close();
