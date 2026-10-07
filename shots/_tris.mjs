import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
await p.goto("http://localhost:3007/?debug&quality=0");
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate(() => street.rig.setMode("overview"));
await new Promise((r) => setTimeout(r, 3000));
console.log(await p.evaluate(() => {
  const by = {};
  const scene = street.city.group.parent;
  const add = (k, tris, calls) => { by[k] = by[k] || [0, 0]; by[k][0] += tris; by[k][1] += calls; };
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const inst = o.isInstancedMesh ? o.count : 1;
    if (o.isInstancedMesh && !o.count) return;
    let top = o; while (top.parent && top.parent !== scene) top = top.parent;
    let k = (o.isInstancedMesh ? "instanced" : "mesh") + "[" + (top === street.city.group ? "city" : scene.children.indexOf(top) + ":" + top.type + ":" + top.children.length) + "]";
    let q = o; let depth = 0;
    while (q && q !== scene && depth < 6) { if (q.parent === street.city.group) { k += q.isGroup ? ":cityGroup" : ":cityMesh"; break; } q = q.parent; depth++; }
    if (!k.includes("city")) k += ":" + (o.parent?.type ?? "") + (o.material?.type ?? "");
    add(k + (o.material?.map ? "+map" : ""), n * inst, 1);
  });
  return Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).map(([k, [t, c]]) => `${(t / 1e3).toFixed(0)}k tris ${c} calls  ${k}`).join("\n");
}));
await b.close();
