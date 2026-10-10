// node shots/_stairs.mjs: looks at every walkable stair/escalator from beside it, writes shots/st-<name>.png
import puppeteer from "puppeteer-core";
// [name, place, floor, eye x, z, look x, y(rel), z, (feet raised, m: on a flight)]
const VIEWS = [
  ["mall", "mall", 0, -3, -12, -8.4, 3, -22],
  ["mall2", "mall", 0, -9, -13.5, -9, 4, -26],
  ["louvre", "museum", 0, -9, -15, -17, 2.5, -19.5],
  ["louvre2", "museum", 0, -10, -20.5, -20, 4, -20.5],
  ["daru", "museum", 0, 4, -31, 0, 2, -38],
  ["factory", "factory", 0, 38, -2, 28, 3, -7.5],
  ["factory2", "factory", 0, 36.5, -7.4, 25, 4, -7.4],
  ["library", "library", 0, -6, -15, -14.5, 4, -26],
  ["library2", "library", 0, -14, -19.5, -14, 4, -31],
  ["hotel", "hotel", 0, -17.3, -1, -17.3, 4, -19],
  ["reserve", "reserve", 5, -24.2, -45, -24.2, -4, -24],
  ["arab", "arab", 2, 6, -2, 9.2, 2.5, -10],
  ["hypo", "colosseum", 1, -1, 19, -1, 3, 11],
  ["cavea", "colosseum", 0, 9, 4, 12.4, 2, -2],
  ["prison", "prison", 0, 6, -10, 6, 1.5, -6.5],
  ["louvretop", "museum", 0, -12, -23.5, -21, 5, -20],
  ["hotelfoot", "hotel", 0, -12, 2, -17.3, 2, -6],
  ["arabfoot", "arab", 2, 6.5, -4, 9.2, 1, -6],
  ["caveadoor", "colosseum", 0, 4, 2.5, 10, 1.5, 2.5],
  ["prison2", "prison", 0, 0, -9.5, 6, 1.5, -6.5],
  ["malltop", "mall", 1, -12, -30, -8.4, 7, -24],
  ["denondoor", "museum", 0, -5, -19.55, -22, 6.2, -19.55],
  ["richelieu", "museum", 0, 9, -15, 17, 2.5, -19.5],
  ["richdoor", "museum", 0, 5, -19.55, 22, 6.2, -19.55],
  ["darudoor", "museum", 0, 3.2, -31.6, 0, 3.6, -42],
  ["denonhead", "museum", 0, -16.6, -20.5, -30, 4.6, -19.55, 4.0],
  ["daruhead", "museum", 0, 0.95, -36.9, 0, 2.6, -50, 2.5],
  ["denonsoffit", "museum", 0, -14, -26, -20, 4.3, -19.5],
];
const only = process.argv[2]?.split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
let page = null, cur = null;
for (const [name, key, f, ex, ez, lx, ly, lz, up = 0] of VIEWS) {
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
  await page.evaluate(([f, ex, ez, lx, ly, lz, up]) => {
    const I = street.interiors; I.goTo(f);
    const y = I.active.floors[f].y; const V = I.walk.camera.position.constructor;
    I.walk.place(new V(ex, y + up, ez), Math.atan2(-(lx - ex), -(lz - ez)), y + up);
    I.walk.pitch = Math.atan2(ly - 1.6 - up, Math.hypot(lx - ex, lz - ez));
  }, [f, ex, ez, lx, ly, lz, up]);
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: `shots/st-${name}.png` });
  console.log(name);
}
await b.close();
