// node shots/_realstreet.mjs [TAG] [URL]: street level, day and night, at the spots that show the ground, the furniture and the trees (realistic look pass)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [TAG = "after", URL = "http://localhost:3061/?debug&gta=1192&theme=day"] = process.argv.slice(2);
const OUT = "shots/gta/realstreet";
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const THEMES = (process.env.THEMES ?? "day,night").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", ...(process.env.UNCAPPED ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])], defaultViewport: { width: 1280, height: 720 } });
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
p.on("console", (m) => m.type() === "error" && !/429|500|Failed to load resource|404/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// [name, x, z, heading (0 = north/−z, π/2 = west), pitch]
const SPOTS = [
  ["heart", 8, 4.2, -Math.PI / 2, -0.1],
  ["block", -150, -125, Math.PI / 2, -0.12],
  ["palms", 122, 92, Math.PI, -0.1],
  ["park", -6, -70, 0, -0.12],
  ["shibuya", -62, -158, 0, -0.1],
  ["bayroad", -90, 138, 0.4, -0.1],
  ["keys", 158, 330, 0, -0.1],
  ["plaza", 0, -46, Math.PI, -0.14],
];
for (const theme of THEMES) {
  // a fixed hour of the game's clock, clear weather
  await p.evaluate((t) => street.gta.clock.force(t === "day" ? 13 : 23, "clear"), theme);
  await sleep(1500);
  for (const [name, x, z, h, pitch] of SPOTS) {
    if (ONLY && !ONLY.includes(name)) continue;
    await p.evaluate((x, z, h, pitch) => {
      const g = street.gta;
      g.player.place(x, 0.2, z, h);
      g.cam.behind(h, pitch);
      g.cam.snap(g.player.pos.clone().setY(1.55));
    }, x, z, h, pitch);
    await p.evaluate((t) => street.gta.clock.force(t === "day" ? 13 : 23, "clear"), theme);
    await sleep(2200);
    await p.screenshot({ path: `${OUT}/${TAG}-${theme}-${name}.png` });
  }
}
if (process.env.FPS) {
  for (const [name, x, z, h, pitch] of SPOTS.filter((s) => ["heart", "palms", "park"].includes(s[0]))) {
    await p.evaluate((x, z, h, pitch) => { const g = street.gta; g.player.place(x, 0.2, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(1.55)); }, x, z, h, pitch);
    await sleep(2500);
    const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return (n / ((performance.now() - t0) / 1000)).toFixed(1); });
    console.log("fps", name, fps);
  }
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
