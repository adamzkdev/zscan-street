// node shots/_martsair.mjs OUT '{"name":{"pos":[x,y,z],"look":[x,y,z],"fov":f},…}': free-camera views (capture mode, URL=…&theme=night
// for the night) written to OUT-<name>.jpg — the stores' and malls' night and aerial pictures (shots/gta/marts).
import puppeteer from "puppeteer-core";
const [OUT, VIEWS] = process.argv.slice(2);
const URL = process.env.URL ?? "http://localhost:3061/?debug&capture&theme=day";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.capture && window.street?.keys?.done, { timeout: 600000, polling: 300 });
await p.waitForFunction(() => window.street.isles?.live?.every((L) => L.content), { timeout: 300000, polling: 300 }).catch(() => {});
await sleep(2000);
await p.evaluate(() => { capture.theme(new URLSearchParams(location.search).get("theme") ?? "day"); capture.rain(false); });
const views = JSON.parse(VIEWS);
for (const [n, v] of Object.entries(views)) {
  await p.evaluate((v) => capture.shot(v), v);
  await p.evaluate(async () => { for (let i = 0; i < 30; i++) capture.step(1 / 30); });
  await sleep(1200);
  await p.screenshot({ path: `${OUT}-${n}.jpg`, type: "jpeg", quality: 60 });
  console.log("shot", n);
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
