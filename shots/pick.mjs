import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug");
await new Promise((r) => setTimeout(r, 8000));
const pts = JSON.parse(process.argv[2]);
const out = await p.evaluate(async (pts) => {
  const THREE = await import("/node_modules/.vite/deps/three.js");
  const res = [];
  for (const [x, y] of pts) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), street.rig.camera);
    const scene = street.rig.camera.parent ?? null;
    const root = street.director.bus.group.parent;
    const h = ray.intersectObjects(root.children, true)[0];
    res.push(h ? { x, y, p: h.point.toArray().map((v) => +v.toFixed(1)), mat: h.object.material?.color?.getHexString?.(), type: h.object.geometry.type } : null);
  }
  return res;
}, pts);
console.log(JSON.stringify(out));
await b.close();
