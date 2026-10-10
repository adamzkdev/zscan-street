// node shots/_stairs.mjs: looks at every walkable stair/escalator from beside it, writes shots/st-<name>.png
import puppeteer from "puppeteer-core";
// [name, place, floor, eye x, z, look x, y(rel), z]
const VIEWS = [
  ["c-hypofoot", "colosseum", 1, -1, 18.9, -1, 0, 12],
  ["c-hypocorr", "colosseum", 1, 1.2, 19.0, -0.6, -2, 13],
  ["c-hypohead", "colosseum", 0, -1, 10.8, -1, -4, 17],
  ["c-hypoup", "colosseum", 0, -1, 15.5, -1, 1, 10, -4.5],
  ["c-caveafoot", "colosseum", 0, 12.4, 2.8, 12.4, 2, -2],
  ["c-caveamid", "colosseum", 0, 12.4, 0.5, 12.4, 4, -3, 1.3],
  ["c-caveatop", "colosseum", 2, 12.4, -3.6, 12.4, -1.5, 2],
];
const only = process.argv[2]?.split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
let page = null, cur = null;
for (const [name, key, f, ex, ez, lx, ly, lz, fy = 0] of VIEWS) {
  if (only && !only.includes(name)) continue;
  for (let tries = 0; tries < 4; tries++) {
    try {
      if (cur !== key) {
        if (page) await page.close();
        page = await b.newPage();
        page.on("pageerror", (e) => console.log("[pageerror]", e.message));
        await page.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=${key}`);
        await page.waitForFunction(() => window.street?.interiors?.active, { timeout: 150000 });
        await new Promise((r) => setTimeout(r, 3500));
        cur = key;
      }
      await page.evaluate(([f, ex, ez, lx, ly, lz, fy]) => {
        const I = street.interiors; I.goTo(f);
        const y = I.active.floors[f].y + fy; const V = I.walk.camera.position.constructor;
        I.walk.place(new V(ex, y, ez), Math.atan2(-(lx - ex), -(lz - ez)), y);
        I.walk.pitch = Math.atan2(ly - fy - 1.6, Math.hypot(lx - ex, lz - ez));
      }, [f, ex, ez, lx, ly, lz, fy]);
      await new Promise((r) => setTimeout(r, 1800));
      const eye = await page.evaluate(() => { const c = street.interiors.walk.camera.position; return `eye ${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}`; });
      await page.screenshot({ path: `shots/st-${name}.png` });
      console.log(name, eye);
      break;
    } catch (e) {
      console.log("retry", name, e.message.slice(0, 80));
      cur = null;
    }
  }
}
await b.close();
