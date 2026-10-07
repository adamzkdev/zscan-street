// node shots/_liftride.mjs key[:floor[:shaft]],… [--port 3035] : walks up to a lift, in, rides it one floor and
// walks out, with a picture at each step ($OUT/ride-key-N.jpg). "key:flight:i" climbs flight i instead.
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3035";
const list = args.find((a) => !a.startsWith("--") && a !== port).split(",");
const OUT = process.env.OUT ?? "/tmp";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1100, height: 680 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=${process.env.THEME ?? "day"}`);
await p.waitForFunction(() => window.street?.interiors, { timeout: 180000 });
await wait(4000);
// steps the place by hand (the page's own loop keeps drawing)
const run = (fn, arg) => p.evaluate(fn, arg);
for (const item of list) {
  const [key, fl = "0", sh] = item.split(":");
  const tag = item.replace(/:/g, "-");
  let n = 0;
  const shot = async (what) => {
    await wait(700);
    await p.screenshot({ path: `${OUT}/ride-${tag}-${n++}-${what}.jpg`, type: "jpeg", quality: 72 });
  };
  await run((key) => street.interiors.enter(key, 0), key);
  await wait(2500);
  if (fl === "flight") {
    const ok = await run((i) => {
      const I = street.interiors, W = I.walk, C = I.circ, F = I.active.floors;
      const f = C.flights[i];
      if (!f) return false;
      const d = f.decl;
      const [x0, z0, x1, z1] = d.zone;
      const up = d.up ?? "+z", s = up[0] === "+" ? 1 : -1;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const foot = up[1] === "x" ? [(s > 0 ? x0 : x1) - s * 3, cz] : [cx, (s > 0 ? z0 : z1) - s * 3];
      I.goTo(d.from);
      W.onExit = undefined;
      const V = W.camera.position.constructor;
      W.place(new V(foot[0], F[d.from].y, foot[1]), up === "+x" ? -Math.PI / 2 : up === "-x" ? Math.PI / 2 : up === "+z" ? Math.PI : 0, F[d.from].y);
      window.__fl = { i, up };
      return true;
    }, Number(sh ?? 0));
    if (!ok) continue;
    await shot("foot");
    for (let k = 0; k < 4; k++) {
      await run(() => {
        const I = street.interiors, W = I.walk;
        W.keys.add("w");
        for (let i = 0; i < 50; i++) I.update(1 / 60, performance.now() / 1000);
        W.keys.clear();
      });
      await shot(`climb${k}`);
    }
    continue;
  }
  const ok = await run(
    ([fl, sh]) => {
      const I = street.interiors, W = I.walk, C = I.circ;
      const car = C.cars.find((c) => c.floor === Number(fl) && (!sh || c.shaft === sh));
      if (!car) return false;
      I.goTo(car.floor);
      W.onExit = undefined;
      // 4 m out in front of the doors, looking at them
      const V = W.camera.position.constructor;
      const x = car.spot.x - Math.sin(car.spot.yaw) * 4.4, z = car.spot.z - Math.cos(car.spot.yaw) * 4.4;
      W.place(new V(x, car.y, z), car.spot.yaw + Math.PI, car.y);
      window.__car = car;
      return true;
    },
    [fl, sh],
  );
  if (!ok) {
    console.log("no car", item);
    continue;
  }
  await shot("approach");
  // walk in (the doors open), turn round
  await run(() => {
    const I = street.interiors, W = I.walk, car = window.__car;
    W.keys.add("w");
    for (let i = 0; i < 90; i++) I.update(1 / 60, performance.now() / 1000);
    W.keys.clear();
  });
  await shot("doorway");
  await run(() => {
    const I = street.interiors, W = I.walk, car = window.__car;
    const p = W.camera.position;
    const V = p.constructor;
    W.place(new V(car.spot.x + Math.sin(car.spot.yaw) * 0.3, car.y, car.spot.z + Math.cos(car.spot.yaw) * 0.3), car.spot.yaw, car.y);
    for (let i = 0; i < 30; i++) I.update(1 / 60, performance.now() / 1000);
  });
  await shot("inside");
  const to = await run(() => {
    const C = street.interiors.circ, car = window.__car;
    const s = C.servedBy(car);
    const to = s[s.indexOf(car.floor) + 1] ?? s[s.indexOf(car.floor) - 1];
    C.call(to);
    return to;
  });
  // doors closing, riding, arriving
  for (const [frames, what] of [[40, "closing"], [80, "riding"], [400, "arrived"]]) {
    await run((frames) => {
      const I = street.interiors;
      for (let i = 0; i < frames && (frames < 400 || I.circ.ride); i++) I.update(1 / 60, performance.now() / 1000);
    }, frames);
    await shot(what);
  }
  await run(() => {
    const I = street.interiors, W = I.walk;
    W.keys.add("w");
    for (let i = 0; i < 100; i++) I.update(1 / 60, performance.now() / 1000);
    W.keys.clear();
  });
  await shot("out");
  console.log(item, "→", to);
}
await b.close();
