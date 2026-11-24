// node shots/_bdoors.mjs [OUT]: ordinary buildings' doors (the building's own entrance, src/gta nearDoors from city.facades door) seen from the pavement
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/doors2/b"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 540 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
await new Promise((r) => setTimeout(r, 2500));
const spots = await p.evaluate(() => { const g = street.gta; g.nearDoors(0, 0); const all = g.buildingSpots ?? []; const by = {}; for (const s of all) (by[s.type] ??= []).push(s); return Object.values(by).flatMap((l) => l.slice(0, 2)).map((s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz, type: s.type, label: s.label })); });
let n = 0;
for (const s of spots) {
  await p.evaluate((s) => { const g = street.gta; const px = s.x + s.fx * 6, pz = s.z + s.fz * 6; const h = Math.atan2(s.fx, s.fz); g.player.place(px, 0.2, pz, h); g.cam.behind(h, -0.06); g.cam.snap(g.player.pos.clone().setY(1.55)); }, s);
  await new Promise((r) => setTimeout(r, 1300));
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-${s.type}.png` });
}
console.log("shots", n);
await b.close();
