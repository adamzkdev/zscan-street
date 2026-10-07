// node shots/_forest-perf.mjs <port> — overview fps and triangles with/without the forest
import puppeteer from "puppeteer-core";
const port = process.argv[2] || "3013";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("console", (m) => m.text().startsWith("forest") && console.log(m.text()));
await p.goto(`http://localhost:${port}/?debug&theme=day&quality=0`);
await p.waitForFunction(() => window.street, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 6000));
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / 3)); }; requestAnimationFrame(f); }));
const tris = () => p.evaluate(() => { const i = street.renderer.info; return `${(i.render.triangles / 1e6).toFixed(2)}M tris ${i.render.calls} calls`; });
for (const mode of ["overview", "bay"]) {
  await p.evaluate((m) => { street.rig.setMode(m === "overview" ? "overview" : "free"); if (m === "bay") street.rig.flyTo(new street.rig.focus.constructor(185, 1, 212), 0.6); }, mode);
  await new Promise((r) => setTimeout(r, 3500));
  for (const vis of [true, false]) {
    await p.evaluate((v) => (street.forest.group.visible = v), vis);
    await new Promise((r) => setTimeout(r, 800));
    console.log(mode, "forest", vis, "fps", await fps(), await tris());
  }
  await p.evaluate(() => (street.forest.group.visible = true));
}
await b.close();
