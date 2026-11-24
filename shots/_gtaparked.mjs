// node shots/_gtaparked.mjs: the cars parked at the kerbs (src/scene/real/parking.ts) — how many, none in a lane's
// middle or on a crossing, one taken (F: straight in, nobody to pull out) and driven off
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.raise = () => {}; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const info = await p.evaluate(() => {
  const parked = [...street.gta.rides()].filter((r) => r.v === 0 && r.driver === 0 && street.parking.cars.some((c) => c.obj === r.obj));
  return { n: parked.length, kinds: [...new Set(parked.map((r) => r.kind))] };
});
console.log("parked", JSON.stringify(info));
// the nearest parked car to the heart: stand by its driver's door, F
const got = await p.evaluate(() => {
  const g = street.gta;
  const list = [...g.rides()].filter((r) => street.parking.cars.some((c) => c.obj === r.obj));
  list.sort((a, b) => a.obj.position.length() - b.obj.position.length());
  const r = list[0];
  const o = r.obj;
  const fx = Math.cos(o.rotation.y), fz = -Math.sin(o.rotation.y);
  for (const s of [1, -1]) {
    const x = o.position.x - fz * s * 1.9, z = o.position.z + fx * s * 1.9;
    if (g.host.footBlocked(x, z)) continue;
    g.player.place(x, g.host.ground(x, z) ?? 0.2, z, Math.atan2(-(o.position.x - x), -(o.position.z - z)));
    return { uuid: o.uuid, kind: r.kind, at: [+o.position.x.toFixed(1), +o.position.z.toFixed(1)] };
  }
  return null;
});
await sleep(800);
const reach = await p.evaluate(() => { const r = street.gta.reachable(); return r ? { name: r.name, car: !!r.car, d: +r.d.toFixed(2) } : null; });
await p.keyboard.press("KeyF");
await sleep(2500);
const inCar = await p.evaluate(() => street.gta.car?.kind ?? null);
await p.keyboard.down("KeyW");
await sleep(2500);
await p.keyboard.up("KeyW");
const speed = await p.evaluate(() => +(street.gta.car?.speed ?? 0).toFixed(1));
const left = await p.evaluate((u) => [...street.gta.rides()].some((r) => r.obj.uuid === u && street.parking.cars.some((c) => c.obj === r.obj)), got?.uuid);
console.log("take", JSON.stringify({ got, reach, inCar, speed, stillListed: left }), inCar === got?.kind && speed > 1 && !left ? "OK" : "FAIL");
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
