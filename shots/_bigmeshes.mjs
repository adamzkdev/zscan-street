// node shots/_bigmeshes.mjs [url]: the biggest geometries still held in the page (not the city's voxels), with
// what they hang on, so they can be traced to the code that makes them
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 100 });
await new Promise((r) => setTimeout(r, 6000));
const r = await p.evaluate(() => {
  const seen = new Set(), rows = [];
  street.scene3.traverse((o) => {
    if (!o.isMesh || o.isBatchedMesh || seen.has(o.geometry)) return;
    const g = o.geometry;
    seen.add(g);
    if (g.attributes.normal?.array instanceof Int8Array || (g.attributes.normal && !g.attributes.normal.array?.length && g.attributes.position?.array?.length)) return;
    let bytes = 0;
    const atts = [];
    for (const [k, a] of Object.entries(g.attributes)) if (a.array) { bytes += a.array.byteLength; atts.push(`${k}:${a.array.constructor.name.replace("Array", "")}`); }
    if (g.index?.array) bytes += g.index.array.byteLength;
    let chain = [];
    for (let x = o; x && chain.length < 4; x = x.parent) chain.push(x.name || x.type);
    rows.push({ bytes, type: g.type, verts: g.attributes.position?.count, inst: o.isInstancedMesh ? o.count : 0, mat: [].concat(o.material)[0]?.type, chain: chain.join("<"), atts: atts.join(" "), ud: Object.keys(g.userData).join(",") });
  });
  rows.sort((a, b) => b.bytes - a.bytes);
  return { total: rows.reduce((a, r) => a + r.bytes, 0), n: rows.length, top: rows.slice(0, 25) };
});
console.log(`${r.n} geometries, ${(r.total / 1e6).toFixed(1)} MB`);
for (const x of r.top) console.log(`${(x.bytes / 1e6).toFixed(1).padStart(5)} MB ${x.type} ${x.verts}v${x.inst ? " ×" + x.inst : ""} ${x.mat} ${x.chain} [${x.atts}]`);
await b.close();
