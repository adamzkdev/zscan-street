// node shots/_shadowab.mjs: the shadow map every frame (now) vs every other frame (street.shadowHalf), uncapped fps at the slow spots, alternating, same session
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
const res = {};
for (const [name, x, z, h] of [["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, 0.2, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(1.75)); }, x, z, h);
  await sleep(5000);
  res[name] = { every: [], half: [] };
  for (let round = 0; round < 3; round++)
    for (const half of [false, true]) {
      await p.evaluate((h) => street.shadowHalf(h), half);
      await sleep(700);
      res[name][half ? "half" : "every"].push(await fps());
    }
  await p.evaluate(() => street.shadowHalf(false));
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [k, v] of Object.entries(res)) console.log(k, "every frame", med(v.every), JSON.stringify(v.every), "· every other", med(v.half), JSON.stringify(v.half));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
