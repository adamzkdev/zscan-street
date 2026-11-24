// node shots/_sweeptest.mjs [OUT]: sweeptest.html sets (SETS=boats,air… VIEWS=three,side)
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/sweep/dev"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 800 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
for (const set of (process.env.SETS ?? "boats").split(","))
  for (const view of (process.env.VIEWS ?? "three,side").split(",")) {
    await p.goto(`http://localhost:3061/sweeptest.html?set=${set}&view=${view}${process.env.NIGHT ? "&night" : ""}`);
    await p.waitForFunction(() => window.__ready, { timeout: 60000, polling: 200 });
    await new Promise((r) => setTimeout(r, 1500));
    await p.screenshot({ path: `${OUT}-${set}-${view}.png` });
  }
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
