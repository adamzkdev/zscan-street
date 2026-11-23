// node shots/_gtahandling.mjs [URL] [KIND]: how the car (or bike) handles (src/gta/vehicle.ts): a run up, a held turn, a slalom; numbers per phase
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", KIND = process.env.KIND ?? "gt"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// on the long ring road, nothing in the way
await p.evaluate((k) => {
  const g = street.gta; g.hud.coach(-1);
  street.cityTraffic.movers.forEach(() => {});
  const c = g.parked.find((x) => x.kind === k);
  g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0);
  g.input.tap("KeyF");
}, KIND);
await sleep(400);
await p.evaluate(() => { const g = street.gta; g.car.place(-160, 1.4, 0); g.cam.behind(-Math.PI / 2); for (const m of [...street.cityTraffic.movers]) street.cityTraffic.take(m).removeFromParent(); });
// sample the car every 100 ms
await p.evaluate(() => {
  window.__h = [];
  const g = street.gta;
  window.__hi = setInterval(() => { const c = g.car; if (!c) return; window.__h.push({ t: performance.now(), v: c.speed, vl: Math.abs(c.vR), yaw: c.yaw, yr: c.yawRate ?? 0, x: c.group.position.x, z: c.group.position.z }); }, 100);
});
const phase = async (name, keys, ms) => {
  await p.evaluate(() => (window.__h = []));
  for (const k of keys) await p.keyboard.down(k);
  await sleep(ms);
  for (const k of keys) await p.keyboard.up(k);
  const r = await p.evaluate(() => { const h = window.__h; if (!h.length) return null; const dyaw = h[h.length - 1].yaw - h[0].yaw; return { v0: (h[0].v * 3.6).toFixed(0), v1: (h[h.length - 1].v * 3.6).toFixed(0), slideMax: Math.max(...h.map((q) => q.vl)).toFixed(1), turnDeg: ((dyaw * 180) / Math.PI).toFixed(0), yawRateMax: Math.max(...h.map((q) => Math.abs(q.yr))).toFixed(2) }; });
  console.log(name.padEnd(18), JSON.stringify(r));
};
await phase("run up 2s", ["KeyW"], 2000);
await phase("lane L 0.35s", ["KeyW", "KeyA"], 350);
await phase("lane R 0.35s", ["KeyW", "KeyD"], 350);
await phase("straight 1s", ["KeyW"], 1000);
await phase("lane R 0.35s", ["KeyW", "KeyD"], 350);
await phase("lane L 0.35s", ["KeyW", "KeyA"], 350);
await phase("straight 1s", ["KeyW"], 1000);
await phase("brake 1.2s", ["KeyS"], 1200);
await phase("corner 1.6s", ["KeyW", "KeyD"], 1600);
await phase("handbrake turn", ["KeyW", "KeyA", "Space"], 900);
console.log("end", await p.evaluate(() => { const c = street.gta.car; return [c.group.position.x.toFixed(1), c.group.position.z.toFixed(1), (c.speed * 3.6).toFixed(0)]; }));
await b.close();
