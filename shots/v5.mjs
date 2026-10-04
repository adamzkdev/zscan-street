import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`[${m.type()}] ${m.text()}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(14000);
await p.evaluate(() => { street.rig.auto = false; street.rig.setMode("overview"); });
await wait(3000); await p.screenshot({ path: "shots/v5-overview.png" });
for (const k of ["transparent", "ironwood"]) { await p.evaluate((k) => street.lookIn(k), k); await wait(2000); await p.screenshot({ path: `shots/v5-shop-${k}.png` }); }
await p.evaluate(() => street.rig.setMode("live"));
for (let i = 0; i < 6; i++) { await wait(3000); console.log("traffic", await p.evaluate(() => street.cars())); }
console.log(logs.slice(0, 12).join("\n"));
await b.close();
