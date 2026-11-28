// node shots/_spotprof.mjs X Z HEADING: at a spot in the game (uncapped): fps, draw calls, triangles, and where the frame's
// JavaScript goes (CPU profile self time, 6 s), the JS share of a frame (CPU-bound or GPU-bound)
import puppeteer from "puppeteer-core";
const [X = "150", Z = "8", H = "1.57"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&gta=1192&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.solid?.ready && street.gta.doorsReady, { timeout: 300000, polling: 300 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate((x, z, h) => { const g = street.gta; g.hud.coach(-1); const y = g.host.ground(x, z) ?? 0.2; g.player.place(x, y, z, h); g.cam.behind(h, -0.1); g.cam.snap(g.player.pos.clone().setY(y + 1.55)); }, +X, +Z, +H);
await sleep(6000);
const stats = await p.evaluate(async () => {
  const r = street.gta.host.renderer;
  let n = 0, calls = 0, tris = 0;
  const t0 = performance.now();
  await new Promise((res) => { const f = () => { n++; calls += r.info.render.calls; tris += r.info.render.triangles; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return { fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), calls: Math.round(calls / n), tris: Math.round(tris / n), programs: r.info.programs?.length, geos: r.info.memory.geometries, texs: r.info.memory.textures };
});
console.log("spot", X, Z, JSON.stringify(stats));
const cdp = await p.target().createCDPSession();
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
await sleep(6000);
const { profile } = await cdp.send("Profiler.stop");
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map(), inc = new Map();
let total = 0, idle = 0;
profile.samples.forEach((id, i) => {
  const dt = profile.timeDeltas[i] ?? 0;
  total += dt;
  const n = byId.get(id);
  if (n.callFrame.functionName === "(idle)") { idle += dt; return; }
  const k = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/").split("?")[0]}:${n.callFrame.lineNumber + 1}`;
  self.set(k(n), (self.get(k(n)) ?? 0) + dt);
  const seen = new Set();
  let q = id;
  while (q !== undefined) { const nm = k(byId.get(q)); if (!seen.has(nm)) { seen.add(nm); inc.set(nm, (inc.get(nm) ?? 0) + dt); } q = parent.get(q); }
});
console.log(`busy ${(((total - idle) / total) * 100).toFixed(0)}% of 6 s`);
console.log("self:\n  " + [...self].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, us]) => `${(us / 1000).toFixed(0)}ms ${k}`).join("\n  "));
console.log("inclusive (src only):\n  " + [...inc].filter(([k]) => !/ deps\/|^\(|:0$/.test(k) && !/^(frame|frameBody|\(anon\)) src\/main/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, us]) => `${(us / 1000).toFixed(0)}ms ${k}`).join("\n  "));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
