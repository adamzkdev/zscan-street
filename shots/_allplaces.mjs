// node shots/_allplaces.mjs [url]: every walk-in place entered once (their code loads on entry), a few frames
// drawn in each, then left: the errors, and how long each took to open
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?capture&debug"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|WebSocket connection/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.capture, { timeout: 240000, polling: 100 });
const keys = ["mempool", "factory", "library", "tower", "museum", "stadium", "prison", "mall", "hotel", "needle", "pyramid", "eiffel", "colosseum", "reserve", "opera", "bigben", "statue", "arab", "gardens", "palm", "tower-orchard", "tower-sapling", "tower-halo", "zodl", "vizor", "noir", "zlab", "zsalab", "convention", "university", "cemetery"];
const times = [];
for (const k of keys) {
  const n = errs.length;
  const ms = await p.evaluate(async (k) => {
    const t = performance.now();
    await capture.enter(k);
    for (let i = 0; i < 3; i++) capture.step(1 / 30);
    const d = performance.now() - t;
    capture.leave();
    capture.step(1 / 30);
    return Math.round(d);
  }, k).catch((e) => (errs.push(`${k}: ${e.message.slice(0, 200)}`), -1));
  times.push(`${k} ${ms}`);
  if (errs.length > n) console.log(k, "errors:", errs.slice(n).join(" | "));
}
console.log(times.join(", "));
console.log("errors:", errs.length);
await b.close();
