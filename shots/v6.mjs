import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => ["error"].includes(m.type()) && logs.push(`[${m.type()}] ${m.text()}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(12000);
await p.evaluate(() => (street.rig.auto = false));
for (let i = 0; i < 5; i++) { await wait(4000); console.log("t", i, await p.evaluate(() => street.states())); }
await p.evaluate(() => street.lookIn("ironwood")); await wait(1500); await p.screenshot({ path: "shots/v6-shop.png" });
await p.evaluate(() => street.rig.setMode("live"));
await p.evaluate(() => street.testBoard());
await wait(2500);
await p.evaluate(() => street.followBus());
for (let i = 0; i < 16; i++) {
  await wait(3000);
  const st = await p.evaluate(() => street.buses() + " | " + street.states());
  console.log("bus", i, st);
  if ([3, 6, 9, 12].includes(i)) await p.screenshot({ path: `shots/v6-bus-${i}.png` });
}
console.log(logs.slice(0, 10).join("\n"));
await b.close();
