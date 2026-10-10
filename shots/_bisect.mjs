import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 150000 });
for (let k = 0; k < 150; k++) await p.evaluate(() => capture.step(1 / 30));
const root = () => 'street.scene3.children[52]';
const names = await p.evaluate(() => street.scene3.children[52].children.map((c, i) => i + ":" + (c.name || c.type) + ":" + (c.isInstancedMesh ? 'inst' + c.count : c.children.length)));
console.log(names.join(" "));
const n = await p.evaluate(() => street.scene3.children[52].children.length);
for (let i = 0; i < n; i++) {
  await p.evaluate((i) => { const c = street.scene3.children[52].children[i]; c.userData._v = c.visible; c.visible = false; capture.shot({ pos: [12, 14, 14], look: [0, 0, 0], fov: 45 }); for (let k = 0; k < 3; k++) capture.step(1 / 30); }, i);
  await p.screenshot({ path: `shots/bis-${i}.png`, clip: { x: 600, y: 320, width: 220, height: 140 } });
  await p.evaluate((i) => { const c = street.scene3.children[52].children[i]; c.visible = c.userData._v; }, i);
}
await b.close();
