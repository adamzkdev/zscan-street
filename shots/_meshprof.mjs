// node --cpu-prof --cpu-prof-dir=DIR shots/_meshprof.mjs: the city's workers' work in Node (build, mesh, half
// copies), for a CPU profile
import { createServer } from "vite";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await vite.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await vite.ssrLoadModule("/src/scene/city/build.ts");
const { meshModel } = await vite.ssrLoadModule("/src/scene/voxel/mesher.ts");
const { half } = await vite.ssrLoadModule("/src/scene/voxel/model.ts");
const { jobs } = planCity();
const seen = new Map();
for (const j of jobs) { const k = `${j.type}|${j.seed}|${j.width}|${JSON.stringify(j.opts)}`; if (!seen.has(k)) seen.set(k, j); }
const t = performance.now();
for (const j of seen.values()) { const m = buildJob(j).model; meshModel(m); const h = half(m); meshModel(h); }
console.log("total", (performance.now() - t).toFixed(0), "ms");
await vite.close();
