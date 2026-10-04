import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug");
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => { street.testVip("taxi"); const r = street.rig; r.flyTo(new (r.controls.target.constructor)(-14, 1, -6), 2.4); });
for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await p.evaluate(() => [...street.director.cars].some((c) => c.kind === "taxi" && Math.abs(c.group.position.x + 14) < 8))) break; }
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: "shots/taxi2.png" });
await b.close();
