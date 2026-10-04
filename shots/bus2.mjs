import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`http://localhost:3007/?debug&theme=day`);
await new Promise((r) => setTimeout(r, 9000));
await p.evaluate(() => street.testBoard());
for (const [i, ms] of [[1, 7000], [2, 6000], [3, 9000]]) {
  await new Promise((r) => setTimeout(r, ms));
  if (i === 2) await p.click('[data-table="buses"]').catch(() => {});
  await p.screenshot({ path: `shots/bus2-${i}.png` });
}
console.log(logs.join("\n"));
await b.close();
