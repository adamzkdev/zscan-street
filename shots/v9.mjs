import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(4000);
await p.evaluate(() => { const r = street.rig; r.flyTo(new (r.controls.target.constructor)(-4, 1, -6), 2.3); });
let found = false;
for (let i = 0; i < 90 && !found; i++) {
  await wait(1000);
  found = await p.evaluate(() => [...street.director.snarks].some((s) => s.role && s.role.includes("driver")));
}
console.log("driver seen", found);
for (let i = 0; i < 4; i++) { await wait(1800); await p.screenshot({ path: `shots/v9-${i}.png` }); }
// and the factory loading
await p.evaluate(() => { const r = street.rig; r.flyTo(new (r.controls.target.constructor)(38, 1, -8), 2.3); });
let loading = false;
for (let i = 0; i < 90 && !loading; i++) { await wait(1000); loading = await p.evaluate(() => [...street.director.snarks].some((s) => s.role === "Factory hand")); }
await wait(1500); await p.screenshot({ path: "shots/v9-load.png" });
await b.close();
