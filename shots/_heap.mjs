// node shots/_heap.mjs [port=3023] [all]
// Where the JS heap goes: geometry arrays, canvases/images behind textures, per scene
// (the city, then every walk-in place with "all").
import puppeteer from "puppeteer-core";
const port = Number(process.argv[2] ?? 3023);
const ALL = process.argv.includes("all");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const cdp = await p.target().createCDPSession();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
for (let k = 0; k < 60 && !(await p.evaluate(() => !!window.street).catch(() => false)); k++) await wait(1000);
await wait(12000);
async function report(label) {
  await cdp.send("HeapProfiler.collectGarbage");
  const u = await cdp.send("Runtime.getHeapUsage");
  const r = await p.evaluate(() => {
    const seenA = new Set(), seenT = new Set();
    const out = {};
    const scan = (name, root) => {
      let geo = 0, tex = 0, n = 0;
      root.traverse((o) => {
        const g = o.geometry;
        if (g?.attributes) {
          for (const a of [...Object.values(g.attributes), g.index].filter(Boolean)) {
            const arr = a.array ?? a.data?.array;
            if (arr && !seenA.has(arr)) (seenA.add(arr), (geo += arr.byteLength));
          }
          n++;
        }
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms)
          for (const v of Object.values(m)) {
            if (v?.isTexture && !seenT.has(v)) {
              seenT.add(v);
              const im = v.image;
              if (im?.data?.byteLength) tex += im.data.byteLength;
              else if (im?.width) tex += im.width * im.height * 4;
            }
          }
      });
      out[name] = { geoMB: +(geo / 1048576).toFixed(1), texCpuMB: +(tex / 1048576).toFixed(1), meshes: n };
    };
    scan("city", street.city.group.parent);
    const cache = street.interiors.cache;
    for (const [k, i] of cache) scan(k, i.scene);
    return out;
  });
  console.log(`== ${label}: used ${Math.round(u.usedSize / 1048576)}MB embedder ${Math.round((u.embedderHeapUsedSize ?? 0) / 1048576)}MB backing ${Math.round((u.backingStorageSize ?? 0) / 1048576)}MB`);
  let g = 0, t = 0;
  for (const [k, v] of Object.entries(r)) {
    g += v.geoMB;
    t += v.texCpuMB;
    console.log(`  ${k.padEnd(16)} geo ${v.geoMB}MB tex(cpu) ${v.texCpuMB}MB meshes ${v.meshes}`);
  }
  console.log(`  total geometry arrays ${g.toFixed(0)}MB, texture sources ${t.toFixed(0)}MB`);
}
await report("city");
if (ALL) {
  const keys = await p.evaluate(() => Object.keys(street.interiors.build));
  for (const k of keys) {
    await p.evaluate((k) => street.interiors.enter(k, 0), k).catch((e) => console.log(k, e.message));
    await wait(1500);
    await p.evaluate(() => street.interiors.exit());
  }
  await wait(2000);
  await report("after every place");
}
await b.close();
