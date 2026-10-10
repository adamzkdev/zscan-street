// node shots/_citygeo.mjs: the city's CPU-side geometry by kind of object (phone emulation unless DESKTOP=1)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
if (!process.env.DESKTOP) await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
await p.goto(`http://localhost:${process.env.PORT ?? 3008}/?debug`);
await p.waitForFunction(() => window.street, { timeout: 900000 });
await new Promise((r) => setTimeout(r, 6000));
console.log(await p.evaluate(() => {
  const city = street.scene3.children.find((c) => c.children.length > 500);
  const out = {}; const seen = new Set();
  const size = (g) => { let b = 0; for (const a of [...Object.values(g.attributes), g.index]) if (a?.array && !seen.has(a.array)) { seen.add(a.array); b += a.array.byteLength; } return b; };
  city.traverse((o) => {
    if (!o.geometry) return;
    const k = o.isBatchedMesh ? "batch " + o.material.type + " " + o.instanceCount + "inst" : o.isInstancedMesh ? "instanced" : o.isMesh ? "mesh" : o.type;
    out[k] = (out[k] ?? 0) + size(o.geometry);
  });
  return Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => (v / 1e6).toFixed(1) + "MB " + k).join("\n");
}));
await b.close();
