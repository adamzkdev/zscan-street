// what holds the textures/geometries that appear after boot (scene diff over 90 s) and how many are still in the scene
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
await p.goto(`http://localhost:3007/?debug`);
await p.waitForFunction(() => window.street, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 30000));
const snap = () => p.evaluate(() => {
  const S = street.scene3; const tex = {}, geo = {};
  const path = (o) => { const n = []; let q = o; for (let k = 0; q && q !== S && k < 4; k++) { n.push(q.name || q.type); q = q.parent; } return n.reverse().join(">"); };
  S.traverse((o) => {
    const k = path(o);
    if (o.geometry) geo[o.geometry.uuid] = k;
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const v of Object.values(m)) if (v && v.isTexture) tex[v.uuid] = k;
  });
  const i = street.renderer.info.memory;
  return { tex, geo, gpu: [i.textures, i.geometries] };
});
const a = await snap();
await new Promise((r) => setTimeout(r, 90000));
const z = await snap();
const diff = (A, B) => { const c = {}; for (const [u, k] of Object.entries(B)) if (!(u in A)) c[k] = (c[k] ?? 0) + 1; return Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => v + " " + k).join("\n"); };
console.log("GPU tex/geo before", a.gpu, "after", z.gpu);
console.log("in scene: tex", Object.keys(a.tex).length, "->", Object.keys(z.tex).length, " geo", Object.keys(a.geo).length, "->", Object.keys(z.geo).length);
console.log("NEW TEXTURES\n" + diff(a.tex, z.tex));
console.log("NEW GEOMETRIES\n" + diff(a.geo, z.geo));
await b.close();
