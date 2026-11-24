// node shots/_qainside.mjs [OUT]: QA of every walk-in place, every floor, in the game's third person (src/gta):
// 4 views per floor (ahead, right, behind, left from above) at OUT/<place>-<floor>-<v>.png, and a line per floor in
// OUT/log.jsonl: errors and warnings logged while on it, fps, draw calls, triangles.
//   KEYS=mempool,museum (default: every place + the generic buildings b:shop,b:cafe,b:bar,b:home,b:office)
//   FLOORS=0,1 (default all)   QS=inside=voxel (extra query)   W/H viewport (default 960×540)
import fs from "node:fs";
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/qa-in"] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W ?? 960),
  H = Number(process.env.H ?? 540);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: W, height: H } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const Wk = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new Wk(u) : new Wk(u, pr);
  };
  F.prototype = Wk.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
let logs = [];
p.on("pageerror", (e) => logs.push("pageerror " + e.message.slice(0, 200)));
p.on("console", (m) => {
  const t = m.type();
  if ((t === "error" || t === "warning") && !/429|Failed to load resource|favicon|GPU stall|WebGL: INVALID_VALUE: texImage/i.test(m.text())) logs.push(`${t} ${m.text().slice(0, 200)}`);
});
await p.goto(`http://localhost:3061/?debug&gta=1192&theme=day${process.env.QS ? "&" + process.env.QS : ""}`);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => {
  street.gta.hud.coach(-1);
  const r = street.composer.renderer;
  r.info.autoReset = false;
  window.__fi = { calls: 0, tris: 0 };
  const loop = () => {
    window.__fi = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.info.reset();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALL = await p.evaluate(() => Object.keys(street.interiors.build).filter((k) => k !== "building"));
const BUILDINGS = { "b:shop": ["shophouse", 1], "b:cafe": ["shophouse", 3], "b:bar": ["izakaya", 1], "b:home": ["apartment", 2], "b:office": ["office", 5] };
const KEYS = process.env.KEYS ? process.env.KEYS.split(",") : [...ALL, ...Object.keys(BUILDINGS)];
const FLOORS = process.env.FLOORS ? process.env.FLOORS.split(",").map(Number) : null;
const VIEWS = [
  [0, -0.1],
  [-Math.PI / 2, -0.1],
  [Math.PI, -0.1],
  [Math.PI / 2, -0.42],
];
const log = fs.createWriteStream(`${OUT}/log.jsonl`, { flags: "a" });
for (const k of KEYS) {
  logs = [];
  const t0 = Date.now();
  if (k.startsWith("b:")) {
    const [type, seed] = BUILDINGS[k];
    await p.evaluate((type, seed, name) => street.gta.host.enterBuilding({ x: 0, z: -9.6, fx: 0, fz: 1, type, name, seed }), type, seed, k.slice(2).toUpperCase());
  } else {
    await p.evaluate((k) => street.enter(k), k);
    // (the stadium asks first: watch the match)
    await sleep(800);
    await p.evaluate(() => document.querySelector('.choice [data-f="0"]')?.click());
  }
  try {
    await p.waitForFunction(() => !!street.gta.host.interior(), { timeout: 90000, polling: 300 });
  } catch {
    console.log(k, "no way in");
    log.write(JSON.stringify({ k, error: "no way in", logs }) + "\n");
    continue;
  }
  // (the entry's title card: skipped)
  await sleep(1500);
  await p.keyboard.press("KeyK");
  await sleep(3500);
  // the HUD out of the picture (the place itself is what is reviewed), the far camera
  await p.evaluate(() => {
    if (!document.getElementById("qa-hide")) {
      const st = document.createElement("style");
      st.id = "qa-hide";
      st.textContent = "#ui > *:not(canvas) { visibility: hidden !important; }";
      document.head.append(st);
    }
    street.gta.cam.footFar = true;
  });
  const floors = await p.evaluate(() => street.interiors.active.floors.map((f) => f.name ?? ""));
  for (let n = 0; n < floors.length; n++) {
    if (FLOORS && !FLOORS.includes(n)) continue;
    if (n > 0 || FLOORS) {
      await p.evaluate((n) => street.interiors.goTo(n), n);
      await sleep(2200);
    }
    await p.evaluate(() => (window.__qaH = undefined));
    // stand in the middle of the floor (the free spot nearest the middle of its walls), facing the far side
    await p.evaluate((n) => {
      const I = street.interiors;
      const f = I.active.floors[n];
      const rects = I.active.colliders ? I.active.colliders(n) : [];
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [a, b, c, d] of rects) {
        if (c - a > 60 || d - b > 60) continue;
        x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, c); z1 = Math.max(z1, d);
      }
      let cx = isFinite(x0) ? (x0 + x1) / 2 : f.spawn.x, cz = isFinite(z0) ? (z0 + z1) / 2 : f.spawn.z;
      // (halfway between the spawn and the middle: the middle may be a void or a wall)
      let best = null;
      for (let r = 0; r < 14 && !best; r += 0.5)
        for (let a = 0; a < 6.283 && !best; a += 0.4) {
          const x = (cx + f.spawn.x) / 2 + Math.cos(a) * r, z = (cz + f.spawn.z) / 2 + Math.sin(a) * r;
          if (!I.walk.blockedAt(x, z) && !I.walk.blockedAt(x + 0.6, z) && !I.walk.blockedAt(x - 0.6, z) && !I.walk.blockedAt(x, z + 0.6) && !I.walk.blockedAt(x, z - 0.6)) best = [x, z];
        }
      // (a lift car is free space too: the floor's own spawn wins when the middle is far from it)
      if (!best || Math.hypot(best[0] - f.spawn.x, best[1] - f.spawn.z) > 12) best = [f.spawn.x, f.spawn.z];
      const P = f.spawn.clone();
      P.x = best[0];
      P.z = best[1];
      const yaw = Math.atan2(-(cx - P.x), -(cz - P.z));
      I.walk.place(P, isFinite(yaw) ? yaw : f.yaw, I.walk.ground ? (I.walk.ground(P.x, P.z) ?? f.y) : f.y);
    }, n);
    await sleep(900);
    const before = logs.length;
    for (let v = 0; v < VIEWS.length; v++) {
      const [dy, pitch] = VIEWS[v];
      await p.evaluate((dy, pitch) => {
        const g = street.gta;
        const W = street.interiors.walk;
        window.__qaH ??= W.heading ?? 0;
        // (the player turned, the camera behind: the game's camera swings back behind you by itself)
        const h = window.__qaH + dy;
        W.place(W.camera.position.clone().setY(W.floor), h, W.floor);
        g.player.place(W.camera.position.x, W.floor, W.camera.position.z, h);
        g.cam.behind(h, pitch);
      }, dy, pitch);
      await sleep(700);
      await p.screenshot({ path: `${OUT}/${k.replace(":", "_")}-${n}-${v}.png` });
    }
    const st = await p.evaluate(async () => {
      let c = 0;
      const t = performance.now();
      await new Promise((r) => {
        const f = () => (c++, performance.now() - t < 1200 ? requestAnimationFrame(f) : r());
        requestAnimationFrame(f);
      });
      return { fps: +(c / ((performance.now() - t) / 1000)).toFixed(1), ...window.__fi };
    });
    const line = { k, n, name: floors[n], ...st, logs: logs.slice(before) };
    log.write(JSON.stringify(line) + "\n");
    console.log(k, n, floors[n], st.fps, st.calls, (st.tris / 1000).toFixed(0) + "k", line.logs.length ? "LOGS " + line.logs.length : "");
  }
  await p.evaluate(() => street.leavePlace());
  await p.waitForFunction(() => !street.gta.host.interior(), { timeout: 30000, polling: 300 }).catch(() => {});
  await sleep(1200);
  console.log(k, "done in", Math.round((Date.now() - t0) / 1000), "s");
}
log.end();
await b.close();
