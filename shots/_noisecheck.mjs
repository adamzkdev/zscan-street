// node shots/_noisecheck.mjs: the textures' noise blended into the pixels (scene/textures.ts) against the fillRect per cell it replaced: same pixels
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage();
const out = await p.evaluate(() => {
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; };
  const old = (ctx, w, h, amount, r, cell) => { for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) { const v = (r() - 0.5) * amount; ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; ctx.fillRect(x, y, cell, cell); } };
  const neu = (ctx, w, h, amount, r, cell) => { const img = ctx.getImageData(0, 0, w, h); const px = img.data;
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) { const v = (r() - 0.5) * amount; const a = Math.round(Math.abs(v) * 255) / 255; const add = v > 0 ? 255 * a : 0;
      for (let yy = y; yy < Math.min(y + cell, h); yy++) for (let xx = x, o = (yy * w + x) * 4; xx < Math.min(x + cell, w); xx++, o += 4) { px[o] = Math.round(px[o] * (1 - a) + add); px[o + 1] = Math.round(px[o + 1] * (1 - a) + add); px[o + 2] = Math.round(px[o + 2] * (1 - a) + add); } }
    ctx.putImageData(img, 0, 0); };
  const res = [];
  for (const [base, amt, cell, W, H] of [["#2a2833", 0.12, 4, 320, 96], ["#d0cec8", 0.1, 2, 256, 256], ["#3a3646", 0.14, 2, 128, 128], ["#8e8da6", 0.04, 4, 320, 96]]) {
    const run = (f) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.fillStyle = base; x.fillRect(0, 0, W, H); let t = performance.now(); f(x, W, H, amt, rng(9), cell); t = performance.now() - t; return [x.getImageData(0, 0, W, H).data, t]; };
    const [a, ta] = run(old), [n, tn] = run(neu);
    let max = 0, diff = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - n[i]); if (d) diff++; max = Math.max(max, d); }
    res.push(`${base} cell ${cell}: max diff ${max}, ${diff} channels differ of ${a.length}; old ${ta.toFixed(1)} ms new ${tn.toFixed(1)} ms`);
  }
  return res.join("\n");
});
console.log(out);
await b.close();
