// node shots/_lotcheck.mjs: every realistic landmark built and its footprint compared with its lot (model frame: the front
// at +D/2): what spills over the lot's edge into the streets (metres), and the model's own size against the lot's
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal"], defaultViewport: { width: 400, height: 300 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/reallm.html?kind=noir");
await new Promise((r) => setTimeout(r, 2500));
if (process.env.AFTER) await p.evaluate(() => (window.__after = true));
const res = await p.evaluate(async () => {
  const plan = await import("/src/scene/city/plan.ts");
  const build = await import("/src/scene/city/build.ts");
  const lm = await import("/src/scene/real/landmarks.ts");
  const mk = await import("/src/scene/real/marks.ts");
  const VOX = (await import("/src/scene/voxel/model.ts")).VOX;
  const guard = await import("/src/scene/real/lotguard.ts");
  const { jobs } = plan.planCity();
  const out = [];
  for (const j of jobs) {
    if (j.type !== "landmark") continue;
    const kind = j.opts.kind;
    let geos = null;
    let bb;
    try {
      bb = Object.assign(build.buildJob(j), { kind });
      if (lm.REAL_LANDMARKS.has(kind)) geos = lm.realLandmark(kind, bb, { lod: 0 }).geos;
      else if (mk.REAL_MARKS.has(kind)) geos = mk.realMark(kind, bb, { lod: 0 }).geos;
    } catch (e) {
      out.push({ kind, err: e.message });
      continue;
    }
    if (!geos) continue;
    if (window.__after) { const L0 = guard.lotRect(kind, j, bb); guard.keepInLot(kind, j, bb, geos); void L0; }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const g of Object.values(geos)) for (const t of g.idx) { const i = t * 3;
      x0 = Math.min(x0, g.pos[i]); x1 = Math.max(x1, g.pos[i]); z0 = Math.min(z0, g.pos[i + 2]); z1 = Math.max(z1, g.pos[i + 2]);
    }
    const k = (bb.scale ?? 1) * VOX;
    const W = bb.model.w * k, D = bb.model.d * k;
    const lw = j.opts.w, ld = j.opts.d;
    // the lot in the builder's frame, as the city places it (lotguard.ts)
    const L = guard.lotRect(kind, j, bb);

    const over = { left: +(L.x0 - x0).toFixed(1), right: +(x1 - L.x1).toFixed(1), back: +(L.z0 - z0).toFixed(1), front: +(z1 - L.z1).toFixed(1) };
    const worst = Math.max(...Object.values(over));
    out.push({ kind, face: j.face, lot: [lw.toFixed(1), ld.toFixed(1)], model: [W.toFixed(1), D.toFixed(1)], over, worst: +worst.toFixed(1) });
  }
  return out.sort((a, b) => (b.worst ?? 0) - (a.worst ?? 0));
});
for (const r of res) console.log(JSON.stringify(r));
await b.close();
