import { createServer } from "vite";
const v = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await v.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await v.ssrLoadModule("/src/scene/city/build.ts");
const { realLandmark } = await v.ssrLoadModule("/src/scene/real/landmarks.ts");
const { lotRect } = await v.ssrLoadModule("/src/scene/real/lotguard.ts");
const plan = planCity();
for (const kind of process.argv[2].split(",")) {
  const j = (plan.jobs ?? plan).find((j) => j.type === "landmark" && j.opts.kind === kind);
  const b = buildJob(j);
  const L = lotRect(kind, j, b);
  const out = realLandmark(kind, b, { lod: 0 });
  console.log(kind, "lot", JSON.stringify(L), "u", (b.scale ?? 1) * 0.5, "model", b.model.w, b.model.d, "body", JSON.stringify(b.body), "opts", JSON.stringify({ w: j.opts.w, d: j.opts.d }));
  for (const [slot, g] of Object.entries(out.geos)) {
    if (!g) continue;
    let back = -1e9, front = -1e9, left = -1e9, right = -1e9;
    for (let i = 0; i < g.pos.length; i += 3) { back = Math.max(back, L.z0 - g.pos[i + 2]); front = Math.max(front, g.pos[i + 2] - L.z1); left = Math.max(left, L.x0 - g.pos[i]); right = Math.max(right, g.pos[i] - L.x1); }
    if (Math.max(back, front, left, right) > 0.3) console.log("  ", slot, JSON.stringify({ back: +back.toFixed(1), front: +front.toFixed(1), left: +left.toFixed(1), right: +right.toFixed(1) }));
  }
  const ex = out.extras;
  console.log("   trees out", ex.trees.filter((t) => t[2] > L.z1 || t[2] < L.z0 || t[0] < L.x0 || t[0] > L.x1).length, "props out", ex.props.filter((q) => q[3] > L.z1 || q[3] < L.z0 || q[1] < L.x0 || q[1] > L.x1).length);
}
await v.close();
