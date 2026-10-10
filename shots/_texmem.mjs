// texture memory in the scene, by owner (estimated from image sizes, with mipmaps)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
await p.goto(`http://localhost:3007/?debug`);
await p.waitForFunction(() => window.street, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 25000));
console.log(await p.evaluate(() => {
  const S = street.scene3; const seen = new Set(); const by = {}; let total = 0, n = 0; const big = [];
  const owner = (o) => { const n = []; let q = o; while (q && q !== S) { if (q.name) n.push(q.name); q = q.parent; } return n.reverse().slice(0, 2).join(">") || "(unnamed)"; };
  S.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const [key, v] of Object.entries(m)) {
      if (!v || !v.isTexture || seen.has(v)) continue; seen.add(v);
      const im = v.image; const w = im?.width ?? 0, h = im?.height ?? 0;
      const bytes = w * h * 4 * (v.generateMipmaps === false ? 1 : 1.33) * (v.isDataTexture && v.type !== 1009 ? 2 : 1);
      const k = (v.isCanvasTexture ? "canvas " : v.isDataTexture ? "data " : "tex ") + (h <= 64 ? "h<=64" : h <= 128 ? "h<=128" : h <= 256 ? "h<=256" : "h>256") + " w" + (w <= 256 ? "<=256" : w <= 1024 ? "<=1024" : ">1024") + " " + o.type + " mat=" + m.type + (m.toneMapped === false ? " glow" : "");
      by[k] = by[k] ?? { n: 0, b: 0 }; by[k].n++; by[k].b += bytes; total += bytes; n++;
      big.push([bytes, w + "x" + h + " " + k]);
    }
  });
  big.sort((a, b) => b[0] - a[0]);
  return "textures " + n + " total " + Math.round(total / 1e6) + " MB\n" + Object.entries(by).sort((a, b) => b[1].b - a[1].b).slice(0, 20).map(([k, v]) => Math.round(v.b / 1e6) + "MB  x" + v.n + "  " + k).join("\n") + "\nBIGGEST\n" + big.slice(0, 12).map((r) => Math.round(r[0] / 1e6) + "MB " + r[1]).join("\n");
}));
await b.close();
