// node shots/_aerial.mjs [URL] [OUT]: the whole city district by district from above (the map's camera), to look for misplaced things
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&theme=day", OUT = "shots/gta/air"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 300 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => { document.getElementById("ui").style.display = "none"; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [];
if (!SPOTS.length) for (const z of [-200, -140, -80, -20, 40, 100]) for (const x of [-180, -110, -40, 40, 110, 180]) SPOTS.push([x, z]);
let n = 0;
for (const [x, z] of SPOTS) {
  await p.evaluate((x, z) => { const r = street.rig; r.district(r.controls.target.clone().set(x, 0, z), +(new URLSearchParams(location.search).get("zoom") ?? 3.2)); }, x, z);
  await sleep(2200);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
}
await b.close();
