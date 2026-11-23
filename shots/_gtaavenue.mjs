// node shots/_gtaavenue.mjs [URL] [OUT]: down the big avenues: every zkSNARK in sight in 3D, no flat figure (src/gta/people3d.ts)
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/avenue"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|500|Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => street.gta.hud.coach(-1));
const views = [
  ["mempool", 30, 4.6, -Math.PI / 2],
  ["orchard", 86 - 6.1, 30, 0],
  ["heart", 1.5, 6, Math.PI],
];
for (const [name, x, z, h] of views) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, g.solid.topAt(x, z) ?? 0.2, z, h); g.cam.behind(h, -0.08); g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.5)); }, x, z, h);
  await sleep(12000);
  const c = await p.evaluate(() => ({ ...street.gta.people.counts, limit: street.gta.people.limit }));
  console.log(name, JSON.stringify(c));
  await p.screenshot({ path: `${OUT}-${name}.png` });
}
const perf = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return (n / ((performance.now() - t0) / 1000)).toFixed(1); });
console.log("fps", perf);
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
