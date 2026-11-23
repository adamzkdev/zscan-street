// node shots/_gtaknock.mjs [URL] [OUT]: at the wheel onto the pavement, through a lamp post and a tree (src/gta): what goes down, how the car takes it
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/knock"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => { const g = street.gta; g.hud.coach(-1); const c = g.parked[0]; g.player.place(c.group.position.x - 1.5, 0.2, c.group.position.z + 1.6, 0); g.input.tap("KeyF"); });
await sleep(500);
// a lamp on a long straight pavement, the car lined up behind it on the pavement
const lamp = await p.evaluate(() => {
  const g = street.gta;
  const L = g.host.furniture().filter((f) => f.type === "lamp" && Math.abs(f.x) > 60 && Math.abs(f.z) > 20);
  for (const f of L) {
    // the pavement runs along x or z: whichever way the road is
    const ax = g.roads.road(f.x, f.z + 3) || g.roads.road(f.x, f.z - 3) ? "x" : "z";
    const back = ax === "x" ? [f.x - 18, f.z] : [f.x, f.z - 18];
    let clear = true;
    for (let k = 2; k < 18; k += 1) { const x = ax === "x" ? f.x - k : f.x, z = ax === "x" ? f.z : f.z - k; if (!g.solid.drivable(x, z, 1)) clear = false; }
    if (clear) return { x: f.x, z: f.z, ax, back };
  }
  return null;
});
console.log("lamp", JSON.stringify(lamp));
if (lamp) {
  await p.evaluate((l) => { const g = street.gta; const yaw = l.ax === "x" ? 0 : -Math.PI / 2; g.car.place(l.back[0], l.back[1], yaw); g.cam.behind(yaw - Math.PI / 2, -0.14); g.cam.snap(g.car.group.position.clone().setY(1)); }, lamp);
  await sleep(800);
  await p.screenshot({ path: `${OUT}-1-before.png` });
  await p.keyboard.down("KeyW");
  for (let k = 0; k < 20; k++) { await sleep(100); const n = await p.evaluate(() => street.gta.down.length); if (n) { await sleep(250); break; } }
  await p.screenshot({ path: `${OUT}-2-hit.png` });
  await sleep(700);
  await p.keyboard.up("KeyW");
  await p.keyboard.down("KeyS");
  await sleep(1200);
  await p.keyboard.up("KeyS");
  await p.evaluate(() => { const g = street.gta; g.cam.yaw += Math.PI; });
  await sleep(900);
  await p.screenshot({ path: `${OUT}-3-after.png` });
  console.log("down", await p.evaluate(() => JSON.stringify({ down: street.gta.down.length, holes: street.gta.down, v: (street.gta.car.speed * 3.6).toFixed(0) })));
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
