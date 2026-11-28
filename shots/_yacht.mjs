// node shots/_yacht.mjs [URL]: your yacht (src/gta/boat.ts) — from the villa's dock: E aboard onto its swim platform, walked
// up the transom's stair, across the aft deck, through the saloon's doors to the helm (F); sailed out into the strait, a turn,
// run at the shore (stopped, never through it); F up from the helm, walked about; then laid alongside a city quay and E ashore,
// and E back aboard from the quay. Screenshots shots/gta/yacht/*.jpg.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day"] = process.argv.slice(2);
const OUT = "shots/gta/yacht";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
let fails = 0;
const ok = (c, what, extra = "") => { if (!c) fails++; console.log(c ? "ok  " : "FAIL", what, extra); };
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.jpg`, type: "jpeg", quality: 70 });
const prompt = () => p.evaluate(() => document.querySelector(".gh-prompt")?.textContent?.trim() ?? "");
const state = () => p.evaluate(() => { const g = street.gta, y = g.yacht, P = g.player.pos; return { aboard: g.aboard, helm: g.helm, p: [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)], y: [+y.x.toFixed(1), +y.z.toFixed(1), +y.yaw.toFixed(2)], v: +y.v.toFixed(2), moored: y.moored, local: y.local(P.x, P.z).map((v) => +v.toFixed(2)) }; });

await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  g.heat.raise = () => {};
  g.settings.follow = true;
});
// 1. on the villa's sea wall by the yacht's stern: the prompt, E aboard
await p.evaluate(() => {
  const g = street.gta, D = g.yacht.dock;
  // (on the dock's spot, a step back from its edge: the berth's water is on the yacht's side)
  const away = Math.sign(D.z - g.yacht.z) || 1;
  const V = { x: D.x, z: D.z + away * 0.6 };
  g.player.place(V.x, g.solid.topAt(V.x, V.z) ?? 0.25, V.z, 0);
  g.cam.behind(Math.PI * 0.75, -0.2);
});
await sleep(1500);
const pr1 = await prompt();
console.log("prompt on the dock:", pr1);
ok(/Board your yacht/.test(pr1), "on the dock: E to board your yacht");
await shot("01-dock");
await p.evaluate(() => street.gta.input.tap("KeyE"));
await sleep(800);
let s = await state();
console.log("aboard", JSON.stringify(s));
ok(s.aboard && Math.abs(s.p[1] - (-1.6 + 0.45)) < 0.25, "aboard: on the swim platform", `y ${s.p[1]}`);

/** Walk along local waypoints (the yacht's frame), the body turned toward each: true when the last is reached. */
const walk = (pts, ms = 25000) => p.evaluate(async (pts, ms) => {
  const g = street.gta, y = g.yacht, st = g.input.stick;
  let k = 0;
  const t0 = performance.now();
  const trail = [];
  while (performance.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 50));
    const P = g.player.pos;
    const [tx, tz] = y.world(pts[k][0], pts[k][1]);
    const d = Math.hypot(tx - P.x, tz - P.z);
    if (d < 0.45) {
      if (k === pts.length - 1) { st.x = 0; st.y = 0; return { ok: true, t: +((performance.now() - t0) / 1000).toFixed(1), trail }; }
      k++;
      continue;
    }
    g.player.facing = Math.atan2(-(tx - P.x), -(tz - P.z));
    st.x = 0;
    st.y = 0.55;
    if (trail.length < 400 && Math.random() < 0.15) trail.push([...y.local(P.x, P.z).map((v) => +v.toFixed(2)), +P.y.toFixed(2)]);
  }
  st.x = 0; st.y = 0;
  return { ok: false, k, at: y.local(g.player.pos.x, g.player.pos.z).map((v) => +v.toFixed(2)), y: +g.player.pos.y.toFixed(2), trail: trail.slice(-12) };
}, pts, ms);

// 2. up the stair, across the aft deck, in through the saloon's doors, to the helm
const w1 = await walk([[-14.3, 0], [-12.3, 0], [-12.1, 1.25], [-9.4, 1.25], [-8.7, 0.4], [-7.6, 0.2], [-4, 0.0], [1.6, 0.0], [2.9, 1.15]]);
s = await state();
console.log("walk to the helm", JSON.stringify({ ok: w1.ok, t: w1.t, k: w1.k, at: w1.at, y: w1.y, trail: w1.trail?.slice(-6) }), JSON.stringify(s));
ok(w1.ok, "walked up the stair and through the saloon to the helm");
ok(s.p[1] > -0.1, "on the main deck's level", `y ${s.p[1]}`);
await shot("02-saloon");
const pr2 = await prompt();
console.log("prompt at the helm:", pr2);
ok(/Take the helm/.test(pr2), "at the helm: F to take it");
// 3. the helm: sail out (ahead into the strait, the bow to the west then a turn north)
await p.evaluate(() => street.gta.input.tap("KeyF"));
await sleep(600);
s = await state();
ok(s.helm, "at the helm");
const sail = (ms, thr, steer) => p.evaluate(async (ms, thr, steer) => {
  const g = street.gta, st = g.input.stick, y = g.yacht;
  const t0 = performance.now();
  let vmax = 0, nan = 0;
  const b0 = y.bumps;
  while (performance.now() - t0 < ms) {
    st.y = thr; st.x = steer;
    await new Promise((r) => setTimeout(r, 100));
    vmax = Math.max(vmax, Math.abs(y.v));
    if (!Number.isFinite(y.x + y.z + y.yaw)) nan++;
  }
  st.y = 0; st.x = 0;
  return { vmax: +vmax.toFixed(1), hits: y.bumps - b0, nan, at: [+y.x.toFixed(1), +y.z.toFixed(1), +y.yaw.toFixed(2)] };
}, ms, thr, steer);
const s0 = await state();
// out of the berth as she lies (bow to the west along the sea wall), a turn to starboard out into the strait
const out0 = await sail(6000, 0.8, 0);
const out1 = await sail(5000, 0.8, 0.9);
console.log("out of the berth", JSON.stringify(out0), JSON.stringify(out1));
await shot("03a-leaving");
ok(out0.hits + out1.hits === 0 && Math.hypot(out1.at[0] - s0.y[0], out1.at[1] - s0.y[1]) > 30, "out of the villa's berth into the strait, clear of everything", `${out0.hits + out1.hits} bumps, at ${out1.at}`);
// (out in the strait, her bow to the west, then ahead)
await p.evaluate(() => { const y = street.gta.yacht; y.x = 232; y.z = 420; y.yaw = Math.PI / 2; y.v = 0; });
const a = await sail(9000, 1, 0);
console.log("ahead 9 s", JSON.stringify(a));
await shot("03-sailing");
const b2 = await sail(7000, 1, 0.8);
console.log("turning 7 s", JSON.stringify(b2));
await shot("04-turn");
ok(a.vmax > 6 && a.nan === 0, "she makes way ahead", `${a.vmax} m/s`);
ok(Math.abs(b2.at[2] - a.at[2]) > 0.6, "she turns on the rudder", `${a.at[2]} → ${b2.at[2]}`);
const moved = Math.hypot(b2.at[0] - 232, b2.at[1] - 420);
ok(moved > 40, "she went a good way", `${moved.toFixed(0)} m`);
// 4. aground: straight at Orchard Keys' north shore from the strait — stopped, never through
const g1 = await p.evaluate(() => { const g = street.gta, y = g.yacht; if (!g.helm) g.takeHelm(); y.x = 300; y.z = 560; y.yaw = -Math.PI / 2; y.v = 6; return g.helm; });
const c = await sail(12000, 1, 0);
s = await state();
console.log("at the shore", JSON.stringify(c), JSON.stringify(s));
const land = await p.evaluate(() => { const g = street.gta, y = g.yacht; const [x, z] = y.world(13, 0); return { top: g.solid.topAt(x, z), bow: [x, z] }; });
console.log("  under the bow:", JSON.stringify(land));
ok(c.hits > 0 && s.y[1] < 612, "run at the shore: she stops at it (aground), not through", `z ${s.y[1]}`);
await shot("05-aground");
// 5. up from the helm: on your feet beside it, the yacht still
await p.evaluate(() => { const y = street.gta.yacht; y.x = 300; y.z = 560; y.yaw = Math.PI; y.v = 0; });
await sleep(300);
await p.evaluate(() => street.gta.input.tap("KeyF"));
await sleep(800);
s = await state();
console.log("stood up", JSON.stringify(s));
ok(!s.helm && s.aboard, "F: up from the helm, still aboard");
const w2 = await walk([[1.6, 0.0], [-4, 0.0], [-7.6, 0.2], [-8.7, 0.4], [-9.3, 1.5], [-9.3, 2.65], [-6, 2.7], [3, 2.7], [6.2, 2.4], [10.5, 1.2]]);
console.log("walk out and along the side deck", JSON.stringify({ ok: w2.ok, k: w2.k, at: w2.at, y: w2.y, trail: w2.trail?.slice(-6) }));
ok(w2.ok, "out of the saloon, along the side deck to the foredeck");
await shot("06-foredeck");
// walls: from the side deck straight at the saloon's glass — held
const wall = await p.evaluate(async () => {
  const g = street.gta, y = g.yacht, st = g.input.stick;
  const [x, z] = y.world(0, 2.75);
  g.player.place(x, y.floorAt(x, z), z, 0);
  const [tx, tz] = y.world(0, 0);
  for (let i = 0; i < 30; i++) { g.player.facing = Math.atan2(-(tx - g.player.pos.x), -(tz - g.player.pos.z)); st.y = 0.7; await new Promise((r) => setTimeout(r, 50)); }
  st.y = 0;
  return y.local(g.player.pos.x, g.player.pos.z).map((v) => +v.toFixed(2));
});
console.log("into the saloon's side", JSON.stringify(wall));
ok(Math.abs(wall[1]) > 2.1, "the saloon's side wall holds", `lz ${wall[1]}`);
// 6. alongside a city quay (the bay's: z 146) and ashore, then back aboard
const quay = await p.evaluate(async () => {
  const g = street.gta, y = g.yacht;
  // (find a stretch of the quay with deep water off it: the bay along BAY.z0)
  const land = (x, z) => { const t = g.solid.topAt(x, z); return t === t && t !== undefined && t > -0.35 && g.solid.foot(x, z, t).ok && !g.host.footBlocked(x, z); };
  for (let x = -260; x <= 260; x += 8) for (const z of [150.5, 151.5, 152.5]) {
    y.x = x; y.z = z; y.yaw = 0; y.v = 0;
    let clear = true;
    for (const lx of [-15, -8, 0, 8, 12]) for (const lz of [-3.2, 3.2]) { const [wx, wz] = y.world(lx, lz); if (!g.boatWater(wx, wz)) clear = false; }
    const [qx, qz] = y.world(-2, -6.5);
    if (clear && land(qx, qz) && land(qx - 3, qz) && land(qx + 3, qz)) return { x, z };
  }
  return null;
});
console.log("quay berth", JSON.stringify(quay));
if (quay) {
  await p.evaluate(() => { const g = street.gta, y = g.yacht; const [x, z] = y.world(-2, -2.7); g.player.place(x, y.floorAt(x, z), z, Math.PI); });
  await sleep(800);
  const pr3 = await prompt();
  console.log("prompt at the rail by the quay:", pr3, JSON.stringify(await p.evaluate(() => { const g = street.gta, P = g.player.pos; const out = []; for (const dz of [-1.5, -3, -4.5, -6]) { const x = P.x, z = P.z + dz; out.push({ z: +z.toFixed(1), top: g.solid.topAt(x, z), foot: g.solid.foot(x, z, g.solid.topAt(x, z) ?? 0).ok, blocked: g.host.footBlocked(x, z), over: g.yacht.over(x, z, 0.4) }); } return { act: g.boatAction()?.label ?? null, P: [P.x, P.y, P.z], out }; })));
  ok(/Go ashore/.test(pr3), "alongside a quay: E to go ashore");
  await p.evaluate(() => street.gta.input.tap("KeyE"));
  await sleep(800);
  s = await state();
  console.log("ashore", JSON.stringify(s));
  ok(!s.aboard && s.p[1] > -0.4, "ashore on the quay", `y ${s.p[1]}`);
  await shot("07-ashore");
  const pr4 = await prompt();
  ok(/Board your yacht/.test(pr4), "on the quay beside her: E to board again", pr4);
  await p.evaluate(() => street.gta.input.tap("KeyE"));
  await sleep(600);
  s = await state();
  ok(s.aboard, "back aboard from the quay");
}
// back to the berth for the picture from the water
await p.evaluate(() => { const g = street.gta; g.yacht.berth(); g.aboard = false; });
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
