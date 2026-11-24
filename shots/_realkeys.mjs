// node shots/_realkeys.mjs [TAG] [URL]: the realistic overhaul, wave 2 — Orchard Keys (its streets, shops, diner, gas
// station, motel, hotels, villas, the park, the letters on the bluff, the tunnel, the beach and the pier), the Palm and the
// sail hotel, the Shielded Woods, a street with its market stalls and bicycles, the river's boats. Day / golden hour /
// night at street level, fps at each spot. ONLY=boulevard,beach,… TIMES=13,18.6,22 (env). Out: shots/gta/realkeys/<TAG>-…
import puppeteer from "puppeteer-core";
const [TAG = "after", URL = "http://localhost:3061/?debug&gta=1192"] = process.argv.slice(2);
const OUT = "shots/gta/realkeys";
const SPOT = {
  // [x, z, heading (0 north/−z, π south, π/2 west, −π/2 east), pitch]
  boulevard: [154, 271, Math.PI, 0.08],
  diner: [156, 286, Math.PI / 2 + 0.35, 0.06],
  gas: [160, 352, -Math.PI / 2 - 0.3, 0.08],
  bungalows: [230, 270, Math.PI, 0.1],
  villas: [278, 318, 0, 0.12],
  hotels: [183, 410, 0.15, 0.06],
  motel: [236, 405, -0.2, 0.08],
  park: [230, 322, Math.PI, 0.22],
  letters: [214, 266, 0, -0.12],
  tunnel: [156.5, 250, 0, 0.0],
  portal: [161, 272, 0, 0.02],
  beach: [176, 418, Math.PI, 0.18],
  sand: [150, 452, Math.PI * 0.8, 0.12],
  pier: [196, 448, Math.PI - 0.4, 0.08],
  palm: [-170, 192, Math.PI / 2, 0.18],
  burj: [-178, 238, Math.PI / 2 + 0.4, 0.06],
  woods: [-100, -250, Math.PI, 0.05],
  market: [0, 10, Math.PI, 0.1],
  river: [-60, 60, Math.PI / 2, 0.15],
};
if (process.env.SPOTS) Object.assign(SPOT, JSON.parse(process.env.SPOTS));
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(SPOT);
const times = (process.env.TIMES ?? "13,18.6,22").split(",").map(Number);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => (m.type() === "error" && !/429|500|Failed to load resource/.test(m.text()) ? errs.push(m.text().slice(0, 200)) : /^keys:/.test(m.text()) && console.log(m.text())));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.waitForFunction(() => window.street?.keys?.done ?? true, { timeout: 120000, polling: 500 }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.settings.sky = "cycle"; g.heat.clear?.(); const st = document.createElement("style"); st.textContent = ".gta-hud,.gta-radio{display:none!important}"; document.head.append(st); });
await sleep(2500);
const fps = [];
for (const name of only) {
  const [x, z, h, pitch] = SPOT[name];
  await p.evaluate((x, z, h, pitch) => {
    const g = street.gta;
    if (g.car) g.getOut(true);
    const y = g.host.ground(x, z) ?? 0.2;
    g.player.place(x, y, z, h);
    g.cam.behind(h, pitch);
    g.cam.snap(g.player.pos.clone().setY(y + 1.55));
  }, x, z, h, pitch);
  for (const hour of times) {
    await p.evaluate((hour) => street.gta.clock.force(hour, "fair"), hour);
    await sleep(hour === times[0] ? 3200 : 1500);
    await p.screenshot({ path: `${OUT}/${TAG}-${name}-${String(hour).replace(".", "h")}.png` });
  }
  const f = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
  fps.push([name, f]);
  console.log("spot", name, "fps", f);
}
const info = await p.evaluate(() => ({ calls: street.renderer?.info?.render?.calls, tris: street.renderer?.info?.render?.triangles }));
console.log("fps", JSON.stringify(fps), "render", JSON.stringify(info));
console.log("errors", errs.length, errs.slice(0, 8).join("\n"));
await b.close();
