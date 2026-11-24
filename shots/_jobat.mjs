import { createServer } from "vite";
const v = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await v.ssrLoadModule("/src/scene/city/plan.ts");
for (const k of ["pyramid", "port", "gardens"]) {
  const j = planCity().jobs.find((j) => j.type === "landmark" && j.opts.kind === k);
  console.log(k, JSON.stringify({ ...j, opts: { kind: j.opts.kind, w: j.opts.w, d: j.opts.d } }));
}
await v.close();
