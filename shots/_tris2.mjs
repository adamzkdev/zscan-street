import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug&quality=0");
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 3000));
console.log(await p.evaluate(() => {
  const out = [];
  street.city.group.traverseVisible((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const w = new o.constructor().position; o.getWorldPosition(w);
    if (!g.boundingSphere) g.computeBoundingSphere();
    out.push([n, `${(n / 1e3).toFixed(0)}k at ${w.x.toFixed(0)},${w.z.toFixed(0)} r${g.boundingSphere.radius.toFixed(0)} ${o.material.type}`]);
  });
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, 25).map((x) => x[1]).join("\n");
}));
await b.close();
