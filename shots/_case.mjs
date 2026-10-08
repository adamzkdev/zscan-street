// ZK Detective shots: node shots/_case.mjs
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load") && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=night`);
await p.waitForFunction(() => window.street?.game?.cases(), { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(7000);
await p.evaluate(() => {
  const c = street.game.cases();
  for (const k of ["factory", "library", "prison", "reserve"]) c.visit(k);
  c.open();
});
await sleep(600);
await p.screenshot({ path: `shots/case-0.png` });
const ans = await p.evaluate(() => street.game.cases().def?.answer);
console.log("answer", ans);
await p.evaluate(() => document.querySelector('.casepanel [data-a="archive"]').click());
await sleep(6000);
await p.screenshot({ path: `shots/case-1-archive.png` });
console.log(logs.join("\n") || "no errors");
await b.close();
