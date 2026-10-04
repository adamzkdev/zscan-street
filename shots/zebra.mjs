import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
await p.goto("http://localhost:3007/?debug");
await new Promise((r) => setTimeout(r, 6000));
const res = await p.evaluate(() => new Promise((resolve) => {
  const d = street.director, zx = -0.5;
  let samples = 0, stoppedOn = 0, hits = 0, crossings = 0, waits = 0;
  const t0 = performance.now();
  const tick = () => {
    samples++;
    for (const v of d.traffic.vehicles) {
      const lo = Math.min(v.front, v.rear), hi = Math.max(v.front, v.rear);
      const on = hi > zx - 1.3 && lo < zx + 1.3;
      if (on && v.v < 0.05) { stoppedOn++; window.__on = `${v.mover.constructor.name}:${v.lane}:${v.x.toFixed(1)}`; }
      for (const s of d.snarks) {
        const p = s.root.position;
        if (s.root.parent !== s.root.parent) continue;
        if (Math.abs(p.z - v.mover.group.position.z) < 1.1 && p.x > lo - 0.2 && p.x < hi + 0.2 && Math.abs(p.x - zx) < 1.6 && s.root.visible) hits++;
      }
    }
    for (const s of d.snarks) if (s.root.parent === d.buses.values().next().value?.cabin) continue; else if (Math.abs(s.root.position.x - zx) < 1.6 && s.root.position.z > -5.4 && s.root.position.z < 2.6) crossings++;
    if (performance.now() - t0 < 60000) requestAnimationFrame(tick); else resolve({ samples, stoppedOn, hits, crossings, last: window.__on });
  };
  tick();
}));
console.log(JSON.stringify(res));
await b.close();
