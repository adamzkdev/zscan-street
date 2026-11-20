// Why the city lags: frame times, long frames and what fills them, and what grows while it lives.
// Against the production build (shots/bench/prodserve.mjs; build with `npx vite build --sourcemap` and
// the long frames and profiles are named by source file and line).
//
//   node shots/bench/lag.mjs frames [key=value…]
//     phases (default map-day,map-night,foot-day,foot-night), each `secs` long (60): frame time
//     p50/p95/p99, frames over 50 and 100 ms per minute, long tasks, the long animation frames' scripts
//     (what ran in them, by source), draw calls and triangles per frame, the quality tier and the
//     processor's governor level. prof=1: a CPU profile of each phase, top functions by self time.
//   node shots/bench/lag.mjs soak [key=value…]
//     the map view left open `min` minutes (15) with the real blocks arriving, a sample every `every`
//     seconds (60): frame times, the JS heap after a GC, geometries/textures/programs, DOM nodes and
//     listeners, timers pending (by caller), scene objects, the street's people and vehicles; then
//     `burst` made-up blocks (30) fed at 3 a second (the indexer catching up) and `after` minutes (3)
//     watched again: does everything come back down?
// keys: url (https://localhost:3015/), vp (desk|portrait|landscape), cpu (CPU throttling rate, 1),
//       q (quality tier pinned: 1 by default, `auto` for the governor's), secs, phases, prof, min, every,
//       burst, after, json=<file>, at=x,z,yaw (on foot: the same start every run), theme (soak: day or
//       night throughout), verbose (soak: timers, listeners, the avenue and its people every sample),
//       domwho (soak: the elements kept in memory out of the page, at the end), track (frames: timers)
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

const [mode = "frames", ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.split("=")).map(([k, v]) => [k, v ?? "1"]));
const URL0 = opt.url ?? "https://localhost:3015/";
const VP = opt.vp ?? "desk";
const CPU = Number(opt.cpu ?? 1);
const Q = opt.q ?? "1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = {
  desk: { width: 1440, height: 900 },
  portrait: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  landscape: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 3, isLandscape: true },
}[VP];
const CERT = "node_modules/.cache/prodserve/cert.pem";
const SPKI = existsSync(CERT) ? execSync(`openssl x509 -in ${CERT} -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`).toString().trim() : "";
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  protocolTimeout: 900000,
  args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--ignore-certificate-errors", ...(SPKI ? [`--ignore-certificate-errors-spki-list=${SPKI}`] : []), "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: VIEW,
});
const p = await b.newPage();
if (VIEW.isMobile) await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");
const cdp = await p.createCDPSession();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text().slice(0, 200)));

// ---- in the page, from the first script on: long tasks, long animation frames, timers, rAF callbacks ----
await p.evaluateOnNewDocument((track) => {
  const L = (window.__lag = { long: [], loaf: [], raf: 0, rafFrames: 0 });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) L.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.duration < 50) continue;
        L.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), scripts: e.scripts.map((s) => ({ d: Math.round(s.duration), inv: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, url: s.sourceURL, pos: s.sourceCharPosition, layout: Math.round(s.forcedStyleAndLayoutDuration) })) });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {}
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => (L.raf++, raf(fn));
  const count = () => (L.rafFrames++, raf(count));
  raf(count);
  if (!track) return;
  // timers pending, by the line that asked for them
  const T = (window.__timers = { to: new Map(), iv: new Map(), calls: 0 });
  const where = () => {
    const s = (new Error().stack ?? "").split("\n");
    for (let i = 3; i < s.length; i++) if (!/sleep|new Promise|<anonymous>/.test(s[i])) return s[i].trim();
    return (s[3] ?? "").trim();
  };
  const st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window), si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setTimeout = (fn, ms, ...a) => {
    T.calls++;
    const id = st((...x) => (T.to.delete(id), typeof fn === "function" ? fn(...x) : 0), ms, ...a);
    T.to.set(id, where());
    return id;
  };
  window.clearTimeout = (id) => (T.to.delete(id), ct(id));
  window.setInterval = (fn, ms, ...a) => {
    const id = si(fn, ms, ...a);
    T.iv.set(id, where());
    return id;
  };
  window.clearInterval = (id) => (T.iv.delete(id), ci(id));
  // listeners added and not removed, by type
  const E = (window.__listen = new Map());
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (t, f, o) {
    E.set(t, (E.get(t) ?? 0) + 1);
    return add.call(this, t, f, o);
  };
  EventTarget.prototype.removeEventListener = function (t, f, o) {
    E.set(t, (E.get(t) ?? 0) - 1);
    return rem.call(this, t, f, o);
  };
}, mode === "soak" || !!opt.track);

