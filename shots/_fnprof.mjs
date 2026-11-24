// node shots/_fnprof.mjs: per frame, how often and how long the suspects run (parked cars' hit, the drivers' list, the rides, the 3D people, the car collisions), and the scene's object counts — deterministic counts rather than a loaded machine's fps
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day" + (process.env.QS ? "&" + process.env.QS : ""));
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => {
  street.gta.hud.coach(-1);
  const st = (window.__st = {});
  const wrap = (obj, name, label = name, gen = false) => {
    const f = obj[name];
    if (typeof f !== "function") return;
    obj[name] = function (...a) {
      const s = (st[label] ??= { n: 0, ms: 0 });
      s.n++;
      const t0 = performance.now();
      try {
        if (gen) return [...f.apply(this, a)];
        return f.apply(this, a);
      } finally {
        s.ms += performance.now() - t0;
      }
    };
  };
  const g = street.gta;
  wrap(street.parking, "hit", "parking.hit");
  wrap(g, "drivers");
  wrap(g, "rides", "rides", true);
  wrap(g.people, "update", "people.update");
  wrap(g.peds, "update", "peds.update");
  wrap(g, "boxes", "carBoxes", true);
  wrap(g.host, "dynamicHit");
  wrap(g.host, "footBlocked");
  wrap(street.composer, "render", "composer.render");
  wrap(g, "update", "gta.update");
});
await sleep(Number(process.env.WAIT ?? 12000));
for (const [name, x, z, h] of [["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(6000);
  const r = await p.evaluate(async () => {
    for (const k of Object.keys(window.__st)) delete window.__st[k];
    let n = 0;
    const t0 = performance.now();
    await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    const out = {};
    for (const [k, v] of Object.entries(window.__st)) out[k] = `${(v.n / n).toFixed(1)}x ${(v.ms / n).toFixed(2)}ms`;
    let objs = 0, meshes = 0, auto = 0;
    street.scene3.traverse((o) => { objs++; if (o.isMesh) meshes++; if (o.matrixAutoUpdate) auto++; });
    return { fps: +(n / 3).toFixed(1), perFrame: out, objs, meshes, auto, parked: street.parking.cars.length, in3d: street.gta.people.counts.in3d };
  });
  console.log(name, JSON.stringify(r));
}
await b.close();
