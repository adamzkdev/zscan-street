// node shots/_gtatime.mjs [URL] [OUT]: the game's day and weather (src/gta/skyclock.ts → scene/daylight.ts) at a few spots:
// dawn, noon, golden hour, sunset, blue hour, night × clear / overcast / rain / storm; then the map view (must look as before).
// SPOTS=avenue,bay,heart  TIMES=6.6,13,18.6,19.5,20.2,23  WX=clear,overcast,rain,storm  (env)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192", OUT = "shots/gta/time/t"] = process.argv.slice(2);
const SPOT = {
  // [x, z, heading (0 north/−z, π/2 west), pitch]
  avenue: [70, 0.5, Math.PI / 2, -0.02],
  west: [30, -1.4, Math.PI / 2, 0.06],
  east: [-30, -1.4, -Math.PI / 2, 0.02],
  bay: [150, 131, Math.PI, 0.02],
  heart: [0, 3.5, -Math.PI / 2, -0.03],
};
const spots = (process.env.SPOTS ?? "avenue,bay,heart").split(",");
const times = (process.env.TIMES ?? "6.6,13,18.6,19.5,20.2,23").split(",").map(Number);
const wx = (process.env.WX ?? "fair").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.settings.sky = "cycle"; });
const fps = [];
for (const spot of spots) {
  const [x, z, h, pitch] = SPOT[spot];
  await p.evaluate((x, z, h, pitch) => { const g = street.gta; g.player.place(x, 0.2, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(1.55)); }, x, z, h, pitch);
  for (const w of wx)
    for (const hour of times) {
      await p.evaluate((hour, w) => street.gta.clock.force(hour, w), hour, w);
      // (a storm: catch a flash)
      await sleep(w === "storm" ? 600 : 1500);
      if (w === "storm") await p.evaluate(() => { const c = street.gta.clock; c.flash = 1; });
      await sleep(80);
      const name = `${OUT}-${spot}-${w}-${String(hour).replace(".", "h")}.png`;
      await p.screenshot({ path: name });
    }
  const f = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
  fps.push([spot, f]);
}
console.log("fps", JSON.stringify(fps));
if (!process.env.NOMAP) {
  // the map view: the street's own theme back
  await p.evaluate(() => street.gta.stop());
  await sleep(2500);
  await p.screenshot({ path: `${OUT}-map.png` });
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
