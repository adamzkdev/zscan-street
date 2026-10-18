// The parade seen with Watch (the camera on the star): node shots/_parade2.mjs
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug&theme=night&parade=now");
await p.waitForFunction(() => window.street?.parade?.eta != null, { timeout: 180000 });
await p.waitForFunction(() => window.street.parade.eta < -25 && window.street.parade.starSnark, { timeout: 180000 });
await p.evaluate(() => window.street.parade.watch());
await wait(6000);
await p.screenshot({ path: "shots/parade-watch-1.png" });
await wait(30000);
await p.screenshot({ path: "shots/parade-watch-2.png" });
console.log(await p.evaluate(() => ({ eta: window.street.parade.eta, x: window.street.parade.float?.position.x })));
await b.close();
