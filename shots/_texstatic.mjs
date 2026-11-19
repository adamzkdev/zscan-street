// node shots/_texstatic.mjs [url]: the city's canvas textures, which ones are redrawn over a minute (night and
// day, the map and on foot) and which never are, grouped by size and by the objects that carry them
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 100 });
await new Promise((r) => setTimeout(r, 6000));
const snap = () => p.evaluate(() => {
  const out = new Map();
  window.__texIds ||= new WeakMap();
  let n = 0;
  street.scene3.traverse((o) => {
    for (const m of [].concat(o.material || [])) for (const [slot, v] of Object.entries(m)) if (v && v.isTexture && v.image && v.image.getContext) {
      if (!window.__texIds.has(v)) window.__texIds.set(v, ++window.__texN || (window.__texN = 1));
      const id = window.__texIds.get(v);
      let chain = [];
      for (let x = o; x && chain.length < 4; x = x.parent) chain.push(x.name || x.type);
      const up = !!street.composer.renderer.properties.get(v).__webglTexture;
      if (!out.has(id)) out.set(id, { id, v: v.version, w: v.image.width, h: v.image.height, slot, chain: chain.join("<"), up, rel: v.onUpdate === null && v.image.width === 1 });
    }
  });
  return [...out.values()];
});
const a = await snap();
await p.evaluate(() => street.walk?.(true));
await new Promise((r) => setTimeout(r, 15000));
await p.evaluate(() => street.walk?.(false));
await p.evaluate(() => street.rig?.setMode?.("overview"));
await new Promise((r) => setTimeout(r, 15000));
const z = await snap();
const after = new Map(z.map((t) => [t.id, t]));
const groups = new Map();
let staticBytes = 0, liveBytes = 0;
for (const t of a) {
  const t2 = after.get(t.id);
  const live = !t2 || t2.v !== t.v;
  const bytes = t.w * t.h * 4;
  if (live) liveBytes += bytes; else staticBytes += bytes;
  const k = `${live ? "LIVE" : "static"} ${t2?.up ? "on-gpu" : "not-drawn"} ${t.chain.split("<").slice(0, 2).join("<")}`;
  const g = groups.get(k) || { n: 0, bytes: 0, sizes: new Set() };
  g.n++; g.bytes += bytes; g.sizes.add(`${t.w}x${t.h}`);
  groups.set(k, g);
}
console.log(`static ${Math.round(staticBytes / 1e6)} MB, redrawn ${Math.round(liveBytes / 1e6)} MB, of ${a.length} canvas textures`);
for (const [k, g] of [...groups].sort((x, y) => y[1].bytes - x[1].bytes).slice(0, 25)) console.log(`${(g.bytes / 1e6).toFixed(1).padStart(6)} MB ${String(g.n).padStart(4)}  ${k}  ${[...g.sizes].slice(0, 4).join(" ")}`);
await b.close();
