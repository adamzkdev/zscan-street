// node shots/_cars.mjs [OUT]: every realistic vehicle close up in the studio (carstest.html), from several sides, day and night
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/cars/c"] = process.argv.slice(2);
const KINDS = process.env.KINDS ?? "";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
for (const v of (process.env.VIEWS ?? "three,side,front,back").split(",")) {
  await p.goto(`http://localhost:3061/carstest.html?view=${v}${KINDS ? `&kinds=${KINDS}` : ""}${process.env.Q ?? ""}`);
  await p.waitForFunction(() => window.__carsReady, { timeout: 60000, polling: 200 });
  await new Promise((r) => setTimeout(r, 900));
  await p.screenshot({ path: `${OUT}-${v}.png` });
}
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
