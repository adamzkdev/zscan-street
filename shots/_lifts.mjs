// node shots/_lifts.mjs [keys] [--port 3035] [--shots] : lists every place's lift cars and stair cores
// (floor, spot), placement problems, and with --shots a picture of each car / core door from 4 m.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3035";
const only = args.find((a) => !a.startsWith("--") && a !== port);
const SHOTS = args.includes("--shots");
const OUT = process.env.OUT ?? "/tmp";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 960, height: 600 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => /\[lifts\]/.test(m.text()) && console.log(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=day`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(3000);
const ALL = await p.evaluate(() => Object.keys(street.interiors.build));
const KEYS = only ? only.split(",") : ALL;
for (const k of KEYS) {
  const r = await p.evaluate((k) => {
    const I = street.interiors;
    const t0 = performance.now();
    I.enter(k, 0);
    const ms = Math.round(performance.now() - t0);
    const c = I.circ;
    const f = (v) => +v.toFixed(1);
    return {
      ms,
      problems: c.problems,
      together: c.together.filter((g) => g.length > 1),
      cars: c.cars.map((x) => `${x.shaft}@${x.floor}(${f(x.spot.x)},${f(x.spot.z)},${f(x.spot.yaw)})`),
      cores: c.flights.map((x) => `${x.decl.kind ?? "stairs"}${x.decl.from}-${x.decl.to}[${x.decl.zone.map(f)}]`),
    };
  }, k);
  console.log(`${k.padEnd(14)} build ${r.ms}ms ${r.problems.length ? "PROBLEMS " + r.problems.join("; ") : ""}${r.together.length ? " together " + JSON.stringify(r.together) : ""}\n   cars: ${r.cars.join(" ")}\n   flights: ${r.cores.join(" ")}`);
  if (SHOTS) {
    const n = await p.evaluate(() => street.interiors.circ.cars.length);
    for (let j = 0; j < n; j++) {
      const name = await p.evaluate((j) => {
        const I = street.interiors;
        const c = I.circ;
        const all = c.cars;
        const x = all[j];
        I.goTo(x.floor);
        const isCar = !!x.doors;
        // stand 4.5 m in front of its door, looking at it
        const yaw = x.spot.yaw + (isCar ? Math.PI : 0);
        const fx = -Math.sin(yaw),
          fz = -Math.cos(yaw);
        const d = isCar ? 4.2 : 4.6;
        const ox = isCar ? 0 : (x.high ? 0.85 : -0.85);
        const cx = x.spot.x + Math.cos(x.spot.yaw) * ox,
          cz = x.spot.z - Math.sin(x.spot.yaw) * ox;
        const W = I.walk;
        const fy = I.active.floors[x.floor].y;
        W.place(new W.camera.position.constructor(cx - fx * d, fy, cz - fz * d), yaw, isCar ? x.y : x.y0 + (x.high ? 3.2 : 0));
        W.pitch = -0.05;
        W.update(0.016);
        return `${I.active.key}-${isCar ? "car-" + x.shaft : x.kind + (x.high ? "H" : "L")}-f${x.floor}`;
      }, j);
      await wait(900);
      await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 70 });
    }
  }
  await p.evaluate(() => street.interiors.exit());
}
await b.close();
