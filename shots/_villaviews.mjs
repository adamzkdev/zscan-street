// node shots/_villaviews.mjs [URL]: your villa (scene/keys/villa.ts) from round about — from the air both ways, the street
// through the gate, the motor court, the terrace and the pool, the loggia, the dock and the berth from the water, the roofs.
// Writes shots/gta/villa/view-*.jpg (VIEWS=a,b picks; THEME=night for the night, its files view-night-*.jpg).
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const THEME = process.env.THEME ?? "day";
const [URL = `http://localhost:3061/?debug&capture&theme=${THEME}`] = process.argv.slice(2);
const OUT = process.env.OUT ?? "shots/gta/villa";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.capture && window.street?.keys?.done, { timeout: 600000, polling: 300 });
await sleep(3000);
await p.evaluate((t) => { capture.theme(t); capture.rain(false); }, THEME);
const ALL = {
  aerial: { pos: [292, 78, 690], look: [292, 0, 602], fov: 50 },
  aerialsea: { pos: [262, 62, 530], look: [296, 0, 602], fov: 50 },
  street: { pos: [303, 2.2, 662], look: [303, 4.5, 615], fov: 58 },
  gate: { pos: [303, 1.8, 645], look: [303, 3.5, 615], fov: 65 },
  court: { pos: [289, 2.0, 634], look: [310, 3.2, 610], fov: 66 },
  porch: { pos: [318, 1.8, 628], look: [298, 3.5, 607], fov: 66 },
  terrace: { pos: [262.5, 2.6, 588], look: [300, 1.6, 578], fov: 66 },
  pool: { pos: [282, 2.2, 586.5], look: [292, 0.6, 562], fov: 66 },
  dock: { pos: [348, 4, 552], look: [318, 1.5, 574], fov: 55 },
  sea: { pos: [292, 12, 515], look: [292, 4, 600], fov: 52 },
  roofs: { pos: [246, 30, 584], look: [300, 6, 600], fov: 55 },
  inlet: { pos: [232, 22, 556], look: [246, 0, 612], fov: 55 },
  berth: { pos: [321, 2.4, 577.5], look: [334, 0.2, 568.5], fov: 62 },
};
const names = (process.env.VIEWS ?? Object.keys(ALL).join(",")).split(",");
for (const n of names) {
  await p.evaluate((v) => capture.shot(v), ALL[n]);
  await p.evaluate(async () => { for (let i = 0; i < 24; i++) capture.step(1 / 30); });
  await sleep(400);
  const f = `${OUT}/view-${THEME === "day" ? "" : THEME + "-"}${n}.jpg`;
  await p.screenshot({ path: f, type: "jpeg", quality: 72 });
  console.log("shot", f);
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
