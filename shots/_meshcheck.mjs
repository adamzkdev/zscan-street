// node shots/_meshcheck.mjs: the mesher and half() against their reference copies from before the speed-ups
// (shots/_mesher-ref.ts, _smooth-ref.ts, _model-ref.ts) on every distinct variant of the city, at full,
// half and quarter resolution: same arrays byte for byte, and the time of each
import { createServer } from "vite";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await vite.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await vite.ssrLoadModule("/src/scene/city/build.ts");
const now = await vite.ssrLoadModule("/src/scene/voxel/mesher.ts");
const ref = await vite.ssrLoadModule("/shots/_mesher-ref.ts");
const refModel = await vite.ssrLoadModule("/shots/_model-ref.ts");
const { half } = await vite.ssrLoadModule("/src/scene/voxel/model.ts");
const { jobs } = planCity();
const seen = new Map();
for (const j of jobs) { const k = `${j.type}|${j.seed}|${j.width}|${JSON.stringify(j.opts)}`; if (!seen.has(k)) seen.set(k, j); }
const bytes = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const same = (x, y) => {
  if (x.constructor !== y.constructor || x.length !== y.length) return false;
  const a = bytes(x), b = bytes(y);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
let tr = 0, tn = 0, thr = 0, thn = 0, meshes = 0, halves = 0, bad = 0;
for (const j of seen.values()) {
  const m = buildJob(j).model;
  // half(): the new against the reference
  let t = performance.now(); const hr = refModel.half(m); thr += performance.now() - t;
  t = performance.now(); const h = half(m); thn += performance.now() - t;
  const qr = refModel.half(h), q = half(h);
  halves += 2;
  if (!same(hr.data, h.data) || hr.w !== h.w || hr.h !== h.h || hr.d !== h.d) { bad++; console.log("half differs", j.type); }
  if (!same(qr.data, q.data)) { bad++; console.log("quarter differs", j.type); }
  for (const mm of [m, h, q]) {
    t = performance.now(); const A = ref.meshModel(mm); tr += performance.now() - t;
    t = performance.now(); const B = now.meshModel(mm); tn += performance.now() - t;
    const ka = Object.keys(A).sort().join(), kb = Object.keys(B).sort().join();
    meshes++;
    if (ka !== kb) { bad++; console.log("kinds differ", j.type, ka, kb); continue; }
    for (const k of Object.keys(A)) {
      const ga = A[k], gb = B[k];
      for (const att of ["position", "normal", "color"]) if (!same(ga.getAttribute(att).array, gb.getAttribute(att).array)) { bad++; console.log("differs", j.type, j.opts?.kind ?? "", k, att); }
      if (!same(ga.getIndex().array, gb.getIndex().array)) { bad++; console.log("index differs", j.type, j.opts?.kind ?? "", k, ga.getIndex().array.constructor.name, gb.getIndex().array.constructor.name); }
    }
  }
}
console.log(`${seen.size} variants: ${meshes} meshes and ${halves} half/quarter models, ${bad} differing; mesher: reference ${tr.toFixed(0)} ms, now ${tn.toFixed(0)} ms (${(tr / tn).toFixed(2)}x); half(): reference ${thr.toFixed(0)} ms, now ${thn.toFixed(0)} ms`);
await vite.close();
