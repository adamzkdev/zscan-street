// node shots/_realinside.mjs [OUT]: into a few walk-in places in the game's third person, a look round each (KEYS env: place keys)
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/inside/i"] = process.argv.slice(2);
const KEYS = (process.env.KEYS ?? "museum,hotel,mall,reserve,opera,library,stadium,tower").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day${process.env.QS ? "&" + process.env.QS : ""}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
for (const k of KEYS) {
  await p.evaluate((k) => street.gta.host.enter(k), k);
  try {
    await p.waitForFunction(() => !!street.gta.host.interior(), { timeout: 60000, polling: 300 });
  } catch {
    console.log("no way in", k);
    continue;
  }
  await sleep(4000);
  for (const turn of [0, 2.1]) {
    await p.evaluate((t) => street.gta.cam.behind(street.gta.cam.yaw + t, -0.05), turn).catch(() => {});
    await sleep(900);
    await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${k}.png` });
  }
  await p.evaluate(() => street.leavePlace());
  await p.waitForFunction(() => !street.gta.host.interior(), { timeout: 30000, polling: 300 }).catch(() => {});
  await sleep(1500);
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
