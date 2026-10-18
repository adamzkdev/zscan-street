// The ZSA MINT terminal, step by step on the real testnet: node shots/_labflow2.mjs
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const shot = (n) => p.screenshot({ path: `shots/mint-${n}.png` });
await p.goto("http://localhost:3007/?debug&theme=night&interior=zsalab");
await p.waitForFunction(() => window.street?.interiors?.active?.key === "zsalab", { timeout: 120000 });
await wait(5000);
await p.evaluate(() => window.street.zsaLab.open("mint"));
await wait(2000);
await shot("1-hero");
await p.click('.zsalab [data-a="create"]');
await wait(6000);
await shot("2-fuel");
let funded = false;
for (let i = 0; i < 90; i++) {
  await wait(5000);
  if (await p.$('.zsalab [data-a="strike"]')) {
    funded = true;
    break;
  }
  if (i === 3) await shot("2b-waiting");
}
log("funded", funded);
if (!funded) {
  console.log(await p.$eval(".zsalab", (e) => e.innerText));
  process.exit(1);
}
await p.type('.zsalab [name="name"]', "Neon Yen");
await p.click('.zsalab [data-a="preset"][data-v="21000000"]');
await p.type('.zsalab [name="name"]', "");
await wait(500);
await shot("3-strike");
await p.click('.zsalab [data-a="strike"]');
await wait(5000);
await shot("4-proving");
for (let i = 0; i < 40; i++) {
  await wait(2000);
  if (await p.$('.zsalab [data-a="post"]')) break;
}
await wait(1500);
await p.evaluate(() => window.street.zsaLab.close());
await wait(1200);
await shot("5-press");
await p.evaluate(() => window.street.zsaLab.open("mint"));
await wait(1500);
await shot("6-struck");
log("done");
await b.close();
