import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.goto(`http://localhost:3007/?debug`);
await p.waitForFunction(() => window.street, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 20000));
console.log(await p.evaluate(() => {
  const S = street.scene3; const out = {};
  S.traverse((o) => {
    const m = o.material; if (!m || Array.isArray(m) || m.type !== "MeshBasicMaterial" || m.toneMapped === false) return;
    const t = m.map; if (!t || !t.isCanvasTexture || !(t.image.height > 256)) return;
    let top = o, chain = []; while (top.parent && top.parent !== S) { chain.push(top.parent.children.length); top = top.parent; }
    const idx = S.children.indexOf(top);
    const k = "scene.children[" + idx + "] " + (top.name || top.type) + " " + t.image.width + "x" + t.image.height + " geo=" + o.geometry.type + (o.geometry.parameters ? JSON.stringify(o.geometry.parameters).slice(0, 40) : "");
    out[k] = (out[k] ?? 0) + 1;
  });
  return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => v + " " + k).join("\n");
}));
await b.close();
