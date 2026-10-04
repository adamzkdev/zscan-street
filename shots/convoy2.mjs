import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(9000);
await p.evaluate(() => street.testVip("limo"));
for (let i = 0; i < 8; i++) { await wait(4000); console.log("pickup", await p.evaluate(() => street.cars() + " | bus " + street.director.bus.phase)); }
await p.evaluate(() => street.testBoard());
for (let i = 0; i < 12; i++) { await wait(2500); console.log("block", await p.evaluate(() => street.cars() + " | bus " + street.director.bus.phase)); }
await b.close();
