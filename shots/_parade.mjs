// The daily parade, rehearsed: node shots/_parade.mjs
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug&theme=night&parade=now");
await p.waitForFunction(() => window.street?.parade, { timeout: 180000 });
await p.waitForFunction(() => window.street.parade.eta != null, { timeout: 120000 });
console.log("eta", await p.evaluate(() => window.street.parade.eta));
const look = async (zoom, dx = 0) =>
  p.evaluate(
    (zoom, dx) => {
      const s = window.street;
      const f = s.parade.float;
      const V = s.rig.focus.constructor;
      const x = f ? f.position.x : -110;
      s.rig.district(new V(x + dx, 1, -156), zoom);
    },
    zoom,
    dx,
  );
await wait(12000);
for (const [i, zoom, dx] of [
  [1, 0.9, 0],
  [2, 1.6, 2],
  [3, 0.55, 10],
]) {
  await look(zoom, dx);
  await wait(4000);
  await p.screenshot({ path: `shots/parade-${i}.png` });
}
await b.close();
