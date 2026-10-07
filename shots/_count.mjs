import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1600, height: 1000 } });
const p = await b.newPage();
p.on("console", (m) => { const t = m.text(); if (t.includes("built")) console.log(t); });
await p.goto("http://localhost:3007/?debug&quality=0");
await p.waitForFunction(() => window.street, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
console.log(await p.evaluate(() => {
  const by = {};
  let n = 0;
  street.city.group.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
    n++;
    const k = (o.isInstancedMesh ? "inst:" : "") + (o.material?.type ?? "?") + (o.material?.map ? "+map" : "") + " " + (o.parent?.name || o.parent?.type);
    by[k] = (by[k] || 0) + 1;
  });
  return n + "\n" + Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25).map((e) => e[1] + "  " + e[0]).join("\n");
}));
await b.close();
