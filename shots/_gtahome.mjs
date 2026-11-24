// node shots/_gtahome.mjs [URL]: your home in the game (src/gta/home.ts, homeedit.ts, interior/home)
//  - PLAY starts you in your penthouse (by the private lift), the ZK-GT and a bike parked in front of the building
//  - looks round the flat (day; night with NIGHT=1): shots/gtahome-*.png
//  - walk out of the lift to the street: you stand by the building's door, your car a few steps away; get in it
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
  const e = JSON.parse(localStorage.getItem("zstreet.economy") ?? "{}");
  delete e.home;
  localStorage.setItem("zstreet.economy", JSON.stringify(e));
});
await p.reload();
await boot();
const site = await p.evaluate(() => street.gta.homeEdit.api.Home.site);
console.log("home", JSON.stringify(site));
ok(!!site, "your building is chosen");
await atHome();
ok(true, "PLAY starts you at home");
await sleep(2500);
const spawn = await p.evaluate(() => ({ x: +street.gta.player.pos.x.toFixed(2), z: +street.gta.player.pos.z.toFixed(2) }));
ok(Math.hypot(spawn.x, spawn.z + 1.6) < 0.6, "by the lift's doors", JSON.stringify(spawn));
const cars = await p.evaluate((s) => street.gta.parked.filter((c) => c.kind === "gt" || c.kind === "moto").map((c) => ({ kind: c.kind, d: +Math.hypot(c.group.position.x - s.door.x, c.group.position.z - s.door.z).toFixed(1) })).filter((c) => c.d < 40), site);
ok(cars.some((c) => c.kind === "gt" && c.d < 32) && cars.some((c) => c.kind === "moto" && c.d < 34), "the ZK-GT and a bike parked in front", JSON.stringify(cars));
await shot("1-arrive");
if (process.env.NIGHT) {
  await p.evaluate(() => street.gta.host.setSky("night"));
  await sleep(1500);
}
for (const [n, x, z, yaw] of [["2-living", -2.6, -6.2, 0.75], ["3-great", 0.6, -2.4, 0.35], ["4-kitchen", -2.5, -6.5, 2.2], ["5-bedroom", 6.6, -7.2, 0.6], ["6-glass", 1.4, -11.8, 0.0]]) {
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
ok(out.door < 5, "out on the pavement by your building's door", JSON.stringify(out));
ok(out.car > 0 && out.car < 32, "your car a few steps away");
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
await key("KeyF");
await sleep(1500);

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
// the walk round the flat: every room reached from the lift (the walker's colliders, 0.25 m grid)
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
  return { cells: seen.size, inside: x0 >= -9 && x1 <= 9 && z0 >= -14, x0, x1, z0, kitchen: at(-7.4, -6.4), dining: at(-7.5, -12.5), living: at(1.6, -12.8), bedroom: at(7, -8), bath: at(7, -2.6), hall: at(4.2, -3) };
});
ok(reach.inside, "no way out through the walls or the glass", JSON.stringify({ x0: reach.x0, x1: reach.x1, z0: reach.z0 }));
ok(reach.kitchen && reach.dining && reach.living && reach.bedroom && reach.bath && reach.hall, "every room reached from the lift", JSON.stringify(reach));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
console.log(fails ? `${fails} FAILED` : "ALL OK");
await b.close();
