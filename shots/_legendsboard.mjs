// node shots/_legendsboard.mjs <port> <maps,comma> [wait ms] [prefix]: each arena mid-game (AI on both seats), a full shot and a close-up
import puppeteer from "puppeteer-core";
const [port = "3076", list = "rigs", waitMs = "30000", pre = "shots/legends/board"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 200)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const m of list.split(",")) {
  await p.goto(`http://localhost:${port}/tablelab.html?t=legends&auto&seed=300&skill=0.8&map=${m}`);
  await sleep(+waitMs);
  await p.screenshot({ path: `${pre}-${m}.png` });
  await p.screenshot({ path: `${pre}-${m}-close.png`, clip: { x: 430, y: 220, width: 740, height: 560 } });
  const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
  console.log(m, "fps~", fps);
}
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
