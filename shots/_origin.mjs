import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&theme=day`);
await p.waitForFunction(() => window.street, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 15000));
console.log(await p.evaluate(() => {
  const out = [];
  const S = street.scene3; S.updateMatrixWorld(true);
  const V = S.position.constructor, M = S.matrix.constructor;
  const m = new M();
  const path = (o) => { const n = []; let q = o; while (q && q !== S) { n.push(q.name || q.type); q = q.parent; } return n.join("<"); };
  S.traverse((o) => {
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const s = new V().setFromMatrixScale(m); if (s.x < 0.01) continue; const w = new V().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld); if (Math.hypot(w.x, w.z) < 2.5 && w.y < 2) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; out.push("INST " + path(o) + " n=" + o.count + " #" + i + " size " + [b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z].map((v)=>v.toFixed(2)) + " s=" + s.x.toFixed(2) + " mat=" + (o.material.color?.getHexString?.() ?? "") + " vc=" + o.material.vertexColors + " frustum=" + o.frustumCulled + " gp=" + (o.parent?.parent?.name||"")); break; } }
    } else if (o.isMesh || o.isGroup) {
      const w = new V().setFromMatrixPosition(o.matrixWorld);
      if (false) out.push("MESH " + path(o) + " vis=" + o.visible);
    }
  });
  return out.slice(0, 60).join("\n");
}));
await b.close();
