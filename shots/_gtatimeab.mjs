// node shots/_gtatimeab.mjs: the game's sky dome and day paint on vs off (the street's theme), uncapped fps, same spot, alternating
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.player.place(30, 0.2, -1.4, Math.PI / 2); g.cam.behind(Math.PI / 2, 0.06); g.cam.snap(g.player.pos.clone().setY(1.55)); g.clock.force(18.9, "fair"); });
const measure = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
const res = { on: [], off: [] };
for (let k = 0; k < 3; k++) {
  await p.evaluate(() => { const g = street.gta; g.__sky = g.__sky ?? g.host.tod; g.host.tod = g.__sky; });
  await sleep(1500);
  res.on.push(await measure());
  await p.evaluate(() => { const g = street.gta; g.host.tod(null); g.host.tod = () => {}; });
  await sleep(1500);
  res.off.push(await measure());
}
console.log(JSON.stringify(res));
await b.close();
