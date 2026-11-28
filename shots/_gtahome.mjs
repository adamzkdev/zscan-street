// node shots/_gtahome.mjs [URL]: your home in the game (src/gta/home.ts, homeedit.ts, interior/home, scene/keys/villa.ts)
//  - PLAY starts you in your villa on Orchard Keys (in the hall by the front door), the ZK-GT and a bike in its forecourt
//  - looks round the house (day; night with NIGHT=1): shots/gtahome-*.png
//  - out through the front door: you stand on the porch, your car a few steps away; get in it
//  - the GPS to the city: its way runs out of the gate, through the tunnel and over the Golden Gate; driven (DRIVE=0 skips it)
//  - buy a piece through the API (economy.ts buy, as the STORE's HOME tab does), go home, place it with the keys (B, F)
//  - reload: still there; the map's ⌂ sets a waypoint home, the home's blip on the map
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&home&theme=day"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, what, extra = "") => { if (!c) fails++; console.log(c ? "ok  " : "FAIL", what, extra); };
const shot = (n) => p.screenshot({ path: `shots/gtahome-${n}.png` });
const atHome = () => p.waitForFunction(() => street.interiors.active?.key === "home" && street.gta.homeEdit.home, { timeout: 120000, polling: 200 });
const boot = async () => {
  await p.waitForFunction(() => window.__streetUp && window.street?.gta?.active, { timeout: 300000, polling: 300 });
  await p.evaluate(() => street.gta.hud.coach(-1));
};
/** Stand inside the flat at (x, z) facing `yaw` (0: into the flat, −z), the camera behind. */
const stand = (x, z, yaw) => p.evaluate((x, z, yaw) => {
  const w = street.interiors.walk;
  w.camera.position.set(x, 1.6, z);
  w.aim(yaw, -0.08);
  const g = street.gta;
  g.player.place(x, 0, z, yaw);
  g.player.facing = yaw;
  g.cam.behind(yaw, -0.12);
  g.cam.snap(g.player.pos.clone().setY(1.35));
}, x, z, yaw);
const key = async (code, hold = 60) => { await p.keyboard.down(code); await sleep(hold); await p.keyboard.up(code); await sleep(120); };
const mod = (path) => p.evaluate(async (path) => { const m = await import(path); window.__m ??= {}; Object.assign(window.__m, m); return Object.keys(m); }, path);

// ---- a fresh flat: the starter furniture, nothing bought ------------------------------------------
await p.goto(URL);
await boot();
await p.evaluate(() => {
  localStorage.removeItem("zstreet.home.v1");
  localStorage.removeItem("zstreet.home.v2");
  const e = JSON.parse(localStorage.getItem("zstreet.economy") ?? "{}");
  delete e.home;
  localStorage.setItem("zstreet.economy", JSON.stringify(e));
});
await p.reload();
await boot();
const site = await p.evaluate(() => street.gta.homeEdit.api.Home.site);
console.log("home", JSON.stringify(site));
ok(!!site && site.door.z > 600, "your villa is the home", site?.name);
await atHome();
ok(true, "PLAY starts you at home");
await sleep(2500);
const spawn = await p.evaluate(() => ({ x: +street.gta.player.pos.x.toFixed(2), z: +street.gta.player.pos.z.toFixed(2) }));
ok(Math.hypot(spawn.x, spawn.z + 1.6) < 0.6, "in the hall by the front door", JSON.stringify(spawn));
const cars = await p.evaluate((s) => street.gta.parked.filter((c) => c.kind === "gt" || c.kind === "moto").map((c) => ({ kind: c.kind, d: +Math.hypot(c.group.position.x - s.door.x, c.group.position.z - s.door.z).toFixed(1) })).filter((c) => c.d < 40), site);
// (in the motor court behind the gate, nose to it: a short walk along the porch from the door)
ok(cars.some((c) => c.kind === "gt" && c.d < 32) && cars.some((c) => c.kind === "moto" && c.d < 32), "the ZK-GT and a bike in the motor court", JSON.stringify(cars));
await shot("1-arrive");
if (process.env.NIGHT) {
  await p.evaluate(() => street.gta.host.setSky("night"));
  await sleep(1500);
}
for (const [n, x, z, yaw] of [["2-great", 0, -1.8, 0], ["3-living", -2.2, -2.6, -0.95], ["4-kitchen", -6.5, -2.4, 1.15], ["5-bedroom", 8.6, -5.0, -Math.PI / 2], ["6-glass", -3.5, -9.4, 0.25], ["6b-entry", 0, -8.5, Math.PI]]) {
  await stand(x, z, yaw);
  await sleep(1400);
  await shot(n);
}
const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
console.log("fps at home", fps);

