// node shots/_tall.mjs: the tallest things in the city (world bounding boxes of the city's meshes and batch instances)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&theme=day`);
await p.waitForFunction(() => window.street, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 5000));
console.log(await p.evaluate(() => {
  const out = [];
  const scene = street.scene3;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.isBatchedMesh) return;
    o.geometry.computeBoundingBox?.();
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    const c = bb.clone().applyMatrix4(o.matrixWorld);
    if (c.max.y > 60 && c.max.x - c.min.x < 120) out.push([c.max.y, (c.min.x + c.max.x) / 2, (c.min.z + c.max.z) / 2, o.name || o.parent?.name || ""]);
  });
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, 15).map((r) => r[0].toFixed(1) + " @ " + r[1].toFixed(0) + "," + r[2].toFixed(0) + " " + r[3]).join("\n");
}));
await b.close();
