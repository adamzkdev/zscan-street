// node shots/_lmlook.mjs [TAG] (SPOTS env: [[name, x, z, heading, pitch], …]): _gtalook at any spots — the landmark fixes (pyramid, port, gardens) before/after
// (positions south of the bay moved with the Golden Gate: ACROSS = 380 m, src/scene/city/plan.ts)
import puppeteer from "puppeteer-core";
const [TAG = "now"] = process.argv.slice(2);
const OUT = `shots/gta/look/lm-${TAG}`;
const THEMES = (process.env.THEMES ?? "day,night").split(",");
const W = Number(process.env.W ?? 1280),
  H = Number(process.env.H ?? 720);
// [name, x, z, heading (0 = north/−z, π/2 = west, −π/2 = east, π = south), pitch]
const SPOTS = JSON.parse(process.env.SPOTS ?? "[]");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", ...(process.env.UNCAPPED ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])], defaultViewport: { width: W, height: H } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs");
fs.mkdirSync("shots/gta/look", { recursive: true });
for (const theme of THEMES) {
  const p = await b.newPage();
  await p.evaluateOnNewDocument(() => {
    const W = window.WebSocket;
    const F = function (u, pr) {
      if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
      return pr === undefined ? new W(u) : new W(u, pr);
    };
    F.prototype = W.prototype;
    Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    window.WebSocket = F;
  });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  await p.goto(`http://localhost:3061/?debug&gta=1192&theme=${theme}`);
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
  await sleep(3000);
  await p.evaluate(() => {
    street.gta.hud.coach(-1);
    document.querySelector(".gta-hud").style.display = "none";
    // (the game's sky cycle off: the theme asked for stays)
    try { street.gta.settings.sky = "day"; } catch {}
  });
  for (const spot of SPOTS) {
    const [name, x, z, h, pitch] = spot;
    if (ONLY && !ONLY.includes(name)) continue;
    if (name.startsWith("@")) {
      // a free camera: [@name, camX, camY, camZ, lookX, lookY, lookZ] (the game's camera held still; the player out of sight)
      await p.evaluate((c) => {
        const g = street.gta;
        g.player.place(c[4], 0.2, c[6] + 400, 0);
        const cam = g.cam;
        cam.__hold = true;
        for (const k of ["follow", "drive", "place", "ease", "applyShake"]) if (typeof cam[k] === "function" && !cam["__" + k]) { cam["__" + k] = cam[k]; cam[k] = function () { if (!this.__hold) return this["__" + k].apply(this, arguments); }; }
        cam.camera.position.set(c[1], c[2], c[3]);
        cam.camera.lookAt(c[4], c[5], c[6]);
        cam.camera.updateMatrixWorld();
      }, spot);
    } else
      await p.evaluate((x, z, h, pitch) => {
        const g = street.gta;
        if (g.cam.__hold) g.cam.__hold = false;
        g.player.place(x, 0.2, z, h);
        g.cam.behind(h, pitch);
        g.cam.snap(g.player.pos.clone().setY(1.55));
      }, x, z, h, pitch);
    await sleep(2200);
    const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }));
    const info = await p.evaluate(() => { const r = street.renderer?.info?.render; return r ? { calls: r.calls, tris: r.triangles } : null; });
    await p.screenshot({ path: `${OUT}-${theme}-${name}.png` });
    console.log(theme, name, "fps", fps, info ? `calls ${info.calls} tris ${info.tris}` : "");
  }
  console.log(theme, "errors", errs.length, errs.slice(0, 3).join(" | "));
  await p.close();
}
await b.close();
