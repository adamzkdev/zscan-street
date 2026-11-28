// node shots/_gtaentries.mjs [URL]: can you walk from the street to every place's door (src/gta)? A flood fill on foot (the game's own rules) from the nearest road to within reach of the door.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day&solo"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && window.street.gta.doorsReady, { timeout: 600000, polling: 300 });
await new Promise((r) => setTimeout(r, 2500));
const res = await p.evaluate(() => {
  const g = street.gta, h = g.host, s = g.solid;
  // the game's own rule on foot, standing at floor height f
  const free = (x, z, f) => {
    if (g.doorway(x, z)) { const t = s.topAt(x, z); return t === t && t > -0.35; }
    // (the street's own rule there compares with the walker's floor: the floor the fill stands on)
    if (h.footSpecial(x, z)) { const was = h.walker.floorY; h.walker.floorY = f; const ok = !h.footBlocked(x, z); h.walker.floorY = was; return ok; }
    return s.foot(x, z, f).ok && !h.footSmall(x, z);
  };
  // (as the game: a place's own floors first — the opera's steps up to its door — then a doorway's steps)
  const floorAt = (x, z, f) => {
    const gg = h.ground(x, z);
    if (gg !== null) return gg;
    if (g.doorway(x, z)) { const t = s.topAt(x, z); return t < f + 1.05 ? Math.max(-0.05, t) : f; }
    const r = s.foot(x, z, f);
    return r.ok ? Math.max(-0.05, r.floor) : f;
  };
  const out = [];
  for (const d of g.placeSpots) {
    // (an island's place: from its ferry's landing stage)
    const ferry = g.ferries.find((f) => f.key === `ferry:${d.key}:back`);
    const st = ferry ? { x: ferry.x, z: ferry.z } : g.roads.nearest(d.x + d.fx * 6, d.z + d.fz * 6);
    const C = 0.5, R = 60, N = (2 * R) / C;
    const ox = d.x - R, oz = d.z - R;
    const seen = new Map();
    const key = (i, j) => j * N + i;
    const si = Math.round((st.x - ox) / C), sj = Math.round((st.z - oz) / C);
    const q = [[si, sj, floorAt(st.x, st.z, 0)]];
    seen.set(key(si, sj), 1);
    let ok = false, best = 99;
    while (q.length) {
      const [i, j, f] = q.shift();
      const x = ox + i * C, z = oz + j * C;
      const dd = Math.hypot(x - d.x, z - d.z);
      best = Math.min(best, dd);
      if (dd < 3.2) { ok = true; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N || seen.has(key(ni, nj))) continue;
        const nx = ox + ni * C, nz = oz + nj * C;
        if (!free(nx, nz, f)) continue;
        seen.set(key(ni, nj), 1);
        q.push([ni, nj, floorAt(nx, nz, f)]);
      }
      if (seen.size > 60000) break;
    }
    let far = null;
    if (!ok) { let bd = 1e9; for (const k of seen.keys()) { const i = k % N, j = (k / N) | 0; const dd = Math.hypot(ox + i * C - d.x, oz + j * C - d.z); if (dd < bd) { bd = dd; far = [+(ox + i * C).toFixed(1), +(oz + j * C).toFixed(1)]; } } }
    out.push({ key: d.key, far, start: [+st.x.toFixed(1), +st.z.toFixed(1)], ok, best: +best.toFixed(1), door: [+d.x.toFixed(1), +d.z.toFixed(1)], f: [d.fx.toFixed(0), d.fz.toFixed(0)] });
  }
  return out;
});
const bad = res.filter((r) => !r.ok);
console.log(`doors ${res.length}, cannot be reached on foot: ${bad.length} (islands by ferry)`);
for (const r of bad) console.log(`  ${r.key.padEnd(14)} ${r.best} m short (door ${r.door}, facing ${r.f}) from ${r.start}, got to ${r.far}`);
await b.close();
