// node shots/_islesab.mjs: what the islands cost — fps with them drawn vs hidden, at the same moment, at a few spots (uncapped)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
await p.waitForFunction(() => street.isles?.facades?.length > 0, { timeout: 120000, polling: 500 }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
const show = (on) => p.evaluate((on) => street.scene3.traverse((o) => { if (/^(isle:|crossing:)/.test(o.name) && o.parent === street.scene3) o.visible = on; }), on);
const out = [];
for (const [name, x, z, h] of [["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57], ["ringE", 221, -150, -1.57], ["zaiba", 820, -160, -1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(4000);
  const row = { spot: name, on: [], off: [] };
  for (let k = 0; k < 3; k++) {
    await show(true); await sleep(400); row.on.push(await fps());
    if (name !== "zaiba") { await show(false); await sleep(400); row.off.push(await fps()); }
  }
  await show(true);
  out.push(row);
  console.log(JSON.stringify(row));
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
