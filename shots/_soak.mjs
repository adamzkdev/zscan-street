// node shots/_soak.mjs [minutes=15] [port=3023] [flags...]
// Soak test of the whole city on a (frozen, production) preview: cycles the live view, the overview,
// the data views, day/night, every AREA, on-foot walks, every walk-in place (all floors, several
// times), the Flyer and the Blimp, the stadium's play mode. After each step it logs fps (avg/min),
// long frames (> 100 ms), the JS heap (after a forced GC), renderer.info (geometries, textures,
// programs) and the draw calls/triangles of a whole frame. Ends with a leak table per cycle.
// flags: block (API requests fail), quality=N (?quality=N), mobile (phone viewport + touch),
//        json=<file> (write all samples), nolose (skip the WebGL context-loss test)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const args = process.argv.slice(2);
const minutes = Number(args[0] ?? 15);
const port = Number(args[1] ?? 3023);
const flags = new Set(args.slice(2));
const flag = (k) => [...flags].find((f) => f.startsWith(k + "="))?.split("=")[1];
const BLOCK = flags.has("block");
const MOBILE = flags.has("mobile");
const Q = flag("quality");
const JSON_OUT = flag("json");
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  protocolTimeout: 600000,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc"],
  defaultViewport: MOBILE ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { width: 1440, height: 860 },
});
const p = await b.newPage();
const cdp = await p.target().createCDPSession();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const warns = new Map();
let phase = "load";
p.on("pageerror", (e) => {
  errors.push(`[${phase}] ${e.message}`);
  console.log("[pageerror]", phase, e.message.slice(0, 300));
});
p.on("console", (m) => {
  const t = m.text();
  if (t.includes("Failed to load resource")) return;
  if (m.type() === "error") {
    errors.push(`[${phase}] console.error ${t.slice(0, 300)}`);
    console.log("[error]", phase, t.slice(0, 300));
  } else if (m.type() === "warn" || m.type() === "warning") {
    const k = t.slice(0, 160);
    if (!warns.has(k)) console.log("[warn first]", phase, k);
    warns.set(k, (warns.get(k) ?? 0) + 1);
  }
});
if (BLOCK) {
  await p.setRequestInterception(true);
  p.on("request", (r) => (/api\.zscan\.cash|wss?:\/\//.test(r.url()) && !r.url().includes("localhost") ? r.abort() : r.continue()));
}
await p.evaluateOnNewDocument(() => {
  window.addEventListener("unhandledrejection", (e) => console.error("UNHANDLED", String(e.reason?.stack ?? e.reason).slice(0, 600)));
});
const t0 = Date.now();
const url = `http://localhost:${port}/?debug&theme=night${Q !== undefined ? `&quality=${Q}` : ""}`;
await p.goto(url);
for (let k = 0; k < 120; k++) {
  if (await p.evaluate(() => !!window.street).catch(() => false)) break;
  await wait(1000);
}
console.log("street ready in", ((Date.now() - t0) / 1000).toFixed(1), "s");
// per-frame probe: frame deltas, long frames, the whole frame's draw calls (all render() calls)
await p.evaluate(() => {
  const R = street.renderer;
  const acc = { calls: 0, tris: 0, passes: 0 };
  const orig = R.render.bind(R);
  R.render = (s, c) => {
    orig(s, c);
    acc.calls += R.info.render.calls;
    acc.tris += R.info.render.triangles;
    acc.passes++;
  };
  const P = (window.__probe = { dts: [], long: [], last: performance.now(), frame: { calls: 0, tris: 0, passes: 0 }, maxCalls: 0 });
  const tick = (now) => {
    const dt = now - P.last;
    P.last = now;
    P.dts.push(dt);
    if (dt > 100) P.long.push(Math.round(dt));
    if (acc.passes) {
      P.frame = { ...acc };
      P.maxCalls = Math.max(P.maxCalls, acc.calls);
    }
    acc.calls = acc.tris = acc.passes = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__lost = 0;
  R.domElement.addEventListener("webglcontextlost", () => window.__lost++);
});
const samples = [];
async function sample(label, extra = {}) {
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const s = await p.evaluate(() => {
    const P = window.__probe;
    const d = P.dts.splice(0).filter((x) => x < 2000);
    const long = P.long.splice(0);
    const avg = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    const i = street.renderer.info;
    const out = {
      fps: avg ? Math.round(1000 / avg) : 0,
      minFps: d.length ? Math.round(1000 / Math.max(...d)) : 0,
      long: long.length,
      worst: long.length ? Math.max(...long) : 0,
      heap: Math.round(performance.memory.usedJSHeapSize / 1048576),
      geo: i.memory.geometries,
      tex: i.memory.textures,
      prog: i.programs?.length ?? 0,
      calls: P.frame.calls,
      maxCalls: P.maxCalls,
      tris: Math.round(P.frame.tris / 1000),
      passes: P.frame.passes,
      dom: document.getElementsByTagName("*").length,
      canv: document.getElementsByTagName("canvas").length,
      q: street.quality.level,
    };
    P.maxCalls = 0;
    return out;
  });
  const row = { t: Math.round((Date.now() - t0) / 1000), label, ...s, ...extra };
  samples.push(row);
  console.log(
    `${String(row.t).padStart(4)}s ${label.padEnd(26)} fps ${String(s.fps).padStart(3)} min ${String(s.minFps).padStart(3)} long ${s.long}${s.worst ? `(${s.worst}ms)` : ""} heap ${s.heap}MB geo ${s.geo} tex ${s.tex} prog ${s.prog} calls ${s.calls}/${s.maxCalls} tris ${s.tris}k q${s.q}${extra.build ? ` build ${extra.build}ms` : ""}`,
  );
  return row;
}
const ev = (fn, ...a) => p.evaluate(fn, ...a).catch((e) => console.log("[eval]", phase, e.message.slice(0, 200)));
const reset = () => p.evaluate(() => (window.__probe.dts.length = 0, window.__probe.long.length = 0, (window.__probe.maxCalls = 0)));

const keys = await p.evaluate(() => Object.keys(street.interiors.build ?? street.interiors["build"]));
const views = await p.evaluate(() => [...document.querySelectorAll(".dataviews [data-view]")].map((e) => e.dataset.view));
const areas = null;
// AREAS (copied from plan.ts; the production bundle has no module paths)
const AREAS = areas ?? [
  ["downtown", 1.5, -0.5, 1], ["orchard", -37, 2, 1.1], ["ironwood", 37, 0, 1.1], ["transparent", 0, 18, 1.2], ["park", 0, -82, 0.55],
  ["museum", -86, -82, 0.6], ["stadium", -175, -82, 0.5], ["shotengai", -112, 10, 0.65], ["wallst", 130, 0, 0.5], ["midtown", 120, -120, 0.4],
  ["marina", 170, 100, 0.5], ["port", -175, 104, 0.5], ["binhai", 0, 104, 0.75], ["flyer", -70, 88, 0.9], ["giza", -160, -193, 0.55],
  ["paris", -86, -205, 0.6], ["rome", 86, -193, 0.55], ["shibuya", -60, -162, 0.8], ["palm", -195, 190, 0.45], ["bay", 20, 190, 0.35], ["woods", 192, 212, 0.6],
].map(([key, x, z, zoom]) => ({ key, x, z, zoom }));
console.log("interiors", keys.length, keys.join(","), "\nviews", views.join(","));
await wait(6000);
await reset();
await sample("baseline (live 6s)");

const cycleRows = [];
const builds = {};
async function walkKeys(ms) {
  for (const k of ["w", "w", "a", "w", "d", "s"]) {
    await p.keyboard.down(k);
    await wait(ms / 6);
    await p.keyboard.up(k);
  }
}
let cycle = 0;
while (Date.now() - t0 < minutes * 60000) {
  cycle++;
  phase = `c${cycle} live`;
  await ev(() => street.rig.setMode("live"));
  await reset();
  await wait(5000);
  await sample(phase);
  phase = `c${cycle} overview`;
  await ev(() => street.rig.setMode("overview"));
  await reset();
  await wait(5000);
  await sample(phase);
  phase = `c${cycle} dataviews`;
  await reset();
  for (const v of views) {
    await ev((v) => street.overlays.set(v), v);
    await wait(1500);
  }
  await ev(() => street.overlays.view !== "off" && street.overlays.set(street.overlays.view));
  await sample(phase);
  phase = `c${cycle} day/night`;
  await ev(() => street.rig.setMode("live"));
  await reset();
  for (const t of ["day", "night", "day", "night"]) {
    await ev((t) => street.hud.cb.setTheme(t), t);
    await wait(1500);
  }
  await sample(phase);
  phase = `c${cycle} areas`;
  await reset();
  for (const a of AREAS) {
    await ev((a) => street.rig.district(new (street.rig.focus.constructor)(a.x, 1, a.z), a.zoom), a);
    await wait(cycle === 1 ? 3500 : 2000);
  }
  await sample(phase);
  phase = `c${cycle} on-foot`;
  await ev(() => street.rig.district(new (street.rig.focus.constructor)(1.5, 1, -0.5), 1));
  await wait(1500);
  await ev(() => street.walk(true));
  await reset();
  await walkKeys(6000);
  await sample(phase);
  await ev(() => street.walk(false));
  // every walk-in place, every floor
  phase = `c${cycle} interiors`;
  for (const k of keys) {
    phase = `c${cycle} in:${k}`;
    const r = await p.evaluate((k) => {
      const t = performance.now();
      street.interiors.enter(k, 0);
      return { build: Math.round(performance.now() - t), floors: street.interiors.active?.floors.length ?? 0 };
    }, k).catch((e) => (errors.push(`[${phase}] enter threw ${e.message}`), { build: -1, floors: 0 }));
    if (cycle === 1) builds[k] = r.build;
    await reset();
    await wait(cycle === 1 ? 2500 : 1200);
    for (let f = 1; f < r.floors; f++) {
      await ev((f) => street.interiors.goTo(f), f);
      await wait(700);
    }
    if (cycle === 1) await walkKeys(1800);
    const row = await sample(phase, { build: r.build, floors: r.floors });
    await ev(() => street.interiors.exit());
    await wait(500);
  }
  phase = `c${cycle} after-interiors`;
  await reset();
  await wait(2000);
  cycleRows.push(await sample(phase));
  // the stadium's play mode
  phase = `c${cycle} stadium-play`;
  await ev(() => street.interiors.enter("stadium", 1));
  await reset();
  await walkKeys(5000);
  await sample(phase);
  await ev(() => street.interiors.exit());
  // the Flyer and the Blimp
  for (const ride of ["Flyer", "Blimp"]) {
    phase = `c${cycle} ride ${ride}`;
    await ev(() => street.rig.district(new (street.rig.focus.constructor)(-70, 1, 88), 0.9));
    await wait(1500);
    await ev((r) => street["ride" + r](), ride);
    await reset();
    await wait(9000);
    await sample(phase);
    await ev(() => street.rig.setMode("live"));
    await wait(1500);
    await ev(() => street.walk(false));
  }
}
// WebGL context loss and restore
if (!flags.has("nolose")) {
  phase = "context-loss";
  await ev(() => {
    const ext = street.renderer.getContext().getExtension("WEBGL_lose_context");
    window.__ext = ext;
    ext?.loseContext();
  });
  await wait(1500);
  await ev(() => window.__ext?.restoreContext());
  await reset();
  await wait(5000);
  await sample("after context restore");
  await ev(() => street.interiors.enter("tower", 0));
  await wait(2000);
  await sample("interior after restore");
  await ev(() => street.interiors.exit());
}
phase = "end";
await reset();
await wait(3000);
await sample("end (live)");
const alive = await p.evaluate(() => {
  const P = window.__probe;
  return { lost: window.__lost, frames: P.dts.length };
});
console.log("\n=== LEAK TABLE (after every interior was visited, per cycle) ===");
for (const r of cycleRows) console.log(`${r.label.padEnd(22)} heap ${r.heap}MB geo ${r.geo} tex ${r.tex} prog ${r.prog} dom ${r.dom} canvas ${r.canv}`);
console.log("\n=== INTERIOR FIRST BUILD (ms) ===");
console.log(Object.entries(builds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
const all = samples.filter((s) => s.fps);
console.log("\n=== SUMMARY ===");
console.log("samples", all.length, "avg fps", Math.round(all.reduce((a, s) => a + s.fps, 0) / all.length), "min fps (worst step)", Math.min(...all.map((s) => s.minFps)), "long frames", all.reduce((a, s) => a + s.long, 0), "worst", Math.max(...all.map((s) => s.worst)), "ms");
console.log("context lost events", alive.lost, "frames after end", alive.frames);
console.log("errors", errors.length);
for (const e of [...new Set(errors)].slice(0, 40)) console.log("  ", e);
console.log("warnings", warns.size);
for (const [k, n] of [...warns].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log("  ", n, "x", k);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ samples, errors, warns: [...warns], builds }, null, 1));
await b.close();
