// node shots/_markstest.mjs: each realistic landmark (markstest.html) from a few views — KINDS=eiffel,colosseum VIEWS=three,street NIGHT=1 OUT=shots/gta/marks1/m
import puppeteer from "puppeteer-core";
const KINDS = (process.env.KINDS ?? "eiffel").split(","), VIEWS = (process.env.VIEWS ?? "three,front,street").split(",");
const OUT = process.env.OUT ?? "shots/gta/marks1/m";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 800 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => (m.text().startsWith("mark ") || m.type() === "error") && console.log(m.text().slice(0, 200)));
for (const k of KINDS)
  for (const v of VIEWS) {
    await p.goto(`http://localhost:3061/markstest.html?k=${k}&view=${v}${process.env.NIGHT ? "&night" : ""}${process.env.LOD ? "&lod=" + process.env.LOD : ""}${process.env.QS ?? ""}`);
    await p.waitForFunction(() => window.__ready, { timeout: 60000, polling: 200 });
    await new Promise((r) => setTimeout(r, 2500));
    await p.screenshot({ path: `${OUT}-${k}-${v}${process.env.NIGHT ? "-night" : ""}.png` });
  }
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
