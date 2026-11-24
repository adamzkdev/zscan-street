// node shots/_gtaboards.mjs: the proof boards as gantries over the street, the speed traps on the pavement (nothing in the lanes)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await p.evaluate(() => {
  const m = street.gta.missions;
  const road = (x, z) => street.gta.roads.road(x, z);
  const traps = m.traps.map((t) => ({ x: t.group.position.x, z: t.group.position.z, inRoad: road(t.group.position.x, t.group.position.z) }));
  return { boards: m.boards.map((b) => ({ x: b.x, z: b.z, axis: b.axis })), traps };
});
console.log("traps in road:", list.traps.filter((t) => t.inRoad).length, "of", list.traps.length);
for (const [k, bd] of list.boards.slice(0, 2).entries()) {
  await p.evaluate((bd) => { const g = street.gta; const h = bd.axis === "x" ? -Math.PI / 2 : 0; const ox = bd.axis === "x" ? -16 : 0, oz = bd.axis === "x" ? 0 : 16; g.player.place(bd.x + ox, 0.05, bd.z + oz, h); g.cam.behind(h, -0.02); g.cam.snap(g.player.pos.clone().setY(1.6)); }, bd);
  await sleep(1800);
  await p.screenshot({ path: `shots/gta/board-${k}.png` });
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
