// node shots/_modelsum.mjs: a fingerprint of every distinct variant's voxel model (and the palette), to check
// that a change to the builders leaves the city exactly as it was
import { createHash } from "node:crypto";
import { createServer } from "vite";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await vite.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await vite.ssrLoadModule("/src/scene/city/build.ts");
const { palette, half } = await vite.ssrLoadModule("/src/scene/voxel/model.ts");
const { jobs, props } = planCity();
const seen = new Map();
for (const j of jobs) { const k = `${j.type}|${j.seed}|${j.width}|${JSON.stringify(j.opts)}`; if (!seen.has(k)) seen.set(k, j); }
const all = createHash("sha256");
const t = performance.now();
for (const j of seen.values()) {
  const m = buildJob(j).model;
  all.update(`${m.w}x${m.h}x${m.d}`).update(new Uint8Array(m.data.buffer)).update(new Uint8Array(half(m).data.buffer));
}
const ms = performance.now() - t;
all.update(JSON.stringify(palette.entries.map((e) => [e.color.getHexString(), e.kind, e.mat, !!e.soft])));
console.log(`${seen.size} variants, built in ${ms.toFixed(0)} ms, fingerprint ${all.digest("hex").slice(0, 16)}; props ${props.length}`);
await vite.close();
