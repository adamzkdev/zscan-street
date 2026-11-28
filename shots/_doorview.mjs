// node shots/_doorview.mjs OUT x,z,fx,fz[,dist,height] ...: free camera views of door spots (debug)
import puppeteer from "puppeteer-core";
const [OUT, ...specs] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.gta.doorsReady, { timeout: 900000, polling: 300 });
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate(() => { street.gta.hud.coach(-1); const h = document.querySelector(".gta-hud"); if (h) h.style.display = "none"; });
let n = 0;
for (const s of specs) {
  const [x, z, fx, fz, dist = 6, hgt = 1.6] = s.split(",").map(Number);
  await p.evaluate((x, z, fx, fz, dist, hgt) => {
    const g = street.gta;
    const y = g.host.ground(x, z) ?? 0.2;
    const h = Math.atan2(fx, fz);
    const k = Math.max(0.6, dist - 3.2);
    g.player.place(x + fx * k, y, z + fz * k, h);
    g.player.group.scale.setScalar(0.001);
    g.nearDoors(x, z);
    g.cam.behind(h, -0.05 - (hgt - 1.6) / 10);
    g.cam.snap(g.player.pos.clone().setY(y + 1.55));
  }, x, z, fx, fz, dist, hgt);
  await new Promise((r) => setTimeout(r, 900));
  await p.screenshot({ path: `${OUT}-${++n}.png` });
}
await b.close();
