// node shots/_gtalift.mjs [URL] [OUT]: a lift ride in the third person (src/gta): in the car, a floor called, faced out, walked out
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/lift", PLACE = process.env.PLACE ?? "hotel"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate((k) => { const g = street.gta; g.hud.coach(-1); const all = [...g.doors.list.map((x) => x.spot), ...g.doors.bare]; const d = all.find((x) => x.key === k); g.player.place(d.x + d.fx * 1.8, 0.2, d.z + d.fz * 1.8, Math.atan2(d.fx, d.fz)); }, PLACE);
await sleep(600);
await p.keyboard.press("KeyE");
await p.waitForFunction(() => street.interiors.active && !street.interiors.warming, { timeout: 30000, polling: 200 });
await sleep(3000);
// into the first car on this floor (doors open), then a floor called from inside
const ok = await p.evaluate(() => {
  const c = street.interiors.circ;
  const car = c.cars.find((x) => x.floor === street.interiors.floor);
  if (!car) return "no car";
  car.setOpen(1);
  const g = street.gta;
  const [x, z] = [car.spot.x ?? 0, car.spot.z ?? 0];
  return JSON.stringify({ spot: car.spot });
});
console.log("car", ok);
await p.evaluate(() => {
  const c = street.interiors.circ, g = street.gta, w = street.interiors.walk;
  const car = c.cars.find((x) => x.floor === street.interiors.floor);
  const a = c.arrival(street.interiors.floor);
  // stand in the car, facing in (back to the doors)
  g.player.place(a.pos.x, a.pos.y, a.pos.z, a.yaw + Math.PI);
  w.camera.position.set(a.pos.x, a.pos.y + 1.6, a.pos.z);
  g.lastWalk.copy(w.camera.position);
});
await sleep(800);
const target = await p.evaluate(() => { const c = street.interiors.circ; const fl = street.interiors.active.floors.length; for (let n = 1; n < fl; n++) if (c.call(n)) return n; return -1; });
console.log("called floor", target);
for (let k = 0; k < 10; k++) {
  await sleep(700);
  const st = await p.evaluate(() => JSON.stringify({ ride: street.interiors.circ.ride?.phase ?? null, floor: street.interiors.floor, facing: +street.gta.player.facing.toFixed(2), heading: +street.interiors.walk.heading.toFixed(2), pos: street.gta.player.pos.toArray().map((v) => +v.toFixed(1)) }));
  console.log(k, st);
  if (k === 2) await p.screenshot({ path: `${OUT}-1-ride.png` });
}
await p.screenshot({ path: `${OUT}-2-out.png` });
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
