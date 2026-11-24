// node shots/_realab.mjs: frame rate with the realistic trees and furniture shown vs hidden, at the same spots, same moment (uncapped)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
const show = (on) => p.evaluate((on) => street.scene3.traverse((o) => { if (o.name?.startsWith("real:trees") || o.name?.startsWith("real:props")) o.visible = on; }), on);
for (const [name, x, z, h] of [["heart", 8, 4.2, -Math.PI / 2], ["palms", 122, 92, Math.PI], ["park", -6, -70, 0], ["boulevard", -122, -60, 0]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, 0.2, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(1.55)); }, x, z, h);
  await sleep(2500);
  const r = [];
  for (let k = 0; k < 2; k++) {
    await show(true); await sleep(400); r.push(["on", await fps()]);
    await show(false); await sleep(400); r.push(["off", await fps()]);
  }
  await show(true);
  const on = r.filter((x) => x[0] === "on").map((x) => x[1]), off = r.filter((x) => x[0] === "off").map((x) => x[1]);
  console.log(name, "with", on.join("/"), "without", off.join("/"));
}
await b.close();
