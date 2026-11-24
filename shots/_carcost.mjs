// node shots/_carcost.mjs: what each realistic vehicle costs (meshes = draw calls, triangles), and the game's frame rate and totals on a busy street
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const per = await p.evaluate(() => {
  const out = {};
  for (const m of street.gta.host.traffic.movers) {
    if (out[m.kind]) continue;
    let meshes = 0, tris = 0;
    m.group.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.getAttribute("position").count) / 3; } });
    out[m.kind] = { meshes, tris: Math.round(tris) };
  }
  return out;
});
console.log("per vehicle", JSON.stringify(per));
await p.evaluate(() => { const g = street.gta; g.player.place(0, 0.2, 3.5, -Math.PI / 2); g.cam.behind(-Math.PI / 2, -0.08); g.cam.snap(g.player.pos.clone().setY(1.55)); });
await new Promise((r) => setTimeout(r, 6000));
const r = await p.evaluate(async () => {
  let n = 0;
  const t0 = performance.now();
  await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const info = street.renderer?.info ?? null;
  return { fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), movers: street.gta.host.traffic.movers.size, calls: info?.render?.calls, tris: info?.render?.triangles };
});
console.log("game", JSON.stringify(r));
await b.close();
