import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const THREE = await vite.ssrLoadModule("three");
const { planCity } = await vite.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await vite.ssrLoadModule("/src/scene/city/build.ts");
const { meshModel } = await vite.ssrLoadModule("/src/scene/voxel/mesher.ts");
const { half } = await vite.ssrLoadModule("/src/scene/voxel/model.ts");
const toHalf = THREE.DataUtils.toHalfFloat;
const { jobs } = planCity();
const seen = new Map();
for (const j of jobs) { const k = `${j.type}|${j.seed}|${j.width}|${JSON.stringify(j.opts)}`; if (!seen.has(k)) seen.set(k, j); }
let tPack = 0, tMesh = 0, verts = 0, tScale = 0;
for (const j of seen.values()) {
  const m = buildJob(j).model;
  for (const mm of [m, half(m)]) {
    let t = performance.now();
    const geos = meshModel(mm);
    tMesh += performance.now() - t;
    t = performance.now();
    for (const g of Object.values(geos)) g.scale(1, 1, 1);
    tScale += performance.now() - t;
    t = performance.now();
    for (const g of Object.values(geos)) {
      const pos = g.getAttribute("position").array; const n = g.getAttribute("normal").array; const c = g.getAttribute("color").array;
      verts += pos.length / 3;
      const nor = new Int8Array(n.length); for (let i = 0; i < n.length; i++) nor[i] = Math.round(n[i] * 127);
      const col = new Uint16Array(c.length); for (let i = 0; i < c.length; i++) col[i] = toHalf(c[i]);
      const src = g.getIndex().array; const idx = pos.length / 3 <= 65535 ? Uint16Array.from(src) : Uint32Array.from(src);
    }
    tPack += performance.now() - t;
  }
}
console.log(`mesh ${tMesh.toFixed(0)} ms, scale ${tScale.toFixed(0)} ms, pack ${tPack.toFixed(0)} ms, ${(verts / 1e6).toFixed(1)}M verts`);
await vite.close();
