// node shots/_gtadoorshots.mjs [URL] [OUT]: every walk-in place's door in the game (src/gta), seen from the pavement in front, at street level
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/doors/d"] = process.argv.slice(2);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const spots = await p.evaluate(() => street.gta.placeSpots.map((d) => ({ key: d.key, x: d.x, z: d.z, fx: d.fx, fz: d.fz, label: d.label ?? d.name ?? "" })));
console.log("doors", spots.length);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
for (const d of spots) {
  if (ONLY && !ONLY.includes(d.key)) continue;
  await p.evaluate((d) => {
    const g = street.gta;
    // 9 m out in front, facing the door
    const px = d.x + d.fx * 9, pz = d.z + d.fz * 9;
    const h = Math.atan2(d.fx, d.fz);
    g.player.place(px, 0.2, pz, h);
    g.cam.behind(h, -0.08);
    g.cam.snap(g.player.pos.clone().setY(1.55));
  }, d);
  await sleep(1500);
  const f = `${OUT}-${String(++n).padStart(2, "0")}-${d.key}.png`;
  await p.screenshot({ path: f });
  console.log(n, d.key, d.x.toFixed(0), d.z.toFixed(0));
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
