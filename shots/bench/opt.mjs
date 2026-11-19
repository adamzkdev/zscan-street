// The optimisation bench, on the production build (shots/bench/prodserve.mjs, https://localhost:3015):
//   node shots/bench/opt.mjs boot <cold|warm> <fast|slow> [runs=3]
//     time to the street being up (window.__streetUp) and to the boot screen gone, first paint, what
//     loads (JS and all), long tasks, the JS heap. cold: an empty profile; warm: a first visit fills
//     the HTTP cache and the city cache (IndexedDB), then the measured one. slow = CPU 4× (OPT_RATE)
//     and 1.6 Mbps / 150 ms
//   node shots/bench/opt.mjs fps <fast|slow> [runs=1]
//     the map, on foot, the museum and the stadium: fps, frame time p50/p95/p99, main-thread ms per
//     frame (wall, and cpuMsPerFrame: the main thread's own CPU time, which other processes' load
//     hardly changes), draw calls, triangles, textures, geometries, the quality tier and the
//     processor's governor level (scene/quality.ts, scene/load.ts); the JS heap after the tour
//     (OPT_Q: more of the query, e.g. "&cpu=4" to hold the processor governor at a level)
// prints one JSON line per run and a median summary. OPT_URL to point it elsewhere (e.g. a vite preview).
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [mode = "boot", a = "cold", b = "fast", c = "3"] = process.argv.slice(2);
const BASE = process.env.OPT_URL ?? "https://localhost:3015/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (xs) => { const s = xs.filter((x) => x != null).sort((p, q) => p - q); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
// (the server's self-signed certificate trusted by its key: with --ignore-certificate-errors Chrome
// keeps nothing in its HTTP cache, and a second visit or a second worker loaded everything again)
const CERT = "node_modules/.cache/prodserve/cert.pem";
const SPKI = existsSync(CERT) ? execSync(`openssl x509 -in ${CERT} -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`).toString().trim() : "";
const launch = (dir) =>
  puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    protocolTimeout: 600000,
    userDataDir: dir,
    args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-precise-memory-info", ...(SPKI ? [`--ignore-certificate-errors-spki-list=${SPKI}`] : []), "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
    defaultViewport: { width: 1440, height: 900 },
  });
async function throttle(p, slow) {
  const s = await p.createCDPSession();
  if (!slow) return s;
  await s.send("Network.enable");
  await s.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6e6 / 8) | 0, uploadThroughput: (0.75e6 / 8) | 0 });
  // (OPT_RATE: another slowdown, e.g. 2 for a mid-range laptop)
  await s.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.OPT_RATE ?? 4) });
  return s;
}

async function boot(kind, speed, runs) {
  const out = [];
  for (let i = 0; i < runs; i++) {
    const dir = mkdtempSync(join(tmpdir(), "optboot-"));
    if (kind === "warm") {
      // a first visit, unthrottled, fills the caches (the workers' cache writes commit meanwhile)
      const br = await launch(dir);
      const p = await br.newPage();
      await p.goto(BASE, { timeout: 180000 });
      await p.waitForFunction(() => window.__streetUp, { timeout: 280000, polling: 200 });
      await wait(8000);
      await br.close();
    }
    const br = await launch(dir);
    const p = await br.newPage();
    const errs = [];
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
    p.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 160)));
    await p.evaluateOnNewDocument(() => {
      window.__long = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: "longtask", buffered: true });
    });
    await throttle(p, speed === "slow");
    const t0 = Date.now();
    await p.goto(BASE, { timeout: 280000, waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => window.__streetUp, { timeout: 580000, polling: 100 });
    const up = Date.now() - t0;
    await p.waitForFunction(() => !document.getElementById("boot") || document.getElementById("boot").dataset.gone, { timeout: 120000, polling: 100 });
    const gone = Date.now() - t0;
    await wait(3000);
    const r = await p.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      const res = performance.getEntriesByType("resource");
      const fp = performance.getEntriesByName("first-contentful-paint")[0];
      const kb = (xs) => Math.round(xs.reduce((s, x) => s + (x.transferSize || 0), 0) / 1024);
      const js = res.filter((x) => /\.js($|\?)/.test(x.name));
      return { fcp: fp ? Math.round(fp.startTime) : null, dcl: Math.round(n.domContentLoadedEventEnd), jsN: js.length, jsKB: kb(js), allKB: kb(res), resN: res.length, longMs: Math.round(window.__long), heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6), ext: [...new Set(res.filter((x) => !x.name.startsWith(location.origin)).map((x) => new URL(x.name).host))] };
    });
    const row = { kind, speed, upMs: up, goneMs: gone, ...r, errors: errs.slice(0, 6) };
    console.log(JSON.stringify(row));
    out.push(row);
    await br.close();
    rmSync(dir, { recursive: true, force: true });
  }
  const sum = { kind, speed, runs, upMs: med(out.map((o) => o.upMs)), goneMs: med(out.map((o) => o.goneMs)), fcp: med(out.map((o) => o.fcp)), dcl: med(out.map((o) => o.dcl)), jsKB: med(out.map((o) => o.jsKB)), allKB: med(out.map((o) => o.allKB)), longMs: med(out.map((o) => o.longMs)), heapMB: med(out.map((o) => o.heapMB)), errors: out.flatMap((o) => o.errors).length };
  console.log("SUMMARY " + JSON.stringify(sum));
}