// ---- source maps: a bundle position back to the source (when the build has them) ----
const maps = new Map();
async function mapOf(url) {
  if (!/^https?:/.test(url ?? "")) return null;
  if (!maps.has(url)) {
    maps.set(url, null);
    try {
      const r = await fetch(url + ".map");
      if (r.ok) maps.set(url, new TraceMap(await r.json()));
    } catch {}
  }
  return maps.get(url);
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const srcText = new Map();
async function where(url, line, col) {
  const m = await mapOf(url);
  if (!m) return `${(url ?? "").split("/").pop()}:${line + 1}:${col}`;
  const o = originalPositionFor(m, { line: line + 1, column: col });
  return o.source ? `${o.source.replace(/^(\.\.\/)+/, "").replace(/^src\//, "")}:${o.line}${o.name ? " " + o.name : ""}` : `${url.split("/").pop()}:${line + 1}:${col}`;
}
/** A char position in a bundle (LoAF's sourceCharPosition) as line/column. */
async function whereChar(url, pos) {
  if (pos < 0 || !url) return url?.split("/").pop() ?? "?";
  if (!srcText.has(url)) srcText.set(url, await fetch(url).then((r) => r.text(), () => ""));
  const t = srcText.get(url);
  const before = t.slice(0, pos);
  const line = (before.match(/\n/g) ?? []).length;
  const col = pos - (before.lastIndexOf("\n") + 1);
  return where(url, line, col);
}
/** "at fn (https://…/main-x.js:1:2345)" → source. */
async function whereStack(s) {
  const m = s.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
  return m ? where(m[1], Number(m[2]) - 1, Number(m[3]) - 1) : s.slice(0, 120);
}

// ---- boot ----
const t0 = Date.now();
await p.goto(URL0 + `?debug${Q === "auto" ? "" : `&quality=${Q}`}&theme=day${opt.extra ?? ""}`, { timeout: 180000 });
await p.waitForFunction(() => window.__streetUp && window.street?.onFoot, { timeout: 280000, polling: 300 });
console.log(`up in ${((Date.now() - t0) / 1000).toFixed(1)} s (${VP}, cpu ${CPU}×, quality ${Q})`);
if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
await cdp.send("Performance.enable");
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
// per frame: the gap since the last one, the draw calls and triangles of all its render passes
await p.evaluate(() => {
  const R = window.street.renderer;
  const acc = { calls: 0, tris: 0 };
  const render = R.render.bind(R);
  R.render = (s, c) => {
    render(s, c);
    acc.calls += R.info.render.calls;
    acc.tris += R.info.render.triangles;
  };
  const P = (window.__probe = { dts: [], calls: [], tris: [], last: performance.now() });
  const tick = (now) => {
    P.dts.push(now - P.last);
    P.last = now;
    P.calls.push(acc.calls);
    P.tris.push(acc.tris);
    acc.calls = acc.tris = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
let m0 = null;
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const reset = async () => {
  m0 = await metrics();
  return resetPage();
};
const resetPage = () => p.evaluate(() => {
  const P = window.__probe;
  P.dts.length = P.calls.length = P.tris.length = 0;
  P.last = performance.now();
  window.__lag.long.length = window.__lag.loaf.length = 0;
  window.__lag.raf = window.__lag.rafFrames = 0;
});
const pct = (s, q) => (s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(1) : null);
async function frames(secs) {
  const m1 = await metrics();
  const r = await p.evaluate(() => {
    const P = window.__probe;
    const L = window.__lag;
    const out = { dts: P.dts.slice(1), calls: P.calls.slice(1), tris: P.tris.slice(1), long: L.long.slice(), loaf: L.loaf.slice(), rafPerFrame: L.raf / Math.max(1, L.rafFrames), tier: window.street.quality.level, cpu: window.street.load.level, dpr: window.street.renderer.getPixelRatio(), touch: matchMedia("(pointer: coarse)").matches };
    return out;
  });
  const s = [...r.dts].sort((a, b) => a - b);
  const total = r.dts.reduce((a, b) => a + b, 0);
  const min = total / 60000;
  const callsS = [...r.calls].sort((a, b) => a - b);
  return {
    frames: r.dts.length,
    // the main thread's own work per frame (ms): tasks, and its CPU time (other processes hardly change it)
    mainMs: m0 ? +(((m1.TaskDuration - m0.TaskDuration) * 1000) / Math.max(1, r.dts.length)).toFixed(1) : null,
    cpuMs: m0 ? +(((m1.ThreadTime - m0.ThreadTime) * 1000) / Math.max(1, r.dts.length)).toFixed(1) : null,
    fps: +((r.dts.length * 1000) / total).toFixed(1),
    p50: pct(s, 0.5),
    p95: pct(s, 0.95),
    p99: pct(s, 0.99),
    max: +(s.at(-1) ?? 0).toFixed(0),
    over50PerMin: +(r.dts.filter((d) => d > 50).length / min).toFixed(1),
    over100PerMin: +(r.dts.filter((d) => d > 100).length / min).toFixed(1),
    longTasksPerMin: +(r.long.length / min).toFixed(1),
    longTaskMsPerMin: Math.round(r.long.reduce((a, x) => a + x[1], 0) / min),
    calls: pct(callsS, 0.5),
    callsMax: callsS.at(-1) ?? 0,
    ktris: Math.round((r.tris.reduce((a, b) => a + b, 0) / Math.max(1, r.tris.length)) / 1000),
    rafPerFrame: +r.rafPerFrame.toFixed(1),
    tier: r.tier,
    cpu: r.cpu,
    dpr: r.dpr,
    touch: r.touch,
    loaf: r.loaf,
  };
}
/** What the long animation frames ran: script time summed by its source, the top `n`. */
async function loafTop(loaf, n = 10) {
  const by = new Map();
  for (const f of loaf)
    for (const s of f.scripts) {
      const at = s.url ? await whereChar(s.url, s.pos) : "";
      const k = `${s.type}:${s.inv?.slice(0, 50)} ${at}`;
      const v = by.get(k) ?? { ms: 0, n: 0, layout: 0 };
      v.ms += s.d;
      v.n++;
      v.layout += s.layout;
      by.set(k, v);
    }
  return [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, n).map(([k, v]) => `${String(v.ms).padStart(6)} ms ${String(v.n).padStart(4)}× ${v.layout ? `(layout ${v.layout} ms) ` : ""}${k}`);
}
/**
 * The long tasks inside a CPU profile: runs of busy samples (no idle between) over `min` ms, and the
 * source functions they spent their time in (inclusive: each function once per sample, the city's own
 * code only), summed over all of them.
 */
async function profLong(profile, min = 50, n = 22) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const parent = new Map();
  for (const x of profile.nodes) for (const c of x.children ?? []) parent.set(c, x.id);
  const names = new Map();
  const nameOf = async (id) => {
    if (names.has(id)) return names.get(id);
    const f = byId.get(id).callFrame;
    let k = null;
    if (f.url && !/node_modules/.test(f.url)) {
      const at = await where(f.url, f.lineNumber, f.columnNumber);
      if (!/node_modules/.test(at)) k = `${f.functionName || "(anon)"} ${at}`;
    } else if (!f.url && f.functionName && !/^\(/.test(f.functionName)) k = `[native] ${f.functionName}`;
    else if (f.functionName === "(garbage collector)") k = "(gc)";
    names.set(id, k);
    return k;
  };
  const segs = [];
  let cur = null;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const d = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const fn = byId.get(id).callFrame.functionName;
    if (fn === "(idle)") {
      if (cur && cur.ms >= min) segs.push(cur);
      cur = null;
      continue;
    }
    cur ??= { ms: 0, samples: [] };
    cur.ms += d;
    cur.samples.push([id, d]);
  }
  if (cur && cur.ms >= min) segs.push(cur);
  const incl = new Map();
  let total = 0;
  for (const s of segs) {
    total += s.ms;
    for (const [id, d] of s.samples) {
      const seen = new Set();
      for (let x = id; x !== undefined; x = parent.get(x)) {
        const k = await nameOf(x);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        incl.set(k, (incl.get(k) ?? 0) + d);
      }
    }
  }
  const top = [...incl].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${String(Math.round(v)).padStart(6)} ms  ${k}`);
  return { count: segs.length, ms: Math.round(total), worst: Math.round(Math.max(0, ...segs.map((s) => s.ms))), top };
}
async function profTop(profile, n = 25) {
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  const self = new Map(), file = new Map();
  let all = 0, busy = 0;
  for (const nd of profile.nodes) {
    const us = dt.get(nd.id) ?? 0;
    all += us;
    const f = nd.callFrame;
    if (f.functionName === "(idle)" || f.functionName === "(program)") continue;
    busy += us;
    if (!us) continue;
    const at = f.url ? await where(f.url, f.lineNumber, f.columnNumber) : f.functionName;
    const k = `${f.functionName || "(anon)"} ${at}`;
    self.set(k, (self.get(k) ?? 0) + us);
    const fl = at.split(":")[0];
    file.set(fl, (file.get(fl) ?? 0) + us);
  }
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, v]) => `${((v / all) * 100).toFixed(1).padStart(5)}%  ${x}`);
  return { busy: Math.round((busy / all) * 100), files: top(file, 14), fns: top(self, n) };
}
async function counts() {
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const dom = await cdp.send("Memory.getDOMCounters").catch(() => ({}));
  const r = await p.evaluate(() => {
    const st = window.street;
    let objs = 0, meshes = 0, lights = 0, sprites = 0, points = 0, spots = 0;
    st.scene3.traverseVisible((o) => {
      if (o.isPointLight) points++;
      if (o.isSpotLight) spots++;
    });
    st.scene3.traverse((o) => {
      objs++;
      if (o.isMesh) meshes++;
      if (o.isLight) lights++;
      if (o.isSprite) sprites++;
    });
    const i = st.renderer.info;
    const T = window.__timers;
    const tally = (m) => {
      const c = new Map();
      for (const v of m.values()) c.set(v, (c.get(v) ?? 0) + 1);
      return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8);
    };
    const d = st.director;
    // the programs compiled since the last sample: how each differs from its nearest older twin
    const keys = (st.renderer.info.programs ?? []).map((x) => x.cacheKey);
    const old = (window.__progKeys ??= new Set(keys));
    const fresh = keys.filter((k) => !old.has(k));
    const newProgs = fresh.slice(0, 6).map((k) => {
      const f = k.split(",");
      let best = null, bestSame = -1;
      for (const o of old) {
        const g = o.split(",");
        if (g[0] !== f[0] || g.length !== f.length) continue;
        let same = 0;
        for (let i = 0; i < f.length; i++) if (f[i] === g[i]) same++;
        if (same > bestSame) (bestSame = same), (best = g);
      }
      const diff = best ? f.map((x, i) => (x !== best[i] ? `#${i}:${best[i].slice(0, 24)}→${x.slice(0, 24)}` : null)).filter(Boolean).slice(0, 6).join(" ") : "(no twin)";
      return `${f[0].slice(0, 30)} ${diff}`;
    });
    for (const k of fresh) old.add(k);
    return {
      heap: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      geo: i.memory.geometries,
      tex: i.memory.textures,
      prog: i.programs?.length ?? 0,
      objs,
      meshes,
      lights,
      sprites,
      snarks: d.snarks.size,
      buses: d.buses.size,
      points,
      spots,
      cars: d.cars?.size ?? null,
      trucks: d.trucks?.size ?? null,
      vehicles: d.traffic.vehicles.size,
      metro: (st.metro.trains?.length ?? st.metro.trains?.size ?? 0) + (st.metro2?.trains?.length ?? st.metro2?.trains?.size ?? 0),
      height: st.game.clock.height,
      timeouts: T ? T.to.size : null,
      intervals: T ? T.iv.size : null,
      timerCalls: T ? T.calls : null,
      topTimeouts: T ? tally(T.to) : [],
      topIntervals: T ? tally(T.iv) : [],
      listen: window.__listen ? Object.fromEntries([...window.__listen].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 12)) : null,
      canvases: document.getElementsByTagName("canvas").length,
      attached: document.getElementsByTagName("*").length,
      // the avenue's vehicles: lane, where, how fast, how long (a bus ~12 m, a truck 10, a taxi 7)
      avenue: [...d.traffic.vehicles].map((v) => `${v.lane}@${Math.round(v.x)}:${v.v.toFixed(1)}/${v.mover.length.toFixed(0)}${v.held ? "H" : ""}`).join(" "),
      states: st.states?.() ?? "",
      // the containers that hold the most elements (where a growing list would show)
      bigLists: [...document.querySelectorAll("body *")].filter((e) => e.children.length > 12).map((e) => `${e.id ? "#" + e.id : ""}${typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : e.tagName.toLowerCase()}:${e.children.length}`).slice(0, 10),
      newProgs,
      newProgN: fresh.length,
    };
  });
  return { ...r, nodes: dom.nodes, jsListeners: dom.jsEventListeners, docs: dom.documents };
}
const theme = (t) => p.evaluate((t) => window.street.hud.cb.setTheme(t), t);
const results = { mode, vp: VP, cpu: CPU, q: Q, url: URL0, phases: {}, soak: [] };

