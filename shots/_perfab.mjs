// node shots/_perfab.mjs: what the frame costs at the slow spots — uncapped fps, draw calls and triangles, with parts of the scene switched off one at a time
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => {
  street.gta.hud.coach(-1);
  const r = street.composer.renderer;
  r.info.autoReset = false;
  window.__frameInfo = { calls: 0, tris: 0 };
  const loop = () => { window.__frameInfo = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.reset(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const measure = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return { fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), ...window.__frameInfo }; });
// what to switch off: by name in the scene, or a flag
const TOGGLES = {
  people3d: (on) => (street.gta.people.group.visible = on),
  trees: (on) => street.scene3.traverse((o) => { if (o.isInstancedMesh && o.material && (o.material.alphaTest > 0 || /leaf|bark|tree/i.test(o.name + (o.material.name ?? "")))) o.visible = on; }),
  forest: (on) => { const f = street.scene3.getObjectByName("forest"); if (f) f.visible = on; },
  shadows: (on) => { const r = street.composer.renderer; r.shadowMap.autoUpdate = on; },
  finish: (on) => { street.finish.enabled = on; },
};
for (const [name, x, z, h] of [["woods", 190, 214, 1.5], ["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(5000);
  const base = await measure();
  const row = { spot: name, base };
  for (const k of Object.keys(TOGGLES)) {
    await p.evaluate((k) => new Function("on", `return (${window.__tog?.[k] ?? ""})`), k).catch(() => {});
    await p.evaluate(`(${TOGGLES[k].toString()})(false)`);
    await sleep(800);
    row[k] = await measure();
    await p.evaluate(`(${TOGGLES[k].toString()})(true)`);
    await sleep(400);
  }
  console.log(JSON.stringify(row));
}
await b.close();
