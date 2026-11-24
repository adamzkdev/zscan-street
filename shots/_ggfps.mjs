// node shots/_ggfps.mjs [URL]: frames per second (uncapped) round the big Golden Gate: Bay Road facing it, its deck, under a tower, the headland, Orchard Beach, the woods
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
// (a first pass at Bay Road to warm up — shaders compiled, the city streamed in — not counted)
for (const [name, x, z, h] of [["warm-up", 146, 134, Math.PI], ["bayroad-gg", 146, 134, Math.PI], ["deck-mid", 172.4, 375, Math.PI], ["deck-tower", 172.4, 268, Math.PI], ["deck-north", 172.4, 380, 0], ["headland", 158, 612, 0], ["woods", 190, 594, 1.5], ["beach", 206, 860, 0], ["heart", 0, 3.5, -1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(4000);
  const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
  out.push([name, fps]);
}
console.log("fps", JSON.stringify(out.slice(1)));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
