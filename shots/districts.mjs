import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(12000);
await p.evaluate(() => (street.rig.auto = false));
const D = { transparent: -131.25, sapling: -56.25, orchard: 18.75, ironwood: 93.75 };
for (const [k, x] of Object.entries(D)) {
  await p.evaluate((x) => { const r = street.rig; r.setMode("live"); r.flyTo(new (r.controls.target.constructor)(x + 8, 1, -8), 0.75); }, x);
  await wait(3500);
  await p.screenshot({ path: `shots/d-${k}.png` });
}
await b.close();
