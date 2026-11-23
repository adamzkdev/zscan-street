// node shots/_gtabarriers.mjs [URL] [OUT]: every metre of every road's lanes checked for what stops a car (src/gta/collide.ts), grouped, with what it is
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/barriers"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
await new Promise((r) => setTimeout(r, 2000));
const res = await p.evaluate(() => {
  const g = street.gta, s = g.solid, nav = street.city.nav;
  const hits = [];
  for (const r of g.roads.rects) {
    const w = r.axis === "x" ? r.z1 - r.z0 : r.x1 - r.x0;
    const len = r.axis === "x" ? r.x1 - r.x0 : r.z1 - r.z0;
    for (const off of [-w / 4, w / 4]) {
      for (let k = 1; k < len - 1; k += 1) {
        const x = r.axis === "x" ? r.x0 + k : r.at + off;
        const z = r.axis === "x" ? r.at + off : r.z0 + k;
        const d = s.dist(x, z);
        const small = !nav.freeSmall(x, z, 0.9);
        if (d < 1.0 || small) hits.push({ x: +x.toFixed(1), z: +z.toFixed(1), top: +(s.topAt(x, z) ?? -9).toFixed(2), d: +d.toFixed(2), small, road: r.name });
      }
    }
  }
  // clusters
  const cl = [];
  for (const h of hits) {
    const c = cl.find((q) => Math.hypot(q.x - h.x, q.z - h.z) < 4);
    if (c) { c.n++; c.top = Math.max(c.top, h.top); c.small ||= h.small; }
    else cl.push({ ...h, n: 1 });
  }
  return { hits: hits.length, clusters: cl.sort((a, b) => b.n - a.n) };
});
fs.writeFileSync(`${OUT}.json`, JSON.stringify(res, null, 1));
console.log("hits", res.hits, "clusters", res.clusters.length);
for (const c of res.clusters.slice(0, 40)) console.log(`${c.road.padEnd(20)} ${String(c.x).padStart(7)},${String(c.z).padStart(7)} n=${String(c.n).padStart(3)} top=${c.top} small=${c.small}`);
await b.close();
