// Where the frame's main-thread time goes: a CPU profile of a few seconds in each scene (the map, on foot,
// a walk-in place), the top functions by self time and by file.
// node shots/bench/frameprof.mjs [url=http://localhost:3014/] [scenes=map,foot,museum,stadium] [cpu=1]
// (against the dev server, names and files read as in the source; cpu=4 throttles the processor, to watch
// the governor of scene/load.ts at work)
import puppeteer from "puppeteer-core";
const BASE = process.argv[2] ?? "http://localhost:3014/";
const SCENES = (process.argv[3] ?? "map,foot,museum,stadium").split(",");
const CPU = Number(process.argv[4] ?? 1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--ignore-certificate-errors"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
await p.goto(BASE + (BASE.includes("?") ? "&" : "?") + "debug&quality=1&theme=day", { timeout: 180000 });
await p.waitForFunction(() => window.__streetUp && window.street?.onFoot, { timeout: 280000, polling: 300 });
const c = await p.createCDPSession();
if (CPU > 1) await c.send("Emulation.setCPUThrottlingRate", { rate: CPU });
await c.send("Profiler.enable");
await c.send("Profiler.setSamplingInterval", { interval: 200 });
await wait(15000);
async function prof(name, ms = 5000) {
  await c.send("Profiler.start");
  await wait(ms);
  const { profile } = await c.send("Profiler.stop");
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  const self = new Map(), file = new Map();
  let busy = 0, all = 0;
  for (const n of profile.nodes) {
    const us = dt.get(n.id) ?? 0; all += us;
    const f = n.callFrame;
    if (f.functionName === "(idle)" || f.functionName === "(program)") continue;
    busy += us;
    const fl = (f.url.split("/").slice(-2).join("/") || f.functionName).replace(/\?.*/, "");
    const k = `${f.functionName || "(anon)"} ${fl}:${f.lineNumber + 1}`;
    self.set(k, (self.get(k) ?? 0) + us); file.set(fl, (file.get(fl) ?? 0) + us);
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${((v / all) * 100).toFixed(1).padStart(5)}%  ${k}`).join("\n");
  const lv = await p.evaluate(() => `tier ${window.street.quality?.level} · processor level ${window.street.load?.level}`);
  console.log(`\n=== ${name}: busy ${((busy / all) * 100).toFixed(0)}% of ${ms} ms (${lv})\n-- by file\n${top(file, 16)}\n-- by function\n${top(self, 28)}`);
}
for (const s of SCENES) {
  if (s === "map") await prof("map");
  else if (s === "foot") {
    await p.evaluate(() => window.street.walk(true)); await wait(3000);
    await p.keyboard.down("KeyW"); await prof("foot"); await p.keyboard.up("KeyW");
    await p.evaluate(() => window.street.walk(false)); await wait(2500);
  } else {
    await p.evaluate((k) => window.street.interiors.enter(k, k === "stadium" ? 1 : 0), s);
    await wait(5000); await prof(s);
    await p.evaluate(() => window.street.interiors.exit());
    await wait(3000);
  }
}
await b.close();
