// Whale shots: node shots/_whale.mjs [theme]
import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "day";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load") && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street?.game, { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(8000);
await p.evaluate(() => {
  street.game.whale(812);
  // start it near the heart so it is in view
  const w = street.game.whaleObj;
  if (w) w.position.x = -30;
});
await sleep(5000);
await p.screenshot({ path: `shots/whale-${theme}-0.png` });
for (let i = 0; i < 18; i++) {
  await p.evaluate(() => document.querySelector(".whaletag")?.click());
  await sleep(60);
}
await sleep(300);
await p.screenshot({ path: `shots/whale-${theme}-1-half.png` });
for (let i = 0; i < 12; i++) {
  await p.evaluate(() => document.querySelector(".whaletag")?.click());
  await sleep(60);
}
await sleep(1500);
await p.screenshot({ path: `shots/whale-${theme}-2-shielded.png` });
console.log(logs.join("\n") || "no errors");
await b.close();
