// node shots/_gtaqueue.mjs: the visitors queueing at the museum's and the Colosseum's doors (src/gta/peds.ts fillQueues)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => street.gta.hud.coach(-1));
for (const key of ["museum", "colosseum"]) {
  await p.evaluate((key) => { const g = street.gta; const d = g.placeSpots.find((x) => x.key === key); const h = Math.atan2(d.fx, d.fz) + 0.5; g.player.place(d.x + d.fx * 9 - d.fz * 3, d.y, d.z + d.fz * 9 + d.fx * 3, h); g.cam.behind(h, -0.08); g.cam.snap(g.player.pos.clone().setY(1.5)); }, key);
  await sleep(7000);
  console.log(key, await p.evaluate((key) => street.gta.peds.all.filter((q) => q.queue?.key === key).length, key));
  await p.screenshot({ path: `shots/gta/queue-${key}.png` });
}
await b.close();
