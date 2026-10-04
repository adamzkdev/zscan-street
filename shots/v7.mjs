import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(9000);
await p.screenshot({ path: "shots/v7-live.png" });
// watch the depot / factory
await p.evaluate(() => { const r = street.rig; r.flyTo(new (r.controls.target.constructor)(36, 1, -6), 1.8); });
for (let i = 0; i < 5; i++) { await wait(2500); await p.screenshot({ path: `shots/v7-dock-${i}.png` }); }
// then the shop
await p.evaluate(() => { const r = street.rig; r.flyTo(new (r.controls.target.constructor)(-6, 1, -6), 2.0); });
for (let i = 0; i < 4; i++) { await wait(3500); await p.screenshot({ path: `shots/v7-shop-${i}.png` }); }
// middle-drag rotate
await p.evaluate(() => street.rig.setMode("live")); await wait(2000);
const before = await p.evaluate(() => street.rig.iso.position.toArray().map((v) => v.toFixed(1)).join(","));
await p.mouse.move(800, 500); await p.mouse.down({ button: "middle" }); await p.mouse.move(1000, 500, { steps: 10 }); await p.mouse.up({ button: "middle" });
await wait(600);
console.log("rotate", before, "->", await p.evaluate(() => street.rig.iso.position.toArray().map((v) => v.toFixed(1)).join(",")));
// click the shop
const pt = await p.evaluate(() => { const v = street.city.shops[0].door.clone(); v.y = 2; v.z -= 1; v.project(street.rig.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
await p.mouse.click(pt.x, pt.y); await wait(1500);
console.log("mode after shop click", await p.evaluate(() => street.rig.mode + " " + street.rig.shot));
await p.screenshot({ path: "shots/v7-inside.png" });
console.log(logs.join("\n"));
await b.close();
