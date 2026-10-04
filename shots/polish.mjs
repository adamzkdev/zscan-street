import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
const logs = [];
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug");
await wait(14000);
await p.screenshot({ path: "shots/p-live.png" });
// hover the first visible zkSNARK
const pt = await p.evaluate(() => { const s = [...street.director.snarks].find((s) => s.root.visible && s.state !== "riding" && s.root.parent === s.root.parent); const v = s.body.getWorldPosition(new (s.root.position.constructor)()); v.project(street.rig.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
await p.mouse.move(pt.x, pt.y); await wait(400);
await p.screenshot({ path: "shots/p-hover.png", clip: { x: Math.max(0, pt.x - 300), y: Math.max(0, pt.y - 200), width: 600, height: 400 } });
// keyboard move + wheel
await p.mouse.move(800, 500);
await p.keyboard.down("ArrowRight"); await wait(1200); await p.keyboard.up("ArrowRight");
for (let i = 0; i < 4; i++) await p.mouse.wheel({ deltaY: -150 });
await wait(800);
console.log(await p.evaluate(() => `zoom ${street.rig.iso.zoom.toFixed(2)} target ${street.rig.controls.target.toArray().map((v) => v.toFixed(1))}`));
await p.screenshot({ path: "shots/p-moved.png" });
console.log(logs.join("\n"));
await b.close();
