// node shots/_villainside.mjs [URL]: inside your villa (src/interior/home), free camera — the great room from the hall,
// the stair, the kitchen, the den, by the glass; upstairs the gallery, the master suite, the guest room.
// Writes shots/gta/villa/in-*.jpg (VIEWS=a,b picks; THEME=night: in-night-*.jpg).
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const THEME = process.env.THEME ?? "day";
const [URL = `http://localhost:3061/?debug&capture&theme=${THEME}`] = process.argv.slice(2);
const OUT = "shots/gta/villa";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.capture && window.street?.keys?.done, { timeout: 600000, polling: 300 });
await sleep(2500);
await p.evaluate((t) => { capture.theme(t); capture.rain(false); }, THEME);
await p.evaluate(() => capture.enter("home"));
await sleep(2500);
const Y1 = 4.35;
const ALL = {
  hall: { f: 0, pos: [0, 1.65, -1.6], look: [0, 2.4, -19], fov: 70 },
  great: { f: 0, pos: [5.5, 1.7, -17.5], look: [-6, 3.2, -6], fov: 72 },
  stair: { f: 0, pos: [3.5, 1.7, -17], look: [-8, 2.6, -10], fov: 66 },
  sea: { f: 0, pos: [-2, 1.65, -14.5], look: [2, 1.4, -30], fov: 70 },
  kitchen: { f: 0, pos: [-12, 1.65, -11.5], look: [-24, 1.0, -3], fov: 68 },
  den: { f: 0, pos: [12, 1.65, -17.5], look: [19, 1.2, -9], fov: 68 },
  gallery: { f: 1, pos: [6, Y1 + 1.65, -2.5], look: [-4, Y1 - 1.5, -16], fov: 70 },
  master: { f: 1, pos: [10.4, Y1 + 1.65, -18.2], look: [16.5, Y1 + 0.5, -9.6], fov: 72 },
  bath: { f: 1, pos: [16, Y1 + 1.65, -11.4], look: [21.5, Y1 + 0.6, -18.6], fov: 70 },
  guest: { f: 1, pos: [-18, Y1 + 1.65, -8], look: [-26, Y1 + 0.6, -16], fov: 70 },
};
const names = (process.env.VIEWS ?? Object.keys(ALL).join(",")).split(",");
for (const n of names) {
  const v = ALL[n];
  await p.evaluate((f) => capture.floor(f), v.f);
  await p.evaluate((v) => capture.shot(v), v);
  await p.evaluate(async () => { for (let i = 0; i < 20; i++) capture.step(1 / 30); });
  await sleep(500);
  const f = `${OUT}/in-${THEME === "day" ? "" : THEME + "-"}${n}.jpg`;
  await p.screenshot({ path: f, type: "jpeg", quality: 72 });
  console.log("shot", f);
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
