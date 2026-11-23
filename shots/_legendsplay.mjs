// node shots/_legendsplay.mjs: the hub and the Play screen (decks by name)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} }; });
await p.goto("http://localhost:3071/tablelab.html?t=legends&seed=12&stake=100");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(4000);
await p.screenshot({ path: "shots/legends/r5-hub.png" });
await p.keyboard.press("Enter");
await sleep(1500);
await p.screenshot({ path: "shots/legends/r5-play.png" });
await b.close();
