// node shots/_realcheck.mjs: run every realistic landmark and heart building of the plan through its builder (near, far, cut) and report failures
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal"], defaultViewport: { width: 400, height: 300 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/reallm.html?kind=noir");
await new Promise((r) => setTimeout(r, 3000));
const res = await p.evaluate(async () => {
  const plan = await import("/src/scene/city/plan.ts");
  const build = await import("/src/scene/city/build.ts");
  const lm = await import("/src/scene/real/landmarks.ts");
  const { jobs } = plan.planCity();
  const out = [];
  let n = 0;
  for (const j of jobs) {
    const kind = j.type === "landmark" ? j.opts.kind : `h:${j.type}`;
    if (j.type === "landmark" ? !lm.REAL_LANDMARKS.has(kind) : !lm.REAL_HEART.has(j.type)) continue;
    n++;
    try {
      const bb = Object.assign(build.buildJob(j), { kind: j.opts.kind });
      for (const o of [{ lod: 0 }, { lod: 1 }, { lod: 1, clipY: 2.67 }]) {
        const r = lm.realLandmark(kind, bb, o);
        for (const [s, g] of Object.entries(r.geos)) for (const v of g.pos) if (!Number.isFinite(v)) throw new Error(`NaN in ${s}`);
        for (const [s, g] of Object.entries(r.geos)) for (const v of g.col) if (!Number.isFinite(v)) throw new Error(`NaN colour in ${s}`);
      }
    } catch (e) {
      out.push(`${kind} #${j.id} ${JSON.stringify(j.opts).slice(0, 80)}: ${e.message}`);
    }
  }
  return { n, out };
});
console.log(JSON.stringify(res, null, 1));
await b.close();
