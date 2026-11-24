// node shots/_spillwho.mjs <kind>: which lines of a realistic landmark's builder draw past its lot (instruments the Kit's vertices)
import { createServer } from "vite";
const v = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { planCity } = await v.ssrLoadModule("/src/scene/city/plan.ts");
const { buildJob } = await v.ssrLoadModule("/src/scene/city/build.ts");
const { Kit } = await v.ssrLoadModule("/src/scene/real/lmkit.ts");
const { realLandmark } = await v.ssrLoadModule("/src/scene/real/landmarks.ts");
const { lotRect } = await v.ssrLoadModule("/src/scene/real/lotguard.ts");
const kind = process.argv[2] ?? "port";
const j = planCity().jobs.find((j) => j.type === "landmark" && j.opts.kind === kind);
const b = buildJob(j);
const L = lotRect(kind, j, b);
const who = new Map();
const orig = Kit.prototype.vert;
Kit.prototype.vert = function (B, p, n, t, c) {
  const out = Math.max(L.z0 - p[2], p[2] - L.z1, L.x0 - p[0], p[0] - L.x1);
  if (out > 0.3) {
    const st = new Error().stack.split("\n").find((l) => l.includes("landmarks.ts") && !l.includes("signBacks"));
    const k = (st ?? "?").replace(/.*landmarks\.ts:/, "").replace(/\)$/, "");
    const side = L.z0 - p[2] === out ? "back" : p[2] - L.z1 === out ? "front" : L.x0 - p[0] === out ? "left" : "right";
    const w = who.get(k + " " + side) ?? 0;
    who.set(k + " " + side, Math.max(w, out));
  }
  return orig.call(this, B, p, n, t, c);
};
realLandmark(kind, b, { lod: 0 });
for (const [k, o] of [...who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(o.toFixed(1).padStart(5), k);
console.log("lot", JSON.stringify(L));
await v.close();
