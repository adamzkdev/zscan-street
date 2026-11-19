// node shots/_meshbench.mjs [filter]: the city workers' work in Node, per stage (the builders' voxel models,
// the mesher, the half-resolution copies), summed over every distinct variant, the slowest listed
import { createServer } from "vite";
const filter = process.argv[2] ?? "";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await vite.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await vite.ssrLoadModule("/src/scene/city/build.ts");
const { meshModel } = await vite.ssrLoadModule("/src/scene/voxel/mesher.ts");
const { half } = await vite.ssrLoadModule("/src/scene/voxel/model.ts");
const { jobs } = planCity();
const seen = new Map();
for (const j of jobs) {
  const k = `${j.type}|${j.seed}|${j.width}|${JSON.stringify(j.opts)}`;
  if (!seen.has(k)) seen.set(k, j);
}
const list = [...seen.values()].filter((j) => !filter || JSON.stringify(j).includes(filter));
const tot = { build: 0, mesh: 0, half: 0, slice: 0 };
const rows = [];
const now = () => performance.now();
for (const j of list) {
  let t = now();
  const b = buildJob(j);
  const tb = now() - t;
  const m = b.model;
  t = now();
  meshModel(m);
  const tm = now() - t;
  t = now();
  const h = half(m);
  meshModel(h);
  if (j.ext || j.type !== "landmark") meshModel(half(h));
  const th = now() - t;
  let ts = 0;
  if (j.type !== "landmark" && !j.ext) {
    t = now();
    meshModel(m.slice(16));
    ts = now() - t;
  }
  tot.build += tb;
  tot.mesh += tm;
  tot.half += th;
  tot.slice += ts;
  rows.push([tb + tm + th + ts, `${j.type}${j.opts?.kind ? ":" + j.opts.kind : ""}`, tb, tm, th, `${m.w}x${m.h}x${m.d}`]);
}
rows.sort((a, b) => b[0] - a[0]);
for (const r of rows.slice(0, 15)) console.log(`${r[1].padEnd(22)} total ${r[0].toFixed(0).padStart(5)}  build ${r[2].toFixed(0).padStart(5)}  mesh ${r[3].toFixed(0).padStart(5)}  half ${r[4].toFixed(0).padStart(5)}  ${r[5]}`);
console.log(`variants ${list.length}: build ${tot.build.toFixed(0)} ms, mesh ${tot.mesh.toFixed(0)} ms, half meshes ${tot.half.toFixed(0)} ms, walls-down cut ${tot.slice.toFixed(0)} ms`);
await vite.close();