async function enterPhase(ph) {
  const [view, light = "day"] = ph.split("-");
  await theme(light);
  if (view === "foot") {
    await p.evaluate(() => window.street.walk(true));
    // (at=x,z,yaw: the same start every run, for comparing builds)
    if (opt.at) await p.evaluate((a) => window.street.game.stand(...a), opt.at.split(",").map(Number));
    await wait(2500);
  } else {
    await p.evaluate(() => window.street.walk(false));
    await p.evaluate((v) => window.street.rig.setMode(v === "overview" ? "overview" : "live"), view);
    await wait(2500);
  }
}
async function walkAbout(ms) {
  // on foot: walk the avenue, turning now and then (keys held, as a visitor does)
  const end = Date.now() + ms;
  let k = 0;
  while (Date.now() < end) {
    const key = ["KeyW", "KeyW", "KeyA", "KeyW", "KeyD", "KeyW", "KeyS"][k++ % 7];
    await p.keyboard.down(key);
    await wait(Math.min(2500, end - Date.now()));
    await p.keyboard.up(key);
  }
}

if (mode === "frames") {
  const SECS = Number(opt.secs ?? 60);
  const phases = (opt.phases ?? "map-day,map-night,foot-day,foot-night").split(",");
  await wait(Number(opt.warm ?? 20) * 1000);
  for (const ph of phases) {
    await enterPhase(ph);
    await reset();
    if (opt.prof) await cdp.send("Profiler.start");
    if (ph.startsWith("foot")) await walkAbout(SECS * 1000);
    else await wait(SECS * 1000);
    const prof = opt.prof ? (await cdp.send("Profiler.stop")).profile : null;
    const f = await frames(SECS);
    const top = await loafTop(f.loaf);
    delete f.loaf;
    results.phases[ph] = { ...f, loafTop: top };
    console.log(`\n== ${ph}: ${JSON.stringify(f)}`);
    console.log("   long animation frames, script time by source:\n   " + (top.join("\n   ") || "(none)"));
    if (prof) {
      const pt = await profTop(prof);
      const pl = await profLong(prof);
      results.phases[ph].prof = pt;
      results.phases[ph].profLong = pl;
      console.log(`   profile: busy ${pt.busy}%\n   -- files\n   ${pt.files.join("\n   ")}\n   -- functions (self)\n   ${pt.fns.join("\n   ")}`);
      console.log(`   -- busy runs over 50 ms: ${pl.count}, ${pl.ms} ms in all, worst ${pl.worst} ms; inclusive time by source function\n   ${pl.top.join("\n   ")}`);
    }
  }
  const c = await counts();
  results.end = c;
  console.log("\nend:", JSON.stringify({ heap: c.heap, geo: c.geo, tex: c.tex, prog: c.prog, objs: c.objs, nodes: c.nodes, jsListeners: c.jsListeners }));
} else {
  // soak: the map view left open; the real blocks arrive
  const MIN = Number(opt.min ?? 15);
  const EVERY = Number(opt.every ?? 60) * 1000;
  const BURST = Number(opt.burst ?? 30);
  const AFTER = Number(opt.after ?? 3);
  await wait(15000);
  await theme(opt.theme ?? "day");
  let profiling = false;
  const row = async (label) => {
    const prof = profiling ? (await cdp.send("Profiler.stop")).profile : null;
    profiling = false;
    const f = await frames();
    const top = await loafTop(f.loaf, 4);
    delete f.loaf;
    const c = await counts();
    const tt = [];
    for (const [w, n] of c.topTimeouts) tt.push(`${n}× ${await whereStack(w)}`);
    const ti = [];
    for (const [w, n] of c.topIntervals) ti.push(`${n}× ${await whereStack(w)}`);
    const r = { t: Math.round((Date.now() - t0) / 1000), label, ...f, ...c, topTimeouts: tt, topIntervals: ti, loafTop: top };
    results.soak.push(r);
    console.log(`${String(r.t).padStart(5)}s ${label.padEnd(10)} h${c.height} fps ${f.fps} p50 ${f.p50} p95 ${f.p95} p99 ${f.p99} main ${f.mainMs}/${f.cpuMs}ms >50ms/min ${f.over50PerMin} LT/min ${f.longTasksPerMin} calls ${f.calls} | heap ${c.heap}MB geo ${c.geo} tex ${c.tex} prog ${c.prog} objs ${c.objs} mesh ${c.meshes} spr ${c.sprites} | snarks ${c.snarks} buses ${c.buses} cars ${c.cars} trucks ${c.trucks} veh ${c.vehicles} lights ${c.points}p/${c.spots}s | nodes ${c.nodes}/${c.attached} lis ${c.jsListeners} canv ${c.canvases} | timeouts ${c.timeouts} intervals ${c.intervals} (${c.timerCalls} set) q${f.tier} cpu${f.cpu}`);
    if (c.newProgN) console.log(`   ${c.newProgN} new programs: ${c.newProgs.join(" | ")}`);
    if (prof) {
      const pl = await profLong(prof, 50, 8);
      r.profLong = pl;
      console.log(`   busy runs over 50 ms: ${pl.count}, ${pl.ms} ms, worst ${pl.worst} ms:\n     ${pl.top.join("\n     ")}`);
    }
    if (opt.verbose || label === "end" || label === "start") {
      console.log("   timeouts:", tt.join(" · "));
      console.log("   intervals:", ti.join(" · "));
      console.log("   listeners:", JSON.stringify(c.listen));
      console.log("   big lists:", c.bigLists.join(" "));
      console.log("   avenue:", c.avenue);
      console.log("   people:", c.states);
    }
    await reset();
    if (opt.prof) {
      await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
      await cdp.send("Profiler.start");
      profiling = true;
    }
  };
  await reset();
  await wait(EVERY);
  await row("start");
  const end = Date.now() + MIN * 60000;
  let k = 0;
  while (Date.now() < end) {
    // the light changes with the clock: half the soak by night
    if (++k === Math.ceil(MIN / 2) && !opt.theme) await theme("night");
    await wait(EVERY);
    await row(`live ${k}`);
  }
  if (BURST) {
    // the indexer catching up: blocks at 3 a second, each with the latest real block's transactions
    const n = await p.evaluate(async (N) => {
      const st = window.street;
      const base = st.game.clock.last;
      if (!base) return 0;
      let h = st.game.clock.height;
      for (let i = 0; i < N; i++) {
        const blk = { ...base, height: ++h, hash: `burst${h}`, time: new Date().toISOString(), txs: base.txs.map((t) => ({ ...t, txid: `${t.txid.slice(0, 40)}${h}${i}` })) };
        st.director.block(blk);
        st.game.clock.feed(blk);
        await new Promise((r) => setTimeout(r, 333));
      }
      return N;
    }, BURST);
    console.log(`-- burst: ${n} blocks at 3/s`);
    await row("burst");
    for (let i = 1; i <= AFTER; i++) {
      await wait(EVERY);
      await row(`after ${i}`);
    }
  }
  await row("end");
  if (opt.domwho) {
    // the elements still in memory but no longer in the page: what they are (by tag, class, text)
    await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
    const proto = await cdp.send("Runtime.evaluate", { expression: "Element.prototype" });
    const all = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId });
    const r = await cdp.send("Runtime.callFunctionOn", {
      objectId: all.objects.objectId,
      functionDeclaration: `function () {
        const by = new Map();
        let n = 0;
        for (const el of this) {
          // (the prototypes are in the list too)
          try {
            if (el.isConnected) continue;
          } catch {
            continue;
          }
          // (only the top of each detached tree)
          if (el.parentNode && !el.parentNode.isConnected && el.parentNode.nodeType === 1) continue;
          n++;
          const k = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "") + " [" + el.getElementsByTagName("*").length + "] " + (el.textContent || "").trim().slice(0, 40);
          by.set(k, (by.get(k) || 0) + 1);
        }
        return JSON.stringify({ n, top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 25) });
      }`,
      returnByValue: true,
    });
    if (r.exceptionDetails) console.log("domwho:", JSON.stringify(r.exceptionDetails).slice(0, 400));
    const v = JSON.parse(r.result.value ?? '{"n":0,"top":[]}');
    console.log(`detached element trees: ${v.n}`);
    for (const [k, c] of v.top) console.log(`  ${String(c).padStart(5)}  ${k}`);
  }
}
console.log("errors", errors.length, [...new Set(errors)].slice(0, 10).join(" | "));
if (opt.json) writeFileSync(opt.json, JSON.stringify(results, null, 1));
await b.close();
