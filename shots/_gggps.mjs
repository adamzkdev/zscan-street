// node shots/_gggps.mjs: the GPS's way over the big Golden Gate (city → Orchard Beach, Orchard Keys → the Heart), and the
// bridge's traffic both ways (cars on each lane, how far they get along the deck)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day&solo");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const r = await p.evaluate(() => {
  const g = street.gta;
  const sum = (path) => {
    if (!path) return null;
    let len = 0, onBridge = 0, maxZ = -1e9, minZ = 1e9;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], c = path[i];
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      len += d;
      if (Math.abs((a.x + c.x) / 2 - 158) < 12 && (a.z + c.z) / 2 > 150 && (a.z + c.z) / 2 < 600) onBridge += d;
      maxZ = Math.max(maxZ, c.z); minZ = Math.min(minZ, c.z);
    }
    return { pts: path.length, len: Math.round(len), overBridge: Math.round(onBridge), z: [Math.round(minZ), Math.round(maxZ)] };
  };
  return { south: sum(g.roads.gps(0, 4, 206, 860)), north: sum(g.roads.gps(206, 860, 0, 4)), woods: sum(g.roads.gps(-60, 60, 190, 594)) };
});
console.log("gps", JSON.stringify(r));
// the bridge's own traffic: sample for 40 s
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
await p.evaluate(() => { const g = street.gta; g.player.place(172.4, 18.6, 375, Math.PI); g.cam.behind(Math.PI, 0.1); });
// (on the deck: |x - 158| < 12, between the abutments; which way each goes from how its z moves)
const seen = new Map();
for (let k = 0; k < 20; k++) {
  await sleep(2000);
  const cars = await p.evaluate(() => street.goldenGate.cars.map((c) => ({ id: c.obj.id, x: c.x, z: c.z })));
  for (const c of cars) {
    if (Math.abs(c.x - 158) > 12 || c.z < 150 || c.z > 600) continue;
    const o = seen.get(c.id) ?? { first: c.z, last: c.z, n: 0 };
    o.last = c.z;
    o.n++;
    seen.set(c.id, o);
  }
}
const all = [...seen.values()].filter((o) => o.n > 1);
const south = all.filter((o) => o.last > o.first + 1), north = all.filter((o) => o.last < o.first - 1);
console.log("on the deck over 40 s:", all.length, "cars; southbound", south.length, "northbound", north.length, "stopped", all.length - south.length - north.length, "; went ≥ 150 m", all.filter((o) => Math.abs(o.last - o.first) >= 150).length);
console.log("errors", errs.length, errs.slice(0, 4).join("\n"));
await b.close();
