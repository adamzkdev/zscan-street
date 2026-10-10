// node shots/_stairs.mjs: looks at every walkable stair/escalator from beside it, writes shots/st-<name>.png
import puppeteer from "puppeteer-core";
// [name, place, floor, eye x, z, look x, y(rel), z]
const VIEWS = [
  // [name, place, floor, ex, ez, lx, ly, lz, eye dy]
  ["b-hotelfoot", "hotel", 0, -17.3, -21.6, -17.3, 3, -10],
  ["b-hotelmid", "hotel", 0, -16.0, -12, -17.5, 5, -19.3, 6.5],
  ["b-hoteltop", "hotel", 1, -17.3, -1.0, -17.3, -3, -14],
  ["b-hotelfootE", "hotel", 0, -17.5, -21.4, -15.0, 0.8, -19.0],
  ["b-hotelheadW", "hotel", 1, -17.5, -1.5, -19.5, 0.6, -3.6],
  ["b-hotelside", "hotel", 0, -19.2, -21.5, -16, 0.5, -16],
  ["b-resfoot", "reserve", 5, -24.2, -45.8, -24.2, 3, -34],
  ["b-restop", "reserve", 0, -24.2, -21, -24.2, -6, -35],
  ["b-resside", "reserve", 5, -26.0, -45.8, -23, -4, -40],
  ["b-resmid", "reserve", 0, -22.6, -30, -25.5, -4.5, -38, -2.5],
  ["b-resheadL", "reserve", 0, -24.5, -22.4, -26.4, 0.5, -24.5],
  ["b-resfootR", "reserve", 5, -24.5, -45.5, -22.0, -0.5, -43.0],
  ["b-arab", "arab", 2, 6, -2, 9.2, 2.5, -10],
  ["b-arabfoot", "arab", 2, 6.5, -4, 9.2, 1, -6],
  ["b-arabside", "arab", 2, 4.0, -8.0, 9.5, 2.2, -8.2],
  ["b-arabwest", "arab", 2, 6.5, -12.5, 9.2, 2.5, -6],
  ["b-arabtop", "arab", 3, 9.2, -12.6, 9.2, -2, -6],
  ["b-arabup", "arab", 3, 7, -9, 9.2, 0, -7],
  ["b-arabunder", "arab", 2, 11.0, -12.5, 9.2, 2.5, -8],
];
const only = process.argv[2]?.split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
let page = null, cur = null;
for (const [name, key, f, ex, ez, lx, ly, lz, dy = 0] of VIEWS) {
  if (only && !only.includes(name)) continue;
  if (cur !== key) {
    if (page) await page.close();
    page = await b.newPage();
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=${key}`);
    await page.waitForFunction(() => window.street?.interiors?.active, { timeout: 150000 });
    await new Promise((r) => setTimeout(r, 3500));
    cur = key;
  }
  // the dev server may hot-reload under us (other edits): wait for the place to be back
  for (let tries = 0; ; tries++) {
    try {
      await page.waitForFunction((k) => window.street?.interiors?.active?.key === k || window.street?.interiors?.active, { timeout: 150000 }, key);
      if (!(await page.evaluate((k) => location.search.includes(k) && !!window.street?.interiors?.active, key))) throw new Error("not ready");
      break;
    } catch (e) {
      if (tries > 3) throw e;
      await page.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=${key}`);
      await new Promise((r) => setTimeout(r, 3500));
    }
  }
  await page.evaluate(([f, ex, ez, lx, ly, lz, dy]) => {
    const I = street.interiors; I.goTo(f);
    const y = I.active.floors[f].y + dy; const V = I.walk.camera.position.constructor;
    I.walk.place(new V(ex, y, ez), Math.atan2(-(lx - ex), -(lz - ez)), y);
    I.walk.pitch = Math.atan2(ly - 1.6 - dy, Math.hypot(lx - ex, lz - ez));
  }, [f, ex, ez, lx, ly, lz, dy]);
  await new Promise((r) => setTimeout(r, 1800));
  if (!(await page.evaluate(() => !!window.street?.interiors?.active))) { console.log("reloaded during", name); continue; }
  await page.screenshot({ path: `shots/st-${name}.jpg`, type: "jpeg", quality: 80 });
  console.log(name);
}
await b.close();
