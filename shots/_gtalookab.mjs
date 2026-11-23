// node shots/_gtalookab.mjs: frame rate at night with the damp tarmac and lit rooms on, then off (detail.ts DETAIL_WET, voxel/surface.ts GLASS_NIGHT), same spots, same session
import puppeteer from "puppeteer-core";
const THEME = process.env.THEME ?? "night";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=${THEME}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate(() => { street.gta.hud.coach(-1); });
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }));
for (const [x, z, h] of [[20, -152, Math.PI / 2], [190, -1.6, -Math.PI / 2], [-116, 30, 0]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; g.player.place(x, 0.2, z, h); g.cam.behind(h, -0.03); g.cam.snap(g.player.pos.clone().setY(1.55)); }, x, z, h);
  await new Promise((r) => setTimeout(r, 2500));
  const on = await fps();
  await p.evaluate(async () => { const d = await import("/src/scene/detail.ts"); const s = await import("/src/scene/voxel/surface.ts"); window.__wet = d.DETAIL_WET.value; d.DETAIL_WET.value = 0; s.GLASS_NIGHT.value = 0; });
  await new Promise((r) => setTimeout(r, 800));
  const off = await fps();
  await p.evaluate(async () => { const d = await import("/src/scene/detail.ts"); const s = await import("/src/scene/voxel/surface.ts"); d.DETAIL_WET.value = window.__wet; s.GLASS_NIGHT.value = 1; });
  console.log(`(${x},${z}) fps with ${on} · without wet/rooms ${off}`);
}
await b.close();
