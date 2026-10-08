// node shots/_liftlook.mjs key[:floor],… [--port 3035] : each lift car in its room, seen the way a visitor
// walking up to it sees it: D m (default 8) out from its doors, ANG radians (default 0.45) off its axis,
// pulled in if a wall is in the way. Saved to $OUT/look-key-shaft-fN.jpg.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3035";
const list = args.find((a) => !a.startsWith("--") && a !== port).split(",");
const OUT = process.env.OUT ?? "/tmp";
const D = Number(process.env.D ?? 8),
  ANG = Number(process.env.ANG ?? 0.45);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1100, height: 680 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${process.env.THEME ?? "day"}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(3000);
for (const item of list) {
  const [kf, cam] = item.split("@");
  const [key, fl] = kf.split(":");
  await p.evaluate((k) => street.interiors.active?.key !== k && street.interiors.enter(k, 0), key);
  await wait(2000);
  if (cam) {
    // a free view: key:floor@x,z,yawDegrees[,pitch]
    const [x, z, yd, pt = 0.02] = cam.split(";").join(",").split(",").map(Number);
    await p.evaluate(
      ([n, x, z, yaw, pt]) => {
        const I = street.interiors, W = I.walk;
        I.goTo(n);
        W.onExit = undefined;
        document.getElementById("ui").style.display = "none";
        const y = I.active.floors[n].y;
        W.place(new W.camera.position.constructor(x, y, z), yaw, y);
        W.pitch = pt;
        W.update(0.016);
      },
      [Number(fl ?? 0), x, z, (yd * Math.PI) / 180, pt],
    );
    await wait(1200);
    await p.screenshot({ path: `${OUT}/view-${key}-f${fl ?? 0}-${x}_${z}_${yd}.jpg`, type: "jpeg", quality: 72 });
    console.log("view", `${OUT}/view-${key}-f${fl ?? 0}-${x}_${z}_${yd}.jpg`);
    continue;
  }
  const n = await p.evaluate(() => street.interiors.circ.cars.length);
  for (let j = 0; j < n; j++) {
    const name = await p.evaluate(
      ([j, fl, D, ANG]) => {
        const I = street.interiors, W = I.walk, c = I.circ.cars[j];
        if (fl != null && c.floor !== Number(fl)) return null;
        I.goTo(c.floor);
        W.onExit = undefined;
        document.getElementById("ui").style.display = "none";
        // out along the door's axis, turned ANG to one side; the first side with the longer clear view
        let best = null;
        for (const s of [1, -1]) {
          const a = c.spot.yaw + s * ANG;
          let d = 1.5;
          while (d < D && !W.blocked(c.spot.x - Math.sin(a) * d, c.spot.z - Math.cos(a) * d)) d += 0.25;
          if (!best || d > best.d) best = { a, d };
        }
        const d = Math.max(2.5, best.d - 0.4);
        const V = W.camera.position.constructor;
        const x = c.spot.x - Math.sin(best.a) * d,
          z = c.spot.z - Math.cos(best.a) * d;
        W.place(new V(x, c.y, z), Math.atan2(x - c.spot.x, z - c.spot.z), c.y);
        W.pitch = 0.04;
        W.update(0.016);
        return `${I.active.key}-${c.shaft}-f${c.floor}`;
      },
      [j, fl, D, ANG],
    );
    if (!name) continue;
    await wait(1100);
    await p.screenshot({ path: `${OUT}/look-${name}.jpg`, type: "jpeg", quality: 72 });
  }
  await p.evaluate(() => street.interiors.exit());
  await wait(500);
}
await b.close();
