// node shots/_legendsintro.mjs [OUT]: the duel's opening, a frame every 300 ms from the VS to the mulligan
import puppeteer from "puppeteer-core";
const [OUT = "shots/legends/intro"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto(`http://localhost:${process.env.PORT || 3071}/tablelab.html?t=legends&seed=12&stake=100${process.env.MAP ? "&map=" + process.env.MAP : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);
await p.keyboard.press("Enter");
await sleep(1200);
await p.keyboard.press("Enter");
for (let i = 0; i < 14; i++) { await sleep(300); await p.screenshot({ path: `${OUT}-${String(i).padStart(3, "0")}.jpg`, type: "jpeg", quality: 80 }); }
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
