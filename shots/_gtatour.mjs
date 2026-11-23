// node shots/_gtatour.mjs [URL] [OUT]: a walk round the whole city at street level, the game's camera (src/gta), for a look at every district
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/tour"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
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
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// [x, z, heading (0 = north/−z, π/2 = west)] spread over the districts
const SPOTS = (process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [
  [0, 3.5, -Math.PI / 2], [-40, -44, 0], [40, 36, Math.PI], [-122, -1, 0], [122, -60, Math.PI],
  [-86, 10, 0], [-54, -150, -Math.PI / 2], [0, -120, 0], [86, -200, Math.PI / 2], [194, -100, Math.PI],
  [-194, 50, 0], [-158, 104, -Math.PI / 2], [54, 104, Math.PI / 2], [158, 136, -Math.PI / 2], [226, 0, 0], [-226, -180, Math.PI],
]);
let n = 0;
for (const [x, z, h] of SPOTS) {
  const ok = await p.evaluate((x, z, h) => {
    const g = street.gta;
    // the nearest free spot
    for (let r = 0; r < 12; r += 0.8) for (let a = 0; a < 6.28; a += 0.8) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!g.host.footBlocked(px, pz)) { g.player.place(px, 0.2, pz, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(1.55)); return [px.toFixed(0), pz.toFixed(0)]; }
    }
    return null;
  }, x, z, h);
  await sleep(1800);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
  console.log(n, ok, await p.evaluate(() => street.gta.roads.where(street.gta.player.pos.x, street.gta.player.pos.z).district));
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
