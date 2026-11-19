// node shots/_e2eenter.mjs OUTDIR [placeKey]: the whole way in and out on foot, a still every step
// (map → on foot → walking at the door → the entry → inside → back out → the street)
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";
const OUT = process.argv[2];
const KEY = process.argv[3] ?? "museum";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 300)));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await p.goto(`${process.env.URL ?? "http://localhost:3011/"}?debug`);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 5000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = async (name) => p.screenshot({ path: `${OUT}/${String(n++).padStart(2, "0")}-${name}.png` });
await shot("map");
const door = await p.evaluate((k) => {
  const S = window.street;
  const v = S.city.venues.find((x) => x.kind === k);
  S.walk(true);
  return { x: v.door.x, z: v.door.z, fx: v.front.x, fz: v.front.z };
}, KEY);
await wait(800);
await shot("onfoot");
// stand 7 m in front of the door, facing it
await p.evaluate((d) => {
  const S = window.street, T = S.onFoot.camera.position.constructor;
  S.onFoot.place(new T(d.x + d.fx * 6, 0.15, d.z + d.fz * 6), Math.atan2(d.fx, d.fz));
}, door);
await wait(900);
await shot("before-door");
await p.keyboard.down("w");
for (let i = 0; i < 40; i++) {
  await wait(110);
  const inside = await p.evaluate(() => !!window.street.interiors.active);
  if (i % 3 === 0 || inside) await shot(inside ? "entering" : "walking");
  if (inside) break;
}
await p.keyboard.up("w");
for (const ms of [60, 120, 200, 350, 700, 1500, 3000]) { await wait(ms); await shot(`inside+${ms}`); }
// turn round and walk back out
await p.evaluate(() => { const w = window.street.interiors.walk; w.turnToward(w.heading + Math.PI, 1); });
await wait(400);
await shot("facing-exit");
await p.keyboard.down("w");
for (let i = 0; i < 60; i++) {
  await wait(110);
  const inside = await p.evaluate(() => !!window.street.interiors.active);
  if (i % 4 === 0 || !inside) await shot(inside ? "to-exit" : "out");
  if (!inside) break;
}
await p.keyboard.up("w");
for (const ms of [100, 300, 1200]) { await wait(ms); await shot(`street+${ms}`); }
console.log("errors:", errs);
await b.close();
