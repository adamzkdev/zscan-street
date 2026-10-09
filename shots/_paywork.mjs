// node shots/_paywork.mjs — City Works with the sealed-vote button (dev server on 3008)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:3008/?debug&theme=night`);
for (let k = 0; k < 120 && !(await p.evaluate(() => !!window.street?.game?.works?.state).catch(() => false)); k++) await wait(1000);
await p.evaluate(() => street.game.works.open());
await wait(1500);
await p.screenshot({ path: "shots/pay-works.png" });
const n = await p.$$eval(".works button.seal", (b) => b.length);
console.log("seal buttons", n);
if (n) {
  await p.click(".works button.seal");
  await wait(1200);
  await p.screenshot({ path: "shots/pay-works-vote.png" });
}
await b.close();
