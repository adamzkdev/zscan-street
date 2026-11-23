// A GAMEPARTY game played from the hall on a phone held upright: node shots/_gpphone.mjs <key> <outdir> [w h]
import puppeteer from "puppeteer-core";
const key = process.argv[2], out = process.argv[3];
const w = Number(process.argv[4] ?? 390), h = Number(process.argv[5] ?? 844);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  window.WebSocket = class { constructor() {} send() {} close() {} addEventListener() {} removeEventListener() {} };
});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 200)));
await p.goto(`http://localhost:3007/party.html?game=${key}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(4000);
await p.screenshot({ path: `${out}/ph-${key}-0.png` });
await p.evaluate(() => document.querySelector('[data-s="practice"]')?.click());
await sleep(9000);
await p.screenshot({ path: `${out}/ph-${key}-1.png` });
// tap through the card
await p.touchscreen.tap(w / 2, h / 2);
await sleep(5000);
await p.screenshot({ path: `${out}/ph-${key}-2.png` });
await sleep(6000);
await p.screenshot({ path: `${out}/ph-${key}-3.png` });
console.log(logs.join("\n") || "no errors");
await b.close();
