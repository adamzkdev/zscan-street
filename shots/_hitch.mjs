// node shots/_hitch.mjs [port=3023]: CPU profile while flying over every AREA, and the long frames
import puppeteer from "puppeteer-core";
const port = Number(process.argv[2] ?? 3023);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const cdp = await p.target().createCDPSession();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
for (let k = 0; k < 60 && !(await p.evaluate(() => !!window.street).catch(() => false)); k++) await wait(1000);
await wait(12000);
await p.evaluate(() => {
  window.__long = [];
  let last = performance.now();
  const f = (now) => {
    if (now - last > 100) window.__long.push(Math.round(now - last));
    last = now;
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
const AREAS = [[-37, 2, 1.1], [0, -82, 0.55], [-86, -82, 0.6], [-175, -82, 0.5], [-112, 10, 0.65], [130, 0, 0.5], [120, -120, 0.4], [170, 100, 0.5], [-175, 104, 0.5], [0, 104, 0.75], [-160, -193, 0.55], [86, -193, 0.55], [-195, 190, 0.45], [20, 190, 0.35], [192, 212, 0.6]];
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
await cdp.send("Profiler.start");
for (const [x, z, zoom] of AREAS) {
  await p.evaluate((a) => street.rig.district(new (street.rig.focus.constructor)(a[0], 1, a[1]), a[2]), [x, z, zoom]);
  await wait(2500);
}
await p.evaluate(() => street.rig.setMode("overview"));
await wait(3000);
const { profile } = await cdp.send("Profiler.stop");
console.log("long frames", await p.evaluate(() => window.__long.join(" ")));
const self = new Map();
const dt = profile.timeDeltas;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const incl = new Map();
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const f = n.callFrame;
  const k = `${f.functionName || "(anon)"}:${f.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0));
  const seen = new Set();
  for (let q = id; q !== undefined; q = parent.get(q)) {
    const g = byId.get(q).callFrame;
    const kk = `${g.functionName || "(anon)"}:${g.lineNumber + 1}`;
    if (seen.has(kk)) continue;
    seen.add(kk);
    incl.set(kk, (incl.get(kk) ?? 0) + (dt[i] ?? 0));
  }
});
console.log("SELF (ms)");
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ${k}`);
console.log("INCLUSIVE (ms)");
for (const [k, v] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ${k}`);
await b.close();
