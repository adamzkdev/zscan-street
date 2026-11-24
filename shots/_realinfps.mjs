// node shots/_realinfps.mjs: fps inside a few places, realistic vs ?inside=voxel (uncapped where the browser allows)
import puppeteer from "puppeteer-core";
const KEYS = (process.env.KEYS ?? "hotel,mall,pyramid,gamehouse").split(",");
const out = {};
for (const qs of ["", "&inside=voxel"]) {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
  const p = await b.newPage();
  await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
  await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day${qs}`);
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
  await p.evaluate(() => street.gta.hud.coach(-1));
  for (const k of KEYS) {
    await p.evaluate((k) => street.gta.host.enter(k), k);
    await p.waitForFunction(() => !!street.gta.host.interior(), { timeout: 60000, polling: 300 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 5000));
    const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
    const calls = await p.evaluate(() => street.gta.host.renderer?.info?.render?.calls ?? null).catch(() => null);
    (out[k] ??= {})[qs ? "voxel" : "real"] = { fps, calls };
    await p.evaluate(() => street.leavePlace());
    await p.waitForFunction(() => !street.gta.host.interior(), { timeout: 30000, polling: 300 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
  }
  await b.close();
}
console.log(JSON.stringify(out));
