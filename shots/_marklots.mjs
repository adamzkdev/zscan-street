import { createServer } from "vite";
const v = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await v.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await v.ssrLoadModule("/src/scene/city/build.ts");
const { realMark } = await v.ssrLoadModule("/src/scene/real/marks.ts");
const { lotRect } = await v.ssrLoadModule("/src/scene/real/lotguard.ts");
const plan = planCity();
const j = (plan.jobs ?? plan).find((j) => j.type === "landmark" && j.opts.kind === (process.argv[2] ?? "needle"));
const b = buildJob(j);
const L = lotRect(j.opts.kind, j, b);
console.log("lot", JSON.stringify(L));
const out = realMark(j.opts.kind, b, j, 0);
for (const [slot, g] of Object.entries(out.geos)) {
  if (!g) continue;
  let back = -1e9, front = -1e9, left = -1e9, right = -1e9, yb = 0, yl = 0;
  for (let i = 0; i < g.pos.length; i += 3) {
    if (L.z0 - g.pos[i + 2] > back) (back = L.z0 - g.pos[i + 2]), (yb = g.pos[i + 1]);
    front = Math.max(front, g.pos[i + 2] - L.z1);
    if (L.x0 - g.pos[i] > left) (left = L.x0 - g.pos[i]), (yl = g.pos[i + 1]);
    right = Math.max(right, g.pos[i] - L.x1);
  }
  if (Math.max(back, front, left, right) > 0.2) console.log("  ", slot, JSON.stringify({ back: +back.toFixed(1), yb: +yb.toFixed(1), front: +front.toFixed(1), left: +left.toFixed(1), yl: +yl.toFixed(1), right: +right.toFixed(1) }));
}
await v.close();
