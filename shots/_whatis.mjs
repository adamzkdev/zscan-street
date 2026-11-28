// node shots/_whatis.mjs: in capture mode, a view (pos/look/fov) and what rays through given points of the picture hit first.
// VIEW='{"pos":[..],"look":[..],"fov":50}' PTS='[[u,v],...]' (NDC, −1…1) — prints the meshes' names, materials, hit points.
import puppeteer from "puppeteer-core";
const URL = process.env.URL ?? "http://localhost:3061/?debug&capture&theme=day";
const VIEW = JSON.parse(process.env.VIEW);
const PTS = JSON.parse(process.env.PTS ?? "[[0,0]]");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
await p.goto(URL);
await p.waitForFunction(() => window.__streetUp && window.capture && window.street?.keys?.done, { timeout: 600000, polling: 300 });
await new Promise((r) => setTimeout(r, 3000));
await p.evaluate((v) => { capture.theme("day"); capture.rain(false); capture.shot(v); }, VIEW);
await p.evaluate(async () => { for (let i = 0; i < 10; i++) capture.step(1 / 30); });
const r = await p.evaluate((PTS) => {
  const sc = street.scene3, ray = street.ray;
  let cam = null;
  for (const ps of street.composer.passes) if (ps.camera) { cam = ps.camera; break; }
  cam.updateMatrixWorld();
  return { cam: cam.position.toArray().map((v) => +v.toFixed(1)), pts: PTS.map(([u, v]) => {
    ray.setFromCamera({ x: u, y: v }, cam);
    ray.near = 0; ray.far = 3000;
    const hs = ray.intersectObjects(sc.children, true).filter((h) => { for (let q = h.object; q; q = q.parent) if (!q.visible) return false; return true; }).slice(0, 3);
    return { u, v, hits: hs.map((h) => { const o = h.object; const path = []; for (let q = o; q && path.length < 6; q = q.parent) path.push(q.name || q.type); const m = Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] : o.material; return { d: +h.distance.toFixed(1), at: h.point.toArray().map((v) => +v.toFixed(1)), path: path.join("<"), mat: `${m?.type}:${m?.name ?? ""}:${m?.color?.getHexString?.() ?? ""}:${m?.userData ? Object.keys(m.userData).join("/") : ""}` }; }) };
  }) };
}, PTS);
console.log(JSON.stringify(r.cam));
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, type: "jpeg", quality: 70 });
for (const q of r.pts) console.log(JSON.stringify(q));
await b.close();
