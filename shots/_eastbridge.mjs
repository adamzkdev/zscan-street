// node shots/_eastbridge.mjs [URL] [OUT]: the Rainbow Bridge to Zaiba (src/scene/isles): shots of the bridge from the city,
// from the deck, of the island's landmarks; a drive in the ZK-GT from the ring road over the bridge onto the island and back
// (the car rides the deck's profile, is held between its barriers, never drops into the sea); the island's doors face their
// streets and are reachable; on foot on the deck and on the beach; fps on the bridge and on the island.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/isles/east"] = process.argv.slice(2);
const ONLY = process.env.ONLY ?? "";
// (NOSHOT=1: no pictures written — the checks and numbers only)
const NOSHOT = !!process.env.NOSHOT;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
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
p.on("console", async (m) => {
  const t = m.text();
  if (!((m.type() === "error" || t.startsWith("TRACE") || t.includes("isle")) && !t.includes("429") && !seenMsg.has(t))) return;
  seenMsg.add(t);
  let st = "";
  try { st = t.startsWith("frame:") ? await m.args()[1]?.evaluate((e) => String(e?.stack ?? e).split("\n").slice(0, 5).join(" | ")) : ""; } catch {}
  console.log("  console:", t.slice(0, 300), st);
});
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.keys?.done, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
await p.waitForFunction(() => window.street.isles?.live?.every((L) => L.content), { timeout: 120000, polling: 300 });
console.log("island built after", ((Date.now() - t0) / 1000).toFixed(1), "s; facades", await p.evaluate(() => street.isles.facades.length), "parked", await p.evaluate(() => street.isles.parkedCars.length));
await p.evaluate(() => {
  const g = street.gta;
  g.hud.coach(-1);
  g.heat.raise = () => {};
});
const fps = async () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
/** On foot at (x, z) facing h, the camera behind; a shot. */
const stand = async (name, x, z, h, pitch = -0.1, wait = 3500) => {
  await p.evaluate((x, z, h, pitch) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, pitch); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h, pitch);
  await sleep(wait);
  if (!NOSHOT) await p.screenshot({ path: `${OUT}-${name}.jpg`, type: "jpeg", quality: 62 });
};
const out = {};
if (!ONLY || ONLY.includes("shots")) {
  // from the ring road at Boulevard North: the bridge leaving the city
  await stand("ringroad", 214, -146, -Math.PI / 2 - 0.25, -0.02);
  out.fpsRing = await fps();
  // the island's landmarks (the solid shape is made as we come near)
  await stand("landing", 1238, -150, -Math.PI / 2, -0.05, 6000);
  out.fpsIsland = await fps();
  await stand("ztv", 1274, -150, 0, 0.25);
  await stand("wheel", 1398, -70, -Math.PI / 2 - 0.4, 0.2);
  await stand("beach", 1228, 10, Math.PI / 2 + 0.6, 0.0);
  await stand("bigproof", 1363, -80, Math.PI, 0.1);
  await stand("heights", 1408, -250, 0, 0.2);
  await stand("shops", 1358, 15, Math.PI, 0.05);
  // the bridge from the beach, toward the city (the sunset view)
  await stand("view", 1188, -80, Math.PI / 2 + 0.25, 0.05);
  // on the deck's walkway, mid-span
  await stand("deck", 728, -156 - 9.2, -Math.PI / 2, 0.0);
  out.deckFoot = await p.evaluate(() => { const g = street.gta; return { y: +g.player.pos.y.toFixed(2), deck: +street.isles.deckAt(728, -165.2).toFixed(2) }; });
  out.fpsDeck = await fps();
}
if (!ONLY || ONLY.includes("doors")) {
  // the island's doors: each faces its street, reachable on foot (the solid shape free in front)
  await p.evaluate(() => { const g = street.gta; g.player.place(1358, 0.2, -156, 0); });
  await sleep(6000);
  out.doors = await p.evaluate(() => {
    const s = street.gta.solid;
    const R = street.gta.roads;
    const bad = [];
    for (const f of street.isles.facades) {
      const fx = f.out.x, fz = f.out.z;
      let road = false;
      for (let d = 2; d < 28 && !road; d++) road = R.road(f.door.x + fx * d, f.door.z + fz * d);
      let free = true;
      for (const d of [0.8, 1.6, 2.4]) { const t = s.topAt(f.door.x + fx * d, f.door.z + fz * d); if (t === undefined || t !== t || t > 0.7) free = false; }
      if (!road || !free) bad.push({ at: [+f.door.x.toFixed(1), +f.door.z.toFixed(1)], face: f.face, road, free });
    }
    return { n: street.isles.facades.length, bad };
  });
}
if (!ONLY || ONLY.includes("drive")) {
  // the drive: into the ZK-GT on the ring road, east over the bridge, along Rainbow Boulevard, and back
  await p.evaluate(() => { const g = street.gta; const c = g.parked.find((x) => x.kind === "gt") ?? g.parked[0]; g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0); g.input.tap("KeyF"); });
  await p.waitForFunction(() => !!street.gta.car, { timeout: 10000, polling: 100 }).catch(() => {});
  await sleep(1500);
  const leg = async (name, from, to, lane, ms) => {
    await p.evaluate((from, to, lane) => {
      const g = street.gta;
      const east = to > from;
      const zl = -156 + (east ? lane : -lane);
      g.car.place(from, zl, east ? 0 : Math.PI);
      g.car.vel.set(0, 0);
      g.cam.behind(east ? -Math.PI / 2 : Math.PI / 2, -0.1);
      window.__log = [];
      clearInterval(window.__ap);
      const st = g.input.stick;
      st.x = 0;
      st.y = 1;
      let stopAt = 0;
      window.__ap = setInterval(() => {
        const c = g.car;
        if (!c) return;
        const pos = c.group.position;
        const want = east ? 0 : Math.PI;
        let dh = c.yaw - want;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        // east: right is +z; west: right is −z
        const err = east ? zl - pos.z : pos.z - zl;
        st.x = Math.max(-1, Math.min(1, -err * 0.25 + dh * 2.2));
        if (!stopAt) {
          let ahead = Infinity;
          const look = 12 + c.speed * 2;
          for (const b of street.isles.boxes()) {
            const dx = east ? b.x - pos.x : pos.x - b.x;
            if (dx > 1.5 && dx < look && Math.abs(b.z - pos.z) < 1.5) ahead = Math.min(ahead, dx);
          }
          window.__held = ahead < look && c.speed < 0.5 ? (window.__held ?? 0) + 0.1 : 0;
          st.y = window.__held > 4 ? 0.6 : ahead < look ? (c.speed > Math.max(2.5, (ahead - 6) / 1.6) ? -0.8 : 0.3) : 1;
        }
        const deck = street.isles.deckAt(pos.x, pos.z);
        window.__log.push({ x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), v: +c.speed.toFixed(1), deck: deck === null ? null : +deck.toFixed(2), street: g.roads.where(pos.x, pos.z, east ? 1 : -1, 0).street });
        if (!stopAt && ((east && pos.x > to) || (!east && pos.x < to))) { st.y = -1; stopAt = performance.now(); }
        if (stopAt && performance.now() - stopAt > 1800) { st.y = 0; st.x = 0; clearInterval(window.__ap); }
      }, 100);
    }, from, to, lane);
    const tt = Date.now();
    let n = 0;
    while (Date.now() - tt < ms) {
      await sleep(3000);
      if (++n % 3 === 1 && !NOSHOT) await p.screenshot({ path: `${OUT}-drive-${name}-${String(n).padStart(2, "0")}.jpg`, type: "jpeg", quality: 55 });
      const done = await p.evaluate(() => { const l = window.__log; return l.length > 5 && l[l.length - 1].v < 0.2 && Math.abs(l[l.length - 1].x - l[l.length - 6].x) < 0.05; });
      if (done) break;
    }
    const log = await p.evaluate(() => window.__log);
    let worst = 0, stuck = 0, wet = 0;
    const stalls = [];
    const streets = [];
    for (let i = 0; i < log.length; i++) {
      const q = log[i];
      if (streets[streets.length - 1] !== q.street) streets.push(q.street);
      if (q.deck !== null && q.deck > 1) worst = Math.max(worst, Math.abs(q.y - q.deck));
      if (q.y < -0.5) wet++;
      // (stopped short of the goal: the braking past it, at the end, is no stall)
      const past = to > log[0].x ? q.x > to : q.x < to;
      if (i > 10 && q.v < 0.5 && !past && Math.abs(q.x - to) > 8) (stuck++, stalls.push({ i, x: q.x, v: q.v }));
    }
    const last = log[log.length - 1];
    const zr = [Math.min(...log.map((q) => q.z)), Math.max(...log.map((q) => q.z))];
    console.log(`${name}: ${log.length} samples, end x ${last?.x} (wanted ${to}), max v ${Math.max(...log.map((q) => q.v))} m/s, |y-deck| max ${worst.toFixed(2)} m, stuck ${stuck}, under water ${wet}, z range ${zr[0].toFixed(1)}..${zr[1].toFixed(1)}`);
    console.log("  streets:", streets.join(" → "));
    if (stalls.length) console.log("  stalls:", JSON.stringify(stalls.slice(0, 6)));
    out[name] = { end: last?.x, worst: +worst.toFixed(2), stuck, wet };
  };
  await leg("east", 205, 1298, 1.9, 110000);
  await leg("west", 1278, 200, 1.9, 110000);
  out.fpsDrive = await fps();
}
if (!ONLY || ONLY.includes("swim")) {
  // into the sea off the beach: wading, then swimming
  if (await p.evaluate(() => !!street.gta.car)) { await p.evaluate(() => street.gta.input.tap("KeyF")); await sleep(1500); }
  await stand("swim", 1134, -40, Math.PI / 2, 0.0, 4000);
  out.swim = await p.evaluate(() => { const g = street.gta; return { sea: street.isles.sea(1134, -40), y: +g.player.pos.y.toFixed(2) }; });
}
console.log(JSON.stringify(out));
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
