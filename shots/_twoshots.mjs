// node shots/_twoshots.mjs OUT_PREFIX URL…: the same view of each build (the start, then the whole-city map), side by side to compare
import puppeteer from "puppeteer-core";
const [OUT, ...URLS] = process.argv.slice(2);
for (const [i, URL] of URLS.entries()) {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
  const p = await b.newPage();
  await p.goto(URL);
  await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 100 });
  await new Promise((r) => setTimeout(r, 9000));
  await p.screenshot({ path: `${OUT}-${i}-start.png` });
  await p.evaluate(() => street.rig?.setMode?.("overview"));
  await new Promise((r) => setTimeout(r, 5000));
  await p.screenshot({ path: `${OUT}-${i}-overview.png` });
  await b.close();
}
