// node shots/_legendsvs.mjs: the face-off before the mulligan
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto("http://localhost:3071/tablelab.html?t=legends&seed=12&stake=100");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
await sleep(1500);
await p.screenshot({ path: "shots/legends/r6-vs.png" });
await sleep(2500);
await p.screenshot({ path: "shots/legends/r6-mull.png" });
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
