// node shots/_gtadoors.mjs [URL] [OUT]: every walk-in place's entrance from the pavement in front (src/gta/doors.ts)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/door"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const doors = await p.evaluate(() => street.gta.host.doors().map((d) => [d.key, d.x, d.z, d.fx, d.fz]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
let n = 0;
for (const [key, x, z, fx, fz] of doors) {
  if (only && !only.includes(key)) continue;
  await p.evaluate((x, z, fx, fz) => { const g = street.gta; const h = Math.atan2(fx, fz); g.player.place(x + fx * 5.5, 0.2, z + fz * 5.5, h); g.cam.behind(h, -0.05); g.cam.snap(g.player.pos.clone().setY(1.4)); }, x, z, fx, fz);
  await sleep(1300);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${key}.png` });
}
console.log(n, "doors");
await b.close();