// ---- out to the street, into the car ---------------------------------------------------------------
await stand(0, -1.0, Math.PI);
await sleep(600);
await key("KeyE");
await p.waitForFunction(() => !street.interiors.active && !street.gta.homeEdit.home, { timeout: 30000, polling: 200 });
await sleep(1500);
const out = await p.evaluate((s) => {
  const g = street.gta;
  const gt = g.parked.find((c) => c.kind === "gt");
  return { door: +Math.hypot(g.player.pos.x - s.door.x, g.player.pos.z - s.door.z).toFixed(1), car: gt ? +Math.hypot(g.player.pos.x - gt.group.position.x, g.player.pos.z - gt.group.position.z).toFixed(1) : -1 };
}, site);
ok(out.door < 5, "out on the porch by your front door", JSON.stringify(out));
ok(out.car > 0 && out.car < 30, "your car a short walk away", out.car);
await shot("7-street");
// walk to the car (W held, steered to it, round what stands in the way), F gets in
await p.keyboard.down("KeyW");
const walked = await p.evaluate(async () => {
  const g = street.gta;
  const gt = g.parked.find((c) => c.kind === "gt");
  let best = Infinity,
    stuck = 0,
    dodge = 0,
    side = 1;
  for (let i = 0; i < 500; i++) {
    const dx = gt.group.position.x - g.player.pos.x,
      dz = gt.group.position.z - g.player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.8) return { ok: true, t: +(i * 0.03).toFixed(1) };
    if (d < best - 0.05) (best = d), (stuck = 0);
    else if (++stuck > 12) (dodge = 14), (stuck = 0), (side = -side);
    const a = Math.atan2(dx, dz) + (dodge-- > 0 ? side * 1.2 : 0);
    g.player.facing = a + Math.PI;
    g.cam.behind(g.player.facing, -0.1);
    await new Promise((r) => setTimeout(r, 30));
  }
  return { ok: false, best };
});
await p.keyboard.up("KeyW");
ok(walked.ok, "walked to the car", JSON.stringify(walked));
await key("KeyF");
await sleep(1200);
ok(await p.evaluate(() => street.gta.car?.kind === "gt"), "in your ZK-GT");
await shot("8-car");
// ---- the GPS to the city, and the drive there ---------------------------------------------------------
const CITY = { x: 0, z: 20 };
const gps = await p.evaluate((c) => {
  const g = street.gta;
  const at = g.car.group.position;
  const r = g.roads.gps(at.x, at.z, c.x, c.z);
  let len = 0;
  for (let i = 1; i < r.length; i++) len += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
  const bridge = r.some((q) => Math.abs(q.x - 158) < 12 && q.z > 300 && q.z < 560) || r.some((q, i) => i > 0 && Math.abs(q.x - 158) < 12 && Math.abs(r[i - 1].x - 158) < 12 && (q.z - 300) * (r[i - 1].z - 300) < 0);
  return { n: r.length, len: Math.round(len), bridge, end: r[r.length - 1] };
}, CITY);
ok(gps.n > 3 && gps.bridge && gps.len > 600 && gps.len < 1400, "the GPS to the city: out of the gate, through the tunnel, over the Golden Gate", JSON.stringify(gps));
if (process.env.DRIVE !== "0") {
  // an autopilot on the GPS's own line: W held, A / D to its next point, eased off before the turns
  await p.evaluate((c) => street.gta.setWaypoint(c), CITY);
  const drive = await p.evaluate(async (c) => {
    const g = street.gta;
    const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    const held = new Set();
    const hold = (code, on) => {
      if (on && !held.has(code)) (held.add(code), send("keydown", code));
      if (!on && held.has(code)) (held.delete(code), send("keyup", code));
    };
    const route = g.roads.gps(g.car.group.position.x, g.car.group.position.z, c.x, c.z);
    let k = 1, best = Infinity, stuckT = 0, back = 0;
    // (why the bot may lose its car on the way: a police bust, logged with the wanted level)
    let busts = 0;
    { const ob = g.busted; g.busted = function () { busts++; return ob.call(this); }; }
    // (no police on the test drive, as in _gtabridge.mjs: the autopilot rams queues, a player brakes)
    const raise = g.heat.raise;
    g.heat.raise = () => {};
    const t0 = performance.now();
    let maxV = 0, minZ = Infinity, onBridge = false;
    const trail = [];
    let trailT = 0;
    while (performance.now() - t0 < 210000) {
      const car = g.car;
      // (across the strait and off the bridge's far end: in the city — a queue there can be long)
      if (!car) return { ok: minZ < 180, why: "out of the car", minZ: +minZ.toFixed(1), at: [+g.player.pos.x.toFixed(1), +g.player.pos.z.toFixed(1)], t: +((performance.now() - t0) / 1000).toFixed(1), hp: g.hp, busts, heat: g.heat?.level, trail: trail.slice(-6) };
      const p = car.group.position;
      if (performance.now() - trailT > 2000) (trailT = performance.now()), trail.push([+p.x.toFixed(0), +p.z.toFixed(0), +car.speed.toFixed(0), k, +route[k].x.toFixed(0), +route[k].z.toFixed(0), Array.from(g.boxes(car)).filter((b) => Math.hypot(b.x - p.x, b.z - p.z) < 9).map((b) => [+b.x.toFixed(0), +b.z.toFixed(0), b.ref?.kind ?? b.ref?.constructor?.name ?? "?"]).slice(0, 3), car.hit?.what ?? null]);
      minZ = Math.min(minZ, p.z);
      if (Math.abs(p.x - 158) < 12 && p.z > 300 && p.z < 560) onBridge = true;
      // (in the city: off the bridge onto Bay Road, the city's south ring)
      if (p.z < 141 && !(Math.abs(p.x - 158) < 12 && p.z > 138)) break;
      if (p.z < 175 && performance.now() - t0 > 60000) break;
      while (k < route.length - 1 && Math.hypot(route[k].x - p.x, route[k].z - p.z) < 7) k++;
      const tx = route[k].x, tz = route[k].z;
      const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw);
      const want = Math.atan2(tz - p.z, tx - p.x), have = Math.atan2(fz, fx);
      let d = want - have;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const dist = Math.hypot(tx - p.x, tz - p.z);
      maxV = Math.max(maxV, car.speed);
      // stuck (against something): back up a moment, the wheel the other way
      // (on the bridge a queue is waited out, not rammed: the police come for that)
      const deck = Math.abs(p.x - 158) < 14 && p.z > 150 && p.z < 600;
      if (car.speed < 1 && performance.now() - t0 > 3000) stuckT += 50; else stuckT = 0;
      // (and aims again at the route point it came by: knocked past a corner, it went at a wall for ever)
      if (stuckT > (deck ? 9000 : 1500)) (back = 1200), (stuckT = 0), (k = Math.max(1, k - 1));
      if (back > 0) {
        back -= 50;
        hold("KeyW", false); hold("KeyS", true); hold("KeyA", d > 0); hold("KeyD", d < 0);
      } else {
        hold("KeyS", false);
        const turnAhead = k < route.length - 1 && dist < 30;
        const fast = car.speed > (Math.abs(d) > 0.5 ? 7 : turnAhead ? 13 : deck ? 13 : 24);
        hold("KeyW", !fast);
        if (car.speed > 26) hold("KeyS", true);
        // (the heading here is atan2(z, x): a right turn (D) makes it grow)
        hold("KeyD", d > 0.06);
        hold("KeyA", d < -0.06);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    for (const code of [...held]) hold(code, false);
    g.heat.raise = raise;
    const p = g.car?.group.position;
    return { ok: !!p && p.z < 180, t: +((performance.now() - t0) / 1000).toFixed(1), at: p ? [+p.x.toFixed(1), +p.z.toFixed(1)] : null, maxV: +maxV.toFixed(1), onBridge, street: p ? g.roads.where(p.x, p.z).street : null, trail: trail.slice(-6), near: p ? street.traffic?.length : null };
  }, CITY);
  ok(drive.ok && drive.onBridge, "driven from the villa to the city over the Golden Gate", JSON.stringify(drive));
  await shot("8b-city");
  // (stopped before getting out: F does nothing at speed)
  await p.evaluate(() => { const c = street.gta.car; if (c) { c.vel.set(0, 0); c.vF = c.vR = c.yawRate = 0; } });
  await sleep(400);
}
if (await p.evaluate(() => !!street.gta.car)) {
  await key("KeyF");
  await p.waitForFunction(() => !street.gta.car, { timeout: 10000, polling: 200 }).catch(() => {});
}
// (whatever happened on the way — a bust, a fall — over before going on)
await sleep(6000);

// ---- buy a piece (the STORE's way), go home, place it ------------------------------------------------
await p.evaluate(() => (window.__m = street.gta.homeEdit.api));
const bought = await p.evaluate(() => {
  const { Economy, Home } = window.__m;
  Economy.earn(5000, "test");
  const before = Economy.balance();
  const it = Home.catalog().find((x) => x.id === "sofa-emerald");
  const r = Economy.buy({ cat: "home", id: it.id, name: it.name, price: it.price });
  return { r, spent: before - Economy.balance(), owned: Home.owns(it.id), stored: Home.stored() };
});
ok(bought.r && bought.spent === 1400 && bought.owned && bought.stored.includes("sofa-emerald"), "bought the emerald sofa: in your storage", JSON.stringify(bought));
// the map's ⌂: a waypoint home (from a few blocks away)
await p.evaluate((s) => {
  const g = street.gta;
  const r = g.roads.nearest(s.door.x + 70, s.door.z + 50);
  g.player.place(r.x, g.host.ground(r.x, r.z) ?? 0, r.z, 0);
}, site);
await sleep(1200);
await key("KeyM");
await sleep(800);
await p.click(".gh-mctl [data-act=home]");
await sleep(600);
const way = await p.evaluate((s) => { const w = street.gta.waypoint; return w ? +Math.hypot(w.x - s.door.x, w.z - s.door.z).toFixed(1) : -1; }, site);
ok(way >= 0 && way < 4, "the map's ⌂ sets a waypoint at your door", String(way));
await shot("9-map");
await key("KeyM");
await sleep(400);
await shot("10-minimap");
// back in, through the door (E)
await p.evaluate((s) => {
  const g = street.gta;
  const x = s.door.x + s.out.x * 1.6,
    z = s.door.z + s.out.z * 1.6;
  g.player.place(x, g.host.ground(x, z) ?? 0.2, z, Math.atan2(s.out.x, s.out.z));
  g.player.facing = Math.atan2(s.out.x, s.out.z);
}, site);
await sleep(900);
await key("KeyE");
await atHome();
await sleep(1500);
ok(true, "E at the door: home again");
// stand in the great room, B (storage), F (take it), F (put it down)
await stand(-3, -6.3, 0);
await sleep(500);
await key("KeyB");
await sleep(300);
const bar = await p.evaluate(() => document.querySelector(".hm-edit")?.textContent ?? "");
ok(/Emerald|emerald/.test(bar), "B: your storage shows it", bar.slice(0, 80));
await key("KeyF");
await sleep(500);
await shot("11-carry");
await key("KeyF");
await sleep(500);
const placed = await p.evaluate(() => window.__m.Home.placed().find((q) => q.id === "sofa-emerald") ?? null);
ok(!!placed, "F: put down", JSON.stringify(placed));
const blocked = await p.evaluate((q) => street.interiors.walk.blockedAt(q.x, q.z), placed ?? { x: 0, z: 0 });
ok(blocked, "it stops you (a collider)");
await stand(-3, -4.2, 0);
await sleep(900);
await shot("12-placed");
// move it: B in front of it, Q turns, F puts it down again
await stand(-3, -6.0, 0);
await sleep(300);
await key("KeyB");
await sleep(300);
const carrying = await p.evaluate(() => street.gta.homeEdit.carrying);
ok(carrying === "sofa-emerald", "B in front of it picks it up", String(carrying));
await key("KeyB");
await sleep(300);

// ---- reload: still there -----------------------------------------------------------------------------
await p.reload();
await boot();
await atHome();
await sleep(1500);
const again = await p.evaluate(async () => {
  const { Home } = street.gta.homeEdit.api;
  const q = Home.placed().find((q) => q.id === "sofa-emerald");
  let inScene = false;
  street.interiors.active.scene.traverse((o) => (inScene ||= o.userData.home === "sofa-emerald" && o.parent?.visible !== false));
  return { q, inScene };
});
ok(!!again.q && Math.abs(again.q.x - placed.x) < 0.01 && Math.abs(again.q.z - placed.z) < 0.01 && again.inScene, "reload: the sofa is where you put it", JSON.stringify(again));
// the walk round the villa: every room reached from the front door (the walker's colliders, 0.25 m grid)
const reach = await p.evaluate(() => {
  const w = street.interiors.walk;
  const seen = new Set(["0,-6"]);
  const q = [[0, -6]];
  const free = (x, z) => !w.blockedAt(x / 4, z / 4);
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${z + dz}`;
      if (seen.has(k) || x + dx < -80 || x + dx > 80 || z + dz < -100 || z + dz > -1 || !free(x + dx, z + dz)) continue;
      seen.add(k);
      q.push([x + dx, z + dz]);
    }
  }
  const at = (x, z) => seen.has(`${Math.round(x * 4)},${Math.round(z * 4)}`);
  let x0 = 0, x1 = 0, z0 = 0;
  for (const k of seen) {
    const [x, z] = k.split(",").map(Number);
    x0 = Math.min(x0, x / 4), x1 = Math.max(x1, x / 4), z0 = Math.min(z0, z / 4);
  }
  return { cells: seen.size, inside: x0 >= -17 && x1 <= 17 && z0 >= -10.4, x0, x1, z0, kitchen: at(-11.4, -2.0), dining: at(-8.5, -9.5), living: at(2.0, -9.5), great: at(0, -8), corridor: at(8.3, -2.0), bedroom: at(14.5, -8.5), bath: at(12, -2.6) };
});
ok(reach.inside, "no way out through the walls or the glass", JSON.stringify({ x0: reach.x0, x1: reach.x1, z0: reach.z0 }));
ok(reach.kitchen && reach.dining && reach.living && reach.great && reach.corridor && reach.bedroom && reach.bath, "every room reached from the front door", JSON.stringify(reach));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
