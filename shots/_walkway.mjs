// node shots/_walkway.mjs [URL] [OUT] [N]: down the pavements of the whole city at walking height (the game's camera), to look for anything misplaced
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/walk", N = "24"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const spots = await p.evaluate((n) => {
  const R = street.gta.roads.rects.filter((r) => (r.axis === "x" ? r.x1 - r.x0 : r.z1 - r.z0) > 30);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; out.length < n && i < 400; i++) {
    const r = R[Math.floor(rnd() * R.length)];
    const side = rnd() < 0.5 ? -1 : 1;
    const t = 0.15 + rnd() * 0.7;
    let x, z, h;
    if (r.axis === "x") { x = r.x0 + (r.x1 - r.x0) * t; z = (side < 0 ? r.z0 : r.z1) + side * 2.2; h = rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
    else { z = r.z0 + (r.z1 - r.z0) * t; x = (side < 0 ? r.x0 : r.x1) + side * 2.2; h = rnd() < 0.5 ? 0 : Math.PI; }
    if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < 40)) continue;
    out.push([x, z, h, r.name]);
  }
  return out;
}, +N);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
for (const [x, z, h, name] of spots) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, 0.2, z, h); g.cam.behind(h, -0.12); g.cam.snap(g.player.pos.clone().setY(1.4)); }, x, z, h);
  await sleep(1600);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
  console.log(n, x.toFixed(0), z.toFixed(0), name);
}
await b.close();
