// node shots/_realsweep.mjs [TAG] [BASE]: the whole map, street level and from the air, day and night, from a free camera
// (capture mode) — a hunt for anything still blocky. Frames in shots/gta/sweep/<TAG>-<view>-<theme>.png. ONLY=a,b THEMES=day,night
import puppeteer from "puppeteer-core";
const [TAG = "after", BASE = "http://localhost:3061"] = process.argv.slice(2);
const OUT = `shots/gta/sweep/${TAG}`;
const S = (x, z, lx, lz, y = 1.7, ly = 2.5, fov = 62) => ({ pos: [x, y, z], look: [lx, ly, lz], fov });
const VIEWS = {
  // street level
  "s01-heart": S(-6, 4, 40, 4),
  "s02-shotengai": S(-86, 26, -86, -20),
  "s03-shibuya": S(-40, -150, -60, -160, 1.7, 4),
  "s04-park": S(0, -60, 10, -96),
  "s05-footbridge": S(-13, 57.6, 0, 68, 1.7, 2),
  "s06-river": S(-140, 56, -60, 66, 1.7, 0),
  "s07-bayroad": S(0, 132, 30, 190, 1.7, 3),
  "s08-opera": S(-82, 146, -44, 182, 1.7, 6),
  "s09-headland": S(138, 142, 172, 226, 6, 10),
  "s10-woods": S(168, 225, 190, 208, 1.9, 4),
  "s11-camp": S(190, 212, 222, 207, 1.8, 2),
  "s12-falls": S(200, 222, 214, 214, 2, 3),
  "s13-prison": S(-118, 160, -121, 194, 3, 8),
  "s14-yard": S(-98, 172, -125, 198, 12, 4),
  "s15-tunnel": S(158, 236, 158, 260, 1.7, 2),
  "s16-stadium": S(-175, -40, -175, -80, 1.7, 8),
  "s17-mall": S(150, -2, 170, -20, 1.7, 6),
  "s18-portal": S(214, 36, 238, 36, 4, 9),
  "s19-wallst": S(110, 6, 200, 0, 1.7, 10),
  "s20-lake": S(-10, -80, 20, -100, 1.7, 1),
  "s21-palm": S(-170, 146, -206, 192, 4, 3),
  "s22-led": S(20, 6, 0, -30, 1.7, 14),
  // from the air
  "a1-heart": S(60, 70, 0, -10, 70, 0, 55),
  "a2-bay": S(60, 60, 60, 200, 60, 0, 55),
  "a3-headland": S(120, 170, 185, 215, 45, 0, 55),
  "a4-prison": S(-90, 140, -121, 194, 40, 0, 55),
  "a5-north": S(0, -100, -60, -200, 70, 0, 55),
  "a6-keys": S(158, 300, 160, 380, 60, 0, 55),
};
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(VIEWS);
const themes = (process.env.THEMES ?? "day,night").split(",");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && !/429|Failed to load resource|500/.test(m.text()) && errs.push(m.text().slice(0, 200)));
await p.goto(`${BASE}/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 300000, polling: 300 });
for (let k = 0; k < 60; k++) {
  await p.evaluate(() => { for (let i = 0; i < 5; i++) capture.step(1 / 30); });
  if (await p.evaluate(() => !!window.__streetUp)) break;
  await new Promise((r) => setTimeout(r, 1500));
}
await p.evaluate(() => capture.ui(false));
for (const theme of themes) {
  await p.evaluate((t) => { capture.theme(t); for (let i = 0; i < 30; i++) capture.step(1 / 30); }, theme);
  for (const name of only) {
    const v = { ...VIEWS[name] };
    // street level: the camera's height over the ground there (the woods' hills, the islands)
    if (name.startsWith("s")) {
      const g = await p.evaluate((x, z) => window.street?.gta?.host?.ground?.(x, z) ?? null, v.pos[0], v.pos[2]);
      if (g !== null && g > 0.3) {
        v.pos = [v.pos[0], v.pos[1] + g, v.pos[2]];
        v.look = [v.look[0], v.look[1] + g, v.look[2]];
      }
    }
    // (a few frames on the spot: the far city and the trees round the camera stream in)
    await p.evaluate((v) => { capture.shot(v); for (let i = 0; i < 20; i++) capture.step(1 / 30); }, v);
    await new Promise((r) => setTimeout(r, 300));
    await p.evaluate(() => { for (let i = 0; i < 6; i++) capture.step(1 / 30); });
    await p.screenshot({ path: `${OUT}-${name}-${theme}.png` });
  }
}
console.log("errors", errs.length, errs.slice(0, 6).join("\n"));
await b.close();
