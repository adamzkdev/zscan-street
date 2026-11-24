// node shots/_closurecheck.mjs: every realistic building of the plan built (near and far) and shot at from outside on its
// four sides and from above (front faces only): a ray that gets through to the other side is an open wall or roof
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal"], defaultViewport: { width: 400, height: 300 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/reallm.html?kind=noir");
await new Promise((r) => setTimeout(r, 3000));
const res = await p.evaluate(async (LODS) => {
  const THREE = await import("/node_modules/.vite/deps/three.js").catch(() => import("three"));
  const plan = await import("/src/scene/city/plan.ts");
  const build = await import("/src/scene/city/build.ts");
  const rb = await import("/src/scene/real/buildings.ts");
  const lm = await import("/src/scene/real/landmarks.ts");
  const VOX = (await import("/src/scene/voxel/model.ts")).VOX;
  const { jobs } = plan.planCity();
  const out = { n: 0, open: [], byType: {} };
  const ray = new THREE.Raycaster();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  for (const j of jobs) {
    const real = rb.REAL_TYPES.has(j.type);
    const heart = lm.REAL_HEART?.has(j.type);
    if (!real && !heart) continue;
    let bb;
    try {
      bb = build.buildJob(j);
    } catch {
      continue;
    }
    for (const lod of LODS) {
      let geos;
      try {
        geos = real ? rb.realBuilding(j, bb, { lod }) : lm.realLandmark(`h:${j.type}`, Object.assign(bb, { kind: j.opts.kind }), { lod: Math.min(1, lod) }).geos;
      } catch (e) {
        out.open.push(`${j.type}#${j.id} lod${lod}: build failed ${e.message}`);
        continue;
      }
      const g = new THREE.Group();
      for (const v of Object.values(geos)) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(v.pos, 3));
        geo.setIndex(Array.from(v.idx));
        g.add(new THREE.Mesh(geo, mat));
      }
      g.updateMatrixWorld(true);
      const m = bb.model;
      const [bx0, , bx1, bD] = bb.body ?? [0, 0, m.w, m.d];
      const X0 = (bx0 - m.w / 2) * VOX,
        X1 = (bx1 - m.w / 2) * VOX,
        Z0 = (0 - m.d / 2) * VOX,
        Z1 = (bD - m.d / 2) * VOX;
      const H = (m.h - 26) * VOX;
      if (lod === LODS[0]) out.n++;
      const miss = [];
      const sides = [
        ["front", [0, 0, -1], (u, v) => [X0 + (X1 - X0) * u, H * v, Z1 + 1]],
        ["back", [0, 0, 1], (u, v) => [X0 + (X1 - X0) * u, H * v, Z0 - 1]],
        ["right", [-1, 0, 0], (u, v) => [X1 + 1, H * v, Z0 + (Z1 - Z0) * u]],
        ["left", [1, 0, 0], (u, v) => [X0 - 1, H * v, Z0 + (Z1 - Z0) * u]],
      ];
      for (const [name, dir, at] of sides) {
        let bad = 0,
          tot = 0;
        for (const u of [0.2, 0.5, 0.8])
          for (const v of [0.3, 0.6, 0.85]) {
            tot++;
            ray.set(new THREE.Vector3(...at(u, v)), new THREE.Vector3(...dir));
            ray.far = name === "front" || name === "back" ? Z1 - Z0 + 1.5 : X1 - X0 + 1.5;
            if (!ray.intersectObject(g, true).length) bad++;
          }
        if (bad >= 3) miss.push(`${name} ${bad}/${tot}`);
      }
      // the roof
      let rbad = 0;
      for (const u of [0.25, 0.5, 0.75])
        for (const w of [0.25, 0.5, 0.75]) {
          ray.set(new THREE.Vector3(X0 + (X1 - X0) * u, H + 40, Z0 + (Z1 - Z0) * w), new THREE.Vector3(0, -1, 0));
          ray.far = H + 40 - 0.5;
          const h = ray.intersectObject(g, true)[0];
          if (!h || h.point.y < H * 0.5) rbad++;
        }
      if (rbad >= 3) miss.push(`roof ${rbad}/9`);
      if (miss.length) {
        out.open.push(`${j.type}#${j.id} lod${lod} ${JSON.stringify(j.opts).slice(0, 60)}: ${miss.join(", ")}`);
        out.byType[j.type] = (out.byType[j.type] ?? 0) + 1;
      }
    }
  }
  return out;
}, (process.env.LODS ?? "0,2").split(",").map(Number));
console.log("buildings", res.n, "open:", res.open.length, JSON.stringify(res.byType));
for (const l of res.open.slice(0, 60)) console.log(" ", l);
await b.close();
