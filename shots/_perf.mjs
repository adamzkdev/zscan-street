// node shots/_perf.mjs [url] [runs]: how fast the city opens and runs. Per run: time to the first paint,
// to the city up, the boot's own logs (city built, shaders warmed), long tasks, bytes over the wire, the
// JS heap; then real frame times (rAF, no capture) on the map and on foot, and the draw calls.
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/", RUNS = "1"] = process.argv.slice(2);
const W = +(process.env.W ?? 1440), H = +(process.env.H ?? 900);
for (let run = 0; run < +RUNS; run++) {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: W, height: H } });
  const p = await b.newPage();
  const logs = [];
  p.on("console", (m) => /built in|warmed in|quality|\[alive\]|^workers/.test(m.text()) && logs.push(m.text()));
  p.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await p.evaluateOnNewDocument(() => {
    window.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true });
  });
  const t0 = Date.now();
  await p.goto(URL + (URL.includes("?") ? "&" : "?") + "debug", { timeout: 240000 });
  await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 100 });
  const up = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 6000));
  const boot = await p.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const res = performance.getEntriesByType("resource");
    const bytes = res.reduce((a, r) => a + (r.transferSize || 0), 0);
    const big = res.filter((r) => r.transferSize > 200e3).map((r) => `${r.name.split("/").pop().slice(0, 40)} ${(r.transferSize / 1e3).toFixed(0)}kB ${Math.round(r.duration)}ms`);
    const long = window.__long;
    return { fcp: Math.round(fcp), bytes: (bytes / 1e6).toFixed(1) + " MB", requests: res.length, big, longTasks: long.length, longMs: long.reduce((a, l) => a + l[1], 0), worst: long.sort((a, b) => b[1] - a[1]).slice(0, 5), heap: Math.round(performance.memory.usedJSHeapSize / 1e6) + " MB" };
  });
  // real frames: rAF intervals over 4 s
  const frames = async (label) => {
    const r = await p.evaluate(
      () =>
        new Promise((res) => {
          const d = [];
          let last = performance.now();
          const end = last + 4000;
          const info = street.renderer.info.render;
          const tick = (t) => {
            d.push(t - last);
            last = t;
            if (t < end) requestAnimationFrame(tick);
            else {
              d.sort((a, b) => a - b);
              res({ fps: (d.length / 4).toFixed(0), p50: d[Math.floor(d.length / 2)].toFixed(1), p95: d[Math.floor(d.length * 0.95)].toFixed(1), max: d[d.length - 1].toFixed(0), calls: info.calls, tris: (info.triangles / 1e6).toFixed(2) + "M" });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`  ${label.padEnd(8)} fps ${r.fps}  p50 ${r.p50}ms  p95 ${r.p95}ms  max ${r.max}ms  calls ${r.calls}  tris ${r.tris}`);
  };
  console.log(`run ${run + 1}: up ${(up / 1000).toFixed(1)}s  fcp ${boot.fcp}ms  ${boot.bytes} in ${boot.requests} requests  heap ${boot.heap}  long tasks ${boot.longTasks} (${boot.longMs} ms, worst ${JSON.stringify(boot.worst)})`);
  console.log("  " + logs.join(" | "));
  console.log("  big: " + boot.big.join(", "));
  await frames("map");
  await p.evaluate(() => street.walk(true));
  await new Promise((r) => setTimeout(r, 2500));
  await frames("on foot");
  await p.evaluate(() => street.walk(false));
  await p.evaluate(() => street.enter("museum"));
  await new Promise((r) => setTimeout(r, 4000));
  await frames("museum");
  await b.close();
}
