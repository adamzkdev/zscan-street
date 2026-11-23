// node shots/_gtastreets.mjs [URL] [OUT]: the pavements as you walk them (a dozen spots along the streets, looking down them)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/street"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const spots = await p.evaluate((n) => {
  const g = street.gta, R = g.roads.rects;
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let k = 0; out.length < n && k < 400; k++) {
    const r = R[Math.floor(rnd() * R.length)];
    const len = r.axis === "x" ? r.x1 - r.x0 : r.z1 - r.z0;
    if (len < 40) continue;
    const s = 10 + rnd() * (len - 20), side = rnd() < 0.5 ? -1 : 1;
    const w = r.axis === "x" ? r.z1 - r.z0 : r.x1 - r.x0;
    const x = r.axis === "x" ? r.x0 + s : r.at + side * (w / 2 + 1.6);
    const z = r.axis === "x" ? r.at + side * (w / 2 + 1.6) : r.z0 + s;
    // looking along the street
    const h = r.axis === "x" ? (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rnd() < 0.5 ? 0 : Math.PI);
    out.push([+x.toFixed(1), +z.toFixed(1), h]);
  }
  return out;
}, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
for (const [x, z, h] of spots) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, g.solid.topAt(x, z) ?? 0.2, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.4)); }, x, z, h);
  await sleep(1400);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
  console.log(n, x, z, h.toFixed(2));
}
await b.close();
