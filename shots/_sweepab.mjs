// node shots/_sweepab.mjs [URL] [TAG]: fps at the woods, the heart and Wall Street (5 s each, no vsync), a screenshot of each in shots/gta/perf/TAG-spot.png
// (the woods and the headland lie ACROSS = 380 m further south since the Golden Gate grew)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", TAG = "x"] = process.argv.slice(2);
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
for (const [name, x, z, h] of [["woods", 190, 214 + 380, 1.5], ["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(6000);
  const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
  out.push([name, fps]);
  await p.screenshot({ path: `shots/gta/perf/${TAG}-${name}.png` });
}
console.log("fps", JSON.stringify(out));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
