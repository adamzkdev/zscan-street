// node shots/_qaout.mjs [TAG]: the exterior QA sweep — every district, landmark, quay, bridge, the woods and Orchard Keys at
// street level in the game's third person (4 headings by day, 1 by night), plus aerial views from the capture camera;
// console errors and fps per spot. Env: ONLY=name,name  PHASE=street|air|both  HOURS=13,22
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [TAG = "q"] = process.argv.slice(2);
const OUT = "shots/gta/qa-out";
fs.mkdirSync(OUT, { recursive: true });
const PHASE = process.env.PHASE ?? "both";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const A = 380;
const P = Math.PI;
// [name, x, z, heading] (heading 0 = looking north/−z, π/2 = west, −π/2 = east, π = south)
export const SPOTS = [
  ["heart", 0, 3.5, -P / 2],
  ["mempool", -7.5, -10, P],
  ["square", 0, 22, 0],
  ["shotengai", -86, 0, 0],
  ["shibuya", -60, -150, P / 2],
  ["park", 0, -78, 0],
  ["museum", -52, -81, P / 2],
  ["stadium", -175, -50, 0],
  ["pyramid", -158, -158, 0],
  ["eiffel", -81, -192, 0],
  ["colosseum", 85, -158, 0],
  ["cemetery", 144, -192, 0],
  ["needle", 142, -119, 0],
  ["nu7", 160, -44, 0],
  ["wallst", 150, 8, -P / 2],
  ["reserve", 103, 0, P],
  ["university", 103, -40, 0],
  ["parliament", 106, 62, 0],
  ["library", 0, 70, P],
  ["flyer", -70, 70, P],
  ["riverbridge", 54, 68, P],
  ["marina", 159, 70, P],
  ["gardens", 171, 104, P],
  ["port", -175, 104, P],
  ["bayroad", 0, 136, P],
  ["bayroad-w", -160, 136, P],
  ["opera", -44, 150, P],
  ["palm", -206, 146, P],
  ["gg-foot", 158, 130, P],
  ["gg-deck", 158, 375, P],
  ["gg-landing", 158, 596, P],
  ["woods", 192, 594, 0],
  ["keys-blvd", 158, 700, P],
  ["keys-street", 206, 746, -P / 2],
  ["keys-beach", 230, 812, P],
  ["ring-w", -226, -60, 0],
  ["ring-n", 0, -228, P / 2],
  ["ring-e", 226, 40, 0],
  ["ring-s-viaduct", -100, 136, -P / 2],
  ["blvd-e", 122, -90, 0],
];
// aerial: [name, camera x,y,z, look x,y,z, fov]
const AIR = [
  ["a-heart", 70, 80, 70, 0, 0, 0, 50],
  ["a-north", -60, 120, -100, -60, 0, -200, 55],
  ["a-ne", 200, 110, -90, 120, 0, -180, 55],
  ["a-wallst", 230, 90, 60, 150, 0, 0, 55],
  ["a-south", 0, 90, 30, 0, 0, 110, 55],
  ["a-west", -120, 100, 40, -190, 0, 60, 55],
  ["a-bay", 0, 120, 120, 40, 0, 200, 55],
  ["a-palm", -130, 90, 120, -200, 0, 190, 55],
  ["a-gg", 260, 140, 300, 158, 20, 380, 55],
  ["a-woods", 300, 110, 520, 190, 0, 600, 55],
  ["a-keys", 300, 120, 640, 200, 0, 740, 55],
  ["a-keysbeach", 120, 90, 900, 220, 0, 800, 55],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const launch = async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
  const p = await b.newPage();
  await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
  return { b, p };
};
const log = [];
if (PHASE !== "air") {
  const { b, p } = await launch();
  const errs = new Map();
  let at = "boot";
  p.on("pageerror", (e) => errs.set(at, [...(errs.get(at) ?? []), "pageerror " + e.message]));
  p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !/429|Failed to load resource|500|GPU stall|WEBGL_debug/.test(m.text()) && errs.set(at, [...(errs.get(at) ?? []), m.type() + " " + m.text().slice(0, 160)]));
  await p.goto("http://localhost:3061/?debug&gta=1192");
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
  await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; });
  for (const hour of (process.env.HOURS ?? "13,22").split(",").map(Number)) {
    const night = hour >= 20 || hour < 6;
    await p.evaluate((h) => street.gta.clock.force(h, "clear"), hour);
    for (const [name, x, z, h] of SPOTS) {
      if (ONLY && !ONLY.includes(name)) continue;
      at = name;
      await p.evaluate((x, z, h) => {
        const g = street.gta;
        // the nearest free spot on foot
        for (let r = 0; r < 14; r += 0.7)
          for (let a = 0; a < 6.28; a += 0.7) {
            const px = x + Math.cos(a) * r,
              pz = z + Math.sin(a) * r;
            if (g.host.footBlocked(px, pz)) continue;
            // (room round it: not pressed against a wall, the camera's arm free behind)
            if (r < 13 && [0, 1.57, 3.14, 4.71].some((b) => g.host.footBlocked(px + Math.cos(b) * 2.2, pz + Math.sin(b) * 2.2))) continue;
            const y = g.host.ground(px, pz) ?? 0.2;
            g.player.place(px, y, pz, h);
            g.cam.behind(h, -0.06);
            g.cam.snap(g.player.pos.clone().setY(y + 1.55));
            return;
          }
        // (nothing free round it — the woods' trunks, the deck's rails: right on the spot)
        const y = g.host.ground(x, z) ?? 0.2;
        g.player.place(x, y, z, h);
        g.cam.behind(h, -0.06);
        g.cam.snap(g.player.pos.clone().setY(y + 1.55));
      }, x, z, h);
      await sleep(2600);
      const heads = night ? [0] : [0, P / 2, P, -P / 2];
      for (const [k, dh] of heads.entries()) {
        // (the player turned too: the camera settles behind the way it faces)
        await p.evaluate((h) => { const g = street.gta; const q = g.player.pos; g.player.place(q.x, q.y, q.z, h); g.cam.behind(h, -0.06); g.cam.snap(q.clone().setY(q.y + 1.55)); }, h + dh);
        await sleep(900);
        await p.screenshot({ path: `${OUT}/${TAG}-${name}-${night ? "night" : "day"}-${k}.png` });
      }
      const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
      const where = await p.evaluate(() => { const g = street.gta; const q = g.player.pos; return g.roads.where(q.x, q.z); });
      log.push({ spot: name, hour, fps, where: `${where.district} · ${where.street}`, errs: errs.get(name)?.length ?? 0 });
      console.log(JSON.stringify(log[log.length - 1]));
    }
  }
  const all = [...errs.entries()].filter(([, v]) => v.length);
  console.log("street errors", all.length, JSON.stringify(all.map(([k, v]) => [k, [...new Set(v)].slice(0, 3)])).slice(0, 1600));
  await b.close();
}
if (PHASE !== "street") {
  const { b, p } = await launch();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  await p.goto("http://localhost:3061/?debug&capture&theme=day");
  await p.waitForFunction(() => window.capture && window.street, { timeout: 300000, polling: 300 });
  for (let k = 0; k < 60; k++) {
    await p.evaluate(() => { for (let i = 0; i < 5; i++) capture.step(1 / 30); });
    if (await p.evaluate(() => !!window.__streetUp)) break;
    await sleep(1500);
  }
  await p.evaluate(() => capture.ui(false));
  for (const theme of ["day", "night"]) {
    await p.evaluate((t) => { capture.theme(t); for (let i = 0; i < 30; i++) capture.step(1 / 30); }, theme);
    for (const [name, cx, cy, cz, lx, ly, lz, fov] of AIR) {
      if (ONLY && !ONLY.includes(name)) continue;
      await p.evaluate((v) => { capture.shot(v); for (let i = 0; i < 24; i++) capture.step(1 / 30); }, { pos: [cx, cy, cz], look: [lx, ly, lz], fov });
      await sleep(400);
      await p.evaluate(() => { for (let i = 0; i < 6; i++) capture.step(1 / 30); });
      await p.screenshot({ path: `${OUT}/${TAG}-${name}-${theme}.png` });
    }
  }
  console.log("air errors", errs.length, errs.slice(0, 4).join("\n"));
  await b.close();
}
fs.writeFileSync(`${OUT}/${TAG}-log.json`, JSON.stringify(log, null, 1));
