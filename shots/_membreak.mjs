import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const p = await b.newPage();
await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
await p.goto(`http://localhost:${process.env.PORT ?? 3008}/?debug`);
await p.waitForFunction(() => window.street, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 10000));
console.log(await p.evaluate(() => {
  const arrs = new Set(); let geo = 0; const byTop = {};
  const texs = new Map();
  const roots = [street.scene3, ...Object.values(street).filter((v) => v && v.isScene && v !== street.scene3)];
  for (const r of roots) r.traverse((o) => {
    const g = o.geometry;
    let top = o; while (top.parent && top.parent.parent) top = top.parent;
    const k = top.name || top.type;
    if (g) for (const a of [...Object.values(g.attributes), g.index]) { if (!a || !a.array || arrs.has(a.array)) continue; arrs.add(a.array); geo += a.array.byteLength; byTop[k] = (byTop[k] ?? 0) + a.array.byteLength; }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const v of Object.values(m)) if (v && v.isTexture) texs.set(v.uuid, v);
    for (const m of ms) if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) texs.set(u.value.uuid, u.value);
  });
  let canv = 0, canvN = 0, img = 0, data = 0; const bigs = [];
  for (const t of texs.values()) {
    const im = t.image; if (!im) continue;
    const w = im.width ?? 0, h = im.height ?? 0; const bytes = w * h * 4 * (t.generateMipmaps ? 1.33 : 1);
    if (im instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && im instanceof OffscreenCanvas)) { canv += bytes; canvN++; bigs.push([bytes, 'canvas ' + w + 'x' + h + ' ' + (t.name || '')]); }
    else if (im.data) { data += im.data.byteLength; bigs.push([im.data.byteLength, 'data ' + w + 'x' + h]); }
    else { img += bytes; bigs.push([bytes, 'img ' + w + 'x' + h + ' ' + (im.src || '').slice(-40)]); }
  }
  bigs.sort((a, b) => b[0] - a[0]);
  return JSON.stringify({ geoMB: Math.round(geo / 1e6), byTop: Object.fromEntries(Object.entries(byTop).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, Math.round(v / 1e6)])), texN: texs.size, canvMB: Math.round(canv / 1e6), canvN, imgMB: Math.round(img / 1e6), dataMB: Math.round(data / 1e6), big: bigs.slice(0, 25).map((x) => Math.round(x[0] / 1e5) / 10 + 'MB ' + x[1]) }, null, 1);
}));
await b.close();
