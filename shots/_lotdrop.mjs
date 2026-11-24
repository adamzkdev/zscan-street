// node shots/_lotdrop.mjs: how much of each landmark the lot guard drops (triangles before/after) — a big drop is a wrong lot, not a spill
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal"], defaultViewport: { width: 400, height: 300 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/reallm.html?kind=noir");
await new Promise((r) => setTimeout(r, 2500));
const res = await p.evaluate(async () => {
  const plan = await import("/src/scene/city/plan.ts");
  const build = await import("/src/scene/city/build.ts");
  const lm = await import("/src/scene/real/landmarks.ts");
  const mk = await import("/src/scene/real/marks.ts");
  const guard = await import("/src/scene/real/lotguard.ts");
  const out = [];
  for (const j of plan.planCity().jobs) {
    if (j.type !== "landmark") continue;
    const kind = j.opts.kind;
    const bb = Object.assign(build.buildJob(j), { kind });
    const geos = lm.REAL_LANDMARKS.has(kind) ? lm.realLandmark(kind, bb, { lod: 0 }).geos : mk.REAL_MARKS.has(kind) ? mk.realMark(kind, bb, j, 0).geos : null;
    if (!geos) continue;
    const tri = () => Object.values(geos).reduce((n, g) => n + g.idx.length / 3, 0);
    const t0 = tri();
    const L = guard.lotRect(kind, j, bb);
    guard.keepInLot(kind, j, bb, geos);
    const t1 = tri();
    out.push({ kind, before: t0, after: t1, dropped: +(1 - t1 / t0).toFixed(3), lot: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, +v.toFixed(1)])), body: bb.body, model: [bb.model.w, bb.model.d], scale: bb.scale ?? 1 });
  }
  return out.sort((a, b) => b.dropped - a.dropped);
});
for (const r of res.slice(0, 14)) console.log(JSON.stringify(r));
await b.close();
