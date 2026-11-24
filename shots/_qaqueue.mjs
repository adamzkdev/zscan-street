// node shots/_qaqueue.mjs: at Big Ben's door (and the Colosseum's) — the queue's people: in 3D or still flat cut-outs?
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, x, z] of [["parliament", 106, 62], ["colosseum", 85, -158]]) {
  await p.evaluate((x, z) => { const g = street.gta; g.hud.coach(-1); for (let r = 0; r < 14; r += 0.7) for (let a = 0; a < 6.28; a += 0.7) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (g.host.footBlocked(px, pz)) continue; g.player.place(px, g.host.ground(px, pz) ?? 0.2, pz, 0); return; } }, x, z);
  await sleep(4000);
  const r = await p.evaluate(() => {
    const g = street.gta, q = g.player.pos;
    const src = [...g.host.people3d(q.x, q.z, 12)];
    return { stats: g.people.stats?.() ?? null, near: src.length, keys: src.slice(0, 6).map((s) => s.key) };
  });
  console.log(name, JSON.stringify(r));
  await p.screenshot({ path: `shots/gta/qa-out/probe-queue-${name}.png` });
}
await b.close();
