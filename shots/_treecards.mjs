// node shots/_treecards.mjs [OUT]: the realistic trees' leaf cards (src/scene/real/trees.ts), as PNGs, to look at
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const [OUT = "shots/gta/realstreet/cards"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto("http://localhost:3061/?debug");
await p.waitForFunction(() => window.__streetUp, { timeout: 300000, polling: 300 });
await new Promise((r) => setTimeout(r, 3000));
const urls = await p.evaluate(() => {
  const out = {};
  street.scene3.traverse((o) => {
    if (!o.name?.startsWith("real:trees") || !o.material.map?.image?.toDataURL || o.material.side !== 2) return;
    const k = o.name.split(":")[2];
    if (!out[k]) out[k] = o.material.map.image.toDataURL("image/png");
  });
  return out;
});
fs.mkdirSync(OUT, { recursive: true });
for (const [k, u] of Object.entries(urls)) fs.writeFileSync(`${OUT}/${k}.png`, Buffer.from(u.split(",")[1], "base64"));
console.log(Object.keys(urls));
await b.close();
