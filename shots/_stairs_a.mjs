// node shots/_stairs.mjs: looks at every walkable stair/escalator from beside it, writes shots/st-<name>.png
import puppeteer from "puppeteer-core";
// [name, place, floor, eye x, z, look x, y(rel), z]
const VIEWS = [
  // mall: west lane G->1 rises -z from -16.2 to -26.6 at x -8.4
  ["a-mallside", "mall", 0, -1, -21, -8.4, 3, -21.5],
  ["a-mallfoot", "mall", 0, -8.4, -11.5, -8.4, 2, -17],
  ["a-mallunder", "mall", 0, -6, -24, -8.4, 5, -25],
  ["a-mallhead", "mall", 1, -8.4, -29.6, -8.4, -1, -24],
  ["a-mallhead2", "mall", 1, -11.5, -28, -8.4, 0, -25.6],
  ["a-mallpier", "mall", 1, -3, -23, -8.4, 5, -28],
  ["a-mallpier2", "mall", 1, -13, -25, -8.4, 6.5, -27.4],
  ["a-mallupper", "mall", 2, 3, -12, -8.4, 10, -26],
  ["a-mallnewel", "mall", 0, -6.5, -13.2, -8.4, 0.7, -15.5],
  ["a-mallabove", "mall", 3, 0, -10, 0, 4, -24],
  ["a-mallgarden", "mall", 0, 0, -13.2, 8, 3, -24],
  ["a-mallstep", "mall", 1, -9.0, -26.5, -9.0, 4, -20],
  ["a-mallfar", "mall", 1, -9.6, -26.2, -8.4, 7.4, -32],
  ["a-mallnorth", "mall", 1, -6, -37.5, -8.4, 7, -30],
  ["a-mallwide", "mall", 0, 6, -12.5, -6, 6, -26],
  // factory: lower flight foot 35.4 -> 25 at z -8..-6.8; upper 25 -> 32.35 at z -9.2..-8
  ["a-facside", "factory", 0, 30, -2.5, 30, 3, -7.4],
  ["a-facfoot", "factory", 0, 37.5, -6.5, 30, 2, -7.4],
  ["a-facunder", "factory", 0, 27, -11, 27, 4, -7.4],
  ["a-faclanding", "factory", 1, 22.6, -8.4, 32, 8, -8.6],
  ["a-factop", "factory", 2, 34, -8.6, 25, 7, -8],
  ["a-facland2", "factory", 1, 28, -7.4, 23, 6.5, -8.2],
  ["a-facside2", "factory", 0, 28, -14, 28, 6, -8],
  // library: a x -14.6..-13.4 (G foot -21 -> T1 head -31.4), b x -15.8..-14.6 (T1 -31.4 -> T2 -21)
  ["a-libside", "library", 0, -6, -26, -14.5, 5, -26],
  ["a-libfoot", "library", 0, -13, -16, -14.4, 3, -24],
  ["a-libunder", "library", 0, -10, -33, -15, 6, -27],
  ["a-liblanding", "library", 1, -17.5, -32.2, -15, 9, -24],
  ["a-libbridge", "library", 2, -21, -20.3, -15, 9, -28],
  ["a-libT1", "library", 1, -19.5, -22, -14.5, 7, -26],
  ["a-lib2", "library", 0, -14, -19.5, -14, 4, -31],
  ["a-libtop", "library", 1, -14, -30.8, -14, 4.5, -22],
  ["a-libland", "library", 0, -9, -38, -16.5, 5.5, -32],
  ["a-libland2", "library", 1, -16.8, -27, -16.8, 5.5, -32.5],
  ["a-libfar", "library", 0, 2, -12, -15, 7, -26],
];
const only = process.argv[2]?.split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
let page = null, cur = null;
for (const [name, key, f, ex, ez, lx, ly, lz] of VIEWS) {
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
  await page.evaluate(([f, ex, ez, lx, ly, lz]) => {
    const I = street.interiors; I.goTo(f);
    const y = I.active.floors[f].y; const V = I.walk.camera.position.constructor;
    I.walk.place(new V(ex, y, ez), Math.atan2(-(lx - ex), -(lz - ez)), y);
    I.walk.pitch = Math.atan2(ly - 1.6, Math.hypot(lx - ex, lz - ez));
  }, [f, ex, ez, lx, ly, lz]);
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: `shots/st-${name}.png` });
  console.log(name);
}
await b.close();
