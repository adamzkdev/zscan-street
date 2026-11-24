import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 2300, height: 420 } });
const p = await b.newPage();
await p.goto(`http://localhost:3061/figtest.html?ids=${process.env.IDS ?? "1192,9703,42,5506,777"}&art`);
await p.waitForFunction(() => window.__figReady, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 500));
await p.screenshot({ path: process.argv[2] ?? "shots/gta/fig/art.png" });
await b.close();
