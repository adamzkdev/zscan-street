// node shots/_gtaroadjunk.mjs [URL] [OUT]: everything that stands on the asphalt (from the game's solid field), clustered, listed, and photographed
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3061/?debug&gta=1192&theme=day", OUT = "shots/gta/junk/j"] = process.argv.slice(2);
const SHOTS = Number(process.env.SHOTS ?? 24);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  const F = function (u, pr) {
    if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return pr === undefined ? new W(u) : new W(u, pr);
  };
  F.prototype = W.prototype;
  Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = F;
});
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
// the far city streams in: build the field again once it is there
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate(() => street.gta.solid.build());
const found = await p.evaluate(() => {
  const s = street.gta.solid;
  const N = s.size, top = s.top, host = s.host;
  const MIN = Number(window.__junkMin ?? 0.3);
  const hit = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = s.z0 + (j + 0.5) * s.cell;
    for (let i = 0; i < N; i++) {
      const x = s.x0 + (i + 0.5) * s.cell;
      if (!host.road(x, z)) continue;
      // well inside the asphalt (not what stands at its edge: a kerb, a facade at the line)
      const m = 0.9;
      if (!host.road(x + m, z) || !host.road(x - m, z) || !host.road(x, z + m) || !host.road(x, z - m)) continue;
      const t = top[j * N + i];
      if (t === t && t > host.surface(x, z) + MIN) hit[j * N + i] = 1;
    }
  }
  const lab = new Int32Array(N * N);
  const out = [];
  let id = 0;
  const st = [];
  for (let k0 = 0; k0 < N * N; k0++) {
    if (!hit[k0] || lab[k0]) continue;
    id++;
    st.push(k0);
    lab[k0] = id;
    let n = 0, sx = 0, sz = 0, hi = -9, i0 = N, i1 = 0, j0 = N, j1 = 0;
    while (st.length) {
      const k = st.pop();
      const i = k % N, j = (k / N) | 0;
      n++;
      sx += i;
      sz += j;
      hi = Math.max(hi, top[k]);
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (hit[nk] && !lab[nk]) { lab[nk] = id; st.push(nk); }
      }
    }
    const x = s.x0 + (sx / n + 0.5) * s.cell, z = s.z0 + (sz / n + 0.5) * s.cell;
    out.push({ x: +x.toFixed(1), z: +z.toFixed(1), w: +((i1 - i0 + 1) * s.cell).toFixed(1), d: +((j1 - j0 + 1) * s.cell).toFixed(1), area: +(n * s.cell * s.cell).toFixed(1), h: +hi.toFixed(2), street: street.gta.roads.where(x, z).street });
  }
  return out.sort((a, b) => b.area - a.area);
});
console.log("clusters on asphalt:", found.length);
for (const f of found.slice(0, 120)) console.log(JSON.stringify(f));
const fs = await import("node:fs");
fs.writeFileSync(OUT + "-list.json", JSON.stringify(found, null, 1));
await p.evaluate(() => { street.gta.hud.coach(-1); document.querySelector(".gta-hud").style.display = "none"; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
for (const f of found.slice(0, SHOTS)) {
  await p.evaluate((f) => {
    const g = street.gta;
    // stand 7 m off it along the street, looking at it
    for (const [dx, dz] of [[7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, -5]]) {
      const px = f.x + dx, pz = f.z + dz;
      if (!g.host.footBlocked(px, pz)) {
        const h = Math.atan2(-(f.x - px), -(f.z - pz));
        g.player.place(px, 0.2, pz, h);
        g.cam.behind(h, -0.32);
        g.cam.snap(g.player.pos.clone().setY(1.55));
        return;
      }
    }
  }, f);
  await sleep(1400);
  await p.screenshot({ path: `${OUT}-${String(++n).padStart(2, "0")}.png` });
}
console.log("errors", errs.length, errs.slice(0, 5).join("\n"));
await b.close();
