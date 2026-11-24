// node shots/_carab.mjs: the cars' cost A/B in one session — "new" (parked cars batched, opaque glass past the near
// cabins) against "old" (every parked car its own 20 objects back in the scene, every car's glass tinted see-through),
// alternated three times at each spot; fps, composer.render ms, gta.update ms, draw calls, scene objects (medians)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => {
  street.gta.hud.coach(-1);
  const st = (window.__st = {});
  const wrap = (obj, name, label = name) => {
    const f = obj[name];
    obj[name] = function (...a) {
      const s = (st[label] ??= { n: 0, ms: 0 });
      s.n++;
      const t0 = performance.now();
      try { return f.apply(this, a); } finally { s.ms += performance.now() - t0; }
    };
  };
  wrap(street.composer, "render", "render");
  wrap(street.gta, "update", "update");
  window.__mode = (old) => {
    const P = street.parking, sc = street.scene3;
    // (the glass materials, found on the cars themselves)
    if (!window.__GLASS || !window.__TINT)
      sc.traverse((o) => {
        if (!o.isMesh || o.userData.kind !== "glass") return;
        const m = o.material;
        if (!m || Array.isArray(m)) return;
        if (m.transparent && Math.abs(m.opacity - 0.58) < 0.01) window.__TINT = m;
        else if (!m.transparent && m.color?.getHexString() === "0d1218") window.__GLASS = m;
      });
    // (no cabin open yet to find the tinted glass on: its twin, as carkit's GLASS_TINT)
    if (!window.__TINT && window.__GLASS) {
      const t = window.__GLASS.clone();
      Object.assign(t, { metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.58, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
      t.color.set("#1c2632");
      window.__TINT = t;
    }
    if (!window.__TINT || !window.__GLASS) return { glass: !!window.__GLASS, tint: false };
    if (old) {
      P.group.visible = false;
      for (const c of P.cars) if (!c.obj.parent) sc.add(c.obj);
      sc.traverse((o) => { if (o.isMesh && o.userData.kind === "glass" && o.material === window.__GLASS && o.parent?.parent?.userData?.realCar?.kind !== "truck" && o.parent?.userData?.realCar?.kind !== "truck") { o.material = window.__TINT; o.userData.__wasOpaque = true; } });
    } else {
      P.group.visible = true;
      for (const c of P.cars) if (c.obj.parent === sc) sc.remove(c.obj);
      sc.traverse((o) => { if (o.userData.__wasOpaque) { o.material = window.__GLASS; delete o.userData.__wasOpaque; } });
    }
    return { glass: !!window.__GLASS, tint: !!window.__TINT };
  };
});
await sleep(Number(process.env.WAIT ?? 12000));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const [name, x, z, h] of [["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(6000);
  const R = { new: [], old: [] };
  for (let k = 0; k < 6; k++) {
    const mode = k % 2 ? "old" : "new";
    const ok = await p.evaluate((o) => window.__mode(o), mode === "old");
    await sleep(1500);
    const r = await p.evaluate(async () => {
      for (const k of Object.keys(window.__st)) delete window.__st[k];
      let n = 0;
      const t0 = performance.now();
      await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
      let objs = 0;
      street.scene3.traverse(() => objs++);
      const info = street.composer.renderer.info.render;
      return { fps: n / ((performance.now() - t0) / 1000), render: window.__st.render.ms / n, update: window.__st.update.ms / n, calls: info.calls, objs };
    });
    R[mode].push({ ...r, ok });
  }
  await p.evaluate(() => window.__mode(false));
  const sum = (L) => ({ fps: +med(L.map((r) => r.fps)).toFixed(1), renderMs: +med(L.map((r) => r.render)).toFixed(2), updateMs: +med(L.map((r) => r.update)).toFixed(2), calls: med(L.map((r) => r.calls)), objs: med(L.map((r) => r.objs)) });
  console.log(name, "new", JSON.stringify(sum(R.new)), "old", JSON.stringify(sum(R.old)), "runs", JSON.stringify(R.new.map((r) => +r.fps.toFixed(0))), JSON.stringify(R.old.map((r) => +r.fps.toFixed(0))), "glass found", JSON.stringify(R.old[0].ok));
}
await b.close();
