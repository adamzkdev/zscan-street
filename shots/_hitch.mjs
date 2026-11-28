// node shots/_hitch.mjs: long frames in the game (> 60 ms) over SECS seconds after the city is up: when, how long,
// and the frame's busiest parts (a CPU profile around the worst). ENV: SECS, SPOT=x,z
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const SECS = +(process.env.SECS ?? 40);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready, { timeout: 300000, polling: 300 });
const [sx, sz] = (process.env.SPOT ?? "122,-1").split(",").map(Number);
const cdp = await p.target().createCDPSession();
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
await cdp.send("Profiler.start");
const t0 = Date.now();
await p.evaluate((x, z) => { const g = street.gta; g.hud.coach(-1); g.player.place(x + 9, 0.2, z + 9, 0); g.cam.behind(0, -0.1); g.cam.snap(g.player.pos.clone().setY(1.55)); window.__placed = performance.now(); }, sx, sz);
const longs = await p.evaluate(async (secs) => {
  const out = [];
  let last = -1;
  await new Promise((done) => {
    const f = (now) => {
      if (last > 0 && now - last > 60) out.push([+((last - window.__placed) / 1000).toFixed(2), +(now - last).toFixed(0)]);
      last = now;
      if (now - window.__placed < secs * 1000) requestAnimationFrame(f);
      else done();
    };
    requestAnimationFrame(f);
  });
  return out;
}, SECS);
const { profile } = await cdp.send("Profiler.stop");
console.log("long frames [s after placing, ms]:", JSON.stringify(longs));
// the heaviest self-time functions over the run
const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dts = profile.timeDeltas;
const counts = new Map();
profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) ?? 0) + (dts[i] ?? 0)));
for (const [id, us] of counts) {
  const n = byId.get(id);
  const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/")}:${n.callFrame.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + us);
}
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${(us / 1000).toFixed(0)}ms ${k}`).join("\n"));
fs.writeFileSync("/private/tmp/claude-501/-Users-adam-Documents-GitHub-zcash/503f98e9-812c-4daf-9fe6-4bcd7fbed3c5/scratchpad/hitch.cpuprofile", JSON.stringify(profile));
await b.close();
