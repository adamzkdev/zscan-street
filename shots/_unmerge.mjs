// node shots/_unmerge.mjs: the draw-saver merges the heart's walk-in buildings (their own materials); walls down takes one out of its batch before clipping it (src/scene/thrift.ts unmerge)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3061/?debug&theme=day");
await p.waitForFunction(() => window.__streetUp, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 65000));
console.log(await p.evaluate(() => {
  const occ = street.city.occluders.filter((o) => !o.fixed);
  const merged = (o) => { let n = 0, all = 0; o.full.traverse((m) => { if (m.isMesh) { all++; if (m.layers.mask !== 1) n++; } }); return [n, all]; };
  const withMerged = occ.filter((o) => merged(o)[0] > 0);
  const o = withMerged[0];
  if (!o) return `occluders ${occ.length}, none merged`;
  const before = merged(o);
  street.thrift.unmerge(o.full);
  const after = merged(o);
  return `occluders ${occ.length}, with merged meshes ${withMerged.length}; one: merged ${before[0]}/${before[1]} → after unmerge ${after[0]}/${after[1]}; kept ${street.thrift.kept.length}`;
}));
console.log("errors", errs.length, errs.slice(0, 3).join("\n"));
await b.close();
