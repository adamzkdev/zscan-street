// node shots/_devices.mjs URL OUTPREFIX [walk]: the city on phones and tablets, upright and on
// their side (touch emulated: pointer coarse), plus the desktop: a still of the map (and on foot with `walk`), errors
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug", OUT = "shots/port-stability/dev", WALK = ""] = process.argv.slice(2);
const DEV = [
  ["phone-up", 393, 852, 3, true],
  ["phone-side", 852, 393, 3, true],
  ["tablet-up", 820, 1180, 2, true],
  ["tablet-side", 1180, 820, 2, true],
  ["desktop", 1440, 900, 1, false],
];
const only = process.env.ONLY?.split(",");
for (const [name, w, h, dpr, touch] of DEV) {
  if (only && !only.includes(name)) continue;
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: Math.min(dpr, 2), isMobile: touch, hasTouch: touch, isLandscape: w > h });
  if (touch) await p.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
  const t0 = Date.now();
  await p.goto(URL);
  await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 200 });
  const up = Date.now() - t0;
  await p.waitForFunction(() => !document.getElementById("boot"), { timeout: 60000, polling: 200 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 5000));
  const coarse = await p.evaluate(() => matchMedia("(pointer: coarse)").matches);
  await p.screenshot({ path: `${OUT}-${name}-map.png` });
  if (WALK) {
    await p.evaluate(() => street.walk(true));
    await new Promise((r) => setTimeout(r, 2500));
    await p.screenshot({ path: `${OUT}-${name}-foot.png` });
    await p.evaluate(() => street.walk(false));
    await p.evaluate(() => street.enter("museum"));
    await p.waitForFunction(() => street.interiors.active, { timeout: 60000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3500));
    await p.screenshot({ path: `${OUT}-${name}-inside.png` });
  }
  console.log(`${name} ${w}x${h} coarse=${coarse} up ${(up / 1000).toFixed(1)}s errors ${errs.length} ${errs.slice(0, 3).join(" | ")}`);
  await b.close();
}
