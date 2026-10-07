import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
await p.goto(`http://localhost:3036/?debug&theme=night`);
await p.waitForFunction(() => window.street, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 5000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(Math.round(n / 2.5)); }; requestAnimationFrame(f); }));
const info = () => p.evaluate(() => ({ calls: street.renderer.info.render.calls, tris: street.renderer.info.render.triangles, q: street.quality.level }));
await p.evaluate(() => street.rig.district(new street.rig.focus.constructor(159.5, 1, -210), 1.6));
await wait(1500);
await p.evaluate(() => street.walk(true));
const place = (x, z, yaw) => p.evaluate(([x, z, yaw]) => street.onFoot.place(new street.rig.focus.constructor(x, street.cemetery.groundAt(x, z) ?? 0.2, z), yaw), [x, z, yaw]);
await place(160.3, -223 + 103 / 6, Math.PI / 2 + 0.25);
await wait(12000);
for (let k = 0; k < 3; k++) {
  await p.evaluate(() => (street.cemetery.group.visible = true));
  await wait(1200);
  const a = await fps();
  await p.evaluate(() => (street.cemetery.group.visible = false));
  await wait(1200);
  const h = await fps();
  console.log("on", a, "off", h);
}
await p.evaluate(() => (street.cemetery.group.visible = true));
console.log("quality", await p.evaluate(() => street.quality.level));
await b.close();
