// node shots/_canvaswho.mjs: which source files create the canvases behind the city's textures (phone emulation, dev server)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
if (!process.env.DESKTOP) await p.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
await p.evaluateOnNewDocument(() => {
  const ce = document.createElement.bind(document);
  document.createElement = (t, o) => { const e = ce(t, o); if (String(t).toLowerCase() === "canvas") e.__who = (new Error().stack.split("\n").slice(2).find((l) => /\/src\/(scene|interior|game|data)/.test(l) && !/textures\.ts|kit\.ts/.test(l)) ?? new Error().stack.split("\n")[2] ?? "").replace(/^.*\/src\//, "").replace(/\?[^:]*/, "").replace(/:\d+\)?$/, ""); return e; };
});
await p.goto(`http://localhost:${process.env.PORT ?? 3007}/?debug`);
await p.waitForFunction(() => window.street, { timeout: 900000 });
await new Promise((r) => setTimeout(r, 10000));
console.log(await p.evaluate(() => {
  const texs = new Map();
  street.scene3.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const v of [...Object.values(m), ...Object.values(m.uniforms ?? {}).map((u) => u.value)]) if (v?.isTexture) texs.set(v.uuid, v);
  });
  const by = {}; const n = {}; const imgs = new Set();
  for (const t of texs.values()) {
    const im = t.image; if (!(im instanceof HTMLCanvasElement)) continue;
    const k = im.__who || "?";
    const bytes = im.width * im.height * 4 * (t.generateMipmaps !== false && t.minFilter !== 1006 && t.minFilter !== 1003 ? 1.33 : 1);
    by[k] = (by[k] ?? 0) + bytes; n[k] = (n[k] ?? 0) + 1;
    imgs.add(im);
  }
  let cpu = 0; for (const im of imgs) cpu += im.width * im.height * 4;
  return "canvas CPU MB " + Math.round(cpu / 1e6) + " (" + imgs.size + " canvases)\n" + Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => (v / 1e6).toFixed(1) + "MB x" + n[k] + " " + k).join("\n");
}));
await b.close();
