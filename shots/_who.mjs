// ZK WHO? in the bench: asks three questions then guesses. node shots/_who.mjs <outdir> [w h]
import puppeteer from "puppeteer-core";
const out = process.argv[2];
const w = Number(process.argv[3] ?? 1280), h = Number(process.argv[4] ?? 800);
const mobile = w < 600;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 200)));
await p.goto(`http://localhost:3007/partylab.html?arcade=zkwho`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.waitForSelector(".wh-card", { timeout: 30000 });
await sleep(2500);
await p.screenshot({ path: `${out}/who-${w}-0.png` });
for (let i = 0; i < 3; i++) {
  await p.evaluate((i) => { const ks = document.querySelectorAll("[data-kind]"); ks[i % ks.length].click(); }, i);
  await sleep(200);
  await p.evaluate(() => document.querySelector("[data-q]")?.click());
  await sleep(500);
  if (i === 0) await p.screenshot({ path: `${out}/who-${w}-1.png` });
  await sleep(2600);
}
await p.screenshot({ path: `${out}/who-${w}-2.png` });
await p.evaluate(() => document.querySelector("[data-a=guess]")?.click());
await sleep(300);
await p.evaluate(() => document.querySelector(".wh-card:not(.down)")?.click());
await sleep(2000);
await p.screenshot({ path: `${out}/who-${w}-3.png` });
console.log(logs.join("\n") || "no errors");
await b.close();
