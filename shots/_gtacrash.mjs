// node shots/_gtacrash.mjs [URL] [OUT]: ram the traffic with the GT (src/gta shove()): the car hit leaves its lane, flies off metres, spins; then a parked car shoved into another
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/crash/c"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); g.heat.clear?.(); g.heat.raise = () => {}; });
for (let run = 0; run < 3; run++) {
  // a car of the traffic on an east–west street, the GT 26 m behind it in its lane
  const setup = await p.evaluate(() => {
    const g = street.gta;
    const movers = [...g.host.traffic.movers].filter((m) => m.line.axis === "x" && m.v > 2);
    if (!movers.length) return null;
    const m = movers[Math.floor(Math.random() * movers.length)];
    const yaw = m.group.rotation.y;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    if (!g.car) {
      const gt = g.parked.find((c) => c.kind === "gt");
      g.player.place(gt.group.position.x + 2, 0.2, gt.group.position.z, 0);
      g.getIn();
    }
    const car = g.car;
    const q = m.group.position;
    car.place(q.x - fx * 26, q.z - fz * 26, yaw);
    car.vel.set(fx * 24, fz * 24);
    car.vF = 24;
    window.__target = m;
    window.__t0 = { x: q.x, z: q.z };
    return { kind: m.kind, x: +q.x.toFixed(1), z: +q.z.toFixed(1) };
  });
  if (!setup) { console.log("no traffic"); continue; }
  await p.keyboard.down("KeyW");
  let shot = 0;
  const track = [];
  for (let k = 0; k < 30; k++) {
    await sleep(100);
    const s = await p.evaluate(() => {
      const g = street.gta;
      const m = window.__target;
      const loose = g.parked.find((c) => c.group === m.group);
      const q = m.group.position;
      return { loose: !!loose, x: q.x, z: q.z, v: loose ? Math.hypot(loose.vel.x, loose.vel.y) : m.v, spin: loose ? loose.stun : 0, me: g.car.speed };
    });
    track.push(s);
    if (s.loose && shot < 2 && (k % 4 === 0)) await p.screenshot({ path: `${OUT}-${run}-${shot++}.png` });
    if (k === 6) await p.keyboard.up("KeyW");
  }
  await p.keyboard.up("KeyW");
  const t0 = await p.evaluate(() => window.__t0);
  const hitAt = track.findIndex((s) => s.loose);
  const last = track[track.length - 1];
  const vmax = Math.max(...track.map((s) => s.v));
  console.log(JSON.stringify({ run, ...setup, knocked: hitAt >= 0, flungMaxSpeed: +vmax.toFixed(1), movedFromStart: +Math.hypot(last.x - t0.x, last.z - t0.z).toFixed(1), mySpeedAfter: +last.me.toFixed(1) }));
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
