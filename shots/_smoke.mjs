// Enters every walk-in place from the city, one after the other: errors, fps, a screenshot each.
import puppeteer from "puppeteer-core";
const keys = (process.argv[2] ?? "museum,stadium,prison,hotel,needle,pyramid,eiffel,colosseum").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3008/?debug&theme=day");
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
for (const k of keys) {
  errs.length = 0;
  const t0 = Date.now();
  await p.evaluate((k) => street.enter(k), k);
  await p.waitForFunction(() => street.interiors.active, { timeout: 60000 }).catch(() => {});
  const built = Date.now() - t0;
  await new Promise((r) => setTimeout(r, Number(process.env.STAY ?? 4000)));
  const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
  await p.screenshot({ path: `shots/smoke-${k}.png` });
  console.log(k, "enter", built, "ms, fps", fps, errs.filter((e) => !e.includes("fetch")).slice(0, 3).join(" | "));
  await p.evaluate(() => street.interiors.exit());
  await new Promise((r) => setTimeout(r, 1500));
}
await b.close();
