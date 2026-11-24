// node shots/_gtadrivers.mjs [OUT]: the traffic's people in 3D (src/gta drivers(), the city's bikers' SnarkFigure riders, the couriers): beside a busy street, day and night, close to a car stopped for you; fps with and without them
import puppeteer from "puppeteer-core";
const [OUT = "shots/gta/drivers/d"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
let n = 0;
for (const hour of [13, 22]) {
  await p.evaluate((h) => street.gta.clock.force(h, "clear"), hour);
  // 1) on the kerb of a ring road street, the traffic going by
  await p.evaluate(() => { const g = street.gta; g.player.place(-218, 0.2, -60, Math.PI / 2); g.cam.behind(Math.PI / 2 + 0.9, -0.08); g.cam.snap(g.player.pos.clone().setY(1.7)); });
  await sleep(5000);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-street-${hour}.png` });
  // 2) a car stopped for you: right by its side window
  const r = await p.evaluate(() => {
    const g = street.gta;
    const me = g.player.pos;
    const list = [...g.rides()].filter((r) => r.driver && !["moto", "scooter", "truck"].includes(r.kind) && r.obj.parent?.name !== "goldengate:traffic").sort((a, b) => a.obj.position.distanceTo(me) - b.obj.position.distanceTo(me));
    const c = list[0];
    if (!c) return null;
    const yaw = c.obj.rotation.y, fx = Math.cos(yaw), fz = -Math.sin(yaw);
    g.player.place(c.obj.position.x + fx * 9, 0, c.obj.position.z + fz * 9, Math.atan2(fx, fz));
    return c.obj.uuid;
  });
  await sleep(3000);
  await p.evaluate((u) => {
    const g = street.gta;
    const c = [...g.rides()].find((r) => r.obj.uuid === u);
    if (!c) return;
    const yaw = c.obj.rotation.y, sx = Math.sin(yaw), sz = Math.cos(yaw), fx = Math.cos(yaw), fz = -Math.sin(yaw);
    // beside the driver's window, the camera looking in
    const px = c.obj.position.x - sx * 2.6 + fx * 1.2, pz = c.obj.position.z - sz * 2.6 + fz * 1.2;
    g.player.place(px, 0, pz, Math.atan2(-(c.obj.position.x - px), -(c.obj.position.z - pz)));
    g.cam.behind(Math.atan2(-(c.obj.position.x - px), -(c.obj.position.z - pz)), -0.15);
    g.cam.snap(g.player.pos.clone().setY(1.6));
  }, r);
  await sleep(1200);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-window-${hour}.png` });
}
// 3) bikers: follow the nearest one
const bike = await p.evaluate(() => {
  const g = street.gta;
  const m = [...g.host.traffic.movers].find((m) => m.kind === "moto");
  if (!m) return false;
  const yaw = m.group.rotation.y, fx = Math.cos(yaw), fz = -Math.sin(yaw);
  g.player.place(m.group.position.x - fz * 5 + fx * 4, 0.2, m.group.position.z + fx * 5 + fz * 4, 0);
  window.__bike = m;
  return true;
});
await p.evaluate(() => street.gta.clock.force(13, "clear"));
if (bike) {
  await sleep(300);
  await p.evaluate(() => { const g = street.gta, m = window.__bike; const d = m.group.position.clone().sub(g.player.pos); g.cam.behind(Math.atan2(-d.x, -d.z), -0.1); g.cam.snap(g.player.pos.clone().setY(1.6)); });
  await sleep(600);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}-biker.png` });
}
// 4) fps at a busy heart street, with and without the drivers
await p.evaluate(() => { const g = street.gta; g.player.place(0, 0.2, 3.5, -1.57); g.cam.behind(-1.57, -0.1); g.cam.snap(g.player.pos.clone().setY(1.7)); });
await sleep(4000);
const withD = await fps();
const counts = await p.evaluate(() => ({ drivers: street.gta.drivers(street.gta.player.pos.x, street.gta.player.pos.z).length, movers: street.gta.host.traffic.movers.size, motos: [...street.gta.host.traffic.movers].filter((m) => m.kind === "moto").length }));
await p.evaluate(() => { const g = street.gta; g.__drivers = g.drivers; g.drivers = () => []; });
await sleep(1500);
const without = await fps();
console.log(JSON.stringify({ counts, fpsWithDrivers: withD, fpsWithout: without }));
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
