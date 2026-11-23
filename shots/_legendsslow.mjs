import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message + " " + (e.stack || "").slice(0, 300)));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 300)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:3071/tablelab.html?t=legends&auto&seed=77&skill=0.8`);
const t0 = Date.now();
let shots = 0;
while (Date.now() - t0 < 300000) {
  const done = await p.evaluate(() => window.lab && window.lab.done);
  if (done) break;
  await new Promise((r) => setTimeout(r, 15000));
  await p.screenshot({ path: `/Users/adam/Documents/GitHub/zcash/zstreet-cards/shots/legends/slow-${++shots}.png` });
}
console.log("done:", await p.evaluate(() => JSON.stringify(window.lab.result)), ((Date.now() - t0) / 1000).toFixed(0), "s");
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
