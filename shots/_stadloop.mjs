// node shots/_stadloop.mjs: walks the stands' walkway all the way round (drift toward waypoints), reports progress
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal"], defaultViewport: { width: 1200, height: 760 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug&theme=day&interior=stadium`);
await p.waitForFunction(() => window.street?.interiors?.active, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
const res = await p.evaluate(async () => {
  const I = street.interiors;
  I.goTo(0);
  const W = I.walk;
  // the walkway's middle line: a rounded rectangle
  const hx = 36 - 7, hz = 24.6 - 7, R = 7 + 12.5;
  const pts = [];
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * Math.PI * 2 + Math.PI / 2; // start south
    const cx = Math.cos(a), cz = Math.sin(a);
    pts.push([Math.sign(cx) * hx + cx * R, Math.sign(cz) * hz + cz * R]);
  }
  const y = I.active.floors[0].y;
  const V = W.camera.position.constructor;
  W.place(new V(pts[0][0], y, pts[0][1]), 0, y);
  let i = 1, stuck = 0, last = null;
  const t0 = performance.now();
  while (i < pts.length && performance.now() - t0 < 120000) {
    const pos = W.camera.position;
    const [tx, tz] = pts[i];
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < 1.2) { i++; stuck = 0; continue; }
    W.drift = [(dx / d) * 6, (dz / d) * 6];
    // step the walker's physics directly (headless frames are throttled)
    for (let s = 0; s < 4; s++) W.update(1 / 30);
    await new Promise((r) => setTimeout(r, 0));
    if (last && Math.hypot(pos.x - last[0], pos.z - last[1]) < 0.05) { if (++stuck > 40) break; } else stuck = 0;
    last = [pos.x, pos.z];
  }
  W.drift = null;
  return { reached: i, of: pts.length - 1, at: [W.camera.position.x.toFixed(1), W.camera.position.z.toFixed(1)], floor: I.floor };
});
console.log(JSON.stringify(res));
await p.screenshot({ path: "shots/stad-loop.png" });
await b.close();