async function measure(p, cdp, ms = 6000) {
  // (draw calls and triangles of a whole frame: every pass of the composer, summed between two frames)
  await p.evaluate(() => {
    const r = window.street.composer.renderer;
    if (r.__sum) return;
    r.__sum = { calls: 0, tris: 0, frames: 0 };
    const render = r.render.bind(r);
    r.render = (s, c) => { render(s, c); r.__sum.calls += r.info.render.calls; r.__sum.tris += r.info.render.triangles; };
    const f = () => { r.__sum.frames++; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await p.evaluate(() => Object.assign(window.street.composer.renderer.__sum, { calls: 0, tris: 0, frames: 0 }));
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const r = await p.evaluate((ms) => new Promise((done) => {
    const dts = []; let last = performance.now(); const t0 = last;
    const f = (t) => { dts.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else done(dts.slice(2)); };
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(f); });
  }), ms);
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const s = [...r].sort((x, y) => x - y);
  const total = r.reduce((x, y) => x + y, 0);
  const info = await p.evaluate(() => { const r = window.street.composer.renderer; const i = r.info; const s = r.__sum; return { calls: Math.round(s.calls / Math.max(1, s.frames)), ktris: Math.round(s.tris / Math.max(1, s.frames) / 1000), tex: i.memory.textures, geo: i.memory.geometries, programs: i.programs?.length ?? 0, tier: window.street.quality?.level ?? null, cpu: window.street.load?.level ?? null }; });
  return { fps: Math.round((r.length * 1000) / total), p50: +s[Math.floor(s.length * 0.5)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), p99: +s[Math.floor(s.length * 0.99)].toFixed(1), mainMsPerFrame: +(((m1.TaskDuration - m0.TaskDuration) * 1000) / r.length).toFixed(1), cpuMsPerFrame: +(((m1.ThreadTime - m0.ThreadTime) * 1000) / r.length).toFixed(2), ...info };
}

async function fps(speed, runs) {
  const all = [];
  for (let i = 0; i < runs; i++) {
    const dir = mkdtempSync(join(tmpdir(), "optfps-"));
    const br = await launch(dir);
    const p = await br.newPage();
    const errs = [];
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
    p.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 160)));
    // (OPT_SEED: Math.random seeded, the same people and paints for every build compared)
    if (process.env.OPT_SEED) await p.evaluateOnNewDocument((seed) => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, Number(process.env.OPT_SEED));
    // (the default tier held, the day pinned: frames compared at the same quality and light)
    await p.goto(BASE + "?debug&quality=1&theme=day" + (process.env.OPT_Q ?? ""), { timeout: 180000 });
    await p.waitForFunction(() => window.__streetUp && window.street?.onFoot, { timeout: 280000, polling: 300 });
    const cdp = await throttle(p, speed === "slow");
    await cdp.send("Performance.enable");
    await wait(20000);
    const row = { speed };
    row.map = await measure(p, cdp);
    await p.evaluate(() => window.street.walk(true)); await wait(3000);
    await p.keyboard.down("KeyW"); await wait(500);
    row.foot = await measure(p, cdp);
    await p.keyboard.up("KeyW");
    await p.evaluate(() => window.street.walk(false)); await wait(2500);
    for (const [k, floor] of [["museum", 0], ["stadium", 1]]) {
      await p.evaluate((k, f) => window.street.interiors.enter(k, f), k, floor);
      await wait(5000);
      row[k] = await measure(p, cdp);
      await p.evaluate(() => window.street.interiors.exit());
      await wait(3000);
    }
    await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
    row.heapMB = await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6));
    row.errors = errs.slice(0, 6);
    console.log(JSON.stringify(row));
    all.push(row);
    await br.close();
    rmSync(dir, { recursive: true, force: true });
  }
  const sum = { speed, runs };
  for (const k of ["map", "foot", "museum", "stadium"]) if (all[0][k]) sum[k] = Object.fromEntries(Object.keys(all[0][k] ?? {}).map((f) => [f, med(all.map((r) => r[k]?.[f]))]));
  sum.heapMB = med(all.map((r) => r.heapMB));
  console.log("SUMMARY " + JSON.stringify(sum));
}

if (mode === "boot") await boot(a, b, Number(c));
else await fps(a, Number(b) || 1);
