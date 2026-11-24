// node shots/_cputime.mjs: main-thread JS time per frame (every rAF callback timed) and GPU time of the frame (timer queries round the composer), medians over ~150 frames, with parts switched off (TOGS) — steadier than fps on a loaded machine
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit", "--enable-webgl-draft-extensions"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F;
  // every rAF callback timed: the frame's JS
  const raf = window.requestAnimationFrame.bind(window);
  window.__js = [];
  let acc = 0, last = -1;
  window.requestAnimationFrame = (cb) => raf((t) => { if (t !== last) { if (last >= 0) window.__js.push(acc); acc = 0; last = t; } const t0 = performance.now(); try { cb(t); } finally { acc += performance.now() - t0; } });
});
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day" + (process.env.QS ? "&" + process.env.QS : ""));
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => {
  street.gta.hud.coach(-1);
  const r = street.composer.renderer, gl = r.getContext();
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  window.__gpu = [];
  window.__hasGpu = !!ext;
  if (ext) {
    const orig = street.composer.render.bind(street.composer);
    const pending = [];
    street.composer.render = function (...a) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      orig(...a);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(q);
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q0 = pending.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) window.__gpu.push(gl.getQueryParameter(q0, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q0);
      }
    };
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(Number(process.env.WAIT ?? 12000));
await p.evaluate(() => {
  const g = street.gta, sc = street.scene3, pk = street.parking;
  const glass = new Set();
  sc.traverse((o) => { if (o.isMesh && o.userData.kind === "glass" && o.material.transparent) glass.add(o.material); });
  const keep = { cars: null, drivers: g.drivers };
  window.__tog = {
    none: () => {},
    parkGPU: (on) => { const pg = sc.getObjectByName("parked-cars"); if (pg) pg.visible = on; },
    parkCPU: (on) => { if (!on) keep.cars = pk.cars.splice(0); else if (keep.cars) { pk.cars.push(...keep.cars); keep.cars = null; } },
    glass: (on) => { for (const m of glass) { m.transparent = on; m.depthWrite = !on; m.opacity = on ? 0.58 : 1; m.needsUpdate = true; } },
    drivers: (on) => { g.drivers = on ? keep.drivers : () => []; },
    people: (on) => { g.people.group.visible = on; },
    shadows: (on) => { street.composer.renderer.shadowMap.autoUpdate = on; },
  };
});
const med = (a) => { const s = [...a].sort((x, y) => x - y); return +(s[Math.floor(s.length / 2)] ?? 0).toFixed(2); };
const sample = async () => {
  await p.evaluate(() => { window.__js.length = 0; window.__gpu.length = 0; });
  const t0 = Date.now();
  const n = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return n; });
  const { js, gpu } = await p.evaluate(() => ({ js: window.__js.slice(), gpu: window.__gpu.slice() }));
  return { fps: +(n / ((Date.now() - t0) / 1000)).toFixed(1), js: med(js), gpu: med(gpu) };
};
const keys = (process.env.TOGS ?? "parkGPU,parkCPU,glass,drivers,people").split(",");
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]];
console.log("gpu timer:", await p.evaluate(() => window.__hasGpu));
for (const [name, x, z, h] of SPOTS) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(6000);
  const out = { spot: name };
  const bases = [];
  for (const k of keys) {
    bases.push(await sample());
    await p.evaluate((k) => window.__tog[k](false), k);
    await sleep(900);
    out[k] = await sample();
    await p.evaluate((k) => window.__tog[k](true), k);
    await sleep(600);
  }
  bases.push(await sample());
  out.base = { fps: med(bases.map((b) => b.fps)), js: med(bases.map((b) => b.js)), gpu: med(bases.map((b) => b.gpu)) };
  console.log(JSON.stringify(out));
}
await b.close();
