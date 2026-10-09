// node shots/_aoview.mjs <name> [theme] — the AO buffer alone for _premium.mjs's views 0 and 2
import puppeteer from "puppeteer-core";
const [name = "ao", theme = "day"] = process.argv.slice(2);
const VIEWS = [{ pos: [6, 1.7, 22], look: [0, 5, -10], fov: 55 }, { pos: [96, 1.8, -42.5], look: [104, 9, -70], fov: 60 }, { pos: [45, 38, 65], look: [0, 0, 0], fov: 40 }];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && console.log("[error]", m.text()));
await p.goto(`http://localhost:3007/?debug&capture&theme=${theme}&quality=0`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 180000 });
for (let k = 0; k < 60; k++) await p.evaluate(() => capture.step(1 / 30));
await p.evaluate(() => (street.finish.showAO = true));
let i = 0;
for (const v of VIEWS) {
  await p.evaluate((v) => { capture.shot(v); for (let k = 0; k < 6; k++) capture.step(1 / 30); }, v);
  await p.screenshot({ path: `shots/premium/${name}-${i++}.png` });
}
await b.close();
