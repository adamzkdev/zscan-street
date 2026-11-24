import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 300)));
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("CON", m.type(), m.text().slice(0, 300)); });
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const t0 = Date.now();
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
try { await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 500 }); console.log("ready in", (Date.now() - t0) / 1000, "s"); }
catch (e) { console.log("not ready", await p.evaluate(() => ({ up: !!window.__streetUp, street: !!window.street, gta: !!window.street?.gta, solid: window.street?.gta?.solid?.ready }))); }
await b.close();
