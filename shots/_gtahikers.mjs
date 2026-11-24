// node shots/_gtahikers.mjs: the cut-outs made outside the director (woods' hikers, visitors, ride queues) drawn in 3D in the game (main.ts people3d → Snark.live)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, x, z, h] of [["camp", 192, 210, -2.3], ["flyer", -70, 99, 0]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, g.host.ground(x, z) ?? 0.2, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(g.player.pos.y + 1.55)); }, x, z, h);
  await sleep(6000);
  await p.screenshot({ path: `shots/gta/hikers-${name}.png` });
  console.log(name, JSON.stringify(await p.evaluate(() => street.gta.people.counts)));
}
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
