// node shots/_ggwalk.mjs: on foot on the big Golden Gate (src/scene/goldengate.ts): the walkway's height under you all
// the way over, the barriers and the railing holding you, nothing blocking the walk; and the woods' landing
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await new Promise((r) => setTimeout(r, 3000));
const r = await p.evaluate(() => {
  const g = street.gta, h = g.host, gg = street.goldenGate;
  const out = { walkBlocked: [], railHolds: 0, barrierHolds: 0, heights: [], woods: [] };
  // the east walkway, x = 158 + 14.5, from the quay to the viewpoint
  let prev = null;
  for (let z = 146; z < 588; z += 2) {
    const x = 158 + 14.5;
    const blocked = h.footBlocked(x, z);
    const y = h.ground(x, z);
    if (blocked) out.walkBlocked.push(z);
    if (prev !== null && y !== null && Math.abs(y - prev) > 0.6) out.heights.push([z, +prev.toFixed(2), +y.toFixed(2)]);
    prev = y;
    // the railing past the walkway holds; the road's barrier holds
    if (h.footBlocked(158 + 16.4, z) || h.ground(158 + 16.4, z) === null) out.railHolds++;
    if (h.footBlocked(158 + 10.9, z)) out.barrierHolds++;
  }
  // past the bridge: the woods' road down to the tunnel, the plaza
  for (const [x, z] of [[158, 600], [158, 606], [158, 610], [168, 605], [170, 600]]) out.woods.push([x, z, h.footBlocked(x, z), h.ground(x, z)?.toFixed?.(2) ?? null, g.roads.where(x, z).street]);
  return out;
});
console.log(JSON.stringify({ heights: r.heights, woods: r.woods }));
// really walking it: the player on the east walkway at the quay, running south (stick forward), sampled
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  g.player.place(158 + 14.4, g.host.ground(158 + 14.4, 147) ?? 0.2, 147, Math.PI);
  g.cam.behind(Math.PI, -0.1);
  window.__walk = [];
  clearInterval(window.__wt);
  window.__wt = setInterval(() => {
    const q = g.player.pos;
    // keep facing south down the walkway (steer back toward x = 172.4)
    g.input.stick.y = 1;
    g.input.stick.x = Math.max(-1, Math.min(1, (q.x - (158 + 14.4)) * 0.6));
    window.__walk.push([+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]);
  }, 200);
});
await p.keyboard.down("ShiftLeft");
for (let k = 0; k < 14; k++) {
  await sleep(5000);
  const last = await p.evaluate(() => window.__walk[window.__walk.length - 1]);
  if (k === 3 || k === 8) await p.screenshot({ path: `shots/gta/ggbig/walk-${k}.png` });
  if (last[2] > 585) break;
}
await p.keyboard.up("ShiftLeft");
const w = await p.evaluate(() => { clearInterval(window.__wt); street.gta.input.stick.y = 0; return window.__walk; });
const deckErr = await p.evaluate((w) => Math.max(...w.filter((q) => q[2] > 150 && q[2] < 585).map((q) => Math.abs(q[1] - street.goldenGate.groundAt(q[0], q[2]) ?? 0))), w);
console.log("walk: from z", w[0][2], "to", w[w.length - 1][2], "x range", Math.min(...w.map((q) => q[0])).toFixed(1), Math.max(...w.map((q) => q[0])).toFixed(1), "max |y - walkway|", deckErr.toFixed(2));
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
