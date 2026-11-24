// node shots/_realbuild.mjs [TAG] [QS]: the realistic buildings (src/scene/real) at street level, day and night, at 8 spots, and
// the map view twice; TAG names the files (shots/gta/real/<TAG>-<spot>-<day|night>.png). QS adds to the URL
// (e.g. "&real=0" for the voxel city as it was). FPS=1 measures uncapped frames per second at each spot.
import puppeteer from "puppeteer-core";
const [TAG = "after", QS = ""] = process.argv.slice(2);
const OUT = "shots/gta/real";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", ...(process.env.FPS ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|500|Failed to load resource|WebSocket/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day&solo${QS}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); document.querySelector(".gta-hud") && (document.querySelector(".gta-hud").style.display = "none"); });
await sleep(4000);
// [name, x, z, heading (0 looks north / −z, π/2 west, −π/2 east, π south), pitch]
const SPOTS = [
  ["heart", -30, 4.2, Math.PI / 2, 0.02],
  ["block", -158, -78, 0, 0.04],
  ["blvd", 118, -14, 0, 0.02],
  ["wallst", 194, 34, 0, 0.14],
  ["midtown", 86, -92, 0, 0.12],
  ["bayfront", -90, 139, 0.35, 0.04],
  ["southbank", -100, 104, -Math.PI / 2, 0.04],
  ["shibuya", -50, -150, -Math.PI / 2, 0.02],
];
const fps = {};
for (const [name, x, z, h, pitch] of SPOTS) {
  if (ONLY && !ONLY.includes(name)) continue;
  for (const [tod, hour] of [["day", 14], ["night", 22.5]]) {
    await p.evaluate((x, z, h, pitch, hour) => {
      const g = street.gta;
      g.clock?.force?.(hour, "clear");
      g.player.place(x, 0.2, z, h);
      g.cam.behind(h, pitch);
      g.cam.snap(g.player.pos.clone().setY(1.55));
    }, x, z, h, pitch, hour);
    await sleep(2200);
    await p.screenshot({ path: `${OUT}/${TAG}-${name}-${tod}.png` });
    if (process.env.FPS && tod === "day") fps[name] = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
  }
}
// the map view
if (!ONLY || ONLY.includes("map")) {
  await p.evaluate(() => street.gta.stop());
  await sleep(2500);
  await p.screenshot({ path: `${OUT}/${TAG}-map-home.png` });
  await p.evaluate(() => { street.rig?.zoomBy?.(0.45); });
  await sleep(2500);
  await p.screenshot({ path: `${OUT}/${TAG}-map-wide.png` });
  if (process.env.FPS) fps.map = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
}
const info = await p.evaluate(() => ({ calls: street.renderer?.info?.render?.calls, tris: street.renderer?.info?.render?.triangles, geos: street.renderer?.info?.memory?.geometries, progs: street.renderer?.info?.programs?.length }));
console.log(TAG, JSON.stringify({ fps, info }));
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
