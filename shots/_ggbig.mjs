// node shots/_ggbig.mjs [BASE] [OUT]: the big Golden Gate (src/scene/real/bridge.ts) from a free camera (capture mode):
// from Bay Road, the water, the beach, the deck, high over the strait, the towers' portals. ONLY=…, THEMES=day,night
import puppeteer from "puppeteer-core";
const [BASE = "http://localhost:3061", OUT = "shots/gta/ggbig/c"] = process.argv.slice(2);
const VIEWS = {
  // across the strait from the west, low over the water: the whole span
  side: { pos: [-60, 12, 330], look: [158, 40, 380], fov: 55 },
  // from Bay Road, looking down the bridge to the headland
  bayroad: { pos: [150, 2.2, 128], look: [158, 30, 300], fov: 62 },
  // from the water under the main span
  water: { pos: [130, 1.2, 330], look: [160, 26, 400], fov: 66 },
  // from the headland's bluff (Viewing Key Point), looking back north over the bridge to the city
  beach: { pos: [192, 16, 590], look: [158, 34, 420], fov: 58 },
  // from Bay Road's quay at golden-hour height, a little west
  quay: { pos: [120, 3, 142], look: [160, 34, 330], fov: 58 },
  // on the deck, at a tower: the portals open overhead
  deck: { pos: [156, 18.6, 252], look: [158, 52, 292], fov: 70 },
  // the deck from a driver's height, towards the headland
  drive: { pos: [153.2, 21.2, 302], look: [153.5, 20, 380], fov: 62 },
  // high over the strait: the whole bridge, city behind
  high: { pos: [330, 160, 520], look: [158, 10, 340], fov: 50 },
  // the headland's end: the deck onto the woods' road, the cut, the tunnel's mouth beyond
  abut: { pos: [104, 10, 548], look: [160, 8, 604], fov: 60 },
  // the city's end from the water: the approach viaduct on its piers off Bay Road's quay
  approach: { pos: [208, 6, 186], look: [158, 10, 160], fov: 64 },
  // the tower from below
  tower: { pos: [190, 5, 310], look: [178, 60, 292], fov: 62 },
};
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(VIEWS);
const themes = (process.env.THEMES ?? "day").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(`${BASE}/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 300000, polling: 300 });
for (let k = 0; k < 40; k++) {
  await p.evaluate(() => { for (let i = 0; i < 5; i++) capture.step(1 / 30); });
  if (await p.evaluate(() => !!window.__streetUp)) break;
  await new Promise((r) => setTimeout(r, 1500));
}
for (const theme of themes) {
  await p.evaluate((t) => { capture.theme(t); for (let i = 0; i < 30; i++) capture.step(1 / 30); }, theme);
  for (const name of only) {
    const v = VIEWS[name];
    await p.evaluate((v) => { capture.shot(v); for (let i = 0; i < 14; i++) capture.step(1 / 30); }, v);
    await p.screenshot({ path: `${OUT}-${name}-${theme}.png` });
  }
}
if (!process.env.NOISO) {
  // the city's own iso view (the map view) over the strait: the whole bridge, then closer on a tower
  for (const [name, x, z, zoom] of [["iso", 158, 380, 0.12], ["iso-tower", 158, 300, 0.3]]) {
    await p.evaluate((x, z, zoom) => { capture.theme("day"); capture.rig(x, z, zoom); for (let i = 0; i < 90; i++) capture.step(1 / 30); }, x, z, zoom);
    await p.screenshot({ path: `${OUT}-${name}.png` });
  }
}
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
