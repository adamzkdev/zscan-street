// node shots/_figtest.mjs [OUT]: the figures close up from four sides (figtest.html)
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/fig/f"] = process.argv.slice(2);
const IDS = process.env.IDS ?? "1192,9703,5506,42,777";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 700 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.text().startsWith("verts") && console.log(m.text()));
for (const view of (process.env.VIEWS ?? "front,three,side,back").split(",")) {
  await p.goto(`http://localhost:3061/figtest.html?ids=${IDS}&view=${view}${process.env.CLOSE ? '&close' : ''}${process.env.QS ?? ''}`);
  await p.waitForFunction(() => window.__figReady, { timeout: 60000, polling: 200 });
  await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: `${OUT}-${view}.png` });
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
