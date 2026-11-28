// node shots/_bootcheck.mjs: the game's start, step by step (street up, solid shape, doors), and any page error on the way
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
p.on("pageerror", (e) => console.log("pageerror", e.message, (e.stack ?? "").split("\n").slice(1, 4).join(" | ")));
p.on("console", (m) => { if (m.type() === "error") console.log("console.error", m.text().slice(0, 300)); });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
const t0 = Date.now();
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const s = await p.evaluate(() => ({ up: !!window.__streetUp, solid: !!window.street?.gta?.solid?.ready, doors: !!window.street?.gta?.doorsReady, isles: window.street?.isles?.live?.map((L) => !!L.content).join(",") })).catch((e) => ({ err: e.message }));
  console.log(((Date.now() - t0) / 1000).toFixed(0) + "s", JSON.stringify(s));
  if (s.doors) break;
}
await b.close();
