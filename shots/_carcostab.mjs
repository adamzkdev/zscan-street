// node shots/_carcostab.mjs: what the hollow cabins, the seated drivers and the parked cars cost — uncapped fps with each switched off, alternated with the base, at the heart and on Wall Street
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(Number(process.env.WAIT ?? 12000));
const measure = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); });
await p.evaluate(() => {
  const g = street.gta, sc = street.scene3, pk = street.parking;
  const glass = new Set();
  sc.traverse((o) => { if (o.isMesh && o.userData.kind === "glass" && o.material.transparent) glass.add(o.material); });
  const keep = { cars: null, drivers: g.drivers };
  window.__tog = {
    parkGPU: (on) => { sc.getObjectByName("parked-cars").visible = on; for (const c of pk.cars) if (c.obj.parent?.name !== "parked-cars") c.obj.visible = on; },
    parkCPU: (on) => { if (!on) { keep.cars = pk.cars.splice(0); } else if (keep.cars) { pk.cars.push(...keep.cars); keep.cars = null; } },
    glass: (on) => { for (const m of glass) { m.transparent = on; m.depthWrite = !on; m.opacity = on ? 0.58 : 1; m.needsUpdate = true; } },
    drivers: (on) => { g.drivers = on ? keep.drivers : () => []; },
    people: (on) => { g.people.group.visible = on; },
  };
  window.__glassN = glass.size;
});
console.log("glass materials", await p.evaluate(() => window.__glassN), "parked", await p.evaluate(() => street.parking.cars.length));
const keys = (process.env.TOGS ?? "parkGPU,parkCPU,glass,drivers,people").split(",");
for (const [name, x, z, h] of [["heart", 0, 3.5, -1.57], ["wallst", 150, 8, 1.57]]) {
  await p.evaluate((x, z, h) => { const g = street.gta; const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, x, z, h);
  await sleep(6000);
  const row = { spot: name };
  const base = [];
  for (const k of keys) {
    base.push(await measure());
    await p.evaluate((k) => window.__tog[k](false), k);
    await sleep(700);
    row[k] = await measure();
    await p.evaluate((k) => window.__tog[k](true), k);
    await sleep(500);
  }
  base.push(await measure());
  row.base = base.sort((a, b) => a - b)[Math.floor(base.length / 2)];
  row.baseAll = base.join(",");
  console.log(JSON.stringify(row));
}
await b.close();
