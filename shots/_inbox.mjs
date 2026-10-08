// The inbox: node shots/_inbox.mjs
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=night`);
await p.waitForFunction(() => window.street?.game, { timeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(8000);
await p.evaluate(() => { street.game.block(0); street.game.whale(812); street.game.eggs.test("palindrome"); });
await sleep(1500);
await p.screenshot({ path: "shots/inbox-1-badge.png", clip: { x: 900, y: 0, width: 500, height: 90 } });
await p.click(".mailbtn");
await sleep(400);
await p.screenshot({ path: "shots/inbox-2-open.png" });
await p.click(".zchip");
await sleep(400);
await p.screenshot({ path: "shots/inbox-3-card.png" });
await b.close();
