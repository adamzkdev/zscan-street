// node shots/_geo.mjs [port=3023]: the city's geometry memory by attribute and by top-level group
import puppeteer from "puppeteer-core";
const port = Number(process.argv[2] ?? 3023);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${port}/?debug&theme=night`);
for (let k = 0; k < 60 && !(await p.evaluate(() => !!window.street).catch(() => false)); k++) await wait(1000);
await wait(12000);
console.log(await p.evaluate(() => {
  const scene = street.city.group.parent;
  const seen = new Set();
  const byAttr = {}, byGroup = {}, byName = {};
  let indexed = 0, nonIndexed = 0, vtx = 0;
  const walk = (o, top, path) => o.traverse((x) => {
    const g = x.geometry;
    if (!g?.attributes) return;
    let bytes = 0;
    for (const [k, a] of Object.entries(g.attributes)) {
      const arr = a.array ?? a.data?.array;
      if (!arr || seen.has(arr)) continue;
      seen.add(arr);
      const key = `${k}:${arr.constructor.name}:${a.itemSize}${a.isInstancedBufferAttribute ? ":inst" : ""}`;
      byAttr[key] = (byAttr[key] ?? 0) + arr.byteLength;
      bytes += arr.byteLength;
    }
    if (g.index && !seen.has(g.index.array)) {
      seen.add(g.index.array);
      byAttr[`index:${g.index.array.constructor.name}`] = (byAttr[`index:${g.index.array.constructor.name}`] ?? 0) + g.index.array.byteLength;
      bytes += g.index.array.byteLength;
      indexed++;
    } else if (!g.index) nonIndexed++;
    vtx += g.attributes.position?.count ?? 0;
    byGroup[top] = (byGroup[top] ?? 0) + bytes;
    let n = x;
    let nm = "";
    for (let d = 0; d < 3 && n && !nm; d++, n = n.parent) nm = n.name;
    byName[nm || x.type] = (byName[nm || x.type] ?? 0) + bytes;
  });
  scene.children.forEach((c, i) => walk(c, `${i}:${c.name || c.type}`));
  const MB = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `  ${k}: ${(v / 1048576).toFixed(1)}MB`).join("\n");
  return `vertices ${vtx} indexed ${indexed} non-indexed ${nonIndexed}\nBY ATTRIBUTE\n${MB(byAttr)}\nBY SCENE CHILD\n${MB(byGroup)}\nBY NAME\n${MB(byName)}`;
}));
await b.close();
