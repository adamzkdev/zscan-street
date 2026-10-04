import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(5000);
const fly = (x, z, zoom) => p.evaluate((x, z, zoom) => { const r = street.rig; r.flyTo(new (r.controls.target.constructor)(x, 1, z), zoom); }, x, z, zoom);
await fly(38, -7, 2.4);
await wait(4000); await p.screenshot({ path: "shots/v8-load.png" });
await fly(-5, -5, 2.4);
for (let i = 0; i < 6; i++) { await wait(2500); await p.screenshot({ path: `shots/v8-unload-${i}.png` }); }
await b.close();
