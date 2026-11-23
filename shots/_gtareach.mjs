// node shots/_gtareach.mjs [URL] [OUT]: can a car reach every road? A flood fill over where the car fits (src/gta/collide.ts), every lane checked, the stuck spots listed and drawn
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo", OUT = "shots/gta/reach"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 240000, polling: 300 });
await new Promise((r) => setTimeout(r, 1500));
const res = await p.evaluate(() => {
  const g = street.gta, s = g.solid, R = g.roads;
  const C = 1, x0 = -240, z0 = -240, N = 480;
  const ok = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) ok[j * N + i] = s.drivable(x0 + i + 0.5, z0 + j + 0.5, 1.0) ? 1 : 0;
  // from the avenue in front of the MEMPOOL HQ
  const seen = new Uint8Array(N * N);
  const start = (Math.floor(1.4 - z0)) * N + Math.floor(20 - x0);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const k = q.pop();
    const i = k % N, j = (k / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (seen[nk] || !ok[nk]) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  // every lane centre of every road: reached?
  const bad = [];
  let total = 0;
  for (const r of R.rects) {
    const w = r.axis === "x" ? r.z1 - r.z0 : r.x1 - r.x0;
    const len = r.axis === "x" ? r.x1 - r.x0 : r.z1 - r.z0;
    for (const off of [-w / 4, w / 4])
      for (let k = 2; k < len - 2; k += 2) {
        const x = r.axis === "x" ? r.x0 + k : r.at + off, z = r.axis === "x" ? r.at + off : r.z0 + k;
        const i = Math.floor(x - x0), j = Math.floor(z - z0);
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        total++;
        if (!seen[j * N + i]) bad.push({ x: +x.toFixed(1), z: +z.toFixed(1), road: r.name, fits: !!ok[j * N + i] });
      }
  }
  // every square metre of asphalt: anything standing on it?
  const onRoad = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + i + 0.5, z = z0 + j + 0.5;
    // (a metre in from the road's edge: the kerb line itself is not the road)
    if (R.road(x, z) && R.road(x + 1, z) && R.road(x - 1, z) && R.road(x, z + 1) && R.road(x, z - 1) && s.dist(x, z) < 0.1) onRoad.push({ x, z });
  }
  const oc = [];
  for (const h of onRoad) { const q2 = oc.find((x) => Math.hypot(x.x - h.x, x.z - h.z) < 8); if (q2) q2.n++; else oc.push({ ...h, n: 1 }); }
  // a picture: reached (grey), drivable but cut off (orange), blocked (dark), lanes not reached (red)
  const c = document.createElement("canvas");
  c.width = c.height = N * 2;
  const gx = c.getContext("2d");
  const img = gx.createImageData(N, N);
  for (let k = 0; k < N * N; k++) {
    const v = seen[k] ? [150, 150, 158] : ok[k] ? [230, 140, 40] : [24, 26, 32];
    img.data.set([...v, 255], k * 4);
  }
  const t = document.createElement("canvas");
  t.width = t.height = N;
  t.getContext("2d").putImageData(img, 0, 0);
  gx.imageSmoothingEnabled = false;
  gx.drawImage(t, 0, 0, N * 2, N * 2);
  gx.fillStyle = "#ff2a2a";
  for (const b of bad) gx.fillRect((b.x - x0) * 2 - 2, (b.z - z0) * 2 - 2, 4, 4);
  const cl = [];
  for (const h of bad) {
    const q2 = cl.find((x) => Math.hypot(x.x - h.x, x.z - h.z) < 10 && x.road === h.road);
    if (q2) q2.n++;
    else cl.push({ ...h, n: 1 });
  }
  return { onRoad: onRoad.length, onRoadClusters: oc.sort((a, b) => b.n - a.n).slice(0, 25), total, bad: bad.length, clusters: cl.sort((a, b) => b.n - a.n).slice(0, 40), png: c.toDataURL("image/png") };
});
fs.writeFileSync(`${OUT}.png`, Buffer.from(res.png.split(",")[1], "base64"));
console.log(`lane points ${res.total}, not reachable ${res.bad}`);
console.log(`asphalt m² with something standing on it: ${res.onRoad}`);
for (const c of res.onRoadClusters) console.log(`  on road ${c.x},${c.z} n=${c.n}`);
for (const c of res.clusters) console.log(`${c.road.padEnd(20)} ${c.x},${c.z} n=${c.n} fits=${c.fits}`);
await b.close();
