// node shots/_halt.mjs: the "way back" screens. 1) phone: GPU context lost → TAP TO RELOAD, then the reload opens in safe mode;
// 2) desktop: context lost and restored → no message; 3) the app's main chunk fails to load → TAP TO RETRY.
import puppeteer from "puppeteer-core";
const base = `http://localhost:${process.env.PORT ?? 3018}/`;
const launch = () => puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const phone = { viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
const halt = (p) => p.evaluate(() => document.querySelector("#halt")?.innerText.replace(/\s+/g, " ") ?? null);
const lose = (p) => p.evaluate(() => { const gl = street.renderer.getContext(); window.__lc = gl.getExtension("WEBGL_lose_context"); window.__lc.loseContext(); });
{
  const b = await launch();
  const p = await b.newPage();
  await p.emulate(phone);
  await p.goto(base + "?debug");
  await p.waitForFunction(() => window.street, { timeout: 600000 });
  await new Promise((r) => setTimeout(r, 4000));
  await lose(p);
  await new Promise((r) => setTimeout(r, 1000));
  console.log("phone, context lost:", await halt(p));
  
  await Promise.all([p.waitForNavigation(), p.click("#halt button")]);
  await p.waitForFunction(() => window.street, { timeout: 600000 });
  console.log("after reload: tier", await p.evaluate(() => street.quality?.level), "safe flag", await p.evaluate(() => sessionStorage.getItem("street.safe")));
  await b.close();
}
{
  const b = await launch();
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(base + "?debug");
  await p.waitForFunction(() => window.street, { timeout: 600000 });
  await new Promise((r) => setTimeout(r, 3000));
  await lose(p);
  await new Promise((r) => setTimeout(r, 1000));
  await p.evaluate(() => window.__lc.restoreContext());
  await new Promise((r) => setTimeout(r, 8000));
  console.log("desktop, lost then restored:", await halt(p));
  await b.close();
}
{
  const b = await launch();
  const p = await b.newPage();
  await p.emulate(phone);
  await p.setRequestInterception(true);
  let entry = 0;
  p.on("request", (r) => (/\/assets\/main-[^/]*\.js$|\/src\/main\.ts/.test(r.url()) ? (entry++, r.abort()) : r.continue()));
  await p.goto(base + "?debug");
  await new Promise((r) => setTimeout(r, 4000));
  console.log("main chunk blocked (" + entry + "):", await halt(p));
  
  await b.close();
}
