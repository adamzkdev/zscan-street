// node shots/_villacost.mjs: what your villa (scene/keys/villa.ts) costs to draw — its meshes and triangles, and the fps
// from the porch over the court with the villa shown and hidden (GTA mode, day; the GPU is shared: run it twice if noisy).
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { const W = window.WebSocket; const F = function (u, pr) { if (pr === "vite-hmr" || String(u).includes("token=")) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return pr === undefined ? new W(u) : new W(u, pr); }; F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto("http://localhost:3061/?debug&gta=1192&home&theme=day");
await p.waitForFunction(() => window.__streetUp && window.street?.gta?.active && street.interiors.active?.key === "home", { timeout: 600000, polling: 300 });
await p.evaluate(() => street.gta.hud.coach(-1));
await sleep(3000);
await p.evaluate(() => { const w = street.interiors.walk; w.camera.position.set(0, 1.6, -1); const g = street.gta; g.player.place(0, 0, -1, Math.PI); g.player.facing = Math.PI; });
for (let i = 0; i < 4 && (await p.evaluate(() => !!street.interiors.active)); i++) { await p.keyboard.down("KeyE"); await sleep(200); await p.keyboard.up("KeyE"); await sleep(2500); }
await sleep(3000);
const stats = await p.evaluate(() => { let meshes = 0, tris = 0; street.keys.villa.traverse((o) => { if (o.isMesh || o.isInstancedMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.count ?? 1); } }); return { meshes, tris: Math.round(tris) }; });
console.log("villa", JSON.stringify(stats));
const measure = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return { fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1) }; });
console.log("with the villa", JSON.stringify(await measure()), JSON.stringify(await measure()));
await p.evaluate(() => { street.keys.villa.visible = false; });
console.log("villa hidden", JSON.stringify(await measure()), JSON.stringify(await measure()));
await p.evaluate(() => { street.keys.villa.visible = true; });
await b.close();
