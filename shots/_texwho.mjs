// node shots/_texwho.mjs [url]: samples of the city's big canvas textures: what they hang on, and a thumbnail
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const [URL = "http://localhost:3021/?debug", OUT = "."] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.street, { timeout: 240000, polling: 100 });
await new Promise((r) => setTimeout(r, 6000));
const r = await p.evaluate(() => {
  const seen = new Set(), rows = [];
  street.scene3.traverse((o) => {
    for (const m of [].concat(o.material || [])) for (const [slot, v] of Object.entries(m)) if (v && v.isTexture && v.image?.getContext && v.image.width > 200 && !seen.has(v)) {
      seen.add(v);
      rows.push({ size: `${v.image.width}x${v.image.height}`, slot, mat: m.type, geo: o.geometry?.type, name: o.name, parent: o.parent?.name || o.parent?.type, gp: o.parent?.parent?.name || o.parent?.parent?.type, ud: Object.keys(m.userData).join(","), img: v.image.toDataURL("image/png").slice(0, 60000) });
    }
  });
  return rows;
});
const by = {};
for (const x of r) { const k = `${x.mat} ${x.geo} ${x.slot} ud[${x.ud}] p=${x.parent} gp=${x.gp}`; (by[k] ||= []).push(x); }
for (const [k, l] of Object.entries(by).sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
  console.log(l.length, k, l.slice(0, 3).map((x) => x.size).join(" "));
  writeFileSync(`${OUT}/tex-${l[0].mat}-${l.length}.png`, Buffer.from(l[0].img.split(",")[1], "base64"));
}
await b.close();
