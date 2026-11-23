// node shots/_legendsauto.mjs [games]: ZK LEGENDS played to the end by AI on both seats in the real table (fast), errors collected
import puppeteer from "puppeteer-core";
const N = +(process.argv[2] || 4);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 300)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
for (let i = 0; i < N; i++) {
  const seed = 100 + i * 17;
  const t0 = Date.now();
  await p.goto(`http://localhost:3071/tablelab.html?t=legends&auto&fast&seed=${seed}&stake=100&skill=0.8`);
  try {
    await p.waitForFunction(() => window.lab && window.lab.done, { timeout: 240000, polling: 500 });
    const r = await p.evaluate(() => window.lab.result);
    console.log(`game ${i} seed ${seed}: ${r?.summary} payout ${r?.payout} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.log(`game ${i} seed ${seed}: did not finish`);
    await p.screenshot({ path: `shots/legends/stuck-${seed}.png` });
  }
}
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
