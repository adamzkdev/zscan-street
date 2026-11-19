// node shots/_mem.mjs [url]: where the city's memory goes once it is up: the JS heap, the geometry arrays
// still held in JS (by kind of object), the textures' canvases and images, the browser's own measure
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
p.on("console", (m) => m.text().startsWith("tex ") && console.log(m.text()));
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 100 });
await new Promise((r) => setTimeout(r, 12000));
const r = await p.evaluate(() => {
  const seen = new Set();
  const by = {};
  let tex = 0;
  const texSeen = new Set();
  const add = (k, n) => (by[k] = (by[k] || 0) + n);
  const geo = (g, kind) => {
    if (!g || seen.has(g)) return;
    seen.add(g);
    for (const a of Object.values(g.attributes)) if (a.array) add(kind, a.array.byteLength);
    if (g.index?.array) add(kind, g.index.array.byteLength);
  };
  street.scene3.traverse((o) => {
    const kind = o.isBatchedMesh ? "batched" : o.isInstancedMesh ? "instanced" : o.isMesh ? "mesh" : o.isPoints ? "points" : o.isLine || o.isLineSegments ? "line" : null;
    if (kind === "mesh") {
      const nor = o.geometry.attributes.normal?.array;
      const vox = nor instanceof Int8Array || (o.geometry.attributes.normal && !nor);
      geo(o.geometry, vox ? (o.visible && o.parent?.visible ? "voxel-shown" : "voxel-hidden") : "other-mesh");
    } else if (kind) geo(o.geometry, kind);
    if (o.isInstancedMesh) add("instanceMatrix", o.instanceMatrix.array.byteLength);
    for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v && v.isTexture && !texSeen.has(v)) {
      texSeen.add(v);
      const img = v.image;
      if (img && img.width) { tex += img.width * img.height * 4; (window.__texList ||= []).push([img.width * img.height * 4, `${img.constructor.name} ${img.width}x${img.height} ${v.name || ""} ${o.name || o.type}`]); }
      else if (img?.data) tex += img.data.byteLength;
    }
  });
  const ri = street.renderer?.info.memory;
  const top = (window.__texList || []).sort((a, b) => b[0] - a[0]);
  const byKind = {};
  for (const [n, d] of top) { const k = d.split(" ")[0]; byKind[k] = (byKind[k] || 0) + n; }
  console.log("tex", JSON.stringify(Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round(v / 1e6)]))), top.length, "textures; biggest", top.slice(0, 12).map((t) => `${Math.round(t[0] / 1e6)}MB ${t[1]}`).join(" | "));
  return { heap: Math.round(performance.memory.usedJSHeapSize / 1e6), byMB: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1e6)])), texMB: Math.round(tex / 1e6), gpu: ri };
});
console.log(JSON.stringify(r));
{
  const cdp = await p.createCDPSession();
  const u = await cdp.send("Runtime.getHeapUsage");
  console.log(`heap usage: used ${Math.round(u.usedSize / 1e6)} MB, total ${Math.round(u.totalSize / 1e6)} MB, array buffers ${Math.round((u.backingStorageSize ?? 0) / 1e6)} MB, embedder ${Math.round((u.embedderHeapUsedSize ?? 0) / 1e6)} MB`);
}
const m = await p.metrics();
console.log("JSHeapUsed", Math.round(m.JSHeapUsedSize / 1e6), "MB");
// the browser's processes
// the browser's processes, resident memory (the page's renderer, the GPU process)
const { execSync } = await import("node:child_process");
const all = execSync("ps -axo pid=,ppid=,rss=,command=").toString().trim().split("\n").map((l) => l.trim().split(/\s+/)).map(([pid, ppid, rss, ...c]) => ({ pid: +pid, ppid: +ppid, rss: +rss, cmd: c.join(" ") }));
const root = b.process().pid;
const mine = all.filter((x) => x.ppid === root);
// Activity Monitor's "Memory" (the footprint, compressed and GPU-mapped pages included; RSS misses them)
let total = 0;
const parts = [];
for (const x of mine) {
  let fp = 0;
  try {
    const out = execSync(`footprint ${x.pid} 2>/dev/null`).toString();
    const m = out.match(/Footprint:\s*([\d.]+)\s*(KB|MB|GB)/);
    if (m) fp = +m[1] * { KB: 1 / 1024, MB: 1, GB: 1024 }[m[2]];
  } catch {}
  total += fp;
  if (fp > 60) parts.push(`${(x.cmd.match(/--type=([a-z-]+)/) || [, "browser"])[1]} ${Math.round(fp)} MB`);
}
console.log(`footprint ${Math.round(total)} MB: ${parts.join(", ")}`);
await b.close();
