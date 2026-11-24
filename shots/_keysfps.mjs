// node shots/_keysfps.mjs: frame rate and draw calls round the Golden Gate and Orchard Keys (src/scene/keys), in the game's camera
// (positions south of the bay moved with the Golden Gate: ACROSS = 380 m, src/scene/city/plan.ts)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(5000);
await p.evaluate(() => street.gta.hud.coach(-1));
for (const [name, x, z, h] of [["city avenue", 0, 3.5, -Math.PI / 2], ["bridge looking south", 158, 160, Math.PI], ["tunnel exit", 158, 642, Math.PI], ["boulevard", 158, 710, Math.PI], ["beach drive", 240, 782, -Math.PI / 2], ["from town to bridge", 158, 680, 0]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, street.groundAt(x, z) ?? 0.2, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.55)); }, x, z, h);
  await sleep(2500);
  const r = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); let calls = 0; const tick = () => { n++; calls = Math.max(calls, street.renderer?.info?.render?.calls ?? 0); if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res({ fps: Math.round((n * 1000) / (performance.now() - t0)), calls }); }; requestAnimationFrame(tick); }));
  console.log(name.padEnd(22), JSON.stringify(r));
}
await b.close();
