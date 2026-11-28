// node shots/_napab.mjs: A/B in one session, uncapped: the still branches walked every frame (naps 1) or on alternate
// frames with those out of the picture skipped by the drawing's walk (naps 2, matrices.ts / load.ts) — fps at a few spots
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&cpu=0");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
const setNaps = (k) => p.evaluate(async (k) => { const m = await import("/src/scene/matrices.ts"); m.naps.every = k; }, k);
for (const [name, x, z, h] of [["wallst", 150, 8, 1.57], ["heart", 0, 3.5, -1.57], ["bayroad", 0, 132, Math.PI]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(4000);
  const r = { 1: [], 2: [] };
  for (let i = 0; i < 3; i++)
    for (const k of [1, 2]) {
      await setNaps(k);
      await sleep(1500);
      r[k].push(await fps());
    }
  const avg = (a) => +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1);
  console.log(name, "naps1", avg(r[1]), JSON.stringify(r[1]), "naps2", avg(r[2]), JSON.stringify(r[2]));
}
console.log("errors", errs.length, errs.slice(0, 2).join("\n"));
await b.close();
