// node shots/_legendsfx.mjs: frames of the new animations (attack lunge, summon slam, spells), via a scripted duel
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => /error/.test(m.type()) && errs.push(m.text().slice(0, 200)));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:3071/tablelab.html?t=legends&auto&seed=${process.env.SEED || 300}&skill=0.8&map=${process.env.MAP || "rigs"}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < +(process.env.DUR || 60000)) {
  await sleep(+(process.env.EVERY || 380));
  await p.screenshot({ path: `shots/legends/fx-${String(++n).padStart(3, "0")}.jpg`, type: "jpeg", quality: 70 });
}
console.log("frames", n, "errors:", errs.length ? [...new Set(errs)].join("\n") : "none");
await b.close();
