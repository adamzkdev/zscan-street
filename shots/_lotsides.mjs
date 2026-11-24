// node shots/_lotsides.mjs: each realistic landmark's geometry against its lot, side by side (back, front, left, right, m past
// the lot) for the near and the far build — which builder draws where it should not (vite SSR, no browser)
import { createServer } from "vite";
const v = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await v.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await v.ssrLoadModule("/src/scene/city/build.ts");
const { realLandmark, REAL_LANDMARKS } = await v.ssrLoadModule("/src/scene/real/landmarks.ts");
const { realMark, REAL_MARKS } = await v.ssrLoadModule("/src/scene/real/marks.ts");
const { lotRect } = await v.ssrLoadModule("/src/scene/real/lotguard.ts");
const plan = planCity();
const jobs = (plan.jobs ?? plan).filter((j) => j.type === "landmark");
const only = process.argv[2]?.split(",");
for (const j of jobs) {
  const kind = j.opts.kind;
  if (only && !only.includes(kind)) continue;
  const real = REAL_LANDMARKS.has(kind) ? "lm" : REAL_MARKS.has(kind) ? "mk" : null;
  if (!real) continue;
  const b = buildJob(j);
  const L = lotRect(kind, j, b);
  if (!L) continue;
  const row = { kind };
  for (const lod of [0, 1]) {
    const out = real === "lm" ? realLandmark(kind, b, { lod }) : realMark(kind, b, j, lod);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const g of Object.values(out.geos)) { if (!g) continue; for (let i = 0; i < g.pos.length; i += 3) { x0 = Math.min(x0, g.pos[i]); x1 = Math.max(x1, g.pos[i]); z0 = Math.min(z0, g.pos[i + 2]); z1 = Math.max(z1, g.pos[i + 2]); } }
    row[lod ? "far" : "near"] = { back: +(L.z0 - z0).toFixed(1), front: +(z1 - L.z1).toFixed(1), left: +(L.x0 - x0).toFixed(1), right: +(x1 - L.x1).toFixed(1) };
  }
  console.log(JSON.stringify(row));
}
await v.close();
