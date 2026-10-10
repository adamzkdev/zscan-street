// node shots/_peak.mjs [seconds after boot]: peak memory of a phone opening the city (iPhone landscape, 4× CPU slowdown).
// Every 250 ms: JS heap (performance.memory, in page), renderer.info once the city is up, and the real
// resident memory of the page's renderer and of Chrome's GPU process (ps over the browser's children).
// PORT (3008), QS (extra query) and DESKTOP=1 (no phone emulation) are read from the environment.
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
const after = Number(process.argv[2] ?? 20);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const p = await b.newPage();
if (!process.env.DESKTOP) await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
const cdp = await p.createCDPSession();
if (!process.env.DESKTOP) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await cdp.send("Performance.enable");
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => /context|error|fail/i.test(m.text()) && errs.push(m.text().slice(0, 160)));

const root = b.process().pid;
/** RSS (MB) of the renderer(s) and the GPU process under this browser. */
function rss() {
  const rows = execSync("ps -A -o pid=,ppid=,rss=,command=", { maxBuffer: 1 << 26 }).toString().trim().split("\n").map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return m && { pid: +m[1], ppid: +m[2], rss: +m[3] / 1024, cmd: m[4] };
  }).filter(Boolean);
  const mine = new Set([root]);
  for (let k = 0; k < 4; k++) for (const r of rows) if (mine.has(r.ppid)) mine.add(r.pid);
  let renderer = 0, gpu = 0, all = 0;
  for (const r of rows) {
    if (!mine.has(r.pid)) continue;
    all += r.rss;
    if (/--type=renderer/.test(r.cmd)) renderer += r.rss;
    else if (/--type=gpu-process/.test(r.cmd)) gpu += r.rss;
  }
  return { renderer: Math.round(renderer), gpu: Math.round(gpu), all: Math.round(all) };
}

const peak = { heap: 0, v8: 0, ab: 0, renderer: 0, gpu: 0, sum: 0, all: 0, geo: 0, tex: 0 };
const series = [];
let tUp = 0;
const t0 = Date.now();
let stop = false;
const poll = (async () => {
  while (!stop) {
    const s = { t: (Date.now() - t0) / 1000 };
    try {
      Object.assign(s, await p.evaluate(() => {
        const r = { heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, up: !!window.street };
        const i = window.street?.renderer?.info;
        if (i) Object.assign(r, { geo: i.memory.geometries, tex: i.memory.textures });
        return r;
      }));
    } catch {}
    try {
      const h = await cdp.send("Runtime.getHeapUsage");
      s.v8 = Math.round(h.usedSize / 1e6);
      if (h.backingStorageSize !== undefined) s.ab = Math.round(h.backingStorageSize / 1e6);
    } catch {}
    Object.assign(s, rss());
    for (const k of ["heap", "v8", "ab", "renderer", "gpu", "all", "geo", "tex"]) if ((s[k] ?? 0) > peak[k]) peak[k] = s[k];
    if (s.renderer + s.gpu > peak.sum) peak.sum = s.renderer + s.gpu;
    if (s.up && !tUp) tUp = s.t;
    series.push(s);
    await new Promise((r) => setTimeout(r, 250));
  }
})();
await p.goto(`http://localhost:${process.env.PORT ?? 3008}/?debug${process.env.QS ?? ""}`, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.street, { timeout: 600000, polling: 500 });
await new Promise((r) => setTimeout(r, after * 1000));
stop = true;
await poll;
const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
const last = series.slice(-8);
const avg = (k) => Math.round(last.reduce((a, s) => a + (s[k] ?? 0), 0) / last.length);
// a coarse timeline (every ~2 s) to see where the peak sits
const tl = series.filter((_, i) => i % 8 === 0).map((s) => `${s.t.toFixed(0)}s h${s.heap} v${s.v8} ab${s.ab} r${s.renderer} g${s.gpu}${s.up ? "*" : ""}`).join("  ");
console.log("timeline:", tl);
console.log(JSON.stringify({ cityUp: tUp, peak, steady: { heap: avg("heap"), v8: avg("v8"), ab: avg("ab"), renderer: avg("renderer"), gpu: avg("gpu"), sum: avg("renderer") + avg("gpu") }, jsHeapUsedMB: Math.round(m.JSHeapUsedSize / 1e6), nodes: m.Nodes }));
if (errs.length) console.log(errs.slice(0, 10).join("\n"));
await b.close();
