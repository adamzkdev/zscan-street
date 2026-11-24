// node shots/_gtalook.mjs [TAG]: the city at street level, the game's camera, the same spots by day and by night (the look's before/after); fps at each spot
// (positions south of the bay moved with the Golden Gate: ACROSS = 380 m, src/scene/city/plan.ts)
import puppeteer from "puppeteer-core";
const [TAG = "now"] = process.argv.slice(2);
const OUT = `shots/gta/look/${TAG}`;
const THEMES = (process.env.THEMES ?? "day,night").split(",");
const W = Number(process.env.W ?? 1280),
  H = Number(process.env.H ?? 720);
// [name, x, z, heading (0 = north/−z, π/2 = west, −π/2 = east, π = south), pitch]
const SPOTS = [
  ["heart", 6, 4.5, Math.PI / 2, -0.06],
  ["block", -191, -22, 0, -0.04],
  ["blvd", -116, 30, 0, -0.04],
  ["wallst", 190, -1.6, -Math.PI / 2, -0.02],
  ["southbank", -110, 99, Math.PI / 2, -0.05],
  ["midtown", 150, -117.5, Math.PI / 2, -0.03],
  ["uptown", 20, -152, Math.PI / 2, -0.03],
  ["keys", 166, 680, Math.PI, -0.05],
  ["facade", 20, -150, 0, 0.16],
  ["tower", 210, 40, 0, 0.22],
];
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
  for (const [name, x, z, h, pitch] of SPOTS) {
    if (ONLY && !ONLY.includes(name)) continue;
    await p.evaluate((x, z, h, pitch) => {
      const g = street.gta;
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
