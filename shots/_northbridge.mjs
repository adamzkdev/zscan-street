// node shots/_northbridge.mjs [URL] [OUT]: the Brooklyn Bridge to Zakone and Mount Zuji (src/scene/isles/north): shots from the
// city, on the promenade and the deck, of the town, the shrine, the hot spring, the harbour, the Fifth Station (day and night);
// a drive in the ZK-GT north over the bridge onto Bridge Avenue and back (on the deck's profile, between its barriers, never in
// the sea); a drive up the Zuji Touge to the Fifth Station (between its guardrails, on its surface); a walk along the promenade
// (its floor over the road); the island's doors facing their streets, reachable; the hot spring (in the water); fps.
// ONLY=shots,doors,drive,touge,walk,swim,night (comma list) to run a part; NOSHOT=1: no pictures.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/isles/north/n"] = process.argv.slice(2);
mkdirSync(dirname(OUT), { recursive: true });
const ONLY = process.env.ONLY ?? "";
const NOSHOT = !!process.env.NOSHOT;
const run = (k) => !ONLY || ONLY.split(",").includes(k);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
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
const seenMsg = new Set();
p.on("console", (m) => {
  const t = m.text();
  if (m.type() !== "error" || t.includes("429") || seenMsg.has(t)) return;
  seenMsg.add(t);
  console.log("  console:", t.slice(0, 300));
});
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
await p.waitForFunction(() => window.street.isles?.live?.every((L) => L.content), { timeout: 180000, polling: 300 });
console.log("islands built after", ((Date.now() - t0) / 1000).toFixed(1), "s;", await p.evaluate(() => street.isles.live.map((L) => `${L.isle.key}: facades ${L.content.facades.length}, parked ${L.content.parked.length}`).join("; ")));
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  g.heat.raise = () => {};
});
const fps = async () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
/** On foot at (x, z) facing h (0 north, π south, −π/2 east), the camera behind; a shot. */
const stand = async (name, x, z, h, pitch = -0.1, wait = 3500) => {
  if (await p.evaluate(() => !!street.gta.car)) { await p.evaluate(() => street.gta.input.tap("KeyF")); await sleep(1500); }
  await p.evaluate((x, z, h, pitch) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h, pitch);
  await sleep(wait);
  if (!NOSHOT) await p.screenshot({ path: `${OUT}-${name}.jpg`, type: "jpeg", quality: 62 });
};
const out = {};
const X = -122;
if (run("shots")) {
  await stand("ring", X + 30, -233.5, 0.42, 0.06, 5000);
  out.fpsRing = await fps();
  await stand("approach", X + 14, -330, 0, 0.12);
  await stand("promenade", X, -560, 0, 0.06);
  out.promFoot = await p.evaluate(() => ({ y: +street.gta.player.pos.y.toFixed(2), deck: +street.isles.deckAt(-122, -560).toFixed(2) }));
  out.fpsDeck = await fps();
  await stand("tower", X + 14, -500, 0, 0.42);
  await stand("midspan", X - 14, -800, Math.PI, 0.1);
  await stand("tozakone", X + 14, -900, 0, 0.12);
  await stand("landing", X + 4, -1384, 0, 0.12, 6000);
  out.fpsTown = await fps();
  await stand("torii", X, -1536, 0, 0.2);
  await stand("shrine", X + 20, -1612, 0.4, 0.15);
  await stand("onsendori", -260, -1458, -Math.PI / 2, 0.05);
  await stand("ryokan", -165, -1472, 0, 0.12);
  await stand("rotenburo", -264, -1640, Math.PI, -0.32);
  await stand("harbour", 95, -1420, -Math.PI / 2 + 0.3, 0.02);
  await stand("beach", -250, -1325, -0.2, 0.08);
  const st = await p.evaluate(async () => { const m = await import("/src/scene/isles/north/plan.ts"); return m.STATION; });
  await stand("station", st.x, st.z + 18, Math.PI, -0.05, 5000);
  out.fpsStation = await fps();
  await stand("view", st.x, st.z + 30, Math.PI - 0.3, -0.12);
}
if (run("doors")) {
  await p.evaluate(() => { const g = street.gta; g.player.place(-122, 0.2, -1420, 0); });
  await sleep(7000);
  out.doors = await p.evaluate(() => {
    const s = street.gta.solid;
    const R = street.gta.roads;
    const bad = [];
    const mine = street.isles.facades.filter((f) => f.door.z < -1300);
    for (const f of mine) {
      const fx = f.out.x, fz = f.out.z;
      let road = false;
      for (let d = 2; d < 30 && !road; d++) road = R.road(f.door.x + fx * d, f.door.z + fz * d);
      let free = true;
      const special = (street.isles.groundAt(f.door.x, f.door.z) ?? 0) > 0.65;
      if (!special) for (const d of [0.8, 1.6, 2.4]) { const t = s.topAt(f.door.x + fx * d, f.door.z + fz * d); if (t === undefined || t !== t || t > 0.7) free = false; }
      else for (const d of [0.8, 1.6, 2.4]) if (street.isles.blocked(f.door.x + fx * d, f.door.z + fz * d)) free = false;
      if (!road && !special) bad.push({ at: [+f.door.x.toFixed(1), +f.door.z.toFixed(1)], face: f.face, road, free });
      else if (!free) bad.push({ at: [+f.door.x.toFixed(1), +f.door.z.toFixed(1)], face: f.face, road, free });
    }
    return { n: mine.length, bad };
  });
  console.log("doors", JSON.stringify(out.doors));
  // the town's passers-by after a while (they are born out of sight and walk in)
  await sleep(20000);
  out.people = await p.evaluate(() => { const P = street.gta.player.pos; const all = street.gta.peds.all; const near = all.filter((q) => Math.hypot(q.pos.x - P.x, q.pos.z - P.z) < 150); return { near: near.length, all: all.length }; });
  console.log("people", JSON.stringify(out.people));
  if (!NOSHOT) {
    await p.evaluate(() => { const g = street.gta; g.cam.behind(0, 0.05); });
    await sleep(1500);
    await p.screenshot({ path: `${OUT}-people.jpg`, type: "jpeg", quality: 62 });
  }
}
/** Into the ZK-GT (the nearest parked one) and drive a route with the autopilot: `pts` world points (x, z), `speed` cap. */
const drive = async (name, pts, cap, ms, deckCheck) => {
  await p.evaluate((pts) => {
    const g = street.gta;
    if (!g.car) {
      const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0];
      g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0);
      g.input.tap("KeyF");
    }
  }, pts);
  await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 }).catch(() => {});
  await sleep(1200);
  // (a jump across the map: the place's solid shape is made as you come near — wait for it)
  await p.evaluate((pts) => { const g = street.gta; const [x0, z0] = pts[0], [x1, z1] = pts[1]; g.car.place(x0, z0, Math.atan2(-(z1 - z0), x1 - x0)); g.car.vel.set(0, 0); }, pts);
  await p.waitForFunction((x, z) => !street.gta.solid.pending?.(x, z), { timeout: 20000, polling: 250 }, pts[0][0], pts[0][1]).catch(() => {});
  await sleep(1500);
  await p.evaluate((pts, cap) => {
    const g = street.gta;
    const [x0, z0] = pts[0],
      [x1, z1] = pts[1];
    // (yaw: forward (cos, −sin))
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const y = g.host.ground(x0, z0) ?? 0.2;
    g.car.place(x0, z0, yaw);
    g.car.vel.set(0, 0);
    window.__log = [];
    clearInterval(window.__ap);
    const st = g.input.stick;
    let k = 1;
    let stopAt = 0;
    window.__ap = setInterval(() => {
      const c = g.car;
      if (!c) return;
      const P = c.group.position;
      while (k < pts.length - 1 && Math.hypot(pts[k][0] - P.x, pts[k][1] - P.z) < 9 + c.speed * 0.6) k++;
      const [tx, tz] = pts[k];
      const fx = Math.cos(c.yaw),
        fz = -Math.sin(c.yaw);
      let d = Math.atan2(tz - P.z, tx - P.x) - Math.atan2(fz, fx);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      st.x = Math.max(-1, Math.min(1, d * 2.4));
      // (slower into a bend: the bend ahead from the next points)
      let bend = 0;
      for (let j = k; j < Math.min(pts.length - 1, k + 6); j++) {
        const a = Math.atan2(pts[j + 1][1] - pts[j][1], pts[j + 1][0] - pts[j][0]),
          a0 = Math.atan2(pts[j][1] - pts[Math.max(0, j - 1)][1], pts[j][0] - pts[Math.max(0, j - 1)][0]);
        bend = Math.max(bend, Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))));
      }
      const want = Math.min(cap, bend > 0.25 ? 7 : bend > 0.12 ? 10 : cap);
      let ahead = Infinity;
      for (const bx of street.isles.boxes()) {
        const dx = bx.x - P.x,
          dz = bx.z - P.z;
        const along = dx * fx + dz * fz,
          across = Math.abs(-dx * fz + dz * fx);
        if (along > 2 && along < 14 + c.speed * 2 && across < 1.6) ahead = Math.min(ahead, along);
      }
      if (!stopAt) st.y = ahead < Infinity ? (c.speed > Math.max(1.5, (ahead - 7) / 1.5) ? -0.8 : 0.25) : c.speed > want + 1 ? -0.5 : c.speed < want ? 1 : 0.2;
      const deck = street.isles.deckAt(P.x, P.z);
      window.__log.push({ x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), v: +c.speed.toFixed(1), deck: deck === null ? null : +deck.toFixed(2), k, near: c.speed < 0.5 ? street.isles.live.flatMap((L) => L.traffic.cars).filter((q) => Math.hypot(q.x - P.x, q.z - P.z) < 16).map((q) => [+q.x.toFixed(1), +q.z.toFixed(1), +q.v.toFixed(1)]) : undefined });
      if (!stopAt && k >= pts.length - 1 && Math.hypot(pts[k][0] - P.x, pts[k][1] - P.z) < 12) { st.y = -1; stopAt = performance.now(); }
      if (stopAt && performance.now() - stopAt > 1800) { st.y = 0; st.x = 0; clearInterval(window.__ap); }
    }, 100);
  }, pts, cap);
  const tt = Date.now();
  let n = 0;
  while (Date.now() - tt < ms) {
    await sleep(3000);
    if (++n % 4 === 1 && !NOSHOT) await p.screenshot({ path: `${OUT}-drive-${name}-${String(n).padStart(2, "0")}.jpg`, type: "jpeg", quality: 55 });
    const done = await p.evaluate(() => { const l = window.__log; return l.length > 80 && l[l.length - 1].v < 0.2 && Math.hypot(l[l.length - 1].x - l[l.length - 80].x, l[l.length - 1].z - l[l.length - 80].z) < 0.05; }); // (8 s still: a queue at a light is waited out)
    if (done) break;
  }
  const log = await p.evaluate(() => window.__log);
  return log;
};
if (run("drive")) {
  // the island's traffic on its own for a while: no car lost (NaN), none stopped for long
  const tr = await p.evaluate(async () => {
    const L = street.isles.live.find((l) => l.isle.key === "zakone");
    const T = L.traffic;
    const still = new Map();
    let nan = 0, longest = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 25000) {
      await new Promise((r) => setTimeout(r, 250));
      for (const c of T.cars) {
        n++;
        if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) nan++;
        const k = still.get(c) ?? 0;
        const v = c.v < 0.2 ? k + 0.25 : 0;
        still.set(c, v);
        longest = Math.max(longest, v);
      }
    }
    return { cars: T.cars.length, nan, longestStill: longest, samples: n };
  });
  console.log("traffic:", JSON.stringify(tr));
  out.traffic = tr;
  for (const [name, pts] of [
    ["north", [[X + 6.6, -205], [X + 6.6, -260], [X + 6.6, -1380], [X + 4, -1420]]],
    ["south", [[X - 6.6, -1420], [X - 6.6, -1370], [X - 6.6, -240], [X - 6.6, -205]]],
  ]) {
    const log = await drive(name, pts, 26, 120000);
    let worst = 0, stuck = 0, wet = 0;
    const stalls = [];
    for (let i = 0; i < log.length; i++) {
      const q = log[i];
      if (q.deck !== null && q.deck > 1) worst = Math.max(worst, Math.abs(q.y - q.deck));
      if (q.y < -0.5) wet++;
      const end = pts[pts.length - 1];
      if (i > 12 && q.v < 0.5 && Math.hypot(q.x - end[0], q.z - end[1]) > 16) (stuck++, stalls.push([q.x, q.z, i]));
    }
    if (stalls.length) console.log(`  ${name} stalls: from`, JSON.stringify(stalls[0]), "to", JSON.stringify(stalls[stalls.length - 1]), "near:", JSON.stringify(log[stalls[0][2]].near ?? null));
    const last = log[log.length - 1];
    const xr = [Math.min(...log.map((q) => q.x)), Math.max(...log.map((q) => q.x))];
    console.log(`${name}: ${log.length} samples, end z ${last?.z} (wanted ${pts[pts.length - 1][1]}), max v ${Math.max(...log.map((q) => q.v))} m/s, |y-deck| max ${worst.toFixed(2)} m, stuck ${stuck}, under water ${wet}, x range ${xr[0].toFixed(1)}..${xr[1].toFixed(1)}`);
    out[name] = { end: last?.z, worst: +worst.toFixed(2), stuck, wet };
  }
  out.fpsDrive = await fps();
}
if (run("touge")) {
  // the GPS to the Fifth Station from the town: out by Minato Street and up the mountain road
  const gps = await p.evaluate(async () => {
    const m = await import("/src/scene/isles/north/plan.ts");
    const r = street.gta.roads.gps(-122, -1420, m.STATION.x, m.STATION.z);
    let len = 0;
    for (let i = 1; i < r.length; i++) len += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
    const onRoad = r.filter((q) => m.TOUGE.project(q.x, q.z)).length;
    const back = street.gta.roads.gps(m.STATION.x, m.STATION.z, -122, -1420);
    return { n: r.length, len: Math.round(len), onRoad, back: back.length, end: r[r.length - 1] };
  });
  console.log("gps:", JSON.stringify(gps));
  out.gps = gps;
  // up the mountain road from the end of Minato Street, the right lane, to the Fifth Station
  const pts = await p.evaluate(async () => {
    const m = await import("/src/scene/isles/north/plan.ts");
    const T = m.TOUGE;
    const out = [];
    for (let s = 2; s < T.length; s += 8) { const q = T.point(s, 2.3); out.push([q[0], q[2]]); }
    const e = T.point(T.length, 0);
    out.push([e[0], e[2]]);
    return out;
  });
  const log = await drive("touge", pts, 16, 300000);
  const res = await p.evaluate(async (log) => {
    const m = await import("/src/scene/isles/north/plan.ts");
    const T = m.TOUGE;
    let maxOff = 0, maxDy = 0, far = 0, n = 0, worstAt = null, over1 = 0;
    for (const q of log) {
      const pr = T.project(q.x, q.z);
      if (!pr) continue;
      n++;
      far = Math.max(far, pr.s);
      if (pr.s > 30 && pr.s < T.length - 20) {
        maxOff = Math.max(maxOff, Math.abs(pr.off));
        const dy = Math.abs(q.y - T.y(pr.s));
        if (dy > 1) over1++;
        if (dy > maxDy) (maxDy = dy), (worstAt = { s: Math.round(pr.s), off: +pr.off.toFixed(1), y: q.y, road: +T.y(pr.s).toFixed(2), ground: +m.relief(q.x, q.z).toFixed(2), v: q.v });
      }
    }
    return { length: Math.round(T.length), reached: Math.round(far), onRoad: n, of: log.length, maxOff: +maxOff.toFixed(2), maxDy: +maxDy.toFixed(2), over1, worstAt, top: +T.y(T.length).toFixed(1) };
  }, log);
  const last = log[log.length - 1];
  console.log("touge:", JSON.stringify(res), "end", last && [last.x, last.y, last.z], "max v", Math.max(...log.map((q) => q.v)), "time", (log.length / 10).toFixed(0), "s");
  out.touge = res;
}
if (run("walk")) {
  // on foot along the promenade (over the median), from the city end up the ramp to mid-span
  await p.evaluate(() => { const g = street.gta; if (g.car) g.input.tap("KeyF"); });
  await sleep(1200);
  await p.evaluate(() => { const g = street.gta; g.player.place(-122, 0.2, -244, 0); g.cam.behind(0, -0.1); g.cam.snap(g.player.pos.clone().setY(1.75)); window.__w = []; window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true })); window.__wi = setInterval(() => { const P = g.player.pos; window.__w.push([+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2), +(street.isles.groundAt(P.x, P.z) ?? -9).toFixed(2)]); }, 250); });
  await sleep(45000);
  const w = await p.evaluate(() => { clearInterval(window.__wi); window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w", bubbles: true })); return window.__w; });
  const last = w[w.length - 1];
  let worst = 0;
  for (const q of w) if (q[3] > -9) worst = Math.max(worst, Math.abs(q[1] - q[3]));
  console.log("walk:", w.length, "samples, from z", w[0][2], "to", last[2], "y", last[1], "floor", last[3], "worst |y-floor|", worst.toFixed(2), "x range", Math.min(...w.map((q) => q[0])).toFixed(1), Math.max(...w.map((q) => q[0])).toFixed(1));
  if (!NOSHOT) await p.screenshot({ path: `${OUT}-walk.jpg`, type: "jpeg", quality: 60 });
  out.walk = { to: last[2], y: last[1], worst: +worst.toFixed(2) };
}
if (run("swim")) {
  await stand("bathe", -264, -1620, 0, -0.05, 4000);
  out.bathe = await p.evaluate(() => ({ water: street.isles.sea(-264, -1620), y: +street.gta.player.pos.y.toFixed(2) }));
}
if (run("night")) {
  await p.evaluate(() => street.gta.host.setSky("night"));
  await sleep(2500);
  await stand("night-ring", X + 30, -233.5, 0.42, 0.06, 5000);
  await stand("night-town", X + 4, -1384, 0, 0.1, 5000);
  await stand("night-shrine", X, -1540, 0, 0.18);
  await stand("night-bridge", -250, -1330, Math.PI + 0.45, 0.1);
}
if (run("aerial") && !NOSHOT) {
  // from the air (the capture camera: ?capture): the bridge whole, the island and its mountain, the touge's hairpins
  const q = await b.newPage();
  await q.goto(URL.replace("&solo", "") + "&capture");
  await q.waitForFunction(() => window.__streetUp && window.capture && window.street?.isles?.live?.every((L) => L.content), { timeout: 300000, polling: 500 });
  const shots = [
    ["air-bridge", [140, 260, -260], [-122, 30, -760], 50],
    ["air-side", [380, 90, -800], [-122, 40, -780], 46],
    ["air-zakone", [180, 330, -1150], [-150, 60, -1700], 50],
    ["air-touge", [420, 360, -1600], [60, 60, -1840], 44],
    ["air-town", [-40, 140, -1250], [-120, 0, -1470], 52],
  ];
  for (const [name, pos, look, fov] of shots) {
    await q.evaluate((pos, look, fov) => { capture.shot({ pos, look, fov, far: 2600 }); for (let i = 0; i < 40; i++) capture.step(1 / 30); }, pos, look, fov);
    await sleep(1500);
    await q.evaluate(() => { for (let i = 0; i < 6; i++) capture.step(1 / 30); });
    await q.screenshot({ path: `${OUT}-${name}.jpg`, type: "jpeg", quality: 64 });
  }
  await q.close();
}
console.log(JSON.stringify(out));
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
