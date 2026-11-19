// node shots/_footcheck.mjs URL OUT: on foot on a desktop: stills over a few seconds, every console line
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug", OUT = "shots/port-stability/foot"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
p.on("console", (m) => /warn|error/.test(m.type()) && console.log(m.type(), m.text().slice(0, 300)));
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 200 });
await new Promise((r) => setTimeout(r, 5000));
await p.evaluate(() => street.walk(true));
for (const ms of [300, 1200, 3000]) {
  await new Promise((r) => setTimeout(r, ms));
  await p.screenshot({ path: `${OUT}-${ms}.png` });
}
console.log(await p.evaluate(() => JSON.stringify({ info: street.renderer.info.render, pos: street.onFoot.camera.position.toArray().map((v) => +v.toFixed(1)) })));
await b.close();
