import puppeteer from "puppeteer-core";
const [px, py] = process.argv.slice(2).map(Number);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 150000 });
for (let k = 0; k < 150; k++) await p.evaluate(() => capture.step(1 / 30));
await p.evaluate(() => { capture.shot({ pos: [12, 14, 14], look: [0, 0, 0], fov: 45 }); for (let k = 0; k < 5; k++) capture.step(1 / 30); });
await p.screenshot({ path: "shots/rayid.png" });
console.log(await p.evaluate(([px, py]) => {
  const S = street.scene3;
  let cam = null; S.traverse(() => {});
  cam = street.finish.camera;
  const R = new (S.position.constructor)();
  const ndc = { x: (px / 1400) * 2 - 1, y: -(py / 860) * 2 + 1 };
  const out = [];
  // a fresh raycaster that ignores overridden raycast functions
  const THREEish = S.constructor;
  const ray = new (street.ray.constructor)();
  ray.setFromCamera(ndc, cam);
  const list = [];
  S.traverse((o) => { if ((o.isMesh) && o.visible) { const proto = Object.getPrototypeOf(o); if (o.raycast !== proto.raycast) o.raycast = proto.raycast; list.push(o); } });
  const hits = ray.intersectObjects(list, false).slice(0, 5);
  const path = (o) => { const n = []; let q = o; while (q && q !== S) { n.push((q.name || q.type) + (q.userData?.kind ? ":" + q.userData.kind : "")); q = q.parent; } return n.join("<"); };
  return hits.map((h) => `${h.distance.toFixed(1)} ${path(h.object)} inst=${h.instanceId ?? ""} at ${h.point.toArray().map((v) => v.toFixed(2))}`).join("\n");
}, [px, py]));
await b.close();
