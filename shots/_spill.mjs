import { createServer } from "vite";
const v = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await v.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await v.ssrLoadModule("/src/scene/city/build.ts");
const { realLandmark } = await v.ssrLoadModule("/src/scene/real/landmarks.ts");
const { lotRect } = await v.ssrLoadModule("/src/scene/real/lotguard.ts");
const kind = process.argv[2] ?? "port";
const j = planCity().jobs.find((j) => j.type === "landmark" && j.opts.kind === kind);
const b = buildJob(j);
const L = lotRect(kind, j, b);
const out = realLandmark(kind, b, { lod: 0 });
const u = (b.scale ?? 1) / 6, mw = b.model.w, md = b.model.d;
for (const [slot, g] of Object.entries(out.geos)) {
  if (!g) continue;
  // clusters of vertices outside: report boxes in voxel coords
  const outs = [];
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    if (z < L.z0 - 0.3 || z > L.z1 + 0.3 || x < L.x0 - 0.3 || x > L.x1 + 0.3) outs.push([x / u + mw / 2, y / u, z / u + md / 2]);
  }
  if (!outs.length) continue;
  const bb = outs.reduce((a, p) => [Math.min(a[0], p[0]), Math.max(a[1], p[0]), Math.min(a[2], p[1]), Math.max(a[3], p[1]), Math.min(a[4], p[2]), Math.max(a[5], p[2])], [1e9, -1e9, 1e9, -1e9, 1e9, -1e9]);
  console.log(slot, outs.length, "vox x", bb[0].toFixed(0), bb[1].toFixed(0), "y", bb[2].toFixed(0), bb[3].toFixed(0), "z", bb[4].toFixed(0), bb[5].toFixed(0));
}
console.log("lot", JSON.stringify(L), "model", mw, md, "u", u.toFixed(3));
await v.close();
