// node shots/_phone.mjs <name> [portrait|landscape] [js]: a phone-sized view of the city, writes shots/phone-<name>.png
import puppeteer from "puppeteer-core";
const [name = "p", orient = "landscape", js] = process.argv.slice(2);
const land = orient === "landscape";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.emulate({ viewport: { width: land ? 844 : 390, height: land ? 390 : 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: land }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&quality=2&theme=${process.env.THEME ?? "night"}${process.env.QS ?? ""}`);
await p.waitForFunction(() => window.street, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 8000));
if (js) { await p.evaluate(js); await new Promise((r) => setTimeout(r, 3000)); }
await p.screenshot({ path: `shots/phone-${name}.png` });
await b.close();
