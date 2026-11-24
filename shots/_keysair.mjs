// node shots/_keysair.mjs [URL] [OUT]: Orchard Keys from the map's camera (src/scene/keys); SPOTS='[[x,z,zoom]]'
// (positions south of the bay moved with the Golden Gate: ACROSS = 380 m, src/scene/city/plan.ts)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&theme=day", OUT = "shots/gta/keys/air"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.keys?.done, { timeout: 240000, polling: 300 });
await new Promise((r) => setTimeout(r, 5000));
await p.evaluate(() => { document.getElementById("ui").style.display = "none"; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [[205, 710, 1.1], [135, 680, 2.2], [255, 680, 2.2], [180, 775, 2.2], [158, 625, 2.4], [158, 570, 1.6]];
let n = 0;
for (const [x, z, zoom] of SPOTS) {
  await p.evaluate((x, z, zoom) => { const r = street.rig; r.district(r.controls.target.clone().set(x, 0, z), zoom); }, x, z, zoom);
  await sleep(3500);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
}
await b.close();
