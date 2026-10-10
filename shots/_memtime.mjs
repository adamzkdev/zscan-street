// node shots/_memtime.mjs [minutes]: a phone in landscape left running; heap, GPU objects, tier every 20 s
import puppeteer from "puppeteer-core";
const mins = Number(process.argv[2] ?? 3);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => /quality|context|error/i.test(m.text()) && console.log("[console]", m.text().slice(0, 140)));
await p.goto(`http://localhost:${process.env.PORT ?? 3008}/?debug${process.env.QS ?? ""}`);
await p.waitForFunction(() => window.street, { timeout: 300000 });
const t0 = Date.now();
while (Date.now() - t0 < mins * 60000) {
  const s = await p.evaluate(() => { const i = street.renderer.info; return { heap: Math.round(performance.memory.usedJSHeapSize / 1e6), geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs?.length, tier: street.quality?.level, dpr: street.renderer.getPixelRatio() }; });
  console.log(Math.round((Date.now() - t0) / 1000) + "s", JSON.stringify(s));
  await new Promise((r) => setTimeout(r, 20000));
}
await b.close();
