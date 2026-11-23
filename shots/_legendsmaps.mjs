// node shots/_legendsmaps.mjs: each arena mid-game (AI on both seats), one picture each
import puppeteer from "puppeteer-core";
const maps = (process.argv[2] || "rigs,orchard,crypt,vault").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 200)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const m of maps) {
  await p.goto(`http://localhost:3071/tablelab.html?t=legends&auto&seed=${m.length * 31}&skill=0.8&map=${m}`);
  await sleep(+(process.env.WAIT || 38000));
  await p.screenshot({ path: `shots/legends/map-${m}.png` });
  console.log("shot", m);
}
console.log("errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
