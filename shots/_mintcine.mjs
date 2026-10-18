// The coin cinematic, triggered with a real token already on the chain (local test only)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3007/?debug&theme=night&interior=zsalab");
await p.waitForFunction(() => window.street?.interiors?.active?.key === "zsalab", { timeout: 120000 });
await wait(8000);
const a = await (await fetch("http://127.0.0.1:8095/v1/zsa/assets")).json();
const neon = a.find((x) => x.name === "Neon Yen");
await p.evaluate(() => (window.street.interiors.walk.enabled = false));
await p.evaluate((n) => window.dispatchEvent(new CustomEvent("zsalab:minted", { detail: { name: n.name, asset_id: n.asset_id } })), neon);
for (const [i, ms] of [[1, 900], [2, 1500], [3, 1400], [4, 3500]]) {
  await wait(ms);
  await p.screenshot({ path: `shots/mintcine-${i}.png` });
}
await b.close();
