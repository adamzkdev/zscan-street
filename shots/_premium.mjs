// Before/after views for the premium render pass: node shots/_premium.mjs <prefix> [day|night] [quality]
// City views in capture mode, written to shots/premium/<prefix>-<theme>-<i>.png
import puppeteer from "puppeteer-core";
const [prefix = "x", theme = "day", q = "0"] = process.argv.slice(2);
const VIEWS = [
  { pos: [6, 1.7, 22], look: [0, 5, -10], fov: 55 },
  { pos: [45, 38, 65], look: [0, 0, 0], fov: 40 },
  { pos: [96, 1.8, -42.5], look: [104, 9, -70], fov: 60 },
  { pos: [-70, 70, 170], look: [0, 0, 40], fov: 45 },
  { pos: [14, 3, 14], look: [26, 6, -6], fov: 45 },
  { pos: [-30, 14, 60], look: [-10, 2, 20], fov: 45 },
  { pos: [99, 1.7, -44.5], look: [106, 4.5, -49], fov: 50 },
  { pos: [5, 1.7, 35], look: [-1, 4, 30.5], fov: 50 },
];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load") && console.log("[error]", m.text()));
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&capture&theme=${theme}&quality=${q}${process.env.QS ?? ""}`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 180000 });
const tw = Date.now() + 5000;
while (Date.now() < tw) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 20)); }
if (process.env.EVAL) await p.evaluate(process.env.EVAL);
const only = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null;
let i = 0;
for (const v of VIEWS) {
  if (only && !only.includes(i)) { i++; continue; }
  await p.evaluate((v) => { capture.shot(v); for (let k = 0; k < 8; k++) capture.step(1 / 30); }, v);
  await p.screenshot({ path: `shots/premium/${prefix}-${theme}-${i++}.png` });
}
await b.close();
