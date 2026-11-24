// node shots/_frametime.mjs: where the frame's time goes at the slow spots — the main loop's JS (update + submit), the
// composer's render (submit), the frame interval (incl. GPU wait), uncapped; and with parts switched off (A/B in one session)
// (positions south of the bay moved with the Golden Gate: ACROSS = 380 m, src/scene/city/plan.ts)
import puppeteer from "puppeteer-core";
const QS = process.env.QS ? "&" + process.env.QS : "";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F;
  // every animation frame callback timed (the main loop is one of them)
  const raf = window.requestAnimationFrame.bind(window);
  window.__cb = { n: 0, ms: 0, max: 0 };
  window.requestAnimationFrame = (fn) => raf((t) => { const t0 = performance.now(); try { fn(t); } finally { const d = performance.now() - t0; const c = window.__cb; c.n++; c.ms += d; if (d > c.max) c.max = d; } });
});
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day" + QS);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => {
  street.gta.hud.coach(-1);
  const c = street.composer;
  const r0 = c.render.bind(c);
  window.__rd = { n: 0, ms: 0 };
  c.render = (...a) => { const t0 = performance.now(); try { return r0(...a); } finally { window.__rd.n++; window.__rd.ms += performance.now() - t0; } };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(15000);
const measure = () => p.evaluate(async () => {
  window.__cb = { n: 0, ms: 0, max: 0 };
  window.__rd = { n: 0, ms: 0 };
  let n = 0;
  const t0 = performance.now();
  await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  const dt = performance.now() - t0;
  const cb = window.__cb, rd = window.__rd;
  return { fps: +(n / (dt / 1000)).toFixed(1), frameMs: +(dt / n).toFixed(1), jsMs: +(cb.ms / n).toFixed(1), renderMs: +(rd.ms / Math.max(1, rd.n)).toFixed(1), maxCb: +cb.max.toFixed(0) };
});
const TOG = (process.env.TOG ?? "people3d,finish,shadows").split(",").filter(Boolean);
const toggles = {
  people3d: "on => street.gta.people.group.visible = on",
  parts: "on => street.gta.people.parts.visible = on",
  busts: "on => street.gta.people.busts.visible = on",
  partsShadow: "on => street.gta.people.parts.castShadow = on",
  peds: "on => { street.gta.people.enabled = on; }",
  finish: "on => { street.finish.enabled = on; }",
  shadows: "on => { street.composer.renderer.shadowMap.autoUpdate = on; }",
  city: "on => { street.scene3.children[4].visible = on; }",
  bloom: "on => { street.composer.passes.forEach(p => { if (p.constructor.name.includes('Bloom')) p.enabled = on; }); }",
  half: "on => { street.composer.renderer.setPixelRatio(on ? 1 : 0.5); street.composer.setPixelRatio(on ? 1 : 0.5); }",
};
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [["woods", 190, 594, 1.5], ["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]];
for (const [name, x, z, h] of SPOTS) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(5000);
  const row = { spot: name, base: await measure(), near: await p.evaluate(() => { let n = 0, f = 0; for (const s of street.gta.people.slots.values()) s.far ? f++ : n++; return { n, f }; }) };
  for (const k of TOG) {
    await p.evaluate(`(${toggles[k]})(false)`);
    await sleep(600);
    row[k] = await measure();
    await p.evaluate(`(${toggles[k]})(true)`);
    await sleep(400);
  }
  console.log(JSON.stringify(row));
}
await b.close();
