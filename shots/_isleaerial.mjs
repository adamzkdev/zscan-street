// node shots/_isleaerial.mjs [OUT] [views JSON]: aerial views (the game's camera held where we put it) — the islands and their crossings
// views: [[name, eyeX, eyeY, eyeZ, atX, atY, atZ, theme?], …]; default: the Rainbow Bridge and Zaiba
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/isles/aerial", VIEWS] = process.argv.slice(2);
const views = VIEWS ? JSON.parse(VIEWS) : [
  ["bridge-side", 728, 90, -520, 728, 30, -156],
  ["bridge-city", 120, 110, -260, 900, 20, -156],
  ["island", 1050, 220, 120, 1350, 0, -160],
  ["bridge-night", 728, 70, -480, 728, 30, -156, "night"],
];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const theme of ["day", "night"]) {
  const vs = views.filter((v) => (v[7] ?? "day") === theme);
  if (!vs.length) continue;
  await p.goto(`http://localhost:3061/?debug&gta=1192&theme=${theme}&solo`);
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.isles?.live?.every((L) => L.content), { timeout: 300000, polling: 300 });
  await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; g.cam.foot = () => {}; g.cam.car = () => {}; });
  for (const [name, ex, ey, ez, ax, ay, az] of vs) {
    await p.evaluate((ex, ey, ez, ax, ay, az) => {
      const g = street.gta;
      g.player.place(ax, (g.host.ground(ax, az) ?? 0.2), az, 0);
      const c = g.cam.camera;
      c.far = 3000;
      c.position.set(ex, ey, ez);
      c.lookAt(ax, ay, az);
      c.updateProjectionMatrix();
      if (window.scene?.fog) window.scene.fog.far = 4000;
    }, ex, ey, ez, ax, ay, az);
    await sleep(5000);
    await p.evaluate((ex, ey, ez, ax, ay, az) => { const c = street.gta.cam.camera; c.position.set(ex, ey, ez); c.lookAt(ax, ay, az); }, ex, ey, ez, ax, ay, az);
    await sleep(600);
    await p.screenshot({ path: `${OUT}-${name}.jpg`, type: "jpeg", quality: 62 });
  }
}
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
